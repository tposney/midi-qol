import { i18n } from "../midi-qol.js";
import { checkMechanic, incapacitatedOptions } from "../module/settings.js";
import { registerIssueContributor, type IssueQuery, type UseIssue } from "../module/services/economy/issues.js";
import { declareRule, ruleId } from "./registry.js";

/*
 * Mechanic raging (2024 Rage): a raging creature can't cast spells. Raging: an applied effect whose origin is an item
 * with the identifier "rage" (dnd5e's Rage gives its effect no status). An issue contributor (MidiQOL.economy.issues):
 * shown wherever issues are (hub, preview, turn model) and acted on as the use starts by the mechanic's level: warn
 * (the default) or enforce; nothing: off. A mechanic: not behind the Optional rules switch.
 */

export const RAGING_RULE = ruleId("raging");

export function isRaging(actor: Actor.Implementation): boolean {
  return actor.appliedEffects.some(effect => {
    const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
    return origin instanceof Item && (origin.system as { identifier?: string }).identifier === "rage";
  });
}

function ragingIssue({ activity, actor }: IssueQuery): UseIssue | undefined {
  const level = checkMechanic("raging");
  if (level !== "warn" && level !== "enforce") return undefined;
  if (!activity.isSpell || !isRaging(actor)) return undefined;
  return { id: "raging", label: i18n("midi-qol.Economy.Raging"), source: RAGING_RULE, policy: level };
}

export function registerRagingRule() {
  declareRule({ id: RAGING_RULE, setting: "raging", service: "policy", mechanic: true, label: "Raging: no spells",
    settings: [{ key: "raging", type: "string", label: "midi-qol.Raging.Name", hint: "midi-qol.Raging.Hint", choices: incapacitatedOptions as Record<string, unknown>, default: "warn" }] });
  registerIssueContributor(RAGING_RULE, ragingIssue, { priority: 65 });
}
