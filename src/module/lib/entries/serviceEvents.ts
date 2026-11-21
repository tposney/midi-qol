import type { Workflow } from "../../Workflow.js";
import type { CoverLevel } from "../../services/cover/service.js";
import { registerAction, registerEvent, type ActionRun } from "./engine.js";

/*
 * M15 stage 6 (spike run 2: "a service's question is an event"): entries answer the cover and perception questions
 * for a use, raised when its targets are set (useEvents: post PreambleComplete) and kept on the use for midi's
 * synchronous checks to read.
 * - `cover`: on a target's effect, `{ cover: "half" | "threeQuarters" | "total" }` is cover it has from this use (at
 *   least that much: Twilight Shroud); on the use's own activity or item, `{ cover: { ignore: [levels] } }` is cover
 *   the use ignores (Sacred Flame), status cover included.
 * - `perception`: on a creature's effect, `{ perception: { invisible: false } }`: it gains nothing from being
 *   Invisible (Shining Smite's Shining): no advantage attacking, no disadvantage for its attackers.
 */

const LEVELS: readonly CoverLevel[] = ["none", "half", "threeQuarters", "total"];

export interface EntryCover { level?: CoverLevel, ignore?: CoverLevel[] }

const covers = new WeakMap<Workflow, { byTarget: Map<string, CoverLevel>, ignore: Set<CoverLevel> }>();
const perceptions = new WeakMap<Workflow, Map<string, { invisible?: boolean }>>();

function coversOf(workflow: Workflow) {
  let found = covers.get(workflow);
  if (!found) covers.set(workflow, found = { byTarget: new Map(), ignore: new Set() });
  return found;
}

/** What the entries said about the target's cover from this use */
export function entryCoverFor(workflow: Workflow | undefined, target: { uuid?: string | null } | undefined): EntryCover | undefined {
  const found = workflow ? covers.get(workflow) : undefined;
  if (!found) return undefined;
  const level = target?.uuid ? found.byTarget.get(target.uuid) : undefined;
  return { ...(level ? { level } : {}), ...(found.ignore.size ? { ignore: [...found.ignore] } : {}) };
}

/** The greater of two cover levels */
export function maxCover(a: CoverLevel, b: CoverLevel | undefined): CoverLevel {
  return b && LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a;
}

/** Whether the creature (an actor's uuid) gains nothing from Invisible against or in this use */
export function invisibilityDenied(workflow: Workflow | undefined, actor: Actor.Implementation | null | undefined): boolean {
  if (!workflow || !actor?.uuid) return false;
  return perceptions.get(workflow)?.get(actor.uuid)?.invisible === false;
}

async function coverAction(run: ActionRun) {
  const workflow = run.context.workflow;
  const spec = run.action.cover;
  if (!workflow) return;
  const found = coversOf(workflow);
  if (typeof spec === "string" && LEVELS.includes(spec as CoverLevel)) {
    const target = run.context.target;
    if (!target?.uuid) {
      console.warn(`midi-qol | entry ${run.found.entry.id}: cover "${spec}" is for a target's effect (its cover from the use)`);
      return;
    }
    found.byTarget.set(target.uuid, maxCover(found.byTarget.get(target.uuid) ?? "none", spec as CoverLevel));
    return;
  }
  const ignore = spec && typeof spec === "object" ? (spec as { ignore?: unknown }).ignore : undefined;
  for (const level of [ignore ?? []].flat()) if (LEVELS.includes(level as CoverLevel)) found.ignore.add(level as CoverLevel);
}

async function perceptionAction(run: ActionRun) {
  const workflow = run.context.workflow;
  const spec = run.action.perception as { invisible?: boolean } | undefined;
  // The creature the answer is about: the target at a target's event, else the use's user
  const actor = run.context.target?.actor ?? run.context.actor;
  if (!workflow || !spec || typeof spec !== "object" || !actor?.uuid) return;
  let byActor = perceptions.get(workflow);
  if (!byActor) perceptions.set(workflow, byActor = new Map());
  byActor.set(actor.uuid, { ...(byActor.get(actor.uuid) ?? {}), ...spec });
}

export function registerServiceEvents() {
  registerEvent("cover", { label: "The cover question for a use: a target's cover from it, or cover the use ignores" });
  registerEvent("perception", { label: "The perception question for a use: whether a creature gains from being Invisible" });
  registerAction("cover", coverAction);
  registerAction("perception", perceptionAction);
}
