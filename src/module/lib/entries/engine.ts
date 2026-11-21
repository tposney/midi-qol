import { MODULE_ID } from "../../../midi-qol.js";
import { Registry } from "../../api/registry.js";
import type { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import { createConditionData, evalCondition, expireEffects, hasUsedReaction, setReactionUsed } from "../../utils.js";
import { getDistance } from "../../services/distance/service.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { limitKey, limitStamp, selectGroups, spendStoredLimit, withinLimit, type CombatPosition, type StoredLimit } from "./limits.js";
import type { Entry, EntryAction, EntryHome, EntryWho, FoundEntry } from "./types.js";
import { addEconomy, entryConditionExtras } from "./conditionData.js";
import { askEntryChoice, type ChoiceDeclaration } from "../choices.js";
import { askOffers, costAllows, editToggles, listToggles, offerOption, payEntryConsumption, setToggle, spendEntryCost, toggleOn } from "./offers.js";

/*
 * M15 stage 1: the entry engine (plan ~/Documents/midi-next-M15-plan-2026-11-20.md). A event is raised with the actor
 * it is about; the engine collects the entries for it by `who` from their homes (the use's activity and item, the
 * actor's items, its applied effects), keeps those whose `if` holds and whose limit allows, one per group unless they
 * stack, and runs each one's actions in order: every action is a registered handler (a contribution to a service or a
 * step change) with its own `if`, and save/check/use run `then`/`else` on their result.
 * State, point-in-time only: an effect's counts on the effect (`flags.midi-qol.entryState`), per-turn and per-round
 * limits on the actor (`flags.midi-qol.entryLimits`, stamped with the combat, round and turn: lib/entries/limits.ts),
 * per-use limits in memory on the use.
 * Offers: ask, reaction (an ask costing the reaction) and toggle (lib/entries/offers.ts).
 */

export interface EventContext {
  /** The creature the event is about: the bearer at its turn, the user of a use, the roller of a roll */
  actor: Actor.Implementation;
  workflow?: Workflow;
  activity?: Activity;
  item?: Item.Implementation;
  target?: TokenDocument.Implementation;
  /** The event's own data, `event` in conditions */
  event?: Record<string, unknown>;
  combat?: Combat.Implementation | null;
  /** Only the entries on this document (an effect's uuid): MidiQOL.doOverTimeEffect for one effect */
  only?: string;
  /**
   * Which offers run (a reaction event, lib/entries/responseEvents.ts): "automatic" the always and toggle entries
   * (the asks go in the reaction prompt), "asks" only the plain asks (no reaction prompt was shown). All when absent.
   */
  offers?: "automatic" | "asks";
}

export interface ActionRun {
  /** The event the entry runs at */
  eventId: string;
  action: EntryAction;
  found: FoundEntry;
  context: EventContext;
  conditionData: Record<string, unknown>;
}

/** An action's result: `success` picks `then` (true) or `else` (false) */
export type ActionResult = { success?: boolean } | void;
export type ActionHandler = (run: ActionRun) => ActionResult | Promise<ActionResult>;

export interface EventDefinition {
  label?: string;
  /** Collects the entries for the event; the default collects by `who` (this, owner, bearer) */
  collect?: (context: EventContext, eventId: string) => FoundEntry[];
}

const events = new Registry<EventDefinition>();
const actions = new Registry<ActionHandler>();
const CONTROL_KEYS = new Set(["if", "then", "else"]);

export function registerEvent(id: string, definition: EventDefinition = {}): () => void {
  events.set(id, definition);
  return () => { events.delete(id); };
}

export function registerAction(key: string, handler: ActionHandler, options: { priority?: number } = {}): () => void {
  actions.set(key, handler, { priority: options.priority });
  return () => { actions.delete(key); };
}

/** The handler an action names: of its keys that are registered actions, the highest priority (save before damage) */
function actionKey(action: EntryAction): string | undefined {
  return actions.entries().find(entry => !CONTROL_KEYS.has(entry.id) && entry.id in action)?.id;
}

/* Homes */

function entriesOf(source: unknown): Entry[] {
  return Array.isArray(source) ? source.filter((entry): entry is Entry => !!entry && typeof entry === "object" && typeof entry.id === "string" && Array.isArray(entry.do)) : [];
}

const defaultWho = (home: EntryHome): EntryWho => home === "effect" ? "bearer" : "this";

/** A list of whos (an `action` entry: the bearer or someone near) is collected as its home's default; its taker is checked against the list */
function found(entry: Entry, home: EntryHome, document: FoundEntry["document"], actor: Actor.Implementation | undefined): FoundEntry {
  const who = Array.isArray(entry.who) ? defaultWho(home) : entry.who ?? defaultWho(home);
  return { entry, home, document, who, actor };
}

/** An item's entries count while it is in use: equipped where that matters, attuned where it needs attunement */
function itemInUse(item: Item.Implementation): boolean {
  const system = item.system as { equipped?: boolean, attunement?: string, attuned?: boolean };
  if (["weapon", "equipment"].includes(item.type) && system.equipped === false) return false;
  if (system.attunement === "required" && !system.attuned) return false;
  return true;
}

/** An item's own entries and its activities' */
function itemEntries(item: Item.Implementation, actor: Actor.Implementation | undefined): FoundEntry[] {
  const list = entriesOf(item.getFlag(MODULE_ID, "entries")).map(entry => found(entry, "item", item, actor));
  // @ts-expect-error no dnd5e-types
  for (const activity of item.system.activities ?? []) list.push(...entriesOf(activity.midiEntries).map(entry => found(entry, "activity", activity, actor)));
  return list;
}

/** Other forms read as entries on an effect (OverTime): id → reader */
const effectReaders = new Registry<(effect: ActiveEffect.Implementation, actor: Actor.Implementation) => Entry[]>();

export function registerEffectEntryReader(id: string, reader: (effect: ActiveEffect.Implementation, actor: Actor.Implementation) => Entry[]): () => void {
  effectReaders.set(id, reader);
  return () => { effectReaders.delete(id); };
}

function effectEntries(effect: ActiveEffect.Implementation, actor: Actor.Implementation): FoundEntry[] {
  const list = entriesOf(effect.getFlag(MODULE_ID, "entries"));
  for (const reader of effectReaders.entries()) {
    try {
      list.push(...reader.value(effect, actor));
    } catch (err) {
      console.warn(`midi-qol | entry reader ${reader.id} failed for ${effect.name}`, err);
    }
  }
  return list.map(entry => found(entry, "effect", effect, actor));
}

const listens = (entry: Entry, eventId: string) => [entry.on].flat().includes(eventId);

/** An actor's applied effects' entries for an event, whatever their who */
export function actorEffectEntries(actor: Actor.Implementation, eventId: string): FoundEntry[] {
  const list: FoundEntry[] = [];
  for (const effect of actor.appliedEffects) list.push(...effectEntries(effect, actor).filter(f => listens(f.entry, eventId)));
  return list;
}

/**
 * An item's entry with no `who` is about the uses of that item at a use event (`use.*`), and about its owner at any
 * other (attacked, damaging, a roll, a turn): Lucky's disadvantage, a reaction item's offer
 */
export function itemEntryIsOwners(f: FoundEntry, eventId: string): boolean {
  return f.who === "owner" || (f.home === "item" && f.entry.who === undefined && !eventId.startsWith("use."));
}

/** By who: the use's own entries (this), the actor's items (owner), its applied effects (bearer) */
function collectByWho(context: EventContext, eventId: string): FoundEntry[] {
  const { actor } = context;
  const list: FoundEntry[] = [];
  const own = context.activity?.item ?? context.item;
  if (own) list.push(...itemEntries(own, actor).filter(f => f.who === "this" && !itemEntryIsOwners(f, eventId) && (f.home !== "activity" || f.document === context.activity)));
  for (const item of actor.items) if (itemInUse(item)) list.push(...itemEntries(item, actor).filter(f => itemEntryIsOwners(f, eventId)));
  for (const effect of actor.appliedEffects) list.push(...effectEntries(effect, actor).filter(f => f.who === "bearer"));
  return list.filter(f => listens(f.entry, eventId));
}

/* Near (stage 4c): entries with `who: { within, of, filter }` on the creatures around the one the event is about */

/** Bumped whenever an item, effect or actor changes: the near holders are found again */
let homesGeneration = 0;
let nearHolders: { generation: number, byActor: WeakMap<Actor.Implementation, FoundEntry[]> } = { generation: -1, byActor: new WeakMap() };

/** An actor's near entries (its items' and applied effects' with an object `who`) */
function nearEntriesOf(actor: Actor.Implementation): FoundEntry[] {
  if (nearHolders.generation !== homesGeneration) nearHolders = { generation: homesGeneration, byActor: new WeakMap() };
  let list = nearHolders.byActor.get(actor);
  if (!list) {
    list = [];
    for (const item of actor.items) if (itemInUse(item)) list.push(...itemEntries(item, actor).filter(f => typeof f.who === "object"));
    for (const effect of actor.appliedEffects) list.push(...effectEntries(effect, actor).filter(f => typeof f.who === "object"));
    nearHolders.byActor.set(actor, list);
  }
  return list;
}

/** The token a event is about: its target, the use's token, else the actor's first on the viewed scene */
function eventToken(context: EventContext): TokenDocument.Implementation | undefined {
  if (context.target) return context.target;
  const useToken = context.workflow?.token as { document?: TokenDocument.Implementation } | TokenDocument.Implementation | undefined;
  if (useToken && context.workflow?.actor === context.actor) return useToken instanceof TokenDocument ? useToken : useToken.document;
  return context.actor.getActiveTokens(false, true)[0] as TokenDocument.Implementation | undefined;
}

/** A creature's reach: its longest equipped melee weapon's, else 5 */
function reachOf(actor: Actor.Implementation): number {
  let reach = 5;
  for (const item of actor.items) {
    const system = item.system as { equipped?: boolean, range?: { reach?: number | null }, type?: { value?: string } };
    if (["weapon"].includes(item.type) && system.equipped && system.range?.reach) reach = Math.max(reach, Number(system.range.reach) || 0);
  }
  return reach;
}

function nearEntries(context: EventContext, eventId: string): FoundEntry[] {
  const about = eventToken(context);
  const scene = about?.parent;
  if (!about || !scene) return [];
  const list: FoundEntry[] = [];
  for (const holderToken of scene.tokens) {
    const holder = holderToken.actor;
    if (!holder) continue;
    for (const f of nearEntriesOf(holder)) {
      if (!listens(f.entry, eventId)) continue;
      const who = f.who as Exclude<EntryWho, string>;
      let from: TokenDocument.Implementation | undefined = holderToken;
      if (who.of === "origin") {
        const origin = f.document instanceof ActiveEffect ? originActor(f.document) : undefined;
        from = origin?.getActiveTokens(false, true).find(t => t.parent === scene) as TokenDocument.Implementation | undefined;
      } else if (who.of !== "bearer") {
        console.warn(`midi-qol | entry ${f.entry.id}: who.of "${who.of}" is not supported (bearer or origin)`);
        continue;
      }
      if (!from) continue;
      const within = who.within === "reach" ? reachOf(holder) : Number(who.within);
      const distance = from === about ? 0 : getDistance(from, about, { wallsBlock: false });
      if (distance < 0 || distance > within) continue;
      list.push({ ...f, near: { creature: context.actor, token: about, distance } });
    }
  }
  return list;
}

/** The entries a event would run for this context, before conditions and limits (MidiQOL.entries.collect) */
export function collectEntries(eventId: string, context: EventContext): FoundEntry[] {
  const definition = events.get(eventId)?.value;
  const list = (definition?.collect ?? collectByWho)(context, eventId);
  if (!definition?.collect) list.push(...nearEntries(context, eventId));
  return context.only ? list.filter(f => documentUuid(f.document) === context.only) : list;
}

/** The actor's entries offered as toggles (its items in use and applied effects), for the sheet's Toggles control */
export function actorToggleEntries(actor: Actor.Implementation): FoundEntry[] {
  const list: FoundEntry[] = [];
  for (const item of actor.items) if (itemInUse(item)) list.push(...itemEntries(item, actor));
  for (const effect of actor.appliedEffects) list.push(...effectEntries(effect, actor));
  return list.filter(f => f.entry.offer === "toggle");
}

/** An entry runs if its `who` filter (a near entry's) and its `if` hold */
export async function entryHolds(f: FoundEntry, conditionData: Record<string, unknown>): Promise<boolean> {
  const filter = typeof f.who === "object" ? f.who.filter : undefined;
  return await holds(filter, conditionData) && await holds(f.entry.if, conditionData);
}

export function watchEntryHomes() {
  const bump = () => { homesGeneration += 1; };
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateActor", "createToken", "deleteToken", "canvasReady"])
    Hooks.on(hook as Hooks.HookName, bump);
}

/** The activity that applied an effect (dnd5e's system.origin, DAE's flags.dae.activity), while it still exists */
export function applyingActivity(effect: ActiveEffect.Implementation): Activity | undefined {
  const uuid = (foundry.utils.getProperty(effect, "system.origin.activity") ?? effect.flags?.dae?.activity) as string | undefined;
  const activity = uuid ? fromUuidSync(uuid, { strict: false }) : undefined;
  return activity && typeof activity === "object" && "item" in activity ? activity as unknown as Activity : undefined;
}

/** The actor whose use applied an effect */
export function originActor(effect: ActiveEffect.Implementation): Actor.Implementation | undefined {
  const fromActivity = applyingActivity(effect)?.actor;
  if (fromActivity) return fromActivity as Actor.Implementation;
  let origin: unknown = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : undefined;
  while (origin && !(origin instanceof Actor)) origin = (origin as { parent?: unknown }).parent;
  return origin instanceof Actor ? origin : undefined;
}

/** The origin's events: entries on the effects, on the combat's other creatures, that this actor's uses applied */
function collectForOrigin(context: EventContext, eventId: string): FoundEntry[] {
  const combat = context.combat ?? game.combat;
  const list: FoundEntry[] = [];
  for (const combatant of combat?.combatants ?? []) {
    const bearer = combatant.actor;
    if (!bearer) continue;
    for (const effect of bearer.appliedEffects) {
      if (originActor(effect) !== context.actor) continue;
      list.push(...effectEntries(effect, bearer).filter(f => f.who === "bearer" && listens(f.entry, eventId)));
    }
  }
  return list;
}

/* State */

function combatPosition(context: EventContext): CombatPosition | undefined {
  const combat = context.combat ?? game.combat;
  if (!combat?.started || !combat.id) return undefined;
  return { id: combat.id, round: combat.round ?? 0, turn: combat.turn ?? 0 };
}

const documentUuid = (document: FoundEntry["document"]) => (document as { uuid?: string }).uuid ?? "";

/** Written by the GM when the user can't */
async function updateDocument(document: Actor.Implementation | ActiveEffect.Implementation, updates: Record<string, unknown>) {
  if (document.isOwner) return document.update(updates);
  if (document instanceof Actor) return unTimedExecuteAsGM("updateActor", { actorUuid: document.uuid, updates });
  const parent = document.parent as { uuid?: string } | null;
  return unTimedExecuteAsGM("updateEffects", { actorUuid: parent?.uuid, updates: [{ _id: document.id, ...updates }] });
}

/** An effect's state for an entry: its counts (saves, fails, stages) and uses */
export function entryState(effect: ActiveEffect.Implementation, entryId: string): Record<string, number> {
  const state = effect.getFlag(MODULE_ID, "entryState") as Record<string, Record<string, number>> | undefined;
  return { ...(state?.[entryId] ?? {}) };
}

export async function setEntryState(effect: ActiveEffect.Implementation, entryId: string, state: Record<string, number>): Promise<void> {
  await updateDocument(effect, { [`flags.${MODULE_ID}.entryState.${entryId}`]: state });
}

const useLimits = new WeakMap<object, Map<string, number>>();
/** The groups a use has taken an entry of */
const groupsUsed = new WeakMap<object, Set<string>>();

function storedLimits(actor: Actor.Implementation | undefined): StoredLimit[] {
  const stored = actor?.getFlag(MODULE_ID, "entryLimits");
  return Array.isArray(stored) ? stored : [];
}

export function limitAllows(f: FoundEntry, context: EventContext): boolean {
  const limit = f.entry.limit;
  if (!limit) return true;
  const key = limitKey(documentUuid(f.document), f.entry.id);
  const max = limit.max ?? 1;
  switch (limit.per) {
    case "use": return !context.workflow || (useLimits.get(context.workflow)?.get(key) ?? 0) < max;
    case "effect": return !(f.document instanceof ActiveEffect) || (entryState(f.document, f.entry.id).used ?? 0) < max;
    default: {
      const records = storedLimits(f.actor);
      return withinLimit(limit, records.find(record => record.key === key), limitStamp(limit.per, combatPosition(context)));
    }
  }
}

export async function spendEntryLimit(f: FoundEntry, context: EventContext): Promise<void> {
  const limit = f.entry.limit;
  if (!limit) return;
  const key = limitKey(documentUuid(f.document), f.entry.id);
  switch (limit.per) {
    case "use": {
      if (!context.workflow) return;
      const counts = useLimits.get(context.workflow) ?? new Map<string, number>();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      useLimits.set(context.workflow, counts);
      return;
    }
    case "effect": {
      // An entry that ended its own effect has nothing left to count on
      if (!(f.document instanceof ActiveEffect) || !(f.document.parent as Actor.Implementation | null)?.effects?.has(f.document.id ?? "")) return;
      const state = entryState(f.document, f.entry.id);
      return setEntryState(f.document, f.entry.id, { ...state, used: (state.used ?? 0) + 1 });
    }
    default: {
      const combat = combatPosition(context);
      const stamp = limitStamp(limit.per, combat);
      if (!stamp || !f.actor) return;
      await updateDocument(f.actor, { [`flags.${MODULE_ID}.entryLimits`]: spendStoredLimit(storedLimits(f.actor), key, stamp, combat) });
    }
  }
}

/* Running */

export function conditionDataFor(f: FoundEntry, context: EventContext): Record<string, unknown> {
  const effect = f.document instanceof ActiveEffect ? f.document : undefined;
  const { extra, entry } = entryConditionExtras(f, context, effect ? applyingActivity(effect) : undefined, effect ? originActor(effect) : undefined);
  const data = createConditionData({
    workflow: context.workflow, actor: f.actor ?? context.actor, activity: context.activity, item: context.item,
    ...(context.target ? { target: context.target } : {}),
    extraData: {
      ...extra,
      event: f.near ? { ...context.event, creature: f.near.creature, creatureToken: f.near.token, distance: f.near.distance } : context.event ?? {},
      bearer: f.actor,
      entry: { ...entry, id: f.entry.id, self: documentUuid(f.document), home: f.home, counts: effect ? entryState(effect, f.entry.id) : {} },
      choices: (effect?.getFlag(MODULE_ID, "choices") as Record<string, unknown> | undefined) ?? context.workflow?.choices ?? context.workflow?.workflowOptions?.choices ?? {}
    }
  });
  addEconomy(data, f.actor ?? context.actor);
  // Someone else's entry at a use's event (a target's, a near creature's): its @abilities, @prof... are its own, not the user's
  if (f.actor && context.workflow && f.actor !== context.workflow.actor) {
    const own = f.actor.getRollData() as Record<string, unknown>;
    for (const key of ["abilities", "attributes", "skills", "prof", "bonuses", "details", "traits", "classes", "scale", "spells"]) if (key in own) data[key] = own[key];
  }
  return data;
}

export async function holds(expression: string | undefined, conditionData: Record<string, unknown>): Promise<boolean> {
  if (!expression) return true;
  return !!await evalCondition(expression, conditionData, { errorReturn: false, async: true });
}

export interface EntryRunResult { entry: string, document: string, actions: string[] }

/** Run a list of actions for an entry (a table row's, an action's then/else): the keys that ran are added to `ran` */
export async function runActions(list: readonly EntryAction[], run: Omit<ActionRun, "action">, ran: string[]): Promise<void> {
  for (const action of list) {
    // At a use's event (no one target), an action for the targets with a condition is run for each target its
    // condition holds for, its condition and values read with that target (Ensnaring Strike: Large or larger)
    const targets = perTargetRun(action, run);
    if (targets) {
      for (const target of targets) {
        const context = { ...run.context, target };
        const conditionData = conditionDataFor(run.found, context);
        if (await holds(action.if, conditionData)) await runAction(action, { ...run, context, conditionData }, ran);
      }
      continue;
    }
    if (!await holds(action.if, run.conditionData)) continue;
    await runAction(action, run, ran);
  }
}

function perTargetRun(action: EntryAction, run: Omit<ActionRun, "action">): TokenDocument.Implementation[] | undefined {
  if (run.context.target || !run.context.workflow || !action.if) return undefined;
  if (action.for !== "target" && action.to !== "target") return undefined;
  return (run.context.workflow.targets as { documents?: TokenDocument.Implementation[] } | undefined)?.documents ?? [];
}

async function runAction(action: EntryAction, run: Omit<ActionRun, "action">, ran: string[]): Promise<void> {
  const key = actionKey(action);
  const handler = key ? actions.get(key)?.value : undefined;
  if (!key || !handler) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: no action ${Object.keys(action).join(", ")}`);
    return;
  }
  let result: ActionResult;
  try {
    result = await handler({ ...run, action });
  } catch (err) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: action ${key} failed`, err);
    return;
  }
  ran.push(key);
  const success = result?.success;
  if (success === true && action.then) await runActions(action.then, run, ran);
  if (success === false && action.else) await runActions(action.else, run, ran);
}

