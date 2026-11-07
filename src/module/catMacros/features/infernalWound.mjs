import {getTokenDocument} from '../../utils.js';
import {automationUtils, documentUtils, workflowUtils} from '../proxy.mjs';
// Infernal wound (2024 Bearded Devil's Infernal Glaive, Horned Devil's Infernal Tail). A creature without a wound that
// fails the save gets one: it loses hit points at the start of each of its turns, until the wound closes after its
// duration, when a spell restores hit points to it, or when it or a creature within 5 feet succeeds on a Medicine check.
// The glaive rolls its wound save (its save activity) against the creatures it hit that have no wound; the tail's save is
// its own activity. The wound effect (flags.midi-qol.infernalWound) refuses to stack and, when created, takes the item's
// configuration: what the wound costs each turn, how long it lasts and the Medicine DC.
const MODULE = 'midi-qol';
const FLAG = 'infernalWound';
const woundConfig = (formula, stanchDC) => ({
    woundFormula: {default: formula, type: 'text', label: 'Hit points lost each turn', category: 'mechanics'},
    duration: {default: 10, type: 'number', label: 'Duration (rounds)', category: 'mechanics'},
    stanchDC: {default: stanchDC, type: 'text', label: 'Medicine DC to stanch the wound', category: 'mechanics'}
});
// CAT automation config by item identifier (catIntegration's automationInfo)
export const infernalWoundConfig = {
    'infernal-glaive': {
        saveAbility: {default: 'con', type: 'select', label: 'Wound saving throw', category: 'mechanics',
            options: () => Object.entries(CONFIG.DND5E.abilities).map(([value, ability]) => ({value, label: ability.label}))},
        saveDC: {default: '12', type: 'text', label: 'Wound save DC', category: 'mechanics'},
        ...woundConfig('1d10', '12')
    },
    'infernal-tail': woundConfig('3d6', '8 + @mod + @prof')
};
const config = (item, key) => automationUtils.getConfigValue(item, key) ?? infernalWoundConfig[documentUtils.getIdentifier(item)]?.[key]?.default;
export const woundsOf = actor => actor?.effects.filter(effect => effect.getFlag(MODULE, FLAG) && !effect.disabled) ?? [];
/** A dice-free formula (a DC) against the devil's roll data */
function evaluateDC(formula, item) {
    const value = Roll.safeEval(Roll.replaceFormulaData(String(formula), item?.getRollData?.() ?? {}, {missing: '0'}));
    return Number.isFinite(value) ? Math.floor(value) : 10;
}
function originItem(origin) {
    const document = origin ? fromUuidSync(origin) : null;
    return document instanceof Item ? document : document?.item;
}
// The glaive: the creatures it hit with no wound yet make the wound save
async function glaiveHit({document: item, workflow}) {
    if (workflow.activity?.type !== 'attack') return;
    const targets = workflow.hitTargets.documents.filter(token => token.actor && !woundsOf(token.actor).length);
    const save = item.system.activities.find(activity => activity.type === 'save');
    if (!targets.length || !save) return;
    const data = save.toObject();
    data.save = {...data.save, ability: [config(item, 'saveAbility')], dc: {calculation: '', formula: String(config(item, 'saveDC'))}};
    await workflowUtils.syntheticActivityDataRoll(data, item, targets, {consumeUsage: false, consumeResources: false,
        options: {workflowOptions: {targetConfirmation: 'none'}}});
}
// One wound at a time; a new one takes the item's configuration
async function woundCreating({effect, actor}) {
    if (!effect?.flags?.[MODULE]?.[FLAG]) return;
    if (woundsOf(actor).length) return true;
    const item = originItem(effect.origin ?? effect.system?.origin?.activity);
    effect.flags[MODULE][FLAG] = {formula: String(config(item, 'woundFormula')), stanchDC: evaluateDC(config(item, 'stanchDC'), item)};
    const rounds = Number(config(item, 'duration'));
    if (rounds > 0) effect.duration = {...(effect.duration ?? {}), value: rounds, units: 'rounds'};
}
async function turnStart({document: effect, actor, token}) {
    const wound = effect?.getFlag(MODULE, FLAG);
    if (!wound?.formula || !actor) return;
    const roll = await new Roll(wound.formula).evaluate();
    await roll.toMessage({flavor: `${effect.name}: hit points lost`, speaker: ChatMessage.getSpeaker({actor, token: getTokenDocument(token)})});
    // Hit points lost, not damage: no type, so nothing reduces it
    await actor.applyDamage(roll.total);
}
/** A Medicine check by `roller` against the wounds of `target` (itself, or within 5 feet): a success closes them */
export async function stanchWounds(roller, target, total) {
    const wounds = woundsOf(target?.actor);
    if (!wounds.length) return false;
    if (roller && roller !== target && canvas.grid.measurePath([roller.center, target.center]).distance > 5) return false;
    const closed = wounds.filter(wound => total >= (wound.getFlag(MODULE, FLAG)?.stanchDC ?? 10));
    for (const wound of closed) await documentUtils.deleteDocument(wound);
    if (closed.length) ui.notifications?.info(`${target.name}: ${closed[0].name} stanched`);
    return closed.length > 0;
}
export function registerInfernalWoundHooks() {
    // A Medicine check by a creature whose user targets a wounded creature within 5 feet, or by the wounded creature itself
    Hooks.on('dnd5e.rollSkill', async (rolls, {skill, subject}) => {
        if (skill !== 'med' || !rolls?.length) return;
        const roller = subject?.getActiveTokens?.()[0];
        const targets = [...(game.user?.targets ?? [])].filter(token => woundsOf(token.actor).length);
        if (!targets.length && roller && woundsOf(subject).length) targets.push(roller);
        for (const target of targets) await stanchWounds(roller, target, rolls[0].total);
    });
    // A spell that restores hit points closes the wound
    Hooks.on('dnd5e.preApplyDamage', (actor, _amount, updates, options) => {
        const wounds = woundsOf(actor);
        if (!wounds.length) return;
        const hp = actor.system.attributes.hp;
        const newHp = updates?.['system.attributes.hp.value'];
        if (!(typeof newHp === 'number' && newHp > hp.value)) return;
        const message = options?.originatingMessage;
        const sourceItem = message?.getAssociatedItem?.() ?? message?.system?.item;
        if (sourceItem?.type !== 'spell') return;
        for (const wound of wounds) documentUtils.deleteDocument(wound);
    });
}
export const infernalWound = {
    name: 'Infernal Wound',
    version: '1.0.0',
    rules: '2024',
    roll: [{pass: 'itemRollFinished', macro: glaiveHit, priority: 50}],
    effect: [{pass: 'doCreated', macro: woundCreating, priority: 50}],
    combat: [{pass: 'actorTurnStart', macro: turnStart, priority: 50}]
};
