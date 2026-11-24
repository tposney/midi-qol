import { i18n } from "../../../midi-qol.js";
import { escape } from "./sections.js";
import { getDistance } from "../../services/distance/service.js";
import { possibleReactors } from "../../services/economy/opportunity.js";
import { coverFor } from "../../services/cover/service.js";
import { tokenFor } from "../../lib/tokenResolver.js";

/*
 * M27 further features: the hub's Around me tab. Threats (who has me in reach and could take an opportunity attack as
 * I leave it; whose effects mark me), where I stand (the light, my cover against my target, hidden creatures I can
 * perceive) and helping (allies in reach of my healing and of Help; my effects on others and how long they last; who
 * my concentration holds). Only what this user's tokens can see, so nothing hidden is told.
 */

type Light = "bright" | "dim" | "dark";

/** The light at `point`: the scene's global light, else the brightest light source that reaches it; inside darkness: dark */
export function lightAt(point: { x: number, y: number }): Light {
  const effects = canvas?.effects as unknown as { lightSources?: Iterable<LightLike>, darknessSources?: Iterable<LightLike> } | undefined;
  const inside = (source: LightLike) => source.active !== false && !!source.shape?.contains?.(point.x, point.y);
  for (const source of effects?.darknessSources ?? []) if (inside(source)) return "dark";
  const environment = (canvas as unknown as { environment?: { globalLightSource?: { active?: boolean } } })?.environment;
  if (environment?.globalLightSource?.active) return "bright";
  let best: Light = "dark";
  for (const source of effects?.lightSources ?? []) {
    if (!inside(source) || source.isDarkness) continue;
    const d = Math.hypot(point.x - (source.x ?? 0), point.y - (source.y ?? 0));
    if (d <= (source.data?.bright ?? 0)) return "bright";
    if (d <= (source.data?.dim ?? 0)) best = "dim";
  }
  return best;
}
interface LightLike { active?: boolean, isDarkness?: boolean, x?: number, y?: number, data?: { bright?: number, dim?: number }, shape?: { contains?(x: number, y: number): boolean } }

const row = (label: string, items: string[]) => items.length
  ? `<div class="midi-hub-row midi-hub-around"><span class="midi-hub-label">${escape(label)}</span>${items.map(i => `<span class="midi-hub-chip">${i}</span>`).join("")}</div>` : "";
const units = () => escape(canvas?.scene?.grid.units ?? "");

function threats(token: Token.Implementation, actor: Actor.Implementation): string {
  const items: string[] = [];
  for (const { token: reactor, reach } of possibleReactors(token.document)) {
    const object = reactor.object;
    if (!object?.visible) continue;
    if (getDistance(object, token, { wallsBlock: false }) > reach) continue;
    items.push(`<i class="fa-solid fa-person-running" data-tooltip="${escape(i18n("midi-qol.Around.LeaveProvokes"))}"></i> ${escape(reactor.name ?? "")} (${reach} ${units()})`);
  }
  // Effects on me from a hostile creature (Hunter's Mark, Hex): their origin's actor
  for (const effect of actor.appliedEffects) {
    const origin = typeof effect.origin === "string" ? fromUuidSync(effect.origin) as { actor?: Actor.Implementation, parent?: unknown } | null : null;
    const source = origin instanceof Actor ? origin : origin?.actor;
    if (!source || source === actor) continue;
    const sourceToken = tokenFor(source)?.object as Token.Implementation | undefined;
    if (sourceToken && sourceToken.document.disposition * token.document.disposition !== -1) continue;
    if (sourceToken && !sourceToken.visible) continue;
    items.push(`<i class="fa-solid fa-crosshairs"></i> ${escape(effect.name ?? "")} (${escape(source.name ?? "")})`);
  }
  return row(i18n("midi-qol.Around.Threats"), items);
}

