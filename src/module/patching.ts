import { log, warn, debug, i18n, error, getCanvas, i18nFormat } from "../midi-qol.js";
import { doAttackRoll, doDamageRoll, templateTokens, doItemUse, preItemUseHook, preDisplayCardHook, preItemUsageConsumptionHook, useItemHook, displayCardHook, wrappedDisplayCard } from "./itemhandling.js";
import { configSettings, autoFastForwardAbilityRolls, criticalDamage, checkRule } from "./settings.js";
import { bonusDialog, checkIncapacitated, ConvenientEffectsHasEffect, createConditionData, evalCondition, expireRollEffect, getAutoRollAttack, getAutoRollDamage, getConvenientEffectsBonusAction, getConvenientEffectsDead, getConvenientEffectsReaction, getConvenientEffectsUnconscious, getOptionalCountRemainingShortFlag, getSpeaker, getSystemCONFIG, hasUsedBonusAction, hasUsedReaction, isAutoFastAttack, isAutoFastDamage, mergeKeyboardOptions, midiRenderRoll, MQfromActorUuid, MQfromUuid, notificationNotify, processOverTime, removeBonusActionUsed, removeReactionUsed } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { OnUseMacro, OnUseMacros } from "./apps/Item.js";
import { mapSpeedKeys } from "./MidiKeyManager.js";
import { socketlibSocket } from "./GMAction.js";
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
  if (!game.user.isGM && this.actor?.testUserPermission(game.user, "OWNER")) {
    return true;
  }
  return isVisible;
}

export interface Options {
  event: any,
  advantage: boolean | undefined,
  disadvantage: boolean | undefined,
  fastForward: boolean | undefined,
  fastForwardSet: boolean | undefined,
  parts: [] | undefined,
  chatMessage: boolean | undefined,
  rollToggle: boolean | undefined,
  other: boolean | undefined,
  versatile: boolean | undefined,
  critical: boolean | undefined,
  autoRollAttack: boolean | undefined,
  autoRollDamage: boolean | undefined,
  fastForwardAttack: boolean | undefined,
  fastForwardDamage: boolean | undefined,
  fastForwardAbility: boolean | undefined
};
export const defaultRollOptions: Options = {
  event: undefined,
  advantage: false,
  disadvantage: false,
  fastForward: false,
  fastForwardSet: false,
  parts: undefined,
  chatMessage: undefined,
  rollToggle: undefined,
  other: undefined,
  versatile: false,
  critical: false,
  autoRollAttack: false,
  autoRollDamage: false,
  fastForwardAttack: false,
  fastForwardDamage: false,
  fastForwardAbility: false
};

export function collectBonusFlags(actor, category, detail): any[] {
  if (!installedModules.get("betterrolls5e")) {
    let useDetail = false;
    const bonusFlags = Object.keys(actor.flags["midi-qol"]?.optional ?? [])
      .filter(flag => {
        const checkFlag = actor.flags["midi-qol"].optional[flag][category];
        if (checkFlag === undefined) return false;
        if (!(typeof checkFlag === "string" || checkFlag[detail] || (detail !== "fail" && checkFlag["all"]) !== undefined)) return false;
        if (actor.flags["midi-qol"].optional[flag].count === undefined) return true;
        return getOptionalCountRemainingShortFlag(actor, flag) > 0;
      })
      .map(flag => {
        const checkFlag = actor.flags["midi-qol"].optional[flag][category];
        if (typeof checkFlag === "string") return `flags.midi-qol.optional.${flag}`;
        else return `flags.midi-qol.optional.${flag}`;
      });
    return bonusFlags;
  }
  return [];
}

export async function bonusCheck(actor, result: Roll, category, detail): Promise<Roll> {
  if (!installedModules.get("betterrolls5e")) {
    let bonusFlags = collectBonusFlags(actor, category, detail);
    /* causes strange behaviour when enabled 
    if (category === "skill") {
      const abl = actor.system.skills[detail].ability;
      bonusFlags = bonusFlags.concat(collectBonusFlags(actor, "check", "abl"));
    }
    */

    if (bonusFlags.length > 0) {
      const data = {
        actor,
        roll: result,
        rollHTML: await midiRenderRoll(result),
        rollTotal: result.total,
        category,
        detail: detail
      }
      let title;
      let config = getSystemCONFIG();
      let systemString = game.system.id.toUpperCase();
      switch (category) {
        case "check": title = i18nFormat(`${systemString}.AbilityPromptTitle`, { ability: config.abilities[detail] ?? "" });
          break;
        case "save": title = i18nFormat(`${systemString}.SavePromptTitle`, { ability: config.abilities[detail] ?? "" });
          break;
        case "skill": title = i18nFormat(`${systemString}.SkillPromptTitle`, { skill: config.skills[detail] ?? "" });
          break;
      }
      await bonusDialog.bind(data)(
        bonusFlags,
        detail ? `${category}.${detail}` : category,
        true,
        `${actor.name} - ${title}`,
        "roll", "rollTotal", "rollHTML"
      );
      result = data.roll;
    }
  }
  return result;
}

async function doRollSkill(wrapped, ...args) {
  let [skillId, options = { event: {}, parts: [], advantage: false, disadvantage: false, simulate: false, targetValue: undefined }] = args;
  const chatMessage = options.chatMessage;
  const rollTarget = options.targetValue;
  // options = foundry.utils.mergeObject(options, mapSpeedKeys(null, "ability"), { inplace: false, overwrite: true });
  mergeKeyboardOptions(options, mapSpeedKeys(undefined, "ability"));
  options.event = {};
  let procOptions = options;
  if (configSettings.skillAbilityCheckAdvantage) {
    procOptions = procAbilityAdvantage(this, "check", this.system.skills[skillId].ability, options)

    // options = procAbilityAdvantage(actor, "check", actor.system.skills[skillId].ability, options)
  }
  // let procOptions: Options = procAbilityAdvantage(this, "check", this.system.skills[skillId].ability, options)
  procOptions = procAdvantageSkill(this, skillId, procOptions);
  if (procOptions.advantage && procOptions.disadvantage) {
    procOptions.advantage = false;
    procOptions.disadvantage = false;
  }
  if (procAutoFailSkill(this, skillId)
    || (configSettings.skillAbilityCheckAdvantage && procAutoFail(this, "check", this.system.skills[skillId].ability))) {
    options.parts = ["-100"];
  }

  let result;
  if (installedModules.get("betterrolls5e")) {
    let event = {};
    if (procOptions.advantage) { options.advantage = true; event = { shiftKey: true } };
    if (procOptions.disadvantage) { options.disadvantage = true; event = { ctrlKey: true } };
    options.event = event;
    result = wrapped(skillId, options);
    if (chatMessage !== false) return result;
    result = await result;
  } else {
    procOptions.chatMessage = false;
    if (!procOptions.parts || procOptions.parts.length === 0) delete procOptions.parts;
    // result = await wrapped.call(this, skillId, procOptions);
    result = await wrapped(skillId, procOptions);
  }
  if (!result) return result;

  const flavor = result.options?.flavor;
  const maxflags = getProperty(this.flags, "midi-qol.max") ?? {};
  const maxValue = (maxflags.skill && (maxflags.skill.all || maxflags.check[skillId])) ?? false;
  if (maxValue && Number.isNumeric(maxValue)) {
    result.terms[0].modifiers.unshift(`max${maxValue}`);
    //@ts-ignore
    result = await new Roll(Roll.getFormula(result.terms)).evaluate({ async: true });
  }
  const minflags = getProperty(this.flags, "midi-qol.min") ?? {};
  const minValue = (minflags.skill && (minflags.skill.all || minflags.skill[skillId])) ?? false
  if (minValue && Number.isNumeric(minValue)) {
    result.terms[0].modifiers.unshift(`min${minValue}`);
    //@ts-ignore
    result = await new Roll(Roll.getFormula(result.terms)).evaluate({ async: true });
  }
  if (!options.simulate) {
    result = await bonusCheck(this, result, "skill", skillId);
  }
  if (chatMessage !== false && result) {
    const args = { "speaker": getSpeaker(this), flavor };
    setProperty(args, `flags.${game.system.id}.roll`, { type: "skill", skillId });
    if (game.system.id === "sw5e") setProperty(args, "flags.sw5e.roll", { type: "skill", skillId })
    await result.toMessage(args);
  }
  let success: boolean | undefined = undefined;
  if (rollTarget !== undefined) success = result.total >= rollTarget;
  await expireRollEffect.bind(this)("Skill", skillId, success);
  return result;
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
  Die.MODIFIERS["mx"] = "multiply";
  setProperty(Die.prototype, "multiply", multiply);
}

