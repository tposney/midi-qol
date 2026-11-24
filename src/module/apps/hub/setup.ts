import { activeHud, registerHud } from "../../services/turnModel/hud.js";
import { setOfferCloser, setOfferPresenter } from "../../services/multiattack/legendary.js";
import { MidiHub, setupHubRefresh } from "./MidiHub.js";
import { hubOffers, registerMidiHubSections } from "./midiSections.js";
import { hubSections, registerHubSection } from "./sections.js";

/*
 * M27: midi's hub as a HUD provider (the combat role: docked, it replaces the hotbar), its sections, and the GM's
 * legendary and lair offers shown in it while it runs (else their dialog).
 */

export const HUB_ID = "midi-qol.hub";

/** The hub runs for this user (chosen as their combat HUD and shown) */
export const hubRunning = () => activeHud("combat")?.id === HUB_ID && !!MidiHub.shown;

export function setupHub() {
  registerMidiHubSections();
  setupHubRefresh();
  registerHud(HUB_ID, {
    role: "combat",
    label: "midi-qol.Hub.Title",
    show: token => MidiHub.instance.show(token),
    hide: async () => { await MidiHub.shown?.close(); }
  });
  // Legendary and lair offers in the GM's hub while it runs; a newer offer drops the stale ones
  setOfferPresenter(undefined);
  Hooks.on("renderMidiHub" as never, (() => {
    if (!game.user?.isGM) return;
    setOfferPresenter(hubRunning() ? offer => new Promise(resolve => { hubOffers.push({ ...offer, resolve }); void MidiHub.shown?.render(); }) : undefined);
  }) as never);
  Hooks.on("closeMidiHub" as never, (() => setOfferPresenter(undefined)) as never);
  setOfferCloser(() => { for (const offer of hubOffers.splice(0)) offer.resolve(undefined); void MidiHub.shown?.render(); });
}

export const hubApi = {
  sections: { register: registerHubSection, list: () => hubSections().map(s => s.id) },
  show: (token?: TokenDocument.Implementation) => MidiHub.instance.show(token),
  running: hubRunning,
  switchMode: () => MidiHub.switchMode()
};
