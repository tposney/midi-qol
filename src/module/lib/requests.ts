import { configSettings } from "../settings.js";
import { DialogCountdown } from "./dialogCountdown.js";
import { beginPlayerWait, type PlayerWait, type WaitChoice, type WaitChoiceSpec } from "./playerWaits.js";
import { MidiRequest, RequestRegistry, type SettledHow } from "./requests/core.js";

/*
 * Requests between clients (midi-next M3 stage 3; plan ~/Documents/midi-next-M3-plan-2026-11-18.md). The requester asks
 * a user through Foundry's User#query and holds the request (lib/requests/core.ts): its deadline, the first answer,
 * clean-up. The asked client runs the handler registered for the request's type and shows the requester's deadline
 * (display only). Messages about a request (pause, resume, claim, settled) are queries too. A GM can answer for the
 * player from the player list (playerWaits) when the request gives choices.
 *
 *   registerRequestHandler("my-mod.pick", async (data, request) => { …show a dialog with request.countdown()…;
 *     if (!await request.claim()) return undefined; return choice; });
 *   const { value, how } = await askUser(user, { type: "my-mod.pick", data, kind: "pick", label: "Pick one",
 *     timeoutMs: 30_000, fallback: () => "none" }).settled;
 */

export const REQUEST_QUERY = "midi-qol.request";
export const REQUEST_EVENT_QUERY = "midi-qol.requestEvent";

type RequestEvent =
  // To the requester
  | { to: "holder", id: string, event: "pause" | "resume" | "claim" }
  // To the asked client
  | { to: "asked", id: string, event: "settled", how: SettledHow }
  | { to: "asked", id: string, event: "paused" | "resumed", remaining: number };

export type RequestHandler = (data: any, request: IncomingRequest) => unknown;
const handlers = new Map<string, RequestHandler>();

/** What the asked client runs for a request of `type`: its return value answers the request. */
export function registerRequestHandler(type: string, handler: RequestHandler): void {
  handlers.set(type, handler);
}

const held = new RequestRegistry();
/** The player-list entry of a held request a GM can answer */
const waits = new Map<string, PlayerWait<unknown>>();
const incoming = new Map<string, IncomingRequest>();

export interface AskSpec<T> {
  /** The registered handler (registerRequestHandler) the asked client runs. */
  type: string;
  /** JSON-serialisable. */
  data?: object;
  kind: string;
  actorUuid?: string;
  tokenUuid?: string;
  /** Shown to the GM in the player list. */
  label: string;
  /** Deciding time; 0 or less: none. */
  timeoutMs: number;
  /** The answer on time-out, disconnect or error (non-interactive). */
  fallback: () => T | Promise<T>;
  /** What a GM can answer with from the player list (playerWaits); the first is the default. None: the GM can't. */
  gmChoices?: Partial<Record<WaitChoice, WaitChoiceSpec<T>>>;
  source?: string;
}

async function sendEvent(userId: string, event: RequestEvent): Promise<{ ok: boolean, remaining?: number }> {
  const user = game.users?.get(userId);
  if (!user?.active) return { ok: false };
  try { return (await user.query(REQUEST_EVENT_QUERY, event)) as { ok: boolean, remaining?: number }; }
  catch { return { ok: false }; }
}

/**
 * Ask `user` and hold the request. Settles with the user's answer, a GM's choice from the player list, the fallback
 * when the deadline passes, or the fallback when the user leaves (kept for the GM instead, with choices and the
 * *GM answers for players* setting on).
 */
