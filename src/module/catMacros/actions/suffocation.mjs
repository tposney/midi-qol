// Holding Breath ends after 1 + Constitution modifier minutes (at least 30 seconds); when it runs out the creature is
// Out of Air: 1 Exhaustion at the end of each of its turns, all of it removed when it can breathe again (Out of Air ends).
async function outOfBreath({document: effect}) {
    const actor = effect.parent;
    if (!(actor instanceof Actor) || !(effect.duration.remaining <= 0)) return;
    const outOfAir = DAE.getEffectItem(effect)?.effects.find(e => e.name === 'Out of Air');
    if (outOfAir) await actor.createEmbeddedDocuments('ActiveEffect', [outOfAir.toObject()]);
}
async function startOutOfAir({document: effect}) {
    await effect.setFlag('midi-qol', 'startingExhaustion', effect.parent?.system.attributes.exhaustion ?? 0);
}
async function suffocate({document: effect}) {
    const actor = effect.parent;
    await actor.update({'system.attributes.exhaustion': Math.min((actor.system.attributes.exhaustion ?? 0) + 1, 6)});
}
async function breathe({document: effect}) {
    const start = effect.getFlag('midi-qol', 'startingExhaustion');
    if (effect.parent && start !== undefined) await effect.parent.update({'system.attributes.exhaustion': start});
}
export const suffocationHoldingBreath = {
    name: 'Suffocation',
    version: '1.0.0',
    rules: '2024',
    effect: [{pass: 'deleted', macro: outOfBreath, priority: 50}]
};
export const suffocationOutOfAir = {
    name: 'Suffocation',
    version: '1.0.0',
    rules: '2024',
    effect: [
        {pass: 'created', macro: startOutOfAir, priority: 50},
        {pass: 'deleted', macro: breathe, priority: 50}
    ],
    combat: [{pass: 'actorTurnEnd', macro: suffocate, priority: 50}]
};
