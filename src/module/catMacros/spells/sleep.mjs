import {effectUtils} from '../proxy.mjs';
// On the Sleeping effect. At the end of the creature's next turn it repeats the spell's save: a failure adds
// Unconscious to Sleeping itself, so it lasts as long as the spell and ends with it (or on damage, via the effect's
// isDamaged special duration); a success ends Sleeping.
async function turnEnd({document: effect, token}) {
    if (effect.statuses.has('unconscious') || !token) return;
    const save = effectUtils.getOriginActivitySync(effect)?.item?.system.activities.find(activity => activity.type === 'save');
    if (!save) return;
    // A plain saving throw: re-running the save activity would apply a fresh Sleeping effect.
    const [roll] = await effect.parent.rollSavingThrow({ability: save.save.ability.first() ?? 'wis', target: save.save.dc.value}, {configure: false}) ?? [];
    if (roll && !roll.isSuccess) await effect.update({statuses: [...effect.statuses, 'unconscious']});
    else await effect.delete();
}
export const sleep = {
    name: 'Sleep',
    version: '1.0.0',
    rules: '2024',
    combat: [
        {pass: 'actorTurnEnd', macro: turnEnd, priority: 50}
    ]
};
