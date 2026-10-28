import { i18n } from "../../midi-qol.js";
import { configSettings } from "../settings.js";

// Shades the squares of lower floors, seen through openings in the viewed level's floor, where a creature
// standing there would not be shown: the line from the eye is blocked by a floor edge or a lower level's wall.
// Core draws the lower floor through the opening but hides its tokens, so players assume nobody is there.
// The test is core's own sight detection, so the cue always agrees with what core shows.
// Review on Foundry upgrades: rebuilds CanvasVisibility#testVisibility's sight loop to name the target's level
// (core takes it only from a Token) and uses CanvasVisibility#_createVisibilityTestConfig.

// Work per animation frame (under the browser's 50ms long task); ~25ms for ~1000 squares, so usually one frame
const SLICE_MS = 32;
// Debug: CONFIG.debug.midiHiddenGround = true labels each tested square "column,row" and its result
// (H hidden/shaded, S seen, - not an opening in range, or under unexplored fog)
const DEBUG_KEY = "midiHiddenGround";

interface LevelLike { id: string; elevation: { bottom: number; top: number; base: number } }
interface SurfaceLike { elevation: number; region: { polygonTree: { clipperPaths: ClipperLib.Path[] } } }
interface VisionSourceLike {
  active: boolean;
  isBlinded: boolean;
  los: PIXI.Polygon & { config: Record<string, unknown> & { hasLimitedAngle?: boolean }; toClipperPoints(options: { scalingFactor: number }): ClipperLib.Path };
  origin: { x: number; y: number; elevation: number };
  level?: LevelLike;
  priority?: number;
  object: { document: ViewerDocument; animationContexts?: Map<string, unknown> };
}
interface ViewerDocument {
  detectionModes: Record<string, unknown>;
  getVisibilityTestPoints(data: { x: number; y: number; width: number; height: number; elevation: number; level?: string }): Array<{ x: number; y: number; elevation: number }>;
}
interface VisibilityTest { level: LevelLike; point: { x: number; y: number; elevation: number }; los: Map<VisionSourceLike, boolean> }
interface VisibilityTestConfig { level: LevelLike; tests: VisibilityTest[] }
interface DetectionModeLike { testVisibility(source: VisionSourceLike, mode: unknown, config: VisibilityTestConfig): boolean }
interface PolygonBackendLike { testCollision(origin: object, destination: object, config: Record<string, unknown>): boolean }
interface LightSourceLike { active: boolean; data: { vision: boolean }; testVisibility(config: VisibilityTestConfig): boolean }
interface LevelsCanvas {
  level?: LevelLike;
  scene?: { id: string; levels: Map<string, LevelLike> & { contents: LevelLike[] }; getSurfaces(options: { type: string }): SurfaceLike[];
    testSurfaceCollision(origin: object, destination: object, options: { type: string; mode: string; tMin: number; tMax: number; level: LevelLike }): boolean };
  effects: { visionSources: Iterable<VisionSourceLike>; lightSources: Iterable<LightSourceLike> };
  visibility: {
    testVisibility(point: { x: number; y: number }, options: { tolerance: number }): boolean;
    _createVisibilityTestConfig(points: Array<{ x: number; y: number; elevation: number }>, options: { tolerance: number }): VisibilityTestConfig;
  };
  primary: PIXI.Container;
  dimensions: { sceneRect: PIXI.Rectangle };
  fog: { isPointExplored(point: { x: number; y: number }): boolean };
  grid: foundry.grid.BaseGrid;
}

const shades = new Map<number, PIXI.Graphics>();
let labels: PIXI.Container | undefined;
// Per square, what doesn't depend on the viewer: its ground, test points and which of them are off the viewed
// level's floor. Valid for one scene, viewed level and set of walls, regions and levels.
const cellCache = new Map<string, CellInfo>();
let cellCacheKey = "";
// Immediately after a quiet spell, then at most every THROTTLE_MS while vision keeps refreshing (core's throttle)
const THROTTLE_MS = 50;
const throttledRefresh = foundry.utils.throttle(() => { void refresh(); }, THROTTLE_MS);
let lastKey = "";
// Bumped by every refresh: a computation still running for an older one stops
let generation = 0;

const STYLES = ["tint", "dim", "hatch", "outline", "hatchOutline"] as const;
type CueStyle = typeof STYLES[number];

