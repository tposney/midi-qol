import type { OfferedBonus } from "./service.js";
export type StandingChoice = "ask" | "always" | "critical" | "never" | "next";
export declare const STANDING_CHOICES: readonly StandingChoice[];
export interface StoredStanding {
    key: string;
    choice: StandingChoice;
    label: string;
}
/** A bonus's key across rolls: a flag by its name (all its values), any other by its candidate id */
export declare function standingKey(candidate: Pick<OfferedBonus, "id" | "flagKey">): string;
export declare function storedStandings(actor: Actor.Implementation | undefined): StoredStanding[];
export declare function standingChoice(actor: Actor.Implementation | undefined, key: string): StandingChoice;
/** Ask removes the record (the default) */
export declare function setStandingChoice(actor: Actor.Implementation, key: string, choice: StandingChoice, label: string): Promise<void>;
/**
 * The offered bonuses after the actor's standing choices: those still to ask, those to apply without asking, and the
 * ones armed for this roll only (reset to ask once applied).
 */
export declare function applyStandingChoices(actor: Actor.Implementation | undefined, optional: OfferedBonus[], critical: boolean): {
    ask: OfferedBonus[];
    apply: OfferedBonus[];
    armed: OfferedBonus[];
};
export declare const REACTION_CHOICES: readonly StandingChoice[];
export declare const ASK_ONLY_CHOICES: readonly StandingChoice[];
/** The choice for a reaction row, with "always"/"next" read as ask for a row that needs choices of its own */
export declare function reactionStanding(actor: Actor.Implementation | undefined, key: string, askOnly: boolean): StandingChoice;
export declare function standingChoiceOptions(choices: readonly StandingChoice[]): {
    value: StandingChoice;
    label: string;
}[];
/** A prompt's row controls: a change is stored on the actor (a row's own, `data-actor-uuid`, in a prompt with sections) */
export declare function wireStandingSelects(element: HTMLElement, actor: Actor.Implementation | undefined): void;
