import { tokenFor } from '../../lib/tokenResolver.js';
import {getTokenDocument} from '../../utils.js';
import {forcedMovement as forced} from '../../services/forcedMovement/service.js';
import {actorUtils, dialogUtils, distanceUtils, effectUtils, tokenUtils} from '../proxy.mjs';
// Pushes or pulls targets after an activity (midi's forcedMovement service), from the item's flags.midi-qol.forcedMovement entries:
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
    // Moved on the canvas: the canvas tokens
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
            const targetDoc = tokenFor(target);
            if (targetDoc === source || !targetDoc.actor) continue;
            if (entry.maxSize && actorUtils.getSize(targetDoc.actor) > SIZES.indexOf(entry.maxSize)) continue;
            if (entry.targetArmor === 'nonmagicalMetal' && !wearsNonmagicalMetal(targetDoc.actor)) continue;
            let distance = entry.distance;
            if (entry.toward === 'area') {
                const centre = areaCentre(workflow);
                const from = targetDoc.object?.center;
                if (!centre || !from) continue;
                // Whole grid spaces to the centre, in feet (a 1.5 m space is not exactly 5 ft)
                const gap = distanceUtils.fromGridSpaces(targetDoc.parent, Math.floor(Math.hypot(centre.x - from.x, centre.y - from.y) / targetDoc.parent.grid.size));
                const pull = Math.min(distance ?? gap, gap);
                if (pull > 0) await forced.pull(targetDoc, {towards: centre, distance: pull});
                continue;
            }
            // A pull without a distance ends adjacent (the service stops a pull there)
            if (entry.direction === 'pull') distance ??= Math.max(0, tokenUtils.getDistance(source, targetDoc) - 5);
            if (distance) {
                const verb = entry.direction === 'pull' ? 'Pull' : 'Push';
                if (entry.optional && !await dialogUtils.confirm(item.name, `${verb} ${targetDoc.name} ${distanceUtils.formatDistance(targetDoc.parent, Math.abs(distance))}?`)) continue;
                if (entry.direction === 'pull') await forced.pull(targetDoc, {towards: source, distance: Math.abs(distance)});
                else await forced.push(targetDoc, {from: source, distance: Math.abs(distance)});
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
