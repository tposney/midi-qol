/*
 * Fixed dice for a use (M25): every die rolled while a use with `workflowOptions.fixedDice` is executing shows the
 * face asked for. Foundry 14 maps every random draw to a face in DiceTerm#mapRandomFace (randomFace and the Mersenne
 * fulfilment method both go through it) and has no per-roll seed, so midi wraps mapRandomFace: a fixed face while a
 * fixed use is executing, the draw otherwise. Code that sets CONFIG.Dice.randomUniform itself (tests) changes the
 * draw only, so a fixed use still shows its faces.
 */

/** "min" / "average" / "max", or a position in the die's range: 0 the lowest face, 1 the highest */
export type DicePosition = "min" | "average" | "max" | number;

/** Faces per die size, in the order rolled (M23 test kit): `{ faces: { d20: [17, 4] }, rest: "average" }` */
export interface DiceScript {
  /** A face, or faces in the order rolled; past the last face the die follows `rest` */
  faces: Partial<Record<`d${number}`, number | number[]>>;
  /** Every other die (random when absent) */
  rest?: DicePosition;
}

export type FixedDice = DicePosition | DiceScript;

const active: FixedDice[] = [];
/** How many of each die size a script has given (a script object is one use's dice, across its runs) */
const given = new WeakMap<DiceScript, Map<number, number>>();

/** The uniform value whose face is `value` on any die */
export function uniformFor(value: DicePosition): number {
  if (value === "max") return 0;
  if (value === "average") return 0.5;
  const position = value === "min" ? 0 : Math.min(1, Math.max(0, value));
  // ceil(position * faces): the lowest face for 0
  return Math.min(1 - 1e-9, 1 - Math.max(position, 1e-9));
}

/** The scripted face for the next die of `faces` sides, if the script names one */
export function scriptedFace(script: DiceScript, faces: number): number | undefined {
  const planned = script.faces[`d${faces}`];
  if (planned === undefined) return undefined;
  const list = Array.isArray(planned) ? planned : [planned];
  let counts = given.get(script);
  if (!counts) given.set(script, counts = new Map());
  const index = counts.get(faces) ?? 0;
  if (index >= list.length) return undefined;
  counts.set(faces, index + 1);
  return list[index];
}

let installed = false;

type LibWrapperRegister = { register(packageId: string, target: string, fn: (...args: never[]) => unknown, type: string): unknown };

/** Once, at init */
export function installFixedDice(moduleId: string): void {
  const libWrapper = (globalThis as { libWrapper?: LibWrapperRegister }).libWrapper;
  if (installed || !libWrapper) return;
  installed = true;
  libWrapper.register(moduleId, "foundry.dice.terms.DiceTerm.prototype.mapRandomFace",
    function (this: foundry.dice.terms.DiceTerm, wrapped: (u: number) => number, u: number) {
      const value = active.at(-1);
      if (value === undefined) return wrapped(u);
      if (typeof value !== "object") return wrapped(uniformFor(value));
      const faces = this.faces ?? 0;
      const face = scriptedFace(value, faces);
      if (face !== undefined) return Math.min(faces, Math.max(1, Math.round(face)));
      return wrapped(value.rest === undefined ? u : uniformFor(value.rest));
    }, "MIXED");
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
