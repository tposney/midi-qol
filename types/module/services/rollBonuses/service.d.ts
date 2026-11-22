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
    /** Contract 4 (13a point 6): dnd5e's roll process, dialog and message config of the roll (live: read, don't keep) */
    rollConfig?: {
        config: object;
        dialog: object;
        message: object;
    };
}
export interface BonusContext {
    query: RollBonusQuery;
    phase: BonusPhase;
    roll: Roll;
    outcome?: Outcome;
    /** Contract 4: what was chosen in the prompt for this bonus (its scaling, inputs, damage type, targets) */
    selection?: BonusSelection;
}
/** Contract 4: an input shown with a bonus in the prompt */
export interface BonusInput {
    name: string;
    label: string;
    /** multi: several of its options (CAT's comboboxMulti), its value a list */
    type: "number" | "select" | "multi" | "checkbox" | "text";
    options?: readonly {
        value: string;
        label: string;
    }[];
    default?: string | number | boolean | readonly string[];
    min?: number;
    max?: number;
}
/** Contract 4: what the player chose for a bonus in the prompt */
export interface BonusSelection {
    scaling?: number;
    inputs: Record<string, string | number | boolean | readonly string[]>;
    damageType?: string;
    /** Token document uuids picked (targeting) */
    targets: string[];
}
/** Contract 4: configure's answer for a selection: the bonus as it now is */
export interface BonusConfigured {
    effect?: BonusEffect;
    cost?: BonusCost;
    /** The row's label (the formula as configured) */
    label?: string;
    /** Why it can't be taken with this selection */
    disabled?: string;
    /** How many creatures it may pick now (CAT's target scaling) */
    maxTargets?: number;
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
    /** Applies the bonus itself, in place of its effect (a macro value, a flag's own behaviour): returns the new roll. */
    apply?: (ctx: BonusContext, rollData: object) => Promise<Roll>;
    /** The prompt's icon for it (HTML), in place of the default die. */
    iconHTML?: string;
    /** Shown with it in the prompt (its tooltip) */
    description?: string;
    /**
     * postResult: on which result it is offered: "failure" (a miss, a failed save), "success" (a hit: a reaction to an
     * enemy's success) or "any". Absent: as before (the roll's after-result ask, which opens on a failure).
     */
    when?: "failure" | "success" | "any";
    /** Whose resources pay for it (an actor uuid), when not the roller's: a bonus spent by someone else */
    spender?: string;
    /** A damage add whose type is chosen when it is taken: the types offered (one: that type) */
    damageTypes?: readonly string[];
    /**
     * Damage: it reacts to the dice rolled, so it is offered after the damage roll (M15 5d). Without it a damage add is
     * chosen before the roll and becomes part of it (dnd5e doubles its dice on a critical, keeps its type).
     */
    needsRoll?: boolean;
    /** Contract 4: spent at a level from `min` (default 1) to `max`; the formula reads it as `@bonus.scaling` */
    scaling?: {
        max: number;
        min?: number;
        label?: string;
    };
    /** Contract 4: inputs shown with it; the formula reads them as `@bonus.inputs.<name>` */
    inputs?: readonly BonusInput[];
    /**
     * Contract 4: the player picks up to `max` creatures: from `candidates` (token document uuids, such as the attack's
     * hit targets) when given, else those within `range` feet of the roller, by disposition to it
     */
    targeting?: {
        max: number;
        candidates?: readonly string[];
        range?: number;
        disposition?: "ally" | "enemy" | "any";
        self?: boolean;
    };
    /** Contract 4: the bonus for a selection, asked as the player changes it (CAT's updateScaling and input formulas) */
    configure?: (selection: BonusSelection, ctx: BonusContext) => BonusConfigured | undefined | Promise<BonusConfigured | undefined>;
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
/**
 * What rollBonuses reads from a candidate, by version: 1 the M1 fields; 2 (M15 stage 3a) chosen bonuses applied in
 * orderForApplication order, a damage `add` with its own damageType or critical as its own damage roll; 3 (stage 3d)
 * `apply`, `iconHTML`, `description`, `when`, `spender`, `damageTypes`; 4 (M32b) `scaling`, `inputs`, `targeting`,
 * `configure`, the selection on the context, a prompt provider's `ask` answering `{ id, selection }`.
 */
export declare const ROLL_BONUSES_CONTRACT = 4;
/** Whether a candidate is offered for this result after the roll (its `when`) */
export declare function offeredForResult(candidate: {
    when?: "failure" | "success" | "any";
}, phase: BonusPhase, outcome: Outcome | undefined): boolean;
/**
 * The damage type a damage add with several types is taken as: the roller's remembered type (M15 5e) while it is one
 * of the types, else asked, with "Remember this choice"
 */
export declare function chooseDamageType(types: readonly string[], label: string, actor?: Actor.Implementation, rememberKey?: string): Promise<string | undefined>;
export declare function defineRollBonusesService(): void;
/** A contributor's candidate, its id prefixed with the contributor's. */
export type OfferedBonus = BonusCandidate & {
    contributor: string;
    /** Contract 4: the prompt's selection, the bonus already configured for it */
    selection?: BonusSelection;
    /** A flags.midi-qol.optional bonus: its flag (a flag can offer two values, both withdrawn when one is used) and its name */
    flagKey?: string;
    flagLabel?: string;
};
/** Asks every contributor for the roll's candidates for `phase`, keeping those valid now and affordable. */
export declare function collectBonusCandidates(query: RollBonusQuery, phase: BonusPhase, roll: Roll, outcome?: Outcome): Promise<OfferedBonus[]>;
/**
 * A d20 roll given advantage or disadvantage after it was rolled: a copy whose d20 has a second die (rolled now if it
 * has one) and keeps the higher (advantage) or lower; the other mode already on it cancels to the first die.
 */
export declare function applyRollMode(roll: Roll, mode: "advantage" | "disadvantage"): Promise<Roll>;
export declare function applyBonusEffect(roll: Roll, effect: BonusEffect, rollData: object, label: string): Promise<Roll>;
/**
 * Spends a declared cost from `actor`: actions through midi's economy markers, item/activity uses, spell slots, an
 * attribute, hit dice. effectCount and oncePer are midi-flag bookkeeping (the flags spend their own); material is not
 * spent (reported).
 */
export declare function spendBonusCost(actor: Actor.Implementation, cost: BonusCost | undefined, label: string): Promise<void>;
/** Applies a bonus and runs its onChosen; a failure is reported and leaves the roll unchanged. */
export declare function applyOfferedBonus(bonus: OfferedBonus, ctx: BonusContext, rollData: object): Promise<Roll>;
