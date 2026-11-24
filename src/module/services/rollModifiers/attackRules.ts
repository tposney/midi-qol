import { i18n, log, warn, debugEnabled, MODULE_ID } from "../../../midi-qol.js";
import { invisibilityDenied } from "../../lib/entries/serviceEvents.js";
import { checkRule, configSettings, safeGetGameSetting } from "../../settings.js";
import { installedModules } from "../../setupModules.js";
import { checkDistance, checkNearby, createConditionData, evalAllConditionsAsync, hasCondition, midiFlag } from "../../utils.js";
import { Workflow } from "../../Workflow.js";
import { rollModifiersService, type RollModifier, type RollModifierContributor, type RollQuery } from "./service.js";

/*
 * midi's own attack-roll rules as rollModifiers contributors (previously inline in Workflow.checkAttackAdvantage), so
 * another module can replace one (unregister it, register its own) or switch it off. The optional rules among them
 * (invisible and hidden attackers, a nearby foe) are rule units in src/rules (M30). Each keeps the attribution key
 * and label it always had: other modules remove some by key (CAT's removeAttackDisadvantage(workflow, "nearbyFoe")).
 */

/**
 * The workflow of an attack query, with the attacker and its first target: as a TokenDocument (proposal section 18), and
 * its canvas Token for the rules that need the canvas (sight, distance, Perceptive), undefined when it isn't drawn.
 */
export function attackContext(query: RollQuery) {
  const workflow = query.workflow;
  if (query.kind !== "attack" || !(workflow instanceof Workflow) || !workflow.actor) return undefined;
  const targetDocument = workflow.targets.documents[0];
  const firstTarget = targetDocument ? workflow.targets.tokens.find(token => token.document === targetDocument) as Token.Implementation | undefined : undefined;
  return { workflow, actor: workflow.actor, targetDocument, firstTarget };
}

const longRange: RollModifierContributor = {
  for(query) {
    const context = attackContext(query);
    return context?.workflow.longRangeAttack ? [{ effect: "disadvantage", key: "range", label: "Long Range" }] : [];
  }
};

/** Heavy weapons: 2024 needs STR/DEX 13; 2014 small and tiny creatures. flags.midi-qol.fail.disadvantage.heavy waives it. */
const heavyWeapon: RollModifierContributor = {
  async for(query) {
    const context = attackContext(query);
    // @ts-expect-error no dnd5e-types
    if (!context || !context.workflow.item.system.properties?.has("hvy")) return [];
    const { workflow, actor, targetDocument } = context;
    if (actor.flags?.[MODULE_ID]?.fail?.disadvantage?.heavy) {
      const conditionData = createConditionData({ workflow, target: targetDocument, actor });
      if (await evalAllConditionsAsync(actor, midiFlag(`fail.disadvantage.heavy`), conditionData)) return [];
    }
    const rules = safeGetGameSetting("dnd5e", "rulesVersion");
    if (rules === "modern") {
      // @ts-expect-error no dnd5e-types
      const { str, dex } = actor.system.abilities ?? {};
      const actionType = workflow.activity.actionType;
      if ((actionType === "mwak" && str?.value < 13) || (actionType === "rwak" && dex?.value < 13))
        return [{ effect: "disadvantage", key: "heavy weapon", label: "Heavy weapon" }];
    } else if (rules === "legacy") {
      // @ts-expect-error no dnd5e-types
      if (["tiny", "sm"].includes(actor.system.traits?.size)) return [{ effect: "disadvantage", key: "small", label: "Small creature" }];
    }
    return [];
  }
};

/** midi's attack rules, registered as providers of rollModifiers (midi-qol.<rule>). */
export const attackRollRules: Record<string, { label: string, contributor: RollModifierContributor }> = {
  "midi-qol.range": { label: "Long range disadvantage", contributor: longRange },
  "midi-qol.heavyWeapon": { label: "Heavy weapon disadvantage", contributor: heavyWeapon }
};

export function registerAttackRollRules() {
  for (const [id, { label, contributor }] of Object.entries(attackRollRules)) rollModifiersService.register(id, contributor, { label });
}
