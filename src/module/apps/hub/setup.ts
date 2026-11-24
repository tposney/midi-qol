import { activeHud, registerHud } from "../../services/turnModel/hud.js";
import { i18n } from "../../../midi-qol.js";
import { OFFER_DIALOG, setOfferCloser, setOfferPresenter } from "../../services/multiattack/legendary.js";
import { MidiHub, setupHubRefresh } from "./MidiHub.js";
import { hubOffers, inlineAsks, registerMidiHubSections } from "./midiSections.js";
import { incomingRequests, registerRequestPresenter } from "../../lib/requests.js";
import { validTargets } from "./targetHighlight.js";
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
  Hooks.on("closeMidiHub" as never, (() => {
    setOfferPresenter(undefined);
    // Requests and legendary/lair offers waiting in the inbox go to their own dialogs
    for (const ask of inlineAsks.splice(0)) ask.resolve(undefined);
    for (const offer of hubOffers.splice(0)) offer.resolve(OFFER_DIALOG);
  }) as never);
  // The inbox: a request that takes a simple choice is answered in the hub while it runs (else its own dialog)
  // CONFIG.debug.midiInbox = false: requests keep their own dialogs (tests that drive the dialogs)
  registerRequestPresenter((request, choice) => {
    if (!hubRunning() || (CONFIG.debug as { midiInbox?: boolean }).midiInbox === false) return undefined;
    return new Promise(resolve => {
      const ask = { request, choice, resolve };
      inlineAsks.push(ask);
      request.onSettled(() => {
        const at = inlineAsks.indexOf(ask);
        if (at >= 0) { inlineAsks.splice(at, 1); resolve([]); void MidiHub.shown?.render(); }
      });
      void MidiHub.shown?.render();
    });
  });
  // What this user is asked, in one place: a request's window (a dialog it opened, or one picked from the inbox) and the
  // bonus prompt open just above the hub while it runs
  // Placed on each render (a dialog grows as it fills in) until the user moves it: then left where they put it
  const placed = new WeakMap<HTMLElement, { left: number, top: number }>();
  const dock = (app: { element?: HTMLElement, setPosition?(position: object): unknown } | undefined) => {
    const hub = document.getElementById("midi-qol-hub");
    const element = app?.element;
    if (!hubRunning() || !hub || !element) return;
    const last = placed.get(element);
    if (last && (Math.abs(element.offsetLeft - last.left) > 2 || Math.abs(element.offsetTop - last.top) > 2)) return;
    requestAnimationFrame(() => {
      const r = hub.getBoundingClientRect();
      const position = { left: Math.max(0, Math.round(r.right - element.offsetWidth)), top: Math.max(0, Math.round(r.top - element.offsetHeight - 8)) };
      app!.setPosition?.(position);
      placed.set(element, { left: element.offsetLeft, top: element.offsetTop });
    });
  };
  Hooks.on("renderRollModifyDialog" as never, ((app: { element?: HTMLElement, setPosition?(position: object): unknown }) => dock(app)) as never);
  // Stage 3: dnd5e's roll dialogs (attack, damage, saves) with midi's sections in them, docked there too
  Hooks.on("renderRollConfigurationDialog" as never, ((app: { element?: HTMLElement, setPosition?(position: object): unknown }) => dock(app)) as never);
  Hooks.on("midi-qol.incomingRequestsChanged" as never, (() => {
    for (const request of incomingRequests()) if (request.window) dock(foundry.applications.instances.get(request.window.id) as never);
  }) as never);
  // Coordination: while an area is being placed, the allies of the hub's creature inside it (core's placement preview)
  window.setInterval(() => {
    const element = MidiHub.shown?.element;
    if (!element) return;
    const context = (canvas?.regions as unknown as { _placementContext?: { preview?: { document?: { testPoint?(point: { x: number, y: number, elevation: number }): boolean } } } } | undefined)?._placementContext;
    const own = MidiHub.shown?.token?.object as Token.Implementation | undefined;
    const testPoint = context?.preview?.document?.testPoint?.bind(context.preview.document);
    const allies = testPoint && own ? (canvas?.tokens?.placeables ?? []).filter(t => t.actor && t.visible && t.document.disposition === own.document.disposition
      && testPoint({ ...t.center, elevation: t.document.elevation ?? 0 })).map(t => t.name ?? "") : [];
    let note = element.querySelector<HTMLElement>(".midi-hub-placing");
    if (!allies.length) { note?.remove(); return; }
    if (!note) {
      note = document.createElement("div");
      note.className = "midi-hub-note midi-hub-placing";
      (element.querySelector(".midi-hub-right") ?? element).prepend(note);
    }
    const text = i18n("midi-qol.Hub.AlliesInArea").replace("{names}", allies.join(", "));
    if (note.textContent !== text) note.textContent = text;
  }, 250);
  setOfferCloser(() => { for (const offer of hubOffers.splice(0)) offer.resolve(undefined); void MidiHub.shown?.render(); });
}

export const hubApi = {
  sections: { register: registerHubSection, list: () => hubSections().map(s => s.id) },
  show: (token?: TokenDocument.Implementation) => MidiHub.instance.show(token),
  running: hubRunning,
  switchMode: () => MidiHub.switchMode(),
  /** The tokens an activity could be used on from a token (in range, of the kind it affects, seen): what the hub rings */
  validTargets
};
