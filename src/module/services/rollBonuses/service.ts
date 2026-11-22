import type { Activity } from "../../../globals.js";
import { defineService, entries, reportServiceProblem } from "../../api/services.js";
import type { Workflow } from "../../Workflow.js";
import { addRollToAsync, setBonusActionUsed, setReactionUsed, setActionUsed, refreshRollTotal } from "../../utils.js";
import { safeGetGameSetting } from "../../settings.js";
import { approveBonus } from "./approval.js";
import { reveals } from "../revealPolicy/service.js";
import { bonusDamageTypeKey, rememberChoice, rememberCheckbox, rememberedChoice } from "../../lib/rememberedChoices.js";
import { standingKey } from "./standing.js";
import { addCanMatter, canAfford, type BonusCost, type BonusEffect, type BonusPhase, type BonusRollKind, type Outcome } from "./rules.js";

/*
 * rollBonuses (contributors): optional (or automatic) bonuses a module offers on a roll, in phases (design:
 * ~/Documents/midi-next-rollBonuses-design-2026-11-18.md). Stage 2: attack and damage rolls, shown in midi's bonus
 * dialog next to the flags.midi-qol.optional bonuses; flags keep their own path until they become a contributor.
 *
 *   MidiQOL.services.register("rollBonuses", "my-module.bless", {
 *     kinds: ["attack"],
 *     for: q => [{ id: "bless", label: "Bless", phases: ["preResult"], effect: { kind: "add", formula: "1d4" }, optional: false }]
 *   });
 */

export type { BonusCost, BonusEffect, BonusPhase, BonusRollKind, Outcome } from "./rules.js";

export interface RollBonusQuery {
  kind: BonusRollKind;
  actor: Actor.Implementation;
  token?: TokenDocument.Implementation;
  /** Attack: the target (single target only). */
  target?: TokenDocument.Implementation;
  workflow?: Workflow;
  activity?: Activity;
  item?: Item.Implementation;
  /** mwak, rsak, save, heal... */
  actionType?: string;
  /** Saves and checks: the ability; skills: the skill (when the roll names one). */
  ability?: string;
  skill?: string;
  tool?: string;
  /** Contract 4 (13a point 6): dnd5e's roll process, dialog and message config of the roll (live: read, don't keep) */
  rollConfig?: { config: object, dialog: object, message: object };
}

export interface BonusContext {
  query: RollBonusQuery;
  phase: BonusPhase;
  roll: Roll;
  outcome?: Outcome;
  /** Contract 4: what was chosen in the prompt for this bonus (its scaling, inputs, damage type, targets) */
  selection?: BonusSelection;
}

/** Contract 4: an input shown with a bonus in the prompt */
export interface BonusInput {
  name: string;
  label: string;
  /** multi: several of its options (CAT's comboboxMulti), its value a list */
  type: "number" | "select" | "multi" | "checkbox" | "text";
  options?: readonly { value: string, label: string }[];
  default?: string | number | boolean | readonly string[];
  min?: number;
  max?: number;
}

/** Contract 4: what the player chose for a bonus in the prompt */
export interface BonusSelection {
  scaling?: number;
  inputs: Record<string, string | number | boolean | readonly string[]>;
  damageType?: string;
  /** Token document uuids picked (targeting) */
  targets: string[];
}

/** Contract 4: configure's answer for a selection: the bonus as it now is */
export interface BonusConfigured {
  effect?: BonusEffect;
  cost?: BonusCost;
  /** The row's label (the formula as configured) */
  label?: string;
  /** Why it can't be taken with this selection */
  disabled?: string;
  /** How many creatures it may pick now (CAT's target scaling) */
  maxTargets?: number;
}

