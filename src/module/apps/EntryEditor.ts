import { i18n, MODULE_ID } from "../../midi-qol.js";
import { actionKeyOf, actionProblems, actionSchema, entryChecks, registeredActionKeys, registeredEvents, type ActionField } from "../lib/entries/engine.js";
import type { Entry, EntryAction, EntryHome, EntryWho } from "../lib/entries/types.js";
import { conditionPresets, entrySentence, triggerGroups } from "../lib/entries/sentences.js";
import { recipe, recipesFor } from "../lib/entries/recipes.js";
import { activityOvertimeEntries, overtimeEntries } from "../lib/entries/overtime.js";
import { ACTIVITY_REF } from "../lib/entries/activityActions.js";
import { ConditionEditor } from "./ConditionEditor.js";
import { activityCardContributor, addKindDefs, basicsFieldDefs, contributedActivityCard, effectPresetDefs, optionList, targetPresetDefs, type BasicsFieldDef } from "../lib/entries/editorServices.js";
import { automationNotes } from "../lib/entries/automations.js";
import { configOptions, type ConfigField } from "../lib/entries/config.js";
import { effectAction, mainBranch, newEffectData, type NewEffect } from "../lib/entries/activityCard.js";
import { configSettings, onUseMacroOptions } from "../settings.js";
import { onUseString, parseOnUse, type OnUseRow } from "../lib/entries/activityCard.js";
import { basicsUpdate, NEW_KINDS, newActivityData, type Basics, type BasicsWhere, type NewKind } from "../lib/entries/activityCard.js";
import { AREA_TRIGGERS, areaGroups, areaSaveActivity, areaView, editedRegion, type AreaGroup } from "../lib/entries/activityCard.js";
import { editedWeapon, SEEN_PRESETS, weaponUpdate, type DamagePart } from "../lib/entries/activityCard.js";
import { convertActivity, editedTargeting, FROM_YOU_SHAPES, moveBranchEntry, POINT_SHAPES, ROLL_KINDS, TARGET_PRESETS, targetingUpdate, targetPreset, type RollKind, type TargetPreset, type Targeting } from "../lib/entries/activityCard.js";
import { activityCard, activityUpdate, BRANCH_EVENT, branchEntryId, isBranchEntry, partFormula, type ActivityBranch, type ActivityData, type BuiltInPart, type CardEdits, type CardText } from "../lib/entries/activityCard.js";

/*
 * M32d (plan ~/Documents/midi-next-M32-plan-2026-11-22.md): the entry editor. A document's entries (an activity's
 * `midiEntries`, an item's or effect's `flags.midi-qol.entries`) in a list; the selected one as a form for its own
 * fields, its actions and `choose` as JSON (checked as they are typed: an action naming no registered action is
 * flagged), or the whole entry as JSON. Saved only when every entry is valid.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** An activity, item or effect: what the editor reads and writes (method-style update, so a document's own fits) */
interface EntryDocument {
  uuid: string | null;
  name?: string | null;
  isOwner?: boolean;
  update(data: object): Promise<unknown>;
  getFlag?(scope: string, key: string): unknown;
}
/** The same entries three ways: read as sentences, as a form, as JSON */
type View = "sentence" | "form" | "json";
const VIEWS: readonly View[] = ["sentence", "form", "json"];
/**
 * One document of the window: the item, one of its activities or one of its effects. `stored`: its entries as they
 * were read (only a changed home is written); an activity's `choices`: its midiChoices as JSON.
 */
type Home = { document: EntryDocument, kind: EntryHome, label: string, runByArea?: boolean, drafts: Draft[], stored: string, choices?: string, choicesStored?: string, choicesProblem?: string, card?: CardEdits, cardValues?: Record<string, unknown>,
  /** The item's automation settings: the owner's values and the fields (JSON) as edited, and as read */
  settings?: { values: Record<string, unknown>, stored: string, spec: string, specStored: string, problem?: string },
  /** An effect's changes as edited (key, type, value; their other fields kept), where they are stored, and as read */
  changes?: { rows: Record<string, unknown>[], path: string, stored: string } };
type Draft = { entry: Entry, raw: { do: string, choose: string, json?: string }, problems: string[] };

const NEAR = "near";
/** Actions whose then / else run on their roll's result */
const BRANCHING = new Set(["save", "check"]);
/** Every card's own condition */
const CONDITION_FIELD: ActionField = { path: "if", label: "midi-qol.EntryEditor.Field.if", type: "condition" };
/** Events that mean something only on an effect (its ending, its origin's turn) */
const EFFECT_ONLY = new Set(["ended", "originTurnStart", "originTurnEnd"]);

type TableRowData = { range?: number[], label?: string, do?: EntryAction[] } & Record<string, unknown>;
/** A table action's rows (its inline rows; none for a world table) */
function rowsOf(action: unknown): TableRowData[] | undefined {
  const rows = getByPath(action, "table.rows");
  return Array.isArray(rows) ? rows as TableRowData[] : undefined;
}

/** An action by its card path (`0`, `0_then_1`, a table row's `0_row2_1`): the list it is in and its index */
function locateAction(root: EntryAction[], path: string): { list: EntryAction[], index: number } | undefined {
  const parts = path.split("_");
  let list = root;
  let index = Number(parts[0]);
  for (let i = 1; i < parts.length; i += 2) {
    const row = /^row(\d+)$/.exec(parts[i]);
    const nested = row ? rowsOf(list[index])?.[Number(row[1])]?.do : (list[index] as Record<string, unknown> | undefined)?.[parts[i]];
    if (!Array.isArray(nested)) return undefined;
    list = nested as EntryAction[];
    index = Number(parts[i + 1]);
  }
  return Number.isInteger(index) && list[index] !== undefined ? { list, index } : undefined;
}
const WHO_CHOICES = ["", "this", "owner", "bearer", "origin", NEAR];

/** A select's value for a stored value none of its options is; an effectRef's "everything this item applied" */
const CUSTOM = "__custom__";
const APPLIED = "__applied__";
/** Field types whose widget is a text box: a value they can't show is its JSON there */
const TEXT_TYPES = new Set<ActionField["type"]>(["string", "formula", "condition", "number", "list", "pairs"]);
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isPrimitive = (v: unknown) => ["string", "number", "boolean"].includes(typeof v);
type FieldOption = { value: string, label: string };

/** How a stored value shows in its field's widget: the widget's value; `custom` when the widget can't show it */
function shownValue(field: ActionField, value: unknown, options: readonly FieldOption[] = []): { text: string | boolean, custom: boolean } {
  const plain = (text: string | boolean) => ({ text, custom: false });
  const custom = () => ({ text: TEXT_TYPES.has(field.type) ? JSON.stringify(value) : CUSTOM, custom: true });
  if (value === undefined || value === null) return plain(field.type === "boolean" ? false : "");
  switch (field.type) {
    case "boolean": return plain(!!value);
    case "number": return typeof value === "number" ? plain(String(value)) : custom();
    case "list": return [value].flat().every(isPrimitive) ? plain([value].flat().join(", ")) : custom();
    case "pairs": return isPlain(value) && Object.values(value).every(isPrimitive)
      ? plain(Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(", ")) : custom();
    case "tristate": return typeof value === "boolean" ? plain(String(value)) : custom();
    case "effectRef":
      if (isPlain(value) && "origin" in value) return plain(APPLIED);
      return typeof value === "string" && options.some(o => o.value === value) ? plain(value) : custom();
    case "select":
    case "activity":
      return typeof value === "string" && (value === "" || options.some(o => o.value === value)) ? plain(value) : custom();
    default: return typeof value === "string" || typeof value === "number" ? plain(String(value)) : custom();
  }
}

/** A widget's text read back as the field's value (undefined: nothing) */
function parsedValue(field: ActionField, text: string, wasCustom: boolean): unknown {
  // "+1" stays text: a signed number adds, a plain one sets (state)
  const numeric = (v: string): unknown => field.numeric && Number.isNumeric(v) && !/^[+-]/.test(v.trim()) ? Number(v) : v;
  if (wasCustom && TEXT_TYPES.has(field.type)) {
    try { return JSON.parse(text); } catch { /* typed over: read as the field's own kind */ }
  }
  switch (field.type) {
    case "number": return text.trim() === "" || Number.isNaN(Number(text)) ? undefined : Number(text);
    case "list": return text.split(",").map(v => v.trim()).filter(Boolean);
    case "pairs": {
      const pairs: Record<string, unknown> = {};
      for (const part of text.split(",")) {
        const at = part.indexOf(":");
        const name = at > 0 ? part.slice(0, at).trim() : "";
        if (name) pairs[name] = numeric(part.slice(at + 1).trim());
      }
      return pairs;
    }
    case "tristate": return text === "true" ? true : text === "false" ? false : undefined;
    case "effectRef": return text === APPLIED ? { origin: "this item" } : text || undefined;
    default: return text === "" ? undefined : numeric(text);
  }
}

/** A value by path; undefined through anything that isn't an object (a `cover` level has no `ignore`) */
function getByPath(target: unknown, path: string): unknown {
  let at = target;
  for (const part of path.split(".")) {
    if (!isPlain(at)) return undefined;
    at = at[part];
  }
  return at;
}

function deleteByPath(target: Record<string, unknown>, path: string) {
  const parts = path.split(".");
  const parent = parts.length > 1 ? getByPath(target, parts.slice(0, -1).join(".")) : target;
  if (isPlain(parent)) delete parent[parts.at(-1)!];
}

/** Sets a value by path, making an object of anything on the way that isn't one (a `cover` level given an `ignore`) */
function setByPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let at = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlain(at[part])) at[part] = {};
    at = at[part] as Record<string, unknown>;
  }
  at[parts.at(-1)!] = value;
}

/** An effect's changes as stored, and where (dnd5e 6 / Foundry 14: system.changes; before: changes) */
function changesOf(effect: ActiveEffect.Implementation): { rows: Record<string, unknown>[], path: string, stored: string } {
  const source = effect._source as { system?: { changes?: unknown[] }, changes?: unknown[] };
  const path = Array.isArray(source.system?.changes) ? "system.changes" : "changes";
  const rows = foundry.utils.deepClone((path === "system.changes" ? source.system!.changes : source.changes) ?? []) as Record<string, unknown>[];
  return { rows, path, stored: JSON.stringify(rows) };
}

const CHANGE_MODES: Record<string, string> = { "0": "custom", "1": "×", "2": "+", "3": "≤", "4": "≥", "5": "=", custom: "custom", multiply: "×", add: "+", downgrade: "≤", upgrade: "≥", override: "=" };

/** What an effect does while it lasts: its statuses, its changes, how long */
export function effectSummary(document: unknown): { statuses: string, changes: string[], duration: string } | undefined {
  if (!(document instanceof ActiveEffect)) return undefined;
  const effect = document as ActiveEffect.Implementation & { system?: { changes?: unknown[] }, duration?: { label?: string } };
  const statuses = [...effect.statuses].map(id => {
    const status = CONFIG.statusEffects.find(s => s.id === id);
    return status?.name ? i18n(status.name) : id;
  }).join(", ");
  const raw = (effect.system?.changes ?? (effect as { changes?: unknown[] }).changes ?? []) as { key?: string, mode?: number, type?: string, value?: unknown }[];
  const changes = raw.filter(c => c.key).map(c => `${c.key!.replace(/^system\./, "")} ${CHANGE_MODES[String(c.type ?? c.mode ?? "2")] ?? ""} ${String(c.value ?? "")}`.replace(/\s+/g, " ").trim());
  // Only an effect that has a duration says how long ("None" says nothing)
  const lasting = effect._source.duration as { value?: number | null, rounds?: number | null, seconds?: number | null, turns?: number | null } | undefined;
  const duration = lasting?.value || lasting?.rounds || lasting?.seconds || lasting?.turns ? effect.duration?.label ?? "" : "";
  return statuses || changes.length || duration ? { statuses, changes, duration } : undefined;
}

/** The part of an entry a sentence chip edits: who, its condition, its choice, or one action (by its card's path) */
function onlyPart(focus: string): string | undefined {
  if (["who", "if", "choose"].includes(focus)) return focus;
  const action = /^act\.([^.]+)\./.exec(focus);
  return action ? `action:${action[1]}` : undefined;
}

/** Of a card's fields, the ones a chip edits (its data-field): what its in-place editor shows */
function chipFields(fields: Record<string, unknown>, field: string): Record<string, unknown> {
  if ("contributed" in fields) return { contributed: fields.contributed };
  // What happens to the target: the roll, and that roll's own fields
  if (field === "roll") return { roll: fields.roll, save: fields.save, check: fields.check };
  if (field === "target") return { target: fields.target };
  if (field === "newEffect") return { newEffect: fields.newEffect };
  if (field === "area") return { area: fields.area };
  if (field === "basics") return { basics: fields.basics };
  if (field === "weapon") return { weapon: fields.weapon };
  if (field.startsWith("onuse.")) return { onUse: fields.onUse };
  if (field.startsWith("area.")) return { areaGroup: fields.areaGroup };
  if (field === "save") return { save: fields.save };
  if (field === "dc") return fields.save ? { save: fields.save } : { check: fields.check };
  if (field === "check") return { check: fields.check };
  if (field === "healing") return { healing: fields.healing };
  const part = /^part\.(\d+)$/.exec(field);
  if (part) {
    const row = (fields.parts as { i: number }[] | undefined)?.find(p => p.i === Number(part[1]));
    return row ? { parts: [row] } : { empty: true };
  }
  const effect = /^effect\.(.+)$/.exec(field);
  if (effect) {
    const row = (fields.effects as { id: string }[] | undefined)?.find(e => e.id === effect[1]);
    return row ? { effects: [{ ...row, removable: true }] } : { empty: true };
  }
  return { empty: true };
}

/** The card field a built-in part edits (its chip's data-field) */
function cardFieldName(part: string): string {
  if (part.startsWith("part.")) return `card.${part}.formula`;
  if (part.startsWith("effect.")) return `card.${part}`;
  const named: Record<string, string> = { target: "target.preset", roll: "rollKind", save: "saveAbility", check: "checkAbility", dc: "dcCalculation", healing: "healing.formula" };
  return `card.${named[part] ?? part}`;
}

/** Whether the user may edit a document's entries: GMs; its owners when the world allows players */
export function canEditEntries(document: { isOwner?: boolean } | null | undefined): boolean {
  if (!document) return false;
  return !!game.user?.isGM || (!!document.isOwner && !!game.settings.get(MODULE_ID, "EntryEditorPlayers"));
}
const OFFERS = ["", "always", "ask", "reaction", "toggle"];
const LIMITS = ["", "turn", "round", "use", "effect"];

/** Whether a document keeps its entries in `midiEntries` (an activity), else in its midi flags */
function isActivity(document: EntryDocument): document is EntryDocument & { midiEntries?: unknown[], item?: Item.Implementation } {
  return "midiEntries" in document || (document as { documentName?: string }).documentName === "Activity";
}

export function entriesOfDocument(document: EntryDocument): Entry[] {
  const list = isActivity(document) ? document.midiEntries : document.getFlag?.(MODULE_ID, "entries");
  return Array.isArray(list) ? foundry.utils.deepClone(list) as Entry[] : [];
}

