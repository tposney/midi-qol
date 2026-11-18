/**
 * The countdown on a midi dialog that answers itself when time runs out (reactions, optional bonuses, effect choice):
 * a bar under the window header that drains from green to red, the seconds left, and a button to pause it when the
 * user needs more time. One timer owns the expiry, so pausing really stops it.
 */
export interface CountdownOptions {
    /** Seconds before the dialog answers itself; 0 or less: no countdown. */
    seconds: number;
    /** Time ran out. */
    onExpire: () => void;
    /** The user paused or resumed it (e.g. pause the matching timer on the client waiting for the answer). */
    onPause?: (paused: boolean) => void;
}
export declare class DialogCountdown {
    #private;
    readonly id: string;
    constructor(options: CountdownOptions);
    get paused(): boolean;
    get secondsLeft(): number;
    /** `notify` false: the requester paused it (lib/requests.ts), so onPause isn't told again. */
    pause(notify?: boolean): void;
    resume(notify?: boolean): void;
    /** Show the time another client's deadline has left (it owns the expiry: lib/requests.ts). */
    sync(remainingMs: number): void;
    /** The dialog was answered or closed: no more ticking, and no expiry. */
    stop(): void;
    /** Show the countdown at the top of the dialog's content (again after a re-render). */
    attach(dialog: HTMLElement | null | undefined): void;
}
/**
 * Show this countdown on a dnd5e roll dialog opened later (a save the player is asked for): pass the result as the roll's
 * `dialog.options`, which dnd5e hands to the dialog. Works for any roll configuration dialog (dnd5e's or midi's).
 */
export declare function dialogCountdownOptions(countdown: DialogCountdown): {
    midiCountdownId: string;
};
export declare function setupDialogCountdowns(): void;
