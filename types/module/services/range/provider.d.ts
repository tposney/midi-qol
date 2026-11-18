import type { Activity, TokenOrDocument } from "../../../globals.js";
export declare function midiActivityRange(activityIn: Activity, tokenRef: TokenOrDocument | string | undefined, targetsRef: Set<TokenOrDocument | string> | undefined, showWarning?: boolean): {
    result: string;
    attackingToken?: Token.Implementation;
    range?: number | undefined;
    longRange?: number | undefined;
};
