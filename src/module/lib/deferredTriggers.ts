import { i18n } from "../../midi-qol.js";
import type { Workflow } from "../Workflow.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "./requests.js";
import { deferredUses, releaseDeferred, type DeferredUse } from "./deferred.js";
import { onTurnEvent } from "./turnEvents.js";
import { tokenFor } from "./tokenResolver.js";
import { checkActivityRange } from "../utils.js";
import { getDistance } from "../services/distance/service.js";

/*
 * M22a: what releases a readied use (plan ~/Documents/midi-next-M20-M22-plan-2026-11-24.md, "midi helping with
 * triggers"). A readied use may name its trigger: `{ on, who?, within? }`. midi notices it from its own events, each
 * raised once on one client: a creature's turn start or end (the turn events, on the active GM), its use once resolved
 * (attack, cast, any use: on the user's client), and its move into or out of `within` of the readier (the move
 * watchers, opportunity.ts: the mover is stopped there while it is decided, then goes on). Who: the triggering creature
 * against the readier (hostile, ally, any, or one creature by uuid; never the readier). Reach: `within` feet, else the
 * readied activity's range at the creature. For each match the readier's owner (an active player, the one whose
 * character it is first; else the GM) is asked once through the request core, with the module's prompt (`prompt`: a
 * request handler type) or midi's Release / Hold; a GM can answer from the player list; time out: hold. Released: the
 * triggering creature is the target unless the prompt chose others.
 */

export type DeferredTriggerOn = "attack" | "cast" | "use" | "turnStart" | "turnEnd" | "enters" | "leaves";
export interface DeferredTrigger {
  on: DeferredTriggerOn;
  /** Default "hostile" */
  who?: "hostile" | "ally" | "any" | string;
  /** Feet from the readier (enters/leaves: required; others: else the activity's range) */
  within?: number;
}
/** What a prompt answers */
export interface DeferredAnswer { release: boolean, targets?: string[] }
/** What a prompt is given */
export interface DeferredPromptData {
  id: string, readier?: string, subject?: string, reason: string, label: string,
  /** What happened (a module words its own reason from these) */
  on?: DeferredTriggerOn, within?: number, item?: string
}

export const DEFAULT_PROMPT = "midi-qol.deferredPrompt";
const TIMEOUT_MS = 30_000;

export const triggerOf = (use: DeferredUse): DeferredTrigger | undefined => {
  const trigger = use.options.trigger;
  return trigger && typeof trigger === "object" && typeof trigger.on === "string" ? trigger as DeferredTrigger : undefined;
};

/** The readier's token: its card's speaker, else the actor's */
export function readierOf(use: DeferredUse): TokenDocument.Implementation | undefined {
  const speaker = use.card.speaker;
  const fromCard = speaker?.token ? game.scenes?.get(speaker.scene ?? "")?.tokens.get(speaker.token) : undefined;
  return (fromCard as TokenDocument.Implementation | undefined) ?? tokenFor(use.actor ?? undefined);
}

export function whoMatches(trigger: DeferredTrigger, readier: TokenDocument.Implementation, subject: TokenDocument.Implementation): boolean {
  if (subject === readier || subject.actor === readier.actor) return false;
  const who = trigger.who ?? "hostile";
  if (who === "any") return true;
  if (who === "hostile") return subject.disposition !== readier.disposition && subject.disposition !== CONST.TOKEN_DISPOSITIONS.NEUTRAL;
  // A neutral readier has no allies
  if (who === "ally") return readier.disposition !== CONST.TOKEN_DISPOSITIONS.NEUTRAL && subject.disposition === readier.disposition;
  return subject.uuid === who;
}

