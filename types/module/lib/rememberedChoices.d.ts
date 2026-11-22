export interface RememberedChoice {
    key: string;
    value: unknown;
    /** The question, as the window lists it */
    label: string;
    /** The answer, as the window lists it */
    valueLabel?: string;
}
export declare function rememberedChoices(actor: Actor.Implementation | null | undefined): RememberedChoice[];
export declare function rememberedChoice(actor: Actor.Implementation | null | undefined, key: string): RememberedChoice | undefined;
export declare function rememberChoice(actor: Actor.Implementation, choice: RememberedChoice): Promise<void>;
export declare function forgetChoice(actor: Actor.Implementation, key: string): Promise<void>;
/** The key of an activity's declared choice: its item, the activity and the choice's id */
export declare function activityChoiceKey(activity: {
    id?: string | null;
    item?: {
        id?: string | null;
    };
} | undefined, choiceId: string): string;
/** The key of a bonus's damage type choice */
export declare function bonusDamageTypeKey(bonusKey: string): string;
/** The "Remember this choice" checkbox a prompt shows for a question */
export declare function rememberCheckbox(name: string): string;
