import { defineService } from "../../api/services.js";
/** "sight": the sight detection modes and blindsight; "all": every mode the observer has. */
export type SenseModes = "sight" | "all" | string[];
export interface SenseQuery {
    modes?: SenseModes;
    /** Check a token without sight as if it had sight, whatever Force vision when checking is set to. */
    forceVision?: boolean;
}
export interface PerceptionProvider {
    /**
     * Detection mode ids the observer senses the target with ([] = none), or undefined when it can't judge.
     * Token documents, as everywhere in midi's services; a provider that needs the canvas token reads `document.object`.
     */
    senses(observer: TokenDocument.Implementation, target: TokenDocument.Implementation, query: SenseQuery): string[] | undefined;
    /** Whether a hiding target is hidden from the observer; runs inside detection tests, so it must not change either token. */
    hiddenFrom?(target: TokenDocument.Implementation, observer: TokenDocument.Implementation): boolean | undefined;
    imprecise?(modeId: string): boolean | undefined;
}
/** midi's provider always answers */
interface MidiPerceptionProvider extends PerceptionProvider {
    senses(observer: TokenDocument.Implementation, target: TokenDocument.Implementation, query: SenseQuery): string[];
    hiddenFrom(target: TokenDocument.Implementation, observer: TokenDocument.Implementation): boolean;
    imprecise(modeId: string): boolean;
}
export declare const midiPerception: MidiPerceptionProvider;
declare module "../../api/services.js" {
    interface MidiServices {
        perception: PerceptionProvider;
    }
}
export declare let perceptionService: ReturnType<typeof defineService<PerceptionProvider>> | undefined;
export declare function definePerceptionService(): void;
export declare function sensesModes(observer: TokenDocument.Implementation, target: TokenDocument.Implementation, query: SenseQuery): string[];
export declare function isHiddenFrom(target: TokenDocument.Implementation, observer: TokenDocument.Implementation): boolean;
export declare function isImprecise(modeId: string): boolean;
export {};
