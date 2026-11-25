import type { Workflow } from "../Workflow.js";
import { MODULE_ID } from "../../midi-qol.js";
import type { Activity } from "../../globals.js";
import type { TableResultChoice } from "./tables.js";
import { activityChoiceKey, rememberChoice, rememberCheckbox, rememberedChoice } from "./rememberedChoices.js";
import { conditionsPresent } from "./entries/conditionRemoval.js";

/*
 * Choices (M28 data half; shapes ~/Documents/midi-next-waveB-shapes-2026-11-20.md): named choices an activity declares
 * (`midiChoices`), asked once in the `midi-qol.Choices` step after target confirmation, before any roll; supplied by a
 * caller (`workflowOptions.choices`) or, for an NPC with no player owner, its default. Stored on the use (the card's
 * `state.choices`), copied to the effects it applies (`flags.midi-qol.choices`), read by conditions (`choices.<id>`).
 * dnd5e's own damage type pick (a part with several types) is read from the rolls as `choices.damageType`, not stored.
 */

export type ChoiceKind = "damageType" | "option" | "ability" | "skill" | "creatureType" | "number" | "allocate" | "targets" | "conditions";
export type ChoiceValue = string | number | string[] | Record<string, number> | TableResultChoice;

export interface ChoiceDeclaration {
  id: string;
  label?: string;
  kind: ChoiceKind;
  options?: (string | { value: string, label?: string })[];
  /** Options from the use: the damage parts' types; the activity's effects (the chosen one is the one applied) */
  source?: "partTypes" | "effects";
  default?: ChoiceValue;
  min?: number;
  max?: number | string;
  /** conditions: the conditions that may be chosen (all of dnd5e's when absent); offered are those the creatures have */
  from?: string[];
  /** allocate: a formula over the activity's roll data ("2 + @item.level") */
  total?: string;
  /** M15: kept per actor (declared, not read: every list-like choice can be remembered by the player, 5e) */
  remember?: "standing";
}

/** One stored answer (a list: ids may have dots, which an update reads as a path) */
export interface StoredChoice { id: string, value: ChoiceValue }

const KINDS: readonly ChoiceKind[] = ["damageType", "option", "ability", "skill", "creatureType", "number", "allocate", "targets", "conditions"];

/** The creatures a choice is about, when not the use's targets (an entry at one target's event) */
export type ChoiceSubjects = readonly (Actor.Implementation | null | undefined)[] | undefined;

/**
 * A `conditions` choice's options: of `from` (dnd5e's conditions when it gives none), those a creature it is about
 * has now. The answer is a list of status ids, at most `max` (any number when absent).
 */
export function conditionChoices(declaration: Pick<ChoiceDeclaration, "from">, workflow: Workflow, subjects?: ChoiceSubjects): { value: string, label: string }[] {
  const config = (CONFIG as unknown as { DND5E?: { conditionTypes?: Record<string, { label?: string, name?: string }> } }).DND5E?.conditionTypes ?? {};
  const from = declaration.from?.length ? declaration.from : Object.keys(config);
  const actors = subjects?.length ? subjects : workflow.targets.documents.map(token => token.actor);
  return conditionsPresent(from, actors.flatMap(actor => actor ? [actor.statuses as Iterable<string>] : []))
    .map(value => ({ value, label: game.i18n?.localize(config[value]?.label ?? config[value]?.name ?? value) ?? value }));
}

/** The activity's declarations that are well formed */
export function choiceDeclarations(activity: Activity | undefined | null): ChoiceDeclaration[] {
  const declared = activity?.midiChoices;
  if (!Array.isArray(declared)) return [];
  return declared.filter((d): d is ChoiceDeclaration => !!d && typeof d.id === "string" && !!d.id && KINDS.includes(d.kind));
}

interface Option { value: string, label: string }

function configOptions(record: Record<string, { label?: string } | string> | undefined): Option[] {
  return Object.entries(record ?? {}).map(([value, entry]) => ({ value, label: game.i18n?.localize(typeof entry === "string" ? entry : entry?.label ?? value) ?? value }));
}

