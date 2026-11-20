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
 * Contract 2: a candidate may be an offer instead of an activity (`{ offer: { key, label, img, take(query) } }`):
 * listed in the same prompt, its `take` run on the asking client; it may give back a new AC.
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
  /** Contract 2: the moment this is (lib/entries: attacked, hit, missed, saveRequested, saveFailed, saveSucceeded, damaging, healing) */
  moment?: string;
  options: any;
}

/** What a reaction prompt's choice gives back: a reaction used (name, uuid), a new AC (an AC bonus) */
export type ReactionAnswer = { name?: string, uuid?: string, ac?: number, itemName?: string, itemUuid?: string };

/**
 * Contract 2: a choice that is not a whole activity (an entry's reaction or ask, an AC bonus). Shown in the reaction
 * prompt beside the activities; `take` runs on the client that asked (the use's), not the reacting player's.
 */
export interface ReactionOffer {
  /** Unique within its contributor */
  key: string;
  label: string;
  img?: string;
  /** The prompt's tooltip */
  description?: string;
  /**
   * What responding costs, in the economy's terms (`{ actions: { reaction: 1 } }`; none: free). midi offers it only while
   * the creature can pay; `take` spends it. A response is not only a dnd5e reaction: a free one, a legendary
   * resistance, later an opportunity attack or a readied use released (M6, M22) are the same kind of offer.
   */
  cost?: { actions?: Partial<Record<"reaction" | "bonus" | "action", number>> };
  take(query: ReactionQuery): Promise<ReactionAnswer | void> | ReactionAnswer | void;
}

export type ReactionCandidate = {
  /** Whether using it could change what happened (a hit it can't turn into a miss: no). Not offered when false; a throw counts as true. */
  wouldChange?: (query: ReactionQuery) => boolean | Promise<boolean>;
} & ({
  /** The activity used when it is chosen (on the reacting player's client). */
  activityUuid: string;
  offer?: undefined;
} | {
  offer: ReactionOffer;
  activityUuid?: undefined;
});

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
    contract: 2,
    description: "The reactions a creature is offered when it is attacked, hit, missed, damaged or saves: activities, and (contract 2) offers that aren't whole activities"
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
      const key = candidate?.activityUuid ?? (candidate?.offer ? `${id}:${candidate.offer.key}` : undefined);
      if (!key || seen.has(key)) continue;
      if (candidate.offer?.cost?.actions?.reaction && query.usedReaction) continue;
      let changes = true;
      try { changes = candidate.wouldChange ? !!(await candidate.wouldChange(query)) : true; }
      catch (err) { reportServiceProblem("reactions", id, `wouldChange failed for ${key}`, err); }
      if (!changes) continue;
      seen.add(key);
      found.push({ contributor: id, candidate });
    }
  }
  return found;
}
