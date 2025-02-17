import { debugEnabled, warn, GameSystemConfig, debug, log, i18n, MODULE_ID, i18nFormat } from "../../midi-qol.js";
import { unTimedExecuteAsGM } from "../GMAction.js";
import { Workflow } from "../Workflow.js";
import { defaultRollOptions } from "../patching.js";
import { ReplaceDefaultActivities, configSettings } from "../settings.js";
import { busyWait } from "../tests/setupTest.js";
import { addAdvAttribution, areMidiKeysPressed, asyncHooksCall, displayDSNForRoll, getSpeaker, processAttackRollBonusFlags } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { doActivityReactions } from "./activityHelpers.js";
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
      context.otherActivityOptions = this.item.system.activities
        .filter(a => a.id !== this.activity.id && a.isOtherActivityCompatible)
        .reduce((ret, a) => { ret.push({ label: `${a.name}`, value: a.id }); return ret }, [{ label: "Auto", value: "" }, { label: "None", value: "none" }]);
      context.otherActivityOptions?.forEach(option => { option.selected = option.value === context.currentOtherActivityId });
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
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField, NumberField } = foundry.data.fields;

      const schema = {
        ...super.defineSchema(),
        // @ ts-expect-error
        attackMode: new StringField({ name: "attackMode", initial: "oneHanded" }),
        ammunition: new StringField({ name: "ammunition", initial: "" }),
        otherActivityId: new StringField({ name: "otherActivity", initial: "" }),
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
      //@ts-expect-error
      return this.rollAttack({ event }, {}, {});
    }
    static #rollAttackAdvantage(event, target, message) {
      //@ts-expect-error
      return this.rollAttack({ event, midiOptions: { advantage: true } }, {}, {});
    }
    static #rollAttackDisadvantage(event, target, message) {
      //@ts-expect-error
      return this.rollAttack({ event, midiOptions: { disadvantage: true } }, {}, {});
    }

    async _triggerSubsequentActions(config, results) {
    }

    async rollAttack(config:any = {}, dialog: any = {}, message: any = {}) {
      let preRollHookId;
      let rollAttackHookId;
      let postConfigureDialogHookId;
      let rolls;
      config.midiOptions ??= this.midiOptions ?? this.workflow?.rollOptions ?? {};
      try {
        if (debugEnabled > 0) warn("MidiQOL | AttackActivity | rollAttack | Called", config, dialog, message);
        let returnValue = await this.configureAttackRoll(config);
        if (this.workflow?.aborted || !returnValue) return [];

        let requiresAmmoConfirmation = false;
        await this.workflow?.checkAttackAdvantage();

        //@ts-expect-error
        const areKeysPressed = game.system.utils.areKeysPressed;
        const keys = {
          normal: areKeysPressed(config.event, "skipDialogNormal"),
          advantage: areKeysPressed(config.event, "skipDialogAdvantage"),
          disadvantage: areKeysPressed(config.event, "skipDialogDisadvantage")
        };
        if (this.item.system.properties.has("amm")) {
          const ammoConfirmation = this.confirmAmmunition
          if (ammoConfirmation.reason) {
            ui.notifications?.warn(ammoConfirmation.reason + " Please choose different ammunition or cancel the attack.");
          }            
          if (!ammoConfirmation.proceed) {
            if (this.workflow) this.workflow.aborted = true;
          }
          requiresAmmoConfirmation = ammoConfirmation.confirm;
        }
        if (Object.values(keys).some(k => k)) dialog.configure = this.midiProperties.forceDialog || requiresAmmoConfirmation;
        else dialog.configure ??= !config.midiOptions.fastForwardAttack || this.midiProperties.forceDialog || requiresAmmoConfirmation;
        config.advantage = !!config.midiOptions.advantage || keys.advantage;
        config.disadvantage = !!config.midiOptions.disadvantage || keys.disadvantage;
        preRollHookId = Hooks.once("dnd5e.preRollAttackV2", (rollConfig, dialogConfig, messageConfig) => {
          if (this.workflow?.aborted) return false;
          if (this.workflow?.rollOptions?.rollToggle) dialogConfig.configure = !dialogConfig.configure;
          if (configSettings.checkTwoHanded && ["twoHanded", "offhand"].includes(rollConfig.attackMode)) {
            // check equipment - shield other weapons for equipped status
            if (this.actor.items.some(i => i.type === "equipment" && (i.system.type.baseItem === "shield" || i.system.type.value === "shield") && i.system.equipped)) {
              ui.notifications?.warn(i18n("midi-qol.TwoHandedShieldWarning"));
              if (this.workflow) this.workflow.aborted = true;
              return false;
            }
          }
          if (keys.disadvantage && this.workflow) {
            this.workflow.attackAdvAttribution.add(`DIS:keyPress`);
            this.workflow.advReminderAttackAdvAttribution.add(`DIS:keyPress`);
          }
          if (keys.advantage && this.workflow) {
            this.workflow.attackAdvAttribution.add(`ADV:keyPress`);
            this.workflow.advReminderAttackAdvAttribution.add(`ADV:keyPress`);
          }
          return true;
        });
        /*
        rollAttackHookId = Hooks.once("dnd5e.rollAttackV2", (rolls, { subject, ammoUpdate }) => {
          if (this.requireAmmunition && this.ammunition) {
            const chosenAmmunition = this.actor.items.get(ammoUpdate.id);
            const ammoQuantity = chosenAmmunition?.system.quantity;
            if (ammoQuantity === 0 && this.workflow) {
              ui.notifications?.warn(i18nFormat("midi-qol.NoAmmunition", { name: chosenAmmunition?.name }));
              if (this.workflow) this.workflow.abort = true;
            }
          }
        })
*/
        postConfigureDialogHookId = Hooks.once("dnd5e.postAttackRollConfiguration", (rolls, config: any, dialog: any, message: any) => {
          if (this.requireAmmunition && config.ammunition && this.workflow) {
            const chosenAmmunition = this.actor.items.get(config.ammunition);
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
        if (config.event && this.workflow) {
          this.workflow.rollOptions.rollToggle = areMidiKeysPressed(config.event, "RollToggle");
        }
        rolls = await super.rollAttack(config, dialog, message);
        if (!rolls || rolls.length === 0) {
          if (this.workflow) this.workflow.aborted = true;
          return;
        }
        if (dialog.configure && rolls[0]?.options?.ammunition && rolls[0].options.ammunition !== this.ammunition) {
          await this.update({ ammunition: rolls[0].options.ammunition });
          this.ammunition = rolls[0].options.ammunition;
          this._otherActivity = undefined; // reset this in case ammunition changed
        }
        if (this.workflow) {
          this.workflow.attackMode = rolls[0].options.attackMode ?? config.attackMode;
          this.workflow.ammunition = rolls[0].options.ammunition ?? config.ammunition;
          this.workflow.ammo = this.ammunitionItem;
          if (configSettings.allowUseMacro) {
              this.workflow.ammoOnUseMacros = foundry.utils.getProperty(this.workflow.ammo ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
          }
          if (this.workflow.workflowOptions?.attackRollDSN !== false) await displayDSNForRoll(rolls[0], "attackRollD20");
          await this.workflow?.setAttackRoll(rolls[0]);
          rolls[0] = await processAttackRollBonusFlags.bind(this.workflow)();
          if (["formulaadv", "adv"].includes(configSettings.rollAlternate)) addAdvAttribution(rolls[0], this.workflow.attackAdvAttribution);
          await this.workflow?.setAttackRoll(rolls[0]);
        }
        if (debugEnabled > 0) {
          warn("AttackActivity | rollAttack | setAttackRolls completed ", rolls);
          warn(`Attack Activity | workflow is suspended ${this.workflow?.suspended}`);
        }
        if (this.workflow?.suspended) this.workflow.unSuspend.bind(this.workflow)({ attackRoll: rolls[0] })
      } catch (err) {
        console.error("midi-qol | AttackActivity | rollAttack | Error configuring dialog", err);
      } finally {
        if (preRollHookId) Hooks.off("dnd5e.preRollAttackV2", preRollHookId);
        if (rollAttackHookId) Hooks.off("dnd5e.rollAttackV2", rollAttackHookId);
        if (postConfigureDialogHookId) Hooks.off("dnd5e.postRollConfiguration", postConfigureDialogHookId);

      }
      return rolls;
    }

    async configureAttackRoll(config): Promise<boolean> {
      if (debugEnabled > 0) warn("configureAttackRoll", this, config);
      if (!this.workflow) return false;
      let workflow: Workflow = this.workflow;
      config.midiOptions ??= this.midiOptions ?? {};
      if (workflow && !workflow.reactionQueried) {

      }

      if (debugEnabled > 1) debug("Entering configure attack roll", config.event, workflow, config.rolllOptions);

      // workflow.systemCard = config.midiOptions.systemCard;
      if (workflow.workflowType === "BaseWorkflow") {
        if (workflow.attackRoll && workflow.currentAction === workflow.WorkflowState_Completed) {
          // we are re-rolling the attack.
          await workflow.setDamageRolls(undefined)
          if (workflow.itemCardUuid) {
            await Workflow.removeItemCardAttackDamageButtons(workflow.itemCardUuid);
            await Workflow.removeItemCardConfirmRollButton(workflow.itemCardUuid);
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
            workflow.itemCardId = itemCard.id;
            workflow.itemCardUuid = itemCard.uuid;
            workflow.needItemCard = false;
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
      if (workflow.workflowType === "TrapWorkflow") workflow.rollOptions.fastForward = true;

      await doActivityReactions(this, workflow);
      await busyWait(0.01);
      if (configSettings.allowUseMacro && workflow.options.noTargetOnusemacro !== true) {
        await workflow.triggerTargetMacros(["isPreAttacked"]);
        if (workflow.aborted) {
          console.warn(`midi-qol | item ${workflow.ammo.name ?? ""} roll blocked by isPreAttacked macro`);
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
      let advantage = config.midiOptions.advantage
        || workflow.options.advantage
        || workflow?.advantage
        || workflow?.rollOptions.advantage
        || workflow?.workflowOptions?.advantage
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
        || workflow.options.disadvantage
        || workflow?.disadvantage
        || workflow?.workflowOptions?.disadvantage
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
    /*
    get otherActivityId() {
      if (!this.otherActivityId && this.otherActivityUuid) 
        return this.otherActivityUuid.split(".").pop();
      return this.otherActivityId; 
    }
    */
    get otherActivity() {
      if (this._otherActivity !== undefined) return this._otherActivity;
      if (this.otherActivityId === "none") return undefined;
      if (this.ammunitionItem) {
        //TODO consider making this a choice of activity
        this._otherActivity = this.ammunitionItem.system.activities?.contents.find(
          a => a.midiProperties?.automationOnly && a.isOtherActivityCompatible
        )
        // if (!this._otherActivity)
        //  this._otherActivity = this.ammunitionItem.system.activities.contents[0];
        if (this._otherActivity) {
          this._otherActivity.prepareData();
          return this._otherActivity;
        }
      }

      this._otherActivity = this.item.system.activities.get(this.otherActivityId)
      if (!this._otherActivity) {
        // Is there exactly 1 automation activity on the item
        const otherActivityOptions = this.item.system.activities.filter(a => a.midiProperties?.automationOnly);
        if (otherActivityOptions.length === 1) {
          this._otherActivity = otherActivityOptions[0];
        }
      }
      if (!this._otherActivity) {
        // Is there exactly 1 other activity compatible activity on the item
        const otherActivityOptions = this.item.system.activities.filter(a => a.isOtherActivityCompatible);
        if (otherActivityOptions.length === 1) {
          this._otherActivity = otherActivityOptions[0];
        }
      }
      // If none of the above match we can't tell which one to use.
      this._otherActivity?.prepareData();
      if (!this._otherActivity) this._otherActivity = null;
      return this._otherActivity;
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
      if (this.requireAmmunition && ammoCount === 0) return { reason: i18n("midi-qol.NoAmmunitionAvailable"), proceed: false, confirm: true };
      if (this.requireAmmunition && !this.ammunition) return { reason: i18n("midi-qol.NoAmmunitionSelected"), proceed: true, confirm: true };
      if (ammunitionOptions.some(ammo => ammo.value === this.ammunition && ammo.disabled)) return { reason: game.i18n?.format("midi-qol.NoAmmunition", { name: this.ammunitionItem?.name }), proceed: true, confirm: true };
      if (game.user?.isGM) return { confirm: configSettings.gmConfirmAmmunition && ammoCount > 1, proceed: true };
      return { confirm: this.confirmAmmunition && (ammoCount > 1), proceed: true };
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