import {dialogUtils, documentUtils, genericUtils} from '../proxy.mjs';
// Ends one of the target's conditions that the spell can end: the effects granting it are removed, so a condition
// that comes from another effect (a spell, a poison) doesn't return with it.
const CONDITIONS = ['blinded', 'deafened', 'paralyzed', 'poisoned'];
async function use({document: item, workflow}) {
    const target = workflow.targets.first();
    const actor = target?.actor;
    if (!actor) return;
    const present = CONDITIONS.filter(id => actor.statuses.has(id));
    if (!present.length) {
        genericUtils.notify(`${target.name} has no condition ${item.name} can end.`, 'info', {localize: false});
        return;
    }
    const label = id => CONFIG.DND5E.conditionTypes[id]?.name ?? id;
    const condition = present.length === 1 ? present[0]
        : await dialogUtils.buttonDialog(item.name, `End which condition on ${target.name}?`, present.map(id => [label(id), id]));
    if (!condition) return;
    for (const effect of actor.effects.filter(effect => effect.statuses.has(condition))) {
        if (actor.effects.get(effect.id)) await documentUtils.deleteDocument(effect);
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}), content: `${item.name} ends ${target.name}'s ${label(condition)} condition.`});
}
export const lesserRestoration = {
    name: 'Lesser Restoration',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: use, priority: 50}]
};
