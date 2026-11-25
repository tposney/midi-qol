import { defineService, entries, reportServiceProblem } from "../../api/services.js";
import type { Cue } from "../../lib/cues.js";

/*
 * M18 stage 1 (plan ~/Documents/midi-next-M18-plan-2026-11-22.md): presenters show a use's cues: animations (visual),
 * sounds, text. For each channel the presenters are tried in the user's order (the PresenterOrder setting, default
 * their priority); the first whose `claims` is true plays the cue, the rest of that channel don't. A use's override
 * ("none" for a channel) stops the channel for it.
 *
 *   MidiQOL.services.register("presenters", "my-module.sparks", { channel: "visual", claims: cue => cue.cue === "attack.hit",
 *     play: cue => … }, { label: "Sparks" });
 */

export type PresenterChannel = "visual" | "sound" | "text";
export const PRESENTER_CHANNELS: readonly PresenterChannel[] = ["visual", "sound", "text"];

/** What a visual presenter's play may return besides a promise (stage 2) */
export interface PresentationPlay {
  /** Resolves when the impact has landed: a use waiting for animations waits for it (capped) */
  landed?: Promise<unknown>;
  /** Keep the use's instantaneous template until landed (capped) */
  holdTemplate?: boolean;
}

export interface Presenter {
  channel: PresenterChannel;
  /** Whether it plays this cue (the first that claims it in the user's order does) */
  claims(cue: Cue): boolean | Promise<boolean>;
  /**
   * Plays the cue. A visual presenter may return a promise for "the impact has landed", or a PresentationPlay; a use
   * waits for it only with the world setting "Wait for animations" (and only where the use runs). Never awaited by
   * sounds or text.
   */
  play(cue: Cue): unknown;
}

declare module "../../api/services.js" {
  interface MidiServices { presenters: Presenter }
}

export let presentersService: ReturnType<typeof defineService<Presenter>> | undefined;

export function definePresentersService() {
  presentersService = defineService<Presenter>("presenters", { kind: "contributors", description: "Animations, sounds and text for a use's cues" });
}

/** The user's order for a channel: its listed presenters first, in that order, then the rest by priority */
function ordered(channel: PresenterChannel): { id: string, provider: Presenter }[] {
  const all = entries<Presenter>("presenters").filter(e => e.provider.channel === channel);
  const order = ((game.settings?.get("midi-qol", "PresenterOrder") ?? {}) as Partial<Record<PresenterChannel, string[]>>)[channel] ?? [];
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  return [...all].sort((a, b) => rank(a.id) - rank(b.id));
}

/** Per use (on the client running it): its presentations not yet landed, and those holding its template */
const pending = new Map<string, Set<Promise<unknown>>>();
const templateHolds = new Map<string, Promise<unknown>[]>();
const HOLD_CAP_MS = 30_000;

function isPresentationPlay(value: unknown): value is PresentationPlay {
  return typeof value === "object" && value !== null && !(value instanceof Promise) && ("landed" in value || "holdTemplate" in value);
}

/** A presentation of a use (raised here) that a wait for animations waits for */
export function trackPresentation(useId: string | undefined, presentation: Promise<unknown>): void {
  if (!useId) return;
  let set = pending.get(useId);
  if (!set) pending.set(useId, set = new Set());
  const settled = presentation.catch(() => undefined);
  set.add(settled);
  void settled.then(() => set.delete(settled));
}

/** "Wait for animations" (seconds; 0: off) */
export function presentationWaitMs(): number {
  const seconds = Number(game.settings?.get("midi-qol", "PresentationWait") ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/** Waits for the use's presentations so far to land, up to `capMs` */
export function presentationLanded(useId: string | undefined, capMs: number): Promise<void> | undefined {
  const set = useId ? pending.get(useId) : undefined;
  if (!set?.size || capMs <= 0) return undefined;
  return landedWithin(set, capMs);
}

async function landedWithin(set: Set<Promise<unknown>>, capMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.allSettled([...set]), new Promise(resolve => { timer = setTimeout(resolve, capMs); })]);
  clearTimeout(timer);
}

/** Resolves when the presentations holding the use's template have landed (capped); forgets the use */
export function releaseTemplateHolds(useId: string | undefined): Promise<void> {
  if (!useId) return Promise.resolve();
  const holds = templateHolds.get(useId) ?? [];
  templateHolds.delete(useId);
  pending.delete(useId);
  if (!holds.length) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([Promise.allSettled(holds), new Promise(resolve => { timer = setTimeout(resolve, HOLD_CAP_MS); })]).then(() => clearTimeout(timer));
}

/** Present a cue on this client: per channel, the first presenter that claims it */
export async function presentCue(cue: Cue): Promise<void> {
  if (!presentersService) return;
  for (const channel of PRESENTER_CHANNELS) {
    if (cue.presentation?.[channel] === "none") continue;
    for (const { id, provider } of ordered(channel)) {
      let claimed = false;
      try {
        claimed = !!await provider.claims(cue);
      } catch (err) {
        reportServiceProblem("presenters", id, `claims(${cue.cue}) failed`, err);
      }
      if (!claimed) continue;
      try {
        const played = provider.play(cue);
        const landed = Promise.resolve(isPresentationPlay(played) ? played.landed : played);
        void landed.catch(err => reportServiceProblem("presenters", id, `play(${cue.cue}) failed`, err));
        if (channel === "visual" && cue.useId && cue.raisedBy === game.user?.id) {
          trackPresentation(cue.useId, landed);
          if (isPresentationPlay(played) && played.holdTemplate) {
            const holds = templateHolds.get(cue.useId) ?? [];
            holds.push(landed.catch(() => undefined));
            templateHolds.set(cue.useId, holds);
          }
        }
      } catch (err) {
        reportServiceProblem("presenters", id, `play(${cue.cue}) failed`, err);
      }
      break;
    }
  }
}
