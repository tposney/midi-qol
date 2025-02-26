import { get } from "jquery";
import { GameSystemConfig, MODULE_ID, SystemString, allAttackTypes, debugEnabled, error, geti18nOptions, i18n, i18nFormat, log, warn } from "../../midi-qol.js";
import { socketlibSocket } from "../GMAction.js";
import { DDBGameLogWorkflow, DamageOnlyWorkflow, TrapWorkflow, Workflow } from "../Workflow.js";
import { OnUseMacro, OnUseMacros } from "../apps/Item.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { checkMechanic, configSettings } from "../settings.js";
import { installedModules } from "../setupModules.js";
import { busyWait } from "../tests/setupTest.js";
import { saveUndoData } from "../undo.js";
import { activityHasAreaTarget, asyncHooksCall, canSee, canSense, checkActivityRange, checkIncapacitated, createConditionData, displayDSNForRoll, evalActivationCondition, evalCondition, getAutoRollAttack, getAutoRollDamage, getRemoveAttackButtons, getRemoveDamageButtons, getSpeaker, getStatusName, getToken, activityHasAutoPlaceTemplate, hasUsedBonusAction, hasUsedReaction, initializeVision, isAutoConsumeResource, isInCombat, logIncapacitatedCheckResult, needsBonusActionCheck, needsReactionCheck, processDamageRollBonusFlags, setBonusActionUsed, setReactionUsed, sumRolls, tokenForActor, validTargetTokens, activityHasEmanationNoTemplate, getActivityAutoTargetAction, areMidiKeysPressed, getActor, setRangedTargets, isAutoFastDamage, updateUserTargets, isValidTarget } from "../utils.js";
import { confirmWorkflow, postTemplateConfirmTargets, preTemplateTargets, removeFlanking, selectTargets, setDamageRollMinTerms } from "./activityHelpers.js";
import { MidiCastActivity } from "./CastActivity.js";

