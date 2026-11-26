import type { Activity } from "../../../globals.js";
import { checkActivityRange, checkIncapacitated } from "../../utils.js";
import { getDistance } from "../../services/distance/service.js";
import { isFlanking } from "../../services/flanking/service.js";
import { i18n } from "../../../midi-qol.js";
import { activityTargetFilter } from "../../lib/targetFilter.js";

/*
 * M27 further features: hovering a use in the hub rings its valid targets on the canvas (in range, of the kind it
 * affects, seen by this user); with a target, the preview adds the chance to hit (only where the reveal policy shows
 * the AC) and what allies make possible on it (flanking, a Sneak Attack opening).
 */

type AffectsType = string | undefined;

/** The tokens `activity` could be used on from `attacker`: none for an area or a space (placed, not clicked) */
export function validTargets(activity: Activity, attacker: Token.Implementation): Token.Implementation[] {
  const target = activity.target as { affects?: { type?: AffectsType }, template?: { type?: string } } | undefined;
  if (target?.template?.type) return [];
  const affects = target?.affects?.type ?? "";
  if (affects === "self") return [attacker];
  if (["space", "object"].includes(affects)) return [];
  const mine = attacker.document.disposition;
  const meets = activityTargetFilter(activity);
  return (canvas?.tokens?.placeables ?? []).filter(token => {
    if (token === attacker || !token.actor || !token.visible) return false;
    if (affects === "ally" && token.document.disposition !== mine) return false;
    if (affects === "enemy" && token.document.disposition * mine !== -1) return false;
    if (checkActivityRange(activity, attacker, new Set([token]), false).result === "fail") return false;
    return !meets || meets(token);
  });
}

let layer: PIXI.Container | undefined;

/** Rings on `tokens` (cleared first) */
export function showHighlights(tokens: Token.Implementation[]) {
  clearHighlights();
  if (!tokens.length || !canvas?.interface) return;
  layer = new PIXI.Container();
  layer.eventMode = "none";
  const colour = Number(CONFIG.Canvas.dispositionColors?.CONTROLLED ?? 0xff9829);
  for (const token of tokens) {
    const ring = new PIXI.Graphics();
    const { x, y } = token.center;
    const radius = Math.max(token.w, token.h) / 2 + 6;
    ring.lineStyle(4, colour, 0.9).drawCircle(x, y, radius);
    layer.addChild(ring);
  }
  canvas.interface.addChild(layer);
}

export function clearHighlights() {
  if (!layer) return;
  layer.destroy({ children: true });
  layer = undefined;
}

/** The chance a d20 attack with `bonus` hits `ac`, in the advantage mode (a 1 always misses, a 20 always hits) */
export function hitChance(bonus: number, ac: number, mode: number): number {
  const needed = Math.min(20, Math.max(2, ac - bonus));
  const p = (21 - needed) / 20;
  return mode > 0 ? 1 - (1 - p) ** 2 : mode < 0 ? p ** 2 : p;
}

/** The attack's fixed bonus from its make-up formula: numbers, and other dice at their average (the d20 left out) */
export function averageBonus(formula: string): number | undefined {
  try {
    const roll = new Roll(formula.replace(/\b1?d20(?![0-9])/i, "0"));
    let total = 0;
    let sign = 1;
    for (const term of roll.terms) {
      if (term instanceof foundry.dice.terms.OperatorTerm) { sign = term.operator === "-" ? -1 : 1; continue; }
      if (term instanceof foundry.dice.terms.NumericTerm) total += sign * Number(term.number);
      else if (term instanceof foundry.dice.terms.Die) total += sign * (term.number ?? 1) * ((term.faces ?? 0) + 1) / 2;
      else return undefined;
    }
    return total;
  } catch {
    return undefined;
  }
}

/** What allies make possible against `target`: flanking it, a Sneak Attack opening (an ally of the attacker beside it) */
export async function coordinationLines(attacker: Token.Implementation, target: Token.Implementation): Promise<string[]> {
  const lines: string[] = [];
  if (await isFlanking(attacker, target).catch(() => false)) lines.push(i18n("midi-qol.Hub.Flanking"));
  const actor = attacker.actor;
  const sneaky = actor?.items.some(i => (i as { identifier?: string }).identifier === "sneak-attack");
  if (sneaky) {
    const mine = attacker.document.disposition;
    const ally = (canvas?.tokens?.placeables ?? []).find(token => token !== attacker && token !== target && token.actor
      && token.document.disposition === mine && !checkIncapacitated(token.actor, false, false)
      && getDistance(token, target, { wallsBlock: false }) <= 5);
    if (ally) lines.push(i18n("midi-qol.Hub.SneakOpening").replace("{ally}", ally.name ?? ""));
  }
  return lines;
}
