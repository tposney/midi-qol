import { debug, debugEnabled, MODULE_ID, warn } from "../../midi-qol.js";
import { createActivityTemplateRegions } from "../activities/activityHelpers.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { collectDamageRules } from "../lib/damageRules.js";
import { saveDisplayMode } from "../lib/saveVisibility.js";
import { TokenDocumentSet } from "../lib/tokenDocumentSet.js";
import { configSettings, safeGetGameSetting } from "../settings.js";
import { saveUndoData } from "../undo.js";
import { activityHasAreaTarget, activityHasEmanationNoTemplate, expireMyEffects, getActivityAutoTargetAction, getAutoRollDamage, processDamageRoll, validTargetTokens } from "../utils.js";
import { Workflow, type ActiveDefenceWorkflow, type DamageOnlyWorkflow, type SavesFirstWorkflow, type TrapWorkflow } from "../Workflow.js";
import { registerFlowVariant } from "../steps/flows.js";

/*
 * The flows' own implementations of midi's steps (M5, plan ~/Documents/midi-next-M5-steps-as-data-plan-2026-11-19.md):
 * what the workflow subclasses' WorkflowState_<name> overrides did, under the same step ids, so a flow's steps keep
 * their hooks, passes and module changes. `base()` runs the step's own implementation (the old `super` call).
 */
