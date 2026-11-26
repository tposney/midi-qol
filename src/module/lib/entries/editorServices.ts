import { defineService, entries, register, reportServiceProblem } from "../../api/services.js";
import type { EntryAction, EntryHome } from "./types.js";
import type { SentenceContext, TriggerGroup } from "./sentences.js";
import type { Recipe } from "./recipes.js";
import { MIDI_EFFECT_PRESETS } from "./effectPresets.js";
import { activityCard, type ActivityCardModel, type ActivityData, type CardText, type Targeting } from "./activityCard.js";

/*
 * The entry editor's vocabulary as contributor services, so modules extend what it offers and how it reads entries the
 * way they extend the rest of midi (MidiQOL.services.register / wrap). Higher priority is asked first.
 *
 *   entryWording   how an action or event reads in the sentence view (the first answer wins; midi's own last)
 *   entryTriggers  groups of triggers the sentence view's picker offers (after midi's, before "more")
 *   entryOptions   named option lists fields pick from (`options: { list: "damageTypes" }`); every contributor's values
 *                  for a list are merged, so a module adds to midi's lists as well as making its own
 *   activityCards  what an activity type does by itself, for its card (the first contributor for its type, else "*")
 *   entryRecipes   recipes offered where an entry is added
 *   effectPresets  common effects "+ effect" offers (changes, statuses; an optional amount, damage type...)
 *   targetPresets  targeting presets beyond midi's (how to recognise one, its defaults, its wording, its fields)
 *   addKinds       what "Add what it does" offers beyond midi's (the activities and effects one makes)
 *   basicsFields   fields of the basics line beyond activation, duration and uses (read, worded, saved)
 *
 *   MidiQOL.services.register("entryWording", "my-module", {
 *     action: (action, key) => key === "myAction" ? `summon ${action.myAction.count} wolves` : undefined
 *   });
 *   MidiQOL.services.register("entryOptions", "my-module", { lists: () => ({ damageTypes: [{ value: "sonic", label: "Sonic" }] }) });
 */

export interface FieldOption { value: string, label: string }

export interface EntryWordingContributor {
  /** An action in words, or undefined to leave it to others */
  action?(action: EntryAction, key: string | undefined, context: SentenceContext): string | undefined;
  /** An event in words; `subject` is who it happens to, already worded ("the bearer", "this activity") */
  event?(eventId: string, subject: string, home: EntryHome): string | undefined;
}
export interface EntryTriggersContributor {
  groups(home: EntryHome, registered: readonly string[]): readonly TriggerGroup[];
}
export interface EntryOptionsContributor {
  lists(): Record<string, readonly FieldOption[]>;
}
export interface ActivityCardsContributor {
  /** Activity types it reads ("*": any) */
  types: readonly string[];
  card(data: ActivityData, text: CardText): ActivityCardModel | undefined;
  /** Its own fields for the card, in place of midi's (the activity as it will be saved) */
  fields?(data: ActivityData): readonly CardField[];
  /** The activity update for its fields' values (paths relative to the activity; only what changed) */
  update?(data: ActivityData, values: Record<string, unknown>): Record<string, unknown>;
}
/** A contributed card field: `name` is its key in the values `update` is given */
export interface CardField { name: string, label: string, type: "text" | "number" | "select" | "checkbox", value: unknown, options?: readonly FieldOption[] }
export interface EntryRecipesContributor {
  recipes(home: EntryHome): readonly Recipe[];
}

/** One change of an effect, as Foundry 14 stores them (system.changes) */
export interface EffectChange { key: string, type: string, value: string, phase?: string }
/** A common effect: its changes (and statuses) for the value of its one optional parameter */
export interface EffectPresetDef {
  id: string;
  label: string;
  /** Where it is listed: movement, defence, rolls, or a module's own */
  group?: string;
  param?: { label: string, type: "number" | "formula" | "select", list?: string, default?: string };
  changes(value: string): readonly EffectChange[];
  statuses?: readonly string[];
}
export interface EffectPresetsContributor { presets(): readonly EffectPresetDef[] }

