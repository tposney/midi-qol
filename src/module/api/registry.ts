/*
 * The one list every midi registry is kept in (service providers and wrappers, card actions, card button rules,
 * activity policies): entries by id, each with a priority, an optional availability check and whatever else the
 * registry needs to know about it. Registering an id again replaces the entry in place.
 * Order: higher priority first, then registration order. Pure: no Foundry globals.
 */

export interface RegistryOptions {
  /** Higher comes first. Default 0. */
  priority?: number;
  /** False (or a check that throws) leaves the entry out of `entries()`. */
  available?: () => boolean;
}

export interface RegistryEntry<T, M extends object = object> {
  id: string;
  value: T;
  priority: number;
  available?: () => boolean;
  /** What else the registry records about the entry. */
  meta: M;
}

export class Registry<T, M extends object = object> {
  #entries = new Map<string, RegistryEntry<T, M>>();
  #ordered: RegistryEntry<T, M>[] | undefined;
  #onChange?: () => void;

  /** `onChange` is called after an entry is added, replaced or removed. */
  constructor(onChange?: () => void) {
    this.#onChange = onChange;
  }

  set(id: string, value: T, options: RegistryOptions = {}, meta?: M): RegistryEntry<T, M> {
    const entry: RegistryEntry<T, M> = { id, value, priority: options.priority ?? 0, available: options.available, meta: meta ?? {} as M };
    this.#entries.set(id, entry);
    this.#changed();
    return entry;
  }

  delete(id: string): boolean {
    if (!this.#entries.delete(id)) return false;
    this.#changed();
    return true;
  }

  get(id: string): RegistryEntry<T, M> | undefined {
    return this.#entries.get(id);
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  get size(): number {
    return this.#entries.size;
  }

  /** Every entry in registration order, available or not. */
  list(): RegistryEntry<T, M>[] {
    return [...this.#entries.values()];
  }

  /** The available entries, higher priority first, then registration order. */
  entries(): RegistryEntry<T, M>[] {
    this.#ordered ??= this.list().map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.priority - a.entry.priority || a.index - b.index).map(e => e.entry);
    return this.#ordered.filter(isAvailable);
  }

  #changed() {
    this.#ordered = undefined;
    this.#onChange?.();
  }
}

export function isAvailable(entry: { available?: () => boolean }): boolean {
  try { return entry.available?.() ?? true; }
  catch { return false; }
}
