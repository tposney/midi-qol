import {dialogUtils, workflowUtils} from '../proxy.mjs';
// Lists midi's action items (sample items › Actions) and CPR's, and uses the chosen one. An action both offer is listed
// twice, tagged with its source. A world item imported from the action's compendium entry (_stats.compendiumSource) holds
// the GM's options for it: the action is the current compendium item with that copy's CAT options (genericConfig).
const SOURCES = [
    {pack: 'midi-qol.midiqol-sample-items', folder: 'tWh6UgUeg2lxQ8uJ', tag: 'Midi'},
    {pack: 'chris-premades.CPRMisc2024', tag: 'CPR'}
];
function withWorldOptions(item) {
    const copy = game.items.filter(i => i._stats?.compendiumSource === item.uuid)
        .sort((a, b) => (b._stats?.modifiedTime ?? 0) - (a._stats?.modifiedTime ?? 0))[0];
    const data = item.toObject();
    if (!copy) return data;
    const options = copy.flags.cat?.genericConfig;
    if (options) foundry.utils.setProperty(data, 'flags.cat.genericConfig', foundry.utils.deepClone(options));
    for (const [id, activity] of Object.entries(data.system.activities ?? {})) {
        const activityOptions = copy.system.activities?.get(id)?.flags?.cat?.genericConfig;
        if (activityOptions) foundry.utils.setProperty(activity, 'flags.cat.genericConfig', foundry.utils.deepClone(activityOptions));
    }
    return data;
}
async function choose({workflow}) {
    const entries = [], source = {};
    for (const {pack: id, folder, tag} of SOURCES) {
        const pack = game.packs.get(id);
        if (!pack) continue;
        const index = await pack.getIndex({fields: ['system.identifier', 'folder']});
        for (const entry of index) {
            if (entry.system?.identifier === 'generic-actions' || (folder && entry.folder !== folder)) continue;
            entries.push(entry);
            source[entry._id] = tag;
        }
    }
    const names = entries.map(entry => entry.name.toLowerCase());
    const tags = Object.fromEntries(entries.filter(entry => names.filter(name => name === entry.name.toLowerCase()).length > 1).map(entry => [entry._id, source[entry._id]]));
    const chosen = await dialogUtils.selectDocumentDialog(workflow.item.name, 'Choose an action', entries, {sort: 'alphabetical', displayReference: true, tags});
    const item = Array.isArray(chosen) ? chosen[0] : chosen;
    if (!item) return;
    // The roll keys held as the action is chosen (Alt/Ctrl advantage/disadvantage, as for any use)
    const {MODIFIER_KEYS} = game.keyboard.constructor;
    const held = key => game.keyboard.isModifierActive(key);
    const event = new KeyboardEvent('keydown', {altKey: held(MODIFIER_KEYS.ALT), ctrlKey: held(MODIFIER_KEYS.CONTROL), shiftKey: held(MODIFIER_KEYS.SHIFT)});
    await workflowUtils.syntheticItemDataRoll(withWorldOptions(item), workflow.actor, workflow.targets.documents, {userId: game.user.id, config: {event}});
}
export const genericActions = {
    name: 'Generic Actions',
    version: '1.2.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: choose, priority: 50}]
};
