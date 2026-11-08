import {automationUtils, documentUtils, effectUtils, tokenUtils} from '../proxy.mjs';
// Casting whispers the caster whether it senses magic within 30 feet; the Sense Magic activity (identifier
// sense-magic, the spell's Magic action) the specifics that walls blocking sight don't hide: each creature's magic
// items by kind (a longsword, a potion: never the item's name), the magical effects on it (marked magical, or from a
// spell or a magic item) as "a magical effect" with the school of a spell's, and magical areas: regions made by a spell
// or a magic item, or marked flags.midi-qol.magical (flags.midi-qol.magicSchool for its school). A creature the caster
// can't see (invisible, hidden) only as an unseen creature radiating magic; tokens the GM has hidden are not reported.
// Detect Magic (Vision) (flags.midi-qol.detectMagic.vision): Sense Magic also gives the caster Magic Sight until the end
// of the turn or after the seconds set in its CAT configuration (15 by default): the GM and the caster's owners see rings around the visible creatures and the areas that
// bear magic, one per colour (a spell school, or magic items), brighter for higher spell levels and rarer items
// (magicSight.ts draws them).
const MODULE = 'midi-qol';
const RANGE = 30;
// CAT automation config by item identifier (catIntegration's automationInfo): how long Magic Sight lasts out of combat
export const detectMagicConfig = {
    'detect-magic-vision': {
        sightSeconds: {default: 15, type: 'number', label: 'Magic Sight duration (seconds)', category: 'mechanics'}
    }
};
const sightSeconds = item => Number(automationUtils.getConfigValue(item, 'sightSeconds') ?? detectMagicConfig[documentUtils.getIdentifier(item)]?.sightSeconds?.default ?? 15);
const SCHOOL_COLORS = {abj: 0x4da6ff, con: 0xffd84d, div: 0xe8e8ff, enc: 0xff6ec7, evo: 0xff4d4d, ill: 0xb04dff, nec: 0x3cb371, trs: 0xff9f40};
const ITEM_COLOR = 0x40e0d0;
const OTHER_COLOR = 0xffffff;
const RARITY_LEVELS = {common: 1, uncommon: 3, rare: 5, veryRare: 7, legendary: 9, artifact: 9};

