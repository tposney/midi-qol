import { log, i18n, error, i18nFormat, warn, debugEnabled, GameSystemConfig, MODULE_ID, gameStats } from "../midi-qol.js";
import { configSettings, checkRule, checkMechanic, safeGetGameSetting, playerControlsInvisibleTokens } from "./settings.js";
import { bonusDialog, checkDefeated, checkIncapacitated, ConvenientEffectsHasEffect, createConditionData, displayDSNForRoll, expireRollEffect, getCriticalDamage, getDeadStatus, getOptionalCountRemainingShortFlag, getOrCreateTokenForActor, getSpeaker, getUnconsciousStatus, getVitalityDeadStatus, getWoundedStatus, hasAutoPlaceTemplate, hasUsedAction, hasUsedBonusAction, hasUsedReaction, midiRenderRoll, notificationNotify, removeActionUsed, removeBonusActionUsed, removeReactionUsed, tokenForActor, expireEffects, DSNMarkDiceDisplayed, evalAllConditions, evalAllConditionsAsync, CEAddEffectWith, isConvenientEffect, CERemoveEffect, getActivityAutoTargetAction, getAoETargetType, hasCondition, areMidiKeysPressed, MidiOptions, getVitalityItem, checkMagicResistanceAndVulnerability, isAutoFastForward, FastForwardRollType } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { OnUseMacro, OnUseMacros } from "./apps/Item.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiAttackActivity } from "./activities/AttackActivity.js";
import { templateTokens } from "./activities/activityHelpers.js";
import { MidiActivityChoiceDialog } from "./apps/MidiActivityChoiceDialog.js";
import Token = foundry.canvas.placeables.Token;
import { AnyMutableObject } from "fvtt-types/utils";
import { Activity, ActivityUseConfiguration, DamageApplicationOptions, DamageDescription, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../globals.js";
import { Workflow } from "./Workflow.js";
import { preferredActiveGM } from "./GMAction.js";
import { MidiDependentsRegistry, MidiDependentDocumentMixin } from "./lib/MidiDependentsRegistry.js";
import { RollModifierTracker, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags, RollModifierResult, AdvantageFlags } from "./lib/RollModifierTracker.js";

// Re-export for backwards compatibility
export { RollModifierTracker, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags, RollModifierResult, AdvantageFlags } from "./lib/RollModifierTracker.js";

// Re-export for backwards compatibility
export { MidiDependentsRegistry, MidiDependentDocumentMixin } from "./lib/MidiDependentsRegistry.js";

let libWrapper;

const NumericTerm = foundry.dice.terms.NumericTerm;

// Module-level Set to track actors that should skip concentration checks
// Used instead of actor flags to avoid database writes and orphaned flags
export const skipConcentrationActorUuids = new Set<string>();

function _isVisionSource(this: Token.Implementation, wrapped) {
  const isVisionSource = wrapped();
  if (this.document.hidden && !game.user?.isGM && game.user && this.actor?.testUserPermission(game.user, "OWNER")) {
    return true;
  }
  return isVisionSource;
}

function isVisible(this: Token.Implementation, wrapped) {
  const isVisible = wrapped();
  if (!game.user?.isGM && game.user && this.actor?.testUserPermission(game.user, "OWNER")) {
    return true;
  }
  return isVisible;
}

export interface Options {
  advantage: boolean | undefined,
  disadvantage: boolean | undefined,
  fastForward: boolean | undefined,
  fastForwardSet: boolean | undefined,
  parts: [] | undefined,
  chatMessage: boolean | undefined,
  rollToggle: boolean | undefined,
  other: boolean | undefined,
  autoRollAttack: boolean | undefined,
  autoRollDamage: boolean | undefined,
  fastForwardAttack: boolean | undefined,
  fastForwardDamage: boolean | undefined,
  fastForwardAbility: boolean | undefined,
  isMagicSave?: boolean,
  saveItemUuid?: string,
  saveItem?: Item,
  item?: Item,
  itemUuid?: string,
  simulate?: boolean,
  target?: number,
  rollType?: string
};
export const defaultRollOptions: Options = {
  advantage: false,
  disadvantage: false,
  fastForward: undefined,
  fastForwardSet: undefined,
  parts: undefined,
  chatMessage: undefined,
  rollToggle: undefined,
  other: undefined,
  autoRollAttack: undefined,
  autoRollDamage: undefined,
  fastForwardAttack: undefined,
  fastForwardDamage: undefined,
  fastForwardAbility: undefined
};

export function collectBonusFlags(actor: Actor.Implementation, category: string, detail: string) {
  const bonusFlags = Object.keys(actor.flags[MODULE_ID]?.optional ?? [])
    .filter(flag => {
      const checkFlag = actor.flags[MODULE_ID]!.optional![flag][category];
      if (checkFlag === undefined) return false;
      if (detail.startsWith("fail")) {
        const [_, type] = detail.split(".");
        return checkFlag.fail && checkFlag.fail[type] ? getOptionalCountRemainingShortFlag(actor, flag) > 0 : false;
      } else if (!(typeof checkFlag === "string" || checkFlag[detail] || checkFlag["all"] !== undefined)) return false;
      if (actor.flags[MODULE_ID]!.optional![flag].count === undefined) return true;
      return getOptionalCountRemainingShortFlag(actor, flag) > 0;
    })
    .map(flag => {
      const checkFlag = actor.flags[MODULE_ID]!.optional![flag][category];
      if (typeof checkFlag === "string") return `flags.midi-qol.optional.${flag}`;
      else return `flags.midi-qol.optional.${flag}`;
    });
  return bonusFlags;
}

export async function bonusCheck(actor: Actor.Implementation, result: Roll, category: string, detail = "", messageData: any = {}): Promise<Roll> {
  detail ||= foundry.utils.getProperty(messageData, "flags.dnd5e.roll.type") as string; // death saves -> "death", tool checks -> "tool"
  let bonusFlags = collectBonusFlags(actor, category, detail);
  if (bonusFlags.length > 0) {
    const data = {
      actor,
      roll: result,
      rollHTML: await midiRenderRoll(result),
      rollTotal: result.total,
      category,
      detail: detail,
      messageData
    }
    let title: string | undefined;
    if (GameSystemConfig.abilities[detail]?.label || GameSystemConfig.skills[detail]?.label) {
      if (detail.startsWith("fail")) title = "Failed Save Check";
      else if (category.startsWith("check")) title = i18nFormat("DND5E.AbilityPromptTitle", { ability: GameSystemConfig.abilities[detail].label ?? "" });
      else if (category.startsWith("save")) title = i18nFormat("DND5E.SavePromptTitle", { ability: GameSystemConfig.abilities[detail].label ?? "" });
      else if (category.startsWith("skill")) title = i18nFormat("DND5E.SkillPromptTitle", {
        //@ts-expect-error no dnd5e types
        ability: GameSystemConfig.abilities[actor.system.skills[detail]?.ability]?.label ?? "",
        skill: GameSystemConfig.skills[detail].label ?? ""
      });
    } else {
      if (detail.startsWith("fail")) title = "Failed Save Check";
      else if (category.startsWith("check")) title = i18nFormat("DND5E.AbilityPromptTitle", { ability: GameSystemConfig.abilities[detail] ?? "" });
      else if (category.startsWith("save")) title = i18nFormat("DND5E.SavePromptTitle", { ability: GameSystemConfig.abilities[detail] ?? "" });
      else if (category.startsWith("skill")) title = i18nFormat("DND5E.SkillPromptTitle", {
        //@ts-expect-error no dnd5e types
        ability: GameSystemConfig.abilities[actor.system.skills[detail]?.ability] ?? "",
        skill: GameSystemConfig.skills[detail] ?? ""
      });
    }

    const displayBonusRolls: boolean = !!(bonusFlags.reduce((returnValue: boolean | undefined, flag: string) => returnValue || (foundry.utils.getProperty(actor ?? {}, `${flag}.displayBonusRolls`) as boolean | undefined), undefined)
      ?? checkMechanic("displayBonusRolls"));
    const newRoll = await bonusDialog.bind(data)(
      bonusFlags,
      detail ? `${category}.${detail}` : category,
      displayBonusRolls,
      `${actor.name} - ${title}`,
      data.roll,
      "roll",
      { messageData }
    );
    if (newRoll) result = newRoll;
  }

  return result;
}

async function doRollSkill(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  let oldFormat = false;
  config.midiOptions ??= {};
  let preRollSkillHookId: number | undefined;
  let rollSkillHookId: number | undefined;
  //@ts-expect-error
  let result: CONFIG.Dice.D20Roll[] = [];
  const saveRollMode: keyof CONFIG.Dice.RollModes = safeGetGameSetting("core", "rollMode");
  try {
    message.data ??= {};
    let skillId = config.skill;
    let overtimeActorUuid: string | undefined;
    if (config.event) { // TODO Decide if we want to do this or support core behaviour of anyone rolling concentration check
      // @ts-expect-error we know better
      const target = config.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
      if (target?.dataset?.midiOvertimeActorUuid) overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
      if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
        const actualActor = fromUuidSync(overtimeActorUuid) as Actor.Implementation | undefined;
        //@ts-expect-error no dnd5e types
        if (actualActor) return actualActor.rollSkill(config, dialog, message);
      }
    }
    let hasPreComputedAdvantage = false;
    if (!config.midiOptions.ignorePreComputedAdvantage) {
      hasPreComputedAdvantage = applyPreComputedAdvantage(config);
      if (hasPreComputedAdvantage && isAutoFastForward("skill")) {
        config.midiOptions.fastForward = true;
      }
    }
    if (!hasPreComputedAdvantage) {
      if (!config.midiOptions.workflow && config.midiOptions.workflowId) {
        config.midiOptions.workflow = Workflow.getWorkflow(config.midiOptions.workflowId);
      }
      const skillRollModifierTracker = await computeSkillAdvantage(this, skillId ?? "", config.midiOptions);
      config.advantage = skillRollModifierTracker.hasAdvantage;
      config.disadvantage = skillRollModifierTracker.hasDisadvantage;
    }

    let success: boolean | undefined = undefined;
    let rollMode: keyof CONFIG.Dice.RollModes = message.rollMode ?? config.rollMode ?? safeGetGameSetting("core", "rollMode");
    const blindSkillRoll = configSettings.rollSkillsBlind.includes("all") || configSettings.rollSkillsBlind.includes(skillId ?? "");
    if (blindSkillRoll && [CONST.DICE_ROLL_MODES.PUBLIC, "roll", CONST.DICE_ROLL_MODES.PRIVATE].includes(rollMode)) {
      rollMode = CONST.DICE_ROLL_MODES.BLIND;
      game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.BLIND);
    }
    if (dialog.configure === undefined && config.midiOptions.fastForward) dialog.configure = false;
    if (success === undefined) {
      // @ts-expect-error no dnd5e-types
      const abilityId = this.system.skills[skillId]?.ability;
      const skillModifierFlags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.skill.all", `fail.skill.${skillId}`],
        successFlags: ["success.all", "success.skill.all", `success.skill.${skillId}`],
        maxFlags: [`max.skill.${skillId}`, "max.skill.all"],
        minFlags: [`min.skill.${skillId}`, "min.skill.all"]
      };
      // If skillAbilityCheckAdvantage is enabled, also check ability flags
      if (configSettings.skillAbilityCheckAdvantage && abilityId) {
        skillModifierFlags.failFlags.push("fail.ability.all", "fail.ability.check.all", `fail.ability.check.${abilityId}`);
        skillModifierFlags.successFlags.push("success.ability.all", "success.ability.check.all", `success.ability.check.${abilityId}`);
        skillModifierFlags.maxFlags.push(`max.ability.check.${abilityId}`, "max.ability.check.all");
        skillModifierFlags.minFlags.push(`min.ability.check.${abilityId}`, "min.ability.check.all");
      }
      let skillModifiers: RollModifierResult;
      const workflow = config.midiOptions?.workflow;
      const midiOptions = config.midiOptions;
      const rollModifierTracker = new RollModifierTracker();
      preRollSkillHookId = Hooks.once("dnd5e.preRollSkill", (configData, dialogData, messageData) => {
        configData.midiOptions ??= midiOptions;
        messageData.data ??= {};
        if (overtimeActorUuid) messageData.data["flags.midi-qol.overtimeActorUuid"] = overtimeActorUuid;
        computeRollModifiers(this, skillModifierFlags, rollModifierTracker, { workflow });
        skillModifiers = applyRollModifiers(rollModifierTracker, configData, dialogData);
        if (skillModifiers.autoFail) {
          success = false;
        }
        setRollDialogOptions(configData, dialogData, "skill");
      });
      rollSkillHookId = Hooks.once("dnd5e.postSkillRollConfiguration", (rolls, config, dialog, messageDetails) => {
        // record message configuration details for later display
        message = messageDetails;
        return true;
      });

      const saveCreate = message.create;
      message.create = false;
      if (this.token) foundry.utils.setProperty(dialog, "options.window.subtitle", this.token.name);
      result = await wrapped(config, dialog, message);
      message.create = saveCreate;
    }
    if (!result) return result;
    rollMode = message.rollMode ?? rollMode;
    result.forEach(r => r.options.rollMode = rollMode);
    /*
    if (rollMode !== CONST.DICE_ROLL_MODES.BLIND) rollMode = result.options.rollMode;
    else result.options.rollMode = CONST.DICE_ROLL_MODES.BLIND;
    */
    await displayDSNForRoll(result, "skill", rollMode);
    DSNMarkDiceDisplayed(result);
    if (!config.simulate) {
      result[0] = await bonusCheck(this, result[0], "skill", skillId, message.data);
      DSNMarkDiceDisplayed(result);
      // Check for skill fail bonuses if the roll fails against target
      if (Number.isNumeric(result[0].options.target) && result[0].isSuccess === false) {
        const failFlagsLength = collectBonusFlags(this, "skill", "fail.all").length;
        const failSkillFlagsLength = collectBonusFlags(this, "skill", `fail.${skillId}`).length;
        if (failFlagsLength || failSkillFlagsLength) {
          // If the roll fails and there is a flags.midi-qol.optional.NAME.skill.fail flag, apply the bonus
          result[0] = await bonusCheck(this, result[0], "skill", failSkillFlagsLength ? `fail.${skillId}` : "fail.all", message.data);
          DSNMarkDiceDisplayed(result);
        }
      }
    }
    if (config.target !== undefined && success === undefined) {
      const resultTotal = result.reduce((acc, r) => acc + r.total, 0);
      success = resultTotal >= config.target;
      result.forEach(r => r.options.success = success);
    }
    if (message.create !== false && result) {
      if (foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true) {
        // const cls = getDocumentClass("ChatMessage");
        await result[0].toMessage(message.data, { rollMode });
      }
    }
    if (skillId) await expireRollEffect.bind(this)("Skill", skillId, success);

  } catch (err) {
    const message = `doRollSkill error ${this.name}, ${this.uuid}`;
    TroubleShooter.recordError(err, message)
    throw err;
  }
  finally {
    if (preRollSkillHookId) Hooks.off("dnd5e.preRollSkill", preRollSkillHookId);
    if (rollSkillHookId) Hooks.off("dnd5e.postSkillRollConfiguration", rollSkillHookId);
    if (saveRollMode) game.settings.set("core", "rollMode", saveRollMode);
    if (oldFormat) return result?.[0];
    return result;
  }
}

