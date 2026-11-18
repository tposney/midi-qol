import type { Activity, TokenOrDocument } from "../../../globals.js";
import { defineService } from "../../api/services.js";
export interface RangeCheckResult {
    result: string;
    attackingToken?: Token.Implementation;
    range?: number;
    longRange?: number;
}
export interface RangeQuery {
    activity: Activity;
    token: TokenOrDocument | string | undefined;
    targets: Set<TokenOrDocument | string> | undefined;
    showWarning: boolean;
}
export interface RangeProvider {
    check(query: RangeQuery): RangeCheckResult | undefined;
}
declare module "../../api/services.js" {
    interface MidiServices {
        range: RangeProvider;
    }
}
export declare let rangeService: ReturnType<typeof defineService<RangeProvider>>;
export declare function defineRangeService(): void;
/** The active provider's answer, or midi's check when it has none. */
export declare function checkRange(activity: Activity, token: TokenOrDocument | string | undefined, targets: Set<TokenOrDocument | string> | undefined, showWarning?: boolean): RangeCheckResult;
