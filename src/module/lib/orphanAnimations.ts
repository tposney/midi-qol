import { preferredActiveGM } from "../GMAction.js";

/*
 * Animations left by a deleted document: Sequencer effects whose origin is an item or effect that no longer exists.
 * Deleting an item fires no deleteActiveEffect for its effects, so a module that animates them (Automated Animations)
 * never ends them; and an animation can start after its item is gone (a use finishing after the item was deleted), when
 * nothing will ever end it. On the preferred GM:
 *  - an item or effect deleted: the animations with it (or one of its effects) as origin end;
 *  - an animation starting whose origin was deleted this session ends;
 *  - when the scene is drawn, persistent animations whose origin is a world document that no longer exists end.
 * Never an animation queued by hand (Sequencer's own module name, the default for a macro's sequence), nor one whose
 * origin isn't a world document's uuid (a compendium's, any other text): only what a module played for a document.
 */

interface EffectData { origin?: string, persist?: boolean, moduleName?: string, sceneId?: string }
interface CanvasEffectLike { data?: EffectData }
interface EffectManagerLike {
  getEffects(filter?: object): CanvasEffectLike[];
  endEffects(filter: object): Promise<unknown>;
}

const MANUAL_MODULE = "Sequencer";
/** Deleted this session, by uuid (kept a while: a use can finish long after) */
const deleted = new Map<string, number>();
const KEEP_MS = 30 * 60 * 1000;

const manager = (): EffectManagerLike | undefined =>
  (globalThis as { Sequencer?: { EffectManager?: EffectManagerLike } }).Sequencer?.EffectManager;

const isGM = () => !!preferredActiveGM()?.isSelf;

/** Played by a module for a document (not queued by hand) */
function playedForDocument(data: EffectData | undefined): data is EffectData & { origin: string } {
  return typeof data?.origin === "string" && !!data.origin && (data.moduleName ?? MANUAL_MODULE) !== MANUAL_MODULE;
}

/** The origin names a world document (not a compendium's) */
function worldDocumentUuid(uuid: string): boolean {
  try {
    const parsed = foundry.utils.parseUuid(uuid) as { collection?: unknown, documentType?: string, id?: string } | null;
    if (!parsed?.documentType || !parsed.id) return false;
    return !(parsed.collection instanceof foundry.documents.collections.CompendiumCollection);
  } catch {
    return false;
  }
}

/** Its origin is, or is inside, a document deleted this session */
function originDeleted(origin: string): boolean {
  const now = Date.now();
  for (const [uuid, at] of deleted) {
    if (now - at > KEEP_MS) { deleted.delete(uuid); continue; }
    if (origin === uuid || origin.startsWith(`${uuid}.`)) return true;
  }
  return false;
}

async function end(effects: CanvasEffectLike[], why: string) {
  const api = manager();
  if (!api || !effects.length) return;
  try { await api.endEffects({ effects }); }
  catch (err) { console.warn(`midi-qol | ending animations of ${why} failed`, err); }
}

/** A document deleted: the animations with it (or something inside it) as origin end */
async function onDeleted(uuid: string | null | undefined) {
  if (!uuid) return;
  deleted.set(uuid, Date.now());
  if (!isGM()) return;
  const left = (manager()?.getEffects() ?? []).filter(e => playedForDocument(e.data) && (e.data.origin === uuid || e.data.origin.startsWith(`${uuid}.`)));
  await end(left, uuid);
}

/** An animation starting for a document deleted this session */
function onCreated(effect: CanvasEffectLike) {
  if (!isGM() || !playedForDocument(effect.data) || !originDeleted(effect.data.origin)) return;
  // After it has started (ending it before it plays leaves it to the player)
  setTimeout(() => void end([effect], effect.data!.origin!), 500);
}

/** Persistent animations on the drawn scene whose origin is a world document that no longer exists */
async function sweep() {
  if (!isGM()) return;
  const sceneId = canvas?.scene?.id;
  const left = (manager()?.getEffects() ?? []).filter(e => {
    const data = e.data;
    if (!playedForDocument(data) || !data.persist || (sceneId && data.sceneId && data.sceneId !== sceneId)) return false;
    return worldDocumentUuid(data.origin) && !fromUuidSync(data.origin, { strict: false });
  });
  await end(left, "deleted documents");
}

export function registerOrphanAnimations() {
  const undoing = (options: unknown) => !!(options as { undo?: boolean } | undefined)?.undo;
  Hooks.on("deleteItem", (item, options) => { if (!undoing(options)) void onDeleted(item.uuid); });
  Hooks.on("deleteActiveEffect", (effect, options) => { if (!undoing(options)) void onDeleted(effect.uuid); });
  Hooks.on("createSequencerEffect" as never, ((effect: CanvasEffectLike) => onCreated(effect)) as never);
  // Persisted animations are back once Sequencer has drawn them; the first scene is drawn before midi's ready
  Hooks.on("canvasReady", () => { setTimeout(() => void sweep(), 3000); });
  if (canvas?.ready) setTimeout(() => void sweep(), 3000);
}
