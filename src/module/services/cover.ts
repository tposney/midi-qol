import { Activity } from "../../globals.js";
import { defineService } from "../api/services.js";
import { configSettings } from "../settings.js";
import { installedModules } from "../setupModules.js";
import { autoCoverTier, calcTokenCover, CoverPosition, HALF_COVER, hasCoverTotal, THREE_QUARTERS_COVER, TOTAL_COVER, wallsGiveTotalCover } from "../utils.js";

/*
 * The cover service: how much cover a target has from an attacker, or from a point (a template's origin).
 * One provider answers (the Cover Calculation setting picks it by id). Around it midi applies its wall rule: a wall
 * that blocks movement between the two is total cover, whichever provider is chosen (a provider with `walls: "provider"`
 * judges walls itself). `coverFor` adds the target's cover statuses and is the answer to use; Sharpshooter, Spell
 * Sniper and ignoreFullCover belong to an attack and stay in computeTargetAC. A module adds a provider with
 * `MidiQOL.services.register("cover", "my-module", provider, { label, available })`, and its id becomes a choice of
 * the setting.
 */

export type CoverLevel = "none" | "half" | "threeQuarters" | "total";

/**
 * Tokens are token documents, as everywhere in midi's services. A provider that needs the canvas token reads
 * `document.object` (undefined for a token that is not drawn: it then can't judge and answers undefined).
 * An attacker asked about "as if standing elsewhere" is a document whose position and `object` are at that place.
 */
export interface CoverQuery {
  /** The attacker, or the caster when measuring from `origin`. Absent when only a point is known. */
  attacker?: TokenDocument.Implementation;
  target: TokenDocument.Implementation;
  activity?: Activity;
  /** Measure from this point instead of the attacker (a template's origin). */
  origin?: CoverPosition;
}

/** midi's answer: the level, and the AC/DEX save bonus that follows from it (0, HALF_COVER, THREE_QUARTERS_COVER or TOTAL_COVER = Infinity). */
export interface CoverAnswer {
  level: CoverLevel;
  bonus: number;
}

export interface CoverProvider {
  /**
   * The level, or undefined when the provider can't judge this query (midi treats it as no cover).
   * An object with a `level` is also accepted; a `bonus` on it is ignored (the level decides).
   */
  between(query: CoverQuery): CoverLevel | { level: CoverLevel } | undefined;
  /** "midi" (default): midi's movement-wall rule gives total cover before the provider is asked. "provider": it judges walls itself. */
  walls?: "midi" | "provider";
}

const COVER_LEVELS: readonly CoverLevel[] = ["none", "half", "threeQuarters", "total"];

export function coverAnswer(level: CoverLevel): CoverAnswer {
  return { level, bonus: { none: 0, half: HALF_COVER, threeQuarters: THREE_QUARTERS_COVER, total: TOTAL_COVER }[level] };
}

function levelForBonus(bonus: number): CoverLevel {
  if (bonus === TOTAL_COVER) return "total";
  if (bonus >= THREE_QUARTERS_COVER) return "threeQuarters";
  return bonus > 0 ? "half" : "none";
}

const levelsAutoCover: CoverProvider = {
  // Its blocking walls are movement walls by default, and it counts darkness: left to it
  walls: "provider",
  // Can measure from a point without an attacker
  between({ attacker, target, origin }) {
    const targetToken = target.object;
    if (!targetToken) return undefined;
    return autoCoverTier(attacker?.object ?? undefined, targetToken, origin) ?? "none";
  }
};

/** simplecover5e takes an attacker object; from a point midi hands it a stand-in at that point. */
function simpleCoverAttacker(attacker: Token.Implementation | undefined, target: Token.Implementation, origin: CoverPosition) {
  return {
    center: { x: origin.x, y: origin.y },
    scene: canvas?.scene,
    id: attacker?.id,
    x: origin.x,
    y: origin.y,
    elevation: origin.elevation,
    getCenterPoint() { return { x: origin.x, y: origin.y }; },
    document: {
      x: origin.x,
      y: origin.y,
      elevation: origin.elevation,
      disposition: target.document.disposition,
      getCenterPoint() { return { x: origin.x, y: origin.y }; },
    }
  };
}