export function registerHiddenGroundCueSetting() {
  const redraw = () => { lastKey = ""; schedule(); };
  game.settings?.register("midi-qol", "hiddenGroundCue", {
    name: i18n("midi-qol.HiddenGroundCue.Name"),
    hint: i18n("midi-qol.HiddenGroundCue.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: redraw
  });
  game.settings?.register("midi-qol", "hiddenGroundCueStyle", {
    name: i18n("midi-qol.HiddenGroundCue.Style.Name"),
    hint: i18n("midi-qol.HiddenGroundCue.Style.Hint"),
    scope: "client",
    config: true,
    type: String,
    choices: Object.fromEntries(STYLES.map(style => [style, i18n(`midi-qol.HiddenGroundCue.Style.${style}`)])),
    default: "hatch",
    onChange: redraw
  });
  game.settings?.register("midi-qol", "hiddenGroundCueColor", {
    name: i18n("midi-qol.HiddenGroundCue.Color.Name"),
    hint: i18n("midi-qol.HiddenGroundCue.Color.Hint"),
    scope: "client",
    config: true,
    type: new foundry.data.fields.ColorField({ nullable: false, initial: "#ff0000" }),
    default: "#ff0000",
    onChange: redraw
  });
  game.settings?.register("midi-qol", "hiddenGroundCueOpacity", {
    name: i18n("midi-qol.HiddenGroundCue.Opacity.Name"),
    hint: i18n("midi-qol.HiddenGroundCue.Opacity.Hint"),
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0.1, max: 1, step: 0.05 },
    default: 0.6,
    onChange: redraw
  });
}

export function initHiddenGroundCue() {
  Hooks.on("sightRefresh", () => schedule());
  Hooks.on("lightingRefresh", () => { lastKey = ""; schedule(); });
  for (const hook of ["createRegion", "updateRegion", "deleteRegion", "createLevel", "updateLevel", "deleteLevel", "createWall", "updateWall", "deleteWall"])
    Hooks.on(hook as any, () => { cellCache.clear(); lastKey = ""; schedule(); });
  Hooks.on("canvasTearDown", () => { generation++; shades.clear(); cellCache.clear(); labels = undefined; lastKey = ""; });
}

function isEnabled(): boolean {
  return game.settings?.get("midi-qol", "hiddenGroundCue") === true;
}

function lcanvas(): LevelsCanvas {
  return canvas as unknown as LevelsCanvas;
}

function activeSources(): VisionSourceLike[] {
  return [...lcanvas().effects.visionSources].filter(s => s.active && !s.isBlinded && s.los?.points?.length);
}

function clearShades() {
  for (const g of shades.values()) if (!g.destroyed) g.clear();
  if (labels && !labels.destroyed) labels.removeChildren().forEach(child => child.destroy());
}

function isDebug(): boolean {
  return (CONFIG.debug as unknown as Record<string, unknown>)[DEBUG_KEY] === true;
}

function schedule() {
  // While a viewer moves, keep the shading for where it started (no recomputing every step);
  // core refreshes vision when the move ends.
  if (activeSources().some(s => s.object?.animationContexts?.size)) {
    generation++;
    lastKey = "";
    return;
  }
  throttledRefresh();
}

async function refresh() {
  const c = lcanvas();
  if (!c?.scene || !c.level || !c.primary || !isEnabled() || (c.scene.levels?.size ?? 0) <= 1) {
    generation++;
    clearShades();
    lastKey = "";
    return;
  }
  const sources = activeSources();
  if (activeSources().some(s => s.object?.animationContexts?.size)) return;
  const key = `${isDebug()}|${c.level.id}|${sources.map(s => `${s.origin.x},${s.origin.y},${s.origin.elevation},${s.los.points.join(",")}`).join("|")}`;
  if (key === lastKey) return;
  lastKey = key;
  const gen = ++generation;
  if (!sources.length) {
    clearShades();
    return;
  }
  const debugLabels: DebugLabel[] | undefined = isDebug() ? [] : undefined;
  const hidden = await computeHiddenSquares(c, sources, gen, debugLabels);
  if (!hidden) return;
  clearShades();
  const look = cueAppearance(c);
  for (const [elevation, polygons] of hidden) drawShade(c, elevation, polygons, look);
  if (debugLabels) drawLabels(c, debugLabels);
}

