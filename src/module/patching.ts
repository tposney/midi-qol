import { log, warn, debug, i18n, error } from "../midi-qol";
import { doItemRoll, doAttackRoll, doDamageRoll, templateTokens } from "./itemhandling";
import { configSettings, autoFastForwardAbilityRolls, criticalDamage } from "./settings.js";
import { bonusDialog, expireRollEffect, getOptionalCountRemaining, getOptionalCountRemainingShortFlag, getSpeaker, testKey } from "./utils";
import { installedModules } from "./setupModules";
import { libWrapper } from "./lib/shim.js";

var d20Roll;

function _isVisionSource() {
  // log("proxy _isVisionSource", this);

  if (!canvas.sight.tokenVision || !this.hasSight) return false;

  // Only display hidden tokens for the GM
  const isGM = game.user.isGM;
  // TP insert
  // console.error("is vision source ", this.actor?.name, this.actor?.hasPerm(game.user, "OWNER"))
  if (this.data.hidden && !(isGM || this.actor?.testUserPermission(game.user, "OWNER"))) return false;

  // Always display controlled tokens which have vision
  if (this._controlled) return true;

  // Otherwise vision is ignored for GM users
  if (isGM) return false;

  if (this.actor?.testUserPermission(game.user, "OBSERVER")) return true;
  // If a non-GM user controls no other tokens with sight, display sight anyways
  const canObserve = this.actor && this.actor.testUserPermission(game.user, "OWNER");
  if (!canObserve) return false;
  const others = canvas.tokens.controlled.filter(t => t.hasSight);
  //TP ** const others = this.layer.controlled.filter(t => !t.data.hidden && t.hasSight);
  return !others.length;
}

function isVisible() {
  // console.error("Doing my isVisible")
  const gm = game.user.isGM;
  if (this.actor?.testUserPermission(game.user, "OWNER")) {
    //     this.data.hidden = false;
    return true;
  }
  if (this.data.hidden) return gm || this.actor?.testUserPermission(game.user, "OWNER");
  if (!canvas.sight.tokenVision) return true;
  if (this._controlled) return true;
  const tolerance = Math.min(this.w, this.h) / 4;
  return canvas.sight.testVisibility(this.center, { tolerance });
}

export const advantageEvent = { shiftKey: false, altKey: true, ctrlKey: false, metaKey: false, fastKey: false };
export const disadvantageEvent = { shiftKey: false, altKey: false, ctrlKey: true, metaKey: true, fastKey: false };
export const fastforwardEvent = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, fastKey: true };
export const baseEvent = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, fastKey: false };

function mapSpeedKeys(event) {
  if (configSettings.speedItemRolls && configSettings.speedAbilityRolls && !installedModules.get("betterrolls5e")) {
    if (game.system.id === "sw5e") {
      var advKey = testKey(configSettings.keyMapping["SW5E.Advantage"], event);
      var disKey = testKey(configSettings.keyMapping["SW5E.Disadvantage"], event);
    } else {
      var advKey = testKey(configSettings.keyMapping["DND5E.Advantage"], event);
      var disKey = testKey(configSettings.keyMapping["DND5E.Disadvantage"], event);
    }
  } else {
    var advKey = event?.altKey ? true : false;
    var disKey = (event?.ctrlKey | event?.metaKey) ? true : false;
  };
  if (advKey && disKey)
    event = fastforwardEvent;
  else if (disKey) event = disadvantageEvent;
  else if (advKey) event = advantageEvent;
  else
    event = baseEvent;
  return event;
}

interface Options {
  event: any,
  advantage: boolean | undefined,
  disadvantage: boolean | undefined,
  fastForward: boolean | undefined,
  parts: [] | undefined
};

async function bonusCheck(actor, result: Roll, checkName) : Promise<Roll> {
  if (!installedModules.get("betterrolls5e")) {
    const bonusFlags = Object.keys(actor.data.flags["midi-qol"]?.optional ?? [])
      .filter(flag => {
        if (!actor.data.flags["midi-qol"].optional[flag][checkName]) return false;
        if (!actor.data.flags["midi-qol"].optional[flag].count) return true;
        return getOptionalCountRemainingShortFlag(actor, flag) > 0;
      })
      .map(flag => `flags.midi-qol.optional.${flag}`);
    if (bonusFlags.length > 0) {
      const data = {
        actor,
        roll: result,
        rollHTML: await result.render(),
        rollTotal: result.total,
      }
      await bonusDialog.bind(data)(bonusFlags, checkName, true, `${actor.name} - ${i18n("midi-qol.ability-check")}`, "roll", "rollTotal", "rollHTML")
      result = data.roll;
    }
  }
  return result;
}

