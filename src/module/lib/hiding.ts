import { MODULE_ID } from "../../midi-qol.js";
import { checkRule, configSettings } from "../settings.js";
import { isHiddenFrom } from "../services/perception/service.js";
import { applyStatusCondition } from "../utils.js";
import { unTimedExecuteAsGM } from "../GMAction.js";

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

/** Whether a hiding target is hidden from `viewer`: the perception service's answer */
export function hiddenFrom(target: TokenDocument.Implementation, viewer: TokenDocument.Implementation): boolean {
  return isHiddenFrom(target, viewer);
}

/*
 * M8: Hide and Search, shared by the Hide / Search interactions and the CAT-triggered macros (catMacros/actions/hide.mjs).
 * A hide is dnd5e's Hiding status with midi's data on it: the find DC (the Stealth total), the card it was reported
 * on, and its end: DAE's 1Attack on the condition itself, unless a separate timer effect carries it (the macros,
 * for CPR's items: the condition and that effect are each other's dnd5e dependents).
 */

const conditionUuid = (actor: Actor.Implementation) => `${actor.uuid}.ActiveEffect.${hidingConditionId()}`;
const dependsOn = (effect: ActiveEffect.Implementation, uuid: string) =>
  !!(effect.flags?.dnd5e as { dependents?: { uuid: string }[] } | undefined)?.dependents?.some(d => d.uuid === uuid);

async function deleteEffectsOf(actor: Actor.Implementation, ids: string[]) {
  if (!ids.length) return;
  if (actor.isOwner) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  else await unTimedExecuteAsGM("removeEffects", { actorUuid: actor.uuid, effects: ids, options: {} });
}

/** Ends a hide (its condition; a timer effect goes with it as its dependent) */
export async function endHide(actor: Actor.Implementation | null | undefined): Promise<void> {
  const condition = hidingCondition(actor);
  if (actor && condition?.id) await deleteEffectsOf(actor, [condition.id]);
}

/** The creature hides with this DC to find it: an earlier hide ends first */
export async function markHidden(actor: Actor.Implementation, dc: number, options: { card?: string, timer?: ActiveEffect.Implementation } = {}): Promise<void> {
  const uuid = conditionUuid(actor);
  const old = [hidingCondition(actor), ...actor.effects.filter(e => e !== options.timer && dependsOn(e as ActiveEffect.Implementation, uuid))]
    .filter((e): e is NonNullable<typeof e> => !!e).map(e => e.id).filter((id): id is string => !!id);
  await deleteEffectsOf(actor, old);
  await applyStatusCondition(actor, HIDING, {
    // Ends on its next attack roll, unless the timer effect ends it
    specialDuration: options.timer ? [] : ["1Attack"],
    prepare: data => {
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.hidden.dc`, dc);
      if (options.card) foundry.utils.setProperty(data, `flags.${MODULE_ID}.hidden.card`, options.card);
      if (options.timer?.uuid) foundry.utils.setProperty(data, "flags.dnd5e.dependents", [{ uuid: options.timer.uuid }]);
    }
  });
}

/** Whether the searcher has a line of sight (or, without vision, a clear line) to the target */
export function inSight(searcher: TokenDocument.Implementation, target: TokenDocument.Implementation): boolean {
  const viewer = searcher.object as Token.Implementation | null, other = target.object as Token.Implementation | null;
  if (!viewer || !other) return false;
  return !viewer.checkCollision(other.center, { origin: viewer.center, type: viewer.vision ? "sight" : "move", mode: "any" } as never);
}

/** A Search's result: the hidden enemies in sight it finds (total at least their DC) and those it misses */
export function searchHidden(searcher: TokenDocument.Implementation, total: number): { found: TokenDocument.Implementation[], missed: TokenDocument.Implementation[] } {
  const scene = searcher.parent;
  const candidates = (scene?.tokens.contents ?? []).filter(t => t !== searcher && t.actor && hidingCondition(t.actor)
    && t.disposition * searcher.disposition === -1 && inSight(searcher, t as TokenDocument.Implementation)) as TokenDocument.Implementation[];
  const dcOf = (t: TokenDocument.Implementation) => hiddenDC(t.actor) ?? DEFAULT_DC;
  return { found: candidates.filter(t => total >= dcOf(t)), missed: candidates.filter(t => total < dcOf(t)) };
}
