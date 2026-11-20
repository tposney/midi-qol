import { MODULE_ID } from "../../midi-qol.js";
import { jsonSafe, type Workflow } from "../Workflow.js";
import { outcomes, type TargetOutcome } from "./outcomes.js";

/*
 * A use's trace (M25): what it was given, the steps it ran with who changed them, and its outcome, as plain data, for
 * tests, examples and bug reports; saveUseTrace writes it to a file (the use recording of the proposal's M20).
 */

export interface UseTraceTarget {
  name: string | null;
  uuid: string | null;
  hit: boolean;
  saved: boolean;
  failedSave: boolean;
  /** HP and temporary HP the use took (negative: healed) */
  damage?: { hp: number, temp: number, newHP: number };
  /** The outcome record (M26) */
  outcome?: TargetOutcome;
}

export interface UseTrace {
  use: { item?: string, activity?: string, actor?: string, card?: string, flow: string, options: unknown };
  steps: Workflow["trace"];
  outcome: {
    result: string;
    aborted: boolean;
    critical: boolean;
    fumble: boolean;
    attackTotal?: number;
    damageTotal?: number;
    targets: UseTraceTarget[];
  };
  recordedAt: string;
  midi: string;
}

export function useTrace(workflow: Workflow): UseTrace {
  const damageOf = (uuid: string | null) => workflow.damageList.find(entry => entry.targetUuid === uuid);
  const targetOutcomes = outcomes(workflow);
  return {
    use: {
      item: workflow.item?.uuid ?? undefined, activity: workflow.activity?.uuid ?? undefined, actor: workflow.actor?.uuid ?? undefined,
      card: workflow.itemCardUuid ?? undefined, flow: workflow.flowId,
      // What can be stored of what it was given (an event or a module's object is left out)
      options: jsonSafe(workflow.workflowOptions)
    },
    steps: workflow.trace,
    outcome: {
      result: workflow.outcome, aborted: !!workflow.aborted, critical: !!workflow.isCritical, fumble: !!workflow.isFumble,
      attackTotal: workflow.attackRoll?.total ?? undefined,
      damageTotal: workflow.damageTotal ?? undefined,
      targets: workflow.targets.documents.map(token => {
        const damage = damageOf(token.uuid);
        return {
          name: token.name, uuid: token.uuid,
          hit: workflow.hitTargets.has(token), saved: workflow.saves.has(token), failedSave: workflow.failedSaves.has(token),
          ...(damage ? { damage: { hp: damage.hpDamage, temp: damage.tempDamage, newHP: damage.newHP } } : {}),
          outcome: targetOutcomes.get(token.uuid ?? "")
        };
      })
    },
    recordedAt: new Date().toISOString(),
    midi: game.modules?.get(MODULE_ID)?.version ?? ""
  };
}

/** The use's trace as a JSON file (the browser's download; `download: false` only returns it, as for a bug report) */
export function saveUseTrace(workflow: Workflow, { download = true }: { download?: boolean } = {}): { filename: string, json: string } {
  const json = JSON.stringify(useTrace(workflow), null, 2);
  const filename = `midi-use-${(workflow.item?.name ?? "use").slugify()}-${Date.now()}.json`;
  if (download) foundry.utils.saveDataToFile(json, "application/json", filename);
  return { filename, json };
}
