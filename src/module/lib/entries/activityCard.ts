import type { Entry } from "./types.js";

/*
 * An activity read as an entry (the entry editor's activity card): what it does by itself, as dnd5e runs it, in
 * branches ("if a target fails its save: Paralyzed"), and the actions added to each branch. What it does by itself is
 * the activity's own data, edited here and written back to the activity, so dnd5e, its sheet and other modules see
 * the same activity. Added actions are ordinary entries in the activity's midiEntries, one per branch
 * (`activity-<branch>`, on the branch's per-target use event), drawn inside the branch.
 */

export type ActivityBranch = "hit" | "missed" | "saveFailed" | "saveSucceeded" | "each";
export const BRANCH_EVENT: Record<ActivityBranch, string> = {
  hit: "use.target.hit", missed: "use.target.missed", saveFailed: "use.target.saveFailed", saveSucceeded: "use.target.saveSucceeded", each: "use.target.each"
};
export const branchEntryId = (branch: ActivityBranch) => `activity-${branch}`;

/** A branch's own entry: the id and event the editor gives it, and nothing it can't show inside the branch */
export function isBranchEntry(entry: Entry): ActivityBranch | undefined {
  const branch = (Object.keys(BRANCH_EVENT) as ActivityBranch[]).find(b => entry.id === branchEntryId(b));
  if (!branch) return undefined;
  const on = [entry.on].flat();
  if (on.length !== 1 || on[0] !== BRANCH_EVENT[branch]) return undefined;
  if (entry.offer || entry.choose || entry.limit || entry.group || entry.activity || entry.who) return undefined;
  return branch;
}

/** The parts of an activity a card shows, as stored (the activity's _source) */
export interface ActivityData {
  type: string;
  save?: { ability?: string[], dc?: { calculation?: string, formula?: string } };
  attack?: { type?: { value?: string, classification?: string } };
  check?: { ability?: string, associated?: string[], dc?: { calculation?: string, formula?: string } };
  damage?: { onSave?: string, includeBase?: boolean, parts?: DamagePart[] };
  healing?: DamagePart;
  effects?: { _id: string, onSave?: boolean }[];
  /** summon / transform: who or what */
  profiles?: { name?: string, uuid?: string | null, count?: string, types?: string[] }[];
  /** cast: the spell */
  spell?: { uuid?: string | null, level?: number | null };
  /** enchant: what can be enchanted */
  restrictions?: { type?: string };
  /** forward: the activity used */
  activity?: { id?: string };
  /** The item's spell level (0: a cantrip), when it is a spell: how its damage scales */
  spellLevel?: number;
  /** midi's region rules for the area it makes */
  regionBehavior?: { enabled?: boolean, attachToken?: string, dispositionFilter?: number, oncePerTurn?: boolean, rules?: { trigger: string, action: string, targetId: string }[] };
  /** dnd5e's region behaviours (an effect applied while inside) */
  behaviors?: { type: string, config?: { effects?: string[] } }[];
  /** The area it makes, worded ("15 ft emanation"), when it makes one */
  areaLabel?: string;
  /** Its targeting as dnd5e resolves it (the editor fills it from the prepared activity) */
  targeting?: Targeting;
}

/** What the area an activity makes does: midi's rules, dnd5e's effects while inside */
export interface CardRegion { text: string, rules: string[] }
export interface DamagePart { number?: number | null, denomination?: number | null, bonus?: string, types?: string[], custom?: { enabled?: boolean, formula?: string }, scaling?: { mode?: string, number?: number | null, formula?: string } }

/** A part's formula as dnd5e writes it (its custom formula, else NdX + bonus) */
export function partFormula(part: DamagePart): string {
  if (part.custom?.enabled) return part.custom.formula ?? "";
  const dice = part.number && part.denomination ? `${part.number}d${part.denomination}` : "";
  const bonus = (part.bonus ?? "").trim();
  if (!dice) return bonus;
  if (!bonus) return dice;
  return /^[+-]/.test(bonus) ? `${dice} ${bonus[0]} ${bonus.slice(1).trim()}` : `${dice} + ${bonus}`;
}

