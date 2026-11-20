import type { Workflow } from "../Workflow.js";
import type { Activity } from "../../globals.js";
export type ChoiceKind = "damageType" | "option" | "ability" | "skill" | "creatureType" | "number" | "allocate" | "targets";
export type ChoiceValue = string | number | string[] | Record<string, number>;
export interface ChoiceDeclaration {
    id: string;
    label?: string;
    kind: ChoiceKind;
    options?: (string | {
        value: string;
        label?: string;
    })[];
    /** Options from the use: the damage parts' types; the activity's effects (the chosen one is the one applied) */
    source?: "partTypes" | "effects";
    default?: ChoiceValue;
    min?: number;
    max?: number | string;
    /** allocate: a formula over the activity's roll data ("2 + @item.level") */
    total?: string;
    /** M15: kept per actor (declared now, not acted on) */
    remember?: "standing";
}
/** One stored answer (a list: ids may have dots, which an update reads as a path) */
export interface StoredChoice {
    id: string;
    value: ChoiceValue;
}
/** The activity's declarations that are well formed */
export declare function choiceDeclarations(activity: Activity | undefined | null): ChoiceDeclaration[];
interface Option {
    value: string;
    label: string;
}
/** The options of a list-like choice */
export declare function choiceOptions(declaration: ChoiceDeclaration, workflow: Workflow): Option[];
/** A value is one this declaration can take (supplied values are checked, not trusted) */
export declare function validChoice(declaration: ChoiceDeclaration, value: unknown, workflow: Workflow): value is ChoiceValue;
/**
 * The Choices step's work: the activity's choices answered and stored on the use. False when the user closed the
 * dialog (the use is abandoned).
 */
export declare function resolveChoices(workflow: Workflow): Promise<boolean>;
/** dnd5e's own damage type picks: the first damage roll whose part offered several types */
export declare function rolledDamageTypeChoice(workflow: Workflow): string | undefined;
/** A damage type choice from the parts' types sets the roll's type, as dnd5e's picker would; true if one did */
export declare function applyDamageTypeChoice(workflow: Workflow, rolls: {
    options?: Record<string, unknown>;
}[]): boolean;
/** The effect a `source: "effects"` choice chose, if the activity has one answered */
export declare function chosenEffectId(workflow: Workflow): string | undefined;
export {};
