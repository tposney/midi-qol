import { defineService } from "../../api/services.js";
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
    interface MidiServices {
        reactions: ReactionContributor;
    }
}
export declare let reactionsService: ReturnType<typeof defineService<ReactionContributor>>;
export declare function defineReactionsService(): void;
/** Every contributor's candidates that could change the result, once each (a failing contributor is reported and skipped). */
export declare function collectReactions(query: ReactionQuery): Promise<{
    contributor: string;
    candidate: ReactionCandidate;
}[]>;
