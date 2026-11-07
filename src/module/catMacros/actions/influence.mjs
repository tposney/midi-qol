import {dialogUtils} from '../proxy.mjs';
import {addCardNote, cardNoteMessageData} from '../../lib/cardNotes.js';
import {INFLUENCE_NOTE_KIND} from '../../lib/influenceNote.js';
// The GM chooses the target's attitude to the request; a hesitant creature needs a check against DC 15 or its
// Intelligence score, whichever is higher, with Advantage if Friendly and Disadvantage if Hostile.
const SKILLS = ['dec', 'itm', 'prf', 'per', 'ani'];
async function request({workflow}) {
    const target = workflow.targets.documents[0];
    if (!target?.actor) return ui.notifications.info('Influence: target the creature you want to influence.');
    const gm = game.users.activeGM ?? game.user;
    const attitude = await dialogUtils.buttonDialog(workflow.item.name, `How does ${target.name} respond to ${workflow.actor.name}'s request?`, [
        ['Willing: it complies', 'willing'], ['Friendly: hesitant, check with Advantage', 'friendly'], ['Indifferent: hesitant, check', 'indifferent'],
        ['Hostile: hesitant, check with Disadvantage', 'hostile'], ['Unwilling: it refuses', 'unwilling']], {userId: gm.id});
    if (!attitude) return;
    if (attitude === 'willing' || attitude === 'unwilling') {
        return addCardNote(workflow, `<p>${target.name} ${attitude === 'willing' ? 'agrees' : 'refuses'}.</p>`, {key: 'influence'});
    }
    const skill = await dialogUtils.buttonDialog(workflow.item.name, 'Which skill do you use?', SKILLS.map(id => [CONFIG.DND5E.skills[id].label, id]));
    if (!skill) return;
    const dc = Math.max(15, target.actor.system.abilities.int?.value ?? 0);
    const skillLabel = CONFIG.DND5E.skills[skill].label;
    const note = await addCardNote(workflow, `<p>${target.name} is ${attitude}: ${skillLabel} check, DC ${dc}.</p>`, {key: 'influence', kind: INFLUENCE_NOTE_KIND,
        data: {target: {name: target.name, uuid: target.uuid}, attitude, skill: skillLabel, dc}});
    if (!note) return;
    await workflow.actor.rollSkill({skill, target: dc, advantage: attitude === 'friendly', disadvantage: attitude === 'hostile'}, {}, {data: cardNoteMessageData(note, 'check')});
}
export const influence = {
    name: 'Influence',
    version: '1.1.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: request, priority: 50}]
};