export function registerFlowVariants(): void {
  registerFlowVariant("midi-qol.savesFirst", "midi-qol.WaitForSaves", async ({ workflow, base }: { workflow: SavesFirstWorkflow, base: () => Promise<unknown> }) => {
    await base();
    return "midi-qol.SavesComplete";
  });

  registerFlowVariant("midi-qol.savesFirst", "midi-qol.SavesComplete", async ({ workflow, base }: { workflow: SavesFirstWorkflow, base: () => Promise<unknown> }) => {
    expireMyEffects.bind(workflow)(["1Action", "1Spell"]);
    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("postSave"), "OnUse", "postSave");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("postSave"), "OnUse", "postSave");
    }
    const hasDamageRoll = workflow.activity.hasDamage || workflow.otherActivity?.hasDamage || workflow.activity.hasHealing || workflow.otherActivity?.hasHealing;
    if (!hasDamageRoll) return "midi-qol.AllRollsComplete";
    if (getAutoRollDamage(workflow) === "always") return "midi-qol.WaitForDamageRoll";
    const noHits = workflow.hitTargets.count === 0 && workflow.hitTargetsEC.count === 0;
    // With hits not checked there are no hit targets, which is not a miss.
    const allMissed = configSettings.autoCheckHit !== "none" && noHits && workflow.targets.count !== 0;
    if (!allMissed && workflow.outcome === "allMissed") workflow.outcome = "ok"; // a re-rolled attack that hits
    if (allMissed) {
      workflow.outcome = "allMissed";
      if (configSettings.confirmAttackDamage !== "none" && !workflow.workflowOptions.forceCompletion)
        return "midi-qol.ConfirmRoll";
      if (workflow.workflowOptions.forceCompletion || configSettings.autoCompleteWorkflow) {
        expireMyEffects.bind(workflow)(["1Attack", "1Action", "1Spell", "1Critical", "1Fumble"])
        // Nothing to roll, but the effects stage still runs: "apply to self always" effects, its macro passes and hooks
        return "midi-qol.ApplyDynamicEffects";
      }
    }
    return "midi-qol.WaitForDamageRoll";
  });

  registerFlowVariant("midi-qol.savesFirst", "midi-qol.WaitForDamageRoll", async ({ workflow, base }: { workflow: SavesFirstWorkflow, base: () => Promise<unknown> }) => {
    const hasDamageRoll = workflow.activity.hasDamage || workflow.otherActivity?.hasDamage || workflow.activity.hasHealing || workflow.otherActivity?.hasHealing;
    if (!hasDamageRoll) return "midi-qol.AllRollsComplete";
    return base();
  });

  registerFlowVariant("midi-qol.savesFirst", "midi-qol.DamageRollComplete", async ({ workflow, base }: { workflow: SavesFirstWorkflow, base: () => Promise<unknown> }) => {
    await base();
    return "midi-qol.AllRollsComplete";
  });

  registerFlowVariant("midi-qol.activeDefence", "midi-qol.WaitForAttackRoll", async ({ workflow, base }: { workflow: ActiveDefenceWorkflow, base: () => Promise<unknown> }) => {
    workflow.workflowOptions.attackRollDSN = false;
    return base();
  });

  registerFlowVariant("midi-qol.activeDefence", "midi-qol.AttackRollComplete", async ({ workflow, base }: { workflow: ActiveDefenceWorkflow, base: () => Promise<unknown> }) => {
    const attackBonus = (workflow.attackRoll?.total ?? 0) - (workflow.attackRoll?.dice[0]?.total ?? 0); // TODO see if there is a better way to work out roll plusses
    workflow.activeDefenceDC = configSettings.optionalRules.activeDefenceModifier + attackBonus;
    return base();
  });

  registerFlowVariant("midi-qol.damageOnly", "midi-qol.Start", async ({ workflow, base }: { workflow: DamageOnlyWorkflow, base: () => Promise<unknown> }) => {
    workflow.effectsAlreadyExpired = [];

    if (workflow.itemCardUuid === "new" || !fromUuidSync(workflow.itemCardUuid)) {
      const message = {}
      const messageConfig = foundry.utils.mergeObject({
        create: true,
        data: {
          system: { effects: workflow.activity?.applicableEffects?.map(e => e.relativeUUID) },
          rolls: workflow.damageRolls,
          // The synthetic item is on no actor: the card keeps it (getAssociatedItem), so the workflow can be rebuilt
          flags: { [MODULE_ID]: { itemData: workflow.item?.toObject() } }
        },
        hasConsumption: false
      }, message);
      // @ts-expect-error no dnd5e-types
      const itemCard = await workflow.activity._createUsageMessage(messageConfig);
      // Its own card: filed under it, its state and records stored there
      if (itemCard) {
        workflow.id = itemCard.uuid;
        workflow.itemCardUuid = itemCard.uuid;
        Workflow.addWorkflow(workflow);
        if (configSettings.undoWorkflow) await saveUndoData(workflow);
      }
    }
    const whisperCard = configSettings.autoCheckHit === "whisper" || safeGetGameSetting("core", "messageMode") === "blind";
    // No dnd5e damage roll: the attacker's rules as dnd5e would collect them for one (stored with the use). Not when
    // the only actor there is was a target's (the constructor's fallback): its rules aren't the damage's.
    const ruleSource = workflow.item?.actor ?? workflow.actor;
    if (ruleSource && !workflow.targets.documents.some(t => t.actor?.uuid === ruleSource.uuid))
      workflow.addDamageRules(collectDamageRules(ruleSource, workflow.item));
    if (workflow.actor) { // Hacky process bonus flags
      // TODO come back and fix this for dnd3
      if (workflow.useOther) await workflow.setOtherDamageRolls(await workflow.processDamageRollBonusFlags(workflow.otherDamageRolls ?? []));
      else await workflow.setDamageRolls(await workflow.processDamageRollBonusFlags(workflow.damageRolls));
    }

    if (workflow.itemCardUuid) {
      workflow.isFumble = false;
      workflow.attackTotal = 9999;
      workflow.recordTargetACModifiers();
      await workflow.checkHits(workflow.workflowOptions);
      workflow.hitTargets = new TokenDocumentSet(workflow.targets);
      // Another workflow's card keeps its hits and targets: only the damage is added
      if (workflow.ownsCard) await workflow.displayHits(whisperCard, false);
      await workflow.displayDamageRolls();
    } else {
      await workflow.damageRoll?.toMessage({ flavor: workflow.flavor });
    }
    workflow.hitTargets = new TokenDocumentSet(workflow.targets);
    workflow.hitTargetsEC = new Set();
    workflow.effectTargets = new TokenDocumentSet(workflow.targets);
    // TODO change this to the new apply token damage call - sigh
    //workflow.damageList = await applyTokenDamage(workflow.rawDamageDetail, workflow.damageTotal, workflow.targets, workflow.item, new Set(), { existingDamage: workflow.damageList, superSavers: new Set(), semiSuperSavers: new Set(), workflow: workflow, updateContext: undefined, forceApply: false })
    // Returned, not called: the dispatcher fires AllRollsComplete's pre/post hooks and passes
    return "midi-qol.AllRollsComplete";
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.Start", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    workflow.effectsAlreadyExpired = [];
    if (debugEnabled > 1) debug(" Trapworkflow | WorkflowState_Start ", workflow.item, getActivityAutoTargetAction(workflow.activity), activityHasAreaTarget(workflow.activity), workflow.targets);
    // don't support the placement of a template
    return "midi-qol.AwaitTemplate"
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.AwaitTemplate", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    if (activityHasEmanationNoTemplate(workflow.activity)) {
      // Targets have already been set in activity.use
      return "midi-qol.TemplatePlaced";
    }
    if (!activityHasAreaTarget(workflow.activity) || !workflow.templateLocation) {
      return "midi-qol.TemplatePlaced";
    }
    // Regions directly — the deprecated AbilityTemplate skipped dnd5e's unit conversion, which is
    // why trap templates came out the wrong size.
    const templates = await createActivityTemplateRegions(workflow.activity, [{
      x: workflow.templateLocation?.x || 0,
      y: workflow.templateLocation?.y || 0,
      direction: workflow.templateLocation?.direction || 0
    }]);
    if (templates?.length) {
      for (const docToStore of templates) {
        if (!docToStore?.uuid) continue;
        workflow.templateUuid = docToStore.uuid;
        await workflow.setupTemplateCleanup(docToStore);
      }
      workflow.placedTemplateCount = templates.length;
      workflow.selectAllTemplateTargets();
      if (workflow.templateLocation?.removeDelay) {
        const ids: string[] = templates.map(td => td.id as string);
        // Template cleanup may already have removed them; delete only what is left.
        setTimeout(() => {
          const left = ids.filter(id => canvas.scene?.regions.has(id));
          if (left.length) canvas.scene?.deleteEmbeddedDocuments("Region", left).catch(() => { });
        }, workflow.templateLocation.removeDelay * 1000);
      }
    }
    return "midi-qol.TemplatePlaced"
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.TemplatePlaced", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    return "midi-qol.ValidateRoll";
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.ValidateRoll", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    // do pre roll checks
    return "midi-qol.WaitForAttackRoll"
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.WaitForAttackRoll", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    if (!workflow.activity.attack && !workflow.activity.hasAttack) {
      // No attack on activity, all targets are hit
      workflow.hitTargets = new TokenDocumentSet(workflow.targets);
      workflow.hitTargetsEC = new Set();
      return "midi-qol.WaitForSaves";
    }
    warn("TrapWorkflow | WaitForAttackRoll rolling attack for", workflow.activity.name, "hasAttack:", workflow.activity.hasAttack, "attack:", workflow.activity.attack);
    // TrapWorkflow has no event - dialog skipping is controlled via rollOptions.fastForwardAttack
    workflow.activity.rollAttack?.({ workflow: workflow, midiOptions: { workflowOptions: workflow.workflowOptions } }, {}, {});
    return "midi-qol.Suspend";
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.AttackRollComplete", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    await workflow.processAttackRoll();
    workflow.recordAttackStats();
    await workflow.displayAttackRoll();
    workflow.recordTargetACModifiers();
    await workflow.checkHits(workflow.workflowOptions);
    const whisperCard = configSettings.autoCheckHit === "whisper" || safeGetGameSetting("core", "messageMode") === "blind";
    await workflow.displayHits(whisperCard);
    return "midi-qol.WaitForSaves";
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.WaitForSaves", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    if (!workflow.activityHasSave) {
      workflow.saves = new Set(); // no saving throw, so no-one saves
      workflow.failedSaves = workflow.hitTargets.union(workflow.hitTargetsEC);
      return "midi-qol.WaitForDamageRoll";
    }
    // The saveRequests providers listen for their own answers (a trap's chat cards: created, not rendered; M5b)
    try {
      const saveDisplay = saveDisplayMode();
      // The saveRequests service (checkSaves); a module may still have replaced the deprecated requestSaves port
      const replaced = workflow.replacedPort("requestSaves");
      if (replaced) await replaced(workflow, saveDisplay !== "allShow");
      else await workflow.checkSaves(saveDisplay !== "allShow");
    } catch (err) {
      TroubleShooter.recordError(err, "checkSaves");
    }
    if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessageHTML"]?.length);
    const saveDisplay = saveDisplayMode();
    await workflow.displaySaves(saveDisplay === "whisper");
    return "midi-qol.SavesComplete";
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.SavesComplete", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    return "midi-qol.WaitForDamageRoll"
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.WaitForDamageRoll", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    if (!workflow.activity.hasDamage && !workflow.activity.hasHealing) return "midi-qol.AllRollsComplete";

    if (workflow.isFumble) {
      // fumble means no trap damage/effects
      return "midi-qol.RollFinished";
    }
    if (debugEnabled > 1) debug("TrapWorkflow: Rolling damage ", workflow.rollOptions.event, workflow.spellLevel, workflow.workflowOptions.versatile, workflow.targets, workflow.hitTargets);
    workflow.rollOptions.fastForward = true;
    return workflow.rollInStep(() => workflow.activity.rollDamage({ workflow: workflow, midiOptions: { ...workflow.rollOptions, workflowOptions: workflow.workflowOptions } }, {}, {}));
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.DamageRollComplete", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    // If the item does damage, use the same damage type as the item
    /*
    let defaultDamageType = getActivityDefaultDamageType(workflow) ?? workflow.defaultDamageType
    workflow.rawDamageDetail = createDamageDetail({ roll: workflow.damageRolls, activity: workflow.activity, defaultType: defaultDamageType });
    if (workflow.bonusDamageRolls)
      workflow.rawBonusDamageDetail = createDamageDetail({ roll: workflow.bonusDamageRolls, activity: workflow.activity, defaultType: defaultDamageType });
    else
      workflow.rawBonusDamageDetail = [];
    if (workflow.otherDamageRolls)
      workflow.rawOtherDamageDetail = createDamageDetail({ roll: workflow.otherDamageRolls, activity: workflow.activity, defaultType: defaultDamageType });
    else
      workflow.rawOtherDamageDetail = [];
    */
    // apply damage to targets plus saves plus immunities
    await workflow.displayDamageRolls();
    if (workflow.isFumble) {
      return "midi-qol.ApplyDynamicEffects"
    }
    return "midi-qol.AllRollsComplete";
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.AllRollsComplete", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    if (debugEnabled > 1) debug("all rolls complete ", foundry.utils.duplicate(workflow.rawDamageDetail))
    if (workflow.rawDamageDetail?.length) await processDamageRoll(workflow, workflow.rawDamageDetail[0].type)
    workflow.recordDamageStats();
    return "midi-qol.ApplyDynamicEffects";
  });

  registerFlowVariant("midi-qol.trap", "midi-qol.RollFinished", async ({ workflow, base }: { workflow: TrapWorkflow, base: () => Promise<unknown> }) => {
    // Run the base step here: returning the base method made it a separate state, firing RollFinished's hooks twice
    return base();
  });
}
