import { conditionWords, parseCondition, phraseLabel, VERB_FORMS, type ConditionPhraseDef, type ConditionSlot, type ConditionWording, type PhraseOption } from "./conditionPhrases.js";
import { conditionPhraseDefs, optionList } from "./editorServices.js";
import { register } from "../../api/services.js";

/*
 * midi's condition phrases (lib/entries/conditionPhrases.ts), and conditions in words. A module adds its own through
 * the entryWording service's `conditions()`:
 *
 *   MidiQOL.services.register("entryWording", "my-module", { conditions: () => [{
 *     id: "my-module.moonlit", group: "target", label: "the target is in moonlight", pattern: "tags.target.moonlit"
 *   }] });
 */

const KEY = "midi-qol.Sentence.Condition";
const words = (key: string) => game.i18n?.localize(`${KEY}.${key}`) ?? key;
const has = (key: string) => !!game.i18n?.has(`${KEY}.${key}`);

const options = (prefix: string, values: readonly string[]): PhraseOption[] => values.map(value => ({ value, label: words(`${prefix}.${value}`) }));
const select = (name: string, list: string): ConditionSlot => ({ name, type: "select", list });
const many = (name: string, list: string): ConditionSlot => ({ name, type: "multiselect", list });
const number = (name: string, initial: number): ConditionSlot => ({ name, type: "number", default: initial });

const REACTION_TRIGGERS = ["isHit", "isMissed", "isCrit", "isFumble", "isAttacked", "preAttack", "isTargeted", "isDamaged", "isHealed",
  "isSave", "isSaveFail", "isSaveSuccess", "isMoved", "isOpportunity", "isCast"];
const triggers = (): PhraseOption[] => REACTION_TRIGGERS.map(value => ({ value, label: game.i18n?.localize(`midi-qol.EntryEditor.Activity.Basics.Trigger.${value}`) ?? value }));
const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"];
const sizes = (): PhraseOption[] => {
  const config = (CONFIG as unknown as { DND5E?: { actorSizes?: Record<string, { label?: string }> } }).DND5E?.actorSizes ?? {};
  return SIZES.map((id, rank) => ({ value: String(rank), label: game.i18n?.localize(config[id]?.label ?? id) ?? id }));
};

type Row = [id: string, group: string, pattern: string, slots?: ConditionSlot[], extra?: { not?: string, also?: string[] }];

/** midi's phrases: [id (its wording's key), group, pattern, slots, the negated wording's key and other spellings] */
const rows = (): Row[] => [
  ["Spell", "use", "tags.use.kind === 'spell'"],
  ["Casts", "use", "tags.use.casts"],
  ["Cause", "use", "tags.use.cause === '{cause}'", [{ name: "cause", type: "select", options: options("Causes", ["direct", "reaction", "triggered", "chain", "overTime", "area"]) }]],
  ["Attack", "use", "tags.use.attack"],
  ["AttackKinds", "use", "[{kinds}].includes(tags.use.attack)", [{ name: "kinds", type: "multiselect", options: options("AttackKind", ["mwak", "rwak", "msak", "rsak"]) }]],
  ["Area", "use", "tags.use.area", [], { not: "NotArea" }],
  ["SpellSlot", "use", "tags.use.spellSlot"],
  ["SpellLevel", "use", "tags.use.spellLevel >= {level}", [number("level", 1)]],
  ["School", "use", "tags.use.school === '{school}'", [select("school", "spellSchools")]],
  ["Class", "use", "tags.use.class === '{name}'", [{ name: "name", type: "text" }]],
  ["Components", "use", "[{components}].some(c => tags.use.properties.has(c))", [{ name: "components", type: "multiselect", options: options("Component", ["vocal", "somatic", "material"]) }]],
  ["ItemComponents", "use", "[...(item.properties ?? [])].some(p => [{components}].includes(p))", [{ name: "components", type: "multiselect", options: options("Component", ["vocal", "somatic", "material"]) }]],
  ["Activation", "use", "tags.use.activation === '{activation}'", [select("activation", "activationTypes")]],
  ["Magical", "use", "tags.use.magical"],
  ["DealsDamage", "use", "event.use.activity.hasDamage"],
  ["DealsTypes", "use", "[{types}].some(t => tags.use.damageTypes.has(t))", [many("types", "damageTypes")]],
  ["Applies", "use", "[{statuses}].some(s => tags.use.statuses.has(s))", [many("statuses", "statuses")], { also: ["tags.use.statuses.has('{statuses}')"] }],
  ["HalfOnSave", "use", "use.activity.damage.onSave === 'half'"],
  ["Touch", "use", "use.activity.range.units === 'touch'"],
  ["TargetsScale", "use", "tags.use.targetsScale"],
  ["CostlyMaterial", "use", "tags.use.costlyMaterial", [], { not: "NoCostlyMaterial" }],
  ["HealedOther", "use", "tags.use.healedOthers > 0"],
  ["UseReaction", "use", "tags.use.reaction === '{trigger}'", [{ name: "trigger", type: "select", options: triggers() }]],

  ["Trigger", "reaction", "reaction === '{trigger}'", [{ name: "trigger", type: "select", options: triggers() }]],
  ["SubjectSelf", "reaction", "subject.isSelf"],
  ["SubjectAlly", "reaction", "subject.isAlly"],
  ["SubjectSeen", "reaction", "subject.canSee"],
  ["SubjectWithin", "reaction", "subject.distance <= {feet}", [number("feet", 30)]],

  ["TargetType", "target", "target.raceOrType.includes('{type}')", [select("type", "creatureTypes")], { not: "TargetNotType" }],
  ["CreatureType", "target", "raceOrType.includes('{type}')", [select("type", "creatureTypes")]],
  ["CreatureTypes", "target", "[{types}].includes(raceOrType)", [many("types", "creatureTypes")]],
  ["TargetSize", "target", "tags.target.sizeRank >= {size}", [{ name: "size", type: "select", options: sizes(), default: "3" }]],
  ["TargetSizeMax", "target", "tags.target.sizeRank <= {size}", [{ name: "size", type: "select", options: sizes(), default: "3" }]],
  ["TargetHas", "target", "tags.target.conditions.has('{status}')", [select("status", "statuses")]],
  ["Bloodied", "target", "tags.target.bloodied"],
  ["Concentrating", "target", "tags.target.concentrating"],
  ["Flying", "target", "tags.target.flying"],
  ["TargetHurt", "target", "targets.some(t => t.attributes.hp.value < t.attributes.hp.max)"],
  ["FromUser", "target", "tags.target.fromUser.has('{identifier}')", [{ name: "identifier", type: "text" }]],
  ["Chosen", "target", "target.chosen", [], { not: "NotChosen" }],
  ["Charge", "target", "tags.target.charge >= {distance}", [number("distance", 20)]],
  ["Within", "target", "tags.relation.distance <= {feet}", [number("feet", 30)]],
  ["SeesTarget", "target", "tags.relation.canSee"],
  ["TargetSees", "target", "tags.relation.targetCanSee"],

  ["Hit", "result", "tags.result.hit"],
  ["Critical", "result", "tags.result.critical"],
  ["Fumble", "result", "tags.result.fumble"],
  ["Saved", "result", "tags.result.saved"],
  ["Damaged", "result", "tags.result.damaged"],
  ["DroppedToZero", "result", "tags.result.droppedToZero"],

  ["RollKinds", "event", "[{kinds}].includes(event.kind)", [{ name: "kinds", type: "multiselect", options: options("RollKind", ["attack", "save", "check", "skill", "tool", "damage", "death", "concentration"]) }], { also: ["event.kind === '{kinds}'"] }],
  ["TakesType", "event", "(event.damage.applied.{type} ?? 0) > 0", [select("type", "damageTypes")]],
  ["AttackerIsCaster", "event", "event.actor.uuid === entry.origin.actor.uuid"],
  ["IsBearer", "event", "event.creature.uuid === bearer.uuid"]
];

