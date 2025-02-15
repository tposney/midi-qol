import { log, i18n, error, i18nFormat, warn, debugEnabled, GameSystemConfig, MODULE_ID, isDnD, NumericTerm } from "../midi-qol.js";
import { configSettings, autoFastForwardAbilityRolls, checkRule, checkMechanic, safeGetGameSetting } from "./settings.js";
import { bonusDialog, checkDefeated, checkIncapacitated, ConvenientEffectsHasEffect, createConditionData, displayDSNForRoll, expireRollEffect, getCriticalDamage, getDeadStatus, getOptionalCountRemainingShortFlag, getTokenForActor, getSpeaker, getUnconsciousStatus, getWoundedStatus, hasAutoPlaceTemplate, hasUsedAction, hasUsedBonusAction, hasUsedReaction, midiRenderRoll, notificationNotify, removeActionUsed, removeBonusActionUsed, removeReactionUsed, tokenForActor, expireEffects, DSNMarkDiceDisplayed, evalAllConditions, evalAllConditionsAsync, MQfromUuidSync, CEAddEffectWith, isConvenientEffect, CERemoveEffect, getActivityAutoTargetAction, getAoETargetType, hasCondition, areMidiKeysPressed } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { OnUseMacro, OnUseMacros } from "./apps/Item.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiAttackActivity } from "./activities/AttackActivity.js";
import { templateTokens } from "./activities/activityHelpers.js";
import { MidiActivityChoiceDialog } from "./apps/MidiActivityChoiceDialog.js";

let libWrapper;

var d20Roll;

function _isVisionSource(wrapped) {
  const isVisionSource = wrapped();
  if (this.document.hidden && !game.user?.isGM && this.actor?.testUserPermission(game.user, "OWNER")) {
    return true;
  }
  return isVisionSource;
}

function isVisible(wrapped) {
  const isVisible = wrapped();
  //@ts-ignore
  if (!game.user?.isGM && this.actor?.testUserPermission(game.user, "OWNER")) {
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
  versatile: boolean | undefined,
  isCritical: boolean | undefined,
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
  versatile: false,
  isCritical: false,
  autoRollAttack: undefined,
  autoRollDamage: undefined,
  fastForwardAttack: undefined,
  fastForwardDamage: undefined,
  fastForwardAbility: undefined
};

export function collectBonusFlags(actor, category, detail): any[] {
  if (!installedModules.get("betterrolls5e")) {
    let useDetail = false;
    const bonusFlags = Object.keys(actor.flags[MODULE_ID]?.optional ?? [])
      .filter(flag => {
        const checkFlag = actor.flags[MODULE_ID].optional[flag][category];
        if (checkFlag === undefined) return false;
        if (detail.startsWith("fail")) {
          const [_, type] = detail.split(".");
          return checkFlag.fail && checkFlag.fail[type] ? getOptionalCountRemainingShortFlag(actor, flag) > 0 : false;
        } else if (!(typeof checkFlag === "string" || checkFlag[detail] || checkFlag["all"] !== undefined)) return false;
        if (actor.flags[MODULE_ID].optional[flag].count === undefined) return true;
        return getOptionalCountRemainingShortFlag(actor, flag) > 0;
      })
      .map(flag => {
        const checkFlag = actor.flags[MODULE_ID].optional[flag][category];
        if (typeof checkFlag === "string") return `flags.midi-qol.optional.${flag}`;
        else return `flags.midi-qol.optional.${flag}`;
      });
    return bonusFlags;
  }
  return [];
}

export async function bonusCheck(actor, result: Roll, category, detail = "", messageData: any = {}): Promise<Roll> {

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
    let title;
    let systemString = game.system?.id.toUpperCase();
    if (GameSystemConfig.abilities[detail]?.label || GameSystemConfig.skills[detail]?.label) {
      if (detail.startsWith("fail")) title = "Failed Save Check";
      else if (category.startsWith("check")) title = i18nFormat(`${systemString}.AbilityPromptTitle`, { ability: GameSystemConfig.abilities[detail].label ?? "" });
      else if (category.startsWith("save")) title = i18nFormat(`${systemString}.SavePromptTitle`, { ability: GameSystemConfig.abilities[detail].label ?? "" });
      else if (category.startsWith("skill")) title = i18nFormat(`${systemString}.SkillPromptTitle`, { skill: GameSystemConfig.skills[detail].label ?? "" });
    } else {
      if (detail.startsWith("fail")) title = "Failed Save Check";
      else if (category.startsWith("check")) title = i18nFormat(`${systemString}.AbilityPromptTitle`, { ability: GameSystemConfig.abilities[detail] ?? "" });
      else if (category.startsWith("save")) title = i18nFormat(`${systemString}.SavePromptTitle`, { ability: GameSystemConfig.abilities[detail] ?? "" });
      else if (category.startsWith("skill")) title = i18nFormat(`${systemString}.SkillPromptTitle`, { skill: GameSystemConfig.skills[detail] ?? "" });
    }
    const newRoll = await bonusDialog.bind(data)(
      bonusFlags,
      detail ? `${category}.${detail}` : category,
      checkMechanic("displayBonusRolls"),
      `${actor.name} - ${title}`,
      data.roll,
      "roll",
      { messageData }
    );
    if (newRoll) result = newRoll;
  }

  return result;
}
function _applyDeprecatedD20Configs(rollConfig, dialogConfig, messageConfig, options) {
  const set = (config, keyPath, value) => {
    if (value === undefined) return;
    foundry.utils.setProperty(config, keyPath, value);
  };

  let roll = rollConfig.rolls?.[0] ?? {};
  set(roll, "parts", options.parts);
  set(roll, "data", options.data);
  set(rollConfig, "event", options.event);
  set(roll, "options.advantage", options.advantage);
  set(roll, "options.disadvantage", options.disadvantage);
  set(roll, "options.criticalSuccess", options.critical);
  set(roll, "options.criticalFailure", options.fumble);
  set(rollConfig, "target", options.targetValue);
  set(rollConfig, "ammunition", options.ammunition);
  set(rollConfig, "attackMode", options.attackMode);
  set(rollConfig, "mastery", options.mastery);
  set(rollConfig, "elvenAccuracy", options.elvenAccuracy);
  set(rollConfig, "halflingLucky", options.halflingLucky);
  set(rollConfig, "reliableTalent", options.reliableTalent);
  set(rollConfig, "midiOptions", {});
  set(rollConfig, "midiOptions.simulate", options.simulate);
  set(rollConfig, "midiOptions.isMagicalSave", options.isMagicalSave);
  set(rollConfig, "midiOptions.isConcentrationCheck", options.isConcentrationCheck);
  set(rollConfig, "midiOptions.saveItemUuid", options.saveItemUuid);
  set(rollConfig, "midiOptions.fromMars5eChatCard", options.fromMars5eChatCard);
  if ("fastForward" in options) dialogConfig.configure = !options.fastForward;
  set(dialogConfig, "options", options.dialogOptions);
  set(dialogConfig, "options.ammunitionOptions", options.ammunitionOptions);
  set(dialogConfig, "options.attackModeOptions", options.attackModes);
  set(dialogConfig, "options.chooseAbility", options.chooseModifier);
  set(dialogConfig, "options.masteryOptions", options.masteryOptions);
  set(dialogConfig, "options.title", options.title);
  set(messageConfig, "create", options.chatMessage);
  set(messageConfig, "data", options.messageData);
  set(messageConfig, "rollMode", options.rollMode);
  set(messageConfig, "data.flavor", options.flavor);

  if (!foundry.utils.isEmpty(roll)) {
    rollConfig.rolls ??= [];
    if (rollConfig.rolls[0]) rollConfig.rolls[0] = roll;
    else rollConfig.rolls.push(roll);
  }
}
async function doRollSkill(wrapped, config: any = {}, dialog: any = {}, message: any = {}) {
  let oldFormat = false;
  if (foundry.utils.getType(config) !== "Object") {
    oldFormat = true;
    foundry.utils.logCompatibilityWarning(
      `The \`rollSkill\` method on Actor5e now takes roll, dialog, and message config objects as parameters.`,
      { since: "DnD5e 4.1", until: "DnD5e 4.5" }
    );
    oldFormat = true;
    const oldConfig = dialog;
    config = { "skill": config };
    if (oldConfig.ability) config.ability = oldConfig.ability;
    if (oldConfig.bonus) config.bonus = oldConfig.bonus;
    dialog = {};
    _applyDeprecatedD20Configs(config, dialog, message, oldConfig);
  }

  config.midiOptions ??= {};
  let preRollSkillHookId;
  let rollSkillHookId;
  //@ts-expect-error
  let result: CONFIG.Dice.D20Roll[] = [];
  const saveRollMode = safeGetGameSetting("core", "rollMode");
  try {
    message.data ??= {};
    let skillId = config.skill;
    const rollTarget = config.target;
    let overtimeActorUuid;
    if (config.event) { // TODO Decide if we want to do this or support core behaviour of anyone rolling concentration check
      const target = config.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
      if (target?.dataset?.midiOvertimeActorUuid) overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
      if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
        const actualActor = MQfromUuidSync(overtimeActorUuid);
        if (actualActor) return actualActor.rollSkill(config, dialog, message);
      }
    }
    if (configSettings.skillAbilityCheckAdvantage) {
      await procAbilityAdvantage(this, "check", this.system.skills[skillId].ability, config.midiOptions)
    }
    await procAdvantageSkill(this, skillId, config.midiOptions);

    let success: boolean | undefined = undefined;
    if (procAutoFailSkill(this, skillId)
      || (configSettings.skillAbilityCheckAdvantage && procAutoFail(this, "check", this.system.skills[skillId].ability))) {
      //@ts-expect-error
      const D20Roll = CONFIG.Dice.D20Roll;
      result = [new D20Roll("-1[auto fail]").evaluateSync()];
      success = false;
    }
    let rollMode: string = message.rollMode ?? config.rollMode ?? safeGetGameSetting("core", "rollMode");
    const blindSkillRoll = configSettings.rollSkillsBlind.includes("all") || configSettings.rollSkillsBlind.includes(skillId);
    if (blindSkillRoll && [CONST.DICE_ROLL_MODES.PUBLIC, "roll", CONST.DICE_ROLL_MODES.PRIVATE].includes(rollMode)) {
      rollMode = CONST.DICE_ROLL_MODES.BLIND;
      game.settings?.set("core", "rollMode", CONST.DICE_ROLL_MODES.BLIND);
    }
    if (config.midiOptions.fastForward) dialog.configure = false;
    if (success === undefined) {
      const maxflags = foundry.utils.getProperty(this, "flags.midi-qol.max") ?? {};
      const maxValue = (maxflags.skill && maxflags.skill.all);
      const minflags = foundry.utils.getProperty(this, "flags.midi-qol.min") ?? {};
      const minValue = (minflags.skill && minflags.skill.all);
      preRollSkillHookId = Hooks.once(`${game.system?.id}.preRollSkillV2`, (config, dialog, message) => {
        message.data ??= {};
        if (foundry.utils.isNewerVersion("4.2", game.system?.version ?? "")) {
          message.create = false; // TODO dnd5e 4.2 remove this
        }
        if (overtimeActorUuid)
          message.data["flags.midi-qol.overtimeActorUuid"] = overtimeActorUuid;
        config.rolls.forEach(roll => {
          roll.options.advantage ||= config.midiOptions.advantage;
          roll.options.disadvantage ||= config.midiOptions.disadvantage;
          if (maxValue && Number.isNumeric(maxValue)) roll.options.maximum = Math.min(Number(maxValue), roll.options.maximum ?? Infinity);
          if (minValue && Number.isNumeric(minValue)) roll.options.minimum = Math.max(Number(minValue), roll.options.minimum ?? -Infinity);
        })
        setDialogOptions(dialog, config, config.rolls[0]?.options);
      })
      rollSkillHookId = Hooks.once(`${game.system?.id}.postSkillRollConfiguration`, (rolls, config, dialog, messageDetails) => {
        // record message configuration details for later display
        message = messageDetails;
      });

      const saveCreate = message.create;
      message.create = false;
      result = await wrapped(config, dialog, message);
      message.create = saveCreate;
    }
    if (!result) return result;
    /*
    if (rollMode !== CONST.DICE_ROLL_MODES.BLIND) rollMode = result.options.rollMode;
    else result.options.rollMode = CONST.DICE_ROLL_MODES.BLIND;
    */
    await displayDSNForRoll(result, "skill", rollMode);
    if (!config.simulate) {
      result[0] = await bonusCheck(this, result[0], "skill", skillId, message.data);
      DSNMarkDiceDisplayed(result);
    }
    if (config.target !== undefined && success === undefined) {
      const resultTotal = result.reduce((acc, r) => acc + r.total, 0);
      success = resultTotal >= config.target;
      result.forEach(r => r.options.success = success);
    }
    if (message.create !== false && result) {
      if (foundry.utils.getProperty(result, "flags.midi-qol.chatMessageShown") !== true)
        await result[0].toMessage(message.data, { rollMode });
    }
    await expireRollEffect.bind(this)("Skill", skillId, success);

  } catch (err) {
    const message = `doRollSkill error ${this.name}, ${this.uuid}`;
    TroubleShooter.recordError(err, message)
    throw err;
  }
  finally {
    if (preRollSkillHookId) Hooks.off(`${game.system?.id}.preRollSkillV2`, preRollSkillHookId);
    if (rollSkillHookId) Hooks.off(`${game.system?.id}.postSkillRollConfiguration`, rollSkillHookId);
    if (saveRollMode) game.settings?.set("core", "rollMode", saveRollMode);
    if (oldFormat) return result?.[0];
    return result;
  }
}


