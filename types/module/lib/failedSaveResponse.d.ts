import { type ReactionItemReference, type ReactionResult, type ResponseOfferChoice } from "../utils.js";
import type { IncomingRequest } from "./requests.js";
export interface FailedSaveBonusSpec {
    result: string;
    rollType: string;
    selector: string;
    dc: number;
}
export declare function promptFailedSave(tokenUuid: string, refs: ReactionItemReference[], triggerTokenUuid: string | undefined, flavor: string, triggerType: string, options: {
    failedSaveBonus?: FailedSaveBonusSpec;
    incoming?: IncomingRequest;
    reactionOffers?: ResponseOfferChoice[];
    [key: string]: unknown;
}): Promise<ReactionResult | undefined>;
