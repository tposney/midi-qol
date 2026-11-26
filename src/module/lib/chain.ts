import { getDistance } from "../services/distance/service.js";

/*
 * Chaining (the survey's "chaining or adding a newly chosen creature after the result": Chain Lightning, Chromatic Orb,
 * Sweeping Attack, Superior Hunter's Prey, Words of Creation): new targets chosen among the creatures near the one the
 * use reached, never one the chain already took. Trigger Activity's "near" targets and entries' `near` choice use it.
 */

/** What a chain carries from one use to the next (workflowOptions.chain) */
export interface ChainState {
  /** Tokens the chain has taken (every use's targets) */
  taken: string[];
  /** Triggered uses so far */
  leaps: number;
  /** The most triggered uses (evaluated by the chain's first use) */
  limit: number;
}

export type NearDisposition = "any" | "enemy" | "ally";

export interface NearQuery {
  anchor: TokenDocument.Implementation;
  /** Feet from the anchor */
  within: number;
  /** Disposition relative to `source` */
  disposition?: NearDisposition;
  source?: TokenDocument.Implementation | null;
  /** Token UUIDs never offered (the anchor, the source and what the chain took are always left out) */
  exclude?: Iterable<string>;
}

/** The tokens within `within` of the anchor that may be chosen, nearest first */
export function nearCandidates(query: NearQuery): TokenDocument.Implementation[] {
  const scene = query.anchor.parent;
  if (!scene) return [];
  const exclude = new Set(query.exclude ?? []);
  if (query.anchor.uuid) exclude.add(query.anchor.uuid);
  if (query.source?.uuid) exclude.add(query.source.uuid);
  const sourceDisposition = query.source?.disposition ?? 0;
  const out: { token: TokenDocument.Implementation, distance: number }[] = [];
  for (const token of scene.tokens) {
    if (!token.uuid || exclude.has(token.uuid) || !token.actor || token.hidden) continue;
    if (query.disposition === "ally" && token.disposition !== sourceDisposition) continue;
    if (query.disposition === "enemy" && (token.disposition === sourceDisposition || token.disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL)) continue;
    const distance = getDistance(query.anchor, token, { wallsBlock: true });
    if (distance < 0 || !Number.isFinite(distance) || distance > query.within) continue;
    out.push({ token, distance });
  }
  return out.sort((a, b) => a.distance - b.distance).map(o => o.token);
}

/**
 * Up to `max` of the candidates: asked when the actor has a player owner (the nearest ticked), else the nearest.
 * Undefined when the dialog was closed (none taken).
 */
export async function pickNearTargets(candidates: TokenDocument.Implementation[], max: number, { actor, label }: { actor?: Actor.Implementation | null, label: string }): Promise<TokenDocument.Implementation[] | undefined> {
  if (max <= 0 || !candidates.length) return [];
  if (!actor?.hasPlayerOwner) return candidates.slice(0, max);
  const escape = (text: string) => foundry.utils.escapeHTML(text);
  const rows = candidates.map((token, i) => `<label class="checkbox"><input type="checkbox" name="near-${i}" ${i < max ? "checked" : ""}> ${escape(token.name ?? "")}</label>`).join("");
  for (;;) {
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: `${actor.name}: ${label}` },
      content: `<p>${escape(game.i18n?.format("midi-qol.Chain.Pick", { max: String(max) }) ?? "")}</p><fieldset>${rows}</fieldset>`,
      rejectClose: false
    }) as Record<string, unknown> | null;
    if (!data) return undefined;
    const picked = candidates.filter((_, i) => !!data[`near-${i}`]);
    if (picked.length <= max) return picked;
    ui.notifications?.warn(game.i18n?.format("midi-qol.Chain.TooMany", { max: String(max) }) ?? "");
  }
}
