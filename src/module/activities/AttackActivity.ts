import { debugEnabled, warn, error, busyWait, GameSystemConfig, debug, log, i18n, MODULE_ID, i18nFormat } from "../../midi-qol.js";
import { unTimedExecuteAsGM } from "../GMAction.js";
import { AugmentedEvent, Workflow } from "../Workflow.js";
import { defaultRollOptions } from "../patching.js";
import { replaceDefaultActivities, configSettings, confirmTargetOptions, safeGetGameSetting } from "../settings.js";
import { addAdvAttribution, areMidiKeysPressed, asyncHooksCall, completeActivityUse, addUpdatesCache, displayDSNForRoll, getSpeaker } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { doActivityReactions, preTemplateTargets, requiresTargetConfirmation } from "./activityHelpers.js";
import { OnUseMacros } from "../apps/Item.js";
import { Activity, ActivityUseConfiguration, DND5ETargetDescriptor, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { TargetConfirmationConfig } from "../apps/TargetConfirmationConfig.js";

export let MidiAttackSheet: ReturnType<typeof defineMidiAttackSheetClass>;
export let MidiAttackActivity: ReturnType<typeof defineMidiAttackActivityClass>;
// export let MidiAttackActivityData;

export function setupAttackActivity() {
  if (debugEnabled > 0) warn("MidiQOL | AttackActivity | setupAttackActivity | Called");

  //@ts-expect-error
  MidiAttackSheet = defineMidiAttackSheetClass(game.system.applications.activity.AttackSheet);
  MidiAttackActivity = defineMidiAttackActivityClass(GameSystemConfig.activityTypes.attack.documentClass as Activity);
  if (replaceDefaultActivities) {
    // GameSystemConfig.activityTypes["dnd5eAttack"] = GameSystemConfig.activityTypes.attack;
    GameSystemConfig.activityTypes.attack = { documentClass: MidiAttackActivity };
  } else {
    GameSystemConfig.activityTypes["midiAttack"] = { documentClass: MidiAttackActivity };
  }
}

let defineMidiAttackSheetClass = (baseClass: any) => {
  return class MidiAttackActivitySheet extends MidiActivityMixinSheet(baseClass) {

    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/attack-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates,
          "modules/midi-qol/templates/activity/parts/attack-extras.hbs",
        ]
      }
    }

    async _prepareEffectContext(context) {
      const activity = this.activity;
      context = await super._prepareEffectContext(context);
      context.attackModeOptions = this.item.system.attackModes;
      context.hasAmmunition = this.item.system.properties.has("amm");
      context.ammunitionOptions = this.item.system.ammunitionOptions ?? [];
      context.ammunitionOptions?.forEach(option => {
        option.selected = option.value === this.activity.ammunition;
      });
      if (activity.otherActivityUuid) {
        ui.notifications?.warn("Please update other activity. otherActivityUuid is deprecated");
        activity.otherActivityUuid = undefined;
      }
      let indexOffset = 0;
      if (activity.damage?.parts) {
        const scalingOptions = [
          { value: "", label: i18n("DND5E.DAMAGE.Scaling.None") },
          //@ts-expect-error
          ...Object.entries(GameSystemConfig.damageScalingModes).map(([value, config]) => ({ value, label: config.label }))
        ];
        const types = Object.entries(GameSystemConfig.healingTypes).concat(Object.entries(GameSystemConfig.damageTypes));
        context.damageParts = activity.damage.parts.map((data, index) => {
          if (data.base) indexOffset--;
          const part = {
            data,
            fields: this.activity.schema.fields.damage.fields.parts.element.fields,
            prefix: `damage.parts.${index + indexOffset}.`,
            source: context.source.damage.parts[index + indexOffset] ?? data,
            canScale: this.activity.canScaleDamage,
            scalingOptions,
            typeOptions: types.map(([value, config]) => ({
              value, label: config.label, selected: data.types.has(value)
            }))
          };
          // @ts-expect-error no dnd5e-types
          if (foundry.utils.isNewerVersion(game.system.version, "5.0.2")) part.locked = data.locked || (index === undefined);
          return this._prepareDamagePartContext(context, part);
        })
      }
      context.ConfirmTargetOptions = Object.entries(confirmTargetOptions).map(([value, label]) => ({ value, label }));

      if (debugEnabled > 0) {
        warn(("prepareEffectContext | context"), context);
      }
      return context;
    }

    _prepareSubmitData(event, formData) {
      let submitData = super._prepareSubmitData(event, formData);
      submitData.otherActivityUuid = "";
      return submitData;
    }

  }
}

let defineMidiAttackActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiAttackActivity extends MidiActivityMixin(ActivityClass) {
    _otherActivity: Activity | undefined;

    static LOCALIZATION_PREFIXES = [ ...super.LOCALIZATION_PREFIXES, "midi-qol.ATTACK"];

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField, NumberField, DocumentIdField } = foundry.data.fields;

      const schema = {
        ...super.defineSchema(),
        otherActivityId: new StringField({ name: "otherActivity", initial: "" }),
        otherActivityAsParentType: new BooleanField({
          name: "otherActivityAsParentType",
          initial: true,
          required: false,
          label: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.label"),
          hint: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.hint")
        }),
        attackMode: new StringField({ name: "attackMode", initial: "oneHanded" }),
        ammunition: new StringField({ name: "ammunition", initial: "" }),
        // deprecated 
        otherActivityUuid: new StringField({ name: "otherActivityUuid", required: false, initial: "" }),
        attackRollPerTarget: new StringField({ name: "attackRollPerTarget", initial: "default", required: true }),
        fumbleThreshold: new NumberField({ name: "fumbleThreshold", initial: 1, required: false }),
      };
      return schema;
    }
    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        sheetClass: MidiAttackSheet,
        title: configSettings.activityNamePrefix ? "midi-qol.ATTACK.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        usage: {
          chatCard: "modules/midi-qol/templates/activity-card.hbs",
          actions: {
            rollAttack: MidiAttackActivity.#rollAttack,
            rollAttackAdvantage: MidiAttackActivity.#rollAttackAdvantage,
            rollAttackDisadvantage: MidiAttackActivity.#rollAttackDisadvantage,
            rollDamage: MidiAttackActivity.#rollDamage,
            rollDamageNoCritical: MidiAttackActivity.#rollDamageNoCritical,
            rollDamageCritical: MidiAttackActivity.#rollDamageCritical,
          }
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

    static #rollAttack(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);

      if (!message || !workflow || workflow.currentAction === workflow.WorkflowState_Abort || workflow.currentAction === workflow.WorkflowState_Completed) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: ActivityUseConfiguration = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.midiOptions.targets = new Set(workflow?.targets);
        attackConfig.workflow = workflow;
        // @ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        workflow.activity = this;
        // @ts-expect-error
        return this.rollAttack({ event, workflow }, {}, {});
      }
    }

    static #rollAttackAdvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (!message || !workflow || workflow.currentAction === workflow.WorkflowState_Abort || workflow.currentAction === workflow.WorkflowState_Completed) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: any = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig: ActivityUseConfiguration = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        attackConfig.advantage = true;
        attackConfig.disadvantage = false;
        workflow.activity = this;
        //@ts-expect-error
        return this.rollAttack(attackConfig, {}, {});
      }
    }

    static #rollAttackDisadvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (!message || !workflow || workflow.currentAction === workflow.WorkflowState_Abort || workflow.currentAction === workflow.WorkflowState_Completed) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: ActivityUseConfiguration = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig: any = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        attackConfig.advantage = false;
        attackConfig.disadvantage = true;
        workflow.activity = this;
        //@ts-expect-error
        return this.rollAttack(attackConfig, {}, {});
      }
    }

    static #rollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      // @ts-expect-error
      return this.rollDamage({ event, workflow, midiOptions: { isCritical: workflow?.workflowOptions?.isCritical || workflow?.isCritical } }, {}, message);
    }

    static #rollDamageNoCritical(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      // @ts-expect-error
      return this.rollDamage({ event, workflow, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
    }

    static #rollDamageCritical(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (workflow) workflow.activity = this;
      // @ts-expect-error
      return this.rollDamage({ event, workflow, midiOptions: { isCritical: true } }, {}, message);
    }

    async rollDamage(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) {
      if (!config.ammunition) {
        let ammunition = this.ammunitionItem;
        if (!ammunition) ammunition = config.workflow?.ammunition;
        if (!ammunition && config.workflow) {
          const data = foundry.utils.getProperty(config.workflow.chatCard, "flags.midi-qol.ammunitionData") as any;
          if (data) return new Item.implementation(data, { parent: this.actor });
        }
        config.ammunition = ammunition;
        this.ammunitionItem = ammunition;
      }
      return super.rollDamage(config, dialog, message);
    }

    async _triggerSubsequentActions(config, results) {
    }

    async useWIP(usage: any = {}, dialog: any = {}, message: any = {}) {
      let preValidateRollHookId;
      try {
        if (debugEnabled > 0) warn("MidiQOL | AttackActivity | use | Called", usage, dialog, message);
        usage.midiOptions ??= {};
        if (foundry.utils.getProperty(usage, "midiOptions.checkRollPerTarget") !== false) {
          // const itemAttackPerTarget = foundry.utils.getProperty(this.item, "flags.midi-qol.rollAttackPerTarget");
          const itemAttackPerTarget = this.attackRollPerTarget ?? "default";
          let isAttackPerTarget = itemAttackPerTarget === "always"
            || (configSettings.attackPerTarget && itemAttackPerTarget !== "never")
          // isAttackPerTarget &&= this.target?.template?.type === "";
          if (isAttackPerTarget) {
            foundry.utils.setProperty(usage, "midiOptions.workflowOptions.rollAttackPerTarget", true);
          }
        }
        return super.use(usage, dialog, message);
      } finally {
        //@ts-expect-error
        if (preValidateRollHookId) Hooks.off("dnd5e.preValidateRollAttack", preValidateRollHookId);
      }
    }

    async use(this: Activity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig) {
      if (debugEnabled > 0) warn("MidiQOL | AttackActivity | use | Called", usage, dialog, message);
      usage.midiOptions ??= {};
      // const itemAttackPerTarget = foundry.utils.getProperty(this.item, "flags.midi-qol.rollAttackPerTarget");
      const itemAttackPerTarget = this.attackRollPerTarget ?? "default";
      let isAttackPerTarget = itemAttackPerTarget === "always"
        || (configSettings.attackPerTarget && itemAttackPerTarget !== "never")
      isAttackPerTarget &&= this.target?.template?.type === ""; // only works if there is no AoE template targeting.
      // Solution for this is to have a lead Use activity that sets the targets and then calls the attack activity as a trigger activity
      const willHaveTargets = (usage.midiOptions?.targetsToUse?.size ?? 0) > 0 || (game.user?.targets?.size ?? 0) > 0 || requiresTargetConfirmation(this, {})
      if (!isAttackPerTarget || !willHaveTargets)
        return super.use(usage, dialog, message);
      // Do target confirmation if required
      if (!usage.midiOptions.targetsToUse && !await preTemplateTargets(this, usage.midiOptions)) return false;
      let returnValue;
      let checkReaction = !usage.midiOptions.isTriggered; // first pass do reaction checks
      let checkBonusAction = !usage.midiOptions.isTriggered; // first pass do bonus action checks
      let targets: Set<foundry.canvas.placeables.Token.Implementation> | undefined;
      const savedTargets = foundry.utils.deepClone(game.user?.targets);
      if (usage.midiOptions.targetsToUse) targets = usage.midiOptions.targetsToUse;
      if (!targets) targets = new Set(game.user?.targets);
      for (let target of targets) {
        let item = this.item.clone({}, { keepId: true });
        // @ts-expect-error no dnd5e-types
        let activity = item.system.activities.get(this.id);
        const attackConfig = foundry.utils.deepClone(usage);
        attackConfig.midiOptions ??= {};
        attackConfig.midiOptions.targetsToUse = new Set([target]);
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.midiOptions.proceedChecks = { checkReaction, checkBonusAction };
        attackConfig.midiOptions.workflowOptions.targetConfirmation = "never";
        const attackDialog = foundry.utils.deepClone(dialog);
        delete attackDialog.configure;
        returnValue = await super.use.bind(activity)(attackConfig, attackDialog, message);
        if (!returnValue) break;
        checkReaction = false;
        checkBonusAction = false;
      }
      if (game.user && savedTargets) game.user.targets = savedTargets; // restore targets
      return returnValue;
    }

    // @ts-expect-error weirdness with how I handled the types
    async rollAttack(config: RollProcessConfig={}, dialog: RollDialogConfig={}, message: RollMessageConfig={}) {
      let preRollHookId: number | undefined;
      let rollAttackHookId: number | undefined;
      let postAttackRollConfigurationHookId: number | undefined;
      let rolls;
      const workflow = config.workflow;
      config.midiOptions ??= {};

      try {
        /* Decide what this should mean
        if (workflow && workflow?.currentAction === workflow?.WorkflowState_Aborted || workflow?.currentAction === workflow?.WorkflowState_Completed)
          return this.use(config, dialog, {});
        */
        if (debugEnabled > 0) warn("MidiQOL | AttackActivity | rollAttack | Called", config, dialog, message);
        let returnValue = await this.configureAttackRoll(config);
        if (!workflow || workflow?.aborted) return [];
        if (!returnValue) {
          // @ts-expect-error weirdness with how I handled the types
         return super.rollAttack(config, dialog, message);
        }

        let requiresAmmoConfirmation = false;
        await workflow.checkAttackAdvantage();
        // @ts-expect-error
        const areKeysPressed = game.system.utils.areKeysPressed;
        const keys = {
          normal: areKeysPressed(config.event ?? workflow.workflowOptions.event, "skipDialogNormal"),
          advantage: areKeysPressed(config.event ?? workflow.workflowOptions.event, "skipDialogAdvantage"),
          disadvantage: areKeysPressed(config.event ?? workflow.workflowOptions.event, "skipDialogDisadvantage")
        };

        // @ts-expect-error no dnd5e-types
        if (this.item.system.properties?.has("ver") && areMidiKeysPressed(config.event ?? workflow.workflowOptions.event, "Versatile")) {
          workflow.attackMode = "twoHanded";
        }
        // @ts-expect-error no dnd5e-types
        if (this.item.system.properties?.has("amm")) {
          const ammoConfirmation = this.confirmAmmunition;
          if (ammoConfirmation.reason) {
            ui.notifications?.warn(ammoConfirmation.reason);
          }
          if (!ammoConfirmation.proceed) {
            if (workflow) workflow.aborted = true;
          }
          requiresAmmoConfirmation = ammoConfirmation.confirm;
        }
        if (Object.values(keys).some(k => k)) dialog.configure = !!(this.midiProperties?.forceRollDialog === "always" || requiresAmmoConfirmation);
        if (config.workflow && areMidiKeysPressed(config.event as AugmentedEvent, "RollToggle")) config.workflow.rollOptions.rollToggle = !config.workflow.rollOptions.rollToggle;
        else if (!dialog.configure) {
          switch (this.midiProperties?.forceRollDialog) {
            case "always":
              dialog.configure = true;
              break;
            case "never":
              dialog.configure = false;
              break;
            default:
              dialog.configure = !(config.midiOptions.fastForwardAttack ?? workflow.workflowOptions.fastForwardAttack ?? false);
          }
        }
        if (keys.advantage) workflow.rollOptions.advantage = keys.advantage;
        if (keys.disadvantage) workflow.rollOptions.disadvantage = keys.disadvantage;
        config.advantage ??= !!keys.advantage || !!(config.midiOptions.advantage ?? workflow.workflowOptions.advantage);
        config.disadvantage ??= !!keys.disadvantage || !!(config.midiOptions.disadvantage ?? workflow.workflowOptions.disadvantage);
        preRollHookId = Hooks.once("dnd5e.preRollAttack", (rollConfig, dialogConfig, messageConfig) => {
          if (workflow?.aborted) return false;
          if (workflow?.rollOptions?.rollToggle) dialogConfig.configure = !dialogConfig.configure;
          if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rollConfig.attackMode)) {
            // check equipment - shield other weapons for equipped status
            // @ts-expect-error no dnd5e-types
            if (this.actor.system.attributes.ac?.shield > 0) {
              ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
              if (workflow) workflow.aborted = true;
              return false;
            }
          } else if (!rollConfig.attackMode && dialogConfig.options?.attackModeOptions?.length ) dialogConfig.configure = true;
          if (keys.disadvantage && workflow) {
            workflow.attackAdvAttribution.add(`DIS:keyPress`);
            workflow.advReminderAttackAdvAttribution.add(`DIS:keyPress`);
          }
          if (keys.advantage && workflow) {
            workflow.attackAdvAttribution.add(`ADV:keyPress`);
            workflow.advReminderAttackAdvAttribution.add(`ADV:keyPress`);
          }
          const targetDescriptors = foundry.utils.getProperty(messageConfig, "data.flags.dnd5e.targets") as DND5ETargetDescriptor[] | undefined;
          if (targetDescriptors && workflow) workflow.targetDescriptors = targetDescriptors as DND5ETargetDescriptor[];
          return true;
        });
        rollAttackHookId = Hooks.once("dnd5e.rollAttack", (rolls, { ammoUpdate, subject }) => {
          if (ammoUpdate?.destroy) {
            // @ts-expect-error no dnd5e-types
            const data = this.actor.items.get(ammoUpdate.id).toObject();
            addUpdatesCache(workflow.id, { "flags.midi-qol.ammunitionData": data });
          }
        });
        postAttackRollConfigurationHookId = Hooks.once("dnd5e.postAttackRollConfiguration", (rolls, config, dialog, message) => {
          if (rolls?.length === 0) {
            // if (config.workflow) config.workflow.aborted = true;
            return false;
          }
          // @ts-expect-error no dnd5e-types
          if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rolls?.[0]?.options?.attackMode)) {
            // check equipment - shield other weapons for equipped status
            // @ts-expect-error no dnd5e-types
            if (this.actor.system.attributes.ac?.shield > 0) {
              ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
              if (config.workflow) config.workflow.aborted = true;
              return false;
            }
          }
          // @ts-expect-error no dnd5e-types
          if (this.requireAmmunition && this.item.system.properties?.has("amm")) {
            // @ts-expect-error no dnd5e-types
            const chosenAmmunition = this.actor.items.get(rolls?.[0]?.options?.ammunition);
            // @ts-expect-error no dnd5e-types
            if ((chosenAmmunition?.system.quantity ?? 0) <= 0) ui.notifications?.error(i18nFormat("midi-qol.NoAmmunition", { name: chosenAmmunition?.name ?? "Ammunition" }));
            else this.ammunitionItem = chosenAmmunition;
            // @ts-expect-error no dnd5e-types
            return chosenAmmunition?.system.quantity > 0;
          }
          return true;
        })
        // Active defence resolves by triggering saving throws and returns early
        if (workflow.useActiveDefence) {
          message.create = false; // go through the roll process but don't show the attack roll.
        }


        message ??= {};
        message.create ??= config.midiOptions.chatMessage;
        const rollMode = safeGetGameSetting("core", "rollMode");
        const showChatAttackCard = game.user?.isGM && [CONST.DICE_ROLL_MODES.SELF, CONST.DICE_ROLL_MODES.BLIND, CONST.DICE_ROLL_MODES.PRIVATE].includes(rollMode);
        if (showChatAttackCard) {
          // Show a chat card for attack rolls if the players are not going to see the midi card.
          message.create = true;
          foundry.utils.setProperty(message, "data.flags.midi-qol.gmHide", true); // since the gm will see the midi card hide the attack card for the author
          message.rollMode = rollMode;
        }
        config.attackMode ??= this.attackMode ?? "oneHanded";
        // @ts-expect-error no dnd5e-types
        if (config.event && areMidiKeysPressed(config.event, "Versatile") && this.item.system.damage?.versatile && this.item.system.properties.has("ver")) {
          config.attackMode = "twoHanded";
        }
        if (config.event && workflow) {
          workflow.rollOptions.rollToggle = areMidiKeysPressed(config.event as AugmentedEvent, "RollToggle");
        }

        // @ts-expect-error weirdness with how I did the types
        rolls = await super.rollAttack(config, dialog, message);

        if (!rolls || rolls.length === 0) {
          // if (workflow) workflow.aborted = true;
          return;
        }
        if (dialog.configure && rolls[0]?.options?.ammunition && rolls[0].options.ammunition !== this.ammunition) {
          await this.update({ ammunition: rolls[0].options.ammunition });
          this.ammunition = rolls[0].options.ammunition;
          this.ammunitionItem = this.actor?.items.get(this.ammunition);
          this._otherActivity = undefined; // reset this in case ammunition changed
        }

        if (workflow) {
          workflow.attackMode = rolls[0].options.attackMode ?? config.attackMode;
          if (this.ammunition && !this.ammunitionItem) { // assume it was deleted
            const storedData = foundry.utils.getProperty(workflow.chatCard, "flags.midi-qol.ammunitionData") as any;
            if (storedData) workflow.ammunition = new Item.implementation(storedData, { parent: this.actor })
          } else workflow.ammunition = this.ammunitionItem;
          if (this.ammunition) this.update({ ammunition: this.ammunitionItem?.id ?? "" });
          if (configSettings.allowUseMacro) {
            workflow.ammunitionOnUseMacros = workflow.ammunition?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
          }
          if (workflow.workflowOptions?.attackRollDSN !== false && !showChatAttackCard) await displayDSNForRoll(rolls[0], "attackRollD20");
          await workflow?.setAttackRoll(rolls[0]);
          rolls[0] = await workflow.processAttackRollBonusFlags();
          if (["formulaadv", "adv"].includes(configSettings.rollAlternate)) addAdvAttribution(rolls[0], workflow.attackAdvAttribution);
          await workflow?.setAttackRoll(rolls[0]);
        }
        if (debugEnabled > 0) {
          warn("AttackActivity | rollAttack | setAttackRolls completed ", rolls);
          warn(`Attack Activity | workflow is suspended ${workflow?.suspended}`);
        }
        if (workflow?.suspended) workflow.unSuspend.bind(workflow)({ attackRoll: rolls[0] })
      } catch (err) {
        error("AttackActivity | rollAttack | Error configuring dialog", err);
      } finally {
        if (preRollHookId) Hooks.off("dnd5e.preRollAttack", preRollHookId);
        if (rollAttackHookId) Hooks.off("dnd5e.rollAttack", rollAttackHookId);
        if (postAttackRollConfigurationHookId) Hooks.off("dnd5e.postAttackRollConfiguration", postAttackRollConfigurationHookId);

      }
      return rolls;
    }

    async configureAttackRoll(this: Activity, config: RollProcessConfig): Promise<boolean> {
      if (debugEnabled > 0) warn("configureAttackRoll", this, config);
      if (!config.workflow) return false;
      let workflow: Workflow = config.workflow;
      config.midiOptions ??= {};

      if (debugEnabled > 1) debug("Entering configure attack roll", config.event, workflow, config.rollOptions);

      if (workflow.workflowType === "BaseWorkflow") {
        if (workflow.attackRoll && workflow.currentAction === workflow.WorkflowState_Completed) {
          // This should not happen anymore
          // we are re-rolling the attack.
          await workflow.setDamageRolls(undefined)
          if (workflow.itemCardUuid) {
            await Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeConfirmButtons: true });
          }
          if (workflow.damageRollCount > 0) { // re-rolling damage counts as new damage
            const messageConfig = foundry.utils.mergeObject({
              create: true,
              data: {
                flags: {
                  dnd5e: {
                    // @ts-expect-error
                    ...this.messageFlags,
                    messageType: "usage",
                    use: {
                      // @ts-expect-error
                      effects: this.applicableEffects?.map(e => e.id)
                    }
                  }
                }
              },
              hasConsumption: false
            }, { flags: workflow.chatCard.flags })
            // @ts-expect-error
            const itemCard = await this._createUsageMessage(messageConfig);
            // const itemCard = await this.displayCard(foundry.utils.mergeObject(config, { systemCard: false, workflowId: workflow.id, minimalCard: false, createMessage: true }));
            workflow.itemCardUuid = itemCard.uuid;
            if (configSettings.undoWorkflow && workflow.undoData) {
              workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat([itemCard.uuid]);
              unTimedExecuteAsGM("updateUndoChatCardUuids", workflow.undoData);
            }
          }
        }
      }

      if (config.midiOptions.resetAdvantage) {
        workflow.advantage = false;
        workflow.disadvantage = false;
        workflow.rollOptions = foundry.utils.deepClone(defaultRollOptions);
      }
      if (workflow.workflowType === "TrapWorkflow") workflow.workflowOptions.fastForward = true;

      await doActivityReactions(this, workflow);
      await busyWait(10);
      if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnUseMacro !== true) {
        await workflow.triggerTargetMacros(["isPreAttacked"]);
        if (workflow.aborted) {
          console.warn(`midi-qol | item ${workflow.item.name ?? ""} roll blocked by isPreAttacked macro`);
          await workflow.performState(workflow.WorkflowState_Abort);
          return false;
        }
      }

      // Compute advantage
      await workflow.checkAttackAdvantage();
      if (await asyncHooksCall("midi-qol.preAttackRoll", workflow) === false
        || await asyncHooksCall(`midi-qol.preAttackRoll.${this.item.uuid}`, workflow) === false
        || await asyncHooksCall(`midi-qol.preAttackRoll.${this.uuid}`, workflow) === false) {
        console.warn("midi-qol | attack roll blocked by preAttackRoll hook");
        return false;
      }
      if (configSettings.allowUseMacro && workflow.workflowOptions?.noOnUseMacro !== true) {
        await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preAttackRollConfig"), "OnUse", "preAttackRollConfig");
        if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preAttackRollConfig"), "OnUse", "preAttackRollConfig");
      }

      // Advantage is true if any of the sources of advantage are true;
      let advantage = config.advantage
        || workflow.workflowOptions.advantage
        || workflow.advantage
        || workflow.rollOptions.advantage
        || workflow.workflowOptions?.advantage
        || workflow.flankingAdvantage;
      if (workflow.noAdvantage) advantage = false;
      // Attribute advantage
      if (workflow.rollOptions.advantage) {
        workflow.attackAdvAttribution.add(`ADV:keyPress`);
        workflow.advReminderAttackAdvAttribution.add(`ADV:keyPress`);
      }
      if (workflow.workflowOptions?.advantage)
        workflow.attackAdvAttribution.add(`ADD:workflowOptions`);
      if (workflow.flankingAdvantage) {
        workflow.attackAdvAttribution.add(`ADV:flanking`);
        workflow.advReminderAttackAdvAttribution.add(`ADV:Flanking`);
      }

      let disadvantage = config.midiOptions.disadvantage
        || workflow.workflowOptions.disadvantage
        || workflow.disadvantage
        || workflow.rollOptions.disadvantage
        || workflow.workflowOptions?.disadvantage;
      if (workflow.noDisadvantage) disadvantage = false;
      if (workflow.rollOptions.disadvantage) {
        workflow.attackAdvAttribution.add(`DIS:keyPress`);
        workflow.advReminderAttackAdvAttribution.add(`DIS:keyPress`);
      }
      if (workflow.workflowOptions?.disadvantage)
        workflow.attackAdvAttribution.add(`DIS:workflowOptions`);

      if (advantage && disadvantage) {
        advantage = false;
        disadvantage = false;
      }

      workflow.attackRollCount += 1;
      if (workflow.attackRollCount > 1) workflow.damageRollCount = 0;

      // create an options object to pass to the roll.
      // advantage/disadvantage are already set (in options)
      config.midiOptions = foundry.utils.mergeObject(config.midiOptions, {
        chatMessage: (["TrapWorkflow", "Workflow"].includes(workflow.workflowType)) ? false : config.midiOptions.chatMessage,
        fastForward: workflow.workflowOptions?.fastForwardAttack ?? workflow.rollOptions.fastForwardAttack ?? config.midiOptions.fastForward,
        messageData: {
          speaker: getSpeaker(this.actor!)
        }
      },
        { insertKeys: true, overwrite: true });
      if (workflow.rollOptions.rollToggle) config.midiOptions.fastForward = !config.midiOptions.fastForward;
      if (advantage) config.midiOptions.advantage ||= true; // advantage passed to the roll takes precedence
      if (disadvantage) config.midiOptions.disadvantage ||= true; // disadvantage passed to the roll takes precedence

      // Setup labels for advantage reminder
      const advantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("ADV:")).map(s => s.replace("ADV:", ""));
      if (advantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.advantageLabels", advantageLabels);
      const disadvantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("DIS:")).map(s => s.replace("DIS:", ""));
      if (disadvantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.disadvantageLabels", disadvantageLabels);

      if (config.midiOptions.fumble === true || config.midiOptions.fumble === false)
        delete config.midiOptions.fumble;

      config.midiOptions.chatMessage = false;
      if (config.midiOptions?.workflowOptions?.versatile) config.attackMode = "twoHanded";
      return true;
    }
    getDamageConfig(config: RollProcessConfig) {
      const rollConfig = super.getDamageConfig(config);
      for (let roll of rollConfig.rolls) {
        if (rollConfig.ammunition) { // add ammunition properties to the damage roll
          let rollProperties = new Set(roll.options.properties);
          const ammunitionProperties = rollConfig.ammunition.system.properties;
          roll.options.properties = Array.from(rollProperties.union(ammunitionProperties));
        }
        // critical/fumble will be inserted when roll.build is called.
      }
      return rollConfig;
    }
    /** @override */
    get actionType() {
      const type = this.attack!.type;
      return `${type.value === "ranged" ? "r" : "m"}${type.classification === "spell" ? "sak" : "wak"}`;
    }

    set ammunitionItem(value) {
      this._ammunitionItem = value;
    }

    get ammunitionItem() {
      if (this._ammunitionItem) return this._ammunitionItem;
      if (!this.ammunition) return undefined;
      const ammunitionItem = this.actor?.items?.get(this.ammunition);
      return ammunitionItem
    }
    get possibleOtherActivity() {
      return false;
    }
    get isOtherActivityCompatible() {
      return false;
    }

    get canUseOtherActivity() {
      return true;
    }

    get selfTriggerableOnly() {
      return false;
    }

    prepareData() {
      super.prepareData();
      if (this.otherActivityUuid && this.otherActivityUuid !== "") {
        console.warn(`midi-qol | otherActivityUuid is deprecated. Edit ${this.actor?.name ?? ""} ${this.item?.name ?? ""} ${this.name} and reset other activity. Currently ${this.otherActivityUuid}`);
      }
    }
    get confirmAmmunition(): { reason?: string, confirm: boolean, proceed: boolean } {
      // @ts-expect-error no dnd5e-types
      const ammunitionOptions = this.item.system.ammunitionOptions;
      let ammoAutoSelected = false;
      const ammoCount = (ammunitionOptions?.filter(ammo => !ammo.disabled) ?? []).length;
      if ((ammoCount ?? 0) > 0 && (this.ammunition ?? "") === "") {
        this.ammunition = ammunitionOptions?.find((ammo: { disabled?: boolean; value?: string }) => !ammo.disabled)?.value ?? "";
        ammoAutoSelected = true;
      }
      if (this.requireAmmunition && ammoCount === 0) return { reason: i18n("midi-qol.NoAmmunitionAvailable"), proceed: false, confirm: true };
      if (this.requireAmmunition && !this.ammunition) return { reason: i18n("midi-qol.NoAmmunitionSelected"), proceed: true, confirm: true };
      if (ammunitionOptions.some(ammo => ammo.value === this.ammunition && ammo.disabled)) return { reason: game.i18n?.format("midi-qol.NoAmmunition", { name: this.ammunitionItem?.name }), proceed: true, confirm: true };
      if (game.user?.isGM) return { confirm: configSettings.gmConfirmAmmunition && (ammoCount > 1 || ammoAutoSelected), proceed: true };
      return { confirm: configSettings.confirmAmmunition && (ammoCount > 1 || ammoAutoSelected), proceed: true };
    }

    get requireAmmunition(): boolean {
      return game.user?.isGM ? configSettings.gmRequireAmmunition : configSettings.playerRequireAmmunition;
    }
    async _usageChatContext(message) {
      const context = await super._usageChatContext(message);

      context.hasAttack = this.attack; // && !minimalCard && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
      return context;
    }
  }
}