import type { Activity, TokenOrDocument } from "../../../globals.js";
import { defineService, reportServiceProblem } from "../../api/services.js";
import { midiActivityRange } from "./provider.js";

/*
 * range (single): whether an activity's targets are in range, at long range or out of reach, as midi's targeting and
 * attack rules decide it (range and long range, the range flags, sharpshooter, spell sniper, thrown weapons, total
 * cover). midi's check is the default provider; distances come from the distance service, so a module can change how
 * far away things are there and what counts as in range here.
 *
 *   MidiQOL.services.register("range", "my-module", { check: ({ activity, token, targets }) => ({ result: "normal" }) }, { priority: 10 });
 *
 * Answers: result "normal" (in range), "dis" (long range: disadvantage) or "fail" (out of reach), with the reason,
 * the attacking token and the ranges used; undefined leaves the check to midi.
 */

export interface RangeCheckResult {
  result: string;
  attackingToken?: Token.Implementation;
  range?: number;
  longRange?: number;
}

export interface RangeQuery {
  activity: Activity;
  token: TokenOrDocument | string | undefined;
  targets: Set<TokenOrDocument | string> | undefined;
  showWarning: boolean;
}

export interface RangeProvider {
  check(query: RangeQuery): RangeCheckResult | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { range: RangeProvider }
}

export let rangeService: ReturnType<typeof defineService<RangeProvider>>;

export function defineRangeService() {
  rangeService = defineService<RangeProvider>("range", {
    kind: "single",
    description: "Whether an activity's targets are in range, at long range or out of reach"
  });
  rangeService.register("midi-qol", { check: ({ activity, token, targets, showWarning }) => midiActivityRange(activity, token, targets, showWarning) }, { label: "Midi-QOL" });
}

/** The active provider's answer, or midi's check when it has none. */
export function checkRange(activity: Activity, token: TokenOrDocument | string | undefined, targets: Set<TokenOrDocument | string> | undefined, showWarning = true): RangeCheckResult {
  const provider = rangeService?.get();
  if (provider) {
    try {
      const answer = provider.check({ activity, token, targets, showWarning });
      if (answer) return answer;
    } catch (err) {
      reportServiceProblem("range", "active provider", "check failed; midi's check is used", err);
    }
  }
  return midiActivityRange(activity, token, targets, showWarning);
}
