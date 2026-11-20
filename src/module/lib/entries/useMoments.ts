import { register } from "../../api/services.js";
import { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import type { RollKind, RollModifier, RollModifierEffect, RollQuery } from "../../services/rollModifiers/service.js";
import type { DamageContribution } from "../../services/damageContributions/service.js";
import type { DamageChange, DamageStage } from "../../services/damageModifiers/rules.js";
import { DAMAGE_STAGES } from "../../services/damageModifiers/rules.js";
import { applyBonusEffect, type BonusEffect } from "../../services/rollBonuses/service.js";
import { collectEntries, conditionDataFor, entryHolds, holds, limitAllows, registerAction, registerMoment, runMoment, spendEntryLimit, type ActionRun, type MomentContext } from "./engine.js";

/*
 * M15 stage 4a: the use moments and the target moments, and the actions that contribute to a use. A use moment is
 * raised for the use's actor (`who: "this"` / `"owner"`, an effect's bearer); a target moment for each target, the
 * target as the actor and the attacker's use as `event.use`. Both are raised from the step passes (USE_MOMENTS),
 * `use.configure` from prepareUse and `damaged` with midi's isDamaged.
 * A contribution an action makes (a roll modifier, damage, a damage change) is kept on the use and read by midi's
 * contributors when the service asks (as rollBonuses' targeted damage bonuses are), so it applies on whichever client
 * asks, as long as the use is known there.
 */

type TargetsOf = (workflow: Workflow) => TokenDocument.Implementation[];

interface MomentAt {
  moment: string;
  /** For each of these targets (a target moment); a use moment when absent */
  targets?: TargetsOf;
  when?: (workflow: Workflow) => boolean;
}

const documents = (set: { documents?: TokenDocument.Implementation[] } | undefined) => set?.documents ?? [];
const allTargets: TargetsOf = w => documents(w.targets);
const hitTargets: TargetsOf = w => [...new Set([...documents(w.hitTargets), ...documents(w.hitTargetsEC)])];
const attacks = (w: Workflow) => !!w.activity?.attack;

/** The moments each step pass raises, by "pre"/"post" and step id */
const USE_MOMENTS: Record<string, MomentAt[]> = {
  "post midi-qol.PreambleComplete": [{ moment: "use.targeted" }, { moment: "targeted", targets: allTargets }],
  "pre midi-qol.WaitForAttackRoll": [{ moment: "use.attack", when: attacks }],
  "pre midi-qol.AttackRollComplete": [{ moment: "attacked", targets: allTargets, when: w => attacks(w) && !!w.attackRoll }],
  "post midi-qol.AttackRollComplete": [
    { moment: "use.hit", when: w => attacks(w) && hitTargets(w).length > 0 },
    { moment: "use.missed", when: w => attacks(w) && !!w.attackRoll && hitTargets(w).length === 0 },
    { moment: "hit", targets: hitTargets, when: attacks }
  ],
  "pre midi-qol.DamageRollStarted": [{ moment: "use.damageRoll" }],
  "post midi-qol.DamageRollComplete": [{ moment: "use.damageRolled" }],
  "pre midi-qol.WaitForSaves": [{ moment: "use.saves", when: w => !!w.saveActivity }, { moment: "saveRequested", targets: hitTargets, when: w => !!w.saveActivity }],
  "pre midi-qol.AllRollsComplete": [{ moment: "damaging", targets: hitTargets, when: w => !!w.damageRolls?.length }],
  "pre midi-qol.ApplyDynamicEffects": [{ moment: "use.effects" }],
  "post midi-qol.RollFinished": [{ moment: "use.end" }]
};

const USE_MOMENT_IDS = new Set(["use.configure", ...Object.values(USE_MOMENTS).flat().map(m => m.moment), "damaged"]);
const TARGET_MOMENT_IDS = new Set(Object.values(USE_MOMENTS).flat().filter(m => m.targets).map(m => m.moment).concat("damaged"));

/** A moment raised by a use (its contributions go to the use) */
export function isUseMoment(moment: string): boolean { return USE_MOMENT_IDS.has(moment); }

/** The context of a use moment: the user's */
export function useContext(workflow: Workflow, event: Record<string, unknown> = {}): MomentContext {
  return { actor: workflow.actor, workflow, activity: workflow.activity as Activity, item: workflow.item, event };
}

/** The context of a target moment: the target is the actor; the user's use is `event.use` */
function targetContext(workflow: Workflow, target: TokenDocument.Implementation, event: Record<string, unknown> = {}): MomentContext | undefined {
  const actor = target.actor;
  if (!actor) return undefined;
  return { actor, workflow, target, event: { ...event, actor: workflow.actor, token: workflow.token?.document ?? workflow.token, use: workflow } };
}

/** Whether any of the actor's homes has an entry for the moment (most uses have none: no condition data built) */
function anyEntries(moment: string, context: MomentContext): boolean {
  return collectEntries(moment, context).length > 0;
}

/** The step pass hook: raise the moments of this pass (Workflow's engine host) */
export async function raiseUseMoments(workflow: Workflow, prePost: "pre" | "post", step: string | undefined): Promise<void> {
  const list = step ? USE_MOMENTS[`${prePost} ${step}`] : undefined;
  if (!list || workflow.readOnly) return;
  for (const at of list) {
    if (workflow.aborted) return;
    if (at.when && !at.when(workflow)) continue;
    if (!at.targets) {
      const context = useContext(workflow);
      if (anyEntries(at.moment, context)) await runMoment(at.moment, context);
      continue;
    }
    for (const target of at.targets(workflow)) {
      const context = targetContext(workflow, target);
      if (context && anyEntries(at.moment, context)) await runMoment(at.moment, context);
    }
  }
}

/** `use.configure`: before the use's checks and targeting; false when an entry aborted it */
export async function raiseUseConfigure(workflow: Workflow, usage: object): Promise<boolean> {
  const context = useContext(workflow, { usage });
  if (!anyEntries("use.configure", context)) return true;
  await runMoment("use.configure", context);
  return !workflow.aborted;
}

/** `damaged`: a target of the use took damage (with midi's isDamaged); `event.damage` is its damage entry */
export async function raiseDamaged(workflow: Workflow, target: TokenDocument.Implementation | undefined, damage: Record<string, unknown>): Promise<void> {
  if (!target || workflow.readOnly) return;
  const context = targetContext(workflow, target, { damage });
  if (context && anyEntries("damaged", context)) await runMoment("damaged", context);
}

/* What the use's entries contributed */

interface UseContributions {
  modifiers: { actorUuid: string, rolls?: readonly RollKind[], modifier: RollModifier }[];
  damage: DamageContribution[];
  damageChanges: { targetUuid?: string, stage: DamageStage, change: DamageChange }[];
}

const contributions = new WeakMap<Workflow, UseContributions>();

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
 * Whose `for`/`to` names: "self" the entry's actor (the user at a use moment, the bearer at a target moment),
 * "target" the moment's target or else every target of the use, "attacker"/"event.actor" the use's actor.
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
    default:
      console.warn(`midi-qol | entry ${found.entry.id}: unknown for/to "${which}"`);
      return [];
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

/** `{ modifier, rolls?, for? }` at a use or target moment: on the rolls of the use it names (default: the entry's actor) */
async function modifierAction(run: ActionRun) {
  const workflow = run.context.workflow;
  if (!workflow || !isUseMoment(run.moment)) return;
  const modifier = modifierOf(run);
  if (!modifier) return;
  const rolls = rollKinds(run.action.rolls);
  for (const actor of actorsFor(run.action.for, run, "self")) if (actor.uuid) contributionsOf(workflow).modifiers.push({ actorUuid: actor.uuid, rolls, modifier });
}

async function rolled(formula: string, rollData: Record<string, unknown>): Promise<number> {
  const roll = await new Roll(formula, rollData).evaluate();
  return roll.total ?? 0;
}

/** `{ damage | heal: formula, type?, to? }` at a use moment: damage the use deals (its damage step), to the target or every target hit */
export async function useDamageAction(run: ActionRun, healing: boolean) {
  const workflow = run.context.workflow;
  if (!workflow) return;
  const formula = healing ? run.action.heal : run.action.damage;
  if (typeof formula !== "string") return;
  const targets = targetDocumentsFor(run.action.to, run);
  if (targets && !targets.length) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: damage at ${run.moment} goes to the use's targets ("to": "target")`);
    return;
  }
  const type = typeof run.action.type === "string" ? run.action.type : healing ? "healing" : undefined;
  contributionsOf(workflow).damage.push({ role: "midi-qol.entries", formula, damageType: type, label: labelOf(run), targets: targets?.map(t => t.uuid).filter((uuid): uuid is string => !!uuid) });
}

