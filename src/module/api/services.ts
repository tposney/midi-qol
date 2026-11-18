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

export interface ProviderOptions {
  /** Higher wins among available providers when no selector picks one; midi's own providers use 0. */
  priority?: number;
  /** False when the provider can't answer (its module is not active): it is skipped. */
  available?: () => boolean;
  /** For a settings drop-down. */
  label?: string;
}

interface ProviderEntry<P> extends ProviderOptions {
  id: string;
  provider: P;
}

interface ServiceEntry<P> {
  id: string;
  kind: ServiceKind;
  description: string;
  /** For a single service: the provider id the configuration picks (e.g. a midi setting), or undefined. */
  selector?: () => string | undefined;
  providers: Map<string, ProviderEntry<P>>;
  wrappers: { id: string, wrap: (next: P) => P }[];
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
export function defineService<P>(id: string, options: { kind: ServiceKind, description: string, selector?: () => string | undefined }) {
  if (services.has(id)) throw new Error(`midi-qol | service "${id}" is already defined`);
  services.set(id, { id, kind: options.kind, description: options.description, selector: options.selector, providers: new Map(), wrappers: [] });
  return {
    register: (providerId: string, provider: P, providerOptions?: ProviderOptions) => register<P>(id, providerId, provider, providerOptions),
    get: () => get<P>(id),
    all: () => all<P>(id),
  };
}

export function register<P>(serviceId: string, providerId: string, provider: P, options: ProviderOptions = {}) {
  const service = entry<P>(serviceId);
  service.providers.set(providerId, { id: providerId, provider, ...options });
  changed(service);
}

export function unregister(serviceId: string, providerId: string) {
  const service = entry(serviceId);
  if (service.providers.delete(providerId)) changed(service);
}

/** Wrap a single service's active provider: `wrap` gets it and returns the provider to use instead. */
export function wrap<P>(serviceId: string, wrapperId: string, wrapFn: (next: P) => P) {
  const service = entry<P>(serviceId);
  service.wrappers = service.wrappers.filter(w => w.id !== wrapperId);
  service.wrappers.push({ id: wrapperId, wrap: wrapFn });
  changed(service);
}

export function unwrap(serviceId: string, wrapperId: string) {
  const service = entry(serviceId);
  const before = service.wrappers.length;
  service.wrappers = service.wrappers.filter(w => w.id !== wrapperId);
  if (service.wrappers.length !== before) changed(service);
}

function isAvailable(provider: ProviderEntry<unknown>): boolean {
  try { return provider.available?.() ?? true; }
  catch { return false; }
}

/** The id of a single service's active provider, before wrappers. */
export function activeProviderId(serviceId: string): string | undefined {
  const service = entry(serviceId);
  const selected = service.selector?.();
  if (selected !== undefined) {
    const chosen = service.providers.get(selected);
    return chosen && isAvailable(chosen) ? chosen.id : undefined;
  }
  return [...service.providers.values()].filter(isAvailable).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]?.id;
}

/** A single service's active provider with its wrappers applied, or undefined when none is available. */
export function get<P>(serviceId: string): P | undefined {
  const service = entry<P>(serviceId);
  if (service.kind !== "single") throw new Error(`midi-qol | service "${serviceId}" has contributors: use all()`);
  const selected = service.selector?.();
  if (service.resolved !== undefined && service.resolvedFor === selected) return service.resolved ?? undefined;
  const id = activeProviderId(serviceId);
  let provider = id ? service.providers.get(id)?.provider : undefined;
  if (provider) for (const { wrap } of service.wrappers) provider = wrap(provider);
  service.resolved = provider ?? null;
  service.resolvedFor = selected;
  return provider;
}

/** Every available provider of a contributors service, highest priority first. */
export function all<P>(serviceId: string): P[] {
  const service = entry<P>(serviceId);
  return [...service.providers.values()].filter(isAvailable).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map(p => p.provider);
}

/** Every available provider of a contributors service with its id, highest priority first (for attributing answers). */
export function entries<P>(serviceId: string): { id: string, provider: P }[] {
  const service = entry<P>(serviceId);
  return [...service.providers.values()].filter(isAvailable).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map(p => ({ id: p.id, provider: p.provider }));
}

/** Whether `providerId` is the provider midi uses for a single service, e.g. for a module to stand down its own automation. */
export function isProvider(serviceId: string, providerId: string): boolean {
  return services.has(serviceId) && activeProviderId(serviceId) === providerId;
}

export function providers(serviceId: string): { id: string, label?: string, priority: number, available: boolean, active: boolean }[] {
  const service = entry(serviceId);
  const active = service.kind === "single" ? activeProviderId(serviceId) : undefined;
  return [...service.providers.values()].map(p => ({ id: p.id, label: p.label, priority: p.priority ?? 0, available: isAvailable(p), active: p.id === active }));
}

export function list(): { id: string, kind: ServiceKind, description: string }[] {
  return [...services.values()].map(s => ({ id: s.id, kind: s.kind, description: s.description }));
}

/** Forget cached providers, e.g. after a setting that selects one changed. */
export function refreshServices() {
  for (const service of services.values()) changed(service);
}

export const servicesApi = { register, unregister, wrap, unwrap, get, all, entries, isProvider, providers, list, activeProviderId };
