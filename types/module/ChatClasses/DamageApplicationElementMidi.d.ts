import { DamageApplicationOptions } from "../../globals.js";
export declare class DamageApplicationElementMidi extends globalThis.dnd5e.applications.components.DamageApplicationElement {
    #private;
    chatMessage: any;
    damages: any[];
    damageType: string;
    getTargetOptions(uuid: string): DamageApplicationOptions;
    calculateDamage(actor: Actor.Implementation, options: DamageApplicationOptions): {
        temp: any;
        total: any;
        active: any;
    };
}
