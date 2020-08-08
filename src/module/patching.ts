//@ts-ignore
import Item5e from "/systems/dnd5e/module/item/entity.js";
//@ts-ignore
import Actor5e from "/systems/dnd5e/module/actor/entity.js";

import { log, warn } from "../midi-qol";
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


export let initPatching = () => {
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
  /*
  log("Patching item.roll()");
  Item5e.prototype.__roll = oldItemRoll;
  let itemRollProxy = new Proxy(oldItemRoll, {
    apply: (target, thisValue, args) => doItemRoll.bind(thisValue)(...args)
  })
  Item5e.prototype.roll = itemRollProxy;

  log("Patching item.rollAttack()");
  Item5e.prototype.__rollAttack = oldItemRollAttack;
  let itemRollAttackProxy = new Proxy(oldItemRollAttack, {
    apply: (target, thisValue, args) => doAttackRoll.bind(thisValue)(...args)
  })
  Item5e.prototype.rollAttack = itemRollAttackProxy;

  log("Patching item.rollDamage()");
  Item5e.prototype.__rollDamage = oldItemRollDamage;
  let itemRollDamageProxy = new Proxy(oldItemRollDamage, {
    apply: (target, thisValue, args) => doDamageRoll.bind(thisValue)(...args)
  })
  Item5e.prototype.rollDamage = itemRollDamageProxy;
  */
}
