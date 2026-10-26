import {tokenUtils} from '../proxy.mjs';
// Whispers the user the cover each target (or, with none, each creature it can sense) has from the user's token.
async function check({workflow}) {
    const token = workflow.token?.document;
    if (!token) return;
    const others = workflow.targets.size ? Array.from(workflow.targets, target => target.document)
        : token.parent.tokens.filter(other => other !== token && other.actor && tokenUtils.canSense(token, other));
    const lines = others.map(other => `<li>${other.name}: ${tokenUtils.checkCover(token, other, {displayName: true})} (${Math.round(tokenUtils.getDistance(token, other))} ft)</li>`);
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({token}),
        whisper: [game.user.id],
        flags: {'midi-qol': {origin: workflow.itemCardId}},
        content: `<p><strong>${workflow.item.name}</strong> from ${token.name}:</p><ul>${lines.join('') || '<li>No creatures.</li>'}</ul>`
    });
}
export const checkCover = {
    name: 'Check Cover',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: check, priority: 50}]
};
