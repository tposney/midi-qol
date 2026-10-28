import {actorUtils, dialogUtils, documentUtils, effectUtils, genericUtils, itemUtils, Logging, workflowUtils} from '../proxy.mjs';
// 2024 Metamagic options. Sorcery Points are Metamagic Adept's uses, then Font of Magic's. A used option (Careful … Twinned) asks for a
// spell and casts it, modified, at the current targets; Empowered and Seeking offer themselves during any spell.
// With Sorcery Incarnate and Innate Sorcery active a second option can be added to the casting.
// Passes adapted from Cauldron of Plentiful Resources (chris-premades, MIT licence).
const MODULE = 'midi-qol';
const ELEMENTS = ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder'];
const TWIN_EXCLUDED = ['magic-missile', 'scorching-ray', 'chromatic-orb'];
const COSTS = {
    'careful-spell': 1, 'distant-spell': 1, 'empowered-spell': 1, 'extended-spell': 1, 'heightened-spell': 2,
    'quickened-spell': 2, 'seeking-spell': 1, 'subtle-spell': 1, 'transmuted-spell': 1, 'twinned-spell': 1
};
// Metamagic Adept's points can only be spent on Metamagic, so they go first.
function pools(actor) {
    return ['metamagic-adept', 'font-of-magic'].map(identifier => actorUtils.getItemByIdentifier(actor, identifier)).filter(item => item?.system.uses?.max);
}
function points(actor) {
    return pools(actor).reduce((total, item) => total + item.system.uses.value, 0);
}
function costOf(item) {
    return COSTS[item.identifier] ?? 0;
}
async function spend(actor, amount) {
    if (points(actor) < amount) return;
    const receipt = [];
    for (const item of pools(actor)) {
        const taken = Math.min(amount, item.system.uses.value);
        if (!taken) continue;
        await documentUtils.update(item, {'system.uses.spent': item.system.uses.spent + taken});
        receipt.push({item, taken});
        amount -= taken;
        if (!amount) break;
    }
    return receipt;
}
async function refund(receipt = []) {
    for (const {item, taken} of receipt) await documentUtils.update(item, {'system.uses.spent': Math.max(0, item.system.uses.spent - taken)});
}
function notEnough(item) {
    genericUtils.notify(item.name + ': not enough Sorcery Points.', 'info', {localize: false});
}
function chaMax(actor) {
    return Math.max(1, actor.system.abilities.cha?.mod ?? 0);
}
function targetsOf(workflow) {
    return Array.from(workflow.targets, token => token.document ?? token);
}
function hasSave(spell) {
    return spell.system.activities.some(activity => activity.type === 'save' || activity.save?.ability?.size);
}
function durationSeconds(spell) {
    return effectUtils.durationToSeconds(spell.system.duration.getEffectData());
}
function rangeFormula(range) {
    return range.units === 'touch' ? {units: 'ft', value: '30'} : {value: '(' + range.value + ') * 2'};
}
// Twinned: the spell gains a target when upcast, i.e. its target count is written in terms of the cast level. Read
// from _source: the prepared count is already evaluated. Projectiles (Magic Missile's darts) scale the same way, so
// those spells are excluded by identifier; flags.midi-qol.twinnable on a spell overrides either way.
function twinnable(spell) {
    const ruling = spell.getFlag(MODULE, 'twinnable');
    if (typeof ruling === 'boolean') return ruling;
    if (spell.system.level < 1 || TWIN_EXCLUDED.includes(spell.identifier)) return false;
    const targets = [spell._source.system.target, ...spell.system.activities.map(activity => activity._source.target?.override ? activity._source.target : null)].filter(Boolean);
    if (targets.some(target => target.template?.type)) return false;
    return targets.some(target => /@item\.level|@scaling/.test(String(target.affects?.count ?? '')));
}
function transmutedUpdates(spell, from, to) {
    const updates = {};
    for (const activity of spell.system.activities.getByTypes('attack', 'damage', 'save')) {
        const parts = activity.toObject().damage.parts;
        let changed = false;
        for (const part of parts) {
            if (part.types?.includes(from)) {
                part.types = part.types.map(type => type === from ? to : type);
                changed = true;
            }
            if (part.custom?.enabled && part.custom.formula?.includes(from)) {
                part.custom.formula = part.custom.formula.replaceAll(from, to);
                changed = true;
            }
        }
        if (changed) updates['system.activities.' + activity.id + '.damage.parts'] = parts;
    }
    return updates;
}
async function pickTargets(item, workflow, prompt, max) {
    const targets = targetsOf(workflow);
    if (!targets.length) return [];
    const selection = await dialogUtils.selectTargetDialog(item.name, prompt, targets, max > 1 ? {type: 'multiple', maxAmount: max} : {});
    const result = selection?.result;
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
}
// Each option adds to the plan rather than casting, so two can modify one casting.
const OPTIONS = {
    'careful-spell': {
        eligible: hasSave,
        prepare: (spell, plan) => plan.markers.push('metamagic-careful')
    },
    'distant-spell': {
        eligible: spell => spell.system.range.units === 'touch' || (spell.system.range.units === 'ft' && spell.system.range.value >= 5),
        prepare: (spell, plan) => {
            const range = spell._source.system.range;
            plan.updates['system.range'] = {...range, ...rangeFormula(range)};
            for (const activity of spell.system.activities) {
                const own = activity._source.range;
                if (own?.override) plan.updates['system.activities.' + activity.id + '.range'] = {...own, ...rangeFormula(own)};
            }
        }
    },
    'extended-spell': {
        eligible: spell => (durationSeconds(spell) ?? 0) >= 60,
        prepare: (spell, plan) => {
            // Doubled in the spell's own units, capped at 24 hours.
            const {value, units} = spell.system.duration;
            const seconds = durationSeconds(spell);
            const perUnit = seconds / Number(value);
            const doubled = seconds * 2 > 86400 ? Math.floor(86400 / perUnit) : Number(value) * 2;
            plan.updates['system.duration.value'] = String(doubled);
            if (spell.system.properties.has('concentration')) plan.after.push(concentrationAdvantage);
        }
    },
    'heightened-spell': {
        eligible: hasSave,
        prepare: (spell, plan) => plan.markers.push('metamagic-heightened')
    },
    'quickened-spell': {
        eligible: spell => spell.system.activation?.type === 'action',
        prepare: (spell, plan) => {
            plan.updates['system.activation.type'] = 'bonus';
            for (const activity of spell.system.activities) {
                if (activity._source.activation?.override && activity.activation.type === 'action') plan.updates['system.activities.' + activity.id + '.activation.type'] = 'bonus';
            }
        }
    },
    'subtle-spell': {
        // Material components that are consumed or have a cost stay.
        eligible: spell => subtleComponents(spell).length > 0,
        prepare: (spell, plan) => {
            const dropped = subtleComponents(spell);
            plan.updates['system.properties'] = Array.from(spell.system.properties).filter(property => !dropped.includes(property));
        }
    },
    'transmuted-spell': {
        eligible: spell => itemUtils.getItemDamageTypes(spell).intersects(new Set(ELEMENTS)),
        prepare: async (spell, plan, item) => {
            const present = ELEMENTS.filter(type => itemUtils.getItemDamageTypes(spell).has(type));
            const from = present.length === 1 ? present[0] : await dialogUtils.selectDamageType(present, item.name, 'Change which damage type?');
            if (!from) return false;
            const to = await dialogUtils.selectDamageType(ELEMENTS.filter(type => type !== from), item.name, 'Change ' + from + ' into which type?');
            if (!to) return false;
            Object.assign(plan.updates, transmutedUpdates(spell, from, to));
        }
    },
    'twinned-spell': {
        // 2024: +1 effective level, the extra target coming from the spell's own scaling. The slot is spent here
        // so the cast can be made a level higher than the slot.
        eligible: twinnable,
        prepare: async (spell, plan, item, actor) => {
            const selection = await dialogUtils.selectSpellSlots(actor, item.name, 'Expend which spell slot? ' + spell.name + ' takes effect one level higher.', {maxAmount: 1, maxAmountMode: 'count', minLevel: spell.system.level});
            const key = selection?.[0]?.key;
            if (!key) return false;
            plan.slot = key;
            plan.atLevel = actor.system.spells[key].level + 1;
        }
    }
};
function subtleComponents(spell) {
    const materials = spell.system.materials ?? {};
    const keepMaterial = materials.consumed || Number(materials.cost) > 0;
    return ['vocal', 'somatic', ...(keepMaterial ? [] : ['material'])].filter(component => spell.system.properties.has(component));
}
async function concentrationAdvantage(actor, spell, item) {
    const concentration = effectUtils.getConcentrationEffect(actor, spell);
    if (!concentration) return;
    await effectUtils.createEffects(actor, [{
        name: item.name + ': Concentration',
        img: item.img,
        origin: item.uuid,
        system: {changes: [{key: 'system.attributes.concentration.roll.mode', type: 'add', value: '1', phase: 'initial'}]},
        flags: {dnd5e: {dependentOn: concentration.uuid}}
    }]);
}
// A second option needs Sorcery Incarnate while Innate Sorcery is active.
function optionLimit(actor) {
    const incarnate = actorUtils.getItemByIdentifier(actor, 'sorcery-incarnate');
    if (!incarnate) return 1;
    const sources = [actorUtils.getItemByIdentifier(actor, 'innate-sorcery'), incarnate].filter(Boolean).map(item => item.uuid);
    return actor.effects.some(effect => effect.active && sources.some(uuid => effect.origin?.startsWith(uuid))) ? 2 : 1;
}
function ownedOptions(actor, exclude) {
    return actor.items.filter(item => item.type === 'feat' && item.identifier in OPTIONS && item.identifier !== exclude);
}
async function cast(spell, workflow, plan) {
    const actor = workflow.actor;
    const targets = targetsOf(workflow);
    if (plan.atLevel) {
        const allowed = Number(spell.clone({'system.level': plan.atLevel}, {keepId: true}).system.target?.affects?.count);
        if (Number.isFinite(allowed) && allowed > 0 && targets.length > allowed) {
            genericUtils.notify(spell.name + ' at level ' + plan.atLevel + ' affects ' + allowed + ' creature(s); ' + targets.length + ' are targeted.', 'warn', {localize: false});
            return false;
        }
    }
    const markers = [];
    if (plan.markers.length) {
        const [marker] = await effectUtils.createEffects(actor, [documentUtils.getBaseEffectData(null, {
            name: workflow.item.name,
            img: workflow.item.img,
            origin: workflow.item.uuid,
            duration: {value: 1, units: 'rounds'},
            macros: [{type: 'roll', macros: plan.markers.map(identifier => ({source: MODULE, rules: '2024', identifier}))}]
        })]);
        if (marker) markers.push(marker);
    }
    try {
        const data = genericUtils.mergeObject(spell.toObject(), plan.updates, {inplace: false});
        const options = plan.atLevel
            ? {atLevel: plan.atLevel, spellSlot: false}
            : {options: {configureDialog: true}, dialog: {configure: true}};
        const castWorkflow = await workflowUtils.syntheticItemDataRoll(data, actor, targets, options);
        if (!castWorkflow || castWorkflow.aborted || (targets.length && !castWorkflow.targets?.size)) return false;
        if (plan.slot) await actorUtils.spendSpellSlots(actor, plan.slot);
        for (const step of plan.after) await step(actor, spell, workflow.item);
        return true;
    } finally {
        for (const marker of markers) if (actor.effects.get(marker.id)) await documentUtils.deleteDocument(marker);
    }
}
async function use({document: item, workflow}) {
    const actor = workflow.actor;
    const first = OPTIONS[item.identifier];
    if (!first || !actor) return;
    if (points(actor) < costOf(item)) return notEnough(item);
    const spells = actorUtils.getCastableSpells(actor).filter(first.eligible);
    if (!spells.length) return Logging.addMacroWarning(MODULE, item.identifier, 'No eligible spell.', {notify: 'info'});
    const spell = await dialogUtils.selectDocumentDialog(item.name, 'Cast which spell with ' + item.name + '?', spells, {sort: 'level', showSpellLevel: true, addNoneDocument: true});
    if (!spell) return;
    const plan = {updates: {}, markers: [], after: [], atLevel: undefined, slot: undefined};
    if (await first.prepare(spell, plan, item, actor) === false) return;
    let cost = costOf(item);
    if (optionLimit(actor) > 1) {
        const others = ownedOptions(actor, item.identifier).filter(other => OPTIONS[other.identifier].eligible(spell) && cost + costOf(other) <= points(actor));
        if (others.length) {
            const choice = await dialogUtils.buttonDialog(item.name, 'Add a second Metamagic option to ' + spell.name + '?',
                [...others.map(other => [other.name + ' (' + costOf(other) + ')', other.id]), ['No', 'none']]);
            const second = actor.items.get(choice);
            if (second) {
                if (await OPTIONS[second.identifier].prepare(spell, plan, second, actor) === false) return;
                cost += costOf(second);
            }
        }
    }
    const receipt = await spend(actor, cost);
    if (!receipt) return notEnough(item);
    if (!await cast(spell, workflow, plan)) await refund(receipt);
}
async function carefulPreamble({document: effect, workflow}) {
    if (!workflow.targets.size || workflow.item?.type !== 'spell') return;
    const max = chaMax(workflow.actor);
    const protectedTargets = await pickTargets(effect, workflow, 'Careful Spell: protect up to ' + max + ' creature(s).', max);
    for (const target of protectedTargets) workflowUtils.grantRollModifier(workflow, 'succeed', target.id, 'careful-spell', effect.name);
    if (protectedTargets.length) workflowUtils.setWorkflowProperty(workflow, 'carefulTargets', protectedTargets.map(target => target.uuid));
}
// A protected creature that takes half damage on a success takes none.
async function carefulSaves({workflow}) {
    const uuids = workflowUtils.getWorkflowProperty(workflow, 'carefulTargets') ?? [];
    for (const token of workflow.saves) {
        if (uuids.includes((token.document ?? token).uuid)) workflow.superSavers = workflow.superSavers.add(token);
    }
}
async function heightenedPreamble({document: effect, workflow}) {
    if (!workflow.targets.size || workflow.item?.type !== 'spell') return;
    const [target] = await pickTargets(effect, workflow, 'Heightened Spell: which target has Disadvantage on its save?', 1);
    if (target) workflowUtils.grantRollModifier(workflow, 'dis', target.id, 'heightened-spell', effect.name);
}
async function empowered({document: item, workflow}) {
    if (workflow.item?.type !== 'spell' || !workflow.hitTargets.size || !workflow.damageRolls?.length) return;
    const cost = costOf(item);
    if (points(workflow.actor) < cost) return;
    const max = chaMax(workflow.actor);
    const selection = await dialogUtils.selectDie(workflow.damageRolls, item.name, 'Spend ' + cost + ' Sorcery Point to reroll up to ' + max + ' damage dice?', {max});
    if (!selection?.length || !await spend(workflow.actor, cost)) return;
    const rerolls = [];
    for (const key of selection) {
        const [rollIndex, termIndex, resultIndex] = key.split('-').map(Number);
        const term = workflow.damageRolls[rollIndex]?.terms[termIndex];
        const result = term?.results[resultIndex];
        if (!result) continue;
        const roll = await new Roll('1d' + term.faces).evaluate();
        rerolls.push({faces: term.faces, original: result.result, roll, rollIndex});
        result.result = roll.total;
    }
    if (!rerolls.length) return;
    for (const rollIndex of new Set(rerolls.map(reroll => reroll.rollIndex))) {
        const damageRoll = workflow.damageRolls[rollIndex];
        damageRoll._total = damageRoll._evaluateTotal();
    }
    const messageData = {
        speaker: ChatMessage.implementation.getSpeaker({actor: workflow.actor}),
        flavor: item.name + ': ' + rerolls.map(reroll => 'd' + reroll.faces + ' ' + reroll.original + ' → ' + reroll.roll.total).join(', '),
        rolls: rerolls.map(reroll => reroll.roll)
    };
    ChatMessage.implementation.applyMode(messageData, CONFIG.Dice.BasicRoll.getMessageMode());
    await ChatMessage.implementation.create(messageData);
    await workflow.setDamageRolls(workflow.damageRolls);
}
async function seeking({document: item, workflow}) {
    if (workflow.item?.type !== 'spell' || !workflow.attackRoll || !workflow.targets.size) return;
    const total = workflow.attackRoll.total;
    if (Array.from(workflow.targets).every(target => (target.actor?.system.attributes.ac.value ?? Infinity) <= total)) return;
    const cost = costOf(item);
    if (points(workflow.actor) < cost) return;
    if (!await dialogUtils.confirmUseForRollTotal(item, workflow.item.name, total)) return;
    if (!await spend(workflow.actor, cost)) return;
    const {formula, data, options} = workflow.attackRoll;
    const reroll = await new workflow.attackRoll.constructor(formula, data, options).evaluate();
    await workflow.setAttackRoll(reroll);
}
const version = '1.0.0';
const used = {version, rules: '2024', roll: [{pass: 'itemRollFinished', macro: use, priority: 50}]};
export const carefulSpell = {name: 'Careful Spell', ...used};
export const distantSpell = {name: 'Distant Spell', ...used};
export const extendedSpell = {name: 'Extended Spell', ...used};
export const heightenedSpell = {name: 'Heightened Spell', ...used};
export const quickenedSpell = {name: 'Quickened Spell', ...used};
export const subtleSpell = {name: 'Subtle Spell', ...used};
export const transmutedSpell = {name: 'Transmuted Spell', ...used};
export const twinnedSpell = {name: 'Twinned Spell', ...used};
export const metamagicCareful = {
    name: 'Careful Spell: Effect',
    version,
    rules: '2024',
    roll: [
        {pass: 'actorPreambleComplete', macro: carefulPreamble, priority: 50},
        {pass: 'actorSavesComplete', macro: carefulSaves, priority: 50}
    ]
};
export const metamagicHeightened = {
    name: 'Heightened Spell: Effect',
    version,
    rules: '2024',
    roll: [{pass: 'actorPreambleComplete', macro: heightenedPreamble, priority: 50}]
};
export const empoweredSpell = {
    name: 'Empowered Spell',
    version,
    rules: '2024',
    roll: [{pass: 'actorDamageRollComplete', macro: empowered, priority: 50}]
};
export const seekingSpell = {
    name: 'Seeking Spell',
    version,
    rules: '2024',
    roll: [{pass: 'actorAttackRoll', macro: seeking, priority: 800}]
};
