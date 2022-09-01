import { applySettings } from "../apps/ConfigPanel.js";
import { completeItemUse } from "../utils.js";

const actor1Name = "actor1";
const actor2Name = "actor2";
const target1Name = "Orc1";
const target2Name = "Orc2";
const target3Name = "Skeleton1";

export async function busyWait(seconds: number) {
  await (new Promise(resolve => setTimeout(resolve, seconds * 1000)));
}
export async function resetActors() {
  for (let name of [actor1Name, actor2Name, target1Name, target2Name, target3Name]) {
    const a = getActor(name);
    //@ts-ignore .system
    await a.update({ "data.attributes.hp.value": getProperty(a.system, "attributes.hp.max") });
  }
}

export function getToken(tokenName): Token | undefined {
  const token = canvas?.tokens?.placeables.find(t => t.name === tokenName)
  return token;
}

export function getActor(tokenName): Actor {
  const token = getToken(tokenName);
  if (token?.actor) {
    token.actor.prepareData();
    return token.actor;
  };
  const actor = game.actors?.getName(tokenName);
  if (!actor) throw new Error(`No such actor ${tokenName}`)
  actor?.prepareData();
  return actor;
}

export function getActorItem(actor, itemName) {
  const item = actor?.items.getName(itemName);
  if (!item) throw new Error(`Could not find item ${itemName} on actor ${actor.name}`);
  return item;
}
export function setupMidiTests() {
  if (!game?.user?.isGM) return;
  //@ts-ignore .title v10
  if (game.world.title !== "midi tests - quench") return;
  const actor1 = getActor(actor1Name);
  const actor2 = getActor(actor2Name);
  const token1 = getToken(target1Name);
  const token2 = getToken(target2Name);
  if (!(actor1 && actor2 && token1 && token2)) {
    console.warn("midi-qol | test setup failed ", actor1, actor2, token1, token2);
    return;
  }
  registerTests();
}
// Hooks.on("quenchReady", registerTests);

function addEffect(actor: any, changes: any[]) {
}


