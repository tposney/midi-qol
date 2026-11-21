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

import { isAvailable, Registry } from "./registry.js";

export type ServiceKind = "single" | "contributors";

/**
 * The provider type of each service, by id. A service's file adds its entry by declaration merging, so
 * `MidiQOL.services.get("cover")` is typed; another module's own service does the same from its types.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MidiServices {}
type ServiceId = keyof MidiServices & string;

/** Where a provider's or contributor's failure is reported (midi sets the TroubleShooter; the console otherwise). */
let problemReporter: (serviceId: string, providerId: string, message: string, err?: unknown) => void =
  (serviceId, providerId, message, err) => console.warn(`midi-qol | ${serviceId} | ${providerId}: ${message}`, err ?? "");

export function setServiceProblemReporter(reporter: typeof problemReporter) { problemReporter = reporter; }

export interface ServiceProblem { serviceId: string, providerId: string, message: string, count: number, lastError?: string }
const serviceProblemLog = new Map<string, ServiceProblem>();

/** The problems reported this session, once each with a count (the TroubleShooter lists them as problems) */
export function serviceProblems(): ServiceProblem[] { return [...serviceProblemLog.values()]; }

/** A provider or contributor failed or gave an answer midi could not use: it is skipped, and the problem recorded. */
export function reportServiceProblem(serviceId: string, providerId: string, message: string, err?: unknown) {
  const key = `${serviceId}|${providerId}|${message}`;
  const known = serviceProblemLog.get(key);
  const lastError = err instanceof Error ? err.message : err === undefined ? undefined : String(err);
  serviceProblemLog.set(key, { serviceId, providerId, message, count: (known?.count ?? 0) + 1, ...(lastError ? { lastError } : known?.lastError ? { lastError: known.lastError } : {}) });
  try { problemReporter(serviceId, providerId, message, err); }
  catch { console.warn(`midi-qol | ${serviceId} | ${providerId}: ${message}`, err ?? ""); }
}

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

interface ServiceEntry<P> {
  id: string;
  kind: ServiceKind;
  description: string;
  /** The version of what the service reads from its providers or contributors (a field added: raised), if it says */
  contract?: number;
  /** For a single service: the provider id the configuration picks (e.g. a midi setting), or undefined. */
  selector?: () => string | undefined;
  providers: Registry<P, { label?: string }>;
  wrappers: Registry<(next: P) => P, { whenAbsent: boolean }>;
  resolved?: P | null;
  /** The selector's value `resolved` was chosen for: settings can change in memory without a hook */
  resolvedFor?: string;
}

const services = new Map<string, ServiceEntry<unknown>>();

function entry<P>(serviceId: string): ServiceEntry<P> {
  const service = services.get(serviceId);
  if (!service) throw new Error(`midi-qol | no service "${serviceId}"`);
  return service as ServiceEntry<P>;
}

function changed(service: { id: string, resolved?: unknown }) {
  service.resolved = undefined;
  Hooks.callAll("midi-qol.servicesChanged", service.id);
}

/** midi only: declare a service. */
export function defineService<P>(id: string, options: { kind: ServiceKind, description: string, selector?: () => string | undefined, contract?: number }) {
  if (services.has(id)) throw new Error(`midi-qol | service "${id}" is already defined`);
  const service: ServiceEntry<unknown> = {
    id, kind: options.kind, description: options.description, selector: options.selector, contract: options.contract,
    providers: new Registry(() => changed(service)), wrappers: new Registry(() => changed(service))
  };
  services.set(id, service);
  return {
    register: (providerId: string, provider: P, providerOptions?: ProviderOptions) => register<P>(id, providerId, provider, providerOptions),
    get: () => get<P>(id),
    all: () => all<P>(id),
  };
}

export function register<K extends ServiceId>(serviceId: K, providerId: string, provider: MidiServices[K], options?: ProviderOptions): void;
export function register<P>(serviceId: string, providerId: string, provider: P, options?: ProviderOptions): void;
export function register<P>(serviceId: string, providerId: string, provider: P, options: ProviderOptions = {}) {
  const service = entry<P>(serviceId);
  service.providers.set(providerId, provider, options, { label: options.label });
}

export function unregister(serviceId: string, providerId: string) {
  const service = entry(serviceId);
  service.providers.delete(providerId);
}

/**
 * Wrap a single service's active provider: `wrap` gets it and returns the provider to use instead.
 * With `whenAbsent` the wrapper also runs when there is no provider (`next` is then undefined).
 */
