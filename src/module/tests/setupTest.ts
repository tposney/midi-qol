import { MODULE_ID, busyWait, ceInterface, error, warn } from "../../midi-qol.js";
import { applySettings } from "../apps/ConfigPanel.js";
import { CEHasEffectApplied, CERemoveEffect, applyTokenDamage, completeItemUse, findNearby, updateUserTargets } from "../utils.js";
import { TrapWorkflow, Workflow } from "../Workflow.js";

const actor1Name = "actor1";
const actor2Name = "actor2";
const target1Name = "Orc1";
const target2Name = "Orc2";
const target3Name = "Skeleton1";

const workflowOptions = { targetConfirmation: "none" };

export async function resetActors() {
  for (let name of [actor1Name, actor2Name, target1Name, target2Name, target3Name]) {
    const a = getActor(name);
    await a.update(
      //@ts-expect-error
      { "data.attributes.hp.value": foundry.utils.getProperty(a, "system.attributes.hp.max")}, 
      {});
    if (a.effects?.contents.length > 0) await a.deleteEmbeddedDocuments("ActiveEffect", a?.effects?.contents?.map(e => e.id ?? ""));
    //@ts-expect-error
    await a.unsetFlag("dnd5e", "initiativeAdv");
    //@ts-expect-error
    await a.unsetFlag("dnd5e", "initiativeDisadv");
  }
  //@ts-expect-error
  const tokens: Token[] | undefined = canvas.tokens.placeables;
  if (tokens) {
    for (let token of tokens) {
      if (token.actor) {
        const actor: Actor = token.actor;
        // @ts-expect-error no dnd5e-types
        await actor.update({ "system.attributes.hp.value": actor.system.attributes.hp.max });
        if (actor.effects?.contents.length > 0) await actor.deleteEmbeddedDocuments("ActiveEffect", actor.effects.contents.map(e => e.id ?? ""));
        //@ts-expect-error
        await actor.unsetFlag("dnd5e", "initiativeAdv");
        //@ts-expect-error
        await actor.unsetFlag("dnd5e", "initiativeDisadv");
      }
    }
  }
}

export function getToken(tokenName): Token | undefined {
  const allTokens: Token[] | undefined = canvas.tokens?.placeables;
  let token: Token | undefined = allTokens?.find(t => t.name === tokenName)
  return token;
}

export function getActor(tokenName): Actor {
  const token: Token | undefined = getToken(tokenName);
  if (token?.actor) {
    const actor: Actor = token.actor
    // @ts-expect-error protected
    actor._initialize();
    return actor;
  };
  const actor = game.actors?.getName(tokenName);
  if (!actor) throw new Error(`No such actor ${tokenName}`)
    // @ts-expect-error protected
    actor?._initialize();
  return actor;
}