function configureDamage(wrapped) {
  if (!this.isCritical || criticalDamage === "default") {
    while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
      this.terms.pop();
    return wrapped();
  }
  // if (this.options.configured) return; seems this is not required.
  let bonusTerms: RollTerm[] = [];
  /* criticalDamage is one of 
    "default": "DND5e Settings Only",
    "maxDamage": "Max Normal Damage",
    "maxCrit": "Max Critical Dice",
    "maxAll": "Max All Dice",
    "doubleDice": "Double Rolled Damage",
    "explode": "Explode critical dice",
    "baseDamage": "No Bonus"
  */
  // if (criticalDamage === "doubleDice") this.options.multiplyNumeric = true;

  for (let [i, term] of this.terms.entries()) {
    let cm = this.options.criticalMultiplier ?? 2;
    let cb = (this.options.criticalBonusDice && (i === 0)) ? this.options.criticalBonusDice : 0;
    switch (criticalDamage) {
      case "maxDamage":
        if (term instanceof DiceTerm) term.modifiers.push(`min${term.faces}`);
        break;
      case "maxCrit":  // Powerful critical
      case "maxCritRoll":
        if (term instanceof DiceTerm) {
          let critTerm;
          bonusTerms.push(new OperatorTerm({ operator: "+" }));
          if (criticalDamage === "maxCrit")
            critTerm = new NumericTerm({ number: (term.number + cb) * term.faces });
          else {
            critTerm = new Die({ number: term.number + cb, faces: term.faces });
            critTerm.modifiers = duplicate(term.modifiers);
            critTerm.modifiers.push(`min${term.faces}`);
          }
          critTerm.options = term.options;
          bonusTerms.push(critTerm);
        } else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
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
      case "doubleDice":
        if (term instanceof DiceTerm) {
          //term.alter(cm, cb);
          term.modifiers.push("mx2");
        } else if (term instanceof NumericTerm && this.options.multiplyNumeric) {
          term.number *= cm;
        }
        break;
      case "explode":
        if (term instanceof DiceTerm) {
          bonusTerms.push(new OperatorTerm({ operator: "+" }));
          //@ts-ignore
          const newTerm = new Die({ number: term.number + cb, faces: term.faces })
          newTerm.modifiers.push(`x${term.faces}`);
          newTerm.options = term.options;
          // setProperty(newTerm.options, "sourceTerm", term);
          bonusTerms.push(newTerm);
        }
        break;
      case "baseDamage":
      default:
        break;
    }
  }
  if (bonusTerms.length > 0) this.terms.push(...bonusTerms);
  if (this.options.criticalBonusDamage) {
    const extra = new Roll(this.options.criticalBonusDamage, this.data);
    for (let term of extra.terms) {
      if (term instanceof DiceTerm || term instanceof NumericTerm)
        if (!term.options?.flavor) term.options = this.terms[0].options;
    }
    if (!(extra.terms[0] instanceof OperatorTerm)) this.terms.push(new OperatorTerm({ operator: "+" }));
    this.terms.push(...extra.terms);
  }
  while (this.terms.length > 0 && this.terms[this.terms.length - 1] instanceof OperatorTerm)
    this.terms.pop();
  this._formula = this.constructor.getFormula(this.terms);
  this.options.configured = true;
}
async function doAbilityRoll(wrapped, rollType: string, ...args) {
  let [abilityId, options = { event: {}, parts: [], chatMessage: undefined, simulate: false, targetValue: undefined, isMagicalSave: false }] = args;
  const rollTarget = options.targetValue;
  if (procAutoFail(this, rollType, abilityId)) {
    options.parts = ["-100"];
  }
    // Hack for MTB bug
  if (options.event?.advantage || options.event?.altKey) options.advantage = true;
  if (options.event?.disadvantage || options.event?.ctrlKey) options.disadvantage = true;
  if (options.fromMars5eChatCard) options.fastForward = autoFastForwardAbilityRolls;

  const chatMessage = options.chatMessage;
  const keyOptions = mapSpeedKeys(undefined, "ability");
  if (options.mapKeys !== false) {
    if (keyOptions?.advantage === true) options.advantage = options.advantage || keyOptions.advantage;
    if (keyOptions?.disadvantage === true) options.disadvantage = options.disadvantage || keyOptions.disadvantage;
    if (keyOptions?.fastForwardAbility === true) options.fastForward = options.fastForward || keyOptions.fastForwardAbility;
    if (keyOptions?.advantage || keyOptions?.disadvantage) options.fastForward = true;
  }

  options.event = {};

  let procOptions: any = procAbilityAdvantage(this, rollType, abilityId, options);
  if (procOptions.advantage && procOptions.disadvantage) {
    procOptions.advantage = false;
    procOptions.disadvantage = false;
  }

  let result;
  if (!options.parts || procOptions.parts.length === 0) delete options.parts;
  procOptions.chatMessage = false;
  result = await wrapped(abilityId, procOptions);
  if (!result) return result;

  const maxFlags = getProperty(this.flags, "midi-qol.max.ability") ?? {};
  const flavor = result.options?.flavor;
  const maxValue = (maxFlags[rollType] && (maxFlags[rollType].all || maxFlags[rollType][abilityId])) ?? false
  if (maxValue && Number.isNumeric(maxValue)) {
    result.terms[0].modifiers.unshift(`max${maxValue}`);
    //@ts-ignore
    result = await new Roll(Roll.getFormula(result.terms)).evaluate({ async: true });
  }

  const minFlags = getProperty(this.flags, "midi-qol.min.ability") ?? {};
  const minValue = (minFlags[rollType] && (minFlags[rollType].all || minFlags[rollType][abilityId])) ?? false;
  if (minValue && Number.isNumeric(minValue)) {
    result.terms[0].modifiers.unshift(`min${minValue}`);
    //@ts-ignore
    result = await new Roll(Roll.getFormula(result.terms)).evaluate({ async: true });
  }

  if (!options.simulate) result = await bonusCheck(this, result, rollType, abilityId);

  if (chatMessage !== false && result) {
    const args: any = { "speaker": getSpeaker(this), flavor };
    setProperty(args, `flags.${game.system.id}.roll`, { type: rollType, abilityId });
    args.template = "modules/midi-qol/templates/roll.html";
    await result.toMessage(args);
  }
  let success: boolean | undefined = undefined;
  if (rollTarget !== undefined) success = result.total >= rollTarget;
  await expireRollEffect.bind(this)(rollType, abilityId, success);
  return result;
}

export async function rollAbilitySave(wrapped, ...args) {
  return doAbilityRoll.bind(this)(wrapped, "save", ...args);
}
async function rollAbilityTest(wrapped, ...args) {
  return doAbilityRoll.bind(this)(wrapped, "check", ...args);
}

export function preRollAbilitySaveHook(item: Item, rollData: any, abilityId: string) {
  return doPreRollAbilityHook.bind("save", item, rollData, abilityId);
}

export function rollAbilitySaveHook(item, roll, abilityId) {
  return doRollAbilityHook("save", item, roll, abilityId)
}