/**
 * Extracts pre-computed advantage/disadvantage from roll config.
 * Different modules store advantage in different locations:
 *
 * | Source                  | Module              | Location                              |
 * |-------------------------|---------------------|---------------------------------------|
 * | direct                  | Flash Rolls, GMAction| config.advantage/disadvantage        |
 * | event                   | Monks TokenBar      | config.event.advantage/disadvantage   |
 * | rolls                   | Epic Rolls          | config.rolls[0].options.adv/disadv    |
 * | midiOptions             | midi-qol internal   | config.midiOptions.advantage/disadv   |
 *
 * "External" modules are those that don't provide midiOptions.workflowId:
 * - Monks TokenBar, Epic Rolls, Flash Rolls → external (override their fastForward)
 * - GMAction, character sheet rolls → internal (use midi-qol's normal flow)
 */
type AdvantageSourceType = 'monks-tokenbar' | 'epic-rolls-5e' | 'flash-rolls-5e' | 'midi-qol' | 'none';

interface AdvantageSourceInfo {
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
  hasPreComputed: boolean;      // true if any source provided advantage/disadvantage
  isExternalModule: boolean;    // true if from external module (no workflowId)
  sourceType: AdvantageSourceType;  // module name that provided the advantage/disadvantage
  hasEvent: boolean;            // true if config.event exists (for shift key checking)
}

function getAdvantageSourceInfo(config: RollProcessConfig): AdvantageSourceInfo {
  // Source 1: Direct on config (Flash Rolls sets this, midi-qol GMAction also sets this)
  const directAdvantage = config.advantage;
  const directDisadvantage = config.disadvantage;
  const hasDirect = directAdvantage !== undefined || directDisadvantage !== undefined;

  // Source 2: Event object (Monks TokenBar sets event.advantage/event.disadvantage)
  // @ts-expect-error event may have advantage/disadvantage properties
  const eventAdvantage = config.event?.advantage;
  // @ts-expect-error event may have advantage/disadvantage properties
  const eventDisadvantage = config.event?.disadvantage;
  const hasEventAdvantage = eventAdvantage !== undefined || eventDisadvantage !== undefined;

  // Source 3: rolls[0].options (Epic Rolls)
  const rollsAdvantage = config.rolls?.[0]?.options?.advantage;
  const rollsDisadvantage = config.rolls?.[0]?.options?.disadvantage;
  const hasRolls = rollsAdvantage !== undefined || rollsDisadvantage !== undefined;

  // Source 4: midiOptions (midi-qol internal)
  const midiAdvantage = config.midiOptions?.advantage;
  const midiDisadvantage = config.midiOptions?.disadvantage;
  const hasMidiOptions = midiAdvantage !== undefined || midiDisadvantage !== undefined;

  // Combine all sources (first defined value wins)
  const advantage = directAdvantage ?? eventAdvantage ?? rollsAdvantage ?? midiAdvantage;
  const disadvantage = directDisadvantage ?? eventDisadvantage ?? rollsDisadvantage ?? midiDisadvantage;

  // Determine if this is from an external module
  // External = has pre-computed advantage, NO workflowId, AND the matching module is active
  const hasWorkflowId = !!config.midiOptions?.workflowId;
  const hasExternalSource =
    (hasEventAdvantage && !!installedModules.get("monks-tokenbar"))
    || (hasRolls && !hasWorkflowId && !!installedModules.get("epic-rolls-5e"))
    || (hasDirect && !hasWorkflowId && !!installedModules.get("flash-rolls-5e"));

  // Determine which module provided the advantage/disadvantage based on how it was passed
  // Only match a specific module if it is actually active
  let sourceType: AdvantageSourceType = 'none';
  if (hasEventAdvantage && installedModules.get("monks-tokenbar")) {
    sourceType = 'monks-tokenbar';  // Monks TokenBar passes event.advantage/disadvantage
  } else if (hasRolls && !hasWorkflowId && installedModules.get("epic-rolls-5e")) {
    sourceType = 'epic-rolls-5e';   // Epic Rolls passes rolls[0].options.advantage/disadvantage
  } else if (hasDirect && !hasWorkflowId && installedModules.get("flash-rolls-5e")) {
    sourceType = 'flash-rolls-5e';  // Flash Rolls sets config.advantage/disadvantage directly (no workflowId)
  } else if (hasDirect || hasMidiOptions) {
    sourceType = 'midi-qol';        // midi-qol internal (GMAction, character sheet, etc.)
  }

  // Check if event object exists (for shift key detection)
  // Monks TokenBar passes the event, Epic Rolls nulls it when fast-forwarding, Flash Rolls doesn't pass it
  const hasEvent = !!config.event;

  return {
    advantage,
    disadvantage,
    hasPreComputed: hasDirect || hasEventAdvantage || hasRolls || hasMidiOptions,
    isExternalModule: hasExternalSource,
    sourceType,
    hasEvent
  };
}

function getExternalModuleFastForward(sourceInfo: AdvantageSourceInfo, rollType: FastForwardRollType): boolean {
  // Get the appropriate fast forward setting based on which external module is the source
  switch (sourceInfo.sourceType) {
    case 'monks-tokenbar':
      if (installedModules.get("monks-tokenbar")) {
        return safeGetGameSetting("monks-tokenbar", "bypass-roll-dialog") as boolean ?? false;
      }
      break;
    case 'flash-rolls-5e':
      if (installedModules.get("flash-rolls-5e")) {
        return safeGetGameSetting("flash-rolls-5e", "skipRollDialog") as boolean ?? false;
      }
      break;
    case 'midi-qol':
    case 'epic-rolls-5e':
    case 'none':
    default:
      return isAutoFastForward(rollType);
  }
  // Default to midi's isAutoFastForward
  return isAutoFastForward(rollType);

}

function setRollDialogOptions(config: RollProcessConfig, dialog: RollDialogConfig, rollType: FastForwardRollType) {
  dialog.options ??= {};
  //@ts-expect-error
  const ADV_MODE = CONFIG.Dice.D20Roll.ADV_MODE;

  const sourceInfo = getAdvantageSourceInfo(config);

  // Determine dialog visibility (whether to show the roll configuration dialog)
  // If dialog.configure was explicitly set by the caller (a boolean, not undefined),
  // respect that value. This allows macros/code to pass configure: false to skip the
  // dialog or configure: true to force it, regardless of module settings.
  // Without this check, midi-qol's own advantage computation (setting config.advantage/
  // config.disadvantage) can cause getAdvantageSourceInfo to misidentify the roll as
  // coming from an external module (e.g. Flash Rolls), overriding the caller's intent.
  if (dialog.configure !== undefined) {
    // Caller explicitly set dialog.configure — preserve it
  } else if (sourceInfo.isExternalModule) {
    // External module (Flash Rolls, Monks TokenBar, Epic Rolls): use the module's own fast forward setting
    // Shift key toggle is handled below for modules that pass the event (Monks TokenBar)
    const moduleFastForward = getExternalModuleFastForward(sourceInfo, rollType);
    dialog.configure = !moduleFastForward;
  } else {
    // Standard midi-qol flow (character sheet rolls, checkSaves, etc.)
    if (config.midiOptions?.fastForward) dialog.configure = false;
    if (isAutoFastForward(rollType)) dialog.configure = false;
  }

  // Shift key toggle - only works if event is available
  // This handles: character sheet rolls, Monks TokenBar (has event),
  // but NOT Flash Rolls or Epic Rolls (no event when fast-forwarding)
  if (areMidiKeysPressed(config.event, "RollToggle")) {
    dialog.configure = !dialog.configure;
  }

  // Set advantage mode for the dialog (use source info + rolls[0].options for dnd5e native)
  const rollOptions = config.rolls?.[0]?.options;
  const hasAdvantage = sourceInfo.advantage || rollOptions?.advantage;
  const hasDisadvantage = sourceInfo.disadvantage || rollOptions?.disadvantage;

  if (hasAdvantage && !hasDisadvantage) {
    dialog.options.advantageMode = ADV_MODE.ADVANTAGE;
    dialog.options.defaultButton = "advantage";
  } else if (!hasAdvantage && hasDisadvantage) {
    dialog.options.advantageMode = ADV_MODE.DISADVANTAGE;
    dialog.options.defaultButton = "disadvantage";
  } else {
    dialog.options.advantageMode = ADV_MODE.NORMAL;
    dialog.options.defaultButton = "normal";
  }
}

/**
 * Applies pre-computed advantage/disadvantage to config if found.
 * Returns true if pre-computed values were found (caller should skip computing from flags).
 */
function applyPreComputedAdvantage(config: RollProcessConfig): boolean {
  const sourceInfo = getAdvantageSourceInfo(config);

  if (!sourceInfo.hasPreComputed) {
    return false;
  }

  // Apply to config if not already set
  config.advantage ??= sourceInfo.advantage;
  config.disadvantage ??= sourceInfo.disadvantage;

  return true;
}

function multiply(modifier: string) {
  const rgx = /mx([0-9])+/;
  const match = modifier.match(rgx);
  if (!match) return false;
  let [mult] = match.slice(1);
  const multiplier = parseInt(mult);
  for (let r of this.results) {
    r.count = multiplier * r.result;
    r.rerolled = true;
  }
  return true;
}

export function addDiceTermModifiers() {
  const Die = foundry.dice.terms.Die;
  Die.MODIFIERS["mx"] = "multiply";
  foundry.utils.setProperty(Die.prototype, "multiply", multiply);
}

export function averageDice(roll: Roll) {
  roll.terms = roll.terms.map(term => {
    if (term instanceof foundry.dice.terms.DiceTerm) {
      const mult = term.modifiers.includes("mx2") ? 2 : 1
      const newTerm = new NumericTerm({ number: Math.floor((term.number ?? 1) * mult * ((term.faces ?? 1) + 1) / 2) });
      newTerm.options = foundry.utils.duplicate(term.options);
      return newTerm;
    }
    return term;
  });
  roll.resetFormula();
  return roll;
}

function applyDamageModifiers(damageRoll: Roll): Roll {
  if (damageRoll.options?.["midi-qol"]?.modifiers?.length) {
    damageRoll.terms.forEach(term => {
      if (term instanceof foundry.dice.terms.DiceTerm) {
        term.modifiers ??= [];
        term.modifiers = term.modifiers.concat(damageRoll.options["midi-qol"].modifiers);
      }
    })
  }
  return damageRoll;
}

