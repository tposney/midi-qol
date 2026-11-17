import { Activity } from "../../globals.js";
import { defineService } from "../api/services.js";
import { configSettings } from "../settings.js";
import { installedModules } from "../setupModules.js";
import { autoCoverTier, calcTokenCover, CoverPosition, HALF_COVER, THREE_QUARTERS_COVER, TOTAL_COVER, wallsGiveTotalCover } from "../utils.js";

/*
 * The cover service: how much cover a target has from an attacker, or from a point (a template's origin).
 * One provider answers (the Cover Calculation setting picks it by id); midi applies its own rules on top
 * (status cover, Sharpshooter, Spell Sniper, ignoreFullCover: computeTargetAC). A module adds a provider with
 * `MidiQOL.services.register("cover", "my-module", provider, { label, available })`, and its id becomes a choice of
 * the setting.
 */

export type CoverLevel = "none" | "half" | "threeQuarters" | "total";

export interface CoverQuery {
  /** The attacker, or the caster when measuring from `origin`. Absent when only a point is known. */
  attacker?: Token.Implementation;
  target: Token.Implementation;
  activity?: Activity;
  /** Measure from this point instead of the attacker (a template's origin). */
  origin?: CoverPosition;
}

export interface CoverAnswer {
  level: CoverLevel;
  /** AC/DEX save bonus: 0, HALF_COVER, THREE_QUARTERS_COVER or TOTAL_COVER (Infinity) */
  bonus: number;
}

export interface CoverProvider {
  /** undefined when the provider can't judge this query: midi treats it as no cover. */
  between(query: CoverQuery): CoverAnswer | undefined;
}

export function coverAnswer(level: CoverLevel): CoverAnswer {
  return { level, bonus: { none: 0, half: HALF_COVER, threeQuarters: THREE_QUARTERS_COVER, total: TOTAL_COVER }[level] };
}

function answerForBonus(bonus: number): CoverAnswer {
  if (bonus === TOTAL_COVER) return { level: "total", bonus };
  if (bonus >= THREE_QUARTERS_COVER) return { level: "threeQuarters", bonus };
  if (bonus > 0) return { level: "half", bonus };
  return { level: "none", bonus: 0 };
}

const levelsAutoCover: CoverProvider = {
  // Can measure from a point without an attacker
  between({ attacker, target, origin }) {
    const tier = autoCoverTier(attacker, target, origin);
    return tier ? coverAnswer(tier) : coverAnswer("none");
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
  between({ attacker, target, activity, origin }) {
    //@ts-expect-error simplecover5e api (moved from computeCoverBonus)
    const api = game.modules?.get("simplecover5e")?.api;
    if (!api) return coverAnswer("none");
    const from = origin ? simpleCoverAttacker(attacker, target, origin) : attacker;
    if (!from) return coverAnswer("none");
    // Total cover is midi's (movement walls); Simple Cover's own (losCheck) follows sight walls. Its partial cover is kept.
    const wallsFrom = origin ? { center: { x: origin.x, y: origin.y }, elevation: origin.elevation } : attacker;
    if (wallsFrom && wallsGiveTotalCover(wallsFrom, target)) return coverAnswer("total");
    const coverOptions: { attacker: unknown, target: Token.Implementation, scene: unknown, losCheck: boolean, activity?: Activity } =
      { attacker: from, target, scene: attacker?.scene ?? canvas?.scene, losCheck: false };
    if (activity) coverOptions.activity = activity;
    const result = api.getCover(coverOptions);
    if (!result || result.bonus == null) return coverAnswer("total");
    return answerForBonus(result.bonus);
  }
};

const tokenCover: CoverProvider = {
  // From a point, its calculator for the attacker standing there
  between({ attacker, target, origin }) {
    if (!attacker) return coverAnswer("none");
    const value = calcTokenCover(attacker, target, origin);
    if (value === 4 || value === 3) return coverAnswer("total");
    if (value === 2) return coverAnswer("threeQuarters");
    if (value === 1) return coverAnswer("half");
    return coverAnswer("none");
  }
};

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

/** The active provider's answer, or none when no provider is chosen or available. */
export function coverBetween(query: CoverQuery): CoverAnswer {
  return coverService?.get()?.between(query) ?? coverAnswer("none");
}
