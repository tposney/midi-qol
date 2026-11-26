import { Workflow } from "../../Workflow.js";
import { getDistance } from "../../services/distance/service.js";
import { registerMidiQuery, queryUser } from "../midiQueries.js";
import { registerAction, type ActionRun } from "./engine.js";

/*
 * Reacting to a spell being cast (Counterspell):
 * - after a spell's preamble (its slot spent, nothing rolled), each creature with a reaction whose condition reads
 *   `reaction === "isCast"` within that activity's range of the caster is offered it (the reaction step
 *   "reactioncast", Workflow#askReactionsStep, as the other triggers),
 *   the caster as its target; the reaction's use knows the use it answers (as every reaction's: doReactions sets
 *   workflowOptions.reactionTrigger, triggeringWorkflowId and triggeringUserId);
 * - `{ fails: "triggering" | "use" }`: that use (or, with "use", the event's own use) fails: it goes no further (no
 *   attack, save, damage or effects), its card kept and marked with why, and what dnd5e consumed for it handed back
 *   (Workflow#fail; the rules: "the slot isn't expended"; the action used to cast it stays spent). Run where that use runs: asked of its user's client when it isn't here.
 */

export const REACTION_CAST = "reactioncast";
const FAIL_USE_QUERY = "failUse";

type ReactionActivity = { reactionCondition?: string, activation?: { type?: string }, range?: { value?: number | string | null, units?: string } };

/** How far a creature's isCast reactions reach (feet): the longest range among them; none: undefined */
function castReactionRange(actor: Actor.Implementation): number | undefined {
  let reach: number | undefined;
  for (const item of actor.items) {
    for (const activity of ((item.system as { activities?: Iterable<ReactionActivity> }).activities ?? [])) {
      if (activity.activation?.type !== "reaction" || !/\bisCast\b/.test(activity.reactionCondition ?? "")) continue;
      const range = Number(activity.range?.value);
      const feet = activity.range?.units === "ft" && Number.isFinite(range) ? range : activity.range?.units === "self" || activity.range?.units === "touch" ? 5 : 60;
      reach = Math.max(reach ?? 0, feet);
    }
  }
  return reach;
}

/** After a spell's preamble: the creatures in range with an isCast reaction are offered it */
export async function offerCastReactions(workflow: Workflow): Promise<void> {
  const caster = workflow.token?.document ?? (workflow.token as unknown as TokenDocument.Implementation | undefined);
  const scene = caster?.parent;
  if (!caster?.uuid || !scene) return;
  for (const token of scene.tokens) {
    if (workflow.aborted) return;
    if (token === caster || !token.actor || token.hidden) continue;
    const reach = castReactionRange(token.actor);
    if (reach === undefined || !token.object || !caster.object) continue;
    const distance = getDistance(caster.object, token.object, { wallsBlock: false });
    if (distance < 0 || distance > reach) continue;
    await workflow.askReactionsStep(token, caster.uuid, null, REACTION_CAST, { workflow, item: workflow.item, activity: workflow.activity });
  }
}

/** Here: the use fails (Workflow#fail: its card kept and marked, its consumption handed back); false if it isn't running here */
async function failUseHere(workflowId: string, label: string): Promise<boolean> {
  // Only a use running in this client's memory: getWorkflow(id, false) would rebuild a live copy of another client's
  const workflow = Workflow.findWorkflow(workflowId);
  if (!workflow || workflow.aborted) return false;
  await workflow.fail(label);
  return true;
}

/** `{ fails: "triggering" | true }` */
async function failsAction(run: ActionRun): Promise<void> {
  const label = typeof run.action.label === "string" ? run.action.label : (run.found.document as { name?: string }).name ?? run.found.entry.id;
  const own = run.context.workflow;
  if (run.action.fails !== "triggering") {
    if (own?.id) await failUseHere(own.id, label);
    return;
  }
  const options = (own?.workflowOptions ?? {}) as { triggeringWorkflowId?: string, triggeringUserId?: string };
  if (!options.triggeringWorkflowId) return;
  if (await failUseHere(options.triggeringWorkflowId, label)) return;
  const user = options.triggeringUserId ? game.users?.get(options.triggeringUserId) : undefined;
  if (!user || user.isSelf) return;
  try { await queryUser(user, FAIL_USE_QUERY, options.triggeringWorkflowId, label); }
  catch (err) { console.warn("midi-qol | failing the use a reaction answered", err); }
}

export function registerCastReactions() {
  registerAction("fails", failsAction);
  registerMidiQuery(FAIL_USE_QUERY, (workflowId: string, label: string) => failUseHere(workflowId, label));
}
