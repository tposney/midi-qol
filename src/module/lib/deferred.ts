import type { Activity } from "../../globals.js";
import { CONTINUE, SUSPEND } from "../steps/engine.js";
import { addStepChange, registerStep } from "../steps/steps.js";
import { Workflow, type UseHold } from "../Workflow.js";
import { budget, spend } from "../services/economy/ledger.js";
import { onTurnEvent } from "./turnEvents.js";
import { cardMidi } from "./cardState.js";
import { TokenDocumentSet } from "./tokenDocumentSet.js";
import { queryUser, registerMidiQuery } from "./midiQueries.js";
import { heldUses } from "./holds.js";
import { completeActivityUse } from "../utils.js";
import { systemConcentrationId } from "../../midi-qol.js";

/*
 * M22a: deferred uses (plan ~/Documents/midi-next-M20-M22-plan-2026-11-24.md), the service the Readied Actions module
 * builds on. `ready` makes an ordinary use of the activity that pays its cost now (the Ready action through the
 * ledger, a spell's slot and materials through dnd5e's own consumption) and then waits before it starts (a step
 * inserted before Start for uses with `workflowOptions.deferred`): before its templates, targets and rolls. Its card
 * records the hold (kind "deferred"), so it lasts across turns and reloads and is listed, released or dropped from any
 * client. `release` gives it its targets, spends the reaction (refused when it is spent: the use stays readied) and
 * lets it go on as any use; `drop` cancels it, refunding what it paid when asked. A readied spell may hold
 * concentration: an effect with the concentrating status, made at ready; if it ends the use is dropped; at release it
 * is removed first so the spell's own concentration can begin. It lapses at the readier's next turn start (lapse
 * "turnStart", in combat), or never. Triggers stay the module's.
 */

export interface DeferredOptions {
  /**
   * What releases it: a description (shown, the module watches for it), or a trigger midi watches for
   * (lib/deferredTriggers.ts: `{ on, who?, within? }`)
   */
  trigger?: string | import("./deferredTriggers.js").DeferredTrigger;
  /** The request handler type that asks the owner when the trigger happens (a module's own prompt); midi's Release / Hold otherwise */
  prompt?: string;
  /** How long the owner has to decide (ms); then it holds */
  timeoutMs?: number;
  /** "turnStart": dropped at the readier's next turn start (in combat); "never": until released or dropped */
  lapse?: "turnStart" | "never";
  /** Hold concentration while readied (a readied spell); `name`: the held effect's name */
  concentration?: boolean | { name?: string };
  /** The module's own data, kept with it */
  data?: Record<string, unknown>;
}

export interface DeferredUse {
  /** Its card's uuid: the id the service takes */
  id: string;
  card: ChatMessage.Implementation;
  actor?: Actor.Implementation | null;
  activity?: Activity | null;
  options: DeferredOptions;
  since: number;
  /** The concentration it holds (an effect uuid) */
  concentration?: string;
}

const STEP = "midi-qol.Deferred";
const POINT = "deferred";

const optionsOf = (card: ChatMessage.Implementation | null | undefined): DeferredOptions | undefined => {
  const options = cardMidi(card).state?.workflowOptions as { deferred?: DeferredOptions } | undefined;
  return options?.deferred;
};

/** The uses readied now */
export function deferredUses(filter: { actor?: Actor.Implementation } = {}): DeferredUse[] {
  return heldUses().filter(({ hold }) => hold.kind === "deferred").map(({ card, hold }) => {
    const activity = (card as { getAssociatedActivity?: () => Activity | null }).getAssociatedActivity?.() ?? null;
    return {
      id: card.uuid ?? "", card, activity, actor: activity?.actor ?? null, options: optionsOf(card) ?? {}, since: hold.since,
      ...(typeof hold.data?.concentration === "string" ? { concentration: hold.data.concentration } : {})
    };
  }).filter(use => !filter.actor || use.actor === filter.actor);
}

