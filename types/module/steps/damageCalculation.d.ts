export type DamageCalculationPhase = "pre" | "calculate";
/** The setting: DRSaveDr = DR, then saves; SaveDRDr = saves, then DR (both before resistances); SaveDrDR = saves, then DR after resistances. */
export type SaveDROrder = "DRSaveDr" | "SaveDRDr" | "SaveDrDR" | string;
/** A step's run: false cancels the damage application. */
export type DamageCalculationRun<P> = (params: P) => boolean | void;
/** The steps of each phase, in order, for a save / DR order. */
export declare function damageCalculationOrder(phase: DamageCalculationPhase, order: SaveDROrder): string[];
/** Register (or replace, by id) a damage calculation step. */
export declare function registerDamageCalculationStep<P>(id: string, run: DamageCalculationRun<P>): void;
/** A registered step's run (to wrap or restore it). */
export declare function getDamageCalculationStep<P>(id: string): DamageCalculationRun<P> | undefined;
/** Turn a step off: it is skipped. */
export declare function removeDamageCalculationStep(id: string): boolean;
/** Runs a phase's steps in order; false when one cancels. Unregistered steps are skipped. */
export declare function runDamageCalculation<P>(phase: DamageCalculationPhase, order: SaveDROrder, params: P): boolean;