export class MidiConditionField extends globalThis.dnd5e.dataModels.fields.FormulaField {
  _validateType(value) {
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

export var MidiActivityMixin = Base => {
  return class MidiActivityMixin extends Base {
    _workflow: Workflow | undefined;
    get workflow() {
      if (!this._workflow) this._workflow = Workflow.getWorkflowByActivityUuid(this.uuid);
      return this._workflow;
    }
    set workflow(value) { this._workflow = value; }

    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.SHARED"];

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField, SetField } = foundry.data.fields;
      const { FormulaField } = globalThis.dnd5e.dataModels.fields;
      const schema = {
        ...super.defineSchema(),
        // flags: new ObjectField(),
        useConditionText: new MidiConditionField({ name: "useCondition", initial: "" }),
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
          ida: new BooleanField({ name: "ida", initial: false })
        }),
        midiProperties: new SchemaField({
          ignoreTraits: new SetField(new StringField(), { initial: [] }),
          triggeredActivityId: new StringField({ name: "triggeredActivity", initial: "none" }),
          //@ts-expect-error
          triggeredActivityConditionText: new MidiConditionField({ name: "triggeredActivityCondition", initial: "" }),
          triggeredActivityTargets: new StringField({ name: "triggeredActivitityTargets", initial: "targets" }),
          triggeredActivityRollAs: new StringField({ name: "triggeredActivityRollAs", initial: "self" }),
          forceDialog: new BooleanField({ name: "forceDialog", initial: false }),
          confirmTargets: new StringField({ name: "confirmTargets", initial: "default" }),
          autoTargetType: new StringField({ name: "autoTargetType", initial: "any" }),
          autoTargetAction: new StringField({ name: "autoTargetAction", initial: "default" }),
          automationOnly: new BooleanField({ name: "automationOnly", initial: false }),
          otherActivityCompatible: new BooleanField({ name: "otherActivityCompatible", initial: true }),
          identifier: new StringField({ name: "identifier", initial: "", required: false }),
          displayActivityName: new BooleanField({ name: "displayActivityName", initial: false }),
          rollMode: new StringField({ name: "rollMode", initial: "default" }),
          chooseEffects: new BooleanField({ name: "chooseEffects", initial: false })
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
      return this.midiProperties.otherActivityCompatible;
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

    getOnUseMacros({ onlyOnUseItemMacros = false } = {}) {
      const onUseMacros = new OnUseMacros();
      this.ammoOnUseMacros = new OnUseMacros();
      const itemOnUseMacros = foundry.utils.getProperty(this.item ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
      const ammoOnUseMacros = foundry.utils.getProperty(this.ammo ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
      const actorOnUseMacros = foundry.utils.getProperty(this.actor ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
      if (onlyOnUseItemMacros) {
        onUseMacros.items = [...itemOnUseMacros.items];
      } else {
        onUseMacros.items = [...itemOnUseMacros.items, ...actorOnUseMacros.items];
      }
      this.ammoOnUseMacros.items = ammoOnUseMacros.items;
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
      // foundry.utils.setProperty(baseFlags, "roll.type", "midi");
      const targets = new Map();
      if (this.targets) {
        for (const token of this.targets) {
          const { name } = token;
          const { img, system, uuid } = token.actor ?? {};
          if (uuid) targets.set(uuid, { name, img, uuid, ac: system?.attributes?.ac?.value });
        }
        baseFlags.targets = Array.from(targets.values());
        // foundry.utils.setProperty(baseFlags, "roll.type", "usage");
      }
      return baseFlags;
    }
    async getTriggeredActivity() {
      let activity = this.item.system.activities.find(a => a.id === this.midiProperties?.triggeredActivityId);
      if (!activity) activity = await fromUuid(this.midiProperties?.triggeredActivityId);
      return activity;
    }

    get triggeredActivityX() {
      let activity = this.item.system.activities.find(a => a.id === this.midiProperties?.triggeredActivityId);
      if (!activity) return activity;
      activity = fromUuidSync(this.midiProperties?.triggeredActivityId);
      return activity
    }

    static metadata = foundry.utils.mergeObject(
      super.metadata, {
      usage: {
        dialog: MidiActivityUsageDialog,
        actions: {
          rollDamageNoCritical: MidiActivityMixin.#rollDamageNoCritical,
          rollDamageCritical: MidiActivityMixin.#rollDamgeCritical,
          confirmDamageRollCancel: MidiActivityMixin.#confirmDamageRollCancel,
          confirmDamageRollComplete: MidiActivityMixin.#confirmDamageRollComplete,
          confirmDamageRollCompleteHit: MidiActivityMixin.#confirmDamageRollCompleteHit,
          confirmDamageRollCompleteMiss: MidiActivityMixin.#confirmDamageRollCompleteMiss,
          midiApplyEffects: MidiActivityMixin.#applyEffects,
        }
      },
    }, { inplace: false, insertValues: true, insertKeys: true });

    static async #applyEffects(event, target, message) {
      const workflow = this.workflow;
      const authorId = message.author.id;
      if (!workflow) return;
      if ((workflow.targets?.size ?? 0) === 0) return;
      if (game.user?.id !== authorId) {
        // applying effects on behalf of another user;
        if (!game.user?.isGM) {
          ui.notifications?.warn("Only the GM can apply effects for other players")
          return;
        }
        if (game.user?.targets.size === 0) {
          ui.notifications?.warn(i18n("midi-qol.noTokens"));
          return;
        }
        const result = (await socketlibSocket.executeAsUser("applyEffects", authorId, {
          workflowId: this.uuid,
          targets: Array.from(game.user?.targets).map(t => t.document.uuid)
        }));
      } else {
        if (workflow) {
          workflow.forceApplyEffects = true; // don't overwrite the application targets
          workflow.effectTargets = game.user?.targets;
          if (workflow.effectTargets.size > 0) workflow.performState(workflow.WorkflowState_ApplyDynamicEffects)
        } else {
          ui.notifications?.warn(i18nFormat("midi-qol.NoWorkflow", { itemName: this.item?.name }));
        }
      }
    }
    static async #confirmDamageRollCancel(event, target, message) {
      const authorId = message.author.id;
      if (!authorId) return;
      if (!game.user?.isGM && configSettings.confirmAttackDamage === "gmOnly") {
        return;
      }
      const user = game.users?.get(authorId);
      if (user?.active) {

        await socketlibSocket.executeAsUser("cancelWorkflow", authorId, { workflowId: this?.uuid, itemCardId: message.id, itemCardUuid: message.uuid }).then(result => {
          if (typeof result === "string") ui.notifications?.warn(result);
        });
      } else {
        await Workflow.removeItemCardAttackDamageButtons(message.id);
        await Workflow.removeItemCardConfirmRollButton(message.id);
      }
    }

    static async #confirmDamageRollComplete(event, target, message) {
      await this.doConfirmation("confirmDamageRollComplete", event, target, message);
    }
    static async #confirmDamageRollCompleteHit(event, target, message) {
      await this.doConfirmation("confirmDamageRollCompleteHit", event, target, message);
    }
    static async #confirmDamageRollCompleteMiss(event, target, message) {
      await this.doConfirmation("confirmDamageRollCompleteMiss", event, target, message);
    }
    async doConfirmation(actionToCall, event, target, message) {
      if (!game.user?.isGM && configSettings.confirmAttackDamage === "gmOnly") {
        return;
      }
      if (message.author.active) {
        const result = await socketlibSocket.executeAsUser(actionToCall, message.author.id, { activityUuid: this.uuid, itemCardId: message.id, itemCardUuid: message.uuid });
        if (typeof result === "string") ui.notifications?.warn(result);
      } else {
        await Workflow.removeItemCardAttackDamageButtons(message.id);
        await Workflow.removeItemCardConfirmRollButton(message.id);
      }
    }
    static #rollDamageNoCritical(event, target, message) {
      return this.rollDamage({ event, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
    }

    static #rollDamgeCritical(event, target, message) {
      return this.rollDamage({ event, midiOptions: { isCritical: true } }, {}, message);
    }

    get identifier() {
      if (this.midiProperties.identifier) return this.midiProperties.identifier;
      return this.name.slugify();
    }

    prepareData() {
      //@ts-expect-error
      if (!this.midiProperties.identifier && !this.name) this.midiProperties.identifier = i18n(this.constructor.metadata.dnd5eTitle).slugify();
      super.prepareData();
    }

    async useAs(actor, config: any = {}, dialog: any = {}, message: any = {}) {
      // itemData._id = this.item._id;
      actor = getActor(config.midiOptions.rollAs);
      delete config.midiOptions.rollAs;
      if (!actor || actor === this.actor || this.selfOnlyTriggerActivity) return this.use(config, dialog, message);
      const itemData = this.item.toObject();
      delete itemData._id;
      let item = new CONFIG.Item.documentClass(itemData, { parent: actor });
      actor.sourcedItems
      item.prepareData();
      //@ts-expect-error no dnd5e-types
      item.prepareFinalAttributes(); // Since actor prepareData is not being called need to do this here
      // @ts-expect-error no dnd5e-types
      const activity = item.system.activities.get(this.id);
      return activity.use(config, dialog, message);
    }

    async use(config: any = {}, dialog: any = {}, message: any = {}) {
      if (config.midiOptions?.rollAs) return this.useAs(config.midiOptions.rollAs, config, dialog, message);
      if (!this.item.isEmbedded) return;
      if (!this.item.isOwner) {
        ui.notifications?.error("DND5E.DocumentUseWarn", { localize: true });
      }
      if (!this.canUse) {
        ui.notifications?.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
        return;
      }
      if (debugEnabled > 0) warn("MidiQOL | MidiActivity | use | Called", config, dialog, message);
      let item = this.item.clone({ parent: this.actor }, { keepId: true });
      let activity = item.system.activities.get(this.id);
      if (config.midiOptions.workflow) activity.workflow = config.midiOptions.workflow;
      else {
        let workflowClass = config?.midi?.workflowClass ?? globalThis.MidiQOL.workflowClass;
        if (!(workflowClass.prototype instanceof Workflow)) workflowClass = Workflow;
        activity.workflow = new workflowClass(activity.actor, activity, ChatMessage.getSpeaker({ actor: activity.item.actor }), activity.targets, { ...config.midiOptions, event: config.event, storeWorkflow: false });
      }
      if ((activity.midiProperties.rollMode ?? "default") !== "default") message.rollMode = activity.midiProperties.rollMode;
      await removeFlanking(item.parent);
      config.midiOptions ??= {};
      config.midiOptions.workflowOptions ??= {};
      // config.midiOptions.workflowOptions.targetConfirmation ??= this.forcedTargetConfirmation;
      if (config.systemCard) return super.use(config, dialog, message);
      // come back and see about re-rolling etc.

      if (!activity.workflow) return undefined;

      // activity.workflow.options won't be other than the default yet
      if (config.midiOptions.isCritical) activity.workflow.isCritical = true;
      if (config.midiOptions.isFumble) activity.workflow.isFumble = true;
      const autoCreateTemplate = activityHasAutoPlaceTemplate(activity);
      const emanationNoTemplate = activityHasEmanationNoTemplate(activity);
      if (autoCreateTemplate || emanationNoTemplate) {
        config.create ??= {};
        config.create.measuredTemplate = false;
      }
      if (!await activity.setupTargets(config, dialog, message)) return;
      activity.workflow.setTargets(activity.targets);
      const extraWorkflowData = await activity.confirmCanProceed(config, dialog, message);
      if (!extraWorkflowData) return;
      foundry.utils.setProperty(message, "data.flags.midi-qol.messageType", "attack");
      if (config.midiOptions?.configureDialog === false) dialog.configure = false;
      const rollToggle = areMidiKeysPressed(config.event, "RollToggle");
      activity.workflow.rollOptions.rollToggle = rollToggle;
      activity.checkAutoConsume(config, dialog, message, rollToggle);
      // if (rollToggle) dialog.configure = !dialog.configure; Should this always be looked at
      // Synthetic items don't have an _id so setup for them to be recovered from the chat card
      if (!activity.item._id) foundry.utils.setProperty(message, "data.flags.dnd5e.item.data", activity.item.toObject());
      // Since core activity.use creates a clone of the item and then fetches that activity.
      message.workflow = activity.workflow;
      let results;
      const preUseActivityHookId = Hooks.once("dnd5e.preUseActivity", (newActivity, usageConfig, messageConfig) => {
        newActivity.workflow = activity.workflow;
        return true;
      });
      try {
      results = await super.use.bind(activity)(config, dialog, message);
      } finally {
        Hooks.off("dnd5e.preUseActivity", preUseActivityHookId);
      }
      if (!results) return;
      if (autoCreateTemplate || emanationNoTemplate) if (!await activity.setupTargets(config, dialog, message)) return;
      activity.workflow.noAutoDamage = config.midiOptions.systemCard;
      activity.workflow.noAutoAttack = config.midiOptions.systemCard;
      activity.workflow.setTargets(activity.targets); // Allow for targets set by emanation
      if (activity.templates) { // TODO find a better place to store this
        results.templates = activity.templates;
        delete activity.templates;
      }
      if (configSettings.undoWorkflow) await saveUndoData(activity.workflow);

      activity.workflow.itemUseComplete = true;
      activity.workflow.needItemCard = false;
      if (!results) { // activity use was aborted
        activity.removeWorkflow();
        return undefined;
      }
      activity.workflow._id = results.message.uuid;
      Workflow.addWorkflow(activity.workflow);
      activity.workflow.itemCardUuid = results.message.uuid;

      activity.workflow.itemCardId = results.message.id;
      if (activity.consumption?.spellSlot) {
        activity.workflow.castData = {
          baseLevel: activity.item.system.level,
          castLevel: activity.workflow.spellLevel,
          itemUuid: activity.workflow.itemUuid
        };
      }
      const scaling = results.message?.getFlag && (results.message?.getFlag("dnd5e", "scaling") ?? 0);
      if (scaling) {
        const item = activity.item.clone({ "flags.dnd5e.scaling": scaling }, { keepId: true });
        activity.workflow.activity = item.system.activities.get(activity.id);
        activity.workflow.activity.workflow = activity.workflow;
      }
      activity.midiOptions = config.midiOptions;
      await activity.workflow.performState(activity.workflow.WorkflowState_Start, {});
      return results;
    }

    checkAutoConsume(config, dialog, message, rollToggle) {
      if (dialog.configure === false) return;
      if (this.isSpell && ["both", "spell"].includes(isAutoConsumeResource(this.workflow))) {
        dialog.configure = false;
        // Check that there is a spell slot of the right level
        const spells = this.actor.system.spells;
        // Come back and check for spell level in activities
        if (spells[`spell${this.item.system.level}`]?.value === 0 &&
          (spells.pact.value === 0 || spells.pact.level < this.item.system.level)) {
          dialog.configure = true;
        }

        if (!dialog.configure && this.hasAreaTarget && this.actor?.sheet) {
          setTimeout(() => {
            this.actor?.sheet.minimize();
          }, 100)
        }
      } else dialog.configure = !(["both", "item"].includes(isAutoConsumeResource(this.workflow)));
      if (isAutoConsumeResource(this.workflow) !== "none" && rollToggle) dialog.configure = true;
    }

    async rollDamage(config: any, dialog: any = {}, message: any = {}) {
      if (!config.midiOptions) config.midiOptions = {};
      if (debugEnabled > 0) {
        warn("MidiActivity | rollDamage | Called", config, dialog, message);
      }
      let result: Roll[] | undefined;
      let otherResult: Roll[] | undefined;
      let preRollDamageHookId;
      let rollDamageHookId;
      config.midiOptions ??= this.midiOptions.rollOptions ?? this.workflow?.midiOptions ?? {};
      try {
        if (await asyncHooksCall("midi-qol.preDamageRoll", this.workflow, this, config, dialog, message) === false
          || await asyncHooksCall(`midi-qol.preDamageRoll.${this.item.uuid}`, this.workflow, this, config, dialog, message) === false
          || await asyncHooksCall(`midi-qol.preDamageRoll.${this.uuid}`, this.workflow, this, config, dialog, message) === false) {
          console.warn("midi-qol | Damage roll blocked via pre-hook");
          return;
        }
        //@ts-expect-error
        const areKeysPressed = game.system.utils.areKeysPressed;
        const keys = {
          normal: areKeysPressed(config.event, "skipDialogNormal")
            || areKeysPressed(config.event, "skipDialogDisadvantage"),
          critical: areKeysPressed(config.event, "skipDialogAdvantage")
        };

        config.midiOptions.isCritical ||= this.workflow?.isCritical;
        config.midiOptions.fastForwardDamage ??= isAutoFastDamage(this.workflow);
        if (this.hasDamage || this.hasHealing) {
          if (Object.values(keys).some(k => k)) dialog.configure = !!this.midiProperties.forceDialog;
          else dialog.configure ??= !config.midiOptions?.fastForwardDamage || !!this.midiProperties.forceDialog;
          if (this.workflow && areMidiKeysPressed(config.event, "RollToggle")) this.workflow.rollOptions.rollToggle = true;
          if (this.workflow?.rollOptions?.rollToggle) dialog.configure = !dialog.configure;
          // if (dialog.configure) config.midiOptions.isCritical = false;
          preRollDamageHookId = Hooks.once(`${game.system?.id}.preRollDamageV2`, (rollConfig, dialogConfig, messageConfig) => {
            if (keys.critical) rollConfig.isCritical = true;
            else if (keys.normal) rollConfig.isCritical = false;
            else if (!dialogConfig.configure) rollConfig.isCritical ||= rollConfig.midiOptions.isCritical;
            if (dialogConfig.configure) {
              if (rollConfig.isCritical || rollConfig.midiOptions.isCritical) {
                dialogConfig.options.defaultButton = "critical";
              } else dialogConfig.options.defaultButton = "normal";
            } return true;
          });
          rollDamageHookId = Hooks.once(`${game.system?.id}.rollDamageV2`, rolls => {
            if (rolls[0] && this.workflow && config.midiOptions.updateWorkflow !== false) this.workflow.isCritical = rolls[0].options.isCritical;
          });
          message.create ??= false;
          if (this.damage?.parts.some(part => part.types.size > 1)) dialog.configure = true;
          if (this.healing?.types?.size > 1) dialog.configure = true;
          result = await super.rollDamage(config, dialog, message) ?? [];
          if (result) result = await this.postProcessDamageRoll(config, result);
          if (this.workflow && config.midiOptions.updateWorkflow !== false) await this.workflow.setDamageRolls(result);
        }
        if (this.otherActivity && this.workflow?.otherActivity !== this) {
          let shouldRollOther = true;
          if (this.otherCondition && this.workflow) {
            shouldRollOther = false;
            for (let token of this.workflow.hitTargets) {
              shouldRollOther ||= await evalActivationCondition(this.workflow, this.otherCondition, token, { async: true })
              if (shouldRollOther) break;
            }
          }
          if (shouldRollOther && (this.otherActivity.hasDamage || this.otherActivity.hasHealing || this.otherActivity.roll?.formula)) {
            this.otherActivity.workflow = this.workflow;
            // Check conditions & flags
            const otherConfig = foundry.utils.deepClone(config);
            otherConfig.midiOptions.fastForward = config.midiOptions.fastForwardDamage;
            otherConfig.midiOptions.updateWorkflow = false; // rollFormula will try and restart the workflow
            // Undo the roll toggle since rollFormula will look at it as well
            if (this.workflow?.rollOptions?.rollToggle) dialog.configure = !dialog.configure;
            if (this.otherActivity?.hasDamage)
              otherResult = await this.otherActivity.rollDamage(otherConfig, dialog, { create: false });
            else if (this.otherActivity?.roll?.formula) {
              otherResult = await this.otherActivity.rollFormula(otherConfig, dialog, { create: false });
              if (otherResult) {
                if (!(otherResult instanceof Array)) otherResult = [otherResult];
                otherResult = otherResult.map(roll =>
                  //@ts-expect-error
                  new game.system.dice.DamageRoll(roll.formula, {}, {})
                );
              }
            }
            if (otherResult && config.midiOptions.updateWorkflow !== false && this.workflow) await this.workflow.setOtherDamageRolls(otherResult);
          }
        }
        if (config.midiOptions.updateWorkflow !== false && this.workflow?.suspended) this.workflow.unSuspend.bind(this.workflow)({ damageRoll: result, otherDamageRoll: otherResult });
      } catch (err) {
        const message = "doDamageRoll error";
        TroubleShooter.recordError(err, message);
        error(message, err);
      } finally {
        if (preRollDamageHookId) Hooks.off(`${game.system?.id}.preRollDamageV2`, preRollDamageHookId);
        if (rollDamageHookId) Hooks.off(`${game.system?.id}.rollDamageV2`, rollDamageHookId);
      }
      return result ?? [];
    }

    configureDamageRoll(config): void {
      const worklflow = this.workflow;
      //@ts-expect-error
      const DamageRoll = CONFIG.Dice.DamageRoll;
      try {
        let workflow = this.workflow;
        if (!workflow) return config;

        if (workflow && config.midiOptions.systemCard) workflow.systemCard = true;
        if (workflow.workflowType === "TrapWorkflow") workflow.rollOptions.fastForward = true;

        const midiFlags = workflow.actor.flags[MODULE_ID]
        if (workflow.currentAction !== workflow.WorkflowStaate_WaitForDamageRoll && workflow.noAutoAttack) {
          // TODO NW check this allow damage roll to go ahead if it's an ordinary roll
          workflow.currentAction = workflow.WorkflowState_WaitForDamageRoll;
        }

        if (workflow.currentAction !== workflow.WorkflowState_WaitForDamageRoll) {
          if (workflow.currentAction === workflow.WorkflowState_AwaitTemplate)
            return ui.notifications?.warn(i18n("midi-qol.noTemplateSeen")) as void;
          else if (workflow.currentAction === workflow.WorkflowState_WaitForAttackRoll)
            return ui.notifications?.warn(i18n("midi-qol.noAttackRoll")) as void;
        }

        // TODO revisit this to see if it is still possoible to just re-roll the damage
        if (workflow && (workflow.damageRollCount ?? 0) > 0) { // we are re-rolling the damage. redisplay the item card but remove the damage if the roll was finished
          workflow.displayChatCardWithoutDamageDetail();
        };

        // Allow overrides form the caller
        if (workflow && config.midiOptions.spellLevel) workflow.rollOptions.spellLevel = config.midiOptions.spellLevel;
        if (workflow && config.midiOptions.powerLevel) workflow.rollOptions.spellLevel = config.midiOptions.powerLevel;
        if (workflow && (workflow.isVersatile || config.midiOptions.versatile)) workflow.rollOptions.versatile = true;
        if (debugEnabled > 0) warn("rolling damage  ", this.name, this);

        if (workflow && config.midiOptions?.isCritical !== undefined)
          workflow.isCritical = config.midiOptions?.isCritical;
        config.midiOptions.fastForwardDamage = config.midiOptions.fastForwardDamage ?? workflow.workflowOptions?.fastForwardDamage ?? workflow.rollOptions.fastForwardDamage;

        if (workflow) workflow.damageRollCount += 1;
      } catch (err) {
        const message = "Configure Damage Roll error";
        TroubleShooter.recordError(err, message);
        error(message, err);
      }
    }

    getDamageConfig(config: any = {}) {
      config.attackMode = this.workflow?.attackMode;
      config.ammunition = this.actor.items.get(this.workflow?.ammunition);
      const rollConfig = super.getDamageConfig(config);
      this.configureDamageRoll(rollConfig);
      for (let roll of rollConfig.rolls) {
        if (rollConfig.ammunition) { // add ammunition properties to the damage roll
          let rollProperties = new Set(roll.options.properties);
          const ammunitionProperties = rollConfig.ammunition.system.properties;
          //@ts-ignore silly vscode thinks union does not exist
          roll.options.properties = Array.from(rollProperties.union(ammunitionProperties));
        }
        // critical/fumble will be inserted when roll.build is called.
      }
      return rollConfig;
    }

    async postProcessDamageRoll(config, result: Array<Roll>): Promise<Array<Roll>> {
      let result2: Array<Roll> = [];
      //@ts-expect-error
      const DamageRoll = CONFIG.Dice.DamageRoll;
      try {
        if (!this.workflow) return result;

        let magicalDamage = this.item?.system.properties?.has("mgc") || this.item?.flags?.midiProperties?.magicdam;
        magicalDamage ||= config.ammunition?.system.properties.has("mgc") || config.ammunition?.flags?.midiProperties?.magicdam;
        magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && this.attackBonus > 0);
        magicalDamage ||= configSettings.requireMagical === "off" && config.ammunition?.attackBonus > 0;
        magicalDamage = magicalDamage || (configSettings.requireMagical === "off" && (this.attack?.type.classification ?? "none") !== "weapon");
        magicalDamage = magicalDamage || (configSettings.requireMagical === "nonspell" && this.isSpell);

        if (result?.length > 0) {
          result.forEach(roll => {
            const droll: any = roll;
            if (!droll.options.properties) droll.options.properties = [];
            if (this.isSpell) droll.options.properties.push("spell");
            if (magicalDamage && !droll.options.properties.includes("mgc")) droll.options.properties.push("mgc");
            droll.options.properties.push(this.actionType)
          })
        }
        const firstTarget = this.workflow.hitTargets.first() ?? this.workflow.targets?.first() as (Token | TokenDocument);
        const firstTargetActor: Actor = firstTarget?.actor as Actor;
        const targetMaxFlags = foundry.utils.getProperty(firstTargetActor, `flags.${MODULE_ID}.grants.max.damage`) ?? {};
        const maxFlags = foundry.utils.getProperty(this.workflow, `actor.flags.${MODULE_ID}.max`) ?? {};
        let needsMaxDamage = (maxFlags.damage?.all && await evalActivationCondition(this.workflow, maxFlags.damage.all, firstTarget, { async: true, errorReturn: false }))
          || (maxFlags.damage && maxFlags.damage[this.actionType] && await evalActivationCondition(this.workflow, maxFlags.damage[this.actionType], firstTarget, { async: true, errorReturn: false }));
        needsMaxDamage = needsMaxDamage || (
          (targetMaxFlags.all && await evalActivationCondition(this.workflow, targetMaxFlags.all, firstTarget, { async: true, errorReturn: false }))
          || (targetMaxFlags[this.actionType] && await evalActivationCondition(this.workflow, targetMaxFlags[this.actionType], firstTarget, { async: true, errorReturn: false })));
        const targetMinFlags = foundry.utils.getProperty(firstTargetActor, `flags.${MODULE_ID}.grants.min.damage`) ?? {};
        const minFlags = foundry.utils.getProperty(this.workflow, `actor.flags.${MODULE_ID}.min`) ?? {};
        let needsMinDamage = (minFlags.damage?.all && await evalActivationCondition(this.workflow, minFlags.damage.all, firstTarget, { async: true, errorReturn: false }))
          || (minFlags?.damage && minFlags.damage[this.actionType] && await evalActivationCondition(this.workflow, minFlags.damage[this.actionType], firstTarget, { async: true, errorReturn: false }));
        needsMinDamage = needsMinDamage || (
          (targetMinFlags.damage && await evalActivationCondition(this.workflow, targetMinFlags.all, firstTarget, { async: true, errorReturn: false }))
          || (targetMinFlags[this.actionType] && await evalActivationCondition(this.workflow, targetMinFlags[this.actionType], firstTarget, { async: true, errorReturn: false })));
        if (needsMaxDamage && needsMinDamage) {
          needsMaxDamage = false;
          needsMinDamage = false;
        }

        let actionFlavor;
        switch (game.system?.id) {
          case "sw5e":
            actionFlavor = i18n(this.actionType === "heal" ? "SW5E.Healing" : "SW5E.DamageRoll");
            break;
          case "n5e":
            actionFlavor = i18n(this.actionType === "heal" ? "N5E.Healing" : "N5E.DamageRoll");
            break;
          case "dnd5e":
          default:
            actionFlavor = i18n(this.actionType === "heal" ? "DND5E.Healing" : "DND5E.DamageRoll");
        }

        const title = `${this.name}`;
        const speaker = getSpeaker(this.actor);
        let flavor = title;
        if (this.item.labels.damages?.length > 0) {
          flavor = `${title} (${this.item.labels.damages.map(d => d.damageType)})`;
        }
        let messageData = foundry.utils.mergeObject({
          title,
          flavor,
          speaker,
        }, { "flags.dnd5e.roll": { type: "damage", itemId: this.item.id, itemUuid: this.item.uuid } });
        if (game.system?.id === "sw5e") foundry.utils.setProperty(messageData, "flags.sw5e.roll", { type: "damage", itemId: this.item.id, itemUuid: this.item.uuid })
        if (needsMaxDamage) {
          for (let i = 0; i < result.length; i++) {
            result[i] = await result[i].reroll({ maximize: true });
          }
        } else if (needsMinDamage) {
          for (let i = 0; i < result.length; i++) {
            result[i] = await result[i].reroll({ minimize: true });
          }
        } else if (foundry.utils.getProperty(this, `actor.flags.${MODULE_ID}.damage.reroll-kh`) || foundry.utils.getProperty(this, `actor.flags.${MODULE_ID}.damage.reroll-kl`)) {
          let result2: Roll[] = [];
          for (let i = 0; i < result.length; i++) {
            result2.push(await result[i].reroll());
          }
          if ((foundry.utils.getProperty(this, `actor.flags.${MODULE_ID}.damage.reroll-kh`) && (sumRolls(result2) > sumRolls(result)))
            || (foundry.utils.getProperty(this, `actor.flags.${MODULE_ID}.damage.reroll-kl`) && (sumRolls(result2) < sumRolls(result)))) {
            [result, result2] = [result2, result];
          }
          // display roll not being used.
          if (this.workflow.workflowOptions?.damageRollDSN !== false) {
            let promises = result2.map(r => displayDSNForRoll(r, "damageRoll"));
            await Promise.all(promises);
          }
          await DamageRoll.toMessage(result2, messageData, { rollMode: game.settings?.get("core", "rollMode") });
          // await result2.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
        } else if (foundry.utils.getProperty(this, `actor.flags.${MODULE_ID}.damage.advantage`)) {
          // To do this properly requires rerolling each term in the damage roll
        }
        setDamageRollMinTerms(result)

        if (this.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(this.workflow.defaultDamageType ?? "")) this.workflow.defaultDamageType = "healing";
        if (this.workflow?.workflowOptions?.damageRollDSN !== false) {
          let promises = result.map(r => displayDSNForRoll(r, "damageRoll"));
          await Promise.all(promises);
        }
        result = await processDamageRollBonusFlags.bind(this.workflow)(result);
        return result;
      } catch (err) {
        const message = `doDamageRoll error for item ${this?.name} ${this.uuid}`;
        TroubleShooter.recordError(err, message);
        throw err;
      }
    }

