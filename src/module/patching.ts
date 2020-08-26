//@ts-ignore
import Item5e from "../../../systems/dnd5e/module/item/entity.js";
//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js";

import { log, warn, debug, i18n } from "../midi-qol";
import { Workflow } from "./workflow";
import { doItemRoll, doAttackRoll, doDamageRoll } from "./itemhandling";
import { configSettings } from "./settings.js";


export const rollMappings = {
  "itemRoll" : {roll: Item5e.prototype.roll, methodName: "roll", class: Item5e, replacement: doItemRoll},
  "itemAttack": {roll: Item5e.prototype.rollAttack, methodName: "rollAttack", class: Item5e, replacement: doAttackRoll},
  "itemDamage": {roll: Item5e.prototype.rollDamage, methodName: "rollDamage", class: Item5e, replacement: doDamageRoll},
  "useSpell": {roll: Actor5e.prototype.useSpell, methodName: "useSpell", class: Actor5e, replacement: doUseSpell},

  "applyDamage": {roll: Actor5e.prototype.applyDamage, class: Actor5e}
}

const oldItemRoll = Item5e.prototype.roll;
const oldItemRollAttack = Item5e.prototype.rollAttack;
const oldItemRollDamage = Item5e.prototype.rollDamage;
const oldActorUseSpell = Actor5e.prototype.useSpell;

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
  oldActorUseSpell.bind(this)(item, ...args)
}

function restrictVisibility() {
  // Tokens
  for ( let t of canvas.tokens.placeables ) {
    // ** TP  t.visible = ( !this.tokenVision && !t.data.hidden ) || t.isVisible;

    t.visible = ( !this.tokenVision && !t.data.hidden ) || t.isVisible || t.actor?.hasPerm(game.user, "OWNER");
  }

  // Door Icons
  for ( let d of canvas.controls.doors.children ) {
    d.visible = !this.tokenVision || d.isVisible;
  }
}

function _isTokenVisionSource(token:Token) {
  debug("proxy _isTokenVisionSource");
  if ( !this.tokenVision || !token.hasSight ) return false;

  // Only display hidden tokens for the GM
  const isGM = game.user.isGM;

  // ** TP if (token.data.hidden && !(game.user.isGM)) return false;
  if (token.data.hidden && !(isGM || token.actor?.hasPerm(game.user, "OWNER"))) return true;

  // Always display controlled tokens which have vision
  //@ts-expect-error _controlled
  if ( token._controlled ) return true;

  // Otherwise vision is ignored for GM users
  if ( isGM ) return false;
  // If a non-GM user controls no other tokens with sight, display sight anyways
  const canObserve = token.actor && token.actor.hasPerm(game.user, "OBSERVER");
  if ( !canObserve ) return false;

  const others = canvas.tokens.controlled.filter(t => t.hasSight);
  // ** TP const others = canvas.tokens.controlled.filter(t => !t.data.hidden && t.hasSight);

  return !others.length;
}

export let initPatching = () => {
  if (isNewerVersion(game.data.version, "0.7.0") && game.settings.get("midi-qol", "playerControlsInvisibleTokens")) {
    warn("midi-qol | Patching SightLayer.restrictVisibility")
    //@ts-ignore
    let restrictVisibilityProxy = new Proxy(SightLayer.prototype.restrictVisibility, {
      apply: (target, thisvalue, args) =>
          restrictVisibility.bind(thisvalue)(...args)
    })
    //@ts-ignore
    SightLayer.prototype.restrictVisibility = restrictVisibilityProxy;

    warn("midi-qol | Patching SightLayer._isTokenVisionSource")
    //@ts-ignore
    let _isTokenVisionSourceProxy = new Proxy(SightLayer.prototype._isTokenVisionSource, {
      apply: (target, thisvalue, args) =>
      _isTokenVisionSource.bind(thisvalue)(...args)
    })
    //@ts-ignore
    SightLayer.prototype._isTokenVisionSource = _isTokenVisionSourceProxy;
  }
  CONFIG.sounds["midi-qol.fail1"] ="./modules/midi-qol/sounds/fail1.wav";
  CONFIG.sounds["midi-qol.fail2"] ="./modules/midi-qol/sounds/fail2.wav";
  CONFIG.sounds["midi-qol.fail3"] ="./modules/midi-qol/sounds/fail3.ogg";
  CONFIG.sounds["midi-qol.critical1"] ="./modules/midi-qol/sounds/success-drums.ogg";
  CONFIG.sounds["midi-qol.critical2"] ="./modules/midi-qol/sounds/success.wav";
  CONFIG.sounds["midi-qol.critical3"] ="./modules/midi-qol/sounds/good-results.ogg";
}

export let readyPatching = () => {

  let ItemClass = CONFIG.Item.entityClass;
  let ActorClass = CONFIG.Actor.entityClass;

  ["itemRoll", "itemAttack", "itemDamage", "useSpell"].forEach(rollId => {
    log("Pathcing ", rollId, rollMappings[rollId]);
    let rollMapping = rollMappings[rollId];
    // rollMapping.roll = rollMapping.class.prototype[rollMapping.methodName];
    rollMapping.class.prototype[rollMapping.methodName] = new Proxy(rollMapping.roll, {
            apply: (target, thisValue, args) => rollMapping.replacement.bind(thisValue)(...args)
    })
  });
  debug("After patching roll mappings are ", rollMappings)

  CONFIG.DND5E.weaponProperties["mgc"] = "Magical";
  // create({src, preload=false, autoplay=false, volume=0.0, loop=false} = {}) {

  // AudioHelpler.create({src})

}