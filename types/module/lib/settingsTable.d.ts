export interface MidiSettingEntry {
    group: string;
    label?: string;
    hint?: string;
    /** The settings panel's context name for the choices (a `selectOptions` in its template) */
    choices?: string;
    /** Edited by its own window, not a panel field */
    editor?: string;
}
export declare const MIDI_SETTINGS: Record<string, MidiSettingEntry>;
