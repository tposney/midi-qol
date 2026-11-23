import { setActionSchema, type ActionField } from "./engine.js";

/*
 * M32d: the entry editor's forms for midi's own actions (format spike, "The format"). Actions whose values are
 * the OverTime conversion of an action save (actionSave) are edited as JSON; a value a field's widget
 * can't show is kept, and shown as JSON in that field.
 */

const dnd5e = () => (CONFIG as unknown as { DND5E?: Record<string, Record<string, { label?: string }>> }).DND5E ?? {};

const ROLL_KINDS = { path: "rolls", label: "midi-qol.Entries.Field.rolls", type: "list" as const };
const TO = (options: string[]): ActionField => ({ path: "to", label: "midi-qol.Entries.Field.to", type: "select", options: ["", ...options] });
const LABEL: ActionField = { path: "label", label: "midi-qol.Entries.Field.label", type: "string" };

export function registerMidiActionSchemas() {
  setActionSchema("move", { fields: [
    { path: "move.push", label: "midi-qol.Entries.Field.push", type: "formula", numeric: true },
    { path: "move.pull", label: "midi-qol.Entries.Field.pull", type: "formula", numeric: true },
    { path: "move.slide", label: "midi-qol.Entries.Field.slide", type: "formula", numeric: true },
    { path: "move.angle", label: "midi-qol.Entries.Field.angle", type: "number" },
    { path: "move.from", label: "midi-qol.Entries.Field.from", type: "select", options: ["", "user", "bearer", "area"] },
    TO(["target", "self", "event.creature"])], initial: { push: 10 } });
  setActionSchema("opportunityAttack", { fields: [], initial: true });
  setActionSchema("damage", { fields: [
    { path: "damage", label: "midi-qol.Entries.Field.formula", type: "formula" },
    { path: "type", label: "DND5E.DamageType", type: "select", options: { list: "damageTypes" } },
    TO(["target", "self", "event.creature"]), LABEL], initial: "1d6" });
  setActionSchema("heal", { fields: [
    { path: "heal", label: "midi-qol.Entries.Field.formula", type: "formula" },
    { path: "type", label: "midi-qol.Entries.Field.healingType", type: "select", options: { list: "healingTypes" } },
    TO(["target", "self", "event.creature"]), LABEL], initial: "1d6" });
  setActionSchema("bonus", { fields: [
    { path: "bonus.kind", label: "midi-qol.Entries.Field.kind", type: "select", options: ["add", "reroll", "mode", "replace", "outcome"] },
    { path: "bonus.formula", label: "midi-qol.Entries.Field.formula", type: "formula" },
    { path: "bonus.mode", label: "midi-qol.Entries.Field.mode", type: "select", options: ["", "advantage", "disadvantage"] },
    { path: "bonus.keep", label: "midi-qol.Entries.Field.keep", type: "select", options: ["", "new", "higher", "lower"] },
    ROLL_KINDS, LABEL], initial: { kind: "add", formula: "1d4" } });
  setActionSchema("modifier", { fields: [
    { path: "modifier", label: "midi-qol.Entries.Field.modifier", type: "select",
      options: ["advantage", "disadvantage", "noAdvantage", "noDisadvantage", "critical", "noCritical", "fumble", "noFumble", "success", "fail", "min", "max"] },
    { path: "value", label: "midi-qol.Entries.Field.value", type: "number" },
    ROLL_KINDS, { path: "for", label: "midi-qol.Entries.Field.for", type: "string" }, LABEL], initial: "advantage" });
  setActionSchema("damageChange", { fields: [
    { path: "damageChange.stage", label: "midi-qol.Entries.Field.stage", type: "select", options: ["bonus", "flatReduction", "percentReduction", "complete"] },
    { path: "damageChange.amount", label: "midi-qol.Entries.Field.amount", type: "formula" },
    { path: "damageChange.multiplier", label: "midi-qol.Entries.Field.multiplier", type: "formula", numeric: true },
    { path: "damageChange.types", label: "midi-qol.Entries.Field.types", type: "multiselect", options: { list: "damageTypes" } },
    { path: "for", label: "midi-qol.Entries.Field.for", type: "string" }, LABEL], initial: { stage: "flatReduction" } });
  setActionSchema("effect", { fields: [
    { path: "effect", label: "midi-qol.Entries.Field.effectMode", type: "select", options: ["apply", "remove"] },
    { path: "what", label: "midi-qol.Entries.Field.what", type: "effectRef" },
    TO(["self", "target", "event.creature", "origin", "anyone"])], initial: "apply" });
  setActionSchema("end", { fields: [{ path: "end", label: "midi-qol.Entries.Field.end", type: "boolean" }], initial: true });
  setActionSchema("abort", { fields: [{ path: "abort", label: "midi-qol.Entries.Field.reason", type: "string" }] });
  setActionSchema("retarget", { fields: [
    { path: "retarget.to", label: "midi-qol.Entries.Field.to", type: "select", options: ["self", "bearer", "choose", "none"] },
    { path: "retarget.orLose", label: "midi-qol.Entries.Field.orLose", type: "boolean" }, LABEL], initial: { to: "choose" } });
  setActionSchema("transfer", { fields: [
    { path: "transfer.to", label: "midi-qol.Entries.Field.to", type: "select", options: ["origin", "bearer", "pool"] },
    { path: "transfer.amount", label: "midi-qol.Entries.Field.amount", type: "string" },
    { path: "transfer.keep", label: "midi-qol.Entries.Field.keep", type: "boolean" },
    { path: "transfer.type", label: "DND5E.DamageType", type: "select", options: { list: "damageTypes", include: ["none"] } }, LABEL], initial: { to: "origin" } });
  const BY: ActionField = { path: "by", label: "midi-qol.Entries.Field.by", type: "select", options: ["", "attacker", "bearer"] };
  setActionSchema("save", { fields: [
    { path: "save", label: "midi-qol.Entries.Field.save", type: "rollSpec" }, BY,
    { path: "damage", label: "midi-qol.Entries.Field.damageOnFail", type: "formula" },
    { path: "type", label: "DND5E.DamageType", type: "select", options: { list: "damageTypes" } },
    { path: "onSave", label: "midi-qol.Entries.Field.onSave", type: "select", options: ["", "half", "none", "full"] },
    LABEL, { path: "flavor", label: "midi-qol.Entries.Field.flavor", type: "string" }], initial: "applying" });
  setActionSchema("check", { fields: [{ path: "check", label: "midi-qol.Entries.Field.check", type: "rollSpec" }, BY, LABEL], initial: { ability: "str", dc: 10 } });
  setActionSchema("use", { fields: [{ path: "use", label: "midi-qol.Entries.Field.use", type: "string" }, LABEL] });
  // A level (the target's cover from the use) or `{ ignore }` (cover the use ignores): one or the other
  setActionSchema("cover", { fields: [
    { path: "cover", label: "midi-qol.Entries.Field.cover", type: "select", options: ["none", "half", "threeQuarters", "total"] },
    { path: "cover.ignore", label: "midi-qol.Entries.Field.coverIgnore", type: "list" }], initial: "half" });
  setActionSchema("perception", { fields: [
    { path: "perception.invisible", label: "midi-qol.Entries.Field.invisible", type: "tristate" }], initial: {} });
  // Its rows (range, label, actions) are the editor's row cards
  setActionSchema("macro", { fields: [
    { path: "macro", label: "midi-qol.Entries.Field.macro", type: "select", options: { list: "macros" } }], initial: "ItemMacro" }, "midi-qol.Entries.Action.macro");
  setActionSchema("table", { fields: [
    { path: "table.id", label: "midi-qol.Entries.Field.tableId", type: "string" },
    { path: "table.formula", label: "midi-qol.Entries.Field.formula", type: "formula" },
    { path: "table.table", label: "midi-qol.Entries.Field.tableUuid", type: "string" }], initial: { id: "table", formula: "1d20", rows: [] } });
  setActionSchema("count", { fields: [
    { path: "count", label: "midi-qol.Entries.Field.countKind", type: "select", options: ["saves", "fails"] },
    { path: "max", label: "midi-qol.Entries.Field.countMax", type: "number" },
    { path: "mode", label: "midi-qol.Entries.Field.countMode", type: "select", options: ["remove"] },
    { path: "effect", label: "midi-qol.Entries.Field.countEffect", type: "string" },
    { path: "reset", label: "midi-qol.Entries.Field.countReset", type: "number" },
    { path: "only", label: "midi-qol.Entries.Field.countOnly", type: "select", options: ["reset"] }], initial: "saves" });
  setActionSchema("state", { fields: [{ path: "state", label: "midi-qol.Entries.Field.state", type: "pairs", numeric: true }], initial: {} });
  setActionSchema("change", { fields: [
    { path: "change.activation", label: "midi-qol.Entries.Field.activation", type: "select", options: { list: "activationTypes" } },
    { path: "change.range", label: "midi-qol.Entries.Field.range", type: "formula", numeric: true },
    { path: "change.duration", label: "midi-qol.Entries.Field.duration", type: "formula", numeric: true },
    { path: "change.components", label: "midi-qol.Entries.Field.components", type: "list" },
    { path: "change.school", label: "midi-qol.Entries.Field.school", type: "select", options: { list: "spellSchools" } },
    { path: "change.spellLevel", label: "midi-qol.Entries.Field.spellLevel", type: "formula" },
    { path: "change.damageType.from", label: "midi-qol.Entries.Field.damageTypeFrom", type: "multiselect", options: { list: "damageTypes" } },
    { path: "change.damageType.to", label: "midi-qol.Entries.Field.damageTypeTo", type: "select", options: { list: "damageTypes" } },
    { path: "change.damageDie", label: "midi-qol.Entries.Field.damageDie", type: "number" }], initial: {} });
}