/** The squares on each lower floor (keyed by its elevation) seen through openings where a creature would be hidden. */
/** Undefined if a newer refresh started meanwhile. */
async function computeHiddenSquares(c: LevelsCanvas, sources: VisionSourceLike[], gen: number, debugLabels?: DebugLabel[]): Promise<Map<number, number[][]> | undefined> {
  const result = new Map<number, number[][]>();
  const scene = c.scene!;
  const viewed = c.level!;
  const SCALE = CONST.CLIPPER_SCALING_FACTOR;
  const surfaces = scene.getSurfaces({ type: "sight" });
  const ownFloor = surfaces.filter(s => s.elevation >= viewed.elevation.bottom && s.elevation < viewed.elevation.top);
  const lowerFloors = surfaces.filter(s => s.elevation < viewed.elevation.bottom).sort((a, b) => b.elevation - a.elevation);
  const levels = [...scene.levels.values()].sort((a, b) => a.elevation.bottom - b.elevation.bottom);
  const lowest = levels[0];
  if (!lowest || lowest.elevation.bottom >= viewed.elevation.bottom) return result;

  const toPolys = (paths: ClipperLib.Path[]) => paths.map(path => new PIXI.Polygon(path.flatMap(p => [p.X / SCALE, p.Y / SCALE])));
  const ownFloorPolys = ownFloor.flatMap(s => toPolys(s.region.polygonTree.clipperPaths));
  const lowerPolys = lowerFloors.map(s => ({ elevation: s.elevation, polys: toPolys(s.region.polygonTree.clipperPaths) }));
  const contains = (polys: PIXI.Polygon[], x: number, y: number) => {
    // Clipper paths of a region include its holes (opposite orientation): inside an odd number of paths is inside
    let inside = false;
    for (const p of polys) if (p.contains(x, y)) inside = !inside;
    return inside;
  };
  const levelAt = (elevation: number) => levels.find(l => l.elevation.bottom <= elevation && elevation < l.elevation.top) ?? lowest;

  const grid = c.grid;
  const gridDistance = grid.distance ?? 5;
  const testHeight = gridDistance * (configSettings.optionalRules.visionTestHeight === "top" ? 1.0 : 0.5);
  const losBounds = sources.map(s => s.los.getBounds());
  const left = Math.min(...losBounds.map(b => b.left)), top = Math.min(...losBounds.map(b => b.top));
  // Within the scene: core never tests padding points from inside it
  const scene_ = c.dimensions.sceneRect;
  const l = Math.max(left, scene_.left), t = Math.max(top, scene_.top);
  const r = Math.min(Math.max(...losBounds.map(b => b.right)), scene_.right), b = Math.min(Math.max(...losBounds.map(b => b.bottom)), scene_.bottom);
  if (r <= l || b <= t) return result;
  const bounds = new PIXI.Rectangle(l, t, r - l, b - t);
  const viewerDoc = sources[0].object.document;
  const ctx = sightContext(c, sources);
  // A source's range is its longest sight mode's (light perception's is unlimited)
  const ranges = sources.map(src => {
    const modes = src.object.document.detectionModes as Record<string, { enabled?: boolean; range?: number | null } | undefined>;
    const feet = ["basicSight", "lightPerception"].map(id => modes[id]).filter(m => m?.enabled)
      .map(m => (m!.range === null || m!.range === undefined) ? Infinity : m!.range);
    return { origin: src.origin, px: Math.max(0, ...feet) * grid.size / gridDistance };
  });
  const inRange = (p: { x: number; y: number }) => ranges.some(r => Math.hypot(p.x - r.origin.x, p.y - r.origin.y) <= r.px);
  const cacheKey = `${scene.id}|${viewed.id}`;
  if (cacheKey !== cellCacheKey) {
    cellCache.clear();
    cellCacheKey = cacheKey;
  }
  const cellInfo = (offset: GridOffset): CellInfo => {
    let info = cellCache.get(offset.key);
    if (info) return info;
    const cell = gridCell(grid, offset);
    // The ground is the highest floor below the viewed level under the square's centre
    const floor = lowerPolys.find(f => contains(f.polys, cell.center.x, cell.center.y));
    const groundElevation = floor?.elevation ?? lowest.elevation.bottom;
    const level = levelAt(groundElevation);
    // A medium creature standing there: core's test points, constrained by that level's walls
    const points = viewerDoc.getVisibilityTestPoints({ ...cell.topLeft, width: 1, height: 1, elevation: groundElevation, level: level.id });
    info = { ...cell, groundElevation, level, points, offFloor: points.map(p => !contains(ownFloorPolys, p.x, p.y)) };
    cellCache.set(offset.key, info);
    return info;
  };
  let sliceStart = performance.now();
  for (const offset of gridOffsets(grid, bounds)) {
    if (performance.now() - sliceStart > SLICE_MS) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (gen !== generation) return undefined;
      sliceStart = performance.now();
    }
    const cell = cellInfo(offset);
    // Squares in range seen, at least in part, through an opening; whether core currently draws them or only
    // remembers them (explored fog looks much the same), creatures there are hidden.
    const shown = cell.points.some((p, k) => cell.offFloor[k] && inRange(p)
      // Unexplored and not in view: core's fog hides it, so nothing to shade
      && (c.fog.isPointExplored(p) || c.visibility.testVisibility({ x: p.x, y: p.y }, { tolerance: 0 })));
    if (!shown) {
      debugLabels?.push({ ...cell.center, text: `${cell.label}\n-` });
      continue;
    }
    // At midi's vision test height above the floor
    const points = cell.points.map(p => ({ x: p.x, y: p.y, elevation: cell.groundElevation + testHeight }));
    if (canSeeAt(c, ctx, points, cell.level)) {
      debugLabels?.push({ ...cell.center, text: `${cell.label}\nS` });
      continue;
    }
    debugLabels?.push({ ...cell.center, text: `${cell.label}\nH` });
    const list = result.get(cell.groundElevation) ?? [];
    list.push(cell.vertices);
    result.set(cell.groundElevation, list);
  }
  return result;
}