function setDialogOptions(dialog, config, options) {
  dialog.options ??= {};
  //@ts-expect-error
  const ADV_MODE = CONFIG.Dice.D20Roll.ADV_MODE;
  if (config.midiOptions?.fastForward || options.advantage) dialog.configure = false;
  if (dialog.configure === undefined && autoFastForwardAbilityRolls) dialog.configure = false;
  if (areMidiKeysPressed(config.event, "RollToggle")) dialog.configure = !dialog.configure;

  if (options.advantage && !options.disadvantage) {
    dialog.options.advantageMode = ADV_MODE.ADVANTAGE;
    dialog.options.defaultButton = "advantage";
  } else if (!options.advantage && options.disadvantage) {
    dialog.options.advantageMode = ADV_MODE.DISADVANTAGE;
    dialog.options.defaultButton = "disadvantage";
  } else {
    dialog.options.advantageMode = ADV_MODE.NORMAL;
    dialog.options.defaultButton = "normal";
  }
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
      newTerm.options = term.options;
      return newTerm;
    }
    return term;
  });
  //@ts-expect-error _formula is private
  roll._formula = roll.constructor.getFormula(roll.terms);
  return roll;
}

function configureDamage(wrapped, options: any = { critical: {} }) {
  // @ ts-expect-error
  // if ((options.critical && foundry.utils.isEmpty(options.critical)) || this.options.configured || options.critical.allow === false || !this.isCritical) {

  this.simplify();
  if (this.options.configured || options.critical.allow === false || !this.isCritical) {
    return;
  }
  const OperatorTerm = foundry.dice.terms.OperatorTerm
  const DiceTerm = foundry.dice.terms.DiceTerm;
  const Die = foundry.dice.terms.Die;
  let useDefaultCritical = getCriticalDamage() === "default";
  useDefaultCritical ||= (getCriticalDamage() === "explodeCharacter" && this.data.actorType !== "character");
  useDefaultCritical ||= (getCriticalDamage() === "explodeNPC" && this.data.actorType !== "npc");
  if (useDefaultCritical) {
    while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
      this.terms.pop();
    //@ts-expect-error "dnd5e"
    options.critical.multiplyNumeric ??= game.settings?.get("dnd5e", "criticalDamageModifiers");
    //@ts-expect-error "dnd5e"
    options.critical.powerfulCritical ??= game.settings?.get("dnd5e", "criticalDamageMaxDice");
    wrapped({ critical: options.critical });
    if (this.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") averageDice(this);
    return;
  }
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
    switch (getCriticalDamage()) {
      case "maxDamage":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        break;
      case "maxDamageExplode":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        if (term instanceof DiceTerm) {
          bonusTerms.push(new OperatorTerm({ operator: "+" }));
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = term.options;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "maxCrit":  // Powerful critical
      case "maxCritRoll":
        if (term instanceof DiceTerm) {
          let critTerm;
          bonusTerms.push(new OperatorTerm({ operator: "+" }));
          if (getCriticalDamage() === "maxCrit")
            critTerm = new NumericTerm({ number: (term.number + cb) * (term.faces ?? 1) });
          else {
            critTerm = new Die({ number: term.number + cb, faces: term.faces });
            critTerm.modifiers = foundry.utils.duplicate(term.modifiers);
            critTerm.modifiers.push(`min${term.faces}`);
          }
          critTerm.options = term.options;
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
          bonusTerms.push(new OperatorTerm({ operator: "+" }));
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = term.options;
          // foundry.utils.setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "maxBaseRollCrit":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        if (term instanceof DiceTerm) {
          bonusTerms.push(new OperatorTerm({ operator: "+" }));
          const newTerm = new Die({ number: term.number, faces: term.faces })
          newTerm.options = term.options;
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
        if (!term.options?.flavor) term.options = this.terms[0].options;
    }
    if (!(extra.terms[0] instanceof OperatorTerm)) this.terms.push(new OperatorTerm({ operator: "+" }));
    this.terms.push(...extra.terms);
  }
  while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
    this.terms.pop();
  this.resetFormula();
  this.options.configured = true;
  if (this.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") averageDice(this);
}

async function doRollAbilityV2(wrapped, rollType, config: any = {}, dialog: any = {}, message: any = {}) {
  let oldFormat = false;
  if (foundry.utils.getType(config) !== "Object") {
    oldFormat = true;
    const method = rollType === "save" ? "rollSavingThrow" : "rollAbilityCheck";
    foundry.utils.logCompatibilityWarning(
      `The \`${method}\` method on Actor5e now takes roll, dialog, and message config objects as parameters.`,
      { since: "DnD5e 4.1", until: "DnD5e 4.5" }
    );
    oldFormat = true;
    const oldConfig = dialog;
    config = { ability: config };
    dialog = {};
    _applyDeprecatedD20Configs(config, dialog, message, oldConfig);
  } else {
    config.legacy = false;
  }
  if (config.midiOptions?.isConcentrationCheck) {
    foundry.utils.setProperty(message, "data.flags.midi-qol.isConcentrationCheck", true);
    config.midiOptions.isConcentrationCheck = false; // remove the isConcentrationCheck option so we won't infinitely recurse
    // Note to self concentration max/min value is now handled directly by dnd5e - so the flag has changed
    return this.rollConcentration(config, dialog, message);
  }
  message.data ??= {};
  config.midiOptions ??= {};
  let abilityId = config.ability;
  let overtimeActorUuid;
  let preRollAbilityHookId;
  let rollAbilityHookId;
  const saveRollMode = safeGetGameSetting("core", "rollMode");
  let result;
  let type;
  try {
    if (config.event) {
      const target = config?.event?.target?.closest('.roll-link, [data-action="rollRequest"], [data-action="concentration"]');
      if (target?.dataset?.midiOvertimeActorUuid) {
        overtimeActorUuid = target.dataset.midiOvertimeActorUuid;
        message.rollMode = target.dataset.midiRollMode ?? message.rollMode;
      }
      if (overtimeActorUuid && this.uuid !== overtimeActorUuid) {
        const actualActor = MQfromUuidSync(overtimeActorUuid);
        if (actualActor && rollType === "save")
          return actualActor.rollSavingThrow(config, dialog, message);
        else return actualActor.rollAbilityCheck(config, dialog, message);
      }
    }

    if (config.target !== undefined && !checkRule("criticalSaves")) { // We have a target value, which means we are checking for success and not criticals
      config.midiOptions.critical = 21;
      config.midiOptions.fumble = 0;
    }

    if (config.midiOptions.fromMars5eChatCard) { // It seems mtb ignores the advantage/disadvantage flags sent in the request
      config.midiOptions.advantage ||= config.event?.altKey;
      config.midiOptions.disadvantage ||= config.event?.ctrlKey;
      message.create = false;
      if (!autoFastForwardAbilityRolls) config.midiOptions.fastForward ||= config.event?.shiftKey;
      else config.midiOptions.fastForward = true;
      config.midiOptions.fastForwardSet ||= autoFastForwardAbilityRolls
    }

    await procAbilityAdvantage(this, rollType, abilityId, config.midiOptions);

    type = rollType === "save" ? "SavingThrow" : "AbilityCheck";
    if (overtimeActorUuid)
      message.data["flags.midi-qol.overtimeActorUuid"] = overtimeActorUuid;

    let success;
    if (procAutoFail(this, rollType, abilityId)) {
      success = false;
      result = [new Roll("-1[auto fail]").evaluateSync()];
    }
    if (success === undefined) {
      const saveCreate = message.create;
      message.create = false;
      const maxFlags = foundry.utils.getProperty(this, "flags.midi-qol.max.ability") ?? {};
      const maxValue = (maxFlags[rollType] && (maxFlags[rollType].all || maxFlags[rollType][abilityId]));
      const minFlags = foundry.utils.getProperty(this, "flags.midi-qol.min.ability") ?? {};
      const minValue = (minFlags[rollType] && (minFlags[rollType].all || minFlags[rollType][abilityId]));
      preRollAbilityHookId = Hooks.once(`${game.system?.id}.preRoll${type}V2`, (config, dialog, message) => {
        config.rolls.forEach(roll => {
          roll.options.advantage ||= config.midiOptions.advantage;
          roll.options.disadvantage ||= config.midiOptions.disadvantage;
          if (maxValue !== undefined && Number.isNumeric(maxValue)) roll.options.maximum = Math.min(roll.options.maximum ?? Infinity, Number(maxValue));
          if (minValue !== undefined && Number.isNumeric(minValue)) roll.options.minimum = Math.max(roll.options.minimum ?? -Infinity, Number(minValue));
        });
        setDialogOptions(dialog, config, config.rolls[0]?.options);
      });
      rollAbilityHookId = Hooks.once(`${game.system?.id}.post${type}RollConfiguration`, (rolls, config, dialog, messageDetails) => {
        // record the configured message data for later display
        message = messageDetails;
      });
      result = await wrapped(config, dialog, message);
      message.create = saveCreate;
    }
    if (!result) return result;
    if (result instanceof Roll) {
      console.warn("midi-qol | doRollAbilityV2: result is a Roll, not an array of Rolls");
      result = [result];
    }
    const flavor = result[0].options?.flavor;

    let rollMode: string = message.rollMode ?? safeGetGameSetting("core", "rollMode");
    if ([CONST.DICE_ROLL_MODES.PUBLIC, "roll", CONST.DICE_ROLL_MODES.PRIVATE].includes(rollMode)) {
      let blindRollSetting;
      if (rollType === "check")
        blindRollSetting = configSettings.rollChecksBlind.includes("all") || configSettings.rollChecksBlind.includes(abilityId);
      else if (rollType === "save")
        blindRollSetting = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes(abilityId);
      if (blindRollSetting) {
        rollMode = CONST.DICE_ROLL_MODES.BLIND;
        game.settings?.set("core", "rollMode", CONST.DICE_ROLL_MODES.BLIND);
        result.forEach(r => r.options.rollMode = CONST.DICE_ROLL_MODES.BLIND);
      }

    }
    if (config.rollMode) {
      console.warn("midi-qol | doRollAbilityV2: config.rollMode is deprecated, use message.rollMode instead");
    }
    if (rollMode !== CONST.DICE_ROLL_MODES.BLIND) rollMode = message.rollMode ?? config.rollMode;
    await displayDSNForRoll(result, rollType, rollMode);
    foundry.utils.mergeObject(message.data, { "flags": config.flags ?? {} });
    if (!config.midiOptions.simulate) {
      result[0] = await bonusCheck(this, result[0], rollType, abilityId, message.data);
      DSNMarkDiceDisplayed(result);
      if (Number.isNumeric(result[0].options.target) && result[0].isSuccess === false) {
        const failFlagsLength = collectBonusFlags(this, rollType, "fail.all").length;
        const failAbilityFlagsLength = collectBonusFlags(this, rollType, `fail.${abilityId}`).length
        if (failFlagsLength || failAbilityFlagsLength) {
          // If the roll fails and there is an flags.midi-qol.save.fail then apply the bonus
          result[0] = await bonusCheck(this, result[0], rollType, failAbilityFlagsLength ? `fail.${abilityId}` : "fail.all");
        }
      }
    }

    if (config.target !== undefined && success === undefined) {
      const resultTotal = result.reduce((acc, r) => acc + r.total, 0);
      success = resultTotal >= config.target;
      result.forEach(r => r.options.success = success);
    }

    if (message.create !== false && result) {
      //@ts-expect-error no dnd5e-types
      CONFIG.Dice.D20Roll.toMessage(result, message.data, { rollMode, create: true });
    }
    if (saveRollMode) game.settings?.set("core", "rollMode", saveRollMode);
    await expireRollEffect.bind(this)(rollType, abilityId, success);
    if (config.midiOptions.isConcentrationCheck) expireRollEffect.bind(this)("isConcentrationSave", success);
  } catch (err) {
    const message = `doAbilityRoll error ${this.name} ${abilityId} ${rollType} ${this.uuid}`;
    TroubleShooter.recordError(err, message);
    error(message, err);
  } finally {
    if (preRollAbilityHookId) Hooks.off(`${game.system?.id}.preRoll${type}V2`, preRollAbilityHookId);
    if (rollAbilityHookId) Hooks.off(`${game.system?.id}.post${type}RollConfiguration`, rollAbilityHookId);
    if (saveRollMode) game.settings?.set("core", "rollMode", saveRollMode);
    return oldFormat ? result?.[0] : result
  }
}

export async function rollSavingThrow(wrapped, config = {}, dialog = {}, message = {}) {
  return doRollAbilityV2.bind(this)(wrapped, "save", config, dialog, message);
}

async function rollAbilityCheck(wrapped, config = {}, dialog = {}, message = {}) {
  return doRollAbilityV2.bind(this)(wrapped, "check", config, dialog, message);
}

async function rollDeathSave(wrapped, config: any = {}, dialog: any = {}, message: any = {}) {
  const options: any = {};
  const advFlags = foundry.utils.getProperty(this, "flags.midi-qol")?.advantage;
  const disFlags = foundry.utils.getProperty(this, "flags.midi-qol")?.disadvantage;
  const deathSaveBonus = foundry.utils.getProperty(this, "flags.midi-qol")?.deathSaveBonus;

  if (advFlags?.all || advFlags?.deathSave || disFlags?.all || disFlags?.deathSave || deathSaveBonus) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
    if (await evalAllConditionsAsync(this, "flags.midi-qol.advantage.all", conditionData) ||
      await evalAllConditionsAsync(this, "flags.midi-qol.advantage.deathSave", conditionData)) {
      options.advantage = true;
    }

    if (deathSaveBonus) {
      let bonus: any;
      if (typeof (deathSaveBonus) === "number") {
        bonus = deathSaveBonus;
      } else {
        bonus = await evalAllConditionsAsync(this, "flags.midi-qol.deathSaveBonus", conditionData);
      }
      if (bonus) {
        if (options.parts instanceof Array) {
          options.parts.push(bonus);
        } else {
          options.parts = [bonus];
        }
      }
    }

    if (await evalAllConditionsAsync(this, "flags.midi-qol.disadvantage.all", conditionData) ||
      await evalAllConditionsAsync(this, "flags.midi-qol.disadvantage.deathSave", conditionData)) {
      options.disadvantage = true;
    }
  }
  config.midiOptions = options;
  const blindSaveRoll = configSettings.rollSavesBlind.includes("all") || configSettings.rollSavesBlind.includes("death");
  Hooks.once("dnd5e.preRollDeathSaveV2", (config, dialog, message) => {
    for (let roll of config.rolls) {
      roll.options.advantage = config.midiOptions.advantage;
      roll.options.disadvantage = config.midiOptions.disadvantage;
      if (config.midiOptions?.parts?.length) roll.parts.push(config.midiOptions.parts);
      if (blindSaveRoll) roll.options.rollMode = CONST.DICE_ROLL_MODES.BLIND
    }
    setDialogOptions(dialog, config, config.rolls[0].options);
    if (blindSaveRoll) message.rollMode = CONST.DICE_ROLL_MODES.BLIND;
  });
  return wrapped(config, dialog, message);
}

export async function deathSaveHook(actor, result, details) {
  if (details.chatString === "DND5E.DeathSaveFailure") {
    if (hasCondition(actor, "unconscious")) {
      const _id = CONFIG.statusEffects.find(e => e.id === "unconscious")?._id;
      const effect = actor.effects.find(e => e._id === _id);
      if (effect) effect.update({ "flags.core.overlay": false });
    }
    setDeadStatus(actor, { effect: getDeadStatus(), useDefeated: true, makeDead: true, overlay: true });
  }
}

export function procAutoFail(actor, rollType: string, abilityId: string): boolean {
  const midiFlags = actor.flags[MODULE_ID] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.ability || fail.all) {
    const rollFlags = (fail.ability && fail.ability[rollType]) ?? {};
    const autoFail = fail.all || fail.ability.all || rollFlags.all || rollFlags[abilityId];
    return autoFail;
  }
  return false;
}

export function procAutoFailSkill(actor, skillId): boolean {
  const midiFlags = actor.flags[MODULE_ID] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.skill || fail.all) {
    const rollFlags = (fail.skill && fail.skill[skillId]) || false;
    const autoFail = fail.all || fail.skill.all || rollFlags;
    return autoFail;
  }
  return false;
}

