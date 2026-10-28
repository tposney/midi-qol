import { MODULE_ID } from "../../midi-qol.js";
import { regionShapeOrigin } from "../activities/activityHelpers.js";

const { NumberField, StringField, ColorField, BooleanField } = foundry.data.fields;

/** The region's area as one polygon, when it is a single piece with no holes (else the light is not clipped). */
function regionOutline(region: any): PIXI.Polygon | undefined {
  const pieces = region?.polygonTree?.children ?? [];
  if (pieces.length !== 1 || pieces[0].children?.length) return undefined;
  return pieces[0].polygon;
}

/** The centre of a polygon's area. */
function areaCentroid(polygon: PIXI.Polygon): { x: number, y: number } | undefined {
  const pts = polygon.points;
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[(i + 2) % pts.length], y1 = pts[(i + 3) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  if (!area) return undefined;
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

/** Light and darkness animations, for the animation dropdown. */
function animationChoices(): Record<string, string> {
  const choices: Record<string, string> = {};
  for (const animations of [CONFIG.Canvas.lightAnimations, CONFIG.Canvas.darknessAnimations])
    for (const [key, cfg] of Object.entries(animations ?? {})) choices[key] ??= game.i18n?.localize((cfg as { label: string }).label) ?? key;
  return choices;
}

/**
 * A custom RegionBehaviorType that manages an AmbientLight (or a darkness source) at the region center.
 * Creates a light when the region is viewed, repositions it when the region boundary changes,
 * and deletes it when the region is unviewed or deleted.
 *
 * Registration: CONFIG.RegionBehavior.dataModels["midi-qol.regionLight"]
 */
// @ts-expect-error fvtt-types RegionBehaviorType generic constraints
export class MidiRegionLightBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = [
    `BEHAVIOR.TYPES.${MODULE_ID}.regionLight`,
    "BEHAVIOR.TYPES.base"
  ];

  static defineSchema() {
    const lp = `BEHAVIOR.TYPES.${MODULE_ID}.regionLight.FIELDS`;
    return {
      dim: new NumberField({ initial: 0, min: 0,
        label: `${lp}.dim.label` }),
      bright: new NumberField({ initial: 0, min: 0,
        label: `${lp}.bright.label` }),
      color: new ColorField({ initial: null, nullable: true,
        label: `${lp}.color.label` }),
      alpha: new NumberField({ initial: 0.5, min: 0, max: 1,
        label: `${lp}.alpha.label` }),
      luminosity: new NumberField({ initial: 0.5, min: 0, max: 1,
        label: `${lp}.luminosity.label` }),
      negative: new BooleanField({ initial: false,
        label: `${lp}.negative.label`, hint: `${lp}.negative.hint` }),
      priority: new NumberField({ initial: 0, min: 0, integer: true,
        label: `${lp}.priority.label`, hint: `${lp}.priority.hint` }),
      walls: new BooleanField({ initial: false,
        label: `${lp}.walls.label`, hint: `${lp}.walls.hint` }),
      fill: new BooleanField({ initial: false,
        label: `${lp}.fill.label`, hint: `${lp}.fill.hint` }),
      animationType: new StringField({ initial: null, nullable: true, blank: true, choices: animationChoices,
        label: `${lp}.animationType.label` }),
      animationSpeed: new NumberField({ initial: 5, min: 0, max: 10,
        label: `${lp}.animationSpeed.label` }),
      animationIntensity: new NumberField({ initial: 5, min: 1, max: 10,
        label: `${lp}.animationIntensity.label` }),
      lightDocId: new StringField({ initial: null, nullable: true,
        label: `${lp}.lightDocId.label` }),
    };
  }

  /* ---------------------------------------- */
  /*  Helpers                                 */
  /* ---------------------------------------- */

  /**
   * Where the light goes: inside the region, which clips it (see registerHooks). A single shape's own centre (an
   * emanation's token, a circle's or rectangle's centre) when that is inside the region; otherwise, and for cones and
   * lines, the centre of the region's area. Not the centre of the region's bounds: those are clipped where walls or the
   * scene edge constrain the region.
   */
  _lightPosition(): { x: number, y: number } | undefined {
    const region = (this as any).region;
    if (!region?.object) return undefined;
    const outline = regionOutline(region);
    if (region.shapes?.length === 1 && !["cone", "line"].includes(region.shapes[0].type)) {
      const origin = regionShapeOrigin(region);
      if (origin && (!outline || outline.contains(origin.x, origin.y))) return origin;
    }
    const centroid = outline && areaCentroid(outline);
    if (centroid) return centroid;
    const { x, y } = region.object.center;
    return { x, y };
  }

  /** Fill Region: the radius (in scene units) that reaches the region's farthest point from the light. */
  _fillRadius(position: { x: number, y: number }): number | undefined {
    const region = (this as any).region;
    const points: number[] = regionOutline(region)?.points ?? [];
    if (!points.length) {
      const b = region?.bounds;
      if (!b) return undefined;
      points.push(b.x, b.y, b.right, b.y, b.x, b.bottom, b.right, b.bottom);
    }
    let max = 0;
    for (let i = 0; i < points.length; i += 2) max = Math.max(max, Math.hypot(points[i] - position.x, points[i + 1] - position.y));
    return Math.ceil(max / canvas.dimensions!.distancePixels);
  }

  _buildLightConfig(position?: { x: number, y: number }): Record<string, any> {
    const self = this as any;
    let dim = self.dim ?? 0, bright = self.bright ?? 0;
    const fill = self.fill && position ? self._fillRadius(position) : undefined;
    if (fill !== undefined) {
      // bright throughout, or dim throughout if no bright radius was set
      if (bright > 0) bright = fill;
      dim = fill;
    }
    return {
      negative: !!self.negative,
      priority: self.priority ?? 0,
      dim,
      bright,
      color: self.color || null,
      alpha: self.alpha ?? 0.5,
      luminosity: self.luminosity ?? 0.5,
      animation: {
        type: self.animationType || null,
        speed: self.animationSpeed ?? 5,
        intensity: self.animationIntensity ?? 5,
      },
    };
  }

  /* ---------------------------------------- */
  /*  Event Handlers                          */
  /* ---------------------------------------- */

  /**
   * Create an AmbientLight at the region center when the behavior is viewed.
   * @this {MidiRegionLightBehaviorType}
   */
  static async _onBehaviorViewed(this: MidiRegionLightBehaviorType, _event: any): Promise<void> {
    if (!game.user?.isGM) return;
    const self = this as any;
    const position = self._lightPosition();
    if (!position) return;

    const lightData = {
      ...position,
      config: self._buildLightConfig(position),
      walls: !!self.walls,
      flags: { [MODULE_ID]: { regionLight: self.region.uuid } },
    };

    const created = await canvas.scene?.createEmbeddedDocuments("AmbientLight", [lightData]);
    if (created?.length) {
      await self.behavior.update({ "system.lightDocId": created[0].id });
    }
  }

  /**
   * Destroy the AmbientLight when the behavior is unviewed.
   * @this {MidiRegionLightBehaviorType}
   */
  static async _onBehaviorUnviewed(this: MidiRegionLightBehaviorType, _event: any): Promise<void> {
    if (!game.user?.isGM) return;
    const self = this as any;
    const lightDocId = self.lightDocId as string | null;
    if (!lightDocId) return;

    const lightDoc = canvas.scene?.lights.get(lightDocId);
    if (lightDoc) {
      await canvas.scene?.deleteEmbeddedDocuments("AmbientLight", [lightDocId]);
    }
  }

  /**
   * Reposition the AmbientLight when the region boundary changes.
   * @this {MidiRegionLightBehaviorType}
   */
  static async _onRegionBoundary(this: MidiRegionLightBehaviorType, _event: any): Promise<void> {
    if (!game.user?.isGM) return;
    const self = this as any;
    if (!self.behavior.viewed) return;

    const lightDocId = self.lightDocId as string | null;
    if (!lightDocId) return;

    const lightDoc = canvas.scene?.lights.get(lightDocId);
    if (!lightDoc) return;

    const position = self._lightPosition();
    if (!position) return;
    await canvas.scene?.updateEmbeddedDocuments("AmbientLight", [{ _id: lightDocId, ...position, config: self._buildLightConfig(position) }]);
  }

  /* ---------------------------------------- */
  /*  Clipping to the region                  */
  /* ---------------------------------------- */

  /**
   * Confine a region light (or darkness) to its region: the light's polygon gets the region's outline as a boundary
   * shape. Called once at init.
   */
  static registerHooks() {
    const clip = function (this: any, wrapped: () => any) {
      const config = wrapped();
      const regionUuid = this.object?.document?.getFlag?.(MODULE_ID, "regionLight");
      const outline = regionUuid ? regionOutline(fromUuidSync(regionUuid)) : undefined;
      if (outline) config.boundaryShapes = [...(config.boundaryShapes ?? []), outline];
      return config;
    };
    globalThis.libWrapper.register(MODULE_ID, "foundry.canvas.sources.PointLightSource.prototype._getPolygonConfiguration", clip, "WRAPPER");
    globalThis.libWrapper.register(MODULE_ID, "foundry.canvas.sources.PointDarknessSource.prototype._getPolygonConfiguration", clip, "WRAPPER");
    // a reshaped or moved region re-clips its light on every client
    Hooks.on("updateRegion", (region: RegionDocument.Implementation, changes: any) => {
      if (!("shapes" in changes) && !("_shapeConstraints" in changes) && !("elevation" in changes)) return;
      for (const light of canvas.scene?.lights ?? []) {
        if ((light.flags as Record<string, { regionLight?: string } | undefined>)[MODULE_ID]?.regionLight !== region.uuid) continue;
        (light.object as any)?.initializeLightSource?.();
      }
      canvas.perception?.update({ initializeLighting: true });
    });
  }

  /* ---------------------------------------- */
  /*  Static Event Registration               */
  /* ---------------------------------------- */

  static events = {
    [CONST.REGION_EVENTS.BEHAVIOR_VIEWED]: this._onBehaviorViewed,
    [CONST.REGION_EVENTS.BEHAVIOR_UNVIEWED]: this._onBehaviorUnviewed,
    [CONST.REGION_EVENTS.REGION_BOUNDARY]: this._onRegionBoundary,
  };

  /* ---------------------------------------- */
  /*  Lifecycle Overrides                     */
  /* ---------------------------------------- */

  /** Update the light config when behavior system data changes. */
  _onUpdate(changed: any, options: any, userId: string): void {
    super._onUpdate(changed, options, userId);
    if (!game.user?.isGM) return;
    const self = this as any;
    if (!("system" in changed) || !self.behavior.viewed) return;

    const lightDocId = self.lightDocId as string | null;
    if (!lightDocId) return;

    const lightDoc = canvas.scene?.lights.get(lightDocId);
    if (!lightDoc) return;

    const position = self._lightPosition();
    canvas.scene?.updateEmbeddedDocuments("AmbientLight", [{
      _id: lightDocId,
      ...(position ?? {}),
      config: self._buildLightConfig(position),
      walls: !!self.walls,
    }]);
  }

  /** Safety cleanup: delete the light if the behavior is deleted. */
  _onDelete(options: any, userId: string): void {
    const self = this as any;
    const lightDocId = self.lightDocId as string | null;
    if (lightDocId && game.user?.isGM) {
      const lightDoc = canvas.scene?.lights.get(lightDocId);
      if (lightDoc) {
        canvas.scene?.deleteEmbeddedDocuments("AmbientLight", [lightDocId]);
      }
    }
    super._onDelete(options, userId);
  }
}
