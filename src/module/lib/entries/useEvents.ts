import { register } from "../../api/services.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { applyTokenDamage } from "../../utils.js";
import { tokenFor } from "../tokenResolver.js";
import { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import type { RollKind, RollModifier, RollModifierEffect, RollQuery } from "../../services/rollModifiers/service.js";
import type { DamageContribution } from "../../services/damageContributions/service.js";
import type { DamageChange, DamageStage } from "../../services/damageModifiers/rules.js";
import { DAMAGE_STAGES } from "../../services/damageModifiers/rules.js";
import { applyBonusEffect, type BonusEffect } from "../../services/rollBonuses/service.js";
import { rerollDice } from "../../services/diceReroll/service.js";
import { raiseDealsDamage } from "./bearerEvents.js";
import { entryActivity } from "./activityActions.js";
import { collectEntries, conditionDataFor, entryHolds, holds, limitAllows, registerAction, registerEvent, runEvent, spendEntryLimit, type ActionRun, type EventContext } from "./engine.js";

/*
 * M15 stage 4a: the use events and the target events, and the actions that contribute to a use. A use event is
 * raised for the use's actor (`who: "this"` / `"owner"`, an effect's bearer); a target event for each target, the
 * target as the actor and the attacker's use as `event.use`. Both are raised from the step passes (USE_EVENTS),
 * `use.configure` from prepareUse and `damaged` with midi's isDamaged.
 * A contribution an action makes (a roll modifier, damage, a damage change) is kept on the use and read by midi's
 * contributors when the service asks (as rollBonuses' targeted damage bonuses are), so it applies on whichever client
 * asks, as long as the use is known there.
 */

type TargetsOf = (workflow: Workflow) => TokenDocument.Implementation[];

interface EventAt {
  eventId: string;
  /** For each of these targets (a target event); a use event when absent */
  targets?: TargetsOf;
  /** With `targets`: the user's event about each target (the use's own entries run, the target as `target`) */
  asUse?: boolean;
  when?: (workflow: Workflow) => boolean;
}

const documents = (set: { documents?: TokenDocument.Implementation[] } | undefined) => set?.documents ?? [];
const allTargets: TargetsOf = w => documents(w.targets);
const hitTargets: TargetsOf = w => [...new Set([...documents(w.hitTargets), ...documents(w.hitTargetsEC)])];
const attacks = (w: Workflow) => !!w.activity?.attack;
// @ts-expect-error item.type includes dnd5e subtypes
const casts = (w: Workflow) => w.item?.type === "spell";
const missedTargets: TargetsOf = w => { const hit = new Set(hitTargets(w)); return allTargets(w).filter(t => !hit.has(t)); };
const failedTargets: TargetsOf = w => documents(w.failedSaves);
const savedTargets: TargetsOf = w => documents(w.saves);

/** The events each step pass raises, by "pre"/"post" and step id */
const USE_EVENTS: Record<string, EventAt[]> = {
  "post midi-qol.PreambleComplete": [
    { eventId: "use.targeted" }, { eventId: "targeted", targets: allTargets }, { eventId: "casts", when: casts },
    // The services' questions for this use, answered now for midi's synchronous checks (lib/entries/serviceEvents.ts)
    { eventId: "cover" }, { eventId: "cover", targets: allTargets }, { eventId: "perception" }, { eventId: "perception", targets: allTargets }
  ],
  "pre midi-qol.WaitForAttackRoll": [{ eventId: "use.attack", when: attacks }, { eventId: "attacks", when: attacks }],
  // attacked, hit, missed, saveRequested, saveFailed, saveSucceeded, damaging, healing: raised where midi asks for
  // reactions, so they share its prompt (lib/entries/responseEvents.ts)
  "post midi-qol.AttackRollComplete": [
    { eventId: "use.hit", when: w => attacks(w) && hitTargets(w).length > 0 },
    { eventId: "use.missed", when: w => attacks(w) && !!w.attackRoll && hitTargets(w).length === 0 },
    { eventId: "use.target.hit", targets: hitTargets, asUse: true, when: attacks },
    { eventId: "use.target.missed", targets: missedTargets, asUse: true, when: w => attacks(w) && !!w.attackRoll }
  ],
  "pre midi-qol.DamageRollStarted": [{ eventId: "use.damageRoll" }],
  "post midi-qol.DamageRollComplete": [{ eventId: "use.damageRolled" }],
  "pre midi-qol.WaitForSaves": [{ eventId: "use.saves", when: w => !!w.saveActivity }],
  "post midi-qol.SavesComplete": [
    { eventId: "use.target.saveFailed", targets: failedTargets, asUse: true, when: w => !!w.saveActivity },
    { eventId: "use.target.saveSucceeded", targets: savedTargets, asUse: true, when: w => !!w.saveActivity }
  ],
  "pre midi-qol.ApplyDynamicEffects": [{ eventId: "use.effects" }],
  "post midi-qol.RollFinished": [{ eventId: "use.end" }, { eventId: "use.target.each", targets: allTargets, asUse: true }]
};

const SITE_EVENTS = ["attacked", "hit", "missed", "saveRequested", "saveFailed", "saveSucceeded", "damaging", "healing", "damaged"];
const USE_EVENT_IDS = new Set(["use.configure", ...Object.values(USE_EVENTS).flat().map(m => m.eventId), ...SITE_EVENTS]);

/** A event raised by a use (its contributions go to the use) */
export function isUseEvent(eventId: string): boolean { return USE_EVENT_IDS.has(eventId); }

/** The context of a use event: the user's */
export function useContext(workflow: Workflow, event: Record<string, unknown> = {}): EventContext {
  return { actor: workflow.actor, workflow, activity: workflow.activity as Activity, item: workflow.item, event };
}

/** The context of the user's event about one target (use.target.*): the use's own entries run, the target as `target` */
export function useTargetContext(workflow: Workflow, target: TokenDocument.Implementation, event: Record<string, unknown> = {}): EventContext {
  return { ...useContext(workflow, { ...event, target: target.actor, targetToken: target }), target };
}

/** The context of a target event: the target is the actor; the user's use is `event.use` */
export function targetContext(workflow: Workflow, target: TokenDocument.Implementation, event: Record<string, unknown> = {}): EventContext | undefined {
  const actor = target.actor;
  if (!actor) return undefined;
  return { actor, workflow, target, event: { ...event, actor: workflow.actor, token: workflow.token?.document ?? workflow.token, use: workflow } };
}

/** Whether any of the actor's homes has an entry for the event (most uses have none: no condition data built) */
function anyEntries(eventId: string, context: EventContext): boolean {
  return collectEntries(eventId, context).length > 0;
}

/** The step pass hook: raise the events of this pass (Workflow's engine host) */
export async function raiseUseEvents(workflow: Workflow, prePost: "pre" | "post", step: string | undefined): Promise<void> {
  const list = step ? USE_EVENTS[`${prePost} ${step}`] : undefined;
  if (!list || workflow.readOnly) return;
  for (const at of list) {
    if (workflow.aborted) return;
    if (at.when && !at.when(workflow)) continue;
    if (!at.targets) {
      const context = useContext(workflow);
      if (anyEntries(at.eventId, context)) await runEvent(at.eventId, context);
      continue;
    }
    for (const target of at.targets(workflow)) {
      const context = at.asUse ? useTargetContext(workflow, target) : targetContext(workflow, target);
      if (context && anyEntries(at.eventId, context)) await runEvent(at.eventId, context);
    }
  }
}

/** `use.configure`: before the use's checks and targeting; false when an entry aborted it */
export async function raiseUseConfigure(workflow: Workflow, usage: object): Promise<boolean> {
  const context = useContext(workflow, { usage });
  if (!anyEntries("use.configure", context)) return true;
  await runEvent("use.configure", context);
  return !workflow.aborted;
}

/** `damaged`: a target of the use took damage (with midi's isDamaged); `event.damage` is its damage entry */
export async function raiseDamaged(workflow: Workflow, target: TokenDocument.Implementation | undefined, damage: Record<string, unknown>): Promise<void> {
  if (!target || workflow.readOnly) return;
  const context = targetContext(workflow, target, { damage });
  if (context && anyEntries("damaged", context)) await runEvent("damaged", context);
  await raiseDealsDamage(workflow, target);
}

/* What the use's entries contributed */

interface UseContributions {
  modifiers: { actorUuid: string, rolls?: readonly RollKind[], modifier: RollModifier }[];
  damage: DamageContribution[];
  damageChanges: { targetUuid?: string, stage: DamageStage, change: DamageChange }[];
}

const contributions = new WeakMap<Workflow, UseContributions>();

/** A modifier this use gives an actor's rolls (a use option's: Careful Spell's success on a target's save) */
export function addUseRollModifier(workflow: Workflow, actorUuid: string, modifier: RollModifier, rolls?: readonly RollKind[]): void {
  contributionsOf(workflow).modifiers.push({ actorUuid, rolls, modifier });
}

function contributionsOf(workflow: Workflow): UseContributions {
  let found = contributions.get(workflow);
  if (!found) contributions.set(workflow, found = { modifiers: [], damage: [], damageChanges: [] });
  return found;
}

/** What the entry is called on a card: the action's label, else its document's name */
function labelOf(run: ActionRun): string {
  const label = run.action.label;
  return typeof label === "string" ? label : (run.found.document as { name?: string }).name ?? run.found.entry.id;
}

/**
 * Whose `for`/`to` names: "self" the entry's actor (the user at a use event, the bearer at a target event),
 * "target" the event's target or else every target of the use, "attacker"/"event.actor" the use's actor.
 */
export function actorsFor(spec: unknown, run: ActionRun, fallback: "self" | "target"): Actor.Implementation[] {
  const { context, found } = run;
  const which = typeof spec === "string" ? spec : fallback;
  switch (which) {
    case "self": return [found.actor ?? context.actor];
    case "attacker":
    case "event.actor": return context.workflow?.actor ? [context.workflow.actor] : [];
    case "target": {
      if (context.target?.actor) return [context.target.actor];
      return documents(context.workflow?.targets).map(t => t.actor).filter((a): a is Actor.Implementation => !!a);
    }
    default: {
      // A choice of targets (Careful Spell's): those the player chose
      const chosen = (run.conditionData.choices as Record<string, unknown> | undefined)?.[which] ?? context.workflow?.choices[which];
      if (Array.isArray(chosen)) return chosen.map(uuid => (fromUuidSync(String(uuid)) as TokenDocument.Implementation | null)?.actor).filter((a): a is Actor.Implementation => !!a);
      console.warn(`midi-qol | entry ${found.entry.id}: unknown for/to "${which}"`);
      return [];
    }
  }
}

function targetDocumentsFor(spec: unknown, run: ActionRun): TokenDocument.Implementation[] | undefined {
  const which = typeof spec === "string" ? spec : "target";
  if (which !== "target") return [];
  return run.context.target ? [run.context.target] : undefined;
}

const MODIFIER_EFFECTS = new Set<RollModifierEffect>(["advantage", "disadvantage", "noAdvantage", "noDisadvantage", "critical", "noCritical", "fumble", "noFumble", "success", "fail", "min", "max"]);

function rollKinds(value: unknown): readonly RollKind[] | undefined {
  return value === undefined ? undefined : [value].flat() as RollKind[];
}

function modifierOf(run: ActionRun): RollModifier | undefined {
  const effect = run.action.modifier as RollModifierEffect;
  if (!MODIFIER_EFFECTS.has(effect)) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: unknown modifier ${String(effect)}`);
    return undefined;
  }
  const value = typeof run.action.value === "number" ? run.action.value : undefined;
  return { effect, value, label: labelOf(run), source: `${(run.found.document as { uuid?: string }).uuid ?? ""}#${run.found.entry.id}` };
}

/** `{ modifier, rolls?, for? }` at a use or target event: on the rolls of the use it names (default: the entry's actor) */
async function modifierAction(run: ActionRun) {
  const workflow = run.context.workflow;
  if (!workflow || !isUseEvent(run.eventId)) return;
  const modifier = modifierOf(run);
  if (!modifier) return;
  const rolls = rollKinds(run.action.rolls);
  for (const actor of actorsFor(run.action.for, run, "self")) if (actor.uuid) contributionsOf(workflow).modifiers.push({ actorUuid: actor.uuid, rolls, modifier });
}

async function rolled(formula: string, rollData: Record<string, unknown>): Promise<number> {
  const roll = await new Roll(formula, rollData).evaluate();
  return roll.total ?? 0;
}

/** `{ damage | heal: formula, type?, to? }` at a use event: damage the use deals (its damage step), to the target or every target hit */
/** Target events after the use's damage is rolled: healing there heals the bearer at once (Black Absorbing Tattoo) */
const AFTER_DAMAGE = new Set(["damaging", "damaged", "healing"]);

async function healNow(run: ActionRun, formula: string, actor = run.context.target?.actor) {
  if (!actor?.uuid) return;
  const amount = Math.max(0, Math.floor(await rolled(formula, run.conditionData)));
  if (!amount) return;
  // @ts-expect-error no dnd5e-types
  const hp = actor.system.attributes.hp as { value: number, max: number, effectiveMax?: number };
  const value = Math.min(hp.effectiveMax ?? hp.max, hp.value + amount);
  const updates: Record<string, unknown> = { "system.attributes.hp.value": value };
  if (actor.isOwner) await actor.update(updates);
  else await unTimedExecuteAsGM("updateActor", { actorUuid: actor.uuid, updates });
}

/** Damage to the entry's bearer itself (a feature that costs its user hit points): applied at once, through midi's damage */
async function damageSelfNow(run: ActionRun, formula: string, actor: Actor.Implementation | undefined, scene: Scene.Implementation | null | undefined) {
  const token = actor ? tokenFor(actor, { scene: scene ?? undefined }) : undefined;
  if (!token) return;
  const amount = Math.max(0, Math.floor(await rolled(formula, run.conditionData)));
  if (!amount) return;
  const type = typeof run.action.type === "string" ? run.action.type : "none";
  await applyTokenDamage([{ type, value: amount, properties: new Set<string>() }], amount, new Set([token]), undefined, new Set(),
    { forceApply: true, label: "defaultDamage", existingDamage: [], superSavers: new Set(), semiSuperSavers: new Set() });
}

export async function useDamageAction(run: ActionRun, healing: boolean) {
  const workflow = run.context.workflow;
  if (!workflow) return;
  const formula = healing ? run.action.heal : run.action.damage;
  if (typeof formula !== "string") return;
  if (healing && run.context.target && AFTER_DAMAGE.has(run.eventId)) return healNow(run, formula);
  // Healing the entry's bearer itself (Blessed Healer): at once, not part of the use's damage
  if (healing && run.action.to === "self") return healNow(run, formula, (run.found.actor ?? workflow.actor) as Actor.Implementation | undefined);
  if (!healing && run.action.to === "self" && formula !== "activity")
    return damageSelfNow(run, formula, (run.found.actor ?? workflow.actor) as Actor.Implementation | undefined, workflow.token?.document?.parent as Scene.Implementation | null | undefined);
  const targets = targetDocumentsFor(run.action.to, run);
  if (targets && !targets.length) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: damage at ${run.eventId} goes to the use's targets ("to": "target")`);
    return;
  }
  const targetUuids = targets?.map(t => t.uuid).filter((uuid): uuid is string => !!uuid);
  // "activity": the damage parts of the entry's activity (Menacing Attack's superiority die), with its roll data
  if (formula === "activity") {
    const activity = run.found.entry.activity ? entryActivity(run.found, run.found.entry.activity) : undefined;
    const parts = (activity as { damage?: { parts?: { formula?: string, types?: Set<string> }[] } } | undefined)?.damage?.parts ?? [];
    if (!parts.length) console.warn(`midi-qol | entry ${run.found.entry.id}: damage "activity" but its activity ${run.found.entry.activity ?? "(none)"} has no damage`);
    const rollData = activity?.getRollData() ?? {};
    for (const part of parts) {
      if (!part.formula) continue;
      contributionsOf(workflow).damage.push({ role: "midi-qol.entries", formula: Roll.replaceFormulaData(part.formula, rollData, { missing: "0" }),
        damageType: [...(part.types ?? [])][0], label: labelOf(run), targets: targetUuids, ...(run.action.critical === false ? { critical: false as const } : {}) });
    }
    return;
  }
  const type = typeof run.action.type === "string" ? run.action.type : healing ? "healing" : undefined;
  // `critical: false`: never critical (default: as the use's damage roll); healing never is
  contributionsOf(workflow).damage.push({ role: "midi-qol.entries", formula, damageType: type, label: labelOf(run), targets: targetUuids,
    ...(run.action.critical === false || healing ? { critical: false as const } : {}) });
}