    async setupTargets(config, dialog, message): Promise<boolean> {
      if (config.midiOptions?.targetsToUse?.size > 0 && !activityHasAreaTarget(this)) {
        this.targets = config.midiOptions.targetsToUse;
      } else {
        if (((this.target?.affects.type ?? "") !== "") || configSettings.enforceSingleWeaponTarget) {
          if (!(await preTemplateTargets(this, config.midiOptions)))
            return false;
          // TODO clean this up
          // if ((dialog.targets?.size ?? 0) === 0 && game.user?.targets) dialog.targets = game.user?.targets;
        }
        // Setup targets.
        let selfTarget = this.target?.affects.type === "self";
        if (this.item.type === "tool" && !this.target?.affects.type)
          selfTarget = true;
        if (!selfTarget) {
          this.targets = validTargetTokens(game.user?.targets);
        } else { // There is no token for the actor on the scene - create a temp target for this
          foundry.utils.setProperty(config, "workflowOptions.targetConfirmation", "none");
          let potentialTarget: Token | TokenDocument | undefined = tokenForActor(this.actor);
          if (!potentialTarget) {
            potentialTarget = new config.Token.documentClass(await this.actor.getTokenDocument({ hidden: true }, { parent: canvas?.scene }) as TokenDocument);
          }
          this.targets = new Set();
          if (potentialTarget) this.targets.add(potentialTarget);
        }
      }
      // remove selection of un-targetable targets TODO
      if (canvas?.scene) {
        const tokensIdsToUse: Array<string> = this.targets ? Array.from(this.targets).filter(t => isValidTarget(t)).map(t => (t as Token).id) : [];
        updateUserTargets(tokensIdsToUse);
      }
      if (this.workflow) this.workflow.setTargets(this.targets);
      return true;
    }

