import type { Activity } from "../../globals.js";
import { defineService } from "../api/services.js";
import type { Workflow } from "../Workflow.js";
import type { RollModifierTracker } from "../lib/RollModifierTracker.js";
import { RollKind, RollModifier } from "../rules/rollModifiers.js";
export type { RollKind, RollModifier, RollModifierEffect } from "../rules/rollModifiers.js";
export interface RollQuery {
    kind: RollKind;
    actor: Actor.Implementation;
    /** The roller's token, when midi knows it (attacks). */
    token?: TokenDocument.Implementation;
    /** For an attack: the target it is checked against (the first target). */
    target?: TokenDocument.Implementation;
    activity?: Activity;
    item?: Item.Implementation;
    ability?: string;
    skill?: string;
    tool?: string;
    /** The workflow the roll belongs to, if any. */
    workflow?: Workflow;
}
export interface RollModifierContributor {
    for(query: RollQuery): readonly RollModifier[] | undefined | Promise<readonly RollModifier[] | undefined>;
}
declare module "../api/services.js" {
    interface MidiServices {
        rollModifiers: RollModifierContributor;
    }
}
export declare let rollModifiersService: ReturnType<typeof defineService<RollModifierContributor>>;
export declare function defineRollModifiersService(): void;
/** Asks every contributor about the roll and puts their answers on the tracker. A contributor that throws is skipped. */
export declare function collectRollModifiers(query: RollQuery, tracker: RollModifierTracker): Promise<void>;