async function registerTests() {
  if (globalThis.quench) {
    //@ts-ignore
    await globalThis.game.messages.documentClass.deleteDocuments([], { deleteAll: true });

    applySettings("FullAuto");
    globalThis.quench.registerBatch(
      "quench.midi-qol.tests",
      (context) => {
        const { describe, it, assert } = context;

        describe("Damage Only Workflow", function () {
          it("apply a DamageOnlyWorkflow", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target: Token | undefined = getToken(target1Name);
            assert(target && !!target?.actor)
            game.user?.updateTokenTargets([target?.id ?? ""]);
            const item = getActorItem(actor, "Toll the Dead");
            if (target?.actor) await target.actor.setFlag("midi-qol", "fail.ability.save.all", true);
            try {
              const workflow = await completeItemUse(item)
              target?.actor?.unsetFlag("midi-qol", "fail.ability.save.all");
              assert.ok(!!workflow);
            } catch (err) {
              console.error("Damage Only Workflow Error", err);
              assert.ok(false);
            } finally {
            }
          });
        });
      },
      { displayName: "Midi Tests DOW" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.abilityrolls",
      (context) => {
        const { describe, it, assert, expect } = context;
        const actor: any = getActor(actor1Name);

        describe("skill roll tests", function () {
          it("roll perception - 1 dice", function () {
            console.log("Actor flags are ", duplicate(actor.flags))
            return actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              // .then(skillRoll => { actor.prepareData(); assert.equal(skillRoll.terms[0].number, 1) });
              .then(skillRoll => { actor.prepareData(); expect(skillRoll.terms[0].number).to.equal(1) });
          });

          it("roll perception - adv.all", async function () {
            setProperty(actor, "flags.midi-qol.advantage.all", true);
            const result = await actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { delete actor.flags["midi-qol"].advantage.all; actor.prepareData(); assert.equal(skillRoll.terms[0].number, 2) });
              return result
            });
          it("roll perception - adv.skill.all", async function () {
            setProperty(actor, "flags.midi-qol.advantage.skill.all", true);
            const result = await actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { delete actor.flags["midi-qol"].advantage.skill.all; actor.prepareData(); assert.equal(skillRoll.terms[0].number, 2) });
            return result;

          });
          it("roll perception - adv.skill.prc", async function () {
            setProperty(actor, "flags.midi-qol.advantage.skill.prc", true);
            const result = await actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { delete actor.flags["midi-qol"].advantage.skill.prc; actor.prepareData(); assert.equal(skillRoll.terms[0].number, 2) });
            return result;
          });
          it("roll perception - adv.skill.ath", async function () {
            setProperty(actor, "flags.midi-qol.advantage.skill.ath", true);
            return actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { delete actor.flags["midi-qol"].advantage.skill.ath; actor.prepareData(); assert.equal(skillRoll.terms[0].number, 1) });
          });
          it("roll acr skill min = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor, "flags.midi-qol.min.skill.all", 10);
              const result = await actor.rollSkill("acr", { chatMessage: false, fastForward: true });
              assert.ok(result.total >= 10);
              delete actor.flags["midi-qol"].min.skill.all;
              return result;
            }
          })
          it("roll per skill max = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor, "flags.midi-qol.max.skill.all", 10);
              const result = await actor.rollSkill("per", { chatMessage: false, fastForward: true });
              assert.ok(result.total <= 10)
              delete actor.flags["midi-qol"].max.skill.all

              return result;
            }
          });

        });
        describe("initiative rolls", function () {
          it("rolls a normal initiative roll", async function () {
            const rollResult: Promise<Roll> = new Promise(async (resolve) => {
              Hooks.once("createChatMessage", function (chatMessage) {
                resolve(chatMessage.rolls[0])
              });

            });
            const combat = await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
            await combat.delete();
            const roll: Roll = await rollResult;
            //@ts-ignore
            assert.equal(roll.terms[0].results.length, 1);
          });
          it("rolls an advantage initiative roll", async function () {
            await actor.setFlag(game.system.id, "initiativeAdv", true);
            const rollResult: Promise<Roll> = new Promise(async (resolve) => {
              Hooks.once("createChatMessage", function (chatMessage) {
                resolve(chatMessage.rolls[0])
              });

            });
            const combat = await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
            await combat.delete();
            const roll: Roll = await rollResult;
            await actor.unsetFlag(game.system.id, "initiativeAdv");
            //@ts-ignore
            assert.equal(roll.terms[0].results.length, 2);
            assert.ok(roll.formula.startsWith("2d20kh"));
          });
          it("rolls a disadvantage initiative roll", async function () {
            await actor.setFlag(game.system.id, "initiativeDisadv", true);
            const rollResult: Promise<Roll> = new Promise(async (resolve) => {
              Hooks.once("createChatMessage", function (chatMessage) {
                resolve(chatMessage.rolls[0])
              });

            });
            const combat = await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
            await combat.delete();
            const roll: Roll = await rollResult;
            await actor.unsetFlag(game.system.id, "initiativeDisadv");
            //@ts-ignore
            assert.equal(roll.terms[0].results.length, 2);
            assert.ok(roll.formula.startsWith("2d20kl"));
          });
        })
        describe("save roll tests", function () {
          it("roll dex save - 1 dice", async function () {
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { actor.prepareData(); assert.equal(abilitySave.terms[0].number, 1) });
          });
          it("roll dex save - adv.all", async function () {
            setProperty(actor, "flags.midi-qol.advantage.all", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { delete actor.flags["midi-qol"].advantage.all; actor.prepareData(); assert.equal(abilitySave.terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.all", async function () {
            setProperty(actor, "flags.midi-qol.advantage.ability.save.all", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { delete actor.flags["midi-qol"].advantage.ability.save.all; actor.prepareData(); assert.equal(abilitySave.terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.dex", async function () {
            setProperty(actor, "flags.midi-qol.advantage.ability.save.dex", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { delete actor.flags["midi-qol"].advantage.ability.save.dex; actor.prepareData(); assert.equal(abilitySave.terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.str", async function () {
            setProperty(actor, "flags.midi-qol.advantage.ability.save.str", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { delete actor.flags["midi-qol"].advantage.ability.save.dex; actor.prepareData(); assert.equal(abilitySave.terms[0].number, 1) });
          });
          it("roll str save min = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor, "flags.midi-qol.min.ability.save.all", 10);
              const result = await actor.rollAbilitySave("str", { chatMessage: false, fastForward: true });
              delete actor.flags["midi-qol"].min.ability.save.all;
              assert.ok(result.total >= 10)
            }
          })
          it("roll str save max = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor, "flags.midi-qol.max.ability.save.all", 10);
              const result = await actor.rollAbilitySave("str", { chatMessage: false, fastForward: true });
              assert.ok(result.total <= 10)
              delete actor.flags["midi-qol"].max.ability.save.all;
            }
          })

          it("rolls a normal spell saving throw", async function () {
            const actor = getActor(actor1Name);
            const target: Token | undefined = getToken(target1Name);
            assert.ok(target && !!target?.actor && actor)
            game.user?.updateTokenTargets([target?.id ?? ""]);
            const item = actor.items.getName("Saving Throw Test");
            assert.ok(item);
            const workflow = await completeItemUse(item);
            assert.ok(workflow.saveResults.length === 1);
            assert.equal(workflow.saveResults[0].terms[0].results.length, 1);
            assert.ok(workflow.saveResults[0].formula.startsWith("1d20"))
          });
          it("rolls a magic resistance spell saving throw", async function () {
            const actor: any = getActor(actor1Name);
            const target: Token | undefined = getToken(target1Name);
            assert.ok(target && !!target?.actor && actor)
            game.user?.updateTokenTargets([target?.id ?? ""]);
            const item = actor.items.getName("Saving Throw Test");
            assert.ok(item);
            //@ts-ignore .flags v10
            target?.actor && setProperty(target.actor.flags, "midi-qol.magicResistance.all", true)
            const workflow = await completeItemUse(item);
            assert.equal(workflow.saveResults.length, 1);
            assert.equal(workflow.saveResults[0].terms[0].results.length, 2);
            assert.ok(workflow.saveResults[0].formula.startsWith("2d20kh"))
            //@ts-ignore
            delete target.actor.flags["midi-qol"].magicResistance;
          });
          it("rolls a magic vulnerability spell saving throw", async function () {
            const actor: any = getActor(actor1Name);
            const target: Token | undefined = getToken(target1Name);
            assert.ok(target && !!target?.actor && actor)
            game.user?.updateTokenTargets([target?.id ?? ""]);
            const item = actor.items.getName("Saving Throw Test");
            assert.ok(item);
            //@ts-ignore .flags v10
            target?.actor && setProperty(target.actor.flags, "midi-qol.magicVulnerability.all", true)
            const workflow = await completeItemUse(item);
            assert.equal(workflow.saveResults.length, 1);
            assert.equal(workflow.saveResults[0].terms[0].results.length, 2);
            assert.ok(workflow.saveResults[0].formula.startsWith("2d20kl"))
            //@ts-ignore
            delete target.actor.flags["midi-qol"].magicVulnerability;
          });
        });
      },
      { displayName: "Midi Tests Ability Rolls" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.itemRolls",
      (context) => {
        const { describe, it, assert, expect, should } = context;

        describe("Item Roll Tests", async function () {
          it("roll an item with no params", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target = getToken(target2Name);
            const item = getActorItem(actor, "Longsword");
            game.user?.updateTokenTargets([target?.id ?? ""]);
            return completeItemUse(item).then(workflow => assert.ok(!!workflow));
          });

          it("applies cub conditions", async function () {
            let results: any;
            //@ts-ignore
            const cubInterface: any = game?.cub;
            assert.ok(!!cubInterface);
            const target = getToken(target2Name);
            const actor = getActor(actor1Name);
            game.user?.updateTokenTargets([target?.id ?? ""]);
            if (cubInterface.hasCondition("Blinded", [target]))
              await cubInterface.removeCondition("Blinded", [target]);
            assert.ok(!cubInterface.hasCondition("Blinded", [target]));
            assert.ok(!!(await completeItemUse(actor.items.getName("Cub Test"))));
            await busyWait(0.5);
            assert.ok(cubInterface.hasCondition("Blinded", [target]));
            //@ts-ignore .label v10
            const effect: ActiveEffect | undefined = target?.actor?.effects.find(e => e.label === "Cub Test");
            results = await target?.actor?.deleteEmbeddedDocuments("ActiveEffect", [effect?.id ?? "bad"]);
            // results = await globalThis.DAE.actionQueue.add(target.actor?.deleteEmbeddedDocuments.bind(target.actor),"ActiveEffect", [effect?.id ?? "bad"]);
            await busyWait(0.5);
            if (cubInterface.hasCondition("Blinded", [target])) {
              console.warn("testCubCondition", "Blinded not removed")
              await cubInterface.removeCondition("Blinded", [target]);
              return false;
            }
            return true;
          })
          it("applies CE conditions", async function () {
            let results: any;
            //@ts-ignore
            const ceInterface: any = game.dfreds.effectInterface;
            assert.ok(!!ceInterface);
            const target = getToken(target2Name);
            const actor = getActor(actor2Name);
            assert.ok(target && actor);
            game.user?.updateTokenTargets([target?.id ?? ""]);
            if (await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid))
              await ceInterface.removeEffect({ effectName: "Deafened", uuid: target?.actor?.uuid });
            assert.ok(!ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid));
            await completeItemUse(actor.items.getName("CE Test"));
            assert.ok(await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid));
            //@ts-ignore .label v10
            const effect: ActiveEffect | undefined = target?.actor?.effects.find(e => e.label === "CE Test");
            results = await target?.actor?.deleteEmbeddedDocuments("ActiveEffect", [effect?.id ?? "bad"]);
            await busyWait(0.1);
            if (await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid)) {
              console.warn("testCECondition", "Deafened not removed")
              await ceInterface.removeEffect({ effectName: "Deafened", uuid: target?.actor?.uuid });
              return false;
            }
            return true;
          });
          it("applies damage to target", async function () {
            let results: any;
            const target: any = getToken(target2Name);
            const actor = getActor(actor2Name);
            assert.ok(target && actor);
            const oldHp = target?.actor?.system.attributes.hp.value;
            game.user?.updateTokenTargets([target?.id ?? ""]);
            //@ts-ignore .flags v10
            setProperty(actor.flags, "midi-qol.advantage.all", true);
            //@ts-ignore .abilities
            assert.ok(actor.system.abilities.str.mod > 0, "non zero str mod")
            await completeItemUse(actor.items.getName("AppliesDamage"));
            //@ts-ignore .flags v10
            delete actor.flags["midi-qol"].advantage.all;
            const newHp = target?.actor?.system.attributes.hp.value;
            //@ts-ignore
            assert.equal(newHp, oldHp - 10 -actor.system.abilities.str.mod);
            return true;
          });
          it("applies activation condition", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target2: any = getToken(target2Name);
            const target3: any = getToken(target3Name);
            game.user?.updateTokenTargets([target2?.id ?? "", target3?.id ?? ""]);
            const target2hp = target2?.actor?.system.attributes.hp.value;
            const target3hp = target3?.actor?.system.attributes.hp.value;
            await completeItemUse(actor.items.getName("MODTest")); // does 10 + 10 to undead
            const condition2 = target2.actor.effects.contents.filter(ef => ef.label === "Frightened");
            const condition3 = target3.actor.effects.contents.filter(ef => ef.label === "Frightened");
            if (condition2.length) await target2.actor.deleteEmbeddedDocuments("ActiveEffect", condition2.map(ae => ae.id))
            if (condition3.length) await target3.actor.deleteEmbeddedDocuments("ActiveEffect", condition3.map(ae => ae.id))
            assert.equal(target2hp - 10, target2?.actor?.system.attributes.hp.value, "non undead takes 10 hp");
            assert.equal(target3hp - 40, target3?.actor?.system.attributes.hp.value, "undead takes 20 hp"); // 20hp + vulnerability
            assert.equal(condition2.length, 0, "Frightened not applied to non undead");
            assert.equal(condition3.length, 1, "Frightened applied to undead");
          });
          it("applies condition/other damage - no activation", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target2: any = getToken(target2Name);
            const target3: any = getToken(target3Name);
            game.user?.updateTokenTargets([target2?.id ?? "", target3?.id ?? ""]);
            const target2hp = target2?.actor?.system.attributes.hp.value;
            const target3hp = target3?.actor?.system.attributes.hp.value;
            await completeItemUse(actor.items.getName("MODTestNoActivation")); // does 10 + 10 to undead
            const condition2 = target2.actor.effects.contents.filter(ef => ef.label === "Frightened");
            const condition3 = target3.actor.effects.contents.filter(ef => ef.label === "Frightened");
            if (condition2.length) await target2.actor.deleteEmbeddedDocuments("ActiveEffect", condition2.map(ae => ae.id))
            if (condition3.length) await target3.actor.deleteEmbeddedDocuments("ActiveEffect", condition3.map(ae => ae.id))
            assert.equal(target2hp - 20, target2?.actor?.system.attributes.hp.value, "non undead takes 10 hp");
            assert.equal(target3hp - 40, target3?.actor?.system.attributes.hp.value, "undead takes 20 hp"); // 20hp + vulnerability
            assert.equal(condition2.length, 1, "Frghtened applied to non undead");
            assert.equal(condition3.length, 1, "Frightened applied to undead");
          });
        });
        describe("Macro Roll Tests", async function () {
          it("runs macro execute", async function () {
            const target = getToken(target1Name);
            const actor = getActor(actor2Name);
            assert.ok(actor);
            assert.ok(target);
            try {
              //@ts-ignore .label v10
              let hasEffect: any[] = actor.effects.filter(a => a.label === "Macro Execute Test") ?? [];
              if (hasEffect?.length > 0) actor.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id))
              //@ts-ignore .label v10
              hasEffect = target?.actor?.effects.filter(a => a.label === "Macro Execute Test") ?? [];
              if (hasEffect?.length > 0) target?.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              game.user?.updateTokenTargets([target?.id ?? ""]);
              await completeItemUse(actor.items.getName("Macro Execute Test"));
              //@ts-ignore .flags v10
              let flags: any = actor.flags["midi-qol"];
              assert.equal(flags?.test, "metest")
              //@ts-ignore .label v10
              hasEffect = target?.actor?.effects.filter(a => a.label === "Macro Execute Test") ?? [];
              assert.ok(hasEffect);
              await target?.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              //@ts-ignore .flags v10
              flags = getProperty(actor.flags, "midi-qol.test");
              assert.ok(!flags?.test);
              //@ts-ignore .label v10
              hasEffect = target?.actor?.effects.filter(a => a.label === "Macro Execute Test") ?? [];
              assert.equal(hasEffect.length, 0)
            } finally {
              //@ts-ignore .label v10
              let hasEffect: any = target?.actor?.effects.filter(a => a.label === "Macro Execute Test") ?? [];
              await target?.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              await actor.unsetFlag("midi-qol", "test")
            }
            return true;
          });
          it("tests macro.tokenMagic", async function () {
            this.timeout(5000);
            const actor = getActor(actor1Name);
            const effectData = { 
              label: "test effect", 
              changes: [{key: "macro.tokenMagic", mode: 0, value: "blur"}]
            };
            assert.ok(globalThis.TokenMagic);
            const theEffects: any[] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            //@ts-ignore .label v10
            assert.ok(actor.effects.find(ef=>ef.label === effectData.label));
            await busyWait(3);
            const actorToken = canvas?.tokens?.placeables.find(t=> t.name === actor.token?.name ?? actor.name)
            assert.ok(actorToken, "found actor token");
            assert.ok(globalThis.TokenMagic.hasFilterId(actorToken,"blur"), "applied blur effect");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef=>ef.id));
            return true;
          });
          it("tests blur removal", async function() {
            const actor = getActor(actor1Name);
            const actorToken = canvas?.tokens?.placeables.find(t=> t.name === actor.token?.name)
            this.retries(5);
            await busyWait(1);
            assert.equal(globalThis.TokenMagic.hasFilterId(actorToken,"blur"), false, "test blur");
          });
        });
        describe("onUse Macro Tests", async function () {
          it("Calls actor onUseMacros", async function () {
            const actor = getActor(actor2Name);
            const macroPasses: string[] = [];
            const hookid = Hooks.on("OnUseMacroTest", (pass: string) => macroPasses.push(pass));
            await completeItemUse(actor.items.getName("OnUseMacroTest")); // Apply the effect
            const target = getToken(target2Name);
            game.user?.updateTokenTargets([target?.id ?? ""]);
            await completeItemUse(actor.items.getName("Longsword")); // Apply the effect
            Hooks.off("OnUseMacroTest", hookid);
            //@ts-ignore .label v10
            let hasEffects: any = actor.effects.filter(a => a.label === "OnUseMacroTest") ?? [];
            assert.ok(hasEffects);
            await actor.deleteEmbeddedDocuments("ActiveEffect", hasEffects.map(e => e.id))
            console.log(macroPasses);
            // Test for all passes except "all", "template placed"
            assert.equal(macroPasses.length, Object.keys(game.i18n.translations["midi-qol"]["onUseMacroOptions"]).length - 1, "on use macro pass length");
          })

          it("Calls item onUseMacros", async function () {
            const actor = getActor(actor2Name);
            const macroPasses: string[] = [];
            const hookid = Hooks.on("Item OnUseMacroTest", (pass: string) => macroPasses.push(pass));
            await completeItemUse(actor.items.getName("Item OnUseMacroTest"));
            Hooks.off("OnUseMacroTest", hookid);
            console.log(macroPasses);
            assert.equal(JSON.stringify(macroPasses), JSON.stringify(['preItemRoll', "templatePlaced", 'preambleComplete', 'preSave', 'postSave', 'preDamageApplication', 'preActiveEffects', 'postActiveEffects']));
          });
        });
      },
      { displayName: "Midi Item Roll Tests" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.conditionImmunity",
      (context) => {
        const { describe, it, assert } = context;
        const actor: Actor = getActor(actor1Name);
        //@ts-ignore
        const ceInterface: any = game.dfreds?.effectInterface;

        describe("Condition Immunity Tests", async function () {
          it("Tests condition immunity disables effect", async function () {
            if (!ceInterface) assert.ok(false, "Convenient Effects Interface not found")
            await ceInterface.addEffect({ effectName: "Paralyzed", uuid: actor.uuid });
            assert.ok(await ceInterface.hasEffectApplied("Paralyzed", actor?.uuid));
            //@ts-ignore .label v10
            const theEffect: ActiveEffect | undefined = actor.effects.find(ef => ef.label === "Paralyzed");
            assert.ok(theEffect);
            //@ts-ignore .disabled v10
            assert.ok(!theEffect?.disabled);
            await actor.update({ "data.traits.ci.value": ["paralyzed"] });
            //@ts-ignore .disabled v10
            assert.ok(theEffect?.disabled);
            await actor.update({ "data.traits.ci.value": [] });
            //@ts-ignore .disabled v10
            assert.ok(!theEffect?.disabled);
            await ceInterface.removeEffect({ effectName: "Paralyzed", uuid: actor.uuid });
            assert.ok(!(await ceInterface.hasEffectApplied("Paralyzed", actor?.uuid)));

          })
        });
      },
      { displayName: "Midi Condition Immunity Tests" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.overTimeTests",
      (context) => {
        const { describe, it, assert } = context;
        describe("overTime effects", async function() {
          it ("test overtime effect run and removed on combat update", async function() {
            this.timeout(20000);
            let scene = canvas?.scene;
            const cls = getDocumentClass("Combat");
            const combat = await cls.create({scene: scene?.id});
            assert.ok(combat);
            const token = getToken(target2Name);
            assert.ok(token);
            const actor = token?.actor;
            assert.ok(actor);
            const createData = {
              tokenId: token?.id,
              sceneId: token?.scene.id,
              //@ts-ignore .actorId v10
              actorId: token?.document.actorId,
              //@ts-ignore
              hidden: token?.document.hidden
            }
            //@ts-ignore
            const hp = actor?.system.attributes.hp.value;
            await combat?.createEmbeddedDocuments("Combatant", [createData]);
            await combat?.activate();

            const effectData = { 
              label: "test over time", 
              changes: [{key: "flags.midi-qol.OverTime.Test", mode: 0, value: `turn=end,
              removeCondition=true,
              damageRoll=15,
              damageType=acid,
              label=OverTime test`}],
              duration: {rounds: 10}
            }
            const theEffects: any[] | undefined = await actor?.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(theEffects?.length, "Effects created");
            // actor && console.error(getProperty(actor, "data.flags.midi-qol.OverTime.Test"))
            assert.ok(actor && getProperty(actor, "flags.midi-qol.OverTime.Test"), "overtime flag set");

            await combat?.nextRound();
            await busyWait(1);
            //@ts-ignore
            let newHp = actor?.system.attributes.hp.value;
            assert.equal(hp - 15, newHp, "verify hp deduction 1st");
            assert.equal(actor?.effects.contents.length, 0, "check effect is removed");
            await combat?.nextRound();
            await busyWait(1);
            //@ts-ignore
            newHp = actor?.system.attributes.hp.value;
            assert.equal(hp - 15, newHp, "verify hp deduction 2nd");
            await combat?.delete();

          })
        });
      },
      { displayName: "Midi Over Time Tests" }
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.otherTests",
      (context) => {
        const { describe, it, assert } = context;
        describe("midi flag tests", async function() {
          it("sets advantage.all false", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = { 
              label: "test effect", 
              changes: [{key: "flags.midi-qol.advantage.all", mode: 0, value: "false"}]
            }
            const theEffects: any[] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === false, "advantage all false");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef=>ef.id))
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets advantage.all 0", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = { 
              label: "test effect", 
              changes: [{key: "flags.midi-qol.advantage.all", mode: 0, value: "0"}]
            }
            const theEffects: any[] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === false, "advantage all false");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef=>ef.id))
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets advantage.all true", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = { 
              label: "test effect", 
              changes: [{key: "flags.midi-qol.advantage.all", mode: 0, value: "true"}]
            }
            const theEffects: any[] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === true, "advantage all set to true");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef=>ef.id))
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets advantage.all 1", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = { 
              label: "test effect", 
              changes: [{key: "flags.midi-qol.advantage.all", mode: 0, value: "1"}]
            }
            const theEffects: any[] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === true, "advantage all set to true");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef=>ef.id))
            assert.ok(getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets DR.all", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = { 
              label: "test effect", 
              changes: [{key: "flags.midi-qol.DR.all", mode: 0, value: "10"}]
            }
            const theEffects: any[] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.equal("string", typeof getProperty(actor, "flags.midi-qol.DR.all"))
            assert.ok(Number.isNumeric(getProperty(actor, "flags.midi-qol.DR.all")));
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef=>ef.id))
            assert.ok(getProperty(actor, "flags.midi-qol.DR.all") === undefined)
          });

        });
      },
      { displayName: "Midi Other Tests" },
    )
  }
}