/** `{ damageChange: { stage, amount?, multiplier?, types? }, for? }`: a change to the damage a target takes (the event's target, else every target) */
async function damageChangeAction(run: ActionRun) {
  const workflow = run.context.workflow;
  const spec = run.action.damageChange as { stage?: DamageStage, amount?: number | string, multiplier?: number | string, types?: string[] } | undefined;
  if (!workflow || !spec || typeof spec !== "object") return;
  const stage = spec.stage ?? "complete";
  if (!DAMAGE_STAGES.includes(stage)) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: unknown damage stage ${stage}`);
    return;
  }
  const changeFor = async (rollData: Record<string, unknown>): Promise<DamageChange> => {
    const amount = typeof spec.amount === "string" ? await rolled(spec.amount, rollData) : spec.amount;
    const multiplier = typeof spec.multiplier === "string" ? await rolled(spec.multiplier, rollData) : spec.multiplier;
    return { label: labelOf(run), ...(amount !== undefined ? { amount } : {}), ...(multiplier !== undefined ? { multiplier } : {}), ...(spec.types ? { types: spec.types } : {}) };
  };
  const store = contributionsOf(workflow).damageChanges;
  const target = run.context.target;
  if (target) {
    store.push({ targetUuid: target.uuid ?? undefined, stage, change: await changeFor(run.conditionData) });
    return;
  }
  if (typeof run.action.for === "string" && run.action.for !== "target") {
    // A choice of targets (Careful Spell's): those the player chose
    const chosen = (run.conditionData.choices as Record<string, unknown> | undefined)?.[run.action.for] ?? workflow.choices[run.action.for];
    if (!Array.isArray(chosen)) {
      console.warn(`midi-qol | entry ${run.found.entry.id}: damageChange for "${run.action.for}": not a target or a choice of targets`);
      return;
    }
    for (const uuid of chosen) store.push({ targetUuid: String(uuid), stage, change: await changeFor(targetRollData(run.conditionData, String(uuid))) });
    return;
  }
  // At a use event, a formula is worked out for each target (Magic Missile's darts: an allocation read as that
  // target's share); a plain number is one change for all
  const perTarget = [spec.amount, spec.multiplier].some(value => typeof value === "string" && value.includes("@"));
  if (!perTarget) {
    store.push({ stage, change: await changeFor(run.conditionData) });
    return;
  }
  for (const token of documents(workflow.targets)) {
    if (!token.uuid) continue;
    store.push({ targetUuid: token.uuid, stage, change: await changeFor(targetRollData(run.conditionData, token.uuid)) });
  }
}

/** Condition data for one target: an allocation choice ({ uuid: count }) reads as that target's count */
function targetRollData(conditionData: Record<string, unknown>, targetUuid: string): Record<string, unknown> {
  const choices = (conditionData.choices ?? {}) as Record<string, unknown>;
  const own: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(choices)) {
    own[id] = value && typeof value === "object" && !Array.isArray(value) && targetUuid in value ? (value as Record<string, unknown>)[targetUuid] : value;
  }
  return { ...conditionData, choices: own };
}

/**
 * `{ bonus: BonusEffect, rolls? }` at a use or target event: applied to the use's attack roll as it stands (at
 * `attacked`, a target giving the attacker disadvantage: 2024 Lucky; at `use.missed`, a reroll). A roll event's
 * bonus is a rollBonuses candidate instead (lib/entries/rollBonuses.ts).
 */
async function bonusAction(run: ActionRun) {
  const workflow = run.context.workflow;
  const effect = run.action.bonus as BonusEffect | undefined;
  if (!workflow || !isUseEvent(run.eventId) || !effect || typeof effect !== "object") return;
  const rolls = rollKinds(run.action.rolls);
  // An AC bonus at a target event: this attack's AC for the target (the reaction site adds it)
  if (rolls?.includes("ac" as RollKind)) {
    const target = run.context.target;
    if (!target?.uuid || effect.kind !== "add") return;
    const change = await rolled(effect.formula, run.conditionData);
    const byTarget = acChanges.get(workflow) ?? new Map<string, number>();
    byTarget.set(target.uuid, (byTarget.get(target.uuid) ?? 0) + change);
    acChanges.set(workflow, byTarget);
    return;
  }
  // On the use's damage once rolled (Empowered Spell, Empowered Evocation): an add or a reroll of chosen dice goes to
  // the first damage roll, any other bonus to each
  if (run.eventId === "use.damageRolled" || ([run.action.rolls].flat().includes("damage") && !rolls?.includes("attack"))) {
    const damageRolls = workflow.damageRolls ?? [];
    if (!damageRolls.length) return;
    // Chosen dice (Empowered Spell): picked by the roller from all the use's damage rolls
    if (effect.kind === "reroll" && effect.dice === "choose") {
      const changed = await rerollChosenDice(run, damageRolls, effect);
      if (changed.some((roll, index) => roll !== damageRolls[index])) await workflow.setDamageRolls(changed);
      return;
    }
    // "One damage roll" (Empowered Evocation's add): the first
    const onlyFirst = effect.kind === "add";
    const changed: Roll[] = [];
    for (const [index, roll] of damageRolls.entries()) changed.push(onlyFirst && index > 0 ? roll : await applyBonusEffect(roll, effect, run.conditionData, labelOf(run)));
    if (changed.some((roll, index) => roll !== damageRolls[index])) await workflow.setDamageRolls(changed);
    return;
  }
  if (rolls && !rolls.includes("attack")) return;
  if (!workflow.attackRoll) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: no attack roll at ${run.eventId} for its bonus`);
    return;
  }
  const changed = effect.kind === "reroll" && effect.dice === "choose" ? (await rerollChosenDice(run, [workflow.attackRoll], effect))[0]
    : await applyBonusEffect(workflow.attackRoll, effect, run.conditionData, labelOf(run));
  if (changed !== workflow.attackRoll) await workflow.setAttackRoll(changed);
}