/** A concentration effect for a readied use: dnd5e treats it as the creature's concentration (checks on damage) */
async function holdConcentration(workflow: Workflow, name?: string): Promise<string | undefined> {
  const actor = workflow.actor as Actor.Implementation | undefined;
  const statusId = systemConcentrationId;
  const status = CONFIG.statusEffects.find(effect => effect.id === statusId);
  if (!actor || !status) return undefined;
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: name ?? `${status.name ? game.i18n?.localize(status.name) : statusId}: ${workflow.item?.name ?? ""}`,
    img: workflow.item?.img ?? status.img,
    statuses: [statusId],
    origin: workflow.item?.uuid
  }]);
  return (effect as ActiveEffect.Implementation | undefined)?.uuid ?? undefined;
}

async function runDeferred(workflow: Workflow): Promise<string> {
  if (workflow.holdsReleased.includes(POINT)) return CONTINUE;
  const options = (workflow.workflowOptions as { deferred?: DeferredOptions }).deferred ?? {};
  const held = options.concentration;
  const concentration = held ? await holdConcentration(workflow, typeof held === "object" ? held.name : undefined) : undefined;
  workflow.hold = { point: POINT, kind: "deferred", since: Date.now(), ...(concentration ? { data: { concentration } } : {}) };
  await workflow.flushCardWrites();
  Hooks.callAll("midi-qol.deferredReady", workflow);
  return SUSPEND;
}

/** Ready an activity: its use pays its cost and waits. Resolves to its id (card uuid) once readied, undefined if it never was */
export async function readyActivity(activity: Activity, options: DeferredOptions & {
  midiOptions?: Record<string, unknown>, usage?: Record<string, unknown>, dialog?: Record<string, unknown>, message?: Record<string, unknown>
} = {}): Promise<string | undefined> {
  const { midiOptions = {}, usage = {}, dialog = {}, message = {}, ...deferred } = options;
  const workflowOptions = { targetConfirmation: "none", ...(midiOptions.workflowOptions as object ?? {}), deferred: { lapse: "turnStart", ...deferred } };
  let readied: string | undefined;
  const hook = Hooks.on("midi-qol.deferredReady", (workflow: Workflow) => { if (workflow.activity?.uuid === activity.uuid) readied ??= workflow.itemCardUuid; });
  try {
    const used = completeActivityUse(activity, { ...usage, midiOptions: { ...midiOptions, workflowOptions } }, dialog, message);
    // Ready once it waits; or the use ended without waiting (cancelled, refused)
    for (let i = 0; i < 600 && !readied; i++) {
      const done = await Promise.race([used.then(() => true, () => true), new Promise(resolve => setTimeout(() => resolve(false), 100))]);
      if (done && !readied) break;
    }
    return readied;
  } finally {
    Hooks.off("midi-qol.deferredReady", hook);
  }
}

/** Release a readied use with its targets (token document uuids): run where the use runs */
export async function releaseDeferred(id: string, options: { targets?: string[], reaction?: boolean } = {}): Promise<string | undefined> {
  const message = fromUuidSync(id) as ChatMessage.Implementation | null;
  if (!message) return "midi-qol | no such readied use";
  const author = message.author;
  if (author?.active && !author.isSelf) return queryUser(author, "midiReleaseDeferred", id, options);
  return releaseHere(id, options);
}

async function releaseHere(id: string, { targets, reaction = true }: { targets?: string[], reaction?: boolean }): Promise<string | undefined> {
  const workflow = Workflow.findWorkflow(id);
  const hold: UseHold | undefined = workflow?.hold;
  if (!workflow || hold?.kind !== "deferred") return "midi-qol | the use isn't readied";
  const actor = workflow.actor as Actor.Implementation | undefined;
  // Refused while the reaction is spent: it stays readied
  if (reaction && actor && budget(actor, "reaction").exhausted) return "midi-qol | the reaction is already used";
  if (targets) workflow.targets = new TokenDocumentSet(targets.map(uuid => fromUuidSync(uuid) as TokenDocument.Implementation | null).filter((t): t is TokenDocument.Implementation => !!t));
  const concentration = typeof hold.data?.concentration === "string" ? fromUuidSync(hold.data.concentration) as ActiveEffect.Implementation | null : null;
  workflow.releaseHoldPoint(POINT);
  workflow.hold = undefined;
  await workflow.flushCardWrites();
  if (concentration) await concentration.delete();
  if (reaction && actor) await spend(actor, "reaction");
  Hooks.callAll("midi-qol.deferredReleased", workflow);
  void workflow.resume();
  return undefined;
}

