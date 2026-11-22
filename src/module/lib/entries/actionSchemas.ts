import { setActionSchema, type ActionField } from "./engine.js";

/*
 * M32d: the entry editor's forms for midi's own actions (format spike, "The format"). Actions whose values are
 * strings or nested specs (save, check, use with targets, change, table, the OverTime conversions) are edited as JSON.
 */

const dnd5e = () => (CONFIG as unknown as { DND5E?: Record<string, Record<string, { label?: string }>> }).DND5E ?? {};
const typesOf = (key: "damageTypes" | "healingTypes") => () =>
  Object.entries(dnd5e()[key] ?? {}).map(([value, data]) => ({ value, label: game.i18n?.localize(data.label ?? value) ?? value }));

const ROLL_KINDS = { path: "rolls", label: "midi-qol.Entries.Field.rolls", type: "list" as const };
const TO = (options: string[]): ActionField => ({ path: "to", label: "midi-qol.Entries.Field.to", type: "select", options: ["", ...options] });
const LABEL: ActionField = { path: "label", label: "midi-qol.Entries.Field.label", type: "string" };

export function registerMidiActionSchemas() {
  setActionSchema("damage", { fields: [
    { path: "damage", label: "midi-qol.Entries.Field.formula", type: "formula" },
    { path: "type", label: "DND5E.DamageType", type: "select", options: typesOf("damageTypes") },
    TO(["target", "self", "event.creature"]), LABEL] });
  setActionSchema("heal", { fields: [
    { path: "heal", label: "midi-qol.Entries.Field.formula", type: "formula" },
    { path: "type", label: "midi-qol.Entries.Field.healingType", type: "select", options: typesOf("healingTypes") },
    TO(["target", "self", "event.creature"]), LABEL] });
  setActionSchema("bonus", { fields: [
    { path: "bonus.kind", label: "midi-qol.Entries.Field.kind", type: "select", options: ["add", "reroll", "mode", "replace", "outcome"] },
    { path: "bonus.formula", label: "midi-qol.Entries.Field.formula", type: "formula" },
    { path: "bonus.mode", label: "midi-qol.Entries.Field.mode", type: "select", options: ["", "advantage", "disadvantage"] },
    { path: "bonus.keep", label: "midi-qol.Entries.Field.keep", type: "select", options: ["", "new", "higher", "lower"] },
    ROLL_KINDS, LABEL] });
  setActionSchema("modifier", { fields: [
    { path: "modifier", label: "midi-qol.Entries.Field.modifier", type: "select",
      options: ["advantage", "disadvantage", "noAdvantage", "noDisadvantage", "critical", "noCritical", "fumble", "noFumble", "success", "fail", "min", "max"] },
    { path: "value", label: "midi-qol.Entries.Field.value", type: "number" },
    ROLL_KINDS, { path: "for", label: "midi-qol.Entries.Field.for", type: "string" }, LABEL] });
  setActionSchema("damageChange", { fields: [
    { path: "damageChange.stage", label: "midi-qol.Entries.Field.stage", type: "select", options: ["bonus", "flatReduction", "percentReduction", "complete"] },
    { path: "damageChange.amount", label: "midi-qol.Entries.Field.amount", type: "formula" },
    { path: "damageChange.multiplier", label: "midi-qol.Entries.Field.multiplier", type: "number" },
    { path: "damageChange.types", label: "midi-qol.Entries.Field.types", type: "list" },
    { path: "for", label: "midi-qol.Entries.Field.for", type: "string" }, LABEL] });
  setActionSchema("effect", { fields: [
    { path: "effect", label: "midi-qol.Entries.Field.effectMode", type: "select", options: ["apply", "remove"] },
    { path: "what", label: "midi-qol.Entries.Field.what", type: "string" },
    TO(["self", "target", "event.creature", "origin", "anyone"])] });
  setActionSchema("end", { fields: [{ path: "end", label: "midi-qol.Entries.Field.end", type: "boolean" }] });
  setActionSchema("abort", { fields: [{ path: "abort", label: "midi-qol.Entries.Field.reason", type: "string" }] });
  setActionSchema("retarget", { fields: [
    { path: "retarget.to", label: "midi-qol.Entries.Field.to", type: "select", options: ["self", "bearer", "choose", "none"] },
    { path: "retarget.orLose", label: "midi-qol.Entries.Field.orLose", type: "boolean" }, LABEL] });
  setActionSchema("transfer", { fields: [
    { path: "transfer.to", label: "midi-qol.Entries.Field.to", type: "select", options: ["origin", "bearer", "pool"] },
    { path: "transfer.amount", label: "midi-qol.Entries.Field.amount", type: "string" },
    { path: "transfer.keep", label: "midi-qol.Entries.Field.keep", type: "boolean" },
    { path: "transfer.type", label: "DND5E.DamageType", type: "string" }, LABEL] });
  setActionSchema("cover", { fields: [{ path: "cover", label: "midi-qol.Entries.Field.cover", type: "select", options: ["none", "half", "threeQuarters", "total"] }] });
}
