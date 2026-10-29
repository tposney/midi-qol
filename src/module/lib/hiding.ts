import { MODULE_ID } from "../../midi-qol.js";
import { checkRule, configSettings } from "../settings.js";

/**
 * dnd5e's Hiding status works as Invisible towards the creatures that don't perceive the hider. While Foundry (or
 * midi's canSee) tests whether a token detects another, a hiding target reports Invisible to that observer, so every
 * detection mode treats it as it treats Invisible: on the map, and in midi's unseen attacker/target rules. A hider is
 * perceived by itself, its allies (same disposition), a token without sight unless Force vision when checking gives it
 * sight (midi's rule for sightless tokens: they see everything), and, with hiddenAdvantage "perObserverPassive" (house
 * rule), by a creature whose passive Perception is at least the hide's DC. Only with the optional rule hiddenAdvantage
 * "perObserver" (the default) or "perObserverPassive". The hide is the Hiding condition (the fixed-id status effect), which carries its DC
 * (flags.midi-qol.hidden.dc; none, as from the token HUD, is DC 15).
 */

let observer: TokenDocument.Implementation | undefined;

export function initHiding() {
  globalThis.libWrapper.register(MODULE_ID, "foundry.canvas.perception.DetectionMode.prototype.testVisibility",
    function (wrapped: Function, visionSource: { object?: unknown }, ...args: unknown[]) {
      const previous = observer;
      observer = visionSource?.object instanceof foundry.canvas.placeables.Token ? visionSource.object.document : undefined;
      try {
        return wrapped(visionSource, ...args);
      } finally {
        observer = previous;
      }
    }, "WRAPPER");
  globalThis.libWrapper.register(MODULE_ID, "CONFIG.Token.documentClass.prototype.hasStatusEffect",
    function (this: TokenDocument.Implementation, wrapped: Function, statusId: string) {
      const result = wrapped(statusId);
      if (result || !observer || statusId !== CONFIG.specialStatusEffects.INVISIBLE) return result;
      return hiddenFrom(this, observer);
    }, "WRAPPER");
}

export const HIDING = "hiding";
export const DEFAULT_DC = 15;

export function hidingConditionId(): string | undefined {
  const id = CONFIG.statusEffects.find(se => se.id === HIDING)?._id;
  return typeof id === "string" ? id : undefined;
}

/** The creature's hide: its Hiding condition */
export function hidingCondition(actor: Actor.Implementation | null | undefined) {
  const id = hidingConditionId();
  return id ? actor?.effects.get(id) : undefined;
}

/** The hide's DC, if the creature has a Hiding condition */
export function hiddenDC(actor: Actor.Implementation | null | undefined): number | undefined {
  const condition = hidingCondition(actor);
  return condition ? condition.flags?.[MODULE_ID]?.hidden?.dc ?? DEFAULT_DC : undefined;
}

export function passivePerception(actor: Actor.Implementation | null | undefined): number {
  // @ts-expect-error no dnd5e types
  return actor?.system.skills?.prc?.passive ?? 0;
}

/** Whether a hiding target is hidden from `viewer` */
export function hiddenFrom(target: TokenDocument.Implementation, viewer: TokenDocument.Implementation): boolean {
  const mode = checkRule("hiddenAdvantage");
  if (mode !== "perObserver" && mode !== "perObserverPassive") return false;
  if (target === viewer || !target.actor?.statuses.has(HIDING)) return false;
  if (target.disposition === viewer.disposition) return false;
  if (!viewer.sight.enabled && !configSettings.optionalRules.invisVision) return false;
  if (mode === "perObserverPassive" && passivePerception(viewer.actor) >= (hiddenDC(target.actor) ?? DEFAULT_DC)) return false;
  return true;
}
