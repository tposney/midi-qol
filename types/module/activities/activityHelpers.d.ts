import { Workflow } from "../Workflow.js";
export declare function confirmWorkflow(existingWorkflow: Workflow): Promise<boolean>;
export declare function removeFlanking(actor: Actor): Promise<void>;
export declare function setDamageRollMinTerms(rolls: Array<Roll | any> | undefined): void;
export declare function doActivityReactions(activity: any, workflow: Workflow): Promise<any[]>;
export declare function preActivityConsumptionHook(activity: any, usageConfig: any, messageConfig: any): boolean;
export declare function activityConsumptionHook(activity: any, usageConfig: any, messageConfig: any, updates: any): boolean;
export declare function requiresTargetConfirmation(activity: any, options: any): boolean;
export declare function preTemplateTargets(activity: any, options: any): Promise<boolean>;
export declare function postTemplateConfirmTargets(activity: any, options: any, workflow: any): Promise<boolean>;
export declare function resolveTargetConfirmation(activity: any, options?: any): Promise<boolean>;
export declare function showItemInfo(): Promise<ChatMessage | undefined>;
export declare function isAoETargetable(targetToken: any, options?: {
    selfToken?: Token | TokenDocument | string | null | undefined;
    ignoreSelf?: boolean;
    AoETargetType?: string;
    autoTarget?: string;
}): boolean;
export declare function templateTokens(templateDetails: MeasuredTemplate, selfTokenRef?: Token | TokenDocument | string | null | undefined, ignoreSelf?: boolean, AoETargetType?: string, autoTarget?: string): Token[];
export declare function selectTargets(templateDocument: MeasuredTemplateDocument, data?: any, user?: any): true | undefined;
/**
 * Get currently selected tokens in the scene or user's character's tokens.
 * @returns {Token5e[]}
 */
export declare function getSceneTargets(): foundry.canvas.placeables.Token[];
