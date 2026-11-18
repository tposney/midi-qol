/**
 * MidiQOL.contestedRoll, and an example of a card note drawn by its own renderer, written only against the card note
 * API as another module would be (cardNotes.ts): the note's data says who rolls what, its two checks are its messages
 * (roles source/target), and it is drawn per viewer as each check, or who is still to roll, then the result from the
 * checks' current totals. On a card that can't draw notes (stored markup) the note is shown on its own in the log.
 */
import { TokenOrDocument } from "../../globals.js";
export declare const CONTEST_NOTE_KIND = "midi-qol.contest";
export type ContestNoteData = {
    flavor: string;
    sides: Record<"source" | "target", {
        name: string;
        uuid?: string;
        label: string;
    }>;
    /** A roll was never made. */
    incomplete?: boolean;
};
export declare function setupContestNote(): void;
export declare function contestedRoll(data: {
    source: {
        rollType: string;
        ability: string;
        token: TokenOrDocument | string;
        rollOptions: any;
    };
    target: {
        rollType: string;
        ability: string;
        token: TokenOrDocument | string;
        rollOptions: any;
    };
    displayResults: boolean;
    itemCardUuid: string;
    flavor: string;
    rollOptions: any;
    success: (results: any) => {};
    failure: (results: any) => {};
    drawn: (results: any) => {};
}): Promise<{
    result: number | undefined;
    rolls: any[];
}>;
