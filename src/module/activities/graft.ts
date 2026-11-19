import { GameSystemConfig } from "../../midi-qol.js";

/*
 * midi's activity behaviour on dnd5e's own activity and sheet classes, instead of subclasses registered in
 * CONFIG.DND5E.activityTypes: CONFIG keeps dnd5e's classes (other modules extending or constructing them get midi's
 * behaviour, and dnd5e's own config entries are left as they are).
 *
 * midi's classes are still defined (a layer per type over dnd5e's class), then their members are installed on
 * dnd5e's class. Each layer's `super` is pointed at a snapshot of dnd5e's own members taken first, so a midi method
 * calling `super.use(...)` still reaches dnd5e's. Members are installed lowest layer first, so a type's own override
 * wins over the shared mixin's, as with the subclasses. midi's classes must not have instance #private members
 * (they only exist on objects the class constructed).
 *
 * Methods other modules wrap (`use`) are installed through libWrapper instead, as a chained OVERRIDE: midi's method
 * stays next to dnd5e's, a wrap registered before midi is kept (defineProperty would replace libWrapper's accessor
 * and drop it without a report), and a second override is reported as a conflict. midi's `super.use()` then continues
 * libWrapper's chain.
 *
 * Temporary: the roadmap's M10, M13 and M14 take the remaining members out, and this file goes with M14.
 */

/** Prototype methods installed through libWrapper when a path to the class is given. */
const WRAPPED_METHODS = ["use"];

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;
type LibWrapperLike = { register(packageId: string, target: string, fn: AnyFunction, type: string, options?: { chain?: boolean }): unknown };

// The `wrapped` of each call in progress, per object and method, for midi's super call to continue
const callsInProgress = new WeakMap<object, Map<string, AnyFunction[]>>();

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return !!value && (typeof value === "object" || typeof value === "function") && "then" in value && typeof value.then === "function";
}

/**
 * Installs `method` (midi's, from its layers) as `name` on the class at `path` through libWrapper. `snapshot` is what
 * midi's lowest layer has as super: its `name` is pointed at the chain's `wrapped` while a call is in progress.
 * False when libWrapper is absent or refuses (another package's override): the caller installs it directly.
 */
function installThroughLibWrapper(path: string, name: string, method: AnyFunction, snapshot: object): boolean {
  const libWrapper: LibWrapperLike | undefined = "libWrapper" in globalThis ? (globalThis as { libWrapper?: LibWrapperLike }).libWrapper : undefined;
  if (!libWrapper) return false;
  const original: unknown = Reflect.get(snapshot, name);
  const wrapper: AnyFunction = function (wrapped: unknown, ...args: unknown[]) {
    const self = this;
    if (typeof self !== "object" || self === null || typeof wrapped !== "function") return method.apply(self, args);
    const next = wrapped as AnyFunction;
    let byName = callsInProgress.get(self);
    if (!byName) callsInProgress.set(self, byName = new Map());
    const stack = byName.get(name) ?? [];
    byName.set(name, stack);
    stack.push(next);
    const done = () => { const index = stack.lastIndexOf(next); if (index >= 0) stack.splice(index, 1); };
    let result: unknown;
    try { result = method.apply(self, args); }
    catch (err) { done(); throw err; }
    if (!isThenable(result)) { done(); return result; }
    return Promise.resolve(result).finally(done);
  } as AnyFunction;
  try {
    libWrapper.register("midi-qol", `${path}.${name}`, wrapper, "OVERRIDE", { chain: true });
  } catch (err) {
    console.warn(`midi-qol | ${path}.${name} could not be registered with libWrapper (another module overrides it?); installed directly`, err);
    return false;
  }
  Object.defineProperty(snapshot, name, {
    configurable: true, writable: true,
    value: function (this: unknown, ...args: unknown[]) {
      const stack = typeof this === "object" && this !== null ? callsInProgress.get(this)?.get(name) : undefined;
      const next = stack?.[stack.length - 1];
      if (next) return next(...args);
      return typeof original === "function" ? original.apply(this, args) : undefined;
    }
  });
  return true;
}

type ClassLike = { prototype: object };

const SKIP_STATICS = new Set(["prototype", "name", "length"]);