export function preRollAbilityTestHook(item: Item, rollData: any, abilityId: string) {
  return doPreRollAbilityHook.bind(this)("check", item, rollData, abilityId);
}

export function rollAbilityTestHook(item, roll, abilityId) {
  return doRollAbilityHook("check", item, roll, abilityId)
}

export function preRollDeathSaveHook(actor, rollData: any): boolean {
  mergeKeyboardOptions(rollData ?? {}, mapSpeedKeys(undefined, "ability"));
  const advFlags = getProperty(actor.flags, "midi-qol")?.advantage;
  const disFlags = getProperty(actor.flags, "midi-qol")?.disadvantage;
  let withAdvantage = false;
  let withDisadvantage = false;
  rollData.fastForward = autoFastForwardAbilityRolls ? !rollData.event?.fastKey : rollData.event?.fastKey;
  if (advFlags || disFlags) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor });
    if ((advFlags?.all && evalCondition(advFlags.all, conditionData))
      || (advFlags?.deathSave && evalCondition(advFlags.deathSave, conditionData))) {
      withAdvantage = true;
    }

    if ((disFlags?.all && evalCondition(disFlags.all, conditionData))
      || (disFlags?.deathSave && evalCondition(disFlags.deathSave, conditionData))) {
      withDisadvantage = true;
    }
  }
  rollData.advantage = withAdvantage && !withDisadvantage;
  rollData.disadvantage = withDisadvantage && !withAdvantage;

  if (rollData.advantage && rollData.disadvantage) {
    rollData.advantage = rollData.disadvantage = false;
  }
  return true;
}

async function doPreRollAbilityHook(rollType: string, item, rollData: any, abilityId: string) {
  const rollTarget = rollData.targetValue;
  if (procAutoFail(this, rollType, abilityId)) {
    rollData.parts = ["-100"];
  }
  const chatMessage = rollData.chatMessage;
  const keyOptions = mapSpeedKeys(undefined, "ability");
  if (rollData.mapKeys !== false) {
    if (keyOptions?.advantage === true) rollData.advantage = rollData.advantage || keyOptions.advantage;
    if (keyOptions?.disadvantage === true) rollData.disadvantage = rollData.disadvantage || keyOptions.disadvantage;
    if (keyOptions?.fastForwardAbility === true) rollData.fastForward = rollData.fastForward || keyOptions.fastForwardAbility;
  }

  // Hack for MTB bug
  if (rollData.event?.advantage) rollData.advantage = rollData.event.advantage || rollData.advantage;
  if (rollData.event?.disadvantage) rollData.disadvantage = rollData.event.disadvantage || rollData.disadvantage;

  rollData.event = {};

  let procOptions: any = procAbilityAdvantage(this, rollType, abilityId, rollData);
  if (procOptions.advantage && procOptions.disadvantage) {
    procOptions.advantage = false;
    procOptions.disadvantage = false;
  }

  let result;
  if (!rollData.parts || procOptions.parts.length === 0) delete rollData.parts;
  rollData = mergeObject(rollData, procOptions);
  if (chatMessage !== false && result) {
    rollData.template = "modules/midi-qol/templates/roll.html";
  }
  return true;
}

function doRollAbilityHook(rollType, item, roll: any /* D20Roll */, abilityId: string) {
  const maxFlags = getProperty(item.flags, "midi-qol.max.ability") ?? {};
  let result = roll;
  const flavor = result.options?.flavor;
  const maxValue = (maxFlags[rollType] && (maxFlags[rollType].all || maxFlags[rollType][abilityId])) ?? false
  if (maxValue && Number.isNumeric(maxValue)) {
    result.terms[0].modifiers.unshift(`max${maxValue}`);
    //@ts-ignore
    result = new Roll(Roll.getFormula(result.terms)).evaluate({ async: false });
  }

  const minFlags = getProperty(item.flags, "midi-qol.min.ability") ?? {};
  const minValue = (minFlags[rollType] && (minFlags[rollType].all || minFlags[rollType][abilityId])) ?? false;
  if (minValue && Number.isNumeric(minValue)) {
    result.terms[0].modifiers.unshift(`min${minValue}`);
    result = new Roll(Roll.getFormula(result.terms)).evaluate({ async: false });
  }

  if (!roll.options.simulate) result = /* await  show stopper for this */ bonusCheck(this, result, rollType, abilityId)

  let success: boolean | undefined = undefined;
  const rollTarget = roll.options.targetValue;
  if (rollTarget !== undefined) success = result.total >= rollTarget;
    /* await - maybe ok */ expireRollEffect.bind(this)(rollType, abilityId, success);

  return result;
}


export function procAutoFail(actor, rollType: string, abilityId: string): boolean {
  const midiFlags = actor.flags["midi-qol"] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.ability || fail.all) {
    const rollFlags = (fail.ability && fail.ability[rollType]) ?? {};
    const autoFail = fail.all || fail.ability.all || rollFlags.all || rollFlags[abilityId];
    return autoFail;
  }
  return false;
}

export function procAutoFailSkill(actor, skillId): boolean {
  const midiFlags = actor.flags["midi-qol"] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.skill || fail.all) {
    const rollFlags = (fail.skill && fail.skill[skillId]) || false;
    const autoFail = fail.all || fail.skill.all || rollFlags;
    return autoFail;
  }
  return false;
}

export function procAbilityAdvantage(actor, rollType, abilityId, options: Options | any): Options {
  const midiFlags = actor.flags["midi-qol"] ?? {};
  const advantage = midiFlags.advantage;
  const disadvantage = midiFlags.disadvantage;
  var withAdvantage = options.advantage;
  var withDisadvantage = options.disadvantage;

  //options.fastForward = options.fastForward || (autoFastForwardAbilityRolls ? !options.event?.fastKey : options.event?.fastKey);
  if (rollType === "save" && options.isMagicSave) {
    if ((actor?.system.traits?.dr?.custom || "").includes(i18n("midi-qol.MagicResistant").trim()))
      withAdvantage = true;;

    const magicResistanceFlags = getProperty(actor, "flags.midi-qol.magicResistance");
    if (magicResistanceFlags && (magicResistanceFlags?.all || getProperty(magicResistanceFlags, abilityId))) {
      withAdvantage = true;
    }
    const magicVulnerabilityFlags = getProperty(actor, "flags.midi-qol.magicVulnerability");
    if (magicVulnerabilityFlags && (magicVulnerabilityFlags?.all || getProperty(magicVulnerabilityFlags, abilityId))) {
      withDisadvantage = true;
    }
  }

  options.fastForward = options.fastForward || options.event?.fastKey;
  if (advantage || disadvantage) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
    if (advantage) {
      if (advantage.all && evalCondition(advantage.all, conditionData)) {
        withAdvantage = true;
      }
      if (advantage.ability) {
        if (advantage.ability.all && evalCondition(advantage.ability.all, conditionData)) {
          withAdvantage = true;
        }
        if (advantage.ability[rollType]) {
          if ((advantage.ability[rollType].all && evalCondition(advantage.ability[rollType].all, conditionData))
            || (advantage.ability[rollType][abilityId] && evalCondition(advantage.ability[rollType][abilityId], conditionData))) {
            withAdvantage = true;
          }
        }
      }
    }

    if (disadvantage) {
      if (disadvantage.all && evalCondition(disadvantage.all, conditionData)) {
        withDisadvantage = true;
      }
      if (disadvantage.ability) {
        if (disadvantage.ability.all && evalCondition(disadvantage.ability.all, conditionData)) {
          withDisadvantage = true;
        }
        if (disadvantage.ability[rollType]) {
          if ((disadvantage.ability[rollType].all && evalCondition(disadvantage.ability[rollType].all, conditionData))
            || (disadvantage.ability[rollType][abilityId] && evalCondition(disadvantage.ability[rollType][abilityId], conditionData))) {
            withDisadvantage = true;
          }
        }
      }
    }
  }
  options.advantage = withAdvantage ?? false;
  options.disadvantage = withDisadvantage ?? false;
  options.event = {};
  return options;
}