/** A targeting preset: recognised after midi's own; picking it starts from its defaults; the listed fields edit it */
export interface TargetPresetDef {
  id: string;
  label: string;
  matches(t: Targeting): boolean;
  defaults(current: Targeting): Targeting;
  text(t: Targeting, say: CardText["say"]): string;
  fields?: readonly ("count" | "range" | "size" | "width" | "who" | "shape")[];
  shapes?: readonly string[];
}
export interface TargetPresetsContributor { presets(): readonly TargetPresetDef[] }

/** Something "Add what it does" makes: activities (with _id) and item effects, made at once on the item */
export interface AddKindDef {
  id: string;
  label: string;
  hint?: string;
  make(context: { item: Item.Implementation, spell: boolean, randomID(): string }): { activities: readonly Record<string, unknown>[], effects?: readonly Record<string, unknown>[] };
}
export interface AddKindsContributor { kinds(item: Item.Implementation): readonly AddKindDef[] }

/** A field of the basics line: its value read from the activity, worded on the line, saved by its update */
export interface BasicsFieldDef {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox";
  options?: readonly FieldOption[];
  read(activity: object): unknown;
  /** Its words on the basics line (nothing: not shown) */
  text?(value: unknown, activity: object): string | undefined;
  /** The update for a new value: paths on the activity and on its item */
  update(value: unknown, activity: object): { activity?: Record<string, unknown>, item?: Record<string, unknown> };
}
export interface BasicsFieldsContributor { fields(activity: object): readonly BasicsFieldDef[] }

declare module "../../api/services.js" {
  interface MidiServices {
    entryWording: EntryWordingContributor;
    entryTriggers: EntryTriggersContributor;
    entryOptions: EntryOptionsContributor;
    activityCards: ActivityCardsContributor;
    entryRecipes: EntryRecipesContributor;
    effectPresets: EffectPresetsContributor;
    targetPresets: TargetPresetsContributor;
    addKinds: AddKindsContributor;
    basicsFields: BasicsFieldsContributor;
  }
}

export function defineEntryEditorServices() {
  defineService<EntryWordingContributor>("entryWording", { kind: "contributors", description: "How an entry's actions and events read in the entry editor's sentences" });
  defineService<EntryTriggersContributor>("entryTriggers", { kind: "contributors", description: "Groups of triggers the entry editor's picker offers" });
  defineService<EntryOptionsContributor>("entryOptions", { kind: "contributors", description: "Named option lists the entry editor's fields pick from (merged across contributors)" });
  defineService<ActivityCardsContributor>("activityCards", { kind: "contributors", description: "What an activity type does by itself, read as an entry (the entry editor's activity card)" });
  defineService<EntryRecipesContributor>("entryRecipes", { kind: "contributors", description: "Recipes the entry editor offers where an entry is added" });
  defineService<EffectPresetsContributor>("effectPresets", { kind: "contributors", description: "Common effects the sentence view's \"+ effect\" offers" });
  defineService<TargetPresetsContributor>("targetPresets", { kind: "contributors", description: "Targeting presets the sentence view offers beyond midi's" });
  defineService<AddKindsContributor>("addKinds", { kind: "contributors", description: "What the sentence view's \"Add what it does\" offers beyond midi's" });
  defineService<BasicsFieldsContributor>("basicsFields", { kind: "contributors", description: "Fields of an activity's basics line beyond activation, duration and uses" });
}

/** Each contributor asked in turn (highest priority first); a failing one is reported and skipped */
function ask<P, R>(serviceId: string, call: (provider: P) => R | undefined): { id: string, result: R }[] {
  const answers: { id: string, result: R }[] = [];
  let list: { id: string, provider: P }[];
  try { list = entries<P>(serviceId); } catch { return answers; }
  for (const { id, provider } of list) {
    try {
      const result = call(provider);
      if (result !== undefined) answers.push({ id, result });
    } catch (err) { reportServiceProblem(serviceId, id, "failed and is skipped", err); }
  }
  return answers;
}

