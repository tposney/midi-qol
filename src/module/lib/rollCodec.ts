/*
 * Rolls in what a query or request carries: sent as marked roll data, revived as Rolls of their own class
 * (Roll.fromData reads the class), so an answer that is a roll (a requested save) arrives as one, whichever client
 * rolled it. Anything else passes through unchanged.
 */

const MARK = "midiRoll";
const MAX_DEPTH = 6;

const isPlainObject = (value: unknown): value is Record<string, unknown> => foundry.utils.getType(value) === "Object";

/** For sending: each Roll as `{ midiRoll: data }` */
export function encodeRolls(value: unknown, depth = 0): unknown {
  if (value instanceof Roll) return { [MARK]: value.toJSON() };
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    const mapped = value.map(v => encodeRolls(v, depth + 1));
    return mapped.some((v, i) => v !== value[i]) ? mapped : value;
  }
  if (!isPlainObject(value)) return value;
  let out: Record<string, unknown> | undefined;
  for (const [key, v] of Object.entries(value)) {
    const mapped = encodeRolls(v, depth + 1);
    if (mapped !== v) (out ??= { ...value })[key] = mapped;
  }
  return out ?? value;
}

/** For receiving: each `{ midiRoll: data }` a Roll again */
export function decodeRolls(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    const mapped = value.map(v => decodeRolls(v, depth + 1));
    return mapped.some((v, i) => v !== value[i]) ? mapped : value;
  }
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === MARK && isPlainObject(value[MARK])) {
    try { return Roll.fromData(value[MARK] as never); } catch (err) { console.warn("midi-qol | a roll could not be revived", err); return value[MARK]; }
  }
  let out: Record<string, unknown> | undefined;
  for (const [key, v] of Object.entries(value)) {
    const mapped = decodeRolls(v, depth + 1);
    if (mapped !== v) (out ??= { ...value })[key] = mapped;
  }
  return out ?? value;
}
