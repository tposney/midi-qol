import type { Entry } from "../lib/entries/types.js";
/** An activity, item or effect: what the editor reads and writes (method-style update, so a document's own fits) */
interface EntryDocument {
    uuid: string | null;
    name?: string | null;
    isOwner?: boolean;
    update(data: object): Promise<unknown>;
    getFlag?(scope: string, key: string): unknown;
}
export declare function entriesOfDocument(document: EntryDocument): Entry[];
declare const EntryEditor_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class EntryEditor extends EntryEditor_base {
    #private;
    constructor(document: EntryDocument, options?: {});
    static DEFAULT_OPTIONS: {
        tag: "form";
        classes: string[];
        window: {
            title: string;
            resizable: boolean;
            contentClasses: string[];
        };
        position: {
            width: number;
            height: number;
        };
        form: {
            submitOnChange: boolean;
            closeOnSubmit: boolean;
            handler: typeof EntryEditor.__#408@#onChange;
        };
        actions: {
            select: typeof EntryEditor.__#408@#onSelect;
            add: typeof EntryEditor.__#408@#onAdd;
            remove: typeof EntryEditor.__#408@#onRemove;
            addAction: typeof EntryEditor.__#408@#onAddAction;
            removeAction: typeof EntryEditor.__#408@#onRemoveAction;
            toggleJson: typeof EntryEditor.__#408@#onToggleJson;
            save: typeof EntryEditor.__#408@#onSave;
        };
    };
    static PARTS: {
        editor: {
            template: string;
            scrollable: string[];
        };
    };
    get title(): string;
    _prepareContext(options: any): Promise<{
        list: {
            index: number;
            id: string;
            on: string;
            selected: boolean;
            invalid: boolean;
        }[];
        hasEntry: boolean;
        jsonView: boolean;
        json: string;
        entry: Entry;
        events: {
            value: string;
            label: string;
            selected: boolean;
        }[];
        who: {
            value: string;
            label: string;
            selected: boolean;
        }[];
        near: {
            within: number | "reach";
            of: string;
            filter: string;
        } | undefined;
        offers: {
            value: string;
            label: string;
            selected: boolean;
        }[];
        limits: {
            value: string;
            label: string;
            selected: boolean;
        }[];
        activities: {
            value: string;
            label: string;
            selected: boolean;
        }[];
        rawDo: string;
        actionCards: {
            index: number;
            key: string | undefined;
            kinds: {
                selected: boolean;
                value: string;
                label: string;
            }[];
            fields: {
                name: string;
                label: string;
                type: "string" | "number" | "boolean" | "formula" | "list" | "select";
                value: {};
                checked: boolean;
                options: {
                    selected: boolean;
                    value: string;
                    label: string;
                }[] | undefined;
            }[] | undefined;
            json: string | undefined;
        }[] | undefined;
        cardsShown: boolean;
        rawChoose: string;
        problems: string[];
        overtime: string | undefined;
        canSave: boolean;
        tabs?: Record<string, import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.Tab>;
    }>;
}
/** M32d step 4: what "Offer as a roll bonus" asks for, as an entry on the activity (the activity its cost) */
export interface RollBonusOffer {
    label: string;
    rolls: string[];
    when: "before" | "after";
    for: "self" | "allies" | "enemies" | "anyone";
    range: number;
    effect: "add" | "reroll" | "advantage";
    formula: string;
}
export declare function rollBonusEntry(activityId: string, offer: RollBonusOffer, id: string): Entry;
/** Asks how the activity is offered as a roll bonus, adds that entry to it, and opens the editor on it */
export declare function offerAsRollBonus(activity: EntryDocument & {
    id?: string | null;
}): Promise<void>;
/** The editor's header button on item, effect and activity sheets (GMs and the document's owners) */
export declare function registerEntryEditorControls(): void;
export {};