/** A part given a formula: kept as dice when it is plain NdX (+ a number), else a custom formula */
export function partWithFormula(part: DamagePart, formula: string): DamagePart {
  const plain = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(formula);
  if (plain) return { ...part, number: Number(plain[1]), denomination: Number(plain[2]), bonus: plain[3] ? `${plain[3] === "-" ? "-" : ""}${plain[4]}` : "", custom: { enabled: false, formula: "" } };
  return { ...part, custom: { enabled: true, formula } };
}

export type BuiltInKind = "save" | "attack" | "check" | "damage" | "healing" | "effect" | "half" | "none";
/** One thing the activity does by itself; `field`: the card field that edits it */
export interface BuiltInPart { kind: BuiltInKind, text: string, field?: string }
export interface CardBranch { branch: ActivityBranch, builtIn: BuiltInPart[] }
export interface ActivityCardModel { when: BuiltInPart[], branches: CardBranch[], region?: CardRegion, targeting?: BuiltInPart }

export interface CardText {
  ability(id: string): string;
  damageType(id: string): string;
  effectName(id: string): string;
  /** A document's name by uuid (a compendium's index), undefined when unknown */
  documentName(uuid: string): string | undefined;
  /** One of the item's activities by id */
  activityName(id: string): string | undefined;
  /** An item type's or creature type's label */
  typeLabel(kind: "item" | "creature", id: string): string;
  /** A wording (`Activity.Type.<type>` falls back to `Activity.Used` when there is none) */
  say(key: string, data?: Record<string, string>): string;
}

const DC_FIELD = "dc";

function dcText(dc: { calculation?: string, formula?: string } | undefined, t: CardText): string {
  const calculation = dc?.calculation ?? "";
  if (calculation === "spellcasting") return t.say("Activity.DC.spellcasting");
  if (calculation) return t.say("Activity.DC.ability", { ability: t.ability(calculation) });
  return t.say("Activity.DC.custom", { dc: dc?.formula || "?" });
}

/** How a part's damage grows: a cantrip's with the caster's level, a spell's with its slot */
function scales(part: DamagePart, data: ActivityData, t: CardText): string {
  if (!part.scaling?.mode || part.scaling.mode === "none" || data.spellLevel === undefined) return "";
  return ` ${t.say(data.spellLevel === 0 ? "Activity.Scales.cantrip" : "Activity.Scales.slot")}`;
}

function damageParts(data: ActivityData, t: CardText, kind: "damage" | "half"): BuiltInPart[] {
  const parts = (data.damage?.parts ?? []).map((part, i) => ({
    kind, field: `part.${i}`,
    text: t.say(kind === "half" ? "Activity.HalfDamage" : "Activity.Damage", { formula: partFormula(part) || "?", type: (part.types ?? []).map(id => t.damageType(id)).join("/") }) + scales(part, data, t)
  } satisfies BuiltInPart));
  if (data.damage?.includeBase && data.type === "attack") parts.unshift({ kind, field: "", text: t.say(kind === "half" ? "Activity.HalfBase" : "Activity.BaseDamage") });
  return parts;
}

function effects(data: ActivityData, t: CardText, filter: (onSave: boolean) => boolean): BuiltInPart[] {
  return (data.effects ?? []).filter(e => filter(!!e.onSave)).map(e => ({ kind: "effect" as const, field: `effect.${e._id}`, text: t.effectName(e._id) }));
}

const RULE_TRIGGERS = ["entry", "exit", "turnStart", "turnEnd"];