export function getActorItem(actor, itemName) {
  const item = actor?.items.getName(itemName);
  if (!item) throw new Error(`Could not find item ${itemName} on actor ${actor.name}`);
  return item;
}
export function setupMidiTests() {
  if (!game.user?.isGM) return;
  if (!game.world?.title.toLocaleLowerCase().includes("quench")) return;
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
        const { describe, it } = context;
        let assert: any = context.assert;

        describe("Damage Only Workflow/TrapWorkflow", function () {
          it("apply a DamageOnlyWorkflow", async function () {
            await resetActors();
            const actor: Actor = getActor(actor2Name);
            const target: Token | undefined = getToken(target1Name);
            //@ts-expect-error
            const targetActor: Actor | undefined = target?.actor;
            //@ts-ignore
            assert(target && target?.actor && targetActor)
            updateUserTargets([target?.id ?? ""]);
            const item = getActorItem(actor, "Toll the Dead");
            // @ts-expect-error can't know about flags
            if (target?.actor) await targetActor?.setFlag(MODULE_ID, "fail.ability.save.all", true);
            try {
              const workflow: Workflow = await completeItemUse(item, { midiOptions: { workflowOptions } }, {})
              //@ts-expect-error
              targetActor?.unsetFlag(MODULE_ID, "fail.ability.save.all");
              assert.ok(!!workflow, "workflow not defined");
            } catch (err) {
              error("Damage Only Workflow Error", err);
              assert.ok(false);
            } finally {
            }
          });
          it("rolls a TrapWorkflow", async function () {
            await resetActors();
            try {

              const trapWorkflowMacro = game.macros?.getName("TrapWorkflowTest");
              const targetToken = getToken(target1Name)
              //@ts-expect-error
              const targetActor: Actor | undefined = targetToken?.actor;
              const spell: any = game.items?.getName("FireballTest");
              if (spell && targetToken && targetActor) {
                // foundry.utils.setProperty(spell, "system.save", { ability: 'dex', dc: 15, scaling: 'flat' });
                // foundry.utils.setProperty(spell, "system.preparation", { mode: 'innate', prepared: 'true' });
                //@ ts-expect-error
                const trapItem: any = new CONFIG.Item.documentClass(spell.toObject(), { parent: targetActor });
                // trapItem.setFlag = async (scope: string, key: string, value: any) => { return trapItem };
                trapItem.prepareData();
                trapItem.prepareFinalAttributes();
                const templateLocation = targetToken.center;
                const workflow: TrapWorkflow = new TrapWorkflow(targetActor, trapItem.system.activities.contents[0], undefined, templateLocation);
                assert.ok(trapWorkflowMacro, "TrapWorkflowTest macro not found");
                assert.ok(!!workflow && workflow instanceof TrapWorkflow);
                await busyWait(1000);
                const fireballEffect = targetActor?.effects.find(e => e.name === "FireballTest Template");
                assert.ok(fireballEffect, "No template effect found");
                await fireballEffect?.delete();
                assert.ok(workflow?.targets.size === 2, "Wrong number of targets");
                assert.ok(workflow.damageRoll !== undefined, "No damage roll");
              }
            } catch (err) {
              error("TrapWorkflow Error", err);
              assert.ok(false);
            } finally {
            }
          })
        });
      },
      { displayName: "Midi Tests DOW/TrapWorkflow" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.abilityrolls",
      (context) => {
        const { describe, it, expect } = context;
        const assert: any = context.assert;
        const actor: any = getActor(actor1Name);

        describe("skill roll tests", function () {
          it("roll perception - 1 dice", function () {
            return actor.rollSkill({ skill: "prc" }, { configure: false }, { create: false })
              // .then(skillRoll => { actor._initialize(); assert.equal(skillRoll.terms[0].number, 1) });
              .then(skillRoll => { actor._initialize(); expect(skillRoll[0].terms[0].number).to.equal(1) });
          });

          it("roll perception - adv.all", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.all", true);
            const result = await actor.rollSkill({ skill: "prc" }, { configure: false }, { create: false })
              .then(skillRoll => { delete actor.flags[MODULE_ID].advantage.all; actor._initialize(); assert.equal(skillRoll[0].terms[0].number, 2) });
            return result
          });
          it("roll perception - adv.skill.all", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.skill.all", true);
            const result = await actor.rollSkill({ skill: "prc" }, { configure: false }, { create: false })
              .then(skillRoll => { delete actor.flags[MODULE_ID].advantage.skill.all; actor._initialize(); assert.equal(skillRoll[0].terms[0].number, 2) });
            return result;

          });
          it("roll perception - adv.skill.prc", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.skill.prc", true);
            const result = await actor.rollSkill({ skill: "prc" }, { configure: false }, { create: false })
              .then(skillRoll => { delete actor.flags[MODULE_ID].advantage.skill.prc; actor._initialize(); assert.equal(skillRoll[0].terms[0].number, 2) });
            return result;
          });
          it("roll perception - adv.skill.ath", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.skill.ath", true);
            return actor.rollSkill({ skill: "prc" }, { configure: false }, { create: false })
              .then(skillRoll => { delete actor.flags[MODULE_ID].advantage.skill.ath; actor._initialize(); assert.equal(skillRoll[0].terms[0].number, 1) });
          });
          it("roll acr skill min = 10", async function () {
            for (let i = 0; i < 20; i++) {
              foundry.utils.setProperty(actor, "flags.midi-qol.min.skill.all", 10);
              const result = await actor.rollSkill({ skill: "acr" }, { configure: false }, { create: false });
              assert.ok(result.reduce((acc, roll) => acc + roll.total, 0) >= 10);
              delete actor.flags[MODULE_ID].min.skill.all;
              return result;
            }
          })
          it("roll per skill max = 10", async function () {
            for (let i = 0; i < 20; i++) {
              foundry.utils.setProperty(actor, "flags.midi-qol.max.skill.all", 10);
              const result = await actor.rollSkill({ skill: "per" }, { configure: false }, { create: false });
              assert.ok(result.reduce((acc, roll) => acc + roll.total, 0) <= 10)
              delete actor.flags[MODULE_ID].max.skill.all

              return result;
            }
          });

        });
        describe("initiative rolls", function () {
          it("rolls a normal initiative roll", async function () {
            await busyWait(100); // let previous chat message creation complete
            this.timeout(3000);

            const rollResult: Promise<Roll> = new Promise((resolve) => {
              Hooks.once("createChatMessage", function (chatMessage) {
                resolve(chatMessage.rolls[0])
              });
            });
            const cls = getDocumentClass("Combat");
            const combat = await cls.create({ scene: canvas.scene?.id, active: true }, { render: false });
            // await combat?.startCombat();
            await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
            await combat?.delete();
            const roll: Roll = await rollResult;
            //@ts-ignore
            assert.equal(roll.terms[0].results.length, 1);
          });
          it("rolls an advantage initiative roll", async function () {
            this.timeout(3000);
            await actor.setFlag(game.system?.id, "initiativeAdv", true);
            await actor.setFlag(game.system?.id, "initiativeDisadv", false);
            const rollResult: Promise<Roll> = new Promise((resolve) => {
              Hooks.once("createChatMessage", function (chatMessage) {
                resolve(chatMessage.rolls[0])
              });
            });
            const cls = getDocumentClass("Combat");
            let scene = canvas.scene;
            const combat = await cls.create({ scene: scene?.id, active: true }, { render: true });
            await combat?.startCombat();
            // await actor.rollInitiativeDialog({ createCombatants: true, rerollInitiative: true });
            await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
            await combat?.delete();
            const roll: Roll = await rollResult;
            await actor.unsetFlag(game.system?.id, "initiativeAdv");
            await actor.unsetFlag(game.system?.id, "initiativeDisadv");
            //@ts-ignore
            assert.equal(roll.terms[0].results.length, 2);
            assert.ok(roll.formula.startsWith("2d20kh"));
          });
          it("rolls a disadvantage initiative roll", async function () {
            this.timeout(3000);
            await actor.setFlag(game.system?.id, "initiativeAdv", false);
            await actor.setFlag(game.system?.id, "initiativeDisadv", true);
            const rollResult: Promise<Roll> = new Promise(async (resolve) => {
              Hooks.once("createChatMessage", function (chatMessage) {
                resolve(chatMessage.rolls[0])
              });

            });
            const cls = getDocumentClass("Combat");
            let scene = canvas.scene;
            const combat: any = await cls.create({ scene: scene?.id, active: true });
            await combat?.startCombat();
            await actor.rollInitiative({ createCombatants: true, rerollInitiative: true });
            // await actor.rollInitiativeDialog({ createCombatants: true, rerollInitiative: true });
            await combat?.delete();
            const roll: Roll = await rollResult;
            await actor.unsetFlag(game.system?.id, "initiativeDisadv");
            await actor.unsetFlag(game.system?.id, "initiativeAdv");
            //@ts-ignore
            assert.equal(roll.terms[0].results.length, 2);
            assert.ok(roll.formula.startsWith("2d20kl"));
          });
        })
        describe("save roll tests", function () {
          it("roll dex save - 1 dice", async function () {
            return actor.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false })
              .then(abilitySave => { actor._initialize(); assert.equal(abilitySave[0].terms[0].number, 1) });
          });
          it("roll dex save - adv.all", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.all", true);
            return actor.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false })
              .then(abilitySave => { delete actor.flags[MODULE_ID].advantage.all; actor._initialize(); assert.equal(abilitySave[0].terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.all", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.ability.save.all", true);
            return actor.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false })
              .then(abilitySave => { delete actor.flags[MODULE_ID].advantage.ability.save.all; actor._initialize(); assert.equal(abilitySave[0].terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.dex", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.ability.save.dex", true);
            return actor.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false })
              .then(abilitySave => { delete actor.flags[MODULE_ID].advantage.ability.save.dex; actor._initialize(); assert.equal(abilitySave[0].terms[0].number, 2) });
          });
          it("roll dex save - adv.ability.save.str", async function () {
            foundry.utils.setProperty(actor, "flags.midi-qol.advantage.ability.save.str", true);
            return actor.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false })
              .then(abilitySave => { delete actor.flags[MODULE_ID].advantage.ability.save.dex; actor._initialize(); assert.equal(abilitySave[0].terms[0].number, 1) });
          });
          it("roll str save min = 10", async function () {
            for (let i = 0; i < 20; i++) {
              foundry.utils.setProperty(actor, "flags.midi-qol.min.ability.save.all", 10);
              const result = await actor.rollSavingThrow({ ability: "str" }, { configure: false }, { create: false });
              delete actor.flags[MODULE_ID].min.ability.save.all;
              assert.ok(result[0].total >= 10)
            }
          })
          it("roll str save max = 10", async function () {
            for (let i = 0; i < 20; i++) {
              foundry.utils.setProperty(actor, "flags.midi-qol.max.ability.save.all", 10);
              const result = await actor.rollSavingThrow({ ability: "str" }, { configure: false }, { create: false });
              delete actor.flags[MODULE_ID].max.ability.save.all;
              assert.ok(result[0].total <= 10)
            }
          })

          it("rolls a normal spell saving throw", async function () {
            const actor = getActor(actor1Name);
            const target: Token | undefined = getToken(target1Name);
            assert.ok(target && !!target?.actor && actor)
            updateUserTargets([target?.id ?? ""]);
            const item = actor.items.getName("Saving Throw Test");
            assert.ok(item);
            const workflow = await completeItemUse(item!, { midiOptions: { workflowOptions } });
            assert.ok(workflow.saveResults.length === 1);
            assert.equal(workflow.saveResults[0].terms[0].results.length, 1);
            assert.ok(workflow.saveResults[0].formula.startsWith("1d20"))
          });
          it("rolls a magic resistance spell saving throw", async function () {
            const actor: any = getActor(actor1Name);
            const target: Token | undefined = getToken(target1Name);
            assert.ok(target && !!target?.actor && actor)
            try {
              updateUserTargets([target?.id ?? ""]);
              const item = actor.items.getName("Saving Throw Test");
              assert.ok(item);
              await actor.setFlag("midi-qol", "magicResistance.all", true);
              const workflow = await completeItemUse(item, { midiOptions: { workflowOptions } });
              assert.equal(workflow.saveResults.length, 1);
              assert.equal(workflow.saveResults[0].terms[0].results.length, 2);
              assert.ok(workflow.saveResults[0].formula.startsWith("2d20kh"))
            } finally {
              await actor.unsetFlag("midi-qol", "magicResistance");
            }
          });
          it("rolls a magic vulnerability spell saving throw", async function () {
            const actor: any = getActor(actor1Name);
            const target: Token | undefined = getToken(target1Name);
            assert.ok(target && !!target?.actor && actor);
            try {
              updateUserTargets([target?.id ?? ""]);
              const item = actor.items.getName("Saving Throw Test");
              assert.ok(item);
              await actor.setFlag("midi-qol", "magicVulnerability.all", true);
              const workflow = await completeItemUse(item, { midiOptions: { workflowOptions } });
              assert.equal(workflow.saveResults.length, 1);
              assert.equal(workflow.saveResults[0].terms[0].results.length, 2);
              assert.ok(workflow.saveResults[0].formula.startsWith("2d20kl"))
            } finally {
              await actor.unsetFlag("midi-qol", "magicVulnerability");
            }
          });
        });
      },
      { displayName: "Midi Tests Ability Rolls" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.itemRolls",
      (context) => {
        const { describe, it, expect, should } = context;
        const assert: any = context.assert;

        describe("Item Roll Tests", async function () {
          it("roll an item with no params", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target = getToken(target2Name);
            const item = getActorItem(actor, "Longsword");
            updateUserTargets([target?.id ?? ""]);
            return completeItemUse(item, { midiOptions: { workflowOptions } }).then(workflow => assert.ok(!!workflow));
          });

          it("applies clt conditions", async function () {
            let results: any;
            //@ts-ignore
            const cltInterface: any = game.clt;
            assert.ok(!!cltInterface);
            const target = getToken(target2Name);
            //@ts-expect-error
            const targetActor: Actor | undefined = target?.actor;
            const actor = getActor(actor1Name);
            updateUserTargets([target?.id ?? ""]);
            if (cltInterface.hasCondition("Blinded", [target]))
              await cltInterface.removeCondition("Blinded", [target]);
            assert.ok(!cltInterface.hasCondition("Blinded", [target]));
            assert.ok(!!(await completeItemUse(actor.items.getName("Clt Test")!, { midiOptions: { workflowOptions } })));
            await busyWait(500);
            assert.ok(cltInterface.hasCondition("Blinded", [target]));
            const effect: ActiveEffect | undefined = targetActor?.effects.find(e => e.name === "Clt Test");
            results = await targetActor?.deleteEmbeddedDocuments("ActiveEffect", [effect?.id ?? "bad"]);
            // results = await globalThis.DAE.actionQueue.add(target.actor?.deleteEmbeddedDocuments.bind(target.actor),"ActiveEffect", [effect?.id ?? "bad"]);
            await busyWait(500);
            if (cltInterface.hasCondition("Blinded", [target])) {
              console.warn("testcltCondition", "Blinded not removed")
              await cltInterface.removeCondition("Blinded", [target]);
              return false;
            }
            return true;
          })
          it("applies CE conditions", async function () {
            let results: any;
            // @ts-expect-error
            const testCeInterface: typeof ceInterface = game.modules.get("dfreds-convenient-effects")?.api;
            assert.ok(!!testCeInterface);
            const target = getToken(target2Name);
            //@ts-expect-error
            const targetActor: Actor | undefined = target?.actor;
            const actor = getActor(actor2Name);
            assert.ok(target && actor);
            updateUserTargets([target?.id ?? ""]);
            if (await CEHasEffectApplied({ effectName: "Deafened", uuid: targetActor?.uuid ?? "" })) {
              await CERemoveEffect({ effectName: "Deafened", uuid: targetActor?.uuid ?? "" });
            }
            assert.ok(!await CEHasEffectApplied({ effectName: "Deafened", uuid: targetActor?.uuid ?? "" }));
            await completeItemUse(actor.items.getName("CE Test")!, { midiOptions: { workflowOptions } });
            await busyWait(500);
            assert.ok(await CEHasEffectApplied({ effectName: "Deafened", uuid: targetActor?.uuid ?? "" }));
            const effect: ActiveEffect | undefined = targetActor?.effects.find(e => e.name === "CE Test");
            results = await targetActor?.deleteEmbeddedDocuments("ActiveEffect", [effect?.id ?? "bad"]);
            await busyWait(500);
            if (await CEHasEffectApplied({ effectName: "Deafened", uuid: targetActor?.uuid ?? "" })) {
              console.warn("testCECondition", "Deafened not removed")
              await CERemoveEffect({ effectName: "Deafened", uuid: targetActor?.uuid ?? "" });
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
            updateUserTargets([target?.id ?? ""]);
            //@ts-ignore .flags v10
            foundry.utils.setProperty(actor.flags, "midi-qol.advantage.all", true);
            //@ts-ignore .abilities
            assert.ok(actor.system.abilities.str.mod > 0, "non zero str mod")
            await completeItemUse(actor.items.getName("AppliesDamage")!, { midiOptions: { workflowOptions } });
            //@ts-ignore .flags v10
            delete actor.flags[MODULE_ID].advantage.all;
            const newHp = target?.actor?.system.attributes.hp.value;
            //@ts-ignore
            assert.equal(newHp, oldHp - 10 - actor.system.abilities.str.mod);
            return true;
          });
          it("applies activation condition", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target2: any = getToken(target2Name);
            const target3: any = getToken(target3Name);
            updateUserTargets([target3?.id ?? "", target2?.id ?? ""]);
            const target2hp = target2?.actor?.system.attributes.hp.value;
            const target3hp = target3?.actor?.system.attributes.hp.value;
            await completeItemUse(actor.items.getName("MODTest")!, { advantage: true, midiOptions: { workflowOptions } }); // does 10 + 10 to undead
            const effects2 = target2.actor.effects.contents.filter(ef => (ef.name) === "MODTest");
            const effects3 = target3.actor.effects.contents.filter(ef => (ef.name) === "MODTest");
            if (effects2.length) await target2.actor.deleteEmbeddedDocuments("ActiveEffect", effects2.map(ae => ae.id))
            if (effects3.length) await target3.actor.deleteEmbeddedDocuments("ActiveEffect", effects3.map(ae => ae.id))
            await busyWait(100);
            const condition2 = target2.actor.effects.contents.filter(ef => (ef.name) === "Frightened");
            const condition3 = target3.actor.effects.contents.filter(ef => (ef.name) === "Frightened");
            if (condition2.length) await target2.actor.deleteEmbeddedDocuments("ActiveEffect", condition2.map(ae => ae.id))
            if (condition3.length) await target3.actor.deleteEmbeddedDocuments("ActiveEffect", condition3.map(ae => ae.id))
            assert.equal(target2hp - 10, target2?.actor?.system.attributes.hp.value, "non undead takes 10 hp");
            assert.equal(target3hp - 40, target3?.actor?.system.attributes.hp.value, "undead takes 20 hp"); // 20hp + vulnerability
            assert.equal(effects2.length, 0, "Frightened not applied to non undead");
            assert.equal(effects3.length, 1, "Frightened applied to undead");
            assert.equal(condition2.length, 0, "Frightened not removed from non undead");
            assert.equal(condition3.length, 0, "Frightened not removed from undead");
          });
          it("applies condition/other damage - no activation", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target2: any = getToken(target2Name);
            const target3: any = getToken(target3Name);
            updateUserTargets([target2?.id ?? "", target3?.id ?? ""]);
            const target2hp = target2?.actor?.system.attributes.hp.value;
            const target3hp = target3?.actor?.system.attributes.hp.value;
            await completeItemUse(actor.items.getName("MODTestNoActivation")!, { midiOptions: { workflowOptions } }); // does 10 + 10 to undead
            const effects2 = target2.actor.effects.contents.filter(ef => (ef.name) === "MODTestNoActivation");
            const effects3 = target3.actor.effects.contents.filter(ef => (ef.name) === "MODTestNoActivation");
            if (effects2.length) await target2.actor.deleteEmbeddedDocuments("ActiveEffect", effects2.map(ae => ae.id))
            if (effects3.length) await target3.actor.deleteEmbeddedDocuments("ActiveEffect", effects3.map(ae => ae.id))
            await busyWait(100);
            const condition2 = target2.actor.effects.contents.filter(ef => (ef.name) === "Frightened");
            const condition3 = target3.actor.effects.contents.filter(ef => (ef.name) === "Frightened");
            if (condition2.length) await target2.actor.deleteEmbeddedDocuments("ActiveEffect", condition2.map(ae => ae.id))
            if (condition3.length) await target3.actor.deleteEmbeddedDocuments("ActiveEffect", condition3.map(ae => ae.id))
            assert.equal(target2hp - 20, target2?.actor?.system.attributes.hp.value, "non undead takes 10 hp");
            assert.equal(target3hp - 40, target3?.actor?.system.attributes.hp.value, "undead takes 20 hp"); // 20hp + vulnerability
            assert.equal(effects2.length, 1, "Frightened not applied to non undead");
            assert.equal(effects3.length, 1, "Frightened applied to undead");
            assert.equal(condition2.length, 0, "Frightened applied to non undead");
            assert.equal(condition3.length, 0, "Frightened applied to undead");
          });
        });
        describe("Macro Roll Tests", async function () {
          it("runs macro execute", async function () {
            const target = getToken(target1Name);
            //@ts-expect-error
            const targetActor: Actor | undefined = target?.actor;
            let actor = getActor(actor2Name);
            assert.ok(actor);
            assert.ok(target);
            try {
              let hasEffect: any[] = actor.effects.filter(e => e.name === "Macro Execute Test") ?? [];
              if (hasEffect?.length > 0) await actor.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id))
              hasEffect = targetActor?.effects.filter(e => e.name === "Macro Execute Test") ?? [];
              if (hasEffect?.length > 0) await targetActor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              updateUserTargets([target?.id ?? ""]);
              await completeItemUse(actor.items.getName("Macro Execute Test")!, { midiOptions: { workflowOptions } });
              await busyWait(100);
              console.log("Macro Execute Test checking flag", foundry.utils.getProperty(actor, "flags.midi-qol.test"));
              let flags: any = actor.flags[MODULE_ID];
              assert.equal(flags?.test, "metest")
              hasEffect = targetActor?.effects.filter(e => e.name === "Macro Execute Test") ?? [];
              assert.ok(hasEffect);
              await targetActor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              flags = foundry.utils.getProperty(actor, "flags.midi-qol.test");
              assert.ok(!flags?.test);
              hasEffect = targetActor?.effects.filter(e => e.name === "Macro Execute Test") ?? [];
              assert.equal(hasEffect.length, 0)
            } finally {
              let hasEffect: any = targetActor?.effects.filter(e => e.name === "Macro Execute Test") ?? [];
              await targetActor?.deleteEmbeddedDocuments("ActiveEffect", hasEffect.map(e => e.id));
              //@ts-expect-error
              await actor.unsetFlag(MODULE_ID, "test")
            }
            return true;
          });
          it("tests macro.tokenMagic", async function () {
            this.timeout(10000);
            const actor = getActor(actor1Name);
            const effectData = {
              name: "test effect",
              changes: [{ key: "macro.tokenMagic", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "blur" }]
            };
            assert.ok(globalThis.TokenMagic);
            const theEffects: ActiveEffect.Implementation[] = (await actor.createEmbeddedDocuments("ActiveEffect", [effectData]) ?? []) as ActiveEffect[];
            assert.ok(actor.effects.find(ef => (ef.name === effectData.name)));
            await busyWait(3000);
            const actorToken = canvas.tokens?.placeables.find(t => t.name === (actor.token?.name ?? actor.name))
            assert.ok(actorToken, "found actor token");
            assert.ok(globalThis.TokenMagic.hasFilterId(actorToken, "blur"), "applied blur effect");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id as string));
            await busyWait(3000);
            assert.equal(globalThis.TokenMagic.hasFilterId(actorToken, "blur"), false, "test blur");
            return true;
          });
          /*          it("tests blur removal", async function() {
                      const actor = getActor(actor1Name);
                      const actorToken = canvas.tokens?.placeables.find(t=> t.name === actor.token?.name)
                      this.retries(10);
                      await busyWait(1000);
                      assert.equal(globalThis.TokenMagic.hasFilterId(actorToken,"blur"), false, "test blur");
                    });
          */
        });
      },
      { displayName: "Midi Item Roll Tests" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.Onuse-macro-tests",
      context => {
        const { describe, it } = context;
        const assert: any = context.assert;
        describe("onUse Macro Tests", async function () {
          it("Calls actor onUseMacros", async function () {
            this.timeout(3000); // why is 2 seconds not enough?
            const actor = getActor(actor2Name);
            const macroPasses: string[] = [];
            await completeItemUse(actor.items.getName("OnUseMacroTest")!, { midiOptions: { workflowOptions } }); // Apply the effect
            await busyWait(200);
            const target = getToken(target2Name);
            updateUserTargets([target?.id ?? ""]);
            //@ts-expect-error
            const hookId = Hooks.on("OnUseMacroTest", (pass: string) => {macroPasses.push(pass); warn(pass, macroPasses)});
            await completeItemUse(actor.items.getName("Longsword")!, { midiOptions: { workflowOptions } }); // Apply the effect
            //@ts-expect-error
            Hooks.off("OnUseMacroTest", hookId);
            let hasEffects: any = actor.effects.filter(e => e.name === "OnUseMacroTest") ?? [];
            assert.ok(hasEffects);
            await actor.deleteEmbeddedDocuments("ActiveEffect", hasEffects.map(e => e.id))
            warn("en.json passes", Object.keys(game.i18n?.translations[MODULE_ID]["onUseMacroOptions"]))
            const expectedPasses = ['preTargeting', 'preItemRoll', 'preStart',
              'postStart', 'preAoETargetConfirmation', 'postAoETargetConfirmation',
              'preValidateRoll', 'postValidateRoll', 'prePreambleComplete',
              'postPreambleComplete', 'preWaitForAttackRoll',
              'postWaitForAttackRoll', 'preWaitForDamageRoll', 'postWaitForDamageRoll',
              'preWaitForSaves', 'preSave', 'postWaitForSaves', 'preSavesComplete',
              'postSave', 'postSavesComplete', 'preAllRollsComplete', 'postAllRollsComplete',
              'preApplyDynamicEffects', 'preActiveEffects', 'postApplyDynamicEffects',
              'preRollFinished', 'postActiveEffects', 'postRollFinished', 'preCleanup'];
            warn("Expected Passes", expectedPasses);
            warn("Actual passes", macroPasses);
            // Test for all passes except "all"
            for (let expectedPass of expectedPasses) {
              assert.ok(macroPasses.includes(expectedPass), `onUseMacro pass ${expectedPass}`);
            }
          })

          it("Calls item onUseMacros", async function () {
            const actor = getActor(actor2Name);
            const macroPasses: string[] = [];
            const expectedPasses = ['preTargeting', 'preItemRoll', 'prePreambleComplete', 'preSave', 'postSave', 'preActiveEffects', 'postActiveEffects'];
            //@ts-expect-error
            const hookId = Hooks.on("Item OnUseMacroTest", (pass: string) => macroPasses.push(pass));
            await completeItemUse(actor.items.getName("Item OnUseMacroTest")!, { midiOptions: { workflowOptions } });
            warn("actual passes", macroPasses);
            warn("expected passes", expectedPasses)
            //@ts-expect-error
            Hooks.off("OnUseMacroTest", hookId);
            for (let expectedPass of expectedPasses) {
              assert.ok(macroPasses.includes(expectedPass), `onUseMacro pass ${expectedPass}`);
            }

          });
        });
      },
      { displayName: "OnUse Macro Tests" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.conditionImmunity",
      (context) => {
        const { describe, it } = context;
        const assert: any = context.assert;
        const actor: Actor = getActor(actor1Name);
        //@ts-expect-error
        const testCeInterface: typeof ceInterface = game.modules.get("dfreds-convenient-effects")?.api;

        describe("Condition Immunity Tests", async function () {
          it("Tests condition immunity disables effect", async function () {
            await actor.toggleStatusEffect("paralyzed", { active: true });
            assert.ok(actor.statuses.has("paralyzed"), "Paralyzed not applied");
            try {
              // assert.ok(await ceInterface.hasEffectApplied("Paralyzed", actor?.uuid));
              const theEffect: ActiveEffect | undefined = actor.effects.find(ef => ef.name === "Paralyzed");
              assert.ok(theEffect, "not paralyzed");
              assert.ok(!(theEffect?.isSuppressed || theEffect?.disabled), "paralyzed suppressed");
              // @ts-expect-error
              await actor.update({ "system.traits.ci.value": ["paralyzed"] });
              assert.ok(theEffect?.disabled || theEffect?.isSuppressed, "paralyzed not suppressed");
              // @ts-expect-error
              await actor.update({ "system.traits.ci.value": [] });
              assert.ok(!(theEffect?.disabled || theEffect?.isSuppressed), "traits not disabled");
            } finally {
              // @ts-expect-error
              await actor.update({ "system.traits.ci.value": [] });
              await actor.toggleStatusEffect("paralyzed", { active: false });
              const theEffect: ActiveEffect | undefined = actor.effects.find(ef => ef.name === "Paralyzed");
              assert.ok(!theEffect, "Paralyzed not removed");
            }

          })
        });
      },
      { displayName: "Midi Condition Immunity Tests" },
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.overTimeTests",
      (context) => {
        const { describe, it } = context;
        const assert: any = context.assert;
        describe("overTime effects", async function () {
          it("test overtime effect run and removed on combat update", async function () {
            this.timeout(20000);
            let scene = canvas.scene;
            const cls = getDocumentClass("Combat");
            const combat = await cls.create({ scene: scene?.id, active: true }, { render: true });
            await combat?.startCombat();
            assert.ok(combat);
            const token = getToken(target2Name);
            assert.ok(token);
            const actor: Actor | null | undefined = token?.actor;
            assert.ok(actor);
            const createData = {
              tokenId: token?.id,
              sceneId: token?.scene.id,
              actorId: token?.document.actorId,
              hidden: token?.document.hidden
            }
            //@ts-expect-error
            const hp = actor?.system.attributes.hp.value;
            await combat?.createEmbeddedDocuments("Combatant", [createData]);

            const effectData = {
              name: "test over time",
              label: "test over time",
              changes: [{
                key: "flags.midi-qol.OverTime.Test", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: `turn=end,
              removeCondition=true,
              damageRoll=15,
              damageType=acid,
              label=OverTime test`}],
              duration: { rounds: 10 }
            }
            const theEffects: any[] | undefined = await actor?.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(theEffects?.length, "Effects created");
            assert.ok(actor && foundry.utils.getProperty(actor, "flags.midi-qol.OverTime.Test"), "overtime flag set");

            await combat?.nextRound();
            await busyWait(1000);
            //@ts-expect-error no dnd5e-types
            let newHp = actor?.system.attributes.hp.value;
            assert.equal(hp - 15, newHp, "verify hp deduction 1st");
            assert.equal(actor?.effects.contents.length, 0, "check effect is removed");
            await combat?.nextRound();
            await busyWait(1000);
            //@ts-expect-error no dnd5e-types
            newHp = actor?.system.attributes.hp.value;
            assert.equal(hp - 15, newHp, "verify hp deduction 2nd");
            await combat?.delete();

          })
        });
      },
      { displayName: "Midi Over Time Tests" }
    );
    globalThis.quench.registerBatch(
      "quench.midi-qol.midi-qol.flagTests",
      (context) => {
        const { describe, it } = context;
        const assert: any = context.assert;
        describe("midi flag tests", async function () {
          it("sets advantage.all false", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: "flags.midi-qol.advantage.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "false" }]
            }
            const theEffects: ActiveEffect.Implementation[] = (await actor.createEmbeddedDocuments("ActiveEffect", [effectData]) ?? []) as ActiveEffect[];
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === false, "advantage all false");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id as string))
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets advantage.all 0", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: "flags.midi-qol.advantage.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "0" }]
            }
            const theEffects: ActiveEffect.Implementation[] = (await actor.createEmbeddedDocuments("ActiveEffect", [effectData]) ?? []) as ActiveEffect.Implementation[];
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === false, "advantage all false");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id as string))
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets advantage.all true", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: "flags.midi-qol.advantage.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" }]
            }
            const theEffects: ActiveEffect.Implementation[] = (await actor.createEmbeddedDocuments("ActiveEffect", [effectData]) ?? []) as ActiveEffect[];
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === true, "advantage all set to true");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id as string))
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets advantage.all 1", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: "flags.midi-qol.advantage.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "1" }]
            }
            const theEffects: ActiveEffect.Implementation[] = (await actor.createEmbeddedDocuments("ActiveEffect", [effectData]) ?? []) as ActiveEffect[];
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === true, "advantage all set to true");
            await actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id as string))
            assert.ok(foundry.utils.getProperty(actor, "flags.midi-qol.advantage.all") === undefined, "advantage all removed")
          });
          it("sets DR.all", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target: any = getToken(target2Name);
            if (!target || !actor) {
              assert.ok(false, "no target or actor");
              return;
            }
            let theEffects: any[] | undefined;
            let changeKey = "system.traits.dm.midi.all";
            let changeValue = "-10";
            let changeMode: number = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
            const effectData = {
              name:"test effect",
              label: "test effect",
              changes: [{ key: changeKey, mode: changeMode, value: changeValue }]
            };

            theEffects = await target?.actor?.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(["number", "string"].includes(typeof foundry.utils.getProperty(target.actor, changeKey)))
            assert.ok(Number.isNumeric(foundry.utils.getProperty(target.actor, changeKey)));

            const oldHp = foundry.utils.getProperty(target, "actor.system.attributes.hp.value") as number;
            updateUserTargets([target?.id ?? ""]);
            await completeItemUse(actor.items.getName("AppliesDamage")!, { midiOptions: { workflowOptions } });
            updateUserTargets([]);
            const newHp = foundry.utils.getProperty(target, "actor.system.attributes.hp.value");
            assert.equal(newHp, oldHp - (foundry.utils.getProperty(actor, "system.abilities.str.mod") as number));
            await target.actor?.deleteEmbeddedDocuments("ActiveEffect", theEffects?.map(ef => ef.id) ?? [])
            assert.ok([undefined, ""].includes(foundry.utils.getProperty(target.actor, changeKey) as string));
          });

          it("sets DR.rwak", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target: any = getToken(target2Name);
            const oldHp = foundry.utils.getProperty(target, "actor.system.attributes.hp.value");
            updateUserTargets([target?.id ?? ""]);
            const changeKey = "system.traits.dm.midi.rwak";
            const changeValue = "-10";
            const changeMode = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
            const effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: changeKey, mode: changeMode, value: changeValue }]
            };
            let theEffects = await target.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.equal("number", typeof foundry.utils.getProperty(target.actor, changeKey))
            assert.ok(Number.isNumeric(foundry.utils.getProperty(target.actor, changeKey)));
            await completeItemUse(actor.items.getName("AppliesDamage")!, { midiOptions: { workflowOptions } });
            updateUserTargets([]);
            const newHp = target?.actor?.system.attributes.hp.value;
            //@ts-ignore
            assert.equal(newHp, oldHp - actor.system.abilities.str.mod);
            await target.actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id))
            assert.ok(foundry.utils.getProperty(target.actor, changeKey) === undefined)
          });
          it("sets DR.piercing", async function () {
            await resetActors();
            const actor = getActor(actor2Name);
            const target: any = getToken(target2Name);
            const oldHp = foundry.utils.getProperty(target, "actor.system.attributes.hp.value");
            updateUserTargets([target?.id ?? ""]);
            const changeKey = "system.traits.dm.amount.piercing";
            const changeValue = "-10";
            const changeMode = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
            const effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: changeKey, mode: changeMode, value: changeValue }]
            };
            let theEffects = await target.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
            assert.ok(Number.isNumeric(foundry.utils.getProperty(target.actor, changeKey)));
            await completeItemUse(actor.items.getName("AppliesDamage")!, { midiOptions: { workflowOptions } });
            updateUserTargets([]);
            const newHp = target?.actor?.system.attributes.hp.value;
            //@ts-expect-error no dnd5e-types
            assert.equal(newHp, oldHp - actor.system.abilities.str.mod);
            await target.actor.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id))
            assert.ok(foundry.utils.getProperty(target.actor, changeKey) === undefined)
          });
        });
      },
      { displayName: "Midi Flag Tests" },
    )
    globalThis.quench.registerBatch(
      "quench.midi-qol.midi-qol.otherTests",
      (context) => {
        const { describe, it, assert } = context;
        describe("midi other tests", async function () {
          it("tests applyTokenDamageMany", async function () {
            await resetActors();
            const token = getToken(target2Name);
            const oldHp = token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value") as number;

            await applyTokenDamage([{ damage: 5, type: 'piercing', value: 5, properties: new Set() }], 5, new Set([token!]), null, new Set(), {});
            assert.equal(token && oldHp && foundry.utils.getProperty(token, "actor.system.attributes.hp.value"), (oldHp ?? 0) - 5)

            await applyTokenDamage([{ damage: 5, type: 'healing', value: 5, properties: new Set() }], 5, new Set([token!]), null, new Set(), {});
            assert.equal(token && oldHp && foundry.utils.getProperty(token, "actor.system.attributes.hp.value"), oldHp)
          });

          it("tests applyTokenDamage reduction", async function () {
            await resetActors();
            const token = getToken(target2Name);
            const tokenActor: Actor | null | undefined = token?.actor;
            const oldHp = token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value");
            const effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: "system.traits.dm.midi.all", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "-5" }]
            };
            let theEffects = (await tokenActor?.createEmbeddedDocuments("ActiveEffect", [effectData]) ?? []) as ActiveEffect[];
            await applyTokenDamage([{ damage: 5, type: 'piercing', value: 5, properties: new Set() }], 5, new Set([token!]), null, new Set(), {});
            assert.equal(token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value"), oldHp);
            await token?.actor?.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id as string));
          });

          it("tests applyTokenDamage resistance", async function () {
            await resetActors();
            const token = getToken(target2Name);
            const tokenActor: Actor | null | undefined = token?.actor;
            const oldHp = (token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value") as number) ?? 0;
            let effectData = {
              name: "test effect",
              label: "test effect",
              changes: [{ key: "system.traits.dr.value", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "fire" }]
            };
            let theEffects = (await tokenActor?.createEmbeddedDocuments("ActiveEffect", [effectData]) ?? []) as ActiveEffect[];
            await applyTokenDamage([{ damage: 10, type: 'fire', value: 10, properties: new Set() }], 10, new Set([token!]), null, new Set(), {});
            assert.equal(token && oldHp && foundry.utils.getProperty(token, "actor.system.attributes.hp.value"), (oldHp ?? 0) - 5);
            await tokenActor?.deleteEmbeddedDocuments("ActiveEffect", theEffects.map(ef => ef.id as string));
            // @ts-expect-error no dnd5e-types
            await tokenActor?.update({ "system.attributes.hp.value": oldHp });
          });

          it("tests applyTokenDamage saves", async function () {
            await resetActors();
            const token = getToken(target2Name);
            const actor = getActor(actor1Name)
            const oldHp = token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value") as number;
            const theItem = actor?.items.getName("Saving Throw Test");
            await applyTokenDamage([{ damage: 10, type: 'piercing', value: 10, properties: new Set() }], 10, new Set([token!]), theItem, new Set([token!]), {});
            assert.equal(token && oldHp && foundry.utils.getProperty(token, "actor.system.attributes.hp.value"), (oldHp ?? 0) - 5);
            // @ts-expect-error no dnd5e-types
            await actor?.update({ "system.attributes.hp.value": oldHp });
          });
          it("tests applyTokenDamage super saver (saved)", async function () {
            await resetActors();
            const token = getToken(target2Name);
            const actor = getActor(actor1Name)
            const oldHp = token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value");
            const theItem = actor?.items.getName("Saving Throw Test");
            await applyTokenDamage([{ damage: 10, type: 'piercing', value: 10, properties: new Set() }], 10, new Set([token!]), theItem, new Set([token!]), { superSavers: new Set([token]) });
            assert.equal(token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value"), oldHp);
            // @ts-expect-error no dnd5e-types
            await actor?.update({ "system.attributes.hp.value": oldHp });
          });
          it("tests applyTokenDamage super saver (failed)", async function () {
            await resetActors();
            const token = getToken(target2Name);
            const actor = getActor(actor1Name)
            const oldHp = token && foundry.utils.getProperty(token, "actor.system.attributes.hp.value") as number;
            const theItem = actor?.items.getName("Saving Throw Test");
            await applyTokenDamage([{ damage: 10, type: 'piercing', value: 10, properties: new Set() }], 10, new Set([token!]), theItem, new Set(), { superSavers: new Set([token]) });
            assert.equal(token && oldHp && foundry.utils.getProperty(token, "actor.system.attributes.hp.value"), (oldHp ?? 0) - 5);
            // @ts-expect-error no dnd5e-types
            await actor?.update({ "system.attributes.hp.value": oldHp });
          });

        });

      },
      { displayName: "Midi Other Tests" },
    )
  }
}