/** A "choose" reroll (Empowered Spell): the roller picks up to `max` of the rolls' dice (the diceReroll service) */
async function rerollChosenDice(run: ActionRun, rolls: Roll[], effect: Extract<BonusEffect, { kind: "reroll" }>): Promise<Roll[]> {
  const max = await rolled(String(effect.max ?? 1), { ...(rolls[0]?.data as Record<string, unknown> ?? {}), ...run.conditionData });
  const keep = effect.keep === "higher" || effect.keep === "lower" ? effect.keep : "new";
  const workflow = run.context.workflow;
  return rerollDice(rolls, { max, keep, title: labelOf(run), actor: workflow?.actor, tokenUuid: workflow?.token?.document?.uuid ?? undefined, owner: workflow });
}

/** `{ abort: reason }`: the use stops (at use.configure, before anything is spent) */
async function abortAction(run: ActionRun) {
  const workflow = run.context.workflow;
  if (!workflow || !isUseEvent(run.eventId)) return;
  const reason = typeof run.action.abort === "string" ? run.action.abort : labelOf(run);
  ui.notifications?.warn(`${workflow.activity?.name ?? workflow.item?.name}: ${reason}`);
  workflow.aborted = true;
}

/** A damage change for one target of the use (M29 transfer: what moves to another creature or a pool) */
export function addTargetDamageChange(workflow: Workflow, targetUuid: string, stage: DamageStage, change: DamageChange): void {
  contributionsOf(workflow).damageChanges.push({ targetUuid, stage, change });
}

