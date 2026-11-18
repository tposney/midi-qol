/*
 * Range bands and unit conversion for an activity's range. Pure: no Foundry globals.
 */

/** normal: within range; long: beyond range but within long range (disadvantage); beyond: out of reach. */
export type RangeBand = "normal" | "long" | "beyond";

/** Where a distance falls for a range and long range (0: no long range). */
export function rangeBand(distance: number, range: number, longRange: number): RangeBand {
  if ((longRange !== 0 && distance > longRange) || (distance > range && longRange === 0)) return "beyond";
  if (distance > range) return "long";
  return "normal";
}

/**
 * A range in the activity's units expressed in the scene's grid units: miles to feet or yards, kilometres to metres.
 * Other combinations are left as they are (the units are assumed to match).
 */
export function rangeInGridUnits(value: number, activityUnits: string | undefined, gridUnits: string | undefined): number {
  const grid = (gridUnits ?? "").toLocaleLowerCase();
  if (activityUnits === "mi") {
    if (["feet", "ft"].includes(grid)) return value * 5280;
    if (["yards", "yd", "yds"].includes(grid)) return value * 1760;
  }
  if (activityUnits === "km" && ["meter", "m", "meters", "metre", "metres"].includes(grid)) return value * 1000;
  return value;
}
