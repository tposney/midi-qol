import {dialogUtils, workflowUtils} from '../proxy.mjs';
// Lists midi's action items (sample items › Actions) and CPR's, and uses the chosen one. An action both offer is listed
// twice, tagged with its source.
const SOURCES = [
    {pack: 'midi-qol.midiqol-sample-items', folder: 'tWh6UgUeg2lxQ8uJ', tag: 'Midi'},
    {pack: 'chris-premades.CPRMisc2024', tag: 'CPR'}
];
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
    await workflowUtils.syntheticItemDataRoll(item.toObject(), workflow.actor, Array.from(workflow.targets, token => token.document), {userId: game.user.id});
}
export const genericActions = {
    name: 'Generic Actions',
    version: '1.1.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: choose, priority: 50}]
};
