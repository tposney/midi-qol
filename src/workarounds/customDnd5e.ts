import { addMidiStatusEffects } from "../midi-qol.js";

/*
 * Custom D&D 5e: its Conditions config replaces CONFIG.statusEffects with its own list, which drops midi's statuses;
 * midi adds them to the list it sets.
 */
export function installCustomDnd5e(): void {
  Hooks.on("customDnd5e.setStatusEffectsConfig", statusEffects => addMidiStatusEffects(statusEffects));
}
