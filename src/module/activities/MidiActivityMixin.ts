import { getDistance } from "../services/distance/service.js";
import { adoptedActivityTypes } from "./graft.js";
import { queryUser } from "../lib/midiQueries.js";
import { registerCardAction, registerCardActions } from "./cardActions.js";
import { cardOtherConsumption } from "../lib/cardState.js";
import { TokenDocumentSet, memberCount } from "../lib/tokenDocumentSet.js";
import { Activity, ActivityEffectData, ActivityUseConfiguration, RollDialogConfig, DND5ETargetDescriptor, RollMessageConfig, RollProcessConfig, MidiUsageChatContext, Dnd5eSystem, EmanationShapeData } from "../../globals.js";
import { GameSystemConfig, MODULE_ID, debugEnabled, error, i18n, i18nFormat, warn, busyWait, specialDurationChoices } from "../../midi-qol.js";
import { socketlibSocket, timedAwaitExecuteAsGM } from "../GMAction.js";
import { ActiveDefenceWorkflow, AugmentedEvent, TrapWorkflow, Workflow, SavesFirstWorkflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { ConditionEditor } from "../apps/ConditionEditor.js";
import { runFollowUp } from "../followUps.js";
import { RegionBehaviorEditor } from "../apps/RegionBehaviorEditor.js";
import { skipConcentrationActorUuids } from "../patching.js"
import {
  aoeTargetTypeOptions,
  autoCEEffectsOptions,
  autoTargetOptions,
  checkMechanic,
  checkRule,
  configSettings,
  confirmTargetOptions,
  getIgnoreTraitsOptions,
  removeButtonsOptions,
  safeGetGameSetting,
  triggeredActivityRollAsOptions,
  triggeredActivityTargetOptions,
  rollConfigOptions,
  consumeConfigOptions,
  damageConfigOptions
} from "../settings.js";
import { installedModules } from "../setupModules.js";
import { saveUndoData } from "../undo.js";
import { clearAbandonedUse, isRelaunched, noteCall, takeRelaunch, type UseState } from "./useRelaunch.js";
import { activityHasAreaTarget, callActivityHooks, canSee, canSense, checkActivityRange, checkTargetsSeen, checkTotalCover, checkIncapacitated, createConditionData, evalActivationCondition, evalCondition, getAutoRollAttack, getAutoRollDamage, getRemoveAttackButtons, getRemoveDamageButtons, getSpeaker, getToken, activityHasAutoPlaceTemplate, confirmUseOffScene, hasUsedBonusAction, hasUsedReaction, autoConsumeResource, isInCombat, logIncapacitatedCheckResult, needsBonusActionCheck, needsReactionCheck, setBonusActionUsed, setReactionUsed, getOrCreateTokenForActor, validTargetTokens, userTargetsKeepingUndrawn, hasNoReactionsMarker, HEALING_BUTTON_KEY, activityHasEmanationNoTemplate, getActivityAutoTargetAction, areMidiKeysPressed, getActor, setRangedTargets, updateUserTargets, isValidTarget, needsAOOCheck, getConsumptionData, toMessageMode, rollModeToMessageMode, tokenSourceCenter, isActivityType, speakerFor, setMessageTargets } from "../utils.js";
import { activityHasScaledTargetCount, attachTokenOptions, templateOriginOptions, createActivityTemplateRegions, preTemplateTargets, removeFlanking, requiresTargetConfirmation, selectTargetsFromTemplates, shouldEnforceSingleTarget } from "./activityHelpers.js";


/** The player's targets now are the use's pre-selection (user-targets plan stage 3): its snapshot and the workflow's */
function retakeUserTargets(workflow: Workflow, usage?: ActivityUseConfiguration): void {
  const uuids = Array.from(game.user?.targets ?? []).map(t => t.document.uuid).filter((uuid): uuid is string => !!uuid);
  // setupTargets reads the use's own options; the workflow keeps its merged copy
  if (usage?.midiOptions?.workflowOptions) usage.midiOptions.workflowOptions.preSelectedTargetUuids = uuids;
  workflow.workflowOptions.preSelectedTargetUuids = uuids;
  workflow.preSelectedTargets = new TokenDocumentSet(uuids);
}

export class MidiConditionField extends globalThis.dnd5e.dataModels.fields.FormulaField {
  _validateType(value: unknown) {
    return typeof value === "string";
  }
  constructor(options: any) {
    super(options);
  }
  static get _defaults(): any {
    return foundry.utils.mergeObject(super._defaults, {
      deterministic: false
    });
  }

  /**
   * Override _toInput to wrap the text input with a condition editor button.
   * The button opens the ConditionEditor which provides autocomplete for condition expressions.
   */
  _toInput(config: any): HTMLElement {
    // A plain text input: Foundry 14 draws formula fields with its dice Formula Editor (the λ button), not for conditions
    const input = foundry.applications.fields.createTextInput(config) as HTMLInputElement;

    if (!configSettings.conditionEditorEnabled) return input;

    // Create wrapper container
    const wrapper = document.createElement("div");
    wrapper.classList.add("midi-condition-field-wrapper");
    wrapper.appendChild(input);

    // Create editor button using data-action pattern (event listeners don't survive Handlebars outerHTML serialization)
    const fieldName = config.name ?? this.name;
    const fieldLabel = this.label ?? config.name ?? this.name;
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("midi-condition-editor-btn", "unbutton", "control-button");
    button.dataset.action = "openConditionEditor";
    button.dataset.fieldName = fieldName;
    button.dataset.fieldLabel = fieldLabel;
    button.innerHTML = '<i class="fas fa-code" inert></i>';
    button.dataset.tooltip = i18n("midi-qol.ConditionEditor.Tooltip");
    button.ariaLabel = i18n("midi-qol.ConditionEditor.Tooltip");

    wrapper.appendChild(button);
    return wrapper;
  }
}


/**
 * Apply optional region update + region behavior creation. GMs run locally; non-GMs send
 * a single batched socket call. We gate on isGM because RegionDocument#canUserModify can
 * report "update" permission for the player who just placed the template (Foundry grants
 * owner perms to the creator), but creating embedded RegionBehaviors requires scene-level
 * write which only GMs have — checking update perms gives a false positive there.
 */
async function writeRegion(
  regionDoc: any,
  ops: { update?: Record<string, any>; behaviors?: any[] }
): Promise<any> {
  const hasUpdate = !!(ops.update && Object.keys(ops.update).length > 0);
  const hasBehaviors = !!(ops.behaviors && ops.behaviors.length > 0);
  if (!hasUpdate && !hasBehaviors) return undefined;

  if (game.user?.isGM) {
    if (hasUpdate) await regionDoc.update(ops.update);
    if (hasBehaviors) return regionDoc.createEmbeddedDocuments("RegionBehavior", ops.behaviors);
    return undefined;
  }

  return timedAwaitExecuteAsGM("setupRegion", {
    regionUuid: regionDoc.uuid,
    update: hasUpdate ? ops.update : undefined,
    behaviors: hasBehaviors ? ops.behaviors : undefined,
  });
}


/**
 * The activity an ammunition item contributes, if any.
 *
 * `automationOnly` wins: that is the deliberate marker for an activity meant to be triggered rather
 * than used directly. The fallback exists because `otherActivityCompatible` defaults to true, so
 * most activities qualify and a homebrew item may not mark one.
 *
 * Takes the item rather than reading it off an activity, because the caller sometimes holds a
 * rebuilt copy: ammunition with `uses.autoDestroy` is deleted by dnd5e as the last piece is spent,
 * and midi reconstructs it from the chat card.
 */
export function findAmmunitionActivity(ammunitionItem: any): any | undefined {
  if (!ammunitionItem) return undefined;
  const activities = ammunitionItem.system?.activities;
  const found = activities?.find((a: any) => a.midiProperties?.automationOnly && a.isOtherActivityCompatible)
    ?? activities?.find((a: any) => a.isOtherActivityCompatible);
  found?.prepareData();
  return found;
}


export let MidiActivityMixin = Base => {
  interface MidiActivityMixin extends Activity { };

  class MidiActivityMixin extends Base {
    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.SHARED"];











    static metadata = foundry.utils.mergeObject(
      super.metadata, {
      usage: {
        dialog: MidiActivityUsageDialog,
      },
    }, { inplace: false, insertValues: true, insertKeys: true });
  }
  return MidiActivityMixin;
}

export let MidiActivityMixinSheet = Base => {
  return class MidiActivitySheet extends Base {

    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions = {
      ...super.DEFAULT_OPTIONS,
      actions: {
        ...super.DEFAULT_OPTIONS.actions,
        addMacro: MidiActivitySheet.#addMacro,
        openConditionEditor: MidiActivitySheet.#openConditionEditor,
        openRegionBehaviorEditor: MidiActivitySheet.#openRegionBehaviorEditor,
        addMidiStatus: MidiActivitySheet.#addMidiStatus,
        deleteMidiStatus: MidiActivitySheet.#deleteMidiStatus,
        deleteMidiStatusDuration: MidiActivitySheet.#deleteMidiStatusDuration,
      }
    }

    static CLEAN_ARRAYS = [...super.CLEAN_ARRAYS, "midiProperties.statuses"];

    static #addMidiStatus() {
      const statuses = this.activity.toObject().midiProperties?.statuses ?? [];
      this.activity.update({ "midiProperties.statuses": [...statuses, { id: "", specialDuration: [], onSave: false }] });
    }

    static #deleteMidiStatus(event: PointerEvent, target: HTMLElement) {
      const statuses = this.activity.toObject().midiProperties?.statuses ?? [];
      statuses.splice(Number(target.dataset.index), 1);
      this.activity.update({ "midiProperties.statuses": statuses });
    }

    static #deleteMidiStatusDuration(event: PointerEvent, target: HTMLElement) {
      const statuses = this.activity.toObject().midiProperties?.statuses ?? [];
      const entry = statuses[Number(target.dataset.index)];
      if (!entry) return;
      entry.specialDuration = entry.specialDuration.filter(key => key !== target.dataset.key);
      this.activity.update({ "midiProperties.statuses": statuses });
    }

    /** A special duration chosen from a status's "add" list joins that status's durations. */
    _midiOnAddMidiStatusDuration(event: Event) {
      // Not a form field: the form must not submit the status list before this update.
      event.stopPropagation();
      const select = event.currentTarget as HTMLSelectElement;
      const statuses = this.activity.toObject().midiProperties?.statuses ?? [];
      const entry = statuses[Number(select.dataset.midiStatusDuration)];
      if (!entry || !select.value || entry.specialDuration.includes(select.value)) return;
      entry.specialDuration.push(select.value);
      this.activity.update({ "midiProperties.statuses": statuses });
    }
    static #addMacro() {
      const Editor = globalThis.DAE?.DIMEditor;
      if (Editor) new Editor({ document: this.activity }).render({ force: true });
      else ui.notifications?.error("DIMEditor not available - install Dynamic Active Effects");
    }

    static #openConditionEditor(event: PointerEvent, target: HTMLElement) {
      const fieldName = target.dataset.fieldName ?? "";
      const fieldLabel = target.dataset.fieldLabel ?? fieldName;
      const input = target.closest(".midi-condition-field-wrapper")?.querySelector("input") as HTMLInputElement | null;
      if (!input) return;

      new ConditionEditor({
        value: input.value,
        key: fieldName,
        label: fieldLabel,
        parent: this.activity?.item ?? null,
        onSubmit: (newValue: string) => {
          input.value = newValue;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        },
        onCancel: () => { }
      }).render({ force: true });
    }

    static #openRegionBehaviorEditor() {
      new RegionBehaviorEditor(this.activity).render({ force: true });
    }

    static PARTS = {
      ...super.PARTS,
      activation: {
        template: "modules/midi-qol/templates/activity/activation.hbs",
        templates: [
          ...super.PARTS.activation.templates,
          "modules/midi-qol/templates/activity/parts/region-behavior-targeting.hbs",
          "modules/midi-qol/templates/activity/parts/midi-targeting.hbs",
        ]
      },
      "midi-qol": {
        template: "modules/midi-qol/templates/activity/parts/midi-activity-tab.hbs",
      }
    }

    _getTabs() {
      const midiSubTabs = ["modConditions", "workflowSettings", "activityManagement", "overtime", "activityMacro"];
      if (!midiSubTabs.includes(this.tabGroups["midi-qol"])) {
        this.tabGroups["midi-qol"] = "modConditions";
      }

      let tabs = super._getTabs();
      tabs = {
        ...tabs,
        "midi-qol": {
          id: "midi-qol",
          group: "sheet",
          icon: "fa-solid fa-sun",
          label: "midi-qol",
          tabs: {
            modConditions: {
              id: "modConditions",
              group: "midi-qol",
              icon: "fa-solid fa-filter",
              label: i18n("midi-qol.ActivitySheetTabs.modConditions")
            },
            workflowSettings: {
              id: "workflowSettings",
              group: "midi-qol",
              icon: "fa-solid fa-gears",
              label: i18n("midi-qol.ActivitySheetTabs.workflowSettings")
            },
            activityManagement: {
              id: "activityManagement",
              group: "midi-qol",
              icon: "fa-solid fa-sitemap",
              label: i18n("midi-qol.ActivitySheetTabs.activityManagement")
            },
            overtime: {
              id: "overtime",
              group: "midi-qol",
              icon: "fa-solid fa-clock",
              label: i18n("midi-qol.ActivitySheetTabs.overtime")
            },
            activityMacro: {
              id: "activityMacro",
              group: "midi-qol",
              icon: "fa-solid fa-file-pen",
              label: i18n("midi-qol.ActivitySheetTabs.activityMacro")
            }
          }
        }
      }
      return super._markTabs(tabs);
    }

    async _prepareMidiQolContext(context) {
      context.midiStatuses = (this.activity.toObject().midiProperties?.statuses ?? []).map(entry => ({ ...entry,
        durations: entry.specialDuration.map(key => ({ key, label: specialDurationChoices[key] ?? key }))
      }));
      context.midiStatusOptions = Object.fromEntries(CONFIG.statusEffects.map(status => [status.id, i18n(status.name ?? status.id)])
        .sort((a, b) => a[1].localeCompare(b[1], game.i18n?.lang)));
      context.specialDurationOptions = specialDurationChoices;
      // context = await super._prepareEffectContext(context);
      context.ConfirmTargetOptions = Object.entries(confirmTargetOptions).map(([value, label]) => ({ value, label }));
      if (this.activity.forcedTargetConfirmation) {
        context.ConfirmTargetOptions = context.ConfirmTargetOptions.filter(o => o.value === this.activity.forcedTargetConfirmation);
        // Show the effective value, not the stored one, and stop it being edited: the stored value
        // has no effect while the activity forces a result.
        context.confirmTargetsForced = true;
        context.confirmTargetsValue = this.activity.forcedTargetConfirmation;
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
      const srcMidi = (context as any).source?.midiProperties;
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
      context.otherActivityOptions = this.item.system.activities
        .filter(a => a.id !== this.activity.id && a.isOtherActivityCompatible)
        .reduce((ret, a) => {
          const identifierString = a.identifier === a.name.slugify() ? "" : ` (${a.identifier})`;
          ret.push({ label: `${a.name}${identifierString}`, value: a.identifier, id: a.id });
          return ret
        }, [{ label: "Default", value: "" }, { label: "None", value: "none" }]);
      const selectedOtherActivity = this.activity.otherActivityId ?? "";
      context.otherActivityOptions?.forEach(option => { option.selected = option.value === selectedOtherActivity || option.id === selectedOtherActivity });
      context.triggeredActivityOptions = this.item.system.activities
        .filter(a => a.id !== this.activity.id && a.isTriggerableActivity !== false)
        .reduce((ret, a) => {
          // Another module's activity has no identifier; it is chosen by id.
          const identifierString = !a.identifier || a.identifier === a.name.slugify() ? "" : ` (${a.identifier})`;
          ret.push({ label: `${a.name}${identifierString}`, value: a.identifier ?? a.id, id: a.id }); return ret
        }, [{ label: "None", value: "none" }]);
      context.triggeredActivityOptions?.filter(option => { option.selected = option.value === this.activity.midiProperties.triggeredActivityId || option.id === this.activity.midiProperties.triggeredActivityId });
      let activity = context.activity;
      let triggeredActivity = await context.activity.getTriggeredActivity();
      const triggerList: String[] = [activity.name];
      while (triggeredActivity) {
        triggerList.push(triggeredActivity.name);
        if (triggeredActivity.id === activity.id) {
          ui.notifications?.error(`midi-qol | Circular activity call detected ${triggerList.join("->")}`);
          break;
        }
        triggeredActivity = await triggeredActivity.getTriggeredActivity?.();
      }
      context.triggeredActivityTargetOptions = Object.entries(triggeredActivityTargetOptions).map(([value, label]) => {
        return { value, label, selected: midiProperties.triggeredActivityTargets === value }
      })
      context.triggeredActivityRollAsOptions = Object.entries(triggeredActivityRollAsOptions).map(([value, label]) => {
        return { value, label, selected: midiProperties.triggeredActivityRollAs === value }
      });
      if ((await context.activity.getTriggeredActivity())?.isSelfTriggerableOnly) {
        context.triggeredActivityRollAsOptions = context.triggeredActivityRollAsOptions.filter(o => o.value === "self");
        // adjust target list
      }
      context.ignoreTraitsOptions = getIgnoreTraitsOptions().map((option) => {
        return { ...option, selected: this.activity.midiProperties.ignoreTraits.has(option.value) }
      });
      context.AutoTargetTypeOptions = Object.entries(aoeTargetTypeOptions).map(([value, label]) => ({ value, label }));
      const AutoCEEffectsOptions = Object.entries(autoCEEffectsOptions).map(([value, opt]) => ({ value, label: typeof opt === "string" ? opt : opt.label }));
      context.AutoCEEffectsOptions = [{ value: "default", label: i18n("midi-qol.MidiSettings") }, ...AutoCEEffectsOptions];
      const defaultAction = { "default": i18n("midi-qol.MidiSettings") };
      context.AutoTargetActionOptions = Object.entries(foundry.utils.mergeObject(defaultAction, autoTargetOptions)).map(([value, opt]) => ({ value, label: typeof opt === "string" ? opt : opt.label }));
      context.possibleOtherActivity = this.activity.possibleOtherActivity;
      context.turnChoiceOptions = [{ value: "start", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.start") }, { value: "end", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.end") }];
      context.overTimeRollAsOptions = [{ value: "target", label: i18n("midi-qol.OVERTIME.FIELDS.rollAs.target") }, { value: "source", label: i18n("midi-qol.OVERTIME.FIELDS.rollAs.source") }];
      context.CEActive = installedModules.get("dfreds-convenient-effects");
      return context;
    }

    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      context.hasDamage = this.activity.damage;
      context.isSummons = isActivityType(this.activity, "summon");
      context.consumesHP = this.activity.consumption?.targets?.some(t => t.target === "attributes.hp.value");
      context.hasAreaTarget = !!this.activity.target?.template?.type;
      if (partId === "midi-qol") {
        context.tab = context.tabs["midi-qol"];
        return this._prepareMidiQolContext(context);
      }
      if (partId === "activation") {
        // Region-behavior panel only renders for real AoE/emanation templates — matches
        // GameSystemConfig.areaTargetTypes, so emanationNoTemplate (no template at all) is excluded.
        context.showRegionBehaviorPanel = activityHasAreaTarget(this.activity);
        context.attachTokenOptions = attachTokenOptions(this.activity.regionBehavior?.attachToken ?? "default");
        context.templateOriginOptions = templateOriginOptions(this.activity.regionBehavior?.templateOrigin ?? "default");
      }
      return context;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      this.element.querySelectorAll("select[data-midi-status-duration]")
        .forEach(select => select.addEventListener("change", this._midiOnAddMidiStatusDuration.bind(this)));

      // Auto-set target.override when region behaviour is enabled. The form-rendered
      // checkbox lives in the activation tab via region-behavior-targeting.hbs.
      if (!activityHasAreaTarget(this.activity)) return;
      const enabledCheckbox = this.element.querySelector(
        'input[name="regionBehavior.enabled"]'
      ) as HTMLInputElement | null;
      if (!enabledCheckbox) return;
      if (this.activity.regionBehavior?.enabled && !this.activity.target?.override) {
        this.activity.update({ "target.override": true });
      }
      enabledCheckbox.addEventListener("change", async () => {
        if (enabledCheckbox.checked && !this.activity.target?.override) {
          await this.activity.update({ "target.override": true });
        }
      });
    }
  }
}

