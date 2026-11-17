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
 */

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

/** Installs the members `top` and its parents down to `base` define (midi's layers) on `base` itself. */
export function graftOnto(top: ClassLike, base: ClassLike) {
  const { protos, ctors } = layers(top, base);
  if (!protos.length) return;
  // midi's super calls reach dnd5e's members as they were before midi's were installed
  const protoSnapshot = Object.create(Object.getPrototypeOf(base.prototype), Object.getOwnPropertyDescriptors(base.prototype));
  Object.setPrototypeOf(protos[0], protoSnapshot);
  const statics = Object.getOwnPropertyDescriptors(base);
  for (const name of SKIP_STATICS) delete (statics as Record<string, PropertyDescriptor>)[name];
  const staticSnapshot = Object.create(Object.getPrototypeOf(base), statics);
  Object.setPrototypeOf(ctors[0], staticSnapshot);

  for (const proto of protos) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (name !== "constructor") Object.defineProperty(base.prototype, name, descriptor);
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

/**
 * midi's activity class (and sheet) for a dnd5e activity type, installed on the classes dnd5e registered for it.
 * Returns dnd5e's class, now with midi's behaviour.
 */
export function adoptActivityType(type: string, midiClass: ClassLike, midiSheet?: ClassLike): ClassLike | undefined {
  const base = GameSystemConfig.activityTypes?.[type]?.documentClass as ActivityClassLike | undefined;
  if (!base) return undefined;
  const baseSheet = base.metadata?.sheetClass;
  if (midiSheet && baseSheet) graftOnto(midiSheet, baseSheet);
  graftOnto(midiClass, base);
  // midi's metadata named its sheet subclass: the sheet is dnd5e's, with midi's sheet members
  if (baseSheet && base.metadata?.sheetClass !== baseSheet)
    Object.defineProperty(base, "metadata", {
      value: foundry.utils.mergeObject(base.metadata ?? {}, { sheetClass: baseSheet }, { inplace: false }),
      configurable: true, writable: true
    });
  return base;
}
