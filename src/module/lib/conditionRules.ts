import { i18n, MODULE_ID } from "../../midi-qol.js";
import { checkRule } from "../settings.js";

// Apply condition rules (optional rule conditionRules): the parts of each condition dnd5e doesn't apply itself.
// dnd5e applies speed, petrified's resistances, restrained's Dexterity saves, poisoned's checks, exhaustion and the
// initiative rules. Changes are added to a condition effect as it is created, so a status set by hand works too.

type ConditionChange = { key: string, type: string, value: string };

const WITHIN_5_FEET = "getDistance(workflow.rangeDetails?.attackingToken ?? workflow.token, workflow.targets.tokens[0]) <= 5";
const BEYOND_5_FEET = "getDistance(workflow.rangeDetails?.attackingToken ?? workflow.token, workflow.targets.tokens[0]) > 5";

const flag = (key: string, value = "true"): ConditionChange => ({ key: `flags.midi-qol.${key}`, type: "custom", value });
const attackDisadvantage: ConditionChange = { key: "system.rolls.attack.mode", type: "add", value: "-1" };
const checkDisadvantage: ConditionChange = { key: "system.rolls.ability.check.mode", type: "add", value: "-1" };
const failStrDexSaves: ConditionChange[] = ["str", "dex"].map(id => ({ key: `system.abilities.${id}.save.roll.fail`, type: "override", value: "true" }));
const grantsAdvantage = flag("grants.advantage.attack.all");
const critWithin5Feet = flag("grants.critical.range", "5");

function conditionChanges(status: string): ConditionChange[] {
  switch (status) {
    case "blinded":
      // Covered by the can't-see rules unless they are off
      if (checkRule("invisAdvantage") && checkRule("invisAdvantage") !== "none") return [];
      return [attackDisadvantage, grantsAdvantage];
    case "frightened":
      return [attackDisadvantage, checkDisadvantage];
    case "paralyzed":
    case "unconscious":
    case "dead":
      return [...failStrDexSaves, grantsAdvantage, critWithin5Feet];
    case "petrified":
    case "stunned":
      return [...failStrDexSaves, grantsAdvantage];
    case "prone":
      return [attackDisadvantage, flag("grants.advantage.attack.all", WITHIN_5_FEET), flag("grants.disadvantage.attack.all", BEYOND_5_FEET)];
    case "restrained":
      return [attackDisadvantage, grantsAdvantage];
    case "silenced":
      return [flag("fail.spell.vocal")];
    default:
      return [];
  }
}

function addConditionChanges(effect: ActiveEffect.Implementation, data: ActiveEffect.CreateData, options: object, userId: string) {
  if (userId !== game.user?.id || !checkRule("conditionRules")) return;
  // @ts-expect-error fvtt-types v14 ActiveEffect
  if (effect.type !== "condition" || !(effect.parent instanceof Actor) || effect.flags?.["midi-qol"]?.conditionRules) return;
  const changes = [...effect.statuses].flatMap(conditionChanges);
  if (!changes.length) return;
  // @ts-expect-error fvtt-types v14 ActiveEffect
  effect.updateSource({ "system.changes": [...effect._source.system.changes, ...changes], "flags.midi-qol.conditionRules": true });
}

// dnd5e lists attack disadvantage among its condition effects (poisoned, 2014 exhaustion 3, heavily encumbered) but
// only sets the check and save modes from them. Done after its ability preparation, as it does for those.
function prepareAbilities(this: { parent: unknown, abilities?: Record<string, unknown> }, wrapped: (...args: unknown[]) => unknown, ...args: unknown[]) {
  const result = wrapped(...args);
  if (!checkRule("conditionRules")) return result;
  const actor = this.parent;
  if (!(actor instanceof Actor)) return result;
  // @ts-expect-error no dnd5e-types
  const all = actor.hasConditionEffect("attackDisadvantage");
  // @ts-expect-error no dnd5e-types
  if (!all && !actor.hasConditionEffect("physicalAttackDisadvantage")) return result;
  for (const id of Object.keys(this.abilities ?? {})) {
    // @ts-expect-error no dnd5e-types
    if (all || CONFIG.DND5E.abilities[id]?.type === "physical")
      // @ts-expect-error no dnd5e-types
      dnd5e.dataModels.fields.AdvantageModeField.setMode(this, `abilities.${id}.attack.roll.mode`, -1);
  }
  return result;
}

const MODE_CONDITION_EFFECTS: Record<"attack" | "check" | "save", { key: string, mode: 1 | -1, abilities?: (id: string) => boolean }[]> = {
  attack: [
    { key: "attackDisadvantage", mode: -1 },
    { key: "physicalAttackDisadvantage", mode: -1, abilities: isPhysical }
  ],
  check: [
    { key: "abilityCheckDisadvantage", mode: -1 },
    { key: "physicalCheckDisadvantage", mode: -1, abilities: isPhysical }
  ],
  save: [
    { key: "abilitySaveDisadvantage", mode: -1 },
    { key: "physicalSaveDisadvantage", mode: -1, abilities: isPhysical },
    { key: "dexteritySaveDisadvantage", mode: -1, abilities: id => id === "dex" },
    { key: "dexteritySaveAdvantage", mode: 1, abilities: id => id === "dex" }
  ]
};

function isPhysical(id: string): boolean {
  // @ts-expect-error no dnd5e-types
  return CONFIG.DND5E.abilities[id]?.type === "physical";
}

/**
 * The conditions that set an ability roll mode field through dnd5e's condition effects (as `hasConditionEffect`), for
 * naming them in the advantage attribution, e.g. abilities.str.attack.roll.mode → [{ mode: -1, name: "Poisoned" }].
 */
export function conditionModeSources(actor: Actor.Implementation, field: string): { mode: 1 | -1, name: string }[] {
  const match = field.match(/^abilities\.(\w+)\.(attack|check|save)\.roll\.mode$/);
  if (!match) return [];
  const [, id, rollType] = match;
  if (rollType === "attack" && !checkRule("conditionRules")) return [];
  // @ts-expect-error no dnd5e-types
  const conditions: Record<string, number> = actor.system.conditions ?? {};
  // @ts-expect-error no dnd5e-types
  const immunities: Set<string> = actor.system.traits?.ci?.value ?? new Set();
  const sources: { mode: 1 | -1, name: string }[] = [];
  for (const entry of MODE_CONDITION_EFFECTS[rollType as "attack" | "check" | "save"]) {
    if (entry.abilities && !entry.abilities(id)) continue;
    // @ts-expect-error no dnd5e-types
    for (const prop of (CONFIG.DND5E.conditionEffects[entry.key] ?? []) as Set<string>) {
      const [status, level] = prop.split("-");
      if (immunities.has(status) || !actor.statuses.has(status)) continue;
      if (level && (conditions[status] ?? 0) < Number(level)) continue;
      // @ts-expect-error no dnd5e-types
      const name = i18n(CONFIG.DND5E.conditionTypes[status]?.name ?? CONFIG.statusEffects.find(se => se.id === status)?.name ?? status);
      sources.push({ mode: entry.mode, name: level ? `${name} (${level})` : name });
    }
  }
  return sources;
}

export function initConditionRules() {
  Hooks.on("preCreateActiveEffect", addConditionChanges);
  globalThis.libWrapper.register(MODULE_ID, "dnd5e.dataModels.actor.CommonTemplate.prototype.prepareAbilities", prepareAbilities, "WRAPPER");
}
