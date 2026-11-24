import { defineService, reportServiceProblem } from "../../api/services.js";

/*
 * flanking (single): whether an attacker flanks a target, and whether a target is flanked, for midi's flanking rules.
 * The optional rule checkFlanking (src/rules/flanking) decides whether flanking applies and in which mode, and
 * registers midi's geometry (square grids, gridless) as the provider while it is on; another module can provide its
 * own (hex grids, 3D, a variant rule).
 *
 *   MidiQOL.services.register("flanking", "my-module", {
 *     flanking: ({ attacker, target }) => MyGeometry.flanks(attacker, target),
 *     flanked: ({ target }) => MyGeometry.isFlanked(target)
 *   }, { priority: 10 });
 *
 * Answers true or false, or undefined to leave that question to the next provider (midi's geometry, while the rule is on).
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
}

/** Is `target` flanked: the providers decide */
export async function computeFlankedStatus(target: Token.Implementation): Promise<boolean> {
  if (!canvas || !target) return false;
  return isFlanked(target);
}

/** Does `token` flank `target`: the providers decide */
export async function computeFlankingStatus(token: Token.Implementation, target: Token.Implementation): Promise<boolean> {
  if (!canvas || !token || !target) return false;
  return isFlanking(token, target);
}

/** The providers' answer, highest priority first: the first true or false (undefined: the next one's turn) */
async function ask(question: "flanking" | "flanked", query: FlankingQuery | FlankedQuery): Promise<boolean | undefined> {
  for (const provider of flankingService?.all() ?? []) {
    const method = provider?.[question] as ((q: typeof query) => Answer) | undefined;
    if (!method) continue;
    try {
      const answer = await method.call(provider, query);
      if (typeof answer === "boolean") return answer;
    } catch (err) {
      reportServiceProblem("flanking", "provider", `${question} failed; the next provider answers`, err);
    }
  }
  return undefined;
}

/** Does `attacker` flank `target`: the providers' answer (midi's geometry while the flanking rule is on) */
export async function isFlanking(attacker: Token.Implementation, target: Token.Implementation): Promise<boolean> {
  return (await ask("flanking", { attacker: attacker.document, target: target.document })) ?? false;
}

export async function isFlanked(target: Token.Implementation): Promise<boolean> {
  return (await ask("flanked", { target: target.document })) ?? false;
}