interface GridCell { topLeft: { x: number; y: number }; center: { x: number; y: number }; vertices: number[]; label: string }
interface CellInfo extends GridCell { groundElevation: number; level: LevelLike; points: Array<{ x: number; y: number }>; offFloor: boolean[] }
interface GridOffset { key: string; i: number; j: number }
interface DebugLabel { x: number; y: number; text: string }

/** Grid spaces covering the bounds (rows i, columns j); gridless scenes are sampled in grid-sized squares. */
function gridOffsets(grid: foundry.grid.BaseGrid, bounds: PIXI.Rectangle): GridOffset[] {
  const offsets: GridOffset[] = [];
  if (grid.isGridless) {
    const size = grid.size;
    for (let j = Math.floor(bounds.left / size); j * size < bounds.right; j++)
      for (let i = Math.floor(bounds.top / size); i * size < bounds.bottom; i++) offsets.push({ key: `${i},${j}`, i, j });
    return offsets;
  }
  const [i0, j0, i1, j1] = grid.getOffsetRange(bounds);
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) offsets.push({ key: `${i},${j}`, i, j });
  return offsets;
}

/** Labelled "column,row". */
function gridCell(grid: foundry.grid.BaseGrid, { i, j }: GridOffset): GridCell {
  if (grid.isGridless) {
    const size = grid.size;
    const x = j * size, y = i * size;
    return { topLeft: { x, y }, center: { x: x + size / 2, y: y + size / 2 }, vertices: [x, y, x + size, y, x + size, y + size, x, y + size], label: `${j},${i}` };
  }
  return { topLeft: grid.getTopLeftPoint({ i, j }), center: grid.getCenterPoint({ i, j }), vertices: grid.getVertices({ i, j }).flatMap(v => [v.x, v.y]), label: `${j},${i}` };
}

interface SightContext {
  sources: Array<{ source: VisionSourceLike; losConfig: Record<string, unknown> | undefined; modes: Array<[DetectionModeLike, unknown]> }>;
  visionLights: LightSourceLike[];
}