function label(config) {
    return typeof config === 'string' ? config : config?.label;
}
function itemKind(item) {
    const type = item.system.type;
    const trait = item.type === 'weapon' ? 'weapon' : item.type === 'equipment' && CONFIG.DND5E.armorTypes?.[type?.value] ? 'armor' : null;
    const base = trait && type?.baseItem ? dnd5e.documents.Trait.keyLabel(type.baseItem, {trait}) : null;
    if (base && base !== type.baseItem) return base;
    const subtypes = {consumable: CONFIG.DND5E.consumableTypes, equipment: CONFIG.DND5E.equipmentTypes, loot: CONFIG.DND5E.lootTypes, weapon: CONFIG.DND5E.weaponTypes}[item.type];
    return label(subtypes?.[type?.value]) ?? game.i18n.localize(CONFIG.Item.typeLabels[item.type]);
}
function article(noun) {
    return `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`;
}
function withSchool(name, key) {
    const school = key ? CONFIG.DND5E.spellSchools[key]?.label ?? key : undefined;
    return school ? `${name} (${school})` : name;
}
function blocked(from, to) {
    return CONFIG.Canvas.polygonBackends.sight.testCollision(from, to, {type: 'sight', mode: 'any'});
}
// The magic a creature bears: [{text, color, level}].
function magicOn(actor) {
    const items = actor.items.filter(item => item.system.properties?.has?.('mgc') && !['spell', 'feat'].includes(item.type)).map(item => ({
        text: article(itemKind(item).toLowerCase()), color: ITEM_COLOR, level: RARITY_LEVELS[item.system.rarity] ?? 1
    }));
    // Magical: marked so, or from a spell or a magic item (dnd5e doesn't mark a spell's effects). A magic item the
    // creature carries is reported as the item; Concentrating is the caster's state, not magic on it.
    const effects = actor.effects.filter(effect => effect.active && !effect.statuses.has(CONFIG.specialStatusEffects.CONCENTRATING ?? 'concentrating')).flatMap(effect => {
        const source = DAE.getEffectItem(effect);
        const fromMagicItem = source?.system?.properties?.has?.('mgc') && source.type !== 'spell';
        if (fromMagicItem && source.actor === actor) return [];
        if (!effect.system?.magical && source?.type !== 'spell' && !fromMagicItem) return [];
        const school = source?.type === 'spell' ? source.system.school : undefined;
        const level = school ? Math.max(1, effect.flags?.[MODULE]?.castData?.castLevel ?? source.system.level ?? 1)
            : fromMagicItem ? RARITY_LEVELS[source.system.rarity] ?? 1 : 1;
        return [{text: withSchool('a magical effect', school), color: school ? SCHOOL_COLORS[school] ?? OTHER_COLOR : fromMagicItem ? ITEM_COLOR : OTHER_COLOR, level}];
    });
    return [...items, ...effects];
}
function regionMagic(region) {
    const item = region.flags.dnd5e?.item ? fromUuidSync(region.flags.dnd5e.item, {strict: false}) : null;
    const marked = region.flags[MODULE]?.magical;
    if (!marked && item?.type !== 'spell' && !item?.system.properties?.has?.('mgc')) return null;
    const school = region.flags[MODULE]?.magicSchool || (item?.type === 'spell' ? item.system.school : undefined);
    const level = item?.type === 'spell' ? Math.max(1, region.flags.dnd5e?.spellLevel ?? item.system.level ?? 1) : RARITY_LEVELS[item?.system.rarity] ?? 1;
    return {text: withSchool('a magical area', school), color: school ? SCHOOL_COLORS[school] ?? OTHER_COLOR : item ? ITEM_COLOR : OTHER_COLOR, level};
}
// The point of the region's bounds nearest `point`, and its distance in scene units.
function nearestPoint(region, point) {
    const b = region.object?.bounds;
    if (!b) return null;
    const near = {x: Math.clamp(point.x, b.x, b.x + b.width), y: Math.clamp(point.y, b.y, b.y + b.height)};
    const grid = canvas.scene.grid;
    return {near, distance: Math.hypot(near.x - point.x, near.y - point.y) / grid.size * grid.distance};
}
// What the caster senses: creatures (seen or not) and areas bearing magic, within range and not behind walls.
function sense(caster) {
    const origin = caster.object.center;
    const creatures = [];
    for (const token of caster.parent.tokens) {
        if (!token.actor || token.hidden || !token.object) continue;
        if (token !== caster && (tokenUtils.getDistance(caster, token) > RANGE || blocked(origin, token.object.center))) continue;
        const magic = magicOn(token.actor);
        if (!magic.length) continue;
        const seen = token === caster || (globalThis.MidiQOL?.canSee?.(caster, token) ?? token.object.visible);
        creatures.push({token, seen, magic});
    }
    const areas = [];
    for (const region of caster.parent.regions) {
        const magic = regionMagic(region);
        const point = magic && nearestPoint(region, origin);
        if (!point || point.distance > RANGE || blocked(origin, point.near)) continue;
        areas.push({region, magic});
    }
    return {creatures, areas};
}
// One ring per colour, as bright as its strongest source, the brightest innermost.
function rings(magic) {
    const byColor = new Map();
    for (const {color, level} of magic) byColor.set(color, Math.max(byColor.get(color) ?? 0, level));
    return [...byColor].map(([color, level]) => ({color, level})).sort((a, b) => b.level - a.level);
}
async function magicSight(actor, item, {creatures, areas}) {
    const entries = [
        ...creatures.filter(c => c.seen).map(c => ({tokenUuid: c.token.uuid, rings: rings(c.magic)})),
        ...areas.map(a => ({regionUuid: a.region.uuid, rings: rings([a.magic])}))
    ];
    const old = actor.effects.filter(effect => effect.flags?.[MODULE]?.magicSight);
    if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old.map(effect => effect.id));
    await effectUtils.createEffects(actor, [{
        name: 'Magic Sight',
        img: item.img,
        origin: item.uuid,
        description: '<p>Auras around the visible creatures and areas that bear magic, coloured by school (turquoise for magic items) and brighter for greater magic.</p>',
        // Core's turnEnd: the end of this turn (the creature's, in combat); magicSight.ts ends it after the configured seconds.
        duration: {expiry: 'turnEnd'},
        flags: {[MODULE]: {magicSight: {expires: Date.now() + sightSeconds(item) * 1000, entries}}}
    }]);
}
async function senseMagic({document: item, workflow}) {
    const caster = workflow.token?.document ?? workflow.token;
    if (!caster?.object) return;
    const sensed = sense(caster);
    const lines = [
        // A creature the caster can't see shows no aura: only that something unseen radiates magic.
        ...sensed.creatures.map(c => c.seen ? `<li><strong>${c.token.name}</strong>: ${c.magic.map(m => m.text).join(', ')}</li>` : '<li>An unseen creature radiates magic</li>'),
        ...sensed.areas.map(a => `<li>${a.magic.text.charAt(0).toUpperCase()}${a.magic.text.slice(1)}</li>`)
    ];
    const owners = game.users.filter(user => user.isGM || workflow.actor.testUserPermission(user, 'OWNER')).map(user => user.id);
    // Casting senses whether magic is near; the Sense Magic action (the spell's Magic action) shows where and what.
    const detailed = workflow.activity?.midiProperties?.identifier === 'sense-magic';
    const content = !lines.length ? '<p>Detect Magic: you sense no magic within 30 feet.</p>'
        : detailed ? `<p>Detect Magic senses magic within 30 feet:</p><ul>${lines.join('')}</ul>` : '<p>Detect Magic: you sense magic within 30 feet.</p>';
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({token: caster}), whisper: owners, content});
    if (detailed && item.flags?.[MODULE]?.detectMagic?.vision) await magicSight(workflow.actor, item, sensed);
}
export const detectMagic = {
    name: 'Detect Magic',
    version: '1.2.0',
    rules: '2024',
    roll: [
        {pass: 'itemRollFinished', macro: senseMagic, priority: 50}
    ]
};
