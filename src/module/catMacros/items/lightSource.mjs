import {effectUtils} from '../proxy.mjs';
// The Extinguish activity of a light source (Close Bottle for the Eversmoking Bottle's smoke): removes the effects
// this item put on its holder.
async function extinguish({workflow}) {
    if (!['Extinguish', 'Close Bottle'].includes(workflow.activity.name)) return;
    const lit = workflow.actor.effects.filter(effect => effectUtils.getOriginActivitySync(effect)?.item?.id === workflow.item.id);
    if (lit.length) await workflow.actor.deleteEmbeddedDocuments('ActiveEffect', lit.map(effect => effect.id));
}
export const lightSource = {
    name: 'Light Source',
    version: '1.0.0',
    rules: '2024',
    roll: [
        {pass: 'itemRollFinished', macro: extinguish, priority: 50}
    ]
};
