import { debugEnabled, warn, error, busyWait, GameSystemConfig, debug, log, i18n, MODULE_ID, i18nFormat } from "../../midi-qol.js";
import { unTimedExecuteAsGM } from "../GMAction.js";
import { Workflow } from "../Workflow.js";
import { RollModifierTracker, AdvantageFlags, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags } from "../lib/RollModifierTracker.js";
import { MidiOptions } from "../utils.js";
import { replaceDefaultActivities, configSettings, confirmTargetOptions, safeGetGameSetting } from "../settings.js";
import { addAttribution, areMidiKeysPressed, callActivityHooks, completeActivityUse, addUpdatesCache, displayDSNForRoll, getSpeaker, isAutoFastForward, updateUserTargets, validTargetTokens } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { doActivityReactions, preTemplateTargets, requiresTargetConfirmation } from "./activityHelpers.js";
import { OnUseMacros } from "../apps/Item.js";
import { Activity, ActivityUseConfiguration, DND5ETargetDescriptor, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";

export let MidiAttackSheet: ReturnType<typeof defineMidiAttackSheetClass>;
export let MidiAttackActivity: ReturnType<typeof defineMidiAttackActivityClass>;
// export let MidiAttackActivityData;

/**
 * Get the effective forceRollDialog setting for an activity.
 * Returns "always" | "never" | "default"
 */
function getEffectiveForceRollDialog(activity: any): "always" | "never" | "default" {
  const activitySetting = activity.midiProperties?.forceRollDialog;
  if (activitySetting === "always" || activitySetting === "never") {
    return activitySetting;
  }
  return "default";
}

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
      // Add healing types to the existing damageParts typeOptions (dnd5e only includes damageTypes)
      if (context.damageParts?.length) {
        const healingTypes = Object.entries(GameSystemConfig.healingTypes).map(([value, config]) => ({
          value, label: config.label, selected: false
        }));
        for (const part of context.damageParts) {
          // Mark existing healing type selections (types may be a Set or undefined)
          const typesSet = part.data?.types instanceof Set ? part.data.types : new Set();
          for (const healingType of healingTypes) {
            healingType.selected = typesSet.has(healingType.value);
          }
          // Add healing types to the end of typeOptions
          part.typeOptions = [...(part.typeOptions ?? []), ...healingTypes.map(h => ({ ...h }))];
        }
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

    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.ATTACK"];

    static defineSchema() {
      const { StringField, ArrayField, BooleanField, SchemaField, ObjectField, NumberField, DocumentIdField } = foundry.data.fields;

      const schema = {
        ...super.defineSchema(),
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

      if (!message || !workflow || (workflow.currentAction && [workflow.WorkflowState_Abort, workflow.WorkflowState_Completed].includes(workflow.currentAction))) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: ActivityUseConfiguration = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.midiOptions.targets = new Set(workflow?.targets);
        attackConfig.workflow = workflow;
        if (workflow) {
          attackConfig.midiOptions.workflowOptions ??= {};
          attackConfig.midiOptions.workflowOptions.autoRollAttack = true;
        }
        attackConfig.event = event;
        // @ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig: ActivityUseConfiguration = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        workflow.advantage = undefined;
        workflow.disadvantage = undefined;
        attackConfig.midiOptions.advantage = undefined;
        attackConfig.midiOptions.disadvantage = undefined;
        workflow.activity = this;
        // Update targets if user has selected new ones; preserve existing targets otherwise
        // (e.g. template-derived targets, programmatic targetsToUse, or no selection)
        const currentTargets = validTargetTokens(new Set(game.user?.targets));
        if (currentTargets.size > 0) workflow.setTargets(currentTargets);
        // @ts-expect-error
        return this.rollAttack({ workflow }, {}, {});
      }
    }

    static #rollAttackAdvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (!message || !workflow || (workflow.currentAction && [workflow.WorkflowState_Abort, workflow.WorkflowState_Completed].includes(workflow.currentAction))) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: any = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        if (workflow) {
          attackConfig.midiOptions.workflowOptions ??= {};
          attackConfig.midiOptions.workflowOptions.advantage = true;
          attackConfig.midiOptions.workflowOptions.disadvantage = false;
          attackConfig.midiOptions.workflowOptions.autoRollAttack = true;
        }
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig: ActivityUseConfiguration = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        // User explicitly chose advantage — set workflowOptions so checkAttackAdvantage processes it
        attackConfig.midiOptions.workflowOptions.advantage = true;
        attackConfig.midiOptions.workflowOptions.disadvantage = false;
        workflow.activity = this;
        // Update targets if user has selected new ones; preserve existing targets otherwise
        const currentTargets = validTargetTokens(new Set(game.user?.targets));
        if (currentTargets.size > 0) workflow.setTargets(currentTargets);
        //@ts-expect-error
        return this.rollAttack(attackConfig, {}, {});
      }
    }

    static #rollAttackDisadvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const workflow = Workflow.getWorkflow(message?.uuid);
      if (!message || !workflow || (workflow.currentAction && [workflow.WorkflowState_Abort, workflow.WorkflowState_Completed].includes(workflow.currentAction))) {
        if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        const attackConfig: ActivityUseConfiguration = { event, workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= {};
        attackConfig.workflow = workflow;
        if (workflow) {
          attackConfig.midiOptions.workflowOptions ??= {};
          attackConfig.midiOptions.workflowOptions.autoRollAttack = true;
          attackConfig.midiOptions.advantage = false;
          attackConfig.midiOptions.disadvantage = true;
        }
        //@ts-expect-error
        this.use(attackConfig, {}, {});
      } else {
        const attackConfig: any = { workflow };
        attackConfig.midiOptions = workflow?.rollOptions ?? {};
        attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
        // User explicitly chose disadvantage — set workflowOptions so checkAttackAdvantage processes it
        attackConfig.midiOptions.workflowOptions.advantage = false;
        attackConfig.midiOptions.workflowOptions.disadvantage = true;
        workflow.activity = this;
        // Update targets if user has selected new ones; preserve existing targets otherwise
        const currentTargets = validTargetTokens(new Set(game.user?.targets));
        if (currentTargets.size > 0) workflow.setTargets(currentTargets);
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

    async use(this: Activity, usage: ActivityUseConfiguration = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}) {
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
      const localSavedTargetIds = Array.from(game.user?.targets ?? []).map(t => t.id);
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
      updateUserTargets(localSavedTargetIds);
      return returnValue;
    }

    async rollAttack(config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}): Promise<Roll[] | null> {
      const hookIds: Record<string, number | undefined> = {};
      let rolls;
      const workflow = config.workflow;
      config.midiOptions ??= {};
      // @ts-expect-error
      const areKeysPressed = game.system.utils.areKeysPressed;

      try {
        if (debugEnabled > 0) warn("MidiQOL | AttackActivity | rollAttack | Called", config, dialog, message);

        if (workflow) 
          workflow.rollOptions.rollToggle = areMidiKeysPressed(config.event, "RollToggle");

        let returnValue = await this.configureAttackRoll(config);
        // Check returnValue first - if false (no workflow), fall through to dnd5e base behavior
        if (!returnValue)
          return super.rollAttack?.(config, dialog, message) ?? [];

        if (!workflow || workflow?.aborted) return [];
        if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
          await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
          if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
        }
        // Ensure config.event is set for dnd5e key handling
        config.event ??= workflow.rollOptions.event;

        let requiresAmmoConfirmation = false;
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
        const effectiveForceRollDialog = getEffectiveForceRollDialog(this);

        // Determine dialog.configure based on forceRollDialog setting and shift key
        // Alt/Ctrl (advantage/disadvantage) are handled by dnd5e, only shift key skips dialog
        if (areKeysPressed(config.event, "skipDialogNormal")) {
          // Shift key pressed - skip dialog unless forceRollDialog="always"
          dialog.configure = effectiveForceRollDialog === "always";
        } else if (effectiveForceRollDialog === "always") {
          dialog.configure = true;
        } else if (effectiveForceRollDialog === "never") {
          dialog.configure = false;
        } else {
          // "default" - use fast forward settings
          dialog.configure = !isAutoFastForward("attack", { workflow });
        }

        // Ammo confirmation always requires dialog
        if (requiresAmmoConfirmation) {
          dialog.configure = true;
        }

        // A caller can name the attack mode up front - automation and macros have no user to ask.
        // dnd5e validates it against the item's own attackModes and falls back to the first one, so
        // an unrecognised mode degrades to a normal attack rather than reinstating the prompt.
        const suppliedAttackMode = config.midiOptions?.workflowOptions?.attackMode;
        if (suppliedAttackMode) config.attackMode = suppliedAttackMode;

        // Thrown weapons normally require dialog to choose attack mode, but respect forceRollDialog="never"
        //@ts-expect-error no dnd5e-types
        if (this.item?.system.properties.has("thr") && effectiveForceRollDialog !== "never"
          && !suppliedAttackMode) {
          dialog.configure = true;
        }

        dialog.options ??= {};

        hookIds["dnd5e.preRollAttack"] = Hooks.once("dnd5e.preRollAttack", (rollConfig, dialogConfig, messageConfig) => {
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
          } else if (!rollConfig.attackMode && dialogConfig.options?.attackModeOptions?.length) dialogConfig.configure = true;

          // Apply roll modifiers (auto-fail/success, min/max) for attack rolls
          const actType = this.actionType;
          const attackModifierFlags: RollModifierFlags = {
            failFlags: ["fail.all", "fail.attack.all", `fail.attack.${actType}`],
            successFlags: ["success.all", "success.attack.all", `success.attack.${actType}`],
            maxFlags: ["max.attack.all", `max.attack.${actType}`],
            minFlags: ["min.attack.all", `min.attack.${actType}`]
          };
          if (workflow?.attackRollModifierTracker) {
            computeRollModifiers(this.actor!, attackModifierFlags, workflow.attackRollModifierTracker, { workflow });
            applyRollModifiers(workflow.attackRollModifierTracker, rollConfig, dialogConfig);
          }

          return true;
        });
        hookIds["dnd5e.rollAttack"] = Hooks.once("dnd5e.rollAttack", (rolls, { ammoUpdate, subject }) => {
          if (ammoUpdate?.destroy) {
            // @ts-expect-error no dnd5e-types
            const data = this.actor.items.get(ammoUpdate.id).toObject();
            addUpdatesCache(workflow.id, { "flags.midi-qol.ammunitionData": data });
          }
        });
        hookIds["dnd5e.postAttackRollConfiguration"] = Hooks.once("dnd5e.postAttackRollConfiguration", (rolls, config, dialog, message) => {
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
        // Capture target descriptors last, after all other modules have had a chance to modify AC (e.g. cover)
        //@ts-expect-error dnd5e hook not in fvtt-types
        hookIds["dnd5e.postRollConfiguration"] = Hooks.once("dnd5e.postRollConfiguration", (rolls, config, dialog, message) => {
          const targetDescriptors = foundry.utils.getProperty(message, "data.flags.dnd5e.targets") as DND5ETargetDescriptor[] | undefined;
          if (targetDescriptors && workflow) {
            // Don't mutate td.ac — it's a shared reference with the chat message data.
            // null AC (coverTotal) is handled downstream in checkHits() as auto-miss.
            workflow.targetDescriptors = targetDescriptors as DND5ETargetDescriptor[];
          }
        });
        // Active defence resolves by triggering saving throws and returns early
        if (workflow.useActiveDefence) {
          message.create = false; // go through the roll process but don't show the attack roll.
        }

        message ??= {};
        message.create ??= config.midiOptions.chatMessage;
        const rollMode = safeGetGameSetting("core", "messageMode") as string;
        const showChatAttackCard = game.user?.isGM && configSettings.gmAttackDamageCards && ["self", "blind", "gm"].includes(rollMode);
        if (showChatAttackCard) {
          // Show a chat card for attack rolls if the players are not going to see the midi card.
          message.create = true;
          foundry.utils.setProperty(message, "data.flags.midi-qol.gmHide", true); // since the gm will see the midi card hide the attack card for the author
          message.rollMode = rollMode as keyof CONFIG.Dice.RollModes;
        }
        config.attackMode ??= this.attackMode ?? "oneHanded";
        // @ts-expect-error isVersatile is a dnd5e getter
        if (config.event && areMidiKeysPressed(config.event, "Versatile") && this.item.isVersatile) {
          config.attackMode = "twoHanded";
        }
        // @ts-expect-error weirdness with how I did the types
        rolls = await super.rollAttack(config, dialog, message);

        if (!rolls || rolls.length === 0) {
          // if (workflow) workflow.aborted = true;
          return null;
        }
        if (dialog.configure && rolls[0]?.options?.ammunition && rolls[0].options.ammunition !== this.ammunition) {
          await this.update({ ammunition: rolls[0].options.ammunition });
          this.ammunition = rolls[0].options.ammunition;
          this.ammunitionItem = this.actor?.items.get(this.ammunition);
          this._otherActivity = undefined; // reset this in case ammunition changed
        }

        if (workflow) {
          // Sync tracker with what the player actually chose in the roll dialog
          // @ts-expect-error CONFIG.Dice.D20Roll not typed
          const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
          const returnedAdvMode = rolls[0]?.options?.advantageMode;
          if (returnedAdvMode !== undefined) {
            const trackerMode = workflow.attackRollModifierTracker.advantageMode;
            if (returnedAdvMode !== trackerMode) {
              const label = i18n("midi-qol.ConfigButtons");
              if (returnedAdvMode === ADV_MODE.ADVANTAGE) {
                workflow.attackRollModifierTracker.advantage.setOverride("config-buttons", label);
                workflow.attackRollModifierTracker.disadvantage.clearOverride();
              } else if (returnedAdvMode === ADV_MODE.DISADVANTAGE) {
                workflow.attackRollModifierTracker.disadvantage.setOverride("config-buttons", label);
                workflow.attackRollModifierTracker.advantage.clearOverride();
              } else {
                // Player chose normal — clear any overrides
                workflow.attackRollModifierTracker.advantage.clearOverride();
                workflow.attackRollModifierTracker.disadvantage.clearOverride();
              }
            }
          }

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
          // Always add attribution to roll for indicator/tooltip display
          addAttribution(rolls[0], workflow.attackAttribution);
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
        for (const [hookName, hookId] of Object.entries(hookIds)) {
          //@ts-expect-error 
          if (hookId !== undefined) Hooks.off(hookName, hookId);
        }
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

      // preAttackRoll hooks may modify flags; checkAttackAdvantage() runs after them (below)
      if (await callActivityHooks(this, "midi-qol.preAttackRoll", workflow) === false) {
        console.warn("midi-qol | attack roll blocked by preAttackRoll hook");
        return false;
      }
      await workflow.checkAttackAdvantage();
      // Process keyboard modifiers (ctrl/alt for advantage/disadvantage) after flag processing
      workflow.attackRollModifierTracker.processKeys(config);
      if (await callActivityHooks(this, "midi-qol.preAttackRollConfig", workflow) === false) {
        console.warn("midi-qol | attack roll blocked by preAttackRollConfig hook");
        return false;
      }
      if (configSettings.allowUseMacro && workflow.workflowOptions?.noOnUseMacro !== true) {
        await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preAttackRollConfig"), "OnUse", "preAttackRollConfig");
        if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preAttackRollConfig"), "OnUse", "preAttackRollConfig");
      }

      // Set config advantage/disadvantage from tracker (after all hooks/macros have had a chance to modify)
      if (workflow.attackRollModifierTracker.hasAdvantage) config.advantage = true;
      if (workflow.attackRollModifierTracker.hasDisadvantage) config.disadvantage = true;

      workflow.attackRollCount += 1;
      if (workflow.attackRollCount > 1) workflow.damageRollCount = 0;

      // create an options object to pass to the roll.
      config.midiOptions = foundry.utils.mergeObject(config.midiOptions, {
        chatMessage: (["TrapWorkflow", "Workflow"].includes(workflow.workflowType)) ? false : config.midiOptions.chatMessage,
        fastForward: workflow.workflowOptions?.fastForwardAttack ?? workflow.rollOptions.fastForwardAttack ?? config.midiOptions.fastForward,
        messageData: {
          speaker: getSpeaker(this.actor!)
        }
      },
        { insertKeys: true, overwrite: true });
      if (workflow.rollOptions.rollToggle) config.midiOptions.fastForward = !config.midiOptions.fastForward;

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

/**
 * Compute attack advantage/disadvantage from actor flags and target grants flags.
 * This handles the flag-based advantage checks for attacks.
 * Special rules (flanking, invisible, nearby foe, heavy weapons) are handled separately in Workflow.
 *
 * @param actor - The attacking actor
 * @param actionType - The action type (mwak, rwak, msak, rsak, etc.)
 * @param options - MidiOptions including workflow, target info
 * @param abilityId - Optional ability ID for ability-based attack flags (e.g., "str", "dex")
 * @param tracker - Optional existing RollModifierTracker to populate
 * @returns RollModifierTracker with attack advantage attribution
 */
export async function computeAttackAdvantage(
  actor: Actor.Implementation,
  actionType: string,
  options: MidiOptions,
  abilityId?: string,
  tracker?: RollModifierTracker
): Promise<RollModifierTracker> {
  tracker ??= new RollModifierTracker();

  // Spell school for school-specific attack flags
  // @ts-expect-error no dnd5e-types
  const attackSchool: string | undefined = options.item?.system?.school;

  // Define attack advantage flags
  const attackFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.attack.all",
      `advantage.attack.${actionType}`,
      // Include ability-based attack flags if abilityId is provided
      ...(abilityId ? [`advantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`advantage.attack.school.${attackSchool}`] : [])
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.attack.all",
      `disadvantage.attack.${actionType}`,
      ...(abilityId ? [`disadvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`disadvantage.attack.school.${attackSchool}`] : [])
    ],
    noAdvantageFlags: [
      "noAdvantage.all",
      "noAdvantage.attack.all",
      `noAdvantage.attack.${actionType}`,
      ...(abilityId ? [`noAdvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`noAdvantage.attack.school.${attackSchool}`] : [])
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      "noDisadvantage.attack.all",
      `noDisadvantage.attack.${actionType}`,
      ...(abilityId ? [`noDisadvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`noDisadvantage.attack.school.${attackSchool}`] : [])
    ],
    systemRollModeFields: [], // dnd5e doesn't have native attack roll modes at actor level
    // Target grants flags (checked on target actor)
    sourceAdvantageFlags: [
      "grants.advantage.all",
      "grants.advantage.attack.all",
      `grants.advantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.advantage.attack.school.${attackSchool}`] : [])
    ],
    sourceDisadvantageFlags: [
      "grants.disadvantage.all",
      "grants.disadvantage.attack.all",
      `grants.disadvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.disadvantage.attack.school.${attackSchool}`] : [])
    ],
    sourceNoAdvantageFlags: [
      "grants.noAdvantage.attack.all",
      `grants.noAdvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.noAdvantage.attack.school.${attackSchool}`] : [])
    ],
    sourceNoDisadvantageFlags: [
      "grants.noDisadvantage.attack.all",
      `grants.noDisadvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.noDisadvantage.attack.school.${attackSchool}`] : [])
    ]
  };

  // For attacks, the entity that grants advantage/disadvantage is the defender (target)
  const targetToken = options.workflow?.targets?.first();
  const targetActor = targetToken?.actor ?? undefined;

  await computeAdvantageFlags(actor, attackFlags, {
    ...options,
    grantsActor: targetActor,
    grantsToken: targetToken
  }, tracker);

  return tracker;
}