async function doRollSkill(wrapped, ...args) {
  const [skillId, options = { event: {}, parts: [], avantage: false, disadvantage: false }] = args;
  const chatMessage = options.chatMessage;
  options.event = mapSpeedKeys(options.event);
  if (options.event === advantageEvent || options.event === disadvantageEvent)
    options.fastForward = true;
  let procOptions = procAdvantage(this, "check", this.data.data.skills[skillId].ability, options)
  procOptions = procAdvantageSkill(this, skillId, procOptions)
  if (procAutoFailSkill(this, skillId) || procAutoFail(this, "check", this.data.data.skills[skillId].ability)) {
    options.parts = ["-100"];
  }
  
  options.event = {};
  //@ts-ignore
  procOptions.chatMessage = false;
  let result = await wrapped.call(this, skillId, procOptions);
  result = await bonusCheck(this, result, "skill")
  if (chatMessage !== false) result.toMessage({speaker: getSpeaker(this)});
  expireRollEffect.bind(this)("Skill", skillId);
  return result;
}

function rollDeathSave(wrapped, ...args) {
  const [options] = args;
  const event = mapSpeedKeys(options.event);
  const advFlags = getProperty(this.data.flags, "midi-qol")?.advantage ?? {};
  const disFlags = getProperty(this.data.flags, "midi-qol")?.disadvantage ?? {};
  var withAdvantage = options.event?.altKey || options.advantage;
  var withDisadvantage = options.event?.ctrlKey || options.event?.metaKey || options.disadvantage;
  options.fastForward = autoFastForwardAbilityRolls ? !options.event.fastKey : options.event.fastKey;
  withAdvantage = advFlags.deathSave || advFlags.all;
  withDisadvantage = disFlags.deathSave || disFlags.all;
  options.advantage = withAdvantage && !withDisadvantage;
  options.disadvantage = withDisadvantage && !withAdvantage;
  options.event = {};

  if (options.advantage && options.disadvantage) {
    options.advantage = options.disadvantage = false;
  }
  return wrapped.call(this, ...args);
}
function configureDamage(wrapped) {
  if (!this.isCritical || criticalDamage === "default") return wrapped();
  let flatBonus = 0;
  if (criticalDamage === "doubleDice") this.options.multiplyNumeric = true;
  if (criticalDamage === "baseDamage") this.options.criticalMultiplier = 1;
  for (let [i, term] of this.terms.entries()) {
    // Multiply dice terms
    if (term instanceof CONFIG.Dice.termTypes.DiceTerm) {
      term.options.baseNumber = term.options.baseNumber ?? term.number; // Reset back
      term.number = term.options.baseNumber;
      let cm = this.options.criticalMultiplier ?? 2;
      let cb = (this.options.criticalBonusDice && (i === 0)) ? this.options.criticalBonusDice : 0;
      // {default: "DND5e default", maxDamage:  "base max only", maxCrit: "max critical dice", maxAll: "max all dice", doubleDice: "double dice value"},
      switch (criticalDamage) {

        case "maxDamage":
          term.modifiers.push(`min${term.faces}`)
          cm = 1;
          flatBonus = 0;
          break;
        case "maxCrit":
          flatBonus += (term.number + cb) * term.faces;
          cm = Math.max(1, cm - 1);
          term.alter(cm, cb);
          break;
        case "maxAll":
          term.modifiers.push(`min${term.faces}`);
          term.alter(cm, cb);
          flatBonus = 0;
          break;
        case "doubleDice":
          cm = 1;
          break;
        default: break;
      }
      term.options.critical = true;
    }

    // Multiply numeric terms
    else if (this.options.multiplyNumeric && (term instanceof CONFIG.Dice.termTypes.NumericTerm)) {
      term.options.baseNumber = term.options.baseNumber ?? term.number; // Reset back
      term.number = term.options.baseNumber;
      if (this.isCritical) {
        term.number *= (this.options.criticalMultiplier ?? 2);
        term.options.critical = true;
      }
    }
  }

  // Add powerful critical bonus
  if (flatBonus > 0) {
    this.terms.push(new CONFIG.Dice.termTypes.OperatorTerm({ operator: "+" }));
    this.terms.push(new CONFIG.Dice.termTypes.NumericTerm({ number: flatBonus }, { flavor: game.i18n.localize("DND5E.PowerfulCritical") }));
  }
  if (criticalDamage === "doubleDice") {
    let newTerms = [];
    for (let term of this.terms) {
      if (term instanceof CONFIG.Dice.termTypes.DiceTerm) {
        newTerms.push(new CONFIG.Dice.termTypes.ParentheticalTerm({ term: `2*${term.formula}` }))
      } else
        newTerms.push(term);
    }
    this.terms = newTerms;
  }

  // Re-compile the underlying formula
  this._formula = this.constructor.getFormula(this.terms);
}
async function rollAbilityTest(wrapped, ...args) {
  const [abilityId, options = { event: {}, parts: [], chatMessage: undefined }] = args;
  const chatMessage = options.chatMessage;
  if (procAutoFail(this, "check", abilityId)) options.parts = ["-100"];
  options.event = mapSpeedKeys(options.event);
  if (options.event === advantageEvent || options.event === disadvantageEvent)
    options.fastForward = true;
  let procOptions = procAdvantage(this, "check", abilityId, options);

  options.event = {};
  const flags = getProperty(this.data.flags, "midi-qol.MR.ability") ?? {};
  const minimumRoll = (flags.check && (flags.check.all || flags.save[abilityId])) ?? 0;

  //@ts-ignore
  procOptions.chatMessage = false;
  let result = await wrapped(abilityId, procOptions);
  result = await bonusCheck(this, result, "check")
  if (chatMessage !== false) result.toMessage({speaker: getSpeaker(this)});
  expireRollEffect.bind(this)("Check", abilityId);
  return result;
}

