import {dialogUtils, documentUtils, effectUtils, tokenUtils} from '../proxy.mjs';
// 2024 Hide and Search. Hide is a DC 15 Stealth check whose configured effect makes the creature Invisible; the check's
// total is recorded on that effect as the DC to find it (flags.midi-qol.hidden.dc). With CPR active, CPR's generic hide
// macro applies the effect (Supreme Sneak, animation) and midi only records the DC, for any activity using CPR's macro;
// without CPR midi's hide macro applies it. Hidden ends on an attack roll (the effect's own DAE 1Attack), on casting a
// spell with a Verbal component (hook below), or when found; noise and the cover/obscurement requirement are the GM's.
// Search (any Perception check activity can use it) compares the check's total with each hidden enemy in the searcher's
// line of sight (invisibility aside); the GM confirms who is found (setting searchConfirm), and their hidden effect ends.
const MODULE = 'midi-qol';
const hiddenEffects = actor => actor?.effects.filter(e => e.flags?.[MODULE]?.hidden) ?? [];
const hiddenEffect = actor => hiddenEffects(actor)[0];
const gmWhisper = () => game.users.filter(u => u.isGM).map(u => u.id);
const cprActive = () => !!game.modules.get('chris-premades')?.active;
// Results go with the action's card: deleting it (or a Generic Actions card above it) deletes them.
const post = (actor, content, origin, whisper) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content, whisper, flags: origin ? {[MODULE]: {origin}} : {}});
export function registerHideSearchSettings() {
    game.settings.register(MODULE, 'searchConfirm', {
        name: 'Search: GM confirms who is found',
        hint: 'When a Search finds hidden creatures, ask the GM before revealing them. Off: they are revealed at once.',
        scope: 'world', config: true, type: Boolean, default: true
    });
}
const usesMacro = (activity, source) => activity?.flags?.cat?.macros?.roll?.some(m => m.source === source && m.identifier === 'hide');
const configuredEffect = (activity, source) => activity.flags.cat?.genericConfig?.[source]?.hide?.effect;
function hideTotal(workflow) {
    const token = workflow.token?.document ?? workflow.token;
    const total = workflow.tokenSaves?.[token?.uuid]?.total;
    return Number.isFinite(total) && !workflow.failedSaves?.size ? total : undefined;
}
async function markHidden(actor, effect, dc, origin) {
    for (const old of hiddenEffects(actor)) if (old !== effect) await documentUtils.deleteDocument(old);
    await effect.update({[`flags.${MODULE}.hidden`]: {dc}});
    await post(actor, `<p>${actor.name} is hidden: Perception DC ${dc} to find.</p>`, origin, gmWhisper());
}
// CPR creates its effect after midi's RollComplete, from its own roll-finished pass: keep the total until then.
const pendingDC = new Map();
Hooks.on('midi-qol.RollComplete', workflow => {
    const activity = workflow.activity;
    if (!cprActive() || !usesMacro(activity, 'chris-premades') || !workflow.actor) return;
    const effectId = configuredEffect(activity, 'chris-premades');
    const total = hideTotal(workflow);
    if (effectId && total !== undefined) pendingDC.set(workflow.actor.uuid, {origin: `${activity.item.uuid}.ActiveEffect.${effectId}`, total, card: workflow.itemCardId});
});
Hooks.on('createActiveEffect', async effect => {
    const actor = effect.parent;
    const pending = actor && pendingDC.get(actor.uuid);
    if (!pending || effect.origin !== pending.origin) return;
    pendingDC.delete(actor.uuid);
    await markHidden(actor, effect, pending.total, pending.card);
});
async function hide({document: activity, workflow}) {
    if (cprActive() && usesMacro(activity, 'chris-premades')) return;
    const total = hideTotal(workflow);
    const source = activity.item.effects.get(configuredEffect(activity, MODULE) ?? configuredEffect(activity, 'chris-premades'));
    if (total === undefined || !source) return;
    const data = source.toObject();
    delete data._id;
    data.transfer = false;
    data.origin = source.uuid;
    const [effect] = await effectUtils.createEffects(workflow.actor, [data]);
    if (effect) await markHidden(workflow.actor, effect, total, workflow.itemCardId);
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
    const candidates = searcher.parent.tokens.filter(t => t.id !== searcher.id && hiddenEffect(t.actor) && tokenUtils.isEnemy(searcher, t) && inSight(searcher, t));
    if (!candidates.length) return;
    const dc = t => hiddenEffect(t.actor).flags[MODULE].hidden.dc;
    const found = candidates.filter(t => total >= dc(t));
    const missed = candidates.filter(t => total < dc(t)).map(t => `${t.name} (DC ${dc(t)})`).join(', ');
    if (!found.length) return post(actor, `<p>${actor.name} (Perception ${total}) finds no one${missed ? `; still hidden: ${missed}` : ''}.</p>`, workflow.itemCardId, gmWhisper());
    const list = found.map(t => `${t.name} (DC ${dc(t)})`).join(', ');
    const go = !game.settings.get(MODULE, 'searchConfirm') || await dialogUtils.confirm(workflow.item.name, `${actor.name} rolled Perception ${total}. Found: ${list}.${missed ? ` Still hidden: ${missed}.` : ''} Reveal them?`, {userId: (game.users.activeGM ?? game.user).id});
    if (!go) return;
    for (const t of found) await documentUtils.deleteDocument(hiddenEffect(t.actor));
    await post(actor, `<p>${actor.name} finds ${found.map(t => t.name).join(', ')}.</p>`, workflow.itemCardId);
}
// Casting a spell with a Verbal component ends Hidden.
Hooks.on('dnd5e.postUseActivity', activity => {
    const item = activity?.item;
    if (item?.type !== 'spell' || !item.system.properties?.has('vocal')) return;
    const effect = hiddenEffect(activity.actor);
    if (effect?.isOwner) effect.delete();
});
export const hideAction = {
    name: 'Hide',
    version: '1.0.0',
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
    version: '1.0.0',
    rules: 'all',
    generic: true,
    documents: ['activity'],
    roll: [{pass: 'activityRollFinished', macro: search, priority: 50}]
};
