import type { RangeCheckResult } from "./service.js";
import type { Activity, TokenOrDocument } from "../../../globals.js";
export declare function midiActivityRange(activityIn: Activity, tokenRef: TokenOrDocument | string | undefined, targetsRef: Set<TokenOrDocument | string> | undefined, showWarning?: boolean): RangeCheckResult;