// @ts-expect-error no dnd5e-types
function configureDamage(this: CONFIG.Dice.DamageRoll, wrapped, options: any = { critical: {} }) {
  // Remove existing critical damage
  this.terms = this.terms.filter(t => !t.options.criticalBonusDamage && !t.options.criticalFlatBonus);
  this.terms.forEach(term => {
    if (term._number instanceof Roll) {
      // Complex number term.
      if (!term._number.isDeterministic) return;
      if (!term._number._evaluated) term._number.evaluateSync();
    }
    term.number = term.options.baseNumber ?? term.number;
    if (term.options.baseModifiers) {
      term.modifiers = foundry.utils.deepClone(term.options.baseModifiers);
    }
  });
  this.resetFormula();
  if (!this.configured) applyDamageModifiers(this);
  let useDefaultCritical = getCriticalDamage() === "default";
  useDefaultCritical ||= (getCriticalDamage() === "explodeCharacter" && this.data.actorType !== "character");
  useDefaultCritical ||= (getCriticalDamage() === "explodeNPC" && this.data.actorType !== "npc");
  if (this.options.critical?.allow === false || options.critical?.allow === false || !this.isCritical || useDefaultCritical) {
    options.critical.allow = this.isCritical;
    this.options.isCritical = this.isCritical;
    //@ts-expect-error "dnd5e"
    options.critical.multiplyNumeric ??= game.settings.get("dnd5e", "criticalDamageModifiers");
    //@ts-expect-error "dnd5e"
    options.critical.powerfulCritical ??= game.settings.get("dnd5e", "criticalDamageMaxDice");
    wrapped({ critical: options.critical });
    // if (this.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") averageDice(this);
    return;
  }
  this.simplify();
  const OperatorTerm = foundry.dice.terms.OperatorTerm
  const DiceTerm = foundry.dice.terms.DiceTerm;
  const Die = foundry.dice.terms.Die;

  // if (this.options.configured) return; seems this is not required.
  let bonusTerms: foundry.dice.terms.RollTerm[] = [];
  /* criticalDamage is one of 
    "default": "DND5e Settings Only",
    "maxDamage": "Max Normal Damage",
    "maxCrit": "Max Critical Dice (flat number)",
    "maxCritRoll": "Max Critical Dice (roll dice)",
    "maxAll": "Max All Dice",
    "doubleDice": "Double Rolled Damage",
    "explode": "Explode all critical dice",
    "explodePlayer": "Explode Player critical dice",
    "explodeGM": "Explode GM crtical dice",
    "baseDamage": "Only Weapon Extra Critical",
    "maxBaseRollCrit": "Max base damage and roll critical dice",
    "bestOfTwo": "Best of two rolls",
  },
 */
  // if (criticalDamage === "doubleDice") this.options.multiplyNumeric = true;
  this.simplify();


  for (let [i, term] of this.terms.entries()) {
    let cm = this.options.critical?.multiplier ?? 2;
    let cb = (this.options.critical?.bonusDice && (i === 0)) ? this.options.critical?.bonusDice : 0;
    if (term._number instanceof Roll) {
      // Complex number term.
      if (!term._number.isDeterministic) continue;
      if (!term._number._evaluated) term._number.evaluateSync();
    }
    if (term.modifiers && !term.options.baseModifiers) {
      term.options.baseModifiers = foundry.utils.deepClone(term.modifiers);
    }
    if (term.modifiers) {
      term.modifiers = foundry.utils.deepClone(term.options.baseModifiers);
    }
    term.options.baseNumber = term.options.baseNumber ?? term.number;
    term.number = term.options.baseNumber;

    switch (getCriticalDamage()) {
      case "maxDamage":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        break;
      case "maxDamageExplode":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        if (term instanceof DiceTerm) {
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = foundry.utils.deepClone(term.options)
          //@ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "maxCrit":  // Powerful critical
      case "maxCritRoll":
        if (term instanceof DiceTerm) {
          let critTerm;
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          if (getCriticalDamage() === "maxCrit")
            critTerm = new NumericTerm({ number: (term.number + cb) * (term.faces ?? 1) });
          else {
            critTerm = new Die({ number: term.number + cb, faces: term.faces });
            critTerm.modifiers = foundry.utils.deepClone(term.modifiers);
            critTerm.modifiers.push(`min${term.faces}`);
          }
          critTerm.options = foundry.utils.deepClone(term.options);
          critTerm.options.criticalBonusDamage = true;
          bonusTerms.push(critTerm);
        } else if (term instanceof NumericTerm && options.multiplyNumeric) {
          term.number *= cm;
        }
        break;
      case "maxAll":
        if (term instanceof DiceTerm) {
          term.alter(cm, cb);
          term.modifiers.push(`min${term.faces}`);
        } else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
          term.number *= cm;
        }
        break;
      case "bestOfTwo":
        if (term instanceof DiceTerm) {
          term.modifiers.push(`kh${term.number !== 1 ? term.number : ""}`);
          term.number = (term.number ?? 1) * 2;
        }
        break;
      case "doubleDice":
        if (term instanceof DiceTerm) {
          //term.alter(cm, cb);
          term.modifiers.push("mx2");
        } else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
          term.number *= cm;
        }
        break;
      case "explode":
      case "explodeCharacter":
      case "explodeNPC":
        if (term instanceof DiceTerm) {
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = foundry.utils.deepClone(term.options);
          //@ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "maxBaseRollCrit":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        if (term instanceof DiceTerm) {
          //@ts-expect-error no dnd5e-types
          bonusTerms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
          const newTerm = new Die({ number: term.number, faces: term.faces })
          newTerm.options = foundry.utils.deepClone(term.options);
          // @ts-expect-error no dnd5e-types
          newTerm.options.criticalBonusDamage = true;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "baseDamage":
      default:
        break;
    }
  }
  if (bonusTerms.length > 0) this.terms.push(...bonusTerms);
  if (this.options.critical?.bonusDamage) {
    const extra = new Roll(this.options.critical.bonusDamage, this.data);
    for (let term of extra.terms) {
      if (term instanceof DiceTerm || term instanceof NumericTerm)
        if (!term.options?.flavor) term.options = foundry.utils.deepClone(this.terms[0].options);
      //@ts-expect-error
      term.options.criticalBonusDamage = true;
    }
    if (!(extra.terms[0] instanceof OperatorTerm))
      //@ts-expect-error no dnd5e-types
      this.terms.push(new OperatorTerm({ operator: "+", options: { criticalBonusDamage: true } }));
    this.terms.push(...extra.terms);
  }
  while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
    this.terms.pop();
  this.resetFormula();
  this.options.configured = true;
  // if (this.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") averageDice(this);
}

async function doRollAbility(this: Actor.Implementation, wrapped, rollType: string, config: RollProcessConfig & { ability?: string } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  let oldFormat = false;
  if (config.midiOptions?.target) config.target = config.midiOptions.target;
  if (config.midiOptions?.isConcentrationCheck) {
    foundry.utils.setProperty(message, "data.flags.midi-qol.isConcentrationCheck", true);
    config.midiOptions.isConcentrationCheck = false; // remove the isConcentrationCheck option so we won't infinitely recurse
    // Note to self concentration max/min value is now handled directly by dnd5e - so the flag has changed
    // @ts-expect-error no dnd5e-types
    return this.rollConcentration(config, dialog, message);
  }
  message.data ??= {};
  config.midiOptions ??= {};
  let abilityId = config.ability;
  let overtimeActorUuid: string | undefined;
  let preRollAbilityHookId: number | undefined;
  let rollAbilityHookId: number | undefined;
  const saveRollMode: keyof CONFIG.Dice.RollModes = safeGetGameSetting("core", "rollMode");
  let result: Roll[] | undefined;
  let type: "SavingThrow" | "AbilityCheck" = "SavingThrow";
  try {
    if (config.event) {
      // @ts-expect-error we know better
      const target = config?.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
      if (target?.dataset?.midiOvertimeActorUuid) {
        overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
        message.rollMode = target.dataset.midiRollMode ?? message.rollMode;
      }
      if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
        const actualActor = fromUuidSync(overtimeActorUuid) as Actor.Implementation | undefined;
        if (actualActor && rollType === "save")
          //@ts-expect-error no dnd5e types
          return actualActor.rollSavingThrow(config, dialog, message);
        //@ts-expect-error no dnd5e types
        else if (actualActor) return actualActor.rollAbilityCheck(config, dialog, message);
      }
    }

    if (config.target !== undefined && !checkRule("criticalSaves") && config.midiOptions) { // We have a target value, which means we are checking for success and not criticals
      config.midiOptions.critical = 21;
      config.midiOptions.fumble = 0;
    }

    let hasPreComputedAdvantage = false;
    if (!config.midiOptions.ignorePreComputedAdvantage) {
      hasPreComputedAdvantage = applyPreComputedAdvantage(config);
      if (hasPreComputedAdvantage && isAutoFastForward(rollType as FastForwardRollType)) {
        config.midiOptions.fastForward = true;
      }
    }
    if (!hasPreComputedAdvantage) {
      if (!config.midiOptions.workflow && config.midiOptions.workflowId) {
        config.midiOptions.workflow = Workflow.getWorkflow(config.midiOptions.workflowId);
      }
      const abilityResult = await computeAbilityAdvantage(this, rollType, abilityId ?? "", config.midiOptions);
      config.advantage = abilityResult.tracker.hasAdvantage;
      config.disadvantage = abilityResult.tracker.hasDisadvantage;
    }

    type = rollType === "save" ? "SavingThrow" : "AbilityCheck";
    let success: boolean | undefined;
    if (success === undefined) {
      const saveCreate = message.create;
      message.create = false;
      const abilityModifierFlags: RollModifierFlags = {
        failFlags: ["fail.all", "fail.ability.all", `fail.ability.${rollType}.all`, `fail.ability.${rollType}.${abilityId}`],
        successFlags: ["success.all", "success.ability.all", `success.ability.${rollType}.all`, `success.ability.${rollType}.${abilityId}`],
        maxFlags: [`max.ability.${rollType}.${abilityId}`, `max.ability.${rollType}.all`],
        minFlags: [`min.ability.${rollType}.${abilityId}`, `min.ability.${rollType}.all`]
      };

      // Get modifiers once, use in both hooks
      let abilityModifiers: RollModifierResult | undefined;

      // Try to get workflow from config, falling back to workflowId lookup
      let workflow = config.midiOptions?.workflow;
      if (!workflow && config.midiOptions?.workflowId) {
        workflow = Workflow.getWorkflow(config.midiOptions.workflowId);
      }
      const midiOptions = config.midiOptions;
      // Try to find existing tracker from workflow's targetSaveDetails by matching actorUuid
      // This allows hooks called before the roll (e.g., preTargetSave) to modify the tracker
      let rollModifierTracker: RollModifierTracker | undefined;
      if (workflow?.targetSaveDetails) {
        for (const saveDetails of workflow.targetSaveDetails.values()) {
          if (saveDetails.actorUuid === this.uuid) {
            rollModifierTracker = saveDetails.modifierTracker;
            break;
          }
        }
      }
      // Fall back to creating a new tracker if not found
      rollModifierTracker ??= new RollModifierTracker();
      preRollAbilityHookId = Hooks.once(`dnd5e.preRoll${type}`, (configData, dialogData, _message) => {
        // Merge midiOptions to ensure fastForward and other values are preserved even if dnd5e creates an empty midiOptions object
        // Use shallow merge to avoid stack overflow from circular references in workflow
        configData.midiOptions = { ...(configData.midiOptions ?? {}), ...(midiOptions ?? {}) };
        computeRollModifiers(this, abilityModifierFlags, rollModifierTracker, { workflow });
        abilityModifiers = applyRollModifiers(rollModifierTracker, configData, dialogData);
        if (abilityModifiers.autoFail) {
          success = false;
        }
        setRollDialogOptions(configData, dialogData, rollType as FastForwardRollType);
      });

      rollAbilityHookId = Hooks.once(`dnd5e.post${type}RollConfiguration`, (rolls, configData, dialogData, messageDetails) => {
        // record the configured message data for later display
        message = messageDetails;
      });
      if (this.token) foundry.utils.setProperty(dialog, "options.window.subtitle", this.token.name);

      result = await wrapped(config, dialog, message);
      message.create = saveCreate;
    }
    if (!result) return result;
    if (result instanceof Roll) {
      console.warn("midi-qol | doRollAbility: result is a Roll, not an array of Rolls");
      result = [result];
    }

    let rollMode: keyof CONFIG.Dice.RollModes = message.rollMode ?? (safeGetGameSetting("core", "rollMode") as keyof CONFIG.Dice.RollModes);
    if ([CONST.DICE_ROLL_MODES.PUBLIC, "roll", CONST.DICE_ROLL_MODES.PRIVATE].includes(rollMode)) {
      let blindRollSetting: boolean | undefined;
      if (rollType === "check")
        blindRollSetting = configSettings.rollChecksBlind.includes("all") || configSettings.rollChecksBlind.includes(abilityId ?? "");
      else if (rollType === "save")
        blindRollSetting = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes(abilityId ?? "");
      if (blindRollSetting) {
        rollMode = CONST.DICE_ROLL_MODES.BLIND;
        game.settings.set("core", "rollMode", CONST.DICE_ROLL_MODES.BLIND);
      }

    }
    if (config.rollMode) {
      console.warn("midi-qol | doRollAbility: config.rollMode is deprecated, use message.rollMode instead");
      message.rollMode ??= config.rollMode;
    }
    if (rollMode !== CONST.DICE_ROLL_MODES.BLIND) rollMode = message.rollMode ?? config.rollMode ?? rollMode;
    // @ts-expect-error
    result.forEach(r => r.options.rollMode = rollMode);
    await displayDSNForRoll(result, rollType, rollMode);
    DSNMarkDiceDisplayed(result);
    foundry.utils.mergeObject(message.data, { "flags": config.flags ?? {} });
    // Set overtimeActorUuid AFTER message object is replaced by hook and merged
    if (overtimeActorUuid) {
      foundry.utils.setProperty(message.data, "flags.midi-qol.overtimeActorUuid", overtimeActorUuid);
    }
    if (!config.midiOptions.simulate) {
      result[0] = await bonusCheck(this, result[0], rollType, abilityId, message.data);
      DSNMarkDiceDisplayed(result);
      // @ts-expect-error no dnd5e-types
      if (Number.isNumeric(result[0].options.target) && result[0].isSuccess === false) {
        const failFlagsLength = collectBonusFlags(this, rollType, "fail.all").length;
        const failAbilityFlagsLength = collectBonusFlags(this, rollType, `fail.${abilityId}`).length
        if (failFlagsLength || failAbilityFlagsLength) {
          // If the roll fails and there is an flags.midi-qol.save.fail then apply the bonus
          result[0] = await bonusCheck(this, result[0], rollType, failAbilityFlagsLength ? `fail.${abilityId}` : "fail.all", message.data);
        }
      }
    }

    if (message.create !== false && result) {
      // const cls = getDocumentClass("ChatMessage");
      // const msg = cls.create(message.data, { rollMode });
      //@ts-expect-error
      CONFIG.Dice.D20Roll.toMessage(result, message.data, { rollMode, create: true });
    }
    if (saveRollMode) game.settings.set("core", "rollMode", saveRollMode);
    if (abilityId) await expireRollEffect.bind(this)(rollType, abilityId, success);
    if (config.midiOptions.isConcentrationCheck) {
      // @ts-expect-error no dnd5e-types
      if (success === undefined && result?.[0]?.isSuccess !== undefined) success = result[0].isSuccess;
      expireRollEffect.bind(this)("isConcentrationSave", "", success);
    }
  } catch (err) {
    const message = `doRollAbility error ${this.name} ${abilityId} ${rollType} ${this.uuid}`;
    TroubleShooter.recordError(err, message);
    error(message, err);
  } finally {
    if (preRollAbilityHookId) Hooks.off(`dnd5e.preRoll${type}`, preRollAbilityHookId);
    if (rollAbilityHookId) Hooks.off(`dnd5e.post${type}RollConfiguration`, rollAbilityHookId);
    if (saveRollMode) game.settings.set("core", "rollMode", saveRollMode);
    return oldFormat ? result?.[0] : result
  }
}