export function wrap<K extends ServiceId>(serviceId: K, wrapperId: string, wrapFn: (next: MidiServices[K]) => MidiServices[K], options?: WrapperOptions): void;
export function wrap<P>(serviceId: string, wrapperId: string, wrapFn: (next: P) => P, options?: WrapperOptions): void;
export function wrap<P>(serviceId: string, wrapperId: string, wrapFn: (next: P) => P, options: WrapperOptions = {}) {
  const service = entry<P>(serviceId);
  // A wrapper registered again goes last among its priority (outermost), as a new one would
  if (service.wrappers.has(wrapperId)) service.wrappers.delete(wrapperId);
  service.wrappers.set(wrapperId, wrapFn, { priority: options.priority }, { whenAbsent: !!options.whenAbsent });
}

export function unwrap(serviceId: string, wrapperId: string) {
  const service = entry(serviceId);
  service.wrappers.delete(wrapperId);
}

/** The id of a single service's active provider, before wrappers. */
export function activeProviderId(serviceId: string): string | undefined {
  const service = entry(serviceId);
  const selected = service.selector?.();
  if (selected !== undefined) {
    const chosen = service.providers.get(selected);
    return chosen && isAvailable(chosen) ? chosen.id : undefined;
  }
  return service.providers.entries()[0]?.id;
}

/** A single service's active provider with its wrappers applied, or undefined when none is available. */
export function get<K extends ServiceId>(serviceId: K): MidiServices[K] | undefined;
export function get<P>(serviceId: string): P | undefined;
export function get<P>(serviceId: string): P | undefined {
  const service = entry<P>(serviceId);
  if (service.kind !== "single") throw new Error(`midi-qol | service "${serviceId}" has contributors: use all()`);
  const selected = service.selector?.();
  if (service.resolved !== undefined && service.resolvedFor === selected) return service.resolved ?? undefined;
  const id = activeProviderId(serviceId);
  let provider = id ? service.providers.get(id)?.value : undefined;
  // Applied innermost first: lowest priority, and among equals the first registered
  const innermostFirst = service.wrappers.list().map((w, index) => ({ w, index })).sort((a, b) => a.w.priority - b.w.priority || a.index - b.index).map(e => e.w);
  for (const { id: wrapperId, value: wrap, meta } of innermostFirst) {
    if (!provider && !meta.whenAbsent) continue;
    try { provider = wrap(provider as P) ?? provider; }
    catch (err) { reportServiceProblem(serviceId, wrapperId, "its wrapper failed and is skipped", err); }
  }
  service.resolved = provider ?? null;
  service.resolvedFor = selected;
  return provider;
}

/** Every available provider of a contributors service, highest priority first. */
export function all<K extends ServiceId>(serviceId: K): MidiServices[K][];
export function all<P>(serviceId: string): P[];
export function all<P>(serviceId: string): P[] {
  const service = entry<P>(serviceId);
  return service.providers.entries().map(p => p.value);
}

/** Every available provider of a contributors service with its id, highest priority first (for attributing answers). */
export function entries<K extends ServiceId>(serviceId: K): { id: string, provider: MidiServices[K] }[];
export function entries<P>(serviceId: string): { id: string, provider: P }[];
export function entries<P>(serviceId: string): { id: string, provider: P }[] {
  const service = entry<P>(serviceId);
  return service.providers.entries().map(p => ({ id: p.id, provider: p.value }));
}

/** Whether `providerId` is the provider midi uses for a single service, e.g. for a module to stand down its own automation. */
export function isProvider(serviceId: string, providerId: string): boolean {
  return services.has(serviceId) && activeProviderId(serviceId) === providerId;
}

export function providers(serviceId: string): { id: string, label?: string, priority: number, available: boolean, active: boolean }[] {
  const service = entry(serviceId);
  const active = service.kind === "single" ? activeProviderId(serviceId) : undefined;
  return service.providers.list().map(p => ({ id: p.id, label: p.meta.label, priority: p.priority, available: isAvailable(p), active: p.id === active }));
}

export function list(): { id: string, kind: ServiceKind, description: string, contract?: number }[] {
  return [...services.values()].map(s => ({ id: s.id, kind: s.kind, description: s.description, ...(s.contract ? { contract: s.contract } : {}) }));
}

/** Forget cached providers, e.g. after a setting that selects one changed. */
export function refreshServices() {
  for (const service of services.values()) changed(service);
}

export const servicesApi = { register, unregister, wrap, unwrap, get, all, entries, isProvider, providers, list, activeProviderId, reportProblem: reportServiceProblem, problems: serviceProblems };