export function askUser<T>(user: User.Implementation, spec: AskSpec<T>): MidiRequest<T> {
    const request = held.add(new MidiRequest<T>({
    kind: spec.kind, userId: user.id ?? undefined, actorUuid: spec.actorUuid, timeoutMs: spec.timeoutMs, fallback: spec.fallback,
    onSettled: ({ how }) => {
      waits.get(request.id)?.end();
      if (how !== "player") void sendEvent(user.id!, { to: "asked", id: request.id, event: "settled", how });
      Hooks.callAll("midi-qol.requestSettled", request, how);
    },
    onFailed: () => {
      waits.get(request.id)?.end();
      void sendEvent(user.id!, { to: "asked", id: request.id, event: "settled", how: "error" });
      Hooks.callAll("midi-qol.requestSettled", request, "error");
    }
  }, { id: foundry.utils.randomID() }));
  Hooks.callAll("midi-qol.requestStarted", request);
  if (spec.gmChoices) {
    const wait = beginPlayerWait<T>({
      kind: spec.kind, userId: user.id!, actorUuid: spec.actorUuid, tokenUuid: spec.tokenUuid, label: spec.label,
      choices: spec.gmChoices, source: spec.source, keepDialogs: true
    });
    if (wait) {
      waits.set(request.id, wait);
      const forget = () => { waits.delete(request.id); };
      void request.settled.then(forget, forget);
      void wait.settled.then(({ value }) => request.settle(value, "gm"));
    }
  }
  const keepForGM = () => waits.has(request.id) && configSettings.playerWaitGM;
  if (!user.active) {
    if (!keepForGM()) request.settleWith(spec.fallback, "disconnect");
    return request;
  }
  void user.query(REQUEST_QUERY, { type: spec.type, id: request.id, holderId: game.user!.id, remaining: request.deadline.remaining, data: spec.data ?? {} })
    .then(value => { request.settle(value as T, "player"); })
    .catch(err => {
      if (!request.pending) return;
      if (!user.active) { if (!keepForGM()) request.settleWith(spec.fallback, "disconnect"); return; }
      console.warn(`midi-qol | request ${spec.type} to ${user.name} failed`, err);
      request.settleWith(spec.fallback, "error");
    });
  return request;
}

/** Settle a request this client holds (a GM's answer from a module's own UI). */
export function settleRequest(id: string, value: unknown, how: SettledHow = "gm"): boolean {
  return held.get(id)?.settle(value, how) ?? false;
}

export function heldRequests(): MidiRequest<unknown>[] {
  return held.all();
}

export function requestsFor(actorUuid: string): MidiRequest<unknown>[] {
  return held.forActor(actorUuid);
}

/** A request on the asked client: its deadline (shown, owned by the requester), claim, and whether it was settled for them. */
export class IncomingRequest {
  readonly id: string;
  readonly holderId: string;
  /** Time left as last told by the requester (on asking, then on each pause and resume), and when */
  #toldRemaining: number;
  #toldAt = Date.now();
  #paused = false;
  /** The request had a deadline when asked (none: no countdown) */
  readonly #hasDeadline: boolean;
  #countdowns: DialogCountdown[] = [];
  #closers: ((how: SettledHow) => void)[] = [];
  #settledHow: SettledHow | undefined;

  constructor(id: string, holderId: string, remaining: number) {
    this.id = id;
    this.holderId = holderId;
    this.#toldRemaining = remaining;
    this.#hasDeadline = remaining > 0;
  }

