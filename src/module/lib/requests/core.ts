/*
 * The request core (midi-next M3 stage 3; rules: ~/Documents/midi-request-redesign-plan-2026-11-10.md). A request asks
 * someone to decide (a player's reaction, a save) and waits. The requester owns it and its deadline; the first answer
 * wins (the player, a GM, the time-out, a disconnect) and says how. The deadline covers deciding only: once the player
 * claims the request (has decided and is acting on it), it waits for the result without a limit. Pure: the clock is
 * injectable, so the rules are tested in Vitest; lib/requests.ts carries requests between clients.
 */

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * A deadline that can be paused. A pause counts only if it comes before expiry; time left is kept as a remaining
 * duration, so another client syncs by it rather than by clocks. 0 or less: no deadline (never expires).
 */
export class Deadline {
  #remaining: number;
  #since = 0;
  #handle: unknown;
  #state: "running" | "paused" | "stopped" | "expired" | "none";
  readonly #onExpire: () => void;
  readonly #clock: Clock;

  constructor(ms: number, onExpire: () => void, clock: Clock = realClock) {
    this.#onExpire = onExpire;
    this.#clock = clock;
    this.#remaining = Math.max(0, ms);
    this.#state = ms > 0 ? "running" : "none";
    if (this.#state === "running") this.#arm();
  }

  get state() { return this.#state; }
  get remaining(): number {
    if (this.#state === "running") return Math.max(0, this.#remaining - (this.#clock.now() - this.#since));
    return this.#state === "expired" ? 0 : this.#remaining;
  }

  #arm() {
    this.#since = this.#clock.now();
    this.#handle = this.#clock.setTimeout(() => this.#expire(), this.#remaining);
  }

  #expire() {
    if (this.#state !== "running") return;
    this.#state = "expired";
    this.#remaining = 0;
    this.#onExpire();
  }

  /** False when it has expired or stopped (too late to pause). */
  pause(): boolean {
    if (this.#state === "paused") return true;
    if (this.#state !== "running") return false;
    this.#remaining = this.remaining;
    this.#clock.clearTimeout(this.#handle);
    if (this.#remaining <= 0) { this.#expire(); return false; }
    this.#state = "paused";
    return true;
  }

  resume(): boolean {
    if (this.#state !== "paused") return this.#state === "running";
    this.#state = "running";
    this.#arm();
    return true;
  }

  /** No expiry any more (answered, or claimed). */
  stop() {
    if (this.#state === "running") this.#remaining = this.remaining;
    this.#clock.clearTimeout(this.#handle);
    if (this.#state === "running" || this.#state === "paused") this.#state = "stopped";
  }
}

/** How a request was settled. "error": asking failed (not a disconnect), and the fallback was used. */
/** "abandoned": what the request was for went away while it waited (a readied use dropped) */
export type SettledHow = "player" | "gm" | "timeout" | "disconnect" | "cancelled" | "abandoned" | "error";

export interface Settled<T> { value: T, how: SettledHow }

export interface RequestSpec<T> {
  /** save, reaction, bonus...: shown to the GM, used by whoever indexes them. */
  kind: string;
  /** Who is asked. */
  userId?: string;
  /** The creature it waits on (requestsFor). */
  actorUuid?: string;
  /** Deciding time; 0 or less: none. */
  timeoutMs: number;
  /** The answer when nobody gives one (time-out, disconnect, error). Non-interactive. */
  fallback: () => T | Promise<T>;
  /** Clean-up and notifications once settled (any way). */
  onSettled?: (settled: Settled<T>) => void;
  /** Clean-up when it could not be settled: the answer and the fallback both failed, and `settled` rejects. */
  onFailed?: (err: unknown) => void;
}

/** A request without its value type (hooks, lists): what it is, who and what it waits on, where it is. */
export type RequestView = Pick<MidiRequest<unknown>, "id" | "phase" | "how" | "pending" | "deadline"> & { spec: Pick<RequestSpec<unknown>, "kind" | "userId" | "actorUuid" | "timeoutMs"> };

let nextId = 0;

/** One request: decides once, with how. */
export class MidiRequest<T> {
  readonly id: string;
  readonly spec: RequestSpec<T>;
  readonly deadline: Deadline;
  readonly settled: Promise<Settled<T>>;
  #resolve!: (settled: Settled<T>) => void;
  #reject!: (reason: unknown) => void;
  #phase: "deciding" | "using" | "settled" = "deciding";
  #how: SettledHow | undefined;

  constructor(spec: RequestSpec<T>, options: { id?: string, clock?: Clock } = {}) {
    this.id = options.id ?? `request-${++nextId}`;
    this.spec = spec;
    this.settled = new Promise((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
    this.deadline = new Deadline(spec.timeoutMs, () => { void this.settleWith(spec.fallback, "timeout"); }, options.clock);
  }

  get phase() { return this.#phase; }
  get how() { return this.#how; }
  get pending() { return this.#phase !== "settled"; }

  /** The answer; false when already settled (a late answer is dropped). */
  settle(value: T, how: SettledHow): boolean {
    return this.settleWith(() => value, how);
  }

  /** Settles with what `make` gives (the fallback, a GM's choice): claimed at once, so nothing else settles meanwhile. */
  settleWith(make: () => T | Promise<T>, how: SettledHow): boolean {
    if (this.#phase === "settled") return false;
    this.#phase = "settled";
    this.#how = how;
    this.deadline.stop();
    void (async () => {
      let value: T;
      try { value = await make(); }
      catch (err) {
        console.error(`midi-qol | request ${this.id} (${this.spec.kind}): settling ${how}`, err);
        try { value = await this.spec.fallback(); }
        catch (fallbackErr) {
          // Nothing to answer with: the requester is told rather than left waiting
          try { this.spec.onFailed?.(fallbackErr); } catch (cleanUpErr) { console.error(`midi-qol | request ${this.id} clean-up`, cleanUpErr); }
          this.#reject(fallbackErr);
          return;
        }
      }
      const settled = { value, how };
      try { this.spec.onSettled?.(settled); } catch (err) { console.error(`midi-qol | request ${this.id} clean-up`, err); }
      this.#resolve(settled);
    })();
    return true;
  }

  /** The player has decided and is acting on it: no deadline from now. False when it is already settled. */
  claim(): boolean {
    if (this.#phase === "settled") return false;
    this.#phase = "using";
    this.deadline.stop();
    return true;
  }

  /** Only while deciding, and only before expiry. */
  pause(): boolean { return this.#phase === "deciding" && this.deadline.pause(); }
  resume(): boolean { return this.#phase === "deciding" && this.deadline.resume(); }
}

/** The requests this client holds, by id and by the creature they wait on. A settled request leaves. */
export class RequestRegistry {
  readonly #byId = new Map<string, MidiRequest<unknown>>();

  add<T>(request: MidiRequest<T>): MidiRequest<T> {
    this.#byId.set(request.id, request as MidiRequest<unknown>);
    const leave = () => { this.#byId.delete(request.id); };
    void request.settled.then(leave, leave);
    return request;
  }

  get(id: string): MidiRequest<unknown> | undefined { return this.#byId.get(id); }

  forActor(actorUuid: string): MidiRequest<unknown>[] {
    return [...this.#byId.values()].filter(request => request.spec.actorUuid === actorUuid);
  }

  forUser(userId: string): MidiRequest<unknown>[] {
    return [...this.#byId.values()].filter(request => request.spec.userId === userId);
  }

  all(): MidiRequest<unknown>[] { return [...this.#byId.values()]; }
}
