/*
 * midi's distance measurement: the "midi-qol" provider of the distance service (service.ts). Its measurement mode,
 * height, walls and gridless fudge, measured on the canvas.
 */
import { MODULE_ID } from "../../../midi-qol.js";
import { tokenOf } from "../../lib/tokenDocumentSet.js";
import { configSettings, safeGetGameSetting } from "../../settings.js";
import { checkWallCollision, closestPerimeterPoints, computeWallBlockPreCheck, createSquareGridProxy, getPlaceable, getTokenPerimeterPolygon, getTokenVisionElevation, measureGridPath, shapesOverlap, spaceToken, tokenSourceCenter, tokenSourceElevation, tokenSourcePosition, wallTestPoints } from "../../utils.js";
import { UNMEASURABLE_DISTANCE, type DistanceOptions, type UnmeasurableReason } from "./service.js";
function measuredDocument(ref: unknown): TokenDocument.Implementation | undefined {
  const entity = typeof ref === "string" ? fromUuidSync(ref, { strict: false }) : ref;
  if (entity instanceof TokenDocument) return entity as TokenDocument.Implementation;
  if (entity instanceof foundry.canvas.placeables.Token) return entity.document as TokenDocument.Implementation;
  // An actor, item or effect: its token on the canvas
  const owner = entity instanceof ActiveEffect ? entity.parent : entity;
  const actor = owner instanceof Actor ? owner : owner instanceof Item ? owner.actor : null;
  return actor ? getPlaceable(actor as Actor.Implementation)?.document as TokenDocument.Implementation | undefined : undefined;
}

export function unmeasurable(t1: unknown, t2: unknown): Exclude<UnmeasurableReason, "blocked"> | undefined {
  if (!canvas?.scene || !canvas.grid || !canvas.dimensions) return "noCanvas";
  const d1 = measuredDocument(t1);
  const d2 = measuredDocument(t2);
  if (!d1 || !d2) return "noPosition";
  if (d1 === d2) return undefined;
  if (!d1.id || !d2.id) return "noPosition";
  if (d1.parent !== d2.parent) return "differentScene";
  if (!tokenOf(d1) || !tokenOf(d2)) return "notDrawn";
  return undefined;
}

/** midi's measurement: the "midi-qol" provider of the distance service */
export function midiDistance(t1: any, t2: any, options: DistanceOptions = {}): number {
  if (unmeasurable(t1, t2)) return UNMEASURABLE_DISTANCE;
  t1 = spaceToken(getPlaceable(t1) ?? t1);
  t2 = spaceToken(getPlaceable(t2) ?? t2);
  const { wallsBlock = false, includeCover = true, includeElevation = configSettings.optionalRules.distanceIncludesHeight } = options;
  const measurementMode = configSettings.optionalRules.distanceMeasurement ?? "center";
  const gridDistance = canvas?.dimensions?.distance ?? 5;
  const fudgeFactor = configSettings.gridlessFudge ?? 0;

  let distance: number = 0;

  if (measurementMode === "default") {
    // Default: use Foundry's core measurePath between token centers
    const token1 = getPlaceable(t1);
    const token2 = getPlaceable(t2);
    if (!token1 || !token2 || !canvas?.grid) return UNMEASURABLE_DISTANCE;
    if (token1 === token2) return 0;
    // Still run wall blocking checks even in default mode
    if (wallsBlock) {
      const preCheck = computeWallBlockPreCheck(token1 as Token.Implementation, token2 as Token.Implementation, wallsBlock, includeCover);
      if (preCheck.blocked) return -1;
      // If no module pre-check resolved (coverVisible is undefined), do a basic center-to-center sight check
      if (preCheck.coverVisible === undefined) {
        const center1 = tokenSourceCenter(token1);
        const center2 = tokenSourceCenter(token2);
        const origin = new PIXI.Point(center1.x, center1.y);
        const dest = new PIXI.Point(center2.x, center2.y);
        const collision = checkWallCollision(origin, dest, {
          source: token1.document,
          wallsBlockRange: configSettings.optionalRules.wallsBlockRange,
          coverVisible: undefined,
          originElevation: getTokenVisionElevation(token1 as Token.Implementation, "visionSourceHeight"),
          destElevation: getTokenVisionElevation(token2 as Token.Implementation, "visionTargetHeight"),
        });
        if (collision) return -1;
      }
    }
    // Committed centres, not the animated ones - see tokenSourceCenter.
    const result = measureGridPath(canvas.grid, [tokenSourceCenter(token1), tokenSourceCenter(token2)]);
    distance = Math.max(0, (result?.distance ?? 0) - fudgeFactor);
  } else if (measurementMode === "center") {
    distance = computeDistance(t1, t2, { wallsBlock, includeCover, includeElevation });
  } else if (measurementMode === "perimeter") {
    // computePerimeterDistance returns raw perimeter-to-perimeter distance (0 for adjacent/overlapping)
    const rawPerimeterDistance = computePerimeterDistance(t1, t2, {
      wallsBlock,
      includeCover,
      includeElevation
    });

    if (rawPerimeterDistance < 0) {
      distance = -1;
    } else {
      // 0 to fudgeFactor → 5 feet (one grid unit)
      // >fudgeFactor → 5 + (rawDistance - fudgeFactor)
      distance = gridDistance + Math.max(0, rawPerimeterDistance - fudgeFactor);
    }
  }
  return distance;
}

