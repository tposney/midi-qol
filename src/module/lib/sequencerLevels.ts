/*
 * Sequencer 4.3 and Foundry 14's levels. A token moved to a level the viewer isn't looking at has its canvas object
 * destroyed (the token document stays), and a new one drawn when it can be seen again. Sequencer binds an animation to
 * the canvas object and rebinds only on a scene change or a token's creation, so an animation on that token reads the
 * destroyed object every frame (an error each frame) and never comes back. Until Sequencer handles it: on the object's
 * destruction the token's animations are taken down in this client, their stored data kept; once every token an
 * animation involves is drawn again, a persistent one is played again in this client (nothing stored anew).
 */

interface EffectData { source?: string, target?: string, tiedDocuments?: string[], persist?: boolean }
interface CanvasEffectLike { id: string, data: EffectData }
interface SequencerLike {
  EffectManager: {
    effects: CanvasEffectLike[];
    _removeEffect(effect: CanvasEffectLike): Promise<unknown>;
    _playEffect(data: EffectData, setFlags?: boolean): Promise<unknown>;
  };
}

/** The persistent animations taken down, by their ids */
const waiting = new Map<string, EffectData>();
/** A scene being torn down destroys every object, and Sequencer rebuilds its animations itself on the next canvas */
let tearingDown = false;

const involved = (data: EffectData) => [data.source, data.target, ...(data.tiedDocuments ?? [])].filter((u): u is string => typeof u === "string" && u.includes("."));

function sequencer(): SequencerLike | undefined {
  const s = (globalThis as { Sequencer?: SequencerLike }).Sequencer;
  return typeof s?.EffectManager?._removeEffect === "function" && typeof s.EffectManager._playEffect === "function" ? s : undefined;
}

/** A canvas object destroyed while its token stays in the scene: its animations are taken down here */
function onTokenDestroyed(token: { document?: TokenDocument.Implementation }) {
  const document = token.document;
  const uuid = document?.uuid;
  const s = sequencer();
  if (tearingDown || !s || !uuid || !document?.parent?.tokens?.has(document.id ?? "")) return;
  for (const effect of s.EffectManager.effects.filter(e => involved(e.data).includes(uuid))) {
    if (effect.data.persist) waiting.set(effect.id, foundry.utils.deepClone(effect.data));
    void s.EffectManager._removeEffect(effect).catch(() => undefined);
  }
}

/** A token drawn again: each waiting animation whose documents are all drawn is played again here */
function onTokenDrawn() {
  const s = sequencer();
  if (!s || !waiting.size) return;
  for (const [id, data] of [...waiting]) {
    const documents = involved(data).map(u => fromUuidSync(u) as { object?: unknown } | null);
    // A document gone (deleted meanwhile): Sequencer's own deletion handling has it
    if (documents.some(d => !d)) { waiting.delete(id); continue; }
    if (documents.some(d => d && "object" in d && !d.object)) continue;
    waiting.delete(id);
    void s.EffectManager._playEffect(data, false).catch(err => console.warn("midi-qol | replaying a Sequencer animation after a level change failed", err));
  }
}

export function setupSequencerLevelsFix() {
  Hooks.once("sequencerReady", () => {
    const version = game.modules?.get("sequencer")?.version ?? "";
    // Only the Sequencer this was written against (its fix will make this unnecessary)
    if (!version.startsWith("4.3.") || !sequencer()) return;
    Hooks.on("destroyToken", onTokenDestroyed as never);
    // After the drawing has finished
    Hooks.on("drawToken", () => { setTimeout(onTokenDrawn, 0); });
    Hooks.on("canvasTearDown", () => { tearingDown = true; waiting.clear(); });
    Hooks.on("canvasReady", () => { tearingDown = false; });
  });
}
