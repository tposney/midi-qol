/** An overlay item as a rule, and its data part kept for the items it overlays */
export declare function registerOverlay(item: Item.Implementation, source: string): (() => void) | undefined;
/** Add (or replace, for a new version) the data part of the overlay matching the item, if it lacks anything */
export declare function applyOverlayData(item: Item.Implementation): Promise<boolean>;
/** On the active GM: an item created on an actor gets its overlay's data part; at ready, the world's actors' items */
export declare function watchOverlayData(): void;
export declare function applyOverlayDataToWorld(): Promise<void>;
/** The world's own overlays (world items flagged midi-qol.overlay), as source "world" */
/** The overlays in a compendium, registered as rules of `source` (midi's sample pack at ready) */
export declare function registerOverlayPack(packId: string, source: string): Promise<number>;
export declare function registerWorldOverlays(): number;
/**
 * The difference between an item and its base (its compendium source) as a world overlay item: the item's entries if
 * changed; an effect or activity the base has, as a stub with its entries if they changed; one the base lacks, whole
 * (the data part). Saving again for the same identifier updates that overlay and its version. Registered at once.
 */
export declare function saveAsOverlay(item: Item.Implementation): Promise<Item.Implementation | undefined>;
export declare function watchOverlayAuthoring(): void;
export interface AutomationRow {
    item: string;
    identifier?: string;
    status: string;
    detail?: string;
}
export interface OverlayRow {
    name: string;
    source: string;
    identifier: string;
    rules?: string;
    version: string;
    baseChanged?: boolean;
    base?: string;
}
/** For each of the actor's items with an identifier something matches: what automates it, or why an overlay doesn't */
export declare function actorAutomation(actor: Actor.Implementation): AutomationRow[];
/** The registered overlays, each with whether its base changed since it was saved */
export declare function overlayRows(): Promise<OverlayRow[]>;
/** For the TroubleShooter: the world's actors and the viewed scene's unlinked tokens, those with anything to show */
export declare function automationReport(): Promise<{
    actors: {
        name: string;
        rows: AutomationRow[];
    }[];
    overlays: OverlayRow[];
}>;
