import type { BonusCandidate, BonusContext } from "./service.js";
export declare const BONUS_APPROVAL_QUERY = "midi-qol.bonusApproval";
/** The query a player answers: may this bonus of theirs be used? */
export declare function registerBonusApprovalQuery(): void;
/** Whether a chosen bonus may be applied. */
export declare function approveBonus(bonus: BonusCandidate, ctx: BonusContext): Promise<boolean>;