function renderActivitySheetHook(app, [elem]) {
  const Editor = globalThis.DAE?.DIMEditor;
  if (!Editor) return;
  let activity = app.activity;
  if (!activity.macro) return;
  let existingButton = elem.closest('.window-header').querySelector('button.dae-dimeditor');
  if (existingButton) {
    if (activity.macro?.command) existingButton.style.color = '#36ba36';
    return;
  }
  let closeButton = elem.closest('.window-header').querySelector('button[data-action="close"]');
  let daeButton = document.createElement('button');
  daeButton.setAttribute('class', 'header-control fa-solid fa-file-pen dae-dimeditor icon');
  daeButton.onclick = function (ev) { new Editor({ document: this.activity }).render({ force: true }); }.bind(app);
  if (activity.macro?.command) daeButton.style.color = '#36ba36';

  daeButton.title = "Activity Macro Editor";
  closeButton.parentNode.insertBefore(daeButton, closeButton);
}

export let MidiActivityUsageDialog;
/**
 * Each midi activity type's title (its `midiTitle`, else dnd5e's), chosen by the Activity Prefix setting when it is read:
 * the classes are defined before midi's settings load, and Boss Loot FX turns the prefix off as they do.
 */
export function setupActivityTitles() {
  for (const config of Object.values(GameSystemConfig.activityTypes)) {
    const cls = config?.documentClass;
    const metadata: unknown = cls && "metadata" in cls ? cls.metadata : undefined;
    if (typeof metadata !== "object" || metadata === null || !("midiTitle" in metadata) || typeof metadata.midiTitle !== "string") continue;
    const midiTitle = metadata.midiTitle;
    const dnd5eTitle = "dnd5eTitle" in metadata ? metadata.dnd5eTitle : undefined;
    Object.defineProperty(metadata, "title", {
      get: () => configSettings.activityNamePrefix ? midiTitle : dnd5eTitle,
      configurable: true,
      enumerable: true
    });
  }
}

