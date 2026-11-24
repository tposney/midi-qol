import { i18n } from "../../midi-qol.js";
import { configSettings, checkFlankingOptions, flankingBonusOptions } from "../../module/settings.js";
import { register } from "../../module/api/services.js";
import { flankingService, computeFlankedStatus, computeFlankingStatus } from "../../module/services/flanking/service.js";
import { rollModifiersService, type RollModifierContributor } from "../../module/services/rollModifiers/service.js";
import { attackContext } from "../../module/services/rollModifiers/attackRules.js";
import type { RollBonusContributor } from "../../module/services/rollBonuses/service.js";
import type { Workflow } from "../../module/Workflow.js";
import { midiFlankedStatus, midiFlankingStatus } from "./geometry.js";
import { markFlanking } from "./marking.js";
import { declareRule, ruleId, ruleValue } from "../registry.js";

/*
 * Optional rule checkFlanking (M30). A melee attack on one target is flanking (its attacker has an ally opposite:
 * the flanking modes) or against a flanked target (surrounded: the flanked modes). The rule answers as the attack roll
 * is made, through the roll's own services: advantage (rollModifiers) or a fixed bonus (rollBonuses, an automatic
 * before-roll part), as the Flanking bonus setting says. It marks the Flanking / Flanked statuses (markers for display
 * and conditions; they carry no advantage of their own). Who flanks whom is the flanking service's: midi's geometry
 * (geometry.ts) is its provider while the rule is on; another module may provide its own.
 */

export const FLANKED_MODES: readonly string[] = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"];
export const FLANKING_MODES: readonly string[] = ["advonly", "ceonly", "midiFlanking"];

/** The rule's mode ("off" while optional rules or the rule are off) */
export function currentFlankingMode(): string {
  const mode = ruleValue("checkFlanking");
  return typeof mode === "string" && mode ? mode : "off";
}
export const isFlankedMode = () => FLANKED_MODES.includes(currentFlankingMode());
export const isFlankingMode = () => FLANKING_MODES.includes(currentFlankingMode());

const bonusSetting = () => configSettings.optionalRules.flankingBonus ?? "advantage";

type Verdict = { kind: "flanking" | "flanked" } | undefined;
/** Each attack's verdict per target, worked out once for its two contributors (an attack per target has one each) */
const verdicts = new WeakMap<object, Map<string, Promise<Verdict>>>();
/** Each attack's last verdict once decided (read synchronously: the use.flanking tag) */
const decided = new WeakMap<object, Verdict>();

/** Whether this attack flanks (one melee attack on one target): its statuses marked as it is worked out */
export function flankingVerdict(workflow: Workflow): Promise<Verdict> {
  const key = workflow.targets.documents[0]?.uuid ?? "";
  let byTarget = verdicts.get(workflow);
  if (!byTarget) verdicts.set(workflow, byTarget = new Map());
  let verdict = byTarget.get(key);
  if (!verdict) {
    verdict = decide(workflow).then(v => { decided.set(workflow, v); return v; });
    byTarget.set(key, verdict);
  }
  return verdict;
}

/** The attack was flanking (as decided when its roll was made) */
export function attackFlanked(workflow: Workflow): boolean {
  return !!decided.get(workflow);
}

async function decide(workflow: Workflow): Promise<Verdict> {
  if (!canvas || workflow.targets.count !== 1) return undefined;
  if (workflow.item && !["mwak", "msak"].includes(workflow.activity.actionType ?? "")) return undefined;
  const token = (fromUuidSync(workflow.tokenUuid) as TokenDocument | null)?.object ?? undefined;
  const target = workflow.targets.tokens[0];
  if (!target) return undefined;
  const flanked = isFlankedMode();
  if (!flanked && !isFlankingMode()) return undefined;
  // The statuses are markers: marked for an advantage attack (as before), not for a fixed bonus
  const yes = bonusSetting() === "advantage"
    ? await markFlanking(token, target)
    : flanked ? await computeFlankedStatus(target) : !!token && await computeFlankingStatus(token, target);
  if (!yes) return undefined;
  if (workflow.actor) foundry.utils.setProperty(workflow.actor, "flags.midi.evaluated.advantage.attack.flanking", { value: true, effects: [flanked ? "Flanked" : "Flanking"] });
  return { kind: flanked ? "flanked" : "flanking" };
}

const label = (kind: "flanking" | "flanked") => i18n(kind === "flanked" ? "midi-qol.Flanked" : "midi-qol.Flanking");
/** The statuses' images, shown on the attack roll for the advantage or bonus */
const img = (kind: "flanking" | "flanked") => kind === "flanked" ? "modules/midi-qol/icons/encirclement.svg" : "icons/svg/sword.svg";

/** Advantage, when that is the rule's bonus */
const advantage: RollModifierContributor = {
  async for(query) {
    const context = attackContext(query);
    if (!context || bonusSetting() !== "advantage") return [];
    const verdict = await flankingVerdict(context.workflow);
    return verdict ? [{ effect: "advantage", key: verdict.kind, label: label(verdict.kind), img: img(verdict.kind) }] : [];
  }
};

/** A fixed bonus (an automatic before-roll part of the attack), when that is the rule's bonus */
const bonus: RollBonusContributor = {
  kinds: ["attack"],
  async for(query) {
    const amount = Number(bonusSetting()) || 0;
    if (!amount || !query.workflow) return [];
    const verdict = await flankingVerdict(query.workflow);
    return verdict ? [{ id: verdict.kind, label: label(verdict.kind), img: img(verdict.kind), phases: ["preRoll"], optional: false, effect: { kind: "add", formula: String(amount) } }] : [];
  }
};

export const FLANKING_RULE = ruleId("checkFlanking");

export function registerCheckFlankingRule() {
  const rule = declareRule({ id: FLANKING_RULE, setting: "checkFlanking", service: "rollModifiers", label: "Flanking",
    settings: [
      { key: "checkFlanking", type: "string", label: "midi-qol.CheckFlanking.Name", hint: "midi-qol.CheckFlanking.Hint", choices: checkFlankingOptions, default: "off" },
      { key: "flankingBonus", type: "string", label: "midi-qol.FlankingBonus.Name", hint: "midi-qol.FlankingBonus.Hint", choices: flankingBonusOptions as Record<string, unknown>, default: "advantage" },
      { key: "showFlankingHighlight", type: "boolean", label: "midi-qol.ShowFlankingHighlight.Name", hint: "midi-qol.ShowFlankingHighlight.Hint", default: false }
    ] });
  const on = () => currentFlankingMode() !== "off";
  rollModifiersService.register(rule.id, advantage, { label: rule.label, available: on });
  register("rollBonuses", rule.id, bonus, { label: `${rule.label} bonus`, available: on });
  // Who flanks whom: midi's geometry, while the rule is on
  flankingService.register("midi-qol", {
    flanking: ({ attacker, target }) => attacker.object && target.object ? midiFlankingStatus(attacker.object, target.object) : undefined,
    flanked: ({ target }) => target.object ? midiFlankedStatus(target.object) : undefined
  }, { label: "Midi-QOL", available: on });
}
