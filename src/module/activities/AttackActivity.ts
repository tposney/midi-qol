import { debugEnabled, warn, GameSystemConfig, debug, log, i18n, MODULE_ID, i18nFormat } from "../../midi-qol.js";
import { unTimedExecuteAsGM } from "../GMAction.js";
import { Workflow } from "../Workflow.js";
import { defaultRollOptions } from "../patching.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { busyWait } from "../tests/setupTest.js";
import { addAdvAttribution, areMidiKeysPressed, asyncHooksCall, completeActivityUse, displayDSNForRoll, getSpeaker, processAttackRollBonusFlags } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { doActivityReactions, preTemplateTargets, requiresTargetConfirmation } from "./activityHelpers.js";
import { OnUseMacros } from "../apps/Item.js";

export var MidiAttackSheet;
export var MidiAttackActivity;
export var MidiAttackActivityData;
var AttackActivityData;

export function setupAttackActivity() {
  if (debugEnabled > 0) warn("MidiQOL | AttackActivity | setupAttackActivity | Called");

  //@ts-expect-error
  MidiAttackSheet = defineMidiAttackSheetClass(game.system.applications.activity.AttackSheet);
  MidiAttackActivity = defineMidiAttackActivityClass(GameSystemConfig.activityTypes.attack.documentClass);
  if (ReplaceDefaultActivities) {
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
        const types = Object.entries(GameSystemConfig.damageTypes).concat(Object.entries(GameSystemConfig.healingTypes));
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
              //@ts-expect-error
              value, label: config.label, selected: data.types.has(value)
            }))
          };
          return this._prepareDamagePartContext(context, part);
        })
      }
      if (debugEnabled > 0) {
        warn(("prepareEffectContext | context"), context);
      }
      return context;
    }

    _prepareContext(options) {
      return super._prepareContext(options);
    }

    _prepareSubmitData(event, formData) {
      let submitData = super._prepareSubmitData(event, formData);
      submitData.otherActivityUuid = "";
      return submitData;
    }

  }
}

