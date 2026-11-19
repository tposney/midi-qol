/**
 * Waits on players: a save, check, reaction or bonus a workflow is waiting for a player to answer. The client running
 * the workflow (the holder) keeps each wait and how to settle it; the GMs are told about it and show it in the player
 * list (playerWaitsUI.ts), where a GM can answer for the player. Players are told only who is waiting on what kind of
 * prompt: their own waits always (their badge brings their prompts forward), everyone's with playerWaitShowPlayers. The first answer wins: the player's, the GM's or the
 * timeout's. Other modules use the same API (MidiQOL.playerWaits) for their own prompts.
 */
/** midi's own kinds; other modules may use their own. */
export type WaitKind = "save" | "check" | "defence" | "reaction" | "bonus" | "contest" | (string & {});
/**
 * midi's own choices, with built-in labels: roll (rolled for the player), gmRoll (rolled on the GM's screen), choose
 * (the GM picks the reaction), none (no reaction), skip (no change). Other modules name their own and give a label.
 */
export type WaitChoice = "roll" | "gmRoll" | "choose" | "none" | "skip" | (string & {});
/** A choice's value, or its value and the label shown on its button (text or a localization key). */
export type WaitChoiceSpec<T> = (() => Promise<T> | T) | {
    label: string;
    value: () => Promise<T> | T;
};
export interface WaitSpec<T> {
    kind: WaitKind;
    /** The player the wait is for (who owns the creature). */
    userId: string;
    actorUuid?: string;
    /** The creature's token: its name is shown (the actor's name without it). */
    tokenUuid?: string;
    /** What is asked, e.g. "DEX save: Fireball" (text or a localization key). */
    label: string;
    /** The choices the GM can answer with, and the value each settles the wait with. The first is the default (used by
     *  "Answer pending prompts with defaults" and by a disconnect when it settles). */
    choices: Partial<Record<WaitChoice, WaitChoiceSpec<T>>>;
    /** Clean-up when the GM or a disconnect settles the wait (forget the request, close the player's dialog). */
    onSettled?: (choice: WaitChoice) => void;
    /** The module that registered it (shown to the GM). */
    source?: string;
    /** Leave the player's open roll dialog for the creature alone when settled (the choice uses it). */
    keepDialogs?: boolean;
    /** What began the wait (a workflow): its waits end with it (endPlayerWaitsOwnedBy). */
    owner?: object;
}
export interface WaitInfo {
    id: string;
    holderId: string;
    kind: WaitKind;
    userId: string;
    actorUuid?: string;
    actorName?: string;
    label: string;
    choices: {
        id: WaitChoice;
        label?: string;
    }[];
    startedAt: number;
    /** The player disconnected while it was pending: it waits for the GM. */
    offline: boolean;
    source?: string;
}
/** A wait begun with beginPlayerWait. */
export interface PlayerWait<T> {
    id: string;
    /** Pass to the player's client with the request, for claimPlayerWait. */
    ref: WaitRef;
    /** Settles when the GM (or a disconnect) answers, with the choice and its value; never if the wait ends otherwise. */
    settled: Promise<{
        choice: WaitChoice;
        value: T;
    }>;
    /** End the wait: the player answered, or it is no longer needed. */
    end: () => void;
    readonly active: boolean;
    /** The GM (or a disconnect) is answering: what the player's request returns now is to be ignored. */
    readonly answeredForPlayer: boolean;
}
/** Called whenever the waits this client knows about change. */
export declare function onPlayerWaitsChanged(listener: () => void): void;
export declare function knownPlayerWaits(): WaitInfo[];
declare function applyChange({ op, info }: {
    op: "add" | "update" | "remove";
    info: WaitInfo;
}): void;
/** What a request sent to a player carries so the player's client can claim the wait (claimPlayerWait). */
export type WaitRef = {
    id: string;
    holderId: string;
};
/**
 * Begin a wait on a player: the GM sees it in the player list and can answer for them with one of its choices. Returns
 * undefined for a GM (they answer on their own screen) or a spec without choices. End it when the player answers or it
 * is no longer needed; the GM's answer arrives through `settled`. The first answer wins: claim the wait (claimPlayerWait)
 * on the player's client before acting on their answer.
 */
export declare function beginPlayerWait<T>(spec: WaitSpec<T>): PlayerWait<T> | undefined;
/**
 * Track a request that waits on a player. `start` sends the request (given the wait's reference, undefined when it is
 * not tracked) and returns its promise. Returns a promise that settles with the player's answer, or with the value of
 * the choice the GM (or a disconnect) settles it with, whichever comes first.
 */
export declare function trackPlayerWait<T>(spec: WaitSpec<T>, start: (ref: WaitRef | undefined) => Promise<T>): Promise<T>;
/** dnd5e's roll dialogs open on this client for the actor; with `requestClaim`, only the one a request opened (lib/requests.ts). */
export declare function rollDialogsFor(actorUuid: string | null, requestClaim?: string): foundry.applications.api.ApplicationV2[];
/** Close dnd5e's roll dialogs open on this client for the actor (as cancelled; the roll is no longer wanted). */
export declare function _closePlayerRollDialogs({ actorUuid }: {
    actorUuid: string | null;
}): void;
/** End the waits an owner (a workflow) began and no longer needs: it was removed before they were answered. */
export declare function endPlayerWaitsOwnedBy(owner: object): void;
/** A wait of this client's own that its player may dismiss (a roll they won't make). */
export declare function ownDismissable(id: string): boolean;
/** Settle a wait on the client holding it. */
export declare function settlePlayerWait(id: string, choice: WaitChoice): Promise<boolean>;
export declare function _settlePlayerWait({ id, choice }: {
    id: string;
    choice: WaitChoice;
}): Promise<boolean>;
/**
 * Claim a wait for the player's own answer, before acting on it (using a reaction): false when the GM or a disconnect
 * has already settled it, so the player's answer is dropped.
 */
export declare function claimPlayerWait(ref: WaitRef | undefined): Promise<boolean>;
export declare function _claimPlayerWait({ id }: {
    id: string;
}): boolean;
/** A client that loaded after the waits began asks every client for theirs. */
export declare function _announcePlayerWaits(): void;
export declare function setupPlayerWaits(): void;
export declare const playerWaitHandlers: {
    playerWaitChanged: typeof applyChange;
    settlePlayerWait: typeof _settlePlayerWait;
    claimPlayerWait: typeof _claimPlayerWait;
    closePlayerRollDialogs: typeof _closePlayerRollDialogs;
    announcePlayerWaits: typeof _announcePlayerWaits;
};
export {};