export interface BonusCandidate {
  /** Unique within the contributor; midi prefixes the contributor's id. */
  id: string;
  label: string;
  img?: string;
  phases: readonly BonusPhase[];
  effect: BonusEffect;
  /** False: applied without asking. */
  optional: boolean;
  priority?: number;
  /** Declared costs; a candidate whose cost does not fit what is available is not offered. midi spends them when chosen. */
  cost?: BonusCost;
  /** Its onChosen spends the cost itself (as CAT's bonuses do): midi only checks it. */
  spendsOwnCost?: boolean;
  /**
   * Damage only: the bonus is for these targets (token document uuids), not the whole roll. Its formula is rolled when
   * chosen and added to just those targets' damage (the damageModifiers bonus stage); the damage roll is unchanged.
   */
  targets?: readonly string[];
  /** Asked before the bonus is applied (a third party's consent); false or a throw: not applied. */
  approve?: (ctx: BonusContext) => boolean | Promise<boolean>;
  /** An actor whose player is asked (BONUS_APPROVAL_QUERY) before the bonus is applied. */
  approver?: string;
  /** Offered on a natural 1 (attack fumble). */
  onFumble?: boolean;
  /** True, or why it is not offered now. */
  validate?: (ctx: BonusContext) => true | string;
  /** After it was applied: its consumption and side effects. */
  onChosen?: (ctx: BonusContext & { roll: Roll }) => Promise<void> | void;
  /** Applies the bonus itself, in place of its effect (a macro value, a flag's own behaviour): returns the new roll. */
  apply?: (ctx: BonusContext, rollData: object) => Promise<Roll>;
  /** The prompt's icon for it (HTML), in place of the default die. */
  iconHTML?: string;
  /** Shown with it in the prompt (its tooltip) */
  description?: string;
  /**
   * postResult: on which result it is offered: "failure" (a miss, a failed save), "success" (a hit: a reaction to an
   * enemy's success) or "any". Absent: as before (the roll's after-result ask, which opens on a failure).
   */
  when?: "failure" | "success" | "any";
  /** Whose resources pay for it (an actor uuid), when not the roller's: a bonus spent by someone else */
  spender?: string;
  /** A damage add whose type is chosen when it is taken: the types offered (one: that type) */
  damageTypes?: readonly string[];
  /**
   * Damage: it reacts to the dice rolled, so it is offered after the damage roll (M15 5d). Without it a damage add is
   * chosen before the roll and becomes part of it (dnd5e doubles its dice on a critical, keeps its type).
   */
  needsRoll?: boolean;
  /** Contract 4: spent at a level from `min` (default 1) to `max`; the formula reads it as `@bonus.scaling` */
  scaling?: { max: number, min?: number, label?: string };
  /** Contract 4: inputs shown with it; the formula reads them as `@bonus.inputs.<name>` */
  inputs?: readonly BonusInput[];
  /**
   * Contract 4: the player picks up to `max` creatures: from `candidates` (token document uuids, such as the attack's
   * hit targets) when given, else those within `range` feet of the roller, by disposition to it
   */
  targeting?: { max: number, candidates?: readonly string[], range?: number, disposition?: "ally" | "enemy" | "any", self?: boolean };
  /** Contract 4: the bonus for a selection, asked as the player changes it (CAT's updateScaling and input formulas) */
  configure?: (selection: BonusSelection, ctx: BonusContext) => BonusConfigured | undefined | Promise<BonusConfigured | undefined>;
}

export interface RollBonusContributor {
  /** Roll kinds it may offer bonuses for (a cheap filter); all when omitted. */
  kinds?: readonly BonusRollKind[];
  for(query: RollBonusQuery): readonly BonusCandidate[] | undefined | Promise<readonly BonusCandidate[] | undefined>;
}

declare module "../../api/services.js" {
  interface MidiServices { rollBonuses: RollBonusContributor }
}

export let rollBonusesService: ReturnType<typeof defineService<RollBonusContributor>>;

/**
 * What rollBonuses reads from a candidate, by version: 1 the M1 fields; 2 (M15 stage 3a) chosen bonuses applied in
 * orderForApplication order, a damage `add` with its own damageType or critical as its own damage roll; 3 (stage 3d)
 * `apply`, `iconHTML`, `description`, `when`, `spender`, `damageTypes`; 4 (M32b) `scaling`, `inputs`, `targeting`,
 * `configure`, the selection on the context, a prompt provider's `ask` answering `{ id, selection }`.
 */
