import { GameSystemConfig, MODULE_ID, i18n } from "../../midi-qol.js";

/*
 * What makes up a roll's total (M16, the "why"). One rule: every term carries its label as its flavour, and a term that
 * combines several sources (dnd5e's `@ruleBonus`, the actor's damage bonus) has them named in the roll's
 * `options.midi-qol.rollBonusSources`: each effect change, the sheet's own value and dnd5e's rules. Labelled when dnd5e
 * builds the roll (postBuild…RollConfig), so a rebuilt roll (the dialog) is labelled again. A part a module pushes
 * into the config unlabelled stays unnamed ("Bonus"): label it with flavour (`1d4[Bless]`), or use an effect or a
 * rollBonuses contributor, both named for you. Damage terms' flavour is their damage type, so damage gets only the
 * sources.
 */

export interface BonusSource { label: string, value?: string, img?: string }

/** The label of dnd5e's combined roll bonus term (its `@ruleBonus` part), which the bonus sources break down */
export function rollBonusLabel(): string {
  return i18n("midi-qol.AttackTerm.RollBonus");
}

/**
 * dnd5e's d20 roll parts (`@mod`, `@prof`, `@bonus`, …) with a label in brackets, which each evaluated term keeps as
 * its flavor. Parts that aren't one of these references are left as they are.
 */
export function labelD20Parts(parts: string[], ability: string | undefined): string[] {
  const labels: Record<string, string | undefined> = {
    mod: ability ? GameSystemConfig.abilities[ability]?.label : undefined,
    prof: i18n("DND5E.Proficiency"),
    bonus: i18n("DND5E.BonusAttack"),
    extraBonus: i18n("midi-qol.AttackTerm.Bonus"),
    weaponMagic: i18n("DND5E.MagicalBonus"),
    ammoMagic: i18n("DND5E.ConsumeAmmunition"),
    ruleBonus: rollBonusLabel(),
    situational: i18n("midi-qol.AttackTerm.Situational"),
    cover: i18n("DND5E.Cover")
  };
  return parts.map(part => {
    const key = /^@([\w.]+)$/.exec(part)?.[1];
    if (!key) return part;
    const label = key.startsWith("reductions.") ? i18n("DND5E.Exhaustion") : labels[key];
    return label ? `${part}[${label.replace(/[[\]]/g, "")}]` : part;
  });
}

/**
 * The sources behind a combined bonus: each active effect's change to one of `keys` (its own value resolved against
 * the actor's data; an override or custom change without one), the sheet's own value at `fieldPaths` (`<path>.bonus`),
 * and dnd5e's rules for `category` (`<category>:bonus`).
 */
export function bonusSources(actor: Actor.Implementation | undefined | null, keys: string[],
  { fieldPaths = [], category, item }: { fieldPaths?: string[], category?: string, item?: Item.Implementation } = {}): BonusSource[] {
  if (!actor) return [];
  const wanted = new Set(keys);
  const rollData = actor.getRollData();
  const resolve = (value: unknown) => Roll.replaceFormulaData(`${value}`.trim(), rollData).replace(/^\+\s*/, "");
  const signed = (value: string) => value.startsWith("-") ? value : `+${value}`;
  const sources: BonusSource[] = [];
  for (const effect of actor.allApplicableEffects()) {
    if (!effect.active) continue;
    // @ts-expect-error fvtt-types v14 ActiveEffect
    for (const change of (effect.system.changes ?? []) as { key: string, type: string, value: unknown }[]) {
      if (!wanted.has(change.key)) continue;
      if (change.type !== "add") sources.push({ label: effect.name, img: effect.img ?? undefined });
      else sources.push({ label: effect.name, value: signed(resolve(change.value)), img: effect.img ?? undefined });
    }
  }
  for (const path of fieldPaths) {
    // @ts-expect-error no dnd5e-types
    const own = foundry.utils.getProperty(actor.system._source, `${path}.bonus`);
    if (own !== undefined && own !== null && `${own}`.trim() && !/^[+\s]*0+$/.test(`${own}`))
      sources.push({ label: i18n("midi-qol.Why.ActorBonus"), value: signed(resolve(own)) });
  }
  if (category) {
    try {
      // @ts-expect-error no dnd5e-types
      const rules: Iterable<{ value?: unknown, effect?: { name: string, img?: string } }> = dnd5e.documents.AppliedRules
        .collect(`${category}:bonus`, actor, item).filterWith(rollData);
      for (const rule of rules) {
        if (rule.value === undefined || rule.value === null || `${rule.value}` === "") continue;
        sources.push({ label: rule.effect?.name ?? i18n("midi-qol.Why.Rule"), value: signed(resolve(rule.value)), img: rule.effect?.img });
      }
    } catch { /* this dnd5e has no rules */ }
  }
  return sources;
}

