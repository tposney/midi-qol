import {workflowUtils} from '../proxy.mjs';
import {toggleStatus} from '../../utils.js';
// Life Drain style: a target's hit point maximum drops by a fraction of the damage it took, until a long rest (dnd5e
// resets hp.tempmax then). Entries in flags.midi-qol.maxHpDrain:
// {activity, fraction} - the activity's own failed saves (damage and save in one activity), or
// {activity, when: 'hit', fraction} - a hit drains by the attack's damage (Specter, Wraith), or
// {activity, when: 'hit', saveActivity, fraction} - a hit runs saveActivity against the creature hit, and a failure
// drains by the attack's damage. A creature whose maximum reaches 0 dies.
// Options: damageType (only that type's damage counts, after resistances: a Vampire's Bite drains its necrotic),
// healSelf (the user regains the amount), drainMax: false (heal only, by the damage to the creatures hit by `activity`).
const MODULE = 'midi-qol';
function damageTaken(workflow, token, type) {
    const doc = token.document ?? token;
    return (workflow.damageList ?? []).filter(e => [e.tokenUuid, e.targetUuid].includes(doc.uuid) || e.actorUuid === doc.actor?.uuid)
        .reduce((total, e) => {
            const lost = Math.max(0, (e.oldHP ?? 0) - (e.newHP ?? 0)) + Math.max(0, (e.oldTempHP ?? 0) - (e.newTempHP ?? 0));
            if (!type) return total + lost;
            const typed = (e.damageDetail ?? []).filter(d => d.type === type).reduce((sum, d) => sum + Math.max(0, d.value ?? 0), 0);
            return total + Math.min(lost, typed);
        }, 0);
}
async function drain(actor, amount) {
    if (!actor || amount <= 0) return;
    const hp = actor.system.attributes.hp;
    const tempmax = (hp.tempmax ?? 0) - amount;
    const max = (hp.max ?? 0) + tempmax;
    await actor.update({'system.attributes.hp.tempmax': tempmax, 'system.attributes.hp.value': Math.max(0, Math.min(hp.value, max))});
    if (max <= 0) await toggleStatus(actor, 'dead', {active: true, overlay: true});
}
async function apply(workflow, entry, target, amount) {
    if (amount <= 0) return;
    if (entry.drainMax !== false) await drain((target.document ?? target).actor, amount);
    if (entry.healSelf && workflow.actor) {
        const hp = workflow.actor.system.attributes.hp;
        await workflow.actor.update({'system.attributes.hp.value': Math.min(hp.effectiveMax ?? hp.max, hp.value + amount)});
    }
}
async function finished({document: item, workflow}) {
    const entries = item.flags?.[MODULE]?.maxHpDrain;
    if (!Array.isArray(entries)) return;
    for (const entry of entries.filter(e => e.activity === workflow.activity?.id)) {
        const fraction = entry.fraction ?? 1;
        const amountFor = target => Math.floor(damageTaken(workflow, target, entry.damageType) * fraction);
        if (entry.drainMax === false && !entry.saveActivity) {
            // Heal by the damage done to the creatures hit (or every target, for an activity without an attack).
            const hit = workflow.activity?.attack ? workflow.hitTargets : workflow.targets;
            let total = 0;
            for (const target of hit) total += amountFor(target);
            await apply(workflow, entry, null, total);
        } else if (entry.when === 'hit' && !entry.saveActivity) {
            for (const target of workflow.hitTargets) await apply(workflow, entry, target, amountFor(target));
        } else if (entry.when === 'hit' && workflow.saveActivity?.id === entry.saveActivity) {
            // The attack's linked save already ran: drain the creatures that failed it.
            for (const target of workflow.failedSaves) await apply(workflow, entry, target, amountFor(target));
        } else if (entry.when === 'hit') {
            const save = item.system.activities.get(entry.saveActivity);
            for (const target of workflow.hitTargets) {
                const taken = damageTaken(workflow, target, entry.damageType);
                if (!save || !taken) continue;
                const saveWorkflow = await workflowUtils.syntheticActivityRoll(save, [target.document ?? target], {consumeUsage: false, consumeResources: false});
                if (saveWorkflow?.failedSaves?.size) await apply(workflow, entry, target, Math.floor(taken * fraction));
            }
        } else {
            for (const target of workflow.failedSaves) await apply(workflow, entry, target, amountFor(target));
        }
    }
}
export const maxHpDrain = {
    name: 'Max HP Drain',
    version: '1.0.0',
    rules: 'all',
    roll: [{pass: 'itemRollFinished', macro: finished, priority: 70}]
};
