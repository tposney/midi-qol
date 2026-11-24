import { debugEnabled, warn } from "../midi-qol.js";
import { configSettings } from "../module/settings.js";
import { checkDistance, checkNearby, createConditionData, evalAllConditionsAsync, midiFlag } from "../module/utils.js";
import { rollModifiersService, type RollModifierContributor } from "../module/services/rollModifiers/service.js";
import { attackContext } from "../module/services/rollModifiers/attackRules.js";
import { declareRule, ruleId, ruleOn } from "./registry.js";

/* Optional rule nearbyFoe: a foe within the set distance of a ranged (or thrown, beyond reach) attacker: disadvantage */

const nearbyFoe: RollModifierContributor = {
  async for(query) {
    const context = attackContext(query);
    if (!context) return [];
    const { workflow, actor, targetDocument, firstTarget } = context;
    const actType = workflow.activity.actionType || "none";
    // @ts-expect-error no dnd5e-types
    const thrown: boolean = !!workflow.item.system.properties?.has("thr");
    if (!(["rwak", "rsak"].includes(actType) || (thrown && actType === "mwak")) || !workflow.token) return [];
    const conditionData = createConditionData({ workflow, target: targetDocument, actor });
    if (await evalAllConditionsAsync(actor, midiFlag(`ignoreNearbyFoes`), conditionData)) return [];
    let foe = false;
    if (actType !== "mwak") foe = checkNearby(-1, workflow.token, configSettings.optionalRules.nearbyFoe, { includeIncapacitated: false, canSee: true });
    else {
      // @ts-expect-error no dnd5e-types
      const meleeRange = workflow.item.system.range.reach ?? 5;
      foe = checkDistance(workflow.token, firstTarget, meleeRange, { wallsBlock: false })
        ? false
        : checkNearby(-1, workflow.token, configSettings.optionalRules.nearbyFoe, { includeIncapacitated: false, canSee: true });
    }
    if (!foe) return [];
    if (debugEnabled > 0) warn(`checkAttackAdvantage | Ranged attack by ${actor.name} at disadvantage due to nearby foe`);
    foundry.utils.setProperty(actor, "flags.midi.evaluated.disadvantage.attack.nearbyFoe", { value: true, effects: ["Nearby Foe"] });
    return [{ effect: "disadvantage", key: "nearbyFoe", label: "Nearby foe" }];
  }
};

export function registerNearbyFoeRule() {
  const rule = declareRule({ id: ruleId("nearbyFoe"), setting: "nearbyFoe", service: "rollModifiers", label: "Nearby foe disadvantage on ranged attacks" });
  rollModifiersService.register(rule.id, nearbyFoe, { label: rule.label, available: () => ruleOn("nearbyFoe") });
}