export function procAdvantageSkill(actor, skillId, options: Options): Options {
  const midiFlags = actor.flags["midi-qol"];
  const advantage = midiFlags?.advantage;
  const disadvantage = midiFlags?.disadvantage;
  var withAdvantage = options.advantage;
  var withDisadvantage = options.disadvantage;
  if (advantage || disadvantage) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
    if (advantage?.all && evalCondition(advantage.all, conditionData)) {
      withAdvantage = true;
    }
    if (advantage?.skill) {
      if ((advantage.skill.all && evalCondition(advantage.skill.all, conditionData))
        || (advantage.skill[skillId] && evalCondition(advantage.skill[skillId], conditionData))) {
        withAdvantage = true;
      }
    }
    if (disadvantage?.all && evalCondition(disadvantage.all, conditionData)) {
      withDisadvantage = true;
    }
    if (disadvantage?.skill) {
      if ((disadvantage.skill.all && evalCondition(disadvantage.skill.all, conditionData))
        || (disadvantage.skill[skillId] && evalCondition(disadvantage.skill[skillId], conditionData))) {
        withDisadvantage = true;
      }
    }
  }
  options.advantage = withAdvantage;
  options.disadvantage = withDisadvantage;
  return options;
}


let debouncedATRefresh = debounce(_midiATIRefresh, 30);
function _midiATIRefresh(template) {
  if (!canvas?.tokens) return;
  if (configSettings.autoTarget === "none") return;
  if (configSettings.autoTarget === "dftemplates" && installedModules.get("df-templates"))
    return; // df-templates will handle template targeting.
  if (configSettings.autoTarget === "dfwalledTemplates" && installedModules.get("walledtemplates"))
    return; // walled templates will handle template targeting.

  if (installedModules.get("levelsvolumetrictemplates")) {
    setProperty(template, "flags.levels.elevation",
      installedModules.get("levels").nextTemplateHeight ?? installedModules.get("levels").lastTokenForTemplate?.elevation);
    // Filter which tokens to pass - not too far wall blocking is left to levels.
    let distance = template.distance;
    const dimensions = canvas?.dimensions || { size: 1, distance: 1 };
    distance *= dimensions.size / dimensions.distance;
    const tokensToCheck = canvas?.tokens?.placeables?.filter(tk => {
      const r: Ray = new Ray(
        { x: template.x, y: template.y },
        //@ts-ignore .width .height TODO check this v10
        { x: tk.x + tk.document.width * dimensions.size, y: tk.y + tk.document.height * dimensions.size }
      );
      //@ts-ignore .width .height TODO check this v10
      const maxExtension = (1 + Math.max(tk.document.width, tk.document.height)) * dimensions.size;
      const centerDist = r.distance;
      if (centerDist > distance + maxExtension) return false;
      //@ts-ignore
      if (["alwaysIgnoreDefeated", "wallsBlockIgnoreDefeated"].includes(configSettings.autoTarget) && checkIncapacitated(tk.actor, undefined, undefined));
      return false;
      return true;
    })

    if (tokensToCheck.length > 0) {
      //@ts-ignore compute3Dtemplate(t, tokensToCheck = canvas.tokens.placeables)
      VolumetricTemplates.compute3Dtemplate(template, tokensToCheck);
    }
  } else {
    const distance: number = template.distance ?? 0;
    templateTokens({ x: template.x, y: template.y, shape: template.shape, distance });
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
    if (checkRule("challengeModeArmor")) {
      const armorDetails = this.system.attributes.ac ?? {};
      const ac = armorDetails?.value ?? 10;
      const equippedArmor = armorDetails.equippedArmor;
      let armorAC = equippedArmor?.system.armor.value ?? 10;
      const equippedShield = armorDetails.equippedShield;
      const shieldAC = equippedShield?.system.armor.value ?? 0;

      if (checkRule("challengeModeArmorScale")) {
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
        let dexMod = this.system.abilities.dex.mod;
        if (equippedArmor?.system.armor.type === "heavy") dexMod = 0;
        if (equippedArmor?.system.armor.type === "medium") dexMod = Math.min(dexMod, 2)
        this.system.attributes.ac.EC = 10 + dexMod + shieldAC;
        this.system.attributes.ac.AR = ac - 10 - dexMod;
      }
    }
  } catch (err) {
    console.warn("midi-qol failed to prepare derived data", err)
  }
}

export function initPatching() {
  libWrapper = globalThis.libWrapper;
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.prepareDerivedData", _prepareDerivedData, "WRAPPER");
  // For new onuse macros stuff.
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.prepareData", itemPrepareData, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.prepareData", actorPrepareData, "WRAPPER");
  libWrapper.register("midi-qol", "KeyboardManager.prototype._onFocusIn", _onFocusIn, "OVERRIDE");
}

export function _onFocusIn(event) {
  const formElements = [
    HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLOptionElement, /*HTMLButtonElement*/
  ];
  if (event.target.isContentEditable || formElements.some(cls => event.target instanceof cls)) this.releaseKeys();
}

export function actorPrepareData(wrapped) {
  try {
    setProperty(this, "flags.midi-qol.onUseMacroName", getProperty(this._source, "flags.midi-qol.onUseMacroName"));
    wrapped();
    prepareOnUseMacroData(this);
  } catch (err) {
  }
}

export function itemPrepareData(wrapped) {
  setProperty(this, "flags.midi-qol.onUseMacroName", getProperty(this._source, "flags.midi-qol.onUseMacroName"));
  wrapped();
  prepareOnUseMacroData(this);
}

export function prepareOnUseMacroData(actorOrItem) {
  try {
    const macros = getProperty(actorOrItem, 'flags.midi-qol.onUseMacroName');
    setProperty(actorOrItem, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macros ?? null));
  } catch (err) {
    console.warn("midi-qol | failed to prepare onUse macro data", err)
  }
}

export function preUpdateItemActorOnUseMacro(itemOrActor, changes, options, user) {
  try {
    const macros = getProperty(itemOrActor._source, "flags.midi-qol.onUseMacroName");
    const macroParts = new OnUseMacros(macros ?? null);
    const macroChanges = getProperty(changes, "flags.midi-qol.onUseMacroParts") ?? {};
    //@ts-ignore
    if (isEmpty(macroChanges)) return true;

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
    changes.flags["midi-qol"].onUseMacroName = macroString;
    delete changes.flags["midi-qol"].onUseMacroParts;
    itemOrActor.updateSource({ "flags.midi-qol.-=onUseMacroParts": null });
  } catch (err) {
    delete changes.flags["midi-qol"].onUseMacroParts;
    itemOrActor.updateSource({ "flags.midi-qol.-=onUseMacroParts": null });
    console.warn("midi-qol | failed in preUpdateItemActor onUse Macro", err)
  }
  return true;
};

export function getInitiativeRoll(wrapped, options: { advantageMode: number } = { advantageMode: 0 }) {
  let disadv = this.getFlag(game.system.id, "initiativeDisadv");
  let adv = this.getFlag(game.system.id, "initiativeAdv");
  const flags = this.flags["midi-qol"] ?? {};
  const advFlags = flags.advantage;
  const disadvFlags = flags.disadvantage;
  if (advFlags || disadvFlags) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
    if ((advFlags?.all && evalCondition(advFlags.all, conditionData))
      || (advFlags?.ability?.check?.all && evalCondition(advFlags.ability.check.all, conditionData))
      || (advFlags?.advantage?.ability?.check?.dex && evalCondition(advFlags.advantage.ability?.check?.dex, conditionData))) {
      //@ts-expect-error
      adv = true || (options.advantageMode === game.dnd5e.dice.D20Roll.ADV_MODE.ADVANTAGE);
    }
    if ((disadvFlags?.all && evalCondition(disadvFlags.all, conditionData))
      || (disadvFlags?.ability?.check?.all && evalCondition(disadvFlags.ability.check.all, conditionData))
      || (disadvFlags?.disadvantage?.ability?.check?.dex && evalCondition(disadvFlags.disadvantage.ability?.check?.dex, conditionData))) {
      //@ts-expect-error
      disadv = true || (options.advantageMode === game.dnd5e.dice.D20Roll.ADV_MODE.DISADVANTAGE);
    }
  }
  if (adv && disadv) options.advantageMode = 0;
  //@ts-expect-error
  else if (adv) options.advantageMode = game.dnd5e.dice.D20Roll.ADV_MODE.ADVANTAGE;
  //@ts-expect-error
  else if (disadv) options.advantageMode = game.dnd5e.dice.D20Roll.ADV_MODE.DISADVANTAGE;
  return wrapped(options);
}

