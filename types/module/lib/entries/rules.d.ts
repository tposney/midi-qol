import type { Entry } from "./types.js";
export interface RoleMatch {
    type?: string;
    name?: string;
    status?: string;
    identifier?: string;
    id?: string;
}
export interface Rule {
    identifier: string;
    rules?: "2014" | "2024";
    type?: string;
    entries?: Entry[];
    activities?: {
        match: RoleMatch;
        entries: Entry[];
    }[];
    effects?: {
        match: RoleMatch;
        entries: Entry[];
    }[];
}
interface Registered {
    source: string;
    rule: Rule;
}
export declare function registerRule(source: string, rule: Rule): () => void;
export declare function hasRules(): boolean;
type ItemLike = Item.Implementation;
/** What automates the item instead of a registered rule, if anything (its own entries, a macro, CAT, CPR) */
export declare function automatedBy(item: ItemLike): string | undefined;
/** The rule for an item (the last registered that matches), unless something else automates it */
export declare function ruleFor(item: ItemLike | undefined | null): Registered | undefined;
/** Whether a document (an activity or effect) fills a role */
export declare function matchesRole(document: {
    type?: string;
    name?: string;
    statuses?: Set<string>;
    identifier?: string;
    id?: string | null;
}, match: RoleMatch): boolean;
/** The item an effect belongs to: its parent (a transfer effect), else the item its origin names (an applied one) */
export declare function itemOfEffect(effect: ActiveEffect.Implementation): ItemLike | undefined;
/** For MidiQOL.rules.for(item): the rule automating it and its source, or what automates it instead */
export declare function describeRuleFor(item: ItemLike): {
    source: string;
    identifier: string;
} | {
    automatedBy: string;
} | undefined;
export interface OverlayFlag {
    identifier: string;
    rules?: "2014" | "2024";
    type?: string;
    version?: string;
    /** The base it was saved against (save as overlay): a base changed since is reported */
    base?: {
        uuid: string;
        modifiedTime?: number;
    };
}
/** An overlay item as a rule: its entries, its activities' (by type and name), its effects' (by name) */
export declare function ruleFromOverlay(item: ItemLike): Rule | undefined;
/** For the TroubleShooter: what automates each of the actor's items (a rule's source, or another automation) */
export declare function rulesReport(actor: Actor.Implementation): {
    item: string;
    identifier?: string;
    rule?: string;
    automatedBy?: string;
}[];
export declare const rulesApi: {
    report: typeof rulesReport;
    register: typeof registerRule;
    for: typeof describeRuleFor;
    sources: () => {
        source: string;
        identifier: string;
        rules: "2014" | "2024" | undefined;
        type: string | undefined;
    }[];
};
export {};
