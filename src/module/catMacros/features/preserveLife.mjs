import {dialogUtils, tokenUtils, workflowUtils} from '../proxy.mjs';
// Divides five times the cleric level among Bloodied creatures within 30 feet, none above half its hit point maximum.
async function use({workflow}) {
    if (!workflow.token) return;
    const pool = 5 * (workflow.actor.classes?.cleric?.system.levels ?? 0);
    if (!pool) return;
    const room = token => Math.floor(token.actor.system.attributes.hp.max / 2) - token.actor.system.attributes.hp.value;
    const candidates = tokenUtils.findNearby(workflow.token.document, 30, {includeToken: true})
        .filter(token => token.actor?.system.attributes?.hp && room(token) > 0);
    if (!candidates.length) {
        ui.notifications.info(`${workflow.item.name}: no Bloodied creatures within 30 feet.`);
        return;
    }
    const maxes = Object.fromEntries(candidates.map(token => [token.id, Math.min(room(token), pool)]));
    const selection = await dialogUtils.selectTargetDialog(workflow.item.name, `Divide ${pool} hit points among Bloodied creatures (up to half their hit point maximum).`, candidates,
        {type: 'selectAmount', maxAmount: pool, maxes, skipDeadAndUnconscious: false});
    for (const {document: token, value} of selection?.result ?? []) {
        const amount = Math.min(Number(value), room(token));
        if (amount > 0) await workflowUtils.applyDamage([token], amount, 'healing');
    }
}
export const preserveLife = {
    name: 'Preserve Life',
    version: '1.0.0',
    rules: '2024',
    roll: [
        {pass: 'itemRollFinished', macro: use, priority: 50}
    ]
};