export function _getInitiativeFormula(wrapped) {
  const original = wrapped();
  const actor = this.actor;
  if (!actor) return "1d20";
  let disadv = actor.getFlag(game.system.id, "initiativeDisadv");
  let adv = actor.getFlag(game.system.id, "initiativeAdv");
  const flags = actor.flags["midi-qol"] ?? {};
  const advFlags = flags.advantage;
  const disadvFlags = flags.disadvantage;
  if (advFlags || disadvFlags) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: actor });
    if ((advFlags?.all && evalCondition(advFlags.all, conditionData))
      || (advFlags?.ability?.check?.all && evalCondition(advFlags.ability.check.all, conditionData))
      || (advFlags?.advantage?.ability?.check?.dex && evalCondition(advFlags.advantage.ability?.check?.dex, conditionData))) {
      adv = true;
    }
    if ((disadvFlags?.all && evalCondition(disadvFlags.all, conditionData))
      || (disadvFlags?.ability?.check?.all && evalCondition(disadvFlags.ability.check.all, conditionData))
      || (disadvFlags?.disadvantage?.ability?.check?.dex && evalCondition(disadvFlags.disadvantage.ability?.check?.dex, conditionData))) {
      disadv = true;
    }
  }
  if (!disadv && !adv) return original;
  if (!actor) return "1d20";
  const actorData = actor.system;
  const init = actorData.attributes.init;
  const rollData = actor.getRollData();

  // Construct initiative formula parts
  let nd = 1;
  let mods = "";
  if ((game.system.id === "dnd5e" || game.system.id === "n5e") && actor.getFlag("dnd5e", "halflingLucky")) mods += "r1=1";
  if (adv && !disadv) {
    nd = 2;
    mods += "kh";
  } else if (!adv && disadv) {
    nd = 2;
    mods += "kl";
  }
  const parts = [
    `${nd}d20${mods}`,
    init.mod,
    (init.prof.term !== "0") ? init.prof.term : null,
    (init.bonus !== 0) ? init.bonus : null
  ];

  // Ability Check Bonuses
  const dexCheckBonus = actorData.abilities.dex.bonuses?.check;
  const globalCheckBonus = actorData.bonuses?.abilities?.check;
  if (dexCheckBonus) parts.push(Roll.replaceFormulaData(dexCheckBonus, rollData));
  if (globalCheckBonus) parts.push(Roll.replaceFormulaData(globalCheckBonus, rollData));

  // Optionally apply Dexterity tiebreaker
  const tiebreaker = game.settings.get(game.system.id, "initiativeDexTiebreaker");
  if (tiebreaker) parts.push(actor.system.abilities.dex.value / 100);
  return parts.filter(p => p !== null).join(" + ");
};

async function _preDeleteActiveEffect(wrapped, ...args) {
  try {
    if ((this.parent instanceof CONFIG.Actor.documentClass)) {
      let [options, user] = args;
      const effect = this;

      // Handle removal of reaction effect
      if (installedModules.get("dfreds-convenient-effects") && getConvenientEffectsReaction()?._id === this.flags?.core?.statusId) {
        await this.parent.unsetFlag("midi-qol", "reactionCombatRound");
      }

      // Handle removal of bonus action effect
      if (installedModules.get("dfreds-convenient-effects") && getConvenientEffectsBonusAction()?._id === this.flags?.core?.statusId) {
        await this.parent.unsetFlag("midi-qol", "bonusActionCombatRound");
      }

      const checkConcentration = globalThis.MidiQOL?.configSettings()?.concentrationAutomation;
      if (!checkConcentration) return;
      let concentrationLabel: any = i18n("midi-qol.Concentrating");
      if (installedModules.get("dfreds-convenient-effects")) {
        let concentrationId = "Convenient Effect: Concentrating";
        let statusEffect: any = CONFIG.statusEffects.find(se => se.id === concentrationId);
        if (statusEffect) concentrationLabel = statusEffect.label;
      } else if (installedModules.get("combat-utility-belt")) {
        concentrationLabel = game.settings.get("combat-utility-belt", "concentratorConditionName")
      }
      let isConcentration = effect.label === concentrationLabel;
      const origin = MQfromUuid(effect.origin);
      if (isConcentration) await removeConcentration(effect.parent, this.uuid);
      else if (origin instanceof CONFIG.Item.documentClass && origin.parent instanceof CONFIG.Actor.documentClass) {
        const concentrationData = getProperty(origin.parent, "flags.midi-qol.concentration-data");
        if (concentrationData && effect.origin === concentrationData.uuid) {
          const allConcentrationTargets = concentrationData.targets.filter(target => {
            let actor = MQfromActorUuid(target.actorUuid);
            const hasEffects = actor.effects.some(effect =>
              effect.origin === concentrationData.uuid
              && !effect.flags.dae.transfer
              && effect.uuid !== this.uuid);
            return hasEffects;
          });
          const concentrationTargets = concentrationData.targets.filter(target => {
            let actor = MQfromActorUuid(target.actorUuid);
            const hasEffects = actor.effects.some(effect =>
              effect.origin === concentrationData.uuid
              && !effect.flags.dae.transfer
              && effect.uuid !== this.uuid
              && effect.label !== concentrationLabel);
            return hasEffects;
          });
          if (["effects", "effectsTemplates"].includes(configSettings.removeConcentrationEffects)
            && concentrationTargets.length < 1
            && concentrationTargets.length < concentrationData.targets.length
            && concentrationData.templates.length === 0
            && concentrationData.removeUuids.length === 0) {
            // non concentration effects left
            await removeConcentration(origin.parent, this.uuid);
          } else if (concentrationData.targets.length !== allConcentrationTargets.length) {
            // update the concentration data
            concentrationData.targets = allConcentrationTargets;
            await origin.parent.setFlag("midi-qol", "concentration-data", concentrationData);
          }
        }
      }
    }
  } catch (err) {
    console.warn("midi-qol | error deleting effect: ", err)
  } finally {
    return wrapped(...args);
  }
}

export async function removeConcentration(actor: Actor, concentrationUuid: string) {
  let result;
  try {
    const concentrationData: any = actor.getFlag("midi-qol", "concentration-data");
    if (!concentrationData) {
      return;
    }
    await actor.unsetFlag("midi-qol", "concentration-data");
    if (concentrationData.templates) {
      for (let templateUuid of concentrationData.templates) {
        const template = await fromUuid(templateUuid);
        if (template) await template.delete();
      }
    }
    for (let removeUuid of concentrationData.removeUuids) {
      const entity = await fromUuid(removeUuid);
      if (entity) await entity.delete(); // TODO check if this needs to be run as GM
    }
    if (actor.isToken)
      setTimeout(() => socketlibSocket.executeAsGM("deleteItemEffects", { ignore: [concentrationUuid], targets: concentrationData.targets, origin: concentrationData.uuid, ignoreTransfer: true }), 200)
    else result = await socketlibSocket.executeAsGM("deleteItemEffects", { ignore: [concentrationUuid], targets: concentrationData.targets, origin: concentrationData.uuid, ignoreTransfer: true });
  } catch (err) {
    error("error when attempting to remove concentration ", err)
  }
  return result;
}

