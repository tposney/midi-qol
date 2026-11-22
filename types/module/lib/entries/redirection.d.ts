import type { Workflow } from "../../Workflow.js";
export type RetargetTo = TokenDocument.Implementation | "none";
interface Pending {
    to: RetargetTo;
    label: string;
    at: string;
}
/** The redirection the hit check should make for the target (taken: it is made once) */
export declare function takeRetarget(workflow: Workflow, target: TokenDocument.Implementation): Pending | undefined;
/** Make a pending redirection: the target replaced by the new one (or dropped / missed), recorded on the use */
export declare function applyRetarget(workflow: Workflow, from: TokenDocument.Implementation, redirection: Pending): TokenDocument.Implementation | undefined;
/** The attacker picks another target, on their own client */
export declare const CHOOSE_TARGET_REQUEST = "midi-qol.chooseTarget";
export declare function registerRedirection(): void;
export {};
