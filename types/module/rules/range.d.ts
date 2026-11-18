/** normal: within range; long: beyond range but within long range (disadvantage); beyond: out of reach. */
export type RangeBand = "normal" | "long" | "beyond";
/** Where a distance falls for a range and long range (0: no long range). */
export declare function rangeBand(distance: number, range: number, longRange: number): RangeBand;
/**
 * A range in the activity's units expressed in the scene's grid units: miles to feet or yards, kilometres to metres.
 * Other combinations are left as they are (the units are assumed to match).
 */
export declare function rangeInGridUnits(value: number, activityUnits: string | undefined, gridUnits: string | undefined): number;
