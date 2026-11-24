import { configSettings } from "../../module/settings.js";
import { ActiveDefenceWorkflow } from "../../module/Workflow.js";
import { registerFlowVariant } from "../../module/steps/flows.js";
import { toMessageMode } from "../../module/utils.js";
import { useFlowService } from "../../module/services/useFlow/service.js";
import { declareRule, ruleId, ruleOn, ruleValue } from "../registry.js";

/*
 * Optional rule activeDefence (M30): the targets of an attack by the GM's creature roll a defence instead of the
 * attacker rolling to hit. A flow choice: the rule claims the use's flow (the useFlow service) and owns the flow's step
 * variants. The attack is still rolled, unseen: its bonus (with any before-roll bonus, flanking's) makes the defence DC
 * with the rule's modifier, and its advantage is reversed for the defender (the workflow's checkActiveAttacks).
 */

export const ACTIVE_DEFENCE_RULE = ruleId("activeDefence");

/** How the defence roll is shown (a message mode; "self" unless set) */
export const defenceMessageMode = () => toMessageMode((ruleValue("activeDefenceShow") as string) || "self");

export function registerActiveDefenceRule() {
  const rule = declareRule({ id: ACTIVE_DEFENCE_RULE, setting: "activeDefence", service: "useFlow", label: "Active defence (targets roll to defend)",
    settings: [
      { key: "activeDefence", type: "boolean", label: "midi-qol.ActiveDefence.Name", hint: "midi-qol.ActiveDefence.Hint", default: false },
      { key: "activeDefenceModifier", type: "number", label: "midi-qol.ActiveDefenceModifier.Name", hint: "midi-qol.ActiveDefenceModifier.Hint", default: 11 },
      { key: "activeDefenceShow", type: "string", label: "midi-qol.ActiveDefenceShow.Name", hint: "midi-qol.ActiveDefenceShow.Hint", default: "self",
        choices: Object.fromEntries(Object.entries(CONFIG.ChatMessage?.modes ?? {}).filter(([mode]) => mode !== "ic").map(([mode, { label }]) => [mode, label])) }
    ] });
  // An attack by the GM's creature runs the active defence flow
  useFlowService.register(rule.id, {
    for: ({ activity }) => game.user?.isGM && activity.attack ? { workflowClass: ActiveDefenceWorkflow } : undefined
  }, { label: rule.label, priority: 20, available: () => ruleOn("activeDefence") });

  // The flow's steps: the attack is rolled unseen; its bonus makes the defence DC
  registerFlowVariant("midi-qol.activeDefence", "midi-qol.WaitForAttackRoll", async ({ workflow, base }: { workflow: ActiveDefenceWorkflow, base: () => Promise<unknown> }) => {
    workflow.workflowOptions.attackRollDSN = false;
    return base();
  });
  registerFlowVariant("midi-qol.activeDefence", "midi-qol.AttackRollComplete", async ({ workflow, base }: { workflow: ActiveDefenceWorkflow, base: () => Promise<unknown> }) => {
    const attackBonus = (workflow.attackRoll?.total ?? 0) - (workflow.attackRoll?.dice[0]?.total ?? 0); // TODO see if there is a better way to work out roll plusses
    workflow.activeDefenceDC = configSettings.optionalRules.activeDefenceModifier + attackBonus;
    return base();
  });
}
