import {effectUtils, tokenUtils, workflowUtils} from '../proxy.mjs';
// Fear Aura: an enemy that starts its turn in the emanation makes the item's Wisdom save; on a
// failure it is Frightened until the start of its next turn (the activity's effect), on a success it is immune to this
// creature's aura for 24 hours. No aura while the creature is incapacitated.
const MODULE = 'midi-qol';
// For a nearby pass `token` is the token whose turn starts; the aura's token is the item actor's on that scene.
async function turnStart({document: item, token: starter}) {
    const holder = item.actor;
    const auraToken = holder?.token ?? holder?.getActiveTokens(false, true).find(t => t.parent === starter?.parent);
    const target = starter?.actor;
    if (!holder || !target || !auraToken || starter === auraToken || holder.statuses.has('incapacitated')) return;
    const activity = item.system.activities.find(a => a.type === 'save');
    if (!activity) return;
    if (tokenUtils.getDistance(auraToken, starter) > (activity.target?.template?.size || 10)) return;
    if (target.effects.some(e => e.flags?.[MODULE]?.fearAuraImmune === item.uuid)) return;
    // Only the creature starting its turn: without the activity's emanation template, which would target everyone in it.
    const data = activity.toObject();
    data.target = {...data.target, template: {...data.target?.template, type: '', size: ''}, affects: {...data.target?.affects, type: 'creature', count: '1'}};
    const workflow = await workflowUtils.syntheticActivityDataRoll(data, item, [starter], {consumeUsage: false, consumeResources: false});
    if (!workflow || workflow.failedSaves.count) return;
    await effectUtils.createEffects(target, [{
        name: `${item.name}: immune (${holder.name})`,
        img: item.img,
        origin: item.uuid,
        duration: {value: 86400, units: 'seconds'},
        flags: {[MODULE]: {fearAuraImmune: item.uuid}}
    }]);
}
export const fearAura = {
    name: 'Fear Aura',
    version: '1.0.0',
    rules: 'all',
    combat: [{pass: 'nearbyTurnStart', macro: turnStart, priority: 50, dispositions: ['enemy']}]
};
