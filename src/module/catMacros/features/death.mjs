// A creature's death, for features that act on it: the creature becoming Dead, however the status is applied (midi at
// 0 hit points, failed death saves, the GM), once; dropping to 0 hit points alone does not count. Run by the GM.
// Dying during one of its own uses : a use started inside it gets no targets, so handlers run after it
// finishes, with its card (parentCard) for linking their own.
const handlers = [];
/** handler({actor, token, parentCard}) runs when a creature dies. */
export function onCreatureDeath(handler) {
    handlers.push(handler);
}
const DEAD = () => CONFIG.specialStatusEffects.DEFEATED ?? 'dead';
const isDead = effect => effect.active && effect.statuses?.has(DEAD());
async function died(effect) {
    const actor = effect.parent;
    if (!game.users.activeGM?.isSelf || !(actor instanceof Actor) || !isDead(effect)) return;
    if (actor.effects.some(other => other !== effect && isDead(other))) return;
    const token = actor.token ?? actor.getActiveTokens(false, true)[0];
    if (!token) return;
    const executing = () => globalThis.MidiQOL?.Workflow?.executingCardFor?.(actor);
    const parentCard = executing();
    for (let i = 0; i < 60 && executing(); i++) await new Promise(resolve => setTimeout(resolve, 250));
    for (const handler of handlers) {
        try {
            await handler({actor, token, parentCard});
        } catch (err) {
            console.error('midi-qol | death handler', err);
        }
    }
}
/** Registered on catReady: without CAT the handlers' utilities don't exist. */
export function registerDeathHooks() {
    Hooks.on('createActiveEffect', effect => died(effect));
    Hooks.on('updateActiveEffect', (effect, changes) => {
        if ('disabled' in changes || 'statuses' in changes) died(effect);
    });
}
