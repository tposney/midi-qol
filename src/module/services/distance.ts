import { defineService, reportServiceProblem } from "../api/services.js";
import type { DistanceOptions } from "../utils.js";

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

declare module "../api/services.js" {
  interface MidiServices { distance: DistanceProvider }
}

type Measure = (t1: unknown, t2: unknown, options?: DistanceOptions) => number;

export let distanceService: ReturnType<typeof defineService<DistanceProvider>>;
let midiMeasure: Measure | undefined;
let toDocument: ((token: unknown) => TokenDocument.Implementation | undefined) | undefined;

/** `measure` is midi's own measurement and `documentOf` turns a token reference into its document (passed in to keep this module free of an import cycle with utils). */
export function defineDistanceService(measure: Measure, documentOf: (token: unknown) => TokenDocument.Implementation | undefined) {
  midiMeasure = measure;
  toDocument = documentOf;
  distanceService = defineService<DistanceProvider>("distance", {
    kind: "single",
    description: "The distance between two tokens, as midi's range, reach and nearby checks measure it"
  });
  // midi measures what it was given: a stand-in token for an actor not on the scene has no canvas document
  distanceService.register("midi-qol", { measure: ({ refs, options }) => measure(refs[0], refs[1], options) }, { label: "Midi-QOL" });
}

/** The active provider's measure (midi's when it is the provider, or another's answer is undefined). */
export function measureDistance(t1: unknown, t2: unknown, options: DistanceOptions = {}): number {
  const provider = distanceService?.get();
  if (provider && distanceService && toDocument) {
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
  return midiMeasure ? midiMeasure(t1, t2, options) : Infinity;
}
