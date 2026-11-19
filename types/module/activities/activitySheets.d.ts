import type { AnyMutableObject } from "fvtt-types/utils";
import { type MidiActivity } from "./MidiActivityMixin.js";
/** The sheet's activity: dnd5e's members midi's sheet code calls */
type SheetActivity = MidiActivity & {
    update(changes: object): Promise<unknown>;
    target?: MidiActivity["target"] & {
        override?: boolean;
    };
};
/** An activity sheet as midi reads and changes it */
export interface ActivitySheetApp {
    activity: SheetActivity;
    item: Item.Implementation;
    element: HTMLElement;
    tabGroups: Record<string, string>;
    _markTabs(tabs: Record<string, object>): Record<string, Record<string, unknown>>;
}
/** A type's own sheet additions */
export interface SheetExtras {
    /** midi's effect part: its template and the partials it adds to dnd5e's */
    effect?: {
        template: string;
        templates: string[];
    };
    /** Keep dnd5e's activation part (Forward has no time or targeting) */
    keepActivation?: boolean;
    /** The sheet's CSS classes (replacing dnd5e's, as midi's sheet class did) */
    classes?: string[];
    /** Data for the type's parts, added before they are drawn */
    context?: (app: ActivitySheetApp, context: AnyMutableObject) => void;
}
export declare function registerSheetExtras(type: string, extras: SheetExtras): void;
/** midi's parts, actions and clean arrays on the sheet classes of `types`; the hooks that add its tab and data */
export declare function installActivitySheets(types: Iterable<string>): void;
export {};