/** The area's rules, grouped by what they do: "an enemy that enters it or ends its turn in it: uses Spirit Guardians Save" */
export function cardRegion(data: ActivityData, t: CardText): CardRegion | undefined {
  const rb = data.regionBehavior;
  const whileIn = (data.behaviors ?? []).filter(b => b.type === "applyActiveEffect").flatMap(b => b.config?.effects ?? []).map(uuid => t.documentName(uuid) ?? "?");
  const rules = rb?.enabled ? rb.rules ?? [] : [];
  if (!rules.length && !whileIn.length) return undefined;
  const area = data.areaLabel || t.say("Activity.Region.anArea");
  const attached = rb?.enabled && rb.attachToken === "caster" ? t.say("Activity.Region.attachedCaster") : rb?.enabled && rb.attachToken === "target" ? t.say("Activity.Region.attachedTarget") : "";
  const who = t.say(`Activity.Region.who.${rb?.dispositionFilter === 1 ? "ally" : rb?.dispositionFilter === 0 ? "any" : "enemy"}`);
  const byAction = new Map<string, string[]>();
  for (const rule of rules) {
    const target = rule.action === "useActivity" ? t.activityName(rule.targetId) ?? rule.targetId : t.effectName(rule.targetId);
    const does = t.say(`Activity.Region.action.${rule.action}`, { what: target });
    const trigger = RULE_TRIGGERS.includes(rule.trigger) ? t.say(`Activity.Region.trigger.${rule.trigger}`) : rule.trigger;
    byAction.set(does, [...(byAction.get(does) ?? []), trigger]);
  }
  const or = t.say("Activity.Region.or");
  // Once per turn limits the activities a creature is made to use, not effects
  const uses = new Set(rules.filter(r => r.action === "useActivity").map(r => t.say("Activity.Region.action.useActivity", { what: t.activityName(r.targetId) ?? r.targetId })));
  const lines = [...byAction].map(([does, triggers]) => t.say("Activity.Region.rule", { who, when: triggers.join(` ${or} `), does })
    + (rb?.oncePerTurn && uses.has(does) ? ` ${t.say("Activity.Region.oncePerTurn")}` : ""));
  if (whileIn.length) lines.push(t.say("Activity.Region.whileIn", { effects: whileIn.join(", ") }));
  return { text: t.say("Activity.Region.makes", { area, attached }), rules: lines };
}

/** What the activity does by itself, by branch */
export function activityCard(data: ActivityData, t: CardText): ActivityCardModel {
  const card = activityCardOf(data, t);
  const region = cardRegion(data, t);
  const targeting = data.targeting ? { kind: "none" as const, text: targetingText(data.targeting, t), field: "target" } : undefined;
  return { ...card, ...(region ? { region } : {}), ...(targeting ? { targeting } : {}) };
}

