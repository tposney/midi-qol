import { i18n, MODULE_ID } from "../../midi-qol.js";
import { insideWhom } from "../services/interactions/carried.js";

/*
 * How a creature inside another (swallowed, engulfed: services/interactions/carried.ts) is drawn. Only how the token
 * is drawn on each client, nothing stored, so it follows being inside and ends with it:
 *  - users who don't own it don't see its token (it is in the creature's belly: nobody outside targets it);
 *  - its owner and the GM see it (client setting insideGhost) small and faded over the creature it is in, else as it is.
 * The Swallowed / Engulfed status on it is the GM's (carried.ts), so its icon is the token's own status icon.
 */

const GHOST_SCALE = 0.6;
const GHOST_ALPHA = 0.5;

type TokenObject = foundry.canvas.placeables.Token;

function ghostOn(): boolean {
  try { return game.settings?.get(MODULE_ID, "insideGhost") !== false; }
  catch { return true; }
}

const carrierOf = (token: TokenObject) => token.document ? insideWhom(token.document) : undefined;

function isVisibleWrapper(this: TokenObject, wrapped: () => boolean): boolean {
  const visible = wrapped();
  if (!visible || this.isPreview || game.user?.isGM || this.document?.isOwner) return visible;
  return !carrierOf(this);
}

function sizeWrapper(this: TokenObject, wrapped: () => void): void {
  wrapped();
  if (!ghostOn() || !carrierOf(this)) return;
  this.mesh?.scale.set(this.mesh.scale.x * GHOST_SCALE, this.mesh.scale.y * GHOST_SCALE);
}

function alphaWrapper(this: TokenObject, wrapped: () => void): void {
  wrapped();
  const carrier = ghostOn() ? carrierOf(this) : undefined;
  if (!carrier || !this.mesh) return;
  this.mesh.alpha *= GHOST_ALPHA;
  // Drawn over the creature it is in (under it, a larger creature's art would hide it)
  this.mesh.sort = (carrier.sort ?? 0) + 1;
}

/** Redraw a token (its visibility, size and alpha) after it goes in or comes out */
export function redrawInside(token: TokenDocument.Implementation | undefined) {
  const object = token?.object as TokenObject | null | undefined;
  if (!object) return;
  object.renderFlags.set({ refreshVisibility: true, refreshSize: true, refreshMesh: true, refreshState: true });
}

export function registerInsideLookSetting() {
  game.settings?.register(MODULE_ID, "insideGhost", {
    name: i18n("midi-qol.InsideGhost.Name"),
    hint: i18n("midi-qol.InsideGhost.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => { for (const token of canvas?.tokens?.placeables ?? []) if (carrierOf(token)) redrawInside(token.document); }
  });
}

/** The wrappers patching.ts registers (libWrapper, WRAPPER): token method → wrapper */
export const INSIDE_LOOK_WRAPPERS: [string, (this: TokenObject, wrapped: () => never) => unknown][] = [
  ["foundry.canvas.placeables.Token.prototype.isVisible", isVisibleWrapper],
  ["foundry.canvas.placeables.Token.prototype._refreshMeshSizeAndScale", sizeWrapper],
  ["foundry.canvas.placeables.Token.prototype._refreshState", alphaWrapper],
  ["foundry.canvas.placeables.Token.prototype._refreshMesh", alphaWrapper]
];
