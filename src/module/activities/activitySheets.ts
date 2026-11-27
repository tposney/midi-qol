import type { AnyMutableObject } from "fvtt-types/utils";
import { onActivityTypeAdopted } from "./activityPrototype.js";
import { i18n, specialDurationChoices } from "../../midi-qol.js";
import { ConditionEditor } from "../apps/ConditionEditor.js";
import { ConditionBuilder } from "../apps/ConditionBuilder.js";
import { conditionText } from "../lib/entries/conditionVocabulary.js";
import { RegionBehaviorEditor } from "../apps/RegionBehaviorEditor.js";
import {
  aoeTargetTypeOptions, autoCEEffectsOptions, autoTargetOptions, confirmTargetOptions, consumeConfigOptions, damageConfigOptions,
  getIgnoreTraitsOptions, removeButtonsOptions, rollConfigOptions, triggeredActivityRollAsOptions, triggeredActivityTargetOptions
} from "../settings.js";
import { installedModules } from "../setupModules.js";
import { activityHasAreaTarget, isActivityType, rollModeToMessageMode } from "../utils.js";
import { attachTokenOptions, templateOriginOptions } from "./activityHelpers.js";
import { isMidiActivityType, type MidiActivity } from "./midiActivity.js";

/*
 * midi's additions to dnd5e's activity sheets (M14 stage 3: were midi's sheet classes, installed by graft.ts), with no
 * wrap: midi's parts, actions and clean arrays are data on dnd5e's sheet classes; midi's tab and every part's extra data
 * are added in preRenderActivitySheet (Foundry calls it for each class in a sheet's chain, after the context is prepared
 * and before the parts are drawn; every part's context is that shared context); what midi does after drawing is in
 * renderActivitySheet. A type adds its own parts and data with registerSheetExtras. One wrap stays (user,
 * 2026-11-20): Attack's healing damage types (AttackActivity.ts), which dnd5e builds while drawing the effect part.
 */

type MidiStatus = { id: string, specialDuration: string[], onSave: boolean };

/** The sheet's activity: dnd5e's members midi's sheet code calls */
type SheetActivity = MidiActivity & {
  update(changes: object): Promise<unknown>;
  target?: MidiActivity["target"] & { override?: boolean };
};

/** An activity sheet as midi reads and changes it */
export interface ActivitySheetApp {
  activity: SheetActivity;
  item: Item.Implementation;
  element: HTMLElement;
  tabGroups: Record<string, string>;
  _markTabs(tabs: Record<string, object>): Record<string, Record<string, unknown>>;
}

/** A type's own sheet additions */
export interface SheetExtras {
  /** midi's effect part: its template and the partials it adds to dnd5e's */
  effect?: { template: string, templates: string[] };
  /** Keep dnd5e's activation part (Forward has no time or targeting) */
  keepActivation?: boolean;
  /** The sheet's CSS classes (replacing dnd5e's, as midi's sheet class did) */
  classes?: string[];
  /** Data for the type's parts, added before they are drawn */
  context?: (app: ActivitySheetApp, context: AnyMutableObject) => void;
}

const sheetExtras = new Map<string, SheetExtras>();

export function registerSheetExtras(type: string, extras: SheetExtras) {
  sheetExtras.set(type, extras);
}

const MIDI_SUB_TABS = ["modConditions", "workflowSettings", "activityManagement", "overtime", "activityMacro"];

type ClassStatics = { PARTS?: Record<string, { template: string, templates?: string[] }>, CLEAN_ARRAYS?: string[], DEFAULT_OPTIONS?: object };

function setStatic(cls: object, name: string, value: unknown) {
  Object.defineProperty(cls, name, { value, configurable: true, writable: true, enumerable: true });
}

