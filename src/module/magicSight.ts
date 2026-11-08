import { MODULE_ID } from "../midi-qol.js";
import Token = foundry.canvas.placeables.Token;

/**
 * Detect Magic (Vision)'s Magic Sight (flags.midi-qol.magicSight on the caster's effect): for the GM and the caster's
 * owners, concentric rings around each listed token and glowing bands along each listed region's outline, one per
 * colour (a spell school, or magic items), brighter and wider for a higher level (1-9). The rings follow their tokens
 * and fade when the effect ends (its turnEnd expiry, at the end of the turn), or when the active GM ends it after its seconds (the item's CAT configuration, 15 by default).
 */
type MagicSight = NonNullable<NonNullable<ActiveEffect.Implementation["flags"]["midi-qol"]>["magicSight"]>;
type Ring = MagicSight["entries"][number]["rings"][number];

const RING_GAP = 7;
const FADE_MS = 600;
const drawn = new Map<string, { container: PIXI.Container; tokens: Map<string, PIXI.Graphics> }>();
let layer: PIXI.Container | undefined;

const magicSightOf = (effect: ActiveEffect.Implementation) => effect.flags?.[MODULE_ID]?.magicSight;
const brightness = (ring: Ring) => Math.min(1, 0.55 + ring.level * 0.05);
const width = (ring: Ring) => 4 + ring.level * 0.7;
// A broad faint halo under the ring, so it glows rather than reads as a line.
const HALO_WIDTH = 3;
const HALO_ALPHA = 0.3;

function canView(effect: ActiveEffect.Implementation): boolean {
  const actor = effect.parent;
  return !!game.user?.isGM || (actor instanceof Actor && actor.isOwner);
}

function sightLayer(): PIXI.Container {
  if (layer && !layer.destroyed && layer.parent) return layer;
  layer = new PIXI.Container();
  layer.name = "midi-qol-magic-sight";
  layer.eventMode = "none";
  layer.filters = [new PIXI.BlurFilter(1.5)];
  canvas!.interface!.addChild(layer);
  return layer;
}

function tokenRings(token: Token.Implementation, rings: Ring[]): PIXI.Graphics {
  const graphics = new PIXI.Graphics();
  const radius = Math.max(token.w, token.h) / 2 + 4;
  rings.forEach((ring, i) => {
    const r = radius + i * (RING_GAP + width(ring));
    graphics.lineStyle({ width: width(ring) * HALO_WIDTH, color: ring.color, alpha: brightness(ring) * HALO_ALPHA });
    graphics.drawCircle(0, 0, r);
    graphics.lineStyle({ width: width(ring), color: ring.color, alpha: brightness(ring) });
    graphics.drawCircle(0, 0, r);
  });
  graphics.position.set(token.center.x, token.center.y);
  return graphics;
}

// Bands along the outline, the outermost widest, so each colour shows as its own band.
function regionBands(region: RegionDocument.Implementation, rings: Ring[]): PIXI.Graphics {
  const graphics = new PIXI.Graphics();
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    const band = width(ring) + i * (RING_GAP + width(ring)) * 2;
    graphics.lineStyle({ width: band * HALO_WIDTH, color: ring.color, alpha: brightness(ring) * HALO_ALPHA });
    for (const polygon of region.polygons) graphics.drawShape(polygon);
    graphics.lineStyle({ width: band, color: ring.color, alpha: brightness(ring) });
    for (const polygon of region.polygons) graphics.drawShape(polygon);
  }
  return graphics;
}

function draw(effect: ActiveEffect.Implementation) {
  const sight = magicSightOf(effect);
  if (!sight || !canvas?.ready || !canView(effect) || sight.expires <= Date.now()) return;
  remove(effect.uuid, false);
  const container = new PIXI.Container();
  const tokens = new Map<string, PIXI.Graphics>();
  for (const entry of sight.entries) {
    const doc = fromUuidSync(entry.tokenUuid ?? entry.regionUuid ?? "", { strict: false });
    if (doc instanceof TokenDocument && doc.parent === canvas.scene && doc.object) {
      const graphics = tokenRings(doc.object, entry.rings);
      tokens.set(doc.id!, graphics);
      container.addChild(graphics);
    } else if (doc instanceof RegionDocument && doc.parent === canvas.scene) {
      container.addChild(regionBands(doc, entry.rings));
    }
  }
  sightLayer().addChild(container);
  drawn.set(effect.uuid, { container, tokens });
  // Expiry: the active GM ends the effect when its time is up.
  if (game.users?.activeGM?.isSelf) setTimeout(() => end(effect.uuid), Math.max(0, sight.expires - Date.now()));
}

function end(uuid: string) {
  const effect = fromUuidSync(uuid, { strict: false });
  if (effect instanceof ActiveEffect) effect.delete().catch(() => null);
}

function remove(uuid: string, fade = true) {
  const entry = drawn.get(uuid);
  if (!entry) return;
  drawn.delete(uuid);
  const { container } = entry;
  if (!fade || !canvas?.app) {
    container.destroy({ children: true });
    return;
  }
  const start = performance.now();
  const step = () => {
    const progress = (performance.now() - start) / FADE_MS;
    container.alpha = Math.max(0, 1 - progress);
    if (progress < 1 && !container.destroyed) return;
    canvas!.app!.ticker.remove(step);
    if (!container.destroyed) container.destroy({ children: true });
  };
  canvas.app.ticker.add(step);
}

function drawAll() {
  drawn.clear();
  layer = undefined;
  for (const token of canvas?.scene?.tokens ?? []) {
    for (const effect of token.actor?.effects ?? []) if (magicSightOf(effect)) draw(effect);
  }
}

export function setupMagicSight() {
  Hooks.on("createActiveEffect", (effect: ActiveEffect.Implementation) => { if (magicSightOf(effect)) draw(effect); });
  Hooks.on("deleteActiveEffect", (effect: ActiveEffect.Implementation) => { if (magicSightOf(effect)) remove(effect.uuid); });
  Hooks.on("canvasReady", drawAll);
  Hooks.on("refreshToken", (token: Token.Implementation) => {
    for (const { tokens } of drawn.values()) tokens.get(token.id)?.position.set(token.center.x, token.center.y);
  });
}

/** For tests: the uuids of the Magic Sight effects drawn on this client, with each one's ring and band counts. */
export function drawnMagicSight(): Record<string, { tokens: number; shapes: number }> {
  return Object.fromEntries([...drawn].map(([uuid, { container, tokens }]) => [uuid, { tokens: tokens.size, shapes: container.children.length }]));
}
