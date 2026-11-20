import { GameSystemConfig, i18n, i18nFormat } from "../../midi-qol.js";
import type { AttributionEntry } from "../Workflow.js";

/*
 * M16 (the "why"): each part of a roll's total, named. dnd5e builds a d20 roll from named parts (`@mod`, `@prof`,
 * `@bonus`, `@weaponMagic`, `@ruleBonus`...) and a damage roll from its formulas; the names are lost once the roll is
 * built. `bonusEntries` turns them into attribution entries of type BONUS (the roll's existing `options.attributions`
 * list, no new field), splitting the roll fields' bonus into the sheet's value, each effect change dnd5e applied and
 * each rule. Found at roll time: a formula a macro changed without an effect is shown unnamed (Other).
 */

type Parts = { parts?: string[], data?: Record<string, unknown> };

/** Which roll fields and rule category dnd5e combined the roll's `ruleBonus` from */
export interface RollFieldSpec { fieldPaths: string[], category?: string }

interface AppliedChange { key: string, value: unknown, applied?: boolean | null }

const bonus = (source: string, displayName: string, value: unknown): AttributionEntry =>
  ({ type: "BONUS", source, displayName, value: String(value) });

const PART_KEY = /^@([\w.]+)(?:\[[^\]]*\])?$/;

const meaningful = (value: unknown) => value !== undefined && value !== null && value !== "" && !/^[+\s]*0*$/.test(String(value));

/** The sheet's own bonus and each effect change applied to the roll fields' `.bonus` */
function fieldBonusEntries(actor: Actor.Implementation, fieldPaths: string[]): AttributionEntry[] {
  const entries: AttributionEntry[] = [];
  for (const path of fieldPaths) {
    // @ts-expect-error no dnd5e-types
    const own = foundry.utils.getProperty(actor.system._source, `${path}.bonus`);
    if (meaningful(own)) entries.push(bonus(`${path}:actor`, i18n("midi-qol.Why.ActorBonus"), own));
    for (const effect of actor.appliedEffects) {
      // @ts-expect-error fvtt-types v14 ActiveEffect
      for (const change of effect.system.changes as AppliedChange[]) {
        if (change.key !== `system.${path}.bonus` || !change.applied || !meaningful(change.value)) continue;
        entries.push(bonus(`${path}:${effect.id}`, effect.name, change.value));
      }
    }
  }
  return entries;
}

/** dnd5e 6.1's rules adding to the roll (`<category>:bonus`) */
function ruleBonusEntries(actor: Actor.Implementation, item: Item.Implementation | undefined, category: string, rollData: unknown): AttributionEntry[] {
  try {
    // @ts-expect-error no dnd5e-types
    const rules: Iterable<{ value?: unknown, effect?: { name: string } }> = dnd5e.documents.AppliedRules
      .collect(`${category}:bonus`, actor, item).filterWith(rollData);
    return [...rules].filter(rule => meaningful(rule.value))
      .map(rule => bonus(`rule:${rule.effect?.name ?? ""}`, rule.effect?.name ?? i18n("midi-qol.Why.Rule"), rule.value));
  } catch {
    return [];
  }
}

function statusName(id: string): string {
  return CONFIG.statusEffects.find(status => status.id === id)?.name ?? id;
}

/** A d20 roll's parts (attack, save, check), named */
export function d20BonusEntries(actor: Actor.Implementation, item: Item.Implementation | undefined, roll: Parts,
  spec: RollFieldSpec & { ability?: string, ammunition?: Item.Implementation }): AttributionEntry[] {
  const data = roll.data ?? {};
  const entries: AttributionEntry[] = [];
  for (const part of roll.parts ?? []) {
    // dnd5e 6.1 labels its parts as flavour: @mod[Strength]
    const key = PART_KEY.exec(part)?.[1];
    const value = key ? foundry.utils.getProperty(data, key) : part;
    if (!meaningful(value)) continue;
    switch (key) {
      case "mod":
        entries.push(bonus("mod", GameSystemConfig.abilities[spec.ability ?? ""]?.label ?? i18n("midi-qol.Why.Ability"), value));
        break;
      case "prof":
        entries.push(bonus("prof", i18n("DND5E.Proficiency"), value));
        break;
      case "bonus":
      case "extraBonus":
        entries.push(bonus(key, item?.name ?? i18n("DND5E.Bonus"), value));
        break;
      case "weaponMagic":
        entries.push(bonus(key, i18nFormat("midi-qol.Why.Magic", { name: item?.name ?? "" }), value));
        break;
      case "ammoMagic":
        entries.push(bonus(key, i18nFormat("midi-qol.Why.Magic", { name: spec.ammunition?.name ?? "" }), value));
        break;
      case "ruleBonus": {
        const named = [...fieldBonusEntries(actor, spec.fieldPaths),
          ...(spec.category ? ruleBonusEntries(actor, item, spec.category, data) : [])];
        entries.push(...(named.length ? named : [bonus(key, i18n("DND5E.Bonus"), value)]));
        break;
      }
      case "situational":
        entries.push(bonus(key, i18n("midi-qol.Why.Situational"), value));
        break;
      case "cover":
        entries.push(bonus(key, i18n("DND5E.Cover"), value));
        break;
      default:
        if (key?.startsWith("reductions.")) entries.push(bonus(key, statusName(key.slice("reductions.".length)), value));
        else entries.push(bonus(key ?? `part:${part}`, i18n("midi-qol.Why.Other"), value));
    }
  }
  return entries;
}

