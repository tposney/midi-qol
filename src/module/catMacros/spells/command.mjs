import {actorUtils} from '../proxy.mjs';
// On each "Command: X" effect: at the start of the commanded creature's turn, remind its owners which command it
// must follow, and Grovel knocks it prone.
async function turnStart({document: effect}) {
    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;
    const command = effect.name.replace(/^Command:\s*/, '');
    if (command === 'Grovel') await actorUtils.applyConditions(actor, ['prone']);
    const owners = game.users.filter(user => user.isGM || actor.testUserPermission(user, 'OWNER')).map(user => user.id);
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        whisper: owners,
        content: `<p><strong>${effect.name}</strong></p>${effect.description ?? ''}`
    });
}
export const command = {
    name: 'Command',
    version: '1.0.0',
    rules: '2024',
    combat: [
        {pass: 'actorTurnStart', macro: turnStart, priority: 50}
    ]
};
