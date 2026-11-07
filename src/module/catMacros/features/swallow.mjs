import {documentUtils, effectUtils, workflowUtils} from '../proxy.mjs';
import {toggleStatus} from '../../utils.js';
// Swallow (Behir, Purple Worm, Remorhaz, Tarrasque, Kraken, Giant Frog, Giant Toad). For each creature swallowed the
// swallower carries a "Swallowing" effect naming it; the creature's Swallowed effect (the item's restrained/total cover
// effect) depends on it, so ending one ends both. A swallowed token rides inside the swallower and takes the item's
// damage. Damage the swallower takes from inside in one turn is totalled; at or over the threshold it makes the
// regurgitate save at the end of that turn, and on a failure every swallowed creature is placed beside it, prone. If the
// swallower drops to 0 hit points they get out the same way.
// flags.midi-qol.swallow = {activity, damageActivity, regurgitateActivity, escapeActivity, capacity (default 1),
//   damageAt: 'ownerStart' (default) | 'ownerEnd' | 'swallowedStart' | 'ownerNextEnd' (once, at the end of the
//   swallower's next turn, then a survivor is disgorged prone: Giant Frog), threshold, requireGrappled, attackItem
//   (identifier of an item whose attack must hit first)}. Without it the activities' roles and the description's text
//   are used.
const MODULE = 'midi-qol';
const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
const SIZE_KEYS = {tiny: 0, sm: 1, med: 2, lg: 3, huge: 4, grg: 5};
const WORDS = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6};