/** Drop a readied use: cancelled where it runs; `refund`: what it paid given back */
const dropping = new Set<string>();
export async function dropDeferred(id: string, options: { refund?: boolean } = {}): Promise<string | undefined> {
  if (dropping.has(id)) return undefined;
  dropping.add(id);
  try { return await dropHere(id, options); }
  finally { dropping.delete(id); }
}

async function dropHere(id: string, options: { refund?: boolean }): Promise<string | undefined> {
  const message = fromUuidSync(id) as ChatMessage.Implementation | null;
  if (!message) return "midi-qol | no such readied use";
  const author = message.author;
  if (author?.active && !author.isSelf) return queryUser(author, "midiDropDeferred", id, options);
  const hold = cardMidi(message).state?.hold as UseHold | undefined;
  if (hold?.kind !== "deferred") return "midi-qol | the use isn't readied";
  const concentration = typeof hold.data?.concentration === "string" ? fromUuidSync(hold.data.concentration) as ActiveEffect.Implementation | null : null;
  const activity = (message as { getAssociatedActivity?: () => (Activity & { refund?: (deltas: unknown) => Promise<unknown> }) | null }).getAssociatedActivity?.();
  const deltas = (message.system as { deltas?: unknown } | undefined)?.deltas;
  const workflow = Workflow.findWorkflow(id);
  if (workflow) {
    workflow.hold = undefined;
    await workflow.flushCardWrites();
    await workflow.performState("midi-qol.Cancel");
  } else {
    await message.update({ "system.midi.state.hold": null, "system.midi.progress": { allRemoved: true } } as ChatMessage.UpdateData);
  }
  if (concentration) await concentration.delete();
  if (options.refund && deltas && activity?.refund) await activity.refund(deltas);
  Hooks.callAll("midi-qol.deferredDropped", id);
  return undefined;
}

export function registerDeferredUses() {
  registerStep({ id: STEP, name: "Deferred", run: ({ workflow }) => runDeferred(workflow) });
  addStepChange({ kind: "insert", step: STEP, before: "midi-qol.Start", layer: "global", source: "midi-qol.deferred",
    when: use => !!(use.workflowOptions as { deferred?: unknown } | undefined)?.deferred });
  registerMidiQuery("midiReleaseDeferred", (id: string, options: { targets?: string[], reaction?: boolean }) => releaseHere(id, options ?? {}));
  registerMidiQuery("midiDropDeferred", (id: string, options: { refund?: boolean }) => dropDeferred(id, options ?? {}));
  // Lapse: the readier's next turn start (the active GM, where turn events are raised)
  onTurnEvent("turnStart", "midi-qol.deferredLapse", async ({ actor }) => {
    if (!actor) return;
    for (const use of deferredUses({ actor })) if ((use.options.lapse ?? "turnStart") === "turnStart") await dropDeferred(use.id);
  });
  // A held concentration ended (a failed check, ended by hand): the readied use goes (the active GM decides once)
  Hooks.on("deleteActiveEffect", (effect: ActiveEffect.Implementation) => {
    if (!game.user?.isActiveGM) return;
    const use = deferredUses().find(u => u.concentration === effect.uuid);
    if (use) void dropDeferred(use.id);
  });
}

export const deferredApi = {
  /** midi watches a readied use's trigger (`{ on, who, within }`) and asks its owner (lib/deferredTriggers.ts) */
  watchesTriggers: true,
  ready: readyActivity,
  list: deferredUses,
  release: releaseDeferred,
  drop: dropDeferred
};
