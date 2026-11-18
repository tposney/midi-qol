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
export declare class Registry<T, M extends object = object> {
    #private;
    /** `onChange` is called after an entry is added, replaced or removed. */
    constructor(onChange?: () => void);
    set(id: string, value: T, options?: RegistryOptions, meta?: M): RegistryEntry<T, M>;
    delete(id: string): boolean;
    get(id: string): RegistryEntry<T, M> | undefined;
    has(id: string): boolean;
    get size(): number;
    /** Every entry in registration order, available or not. */
    list(): RegistryEntry<T, M>[];
    /** The available entries, higher priority first, then registration order. */
    entries(): RegistryEntry<T, M>[];
}
export declare function isAvailable(entry: {
    available?: () => boolean;
}): boolean;
