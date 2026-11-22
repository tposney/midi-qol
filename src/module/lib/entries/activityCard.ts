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
}
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
export interface ActivityCardModel { when: BuiltInPart[], branches: CardBranch[] }

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

/** What the activity does by itself, by branch */
export function activityCard(data: ActivityData, t: CardText): ActivityCardModel {
  switch (data.type) {
    case "attack":
      return {
        when: [{ kind: "attack", text: t.say(`Activity.Attack.${data.attack?.type?.value === "ranged" ? "ranged" : "melee"}`), field: "attack" }],
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
        when: [{ kind: "save", text: t.say("Activity.Save", { ability: abilities }), field: "save" }, { kind: "save", text: dcText(data.save?.dc, t), field: DC_FIELD }],
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
        when: [{ kind: "check", text: t.say("Activity.Check", { ability: skills ? `${ability} (${skills})` : ability }), field: "check" },
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
        when: [{ kind: "none", text: t.say(`Activity.Type.${data.type}`) }],
        branches: [{ branch: "each", builtIn: [...damageParts(data, t, "damage"), ...healing, ...effects(data, t, () => true)] }]
      };
    }
  }
}

/** The card's fields for an activity: what can be edited here */
export interface CardEdits {
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
