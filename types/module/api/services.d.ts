/**
 * midi's service registry: each behaviour other modules may replace, wrap, extend or use on its own.
 *
 * - A "single" service has one active provider (the one its selector picks, else the highest priority available one);
 *   other modules wrap it to adjust its answers.
 * - A "contributors" service runs every available provider and the caller combines their results.
 *
 * Other modules register in the `midi-qol.registerServices` hook (fired at midi's init with this registry) or later
 * through `MidiQOL.services`. Names are listed in docs/surface.json.
 */
export type ServiceKind = "single" | "contributors";
/**
 * The provider type of each service, by id. A service's file adds its entry by declaration merging, so
 * `MidiQOL.services.get("cover")` is typed; another module's own service does the same from its types.
 */
export interface MidiServices {
}
type ServiceId = keyof MidiServices & string;
/** Where a provider's or contributor's failure is reported (midi sets the TroubleShooter; the console otherwise). */
declare let problemReporter: (serviceId: string, providerId: string, message: string, err?: unknown) => void;
export declare function setServiceProblemReporter(reporter: typeof problemReporter): void;
export interface ServiceProblem {
    serviceId: string;
    providerId: string;
    message: string;
    count: number;
    lastError?: string;
}
/** The problems reported this session, once each with a count (the TroubleShooter lists them as problems) */
export declare function serviceProblems(): ServiceProblem[];
/** A provider or contributor failed or gave an answer midi could not use: it is skipped, and the problem recorded. */
export declare function reportServiceProblem(serviceId: string, providerId: string, message: string, err?: unknown): void;
export interface WrapperOptions {
    /** Higher wraps outermost (is asked first); equal priorities keep registration order. Default 0. */
    priority?: number;
    /** Also called when no provider is selected or available, with `next` undefined, so it can answer on its own. */
    whenAbsent?: boolean;
}
export interface ProviderOptions {
    /** Higher wins among available providers when no selector picks one; midi's own providers use 0. */
    priority?: number;
    /** False when the provider can't answer (its module is not active): it is skipped. */
    available?: () => boolean;
    /** For a settings drop-down. */
    label?: string;
}
/** midi only: declare a service. */
export declare function defineService<P>(id: string, options: {
    kind: ServiceKind;
    description: string;
    selector?: () => string | undefined;
    contract?: number;
}): {
    register: (providerId: string, provider: P, providerOptions?: ProviderOptions) => void;
    get: () => P | undefined;
    all: () => P[];
};
export declare function register<K extends ServiceId>(serviceId: K, providerId: string, provider: MidiServices[K], options?: ProviderOptions): void;
export declare function register<P>(serviceId: string, providerId: string, provider: P, options?: ProviderOptions): void;
export declare function unregister(serviceId: string, providerId: string): void;
/**
 * Wrap a single service's active provider: `wrap` gets it and returns the provider to use instead.
 * With `whenAbsent` the wrapper also runs when there is no provider (`next` is then undefined).
 */
export declare function wrap<K extends ServiceId>(serviceId: K, wrapperId: string, wrapFn: (next: MidiServices[K]) => MidiServices[K], options?: WrapperOptions): void;
export declare function wrap<P>(serviceId: string, wrapperId: string, wrapFn: (next: P) => P, options?: WrapperOptions): void;
export declare function unwrap(serviceId: string, wrapperId: string): void;
/** The id of a single service's active provider, before wrappers. */
export declare function activeProviderId(serviceId: string): string | undefined;
/** A single service's active provider with its wrappers applied, or undefined when none is available. */
export declare function get<K extends ServiceId>(serviceId: K): MidiServices[K] | undefined;
export declare function get<P>(serviceId: string): P | undefined;
/** Every available provider of a contributors service, highest priority first. */
export declare function all<K extends ServiceId>(serviceId: K): MidiServices[K][];
export declare function all<P>(serviceId: string): P[];
/** Every available provider of a contributors service with its id, highest priority first (for attributing answers). */
export declare function entries<K extends ServiceId>(serviceId: K): {
    id: string;
    provider: MidiServices[K];
}[];
export declare function entries<P>(serviceId: string): {
    id: string;
    provider: P;
}[];
/** Whether `providerId` is the provider midi uses for a single service, e.g. for a module to stand down its own automation. */
export declare function isProvider(serviceId: string, providerId: string): boolean;
export declare function providers(serviceId: string): {
    id: string;
    label?: string;
    priority: number;
    available: boolean;
    active: boolean;
}[];
export declare function list(): {
    id: string;
    kind: ServiceKind;
    description: string;
    contract?: number;
}[];
/** Forget cached providers, e.g. after a setting that selects one changed. */
export declare function refreshServices(): void;
export declare const servicesApi: {
    register: typeof register;
    unregister: typeof unregister;
    wrap: typeof wrap;
    unwrap: typeof unwrap;
    get: typeof get;
    all: typeof all;
    entries: typeof entries;
    isProvider: typeof isProvider;
    providers: typeof providers;
    list: typeof list;
    activeProviderId: typeof activeProviderId;
    reportProblem: typeof reportServiceProblem;
    problems: typeof serviceProblems;
};
export {};