    async confirmTargets(): Promise<void> {
      this.targets = game.user?.targets;
    }

    removeWorkflow() {
      if (this.workflow) Workflow.removeWorkflow(this.workflow.id);
      this.workflow = undefined;
      return false;
    }

    // Part of the activity.use refactor
    async confirmWorkflowChecks(workflow, config, dialog, message) {
      const tokenToUse = getToken(this.actor);
      let cancelWorkflow = false;
      if (this.useCondition && this.activation.type !== "reaction") { // reactions condition evaluation is handled elsewhere
        if (!(await evalActivationCondition({ actor: this.actor }, this.useCondition, this.targets.first(), { async: true }))) {
          ui.notifications?.warn("You are unable to use the item");
          workflow.aborted = true;
          await workflow.performState(workflow.WorkflowState_Abort)
          return false;
        }
      }
      if (configSettings.allowUseMacro) {
        const results = await workflow.callMacros(this.item, workflow.onUseMacros?.getMacros("preTargeting"), "OnUse", "preTargeting");
        if (workflow.aborted || results.some(i => i === false)) {
          console.warn("midi-qol | item roll blocked by preTargeting macro");
          workflow.aborted = true;
          await workflow.performState(workflow.WorkflowState_Abort)
          return false;
        }
      }
      if (cancelWorkflow) return this.removeWorkflow();
      if (game.user?.targets && tokenToUse) for (let target of game.user?.targets) {
        const tokenCanSense = tokenToUse ? canSense(tokenToUse, target, globalThis.MidiQOL.InvisibleDisadvantageVisionModes) : true;
        const targetCanSense = tokenToUse ? canSense(target, tokenToUse, globalThis.MidiQOL.InvisibleDisadvantageVisionModes) : true;
        if (targetCanSense) workflow.targetsCanSense.add(tokenToUse);
        else workflow.targetsCanSense.delete(tokenToUse);
        if (tokenCanSense) workflow.tokenCanSense.add(target);
        else workflow.tokenCanSense.delete(target);
        const tokenCanSee = tokenToUse ? canSee(tokenToUse, target) : true;
        const targetCanSee = tokenToUse ? canSee(target, tokenToUse) : true;
        if (targetCanSee) workflow.targetsCanSee.add(tokenToUse);
        else workflow.targetsCanSee.delete(tokenToUse);
        if (tokenCanSee) workflow.tokenCanSee.add(target);
        else workflow.tokenCanSee.delete(target);
      }
      workflow.processAttackEventOptions();
      await workflow.checkAttackAdvantage();
      return true;
    }