/** midi's parts, actions and clean arrays on the sheet classes of `types`; the hooks that add its tab and data */
export function installActivitySheets() {
  // @ts-expect-error no dnd5e-types
  const ActivitySheet: ClassStatics = game.system.applications.activity.ActivitySheet;
  // ApplicationV2 merges each class's own DEFAULT_OPTIONS down its chain: midi's actions on dnd5e's base sheet
  setStatic(ActivitySheet, "DEFAULT_OPTIONS", foundry.utils.mergeObject(ActivitySheet.DEFAULT_OPTIONS ?? {}, {
    actions: { addMacro, openConditionEditor, openConditionBuilder, openRegionBehaviorEditor, addMidiStatus, deleteMidiStatus, deleteMidiStatusDuration }
  }, { inplace: false }));
  // Each adopted type's sheet: midi's parts and clean arrays
  onActivityTypeAdopted(type => {
    // @ts-expect-error no dnd5e-types
    const sheet: ClassStatics | undefined = CONFIG.DND5E.activityTypes[type]?.documentClass?.metadata?.sheetClass;
    if (!sheet?.PARTS) return;
    const extras = sheetExtras.get(type) ?? {};
    const parts = { ...sheet.PARTS };
    if (!extras.keepActivation && parts.activation) parts.activation = {
      template: "modules/midi-qol/templates/activity/activation.hbs",
      templates: [...(parts.activation.templates ?? []), "modules/midi-qol/templates/activity/parts/region-behavior-targeting.hbs",
        "modules/midi-qol/templates/activity/parts/midi-targeting.hbs"]
    };
    if (extras.effect && parts.effect) parts.effect = { template: extras.effect.template, templates: [...(parts.effect.templates ?? []), ...extras.effect.templates] };
    parts["midi-qol"] = { template: "modules/midi-qol/templates/activity/parts/midi-activity-tab.hbs" };
    setStatic(sheet, "PARTS", parts);
    setStatic(sheet, "CLEAN_ARRAYS", [...(sheet.CLEAN_ARRAYS ?? []), "midiProperties.statuses"]);
    if (extras.classes) setStatic(sheet, "DEFAULT_OPTIONS", foundry.utils.mergeObject(Object.hasOwn(sheet, "DEFAULT_OPTIONS") ? sheet.DEFAULT_OPTIONS ?? {} : {}, { classes: extras.classes }, { inplace: false }));
  });
  Hooks.on("preRenderActivitySheet", (app, context) => {
    if (!isMidiSheet(app)) return;
    addMidiTab(app, context);
    sharedContext(app, context);
    midiTabContext(app, context);
    sheetExtras.get(String(app.activity.type))?.context?.(app, context);
  });
  Hooks.on("renderActivitySheet", app => {
    if (isMidiSheet(app)) onRender(app);
  });
  // DAE's macro editor button in every activity sheet's header
  Hooks.on("renderActivitySheet", renderActivitySheetHook);
  Hooks.on("renderActivitySheet", showEnchantedFields);
  Hooks.on("renderActivitySheet", showConditionWords);
}

/** Under each condition field of the sheet: the condition in words, where midi knows any of it (after the enchanted values are in) */
function showConditionWords(app: unknown, element: HTMLElement) {
  if (!isActivitySheet(app)) return;
  for (const wrapper of Array.from(element.querySelectorAll(".midi-condition-field-wrapper"))) {
    const input = wrapper.querySelector("input");
    const group = wrapper.closest(".form-group");
    if (!input || !group) continue;
    group.querySelector(".midi-condition-words")?.remove();
    if (!input.value.trim()) continue;
    const read = conditionText(input.value);
    if (!read.known) continue;
    const hint = document.createElement("p");
    hint.className = "hint midi-condition-words";
    hint.textContent = game.i18n?.format("midi-qol.ConditionBuilder.FieldReads", { words: read.text }) ?? read.text;
    group.appendChild(hint);
  }
}

/**
 * Fields of the activity an enchantment on its item sets (an overlay's marker: Counterspell's use condition): the sheet
 * draws the stored value, which the enchantment overrides. Shown as in use, read-only, saying what sets them.
 */
