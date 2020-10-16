import { log, warn, debug, i18n, error } from "../midi-qol";
import { Workflow, noKeySet } from "./workflow";
import { doItemRoll, doAttackRoll, doDamageRoll } from "./itemhandling";
import { configSettings, autoFastForwardAbilityRolls } from "./settings.js";


export var rollMappings;
var oldActorUseSpell;
async function doUseSpell(item, ...args) {
  const shouldAllowRoll = !configSettings.requireTargets // we don't care about targets
    || (game.user.targets.size > 0) // there are some target selected
    || (item.data.data.target?.type === "self") // self target
    || (item.hasAreaTarget && configSettings.autoTarget) // area effectspell and we will auto target
    || (configSettings.rangeTarget && item.data.data.target?.units === "ft" && ["creature", "ally", "enemy"].includes(item.data.data.target?.type)); // rangetarget
  if (!shouldAllowRoll) {
    ui.notifications.warn(i18n("midi-qol.noTargets"));
    warn(`${game.username} attempted to roll with no targets selected`)
    return;
  }
  return rollMappings.useSpell.roll.bind(this)(item, ...args)
}

function restrictVisibility() {
  // Tokens
  for ( let t of canvas.tokens.placeables ) {
    // ** TP  t.visible = ( !this.tokenVision && !t.data.hidden ) || t.isVisible;
    // t.visible = ( !this.tokenVision && !t.data.hidden ) || t.isVisible;
    // t.visalbe = t.visible || (t.data.stealth && t.actor?.hasPerm(game.user, "OBSERVER"));
    t.visible = !this.tokenVision && (!t.data.hidden || t.actor?.hasPerm(game.user, "OWNER"));
  }

  // Door Icons
  for ( let d of canvas.controls.doors.children ) {
    d.visible = !this.tokenVision || d.isVisible;
  }
}

function _isVisionSource() {
  debug("proxy _isVisionSource");
  log("proxy _isVisionSource", this);

  if ( !canvas.sight.tokenVision || !this.hasSight ) return false;

  // Only display hidden tokens for the GM
  const isGM = game.user.isGM;
  // TP insert
  if (this.data.hidden && !(isGM || this.actor?.hasPerm(game.user, "OWNER"))) return false;

  // Always display controlled tokens which have vision
  if ( this._controlled ) return true;

  // Otherwise vision is ignored for GM users
  if ( isGM ) return false;

  // If a non-GM user controls no other tokens with sight, display sight anyways
  const canObserve = this.actor && this.actor.hasPerm(game.user, "OBSERVER");
  if ( !canObserve ) return false;
  const others = canvas.tokens.controlled.filter(t => t.hasSight);
//TP ** const others = this.layer.controlled.filter(t => !t.data.hidden && t.hasSight);
  return !others.length;
}
var oldRollSkill;

function doRollSkill(skillId, options={event}) {
  if (autoFastForwardAbilityRolls && (!options?.event || noKeySet(options.event))) {
    //@ts-ignore
    // options.event = mergeObject(options.event, {shiftKey: true}, {overwrite: true, inplace: true})
    options.event = {shiftKey: true, altKey:false, ctrlKey: false, metaKey: false};
  }
  return oldRollSkill.bind(this)(skillId, options)
}


var oldRollAbilitySave;
var oldRollAbilityTest;

function doAbilityRoll(func, abilityId, options={event}) {
  warn("roll ", options)
  if (autoFastForwardAbilityRolls && (!options?.event || noKeySet(options.event))) {
    //@ts-ignore
    // options.event = mergeObject(options.event, {shiftKey: true}, {overwrite: true, inplace: true})
    options.event = {shiftKey: true, altKey:false, ctrlKey: false, metaKey: false};

  }
  return func.bind(this)(abilityId, options)
}
function rollAbilityTest(abilityId, options={event: {}})  {
   return doAbilityRoll.bind(this)(oldRollAbilityTest, abilityId, options)
}

function rollAbilitySave(abilityId, options={event: {}})  {
  return doAbilityRoll.bind(this)(oldRollAbilitySave, abilityId, options)
}

export let visionPatching = () => {
  if (isNewerVersion(game.data.version, "0.7.0") && game.settings.get("midi-qol", "playerControlsInvisibleTokens")) {
    warn("midi-qol | Patching SightLayer.restrictVisibility")
    //@ts-ignore
    let restrictVisibilityProxy = new Proxy(SightLayer.prototype.restrictVisibility, {
      apply: (target, thisvalue, args) =>
          restrictVisibility.bind(thisvalue)(...args)
    })
    //@ts-ignore
    SightLayer.prototype.restrictVisibility = restrictVisibilityProxy;

    warn("midi-qol | Patching Token._isVisionSource")
    //@ts-ignore
    let _isVisionSourceProxy = new Proxy(Token.prototype._isVisionSource, {
      apply: (target, thisvalue, args) =>
      _isVisionSource.bind(thisvalue)(...args)
    })
    //@ts-ignore
    Token.prototype._isVisionSource = _isVisionSourceProxy;
  }
}

export let itemPatching = () => {

  let ItemClass = CONFIG.Item.entityClass;
  let ActorClass = CONFIG.Actor.entityClass;

  rollMappings = {
    //@ts-ignore
    "itemRoll" : {roll: ItemClass.prototype.roll, methodName: "roll", class: CONFIG.Item.entityClass, replacement: doItemRoll},
    //@ts-ignore
    "itemAttack": {roll: ItemClass.prototype.rollAttack, methodName: "rollAttack", class: CONFIG.Item.entityClass, replacement: doAttackRoll},
    //@ts-ignore
    "itemDamage": {roll: ItemClass.prototype.rollDamage, methodName: "rollDamage", class: CONFIG.Item.entityClass, replacement: doDamageRoll},
  //  "itemDamage": {roll: Item5e.prototype.rollDamage, methodName: "rollDamage", class: Item5e, replacement: doDamageRoll},
    //@ts-ignore
    "useSpell": {roll: ActorClass.prototype.useSpell, methodName: "useSpell", class: CONFIG.Actor.entityClass, replacement: doUseSpell},
    //@ts-ignore
    "applyDamage": {roll: ActorClass.prototype.applyDamage, class: CONFIG.Actor.entityClass}
  };
  ["itemAttack", "itemDamage", "useSpell", "itemRoll"].forEach(rollId => {
    log("Patching ", rollId, rollMappings[rollId]);
    let rollMapping = rollMappings[rollId];
    rollMappings[rollId].class.prototype[rollMapping.methodName] = rollMapping.replacement;
  })
  debug("After patching roll mappings are ", rollMappings);
}

export let setupPatching = () => {
  //@ts-ignore
  oldRollAbilitySave = CONFIG.Actor.entityClass.prototype.rollAbilitySave;
  //@ts-ignore
  oldRollAbilityTest = CONFIG.Actor.entityClass.prototype.rollAbilityTest;
  //@ts-ignore
  oldRollSkill = CONFIG.Actor.entityClass.prototype.rollSkill;

  log("Patching rollAbilitySave")
  //@ts-ignore
  CONFIG.Actor.entityClass.prototype.rollAbilitySave = rollAbilitySave;
  log("Patching rollAbilityTest")
  //@ts-ignore
  CONFIG.Actor.entityClass.prototype.rollAbilityTest = rollAbilityTest;
  log("Patching rollSkill");
  //@ts-ignore
  CONFIG.Actor.entityClass.prototype.rollSkill = doRollSkill;
}