export function setupMidiActivityMixin() {
  //@ts-expect-error
  const ActivityUsageDialog = game.system.applications.activity.ActivityUsageDialog;
  MidiActivityUsageDialog = class MidiActivityUsageDialog extends ActivityUsageDialog {
    async _prepareCreationContext(context, options) {
      context = await super._prepareCreationContext(context, options);
      //@ts-expect-error
      if (activityHasAutoPlaceTemplate(this.activity) || activityHasEmanationNoTemplate(this.activity)) {
        context.hasCreation = false;
      }
      return context;
    }
  }
  //@ts-expect-error
  Hooks.on("renderActivitySheet", renderActivitySheetHook);
  registerUsageMessageHooks();
  registerCardActions(undefined, {
    placeTemplate: cardPlaceTemplate,
    rollDamage: cardRollDamage,
    rollDamageNoCritical: cardRollDamageNoCritical,
    rollDamageCritical: cardRollDamageCritical,
    confirmDamageRollCancel: cardConfirmDamageRollCancel,
    confirmDamageRollComplete: cardConfirmDamageRollComplete,
    confirmDamageRollCompleteHit: cardConfirmDamageRollCompleteHit,
    confirmDamageRollCompleteMiss: cardConfirmDamageRollCompleteMiss,
    midiApplyEffects: cardApplyEffects,
    midiFollowUp: cardFollowUp,
    refundOtherActivity: cardRefundOtherActivity,
    consumeOtherActivity: cardConsumeOtherActivity
  });
  // Only where the activity type has no handler of its own: save and check activities keep theirs.
  registerCardAction("rollSave", cardRollOtherSave, { whenAbsent: true });
  registerCardAction("rollCheck", cardRollOtherSave, { whenAbsent: true });
}

/**
 * Handle the "Place Template" button click from the chat card.
 * Places all templates sequentially and delegates to workflow for validation and processing.
 */
async function cardPlaceTemplate(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  // `TemplatePlacement.fromActivity` runs the placement UI and creates the Regions itself,
  // returning them; the deprecated `AbilityTemplate` preview/draw dance is gone.
  let templates: MeasuredTemplateDocument[] = [];
  try {
    const created = await globalThis.dnd5e.canvas.TemplatePlacement.fromActivity(this);
    if (created?.length) templates = created as unknown as MeasuredTemplateDocument[];
  } catch (err) {
    // User cancelled during placement — fall through to validation
  }

  // Find workflow and process (handles count validation, deletion if incomplete)
  const workflow = Workflow.findWorkflow(message.uuid);
  if (!workflow) {
    warn("MidiActivityMixin | #placeTemplate | No workflow found for message", message.uuid);
    return;
  }

  // processPlacedTemplates handles validation, cleanup, and workflow advancement
  await workflow.processPlacedTemplates(templates, this);
}

function cardRollDamage(this: Activity, event, target, message) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow, midiOptions: { isCritical: workflow?.workflowOptions?.isCritical || workflow?.isCritical } }, {}, message);
}

function cardRollDamageNoCritical(this: Activity, event, target, message) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
}

function cardRollDamageCritical(this: Activity, event, target, message) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow, critical: { allow: true }, midiOptions: { isCritical: true } }, {}, message);
}

async function cardConfirmDamageRollCancel(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflowId = message.uuid;
  const authorId = message.author?.id;
  if (!authorId || !workflowId) return;
  if (!game.user?.isGM && configSettings.confirmAttackDamage === "gmOnly") {
    return;
  }
  /* TODO Since workflows are available locally we can use them to cancel the workflow without a socket call
    const workflow = Workflow.findWorkflow(workflowId);
    if (workflow) cancelWorkflow(workflowId);
  */
  const user = game.users?.get(authorId);
  if (user?.active) {
    await queryUser(game.users?.get(authorId ?? ""), "cancelWorkflow", { workflowId, itemCardUuid: message.uuid }).then(result => {
      if (typeof result === "string") ui.notifications?.warn(result);
    });
  } else {
    await Workflow.removeItemCardButtons(message.uuid, { removeAllButtons: true });
  }
}

/** The activity's own confirmation step (midi's activities) */
async function confirmOnCard(activity: Activity, action: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  if (isMidiActivityType(activity)) await doConfirmation(activity, action, event, target, message);
}

async function cardConfirmDamageRollComplete(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  await confirmOnCard(this, "confirmDamageRollComplete", event, target, message);
}

async function cardConfirmDamageRollCompleteHit(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  await confirmOnCard(this, "confirmDamageRollCompleteHit", event, target, message);
}

async function cardConfirmDamageRollCompleteMiss(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  await confirmOnCard(this, "confirmDamageRollCompleteMiss", event, target, message);
}

async function cardApplyEffects(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message.uuid);
  if (workflow) workflow.activityFor(this);
  if (!workflow) {
    const errMessage = "MidiQOL | MidiActivity | applyEffects | No workflow found";
    error(errMessage);
    TroubleShooter.recordError(new Error("No workflow found"), errMessage);
    return;
  }
  const authorId = message.author?.id;
  if (game.user?.id !== authorId) {
    // applying effects on behalf of another user;
    if (!game.user?.isGM) {
      ui.notifications?.warn("Only the GM can apply effects for other players")
      return;
    }
    if (game.user?.targets.size === 0) {
      ui.notifications?.warn(i18n("midi-qol.noTargets"));
      return;
    }
    await queryUser(game.users?.get(authorId ?? ""), "applyEffects", {
      workflowId: message.uuid,
      targets: Array.from(game.user?.targets).map(t => t.document.uuid)
    });
  } else {
    // Forced: effects go to the use's targets; the user's only confirm the request
    workflow.forceApplyEffects = true;
    if (game.user?.targets.size) await workflow.performState("midi-qol.ApplyDynamicEffects")
  }
}

async function cardFollowUp(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const index = Number(target.dataset.followUp);
  if (Number.isInteger(index)) await runFollowUp(message, index);
}

async function cardRefundOtherActivity(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  // Get the other activity from the associated activity on the message
  //@ts-expect-error no dnd5e types
  const activity = message.getAssociatedActivity?.() as Activity | undefined;
  const otherActivity = activity?.otherActivity;
  if (!otherActivity) return;

  // What the other activity's use consumed (mirrors dnd5e's structure)
  const { consumed } = cardOtherConsumption(message);
  if (!consumed || foundry.utils.isEmpty(consumed)) return;
  await otherActivity.refund(consumed);
  // Nothing consumed now: the refund button goes (shouldHideChatButton)
  await message.update({ "system.midi.state.otherConsumed": null } as ChatMessage.UpdateData);
  // A card made before 14.6.9 kept it in its flags
  if (message.flags[MODULE_ID]?.use?.consumed) await message.update({ [`flags.${MODULE_ID}.use.consumed`]: null } as ChatMessage.UpdateData);
}

async function cardConsumeOtherActivity(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  // Get the other activity from the associated activity on the message
  //@ts-expect-error no dnd5e types
  const activity = message.getAssociatedActivity?.() as Activity | undefined;
  const otherActivity = activity?.otherActivity;
  if (!otherActivity) return;

  // Prepare usage config for consumption
  const otherUsageConfig = otherActivity._prepareUsageConfig({
    consume: { resources: true, spellSlot: false, action: false }
  });

  // Check if consumption would succeed
  const consumptionCheck = await otherActivity._prepareUsageUpdates(otherUsageConfig, { returnErrors: true });
  if (Array.isArray(consumptionCheck) && consumptionCheck.length > 0) {
    // Consumption would fail - show warning
    ui.notifications?.warn(i18nFormat("midi-qol.otherActivityConsumptionFailed", {
      actorName: otherActivity.actor?.name ?? "Unknown",
      itemName: otherActivity.item?.name ?? "Unknown",
      activityName: otherActivity.name ?? "Unknown"
    }));
    return;
  }

  // Consume resources
  const messageConfig: any = { data: {} };
  const consumeResult = await otherActivity.consume(otherUsageConfig, messageConfig);
  if (consumeResult === false) {
    // Consumption was cancelled by a hook
    return;
  }

  // Get consumed delta data from messageConfig (not return value)
  const consumed = getConsumptionData(messageConfig);

  // Recorded on the card: the consume button goes and the refund button shows (shouldHideChatButton)
  if (consumed) await message.update({ "system.midi.state.otherConsumed": consumed, "system.midi.state.otherDeclined": null } as ChatMessage.UpdateData);
}

/** A save or check button for another activity's save, on this activity's card: that activity rolls it. */
async function cardRollOtherSave(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message.uuid);
  const source: Activity | undefined = workflow?.otherSaveActivity ?? (this.otherSaveSource as Activity | undefined);
  // @ts-expect-error no dnd5e-types
  const action = target.dataset.action ?? message.system.getButton(target)?.action;
  const handler = source?.metadata?.usage?.actions?.[action];
  if (!source || source === this || !handler) return;
  // A save activity's handler adopts the card's workflow as its own; this card's workflow stays this activity's.
  const activity = workflow?.activity;
  try {
    return await handler.call(source, event, target, message);
  } finally {
    if (workflow && activity) workflow.activity = activity;
  }
}

/**
 * midi's part of a use card's creation, on dnd5e's hooks (M14; was an override of `_createUsageMessage`).
 * Before: the card's rendering decisions, settled into its system data. They depend on the workflow, which exists now
 * and is gone by the time the card is drawn again after a reload, so they are decided once and stored
 * (`MidiUsageMessageData` reads them back); `midiUsageContext` works them out. A use started from inside another of the
 * actor's workflows is linked to its card, as dnd5e links saves.
 * After: the use's workflow is its card's from now on, filed under the card's uuid before dnd5e places the use's
 * templates and calls postUseActivity (not only when use() returns).
 */
/** An activity midi has adopted (graft.ts until M14 stage 2): it works out its card's context */
type UsageCardActivity = Activity & { midiUsageContext?: (message: unknown) => MidiUsageChatContext };

export function registerUsageMessageHooks() {
  Hooks.on("dnd5e.preCreateUsageMessage", (activity: UsageCardActivity, messageConfig: { data?: Record<string, unknown> }) => {
    if (!isMidiActivityType(activity)) return;
    try {
      const context = midiUsageContext(activity, messageConfig);
      // Only what is set: the schema reads an absent flag as false, absent displayProperties as true
      const flags = ["hasAttack", "hasDamage", "hasEffects", "condensed", "mergeCardMulti",
        "confirmAttackDamage", "hideItemDetails"] as const;
      const midi: Record<string, unknown> = Object.fromEntries(flags.filter(key => context[key]).map(key => [key, true]));
      if (!context.displayProperties) midi.displayProperties = false;
      if (context.dmgBtnText) midi.dmgBtnText = context.dmgBtnText;
      const origin = activity.actor ? Workflow.executingCardFor(activity.actor)?.id ?? null : null;
      messageConfig.data ??= {};
      foundry.utils.mergeObject(messageConfig.data, { system: { midi, ...(origin ? { origin } : {}) } });
    } catch (err) {
      // A card that cannot describe itself is still better than no card at all
      console.error(`${MODULE_ID} | could not record usage card state`, err);
    }
  });
  Hooks.on("dnd5e.postCreateUsageMessage", (activity: Activity, card: ChatMessage.Implementation | object) => {
    const workflow = Workflow.workflowFor(activity);
    if (!(card instanceof ChatMessage) || !workflow || workflow.itemCardUuid) return;
    workflow.itemCardUuid = card.uuid;
    workflow.id = card.uuid;
    Workflow.addWorkflow(workflow);
  });
}

/** An activity of a type midi uses (graft.ts's adopted types until M14 stage 3): midi's functions apply to it */
export function isMidiActivityType(activity: Activity | null | undefined): activity is MidiActivity {
  return !!activity?.type && adoptedActivityTypes.has(activity.type);
}

/** midi's region settings on an activity (activitySchema.ts `regionBehavior`) */
interface ActivityRegionBehavior {
  enabled: boolean; dispositionFilter: number; excludeSource: boolean; oncePerTurn: boolean; wallRestriction: string;
  regionVisibility: number; attachToken: string; moveDistance: number; moveDirection: string; moveTiming: string;
  templateOrigin: string; rules: { trigger: string, action: string, targetId: string }[];
}

/** midi's region light on an activity (activitySchema.ts `regionLight`) */
interface ActivityRegionLight {
  enabled: boolean; dim: number; bright: number; color: string | null; alpha: number; luminosity: number;
  animationType: string | null; animationSpeed: number; animationIntensity: number;
}