/**
 * Compute the height difference between two tokens, accounting for token volume.
 * Returns 0 if elevation ranges overlap, otherwise the gap plus one grid unit.
 */
export function computeTokenHeightDifference(token1: Token, token2: Token): number {
  if (!canvas?.dimensions) return 0;
  const gridDistance = canvas.dimensions.distance ?? 5;

  const { elevation: t1Elevation, width: t1DocWidth, height: t1DocHeight } = tokenSourcePosition(token1);
  const { elevation: t2Elevation, width: t2DocWidth, height: t2DocHeight } = tokenSourcePosition(token2);
  const t1TopElevation = t1Elevation + Math.max(t1DocHeight, t1DocWidth) * gridDistance;
  const t2TopElevation = t2Elevation + Math.min(t2DocHeight, t2DocWidth) * gridDistance;

  // If bottom elevation of either token is within the other's elevation range, no height difference
  if ((t2Elevation > t1Elevation && t2Elevation < t1TopElevation) || (t1Elevation > t2Elevation && t1Elevation < t2TopElevation)) {
    return 0;
  }
  if (t1Elevation < t2Elevation) { // t2 above t1
    return Math.max(0, t2Elevation - t1TopElevation) + gridDistance;
  }
  if (t1Elevation > t2Elevation) { // t1 above t2
    return Math.max(0, t1Elevation - t2TopElevation) + gridDistance;
  }
  return 0;
}

/**
 * Combine a flat (horizontal) distance with a height difference using the
 * current diagonal movement rule. Treats the shorter of the two as the
 * "diagonal" component and the remainder as the "straight" component.
 */
export function combineDistanceWithHeight(distance: number, heightDifference: number): number {
  if (heightDifference <= 0) return distance;

  let nd = Math.min(distance, heightDifference);
  let ns = Math.abs(distance - heightDifference);
  const diagonals = safeGetGameSetting("core", "gridDiagonals");
  const GRID_DIAGONALS = CONST.GRID_DIAGONALS;

  let cd: number;
  switch (diagonals) {
    case GRID_DIAGONALS.EQUIDISTANT: cd = nd; break;
    case GRID_DIAGONALS.EXACT: cd = Math.SQRT2 * nd; break;
    case GRID_DIAGONALS.APPROXIMATE: cd = 1.5 * nd; break;
    case GRID_DIAGONALS.RECTILINEAR: cd = 2 * nd; break;
    case GRID_DIAGONALS.ALTERNATING_1:
      cd = ((nd + 1) & -2) + (nd >> 1);
      break;
    case GRID_DIAGONALS.ALTERNATING_2:
      cd = ((nd + 1) & -2) + (nd >> 1);
      break;
    case GRID_DIAGONALS.ILLEGAL:
      cd = 2 * nd;
      nd = 0;
      ns = distance + heightDifference;
      break;
    default:
      cd = nd;
      break;
  }
  return ns + cd;
}

