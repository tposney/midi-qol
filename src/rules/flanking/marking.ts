/*
 * The flanking rule's statuses (Flanking on an attacker, Flanked on a target: markers, the rule's contributors give
 * the advantage or bonus) and its grid highlight of where an ally could stand to flank.
 */
import { configSettings } from "../../module/settings.js";
import { installedModules } from "../../module/setupModules.js";
import { unTimedExecuteAsGM } from "../../module/GMAction.js";
import { CEAddEffectWith, CEHasEffectApplied, CERemoveEffect, getFlankedEffect, getFlankingEffect, measureGridPath, toggleStatus } from "../../module/utils.js";
import { getDistance } from "../../module/services/distance/service.js";
import { computeFlankedStatus, computeFlankingStatus } from "../../module/services/flanking/service.js";
import { getHexCentroid } from "./geometry.js";
import { crossesOppositeSides, opposedByAngle } from "./math.js";
import { currentFlankingMode } from "./index.js";

let _markFlankingPromise: Promise<boolean> = Promise.resolve(false);
export function markFlanking(token?: Token.Implementation | null, target?: Token.Implementation | null): Promise<boolean> {
  _markFlankingPromise = _markFlankingPromise.then(
    () => _markFlankingImpl(token, target),
    () => _markFlankingImpl(token, target)
  );
  return _markFlankingPromise;
}

async function _markFlankingImpl(token?: Token.Implementation | null, target?: Token.Implementation | null): Promise<boolean> {
  if (!canvas) return false;
  if (!target || !target?.actor) return false;
  const flankingMode = currentFlankingMode();
  if (!flankingMode || flankingMode === "off") return false;

  const isFlankingMode = ["advonly", "ceonly", "midiFlanking"].includes(flankingMode);
  const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
  const skipAttackerStatus = (configSettings.optionalRules?.flankingBonus ?? "advantage") !== "advantage";

  if (isFlankingMode) {
    // Attacker-side flanking: requires both token and target
    if (!token || token === target) return false;
    const needsFlanking = await computeFlankingStatus(token, target);
    if (skipAttackerStatus) return needsFlanking;

    // Apply flanking status to attacker (advantage mode only)
    if (flankingMode === "ceonly") {
      if (installedModules.get("dfreds-convenient-effects")) {
        let CEFlanking = getFlankingEffect();
        if (!CEFlanking) return needsFlanking;
        const hasFlanking = CEHasEffectApplied({ effectName: CEFlanking.name ?? "Flanking", uuid: token.actor?.uuid ?? "" });
        if (needsFlanking && !hasFlanking && token.actor) {
          await CEAddEffectWith({ effectName: CEFlanking.name ?? "Flanking", uuid: token.actor.uuid, overlay: false });
        } else if (!needsFlanking && hasFlanking && token.actor) {
          await CERemoveEffect({ effectName: CEFlanking.name ?? "Flanking", uuid: token.actor.uuid });
        }
      }
    } else if (flankingMode === "midiFlanking") {
      const MidiFlanking: any = CONFIG.statusEffects.find(se => se.id === "flanking");
      if (!MidiFlanking) return false;
      if (!token.actor?.isOwner) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: token.actor?.uuid, statusId: MidiFlanking.id, options: { active: needsFlanking } });
      else await toggleStatus(token.actor, MidiFlanking.id, { active: needsFlanking });
    }
    // advonly: no status to apply
    return needsFlanking;

  } else if (isFlankedMode) {
    // Target-side flanked: applies status to target
    if (!target.actor) return false;
    const needsFlanked = await computeFlankedStatus(target);

    if (["ceflanked", "ceflankedNoconga"].includes(flankingMode)) {
      if (installedModules.get("dfreds-convenient-effects")) {
        let CEFlanked = getFlankedEffect();
        if (!CEFlanked) return false;
        const hasFlanked = CEHasEffectApplied({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid });
        if (needsFlanked && !hasFlanked && target.actor) {
          await CEAddEffectWith({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid, overlay: false });
        } else if (!needsFlanked && hasFlanked && token?.actor) {
          await CERemoveEffect({ effectName: CEFlanked.name ?? "Flanked", uuid: target.actor.uuid });
        }
      }
    } else if (["midiFlanked", "midiFlankedNoConga"].includes(flankingMode)) {
      const MidiFlanked = CONFIG.statusEffects.find(se => se.id === "flanked");
      if (!MidiFlanked) return false;
      if (!target.actor.isOwner) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: target.actor.uuid, statusId: MidiFlanked.id, options: { active: needsFlanked } });
      else await toggleStatus(target.actor, MidiFlanked.id, { active: needsFlanked });
    }
    return needsFlanked;
  }
  return false;
}

