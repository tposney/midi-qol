import { Workflow } from "../../Workflow.js";
import { registerMidiQuery, queryUser } from "../midiQueries.js";
import { registerAction, type ActionRun } from "./engine.js";
import { addCardNote } from "../cardNotes.js";
import { i18nFormat } from "../../../midi-qol.js";

/*
 * Reacting to a spell being cast (Counterspell):
 * - after a spell's use's preamble (its slot spent, nothing rolled), the reaction step "reactioncast" asks the creatures
 *   with a reaction about another creature (its condition reads `reaction === "isCast"` and `subject`, the caster;
 *   `tags.use.casts` whether the use is the spell's casting, not a leap or an area's turn: lib/useCause.ts)
 *   within that activity's reach of the caster (lib/subjectReactions.ts, as for every trigger), the caster as its
 *   target; the reaction's use knows the use it answers (as every reaction's: doReactions sets
 *   workflowOptions.reactionTrigger, triggeringWorkflowId and triggeringUserId);
 * - `{ fails: "triggering" | "use" }`: that use (or, with "use", the event's own use) fails: it goes no further (no
 *   attack, save, damage or effects), its card kept and marked with why, and what dnd5e consumed for it handed back
 *   (Workflow#fail; the rules: "the slot isn't expended"; the action used to cast it stays spent). Run where that use runs: asked of its user's client when it isn't here.
 * - `{ fails: { use: "triggering" | "use", for: "targets" | "self" | [...] } }`: that use has no effect on those creatures
 *   (the entry's own use's targets, or its holder): they are dropped from its targets (Workflow#redirect) and its card
 *   says so (Protective Field: the attack or area that triggered it does nothing to those in the field).
 */

export const REACTION_CAST = "reactioncast";
const FAIL_USE_QUERY = "failUse";

/** After a spell's preamble: the creatures with an isCast reaction about it (its condition reads `subject`, the caster) within its reach */
export async function offerCastReactions(workflow: Workflow): Promise<void> {
  const caster = workflow.token?.document ?? (workflow.token as unknown as TokenDocument.Implementation | undefined);
  if (!caster?.uuid || !caster.parent) return;
  await workflow.askReactionsStep(caster, caster.uuid, null, REACTION_CAST, { workflow, item: workflow.item, activity: workflow.activity, ownReactions: false });
}

/**
 * Here: the use fails (Workflow#fail: its card kept and marked, its consumption handed back), or with `for`, has no
 * effect on those creatures (dropped from its targets, the card noting it); false if it isn't running here
 */
async function failUseHere(workflowId: string, label: string, forUuids?: readonly string[]): Promise<boolean> {
  // Only a use running in this client's memory: getWorkflow(id, false) would rebuild a live copy of another client's
  const workflow = Workflow.findWorkflow(workflowId);
  if (!workflow || workflow.aborted) return false;
  if (!forUuids) {
    await workflow.fail(label);
    return true;
  }
  const dropped = workflow.targets.documents.filter(target => !!target.uuid && forUuids.includes(target.uuid));
  for (const target of dropped) workflow.redirect(target, undefined, { label, at: "fails" });
  if (dropped.length && workflow.chatCard) {
    const text = i18nFormat("midi-qol.UseNoEffectOn", { reason: label, targets: dropped.map(target => target.name).join(", ") });
    await addCardNote(workflow.chatCard, `<p>${text}</p>`, { anchor: "top", key: `midi-qol.noEffect.${label.slugify()}`, cssClass: "midi-qol-use-failed" });
  }
  return true;
}

type FailsSpec = "triggering" | "use" | true | { use?: "triggering" | "use", for?: "targets" | "self" | ("targets" | "self")[] };

/** The creatures `for` names (one or a list): the entry's own use's targets, its holder */
function failsFor(run: ActionRun, forSpec: string | string[] | undefined): string[] | undefined {
  if (!forSpec) return undefined;
  const uuids = new Set<string>();
  for (const which of [forSpec].flat()) {
    const tokens = which === "self"
      ? ((run.found.actor ?? run.context.actor)?.getActiveTokens(false, true) as TokenDocument.Implementation[] | undefined ?? [])
      : run.context.workflow?.targets.documents ?? [];
    for (const token of tokens) if (token.uuid) uuids.add(token.uuid);
  }
  return [...uuids];
}

/** `{ fails: "triggering" | "use" | { use?, for? } }` */
async function failsAction(run: ActionRun): Promise<void> {
  const label = typeof run.action.label === "string" ? run.action.label : (run.found.document as { name?: string }).name ?? run.found.entry.id;
  const own = run.context.workflow;
  const spec = run.action.fails as FailsSpec;
  const which = typeof spec === "object" ? spec.use ?? "triggering" : spec;
  const forUuids = typeof spec === "object" ? failsFor(run, spec.for) : undefined;
  if (forUuids && !forUuids.length) return;
  if (which !== "triggering") {
    if (own?.id) await failUseHere(own.id, label, forUuids);
    return;
  }
  const options = (own?.workflowOptions ?? {}) as { triggeringWorkflowId?: string, triggeringUserId?: string };
  if (!options.triggeringWorkflowId) return;
  if (await failUseHere(options.triggeringWorkflowId, label, forUuids)) return;
  const user = options.triggeringUserId ? game.users?.get(options.triggeringUserId) : undefined;
  if (!user || user.isSelf) return;
  try { await queryUser(user, FAIL_USE_QUERY, options.triggeringWorkflowId, label, forUuids); }
  catch (err) { console.warn("midi-qol | failing the use a reaction answered", err); }
}

export function registerCastReactions() {
  registerAction("fails", failsAction);
  registerMidiQuery(FAIL_USE_QUERY, (workflowId: string, label: string, forUuids?: string[]) => failUseHere(workflowId, label, forUuids));
}