async function rollAbilitySave(wrapped, ...args) {
  const [abilityId, options = { event: {}, parts: [], chatMessage: undefined }] = args;
  if (procAutoFail(this, "save", abilityId)) {
    options.parts = ["-100"];
  }
  const chatMessage = options.chatMessage;
  options.event = mapSpeedKeys(options.event);
  if (options.event === advantageEvent || options.event === disadvantageEvent)
    options.fastForward = true;
  let procOptions = procAdvantage(this, "save", abilityId, options);
  const flags = getProperty(this.data.flags, "midi-qol.MR.ability") ?? {};
  const minimumRoll = (flags.save && (flags.save.all || flags.save[abilityId])) ?? 0;
  //@ts-ignore
  procOptions.chatMessage = false;
  let result = await wrapped(abilityId, procOptions);
  result = await bonusCheck(this, result, "save")
  if (chatMessage !== false) result.toMessage({speaker: getSpeaker(this)});
  expireRollEffect.bind(this)("Save", abilityId);
  return result;
  /* TODO work out how to do minimum rolls properly
  return wrapped.call(this, wrapped, abilityId, procOptions).then(roll => {
    console.error("mini check save", roll.total, minimumRoll, roll.total < minimumRoll, (new Roll(`${minimumRoll}`)).roll())
    if (roll.total < minimumRoll) return (new Roll(`${minimumRoll}`)).roll()
    else return roll
  });
  */
}

function procAutoFail(actor, rollType: string, abilityId: string): boolean {
  const midiFlags = actor.data.flags["midi-qol"] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.ability || fail.all) {
    const rollFlags = (fail.ability && fail.ability[rollType]) ?? {};
    const autoFail = fail.all || fail.ability.all || rollFlags.all || rollFlags[abilityId];
    return autoFail;
  }
  return false;
}

function procAutoFailSkill(actor, skillId): boolean {
  const midiFlags = actor.data.flags["midi-qol"] ?? {};
  const fail = midiFlags.fail ?? {};
  if (fail.skill || fail.all) {
    const rollFlags = (fail.skill && fail.skill[skillId]) || false;
    const autoFail = fail.all || fail.skill.all || rollFlags;
    return autoFail;
  }
  return false;
}