function activityCardOf(data: ActivityData, t: CardText): ActivityCardModel {
  switch (data.type) {
    case "attack":
      return {
        when: [{ kind: "attack", text: t.say(`Activity.Attack.${data.attack?.type?.value === "ranged" ? "ranged" : "melee"}`), field: "roll" }],
        branches: [
          { branch: "hit", builtIn: [...damageParts(data, t, "damage"), ...effects(data, t, () => true)] },
          { branch: "missed", builtIn: [] }
        ]
      };
    case "save": {
      const abilities = (data.save?.ability ?? []).map(id => t.ability(id)).join("/") || "?";
      const onSave = data.damage?.onSave ?? "half";
      const succeeded: BuiltInPart[] = (data.damage?.parts?.length ?? 0) && onSave !== "none"
        ? onSave === "full" ? damageParts(data, t, "damage") : damageParts(data, t, "half") : [];
      return {
        when: [{ kind: "save", text: t.say("Activity.Save", { ability: abilities }), field: "roll" }, { kind: "save", text: dcText(data.save?.dc, t), field: DC_FIELD }],
        branches: [
          { branch: "saveFailed", builtIn: [...damageParts(data, t, "damage"), ...effects(data, t, () => true)] },
          { branch: "saveSucceeded", builtIn: [...succeeded, ...effects(data, t, onSave => onSave)] }
        ]
      };
    }
    case "check": {
      const check = data.check;
      const skills = (check?.associated ?? []).join("/");
      const ability = check?.ability ? t.ability(check.ability) : "?";
      return {
        when: [{ kind: "check", text: t.say("Activity.Check", { ability: skills ? `${ability} (${skills})` : ability }), field: "roll" },
          { kind: "check", text: dcText(check?.dc, t), field: DC_FIELD }],
        branches: [{ branch: "each", builtIn: effects(data, t, () => true) }]
      };
    }
    case "summon":
    case "transform": {
      const names = (data.profiles ?? []).map(p => {
        const name = p.name || (p.uuid ? t.documentName(p.uuid) : undefined);
        const types = (p.types ?? []).map(id => t.typeLabel("creature", id)).join("/");
        const label = name && types ? `${name} (${types})` : name || types || "?";
        return p.count && p.count !== "1" ? `${label} ×${p.count}` : label;
      }).join(", ") || "?";
      return {
        when: [{ kind: "none", text: t.say(`Activity.${data.type === "summon" ? "Summons" : "Transforms"}`, { what: names }) }],
        branches: [{ branch: "each", builtIn: effects(data, t, () => true) }]
      };
    }
    case "cast": {
      const spell = data.spell?.uuid ? t.documentName(data.spell.uuid) : undefined;
      return {
        when: [{ kind: "none", text: t.say(data.spell?.level ? "Activity.CastsAt" : "Activity.Casts", { spell: spell ?? "?", level: String(data.spell?.level ?? "") }) }],
        branches: [{ branch: "each", builtIn: [] }]
      };
    }
    case "enchant":
      return {
        when: [{ kind: "none", text: t.say("Activity.Enchants", { what: data.restrictions?.type ? t.typeLabel("item", data.restrictions.type) : t.say("Activity.AnItem") }) }],
        branches: [{ branch: "each", builtIn: effects(data, t, () => true) }]
      };
    case "forward":
      return {
        when: [{ kind: "none", text: t.say("Activity.Forwards", { activity: (data.activity?.id && t.activityName(data.activity.id)) || "?" }) }],
        branches: [{ branch: "each", builtIn: [] }]
      };
    default: {
      const healing = data.healing && partFormula(data.healing)
        ? [{ kind: "healing" as const, field: "healing", text: t.say("Activity.Healing", { formula: partFormula(data.healing), type: (data.healing.types ?? []).map(id => t.damageType(id)).join("/") }) }] : [];
      return {
        // Every other type (a module's too): what it does by its type's wording, else "is used"
        when: [{ kind: "none", text: t.say(`Activity.Type.${data.type}`), field: "roll" }],
        branches: [{ branch: "each", builtIn: [...damageParts(data, t, "damage"), ...healing, ...effects(data, t, () => true)] }]
      };
    }
  }
}

/** The card's fields for an activity: what can be edited here */
export interface CardEdits {
  /** Another roll for the activity: converted on save (same id) */
  convertTo?: RollKind;
  /** The targeting chip's edits */
  target?: TargetEdits;
  attackType?: string;
  attackClass?: string;
  saveAbility?: string[];
  checkAbility?: string;
  dcCalculation?: string;
  dcFormula?: string;
  onSave?: string;
  /** A part's formula and its damage types (several: the roller chooses one, as dnd5e's sheet sets them) */
  parts?: { formula: string, types: string[] }[];
  healing?: { formula: string, types: string[] };
  effectsOnSave?: Record<string, boolean>;
}

