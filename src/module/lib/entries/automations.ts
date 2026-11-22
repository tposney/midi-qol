import { defineService, entries, register, reportServiceProblem } from "../../api/services.js";

/*
 * entryAutomations (contributors): other automation attached to an item, activity or effect, described for the entry
 * editor so one window shows everything an item does, wherever it is kept. Code can't be read as entries: a reader says
 * whose it is, when it runs, its notes and settings, and its code where that is stored on the document.
 *
 *   MidiQOL.services.register("entryAutomations", "my-module", {
 *     describe: document => document.flags?.["my-module"]?.script ? [{ source: "My Module", name: "Script", when: ["after the attack"] }] : []
 *   });
 *
 * midi's readers: midi's own on-use macros and item macros, and Coven's Automation Toolkit's macros (CPR's, midi's
 * sample items', other modules'), from CAT's registry.
 */

export interface AutomationNote {
  /** Whose automation: a module's name */
  source: string;
  /** Which automation: the macro's identifier or name */
  name: string;
  version?: string;
  /** When its code runs, in words */
  when: readonly string[];
  /** Its code runs as part of using the item (drawn as a step of each activity's card), not on other events */
  atUse?: boolean;
  /** The item's own macro (no module to name) */
  own?: boolean;
  notes?: string;
  settings?: readonly { label: string, value: string }[];
  /** Its code, when the document holds it (an item macro) */
  code?: string;
}

export interface EntryAutomationsContributor {
  describe(document: object): readonly AutomationNote[] | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { entryAutomations: EntryAutomationsContributor }
}

export function defineEntryAutomationsService() {
  defineService<EntryAutomationsContributor>("entryAutomations", { kind: "contributors", description: "Other automation on an item, activity or effect, described in the entry editor" });
}

/** Every reader's notes for a document */
export function automationNotes(document: object): AutomationNote[] {
  const notes: AutomationNote[] = [];
  let list: { id: string, provider: EntryAutomationsContributor }[];
  try { list = entries<EntryAutomationsContributor>("entryAutomations"); } catch { return notes; }
  for (const { id, provider } of list) {
    try { notes.push(...(provider.describe(document) ?? [])); }
    catch (err) { reportServiceProblem("entryAutomations", id, "describe() failed", err); }
  }
  return notes;
}

const say = (key: string, data?: Record<string, string>) => {
  const full = `midi-qol.EntryEditor.Automation.${key}`;
  return data ? game.i18n?.format(full, data) ?? full : game.i18n?.localize(full) ?? full;
};
const known = (key: string) => !!game.i18n?.has(`midi-qol.EntryEditor.Automation.${key}`);

type Flags = Record<string, Record<string, unknown> | undefined>;
const flagsOf = (document: object) => ((document as { flags?: Flags }).flags ?? {}) as Flags;

/* midi's own: on-use macros and the item's macro */

function midiDescribe(document: object): AutomationNote[] {
  const flags = flagsOf(document);
  const parts = (flags["midi-qol"]?.onUseMacroParts as { items?: { macroName?: string, option?: string }[] } | undefined)?.items ?? [];
  const command = (flags.dae?.macro as { command?: string } | undefined)?.command ?? (flags.itemacro?.macro as { command?: string } | undefined)?.command;
  const notes: AutomationNote[] = [];
  for (const part of parts) {
    if (!part.macroName) continue;
    const option = part.option ?? "postActiveEffects";
    const label = game.i18n?.localize(`midi-qol.onUseMacroOptions.${option}`) ?? option;
    const itemMacro = /^(ItemMacro|ActivityMacro)$/.test(part.macroName);
    notes.push({
      source: say("Source.midi"), name: itemMacro ? say("ItemMacro") : part.macroName, atUse: true, own: itemMacro,
      when: [`${label.trim().toLowerCase()} (${option})`],
      ...(itemMacro && command ? { code: command } : {})
    });
  }
  // A macro no on-use entry runs (DAE's macro.itemMacro effects run it, or nothing does)
  if (command && !notes.some(n => n.code)) notes.push({ source: say("Source.midi"), name: say("ItemMacro"), own: true, when: [say("NotRunByOnUse")], code: command });
  return notes;
}

/* Coven's Automation Toolkit */

interface CatMacroRef { source?: string, identifier?: string, rules?: string }
interface CatFnMacro { source: string, identifier: string, rules: string, label?: string, genericConfig?: Record<string, { label?: string, default?: unknown }>, macros: Record<string, { pass?: string, priority?: number }[]> }
interface CatRegistry { getAllMacros(options?: { genericOnly?: boolean }): CatFnMacro[] }

/** Where a CAT roll macro is kept, by its pass's prefix (longest first) */
const CAT_PREFIXES = ["castEnchantment", "enchantment", "encounter", "activity", "vehicle", "nearby", "region", "target", "actor", "token", "level", "scene", "group", "item"];