/** The options of a list-like choice */
export function choiceOptions(declaration: ChoiceDeclaration, workflow: Workflow, subjects?: ChoiceSubjects): Option[] {
  if (declaration.kind === "conditions") return conditionChoices(declaration, workflow, subjects);
  if (declaration.options?.length) return declaration.options.map(option => typeof option === "string"
    ? { value: option, label: option } : { value: option.value, label: option.label ?? option.value });
  const dnd5e = CONFIG.DND5E;
  if (declaration.source === "partTypes") {
    const types = new Set<string>();
    for (const part of workflow.activity?.damage?.parts ?? []) for (const type of part.types ?? []) types.add(type);
    return [...types].map(value => ({ value, label: game.i18n?.localize(dnd5e.damageTypes[value]?.label ?? value) ?? value }));
  }
  if (declaration.source === "effects") {
    return (workflow.activity?.effects ?? []).flatMap(profile => {
      const effect = workflow.activity?.item?.effects.get(profile._id ?? "");
      return effect ? [{ value: effect.id ?? "", label: effect.name }] : [];
    });
  }
  switch (declaration.kind) {
    case "damageType": return configOptions(dnd5e.damageTypes);
    case "ability": return configOptions(dnd5e.abilities);
    case "skill": return configOptions(dnd5e.skills);
    case "creatureType": return configOptions(dnd5e.creatureTypes);
    default: return [];
  }
}

function evaluateNumber(formula: string | number | undefined, workflow: Workflow): number | undefined {
  if (typeof formula === "number") return formula;
  if (!formula) return undefined;
  const value = Number(new Roll(formula, workflow.activity?.getRollData() ?? {}).evaluateSync({ strict: false }).total);
  return Number.isFinite(value) ? value : undefined;
}

/** A value is one this declaration can take (supplied values are checked, not trusted) */
export function validChoice(declaration: ChoiceDeclaration, value: unknown, workflow: Workflow, subjects?: ChoiceSubjects): value is ChoiceValue {
  switch (declaration.kind) {
    case "conditions": {
      if (!Array.isArray(value) || !value.every(status => typeof status === "string")) return false;
      const offered = new Set(conditionChoices(declaration, workflow, subjects).map(option => option.value));
      const max = evaluateNumber(declaration.max, workflow);
      return value.every(status => offered.has(status)) && (max === undefined || value.length <= max);
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      return (declaration.min === undefined || value >= declaration.min) && (typeof declaration.max !== "number" || value <= declaration.max);
    }
    case "allocate": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const counts = Object.values(value);
      if (!counts.every(count => Number.isInteger(count) && count >= 0)) return false;
      const total = evaluateNumber(declaration.total, workflow);
      return total === undefined || counts.reduce((a, b) => a + b, 0) === total;
    }
    case "targets": {
      if (!Array.isArray(value) || !value.every(uuid => typeof uuid === "string")) return false;
      const max = evaluateNumber(declaration.max, workflow);
      return max === undefined || value.length <= max;
    }
    default: {
      if (typeof value !== "string") return false;
      const options = choiceOptions(declaration, workflow);
      return !options.length || options.some(option => option.value === value);
    }
  }
}

function escape(text: string) { return foundry.utils.escapeHTML(text); }

/** The form for the choices still to answer */
function choicesForm(declarations: ChoiceDeclaration[], workflow: Workflow, subjects?: ChoiceSubjects): string {
  const targets = workflow.targets.documents;
  const rows = declarations.map((declaration, index) => {
    const label = escape(declaration.label ?? declaration.id);
    const name = `choice-${index}`;
    switch (declaration.kind) {
      case "number":
        return `<div class="form-group"><label>${label}</label><input type="number" name="${name}" value="${Number(declaration.default ?? declaration.min ?? 0)}"
          ${declaration.min !== undefined ? `min="${declaration.min}"` : ""} ${typeof declaration.max === "number" ? `max="${declaration.max}"` : ""}></div>`;
      case "allocate": {
        const total = evaluateNumber(declaration.total, workflow) ?? 0;
        const each = targets.map((token, t) => `<div class="form-group"><label>${escape(token.name ?? "")}</label>
          <input type="number" name="${name}-${t}" min="0" step="1" value="${t === 0 ? total : 0}"></div>`).join("");
        return `<fieldset><legend>${label} (${total})</legend>${each}</fieldset>`;
      }
      case "targets": {
        const each = targets.map((token, t) => `<label class="checkbox"><input type="checkbox" name="${name}-${t}"> ${escape(token.name ?? "")}</label>`).join("");
        const max = evaluateNumber(declaration.max, workflow);
        return `<fieldset><legend>${label}${max !== undefined ? ` (${max})` : ""}</legend>${each}</fieldset>`;
      }
      case "conditions": {
        // Those the creature has: one ticked when there is only one to end
        const options = conditionChoices(declaration, workflow, subjects);
        const max = evaluateNumber(declaration.max, workflow);
        const each = options.map((option, c) => `<label class="checkbox"><input type="checkbox" name="${name}-${c}" value="${escape(option.value)}" ${options.length === 1 ? "checked" : ""}> ${escape(option.label)}</label>`).join("");
        return `<fieldset class="midi-qol-choice-conditions"><legend>${label}${max !== undefined ? ` (${max})` : ""}</legend>${each}</fieldset>`;
      }
      default: {
        const options = choiceOptions(declaration, workflow, subjects).map(option =>
          `<option value="${escape(option.value)}" ${option.value === declaration.default ? "selected" : ""}>${escape(option.label)}</option>`).join("");
        // A list-like choice can be remembered for the actor (M15 5e)
        return `<div class="form-group"><label>${label}</label><select name="${name}">${options}</select></div>${rememberCheckbox(`${name}-remember`)}`;
      }
    }
  });
  return rows.join("");
}