function config(item) {
    const activities = item.system.activities.contents;
    const text = [item.system.description.value, ...activities.map(a => a.activation?.condition ?? '')].join(' ');
    const swallow = activities.find(a => ['action', 'bonus'].includes(a.activation?.type) && ['utility', 'save'].includes(a.type) && !/escape/i.test(a.name));
    const capacity = text.match(/up to (\w+) creatures? swallowed/i)?.[1];
    const defaults = {
        activity: swallow?.id,
        damageActivity: activities.find(a => a.type === 'damage')?.id,
        regurgitateActivity: activities.find(a => a.type === 'save' && a !== swallow)?.id,
        escapeActivity: activities.find(a => a.type === 'utility' && /escape/i.test(a.name))?.id,
        capacity: capacity ? (WORDS[capacity.toLowerCase()] ?? Number(capacity) ?? 1) : 1,
        damageAt: 'ownerStart',
        threshold: Number(text.match(/takes (\d+) damage or more/i)?.[1]) || null,
        requireGrappled: /grappl/i.test(`${swallow?.target?.affects?.special ?? ''} ${item.system.description.value}`),
        attackItem: swallow?.type === 'utility' && item.actor?.items.some(i => i.system.identifier === 'tentacles') ? 'tentacles' : null
    };
    return {...defaults, ...(item.flags?.[MODULE]?.swallow ?? {})};
}
function turnStamp(combat = game.combat, round = combat?.round, turn = combat?.turn) {
    return combat?.started ? `${combat.id}.${round}.${turn}` : null;
}
function holderToken(actor, scene = canvas.scene) {
    return actor.token ?? actor.getActiveTokens(false, true).find(t => t.parent === scene);
}
function holderEffects(item) {
    return item.actor?.effects.filter(e => e.flags?.[MODULE]?.swallowing?.itemUuid === item.uuid) ?? [];
}
const swallowedToken = effect => fromUuidSync(effect.flags[MODULE].swallowing.tokenUuid, {strict: false});
// The holder's grapple on the target: CAT's grapple effect (its grappled status is a separate condition), or a grappled
// effect from the holder.
function grappleEffects(target, holder, holderTokenDoc) {
    return target.effects.filter(e => (e.flags?.cat?.identifier === 'grappleTarget' && e.flags.cat.grapple?.tokenId === holderTokenDoc?.id)
        || (e.statuses.has('grappled') && e.origin?.startsWith(holder.uuid)));
}
function sizeLimit(activity) {
    const match = activity?.target?.affects?.special?.match(/\b(tiny|small|medium|large|huge|gargantuan)\b or smaller/i);
    return match ? SIZES.indexOf(match[1].toLowerCase()) : null;
}
function itemEffectData(item, test) {
    const effect = item.effects.find(test);
    if (!effect) return;
    const data = effect.toObject();
    delete data._id;
    data.transfer = false;
    data.disabled = false;
    return data;
}
function besideHolder(holderDoc, targetDoc) {
    const scene = holderDoc.parent;
    const size = scene.grid.size;
    const hw = holderDoc.width * size, hh = holderDoc.height * size;
    const tw = targetDoc.width * size, th = targetDoc.height * size;
    const candidates = [[hw, 0], [-tw, 0], [0, hh], [0, -th], [hw, hh], [-tw, -th], [hw, -th], [-tw, hh]]
        .map(([dx, dy]) => ({x: holderDoc.x + dx, y: holderDoc.y + dy}));
    const rect = scene.dimensions.sceneRect;
    const free = ({x, y}) => x >= rect.x && y >= rect.y && x + tw <= rect.right && y + th <= rect.bottom
        && !scene.tokens.some(t => t !== targetDoc && t !== holderDoc && x < t.x + t.width * size && t.x < x + tw && y < t.y + t.height * size && t.y < y + th);
    return candidates.find(free) ?? candidates[0];
}
function centreOn(holderDoc, targetDoc) {
    const size = holderDoc.parent.grid.size;
    return {
        x: holderDoc.x + (holderDoc.width - targetDoc.width) * size / 2,
        y: holderDoc.y + (holderDoc.height - targetDoc.height) * size / 2,
        elevation: holderDoc.elevation
    };
}
async function note(actor, content) {
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: `<p>${content}</p>`});
}
async function swallowTarget(item, holderDoc, targetDoc) {
    const holder = item.actor, target = targetDoc.actor;
    const c = config(item);
    if (!target || holderEffects(item).length >= c.capacity || holderEffects(item).some(e => e.flags[MODULE].swallowing.tokenUuid === targetDoc.uuid)) return;
    const grapples = grappleEffects(target, holder, holderDoc);
    if (grapples.length) await documentUtils.deleteEmbeddedDocuments(target, 'ActiveEffect', grapples.map(e => e.id));
    const [holderEffect] = await effectUtils.createEffects(holder, [{
        name: `${item.name}: ${targetDoc.name}`,
        img: item.img,
        origin: item.uuid,
        flags: {[MODULE]: {swallowing: {itemUuid: item.uuid, tokenUuid: targetDoc.uuid, stamp: turnStamp()}}}
    }]) ?? [];
    if (!holderEffect) return;
    const swallowed = itemEffectData(item, e => e.statuses.has('restrained') && (e.statuses.has('coverTotal') || e.statuses.has('blinded')))
        ?? {name: 'Swallowed', img: item.img, statuses: ['blinded', 'restrained', 'coverTotal']};
    swallowed.name = `Swallowed (${holderDoc.name})`;
    swallowed.origin = holderEffect.uuid;
    foundry.utils.setProperty(swallowed, `flags.${MODULE}.swallowedBy`, holderEffect.uuid);
    foundry.utils.setProperty(swallowed, 'flags.dnd5e.dependentOn', holderEffect.uuid);
    await effectUtils.createEffects(target, [swallowed]);
    await documentUtils.update(targetDoc, {...centreOn(holderDoc, targetDoc), sort: holderDoc.sort - 1}, {animate: false});
    await note(holder, `<strong>${item.name}</strong>: ${holderDoc.name} swallows ${targetDoc.name}.`);
}
// Ends one swallow. A regurgitated creature lands prone beside the swallower; one escaping a corpse exits prone.
async function releaseOne(holderEffect, {prone = true} = {}) {
    const actor = holderEffect.parent;
    const targetDoc = swallowedToken(holderEffect);
    const holderDoc = holderToken(actor, targetDoc?.parent);
    const target = targetDoc?.actor;
    // The Swallowed effect goes first, flagged so the upkeep hook leaves the Swallowing effect to this function.
    const swallowed = target?.effects.filter(e => e.flags?.[MODULE]?.swallowedBy === holderEffect.uuid) ?? [];
    if (swallowed.length) await documentUtils.deleteEmbeddedDocuments(target, 'ActiveEffect', swallowed.map(e => e.id), {options: {[MODULE]: {release: true}}});
    if (actor.effects.has(holderEffect.id)) await documentUtils.deleteDocument(holderEffect);
    if (!target) return;
    if (holderDoc) await documentUtils.update(targetDoc, besideHolder(holderDoc, targetDoc), {animate: false});
    if (prone && !target.statuses.has('prone')) await toggleStatus(target, 'prone', {active: true});
    return targetDoc;
}
async function releaseAll(item, options) {
    const released = [];
    for (const effect of holderEffects(item)) {
        const doc = await releaseOne(effect, options);
        if (doc) released.push(doc.name);
    }
    return released;
}
async function regurgitateSave(item) {
    const c = config(item);
    const regurgitate = item.system.activities.get(c.regurgitateActivity);
    const dc = regurgitate?.save?.dc?.value;
    const ability = regurgitate?.save?.ability?.first() ?? 'con';
    if (!holderEffects(item).length || !dc) return;
    const rolls = await item.actor.rollSavingThrow({ability, target: dc}, {configure: false});
    const roll = rolls?.[0];
    if (!roll || roll.total >= dc) return;
    const released = await releaseAll(item);
    await note(item.actor, `<strong>${item.name}</strong>: ${item.actor.name} regurgitates ${released.join(', ') || 'the swallowed creatures'}, which land prone.`);
}
// The item's damage to swallowed creatures; from inside, so their total cover doesn't apply.
async function damageSwallowed(item, targetDocs) {
    const damage = item.system.activities.get(config(item).damageActivity);
    if (!damage || !targetDocs.length) return;
    const data = damage.toObject();
    data.midiProperties = {...data.midiProperties, ignoreFullCover: true};
    data.target = {...data.target, affects: {...data.target?.affects, type: 'creature', count: String(targetDocs.length)}};
    await workflowUtils.syntheticActivityDataRoll(data, item, targetDocs, {consumeUsage: false, consumeResources: false,
        options: {workflowOptions: {targetConfirmation: 'none'}}});
}
function liveSwallowed(item) {
    const docs = [];
    for (const effect of holderEffects(item)) {
        const doc = swallowedToken(effect);
        if (doc?.actor) docs.push(doc);
    }
    return docs;
}
// Regurgitate and Escape used by hand run the save or the release instead of a workflow: before targeting, as the
// swallowed creatures have total cover.
async function preTargeting({document: item, activity}) {
    if (activity?.item?.uuid !== item.uuid) return;
    const c = config(item);
    if (activity?.id === c.regurgitateActivity) {
        await regurgitateSave(item);
        return true;
    }
    if (activity?.id === c.escapeActivity) {
        await releaseAll(item);
        return true;
    }
}
async function preItemRoll({document: item, workflow}) {
    if (workflow.item?.uuid !== item.uuid) return;
    const c = config(item);
    const swallow = item.system.activities.get(c.activity);
    if (!swallow || workflow.activity?.id !== swallow.id) return;
    const holderDoc = workflow.token?.document ?? holderToken(item.actor);
    const targetDoc = workflow.targets.documents[0];
    const target = targetDoc?.actor;
    let reason;
    if (holderEffects(item).length >= c.capacity) reason = c.capacity === 1 ? `${item.actor.name} already has a creature swallowed.` : `${item.actor.name} already has ${c.capacity} creatures swallowed.`;
    else if (!target || workflow.targets.count !== 1) reason = 'Target one creature.';
    else if (sizeLimit(swallow) !== null && (SIZE_KEYS[target.system.traits.size] ?? 2) > sizeLimit(swallow)) reason = `${targetDoc.name} is too large to swallow.`;
    else if (c.requireGrappled && !grappleEffects(target, item.actor, holderDoc).length) reason = `${targetDoc.name} is not grappled by ${item.actor.name}.`;
    if (!reason) return;
    ui.notifications.warn(`${item.name}: ${reason}`);
    workflow.aborted = true;
    return true;
}
async function rollFinished({document: item, workflow}) {
    // Only this item's own use: another Swallow (a copy on the same creature) has the same activity ids.
    if (workflow.item?.uuid !== item.uuid) return;
    const c = config(item);
    const swallow = item.system.activities.get(c.activity);
    if (!swallow || workflow.activity?.id !== swallow.id) return;
    const holderDoc = workflow.token?.document ?? holderToken(item.actor);
    const targetDoc = workflow.targets.documents[0];
    if (!holderDoc || !targetDoc) return;
    if (swallow.type === 'save') {
        // Only a creature small enough is swallowed (the Kraken's save also hurts a larger one).
        const limit = sizeLimit(swallow);
        if (limit !== null && (SIZE_KEYS[targetDoc.actor?.system.traits.size] ?? 2) > limit) return;
        if (workflow.failedSaves.has(targetDoc)) await swallowTarget(item, holderDoc, targetDoc);
        return;
    }
    if (!c.attackItem) return swallowTarget(item, holderDoc, targetDoc);
    // An attack must hit first (a Tentacles attack against the grappled creature).
    const attack = item.actor.items.find(i => i.system.identifier === c.attackItem)?.system.activities.find(a => a.type === 'attack');
    if (!attack) return;
    const attackWorkflow = await workflowUtils.syntheticActivityRoll(attack, [targetDoc], {consumeUsage: false, consumeResources: false});
    if (attackWorkflow?.hitTargets?.has(targetDoc)) await swallowTarget(item, holderDoc, targetDoc);
}
async function turnStart({document: item}) {
    if (config(item).damageAt !== 'ownerStart') return;
    await damageSwallowed(item, liveSwallowed(item));
}
async function turnEnd({document: item, round, turn, combatant}) {
    const c = config(item);
    if (c.damageAt === 'ownerEnd') return damageSwallowed(item, liveSwallowed(item));
    if (c.damageAt !== 'ownerNextEnd') return;
    // Once, at the end of the swallower's next turn (not the turn it swallowed in); a survivor is then disgorged.
    const ending = turnStamp(combatant?.parent ?? game.combat, round, turn);
    const due = holderEffects(item).filter(e => e.flags[MODULE].swallowing.stamp !== ending);
    const docs = due.map(swallowedToken).filter(doc => doc?.actor);
    if (!docs.length) return;
    await damageSwallowed(item, docs);
    for (const effect of due) {
        const doc = swallowedToken(effect);
        if (!doc?.actor || doc.actor.system.attributes.hp.value <= 0) continue;
        await releaseOne(effect);
        await note(item.actor, `<strong>${item.name}</strong>: ${item.actor.name} disgorges ${doc.name}, which lands prone.`);
    }
}
async function damaged({document: item, ditem, workflow}) {
    const c = config(item);
    if (!c.threshold || !holderEffects(item).length || !ditem || ditem.actorUuid !== item.actor.uuid) return;
    const attacker = workflow.token?.document?.uuid ?? workflow.token?.uuid;
    if (!holderEffects(item).some(e => e.flags[MODULE].swallowing.tokenUuid === attacker)) return;
    const stamp = turnStamp();
    const amount = Math.max(0, ditem.totalDamage ?? 0);
    if (!stamp || !amount) return;
    const tracked = item.getFlag(MODULE, 'swallowDamage');
    await item.setFlag(MODULE, 'swallowDamage', {stamp, total: (tracked?.stamp === stamp ? tracked.total : 0) + amount});
}
// At the start of each turn: if the creatures inside dealt enough damage during the turn that just ended, save; a
// swallowed creature starting its own turn takes the damage (Kraken).
async function everyTurn({document: item, combatant, previousRound, previousTurn}) {
    const c = config(item);
    const combat = combatant?.parent ?? game.combat;
    if (c.damageAt === 'swallowedStart') {
        const current = combatant?.token;
        const inside = holderEffects(item).some(e => e.flags[MODULE].swallowing.tokenUuid === current?.uuid);
        if (inside) await damageSwallowed(item, [current]);
    }
    const tracked = item.getFlag(MODULE, 'swallowDamage');
    if (!tracked || !c.threshold || tracked.stamp !== turnStamp(combat, previousRound, previousTurn) || tracked.total < c.threshold) return;
    await item.unsetFlag(MODULE, 'swallowDamage');
    await regurgitateSave(item);
}
// GM-side upkeep: swallowed tokens follow the swallower; a swallower at 0 hit points lets them out; a Swallowed effect
// removed by hand ends its Swallowing effect. Registered on catReady.
export function registerSwallowHooks() {
    Hooks.on('moveToken', (tokenDoc, movement) => {
        if (!game.users.activeGM?.isSelf || !movement?.destination) return;
        for (const effect of tokenDoc.actor?.effects ?? []) {
            if (!effect.flags?.[MODULE]?.swallowing) continue;
            const targetDoc = swallowedToken(effect);
            if (targetDoc?.parent === tokenDoc.parent) targetDoc.update(centreOn({...movement.destination, parent: tokenDoc.parent}, targetDoc), {animate: false});
        }
    });
    Hooks.on('updateActor', async (actor, changes) => {
        if (!game.users.activeGM?.isSelf || foundry.utils.getProperty(changes, 'system.attributes.hp.value') !== 0) return;
        const items = new Set(actor.effects.filter(e => e.flags?.[MODULE]?.swallowing).map(e => e.flags[MODULE].swallowing.itemUuid));
        for (const uuid of items) {
            const item = fromUuidSync(uuid, {strict: false});
            if (!item) continue;
            const released = await releaseAll(item);
            await note(actor, `<strong>${item.name}</strong>: ${released.join(', ') || 'The swallowed creatures'} escape the corpse of ${actor.name} using some of their movement, and are prone.`);
        }
    });
    Hooks.on('deleteActiveEffect', (effect, options) => {
        const holderUuid = effect.flags?.[MODULE]?.swallowedBy;
        if (!holderUuid || options?.[MODULE]?.release || !game.users.activeGM?.isSelf) return;
        fromUuidSync(holderUuid, {strict: false})?.delete();
    });
}
export const swallow = {
    name: 'Swallow',
    version: '1.1.0',
    rules: 'all',
    roll: [
        {pass: 'itemPreTargeting', macro: preTargeting, priority: 50},
        {pass: 'itemPreItemRoll', macro: preItemRoll, priority: 50},
        {pass: 'itemRollFinished', macro: rollFinished, priority: 50},
        {pass: 'targetDamageComplete', macro: damaged, priority: 250}
    ],
    combat: [
        {pass: 'actorTurnStart', macro: turnStart, priority: 50},
        {pass: 'actorTurnEnd', macro: turnEnd, priority: 50},
        {pass: 'actorEveryTurn', macro: everyTurn, priority: 50}
    ]
};
