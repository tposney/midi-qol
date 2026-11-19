import { RollModifierTracker } from "../lib/RollModifierTracker.js";
import { MidiOptions } from "../utils.js";
import type { Activity, ActivityUseConfiguration } from "../../globals.js";
import { Workflow } from "../Workflow.js";
/** The Attack activity properties these functions read (midi's schema fields and its Attack getters, below) */
interface AttackActivityLike extends Activity {
    ability: string;
    attackMode?: string;
    ammunition?: string;
    ammunitionPerTarget?: string;
    attackRollPerTarget?: string;
    confirmAmmunition: {
        reason?: string;
        confirm: boolean;
        proceed: boolean;
    };
    requireAmmunition: boolean;
    getActionType?(attackMode?: string): string;
    update(data: object): Promise<unknown>;
    _ammunitionItem?: Item.Implementation;
    _ammunitionActivity?: Activity;
    _otherActivity?: Activity;
}
/**
 * A finished use's attack rolled again (its card's Attack button, or a macro's rollAttack) is a new use at its
 * targets, on a new card; the finished card loses its buttons. The new workflow is left on `usage.workflow`.
 */
export declare function attackAgain(activity: Activity, workflow: Workflow | undefined, event?: Event): Promise<ActivityUseConfiguration>;
/**
 * Attack per target: this use has placed its template, chosen and confirmed its targets and spent its cost. Each
 * target is attacked by its own use of a copy of this activity that targets only that creature, in turn; each card
 * is linked to this use's card (started inside its workflow). The copies spend no uses and repeat no reaction or
 * bonus action checks; ammunition is spent by their attack rolls as the activity's Ammunition setting says.
 */
export declare function attackEachTarget(activity: Activity, workflow: Workflow): Promise<void>;
/**
 * How many pieces of ammunition this attack roll spends, by the activity's Ammunition setting: by default one per
 * attack roll; one per use (a later target of an attack per target spends none); or one per target (each target's
 * own attack spends one, a single roll spends one for each of its targets).
 */
export declare function ammunitionToSpend(activity: AttackActivityLike, workflow: Workflow | undefined): number;
/** midi's attack roll and Attack's getters on dnd5e's Attack class; once, from setupActivities */
export declare function installAttackRolls(): void;
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
export {};
