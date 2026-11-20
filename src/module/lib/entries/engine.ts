import { MODULE_ID } from "../../../midi-qol.js";
import { Registry } from "../../api/registry.js";
import type { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import { createConditionData, evalCondition, expireEffects } from "../../utils.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { limitKey, limitStamp, selectGroups, spendStoredLimit, withinLimit, type CombatMoment, type StoredLimit } from "./limits.js";
import type { Entry, EntryAction, EntryHome, EntryWho, FoundEntry } from "./types.js";

/*
 * M15 stage 1: the entry engine (plan ~/Documents/midi-next-M15-plan-2026-11-20.md). A moment is raised with the actor
 * it is about; the engine collects the entries for it by `who` from their homes (the use's activity and item, the
 * actor's items, its applied effects), keeps those whose `if` holds and whose limit allows, one per group unless they
 * stack, and runs each one's actions in order: every action is a registered handler (a contribution to a service or a
 * step change) with its own `if`, and save/check/use run `then`/`else` on their result.
 * State, point-in-time only: an effect's counts on the effect (`flags.midi-qol.entryState`), per-turn and per-round
 * limits on the actor (`flags.midi-qol.entryLimits`, stamped with the combat, round and turn: lib/entries/limits.ts),
 * per-use limits in memory on the use.
 * Offers other than "always" (ask, reaction, toggle) come with stages 3 and 4: until then such an entry is not run.
 */

export interface MomentContext {
  /** The creature the moment is about: the bearer at its turn, the user of a use, the roller of a roll */
  actor: Actor.Implementation;
  workflow?: Workflow;
  activity?: Activity;
  item?: Item.Implementation;
  target?: TokenDocument.Implementation;
  /** The moment's own data, `event` in conditions */
  event?: Record<string, unknown>;
  combat?: Combat.Implementation | null;
}

export interface ActionRun {
  action: EntryAction;
  found: FoundEntry;
  context: MomentContext;
  conditionData: Record<string, unknown>;
}

/** An action's result: `success` picks `then` (true) or `else` (false) */
export type ActionResult = { success?: boolean } | void;
export type ActionHandler = (run: ActionRun) => ActionResult | Promise<ActionResult>;

export interface MomentDefinition {
  label?: string;
  /** Collects the entries for the moment; the default collects by `who` (this, owner, bearer) */
  collect?: (context: MomentContext, momentId: string) => FoundEntry[];
}

const moments = new Registry<MomentDefinition>();
const actions = new Registry<ActionHandler>();
const CONTROL_KEYS = new Set(["if", "then", "else"]);

export function registerMoment(id: string, definition: MomentDefinition = {}): () => void {
  moments.set(id, definition);
  return () => { moments.delete(id); };
}

export function registerAction(key: string, handler: ActionHandler, options: { priority?: number } = {}): () => void {
  actions.set(key, handler, { priority: options.priority });
  return () => { actions.delete(key); };
}

/** The handler an action names: the first of its keys that is a registered action */
function actionKey(action: EntryAction): string | undefined {
  return Object.keys(action).find(key => !CONTROL_KEYS.has(key) && actions.has(key));
}

/* Homes */

function entriesOf(source: unknown): Entry[] {
  return Array.isArray(source) ? source.filter((entry): entry is Entry => !!entry && typeof entry === "object" && typeof entry.id === "string" && Array.isArray(entry.do)) : [];
}

const defaultWho = (home: EntryHome): EntryWho => home === "effect" ? "bearer" : "this";

function found(entry: Entry, home: EntryHome, document: FoundEntry["document"], actor: Actor.Implementation | undefined): FoundEntry {
  return { entry, home, document, who: entry.who ?? defaultWho(home), actor };
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

const listens = (entry: Entry, momentId: string) => [entry.on].flat().includes(momentId);

/** By who: the use's own entries (this), the actor's items (owner), its applied effects (bearer) */
function collectByWho(context: MomentContext, momentId: string): FoundEntry[] {
  const { actor } = context;
  const list: FoundEntry[] = [];
  const own = context.activity?.item ?? context.item;
  if (own) list.push(...itemEntries(own, actor).filter(f => f.who === "this" && (f.home !== "activity" || f.document === context.activity)));
  for (const item of actor.items) if (itemInUse(item)) list.push(...itemEntries(item, actor).filter(f => f.who === "owner"));
  for (const effect of actor.appliedEffects) list.push(...effectEntries(effect, actor).filter(f => f.who === "bearer"));
  return list.filter(f => listens(f.entry, momentId));
}

/** The entries a moment would run for this context, before conditions and limits (MidiQOL.entries.collect) */
export function collectEntries(momentId: string, context: MomentContext): FoundEntry[] {
  const definition = moments.get(momentId)?.value;
  return (definition?.collect ?? collectByWho)(context, momentId);
}

/* State */

function combatMoment(context: MomentContext): CombatMoment | undefined {
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

function storedLimits(actor: Actor.Implementation | undefined): StoredLimit[] {
  const stored = actor?.getFlag(MODULE_ID, "entryLimits");
  return Array.isArray(stored) ? stored : [];
}

function limitAllows(f: FoundEntry, context: MomentContext): boolean {
  const limit = f.entry.limit;
  if (!limit) return true;
  const key = limitKey(documentUuid(f.document), f.entry.id);
  const max = limit.max ?? 1;
  switch (limit.per) {
    case "use": return !context.workflow || (useLimits.get(context.workflow)?.get(key) ?? 0) < max;
    case "effect": return !(f.document instanceof ActiveEffect) || (entryState(f.document, f.entry.id).used ?? 0) < max;
    default: {
      const records = storedLimits(f.actor);
      return withinLimit(limit, records.find(record => record.key === key), limitStamp(limit.per, combatMoment(context)));
    }
  }
}

async function spendEntryLimit(f: FoundEntry, context: MomentContext): Promise<void> {
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
      if (!(f.document instanceof ActiveEffect)) return;
      const state = entryState(f.document, f.entry.id);
      return setEntryState(f.document, f.entry.id, { ...state, used: (state.used ?? 0) + 1 });
    }
    default: {
      const combat = combatMoment(context);
      const stamp = limitStamp(limit.per, combat);
      if (!stamp || !f.actor) return;
      await updateDocument(f.actor, { [`flags.${MODULE_ID}.entryLimits`]: spendStoredLimit(storedLimits(f.actor), key, stamp, combat) });
    }
  }
}

/* Running */

function conditionDataFor(f: FoundEntry, context: MomentContext): Record<string, unknown> {
  const effect = f.document instanceof ActiveEffect ? f.document : undefined;
  return createConditionData({
    workflow: context.workflow, actor: context.actor, activity: context.activity, item: context.item,
    ...(context.target ? { target: context.target } : {}),
    extraData: {
      event: context.event ?? {},
      entry: { id: f.entry.id, self: documentUuid(f.document), home: f.home, counts: effect ? entryState(effect, f.entry.id) : {} },
      choices: (effect?.getFlag(MODULE_ID, "choices") as Record<string, unknown> | undefined) ?? context.workflow?.workflowOptions?.choices ?? {}
    }
  });
}

async function holds(expression: string | undefined, conditionData: Record<string, unknown>): Promise<boolean> {
  if (!expression) return true;
  return !!await evalCondition(expression, conditionData, { errorReturn: false, async: true });
}

export interface EntryRunResult { entry: string, document: string, actions: string[] }

async function runActions(list: readonly EntryAction[], run: Omit<ActionRun, "action">, ran: string[]): Promise<void> {
  for (const action of list) {
    if (!await holds(action.if, run.conditionData)) continue;
    const key = actionKey(action);
    const handler = key ? actions.get(key)?.value : undefined;
    if (!key || !handler) {
      console.warn(`midi-qol | entry ${run.found.entry.id}: no action ${Object.keys(action).join(", ")}`);
      continue;
    }
    let result: ActionResult;
    try {
      result = await handler({ ...run, action });
    } catch (err) {
      console.warn(`midi-qol | entry ${run.found.entry.id}: action ${key} failed`, err);
      continue;
    }
    ran.push(key);
    const success = result?.success;
    if (success === true && action.then) await runActions(action.then, run, ran);
    if (success === false && action.else) await runActions(action.else, run, ran);
  }
}

/** Run a moment's entries for this context (MidiQOL.entries.run): what ran, in order */
export async function runMoment(momentId: string, context: MomentContext): Promise<EntryRunResult[]> {
  const candidates: { found: FoundEntry, conditionData: Record<string, unknown> }[] = [];
  for (const f of collectEntries(momentId, context)) {
    if ((f.entry.offer ?? "always") !== "always") continue;
    const conditionData = conditionDataFor(f, context);
    if (!await holds(f.entry.if, conditionData)) continue;
    if (!limitAllows(f, context)) continue;
    candidates.push({ found: f, conditionData });
  }
  const results: EntryRunResult[] = [];
  for (const { found: f, conditionData } of selectGroups(candidates.map(c => ({ ...c, entry: c.found.entry })))) {
    const ran: string[] = [];
    await runActions(f.entry.do, { found: f, context, conditionData }, ran);
    if (ran.length) await spendEntryLimit(f, context);
    results.push({ entry: f.entry.id, document: documentUuid(f.document), actions: ran });
  }
  return results;
}

/* midi's built-in actions (stage 1); the rest come with stage 2 */

export function registerMidiEntryActions() {
  // { end: true }: the effect holding the entry ends (as an expiry, so DAE's expiry mode applies)
  registerAction("end", async ({ found: f }) => {
    if (!(f.document instanceof ActiveEffect)) return;
    const actor = f.document.parent instanceof Actor ? f.document.parent : f.actor;
    if (actor) await expireEffects(actor, [f.document], { "expiry-reason": `midi-qol:entry:${f.entry.id}` });
  });
}

export const entriesApi = {
  registerMoment, registerAction, collect: collectEntries, run: runMoment, state: entryState,
  moments: () => moments.entries().map(entry => entry.id),
  actions: () => actions.entries().map(entry => entry.id)
};