/** Per refresh: the sight modes, LOS configs and vision-providing lights that every square's test uses. */
function sightContext(c: LevelsCanvas, sources: VisionSourceLike[]): SightContext {
  const modes = CONFIG.Canvas.detectionModes as unknown as Record<string, DetectionModeLike>;
  return {
    sources: sources.map(source => {
      // Core's LOS polygon config without its scene-sized boundingBox, which makes every wall test consider every
      // wall (~110µs a test instead of ~15µs). A limited vision angle takes another path in core: leave it to core.
      const { boundingBox, ...losConfig } = source.los.config;
      const tokenModes = source.object.document.detectionModes;
      return {
        source,
        losConfig: source.los.config.hasLimitedAngle ? undefined : losConfig,
        modes: ["basicSight", "lightPerception"].filter(id => tokenModes[id] && modes[id]).map(id => [modes[id], tokenModes[id]] as [DetectionModeLike, unknown])
      };
    }),
    visionLights: [...c.effects.lightSources].filter(light => light.active && light.data.vision)
  };
}

/**
 * core's sight test (CanvasVisibility#testVisibility: vision-providing lights, basic sight, light perception) for a
 * creature's test points in a level. Points are tried one at a time, so a seen square usually settles on its first.
 */
function canSeeAt(c: LevelsCanvas, ctx: SightContext, points: Array<{ x: number; y: number; elevation: number }>, level: LevelLike): boolean {
  const config = c.visibility._createVisibilityTestConfig(points, { tolerance: 0 });
  for (const test of config.tests) {
    test.level = level;
    const single: VisibilityTestConfig = { level, tests: [test] };
    for (const light of ctx.visionLights) if (light.testVisibility(single) === true) return true;
    for (const { source, losConfig, modes } of ctx.sources) {
      // Core's _testLOS reads the test's LOS cache first
      if (losConfig) test.los.set(source, losClear(c, source, test, losConfig));
      for (const [mode, tokenMode] of modes) if (mode.testVisibility(source, tokenMode, single)) return true;
    }
  }
  return false;
}

/**
 * Core's LOS test (DetectionMode._testCollision with the LOS polygon). Where the target's level lies directly below
 * the viewer's, this is core's own route through public calls: the ray must leave the viewer's level inside the LOS
 * polygon (~1µs), clear the surfaces, then clear the target level's walls. Calling _testCollision with a config instead
 * would add a wall test for the viewer's level, which the polygon already settles.
 */
function losClear(c: LevelsCanvas, source: VisionSourceLike, test: VisibilityTest, losConfig: Record<string, unknown>): boolean {
  const { origin: o, level } = source;
  const p = test.point;
  const bottom = level?.elevation.bottom;
  if (level && bottom !== undefined && test.level !== level && test.level.elevation.top === bottom
    && p.elevation < bottom && p.elevation >= test.level.elevation.bottom && o.elevation >= bottom) {
    // core's DetectionMode.#getIntermediateTValue for this case: where the ray crosses the shared boundary
    const t = (bottom - o.elevation) / (p.elevation - o.elevation);
    if (!source.los.contains(o.x + (p.x - o.x) * t, o.y + (p.y - o.y) * t)) return false;
    const type = (losConfig.type as string | undefined) ?? "sight";
    const scene = c.scene!;
    if (scene.testSurfaceCollision(o, p, { type, mode: "any", tMin: 0, tMax: t, level })) return false;
    // core's DetectionMode.#testCollision for the target level's part of the ray
    if (scene.testSurfaceCollision(o, p, { type, mode: "any", tMin: t, tMax: 1, level: test.level })) return false;
    const backend = (CONFIG.Canvas.polygonBackends as unknown as Record<string, PolygonBackendLike>)[type];
    return !backend.testCollision(o, p, { priority: source.priority, ...losConfig, type, mode: "any", source, tMin: t, tMax: 1, level: test.level });
  }
  const DetectionMode = foundry.canvas.perception.DetectionMode as unknown as {
    _testCollision(source: VisionSourceLike, test: VisibilityTest, config: Record<string, unknown>): boolean
  };
  return !DetectionMode._testCollision(source, test, losConfig);
}

interface CueAppearance { style: CueStyle; color: number; alpha: number; lineWidth: number }

/** The player's chosen look; line widths scale with the grid so they read the same on any map. */
function cueAppearance(c: LevelsCanvas): CueAppearance {
  const style = game.settings?.get("midi-qol", "hiddenGroundCueStyle") as CueStyle;
  const color = Number(foundry.utils.Color.from(game.settings?.get("midi-qol", "hiddenGroundCueColor") ?? "#ff0000"));
  const alpha = Number(game.settings?.get("midi-qol", "hiddenGroundCueOpacity") ?? 0.6);
  return { style: STYLES.includes(style) ? style : "hatch", color, alpha, lineWidth: Math.max(2, c.grid.size / 35) };
}

