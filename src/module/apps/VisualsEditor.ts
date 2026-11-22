import { i18n, MODULE_ID } from "../../midi-qol.js";
import { activeProviderId, providers } from "../api/services.js";
import { TOKEN_VISUAL_KINDS, tokenVisualsService, type VisualSpec } from "../services/tokenVisuals/service.js";
import { canEditEntries } from "./EntryEditor.js";

/*
 * M33: an effect's token visuals (flags.midi-qol.visuals), from the effect sheet's header. A duplicates count is a
 * fixed number, a start less a count the effect's entries keep (Mirror Image: 3 less duplicates › destroyed, written
 * `3 - @state.duplicates.destroyed`), or a formula. Preview shows the visuals on a selected token for a few seconds.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

type CountMode = "fixed" | "less" | "formula";
interface Row { kind: string, mode: CountMode, fixed: number, start: number, counter: string, formula: string, color: string, file: string }

const LESS = /^\s*(\d+)\s*-\s*@state\.([\w-]+\.[\w-]+)\s*$/;
const COUNTED = new Set(["duplicates"]);
const COLOURED = new Set(["glow", "shield", "shimmer"]);
const ANIMATED = new Set(["shield", "shimmer"]);
const PREVIEW_SECONDS = 4;

export function rowOf(spec: VisualSpec): Row {
  const row: Row = { kind: spec.kind, mode: "fixed", fixed: 3, start: 3, counter: "", formula: "", color: spec.color ?? "", file: spec.file ?? "" };
  if (typeof spec.count === "number") row.fixed = spec.count;
  else if (typeof spec.count === "string") {
    const less = spec.count.match(LESS);
    if (less) Object.assign(row, { mode: "less", start: Number(less[1]), counter: less[2] });
    else Object.assign(row, { mode: "formula", formula: spec.count });
  }
  return row;
}

export function specOf(row: Row): VisualSpec {
  const spec: VisualSpec = { kind: row.kind };
  if (COUNTED.has(row.kind)) {
    if (row.mode === "less" && row.counter) spec.count = `${row.start} - @state.${row.counter}`;
    else if (row.mode === "formula" && row.formula.trim()) spec.count = row.formula.trim();
    else spec.count = row.fixed;
  }
  if (COLOURED.has(row.kind) && row.color.trim()) spec.color = row.color.trim();
  if (ANIMATED.has(row.kind) && row.file.trim()) spec.file = row.file.trim();
  return spec;
}

/** The counts an effect's entries keep (`entry.key`): its entry state and every `state` action's keys */
export function effectCounters(effect: ActiveEffect.Implementation): string[] {
  const found = new Set<string>();
  for (const [entryId, state] of Object.entries(effect.getFlag(MODULE_ID, "entryState") ?? {}))
    for (const key of Object.keys(state ?? {})) found.add(`${entryId}.${key}`);
  const walk = (entryId: string, node: unknown) => {
    if (Array.isArray(node)) return node.forEach(n => walk(entryId, n));
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "state" && value && typeof value === "object" && !Array.isArray(value))
        for (const counted of Object.keys(value)) found.add(`${entryId}.${counted}`);
      else walk(entryId, value);
    }
  };
  for (const entry of effect.getFlag(MODULE_ID, "entries") ?? []) walk(entry.id, entry.do);
  return [...found].sort();
}

