import { defineService, reportServiceProblem } from "../../api/services.js";
import { checkRule } from "../../settings.js";
import { midiFlankedStatus, midiFlankingStatus } from "./provider.js";
import { FLANKED_MODES } from "./rules.js";

/*
 * flanking (single): whether an attacker flanks a target, and whether a target is flanked, for midi's flanking rules.
 * midi's "Check flanking" setting still decides whether flanking applies and in which mode; the provider decides the
 * geometry. midi's (square grids, gridless; provider.ts over rules.ts) is the default provider; another module can
 * provide its own (hex grids, 3D, a variant rule).
 *
 *   MidiQOL.services.register("flanking", "my-module", {
 *     flanking: ({ attacker, target }) => MyGeometry.flanks(attacker, target),
 *     flanked: ({ target }) => MyGeometry.isFlanked(target)
 *   }, { priority: 10 });
 *
 * Answers true or false, or undefined to leave that question to midi's geometry.
 */

/** TokenDocuments (section 18: no canvas Token crosses a contract); a provider wanting geometry uses `.object` */
export interface FlankingQuery {
  attacker: TokenDocument.Implementation;
  target: TokenDocument.Implementation;
}

export interface FlankedQuery {
  target: TokenDocument.Implementation;
}

type Answer = boolean | undefined | Promise<boolean | undefined>;

export interface FlankingProvider {
  /** Does `attacker` flank `target` (an ally of the attacker opposite it)? */
  flanking?(query: FlankingQuery): Answer;
  /** Is `target` flanked by any of its enemies (the "flanked" modes)? */
  flanked?(query: FlankedQuery): Answer;
}

declare module "../../api/services.js" {
  interface MidiServices { flanking: FlankingProvider }
}

export let flankingService: ReturnType<typeof defineService<FlankingProvider>>;

export function defineFlankingService() {
  flankingService = defineService<FlankingProvider>("flanking", {
    kind: "single",
    description: "Whether an attacker flanks a target, and whether a target is flanked"
  });
  flankingService.register("midi-qol", {
    flanking: ({ attacker, target }) => attacker.object && target.object ? midiFlankingStatus(attacker.object, target.object) : undefined,
    flanked: ({ target }) => target.object ? midiFlankedStatus(target.object) : undefined
  }, { label: "Midi-QOL" });
}

/** Is `target` flanked: midi's setting decides whether the flanked rule applies, the provider decides. */
export async function computeFlankedStatus(target: Token.Implementation): Promise<boolean> {
  if (!checkRule("checkFlanking") || !FLANKED_MODES.includes(checkRule("checkFlanking") as string)) return false;
  if (!canvas || !target) return false;
  return isFlanked(target);
}

/** Does `token` flank `target`: midi's setting decides whether flanking applies, the provider decides. */
export async function computeFlankingStatus(token: Token.Implementation, target: Token.Implementation): Promise<boolean> {
  if (!checkRule("checkFlanking") || checkRule("checkFlanking") === "off") return false;
  if (!canvas || !token || !target) return false;
  return isFlanking(token, target);
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
  return (await ask("flanking", { attacker: attacker.document, target: target.document })) ?? (await midiFlankingStatus(attacker, target));
}

export async function isFlanked(target: Token.Implementation): Promise<boolean> {
  return (await ask("flanked", { target: target.document })) ?? (await midiFlankedStatus(target));
}