export const ROLL_BONUSES_CONTRACT = 4;

/** Whether a candidate is offered for this result after the roll (its `when`) */
export function offeredForResult(candidate: { when?: "failure" | "success" | "any" }, phase: BonusPhase, outcome: Outcome | undefined): boolean {
  if (phase !== "postResult" || !candidate.when || candidate.when === "any" || outcome?.success === undefined) return true;
  return candidate.when === "success" ? outcome.success : !outcome.success;
}

/**
 * Whether a candidate could change the roll's success against its target (the roll's AC or DC): adds only (a reroll,
 * a replacement or advantage may always matter), not damage; an attack's natural 20 or 1 fixes the result.
 */
async function couldMatter(candidate: BonusCandidate, query: RollBonusQuery, roll: Roll, outcome: Outcome | undefined): Promise<boolean> {
  if (candidate.effect.kind !== "add" || query.kind === "damage" || candidate.apply) return true;
  const target = Number((roll.options as { target?: unknown }).target);
  if (!Number.isFinite(target) || typeof roll.total !== "number") return true;
  if (query.kind === "attack" && (outcome?.isCritical || outcome?.isFumble)) return false;
  try {
    const data = { ...(query.activity ?? query.item ?? query.actor)?.getRollData?.() ?? {}, ...roll.data };
    const formula = Roll.replaceFormulaData(candidate.effect.formula, data, { missing: "0" });
    const max = (await new Roll(formula).evaluate({ maximize: true })).total ?? 0;
    const min = (await new Roll(formula).evaluate({ minimize: true })).total ?? 0;
    return addCanMatter(roll.total, target, min, max);
  } catch {
    return true;
  }
}

/** Whether this user sees what decides the roll's result (an attack's target AC, a save's or check's DC), and hasn't asked to see every offer */
function outcomeVisible(query: RollBonusQuery): boolean {
  const user = game.user ?? undefined;
  // A player who wants every offer shown (the ShowAllBonusOffers user setting)
  if (!user || safeGetGameSetting("midi-qol", "ShowAllBonusOffers")) return false;
  if (query.kind === "attack") return reveals({ subject: "ac", user, caster: query.actor, target: query.target?.actor ?? undefined });
  if (["save", "check", "skill", "tool"].includes(query.kind))
    return reveals({ subject: "challenge", user, caster: query.workflow?.actor ?? undefined, target: query.actor });
  return false;
}

/**
 * The damage type a damage add with several types is taken as: the roller's remembered type (M15 5e) while it is one
 * of the types, else asked, with "Remember this choice"
 */
async function chooseDamageType(types: readonly string[], label: string, actor?: Actor.Implementation, rememberKey?: string): Promise<string | undefined> {
  if (types.length <= 1) return types[0];
  const remembered = actor && rememberKey ? rememberedChoice(actor, rememberKey)?.value : undefined;
  if (typeof remembered === "string" && types.includes(remembered)) return remembered;
  const typeLabel = (type: string) => CONFIG.DND5E.damageTypes[type]?.label ?? type;
  const options = types.map(type => `<option value="${type}">${foundry.utils.escapeHTML(typeLabel(type))}</option>`).join("");
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: label },
    content: `<select name="damageType">${options}</select>${actor && rememberKey ? rememberCheckbox("remember") : ""}`,
    ok: { callback: (_event: Event, button: HTMLButtonElement) => ({
      type: (button.form?.elements.namedItem("damageType") as HTMLSelectElement | null)?.value,
      remember: !!(button.form?.elements.namedItem("remember") as HTMLInputElement | null)?.checked
    }) }
  }).catch(() => undefined) as { type?: string, remember?: boolean } | undefined;
  const type = typeof chosen?.type === "string" ? chosen.type : types[0];
  if (chosen?.remember && actor && rememberKey && type)
    await rememberChoice(actor, { key: rememberKey, value: type, label: `${label}: ${game.i18n?.localize("DND5E.DamageType") ?? "Damage type"}`, valueLabel: typeLabel(type) });
  return type;
}

