export declare function initHiding(): void;
export declare const HIDING = "hiding";
export declare const DEFAULT_DC = 15;
export declare function hidingConditionId(): string | undefined;
/** The creature's hide: its Hiding condition */
export declare function hidingCondition(actor: Actor.Implementation | null | undefined): import("fvtt-types/src/foundry/common/abstract/embedded-collection.mjs").default.GetReturn<ActiveEffect.Stored<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType>, undefined>;
/** The hide's DC, if the creature has a Hiding condition */
export declare function hiddenDC(actor: Actor.Implementation | null | undefined): number | undefined;
export declare function passivePerception(actor: Actor.Implementation | null | undefined): number;
/** Whether a hiding target is hidden from `viewer`: the perception service's answer */
export declare function hiddenFrom(target: TokenDocument.Implementation, viewer: TokenDocument.Implementation): boolean;
/** midi's answer (the perception service's default provider) */
export declare function midiHiddenFrom(target: TokenDocument.Implementation, viewer: TokenDocument.Implementation): boolean;