function layers(top: ClassLike, base: ClassLike): { protos: object[], ctors: object[] } {
  const protos: object[] = [];
  let proto: object | null = top.prototype;
  while (proto && proto !== base.prototype) {
    protos.unshift(proto);
    proto = Object.getPrototypeOf(proto);
  }
  if (proto !== base.prototype) throw new Error("midi-qol | graft: the class does not extend the one it is installed on");
  const ctors: object[] = [];
  let ctor: object | null = top;
  while (ctor && ctor !== base) {
    ctors.unshift(ctor);
    ctor = Object.getPrototypeOf(ctor);
  }
  return { protos, ctors };
}

/**
 * Installs the members `top` and its parents down to `base` define (midi's layers) on `base` itself.
 * `prototypePath` is a global path to `base.prototype` (CONFIG.DND5E.activityTypes.<type>.documentClass.prototype):
 * with it, WRAPPED_METHODS go through libWrapper.
 */
export function graftOnto(top: ClassLike, base: ClassLike, prototypePath?: string) {
  const { protos, ctors } = layers(top, base);
  if (!protos.length) return;
  // midi's super calls reach dnd5e's members as they were before midi's were installed
  const protoSnapshot = Object.create(Object.getPrototypeOf(base.prototype), Object.getOwnPropertyDescriptors(base.prototype));
  Object.setPrototypeOf(protos[0], protoSnapshot);
  const statics = Object.getOwnPropertyDescriptors(base);
  for (const name of SKIP_STATICS) delete (statics as Record<string, PropertyDescriptor>)[name];
  const staticSnapshot = Object.create(Object.getPrototypeOf(base), statics);
  Object.setPrototypeOf(ctors[0], staticSnapshot);

  // midi's method for each libWrapper-installed name: the highest layer's
  const throughLibWrapper = new Set<string>();
  if (prototypePath) {
    for (const name of WRAPPED_METHODS) {
      const method = [...protos].reverse().map(proto => Object.getOwnPropertyDescriptor(proto, name)?.value).find(value => typeof value === "function");
      if (method && installThroughLibWrapper(prototypePath, name, method, protoSnapshot)) throughLibWrapper.add(name);
    }
  }
  for (const proto of protos) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (name !== "constructor" && !throughLibWrapper.has(name)) Object.defineProperty(base.prototype, name, descriptor);
    }
  }
  for (const ctor of ctors) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(ctor))) {
      if (SKIP_STATICS.has(name)) continue;
      // ApplicationV2 merges each class's own DEFAULT_OPTIONS down the chain: add midi's to dnd5e's own
      if (name === "DEFAULT_OPTIONS" && Object.hasOwn(base, "DEFAULT_OPTIONS")) {
        const own = (base as { DEFAULT_OPTIONS?: object }).DEFAULT_OPTIONS ?? {};
        Object.defineProperty(base, name, { ...descriptor, value: foundry.utils.mergeObject(own, descriptor.value ?? {}, { inplace: false }) });
        continue;
      }
      Object.defineProperty(base, name, descriptor);
    }
  }
}

type ActivityClassLike = ClassLike & { metadata?: { sheetClass?: ClassLike } };

/** The dnd5e activity types midi adopted (its roll wraps are registered on these: M13) */
export const adoptedActivityTypes = new Set<string>();

/**
 * midi's activity class (and sheet) for a dnd5e activity type, installed on the classes dnd5e registered for it.
 * Returns dnd5e's class, now with midi's behaviour.
 */
export function adoptActivityType(type: string, midiClass: ClassLike, midiSheet?: ClassLike): ClassLike | undefined {
  const base = GameSystemConfig.activityTypes?.[type]?.documentClass as ActivityClassLike | undefined;
  if (!base) return undefined;
  adoptedActivityTypes.add(type);
  const baseSheet = base.metadata?.sheetClass;
  if (midiSheet && baseSheet) graftOnto(midiSheet, baseSheet);
  graftOnto(midiClass, base, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype`);
  // midi's metadata named its sheet subclass: the sheet is dnd5e's, with midi's sheet members
  if (baseSheet && base.metadata?.sheetClass !== baseSheet)
    Object.defineProperty(base, "metadata", {
      value: foundry.utils.mergeObject(base.metadata ?? {}, { sheetClass: baseSheet }, { inplace: false }),
      configurable: true, writable: true
    });
  return base;
}
