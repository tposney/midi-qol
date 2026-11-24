import { log } from "../midi-qol.js";
import { invisibilityDenied } from "../module/lib/entries/serviceEvents.js";
import { hasCondition } from "../module/utils.js";
import { invisAdvantageOptions } from "../module/settings.js";
import { rollModifiersService, type RollModifier, type RollModifierContributor } from "../module/services/rollModifiers/service.js";
import { attackContext } from "../module/services/rollModifiers/attackRules.js";
import { declareRule, ruleId, ruleOn, ruleValue } from "./registry.js";

/*
 * Optional rule invisAdvantage: an attacker or target that can't be seen (RAW 2024: "can you see it?"; RAW2014 also
 * the Invisible condition itself, and sensing for the unseen cases): advantage / disadvantage.
 */

const invisible: RollModifierContributor = {
  async for(query) {
    const context = attackContext(query);
    if (!context?.firstTarget) return [];
    const { workflow, actor, firstTarget } = context;
    const modifiers: RollModifier[] = [];
    const evaluated = (path: string, effect: string) => foundry.utils.setProperty(actor, `flags.midi.evaluated.${path}`, { value: true, effects: [effect] });
    // An entry can deny a creature Invisible's benefit (Shining Smite): it is attacked, and attacks, as if seen
    const attackerSeen = invisibilityDenied(workflow, workflow.token?.actor);
    const targetSeen = invisibilityDenied(workflow, firstTarget.actor);
    const invisibleToken = workflow.token && !attackerSeen ? hasCondition(workflow.token.actor as Actor, "invisible") : false;
    const invisibleTarget = !targetSeen && hasCondition(firstTarget.actor as Actor, "invisible");
    const isRAW2014 = ruleValue("invisAdvantage") === "RAW2014";
    const tokenCanPerceive = targetSeen || (isRAW2014 ? workflow.tokenCanSense?.has(firstTarget) : workflow.tokenCanSee?.has(firstTarget));
    const targetCanPerceive = attackerSeen || (isRAW2014 ? workflow.targetsCanSense?.has(firstTarget) : workflow.targetsCanSee?.has(firstTarget));
    const invisAdvantage = isRAW2014 ? invisibleToken || !targetCanPerceive : !targetCanPerceive;
    if (invisAdvantage) {
      if (!targetCanPerceive) {
        modifiers.push({ effect: "advantage", key: "Attacker not detected", label: "Attacker not detected" });
        evaluated("advantage.attack.invisible", "Attacker not detected");
      }
      if (invisibleToken && isRAW2014) {
        modifiers.push({ effect: "advantage", key: "Attacker invisible", label: "Attacker invisible" });
        evaluated("advantage.attack.invisible", "Invisible Attacker");
      }
    }
    const invisDisadvantage = isRAW2014 ? invisibleTarget || !tokenCanPerceive : !tokenCanPerceive;
    if (invisDisadvantage) {
      log(`Disadvantage given to ${actor.name} due to invisible target`, invisibleTarget, tokenCanPerceive);
      if (invisibleTarget && isRAW2014) {
        modifiers.push({ effect: "disadvantage", key: "invisible foe", label: "Invisible foe" });
        evaluated("disadvantage.attack.invisible", "Invisible Defender");
      }
      if (!tokenCanPerceive) {
        modifiers.push({ effect: "disadvantage", key: "Defender not detected", label: "Defender not detected" });
        evaluated("disadvantage.attack.invisible", "Defender not detected");
      }
    }
    return modifiers;
  }
};

export const INVIS_RULE = ruleId("invisAdvantage");

export function registerInvisAdvantageRule() {
  const rule = declareRule({ id: INVIS_RULE, setting: "invisAdvantage", service: "rollModifiers", label: "Unseen and invisible attackers and targets",
    settings: [{ key: "invisAdvantage", type: "string", label: "midi-qol.InvisAdvantage.Name", hint: "midi-qol.RAW2014Invisible.Hint", choices: invisAdvantageOptions, default: "none" }] });
  rollModifiersService.register(rule.id, invisible, { label: rule.label, available: () => ruleOn("invisAdvantage") });
}
