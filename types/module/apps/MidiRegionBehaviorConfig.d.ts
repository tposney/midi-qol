/**
 * Custom RegionBehaviorConfig sheet for the midi-qol.regionActivity behavior type.
 *
 * The default RegionBehaviorConfig skips the `rules` ArrayField because ArrayField
 * has no `hasFormSupport`. This subclass renders the standard simple fields via the
 * parent's `_getFields()` and adds a dynamic rules section with add/remove rows.
 * Each rule has trigger/action selects and a `<document-tags single>` element for
 * the target UUID (native drag-and-drop support).
 *
 * Rules are maintained as a local working copy (_workingRules) and only persisted
 * to the document on form submit via _prepareSubmitData.
 */
declare const RegionBehaviorConfig: typeof import("fvtt-types/src/foundry/client/applications/sheets/region-behavior-config.mjs").default;
export declare class MidiRegionBehaviorConfig extends RegionBehaviorConfig {
    #private;
    /** Local working copy of rules, synced from document on first render. */
    _workingRules: Array<{
        trigger: string;
        action: string;
        targetUuid: string;
    }>;
    static DEFAULT_OPTIONS: {
        classes: string[];
        window: {
            contentClasses: string[];
            icon: string | undefined;
        };
        position: {
            width: number;
        };
        form: {
            closeOnSubmit: boolean;
        };
        actions: {
            addRule: typeof MidiRegionBehaviorConfig.__#401@#onAddRule;
            deleteRule: typeof MidiRegionBehaviorConfig.__#401@#onDeleteRule;
        };
    };
    static PARTS: {
        form: {
            template: string;
            scrollable: string[];
        };
        footer: {
            template: string;
        };
    };
    _prepareContext(options: any): Promise<any>;
    /**
     * Collect rules data from the working copy and merge into the submit data
     * so the rules ArrayField is properly updated on save.
     */
    _prepareSubmitData(event: SubmitEvent, form: HTMLFormElement, formData: any, updateData?: any): Record<string, any>;
}
export {};
