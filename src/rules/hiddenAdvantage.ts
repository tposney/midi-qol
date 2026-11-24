import { configSettings } from "../module/settings.js";
import { installedModules } from "../module/setupModules.js";
import { HIDING, hiddenDC, passivePerception, DEFAULT_DC } from "../module/lib/hiding.js";
import { rollModifiersService, type RollModifier, type RollModifierContributor } from "../module/services/rollModifiers/service.js";
import { attackContext } from "../module/services/rollModifiers/attackRules.js";
import { declareRule, ruleId, ruleValue } from "./registry.js";

/*
 * Optional rule hiddenAdvantage. Per observer ("perObserver", "perObserverPassive"): whether a hiding creature is hidden
 * from a viewer, the answer midi's perception provider gives (its hiddenFrom). "perceptive": the Perceptive module
 * decides, as a rollModifiers contributor on attacks (its check is async).
 */

const PER_OBSERVER = ["perObserver", "perObserverPassive"];

/** Per observer: a hiding target is hidden from an enemy viewer that can see, unless (passive) it beats the hide DC */
export function perObserverHidden(target: TokenDocument.Implementation, viewer: TokenDocument.Implementation): boolean {
  const mode = ruleValue("hiddenAdvantage");
  if (!PER_OBSERVER.includes(mode as string)) return false;
  if (target === viewer || !target.actor?.statuses.has(HIDING)) return false;
  if (target.disposition === viewer.disposition) return false;
  if (!viewer.sight.enabled && !configSettings.optionalRules.invisVision) return false;
  if (mode === "perObserverPassive" && passivePerception(viewer.actor) >= (hiddenDC(target.actor) ?? DEFAULT_DC)) return false;
  return true;
}

const perceptive: RollModifierContributor = {
  async for(query) {
    const context = attackContext(query);
    if (!context?.firstTarget) return [];
    const { workflow, actor, firstTarget } = context;
    const modifiers: RollModifier[] = [];
    const evaluated = (path: string, effect: string) => foundry.utils.setProperty(actor, `flags.midi.evaluated.${path}`, { value: true, effects: [effect] });
    //@ts-expect-error .api
    const perceptiveApi = game.modules.get("perceptive")?.api;
    const options = { LOS: false, Range: true, Effects: true, Hidden: false, canbeSpotted: true };
    const tokenSpotted = await perceptiveApi?.isSpottedby(workflow.token, firstTarget, options) ?? true;
    const targetSpotted = await perceptiveApi?.isSpottedby(firstTarget, workflow.token, options) ?? true;
    if (!tokenSpotted) {
      modifiers.push({ effect: "advantage", key: "Attacker hidden", label: "Attacker hidden" });
      evaluated("advantage.attack.hidden", "Hidden Attacker");
    }
    if (!targetSpotted) {
      modifiers.push({ effect: "disadvantage", key: "Hidden foe", label: "Hidden foe" });
      evaluated("disadvantage.attack.hidden", "Hidden Defender");
    }
    return modifiers;
  }
};

export function registerHiddenAdvantageRule() {
  const rule = declareRule({ id: ruleId("hiddenAdvantage", "perceptive"), setting: "hiddenAdvantage", service: "rollModifiers", label: "Hidden attackers and targets (Perceptive)" });
  rollModifiersService.register(rule.id, perceptive, { label: rule.label,
    available: () => ruleValue("hiddenAdvantage") === "perceptive" && !!installedModules.get("perceptive") });
}