export function defineRollBonusesService() {
  rollBonusesService = defineService<RollBonusContributor>("rollBonuses", {
    kind: "contributors", contract: ROLL_BONUSES_CONTRACT,
    description: "Bonuses offered on a roll (added dice, rerolls, a changed result), optional or automatic, by phase"
  });
}

/** A contributor's candidate, its id prefixed with the contributor's. */
export type OfferedBonus = BonusCandidate & {
  contributor: string;
  /** Contract 4: the prompt's selection, the bonus already configured for it */
  selection?: BonusSelection;
  /** A flags.midi-qol.optional bonus: its flag (a flag can offer two values, both withdrawn when one is used) and its name */
  flagKey?: string;
  flagLabel?: string;
};

/** Asks every contributor for the roll's candidates for `phase`, keeping those valid now and affordable. */
export async function collectBonusCandidates(query: RollBonusQuery, phase: BonusPhase, roll: Roll, outcome?: Outcome): Promise<OfferedBonus[]> {
  if (!rollBonusesService) return [];
  const offered: OfferedBonus[] = [];
  for (const { id: contributor, provider } of entries<RollBonusContributor>("rollBonuses")) {
    if (provider.kinds && !provider.kinds.includes(query.kind)) continue;
    let candidates: readonly BonusCandidate[] | undefined;
    try {
      candidates = await provider.for(query);
    } catch (err) {
      reportServiceProblem("rollBonuses", contributor, `failed for a ${query.kind} roll`, err);
      continue;
    }
    for (const candidate of candidates ?? []) {
      if (!candidate.phases.includes(phase)) continue;
      if (!offeredForResult(candidate, phase, outcome)) continue;
      if (outcome?.isFumble && !candidate.onFumble) continue;
      if (!canAfford(candidate.cost)) continue;
      // An offer that can't change the result, where the roller can see the outcome (M15 5b, the reveal policy)
      // (automatic bonuses still apply: the total, and rules reading it, show them)
      if (candidate.optional && !await couldMatter(candidate, query, roll, outcome) && outcomeVisible(query)) continue;
      try {
        if (candidate.validate && candidate.validate({ query, phase, roll, outcome }) !== true) continue;
      } catch (err) {
        reportServiceProblem("rollBonuses", contributor, `${candidate.label}: validate failed`, err);
        continue;
      }
      offered.push({ ...candidate, id: `${contributor}:${candidate.id}`, contributor });
    }
  }
  return offered;
}

type D20Result = { result: number, active?: boolean, discarded?: boolean, rerolled?: boolean };

/**
 * A d20 roll given advantage or disadvantage after it was rolled: a copy whose d20 has a second die (rolled now if it
 * has one) and keeps the higher (advantage) or lower; the other mode already on it cancels to the first die.
 */
export async function applyRollMode(roll: Roll, mode: "advantage" | "disadvantage"): Promise<Roll> {
  const copy = (roll.constructor as typeof Roll).fromData(JSON.parse(JSON.stringify(roll))) as Roll;
  const term = copy.terms[0];
  if (!(term instanceof foundry.dice.terms.Die) || term.faces !== 20) return roll;
  const modifiers = term.modifiers.filter(m => !/^k[hl]/.test(m));
  const had = term.modifiers.some(m => m.startsWith("kh")) ? 1 : term.modifiers.some(m => m.startsWith("kl")) ? -1 : 0;
  const wanted = mode === "advantage" ? 1 : -1;
  const final = had === 0 ? wanted : had === wanted ? had : 0;
  const results = term.results as D20Result[];
  const live = results.filter(r => !r.rerolled);
  if (final !== 0 && live.length < 2) {
    const extra = await new Roll("1d20").evaluate();
    const result: D20Result = { result: extra.total ?? 1, active: true };
    results.push(result);
    live.push(result);
  }
  for (const r of live) { r.active = false; r.discarded = true; }
  const kept = final === 1 ? live.reduce((a, b) => b.result > a.result ? b : a)
    : final === -1 ? live.reduce((a, b) => b.result < a.result ? b : a) : live[0];
  kept.active = true;
  kept.discarded = false;
  term.modifiers = final === 1 ? [...modifiers, "kh"] : final === -1 ? [...modifiers, "kl"] : modifiers;
  term.number = Math.max(1, live.length);
  refreshRollTotal(copy);
  foundry.utils.setProperty(copy, "options.advantageMode", final);
  return copy;
}