/** An activity midi uses: dnd5e's, with midi's fields (activitySchema.ts) and getters (activityPrototype.ts) */
export type MidiActivity = Activity & {
  regionBehavior?: ActivityRegionBehavior;
  regionLight?: ActivityRegionLight;
  effectiveActivationType?: string;
  isSelfTriggerableOnly?: boolean;
  use?(usage?: ActivityUseConfiguration, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<unknown>;
};

/* midi's own activity methods (M14 stage 2: were MidiActivityMixin members, installed on dnd5e's classes by graft.ts) */

export async function doConfirmation(activity: MidiActivity, actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  if (!game.user?.isGM && configSettings.confirmAttackDamage === "gmOnly") {
    return;
  }
  if (message.author?.active) {
    const result = await queryUser(message.author, actionToCall, { workflowId: message.uuid, activityUuid: activity.uuid, itemCardUuid: message.uuid });
    if (typeof result === "string") ui.notifications?.warn(result);
  } else {
    await Workflow.removeItemCardButtons(message.uuid, { removeConfirmButtons: true });
  }
}











export async function useAs(used: MidiActivity, actor: Actor.Implementation | null | undefined, usage: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
  // itemData._id = used.item._id;
  actor = getActor(usage.midiOptions?.rollAs);
  if (usage.midiOptions?.rollAs) delete usage.midiOptions.rollAs;
  if (!actor || actor === used.actor || used.isSelfTriggerableOnly) return used.use?.(usage, dialog, message);
  const itemData = used.item.toObject();
  // @ts-expect-error
  delete itemData._id;
  foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.syntheticItem`, true);
  let item = new CONFIG.Item.documentClass(itemData, { parent: actor });
  item.prepareData();
  //@ts-expect-error no dnd5e-types
  item.prepareFinalAttributes(); // Since actor prepareData is not being called need to do used here
  // @ts-expect-error no dnd5e-types
  const activity = item.system.activities.get(used.id);
  return activity.use(usage, dialog, message);
}

/**
 * midi's use (M10, activities/useRelaunch.ts): calls dnd5e's use with a use key, which midi's preUseActivity
 * listener cancels and restarts after midi's pre-use work; returns the restart's result. The restarted call
 * (marked) is dnd5e's use itself, so other listeners see one use.
 */

export async function prepareUse(used: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<{ done: true, result: unknown } | { done: false, state: UseState }> {
  const stop = (result?: unknown) => ({ done: true as const, result });
  if (usage.midiOptions?.rollAs) return stop(await useAs(used, usage.midiOptions.rollAs, usage, dialog, message));
  if (!used.item.isEmbedded) return stop();
  if (!used.item.isOwner) {
    ui.notifications?.error("DND5E.DocumentUseWarn", { localize: true });
    return stop();
  }
  if (!used.canUse) {
    ui.notifications?.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
    return stop();
  }
  // A GM's own use (a click, not a macro, reaction or another module's call)
  const interactive = !!usage.event && !usage.workflow && !usage.midiOptions?.workflowOptions?.forceCompletion;
  const offScene = interactive ? await confirmUseOffScene(used.actor) : "here";
  if (offScene === "cancel") return stop();
  // Copies: a caller may reuse one options object across uses, and used snapshot belongs to used use alone.
  usage.midiOptions = { ...usage.midiOptions };
  usage.midiOptions.workflowOptions = { ...usage.midiOptions.workflowOptions };
  // The view moved to the creature's scene, which clears the user's targets: an attack or creature targets (not an
  // area or self) are confirmed there
  const choosesCreatures = !used.target?.template?.type && (!!used.attack || !["", "self", undefined].includes(used.target?.affects?.type));
  if (offScene === "viewed" && choosesCreatures) usage.midiOptions.workflowOptions.targetConfirmation ??= "always";
  // Capture current targets before template placement can replace them
  // The player's targets as the use starts (a use told to ignore them has none from the player)
  const snapshotFromUser = usage.midiOptions.workflowOptions.preSelectedTargetUuids === undefined && !usage.midiOptions.ignoreUserTargets;
  usage.midiOptions.workflowOptions.preSelectedTargetUuids ??= (usage.midiOptions.ignoreUserTargets ? [] : Array.from(game.user?.targets ?? []))
    .map(t => t.document.uuid).filter((uuid): uuid is string => !!uuid);
  if (debugEnabled > 0) warn("MidiQOL | MidiActivity | use | Called", usage, dialog, message);
  let item = used.item.clone({}, { keepId: true });
  // @ts-expect-error no dnd5e-types
  let activity = item.system.activities.get(used.id) as MidiActivityMixin;
  let workflowClass = usage?.midi?.workflowClass ?? globalThis.MidiQOL.workflowClass;
  if (game.user?.isGM && checkRule("activeDefence")) {
    workflowClass = ActiveDefenceWorkflow;
  }
  if (!(workflowClass.prototype instanceof Workflow)) workflowClass = Workflow;
  const workflowOptions = { ...usage.midiOptions, ...(usage.midiOptions?.workflowOptions ?? {}), event: usage.event as AugmentedEvent | undefined };
  delete workflowOptions.workflowOptions;
  if (usage.workflow)
    usage.midiOptions.workflowOptions.autoRollAttack = true;
  if (!(usage.workflow instanceof TrapWorkflow)) {
    //TODO stupidly the constructor for TrapWorkflow is not compatible with the workflow constructor - will need to clean that up
    // Active Defence wins over saves before damage for an attack (user, 2026-11-19): the defence roll is the attack
    const activeDefence = workflowClass === ActiveDefenceWorkflow && !!activity.attack;
    if (configSettings.savesBeforeDamage && !activeDefence)
      usage.workflow = new SavesFirstWorkflow(activity.actor ?? null, activity, speakerFor({ actor: activity.item.actor }), null, { workflowOptions });
    else usage.workflow = new workflowClass(activity.actor ?? null, activity, speakerFor({ actor: activity.item.actor }), null, { workflowOptions });
  }
  Workflow.setUse(activity, usage.workflow!);
  usage.workflow!.sequenceId = usage.sequenceId;
  usage.workflow!.systemCard = message.systemCard;
  if ((activity.midiProperties?.rollMode ?? "default") !== "default") message.rollMode = toMessageMode(activity.midiProperties!.rollMode) as keyof CONFIG.Dice.RollModes;
  if (activity.midiProperties?.skipConcentrationCheck && used.actor &&
      activity.consumption.targets.some(t => t.target === "attributes.hp.value"))
    skipConcentrationActorUuids.add(used.actor.uuid);
  if (item.parent) await removeFlanking(item.parent);
  if (!usage.workflow) return stop(undefined);
  if (usage.midiOptions.isCritical) {
    usage.workflow.isCritical = true;
    usage.workflow.attackRollModifierTracker.addAttribution("CRIT", "activity.use", i18n("midi-qol.ActivityUse"));
  }
  if (usage.midiOptions.isFumble) {
    usage.workflow.isFumble = true;
    usage.workflow.attackRollModifierTracker.addAttribution("FUMBLE", "activity.use", i18n("midi-qol.ActivityUse"));
  }
  const autoCreateTemplate = activityHasAutoPlaceTemplate(activity);
  const emanationNoTemplate = activityHasEmanationNoTemplate(activity);
  const isTrapWorkflow = usage.workflow instanceof TrapWorkflow;
  if (autoCreateTemplate || emanationNoTemplate || isTrapWorkflow) {
    usage.create ??= {};
    usage.create.measuredTemplate = false;
  }

  foundry.utils.setProperty(message, "data.flags.midi-qol.messageType", "attack");
  if (usage.midiOptions?.configureDialog === false) dialog.configure = false;
  if (!await checkAutoConsume(activity, usage, dialog)) {
    if (used.midiProperties?.forceConsumeDialog === "always") dialog.configure = true;
    else if (used.midiProperties?.forceConsumeDialog === "never") dialog.configure = false;
  }
  const rollToggle = areMidiKeysPressed(usage.event as AugmentedEvent, "RollToggle");
  if (rollToggle && usage.workflow) {
    foundry.utils.setProperty(usage.workflow, "rollOptions.rollToggle", true);
    dialog.configure = !dialog.configure; // toggle the configure dialog
  }
  // Synthetic items can't be resolved by uuid, so the card keeps a snapshot to rebuild them from.
  // Not dnd5e's `item.data` flag: dnd5e 6 moves that into `system.deltas.deleted`, and a refund
  // recreates everything listed there on the actor.
  if (!activity.item._id || foundry.utils.getProperty(activity.item, `flags.${MODULE_ID}.syntheticItem`))
    foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.itemData`, activity.item.toObject());
  /*
   * Activity#use begins concentration, and ends the one it replaces, before midi's checks run,
   * so a use midi then cancels would cost the caster their existing concentration. Take the
   * player's choice from dnd5e's working copy of the config - after the dialog and dnd5e's own
   * concentration validation - and begin it once the use can no longer be backed out of
   * (Workflow#beginDeferredConcentration).
   * Transform-to-form links the new form to the concentration effect inside Activity#use, so
   * it is left to dnd5e.
   */
  const deferConcentration = activity.requiresConcentration
    && !safeGetGameSetting("dnd5e", "disableConcentration")
    && !(isActivityType(activity, "transform") && activity.transform?.mode === "form");
  // Stopped after the workflow was made: the caller's config is left without it, so a resubmitted config starts afresh
  const abandon = () => { clearAbandonedUse(usage); return stop(false); };
  if (!await preTargetingChecks(activity, usage, dialog, message)) return abandon();
  // A preTargeting macro or hook may have set the player's targets: the use takes them (user-targets plan stage 3,
  // C1). Safe now that automated uses never write the player's targets.
  if (snapshotFromUser && !memberCount(usage.midiOptions.targetsToUse)) retakeUserTargets(usage.workflow!, usage);
  // Save/clear targets BEFORE setupTargets changes game.user.targets for self-targeting
  const isSelfTarget = used.target?.affects?.type === "self"
    // @ts-expect-error item.type includes "tool" at runtime
    || (used.item.type === "tool" && !used.target?.affects?.type);
  // Self-targeting no longer writes the player's targets (M2 stage 7), so there is nothing to save and restore
  if (isSelfTarget) usage.workflow!.selfTargeted = true;
  if (!await setupTargets(activity, usage, dialog, message)) {
    ui.notifications?.warn(i18n("midi-qol.noTargets"));
    return abandon();
  }
  if (!await preChatChecks(activity, usage, dialog, message)) return abandon();
  // If midiOptions.spellLevel is provided, set the spell slot key so that
  // dnd5e's _prepareUsageScaling derives the correct scaling from it.
  if (usage.midiOptions?.spellLevel && activity.item?.type === "spell") {
    usage.spell ??= {} as { slot: string };
    usage.spell.slot = `spell${usage.midiOptions.spellLevel}`;
  }
  return { done: false, state: { usage, dialog, message, activity, deferConcentration } };
}

/** dnd5e's preUseActivity for used use (its workflow): the scaled activity dnd5e uses, and dnd5e's copy of the usage */

export function onUsePreUse(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): boolean {
  // Only activity use's: dnd5e's copy of `usage` keeps its workflow (deepClone keeps class instances). Another use of the
  // same activity running meanwhile has its own state.
  if (usageConfig.workflow !== state.usage.workflow) return true;
  state.dnd5eUsageConfig = usageConfig;
  state.usage.workflow!.activity = newActivity;
  Workflow.setUse(newActivity, state.usage.workflow!);
  return true;
}