export async function chackFlanking(user: User.Implementation, target: Token.Implementation, targeted: boolean): Promise<boolean> {
  if (user.id !== game.user?.id) return false;
  let token = canvas.tokens?.controlled[0];
  if (user.targets.size === 1) return markFlanking(token, target);
  return false

}

let flankingHighlightContainer: PIXI.Container | null = null;

/**
 * Get the flanking icon path based on the current flanking mode.
 */
function getFlankingHighlightIcon(): string {
  const flankingMode = currentFlankingMode();
  const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
  return isFlankedMode ? "modules/midi-qol/icons/encirclement.svg" : "icons/svg/sword.svg";
}

/**
 * Update the flanking highlight overlay. Called when token selection or targeting changes.
 * Highlights grid cells around the current target where an ally could stand to create
 * a flanking condition with the currently selected token using icon sprites.
 */
export async function updateFlankingHighlight(): Promise<void> {
  if (!canvas?.grid || !canvas.interface?.grid) return;

  // Clear previous sprites
  if (flankingHighlightContainer) {
    flankingHighlightContainer.destroy({ children: true });
    flankingHighlightContainer = null;
  }

  // Early exits: setting disabled, flanking mode off, gridless (no cells to highlight)
  if (!configSettings.optionalRules?.showFlankingHighlight) return;
  const flankingMode = currentFlankingMode();
  if (!flankingMode || flankingMode === "off") return;
  if (canvas.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) return;

  // Need exactly one controlled token and one target
  const token = canvas.tokens?.controlled?.[0];
  const target = game.user?.targets?.first();
  if (!token || !target || token === target) return;
  if (!canvas.dimensions) return;

  // Check selected token is within melee range of target (allow reach if equipped)
  const gridDist = canvas.dimensions.distance ?? 5;
  let tokenRange = 1;
  // @ts-expect-error no dnd5e-types
  if (token.actor?.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)) {
    tokenRange = 2;
  }
  const tokenDist = getDistance(token, target, { wallsBlock: true });
  if (tokenDist < 0 || tokenDist > tokenRange * gridDist) return;

  const gridW = canvas.grid.sizeX ?? 100;
  const gridH = canvas.grid.sizeY ?? 100;

  // Adjacency distance — matches computeFlankingStatus logic
  let maxDist = gridDist;
  if (game.settings.get("core", "gridDiagonals") === 1) maxDist *= Math.sqrt(2);

  // Get target's occupied offsets and their centers for adjacency checks
  const targetOffsets = target.document.getOccupiedGridSpaceOffsets();
  const targetOffsetSet = new Set(targetOffsets.map((o: {i: number, j: number}) => `${o.i},${o.j}`));
  const targetCellCenters = targetOffsets.map((o: {i: number, j: number}) => canvas.grid!.getCenterPoint(o));

  // Expand target bounds by 2 cells in each direction to find candidate cells
  const bounds = {
    x: target.x - 2 * gridW,
    y: target.y - 2 * gridH,
    width: target.document.width * gridW + 4 * gridW,
    height: target.document.height * gridH + 4 * gridH,
  };
  const [i0, j0, i1, j1] = canvas.grid.getOffsetRange(bounds);

  // The target's box for the square-grid opposite-sides test
  const targetBox = canvas.grid.isHexagonal ? undefined
    : { x: target.x, y: target.y, width: target.document.width * gridW, height: target.document.height * gridH };

  // Build token grid points (same multi-square logic as computeFlankingStatus)
  // Use measurePath against target cell centers for hex-grid compatibility
  const tokenPoints: { x: number; y: number }[] = [];
  const tokenStartX = -Math.max(0, token.document.width / 2 - 0.5);
  const tokenStartY = -Math.max(0, token.document.height / 2 - 0.5);
  const tokenMaxDist = tokenRange * maxDist + 1; // +1 tolerance for hex precision
  for (let x = tokenStartX; x < token.document.width / 2; x++) {
    for (let y = tokenStartY; y < token.document.height / 2; y++) {
      const tx = token.center.x + x * gridW;
      const ty = token.center.y + y * gridH;
      let closeEnough = false;
      for (const tc of targetCellCenters) {
        const d = measureGridPath(canvas.grid, [{ x: tx, y: ty }, tc])?.distance ?? Infinity;
        if (d <= tokenMaxDist) { closeEnough = true; break; }
      }
      if (!closeEnough) continue;
      tokenPoints.push({ x: tx, y: ty });
    }
  }
  if (tokenPoints.length === 0) return;

  // Hex flanking uses centroid + angle
  const centroid = canvas.grid.isHexagonal ? getHexCentroid(target) : undefined;

  // Collect valid cell positions
  const validCells: { i: number; j: number }[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      // Skip cells occupied by the target
      if (targetOffsetSet.has(`${i},${j}`)) continue;

      const cellCenter = canvas.grid.getCenterPoint({ i, j });

      // Check candidate is adjacent to target using measurePath against occupied cell centers
      // Add small tolerance (1ft) for floating-point imprecision in hex center coordinates
      let isAdjacent = false;
      for (const tc of targetCellCenters) {
        const d = measureGridPath(canvas.grid, [cellCenter, tc])?.distance ?? Infinity;
        if (d > 0 && d <= maxDist + 1) { isAdjacent = true; break; }
      }
      if (!isAdjacent) continue;

      let isValid = false;

      if (canvas.grid.isHexagonal && centroid) {
        // Hex flanking: check angle from centroid
        for (const tp of tokenPoints) {
          if (opposedByAngle(centroid, canvas.grid.getCenterPoint(tp), cellCenter)) {
            isValid = true;
            break;
          }
        }
      } else if (targetBox) {
        // Square grid: a line through opposite sides
        for (const tp of tokenPoints) {
          if (crossesOppositeSides(targetBox, canvas.grid.getCenterPoint(tp), cellCenter)) {
            isValid = true;
            break;
          }
        }
      }

      if (isValid) validCells.push({ i, j });
    }
  }

  if (validCells.length === 0) return;

  // Load the flanking icon texture and place sprites
  const iconPath = getFlankingHighlightIcon();
  let texture: PIXI.Texture;
  try {
    texture = await PIXI.Assets.load(iconPath);
  } catch {
    return;
  }
  if (!texture?.valid) return;

  // Re-check state after async load — selection/target may have changed
  if (!canvas?.interface?.grid) return;
  if (canvas.tokens?.controlled?.[0] !== token) return;
  if (game.user?.targets?.first() !== target) return;

  flankingHighlightContainer = new PIXI.Container();
  flankingHighlightContainer.name = "midi-qol-flanking-highlight";
  flankingHighlightContainer.zIndex = (CONFIG.Canvas.groups.interface.zIndexScrollingText ?? 1100) - 1;
  flankingHighlightContainer.sortableChildren = false;
  flankingHighlightContainer.eventMode = "none";
  canvas.interface.addChild(flankingHighlightContainer);

  const spriteSize = Math.min(gridW, gridH) * 0.8;
  for (const { i, j } of validCells) {
    const center = canvas.grid.getCenterPoint({ i, j });
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(center.x, center.y);
    sprite.width = spriteSize;
    sprite.height = spriteSize;
    sprite.alpha = 0.6;
    sprite.tint = 0xFF6600;
    flankingHighlightContainer.addChild(sprite);
  }
}

