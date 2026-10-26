import {dialogUtils} from '../proxy.mjs';
import {completeItemUse} from '../../utils.js';
// Attacks the targets with an equipped weapon, chosen when there is more than one.
async function useWeapon({workflow}) {
    const weapons = workflow.actor.items.filter(item => item.type === 'weapon' && item.system.equipped && item.system.activities.getByType('attack').length);
    if (!weapons.length) return ui.notifications.info(`${workflow.actor.name} has no equipped weapon.`);
    const chosen = weapons.length === 1 ? weapons[0] : await dialogUtils.selectDocumentDialog(workflow.item.name, 'Choose a weapon', weapons);
    const weapon = Array.isArray(chosen) ? chosen[0] : chosen;
    // midi's own call keeps the world's roll settings (CAT's turns automatic attack rolls off unless asked to be fast).
    if (weapon) await completeItemUse(weapon, {midiOptions: {targetUuids: Array.from(workflow.targets, token => token.document.uuid)}}, {}, {});
}
export const attack = {
    name: 'Attack',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: useWeapon, priority: 50}]
};