export class EntryEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The item's documents that can hold entries (or the one document, for an effect on an actor) */
  #homes: Home[] = [];
  /** The home being edited */
  #at = 0;
  #root: Item.Implementation | undefined;
  #selected = 0;
  /** Sentence view: each entry's last recorded run is shown */
  #showRuns = false;
  /** Saved: closing needs no question */
  #saved = false;
  /** Sentence view: the selected entry's form is open under its sentence */
  #expanded = false;
  /** The home whose recipes are shown (sentence view) */
  #recipes: number | undefined;
  #view: View;
  /** The entry whose trigger picker is open (sentence view) */
  #picker: number | undefined;
  /** A field to put the cursor in after the next render (a sentence's part clicked) */
  #focus: string | undefined;
  /** Sentence view: the part of the open entry a chip opened (who, if, choose, action:<path>); the rest is hidden */
  #only: string | undefined;
  /** The activity home whose card's fields are open */
  #cardOpen: number | undefined;
  /** Which of them: a chip's field shown in place, under the line it is on ("all": the whole block) */
  #cardField: string | undefined;
  #cardPlace: string | undefined;
  /** The item's on-use macros as edited (every activity's use runs them) */
  #onUse: { rows: OnUseRow[], stored: string } | undefined;
  /** "+ add what it does" open */
  #addWhatOpen = false;
  /** The "+ effect" form as filled in so far */
  #effectForm: { what: string, name: string, duration: string, units: string, repeat: boolean, param: string } = { what: "", name: "", duration: "", units: "", repeat: false, param: "" };

  /** `options.view`: the view to open in (else the user's last) */
  constructor(document: EntryDocument, options: { view?: View } & Record<string, unknown> = {}) {
    const { view, ...rest } = options;
    super(rest);
    const parent = (document as { parent?: unknown }).parent;
    this.#root = isActivity(document) ? document.item : document instanceof Item ? document as Item.Implementation
      : parent instanceof Item ? parent as Item.Implementation : undefined;
    const root = this.#root;
    const activities = [...((root?.system as { activities?: Iterable<EntryDocument> } | undefined)?.activities ?? [])];
    const documents: EntryDocument[] = root ? [root as unknown as EntryDocument, ...activities, ...[...root.effects] as unknown as EntryDocument[]] : [document];
    const same = (a: EntryDocument, b: EntryDocument) => a === b || (!!a.uuid && a.uuid === b.uuid);
    if (!documents.some(d => same(d, document))) documents.push(document);
    this.#homes = documents.map(d => {
      const kind: EntryHome = isActivity(d) ? "activity" : d instanceof ActiveEffect ? "effect" : "item";
      const entries = entriesOfDocument(d);
      const choices = kind === "activity" ? JSON.stringify((d as { midiChoices?: unknown[] }).midiChoices ?? [], null, 2) : undefined;
      const values = kind === "item" ? foundry.utils.deepClone((d.getFlag?.(MODULE_ID, "config") ?? {}) as Record<string, unknown>) : undefined;
      const spec = kind === "item" ? JSON.stringify(d.getFlag?.(MODULE_ID, "configSpec") ?? [], null, 2) : undefined;
      const home: Home = {
        document: d, kind, stored: JSON.stringify(entries), choices, choicesStored: choices, ...(kind === "activity" ? { card: {} } : {}),
        ...(values && spec !== undefined ? { settings: { values, stored: JSON.stringify(values), spec, specStored: spec } } : {}),
        ...(d instanceof ActiveEffect ? { changes: changesOf(d) } : {}),
        label: kind === "item" ? i18n("midi-qol.EntryEditor.Home.item") : game.i18n?.format(`midi-qol.EntryEditor.Home.${kind}`, { name: d.name ?? "" }) ?? d.name ?? "",
        drafts: entries.map(entry => ({ entry, raw: { do: JSON.stringify(entry.do ?? [], null, 2), choose: entry.choose ? JSON.stringify(entry.choose, null, 2) : "" }, problems: [] }))
      };
      for (const draft of home.drafts) draft.problems = this.#problemsOf(draft, home.drafts);
      return home;
    });
    if (root) {
      const stored = String(foundry.utils.getProperty(root, "_source.flags.midi-qol.onUseMacroName") ?? "");
      this.#onUse = { rows: parseOnUse(stored), stored: onUseString(parseOnUse(stored)) };
    }
    // An activity another one's area runs is titled by that (the author never made it to be used on its own)
    type AreaOwner = { regionBehavior?: { enabled?: boolean, rules?: { action: string, targetId: string }[] } };
    const runByArea = new Set(activities.flatMap(a => {
      const rb = (a as AreaOwner).regionBehavior;
      return rb?.enabled ? (rb.rules ?? []).filter(r => r.action === "useActivity").map(r => r.targetId) : [];
    }));
    // Activities are titled by what they do, named by their own name or, when they have none, the item's
    for (const home of this.#homes) {
      if (home.kind !== "activity") continue;
      const a = home.document as { id?: string | null, identifier?: string, name?: string | null, _source?: { name?: string } };
      const name = a._source?.name || root?.name || a.name || "";
      home.runByArea = runByArea.has(a.id ?? "") || runByArea.has(a.identifier ?? "");
      home.label = game.i18n?.format(home.runByArea ? "midi-qol.EntryEditor.Home.activityRunByArea" : "midi-qol.EntryEditor.Home.activity", { name }) ?? home.label;
    }
    this.#at = Math.max(0, this.#homes.findIndex(home => same(home.document, document)));
    const last = game.settings.get(MODULE_ID, "EntryEditorView") as View;
    this.#view = view ?? (VIEWS.includes(last) ? last : "sentence");
  }

  get #jsonView() { return this.#view === "json"; }

  /** Whether anything differs from what was read */
  #dirty(): boolean {
    return this.#homes.some(h => h.choices !== h.choicesStored || JSON.stringify(h.drafts.map(d => this.#entryForSave(d))) !== h.stored
      || Object.keys(this.#cardUpdate(h)).length > 0
      || (!!h.settings && (JSON.stringify(h.settings.values) !== h.settings.stored || h.settings.spec !== h.settings.specStored))
      || (!!h.changes && JSON.stringify(h.changes.rows) !== h.changes.stored)
      || (!!h.card?.target && (Object.keys(this.#targetingUpdates(h).activity).length > 0 || Object.keys(this.#targetingUpdates(h).item).length > 0))
      || (!!h.card?.area && Object.keys(this.#areaUpdates(h).activity).length > 0)
      || ((!!h.card?.basics || !!h.card?.basicsExtra) && (Object.keys(this.#basicsUpdates(h).activity).length > 0 || Object.keys(this.#basicsUpdates(h).item).length > 0)))
      || (!!this.#onUse && onUseString(this.#onUse.rows) !== this.#onUse.stored)
      || this.#homes.some(h => Object.keys(this.#weaponUpdates(h)).length > 0);
  }

  /** Closing with unsaved changes asks first (`options.discard`: no question) */
  async close(options: Record<string, unknown> = {}) {
    if (!this.#saved && !options.discard && this.#dirty()) {
      const discard = await foundry.applications.api.DialogV2.confirm({
        window: { title: i18n("midi-qol.EntryEditor.Unsaved.Title") },
        content: `<p>${foundry.utils.escapeHTML(i18n("midi-qol.EntryEditor.Unsaved.Content"))}</p>`,
        rejectClose: false
      });
      if (!discard) return this;
    }
    return super.close(options);
  }

  get #document(): EntryDocument { return this.#homes[this.#at].document; }
  get #drafts(): Draft[] { return this.#homes[this.#at].drafts; }

  #home(): EntryHome {
    return this.#homes[this.#at].kind;
  }

  /** A button's home (`data-home`) becomes the home being edited */
  #goHome(target: HTMLElement) {
    const at = Number(target.dataset.home ?? this.#at);
    if (!this.#homes[at] || at === this.#at) return;
    this.#at = at;
    this.#selected = 0;
    this.#picker = undefined;
    this.#expanded = false;
  }

  static DEFAULT_OPTIONS = {
    tag: "form" as const,
    classes: ["midi-qol", "midi-qol-entry-editor"],
    window: { title: "midi-qol.EntryEditor.Title", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 760, height: 640 },
    form: { submitOnChange: true, closeOnSubmit: false, handler: EntryEditor.#onChange },
    actions: {
      select: EntryEditor.#onSelect,
      add: EntryEditor.#onAdd,
      remove: EntryEditor.#onRemove,
      addAction: EntryEditor.#onAddAction,
      removeAction: EntryEditor.#onRemoveAction,
      moveAction: EntryEditor.#onMoveAction,
      addBranch: EntryEditor.#onAddBranch,
      moveEntry: EntryEditor.#onMoveEntry,
      editCondition: EntryEditor.#onEditCondition,
      setView: EntryEditor.#onSetView,
      focusPart: EntryEditor.#onFocusPart,
      editEntry: EntryEditor.#onEditEntry,
      setTrigger: EntryEditor.#onSetTrigger,
      closePicker: EntryEditor.#onClosePicker,
      showRecipes: EntryEditor.#onShowRecipes,
      addRow: EntryEditor.#onAddRow,
      removeRow: EntryEditor.#onRemoveRow,
      addRowAction: EntryEditor.#onAddRowAction,
      showRuns: EntryEditor.#onShowRuns,
      useRecipe: EntryEditor.#onUseRecipe,
      toggleAddWhat: EntryEditor.#onToggleAddWhat,
      addWhat: EntryEditor.#onAddWhat,
      editActivity: EntryEditor.#onEditActivity,
      allEntryFields: EntryEditor.#onAllEntryFields,
      doneEntryPart: EntryEditor.#onDoneEntryPart,
      closeActivityField: EntryEditor.#onCloseActivityField,
      addToBranch: EntryEditor.#onAddToBranch,
      addDamagePart: EntryEditor.#onAddDamagePart,
      addChange: EntryEditor.#onAddChange,
      addAreaGroup: EntryEditor.#onAddAreaGroup,
      addOnUse: EntryEditor.#onAddOnUse,
      removeOnUse: EntryEditor.#onRemoveOnUse,
      removeAreaGroup: EntryEditor.#onRemoveAreaGroup,
      confirmEffect: EntryEditor.#onConfirmEffect,
      removeEffect: EntryEditor.#onRemoveEffect,
      removeChange: EntryEditor.#onRemoveChange,
      openEffectSheet: EntryEditor.#onOpenEffectSheet,
      editEffect: EntryEditor.#onEditEffect,
      openActivitySheet: EntryEditor.#onOpenActivitySheet,
      save: EntryEditor.#onSave
    }
  };

  static PARTS = {
    editor: { template: "modules/midi-qol/templates/apps/EntryEditor/entryEditor.hbs", scrollable: [".midi-qol-entry-sentences", ".midi-qol-entry-list", ".midi-qol-entry-form"] }
  };

  get title() {
    return `${i18n("midi-qol.EntryEditor.Title")}: ${this.#root?.name ?? this.#document.name ?? ""}`;
  }

  #draftOf(entry: Entry): Draft {
    const draft: Draft = { entry, raw: { do: JSON.stringify(entry.do ?? [], null, 2), choose: entry.choose ? JSON.stringify(entry.choose, null, 2) : "" }, problems: [] };
    draft.problems = this.#problemsOf(draft);
    return draft;
  }

  #problemsOf(draft: Draft, drafts: Draft[] = this.#drafts): string[] {
    const problems: string[] = [];
    const entry = draft.entry;
    if (!entry.id?.trim()) problems.push(i18n("midi-qol.EntryEditor.Problem.Id"));
    if (drafts.some(other => other !== draft && other.entry.id === entry.id)) problems.push(i18n("midi-qol.EntryEditor.Problem.DuplicateId"));
    const known = new Set(registeredEvents().map(e => e.id));
    const on = Array.isArray(entry.on) ? entry.on : entry.on ? [entry.on] : [];
    if (!on.length) problems.push(i18n("midi-qol.EntryEditor.Problem.Event"));
    for (const id of on) if (!known.has(id)) problems.push(game.i18n?.format("midi-qol.EntryEditor.Problem.UnknownEvent", { id }) ?? id);
    try { problems.push(...actionProblems(JSON.parse(draft.raw.do || "[]"))); }
    catch (err) { problems.push(`do: ${(err as Error).message}`); }
    if (draft.raw.choose.trim()) {
      try { JSON.parse(draft.raw.choose); } catch (err) { problems.push(`choose: ${(err as Error).message}`); }
    }
    return problems;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const draft = this.#drafts[this.#selected];
    const entry = draft?.entry;
    const events = registeredEvents().sort((a, b) => a.id.localeCompare(b.id));
    const on = entry ? (Array.isArray(entry.on) ? entry.on : [entry.on]) : [];
    const unknownEvents = on.filter(id => !events.some(e => e.id === id));
    const who = entry?.who;
    const near = isPlain(who) && "within" in who ? who as Extract<EntryWho, { within: unknown }> : undefined;
    // A list (an action's takers) or anything else the select can't show: kept, edited as JSON
    const whoCustom = who !== undefined && typeof who !== "string" && !near;
    const option = (value: string, prefix: string, selected: unknown) => ({ value, label: value ? i18n(`midi-qol.EntryEditor.${prefix}.${value}`) : i18n("midi-qol.EntryEditor.Default"), selected: value === (selected ?? "") });
    const item = this.#item();
    const home = this.#homes[this.#at];
    const activities = [...((item?.system as { activities?: Iterable<{ id: string, name?: string }> } | undefined)?.activities ?? [])];
    return {
      ...context,
      list: this.#homes.map((h, at) => ({
        label: h.label, home: at, active: at === this.#at, single: this.#homes.length === 1,
        entries: h.drafts.map((d, index) => {
          // A branch's actions are listed by the branch they belong to
          const branch = h.card ? isBranchEntry(this.#entryForSave(d)) : undefined;
          return { index, home: at, id: branch ? i18n(`midi-qol.EntryEditor.ActivityBranch.${branch}`) : d.entry.id || "?",
            on: branch ? i18n("midi-qol.EntryEditor.Activity.BranchList") : [d.entry.on].flat().join(", "), selected: at === this.#at && index === this.#selected,
          invalid: d.problems.length > 0, first: index === 0, last: index === h.drafts.length - 1 };
        })
      })),
      homeLabel: this.#homes.length > 1 ? home.label : undefined,
      activityCard: this.#view === "form" && home.card ? this.#cardContext(home, this.#at) : undefined,
      automations: this.#view === "form" ? this.#automations(home) : undefined,
      settings: this.#view === "form" ? this.#settingsContext(home, true) : undefined,
      effectEditor: this.#view === "form" && home.changes ? this.#effectEditorContext(home) : undefined,
      homeChoices: this.#view === "form" ? home.choices : undefined,
      homeChoicesProblem: home.choicesProblem,
      ifPresets: conditionPresets(),
      hasEntry: !!entry,
      jsonView: this.#jsonView,
      sentenceView: this.#view === "sentence",
      addWhat: this.#root ? { open: this.#addWhatOpen, kinds: [...NEW_KINDS.map(k => ({ value: k,
        label: i18n(`midi-qol.EntryEditor.AddWhat.${k}`), hint: i18n(`midi-qol.EntryEditor.AddWhat.${k}Hint`) })),
        ...(this.#addWhatOpen ? addKindDefs(this.#root).map(def => ({ value: `x:${def.id}`, label: i18n(def.label), hint: def.hint ? i18n(def.hint) : "" })) : [])] } : undefined,
      showRuns: this.#showRuns,
      views: VIEWS.map(value => ({ value, label: i18n(`midi-qol.EntryEditor.View.${value}`), active: value === this.#view })),
      sentences: this.#view === "sentence" ? this.#sentences() : undefined,
      json: draft ? draft.raw.json ?? JSON.stringify(this.#entryForSave(draft), null, 2) : "",
      entry,
      events: [...events.map(e => ({ value: e.id, label: `${e.label} (${e.id})${EFFECT_ONLY.has(e.id) ? ` ${i18n("midi-qol.EntryEditor.EffectsOnly")}` : ""}`, selected: on.includes(e.id) })),
        ...unknownEvents.map(id => ({ value: id, label: `${id} ?`, selected: true }))],
      who: [...WHO_CHOICES, ...(whoCustom ? [CUSTOM] : [])].map(value => value === CUSTOM
        ? { value, label: i18n("midi-qol.EntryEditor.Custom"), selected: true }
        : option(value, "Who", whoCustom ? CUSTOM : near ? NEAR : typeof who === "string" ? who : "")),
      whoJson: whoCustom ? JSON.stringify(who) : undefined,
      near: near ? { within: near.within, of: near.of, filter: near.filter ?? "" } : undefined,
      offers: OFFERS.map(value => option(value, "Offer", entry?.offer)),
      limits: LIMITS.map(value => option(value, "Limit", entry?.limit?.per)),
      activities: [{ value: "", label: i18n("midi-qol.EntryEditor.Default"), selected: !entry?.activity },
        ...activities.map(a => ({ value: a.id, label: a.name ?? a.id, selected: a.id === entry?.activity }))],
      rawDo: draft?.raw.do ?? "",
      // A chip's part: only its action card shown (the others stay in the form, hidden, so they are read back unchanged)
      actionCards: draft ? this.#actionCards(draft)?.map(card => ({ ...card,
        focusHidden: !!this.#only && this.#only !== `action:${(card as { path?: string }).path}` })) : undefined,
      only: this.#view === "sentence" ? this.#only : undefined,
      onlyAction: this.#view === "sentence" && !!this.#only?.startsWith("action:"),
      // An empty list is falsy in Handlebars: whether the list parsed
      cardsShown: !!draft && this.#actionsOf(draft) !== undefined,
      rawChoose: draft?.raw.choose ?? "",
      problems: draft?.problems ?? [],
      // Not wrong, but likely a mistake: an effect-only event on an item or activity
      warnings: this.#document instanceof ActiveEffect ? [] : on.filter(id => EFFECT_ONLY.has(id))
        .map(id => game.i18n?.format("midi-qol.EntryEditor.Warning.EffectOnly", { id }) ?? id),
      overtime: this.#overtimeShown(),
      canSave: this.#homes.every(h => !h.choicesProblem && !h.settings?.problem && h.drafts.every(d => !d.problems.length))
    };
  }

  /** Every home's entries as sentences, each part naming its home, its entry and the form field that edits it */
  #sentences() {
    const activities = [...((this.#item()?.system as { activities?: Iterable<{ id: string, name?: string }> } | undefined)?.activities ?? [])];
    const registered = registeredEvents().map(e => e.id);
    const checks = this.#showRuns ? entryChecks() : [];
    const eventLabels = new Map(registeredEvents().map(e => [e.id, e.label]));
    const rootUuid = this.#root?.uuid;
    /** The entry's latest check: on the document itself, or on an applied copy of this item's effect */
    const lastRun = (h: Home, id: string): string | undefined => {
      if (!this.#showRuns) return undefined;
      const check = checks.findLast(c => c.entry === id && (c.document === h.document.uuid
        || (h.kind === "effect" && !!rootUuid && c.name === h.document.name && !!c.origin?.startsWith(rootUuid))));
      if (!check) return i18n("midi-qol.EntryEditor.Run.none");
      return game.i18n?.format(`midi-qol.EntryEditor.Run.${check.outcome}`, {
        time: new Date(check.at).toLocaleTimeString(), event: eventLabels.get(check.event) ?? check.event,
        actions: (check.actions ?? []).map(key => actionSchema(key).label).join(", ") || "—"
      });
    };
    return this.#homes.map((h, at) => {
      const kind = h.kind;
      let choices: { id?: string, label?: string, kind?: string }[] = [];
      try { choices = h.choices ? JSON.parse(h.choices) : []; } catch { /* shown as a problem in the form */ }
      return {
        home: at, label: h.label, single: this.#homes.length === 1, effect: kind === "effect",
        choices: (Array.isArray(choices) ? choices : []).map(c => game.i18n?.format("midi-qol.EntryEditor.ChoiceLine", { label: c.label ?? c.id ?? "?", kind: c.kind ?? "?" }) ?? ""),
        recipes: this.#recipes === at ? recipesFor(kind).map(r => ({ id: r.id, home: at, label: i18n(`midi-qol.Recipe.${r.id}.Label`), hint: i18n(`midi-qol.Recipe.${r.id}.Hint`) })) : undefined,
        card: h.card ? this.#cardContext(h, at) : undefined,
        effectSummary: h.kind === "effect" ? effectSummary(h.document) : undefined,
        settings: this.#settingsContext(h, false),
        automations: this.#automations(h),
        sentences: h.drafts.map((draft, index) => {
          const entry = this.#entryForSave(draft);
          const sentence = entrySentence(entry, { home: kind, activities });
          const on = [entry.on ?? []].flat();
          const who = typeof entry.who === "string" ? entry.who : undefined;
          return {
            index, home: at, number: index + 1, problems: draft.problems, options: sentence.options,
            expanded: this.#expanded && this.#at === at && this.#selected === index,
            run: lastRun(h, entry.id),
            lines: sentence.lines.map(line => ({ indent: line.indent * 22, parts: line.parts.map(part => ({ ...part, index, home: at })) })),
            picker: this.#at === at && this.#picker === index ? triggerGroups(kind, registered).map(group => ({
              label: group.label,
              choices: group.choices.map(choice => ({ ...choice, index, home: at, setsWho: choice.who !== undefined,
                selected: on.includes(choice.event) && (choice.who === undefined || (who ?? (kind === "effect" ? "bearer" : "this")) === choice.who) }))
            })) : undefined
          };
        }).filter((_sentence, index) => !(h.card && isBranchEntry(this.#entryForSave(h.drafts[index]))))
      };
    });
  }

  /**
   * Other automation on a home's document (entryAutomations) that isn't a step of using the item: auras, combat, rests.
   * A macro run during a use is drawn in each activity's card instead (an item without activities keeps it here).
   */
  #automations(h: Home) {
    const hasCards = this.#homes.some(home => home.card);
    return automationNotes(h.document)
      .filter(note => !(note.atUse && (h.card || (h.kind === "item" && hasCards))))
      .map(note => ({ ...note, title: note.own ? i18n("midi-qol.EntryEditor.Automation.OwnMacroTitle") : game.i18n?.format("midi-qol.EntryEditor.Automation.Title", { source: note.source, name: note.name }) ?? note.source }));
  }

  /** The macros run during this activity's use: the item's and the activity's own, as steps of its card */
  #cardMacros(h: Home) {
    const item = this.#homes.find(home => home.kind === "item");
    // midi's own on-use macros are the editable rows (#onUseRows); the rest are described
    const midi = i18n("midi-qol.EntryEditor.Automation.Source.midi");
    const notes = [...(item ? automationNotes(item.document) : []), ...automationNotes(h.document)].filter(note => note.atUse && !(this.#onUse && note.source === midi));
    const and = game.i18n?.localize("midi-qol.Sentence.And") ?? "and";
    return notes.map(note => ({ ...note,
      sentence: game.i18n?.format("midi-qol.EntryEditor.Automation.Step", {
        what: note.own ? i18n("midi-qol.EntryEditor.Automation.OwnMacro") : game.i18n?.format("midi-qol.EntryEditor.Automation.ModuleMacro", { source: note.source, name: note.name }) ?? note.name,
        when: note.when.length < 2 ? note.when.join("") : `${note.when.slice(0, -1).join(", ")} ${and} ${note.when.at(-1)}` }) ?? note.name }));
  }

  /**
   * Everything midi automates on the item, read-only (the item sheet's Automation section): its settings, entries,
   * macros and what was added to activities. An activity with nothing of midi's is left to dnd5e's own list.
   */
  summary() {
    const homes = this.#sentences().map(home => {
      const card = home.card && (home.card.branches.some(b => b.added) || home.card.macros.length || home.card.region) ? home.card : undefined;
      const settings = home.settings?.fields.map(f => ({ label: f.label, shown: f.isSelect ? f.options.find(o => o.selected)?.label ?? String(f.value ?? "")
        : f.isCheckbox ? i18n(f.checked ? "Yes" : "No") : String(f.value ?? "") }));
      return { label: home.label, single: home.single, sentences: home.sentences, card, settings, automations: home.automations, effectSummary: home.effectSummary };
    });
    // Effects' summaries go with the rest of midi's automation, never alone (a plain item with effects shows nothing)
    const content = (home: typeof homes[number]) => home.sentences.length || home.card || home.settings?.length || home.automations.length;
    if (!homes.some(content)) return [];
    return homes.filter(home => content(home) || home.effectSummary);
  }

  /* An effect's own data in the form view: what it gives, how long, its changes (editable) */

  #effectEditorContext(h: Home) {
    const summary = effectSummary(h.document);
    const types = Object.keys((CONST as unknown as { ACTIVE_EFFECT_CHANGE_TYPES?: Record<string, number> }).ACTIVE_EFFECT_CHANGE_TYPES
      ?? { custom: 0, multiply: 1, add: 2, downgrade: 3, upgrade: 4, override: 5 });
    return {
      home: this.#at, statuses: summary?.statuses ?? "", duration: summary?.duration ?? "",
      changes: (h.changes?.rows ?? []).map((row, i) => ({ i, key: String(row.key ?? ""), value: String(row.value ?? ""),
        types: types.map(t => ({ value: t, label: t, selected: String(row.type ?? "add") === t })) }))
    };
  }

  #readChanges(data: Record<string, unknown>) {
    const h = this.#homes[this.#at];
    if (!h?.changes) return;
    h.changes.rows.forEach((row, i) => {
      for (const field of ["key", "type", "value"]) if (`chg.${i}.${field}` in data) row[field] = String(data[`chg.${i}.${field}`] ?? "");
    });
  }

  static #onAddChange(this: EntryEditor) {
    const h = this.#homes[this.#at];
    h?.changes?.rows.push({ _id: foundry.utils.randomID(), key: "", type: "add", value: "", phase: "initial", priority: 20 });
    this.render();
  }

  static #onRemoveChange(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#homes[this.#at]?.changes?.rows.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onOpenEffectSheet(this: EntryEditor) {
    (this.#homes[this.#at]?.document as { sheet?: { render(options: object): unknown } }).sheet?.render({ force: true });
  }

  /** The sentence view's effect: opened in the form view, at its own data */
  static #onEditEffect(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#goHome(target);
    this.#view = "form";
    this.render();
  }

  /* The item's automation settings (lib/entries/config.ts) */

  #settingsFields(h: Home): ConfigField[] {
    try { const spec = JSON.parse(h.settings?.spec || "[]"); return Array.isArray(spec) ? spec.filter(f => f && typeof f.key === "string") : []; }
    catch { return []; }
  }

  /** The settings section: each field with the owner's value; `author`: also the fields as JSON (the form view) */
  #settingsContext(h: Home, author: boolean) {
    if (!h.settings) return undefined;
    const fields = this.#settingsFields(h);
    if (!fields.length && !author) return undefined;
    return {
      fields: fields.map(f => {
        const value = h.settings!.values[f.key] ?? f.default;
        return { ...f, name: `cfg.${f.key}`, value, checked: !!value, isSelect: f.type === "select", isCheckbox: f.type === "checkbox", isNumber: f.type === "number",
          options: configOptions(f).map(o => ({ ...o, selected: o.value === String(value ?? "") })) };
      }),
      ...(author ? { spec: h.settings.spec, problem: h.settings.problem } : {})
    };
  }

  /** The settings' fields read into the item's home */
  #readSettings(data: Record<string, unknown>) {
    const h = this.#homes.find(home => home.settings);
    if (!h?.settings) return;
    if (typeof data.cfgSpec === "string") {
      h.settings.spec = data.cfgSpec;
      h.settings.problem = undefined;
      try { if (!Array.isArray(JSON.parse(data.cfgSpec || "[]"))) h.settings.problem = i18n("midi-qol.EntryEditor.Settings.SpecProblem"); }
      catch (err) { h.settings.problem = `${i18n("midi-qol.EntryEditor.Settings.SpecProblem")}: ${(err as Error).message}`; }
    }
    for (const f of this.#settingsFields(h)) {
      const name = `cfg.${f.key}`;
      if (f.type === "checkbox") { if (name in data) h.settings.values[f.key] = !!data[name]; continue; }
      if (!(name in data)) continue;
      const raw = data[name];
      h.settings.values[f.key] = f.type === "number" ? (raw === "" || raw === null ? undefined : Number(raw)) : String(raw ?? "");
    }
  }

  /* The activity card: what an activity does by itself, by branch, and what was added to each branch */

  /** The activity's own data as stored */
  #activitySource(h: Home): ActivityData {
    const source = (h.document as { _source?: ActivityData, type?: string })._source;
    const data = foundry.utils.deepClone(source ?? { type: (h.document as { type?: string }).type ?? "" }) as ActivityData;
    // A spell's level (how its damage scales), read from the item, not stored on the activity
    const item = this.#item();
    if (item && String(item.type) === "spell") data.spellLevel = Number((item.system as { level?: number }).level) || 0;
    // A weapon's damage, which its attacks can add (one-handed, and two-handed when versatile)
    if (item && String(item.type) === "weapon") {
      const system = item.system as { _source?: { damage?: { base?: DamagePart, versatile?: DamagePart } }, properties?: Set<string> };
      const damage = system._source?.damage;
      if (damage?.base) data.weapon = { base: damage.base, ...(damage.versatile ? { versatileSource: damage.versatile } : {}),
        ...(system.properties?.has("ver") && damage.versatile ? { versatile: damage.versatile } : {}) };
    }
    // The area it makes, as dnd5e words it (its own template, else the item's)
    const prepared = h.document as { target?: { template?: { type?: string, size?: unknown, width?: unknown }, affects?: { type?: string, count?: unknown } }, range?: { units?: string, value?: unknown }, labels?: { target?: string }, midiProperties?: { targetMustBeSeen?: boolean } };
    if (prepared.target?.template?.type) data.areaLabel = prepared.labels?.target;
    // Its targeting as dnd5e resolves it
    data.targetPresets = targetPresetDefs();
    data.targeting = {
      affectsType: prepared.target?.affects?.type ?? "", count: prepared.target?.affects?.count as Targeting["count"],
      templateType: prepared.target?.template?.type ?? "", size: prepared.target?.template?.size as Targeting["size"], width: prepared.target?.template?.width as Targeting["width"],
      rangeUnits: prepared.range?.units ?? "", rangeValue: prepared.range?.value as Targeting["rangeValue"],
      mustSee: !!prepared.midiProperties?.targetMustBeSeen
    };
    return data;
  }

  /** The activity's data once converted to the roll the card chose (its own type: unchanged) */
  #convertedSource(h: Home): ActivityData {
    const source = this.#activitySource(h);
    const to = h.card?.convertTo;
    if (!to || to === source.type) return source;
    const item = this.#item();
    return { ...(convertActivity(source as unknown as Record<string, unknown>, to, { spell: !!item && String(item.type) === "spell" }) as unknown as ActivityData),
      spellLevel: source.spellLevel, areaLabel: source.areaLabel };
  }

  /** The update the card's edits make to the activity (only what changed) */
  #cardUpdate(h: Home): Record<string, unknown> {
    if (!h.card) return {};
    // A new roll: the whole activity is replaced on save; any change counts
    if (h.card.convertTo && h.card.convertTo !== this.#activitySource(h).type) return { type: h.card.convertTo };
    const source = this.#activitySource(h);
    // A contributor with fields of its own writes its own update
    const found = activityCardContributor(source.type);
    if (found?.provider.fields && found.provider.update) {
      if (!h.cardValues || !Object.keys(h.cardValues).length) return {};
      try { return found.provider.update(source, h.cardValues) ?? {}; }
      catch (err) { console.warn(`midi-qol | activityCards ${found.id}: update() failed`, err); return {}; }
    }
    return activityUpdate(source, h.card);
  }

  /** The activity as it will be once saved (converted to the chosen roll, then the card's edits) */
  #activityNow(h: Home): ActivityData {
    const converting = !!h.card?.convertTo && h.card.convertTo !== this.#activitySource(h).type;
    const source = this.#convertedSource(h);
    // Unconverted: the card's update as saved (a module's own fields through its update())
    const update = !h.card ? {} : converting ? activityUpdate(source, { ...h.card, convertTo: undefined }) : this.#cardUpdate(h);
    const now = foundry.utils.mergeObject(source, foundry.utils.expandObject(update), { inplace: false }) as ActivityData;
    if (h.card?.target && source.targeting) now.targeting = editedTargeting(source.targeting, h.card.target, source.targetPresets);
    if (h.card?.area) now.regionBehavior = editedRegion(source.regionBehavior, h.card.area);
    if (h.card?.weapon && source.weapon) now.weapon = editedWeapon(source.weapon, h.card.weapon);
    return now;
  }

  /** Whether an activity's targeting is its spell's (dnd5e: a spell's activity without its own reads the spell's) */
  #targetingOnItem(h: Home): boolean {
    const activity = h.document as { _source?: { target?: { override?: boolean } }, item?: Item.Implementation };
    return !!activity.item && String(activity.item.type) === "spell" && !activity._source?.target?.override;
  }

  /** The targeting chip's update: { activity, item } paths, or nothing when it wasn't edited */
  #targetingUpdates(h: Home): { activity: Record<string, unknown>, item: Record<string, unknown> } {
    const source = this.#activitySource(h);
    if (!h.card?.target || !source.targeting) return { activity: {}, item: {} };
    const { mustSee, ...targeting } = editedTargeting(source.targeting, h.card.target, source.targetPresets);
    const { mustSee: mustSeeBefore, ...before } = source.targeting;
    // Seeing targets is midi's, on the activity (a spell's too); the rest where dnd5e reads it
    const seen = !!mustSee !== !!mustSeeBefore ? { "midiProperties.targetMustBeSeen": !!mustSee } : {};
    if (JSON.stringify(targeting) === JSON.stringify(before)) return { activity: seen, item: {} };
    const onItem = this.#targetingOnItem(h);
    const update = targetingUpdate(targeting, onItem);
    return onItem ? { activity: seen, item: update } : { activity: { ...update, ...seen }, item: {} };
  }

  /** Replaces the activity with its conversion (same id), with the card's edits, entries and choices */
  async #saveConverted(h: Home, changes: Record<string, unknown>) {
    const activity = h.document as unknown as { id: string, item?: Item.Implementation, _source: Record<string, unknown> };
    const item = activity.item;
    if (!item) return;
    const converted = convertActivity(foundry.utils.deepClone(activity._source), h.card!.convertTo!, { spell: String(item.type) === "spell" });
    if ("midiEntries" in changes) converted.midiEntries = changes.midiEntries;
    if ("midiChoices" in changes) converted.midiChoices = changes.midiChoices;
    const edits = activityUpdate(converted as unknown as ActivityData, { ...h.card!, convertTo: undefined });
    // Its targeting edited too: the activity's own part goes into the replacement, the spell's onto the item
    const targeting = this.#targetingUpdates(h);
    const areaUpdate = this.#areaUpdates(h);
    const basicsUpdates = this.#basicsUpdates(h);
    Object.assign(targeting.activity, basicsUpdates.activity);
    Object.assign(targeting.item, basicsUpdates.item);
    if (areaUpdate.newActivity) await item.update({ [`system.activities.${areaUpdate.newActivity._id}`]: areaUpdate.newActivity });
    const data = foundry.utils.mergeObject(converted, foundry.utils.expandObject({ ...edits, ...targeting.activity, ...areaUpdate.activity }), { inplace: false });
    await item.update({ [`system.activities.${activity.id}`]: new foundry.data.operators.ForcedReplacement(data) });
    if (Object.keys(targeting.item).length) await item.update(targeting.item);
  }

  #cardText(): CardText {
    const item = this.#item();
    const label = (record: Record<string, { label?: string } | string> | undefined, id: string) => {
      const value = record?.[id];
      return typeof value === "string" ? value : value?.label ?? id;
    };
    return {
      ability: id => label(CONFIG.DND5E.abilities as Record<string, { label?: string }>, id),
      damageType: id => label({ ...(CONFIG.DND5E.damageTypes as Record<string, { label?: string }>), ...(CONFIG.DND5E.healingTypes as Record<string, { label?: string }>) }, id),
      // An effect added but not yet saved has its name from the card
      effectName: id => item?.effects.get(id)?.name ?? this.#homes.flatMap(h => h.card?.newEffects ?? []).find(e => e._id === id)?.name ?? id,
      documentName: uuid => (fromUuidSync(uuid, { strict: false }) as { name?: string } | null)?.name ?? undefined,
      activityName: id => {
        // By id, or by identifier as region rules name them
        const activities = [...((item?.system as { activities?: Iterable<{ id: string, name?: string, identifier?: string }> } | undefined)?.activities ?? [])];
        return activities.find(a => a.id === id || a.identifier === id)?.name || undefined;
      },
      typeLabel: (kind, id) => kind === "creature"
        ? label(CONFIG.DND5E.creatureTypes as Record<string, { label?: string }>, id)
        : label(CONFIG.Item.typeLabels as Record<string, string>, id),
      say: (key, data) => {
        const full = `midi-qol.EntryEditor.${key}`;
        const known = game.i18n?.has(full) ? full : key.startsWith("Activity.Type.") ? "midi-qol.EntryEditor.Activity.Used" : full;
        return data ? game.i18n?.format(known, data) ?? known : i18n(known);
      }
    };
  }

  #cardContext(h: Home, at: number) {
    const data = this.#activityNow(h);
    const text = this.#cardText();
    const model = contributedActivityCard(data, text) ?? activityCard(data, text);
    const activities = [...((this.#item()?.system as { activities?: Iterable<{ id: string, name?: string }> } | undefined)?.activities ?? [])];
    const chip = (part: BuiltInPart) => ({ ...part, home: at });
    // An activity whose work is its area: its empty "for each target" says nothing
    const shownBranches = model.region ? model.branches.filter(b => b.builtIn.length || h.drafts.some(d => isBranchEntry(this.#entryForSave(d)) === b.branch)) : model.branches;
    const branches = shownBranches.map(b => {
      const index = h.drafts.findIndex(d => isBranchEntry(this.#entryForSave(d)) === b.branch);
      const entry = index >= 0 ? this.#entryForSave(h.drafts[index]) : undefined;
      const sentence = entry ? entrySentence(entry, { home: "activity", activities }) : undefined;
      // The branch says when: its own entry's trigger line is left out, its condition kept
      const condition = sentence?.lines[0]?.parts.slice(2) ?? [];
      const lines = sentence ? [...(condition.length ? [{ indent: 0, parts: condition }] : []), ...sentence.lines.slice(1)] : [];
      return {
        branch: b.branch, home: at, label: i18n(`midi-qol.EntryEditor.ActivityBranch.${b.branch}`),
        builtIn: b.builtIn.map(chip), nothing: !b.builtIn.length && !lines.length,
        added: entry ? {
          index, problems: h.drafts[index].problems,
          lines: lines.map(line => ({ indent: line.indent * 22, parts: line.parts.map(part => ({ ...part, index, home: at })) })),
          // Open under the branch in sentences; the form view has its own form
          expanded: this.#view === "sentence" && this.#expanded && this.#at === at && this.#selected === index
        } : undefined
      };
    });
    // Range and targets are the Targets line's
    const basics = [this.#basicsText(this.#basicsEdited(h)), ...this.#basicsExtra(h).map(f => f.text).filter(Boolean)].filter(Boolean).join(" · ")
      || i18n("midi-qol.EntryEditor.Activity.Basics.none");
    const opened = this.#cardOpen === at ? { ...this.#openFields(h, data), home: at } : undefined;
    const all = this.#cardField === "all" || !this.#cardField;
    const area = areaView(data, text);
    const region = area ? { text: area.text, groups: area.groups.map((g, index) => ({ text: g, index, home: at })), other: area.other, dnd5e: area.dnd5e, home: at } : undefined;
    // An activity an area runs: its targets and timing are the area's
    const runByArea = !!h.runByArea;
    return { home: at, runByArea, onUse: this.#onUseRows(at), when: model.when.map(chip), branches, basics: runByArea ? undefined : basics, targeting: model.targeting && !runByArea ? chip(model.targeting) : undefined, midi: this.#midiProperties(h), region, macros: this.#cardMacros(h),
      open: opened && all ? { ...opened, newEffect: undefined } : undefined,
      popover: opened && !all ? { place: this.#cardPlace, fields: { ...chipFields(opened, this.#cardField!), home: at, noAdd: true } } : undefined };
  }

  /** The item's on-use macros as phrases: "Then run the item's macro after active effects" */
  #onUseRows(at: number) {
    if (!this.#onUse) return undefined;
    const name = (n: string) => n === "ItemMacro" ? i18n("midi-qol.Entries.Macro.item") : n === "ActivityMacro" ? i18n("midi-qol.Entries.Macro.activity")
      : game.i18n?.format("midi-qol.EntryEditor.OnUse.named", { name: n.replace(/^Macro\./, "") }) ?? n;
    const pass = (o: string) => (game.i18n?.localize(`midi-qol.onUseMacroOptions.${o}`) ?? o).trim().toLowerCase();
    const command = this.#root ? globalThis.DAE?.getItemMacroCommand(this.#root) : undefined;
    return { home: at, rows: this.#onUse.rows.map((r, i) => ({ i, home: at,
      text: game.i18n?.format("midi-qol.EntryEditor.OnUse.step", { what: name(r.macroName), when: pass(r.option) }) ?? r.macroName,
      code: r.macroName === "ItemMacro" ? command : undefined })) };
  }

  /** The open on-use row's fields */
  #onUseFields() {
    const index = this.#cardField?.startsWith("onuse.") ? Number(this.#cardField.slice(6)) : -1;
    const row = this.#onUse?.rows[index];
    if (!row) return undefined;
    const option = (value: string, label: string, selected: boolean) => ({ value, label, selected });
    return { index, name: row.macroName, macros: optionList("macros"),
      passes: Object.entries(onUseMacroOptions as Record<string, string | { label?: string }>)
        .map(([o, entry]) => option(o, i18n(typeof entry === "string" ? entry : entry.label ?? o), row.option === o)) };
  }

  static #onAddOnUse(this: EntryEditor, _event: Event, target: HTMLElement) {
    if (!this.#onUse) return;
    this.#onUse.rows.push({ macroName: "ItemMacro", option: "postActiveEffects" });
    this.#cardOpen = Number(target.dataset.home ?? this.#at);
    this.#cardField = `onuse.${this.#onUse.rows.length - 1}`;
    this.#cardPlace = "onuse";
    this.render();
  }

  static #onRemoveOnUse(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#onUse?.rows.splice(Number(target.dataset.index), 1);
    this.#cardOpen = this.#cardField = this.#cardPlace = undefined;
    this.render();
  }

  /** midi's properties of the activity that differ from their defaults, by their schema labels */
  #midiProperties(h: Home): string {
    type Field = { label?: string, initial?: unknown, choices?: unknown };
    const activity = h.document as { midiProperties?: Record<string, unknown>, schema?: { fields?: { midiProperties?: { fields?: Record<string, Field> } } } };
    const fields = activity.schema?.fields?.midiProperties?.fields ?? {};
    const plain = (v: unknown): unknown => v instanceof Set ? [...v] : v;
    const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);
    const parts: string[] = [];
    for (const [key, field] of Object.entries(fields)) {
      const value = plain(activity.midiProperties?.[key]);
      const initial = plain(typeof field.initial === "function" ? (field.initial as () => unknown)() : field.initial);
      if (!field.label || (empty(value) && empty(initial)) || JSON.stringify(value) === JSON.stringify(initial)) continue;
      const label = i18n(field.label);
      const choices = field.choices && typeof field.choices === "object" ? field.choices as Record<string, string> : undefined;
      const shown = typeof value === "boolean" ? i18n(value ? "Yes" : "No")
        : Array.isArray(value) ? value.join(", ") : choices?.[String(value)] ? i18n(choices[String(value)]) : String(value);
      parts.push(`${label}: ${shown}`);
    }
    return parts.join(" · ");
  }

  /** The open card's fields: a contributor's own, else midi's */
  #openFields(h: Home, data: ActivityData) {
    const found = activityCardContributor(data.type);
    if (!found?.provider.fields) return this.#cardFields(h, data);
    let fields: readonly import("../lib/entries/editorServices.js").CardField[] = [];
    try { fields = found.provider.fields(data); } catch (err) { console.warn(`midi-qol | activityCards ${found.id}: fields() failed`, err); }
    return {
      basics: this.#basicsContext(h),
      onUse: this.#onUseFields(),
      contributed: fields.map(f => {
        const value = h.cardValues?.[f.name] ?? f.value;
        return { ...f, field: `card.x.${f.name}`, value, checked: f.type === "checkbox" && !!value,
          options: (f.options ?? []).map(o => ({ ...o, selected: o.value === String(value ?? "") })),
          isSelect: f.type === "select", isCheckbox: f.type === "checkbox", isNumber: f.type === "number" };
      })
    };
  }

  /** The open card's fields: what can be edited here (the rest on the activity's sheet) */
  #cardFields(h: Home, data: ActivityData) {
    const abilities = Object.entries(CONFIG.DND5E.abilities as Record<string, { label?: string }>).map(([id, a]) => ({ id, label: a.label ?? id }));
    // dnd5e's lists as midi's entryOptions gives them (modules' types included)
    const damageTypes = optionList("damageTypes").map(o => ({ id: o.value, label: o.label }));
    const w = data.type === "attack" ? data.weapon : undefined;
    const weapon = w ? {
      includeBase: !!data.damage?.includeBase, formula: partFormula(w.base),
      types: damageTypes.map(t => ({ value: t.id, label: t.label, selected: (w.base.types ?? []).includes(t.id) })),
      versatile: !!w.versatile, versatileFormula: w.versatileSource ? partFormula(w.versatileSource) : "",
      versatileTypes: damageTypes.map(t => ({ value: t.id, label: t.label, selected: (w.versatileSource?.types ?? []).includes(t.id) }))
    } : undefined;
    const healingTypes = optionList("healingTypes").map(o => ({ id: o.value, label: o.label }));
    const option = (value: string, label: string, selected: boolean) => ({ value, label, selected });
    const save = data.type === "save";
    const check = data.type === "check";
    const calculation = (check ? data.check?.dc?.calculation : data.save?.dc?.calculation) ?? "";
    const dcChoices = [option("spellcasting", i18n("midi-qol.EntryEditor.Activity.DCField.spellcasting"), calculation === "spellcasting"),
      ...abilities.map(a => option(a.id, a.label, calculation === a.id)),
      option("", i18n("midi-qol.EntryEditor.Activity.DCField.custom"), calculation === "")];
    const attack = data.type === "attack";
    const tg = data.targeting;
    const extra = data.targetPresets ?? [];
    const preset: TargetPreset = tg ? targetPreset(tg, extra) : "custom";
    // A registered preset says which fields edit it; midi's own by preset
    const registered = extra.find(def => def.id === preset);
    const has = (field: string, own: boolean) => registered ? (registered.fields ?? []).includes(field as never) : own;
    const shapes = registered ? [...(registered.shapes ?? [])] : preset === "point" ? POINT_SHAPES : preset === "fromYou" ? FROM_YOU_SHAPES : [];
    const area = ["point", "fromYou", "emanation"].includes(preset) || (!!registered && !!tg?.templateType);
    return {
      target: tg ? {
        presets: [...TARGET_PRESETS.map(p => option(p, i18n(`midi-qol.EntryEditor.Activity.TargetPreset.${p}`), p === preset)),
          ...extra.map(def => option(def.id, i18n(def.label), def.id === preset)),
          ...(preset === "custom" ? [option("custom", i18n("midi-qol.EntryEditor.Activity.TargetPreset.custom"), true)] : [])],
        custom: preset === "custom",
        count: has("count", preset === "several") ? Number(tg.count) || (registered ? 1 : 2) : undefined,
        range: has("range", ["one", "several", "point"].includes(preset)) ? Number(tg.rangeValue) || "" : undefined,
        shapes: shapes.length && has("shape", true) ? shapes.map(s => option(s, i18n(`midi-qol.EntryEditor.Activity.Shape.${s}`), tg.templateType === s)) : undefined,
        size: has("size", ["point", "fromYou", "emanation"].includes(preset)) ? Number(tg.size) || "" : undefined,
        width: has("width", tg.templateType === "line") ? Number(tg.width) || "" : undefined,
        hasSize: has("size", ["point", "fromYou", "emanation"].includes(preset)), hasWidth: has("width", tg.templateType === "line"), hasRange: has("range", ["one", "several", "point"].includes(preset)),
        // An area can linger and act on creatures in it (midi's region rules)
        canLinger: area, lingers: !!data.regionBehavior?.enabled,
        // "a creature you can see": midi's check, as the world's Targets you can see rule says
        canSee: has("who", SEEN_PRESETS.includes(preset)), mustSee: !!tg.mustSee,
        seeHint: i18n(`midi-qol.EntryEditor.Activity.SeeRule.${configSettings.optionalRules?.targetMustBeSeen || "nothing"}`),
        who: !has("who", !["self", "custom"].includes(preset)) ? undefined : ["creature", "enemy", "ally"].map(w => option(w, i18n(`midi-qol.EntryEditor.Activity.Target.who.${w}s`), (tg.affectsType || "creature") === w)),
        onItem: undefined
      } : undefined,
      roll: {
        kinds: ROLL_KINDS.map(k => option(k, i18n(`midi-qol.EntryEditor.Activity.Roll.${k}`), data.type === k)),
        attack: attack ? {
          types: ["melee", "ranged"].map(v => option(v, i18n(`midi-qol.EntryEditor.Activity.AttackType.${v}`), (data.attack?.type?.value ?? "melee") === v)),
          classes: ["weapon", "spell", "unarmed"].map(v => option(v, i18n(`midi-qol.EntryEditor.Activity.AttackClass.${v}`), (data.attack?.type?.classification ?? "weapon") === v))
        } : undefined
      },
      check: check ? {
        abilities: abilities.map(a => option(a.id, a.label, data.check?.ability === a.id)),
        calculations: dcChoices, custom: calculation === "", formula: data.check?.dc?.formula ?? ""
      } : undefined,
      save: save ? {
        abilities: abilities.map(a => option(a.id, a.label, (data.save?.ability ?? []).includes(a.id))),
        calculations: [option("spellcasting", i18n("midi-qol.EntryEditor.Activity.DCField.spellcasting"), calculation === "spellcasting"),
          ...abilities.map(a => option(a.id, a.label, calculation === a.id)),
          option("", i18n("midi-qol.EntryEditor.Activity.DCField.custom"), calculation === "")],
        custom: calculation === "", formula: data.save?.dc?.formula ?? "",
        onSave: (data.damage?.parts?.length ?? 0) ? ["half", "none", "full"].map(v => option(v, i18n(`midi-qol.EntryEditor.Activity.OnSave.${v}`), (data.damage?.onSave ?? "half") === v)) : undefined
      } : undefined,
      parts: data.damage ? (data.damage.parts ?? []).map((part, i) => ({ i, formula: partFormula(part),
        types: damageTypes.map(t => option(t.id, t.label, (part.types ?? []).includes(t.id))),
        // A spell's damage grows with its slot (a cantrip's with the caster's level)
        scaling: data.spellLevel === undefined ? undefined : {
          modes: ["", "whole", "half"].map(m => option(m, i18n(`midi-qol.EntryEditor.Activity.Scaling.${data.spellLevel === 0 ? "cantrip" : "slot"}.${m || "none"}`), (part.scaling?.mode ?? "") === m)),
          number: part.scaling?.number ?? 1, on: !!part.scaling?.mode
        } })) : undefined,
      healing: data.healing ? { formula: partFormula(data.healing), types: healingTypes.map(t => option(t.id, t.label, (data.healing!.types ?? []).includes(t.id))) } : undefined,
      effects: (data.effects ?? []).map(e => ({ id: e._id, name: this.#cardText().effectName(e._id), onSave: !!e.onSave, canOnSave: save })),
      newEffect: this.#newEffectContext(data),
      basics: this.#basicsContext(h),
      onUse: this.#onUseFields(),
      weapon,
      ...this.#areaContext(data)
    };
  }

  /** The weapon's update for its damage edits (on the item) */
  #weaponUpdates(h: Home): Record<string, unknown> {
    const source = this.#activitySource(h);
    const item = (h.document as { item?: Item.Implementation }).item;
    if (!h.card?.weapon || !source.weapon || !item) return {};
    return weaponUpdate(source.weapon, h.card.weapon, [...((item.system as { properties?: Set<string> }).properties ?? [])]);
  }

  /** The "+ effect" form: a condition, one of the item's effects or a new one; how long; ends on a save */
  #newEffectContext(data: ActivityData) {
    const form = this.#effectForm;
    const statuses = CONFIG.statusEffects.filter(s => s.id && s.name).map(s => ({ value: `status:${s.id}`, label: i18n(s.name!) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const effects = [...(this.#item()?.effects ?? [])].filter(e => !(e as { transfer?: boolean }).transfer).map(e => ({ value: `effect:${e.id}`, label: e.name }));
    const pick = (list: { value: string, label: string }[]) => list.map(o => ({ ...o, selected: o.value === form.what }));
    // Common effects, by group (midi's: movement, defence, rolls; a module's own)
    const defs = effectPresetDefs();
    const groups = [...new Set(defs.map(d => d.group ?? "other"))];
    const presets = groups.map(g => ({ label: game.i18n?.has(`midi-qol.EffectPreset.group.${g}`) ? i18n(`midi-qol.EffectPreset.group.${g}`) : g,
      options: pick(defs.filter(d => (d.group ?? "other") === g).map(d => ({ value: `preset:${d.id}`, label: i18n(d.label) }))) }));
    const chosen = form.what.startsWith("preset:") ? defs.find(d => d.id === form.what.slice(7)) : undefined;
    const value = form.param || chosen?.param?.default || "";
    const param = chosen?.param ? { label: i18n(chosen.param.label), value, isSelect: chosen.param.type === "select", isNumber: chosen.param.type === "number",
      options: chosen.param.list ? optionList(chosen.param.list).map(o => ({ ...o, selected: o.value === value })) : [] } : undefined;
    return {
      presets, param,
      statuses: pick(statuses), effects: pick(effects), isNew: form.what === "new", name: form.name,
      duration: form.duration, units: ["", "rounds", "minutes", "hours"].map(u => ({ value: u, label: i18n(`midi-qol.EntryEditor.Activity.Units.${u || "none"}`), selected: u === form.units })),
      canRepeat: data.type === "save" && this.#cardPlace === mainBranch(data.type), repeat: form.repeat
    };
  }

  /** The area's fields: whether it acts, attached to, who, once per turn; each group's (what it does, when) */
  #areaContext(data: ActivityData) {
    const rb = data.regionBehavior;
    const option = (value: string, label: string, selected: boolean) => ({ value, label, selected });
    const activities = [...((this.#item()?.system as { activities?: Iterable<{ id: string, identifier?: string, name?: string, type?: string }> } | undefined)?.activities ?? [])];
    const self = (this.#homes[this.#cardOpen ?? this.#at]?.document as { id?: string } | undefined)?.id;
    const effects = [...(this.#item()?.effects ?? [])].filter(e => !(e as { transfer?: boolean }).transfer);
    const groups = areaGroups(rb?.rules ?? []).groups;
    const at = this.#cardField?.startsWith("area.") ? Number(this.#cardField.slice(5)) : -1;
    const group = groups[at];
    return {
      area: {
        lingers: !!rb?.enabled,
        attach: ["default", "caster", "target"].map(v => option(v, i18n(`midi-qol.EntryEditor.Activity.Area.attach.${v}`), (rb?.attachToken ?? "default") === v)),
        who: [["-1", "enemies"], ["0", "anyone"], ["1", "allies"]].map(([v, l]) => option(v, i18n(`midi-qol.EntryEditor.Activity.Area.who.${l}`), String(rb?.dispositionFilter ?? -1) === v)),
        once: rb?.oncePerTurn ?? true
      },
      areaGroup: group ? {
        index: at,
        kinds: ["use", "whileIn"].map(k => option(k, i18n(`midi-qol.EntryEditor.Activity.Area.kind.${k}`), group.kind === k)),
        isUse: group.kind === "use",
        targets: group.kind === "use"
          ? [...activities.filter(a => a.id !== self).map(a => option(a.identifier || a.id, a.name || a.id, [a.identifier, a.id].includes(group.targetId))),
            option("new", i18n("midi-qol.EntryEditor.Activity.Area.newSave"), group.targetId === "new")]
          : effects.map(e => option(e.id!, e.name, e.id === group.targetId)),
        triggers: group.kind === "use" ? AREA_TRIGGERS.map(tr => ({ value: tr, label: i18n(`midi-qol.EntryEditor.Activity.Region.trigger.${tr}`), checked: group.triggers.includes(tr) })) : undefined
      } : undefined
    };
  }

  /** The area's groups as edited so far (from the activity's rules the first time) */
  #areaGroupsOf(h: Home): AreaGroup[] {
    if (!h.card) return [];
    if (!h.card.area?.groups) {
      const split = areaGroups(this.#activitySource(h).regionBehavior?.rules ?? []);
      h.card.area = { ...(h.card.area ?? {}), groups: split.groups, other: split.other };
    }
    return h.card.area!.groups!;
  }

  static #onAddAreaGroup(this: EntryEditor, _event: Event, target: HTMLElement) {
    const at = Number(target.dataset.home ?? this.#at);
    const h = this.#homes[at];
    if (!h?.card) return;
    const groups = this.#areaGroupsOf(h);
    const others = [...((this.#item()?.system as { activities?: Iterable<{ id: string, identifier?: string }> } | undefined)?.activities ?? [])]
      .filter(a => a.id !== (h.document as { id?: string }).id);
    groups.push({ kind: "use", targetId: others[0] ? others[0].identifier || others[0].id : "new", triggers: ["entry", "turnEnd"] });
    h.card.area!.enabled = true;
    this.#cardOpen = at;
    this.#cardField = `area.${groups.length - 1}`;
    this.#cardPlace = "area";
    this.render();
  }

  static #onRemoveAreaGroup(this: EntryEditor, _event: Event, target: HTMLElement) {
    const h = this.#homes[Number(target.dataset.home ?? this.#at)];
    if (!h?.card) return;
    this.#areaGroupsOf(h).splice(Number(target.dataset.index), 1);
    this.#cardOpen = this.#cardField = this.#cardPlace = undefined;
    this.render();
  }

  /** The area's update on save: the region behaviour, and a save activity made for it where a group asks for "a new save" */
  #areaUpdates(h: Home): { activity: Record<string, unknown>, newActivity?: Record<string, unknown> } {
    if (!h.card?.area) return { activity: {} };
    const source = this.#activitySource(h);
    const region = editedRegion(source.regionBehavior, h.card.area);
    let newActivity: Record<string, unknown> | undefined;
    if (region.rules?.some(r => r.targetId === "new")) {
      const item = this.#item();
      const id = foundry.utils.randomID();
      newActivity = areaSaveActivity(id, game.i18n?.format("midi-qol.EntryEditor.Activity.Area.saveName", { name: item?.name ?? "" }) ?? "Save", !!item && String(item.type) === "spell");
      region.rules = region.rules.map(r => r.targetId === "new" ? { ...r, targetId: id } : r);
    }
    if (JSON.stringify(region) === JSON.stringify({ enabled: false, attachToken: "default", dispositionFilter: -1, oncePerTurn: true, rules: [], ...(source.regionBehavior ?? {}) })) return { activity: {} };
    return { activity: { regionBehavior: region }, ...(newActivity ? { newActivity } : {}) };
  }

  /** The activity's activation, duration, concentration and uses as dnd5e resolves them, and where each is kept */
  #basicsOf(h: Home): { current: Basics, where: BasicsWhere } {
    type Prepared = {
      _source?: { activation?: { override?: boolean }, duration?: { override?: boolean }, uses?: { max?: string, recovery?: { period?: string, formula?: string }[] }, consumption?: { targets?: { type: string }[] } },
      activation?: { type?: string, value?: number | null }, duration?: { value?: unknown, units?: string, concentration?: boolean }, item?: Item.Implementation
    };
    const a = h.document as Prepared;
    const item = a.item;
    const system = item?.system as { _source?: { uses?: { max?: string, recovery?: { period?: string, formula?: string }[] } }, properties?: Set<string> } | undefined;
    const spell = !!item && String(item.type) === "spell";
    const durationOnItem = spell && !a._source?.duration?.override;
    const usesOnItem = !a._source?.uses?.max && !!system?._source?.uses?.max;
    const uses = usesOnItem ? system!._source!.uses! : a._source?.uses;
    const recovery = uses?.max ? uses.recovery?.[0] : undefined;
    return {
      current: {
        activation: a.activation?.type ?? "", activationValue: a.activation?.value ?? null,
        durationValue: a.duration?.value === null || a.duration?.value === undefined ? "" : String(a.duration.value), durationUnits: a.duration?.units ?? "",
        concentration: !!a.duration?.concentration || (durationOnItem && !!system?.properties?.has("concentration")),
        usesPeriod: recovery?.period ?? "", usesMax: recovery ? String(uses?.max ?? "") : "", recharge: recovery?.period === "recharge" ? String(recovery.formula ?? "6") : ""
      },
      where: { activationOnItem: spell && !a._source?.activation?.override, durationOnItem, usesOnItem,
        itemProperties: [...(system?.properties ?? [])], consumption: a._source?.consumption?.targets ?? [] }
    };
  }

  #basicsEdited(h: Home): Basics {
    return { ...this.#basicsOf(h).current, ...(h.card?.basics ?? {}) };
  }

  #basicsUpdates(h: Home): { activity: Record<string, unknown>, item: Record<string, unknown> } {
    if (!h.card?.basics && !h.card?.basicsExtra) return { activity: {}, item: {} };
    const { current, where } = this.#basicsOf(h);
    const updates = h.card.basics ? basicsUpdate(current, this.#basicsEdited(h), where) : { activity: {}, item: {} };
    // Registered fields whose value changed: their own updates
    for (const field of this.#basicsExtra(h)) {
      if (!field.changed) continue;
      try {
        const update = field.def.update(field.value, h.document);
        Object.assign(updates.activity, update.activity ?? {});
        Object.assign(updates.item, update.item ?? {});
      } catch (err) { console.warn(`midi-qol | basicsFields ${field.def.id}: update() failed`, err); }
    }
    return updates;
  }

  /** The registered basics fields (basicsFields service): read, as edited, worded */
  #basicsExtra(h: Home): { def: BasicsFieldDef, value: unknown, changed: boolean, text?: string }[] {
    if (!isActivity(h.document)) return [];
    return basicsFieldDefs(h.document).map(def => {
      let read: unknown, text: string | undefined;
      try { read = def.read(h.document); } catch { read = undefined; }
      const edited = h.card?.basicsExtra && def.id in h.card.basicsExtra;
      const value = edited ? h.card!.basicsExtra![def.id] : read;
      try { text = def.text?.(value, h.document); } catch { text = undefined; }
      return { def, value, changed: !!edited && JSON.stringify(value) !== JSON.stringify(read), text };
    });
  }

  /** "Action · Concentration, up to 1 minute · 3 uses per Long Rest", as dnd5e words each */
  #basicsText(b: Basics): string {
    const dnd5e = CONFIG.DND5E as unknown as { activityActivationTypes: Record<string, { label?: string }>, timePeriods: Record<string, string>, timeUnits: Record<string, unknown>, limitedUsePeriods: Record<string, { label?: string }> };
    const formatTime = (globalThis as { dnd5e?: { utils?: { formatTime?(value: number, unit: string): string } } }).dnd5e?.utils?.formatTime;
    const parts: string[] = [];
    const activation = dnd5e.activityActivationTypes[b.activation]?.label;
    if (activation) parts.push(`${b.activationValue && b.activationValue > 1 ? `${b.activationValue} ` : ""}${i18n(activation)}`);
    let duration = "";
    if (b.durationUnits) duration = b.durationValue && b.durationUnits in dnd5e.timeUnits && formatTime ? formatTime(Number(b.durationValue) || 0, b.durationUnits) : i18n(dnd5e.timePeriods[b.durationUnits] ?? "");
    if (duration) parts.push(b.concentration ? game.i18n?.format("midi-qol.EntryEditor.Activity.Basics.concentrationText", { duration }) ?? duration : duration);
    if (b.usesPeriod === "recharge") parts.push(game.i18n?.format("midi-qol.EntryEditor.Activity.Basics.rechargeText", { range: b.recharge === "6" || !b.recharge ? "6" : `${b.recharge}–6` }) ?? "");
    else if (b.usesPeriod) parts.push(game.i18n?.format("midi-qol.EntryEditor.Activity.Basics.usesText", { max: b.usesMax || "1", period: i18n(dnd5e.limitedUsePeriods[b.usesPeriod]?.label ?? b.usesPeriod) }) ?? "");
    return parts.join(" · ");
  }

  /** The basics chip's fields */
  #basicsContext(h: Home) {
    const b = this.#basicsEdited(h);
    const dnd5e = CONFIG.DND5E as unknown as { activityActivationTypes: Record<string, { label?: string, group?: string }>, timePeriods: Record<string, string>, scalarTimePeriods: Record<string, string>, limitedUsePeriods: Record<string, { label?: string }> };
    const option = (value: string, label: string, selected: boolean) => ({ value, label, selected });
    return {
      activation: [option("", "—", !b.activation), ...Object.entries(dnd5e.activityActivationTypes).map(([k, v]) => option(k, i18n(v.label ?? k), b.activation === k))],
      activationValue: b.activationValue ?? "", hasActivationValue: ["minute", "hour", "day", "legendary", "mythic", "crew"].includes(b.activation),
      units: [option("", "—", !b.durationUnits), ...Object.entries(dnd5e.timePeriods).map(([k, v]) => option(k, i18n(v), b.durationUnits === k))],
      durationValue: b.durationValue, scalar: b.durationUnits in dnd5e.scalarTimePeriods, concentration: b.concentration,
      uses: [option("", i18n("midi-qol.EntryEditor.Activity.Basics.noLimit"), !b.usesPeriod), option("recharge", i18n("midi-qol.EntryEditor.Activity.Basics.recharge"), b.usesPeriod === "recharge"),
        ...Object.entries(dnd5e.limitedUsePeriods).map(([k, v]) => option(k, game.i18n?.format("midi-qol.EntryEditor.Activity.Basics.per", { period: i18n(v.label ?? k) }) ?? k, b.usesPeriod === k))],
      usesMax: b.usesMax || "1", isRecharge: b.usesPeriod === "recharge", hasMax: !!b.usesPeriod && b.usesPeriod !== "recharge",
      extra: this.#basicsExtra(h).map(({ def, value }) => ({ id: def.id, label: i18n(def.label), value, checked: !!value,
        isSelect: def.type === "select", isCheckbox: def.type === "checkbox", isNumber: def.type === "number",
        options: (def.options ?? []).map(o => ({ ...o, selected: o.value === String(value ?? "") })) })),
      recharge: ["2", "3", "4", "5", "6"].map(n => option(n, n === "6" ? "6" : `${n}–6`, (b.recharge || "6") === n))
    };
  }

  /** "Add": the effect joins the branch (created on the item when saved) */
  static #onConfirmEffect(this: EntryEditor, _event: Event, target: HTMLElement) {
    const h = this.#homes[Number(target.dataset.home ?? this.#at)];
    if (!h?.card) return;
    const form = this.#effectForm;
    const branch = (this.#cardPlace ?? mainBranch(this.#activityNow(h).type)) as NewEffect["branch"];
    const [kind, id] = form.what.split(":");
    const status = kind === "status" ? CONFIG.statusEffects.find(s => s.id === id) : undefined;
    const itemEffect = kind === "effect" ? this.#item()?.effects.get(id) : undefined;
    const preset = kind === "preset" ? effectPresetDefs().find(d => d.id === id) : undefined;
    if (!status && !itemEffect && !preset && kind !== "new") return void ui.notifications?.warn(i18n("midi-qol.EntryEditor.Activity.PickEffect"));
    const duration = Number(form.duration) > 0 && form.units ? { value: Number(form.duration), units: form.units } : undefined;
    // A common effect is named by it and its value ("Resistance (Fire)") unless given a name
    const value = form.param || preset?.param?.default || "";
    const valueLabel = preset?.param?.list ? optionList(preset.param.list).find(o => o.value === value)?.label ?? value : value;
    const presetName = preset ? `${i18n(preset.label)}${value ? ` (${valueLabel})` : ""}` : undefined;
    const added: NewEffect = itemEffect
      ? { _id: itemEffect.id!, existing: true, name: itemEffect.name, branch }
      : { _id: foundry.utils.randomID(), name: status ? i18n(status.name!) : form.name.trim() || presetName || i18n("midi-qol.EntryEditor.Activity.NewEffectName"),
        img: status?.img ?? (this.#item()?.img ?? undefined), statuses: status ? [status.id] : [...(preset?.statuses ?? [])],
        ...(preset ? { changes: preset.changes(value) } : {}), ...(duration ? { duration } : {}), repeatSave: form.repeat, branch };
    (h.card.newEffects ??= []).push(added);
    // Another branch than dnd5e's: an "apply this effect" action in the branch's own entry
    if (branch !== mainBranch(this.#activityNow(h).type)) {
      let draft = h.drafts.find(d => isBranchEntry(this.#entryForSave(d)) === branch);
      if (!draft) { draft = this.#draftOf({ id: branchEntryId(branch), on: BRANCH_EVENT[branch], do: [] }); h.drafts.push(draft); }
      const list = JSON.parse(draft.raw.do || "[]") as EntryAction[];
      list.push(effectAction(added));
      draft.raw.do = JSON.stringify(list, null, 2);
      draft.problems = this.#problemsOf(draft, h.drafts);
    }
    this.#effectForm = { what: "", name: "", duration: "", units: "", repeat: false, param: "" };
    this.#cardOpen = this.#cardField = this.#cardPlace = undefined;
    this.render();
  }

  /** An effect taken off the activity (left on the item); one added but not saved is dropped */
  static #onRemoveEffect(this: EntryEditor, _event: Event, target: HTMLElement) {
    const h = this.#homes[Number(target.dataset.home ?? this.#at)];
    const id = target.dataset.id ?? "";
    if (!h?.card || !id) return;
    const pending = h.card.newEffects?.findIndex(e => e._id === id) ?? -1;
    if (pending >= 0) h.card.newEffects!.splice(pending, 1);
    else (h.card.removeEffects ??= []).push(id);
    this.#cardOpen = this.#cardField = this.#cardPlace = undefined;
    this.render();
  }

  /** The new effects a home's card made (not the item's own ones it picked), created on the item when saved */
  async #createNewEffects(h: Home) {
    const item = (h.document as { item?: Item.Implementation }).item;
    const made = (h.card?.newEffects ?? []).filter(e => !e.existing);
    if (item && made.length) await item.createEmbeddedDocuments("ActiveEffect", made.map(newEffectData) as never[], { keepId: true });
  }

  /** The open card's fields read into its edits */
  #readCard(data: Record<string, unknown>) {
    const h = this.#cardOpen === undefined ? undefined : this.#homes[this.#cardOpen];
    if (!h?.card || !Object.keys(data).some(k => k.startsWith("card."))) return;
    // A contributor's fields: their values as given
    for (const [key, value] of Object.entries(data))
      if (key.startsWith("card.x.")) (h.cardValues ??= {})[key.slice("card.x.".length)] = value;
    if ("card.checkAbility" in data) h.card.checkAbility = String(data["card.checkAbility"] ?? "");
    if ("card.attackType" in data) h.card.attackType = String(data["card.attackType"] ?? "");
    if ("card.weapon.formula" in data) {
      const list = (key: string) => ([] as unknown[]).concat(data[key] ?? []).map(String).filter(Boolean);
      h.card.includeBase = !!data["card.weapon.includeBase"];
      h.card.weapon = { formula: String(data["card.weapon.formula"] ?? ""), types: list("card.weapon.types"), versatile: !!data["card.weapon.versatile"],
        ...("card.weapon.versatileFormula" in data ? { versatileFormula: String(data["card.weapon.versatileFormula"] ?? ""), versatileTypes: list("card.weapon.versatileTypes") } : {}) };
    }
    if ("card.onuse.name" in data && this.#onUse) {
      const index = this.#cardField?.startsWith("onuse.") ? Number(this.#cardField.slice(6)) : -1;
      const row = this.#onUse.rows[index];
      if (row) { row.macroName = String(data["card.onuse.name"] ?? "").trim(); row.option = String(data["card.onuse.option"] ?? row.option); }
    }
    if ("card.basics.activation" in data) {
      const value = (key: string) => data[`card.basics.${key}`];
      const b = { ...(h.card.basics ?? {}) };
      b.activation = String(value("activation") ?? "");
      if ("card.basics.activationValue" in data) b.activationValue = value("activationValue") === "" || value("activationValue") === null ? null : Number(value("activationValue"));
      b.durationUnits = String(value("durationUnits") ?? "");
      if ("card.basics.durationValue" in data) b.durationValue = String(value("durationValue") ?? "");
      b.concentration = !!value("concentration");
      b.usesPeriod = String(value("usesPeriod") ?? "");
      if ("card.basics.usesMax" in data) b.usesMax = String(value("usesMax") ?? "");
      if ("card.basics.recharge" in data) b.recharge = String(value("recharge") ?? "");
      h.card.basics = b;
      const extra = { ...(h.card.basicsExtra ?? {}) };
      for (const { def } of this.#basicsExtra(h)) {
        const key = `card.basicsx.${def.id}`;
        if (!(key in data)) continue;
        extra[def.id] = def.type === "checkbox" ? !!data[key] : def.type === "number" ? (data[key] === "" || data[key] === null ? null : Number(data[key])) : data[key];
      }
      if (Object.keys(extra).length) h.card.basicsExtra = extra;
    }
    // The area: its own settings, then the open group's
    if ("card.area.lingers" in data || "card.area.attach" in data) {
      h.card.area = { ...(h.card.area ?? {}),
        ...("card.area.lingers" in data ? { enabled: !!data["card.area.lingers"] } : {}),
        ...("card.area.attach" in data ? { attach: String(data["card.area.attach"]) } : {}),
        ...("card.area.who" in data ? { who: Number(data["card.area.who"]) } : {}),
        ...("card.area.once" in data ? { oncePerTurn: !!data["card.area.once"] } : {}) };
    }
    if ("card.area.g.kind" in data) {
      const groups = this.#areaGroupsOf(h);
      const index = this.#cardField?.startsWith("area.") ? Number(this.#cardField.slice(5)) : -1;
      const group = groups[index];
      if (group) {
        const kind = String(data["card.area.g.kind"]) as AreaGroup["kind"];
        const targetId = String(data["card.area.g.target"] ?? "");
        groups[index] = kind !== group.kind
          ? kind === "use" ? { kind, targetId: "new", triggers: ["entry", "turnEnd"] } : { kind, targetId: [...(this.#item()?.effects ?? [])][0]?.id ?? "" }
          : kind === "use" ? { kind, targetId, triggers: AREA_TRIGGERS.filter(tr => !!data[`card.area.g.trigger.${tr}`]) } : { kind, targetId };
      }
    }
    if ("card.new.what" in data) {
      const what = String(data["card.new.what"] ?? "");
      this.#effectForm = { what, name: String(data["card.new.name"] ?? this.#effectForm.name),
        duration: String(data["card.new.duration"] ?? ""), units: String(data["card.new.units"] ?? ""), repeat: !!data["card.new.repeat"],
        // Another effect picked: its own default value
        param: what === this.#effectForm.what ? String(data["card.new.param"] ?? this.#effectForm.param) : "" };
    }
    if (Object.keys(data).some(k => k.startsWith("card.target."))) {
      const target = { ...(h.card.target ?? {}) };
      const num = (key: string) => { const v = data[`card.target.${key}`]; return v === undefined || v === "" || v === null ? undefined : Number(v); };
      const preset = data["card.target.preset"] as TargetPreset | undefined;
      // Another preset starts from its own defaults
      if (preset && preset !== "custom" && preset !== (target.preset ?? targetPreset(this.#activitySource(h).targeting ?? {}, this.#activitySource(h).targetPresets))) h.card.target = { preset };
      else {
        if (preset && preset !== "custom") target.preset = preset;
        for (const key of ["count", "range", "size", "width"] as const) if (num(key) !== undefined) target[key] = num(key);
        if (typeof data["card.target.shape"] === "string") target.shape = data["card.target.shape"] as string;
        if (typeof data["card.target.who"] === "string") target.who = data["card.target.who"] as string;
        if ("card.target.see" in data) target.see = !!data["card.target.see"];
        h.card.target = target;
      }
    }
    if ("card.attackClass" in data) h.card.attackClass = String(data["card.attackClass"] ?? "");
    if ("card.rollKind" in data) {
      const to = String(data["card.rollKind"] ?? "") as RollKind;
      const was = h.card.convertTo ?? this.#activitySource(h).type;
      if (ROLL_KINDS.includes(to) && to !== was) {
        h.card.convertTo = to === this.#activitySource(h).type ? undefined : to;
        // Actions added to a branch follow it; the old roll's own edits don't apply to the new one
        for (const draft of h.drafts) {
          const moved = moveBranchEntry(this.#entryForSave(draft), to);
          draft.entry.id = moved.id;
          draft.entry.on = moved.on;
        }
        Object.assign(h.card, { saveAbility: undefined, checkAbility: undefined, dcCalculation: undefined, dcFormula: undefined, onSave: undefined, parts: undefined, healing: undefined, effectsOnSave: undefined, attackType: undefined, attackClass: undefined });
        return;
      }
    }
    const now = this.#activityNow(h);
    const edits = h.card;
    if ("card.saveAbility" in data) edits.saveAbility = ([] as unknown[]).concat(data["card.saveAbility"] ?? []).map(String).filter(Boolean);
    if ("card.dcCalculation" in data) edits.dcCalculation = String(data["card.dcCalculation"] ?? "");
    if ("card.dcFormula" in data) edits.dcFormula = String(data["card.dcFormula"] ?? "");
    if ("card.onSave" in data) edits.onSave = String(data["card.onSave"] ?? "half");
    const typesOf = (key: string, fallback: string[] | undefined) => key in data ? ([] as unknown[]).concat(data[key] ?? []).map(String).filter(Boolean) : [...(fallback ?? [])];
    const parts = (now.damage?.parts ?? []).map((part, i) => ({
      formula: String(data[`card.part.${i}.formula`] ?? partFormula(part)), types: typesOf(`card.part.${i}.types`, part.types),
      ...(`card.part.${i}.scaling.mode` in data ? { scaling: { mode: String(data[`card.part.${i}.scaling.mode`] ?? ""),
        number: data[`card.part.${i}.scaling.number`] === undefined || data[`card.part.${i}.scaling.number`] === "" ? part.scaling?.number ?? 1 : Number(data[`card.part.${i}.scaling.number`]) } } : {})
    }));
    if (parts.length) edits.parts = parts;
    if (now.healing && "card.healing.formula" in data) edits.healing = { formula: String(data["card.healing.formula"] ?? ""), types: typesOf("card.healing.types", now.healing.types) };
    const onSave: Record<string, boolean> = {};
    for (const e of now.effects ?? []) if (`card.effect.${e._id}` in data) onSave[e._id] = !!data[`card.effect.${e._id}`];
    if (Object.keys(onSave).length) edits.effectsOnSave = { ...edits.effectsOnSave, ...onSave };
  }

  /**
   * A built-in part clicked: its field opens in place, under the line it is on (the same part again closes it);
   * "all" opens the activity's whole block of fields
   */
  static #onEditActivity(this: EntryEditor, _event: Event, target: HTMLElement) {
    const at = Number(target.dataset.home ?? this.#at);
    const field = target.dataset.field || "all";
    const place = target.dataset.place;
    if (this.#cardOpen === at && this.#cardField === field && this.#cardPlace === place) {
      this.#cardOpen = this.#cardField = this.#cardPlace = undefined;
    } else {
      this.#cardOpen = at;
      this.#cardField = field;
      this.#cardPlace = place;
      if (field !== "all") this.#focus = cardFieldName(field);
    }
    this.render();
  }

  static #onCloseActivityField(this: EntryEditor) {
    this.#cardOpen = this.#cardField = this.#cardPlace = undefined;
    this.render();
  }

  /** An action added to a branch: into the branch's own entry, made when it has none */
  static #onAddToBranch(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#goHome(target);
    const branch = target.dataset.branch as ActivityBranch;
    if (!(branch in BRANCH_EVENT)) return;
    let index = this.#drafts.findIndex(d => isBranchEntry(this.#entryForSave(d)) === branch);
    if (index < 0) {
      this.#drafts.push(this.#draftOf({ id: branchEntryId(branch), on: BRANCH_EVENT[branch], do: [] }));
      index = this.#drafts.length - 1;
    }
    this.#selected = index;
    this.#expanded = true;
    this.#picker = undefined;
    this.#recipes = undefined;
    this.#changeActions(list => list.push({ damage: "1d6", type: "fire" }));
  }

  static #onAddDamagePart(this: EntryEditor, _event: Event, target: HTMLElement) {
    const h = this.#homes[Number(target.dataset.home ?? this.#at)];
    if (!h?.card) return;
    const now = this.#activityNow(h);
    h.card.parts = [...(now.damage?.parts ?? []).map(part => ({ formula: partFormula(part), types: [...(part.types ?? [])] })), { formula: "1d6", types: [] }];
    this.render();
  }

  static #onOpenActivitySheet(this: EntryEditor, _event: Event, target: HTMLElement) {
    const activity = this.#homes[Number(target.dataset.home ?? this.#at)]?.document as { sheet?: { render(options: object): unknown } };
    activity?.sheet?.render({ force: true });
  }

  async _onRender(context: object, options: object) {
    await super._onRender(context, options);
    const name = this.#focus;
    this.#focus = undefined;
    if (!name) return;
    const field = this.element.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    field?.scrollIntoView({ block: "center" });
    field?.focus();
  }

  /**
   * M32d step 3: an effect's OverTime and ActivityOverTime changes as the entries midi reads them as (read only: their
   * values are worked out against the bearer as they are read, so a saved copy would fix them; conversion is M24's)
   */
  #overtimeShown(): string | undefined {
    const effect = this.#document instanceof ActiveEffect ? this.#document as ActiveEffect.Implementation : undefined;
    if (!effect) return undefined;
    const actor = effect.parent instanceof Actor ? effect.parent as Actor.Implementation : (effect.parent as { actor?: Actor.Implementation } | null)?.actor ?? undefined;
    try {
      const read = [...(actor ? overtimeEntries(effect, actor) : []), ...activityOvertimeEntries(effect)];
      return read.length ? JSON.stringify(read, null, 2) : undefined;
    } catch { return undefined; }
  }

  /** The parsed action list, or undefined while its JSON doesn't parse */
  #actionsOf(draft: Draft): EntryAction[] | undefined {
    try {
      const list = JSON.parse(draft.raw.do || "[]");
      return Array.isArray(list) ? list : undefined;
    } catch { return undefined; }
  }

  /** The item whose activities an entry may name (the activity's item, the item, an effect's item) */
  #item(): Item.Implementation | undefined {
    if (this.#root) return this.#root;
    if (isActivity(this.#document)) return this.#document.item;
    if (this.#document instanceof Item) return this.#document as Item.Implementation;
    const parent = (this.#document as { parent?: unknown }).parent;
    return parent instanceof Item ? parent as Item.Implementation : undefined;
  }

  /**
   * M32d step 2 (and the follow-up): each action as a card, its nested then / else actions (a save's or check's) as
   * cards under it, each card's path its place (`0`, `0_then_1`); an action without a schema is its own JSON
   */
  #actionCards(draft: Draft) {
    const list = this.#actionsOf(draft);
    if (!list) return undefined;
    const kinds = registeredActionKeys().sort().map(key => ({ value: key, label: actionSchema(key).label }));
    const cards: object[] = [];
    const walk = (actions: EntryAction[], prefix: string | undefined, depth: number, branch?: string) => {
      actions.forEach((action, i) => {
        const path = prefix === undefined ? `${i}` : `${prefix}_${branch}_${i}`;
        const key = action && typeof action === "object" ? actionKeyOf(action) : undefined;
        const { schema } = key ? actionSchema(key) : { schema: undefined };
        const branches = !!key && BRANCHING.has(key);
        const hasBranches = !!action && typeof action === "object" && ("then" in action || "else" in action);
        const fields = schema && (branches || !hasBranches)
          ? [...schema.fields, CONDITION_FIELD].map(field => this.#fieldContext(path, field, action, key)) : undefined;
        cards.push({
          path, key, depth, indent: depth * 16, branchLabel: i === 0 && (branch === "then" || branch === "else") ? i18n(`midi-qol.EntryEditor.Branch.${branch}`) : undefined,
          first: i === 0, last: i === actions.length - 1, canBranch: branches && !!fields, canAddRow: key === "table" && !!fields,
          kinds: kinds.map(k => ({ ...k, selected: k.value === key })), fields, json: fields ? undefined : JSON.stringify(action, null, 2)
        });
        if (fields && branches) for (const b of ["then", "else"] as const) {
          const nested = (action as Record<string, unknown>)[b];
          if (Array.isArray(nested) && nested.length) walk(nested as EntryAction[], path, depth + 1, b);
        }
        // A table's rows: each its own card (range, text), its actions as cards under it
        if (fields && key === "table") (rowsOf(action) ?? []).forEach((row, k) => {
          cards.push({ row: true, path, k, number: k + 1, indent: (depth + 1) * 16, name: `act.${path}.row.${k}`, min: row.range?.[0] ?? "", max: row.range?.[1] ?? row.range?.[0] ?? "", label: row.label ?? "" });
          walk(Array.isArray(row.do) ? row.do : [], path, depth + 2, `row${k}`);
        });
      });
    };
    walk(list, undefined, 0);
    return cards;
  }

  /** The choices of a field shown as a select; undefined for the others */
  #fieldOptions(field: ActionField): FieldOption[] | undefined {
    switch (field.type) {
      case "select":
      case "multiselect": {
        const options = field.options;
        if (typeof options === "function") return [...options()];
        if (options && "list" in options) return [...(options.include ?? []).map(value => ({ value, label: i18n(`midi-qol.Entries.Option.${value}`) })), ...optionList(options.list)];
        return (options ?? []).map(v => ({ value: v, label: v || i18n("midi-qol.EntryEditor.Default") }));
      }
      case "activity": return this.#activityOptions();
      case "tristate": return [{ value: "true", label: i18n("Yes") }, { value: "false", label: i18n("No") }];
      case "effectRef": {
        const effects = [...(this.#item()?.effects ?? [])].map(e => ({ value: e.name, label: e.name }));
        const statuses = CONFIG.statusEffects.filter(s => s.id && !effects.some(e => e.value === s.id))
          .map(s => ({ value: s.id, label: `${i18n(s.name ?? s.id)} (${i18n("midi-qol.EntryEditor.Status")})` }));
        return [...effects, ...statuses, { value: APPLIED, label: i18n("midi-qol.EntryEditor.AppliedByItem") }];
      }
      default: return undefined;
    }
  }

  #fieldContext(path: string, field: ActionField, action: EntryAction, key: string | undefined) {
    const value = getByPath(action, field.path);
    const name = `act.${path}.f.${field.path}`;
    if (field.type === "rollSpec") return { name, label: field.label, type: field.type, rollSpec: this.#rollSpecContext(name, value, key === "check") };
    if (field.type === "multiselect") {
      const chosen = [value ?? []].flat().map(String);
      const options = this.#fieldOptions(field) ?? [];
      // A value the list doesn't know (an old custom type) stays chosen and shown
      const unknown = chosen.filter(v => !options.some(o => o.value === v)).map(v => ({ value: v, label: `${v} ?` }));
      return { name, label: field.label, type: "multiselect", options: [...options, ...unknown].map(o => ({ ...o, selected: chosen.includes(o.value) })) };
    }
    const options = this.#fieldOptions(field);
    const shown = shownValue(field, value, options);
    const widget = options ? "select" : shown.custom ? "text" : ["boolean", "number", "condition"].includes(field.type) ? field.type : "text";
    return {
      name, label: field.label, type: widget, custom: shown.custom,
      value: options ? undefined : shown.text,
      checked: shown.text === true,
      options: options ? [...(options.some(o => o.value === "") ? [] : [{ value: "", label: i18n("midi-qol.EntryEditor.Default") }]), ...options,
        ...(shown.custom ? [{ value: CUSTOM, label: `${i18n("midi-qol.EntryEditor.Custom")}: ${JSON.stringify(value)}` }] : [])]
        .map(o => ({ ...o, selected: o.value === shown.text })) : undefined
    };
  }

  #activityOptions(): { value: string, label: string }[] {
    const activities = [...((this.#item()?.system as { activities?: Iterable<{ id: string, name?: string }> } | undefined)?.activities ?? [])];
    return activities.map(a => ({ value: `${ACTIVITY_REF}${a.id}`, label: a.name ?? a.id }));
  }

  /** A save's or check's what: the applying activity's (saves), one of the item's activities, or ability / skill / DC */
  #rollSpecContext(name: string, value: unknown, check: boolean) {
    const mode = typeof value === "string" && value.startsWith(ACTIVITY_REF) ? "activity"
      : value && typeof value === "object" ? "custom" : check ? "custom" : "applying";
    const spec = value && typeof value === "object" ? value as { ability?: string | string[], skill?: string | string[], dc?: unknown } : {};
    const config = (CONFIG as unknown as { DND5E?: { abilities?: Record<string, { label?: string }>, skills?: Record<string, { label?: string }> } }).DND5E ?? {};
    const ability = [spec.ability ?? []].flat()[0] ?? "";
    const skill = [spec.skill ?? []].flat()[0] ?? "";
    const modes = [...(check ? [] : ["applying"]), "activity", "custom"];
    return {
      modeName: `${name}.mode`, activityName: `${name}.activity`, abilityName: `${name}.ability`, skillName: `${name}.skill`, dcName: `${name}.dc`,
      check, custom: mode === "custom", activity: mode === "activity",
      modes: modes.map(m => ({ value: m, label: i18n(`midi-qol.EntryEditor.RollSpec.${m}`), selected: m === mode })),
      activities: this.#activityOptions().map(o => ({ ...o, value: o.value.slice(ACTIVITY_REF.length), selected: value === o.value })),
      abilities: Object.entries(config.abilities ?? {}).map(([k, v]) => ({ value: k, label: i18n(v.label ?? k), selected: k === ability })),
      skills: [{ value: "", label: "—", selected: !skill }, ...Object.entries(config.skills ?? {}).map(([k, v]) => ({ value: k, label: i18n(v.label ?? k), selected: k === skill }))],
      dc: spec.dc ?? ""
    };
  }

  /**
   * The cards' fields read back into the action list. Only a field whose widget was changed is written: what a widget
   * can't show (a formula in a number, a list of abilities) and keys the card doesn't name stay as they are stored.
   */
  #readActionCards(draft: Draft, data: Record<string, unknown>) {
    const list = this.#actionsOf(draft);
    if (!list) return;
    const paths = new Set(Object.keys(data).filter(k => k.startsWith("act.")).map(k => k.split(".")[1]));
    for (const path of paths) {
      const at = locateAction(list, path);
      if (!at) continue;
      const action = at.list[at.index] as Record<string, unknown>;
      const json = data[`act.${path}.json`];
      if (typeof json === "string") {
        try { at.list[at.index] = JSON.parse(json); } catch { draft.problems.push(`do[${path}]: JSON`); }
        continue;
      }
      const key = actionKeyOf(action);
      const kind = data[`act.${path}.kind`];
      // A new kind: a fresh action of that kind (its condition and label kept)
      if (typeof kind === "string" && kind && kind !== key) {
        const initial = actionSchema(kind).schema?.initial;
        at.list[at.index] = { ...(action.if ? { if: action.if as string } : {}), ...(action.label ? { label: action.label } : {}), [kind]: initial === undefined ? "" : foundry.utils.deepClone(initial) };
        continue;
      }
      const schema = key ? actionSchema(key).schema : undefined;
      // What the widgets showed: the action before any of this card's fields is written (two fields can share a key)
      const before = foundry.utils.deepClone(action);
      for (const field of [...(schema?.fields ?? []), CONDITION_FIELD]) {
        const name = `act.${path}.f.${field.path}`;
        if (field.type === "rollSpec") { this.#readRollSpec(action, field, name, data, key === "check"); continue; }
        if (field.type === "multiselect") {
          if (!(name in data)) continue;
          const chosen = ([] as unknown[]).concat(data[name] ?? []).map(String).filter(Boolean);
          if (JSON.stringify(chosen) === JSON.stringify([getByPath(before, field.path) ?? []].flat().map(String))) continue;
          if (chosen.length) setByPath(action, field.path, chosen);
          else deleteByPath(action, field.path);
          continue;
        }
        if (!(name in data) && field.type !== "boolean") continue;
        const shown = shownValue(field, getByPath(before, field.path), this.#fieldOptions(field));
        const submitted = field.type === "boolean" ? !!data[name] : String(data[name] ?? "");
        if (submitted === shown.text) continue;
        const value = typeof submitted === "boolean" ? submitted : parsedValue(field, submitted, shown.custom);
        const nothing = value === undefined || value === false && field.type === "boolean" || (Array.isArray(value) && !value.length);
        if (!nothing) setByPath(action, field.path, value);
        // the action's own key stays (end: true and the like are its value)
        else if (field.path === key) action[key] = value ?? "";
        else deleteByPath(action, field.path);
      }
      // A table's row cards: the range and text of each, where changed
      if (key === "table") (rowsOf(action) ?? []).forEach((row, k) => {
        const name = `act.${path}.row.${k}`;
        if (!(`${name}.min` in data)) return;
        const min = Number(data[`${name}.min`]), max = Number(data[`${name}.max`] ?? min);
        if (Number.isFinite(min) && Number.isFinite(max) && (row.range?.[0] !== min || (row.range?.[1] ?? row.range?.[0]) !== max)) row.range = [min, Math.max(min, max)];
        const label = String(data[`${name}.label`] ?? "");
        if (label !== (row.label ?? "")) row.label = label;
      });
    }
    draft.raw.do = JSON.stringify(list, null, 2);
  }

  /** A save's or check's what, read back: only the parts changed (other abilities or keys of a spec are kept) */
  #readRollSpec(action: Record<string, unknown>, field: ActionField, name: string, data: Record<string, unknown>, check: boolean) {
    if (!(`${name}.mode` in data)) return;
    const stored = getByPath(action, field.path);
    const was = this.#rollSpecContext(name, stored, check);
    const wasMode = was.custom ? "custom" : was.activity ? "activity" : "applying";
    const text = (part: string) => String(data[`${name}.${part}`] ?? "");
    const mode = text("mode");
    if (mode !== wasMode) {
      const value = mode === "applying" ? "applying" : mode === "activity" ? `${ACTIVITY_REF}${text("activity")}`
        : { ability: text("ability"), ...(text("skill") ? { skill: text("skill") } : {}), dc: Number.isNumeric(text("dc")) ? Number(text("dc")) : text("dc") };
      return void setByPath(action, field.path, value);
    }
    if (mode === "activity") {
      if (`${ACTIVITY_REF}${text("activity")}` !== stored) setByPath(action, field.path, `${ACTIVITY_REF}${text("activity")}`);
      return;
    }
    if (mode !== "custom") return;
    const spec: Record<string, unknown> = isPlain(stored) ? { ...stored } : {};
    const selected = (options: { value: string, selected: boolean }[]) => options.find(o => o.selected)?.value ?? "";
    let changed = false;
    if (text("ability") !== selected(was.abilities)) { spec.ability = text("ability"); changed = true; }
    if (check && text("skill") !== selected(was.skills)) {
      if (text("skill")) spec.skill = text("skill"); else delete spec.skill;
      changed = true;
    }
    if (text("dc") !== String(was.dc)) { spec.dc = Number.isNumeric(text("dc")) ? Number(text("dc")) : text("dc"); changed = true; }
    if (changed) setByPath(action, field.path, spec);
  }

  /** Changes the action list of the selected entry (a card's button), then re-checks and re-renders */
  #changeActions(change: (list: EntryAction[]) => void) {
    const draft = this.#drafts[this.#selected];
    const list = draft ? this.#actionsOf(draft) : undefined;
    if (!draft || !list) return;
    change(list);
    draft.raw.do = JSON.stringify(list, null, 2);
    draft.problems = this.#problemsOf(draft);
    this.render();
  }

  /** The entry as it is saved: its JSON fields parsed, empty fields left out */
  #entryForSave(draft: Draft): Entry {
    const entry: Entry = { ...draft.entry };
    try { entry.do = JSON.parse(draft.raw.do || "[]"); } catch { /* kept as it was */ }
    if (draft.raw.choose.trim()) { try { entry.choose = JSON.parse(draft.raw.choose); } catch { /* kept */ } }
    else delete entry.choose;
    for (const key of ["label", "if", "offer", "activity", "group"] as const) if (!entry[key]) delete entry[key];
    if (!entry.stacks) delete entry.stacks;
    if (!entry.limit?.per) delete entry.limit;
    if (entry.who === undefined) delete entry.who;
    return entry;
  }

  static async #onChange(this: EntryEditor, _event: Event, _form: HTMLFormElement, formData: foundry.applications.ux.FormDataExtended) {
    const draft = this.#drafts[this.#selected];
    const data = formData.object as Record<string, unknown>;
    this.#readCard(data);
    this.#readSettings(data);
    this.#readChanges(data);
    // The sentence view's other fields are the entry open under its sentence
    if (this.#view === "sentence" && !this.#expanded) return void this.render();
    const home = this.#homes[this.#at];
    if (typeof data.homeChoices === "string" && home.choices !== undefined) {
      home.choices = data.homeChoices;
      home.choicesProblem = undefined;
      try { if (!Array.isArray(JSON.parse(home.choices || "[]"))) home.choicesProblem = i18n("midi-qol.EntryEditor.Problem.Choices"); }
      catch (err) { home.choicesProblem = `${i18n("midi-qol.EntryEditor.Problem.Choices")}: ${(err as Error).message}`; }
    }
    if (!draft) return void this.render();
    if (this.#jsonView) {
      const text = String(data.json ?? "");
      draft.raw.json = text;
      try {
        const parsed = JSON.parse(text) as Entry;
        this.#drafts[this.#selected] = this.#draftOf(parsed);
        // Checked once it is in the list (a duplicate id is against the others)
        for (const d of this.#drafts) d.problems = this.#problemsOf(d);
      } catch (err) {
        draft.problems = [`JSON: ${(err as Error).message}`];
      }
      return void this.render();
    }
    const entry = draft.entry;
    entry.id = String(data.id ?? "").trim();
    const on = ([] as unknown[]).concat(data.on ?? []).map(String).filter(Boolean);
    entry.on = on.length === 1 ? on[0] : on;
    const whoKind = String(data.who ?? "");
    if (whoKind === NEAR) {
      const within = String(data.within ?? "") === "reach" ? "reach" as const : Number(data.within) || 5;
      entry.who = { within, of: String(data.of || "bearer"), ...(data.filter ? { filter: String(data.filter) } : {}) };
    } else if (whoKind === CUSTOM) {
      try { entry.who = JSON.parse(String(data.whoJson ?? "")) as EntryWho; } catch { /* kept as it was */ }
    } else entry.who = (whoKind || undefined) as EntryWho | undefined;
    entry.label = String(data.label ?? "");
    entry.if = String(data.if ?? "");
    if (data.ifPreset) entry.if = entry.if.trim() ? `${entry.if.trim()} && ${data.ifPreset}` : String(data.ifPreset);
    entry.offer = (String(data.offer ?? "") || undefined) as Entry["offer"];
    entry.activity = String(data.activity ?? "");
    const per = String(data.limitPer ?? "");
    entry.limit = per ? { per: per as NonNullable<Entry["limit"]>["per"], ...(data.limitMax ? { max: Number(data.limitMax) } : {}) } : undefined;
    entry.group = String(data.group ?? "");
    entry.stacks = !!data.stacks;
    // The action cards when the list parses, else its raw JSON
    if (typeof data.do === "string") draft.raw.do = data.do;
    else this.#readActionCards(draft, data);
    draft.raw.choose = String(data.choose ?? "");
    draft.raw.json = undefined;
    for (const d of this.#drafts) d.problems = this.#problemsOf(d);
    this.render();
  }

  static #onSelect(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#goHome(target);
    this.#selected = Number(target.dataset.index ?? 0);
    this.render();
  }

  static #onAdd(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#goHome(target);
    this.#recipes = undefined;
    let n = this.#drafts.length + 1;
    while (this.#drafts.some(d => d.entry.id === `entry${n}`)) n++;
    this.#drafts.push(this.#draftOf({ id: `entry${n}`, on: this.#home() === "effect" ? "hit" : "use.hit", do: [] }));
    this.#selected = this.#drafts.length - 1;
    // In sentences: straight to what it reacts to
    if (this.#view === "sentence") this.#picker = this.#selected;
    this.render();
  }

  static #onRemove(this: EntryEditor) {
    this.#drafts.splice(this.#selected, 1);
    this.#expanded = false;
    this.#selected = Math.max(0, Math.min(this.#selected, this.#drafts.length - 1));
    for (const d of this.#drafts) d.problems = this.#problemsOf(d);
    this.render();
  }

  static #onAddAction(this: EntryEditor) {
    this.#changeActions(list => list.push({ damage: "1d6", type: "fire" }));
  }

  static #onRemoveAction(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#changeActions(list => { const at = locateAction(list, target.dataset.path ?? ""); at?.list.splice(at.index, 1); });
  }

  static #onMoveAction(this: EntryEditor, _event: Event, target: HTMLElement) {
    const step = target.dataset.dir === "up" ? -1 : 1;
    this.#changeActions(list => {
      const at = locateAction(list, target.dataset.path ?? "");
      if (!at || at.index + step < 0 || at.index + step >= at.list.length) return;
      [at.list[at.index], at.list[at.index + step]] = [at.list[at.index + step], at.list[at.index]];
    });
  }

  /** A then / else action under a save or check */
  static #onAddBranch(this: EntryEditor, _event: Event, target: HTMLElement) {
    const branch = target.dataset.branch === "else" ? "else" : "then";
    this.#changeActions(list => {
      const at = locateAction(list, target.dataset.path ?? "");
      if (!at) return;
      const action = at.list[at.index] as Record<string, unknown>;
      action[branch] = [...(Array.isArray(action[branch]) ? action[branch] as EntryAction[] : []), { effect: "apply", what: "prone", to: "self" }];
    });
  }

  /** A row added to a table action, after its last */
  static #onAddRow(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#changeActions(list => {
      const at = locateAction(list, target.dataset.path ?? "");
      const table = at ? getByPath(at.list[at.index], "table") : undefined;
      if (!isPlain(table)) return;
      const rows = Array.isArray(table.rows) ? table.rows as TableRowData[] : (table.rows = []) as TableRowData[];
      const next = (rows.at(-1)?.range?.at(-1) ?? 0) + 1;
      rows.push({ range: [next, next], label: "", do: [] });
    });
  }

  static #onRemoveRow(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#changeActions(list => {
      const at = locateAction(list, target.dataset.path ?? "");
      if (at) rowsOf(at.list[at.index])?.splice(Number(target.dataset.row ?? -1), 1);
    });
  }

  static #onAddRowAction(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#changeActions(list => {
      const at = locateAction(list, target.dataset.path ?? "");
      const row = at ? rowsOf(at.list[at.index])?.[Number(target.dataset.row ?? -1)] : undefined;
      if (row) row.do = [...(Array.isArray(row.do) ? row.do : []), { effect: "apply", what: "prone", to: "self" }];
    });
  }

  /** Last runs shown, or read again */
  static #onShowRuns(this: EntryEditor) {
    this.#showRuns = true;
    this.#view = "sentence";
    this.render();
  }

  static #onMoveEntry(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#goHome(target);
    const index = Number(target.dataset.index ?? -1);
    const to = index + (target.dataset.dir === "up" ? -1 : 1);
    if (index < 0 || to < 0 || to >= this.#drafts.length) return;
    [this.#drafts[index], this.#drafts[to]] = [this.#drafts[to], this.#drafts[index]];
    if (this.#selected === index) this.#selected = to;
    else if (this.#selected === to) this.#selected = index;
    this.render();
  }

  /** A condition field's button: midi's condition editor (its autocomplete), its result written back to the field */
  static #onEditCondition(this: EntryEditor, _event: Event, target: HTMLElement) {
    const name = target.dataset.field ?? "";
    const field = this.element.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name='${name}']`);
    if (!field) return;
    const item = this.#item();
    new ConditionEditor({
      value: field.value, key: name, label: i18n("midi-qol.EntryEditor.Field.if"), parent: item?.parent instanceof Actor ? item.parent : item ?? null,
      // Found again: the editor may have re-rendered meanwhile
      onSubmit: (value: string) => {
        const now = this.element?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name='${name}']`);
        if (!now) return;
        now.value = value;
        now.dispatchEvent(new Event("change", { bubbles: true }));
      },
      onCancel: () => { }
    }).render({ force: true });
  }

  static #onSetView(this: EntryEditor, _event: Event, target: HTMLElement) {
    const view = target.dataset.view as View;
    if (!VIEWS.includes(view) || view === this.#view) return;
    this.#view = view;
    this.#picker = undefined;
    const draft = this.#drafts[this.#selected];
    if (draft) draft.raw.json = undefined;
    void game.settings.set(MODULE_ID, "EntryEditorView", view);
    this.render();
  }

  /** A sentence's part: its trigger opens the picker; any other goes to the field that edits it, in the form */
  static #onFocusPart(this: EntryEditor, _event: Event, target: HTMLElement) {
    const index = Number(target.dataset.index ?? 0);
    const focus = target.dataset.focus ?? "";
    this.#goHome(target);
    this.#recipes = undefined;
    const same = this.#selected === index;
    this.#selected = index;
    if (focus === "on") {
      this.#picker = this.#picker === index && same ? undefined : index;
      this.#expanded = false;
    } else {
      // Its form opens under the sentence with only the part clicked shown (All fields shows the rest)
      this.#expanded = true;
      this.#picker = undefined;
      this.#focus = focus;
      this.#only = onlyPart(focus);
    }
    this.render();
  }

  static #onAllEntryFields(this: EntryEditor) {
    this.#only = undefined;
    this.render();
  }

  static #onDoneEntryPart(this: EntryEditor) {
    this.#only = undefined;
    this.#expanded = false;
    this.render();
  }

  static #onEditEntry(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#goHome(target);
    this.#only = undefined;
    const index = Number(target.dataset.index ?? 0);
    this.#expanded = !(this.#expanded && this.#selected === index);
    this.#selected = index;
    this.#picker = undefined;
    this.render();
  }

  static #onClosePicker(this: EntryEditor) {
    this.#picker = undefined;
    this.#recipes = undefined;
    this.render();
  }

  /** A home's recipes, shown or hidden */
  static #onShowRecipes(this: EntryEditor, _event: Event, target: HTMLElement) {
    const at = Number(target.dataset.home ?? this.#at);
    this.#recipes = this.#recipes === at ? undefined : at;
    this.#picker = undefined;
    this.render();
  }

  /** A recipe's entry added to its home, under a free id */
  static #onToggleAddWhat(this: EntryEditor) {
    this.#addWhatOpen = !this.#addWhatOpen;
    this.render();
  }

  /** An activity made at once on the item (with the effect or save it needs), the editor reopened on it */
  static async #onAddWhat(this: EntryEditor, _event: Event, target: HTMLElement) {
    const item = this.#root;
    const kind = target.dataset.kind ?? "";
    // midi's kinds, or a registered one (addKinds service)
    const registered = kind.startsWith("x:") && item ? addKindDefs(item).find(def => def.id === kind.slice(2)) : undefined;
    if (!item || (!registered && !NEW_KINDS.includes(kind as NewKind))) return;
    if (this.#dirty()) return void ui.notifications?.warn(i18n("midi-qol.EntryEditor.AddWhat.saveFirst"));
    const spell = String(item.type) === "spell";
    let made: { activities: readonly Record<string, unknown>[], effects?: readonly Record<string, unknown>[] };
    if (registered) {
      try { made = registered.make({ item, spell, randomID: () => foundry.utils.randomID() }); }
      catch (err) { console.warn(`midi-qol | addKinds ${registered.id}: make() failed`, err); return; }
    } else made = newActivityData(kind as NewKind, { activity: foundry.utils.randomID(), effect: foundry.utils.randomID(), save: foundry.utils.randomID() }, { name: item.name, spell, img: item.img ?? undefined });
    if (made.effects?.length) await item.createEmbeddedDocuments("ActiveEffect", made.effects as never[], { keepId: true });
    // Activities without an id get one (the first is the one the editor reopens on)
    const activities = made.activities.map(a => ({ ...a, _id: typeof a._id === "string" && a._id ? a._id : foundry.utils.randomID() }));
    if (!activities.length) return;
    await item.update(Object.fromEntries(activities.map(a => [`system.activities.${a._id}`, a])));
    const activity = (item.system as { activities?: { get(id: string): EntryDocument | undefined } }).activities?.get(activities[0]._id);
    if (!activity) return;
    const position = { left: this.position.left, top: this.position.top, width: this.position.width, height: this.position.height };
    await this.close({ discard: true });
    await new EntryEditor(activity, { view: "sentence", position }).render({ force: true });
  }

  static #onUseRecipe(this: EntryEditor, _event: Event, target: HTMLElement) {
    const found = recipe(target.dataset.recipe ?? "");
    if (!found) return;
    this.#goHome(target);
    let id = found.id;
    for (let n = 2; this.#drafts.some(d => d.entry.id === id); n++) id = `${found.id}${n}`;
    this.#drafts.push(this.#draftOf({ id, ...foundry.utils.deepClone(found.entry(this.#home())) }));
    this.#selected = this.#drafts.length - 1;
    this.#recipes = undefined;
    this.#picker = undefined;
    this.render();
  }

  /** A trigger picked: the entry's event (Ctrl-click adds or removes one of several) and, where the trigger names one, its who */
  static #onSetTrigger(this: EntryEditor, event: Event, target: HTMLElement) {
    this.#goHome(target);
    const draft = this.#drafts[Number(target.dataset.index ?? -1)];
    const id = target.dataset.event;
    if (!draft || !id) return;
    const several = (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey;
    let on = [draft.entry.on ?? []].flat();
    if (!several) on = [id];
    else if (!on.includes(id)) on.push(id);
    else if (on.length > 1) on = on.filter(e => e !== id);
    draft.entry.on = on.length === 1 ? on[0] : on;
    const who = target.dataset.who;
    if (who !== undefined) draft.entry.who = who && who !== (this.#home() === "effect" ? "bearer" : "this") ? who as EntryWho : undefined;
    // A button needs a name
    if (id === "action" && !draft.entry.label) draft.entry.label = draft.entry.id;
    for (const d of this.#drafts) d.problems = this.#problemsOf(d);
    if (!several) this.#picker = undefined;
    this.render();
  }

  static async #onSave(this: EntryEditor) {
    if (this.#homes.some(h => h.choicesProblem || h.drafts.some(d => d.problems.length))) return void ui.notifications?.warn(i18n("midi-qol.EntryEditor.Problem.Fix"));
    if (!canEditEntries(this.#root ?? (isActivity(this.#document) ? this.#document.item : this.#document))) return void ui.notifications?.warn(i18n("midi-qol.EntryEditor.Problem.Permission"));
    // Only what changed is written, one document at a time
    for (const home of this.#homes) {
      const entries = home.drafts.map(d => this.#entryForSave(d));
      const changes: Record<string, unknown> = {};
      if (JSON.stringify(entries) !== home.stored) changes[home.kind === "activity" ? "midiEntries" : `flags.${MODULE_ID}.entries`] = entries;
      if (home.choices !== home.choicesStored) changes.midiChoices = JSON.parse(home.choices || "[]");
      // Effects the card added exist before anything refers to them
      if (home.card) await this.#createNewEffects(home);
      // A new roll: the activity replaced whole, its id kept (its entries and choices with it)
      if (home.card?.convertTo && home.card.convertTo !== this.#activitySource(home).type) {
        await this.#saveConverted(home, changes);
        continue;
      }
      // The card's edits are the activity's own data (paths relative to the activity)
      Object.assign(changes, this.#cardUpdate(home));
      // Its area: a save made for it first, then the region behaviour
      const areaUpdate = this.#areaUpdates(home);
      if (areaUpdate.newActivity) await (home.document as { item?: Item.Implementation }).item?.update({ [`system.activities.${areaUpdate.newActivity._id}`]: areaUpdate.newActivity });
      Object.assign(changes, areaUpdate.activity);
      // The weapon's damage
      const weaponChanges = this.#weaponUpdates(home);
      if (Object.keys(weaponChanges).length) await (home.document as { item?: Item.Implementation }).item?.update(weaponChanges);
      // Its basics: the activity's own, or the spell's / item's
      const basicsUpdates = this.#basicsUpdates(home);
      Object.assign(changes, basicsUpdates.activity);
      if (Object.keys(basicsUpdates.item).length) await (home.document as { item?: Item.Implementation }).item?.update(basicsUpdates.item);
      // Its targeting: the activity's own, or the spell's
      const targeting = this.#targetingUpdates(home);
      Object.assign(changes, targeting.activity);
      if (Object.keys(targeting.item).length) await (home.document as { item?: Item.Implementation }).item?.update(targeting.item);
      if (home.changes && JSON.stringify(home.changes.rows) !== home.changes.stored) changes[home.changes.path] = home.changes.rows.filter(row => String(row.key ?? "").trim());
      if (home.settings) {
        if (JSON.stringify(home.settings.values) !== home.settings.stored) changes[`flags.${MODULE_ID}.config`] = home.settings.values;
        if (home.settings.spec !== home.settings.specStored) changes[`flags.${MODULE_ID}.configSpec`] = JSON.parse(home.settings.spec || "[]");
      }
      if (Object.keys(changes).length) await home.document.update(changes);
    }
    // The item's on-use macros (midi prepares its parts from this string)
    if (this.#root && this.#onUse && onUseString(this.#onUse.rows) !== this.#onUse.stored)
      await this.#root.setFlag(MODULE_ID, "onUseMacroName", onUseString(this.#onUse.rows));
    this.#saved = true;
    await this.close();
  }
}

/** M32d step 4: what "Offer as a roll bonus" asks for, as an entry on the activity (the activity its cost) */
export interface RollBonusOffer {
  label: string;
  rolls: string[];
  when: "before" | "after";
  for: "self" | "allies" | "enemies" | "anyone";
  range: number;
  effect: "add" | "reroll" | "advantage";
  formula: string;
}

export function rollBonusEntry(activityId: string, offer: RollBonusOffer, id: string): Entry {
  const bonus = offer.effect === "add" ? { kind: "add", formula: offer.formula || "1d4" }
    : offer.effect === "reroll" ? { kind: "reroll", keep: "higher" } : { kind: "mode", mode: "advantage" };
  const filter = offer.for === "allies" ? "near.ally" : offer.for === "enemies" ? "!near.ally" : undefined;
  const who: EntryWho = offer.for === "self" ? "owner" : { within: offer.range || 30, of: "bearer", ...(filter ? { filter } : {}) };
  return {
    id, on: offer.when === "after" ? "roll.postResult" : "roll.preResult", who, offer: "ask", activity: activityId,
    ...(offer.label ? { label: offer.label } : {}),
    do: [{ bonus, rolls: offer.rolls.length ? offer.rolls : ["attack"] }]
  };
}

/** Asks how the activity is offered as a roll bonus, adds that entry to it, and opens the editor on it */
export async function offerAsRollBonus(activity: EntryDocument & { id?: string | null }): Promise<void> {
  const esc = foundry.utils.escapeHTML;
  const kinds = ["attack", "damage", "save", "check", "skill"];
  const option = (name: string, values: string[], selected: string) => `<select name="${name}">${values.map(v =>
    `<option value="${v}" ${v === selected ? "selected" : ""}>${esc(i18n(`midi-qol.RollBonusOffer.${name}.${v}`))}</option>`).join("")}</select>`;
  const content = `<div class="standard-form">
    <div class="form-group"><label>${esc(i18n("midi-qol.Entries.Field.label"))}</label><input type="text" name="label" value="${esc(activity.name ?? "")}"></div>
    <div class="form-group"><label>${esc(i18n("midi-qol.Entries.Field.rolls"))}</label><div>${kinds.map(k =>
      `<label class="checkbox"><input type="checkbox" name="rolls" value="${k}" ${k === "attack" ? "checked" : ""}> ${esc(i18n(`midi-qol.RollBonusOffer.rolls.${k}`))}</label>`).join(" ")}</div></div>
    <div class="form-group"><label>${esc(i18n("midi-qol.RollBonusOffer.When"))}</label>${option("when", ["before", "after"], "before")}</div>
    <div class="form-group"><label>${esc(i18n("midi-qol.RollBonusOffer.For"))}</label>${option("for", ["self", "allies", "enemies", "anyone"], "self")}
      <input type="number" name="range" value="30" min="5" step="5"></div>
    <div class="form-group"><label>${esc(i18n("midi-qol.RollBonusOffer.Effect"))}</label>${option("effect", ["add", "reroll", "advantage"], "add")}
      <input type="text" name="formula" value="1d4"></div>
  </div>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: i18n("midi-qol.RollBonusOffer.Title") },
    content,
    ok: { callback: (_event: Event, button: HTMLButtonElement) => {
      const form = button.form!;
      const data = new foundry.applications.ux.FormDataExtended(form).object as Record<string, unknown>;
      const rolls = Array.from(form.querySelectorAll<HTMLInputElement>("input[name='rolls']:checked")).map(input => input.value);
      return { label: String(data.label ?? ""), rolls, when: data.when, for: data.for, range: Number(data.range) || 30, effect: data.effect, formula: String(data.formula ?? "") } as RollBonusOffer;
    } },
    rejectClose: false
  }).catch(() => undefined) as RollBonusOffer | undefined;
  if (!result || !activity.id) return;
  const existing = entriesOfDocument(activity);
  let n = 1;
  while (existing.some(e => e.id === `rollBonus${n}`)) n++;
  await activity.update({ midiEntries: [...existing, rollBonusEntry(activity.id, result, `rollBonus${n}`)] });
  void new EntryEditor(activity).render({ force: true });
}

/** The editor's header button on item, effect and activity sheets (GMs and the document's owners) */
export function registerEntryEditorControls() {
  // onClick: Foundry 14's header controls (fvtt-types 13 doesn't have it)
  type Control = foundry.applications.api.ApplicationV2.HeaderControlsEntry & { onClick: () => void };
  const control = (document: () => EntryDocument | undefined): Control => ({
    icon: "fa-solid fa-diagram-project",
    label: "midi-qol.EntryEditor.Open",
    action: "midiEntryEditor",
    onClick: () => { const doc = document(); if (doc) void new EntryEditor(doc).render({ force: true }); }
  });
  const editable = canEditEntries;
  Hooks.on("getHeaderControlsItemSheet5e", (app, controls) => {
    if (editable(app.document)) controls.push(control(() => app.document));
  });
  Hooks.on("getHeaderControlsActiveEffectConfig", (app: foundry.applications.api.DocumentSheetV2<ActiveEffect>, controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]) => {
    if (editable(app.document)) controls.push(control(() => app.document));
  });
  Hooks.on("getHeaderControlsActivitySheet", (app, controls) => {
    // dnd5e's ActivitySheet: its activity
    const activity = (app as { activity?: EntryDocument & { item?: { isOwner?: boolean } } }).activity;
    if (!editable(activity?.item)) return;
    controls.push(control(() => activity));
    const offer: Control = { icon: "fa-solid fa-dice-d20", label: "midi-qol.RollBonusOffer.Title", action: "midiOfferRollBonus",
      onClick: () => { if (activity) void offerAsRollBonus(activity); } };
    controls.push(offer);
  });
}
