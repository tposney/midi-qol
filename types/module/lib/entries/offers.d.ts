import type { FoundEntry } from "./types.js";
export declare const ENTRY_OFFER_REQUEST = "midi-qol.entryOffer";
export interface OfferOption {
    key: string;
    label: string;
    img?: string;
    description?: string;
    group?: string;
    stacks?: boolean;
}
/** An entry's toggle key on its actor: its documents' ids and its id (no dots: a flag key) */
export declare function toggleKey(f: FoundEntry): string;
export declare function togglesOf(actor: Actor.Implementation | undefined): Record<string, boolean>;
export declare function toggleOn(f: FoundEntry): boolean;
export declare function setToggle(actor: Actor.Implementation, key: string, on: boolean): Promise<void>;
/** What an entry is called in a prompt: its label, else its activity's, item's or effect's name */
export declare function entryLabel(f: FoundEntry): string;
type Usable = {
    id?: string;
    uuid?: string;
    name?: string;
    img?: string;
    item?: Item.Implementation;
    uses?: {
        max?: number | string | null;
        value?: number;
        spent?: number;
    };
    update?(data: object): Promise<unknown>;
};
/** The activity an entry names (`activity`, on the entry's item; an activity home is its own) */
export declare function entryActivity(f: FoundEntry): Usable | undefined;
/**
 * An entry whose activity has consumption targets is paid through dnd5e before it runs (its resources only: no
 * action, no slot); false if dnd5e refused (not enough left; dnd5e says why). Other entries pay after (spendEntryCost).
 */
export declare function payEntryConsumption(f: FoundEntry): Promise<boolean>;
/** The entry can be paid for */
export declare function costAllows(f: FoundEntry): boolean;
export declare function spendEntryCost(f: FoundEntry): Promise<void>;
export declare function offerOption(f: FoundEntry, key: string): OfferOption;
/** Ask the actor's owner which of `options` to take (keys); none on a time-out, a GM's "none" or a disconnect */
export declare function askOffers(actor: Actor.Implementation, title: string, options: OfferOption[]): Promise<string[]>;
/** The actor's toggles: key, label, on (MidiQOL.entries.toggles) */
export declare function listToggles(actor: Actor.Implementation): {
    key: string;
    label: string;
    on: boolean;
}[];
/** The sheet's Toggles and choices control: each toggle entry a checkbox; each standing choice a select (5a); each remembered choice kept or forgotten (5e); saved on the actor */
export declare function editToggles(actor: Actor.Implementation): Promise<void>;
export declare function registerEntryOffers(): void;
export {};
