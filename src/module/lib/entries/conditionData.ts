import { MODULE_ID } from "../../../midi-qol.js";
import type { Workflow } from "../../Workflow.js";
import { canSee as midiCanSee } from "../../utils.js";
import { getDistance } from "../../services/distance/service.js";
import { ledger } from "../../services/economy/ledger.js";
import { outcomes } from "../outcomes.js";
import { tagsView } from "../tags.js";
import type { FoundEntry } from "./types.js";
import type { EventContext } from "./engine.js";

/*
 * M15 stage 6 (the spike's condition data, "The format"): what an entry's `if` and `@` values read beyond midi's
 * condition data.
 * - `use`: the current use (activity, item, actor, token, spellLevel, targets, choices, tags);
 * - `outcome`: this target's TargetOutcome, `outcomes` every target's (by token uuid);
 * - `entry.origin`: the use that applied the effect (actor, item, activity, spellLevel, dc), `entry.owner`;
 * - `actor.economy`: the actor's action, bonus action and reaction this turn (`used`, `left`);
 * - helpers `nearby({ within, of, filter })`, `canSee(a, b)`, `dice.duplicates(roll, faces)`.
 */

type TokenLike = TokenDocument.Implementation | Token.Implementation | Actor.Implementation | null | undefined;

function tokenDocumentOf(ref: TokenLike): TokenDocument.Implementation | undefined {
  if (!ref) return undefined;
  if (ref instanceof TokenDocument) return ref;
  if (ref instanceof Actor) return (ref.getActiveTokens(false, true)[0] as TokenDocument.Implementation | undefined) ?? undefined;
  return (ref as Token.Implementation).document;
}

/** The use as entries read it */
export function useView(workflow: Workflow): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  const define = (key: string, get: () => unknown) => Object.defineProperty(view, key, { get, enumerable: true });
  define("workflow", () => workflow);
  define("activity", () => workflow.activity);
  define("item", () => workflow.item);
  define("actor", () => workflow.actor);
  define("token", () => workflow.token?.document ?? workflow.token);
  define("spellLevel", () => workflow.spellLevel);
  define("targets", () => workflow.targets?.documents ?? []);
  define("choices", () => workflow.choices);
  define("tags", () => tagsView(workflow));
  return view;
}

/** The use that applied an effect: from DAE's application record (castData) and the effect's origin */
export function originView(effect: ActiveEffect.Implementation, activity: unknown, actor: Actor.Implementation | undefined): Record<string, unknown> {
  const castData = effect.flags?.[MODULE_ID]?.castData as { castLevel?: number, baseLevel?: number, saveDC?: number } | undefined;
  const applying = activity as { item?: Item.Implementation, save?: { dc?: { value?: number } } } | undefined;
  return {
    uuid: effect.origin,
    actor,
    item: applying?.item,
    activity: applying,
    spellLevel: castData?.castLevel ?? castData?.baseLevel ?? 0,
    dc: castData?.saveDC ?? applying?.save?.dc?.value ?? 0
  };
}

/** `nearby({ within, of, filter })`: the creatures within `within` feet of `of` (a token, an actor; default the entry's actor), `filter` a function of the actor */
function nearbyFor(defaultOf: TokenLike) {
  return (spec: { within?: number, of?: TokenLike, filter?: (actor: Actor.Implementation, token: TokenDocument.Implementation) => unknown, includeSelf?: boolean } = {}) => {
    const from = tokenDocumentOf(spec.of ?? defaultOf);
    const scene = from?.parent;
    if (!from || !scene) return [];
    const within = spec.within ?? 5;
    const found: Actor.Implementation[] = [];
    for (const token of scene.tokens) {
      const actor = token.actor;
      if (!actor || (token === from && !spec.includeSelf)) continue;
      const distance = token === from ? 0 : getDistance(from, token, { wallsBlock: false });
      if (distance < 0 || distance > within) continue;
      try {
        if (spec.filter && !spec.filter(actor, token)) continue;
      } catch {
        continue;
      }
      found.push(actor);
    }
    return found;
  };
}

function canSeeHelper(a: TokenLike, b: TokenLike): boolean {
  const from = tokenDocumentOf(a);
  const to = tokenDocumentOf(b);
  if (!from || !to) return false;
  try {
    return midiCanSee(from, to);
  } catch {
    return false;
  }
}

/** Whether two dice of `faces` faces in the roll show the same number (Chromatic Orb's leap) */
export function duplicates(roll: Roll | undefined | null, faces?: number): boolean {
  if (!roll) return false;
  const seen = new Set<number>();
  for (const die of roll.dice) {
    if (faces !== undefined && die.faces !== faces) continue;
    for (const result of die.results) {
      if (!result.active || result.discarded) continue;
      if (seen.has(result.result)) return true;
      seen.add(result.result);
    }
  }
  return false;
}

function economyView(actor: Actor.Implementation | undefined): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  Object.defineProperty(view, "used", { enumerable: true, get: () => {
    const state = ledger(actor);
    return { action: state.action.used > 0, bonus: state.bonus.used > 0, reaction: state.reaction.used > 0 };
  } });
  Object.defineProperty(view, "left", { enumerable: true, get: () => {
    const state = ledger(actor);
    return { action: !state.action.exhausted, bonus: !state.bonus.exhausted, reaction: !state.reaction.exhausted };
  } });
  return view;
}

/** Added to an entry's condition data (conditionDataFor) */
export function entryConditionExtras(f: FoundEntry, context: EventContext, applyingActivity: unknown, originActor: Actor.Implementation | undefined): {
  extra: Record<string, unknown>, entry: Record<string, unknown>
} {
  const workflow = context.workflow;
  const effect = f.document instanceof ActiveEffect ? f.document : undefined;
  const extra: Record<string, unknown> = {
    nearby: nearbyFor(f.near?.token ?? f.actor ?? context.actor),
    canSee: canSeeHelper,
    dice: { duplicates }
  };
  if (workflow) {
    extra.use = useView(workflow);
    const byTarget = outcomes(workflow);
    extra.outcomes = Object.fromEntries(byTarget);
    const target = context.target?.uuid;
    if (target) extra.outcome = byTarget.get(target) ?? {};
  }
  const entry: Record<string, unknown> = { owner: f.actor };
  if (effect) entry.origin = originView(effect, applyingActivity, originActor);
  return { extra, entry };
}

/** After createConditionData (which rebuilds `actor`): the actor's economy */
export function addEconomy(conditionData: Record<string, unknown>, actor: Actor.Implementation | undefined): void {
  const view = conditionData.actor;
  if (view && typeof view === "object") (view as Record<string, unknown>).economy = economyView(actor);
}
