import { i18n, MODULE_ID } from "../../midi-qol.js";
import { actionKeyOf, actionProblems, actionSchema, registeredActionKeys, registeredEvents, type ActionField } from "../lib/entries/engine.js";
import type { Entry, EntryAction, EntryWho } from "../lib/entries/types.js";
import { activityOvertimeEntries, overtimeEntries } from "../lib/entries/overtime.js";
import { ACTIVITY_REF } from "../lib/entries/activityActions.js";
import { ConditionEditor } from "./ConditionEditor.js";

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
/** Actions whose then / else run on their roll's result */
const BRANCHING = new Set(["save", "check"]);
/** Every card's own condition */
const CONDITION_FIELD: ActionField = { path: "if", label: "midi-qol.EntryEditor.Field.if", type: "condition" };
/** Events that mean something only on an effect (its ending, its origin's turn) */
const EFFECT_ONLY = new Set(["ended", "originTurnStart", "originTurnEnd"]);

/** An action by its card path (`0`, `0_then_1`): the list it is in and its index */
function locateAction(root: EntryAction[], path: string): { list: EntryAction[], index: number } | undefined {
  const parts = path.split("_");
  let list = root;
  let index = Number(parts[0]);
  for (let i = 1; i < parts.length; i += 2) {
    const nested = (list[index] as Record<string, unknown> | undefined)?.[parts[i]];
    if (!Array.isArray(nested)) return undefined;
    list = nested as EntryAction[];
    index = Number(parts[i + 1]);
  }
  return Number.isInteger(index) && list[index] !== undefined ? { list, index } : undefined;
}
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
      addAction: EntryEditor.#onAddAction,
      removeAction: EntryEditor.#onRemoveAction,
      moveAction: EntryEditor.#onMoveAction,
      addBranch: EntryEditor.#onAddBranch,
      moveEntry: EntryEditor.#onMoveEntry,
      editCondition: EntryEditor.#onEditCondition,
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
      list: this.#drafts.map((d, index) => ({ index, id: d.entry.id || "?", on: [d.entry.on].flat().join(", "), selected: index === this.#selected, invalid: d.problems.length > 0,
        first: index === 0, last: index === this.#drafts.length - 1 })),
      hasEntry: !!entry,
      jsonView: this.#jsonView,
      json: draft ? draft.raw.json ?? JSON.stringify(this.#entryForSave(draft), null, 2) : "",
      entry,
      events: [...events.map(e => ({ value: e.id, label: `${e.label} (${e.id})${EFFECT_ONLY.has(e.id) ? ` ${i18n("midi-qol.EntryEditor.EffectsOnly")}` : ""}`, selected: on.includes(e.id) })),
        ...unknownEvents.map(id => ({ value: id, label: `${id} ?`, selected: true }))],
      who: WHO_CHOICES.map(value => option(value, "Who", near ? NEAR : typeof who === "string" ? who : "")),
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
      canSave: this.#drafts.every(d => !d.problems.length)
    };
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
    const walk = (actions: EntryAction[], prefix: string | undefined, depth: number, branch?: "then" | "else") => {
      actions.forEach((action, i) => {
        const path = prefix === undefined ? `${i}` : `${prefix}_${branch}_${i}`;
        const key = action && typeof action === "object" ? actionKeyOf(action) : undefined;
        const { schema } = key ? actionSchema(key) : { schema: undefined };
        const branches = !!key && BRANCHING.has(key);
        const hasBranches = !!action && typeof action === "object" && ("then" in action || "else" in action);
        const fields = schema && (branches || !hasBranches)
          ? [...schema.fields, CONDITION_FIELD].map(field => this.#fieldContext(path, field, action, key)) : undefined;
        cards.push({
          path, key, depth, indent: depth * 16, branchLabel: i === 0 && branch ? i18n(`midi-qol.EntryEditor.Branch.${branch}`) : undefined,
          first: i === 0, last: i === actions.length - 1, canBranch: branches && !!fields,
          kinds: kinds.map(k => ({ ...k, selected: k.value === key })), fields, json: fields ? undefined : JSON.stringify(action, null, 2)
        });
        if (fields && branches) for (const b of ["then", "else"] as const) {
          const nested = (action as Record<string, unknown>)[b];
          if (Array.isArray(nested) && nested.length) walk(nested as EntryAction[], path, depth + 1, b);
        }
      });
    };
    walk(list, undefined, 0);
    return cards;
  }

  #fieldContext(path: string, field: ActionField, action: EntryAction, key: string | undefined) {
    const value = foundry.utils.getProperty(action, field.path);
    const name = `act.${path}.f.${field.path}`;
    if (field.type === "rollSpec") return { name, label: field.label, type: field.type, rollSpec: this.#rollSpecContext(name, value, key === "check") };
    let options = typeof field.options === "function" ? field.options() : (field.options ?? []).map(v => ({ value: v, label: v || i18n("midi-qol.EntryEditor.Default") }));
    if (field.type === "activity") options = this.#activityOptions();
    const select = field.type === "select" || field.type === "activity";
    return {
      name, label: field.label, type: select ? "select" : field.type,
      value: field.type === "list" ? [value ?? []].flat().join(", ") : value ?? "",
      checked: field.type === "boolean" && !!value,
      options: select ? [...(options.some(o => o.value === "") ? [] : [{ value: "", label: i18n("midi-qol.EntryEditor.Default") }]), ...options]
        .map(o => ({ ...o, selected: o.value === (value ?? "") })) : undefined
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

  /** The cards' fields read back into the action list (an action's other keys kept) */
  #readActionCards(draft: Draft, data: Record<string, unknown>) {
    const list = this.#actionsOf(draft);
    if (!list) return;
    const cards = foundry.utils.expandObject(Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith("act.")))) as { act?: Record<string, { kind?: string, f?: Record<string, unknown>, json?: string }> };
    for (const [path, card] of Object.entries(cards.act ?? {})) {
      const at = locateAction(list, path);
      if (!at) continue;
      let action = at.list[at.index];
      if (typeof card.json === "string") {
        try { at.list[at.index] = JSON.parse(card.json); } catch { draft.problems.push(`do[${path}]: JSON`); }
        continue;
      }
      const key = actionKeyOf(action);
      // A new kind: a fresh action of that kind (its condition and label kept)
      if (card.kind && card.kind !== key) {
        at.list[at.index] = { ...(action.if ? { if: action.if } : {}), ...(action.label ? { label: action.label } : {}), [card.kind]: card.kind === "save" ? "applying" : "" };
        continue;
      }
      const schema = key ? actionSchema(key).schema : undefined;
      for (const field of [...(schema?.fields ?? []), CONDITION_FIELD]) {
        const raw = foundry.utils.getProperty(card.f ?? {}, field.path);
        if (field.type === "rollSpec") {
          const spec = (raw ?? {}) as { mode?: string, activity?: string, ability?: string, skill?: string, dc?: string };
          const value = spec.mode === "applying" ? "applying" : spec.mode === "activity" ? `${ACTIVITY_REF}${spec.activity ?? ""}`
            : { ability: spec.ability ?? "", ...(spec.skill ? { skill: spec.skill } : {}), dc: Number.isNumeric(spec.dc) ? Number(spec.dc) : spec.dc ?? "" };
          foundry.utils.setProperty(action, field.path, value);
          continue;
        }
        let value: unknown = raw;
        if (field.type === "boolean") value = !!raw;
        else if (field.type === "number") value = raw === "" || raw === undefined || raw === null ? undefined : Number(raw);
        else if (field.type === "list") value = String(raw ?? "").split(",").map(v => v.trim()).filter(Boolean);
        else value = raw === "" ? undefined : raw;
        if (value === undefined || value === false || (Array.isArray(value) && !value.length)) {
          // the action's own key stays (end: true and the like are its value)
          if (field.path !== key) foundry.utils.deleteProperty(action, field.path);
          else foundry.utils.setProperty(action, field.path, value ?? "");
        } else foundry.utils.setProperty(action, field.path, value);
      }
    }
    draft.raw.do = JSON.stringify(list, null, 2);
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
    // The action cards when the list parses, else its raw JSON
    if (typeof data.do === "string") draft.raw.do = data.do;
    else this.#readActionCards(draft, data);
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

  static #onMoveEntry(this: EntryEditor, _event: Event, target: HTMLElement) {
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
    if (!editable(activity?.item)) return;
    controls.push(control(() => activity));
    const offer: Control = { icon: "fa-solid fa-dice-d20", label: "midi-qol.RollBonusOffer.Title", action: "midiOfferRollBonus",
      onClick: () => { if (activity) void offerAsRollBonus(activity); } };
    controls.push(offer);
  });
}
