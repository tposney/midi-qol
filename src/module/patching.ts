import { log, warn, debug, i18n, error } from "../midi-qol";
import { doItemRoll, doAttackRoll, doDamageRoll, templateTokens } from "./itemhandling";
import { configSettings, autoFastForwardAbilityRolls } from "./settings.js";
import { expireRollEffect, testKey } from "./utils";
import { installedModules } from "./setupModules";
import { libWrapper } from "./lib/shim.js";

var d20Roll;

function restrictVisibility() {
  // Tokens
  for ( let t of canvas.tokens.placeables ) {
    // ** TP  t.visible = ( !this.tokenVision && !t.data.hidden ) || t.isVisible;
    // t.visible = ( !this.tokenVision && !t.data.hidden ) || t.isVisible;
    // t.visalbe = t.visible || (t.data.stealth && t.actor?.hasPerm(game.user, "OBSERVER"));
    t.visible = ( !this.tokenVision && !t.data.hidden ) || t.isVisible || (t.actor?.hasPerm(game.user, "OWNER"));
  }

  // Door Icons
  for ( let d of canvas.controls.doors.children ) {
    d.visible = !this.tokenVision || d.isVisible;
  }

  // Dispatch a hook that modules can use
  Hooks.callAll("sightRefresh", this);
}

function _isVisionSource() {
  // log("proxy _isVisionSource", this);

  if ( !canvas.sight.tokenVision || !this.hasSight ) return false;

  // Only display hidden tokens for the GM
  const isGM = game.user.isGM;
  // TP insert
  // console.error("is vision source ", this.actor?.name, this.actor?.hasPerm(game.user, "OWNER"))
  if (this.data.hidden && !(isGM || this.actor?.hasPerm(game.user, "OWNER"))) return false;

  // Always display controlled tokens which have vision
  if ( this._controlled ) return true;

  // Otherwise vision is ignored for GM users
  if ( isGM ) return false;

  if (this.actor?.hasPerm(game.user, "OWNER")) return true;
  // If a non-GM user controls no other tokens with sight, display sight anyways
  const canObserve = this.actor && this.actor.hasPerm(game.user, "OBSERVER");
  if ( !canObserve ) return false;
  const others = canvas.tokens.controlled.filter(t => t.hasSight);
//TP ** const others = this.layer.controlled.filter(t => !t.data.hidden && t.hasSight);
  return !others.length;
}

function isVisible() {
  // console.error("Doing my isVisible")
  const gm = game.user.isGM;
  if (this.actor?.hasPerm(game.user, "OWNER")) {
//     this.data.hidden = false;
    return true;
  } 
  if ( this.data.hidden ) return gm || this.actor?.hasPerm(game.user, "OWNER");
  if (!canvas.sight.tokenVision) return true;
  if ( this._controlled ) return true;
  const tolerance = Math.min(this.w, this.h) / 4;
  return canvas.sight.testVisibility(this.center, {tolerance});
}

export const advantageEvent = {shiftKey: false, altKey: true, ctrlKey: false, metaKey: false, fastKey: false};
export const disadvantageEvent = {shiftKey: false, altKey:false, ctrlKey: true, metaKey: true, fastKey: false};
export const fastforwardEvent = {shiftKey: false, altKey:false, ctrlKey: false, metaKey: false, fastKey: true};
export const baseEvent = {shiftKey: false, altKey:false, ctrlKey: false, metaKey: false, fastKey: false};

