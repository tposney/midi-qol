import { asGroup, buildCondition, conditionProblem, conditionWords, isGroup, parseCondition, pruned, slotDefault, VERB_FORMS,
  type ConditionGroup, type ConditionNode, type ConditionPhraseDef, type SlotValue } from "../lib/entries/conditionPhrases.js";
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
/** Groups inside groups: the top, and two more */
const MAX_DEPTH = 2;
const say = (key: string, data: Record<string, string> = {}) => game.i18n?.format(`midi-qol.ConditionBuilder.${key}`, data) ?? key;

/**
 * A condition built from phrases (lib/entries/conditionPhrases.ts), as filter builders draw one: a group is a box
 * whose rows are joined by one "and" or "or" (shown between them: click to switch the group), a group inside a group
 * a box inside it, the negative inside a phrase's own wording. A piece no phrase fits is a row of expression. What it
 * writes is the expression, as ever.
 */
export class ConditionBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  #root: ConditionGroup;
  #label: string;
  #parent: Actor | Item | null;
  #onSubmit: (value: string) => void;
  #defs: ConditionPhraseDef[];

  constructor(options: ConditionBuilderOptions) {
    super({});
    this.#defs = conditionPhraseDefs();
    this.#root = asGroup(parseCondition(options.value ?? "", this.#defs));
    this.#label = options.label ?? "";
    this.#parent = options.parent ?? null;
    this.#onSubmit = options.onSubmit;
  }

  static override DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions = {
    classes: ["midi-qol-condition-builder"],
    tag: "form",
    window: { title: "midi-qol.ConditionBuilder.Title", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 680, height: "auto" },
    form: { submitOnChange: true, closeOnSubmit: false, handler: ConditionBuilder.#onChange },
    actions: {
      removeRow: ConditionBuilder.#onRemoveRow,
      toggleJoin: ConditionBuilder.#onToggleJoin,
      addGroup: ConditionBuilder.#onAddGroup,
      editCode: ConditionBuilder.#onEditCode,
      save: ConditionBuilder.#onSave
    }
  };

  static override PARTS = {
    form: { template: "modules/midi-qol/templates/apps/ConditionBuilder/conditionBuilder.hbs", scrollable: [".midi-qol-condition-tree"] }
  };

  override get title(): string {
    return this.#label ? `${say("Title")}: ${this.#label}` : say("Title");
  }

  /** The expression the tree stands for */
  get value(): string {
    const node = pruned(this.#root);
    return node ? buildCondition(node, this.#defs) : "";
  }

  #def(id: string) { return this.#defs.find(d => d.id === id); }

  /** The node at a path of indexes ("": the top group) */
  #at(path: string): ConditionNode | undefined {
    let node: ConditionNode | undefined = this.#root;
    for (const index of path.split(".").filter(Boolean).map(Number)) node = isGroup(node) ? node.parts[index] : undefined;
    return node;
  }

  /** A phrase's words as text and the controls of its places, in order: its verb's two forms, then its slots */
  #phraseParts(row: Extract<ConditionNode, { kind: "phrase" }>, path: string, def: ConditionPhraseDef) {
    const sense = (yes: string, no: string) => ({ name: `row.${path}.negated`, type: "sense",
      options: [{ value: "", label: yes, selected: !row.negated }, { value: "not", label: no, selected: row.negated }] });
    const parts = def.label.split(/(\{[^{}|]+\|[^{}|]+\}|\{\w+\})/).filter(Boolean).map(piece => {
      const verb = VERB_FORMS.exec(piece);
      if (verb) return sense(verb[1], verb[2]);
      const name = /^\{(\w+)\}$/.exec(piece)?.[1];
      const slot = name ? def.slots?.find(s => s.name === name) : undefined;
      if (!name || !slot) return { text: piece };
      const options = slotOptions(slot);
      const value = row.values[name] ?? slotDefault(slot, options);
      const chosen = [value].flat().map(String);
      // A value the list doesn't know stays chosen and shown
      const unknown = chosen.filter(v => v && !options.some(o => o.value === v)).map(v => ({ value: v, label: v }));
      return {
        name: `row.${path}.slot.${name}`, type: options.length || slot.type === "multiselect" ? slot.type : slot.type === "number" ? "number" : "text",
        value: Array.isArray(value) ? value.join(", ") : value,
        options: [...options, ...unknown].map(o => ({ ...o, selected: chosen.includes(o.value) }))
      };
    });
    // A label without its verb's two forms: the negative as a choice in front of it
    return VERB_FORMS.test(def.label) ? parts : [sense("", say("Not")), ...parts];
  }

  #groupContext(group: ConditionGroup, path: string, depth: number): Record<string, unknown> {
    return {
      path, joiner: group.kind, joinLabel: say(group.kind === "all" ? "And" : "Or"), canGroup: depth < MAX_DEPTH,
      rows: group.parts.map((part, index) => {
        const at = path ? `${path}.${index}` : String(index);
        const base = { path: at, first: index === 0 };
        if (isGroup(part)) return { ...base, group: this.#groupContext(part, at, depth + 1) };
        const def = part.kind === "phrase" ? this.#def(part.id) : undefined;
        if (part.kind === "phrase" && def) return { ...base, phrase: true, parts: this.#phraseParts(part, at, def) };
        return { ...base, code: true, name: `row.${at}.code`, source: part.kind === "code" ? part.source : "" };
      })
    };
  }

  override async _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions) {
    const context = await super._prepareContext(options);
    const groups = new Map<string, { label: string, phrases: { value: string, label: string }[] }>();
    for (const def of this.#defs) {
      const id = def.group ?? "other";
      const key = `midi-qol.Sentence.Condition.Group.${id}`;
      if (!groups.has(id)) groups.set(id, { label: game.i18n?.has(key) ? game.i18n.localize(key) : id, phrases: [] });
      groups.get(id)!.phrases.push({ value: def.id, label: def.label.replace(VERB_FORMS, "$1").replace(/\{\w+\}/g, "…") });
    }
    const expression = this.value;
    const problem = conditionProblem(expression);
    return Object.assign(context, {
      tree: this.#groupContext(this.#root, "", 0),
      groups: [...groups.values()],
      codeValue: CODE,
      words: expression ? conditionWords(parseCondition(expression, this.#defs), this.#defs, conditionWording()).text : say("Empty"),
      expression,
      problem: problem ? say("Problem", { problem }) : ""
    });
  }

  /** The form as it stands, into the tree; a group's "add" chosen: its new row */
  #read(data: Record<string, unknown>) {
    const walk = (group: ConditionGroup, path: string) => {
      group.parts.forEach((row, index) => {
        const at = path ? `${path}.${index}` : String(index);
        if (isGroup(row)) return walk(row, at);
        if (row.kind === "code") {
          if (typeof data[`row.${at}.code`] === "string") row.source = data[`row.${at}.code`] as string;
          return;
        }
        if (`row.${at}.negated` in data) row.negated = !!data[`row.${at}.negated`];
        for (const slot of this.#def(row.id)?.slots ?? []) {
          const raw = data[`row.${at}.slot.${slot.name}`];
          if (raw === undefined) continue;
          const value: SlotValue = slot.type === "multiselect"
            ? (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(",").map(v => v.trim())).filter(Boolean)
            : slot.type === "number" ? Number(raw) || 0 : String(raw ?? "");
          row.values[slot.name] = value;
        }
      });
      const add = data[`add.${path}`];
      if (add === CODE) group.parts.push({ kind: "code", source: "" });
      else if (typeof add === "string" && add) {
        const def = this.#def(add);
        if (def) group.parts.push({ kind: "phrase", id: def.id, negated: false, values: Object.fromEntries((def.slots ?? []).map(s => [s.name, slotDefault(s, slotOptions(s))])) });
      }
    };
    walk(this.#root, "");
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
    const path = (target.dataset.path ?? "").split(".").filter(Boolean);
    const index = Number(path.pop());
    const group = this.#at(path.join("."));
    if (isGroup(group) && Number.isInteger(index)) group.parts.splice(index, 1);
    this.render();
  }

  /** A group's "and" / "or": the whole group's, whichever row's it was clicked on */
  static #onToggleJoin(this: ConditionBuilder, _event: Event, target: HTMLElement) {
    this.#readForm();
    const group = this.#at(target.dataset.path ?? "");
    if (isGroup(group)) group.kind = group.kind === "all" ? "any" : "all";
    this.render();
  }

  /** A group inside this one, joined the other way (what a group inside is for) */
  static #onAddGroup(this: ConditionBuilder, _event: Event, target: HTMLElement) {
    this.#readForm();
    const group = this.#at(target.dataset.path ?? "");
    if (isGroup(group)) group.parts.push({ kind: group.kind === "all" ? "any" : "all", parts: [] });
    this.render();
  }

  /** A row of expression in midi's condition editor (its autocomplete) */
  static #onEditCode(this: ConditionBuilder, _event: Event, target: HTMLElement) {
    this.#readForm();
    const row = this.#at(target.dataset.path ?? "");
    if (row?.kind !== "code") return;
    new ConditionEditor({
      value: row.source, key: `condition-builder-${this.id}`, label: this.#label, parent: this.#parent,
      onSubmit: (value: string) => {
        row.source = value;
        // What was typed may now be phrases
        this.#root = asGroup(parseCondition(this.value, this.#defs));
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
