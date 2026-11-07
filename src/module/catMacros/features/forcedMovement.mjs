import {getTokenDocument} from '../../utils.js';
import {actorUtils, dialogUtils, effectUtils, tokenUtils} from '../proxy.mjs';
// Pushes or pulls targets after an activity, from the item's flags.midi-qol.forcedMovement entries:
// {activity, when: 'hit'|'failedSave'|'always', direction: 'push'|'pull', distance (ft; a pull without one ends adjacent),
// maxSize ('med'|'lg'...), optional (ask first), targetArmor: 'nonmagicalMetal', effectIfAdjacent (item effect id,
// applied to a target that ends adjacent), toward: 'area' (pull toward the centre of the area the activity placed)}.
// A pull stops adjacent to the creature.
const MODULE = 'midi-qol';
const SIZES = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];
// Medium and heavy armour is metal except hide; light armour isn't.
function wearsNonmagicalMetal(actor) {
    return actor.items.some(i => i.type === 'equipment' && i.system.equipped && ['medium', 'heavy'].includes(i.system.type?.value)
        && i.system.type?.baseItem !== 'hide' && !i.system.properties?.has('mgc'));
}
// Centre of the area (a Region on Foundry 14) the workflow placed.
function areaCentre(workflow) {
    const area = workflow.template;
    const shape = area?.shapes?.[0];
    if (shape && ['circle', 'ellipse'].includes(shape.type)) return {x: shape.x, y: shape.y};
    const b = area?.object?.bounds;
    return b ? {x: b.x + b.width / 2, y: b.y + b.height / 2} : null;
}
function targetsFor(workflow, when) {
    // Moved on the canvas: the drawn tokens
    if (when === 'hit') return workflow.hitTargets.tokens;
    if (when === 'failedSave') return workflow.failedSaves.tokens;
    return workflow.targets.tokens;
}
async function moved({document: item, workflow}) {
    const entries = item.flags?.[MODULE]?.forcedMovement;
    const source = workflow.token?.document ?? workflow.token;
    if (!Array.isArray(entries) || !source) return;
    // A failedSave entry also matches a save run as the attack's linked (other) activity.
    const matches = e => !e.activity || e.activity === workflow.activity?.id || (e.when === 'failedSave' && e.activity === workflow.saveActivity?.id);
    for (const entry of entries.filter(matches)) {
        for (const target of targetsFor(workflow, entry.when)) {
            const targetDoc = getTokenDocument(target);
            if (targetDoc === source || !targetDoc.actor) continue;
            if (entry.maxSize && actorUtils.getSize(targetDoc.actor) > SIZES.indexOf(entry.maxSize)) continue;
            if (entry.targetArmor === 'nonmagicalMetal' && !wearsNonmagicalMetal(targetDoc.actor)) continue;
            let distance = entry.distance;
            if (entry.toward === 'area') {
                const centre = areaCentre(workflow);
                const from = targetDoc.object?.center;
                if (!centre || !from) continue;
                const gap = Math.hypot(centre.x - from.x, centre.y - from.y) / targetDoc.parent.grid.size * targetDoc.parent.grid.distance;
                const pull = Math.min(distance ?? gap, Math.floor(gap / 5) * 5);
                if (pull > 0) await tokenUtils.slideToken(targetDoc, {distance: pull, ray: new foundry.canvas.geometry.Ray(from, centre)});
                continue;
            }
            if (entry.direction === 'pull') {
                const gap = tokenUtils.getDistance(source, targetDoc) - 5;
                distance = Math.min(0, -Math.min(distance ?? gap, gap));
            }
            if (distance) {
                const verb = distance > 0 ? 'Push' : 'Pull';
                if (entry.optional && !await dialogUtils.confirm(item.name, `${verb} ${targetDoc.name} ${Math.abs(distance)} feet?`)) continue;
                await tokenUtils.slideToken(targetDoc, {sourceToken: source, distance});
            }
            const effect = entry.effectIfAdjacent && item.effects.get(entry.effectIfAdjacent);
            if (effect && tokenUtils.getDistance(source, targetDoc) <= 5) {
                await effectUtils.createEffects(targetDoc.actor, [{...effect.toObject(), _id: undefined, transfer: false, origin: item.uuid}]);
            }
        }
    }
}
export const forcedMovement = {
    name: 'Forced Movement',
    version: '1.0.0',
    rules: 'all',
    roll: [{pass: 'itemRollFinished', macro: moved, priority: 70}]
};
