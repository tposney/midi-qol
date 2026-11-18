/*
 * midi's flanking geometry: the "midi-qol" provider of the flanking service (service.ts). Reads the canvas (positions,
 * sizes, dispositions, the grid) and asks rules.ts for the geometry.
 */
import { getDistance } from "../distance/service.js";
import { computePerimeterDistance } from "../distance/provider.js";
import { debugEnabled, MODULE_ID } from "../../../midi-qol.js";
import { checkRule, configSettings } from "../../settings.js";
import { installedModules } from "../../setupModules.js";
import { canSense, CEHasEffectApplied, checkIncapacitated, createConditionData, evalCondition, findNearby, getFlankedEffect, hasCondition, isValidTarget, tokenSourceCenter, tokenSourcePosition } from "../../utils.js";
import { crossesOppositeSides, FLANKED_MODES, opposedByAngle } from "./rules.js";
export function heightIntersects(targetDocument: TokenDocument.Implementation, flankerDocument: TokenDocument.Implementation): boolean {
  const target = tokenSourcePosition(targetDocument);
  const flanker = tokenSourcePosition(flankerDocument);
  const targetElevation = target.elevation;
  const flankerElevation = flanker.elevation;
  const targetTopElevation = targetElevation + Math.max(target.height, target.width) * (canvas.dimensions?.distance ?? 5);
  const flankerTopElevation = flankerElevation + Math.min(flanker.height, flanker.width) * (canvas.dimensions?.distance ?? 5); // assume t2 is trying to make itself small
  /* This is for requiring the centers to intersect the height range 
     Which is an alternative rule possiblity
  const flankerCenter = (flankerElevation + flankerTopElevation) / 2;
  if (flankerCenter >= targetElevation || flankerCenter <= targetTopElevation) return true;
  return false;
  */
  if (flankerTopElevation < targetElevation || flankerElevation > targetTopElevation) return false;
  return true;
}
/**
 * Check if a grid cell (identified by pixel coordinates of a point within it) is adjacent to a target token,
 * using purely geometric bounding-box distance. This avoids measurement-mode-dependent calculations
 * (center vs perimeter) that cause inconsistencies with diagonal adjacency under different grid diagonal settings.
 *
 * @param cellPoint - A point within the candidate grid cell (e.g. a token's grid-square center)
 * @param target - The target token to check adjacency against
 * @param maxDistCells - Maximum distance in grid cells (1 for adjacent/5ft, 2 for reach/10ft)
 * @returns true if the cell's bounding box is within maxDistCells of the target's bounding box
 */
function isCellAdjacentToToken(cellPoint: { x: number; y: number }, target: Token.Implementation, maxDistCells: number = 1): boolean {
  if (!canvas?.grid) return false;
  const gridW = canvas.grid.sizeX;
  const gridH = canvas.grid.sizeY;

  // Get the cell's top-left from the point, then compute its bounding box
  const cellTopLeft = canvas.grid.getTopLeftPoint(cellPoint);
  const cellLeft = cellTopLeft.x;
  const cellTop = cellTopLeft.y;
  const cellRight = cellLeft + gridW;
  const cellBottom = cellTop + gridH;

  // Target bounding box
  const targetPos = tokenSourcePosition(target);
  const targetLeft = targetPos.x;
  const targetTop = targetPos.y;
  const targetRight = targetPos.x + targetPos.width * gridW;
  const targetBottom = targetPos.y + targetPos.height * gridH;

  // Compute the gap between the two bounding boxes along each axis
  const dx = Math.max(0, cellLeft - targetRight, targetLeft - cellRight);
  const dy = Math.max(0, cellTop - targetBottom, targetTop - cellBottom);

  // For adjacent cells (maxDistCells=1), gap must be 0 (touching/overlapping)
  // For reach cells (maxDistCells=2), gap must be at most 1 grid cell
  const maxGap = (maxDistCells - 1) * Math.max(gridW, gridH);
  // Use Chebyshev-style check: both dx and dy must be within maxGap
  // (since grid adjacency is 8-directional, not Euclidean)
  return dx <= maxGap && dy <= maxGap;
}

/**
 * Get the distance between two tokens for flanking purposes.
 * On gridless scenes, always uses perimeter measurement so that tokens
 * whose borders are close together are correctly identified as adjacent,
 * even when their centers are far apart (e.g. large tokens).
 */
