/**
 * Midi-qol specific completions injected into macro-autocomplete via hook.
 *
 * Registers a "macro-autocomplete.ready" hook handler that injects:
 * - MidiQOL namespace (all API functions)
 * - workflow top-level variable (tracker, targets, hitTargets, etc.)
 * - scope midi-specific fields (workflow, macroPass, hitTargets, etc.)
 * - args[0] midi-specific info
 */
/**
 * Inject midi-qol completions into macro-autocomplete.
 * Called at module load time. Registers a handler for
 * "macro-autocomplete.ready" which fires when macro-autocomplete initializes.
 *
 * Foundry's Macro#executeScript destructures {speaker, actor, token} from scope
 * and spreads remaining scope keys as additional top-level variables.
 * So actor/token/speaker are already provided by core - midi doesn't re-add them.
 * But item, activity, workflow, etc. are spread from scope and available as top-level vars.
 */
export declare function injectMidiCompletions(): void;
