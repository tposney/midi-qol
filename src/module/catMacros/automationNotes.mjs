import {automationUtils, itemUtils} from './proxy.mjs';
// CAT's medkit keeps an item's own description and drops its cat-description block; re-add the notes block of the
// midi automation just applied (the end of its description). Every midi automation lists this macro (compilePacks).
// CAT fires the medkit event only for items on an actor; catIntegration calls this for the others.
export async function addNotes({document: item}) {
    const automation = automationUtils.getCurrentAutomation(item);
    if (automation?.source !== 'midi-qol' || automation.uuid === item.uuid) return;
    const source = await fromUuid(automation.uuid);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = source?.system.description?.value ?? '';
    await itemUtils.setDescriptionBlock(item, wrapper.querySelector(':scope > .cat-description')?.innerHTML ?? '');
}
export const automationNotes = {
    name: 'Automation Notes',
    version: '1.0.0',
    rules: 'all',
    item: [
        {pass: 'medkit', macro: addNotes, priority: 50}
    ]
};
