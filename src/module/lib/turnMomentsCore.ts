import { Registry } from "../api/registry.js";

/*
 * The turn-moment dispatcher's core (M4 stage 1; lib/turnMoments.ts wires it to Foundry's combat): handlers per moment,
 * run one after another in priority order, each awaited and isolated (a handler that throws is reported and the next
 * runs) unless it is `detached` (started in its turn, not waited for: a handler that asks a player or runs long), each
 * awaited at most `cap` ms (a slower one is reported and left running: core awaits the dispatcher before its
 * own expiry and region events, so a handler must not hold a turn up); and moments for one key (a combat) delivered in
 * the order they were raised, one dispatch after another. Pure: no Foundry globals.
 */

export const TURN_MOMENTS = ["enterCombat", "combatStart", "roundStart", "turnStart", "turnEnd", "roundEnd", "rewind", "exitCombat", "combatEnd"] as const;
export type TurnMomentName = typeof TURN_MOMENTS[number];

export type MomentHandler<P> = (payload: P) => unknown;
export interface HandlerOptions { priority?: number, detached?: boolean, uncapped?: boolean }
type HandlerMeta = { uncapped?: boolean, detached?: boolean };

export interface DispatcherOptions {
  /** How long a handler is waited for, ms */
  cap?: number;
  onError?: (handlerId: string, moment: string, error: unknown) => void;
  onSlow?: (handlerId: string, moment: string, cap: number) => void;
}

export class MomentDispatcher<P extends { moment: string }> {
  readonly #handlers = new Map<string, Registry<MomentHandler<P>, HandlerMeta>>();
  readonly #queues = new Map<string, Promise<void>>();
  readonly #options: Required<DispatcherOptions>;

  constructor(options: DispatcherOptions = {}) {
    this.#options = { cap: options.cap ?? 3000, onError: options.onError ?? (() => {}), onSlow: options.onSlow ?? (() => {}) };
  }

  #registry(moment: string): Registry<MomentHandler<P>, HandlerMeta> {
    let registry = this.#handlers.get(moment);
    if (!registry) this.#handlers.set(moment, registry = new Registry<MomentHandler<P>, HandlerMeta>());
    return registry;
  }

  /**
   * Add (or replace, by id) a handler; returns the function that removes it.
   * - `detached`: started in its turn and not waited for (no ordering after it starts, no cap; a failure is still
   *   reported): for a handler that asks a player or runs long.
   * - `uncapped`: waited for however long it takes (midi's over-time effects until M15: core waits for their saves before
   *   its own expiry, as before the dispatcher).
   */
  on(moment: string, id: string, handler: MomentHandler<P>, options: HandlerOptions = {}): () => void {
    this.#registry(moment).set(id, handler, { priority: options.priority }, { uncapped: options.uncapped, detached: options.detached });
    return () => this.off(moment, id);
  }

  off(moment: string, id: string): boolean {
    return this.#handlers.get(moment)?.delete(id) ?? false;
  }

  /** The handlers' ids for a moment, in the order they run */
  handlers(moment: string): string[] {
    return this.#handlers.get(moment)?.entries().map(entry => entry.id) ?? [];
  }

  /** Raise a moment: after the key's earlier moments have been delivered */
  dispatch(key: string, payload: P): Promise<void> {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const run = previous.then(() => this.#run(payload));
    const settled = run.catch(() => {});
    this.#queues.set(key, settled);
    void settled.then(() => { if (this.#queues.get(key) === settled) this.#queues.delete(key); });
    return run;
  }

  /** Moments waiting or being delivered, by key (for tests) */
  get pending(): number { return this.#queues.size; }

  async #run(payload: P): Promise<void> {
    for (const entry of this.#handlers.get(payload.moment)?.entries() ?? []) {
      const handled = (async () => entry.value(payload))().then(
        () => "done" as const,
        error => { this.#options.onError(entry.id, payload.moment, error); return "done" as const; });
      if (entry.meta.detached) continue;
      if (entry.meta.uncapped) {
        await handled;
        continue;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const capped = new Promise<"slow">(resolve => { timer = setTimeout(() => resolve("slow"), this.#options.cap); });
      const result = await Promise.race([handled, capped]);
      clearTimeout(timer);
      if (result === "slow") this.#options.onSlow(entry.id, payload.moment, this.#options.cap);
    }
  }
}
