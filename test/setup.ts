/*
 * The few Foundry globals code under test touches, as stand-ins. Code meant to be pure (src/module/rules) must not
 * need them: test/purity.test.ts checks that.
 */
type Listener = (...args: unknown[]) => unknown;

const listeners = new Map<string, Listener[]>();
export const hookCalls: { hook: string, args: unknown[] }[] = [];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

/** As foundry.utils.deepClone: plain objects and arrays are copied; anything else (functions, classes) is kept. */
function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as T;
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepClone(v)])) as T;
  return value;
}

/** foundry.utils.mergeObject for plain objects: `inplace` and deep merge only. */
function mergeObject(original: Record<string, unknown>, other: Record<string, unknown> = {}, { inplace = true } = {}) {
  const target = inplace ? original : deepClone(original);
  for (const [key, value] of Object.entries(other)) {
    target[key] = isPlainObject(value) && isPlainObject(target[key])
      ? mergeObject(target[key] as Record<string, unknown>, value, { inplace: false })
      : value;
  }
  return target;
}

Object.assign(globalThis, {
  Hooks: {
    on: (hook: string, fn: Listener) => { listeners.set(hook, [...(listeners.get(hook) ?? []), fn]); },
    callAll: (hook: string, ...args: unknown[]) => {
      hookCalls.push({ hook, args });
      for (const fn of listeners.get(hook) ?? []) fn(...args);
      return true;
    },
  },
  foundry: { utils: { mergeObject, isEmpty: (v: object) => Object.keys(v ?? {}).length === 0 } },
});
