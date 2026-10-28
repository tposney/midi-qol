import {dialogUtils, effectUtils, queryUtils, workflowUtils} from '../proxy.mjs';
// On the Seeing Illusions effect: at the start of each of the caster's turns the caster's owner is asked whether the
// phantasm harms the target (it must be in or within 5 feet of the phantasm); yes rolls the spell's Phantasm Damage.
// The target's Study action is the effect's OverTime check.
async function casterTurn({document: effect, token, combatant}) {
    const item = effectUtils.getOriginActivitySync(effect)?.item;
    const caster = item?.actor;
    const current = combatant ?? game.combat?.combatant;
    if (!caster || !token || current?.actor?.uuid !== caster.uuid) return;
    const damage = item.system.activities.find(activity => activity.type === 'damage');
    if (!damage) return;
    const userId = queryUtils.firstOwner(caster)?.id ?? game.user.id;
    const harm = await dialogUtils.confirm(item.name, `Does the phantasm harm ${token.name} this turn (it is in or within 5 feet of the phantasm)?`, {userId});
    if (harm) await workflowUtils.syntheticActivityRoll(damage, [token.document ?? token], {consumeUsage: false, consumeResources: false});
}
export const phantasmalForce = {
    name: 'Phantasmal Force',
    version: '1.0.0',
    rules: '2024',
    combat: [{pass: 'actorEveryTurn', macro: casterTurn, priority: 50}]
};