export async function rollSavingThrow(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  return doRollAbility.bind(this)(wrapped, "save", config, dialog, message);
}

async function rollAbilityCheck(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  return doRollAbility.bind(this)(wrapped, "check", config, dialog, message);
}

async function rollDeathSave(this: Actor.Implementation, wrapped, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  config.midiOptions ??= {};
  const deathSaveBonus = this.flags?.[MODULE_ID]?.deathSaveBonus;

  let hasPreComputedAdvantage = false;
  if (!config.midiOptions.ignorePreComputedAdvantage) {
    hasPreComputedAdvantage = applyPreComputedAdvantage(config);
    if (hasPreComputedAdvantage && isAutoFastForward("save")) {
      config.midiOptions.fastForward = true;
    }
  }
  if (!hasPreComputedAdvantage) {
    // Build death save advantage/disadvantage flags
    const advantageFlags: AdvantageFlags = {
      advantageFlags: ["advantage.all", "advantage.deathSave"],
      disadvantageFlags: ["disadvantage.all", "disadvantage.deathSave"],
      // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
      noAdvantageFlags: ["noAdvantage.all", "noAdvantage.deathSave"],
      noDisadvantageFlags: ["noDisadvantage.all", "noDisadvantage.deathSave"],
      systemRollModeFields: ["attributes.death.roll.mode"]
    };

    // Process advantage/disadvantage flags using centralized helper
    // For death saves, source actor is the caster (if any workflow exists)
    const tracker = await computeAdvantageFlags(this, advantageFlags, {
      ...config.midiOptions,
      sourceActor: config.midiOptions.workflow?.actor
    });
    config.advantage = tracker.hasAdvantage;
    config.disadvantage = tracker.hasDisadvantage;
  }

  let advantage = config.advantage;
  let disadvantage = config.disadvantage;

  const options: MidiOptions = { advantage, disadvantage };

  // Handle death save bonus
  if (deathSaveBonus) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
    let bonus: any;
    if (typeof deathSaveBonus === "number") {
      bonus = deathSaveBonus;
    } else {
      bonus = await evalAllConditionsAsync(this, "flags.midi-qol.deathSaveBonus", conditionData);
    }
    if (bonus) {
      options.parts = [bonus];
    }
  }

  foundry.utils.mergeObject(config.midiOptions, options);
  config.advantage = advantage;
  config.disadvantage = disadvantage;
  const blindSaveRoll = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes("death");
  const actor = this;

  const rollModifierTracker = new RollModifierTracker();
  const preRollHookId = Hooks.once("dnd5e.preRollDeathSave", (configData, dialogData, messageData) => {
    // Apply roll modifiers (auto-fail/auto-success) for death saves
    const modifierFlags: RollModifierFlags = {
      failFlags: ["fail.all", "fail.deathSave"],
      successFlags: ["success.all", "success.deathSave"],
      maxFlags: [],
      minFlags: []
    };
    computeRollModifiers(actor, modifierFlags, rollModifierTracker);
    const modifiers = applyRollModifiers(rollModifierTracker, configData, dialogData, { failValue: 2, successValue: 19 });
    const { autoFail, autoSuccess } = modifiers;

    for (let roll of configData.rolls ?? []) {
      roll.options ??= {};
      roll.options.advantage = configData.midiOptions?.advantage;
      roll.options.disadvantage = configData.midiOptions?.disadvantage;
      if (!autoFail && !autoSuccess && configData.midiOptions?.parts?.length) roll.parts = [...(roll.parts ?? []), ...configData.midiOptions.parts];
      if (blindSaveRoll) roll.options.rollMode = CONST.DICE_ROLL_MODES.BLIND;
    }
    setRollDialogOptions(configData, dialogData, "save");
    if (blindSaveRoll) messageData.rollMode = CONST.DICE_ROLL_MODES.BLIND;
  });

  try {
    return await wrapped(config, dialog, message);
  } finally {
    if (preRollHookId) Hooks.off("dnd5e.preRollDeathSave", preRollHookId);
  }
}

export function deathSaveHook(rolls: Roll[], { chatString, subject: actor }: { chatString: string; updates: Actor.UpdateData; subject: Actor.Implementation }) {
  if (configSettings.keepRollStats && actor) {
    if (rolls instanceof Roll) rolls = [rolls];
    let successes = 0;
    let failures = 0;
    for (const roll of rolls) {
      // @ts-expect-error no dnd5e-types
      if (roll.isCritical) successes += 2;
      // @ts-expect-error no dnd5e-types
      else if (roll.isFumble) failures += 2;
      // @ts-expect-error no dnd5e-types
      else if (roll.isFailure) failures += 1;
      else successes += 1;
    }
    gameStats.addDeathSaveResult(actor, successes, failures);
  }
  if (chatString === "DND5E.DeathSaveFailure") {
    if (hasCondition(actor, "unconscious")) {
      const _id = CONFIG.statusEffects.find(e => e.id === "unconscious")?._id;
      const effect = actor.effects.find(e => e._id === _id);
      if (effect) effect.setFlag("core", "overlay", false);
    }
    const status = getDeadStatus();
    if (!status) return;
    setDeadStatus(actor, { effect: status, useDefeated: true, makeDead: true, overlay: true });
  }
}

export function procAutoFail(actor: Actor.Implementation, rollType: string, abilityId: string): boolean {
  const midiFlags = actor.flags[MODULE_ID] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.ability || fail.all) {
    const rollFlags = (fail.ability && fail.ability[rollType]) ?? {};
    const autoFail = fail.all || fail.ability?.all || rollFlags.all || rollFlags[abilityId];
    return !!autoFail;
  }
  return false;
}

export function procAutoFailSkill(actor: Actor.Implementation, skillId?: string): boolean {
  const midiFlags = actor.flags[MODULE_ID] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.skill || fail.all) {
    const rollFlags = (fail.skill && fail.skill[skillId ?? ""]) || false;
    const autoFail = fail.all || fail.skill?.all || rollFlags;
    return !!autoFail;
  }
  return false;
}

export async function computeAbilityAdvantage(actor: Actor.Implementation, rollType: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<{ tracker: RollModifierTracker, magicResistance: boolean, magicVulnerability: boolean }> {
  // Create RollModifierTracker if not provided (will be discarded by caller if they don't need attribution)
  tracker = tracker ?? new RollModifierTracker();

  // Create a copy of relevant options to avoid modifying the original
  const effectiveOptions = { ...options };
  let magicResistance = false;
  let magicVulnerability = false;

  // Check magic resistance/vulnerability for magic saves first using centralized function
  if (rollType === "save" && options.isMagicSave) {
    const magicCheck = await checkMagicResistanceAndVulnerability(actor, abilityId);
    if (magicCheck.advantage) {
      tracker.advantage.add("magicResistance", "Magic Resistance");
    }
    if (magicCheck.disadvantage) {
      tracker.disadvantage.add("magicVulnerability", "Magic Vulnerability");
    }
    magicResistance = magicCheck.magicResistance;
    magicVulnerability = magicCheck.magicVulnerability;
  }

  // Build advantage/disadvantage flags to check
  // Using new consistent naming: advantage.save.all, advantage.check.all (matches attack/skill/tool pattern)
  // Also include deprecated flags (advantage.ability.save.*, advantage.ability.check.*) for backwards compatibility
  const abilityFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.ability.all",
      `advantage.${rollType}.all`,
      `advantage.${rollType}.${abilityId}`,
      // Deprecated flags - will emit warning when used
      `advantage.ability.${rollType}.all`,
      `advantage.ability.${rollType}.${abilityId}`
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.ability.all",
      `disadvantage.${rollType}.all`,
      `disadvantage.${rollType}.${abilityId}`,
      // Deprecated flags - will emit warning when used
      `disadvantage.ability.${rollType}.all`,
      `disadvantage.ability.${rollType}.${abilityId}`
    ],
    // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
    noAdvantageFlags: [
      "noAdvantage.all",
      `noAdvantage.${rollType}.all`,
      `noAdvantage.${rollType}.${abilityId}`
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      `noDisadvantage.${rollType}.all`,
      `noDisadvantage.${rollType}.${abilityId}`
    ],
    systemRollModeFields: [`abilities.${abilityId}.${rollType}.roll.mode`],
    // Track which flags are deprecated for warning generation
    deprecatedFlags: new Set([
      `advantage.ability.${rollType}.all`,
      `advantage.ability.${rollType}.${abilityId}`,
      `disadvantage.ability.${rollType}.all`,
      `disadvantage.ability.${rollType}.${abilityId}`
    ])
  };

  // Add source actor grants flags for saves and checks
  if (rollType === "save" || rollType === "check") {
    abilityFlags.sourceAdvantageFlags = ["grants.advantage.all", `grants.advantage.${rollType}.all`, `grants.advantage.${rollType}.${abilityId}`];
    abilityFlags.sourceDisadvantageFlags = ["grants.disadvantage.all", `grants.disadvantage.${rollType}.all`, `grants.disadvantage.${rollType}.${abilityId}`];
    abilityFlags.sourceNoAdvantageFlags = ["grants.noAdvantage.all", `grants.noAdvantage.${rollType}.all`, `grants.noAdvantage.${rollType}.${abilityId}`];
    abilityFlags.sourceNoDisadvantageFlags = ["grants.noDisadvantage.all", `grants.noDisadvantage.${rollType}.all`, `grants.noDisadvantage.${rollType}.${abilityId}`];
  }

  // For saves/checks, source actor is the caster (workflow.actor)
  // Pass tracker to be populated with attribution
  await computeAdvantageFlags(actor, abilityFlags, {
    ...effectiveOptions,
    sourceActor: effectiveOptions.workflow?.actor
  }, tracker);
  return { tracker: tracker, magicResistance, magicVulnerability };
}