function getFlankingDistance(t1: Token.Implementation, t2: Token.Implementation): number {
  const gridDist = canvas?.dimensions?.distance ?? 5;
  const fudge = configSettings.gridlessFudge ?? 0;
  if (canvas?.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) {
    const raw = computePerimeterDistance(t1, t2, { wallsBlock: true, includeElevation: false });
    if (raw < 0) return -1;
    return gridDist + Math.max(0, raw - fudge);
  }
  return getDistance(t1, t2, { wallsBlock: true });
}

export function findPotentialFlankers(target: Token.Implementation) {
  const gridDist = canvas?.dimensions?.distance ?? 5;
  const isGridless = canvas?.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS;
  const requiresVisibility = configSettings.optionalRules.flankingRequiresVisibility;

  let allies: Token.Implementation[];
  let reachAllies: Token.Implementation[];

  if (isGridless) {
    // On gridless, use perimeter-based distance for finding nearby flankers
    const canvasPlaceables = canvas?.tokens?.placeables ?? [];
    const allNearby = canvasPlaceables.filter(t => {
      if (!isValidTarget(t)) return false;
      if (!t.actor) return false;
      if (t.id === target.id) return false;
      if (checkIncapacitated(t.actor, debugEnabled > 0, false)) return false;
      if (t.document.disposition === target.document.disposition) return false;
      if (requiresVisibility && !canSense(target, t)) return false;
      const dist = getFlankingDistance(t, target);
      return dist >= 0 && dist <= gridDist;
    });
    const reachNearby = canvasPlaceables.filter(t => {
      if (!isValidTarget(t)) return false;
      if (!t.actor) return false;
      if (t.id === target.id) return false;
      if (checkIncapacitated(t.actor, debugEnabled > 0, false)) return false;
      if (t.document.disposition === target.document.disposition) return false;
      if (requiresVisibility && !canSense(target, t)) return false;
      if (allNearby.some(a => a === t)) return false;
      //@ts-expect-error no dnd5e-types
      if (!t.actor.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)) return false;
      const dist = getFlankingDistance(t, target);
      return dist >= 0 && dist <= 2 * gridDist;
    });
    allies = allNearby.concat(reachNearby);
  } else {
    const nearbyOptions = requiresVisibility ? { isSeen: true } : {};
    allies = findNearby(-1, target, gridDist, nearbyOptions);
    reachAllies = findNearby(-1, target, 2 * gridDist, nearbyOptions).filter(
      ally => !(allies.some(tk => tk === ally)) &&
        //@ts-expect-error no dnd5e-types
        ally.actor?.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)
    );
    allies = allies.concat(reachAllies);
  }
  return allies;
}

/**
 * Compute the centroid (average pixel position) of a token's occupied hex centers.
 * Falls back to the token document's center if the grid is not hexagonal or offsets can't be obtained.
 */
export function getHexCentroid(target: Token.Implementation): { x: number; y: number } {
  if (!canvas?.grid?.isHexagonal) return tokenSourceCenter(target);
  const offsets = target.document.getOccupiedGridSpaceOffsets(tokenSourcePosition(target));
  if (!offsets.length) return tokenSourceCenter(target);
  let sumX = 0, sumY = 0;
  for (const offset of offsets) {
    const center = canvas.grid.getCenterPoint(offset);
    sumX += center.x;
    sumY += center.y;
  }
  return { x: sumX / offsets.length, y: sumY / offsets.length };
}

/**
 * Angle-based flanking test: checks if token and ally are >= 150° apart
 * as seen from a reference point (centroid for hex, center for gridless).
 * Used for hex grids and gridless scenes where ray-through-edges doesn't apply.
 */
function isAngleFlanking(
  token: Token.Implementation,
  ally: Token.Implementation,
  target: Token.Implementation
): boolean {
  // Use hex centroid for hex grids, target center for gridless
  const referencePoint = canvas?.grid?.isHexagonal ? getHexCentroid(target) : tokenSourceCenter(target);
  const tokenCenter = tokenSourceCenter(token);
  const allyCenter = tokenSourceCenter(ally);
  return opposedByAngle(referencePoint, tokenCenter, allyCenter);
}


