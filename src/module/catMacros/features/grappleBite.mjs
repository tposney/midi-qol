import {dialogUtils, effectUtils, tokenUtils, workflowUtils} from '../proxy.mjs';
// Grappling with an attack, and attacks on the grappled.
// flags.midi-qol.grappleOnHit = {activity, dcActivity, auto, restrained, autoHitItem}: after a hit with the activity
// the target is grappled (CAT's grapple, escape DC from dcActivity's check): the GM is asked unless `auto`. While it
// grapples a creature the activity can't be used against another one. `restrained`: the grappled creature is also
// Restrained; `autoHitItem`: that item's attacks by the grappler hit it automatically. Both
// end with the grapple. `maxSize`: only targets of that size or smaller; `exclusive: false`: other targets stay allowed;
// `then: {item, activity}`: once the attack has finished, that activity is used on the grappled creature (an
// engulf). `blockWhileGrappling`: no use at all while it grapples.
// Without dcActivity the escape DC is 8 + Strength modifier + proficiency bonus.
// flags.midi-qol.targetGrappled = {activity}: the activity's targets are the creatures this creature grapples.
const MODULE = 'midi-qol';
const sourceOf = workflow => workflow.token?.document ?? workflow.token;
const SIZES = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];
async function biteCheck({document: item, workflow}) {
    const c = item.flags?.[MODULE]?.grappleOnHit;
    if (!c || workflow.activity?.id !== c.activity) return;
    const held = tokenUtils.getGrappled(sourceOf(workflow));
    if (c.blockWhileGrappling && held.length) {
        ui.notifications.warn(`${item.name}: ${item.actor.name} is grappling ${held.map(t => t.name).join(', ')} and can't use it.`);
        workflow.aborted = true;
        return;
    }
    if (c.exclusive === false) return;
    const target = [...workflow.targets][0]?.document;
    if (!held.length || !target || held.some(t => t.id === target.id)) return;
    ui.notifications.warn(`${item.name}: ${item.actor.name} is grappling ${held.map(t => t.name).join(', ')} and can't use it against another target.`);
    workflow.aborted = true;
}
async function bitten({document: item, workflow}) {
    const c = item.flags?.[MODULE]?.grappleOnHit;
    if (!c || workflow.activity?.id !== c.activity || !workflow.hitTargets.size) return;
    const source = sourceOf(workflow);
    const target = [...workflow.hitTargets][0];
    const targetDoc = target.document ?? target;
    const held = source ? tokenUtils.getGrappled(source) : [];
    if (!source || held.some(t => t.id === targetDoc.id) || (c.exclusive !== false && held.length)) return;
    if (c.maxSize && SIZES.indexOf(targetDoc.actor?.system.traits.size) > SIZES.indexOf(c.maxSize)) return;
    const abilities = item.actor.system.abilities;
    const dc = item.system.activities.get(c.dcActivity)?.check?.dc?.value ?? (8 + (abilities.str?.mod ?? 0) + (item.actor.system.attributes.prof ?? 0));
    const go = c.auto || await dialogUtils.confirm(item.name, `${source.name} hit ${targetDoc.name}. Grapple it${dc ? ` (escape DC ${dc})` : ''}?`,
        {userId: (game.users.activeGM ?? game.user).id});
    if (!go) return;
    await tokenUtils.grapple(source, targetDoc, {flatDC: dc, contest: false, rules: '2024'});
    if (c.then) {
        // After the attack: a use started inside the creature's own use gets no targets.
        const activity = item.actor.items.find(i => i.name === c.then.item)?.system.activities.get(c.then.activity);
        const executing = () => globalThis.MidiQOL?.Workflow?.executingCardFor?.(item.actor);
        (async () => {
            for (let i = 0; i < 60 && executing(); i++) await new Promise(resolve => setTimeout(resolve, 250));
            if (activity && tokenUtils.getGrappled(source).some(t => t.id === targetDoc.id)) {
                await workflowUtils.syntheticActivityRoll(activity, [targetDoc], {consumeUsage: false, consumeResources: false});
            }
        })();
    }
    if (!c.restrained && !c.autoHitItem) return;
    const grip = targetDoc.actor?.effects.find(e => e.flags?.cat?.identifier === 'grappleTarget' && e.flags.cat.grapple?.tokenId === source.id);
    if (!grip) return;
    const changes = c.autoHitItem ? [{key: 'flags.midi-qol.grants.attack.success.all', type: 'custom', value: `tokenUuid === "${source.uuid}" && item.name === "${c.autoHitItem}"`}] : [];
    await effectUtils.createEffects(targetDoc.actor, [{name: `${item.name}: Held`, img: item.img, statuses: c.restrained ? ['restrained'] : [],
        system: {changes}, origin: grip.uuid, flags: {dnd5e: {dependentOn: grip.uuid}}}]);
}
async function targetGrappled({document: item, workflow}) {
    const c = item.flags?.[MODULE]?.targetGrappled;
    if (!c || workflow.activity?.id !== c.activity) return;
    const held = tokenUtils.getGrappled(sourceOf(workflow));
    if (!held.length) {
        ui.notifications.warn(`${item.name}: ${item.actor.name} isn't grappling anyone.`);
        workflow.aborted = true;
        return;
    }
    await workflowUtils.updateTargets(workflow, held);
}
export const grappleOnHit = {
    name: 'Grapple On Hit',
    version: '1.0.0',
    rules: 'all',
    roll: [
        {pass: 'itemPreItemRoll', macro: biteCheck, priority: 50},
        {pass: 'itemRollFinished', macro: bitten, priority: 50}
    ]
};
export const targetGrappledMacro = {
    name: 'Target Grappled',
    version: '1.0.0',
    rules: 'all',
    roll: [{pass: 'itemTargeting', macro: targetGrappled, priority: 50}]
};