export async function computeSkillAdvantage(actor: Actor.Implementation, skillId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker> {
  // @ts-expect-error no dnd5e-types
  const abilityId = actor.system?.skills?.[skillId]?.ability ?? "";

  // Build skill advantage/disadvantage flags
  const skillFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.skill.all",
      `advantage.skill.${skillId}`
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.skill.all",
      `disadvantage.skill.${skillId}`
    ],
    // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
    noAdvantageFlags: [
      "noAdvantage.all",
      "noAdvantage.skill.all",
      `noAdvantage.skill.${skillId}`
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      "noDisadvantage.skill.all",
      `noDisadvantage.skill.${skillId}`
    ],
    systemRollModeFields: [`skills.${skillId}.roll.mode`],
    // Source grants flags for skills (checked on workflow.actor, e.g., caster)
    sourceAdvantageFlags: ["grants.advantage.all", "grants.advantage.skill.all", `grants.advantage.skill.${skillId}`],
    sourceDisadvantageFlags: ["grants.disadvantage.all", "grants.disadvantage.skill.all", `grants.disadvantage.skill.${skillId}`],
    sourceNoAdvantageFlags: ["grants.noAdvantage.all", "grants.noAdvantage.skill.all", `grants.noAdvantage.skill.${skillId}`],
    sourceNoDisadvantageFlags: ["grants.noDisadvantage.all", "grants.noDisadvantage.skill.all", `grants.noDisadvantage.skill.${skillId}`]
  };

  // If the skill has an associated ability, also check ability-based flags
  if (abilityId) {
    // Add skill flags for the ability (e.g., advantage.skill.dex for all dex-based skills)
    skillFlags.advantageFlags.push(`advantage.skill.${abilityId}`);
    skillFlags.disadvantageFlags.push(`disadvantage.skill.${abilityId}`);
    // Add noAdvantage/noDisadvantage for ability-based skill
    skillFlags.noAdvantageFlags?.push(`noAdvantage.skill.${abilityId}`);
    skillFlags.noDisadvantageFlags?.push(`noDisadvantage.skill.${abilityId}`);
    // Add source grants for ability-based skill
    skillFlags.sourceAdvantageFlags?.push(`grants.advantage.skill.${abilityId}`);
    skillFlags.sourceDisadvantageFlags?.push(`grants.disadvantage.skill.${abilityId}`);
    skillFlags.sourceNoAdvantageFlags?.push(`grants.noAdvantage.skill.${abilityId}`);
    skillFlags.sourceNoDisadvantageFlags?.push(`grants.noDisadvantage.skill.${abilityId}`);

    // If skillAbilityCheckAdvantage is enabled, also check ability check flags
    if (configSettings.skillAbilityCheckAdvantage) {
      // New flag names (preferred)
      skillFlags.advantageFlags.push("advantage.ability.all", "advantage.check.all", `advantage.check.${abilityId}`);
      skillFlags.disadvantageFlags.push("disadvantage.ability.all", "disadvantage.check.all", `disadvantage.check.${abilityId}`);
      // Deprecated flag names (for backwards compatibility)
      skillFlags.advantageFlags.push("advantage.ability.check.all", `advantage.ability.check.${abilityId}`);
      skillFlags.disadvantageFlags.push("disadvantage.ability.check.all", `disadvantage.ability.check.${abilityId}`);
      // Track deprecated flags for warning generation
      skillFlags.deprecatedFlags = new Set([
        "advantage.ability.check.all",
        `advantage.ability.check.${abilityId}`,
        "disadvantage.ability.check.all",
        `disadvantage.ability.check.${abilityId}`
      ]);
    }
  }

  // For skills, source actor is the caster (workflow.actor) if any
  // Create RollModifierTracker if not provided
  tracker ??= new RollModifierTracker();
  await computeAdvantageFlags(actor, skillFlags, {
    ...options,
    sourceActor: options.workflow?.actor
  }, tracker);
  return tracker;
}

export async function computeToolAdvantage(actor: Actor.Implementation, toolId: string, abilityId: string, options: MidiOptions, tracker?: RollModifierTracker): Promise<RollModifierTracker> {
  // Build tool advantage/disadvantage flags
  const toolFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.tool.all",
      `advantage.tool.${toolId}`
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.tool.all",
      `disadvantage.tool.${toolId}`
    ],
    // Actor noAdvantage/noDisadvantage flags (prevent actor's own advantage/disadvantage)
    noAdvantageFlags: [
      "noAdvantage.all",
      "noAdvantage.tool.all",
      `noAdvantage.tool.${toolId}`
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      "noDisadvantage.tool.all",
      `noDisadvantage.tool.${toolId}`
    ],
    systemRollModeFields: [], // dnd5e doesn't have native tool roll modes
    // Source grants flags for tools (checked on workflow.actor, e.g., caster)
    sourceAdvantageFlags: ["grants.advantage.all", "grants.advantage.tool.all", `grants.advantage.tool.${toolId}`],
    sourceDisadvantageFlags: ["grants.disadvantage.all", "grants.disadvantage.tool.all", `grants.disadvantage.tool.${toolId}`],
    sourceNoAdvantageFlags: ["grants.noAdvantage.all", "grants.noAdvantage.tool.all", `grants.noAdvantage.tool.${toolId}`],
    sourceNoDisadvantageFlags: ["grants.noDisadvantage.all", "grants.noDisadvantage.tool.all", `grants.noDisadvantage.tool.${toolId}`]
  };

  // If the tool has an associated ability, also check ability check flags
  if (abilityId) {
    // New flag names (preferred)
    toolFlags.advantageFlags.push("advantage.ability.all", "advantage.check.all", `advantage.check.${abilityId}`);
    toolFlags.disadvantageFlags.push("disadvantage.ability.all", "disadvantage.check.all", `disadvantage.check.${abilityId}`);
    // Add noAdvantage/noDisadvantage for ability-based check
    toolFlags.noAdvantageFlags?.push(`noAdvantage.check.all`, `noAdvantage.check.${abilityId}`);
    toolFlags.noDisadvantageFlags?.push(`noDisadvantage.check.all`, `noDisadvantage.check.${abilityId}`);
    // Deprecated flag names (for backwards compatibility)
    toolFlags.advantageFlags.push("advantage.ability.check.all", `advantage.ability.check.${abilityId}`);
    toolFlags.disadvantageFlags.push("disadvantage.ability.check.all", `disadvantage.ability.check.${abilityId}`);
    // Track deprecated flags for warning generation
    toolFlags.deprecatedFlags = new Set([
      "advantage.ability.check.all",
      `advantage.ability.check.${abilityId}`,
      "disadvantage.ability.check.all",
      `disadvantage.ability.check.${abilityId}`
    ]);
  }

  // For tools, source actor is the caster (workflow.actor) if any
  // Create RollModifierTracker if not provided
  tracker ??= new RollModifierTracker();
  await computeAdvantageFlags(actor, toolFlags, {
    ...options,
    sourceActor: options.workflow?.actor
  }, tracker);
  return tracker;
}

let debouncedATRefresh = foundry.utils.debounce(_midiATIRefresh, 30);
function _midiATIRefresh(template: foundry.canvas.placeables.MeasuredTemplate.Implementation) {
  // We don't have an item to check auto targeting with, so just use the midi setting
  if (!canvas.tokens) return;
  // @ts-expect-error no dnd5e-types
  let autoTarget = getActivityAutoTargetAction(template.activity);
  if (autoTarget === "none") return;
  if (autoTarget === "dftemplates" && installedModules.get("df-templates"))
    return; // df-templates will handle template targeting.

  if (installedModules.get("levelsvolumetrictemplates") && !["walledtemplates"].includes(autoTarget)) {
    //@ts-expect-error CONFIG.Levels
    const levelsTemplateData = CONFIG.Levels.handlers.TemplateHandler.getTemplateData(false);
    if (!template.document.elevation !== levelsTemplateData.elevation) {
      template.document.elevation = levelsTemplateData.elevation;
    }
    // Filter which tokens to pass - not too far wall blocking is left to levels.
    let distance = template.document.distance;
    const dimensions = canvas.dimensions || { size: 1, distance: 1 };
    distance *= dimensions.size / dimensions.distance;
    const tokens: Token[] | undefined = canvas.tokens.placeables;
    const tokensToCheck = tokens?.filter(tk => {
      const r: Ray = new foundry.canvas.geometry.Ray(
        { x: template.document?.x ?? template.x, y: template.document?.y ?? template.y },
        { x: tk.x + tk.document.width * dimensions.size, y: tk.y + tk.document.height * dimensions.size }
      );
      const maxExtension = (1 + Math.max(tk.document.width, tk.document.height)) * dimensions.size;
      const centerDist = r.distance;
      if (centerDist > distance + maxExtension) return false;
      if (["alwaysIgnoreIncapacitated", "wallsBlockIgnoreIncapacitated"].includes(autoTarget) && checkIncapacitated(tk, debugEnabled > 0, false))
        return false;
      if (["alwaysIgnoreDefeated", "wallsBlockIgnoreDefeated"].includes(autoTarget) && checkDefeated(tk))
        return false;
      return true;
    })

    if (tokensToCheck && tokensToCheck.length > 0) {
      //@ts-expect-error compute3Dtemplate(t, tokensToCheck = canvas.tokens.placeables)
      VolumetricTemplates.compute3Dtemplate(template, tokensToCheck);
    }
  } else {
    const distance: number = template.document.distance ?? 0;
    // @ts-expect-error no dnd5e-types
    if (template.activity && tokenForActor(template.item.parent)) {
      // TODO (Michael): HERE! RIGHT HERE!
      // @ts-expect-error no dnd5e-types
      const ignoreSelf = (template.activity?.target.affects.special ?? "").split(";").some((spec: string) => spec === "self"); // TODO targeting changes
      // @ts-expect-error no dnd5e-types
      templateTokens(template, tokenForActor(template.item.parent), ignoreSelf, getAoETargetType(template.activity), autoTarget);
      return true;
    } else
      templateTokens(template);
    return true;
  }
  return true;
}

function midiATRefresh(this: foundry.canvas.placeables.MeasuredTemplate.Implementation, wrapped) {
  debouncedATRefresh(this);
  return wrapped();
}

export function _prepareDerivedData(this: Actor.Implementation, wrapped, ...args) {
  wrapped(...args);
  try {
    // @ts-expect-error no dnd5e-types
    if (!this.system.abilities?.dex) return;
    if (![false, undefined, "none"].includes(checkRule("challengeModeArmor") as boolean | undefined | string)) {
      // @ts-expect-error no dnd5e-types
      const armorDetails = this.system.attributes.ac ?? {};
      const ac = armorDetails?.value ?? 10;
      const equippedArmor = armorDetails.equippedArmor;
      let armorAC = equippedArmor?.system.armor.value ?? 10;
      const equippedShield = armorDetails.equippedShield;
      const shieldAC = equippedShield?.system.armor.value ?? 0;

      if (checkRule("challengeModeArmor") !== "challenge") {
        switch (armorDetails.calc) {
          // @ts-expect-error no dnd5e-types
          case 'flat': armorAC = (ac.flat ?? 10) - this.system.abilities.dex.mod; break;
          case 'draconic': armorAC = 13; break;
          // @ts-expect-error no dnd5e-types
          case 'natural': armorAC = (armorDetails.value ?? 10) - this.system.abilities.dex.mod; break;
          case 'custom': armorAC = equippedArmor?.system.armor.value ?? 10; break;
          case 'mage': armorAC = 13; break; // perhaps this should be 10 if mage armor is magic bonus
          case 'unarmoredMonk': armorAC = 10; break;
          case 'unarmoredBarb': armorAC = 10; break;
          default: armorAC = armorDetails.equippedArmor?.system.armor.value ?? 10; break;
        };
        const armorReduction = armorAC - 10 + shieldAC;
        const ec = ac - armorReduction;
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.EC = ec;
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.AR = armorReduction;
      } else {
        // @ts-expect-error no dnd5e-types
        if (!this.system.abilities) {
          error("challenge mode armor failed to find abilities");
          error(this);
          return;
        }
        // @ts-expect-error no dnd5e-types
        let dexMod = this.system.abilities.dex.mod;
        if (equippedArmor?.system.armor.type === "heavy") dexMod = 0;
        if (equippedArmor?.system.armor.type === "medium") dexMod = Math.min(dexMod, 2);
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.EC = 10 + dexMod + shieldAC;
        // @ts-expect-error no dnd5e-types
        this.system.attributes.ac.AR = ac - 10 - dexMod;
      }
    }
  } catch (err) {
    const message = "midi-qol failed to prepare derived data";
    error(message, err);
    TroubleShooter.recordError(err, message);
  }
}

export function initPatching() {
  libWrapper = globalThis.libWrapper;
  const ChatLog = foundry.applications.sidebar.tabs.ChatLog;
  // TODO this needs more work libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.migrateData", removeMidiProperties, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareDerivedData", _prepareDerivedData, "WRAPPER");
  // For new onUse macros stuff.
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.prepareData", itemPrepareData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareData", actorPrepareData, "WRAPPER");
  // I think this can be removed in v13 libWrapper.register(MODULE_ID, "KeyboardManager.prototype._onFocusIn", _onFocusIn, "OVERRIDE");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getRollData", actorGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.getRollData", itemGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._preCreate", _preCreateActiveEffect, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.D20Roll.prototype.configureModifiers", _configureModifiers, "WRAPPER");
  libWrapper.register(MODULE_ID, "dnd5e.applications.actor.BaseActorSheet.prototype._prepareItem", _prepareItem, "WRAPPER");

  // Setup document classes with both dnd5e's DependentDocumentMixin (for flag-based tracking)
  // and MidiDependentDocumentMixin (for our registry-based tracking of Actor/Item parents)
  // This allows dnd5e.dependentOn flag to work for all parent types

  // MeasuredTemplate, Token, AmbientLight need dnd5e's mixin added (not in their base class)
  class MidiMeasuredTemplateDocument extends MidiDependentDocumentMixin(
    globalThis.dnd5e.documents.mixins.DependentDocumentMixin(CONFIG.MeasuredTemplate.documentClass)
  ) { };
  //@ts-expect-error
  CONFIG.MeasuredTemplate.documentClass = MidiMeasuredTemplateDocument;

  class MidiTokenDocument extends MidiDependentDocumentMixin(
    globalThis.dnd5e.documents.mixins.DependentDocumentMixin(CONFIG.Token.documentClass)
  ) { };
  //@ts-expect-error
  CONFIG.Token.documentClass = MidiTokenDocument;

  class MidiAmbientLightDocument extends MidiDependentDocumentMixin(
    globalThis.dnd5e.documents.mixins.DependentDocumentMixin(CONFIG.AmbientLight.documentClass)
  ) { };
  //@ts-expect-error
  CONFIG.AmbientLight.documentClass = MidiAmbientLightDocument;

  // ActiveEffect, Item, Actor already have dnd5e's DependentDocumentMixin in their class hierarchy
  // Just add MidiDependentDocumentMixin for our registry tracking
  //@ts-expect-error - Mixin pattern type inference
  class MidiActiveEffect extends MidiDependentDocumentMixin(CONFIG.ActiveEffect.documentClass) { };
  //@ts-expect-error
  CONFIG.ActiveEffect.documentClass = MidiActiveEffect;

  //@ts-expect-error - Mixin pattern type inference
  class MidiItem extends MidiDependentDocumentMixin(CONFIG.Item.documentClass) { };
  //@ts-expect-error
  CONFIG.Item.documentClass = MidiItem;

  //@ts-expect-error - Mixin pattern type inference
  class MidiActor extends MidiDependentDocumentMixin(CONFIG.Actor.documentClass) { };
  //@ts-expect-error
  CONFIG.Actor.documentClass = MidiActor;
}