function standing(token: Token.Implementation): string {
  const items: string[] = [];
  const light = lightAt(token.center);
  items.push(`<i class="fa-solid ${light === "bright" ? "fa-sun" : light === "dim" ? "fa-cloud-sun" : "fa-moon"}"></i> ${escape(i18n(`midi-qol.Around.Light.${light}`))}`);
  const target = [...(game.user?.targets ?? [])][0];
  if (target && target !== token) {
    const cover = coverFor(target, token);
    items.push(`<i class="fa-solid fa-shield-halved"></i> ${escape(i18n("midi-qol.Around.CoverFrom").replace("{name}", target.name ?? ""))}: ${escape(i18n(`midi-qol.Around.Cover.${cover.level}`))}`);
  }
  const hidden = (canvas?.tokens?.placeables ?? []).filter(t => t !== token && t.visible && t.actor
    && (t.actor.statuses.has("hidden") || t.actor.statuses.has("invisible")));
  if (hidden.length) items.push(`<i class="fa-solid fa-eye"></i> ${escape(i18n("midi-qol.Around.Noticed"))}: ${hidden.map(t => escape(t.name ?? "")).join(", ")}`);
  return row(i18n("midi-qol.Around.WhereIStand"), items);
}

function helping(token: Token.Implementation, actor: Actor.Implementation): string {
  const items: string[] = [];
  const allies = (canvas?.tokens?.placeables ?? []).filter(t => t !== token && t.actor && t.visible && t.document.disposition === token.document.disposition);
  // My healing's reach: the longest of my heal uses (touch: 5)
  let healReach = 0;
  for (const item of actor.items) {
    const activities = (item.system as { activities?: Iterable<{ type?: string, range?: { units?: string, value?: number | string } }> }).activities ?? [];
    for (const activity of activities) {
      if (activity.type !== "heal") continue;
      const reach = activity.range?.units === "touch" ? 5 : activity.range?.units === "ft" ? Number(activity.range.value) || 0 : 0;
      healReach = Math.max(healReach, reach);
    }
  }
  const near = (range: number) => allies.filter(t => getDistance(token, t, { wallsBlock: false }) <= range).map(t => escape(t.name ?? ""));
  if (healReach) {
    const inReach = near(healReach);
    if (inReach.length) items.push(`<i class="fa-solid fa-heart"></i> ${escape(i18n("midi-qol.Around.HealReach").replace("{n}", `${healReach} ${canvas?.scene?.grid.units ?? ""}`))}: ${inReach.join(", ")}`);
  }
  const helpable = near(5);
  if (helpable.length) items.push(`<i class="fa-solid fa-handshake-angle"></i> ${escape(i18n("midi-qol.Around.Help"))}: ${helpable.join(", ")}`);
  // My effects on others, with what is left of them
  for (const other of canvas?.tokens?.placeables ?? []) {
    if (other === token || !other.actor || !other.visible) continue;
    for (const effect of other.actor.appliedEffects) {
      if (typeof effect.origin !== "string" || !effect.origin.startsWith(actor.uuid ?? "\u0000")) continue;
      const left = (effect.duration as { label?: string } | undefined)?.label;
      items.push(`<i class="fa-solid fa-wand-magic-sparkles"></i> ${escape(effect.name ?? "")} → ${escape(other.name ?? "")}${left ? ` (${escape(left)})` : ""}`);
    }
  }
  // Who my concentration holds
  const concentration = (actor as { concentration?: { effects?: Iterable<ActiveEffect.Implementation> } }).concentration;
  for (const effect of concentration?.effects ?? []) {
    const held = ((effect as { getDependents?(): { parent?: { name?: string } }[] }).getDependents?.() ?? []).map(d => d.parent?.name).filter(Boolean);
    if (held.length) items.push(`<i class="fa-solid fa-brain"></i> ${escape(effect.name ?? "")}: ${[...new Set(held)].map(n => escape(n!)).join(", ")}`);
  }
  return row(i18n("midi-qol.Around.Helping"), items);
}

/** The Around me tab's body */
export function aroundMeHtml(token: TokenDocument.Implementation | undefined, actor: Actor.Implementation): string {
  const object = token?.object as Token.Implementation | undefined;
  if (!object) return "";
  return [threats(object, actor), standing(object), helping(object, actor)].join("");
}