/** Run a event's entries for this context (MidiQOL.entries.run): what ran, in order */
export async function runEvent(eventId: string, context: EventContext): Promise<EntryRunResult[]> {
  type Candidate = { found: FoundEntry, conditionData: Record<string, unknown>, entry: Entry, ask: boolean };
  const candidates: Candidate[] = [];
  for (const f of collectEntries(eventId, context)) {
    const offer = f.entry.offer ?? "always";
    const ask = offer === "ask" || offer === "reaction";
    if (context.offers === "automatic" && ask) continue;
    if (context.offers === "asks" && offer !== "ask") continue;
    if (offer === "toggle" && !toggleOn(f)) continue;
    // A reaction offer is asked as `ask` and costs the reaction: not offered once it is used
    if (offer === "reaction" && (!f.actor || hasUsedReaction(f.actor))) continue;
    const conditionData = conditionDataFor(f, context);
    if (!await entryHolds(f, conditionData)) continue;
    if (!limitAllows(f, context) || !costAllows(f)) continue;
    candidates.push({ found: f, conditionData, entry: f.entry, ask });
  }
  const results: EntryRunResult[] = [];
  // A group is one entry per use, across the use's events (Metamagic: one option per spell), unless it stacks
  const open = candidates.filter(c => groupOpen(c.entry, context));
  const automatic = selectGroups(open.filter(c => !c.ask));
  const taken = new Set(automatic.flatMap(c => c.entry.group && !c.entry.stacks ? [c.entry.group] : []));
  const asked = await chooseAsked(eventId, open.filter(c => c.ask && (!c.entry.group || c.entry.stacks || !taken.has(c.entry.group))));
  for (const { found: f, conditionData } of [...automatic, ...selectGroups(asked)]) results.push(await takeEntry(eventId, f, context, conditionData));
  return results;
}

