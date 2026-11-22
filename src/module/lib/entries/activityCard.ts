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
}
export interface DamagePart { number?: number | null, denomination?: number | null, bonus?: string, types?: string[], custom?: { enabled?: boolean, formula?: string }, scaling?: unknown }

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

function damageParts(data: ActivityData, t: CardText, kind: "damage" | "half"): BuiltInPart[] {
  const parts = (data.damage?.parts ?? []).map((part, i) => ({
    kind, field: `part.${i}`,
    text: t.say(kind === "half" ? "Activity.HalfDamage" : "Activity.Damage", { formula: partFormula(part) || "?", type: (part.types ?? []).map(id => t.damageType(id)).join("/") })
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
  dcCalculation?: string;
  dcFormula?: string;
  onSave?: string;
  parts?: { formula: string, type: string }[];
  healing?: { formula: string, type: string };
  effectsOnSave?: Record<string, boolean>;
}

/** The activity update for the card's edits (paths relative to the activity), only what changed */
export function activityUpdate(data: ActivityData, edits: CardEdits): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (edits.saveAbility && !same(edits.saveAbility, data.save?.ability ?? [])) update["save.ability"] = edits.saveAbility;
  if (edits.dcCalculation !== undefined && edits.dcCalculation !== (data.save?.dc?.calculation ?? "")) update["save.dc.calculation"] = edits.dcCalculation;
  if (edits.dcFormula !== undefined && edits.dcFormula !== (data.save?.dc?.formula ?? "")) update["save.dc.formula"] = edits.dcFormula;
  if (edits.onSave !== undefined && edits.onSave !== (data.damage?.onSave ?? "half")) update["damage.onSave"] = edits.onSave;
  if (edits.parts) {
    const parts = (data.damage?.parts ?? []).map((part, i) => {
      const edit = edits.parts![i];
      if (!edit) return part;
      const next = edit.formula === partFormula(part) ? part : partWithFormula(part, edit.formula);
      return edit.type && !same([edit.type], part.types ?? []) ? { ...next, types: [edit.type] } : next;
    });
    for (const added of edits.parts.slice(parts.length)) if (added.formula.trim()) parts.push(partWithFormula({ types: added.type ? [added.type] : [] }, added.formula));
    if (!same(parts, data.damage?.parts ?? [])) update["damage.parts"] = parts;
  }
  if (edits.healing && data.healing) {
    let healing = edits.healing.formula === partFormula(data.healing) ? data.healing : partWithFormula(data.healing, edits.healing.formula);
    if (edits.healing.type && !same([edits.healing.type], data.healing.types ?? [])) healing = { ...healing, types: [edits.healing.type] };
    if (!same(healing, data.healing)) update.healing = healing;
  }
  if (edits.effectsOnSave) {
    const list = (data.effects ?? []).map(e => e._id in edits.effectsOnSave! ? { ...e, onSave: edits.effectsOnSave![e._id] } : e);
    if (!same(list, data.effects ?? [])) update.effects = list;
  }
  return update;
}