function showEnchantedFields(app: unknown, element: HTMLElement) {
  if (!isActivitySheet(app)) return;
  const activity = app.activity as unknown as { id: string, item?: Item.Implementation };
  const prefix = `system.activities.${activity.id}.`;
  type Enchantment = { type?: string, disabled?: boolean, name?: string, system?: { changes?: { key?: string }[] } };
  for (const effect of (activity.item?.effects.contents ?? []) as Enchantment[]) {
    if (effect.type !== "enchantment" || effect.disabled) continue;
    for (const change of effect.system?.changes ?? []) {
      if (!change.key?.startsWith(prefix)) continue;
      const path = change.key.slice(prefix.length);
      const value: unknown = foundry.utils.getProperty(activity, path);
      const note = game.i18n?.format("midi-qol.Overlay.FieldSetBy", { name: effect.name ?? "" }) ?? "";
      for (const field of Array.from(element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${CSS.escape(path)}"]`))) {
        if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = !!value;
        else field.value = value === undefined || value === null ? "" : String(value);
        field.disabled = true;
        const group: HTMLElement = field.closest(".form-group") ?? field;
        group.dataset.tooltip = note;
        for (const button of Array.from(group.querySelectorAll("button"))) button.disabled = true;
      }
    }
  }
}

/** An activity sheet of a type midi uses */
function isMidiSheet(app: unknown): app is ActivitySheetApp {
  return !!app && typeof app === "object" && "activity" in app && isMidiActivityType(app.activity);
}

/** midi's tab and its sub-tabs (were midi's _getTabs), marked active as dnd5e's are */
function addMidiTab(app: ActivitySheetApp, context: AnyMutableObject) {
  if (!MIDI_SUB_TABS.includes(app.tabGroups["midi-qol"])) app.tabGroups["midi-qol"] = "modConditions";
  const sub = (id: string, icon: string) => ({ id, group: "midi-qol", icon, label: i18n(`midi-qol.ActivitySheetTabs.${id}`) });
  const marked = app._markTabs({ "midi-qol": { id: "midi-qol", group: "sheet", icon: "fa-solid fa-sun", label: "midi-qol", tabs: {
    modConditions: sub("modConditions", "fa-solid fa-filter"), workflowSettings: sub("workflowSettings", "fa-solid fa-gears"),
    activityManagement: sub("activityManagement", "fa-solid fa-sitemap"), overtime: sub("overtime", "fa-solid fa-clock"),
    activityMacro: sub("activityMacro", "fa-solid fa-file-pen")
  } } });
  context.tabs = { ...(context.tabs ?? {}), "midi-qol": marked["midi-qol"] };
  // midi's tab part reads its own tab (dnd5e sets context.tab in each of its parts, and the context is shared)
  context.midiTab = marked["midi-qol"];
}

/** Data several parts read (was midi's _preparePartContext) */
function sharedContext(app: ActivitySheetApp, context: AnyMutableObject) {
  const activity = app.activity;
  context.hasDamage = activity.damage;
  context.isSummons = isActivityType(activity, "summon");
  context.consumesHP = activity.consumption?.targets?.some(t => t.target === "attributes.hp.value");
  context.hasAreaTarget = !!activity.target?.template?.type;
  // Region-behaviour panel only for real area or emanation templates (areaTargetTypes): not an emanation with no template
  context.showRegionBehaviorPanel = activityHasAreaTarget(activity);
  context.attachTokenOptions = attachTokenOptions(activity.regionBehavior?.attachToken ?? "default");
  context.templateOriginOptions = templateOriginOptions(activity.regionBehavior?.templateOrigin ?? "default");
}

/** The activity an activity triggers, without waiting (a pre-render hook is synchronous): by id, identifier or uuid */
function triggeredActivityOf(activity: MidiActivity | undefined): MidiActivity | undefined {
  const id = activity?.midiProperties?.triggeredActivityId;
  if (!activity || !id) return undefined;
  // @ts-expect-error no dnd5e-types
  const activities = activity.item?.system?.activities;
  return activities?.find((a: MidiActivity) => a.id === id) ?? activities?.find((a: MidiActivity) => a.identifier === id)
    ?? (fromUuidSync(id, { strict: false }) as MidiActivity | null) ?? undefined;
}

/** The midi tab's data (was midi's _prepareMidiQolContext) */
function midiTabContext(app: ActivitySheetApp, context) {
  context.midiStatuses = statusesOf(app).map(entry => ({ ...entry,
    durations: entry.specialDuration.map(key => ({ key, label: specialDurationChoices[key] ?? key }))
  }));
  context.midiStatusOptions = Object.fromEntries(CONFIG.statusEffects.map(status => [status.id, i18n(status.name ?? status.id)])
    .sort((a, b) => a[1].localeCompare(b[1], game.i18n?.lang)));
  context.specialDurationOptions = specialDurationChoices;
  context.ConfirmTargetOptions = Object.entries(confirmTargetOptions).map(([value, label]) => ({ value, label }));
  if (app.activity.forcedTargetConfirmation) {
    context.ConfirmTargetOptions = context.ConfirmTargetOptions.filter(o => o.value === app.activity.forcedTargetConfirmation);
    // Show the effective value, not the stored one, and stop it being edited: the stored value
    // has no effect while the activity forces a result.
    context.confirmTargetsForced = true;
    context.confirmTargetsValue = app.activity.forcedTargetConfirmation;
}
// v14 message-mode values (was legacy CONST.DICE_ROLL_MODES). Stored legacy values are migrated
// to v14 below so the picker matches and re-saves the new value.
context.RollModeOptions = [
  { value: "default", label: i18n("Default") },
  { value: "public", label: i18n("CHAT.RollPublic") },
  { value: "gm", label: i18n("CHAT.RollPrivate") },
  { value: "blind", label: i18n("CHAT.RollBlind") },
  { value: "self", label: i18n("CHAT.RollSelf") }
];
// Migrate-on-edit: normalize a legacy stored rollMode to its v14 equivalent for display + save.
const srcMidi = context.source?.midiProperties;
if (srcMidi && srcMidi.rollMode && srcMidi.rollMode !== "default")
  srcMidi.rollMode = rollModeToMessageMode(srcMidi.rollMode) ?? srcMidi.rollMode;
context.RemoveChatButtonsOptions = Object.entries(foundry.utils.mergeObject({ "default": i18n("midi-qol.MidiSettings") }, removeButtonsOptions))
  .map(([value, label]) => ({ value, label }));
context.placeholderIdentifier = context.activity.identifier;
const midiProperties = context.activity.midiProperties;

context.ConsumeDialogOptions = Object.entries(consumeConfigOptions).map(([value, label]) => {
  return { value, label, selected: midiProperties.forceConsumeDialog === value }
});;
context.RollDialogOptions = Object.entries(rollConfigOptions).map(([value, label]) => {
  return { value, label, selected: midiProperties.forceRollDialog === value }
})
context.DamageDialogOptions = Object.entries(damageConfigOptions).map(([value, label]) => {
  return { value, label, selected: midiProperties.forceDamageDialog === value }
});
// @ts-expect-error no dnd5e-types
  context.otherActivityOptions = app.item.system.activities
  .filter(a => a.id !== app.activity.id && a.isOtherActivityCompatible)
  .reduce((ret, a) => {
    const identifierString = a.identifier === a.name.slugify() ? "" : ` (${a.identifier})`;
    ret.push({ label: `${a.name}${identifierString}`, value: a.identifier, id: a.id });
    return ret
  }, [{ label: "Default", value: "" }, { label: "None", value: "none" }]);
const selectedOtherActivity = app.activity.otherActivityId ?? "";
context.otherActivityOptions?.forEach(option => { option.selected = option.value === selectedOtherActivity || option.id === selectedOtherActivity });
// @ts-expect-error no dnd5e-types
  context.triggeredActivityOptions = app.item.system.activities
  .filter(a => a.id !== app.activity.id && a.isTriggerableActivity !== false)
  .reduce((ret, a) => {
    // Another module's activity has no identifier; it is chosen by id.
    const identifierString = !a.identifier || a.identifier === a.name.slugify() ? "" : ` (${a.identifier})`;
    ret.push({ label: `${a.name}${identifierString}`, value: a.identifier ?? a.id, id: a.id }); return ret
  }, [{ label: "None", value: "none" }]);
context.triggeredActivityOptions?.filter(option => { option.selected = option.value === midiProperties?.triggeredActivityId || option.id === midiProperties?.triggeredActivityId });
let activity = context.activity;
let triggeredActivity = triggeredActivityOf(context.activity);
const triggerList: String[] = [activity.name];
while (triggeredActivity) {
  triggerList.push(triggeredActivity.name);
  if (triggeredActivity.id === activity.id) {
    ui.notifications?.error(`midi-qol | Circular activity call detected ${triggerList.join("->")}`);
    break;
  }
  triggeredActivity = triggeredActivityOf(triggeredActivity);
}
context.triggeredActivityTargetOptions = Object.entries(triggeredActivityTargetOptions).map(([value, label]) => {
  return { value, label, selected: midiProperties.triggeredActivityTargets === value }
})
context.triggeredActivityRollAsOptions = Object.entries(triggeredActivityRollAsOptions).map(([value, label]) => {
  return { value, label, selected: midiProperties.triggeredActivityRollAs === value }
});
if ((triggeredActivityOf(context.activity))?.isSelfTriggerableOnly) {
  context.triggeredActivityRollAsOptions = context.triggeredActivityRollAsOptions.filter(o => o.value === "self");
  // adjust target list
}
context.ignoreTraitsOptions = getIgnoreTraitsOptions().map((option) => {
  return { ...option, selected: !!midiProperties?.ignoreTraits?.has(option.value) }
});
context.AutoTargetTypeOptions = Object.entries(aoeTargetTypeOptions).map(([value, label]) => ({ value, label }));
const AutoCEEffectsOptions = Object.entries(autoCEEffectsOptions).map(([value, opt]) => ({ value, label: typeof opt === "string" ? opt : opt.label }));
context.AutoCEEffectsOptions = [{ value: "default", label: i18n("midi-qol.MidiSettings") }, ...AutoCEEffectsOptions];
const defaultAction = { "default": i18n("midi-qol.MidiSettings") };
context.AutoTargetActionOptions = Object.entries(foundry.utils.mergeObject(defaultAction, autoTargetOptions)).map(([value, opt]) => ({ value, label: typeof opt === "string" ? opt : opt.label }));
context.possibleOtherActivity = app.activity.possibleOtherActivity;
context.turnChoiceOptions = [{ value: "start", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.start") }, { value: "end", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.end") }];
context.overTimeRollAsOptions = [{ value: "target", label: i18n("midi-qol.OVERTIME.FIELDS.rollAs.target") }, { value: "source", label: i18n("midi-qol.OVERTIME.FIELDS.rollAs.source") }];
context.CEActive = installedModules.get("dfreds-convenient-effects");
}