export class VisualsEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  #effect: ActiveEffect.Implementation;
  #rows: Row[];
  #preview: Record<string, number> = {};

  constructor(effect: ActiveEffect.Implementation, options = {}) {
    super(options);
    this.#effect = effect;
    this.#rows = (effect.getFlag(MODULE_ID, "visuals") ?? []).map(rowOf);
  }

  static DEFAULT_OPTIONS = {
    tag: "form" as const,
    classes: ["midi-qol", "midi-qol-visuals-editor"],
    window: { title: "midi-qol.VisualsEditor.Title", resizable: true, contentClasses: ["standard-form"] },
    position: { width: 560, height: "auto" as const },
    form: { submitOnChange: true, closeOnSubmit: false, handler: VisualsEditor.#onChange },
    actions: {
      add: VisualsEditor.#onAdd,
      remove: VisualsEditor.#onRemove,
      preview: VisualsEditor.#onPreview,
      save: VisualsEditor.#onSave
    }
  };

  static PARTS = {
    editor: { template: "modules/midi-qol/templates/apps/VisualsEditor/visualsEditor.hbs" }
  };

  get title() {
    return `${i18n("midi-qol.VisualsEditor.Title")}: ${this.#effect.name}`;
  }

  get rows(): readonly Row[] { return this.#rows; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const providerId = activeProviderId("tokenVisuals");
    const provider = tokenVisualsService.get();
    const providerLabel = providers("tokenVisuals").find(p => p.id === providerId)?.label;
    const counters = effectCounters(this.#effect);
    const used = [...new Set(this.#rows.filter(r => COUNTED.has(r.kind) && r.mode === "less" && r.counter).map(r => r.counter))];
    const files = this.#animationPaths();
    const option = (value: string, label: string, selected: string) => ({ value, label, selected: value === selected });
    return {
      ...context,
      providerLabel: providerLabel ?? i18n("midi-qol.VisualsEditor.NoProvider"),
      rows: this.#rows.map((row, index) => ({
        ...row, index,
        kinds: TOKEN_VISUAL_KINDS.map(kind => option(kind, i18n(`midi-qol.VisualsEditor.Kind.${kind}`), row.kind)),
        counted: COUNTED.has(row.kind), coloured: COLOURED.has(row.kind), animated: ANIMATED.has(row.kind),
        modes: (["fixed", "less", "formula"] as const).map(mode => option(mode, i18n(`midi-qol.VisualsEditor.Mode.${mode}`), row.mode)),
        fixedMode: row.mode === "fixed", lessMode: row.mode === "less", formulaMode: row.mode === "formula",
        counters: [option("", "—", row.counter), ...counters.concat(row.counter && !counters.includes(row.counter) ? [row.counter] : [])
          .map(c => option(c, c.replace(".", " › "), row.counter))],
        files: files[row.kind] ?? [],
        unsupported: provider && !provider.kinds.includes(row.kind) ? game.i18n?.format("midi-qol.VisualsEditor.Unsupported", { provider: providerLabel ?? "" }) : ""
      })),
      previewCounts: used.map(counter => ({ counter, label: counter.replace(".", " › "), value: this.#preview[counter] ?? 0 })),
      canPreview: this.#rows.length > 0
    };
  }

  /** JB2A's animations Sequencer knows for the animated kinds */
  #animationPaths(): Record<string, string[]> {
    const database: { getPathsUnder?(path: string, options?: { fullyQualified?: boolean }): string[] } | undefined = globalThis.Sequencer?.Database;
    if (!database?.getPathsUnder) return {};
    const under = (path: string) => { try { return database.getPathsUnder!(path, { fullyQualified: true }) ?? []; } catch { return []; } };
    return { shield: under("jb2a.shield.01.loop"), shimmer: under("jb2a.shimmer.01") };
  }

  static async #onChange(this: VisualsEditor, _event: Event, _form: HTMLFormElement, formData: foundry.applications.ux.FormDataExtended) {
    const data = foundry.utils.expandObject(formData.object) as { v?: Record<string, Partial<Record<keyof Row, unknown>>>, preview?: Record<string, Record<string, unknown>> };
    for (const [index, values] of Object.entries(data.v ?? {})) {
      const row = this.#rows[Number(index)];
      if (!row) continue;
      const text = (value: unknown, fallback: string) => typeof value === "string" ? value : fallback;
      const number = (value: unknown, fallback: number) => Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback;
      Object.assign(row, {
        kind: text(values.kind, row.kind), mode: text(values.mode, row.mode) as CountMode,
        fixed: number(values.fixed, row.fixed), start: number(values.start, row.start), counter: text(values.counter, row.counter),
        formula: text(values.formula, row.formula), color: text(values.color, row.color), file: text(values.file, row.file)
      });
    }
    for (const [entryId, keys] of Object.entries(data.preview ?? {}))
      for (const [key, value] of Object.entries(keys ?? {})) this.#preview[`${entryId}.${key}`] = Number(value) || 0;
    this.render();
  }

  static #onAdd(this: VisualsEditor) {
    this.#rows.push(rowOf({ kind: "duplicates", count: 3 }));
    this.render();
  }

  static #onRemove(this: VisualsEditor, _event: Event, target: HTMLElement) {
    this.#rows.splice(Number(target.dataset.index), 1);
    this.render();
  }

  /** The visuals on the selected token for a few seconds, with the preview counts as the effect's state */
  static async #onPreview(this: VisualsEditor) {
    const token = canvas?.tokens?.controlled[0];
    const actor = token?.actor;
    if (!token || !actor) return void ui.notifications?.warn(i18n("midi-qol.VisualsEditor.SelectToken"));
    const entryState: Record<string, Record<string, number>> = {};
    for (const [counter, value] of Object.entries(this.#preview)) foundry.utils.setProperty(entryState, counter, value);
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `${this.#effect.name} (${i18n("midi-qol.VisualsEditor.Preview")})`, img: this.#effect.img,
      flags: { [MODULE_ID]: { visuals: this.#rows.map(specOf), entryState } }
    }]);
    setTimeout(() => { void effect?.delete(); }, PREVIEW_SECONDS * 1000);
  }

  static async #onSave(this: VisualsEditor) {
    if (!canEditEntries(this.#effect)) return void ui.notifications?.warn(i18n("midi-qol.EntryEditor.Problem.Permission"));
    const visuals = this.#rows.map(specOf);
    if (visuals.length) await this.#effect.setFlag(MODULE_ID, "visuals", visuals);
    else await this.#effect.unsetFlag(MODULE_ID, "visuals");
    ui.notifications?.info(i18n("midi-qol.VisualsEditor.Saved"));
  }
}

export function registerVisualsEditorControls() {
  // onClick: Foundry 14's header controls (fvtt-types 13 doesn't have it)
  type Control = foundry.applications.api.ApplicationV2.HeaderControlsEntry & { onClick: () => void };
  Hooks.on("getHeaderControlsActiveEffectConfig", (app: foundry.applications.api.DocumentSheetV2<ActiveEffect>, controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]) => {
    const effect = app.document as ActiveEffect.Implementation;
    if (!canEditEntries(effect)) return;
    const control: Control = { icon: "fa-solid fa-wand-magic-sparkles", label: "midi-qol.VisualsEditor.Open", action: "midiVisualsEditor",
      onClick: () => void new VisualsEditor(effect).render({ force: true }) };
    controls.push(control);
  });
}