let midiDefs: ConditionPhraseDef[] | undefined;

/** midi's own phrases, worded (built once: after the language is loaded) */
export function midiConditionPhrases(): ConditionPhraseDef[] {
  midiDefs ??= rows().map(([id, group, pattern, slots, extra]) => {
    // The negative is in the wording ({is|is not}); a label without the two forms may have its negated words apart
    const label = words(id);
    const not = extra?.not ?? `${id}Not`;
    return { id, group, pattern, label, ...(!VERB_FORMS.test(label) && has(not) ? { negatedLabel: words(not) } : {}), ...(slots?.length ? { slots } : {}), ...(extra?.also ? { also: extra.also } : {}) };
  });
  return midiDefs;
}

export function registerMidiConditionPhrases() {
  register("entryWording", "midi-qol.conditions", { conditions: midiConditionPhrases }, { label: "Midi-QOL: condition phrases" });
}

/** A slot's choices: its own, else its named list's */
export function slotOptions(slot: ConditionSlot | undefined): readonly PhraseOption[] {
  return slot?.options ?? (slot?.list ? optionList(slot.list) : []);
}

export function conditionWording(): ConditionWording {
  const say = (key: string, data: Record<string, string> = {}) => game.i18n?.format(`midi-qol.Sentence.${key}`, data) ?? key;
  return {
    and: say("And"), or: say("Or"),
    not: text => say("Condition.Not", { condition: text }),
    value: (slot, value) => slotOptions(slot).find(o => o.value === String(value))?.label ?? String(value)
  };
}

/** A condition in words, piece by piece; code where no phrase fits. `known`: whether any piece was put in words */
export function conditionText(expression: string): { text: string, known: boolean } {
  const defs = conditionPhraseDefs();
  return conditionWords(parseCondition(expression, defs), defs, conditionWording());
}

/** Phrases with nothing to fill, as ready-made conditions (the form's "add a common condition") */
export function readyMadeConditions(): { value: string, label: string }[] {
  return conditionPhraseDefs().filter(def => !def.slots?.length).flatMap(def => [{ value: def.pattern, label: phraseLabel(def, false).text },
    // With its opposite, where the wording has one
    ...(phraseLabel(def, true).own ? [{ value: /===/.test(def.pattern) ? def.pattern.replace("===", "!==") : `!${def.pattern}`, label: phraseLabel(def, true).text }] : [])]);
}
