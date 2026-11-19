/** "min" / "average" / "max", or a position in the die's range: 0 the lowest face, 1 the highest */
export type FixedDice = "min" | "average" | "max" | number;
/** The uniform value whose face is `value` on any die */
export declare function uniformFor(value: FixedDice): number;
/** Once, at init */
export declare function installFixedDice(): void;
/** Run `fn` with every die fixed (nothing fixed when `value` is undefined) */
export declare function withFixedDice<T>(value: FixedDice | undefined, fn: () => Promise<T>): Promise<T>;