/** The roll after one bonus's effect, from the roll data of the use. */
/** Reroll up to `max` dice that rolled below their average, lowest first; a copy, the old results kept as rerolled */
async function rerollLowDice(roll: Roll, max: number | string | undefined, rollData: object): Promise<Roll> {
  let count = typeof max === "number" ? max : 1;
  if (typeof max === "string" && max.trim()) {
    const evaluated = await new Roll(max, { ...roll.data, ...rollData }).evaluate();
    count = evaluated.total ?? 1;
  }
  const changed = (roll.constructor as typeof Roll).fromData(JSON.parse(JSON.stringify(roll))) as Roll;
  const low: { term: foundry.dice.terms.DiceTerm, index: number, result: number }[] = [];
  for (const term of changed.dice) {
    term.results.forEach((result, index) => {
      if (result.active && !result.discarded && result.result < (term.faces! + 1) / 2) low.push({ term, index, result: result.result });
    });
  }
  low.sort((a, b) => (a.result / a.term.faces!) - (b.result / b.term.faces!));
  for (const { term, index } of low.slice(0, Math.max(0, count))) {
    const old = term.results[index];
    old.rerolled = true;
    old.active = false;
    const fresh = await new Roll(`1d${term.faces}`).evaluate();
    term.results.push({ result: fresh.total ?? 1, active: true });
  }
  return refreshRollTotal(changed);
}

export async function applyBonusEffect(roll: Roll, effect: BonusEffect, rollData: object, label: string): Promise<Roll> {
  const nameTerms = (bonusRoll: Roll) => {
    for (const term of bonusRoll.terms) if (!(term instanceof foundry.dice.terms.OperatorTerm)) term.options.flavor ||= label;
  };
  switch (effect.kind) {
    case "add": {
      const bonus = await new Roll(effect.formula, { ...roll.data, ...rollData }).evaluate();
      nameTerms(bonus);
      return addRollToAsync(roll, bonus);
    }
    case "reroll": {
      if (effect.dice === "choose") return rerollLowDice(roll, effect.max, rollData);
      const options = effect.dice === "max" ? { maximize: true } : effect.dice === "min" ? { minimize: true } : {};
      const RollClass = roll.constructor as typeof Roll;
      const rerolled: Roll = effect.addFormula
        ? await new RollClass(`${roll.formula} ${effect.addFormula}`, { ...roll.data, ...rollData }, roll.options).evaluate(options)
        : await roll.reroll(options);
      if (effect.keep === "higher") return (rerolled.total ?? 0) >= (roll.total ?? 0) ? rerolled : roll;
      if (effect.keep === "lower") return (rerolled.total ?? 0) <= (roll.total ?? 0) ? rerolled : roll;
      return rerolled;
    }
    case "mode":
      return applyRollMode(roll, effect.mode);
    case "replace": {
      const RollClass = roll.constructor as typeof Roll;
      return new RollClass(effect.formula, { ...roll.data, ...rollData }, roll.options).evaluate();
    }
    case "outcome": {
      // A copy with the same dice (clone() would roll them again)
      const changed = (roll.constructor as typeof Roll).fromData(JSON.parse(JSON.stringify(roll))) as Roll;
      foundry.utils.setProperty(changed, "options.success", effect.success);
      return changed;
    }
    case "critical": {
      const term = roll.terms[0];
      if (term instanceof foundry.dice.terms.DiceTerm) {
        const result = term.results.find(r => r.active)?.result ?? roll.total;
        foundry.utils.setProperty(term, "options.critical", result);
        foundry.utils.setProperty(roll, "options.criticalSuccess", result);
      }
      return roll;
    }
    case "rider":
      return roll;
  }
}