function readForm(declarations: ChoiceDeclaration[], data: Record<string, unknown>, workflow: Workflow, subjects?: ChoiceSubjects): Record<string, ChoiceValue> {
  const targets = workflow.targets.documents;
  const answers: Record<string, ChoiceValue> = {};
  declarations.forEach((declaration, index) => {
    const name = `choice-${index}`;
    if (declaration.kind === "number") answers[declaration.id] = Number(data[name]);
    else if (declaration.kind === "allocate") {
      answers[declaration.id] = Object.fromEntries(targets.map((token, t) => [token.uuid ?? "", Number(data[`${name}-${t}`] ?? 0)]));
    } else if (declaration.kind === "targets") {
      answers[declaration.id] = targets.filter((_, t) => !!data[`${name}-${t}`]).map(token => token.uuid ?? "");
    } else if (declaration.kind === "conditions") {
      answers[declaration.id] = conditionChoices(declaration, workflow, subjects).filter((_, c) => !!data[`${name}-${c}`]).map(option => option.value);
    } else answers[declaration.id] = String(data[name] ?? "");
  });
  return answers;
}

/** The list-like kinds a player can remember an answer to (not a use's own: a number, an allocation, targets) */
const REMEMBERABLE: readonly ChoiceKind[] = ["damageType", "option", "ability", "skill", "creatureType"];

/** Ask the choices; undefined when the dialog was closed. Answers ticked "Remember this choice" are kept for the actor */
async function askChoices(declarations: ChoiceDeclaration[], workflow: Workflow, subjects?: ChoiceSubjects): Promise<Record<string, ChoiceValue> | undefined> {
  for (;;) {
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: `${workflow.activity?.name ?? workflow.item?.name ?? ""}: ${game.i18n?.localize(`${MODULE_ID}.Choices.Title`)}` },
      content: choicesForm(declarations, workflow, subjects),
      ok: { label: game.i18n?.localize(`${MODULE_ID}.Choices.Confirm`) ?? "OK" },
      rejectClose: false
    });
    if (!data) return undefined;
    const answers = readForm(declarations, data as Record<string, unknown>, workflow, subjects);
    const invalid = declarations.filter(declaration => !validChoice(declaration, answers[declaration.id], workflow, subjects));
    if (!invalid.length) {
      const actor = workflow.actor;
      for (const [index, declaration] of declarations.entries()) {
        if (!actor || !REMEMBERABLE.includes(declaration.kind) || !(data as Record<string, unknown>)[`choice-${index}-remember`]) continue;
        const value = answers[declaration.id];
        await rememberChoice(actor, { key: activityChoiceKey(workflow.activity, declaration.id), value,
          label: `${workflow.activity?.item?.name ?? ""}: ${declaration.label ?? declaration.id}`,
          valueLabel: choiceOptions(declaration, workflow).find(option => option.value === value)?.label ?? String(value) });
      }
      return answers;
    }
    ui.notifications?.warn(game.i18n?.format(`${MODULE_ID}.Choices.Invalid`, { choices: invalid.map(d => d.label ?? d.id).join(", ") }) ?? "");
  }
}