export function contributedActionText(action: EntryAction, key: string | undefined, context: SentenceContext): string | undefined {
  return ask<EntryWordingContributor, string>("entryWording", p => p.action?.(action, key, context))[0]?.result;
}

export function contributedEventText(eventId: string, subject: string, home: EntryHome): string | undefined {
  return ask<EntryWordingContributor, string>("entryWording", p => p.event?.(eventId, subject, home))[0]?.result;
}

export function contributedTriggerGroups(home: EntryHome, registered: readonly string[]): TriggerGroup[] {
  return ask<EntryTriggersContributor, readonly TriggerGroup[]>("entryTriggers", p => p.groups(home, registered)).flatMap(a => [...a.result]);
}

/** A named list: every contributor's values, the first label for a value kept */
export function optionList(listId: string): FieldOption[] {
  const seen = new Map<string, FieldOption>();
  for (const { result } of ask<EntryOptionsContributor, readonly FieldOption[]>("entryOptions", p => p.lists()[listId]))
    for (const option of result) if (!seen.has(option.value)) seen.set(option.value, option);
  return [...seen.values()];
}

/** The contributor for an activity type: the first that reads it, else the first that reads any */
export function activityCardContributor(type: string): { id: string, provider: ActivityCardsContributor } | undefined {
  let list: { id: string, provider: ActivityCardsContributor }[];
  try { list = entries<ActivityCardsContributor>("activityCards"); } catch { return undefined; }
  return list.find(e => e.provider.types.includes(type)) ?? list.find(e => e.provider.types.includes("*"));
}

/** The card for an activity, from its contributor */
export function contributedActivityCard(data: ActivityData, text: CardText): ActivityCardModel | undefined {
  const found = activityCardContributor(data.type);
  if (!found) return undefined;
  try { return found.provider.card(data, text); }
  catch (err) { reportServiceProblem("activityCards", found.id, "card() failed", err); return undefined; }
}

/** Every contributor's, the first with an id kept */
function firstById<T extends { id: string }>(lists: { result: readonly T[] }[]): T[] {
  const seen = new Map<string, T>();
  for (const { result } of lists) for (const def of result) if (def?.id && !seen.has(def.id)) seen.set(def.id, def);
  return [...seen.values()];
}

export function effectPresetDefs(): EffectPresetDef[] {
  return firstById(ask<EffectPresetsContributor, readonly EffectPresetDef[]>("effectPresets", p => p.presets()));
}

export function targetPresetDefs(): TargetPresetDef[] {
  return firstById(ask<TargetPresetsContributor, readonly TargetPresetDef[]>("targetPresets", p => p.presets()));
}

export function addKindDefs(item: Item.Implementation): AddKindDef[] {
  return firstById(ask<AddKindsContributor, readonly AddKindDef[]>("addKinds", p => p.kinds(item)));
}

export function basicsFieldDefs(activity: object): BasicsFieldDef[] {
  return firstById(ask<BasicsFieldsContributor, readonly BasicsFieldDef[]>("basicsFields", p => p.fields(activity)));
}

export function contributedRecipes(home: EntryHome): Recipe[] {
  return ask<EntryRecipesContributor, readonly Recipe[]>("entryRecipes", p => p.recipes(home)).flatMap(a => [...a.result]);
}

/** dnd5e's config lists, by name */
const CONFIG_LISTS: Record<string, string> = {
  damageTypes: "damageTypes", healingTypes: "healingTypes", activationTypes: "activityActivationTypes", spellSchools: "spellSchools",
  abilities: "abilities", skills: "skills", conditions: "conditionTypes", creatureTypes: "creatureTypes"
};

/** midi's reaction triggers (utils reactionTypes' labels), as an activity's reaction condition names them */
const REACTION_TRIGGERS = ["isHit", "isMissed", "isCrit", "isFumble", "isAttacked", "preAttack", "isTargeted", "isDamaged", "isHealed",
  "isSave", "isSaveFail", "isSaveSuccess", "isMoved", "isOpportunity", "isCast"];
