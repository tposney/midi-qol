import { MODULE_ID, i18n } from "../../../midi-qol.js";
import { Registry } from "../../api/registry.js";
import type { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import { checkMechanic, configSettings, safeGetGameSetting } from "../../settings.js";
import { checkIncapacitated, createConditionData, evalCondition, hasNoReactionsMarker } from "../../utils.js";
import { tagValue } from "../../lib/tags.js";
import { cost, type UseCost } from "./cost.js";
import { budget, type BudgetKindId, budgetKinds } from "./ledger.js";

/*
 * Why a use is not legal now (M4 stage 4; plan ~/Documents/midi-next-M4-plan-2026-11-20.md): `issues(activity)`
 * (MidiQOL.economy.issues) asks issue contributors (MidiQOL.economy.issueContributors.register), so the pre-use checks, and later
 * the HUD's greying-out, ask one place. midi's own: the budget (a reaction, bonus action or action already used up, or
 * dnd5e's No Reactions marker), the one-spell-slot-per-turn rule (dnd5e's modern rules), a spell's components
 * (`flags.midi-qol.fail.spell.*`: Silence and the like), incapacitated, a two-handed weapon's attack with a shield equipped.
 * What an issue does is its policy: off (not raised), show (tracked, nothing asked), warn (asked: use anyway?),
 * enforce (refused). An economy issue's comes from the actor type's policy (today's Enforce reactions / bonus actions
 * settings: none = off, display only = show, all or the actor's type = warn; actions and the spell rule: show); a rule
 * issue (components, incapacitated) carries its own.
 */

export type EconomyPolicy = "off" | "show" | "warn" | "enforce";

export interface UseIssue {
  id: string;
  label: string;
  /** The contributor that raised it */
  source: string;
  /** A budget issue's kind */
  kind?: BudgetKindId;
  /** What it does; absent: the economy policy of its kind (or show) */
  policy?: EconomyPolicy;
  /** Where a use acts on it: "use" (absent; before the use, useChecks), "validate" (the ValidateRoll step), "roll" (its
   * roll); a budget issue (kind) is the economy checks', after dnd5e's usage dialog */
  actedOn?: "use" | "validate" | "roll";
}

export interface IssueQuery {
  activity: Activity;
  actor: Actor.Implementation;
  workflow?: Workflow;
  target?: TokenDocument.Implementation;
  /** What the use costs (MidiQOL.economy.cost) */
  cost: UseCost;
}

export type IssueContributor = (query: IssueQuery) => UseIssue | UseIssue[] | undefined | Promise<UseIssue | UseIssue[] | undefined>;

const contributors = new Registry<IssueContributor>();

export function registerIssueContributor(id: string, contributor: IssueContributor, options: { priority?: number } = {}): () => void {
  contributors.set(id, contributor, { priority: options.priority });
  return () => { contributors.delete(id); };
}

/** The actor's economy policy for a budget kind: from Enforce reactions / Enforce bonus actions; the action: show */
export function economyPolicy(actor: Actor.Implementation, kind: BudgetKindId): EconomyPolicy {
  if (kind === "action") return "show";
  const setting = kind === "reaction" ? configSettings.enforceReactions : configSettings.enforceBonusActions;
  if (setting === "none") return "off";
  if (setting === "displayOnly") return "show";
  if (setting === "all" || setting === actor.type) return "warn";
  return "off";
}

/** What an issue does for this actor */
export function issuePolicy(issue: UseIssue, actor: Actor.Implementation): EconomyPolicy {
  return issue.policy ?? (issue.kind ? economyPolicy(actor, issue.kind) : "show");
}

/** Why `activity` can't be used now (MidiQOL.economy.issues); `only`: those issue ids */
export async function issues(activity: Activity, options: { workflow?: Workflow, target?: TokenDocument.Implementation, only?: readonly string[] } = {}): Promise<UseIssue[]> {
  const actor = options.workflow?.actor ?? activity.actor;
  if (!actor) return [];
  const query: IssueQuery = { activity, actor, workflow: options.workflow, target: options.target, cost: cost(activity, options.workflow) };
  const found: UseIssue[] = [];
  for (const entry of contributors.entries()) {
    try {
      const raised = await entry.value(query);
      for (const issue of [raised ?? []].flat()) {
        if (!options.only || options.only.includes(issue.id)) found.push({ ...issue, source: issue.source || entry.id });
      }
    } catch (err) {
      console.warn(`midi-qol | economy issue contributor ${entry.id} failed`, err);
    }
  }
  return found.filter(issue => issuePolicy(issue, actor) !== "off");
}

/* midi's issue contributors */

const BUDGET_ISSUES: Record<string, { id: string, label: string }> = {
  reaction: { id: "reactionUsed", label: "midi-qol.EnforceReactions.Content" },
  bonus: { id: "bonusActionUsed", label: "midi-qol.EnforceBonusActions.Content" },
  action: { id: "actionUsed", label: "midi-qol.Economy.ActionUsed" }
};

function budgetIssues({ actor, cost: due }: IssueQuery): UseIssue[] {
  const raised: UseIssue[] = [];
  for (const { id: kind, label } of budgetKinds()) {
    if (!due[kind]) continue;
    const used = budget(actor, kind).exhausted || (kind === "reaction" && hasNoReactionsMarker(actor));
    if (!used) continue;
    const own = BUDGET_ISSUES[kind];
    raised.push(own ? { id: own.id, label: i18n(own.label), source: "midi-qol.budget", kind }
      : { id: `${kind}Used`, label: i18n("midi-qol.Economy.KindUsed").replace("{kind}", label), source: "midi-qol.budget", kind });
  }
  return raised;
}

/** dnd5e's modern rules: one spell with a spell slot per turn */
function leveledSpellIssue({ actor, workflow }: IssueQuery): UseIssue | undefined {
  if (!workflow || safeGetGameSetting("dnd5e", "rulesVersion") !== "modern") return undefined;
  if (!(Number(tagValue(workflow, "use.spellSlot") ?? 0) > 0)) return undefined;
  if (!budget(actor, "action").counters.leveledSpell) return undefined;
  return { id: "leveledSpellThisTurn", label: i18n("midi-qol.Economy.LeveledSpellThisTurn"), source: "midi-qol.leveledSpell", kind: "action" };
}

/** A spell's components the caster can't provide (`flags.midi-qol.fail.spell.*`), and spells it can't cast at all */
async function componentIssues({ activity, actor }: IssueQuery): Promise<UseIssue[]> {
  // @ts-expect-error no dnd5e-types
  if (!activity.isSpell && activity.item?.system.type?.value !== "scroll") return [];
  const flags = actor.flags[MODULE_ID]?.fail?.spell;
  if (!flags) return [];
  const conditionData = createConditionData({ actor, activity });
  const fails = async (key: string) => !!flags[key] && !!await evalCondition(flags[key], conditionData, { errorReturn: false, async: true });
  // @ts-expect-error no dnd5e-types
  const properties: Set<string> = activity.item?.system.properties ?? new Set();
  const raised: UseIssue[] = [];
  const issue = (id: string, label: string): UseIssue => ({ id, label, source: "midi-qol.components", policy: "enforce" });
  if (await fails("all")) raised.push(issue("noSpell", "You are unable to cast the spell"));
  if (properties.has("vocal") && (await fails("verbal") || await fails("vocal"))) raised.push(issue("noVerbal", "You make no sound and the spell fails"));
  if (properties.has("somatic") && await fails("somatic")) raised.push(issue("noSomatic", "You can't make the gestures and the spell fails"));
  if (properties.has("material") && await fails("material")) raised.push(issue("noMaterial", "You can't use the material component and the spell fails"));
  return raised;
}

/** Incapacitated (midi's Incapacitated mechanic: enforce refuses, otherwise shown) */
function incapacitatedIssue({ actor, workflow }: IssueQuery): UseIssue | undefined {
  const mechanic = checkMechanic("incapacitated");
  if (mechanic === "nothing" || workflow?.workflowOptions?.allowIncapacitated) return undefined;
  const condition = checkIncapacitated(actor, false, false);
  if (!condition) return undefined;
  return { id: "incapacitated", label: String(condition), source: "midi-qol.incapacitated", policy: mechanic === "enforce" ? "enforce" : "show", actedOn: "validate" };
}

/** midi's Check two-handed: a two-handed weapon's attack is refused with a shield (the roll's check, asked up front) */
function handsIssue({ activity, actor }: IssueQuery): UseIssue | undefined {
  if (!configSettings.checkTwoHanded || activity.type !== "attack") return undefined;
  // @ts-expect-error no dnd5e-types
  if (!activity.item?.system.properties?.has("two")) return undefined;
  // @ts-expect-error no dnd5e-types
  if (!(actor.system.attributes?.ac?.shield > 0)) return undefined;
  return { id: "twoHandedShield", label: i18n("midi-qol.TwoHandedShieldWarning"), source: "midi-qol.hands", policy: "enforce", actedOn: "roll" };
}

export function registerMidiIssueContributors() {
  registerIssueContributor("midi-qol.budget", budgetIssues, { priority: 100 });
  registerIssueContributor("midi-qol.leveledSpell", leveledSpellIssue, { priority: 90 });
  registerIssueContributor("midi-qol.components", componentIssues, { priority: 80 });
  registerIssueContributor("midi-qol.incapacitated", incapacitatedIssue, { priority: 70 });
  registerIssueContributor("midi-qol.hands", handsIssue, { priority: 60 });
}

export const issueContributorsApi = { register: registerIssueContributor, entries: () => contributors.entries().map(entry => entry.id) };