/**
 * M15 stage 6: an entry's own choice (`choose`), asked when the entry is taken: its value, or undefined when the
 * dialog was closed. `choose.if` (an expression, checked by the caller) says when it is asked at all.
 */
export async function askEntryChoice(declaration: ChoiceDeclaration, workflow: Workflow, subjects?: ChoiceSubjects): Promise<ChoiceValue | undefined> {
  const remembered = REMEMBERABLE.includes(declaration.kind) ? rememberedChoice(workflow.actor, activityChoiceKey(workflow.activity, declaration.id)) : undefined;
  if (remembered && validChoice(declaration, remembered.value, workflow)) return remembered.value;
  const answers = await askChoices([declaration], workflow, subjects);
  return answers?.[declaration.id];
}

/**
 * The Choices step's work: the activity's choices answered and stored on the use. False when the user closed the
 * dialog (the use is abandoned).
 */
export async function resolveChoices(workflow: Workflow): Promise<boolean> {
  const declarations = choiceDeclarations(workflow.activity);
  if (!declarations.length) return true;
  const supplied: Record<string, unknown> = workflow.workflowOptions.choices ?? {};
  const answers: Record<string, ChoiceValue> = {};
  const toAsk: ChoiceDeclaration[] = [];
  for (const declaration of declarations) {
    const kept = workflow.choices[declaration.id];
    if (kept !== undefined) continue;
    const given = supplied[declaration.id];
    // The player's remembered answer (M15 5e), while it is still a valid one
    const remembered = REMEMBERABLE.includes(declaration.kind) ? rememberedChoice(workflow.actor, activityChoiceKey(workflow.activity, declaration.id)) : undefined;
    if (given !== undefined && validChoice(declaration, given, workflow)) answers[declaration.id] = given;
    else if (remembered && validChoice(declaration, remembered.value, workflow)) answers[declaration.id] = remembered.value;
    else if (declaration.default !== undefined && !workflow.actor?.hasPlayerOwner) answers[declaration.id] = declaration.default;
    else toAsk.push(declaration);
  }
  if (toAsk.length) {
    const asked = await askChoices(toAsk, workflow);
    if (!asked) return false;
    Object.assign(answers, asked);
  }
  for (const [id, value] of Object.entries(answers)) workflow.setChoice(id, value);
  return true;
}

/** dnd5e's own damage type picks: the first damage roll whose part offered several types */
export function rolledDamageTypeChoice(workflow: Workflow): string | undefined {
  for (const roll of workflow.damageRolls ?? []) {
    // @ts-expect-error no dnd5e-types
    const { type, types } = roll.options ?? {};
    if (typeof type === "string" && Array.isArray(types) && types.length > 1) return type;
  }
  return undefined;
}

/** A damage type choice from the parts' types sets the roll's type, as dnd5e's picker would; true if one did */
export function applyDamageTypeChoice(workflow: Workflow, rolls: { options?: Record<string, unknown> }[]): boolean {
  const declaration = choiceDeclarations(workflow.activity).find(d => d.kind === "damageType" && d.source === "partTypes");
  const chosen = declaration ? workflow.choices[declaration.id] : undefined;
  if (typeof chosen !== "string") return false;
  let applied = false;
  for (const roll of rolls) {
    const types = roll.options?.types;
    if (Array.isArray(types) && types.includes(chosen)) {
      roll.options!.type = chosen;
      applied = true;
    }
  }
  return applied;
}

/** A damage type given to the use (workflowOptions.damageTypeChoice: a region's cast chose it) for a part that offers it */
export function applyGivenDamageType(workflow: Workflow, rolls: { options?: Record<string, unknown> }[]): boolean {
  const given = workflow.workflowOptions?.damageTypeChoice;
  if (typeof given !== "string" || !given) return false;
  let applied = false;
  for (const roll of rolls) {
    const types = roll.options?.types;
    if (Array.isArray(types) && types.includes(given)) {
      roll.options!.type = given;
      applied = true;
    }
  }
  return applied;
}

/** The effect a `source: "effects"` choice chose, if the activity has one answered */
export function chosenEffectId(workflow: Workflow): string | undefined {
  const declaration = choiceDeclarations(workflow.activity).find(d => d.source === "effects");
  const chosen = declaration ? workflow.choices[declaration.id] : undefined;
  return typeof chosen === "string" ? chosen : undefined;
}