/**
 * Spends a declared cost from `actor`: actions through midi's economy markers, item/activity uses, spell slots, an
 * attribute, hit dice. effectCount and oncePer are midi-flag bookkeeping (the flags spend their own); material is not
 * spent (reported).
 */
export async function spendBonusCost(actor: Actor.Implementation, cost: BonusCost | undefined, label: string): Promise<void> {
  if (!cost) return;
  const report = (message: string) => reportServiceProblem("rollBonuses", "midi-qol", `${label}: ${message}`);
  for (const [key, entry] of Object.entries(cost.actions ?? {})) {
    if (!entry.cost) continue;
    if (key === "reaction") await setReactionUsed(actor);
    else if (key === "bonus") await setBonusActionUsed(actor);
    else if (key === "action") await setActionUsed(actor);
    else report(`unknown action cost "${key}"`);
  }
  for (const [uuid, entry] of Object.entries(cost.itemUses ?? {})) {
    const item = fromUuidSync(uuid);
    if (!(item instanceof Item)) { report(`no item ${uuid}`); continue; }
    // @ts-expect-error no dnd5e-types
    await item.update({ "system.uses.spent": (item.system.uses?.spent ?? 0) + entry.cost });
  }
  for (const [uuid, entry] of Object.entries(cost.activityUses ?? {})) {
    const activity = fromUuidSync(uuid) as { uses?: { spent?: number }, update?: (data: object) => Promise<unknown> } | null;
    if (!activity?.update) { report(`no activity ${uuid}`); continue; }
    await activity.update({ "uses.spent": (activity.uses?.spent ?? 0) + entry.cost });
  }
  for (const [slot, entry] of Object.entries(cost.spellSlots ?? {})) {
    const value = foundry.utils.getProperty(actor, `system.spells.${slot}.value`);
    if (typeof value !== "number") { report(`no spell slot ${slot}`); continue; }
    await actor.update({ [`system.spells.${slot}.value`]: Math.max(0, value - entry.cost) });
  }
  for (const [path, entry] of Object.entries(cost.attribute ?? {})) {
    const value = foundry.utils.getProperty(actor, path);
    if (typeof value !== "number") { report(`no number at ${path}`); continue; }
    await actor.update({ [path]: value - entry.cost });
  }
  for (const [die, entry] of Object.entries(cost.hitDice ?? {})) {
    // A class whose hit die is `die` with enough left
    // @ts-expect-error no dnd5e-types
    const cls = actor.items.find(i => i.type === "class" && i.system.hd?.denomination === die && (i.system.hd?.value ?? 0) >= entry.cost);
    if (!cls) { report(`no ${die} hit die left`); continue; }
    // @ts-expect-error no dnd5e-types
    await cls.update({ "system.hd.spent": (cls.system.hd.spent ?? 0) + entry.cost });
  }
  if (Object.keys(cost.material ?? {}).length) report("material costs are not spent by midi");
}

