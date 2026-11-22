import { activeProviderId, defineService, entries, reportServiceProblem } from "../../api/services.js";
import { safeGetGameSetting } from "../../settings.js";

/*
 * tokenVisuals (single; M33): what an effect shows on its bearer's token. Effects say what is seen, not how:
 *
 *   flags.midi-qol.visuals: [{ kind: "duplicates", count: "3 - @state.duplicates.destroyed" }, { kind: "glow", color: "#40a0ff" }]
 *
 * Kinds: duplicates (`count` images), blur, glow, shield, shimmer. `count`: a number or a formula; `@state` is the
 * effect's entry state (flags.midi-qol.entryState), so a count follows what the effect's entries record. A count of 0
 * or less shows nothing. `color`: a CSS colour (for JB2A, a colour name). `file`: a Sequencer database path or file
 * (Sequencer only). The same kind from two effects is shown once, with the larger count.
 *
 * midi works out each token's visuals from its actor's applied effects whenever an effect changes, the token is drawn
 * or the provider changes, and asks the provider to show exactly those. Providers reconcile (add, change, remove what
 * the token shows), so undo, expiry and effects deleted by other modules need nothing more. A token a user can't see
 * shows nothing to that user.
 *
 *   MidiQOL.services.register("tokenVisuals", "my-module", {
 *     kinds: ["duplicates"],
 *     show: (token, visuals) => MyFx.reconcile(token, visuals)
 *   }, { priority: 30, available: () => game.modules.get("my-module")?.active });
 *
 * show() is called on every client: a provider that writes documents acts only for the active GM.
 * Setting TokenVisuals picks the provider; "auto" takes the highest priority available (midi's: Token Magic FX,
 * Sequencer, then its own drawing).
 */

export const TOKEN_VISUAL_KINDS = ["duplicates", "blur", "glow", "shield", "shimmer"] as const;

/** As stored on an effect */
export interface VisualSpec {
  kind: string;
  count?: number | string;
  color?: string;
  file?: string;
}

/** What a token should show, one per kind */
export interface TokenVisual {
  kind: string;
  count?: number;
  color?: string;
  file?: string;
  /** The effect it comes from (the first, when several show the kind) */
  effectUuid: string;
}

export interface TokenVisualsProvider {
  /** The kinds it draws; others are not passed to it */
  kinds: readonly string[];
  /** Make the token show exactly these (an empty list: nothing of midi's) */
  show(token: TokenDocument.Implementation, visuals: readonly TokenVisual[]): void | Promise<void>;
}

declare module "../../api/services.js" {
  interface MidiServices { tokenVisuals: TokenVisualsProvider }
}

export let tokenVisualsService: ReturnType<typeof defineService<TokenVisualsProvider>>;

export function defineTokenVisualsService() {
  tokenVisualsService = defineService<TokenVisualsProvider>("tokenVisuals", {
    kind: "single",
    description: "Draws what effects show on their bearer's token (Mirror Image's duplicates, Blur, a glow)",
    selector: () => {
      const chosen = safeGetGameSetting("midi-qol", "TokenVisuals") ?? "auto";
      return chosen === "auto" ? undefined : chosen;
    }
  });
}

/** A visual's count: a number, or a formula over the effect's entry state */
export function visualCount(count: number | string, effect: ActiveEffect.Implementation): number | undefined {
  if (typeof count === "number") return Math.floor(count);
  const state = (effect.getFlag("midi-qol", "entryState") ?? {}) as Record<string, unknown>;
  try {
    const value = Roll.safeEval(Roll.replaceFormulaData(count, { state }, { missing: "0" }));
    return Number.isFinite(value) ? Math.floor(value) : undefined;
  } catch (err) {
    console.warn(`midi-qol | tokenVisuals: ${effect.name}'s count "${count}" can't be worked out`, err);
    return undefined;
  }
}

