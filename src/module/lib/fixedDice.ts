/*
 * Fixed dice for a use (M25): every die rolled while a use with `workflowOptions.fixedDice` is executing shows the
 * face asked for. Foundry 14 takes every face from CONFIG.Dice.randomUniform (DiceTerm#randomFace: ceil((1 - u) *
 * faces)) and has no per-roll seed, so midi installs one randomUniform that answers fixed values while a fixed use is
 * executing and Foundry's generator otherwise. Code that sets CONFIG.Dice.randomUniform itself (tests) replaces and
 * restores this one.
 */

/** "min" / "average" / "max", or a position in the die's range: 0 the lowest face, 1 the highest */
export type FixedDice = "min" | "average" | "max" | number;

const active: FixedDice[] = [];

/** The uniform value whose face is `value` on any die */
export function uniformFor(value: FixedDice): number {
  if (value === "max") return 0;
  if (value === "average") return 0.5;
  const position = value === "min" ? 0 : Math.min(1, Math.max(0, value));
  // ceil(position * faces): the lowest face for 0
  return Math.min(1 - 1e-9, 1 - Math.max(position, 1e-9));
}

let installed = false;

/** Once, at init */
export function installFixedDice(): void {
  if (installed) return;
  installed = true;
  const original = CONFIG.Dice.randomUniform;
  CONFIG.Dice.randomUniform = () => {
    const value = active.at(-1);
    return value === undefined ? original() : uniformFor(value);
  };
}

/** Run `fn` with every die fixed (nothing fixed when `value` is undefined) */
export async function withFixedDice<T>(value: FixedDice | undefined, fn: () => Promise<T>): Promise<T> {
  if (value === undefined) return fn();
  active.push(value);
  try {
    return await fn();
  } finally {
    active.pop();
  }
}