/** A CAT pass in words: `itemPreambleComplete` → "once targets are final", for this item's uses */
function catPassText(type: string, pass: string): string {
  if (type !== "roll") return known(`Cat.Type.${type}`) ? say(`Cat.Type.${type}`, { pass }) : `${type}: ${pass}`;
  const prefix = CAT_PREFIXES.find(p => pass.startsWith(p) && pass.length > p.length && /[A-Z]/.test(pass[p.length]));
  const base = prefix ? pass[prefix.length].toLowerCase() + pass.slice(prefix.length + 1) : pass;
  const when = known(`Cat.Pass.${base}`) ? say(`Cat.Pass.${base}`) : base;
  // An item's or activity's own macro runs for its uses: said only for the others (the owner's, a target's)
  const whose = !prefix || prefix === "item" || prefix === "activity" ? "" : known(`Cat.Prefix.${prefix}`) ? say(`Cat.Prefix.${prefix}`) : prefix;
  return `${when}${whose ? `, ${whose}` : ""} (${pass})`;
}

function catRegistry(): CatRegistry | undefined {
  const registry = (globalThis as { cat?: { lib?: { constants?: { macros?: CatRegistry } } } }).cat?.lib?.constants?.macros;
  return typeof registry?.getAllMacros === "function" ? registry : undefined;
}

function catDescribe(document: object): AutomationNote[] {
  const cat = flagsOf(document).cat as { macros?: Record<string, CatMacroRef[]>, automation?: { source?: string, version?: string, notes?: string }, genericConfig?: Record<string, Record<string, Record<string, unknown>>> } | undefined;
  if (!cat) return [];
  const registry = catRegistry();
  const all = registry ? [...registry.getAllMacros(), ...registry.getAllMacros({ genericOnly: true })] : [];
  const refs = new Map<string, CatMacroRef>();
  for (const list of Object.values(cat.macros ?? {})) for (const ref of list ?? []) if (ref.source && ref.identifier) refs.set(`${ref.source}|${ref.identifier}`, ref);
  // midi's own notes for CAT's medkit (catIntegration.ts): a way of showing notes, not automation
  refs.delete("midi-qol|automation-notes");
  const notes: AutomationNote[] = [];
  const sourceName = (id: string) => game.modules?.get(id)?.title ?? id;
  for (const ref of refs.values()) {
    const macro = all.find(m => m.source === ref.source && m.identifier === ref.identifier && (m.rules === ref.rules || m.rules === "all"));
    const config = cat.genericConfig?.[ref.source!]?.[ref.identifier!];
    const settings = config ? Object.entries(config).map(([key, value]) => ({ label: macro?.genericConfig?.[key]?.label ? game.i18n?.localize(macro.genericConfig[key].label!) ?? key : key,
      value: Array.isArray(value) ? value.join(", ") : String(value) })) : undefined;
    const isAutomation = cat.automation?.source === ref.source;
    const base = { source: sourceName(ref.source!), name: macro?.label ? game.i18n?.localize(macro.label) ?? ref.identifier! : ref.identifier!,
      ...(isAutomation && cat.automation?.version ? { version: cat.automation.version } : {}),
      ...(isAutomation && cat.automation?.notes ? { notes: cat.automation.notes } : {}),
      ...(settings?.length ? { settings } : {}) };
    if (!macro) { notes.push({ ...base, when: [say("Cat.NotRegistered")] }); continue; }
    // Its passes during a use are a step of the use; its other triggers (aura, combat, rest...) are noted apart
    const atUse = (macro.macros.roll ?? []).map(m => catPassText("roll", m.pass ?? "?"));
    const other = Object.entries(macro.macros).filter(([type]) => type !== "roll").flatMap(([type, list]) => list.map(m => catPassText(type, m.pass ?? "?")));
    if (atUse.length) notes.push({ ...base, when: atUse, atUse: true });
    if (other.length) notes.push({ ...base, when: other });
  }
  // An automation CAT installed with no macros of its own (its activities and effects do the work)
  if (cat.automation?.source && !refs.size)
    notes.push({ source: sourceName(cat.automation.source), name: say("Cat.Installed"), when: [say("Cat.NoMacros")],
      ...(cat.automation.version ? { version: cat.automation.version } : {}), ...(cat.automation.notes ? { notes: cat.automation.notes } : {}) });
  return notes;
}

export function registerMidiAutomationReaders() {
  register("entryAutomations", "midi-qol.macros", { describe: midiDescribe }, { label: "Midi-QOL: on-use and item macros" });
  register("entryAutomations", "midi-qol.cat", { describe: catDescribe }, { label: "Coven's Automation Toolkit macros", available: () => !!game.modules?.get("cat")?.active });
}
