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

export interface Presenter {
  channel: PresenterChannel;
  /** Whether it plays this cue (the first that claims it in the user's order does) */
  claims(cue: Cue): boolean | Promise<boolean>;
  /** Stage 1: not awaited by the use */
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
        void Promise.resolve(provider.play(cue)).catch(err => reportServiceProblem("presenters", id, `play(${cue.cue}) failed`, err));
      } catch (err) {
        reportServiceProblem("presenters", id, `play(${cue.cue}) failed`, err);
      }
      break;
    }
  }
}
