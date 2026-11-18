/**
 * The dnd5e roll field that replaces an old midi fail/success/min/max flag (given without "flags.midi-qol."), as a full
 * system path, or undefined if the flag has no single dnd5e equivalent (fail.all, fail.ability.all, fail.save.school.<school>).
 */
export declare function rollFieldForFlag(flag: string): string | undefined;
/**
 * DAE field mappings from the old midi flags to the dnd5e roll fields that replace them. DAE applies an effect's old key to
 * the new field and reports the deprecation; min and max keep the strongest value, as midi's flags did.
 */
export declare function rollFieldMappings(abilities: string[], skills: string[], tools: string[]): Record<string, {
    key: string;
    type: string;
}>;
/** A readable name for a roll field's fail/success (with or without "system."), e.g. "Fail (Dexterity Saves)". */
export declare function rollFieldName(field: string): string | undefined;
/** Names for every roll field's fail and success, keyed by full system path, for DAE's localization map. */
export declare function rollFieldLocalizations(): Record<string, {
    name: string;
    description: string;
}>;