/** A condition starting with its trigger: `reaction === "isCast"`, maybe `&& <the rest>` (kept as it is) */
const LEADING_TRIGGER = /^\s*reaction\s*===?\s*["']([A-Za-z]+)["']\s*(&&[\s\S]*)?$/;

/**
 * The basics chip's reaction trigger (a reaction's activity): the trigger its reaction condition starts with
 * (`reaction === "isCast" && ...`, the rest kept as it is); "custom" for any other condition (the midi tab edits it)
 */
const reactionTriggerField: BasicsFieldsContributor = {
  fields: activity => {
    const a = activity as { activation?: { type?: string }, useConditionText?: string };
    if (a.activation?.type !== "reaction") return [];
    const say = (key: string) => game.i18n?.localize(`midi-qol.EntryEditor.Activity.Basics.Trigger.${key}`) ?? key;
    const condition = (act: object) => ((act as typeof a).useConditionText ?? "").trim();
    const read = (act: object) => {
      if (!condition(act)) return "";
      return LEADING_TRIGGER.exec(condition(act))?.[1] ?? "custom";
    };
    return [{
      id: "midi-qol.reactionTrigger", label: game.i18n?.localize("midi-qol.EntryEditor.Activity.Basics.Trigger.Label") ?? "Reaction trigger", type: "select",
      options: [{ value: "", label: say("isHit") }, ...REACTION_TRIGGERS.filter(t => t !== "isHit").map(value => ({ value, label: say(value) })),
        ...(read(activity) === "custom" ? [{ value: "custom", label: say("custom") }] : [])],
      read,
      text: value => value === "custom" ? say("customText") : game.i18n?.format("midi-qol.EntryEditor.Activity.Basics.Trigger.Text", { when: say(String(value || "isHit")) }),
      // The trigger changed, the rest of the condition kept (Counterspell's components)
      update: (value, act) => {
        if (value === "custom") return {};
        const rest = LEADING_TRIGGER.exec(condition(act))?.[2]?.trim() ?? "";
        return { activity: { "useConditionText": value ? `reaction === "${String(value)}"${rest ? ` ${rest}` : ""}` : "" } };
      }
    }];
  }
};

/** midi's own contributors: dnd5e's lists and statuses, and the activity card for any type */
export function registerMidiEditorContributors() {
  register("effectPresets", "midi-qol.effects", { presets: () => MIDI_EFFECT_PRESETS }, { label: "Midi-QOL: common effects" });
  register("entryOptions", "midi-qol.lists", {
    lists: () => {
      const dnd5e = CONFIG.DND5E as unknown as Record<string, Record<string, { label?: string } | string> | undefined>;
      const lists: Record<string, FieldOption[]> = {};
      for (const [name, key] of Object.entries(CONFIG_LISTS))
        lists[name] = Object.entries(dnd5e[key] ?? {}).map(([value, data]) => ({ value, label: game.i18n?.localize(typeof data === "string" ? data : data.label ?? value) ?? value }));
      // A macro to run: the item's or activity's own, or a world macro
      lists.macros = [{ value: "ItemMacro", label: game.i18n?.localize("midi-qol.Entries.Macro.item") ?? "ItemMacro" },
        { value: "ActivityMacro", label: game.i18n?.localize("midi-qol.Entries.Macro.activity") ?? "ActivityMacro" },
        ...[...(game.macros ?? [])].filter(m => m.type === "script").map(m => ({ value: m.name, label: m.name })).sort((a, b) => a.label.localeCompare(b.label))];
      lists.statuses = CONFIG.statusEffects.filter(s => s.id).map(s => ({ value: s.id, label: game.i18n?.localize(s.name ?? s.id) ?? s.id }));
      return lists;
    }
  }, { label: "Midi-QOL: dnd5e's lists" });
  register("activityCards", "midi-qol.activities", { types: ["*"], card: activityCard }, { label: "Midi-QOL: activities" });
  register("basicsFields", "midi-qol.reactionTrigger", reactionTriggerField, { label: "Midi-QOL: reaction triggers" });
}