// TODO: Can definitely probably clean this up some
/** midi's flanked geometry: the "midi-qol" provider of the flanking service */
export async function midiFlankedStatus(target: Token.Implementation): Promise<boolean> {
  if (!checkRule("checkFlanking") || !FLANKED_MODES.includes(checkRule("checkFlanking") as string)) return false;
  if (!canvas || !target) return false;
  const allies = findPotentialFlankers(target);
  if (allies.length <= 1) return false; // length 1 means no other allies nearby
  const gridW = canvas.grid?.sizeX ?? 100;
  const gridH = canvas.grid?.sizeY ?? 100;
  // Committed corners: the placeable reads 0,0 in a background tab and the document interpolates mid-move - see tokenSourcePosition.
  const targetPos = tokenSourcePosition(target);
  const targetX = targetPos.x;
  const targetY = targetPos.y;
  const targetBox = { x: targetX, y: targetY, width: targetPos.width * gridW, height: targetPos.height * gridH };

  while (allies.length > 1) {
    const token = allies.pop();
    if (!token) break;
    if (!heightIntersects(target.document, token.document)) continue;
    if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
      const CEFlanked = getFlankedEffect();
      const hasFlanked = token.actor && CEFlanked && CEHasEffectApplied({ effectName: CEFlanked.name, uuid: token.actor.uuid });
      if (hasFlanked) continue;
    } else if (checkRule("checkFlanking") === "midiFlankedNoConga") {
      const hasFlanked = token.actor && hasCondition(token.actor, "flanked");
      if (hasFlanked) continue;
    }
    if (token.actor?.flags?.[MODULE_ID]?.canFlank !== undefined) {
      const conditionData = createConditionData({ actor: token.actor, token, target });
      const tokenCanFlank = await evalCondition(token.actor.flags[MODULE_ID]?.canFlank, conditionData, undefined);
      if (tokenCanFlank === false) continue;
    }
    // Loop through each square covered by attacker and ally
    // Use geometric bounding-box adjacency instead of distancePointToken to avoid
    // measurement-mode-dependent distance calculations (center vs perimeter)
    const tokenPos = tokenSourcePosition(token);
    const tokenStartX = -Math.max(0, tokenPos.width / 2 - 0.5);
    const tokenStartY = -Math.max(0, tokenPos.height / 2 - 0.5);
    const tokenCenter = tokenSourceCenter(token);
    const tokenPoints: any[] = [];
    for (let x = tokenStartX; x < tokenPos.width / 2; x++) {
      for (let y = tokenStartY; y < tokenPos.height / 2; y++) {
        let tx = tokenCenter.x + x * gridW;
        let ty = tokenCenter.y + y * gridH;
        if (!isCellAdjacentToToken({ x: tx, y: ty }, target)) continue;
        tokenPoints.push({ x: tx, y: ty });
      }
    }
    for (let ally of allies) {
      if (ally.document.uuid === token.document.uuid) continue;
      const actor: any = ally.actor;
      if (actor?.system.attributes?.hp?.value <= 0) continue;
      if (!heightIntersects(target.document, ally.document)) continue;
      if (hasCondition(actor, "incapacitated")) continue;
      if (checkRule("checkFlanking") === "ceflankedNoconga" && installedModules.get("dfreds-convenient-effects")) {
        const CEFlanked = getFlankedEffect();
        const hasFlanked = CEFlanked && CEHasEffectApplied({ effectName: CEFlanked.name, uuid: ally.actor?.uuid ?? "" });
        if (hasFlanked) continue;
      }
      if (checkRule("checkFlanking") === "midiFlankedNoConga") {
        const hasFlanked = hasCondition(actor, "flanked");
        if (hasFlanked) continue
      }
      // Hex grid or gridless: use angle-based flanking instead of ray-edge intersection
      if (canvas.grid?.isHexagonal || canvas.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) {
        if (isAngleFlanking(token, ally, target)) return true;
        continue;
      }
      const allyPos = tokenSourcePosition(ally);
      const allyStartX = -Math.max(0, allyPos.width / 2 - 0.5);
      const allyStartY = -Math.max(0, allyPos.height / 2 - 0.5);
      const allyCenter = tokenSourceCenter(ally);
      const allyPoints: any[] = [];
      for (let x1 = allyStartX; x1 < allyPos.width / 2; x1++) {
        for (let y1 = allyStartY; y1 < allyPos.height / 2; y1++) {
          let ax = allyCenter.x + x1 * gridW;
          let ay = allyCenter.y + y1 * gridH;
          if (!isCellAdjacentToToken({ x: ax, y: ay }, target)) continue;
          allyPoints.push({ x: ax, y: ay });
        }
      }
      for (let tokenPoint of tokenPoints) {
        for (let allyPoint of allyPoints) {
          const p1 = canvas.grid?.getCenterPoint(tokenPoint)
          const p2 = canvas.grid?.getCenterPoint(allyPoint);
          if (!p1 || !p2) continue;
          if (crossesOppositeSides(targetBox, p1, p2)) return true;
        }
      }
    }
  }
  return false;
}