async function zeroHPExpiry(actor, update, options, user) {
  const hpUpdate = getProperty(update, "system.attributes.hp.value");
  if (hpUpdate !== 0) return;
  const expiredEffects: string[] = [];
  for (let effect of actor.effects) {
    if (effect.flags?.dae?.specialDuration?.includes("zeroHP")) expiredEffects.push(effect.id)
  }
  if (expiredEffects.length > 0) await actor.deleteEmbeddedDocuments("ActiveEffect", expiredEffects, { "expiry-reason": "midi-qol:zeroHP" })
}

async function checkWounded(actor, update, options, user) {
  const hpUpdate = getProperty(update, "system.attributes.hp.value");
  const vitalityReosurce = checkRule("vitalityResource")?.trim();
  let vitalityUpdate = vitalityReosurce && getProperty(update, vitalityReosurce);
  // return wrapped(update,options,user);
  if (hpUpdate === undefined && (!vitalityReosurce || vitalityUpdate === undefined)) return;
  const attributes = actor.system.attributes;
  if (configSettings.addWounded > 0 && hpUpdate) {
    //@ts-ignore
    const CEWounded = game.dfreds?.effects?._wounded
    const woundedLevel = attributes.hp.max * configSettings.addWounded / 100;
    const needsWounded = hpUpdate > 0 && hpUpdate < woundedLevel
    if (installedModules.get("dfreds-convenient-effects") && CEWounded) {
      const wounded = await ConvenientEffectsHasEffect(CEWounded.label, actor, false);
      if (wounded !== needsWounded) {
        //@ts-ignore
        await game.dfreds?.effectInterface.toggleEffect(CEWounded.label, { overlay: false, uuids: [actor.uuid] });
      }
    } else {
      const tokens = actor.getActiveTokens();
      const controlled = tokens.filter(t => t._controlled);
      const token = controlled.length ? controlled.shift() : tokens.shift();
      const bleeding = CONFIG.statusEffects.find(se => se.id === "bleeding");
      if (bleeding && token)
        await token.toggleEffect(bleeding.icon, { overlay: false, active: needsWounded })
    }
  }
  if (configSettings.addDead !== "none") {
    const needsDead = vitalityReosurce ? vitalityUpdate <= 0 : hpUpdate <= 0;
    if (installedModules.get("dfreds-convenient-effects") && game.settings.get("dfreds-convenient-effects", "modifyStatusEffects") !== "none") {
      let effectName = (actor.type === "character" || actor.hasPlayerOwner) ? getConvenientEffectsUnconscious().label : getConvenientEffectsDead().label
      if (vitalityReosurce) { // token is dead rather than unconscious
        effectName = getConvenientEffectsDead().label;
      }

      const hasEffect = await ConvenientEffectsHasEffect(effectName, actor, false);
      console.error("Token update ", update, hasEffect, needsDead);
      if ((needsDead !== hasEffect)) {
        if (actor.type !== "character" && !actor.hasPlayerOwner) { // For CE dnd5e does not treat dead as dead for the combat tracker so update it by hand as well
          let combatant;
          if (actor.token) combatant = game.combat?.getCombatantByToken(actor.token.id);
          //@ts-ignore
          else combatant = game.combat?.getCombatantByActor(actor.id);
          if (combatant) await combatant.update({ defeated: needsDead })
        }
        //@ts-ignore
        await game.dfreds?.effectInterface.toggleEffect(effectName, { overlay: configSettings.addDead === "overlay", uuids: [actor.uuid] });
      }
    }
    else {
      const tokens = actor.getActiveTokens();
      const controlled = tokens.filter(t => t._controlled);
      const token = controlled.length ? controlled.shift() : tokens.shift();
      if (token) {
        if ((actor.type === "character" || actor.hasPlayerOwner) && vitalityUpdate !== 0) {
          await token.toggleEffect("/icons/svg/unconscious.svg", { overlay: configSettings.addDead === "overlay", active: needsDead });
        } else {
          await token.toggleEffect(CONFIG.controlIcons.defeated, { overlay: configSettings.addDead === "overlay", active: needsDead });
        }
      }
    }
  }
}

async function _preUpdateActor(wrapped, update, options, user) {
  try {
    await checkWounded(this, update, options, user);
    await zeroHPExpiry(this, update, options, user);
  } catch (err) {
    console.warn("midi-qol | preUpdateActor failed ", err)
  }
  finally {
    return wrapped(update, options, user);
  }
}