/** The activity update for the card's edits (paths relative to the activity), only what changed */
export function activityUpdate(data: ActivityData, edits: CardEdits): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (edits.attackType && edits.attackType !== (data.attack?.type?.value ?? "")) update["attack.type.value"] = edits.attackType;
  if (edits.attackClass && edits.attackClass !== (data.attack?.type?.classification ?? "")) update["attack.type.classification"] = edits.attackClass;
  if (edits.saveAbility && !same(edits.saveAbility, data.save?.ability ?? [])) update["save.ability"] = edits.saveAbility;
  // A check's DC is check.dc, a save's save.dc
  const dcOf = data.type === "check" ? "check" : "save";
  const dc = data.type === "check" ? data.check?.dc : data.save?.dc;
  if (edits.checkAbility !== undefined && edits.checkAbility !== (data.check?.ability ?? "")) update["check.ability"] = edits.checkAbility;
  if (edits.dcCalculation !== undefined && edits.dcCalculation !== (dc?.calculation ?? "")) update[`${dcOf}.dc.calculation`] = edits.dcCalculation;
  if (edits.dcFormula !== undefined && edits.dcFormula !== (dc?.formula ?? "")) update[`${dcOf}.dc.formula`] = edits.dcFormula;
  if (edits.onSave !== undefined && edits.onSave !== (data.damage?.onSave ?? "half")) update["damage.onSave"] = edits.onSave;
  if (edits.parts) {
    const parts = (data.damage?.parts ?? []).map((part, i) => {
      const edit = edits.parts![i];
      if (!edit) return part;
      const next = edit.formula === partFormula(part) ? part : partWithFormula(part, edit.formula);
      return !same(edit.types, part.types ?? []) ? { ...next, types: edit.types } : next;
    });
    for (const added of edits.parts.slice(parts.length)) if (added.formula.trim()) parts.push(partWithFormula({ types: added.types }, added.formula));
    if (!same(parts, data.damage?.parts ?? [])) update["damage.parts"] = parts;
  }
  if (edits.healing && data.healing) {
    let healing = edits.healing.formula === partFormula(data.healing) ? data.healing : partWithFormula(data.healing, edits.healing.formula);
    if (!same(edits.healing.types, data.healing.types ?? [])) healing = { ...healing, types: edits.healing.types };
    if (!same(healing, data.healing)) update.healing = healing;
  }
  if (edits.effectsOnSave) {
    const list = (data.effects ?? []).map(e => e._id in edits.effectsOnSave! ? { ...e, onSave: edits.effectsOnSave![e._id] } : e);
    if (!same(list, data.effects ?? [])) update.effects = list;
  }
  return update;
}

/* Converting an activity to another roll (the sentence view's roll chip): the author picks what happens to the target,
   midi picks the activity type */

export type RollKind = "attack" | "save" | "check" | "damage" | "heal" | "utility";
export const ROLL_KINDS: readonly RollKind[] = ["attack", "save", "check", "damage", "heal", "utility"];

/** Each type's own data, dropped when the activity becomes another type */
const TYPE_KEYS = ["attack", "save", "check", "damage", "healing", "roll", "profiles", "summon", "creatureSizes", "creatureTypes",
  "match", "bonuses", "spell", "restrictions", "enchant", "transform", "settings", "activity"];

/** The branches each roll has */
export function branchesOf(type: string): ActivityBranch[] {
  return type === "attack" ? ["hit", "missed"] : type === "save" ? ["saveFailed", "saveSucceeded"] : ["each"];
}

/** Where a branch's actions go when the roll changes: a failure is a hit, a success a miss; "each" the main one */
export function branchFor(from: ActivityBranch, to: string): ActivityBranch | undefined {
  const branches = branchesOf(to);
  if (branches.includes(from)) return from;
  const main = branches[0], other = branches[1];
  if (from === "hit" || from === "saveFailed" || from === "each") return main;
  return other;
}

