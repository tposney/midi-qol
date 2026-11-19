import { type IncomingRequest } from "./requests.js";
export declare const BONUS_DECISION_REQUEST = "midi-qol.bonusDecision";
export declare function bindRollClaim(claim: string, request: IncomingRequest): () => void;
export declare function requestForRollClaim(claim: string | undefined): IncomingRequest | undefined;
export interface BonusDecision {
    /** The requester's bonus request (its countdown, settled for the player); none: decided here with the dialog's own timer */
    incoming?: IncomingRequest;
    /** The dialog has closed: answers the requester's bonus request */
    finish(): void;
}
/** On the player's client: have `within`'s requester hold the decision about to be offered */
export declare function askBonusDecision(within: IncomingRequest, spec: {
    actorUuid?: string;
    tokenUuid?: string;
    label: string;
}): Promise<BonusDecision>;
export declare function registerBonusDecisions(): void;