export async function procAbilityAdvantage(actor, rollType, abilityId, options: Options | any): Promise<Options> {
  const midiFlags = actor.flags[MODULE_ID] ?? {};
  const advantage = midiFlags.advantage;
  const disadvantage = midiFlags.disadvantage;
  var withAdvantage = options.advantage;
  var withDisadvantage = options.disadvantage;

  if (rollType === "save" && options.isMagicSave) {
    const mr = (i18n("midi-qol.MagicResistant") ?? "Magic Resistant").trim();
    if ((actor?.system.traits?.dr?.custom || "").includes(mr))
      withAdvantage = true;;
    const conditionData = createConditionData({ workflow: options.workflow, target: tokenForActor(actor), actor, item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid });
    if (await evalAllConditionsAsync(actor, "flags.midi-qol.magicResistance.all", conditionData, false) ||
      await evalAllConditionsAsync(actor, `flags.midi-qol.magicResistance.${abilityId}`, conditionData, false)) {
      withAdvantage = true;
    }
    if (await evalAllConditionsAsync(actor, "flags.midi-qol.magicVulnerability.all", conditionData, false) ||
      await evalAllConditionsAsync(actor, `flags.midi-qol.magicVulnerability.${abilityId}`, conditionData, false)) {
      withDisadvantage = true;
    }
  }

  if (advantage || disadvantage) {
    const conditionData = createConditionData({ workflow: options.workflow, target: tokenForActor(actor), actor, item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid });
    if (advantage) {
      if (await evalAllConditionsAsync(actor, "flags.midi-qol.advantage.all", conditionData)
        || await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.ability.all`, conditionData)
        || await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.ability.${rollType}.all`, conditionData)
        || await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.ability.${rollType}.${abilityId}`, conditionData)) {
        options.advantage ||= true;
      }
    }

    if (disadvantage) {
      if (await evalAllConditionsAsync(actor, "flags.midi-qol.disadvantage.all", conditionData)
        || await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.ability.all`, conditionData)
        || await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.ability.${rollType}.all`, conditionData)
        || await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.ability.${rollType}.${abilityId}`, conditionData)) {
        options.disadvantage ||= true;
      }
    }
  }
  return options;
}