// TODO Can definitely probably clean this up
/** midi's flanking geometry: the "midi-qol" provider of the flanking service */
export async function midiFlankingStatus(token: Token.Implementation, target: Token.Implementation): Promise<boolean> {
  if (!checkRule("checkFlanking") || checkRule("checkFlanking") === "off") return false;
  if (!canvas) return false;
  if (!token) return false;
  // For the target see how many square between this token and any friendly targets
  // Find all tokens hostile to the target
  if (!target) return false;
  if (!heightIntersects(target.document, token.document)) return false;
  let range = 1;
  // @ts-expect-error no dnd5e-types
  if (token.actor?.items.contents.some(item => item.system?.properties?.has("rch") && item.system.equipped)) {
    range = 2;
  }
  const flankingDistance = getFlankingDistance(token, target);
  if (flankingDistance < 0 || flankingDistance > range * (canvas.dimensions?.distance ?? 5)) return false;
  // an enemy's enemies are my friends.
  const allies = findPotentialFlankers(target)

  if (!token.document.disposition) return false; // Neutral tokens can't get flanking
  if (allies.length <= 1) return false; // length 1 means no other allies nearby
  const gridW = canvas.grid?.sizeX ?? 100;
  const gridH = canvas.grid?.sizeY ?? 100;
  // Committed corners: the placeable reads 0,0 in a background tab and the document interpolates mid-move - see tokenSourcePosition.
  const targetPos = tokenSourcePosition(target);
  const targetX = targetPos.x;
  const targetY = targetPos.y;
  const targetBox = { x: targetX, y: targetY, width: targetPos.width * gridW, height: targetPos.height * gridH };

  // Loop through each square covered by attacker and ally
  // Use geometric bounding-box adjacency instead of distancePointToken to avoid
  // measurement-mode-dependent distance calculations (center vs perimeter)
  const tokenPos = tokenSourcePosition(token);
  const tokenStartX = -Math.max(0, tokenPos.width / 2 - 0.5);
  const tokenStartY = -Math.max(0, tokenPos.height / 2 - 0.5);
  const tokenCenter = tokenSourceCenter(token);
  const tokenPoints: any[] = [];
  for (let x = tokenStartX; x < tokenPos.width / 2; x++) {
    for (let y = tokenStartY; y < tokenPos.height / 2; y++) {
      let tx = tokenCenter.x + x * gridW;
      let ty = tokenCenter.y + y * gridH;
      if (!isCellAdjacentToToken({ x: tx, y: ty }, target)) continue;
      tokenPoints.push({ x: tx, y: ty });
    }
  }
  for (let ally of allies) {
    if (ally.document.uuid === token.document.uuid) continue;
    if (!heightIntersects(ally.document, target.document)) continue;
    const actor: any = ally.actor;
    if (checkIncapacitated(ally.actor, debugEnabled > 0, false)) continue;
    if (hasCondition(actor, "incapacitated")) continue;
    if (ally.actor?.flags?.[MODULE_ID]?.canFlank !== undefined) {
      const conditionData = createConditionData({ actor: ally.actor, token: ally, target });
      const allyCanFlank = await evalCondition(ally.actor.flags[MODULE_ID]?.canFlank, conditionData, undefined);
      if (allyCanFlank === false) continue;
    }
    // Hex grid or gridless: use angle-based flanking instead of ray-edge intersection
    if (canvas.grid?.isHexagonal || canvas.scene?.grid.type === CONST.GRID_TYPES.GRIDLESS) {
      if (isAngleFlanking(token, ally, target)) return true;
      continue;
    }
    const allyPos = tokenSourcePosition(ally);
    const allyStartX = -Math.max(0, allyPos.width / 2 - 0.5);
    const allyStartY = -Math.max(0, allyPos.height / 2 - 0.5);

    const allyCenter = tokenSourceCenter(ally);
    const allyPoints: any[] = [];
    for (let x1 = allyStartX; x1 < allyPos.width / 2; x1++) {
      for (let y1 = allyStartY; y1 < allyPos.height / 2; y1++) {
        let ax = allyCenter.x + x1 * gridW;
        let ay = allyCenter.y + y1 * gridH;
        if (!isCellAdjacentToToken({ x: ax, y: ay }, target)) {
          continue;
        }
        allyPoints.push({ x: ax, y: ay });
      }
    }
    for (let tokenPoint of tokenPoints) {
      for (let allyPoint of allyPoints) {
        const p1 = canvas.grid?.getCenterPoint(tokenPoint)
        const p2 = canvas.grid?.getCenterPoint(allyPoint);
        if (!p1 || !p2) continue;
        if (crossesOppositeSides(targetBox, p1, p2)) return true;
      }
    }
  }
  return false;
}
