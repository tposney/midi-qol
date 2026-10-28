import {effectUtils, workflowUtils} from '../proxy.mjs';
// Macros on the Warded effect the spell applies; the save is the spell's own Save on Target activity.
function isHarmful(activity) {
    if (!activity) return false;
    if (activity.type === 'attack') return true;
    return activity.item?.type === 'spell' && !!activity.damage?.parts?.length;
}
async function targeted({document: effect, workflow}) {
    if (workflow.targets.size !== 1 || !workflow.token) return;
    if (!isHarmful(workflow.activity) || workflow.activity.target?.template?.type) return;
    const target = workflow.targets.first();
    if (target.document.disposition === workflow.token.document.disposition) return;
    const saveActivity = effectUtils.getOriginActivitySync(effect)?.item?.system.activities.find(activity => activity.type === 'save');
    if (!saveActivity) return;
    const saveWorkflow = await workflowUtils.syntheticActivityRoll(saveActivity, [workflow.token.document]);
    if (!saveWorkflow?.failedSaves?.size) return;
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({token: workflow.token.document}),
        content: `${workflow.token.name} can't bring themselves to target ${target.name} (Sanctuary).`
    });
    return true;
}
async function acted({document: effect, workflow}) {
    const damaged = workflow.damageList?.some(damage => (damage.totalDamage ?? 0) > 0 && damage.actorId !== workflow.actor?.id);
    if (workflow.activity?.type !== 'attack' && workflow.item?.type !== 'spell' && !damaged) return;
    if (workflow.activity?.item?.id === effectUtils.getOriginActivitySync(effect)?.item?.id) return;
    await effect.delete();
}
export const sanctuary = {
    name: 'Sanctuary',
    version: '1.0.0',
    rules: '2024',
    roll: [
        {
            pass: 'targetPreItemRoll',
            macro: targeted,
            priority: 50
        },
        {
            pass: 'actorRollFinished',
            macro: acted,
            priority: 50
        }
    ]
};