/** A damage roll's parts, named: the activity's formula, the actor's and the item's damage bonus, the rules */
export function damageBonusEntries(actor: Actor.Implementation | undefined, item: Item.Implementation | undefined, roll: Parts,
  actionType: string | undefined, label: string): AttributionEntry[] {
  const data = roll.data ?? {};
  const actorBonusPath = actionType ? `rolls.damage.${actionType}` : undefined;
  const actorBonus = actor && actorBonusPath ? foundry.utils.getProperty(actor.system, `${actorBonusPath}.bonus`) : undefined;
  // @ts-expect-error no dnd5e-types
  const itemBonus = item?.system.damage?.bonus;
  const entries: AttributionEntry[] = [];
  (roll.parts ?? []).forEach((part, index) => {
    const key = PART_KEY.exec(part)?.[1];
    if (key === "mod") {
      if (meaningful(data.mod)) entries.push(bonus("mod", i18n("midi-qol.Why.Ability"), data.mod));
    } else if (key === "ruleBonus") {
      if (meaningful(data.ruleBonus)) entries.push(bonus("ruleBonus", i18n("midi-qol.Why.Rule"), data.ruleBonus));
    } else if (actor && actorBonusPath && meaningful(actorBonus) && part === actorBonus) {
      const named = fieldBonusEntries(actor, [actorBonusPath]);
      entries.push(...(named.length ? named : [bonus(actorBonusPath, i18n("midi-qol.Why.ActorBonus"), part)]));
    } else if (meaningful(itemBonus) && part === String(itemBonus)) {
      entries.push(bonus("itemBonus", item?.name ?? i18n("DND5E.Bonus"), part));
    } else if (meaningful(part)) {
      entries.push(bonus(index === 0 ? "damage" : `part:${index}`, index === 0 ? label : i18n("midi-qol.Why.Other"), part));
    }
  });
  return entries;
}

/** Add entries to a roll's attributions, replacing any of the same type and source */
export function addRollEntries(roll: Roll, entries: AttributionEntry[]): void {
  if (!entries.length) return;
  const stored = foundry.utils.getProperty(roll, "options.attributions");
  const existing: AttributionEntry[] = Array.isArray(stored) ? stored : [];
  const keyOf = (entry: AttributionEntry) => `${entry.type}:${entry.source}`;
  const replaced = new Set(entries.map(keyOf));
  foundry.utils.setProperty(roll, "options.attributions", [...existing.filter(entry => !replaced.has(keyOf(entry))), ...entries]);
}

function activityOf(subject: unknown): { actor?: Actor.Implementation, item?: Item.Implementation, getActionType?: (mode?: string) => string, name?: string } | undefined {
  return subject && typeof subject === "object" && "item" in subject ? subject as ReturnType<typeof activityOf> : undefined;
}

/** Name each part of attack, save and damage rolls as dnd5e builds them */
export function registerRollPartNaming() {
  Hooks.on("dnd5e.postAttackRollConfiguration", (rolls, config) => {
    const activity = activityOf(config.subject);
    const actor = activity?.actor;
    if (!actor) return;
    const actionType = activity.getActionType?.(config.attackMode) ?? "";
    rolls.forEach((roll, index) => {
      const built = config.rolls?.[index];
      const ability = (built?.data?.roll as { ability?: string } | undefined)?.ability ?? config.ability;
      addRollEntries(roll, d20BonusEntries(actor, activity.item, built ?? {}, {
        ability, ammunition: config.ammunition,
        fieldPaths: [`abilities.${ability}.attack.roll`, "rolls.attack", `rolls.attack.${actionType}`], category: "attack"
      }));
    });
  });
  Hooks.on("dnd5e.postSavingThrowRollConfiguration", (rolls, config) => {
    const actor = config.subject;
    if (!(actor instanceof Actor)) return;
    const concentration = !!config.hookNames?.includes("concentration");
    rolls.forEach((roll, index) => addRollEntries(roll, d20BonusEntries(actor, undefined, config.rolls?.[index] ?? {}, {
      ability: config.ability,
      fieldPaths: concentration ? ["attributes.concentration.roll"] : [`abilities.${config.ability}.save.roll`, "rolls.ability.save"],
      category: concentration ? undefined : "save"
    })));
  });
  Hooks.on("dnd5e.postDamageRollConfiguration", (rolls, config) => {
    const activity = activityOf(config.subject);
    const actionType = activity?.getActionType?.(config.attackMode);
    const label = activity?.item?.name ?? activity?.name ?? i18n("midi-qol.Why.Damage");
    rolls.forEach((roll, index) => addRollEntries(roll,
      damageBonusEntries(activity?.actor, activity?.item, config.rolls?.[index] ?? {}, actionType, label)));
  });
}