export function readyPatching() {
  if (game.system.id === "dnd5e" || game.system.id === "n5e") {
    libWrapper.register("midi-qol", `game.${game.system.id}.canvas.AbilityTemplate.prototype.refresh`, midiATRefresh, "WRAPPER");
  } else { // TODO find out what itemsheet5e is called in sw5e TODO work out how this is set for sw5e v10
    libWrapper.register("midi-qol", "game.sw5e.canvas.AbilityTemplate.prototype.refresh", midiATRefresh, "WRAPPER");
  }
  libWrapper.register("midi-qol", "CONFIG.Combat.documentClass.prototype._preUpdate", processOverTime, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.Combat.documentClass.prototype._preDelete", _preDeleteCombat, "WRAPPER");

  libWrapper.register("midi-qol", "Notifications.prototype.notify", notificationNotify, "MIXED");
  //@ts-expect-error
  if ((game.system.id === "dnd5e" && isNewerVersion("2.1.0", game.system.version)) || game.system.id !== "dnd5e") {
    libWrapper.register("midi-qol", "Combatant.prototype._getInitiativeFormula", _getInitiativeFormula, "WRAPPER");
  } else {
    libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.getInitiativeRoll", getInitiativeRoll, "WRAPPER")
  }
  libWrapper.register("midi-qol", "CONFIG.ActiveEffect.documentClass.prototype._preDelete", _preDeleteActiveEffect, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype._preUpdate", _preUpdateActor, "WRAPPER");
  libWrapper.register("midi-qol", "game.system.applications.DamageTraitSelector.prototype.getData", preDamageTraitSelectorGetData, "WRAPPER");
}

export let visionPatching = () => {
  //@ts-ignore game.version
  const patchVision = isNewerVersion(game.version ?? game?.version, "0.7.0") && game.settings.get("midi-qol", "playerControlsInvisibleTokens")
  if (patchVision) {
    ui.notifications?.warn("Player control vision is deprecated, use it at your own risk")
    console.warn("midi-qol | Player control vision is deprecated, use it at your own risk")

    log("Patching Token._isVisionSource")
    libWrapper.register("midi-qol", "Token.prototype._isVisionSource", _isVisionSource, "WRAPPER");

    log("Patching Token.isVisible")
    libWrapper.register("midi-qol", "Token.prototype.isVisible", isVisible, "WRAPPER");
  }
  log("Vision patching - ", patchVision ? "enabled" : "disabled")
}

export function configureDamageRollDialog() {
  try {
    if (configSettings.promptDamageRoll) libWrapper.register("midi-qol", "game.dnd5e.dice.DamageRoll.prototype.configureDialog", CustomizeDamageFormula.configureDialog, "MIXED");
    else {
      libWrapper.unregister("midi-qol", "game.dnd5e.dice.DamageRoll.prototype.configureDialog");
    }
  } catch (err) { }
}

export let itemPatching = () => {
  if (!game.settings.get("midi-qol", "itemUseHooks")) {
    //@ts-ignore .version
    libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.use", doItemUse, "MIXED");
    libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollAttack", doAttackRoll, "MIXED");
    libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollDamage", doDamageRoll, "MIXED");
    libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.displayCard", wrappedDisplayCard, "MIXED");
  } else {
    libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollAttack", doAttackRoll, "MIXED");
    libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollDamage", doDamageRoll, "MIXED");
    libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.displayCard", wrappedDisplayCard, "MIXED");
  }
  if (game.system.id === "dnd5e" || game.system.id === "n5e")
    libWrapper.register("midi-qol", "CONFIG.Dice.DamageRoll.prototype.configureDamage", configureDamage, "MIXED");
  configureDamageRollDialog();
};

export async function preDeleteTemplate(templateDocument, options, user) {
  try {
    const uuid = getProperty(templateDocument, "flags.midi-qol.originUuid");
    const actor = MQfromUuid(uuid)?.actor;
    if (!(actor instanceof CONFIG.Actor.documentClass)) return true;
    const concentrationData = getProperty(actor, "flags.midi-qol.concentration-data");
    if (!concentrationData) return true;
    const concentrationTemplates = concentrationData.templates.filter(templateUuid => templateUuid !== templateDocument.uuid);
    // if (concentrationTemplates.length === concentrationData.templates.length) return true;
    if (concentrationTemplates.length === 0
      && concentrationData.targets.length === 1
      && concentrationData.removeUuids.length === 0
      && ["effectsTemplates"].includes(configSettings.removeConcentrationEffects)
    ) {
      // non concentration effects left
      await removeConcentration(actor, "no ignore");
    } else if (concentrationData.templates.length >= 1) {
      // update the concentration templates
      concentrationData.templates = concentrationTemplates;
      await actor.setFlag("midi-qol", "concentration-data", concentrationData);
    }
  } catch (err) {
  } finally {
    return true;
  }
};

export let actorAbilityRollPatching = () => {
  if (!game.settings.get("midi-qol", "itemUseHooks")) {
    log("Patching rollAbilitySave")
    libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollAbilitySave", rollAbilitySave, "WRAPPER");

    log("Patching rollAbilityTest")
    libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollAbilityTest", rollAbilityTest, "WRAPPER");
  }
  // TODO come back and add these
  log("Patching rollSkill");
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollSkill", doRollSkill, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollToolCheck", rollToolCheck, "WRAPPER");

  // 10.0.19 rollDeath save now implemented via the preRollDeathSave Hook
}

export async function rollToolCheck(wrapped, options: any = {}) {
  const chatMessage = options.chatMessage;
  options.chatMessage = false;
  let result = await wrapped(options);
  result = await bonusCheck(this.actor, result, "check", this.system.ability ?? "")
  if (chatMessage !== false && result) {
    const title = `${this.name} - ${game.i18n.localize("DND5E.ToolCheck")}`;
    const args: any = { "speaker": getSpeaker(this.actor), title, flavor: title };
    setProperty(args, `flags.${game.system.id}.roll`, { type: "tool", itemId: this.id, itemUuid: this.uuid });
    args.template = "modules/midi-qol/templates/roll.html";
    await result.toMessage(args);
  }
  return result;
}

export function patchLMRTFY() {
  if (installedModules.get("lmrtfy")) {
    log("Patching lmrtfy")
    // libWrapper.register("midi-qol", "LMRTFYRoller.prototype._makeRoll", _makeRoll, "OVERRIDE");
    libWrapper.register("midi-qol", "LMRTFY.onMessage", LMRTFYOnMessage, "OVERRIDE");

    // the _tagMessage has been updated in LMRTFY libWrapper.register("midi-qol", "LMRTFYRoller.prototype._tagMessage", _tagMessage, "OVERRIDE");
    // libWrapper.register("midi-qol", "ChatMessage.create", filterChatMessageCreate, "WRAPPER")
  }
}

function LMRTFYOnMessage(data: any) {
  //console.log("LMRTF got message: ", data)
  if (data.user === "character" &&
    (!game.user?.character || !data.actors.includes(game.user.character.id))) {
    return;
  } else if (!["character", "tokens"].includes(data.user) && data.user !== game.user?.id) {
    return;
  }

  let actors: (Actor | undefined)[] = [];
  if (data.user === "character") {
    actors = [game?.user?.character];
  } else if (data.user === "tokens") {
    //@ts-expect-error
    actors = canvas?.tokens?.controlled.map(t => t.actor).filter(a => data.actors.includes(a?.id)) ?? [];
  } else {
    //@ts-expect-error
    actors = data.actors.map(aid => LMRTFY.fromUuid(aid));
  }
  actors = actors.filter(a => a);

  // remove player characters from GM's requests
  if (game.user?.isGM && data.user !== game.user.id) {
    actors = actors.filter(a => !a?.hasPlayerOwner);
  }
  if (actors.length === 0) return;
  //@ts-ignore
  new LMRTFYRoller(actors, data).render(true);
}
function filterChatMessageCreate(wrapped, data: any, context: any) {
  if (!(data instanceof Array)) data = [data]
  for (let messageData of data) {
    if (messageData.flags?.lmrtfy?.data?.disableMessage) messageData.blind = true; // TODO check this v10
  }
  return wrapped(data, context);
}

export function _tagMessage(candidate, data, options) {
  let update = { flags: { lmrtfy: { "message": this.data.message, "data": this.data.attach } } }; // TODO check this
  candidate.updateSource(update);
}

export async function _makeRoll(event, rollMethod, failRoll, ...args) {
  let options;
  switch (this.advantage) {
    case -1:
      options = { disadvantage: true, fastForward: true };
      break;
    case 0:
      options = { fastForward: true };
      break;
    case 1:
      options = { advantage: true, fastForward: true };
      break;
    case 2:
      options = { event };
      break;
  }
  const rollMode = game.settings.get("core", "rollMode");
  game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);
  for (let actor of this.actors) {
    Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));
    if (failRoll) {
      options["parts"] = [-100];
    }
    await actor[rollMethod].call(actor, ...args, options);
  }
  game.settings.set("core", "rollMode", rollMode);
  this._disableButtons(event);
  this._checkClose();
}

export async function createRollResultFromCustomRoll(customRoll: any) {
  const saveEntry = customRoll.entries?.find((e) => e.type === "multiroll");
  let saveTotal = saveEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
  let advantage = saveEntry ? saveEntry.rollState === "highest" : undefined;
  let disadvantage = saveEntry ? saveEntry.rollState === "lowest" : undefined;
  let diceRoll = saveEntry ? saveEntry.entries?.find((e) => !e.ignored)?.roll.terms[0].total : -1;
  let isCritical = saveEntry ? saveEntry.entries?.find((e) => !e.ignored)?.isCrit : false;
  //@ts-ignore
  const result = await new Roll(`${saveTotal}`).evaluate({ async: true });
  setProperty(result.terms[0].options, "advantage", advantage)
  setProperty(result.terms[0].options, "disadvantage", disadvantage)
  return result;
}

export async function _preDeleteCombat(wrapped, ...args) {
  try {
    for (let combatant of this.combatants) {
      if (combatant.actor) {
        if (await hasUsedReaction(combatant.actor)) await removeReactionUsed(combatant.actor, true);
        if (await hasUsedBonusAction(combatant.actor)) await removeBonusActionUsed(combatant.actor, true);
      }
    }
  } catch (err) {
    console.warn("midi-qol | error in preDeleteCombat ", err);
  } finally {
    return wrapped(...args)
  }
}