/** takes two tokens of any size and calculates the distance between them
*** gets the shortest distance betwen two tokens taking into account both tokens size
*** if wallblocking is set then wall are checked
**/
/** -1 when walls block; UNMEASURABLE_DISTANCE (Infinity) when the tokens can't be measured (measureTokens says why) */
export function computeDistance(t1: any /*Token*/, t2: any /*Token*/, options: { wallsBlock?: boolean, includeCover?: boolean, includeElevation?: boolean } = { wallsBlock: false, includeCover: true }): number {
  if (unmeasurable(t1, t2)) return UNMEASURABLE_DISTANCE;
  if (!canvas?.scene || !canvas.grid || !canvas.dimensions) return UNMEASURABLE_DISTANCE;
  t1 = getPlaceable(t1);
  t2 = getPlaceable(t2);
  if (!t1 || !t2) return UNMEASURABLE_DISTANCE;
  let { wallsBlock = false, includeCover = true, includeElevation = configSettings.optionalRules.distanceIncludesHeight } = options;
  const actor = t1.actor;
  t1 = spaceToken(t1);
  t2 = spaceToken(t2);
  const ignoreWallsFlag = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.ignoreWalls`);
  if (ignoreWallsFlag) {
    wallsBlock = false;
  }
  /*
   * Both source positions are read once rather than inside the loops.
   *
   * `tokenSourcePosition` reads `_source` and neither token moves while the rays are built, so
   * these were loop-invariant — the outer one recomputed per square of t1, the inner one per *pair*
   * of squares. For two Gargantuan tokens that is well over a hundred redundant calls for a single
   * distance, on a path taken for every attack, target check and range test.
   */
  const t1Source = tokenSourcePosition(t1);
  const t2Source = tokenSourcePosition(t2);
  const t1DocWidth = t1Source.width;
  const t1DocHeight = t1Source.height;
  const t2DocWidth = t2Source.width;
  const t2DocHeight = t2Source.height;

  const t1StartX = t1DocWidth >= 1 ? 0.5 : t1DocWidth / 2;
  const t1StartY = t1DocHeight >= 1 ? 0.5 : t1DocHeight / 2;
  const t2StartX = t2DocWidth >= 1 ? 0.5 : t2DocWidth / 2;
  const t2StartY = t2DocHeight >= 1 ? 0.5 : t2DocHeight / 2;
  const t1Elevation = t1Source.elevation;
  const t2Elevation = t2Source.elevation;
  const t1TopElevation = t1Elevation + Math.max(t1DocHeight, t1DocWidth) * (canvas.dimensions?.distance ?? 5);
  const t2TopElevation = t2Elevation + Math.min(t2DocHeight, t2DocWidth) * (canvas.dimensions?.distance ?? 5); // assume t2 is trying to make itself small
  const t1VisionElev = getTokenVisionElevation(t1 as Token.Implementation, "visionSourceHeight");
  const t2VisionElev = getTokenVisionElevation(t2 as Token.Implementation, "visionTargetHeight");
  // Module pre-check: full cover means no attack, otherwise skip per-ray los checks
  const preCheck = wallsBlock ? computeWallBlockPreCheck(t1, t2, wallsBlock, includeCover) : { blocked: false, coverVisible: undefined };
  if (preCheck.blocked) return -1;
  const coverVisible = preCheck.coverVisible;

  let segments: { ray: Ray }[] = [];
  let rayDistance, distance;
  let heightDifference = 0;
  if (!(t2.document instanceof WallDocument)) {
    for (let x = t1StartX; x < t1DocWidth; x++) {
      for (let y = t1StartY; y < t1DocHeight; y++) {
        if (y === t1StartY + 1) {
          if (x > t1StartX && x < t1DocWidth - t1StartX) {
            // skip to the last y position;
            y = t1DocHeight - t1StartY;
          }
        }
        const point1 = canvas.grid.getCenterPoint({ x: Math.round(t1Source.x + (canvas.dimensions.size * x)), y: Math.round(t1Source.y + (canvas.dimensions.size * y)) });
        const origin = new PIXI.Point(point1.x, point1.y);
        for (let x1 = t2StartX; x1 < t2DocWidth; x1++) {
          for (let y1 = t2StartY; y1 < t2DocHeight; y1++) {
            if (y1 === t2StartY + 1) {
              if (x1 > t2StartX && x1 < t2DocWidth - t2StartX) {
                // skip to the last y position;
                y1 = t2DocHeight - t2StartY;
              }
            }
            const point2 = canvas.grid.getCenterPoint({ x: Math.round(t2Source.x + (canvas.dimensions.size * x1)), y: Math.round(t2Source.y + (canvas.dimensions.size * y1)) });
            const dest = new PIXI.Point(point2.x, point2.y);
            const r = new foundry.canvas.geometry.Ray(origin, dest);
            if (wallsBlock) {
              const collision = checkWallCollision(origin, dest, {
                source: t1.document,
                wallsBlockRange: configSettings.optionalRules.wallsBlockRange,
                coverVisible,
                originElevation: t1VisionElev,
                destElevation: t2VisionElev,
                originTopElevation: t1TopElevation,
                destTopElevation: t2TopElevation
              });
              if (collision) continue;
            }
            segments.push({ ray: r });
          }
        }
      }
    }
    if (segments.length === 0) {
      return -1;
    }
    rayDistance = segments.map(ray => midiMeasureDistances([ray], { gridSpaces: true }));
    distance = Math.min(...rayDistance);
    if (includeElevation) {
      heightDifference = computeTokenHeightDifference(t1 as Token, t2 as Token);
    }
  } else {
    const w = t2.document
    const t1Center = tokenSourceCenter(t1);
    const closestPoint = foundry.utils.closestPointToSegment(t1Center, w.object.edge.a, w.object.edge.b);
    distance = midiMeasureDistances([{ ray: new foundry.canvas.geometry.Ray(t1Center, closestPoint) }], { gridSpaces: true });
    if (includeElevation) {
      if (!w.flags?.["wall-height"]) heightDifference = 0;
      else {
        const wh = w.flags?.["wall-height"]
        if (wh.top === null && wh.bottom === null) heightDifference = 0;
        else if (wh.top === null) heightDifference = Math.max(0, wh.bottom - t1Elevation);
        else if (wh.bottom === null) heightDifference = Math.max(0, t1Elevation - wh.top);
        else heightDifference = Math.max(0, wh.bottom - t1TopElevation, t1Elevation - wh.top);
      }
    }
  }
  if (includeElevation) {
    distance = combineDistanceWithHeight(distance, heightDifference);
  }
  return Math.max(distance, 0);
}

export function computePerimeterDistance(
  t1: any,
  t2: any,
  options: DistanceOptions = {}
): number {
  let { wallsBlock = false, includeElevation = true, includeCover = true } = options;

  if (!canvas?.scene || !canvas.grid || !canvas.dimensions) return -1;

  const token1 = getPlaceable(t1);
  const token2 = getPlaceable(t2);
  if (!token1 || !token2) return -1;

  // Same token - distance is 0
  if (token1 === token2) return 0;

  // Check ignoreWalls flag
  const actor = (token1 as Token).actor;
  const ignoreWallsFlag = actor ? foundry.utils.getProperty(actor, `flags.${MODULE_ID}.ignoreWalls`) : false;
  if (ignoreWallsFlag) {
    wallsBlock = false;
  }

  const poly1 = getTokenPerimeterPolygon(token1 as Token);
  const poly2 = getTokenPerimeterPolygon(token2 as Token);

  const gridDistance = canvas.dimensions.distance; // typically 5 feet

  // Check if tokens overlap - if so, distance is 0
  if (shapesOverlap(poly1, poly2)) {
    return 0;
  }

  // Find the closest points on each perimeter
  const { p1, p2 } = closestPerimeterPoints(poly1, poly2);

  // Convert to PIXI.Point to match computeDistance behavior
  const origin = new PIXI.Point(p1.x, p1.y);
  const dest = new PIXI.Point(p2.x, p2.y);

  // Check for walls blocking if requested
  if (wallsBlock) {
    const wallsBlockRange = configSettings.optionalRules.wallsBlockRange;
    if (wallsBlockRange !== "none") {
      // Run module pre-checks (simplecover5e, levelsautocover, tokencover)
      const preCheck = computeWallBlockPreCheck(token1 as Token, token2 as Token, wallsBlock, includeCover);
      if (preCheck.blocked) return -1;

      // If no module pre-check resolved it, cast rays from attacker center to
      // a grid of 17 boundary test points on the target (same pattern as _canSenseModes).
      // Block only if ALL rays are blocked by walls.
      if (preCheck.coverVisible === undefined) {
        const srcCenter = tokenSourceCenter(token1);
        const testPoints = wallTestPoints(token2 as Token.Implementation);
        const srcOrigin = new PIXI.Point(srcCenter.x, srcCenter.y);

        const t1Elevation = tokenSourceElevation(token1);
        const t2Elevation = tokenSourceElevation(token2);
        const gridDist = canvas.dimensions?.distance ?? 5;
        const t1DocSize = Math.max((token1 as Token).document.height ?? 1, (token1 as Token).document.width ?? 1);
        const t2DocSize = Math.min((token2 as Token).document.height ?? 1, (token2 as Token).document.width ?? 1);
        const t1TopElevation = t1Elevation + t1DocSize * gridDist;
        const t2TopElevation = t2Elevation + t2DocSize * gridDist;
        const t1VisionElev = getTokenVisionElevation(token1 as Token.Implementation, "visionSourceHeight");
        const t2VisionElev = getTokenVisionElevation(token2 as Token.Implementation, "visionTargetHeight");

        let allBlocked = true;
        for (const tgtPt of testPoints) {
          const collision = checkWallCollision(srcOrigin, tgtPt, {
            source: (token1 as Token).document,
            wallsBlockRange,
            coverVisible: preCheck.coverVisible,
            originElevation: t1VisionElev,
            destElevation: t2VisionElev,
            originTopElevation: t1TopElevation,
            destTopElevation: t2TopElevation
          });
          if (!collision) { allBlocked = false; break; }
        }
        if (allBlocked) {
          return -1;
        }
      }
      // coverVisible === true means module says not blocked — continue to distance calc
    }
  }

  // Calculate raw distance between closest perimeter points
  // The approach depends on the grid type and diagonal mode setting
  const isGridless = canvas.grid.isGridless;
  const useGriddedGridless = isGridless && configSettings.griddedGridless;

  let distance: number;

  if (isGridless && !useGriddedGridless) {
    // Pure gridless: calculate raw euclidean distance directly
    const dx = dest.x - origin.x;
    const dy = dest.y - origin.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const gridSize = canvas.dimensions?.size ?? 100;
    distance = (pixelDistance / gridSize) * gridDistance;
  } else if (useGriddedGridless) {
    // Gridless with griddedGridless: use proxy to treat as SquareGrid
    // measurePath on the proxy will use SquareGrid's _measurePath which respects diagonal mode
    const canvasGridProxy = createSquareGridProxy();
    const result = measureGridPath(canvasGridProxy, [origin, dest]);
    distance = result?.distance ?? 0;
  } else {
    // Gridded scene: measurePath calculates distance respecting diagonal mode
    const result = measureGridPath(canvas.grid, [origin, dest]);
    distance = result?.distance ?? 0;
  }

  // Include elevation difference if requested, using diagonal-aware combination
  if (includeElevation) {
    const heightDifference = computeTokenHeightDifference(token1 as Token, token2 as Token);
    distance = combineDistanceWithHeight(distance, heightDifference);
  }

  return distance;
}

export function midiMeasureDistances(segments: { ray: Ray }[], options: any = {}) {
  let isGridless = canvas.grid?.constructor.name === "GridlessGrid";
  const fudgeFactor = configSettings.gridlessFudge ?? 0;
  // The fudge applies on every scene and grid type, not only the gridded-gridless path below.
  // Floored at 0: a zero gap stays zero, only perimeter measurement floors at one grid unit.
  if (!isGridless || !options.gridSpaces || !configSettings.griddedGridless || !canvas.grid) {
    return segments.map(s => canvas.grid ? measureGridPath(canvas.grid, [s.ray.A, s.ray.B]) : undefined)
      .map(d => Math.max(0, (d?.distance ?? 0) - fudgeFactor));
  }
  if (!canvas.grid) return [0];
  const diagonals = safeGetGameSetting("core", "gridDiagonals");
  const canvasGridProxy = createSquareGridProxy();
  const GridDiagonals = CONST.GRID_DIAGONALS;
  // First snap the poins to the nearest center point for equidistant/1,2,1/2,1,2
  // I expected this would happen automatically in the proxy call - but didn't and not sure why.
  if ([GridDiagonals.APPROXIMATE, GridDiagonals.EQUIDISTANT, GridDiagonals.ALTERNATING_1, GridDiagonals.ALTERNATING_2].includes(diagonals)) {
    segments = segments.map(s => {
      const gridPosA = canvasGridProxy.getOffset(s.ray.A);
      const aCenter = canvasGridProxy.getCenterPoint(gridPosA);
      const gridPosB = canvasGridProxy.getOffset(s.ray.B);
      const bCenter = canvasGridProxy.getCenterPoint(gridPosB);
      return { ray: new foundry.canvas.geometry.Ray(aCenter, bCenter) };
    });
  }
  let distances = segments.map(s => measureGridPath(canvasGridProxy, [s.ray.A, s.ray.B]));
  return distances.map(d => {
    if (!d) return 0;
    let distance = d.distance;
    switch (diagonals) {
      case GridDiagonals.EQUIDISTANT:
      case GridDiagonals.ALTERNATING_1:
      case GridDiagonals.ALTERNATING_2:
        // already fudged by snapping so no extra adjustment
        break;
      case GridDiagonals.EXACT:
      case GridDiagonals.RECTILINEAR:
        if (d.diagonals > 0)
          distance = Math.max(0, d.distance - (Math.SQRT2 * fudgeFactor));
        else distance = Math.max(0, d.distance - fudgeFactor);
        break;
      case GridDiagonals.APPROXIMATE:
        if (d.diagonals > 0)
          distance = Math.max(0, d.distance - fudgeFactor);
        break;
      case GridDiagonals.ILLEGAL:
      default:
        distance = d.distance;
    }
    return distance;
  });
}
