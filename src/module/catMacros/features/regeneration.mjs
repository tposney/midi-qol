import {workflowUtils} from '../proxy.mjs';
import {toggleStatus} from '../../utils.js';
// Regeneration: at the start of the creature's turn it heals by `activity`. Damage of a type in `suppressTypes` since the
// end of its last turn stops it (Troll: acid or fire); a type in `reducedTypes` heals by `reducedActivity` instead.
// `minHp` (default 1): no healing below it; 0 heals from 0 hit points. `revive`: a creature at 0 hit points that
// regenerates loses Dead (the Troll dies only if it starts its turn at 0 and doesn't regenerate). `countItem`: the
// activity's dice are multiplied by that item's remaining uses (a creature healing per head).
// flags.midi-qol.regeneration = {activity, reducedActivity, reducedTypes, suppressTypes, minHp, revive, countItem}.
const MODULE = 'midi-qol';
const FLAG = 'regenerationDamaged';
async function damaged({document: item, ditem}) {
    const c = item.flags?.[MODULE]?.regeneration;
    if (!c || !ditem) return;
    const types = new Set((ditem.damageDetail ?? []).filter(d => (d.value ?? 0) > 0).map(d => d.type));
    const state = (c.suppressTypes ?? []).some(t => types.has(t)) ? 'suppressed' : (c.reducedTypes ?? []).some(t => types.has(t)) ? 'reduced' : null;
    if (!state || item.getFlag(MODULE, FLAG) === 'suppressed' || item.getFlag(MODULE, FLAG) === state) return;
    await item.setFlag(MODULE, FLAG, state);
}
async function turnEnd({document: item}) {
    if (item.getFlag(MODULE, FLAG)) await item.unsetFlag(MODULE, FLAG);
}
async function turnStart({document: item, token}) {
    const c = item.flags?.[MODULE]?.regeneration;
    const actor = item.actor;
    if (!c || !token || !actor) return;
    const state = item.getFlag(MODULE, FLAG);
    if (state === 'suppressed') return;
    const hp = actor.system.attributes.hp;
    if (hp.value < (c.minHp ?? 1) || hp.value >= hp.effectiveMax) return;
    if (actor.statuses.has('dead') && !(c.revive && hp.value === 0)) return;
    const activity = item.system.activities.get(state === 'reduced' ? c.reducedActivity ?? c.activity : c.activity);
    const count = c.countItem ? actor.items.getName(c.countItem)?.system.uses?.value ?? 0 : 1;
    if (!activity || count <= 0) return;
    const data = activity.toObject();
    if (c.countItem) {
        const {number, denomination, bonus} = data.healing;
        data.healing = {...data.healing, custom: {enabled: true, formula: `${number * count}d${denomination}${bonus ? ` + ${bonus}` : ''}`}};
    }
    const workflow = await workflowUtils.syntheticActivityDataRoll(data, item, [token], {consumeUsage: false, consumeResources: false,
        options: {workflowOptions: {targetConfirmation: 'none', allowIncapacitated: true}}});
    if (c.revive && actor.system.attributes.hp.value > 0 && actor.statuses.has('dead')) await toggleStatus(actor, 'dead', {active: false});
    return workflow;
}
export const regeneration = {
    name: 'Regeneration',
    version: '1.0.0',
    rules: 'all',
    roll: [{pass: 'targetDamageComplete', macro: damaged, priority: 50}],
    combat: [
        {pass: 'actorTurnStart', macro: turnStart, priority: 50},
        {pass: 'actorTurnEnd', macro: turnEnd, priority: 50}
    ]
};
