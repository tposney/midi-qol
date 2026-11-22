import { i18n, MODULE_ID } from "../../midi-qol.js";
import { actionKeyOf, actionProblems, actionSchema, entryChecks, registeredActionKeys, registeredEvents, type ActionField } from "../lib/entries/engine.js";
import type { Entry, EntryAction, EntryHome, EntryWho } from "../lib/entries/types.js";
import { conditionPresets, entrySentence, triggerGroups } from "../lib/entries/sentences.js";
import { recipe, recipesFor } from "../lib/entries/recipes.js";
import { activityOvertimeEntries, overtimeEntries } from "../lib/entries/overtime.js";
import { ACTIVITY_REF } from "../lib/entries/activityActions.js";
import { ConditionEditor } from "./ConditionEditor.js";
import { contributedActivityCard, optionList } from "../lib/entries/editorServices.js";
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
type Home = { document: EntryDocument, kind: EntryHome, label: string, drafts: Draft[], stored: string, choices?: string, choicesStored?: string, choicesProblem?: string, card?: CardEdits };
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
  /** The activity home whose card's fields are open */
  #cardOpen: number | undefined;

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
      const home: Home = {
        document: d, kind, stored: JSON.stringify(entries), choices, choicesStored: choices, ...(kind === "activity" ? { card: {} } : {}),
        label: kind === "item" ? i18n("midi-qol.EntryEditor.Home.item") : game.i18n?.format(`midi-qol.EntryEditor.Home.${kind}`, { name: d.name ?? "" }) ?? d.name ?? "",
        drafts: entries.map(entry => ({ entry, raw: { do: JSON.stringify(entry.do ?? [], null, 2), choose: entry.choose ? JSON.stringify(entry.choose, null, 2) : "" }, problems: [] }))
      };
      for (const draft of home.drafts) draft.problems = this.#problemsOf(draft, home.drafts);
      return home;
    });
    this.#at = Math.max(0, this.#homes.findIndex(home => same(home.document, document)));
    const last = game.settings.get(MODULE_ID, "EntryEditorView") as View;
    this.#view = view ?? (VIEWS.includes(last) ? last : "sentence");
  }

  get #jsonView() { return this.#view === "json"; }

  /** Whether anything differs from what was read */
  #dirty(): boolean {
    return this.#homes.some(h => h.choices !== h.choicesStored || JSON.stringify(h.drafts.map(d => this.#entryForSave(d))) !== h.stored
      || Object.keys(this.#cardUpdate(h)).length > 0);
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
      editActivity: EntryEditor.#onEditActivity,
      addToBranch: EntryEditor.#onAddToBranch,
      addDamagePart: EntryEditor.#onAddDamagePart,
      openActivitySheet: EntryEditor.#onOpenActivitySheet,
      save: EntryEditor.#onSave
    }
  };

  static PARTS = {
    editor: { template: "modules/midi-qol/templates/apps/EntryEditor/entryEditor.hbs", scrollable: [".midi-qol-entry-list", ".midi-qol-entry-form"] }
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
        entries: h.drafts.map((d, index) => ({ index, home: at, id: d.entry.id || "?", on: [d.entry.on].flat().join(", "), selected: at === this.#at && index === this.#selected,
          invalid: d.problems.length > 0, first: index === 0, last: index === h.drafts.length - 1 }))
      })),
      homeLabel: this.#homes.length > 1 ? home.label : undefined,
      activityCard: this.#view === "form" && home.card ? this.#cardContext(home, this.#at) : undefined,
      homeChoices: this.#view === "form" ? home.choices : undefined,
      homeChoicesProblem: home.choicesProblem,
      ifPresets: conditionPresets(),
      hasEntry: !!entry,
      jsonView: this.#jsonView,
      sentenceView: this.#view === "sentence",
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
      actionCards: draft ? this.#actionCards(draft) : undefined,
      // An empty list is falsy in Handlebars: whether the list parsed
      cardsShown: !!draft && this.#actionsOf(draft) !== undefined,
      rawChoose: draft?.raw.choose ?? "",
      problems: draft?.problems ?? [],
      // Not wrong, but likely a mistake: an effect-only event on an item or activity
      warnings: this.#document instanceof ActiveEffect ? [] : on.filter(id => EFFECT_ONLY.has(id))
        .map(id => game.i18n?.format("midi-qol.EntryEditor.Warning.EffectOnly", { id }) ?? id),
      overtime: this.#overtimeShown(),
      canSave: this.#homes.every(h => !h.choicesProblem && h.drafts.every(d => !d.problems.length))
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

  /* The activity card: what an activity does by itself, by branch, and what was added to each branch */

  /** The activity's own data as stored */
  #activitySource(h: Home): ActivityData {
    const source = (h.document as { _source?: ActivityData, type?: string })._source;
    return foundry.utils.deepClone(source ?? { type: (h.document as { type?: string }).type ?? "" }) as ActivityData;
  }

  /** The update the card's edits make to the activity (only what changed) */
  #cardUpdate(h: Home): Record<string, unknown> {
    return h.card ? activityUpdate(this.#activitySource(h), h.card) : {};
  }

  /** The activity as it will be once saved */
  #activityNow(h: Home): ActivityData {
    const source = this.#activitySource(h);
    return foundry.utils.mergeObject(source, foundry.utils.expandObject(this.#cardUpdate(h)), { inplace: false }) as ActivityData;
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
      effectName: id => item?.effects.get(id)?.name ?? id,
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
    const branches = model.branches.map(b => {
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
    return { home: at, when: model.when.map(chip), branches, open: this.#cardOpen === at ? this.#cardFields(data) : undefined };
  }

  /** The open card's fields: what can be edited here (the rest on the activity's sheet) */
  #cardFields(data: ActivityData) {
    const abilities = Object.entries(CONFIG.DND5E.abilities as Record<string, { label?: string }>).map(([id, a]) => ({ id, label: a.label ?? id }));
    const damageTypes = Object.entries({ ...(CONFIG.DND5E.damageTypes as Record<string, { label?: string }>) }).map(([id, t]) => ({ id, label: t.label ?? id }));
    const healingTypes = Object.entries({ ...(CONFIG.DND5E.healingTypes as Record<string, { label?: string }>) }).map(([id, t]) => ({ id, label: t.label ?? id }));
    const option = (value: string, label: string, selected: boolean) => ({ value, label, selected });
    const save = data.type === "save";
    const calculation = data.save?.dc?.calculation ?? "";
    return {
      save: save ? {
        abilities: abilities.map(a => option(a.id, a.label, (data.save?.ability ?? []).includes(a.id))),
        calculations: [option("spellcasting", i18n("midi-qol.EntryEditor.Activity.DCField.spellcasting"), calculation === "spellcasting"),
          ...abilities.map(a => option(a.id, a.label, calculation === a.id)),
          option("", i18n("midi-qol.EntryEditor.Activity.DCField.custom"), calculation === "")],
        custom: calculation === "", formula: data.save?.dc?.formula ?? "",
        onSave: (data.damage?.parts?.length ?? 0) ? ["half", "none", "full"].map(v => option(v, i18n(`midi-qol.EntryEditor.Activity.OnSave.${v}`), (data.damage?.onSave ?? "half") === v)) : undefined
      } : undefined,
      parts: data.damage ? (data.damage.parts ?? []).map((part, i) => ({ i, formula: partFormula(part),
        types: [option("", "—", !(part.types ?? []).length), ...damageTypes.map(t => option(t.id, t.label, (part.types ?? [])[0] === t.id))] })) : undefined,
      healing: data.healing ? { formula: partFormula(data.healing), types: [option("", "—", !(data.healing.types ?? []).length), ...healingTypes.map(t => option(t.id, t.label, (data.healing!.types ?? [])[0] === t.id))] } : undefined,
      effects: save ? (data.effects ?? []).map(e => ({ id: e._id, name: this.#cardText().effectName(e._id), onSave: !!e.onSave })) : undefined
    };
  }

  /** The open card's fields read into its edits */
  #readCard(data: Record<string, unknown>) {
    const h = this.#cardOpen === undefined ? undefined : this.#homes[this.#cardOpen];
    if (!h?.card || !Object.keys(data).some(k => k.startsWith("card."))) return;
    const now = this.#activityNow(h);
    const edits = h.card;
    if ("card.saveAbility" in data) edits.saveAbility = ([] as unknown[]).concat(data["card.saveAbility"] ?? []).map(String).filter(Boolean);
    if ("card.dcCalculation" in data) edits.dcCalculation = String(data["card.dcCalculation"] ?? "");
    if ("card.dcFormula" in data) edits.dcFormula = String(data["card.dcFormula"] ?? "");
    if ("card.onSave" in data) edits.onSave = String(data["card.onSave"] ?? "half");
    const parts = (now.damage?.parts ?? []).map((part, i) => ({
      formula: String(data[`card.part.${i}.formula`] ?? partFormula(part)), type: String(data[`card.part.${i}.type`] ?? (part.types ?? [])[0] ?? "")
    }));
    if (parts.length) edits.parts = parts;
    if (now.healing && "card.healing.formula" in data) edits.healing = { formula: String(data["card.healing.formula"] ?? ""), type: String(data["card.healing.type"] ?? "") };
    const onSave: Record<string, boolean> = {};
    for (const e of now.effects ?? []) if (`card.effect.${e._id}` in data) onSave[e._id] = !!data[`card.effect.${e._id}`];
    if (Object.keys(onSave).length) edits.effectsOnSave = { ...edits.effectsOnSave, ...onSave };
  }

  /** A built-in part clicked: the card's fields open (closed again by the same part) */
  static #onEditActivity(this: EntryEditor, _event: Event, target: HTMLElement) {
    const at = Number(target.dataset.home ?? this.#at);
    this.#cardOpen = this.#cardOpen === at && !target.dataset.field ? undefined : at;
    if (target.dataset.field) this.#focus = `card.${target.dataset.field === "save" ? "saveAbility" : target.dataset.field === "dc" ? "dcCalculation" : target.dataset.field.startsWith("part.") ? `${target.dataset.field}.formula` : target.dataset.field.startsWith("effect.") ? target.dataset.field : target.dataset.field === "healing" ? "healing.formula" : "saveAbility"}`;
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
    h.card.parts = [...(now.damage?.parts ?? []).map(part => ({ formula: partFormula(part), type: (part.types ?? [])[0] ?? "" })), { formula: "1d6", type: "" }];
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
      case "select": {
        const options = field.options;
        if (typeof options === "function") return [...options()];
        if (options && "list" in options) return optionList(options.list);
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
      // Its form opens under the sentence, at the field that edits the part
      this.#expanded = true;
      this.#picker = undefined;
      this.#focus = focus;
    }
    this.render();
  }

  static #onEditEntry(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#goHome(target);
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
      // The card's edits are the activity's own data (paths relative to the activity)
      Object.assign(changes, this.#cardUpdate(home));
      if (Object.keys(changes).length) await home.document.update(changes);
    }
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
