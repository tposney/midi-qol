import { channelConfig } from "simple-peer";
import { tokenToString } from "typescript";
import { applySettings } from "../apps/ConfigPanel.js";
import { completeItemRoll } from "../utils.js";

const actor1Name = "actor1";
const actor2Name = "actor2";
const target1Name = "Orc1";
const target2Name = "Orc2";

export async function busyWait(seconds: number) {
  await (new Promise(resolve => setTimeout(resolve, seconds * 1000)));
}
export async function resetActors() {
  for (let name of [actor1Name, actor2Name, target1Name, target2Name]) {
    const a = getActor(name);
    a.update({ "data.attributes.hp.value": getProperty(a.data.data, "attributes.hp.max") });
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
  if (!actor) throw new Error(`No shuch actor ${tokenName}`)
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
  if (game.world.data.title !== "midi tests - quench") return;
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
    await globalThis.game.messages.documentClass.deleteDocuments([], {deleteAll: true});

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
            if (target?.actor) await target.actor.setFlag("midi-qol", "fail.ability.save.all", true)
            return completeItemRoll(item).then(workflow => {
              target?.actor?.unsetFlag("midi-qol", "fail.ability.save.all")
              assert.ok(!!workflow);
            });
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
            return actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              // .then(skillRoll => { actor.prepareData(); assert.equal(skillRoll.terms[0].number, 1) });
              .then(skillRoll => { actor.prepareData(); expect(skillRoll.terms[0].number).to.equal(1) });
          });

          it("roll perception - adv.all", async function () {
            setProperty(actor.data, "flags.midi-qol.advantage.all", true);
            return actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { actor.prepareData(); assert.equal(skillRoll.terms[0].number, 2) });
          });
          it("roll perception - adv.skill.all", async function () {
            setProperty(actor.data, "flags.midi-qol.advantage.skill.all", true);
            return actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { actor.prepareData(); assert.equal(skillRoll.terms[0].number, 2) });
          });
          it("roll perception - adv.skill.prc", async function () {
            setProperty(actor.data, "flags.midi-qol.advantage.skill.prc", true);
            return actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { actor.prepareData(); assert.equal(skillRoll.terms[0].number, 2) });

          });
          it("roll perception - adv.skill.ath", async function () {
            setProperty(actor.data, "flags.midi-qol.advantage.skill.ath", true);
            return await actor.rollSkill("prc", { chatMessage: false, fastForward: true })
              .then(skillRoll => { actor.prepareData(); assert.equal(skillRoll.terms[0].number, 1) });

          });
          it("roll acr skill min = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor.data, "flags.midi-qol.min.skill.all", 10);
              const result = await actor.rollSkill("acr", { chatMessage: false, fastForward: true });
              assert.ok(result.total >= 10)
            }
          })
          it("roll per skill max = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor.data, "flags.midi-qol.max.skill.all", 10);
              const result = await actor.rollSkill("per", { chatMessage: false, fastForward: true });
              assert.ok(result.total <= 10)
            }
          });

        });
        describe("inititiative rolls", function () {
          it("rolls a normal initiative roll", async function () {
            const rollResult: Promise<Roll> = new Promise(async (resolve) => {
              Hooks.once("createChatMessage", function (chatMessage) {
                resolve(chatMessage.roll)
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
                resolve(chatMessage.roll)
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
                resolve(chatMessage.roll)
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
            setProperty(actor.data, "flags.midi-qol.advantage.all", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { actor.prepareData(); assert.equal(abilitySave.terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.all", async function () {
            setProperty(actor.data, "flags.midi-qol.advantage.ability.save.all", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { actor.prepareData(); assert.equal(abilitySave.terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.dex", async function () {
            setProperty(actor.data, "flags.midi-qol.advantage.ability.save.dex", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { actor.prepareData(); assert.equal(abilitySave.terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.str", async function () {
            setProperty(actor.data, "flags.midi-qol.advantage.ability.save.str", true);
            return actor.rollAbilitySave("dex", { chatMessage: false, fastForward: true })
              .then(abilitySave => { actor.prepareData(); assert.equal(abilitySave.terms[0].number, 1) });
          });
          it("roll str save min = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor.data, "flags.midi-qol.min.ability.save.all", 10);
              const result = await actor.rollAbilitySave("str", { chatMessage: false, fastForward: true });
              delete actor.data.flags["midi-qol"].min.ability.save.all;
              assert.ok(result.total >= 10)
            }
          })
          it("roll str save max = 10", async function () {
            for (let i = 0; i < 20; i++) {
              setProperty(actor.data, "flags.midi-qol.max.ability.save.all", 10);
              const result = await actor.rollAbilitySave("str", { chatMessage: false, fastForward: true });
              assert.ok(result.total <= 10)
              delete actor.data.flags["midi-qol"].max.ability.save.all;
            }
          })

        it("rolls a normal spell saving throw", async function () {
          const actor = getActor(actor1Name);
          const target: Token | undefined = getToken(target1Name);
          assert.ok(target && !!target?.actor && actor)
          game.user?.updateTokenTargets([target?.id ?? ""]);
          const item = actor.items.getName("Saving Throw Test");
          assert.ok(item);
          const workflow = await completeItemRoll(item);
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
          target?.actor && setProperty(target.actor.data.flags, "midi-qol.magicResistance.all", true)
          const workflow = await completeItemRoll(item);
          assert.equal(workflow.saveResults.length, 1);
          assert.equal(workflow.saveResults[0].terms[0].results.length, 2);
          assert.ok(workflow.saveResults[0].formula.startsWith("2d20kh"))
          //@ts-ignore
          delete target.actor.data.flags["midi-qol"].magicResistance;
        });
        it("rolls a magic vulnerability spell saving throw", async function () {
          const actor: any = getActor(actor1Name);
          const target: Token | undefined = getToken(target1Name);
          assert.ok(target && !!target?.actor && actor)
          game.user?.updateTokenTargets([target?.id ?? ""]);
          const item = actor.items.getName("Saving Throw Test");
          assert.ok(item);
          target?.actor && setProperty(target.actor.data.flags, "midi-qol.magicVulnerability.all", true)
          const workflow = await completeItemRoll(item);
          assert.equal(workflow.saveResults.length, 1);
          assert.equal(workflow.saveResults[0].terms[0].results.length, 2);
          assert.ok(workflow.saveResults[0].formula.startsWith("2d20kl"))
          //@ts-ignore
          delete target.actor.data.flags["midi-qol"].magicVulnerability;
        });
      });
      },
      { displayName: "Midi Tests Ability Rolls" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.itemRolls",
      (context) => {
        const { describe, it, assert } = context;

        describe("Item Roll Tests", async function () {
          it("roll an item with no params", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target = getToken(target2Name);
            const item = getActorItem(actor, "Longsword");
            game.user?.updateTokenTargets([target?.id ?? ""]);
            return completeItemRoll(item).then(workflow => assert.ok(!!workflow));
          });

          it("applies cub conditons", async function () {
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
            assert.ok(!!(await completeItemRoll(actor.items.getName("Cub Test"))));
            await busyWait(0.5);
            assert.ok(cubInterface.hasCondition("Blinded", [target]));
            const effect: ActiveEffect | undefined = target?.actor?.effects.find(e => e.data.label === "Cub Test");
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
            await completeItemRoll(actor.items.getName("CE Test"));
            assert.ok(await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid));
            const effect: ActiveEffect | undefined = target?.actor?.effects.find(e => e.data.label === "CE Test");
            results = await target?.actor?.deleteEmbeddedDocuments("ActiveEffect", [effect?.id ?? "bad"]);
            await busyWait(0.1);
            if (await ceInterface.hasEffectApplied("Deafened", target?.actor?.uuid)) {
              console.warn("testCECondition", "Deafened not removed")
              await ceInterface.removeEffect({ effectName: "Deafened", uuid: target?.actor?.uuid });
              return false;
            }
            return true;
          });
        });
        describe("Macro Roll Tests", async function () {
          it("runs macro exucute", async function () {
            const target = getToken(target1Name);
            const actor = getActor(actor2Name);
            assert.ok(actor);
            assert.ok(target);
            try {
              let hasEffect: any[] = actor.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
              if (hasEffect?.length > 0) actor.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id))
              hasEffect = target?.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
              if (hasEffect?.length > 0) target?.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              game.user?.updateTokenTargets([target?.id ?? ""]);
              await completeItemRoll(actor.items.getName("Macro Execute Test"));
              let flags: any = actor.data.flags["midi-qol"];
              assert.equal(flags?.test, "metest")
              hasEffect = target?.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
              assert.ok(hasEffect);
              await target?.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              flags = getProperty(actor.data.flags, "midi-qol.test");
              assert.ok(!flags?.test);
              hasEffect = target?.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
              assert.equal(hasEffect.length, 0)
            } finally {
              let hasEffect: any = target?.actor?.effects.filter(a => a.data.label === "Macro Execute Test") ?? [];
              await target?.actor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              await actor.unsetFlag("midi-qol", "test")
            }
            return true;
          });

        });
        describe("Macro actor onUse Macro Tests", async function () {
          it("calls actor onUseMacros", async function () {
            const actor = getActor(actor2Name);
            const macroPasses: string[] = [];
            const hookid = Hooks.on("OnUseMacroTest", (pass: string) => macroPasses.push(pass));
            await completeItemRoll(actor.items.getName("OnUseMacroTest")); // Apply the effect
            const target = getToken(target2Name);
            game.user?.updateTokenTargets([target?.id ?? ""]);
            await completeItemRoll(actor.items.getName("Longsword")); // Apply the effect
            Hooks.off("OnUseMacroTest", hookid);
            let hasEffects: any = actor.effects.filter(a => a.data.label === "OnUseMacroTest") ?? [];
            assert.ok(hasEffects);
            await actor.deleteEmbeddedDocuments("ActiveEffect", hasEffects.map(e => e.id))
            console.log(macroPasses);
            assert.equal(macroPasses.length, 12);
          })
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
        const ceInterface: any = game.dfreds.effectInterface;

        describe("Condition Immunity Tests", async function() {
          it("Tests condition immunity disables effect", async function () {
            await ceInterface.addEffect({ effectName: "Paralyzed", uuid: actor.uuid });
            assert.ok(await ceInterface.hasEffectApplied("Paralyzed", actor?.uuid));
            const theEffect: ActiveEffect | undefined = actor.effects.find(ef => ef.data.label === "Paralyzed");
            assert(theEffect);
            assert(!theEffect?.data.disabled);
            await actor.update({"data.traits.ci.value": ["paralyzed"]});
            assert(theEffect?.data.disabled);
            await actor.update({"data.traits.ci.value": []});
            assert(!theEffect?.data.disabled);
            await ceInterface.removeEffect({ effectName: "Paralyzed", uuid: actor.uuid });
            assert.ok(!(await ceInterface.hasEffectApplied("Paralyzed", actor?.uuid)));

          })
        });
      },
      { displayName: "Midi Conidition Immunity Tests" },
    )
    globalThis.quench.registerBatch(
      "quench.midi-qol.otherTests",
      (context) => {
        const { describe, it, assert } = context;
      },
      { displayName: "Midi Other Tests" },
    )
  }
}