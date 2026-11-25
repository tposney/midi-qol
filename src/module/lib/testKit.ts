import type { Activity, ActivityUseConfiguration } from "../../globals.js";
import type { Workflow } from "../Workflow.js";
import { completeActivityUse } from "../utils.js";
import type { FixedDice } from "./fixedDice.js";
import { outcomes, type TargetOutcome } from "./outcomes.js";
import { useTrace, type UseTrace } from "./useTrace.js";

/*
 * The author test kit (M23 d): "use this with these dice, give me the outcome". A real use (documents change as in
 * play): its targets given, nothing consumed, no dialogs, every roll made at once with the dice given; the outcome per
 * target and the use's trace. Dice another client rolls (a player's requested save) are that client's.
 */

export type TestTarget = Token | TokenDocument | Actor | string;

export interface TestRunOptions {
  targets?: TestTarget[];
  /** Every die ("max", a position 0-1) or faces per die size ({ faces: { d20: [17, 4] }, rest: "average" }) */
  dice?: FixedDice;
  /** Cast at this level (a spell) */
  spellLevel?: number;
  /** Consume the use's resources, slot and action as in play (default none) */
  consume?: boolean;
  /** More workflow options (they win over the kit's) */
  workflowOptions?: Record<string, unknown>;
}

export interface TestRunResult {
  workflow: Workflow;
  /** By target TokenDocument uuid */
  outcomes: Record<string, TargetOutcome>;
  trace: UseTrace;
}

function targetUuid(target: TestTarget): string | undefined {
  if (typeof target === "string") return target;
  if (target instanceof foundry.canvas.placeables.Token) return target.document.uuid || undefined;
  return target.uuid || undefined;
}

export async function run(activity: Activity | string, options: TestRunOptions = {}): Promise<TestRunResult> {
  const consume = options.consume ?? false;
  const usage: ActivityUseConfiguration = {
    consume: { action: consume, resources: consume, spellSlot: consume },
    midiOptions: {
      targetUuids: (options.targets ?? []).map(targetUuid).filter((uuid): uuid is string => !!uuid),
      ...(options.spellLevel !== undefined ? { spellLevel: options.spellLevel } : {}),
      workflowOptions: {
        targetConfirmation: "none", autoRollAttack: true, fastForwardAttack: true, autoRollDamage: "always", fastForwardDamage: true,
        ...(options.dice !== undefined ? { fixedDice: options.dice } : {}),
        ...options.workflowOptions
      }
    }
  };
  const workflow = await completeActivityUse(activity, usage, { configure: false }, {});
  if (!workflow) throw new Error(`MidiQOL.testing.run | ${typeof activity === "string" ? activity : activity.uuid}: no use`);
  return { workflow, outcomes: Object.fromEntries(outcomes(workflow)), trace: useTrace(workflow) };
}