export async function procAdvantageSkill(actor, skillId, options: Options): Promise<Options> {
  const midiFlags = actor.flags[MODULE_ID];
  const advantage = midiFlags?.advantage;
  const disadvantage = midiFlags?.disadvantage;
  var withAdvantage = options.advantage;
  var withDisadvantage = options.disadvantage;
  if (advantage || disadvantage) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor, item: options.item ?? options.itemUuid ?? options.saveItem ?? options.saveItemUuid });
    if (await evalAllConditionsAsync(actor, "flags.midi-qol.advantage.all", conditionData)
      || await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.skill.all`, conditionData)
      || await evalAllConditionsAsync(actor, `flags.midi-qol.advantage.skill.${skillId}`, conditionData)) {
      withAdvantage = true;
    }
    if (await evalAllConditionsAsync(actor, "flags.midi-qol.disadvantage.all", conditionData)
      || await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.skill.all`, conditionData)
      || await evalAllConditionsAsync(actor, `flags.midi-qol.disadvantage.skill.${skillId}`, conditionData)) {
      withDisadvantage = true;
    }
  }
  options.advantage ||= withAdvantage;
  options.disadvantage ||= withDisadvantage;
  return options;
}

let debouncedATRefresh = foundry.utils.debounce(_midiATIRefresh, 30);
function _midiATIRefresh(template) {
  // We don't have an item to check auto targeting with, so just use the midi setting
  if (!canvas?.tokens) return;
  let autoTarget = getActivityAutoTargetAction(template.activity);
  if (autoTarget === "none") return;
  if (autoTarget === "dftemplates" && installedModules.get("df-templates"))
    return; // df-templates will handle template targeting.

  if (installedModules.get("levelsvolumetrictemplates") && !["walledtemplates"].includes(autoTarget)) {
    //@ts-expect-error CONFIG.Levels
    const levelsTemplateData = CONFIG.Levels.handlers.TemplateHandler.getTemplateData(false);
    if (!template.document.elevation !== levelsTemplateData.elevation) {
      //@ts-expect-error
      if (game.release.generation >= 12) {
        template.document.elevation = levelsTemplateData.elevation;
      }
      else foundry.utils.setProperty(template.document, "flags.levels.elevation", levelsTemplateData.elevation);
    }
    // Filter which tokens to pass - not too far wall blocking is left to levels.
    let distance = template.distance;
    const dimensions = canvas?.dimensions || { size: 1, distance: 1 };
    distance *= dimensions.size / dimensions.distance;
    const tokens: Token[] | undefined = canvas.tokens.placeables;
    const tokensToCheck = tokens?.filter(tk => {
      const r: Ray = new Ray(
        { x: template.document?.x ?? template.x, y: template.document?.y ?? template.y },
        //@ts-ignore .width .height TODO check this v10
        { x: tk.x + tk.document.width * dimensions.size, y: tk.y + tk.document.height * dimensions.size }
      );
      //@ts-ignore .width .height TODO check this v10
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
    const distance: number = template.distance ?? 0;
    if (template.activity) {
      const ignoreSelf = (template.activity?.target.affects.special ?? "").split(";").some(spec => spec === "self");
      templateTokens(template, getTokenForActor(template.item.parent), ignoreSelf, getAoETargetType(template.activity), autoTarget);
      return true;
    } else
      templateTokens(template);
    return true;
  }
  return true;
}

function midiATRefresh(wrapped) {
  debouncedATRefresh(this);
  return wrapped();
}

export function _prepareDerivedData(wrapped, ...args) {
  wrapped(...args);
  try {
    if (!this.system.abilities?.dex) return;
    if (![false, undefined, "none"].includes(checkRule("challengeModeArmor"))) {
      const armorDetails = this.system.attributes.ac ?? {};
      const ac = armorDetails?.value ?? 10;
      const equippedArmor = armorDetails.equippedArmor;
      let armorAC = equippedArmor?.system.armor.value ?? 10;
      const equippedShield = armorDetails.equippedShield;
      const shieldAC = equippedShield?.system.armor.value ?? 0;

      if (checkRule("challengeModeArmor") !== "challenge") {
        switch (armorDetails.calc) {
          case 'flat':
            armorAC = (ac.flat ?? 10) - this.system.abilities.dex.mod;
            break;
          case 'draconic': armorAC = 13; break;
          case 'natural': armorAC = (armorDetails.value ?? 10) - this.system.abilities.dex.mod; break;
          case 'custom': armorAC = equippedArmor?.system.armor.value ?? 10; break;
          case 'mage': armorAC = 13; break; // perhaps this should be 10 if mage armor is magic bonus
          case 'unarmoredMonk': armorAC = 10; break;
          case 'unarmoredBarb': armorAC = 10; break;
          default:
          case 'default': armorAC = armorDetails.equippedArmor?.system.armor.value ?? 10; break;
        };
        const armorReduction = armorAC - 10 + shieldAC;
        const ec = ac - armorReduction;
        this.system.attributes.ac.EC = ec;
        this.system.attributes.ac.AR = armorReduction;;
      } else {
        if (!this.system.abilities) {
          console.error("midi-qol | challenge mode armor failed to find abilities");
          console.error(this);
          return;
        }
        let dexMod = this.system.abilities.dex.mod;
        if (equippedArmor?.system.armor.type === "heavy") dexMod = 0;
        if (equippedArmor?.system.armor.type === "medium") dexMod = Math.min(dexMod, 2)
        this.system.attributes.ac.EC = 10 + dexMod + shieldAC;
        this.system.attributes.ac.AR = ac - 10 - dexMod;
      }
    }
  } catch (err) {
    const message = "midi-qol failed to prepare derived data";
    console.error(message, err);
    TroubleShooter.recordError(err, message);
  }
}
let currentDAcalculateDamage;
let currentDAGetTargetOptions;

export function initPatching() {
  libWrapper = globalThis.libWrapper;

  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareDerivedData", _prepareDerivedData, "WRAPPER");
  // For new onuse macros stuff.
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.prepareData", itemPrepareData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.prepareData", actorPrepareData, "WRAPPER");
  libWrapper.register(MODULE_ID, "KeyboardManager.prototype._onFocusIn", _onFocusIn, "OVERRIDE");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getRollData", actorGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.getRollData", itemGetRollData, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._preCreate", _preCreateActiveEffect, "WRAPPER");
  currentDAcalculateDamage = window?.customElements?.get("damage-application")?.prototype.calculateDamage;
  if (window?.customElements?.get("damage-application")?.prototype?.calculateDamage) {
    currentDAcalculateDamage = window?.customElements?.get("damage-application")?.prototype?.calculateDamage;
    //@ts-expect-error
    window.customElements.get("damage-application").prototype.calculateDamage = _DAcalculateDamage;
  }
  if (window?.customElements?.get("damage-application")?.prototype?.getTargetOptions) {
    currentDAGetTargetOptions = window.customElements.get("damage-application")?.prototype?.getTargetOptions
    //@ts-expect-error
    window.customElements.get("damage-application").prototype.getTargetOptions = _DAgetTargetOptions;
  }
}

function _DAgetTargetOptions(...args) {
  let [uuid] = args;
  const options = currentDAGetTargetOptions.bind(this)(...args);
  // const damageType = getProperty(this, `damages.flags.${MODULE_ID}.damageType`);
  const damageType = this.damages?.flags?.[MODULE_ID]?.damageType;
  let targetDetails;
  if (damageType) {
    const targets = this?.chatMessage?.flags?.["midi-qol"]?.midi?.dnd5eTargets ?? [];
    targetDetails = targets.find(target => target.uuid === uuid);
    if (!targetDetails) return options;
    options.midi = foundry.utils.duplicate(targetDetails);
    const saveMult = targetDetails.saveMults?.[damageType];
    if (targetDetails.saved) {
      foundry.utils.setProperty(options, "midi.saveMultiplier", saveMult ?? 0.5);
    }
    if (saveMult !== undefined) {
      if (targetDetails.superSaver && saveMult === 0.5) {
        foundry.utils.setProperty(options, "midi.saveMultiplier", targetDetails.saved ? 0 : 0.5);
      }
      if (targetDetails.semiSuperSaver && saveMult === 0.5) {
        foundry.utils.setProperty(options, "midi.saveMultiplier", targetDetails.saved ? 0 : 1);
      }
    }
    if (targetDetails.uncannyDodge) {
      foundry.utils.setProperty(options, "midi.uncannyDodge", true);
    }
    foundry.utils.setProperty(options, "midi.sourceActorUuid", targetDetails.sourceActorUuid);
  }
  return options;
}

function _DAcalculateDamage(actor, options) {
  const { temp, total, active } = currentDAcalculateDamage.bind(this)(actor, options);
  active.absorption = new Set();
  active.saved = new Set();
  active.superSaver = new Set();
  active.semiSuperSaver = new Set();
  active.spell = new Set();
  active.magic = new Set();
  active.uncannyDodge = new Set();
  active.nonmagic = new Set();
  active.DR = new Set();
  const damages = actor.calculateDamage(this.damages, options);
  for (const damage of damages) {
    if (damage.active.absorption) active.absorption.add(damage.type);
    if (damage.active.spell) active.spell.add(damage.type);
    if (damage.active.magic) active.magic.add(damage.type);
    if (damage.active.nonmagic) active.nonmagic.add(damage.type);
    if (damage.active.DR) active.DR.add(damage.type);
    if (damage.active.superSaver) active.superSaver.add(damage.type);
    else if (damage.active.semiSuperSaver) active.semiSuperSaver.add(damage.type);
    else if (damage.active.saved) active.saved.add(damage.type);

    if (damage.active.uncannyDodge) active.uncannyDodge.add(damage.type);
  }
  const union = t => {
    if (foundry.utils.getType(options.ignore?.[t]) === "Set") active[t] = active[t].union(options.ignore[t]);
  };
  union("absorption");
  union("spell")
  union("magic");
  union("nonmagic");
  union("saved");
  union("uncannyDodge");
  union("DR");
  return { temp, total, active };
}

export function _onFocusIn(event) {
  const formElements = [
    HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLOptionElement, /*HTMLButtonElement*/
  ];
  if (event.target.isContentEditable || formElements.some(cls => event.target instanceof cls)) this.releaseKeys();
}

export function actorPrepareData(wrapped) {
  try {
    foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", foundry.utils.getProperty(this._source, "flags.midi-qol.onUseMacroName"));
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

export function itemPrepareData(wrapped) {
  foundry.utils.setProperty(this, "flags.midi-qol.onUseMacroName", foundry.utils.getProperty(this._source, "flags.midi-qol.onUseMacroName"));
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

export function prepareOnUseMacroData(actorOrItem) {
  try {
    const macros = foundry.utils.getProperty(actorOrItem, 'flags.midi-qol.onUseMacroName');
    foundry.utils.setProperty(actorOrItem, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macros ?? null));
  } catch (err) {
    const message = `midi-qol | failed to prepare onUse macro data ${actorOrItem?.name}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  }
}

export function preUpdateItemActorOnUseMacro(itemOrActor: Item | Actor, changes, options, user) {
  try {
    const macroChanges = foundry.utils.getProperty(changes, "flags.midi-qol.onUseMacroParts") ?? {};
    //@ts-ignore
    if (foundry.utils.isEmpty(macroChanges)) return true;
    const macros = foundry.utils.getProperty(itemOrActor._source, "flags.midi-qol.onUseMacroName");
    const macroParts = new OnUseMacros(macros ?? null);

    if (!Array.isArray(macroChanges.items)) { // we have an update from editing the macro changes
      for (let keyString in macroChanges.items) {
        let key = Number(keyString);
        if (Number.isNaN(key)) continue; // just in case
        if (!macroParts.items[key]) {
          macroParts.items.push(OnUseMacro.parsePart({
            macroName: macroChanges.items[key]?.macroName ?? "",
            option: macroChanges.items[key]?.option ?? ""
          }));
          key = macroParts.items.length - 1;
        }
        if (macroChanges.items[keyString].macroName) macroParts.items[key].macroName = macroChanges.items[keyString].macroName;
        if (macroChanges.items[keyString].option) macroParts.items[key].option = macroChanges.items[keyString].option;
      }
    }
    let macroString = OnUseMacros.parseParts(macroParts).items.map(oum => oum.toString()).join(",");
    changes.flags[MODULE_ID].onUseMacroName = macroString;
    delete changes.flags[MODULE_ID].onUseMacroParts;
  } catch (err) {
    delete changes.flags[MODULE_ID].onUseMacroParts;
    const message = `midi-qol | failed in preUpdateItemActor onUse Macro for ${itemOrActor?.name} ${itemOrActor?.uuid}`
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
  }
  return true;
};

export function getItemEffectsToDelete(args: { actor: Actor, origin: string, ignore: string[], ignoreTransfer: boolean, options: any }): string[] {
  warn("getItemEffectsToDelete: started", globalThis.DAE?.actionQueue);
  let effectsToDelete;
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
        // @ts-expect-error
        && (!ignoreTransfer || ef.flags?.dae?.transfer !== true)
    }).map(ef => ef.id);
    warn("getItemEffectsToDelete: effectsToDelete ", actor.name, effectsToDelete, options);
    return effectsToDelete;
  } catch (err) {
    const message = `getItemEffectsToDelete item effects failed for ${actor.name} ${origin} ${effectsToDelete}`;
    console.warn(message, err);
    TroubleShooter.recordError(err, message);
    return [];
  }
}

export async function zeroHPExpiry(actor, update, options, user) {
  const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
  if (hpUpdate !== 0) return;
  const expiredEffects: ActiveEffect[] = [];
  for (let effect of actor.appliedEffects) {
    if (effect.flags?.dae?.specialDuration?.includes("zeroHP")) expiredEffects.push(effect)
  }
  if (expiredEffects.length > 0) await expireEffects(actor, expiredEffects, { "expiry-reason": "midi-qol:zeroHP" })
}

export async function checkWounded(actor, update, options, user) {
  const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
  const vitalityResource = checkRule("vitalityResource");
  //@ts-expect-error
  const dfreds = game.dfreds;
  let vitalityUpdate = vitalityResource && foundry.utils.getProperty(update, vitalityResource.trim());
  // return wrapped(update,options,user);
  if (hpUpdate === undefined && (!vitalityResource || vitalityUpdate === undefined)) return;
  const attributes = actor.system.attributes;
  const needsBeaten = vitalityResource ? vitalityUpdate <= 0 : attributes.hp.value <= 0;
  if (configSettings.addWounded > 0 && configSettings.addWoundedStyle !== "none") {
    const needsWounded = attributes.hp.pct < configSettings.addWounded && !needsBeaten;
    const woundedStatus = getWoundedStatus();
    if (!woundedStatus) {
      const message = "wounded status condition not set - please update your midi-qol wounded condition on the mechanics tab";
      TroubleShooter.recordError(new Error(message), "In check wounded");
      ui.notifications?.warn(`midi-qol | ${message}`);
    } else if (installedModules.get("dfreds-convenient-effects") && isConvenientEffect(woundedStatus)) {
      const wounded = await ConvenientEffectsHasEffect(woundedStatus.name, actor, false);
      if (wounded !== needsWounded) {
        if (needsWounded) CEAddEffectWith({ effectName: woundedStatus.name, effectId: woundedStatus.id, uuid: actor.uuid, overlay: configSettings.addWoundedStyle === "overlay" });
        // await dfreds.effectInterface?.addEffectWith({ effectData: woundedStatus, uuid: actor.uuid, overlay: configSettings.addWoundedStyle === "overlay" });
        else await actor.effects.find(ef => ef.name === woundedStatus.name)?.delete();
      }
    } else if (!isConvenientEffect(woundedStatus)) {
      const token = tokenForActor(actor);
      if (woundedStatus && token) {
        if (!needsWounded) {
          // Cater to the possibility that the setings changed while the effect was applied
          await token.actor?.toggleStatusEffect(woundedStatus?.id, { overlay: true, active: false });
          await token.actor?.toggleStatusEffect(woundedStatus?.id, { overlay: false, active: false });
        } else {
          if (!token.document.hasStatusEffect(woundedStatus.id)) {
            await token.actor?.toggleStatusEffect(woundedStatus.id, { overlay: configSettings.addWoundedStyle === "overlay", active: true });
          }
        }
      }
    }
  }
  if (configSettings.addDead !== "none") {
    let effect: any = getDeadStatus();
    let useDefeated = true;

    if ((actor.type === "character" || actor.hasPlayerOwner) && !vitalityResource) {
      effect = getUnconsciousStatus();
      useDefeated = effect === getDeadStatus();
    }
    if (!needsBeaten) {
      await setDeadStatus(actor, { effect, useDefeated, makeDead: false });

    } else {
      await setDeadStatus(actor, { effect, useDefeated, makeDead: needsBeaten });
    }
  }
}

async function setDeadStatus(actor, options: any) {
  //@ts-expect-error
  const dfreds = game.dfreds;
  let { effect, useDefeated, makeDead } = options;
  if (!effect) return;
  if (effect && installedModules.get("dfreds-convenient-effects") && isConvenientEffect(effect)) {
    const isBeaten = actor.effects.find(ef => ef.name === effect?.name) !== undefined;
    if ((makeDead !== isBeaten)) {
      let combatant;
      const combat: Combat | null | undefined = game.combat;
      if (actor.token && combat) combatant = combat?.getCombatantByActor(actor);
      else combatant = game.combat?.getCombatantByActor(actor.id);
      if (combatant && useDefeated) {
        await combatant.update({ defeated: makeDead })
      }
      if (makeDead) {
        await CEAddEffectWith({ effectName: effect.name, uuid: actor.uuid, overlay: (configSettings.addDead === "overlay") || options.overlay });
        // await dfreds.effectInterface?.addEffectWith({ effectData: effect, uuid: actor.uuid, overlay: configSettings.addDead === "overlay" });
      } else { // remove beaten condition
        await CERemoveEffect({ effectName: effect.name, uuid: actor.uuid });
        // await dfreds.effectInterface?.removeEffect({ effectName: effect?.name, uuid: actor.uuid })
      }
    }
  } else if (!isConvenientEffect(effect)) {
    // V12 uses an actor
    const isBeaten = actor.effects.find(ef => ef.name === (i18n(effect?.name ?? effect?.label ?? ""))) !== undefined;
    if (isBeaten !== makeDead) {
      let combatant;
      const combat: Combat | null | undefined = game.combat;
      if (actor.token) combatant = combat?.getCombatantByToken(actor.token.id);
      else combatant = game.combat?.getCombatantByActor(actor.id);
      if (combatant && useDefeated) await combatant.update({ defeated: makeDead });
      await actor.toggleStatusEffect(effect.id, { overlay: (configSettings.addDead === "overlay") || options.overlay, active: makeDead });
      const token = tokenForActor(actor);
      // TODO find out why such a long delay is needed
      setTimeout(() => token?._onApplyStatusEffect(effect.id, makeDead), 1000);
    }
  }
}

function itemSheetDefaultOptions(wrapped) {
  const options = wrapped();
  const modulesToCheck = ["magic-items-2", "magicitems", "items-with-spells-5e", "ready-set-roll-5e"];
  const installedModules = modulesToCheck.filter(mid => game.modules?.get(mid)?.active).length + (configSettings.midiFieldsTab ? 1 : 0);
  const newWidth = 560 + Math.max(0, (installedModules - 2) * 100);
  if (options.width < newWidth) {
    log(`increasing item sheet width from ${options.width} to ${newWidth}`);
    options.width = newWidth;
  }
  return options;
}

function prepareSheetItem(wrapped, item, ctx) {
  wrapped(item, ctx);
  if (ctx.activities?.length > 0) {
    ctx.activities = ctx.activities.filter(data => {
      const activity = item.system.activities.get(data._id ?? data.id);
      return !activity?.midiProperties?.automationOnly;
    });
  }
  return ctx;
}

export function readyPatching() {
  if (game.system?.id === "dnd5e" || game.system?.id === "n5e") {
    libWrapper.register(MODULE_ID, `game.${game.system?.id}.canvas.AbilityTemplate.prototype.refresh`, midiATRefresh, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter'].cls.prototype._filterItems", _filterItems, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter2'].cls.prototype._prepareItem", prepareSheetItem, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.npc['dnd5e.ActorSheet5eNPC'].cls.prototype._filterItems", _filterItems, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.npc['dnd5e.ActorSheet5eNPC2'].cls.prototype._prepareItem", prepareSheetItem, "WRAPPER");
    if (!isDnD) libWrapper.register(MODULE_ID, "CONFIG.Item.sheetClasses.base['dnd5e.ItemSheet5e2'].cls.defaultOptions", itemSheetDefaultOptions, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.createConcentrationEffectData", createConcentrationEffectData, "WRAPPER");
    // This controls whether to display the chat message or not
    // dnd5e.damageActor handles picking up concentration item rolls
    // processConcentrationSave handles doing the auto roll for concentration chat messages
    libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.challengeConcentration", challengeConcentration, "MIXED")
  } else { // TODO find out what itemsheet5e is called in sw5e TODO work out how this is set for sw5e v10
    libWrapper.register(MODULE_ID, "game.sw5e.canvas.AbilityTemplate.prototype.refresh", midiATRefresh, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.character['sw5e.ActorSheet5eCharacter'].cls.prototype._filterItems", _filterItems, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Actor.sheetClasses.npc['sw5e.ActorSheet5eNPC'].cls.prototype._filterItems", _filterItems, "WRAPPER");
  }
  // Moved overtime processing to the updateCombat hook instead.
  // libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._preUpdate", processOverTime, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Combat.documentClass.prototype._preDelete", _preDeleteCombat, "WRAPPER");

  libWrapper.register(MODULE_ID, "Notifications.prototype.notify", notificationNotify, "MIXED");
  const gameVersion = game.system?.version;
  if ((game.system?.id === "dnd5e" && foundry.utils.isNewerVersion("3.3", gameVersion ?? ""))) {
    if (ui.notifications)
      ui.notifications.error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 3.3.1 or later`);
    else
      error(`dnd5e version ${gameVersion} is too old to support midi-qol, please update to 3.3.1 or later`);
  }
  // libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.getInitiativeRoll", getInitiativeRoll, "WRAPPER")
  // libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollInitiativeDialog", rollInitiativeDialog, "MIXED");
  if (true) {
    const effectClass: any = CONFIG.ActiveEffect.documentClass;
    const classStrings = [
      "CONFIG.Actor.documentClass",
      "CONFIG.Item.documentClass",
      "CONFIG.Token.documentClass",
      "CONFIG.MeasuredTemplate.documentClass",
      "CONFIG.Tile.documentClass",
      "CONFIG.AmbientLight.documentClass",
      "CONFIG.AmbientSound.documentClass",
      "CONFIG.Wall.documentClass",
      "CONFIG.ActiveEffect.documentClass",
    ];
    const addDependent = _addDependent;
    const getDependents = effectClass.prototype.getDependents ?? _getDependents;
    for (let classString of classStrings) {
      const docClass = eval(classString)
      if (!docClass) continue;
      if (!docClass.prototype.addDependent) libWrapper.register(MODULE_ID, `${classString}.prototype._onDelete`, _onDelete, "WRAPPER");
      if (!docClass.prototype.addDependent) docClass.prototype.addDependent = addDependent;
      if (!docClass.prototype.getDependents) docClass.prototype.getDependents = getDependents;
      if (!docClass.prototype.setDependents) docClass.prototype.setDependents = setDependents;
      if (!docClass.prototype.removeDependent) docClass.prototype.removeDependent = removeDependent;
      if (!docClass.prototype.clearDependents) docClass.prototype.clearDependents = clearDependents;
      if (!docClass.prototype.deleteAllDependents) docClass.prototype.deleteAllDependents = deleteAllDependents;
    }
    libWrapper.register(MODULE_ID, "CONFIG.ActiveEffect.documentClass.prototype._onDelete", _onDelete, "WRAPPER");
  }
}

function removeDependent(dependent: any) {
  const id = game.system?.id ?? MODULE_ID;
  const dependents = (this.getFlag(id, "dependents") || []).filter(dep => dep.uuid !== dependent.uuid);
  if (dependents.length === 0) return this.unsetFlag(id, "dependents");
  return this.setFlag(id, "dependents", dependents);
}
function setDependents(dependents) {
  const id = game.system?.id ?? MODULE_ID;
  return this.setFlag(id, "dependents", dependents);
}
async function clearDependents() {
  const id = game.system?.id ?? MODULE_ID;
  if (!this.getFlag(id, "dependents")) return;
  return await this.unsetFlag(id, "dependents");
}

async function deleteAllDependents() {
  if (!game.user?.isGM) return;
  const dependents = this.getDependents();
  await this.clearDependents();
  for (let dep of dependents) {
    await dep.delete();
  }
  return
}

async function addDependents(...dependents) {
  return this.addDependent(...dependents);
}

/**
 * Record another effect as a dependent of this one.
 * @param {...ActiveEffect5e} dependent  One or more dependent effects.
 * @returns {Promise<ActiveEffect5e>}
 */
async function _addDependent(...dependent) {
  const id = game.system?.id ?? MODULE_ID;
  const dependents = this.getDependents().map(d => ({ uuid: d.uuid }));
  dependents.push(...dependent.filter(dep => !dependents.some(d => d.uuid === dep.uuid)).map(d => ({ uuid: d.uuid })));
  return this.setFlag(id, "dependents", dependents);
}

/**
 * Retrieve a list of dependent effects.
 * @returns {Document[]}
 */
function _getDependents() {
  const id = game.system?.id ?? MODULE_ID;
  return Array.from((this.getFlag(id, "dependents") || []).reduce((deps, { uuid }) => {
    const effect = MQfromUuidSync(uuid);
    if (effect) deps.add(effect);
    return deps;
  }, new Set()));
}

async function _onDelete(wrapped, ...args) {
  let [options, userId] = args;
  if (game.user === game.users?.activeGM) {
    if (!this.getDependents) return wrapped(...args);
    // Special case for consumable items - don't delete effect when item deleted
    if (this instanceof Item && this.type === "consumable") {
      foundry.utils.setProperty(this, `flags.${game.system?.id}.dependents`, [])
      return wrapped(...args);
    }
    const dependents = this.getDependents();
    if (dependents.length > 0) {
      for (let dep of dependents) {
        if (fromUuidSync(dep.uuid)) {
          await dep.delete(options);
        }
        // Since the effect will have been already deleted we can't do any updates to it.
        foundry.utils.setProperty(this, `flags.${game.system?.id}.dependents`, [])
      }
    }
  }
  return await wrapped(options, userId);
}

function createConcentrationEffectData(wrapped, item, data: any = {}) {
  const effectData = wrapped(item, data);
  if (!foundry.utils.getProperty(effectData, `flags.${game.system?.id}.itemUuid`)) {
    foundry.utils.setProperty(effectData, `flags.${game.system?.id}.itemUuid`, item.uuid);
  }
  return effectData;
}

export async function challengeConcentration(wrapped, { dc = 10, ability = null } = {}) {
  if (["chatOnly"].includes(configSettings.doConcentrationCheck))
    return wrapped({ dc, ability });
  const isConcentrating = this.concentration.effects.size > 0;
  if (!isConcentrating) return null;
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
  //@ts-ignore game.version
  const patchVision = foundry.utils.isNewerVersion(game.version ?? game?.version, "0.7.0") && game.settings?.get(MODULE_ID, "playerControlsInvisibleTokens")
  if (patchVision) {
    ui.notifications?.warn("Player control vision is deprecated, use it at your own risk")
    console.warn("midi-qol | Player control vision is deprecated, use it at your own risk")

    log("Patching Token._isVisionSource")
    libWrapper.register(MODULE_ID, "Token.prototype._isVisionSource", _isVisionSource, "WRAPPER");

    log("Patching Token.isVisible")
    libWrapper.register(MODULE_ID, "Token.prototype.isVisible", isVisible, "WRAPPER");
  }
  log("Vision patching - ", patchVision ? "enabled" : "disabled")
}

export function configureDamageRollDialog() {
  try {
    libWrapper.unregister(MODULE_ID, "CONFIG.Dice.DamageRoll.configureDialog", false);
    // if (configSettings.promptDamageRoll) libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.configureDialog", CustomizeDamageFormula.configureDialog, "MIXED");
  } catch (err) {
    const message = `midi-qol | error when registering configureDamageRollDialog`;
    TroubleShooter.recordError(err, message);
    error(message, err);
  }
}

function _getUsageConfig(wrapped): any {
  //Radius tempalte spells with self/spec/any will auto place the template so don't prompt for it in config.
  const config = wrapped();
  const autoCreatetemplate = this.hasAreaTarget && hasAutoPlaceTemplate(this);
  if (autoCreatetemplate) config.createMeasuredTemplate = null;
  return config;
}

export let itemPatching = () => {
  libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.use", doItemUse, "MIXED");
  if (game.system?.id === "dnd5e" || game.system?.id === "n5e") {
    if (!isDnD) libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype._getUsageConfig", _getUsageConfig, "WRAPPER");
    libWrapper.register(MODULE_ID, "CONFIG.Dice.DamageRoll.prototype.configureDamage", configureDamage, "MIXED");
  }
  configureDamageRollDialog();
};

export async function checkDeleteTemplate(templateDocument: MeasuredTemplateDocument, options, user) {
  if (user !== game.user?.id) return;
  if (options.undo) return;
  let origin = MQfromUuidSync(templateDocument.getFlag("dnd5e", "origin" as never));
  if (origin instanceof Item && origin.parent instanceof Actor) {
    // @ts-expect-error can't know about flags
    origin = origin.parent.effects?.find(ef => ef.getFlag("dnd5e", "dependents")?.some(dep => dep.uuid === templateDocument.uuid));
  }
  if (origin instanceof ActiveEffect && !options.noConcentrationCheck && configSettings.removeConcentrationEffects !== "none") {
    // @ts-expect-error no dnd5e-types
    if (origin?.getDependents()?.length === 0) {
      await origin.delete();
    }
  }
};

export let actorAbilityRollPatching = () => {

  log("Patching roll abilities Save/Test/Skill/Tool")
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSavingThrow", rollSavingThrow, "MIXED");
  // libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollAbilitySave", rollAbilitySave, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollAbilityCheck", rollAbilityCheck, "MIXED");
  //libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollAbilityTest", rollAbilityTest, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollDeathSave", rollDeathSave, "WRAPPER");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollSkill", doRollSkill, "MIXED");
  libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.rollToolCheck", rollToolCheck, "WRAPPER");
}

async function rollAbilitySave(wrapped, config: any = {}, dialog = {}, message: any = {}) {
  message.midiOptions ??= {};
  message.midiOptions.oldFormat = true;
  return wrapped(config, dialog, message);
}
async function rollAbilityTest(wrapped, config: any = {}, dialog = {}, message: any = {}) {
  message.midiOptions ??= {};
  message.midiOptions.oldFormat = true;
  return wrapped(config, dialog, message);
}

export async function rollToolCheck(wrapped, config: any = {}, dialog: any = {}, message: any = {}) {
  let result;
  let preRollHookId
  try {
    const chatMessage = message.create;
    let baseConfig, baseDialog, baseMessage;
    message.create = false;
    if (autoFastForwardAbilityRolls) dialog.configure = false;
    preRollHookId = Hooks.once("dnd5e.preRollToolV2", (configData, dialogData, messageData) => {
      baseConfig = configData;
      baseDialog = dialogData;
      baseMessage = messageData;
    });
    result = await wrapped(config, dialog, message);
    let rollMode = result.options?.rollMode ?? safeGetGameSetting("core", "rollMode");
    await displayDSNForRoll(result, "toolCheck", rollMode);
    result[0] = await bonusCheck(this, result[0], "check", config.ability ?? "");
    if (!result) return result;
    if (chatMessage !== false && result) {
      const messageData: any = { rolls: result, ...baseMessage.data };
      //@ts-expect-error
      CONFIG.Dice.D20Roll._prepareMessageData(result, messageData);
      messageData.template = "modules/midi-qol/templates/roll.html";
      await result[0].toMessage(messageData, { rollMode });
    }
  } catch (err) {
    const message = "midi-qol | error in rollToolCheck";
    TroubleShooter.recordError(err, message);
    throw err;
  } finally {
    if (preRollHookId) Hooks.off(`dnd5e.preRollToolV2`, preRollHookId);
    return result;
  }
}

// This is done as a wrapper so that there is no race condition when hp reaches 0 also trying to remove condition
// This version will always fire first, remove concentration if needed and complete before the hp update is processed.
async function _preCreateActiveEffect(wrapped, data, options, user): Promise<void> {
  try {
    if (!configSettings.concentrationIncapacitatedConditionCheck) return;
    const parent: any = this.parent;
    const checkConcentration = configSettings.removeConcentration || !safeGetGameSetting("dnd5e", "disableConcentration");
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
    console.error(message, err);
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
  //@ts-ignore
  const result = await new Roll(`${saveTotal}`).evaluate();
  foundry.utils.setProperty(result.terms[0].options, "advantage", advantage)
  foundry.utils.setProperty(result.terms[0].options, "disadvantage", disadvantage)
  return result;
}

export async function _preDeleteCombat(wrapped, ...args) {
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

export async function doItemUse(wrapped, config: any = {}, dialog: any = {}, message: any = {}) {
  if (this.pack) return;
  if (config.legacy !== false) return wrapped(config, dialog, message);
  const { legacy, chooseActivity, ...activityConfig } = config;
  const activities = this.system.activities?.filter(a => !this.getFlag("dnd5e", "riders.activity")?.includes(a.id) && !a.midiProperties?.automationOnly);
  const attackActivities = activities?.filter(a => a instanceof MidiAttackActivity && !a.midiProperties?.automationOnly);
  if (attackActivities?.length === 1) { // if there is a single attack activity and no other non-automation activities use it
    const attackActivity = attackActivities[0];
    const extraActivities = activities?.filter(a => a !== attackActivity && a !== attackActivity?.otherActivity);
    if (extraActivities?.length === 0) {
      return attackActivity.use(config, dialog, message);
    }
  }
  //@ts-expect-error
  const areKeysPressed = game.system?.utils.areKeysPressed;
  const skipPressed = areKeysPressed(config.event, "skipDialogAdvantage") || areKeysPressed(config.event, "skipDialogDisadvantage") || areKeysPressed(config.event, "skipDialogNormal");
  if (skipPressed) {
    const attackActivity = attackActivities[0];
    if (attackActivity) return attackActivity.use(config, dialog, message);
    else return activities?.[0]?.use(config, dialog, message);
  }
  if (activities?.length > 1 || chooseActivity) {
    const activity = await MidiActivityChoiceDialog.create(this);
    return activity?.use(config, dialog, message);
  }
  if (activities?.length === 1) {
    return activities[0].use(config, dialog, message);
  }
  if (this.actor) return this.displayCard(message);
}

// Commented this out as it doesn't seem to be in use currently
// class CustomizeDamageFormula {
//   static formula: string;
//   static async configureDialog(wrapped, ...args) {
//     // If the option is not enabled, return the original function - as an alternative register\unregister would be possible
//     const [rolls, { title, defaultRollMode, defaultCritical, template, allowCritical }, options] = args;
//     // Render the Dialog inner HTML
//     const allRolls = rolls.map((roll, index) => ({
//       value: `${roll.formula}${index === 0 ? " + @bonus" : ""}`,
//       type: GameSystemConfig.damageTypes[roll.options.type]?.label ?? null,
//       active: true,
//       label: "Formula",
//       roll,
//       id: foundry.utils.randomID()
//     }));
//     const item = rolls[0]?.data.item;
//     //@ts-expect-error
//     const DamageRoll = CONFIG.Dice.DamageRoll;
//     if (item) {
//       if (item.damage.versatile) {
//         let actorBonus;
//         if (rolls[0].data?.bonuses) {
//           const actorBonusData = foundry.utils.getProperty(rolls[0], `data.bonuses.${item.actionType}`) || {};
//           if (actorBonusData.damage && (parseInt(actorBonusData.damage) !== 0)) {
//             actorBonus = actorBonusData.damage;
//           }
//         }
//         const versatileFormula = item.damage.versatile + (actorBonus ? ` + ${actorBonus}` : "");
//         allRolls.push({
//           value: versatileFormula,
//           type: GameSystemConfig.damageTypes[rolls[0].options.type]?.label ?? null,
//           active: false,
//           label: "Versatile",
//           roll: new DamageRoll(versatileFormula, rolls[0].data, rolls[0].options),
//           id: foundry.utils.randomID()
//         })
//       }
//       if ((item.formula ?? "").length > 0) {
//         allRolls.push({
//           value: item.formula,
//           type: GameSystemConfig.damageTypes[rolls[0].options.type]?.label ?? null,
//           versatileDamage: item.damage.versatile,
//           active: false,
//           label: "Other",
//           roll: new DamageRoll(item.formula, rolls[0].data, rolls[0].options),
//           id: foundry.utils.randomID()
//         })
//       }
//     }
//     const content = await renderTemplate(
//       //@ts-ignore
//       "modules/midi-qol/templates/damage-roll-dialog.hbs",
//       {
//         formulas: allRolls,
//         defaultRollMode,
//         rollModes: CONFIG.Dice.rollModes,
//       }
//     );

//     // Create the Dialog window and await submission of the form
//     return new Promise((resolve) => {
//       new Dialog(
//         {
//           title,
//           rolls: allRolls,
//           content,
//           buttons: {
//             critical: {
//               //@ts-ignore
//               condition: allowCritical,
//               label: i18n("DND5E.CriticalHit") ?? "<Critical Hit>",
//               //@ts-ignore
//               callback: html => {
//                 let returnRolls = allRolls.filter(r => r.active).map(r => r.roll);
//                 returnRolls = returnRolls.map((r, i) => r._onDialogSubmit(html, true, i === 0));
//                 rolls.length = 0;
//                 rolls.push(...returnRolls);
//                 resolve(returnRolls);
//               }
//             },
//             normal: {
//               label: i18n(allowCritical ? "DND5E.Normal" : "DND5E.Roll") ?? "<Normal Roll>",
//               callback: html => {
//                 let returnRolls = allRolls.filter(r => r.active).map(r => r.roll);
//                 returnRolls = returnRolls.map((r, i) => r._onDialogSubmit(html, false, i === 0));
//                 rolls.length = 0;
//                 rolls.push(...returnRolls);
//                 resolve(returnRolls);
//               },
//             },
//           },
//           default: defaultCritical ? "critical" : "normal",
//           // Inject the formula customizer - this is the only line that differs from the original
//           render: (html) => {
//             try {
//               CustomizeDamageFormula.activateListeners(html, allRolls);
//             } catch (err) {
//               const message = `injectFormulaCustomizer`
//               error(message, err);
//               TroubleShooter.recordError(err, message);
//             }
//           },
//           close: () => resolve(null),
//         },
//         options
//       ).render(true);
//     });
//   }

//   static activateListeners(html, allRolls) {
//     html.find('input[name="formula.active"]').on("click", (e) => {
//       const id = e.currentTarget.dataset.id;
//       const theRoll = allRolls.find(r => r.id === id)
//       theRoll.active = e.currentTarget.checked;
//     })
//   }
// }

export function processTraits(actor) {
  try {
    if (!actor.system.traits) return;
    for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
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
export function migrateTraits(actor) {
  try {
    if (!actor.system.traits) return;
    const baseData = actor.toObject(true);
    for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
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
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.healing);
              trait.value.delete("healing");
              log(`${actor.name} mapping "healing" to ${trait.custom}`)
              break
            case "temphp":
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.temphp);
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
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.healing);
              trait.value = removeTraitValue(trait.value, "healing");
              log(`${actor.name} mapping "healing" to ${trait.custom}`)
              break
            case "temphp":
              trait.custom = addCustomTrait(trait.custom, GameSystemConfig.healingTypes.temphp);
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

function removeTraitValue(traitValue: string[] | Set<string>, toRemove): string[] | Set<string> {
  if (traitValue instanceof Set)
    traitValue.delete(toRemove);
  else {
    const position = traitValue.indexOf(toRemove);
    if (position !== -1) return traitValue.splice(position, 1);
  }
  return traitValue;
}

function addPhysicalDamages(traitValue) {
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

function actorGetRollData(wrapped, ...args) {
  const data = wrapped(...args);
  data.actorType = this.type;
  data.name = this.name;
  data.flags ??= {};
  data.flags["midi-qol"] = this.flags?.["midi-qol"] ?? {};
  data.midiFlags = data.flags["midi-qol"];
  data.items = this.items;
  if (game.system?.id === "dnd5e") {
    data.cfg = {};
    data.cfg.armorClasses = GameSystemConfig.armorClasses;
    data.cfg.actorSizes = GameSystemConfig.actorSizes;
    data.cfg.skills = GameSystemConfig.skills;
  }
  return data;
}

function itemGetRollData(wrapped, ...args) {
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