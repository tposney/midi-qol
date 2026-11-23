import type { Activity } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import { defineService } from "../../api/services.js";
import { registerCostContributor } from "../economy/cost.js";

/*
 * multiattack (single): what using a creature's Multiattack does. midi asks the active provider after each use is
 * charged, whether a use costs no action (the economy's cost, so charging, issues and HUDs agree), when a use
 * completes, and for the state the turn model and HUDs show. midi's own (run.ts: the plan opened for the turn, the run
 * sheet) is the default; a module registering a higher priority provider replaces it, or wraps it to adjust it. The
 * plans (multiattackPlans) are a separate service either may use.
 *
 *   MidiQOL.services.register("multiattack", "my-module", { free: ({ activity, actor }) => …, state: actor => … }, { priority: 10 });
 */

export interface MultiattackState {
  /** Where the plan came from, for display ("registered", "gm", or the provider's own word) */
  source?: string;
  /** Attacks still to make, null when the plan doesn't count them */
  attacksLeft: number | null;
  made: number;
  complete: boolean;
  /** Activity uuids that may come next */
  allowed: string[];
  /** Activity uuids used so far */
  used: string[];
}

export interface MultiattackProvider {
  /** After any use is charged (the Multiattack itself, or an attack) */
  afterCharge?(workflow: Workflow): Promise<void> | void;
  /** True when this use costs no action (it is part of the creature's open Multiattack) */
  free?(query: { activity: Activity, actor: Actor.Implementation }): boolean;
  /** When a use has completed (its targets, hits and damage are known) */
  completed?(workflow: Workflow): Promise<void> | void;
  /** The creature's open Multiattack, undefined when none is open */
  state?(actor: Actor.Implementation): MultiattackState | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { multiattack: MultiattackProvider }
}

export let multiattackService: ReturnType<typeof defineService<MultiattackProvider>>;

/** Before `midi-qol.registerServices`, with midi's provider (passed in: run.ts imports this file's types) */
export function defineMultiattackService(midi: MultiattackProvider) {
  multiattackService = defineService<MultiattackProvider>("multiattack", {
    kind: "single",
    description: "What using a creature's Multiattack does: which uses cost no action, what they record, what the HUDs show"
  });
  multiattackService.register("midi-qol", midi, { label: "Midi-QOL Multiattack" });
  registerCostContributor("midi-qol.multiattack", ({ activity, actor, cost }) => {
    if (!cost.action || !actor) return undefined;
    return multiattackService.get()?.free?.({ activity, actor }) ? { ...cost, action: 0 } : undefined;
  });
  Hooks.on("midi-qol.RollComplete" as never, (async (workflow: Workflow) => { await multiattackService.get()?.completed?.(workflow); }) as never);
}

export async function multiattackAfterCharge(workflow: Workflow) {
  await multiattackService?.get()?.afterCharge?.(workflow);
}

export function multiattackState(actor: Actor.Implementation): MultiattackState | undefined {
  try { return multiattackService?.get()?.state?.(actor); }
  catch (err) { console.warn("midi-qol | multiattack state", err); return undefined; }
}
