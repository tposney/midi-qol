// A literal, not midi-qol.ts's MODULE_ID: this module is evaluated inside midi-qol.ts's import cycle
const MODULE_ID = "midi-qol";

/*
 * Damage midi has calculated, applied through dnd5e's Actor5e#applyDamage (sub-plan:
 * ~/Documents/midi-next-damage-application-subplan-2026-11-18.md, section 3.1).
 *
 * - calculateDamage short-circuit: an application carrying PRECALCULATED returns midi's totals; dnd5e's calculation
 *   and the calculate hooks don't run a second time.
 * - Update marker: applyDamage drops the caller's options before its actor update, so midi's preApplyDamage handler
 *   stamps the update with a one-off flag and midi's preUpdateActor handler swaps it for the recorded update options
 *   and pinned values. The flag is never stored. (Goes when dnd5e forwards update options.)
 */

/** What dnd5e's calculateDamage returns: the damages with the totals attached. */
export interface DamageSummary {
  damages: object[];
  amount: number;
  temp: number;
  tempMax: number;
}

export interface CalculatedDamageApplication {
  /** Update options for the actor update (noConcentrationCheck, isUndo, dnd5e.concentrationCheck...). */
  updateOptions?: Record<string, unknown>;
  /** Values written last, after every hook (undo/redo restores, death save failures): flat paths. */
  extraUpdates?: Record<string, unknown>;
}

const PRECALCULATED = Symbol("midi-qol.precalculatedDamage");
const UPDATE_OPTIONS = Symbol("midi-qol.damageUpdateOptions");
const MARKER = `flags.${MODULE_ID}.damageApplication`;
/** A record whose update never came (preApplyDamage or modifyTokenAttribute cancelled) is dropped after this. */
const ABANDONED_MS = 30_000;

const pending = new Map<string, CalculatedDamageApplication & { timer: ReturnType<typeof setTimeout> }>();

type DamageOptions = Record<string | symbol, unknown>;

/** libWrapper MIXED on Actor5e#calculateDamage (a precalculated application never calls dnd5e's). */
function calculateDamageWrapper(this: Actor.Implementation, wrapped: (damages: object[], options?: object) => unknown, damages: object[], options: DamageOptions = {}) {
  const summary = options?.[PRECALCULATED] as DamageSummary | undefined;
  if (!summary) return wrapped(damages, options);
  const result = foundry.utils.deepClone(summary.damages ?? damages) as object[] & Partial<DamageSummary>;
  result.amount = summary.amount;
  result.temp = summary.temp;
  result.tempMax = summary.tempMax;
  return result;
}

export function registerDamageApplication() {
  globalThis.libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.calculateDamage", calculateDamageWrapper, "MIXED");
}

/**
 * Applies damage midi has already calculated with dnd5e's applyDamage: dnd5e fires preApplyDamage,
 * modifyTokenAttribute and applyDamage and makes the update; `application` reaches that update.
 */
export async function applyCalculatedDamage(actor: Actor.Implementation, summary: DamageSummary,
  application: CalculatedDamageApplication = {}, options: Record<string, unknown> = {}): Promise<Actor.Implementation> {
  const applyOptions: DamageOptions = { ...options };
  Object.defineProperty(applyOptions, PRECALCULATED, { value: summary, enumerable: false });
  Object.defineProperty(applyOptions, UPDATE_OPTIONS, { value: application, enumerable: false });
  // @ts-expect-error no dnd5e-types
  return actor.applyDamage(summary.damages, applyOptions);
}

/** From midi's dnd5e.preApplyDamage handler (registered first): stamps the update an application of midi's makes. */
export function stampDamageApplication(updates: Record<string, unknown>, options: DamageOptions | undefined) {
  const application = options?.[UPDATE_OPTIONS] as CalculatedDamageApplication | undefined;
  if (!application) return;
  const id = foundry.utils.randomID();
  pending.set(id, { ...application, timer: setTimeout(() => pending.delete(id), ABANDONED_MS) });
  updates[MARKER] = id;
}

/** From midi's preUpdateActor handler (first): swaps the stamp for the recorded options and pinned values. */
export function consumeDamageApplication(changes: Record<string, any>, options: Record<string, unknown>) {
  let id: unknown = changes[MARKER];
  if (id !== undefined) delete changes[MARKER];
  else {
    const flags = changes.flags?.[MODULE_ID];
    id = flags?.damageApplication;
    if (id === undefined) return;
    delete flags.damageApplication;
    if (foundry.utils.isEmpty(flags)) delete changes.flags[MODULE_ID];
    if (foundry.utils.isEmpty(changes.flags)) delete changes.flags;
  }
  const application = pending.get(id as string);
  if (!application) return;
  clearTimeout(application.timer);
  pending.delete(id as string);
  if (application.updateOptions) foundry.utils.mergeObject(options, application.updateOptions);
  if (application.extraUpdates) foundry.utils.mergeObject(changes, foundry.utils.expandObject(application.extraUpdates));
}
