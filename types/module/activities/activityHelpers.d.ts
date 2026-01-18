import { Activity, ActivityUseConfiguration, RollMessageConfig, TokenOrDocument } from "../../globals.js";
import { Workflow } from "../Workflow.js";
import { TargetConfirmationOptions } from "../apps/TargetConfirmation.js";
import { MidiOptions } from "../utils.js";
import Token = foundry.canvas.placeables.Token;
/**
 * Determines if the enforceSingleWeaponTarget setting should apply to this activity.
 * Returns false for emanation/AoE activities that naturally target multiple creatures.
 * @param activity The activity to check
 * @returns true if single target should be enforced
 */
export declare function shouldEnforceSingleTarget(activity: Activity): boolean;
export declare function confirmWorkflow(existingWorkflow: Workflow): Promise<boolean>;
export declare function removeFlanking(actor: Actor.Implementation): Promise<void>;
export declare function setDamageRollMinTerms(rolls?: Roll[]): void;
export declare function doActivityReactions(activity: Activity, workflow: Workflow): Promise<{
    name?: string;
    uuid?: string;
    ac?: number;
}[]>;
export declare function preActivityConsumptionHook(activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig): boolean;
export declare function activityConsumptionHook(activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig, updates: unknown): boolean;
export declare function requiresTargetConfirmation(activity: Activity, options: MidiOptions): boolean;
export declare function preTemplateTargets(activity: Activity, options: MidiOptions): Promise<boolean>;
export declare function postTemplateConfirmTargets(activity: Activity, options: MidiOptions, workflow: Workflow): Promise<boolean>;
export declare function resolveTargetConfirmation(activity: Activity, options?: TargetConfirmationOptions): Promise<boolean>;
export declare function showItemInfo(this: Item.Implementation): Promise<ChatMessage.Implementation | undefined>;
export declare function isAoETargetable(targetToken: Token.Implementation, options?: {
    selfToken?: TokenOrDocument | string | null | undefined;
    ignoreSelf?: boolean;
    AoETargetType?: string;
    autoTarget?: string;
}): boolean;
export declare function templateTokens(templateDetails: foundry.canvas.placeables.MeasuredTemplate.Implementation, selfTokenRef?: TokenOrDocument | string | null | undefined, ignoreSelf?: boolean, AoETargetType?: string, autoTarget?: string): Token.Implementation[];
export declare function selectTargets(this: Workflow | Activity | undefined, templateDocument: MeasuredTemplateDocument, data?: unknown, userId?: string): true | undefined;
/**
 * Get currently selected tokens in the scene or user's character's tokens.
 * @returns {Token5e[]}
 */
export declare function getSceneTargets(): Token.Implementation[];
