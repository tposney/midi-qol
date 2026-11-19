import { RollModifierTracker } from "../lib/RollModifierTracker.js";
import { MidiOptions } from "../utils.js";
export declare function setupAttackActivity(): void;
/**
 * Compute attack advantage/disadvantage from actor flags and target grants flags.
 * This handles the flag-based advantage checks for attacks.
 * Special rules (flanking, invisible, nearby foe, heavy weapons) are handled separately in Workflow.
 *
 * @param actor - The attacking actor
 * @param actionType - The action type (mwak, rwak, msak, rsak, etc.)
 * @param options - MidiOptions including workflow, target info
 * @param abilityId - Optional ability ID for ability-based attack flags (e.g., "str", "dex")
 * @param tracker - Optional existing RollModifierTracker to populate
 * @returns RollModifierTracker with attack advantage attribution
 */
export declare function computeAttackAdvantage(actor: Actor.Implementation, actionType: string, options: MidiOptions, abilityId?: string, tracker?: RollModifierTracker): Promise<RollModifierTracker>;
/** The label of dnd5e's combined roll bonus term (its `@ruleBonus` part), which rollBonusSources breaks down. */
export declare function rollBonusLabel(): string;
/**
 * dnd5e's attack roll parts (getAttackData: `@mod`, `@prof`, `@bonus`, …) with a label in brackets, which each
 * evaluated term keeps as its flavor. Parts that aren't one of these references are left as they are.
 */
export declare function labelAttackParts(parts: string[], ability: string | undefined): string[];
/**
 * The effects behind dnd5e's combined roll bonus for this attack (`@ruleBonus`: the attack roll bonuses for the
 * ability, all attacks and the action type), each with its own value resolved against the actor's data. Only adding
 * changes have a value of their own; an override or custom change is listed without one.
 */
export declare function rollBonusSources(activity: any, ability: string | undefined, actionType: string | undefined): Array<{
    label: string;
    value?: string;
    img?: string;
}>;