class CustomizeDamageFormula {
  static formula: string;
  static async configureDialog(wrapped, ...args) {
    // If the option is not enabled, return the original function - as an alternative register\unregister would be possible
    const [{ title, defaultRollMode, defaultCritical, template, allowCritical }, options] = args;
    // Render the Dialog inner HTML
    const content = await renderTemplate(
      //@ts-ignore
      template ?? this.constructor.EVALUATION_TEMPLATE,
      {
        formula: `${this.formula} + @bonus`,
        defaultRollMode,
        rollModes: CONFIG.Dice.rollModes,
      }
    );

    // Create the Dialog window and await submission of the form
    return new Promise((resolve) => {
      new Dialog(
        {
          title,
          content,
          buttons: {
            critical: {
              //@ts-ignore
              condition: allowCritical,
              label: game.i18n.localize("DND5E.CriticalHit"),
              //@ts-ignore
              callback: (html) => resolve(this._onDialogSubmit(html, true)),
            },
            normal: {
              label: game.i18n.localize(
                allowCritical ? "DND5E.Normal" : "DND5E.Roll"
              ),
              //@ts-ignore
              callback: (html) => resolve(this._onDialogSubmit(html, false)),
            },
          },
          default: defaultCritical ? "critical" : "normal",
          // Inject the formula customizer - this is the only line that differs from the original
          render: (html) => { try { CustomizeDamageFormula.injectFormulaCustomizer(this, html) } catch (e) { error(e) } },
          close: () => resolve(null),
        },
        options
      ).render(true);
    });
  }

  static injectFormulaCustomizer(damageRoll, html) {
    const item = damageRoll.data.item; // TODO check this v10
    const damageOptions = {
      default: damageRoll.formula,
      versatileDamage: item.damage.versatile,
      otherDamage: item.formula,
      parts: item.damage.parts,
    }
    const customizerSelect = CustomizeDamageFormula.buildSelect(damageOptions, damageRoll);
    const fg = $(html).find(`input[name="formula"]`).closest(".form-group");
    fg.after(customizerSelect);
    CustomizeDamageFormula.activateListeners(html, damageRoll);
  }

  static updateFormula(damageRoll, data) {
    //@ts-ignore
    const newDiceRoll = new CONFIG.Dice.DamageRoll(data.formula, damageRoll.data, damageRoll.options);
    CustomizeDamageFormula.updateFlavor(damageRoll, data);
    damageRoll.terms = newDiceRoll.terms;
  }

  static updateFlavor(damageRoll, data) {
    const itemName = damageRoll.options.flavor.split(" - ")[0];
    const damageType = CustomizeDamageFormula.keyToText(data.damageType);
    const special = CustomizeDamageFormula.keyToText(data.key) === damageType ? "" : CustomizeDamageFormula.keyToText(data.key);
    const newFlavor = `${itemName} - ${special} ${CustomizeDamageFormula.keyToText("damageRoll")} ${damageType ? `(${damageType.replace(" - ", "")})` : ""}`;
    Hooks.once("preCreateChatMessage", (message) => {
      message.updateSource({ flavor: newFlavor }); // TODO check this v10
    });
  }

  static buildSelect(damageOptions, damageRoll) {
    const select = $(`<select id="customize-damage-formula"></select>`);
    for (let [k, v] of Object.entries(damageOptions)) {
      if (k === "parts") {
        //@ts-ignore
        for (let part of v) {
          //@ts-ignore
          const index = v.indexOf(part);
          const adjustedFormula = CustomizeDamageFormula.adjustFormula(part, damageRoll);
          select.append(CustomizeDamageFormula.createOption(part[1], part, index));
        }
      } else {
        //@ts-ignore
        if (v) select.append(CustomizeDamageFormula.createOption(k, v));
      }
    }
    const fg = $(`<div class="form-group"><label>${CustomizeDamageFormula.keyToText("customizeFormula")}</label></div>`)
    fg.append(select);
    return fg;
  }

  static createOption(key, data, index) {
    const title = CustomizeDamageFormula.keyToText(key)
    if (typeof data === "string") {
      return $(`<option data-damagetype="" data-key="${key}" data-index="" value="${data}">${title + data}</option>`);
    } else {
      return $(`<option data-damagetype="${data[1]}" data-key="${key}" data-index="${index}" value="${data[0]}">${title + data[0]}</option>`);
    }
  }

  static adjustFormula(part, damageRoll) {
    if (damageRoll.data.item.level) { // check this v10
      //adjust for level scaling
    }
    return part;
  }

  static keyToText(key) {
    //localize stuff
    switch (key) {
      case "damageRoll":
        return "Damage Roll";
      case "customizeFormula":
        return "Customize Formula";
      case "versatileDamage":
        return "Versatile - ";
      case "otherDamage":
        return "Other - ";
      case "default":
        return "Default - ";
    }
    return key.charAt(0).toUpperCase() + key.slice(1) + " - ";
  }

  static activateListeners(html, damageRoll) {
    $(html).find(`select[id="customize-damage-formula"]`).on("change", (e) => {
      const selected = $(e.currentTarget).find(":selected");
      $(html).find(`input[name="formula"]`).val(selected.val() + " + @bonus");
      CustomizeDamageFormula.updateFormula(damageRoll, { formula: selected.val() + " + @bonus", key: selected.data("key"), damageType: selected.data("damagetype"), partsIndex: selected.data("index") });
    })
  }

}

export function migrateTraits(actor) {
  try {
    const baseData = actor.toObject(true);
    for (let traitId of ["di", "dr", "dv", "sdi", "sdr", "sdv"]) {
      let trait = actor.system.traits[traitId];
      let baseTrait = baseData.system.traits[traitId];
      if (!trait) continue;
      trait.value = [];

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
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage"));
              trait.value.delete("spell");
              log(`${actor.name} mapping "spell" to ${trait.custom}`)
              break
            case "power":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage"));
              trait.value.delete("power");
              log(`${actor.name} mapping "power" to ${trait.custom}`)
              break
            case "magic":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical"));
              trait.value.delete("magic");
              log(`${actor.name} mapping "magic" to ${trait.custom}`)
              break
            case "healing":
              trait.custom = addCustomTrait(trait.custom, getSystemCONFIG().healingTypes.healing);
              trait.value.delete("healing");
              log(`${actor.name} mapping "healing" to ${trait.custom}`)
              break
            case "temphp":
              trait.custom = addCustomTrait(trait.custom, getSystemCONFIG().healingTypes.temphp);
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
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.spell-damage"));
              trait.value = removeTraitValue(trait.value, "spell");
              log(`${actor.name} mapping "spell" to ${trait.custom}`)
              break
            case "power":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.power-damage"));
              trait.value = removeTraitValue(trait.value, "power");
              log(`${actor.name} mapping "power" to ${trait.custom}`)
              break
            case "magic":
              trait.custom = addCustomTrait(trait.custom, i18n("midi-qol.Magical"));
              trait.value = removeTraitValue(trait.value, "magic");
              log(`${actor.name} mapping "magic" to ${trait.custom}`)
              break
            case "healing":
              trait.custom = addCustomTrait(trait.custom, getSystemCONFIG().healingTypes.healing);
              trait.value = removeTraitValue(trait.value, "healing");
              log(`${actor.name} mapping "healing" to ${trait.custom}`)
              break
            case "temphp":
              trait.custom = addCustomTrait(trait.custom, getSystemCONFIG().healingTypes.temphp);
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
    console.warn("midi-qol | migrate traits error ", this, err)
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
  const phsyicalDamageTypes = Object.keys(getSystemCONFIG().physicalDamageTypes);

  for (let dt of phsyicalDamageTypes) {
    if (traitValue instanceof Set) traitValue.add(dt);
    else if (!traitValue.includes(dt)) traitValue.push(dt);
  }
}

function addCustomTrait(customTraits: string, customTrait: string): string {
  console.log("Adding custom trait ", customTrait, customTraits)
  if (customTraits.length === 0) {
    return customTrait;
  }
  const traitList = customTraits.split(";").map(s => s.trim());
  if (traitList.includes(customTrait)) return customTraits;
  traitList.push(customTrait);
  return traitList.join("; ");
}

function preDamageTraitSelectorGetData(wrapped) {
  try {
    // migrate di/dr/dv and strip out active effect data.
    if (this.object instanceof Actor) migrateTraits(this.object);
  } catch (err) {
    console.error("migrate traits error", err)
  } finally {
    return wrapped();
  }

}