function inReach(use: DeferredUse, trigger: DeferredTrigger, readier: TokenDocument.Implementation, subject: TokenDocument.Implementation): boolean {
  if (subject.parent !== readier.parent) return false;
  if (trigger.within !== undefined) {
    const distance = getDistance(readier, subject, { wallsBlock: false });
    return distance >= 0 && distance <= trigger.within + 1e-6;
  }
  if (!use.activity) return false;
  // The range check measures drawn tokens (given documents it fails at reach)
  const from = readier.object ?? readier, to = subject.object ?? subject;
  return checkActivityRange(use.activity, from, new Set([to]), false).result !== "fail";
}

/** Who decides for a readier: an active player owner (its character's player first), else the active GM */
function deciderFor(actor: Actor.Implementation | null | undefined): User.Implementation | undefined {
  const players = (game.users?.filter(u => u.active && !u.isGM && !!actor?.testUserPermission(u, "OWNER")) ?? []) as User.Implementation[];
  return players.find(u => u.character === actor) ?? players[0] ?? (game.users?.activeGM ?? undefined);
}

/** Readied uses being decided on this client (a use is asked about once at a time) */
const asking = new Set<string>();

/** Ask the readier's owner whether to release now; released at the creature (or the prompt's targets) */
export async function offerRelease(use: DeferredUse, subject: TokenDocument.Implementation | undefined, reason: string,
  { awaitUse = false, on, item }: { awaitUse?: boolean, on?: DeferredTriggerOn, item?: string } = {}): Promise<boolean> {
  if (asking.has(use.id)) return false;
  const user = deciderFor(use.actor);
  if (!user) return false;
  asking.add(use.id);
  try {
    const readier = readierOf(use);
    const label = use.activity?.item?.name ?? use.activity?.name ?? "";
    const within = triggerOf(use)?.within;
    const data: DeferredPromptData = { id: use.id, ...(readier?.uuid ? { readier: readier.uuid } : {}), ...(subject?.uuid ? { subject: subject.uuid } : {}), reason, label,
      ...(on ? { on } : {}), ...(within !== undefined ? { within } : {}), ...(item ? { item } : {}) };
    const hold = (): DeferredAnswer => ({ release: false });
    const release = (): DeferredAnswer => ({ release: true, ...(subject?.uuid ? { targets: [subject.uuid] } : {}) });
    const { value } = await askUser<DeferredAnswer>(user, {
      type: use.options.prompt ?? DEFAULT_PROMPT, data, kind: "deferred", actorUuid: use.actor?.uuid ?? undefined, tokenUuid: readier?.uuid ?? undefined,
      label: i18n("midi-qol.Deferred.PromptLabel").replace("{name}", label), timeoutMs: use.options.timeoutMs ?? TIMEOUT_MS, fallback: hold,
      gmChoices: { release: { label: "midi-qol.Deferred.Release", value: release }, hold: { label: "midi-qol.Deferred.Hold", value: hold } }
    }).settled;
    // Still readied (concentration may have broken, another client may have released it meanwhile)
    if (!value?.release || !deferredUses().some(u => u.id === use.id)) return false;
    const problem = await releaseDeferred(use.id, { targets: value.targets ?? (subject?.uuid ? [subject.uuid] : []) });
    if (problem) { console.warn(`midi-qol | ${problem}`); return false; }
    // A mover waits for the readied use to resolve before it goes on (its card finished, or a minute)
    if (awaitUse) {
      const finished = () => !!(fromUuidSync(use.id) as { system?: { midi?: { progress?: { finished?: boolean } } } } | null)?.system?.midi?.progress?.finished;
      for (let i = 0; i < 600 && !finished(); i++) await new Promise(resolve => setTimeout(resolve, 100));
    }
    return true;
  } finally {
    asking.delete(use.id);
  }
}

/** The readied uses a creature's action sets off, asked about one after another */
export async function raiseTrigger(on: DeferredTriggerOn, subject: TokenDocument.Implementation | undefined, reason: string, item?: string): Promise<void> {
  if (!subject) return;
  for (const use of deferredUses()) {
    const trigger = triggerOf(use);
    const readier = readierOf(use);
    if (trigger?.on !== on || !readier || !whoMatches(trigger, readier, subject) || !inReach(use, trigger, readier, subject)) continue;
    await offerRelease(use, subject, reason, { on, item });
  }
}