/** AC changes the target's entries made for this use's attack, not yet taken by the hit check */
const acChanges = new WeakMap<Workflow, Map<string, number>>();

/** The AC change waiting for the target (and cleared) */
export function takeACChange(workflow: Workflow, target: TokenDocument.Implementation): number {
  const byTarget = acChanges.get(workflow);
  const change = target.uuid ? byTarget?.get(target.uuid) ?? 0 : 0;
  if (target.uuid) byTarget?.delete(target.uuid);
  return change;
}

/* midi's contributors over the use's contributions */

/** rollModifiers: the use's modifiers for this roller, and the roller's `roll.preRoll` entries with a modifier action */
async function entryRollModifiers(query: RollQuery): Promise<RollModifier[]> {
  const found: RollModifier[] = [];
  if (query.workflow) {
    for (const m of contributions.get(query.workflow)?.modifiers ?? []) {
      if (m.actorUuid === query.actor.uuid && (!m.rolls || m.rolls.includes(query.kind))) found.push(m.modifier);
    }
  }
  const context: EventContext = { actor: query.actor, workflow: query.workflow, activity: query.activity, item: query.item, event: { kind: query.kind, ability: query.ability, skill: query.skill, tool: query.tool, use: query.workflow } };
  for (const f of collectEntries("roll.preRoll", context)) {
    if ((f.entry.offer ?? "always") !== "always") continue;
    const actions = f.entry.do.filter(action => "modifier" in action);
    if (!actions.length || !limitAllows(f, context)) continue;
    const conditionData = conditionDataFor(f, context);
    if (!await entryHolds(f, conditionData)) continue;
    let used = false;
    for (const action of actions) {
      const rolls = rollKinds(action.rolls);
      if (rolls && !rolls.includes(query.kind)) continue;
      if (!await holds(action.if, conditionData)) continue;
      const modifier = modifierOf({ eventId: "roll.preRoll", action, found: f, context, conditionData });
      if (modifier) { found.push(modifier); used = true; }
    }
    if (used && !query.preview) await spendEntryLimit(f, context);
  }
  return found;
}