/** After drawing (was midi's _onRender): status duration lists; region behaviour on sets the targeting override */
function onRender(app: ActivitySheetApp) {
  app.element.querySelectorAll<HTMLSelectElement>("select[data-midi-status-duration]")
    .forEach(select => select.addEventListener("change", event => addMidiStatusDuration(app, event)));
  if (!activityHasAreaTarget(app.activity)) return;
  const enabled = app.element.querySelector<HTMLInputElement>('input[name="regionBehavior.enabled"]');
  if (!enabled) return;
  if (app.activity.regionBehavior?.enabled && !app.activity.target?.override) app.activity.update({ "target.override": true });
  enabled.addEventListener("change", async () => {
    if (enabled.checked && !app.activity.target?.override) await app.activity.update({ "target.override": true });
  });
}

/** The activity's statuses as stored (a copy to change and write back) */
function statusesOf(app: ActivitySheetApp): MidiStatus[] {
  const props = app.activity.toObject().midiProperties;
  return props && typeof props === "object" && "statuses" in props && Array.isArray(props.statuses) ? props.statuses : [];
}

/** A special duration chosen from a status's "add" list joins that status's durations */
function addMidiStatusDuration(app: ActivitySheetApp, event: Event) {
  // Not a form field: the form must not submit the status list before this update
  event.stopPropagation();
  const select = event.currentTarget as HTMLSelectElement;
  const statuses = statusesOf(app);
  const entry = statuses[Number(select.dataset.midiStatusDuration)];
  if (!entry || !select.value || entry.specialDuration.includes(select.value)) return;
  entry.specialDuration.push(select.value);
  app.activity.update({ "midiProperties.statuses": statuses });
}

