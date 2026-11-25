import { Registry } from "../api/registry.js";

/*
 * The turn-event dispatcher's core (M4 stage 1; lib/turnEvents.ts wires it to Foundry's combat): handlers per event,
 * run one after another in priority order, each awaited and isolated (a handler that throws is reported and the next
 * runs) unless it is `detached` (started in its turn, not waited for: a handler that asks a player or runs long), each
 * awaited at most `cap` ms (a slower one is reported and left running: core awaits the dispatcher before its
 * own expiry and region events, so a handler must not hold a turn up); and events for one key (a combat) delivered in
 * the order they were raised, one dispatch after another. Pure: no Foundry globals.
 */

export const TURN_EVENTS = ["enterCombat", "combatStart", "roundStart", "turnStart", "turnEnd", "roundEnd", "rewind", "exitCombat", "combatEnd"] as const;
export type TurnEventName = typeof TURN_EVENTS[number];

export type EventHandler<P> = (payload: P) => unknown;
export interface HandlerOptions { priority?: number, detached?: boolean, uncapped?: boolean }
type HandlerMeta = { uncapped?: boolean, detached?: boolean };

export interface DispatcherOptions {
  /** How long a handler is waited for, ms */
  cap?: number;
  onError?: (handlerId: string, eventId: string, error: unknown) => void;
  onSlow?: (handlerId: string, eventId: string, cap: number) => void;
}

export class EventDispatcher<P extends { eventId: string }> {
  readonly #handlers = new Map<string, Registry<EventHandler<P>, HandlerMeta>>();
  readonly #queues = new Map<string, Promise<void>>();
  readonly #options: Required<DispatcherOptions>;

  constructor(options: DispatcherOptions = {}) {
    this.#options = { cap: options.cap ?? 3000, onError: options.onError ?? (() => {}), onSlow: options.onSlow ?? (() => {}) };
  }

  #registry(eventId: string): Registry<EventHandler<P>, HandlerMeta> {
    let registry = this.#handlers.get(eventId);
    if (!registry) this.#handlers.set(eventId, registry = new Registry<EventHandler<P>, HandlerMeta>());
    return registry;
  }

  /**
   * Add (or replace, by id) a handler; returns the function that removes it.
   * - `detached`: started in its turn and not waited for (no ordering after it starts, no cap; a failure is still
   *   reported): for a handler that asks a player or runs long.
   * - `uncapped`: waited for however long it takes: midi's turn entries (over-time effects among them), whose saves may
   *   wait for a player and must settle before core's expiry at the same boundary.
   */
  on(eventId: string, id: string, handler: EventHandler<P>, options: HandlerOptions = {}): () => void {
    this.#registry(eventId).set(id, handler, { priority: options.priority }, { uncapped: options.uncapped, detached: options.detached });
    return () => this.off(eventId, id);
  }

  off(eventId: string, id: string): boolean {
    return this.#handlers.get(eventId)?.delete(id) ?? false;
  }

  /** The handlers' ids for a event, in the order they run */
  handlers(eventId: string): string[] {
    return this.#handlers.get(eventId)?.entries().map(entry => entry.id) ?? [];
  }

  /** Raise a event: after the key's earlier events have been delivered */
  dispatch(key: string, payload: P): Promise<void> {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const run = previous.then(() => this.#run(payload));
    const settled = run.catch(() => {});
    this.#queues.set(key, settled);
    void settled.then(() => { if (this.#queues.get(key) === settled) this.#queues.delete(key); });
    return run;
  }

  /** Events waiting or being delivered, by key (for tests) */
  get pending(): number { return this.#queues.size; }

  async #run(payload: P): Promise<void> {
    for (const entry of this.#handlers.get(payload.eventId)?.entries() ?? []) {
      const handled = (async () => entry.value(payload))().then(
        () => "done" as const,
        error => { this.#options.onError(entry.id, payload.eventId, error); return "done" as const; });
      if (entry.meta.detached) continue;
      if (entry.meta.uncapped) {
        await handled;
        continue;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const capped = new Promise<"slow">(resolve => { timer = setTimeout(() => resolve("slow"), this.#options.cap); });
      const result = await Promise.race([handled, capped]);
      clearTimeout(timer);
      if (result === "slow") this.#options.onSlow(entry.id, payload.eventId, this.#options.cap);
    }
  }
}
