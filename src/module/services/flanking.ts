import { defineService, reportServiceProblem } from "../api/services.js";

/*
 * flanking (single): whether an attacker flanks a target, and whether a target is flanked, for midi's flanking rules.
 * midi's "Check flanking" setting still decides whether flanking applies and in which mode; the provider decides the
 * geometry. midi's (square grids, gridless; its rules/flanking.ts) is the default provider; another module can
 * provide its own (hex grids, 3D, a variant rule).
 *
 *   MidiQOL.services.register("flanking", "my-module", {
 *     flanking: ({ attacker, target }) => MyGeometry.flanks(attacker, target),
 *     flanked: ({ target }) => MyGeometry.isFlanked(target)
 *   }, { priority: 10 });
 *
 * Answers true or false, or undefined to leave that question to midi's geometry.
 */

export interface FlankingQuery {
  attacker: Token.Implementation;
  target: Token.Implementation;
}

export interface FlankedQuery {
  target: Token.Implementation;
}

type Answer = boolean | undefined | Promise<boolean | undefined>;

export interface FlankingProvider {
  /** Does `attacker` flank `target` (an ally of the attacker opposite it)? */
  flanking?(query: FlankingQuery): Answer;
  /** Is `target` flanked by any of its enemies (the "flanked" modes)? */
  flanked?(query: FlankedQuery): Answer;
}

declare module "../api/services.js" {
  interface MidiServices { flanking: FlankingProvider }
}

export let flankingService: ReturnType<typeof defineService<FlankingProvider>>;
let midiFlanking: ((attacker: Token.Implementation, target: Token.Implementation) => Promise<boolean>) | undefined;
let midiFlanked: ((target: Token.Implementation) => Promise<boolean>) | undefined;

/** midi's geometry is passed in (keeps this module free of an import cycle with utils). */
export function defineFlankingService(flanking: typeof midiFlanking & {}, flanked: typeof midiFlanked & {}) {
  midiFlanking = flanking;
  midiFlanked = flanked;
  flankingService = defineService<FlankingProvider>("flanking", {
    kind: "single",
    description: "Whether an attacker flanks a target, and whether a target is flanked"
  });
  flankingService.register("midi-qol", { flanking: ({ attacker, target }) => flanking(attacker, target), flanked: ({ target }) => flanked(target) }, { label: "Midi-QOL" });
}

async function ask(question: "flanking" | "flanked", query: FlankingQuery | FlankedQuery): Promise<boolean | undefined> {
  const provider = flankingService?.get();
  const method = provider?.[question] as ((q: typeof query) => Answer) | undefined;
  if (!method) return undefined;
  try {
    const answer = await method.call(provider, query);
    return typeof answer === "boolean" ? answer : undefined;
  } catch (err) {
    reportServiceProblem("flanking", "active provider", `${question} failed; midi's geometry is used`, err);
    return undefined;
  }
}

/** The active provider's answer, or midi's geometry when it has none. */
export async function isFlanking(attacker: Token.Implementation, target: Token.Implementation): Promise<boolean> {
  return (await ask("flanking", { attacker, target })) ?? (await midiFlanking?.(attacker, target)) ?? false;
}

export async function isFlanked(target: Token.Implementation): Promise<boolean> {
  return (await ask("flanked", { target })) ?? (await midiFlanked?.(target)) ?? false;
}