  /** The time left as of now, by what the requester last said (on asking, pause, resume); paused: it doesn't run down. */
  get remaining(): number { return this.#paused ? this.#toldRemaining : Math.max(0, this.#toldRemaining - (Date.now() - this.#toldAt)); }
  get paused(): boolean { return this.#paused; }
  /** Answered for the player (a GM, the time-out, a disconnect): how, else undefined. */
  get settledHow(): SettledHow | undefined { return this.#settledHow; }

  /** A countdown for this request's dialog: display only, the requester decides when time is up. Pausing asks it. */
  countdown(): DialogCountdown | undefined {
    if (!this.#hasDeadline) return undefined;
    const countdown: DialogCountdown = new DialogCountdown({
      seconds: this.remaining / 1000,
      onExpire: () => { },
      onPause: paused => {
        void sendEvent(this.holderId, { to: "holder", id: this.id, event: paused ? "pause" : "resume" }).then(answer => {
          if (!answer.ok && paused) countdown.resume(false);
          else if (answer.remaining !== undefined) {
            if (answer.ok) { this.#toldRemaining = answer.remaining; this.#toldAt = Date.now(); this.#paused = paused; }
            countdown.sync(answer.remaining);
          }
        });
      }
    });
    this.#countdowns.push(countdown);
    return countdown;
  }

  /** The player has decided: false when it was already answered for them (drop what they chose). */
  async claim(): Promise<boolean> {
    if (this.#settledHow) return false;
    const answer = await sendEvent(this.holderId, { to: "holder", id: this.id, event: "claim" });
    if (answer.ok) for (const countdown of this.#countdowns) countdown.stop();
    return answer.ok;
  }

  /** Called when the request is answered for the player: close its dialog. */
  onSettled(close: (how: SettledHow) => void): void {
    if (this.#settledHow) close(this.#settledHow);
    else this.#closers.push(close);
  }

  _settled(how: SettledHow) {
    if (this.#settledHow) return;
    this.#settledHow = how;
    for (const countdown of this.#countdowns) countdown.stop();
    for (const close of this.#closers.splice(0)) {
      try { close(how); } catch (err) { console.error("midi-qol | closing a settled request", err); }
    }
  }

  _sync(paused: boolean, remaining: number) {
    this.#toldRemaining = remaining;
    this.#toldAt = Date.now();
    this.#paused = paused;
    for (const countdown of this.#countdowns) {
      countdown.sync(remaining);
      if (paused) countdown.pause(false);
      else countdown.resume(false);
    }
  }

  _end() {
    for (const countdown of this.#countdowns) countdown.stop();
    this.#closers = [];
  }
}

async function onRequest({ type, id, holderId, remaining, data }: { type: string, id: string, holderId: string, remaining: number, data: object }) {
  const handler = handlers.get(type);
  if (!handler) throw new Error(`midi-qol | no request handler ${type} on ${game.user?.name}`);
  const request = new IncomingRequest(id, holderId, remaining);
  incoming.set(id, request);
  try { return await handler(data, request); }
  finally {
    incoming.delete(id);
    request._end();
  }
}

function onRequestEvent(data: { to: "holder" | "asked", id: string, event: string, how?: string, remaining?: number }): { ok: boolean, remaining?: number } {
  const event = data as RequestEvent;
  if (event.to === "holder") {
    const request = held.get(event.id);
    if (!request?.pending) return { ok: false };
    const ok = event.event === "pause" ? request.pause() : event.event === "resume" ? request.resume() : request.claim();
    // Claimed: the player is acting on their answer, so the GM can't answer for them any more
    if (ok && event.event === "claim") waits.get(event.id)?.end();
    return { ok, remaining: request.deadline.remaining };
  }
  const request = incoming.get(event.id);
  if (!request) return { ok: false };
  if (event.event === "settled") request._settled(event.how);
  else request._sync(event.event === "paused", event.remaining);
  return { ok: true };
}

/** Pause or resume a request this client holds (the requester's own pause), telling the asked client. */
export function pauseRequest(id: string, paused: boolean): boolean {
  const request = held.get(id);
  if (!request) return false;
  const ok = paused ? request.pause() : request.resume();
  if (ok && request.spec.userId) void sendEvent(request.spec.userId, { to: "asked", id, event: paused ? "paused" : "resumed", remaining: request.deadline.remaining });
  return ok;
}

/** Register the queries; before setupPlayerWaits, so a disconnect settles a request before playerWaits sees it. */
export function setupRequests() {
  CONFIG.queries[REQUEST_QUERY] = onRequest;
  CONFIG.queries[REQUEST_EVENT_QUERY] = onRequestEvent;
  Hooks.on("userConnected", (user: User.Implementation, connected: boolean) => {
    if (connected) return;
    for (const request of held.forUser(user.id!)) {
      // Kept for the GM when the player list can answer it (playerWaits marks it offline)
      if (request.phase === "deciding" && configSettings.playerWaitGM && waits.has(request.id)) continue;
      request.settleWith(request.spec.fallback, "disconnect");
    }
  });
}

export const requestsApi = { ask: askUser, registerHandler: registerRequestHandler, settle: settleRequest, pause: pauseRequest, held: heldRequests, for: requestsFor };