/** dnd5e's activityConsumption for activity use: the activity consumption and the card run on, deferred concentration */
export function onUseConsumption(activity: MidiActivity, state: UseState, newActivity: Activity, usageConfig: ActivityUseConfiguration): void {
  if (usageConfig.workflow !== state.usage.workflow) return;
  state.usageData = usageConfig;
  usageConfig.workflow!.activity = newActivity;
  usageConfig.activity = newActivity;
  // Scaling (an upcast) rebuilds the item's activities: consumption and the card run on activity new object, so
  // Workflow.workflowFor needs it too (emanation placement, the early filing under the card, template flags)
  Workflow.setUse(newActivity, state.usage.workflow!);
  if (state.deferConcentration && usageConfig.concentration?.begin) {
    state.usage.workflow!.deferredConcentration = { scaling: usageConfig.scaling || undefined, end: usageConfig.concentration.end ?? undefined };
    usageConfig.concentration.begin = false;
  }
  // The player changed their targets while dnd5e's usage dialog was open: the use takes them, as valid targets (user-
  // targets plan stage 3, C2). Not an area (its template decides), self, or a use the player doesn't drive. This hook is
  // synchronous, so there is no confirmation from here.
  const workflow = state.usage.workflow!;
  if (state.dialog?.configure && workflow.showsTargetsToUser && !workflow.selfTargeted && !activityHasAreaTarget(newActivity)
    && !memberCount(state.usage.midiOptions?.targetsToUse) && canvas?.scene) {
    const now = validTargetTokens(new Set(game.user?.targets ?? []));
    if (!workflow.targets.equals(now)) {
      workflow.setTargets(now);
      retakeUserTargets(workflow, state.usage);
    }
  }
}

/**
 * midi's work after dnd5e's use (M10 stage 1): the card's workflow, the checks after the card, templates, undo data,
 * the reaction and bonus action markers, cast data, then the workflow's first step. Returns what use() returns.
 */
export async function finishUse(used: MidiActivity, state: UseState, useResults: any): Promise<unknown> {
  const { usage, dialog, message } = state;
  // Cleanup skipConcentrationCheck flag in case workflow was interrupted before concentration check
  if (used.actor) skipConcentrationActorUuids.delete(used.actor.uuid);
  if (!usage.workflow) return false;
  if (!useResults) { // activity use was aborted
    Workflow.removeWorkflow(usage.workflow?.id);
    clearAbandonedUse(usage, state.dnd5eUsageConfig);
    return false;
  }
  // A use's workflow is registered only once its card exists, under the card's uuid.
  // Force a few values to be added to the updates cache now we have the chat card.
  usage.workflow.itemCardUuid = useResults.message.uuid;
  usage.workflow.id = useResults.message.uuid ?? usage.workflow.id;
  usage.workflow.activity = usage.workflow.activity;
  usage.workflow.item = usage.workflow!.activity?.item;
  const activity: MidiActivity = usage.workflow!.activity!;
  Workflow.addWorkflow(usage.workflow);
  try {
    if (await postChatCardChecks(activity, usage, dialog, message) !== true) return;
    await setupCanSeeSense(activity, usage)
    // Process any templates placed (via the dialog's checkbox; an emanation is placed by the PlaceEmanation step)
    // processPlacedTemplates handles validation, cleanup if incomplete, and workflow integration
    const allTemplates = (useResults.templates ?? []).flat() as MeasuredTemplateDocument[];
    if (allTemplates.length > 0) {
      await usage.workflow.processPlacedTemplates(allTemplates, activity);
    }
    if (configSettings.undoWorkflow) await saveUndoData(usage.workflow);
  } catch (err) {
    // The card exists and the workflow waits for used use: stop it rather than leave it suspended
    TroubleShooter.recordError(err, `${used.item?.name} use`);
    error(`${used.item?.name} use failed`, err);
    ui.notifications?.error(i18nFormat("midi-qol.UseFailed", { item: used.item?.name ?? "", error: (err as Error)?.message ?? String(err) }));
    const concentration = usage.workflow.concentrationId ? used.actor?.effects.get(usage.workflow.concentrationId) : undefined;
    if (!usage.workflow.aborted) {
      usage.workflow.aborted = true;
      await usage.workflow.performState("midi-qol.Abort");
    }
    await concentration?.delete();
    return false;
  }

  usage.workflow.itemUseComplete = true;

  usage.workflow.id = useResults.message.uuid;
  if ((usage.workflow.itemUsesReaction || usage.midiOptions?.workflowOptions?.castUsesReaction) && used.actor && !hasUsedReaction(used.actor))
    await setReactionUsed(used.actor);
  if ((usage.workflow.itemUsesBonusAction || usage.midiOptions?.workflowOptions?.castUsesBonusAction) && used.actor && !hasUsedBonusAction(used.actor))
    await setBonusActionUsed(used.actor);
  const usageData = state.usageData;
  // @ts-expect-error no dnd5e-types
  if (activity.item?.type === "spell" || activity.item.flags?.dnd5e?.spellLevel) {
    usage.workflow.castData = {
      // @ts-expect-error no dnd5e-types
      baseLevel: activity.item.system.level ?? activity.item.flags?.dnd5e?.spellLevel?.base,
      // @ts-expect-error no dnd5e-types
      castLevel: activity.item.system.level !== undefined ? activity.item.system.level + (usageData?.scaling ?? 0) : activity.item.flags?.dnd5e?.spellLevel?.value,
      scaling: (usageData?.scaling ?? activity.item.flags?.dnd5e?.scaling) || 0,
      itemUuid: activity.item.uuid
    };
  }
  // Scaling is now handled by the workflow's activity getter (reads from chat card flags).
  await usage.workflow.performState("midi-qol.Start");
  return useResults;
}

/**
 * Check if used activity has consumption configured.
 * @returns true if used activity has consumption targets configured
 */

export function hasConsumption(activity: MidiActivity): boolean {
  return (activity.consumption?.targets?.length ?? 0) > 0;
}

/**
 * Determines whether activity activity should auto-consume resources without showing a dialog.
 * @param workflow - The workflow for getting auto-consume settings
 * @returns true if consumption should be automatic, false if a dialog should be shown
 */
export function shouldAutoConsume(activity: MidiActivity, workflow?: Workflow): boolean {
  const forceConsumeDialog = activity.midiProperties?.forceConsumeDialog ?? "default";

  // Check activity-level overrides first
  if (forceConsumeDialog === "always") {
    return false;
  }
  if (forceConsumeDialog === "never" || activity.midiProperties?.autoConsume) {
    return true;
  }

  // Use global setting
  const autoConsumeSetting = autoConsumeResource(workflow);
  // @ts-expect-error no dnd5e-types
  const isSpell = activity.item?.type === "spell";

  if (autoConsumeSetting === "none") {
    return false;
  }
  if (autoConsumeSetting === "spell" && !isSpell) {
    return false;
  }
  if (autoConsumeSetting === "item" && isSpell) {
    return false;
  }
  // "both" means auto-consume
  return true;
}

export async function checkAutoConsume(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig = {}): Promise<boolean> {
  if (dialog.configure === true) return false;
  if (!shouldAutoConsume(activity, usage.workflow)) return false;

  const consumption = activity._prepareUsageConfig(usage);
  const autoConsume = await activity._prepareUsageUpdates(consumption, { returnErrors: true });
  // If consumption would fail _prepareUsageUpdates will return an array of errors and on success an object of updates
  if ((autoConsume.length ?? 0) > 0) {
    dialog.configure = true;
    return true;
  }
  dialog.configure = false;

  if (activity.hasAreaTarget && activity.actor?.sheet) {
    setTimeout(() => {
      activity.actor?.sheet?.minimize();
    }, 100)
  }
  return true;
}

export async function setupCanSeeSense(activity: MidiActivity, usage: { workflow?: Workflow }) {
  const workflow = usage.workflow;
  if (!workflow) return;
  // Sight between canvas tokens: a target with no canvas token is neither seen nor sensed
  for (let target of workflow.targets.tokens) {
    // TODO: This is odd - if `!workflow.token` then `true`, but then we're adding `undefined` to `targetsCanSense`
    const tokenCanSense = workflow.token ? canSense(workflow.token, target, globalThis.MidiQOL.InvisibleDisadvantageVisionModes, { forceVision: true }) : true;
    const targetCanSense = workflow.token ? canSense(target, workflow.token, globalThis.MidiQOL.InvisibleDisadvantageVisionModes, { forceVision: true }) : false;
    if (targetCanSense) workflow.targetsCanSense.add(workflow.token!);
    else workflow.targetsCanSense.delete(workflow.token!);
    if (tokenCanSense) workflow.tokenCanSense.add(target);
    else workflow.tokenCanSense.delete(target);
    const tokenCanSee = workflow.token ? canSee(workflow.token, target, { forceVision: true }) : true;
    const targetCanSee = workflow.token ? canSee(target, workflow.token, { forceVision: true }) : false;
    if (targetCanSee) workflow.targetsCanSee.add(workflow.token!);
    else workflow.targetsCanSee.delete(workflow.token!);
    if (tokenCanSee) workflow.tokenCanSee.add(target);
    else workflow.tokenCanSee.delete(target);
  }

  // Blood Sense: treat wounded targets within bloodsense range as sensed/seen
  if (workflow.token?.actor) {
    const bloodsenseRange = Number(foundry.utils.getProperty(workflow.token.actor, `flags.${MODULE_ID}.bloodsense`) ?? 0);
    if (bloodsenseRange > 0) {
      for (const target of workflow.targets.tokens) {
        if (workflow.tokenCanSense.has(target) && workflow.tokenCanSee.has(target)) continue;
        const targetToken = getToken(target);
        if (!targetToken?.actor) continue;
        // @ts-expect-error no dnd5e-types
        const hp = targetToken.actor.system.attributes?.hp;
        if (!hp || hp.value >= hp.max) continue; // not wounded
        const distance = getDistance(workflow.token, targetToken, { wallsBlock: false });
        if (distance >= 0 && distance <= bloodsenseRange) {
          workflow.tokenCanSense.add(target);
          workflow.tokenCanSee.add(target);
        }
      }
    }
  }

}

