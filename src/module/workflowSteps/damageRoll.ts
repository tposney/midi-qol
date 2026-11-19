import { debug, debugEnabled, warn } from "../../midi-qol.js";
import { TokenDocumentSet } from "../lib/tokenDocumentSet.js";
import { checkMechanic, configSettings } from "../settings.js";
import { activityHasAreaTarget, expireMyEffects, getActivityAutoTargetAction, isAutoFastForward, userTargetsKeepingUndrawn, validTargetTokens } from "../utils.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): the damage roll, its confirmation and its bonus damage. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerDamageRollSteps(): void {
  setStepRun("midi-qol.WaitForDamageRoll", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const host = workflowStepHost(workflow);
    const hasDamageRoll = workflow.activity.hasDamage || workflow.otherActivity?.hasDamage || workflow.activity.hasHealing || workflow.otherActivity?.hasHealing;
    if (!hasDamageRoll) return "midi-qol.WaitForSaves";
    if (debugEnabled > 1) debug(`wait for damage roll has damage roll ${hasDamageRoll} isFumble ${workflow.isFumble}`);

    if (checkMechanic("actionSpecialDurationImmediate"))
      expireMyEffects.bind(workflow)(["1Attack", "1Action", "1Spell"]);
    if (checkMechanic("actionSpecialDurationImmediate") && workflow.hitTargets.count)
      expireMyEffects.bind(workflow)(["1Hit"]);
    if (checkMechanic("actionSpecialDurationImmediate")) {
      expireMyEffects.bind(workflow)(["1Critical", "1Fumble"])
    }

    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) {
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("preDamageRoll"), "OnUse", "preDamageRoll");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("preDamageRoll"), "OnUse", "preDamageRoll");
    }

    if (workflow.shouldRollDamage) {
      if (debugEnabled > 0) warn("waitForDamageRoll | rolling damage ", workflow.rollOptions.event, configSettings.autoRollAttack, configSettings.autoFastForward)
      workflow.rollOptions.isCritical = workflow.isCritical;
      workflow.rollOptions.fastForwardDamage = isAutoFastForward("damage", { workflow: workflow });
      if (!workflow.rollOptions.fastForwardDamage) workflow.waitOnPlayerRoll("damage");
      return workflow.rollInStep(() => workflow.activity.rollDamage({ workflow: workflow, midiOptions: { ...workflow.rollOptions, workflowOptions: workflow.workflowOptions } }, {}, { create: false }));
    }
    workflow.waitOnPlayerRoll("damage");
    const chatMessage = workflow.chatCard;
    if (chatMessage) {
      await workflow.performThrottledUpdate(chatMessage, { "system.midi.dmgBtnText": host.damageButtonText() } as ChatMessage.UpdateData);
    }
    return "midi-qol.Suspend"; // wait for a damage roll to advance the state.
  });

  setStepRun("midi-qol.ConfirmRoll", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (configSettings.confirmAttackDamage !== "none" && (workflow.activity.attack || workflow.activity.damage)) {
      await workflow.displayDamageRolls();
      return "midi-qol.Suspend"; // wait for the confirm button
    }
    return "midi-qol.DamageRollStarted";
  });

  setStepRun("midi-qol.RollConfirmed", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    expireMyEffects.bind(workflow)(["1Attack", "1Action", "1Spell"])
    return "midi-qol.DamageRollStarted";
  });

  setStepRun("midi-qol.DamageRollStarted", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    if (workflow.ownsCard) {
      await Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeConfirmButtons: true });
    }
    if (!workflow.damageOnly && getActivityAutoTargetAction(workflow.activity) === "none" && activityHasAreaTarget(workflow.activity) && !workflow.activity.attack) {
      // The user's targets, keeping those of the use with no canvas token (another level or scene; a macro's): they can't be the user's
      workflow.targets = validTargetTokens(userTargetsKeepingUndrawn(workflow.targets));
      workflow.hitTargets = new TokenDocumentSet(workflow.targets);
      workflow.hitTargetsEC = new Set();
      if (debugEnabled > 0) warn("damageRollStarted | for non auto target area effects spells", workflow)
    }
    await workflow.rollAllBonusDamage();
    await workflow.rollDamageContributions();
    // The damage step's dice, the activity's, the other activity's and the bonus damage's, in one throw
    await workflow.flushDamageThrow();
    return "midi-qol.DamageRollComplete";
  });

  setStepRun("midi-qol.DamageRollComplete", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    await workflow.flushDamageThrow();
    if (configSettings.allowUseMacro && workflow.workflowOptions.noOnUseMacro !== true) { //
      await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
      if (workflow.ammunition) await workflow.callMacros(workflow.ammunition, workflow.ammunitionOnUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
    }
    await workflow.callMidiHooks("midi-qol.DamageRollComplete");
    if (workflow.aborted) return "midi-qol.Abort";
    if (workflow.hitTargets?.count || workflow.hitTargetsEC?.count) expireMyEffects.bind(workflow)(["1Hit"]);
    expireMyEffects.bind(workflow)(["1Action", "1Attack", "1Spell", "1Critical", "1Fumble"]);
    await workflow.displayDamageRolls();
    await workflow.createDamageMessages();

    if (workflow.isFumble) {
      workflow.failedSaves = new Set();
      workflow.hitTargets = new Set();
      workflow.hitTargetsEC = new Set();
      return "midi-qol.ApplyDynamicEffects";
    }
    return "midi-qol.WaitForSaves";
  });
}