/** An activity's data as another roll: what the types share kept, the new roll's defaults filled */
export function convertActivity(source: Record<string, unknown>, to: RollKind, options: { spell: boolean }): Record<string, unknown> {
  // Plain stored data: no Foundry needed (unit-tested)
  const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) if (!TYPE_KEYS.includes(key)) next[key] = clone(value);
  next.type = to;
  const damage = source.damage as { parts?: DamagePart[], onSave?: string, includeBase?: boolean } | undefined;
  const parts = clone(damage?.parts ?? (source.healing ? [source.healing as DamagePart] : []));
  const dc = { calculation: options.spell ? "spellcasting" : "", formula: options.spell ? "" : "10" };
  switch (to) {
    case "attack":
      next.attack = clone(source.attack) ?? { type: { value: "melee", classification: options.spell ? "spell" : "weapon" } };
      next.damage = { parts, includeBase: damage?.includeBase ?? false };
      break;
    case "save":
      next.save = clone(source.save) ?? { ability: ["dex"], dc };
      next.damage = { parts, onSave: damage?.onSave ?? "half" };
      break;
    case "check":
      next.check = clone(source.check) ?? { ability: "str", associated: [], dc };
      break;
    case "damage":
      next.damage = { parts };
      break;
    case "heal":
      next.healing = parts[0] ?? { number: 1, denomination: 8, bonus: "", types: ["healing"], custom: { enabled: false, formula: "" } };
      break;
    case "utility":
      next.roll = clone(source.roll) ?? { formula: "", name: "", prompt: false, visible: false };
      break;
  }
  // Actions added to a branch follow it to the matching branch
  const entries = next.midiEntries;
  if (Array.isArray(entries)) next.midiEntries = entries.map(e => moveBranchEntry(e as Entry, to));
  return next;
}

/** A branch's own entry, moved to the branch it matches in a roll of `to` (anything else unchanged) */
export function moveBranchEntry(entry: Entry, to: string): Entry {
  const branch = isBranchEntry(entry);
  const target = branch ? branchFor(branch, to) : undefined;
  if (!branch || !target || target === branch) return entry;
  return { ...entry, id: branchEntryId(target), on: BRANCH_EVENT[target] };
}

/* Targeting presets (the sentence view's "Targets" chip): one dropdown for dnd5e's target, template and range */

/** An activity's targeting as dnd5e resolves it (its own, else its item's) */
export interface Targeting {
  affectsType?: string;
  count?: string | number | null;
  templateType?: string;
  size?: string | number | null;
  width?: string | number | null;
  rangeUnits?: string;
  rangeValue?: string | number | null;
}
export type TargetPreset = "self" | "touch" | "one" | "several" | "point" | "fromYou" | "emanation" | "custom";
export const TARGET_PRESETS: readonly TargetPreset[] = ["one", "several", "self", "touch", "point", "fromYou", "emanation"];
export const POINT_SHAPES = ["sphere", "cube", "cylinder"];
export const FROM_YOU_SHAPES = ["cone", "line"];
const EMANATION_SHAPES = ["radius", "emanationNoTemplate"];

/** The preset a targeting reads as; data no preset describes exactly is "custom" (never forced into one) */
export function targetPreset(t: Targeting): TargetPreset {
  const shape = t.templateType || "";
  const distance = t.rangeUnits === "ft" || t.rangeUnits === "m";
  if (shape) {
    if (t.rangeUnits === "self") return FROM_YOU_SHAPES.includes(shape) ? "fromYou" : EMANATION_SHAPES.includes(shape) ? "emanation" : "custom";
    return POINT_SHAPES.includes(shape) && distance ? "point" : "custom";
  }
  if (t.affectsType === "self") return "self";
  const count = Number(t.count || 1);
  if (t.rangeUnits === "touch") return count <= 1 ? "touch" : "custom";
  if (distance) return count <= 1 ? "one" : "several";
  return t.rangeUnits === "self" && !t.affectsType ? "self" : "custom";
}