const simpleCover: CoverProvider = {
  // Simple Cover works on canvas tokens
  between({ attacker: attackerDocument, target: targetDocument, activity, origin }) {
    //@ts-expect-error simplecover5e api (moved from computeCoverBonus)
    const api = game.modules?.get("simplecover5e")?.api;
    if (!api) return "none";
    const attacker = attackerDocument?.object ?? undefined;
    const target = targetDocument.object;
    if (!target) return undefined;
    const from = origin ? simpleCoverAttacker(attacker, target, origin) : attacker;
    if (!from) return "none";
    // Total cover from walls is midi's rule (coverBetween); Simple Cover's own (losCheck) follows sight walls. Its partial cover is kept.
    const coverOptions: { attacker: unknown, target: Token.Implementation, scene: unknown, losCheck: boolean, activity?: Activity } =
      { attacker: from, target, scene: attacker?.scene ?? canvas?.scene, losCheck: false };
    if (activity) coverOptions.activity = activity;
    const result = api.getCover(coverOptions);
    if (!result || result.bonus == null) return "total";
    return levelForBonus(result.bonus);
  }
};

const tokenCover: CoverProvider = {
  // From a point, its calculator for the attacker standing there
  between({ attacker, target, origin }) {
    if (!attacker?.object || !target.object) return undefined;
    const value = calcTokenCover(attacker.object, target.object, origin);
    if (value === 4 || value === 3) return "total";
    return value === 2 ? "threeQuarters" : value === 1 ? "half" : "none";
  }
};

declare module "../api/services.js" {
  interface MidiServices { cover: CoverProvider }
}

export let coverService: ReturnType<typeof defineService<CoverProvider>>;

export function defineCoverService() {
  coverService = defineService<CoverProvider>("cover", {
    kind: "single",
    description: "Cover a target has from an attacker or a point",
    // "none" and "dnd5eStatus" pick no provider: only status cover counts
    selector: () => configSettings.optionalRules?.coverCalculation,
  });
  coverService.register("levelsautocover", levelsAutoCover, { label: "Levels Auto Cover", available: () => !!installedModules.get("levelsautocover") });
  coverService.register("simplecover5e", simpleCover, { label: "Simple Cover 5e", available: () => !!installedModules.get("simplecover5e") });
  coverService.register("tokencover", tokenCover, { label: "Alternative Token Cover", available: () => !!installedModules.get("tokencover") });
}

/**
 * Cover from geometry: midi's wall rule, then the active provider's answer; none when no provider is chosen or available.
 */
export function coverBetween(query: CoverQuery): CoverAnswer {
  const provider = coverService?.get();
  if (!provider) return coverAnswer("none");
  if (provider.walls !== "provider") {
    const from = query.origin ? { center: { x: query.origin.x, y: query.origin.y }, elevation: query.origin.elevation } : query.attacker?.object;
    const targetToken = query.target.object;
    if (from && targetToken && wallsGiveTotalCover(from, targetToken)) return coverAnswer("total");
  }
  const answer = provider.between(query);
  const level = typeof answer === "string" ? answer : answer?.level;
  return coverAnswer(level && COVER_LEVELS.includes(level) ? level : "none");
}

type TokenOrDocument = Token.Implementation | TokenDocument.Implementation;
const documentOf = (token: TokenOrDocument | undefined) => token instanceof TokenDocument ? token : token?.document;

/**
 * The cover a target has: its cover statuses and the geometry (coverBetween), whichever is greater. Usable without
 * a workflow. Takes token documents (canvas tokens are accepted); a target that is not drawn has only its status cover.
 */
export function coverFor(attacker: TokenOrDocument | undefined, target: TokenOrDocument, options: { activity?: Activity, origin?: CoverPosition } = {}): CoverAnswer & { from: "status" | "geometry" | "none" } {
  const targetActor = target.actor;
  if (targetActor && hasCoverTotal(targetActor)) return { ...coverAnswer("total"), from: "status" };
  // @ts-expect-error no dnd5e-types
  const statusBonus: number = targetActor?.system?.attributes?.ac?.cover ?? 0;
  const targetDocument = documentOf(target);
  const geometry = targetDocument ? coverBetween({ attacker: documentOf(attacker), target: targetDocument, activity: options.activity, origin: options.origin }) : coverAnswer("none");
  if (statusBonus > geometry.bonus) return { ...coverAnswer(levelForBonus(statusBonus)), bonus: statusBonus, from: "status" };
  return { ...geometry, from: geometry.level === "none" ? "none" : "geometry" };
}