let hatchTexture: PIXI.Texture | undefined;

/** White diagonal lines on a transparent, seamlessly repeating tile, tinted by the fill colour. */
function getHatchTexture(): PIXI.Texture {
  if (hatchTexture && !hatchTexture.baseTexture.destroyed) return hatchTexture;
  const size = 32;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = canvasEl.height = size;
  const ctx = canvasEl.getContext("2d")!;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  // The middle diagonal and its neighbours, so the lines continue across tile edges
  for (const offset of [-size, 0, size]) {
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
  }
  ctx.stroke();
  hatchTexture = PIXI.Texture.from(canvasEl);
  hatchTexture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
  return hatchTexture;
}

function drawShade(c: LevelsCanvas, elevation: number, polygons: number[][], look: CueAppearance) {
  let g = shades.get(elevation);
  if (!g || g.destroyed) {
    const PrimaryGraphics = foundry.canvas.primary.PrimaryGraphics as unknown as new (options: { name: string }) => PIXI.Graphics & { elevation: number; sortLayer: number };
    const pg = new PrimaryGraphics({ name: `midi-qol.hiddenGround.${elevation}` });
    // Above the lower floor's map, below everything of the levels above it
    pg.elevation = elevation;
    pg.sortLayer = (foundry.canvas.groups.PrimaryCanvasGroup as unknown as { SORT_LAYERS: Record<string, number> }).SORT_LAYERS.DRAWINGS;
    c.primary.addChild(pg);
    g = pg;
    shades.set(elevation, g);
  }
  g.clear();
  const { style, color, alpha, lineWidth } = look;
  // Fills one square at a time: hidden squares often touch only at corners, and a merged outline through those
  // points is triangulated with pieces missing
  if (style === "tint" || style === "dim") g.beginFill(style === "dim" ? 0x000000 : color, alpha);
  else if (style === "hatch" || style === "hatchOutline") {
    // Anchored to the scene, so the lines run on across neighbouring squares
    g.beginTextureFill({ texture: getHatchTexture(), color, alpha: style === "hatchOutline" ? alpha * 0.6 : alpha, matrix: new PIXI.Matrix() });
  }
  if (style !== "outline") {
    for (const poly of polygons) g.drawPolygon(poly);
    g.endFill();
  }
  if (style === "outline" || style === "hatchOutline") {
    // Outlines of the merged areas: lines only, so no triangulation
    g.lineStyle({ width: lineWidth, color, alpha, alignment: 1 });
    for (const path of mergedOutlines(polygons)) g.drawPolygon(path);
    g.lineStyle(0);
  }
}

/** The outlines (outer and hole paths) of the union of the squares. */
function mergedOutlines(polygons: number[][]): number[][] {
  const SCALE = CONST.CLIPPER_SCALING_FACTOR;
  const clipper = new ClipperLib.Clipper();
  for (const poly of polygons) {
    const path: ClipperLib.Path = [];
    for (let i = 0; i < poly.length; i += 2) path.push({ X: Math.round(poly[i] * SCALE), Y: Math.round(poly[i + 1] * SCALE) });
    clipper.AddPath(path, ClipperLib.PolyType.ptSubject, true);
  }
  const merged: ClipperLib.Paths = [];
  clipper.Execute(ClipperLib.ClipType.ctUnion, merged, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return merged.map(path => path.flatMap(p => [p.X / SCALE, p.Y / SCALE]));
}

function drawLabels(c: LevelsCanvas & { interface?: PIXI.Container }, debugLabels: DebugLabel[]) {
  if (!c.interface) return;
  if (!labels || labels.destroyed) {
    labels = new PIXI.Container();
    labels.zIndex = 1150;
    c.interface.addChild(labels);
  }
  const style = new PIXI.TextStyle({ fontSize: 22, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4, align: "center" });
  for (const { x, y, text } of debugLabels) {
    const t = labels.addChild(new PIXI.Text(text, style));
    t.anchor.set(0.5);
    t.position.set(x, y);
  }
}