/** The readied uses watching movement on this scene (opportunity.ts checks a move against them) */
export function movementWatches(mover: TokenDocument.Implementation): { use: DeferredUse, readier: TokenDocument.Implementation, within: number, enters: boolean, leaves: boolean }[] {
  const out: { use: DeferredUse, readier: TokenDocument.Implementation, within: number, enters: boolean, leaves: boolean }[] = [];
  for (const use of deferredUses()) {
    const trigger = triggerOf(use);
    if (!trigger || (trigger.on !== "enters" && trigger.on !== "leaves")) continue;
    const readier = readierOf(use);
    if (!readier || readier.parent !== mover.parent || !whoMatches(trigger, readier, mover)) continue;
    out.push({ use, readier, within: trigger.within ?? 5, enters: trigger.on === "enters", leaves: trigger.on === "leaves" });
  }
  return out;
}

/** midi's own prompt: Release / Hold, with the request's countdown; closed when answered for the player */
async function defaultPrompt(data: DeferredPromptData, request: IncomingRequest): Promise<DeferredAnswer | undefined> {
  const countdown = request.countdown();
  let dialog: foundry.applications.api.DialogV2 | undefined;
  request.onSettled(() => { void dialog?.close(); });
  const escape = foundry.utils.escapeHTML;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: i18n("midi-qol.Deferred.PromptTitle") },
    content: `<p>${escape(data.reason)}</p><p>${i18n("midi-qol.Deferred.PromptQuestion").replace("{name}", escape(data.label))}</p>`,
    buttons: [
      { action: "release", label: i18n("midi-qol.Deferred.Release"), default: true },
      { action: "hold", label: i18n("midi-qol.Deferred.Hold") }
    ],
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => {
      dialog = app;
      countdown?.attach(app.element);
    }
  }) as string | null | undefined;
  if (!choice || request.settledHow) return undefined;
  if (!await request.claim()) return undefined;
  return choice === "release" ? { release: true, ...(data.subject ? { targets: [data.subject] } : {}) } : { release: false };
}

const tokenName = (token: TokenDocument.Implementation | null | undefined) => token?.name ?? "";

export function registerDeferredTriggers() {
  registerRequestHandler(DEFAULT_PROMPT, defaultPrompt);
  // A creature's turn starts or ends (the active GM): detached, it asks a player
  for (const [event, on, key] of [["turnStart", "turnStart", "midi-qol.Deferred.TurnStart"], ["turnEnd", "turnEnd", "midi-qol.Deferred.TurnEnd"]] as const) {
    onTurnEvent(event, `midi-qol.deferredTrigger.${on}`, async ({ token }) => {
      await raiseTrigger(on, token ?? undefined, i18n(key).replace("{name}", tokenName(token)));
    }, { detached: true });
  }
  // A use resolved (on the client that made it)
  Hooks.on("midi-qol.RollComplete" as never, ((workflow: Workflow) => {
    const subject = tokenFor(workflow.token ?? workflow.actor);
    const activity = workflow.activity;
    if (!subject || !activity) return;
    const item = activity.item;
    const name = tokenName(subject), used = item?.name ?? activity.name ?? "";
    void (async () => {
      if (activity.type === "attack") await raiseTrigger("attack", subject, i18n("midi-qol.Deferred.Attacked").replace("{name}", name).replace("{item}", used), used);
      if ((item?.type as string) === "spell") await raiseTrigger("cast", subject, i18n("midi-qol.Deferred.Cast").replace("{name}", name).replace("{item}", used), used);
      await raiseTrigger("use", subject, i18n("midi-qol.Deferred.Used").replace("{name}", name).replace("{item}", used), used);
    })().catch(err => console.error("midi-qol | readied trigger", err));
  }) as never);
}
