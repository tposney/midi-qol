import { defineService } from "../../api/services.js";
export interface DamageContributionQuery {
    workflow: any;
    actor: Actor.Implementation;
    item?: Item.Implementation;
    activity?: unknown;
}
export interface DamageContribution {
    /** Its message's role (flags.midi-qol.damage.role): the contributing module's id, or one it names. */
    role: string;
    /** Rolled with the use's roll data. */
    formula: string;
    damageType?: string;
    label: string;
    /** Only these targets (token document uuids); all the use hits when omitted. */
    targets?: readonly string[];
}
export interface DamageContributor {
    for(query: DamageContributionQuery): readonly DamageContribution[] | undefined | Promise<readonly DamageContribution[] | undefined>;
}
declare module "../../api/services.js" {
    interface MidiServices {
        damageContributions: DamageContributor;
    }
}
export declare let damageContributionsService: ReturnType<typeof defineService<DamageContributor>>;
export declare function defineDamageContributionsService(): void;
/** Every contributor's contributions for a use (a failing contributor is reported and skipped). */
export declare function collectDamageContributions(query: DamageContributionQuery): Promise<{
    contributor: string;
    contribution: DamageContribution;
}[]>;
