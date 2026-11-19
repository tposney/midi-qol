import type { QueueSaveRollOptions } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import { defineService, entries, reportServiceProblem } from "../../api/services.js";

/*
 * saveRequests (M5b, plan ~/Documents/midi-next-M5b-plan-2026-11-19.md): how each target's save is rolled. A provider is
 * picked per target (user 2026-11-19): another module's provider that claims the target, else the one today's settings
 * name (playerRollSaves for a player's creature, rollNPCSaves / rollNPCLinkedSaves for the GM's). A provider is asked once
 * with all of its targets, so a module that rolls a batch (Monk's TokenBar, Flash Rolls, Epic Rolls) sends one request.
 * A provider that is not available is replaced by midi's own roll, reported to the TroubleShooter.
 *
 *   MidiQOL.services.register("saveRequests", "my-module.saves", {
 *     claims: request => request.target.actor?.hasPlayerOwner,
 *     request: requests => requests.map(request => ({ promise: myModuleRoll(request) }))
 *   }, { available: () => game.modules.get("my-module")?.active });
 */

/** One target's save: who rolls it, what for, as midi decided before asking (after midi-qol.preTargetSave) */
export type SaveRequest = Omit<QueueSaveRollOptions, "moduleRequests">;

/** What a provider gives for a target: its roll (or rolls), and a request card midi deletes once every save is in */
export interface SaveRequestEntry {
  promise: Promise<Roll[] | Roll | null> | null;
  requestCard?: Promise<ChatMessage | undefined>;
  /** Asked through the request core, which puts it on the player list itself */
  asked?: boolean;
}

export interface SaveRequestContext {
  /** The use's workflow (midi's providers call its request builders) */
  workflow: Workflow;
}

export interface SaveRequestProvider {
  /** Another module's provider takes a target it claims, whatever midi's settings say */
  claims?(request: SaveRequest, context: SaveRequestContext): boolean;
  /** Ask for every one of `requests` at once; an entry per request, in the same order */
  request(requests: SaveRequest[], context: SaveRequestContext): SaveRequestEntry[];
}

declare module "../../api/services.js" {
  interface MidiServices { saveRequests: SaveRequestProvider }
}

export let saveRequestsService: ReturnType<typeof defineService<SaveRequestProvider>>;

export function defineSaveRequestsService() {
  saveRequestsService = defineService<SaveRequestProvider>("saveRequests", {
    kind: "contributors",
    description: "How a target's save or check is rolled: midi's roll, the player's dialog, a chat card, Monk's TokenBar, Flash Rolls, Epic Rolls"
  });
}

/** midi's providers, by id */
export const MIDI_SAVE_PROVIDERS = {
  roll: "midi-qol.roll",
  player: "midi-qol.player",
  chat: "midi-qol.chat",
  monks: "midi-qol.monks-tokenbar",
  flash: "midi-qol.flash-rolls",
  epic: "midi-qol.epic-rolls"
} as const;
const MIDI_IDS = new Set<string>(Object.values(MIDI_SAVE_PROVIDERS));

/** The midi provider today's settings choose for a request (the order the routing always had: first match wins) */
export function settingsProviderFor(request: SaveRequest): string {
  const { player, GMprompt, playerChat } = request.playerInfo;
  const { playerMonksTB, playerFlashTB, playerEpicRolls, gmMonksTB, gmFlashTB, gmRER } = request.moduleFlags;
  const gm = !!player?.isGM;
  if ((!gm && playerMonksTB) || (gm && gmMonksTB)) return MIDI_SAVE_PROVIDERS.monks;
  if ((!gm && playerFlashTB) || (gm && gmFlashTB)) return MIDI_SAVE_PROVIDERS.flash;
  if ((!gm && playerEpicRolls) || (gm && gmRER)) return MIDI_SAVE_PROVIDERS.epic;
  if ((player?.active && playerChat) || (gm && GMprompt === "none")) return MIDI_SAVE_PROVIDERS.chat;
  if (player && !gm && player.active) return MIDI_SAVE_PROVIDERS.player;
  return MIDI_SAVE_PROVIDERS.roll;
}

/**
 * Ask for every request's save: each target's provider (a claiming module's, else the settings'), each provider once with
 * its batch. Entries come back in the requests' order.
 */
export function requestSaves(requests: SaveRequest[], context: SaveRequestContext): SaveRequestEntry[] {
  const available = new Map(entries<SaveRequestProvider>("saveRequests").map(({ id, provider }) => [id, provider]));
  const claimants = [...available].filter(([id, provider]) => !MIDI_IDS.has(id) && provider.claims);
  const batches = new Map<string, number[]>();
  requests.forEach((request, index) => {
    let id = claimants.find(([providerId, provider]) => {
      try { return provider.claims!(request, context); }
      catch (err) { reportServiceProblem("saveRequests", providerId, "claims failed", err); return false; }
    })?.[0] ?? settingsProviderFor(request);
    if (!available.has(id)) {
      reportServiceProblem("saveRequests", id, "not available: midi rolls the save");
      id = MIDI_SAVE_PROVIDERS.roll;
    }
    batches.set(id, [...(batches.get(id) ?? []), index]);
  });
  const results: SaveRequestEntry[] = requests.map(() => ({ promise: null }));
  for (const [id, indexes] of batches) {
    const provider = available.get(id)!;
    let answered: SaveRequestEntry[] = [];
    try {
      answered = provider.request(indexes.map(index => requests[index]), context);
    } catch (err) {
      reportServiceProblem("saveRequests", id, "request failed: midi rolls the save", err);
      if (id !== MIDI_SAVE_PROVIDERS.roll) answered = available.get(MIDI_SAVE_PROVIDERS.roll)?.request(indexes.map(index => requests[index]), context) ?? [];
    }
    indexes.forEach((index, i) => { results[index] = answered[i] ?? { promise: null }; });
  }
  return results;
}
