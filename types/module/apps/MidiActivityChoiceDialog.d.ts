import { Activity } from "../../globals.js";
declare const ActivityChoiceDialog: any;
/** dnd5e's context for one choice; `uses` from dnd5e 6.1 */
type ActivityChoiceContext = {
    id: string;
    name: string;
    img: string;
    sort: number;
    uses?: {
        value: number;
        max: number;
    } | null;
};
export declare class MidiActivityChoiceDialog extends ActivityChoiceDialog {
    _prepareActivityContext: (activity: Activity) => ActivityChoiceContext;
    /** The item's offerable activities after midi's usability filter and the module prune hook.
     *  Returns the surviving choice contexts as dnd5e prepares them ({id, name, img, sort, uses}), sorted. Single source of truth
     *  for "which activities can be used" — shared by the dialog and the item-use entry points so the
     *  prompt-vs-autoselect-vs-skip decision matches exactly what the dialog would display. */
    static getActivities(item: Item.Implementation): Promise<ActivityChoiceContext[]>;
    /** Resolve the activity to use for an item, applying the prune hook exactly once:
     *  - 0 survivors  → null (caller should skip rolling the item)
     *  - 1 survivor   → that Activity directly, no dialog (unless chooseActivity forces the prompt)
     *  - 2+ survivors → render the picker and resolve to the chosen Activity (or null if dismissed) */
    static create(item: Item.Implementation, { chooseActivity, ...options }?: {
        chooseActivity?: boolean;
    } & Record<string, unknown>): Promise<any>;
    get item(): any;
    _prepareContext(options: any): Promise<any>;
}
export {};
