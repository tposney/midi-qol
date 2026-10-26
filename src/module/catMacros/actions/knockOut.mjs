import {actorUtils, workflowUtils} from '../proxy.mjs';
// On the Knocking Out effect: a melee hit that would drop a creature to 0 hit points leaves it at 1 and Unconscious.
async function spare({workflow, ditem}) {
    if (!workflowUtils.isAttackType(workflow, 'meleeAttack') || ditem.newHP > 0 || ditem.oldHP <= 0) return;
    workflowUtils.preventZeroHP(ditem, {targetHP: 1});
    workflowUtils.setWorkflowProperty(workflow, 'knockedOut', [...(workflowUtils.getWorkflowProperty(workflow, 'knockedOut') ?? []), ditem.actorUuid]);
}
async function applyKnockOut({workflow}) {
    for (const uuid of workflowUtils.getWorkflowProperty(workflow, 'knockedOut') ?? []) {
        const actor = fromUuidSync(uuid, {strict: false});
        if (actor) await actorUtils.applyConditions(actor, ['unconscious']);
    }
}
export const knockOut = {
    name: 'Knock Out',
    version: '1.0.0',
    rules: '2024',
    roll: [
        {pass: 'actorDamageComplete', macro: spare, priority: 250},
        {pass: 'actorRollFinished', macro: applyKnockOut, priority: 50}
    ]
};
