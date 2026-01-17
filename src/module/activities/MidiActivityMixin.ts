import { Activity, ActivityUseConfiguration, RollDialogConfig, DND5ETargetDescriptor, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { GameSystemConfig, MODULE_ID, allAttackTypes, debugEnabled, error, i18n, i18nFormat, warn, busyWait } from "../../midi-qol.js";
import { socketlibSocket } from "../GMAction.js";
import { ActiveDefenceWorkflow, AugmentedEvent, TrapWorkflow, Workflow, SavesFirstWorkflow } from "../Workflow.js";
import { OnUseMacros } from "../apps/Item.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
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
  targetConfirmation,
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
  asyncHooksCall,
  canSee,
  canSense,
  checkActivityRange,
  checkIncapacitated,
  createConditionData,
  displayDSNForRoll,
  evalActivationCondition,
  evalCondition,
  getAutoRollAttack,
  getAutoRollDamage,
  getRemoveAttackButtons,
  getRemoveDamageButtons,
  getSpeaker,
  getToken,
  activityHasAutoPlaceTemplate,
  hasUsedBonusAction,
  hasUsedReaction,
  initializeVision,
  autoConsumeResource,
  isInCombat,
  logIncapacitatedCheckResult,
  needsBonusActionCheck,
  needsReactionCheck,
  setBonusActionUsed,
  setReactionUsed,
  sumRolls,
  tokenForActor,
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
} from "../utils.js";
import { preTemplateTargets, removeFlanking, selectTargets, setDamageRollMinTerms, shouldEnforceSingleTarget } from "./activityHelpers.js";

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
    get targets() {
      foundry.utils.logCompatibilityWarning("MidiActivityMixin | activity.targets is deprecated. Use workflow.targets instead");
      return Workflow.getWorkflowByActivityUuid(this.uuid)?.targets ?? new Set();
    }
    set targets(value) {
      foundry.utils.logCompatibilityWarning("MidiActivityMixin | setting activity.targets is not supported. Use workflow.targets instead");
    }

    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.SHARED"];

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField, SetField } = foundry.data.fields;
      const { FormulaField } = globalThis.dnd5e.dataModels.fields;
      const schema = {
        ...super.defineSchema(),
        // flags: new ObjectField(),
        useConditionText: new MidiConditionField({ name: "useCondition", initial: "" }),
        useConditionReason: new StringField({ name: "useConditionReason", initial: "" }),
        effectConditionText: new MidiConditionField({ name: "effectCondition", initial: "" }),
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
          removeChatButtons: new StringField({ name: "removeChatButtons", initial: "default", blank: false, required: true }),
          magicEffect: new BooleanField({ name: "magicEffect", initial: false }),
          magicDamage: new BooleanField({ name: "magicDamage", initial: false }),
          noConcentrationCheck: new BooleanField({ name: "noConcentrationCheck", initial: false }),
          skipConcentrationCheck: new BooleanField({ name: "skipConcentrationCheck", initial: false }),
          autoCEEffects: new StringField({ name: "autoCEEffects", initial: "default", blank: false, required: true }),
        }),
        isOverTimeFlag: new BooleanField({ name: "isOverTimeFlag", initial: false }),
        overTimeProperties: new SchemaField({
          turnChoice: new StringField({ blank: false, choices: ["start", "end"], default: "start" }),
          saveRemoves: new BooleanField({ initial: true }),
          //@ts-expect-error find out why there is a type error here
          preRemoveConditionText: new MidiConditionField({ name: "removeCondition", initial: "" }),
          //@ts-expect-error find out why there is a type error here
          postRemoveConditionText: new MidiConditionField({ name: "postRemoveCondition", initial: "" }),
        })
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
    get selfOnlyTriggerActivity() {
      return false;
    }

    get forcedTargetConfirmation(): string | undefined {
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

    get canUseOtherActivity() {
      return false;
    }

    get canUse() {
      // if (this.midiProperties?.automationOnly) return false;
      return super.canUse;
    }

    getOnUseMacros({ onlyOnUseItemMacros = false } = {}) {
      const onUseMacros = new OnUseMacros();
      this.ammunitionOnUseMacros = new OnUseMacros();
      const itemOnUseMacros = this.item?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
      const ammunitionOnUseMacros = this.ammunitionItem?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
      const actorOnUseMacros = this.actor?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
      if (onlyOnUseItemMacros) {
        onUseMacros.items = [...itemOnUseMacros.items];
      } else {
        onUseMacros.items = [...itemOnUseMacros.items, ...actorOnUseMacros.items];
      }
      this.ammunitionOnUseMacros.items = ammunitionOnUseMacros.items;
      return onUseMacros
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
    get messageFlags() {
      const baseFlags = super.messageFlags;
      // cannot change targets once the workflow has started....
      if (baseFlags.dnd5e?.targets) delete baseFlags.dnd5e.targets;
      const targets = new Map();
      if (this.workflow?.targets) {
        for (const token of this.workflow.targets) {
          const { name } = token;
          const { img, system, uuid } = token.actor ?? {};
          //@ts-expect-error no dnd5e types
          if (uuid) targets.set(uuid, { name, img, uuid, ac: system?.attributes?.ac?.value });
        }
        baseFlags.targets = Array.from(targets.values());

      }
      return baseFlags;
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
          rollDamage: MidiActivityMixin.#rollDamage,
          rollDamageNoCritical: MidiActivityMixin.#rollDamageNoCritical,
          rollDamageCritical: MidiActivityMixin.#rollDamageCritical,
          confirmDamageRollCancel: MidiActivityMixin.#confirmDamageRollCancel,
          confirmDamageRollComplete: MidiActivityMixin.#confirmDamageRollComplete,
          confirmDamageRollCompleteHit: MidiActivityMixin.#confirmDamageRollCompleteHit,
          confirmDamageRollCompleteMiss: MidiActivityMixin.#confirmDamageRollCompleteMiss,
          midiApplyEffects: MidiActivityMixin.#applyEffects,
          refundOtherActivity: MidiActivityMixin.#refundOtherActivity,
          consumeOtherActivity: MidiActivityMixin.#consumeOtherActivity,
        }
      },
    }, { inplace: false, insertValues: true, insertKeys: true });

    static async #applyEffects(this: MidiActivityMixin, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message.uuid);
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
        const result = (await socketlibSocket.executeAsUser("applyEffects", authorId, {
          workflowId: message.uuid,
          targets: Array.from(game.user?.targets).map(t => t.document.uuid)
        }));
      } else {
        if (workflow) {
          workflow.forceApplyEffects = true; // don't overwrite the application targets
          workflow.effectTargets = new Set(game.user?.targets);
          if (workflow.effectTargets.size > 0) workflow.performState(workflow.WorkflowState_ApplyDynamicEffects)
        } else {
          ui.notifications?.warn(i18nFormat("midi-qol.NoWorkflow", { itemName: this.item?.name }));
        }
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
        const workflow = Workflow.getWorkflow(workflowId);
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
      const consumed = messageConfig.data?.flags?.dnd5e?.use?.consumed;

      // Set the consumed flag - button visibility is handled by shouldHideChatButton
      if (consumed) {
        await message.setFlag(MODULE_ID, "use.consumed", consumed);
      }
    }

    static #rollDamage(this: Activity, event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      return this.rollDamage({ event, workflow, midiOptions: { isCritical: workflow?.workflowOptions?.isCritical || workflow?.isCritical } }, {}, message);
    }

    static #rollDamageNoCritical(this: Activity, event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      return this.rollDamage({ event, workflow, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
    }

    static #rollDamageCritical(this: Activity, event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      return this.rollDamage({ event, workflow, critical: { allow: true }, midiOptions: { isCritical: true } }, {}, message);
    }

    get identifier() {
      if (this.midiProperties?.identifier) return this.midiProperties.identifier;
      return this.name.slugify();
    }

    prepareData() {
      //@ts-expect-error
      if (!this.midiProperties.identifier && !this.name) this.midiProperties.identifier = i18n(this.constructor.metadata.dnd5eTitle).slugify();
      super.prepareData();
    }

    async _onChatAction(event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const scaling = message.getFlag("dnd5e", "scaling") ?? 0;
      const existingItem = this.workflow?.item ?? this.item;
      // const item = scaling ? this.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true }) : this.item;
      const item = scaling ? existingItem.clone({ flags: { dnd5e: { scaling } } }, { keepId: true }) : existingItem;
      // let activity = this.otherActivity;
      // @ts-expect-error no dnd5e-types
      const activity = this.workflow?.activity ?? existingItem.system.activities.get(this.id);
      const action = target.dataset.action ?? "";
      let handler = activity?.metadata.usage?.actions?.[action];
      const workflow = Workflow.getWorkflow(message.uuid);
      if (!handler && workflow) {
        if (activity) handler = activity?.metadata.usage?.actions?.[action];
      }
      if (handler) await handler.call(activity, event, target, message);

    }

    async useAs(actor: Actor.Implementation | null | undefined, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      // itemData._id = this.item._id;
      actor = getActor(config.midiOptions?.rollAs);
      if (config.midiOptions?.rollAs) delete config.midiOptions.rollAs;
      if (!actor || actor === this.actor || this.selfOnlyTriggerActivity) return this.use(config, dialog, message);
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
      return activity.use(config, dialog, message);
    }

    async use(usage: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
      if (usage.midiOptions?.rollAs) return this.useAs(usage.midiOptions.rollAs, usage, dialog, message);
      if (!this.item.isEmbedded) return;
      if (!this.item.isOwner) {
        ui.notifications?.error("DND5E.DocumentUseWarn", { localize: true });
      }
      if (!this.canUse) {
        ui.notifications?.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
        return;
      }
      let preUseActivityHookId: number | undefined;
      let activityConsumptionHookId: number | undefined;
      try {
        usage.midiOptions ??= {};
        usage.midiOptions.workflowOptions ??= {};
        if (debugEnabled > 0) warn("MidiQOL | MidiActivity | use | Called", usage, dialog, message);
        let item = this.item.clone({}, { keepId: true });
        // @ts-expect-error no dnd5e-types
        let activity = item.system.activities.get(this.id) as MidiActivityMixin;
        let workflowClass = usage?.midi?.workflowClass ?? globalThis.MidiQOL.workflowClass;
        if (game.user?.isGM && checkRule("activeDefence")) {
          workflowClass = ActiveDefenceWorkflow;
        }
        if (!(workflowClass.prototype instanceof Workflow)) workflowClass = Workflow;
        const workflowOptions = { ...usage.midiOptions, ...(usage.midiOptions?.workflowOptions ?? {}), event: usage.event, storeWorkflow: false };
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
        message.workflow = usage.workflow; // TODO: remove hack to allow card config processing
        usage.workflow!.systemCard = message.systemCard;
        if ((activity.midiProperties?.rollMode ?? "default") !== "default") message.rollMode = activity.midiProperties!.rollMode;
        if (activity.midiProperties?.skipConcentrationCheck && this.actor &&
            activity.consumption.targets.some(t => t.target === "attributes.hp.value"))
          skipConcentrationActorUuids.add(this.actor.uuid);
        if (item.parent) await removeFlanking(item.parent);
        // config.midiOptions.workflowOptions.targetConfirmation ??= this.forcedTargetConfirmation;
        if (!usage.workflow) return undefined;

        if (usage.midiOptions.isCritical) {
          usage.workflow.isCritical = true;
          usage.workflow.attackAdvAttribution.add("CRIT:activity.use");
        }
        if (usage.midiOptions.isFumble) {
          usage.workflow.isFumble = true;
          usage.workflow.attackAdvAttribution.add("FUMBLE:activity.use");
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
        // Synthetic items don't have an _id so setup for them to be recovered from the chat card
        if (!activity.item._id || foundry.utils.getProperty(activity.item, `flags.${MODULE_ID}.syntheticItem`))
          foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());

        let useResults: any;
        preUseActivityHookId = Hooks.on("dnd5e.preUseActivity", (newActivity, usageConfig, messageConfig) => {
          if (usage.workflow!.activity?.uuid !== newActivity.uuid) return true;
          // Not sure if required but set the workflow in the super.usageConfig.
          usageConfig.workflow = usage.workflow;
          // newActivity will be the scaled activity to use that instead of what we have
          usage.workflow!.activity = newActivity;
          // TODO fix this nasty hack
          messageConfig.workflow = usage.workflow;
          return true;
        });
        let usageData: ActivityUseConfiguration | undefined;
        activityConsumptionHookId = Hooks.on("dnd5e.activityConsumption", (newActivity, usageConfig, messageConfig) => {
          if (usage.workflow!.activity?.uuid !== newActivity.uuid) return;
          usageData = usageConfig;
          usageConfig.workflow!.activity = newActivity;
          usageConfig.activity = newActivity;
        });

        if (!await activity.preTargetingChecks(usage, dialog, message)) return false;
        if (!await activity.setupTargets(usage, dialog, message)) {
          ui.notifications?.warn(i18n("midi-qol.noTargets"));
          return false;
        }
        if (!await activity.preChatChecks(usage, dialog, message)) return false;
        try {
          useResults = await super.use.bind(activity)(usage, dialog, message);
        } catch (err) {
          error("MidiQOL | MidiActivity | use | Error in super.use", err);
          TroubleShooter.recordError(err, "Error in super.use");
          Workflow.removeWorkflow(usage.workflow?.id);
          return false;
        }
        // Cleanup skipConcentrationCheck flag in case workflow was interrupted before concentration check
        if (this.actor) skipConcentrationActorUuids.delete(this.actor.uuid);
        if (!useResults) { // activity use was aborted
          Workflow.removeWorkflow(usage.workflow?.id);
          return false;
        }
        // Remove the copy stored by activity uuid
        Workflow.workflows.delete(usage.workflow!.activity?.uuid ?? "");
        // Force a few values to be added to the updates cache now we have the chat card.
        usage.workflow.itemCardUuid = useResults.message.uuid;
        usage.workflow.id = useResults.message.uuid ?? usage.workflow.id;
        usage.workflow.activity = usage.workflow.activity;
        usage.workflow.item = usage.workflow!.activity?.item;
        activity = usage.workflow!.activity! as MidiActivityMixin;
        Workflow.addWorkflow(usage.workflow);
        // Template cleanup is now handled by setupTemplateCleanup in unSuspend
        if (await activity.postChatCardChecks(usage, dialog, message) !== true) return;
        await activity.setupCanSeeSense(usage)
        // if (autoCreateTemplate || emanationNoTemplate) if (!await activity.setupTargets(usage, dialog, message)) return;
        if (activity.templates) { // TODO find a better place to store this
          useResults.templates = activity.templates;
          delete activity.templates;
        }
        if (configSettings.undoWorkflow) await saveUndoData(usage.workflow);

        usage.workflow.itemUseComplete = true;

        usage.workflow.id = useResults.message.uuid;
        if (usage.workflow.itemUsesReaction && this.actor && !hasUsedReaction(this.actor))
          await setReactionUsed(this.actor);
        if (usage.workflow.itemUsesBonusAction && this.actor && !hasUsedBonusAction(this.actor))
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
        const scaling = useResults.message?.getFlag && (useResults.message?.getFlag("dnd5e", "scaling") ?? 0);
        if (scaling) {
          const item = activity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });
          // @ts-expect-error no dnd5e-types
          activity = item.system.activities.get(activity.id);
        }
        activity.midiOptions = usage.midiOptions;
        await usage.workflow.performState((usage.workflow as Workflow).WorkflowState_Start, {});
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
      if (autoConsume.length ?? 0 > 0) {
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
      // TODO decide what this should mean
      if (!config?.workflow) {
        return super.rollDamage(config, dialog, message);
      }
      if (config.workflow.currentAction === config.workflow.WorkflowState_Abort || config.workflow.currentAction === config.workflow.WorkflowState_Completed)
        return this.use(config, dialog, {});
      // TODO: This is odd. `midiOptions` should have `workflowOptions` _in_ it, not be assigned it
      // @ts-expect-error
      config.midiOptions ??= config.workflow.workflowOptions ?? {};
      if (debugEnabled > 0) {
        warn("MidiActivity | rollDamage | Called", config, dialog, message);
      }
      let result: Roll[] | undefined;
      let otherResult: Roll[] | undefined;
      let preRollDamageHookId: number | undefined;
      let rollDamageHookId: number | undefined;
      try {
        if (await asyncHooksCall("midi-qol.preDamageRoll", config.workflow, this, config, dialog, message) === false
          || await asyncHooksCall(`midi-qol.preDamageRoll.${this.item.uuid}`, config.workflow, this, config, dialog, message) === false
          || await asyncHooksCall(`midi-qol.preDamageRoll.${this.uuid}`, config.workflow, this, config, dialog, message) === false) {
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
        //@ts-expect-error
        const areKeysPressed = game.system.utils.areKeysPressed;
        const keys = {
          normal: areKeysPressed(config.event, "skipDialogNormal")
            || areKeysPressed(config.event, "skipDialogDisadvantage"),
          critical: areKeysPressed(config.event, "skipDialogAdvantage")
        };

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
          if (config.workflow && areMidiKeysPressed(config.event as AugmentedEvent, "RollToggle")) config.workflow.rollOptions.rollToggle = !config.workflow.rollOptions.rollToggle;
          // @ts-expect-error no dnd5e-types
          if (this.item.system.properties?.has("ver") && areMidiKeysPressed(config.event ?? config.workflow.workflowOptions.event, "Versatile")) {
            config.workflow.attackMode = "twoHanded";
          }
          if (config.workflow.rollOptions?.rollToggle) dialog.configure = !dialog.configure;
          // If the activity damage has any choice force configuration dialog
          // if (dialog.configure) config.midiOptions.isCritical = false;
          preRollDamageHookId = Hooks.once("dnd5e.preRollDamage", (rollConfig, dialogConfig, messageConfig) => {
            const targetDescriptors = foundry.utils.getProperty(messageConfig, "data.flags.dnd5e.targets") as Array<DND5ETargetDescriptor>;
            // since saves might have been rolled merge the target descriptors
            if (targetDescriptors && config.workflow) {
              config.workflow.targetDescriptors ??= [];
              for (let targetDetails of targetDescriptors) {
                const existing = config.workflow.targetDescriptors.find(td => td.uuid === targetDetails.uuid);
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
          const rollMode = safeGetGameSetting("core", "rollMode");
          message.create ??= false;
          const showChatDamageCard = game.user?.isGM && configSettings.gmAttackDamageCards && [CONST.DICE_ROLL_MODES.SELF, CONST.DICE_ROLL_MODES.BLIND, CONST.DICE_ROLL_MODES.PRIVATE].includes(rollMode);
          if (showChatDamageCard) {
            // Show a chat card for damage rolls if the players are not going to see the midi card.
            message.create = true;
            foundry.utils.setProperty(message, "data.flags.midi-qol.gmHide", true); // since the gm will see the midi card hide the attack card for the author
          }
          result = await super.rollDamage(config, dialog, message);
          if (!result) { // user backed out of roll 
            config.workflow.currentAction = config.workflow.WorkflowState_WaitForDamageRoll;
            // config.workflow.suspend();
            return;
          }
          if (result) result = await this.postProcessDamageRoll(config, result);
          if (config.workflow && config.midiOptions?.updateWorkflow !== false) await config.workflow.setDamageRolls(result);
        }
        if (this.otherActivity && config.workflow.otherActivity !== this && config.midiOptions?.updateWorkflow !== false) {
          // Check if we need to defer rolling until after consumption is confirmed
          if (!this.deferOtherDamage(config, dialog)) {
            otherResult = await this.rollOtherDamage(config, dialog);
          }
        }
        if (config.midiOptions?.updateWorkflow !== false && config.workflow.suspended) config.workflow.unSuspend.bind(config.workflow)({ damageRoll: result?.[0], otherDamageRoll: otherResult?.[0] });
      } catch (err) {
        const message = "doDamageRoll error";
        TroubleShooter.recordError(err, message);
        error(message, err);
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
     * Roll damage for the other activity referenced by this activity.
     * @param config - The roll process configuration
     * @param dialog - The roll dialog configuration
     * @returns The damage rolls from the other activity, or undefined if not rolled
     */
    async rollOtherDamage(
      config: RollProcessConfig,
      dialog: RollDialogConfig
    ): Promise<Roll[] | undefined> {
      if (!this.otherActivity || !config.workflow) return undefined;
      // Check if other activity has something to roll
      if (!(this.otherActivity.hasDamage || this.otherActivity.hasHealing || this.otherActivity.roll?.formula)) {
        return undefined;
      }

      // Check other condition against hit targets
      if (this.otherCondition) {
        let shouldRollOther = false;
        for (const token of config.workflow.hitTargets) {
          shouldRollOther ||= await evalActivationCondition(config.workflow, this.otherCondition, token, { async: true });
          if (shouldRollOther) break;
        }
        if (!shouldRollOther) return undefined;
      }

      let otherResult: Roll[] | undefined;
      const otherConfig = {
        ...config,
        midiOptions: {
          ...config.midiOptions,
          fastForward: config.midiOptions?.fastForwardDamage,
          updateWorkflow: false // rollFormula will try and restart the workflow
        }
      };

      // Undo the roll toggle since rollFormula will look at it as well
      if (this.otherActivity.ac && config.workflow.rollOptions?.rollToggle) {
        dialog.configure = !dialog.configure;
      }

      // Apply scaling to the other activity's item if specified
      // Scaling is stored on the chat card by checkOtherActivityConsumption
      let otherActivity = this.otherActivity;
      const scaling = config.workflow?.chatCard?.getFlag(MODULE_ID, "use.otherScaling");
      if (scaling) {
        const item = otherActivity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });
        otherActivity = item.system.activities.get(otherActivity.id);
      }

      // Roll damage or formula
      if (otherActivity?.hasDamage) {
        otherResult = await otherActivity.rollDamage(otherConfig, dialog, { create: false }) as Roll[] | undefined;
      } else if (otherActivity?.roll?.formula) {
        otherResult = await otherActivity.rollFormula!(otherConfig, dialog, { create: false }) as Roll[] | undefined;
        if (otherResult) {
          if (!(otherResult instanceof Array)) otherResult = [otherResult];
          otherResult = otherResult.map(roll =>
            //@ts-expect-error
            new game.system.dice.DamageRoll(roll.formula, {}, {})
          );
        }
      }

      // Apply parent activity type to damage properties if configured
      if (otherResult && this.otherActivityAsParentType) {
        otherResult.forEach(r => {
          //@ts-expect-error no dnd5e-types
          const properties = new Set(r.options.properties ?? []);
          properties?.delete(this.otherActivity.actionType);
          properties?.add(this.actionType);
          //@ts-expect-error no dnd5e-types
          r.options.properties = Array.from(properties);
        });
      }

      // Update workflow with other damage rolls
      if (otherResult && config.midiOptions?.updateWorkflow !== false) {
        await config.workflow.setOtherDamageRolls(otherResult);
      }

      return otherResult;
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

        // TODO revisit this to see if it is still possible to just re-roll the damage
        if (workflow && (workflow.damageRollCount ?? 0) > 0) { // we are re-rolling the damage. redisplay the item card but remove the damage if the roll was finished
          workflow.displayChatCardWithoutDamageDetail();
        };

        // Allow overrides form the caller
        if (workflow && config.midiOptions?.spellLevel) workflow.rollOptions.spellLevel = config.midiOptions.spellLevel;
        if (workflow && config.midiOptions?.powerLevel) workflow.rollOptions.spellLevel = config.midiOptions.powerLevel;
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
        for (let change of effect.changes) {
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
      const rollMode = safeGetGameSetting("core", "rollMode");

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

        let actionFlavor: string;
        actionFlavor = i18n(this.actionType === "heal" ? "DND5E.Healing" : "DND5E.DamageRoll");

        const title = this.name;
        const speaker = getSpeaker(this.actor!);
        let flavor = title;
        // @ts-expect-error no dnd5e-types
        if (this.item.labels.damages?.length > 0) {
          // @ts-expect-error no dnd5e-types
          flavor = `${title} (${this.item.labels.damages.map(d => d.damageType)})`;
        }
        let messageData = foundry.utils.mergeObject({
          title,
          flavor,
          speaker,
        }, { "flags.dnd5e.roll": { type: "damage", itemId: this.item.id, itemUuid: this.item.uuid } });
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
            let promises = result2.map(r => displayDSNForRoll(r, "damageRoll"));
            await Promise.all(promises);
          }
          await DamageRoll.toMessage(result2, messageData, { rollMode: game.settings.get("core", "rollMode") });
          // await result2.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
        } else if (this.actor?.flags?.[MODULE_ID]?.damage?.advantage) {
          // To do this properly requires rerolling each term in the damage roll
        }
        setDamageRollMinTerms(result)

        if (this.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(config.workflow.defaultDamageType ?? "")) config.workflow.defaultDamageType = "healing";
        if (config.workflow?.workflowOptions?.damageRollDSN !== false) {
          let promises = result.map(r => displayDSNForRoll(r, "damageRoll"));
          await Promise.all(promises);
        }
        result = await config.workflow.processDamageRollBonusFlags(result);
        return result;
      } catch (err) {
        const message = `doDamageRoll error for item ${this?.name} ${this.uuid}`;
        TroubleShooter.recordError(err, message);
        throw err;
      }
    }

    async setupCanSeeSense(usage: { workflow?: Workflow }) {
      const workflow = usage.workflow;
      const wasSightEnabled = {};
      if (!workflow) return;
      let needPause = false;
      for (let tokenRef of workflow.targets.union(new Set([workflow.token]))) {
        const target = getToken(tokenRef);
        if (!target) continue;
        wasSightEnabled[target.id] = target.document.sight.enabled;
        if (
          // sight not enabled but we are treating it as if it is
          (!target.document.sight.enabled && configSettings.optionalRules.invisVision)
          // @ts-expect-error no dnd5e-types
          || (target.actor?.type === "npc")
          // sight enabled but not the owner of the token
          || (!target.isOwner && target.document.sight.enabled)
          || (!target.vision || !target.vision?.los)) {
          initializeVision(target);
          needPause = game.modules.get("levels-3d-preview")?.active ?? false;
        }
      }
      if (needPause) {
        await busyWait(100);
        for (let tokenRef of workflow.targets) {
          const target = getToken(tokenRef);
          if (!target || !target.vision?.los) continue;
          const sourceId = target.sourceId;
          //@ts-expect-error
          canvas.effects?.visionSources.set(sourceId, target.vision);
        }
      }

      for (let target of workflow.targets) {
        // TODO: This is odd - if `!workflow.token` then `true`, but then we're adding `undefined` to `targetsCanSense`
        const tokenCanSense = workflow.token ? canSense(workflow.token, target, globalThis.MidiQOL.InvisibleDisadvantageVisionModes) : true;
        const targetCanSense = workflow.token ? canSense(target, workflow.token, globalThis.MidiQOL.InvisibleDisadvantageVisionModes) : false;
        if (targetCanSense) workflow.targetsCanSense.add(workflow.token!);
        else workflow.targetsCanSense.delete(workflow.token!);
        if (tokenCanSense) workflow.tokenCanSense.add(target);
        else workflow.tokenCanSense.delete(target);
        const tokenCanSee = workflow.token ? canSee(workflow.token, target) : true;
        const targetCanSee = workflow.token ? canSee(target, workflow.token) : false;
        if (targetCanSee) workflow.targetsCanSee.add(workflow.token!);
        else workflow.targetsCanSee.delete(workflow.token!);
        if (tokenCanSee) workflow.tokenCanSee.add(target);
        else workflow.tokenCanSee.delete(target);
      }
      for (let targetRef of workflow.targets) {
        const target = getToken(targetRef);
        if (!target) continue;
        target.document.sight.enabled = wasSightEnabled[target.id];
        target.initializeVisionSource();
      }
      if (workflow.token) {
        workflow.token.document.sight.enabled = wasSightEnabled[workflow.token.id];
        workflow.token.initializeVisionSource();
      }
    }

    async setupTargets(config: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean> {
      if (!config.workflow) {
        const errMessage = "MidiQOL | MidiActivity | setupTargets | No workflow found";
        error(errMessage);
        TroubleShooter.recordError(new Error("No workflow found"), errMessage);
        return false;
      }
      const workflow = config.workflow;
      if ((config.midiOptions?.targetsToUse?.size ?? 0) > 0 && !activityHasAreaTarget(this) && this.target?.affects.type !== "self") {
        workflow.setTargets(config.midiOptions!.targetsToUse!);
      } else {
        if (((this.target?.affects.type ?? "") !== "")
          || configSettings.enforceSingleWeaponTarget
          || (targetConfirmation.enabled && targetConfirmation.always)
          || (targetConfirmation.enabled && targetConfirmation.noneTargeted)
          || this.forcedTargetConfirmation) {
          if (!(await preTemplateTargets(this, config.midiOptions ?? {})))
            return false;
        }
        // Setup targets.
        let selfTarget = this.target?.affects.type === "self";
        // @ts-expect-error no dnd5e-types
        if (this.item.type === "tool" && !this.target?.affects.type)
          selfTarget = true;
        if (!selfTarget) {
          workflow.setTargets(validTargetTokens(new Set(game.user?.targets)));
        } else { // There is no token for the actor on the scene - create a temp target for this
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
        cancelWorkflow = await asyncHooksCall("midi-qol.preTargeting", { activity: this, token: workflow.token, config: usage, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargeting.${this.item.uuid}`, { activity: this, token: workflow.token, config: usage, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargeting.${this.uuid}`, { activity: this, token: workflow.token, config: usage, dialog, message }) === false;
        cancelWorkflow ||= await asyncHooksCall("midi-qol.preTargetingV2", { workflow, usage, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargetingV2.${this.item.uuid}`, { workflow, usage, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargetingV2.${this.uuid}`, { workflow, usage, dialog, message }) === false;
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
      let options: any = { none: false, checkAoO: true, checkReaction: true, checkBonusAction: true, checkAllowIncapacitated: false, callMacros: true, callHooks: true, checkTargets: true, checkComponents: true, checkUse: true }
      if (optionsConfig.none) options = optionsConfig;
      else
        options = foundry.utils.mergeObject(options, optionsConfig, { insertKeys: true, overwrite: true });
      if (usage.midiOptions?.proceedChecks?.none) options = usage.midiOptions.proceedChecks;
      else
        options = foundry.utils.mergeObject(options, usage.midiOptions?.proceedChecks ?? {}, { insertKeys: true, overwrite: true });

      if (options.callHooks) {
        let hookAbort = await asyncHooksCall("midi-qol.preItemRoll", { activity: this, token: workflow.token, config: usage, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preItemRoll.${this.uuid}`, { activity: this, token: workflow.token, config: usage, dialog, message }) === false;
        hookAbort ||= await asyncHooksCall("midi-qol.preItemRollV2", { workflow, usage, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preItemRollV2.${this.item.uuid}`, { workflow, usage, dialog, message }) === false;
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

      if (options.checkUse && this.useCondition && this.activation?.type !== "reaction") { // reactions condition evaluation is handled elsewhere
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
      if (!usage.midiOptions?.workflowOptions?.notReaction && options.checkReaction && this.actor?.inCombat) {
        const isTurn = game.combat?.combatant === game.combat?.getCombatantsByActor(this.actor)[0];
        if (["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(this.activation?.type ?? "")
          && (this.activation?.cost ?? 1) > 0) {
          workflow.itemUsesReaction = true;
        }

        if (!isTurn && needsAOOCheck(this.actor) && this.attack && this.activation?.type !== "special") {
          workflow.itemUsesReaction = true;
          workflow.AoO = true;
        }

        const queryReaction = workflow.itemUsesReaction && hasUsedReaction(this.actor) && this.actor.inCombat
          && needsReactionCheck(this.actor)
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
      if (!usage.midiOptions?.workflowOptions?.notBonusAction && options.checkBonusAction && this.actor?.inCombat && needsBonusActionCheck(this.actor)) {
        workflow.itemUsesBonusAction = ["bonus"].includes(this.activation?.type ?? "");
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
        const consumed = workflow.chatCard?.getFlag("dnd5e", "use.consumed");
        if (!foundry.utils.isEmpty(consumed)) {
          await workflow.activity.refund(consumed);
        }
        await workflow.chatCard?.delete()
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

        const token = tokenForActor(this.actor);
        let cancelWorkflow = false;

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
        let allowedTargets: number;
        const hasExplicitCount = this.target?.affects?.count && this.target.affects.count !== "";
        if (hasExplicitCount) {
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
        const rangeDetails = checkActivityRange(this, tokenToUse, workflow.targets, checkMechanic("checkRange") !== "none" && !isAoETargeting)
        if (checkMechanic("checkRange") !== "none" && !isAoETargeting && !isEmanationTargeting && !workflow.AoO && speaker.token) {
          if (tokenToUse && workflow.targets.size > 0) {
            if (rangeDetails.result === "fail")
              return removeWorkflow(workflow);
            else {
              tokenToUse = rangeDetails.attackingToken;
            }
          }
        }


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
        buttons = buttons.filter(b => b.dataset?.action !== "placeTemplate")
      }

      // Add other activity consumption buttons (mirroring dnd5e pattern)
      if (this.otherActivity?.hasConsumption()) {
        buttons.push({
          label: i18n("midi-qol.ConsumeOtherActivityResource"),
          icon: '<i class="fa-solid fa-cubes-stacked" inert></i>',
          dataset: { action: "consumeOtherActivity" }
        }, {
          label: i18n("midi-qol.RefundOtherActivityResource"),
          icon: '<i class="fa-solid fa-clock-rotate-left" inert></i>',
          dataset: { action: "refundOtherActivity" }
        });
      }

      return buttons;
    }

    /**
     * Determine whether a chat button should be hidden based on current state.
     * Mirrors dnd5e's shouldHideChatButton pattern.
     */
    shouldHideChatButton(button: HTMLButtonElement, message: ChatMessage.Implementation): boolean {
      const consumed = message.getFlag(MODULE_ID, "use.consumed");
      switch (button.dataset.action) {
        // Show consume button only when rolled but didn't consume (empty object {})
        // Hide if: cancelled (false), not checked (undefined), or already consumed (non-empty object)
        case "consumeOtherActivity": return !(consumed && foundry.utils.isEmpty(consumed));
        // Show refund button only when actually consumed (non-empty object)
        case "refundOtherActivity": return !consumed || foundry.utils.isEmpty(consumed);
      }
      return super.shouldHideChatButton?.(button, message) ?? false;
    }

    async _placeEmanationTemplate(workflow: Workflow) {
      const autoCreateTemplate = activityHasAutoPlaceTemplate(this);
      const actor = this.item.parent;
      const tokenToUse = workflow.token ?? getToken(actor);
      if (!tokenToUse) return;
      if (autoCreateTemplate) {
        const gs = canvas.dimensions?.distance ?? 5;
        const templateOptions: any = {};
        // square templates don't respect the options distance field
        let item = this;
        let target = this.target ?? { value: 0, template: { size: 0 } };
        const fudge = 0.1;
        const { width, height } = tokenToUse.document;

        templateOptions.distance = Math.ceil(Number(target.template.size) + Math.max((width ?? 1) / 2, (height ?? 1) / 2, 0) * (canvas.dimensions?.distance ?? 0));
        templateOptions.x = tokenToUse.center?.x ?? 0;
        templateOptions.y = tokenToUse.center?.y ?? 0;
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.actorUuid`, actor?.uuid);
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.tokenId`, tokenToUse.id);
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.workflowId`, this.uuid); // TODO look at this when workflow ids are chat card ids
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.itemUuid`, this.item.uuid);

        // @ts-expect-error .canvas
        let templates = game.system.canvas.AbilityTemplate.fromActivity(this, templateOptions) as foundry.canvas.placeables.MeasuredTemplate.Implementation[];
        // fromActivity returns an array of templates - work out if we need more than one
        if (!templates) error("No templates returned from fromActivity");
        let template = templates[0];
        const templateData = template.document.toObject();
        if (this.item) foundry.utils.setProperty(templateData, `flags.${MODULE_ID}.itemUuid`, this.item.uuid);
        if (this.actor) foundry.utils.setProperty(templateData, `flags.${MODULE_ID}.actorUuid`, this.actor.uuid);
        if (!foundry.utils.getProperty(templateData, `flags.dnd5e.origin`)) foundry.utils.setProperty(templateData, `flags.${game.system?.id}.origin`, this.item?.uuid);
        const templateDocuments = await canvas.scene?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);

        if (templateDocuments && templateDocuments.length > 0) {
          let td = templateDocuments[0];
          td.object?.refresh();
          await busyWait(10);
          if (workflow) {
            workflow.templateUuid = td.uuid;
            if (installedModules.get("walledtemplates") && this.flags?.walledtemplates?.attachToken === "caster") {
              // @ts-expect-error walledtemplates types
              await tokenToUse.attachTemplate(td.object, { "flags.dae.stackable": "noneName" }, true);
              if (workflow && !foundry.utils.getProperty(this, "item.flags.walledtemplates.noAutotarget"))
                selectTargets.bind(workflow)(td);
            }
            else if (getActivityAutoTargetAction(this) !== "none") selectTargets.bind(workflow)(td);
          } else selectTargets.bind(this)(td);
          return templates;
        }
      }
    }

    async _usageChatContext(message) {
      // TODO major revisit needed for this
      const workflow = message.workflow as Workflow;
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
        message.workflow?.setTargets(validTargetTokens(new Set(game.user?.targets)));
        foundry.utils.setProperty(message.data, "flags.dnd5e.targets", globalThis.dnd5e.utils.getTargetDescriptors());
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
      let hasEffects = workflow?.workflowType === "BaseWorkflow" && this.effects.some(ae => !ae.effect?.transfer && !ae.effect?.flags?.dae?.dontApply);;
      // if target type is not blank or there are targets only set hasEffects if we are not going to remove the button later
      if (this.target?.affects.type !== "" || workflow?.targets.size !== 0)
        hasEffects &&= !["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects);
      let dmgBtnText = (this.actionType === "heal") ? i18n("DND5E.Healing") : i18n("DND5E.Damage");
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
      const rollSaveOptions = new Set();
      rollSaveOptions.add(configSettings.rollNPCLinkedSaves);
      rollSaveOptions.add(configSettings.rollNPCSaves);
      rollSaveOptions.add(configSettings.playerRollSaves);
      const showSaveButtons = rollSaveOptions.has("none") || rollSaveOptions.has("chat") || configSettings.autoCheckSaves === "none";
      if (this.otherActivity?.save && !this.save && showSaveButtons) {
        context.buttons = context.buttons.concat(this.otherActivity!._usageChatButtons(message));
      } else if (this.otherActivity?.check && !this.check && showSaveButtons) {
        context.buttons = context.buttons.concat(this.otherActivity!._usageChatButtons(message));
      }
      context.buttons = context.buttons?.filter(b => !["rollAttack", "rollDamage", "rollHealing"].includes(b.dataset?.action));
      if (!showSaveButtons) context.buttons = context.buttons?.filter(b => !["rollSave", "rollCheck"].includes(b.dataset?.action));
      if (configSettings.autoCheckSaves !== "none") context.buttons?.forEach(b => { b.isDisabled = ["rollSave", "rollCheck"].includes(b.dataset?.action) ? "disabled" : "" });
      return foundry.utils.mergeObject(context, midiContextData)
    }

    get actionType() { // the default actionType method in dnd5e mixin returns this.metadata.data instead of this.metadata.type
      return this.metadata.type;
    }

    get otherActivity() {
      if (this._otherActivity !== undefined) return this._otherActivity as MidiActivityMixin;
      if (this.otherActivityId === "none" || this.otherActivityId === undefined) return undefined;
      if (this.ammunitionItem) {
        //TODO consider making this a choice of activity
        // @ts-expect-error no dnd5e-types
        this._otherActivity = this.ammunitionItem.system.activities?.find(
          a => a.midiProperties?.automationOnly && a.isOtherActivityCompatible
        ) as MidiActivityMixin | undefined;
        if (!this._otherActivity) {
          // @ts-expect-error no dnd5e-types
          this._otherActivity = this.ammunitionItem.system.activities.find(
            a => a.isOtherActivityCompatible
          ) as MidiActivityMixin | undefined;
        }

        if (this._otherActivity) {
          this._otherActivity.prepareData();
          return this._otherActivity as MidiActivityMixin;
        }
      }

      if (this.otherActivityId !== "") {
        // @ts-expect-error no dnd5e-types
        this._otherActivity = this.item.system.activities.get(this.otherActivityId) as MidiActivityMixin | undefined;
        // @ts-expect-error no dnd5e-types
        if (!this._otherActivity) this._otherActivity = this.item.system.activities.find(a => a.identifier === this.otherActivityId) as MidiActivityMixin | undefined;
        this._otherActivity?.prepareData();
        return this._otherActivity as MidiActivityMixin | undefined;
      }

      if (!this._otherActivity) {
        // Is there exactly 1 automation only and otherActivityCompatible activity on the item
        // @ts-expect-error no dnd5e-types
        const otherActivityOptions = this.item.system.activities.filter(a => a.midiProperties?.automationOnly && a.isOtherActivityCompatible && a.uuid !== this.uuid);
        if (otherActivityOptions.length === 1) {
          this._otherActivity = otherActivityOptions[0];
        }
      }
      if (!this._otherActivity) {
        // Is there exactly 1 other activity compatible activity on the item
        // @ts-expect-error no dnd5e-types
        const otherActivityOptions = this.item.system.activities.filter(a => a.isOtherActivityCompatible && a.uuid !== this.uuid);
        if (otherActivityOptions.length === 1) {
          this._otherActivity = otherActivityOptions[0];
        }
      }
      // If none of the above match we can't tell which one to use.
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
      }
    }
    static #addMacro() {
      const Editor = globalThis.DAE?.DIMEditor;
      if (Editor) new Editor({ document: this.activity }).render({ force: true });
      else ui.notifications?.error("DIMEditor not available - install Dynamic Active Effects");
    }

    static PARTS = {
      ...super.PARTS,
      "midi-qol": {
        template: "modules/midi-qol/templates/activity/parts/midi-activity-tab.hbs",
      }
    }

    _getTabs() {
      let tabs = super._getTabs();
      tabs = {
        ...tabs,
        "midi-qol": {
          id: "midi-qol", group: "sheet", icon: "fa-solid fa-sun", label: "midi-qol"
        }
      }
      return super._markTabs(tabs);
    }

    async _prepareMidiQolContext(context) {
      // context = await super._prepareEffectContext(context);
      context.ConfirmTargetOptions = Object.entries(confirmTargetOptions).map(([value, label]) => ({ value, label }));
      if (this.activity.forcedTargetConfirmation) context.ConfirmTargetOptions = context.ConfirmTargetOptions.filter(o => o.value === this.activity.forcedTargetConfirmation);
      const ROLL_MODES = CONST.DICE_ROLL_MODES;
      context.RollModeOptions = [
        { value: "default", label: i18n("Default") },
        { value: ROLL_MODES.PUBLIC, label: i18n("CHAT.RollPublic") },
        { value: ROLL_MODES.PRIVATE, label: i18n("CHAT.RollPrivate") },
        { value: ROLL_MODES.BLIND, label: i18n("CHAT.RollBlind") },
        { value: ROLL_MODES.SELF, label: i18n("CHAT.RollSelf") }
      ];
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
        }, [{ label: "Auto", value: "" }, { label: "None", value: "none" }]);
      context.otherActivityOptions?.forEach(option => { option.selected = option.value === this.activity.otherActivityId || option.id === this.activity.otherActivityId });
      context.triggeredActivityOptions = this.item.system.activities
        .filter(a => a.id !== this.activity.id && a.isTriggerableActivity)
        .reduce((ret, a) => {
          const identifierString = a.identifier === a.name.slugify() ? "" : ` (${a.identifier})`;
          ret.push({ label: `${a.name}${identifierString}`, value: a.identifier, id: a.id }); return ret
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
        triggeredActivity = await triggeredActivity.getTriggeredActivity();
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
      const AutoCEEffectsOptions = Object.entries(autoCEEffectsOptions).map(([value, label]) => ({ value, label }));
      context.AutoCEEffectsOptions = [{ value: "default", label: i18n("midi-qol.MidiSettings") }, ...AutoCEEffectsOptions];
      const defaultAction = { "default": i18n("midi-qol.MidiSettings") };
      context.AutoTargetActionOptions = Object.entries(foundry.utils.mergeObject(defaultAction, autoTargetOptions)).map(([value, label]) => ({ value, label }));
      context.hasAreaTarget = this.activity.target?.template?.type;
      context.possibleOtherActivity = this.activity.possibleOtherActivity;
      context.turnChoiceOptions = [{ value: "start", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.start") }, { value: "end", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.end") }];
      context.CEActive = installedModules.get("dfreds-convenient-effects");
      return context;
    }

    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      context.hasDamage = this.activity.damage;
      context.isSummons = this.activity.type === "summon";
      context.consumesHP = this.activity.consumption?.targets?.some(t => t.target === "attributes.hp.value");
      if (partId === "midi-qol") {
        context.tab = context.tabs["midi-qol"];
        return this._prepareMidiQolContext(context);
      }
      return context;
    }
  }
}

//TODO find out why this is adding the button but the button won't trigger
function attachActivitySheetHeaderButton(app, buttons) {
  const Editor = globalThis.DAE?.DIMEditor;
  if (!Editor) return;
  let activity = app.activity;
  if (!activity.macro) return;
  const DIMtitle = i18n('dae.DIMEditor.Name');

  buttons.unshift({
    label: DIMtitle,
    class: 'dae-dimeditor',
    icon: 'fas fa-file-pen',
    tooltip: DIMtitle,
    // style: activity.macro?.command ? 'color: #36ba36;' : "",
    onclick: (ev) => { new Editor({ document: app.activity }).render({ force: true }); }
  });
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
  const DIMtitle = i18n('dae.DIMEditor.Name');
  daeButton.setAttribute('class', 'header-control fa-solid fa-file-pen dae-dimeditor');
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
  // TODO - get this working - Hooks.on("getHeaderControlsActivitySheet", attachActivitySheetHeaderButton);

}