/** The entry's group (if any) has no entry taken yet this use, or it stacks */
function groupOpen(entry: Entry, context: EventContext): boolean {
  if (!entry.group || entry.stacks || !context.workflow) return true;
  return !groupsUsed.get(context.workflow)?.has(entry.group);
}

/**
 * Run an entry that was chosen (or runs by itself): its actions, then what taking it spends: its limit, its cost, the
 * reaction for a reaction offer, its group for the use. A reaction prompt's offer (lib/entries/responseEvents.ts) is
 * taken this way.
 */
export async function takeEntry(eventId: string, f: FoundEntry, context: EventContext, conditionData: Record<string, unknown>): Promise<EntryRunResult> {
  const ran: string[] = [];
  if (!await payEntryConsumption(f)) return { entry: f.entry.id, document: documentUuid(f.document), actions: ran };
  // Its own choice, asked as it is taken and kept on the use as choices[<entry id>]; closed, it is not taken
  if (f.entry.choose && context.workflow && await holds(f.entry.choose.if as string | undefined, conditionData)) {
    const value = await askEntryChoice({ label: f.entry.label ?? f.entry.id, kind: "option", ...f.entry.choose, id: f.entry.id } as ChoiceDeclaration, context.workflow);
    if (value === undefined) return { entry: f.entry.id, document: documentUuid(f.document), actions: ran };
    context.workflow.setChoice(f.entry.id, value);
    const choices = (conditionData.choices ?? {}) as Record<string, unknown>;
    conditionData.choices = { ...choices, [f.entry.id]: value };
  }
  await runActions(f.entry.do, { eventId: eventId, found: f, context, conditionData }, ran);
  if (ran.length) {
    await spendEntryLimit(f, context);
    await spendEntryCost(f);
    if (f.entry.offer === "reaction" && f.actor) await setReactionUsed(f.actor);
    if (f.entry.group && context.workflow) {
      const used = groupsUsed.get(context.workflow) ?? new Set<string>();
      used.add(f.entry.group);
      groupsUsed.set(context.workflow, used);
    }
  }
  return { entry: f.entry.id, document: documentUuid(f.document), actions: ran };
}

