import { debugEnabled, warn } from "../midi-qol.js";
import { checkNearby } from "../module/utils.js";
import { rollModifiersService, type RollModifierContributor } from "../module/services/rollModifiers/service.js";
import { attackContext } from "../module/services/rollModifiers/attackRules.js";
import { declareRule, ruleId, ruleValue } from "./registry.js";

/*
 * Optional rule nearbyAllyRanged: a ranged attack at a target (smaller than the set size, in squares) next to one of
 * its allies: disadvantage.
 */

const nearbyAlly: RollModifierContributor = {
  for(query) {
    const context = attackContext(query);
    if (!context?.firstTarget || !context.targetDocument) return [];
    const { workflow, actor, targetDocument, firstTarget } = context;
    if (!["rwak", "rsak"].includes(workflow.activity.actionType ?? "")) return [];
    if ((targetDocument.width ?? 1) * (targetDocument.height ?? 1) >= Number(ruleValue("nearbyAllyRanged"))) return [];
    // TODO include thrown weapons in check
    if (!checkNearby(-1, firstTarget, (canvas?.dimensions?.distance ?? 5))) return [];
    if (debugEnabled > 0) warn("checkTargetAdvantage | ranged attack with disadvantage because target is near a friend");
    foundry.utils.setProperty(actor, "flags.midi.evaluated.disadvantage.attack.nearbyAlly", { value: true, effects: ["Nearby Ally"] });
    return [{ effect: "disadvantage", key: "nearbyAlly", label: "Nearby Ally" }];
  }
};

export function registerNearbyAllyRangedRule() {
  const rule = declareRule({ id: ruleId("nearbyAllyRanged"), setting: "nearbyAllyRanged", service: "rollModifiers", label: "Ranged attacks at a target beside its ally: disadvantage",
    settings: [{ key: "nearbyAllyRanged", type: "number", label: "midi-qol.NearbyAllyRanged.Name", hint: "midi-qol.NearbyAllyRanged.Hint", default: 0 }] });
  rollModifiersService.register(rule.id, nearbyAlly, { label: rule.label, available: () => Number(ruleValue("nearbyAllyRanged") ?? 0) > 0 });
}
