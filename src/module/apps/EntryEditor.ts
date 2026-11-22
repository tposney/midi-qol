import { i18n, MODULE_ID } from "../../midi-qol.js";
import { actionProblems, registeredEvents } from "../lib/entries/engine.js";
import type { Entry, EntryWho } from "../lib/entries/types.js";

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
type Draft = { entry: Entry, raw: { do: string, choose: string, json?: string }, problems: string[] };

const NEAR = "near";
const WHO_CHOICES = ["", "this", "owner", "bearer", "origin", NEAR];
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
  #document: EntryDocument;
  #drafts: Draft[];
  #selected = 0;
  #jsonView = false;

  constructor(document: EntryDocument, options = {}) {
    super(options);
    this.#document = document;
    this.#drafts = entriesOfDocument(document).map(entry => this.#draftOf(entry));
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
      toggleJson: EntryEditor.#onToggleJson,
      save: EntryEditor.#onSave
    }
  };

  static PARTS = {
    editor: { template: "modules/midi-qol/templates/apps/EntryEditor/entryEditor.hbs", scrollable: [".midi-qol-entry-list", ".midi-qol-entry-form"] }
  };

  get title() {
    return `${i18n("midi-qol.EntryEditor.Title")}: ${this.#document.name ?? ""}`;
  }

  #draftOf(entry: Entry): Draft {
    const draft: Draft = { entry, raw: { do: JSON.stringify(entry.do ?? [], null, 2), choose: entry.choose ? JSON.stringify(entry.choose, null, 2) : "" }, problems: [] };
    draft.problems = this.#problemsOf(draft);
    return draft;
  }

  #problemsOf(draft: Draft): string[] {
    const problems: string[] = [];
    const entry = draft.entry;
    if (!entry.id?.trim()) problems.push(i18n("midi-qol.EntryEditor.Problem.Id"));
    if (this.#drafts?.some(other => other !== draft && other.entry.id === entry.id)) problems.push(i18n("midi-qol.EntryEditor.Problem.DuplicateId"));
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
    const near = who && typeof who === "object" && !Array.isArray(who) ? who as Extract<EntryWho, { within: unknown }> : undefined;
    const option = (value: string, prefix: string, selected: unknown) => ({ value, label: value ? i18n(`midi-qol.EntryEditor.${prefix}.${value}`) : i18n("midi-qol.EntryEditor.Default"), selected: value === (selected ?? "") });
    const item = isActivity(this.#document) ? this.#document.item : this.#document instanceof Item ? this.#document : undefined;
    const activities = [...((item?.system as { activities?: Iterable<{ id: string, name?: string }> } | undefined)?.activities ?? [])];
    return {
      ...context,
      list: this.#drafts.map((d, index) => ({ index, id: d.entry.id || "?", on: [d.entry.on].flat().join(", "), selected: index === this.#selected, invalid: d.problems.length > 0 })),
      hasEntry: !!entry,
      jsonView: this.#jsonView,
      json: draft ? draft.raw.json ?? JSON.stringify(this.#entryForSave(draft), null, 2) : "",
      entry,
      events: [...events.map(e => ({ value: e.id, label: `${e.label} (${e.id})`, selected: on.includes(e.id) })),
        ...unknownEvents.map(id => ({ value: id, label: `${id} ?`, selected: true }))],
      who: WHO_CHOICES.map(value => option(value, "Who", near ? NEAR : typeof who === "string" ? who : "")),
      near: near ? { within: near.within, of: near.of, filter: near.filter ?? "" } : undefined,
      offers: OFFERS.map(value => option(value, "Offer", entry?.offer)),
      limits: LIMITS.map(value => option(value, "Limit", entry?.limit?.per)),
      activities: [{ value: "", label: i18n("midi-qol.EntryEditor.Default"), selected: !entry?.activity },
        ...activities.map(a => ({ value: a.id, label: a.name ?? a.id, selected: a.id === entry?.activity }))],
      rawDo: draft?.raw.do ?? "",
      rawChoose: draft?.raw.choose ?? "",
      problems: draft?.problems ?? [],
      canSave: this.#drafts.every(d => !d.problems.length)
    };
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
    if (!draft) return;
    const data = formData.object as Record<string, unknown>;
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
    } else entry.who = (whoKind || undefined) as EntryWho | undefined;
    entry.label = String(data.label ?? "");
    entry.if = String(data.if ?? "");
    entry.offer = (String(data.offer ?? "") || undefined) as Entry["offer"];
    entry.activity = String(data.activity ?? "");
    const per = String(data.limitPer ?? "");
    entry.limit = per ? { per: per as NonNullable<Entry["limit"]>["per"], ...(data.limitMax ? { max: Number(data.limitMax) } : {}) } : undefined;
    entry.group = String(data.group ?? "");
    entry.stacks = !!data.stacks;
    draft.raw.do = String(data.do ?? "");
    draft.raw.choose = String(data.choose ?? "");
    draft.raw.json = undefined;
    for (const d of this.#drafts) d.problems = this.#problemsOf(d);
    this.render();
  }

  static #onSelect(this: EntryEditor, _event: Event, target: HTMLElement) {
    this.#selected = Number(target.dataset.index ?? 0);
    this.render();
  }

  static #onAdd(this: EntryEditor) {
    let n = this.#drafts.length + 1;
    while (this.#drafts.some(d => d.entry.id === `entry${n}`)) n++;
    this.#drafts.push(this.#draftOf({ id: `entry${n}`, on: "use.hit", do: [] }));
    this.#selected = this.#drafts.length - 1;
    this.render();
  }

  static #onRemove(this: EntryEditor) {
    this.#drafts.splice(this.#selected, 1);
    this.#selected = Math.max(0, Math.min(this.#selected, this.#drafts.length - 1));
    for (const d of this.#drafts) d.problems = this.#problemsOf(d);
    this.render();
  }

  static #onToggleJson(this: EntryEditor) {
    this.#jsonView = !this.#jsonView;
    const draft = this.#drafts[this.#selected];
    if (draft) draft.raw.json = undefined;
    this.render();
  }

  static async #onSave(this: EntryEditor) {
    if (this.#drafts.some(d => d.problems.length)) return void ui.notifications?.warn(i18n("midi-qol.EntryEditor.Problem.Fix"));
    const entries = this.#drafts.map(d => this.#entryForSave(d));
    if (isActivity(this.#document)) await this.#document.update({ midiEntries: entries });
    else await this.#document.update({ [`flags.${MODULE_ID}.entries`]: entries });
    await this.close();
  }
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
  const editable = (doc: { isOwner?: boolean } | undefined) => !!doc && (game.user?.isGM || doc.isOwner);
  Hooks.on("getHeaderControlsItemSheet5e", (app, controls) => {
    if (editable(app.document)) controls.push(control(() => app.document));
  });
  Hooks.on("getHeaderControlsActiveEffectConfig", (app: foundry.applications.api.DocumentSheetV2<ActiveEffect>, controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]) => {
    if (editable(app.document)) controls.push(control(() => app.document));
  });
  Hooks.on("getHeaderControlsActivitySheet", (app, controls) => {
    // dnd5e's ActivitySheet: its activity
    const activity = (app as { activity?: EntryDocument & { item?: { isOwner?: boolean } } }).activity;
    if (editable(activity?.item)) controls.push(control(() => activity));
  });
}
