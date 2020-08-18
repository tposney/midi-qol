//@ts-ignore
import Item5e from "/systems/dnd5e/module/item/entity.js";
//@ts-ignore
import Actor5e from "/systems/dnd5e/module/actor/entity.js";

import { log, warn, debug } from "../midi-qol";
import { Workflow } from "./workflow";
import { doItemRoll, doAttackRoll, doDamageRoll } from "./itemhandling";


export const rollMappings = {
  "itemRoll" : {roll: Item5e.prototype.roll, methodName: "roll", class: Item5e, replacement: doItemRoll},
  "itemAttack": {roll: Item5e.prototype.rollAttack, methodName: "rollAttack", class: Item5e, replacement: doAttackRoll},
  "itemDamage": {roll: Item5e.prototype.rollDamage, class: Item5e, methodName: "rollDamage", replacement: doDamageRoll},
  "applyDamage": {roll: Actor5e.prototype.applyDamage, class: Actor5e}
}

const oldItemRoll = Item5e.prototype.roll;
const oldItemRollAttack = Item5e.prototype.rollAttack;
const oldItemRollDamage = Item5e.prototype.rollDamage;

function restrictVisibility() {
  debug("proxy restrictVisibility");
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
    console.log("dae | Patching SightLayer.restrictVisibility")
    //@ts-ignore
    let restrictVisibilityProxy = new Proxy(SightLayer.prototype.restrictVisibility, {
      apply: (target, thisvalue, args) =>
          restrictVisibility.bind(thisvalue)(...args)
    })
    //@ts-ignore
    SightLayer.prototype.restrictVisibility = restrictVisibilityProxy;

    console.log("dae | Patching SightLayer._isTokenVisionSource")
    //@ts-ignore
    let _isTokenVisionSourceProxy = new Proxy(SightLayer.prototype._isTokenVisionSource, {
      apply: (target, thisvalue, args) =>
      _isTokenVisionSource.bind(thisvalue)(...args)
    })
    //@ts-ignore
    SightLayer.prototype._isTokenVisionSource = _isTokenVisionSourceProxy;
  }
}

export let readyPatching = () => {

  let ItemClass = CONFIG.Item.entityClass;
  let ActorClass = CONFIG.Actor.entityClass;

  ["itemRoll", "itemAttack", "itemDamage"].forEach(rollId => {
    log("Pathcing ", rollId, rollMappings[rollId]);
    let rollMapping = rollMappings[rollId]
    rollMapping.class.prototype[rollMapping.methodName] = new Proxy(rollMapping.roll, {
            apply: (target, thisValue, args) => rollMapping.replacement.bind(thisValue)(...args)
    })
  });
  console.log("After patching roll mappings are ", rollMappings)
}