/** Applies a bonus and runs its onChosen; a failure is reported and leaves the roll unchanged. */
export async function applyOfferedBonus(bonus: OfferedBonus, ctx: BonusContext, rollData: object): Promise<Roll> {
  let roll = ctx.roll;
  if (!(await approveBonus(bonus, ctx))) return roll;
  try {
    // Contract 4: the prompt's selection, read by the formula as @bonus.scaling / @bonus.inputs.<name>
    // Without a prompt's selection (the classic dialog, a standing choice): its lowest level and its inputs' defaults
    const selection: BonusSelection | undefined = bonus.selection ?? (bonus.scaling || bonus.inputs?.length
      ? { scaling: bonus.scaling ? bonus.scaling.min ?? 1 : undefined, targets: [],
        inputs: Object.fromEntries((bonus.inputs ?? []).filter(i => i.default !== undefined).map(i => [i.name, i.default!])) }
      : undefined);
    if (selection) {
      ctx = { ...ctx, selection };
      rollData = { ...rollData, bonus: { scaling: selection.scaling ?? 1, inputs: selection.inputs } };
    }
    // Taken without the prompt: configured for that selection here (the prompt configures its own)
    if (!bonus.selection && selection && bonus.configure) {
      const configured = await bonus.configure(selection, ctx);
      if (configured?.disabled) return roll;
      if (configured) bonus = { ...bonus, ...(configured.effect ? { effect: configured.effect } : {}), ...(configured.cost ? { cost: configured.cost } : {}) };
    }
    let effect = bonus.effect;
    if (effect.kind === "add" && !effect.damageType && selection?.damageType) effect = { ...effect, damageType: selection.damageType };
    if (effect.kind === "add" && !effect.damageType && bonus.damageTypes?.length)
      effect = { ...effect, damageType: await chooseDamageType(bonus.damageTypes, bonus.label, ctx.query.actor, bonusDamageTypeKey(standingKey(bonus))) };
    const targets = selection?.targets.length ? selection.targets : bonus.targets;
    const rollType = (ctx.roll.options as { type?: string }).type;
    if (targets?.length && ctx.query.kind === "damage" && effect.kind === "add" && ctx.query.workflow) {
      const extra = await new Roll(effect.formula, { ...ctx.roll.data, ...rollData }).evaluate();
      ctx.query.workflow.addTargetedDamageBonus({ targets: [...targets], amount: extra.total ?? 0,
        type: effect.damageType ?? rollType ?? "none", label: bonus.label });
    } else if (ctx.query.kind === "damage" && effect.kind === "add" && ctx.query.workflow
      && ((effect.damageType && effect.damageType !== rollType) || effect.critical === "force" || effect.critical === "never")) {
      // Its own damage roll: its type and its critical, not merged into the roll it was offered on
      const workflow = ctx.query.workflow;
      const isCritical = effect.critical === "force" ? true : effect.critical === "never" ? false : !!workflow.isCritical;
      // @ts-expect-error no dnd5e-types
      const extra: Roll = await new CONFIG.Dice.DamageRoll(effect.formula, { ...ctx.roll.data, ...rollData },
        { type: effect.damageType ?? rollType, isCritical, flavor: bonus.label }).evaluate();
      for (const term of extra.terms) if (!(term instanceof foundry.dice.terms.OperatorTerm)) term.options.flavor ||= bonus.label;
      await workflow.setBonusDamageRolls([...(workflow.bonusDamageRolls ?? []), extra]);
    } else if (bonus.apply) roll = await bonus.apply(ctx, rollData);
    else roll = await applyBonusEffect(ctx.roll, effect, rollData, bonus.label);
    // A changed roll is a new object: carry forward what was used on the roll it came from (an `apply` records its own)
    if (!bonus.apply) {
      const used: string[] = [...(foundry.utils.getProperty(ctx.roll, "flags.midi-qol.optionalsUsed") as string[] ?? [])];
      used.push(bonus.id);
      foundry.utils.setProperty(roll, "flags.midi-qol.optionalsUsed", used);
    }
    // Paid by its spender when it has one (someone else's resources), else the roller
    const spender = bonus.spender ? fromUuidSync(bonus.spender) : undefined;
    if (!bonus.spendsOwnCost) await spendBonusCost(spender instanceof Actor ? spender : ctx.query.actor, bonus.cost, bonus.label);
    await bonus.onChosen?.({ ...ctx, roll });
  } catch (err) {
    reportServiceProblem("rollBonuses", bonus.contributor, `${bonus.label}: applying it failed`, err);
  }
  return roll;
}