export async function setupTargets(activity: MidiActivity, config: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean> {
  if (!config.workflow) {
    const errMessage = "MidiQOL | MidiActivity | setupTargets | No workflow found";
    error(errMessage);
    TroubleShooter.recordError(new Error("No workflow found"), errMessage);
    return false;
  }
  const workflow = config.workflow;
  const hasTargetsToUse = memberCount(config.midiOptions?.targetsToUse) > 0 && !activityHasAreaTarget(activity);
  const isSelfTargetActivity = activity.target?.affects?.type === "self";
  // The player's targets are the use's targets only where the player decides (confirmation) or the use took the
  // player's targets: an automated use (given its targets) and self-targeting leave them alone (M2 stage 7)
  let syncUserTargets = false;
  if (!isSelfTargetActivity && (requiresTargetConfirmation(activity, config.midiOptions ?? {})
    || configSettings.enforceSingleWeaponTarget)) {
    syncUserTargets = true;
    // The confirmation dialog shows the player's targets: the given ones, when the use was given some
    if (hasTargetsToUse) {
      const given = config.midiOptions!.targetsToUse!;
      const tokenIds = (given instanceof TokenDocumentSet ? given.documents : Array.from(given)).map(t => (t as Token | TokenDocument).id).filter((id): id is string => !!id);
      updateUserTargets(tokenIds);
    }
    if (!(await preTemplateTargets(activity, config.midiOptions ?? {})))
      return false;
    // Confirmation was shown: the user's final selection, keeping given targets with no canvas token (it can't show them)
    workflow.setTargets(validTargetTokens(hasTargetsToUse ? userTargetsKeepingUndrawn(config.midiOptions!.targetsToUse) : new Set(game.user?.targets)));
  } else if (hasTargetsToUse) {
    // No confirmation needed — set workflow targets directly from the provided Set
    // to avoid race conditions with game.user.targets being changed by concurrent effects.
    workflow.setTargets(validTargetTokens(config.midiOptions!.targetsToUse!));
    // Given its targets: later states keep them rather than re-reading the user's, which another use can change meanwhile.
    workflow.workflowOptions.ignoreUserTargets = true;
  } else {
    // No targetsToUse and no confirmation — use current user targets or self-target.
    let selfTarget = activity.target?.affects.type === "self";
    // @ts-expect-error no dnd5e-types
    if (activity.item.type === "tool" && !activity.target?.affects.type)
      selfTarget = true;
    if (!selfTarget) {
      // The use took the player's targets (unless told to ignore them)
      syncUserTargets = !config.midiOptions?.ignoreUserTargets;
      // Use the target snapshot captured at the start of use() (before any await points)
      // to avoid a race condition where concurrent workflows clear game.user.targets
      // via updateUserTargets([]) during async gaps.
      const snapshotUuids = config.midiOptions?.workflowOptions?.preSelectedTargetUuids;
      const ignoreUser = config.midiOptions?.ignoreUserTargets;
      const userTargets = snapshotUuids?.length ? new TokenDocumentSet(snapshotUuids) : ignoreUser ? new Set<Token.Implementation>() : new Set(game.user?.targets);
      workflow.setTargets(validTargetTokens(userTargets));
    } else {
      foundry.utils.setProperty(config, "midiOptions.workflowOptions.targetConfirmation", "none");
      let potentialTarget = getOrCreateTokenForActor(activity.actor);
      workflow.setTargets(new Set());
      if (potentialTarget) workflow.setTargets(workflow.targets.add(potentialTarget));
    }
  }
  // remove selection of un-targetable targets TODO
  if (canvas.scene && syncUserTargets) {
    const tokensIdsToUse: Array<string | null> = workflow.targets.tokens.filter(t => isValidTarget(t)).map(t => t.id);
    updateUserTargets(tokensIdsToUse);
  }
  return true;
}

export async function confirmTargets(activity: MidiActivity): Promise<void> {
}

export async function preTargetingChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
  const workflow = usage.workflow;
  const removeWorkflow = (workflow) => {
    return false;
  }
  if (!workflow) return false;
  let options: any = { none: false, checkAoO: true, checkReaction: true, checkBonusAction: true, checkAllowIncapacitated: false, callMacros: true, callHooks: true, checkTargets: true, checkComponents: true, checkUse: true }
  if (optionsConfig.none) options = optionsConfig;
  options = foundry.utils.mergeObject(options, optionsConfig, { insertKeys: true, overwrite: true });
  if (usage.midiOptions?.proceedChecks?.none) options = usage.midiOptions!.proceedChecks;
  options = foundry.utils.mergeObject(options, usage.midiOptions?.proceedChecks ?? {}, { insertKeys: true, overwrite: true });
  let cancelWorkflow: boolean | undefined;

  if (options.checkAllowIncapacitated && !usage.midiOptions?.workflowOptions?.allowIncapacitated && checkMechanic("incapacitated") !== "nothing") {
    const condition = checkIncapacitated(activity.actor, true, false);
    if (condition) {
      logIncapacitatedCheckResult(activity.actor?.name ?? "", condition, debugEnabled > 0, true);
      if (checkMechanic("incapacitated") === "enforce") return removeWorkflow(usage.workflow);
    }
  }

  if (options.callHooks) {
    cancelWorkflow = await callActivityHooks(activity, "midi-qol.preTargeting", { activity: activity, token: workflow.token, config: usage, dialog, message }) === false;
    cancelWorkflow ||= await callActivityHooks(activity, "midi-qol.preTargetingV2", { workflow, usage, dialog, message }) === false;
  }

  if (options.callMacros && configSettings.allowUseMacro) {
    const results = await workflow?.callMacros(activity.item, workflow?.onUseMacros?.getMacros("preTargeting"), "OnUse", "preTargeting", { usage, dialog, message });
    cancelWorkflow ||= results?.some(i => i === false) ?? false;
  }
  if (cancelWorkflow) return removeWorkflow(usage.workflow);
  return true;
}

export async function preChatChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
  const workflow = usage.workflow;
  const removeWorkflow = (workflow) => {
    return false;
  }
  if (!workflow) return false;
  let options: any = { none: false, checkReaction: true, checkBonusAction: true, checkAllowIncapacitated: false, callMacros: true, callHooks: true, checkTargets: true, checkComponents: true, checkUse: true }
  if (optionsConfig.none) options = optionsConfig;
  else
    options = foundry.utils.mergeObject(options, optionsConfig, { insertKeys: true, overwrite: true });
  if (usage.midiOptions?.proceedChecks?.none) options = usage.midiOptions.proceedChecks;
  else
    options = foundry.utils.mergeObject(options, usage.midiOptions?.proceedChecks ?? {}, { insertKeys: true, overwrite: true });

  if (options.callHooks) {
    let hookAbort = await callActivityHooks(activity, "midi-qol.preItemRoll", { activity: activity, token: workflow.token, config: usage, dialog, message }) === false;
    hookAbort ||= await callActivityHooks(activity, "midi-qol.preItemRollV2", { workflow, usage, dialog, message }) === false;
    if (hookAbort || workflow.aborted) {
      console.warn("midi-qol | attack roll blocked by preItemRoll hook");
      workflow.aborted = true;
      await workflow.performState("midi-qol.Abort")
      return removeWorkflow(workflow);
    }
  }

  if (options.callMacros && configSettings.allowUseMacro) {
    const results = await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll", { usage, dialog, message });
    if (workflow.aborted || results.some(i => i === false)) {
      console.warn("midi-qol | item roll blocked by preItemRoll macro");
      workflow.aborted = true;
      await workflow.performState("midi-qol.Abort")
      return removeWorkflow(workflow);
    }
  }

  if (options.checkUse && activity.useCondition && activity.effectiveActivationType !== "reaction") { // reactions condition evaluation is handled elsewhere
    if (!(await evalActivationCondition(workflow, activity.useCondition, workflow.targets.documents[0], { async: true }))) {
      const message = `${activity.useConditionReason} ${activity.actor?.name} unable to use ${activity.item.name}:${activity.name}`;
      if (!(usage.midiOptions?.noUseWarning || usage.midiOptions?.workflowOptions?.noUseWarning))
        ui.notifications?.warn(message);
      else
        console.warn(`midi-qol | preChatChecks | ${message} `);
      return removeWorkflow(workflow);
    }
  }

  // @ts-expect-error no dnd5e-types
  if (activity.isSpell || activity.item?.system.type?.value === "scroll") {
    const midiFlags = activity.actor?.flags[MODULE_ID];
    // @ts-expect-error no dnd5e-types
    const needsVerbal = activity.item.system.properties.has("vocal");
    // @ts-expect-error no dnd5e-types
    const needsSomatic = activity.item.system.properties.has("somatic");
    // @ts-expect-error no dnd5e-types
    const needsMaterial = activity.item.system.properties.has("material");
    //TODO Consider how to disable activity check for DamageOnly workflows and trap workflows
    const conditionData = createConditionData({ actor: activity.actor, activity: activity });
    const notSpell = await evalCondition(midiFlags?.fail?.spell?.all, conditionData, { errorReturn: false, async: true });
    if (notSpell) {
      ui.notifications?.warn("You are unable to cast the spell");
      return removeWorkflow(usage.workflow);
    }
    if (options.checkComponents) {
      let notVerbal = await evalCondition(midiFlags?.fail?.spell?.verbal, conditionData, { errorReturn: false, async: true });
      if (notVerbal && needsVerbal) {
        ui.notifications?.warn("You make no sound and the spell fails");
        return removeWorkflow(usage.workflow);
      }
      notVerbal = notVerbal || await evalCondition(midiFlags?.fail?.spell?.vocal, conditionData, { errorReturn: false, async: true });
      if (notVerbal && needsVerbal) {
        ui.notifications?.warn("You make no sound and the spell fails");
        return removeWorkflow(usage.workflow);
      }
      const notSomatic = await evalCondition(midiFlags?.fail?.spell?.somatic, conditionData, { errorReturn: false, async: true });
      if (notSomatic && needsSomatic) {
        ui.notifications?.warn("You can't make the gestures and the spell fails");
        return removeWorkflow(usage.workflow);
      }
      const notMaterial = await evalCondition(midiFlags?.fail?.spell?.material, conditionData, { errorReturn: false, async: true });
      if (notMaterial && needsMaterial) {
        ui.notifications?.warn("You can't use the material component and the spell fails");
        return removeWorkflow(usage.workflow);
      }
    }
  }
  workflow.AoO = false;
  workflow.itemUsesReaction = false;
  const reactingActor = activity.actor;
  const inReactionContext = !usage.midiOptions?.workflowOptions?.notReaction && !!reactingActor?.inCombat;
  // Classified unless the caller says otherwise; follows checkReaction when not given. An attack per target's
  // per-target uses check no reactions (the first use did) but classify every target.
  if (inReactionContext && reactingActor && (options.checkAoO ?? options.checkReaction)) {
    const isTurn = game.combat?.combatant === (reactingActor.id ? game.combat?.getCombatantsByActor(reactingActor.id) : undefined)?.[0];
    if (!isTurn && needsAOOCheck(reactingActor) && activity.attack && activity.effectiveActivationType !== "special")
      workflow.AoO = true;
  }
  if (inReactionContext && reactingActor && options.checkReaction) {
    if (["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(activity.effectiveActivationType ?? "")
      && (activity.activation?.cost ?? 1) > 0) {
      workflow.itemUsesReaction = true;
    }

    if (workflow.AoO) workflow.itemUsesReaction = true;

    const queryReaction = workflow.itemUsesReaction && (hasUsedReaction(reactingActor) || hasNoReactionsMarker(reactingActor)) && reactingActor.inCombat
      && needsReactionCheck(reactingActor)
    if (queryReaction) {
      const shouldRoll = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: "midi-qol.EnforceReactions.Title"
        },
        content: i18n("midi-qol.EnforceReactions.Content")
      });
      if (!shouldRoll) {
        await workflow.performState("midi-qol.Abort");
        return removeWorkflow(usage.workflow); // user aborted roll TODO should the workflow be deleted?
      }
    }
  }

  workflow.itemUsesBonusAction = false;
  // needsBonusActionCheck() is deliberately NOT part of activity condition: it is false for
  // "displayOnly", which would stop itemUsesBonusAction ever being set and so stop the used-
  // bonus-action marker being applied at all. setBonusActionUsed() already admits "displayOnly"
  // explicitly, and the reaction branch above gates the same way - only the prompt below is
  // conditional on needsBonusActionCheck.
  if (!usage.midiOptions?.workflowOptions?.notBonusAction && options.checkBonusAction && activity.actor?.inCombat) {
    workflow.itemUsesBonusAction = ["bonus"].includes(activity.effectiveActivationType ?? "");
    const queryBonus = workflow.itemUsesBonusAction && hasUsedBonusAction(activity.actor) && needsBonusActionCheck(activity.actor);
    if (queryBonus) {
      const shouldRoll = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: "midi-qol.EnforceBonusActions.Title"
        },
        content: i18n("midi-qol.EnforceBonusActions.Content")
      });
      if (!shouldRoll) {
        await workflow.performState("midi-qol.Abort"); // user aborted roll TODO should the workflow be deleted?
        return removeWorkflow(usage.workflow);
      }
    }
  }
  return true;
}