/** `{ damageChange: { stage, amount?, multiplier?, types? }, for? }`: a change to the damage a target takes (the moment's target, else every target) */
async function damageChangeAction(run: ActionRun) {
  const workflow = run.context.workflow;
  const spec = run.action.damageChange as { stage?: DamageStage, amount?: number | string, multiplier?: number | string, types?: string[] } | undefined;
  if (!workflow || !spec || typeof spec !== "object") return;
  const stage = spec.stage ?? "complete";
  if (!DAMAGE_STAGES.includes(stage)) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: unknown damage stage ${stage}`);
    return;
  }
  const rollData = run.conditionData;
  const amount = typeof spec.amount === "string" ? await rolled(spec.amount, rollData) : spec.amount;
  const multiplier = typeof spec.multiplier === "string" ? await rolled(spec.multiplier, rollData) : spec.multiplier;
  const change: DamageChange = { label: labelOf(run), ...(amount !== undefined ? { amount } : {}), ...(multiplier !== undefined ? { multiplier } : {}), ...(spec.types ? { types: spec.types } : {}) };
  const store = contributionsOf(workflow).damageChanges;
  const target = run.context.target;
  if (target) store.push({ targetUuid: target.uuid ?? undefined, stage, change });
  else if (typeof run.action.for === "string" && run.action.for !== "target") console.warn(`midi-qol | entry ${run.found.entry.id}: damageChange is for the use's targets`);
  else store.push({ stage, change });
}

