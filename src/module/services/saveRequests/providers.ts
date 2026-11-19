import { installedModules } from "../../setupModules.js";
import type { Workflow } from "../../Workflow.js";
import { type SaveRequest, type SaveRequestContext, type SaveRequestEntry, type SaveRequestProvider, MIDI_SAVE_PROVIDERS, saveRequestsService } from "./service.js";

/*
 * midi's own saveRequests providers (M5b). Each is one of the routes a save always had, asking through the workflow's
 * request builders; settings pick them (service.ts settingsProviderFor).
 */

/** A save answered by a module that rolls a batch: waited for until the module's answer matches it (by token) */
function pending(workflow: Workflow, request: SaveRequest): Promise<Roll[] | Roll | null> {
  return workflow.pendingSaves.wait(request.target).promise;
}

/** The batch's shared details, from its first request (every request of one use asks the same roll) */
function shared(requests: SaveRequest[]) {
  const { rollInfo, saveDetails, displayOptions } = requests[0];
  return { rollType: rollInfo.type ?? "save", abilities: rollInfo.abilities, skills: rollInfo.skills, tools: rollInfo.tools,
    dc: saveDetails.rollDC as number | undefined, whisper: displayOptions.whisper };
}

/** Roll messages answer a chat card (and a Monk's TokenBar request, by any roll of the token): created in a trap's flow, rendered otherwise */
function listenForRollMessages(context: SaveRequestContext) {
  const { workflow } = context;
  const hook = workflow.flowId === "midi-qol.trap" ? "createChatMessage" : "renderChatMessageHTML";
  context.listen(hook, "rollMessages", workflow.processSaveRoll.bind(workflow));
}

const split = <T>(requests: SaveRequest[], build: (request: SaveRequest) => T) => ({
  player: requests.filter(r => !r.playerInfo.player?.isGM).map(build),
  gm: requests.filter(r => !!r.playerInfo.player?.isGM).map(build)
});

/*
 * No deadline for Monk's TokenBar or Flash Rolls (user, 2026-11-19, M5b D2): the save waits for the module's roll. A GM
 * can roll it for the player from the chat log. With no GM connected, a GM-side request can't be sent.
 */
const monks: SaveRequestProvider = {
  request(requests, context) {
    const { workflow } = context;
    // Revealed rolls come as updates to Monk's message; a roll by the token answers it too, as it always did
    context.listen("updateChatMessage", "monks", workflow.monksSavingCheck.bind(workflow));
    listenForRollMessages(context);
    const entries = requests.map(r => ({ promise: pending(workflow, r) }));
    const { player, gm } = split(requests, r => workflow.buildMonksTokenBarRequest(r.target, r.saveDetails));
    const s = shared(requests);
    workflow.dispatchMonksTokenBarSaves(player, gm, s.rollType, s.abilities, s.skills, s.dc, s.whisper);
    return entries;
  }
};

const flash: SaveRequestProvider = {
  request(requests, context) {
    const { workflow } = context;
    context.listen("flash-rolls-5e.rollComplete", "flash", workflow.flashSavingCheck.bind(workflow));
    const entries = requests.map(r => ({ promise: pending(workflow, r) }));
    const { player, gm } = split(requests, r => workflow.buildFlashRollsRequest(r.target, r.saveDetails));
    const s = shared(requests);
    workflow.dispatchFlashRollsSaves(player, gm, s.rollType, s.abilities, s.skills, s.tools, s.dc);
    return entries;
  }
};

const epic: SaveRequestProvider = {
  request(requests, { workflow }) {
    const entries = requests.map(r => ({ promise: pending(workflow, r) }));
    const { player, gm } = split(requests, r => workflow.buildEpicRollsRequest(r.target, r.saveDetails));
    const s = shared(requests);
    workflow.dispatchEpicRollsSaves(player, gm, s.rollType, s.dc);
    return entries;
  }
};

/** A whispered chat card the player (or, for the GM's creatures with "none", the GM) answers by rolling */
const chat: SaveRequestProvider = {
  request(requests, context) {
    const { workflow } = context;
    listenForRollMessages(context);
    return requests.map(r => workflow.createPlayerChatSaveRequest(
      r.target, r.playerInfo.player!, r.saveDetails, r.rollInfo.type, r.rollInfo.abilities, r.rollInfo.skills, r.rollInfo.tools,
      r.saveDetails.rollDC as number | undefined, r.displayOptions.showRoll, r.playerInfo.GMprompt, r.isMagicSave, r.rollInfo.action) as SaveRequestEntry);
  }
};

/** A connected player's creature: their own roll dialog, through the request core (M3) */
const player: SaveRequestProvider = {
  request(requests, { workflow }) {
    return requests.map(r => ({ promise: workflow.askPlayerSave(r.target, r.playerInfo.player!, r.saveDetails, r.rollInfo, r.displayOptions), asked: true }));
  }
};

/** midi rolls it: on the owner's or a GM's client (auto, autoDialog), or here */
const roll: SaveRequestProvider = {
  request(requests, { workflow }: SaveRequestContext) {
    return requests.map(r => ({ promise: workflow.createStandardSaveRoll(r.target, r.saveDetails, r.displayOptions.whisper, r.displayOptions.showRoll,
      r.displayOptions.showRollDialog, r.displayOptions.simulate) }));
  }
};

/** midi's own providers, by id: another module that claims some targets can hand others to one of these */
export const midiSaveProviders: Record<string, SaveRequestProvider> = {
  [MIDI_SAVE_PROVIDERS.roll]: roll, [MIDI_SAVE_PROVIDERS.player]: player, [MIDI_SAVE_PROVIDERS.chat]: chat,
  [MIDI_SAVE_PROVIDERS.monks]: monks, [MIDI_SAVE_PROVIDERS.flash]: flash, [MIDI_SAVE_PROVIDERS.epic]: epic
};

export function registerMidiSaveProviders() {
  saveRequestsService.register(MIDI_SAVE_PROVIDERS.roll, roll, { label: "Midi-QOL: roll" });
  saveRequestsService.register(MIDI_SAVE_PROVIDERS.player, player, { label: "Midi-QOL: the player's dialog" });
  saveRequestsService.register(MIDI_SAVE_PROVIDERS.chat, chat, { label: "Midi-QOL: chat card" });
  saveRequestsService.register(MIDI_SAVE_PROVIDERS.monks, monks, { label: "Monk's TokenBar", available: () => !!installedModules.get("monks-tokenbar") });
  saveRequestsService.register(MIDI_SAVE_PROVIDERS.flash, flash, { label: "Flash Rolls 5e", available: () => !!installedModules.get("flash-rolls-5e") });
  saveRequestsService.register(MIDI_SAVE_PROVIDERS.epic, epic, { label: "Epic Rolls 5e", available: () => !!installedModules.get("epic-rolls-5e") });
}
