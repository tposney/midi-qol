import { checkMechanic, configSettings } from "../settings.js";
import type { Activity } from "../../globals.js";
import { DummyWorkflow, type AttributionEntry } from "../Workflow.js";
import { attributionMapToArray, checkActivityRange, computeTargetAC, getOrCreateTokenForActor, getToken, getTokenDocument, isRangeCheckable, activityHasAreaTarget, speakerFor } from "../utils.js";
import { getDistance } from "../services/distance/service.js";
import { isMidiActivityType } from "../activities/midiActivity.js";
import { setupCanSeeSense } from "../activities/useChecks.js";
import { cost, type UseCost } from "../services/economy/cost.js";
import { issues, type UseIssue } from "../services/economy/issues.js";
import { previewFlow } from "../steps/api.js";
import { attackBonusSources, labelD20Parts, type BonusSource } from "./rollParts.js";

/*
 * M16: what a use would do, before it is made (MidiQOL.preview): range, cover and AC, advantage and its sources, the
 * attack's make-up, the save's DC, the cost and what blocks it, the steps it would run. Nothing is rolled or written.
 * The rules are asked as for the use, through a stand-in workflow per target (a DummyWorkflow with no card, so it
 * stores nothing), filled the way a use fills it: sight (setupCanSeeSense), long range (the range check), flanking and
 * the advantage rules (checkAttackAdvantage). rollModifiers contributors see `preview: true` on their query.
 * Targets are TokenDocuments (a Token is converted); the attacker is `options.token`, else the actor's token.
 */

export interface PreviewTarget {
  uuid: string;
  name: string | null;
  /** Grid units, as midi measures it */
  distance?: number;
  /**
   * "normal", "dis" (long range: disadvantage) or "fail" (out of reach), for any activity with a range. `checked`: the
   * use would refuse a target out of range (the Check range setting; not for area targeting); long range gives
   * disadvantage only to ranged and thrown attacks.
   */
  range?: { result: string, range?: number, longRange?: number, checked: boolean };
  /** The AC the attack would be compared with, and its cover */
  ac?: { effective: number, base: number, cover: number, coverIgnored: boolean };
  /** -1 disadvantage, 0 normal, 1 advantage, and why */
  advantage?: { mode: number, attribution: AttributionEntry[] };
  /** The attacker sees the target / the target sees the attacker */
  sees: boolean;
  seen: boolean;
}

export interface UsePreview {
  activity: string;
  cost: UseCost;
  issues: UseIssue[];
  /** The attack's make-up, before the d20: each part labelled, and the sources behind the Roll Bonus */
  attack?: { formula: string, bonusSources: BonusSource[] };
  save?: { dc?: number, abilities: string[] };
  steps: string[];
  targets: PreviewTarget[];
}

type PreviewOptions = { token?: Token.Implementation | TokenDocument.Implementation };

function attackMakeUp(activity: Activity): UsePreview["attack"] {
  // @ts-expect-error no dnd5e-types
  const data: { parts?: string[], data?: Record<string, unknown> } | undefined = activity.getAttackData?.();
  if (!data) return undefined;
  const ability = (data.data?.roll as { ability?: string } | undefined)?.ability;
  const formula = Roll.replaceFormulaData(labelD20Parts(data.parts ?? [], ability).join(" + "), data.data ?? {});
  return { formula, bonusSources: attackBonusSources(activity, ability, activity.actionType) };
}

async function previewTarget(activity: Activity, attacker: Token.Implementation | undefined, target: TokenDocument.Implementation): Promise<PreviewTarget> {
  const targetToken = target.object ?? undefined;
  const result: PreviewTarget = { uuid: target.uuid ?? "", name: target.name, sees: true, seen: false };
  if (attacker && targetToken) result.distance = getDistance(attacker, targetToken, { wallsBlock: false });
  const actor = activity.actor;
  if (!actor) return result;
  const workflow = new DummyWorkflow(actor, activity, speakerFor({ actor, token: attacker }), [target],
    { workflowOptions: { preview: true }, ...(attacker ? { token: attacker } : {}) });
  if (isMidiActivityType(activity)) await setupCanSeeSense(activity, { workflow });
  if (targetToken) {
    result.sees = workflow.tokenCanSee.has(targetToken);
    result.seen = workflow.targetsCanSee.has(targetToken);
  }
  if (attacker && targetToken && activity.range) {
    const range = checkActivityRange(activity, attacker, new Set([targetToken]), false);
    // As the use: the pre-use check refuses out of range (useChecks), the preamble gives long range to ranged and thrown attacks
    const checked = checkMechanic("checkRange") !== "none" && !activityHasAreaTarget(activity);
    result.range = { result: range.result, range: range.range, longRange: range.longRange, checked };
    workflow.longRangeAttack = checked && isRangeCheckable(activity) && range.result === "dis";
  }
  if (activity.attack) {
    await workflow.checkAttackAdvantage();
    result.advantage = { mode: workflow.attackRollModifierTracker.advantageMode, attribution: attributionMapToArray(workflow.attackAttribution ?? {}) };
    if (attacker && targetToken) {
      const ac = computeTargetAC(attacker, targetToken, activity);
      result.ac = { effective: ac.effectiveAC, base: ac.baseAC, cover: ac.effectiveCoverBonus, coverIgnored: ac.coverIgnored };
    }
  }
  return result;
}

/** What a use of `activity` against `targets` would do, without making it (MidiQOL.preview) */
export async function preview(activity: Activity, targets: Iterable<Token.Implementation | TokenDocument.Implementation> = [], options: PreviewOptions = {}): Promise<UsePreview> {
  const documents = [...targets].map(target => getTokenDocument(target)).filter((document): document is TokenDocument.Implementation => !!document);
  const attacker = getToken(options.token) ?? (activity.actor ? getOrCreateTokenForActor(activity.actor) : undefined) ?? undefined;
  const save = activity.save as { dc?: { value?: number }, ability?: Set<string> } | undefined;
  const steps = (() => {
    try {
      return previewFlow(activity, {}, configSettings.savesBeforeDamage ? "midi-qol.savesFirst" : "midi-qol.standard").steps;
    } catch {
      return [];
    }
  })();
  return {
    activity: activity.uuid,
    cost: cost(activity),
    issues: await issues(activity, documents[0] ? { target: documents[0] } : {}),
    ...(activity.attack ? { attack: attackMakeUp(activity) } : {}),
    ...(save ? { save: { dc: save.dc?.value, abilities: [...(save.ability ?? [])] } } : {}),
    steps,
    targets: await Promise.all(documents.map(document => previewTarget(activity, attacker, document)))
  };
}