function _prepareItem(wrapped, item, ctx) {
  wrapped(item, ctx);
  // Filter from ctx.activities to preserve dnd5e's visibility filtering (including level limits)
  // Fixes issue #1548: Activity Visibility "Level Limit" ignored when midi-qol is enabled
  if (ctx.activities) {
    ctx.activities = ctx.activities.filter((a: Activity) => !a.midiProperties?.automationOnly);
  }
}

function getAttackModifiers(roll: Roll /* D20Roll */): string[] {
  //@ts-expect-error
  const modifiers: string[] = roll.d20.modifiers ?? [];
  const actor: Actor = fromUuidSync(roll.data?.actorUuid as string) as Actor;
  if (!actor) return modifiers;
  //@ts-expect-error
  const itemType = roll.data?.item?.itemType;
  //@ts-expect-error
  const type = roll.data?.activity?.attack?.type
  if (!itemType || !type) return modifiers;
  const actionType = `${type?.value === "ranged" ? "r" : "m"}${type?.classification === "spell" ? "sak" : "wak"}`;
  const changes: any[] = [];
  for (let effect of actor.allApplicableEffects()) {
    if (effect.disabled || effect.isSuppressed) continue;
    for (let change of effect.changes) {
      if (change.key.startsWith("flags.midi-qol.rollModifiers.attack.")) changes.push(change);
    }
  }
  changes.sort((a, b) => a.priority - b.priority);
  for (let change of changes) {
    const [_, __, ___, ____, actionOrItem] = change.key.split(".");
    if (actionOrItem === "all" || actionOrItem === actionType || actionOrItem === itemType) {
      modifiers.push(change.value);
    }
  }
  return modifiers;
}

function _configureModifiers(this: Roll /*D20Roll*/, wrapped) {
  wrapped();
  // @ts-expect-error no dnd5e-types
  if (this.data?.activity?.type !== "attack") return;
  // @ts-expect-error no dnd5e-types
  this.d20.modifiers = getAttackModifiers(this);
}

export function actorPrepareData(this: Actor.Implementation, wrapped) {
  try {
    foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", this._source.flags?.[MODULE_ID]?.onUseMacroName);
    if (debugEnabled > 0) for (let effect of this.appliedEffects) {
      for (let change of effect.changes) {
        if (change.key === "flags.midi-qol.onUseMacroName") {
          if (change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) {
            error("onUseMacro effect mode is not custom", `Actor ${this.name} Effect: ${effect.name} ${this.uuid}`);
            TroubleShooter.recordError(new Error("onUseMacro effect mode is not custom"), `Actor ${this.name} Effect: ${effect.name} ${this.uuid} `);
            change.mode = CONST.ACTIVE_EFFECT_MODES.CUSTOM;
          }
        }
      }
    }
    processTraits(this);
    wrapped();
    prepareOnUseMacroData(this);
  } catch (err) {
    const message = `actor prepare data ${this?.name}`;
    TroubleShooter.recordError(err, message);
  }
}

export function itemPrepareData(this: Item.Implementation, wrapped) {
  foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", this._source.flags?.[MODULE_ID]?.onUseMacroName);
  // Migrate PascalCase friendlySave values to camelCase
  // @ts-expect-error
  const activities = this.system?.activities;
  if (activities) {
    for (const activity of Object.values(activities) as any[]) {
      if (activity.friendlySave === "FriendlyFail") activity.friendlySave = "friendlyFail";
      else if (activity.friendlySave === "FriendlySuccess") activity.friendlySave = "friendlySuccess";
    }
  }
  if (debugEnabled > 0) for (let effect of this.effects) {
    for (let change of effect.changes) {
      if (change.key === "flags.midi-qol.onUseMacroName") {
        if (change.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) {
          error("onUseMacro effect mode is not custom", `Actor: ${this.parent?.name} Item: ${this.name} Effect: ${effect.name} ${this.uuid} `);
          TroubleShooter.recordError(new Error("onUseMacro effect mode is not custom - mode treated as custom"), `Actor: ${this.parent?.name} Item: ${this.name} Effect: ${effect.name} ${this.uuid} `);
          change.mode = CONST.ACTIVE_EFFECT_MODES.CUSTOM;
        }
      }
    }
  }
  wrapped();
  prepareOnUseMacroData(this);

}

export function prepareOnUseMacroData(actorOrItem: Actor.Implementation | Item.Implementation) {
  try {
    const macros = actorOrItem.flags?.[MODULE_ID]?.onUseMacroName;
    foundry.utils.setProperty(actorOrItem, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macros ?? null));
  } catch (err) {
    const message = `midi-qol | failed to prepare onUse macro data ${actorOrItem?.name}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  }
}

export function preUpdateItemActorOnUseMacro(
  itemOrActor: Actor.Implementation | Item.Implementation,
  changes: Actor.UpdateData | Item.UpdateData,
  options: Actor.Database.PreUpdateOperation | Item.Database.PreUpdateOptions,
  userId: string
) {
  try {
    const macroChanges = changes.flags?.[MODULE_ID]?.onUseMacroParts;
    if (!macroChanges || foundry.utils.isEmpty(macroChanges)) return true;
    const macros = itemOrActor._source.flags?.[MODULE_ID]?.onUseMacroName;
    const macroParts = new OnUseMacros(macros ?? null);

    if (!Array.isArray(macroChanges.items)) { // we have an update from editing the macro changes
      for (let keyString in macroChanges.items as Record<string, OnUseMacro>) {
        let key = Number(keyString);
        if (Number.isNaN(key)) continue; // just in case
        if (!macroParts.items[key]) {
          macroParts.items.push(OnUseMacro.parsePart({
            macroName: (macroChanges.items as Record<string, OnUseMacro>)[key]?.macroName ?? "",
            option: (macroChanges.items as Record<string, OnUseMacro>)[key]?.option ?? ""
          }));
          key = macroParts.items.length - 1;
        }
        if ((macroChanges.items as Record<string, OnUseMacro>)[keyString].macroName) macroParts.items[key].macroName = (macroChanges.items as Record<string, OnUseMacro>)[keyString].macroName;
        if ((macroChanges.items as Record<string, OnUseMacro>)[keyString].option) macroParts.items[key].option = (macroChanges.items as Record<string, OnUseMacro>)[keyString].option;
      }
    }
    let macroString = OnUseMacros.parseParts(macroParts).items.map(oum => oum.toString()).join(",");
    if (changes.flags?.[MODULE_ID]?.onUseMacroName) changes.flags[MODULE_ID].onUseMacroName = macroString;
    delete changes.flags?.[MODULE_ID]?.onUseMacroParts;
  } catch (err) {
    delete changes.flags?.[MODULE_ID]?.onUseMacroParts;
    const message = `midi-qol | failed in preUpdateItemActor onUse Macro for ${itemOrActor?.name} ${itemOrActor?.uuid}`
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  }
  return true;
};

export function getItemEffectsToDelete(args: { actor: Actor.Implementation, origin: string, ignore: string[], ignoreTransfer: boolean, options: any }): string[] {
  warn("getItemEffectsToDelete: started", globalThis.DAE?.actionQueue);
  let effectsToDelete: string[] | undefined;
  let { actor, origin, ignore, ignoreTransfer, options } = args;
  try {
    if (!actor) {
      return [];
    }
    const actorEffects: ActiveEffect[] | undefined = actor?.appliedEffects;
    effectsToDelete = actorEffects?.filter(ef => {
      if (installedModules.get("times-up")) {
        if (globalThis.TimesUp.isEffectExpired(ef, { combat: game.combat })) return false;
      }
      return ef.origin === origin
        && !ignore.includes(ef.uuid)
        && (!ignoreTransfer || ef.flags?.dae?.transfer !== true)
    }).map(ef => ef.id!);
    warn("getItemEffectsToDelete: effectsToDelete ", actor.name, effectsToDelete, options);
    return effectsToDelete;
  } catch (err) {
    const message = `getItemEffectsToDelete item effects failed for ${actor.name} ${origin} ${effectsToDelete}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
    return [];
  }
}

export async function zeroHPExpiry(actor: Actor.Implementation, update: Actor.UpdateData, options: Actor.Database.UpdateOptions, user: string) {
  const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
  if (hpUpdate !== 0) return;
  const expiredEffects: ActiveEffect[] = [];
  for (let effect of actor.appliedEffects) {
    if (effect.flags?.dae?.specialDuration?.includes("zeroHP")) expiredEffects.push(effect)
  }
  if (expiredEffects.length > 0) await expireEffects(actor, expiredEffects, { "expiry-reason": "midi-qol:zeroHP" })
}

export async function checkWounded(actor: Actor.Implementation, update: Actor.UpdateData, options: Actor.Database.UpdateOptions, user: string, vitalityValue?: number) {
  const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");

  // Check for vitality system
  const vitalityItem = getVitalityItem(actor);
  const hasVitality = !!vitalityItem;

  // Use provided vitality value if given, otherwise look up from the item
  let vitalityUpdate: number | undefined;
  if (vitalityValue !== undefined) {
    vitalityUpdate = vitalityValue;
  } else if (vitalityItem) {
    // @ts-expect-error uses exists on items with uses
    const maxUses = vitalityItem.system.uses?.max ?? 0;
    // @ts-expect-error uses exists on items with uses
    const spentUses = vitalityItem.system.uses?.spent ?? 0;
    vitalityUpdate = maxUses - spentUses;
  }

  if (hpUpdate === undefined && !hasVitality) return;
  // @ts-expect-error no dnd5e-types
  const attributes = actor.system.attributes;
  // Check vitalityDeathRequires setting: "vitalityOnly" = dead when vitality=0, "vitalityAndHP" = dead when both are 0
  const deathRequires = configSettings.optionalRules.vitalityDeathRequires || "vitalityOnly";
  let needsBeaten: boolean;
  if (hasVitality) {
    if (deathRequires === "vitalityOnly") {
      // Dead when vitality reaches 0, regardless of HP
      needsBeaten = (vitalityUpdate ?? 0) <= 0;
    } else {
      // Dead only when both vitality and HP are 0
      needsBeaten = (vitalityUpdate ?? 0) <= 0 && attributes.hp.value <= 0;
    }
  } else {
    needsBeaten = attributes.hp.value <= 0;
  }
  if (configSettings.addWounded > 0 && configSettings.addWoundedStyle !== "none") {
    const needsWounded = attributes.hp.pct < configSettings.addWounded && !needsBeaten;
    const woundedStatus = getWoundedStatus();
    if (!woundedStatus) {
      const message = "wounded status condition not set - please update your midi-qol wounded condition on the mechanics tab";
      TroubleShooter.recordError(new Error(message), "In check wounded");
      ui.notifications?.warn(`midi-qol | ${message}`);
    } else if (installedModules.get("dfreds-convenient-effects") && woundedStatus instanceof ActiveEffect && isConvenientEffect(woundedStatus)) {
      const wounded = await ConvenientEffectsHasEffect(woundedStatus.name, actor, false);
      if (wounded !== needsWounded) {
        if (needsWounded) CEAddEffectWith({ effectName: woundedStatus.name, effectId: woundedStatus.id!, uuid: actor.uuid, overlay: configSettings.addWoundedStyle === "overlay" });
        else await actor.effects.find(ef => ef.name === woundedStatus.name)?.delete();
      }
    } else if (!(woundedStatus instanceof ActiveEffect && isConvenientEffect(woundedStatus))) {
      const token = tokenForActor(actor);
      if (woundedStatus && token) {
        if (!needsWounded) {
          // Cater to the possibility that the settings changed while the effect was applied
          await token.actor?.toggleStatusEffect(woundedStatus.id!, { overlay: true, active: false });
          await token.actor?.toggleStatusEffect(woundedStatus.id!, { overlay: false, active: false });
        } else {
          if (!token.document.hasStatusEffect(woundedStatus.id!)) {
            await token.actor?.toggleStatusEffect(woundedStatus.id!, { overlay: configSettings.addWoundedStyle === "overlay", active: true });
          }
        }
      }
    }
  }
  // When vitality reaches 0, apply the configured vitality dead condition
  if (hasVitality && needsBeaten) {
    // For vitality death, use the configured vitalityDeadCondition (defaults to "dead")
    const effect = getVitalityDeadStatus();
    if (effect) {
      await setDeadStatus(actor, { effect, useDefeated: configSettings.markNonPlayerDefeated, makeDead: true });
    }
  } else if (hasVitality && !needsBeaten) {
    // Vitality > 0, remove the vitality dead condition if present
    const effect = getVitalityDeadStatus();
    if (effect) {
      await setDeadStatus(actor, { effect, useDefeated: configSettings.markNonPlayerDefeated, makeDead: false });
    }
  } else if (configSettings.addDead !== "none") {
    // No vitality system - use normal midi settings
    let effect = getDeadStatus();
    let useDefeated = configSettings.markNonPlayerDefeated;
    // @ts-expect-error no dnd5e-types
    if (actor.type === "character" || actor.hasPlayerOwner || actor.system.traits?.important) {
      effect = getUnconsciousStatus();
      useDefeated = configSettings.markPlayerDefeated;
    }
    if (!effect) return;
    if (!needsBeaten) {
      await setDeadStatus(actor, { effect, useDefeated, makeDead: false });
    } else {
      await setDeadStatus(actor, { effect, useDefeated, makeDead: true });
    }
  }
}

