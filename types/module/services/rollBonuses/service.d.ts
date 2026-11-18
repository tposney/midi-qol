import type { Activity } from "../../../globals.js";
import { defineService } from "../../api/services.js";
import type { Workflow } from "../../Workflow.js";
import { type BonusCost, type BonusEffect, type BonusPhase, type BonusRollKind, type Outcome } from "./rules.js";
export type { BonusCost, BonusEffect, BonusPhase, BonusRollKind, Outcome } from "./rules.js";
export interface RollBonusQuery {
    kind: BonusRollKind;
    actor: Actor.Implementation;
    token?: TokenDocument.Implementation;
    /** Attack: the target (single target only). */
    target?: TokenDocument.Implementation;
    workflow?: Workflow;
    activity?: Activity;
    item?: Item.Implementation;
    /** mwak, rsak, save, heal... */
    actionType?: string;
    /** Saves and checks: the ability; skills: the skill (when the roll names one). */
    ability?: string;
    skill?: string;
    tool?: string;
}
export interface BonusContext {
    query: RollBonusQuery;
    phase: BonusPhase;
    roll: Roll;
    outcome?: Outcome;
}
export interface BonusCandidate {
    /** Unique within the contributor; midi prefixes the contributor's id. */
    id: string;
    label: string;
    img?: string;
    phases: readonly BonusPhase[];
    effect: BonusEffect;
    /** False: applied without asking. */
    optional: boolean;
    priority?: number;
    /** Declared costs; a candidate whose cost does not fit what is available is not offered. midi spends them when chosen. */
    cost?: BonusCost;
    /** Its onChosen spends the cost itself (as CAT's bonuses do): midi only checks it. */
    spendsOwnCost?: boolean;
    /**
     * Damage only: the bonus is for these targets (token document uuids), not the whole roll. Its formula is rolled when
     * chosen and added to just those targets' damage (the damageModifiers bonus stage); the damage roll is unchanged.
     */
    targets?: readonly string[];
    /** Asked before the bonus is applied (a third party's consent); false or a throw: not applied. */
    approve?: (ctx: BonusContext) => boolean | Promise<boolean>;
    /** An actor whose player is asked (BONUS_APPROVAL_QUERY) before the bonus is applied. */
    approver?: string;
    /** Offered on a natural 1 (attack fumble). */
    onFumble?: boolean;
    /** True, or why it is not offered now. */
    validate?: (ctx: BonusContext) => true | string;
    /** After it was applied: its consumption and side effects. */
    onChosen?: (ctx: BonusContext & {
        roll: Roll;
    }) => Promise<void> | void;
}
export interface RollBonusContributor {
    /** Roll kinds it may offer bonuses for (a cheap filter); all when omitted. */
    kinds?: readonly BonusRollKind[];
    for(query: RollBonusQuery): readonly BonusCandidate[] | undefined | Promise<readonly BonusCandidate[] | undefined>;
}
declare module "../../api/services.js" {
    interface MidiServices {
        rollBonuses: RollBonusContributor;
    }
}
export declare let rollBonusesService: ReturnType<typeof defineService<RollBonusContributor>>;
export declare function defineRollBonusesService(): void;
/** A contributor's candidate, its id prefixed with the contributor's. */
export type OfferedBonus = BonusCandidate & {
    contributor: string;
};
/** Asks every contributor for the roll's candidates for `phase`, keeping those valid now and affordable. */
export declare function collectBonusCandidates(query: RollBonusQuery, phase: BonusPhase, roll: Roll, outcome?: Outcome): Promise<OfferedBonus[]>;
/** The roll after one bonus's effect, from the roll data of the use. */
export declare function applyBonusEffect(roll: Roll, effect: BonusEffect, rollData: object, label: string): Promise<Roll>;
/**
 * Spends a declared cost from `actor`: actions through midi's economy markers, item/activity uses, spell slots, an
 * attribute, hit dice. effectCount and oncePer are midi-flag bookkeeping (the flags spend their own); material is not
 * spent (reported).
 */
export declare function spendBonusCost(actor: Actor.Implementation, cost: BonusCost | undefined, label: string): Promise<void>;
/** Applies a bonus and runs its onChosen; a failure is reported and leaves the roll unchanged. */
export declare function applyOfferedBonus(bonus: OfferedBonus, ctx: BonusContext, rollData: object): Promise<Roll>;
