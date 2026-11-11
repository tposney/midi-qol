import {dialogUtils, documentUtils, effectUtils, tokenUtils} from '../proxy.mjs';
import {applyStatusCondition} from '../../utils.js';
import {addCardNote} from '../../lib/cardNotes.js';
import {Workflow} from '../../Workflow.js';
import {HIDING, hiddenDC, hiddenFrom, hidingCondition, hidingConditionId, passivePerception} from '../../lib/hiding.js';
// 2024 Hide and Search. Hide is a DC 15 Stealth check; on a success the creature gets dnd5e's Hiding condition, carrying
// the check's total as the DC to find it (flags.midi-qol.hidden.dc). midi treats Hiding as Invisible towards each creature
// that doesn't perceive the hider (lib/hiding.ts). The activity's configured effect (with CPR before 2.1.18 active,
// applied by CPR's generic hide macro for its animation) carries no status: it times the hide (DAE 1Attack, ending it
// on an attack roll). It and the condition are each other's dnd5e dependents, so either ending ends the hide: an attack,
// a spell with a Verbal component (hook below), being found (Search) or the condition removed by hand. CPR 2.1.18's
// generic hide applies the condition itself (with the DC and 1Attack), and midi only tells the GM. Noise and the
// cover/obscurement requirement are the GM's. Search (any Perception check activity can use it) compares the check's
// total with each hidden enemy in the searcher's line of sight; those found (confirmed by the GM, Search option GM
// Confirms) stop hiding.
const MODULE = 'midi-qol';
const gmWhisper = () => game.users.filter(u => u.isGM).map(u => u.id);
const cprActive = () => !!game.modules.get('chris-premades')?.active;
// From 2.1.18 CPR's generic hide applies the Hiding condition itself, with no configured Hidden effect.
const cprAppliesCondition = () => {
    const cpr = game.modules.get('chris-premades');
    return !!cpr?.active && foundry.utils.isNewerVersion(cpr.version, '2.1.17');
};
// Results are notes on the action's card (`origin`, its id), so deleting it (or a Generic Actions card above it) deletes them.
const post = (actor, content, origin, whisper) => {
    const card = origin && game.messages.get(origin);
    if (card) return addCardNote(card, content, whisper ? {whisper} : {});
    return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content, whisper});
};
const usesMacro = (activity, source) => activity?.flags?.cat?.macros?.roll?.some(m => m.source === source && m.identifier === 'hide');
const configuredEffect = (activity, source) => activity.flags.cat?.genericConfig?.[source]?.hide?.effect;
// The activity's midi Hide/Search option `key` (CAT generic config), else its default.
const option = (activity, identifier, key, fallback) => activity?.flags.cat?.genericConfig?.[MODULE]?.[identifier]?.[key] ?? fallback;
function hideTotal(workflow) {
    const token = workflow.token?.document ?? workflow.token;
    const total = workflow.tokenSaves?.[token?.uuid]?.total;
    return Number.isFinite(total) && !workflow.failedSaves?.count ? total : undefined;
}
// The condition has a fixed id, so its uuid is known before it exists.
const conditionUuid = actor => `${actor.uuid}.ActiveEffect.${hidingConditionId()}`;
const dependsOn = (effect, uuid) => !!effect.flags?.dnd5e?.dependents?.some(d => d.uuid === uuid);
// The hide effect's data: no statuses (the condition is the hide), the condition its dependent.
function asHideEffect(actor) {
    return {statuses: [], flags: {dnd5e: {dependents: [{uuid: conditionUuid(actor)}]}}};
}
// Ends a hide: its Hide effect goes with the condition (dependents). A searcher may not own the hider: CAT deletes as GM.
async function endHide(actor) {
    const condition = hidingCondition(actor);
    if (condition) await documentUtils.deleteDocument(condition);
}
async function markHidden(actor, effect, dc, origin) {
    // Hiding afresh: the old hide (condition and Hide effects) ends first, in one deletion, so nothing chases it.
    const old = [hidingCondition(actor), ...actor.effects.filter(e => e !== effect && dependsOn(e, conditionUuid(actor)))].filter(e => e);
    if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old.map(e => e.id));
    await applyStatusCondition(actor, HIDING, {prepare: data => {
        foundry.utils.setProperty(data, `flags.${MODULE}.hidden.dc`, dc);
        if (origin) foundry.utils.setProperty(data, `flags.${MODULE}.hidden.card`, origin);
        foundry.utils.setProperty(data, 'flags.dnd5e.dependents', [{uuid: effect.uuid}]);
    }});
}
// The card of the use that applied a condition without one recorded (CPR's): its item's running workflow on this client.
function useCard(effect) {
    const source = effect.origin ? fromUuidSync(effect.origin) : undefined;
    const item = source instanceof Item ? source : source?.item ?? (source?.parent instanceof Item ? source.parent : undefined);
    return item ? Workflow.runningFor(item)?.itemCardId : undefined;
}
// Tells the GM of a hide, whoever applied its condition (midi's Hide, CPR's): on the client that created it.
Hooks.on('createActiveEffect', async (effect, options, userId) => {
    if (userId !== game.user.id || effect.id !== hidingConditionId() || !(effect.parent instanceof Actor)) return;
    const dc = effect.flags?.[MODULE]?.hidden?.dc;
    if (dc === undefined) return;
    const actor = effect.parent;
    const token = actor.getActiveTokens(false, true)[0];
    // Enemies the hide doesn't fool, with why: vision disabled (sees everything unless Force vision) or passive Perception
    const perceive = token ? token.parent.tokens.filter(t => t.actor && tokenUtils.isEnemy(token, t) && !hiddenFrom(token, t)) : [];
    const why = t => t.sight.enabled ? `passive ${passivePerception(t.actor)}` : 'vision disabled';
    const perceivers = perceive.length ? ` Perceived by: ${perceive.map(t => `${t.name} (${why(t)})`).join(', ')}.` : '';
    const card = effect.flags[MODULE].hidden.card ?? useCard(effect);
    await post(actor, `<p>${actor.name} is hidden: Perception DC ${dc} to find.${perceivers}</p>`, card, gmWhisper());
});
// Whichever macro creates the Hide effect (CPR's before 2.1.18, for its animation, or midi's) does so after midi's
// RollComplete, from its roll-finished pass: the total is kept until then, and the effect is recognised by its origin
// (the activity's configured effect) as it is created.
const cprHides = activity => cprActive() && usesMacro(activity, 'chris-premades');
const pendingHide = new Map();
const pendingFor = effect => {
    const pending = effect.parent && pendingHide.get(effect.parent.uuid);
    return pending && effect.origin === pending.origin ? pending : undefined;
};
Hooks.on('midi-qol.RollComplete', workflow => {
    const activity = workflow.activity;
    if (!workflow.actor || !(usesMacro(activity, 'chris-premades') || usesMacro(activity, MODULE))) return;
    if (cprHides(activity) && cprAppliesCondition()) return;
    const effectId = cprHides(activity) ? configuredEffect(activity, 'chris-premades') : configuredEffect(activity, MODULE) ?? configuredEffect(activity, 'chris-premades');
    const total = hideTotal(workflow);
    if (effectId && total !== undefined) pendingHide.set(workflow.actor.uuid, {origin: `${activity.item.uuid}.ActiveEffect.${effectId}`, total, card: workflow.itemCardId});
});
Hooks.on('preCreateActiveEffect', effect => {
    if (pendingFor(effect)) effect.updateSource(asHideEffect(effect.parent));
});
Hooks.on('createActiveEffect', async effect => {
    const pending = pendingFor(effect);
    if (!pending) return;
    pendingHide.delete(effect.parent.uuid);
    await markHidden(effect.parent, effect, pending.total, pending.card);
});
async function hide({document: activity, workflow}) {
    if (cprHides(activity)) return;
    const pending = workflow.actor && pendingHide.get(workflow.actor.uuid);
    const source = pending && fromUuidSync(pending.origin);
    if (!source) return;
    const data = source.toObject();
    delete data._id;
    data.transfer = false;
    data.origin = source.uuid;
    await effectUtils.createEffects(workflow.actor, [data]);
}
function inSight(searcher, target) {
    const viewer = searcher.object, other = target.object;
    if (!viewer || !other) return false;
    return !viewer.checkCollision(other.center, {origin: viewer.center, type: viewer.vision ? 'sight' : 'move', mode: 'any'});
}
async function search({workflow}) {
    const actor = workflow.actor;
    const searcher = workflow.token?.document ?? actor.getActiveTokens(false, true)[0];
    const total = workflow.tokenSaves?.[searcher?.uuid]?.total;
    if (!Number.isFinite(total)) return;
    const candidates = searcher.parent.tokens.filter(t => t.id !== searcher.id && hidingCondition(t.actor) && tokenUtils.isEnemy(searcher, t) && inSight(searcher, t));
    if (!candidates.length) return;
    const dc = t => hiddenDC(t.actor);
    const found = candidates.filter(t => total >= dc(t));
    const missed = candidates.filter(t => total < dc(t)).map(t => `${t.name} (DC ${dc(t)})`).join(', ');
    if (!found.length) return post(actor, `<p>${actor.name} (Perception ${total}) finds no one${missed ? `; still hidden: ${missed}` : ''}.</p>`, workflow.itemCardId, gmWhisper());
    const list = found.map(t => `${t.name} (DC ${dc(t)})`).join(', ');
    const go = !option(workflow.activity, 'search', 'confirm', true) || await dialogUtils.confirm(workflow.item.name, `${actor.name} rolled Perception ${total}. Found: ${list}.${missed ? ` Still hidden: ${missed}.` : ''} Reveal them?`, {userId: (game.users.activeGM ?? game.user).id});
    if (!go) return;
    for (const t of found) await endHide(t.actor);
    await post(actor, `<p>${actor.name} finds ${found.map(t => t.name).join(', ')}.</p>`, workflow.itemCardId);
}
// Casting a spell with a Verbal component ends Hidden.
Hooks.on('dnd5e.postUseActivity', activity => {
    const item = activity?.item;
    if (item?.type !== 'spell' || !item.system.properties?.has('vocal')) return;
    if (hidingCondition(activity.actor)?.isOwner) endHide(activity.actor);
});
export const hideAction = {
    name: 'Hide',
    version: '1.6.1',
    rules: 'all',
    generic: true,
    documents: ['activity'],
    roll: [{pass: 'activityRollFinished', macro: hide, priority: 50}],
    genericConfig: {
        effect: {default: '', type: 'selectEffect', category: 'behavior', label: 'Effect'}
    }
};
export const searchAction = {
    name: 'Search',
    version: '1.2.0',
    rules: 'all',
    generic: true,
    documents: ['activity'],
    roll: [{pass: 'activityRollFinished', macro: search, priority: 50}],
    genericConfig: {
        confirm: {default: true, type: 'checkbox', category: 'behavior', label: 'GM Confirms',
            hint: 'Ask the GM before revealing the hidden creatures a Search finds. Off: they are revealed at once.'}
    }
};