/**
 * The ask and reaction offers a event has for its creature, not yet run (a reaction prompt's): their conditions,
 * limits, costs and groups checked; reaction offers only while `reactionLeft`.
 */
export async function offerableEntries(eventId: string, context: EventContext, reactionLeft: boolean): Promise<{ found: FoundEntry, conditionData: Record<string, unknown> }[]> {
  const list: { found: FoundEntry, conditionData: Record<string, unknown> }[] = [];
  for (const f of collectEntries(eventId, context)) {
    const offer = f.entry.offer ?? "always";
    if (offer !== "ask" && offer !== "reaction") continue;
    if (offer === "reaction" && !reactionLeft) continue;
    // Someone else's (near) entry is asked of its holder, not in this creature's prompt
    if (f.actor && f.actor !== context.actor) continue;
    if (!groupOpen(f.entry, context)) continue;
    const conditionData = conditionDataFor(f, context);
    if (!await entryHolds(f, conditionData)) continue;
    if (!limitAllows(f, context) || !costAllows(f)) continue;
    list.push({ found: f, conditionData });
  }
  return list;
}

/** The ask offers taken: each actor's owner asked once for the event */
async function chooseAsked<T extends { found: FoundEntry }>(eventId: string, list: T[]): Promise<T[]> {
  if (!list.length) return [];
  const byActor = new Map<Actor.Implementation, { candidate: T, key: string }[]>();
  list.forEach((candidate, index) => {
    const actor = candidate.found.actor;
    if (!actor) return;
    const entries = byActor.get(actor) ?? [];
    if (!entries.length) byActor.set(actor, entries);
    entries.push({ candidate, key: `o${index}` });
  });
  const taken: T[] = [];
  for (const [actor, entries] of byActor) {
    const title = `${actor.name}: ${events.get(eventId)?.value.label ?? eventId}`;
    const keys = new Set(await askOffers(actor, title, entries.map(({ candidate, key }) => offerOption(candidate.found, key))));
    taken.push(...entries.filter(e => keys.has(e.key)).map(e => e.candidate));
  }
  return taken;
}
/* midi's built-in actions (stage 1); the rest come with stage 2 */

export function registerMidiEntryActions() {
  registerEvent("turnStart", { label: "The bearer's turn starts" });
  registerEvent("turnEnd", { label: "The bearer's turn ends" });
  registerEvent("roundStart", { label: "A round starts (for each creature in the combat)" });
  registerEvent("originTurnStart", { label: "The turn of the creature whose use applied the effect starts", collect: collectForOrigin });
  registerEvent("originTurnEnd", { label: "The turn of the creature whose use applied the effect ends", collect: collectForOrigin });
  // { end: true }: the effect holding the entry ends (as an expiry, so DAE's expiry mode applies)
  registerAction("end", async ({ found: f }) => {
    if (!(f.document instanceof ActiveEffect)) return;
    const actor = f.document.parent instanceof Actor ? f.document.parent : f.actor;
    if (actor) await expireEffects(actor, [f.document], { "expiry-reason": `midi-qol:entry:${f.entry.id}` });
  });
}

export const entriesApi = {
  registerEvent, registerAction, collect: collectEntries, run: runEvent, state: entryState, toggles: listToggles, setToggle, editToggles,
  events: () => events.entries().map(entry => entry.id),
  actions: () => actions.entries().map(entry => entry.id)
};