function mapSpeedKeys(event) {
  if (configSettings.speedItemRolls && configSettings.speedAbilityRolls && !installedModules.get("betterrolls5e")) {
    if (game.system.id === "sw5e")  {
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

function doRollSkill(wrapped, ...args) {
  const [ skillId, options = {event: {}, parts: [], avantage: false, disadvantage: false} ] = args;
  options.event = mapSpeedKeys(options.event);
  let procOptions = procAdvantage(this, "check", this.data.data.skills[skillId].ability, options)
  procOptions = procAdvantageSkill(this, skillId, procOptions)
   if (procAutoFailSkill(this, skillId) || procAutoFail(this, "check", this.data.data.skills[skillId].ability))
  {
    options.parts = ["-100"];
  }
  options.event = {};
  let result =  wrapped.call(this, skillId, procOptions);
  expireRollEffect.bind(this)("Skill", skillId);
  return result;
}

function rollDeathSave(wrapped, ...args) {
  const [ options ] = args;
  const event = mapSpeedKeys(options.event);
  const advFlags = getProperty(this.data.flags, "midi-qol")?.advantage ?? {};
  const disFlags = getProperty(this.data.flags, "midi-qol")?.disadvantage ?? {};
  var withAdvantage = options.event?.altKey || options.advantage;
  var withDisadvantage = options.event?.ctrlKey || options.event?.metaKey || options.disadvantage;
  options.fastForward = autoFastForwardAbilityRolls ? !options.event.fastKey : options.event.fastKey;
  withAdvantage = advFlags.deathSave || advFlags.all;
  withDisadvantage = disFlags.deathSave || disFlags.all;
  options.advantage = withAdvantage && !withDisadvantage;
  options.disadvantage = withDisadvantage && ! withAdvantage;
  options.event = {};
  
  if (options.advantage && options.disadvantage) {
    options.advantage = options.disadvantage = false;
  }
  return wrapped.call(this, ...args);
}

function rollAbilityTest(wrapped, ...args)  {
  const [ abilityId, options={event: {}, parts: []} ] = args;
  if (procAutoFail(this, "check", abilityId)) options.parts = ["-100"];
  options.event = mapSpeedKeys(options.event);
  let procOptions = procAdvantage(this, "check", abilityId, options);
  options.event = {};
  const flags = getProperty(this.data.flags, "midi-qol.MR.ability") ?? {};
  const minimumRoll = (flags.check && (flags.check.all|| flags.save[abilityId])) ?? 0;
  let result = wrapped.call(this, abilityId, procOptions)
  expireRollEffect.bind(this)("Check", abilityId);
  return result;
}

function rollAbilitySave(wrapped, ...args)  {
  const [ abilityId, options={event: {}, parts: [],} ] = args;
  if (procAutoFail(this, "save", abilityId)) {
    options.parts = ["-100"];
  }
  options.event = mapSpeedKeys(options.event);
  let procOptions = procAdvantage(this, "save", abilityId, options);
  //@ts-ignore
  const flags = getProperty(this.data.flags, "midi-qol.MR.ability") ?? {};
  const minimumRoll = (flags.save && (flags.save.all|| flags.save[abilityId])) ?? 0;
  let result = wrapped.call(this, abilityId, procOptions);
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
  options.disadvantage = withDisadvantage && ! withAdvantage;
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
  options.disadvantage = withDisadvantage && ! withAdvantage;
  return options;
}

function midiATRefresh(wrapped)  {
  templateTokens(this)
  return wrapped();
}

export function readyPatching() {
  libWrapper.register("midi-qol", "game.dnd5e.canvas.AbilityTemplate.prototype.refresh", midiATRefresh, "WRAPPER")
}

export let visionPatching = () => {
  const patchVision = isNewerVersion(game.data.version, "0.7.0") && game.settings.get("midi-qol", "playerControlsInvisibleTokens")
  if (patchVision) {
    // ui.notifications.warn("This setting is deprecated please switch to Conditional Visibility")
    console.warn("midi-qol | Player controls tokens setting is deprecated please switch to Conditional Visibility")

      log("Patching SightLayer._restrictVisibility")
      libWrapper.register("midi-qol", "SightLayer.prototype.restrictVisibility", restrictVisibility, "OVERRIDE");

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
      log("Patching rollAbilitySave")
      libWrapper.register("midi-qol", "LMRTFYRoller.prototype._makeRoll", _makeRoll, "OVERRIDE");
      libWrapper.register("midi-qol", "LMRTFYRoller.prototype._tagMessage", _tagMessage, "OVERRIDE");

  }
}

export function _tagMessage(candidate, data, options) {
  setProperty(data, "flags.lmrtfy", {"message": this.data.message, "data": this.data.attach});
}

export function _makeRoll(event, rollMethod, ...args) {
  let options;
  switch(this.advantage) {
      case -1: 
        options = {disadvantage: true, fastForward: true};
        break;
      case 0:
        options = {fastForward: true};
        break;
      case 1:
        options = {advantage: true, fastForward: true};
        break;
       case 2: 
        options = {event: event}
        break;
  }
  const rollMode = game.settings.get("core", "rollMode");
  game.settings.set("core", "rollMode", this.mode || CONST.DICE_ROLL_MODES);
  for (let actor of this.actors) {
      Hooks.once("preCreateChatMessage", this._tagMessage.bind(this));
      actor[rollMethod].call(actor, ...args, options);                        
  }
  game.settings.set("core", "rollMode", rollMode);
  event.currentTarget.disabled = true;
  if (this.element.find("button").filter((i, e) => !e.disabled).length === 0)
      this.close();
}
