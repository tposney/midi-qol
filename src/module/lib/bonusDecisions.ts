import { configSettings } from "../settings.js";
import { queryUser, registerMidiQuery } from "./midiQueries.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "./requests.js";

/*
 * An optional bonus offered inside a roll that answers a request (a player's requested save or concentration roll):
 * decided under the requester's save deadline, and on the player list where a GM can skip it (user, 2026-11-19). The
 * request the roll answers was claimed when the roll was confirmed, so it has no deadline of its own by then; the
 * player's client asks the requester to hold a "bonus" request for the decision, whose countdown the bonus dialog shows.
 * Timed out or skipped: the dialog closes and the roll stands with what was chosen so far.
 */

export const BONUS_DECISION_REQUEST = "midi-qol.bonusDecision";
const ASK_BONUS_DECISION = "askBonusDecision";
/** How long the player's client waits for the requester's ask before deciding on its own (the requester left) */
const ARRIVAL_MS = 5000;

/** The request each requested roll answers, by its claim id (midiOptions.requestClaim) */
const byClaim = new Map<string, IncomingRequest>();
/** Bonus decisions waiting for the requester's ask, by id */
const awaitingAsk = new Map<string, (incoming: IncomingRequest) => Promise<boolean>>();

export function bindRollClaim(claim: string, request: IncomingRequest): () => void {
  byClaim.set(claim, request);
  return () => { byClaim.delete(claim); };
}

export function requestForRollClaim(claim: string | undefined): IncomingRequest | undefined {
  return claim ? byClaim.get(claim) : undefined;
}

export interface BonusDecision {
  /** The requester's bonus request (its countdown, settled for the player); none: decided here with the dialog's own timer */
  incoming?: IncomingRequest;
  /** The dialog has closed: answers the requester's bonus request */
  finish(): void;
}

/** On the player's client: have `within`'s requester hold the decision about to be offered */
export async function askBonusDecision(within: IncomingRequest, spec: { actorUuid?: string, tokenUuid?: string, label: string }): Promise<BonusDecision> {
  const id = foundry.utils.randomID();
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const incoming = await new Promise<IncomingRequest | undefined>(resolve => {
    const timer = setTimeout(() => resolve(undefined), ARRIVAL_MS);
    awaitingAsk.set(id, async request => { clearTimeout(timer); resolve(request); await finished; return true; });
    queryUser(game.users?.get(within.holderId), ASK_BONUS_DECISION, { id, userId: game.user?.id, ...spec })
      .then(answer => { if (!answer?.ok) { clearTimeout(timer); resolve(undefined); } }, () => { clearTimeout(timer); resolve(undefined); });
  });
  if (!incoming) awaitingAsk.delete(id);
  return { incoming, finish: () => { awaitingAsk.delete(id); finish(); } };
}

export function registerBonusDecisions(): void {
  // The asked client: the bonus dialog waiting for this ask takes its countdown; answered when the dialog closes
  registerRequestHandler(BONUS_DECISION_REQUEST, (data: { id: string }, incoming: IncomingRequest) => awaitingAsk.get(data.id)?.(incoming) ?? false);
  // The requester: hold the decision on the save deadline, with the GM's skip
  registerMidiQuery(ASK_BONUS_DECISION, (data: { id: string, userId: string, actorUuid?: string, tokenUuid?: string, label: string }) => {
    const user = game.users?.get(data.userId);
    if (!user?.active) return { ok: false };
    void askUser<boolean>(user, {
      type: BONUS_DECISION_REQUEST, data: { id: data.id }, kind: "bonus", actorUuid: data.actorUuid, tokenUuid: data.tokenUuid, label: data.label,
      timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000,
      fallback: () => false,
      gmChoices: { skip: () => false }
    }).settled.catch(() => undefined);
    return { ok: true };
  });
}
