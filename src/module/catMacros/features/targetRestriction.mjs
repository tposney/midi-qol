import {dialogUtils} from '../proxy.mjs';
// Only some targets (a Vampire's Bite: willing, or Grappled, Incapacitated or Restrained): before the activity is used,
// a target without one of `statuses` is refused, unless `willing` and the GM confirms it is willing.
// flags.midi-qol.restrictTarget = {activity, statuses, willing}.
const MODULE = 'midi-qol';
async function check({document: item, workflow}) {
    const c = item.flags?.[MODULE]?.restrictTarget;
    if (!c || workflow.activity?.id !== c.activity) return;
    for (const token of workflow.targets) {
        const doc = token.document ?? token;
        if ((c.statuses ?? []).some(s => doc.actor?.statuses.has(s))) continue;
        const willing = c.willing && await dialogUtils.confirm(item.name, `${doc.name} isn't ${(c.statuses ?? []).join(', ')}. Is it willing?`,
            {userId: (game.users.activeGM ?? game.user).id});
        if (willing) continue;
        ui.notifications.warn(`${item.name}: ${doc.name} must be ${c.willing ? 'willing or ' : ''}${(c.statuses ?? []).join(', ')}.`);
        workflow.aborted = true;
        return;
    }
}
export const targetRestriction = {
    name: 'Target Restriction',
    version: '1.0.0',
    rules: 'all',
    roll: [{pass: 'itemPreItemRoll', macro: check, priority: 40}]
};
