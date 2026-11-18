import { RollModifierTracker } from "../lib/RollModifierTracker.js";
import { MidiOptions } from "../utils.js";
import { Activity } from "../../globals.js";
export declare let MidiAttackSheet: ReturnType<typeof defineMidiAttackSheetClass>;
export declare let MidiAttackActivity: ReturnType<typeof defineMidiAttackActivityClass>;
export declare function setupAttackActivity(): void;
declare let defineMidiAttackSheetClass: (baseClass: any) => {
    new (): {
        [x: string]: any;
        _prepareEffectContext(context: any): Promise<any>;
        _prepareSubmitData(event: any, formData: any): any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
    };
    PARTS: any;
    DEFAULT_OPTIONS: any;
};
declare let defineMidiAttackActivityClass: <T extends Activity>(ActivityClass: T) => any;
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
export {};
