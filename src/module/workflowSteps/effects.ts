import { configSettings } from "../settings.js";
import { expireMyEffects } from "../utils.js";
import { setStepRun } from "../steps/steps.js";
import { Workflow, workflowStepHost, type WorkflowState } from "../Workflow.js";

/** midi's steps (M5): the effects. Moved from Workflow's WorkflowState_<name> methods; `this` is `workflow`. */
export function registerEffectsSteps(): void {
  /*
   * The effects stage, step by step. The state keeps its name, order, hooks, macro passes and exits; each step is
   * one job of the old single method, moved unchanged, and returns what later steps need.
   */
  setStepRun("midi-qol.ApplyDynamicEffects", async ({ workflow }: { workflow: Workflow }): Promise<WorkflowState> => {
    const ammo = await workflow.effectsMatchTargets();
    // once attacked, the attack keys too: an attack without damage never reaches the damage roll states that expire them
    expireMyEffects.bind(workflow)(["1Action", "1Spell", ...(workflow.attackRoll ? ["1Attack", "1Hit", "1Critical", "1Fumble"] : [])]);
    const ammoTargets = await workflow.effectsSelectTargets(ammo);
    // Do special expiries
    const specialExpiries = [
      "isDamaged",
      "isHealed",
      "isSaveSuccess",
      "isSaveFailure",
      "isSave",
      "isHit"
    ];
    await workflow.expireTargetEffects(specialExpiries);
    if (workflow.damageOnly || !await workflow.effectsMayApply()) return "midi-qol.RollFinished";
    // no item, not auto effects or not module skip
    if (!workflow.activity.item) return "midi-qol.RollFinished";
    const fx = await workflow.effectsResolve(ammo.ammunition, ammoTargets.ammunitionEffectTargets);
    const data = workflow.effectsApplicationData();
    await workflow.applyTargetEffects(fx, ammo, ammoTargets, data);
    // Perhaps this should use workflow.effectTargets
    if (configSettings.allowUseMacro && workflow.workflowOptions.noTargetOnUseMacro !== true) await workflow.triggerTargetMacros(["postTargetEffectApplication"], workflow.targets);
    const selfEffects = await workflow.applySelfEffects(fx, ammo, ammoTargets, data);
    await workflow.applyCESelfEffect(fx, data, selfEffects);
    return "midi-qol.RollFinished";
  });
}
