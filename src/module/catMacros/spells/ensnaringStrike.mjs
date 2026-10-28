import {actorUtils, workflowUtils} from '../proxy.mjs';
// A Large or larger creature has Advantage on the save; the Ensnared effect's OverTimes do the rest.
async function preamble({workflow}) {
    for (const token of workflow.targets) {
        if (token.actor && actorUtils.getSize(token.actor) >= 3) workflowUtils.grantRollModifier(workflow, 'adv', token.id, 'ensnaring-strike', 'Large or larger');
    }
}
export const ensnaringStrike = {
    name: 'Ensnaring Strike',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemPreambleComplete', macro: preamble, priority: 50}]
};