export async function postChatCardChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
  const workflow = usage.workflow;
  const removeWorkflow = async (workflow: Workflow) => {
    Workflow.removeWorkflow(workflow.id);
    const consumed = getConsumptionData(workflow.chatCard);
    if (!foundry.utils.isEmpty(consumed)) {
      await workflow.activity.refund(consumed);
    }
    await Workflow.deleteAbortedCard(workflow.chatCard);
    return false
  };
  if (debugEnabled > 0)
    warn("MidiQOL | postChatCardChecks | Called", activity);
  if (!workflow) return false;
  let options: any = { none: false, checkAoO: true, checkReaction: true, checkBonusAction: true, checkAllowIncapacitated: false, callMacros: true, callHooks: true, checkTargets: true, checkComponents: true, checkUse: true }
  if (optionsConfig.none) options = optionsConfig;
  else
    options = foundry.utils.mergeObject(options, optionsConfig, { insertKeys: true, overwrite: true });
  if (usage.midiOptions?.proceedChecks?.none) options = usage.midiOptions.proceedChecks;
  else
    options = foundry.utils.mergeObject(options, usage.midiOptions?.proceedChecks ?? {}, { insertKeys: true, overwrite: true });
  try {
    // Needs to be after chat card as requires targets

    let isEmanationTargeting = activityHasAutoPlaceTemplate(activity) || activityHasEmanationNoTemplate(activity);
    let isAoETargeting = !isEmanationTargeting && activityHasAreaTarget(activity);
    let selfTarget = activity.target?.affects.type === "self";
    const inCombat = activity.actor && isInCombat(activity.actor);
    const requiresTargets = configSettings.requiresTargets === "always"
      || (configSettings.requiresTargets === "tokens" && (canvas?.scene?.tokens.size ?? 0) > 0)
      || (configSettings.requiresTargets === "combat" && inCombat);
    let speaker = getSpeaker(activity.actor!);

    let shouldAllowRoll = !options.checkTargets || !requiresTargets // we don't care about targets
      || (workflow.targets.count > 0) // there are some target selected
      || (activity.target?.affects.type ?? "") === "" // no target required
      || selfTarget
      || isAoETargeting // area effect spell and we will auto target
      || isEmanationTargeting // range target and will autoTarget
      || (!activity.attack && !activity.hasDamage && !activity.hasSave); // does not do anything - need to check dynamic effects

    if (!shouldAllowRoll) {
      ui.notifications?.warn(i18n("midi-qol.noTargets"));
      return removeWorkflow(workflow);
    }

    // Determine allowed number of targets
    // Skip count enforcement for scaled target counts — deferred to WorkflowState_AoETargetConfirmation
    // where the user will have a chance to adjust targets after seeing the scaled count.
    let allowedTargets: number;
    const hasExplicitCount = activity.target?.affects?.count && activity.target.affects.count !== "";
    if (hasExplicitCount && !activityHasScaledTargetCount(activity)) {
      allowedTargets = Number(activity.target.affects.count);
    } else if (options.checkTargets && requiresTargets && shouldEnforceSingleTarget(activity)) {
      // Enforce single target for weapons when the setting is enabled
      allowedTargets = 1;
    } else {
      allowedTargets = Infinity;
    }

    // Check for no targets when creature-type targeting requires them
    const creatureTargetTypes = ["creature", "enemy", "ally", "willing"];
    if (options.checkTargets && requiresTargets && !isEmanationTargeting && !isAoETargeting
        && creatureTargetTypes.includes(activity.target?.affects?.type) && workflow.targets.count === 0) {
      ui.notifications?.warn(i18n("midi-qol.noTargets"));
      if (debugEnabled > 0) warn(`${game.user?.name} attempted to roll with no targets selected`);
      return removeWorkflow(workflow);
    }

    // Check for too many targets
    if (options.checkTargets && requiresTargets && workflow.targets.count > allowedTargets) {
      ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
      if (debugEnabled > 0) warn(`${game.user?.name} ${i18nFormat(`midi-qol.${MODULE_ID}.wrongNumberTargets`, { allowedTargets })}`);
      return removeWorkflow(workflow);
    }

    let tokenToUse: foundry.canvas.placeables.Token.Implementation | undefined;
    if (speaker.token) tokenToUse = canvas.tokens?.get(speaker.token);
    // Range, cover and sight are measured to the targets with a canvas token
    const rangeDetails = checkActivityRange(activity, tokenToUse, new Set(workflow.targets.tokens), checkMechanic("checkRange") !== "none" && !isAoETargeting && !workflow.AoO)
    if (checkMechanic("checkRange") !== "none" && !isAoETargeting && !isEmanationTargeting && !workflow.AoO && speaker.token) {
      if (tokenToUse && workflow.targets.tokens.length > 0) {
        if (rangeDetails.result === "fail")
          return removeWorkflow(workflow);
        else {
          tokenToUse = rangeDetails.attackingToken;
        }
      }
    }


    const targetsCreatures = !!activity.attack || !["", "self"].includes(activity.target?.affects?.type ?? "");
    if (!isAoETargeting && !isEmanationTargeting && targetsCreatures && !checkTotalCover(activity, tokenToUse, workflow.targets.tokens))
      return removeWorkflow(workflow);
    if (!isAoETargeting && !isEmanationTargeting && !checkTargetsSeen(activity, tokenToUse, workflow.targets.tokens))
      return removeWorkflow(workflow);

    if (!workflow) return false;
    workflow.token = tokenToUse;
    workflow.rangeDetails = rangeDetails;

    if (configSettings.undoWorkflow) await saveUndoData(workflow);

    // if showing a full card we don't want to auto roll attacks or damage.
    // Check if activity consumes ammunition
    const ammoConsumption = activity.consumption?.targets?.find(t => t.type === "ammo");
    if (ammoConsumption?.target) {
      workflow.ammunition = activity.actor?.items.get(ammoConsumption.target);
    }
    // Need concentration removal to complete before allowing workflow to continue so have workflow wait for item use to complete
  } catch (err) {
    const message = `postChatCardChecks error for ${activity.actor?.name} ${activity.name} ${activity.uuid}`;
    TroubleShooter.recordError(err, message);
    throw err;
  }
  return true;
}



// Region update deferred from placeEmanationTemplate, consumed by
// attachRegionActivityBehavior later in the same use flow (same activity clone)
export async function resolveAttachTokenId(activity: MidiActivity, workflow: Workflow | undefined, mode: "caster" | "target"): Promise<string | undefined> {
  if (mode === "caster") return (workflow?.token ?? getToken(activity.actor))?.document.id ?? undefined;
  const fromWorkflow = workflow?.targets.tokens ?? [];
  const targets = fromWorkflow.length > 0
    ? fromWorkflow
    : Array.from(game.user?.targets ?? []) as Token.Implementation[];
  if (targets.length === 0) {
    ui.notifications?.warn(i18n("midi-qol.REGION_BEHAVIOR.attachToken.noTarget"));
    return undefined;
  }
  if (targets.length === 1) return targets[0].document.id ?? undefined;
  return promptAttachTargetPicker(activity, targets);
}

export async function promptAttachTargetPicker(activity: MidiActivity, targets: Token.Implementation[]): Promise<string | undefined> {
  const optionsHtml = targets
    .map(t => `<option value="${t.document.id}">${foundry.utils.escapeHTML(t.document.name ?? t.name ?? t.id ?? "")}</option>`)
    .join("");
  const content = `
    <p>${i18n("midi-qol.REGION_BEHAVIOR.attachToken.pickerHint")}</p>
    <select name="attachTargetId" autofocus>${optionsHtml}</select>
  `;
  let selectedId: string | undefined;
  await foundry.applications.api.DialogV2.prompt<foundry.applications.api.DialogV2.PromptConfig>({
    window: { title: i18n("midi-qol.REGION_BEHAVIOR.attachToken.pickerTitle") },
    content,
    ok: {
      callback: (_evt, button) => {
        const form = button.form as HTMLFormElement | null;
        const select = form?.querySelector('select[name="attachTargetId"]') as HTMLSelectElement | null;
        const value = select?.value;
        if (value) selectedId = value;
      },
    },
    rejectClose: false,
  });
  return selectedId;
}

export async function placeEmanationTemplate(activity: MidiActivity, workflow: Workflow | undefined) {
  const autoCreateTemplate = activityHasAutoPlaceTemplate(activity);
  const actor = activity.item.parent;
  const tokenToUse = workflow?.token ?? getToken(actor);
  if (!tokenToUse) return;
  if (autoCreateTemplate) {
    const templateDocuments = await createActivityTemplateRegions(activity, [{
      ...tokenSourceCenter(tokenToUse), direction: 0, token: tokenToUse.document
    }], {
      actorUuid: actor?.uuid,
      tokenId: tokenToUse.id,
      itemUuid: activity.item?.uuid
    });

    if (templateDocuments && templateDocuments.length > 0) {
      const regionDoc = templateDocuments[0];
      const docToStore = regionDoc;
      await busyWait(10);

      if (regionDoc) {
        const regionUpdate: Record<string, any> = {};
        // Token attachment is resolved in attachRegionActivityBehavior, which runs
        // after template targeting so attachToken "target" sees the template targets.
        // Apply configured region visibility (default ALWAYS from compat shim)
        const rbConfig = activity.regionBehavior;
        if (rbConfig?.enabled && rbConfig.regionVisibility !== undefined) {
          regionUpdate.visibility = rbConfig.regionVisibility;
        }
        // Defer the GM round-trip: attachRegionActivityBehavior runs later in the
        // same use flow and will batch activity update with behavior creation into one
        // socket call.
        if (Object.keys(regionUpdate).length) {
          activity._pendingRegionUpdate = regionUpdate;
        }
      }

      if (workflow) {
        workflow.templateUuid = docToStore.uuid;
        if (getActivityAutoTargetAction(activity) !== "none") selectTargetsFromTemplates([docToStore.uuid]);
      } else selectTargetsFromTemplates([docToStore.uuid]);
      return templateDocuments;
    }
  }
}

/**
 * Attach a MidiRegionActivityBehaviorType to a RegionDocument.
 * If `regionBehavior.enabled` is set on activity activity, uses the stored config.
 * Otherwise falls back to auto-deriving from the overtime sibling activity.
 * @param regionDoc The Region to attach the behavior to
 * @param workflow The current workflow
 * @param overTimeActivity The activity with isOverTimeFlag (may differ from `activity` if `activity` is the Cast activity)
 * @param castLevel The spell level from the usage message (set by dnd5e's _prepareUsageScaling before _usageChatContext)
 */
