import {dialogUtils} from '../proxy.mjs';
// Casting picks an unidentified item carried by the caster or the touched creature, identifies it and whispers the
// caster what it is, whether it needs attunement and how many charges it has.
async function cast({workflow}) {
    const holders = [workflow.actor, ...Array.from(workflow.targets).map(token => token.actor)].filter((actor, i, all) => actor && all.indexOf(actor) === i);
    const items = holders.flatMap(actor => actor.items.filter(item => item.system.identified === false));
    if (!items.length) {
        ui.notifications.info('Identify: no unidentified items on the caster or the target.');
        return;
    }
    const selection = items.length === 1 ? [items[0]] : await dialogUtils.selectDocumentDialog(workflow.item.name, 'Choose the item to identify', items);
    const item = Array.isArray(selection) ? selection[0] : selection;
    if (!item) return;
    await item.update({'system.identified': true});
    const attunement = item.system.attunement ? `Requires attunement${item.system.attuned ? ' (attuned)' : ''}.` : 'Does not require attunement.';
    const charges = item.system.uses?.max ? `${item.system.uses.value} of ${item.system.uses.max} charges.` : '';
    const owners = game.users.filter(user => user.isGM || workflow.actor.testUserPermission(user, 'OWNER')).map(user => user.id);
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        whisper: owners,
        content: `<p><strong>Identify: ${item.name}</strong></p><p>${attunement} ${charges}</p>${item.system.description?.value ?? ''}`
    });
}
export const identify = {
    name: 'Identify',
    version: '1.0.0',
    rules: '2024',
    roll: [
        {pass: 'itemRollFinished', macro: cast, priority: 50}
    ]
};
