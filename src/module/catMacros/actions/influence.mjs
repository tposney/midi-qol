import {dialogUtils} from '../proxy.mjs';
// The GM chooses the target's attitude to the request; a hesitant creature needs a check against DC 15 or its
// Intelligence score, whichever is higher, with Advantage if Friendly and Disadvantage if Hostile.
const SKILLS = ['dec', 'itm', 'prf', 'per', 'ani'];
async function request({workflow}) {
    const target = workflow.targets.first();
    if (!target?.actor) return ui.notifications.info('Influence: target the creature you want to influence.');
    const gm = game.users.activeGM ?? game.user;
    const attitude = await dialogUtils.buttonDialog(workflow.item.name, `How does ${target.name} respond to ${workflow.actor.name}'s request?`, [
        ['Willing: it complies', 'willing'], ['Friendly: hesitant, check with Advantage', 'friendly'], ['Indifferent: hesitant, check', 'indifferent'],
        ['Hostile: hesitant, check with Disadvantage', 'hostile'], ['Unwilling: it refuses', 'unwilling']], {userId: gm.id});
    if (!attitude) return;
    if (attitude === 'willing' || attitude === 'unwilling') {
        return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}), content: `<p>${target.name} ${attitude === 'willing' ? 'agrees' : 'refuses'}.</p>`, flags: {'midi-qol': {origin: workflow.itemCardId}}});
    }
    const skill = await dialogUtils.buttonDialog(workflow.item.name, 'Which skill do you use?', SKILLS.map(id => [CONFIG.DND5E.skills[id].label, id]));
    if (!skill) return;
    const dc = Math.max(15, target.actor.system.abilities.int?.value ?? 0);
    await workflow.actor.rollSkill({skill, target: dc, advantage: attitude === 'friendly', disadvantage: attitude === 'hostile'}, {}, {data: {flags: {'midi-qol': {origin: workflow.itemCardId}}}});
}
export const influence = {
    name: 'Influence',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: request, priority: 50}]
};
