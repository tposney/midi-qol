/**
 * The plugin contract: what other modules may rely on.
 * `MIDI_API_VERSION` is semver for the plugin API (services, hooks, exports listed in docs/surface.json),
 * independent of midi's release version: major = something listed was removed or changed shape,
 * minor = something was added, patch = behaviour fix with no surface change.
 */
export const MIDI_API_VERSION = "1.0.0";

let running = false;

/** midi is active and finished its setup (after `midi-qol.midiReady`). An enabled module may still not be running. */
export function isRunning(): boolean {
  return running && !!game.modules?.get("midi-qol")?.active;
}

export function markRunning() {
  running = true;
}
