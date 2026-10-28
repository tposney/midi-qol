import {activityUtils, actorUtils, dialogUtils, effectUtils, tokenUtils, workflowUtils} from '../proxy.mjs';
// On the Weapon Mastery class feature: applies the mastery dnd5e chose for the attack roll (options.mastery, set only
// when the actor can use that weapon's mastery). Nick is action economy and isn't automated.
// Adapted from Cauldron of Plentiful Resources 1.x masteries (chris-premades, MIT licence).
const MODULE = 'midi-qol';
function abilityMod(workflow) {
    return workflow.actor.system.abilities[workflow.activity?.ability]?.mod ?? 0;
}
function damageType(workflow) {
    return workflow.defaultDamageType || workflow.activity?.damage?.parts?.[0]?.types?.first?.() || 'bludgeoning';
}
function dealtDamage(workflow, token) {
    const entry = workflow.damageList?.find(d => d.targetUuid === token.document.uuid);
    return (entry?.hpDamage ?? 0) + (entry?.tempDamage ?? 0) > 0;
}
function currentTurn() {
    const combat = game.combat;
    return combat?.started ? `${combat.id}.${combat.round}.${combat.turn}` : null;
}
async function createEffect(actor, workflow, data) {
    await effectUtils.createEffects(actor, [{origin: workflow.item.uuid, ...data}]);
}
async function cleave(workflow, target) {
    if (!workflowUtils.isAttackType(workflow, 'meleeWeaponAttack') || workflow.activity.flags?.[MODULE]?.cleave) return;
    const turn = currentTurn();
    if (turn && workflow.actor.getFlag(MODULE, 'cleaveTurn') === turn) return;
    const reach = workflow.item.system.properties?.has('rch') ? 10 : 5;
    const candidates = tokenUtils.findNearby(workflow.token.document, reach, {disposition: 'enemy', includeIncapacitated: false})
        .filter(token => token.id !== target.id && tokenUtils.getDistance(token, target.document) <= 5);
    if (!candidates.length) return;
    const selection = await dialogUtils.selectTargetDialog('Cleave', 'Make a Cleave attack against another creature?', candidates, {buttons: 'yesNo'});
    const second = selection?.result;
    if (!second) return;
    if (turn) await workflow.actor.setFlag(MODULE, 'cleaveTurn', turn);
    const activityData = workflow.activity.toObject();
    // dnd5e adds @mod (and the magical bonus) only to the base damage part, and midi clamps a negative part to 0,
    // so a positive modifier is dropped by rolling the weapon's dice as an ordinary part instead.
    const system = workflow.item.system;
    if (abilityMod(workflow) > 0 && activityData.damage.includeBase && system.damage?.base?.formula) {
        const versatile = system.isVersatile && workflow.attackMode === 'twoHanded';
        const base = (versatile ? system.damage.versatile : system.damage.base).toObject();
        if (versatile) {
            base.number ||= system.damage.base.number;
            base.denomination ||= system.damage.base.steppedDenomination();
            base.types = system.damage.base.toObject().types;
        }
        if (system.magicAvailable && system.magicalBonus) base.bonus = [base.bonus, system.magicalBonus].filter(Boolean).join(' + ');
        activityData.damage.includeBase = false;
        activityData.damage.parts.unshift(base);
    }
    foundry.utils.setProperty(activityData, `flags.${MODULE}.cleave`, true);
    await workflowUtils.syntheticActivityDataRoll(activityData, workflow.item, [second], {consumeUsage: false, consumeResources: false});
}
async function graze(workflow, target) {
    if (workflow.hitTargets.size) return;
    const mod = abilityMod(workflow);
    if (mod > 0) await workflowUtils.applyDamage([target.document], mod, damageType(workflow));
}
async function push(workflow, target) {
    if (!workflow.hitTargets.has(target) || actorUtils.getSize(target.actor) > 3) return;
    if (!await dialogUtils.confirm('Push', `Push ${target.name} up to 10 feet away?`)) return;
    await tokenUtils.slideToken(target.document, {sourceToken: workflow.token.document, distance: 10});
}
async function sap(workflow, target) {
    if (!workflow.hitTargets.has(target)) return;
    await createEffect(target.actor, workflow, {
        name: 'Sapped',
        img: 'icons/skills/melee/sword-damaged-broken-red.webp',
        description: '<p>Disadvantage on the next attack roll before the start of the attacker\'s next turn.</p>',
        changes: [{key: 'flags.midi-qol.disadvantage.attack.all', type: 'custom', value: '1', phase: 'initial'}],
        duration: {expiry: 'sourceStart'},
        flags: {dae: {specialDuration: ['1Attack'], stackable: 'noneName'}}
    });
}
async function slow(workflow, target) {
    if (!workflow.hitTargets.has(target) || !dealtDamage(workflow, target)) return;
    await createEffect(target.actor, workflow, {
        name: 'Slowed',
        img: 'icons/equipment/feet/boots-galosh-white.webp',
        description: '<p>Speed reduced by 10 feet until the start of the attacker\'s next turn.</p>',
        changes: [{key: 'system.attributes.movement.bonus', type: 'add', value: '-10', phase: 'initial'}],
        duration: {expiry: 'sourceStart'},
        flags: {dae: {stackable: 'noneName'}}
    });
}
async function topple(workflow, target) {
    if (!workflow.hitTargets.has(target) || target.actor.statuses.has('prone')) return;
    if (!await dialogUtils.confirm('Topple', `Force ${target.name} to make a Constitution saving throw or fall Prone?`)) return;
    const dc = activityUtils.getSaveDC(workflow.activity);
    const saveData = {
        _id: 'mqToppleSave0000', type: 'save', name: 'Topple',
        save: {ability: ['con'], dc: {calculation: '', formula: String(dc)}},
        damage: {onSave: 'none', parts: []}
    };
    const save = await workflowUtils.syntheticActivityDataRoll(saveData, workflow.item, [target.document], {consumeUsage: false, consumeResources: false});
    const failed = Array.from(save?.failedSaves ?? []).some(token => (token.document ?? token).uuid === target.document.uuid);
    if (failed) await actorUtils.applyConditions(target.actor, ['prone']);
}
async function vex(workflow, target) {
    if (!workflow.hitTargets.has(target) || !dealtDamage(workflow, target)) return;
    await createEffect(workflow.actor, workflow, {
        name: 'Vex',
        img: 'icons/magic/control/fear-fright-mask-yellow.webp',
        description: `<p>Advantage on the next attack roll against ${target.name} before the end of the next turn.</p>`,
        duration: {expiry: 'targetEnd'},
        flags: {[MODULE]: {vexTarget: target.document.uuid}, dae: {stackable: 'multi'}}
    });
}
const masteries = {cleave, graze, push, sap, slow, topple, vex};
function vexEffects(actor, target) {
    return actor.effects.filter(effect => effect.flags?.[MODULE]?.vexTarget === target.document.uuid);
}
async function attackRollConfig({workflow}) {
    const target = workflow.targets.first();
    if (!target || !workflowUtils.isAttackType(workflow, 'attack')) return;
    if (vexEffects(workflow.actor, target).length) workflow.tracker.advantage.add('vex', 'Vex');
}
async function rollFinished({workflow}) {
    const target = workflow.targets.first();
    if (!target || !workflow.actor || !workflowUtils.isAttackType(workflow, 'attack')) return;
    const used = vexEffects(workflow.actor, target);
    if (used.length) await workflow.actor.deleteEmbeddedDocuments('ActiveEffect', used.map(effect => effect.id));
    if (!workflowUtils.isAttackType(workflow, 'weaponAttack')) return;
    const mastery = masteries[workflow.attackRoll?.options?.mastery];
    if (!mastery || !workflow.token) return;
    try {
        await mastery(workflow, target);
    } catch (error) {
        console.error(`midi-qol | Weapon Mastery ${workflow.attackRoll.options.mastery} failed`, error);
    }
}
export const weaponMastery = {
    name: 'Weapon Mastery',
    version: '1.0.0',
    rules: '2024',
    roll: [
        {pass: 'actorAttackRollConfig', macro: attackRollConfig, priority: 50},
        {pass: 'actorRollFinished', macro: rollFinished, priority: 50}
    ]
};
