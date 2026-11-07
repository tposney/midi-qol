import {effectUtils, tokenUtils, workflowUtils} from '../proxy.mjs';
import {onCreatureDeath} from './death.mjs';
// Runs one of the item's activities from an emanation, from flags.midi-qol.auraTurn entries:
// {activity, when: 'targetTurnStart'|'targetTurnEnd'|'ownerTurnStart'|'ownerTurnEnd'|'death', distance (ft, default the activity's template size),
//  disposition: 'enemy'|'ally'|'any', excludeSameName, targetSeesOwner, notIncapacitated, flyingOnly, requireItem (name),
//  grappleLinked (the target or the owner is grappled, within 5 ft), requireOwnerEffect (effect name:
//  only while the owner has it), requireNearbySame {count, distance} (near enough other
//  creatures of the owner's name), skipIfEffect (effect name: a target that has it already is left alone),
//  immuneOnSave: seconds, immuneScope: 'all'|'owner', targetEffect (effect name: only creatures with that effect from this
//  item)}.
// targetTurnStart: the creature starting its turn in range. ownerTurnEnd: every creature in range at the end of the
// owner's turn. death: every creature in range when the owner dies (death.mjs).
// A creature that saves can be made immune (Stench: to every Stench; 'owner': only this one's).
const MODULE = 'midi-qol';
function entriesFor(item, when) {
    const entries = item.flags?.[MODULE]?.auraTurn;
    return Array.isArray(entries) ? entries.filter(e => e.when === when) : [];
}
function immunityKey(item, owner, entry) {
    return entry.immuneScope === 'owner' ? `${item.name}:${owner.actor?.uuid}` : item.name;
}
function qualifies(item, owner, target, entry, activity) {
    if (!target?.actor || target.id === owner.id || target.parent !== owner.parent) return false;
    if (entry.when !== 'death' && (owner.actor?.statuses.has('incapacitated') || owner.actor?.statuses.has('dead'))) return false;
    const distance = entry.distance ?? activity.target?.template?.size ?? 5;
    if (tokenUtils.getDistance(owner, target) > distance) return false;
    if (entry.disposition === 'enemy' && !tokenUtils.isEnemy(owner, target)) return false;
    if (entry.disposition === 'ally' && tokenUtils.isEnemy(owner, target)) return false;
    if (entry.excludeSameName && target.actor.name === owner.actor?.name) return false;
    if (entry.notIncapacitated && target.actor.statuses.has('incapacitated')) return false;
    if (entry.targetSeesOwner && !tokenUtils.canSee(target, owner)) return false;
    if (entry.flyingOnly && !(target.actor.statuses.has('flying') || target.elevation > owner.elevation)) return false;
    if (entry.grappleLinked && !(target.actor.statuses.has('grappled') || owner.actor?.statuses.has('grappled'))) return false;
    if (entry.skipIfEffect && target.actor.effects.some(e => e.name === entry.skipIfEffect)) return false;
    if (entry.targetEffect && !target.actor.effects.some(e => e.name === entry.targetEffect && (e.origin ?? '').startsWith(item.uuid))) return false;
    const key = immunityKey(item, owner, entry);
    return !target.actor.effects.some(e => e.flags?.[MODULE]?.auraImmune === key);
}
function ownerActive(owner, entry) {
    if (entry.requireOwnerEffect && !owner.actor?.effects.some(e => e.name === entry.requireOwnerEffect && !e.disabled)) return false;
    if (entry.requireNearbySame) {
        const {count = 1, distance = 5} = entry.requireNearbySame;
        const near = owner.parent.tokens.filter(t => t.id !== owner.id && t.actor?.name === owner.actor?.name && tokenUtils.getDistance(owner, t) <= distance);
        if (near.length < count) return false;
    }
    return true;
}
async function run(item, owner, entry, targets) {
    if (!ownerActive(owner, entry)) return;
    const activity = item.system.activities.get(entry.activity);
    if (entry.requireItem && !owner.actor?.items.some(i => i.name === entry.requireItem && (i.system.quantity ?? 1) > 0)) return;
    targets = targets.filter(t => qualifies(item, owner, t, entry, activity));
    if (!activity || !targets.length) return;
    // Without the activity's emanation, which midi would target instead (the owner and everyone in it).
    const data = activity.toObject();
    data.target = {...data.target, template: {...data.target?.template, type: '', size: ''}, affects: {...data.target?.affects, type: 'creature', count: String(targets.length)}};
    const workflow = await workflowUtils.syntheticActivityDataRoll(data, item, targets, {consumeUsage: false, consumeResources: false,
        config: {create: {measuredTemplate: false}}, options: {workflowOptions: {targetConfirmation: 'none', allowIncapacitated: entry.when === 'death'}}});
    if (!entry.immuneOnSave || !workflow?.saves?.count) return workflow;
    const key = immunityKey(item, owner, entry);
    for (const saved of workflow.saves.documents) {
        const actor = saved.actor;
        await effectUtils.createEffects(actor, [{
            name: `${item.name}: Immune`,
            img: item.img,
            duration: {value: entry.immuneOnSave, units: 'seconds'},
            flags: {[MODULE]: {auraImmune: key}}
        }]);
    }
    return workflow;
}
async function everyTurn({document: item, token, combatant, previousTurn}) {
    if (!token) return;
    const ended = Number.isInteger(previousTurn) ? (combatant?.parent ?? game.combat)?.turns[previousTurn]?.token : null;
    if (ended) for (const entry of entriesFor(item, 'targetTurnEnd')) await run(item, token, entry, [ended]);
    const target = combatant?.token;
    if (target) for (const entry of entriesFor(item, 'targetTurnStart')) await run(item, token, entry, [target]);
}
async function turnStart({document: item, token}) {
    if (!token) return;
    for (const entry of entriesFor(item, 'ownerTurnStart')) await run(item, token, entry, [...token.parent.tokens]);
}
async function turnEnd({document: item, token}) {
    if (!token) return;
    for (const entry of entriesFor(item, 'ownerTurnEnd')) await run(item, token, entry, [...token.parent.tokens]);
}
// Death entries: every creature in range when the owner dies (death.mjs), linked to the card of the use it died in.
onCreatureDeath(async ({actor, token, parentCard}) => {
    for (const item of actor.items) {
        for (const entry of entriesFor(item, 'death')) {
            const workflow = await run(item, token, entry, [...token.parent.tokens]);
            const card = parentCard && workflow?.itemCardUuid ? fromUuidSync(workflow.itemCardUuid) : null;
            if (card && !card._source.system?.origin) await card.update({'system.origin': parentCard.id});
        }
    }
});
export const auraTurn = {
    name: 'Aura Turn',
    version: '1.0.0',
    rules: 'all',
    combat: [
        {pass: 'actorEveryTurn', macro: everyTurn, priority: 50},
        {pass: 'actorTurnEnd', macro: turnEnd, priority: 50},
        {pass: 'actorTurnStart', macro: turnStart, priority: 50}
    ]
};