/**
 * `{ bonus: BonusEffect, rolls? }` at a use or target moment: applied to the use's attack roll as it stands (at
 * `attacked`, a target giving the attacker disadvantage: 2024 Lucky; at `use.missed`, a reroll). A roll moment's
 * bonus is a rollBonuses candidate instead (lib/entries/rollBonuses.ts).
 */
async function bonusAction(run: ActionRun) {
  const workflow = run.context.workflow;
  const effect = run.action.bonus as BonusEffect | undefined;
  if (!workflow || !isUseMoment(run.moment) || !effect || typeof effect !== "object") return;
  const rolls = rollKinds(run.action.rolls);
  if (rolls && !rolls.includes("attack")) return;
  if (!workflow.attackRoll) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: no attack roll at ${run.moment} for its bonus`);
    return;
  }
  const changed = await applyBonusEffect(workflow.attackRoll, effect, run.conditionData, labelOf(run));
  if (changed !== workflow.attackRoll) await workflow.setAttackRoll(changed);
}

/** `{ abort: reason }`: the use stops (at use.configure, before anything is spent) */
async function abortAction(run: ActionRun) {
  const workflow = run.context.workflow;
  if (!workflow || !isUseMoment(run.moment)) return;
  const reason = typeof run.action.abort === "string" ? run.action.abort : labelOf(run);
  ui.notifications?.warn(`${workflow.activity?.name ?? workflow.item?.name}: ${reason}`);
  workflow.aborted = true;
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
  const context: MomentContext = { actor: query.actor, workflow: query.workflow, activity: query.activity, item: query.item, event: { kind: query.kind, ability: query.ability, skill: query.skill, tool: query.tool, use: query.workflow } };
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
      const modifier = modifierOf({ moment: "roll.preRoll", action, found: f, context, conditionData });
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

export function registerUseMoments() {
  registerMoment("use.configure", { label: "A use starts, before its checks, targets and costs" });
  registerMoment("use.targeted", { label: "The use's targets are chosen" });
  registerMoment("use.attack", { label: "Before the use's attack roll" });
  registerMoment("use.hit", { label: "The use's attack hit a target" });
  registerMoment("use.missed", { label: "The use's attack missed every target" });
  registerMoment("use.damageRoll", { label: "The use's damage is rolled (damage added here joins it)" });
  registerMoment("use.damageRolled", { label: "The use's damage was rolled" });
  registerMoment("use.saves", { label: "Before the use's targets are asked to save" });
  registerMoment("use.effects", { label: "Before the use's effects are applied" });
  registerMoment("use.end", { label: "The use finished" });
  registerMoment("targeted", { label: "The bearer is targeted by a use" });
  registerMoment("attacked", { label: "The bearer is attacked: the roll is made, the result not yet known" });
  registerMoment("hit", { label: "The bearer is hit by an attack" });
  registerMoment("saveRequested", { label: "The bearer is about to be asked to save against a use" });
  registerMoment("damaging", { label: "The bearer is about to take a use's damage" });
  registerMoment("damaged", { label: "The bearer took a use's damage" });
  registerMoment("roll.preRoll", { label: "Before the bearer's roll (modifiers and bonuses)" });
  registerMoment("roll.preResult", { label: "The bearer's roll is made, before its result (bonuses)" });
  registerMoment("roll.postResult", { label: "After the bearer's roll's result (bonuses)" });
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