/** What the targeting says: "one creature within 60 ft", "a 20 ft sphere at a point within 150 ft" */
export function targetingText(tg: Targeting, t: CardText): string {
  const preset = targetPreset(tg);
  const who = t.say(`Activity.Target.who.${["enemy", "ally"].includes(tg.affectsType ?? "") ? tg.affectsType : "creature"}${Number(tg.count || 1) > 1 ? "s" : ""}`);
  const range = `${tg.rangeValue ?? "?"} ${tg.rangeUnits ?? ""}`.trim();
  return t.say(`Activity.Target.${preset}`, { who, count: String(tg.count ?? ""), range, shape: t.say(`Activity.Shape.${tg.templateType || "sphere"}`), size: String(tg.size ?? "?"), width: String(tg.width ?? "") });
}

/** The edits the targeting chip makes */
export interface TargetEdits { preset?: TargetPreset, count?: number, range?: number, shape?: string, size?: number, width?: number, who?: string }

/** The targeting after the chip's edits (a preset changed: its own defaults, kept from before where they fit) */
export function editedTargeting(current: Targeting, edits: TargetEdits | undefined): Targeting {
  if (!edits?.preset && !edits) return current;
  const preset = edits.preset ?? targetPreset(current);
  if (preset === "custom") return current;
  const who = edits.who ?? (["enemy", "ally", "creature"].includes(current.affectsType ?? "") ? current.affectsType : "creature");
  const range = edits.range ?? (Number(current.rangeValue) || 30);
  const size = edits.size ?? (Number(current.size) || (preset === "fromYou" ? 15 : preset === "emanation" ? 10 : 20));
  switch (preset) {
    case "self": return { affectsType: "self", count: "", templateType: "", rangeUnits: "self", rangeValue: null };
    case "touch": return { affectsType: who, count: 1, templateType: "", rangeUnits: "touch", rangeValue: null };
    case "one": return { affectsType: who, count: 1, templateType: "", rangeUnits: "ft", rangeValue: range };
    case "several": return { affectsType: who, count: edits.count ?? Math.max(2, Number(current.count) || 2), templateType: "", rangeUnits: "ft", rangeValue: range };
    case "point": return { affectsType: who, count: "", templateType: POINT_SHAPES.includes(edits.shape ?? "") ? edits.shape : POINT_SHAPES.includes(current.templateType ?? "") ? current.templateType : "sphere", size, rangeUnits: "ft", rangeValue: edits.range ?? (Number(current.rangeValue) || 60) };
    case "fromYou": {
      const shape = FROM_YOU_SHAPES.includes(edits.shape ?? "") ? edits.shape! : FROM_YOU_SHAPES.includes(current.templateType ?? "") ? current.templateType! : "cone";
      return { affectsType: who, count: "", templateType: shape, size, width: shape === "line" ? edits.width ?? (Number(current.width) || 5) : null, rangeUnits: "self", rangeValue: null };
    }
    case "emanation": return { affectsType: who, count: "", templateType: "radius", size, rangeUnits: "self", rangeValue: null };
  }
}

/** The update a targeting makes: on the item (a spell's activity that uses the spell's) or the activity (its own) */
export function targetingUpdate(tg: Targeting, onItem: boolean): Record<string, unknown> {
  const target = onItem ? "system.target" : "target";
  const range = onItem ? "system.range" : "range";
  return {
    ...(onItem ? {} : { "target.override": true, "range.override": true }),
    [`${target}.affects.type`]: tg.affectsType ?? "",
    [`${target}.affects.count`]: tg.count === "" || tg.count === null || tg.count === undefined ? "" : String(tg.count),
    [`${target}.template.type`]: tg.templateType ?? "",
    [`${target}.template.size`]: tg.templateType ? String(tg.size ?? "") : "",
    [`${target}.template.width`]: tg.templateType === "line" ? String(tg.width ?? "") : "",
    [`${target}.template.units`]: "ft",
    [`${range}.units`]: tg.rangeUnits ?? "",
    [`${range}.value`]: tg.rangeValue === null || tg.rangeValue === undefined ? "" : String(tg.rangeValue)
  };
}