async function setDeadStatus(actor: Actor.Implementation, options: { effect: CONFIG.StatusEffect | ActiveEffect.Implementation; useDefeated: boolean; makeDead: boolean; overlay?: boolean; }) {
  let { effect, useDefeated, makeDead } = options;
  if (!effect) return;

  // When applying dead status, first remove unconscious and its rider statuses
  // dnd5e automatically applies unconscious when HP reaches 0, but we want dead instead
  // Unconscious has incapacitated and prone as riders, which conflict with dead's riders
  if (makeDead) {
    const conflictingStatuses = ["unconscious", "incapacitated", "prone"];
    for (const statusId of conflictingStatuses) {
      if (actor.statuses.has(statusId)) {
        try {
          await actor.toggleStatusEffect(statusId, { active: false });
        } catch (err) {
          // Ignore errors when removing statuses
        }
      }
    }
  }

  if (effect && installedModules.get("dfreds-convenient-effects") && effect instanceof ActiveEffect && isConvenientEffect(effect)) {
    const isBeaten = actor.effects.find(ef => ef.name === effect?.name) !== undefined;
    if ((makeDead !== isBeaten)) {

      if (makeDead) {
        await CEAddEffectWith({ effectName: effect.name, uuid: actor.uuid, overlay: (configSettings.addDead === "overlay") || !!options.overlay });
      } else { // remove beaten condition
        await CERemoveEffect({ effectName: effect.name, uuid: actor.uuid });
      }
      if (useDefeated) {
        const combatants = game.combat?.getCombatantsByActor(actor) ?? [];
        for (let combatant of combatants) await combatant.update({ defeated: makeDead }, {})
      }
    }
  } else if (!(effect instanceof ActiveEffect && isConvenientEffect(effect))) {
    // V12 uses an actor
    const isBeaten = actor.effects.find(ef => ef.name === (i18n(effect?.name ?? ""))) !== undefined;
    if (isBeaten !== makeDead) {
      try {
        await actor.toggleStatusEffect(effect.id!, { overlay: (configSettings.addDead === "overlay") || options.overlay, active: makeDead });
      } catch (err: any) {
        // Ignore "already exists" errors from dnd5e's rider status effects (e.g., dead adds incapacitated which adds prone,
        // and if prone is also a direct rider of dead, it would try to add prone twice)
        if (!err?.message?.includes("already exists")) {
          throw err;
        }
      }
      if (useDefeated) {
        const combatants = game.combat?.getCombatantsByActor(actor) ?? [];
        for (let combatant of combatants) await combatant.update({ defeated: makeDead }, {});
      }
    }
  }
}

export function readyPatching() {
  libWrapper.register(MODULE_ID, "game.dnd5e.canvas.AbilityTemplate.prototype.refresh", midiATRefresh, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.character['dnd5e.CharacterActorSheet'].cls.prototype._filterItems", _filterItems, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.npc['dnd5e.NPCActorSheet'].cls.prototype._filterItems", _filterItems, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.createConcentrationEffectData", createConcentrationEffectData, "WRAPPER");
  // This controls whether to display the chat message or not
  // dnd5e.damageActor handles picking up concentration item rolls
  // processConcentrationSave handles doing the auto roll for concentration chat messages
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.challengeConcentration", challengeConcentration, "MIXED")
  // Moved overtime processing to the updateCombat hook instead.
  // libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._preUpdate", processOverTime, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._preDelete", _preDeleteCombat, "WRAPPER");

  libWrapper.register(MODULE_ID, "foundry.applications.ui.Notifications.prototype.notify", notificationNotify, "MIXED");
  const gameVersion = game.system?.version;
  if ((game.system?.id === "dnd5e" && foundry.utils.isNewerVersion("3.3", gameVersion ?? ""))) {
    if (ui.notifications)
      ui.notifications.error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 3.3.1 or later`);
    else
      error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 3.3.1 or later`);
  }
}

function createConcentrationEffectData(this: ActiveEffect.Implementation, wrapped, activity: Activity, data: any = {}) {
  const effectData: ActiveEffect.CreateData = wrapped(activity, data);
  if (!effectData.flags?.dnd5e?.itemUuid) {
    foundry.utils.setProperty(effectData, "flags.dnd5e.itemUuid", activity.uuid);
  }
  return effectData;
}

export async function challengeConcentration(this: Actor.Implementation, wrapped, { dc = 10, ability = null } = {}) {
  // Set.delete() returns true if the uuid was in the set (check + remove in one operation)
  if (skipConcentrationActorUuids.delete(this.uuid)) {
    return;
  }
  if (["chatOnly"].includes(configSettings.doConcentrationCheck))
    return wrapped({ dc, ability });
  // @ts-expect-error no dnd5e-types
  const isConcentrating = this.concentration.effects.size > 0;
  if (!isConcentrating) return null;
  // @ts-expect-error no dnd5e-types
  if (configSettings.concentrationIncapacitatedConditionCheck && (hasCondition(this, "incapacitated") || this.system.attributes.hp.value <= 0)) return;
  if (["chat"].includes(configSettings.doConcentrationCheck)) {
    const dataset = {
      action: "concentration",
      dc,
    };
    //@ts-expect-error no dnd5e-types
    if (ability && ability in game.system?.config.abilities) dataset.ability = ability;
    const config = {
      type: "concentration",
      format: "short",
      icon: true
    }
    //@ts-expect-error no dnd5e-types
    const enrichers = game.system?.enrichers;
    return ChatMessage.implementation.create({
      content: `<div class="dnd5e chat-card request-card" data-action="concentration" data-dc="${dc}" data-type="midi-concentration">
      <div><span class="visible-dc">${enrichers.createRollLabel({ ...dataset, ...config })} ${i18n("DND5E.Roll")}</span></div>
      <div><span class="hidden-dc">${enrichers.createRollLabel({ ...dataset, ...config, hideDC: true })} ${i18n("DND5E.Roll")}</span></div>
      </div>`,
      whisper: game.users?.filter(user => this.testUserPermission(user, "OWNER")).map(user => user.id),
      speaker: ChatMessage.implementation.getSpeaker({ actor: this })
    });
  }
  // item rolls are picked up when the damage is updated in dnd5e.damageActor
  return;
}

export let visionPatching = () => {
  if (playerControlsInvisibleTokens) {
    ui.notifications?.warn("Player control vision is deprecated, use it at your own risk")
    console.warn("midi-qol | Player control vision is deprecated, use it at your own risk")

    log("Patching Token._isVisionSource")
    libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype._isVisionSource", _isVisionSource, "WRAPPER");

    log("Patching Token.isVisible")
    libWrapper.register(MODULE_ID, "foundry.canvas.placeables.Token.prototype.isVisible", isVisible, "WRAPPER");
  }
  log("Vision patching - ", playerControlsInvisibleTokens ? "enabled" : "disabled")
}

// function _getUsageConfig(wrapped): any {
//   //Radius template spells with self/spec/any will auto place the template so don't prompt for it in config.
//   const config = wrapped();
//   const autoCreateTemplate = this.hasAreaTarget && hasAutoPlaceTemplate(this);
//   if (autoCreateTemplate) config.createMeasuredTemplate = null;
//   return config;
// }

export let itemPatching = () => {
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.use", doItemUse, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.prototype.configureDamage", configureDamage, "MIXED");
};

export async function checkDeleteTemplate(templateDocument: MeasuredTemplateDocument, options: any, user: string) {
  if (user !== game.user?.id) return;
  if (options.undo) return;

  // Cascade delete dependents of this template via MidiDependentsRegistry (only active GM should do this)
  if (preferredActiveGM()?.isSelf) {
    await MidiDependentsRegistry.deleteDependents(templateDocument.uuid);
  }

  // Check if this template was dependent on a concentration effect - if so, clean up the effect if no more dependents
  if (options.noConcentrationCheck || configSettings.removeConcentrationEffects === "none") return;

  const dependentOn = templateDocument.getFlag("dnd5e", "dependentOn");
  if (!dependentOn) return;

  const parentEffect = fromUuidSync(dependentOn);
  if (parentEffect instanceof ActiveEffect) {
    // @ts-expect-error no dnd5e-types
    if (parentEffect.getDependents()?.length === 0) {
      await parentEffect.delete();
    }
  }
};

export let actorAbilityRollPatching = () => {

  log("Patching roll abilities Save/Test/Skill/Tool")
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSavingThrow", rollSavingThrow, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollAbilityCheck", rollAbilityCheck, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollDeathSave", rollDeathSave, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSkill", doRollSkill, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollToolCheck", rollToolCheck, "WRAPPER");
}

export async function rollToolCheck(this: Actor.Implementation, wrapped, config: RollProcessConfig & { ability?: string, tool?: string } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  let result: Roll[] | undefined;
  let preRollHookId: number | undefined;
  try {
    config.midiOptions ??= {};
    const chatMessage = message.create;
    message.create = false;
    if (dialog.configure === undefined && isAutoFastForward("tool")) dialog.configure = false;

    let hasPreComputedAdvantage = false;
    if (!config.midiOptions.ignorePreComputedAdvantage) {
      hasPreComputedAdvantage = applyPreComputedAdvantage(config);
      if (hasPreComputedAdvantage && isAutoFastForward("tool")) {
        config.midiOptions.fastForward = true;
      }
    }
    if (!hasPreComputedAdvantage) {
      if (!config.midiOptions.workflow && config.midiOptions.workflowId) {
        config.midiOptions.workflow = Workflow.getWorkflow(config.midiOptions.workflowId);
      }
      const toolRollModifierTracker = await computeToolAdvantage(this, config.tool ?? "", config.ability ?? "", config.midiOptions);
      config.advantage = toolRollModifierTracker.hasAdvantage;
      config.disadvantage = toolRollModifierTracker.hasDisadvantage;
    }

    // Build roll modifier flags for tool checks
    const toolModifierFlags: RollModifierFlags = {
      failFlags: ["fail.all", "fail.tool.all"],
      successFlags: ["success.all", "success.tool.all"],
      maxFlags: ["max.tool.all"],
      minFlags: ["min.tool.all"]
    };
    // Add tool-specific flags
    if (config.tool) {
      toolModifierFlags.failFlags.push(`fail.tool.${config.tool}`);
      toolModifierFlags.successFlags.push(`success.tool.${config.tool}`);
      toolModifierFlags.maxFlags.push(`max.tool.${config.tool}`);
      toolModifierFlags.minFlags.push(`min.tool.${config.tool}`);
    }
    // Add ability check flags if ability is specified
    if (config.ability) {
      toolModifierFlags.failFlags.push("fail.ability.all", "fail.ability.check.all", `fail.ability.check.${config.ability}`);
      toolModifierFlags.successFlags.push("success.ability.all", "success.ability.check.all", `success.ability.check.${config.ability}`);
      toolModifierFlags.maxFlags.push(`max.ability.check.${config.ability}`, "max.ability.check.all");
      toolModifierFlags.minFlags.push(`min.ability.check.${config.ability}`, "min.ability.check.all");
    }

    let toolModifiers: RollModifierResult | undefined;
    const workflow = config.midiOptions?.workflow;
    const midiOptions = config.midiOptions;
    const rollModifierTracker = new RollModifierTracker();

    preRollHookId = Hooks.once("dnd5e.preRollTool", (configData, dialogData, messageData) => {
      configData.midiOptions ??= midiOptions;
      // Apply roll modifiers (auto-fail, min, max)
      computeRollModifiers(this, toolModifierFlags, rollModifierTracker, { workflow });
      toolModifiers = applyRollModifiers(rollModifierTracker, configData, dialogData);
      setRollDialogOptions(configData, dialogData, "tool");
      message = messageData;
    });

    if (this.token) foundry.utils.setProperty(dialog, "options.window.subtitle", this.token.name);
    result = await wrapped(config, dialog, message);
    let rollMode = message.rollMode ?? safeGetGameSetting("core", "rollMode");
    if (result) {
      await displayDSNForRoll(result, "toolCheck", rollMode);
      DSNMarkDiceDisplayed(result);
      result![0] = await bonusCheck(this, result![0], "check", config.ability ?? "", message.data);
      DSNMarkDiceDisplayed(result);
    }
    if (!result) return result;
    if (chatMessage !== false && result) {
      await result[0].toMessage(message.data, { rollMode });
    }
  } catch (err) {
    const message = "midi-qol | error in rollToolCheck";
    TroubleShooter.recordError(err, message);
    throw err;
  } finally {
    if (preRollHookId) Hooks.off("dnd5e.preRollTool", preRollHookId);
    return result;
  }
}

