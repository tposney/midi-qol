import { log, warn, debug, i18n, error, getCanvas, i18nFormat } from "../midi-qol.js";
import { doAttackRoll, doDamageRoll, templateTokens, doItemUse } from "./itemhandling.js";
import { configSettings, autoFastForwardAbilityRolls, criticalDamage, checkRule } from "./settings.js";
import { bonusDialog, ConvenientEffectsHasEffect, createConditionData, evalCondition, expireRollEffect, getAutoRollAttack, getAutoRollDamage, getConvenientEffectsBonusAction, getConvenientEffectsDead, getConvenientEffectsReaction, getConvenientEffectsUnconscious, getOptionalCountRemainingShortFlag, getSpeaker, getSystemCONFIG, hasUsedBonusAction, hasUsedReaction, isAutoFastAttack, isAutoFastDamage, mergeKeyboardOptions, midiRenderRoll, MQfromActorUuid, notificationNotify, processOverTime, removeBonusActionUsed, removeReactionUsed } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { OnUseMacro, OnUseMacros } from "./apps/Item.js";
import { mapSpeedKeys } from "./MidiKeyManager.js";
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
  fastForwardAttack: boolean | undefined,
  fastForwardDamage: boolean | undefined,
  fastForwardAbility: boolean | undefined,
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
        //@ts-ignore
        case "check": title = i18nFormat(`${systemString}.AbilityPromptTitle`, { ability: config.abilities[detail] ?? "" });
          break;
        //@ts-ignore
        case "save": title = i18nFormat(`${systemString}.SavePromptTitle`, { ability: config.abilities[detail] ?? "" });
          break;
        //@ts-ignore
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
  mergeKeyboardOptions(options, mapSpeedKeys(null, "ability"));
  options.event = {};
  let procOptions: Options = procAdvantage(this, "check", this.system.skills[skillId].ability, options)
  procOptions = procAdvantageSkill(this, skillId, procOptions);
  if (procOptions.advantage && procOptions.disadvantage) {
    procOptions.advantage = false;
    procOptions.disadvantage = false;
  }
  if (procAutoFailSkill(this, skillId) || procAutoFail(this, "check", this.system.skills[skillId].ability)) {
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
    if (!options.parts) delete options.parts;
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

function rollDeathSave(wrapped, ...args) {
  let [options] = args;
  // options = foundry.utils.mergeObject(options, mapSpeedKeys(null, "ability"), { inplace: false, overwrite: true });
  mergeKeyboardOptions(options, mapSpeedKeys(null, "ability"));
  options.event = {};
  const advFlags = getProperty(this.flags, "midi-qol")?.advantage;
  const disFlags = getProperty(this.flags, "midi-qol")?.disadvantage;
  let withAdvantage = false;
  let withDisadvantage = false;
  options.fastForward = autoFastForwardAbilityRolls ? !options.event?.fastKey : options.event?.fastKey;
  if (advFlags || disFlags) {
    const conditionData = createConditionData({ workflow: undefined, target: undefined, actor: this });
    if ((advFlags?.all && evalCondition(advFlags.all, conditionData))
      || (advFlags?.deathSave && evalCondition(advFlags.deathSave, conditionData))) {
      withAdvantage = true;
    }

    if ((disFlags?.all && evalCondition(disFlags.all, conditionData))
      || (disFlags?.deathSave && evalCondition(disFlags.deathSave, conditionData))) {
      withDisadvantage = true;
    }
  }
  options.advantage = withAdvantage && !withDisadvantage;
  options.disadvantage = withDisadvantage && !withAdvantage;

  if (options.advantage && options.disadvantage) {
    options.advantage = options.disadvantage = false;
  }
  return wrapped.call(this, ...args);
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
  if (criticalDamage === "doubleDice") this.options.multiplyNumeric = true;
  if (criticalDamage === "baseDamage") {
    this.options.configured = true;
    return this;
  };

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
          term.alter(cm, cb);
        } else if (term instanceof NumericTerm) {
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

export async function rollAbilitySave(wrapped, ...args) {
  return doAbilityRoll.bind(this)(wrapped, "save", ...args);
}
async function rollAbilityTest(wrapped, ...args) {
  return doAbilityRoll.bind(this)(wrapped, "check", ...args);
}
/* TODO come back to this when/if hooks are async 
function preHookAbilityRoll(item: Item, rollData: any, abilityId: string, rollType: string) {
  const rollTarget = rollData.targetValue;
  if (procAutoFail(this, rollType, abilityId)) {
    rollData.parts.push(["-100"]);
  }
  const chatMessage = rollData.chatMessage;
  const keyOptions = mapSpeedKeys(null, "ability");
  if (rollData.mapKeys !== false) {
    if (keyOptions?.advantage === true) rollData.advantage = rollData.advantage || keyOptions.advantage;
    if (keyOptions?.disadvantage === true) rollData.disadvantage = rollData.disadvantage || keyOptions.disadvantage;
    if (keyOptions?.fastForwardAbility === true) rollData.fastForward = rollData.fastForward || keyOptions.fastForwardAbility;
  }
  // Hack for MTB bug
  if (rollData.event?.advantage) rollData.advantage = rollData.event.advantage || rollData.advantage;
  if (rollData.event?.disadvantage) rollData.disadvantage = rollData.event.disadvantage || rollData.disadvantage;

  rollData.event = {};

  let procOptions: any = procAdvantage(this, rollType, abilityId, rollData);
  if (procOptions.advantage && procOptions.disadvantage) {
    rollData.advantage = false;
    rollData.disadvantage = false;
  }

  setProperty(rollData, "midi-qol", {chatMessage, simulate: rollData.simulate})
  rollData.chatMessage = false;
  
  return true;
}

function rollAbilitySaveHook(item: Item, roll: any , abilityId: string, rollType: string) { 
  const maxFlags = getProperty(this.flags, "midi-qol.max.ability") ?? {};
  const flavor = roll.options?.flavor;
  const maxValue = (maxFlags[rollType] && (maxFlags[rollType].all || maxFlags[rollType][abilityId])) ?? false
  if (maxValue && Number.isNumeric(maxValue)) {
    roll.terms[0].modifiers.unshift(`max${maxValue}`);
    //@ts-ignore
    result = await new Roll(Roll.getFormula(result.terms)).evaluate({ async: true });
  }

  const minFlags = getProperty(this.flags, "midi-qol.min.ability") ?? {};
  const minValue = (minFlags[rollType] && (minFlags[rollType].all || minFlags[rollType][abilityId])) ?? false;
  if (minValue && Number.isNumeric(minValue)) {
    roll.terms[0].modifiers.unshift(`min${minValue}`);
    //@ts-ignore
    roll = await new Roll(Roll.getFormula(result.terms)).evaluate({ async: true });
  }

  if (!roll.options.simulate) roll = await bonusCheck(this, roll, rollType, abilityId)
  if (roll.options.chatMessage !== false && roll) {
    const args: any = { "speaker": getSpeaker(this), flavor };
    setProperty(args, `flags.${game.system.id}.roll`, { type: rollType, abilityId });
    args.template = "modules/midi-qol/templates/roll.html";
    await roll.toMessage(args);
  }
  let success: boolean | undefined = undefined;
  if (roll.options.rollTarget !== undefined) success = roll.total >= roll.ootions.rollTarget;
  await expireRollEffect.bind(this)(rollType, abilityId, success);

}
*/
async function doAbilityRoll(wrapped, rollType: string, ...args) {
  let [abilityId, options = { event: {}, parts: [], chatMessage: undefined, simulate: false, targetValue: undefined }] = args;
  const rollTarget = options.targetValue;
  if (procAutoFail(this, rollType, abilityId)) {
    options.parts = ["-100"];
  }
  const chatMessage = options.chatMessage;
  const keyOptions = mapSpeedKeys(null, "ability");
  if (options.mapKeys !== false) {
    if (keyOptions?.advantage === true) options.advantage = options.advantage || keyOptions.advantage;
    if (keyOptions?.disadvantage === true) options.disadvantage = options.disadvantage || keyOptions.disadvantage;
    if (keyOptions?.fastForwardAbility === true) options.fastForward = options.fastForward || keyOptions.fastForwardAbility;
  }

  // Hack for MTB bug
  if (options.event?.advantage) options.advantage = options.event.advantage || options.advantage;
  if (options.event?.disadvantage) options.disadvantage = options.event.disadvantage || options.disadvantage;

  options.event = {};

  let procOptions: any = procAdvantage(this, rollType, abilityId, options);
  if (procOptions.advantage && procOptions.disadvantage) {
    procOptions.advantage = false;
    procOptions.disadvantage = false;
  }

  let result;
  // if (installedModules.get("betterrolls5e") && options.chatMessage !== false) {
  if (installedModules.get("betterrolls5e")) {
    let event = {};
    if (procOptions.advantage) { options.advantage = true; event = { shiftKey: true } };
    if (procOptions.disadvantage) { options.disadvantage = true; event = { ctrlKey: true } };
    options.event = event;
    result = wrapped(abilityId, options);
    if (options.chatMessage !== false && !options.vanilla) return result;
    result = await result;
  } else {
    if (!options.parts) delete options.parts;
    procOptions.chatMessage = false;
    result = await wrapped(abilityId, procOptions);
  }
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

  if (!options.simulate) result = await bonusCheck(this, result, rollType, abilityId)
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

export function procAdvantage(actor, rollType, abilityId, options: Options | any): Options {
  const midiFlags = actor.flags["midi-qol"] ?? {};
  const advantage = midiFlags.advantage;
  const disadvantage = midiFlags.disadvantage;
  var withAdvantage = options.advantage;
  var withDisadvantage = options.disadvantage;

  //options.fastForward = options.fastForward || (autoFastForwardAbilityRolls ? !options.event?.fastKey : options.event?.fastKey);

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
    const dimensions = canvas.dimensions || { size: 1, distance: 1 };
    distance *= dimensions.size / dimensions.distance;
    const tokensToCheck = canvas.tokens.placeables?.filter(tk => {
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
      if (["alwaysIgnoreDefeated", "wallsBlockIgnoreDefeated"].includes(configSettings.autoTarget) && tk.actor?.system.attributes.hp.value <= 0)
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
  }
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
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.prepareData", prepareOnUseMacroData, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.prepareData", prepareOnUseMacroData, "WRAPPER");
}

export function prepareOnUseMacroData(wrapped, ...args) {
  wrapped(...args);
  try {
    const macros = getProperty(this, 'flags.midi-qol.onUseMacroName');
    setProperty(this, "flags.midi-qol.onUseMacroParts", new OnUseMacros(macros ?? null));
  } catch (err) {
    console.warn("midi-qol | failed to prepare onUse macro data", err)
  }
}

// This can replace the ItemSheetSubmit solution when in v9 
export function preUpdateItemActorOnUseMacro(itemOrActor, changes, options, user) {
  try {
    const macroParts = getProperty(changes, "flags.midi-qol.onUseMacroParts");
    if (!macroParts) return true;

    const macroString = macroParts.items.map(oum => oum.toString()).join(",");
    changes.flags["midi-qol"].onUseMacroName = macroString;
    delete changes.flags["midi-qol"].onUseMacroParts;
  } catch (err) {
    console.warn("midi-qol | failed in preUpdateItemActor onUse Macro", err)
  }
  return true;
};

// TODO this is not needed for v9.
function itemSheetGetSubmitData(wrapped, ...args) {
  let data = wrapped(...args);
  data = expandObject(data);
  try {
    const macroParts: any = getProperty(data, "flags.midi-qol.onUseMacroParts");
    if (macroParts) {
      const macros = OnUseMacros.parseParts(macroParts)
      delete data.flags["midi-qol"].onUseMacroParts;
      data.flags["midi-qol"].onUseMacroName = macros.toString();
    }
  } catch (err) {
    warn("onUseMacro update processing ", err)
  } finally {
    return flattenObject(data);
  }
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

      // Handle removal of reaction effect
      if (installedModules.get("dfreds-convenient-effects") && getConvenientEffectsReaction()?._id === this.flags?.core?.statusId) {
        await this.parent.unsetFlag("midi-qol", "reactionCombatRound");
      }

      // Handle removal of bonus action effect
      if (installedModules.get("dfreds-convenient-effects") && getConvenientEffectsBonusAction()?._id === this.flags?.core?.statusId) {
        await this.parent.unsetFlag("midi-qol", "bonusActionCombatRound");
      }
    }
  } catch (err) {
    console.warn("midi-qol | error deleting concentration effects: ", err)
  } finally {
    return wrapped(...args)
  }
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
  // return wrapped(update,options,user);
  if (hpUpdate === undefined) return;
  const attributes = actor.system.attributes;
  if (configSettings.addWounded > 0) {
    //@ts-ignore
    const CEWounded = game.dfreds?.effects?._wounded
    const woundedLevel = attributes.hp.max * configSettings.addWounded / 100;
    const needsWounded = hpUpdate > 0 && hpUpdate < woundedLevel
    if (installedModules.get("dfreds-convenient-effects") && CEWounded) {
      const wounded = await ConvenientEffectsHasEffect(CEWounded.name, actor.uuid);
      if (wounded !== needsWounded) {
        //@ts-ignore
        await game.dfreds?.effectInterface.toggleEffect(CEWounded.name, { overlay: false, uuids: [actor.uuid] });
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
    const needsDead = hpUpdate <= 0;
    if (installedModules.get("dfreds-convenient-effects") && game.settings.get("dfreds-convenient-effects", "modifyStatusEffects") !== "none") {
      const effectName = actor.hasPlayerOwner ? getConvenientEffectsUnconscious().name : getConvenientEffectsDead().name;
      const hasEffect = await ConvenientEffectsHasEffect(effectName, actor.uuid);
      if ((needsDead !== hasEffect)) {
        if (!actor.hasPlayerOwner) { // For CE dnd5e does not treat dead as dead for the combat tracker so update it by hand as well
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
        if (actor.hasPlayerOwner) {
          await token.toggleEffect("/icons/svg/unconscious.svg", { overlay: true, active: needsDead });
        } else {
          await token.toggleEffect(CONFIG.controlIcons.defeated, { overlay: true, active: needsDead });
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
  // TODO remove this when v9 default
  if (game.system.id === "dnd5e" || game.system.id === "n5e") {
    libWrapper.register("midi-qol", `game.${game.system.id}.applications.item.ItemSheet5e.prototype._getSubmitData`, itemSheetGetSubmitData, "WRAPPER");
    libWrapper.register("midi-qol", `game.${game.system.id}.canvas.AbilityTemplate.prototype.refresh`, midiATRefresh, "WRAPPER");
  } else { // TODO find out what itemsheet5e is called in sw5e TODO work out how this is set for sw5e v10
    libWrapper.register("midi-qol", "game.sw5e.applications.Item.ItemSheet5e.prototype._getSubmitData", itemSheetGetSubmitData, "WRAPPER");
    libWrapper.register("midi-qol", "game.sw5e.canvas.AbilityTemplate.prototype.refresh", midiATRefresh, "WRAPPER");
  }
  libWrapper.register("midi-qol", "CONFIG.Combat.documentClass.prototype._preUpdate", processOverTime, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.Combat.documentClass.prototype._preDelete", _preDeleteCombat, "WRAPPER");

  libWrapper.register("midi-qol", "Notifications.prototype.notify", notificationNotify, "MIXED");
  libWrapper.register("midi-qol", "Combatant.prototype._getInitiativeFormula", _getInitiativeFormula, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.ActiveEffect.documentClass.prototype._preDelete", _preDeleteActiveEffect, "WRAPPER");
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype._preUpdate", _preUpdateActor, "WRAPPER");
}

export let visionPatching = () => {
  //@ts-ignore game.version
  const patchVision = isNewerVersion(game.version ?? game?.version, "0.7.0") && game.settings.get("midi-qol", "playerControlsInvisibleTokens")
  if (patchVision) {
    ui.notifications?.warn("Player control vision is deprecated please use the module Your Tokens Visible")
    console.warn("midi-qol | Player control vision is deprecated please use the module Your Tokens Visible")

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
  //@ts-ignore .version
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.use", doItemUse, "MIXED");
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollAttack", doAttackRoll, "MIXED");
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollDamage", doDamageRoll, "MIXED");
  if (game.system.id === "dnd5e" || game.system.id === "n5e")
    libWrapper.register("midi-qol", "CONFIG.Dice.DamageRoll.prototype.configureDamage", configureDamage, "MIXED");
  configureDamageRollDialog();
};

export let actorAbilityRollPatching = () => {
  log("Patching rollAbilitySave")
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollAbilitySave", rollAbilitySave, "WRAPPER");

  log("Patching rollAbilityTest")
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollAbilityTest", rollAbilityTest, "WRAPPER");

  log("Patching rollSkill");
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollSkill", doRollSkill, "WRAPPER");

  log("Patching rollDeathSave");
  libWrapper.register("midi-qol", "CONFIG.Actor.documentClass.prototype.rollDeathSave", rollDeathSave, "WRAPPER");
}


export function patchLMRTFY() {
  if (installedModules.get("lmrtfy")) {
    log("Patching lmrtfy")
    libWrapper.register("midi-qol", "LMRTFYRoller.prototype._makeRoll", _makeRoll, "OVERRIDE");
    // the _tagMessage has been updated in LMRTFY libWrapper.register("midi-qol", "LMRTFYRoller.prototype._tagMessage", _tagMessage, "OVERRIDE");
    // libWrapper.register("midi-qol", "ChatMessage.create", filterChatMessageCreate, "WRAPPER")
  }
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

export async function _makeRoll(event, rollMethod, ...args) {
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
      options = { event }
      break;
  }
  const rollMode = game.settings.get("core", "rollMode");
  game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);
  for (let actor of this.actors) {
    Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));
    await actor[rollMethod].call(actor, ...args, options);
  }
  game.settings.set("core", "rollMode", rollMode);
  event.currentTarget.disabled = true;
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
