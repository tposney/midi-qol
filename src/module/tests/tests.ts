import { completeItemRoll } from "../utils.js";

const actor1Name = "actor1";
const actor2Name = "actor2";
const target1Name = "Orc1";
const target2Name = "Orc2";

function getToken(tokenName) {
  const token = canvas?.tokens?.placeables.find(t=>t.name === tokenName)
  if (!token) throw new Error(`Could not find ${tokenName}`);
  return token;
}

function getActor(tokenName) {
  const token = getToken(tokenName);
  if (!token.actor) throw new Error(`No actor for token ${tokenName}`);
  token.actor.prepareData();
  return token.actor;
}

function getActorItem(actor, itemName) {
  const item = actor?.items.getName(itemName);
  if (!item) throw new Error(`Could not find item ${itemName} on actor ${actor.name}`);
  return item;
}

export async function testDOW() {
  const actor = getActor(actor2Name);
  const target = getToken(target1Name);
  game.user?.updateTokenTargets([target.id]);
  const item = getActorItem(actor, "Toll the Dead");
  const workflow = await completeItemRoll(item);
  if (!workflow.damageDetail) return false;
  // check the workflow results;
  return true;
}

export async function testRollAbilitySave() { // assume check works if this does
  const actor: any = getActor(actor1Name);
  let abilitySave = await actor.rollAbilitySave("dex", {chatMessage: false, fastForward: true});
  if (abilitySave.terms[0].number !== 1) throw new Error(`roll ability save: not 1 dice`);
  setProperty(actor.data, "flags.midi-qol.advantage.all", true);
  abilitySave = await actor.rollAbilitySave("dex", {chatMessage: false, fastForward: true});
  if (abilitySave.terms[0].number !== 2) throw new Error(`roll ability save: not 2 dice for advantage all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.ability.save.all", true);
  abilitySave = await actor.rollAbilitySave("dex", {chatMessage: false, fastForward: true});
  if (abilitySave.terms[0].number !== 2) throw new Error(`roll ability save: not 2 dice for advantage ability.save.all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.ability.save.dex", true);
  abilitySave = await actor.rollAbilitySave("dex", {chatMessage: false, fastForward: true});
  if (abilitySave.terms[0].number !== 2) throw new Error(`roll ability save: not 2 dice for advantage ability.save.dex`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.ability.save.dex", true);
  abilitySave = await actor.rollAbilitySave("str", {chatMessage: false, fastForward: true});
  if (abilitySave.terms[0].number !== 1) throw new Error(`roll ability save: not 1 dice for advantage ability.save.dex rolling str`);
  return true;
}

export async function testRollAbilitySkill() {
  const actor: any = getActor(actor1Name);
  let skillRoll = await actor.rollSkill("prc", {chatMessage: false, fastForward: true});
  if (skillRoll.terms[0].number !== 1) throw new Error(`roll skill prc: not 1 dice`);
  setProperty(actor.data, "flags.midi-qol.advantage.all", true);
  skillRoll = await actor.rollSkill("prc", {chatMessage: false, fastForward: true});
  if (skillRoll.terms[0].number !== 2) throw new Error(`roll ability skill: not 2 dice for advantage all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.skill.all", true);
  skillRoll = await actor.rollSkill("prc", {chatMessage: false, fastForward: true});
  if (skillRoll.terms[0].number !== 2) throw new Error(`roll ability skill: not 2 dice for advantage advantage.skill.all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.skill.prc", true);
  skillRoll = await actor.rollSkill("prc", {chatMessage: false, fastForward: true});
  if (skillRoll.terms[0].number !== 2) throw new Error(`roll ability skill: not 2 dice for advantage advantage.skill.prc`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.skill.prc", true);
  skillRoll = await actor.rollSkill("ath", {chatMessage: false, fastForward: true});
  if (skillRoll.terms[0].number !== 1) throw new Error(`roll ability save: not 1 dice for advantage advantage.save.prc rolling ath`);
  return true;
}

export async function testRollNoParams() {
  const actor = getActor(actor2Name);
  const target = getToken(target2Name);
  const item = getActorItem(actor, "Longsword");
  game.user?.updateTokenTargets([target.id]);
  const workflow = await completeItemRoll(item);
  return true;
}