// The sheet's actions (ApplicationV2 calls them with the sheet as `this`)
function addMidiStatus(this: ActivitySheetApp) {
  this.activity.update({ "midiProperties.statuses": [...statusesOf(this), { id: "", specialDuration: [], onSave: false }] });
}

function deleteMidiStatus(this: ActivitySheetApp, _event: PointerEvent, target: HTMLElement) {
  const statuses = statusesOf(this);
  statuses.splice(Number(target.dataset.index), 1);
  this.activity.update({ "midiProperties.statuses": statuses });
}

function deleteMidiStatusDuration(this: ActivitySheetApp, _event: PointerEvent, target: HTMLElement) {
  const statuses = statusesOf(this);
  const entry = statuses[Number(target.dataset.index)];
  if (!entry) return;
  entry.specialDuration = entry.specialDuration.filter(key => key !== target.dataset.key);
  this.activity.update({ "midiProperties.statuses": statuses });
}

function addMacro(this: ActivitySheetApp) {
  const Editor = globalThis.DAE?.DIMEditor;
  if (Editor) new Editor({ document: this.activity }).render({ force: true });
  else ui.notifications?.error("DIMEditor not available - install Dynamic Active Effects");
}

function openConditionEditor(this: ActivitySheetApp, _event: PointerEvent, target: HTMLElement) {
  const fieldName = target.dataset.fieldName ?? "";
  const fieldLabel = target.dataset.fieldLabel ?? fieldName;
  const input = target.closest(".midi-condition-field-wrapper")?.querySelector("input") as HTMLInputElement | null;
  if (!input) return;
  new ConditionEditor({
    value: input.value, key: fieldName, label: fieldLabel, parent: this.activity?.item ?? null,
    onSubmit: (newValue: string) => {
      input.value = newValue;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    onCancel: () => { }
  }).render({ force: true });
}

function openConditionBuilder(this: ActivitySheetApp, _event: PointerEvent, target: HTMLElement) {
  const input = target.closest(".midi-condition-field-wrapper")?.querySelector("input") as HTMLInputElement | null;
  if (!input) return;
  new ConditionBuilder({
    value: input.value, label: target.dataset.fieldLabel ?? "", parent: this.activity?.item ?? null,
    onSubmit: (newValue: string) => {
      input.value = newValue;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }).render({ force: true });
}

function openRegionBehaviorEditor(this: ActivitySheetApp) {
  new RegionBehaviorEditor(this.activity).render({ force: true });
}

/**
 * DAE's activity macro editor as a header button (green when the activity has a macro). Foundry 14's render hooks pass
 * the application's root element: the old `[elem]` (a jQuery list) threw on every activity sheet render.
 */
function renderActivitySheetHook(app: unknown, element: HTMLElement) {
  const Editor = globalThis.DAE?.DIMEditor;
  if (!Editor || !isActivitySheet(app)) return;
  const activity = app.activity;
  if (!activity.macro) return;
  const header = element.querySelector(".window-header");
  const existing = header?.querySelector<HTMLElement>("button.dae-dimeditor");
  const hasMacro = activity.macro instanceof Macro && !!activity.macro.command;
  if (existing) {
    if (hasMacro) existing.style.color = "#36ba36";
    return;
  }
  const close = header?.querySelector('button[data-action="close"]');
  if (!close) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "header-control fa-solid fa-file-pen dae-dimeditor icon";
  button.title = "Activity Macro Editor";
  button.addEventListener("click", () => new Editor({ document: app.activity }).render({ force: true }));
  if (hasMacro) button.style.color = "#36ba36";
  close.parentNode?.insertBefore(button, close);
}

/** Any activity sheet (DAE's button is offered on every type's) */
function isActivitySheet(app: unknown): app is ActivitySheetApp {
  return !!app && typeof app === "object" && "activity" in app;
}