// This is done as a wrapper so that there is no race condition when hp reaches 0 also trying to remove condition
// This version will always fire first, remove concentration if needed and complete before the hp update is processed.
async function _preCreateActiveEffect(this: ActiveEffect.Implementation, wrapped, data: ActiveEffect.CreateData, options: ActiveEffect.Database.PreCreateOptions, user: User.Implementation): Promise<void> {
  try {
    if (!configSettings.concentrationIncapacitatedConditionCheck) return;
    const parent: any = this.parent;
    const checkConcentration = configSettings.removeConcentration || !safeGetGameSetting("dnd5e", "disableConcentration");
    // @ts-expect-error
    if (!checkConcentration || options.noConcentrationCheck) return;
    if (!(parent instanceof CONFIG.Actor.documentClass)) return;
    if (globalThis.MidiQOL.incapacitatedConditions.some(condition => this.statuses.has(condition))) {
      if (debugEnabled > 0) warn(`on createActiveEffect ${this.name} ${this.id} removing concentration for ${parent.name}`)
      // @ts-expect-error no dnd5e-types
      if (parent.system.attributes?.hp?.value > 0) {
        // @ts-expect-error no dnd5e-types
        await parent.endConcentration();
      }
    }
  } catch (err) {
    const message = "midi-qol | error in preCreateActiveEffect";
    error(message, err);
    TroubleShooter.recordError(err, message);
  } finally {
    return wrapped(data, options, user);
  }
}

export async function createRollResultFromCustomRoll(customRoll: any) {
  const saveEntry = customRoll.entries?.find((e) => e.type === "multiroll");
  let saveTotal = saveEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
  let advantage = saveEntry ? saveEntry.rollState === "highest" : undefined;
  let disadvantage = saveEntry ? saveEntry.rollState === "lowest" : undefined;
  let diceRoll = saveEntry ? saveEntry.entries?.find((e) => !e.ignored)?.roll.terms[0].total : -1;
  let isCritical = saveEntry ? saveEntry.entries?.find((e) => !e.ignored)?.isCrit : false;
  const result = await new Roll(`${saveTotal}`).evaluate();
  foundry.utils.setProperty(result.terms[0].options, "advantage", advantage)
  foundry.utils.setProperty(result.terms[0].options, "disadvantage", disadvantage)
  return result;
}

export async function _preDeleteCombat(this: Combat.Implementation, wrapped, ...args) {
  try {
    for (let combatant of this.combatants) {
      if (combatant.actor) {
        if (hasUsedReaction(combatant.actor)) await removeReactionUsed(combatant.actor, true);
        if (hasUsedBonusAction(combatant.actor)) await removeBonusActionUsed(combatant.actor, true);
        if (hasUsedAction(combatant.actor)) await removeActionUsed(combatant.actor);
      }
    }
  } catch (err) {
    const message = `midi-qol | error in preDeleteCombat`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  } finally {
    return wrapped(...args)
  }
}

export async function doItemUse(this: Item.Implementation, wrapped, config: ActivityUseConfiguration & { chooseActivity?: boolean } = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  if (this.pack) return;
  const { chooseActivity, ...activityConfig } = config;
  // @ts-expect-error no dnd5e-types
  // Filter usable activities: exclude riders, automationOnly, inProgress, and activities that fail visibility checks (canUse)
  const activities = this.system.activities?.filter(a =>
    a.canUse !== false &&
    !this.flags.dnd5e?.riders?.activity?.includes(a.id) &&
    !a.midiProperties?.automationOnly &&
    !a.inProgress
  );
  const attackActivities = activities?.filter(a => a instanceof MidiAttackActivity);
  if (attackActivities?.length === 1) { // if there is a single attack activity and no other non-automation activities use it
    const attackActivity = attackActivities[0];
    const extraActivities = activities?.filter(a => a !== attackActivity && a !== attackActivity?.otherActivity);
    if (extraActivities?.length === 0) {
      return await attackActivity.use(config, dialog, message);
    }
  }
  //@ts-expect-error
  const areKeysPressed = game.system?.utils.areKeysPressed;
  const skipPressed = areKeysPressed(config.event, "skipDialogAdvantage") || areKeysPressed(config.event, "skipDialogDisadvantage") || areKeysPressed(config.event, "skipDialogNormal");
  if (skipPressed) {
    const attackActivity = attackActivities[0];
    if (attackActivity) return await attackActivity.use(config, dialog, message);
    else return await activities?.[0]?.use(config, dialog, message);
  }
  if (activities?.length > 1 || chooseActivity) {
    const activity = await MidiActivityChoiceDialog.create(this);
    return await activity?.use(config, dialog, message);
  }
  if (activities?.length === 1) {
    return await activities[0].use(config, dialog, message);
  }
  // @ts-expect-error no dnd5e-types
  if (this.actor) return this.displayCard(message);
}

export function processTraits(actor: Actor.Implementation) {
  try {
    // @ts-expect-error no dnd5e-types
    if (!actor.system.traits) return;
    for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
      // @ts-expect-error no dnd5e-types
      let trait = actor.system.traits[traitId];
      if (!trait) continue;
      if (!trait.value) trait.value = new Set();
      for (let traitString of trait.value) {
        switch (traitString) {
          case "silver":
            trait.bypasses.add("sil");
            addPhysicalDamages(trait.value);
            break
          case "adamant":
            trait.bypasses.add("adm");
            addPhysicalDamages(trait.value);
            break
          case "physical":
            addPhysicalDamages(trait.value);
            break;
          case "nonmagic":
            addPhysicalDamages(trait.value);
            trait.bypasses.add("mgc");
            break;
          case "spell":
            // trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage"));
            break
          case "power":
            // trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage"));
            break
          case "magic":
            // trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical"));
            break
          case "healing":
            // trait.custom = addCustomTrait(trait.custom, systemConfig.healingTypes.healing);
            break
          case "temphp":
            // trait.custom = addCustomTrait(trait.custom, systemConfig.healingTypes.temphp);
            break
          default:
            trait.value.add(traitString);
        }
      }
    }

  } catch (err) {
    const message = `midi-qol | processTraits | error for ${actor?.name}`;
    console.warn(message, this, err);
    TroubleShooter.recordError(err, message);
  } finally {
  }
}
export function migrateTraits(actor: Actor.Implementation) {
  try {
    // @ts-expect-error no dnd5e-types
    if (!actor.system.traits) return;
    const baseData = actor.toObject(true);
    for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
      // @ts-expect-error no dnd5e-types
      let trait = actor.system.traits[traitId];
      let baseTrait = baseData.system.traits[traitId];
      if (!trait) continue;
      if (!trait.value) trait.value = new Set();

      if (trait.bypasses instanceof Set) {
        for (let traitString of baseTrait.value) {
          switch (traitString) {
            case "silver":
              trait.bypasses.add("sil");
              addPhysicalDamages(trait.value);
              trait.value.delete("silver");
              log(`${actor.name} mapping "Silver" to ${trait.value}, ${trait.bypasses}`)
              break
            case "adamant":
              trait.bypasses.add("ada");
              addPhysicalDamages(trait.value);
              trait.value.delete("adamant");
              log(`${actor.name} mapping "Adamantine" to ${trait.value}, ${trait.bypasses}`)
              break
            case "physical":
              addPhysicalDamages(trait.value);
              trait.value.delete("physical");
              log(`${actor.name} mapping "Physical" to ${trait.value}, ${trait.bypasses}`)
              break;
            case "nonmagic":
              addPhysicalDamages(trait.value);
              trait.bypasses.add("mgc");
              trait.value.delete("nonmagic");
              log(`${actor.name} mapping "nongamic" to ${trait.custom}`)
              break;
            case "spell":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage") ?? "Spell Damage");
              trait.value.delete("spell");
              log(`${actor.name} mapping "spell" to ${trait.custom}`)
              break
            case "power":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage") ?? "Power Damage");
              trait.value.delete("power");
              log(`${actor.name} mapping "power" to ${trait.custom}`)
              break
            case "magic":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical") ?? "Magical Damage");
              trait.value.delete("magic");
              log(`${actor.name} mapping "magic" to ${trait.custom}`)
              break
            case "healing":
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.healing.label);
              trait.value.delete("healing");
              log(`${actor.name} mapping "healing" to ${trait.custom}`)
              break
            case "temphp":
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.temphp.label);
              trait.value.delete("temphp");
              log(`${actor.name} mapping "temphp" to ${trait.custom}`)
              break
            default:
              trait.value.add(traitString);
          }
        }
      } else {
        for (let traitString of baseTrait.value) {
          switch (traitString) {
            case "silver":
              if (!trait.bypasses.includes("sil")) trait.bypasses.push("sil");
              addPhysicalDamages(trait.value);
              trait.value = removeTraitValue(trait.value, "silver");
              log(`${actor.name} mapping "Silver" to ${trait.value}, ${trait.bypasses}`)
              break
            case "adamant":
              if (!trait.bypasses.includes("ada")) trait.bypasses.push("ada");
              addPhysicalDamages(trait.value);
              trait.value = removeTraitValue(trait.value, "adamant");
              log(`${actor.name} mapping "Adamantine" to ${trait.value}, ${trait.bypasses}`)
              break
            case "physical":
              addPhysicalDamages(trait.value);
              trait.value = removeTraitValue(trait.value, "physical");
              log(`${actor.name} mapping "Physical" to ${trait.value}, ${trait.bypasses}`)
              break;
            case "nonmagic":
              addPhysicalDamages(trait.value);
              if (!trait.bypasses.includes("mgc")) trait.bypasses.push("mgc");
              trait.value = removeTraitValue(trait.value, "nonmagic");
              log(`${actor.name} mapping "nongamic" to ${trait.custom}`)
              break;
            case "spell":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage") ?? "Spell Damage");
              trait.value = removeTraitValue(trait.value, "spell");
              log(`${actor.name} mapping "spell" to ${trait.custom}`)
              break
            case "power":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage") ?? "Power Damage");
              trait.value = removeTraitValue(trait.value, "power");
              log(`${actor.name} mapping "power" to ${trait.custom}`)
              break
            case "magic":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical") ?? "Magical Damage");
              trait.value = removeTraitValue(trait.value, "magic");
              log(`${actor.name} mapping "magic" to ${trait.custom}`)
              break
            case "healing":
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.healing.label);
              trait.value = removeTraitValue(trait.value, "healing");
              log(`${actor.name} mapping "healing" to ${trait.custom}`)
              break
            case "temphp":
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.temphp.label);
              trait.value = removeTraitValue(trait.value, "temphp");
              log(`${actor.name} mapping "temphp" to ${trait.custom}`)
              break
            default:
              trait.value.push(traitString);
          }
        }
      }
    }

  } catch (err) {
    const message = `midi-qol | migrateTraits | error for ${actor?.name}`;
    console.warn(message, this, err);
    TroubleShooter.recordError(err, message);
  } finally {
  }
}

function removeTraitValue(traitValue: string[] | Set<string>, toRemove: string): string[] | Set<string> {
  if (traitValue instanceof Set)
    traitValue.delete(toRemove);
  else {
    const position = traitValue.indexOf(toRemove);
    if (position !== -1) return traitValue.splice(position, 1);
  }
  return traitValue;
}

function addPhysicalDamages(traitValue: string[] | Set<string>) {
  let physicalDamageTypes;
  physicalDamageTypes = Object.keys(GameSystemConfig.damageTypes).filter(dt => GameSystemConfig.damageTypes[dt].isPhysical);
  for (let dt of physicalDamageTypes) {
    if (traitValue instanceof Set) traitValue.add(dt);
    else if (!traitValue.includes(dt)) traitValue.push(dt);
  }
}

function addCustomTrait(customTraits: string, customTrait: string): string {
  if (customTraits.length === 0) {
    return customTrait;
  }
  const traitList = customTraits.split(";").map(s => s.trim());
  if (traitList.includes(customTrait)) return customTraits;
  traitList.push(customTrait);
  return traitList.join("; ");
}

function actorGetRollData(this: Actor.Implementation, wrapped, ...args) {
  const data = wrapped(...args);
  data.actorType = this.type;
  data.name = this.name;
  data.flags ??= {};
  data.flags["midi-qol"] = this.flags?.["midi-qol"] ?? {};
  data.midiFlags = data.flags["midi-qol"];
  // data.items = this.items;
  data.cfg ??= {};
  data.cfg.armorClasses = GameSystemConfig.armorClasses;
  data.cfg.actorSizes = GameSystemConfig.actorSizes;
  data.cfg.skills = GameSystemConfig.skills;
  return data;
}

function itemGetRollData(this: Item.Implementation, wrapped, ...args) {
  const data = wrapped(...args);
  if (!data) return data;
  data.item.flags = this.flags ?? {};
  data.item.flags["midi-qol"] = this.flags?.["midi-qol"] ?? {};
  data.item.midiFlags = data.item.flags["midi-qol"];
  data.item.name = this.name;
  data.item.itemType = this.type;
  return data;
}
function _filterItems(wrapped, items, filters) {
  if (!filters.has("reaction")) return wrapped(items, filters);
  const revisedFilters = new Set(filters);
  revisedFilters.delete("reaction");
  let filteredItems = wrapped(items, revisedFilters);
  filteredItems = filteredItems.filter(item => {
    if (item.system.activation?.type?.includes("reaction")) return true;
    return false
  });
  return filteredItems
};