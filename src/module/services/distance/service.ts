import { tokenFor } from "../../lib/tokenResolver.js";
import { defineService, reportServiceProblem } from "../../api/services.js";
import { getTokenDocument } from "../../utils.js";
import { midiDistance, unmeasurable } from "./provider.js";

/*
 * distance (single): how far apart two tokens are, as every midi check measures it (range, reach, nearby foes,
 * flanking adjacency, auras). midi's measurement (its measurement mode, height, walls, gridless fudge) is the default
 * provider; another module can provide its own (a 3D or levels-aware measure).
 *
 *   MidiQOL.services.register("distance", "my-module", { measure: ({ from, to, options }) => MyGeometry.distance(from, to) }, { priority: 10 });
 *
 * Answers: a distance in grid units; -1 when walls block (options.wallsBlock); Infinity when it can't be measured;
 * undefined to leave this query to midi's own measure.
 */

export interface DistanceOptions {
  /** If true, return -1 if walls block line of sight between closest points */
  wallsBlock?: boolean;
  /** If true, include cover calculations (for modules like levelsautocover) */
  includeCover?: boolean;
  /** If true, include elevation difference in distance calculation */
  includeElevation?: boolean;
}

/**
 * Why two tokens can't be measured. `blocked`: walls block. The others: there is nothing to measure between them.
 * `noPosition`: no token (midi's token for an actor with none on the scene sits at the prototype's 0,0);
 * `notDrawn`: on the viewed scene but not on the canvas (another level), which midi can only measure on the canvas.
 */
export type UnmeasurableReason = "noCanvas" | "noPosition" | "differentScene" | "notDrawn" | "blocked";
export type TokenMeasure = { ok: true, distance: number } | { ok: false, reason: UnmeasurableReason };

/** getDistance / computeDistance for tokens that can't be measured: out of any range, as `d <= range` and `d > range` both read it */
export const UNMEASURABLE_DISTANCE = Infinity;

/**
 * The distance between two tokens (Tokens, TokenDocuments or uuids), as getDistance measures it, or why it can't be
 * measured: walls block, or the tokens are on different scenes, not on the canvas, or one has no token.
 */
export function measureTokens(t1: unknown, t2: unknown, options: DistanceOptions = {}): TokenMeasure {
  const reason = unmeasurable(t1, t2);
  if (reason) return { ok: false, reason };
  const distance = getDistance(t1, t2, options);
  return distance < 0 ? { ok: false, reason: "blocked" } : { ok: true, distance };
}

/**
 * -1 when walls block; UNMEASURABLE_DISTANCE (Infinity) when the tokens can't be measured (measureTokens says why).
 * Asks the distance service's provider (midi's own measure, midiDistance, unless another module provides one).
 */
export function getDistance(t1: any, t2: any, options: DistanceOptions = {}): number {
  return measureDistance(t1, t2, options);
}


export interface DistanceQuery {
  from: TokenDocument.Implementation;
  to: TokenDocument.Implementation;
  options: DistanceOptions;
  /** What the caller passed (a Token, a document, a uuid, or midi's stand-in token for an actor not on the scene). */
  refs: readonly [unknown, unknown];
}

export interface DistanceProvider {
  measure(query: DistanceQuery): number | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { distance: DistanceProvider }
}

export let distanceService: ReturnType<typeof defineService<DistanceProvider>>;

export function defineDistanceService() {
  distanceService = defineService<DistanceProvider>("distance", {
    kind: "single",
    description: "The distance between two tokens, as midi's range, reach and nearby checks measure it"
  });
  // midi measures what it was given: a stand-in token for an actor not on the scene has no canvas document
  distanceService.register("midi-qol", { measure: ({ refs, options }) => midiDistance(refs[0], refs[1], options) }, { label: "Midi-QOL" });
}

/** The active provider's measure (midi's when it is the provider, or another's answer is undefined). */
export function measureDistance(t1: unknown, t2: unknown, options: DistanceOptions = {}): number {
  const provider = distanceService?.get();
  if (provider && distanceService) {
    const from = toDocument(t1), to = toDocument(t2);
    if (from && to) {
      try {
        const answer = provider.measure({ from, to, options, refs: [t1, t2] });
        if (typeof answer === "number" && !Number.isNaN(answer)) return answer;
      } catch (err) {
        reportServiceProblem("distance", "active provider", "measure failed; midi's measure is used", err);
      }
    }
  }
  return midiDistance(t1, t2, options);
}

function toDocument(token: unknown): TokenDocument.Implementation | undefined {
  return tokenFor(token as Token.Implementation | TokenDocument.Implementation | string) ?? undefined;
}
