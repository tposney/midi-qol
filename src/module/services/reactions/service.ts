import { defineService, entries, reportServiceProblem } from "../../api/services.js";

/*
 * reactions (contributors; M3 stage 4): the reactions a creature is offered when something happens to it. A contributor
 * names candidate activities; midi asks the creature's player through the request core (lib/requests.ts). midi's own
 * contributor offers the creature's items with a reaction activity whose reaction condition is met
 * (services/reactions/provider.ts). Another module's framework registers its own, and stops prompting itself.
 *
 *   MidiQOL.services.register("reactions", "my-module.parry", {
 *     for: ({ actor, trigger }) => trigger === "isHit" ? [{ activityUuid: parryUuid, wouldChange: ({ attackTotal, ac }) => attackTotal < ac + 3 }] : []
 *   });
 */

export interface ReactionQuery {
  workflow: any;
  /** The reacting creature's token (a document: midi-next passes TokenDocuments). */
  target: TokenDocument.Implementation;
  actor: Actor.Implementation;
  /** midi's trigger type (reaction, reactionattacked, reactiondamage...). */
  triggerType: string;
  /** The reaction condition's `reaction` value: isHit, isMissed, isAttacked, isDamaged, isSaveFail... */
  trigger: string;
  triggeringRoll?: Roll | null;
  /** The reacting creature has used its reaction this round. */
  usedReaction: boolean;
  options: any;
}

export interface ReactionCandidate {
  /** The activity used when it is chosen. */
  activityUuid: string;
  /**
   * Whether using it could change what happened (a hit it can't turn into a miss: no). Not offered when false; a
   * throw counts as true.
   */
  wouldChange?: (query: ReactionQuery) => boolean | Promise<boolean>;
}

export interface ReactionContributor {
  for(query: ReactionQuery): readonly ReactionCandidate[] | undefined | Promise<readonly ReactionCandidate[] | undefined>;
}

declare module "../../api/services.js" {
  interface MidiServices { reactions: ReactionContributor }
}

export let reactionsService: ReturnType<typeof defineService<ReactionContributor>>;

export function defineReactionsService() {
  reactionsService = defineService<ReactionContributor>("reactions", {
    kind: "contributors",
    description: "The reactions a creature is offered when it is attacked, hit, missed, damaged or saves"
  });
}

/** Every contributor's candidates that could change the result, once each (a failing contributor is reported and skipped). */
export async function collectReactions(query: ReactionQuery): Promise<{ contributor: string, candidate: ReactionCandidate }[]> {
  const found: { contributor: string, candidate: ReactionCandidate }[] = [];
  const seen = new Set<string>();
  for (const { id, provider } of entries<ReactionContributor>("reactions")) {
    let candidates: readonly ReactionCandidate[];
    try { candidates = await provider.for(query) ?? []; }
    catch (err) { reportServiceProblem("reactions", id, "failed", err); continue; }
    for (const candidate of candidates) {
      if (!candidate?.activityUuid || seen.has(candidate.activityUuid)) continue;
      let changes = true;
      try { changes = candidate.wouldChange ? !!(await candidate.wouldChange(query)) : true; }
      catch (err) { reportServiceProblem("reactions", id, `wouldChange failed for ${candidate.activityUuid}`, err); }
      if (!changes) continue;
      seen.add(candidate.activityUuid);
      found.push({ contributor: id, candidate });
    }
  }
  return found;
}
