import type { BonusCandidate, BonusContext } from "./service.js";
/** Kept for other modules that ask it directly; midi asks through BONUS_APPROVAL_REQUEST */
export declare const BONUS_APPROVAL_QUERY = "midi-qol.bonusApproval";
export declare const BONUS_APPROVAL_REQUEST = "midi-qol.bonusApprovalRequest";
/** The query a player answers: may this bonus of theirs be used? */
export declare function registerBonusApprovalQuery(): void;
/** Whether a chosen bonus may be applied. */
export declare function approveBonus(bonus: BonusCandidate, ctx: BonusContext): Promise<boolean>;
