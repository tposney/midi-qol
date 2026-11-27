import { conditionProblem, conditionWords, fromRows, parseCondition, slotDefault, toRows, type ConditionNode, type ConditionPhraseDef, type ConditionRows, type SlotValue } from "../lib/entries/conditionPhrases.js";
import { conditionWording, slotOptions } from "../lib/entries/conditionVocabulary.js";
import { conditionPhraseDefs } from "../lib/entries/editorServices.js";
import { ConditionEditor } from "./ConditionEditor.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface ConditionBuilderOptions {
  value: string;
  label?: string;
  parent?: Actor | Item | null;
  onSubmit: (value: string) => void;
}

const CODE = "__code";
const say = (key: string, data: Record<string, string> = {}) => game.i18n?.format(`midi-qol.ConditionBuilder.${key}`, data) ?? key;

/**
 * A condition built from phrases (lib/entries/conditionPhrases.ts): its pieces as rows under "all of" / "any of", each
 * a phrase with its places to fill, or an expression where no phrase fits. What it writes is the expression, as ever.
 */
export class ConditionBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  #rows: ConditionRows;
  #label: string;
  #parent: Actor | Item | null;
  #onSubmit: (value: string) => void;
  #defs: ConditionPhraseDef[];

  constructor(options: ConditionBuilderOptions) {
    super({});
    this.#defs = conditionPhraseDefs();
    this.#rows = toRows(parseCondition(options.value ?? "", this.#defs), this.#defs);
    this.#label = options.label ?? "";
    this.#parent = options.parent ?? null;
    this.#onSubmit = options.onSubmit;
  }

  static override DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions = {
    classes: ["midi-qol-condition-builder"],
    tag: "form",
    window: { title: "midi-qol.ConditionBuilder.Title", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 620, height: "auto" },
    form: { submitOnChange: true, closeOnSubmit: false, handler: ConditionBuilder.#onChange },
    actions: {
      removeRow: ConditionBuilder.#onRemoveRow,
      editCode: ConditionBuilder.#onEditCode,
      save: ConditionBuilder.#onSave
    }
  };

  static override PARTS = {
    form: { template: "modules/midi-qol/templates/apps/ConditionBuilder/conditionBuilder.hbs", scrollable: [".midi-qol-condition-rows"] }
  };

  override get title(): string {
    return this.#label ? `${say("Title")}: ${this.#label}` : say("Title");
  }

  /** The expression the rows stand for */
  get value(): string {
    return fromRows(this.#rows, this.#defs);
  }

  #def(id: string) { return this.#defs.find(d => d.id === id); }

  /** A phrase's words as text and the inputs of its places, in order */
  #rowParts(row: Extract<ConditionNode, { kind: "phrase" }>, index: number, def: ConditionPhraseDef) {
    // Always its plain words: the row's own when / unless says whether it is negated
    return def.label.split(/(\{\w+\})/).filter(Boolean).map(piece => {
      const name = /^\{(\w+)\}$/.exec(piece)?.[1];
      const slot = name ? def.slots?.find(s => s.name === name) : undefined;
      if (!name || !slot) return { text: piece };
      const options = slotOptions(slot);
      const value = row.values[name] ?? slotDefault(slot, options);
      const chosen = [value].flat().map(String);
      // A value the list doesn't know stays chosen and shown
      const unknown = chosen.filter(v => v && !options.some(o => o.value === v)).map(v => ({ value: v, label: v }));
      return {
        name: `row.${index}.slot.${name}`, type: options.length || slot.type === "multiselect" ? slot.type : slot.type === "number" ? "number" : "text",
        value: Array.isArray(value) ? value.join(", ") : value,
        options: [...options, ...unknown].map(o => ({ ...o, selected: chosen.includes(o.value) }))
      };
    });
  }

  override async _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions) {
    const context = await super._prepareContext(options);
    const groups = new Map<string, { label: string, phrases: { value: string, label: string }[] }>();
    for (const def of this.#defs) {
      const id = def.group ?? "other";
      const key = `midi-qol.Sentence.Condition.Group.${id}`;
      if (!groups.has(id)) groups.set(id, { label: game.i18n?.has(key) ? game.i18n.localize(key) : id, phrases: [] });
      groups.get(id)!.phrases.push({ value: def.id, label: def.label.replace(/\{\w+\}/g, "…") });
    }
    const expression = this.value;
    const problem = conditionProblem(expression);
    return Object.assign(context, {
      joiners: (["all", "any"] as const).map(value => ({ value, label: say(value === "all" ? "All" : "Any"), selected: this.#rows.joiner === value })),
      several: this.#rows.rows.length > 1,
      rows: this.#rows.rows.map((row, index) => {
        if (row.kind === "phrase") {
          const def = this.#def(row.id);
          if (def) return { index, phrase: true, negated: row.negated, canNegate: true, parts: this.#rowParts(row, index, def) };
        }
        return { index, code: true, name: `row.${index}.code`, source: row.kind === "code" ? row.source : "" };
      }),
      groups: [...groups.values()],
      codeValue: CODE,
      words: expression ? conditionWords(parseCondition(expression, this.#defs), this.#defs, conditionWording()).text : say("Empty"),
      expression,
      problem: problem ? say("Problem", { problem }) : ""
    });
  }

  /** The form as it stands, into the rows */
  #read(data: Record<string, unknown>) {
    if (data.joiner === "all" || data.joiner === "any") this.#rows.joiner = data.joiner;
    this.#rows.rows.forEach((row, index) => {
      if (row.kind === "code") {
        if (typeof data[`row.${index}.code`] === "string") row.source = data[`row.${index}.code`] as string;
        return;
      }
      if (row.kind !== "phrase") return;
      if (`row.${index}.negated` in data) row.negated = !!data[`row.${index}.negated`];
      for (const slot of this.#def(row.id)?.slots ?? []) {
        const raw = data[`row.${index}.slot.${slot.name}`];
        if (raw === undefined) continue;
        const value: SlotValue = slot.type === "multiselect"
          ? (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(",").map(v => v.trim())).filter(Boolean)
          : slot.type === "number" ? Number(raw) || 0 : String(raw ?? "");
        row.values[slot.name] = value;
      }
    });
    const add = data.add;
    if (add === CODE) this.#rows.rows.push({ kind: "code", source: "" });
    else if (typeof add === "string" && add) {
      const def = this.#def(add);
      if (def) this.#rows.rows.push({ kind: "phrase", id: def.id, negated: false, values: Object.fromEntries((def.slots ?? []).map(s => [s.name, slotDefault(s, slotOptions(s))])) });
    }
  }

  static async #onChange(this: ConditionBuilder, _event: Event, _form: HTMLFormElement, formData: foundry.applications.ux.FormDataExtended) {
    this.#read(formData.object as Record<string, unknown>);
    this.render();
  }

  #readForm() {
    const form = this.element instanceof HTMLFormElement ? this.element : this.element.querySelector("form");
    if (form) this.#read(new foundry.applications.ux.FormDataExtended(form).object as Record<string, unknown>);
  }

  static #onRemoveRow(this: ConditionBuilder, _event: Event, target: HTMLElement) {
    this.#readForm();
    const index = Number(target.dataset.index);
    if (Number.isInteger(index)) this.#rows.rows.splice(index, 1);
    this.render();
  }

  /** A row of code in midi's condition editor (its autocomplete) */
  static #onEditCode(this: ConditionBuilder, _event: Event, target: HTMLElement) {
    this.#readForm();
    const row = this.#rows.rows[Number(target.dataset.index)];
    if (row?.kind !== "code") return;
    new ConditionEditor({
      value: row.source, key: `condition-builder-${this.id}`, label: this.#label, parent: this.#parent,
      onSubmit: (value: string) => {
        row.source = value;
        // What was typed may now be phrases
        this.#rows = toRows(parseCondition(this.value, this.#defs), this.#defs);
        if (this.rendered) this.render();
      },
      onCancel: () => { }
    }).render({ force: true });
  }

  static #onSave(this: ConditionBuilder) {
    this.#readForm();
    this.#onSubmit(this.value);
    void this.close();
  }
}