/** The sources behind an attack's `@ruleBonus`: the attack roll fields for all attacks, the action type and the ability */
export function attackBonusSources(activity: { actor?: Actor.Implementation | null, item?: Item.Implementation | null } | undefined,
  ability: string | undefined, actionType: string | undefined): BonusSource[] {
  const fieldPaths = ["rolls.attack", ...(actionType ? [`rolls.attack.${actionType}`] : []), ...(ability ? [`abilities.${ability}.attack.roll`] : [])];
  return bonusSources(activity?.actor, [...fieldPaths.map(path => `system.${path}.bonus`), ...(actionType ? [`system.bonuses.${actionType}.attack`] : [])],
    { fieldPaths, category: "attack", item: activity?.item ?? undefined });
}

/** A change made to a roll after it was made (an optional or contributed bonus, a reroll): the bonuses and the total before */
export interface RollChange { labels: string[], before?: number }

/**
 * Record on `roll` that `labels` changed it from `before`, whether or not the change is displayed: a reroll or a
 * replacement leaves no term to label. Earlier changes (on `before`) are kept.
 */
export function recordRollChange(roll: Roll, before: Roll, labels: string[]): void {
  const path = `options.${MODULE_ID}.changes`;
  const earlier = foundry.utils.getProperty(before, path);
  const own = roll === before ? [] : foundry.utils.getProperty(roll, path);
  const changes: RollChange[] = [...(Array.isArray(earlier) ? earlier : []), ...(Array.isArray(own) && own !== earlier ? own : [])];
  changes.push({ labels: [...labels], before: before.total ?? undefined });
  foundry.utils.setProperty(roll, path, changes);
}

/** Put the sources on the roll being built (kept only when there are some) */
export function setBonusSources(rollConfig: { options?: object }, sources: BonusSource[]): void {
  if (sources.length) foundry.utils.setProperty(rollConfig, `options.${MODULE_ID}.rollBonusSources`, sources);
}

type ActivityLike = { actor?: Actor.Implementation | null, getActionType?: (mode?: string) => string, actionType?: string };

/** Saves and damage labelled as dnd5e builds them (attacks: rolls/attack.ts, per use) */
export function registerRollPartLabels() {
  Hooks.on("dnd5e.postBuildSavingThrowRollConfig", (process, rollConfig) => {
    const actor = process?.subject;
    if (!(actor instanceof Actor)) return;
    const ability = process.ability;
    rollConfig.parts = labelD20Parts(rollConfig.parts ?? [], ability);
    const concentration = !!process.hookNames?.includes("concentration");
    const fieldPaths = concentration ? ["attributes.concentration.roll"] : [`abilities.${ability}.save.roll`, "rolls.ability.save"];
    setBonusSources(rollConfig, bonusSources(actor, fieldPaths.map(path => `system.${path}.bonus`),
      { fieldPaths, category: concentration ? undefined : "save" }));
  });
  Hooks.on("dnd5e.postBuildDamageRollConfig", (process, rollConfig) => {
    const activity = process?.subject as unknown as ActivityLike | undefined;
    const actor = activity?.actor;
    if (!actor) return;
    const actionType = activity.getActionType?.(process.attackMode) ?? activity.actionType;
    if (!actionType) return;
    // dnd5e adds the actor's damage bonus to the first damage part only: its sources go where it was added
    const actorBonus = foundry.utils.getProperty(actor.system, `rolls.damage.${actionType}.bonus`);
    if (typeof actorBonus !== "string" || !actorBonus || !(rollConfig.parts ?? []).includes(actorBonus)) return;
    setBonusSources(rollConfig, bonusSources(actor, [`system.rolls.damage.${actionType}.bonus`, `system.bonuses.${actionType}.damage`],
      { fieldPaths: [`rolls.damage.${actionType}`] }));
  });
}