function workflowOfDamage(options: { midi?: { itemCardUuid?: string } }): Workflow | undefined {
  const uuid = options?.midi?.itemCardUuid;
  return uuid ? Workflow.getWorkflow(uuid) : undefined;
}

/** For the tests and the why: what the use's entries contributed */
export function useContributions(workflow: Workflow): Readonly<UseContributions> | undefined {
  return contributions.get(workflow);
}

export function registerUseEvents() {
  registerEvent("use.configure", { label: "A use starts, before its checks, targets and costs" });
  registerEvent("use.targeted", { label: "The use's targets are chosen" });
  registerEvent("use.attack", { label: "Before the use's attack roll" });
  registerEvent("use.hit", { label: "The use's attack hit a target" });
  registerEvent("use.missed", { label: "The use's attack missed every target" });
  registerEvent("use.damageRoll", { label: "The use's damage is rolled (damage added here joins it)" });
  registerEvent("use.damageRolled", { label: "The use's damage was rolled" });
  registerEvent("use.saves", { label: "Before the use's targets are asked to save" });
  registerEvent("use.effects", { label: "Before the use's effects are applied" });
  registerEvent("use.end", { label: "The use finished" });
  registerEvent("use.target.hit", { label: "Each target the use's attack hit (the use's own entries; the target as target)" });
  registerEvent("use.target.missed", { label: "Each target the use's attack missed" });
  registerEvent("use.target.saveFailed", { label: "Each target that failed its save against the use" });
  registerEvent("use.target.saveSucceeded", { label: "Each target that made its save against the use" });
  registerEvent("use.target.each", { label: "Each of the use's targets, once the use is done" });
  registerEvent("targeted", { label: "The bearer is targeted by a use" });
  registerEvent("attacked", { label: "The bearer is attacked: the roll is made, the result not yet known" });
  registerEvent("hit", { label: "The bearer is hit by an attack" });
  registerEvent("missed", { label: "The bearer is missed by an attack" });
  registerEvent("saveRequested", { label: "The bearer is about to be asked to save against a use" });
  registerEvent("saveFailed", { label: "The bearer failed its save against a use" });
  registerEvent("saveSucceeded", { label: "The bearer made its save against a use" });
  registerEvent("damaging", { label: "The bearer is about to take a use's damage (event.damage: worked out, not applied)" });
  registerEvent("healing", { label: "The bearer is about to be healed by a use" });
  registerEvent("damaged", { label: "The bearer took a use's damage" });
  registerEvent("roll.preRoll", { label: "Before the bearer's roll (modifiers and bonuses)" });
  registerEvent("roll.preResult", { label: "The bearer's roll is made, before its result (bonuses)" });
  registerEvent("roll.postResult", { label: "After the bearer's roll's result (bonuses)" });
  registerAction("modifier", modifierAction);
  registerAction("damageChange", damageChangeAction);
  registerAction("abort", abortAction);
  registerAction("bonus", bonusAction);
  registerAction("heal", run => useDamageAction(run, true));
  register("rollModifiers", "midi-qol.entries", { for: entryRollModifiers }, { label: "Midi-QOL: entries" });
  register("damageContributions", "midi-qol.entries", {
    for: ({ workflow }) => workflow instanceof Workflow ? [...(contributions.get(workflow)?.damage ?? [])] : []
  }, { label: "Midi-QOL: entries" });
  register("damageModifiers", "midi-qol.entries", {
    stage: DAMAGE_STAGES,
    for: ({ stage, options }) => {
      const workflow = workflowOfDamage(options as { midi?: { itemCardUuid?: string } });
      const targetUuid = (options as { midi?: { targetUuid?: string } }).midi?.targetUuid;
      return contributions.get(workflow!)?.damageChanges
        .filter(c => c.stage === stage && (!c.targetUuid || c.targetUuid === targetUuid)).map(c => c.change);
    }
  }, { label: "Midi-QOL: entries" });
}