function procAdvantage(actor, rollType, abilityId, options: Options): Options {
  const midiFlags = actor.data.flags["midi-qol"] ?? {};
  const advantage = midiFlags.advantage ?? {};
  const disadvantage = midiFlags.disadvantage ?? {};
  var withAdvantage = options.event?.altKey || options.advantage;
  var withDisadvantage = options.event?.ctrlKey || options.event?.metaKey || options.disadvantage;

  options.fastForward = options.fastForward || (autoFastForwardAbilityRolls ? !options.event.fastKey : options.event.fastKey);
  if (advantage.ability || advantage.all) {
    const rollFlags = (advantage.ability && advantage.ability[rollType]) ?? {};
    withAdvantage = withAdvantage || advantage.all || advantage.ability.all || rollFlags.all || rollFlags[abilityId];
  }
  if (disadvantage.ability || disadvantage.all) {
    const rollFlags = (disadvantage.ability && disadvantage.ability[rollType]) ?? {};
    withDisadvantage = withDisadvantage || disadvantage.all || disadvantage.ability.all || rollFlags.all || rollFlags[abilityId];
  }
  options.advantage = withAdvantage && !withDisadvantage;
  options.disadvantage = withDisadvantage && !withAdvantage;
  options.event = {};
  return options;
}

function procAdvantageSkill(actor, skillId, options: Options): Options {
  const midiFlags = actor.data.flags["midi-qol"];
  const advantage = midiFlags?.advantage;
  const disadvantage = midiFlags?.disadvantage;
  var withAdvantage = options.advantage;
  var withDisadvantage = options.disadvantage;
  if (advantage?.skill) {
    const rollFlags = advantage.skill
    withAdvantage = withAdvantage || advantage.all || rollFlags?.all || (rollFlags && rollFlags[skillId]);
  }
  if (disadvantage?.skill) {
    const rollFlags = disadvantage.skill
    withDisadvantage = withDisadvantage || disadvantage.all || rollFlags?.all || (rollFlags && rollFlags[skillId])
  }
  options.advantage = withAdvantage && !withDisadvantage;
  options.disadvantage = withDisadvantage && !withAdvantage;
  return options;
}

function midiATRefresh(wrapped) {
  templateTokens(this)
  return wrapped();
}

export function readyPatching() {
  libWrapper.register("midi-qol", "game.dnd5e.canvas.AbilityTemplate.prototype.refresh", midiATRefresh, "WRAPPER")
}

export let visionPatching = () => {
  const patchVision = isNewerVersion(game.data.version, "0.7.0") && game.settings.get("midi-qol", "playerControlsInvisibleTokens")
  if (patchVision) {
    // ui.notifications.warn("Player control vision is deprecated please use the module Your Tokens Visible")
    console.warn("midi-qol | Player control vision is deprecated please use the module Your Tokens Visible")

    log("Patching Token._isVisionSource")
    libWrapper.register("midi-qol", "Token.prototype._isVisionSource", _isVisionSource, "OVERRIDE");

    log("Patching Token.isVisible")
    libWrapper.register("midi-qol", "Token.prototype.isVisible", isVisible, "OVERRIDE");
  }
  log("Vision patching - ", patchVision ? "enabled" : "disabled")
}

export let itemPatching = () => {
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.roll", doItemRoll, "MIXED");
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollAttack", doAttackRoll, "MIXED");
  libWrapper.register("midi-qol", "CONFIG.Item.documentClass.prototype.rollDamage", doDamageRoll, "MIXED");
  libWrapper.register("midi-qol", "CONFIG.Dice.DamageRoll.prototype.configureDamage", configureDamage, "MIXED");
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
    libWrapper.register("midi-qol", "LMRTFYRoller.prototype._tagMessage", _tagMessage, "OVERRIDE");

  }
}

export function _tagMessage(candidate, data, options) {
  let update = { flags: { lmrtfy: { "message": this.data.message, "data": this.data.attach } } };
  candidate.data.update(update);
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
      options = { event: event }
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
  if (this.element.find("button").filter((i, e) => !e.disabled).length === 0)
    this.close();
}