export async function attachRegionActivityBehavior(activity: MidiActivity, regionDoc: RegionDocument.Implementation, workflow: Workflow, overTimeActivity: any, castLevel?: number) {
  const rbConfig = activity.regionBehavior;
  // Collect behaviors to attach and any region update; writeRegion() batches them
  // into a single GM round-trip (or runs locally if the user has permission).
  const behaviors: any[] = [];
  let regionUpdate: any | undefined;
  // A cast that rolls against the creatures in the area has dealt with those already inside.
  const castAffectsTargets = ["attack", "damage", "save"].some(type => isActivityType(activity, type)) && !!workflow?.targets?.count;
  // Effects applied while a token is inside are dnd5e's apply-effect behaviour; midi's own behaviour runs activities.
  const effectBehavior = (effectUuids: string[], dispositionFilter: number, excludeSource: boolean) => {
    if (!effectUuids.length) return;
    const { FRIENDLY, NEUTRAL, HOSTILE } = CONST.TOKEN_DISPOSITIONS;
    const casterDisposition = workflow?.token?.document?.disposition ?? activity.actor?.prototypeToken?.disposition ?? FRIENDLY;
    // midi's enemies are every disposition other than the caster's; allies are the caster's own.
    const dispositions = dispositionFilter === -1 ? [FRIENDLY, NEUTRAL, HOSTILE].filter(d => d !== casterDisposition)
      : dispositionFilter === 1 ? [casterDisposition] : [];
    behaviors.push({
      type: "dnd5e.applyActiveEffect",
      name: `${activity.item?.name ?? "Activity"} Region Effects`,
      system: { effects: [...new Set(effectUuids)], dispositions },
      flags: { [MODULE_ID]: { excludeSource } }
    });
  };

  // If explicitly configured on activity activity, use stored config
  // Convert portable IDs/identifiers from the activity schema to full UUIDs for the behavior type
  if (rbConfig?.enabled) {
    const resolvedRules: Array<{trigger: string, action: string, targetUuid: string}> = [];
    const effectUuids: string[] = [];
    const entryEffectIds = new Set((rbConfig.rules ?? []).filter(rule => rule.action === "applyEffect" && rule.trigger === "entry").map(rule => rule.targetId));
    for (const rule of rbConfig.rules ?? []) {
      if (rule.action === "useActivity") {
        // @ts-expect-error no dnd5e types for activities
        const act = activity.item?.system.activities?.find(
          (a: any) => (a.identifier || a.midiProperties?.identifier || a.id) === rule.targetId
        );
        if (act) resolvedRules.push({ trigger: rule.trigger, action: rule.action, targetUuid: act.uuid });
      } else if (rule.action === "applyEffect" || rule.action === "removeEffect") {
        const effect = activity.item?.effects.get(rule.targetId);
        if (!effect) continue;
        // Applied on entry (and removed on exit, implied) is dnd5e's behaviour; at any other moment the rule is midi's own
        if (rule.action === "applyEffect" && rule.trigger === "entry") effectUuids.push(effect.uuid);
        else if (!(rule.action === "removeEffect" && rule.trigger === "exit" && entryEffectIds.has(rule.targetId)))
          resolvedRules.push({ trigger: rule.trigger, action: rule.action, targetUuid: effect.uuid });
      }
    }
    effectBehavior(effectUuids, rbConfig.dispositionFilter ?? -1, rbConfig.excludeSource ?? true);

    if (resolvedRules.length) behaviors.push({
      type: `${MODULE_ID}.regionActivity` as const,
      name: `${activity.item?.name ?? "Activity"} Region Activity`,
      system: {
        sourceItemUuid: activity.item?.uuid ?? "",
        sourceActorUuid: activity.actor?.uuid ?? "",
        rules: resolvedRules,
        dispositionFilter: rbConfig.dispositionFilter ?? -1,
        castLevel: castLevel ?? workflow?.spellLevel ?? 0,
        excludeSource: rbConfig.excludeSource ?? true,
        oncePerTurn: rbConfig.oncePerTurn ?? true,
        activationEntry: !castAffectsTargets,
        wallRestriction: rbConfig.wallRestriction ?? "none",
        moveDistance: rbConfig.moveDistance ?? 0,
        moveDirection: rbConfig.moveDirection ?? "away",
        moveTiming: rbConfig.moveTiming ?? "start",
      },
    });

    // Set region restriction if a wall restriction type is selected
    if (rbConfig.wallRestriction && rbConfig.wallRestriction !== "none") {
      regionUpdate = { restriction: { enabled: true, type: rbConfig.wallRestriction, priority: 0 } };
    }
  } else if (overTimeActivity) {
    // Fallback: auto-derive from overtime activity (existing logic, kept for backward compat)
    const overTimeProps = overTimeActivity.overTimeProperties;
    const triggerTurnStart = overTimeProps?.turnChoice === "start";
    const triggerTurnEnd = overTimeProps?.turnChoice === "end";

    // Collect dontApply effect UUIDs from the item — these are entry/exit effects
    const effectUuids: string[] = [];
    for (const effect of activity.item?.effects ?? []) {
      if (!effect?.id) continue;
      if (effect.transfer) continue;
      if (!effect.flags?.dae?.dontApply) continue;
      effectUuids.push(effect.uuid);
    }

    const activityUuid = overTimeActivity.uuid ?? "";
    const rules: Array<{trigger: string, action: string, targetUuid: string}> = [];
    if (activityUuid) rules.push({ trigger: "entry", action: "useActivity", targetUuid: activityUuid });
    if (triggerTurnStart && activityUuid) rules.push({ trigger: "turnStart", action: "useActivity", targetUuid: activityUuid });
    if (triggerTurnEnd && activityUuid) rules.push({ trigger: "turnEnd", action: "useActivity", targetUuid: activityUuid });
    effectBehavior(effectUuids, -1, true);

    if (rules.length) behaviors.push({
      type: `${MODULE_ID}.regionActivity` as const,
      name: `${activity.item?.name ?? "Activity"} Region Activity`,
      system: {
        sourceItemUuid: activity.item?.uuid ?? "",
        sourceActorUuid: activity.actor?.uuid ?? "",
        rules,
        dispositionFilter: -1,
        castLevel: castLevel ?? workflow?.spellLevel ?? 0,
        excludeSource: true,
        oncePerTurn: true,
        activationEntry: !castAffectsTargets,
      },
    });
  }

  // Attach light behavior if configured on activity activity
  const lightConfig = activity.regionLight;
  if (lightConfig?.enabled && (lightConfig.dim > 0 || lightConfig.bright > 0)) {
    behaviors.push({
      type: `${MODULE_ID}.regionLight` as const,
      name: `${activity.item?.name ?? "Activity"} Region Light`,
      system: {
        dim: lightConfig.dim ?? 0,
        bright: lightConfig.bright ?? 0,
        color: lightConfig.color || null,
        alpha: lightConfig.alpha ?? 0.5,
        luminosity: lightConfig.luminosity ?? 0.5,
        animationType: lightConfig.animationType || null,
        animationSpeed: lightConfig.animationSpeed ?? 5,
        animationIntensity: lightConfig.animationIntensity ?? 5,
      },
    });
  }

  // Merge in any update deferred from placeEmanationTemplate (attachment / visibility)
  const pendingUpdate = activity._pendingRegionUpdate;
  if (pendingUpdate) {
    regionUpdate = { ...pendingUpdate, ...(regionUpdate ?? {}) };
    delete activity._pendingRegionUpdate;
  }

  // Resolve token attachment for all template types. "default" preserves the
  // pre-attachToken behavior: auto-placed emanations follow the caster, all other
  // templates are stationary. Attachment configures the region itself, so it
  // applies regardless of regionBehavior.enabled (which only gates the behavior rules).
  const attachMode = activity.regionBehavior?.attachToken ?? "default";
  const effectiveAttachMode = attachMode === "default"
    ? (activityHasAutoPlaceTemplate(activity) ? "caster" : undefined)
    : attachMode;
  if ((effectiveAttachMode === "caster" || effectiveAttachMode === "target")
      && !activity.target?.template?.stationary
      && !(regionUpdate?.attachment)) {
    const attachId = await resolveAttachTokenId(activity, workflow, effectiveAttachMode);
    if (attachId) {
      regionUpdate = { ...(regionUpdate ?? {}), attachment: { token: attachId } };
      // An emanation is measured from its base, so seat it on the token it now follows, as core's attach does.
      const token = regionDoc.parent?.tokens.get(attachId)?._source;
      const shapes = regionDoc._source.shapes as (typeof regionDoc._source.shapes[number] | EmanationShapeData)[];
      if (token && shapes.some(s => s.type === "emanation")) {
        regionUpdate.shapes = shapes.map(s => (s.type === "emanation" && s.base?.type === "token")
          ? { ...s, base: { ...s.base, x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape } }
          : s);
      }
    }
  }

  await writeRegion(regionDoc, { update: regionUpdate, behaviors });
}

/** midi's additions to the usage context; not named `_usageChatContext`, which would keep dnd5e's legacy content path. */
export function midiUsageContext(activity: MidiActivity, message) {
  const workflow = Workflow.workflowFor(activity);
  let systemCard = message.systemCard ?? false;
  const minimalCard = false;

  // An emanation is placed once the card exists, by the PlaceEmanation step (M14 D1)
  if (debugEnabled > 0) warn("show item card ", activity, activity.actor, activity.actor?.token, systemCard, workflow);
  let needAttackButton = !getRemoveAttackButtons(activity) || configSettings.mergeCardMulti
    || configSettings.confirmAttackDamage !== "none" ||
    !(workflow?.someAutoRollEventKeySet() && !getAutoRollAttack(workflow));
  const needDamageButton = (activity.hasDamage || activity.hasHealing) && (
    (["none", "saveOnly"].includes(getAutoRollDamage(workflow)) || workflow?.rollOptions.rollToggle)
    || configSettings.confirmAttackDamage !== "none"
    || !getRemoveDamageButtons(activity)
    || systemCard
    || configSettings.mergeCardMulti);
  // not used const sceneId = token?.scene && token.scene.id || canvas.scene?.id;
  const isPlayerOwned = activity.item.actor?.hasPlayerOwner;
  const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
    || !configSettings.itemTypeList?.includes(activity.item.type);
  // Are there any potential effects to apply
  // Read without waiting (the card's creation hook is synchronous): a compendium effect not loaded is its index entry,
  // counted as an effect to apply
  const effects = workflow?.workflowType === "BaseWorkflow"
    ? ((activity.effects ?? []) as (ActivityEffectData & { uuid?: string, _id?: string })[]).map(profile => profile.uuid
      ? fromUuidSync(profile.uuid, { strict: false }) as ActiveEffect.Implementation | null
      : activity.item.effects.get(profile._id ?? "")) : [];
  let hasEffects = effects.some(effect => effect && !effect.transfer && !effect.flags?.dae?.dontApply);
  // if target type is not blank or there are targets only set hasEffects if we are not going to remove the button later
  if (activity.target?.affects.type !== "" || workflow?.targets.count !== 0)
    hasEffects &&= !["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects);
  let dmgBtnText = (activity.actionType === "heal") ? i18n(HEALING_BUTTON_KEY) : i18n("DND5E.Damage");
  if (workflow?.workflowOptions?.fastForwardDamage && configSettings.showFastForward) dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;

  const midiContextData: MidiUsageChatContext = {
    labels: activity.labels,
    //@ ts-expect-error TODO needed for abilities translation
    // config: game.system.config,
    condensed: configSettings.mergeCardCondensed && !!activity.attack,
    hasAttack: !!activity.attack && !minimalCard && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
    // @ts-expect-error no dnd5e-types
    isHealing: !minimalCard && activity.item.isHealing && (systemCard || configSettings.autoRollDamage !== "always"),
    hasDamage: needDamageButton,
    configSettings,
    hideItemDetails,
    dmgBtnText,
    hasEffects,
    effects: activity.item.effects,
    isMerge: true,
    mergeCardMulti: configSettings.mergeCardMulti && !!(activity.attack || activity.hasDamage),
    confirmAttackDamage: configSettings.confirmAttackDamage !== "none" && !!(activity.attack || activity.hasDamage),
    RequiredMaterials: i18n("DND5E.RequiredMaterials"),
    Attack: i18n("DND5E.Attack"),
    OtherFormula: i18n("DND5E.OtherFormula"),
    displayProperties: configSettings.displayProperties,
    canCancel: configSettings.undoWorkflow, // TODO enable activity when more testing done.
  };
  // Attack and Utility had their own versions (M14): an attack card always has its attack, a utility card its formula
  if (activity.type === "attack") midiContextData.hasAttack = !!activity.attack;
  if (activity.type === "utility") midiContextData.hasRollFormula = true;
  // dnd5e 6 draws the card from its data (MidiUsageMessageData), so only these decisions are kept
  return midiContextData;
}


