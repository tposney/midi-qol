import {dialogUtils, documentUtils} from '../proxy.mjs';
import {completeItemUse} from '../../utils.js';
// Spell: cast one of the user's spells that takes an action. Magic Item: use a magic item's action.
const usesAction = item => item.system.activities?.some(activity => activity.activation?.type === 'action');
function castable(item) {
    if (item.type !== 'spell' || !usesAction(item)) return false;
    return item.system.level === 0 || item.system.prepared > 0 || ['innate', 'pact', 'atwill', 'ritual'].includes(item.system.method);
}
async function pick({workflow}, filter, prompt) {
    const items = workflow.actor.items.filter(filter);
    if (!items.length) return ui.notifications.info(`${workflow.actor.name} has nothing to use.`);
    const chosen = await dialogUtils.selectDocumentDialog(workflow.item.name, prompt, items, {sort: 'level', showSpellLevel: items.every(item => item.type === 'spell')});
    const item = Array.isArray(chosen) ? chosen[0] : chosen;
    if (item) await completeItemUse(item, {midiOptions: {targetUuids: Array.from(workflow.targets, token => token.document.uuid)}}, {}, {});
}
async function use(data) {
    const identifier = documentUtils.getIdentifier(data.workflow.activity);
    if (identifier === 'magic-item') return pick(data, item => item.type !== 'spell' && item.system.properties?.has('mgc') && usesAction(item), 'Choose a magic item');
    return pick(data, castable, 'Choose a spell');
}
export const magic = {
    name: 'Magic',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: use, priority: 50}]
};
