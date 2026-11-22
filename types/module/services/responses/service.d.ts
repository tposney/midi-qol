import type { Workflow } from "../../Workflow.js";
import { defineService } from "../../api/services.js";
export interface ResponseQuery {
    /** The use it responds to (none for a reaction asked outside a use) */
    workflow: Workflow | undefined;
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
    /** Contract 2: the event this is (lib/entries: attacked, hit, missed, saveRequested, saveFailed, saveSucceeded, damaging, healing) */
    eventId?: string;
    options: any;
}
/** What a reaction prompt's choice gives back: a reaction used (name, uuid), a new AC (an AC bonus) */
export type ResponseAnswer = {
    name?: string;
    uuid?: string;
    ac?: number;
    itemName?: string;
    itemUuid?: string;
    /** M32a step 3: a failed save's roll after the bonuses taken in the same prompt (Roll JSON), and whether it now succeeds */
    saveRoll?: string;
    saveSucceeded?: boolean;
};
/**
 * Contract 2: a choice that is not a whole activity (an entry's reaction or ask, an AC bonus). Shown in the reaction
 * prompt beside the activities; `take` runs on the client that asked (the use's), not the reacting player's.
 */
export interface ResponseOffer {
    /** Unique within its contributor */
    key: string;
    label: string;
    img?: string;
    /** The prompt's tooltip */
    description?: string;
    /**
     * M32a step 5: whether taking it could change the outcome, when the contributor can tell (false: hidden from a player
     * who hasn't turned on Show every bonus offer); undefined: always shown
     */
    canMatter?: boolean;
    /** The key of the player's standing choice on it (M32a): one that survives its document being made again (an effect a spell applies each cast); default its contributor and key */
    standingKey?: string;
    /**
     * What responding costs, in the economy's terms (`{ actions: { reaction: 1 } }`; none: free). midi offers it only while
     * the creature can pay; `take` spends it. A response is not only a dnd5e reaction: a free one, a legendary
     * resistance, later an opportunity attack or a readied use released (M6, M22) are the same kind of offer.
     */
    cost?: {
        actions?: Partial<Record<"reaction" | "bonus" | "action", number>>;
    };
    take(query: ResponseQuery): Promise<ResponseAnswer | void> | ResponseAnswer | void;
}
export type ResponseCandidate = {
    /** Whether using it could change what happened (a hit it can't turn into a miss: no). Not offered when false; a throw counts as true. */
    wouldChange?: (query: ResponseQuery) => boolean | Promise<boolean>;
} & ({
    /** The activity used when it is chosen (on the reacting player's client). */
    activityUuid: string;
    offer?: undefined;
} | {
    offer: ResponseOffer;
    activityUuid?: undefined;
});
export interface ResponseContributor {
    for(query: ResponseQuery): readonly ResponseCandidate[] | undefined | Promise<readonly ResponseCandidate[] | undefined>;
}
declare module "../../api/services.js" {
    interface MidiServices {
        responses: ResponseContributor;
    }
}
export declare let responsesService: ReturnType<typeof defineService<ResponseContributor>>;
export declare function defineResponsesService(): void;
/** Every contributor's candidates that could change the result, once each (a failing contributor is reported and skipped). */
export declare function collectResponses(query: ResponseQuery): Promise<{
    contributor: string;
    candidate: ResponseCandidate;
}[]>;
