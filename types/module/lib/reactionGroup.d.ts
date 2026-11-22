import { type ReactionItemReference, type ReactionResult, type ResponseOfferChoice } from "../utils.js";
import type { IncomingRequest } from "./requests.js";
export interface ReactionSection {
    tokenUuid: string;
    reactionActivityList: ReactionItemReference[];
    triggerTokenUuid?: string;
    reactionFlavor: string;
    triggerType: string;
    options: {
        incoming?: IncomingRequest;
        reactionOffers?: ResponseOfferChoice[];
        [key: string]: unknown;
    };
}
declare const ReactionGroupDialog_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
/** The prompt: a section per creature, ticked and applied; it resolves with the ticked row ids (none: declined) */
export declare class ReactionGroupDialog extends ReactionGroupDialog_base {
    #private;
    static DEFAULT_OPTIONS: {
        classes: string[];
        window: {
            title: string;
        };
        position: {
            width: number;
            height: "auto";
        };
    };
    static PARTS: {
        dialog: {
            template: string;
        };
    };
    constructor(entries: object[], content: string, incoming: IncomingRequest | undefined, resolve: (ids: string[]) => void);
    _prepareContext(options: any): Promise<{
        content: string;
        entries: object[];
        skipLabel: string;
        tabs?: Record<string, import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.Tab>;
    }>;
    _onRender(context: any, options: any): Promise<void>;
    close(options?: any): Promise<void | this>;
}
/** The group request's handler: one prompt, then each creature's chosen reactions taken; answers in section order */
export declare function promptReactionGroup(sections: ReactionSection[], incoming: IncomingRequest | undefined): Promise<(ReactionResult | undefined)[]>;
export {};
