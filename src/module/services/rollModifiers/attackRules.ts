import { i18n, log, warn, debugEnabled, MODULE_ID } from "../../../midi-qol.js";
import { invisibilityDenied } from "../../lib/entries/serviceEvents.js";
import { checkRule, configSettings, safeGetGameSetting } from "../../settings.js";
import { installedModules } from "../../setupModules.js";
import { checkDistance, checkNearby, createConditionData, evalAllConditionsAsync, hasCondition, midiFlag } from "../../utils.js";
import { Workflow } from "../../Workflow.js";
import { rollModifiersService, type RollModifier, type RollModifierContributor, type RollQuery } from "./service.js";

/*
 * midi's own attack-roll rules as rollModifiers contributors (previously inline in Workflow.checkAttackAdvantage), so
 * another module can replace one (unregister it, register its own) or switch it off. Each keeps the attribution key
 * and label it always had: other modules remove some by key (CAT's removeAttackDisadvantage(workflow, "nearbyFoe")).
 */

/**
 * The workflow of an attack query, with the attacker and its first target: as a TokenDocument (proposal section 18), and
 * its canvas Token for the rules that need the canvas (sight, distance, Perceptive), undefined when it isn't drawn.
 */
function attackContext(query: RollQuery) {
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

/** Reads the flanking verdict checkFlankingAdvantage reached for the workflow. */
const flanking: RollModifierContributor = {
  for(query) {
    const context = attackContext(query);
    return context?.workflow.flankingAdvantage ? [{ effect: "advantage", key: "flanking", label: i18n("midi-qol.Flanking") }] : [];
  }
};

/** Invisible / unseen attacker or target (invisAdvantage), and Perceptive's hidden check (hiddenAdvantage). */
const perception: RollModifierContributor = {
  async for(query) {
    const context = attackContext(query);
    if (!context?.firstTarget) return [];
    const { workflow, actor, firstTarget } = context;
    const modifiers: RollModifier[] = [];
    const evaluated = (path: string, effect: string) => foundry.utils.setProperty(actor, `flags.midi.evaluated.${path}`, { value: true, effects: [effect] });
    if (checkRule("invisAdvantage") && checkRule("invisAdvantage") !== "none") {
      // if we are using a proxy token to attack use that for hidden invisible
      // An entry can deny a creature Invisible's benefit (Shining Smite): it is attacked, and attacks, as if seen
      const attackerSeen = invisibilityDenied(workflow, workflow.token?.actor);
      const targetSeen = invisibilityDenied(workflow, firstTarget.actor);
      const invisibleToken = workflow.token && !attackerSeen ? hasCondition(workflow.token.actor as Actor, "invisible") : false;
      const invisibleTarget = !targetSeen && hasCondition(firstTarget.actor as Actor, "invisible");
      // RAW 2014: Invisible condition explicitly grants adv/disadv; canSense used for non-invisible "unseen" cases
      // RAW 2024: Only "can you see the creature?" matters (blindsight/truesight = can see; tremorsense = cannot see)
      const isRAW2014 = checkRule("invisAdvantage") === "RAW2014";
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
    }
    // TODO: Perceptive could become an async hiddenFrom provider of the perception service
    if (checkRule("hiddenAdvantage") === "perceptive" && installedModules.get("perceptive")) {
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
    }
    return modifiers;
  }
};

/** A foe next to a ranged (or thrown, beyond reach) attacker gives disadvantage. */
const nearbyFoe: RollModifierContributor = {
  async for(query) {
    const context = attackContext(query);
    if (!context || !checkRule("nearbyFoe")) return [];
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
  "midi-qol.flanking": { label: "Flanking advantage", contributor: flanking },
  "midi-qol.perception": { label: "Unseen and invisible attackers and targets", contributor: perception },
  "midi-qol.nearbyFoe": { label: "Nearby foe disadvantage on ranged attacks", contributor: nearbyFoe },
  "midi-qol.heavyWeapon": { label: "Heavy weapon disadvantage", contributor: heavyWeapon }
};

export function registerAttackRollRules() {
  for (const [id, { label, contributor }] of Object.entries(attackRollRules)) rollModifiersService.register(id, contributor, { label });
}
