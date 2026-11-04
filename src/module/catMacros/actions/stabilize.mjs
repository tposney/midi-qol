import {documentUtils, workflowUtils} from '../proxy.mjs';
import {woundsOf} from '../features/infernalWound.mjs';
// A Wisdom (Medicine) check, DC 10, stabilizes a creature at 0 hit points: its Stable activity applies the Stable effect.
// A creature with an infernal wound gets the check at the wound's DC instead, which closes it (infernalWound's Medicine hook).
async function tryStabilize({workflow}) {
    if (documentUtils.getIdentifier(workflow.activity) !== 'stabilize') return;
    const target = workflow.targets.first();
    const wounds = woundsOf(target?.actor);
    if (wounds.length) return workflow.actor.rollSkill({skill: 'med', target: Math.min(...wounds.map(wound => wound.getFlag('midi-qol', 'infernalWound')?.stanchDC ?? 10))});
    const hp = target?.actor?.system.attributes.hp;
    if (!hp || hp.value > 0 || target.actor.statuses.has('dead')) return ui.notifications.info('Stabilize: target a creature at 0 hit points.');
    const [roll] = await workflow.actor.rollSkill({skill: 'med', target: 10}) ?? [];
    if (!roll?.isSuccess) return;
    const stable = workflow.item.system.activities.find(activity => documentUtils.getIdentifier(activity) === 'stable');
    if (stable) await workflowUtils.syntheticActivityRoll(stable, [target.document], {consumeUsage: false, consumeResources: false});
}
export const stabilize = {
    name: 'Stabilize',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: tryStabilize, priority: 50}]
};