    //part of the activity.use refactor
    async confirmCanProceedNew(config, dialog, message): Promise<boolean> {
      if (debugEnabled > 0)
        warn("MidiQOL | confirmCanProceed | Called", this);
      try {
        if (!config.midiOptions?.workflowOptions?.allowIncapacitated && checkMechanic("incapacitated") !== "nothing") {
          const condition = checkIncapacitated(this.actor, true, false);
          if (condition) {
            logIncapacitatedCheckResult(this.actor.name, condition, debugEnabled > 0, true);
            if (checkMechanic("incapacitated") === "enforce") return false;
          }
        }
        let isEmanationTargeting = activityHasAutoPlaceTemplate(this) || activityHasEmanationNoTemplate(this);
        let isAoETargeting = !isEmanationTargeting && activityHasAreaTarget(this);
        let selfTarget = this.target?.affects.type === "self";
        const inCombat = isInCombat(this.actor);
        const requiresTargets = configSettings.requiresTargets === "always" || (configSettings.requiresTargets === "combat" && inCombat);
        let speaker = getSpeaker(this.actor);

        // Call preTargeting hook/onUse macro. Create a dummy workflow if one does not already exist for the item
        const token = tokenForActor(this.actor);
        let cancelUse = await asyncHooksCall("midi-qol.preTargeting", { activity: this, token, config, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargeting.${this.item.uuid}`, { activity: this, token, config, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargeting.${this.uuid}`, { activity: this, token, config, dialog, message }) === false;
        if (cancelUse) return false;
        // Do we need some targets selected before proceeding
        /*        let shouldAllowRoll = !requiresTargets // we don't care about targets
                  || (this.targets.size > 0) // there are some target selected
                  || (this.target?.affects.type ?? "") === "" // no target required
                  || selfTarget
                  || isAoETargeting // area effect spell and we will auto target
                  || isEmanationTargeting // range target and will autotarget
                  || (!this.attack && !this.hasDamage && !this.hasSave); // does not do anything - need to chck dynamic effects
        */
        // only allow attacks against at most the specified number of targets
        let allowedTargets;
        if (this.target?.affects.type === "creature" && this.target?.affects.count === "") //dnd5e 3.2
          allowedTargets = 9999;
        else
          allowedTargets = (this.target?.affects.type === "creature" ? this.target?.affects.count : 9999) ?? 9999;
        if (requiresTargets && configSettings.enforceSingleWeaponTarget && allAttackTypes.includes(this.actionType) && allowedTargets === 9999) {
          allowedTargets = 1;
          if (requiresTargets && this.targets.size !== 1) {
            ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
            if (debugEnabled > 0) warn(`${game.user?.name} ${i18nFormat(`midi-qol.${MODULE_ID}.wrongNumberTargets`, { allowedTargets })}`)
            return false;
          }
        }

        if (requiresTargets && !isEmanationTargeting && !isAoETargeting && this.target?.affects.type === "creature" && this.targets.size === 0) {
          ui.notifications?.warn(i18n("midi-qol.noTargets"));
          if (debugEnabled > 0) warn(`${game.user?.name} attempted to roll with no targets selected`)
          return false;
        }

        let AoO = false;
        let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id)
        const isTurn = activeCombatants?.includes(speaker.token);

        const checkReactionAOO = configSettings.recordAOO === "all" || (configSettings.recordAOO === this.actor.type)
        let thisUsesReaction = false;
        const hasReaction = hasUsedReaction(this.actor);
        if (!config.midiOptions.workflowOptions?.notReaction && ["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(this.activation?.type) && (this.activation?.cost ?? 1) > 0) {
          thisUsesReaction = true;
        }
        if (!config.midiOptions.workflowOptions?.notReaction && checkReactionAOO && !thisUsesReaction) {
          let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id)
          const isTurn = activeCombatants?.includes(speaker.token)
          if (!isTurn && inCombat && ["action", "crew"].includes(this.activation?.type)) {
            thisUsesReaction = true;
            AoO = true;
          }
        }

        // do pre roll checks
        if ((game.system?.id === "dnd5e" || game.system?.id === "n5e") && requiresTargets && this.targets.size > allowedTargets) {
          ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
          if (debugEnabled > 0) warn(`${game.user?.name} ${i18nFormat(`midi-qol.${MODULE_ID}.wrongNumberTargets`, { allowedTargets })}`)
          return false;
        }
        let tokenToUse: Token | undefined;
        if (speaker.token) tokenToUse = canvas?.tokens?.get(speaker.token) as Token;
        const rangeDetails = checkActivityRange(this, tokenToUse, this.targets, checkMechanic("checkRange") !== "none")
        if (checkMechanic("checkRange") !== "none" && !isAoETargeting && !isEmanationTargeting && !AoO && speaker.token) {
          if (tokenToUse && this.targets.size > 0) {
            if (rangeDetails.result === "fail")
              return false;
            else {
              tokenToUse = rangeDetails.attackingToken;
            }
          }
        }
        if (this.isSpell) {
          const midiFlags = this.actor.flags[MODULE_ID];
          const needsVerbal = this.item.system.properties.has("vocal");
          const needsSomatic = this.item.system.properties.has("somatic");
          const needsMaterial = this.item.system.properties.has("material");
          //TODO Consider how to disable this check for DamageOnly workflows and trap workflows
          const conditionData = createConditionData({ actor: this.actor, activity: this });
          const notSpell = await evalCondition(midiFlags?.fail?.spell?.all, conditionData, { errorReturn: false, async: true });
          if (notSpell) {
            ui.notifications?.warn("You are unable to cast the spell");
            return false;
          }
          let notVerbal = await evalCondition(midiFlags?.fail?.spell?.verbal, conditionData, { errorReturn: false, async: true });
          if (notVerbal && needsVerbal) {
            ui.notifications?.warn("You make no sound and the spell fails");
            return false;
          }
          notVerbal = notVerbal || await evalCondition(midiFlags?.fail?.spell?.vocal, conditionData, { errorReturn: false, async: true });
          if (notVerbal && needsVerbal) {
            ui.notifications?.warn("You make no sound and the spell fails");
            return false;
          }
          const notSomatic = await evalCondition(midiFlags?.fail?.spell?.somatic, conditionData, { errorReturn: false, async: true });
          if (notSomatic && needsSomatic) {
            ui.notifications?.warn("You can't make the gestures and the spell fails");
            return false;
          }
          const notMaterial = await evalCondition(midiFlags?.fail?.spell?.material, conditionData, { errorReturn: false, async: true });
          if (notMaterial && needsMaterial) {
            ui.notifications?.warn("You can't use the material component and the spell fails");
            return false;
          }
        }


        let workflow: any = {};
        workflow.inCombat = inCombat ?? false;
        workflow.isTurn = isTurn ?? false;
        workflow.AoO = AoO;
        workflow.config = config;
        workflow.attackingToken = tokenToUse;
        workflow.rangeDetails = rangeDetails;

        // if (configSettings.undoWorkflow) await saveUndoData(workflow);

        // TODO see if this is needed still workflow.rollOptions.versatile = workflow.rollOptions.versatile || versatile || workflow.isVersatile;
        // if showing a full card we don't want to auto roll attacks or damage.
        workflow.noAutoDamage = config.midiOptions.systemCard;
        workflow.noAutoAttack = config.midiOptions.systemCard;
        const consume = this.consume;
        if (consume?.type === "ammo") {
          workflow.ammo = this.actor.items.get(consume.target);
        }

        workflow.reactionQueried = false;
        const blockReaction = thisUsesReaction && hasReaction && workflow.inCombat && needsReactionCheck(this.actor) && !config.midiOptions?.ammoSelector?.hasRun;
        if (blockReaction) {
          let shouldRoll = false;
          let d = await Dialog.confirm({
            title: i18n("midi-qol.EnforceReactions.Title"),
            content: i18n("midi-qol.EnforceReactions.Content"),
            yes: () => { shouldRoll = true },
          });
          if (!shouldRoll) {
            return false; // user aborted roll TODO should the workflow be deleted?
          }
        }

        const hasBonusAction = hasUsedBonusAction(this.actor);
        const itemUsesBonusAction = ["bonus"].includes(this.activation?.type);
        const blockBonus = workflow.inCombat && itemUsesBonusAction && hasBonusAction && needsBonusActionCheck(this.actor) && !config.midiOptions?.ammoSelector?.hasRun;
        if (blockBonus) {
          let shouldRoll = false;
          let d = await Dialog.confirm({
            title: i18n("midi-qol.EnforceBonusActions.Title"),
            content: i18n("midi-qol.EnforceBonusActions.Content"),
            yes: () => { shouldRoll = true },
          });
          if (!shouldRoll) {
            return false;
          }
        }

        const hookAbort = await asyncHooksCall("midi-qol.preItemRoll", { activity: this, token, config, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preItemRoll.${this.uuid}`, { activity: this, token, config, dialog, message }) === false;
        if (hookAbort || workflow.aborted) {
          console.warn("midi-qol | attack roll blocked by preItemRoll hook");
          workflow.aborted = true;
          await workflow.performState(workflow.WorkflowState_Abort)
          return false;
        }
        if (configSettings.allowUseMacro) {
          const results = await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll");
          if (workflow.aborted || results.some(i => i === false)) {
            console.warn("midi-qol | item roll blocked by preItemRoll macro");
            workflow.aborted = true;
            await workflow.performState(workflow.WorkflowState_Abort)
            return false;
          }
        }

        let needPause = false;
        for (let tokenRef of this.targets) {
          const target: Token | null | undefined = getToken(tokenRef);
          if (!target) continue;
          if (
            // sight not enabled but we are treating it as if it is
            (!target.document.sight.enabled && configSettings.optionalRules.invisVision)
            // @ts-expect-error no dnd5e-types
            || ((target.actor as Actor)?.type === "npc")
            // sight enabled but not the owner of the token
            || (!target.isOwner && target.document.sight.enabled)
            || (!target.vision || !target.vision?.los)) {
            initializeVision(target);
            needPause = game.modules?.get("levels-3d-preview")?.active ?? false;
          }
        }
        if (needPause) {
          await busyWait(0.1);
          for (let tokenRef of this.targets) {
            const target = getToken(tokenRef);
            if (!target || !target.vision?.los) continue;
            const sourceId = target.sourceId;
            canvas?.effects?.visionSources.set(sourceId, target.vision);
          }
        }

        if (itemUsesBonusAction && !hasBonusAction && configSettings.enforceBonusActions !== "none" && workflow.inCombat) await setBonusActionUsed(this.actor);
        if (thisUsesReaction && !hasReaction && configSettings.enforceReactions !== "none" && workflow.inCombat) await setReactionUsed(this.actor);

        // Need concentration removal to complete before allowing workflow to continue so have workflow wait for item use to complete
      } catch (err) {
        const message = `confirmCanProceed error for ${this.actor?.name} ${this.name} ${this.uuid}`;
        TroubleShooter.recordError(err, message);
        throw err;
      }
      return true;
    }
    async confirmCanProceed(config, dialog, message): Promise<boolean> {
      if (debugEnabled > 0)
        warn("MidiQOL | confirmCanProceed | Called", this);
      const workflow = this.workflow;
      try {
        if (this.useCondition && this.activation.type !== "reaction") { // reactions condition evaluation is handled elsewhere
          if (!(await evalActivationCondition(this.workflow, this.useCondition, this.targets.first(), { async: true }))) {
            ui.notifications?.warn("You are unable to use the item");
            return this.removeWorkflow();
          }
        }
        if (!config.midiOptions?.workflowOptions?.allowIncapacitated && checkMechanic("incapacitated") !== "nothing") {
          const condition = checkIncapacitated(this.actor, true, false);
          if (condition) {
            logIncapacitatedCheckResult(this.actor.name, condition, debugEnabled > 0, true);
            if (checkMechanic("incapacitated") === "enforce") return this.removeWorkflow();
          }
        }
        let isEmanationTargeting = activityHasAutoPlaceTemplate(this) || activityHasEmanationNoTemplate(this);
        let isAoETargeting = !isEmanationTargeting && activityHasAreaTarget(this);
        let selfTarget = this.target?.affects.type === "self";
        const inCombat = isInCombat(this.actor);
        const requiresTargets = configSettings.requiresTargets === "always" || (configSettings.requiresTargets === "combat" && inCombat);
        let speaker = getSpeaker(this.actor);

        const token = tokenForActor(this.actor);
        // Call preTargeting hook/onUse macro. Create a dummy workflow if one does not already exist for the item
        let cancelWorkflow = await asyncHooksCall("midi-qol.preTargeting", { activity: this, token, config, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargeting.${this.item.uuid}`, { activity: this, token, config, dialog, message }) === false
          || await asyncHooksCall(`midi-qol.preTargeting.${this.uuid}`, { activity: this, token, config, dialog, message }) === false;
        if (configSettings.allowUseMacro) {
          const results = await workflow?.callMacros(this.item, workflow?.onUseMacros?.getMacros("preTargeting"), "OnUse", "preTargeting");
          cancelWorkflow ||= results?.some(i => i === false) ?? false;
        }
        if (cancelWorkflow) return this.removeWorkflow();
        let shouldAllowRoll = !requiresTargets // we don't care about targets
          || (this.targets.size > 0) // there are some target selected
          || (this.target?.affects.type ?? "") === "" // no target required
          || selfTarget
          || isAoETargeting // area effect spell and we will auto target
          || isEmanationTargeting // range target and will autotarget
          || (!this.attack && !this.hasDamage && !this.hasSave); // does not do anything - need to chck dynamic effects

        // only allow attacks against at most the specified number of targets
        let allowedTargets;
        if (this.target?.affects.type === "creature" && this.target?.affects.count === "") //dnd5e 3.2
          allowedTargets = 9999;
        else
          allowedTargets = (this.target?.affects.type === "creature" ? this.target?.affects.count : 9999) ?? 9999;
        if (requiresTargets && configSettings.enforceSingleWeaponTarget && allAttackTypes.includes(this.actionType) && allowedTargets === 9999) {
          allowedTargets = 1;
          if (requiresTargets && this.targets.size !== 1) {
            ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
            if (debugEnabled > 0) warn(`${game.user?.name} ${i18nFormat(`midi-qol.${MODULE_ID}.wrongNumberTargets`, { allowedTargets })}`)
            return this.removeWorkflow();
          }
        }

        if (requiresTargets && !isEmanationTargeting && !isAoETargeting && this.target?.affects.type === "creature" && this.targets.size === 0) {
          ui.notifications?.warn(i18n("midi-qol.noTargets"));
          if (debugEnabled > 0) warn(`${game.user?.name} attempted to roll with no targets selected`)
          return this.removeWorkflow();
        }

        let AoO = false;
        let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id)
        const isTurn = activeCombatants?.includes(speaker.token);

        const checkReactionAOO = configSettings.recordAOO === "all" || (configSettings.recordAOO === this.actor.type)
        let thisUsesReaction = false;
        const hasReaction = hasUsedReaction(this.actor);
        if (!config.midiOptions.workflowOptions?.notReaction && ["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(this.activation?.type) && (this.activation?.cost ?? 1) > 0) {
          thisUsesReaction = true;
        }
        if (!config.midiOptions.workflowOptions?.notReaction && checkReactionAOO && !thisUsesReaction && this.attack) {
          let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id)
          const isTurn = activeCombatants?.includes(speaker.token)
          if (!isTurn && inCombat) {
            thisUsesReaction = true;
            AoO = true;
          }
        }

        // do pre roll checks
        if ((game.system?.id === "dnd5e" || game.system?.id === "n5e") && requiresTargets && this.targets.size > allowedTargets) {
          ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
          if (debugEnabled > 0) warn(`${game.user?.name} ${i18nFormat(`midi-qol.${MODULE_ID}.wrongNumberTargets`, { allowedTargets })}`)
          return this.removeWorkflow();
        }
        let tokenToUse: Token | undefined;
        if (speaker.token) tokenToUse = canvas?.tokens?.get(speaker.token) as Token;
        const rangeDetails = checkActivityRange(this, tokenToUse, this.targets, checkMechanic("checkRange") !== "none")
        if (checkMechanic("checkRange") !== "none" && !isAoETargeting && !isEmanationTargeting && !AoO && speaker.token) {
          if (tokenToUse && this.targets.size > 0) {
            if (rangeDetails.result === "fail")
              return this.removeWorkflow();
            else {
              tokenToUse = rangeDetails.attackingToken;
            }
          }
        }
        if (this.isSpell && shouldAllowRoll) {
          const midiFlags = this.actor.flags[MODULE_ID];
          const needsVerbal = this.item.system.properties.has("vocal");
          const needsSomatic = this.item.system.properties.has("somatic");
          const needsMaterial = this.item.system.properties.has("material");
          //TODO Consider how to disable this check for DamageOnly workflows and trap workflows
          const conditionData = createConditionData({ actor: this.actor, activity: this });
          const notSpell = await evalCondition(midiFlags?.fail?.spell?.all, conditionData, { errorReturn: false, async: true });
          if (notSpell) {
            ui.notifications?.warn("You are unable to cast the spell");
            return this.removeWorkflow();
          }
          let notVerbal = await evalCondition(midiFlags?.fail?.spell?.verbal, conditionData, { errorReturn: false, async: true });
          if (notVerbal && needsVerbal) {
            ui.notifications?.warn("You make no sound and the spell fails");
            return this.removeWorkflow();
          }
          notVerbal = notVerbal || await evalCondition(midiFlags?.fail?.spell?.vocal, conditionData, { errorReturn: false, async: true });
          if (notVerbal && needsVerbal) {
            ui.notifications?.warn("You make no sound and the spell fails");
            return this.removeWorkflow();
          }
          const notSomatic = await evalCondition(midiFlags?.fail?.spell?.somatic, conditionData, { errorReturn: false, async: true });
          if (notSomatic && needsSomatic) {
            ui.notifications?.warn("You can't make the gestures and the spell fails");
            return this.removeWorkflow();
          }
          const notMaterial = await evalCondition(midiFlags?.fail?.spell?.material, conditionData, { errorReturn: false, async: true });
          if (notMaterial && needsMaterial) {
            ui.notifications?.warn("You can't use the material component and the spell fails");
            return this.removeWorkflow();
          }
        }
        if (!shouldAllowRoll) {
          return this.removeWorkflow();
        }
        /*
        let workflow: Workflow;
        let workflowClass = config?.midi?.workflowClass ?? globalthis.MidiQOL.workflowClass;
        if (!(workflowClass.prototype instanceof Workflow)) workflowClass = Workflow;
        workflow = new workflowClass(this.actor, this, speaker, targetsToUse, { event: config.event || options.event || event, workflowOptions: options.workflowOptions });
        */
        if (!workflow) return false;
        workflow.inCombat = inCombat ?? false;
        workflow.isTurn = isTurn ?? false;
        workflow.AoO = AoO;
        workflow.config = config;
        workflow.attackingToken = tokenToUse;
        workflow.rangeDetails = rangeDetails;

        if (configSettings.undoWorkflow) await saveUndoData(workflow);

        // TODO see if this is needed still workflow.rollOptions.versatile = workflow.rollOptions.versatile || versatile || workflow.isVersatile;
        // if showing a full card we don't want to auto roll attacks or damage.
        workflow.noAutoDamage = config.midiOptions.systemCard;
        workflow.noAutoAttack = config.midiOptions.systemCard;
        const consume = this.consume;
        if (consume?.type === "ammo") {
          workflow.ammo = this.actor.items.get(consume.target);
        }

        workflow.reactionQueried = false;
        const blockReaction = thisUsesReaction && hasReaction && workflow.inCombat && needsReactionCheck(this.actor) && !config.midiOptions?.ammoSelector?.hasRun;
        if (blockReaction) {
          let shouldRoll = false;
          let d = await Dialog.confirm({
            title: i18n("midi-qol.EnforceReactions.Title"),
            content: i18n("midi-qol.EnforceReactions.Content"),
            yes: () => { shouldRoll = true },
          });
          if (!shouldRoll) {
            await workflow.performState(workflow.WorkflowState_Abort);
            return this.removeWorkflow(); // user aborted roll TODO should the workflow be deleted?
          }
        }

        const hasBonusAction = hasUsedBonusAction(this.actor);
        const itemUsesBonusAction = ["bonus"].includes(this.activation?.type);
        const blockBonus = workflow.inCombat && itemUsesBonusAction && hasBonusAction && needsBonusActionCheck(this.actor) && !config.midiOptions?.ammoSelector?.hasRun;
        if (blockBonus) {
          let shouldRoll = false;
          let d = await Dialog.confirm({
            title: i18n("midi-qol.EnforceBonusActions.Title"),
            content: i18n("midi-qol.EnforceBonusActions.Content"),
            yes: () => { shouldRoll = true },
          });
          if (!shouldRoll) {
            await workflow.performState(workflow.WorkflowState_Abort); // user aborted roll TODO should the workflow be deleted?
            return this.removeWorkflow();
          }
        }

        const hookAbort = await asyncHooksCall("midi-qol.preItemRoll", { activity: this, token: tokenToUse, config, dialog, message }) === false || await asyncHooksCall(`midi-qol.preItemRoll.${this.uuid}`, { activity: this, token: tokenToUse, config, dialog, message }) === false;
        if (hookAbort || workflow.aborted) {
          console.warn("midi-qol | attack roll blocked by preItemRoll hook");
          workflow.aborted = true;
          await workflow.performState(workflow.WorkflowState_Abort)
          return this.removeWorkflow();
        }
        if (configSettings.allowUseMacro) {
          const results = await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll");
          if (workflow.aborted || results.some(i => i === false)) {
            console.warn("midi-qol | item roll blocked by preItemRoll macro");
            workflow.aborted = true;
            await workflow.performState(workflow.WorkflowState_Abort)
            return this.removeWorkflow();
          }
        }

        let needPause = false;
        for (let tokenRef of this.targets) {
          const target = getToken(tokenRef);
          if (!target) continue;
          if (
            // sight not enabled but we are treating it as if it is
            (!target.document.sight.enabled && configSettings.optionalRules.invisVision)
            // @ts-expect-error no dnd5e-types
            || ((target.actor as Actor)?.type === "npc")
            // sight enabled but not the owner of the token
            || (!target.isOwner && target.document.sight.enabled)
            || (!target.vision || !target.vision?.los)) {
            initializeVision(target);
            needPause = game.modules?.get("levels-3d-preview")?.active ?? false;
          }
        }
        if (needPause) {
          await busyWait(0.1);
          for (let tokenRef of this.targets) {
            const target = getToken(tokenRef);
            if (!target || !target.vision?.los) continue;
            const sourceId = target.sourceId;
            canvas?.effects?.visionSources.set(sourceId, target.vision);
          }
        }

        for (let tokenRef of this.targets) {
          const target = getToken(tokenRef);
          if (!target) continue;
          const tokenCanSense = tokenToUse ? canSense(tokenToUse, target, globalThis.MidiQOL.InvisibleDisadvantageVisionModes) : true;
          const targetCanSense = tokenToUse ? canSense(target, tokenToUse, globalThis.MidiQOL.InvisibleDisadvantageVisionModes) : true;
          if (targetCanSense) workflow.targetsCanSense.add(tokenToUse);
          else workflow.targetsCanSense.delete(tokenToUse);
          if (tokenCanSense) workflow.tokenCanSense.add(target);
          else workflow.tokenCanSense.delete(target);
          const tokenCanSee = tokenToUse ? canSee(tokenToUse, target) : true;
          const targetCanSee = tokenToUse ? canSee(target, tokenToUse) : true;
          if (targetCanSee) workflow.targetsCanSee.add(tokenToUse);
          else workflow.targetsCanSee.delete(tokenToUse);
          if (tokenCanSee) workflow.tokenCanSee.add(target);
          else workflow.tokenCanSee.delete(target);
        }
        workflow.processAttackEventOptions();
        await workflow.checkAttackAdvantage();
        workflow.showCard = true;
        const wrappedRollStart = Date.now();

        if (itemUsesBonusAction && !hasBonusAction && configSettings.enforceBonusActions !== "none" && workflow.inCombat) await setBonusActionUsed(this.actor);
        if (thisUsesReaction && !hasReaction && configSettings.enforceReactions !== "none" && workflow.inCombat) await setReactionUsed(this.actor);

        // Need concentration removal to complete before allowing workflow to continue so have workflow wait for item use to complete
      } catch (err) {
        const message = `confirmCanProceed error for ${this.actor?.name} ${this.name} ${this.uuid}`;
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
      return buttons;
    }

    async _placeEmanationTemplate() {
      // const tokenToUse: Token = workflow?.attackingToken;
      const autoCreateTemplate = activityHasAutoPlaceTemplate(this);
      const actor = this.item.parent;
      const tokenToUse = getToken(actor);
      if (!tokenToUse) return;
      if (autoCreateTemplate) {
        const gs = canvas?.dimensions?.distance ?? 5;
        const templateOptions: any = {};
        // square templates don't respect the options distance field
        let item = this;
        let target = this.target ?? { value: 0 };
        const fudge = 0.1;
        const { width, height } = tokenToUse.document;

        templateOptions.distance = Math.ceil(target.template.size + Math.max((width ?? 1) / 2, (height ?? 1) / 2, 0) * (canvas?.dimensions?.distance ?? 0));
        templateOptions.x = tokenToUse.center?.x ?? 0;
        templateOptions.y = tokenToUse.center?.y ?? 0;
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.actorUuid`, actor.uuid);
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.tokenId`, tokenToUse.id);
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.workflowId`, this.uuid); // TODO look at this when workflow ids are chat card ids
        foundry.utils.setProperty(templateOptions, `flags.${MODULE_ID}.itemUuid`, this.item.uuid);

        // @ts-expect-error .canvas
        let templates = game.system.canvas.AbilityTemplate.fromActivity(this, templateOptions);
        // fromActivity returns an array of templates - work out if we need more than one
        if (!templates) error("No templates returned from fromActivity");
        let template = templates[0];
        const templateData = template.document.toObject();
        if (this.item) foundry.utils.setProperty(templateData, `flags.${MODULE_ID}.itemUuid`, this.item.uuid);
        if (this.actor) foundry.utils.setProperty(templateData, `flags.${MODULE_ID}.actorUuid`, this.actor.uuid);
        if (!foundry.utils.getProperty(templateData, `flags.${game.system?.id}.origin`)) foundry.utils.setProperty(templateData, `flags.${game.system?.id}.origin`, this.item?.uuid);
        const templateDocuments: MeasuredTemplateDocument[] | undefined = await canvas?.scene?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);

        if (templateDocuments && templateDocuments.length > 0) {
          let td: MeasuredTemplateDocument = templateDocuments[0];
          await td.object?.refresh();
          await busyWait(0.01);
          const workflow = this.workflow ?? Workflow.getWorkflow(this.uuid); // TODO review this when worklow ids are chat card ids 
          if (workflow) {
            workflow.templateUuid = td.uuid;
            workflow.template = td;
            workflow.templateId = td?.object?.id;
            if (installedModules.get("walledtemplates") && this.flags?.walledtemplates?.attachToken === "caster") {
              // @ts-expect-error .object
              await tokenToUse.attachTemplate(td.object, { "flags.dae.stackable": "noneName" }, true);
              if (workflow && !foundry.utils.getProperty(this, "item.flags.walledtemplates.noAutotarget"))
                selectTargets.bind(this)(td);
            }
            else if (getActivityAutoTargetAction(this) !== "none") selectTargets.bind(this)(td);
          }
          return templates;
        }
      }
    }

    async _usageChatContext(message) {
      let systemCard = false;
      const minimalCard = false;

      // Insert targets as required for emanation templates and emanationNoTemplate
      // This is the wrong spot, but there is no other good spot for it.
      const tokenToUse = getToken(this.item.parent);
      const autoCreateTemplate = activityHasAutoPlaceTemplate(this);
      const emanationNoTemplate = activityHasEmanationNoTemplate(this);
      // If emanationTemplate or emanationNoTemplate setup game.user?.targets.
      if (tokenToUse && autoCreateTemplate) {
        this.templates = await this._placeEmanationTemplate();
      }
      if (tokenToUse && emanationNoTemplate) {
        setRangedTargets(tokenToUse, this.target);
      }
      //@ts-expect-error
      foundry.utils.setProperty(message.data, "flags.dnd5e.targets", game.system.utils.getTargetDescriptors());
      const context = await super._usageChatContext(message);
      if (systemCard === undefined) systemCard = false;
      if (debugEnabled > 0) warn("show item card ", this, this.actor, this.actor.token, systemCard, this.workflow);
      let needAttackButton = !getRemoveAttackButtons(this.item) || configSettings.mergeCardMulti || configSettings.confirmAttackDamage !== "none" ||
        (!this.workflow?.someAutoRollEventKeySet() && !getAutoRollAttack(this.workflow) && !this.workflow?.midiOptions?.autoRollAttack);
      const needDamageButton = (this.hasDamage || this.hasHealing) && (
        (["none", "saveOnly"].includes(getAutoRollDamage(this.workflow)) || this.workflow?.rollOptions.rollToggle)
        || configSettings.confirmAttackDamage !== "none"
        || !getRemoveDamageButtons(this.item)
        || systemCard
        || configSettings.mergeCardMulti);
      // not used const needVersatileButton = this.item.system.isVersatile && (systemCard || ["none", "saveOnly"].includes(getAutoRollDamage(this.workflow)) || !getRemoveDamageButtons(this.item));
      // not used const sceneId = token?.scene && token.scene.id || canvas?.scene?.id;
      const isPlayerOwned = this.item.actor?.hasPlayerOwner;
      const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
        || !configSettings.itemTypeList?.includes(this.item.type);
      const hasEffects = !["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects) && this.workflow?.workflowType === "BaseWorkflow" && this.effects.find(ae => !ae.transfer && !foundry.utils.getProperty(ae, "flags.dae.dontApply"));
      let dmgBtnText = (this.actionType === "heal") ? i18n(`${SystemString}.Healing`) : i18n(`${SystemString}.Damage`);
      if (this.workflow?.midiOptions?.fastForwardDamage && configSettings.showFastForward) dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;
      let versaBtnText = i18n(`${SystemString}.Versatile`);
      if (this.workflow?.midiOptions?.fastForwardDamage && configSettings.showFastForward) versaBtnText += ` ${i18n("midi-qol.fastForward")}`;

      let midiContextData = {
        hasButtons: true,
        labels: this.labels,
        //@ ts-expect-error TODO needed for abilities translation
        // config: game.system.config,
        condensed: configSettings.mergeCardCondensed,
        hasAttack: this.attack && !minimalCard && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
        isHealing: !minimalCard && this.item.isHealing && (systemCard || configSettings.autoRollDamage !== "always"),
        hasDamage: needDamageButton,
        hasAttackRoll: !minimalCard && this.attack,
        configSettings,
        hideItemDetails,
        dmgBtnText,
        versaBtnText,
        showProperties: this.workflow?.workflowType === "BaseWorkflow",
        hasEffects,
        effects: this.item.effects,
        isMerge: true,
        mergeCardMulti: configSettings.mergeCardMulti && (this.attack || this.hasDamage),
        confirmAttackDamage: configSettings.confirmAttackDamage !== "none" && (this.attack || this.hasDamage),
        RequiredMaterials: i18n(`${SystemString}.RequiredMaterials`),
        Attack: i18n(`${SystemString}.Attack`),
        OtherFormula: i18n(`${SystemString}.OtherFormula`),
        canCancel: configSettings.undoWorkflow // TODO enable this when more testing done.
      };
      context.buttons = context.buttons?.filter(b => !["rollAttack", "rollDamage", "rollHealing"].includes(b.dataset?.action));
      if (configSettings.autoCheckSaves !== "none") context.buttons = context.buttons?.filter(b => !["rollSave", "rollCheck"].includes(b.dataset?.action));
      return foundry.utils.mergeObject(context, midiContextData)
    }

    get actionType() { // the default actionType method in dnd5e mixin returns this.metadata.data instead of this.metadata.type
      return this.metadata.type;
    }

    get otherActivity(): any {
      return undefined;
    }

    get useCondition() {
      if (this.useConditionText && this.useConditionText !== "") return this.useConditionText;
      return foundry.utils.getProperty(this.item, "flags.midi-qol.itemCondition") ?? "";
    }

    get effectCondition() {
      if (this.effectConditionText && this.effectConditionText !== "") return this.effectConditionText;
      return foundry.utils.getProperty(this.item, "flags.midi-qol.effectCondition") ?? "";
    }

    get reactionCondition() {
      if (this.useCondition && this.useCondition !== "") return this.useCondition;
      return foundry.utils.getProperty(this.item, "flags.midi-qol.reactionCondition") ?? "";
    }

    get otherCondition() {
      if (this.otherActivity && this.otherActivity?.useCondition !== "") return this.otherActivity.useCondition;
      return foundry.utils.getProperty(this.item, "flags.midi-qol.otherCondition") ?? "";
    }

    get hasDamage() {
      return this.damage?.parts.length > 0;
    }

    get hasHealing() {
      return this.healing !== undefined;
    }
    get hasAttack() {
      return this.attack !== undefined;
    }
  }
}

export var MidiActivityMixinSheet = Base => {
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
      context.ConfirmTargetOptions = Object.entries(geti18nOptions("ConfirmTargetOptions")).map(([value, label]) => ({ value, label }));
      if (this.activity.forcedTargetConfirmation) context.ConfirmTargetOptions = context.ConfirmTargetOptions.filter(o => o.value === this.activity.forcedTargetConfirmation);
      const ROLL_MODES = CONST.DICE_ROLL_MODES;
      context.RollModeOptions = [
        { value: "default", label: i18n("Default") },
        { value: ROLL_MODES.PUBLIC, label: i18n("CHAT.RollPublic") },
        { value: ROLL_MODES.PRIVATE, label: i18n("CHAT.RollPrivate") },
        { value: ROLL_MODES.BLIND, label: i18n("CHAT.RollBlind") },
        { value: ROLL_MODES.SELF, label: i18n("CHAT.RollSelf") }
      ];
      context.placeholderIdentifier = context.activity.identifier;
      const midiProperties = context.activity.midiProperties;

      context.triggeredActivityOptions = this.item.system.activities
        .filter(a => a.id !== this.activity.id && a.isTriggerableActivity)
        .reduce((ret, a) => { ret.push({ label: `${a.name}`, value: a.id }); return ret }, [{ label: "None", value: "none" }]);
      context.triggeredActivityOptions?.filter(option => { option.selected = option.value === this.activity.midiProperties.triggeredActivityId });
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
      context.triggeredActivityTargetOptions = Object.entries(geti18nOptions("TriggeredActivityTargetOptions")).map(([value, label]) => {
        return { value, label, selected: midiProperties.triggeredActivityTargets === value }
      })
      context.triggeredActivityRollAsOptions = Object.entries(geti18nOptions("TriggeredActivityRollAsOptions")).map(([value, label]) => {
        return { value, label, selected: midiProperties.triggeredActivityRollAs === value }
      });
      if ((await context.activity.getTriggeredActivity())?.isSelfTriggerableOnly) {
        context.triggeredActivityRollAsOptions = context.triggeredActivityRollAsOptions.filter(o => o.value === "self");
        // adjust target list
      }
      context.ignoreTraitsOptions = Object.entries(geti18nOptions("SHARED.FIELDS.midiProperties.ignoreTraits")).map(([value, entry]) => {
        //@ts-expect-error
        return { value, label: entry.label, selected: this.activity.midiProperties.ignoreTraits.has(value) }
      });
      context.AutoTargetTypeOptions = Object.entries(geti18nOptions("AoETargetTypeOptions")).map(([value, label]) => ({ value, label }));

      const defaultAction = { "default": i18n("midi-qol.MidiSettings") };
      context.AutoTargetActionOptions = Object.entries(foundry.utils.mergeObject(defaultAction, geti18nOptions("autoTargetOptions"))).map(([value, label]) => ({ value, label }));
      context.hasAreaTarget = this.activity.target?.template?.type;
      context.possibleOtherActivity = this.activity.possibleOtherActivity;
      context.turnChoiceOptions = [{ value: "start", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.start") }, { value: "end", label: i18n("midi-qol.OVERTIME.FIELDS.turnChoice.end") }];
      return context;
    }

    async _preparePartContext(partId, context) {
      if (partId === "midi-qol") {
        context.tab = context.tabs["midi-qol"];
        return this._prepareMidiQolContext(context);
      }
      return super._preparePartContext(partId, context);
    }
    /** @override */ // This does not seem to work for activity sheets
    _getHeaderButtons() {
      let buttons = super._getHeaderButtons();
      const DIMtitle = i18n('dae.DIMEditor.Name');
      const Editor = globalThis.DAE?.DIMEditor;
      if (!Editor) return buttons;
      buttons.unshift({
        label: DIMtitle,
        class: "dae-dimeditor",
        icon: "fas fa-file-pen",
        onclick: () => { new Editor({ document: this.activity }).render({ force: true }) }
      });
      return buttons;
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
  const DIMtitle = i18n('dae.DIMEditor.Name');
  daeButton.setAttribute('class', 'header-control fa-solid fa-file-pen dae-dimeditor');
  daeButton.onclick = function (ev) { new Editor({ document: this.activity }).render({ force: true }); }.bind(app);
  if (activity.macro?.command) daeButton.style.color = '#36ba36';

  daeButton.title = "Activity Macro Editor";
  closeButton.parentNode.insertBefore(daeButton, closeButton);
}

export var MidiActivityUsageDialog;
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
  Hooks.on("renderActivitySheet", renderActivitySheetHook);
}
