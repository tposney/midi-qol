import { heldKeys } from "../lib/rollKeys.js";
import { TokenSet } from "../lib/tokenSet.js";
import { Activity, ActivityEffectData, ActivityUseConfiguration, RollDialogConfig, DND5ETargetDescriptor, RollMessageConfig, RollProcessConfig, MidiUsageChatContext, Dnd5eSystem, EmanationShapeData } from "../../globals.js";
import { GameSystemConfig, MODULE_ID, debugEnabled, error, i18n, i18nFormat, warn, busyWait, specialDurationChoices } from "../../midi-qol.js";
import { socketlibSocket, timedAwaitExecuteAsGM } from "../GMAction.js";
import { ActiveDefenceWorkflow, AugmentedEvent, TrapWorkflow, Workflow, SavesFirstWorkflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { midiButtonVisibility } from "../ChatClasses/UsageCardMessage.js";
import { ConditionEditor } from "../apps/ConditionEditor.js";
import { followUpTargetModes, runFollowUp } from "../followUps.js";
import { RegionBehaviorEditor } from "../apps/RegionBehaviorEditor.js";
import { averageDice, skipConcentrationActorUuids } from "../patching.js"
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
import {
  activityHasAreaTarget,
  callActivityHooks,
  canSee,
  canSense,
  checkActivityRange,
  checkTargetsSeen,
  checkTotalCover,
  checkIncapacitated,
  createConditionData,
  displayDSNForRoll,
  evalActivationCondition,
  evalCondition,
  getAutoRollAttack,
  getAutoRollDamage,
  getDistance,
  getRemoveAttackButtons,
  getRemoveDamageButtons,
  getSpeaker,
  getToken,
  activityHasAutoPlaceTemplate,
  hasUsedBonusAction,
  hasUsedReaction,
  autoConsumeResource,
  isInCombat,
  logIncapacitatedCheckResult,
  needsBonusActionCheck,
  needsReactionCheck,
  setBonusActionUsed,
  setReactionUsed,
  sumRolls,
  getOrCreateTokenForActor,
  validTargetTokens,
  activityHasEmanationNoTemplate,
  getActivityAutoTargetAction,
  areMidiKeysPressed,
  getActor,
  setRangedTargets,
  updateUserTargets,
  isValidTarget,
  needsAOOCheck,
  addRollTo,
  pushTargetSave,
  popTargetSave,
  clearTargetSave,
  getConsumptionData,
  toMessageMode,
  rollModeToMessageMode,
  tokenSourceCenter,
} from "../utils.js";
import { activityHasScaledTargetCount, attachTokenOptions, templateOriginOptions, createActivityTemplateRegions, preTemplateTargets, removeFlanking, requiresTargetConfirmation, selectTargetsFromTemplates, setDamageRollMinTerms, shouldEnforceSingleTarget } from "./activityHelpers.js";

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

/** Each use's workflow, keyed by dnd5e's copy of the activity for that use (it runs the rest of `use`). */
const useWorkflows = new WeakMap<object, Workflow>();

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

/** Clears a cancelled use's state, so a resubmitted config starts afresh. */
function clearAbandonedUse(...configs: (ActivityUseConfiguration | undefined)[]) {
  for (const config of configs) {
    if (!config) continue;
    delete config.workflow;
    delete config.midiOptions?.workflowOptions?.preSelectedTargetUuids;
  }
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

/** Whether saves are rolled from the card's buttons rather than by midi. */
function savesRolledFromChat(): boolean {
  const rollSaveOptions = new Set([configSettings.rollNPCLinkedSaves, configSettings.rollNPCSaves, configSettings.playerRollSaves]);
  return rollSaveOptions.has("none") || rollSaveOptions.has("chat") || configSettings.autoCheckSaves === "none";
}

export let MidiActivityMixin = Base => {
  interface MidiActivityMixin extends Activity { };
  class MidiActivityMixin extends Base {
    get workflow() {
      warn("MidiActivityMixin | activity.workflow is deprecated. activities no long store workflow references");
      return Workflow.getWorkflowByActivityUuid(this.uuid);
    }
    set workflow(value) {
      error("MidiActivityMixin | activity.workflow = is deprecated. activities no long store workflow references"); ``
    }

    /** The effective activation type for this activity. Overridden by MidiCastActivity to resolve from the linked spell. */
    get effectiveActivationType(): string | undefined {
      return this.activation?.type;
    }

    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.SHARED"];

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, SetField, NumberField, ColorField } = foundry.data.fields;
      const schema = {
        ...super.defineSchema(),
        // flags: new ObjectField(),
        useConditionText: new MidiConditionField({ name: "useCondition", initial: "" }),
        useConditionReason: new StringField({ name: "useConditionReason", initial: "" }),
        effectConditionText: new MidiConditionField({ name: "effectCondition", initial: "" }),
        // null means never set, so imported items follow configSettings.defaultOtherActivity
        otherActivityId: new StringField({ name: "otherActivity", initial: null, nullable: true }),
        // disabled pending a way to make it work 
        // useSystemActivity: new BooleanField({ name: "useSystemActivity", initial: false }),
        macroData: new SchemaField({
          name: new StringField({ name: "name", initial: "" }),
          command: new StringField({ name: "command", initial: "" }),
        }),
        ignoreTraits: new SchemaField({
          idi: new BooleanField({ name: "idi", initial: false }),
          idr: new BooleanField({ name: "idr", initial: false }),
          idv: new BooleanField({ name: "idv", initial: false }),
          ida: new BooleanField({ name: "ida", initial: false }),
          idm: new BooleanField({ name: "idm", initial: false })
        }),
        midiProperties: new SchemaField({
          ignoreTraits: new SetField(new StringField(), { initial: [] }),
          triggeredActivityId: new StringField({ name: "triggeredActivity", initial: "none", required: true, blank: false }),
          //@ts-expect-error
          triggeredActivityConditionText: new MidiConditionField({ name: "triggeredActivityCondition", initial: "" }),
          triggeredActivityTargets: new StringField({ name: "triggeredActivityTargets", initial: "targets", required: true, blank: false }),
          triggeredActivityRollAs: new StringField({ name: "triggeredActivityRollAs", initial: "self" }),
          triggeredActivityConsume: new BooleanField({ name: "triggeredActivityConsume", initial: true }),
          triggeredActivityConfigure: new BooleanField({ name: "triggeredActivityConfigure", initial: true }),
          // Offered as a button on the card when another of the item's activities hits (followUps.ts).
          followUp: new BooleanField({ name: "followUp", initial: false }),
          followUpTargets: new StringField({ name: "followUpTargets", initial: "default", required: true, blank: false,
            choices: Object.fromEntries(followUpTargetModes.map(mode => [mode, mode === "default" ? "midi-qol.FollowUp.Targets.default" : `midi-qol.TriggeredActivityTargetOptions.${mode}`])) }),
          //@ts-expect-error
          followUpCondition: new MidiConditionField({ name: "followUpCondition", initial: "" }),
          autoConsume: new BooleanField({ name: "autoConsume", initial: false }),
          forceConsumeDialog: new StringField({ name: "forceConsumeDialog", initial: "default" }),
          forceRollDialog: new StringField({ name: "forceRollDialog", initial: "default" }),
          forceDamageDialog: new StringField({ name: "forceDamageDialog", initial: "default" }),
          confirmTargets: new StringField({ name: "confirmTargets", initial: "default", required: true, blank: false }),
          autoTargetType: new StringField({ name: "autoTargetType", initial: "any", required: true, blank: false }),
          autoTargetAction: new StringField({ name: "autoTargetAction", initial: "default" }),
          automationOnly: new BooleanField({ name: "automationOnly", initial: false }),
          otherActivityCompatible: new BooleanField({ name: "otherActivityCompatible", initial: true }),
          otherActivityAsParentType: new BooleanField({ name: "otherActivityAsParentType", initial: true, required: false }),
          identifier: new StringField({ name: "identifier", initial: "", required: false }),
          displayActivityName: new BooleanField({ name: "displayActivityName", initial: false }),
          rollMode: new StringField({ name: "rollMode", initial: "default", required: true, blank: false }),
          chooseEffects: new BooleanField({ name: "chooseEffects", initial: false }),
          toggleEffect: new BooleanField({ name: "toggleEffect", initial: false }),
          ignoreFullCover: new BooleanField({ name: "ignoreFullCover", initial: false }),
          targetMustBeSeen: new BooleanField({ name: "targetMustBeSeen", initial: false }),
          removeChatButtons: new StringField({ name: "removeChatButtons", initial: "default", blank: false, required: true }),
          magicEffect: new BooleanField({ name: "magicEffect", initial: false }),
          magicDamage: new BooleanField({ name: "magicDamage", initial: false }),
          noConcentrationCheck: new BooleanField({ name: "noConcentrationCheck", initial: false }),
          skipConcentrationCheck: new BooleanField({ name: "skipConcentrationCheck", initial: false }),
          autoCEEffects: new StringField({ name: "autoCEEffects", initial: "default", blank: false, required: true }),
          // Conditions applied to the targets as the condition itself (as the token HUD does), with the activity's
          // effects: on a failed save, or always with onSave. specialDuration adds to the status's own.
          statuses: new ArrayField(new SchemaField({
            id: new StringField({ initial: "" }),
            specialDuration: new ArrayField(new StringField()),
            onSave: new BooleanField({ initial: false })
          }), { initial: [] }),
        }),
        isOverTimeFlag: new BooleanField({ name: "isOverTimeFlag", initial: false }),
        overTimeProperties: new SchemaField({
          turnChoice: new StringField({ blank: false, choices: ["start", "end"], default: "start" }),
          saveRemoves: new BooleanField({ initial: true }),
          rollAs: new StringField({ blank: false, choices: ["target", "source"], initial: "target" }),
          //@ts-expect-error find out why there is a type error here
          preRemoveConditionText: new MidiConditionField({ name: "removeCondition", initial: "" }),
          //@ts-expect-error find out why there is a type error here
          postRemoveConditionText: new MidiConditionField({ name: "postRemoveCondition", initial: "" }),
        }),
        regionBehavior: new SchemaField({
          enabled: new BooleanField({ initial: false }),
          dispositionFilter: new NumberField({ initial: -1, choices: { [-1]: "Enemies", [0]: "All", [1]: "Allies" } }),
          excludeSource: new BooleanField({ initial: true }),
          oncePerTurn: new BooleanField({ initial: true }),
          // @ts-expect-error fvtt-types missing EDGE_RESTRICTION_TYPES (v14 regions use EDGE not WALL)
          wallRestriction: new StringField({ initial: "none", choices: ["none", ...CONST.EDGE_RESTRICTION_TYPES] }),
          regionVisibility: new NumberField({ initial: CONST.REGION_VISIBILITY.ALWAYS, choices: Object.values(CONST.REGION_VISIBILITY) }),
          // "default" leaves the region stationary. "caster" attaches it to the caster's token;
          // "target" attaches it to a chosen target (prompts if multiple targets are selected).
          attachToken: new StringField({ initial: "default", choices: ["default", "caster", "target"] }),
          // Moves the region each turn of the caster: away from it, or in a direction its owner chooses.
          moveDistance: new NumberField({ initial: 0, min: 0 }),
          moveDirection: new StringField({ initial: "away", choices: ["away", "choose"] }),
          moveTiming: new StringField({ initial: "start", choices: ["start", "end"] }),
          // The caster's height a template is measured from; "default" follows the Template Origin Height setting.
          templateOrigin: new StringField({ initial: "default", required: true, blank: false, choices: ["default", "base", "top", "eye"] }),
          rules: new ArrayField(new SchemaField({
            trigger: new StringField({ required: true, blank: false, initial: "entry" }),
            action: new StringField({ required: true, blank: false, initial: "useActivity" }),
            targetId: new StringField({ required: true, blank: false, initial: "" }),
          }), { initial: [] }),
        }),
        regionLight: new SchemaField({
          enabled: new BooleanField({ initial: false }),
          dim: new NumberField({ initial: 0, min: 0 }),
          bright: new NumberField({ initial: 0, min: 0 }),
          color: new ColorField({ initial: null, nullable: true }),
          alpha: new NumberField({ initial: 0.5, min: 0, max: 1 }),
          luminosity: new NumberField({ initial: 0.5, min: 0, max: 1 }),
          animationType: new StringField({ initial: "", nullable: true }),
          animationSpeed: new NumberField({ initial: 5, min: 0, max: 10 }),
          animationIntensity: new NumberField({ initial: 5, min: 1, max: 10 }),
        }),
      };
      return schema;
    }

    /**
     * @type {boolean}
     * @memberof MidiActivityMixin
     * @readonly
     * @returns {boolean}
     * @description Is this activity suitable as an other activity. It must be a possible other activity (default false) and the otherActivityCompatible flag must be set to true
     */
    /** midi wraps this activity, so using it runs a midi workflow. */
    get isMidiActivity(): boolean {
      return true;
    }

    get isOtherActivityCompatible() {
      if (!this.possibleOtherActivity) return false;
      return this.midiProperties!.otherActivityCompatible;
    }

    /**
     * @type {boolean}
     * @memberof MidiActivityMixin
     * @readonly
     * @returns {boolean}
     * @description Is this activity suitable as a triggerable activity. Default is true and must be overridden in the subclass
     * Examples of non triggerable activities are the Enchant activity
     */
    get isTriggerableActivity() {
      return true;
    }

    /**
     * @type {boolean}
     * @memberof MidiActivityMixin
     * @readonly
     * @returns {boolean}
     * @description Is this activity only triggerable by the actor that owns it. 
     * Default is false and must be overridden in the subclass
     * Examples of self triggerOnly are the Cast and Forward activities
     */
    get isSelfTriggerableOnly() {
      return false;
    }

    get forcedTargetConfirmation(): string | undefined {
      /*
       * A self-target activity can never confirm targets: requiresTargetConfirmation returns false
       * on affects.type === "self" before it ever reaches confirmTargets. Reporting that here makes
       * the sheet show the effective value rather than a stored one that does nothing — the same
       * treatment ForwardActivity and CastActivity already give themselves.
       */
      if (this.target?.affects?.type === "self") return "never";
      return undefined;
    }
    /**
     * @type {boolean}
     * @memberof MidiActivityMixin
     * @readonly
     * @returns {boolean}
     * @description Is this activity a candidate to be used as an "other" activity. Default is false and must be overridden in the subclass
     */
    get possibleOtherActivity() {
      return false;
    }


    get canUse() {
      // if (this.midiProperties?.automationOnly) return false;
      return super.canUse;
    }

    get validProperties() {
      return new Set(["idi", "idr", "idv", "ida"]);
    }

    get macro() {
      return new Macro({ name: this.macroData.name || this.name, command: this.macroData.command, img: this.img, type: "script" });
    }
    set macro(macro: Macro) {
      //@ts-expect-error
      return this.update({ macroData: { name: macro.name, command: macro.command } });
    }
    async getTriggeredActivity() {
      // @ts-expect-error no dnd5e-types
      let activity = this.item.system.activities.find(a => a.id === this.midiProperties?.triggeredActivityId);
      // @ts-expect-error no dnd5e-types
      if (!activity) activity = this.item.system.activities.find(a => a.identifier === this.midiProperties?.triggeredActivityId);
      if (!activity) activity = await fromUuid(this.midiProperties?.triggeredActivityId);
      return activity as MidiActivityMixin | undefined;
    }

    static metadata = foundry.utils.mergeObject(
      super.metadata, {
      usage: {
        dialog: MidiActivityUsageDialog,
        actions: {
          placeTemplate: MidiActivityMixin.#placeTemplate,
          rollDamage: MidiActivityMixin.#rollDamage,
          rollDamageNoCritical: MidiActivityMixin.#rollDamageNoCritical,
          rollDamageCritical: MidiActivityMixin.#rollDamageCritical,
          confirmDamageRollCancel: MidiActivityMixin.#confirmDamageRollCancel,
          confirmDamageRollComplete: MidiActivityMixin.#confirmDamageRollComplete,
          confirmDamageRollCompleteHit: MidiActivityMixin.#confirmDamageRollCompleteHit,
          confirmDamageRollCompleteMiss: MidiActivityMixin.#confirmDamageRollCompleteMiss,
          midiApplyEffects: MidiActivityMixin.#applyEffects,
          midiFollowUp: MidiActivityMixin.#followUp,
          refundOtherActivity: MidiActivityMixin.#refundOtherActivity,
          consumeOtherActivity: MidiActivityMixin.#consumeOtherActivity,
        }
      },
    }, { inplace: false, insertValues: true, insertKeys: true });

    // Only where the activity has no handler of its own: save and check activities keep theirs.
    static {
      this.metadata = foundry.utils.mergeObject(this.metadata, {
        usage: { actions: { rollSave: MidiActivityMixin.#rollOtherSave, rollCheck: MidiActivityMixin.#rollOtherSave } }
      }, { inplace: false, overwrite: false });
    }

    /** The activity supplying this one's other save or check: its own other activity's, else its ammunition's. */
    get otherSaveSource(): MidiActivityMixin | undefined {
      return [this.otherActivity, this.ammunitionActivity]
        .find(activity => activity && activity !== this && (activity.save || activity.check));
    }

    /** A save or check button for another activity's save, on this activity's card: that activity rolls it. */
    static async #rollOtherSave(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.findWorkflow(message.uuid);
      const source = workflow?.otherSaveActivity ?? this.otherSaveSource;
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

    static async #followUp(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const index = Number(target.dataset.followUp);
      if (Number.isInteger(index)) await runFollowUp(message, index);
    }
    static async #applyEffects(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.findWorkflow(message.uuid);
      if (workflow) workflow.activity = this;
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
        await socketlibSocket.executeAsUser("applyEffects", authorId, {
          workflowId: message.uuid,
          targets: Array.from(game.user?.targets).map(t => t.document.uuid)
        });
      } else {
        workflow.forceApplyEffects = true; // don't overwrite the application targets
        workflow.effectTargets = new TokenSet(game.user?.targets);
        if (workflow.effectTargets.size > 0) await workflow.performState(workflow.WorkflowState_ApplyDynamicEffects)
      }
    }
    static async #confirmDamageRollCancel(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
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
        await socketlibSocket.executeAsUser("cancelWorkflow", authorId, { workflowId, itemCardUuid: message.uuid }).then(result => {
          if (typeof result === "string") ui.notifications?.warn(result);
        });
      } else {
        await Workflow.removeItemCardButtons(message.uuid, { removeAllButtons: true });
      }
    }

    static async #confirmDamageRollComplete(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      await this.doConfirmation("confirmDamageRollComplete", event, target, message);
    }
    static async #confirmDamageRollCompleteHit(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      await this.doConfirmation("confirmDamageRollCompleteHit", event, target, message);
    }
    static async #confirmDamageRollCompleteMiss(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      await this.doConfirmation("confirmDamageRollCompleteMiss", event, target, message);
    }
    async doConfirmation(actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      if (!game.user?.isGM && configSettings.confirmAttackDamage === "gmOnly") {
        return;
      }
      if (message.author?.active) {
        const result = await socketlibSocket.executeAsUser(actionToCall, message.author.id, { workflowId: message.uuid, activityUuid: this.uuid, itemCardUuid: message.uuid });
        if (typeof result === "string") ui.notifications?.warn(result);
      } else {
        await Workflow.removeItemCardButtons(message.uuid, { removeConfirmButtons: true });
      }
    }

    static async #refundOtherActivity(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      // Get the other activity from the associated activity on the message
      //@ts-expect-error no dnd5e types
      const activity = message.getAssociatedActivity?.() as MidiActivityMixin | undefined;
      const otherActivity = activity?.otherActivity;
      if (!otherActivity) return;

      // Get the consumed data from the chat message flag (mirrors dnd5e structure)
      const consumed = message.getFlag(MODULE_ID, "use.consumed");
      if (!consumed || foundry.utils.isEmpty(consumed)) return;

      // Call dnd5e's refund method
      await otherActivity.refund(consumed);

      // Remove the consumed flag - button visibility is handled by shouldHideChatButton
      await message.unsetFlag(MODULE_ID, "use.consumed");
    }

    static async #consumeOtherActivity(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      // Get the other activity from the associated activity on the message
      //@ts-expect-error no dnd5e types
      const activity = message.getAssociatedActivity?.() as MidiActivityMixin | undefined;
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

      // Set the consumed flag - button visibility is handled by shouldHideChatButton
      if (consumed) {
        await message.setFlag(MODULE_ID, "use.consumed", consumed);
      }
    }

    /**
     * Handle the "Place Template" button click from the chat card.
     * Places all templates sequentially and delegates to workflow for validation and processing.
     */
    static async #placeTemplate(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
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

    static #rollDamage(this: Activity, event, target, message) {
      const workflow = Workflow.forDamageButton(message);
      if (workflow === false) return;
      if (workflow && !workflow.readOnly) workflow.activity = this;
      return this.rollDamage({ event, workflow, midiOptions: { isCritical: workflow?.workflowOptions?.isCritical || workflow?.isCritical } }, {}, message);
    }

    static #rollDamageNoCritical(this: Activity, event, target, message) {
      const workflow = Workflow.forDamageButton(message);
      if (workflow === false) return;
      if (workflow && !workflow.readOnly) workflow.activity = this;
      return this.rollDamage({ event, workflow, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
    }

    static #rollDamageCritical(this: Activity, event, target, message) {
      const workflow = Workflow.forDamageButton(message);
      if (workflow === false) return;
      if (workflow && !workflow.readOnly) workflow.activity = this;
      return this.rollDamage({ event, workflow, critical: { allow: true }, midiOptions: { isCritical: true } }, {}, message);
    }

    get identifier() {
      if (this.midiProperties?.identifier) return this.midiProperties.identifier;
      return this.name.slugify();
    }

    _preCreate(data) {
      super._preCreate(data);
      if (!("otherActivityId" in data)) {
        this.updateSource({ otherActivityId: "none" });
      }
    }

    prepareData() {
      //@ts-expect-error
      if (!this.midiProperties.identifier && !this.name) this.midiProperties.identifier = i18n(this.constructor.metadata.dnd5eTitle).slugify();
      super.prepareData();
    }

    async _onChatAction(event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      // dnd5e's #onChatAction already provides a scaled `this` — no need to clone here.
      const existingItem = this.workflow?.item ?? this.item;
      // @ts-expect-error no dnd5e-types
      const activity = this.workflow?.activity ?? existingItem.system.activities.get(this.id);
      const action = target.dataset.action ?? "";
      let handler = activity?.metadata.usage?.actions?.[action];
      const workflow = Workflow.findWorkflow(message.uuid);
      if (!handler && workflow) {
        if (activity) handler = activity?.metadata.usage?.actions?.[action];
      }
      if (handler) await handler.call(activity, event, target, message);
    }

    async useAs(actor: Actor.Implementation | null | undefined, usage: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      // itemData._id = this.item._id;
      actor = getActor(usage.midiOptions?.rollAs);
      if (usage.midiOptions?.rollAs) delete usage.midiOptions.rollAs;
      if (!actor || actor === this.actor || this.isSelfTriggerableOnly) return this.use(usage, dialog, message);
      const itemData = this.item.toObject();
      // @ts-expect-error
      delete itemData._id;
      foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.syntheticItem`, true);
      let item = new CONFIG.Item.documentClass(itemData, { parent: actor });
      item.prepareData();
      //@ts-expect-error no dnd5e-types
      item.prepareFinalAttributes(); // Since actor prepareData is not being called need to do this here
      // @ts-expect-error no dnd5e-types
      const activity = item.system.activities.get(this.id);
      return activity.use(usage, dialog, message);
    }

    async use(usage: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      if (usage.midiOptions?.rollAs) return this.useAs(usage.midiOptions.rollAs, usage, dialog, message);
      if (!this.item.isEmbedded) return;
      if (!this.item.isOwner) {
        ui.notifications?.error("DND5E.DocumentUseWarn", { localize: true });
        return;
      }
      if (!this.canUse) {
        ui.notifications?.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
        return;
      }
      let preUseActivityHookId: number | undefined;
      // dnd5e's copy of `usage`, which midi annotates.
      let dnd5eUsageConfig: ActivityUseConfiguration | undefined;
      let activityConsumptionHookId: number | undefined;
      try {
        // Copies: a caller may reuse one options object across uses, and this snapshot belongs to this use alone.
        usage.midiOptions = { ...usage.midiOptions };
        usage.midiOptions.workflowOptions = { ...usage.midiOptions.workflowOptions };
        // Capture current targets before template placement can replace them
        usage.midiOptions.workflowOptions.preSelectedTargetUuids ??= Array.from(game.user?.targets ?? []).map(t => t.document.uuid);
        if (debugEnabled > 0) warn("MidiQOL | MidiActivity | use | Called", usage, dialog, message);
        let item = this.item.clone({}, { keepId: true });
        // @ts-expect-error no dnd5e-types
        let activity = item.system.activities.get(this.id) as MidiActivityMixin;
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
          if (configSettings.savesBeforeDamage)
          usage.workflow = new SavesFirstWorkflow(activity.actor ?? null, activity, ChatMessage.getSpeaker({ actor: activity.item.actor }), null, { workflowOptions });
          else usage.workflow = new workflowClass(activity.actor ?? null, activity, ChatMessage.getSpeaker({ actor: activity.item.actor }), null, { workflowOptions });
        }
        usage.workflow!.sequenceId = usage.sequenceId;
        usage.workflow!.systemCard = message.systemCard;
        if ((activity.midiProperties?.rollMode ?? "default") !== "default") message.rollMode = toMessageMode(activity.midiProperties!.rollMode) as keyof CONFIG.Dice.RollModes;
        if (activity.midiProperties?.skipConcentrationCheck && this.actor &&
            activity.consumption.targets.some(t => t.target === "attributes.hp.value"))
          skipConcentrationActorUuids.add(this.actor.uuid);
        if (item.parent) await removeFlanking(item.parent);
        // config.midiOptions.workflowOptions.targetConfirmation ??= this.forcedTargetConfirmation;
        if (!usage.workflow) return undefined;
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
        if (!await activity.checkAutoConsume(usage, dialog)) {
          if (this.midiProperties?.forceConsumeDialog === "always") dialog.configure = true;
          else if (this.midiProperties?.forceConsumeDialog === "never") dialog.configure = false;
        }
        const rollToggle = areMidiKeysPressed(usage.event as AugmentedEvent, "RollToggle");
        if (rollToggle && usage.workflow) {
          foundry.utils.setProperty(usage.workflow, "rollOptions.rollToggle", true);
          dialog.configure = !dialog.configure; // toggle the configure dialog
        }
        // if (rollToggle) dialog.configure = !dialog.configure; Should this always be looked at
        // Synthetic items can't be resolved by uuid, so the card keeps a snapshot to rebuild them from.
        // Not dnd5e's `item.data` flag: dnd5e 6 moves that into `system.deltas.deleted`, and a refund
        // recreates everything listed there on the actor.
        if (!activity.item._id || foundry.utils.getProperty(activity.item, `flags.${MODULE_ID}.syntheticItem`))
          foundry.utils.setProperty(message, `data.flags.${MODULE_ID}.itemData`, activity.item.toObject());

        let useResults: any;
        preUseActivityHookId = Hooks.on("dnd5e.preUseActivity", (newActivity, usageConfig) => {
          if (usage.workflow!.activity?.uuid !== newActivity.uuid) return true;
          dnd5eUsageConfig = usageConfig;
          // Not sure if required but set the workflow in the super.usageConfig.
          usageConfig.workflow = usage.workflow;
          // newActivity will be the scaled activity to use that instead of what we have
          usage.workflow!.activity = newActivity;
          useWorkflows.set(newActivity, usage.workflow!);
          return true;
        });
        let usageData: ActivityUseConfiguration | undefined;
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
          && !(activity.type === "transform" && activity.transform?.mode === "form");
        activityConsumptionHookId = Hooks.on("dnd5e.activityConsumption", (newActivity, usageConfig, messageConfig) => {
          if (usage.workflow!.activity?.uuid !== newActivity.uuid) return;
          usageData = usageConfig;
          usageConfig.workflow!.activity = newActivity;
          usageConfig.activity = newActivity;
          if (deferConcentration && usageConfig.concentration?.begin) {
            usage.workflow!.deferredConcentration = { scaling: usageConfig.scaling || undefined, end: usageConfig.concentration.end ?? undefined };
            usageConfig.concentration.begin = false;
          }
        });

        if (!await activity.preTargetingChecks(usage, dialog, message)) return false;
        // Save/clear targets BEFORE setupTargets changes game.user.targets for self-targeting
        const isSelfTarget = this.target?.affects?.type === "self"
          // @ts-expect-error item.type includes "tool" at runtime
          || (this.item.type === "tool" && !this.target?.affects?.type);
        if (isSelfTarget) {
          pushTargetSave();
          usage.workflow!.selfTargeted = true;
        } else {
          clearTargetSave();
        }
        if (!await activity.setupTargets(usage, dialog, message)) {
          if (isSelfTarget) { popTargetSave(); usage.workflow!.selfTargeted = false; }
          ui.notifications?.warn(i18n("midi-qol.noTargets"));
          return false;
        }
        if (!await activity.preChatChecks(usage, dialog, message)) {
          if (isSelfTarget) { popTargetSave(); usage.workflow!.selfTargeted = false; }
          return false;
        }
        // If midiOptions.spellLevel is provided, set the spell slot key so that
        // dnd5e's _prepareUsageScaling derives the correct scaling from it.
        // @ts-expect-error item.type includes "spell" at runtime
        if (usage.midiOptions?.spellLevel && activity.item?.type === "spell") {
          usage.spell ??= {} as { slot: string };
          usage.spell.slot = `spell${usage.midiOptions.spellLevel}`;
        }
        try {
          useResults = await super.use.bind(activity)(usage, dialog, message);
        } catch (err) {
          error("MidiQOL | MidiActivity | use | Error in super.use", err);
          TroubleShooter.recordError(err, "Error in super.use");
          Workflow.removeWorkflow(usage.workflow?.id);
          clearAbandonedUse(usage, dnd5eUsageConfig);
          return false;
        } finally {
          // The rest of use() can outlive the workflow, and these match by activity uuid, so a
          // following use of the same activity would otherwise be handled by this use's hooks.
          if (preUseActivityHookId) Hooks.off("dnd5e.preUseActivity", preUseActivityHookId);
          if (activityConsumptionHookId) Hooks.off("dnd5e.activityConsumption", activityConsumptionHookId);
          preUseActivityHookId = activityConsumptionHookId = undefined;
        }
        // Cleanup skipConcentrationCheck flag in case workflow was interrupted before concentration check
        if (this.actor) skipConcentrationActorUuids.delete(this.actor.uuid);
        if (!useResults) { // activity use was aborted
          Workflow.removeWorkflow(usage.workflow?.id);
          clearAbandonedUse(usage, dnd5eUsageConfig);
          return false;
        }
        // A use's workflow is registered only once its card exists, under the card's uuid.
        // Force a few values to be added to the updates cache now we have the chat card.
        usage.workflow.itemCardUuid = useResults.message.uuid;
        usage.workflow.id = useResults.message.uuid ?? usage.workflow.id;
        usage.workflow.activity = usage.workflow.activity;
        usage.workflow.item = usage.workflow!.activity?.item;
        activity = usage.workflow!.activity! as MidiActivityMixin;
        Workflow.addWorkflow(usage.workflow);
        if (await activity.postChatCardChecks(usage, dialog, message) !== true) return;
        await activity.setupCanSeeSense(usage)
        // if (autoCreateTemplate || emanationNoTemplate) if (!await activity.setupTargets(usage, dialog, message)) return;
        if (activity.templates) { // TODO find a better place to store this
          useResults.templates = activity.templates;
          delete activity.templates;
        }
        // Process any templates placed (via dialog checkbox or emanation auto-placement)
        // processPlacedTemplates handles validation, cleanup if incomplete, and workflow integration
        const allTemplates = (useResults.templates ?? []).flat() as MeasuredTemplateDocument[];
        if (allTemplates.length > 0) {
          await usage.workflow.processPlacedTemplates(allTemplates, activity);
        }
        if (configSettings.undoWorkflow) await saveUndoData(usage.workflow);

        usage.workflow.itemUseComplete = true;

        usage.workflow.id = useResults.message.uuid;
        if ((usage.workflow.itemUsesReaction || usage.midiOptions?.workflowOptions?.castUsesReaction) && this.actor && !hasUsedReaction(this.actor))
          await setReactionUsed(this.actor);
        if ((usage.workflow.itemUsesBonusAction || usage.midiOptions?.workflowOptions?.castUsesBonusAction) && this.actor && !hasUsedBonusAction(this.actor))
          await setBonusActionUsed(this.actor);
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
        await usage.workflow.performState((usage.workflow as Workflow).WorkflowState_Start);
        return useResults;
      } finally {
        if (preUseActivityHookId) Hooks.off("dnd5e.preUseActivity", preUseActivityHookId);
        if (activityConsumptionHookId) Hooks.off("dnd5e.activityConsumption", activityConsumptionHookId);
      }
    }

    /**
     * Check if this activity has consumption configured.
     * @returns true if this activity has consumption targets configured
     */
    hasConsumption(): boolean {
      return (this.consumption?.targets?.length ?? 0) > 0;
    }

    /**
     * Determines whether this activity should auto-consume resources without showing a dialog.
     * @param workflow - The workflow for getting auto-consume settings
     * @returns true if consumption should be automatic, false if a dialog should be shown
     */
    shouldAutoConsume(workflow?: Workflow): boolean {
      const forceConsumeDialog = this.midiProperties?.forceConsumeDialog ?? "default";

      // Check activity-level overrides first
      if (forceConsumeDialog === "always") {
        return false;
      }
      if (forceConsumeDialog === "never" || this.midiProperties?.autoConsume) {
        return true;
      }

      // Use global setting
      const autoConsumeSetting = autoConsumeResource(workflow);
      // @ts-expect-error no dnd5e-types
      const isSpell = this.item?.type === "spell";

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

    async checkAutoConsume(usage: ActivityUseConfiguration, dialog: RollDialogConfig = {}): Promise<boolean> {
      if (dialog.configure === true) return false;
      if (!this.shouldAutoConsume(usage.workflow)) return false;

      const consumption = this._prepareUsageConfig(usage);
      const autoConsume = await this._prepareUsageUpdates(consumption, { returnErrors: true });
      // If consumption would fail _prepareUsageUpdates will return an array of errors and on success an object of updates
      if ((autoConsume.length ?? 0) > 0) {
        dialog.configure = true;
        return true;
      }
      dialog.configure = false;

      if (this.hasAreaTarget && this.actor?.sheet) {
        setTimeout(() => {
          this.actor?.sheet?.minimize();
        }, 100)
      }
      return true;
    }

    async rollDamage(config: RollProcessConfig, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      const workflow = config?.workflow;
      if (!workflow) return this._midiRollDamage(config, dialog, message);
      return workflow.whileExecuting(() => this._midiRollDamage(config, dialog, message));
    }

    async _midiRollDamage(config: RollProcessConfig, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      // TODO decide what this should mean
      if (!config?.workflow) {
        return super.rollDamage(config, dialog, message);
      }
      if (config.workflow.currentAction === config.workflow.WorkflowState_Abort) return this.use(config, dialog, {});
      // Damage again for a completed use: a damage roll of its own, as dnd5e's
      if (config.workflow.readOnly || config.workflow.currentAction === config.workflow.WorkflowState_Completed)
        return Workflow.rerollDamage(config.workflow, this, config, dialog, message);
      // TODO: This is odd. `midiOptions` should have `workflowOptions` _in_ it, not be assigned it
      config.midiOptions ??= config.workflow.workflowOptions ?? {};
      if (debugEnabled > 0) {
        warn("MidiActivity | rollDamage | Called", config, dialog, message);
      }
      let result: Roll[] | undefined;
      let otherResult: Roll[] | undefined;
      let preRollDamageHookId: number | undefined;
      let rollDamageHookId: number | undefined;
      try {
        if (await callActivityHooks(this, "midi-qol.preDamageRoll", config.workflow, this, config, dialog, message) === false) {
          console.warn("midi-qol | Damage roll blocked via pre-hook");
          return;
        }
        if (configSettings.allowUseMacro) {
          const results = await config.workflow.callMacros(this.item, config.workflow.onUseMacros?.getMacros("preDamageRollConfig"), "OnUse", "preDamageRollConfig", { config, dialog, message });
          const cancelWorkflow = results?.some(i => i === false) ?? false;
          if (cancelWorkflow) {
            console.warn("midi-qol | Damage roll blocked by preDamageRollConfig onUseMacro");
            return;
          }
        }
        const held = heldKeys(config.event);
        const keys = { normal: held.normal || held.disadvantage, critical: held.advantage };

        config.midiOptions!.isCritical ??= config.workflow.workflowOptions?.isCritical || config.workflow.isCritical;
        config.isCritical ??= config.midiOptions!.isCritical;
        config.midiOptions!.fastForwardDamage ??= config.workflow.workflowOptions?.fastForwardDamage;
        if (this.hasDamage || this.hasHealing) {
          if (Object.values(keys).some(k => k)) dialog.configure = this.midiProperties?.forceDamageDialog !== "never";
          else if (dialog.configure === undefined) {
            switch (this.midiProperties?.forceDamageDialog) {
              case "always":
                dialog.configure = true;
                break;
              case "never":
                dialog.configure = false;
                break;
              default:
                dialog.configure = !(config.midiOptions?.fastForwardDamage ?? config.workflow?.workflowOptions.fastForwardDamage ?? false);
            }
          }
          if (config.workflow && areMidiKeysPressed(config.event, "RollToggle")) config.workflow.rollOptions.rollToggle = !config.workflow.rollOptions.rollToggle;
          //@ts-expect-error no dnd5e-types
          if (this.item.isVersatile && areMidiKeysPressed(config.event ?? config.workflow.rollOptions.event, "Versatile")) {
            config.workflow.attackMode = "twoHanded";
          }
          if (config.workflow.rollOptions?.rollToggle) dialog.configure = !dialog.configure;
          // If the activity damage has any choice force configuration dialog
          // if (dialog.configure) config.midiOptions.isCritical = false;
          preRollDamageHookId = Hooks.once("dnd5e.preRollDamage", (rollConfig, dialogConfig, messageConfig) => {
            const targetDescriptors = foundry.utils.getProperty(messageConfig, "data.system.targets") as Array<DND5ETargetDescriptor>;
            // since saves might have been rolled merge the target descriptors
            if (targetDescriptors && config.workflow) {
              config.workflow.targetDescriptors ??= [];
              for (let targetDetails of targetDescriptors) {
                const existing = config.workflow.targetDescriptors.find(td => td.actor === targetDetails.actor);
                if (existing) {
                  Object.assign(existing, foundry.utils.mergeObject(existing, targetDetails));
                } else {
                  config.workflow.targetDescriptors.push(targetDetails);
                }
              }
            }
            if (keys.critical) rollConfig.isCritical = true;
            else if (keys.normal) rollConfig.isCritical = false;
            else if (!dialogConfig.configure) rollConfig.isCritical ||= rollConfig.midiOptions?.isCritical;
            if (this.damage?.parts.some(part => part.types.size > 1)) dialogConfig.configure = true;
            ///@ts-expect-error no dnd5e-types
            else if ((rollConfig.ammunition?.system.damage.base?.types.size ?? 0) > 1) dialogConfig.configure = true;
            else if ((this.healing?.types?.size ?? 0) > 1) dialogConfig.configure = true;
            if (dialogConfig.configure) {
              dialogConfig.options ??= {};
              if (rollConfig.isCritical || rollConfig.midiOptions?.isCritical) {
                dialogConfig.options.defaultButton = "critical";
              } else dialogConfig.options.defaultButton = "normal";
            } return true;

          });
          rollDamageHookId = Hooks.once("dnd5e.rollDamage", rolls => {
            if (rolls[0] && config.workflow && config.midiOptions?.updateWorkflow !== false) 
              //@ts-expect-error no dnd5e-types
              config.workflow.isCritical = rolls[0].options.isCritical;
          });
          message.create ??= false;
          result = config.workflow ? await config.workflow.keepRollMessageFlags(this, () => super.rollDamage(config, dialog, message))
            : await super.rollDamage(config, dialog, message);
          if (!result) { // user backed out of roll 
            config.workflow.currentAction = config.workflow.WorkflowState_WaitForDamageRoll;
            // config.workflow.suspend();
            return;
          }
          if (result) result = await this.postProcessDamageRoll(config, result);
          if (config.workflow && config.midiOptions?.updateWorkflow !== false) await config.workflow.setDamageRolls(result);
        }
        // Ammunition counts here too: it is no longer resolved as otherActivity, and rollOtherDamage
        // sources from it when the item has no other activity of its own.
        if ((this.otherActivity ?? this.ammunitionActivity) && config.workflow.otherActivity !== this
          && config.midiOptions?.updateWorkflow !== false) {
          // Check if we need to defer rolling until after consumption is confirmed
          if (!this.deferOtherDamage(config, dialog)) {
            otherResult = await this.rollOtherDamage(config, dialog);
          }
        }
        if (config.midiOptions?.updateWorkflow !== false) {
          // If neither the activity nor the other activity produced damage rolls,
          // we still need to advance the workflow past WaitForDamageRoll.
          // Use noDamage flag to indicate no damage was available to roll
          // (as opposed to the user cancelling the roll).
          const noDamage = !result?.[0] && !otherResult?.[0] && !(this.hasDamage || this.hasHealing);
          config.workflow.resume(result?.[0] || otherResult?.[0] ? "damageRolled" : noDamage ? "noDamage" : undefined);
        }
      } catch (err) {
        const message = "doDamageRoll error";
        TroubleShooter.recordError(err, message);
        error(message, err);
        // The workflow waits for this roll: stop it rather than leave it suspended.
        if (config.workflow && config.midiOptions?.updateWorkflow !== false && !config.workflow.aborted) {
          ui.notifications?.error(i18nFormat("midi-qol.DamageRollFailed", { item: this.item?.name ?? "", error: (err as Error)?.message ?? String(err) }));
          config.workflow.aborted = true;
          await config.workflow.performState(config.workflow.WorkflowState_Abort);
        }
      } finally {
        if (preRollDamageHookId) Hooks.off("dnd5e.preRollDamage", preRollDamageHookId);
        if (rollDamageHookId) Hooks.off("dnd5e.rollDamage", rollDamageHookId);
      }
      return result ?? [];
    }

    /**
     * Check if other activity damage should be deferred until after consumption is confirmed.
     * If deferral is needed, stores the config and dialog for later rolling.
     * Only defers if we're actually checking hits or saves - otherwise consume immediately.
     * @param config - The roll process configuration
     * @param dialog - The roll dialog configuration
     * @returns true if damage was deferred, false if it should be rolled immediately
     */
    deferOtherDamage(config: RollProcessConfig, dialog: RollDialogConfig): boolean {
      if (!this.otherActivity || !config.workflow) return false;

      if (!this.otherActivity.hasConsumption()) return false;

      // Only defer if we're checking hits or saves - otherwise consume immediately
      const checkingHits = this.attack && configSettings.autoCheckHit !== "none";
      const checkingSaves = (this.otherActivity.save || this.otherActivity.check) && configSettings.autoCheckSaves !== "none";

      if (!checkingHits && !checkingSaves) {
        // Not checking hits or saves - consume immediately, don't defer
        return false;
      }

      // Store info needed to roll other activity damage later
      // No need to deep clone config - rollOtherDamage clones it before modification
      // Shallow clone dialog since rollOtherDamage may mutate dialog.configure
      config.workflow.otherDamageConfig = config;
      config.workflow.otherDamageDialog = { ...dialog };
      return true; // Deferred - don't roll now
    }

    /**
     * Roll the other damage: the item's own other activity and the loaded ammunition's activity
     * both roll. Ammunition is resolved separately from otherActivity, and SRD ammunition such as
     * Arrow of Slaying carries its damage on an activity of its own.
     * @returns The other damage rolls, or undefined if none were rolled
     */
    async rollOtherDamage(
      config: RollProcessConfig,
      dialog: RollDialogConfig
    ): Promise<Roll[] | undefined> {
      const workflow = config.workflow;
      if (!workflow) return undefined;
      // Build the other activity's and the ammunition's target matches (no-op if already built)
      await workflow.buildOtherDamageMatches();
      // A source whose condition matched no target is not rolled.
      const sources = [this.otherActivity, this.ammunitionActivity].filter((activity, index, all) =>
        !!activity && all.indexOf(activity) === index
        && !!(activity.hasDamage || activity.hasHealing || activity.roll?.formula)
        && (activity === this.ammunitionActivity
          ? !activity.useCondition || !!workflow.ammunitionDamageMatches?.size
          : !this.otherCondition || !!workflow.otherDamageMatches?.size)) as MidiActivityMixin[];
      if (!sources.length) return undefined;

      const otherConfig = {
        ...config,
        midiOptions: {
          ...config.midiOptions,
          fastForward: config.midiOptions?.fastForwardDamage,
          updateWorkflow: false, // rollFormula will try and restart the workflow
          addOptionalBonuses: false // don't apply optional bonus flags to other activity damage
        }
      };

      // Undo the roll toggle since rollFormula will look at it as well
      if (sources[0].ac && workflow.rollOptions?.rollToggle) {
        dialog.configure = !dialog.configure;
      }

      const otherResult: Roll[] = [];
      for (const source of sources) {
        otherResult.push(...(await this._rollOtherDamageSource(source, source === this.ammunitionActivity, otherConfig, dialog, config) ?? []));
      }
      if (!otherResult.length) return undefined;

      // Update workflow with other damage rolls
      if (config.midiOptions?.updateWorkflow !== false) {
        await workflow.setOtherDamageRolls(otherResult);
      }
      return otherResult;
    }

    /** Roll one source of other damage. */
    async _rollOtherDamageSource(
      source: MidiActivityMixin,
      isAmmunition: boolean,
      otherConfig: RollProcessConfig,
      dialog: RollDialogConfig,
      config: RollProcessConfig
    ): Promise<Roll[] | undefined> {
      let otherActivity = source;
      // Scaling of the item's own other activity, stored on the chat card by checkOtherActivityConsumption
      const scaling = isAmmunition ? undefined : config.workflow?.chatCard?.getFlag(MODULE_ID, "use.otherScaling");
      if (scaling) {
        const item = otherActivity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });
        // @ts-expect-error no dnd5e-types
        otherActivity = item.system.activities.get(otherActivity.id);
      }

      /*
       * Ammunition base damage is dnd5e's to add, not ours: AttackActivity#getDamageConfig has
       * already spliced `ammo.system.damage.base` into the weapon's damage rolls, and a consumable
       * of type "ammo" reports offersBaseDamage === true. An activity on the ammunition with
       * damage.includeBase left at its schema default would pull the same base damage in twice.
       */
      // @ts-expect-error no dnd5e-types
      if (isAmmunition && otherActivity?.damage?.includeBase) {
        const item = otherActivity.item.clone(
          { [`system.activities.${otherActivity.id}.damage.includeBase`]: false }, { keepId: true });
        // @ts-expect-error no dnd5e-types
        otherActivity = item.system.activities.get(otherActivity.id);
      }

      let rolls: Roll[] | undefined;
      if (otherActivity?.hasDamage) {
        rolls = await otherActivity.rollDamage(otherConfig, dialog, { create: false }) as Roll[] | undefined;
      } else if (otherActivity?.roll?.formula) {
        rolls = await otherActivity.rollFormula!(otherConfig, dialog, { create: false }) as Roll[] | undefined;
        if (rolls) {
          if (!(rolls instanceof Array)) rolls = [rolls];
          rolls = rolls.map(roll => new (game.system as Dnd5eSystem).dice.DamageRoll(roll.formula, {}, {}));
        }
      }

      // Apply parent activity type to damage properties if configured
      if (rolls && this.otherActivityAsParentType) {
        rolls.forEach(r => {
          const properties = new Set(r.options.properties ?? []);
          properties.delete(source.actionType);
          properties.add(this.actionType);
          r.options.properties = Array.from(properties);
        });
      }
      // The ammunition's damage applies by its own condition and save (Workflow#otherDamageFor).
      if (rolls && isAmmunition) rolls.forEach(r => foundry.utils.setProperty(r, `options.${MODULE_ID}.ammunition`, true));
      return rolls;
    }

    configureDamageRoll(config: RollProcessConfig): void {
      try {
        let workflow = config.workflow;
        if (!workflow) return void config;

        if (workflow.workflowType === "TrapWorkflow") workflow.rollOptions.fastForward = true;

        if (workflow.currentAction !== workflow.WorkflowState_WaitForDamageRoll && workflow.noAutoAttack) {
          // TODO NW check this allow damage roll to go ahead if it's an ordinary roll
          workflow.currentAction = workflow.WorkflowState_WaitForDamageRoll;
        }

        if (workflow.currentAction !== workflow.WorkflowState_WaitForDamageRoll) {
          if (workflow.currentAction === workflow.WorkflowState_AwaitTemplate)
            return ui.notifications?.warn(i18n("midi-qol.noTemplateSeen")) as void;
          else if (workflow.currentAction === workflow.WorkflowState_WaitForAttackRoll)
            return ui.notifications?.warn(i18n("midi-qol.noAttackRoll")) as void;
        }

        // Allow overrides from the caller
        if (debugEnabled > 0) warn("rolling damage  ", this.name, this);

        if (workflow && config.midiOptions?.isCritical !== undefined)
          workflow.isCritical = config.midiOptions?.isCritical;
        config.midiOptions ??= {};
        config.midiOptions.fastForwardDamage ??= workflow.workflowOptions?.fastForwardDamage ?? workflow.rollOptions.fastForwardDamage;

        if (workflow) workflow.damageRollCount += 1;
      } catch (err) {
        const message = "Configure Damage Roll error";
        TroubleShooter.recordError(err, message);
        error(message, err);
      }
    }

    getDamageConfig(config: RollProcessConfig = {}) {
      config.attackMode = config.workflow?.attackMode;
      const rollConfig = super.getDamageConfig(config);
      this.configureDamageRoll(rollConfig);
      this.createDamageRollModifiers(rollConfig);

      return rollConfig;
    }

    getDamageRollModifiers(roll: Roll /* DamageRoll */): string[] {
      const modifiers: string[] = [];
      const actionType = this.actionType;
      const itemType = this.item.type;
      //@ts-expect-error no dnd5e-types
      const damageTypes = roll.options.types;
      const changes: any[] = [];
      if (this.actor) for (let effect of this.actor.allApplicableEffects()) {
        if (effect.disabled || effect.isSuppressed) continue;
        // @ts-expect-error fvtt-types v14 ActiveEffect
        for (let change of effect.system.changes) {
          if (!change.key.startsWith("flags.midi-qol.rollModifiers.damage.")) continue;
          changes.push(change);
        }
      }
      changes.sort((a, b) => a.priority - b.priority);
      for (let change of changes) {
        const [_, __, ___, ____, actionOrItem, damageType] = change.key.split(".");
        if (actionOrItem === "all" || actionOrItem === actionType || actionOrItem === itemType) {
          if (damageType === "all" || damageTypes.includes(damageType)) {
            modifiers.push(change.value);
          }
        }
      }
      return modifiers;
    }

    createDamageRollModifiers(this: Activity, rollConfig: RollProcessConfig) {
      const rolls = rollConfig.rolls;
      rolls?.forEach(roll => {
        // @ts-expect-error
        const modifiers = this.getDamageRollModifiers(roll);
        roll.options ??= {};
        roll.options["midi-qol"] ??= {};
        roll.options["midi-qol"].modifiers ??= [];
        roll.options["midi-qol"].modifiers = roll.options["midi-qol"].modifiers.concat(modifiers);
        if (roll.options?.properties && this.midiProperties?.magicDamage && !roll.options.properties.includes("mgc")) roll.options.properties.push("mgc");
      })
    }

    async postProcessDamageRoll(config: RollProcessConfig, result: Array<Roll>): Promise<Array<Roll>> {
      //@ts-expect-error
      const DamageRoll = CONFIG.Dice.DamageRoll;

      try {
        if (!config.workflow) return result;

        // @ts-expect-error no dnd5e-types
        let magicalDamage = this.item?.system.magicAvailable;
        // @ts-expect-error no dnd5e-types
        magicalDamage ??= this.item?.system.properties.has("mgc");
        magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && this.attackBonus > 0);
        //@ts-expect-error no dnd5e-types
        magicalDamage ||= configSettings.requireMagical === "off" && (config.ammunition?.system.magicalBonus ?? 0) > 0;
        magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && (this.attack?.type.classification ?? "none") !== "weapon");
        magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && this.isSpell);

        if (result?.length > 0) {
          result.forEach(roll => {
            const droll: any = roll;
            if (!droll.options.properties) droll.options.properties = [];
            if (this.isSpell) droll.options.properties.push("spell");
            if (magicalDamage && !droll.options.properties.includes("mgc")) droll.options.properties.push("mgc");
            droll.options.properties.push(this.actionType);
            if (droll.data.actorType === configSettings.averageDamage || configSettings.averageDamage === "all") 
              averageDice(droll);
          })
        }
        const firstTarget = config.workflow.hitTargets.first() ?? config.workflow.targets?.first();
        const firstTargetActor = firstTarget?.actor;
        const targetMaxFlags = firstTargetActor?.flags?.[MODULE_ID]?.grants?.max?.damage ?? {};
        const maxFlags = config.workflow.actor.flags?.[MODULE_ID]?.max ?? {};
        let needsMaxDamage = (maxFlags.damage?.all && await evalActivationCondition(config.workflow, maxFlags.damage.all, firstTarget, { async: true, errorReturn: false }))
          || (maxFlags.damage && maxFlags.damage[this.actionType] && await evalActivationCondition(config.workflow, maxFlags.damage[this.actionType], firstTarget, { async: true, errorReturn: false }));
        needsMaxDamage = needsMaxDamage || (
          (targetMaxFlags.all && await evalActivationCondition(config.workflow, targetMaxFlags.all, firstTarget, { async: true, errorReturn: false }))
          || (targetMaxFlags[this.actionType] && await evalActivationCondition(config.workflow, targetMaxFlags[this.actionType], firstTarget, { async: true, errorReturn: false })));
        const targetMinFlags = firstTargetActor?.flags?.[MODULE_ID]?.grants?.min?.damage ?? {};
        const minFlags = config.workflow.actor.flags?.[MODULE_ID]?.min ?? {};
        let needsMinDamage = (minFlags.damage?.all && await evalActivationCondition(config.workflow, minFlags.damage.all, firstTarget, { async: true, errorReturn: false }))
          || (minFlags?.damage && minFlags.damage[this.actionType] && await evalActivationCondition(config.workflow, minFlags.damage[this.actionType], firstTarget, { async: true, errorReturn: false }));
        needsMinDamage = needsMinDamage || (
          (targetMinFlags.all && await evalActivationCondition(config.workflow, targetMinFlags.all, firstTarget, { async: true, errorReturn: false }))
          || (targetMinFlags[this.actionType] && await evalActivationCondition(config.workflow, targetMinFlags[this.actionType], firstTarget, { async: true, errorReturn: false })));
        if (needsMaxDamage && needsMinDamage) {
          needsMaxDamage = false;
          needsMinDamage = false;
        }
        const bonusDamageFlags = firstTargetActor?.flags?.[MODULE_ID]?.grants?.bonus?.damage ?? {};
        if (bonusDamageFlags.all || bonusDamageFlags[this.actionType]) {
          const newDamageRoll = bonusDamageFlags[this.actionType] ?? bonusDamageFlags.all;
          const bonusDamage = await new DamageRoll(`${newDamageRoll}`, firstTargetActor?.getRollData()).roll();
          result[0] = addRollTo(result[0], bonusDamage);
        }

        const title = this.name;
        const speaker = getSpeaker(this.actor!);
        let flavor = title;
        // @ts-expect-error no dnd5e-types
        if (this.item.labels.damages?.length > 0) {
          // @ts-expect-error no dnd5e-types
          flavor = `${title} (${this.item.labels.damages.map(d => d.damageType)})`;
        }
        const messageData = {
          title,
          flavor,
          speaker,
          type: "damage",
          system: { item: { id: this.item.id, uuid: this.item.uuid } }
        };
        if (needsMaxDamage) {
          for (let i = 0; i < result.length; i++) {
            result[i] = await result[i].reroll({ maximize: true });
          }
        } else if (needsMinDamage) {
          for (let i = 0; i < result.length; i++) {
            result[i] = await result[i].reroll({ minimize: true });
          }
        } else if (this.actor?.flags?.[MODULE_ID]?.damage?.["reroll-kh"] || this.actor?.flags?.[MODULE_ID]?.damage?.["reroll-kl"]) {
          let result2: Roll[] = [];
          for (let i = 0; i < result.length; i++) {
            result2.push(await result[i].reroll());
          }
          if ((this.actor?.flags?.[MODULE_ID]?.damage?.["reroll-kh"] && (sumRolls(result2) > sumRolls(result)))
            || (this.actor?.flags?.[MODULE_ID]?.damage?.["reroll-kl"] && (sumRolls(result2) < sumRolls(result)))) {
            [result, result2] = [result2, result];
          }
          // display roll not being used.
          if (config.workflow.workflowOptions?.damageRollDSN !== false) {
            let promises = result2.map(r => displayDSNForRoll(r, "damageRoll", undefined, undefined, this.actor));
            await Promise.all(promises);
          }
          await DamageRoll.toMessage(result2, messageData, { rollMode: safeGetGameSetting("core", "messageMode") });
        } else if (this.actor?.flags?.[MODULE_ID]?.damage?.advantage) {
          // To do this properly requires rerolling each term in the damage roll
        }
        setDamageRollMinTerms(result)

        if (this.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(config.workflow.defaultDamageType ?? "")) config.workflow.defaultDamageType = "healing";
        if (config.workflow?.workflowOptions?.damageRollDSN !== false) {
          let promises = result.map(r => displayDSNForRoll(r, "damageRoll", undefined, undefined, this.actor));
          await Promise.all(promises);
        }
        if (config.midiOptions?.addOptionalBonuses !== false) {
          result = await config.workflow.processDamageRollBonusFlags(result);
        }
        return result;
      } catch (err) {
        const message = `doDamageRoll error for item ${this?.name} ${this.uuid}`;
        TroubleShooter.recordError(err, message);
        throw err;
      }
    }

    async setupCanSeeSense(usage: { workflow?: Workflow }) {
      const workflow = usage.workflow;
      if (!workflow) return;
      for (let target of workflow.targets) {
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
          for (const target of workflow.targets) {
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

      // Trigger setters to persist the mutated sets
      workflow.targetsCanSense = workflow.targetsCanSense;
      workflow.tokenCanSense = workflow.tokenCanSense;
      workflow.targetsCanSee = workflow.targetsCanSee;
      workflow.tokenCanSee = workflow.tokenCanSee;
    }

    async setupTargets(config: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean> {
      if (!config.workflow) {
        const errMessage = "MidiQOL | MidiActivity | setupTargets | No workflow found";
        error(errMessage);
        TroubleShooter.recordError(new Error("No workflow found"), errMessage);
        return false;
      }
      const workflow = config.workflow;
      const hasTargetsToUse = (config.midiOptions?.targetsToUse?.size ?? 0) > 0 && !activityHasAreaTarget(this);
      // If targetsToUse was provided (e.g. from completeActivityUse, OverTime effects),
      // pre-populate game.user.targets so any confirmation dialog shows the right selection.
      if (hasTargetsToUse) {
        const tokenIds = Array.from(config.midiOptions!.targetsToUse!).map(t => (t as Token).id);
        updateUserTargets(tokenIds);
      }
      const isSelfTargetActivity = this.target?.affects?.type === "self";
      if (!isSelfTargetActivity && (requiresTargetConfirmation(this, config.midiOptions ?? {})
        || configSettings.enforceSingleWeaponTarget)) {
        if (!(await preTemplateTargets(this, config.midiOptions ?? {})))
          return false;
        // Confirmation was shown — read the user's final selection from game.user.targets.
        workflow.setTargets(validTargetTokens(new Set(game.user?.targets)));
      } else if (hasTargetsToUse) {
        // No confirmation needed — set workflow targets directly from the provided Set
        // to avoid race conditions with game.user.targets being changed by concurrent effects.
        workflow.setTargets(validTargetTokens(config.midiOptions!.targetsToUse!));
        // Given its targets: later states keep them rather than re-reading the user's, which another use can change meanwhile.
        workflow.workflowOptions.ignoreUserTargets = true;
      } else {
        // No targetsToUse and no confirmation — use current user targets or self-target.
        let selfTarget = this.target?.affects.type === "self";
        // @ts-expect-error no dnd5e-types
        if (this.item.type === "tool" && !this.target?.affects.type)
          selfTarget = true;
        if (!selfTarget) {
          // Use the target snapshot captured at the start of use() (before any await points)
          // to avoid a race condition where concurrent workflows clear game.user.targets
          // via updateUserTargets([]) during async gaps.
          const snapshotUuids = config.midiOptions?.workflowOptions?.preSelectedTargetUuids;
          const userTargets: Set<Token.Implementation> = snapshotUuids?.length
            ? new Set(
                snapshotUuids
                  .map(uuid => (fromUuidSync(uuid) as TokenDocument | null)?.object)
                  .filter((t): t is Token.Implementation => !!t)
              )
            : new Set(game.user?.targets);
          workflow.setTargets(validTargetTokens(userTargets));
        } else {
          foundry.utils.setProperty(config, "midiOptions.workflowOptions.targetConfirmation", "none");
          let potentialTarget = getOrCreateTokenForActor(this.actor);
          workflow.setTargets(new Set());
          if (potentialTarget) workflow.setTargets(workflow.targets.add(potentialTarget));
        }
      }
      // remove selection of un-targetable targets TODO
      if (canvas.scene) {
        const tokensIdsToUse: Array<string> = Array.from(workflow.targets).filter(t => isValidTarget(t)).map(t => (t as Token).id);
        updateUserTargets(tokensIdsToUse);
      }
      return true;
    }

    async confirmTargets(): Promise<void> {
    }

    async preTargetingChecks(usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
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
        const condition = checkIncapacitated(this.actor, true, false);
        if (condition) {
          logIncapacitatedCheckResult(this.actor?.name ?? "", condition, debugEnabled > 0, true);
          if (checkMechanic("incapacitated") === "enforce") return removeWorkflow(usage.workflow);
        }
      }

      if (options.callHooks) {
        cancelWorkflow = await callActivityHooks(this, "midi-qol.preTargeting", { activity: this, token: workflow.token, config: usage, dialog, message }) === false;
        cancelWorkflow ||= await callActivityHooks(this, "midi-qol.preTargetingV2", { workflow, usage, dialog, message }) === false;
      }

      if (options.callMacros && configSettings.allowUseMacro) {
        const results = await workflow?.callMacros(this.item, workflow?.onUseMacros?.getMacros("preTargeting"), "OnUse", "preTargeting", { usage, dialog, message });
        cancelWorkflow ||= results?.some(i => i === false) ?? false;
      }
      if (cancelWorkflow) return removeWorkflow(usage.workflow);
      return true;
    }

    async preChatChecks(usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
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
        let hookAbort = await callActivityHooks(this, "midi-qol.preItemRoll", { activity: this, token: workflow.token, config: usage, dialog, message }) === false;
        hookAbort ||= await callActivityHooks(this, "midi-qol.preItemRollV2", { workflow, usage, dialog, message }) === false;
        if (hookAbort || workflow.aborted) {
          console.warn("midi-qol | attack roll blocked by preItemRoll hook");
          workflow.aborted = true;
          await workflow.performState(workflow.WorkflowState_Abort)
          return removeWorkflow(workflow);
        }
      }

      if (options.callMacros && configSettings.allowUseMacro) {
        const results = await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll", { usage, dialog, message });
        if (workflow.aborted || results.some(i => i === false)) {
          console.warn("midi-qol | item roll blocked by preItemRoll macro");
          workflow.aborted = true;
          await workflow.performState(workflow.WorkflowState_Abort)
          return removeWorkflow(workflow);
        }
      }

      if (options.checkUse && this.useCondition && this.effectiveActivationType !== "reaction") { // reactions condition evaluation is handled elsewhere
        if (!(await evalActivationCondition(workflow, this.useCondition, workflow.targets.first(), { async: true }))) {
          const message = `${this.useConditionReason} ${this.actor?.name} unable to use ${this.item.name}:${this.name}`;
          if (!(usage.midiOptions?.noUseWarning || usage.midiOptions?.workflowOptions?.noUseWarning))
            ui.notifications?.warn(message);
          else
            console.warn(`midi-qol | preChatChecks | ${message} `);
          return removeWorkflow(workflow);
        }
      }

      // @ts-expect-error no dnd5e-types
      if (this.isSpell || this.item?.system.type?.value === "scroll") {
        const midiFlags = this.actor?.flags[MODULE_ID];
        // @ts-expect-error no dnd5e-types
        const needsVerbal = this.item.system.properties.has("vocal");
        // @ts-expect-error no dnd5e-types
        const needsSomatic = this.item.system.properties.has("somatic");
        // @ts-expect-error no dnd5e-types
        const needsMaterial = this.item.system.properties.has("material");
        //TODO Consider how to disable this check for DamageOnly workflows and trap workflows
        const conditionData = createConditionData({ actor: this.actor, activity: this });
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
      const reactingActor = this.actor;
      const inReactionContext = !usage.midiOptions?.workflowOptions?.notReaction && !!reactingActor?.inCombat;
      // Classified unless the caller says otherwise; follows checkReaction when not given. An attack per target's
      // per-target uses check no reactions (the first use did) but classify every target.
      if (inReactionContext && reactingActor && (options.checkAoO ?? options.checkReaction)) {
        const isTurn = game.combat?.combatant === game.combat?.getCombatantsByActor(reactingActor)[0];
        if (!isTurn && needsAOOCheck(reactingActor) && this.attack && this.effectiveActivationType !== "special")
          workflow.AoO = true;
      }
      if (inReactionContext && reactingActor && options.checkReaction) {
        if (["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(this.effectiveActivationType ?? "")
          && (this.activation?.cost ?? 1) > 0) {
          workflow.itemUsesReaction = true;
        }

        if (workflow.AoO) workflow.itemUsesReaction = true;

        const queryReaction = workflow.itemUsesReaction && hasUsedReaction(reactingActor) && reactingActor.inCombat
          && needsReactionCheck(reactingActor)
        if (queryReaction) {
          const shouldRoll = await foundry.applications.api.DialogV2.confirm({
            window: {
              title: "midi-qol.EnforceReactions.Title"
            },
            content: i18n("midi-qol.EnforceReactions.Content")
          });
          if (!shouldRoll) {
            await workflow.performState(workflow.WorkflowState_Abort);
            return removeWorkflow(usage.workflow); // user aborted roll TODO should the workflow be deleted?
          }
        }
      }

      workflow.itemUsesBonusAction = false;
      // needsBonusActionCheck() is deliberately NOT part of this condition: it is false for
      // "displayOnly", which would stop itemUsesBonusAction ever being set and so stop the used-
      // bonus-action marker being applied at all. setBonusActionUsed() already admits "displayOnly"
      // explicitly, and the reaction branch above gates the same way - only the prompt below is
      // conditional on needsBonusActionCheck.
      if (!usage.midiOptions?.workflowOptions?.notBonusAction && options.checkBonusAction && this.actor?.inCombat) {
        workflow.itemUsesBonusAction = ["bonus"].includes(this.effectiveActivationType ?? "");
        const queryBonus = workflow.itemUsesBonusAction && hasUsedBonusAction(this.actor) && needsBonusActionCheck(this.actor);
        if (queryBonus) {
          const shouldRoll = await foundry.applications.api.DialogV2.confirm({
            window: {
              title: "midi-qol.EnforceBonusActions.Title"
            },
            content: i18n("midi-qol.EnforceBonusActions.Content")
          });
          if (!shouldRoll) {
            await workflow.performState(workflow.WorkflowState_Abort); // user aborted roll TODO should the workflow be deleted?
            return removeWorkflow(usage.workflow);
          }
        }
      }
      return true;
    }

    async postChatCardChecks(usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig: any = {}): Promise<boolean> {
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
        warn("MidiQOL | postChatCardChecks | Called", this);
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

        let isEmanationTargeting = activityHasAutoPlaceTemplate(this) || activityHasEmanationNoTemplate(this);
        let isAoETargeting = !isEmanationTargeting && activityHasAreaTarget(this);
        let selfTarget = this.target?.affects.type === "self";
        const inCombat = this.actor && isInCombat(this.actor);
        const requiresTargets = configSettings.requiresTargets === "always"
          || (configSettings.requiresTargets === "tokens" && (canvas?.scene?.tokens.size ?? 0) > 0)
          || (configSettings.requiresTargets === "combat" && inCombat);
        let speaker = getSpeaker(this.actor!);

        let shouldAllowRoll = !options.checkTargets || !requiresTargets // we don't care about targets
          || (workflow.targets.size > 0) // there are some target selected
          || (this.target?.affects.type ?? "") === "" // no target required
          || selfTarget
          || isAoETargeting // area effect spell and we will auto target
          || isEmanationTargeting // range target and will autoTarget
          || (!this.attack && !this.hasDamage && !this.hasSave); // does not do anything - need to check dynamic effects

        if (!shouldAllowRoll) {
          ui.notifications?.warn(i18n("midi-qol.noTargets"));
          return removeWorkflow(workflow);
        }

        // Determine allowed number of targets
        // Skip count enforcement for scaled target counts — deferred to WorkflowState_AoETargetConfirmation
        // where the user will have a chance to adjust targets after seeing the scaled count.
        let allowedTargets: number;
        const hasExplicitCount = this.target?.affects?.count && this.target.affects.count !== "";
        if (hasExplicitCount && !activityHasScaledTargetCount(this)) {
          allowedTargets = Number(this.target.affects.count);
        } else if (options.checkTargets && requiresTargets && shouldEnforceSingleTarget(this)) {
          // Enforce single target for weapons when the setting is enabled
          allowedTargets = 1;
        } else {
          allowedTargets = Infinity;
        }

        // Check for no targets when creature-type targeting requires them
        const creatureTargetTypes = ["creature", "enemy", "ally", "willing"];
        if (options.checkTargets && requiresTargets && !isEmanationTargeting && !isAoETargeting
            && creatureTargetTypes.includes(this.target?.affects?.type) && workflow.targets.size === 0) {
          ui.notifications?.warn(i18n("midi-qol.noTargets"));
          if (debugEnabled > 0) warn(`${game.user?.name} attempted to roll with no targets selected`);
          return removeWorkflow(workflow);
        }

        // Check for too many targets
        if (options.checkTargets && requiresTargets && workflow.targets.size > allowedTargets) {
          ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
          if (debugEnabled > 0) warn(`${game.user?.name} ${i18nFormat(`midi-qol.${MODULE_ID}.wrongNumberTargets`, { allowedTargets })}`);
          return removeWorkflow(workflow);
        }

        let tokenToUse: foundry.canvas.placeables.Token.Implementation | undefined;
        if (speaker.token) tokenToUse = canvas.tokens?.get(speaker.token);
        const rangeDetails = checkActivityRange(this, tokenToUse, workflow.targets, checkMechanic("checkRange") !== "none" && !isAoETargeting && !workflow.AoO)
        if (checkMechanic("checkRange") !== "none" && !isAoETargeting && !isEmanationTargeting && !workflow.AoO && speaker.token) {
          if (tokenToUse && workflow.targets.size > 0) {
            if (rangeDetails.result === "fail")
              return removeWorkflow(workflow);
            else {
              tokenToUse = rangeDetails.attackingToken;
            }
          }
        }


        const targetsCreatures = !!this.attack || !["", "self"].includes(this.target?.affects?.type ?? "");
        if (!isAoETargeting && !isEmanationTargeting && targetsCreatures && !checkTotalCover(this, tokenToUse, workflow.targets))
          return removeWorkflow(workflow);
        if (!isAoETargeting && !isEmanationTargeting && !checkTargetsSeen(this, tokenToUse, workflow.targets))
          return removeWorkflow(workflow);

        if (!workflow) return false;
        workflow.token = tokenToUse;
        workflow.rangeDetails = rangeDetails;

        if (configSettings.undoWorkflow) await saveUndoData(workflow);

        // if showing a full card we don't want to auto roll attacks or damage.
        // Check if activity consumes ammunition
        const ammoConsumption = this.consumption?.targets?.find(t => t.type === "ammo");
        if (ammoConsumption?.target) {
          workflow.ammunition = this.actor?.items.get(ammoConsumption.target);
        }
        // Need concentration removal to complete before allowing workflow to continue so have workflow wait for item use to complete
      } catch (err) {
        const message = `postChatCardChecks error for ${this.actor?.name} ${this.name} ${this.uuid}`;
        TroubleShooter.recordError(err, message);
        throw err;
      }
      return true;
    }

    _usageChatButtons(message) { // need to filter out place template button for auto placed or no templates
      let buttons = super._usageChatButtons(message);
      const autoCreateTemplate = activityHasAutoPlaceTemplate(this);
      const emanationNoTemplate = activityHasEmanationNoTemplate(this);
      if (autoCreateTemplate || emanationNoTemplate) {
        // dnd5e 6.0 carries the action at the top level and leaves `dataset` empty on its own
        // buttons, so matching on the dataset alone stopped matching anything and the Place Template
        // button survived auto placement.
        buttons = buttons.filter(b => (b.action ?? b.dataset?.action) !== "placeTemplate")
      }

      /*
       * Other-activity consumption buttons, in 6.0's button format: `action` at the top level, a
       * `label` object, and `icon` as FontAwesome classes rather than markup. The old shape triggered
       * `#migrateLegacyChatButtons`, deprecated in 6.0 and removed in 6.2.
       *
       * The label is a key, not localized text — `card-buttons.hbs` localizes it at render, so a
       * stored string would not follow a language change.
       */
      // Rolled from the card when saves are not auto-rolled; #rollOtherSave hands them to the activity they belong to.
      const saveSource = this.otherSaveSource;
      if (saveSource && !this.save && !this.check && savesRolledFromChat()) {
        buttons.push(...saveSource._usageChatButtons(message)
          .filter(b => ["rollSave", "rollCheck"].includes(b.action ?? b.dataset?.action)));
      }

      if (this.otherActivity?.hasConsumption()) {
        buttons.push({
          action: "consumeOtherActivity",
          label: { value: "midi-qol.ConsumeOtherActivityResource" },
          icon: "fa-solid fa-cubes-stacked",
          visibility: "creator"
        }, {
          action: "refundOtherActivity",
          label: { value: "midi-qol.RefundOtherActivityResource" },
          icon: "fa-solid fa-clock-rotate-left",
          visibility: "creator"
        });
      }

      return buttons;
    }

    /**
     * Determine whether a chat button should be hidden based on current state.
     * Mirrors dnd5e's shouldHideChatButton pattern.
     */
    shouldHideChatButton(
      button: HTMLButtonElement | { action?: string, dataset?: Record<string, string> },
      message: ChatMessage.Implementation
    ): boolean {
      const consumed = message.getFlag(MODULE_ID, "use.consumed");
      // dnd5e 6.0 calls this from `_prepareButtons` with the stored button descriptor, which carries
      // `action` at the top level; before that it was called with the rendered element, where the
      // action lives on the dataset. Accept either.
      // `||` not `??`: the button schema always defines `action`, so midi's own buttons — which
      // carry theirs on the dataset — arrive with it set to the empty string rather than absent.
      const action = ("action" in button ? button.action : undefined) || button.dataset?.action;
      const midi = (message?.system as { midi?: { hasAttack?: boolean, hasDamage?: boolean } })?.midi;
      // The same rule midi's own buttons are drawn by, so the two cannot disagree.
      const visible = midiButtonVisibility(message, this);
      if (visible.allRemoved) return true;
      switch (action) {
        /*
         * midi draws its own attack and damage controls, with the advantage, disadvantage and
         * critical variants dnd5e has no equivalent for, so the system's plain pair would be a second
         * way to do the same thing — and one that ignores midi's fast-forward settings.
         *
         * Suppressed here rather than dropped in `_usageChatButtons` so the buttons still exist in
         * `message.system.buttons`: a card midi did not draw (`midi.hasAttack` unset, e.g. an
         * activity used while midi's automation is off) falls through and gets the system's own.
         */
        case "rollAttack": if (midi?.hasAttack || visible.attackSpent) return true; break;
        case "rollDamage": if (midi?.hasDamage || visible.damageSpent) return true; break;
        // Show consume button only when rolled but didn't consume (empty object {})
        // Hide if: cancelled (false), not checked (undefined), or already consumed (non-empty object)
        case "consumeOtherActivity": return !(consumed && foundry.utils.isEmpty(consumed));
        // Show refund button only when actually consumed (non-empty object)
        case "refundOtherActivity": return !consumed || foundry.utils.isEmpty(consumed);
        // dnd5e hides placeTemplate when !game.canvas.scene, which is true during page reload
        // before canvas is ready — only check permission here
        // REGION_CREATE replaced the deprecated TEMPLATE_CREATE in v14 (templates are regions); cast until fvtt-types catches up
        case "planTeleport": if (visible.teleported) return true; break;
        case "placeTemplate":
          if (visible.templatesPlaced) return true;
          return !game.user?.can("REGION_CREATE" as User.ActionPermission);
        case "rollSave":
        case "rollCheck":
          if (visible.savesResolved) return true;
          break;
      }
      return super.shouldHideChatButton?.(button, message) ?? false;
    }

    // Region update deferred from _placeEmanationTemplate, consumed by
    // _attachRegionActivityBehavior later in the same use flow (same activity clone)
    declare _pendingRegionUpdate: Record<string, any> | undefined;

    async _resolveAttachTokenId(workflow: Workflow | undefined, mode: "caster" | "target"): Promise<string | undefined> {
      if (mode === "caster") return (workflow?.token ?? getToken(this.actor))?.document.id ?? undefined;
      const fromWorkflow = workflow?.targets && workflow.targets.size > 0
        ? Array.from(workflow.targets) as Token.Implementation[]
        : [];
      const targets = fromWorkflow.length > 0
        ? fromWorkflow
        : Array.from(game.user?.targets ?? []) as Token.Implementation[];
      if (targets.length === 0) {
        ui.notifications?.warn(i18n("midi-qol.REGION_BEHAVIOR.attachToken.noTarget"));
        return undefined;
      }
      if (targets.length === 1) return targets[0].document.id ?? undefined;
      return this._promptAttachTargetPicker(targets);
    }

    async _promptAttachTargetPicker(targets: Token.Implementation[]): Promise<string | undefined> {
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

    async _placeEmanationTemplate(workflow: Workflow | undefined) {
      const autoCreateTemplate = activityHasAutoPlaceTemplate(this);
      const actor = this.item.parent;
      const tokenToUse = workflow?.token ?? getToken(actor);
      if (!tokenToUse) return;
      if (autoCreateTemplate) {
        const templateDocuments = await createActivityTemplateRegions(this, [{
          ...tokenSourceCenter(tokenToUse), direction: 0, token: tokenToUse.document
        }], {
          actorUuid: actor?.uuid,
          tokenId: tokenToUse.id,
          workflowId: this.uuid,
          itemUuid: this.item?.uuid
        });

        if (templateDocuments && templateDocuments.length > 0) {
          const regionDoc = templateDocuments[0];
          const docToStore = regionDoc;
          await busyWait(10);

          if (regionDoc) {
            const regionUpdate: Record<string, any> = {};
            // Token attachment is resolved in _attachRegionActivityBehavior, which runs
            // after template targeting so attachToken "target" sees the template targets.
            // Apply configured region visibility (default ALWAYS from compat shim)
            const rbConfig = this.regionBehavior;
            if (rbConfig?.enabled && rbConfig.regionVisibility !== undefined) {
              regionUpdate.visibility = rbConfig.regionVisibility;
            }
            // Defer the GM round-trip: _attachRegionActivityBehavior runs later in the
            // same use flow and will batch this update with behavior creation into one
            // socket call.
            if (Object.keys(regionUpdate).length) {
              this._pendingRegionUpdate = regionUpdate;
            }
          }

          if (workflow) {
            workflow.templateUuid = docToStore.uuid;
            if (getActivityAutoTargetAction(this) !== "none") selectTargetsFromTemplates([docToStore.uuid]);
          } else selectTargetsFromTemplates([docToStore.uuid]);
          return templateDocuments;
        }
      }
    }

    /**
     * Attach a MidiRegionActivityBehaviorType to a RegionDocument.
     * If `regionBehavior.enabled` is set on this activity, uses the stored config.
     * Otherwise falls back to auto-deriving from the overtime sibling activity.
     * @param regionDoc The Region to attach the behavior to
     * @param workflow The current workflow
     * @param overTimeActivity The activity with isOverTimeFlag (may differ from `this` if `this` is the Cast activity)
     * @param castLevel The spell level from the usage message (set by dnd5e's _prepareUsageScaling before _usageChatContext)
     */
    async _attachRegionActivityBehavior(regionDoc: RegionDocument.Implementation, workflow: Workflow, overTimeActivity: any, castLevel?: number) {
      const rbConfig = this.regionBehavior;
      // Collect behaviors to attach and any region update; writeRegion() batches them
      // into a single GM round-trip (or runs locally if the user has permission).
      const behaviors: any[] = [];
      let regionUpdate: any | undefined;
      // A cast that rolls against the creatures in the area has dealt with those already inside.
      const castAffectsTargets = ["attack", "damage", "save"].includes(this.type) && !!workflow?.targets?.size;
      // Effects applied while a token is inside are dnd5e's apply-effect behaviour; midi's own behaviour runs activities.
      const effectBehavior = (effectUuids: string[], dispositionFilter: number, excludeSource: boolean) => {
        if (!effectUuids.length) return;
        const { FRIENDLY, NEUTRAL, HOSTILE } = CONST.TOKEN_DISPOSITIONS;
        const casterDisposition = workflow?.token?.document?.disposition ?? this.actor?.prototypeToken?.disposition ?? FRIENDLY;
        // midi's enemies are every disposition other than the caster's; allies are the caster's own.
        const dispositions = dispositionFilter === -1 ? [FRIENDLY, NEUTRAL, HOSTILE].filter(d => d !== casterDisposition)
          : dispositionFilter === 1 ? [casterDisposition] : [];
        behaviors.push({
          type: "dnd5e.applyActiveEffect",
          name: `${this.item?.name ?? "Activity"} Region Effects`,
          system: { effects: [...new Set(effectUuids)], dispositions },
          flags: { [MODULE_ID]: { excludeSource } }
        });
      };

      // If explicitly configured on this activity, use stored config
      // Convert portable IDs/identifiers from the activity schema to full UUIDs for the behavior type
      if (rbConfig?.enabled) {
        const resolvedRules: Array<{trigger: string, action: string, targetUuid: string}> = [];
        const effectUuids: string[] = [];
        for (const rule of rbConfig.rules ?? []) {
          if (rule.action === "useActivity") {
            // @ts-expect-error no dnd5e types for activities
            const act = this.item?.system.activities?.find(
              (a: any) => (a.identifier || a.midiProperties?.identifier || a.id) === rule.targetId
            );
            if (act) resolvedRules.push({ trigger: rule.trigger, action: rule.action, targetUuid: act.uuid });
          } else if (rule.action === "applyEffect") {
            // Applied on entry and removed on exit by dnd5e; removeEffect rules are implied.
            const effect = this.item?.effects.get(rule.targetId);
            if (effect) effectUuids.push(effect.uuid);
          }
        }
        effectBehavior(effectUuids, rbConfig.dispositionFilter ?? -1, rbConfig.excludeSource ?? true);

        if (resolvedRules.length) behaviors.push({
          type: `${MODULE_ID}.regionActivity` as const,
          name: `${this.item?.name ?? "Activity"} Region Activity`,
          system: {
            sourceItemUuid: this.item?.uuid ?? "",
            sourceActorUuid: this.actor?.uuid ?? "",
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
        for (const effect of this.item?.effects ?? []) {
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
          name: `${this.item?.name ?? "Activity"} Region Activity`,
          system: {
            sourceItemUuid: this.item?.uuid ?? "",
            sourceActorUuid: this.actor?.uuid ?? "",
            rules,
            dispositionFilter: -1,
            castLevel: castLevel ?? workflow?.spellLevel ?? 0,
            excludeSource: true,
            oncePerTurn: true,
            activationEntry: !castAffectsTargets,
          },
        });
      }

      // Attach light behavior if configured on this activity
      const lightConfig = this.regionLight;
      if (lightConfig?.enabled && (lightConfig.dim > 0 || lightConfig.bright > 0)) {
        behaviors.push({
          type: `${MODULE_ID}.regionLight` as const,
          name: `${this.item?.name ?? "Activity"} Region Light`,
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

      // Merge in any update deferred from _placeEmanationTemplate (attachment / visibility)
      const pendingUpdate = this._pendingRegionUpdate;
      if (pendingUpdate) {
        regionUpdate = { ...pendingUpdate, ...(regionUpdate ?? {}) };
        delete this._pendingRegionUpdate;
      }

      // Resolve token attachment for all template types. "default" preserves the
      // pre-attachToken behavior: auto-placed emanations follow the caster, all other
      // templates are stationary. Attachment configures the region itself, so it
      // applies regardless of regionBehavior.enabled (which only gates the behavior rules).
      const attachMode = this.regionBehavior?.attachToken ?? "default";
      const effectiveAttachMode = attachMode === "default"
        ? (activityHasAutoPlaceTemplate(this) ? "caster" : undefined)
        : attachMode;
      if ((effectiveAttachMode === "caster" || effectiveAttachMode === "target")
          && !this.target?.template?.stationary
          && !(regionUpdate?.attachment)) {
        const attachId = await this._resolveAttachTokenId(workflow, effectiveAttachMode);
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
    async _midiUsageContext(message) {
      const workflow = useWorkflows.get(this);
      let systemCard = message.systemCard ?? false;
      const minimalCard = false;

      // Insert targets as required for emanation templates and emanationNoTemplate
      // This is the wrong spot, but there is no other good spot for it.
      const tokenToUse = getToken(this.item.parent);
      const autoCreateTemplate = activityHasAutoPlaceTemplate(this);
      const emanationNoTemplate = activityHasEmanationNoTemplate(this);
      // If emanationTemplate or emanationNoTemplate setup game.user?.targets.
      if (tokenToUse && autoCreateTemplate) {
        this.templates = await this._placeEmanationTemplate(workflow);
      }
      if (tokenToUse && emanationNoTemplate) {
        setRangedTargets(tokenToUse, this.target);
        workflow?.setTargets(validTargetTokens(new Set(game.user?.targets)));
        foundry.utils.setProperty(message.data, "system.targets", globalThis.dnd5e.dataModels.chatMessage.fields.TargetsField.getDescriptors());
      }
      const context = await super._usageChatContext(message);
      if (debugEnabled > 0) warn("show item card ", this, this.actor, this.actor?.token, systemCard, workflow);
      let needAttackButton = !getRemoveAttackButtons(this) || configSettings.mergeCardMulti
        || configSettings.confirmAttackDamage !== "none" ||
        !(workflow?.someAutoRollEventKeySet() && !getAutoRollAttack(workflow));
      const needDamageButton = (this.hasDamage || this.hasHealing) && (
        (["none", "saveOnly"].includes(getAutoRollDamage(workflow)) || workflow?.rollOptions.rollToggle)
        || configSettings.confirmAttackDamage !== "none"
        || !getRemoveDamageButtons(this)
        || systemCard
        || configSettings.mergeCardMulti);
      // not used const sceneId = token?.scene && token.scene.id || canvas.scene?.id;
      const isPlayerOwned = this.item.actor?.hasPlayerOwner;
      const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
        || !configSettings.itemTypeList?.includes(this.item.type);
      // Are there any potential effects to apply
      const effects = workflow?.workflowType === "BaseWorkflow"
        ? await Promise.all(((this.effects ?? []) as ActivityEffectData[]).map(profile => profile.getEffect())) : [];
      let hasEffects = effects.some(effect => effect && !effect.transfer && !effect.flags?.dae?.dontApply);
      // if target type is not blank or there are targets only set hasEffects if we are not going to remove the button later
      if (this.target?.affects.type !== "" || workflow?.targets.size !== 0)
        hasEffects &&= !["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects);
      let dmgBtnText = (this.actionType === "heal") ? i18n("DND5E.HEAL.HealingButton") : i18n("DND5E.Damage");
      if (workflow?.workflowOptions?.fastForwardDamage && configSettings.showFastForward) dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;

      let midiContextData = {
        hasButtons: true,
        labels: this.labels,
        //@ ts-expect-error TODO needed for abilities translation
        // config: game.system.config,
        condensed: configSettings.mergeCardCondensed && !!this.attack,
        hasAttack: this.attack && !minimalCard && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
        // @ts-expect-error no dnd5e-types
        isHealing: !minimalCard && this.item.isHealing && (systemCard || configSettings.autoRollDamage !== "always"),
        hasDamage: needDamageButton,
        hasAttackRoll: !minimalCard && this.attack,
        configSettings,
        hideItemDetails,
        dmgBtnText,
        hasEffects,
        effects: this.item.effects,
        isMerge: true,
        mergeCardMulti: configSettings.mergeCardMulti && (this.attack || this.hasDamage),
        confirmAttackDamage: configSettings.confirmAttackDamage !== "none" && (this.attack || this.hasDamage),
        RequiredMaterials: i18n("DND5E.RequiredMaterials"),
        Attack: i18n("DND5E.Attack"),
        OtherFormula: i18n("DND5E.OtherFormula"),
        displayProperties: configSettings.displayProperties,
        canCancel: configSettings.undoWorkflow, // TODO enable this when more testing done.
      };
      if (!configSettings.displayProperties && context.supplements) {
        const materialsLabel = i18n("DND5E.Materials");
        context.supplements = context.supplements.filter(s => !s.includes(`>${materialsLabel}</`));
      }
      const showSaveButtons = savesRolledFromChat();
      context.buttons = context.buttons?.filter(b => !["rollAttack", "rollDamage", "rollHealing"].includes(b.dataset?.action));
      if (!showSaveButtons) context.buttons = context.buttons?.filter(b => !["rollSave", "rollCheck"].includes(b.dataset?.action));
      if (configSettings.autoCheckSaves !== "none") context.buttons?.forEach(b => { b.isDisabled = ["rollSave", "rollCheck"].includes(b.dataset?.action) ? "disabled" : "" });
      return foundry.utils.mergeObject(context, midiContextData)
    }

    /**
     * Settle the card's rendering decisions into the message's system data.
     *
     * They depend on the workflow, which exists here and is gone by the time the card is rendered
     * again after a reload — so they are decided once, now, and stored. `MidiUsageMessageData` reads
     * them back; see the schema there for why they cannot live in the template's context alone.
     *
     * The decisions themselves are not recomputed: `_usageChatContext` already works them out at
     * exactly this moment, so this takes what it produced rather than keeping a second copy of the
     * reasoning that would drift from it.
     */
    async _createUsageMessage(message: RollMessageConfig = {}) {
      try {
        const context: MidiUsageChatContext = await this._midiUsageContext(message);
        // Only what is set: the schema reads an absent flag as false, absent displayProperties as true
        const flags = ["hasButtons", "hasAttack", "hasAttackRoll", "hasDamage", "hasEffects", "condensed", "mergeCardMulti",
          "confirmAttackDamage", "hideItemDetails"] as const;
        const midi: Record<string, unknown> = Object.fromEntries(flags.filter(key => context[key]).map(key => [key, true]));
        if (!context.displayProperties) midi.displayProperties = false;
        if (context.dmgBtnText) midi.dmgBtnText = context.dmgBtnText;
        // A use started from inside another of the actor's workflows is linked to its card, as dnd5e links saves.
        const origin = this.actor ? Workflow.executingCardFor(this.actor)?.id ?? null : null;
        message = foundry.utils.mergeObject({ data: { system: { midi, ...(origin ? { origin } : {}) } } }, message ?? {},
                                            { inplace: false });
      } catch (err) {
        // A card that cannot describe itself is still better than no card at all.
        console.error(`${MODULE_ID} | could not record usage card state`, err);
      }
      return super._createUsageMessage(message);
    }

    get actionType() { // the default actionType method in dnd5e mixin returns this.metadata.data instead of this.metadata.type
      return this.metadata.type;
    }

    _ammunitionActivity: MidiActivityMixin | null | undefined;

    /**
     * An activity carried by the loaded ammunition. Resolved independently of otherActivity so an
     * item's own other activity and its ammunition can both run — previously ammunition won the
     * single slot, and `otherActivityId: "none"` silenced it even though that setting exists to stop
     * auto-detection from the item's *own* activities.
     */
    get ammunitionActivity(): MidiActivityMixin | undefined {
      if (this._ammunitionActivity !== undefined) return this._ammunitionActivity ?? undefined;
      this._ammunitionActivity = findAmmunitionActivity(this.ammunitionItem) ?? null;
      return this._ammunitionActivity ?? undefined;
    }

    get otherActivity() {
      if (this._otherActivity !== undefined) return this._otherActivity as MidiActivityMixin;
      if (this.otherActivityId === "none") return undefined;
      if (this.otherActivityId) {
        // @ts-expect-error no dnd5e-types
        this._otherActivity = this.item.system.activities.get(this.otherActivityId) as MidiActivityMixin | undefined;
        // @ts-expect-error no dnd5e-types
        if (!this._otherActivity) this._otherActivity = this.item.system.activities.find(a => a.identifier === this.otherActivityId) as MidiActivityMixin | undefined;
        this._otherActivity?.prepareData();
        return this._otherActivity as MidiActivityMixin | undefined;
      }

      // Auto-detect only applies to attack activities
      if (!this.attack) {
        this._otherActivity = null;
        return this._otherActivity as null;
      }

      // unset ("" or null) follows the configured default; new activities are stamped "none"
      if (configSettings.defaultOtherActivity === "none") {
        this._otherActivity = null;
        return this._otherActivity as null;
      }

      // Prefer a sole automationOnly candidate, else a sole compatible one; ambiguity means no pairing
      const soleCandidate = (filter: (a: any) => boolean) => {
        // @ts-expect-error no dnd5e-types
        const options = this.item.system.activities.filter(a => filter(a) && a.isOtherActivityCompatible && a.uuid !== this.uuid);
        return options.length === 1 ? options[0] : undefined;
      };
      this._otherActivity = soleCandidate(a => a.midiProperties?.automationOnly) ?? soleCandidate(() => true);
      this._otherActivity?.prepareData();
      if (!this._otherActivity) this._otherActivity = null;
      return this._otherActivity as MidiActivityMixin | undefined | null;
    }

    get useCondition() {
      return this.useConditionText ?? "";
    }

    get effectCondition() {
      return this.effectConditionText ?? "";
    }

    get reactionCondition() {
      return this.useCondition ?? "";
    }

    get otherCondition() {
      return this.otherActivity?.useCondition ?? "";
    }

    get hasDamage() {
      return (this.damage?.parts?.length ?? 0) > 0;
    }

    get hasHealing() {
      return this.healing !== undefined;
    }
    get hasAttack() {
      return this.attack !== undefined;
    }
    get hasSave() {
      return (!!this.save || !!this.check);
    }
  }
  return MidiActivityMixin;
}

export let MidiActivityMixinSheet = Base => {
  return class MidiActivitySheet extends Base {

    static DEFAULT_OPTIONS = {
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
    #onAddMidiStatusDuration(event: Event) {
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
      context.isSummons = this.activity.type === "summon";
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
        .forEach(select => select.addEventListener("change", this.#onAddMidiStatusDuration.bind(this)));

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

}
