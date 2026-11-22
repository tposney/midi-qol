import type { EffectPresetDef } from "./editorServices.js";

/*
 * midi's common effects for the sentence view's "+ effect": the changes dnd5e 6 reads (movement multiplier and bonus,
 * the roll groups' bonus and advantage mode, damage traits), midi's flags only where dnd5e has none (attacks against
 * the creature with advantage or disadvantage).
 */

const DAMAGE_ROLLS = ["mwak", "rwak", "msak", "rsak"];

export const MIDI_EFFECT_PRESETS: readonly EffectPresetDef[] = [
  { id: "speedHalved", label: "midi-qol.EffectPreset.speedHalved", group: "movement", changes: () => [{ key: "system.attributes.movement.multiplier", type: "multiply", value: "0.5" }] },
  { id: "speedZero", label: "midi-qol.EffectPreset.speedZero", group: "movement", changes: () => [{ key: "system.attributes.movement.multiplier", type: "multiply", value: "0" }] },
  { id: "speedBonus", label: "midi-qol.EffectPreset.speedBonus", group: "movement", param: { label: "midi-qol.EffectPreset.feet", type: "number", default: "10" },
    changes: v => [{ key: "system.attributes.movement.bonus", type: "add", value: v }] },
  { id: "acBonus", label: "midi-qol.EffectPreset.acBonus", group: "defence", param: { label: "midi-qol.EffectPreset.amount", type: "formula", default: "2" },
    changes: v => [{ key: "system.attributes.ac.bonus", type: "add", value: signed(v) }] },
  { id: "resistance", label: "midi-qol.EffectPreset.resistance", group: "defence", param: { label: "DND5E.DamageType", type: "select", list: "damageTypes", default: "fire" },
    changes: v => [{ key: "system.traits.dr.value", type: "add", value: v }] },
  { id: "immunity", label: "midi-qol.EffectPreset.immunity", group: "defence", param: { label: "DND5E.DamageType", type: "select", list: "damageTypes", default: "fire" },
    changes: v => [{ key: "system.traits.di.value", type: "add", value: v }] },
  { id: "vulnerability", label: "midi-qol.EffectPreset.vulnerability", group: "defence", param: { label: "DND5E.DamageType", type: "select", list: "damageTypes", default: "fire" },
    changes: v => [{ key: "system.traits.dv.value", type: "add", value: v }] },
  { id: "conditionImmunity", label: "midi-qol.EffectPreset.conditionImmunity", group: "defence", param: { label: "midi-qol.EffectPreset.condition", type: "select", list: "conditions", default: "frightened" },
    changes: v => [{ key: "system.traits.ci.value", type: "add", value: v }] },
  { id: "attacksAgainstAdvantage", label: "midi-qol.EffectPreset.attacksAgainstAdvantage", group: "defence",
    changes: () => [{ key: "flags.midi-qol.grants.advantage.attack.all", type: "custom", value: "1" }] },
  { id: "attacksAgainstDisadvantage", label: "midi-qol.EffectPreset.attacksAgainstDisadvantage", group: "defence",
    changes: () => [{ key: "flags.midi-qol.grants.disadvantage.attack.all", type: "custom", value: "1" }] },
  { id: "attackAdvantage", label: "midi-qol.EffectPreset.attackAdvantage", group: "rolls", changes: () => [{ key: "system.rolls.attack.mode", type: "add", value: "1" }] },
  { id: "attackDisadvantage", label: "midi-qol.EffectPreset.attackDisadvantage", group: "rolls", changes: () => [{ key: "system.rolls.attack.mode", type: "add", value: "-1" }] },
  { id: "saveAdvantage", label: "midi-qol.EffectPreset.saveAdvantage", group: "rolls", changes: () => [{ key: "system.rolls.ability.save.mode", type: "add", value: "1" }] },
  { id: "saveDisadvantage", label: "midi-qol.EffectPreset.saveDisadvantage", group: "rolls", changes: () => [{ key: "system.rolls.ability.save.mode", type: "add", value: "-1" }] },
  { id: "checkAdvantage", label: "midi-qol.EffectPreset.checkAdvantage", group: "rolls", changes: () => [{ key: "system.rolls.ability.check.mode", type: "add", value: "1" }] },
  { id: "checkDisadvantage", label: "midi-qol.EffectPreset.checkDisadvantage", group: "rolls", changes: () => [{ key: "system.rolls.ability.check.mode", type: "add", value: "-1" }] },
  { id: "attackBonus", label: "midi-qol.EffectPreset.attackBonus", group: "rolls", param: { label: "midi-qol.EffectPreset.amount", type: "formula", default: "1d4" },
    changes: v => [{ key: "system.rolls.attack.bonus", type: "add", value: signed(v) }] },
  { id: "damageBonus", label: "midi-qol.EffectPreset.damageBonus", group: "rolls", param: { label: "midi-qol.EffectPreset.amount", type: "formula", default: "1d4" },
    changes: v => DAMAGE_ROLLS.map(r => ({ key: `system.rolls.damage.${r}.bonus`, type: "add", value: signed(v) })) },
  { id: "saveBonus", label: "midi-qol.EffectPreset.saveBonus", group: "rolls", param: { label: "midi-qol.EffectPreset.amount", type: "formula", default: "1d4" },
    changes: v => [{ key: "system.rolls.ability.save.bonus", type: "add", value: signed(v) }] },
  { id: "checkBonus", label: "midi-qol.EffectPreset.checkBonus", group: "rolls", param: { label: "midi-qol.EffectPreset.amount", type: "formula", default: "1d4" },
    changes: v => [{ key: "system.rolls.ability.check.bonus", type: "add", value: signed(v) }] }
];

/** A bonus as dnd5e writes one ("2" -> "+2", "-1d4" kept) */
export function signed(value: string): string {
  const v = String(value ?? "").trim();
  return !v ? "+0" : /^[+-]/.test(v) ? v : `+${v}`;
}
