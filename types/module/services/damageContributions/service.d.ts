import type { Workflow } from "../../Workflow.js";
import { defineService } from "../../api/services.js";
export interface DamageContributionQuery {
    workflow: Workflow;
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
    /**
     * M15 6b: false: never critical. Otherwise (default) it is critical exactly as the use's own damage roll is, with
     * the same rules (dnd5e's settings and midi's Critical Damage setting): Hex's die on a critical hit.
     */
    critical?: false;
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