/** What `token` should show: its actor's applied effects' visuals */
export function tokenVisuals(token: TokenDocument.Implementation): TokenVisual[] {
  const byKind = new Map<string, TokenVisual>();
  for (const effect of token.actor?.appliedEffects ?? []) {
    const specs = effect.getFlag("midi-qol", "visuals");
    if (!Array.isArray(specs)) continue;
    for (const spec of specs) {
      if (!spec?.kind) continue;
      const count = spec.count === undefined ? undefined : visualCount(spec.count, effect);
      if (spec.count !== undefined && !(count && count > 0)) continue;
      const known = byKind.get(spec.kind);
      if (known) {
        if (count !== undefined) known.count = Math.max(known.count ?? 0, count);
        continue;
      }
      byKind.set(spec.kind, {
        kind: spec.kind, effectUuid: effect.uuid,
        ...(count !== undefined ? { count } : {}), ...(spec.color ? { color: spec.color } : {}), ...(spec.file ? { file: spec.file } : {})
      });
    }
  }
  return [...byKind.values()];
}

/** What each token was last asked to show, and by which provider */
const shown = new Map<string, { providerId?: string, key: string }>();
const queues = new Map<string, Promise<unknown>>();

function providerById(id: string | undefined): TokenVisualsProvider | undefined {
  return id ? entries<TokenVisualsProvider>("tokenVisuals").find(e => e.id === id)?.provider : undefined;
}

async function show(providerId: string, provider: TokenVisualsProvider, token: TokenDocument.Implementation, visuals: readonly TokenVisual[]) {
  try { await provider.show(token, visuals); }
  catch (err) { reportServiceProblem("tokenVisuals", providerId, `show() failed for ${token.name}`, err); }
}

/** Bring `token` up to date; `force`: even when nothing seems to have changed (it was redrawn) */
export function refreshTokenVisuals(token: TokenDocument.Implementation, force = false): Promise<unknown> {
  const uuid = token.uuid;
  if (!uuid) return Promise.resolve();
  const run = async () => {
    const providerId = activeProviderId("tokenVisuals");
    const provider = tokenVisualsService.get();
    const visuals = provider && providerId ? tokenVisuals(token).filter(v => provider.kinds.includes(v.kind)) : [];
    const key = JSON.stringify(visuals.map(({ effectUuid, ...visual }) => visual));
    const last = shown.get(uuid);
    if (!force && last?.providerId === providerId && last?.key === key) return;
    if (last?.providerId && last.providerId !== providerId) {
      const old = providerById(last.providerId);
      if (old) await show(last.providerId, old, token, []);
    }
    shown.set(uuid, { providerId, key });
    if (provider && providerId) await show(providerId, provider, token, visuals);
  };
  const next = (queues.get(uuid) ?? Promise.resolve()).then(run, run);
  queues.set(uuid, next);
  return next;
}

/** Every token on the canvas */
export function refreshAllTokenVisuals(force = false): Promise<unknown> {
  return Promise.all((canvas?.tokens?.placeables ?? []).map(t => refreshTokenVisuals(t.document, force)));
}

function actorOf(effect: ActiveEffect.Implementation): Actor.Implementation | undefined {
  const parent = effect.parent;
  if (parent instanceof Actor) return parent;
  return parent instanceof Item ? parent.actor ?? undefined : undefined;
}

function refreshForEffect(effect: ActiveEffect.Implementation) {
  for (const token of actorOf(effect)?.getActiveTokens(false, true) ?? []) refreshTokenVisuals(token as TokenDocument.Implementation);
}

export function setupTokenVisuals() {
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"] as const)
    Hooks.on(hook, (effect: ActiveEffect.Implementation) => refreshForEffect(effect));
  // A token's drawing is new (scene drawn, token created or redrawn): whatever a client drew on the old one is gone
  Hooks.on("drawToken", (token: Token.Implementation) => { refreshTokenVisuals(token.document, true); });
  Hooks.on("canvasTearDown", () => shown.clear());
  Hooks.on("midi-qol.servicesChanged", (serviceId: string) => { if (serviceId === "tokenVisuals") refreshAllTokenVisuals(); });
}
