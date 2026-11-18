type Match = "exact" | "otherRules" | "name";
export declare function registerRulesTextSettings(): void;
/** The Item compendiums a GM can choose for missing rules text (Misc tab), with None first */
export declare function rulesTextCompendiumChoices(): Record<string, string>;
/** A midi sample item whose description says it has no rules text. */
export declare function lacksRulesText(item: Item.Implementation | undefined | null): boolean;
/** Fill one item's rules text; returns the match found, or undefined (nothing changed). */
export declare function fillRulesText(item: Item.Implementation, { notify }?: {
    notify?: boolean | undefined;
}): Promise<Match | undefined>;
/** Every item in the world (actors, unlinked tokens, the Items directory) that lacks its rules text. */
export declare function itemsLackingRulesText(): Item.Implementation[];
/** Fill every item in the world that lacks its rules text (GM only). */
export declare function fillAllRulesText(): Promise<{
    filled: number;
    notFound: string[];
}>;
export {};
