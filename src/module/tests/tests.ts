import { data } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/module.mjs";
import { completeItemRoll } from "../utils.js";

const actor1Name = "actor1";
const actor2Name = "actor2";
const target1Name = "Orc1";
const target2Name = "Orc2";

export function resetActors() {
  for (let name of [actor1Name, actor2Name, target1Name, target2Name]) {
    const a = getActor(name);
    a.update({ "data.attributes.hp.value": getProperty(a.data.data, "attributes.hp.max") });
  }
}

function getToken(tokenName): Token {
  const token = canvas?.tokens?.placeables.find(t => t.name === tokenName)
  if (!token) throw new Error(`Could not find ${tokenName}`);
  return token;
}

function getActor(tokenName): Actor {
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
  let abilitySave = await actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true });
  if (abilitySave.terms[0].number !== 1) throw new Error(`roll ability save: not 1 dice`);
  setProperty(actor.data, "flags.midi-qol.advantage.all", true);
  abilitySave = await actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true });
  if (abilitySave.terms[0].number !== 2) throw new Error(`roll ability save: not 2 dice for advantage all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.ability.save.all", true);
  abilitySave = await actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true });
  if (abilitySave.terms[0].number !== 2) throw new Error(`roll ability save: not 2 dice for advantage ability.save.all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.ability.save.dex", true);
  abilitySave = await actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true });
  if (abilitySave.terms[0].number !== 2) throw new Error(`roll ability save: not 2 dice for advantage ability.save.dex`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.ability.save.dex", true);
  abilitySave = await actor.rollAbilitySave("str", { chatMessage: false, fastForward: true });
  if (abilitySave.terms[0].number !== 1) throw new Error(`roll ability save: not 1 dice for advantage ability.save.dex rolling str`);
  return true;
}

export async function testRollAbilitySkill() {
  const actor: any = getActor(actor1Name);
  let skillRoll = await actor.rollSkill("prc", { chatMessage: false, fastForward: true });
  if (skillRoll.terms[0].number !== 1) throw new Error(`roll skill prc: not 1 dice`);
  setProperty(actor.data, "flags.midi-qol.advantage.all", true);
  skillRoll = await actor.rollSkill("prc", { chatMessage: false, fastForward: true });
  if (skillRoll.terms[0].number !== 2) throw new Error(`roll ability skill: not 2 dice for advantage all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.skill.all", true);
  skillRoll = await actor.rollSkill("prc", { chatMessage: false, fastForward: true });
  if (skillRoll.terms[0].number !== 2) throw new Error(`roll ability skill: not 2 dice for advantage advantage.skill.all`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.skill.prc", true);
  skillRoll = await actor.rollSkill("prc", { chatMessage: false, fastForward: true });
  if (skillRoll.terms[0].number !== 2) throw new Error(`roll ability skill: not 2 dice for advantage advantage.skill.prc`);
  actor.prepareData();
  setProperty(actor.data, "flags.midi-qol.advantage.skill.prc", true);
  skillRoll = await actor.rollSkill("ath", { chatMessage: false, fastForward: true });
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

export async function testCubContiion() {
  let results: any;
  //@ts-ignore
  const cubInterface: any = game?.cub;
  if (!cubInterface) return false;
  const target = getToken(target2Name);
  const actor = getActor(actor1Name);
  game.user?.updateTokenTargets([target.id]);
  if (cubInterface.hasCondition("Blinded", [target]))
    await cubInterface.removeCondition("Blinded", [target]);
  if (cubInterface.hasCondition("Blinded", [target])) {
    console.warn("test cub condition - pre remove condition failsed")
  }
  await completeItemRoll(actor.items.getName("Cub Test"));
  await busyWait(0.5);

  if (!cubInterface.hasCondition("Blinded", [target])) return false;
  const effect: ActiveEffect | undefined = target.actor?.effects.find(e => e.data.label === "Cub Test");
  results = await target.actor?.deleteEmbeddedDocuments("ActiveEffect", [effect?.id ?? "bad"]);
  // results = await globalThis.DAE.actionQueue.add(target.actor?.deleteEmbeddedDocuments.bind(target.actor),"ActiveEffect", [effect?.id ?? "bad"]);
  await busyWait(0.5);
  if (cubInterface.hasCondition("Blinded", [target])) {
    console.warn("testCubCondition", "Blinded not removed")
    await cubInterface.removeCondition("Blinded", [target]);
    return false;
  }
  return true;
}

export async function testCECondition() {
  let results: any;
  //@ts-ignore
  const ceInterface: any = game.dfreds.effectInterface;
  if (!ceInterface) return false;
  const target = getToken(target2Name);
  const actor = getActor(actor2Name);
  if (!target || !actor) return false;
  game.user?.updateTokenTargets([target.id]);
  if (await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid))
    await ceInterface.removeEffect({ effectName: "Deafened", uuid: target?.actor?.uuid });
  if (await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid)) {
    console.warn("test ce condition - pre remove condition failsed")
  }
  await completeItemRoll(actor.items.getName("CE Test"));
  if (!await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid)) return false;
  const effect: ActiveEffect | undefined = target.actor?.effects.find(e => e.data.label === "CE Test");
  results = await target.actor?.deleteEmbeddedDocuments("ActiveEffect", [effect?.id ?? "bad"]);
  // results = await globalThis.DAE.actionQueue.add(target.actor?.deleteEmbeddedDocuments.bind(target.actor),"ActiveEffect", [effect?.id ?? "bad"]);
  await busyWait(0.1);
  if (await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid)) {
    console.warn("testCECondition", "Deafened not removed")
    await ceInterface.removeEffect({ effectName: "Deafened", uuid: target?.actor?.uuid });
    return false;
  }
  return true;
}

export async function testMacroExecute() {
  const target = getToken(target1Name);
  const actor = getActor(actor2Name);
  if (!target || !actor) return false;
  try {
    let hasEffect: any[] = actor.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
    if (hasEffect?.length > 0) actor.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id))
    hasEffect = target.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
    if (hasEffect?.length > 0) target.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
    game.user?.updateTokenTargets([target.id]);
    await completeItemRoll(actor.items.getName("Macro Execute Test"));
    let flags: any = actor.data.flags["midi-qol"];
    if (flags?.test !== "metest") {
      console.warn("Macro execute test - failed to set flag")
      return false;
    }
    hasEffect = target.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
    if (!hasEffect) {
      console.warn("Macro execute test failed - no active effect applied");
      return false;
    }
    await target.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
    flags = getProperty(actor.data.flags, "midi-qol.test");
    if (flags?.test) {
      console.warn("Macro execute test - failed to unset flag", flags.test)
      return false;
    }
    hasEffect = target.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
    if (hasEffect.length > 0) {
      console.warn("Macro execute test failed - active effect remains");
      return false;
    }
  } finally {
    let hasEffect: any = target.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
    await target.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
    await actor.unsetFlag("midi-qol", "test")
  }
  return true;
}
export async function busyWait(seconds: number) {
  await (new Promise(resolve => setTimeout(resolve, seconds * 1000)));
}