let defineMidiAttackActivityClass = (ActivityClass: any) => {
  return class MidiAttackActivity extends MidiActivityMixin(ActivityClass) {
    _otherActivity: any | undefined;

    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.ATTACK", "midi-qol.SHARED"];

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField, NumberField, DocumentIdField } = foundry.data.fields;

      const schema = {
        ...super.defineSchema(),
        // @ ts-expect-error
        attackMode: new StringField({ name: "attackMode", initial: "oneHanded" }),
        ammunition: new StringField({ name: "ammunition", initial: "" }),
        // deprecated 
        otherActivityUuid: new StringField({ name: "otherActivityUuid", required: false, initial: "" }),
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
            rollAttackDisadvantage: MidiAttackActivity.#rollAttackDisadvantage
          }
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

    static #rollAttack(event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (!message || !workflow || workflow.currentAction === workflow.WorkflowState_Aborted || workflow.currentAction === workflow.WorkflowState_Completed) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: any = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.midiOptions.targets = new Set(workflow?.targets);
        attackConfig.workflow = workflow;
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        //@ts-expect-error
        return this.rollAttack({ event, workflow }, {}, {});
      }
    }

    static #rollAttackAdvantage(event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (!message || !workflow || workflow.currentAction === workflow.WorkflowState_Aborted || workflow.currentAction === workflow.WorkflowState_Completed) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: any = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig:any = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        attackConfig.advantage = true;
        attackConfig.disadvantage = false;
        //@ts-expect-error
        return this.rollAttack(attackConfig, {}, {});
      }
    }

    static #rollAttackDisadvantage(event, target, message) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (!message || !workflow || workflow.currentAction === workflow.WorkflowState_Aborted || workflow.currentAction === workflow.WorkflowState_Completed) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: any = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig:any = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        attackConfig.advantage = false;
        attackConfig.disadvantage = true;
        //@ts-expect-error
        return this.rollAttack(attackConfig, {}, {});
      }
    }

    async _triggerSubsequentActions(config, results) {
    }

    async useWIP(usage: any = {}, dialog: any = {}, message: any = {}) {
      let preValidateRollHookId;
      try {
        if (debugEnabled > 0) warn("MidiQOL | AttackActivity | use | Called", usage, dialog, message);
        usage.midiOptions ??= {};
        if (foundry.utils.getProperty(usage, "midiOptions.checkRollPerTarget") !== false) {
          const itemAttackPerTarget = foundry.utils.getProperty(this.item, "flags.midi-qol.rollAttackPerTarget");
          let isAttackPerTarget = itemAttackPerTarget === "always"
            || (configSettings.attackPerTarget && itemAttackPerTarget !== "never")
          // isAttackPerTarget &&= this.target?.template?.type === "";
          if (isAttackPerTarget) {
            foundry.utils.setProperty(usage, "midiOptions.workflowOptions.rollAttackPerTarget", true);
          }
        }
        return super.use(usage, dialog, message);
      } finally {
        if (preValidateRollHookId) Hooks.off("dnd5e.preValidateRollAttack", preValidateRollHookId);
      }
    }

    async use(config: any = {}, dialog: any = {}, message: any = {}) {
      if (debugEnabled > 0) warn("MidiQOL | AttackActivity | use | Called", config, dialog, message);
      config.midiOptions ??= {};
      const itemAttackPerTarget = foundry.utils.getProperty(this.item, "flags.midi-qol.rollAttackPerTarget");
      let isAttackPerTarget = itemAttackPerTarget === "always"
        || (configSettings.attackPerTarget && itemAttackPerTarget !== "never")
      isAttackPerTarget &&= this.target?.template?.type === ""; // only works if there is no AoE template targeting.
      // Solution for this is to have a lead Use activity that sets the targets and then calls the attack activity as a trigger activity
      const willHaveTargets = (config.midiOptions?.targetsToUse?.size ?? 0) > 0 || (game.user?.targets?.size ?? 0) > 0 || requiresTargetConfirmation(this, {})
      if (!isAttackPerTarget || !willHaveTargets)
        return super.use(config, dialog, message);
      // Do target confirmation if required
      if (!config.midiOptions.targetsToUse && !await preTemplateTargets(this, config.midiOptions)) return false;
      let returnValue;
      let checkReaction = true; // first pass do reaction checks
      let checkBonusAction = true; // first pass do bonus action checks
      let targets;
      if (config.midiOptions.targetsToUse) targets = config.midiOptions.targetsToUse;
      if (!targets) targets = new Set(game.user?.targets);
      for (let target of targets) {
        let item = this.item.clone({}, { keepId: true });
        let activity = item.system.activities.get(this.id);
        const attackConfig = foundry.utils.deepClone(config);
        attackConfig.midiOptions.targetsToUse = new Set([target]);
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.midiOptions.proceedChecks = { checkReaction, checkBonusAction };
        attackConfig.midiOptions.workflowOptions.targetConfirmation = "never";
        const attackDialog = foundry.utils.deepClone(dialog);
        delete attackDialog.configure;
        returnValue = await super.use.bind(activity)(attackConfig, attackDialog, message);
        checkReaction = false;
        checkBonusAction = false;
      }
      return returnValue;
    }

    async rollAttack(config: any = {}, dialog: any = {}, message: any = {}) {
      let preRollHookId;
      let rollAttackHookId;
      let postAttackRollConfigurationHook;
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
        if (workflow?.aborted || !returnValue) return [];

        let requiresAmmoConfirmation = false;
        await workflow.checkAttackAdvantage();
        //@ts-expect-error
        const areKeysPressed = game.system.utils.areKeysPressed;
        const keys = {
          normal: areKeysPressed(config.event ?? workflow.workflowOptions.event, "skipDialogNormal"),
          advantage: areKeysPressed(config.event ?? workflow.workflowOptions.event, "skipDialogAdvantage"),
          disadvantage: areKeysPressed(config.event ?? workflow.workflowOptions.event, "skipDialogDisadvantage")
        };
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
        if (Object.values(keys).some(k => k)) dialog.configure = !!(this.midiProperties.forceDialog || requiresAmmoConfirmation);
        if (config.workflow && areMidiKeysPressed(config.event, "RollToggle")) config.workflow.rollOptions.rollToggle = !config.workflow.rollOptions.rollToggle;
        else dialog.configure ??= !(config.midiOptions.fastForwardAttack ?? workflow.workflowOptions.fastForwardAttack ?? false) || this.midiProperties.forceDialog || requiresAmmoConfirmation;
        if (keys.advantage) workflow.rollOptions.advantage = keys.advantage;
        if (keys.disadvantage) workflow.rollOptions.disadvantage = keys.disadvantage;
        config.advantage ??= !!keys.advantage || !!(config.midiOptions.advantage ?? workflow.workflowOptions.advantage);
        config.disadvantage ??= !!keys.disadvantage || !!(config.midiOptions.disadvantage ?? workflow.workflowOptions.disadvantage);
        preRollHookId = Hooks.once("dnd5e.preRollAttackV2", (rollConfig, dialogConfig, messageConfig) => {
          if (workflow?.aborted) return false;
          if (workflow?.rollOptions?.rollToggle) dialogConfig.configure = !dialogConfig.configure;
          if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rollConfig.attackMode)) {
            // check equipment - shield other weapons for equipped status
            if (this.actor.items.some(i => i.type === "equipment" && (i.system.type.baseItem === "shield" || i.system.type.value === "shield") && i.system.equipped)) {
              ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
              if (workflow) workflow.aborted = true;
              return false;
            }
          }
          if (keys.disadvantage && workflow) {
            workflow.attackAdvAttribution.add(`DIS:keyPress`);
            workflow.advReminderAttackAdvAttribution.add(`DIS:keyPress`);
          }
          if (keys.advantage && workflow) {
            workflow.attackAdvAttribution.add(`ADV:keyPress`);
            workflow.advReminderAttackAdvAttribution.add(`ADV:keyPress`);
          }
          return true;
        });

        postAttackRollConfigurationHook = Hooks.once("dnd5e.postAttackRollConfiguration", (rolls, config: any, dialog: any, message: any) => {
          if (this.requireAmmunition && this.item.system.properties?.has("amm") && workflow) {
            const chosenAmmunition = this.actor.items.get(rolls[0].options.ammunition);
            if ((chosenAmmunition?.system.quantity ?? 0) <= 0) ui.notifications?.error(i18nFormat("midi-qol.NoAmmunition", { name: chosenAmmunition?.name ?? "Ammunition" }));
            return chosenAmmunition?.system.quantity > 0;
          }
          return true;
        })
        message ??= {};
        message.create ??= config.midiOptions.chatMessage;
        config.attackMode = this.attackMode ?? "oneHanded";
        if (config.event && areMidiKeysPressed(config.event, "Versatile") && this.item.system.damage?.versatile && this.item.system.properties.has("ver")) {
          config.attackMode = config.attackMode === "twoHanded" ? "oneHanded" : "twoHanded";
        }
        config.ammunition = this.ammunition;
        if (config.event && workflow) {
          workflow.rollOptions.rollToggle = areMidiKeysPressed(config.event, "RollToggle");
        }
        rolls = await super.rollAttack(config, dialog, message);
        if (!rolls || rolls.length === 0) {
          if (workflow) workflow.aborted = true;
          return;
        }
        if (dialog.configure && rolls[0]?.options?.ammunition && rolls[0].options.ammunition !== this.ammunition) {
          await this.update({ ammunition: rolls[0].options.ammunition });
          this.ammunition = rolls[0].options.ammunition;
          this._otherActivity = undefined; // reset this in case ammunition changed
        }
        if (workflow) {
          workflow.attackMode = rolls[0].options.attackMode ?? config.attackMode;
          workflow.ammunition = rolls[0].options.ammunition ?? config.ammunition;
          workflow.ammo = this.ammunitionItem;
          if (configSettings.allowUseMacro) {
            workflow.ammoOnUseMacros = foundry.utils.getProperty(workflow.ammo ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
          }
          if (workflow.workflowOptions?.attackRollDSN !== false) await displayDSNForRoll(rolls[0], "attackRollD20");
          await workflow?.setAttackRoll(rolls[0]);
          rolls[0] = await processAttackRollBonusFlags.bind(workflow)();
          if (["formulaadv", "adv"].includes(configSettings.rollAlternate)) addAdvAttribution(rolls[0], workflow.attackAdvAttribution);
          await workflow?.setAttackRoll(rolls[0]);
        }
        if (debugEnabled > 0) {
          warn("AttackActivity | rollAttack | setAttackRolls completed ", rolls);
          warn(`Attack Activity | workflow is suspended ${workflow?.suspended}`);
        }
        if (workflow?.suspended) workflow.unSuspend.bind(workflow)({ attackRoll: rolls[0] })
      } catch (err) {
        console.error("midi-qol | AttackActivity | rollAttack | Error configuring dialog", err);
      } finally {
        if (preRollHookId) Hooks.off("dnd5e.preRollAttackV2", preRollHookId);
        if (rollAttackHookId) Hooks.off("dnd5e.rollAttackV2", rollAttackHookId);
        if (postAttackRollConfigurationHook) Hooks.off("dnd5e.postRollConfiguration", postAttackRollConfigurationHook);

      }
      return rolls;
    }

    async configureAttackRoll(config): Promise<boolean> {
      if (debugEnabled > 0) warn("configureAttackRoll", this, config);
      if (!config.workflow) return false;
      let workflow: Workflow = config.workflow;
      config.midiOptions ??= {};
      if (workflow && !workflow.reactionQueried) {
      }

      if (debugEnabled > 1) debug("Entering configure attack roll", config.event, workflow, config.rolllOptions);

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
                    ...this.messageFlags,
                    messageType: "usage",
                    use: {
                      effects: this.applicableEffects?.map(e => e.id)
                    }
                  }
                }
              },
              hasConsumption: false
            }, { flags: workflow.chatCard.flags })
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
      await busyWait(0.01);
      if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnusemacro !== true) {
        await workflow.triggerTargetMacros(["isPreAttacked"]);
        if (workflow.aborted) {
          console.warn(`midi-qol | item ${workflow.item?.name ?? ""} roll blocked by isPreAttacked macro`);
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

      // Active defence resolves by triggering saving throws and returns early
      if (game.user?.isGM && workflow.useActiveDefence) {
        delete config.midiOptions.event; // for dnd 3.0
        // TODO work out what to do with active defense 
        /*
        let result: Roll = await wrapped(foundry.utils.mergeObject(options, {
          advantage: false,
          disadvantage: workflow.rollOptions.disadvantage,
          chatMessage: false,
          fastForward: true,
          messageData: {
            speaker: getSpeaker(this.actor)
          }
        }, { overwrite: true, insertKeys: true, insertValues: true }));
        return workflow.activeDefence(this, result);
        */
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
      if (workflow.flankingAdvantage) {
        workflow.attackAdvAttribution.add(`ADV:flanking`);
        workflow.advReminderAttackAdvAttribution.add(`ADV:Flanking`);
      }

      let disadvantage = config.midiOptions.disadvantage
        || workflow.workflowOptions.disadvantage
        || workflow.disadvantage
        || workflow.workflowOptions?.disadvantage
        || workflow.rollOptions.disadvantage;
      if (workflow.noDisadvantage) disadvantage = false;

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
          speaker: getSpeaker(this.actor)
        }
      },
        { insertKeys: true, overwrite: true });
      if (workflow.rollOptions.rollToggle) config.midiOptions.fastForward = !config.midiOptions.fastForward;
      if (advantage) config.midiOptions.advantage ||= true; // advantage passed to the roll takes precedence
      if (disadvantage) config.midiOptions.disadvantage ||= true; // disadvantage passed to the roll takes precedence

      // Setup labels for advantage reminder
      const advantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("ADV:")).map(s => s.replace("ADV:", ""));;
      if (advantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.advantageLabels", advantageLabels);
      const disadvantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("DIS:")).map(s => s.replace("DIS:", ""));
      if (disadvantageLabels.length > 0) foundry.utils.setProperty(config.midiOptions, "dialogOptions.adv-reminder.disadvantageLabels", disadvantageLabels);

      if (config.midiOptions.fumble === true || config.midiOptions.fumble === false)
        delete config.midiOptions.fumble;

      config.midiOptions.chatMessage = false;
      if (config.midiOptions.versatile) config.attackMode = "twoHanded";
      return true;
    }

    /** @override */
    get actionType() {
      const type = this.attack.type;
      return `${type.value === "ranged" ? "r" : "m"}${type.classification === "spell" ? "sak" : "wak"}`;
    }

    get ammunitionItem() {
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
      const ammunitionOptions = this.item.system.ammunitionOptions;
      const ammoCount = (ammunitionOptions?.filter(ammo => !ammo.disabled) ?? []).length;
      if ((ammoCount ?? 0) > 0 && (this.ammunition ?? "") === "") {
        this.ammunition = ammunitionOptions?.find((ammo: { disabled?: boolean; value?: string }) => !ammo.disabled)?.value ?? "";
      }
      if (this.requireAmmunition && ammoCount === 0) return { reason: i18n("midi-qol.NoAmmunitionAvailable"), proceed: false, confirm: true };
      if (this.requireAmmunition && !this.ammunition) return { reason: i18n("midi-qol.NoAmmunitionSelected"), proceed: true, confirm: true };
      if (ammunitionOptions.some(ammo => ammo.value === this.ammunition && ammo.disabled)) return { reason: game.i18n?.format("midi-qol.NoAmmunition", { name: this.ammunitionItem?.name }), proceed: true, confirm: true };
      if (game.user?.isGM) return { confirm: configSettings.gmConfirmAmmunition && ammoCount > 1, proceed: true };
      return { confirm: configSettings.confirmAmmunition && (ammoCount > 1), proceed: true };
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