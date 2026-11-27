import { MODULE_ID } from "../../midi-qol.js";
import { barrierSegments, sideBand, type BarrierSide, type BarrierTrace, type ShapeFacts } from "../lib/barrierGeometry.js";

const { StringField, BooleanField, NumberField } = foundry.data.fields;

/*
 * A barrier: the area stops creatures, sight, light or sound crossing it (Wall of Force, Wall of Stone, a dome).
 * Plan: ~/Documents/midi-next-region-barriers-plan-2026-11-25.md, part 1 stage 1.
 *
 * The region gets real Wall documents, made by the active GM while the behaviour is active: along a line's axis, on a
 * ring's circle, or around the area's outline (lib/barrierGeometry.ts). Each wall carries the region's uuid
 * (`flags.midi-qol.barrier`) and its levels. They are made again when the region's boundary changes and removed when
 * the behaviour goes (disabled, deleted, or its region deleted). Being documents, every client, the lighting and any
 * module that reads walls see the same barrier; a movement wall is total cover under midi's "walls block" rule.
 *
 * One side may affect those near it (Wall of Fire's hot side, `side`, `sideDepth`, `sideActivityUuid`): the GM keeps a
 * second region beside the walls, shown to everyone, whose rule uses the activity on a creature ending its turn there.
 * It is made, made again and removed with the walls.
 *
 * `uses` / `usesDirection`: uses stopped crossing its boundary, with or without walls (stage 4, lib/barrierUses.ts).
 *
 * Not here: a barrier for some creatures only (terrain, stage 2), one that moves with its caster (stage 3: a wall
 * redrawn at every step is the wrong tool).
 */

type Region = RegionDocument.Implementation & { polygons?: { points: number[] }[], levels?: Iterable<string> };
type Flags = Record<string, { barrier?: string } | undefined>;

const SENSES = ["none", "limited", "normal"] as const;
const sense = (value: string) => value === "normal" ? CONST.WALL_SENSE_TYPES.NORMAL : value === "limited" ? CONST.WALL_SENSE_TYPES.LIMITED : CONST.WALL_SENSE_TYPES.NONE;
const DIRECTIONS: Record<string, number> = { both: CONST.WALL_DIRECTIONS.BOTH, left: CONST.WALL_DIRECTIONS.LEFT, right: CONST.WALL_DIRECTIONS.RIGHT };

/** The walls a region's barrier made */
export function barrierWalls(region: Region): WallDocument.Implementation[] {
  const scene = region.parent;
  if (!scene || !region.uuid) return [];
  return scene.walls.filter(wall => (wall.flags as Flags)[MODULE_ID]?.barrier === region.uuid);
}

/** The area beside a region's barrier that one of its sides affects */
export function barrierSideRegions(region: Region): RegionDocument.Implementation[] {
  const scene = region.parent;
  if (!scene || !region.uuid) return [];
  return scene.regions.filter(other => (other.flags as Flags)[MODULE_ID]?.barrier === region.uuid);
}

/** One region's wall work at a time: a create and a redraw must not cross (walls made twice, or left behind) */
const queues = new Map<string, Promise<unknown>>();
function queued(region: Region, work: () => Promise<unknown>): Promise<unknown> {
  const key = region.uuid ?? "";
  const next = (queues.get(key) ?? Promise.resolve()).then(work).catch(err => console.warn(`midi-qol | barrier walls of ${region.name}`, err));
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
  return next;
}

// @ts-expect-error fvtt-types RegionBehaviorType generic constraints
export class MidiRegionBarrierBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = [`BEHAVIOR.TYPES.${MODULE_ID}.regionBarrier`, "BEHAVIOR.TYPES.base"];

  static defineSchema() {
    const lp = `BEHAVIOR.TYPES.${MODULE_ID}.regionBarrier.FIELDS`;
    const choices = (key: string, values: readonly string[]) => Object.fromEntries(values.map(value => [value, `${lp}.${key}.choices.${value}`]));
    return {
      move: new BooleanField({ initial: true, label: `${lp}.move.label`, hint: `${lp}.move.hint` }),
      sight: new StringField({ required: true, blank: false, initial: "none", choices: choices("sense", SENSES), label: `${lp}.sight.label`, hint: `${lp}.sight.hint` }),
      sound: new StringField({ required: true, blank: false, initial: "none", choices: choices("sense", SENSES), label: `${lp}.sound.label` }),
      direction: new StringField({ required: true, blank: false, initial: "both", choices: choices("direction", Object.keys(DIRECTIONS)), label: `${lp}.direction.label`, hint: `${lp}.direction.hint` }),
      trace: new StringField({ required: true, blank: false, initial: "auto", choices: choices("trace", ["auto", "axis", "outline", "middle"]), label: `${lp}.trace.label`, hint: `${lp}.trace.hint` }),
      side: new StringField({ required: true, blank: false, initial: "none", choices: choices("side", ["none", "left", "right", "inside", "outside"]), label: `${lp}.side.label`, hint: `${lp}.side.hint` }),
      sideDepth: new NumberField({ initial: 0, min: 0, label: `${lp}.sideDepth.label` }),
      sideActivityUuid: new StringField({ initial: "", blank: true, label: `${lp}.sideActivityUuid.label` }),
      sourceItemUuid: new StringField({ initial: "", blank: true }),
      sourceActorUuid: new StringField({ initial: "", blank: true }),
      castLevel: new NumberField({ initial: 0, integer: true, min: 0 }),
      // Uses stopped crossing its boundary (lib/barrierUses.ts)
      uses: new StringField({ required: true, blank: false, initial: "none", choices: choices("uses", ["none", "harmful", "all"]), label: `${lp}.uses.label`, hint: `${lp}.uses.hint` }),
      usesDirection: new StringField({ required: true, blank: false, initial: "both", choices: choices("usesDirection", ["both", "into", "out"]), label: `${lp}.usesDirection.label` })
    };
  }

  declare move: boolean;
  declare sight: string;
  declare sound: string;
  declare direction: string;
  declare trace: BarrierTrace;
  declare side: BarrierSide;
  declare sideDepth: number;
  declare sideActivityUuid: string;
  declare sourceItemUuid: string;
  declare sourceActorUuid: string;
  declare castLevel: number;
  declare uses: string;
  declare usesDirection: string;

  /** The wall data for the region as it is now */
  _wallData(): WallDocument.CreateData[] {
    const region = (this as unknown as { region: Region }).region;
    const shapes: ShapeFacts[] = region.shapes.map(shape => {
      const s = shape as unknown as ShapeFacts;
      return { type: s.type, x: s.x, y: s.y, length: s.length, rotation: s.rotation, radius: s.radius };
    });
    const polygons = (region.polygons ?? []).map(polygon => polygon.points);
    const levels = Array.from(region.levels ?? []);
    // A barrier to uses only: no walls
    if (!this.move && this.sight === "none" && this.sound === "none") return [];
    return barrierSegments(shapes, polygons, this.trace).map(c => ({
      c,
      move: this.move ? CONST.WALL_MOVEMENT_TYPES.NORMAL : CONST.WALL_MOVEMENT_TYPES.NONE,
      // What stops sight stops light with it (a wall of stone casts a shadow)
      sight: sense(this.sight), light: sense(this.sight), sound: sense(this.sound),
      dir: DIRECTIONS[this.direction] ?? CONST.WALL_DIRECTIONS.BOTH,
      ...(levels.length ? { levels } : {}),
      flags: { [MODULE_ID]: { barrier: region.uuid } }
    })) as unknown as WallDocument.CreateData[];
  }

  /** The region beside the walls that the chosen side affects, as the barrier's region is now (none without a side) */
  _sideData(): RegionDocument.CreateData | undefined {
    if (this.side === "none" || !(this.sideDepth > 0) || !this.sideActivityUuid) return undefined;
    const region = (this as unknown as { region: Region }).region;
    const px = this.sideDepth * (region.parent?.dimensions?.distancePixels ?? 1);
    const side = this.side;
    const shapes = (region.shapes as unknown as (ShapeFacts & { width?: number })[]).flatMap((shape): object[] => {
      if (shape.type === "line" && (side === "left" || side === "right")) return [{ type: "polygon", points: sideBand(shape, px, side, shape.width ?? 0) }];
      if (shape.radius === undefined) return [];
      if (side === "inside") return [{ type: "circle", x: shape.x ?? 0, y: shape.y ?? 0, radius: shape.radius }];
      if (side === "outside") return [{ type: "ring", x: shape.x ?? 0, y: shape.y ?? 0, radius: shape.radius, innerWidth: 0, outerWidth: px }];
      return [];
    });
    if (!shapes.length) return undefined;
    const source = region._source as unknown as { color?: string, elevation?: object, levels?: string[] };
    return {
      name: `${region.name}: ${game.i18n?.localize(`BEHAVIOR.TYPES.${MODULE_ID}.regionBarrier.sideName`) ?? "side"}`,
      color: source.color, shapes, elevation: source.elevation, levels: source.levels ?? [],
      visibility: CONST.REGION_VISIBILITY.ALWAYS, highlightMode: "coverage",
      flags: { [MODULE_ID]: { barrier: region.uuid } },
      behaviors: [{
        type: `${MODULE_ID}.regionActivity`, name: region.name,
        system: { sourceItemUuid: this.sourceItemUuid, sourceActorUuid: this.sourceActorUuid, castLevel: this.castLevel,
          rules: [{ trigger: "turnEnd", action: "useActivity", targetUuid: this.sideActivityUuid }],
          dispositionFilter: 0, excludeSource: false, oncePerTurn: true, activationEntry: false }
      }]
    } as unknown as RegionDocument.CreateData;
  }

  /** The region's walls made again from its shapes (none left when the behaviour is no longer active) */
  _redraw(active: boolean): Promise<unknown> {
    const region = (this as unknown as { region: Region }).region;
    return queued(region, async () => {
      const scene = region.parent;
      if (!scene) return;
      const old = barrierWalls(region).map(wall => wall.id!);
      if (old.length) await scene.deleteEmbeddedDocuments("Wall", old);
      const oldSides = barrierSideRegions(region).map(side => side.id!);
      if (oldSides.length) await scene.deleteEmbeddedDocuments("Region", oldSides);
      // Gone meanwhile (the spell ended as it was being drawn): nothing to make
      if (!active || !scene.regions.has(region.id!)) return;
      const data = this._wallData();
      if (data.length) await scene.createEmbeddedDocuments("Wall", data);
      const side = this._sideData();
      if (side) await scene.createEmbeddedDocuments("Region", [side]);
    });
  }

  static async _onActivated(this: MidiRegionBarrierBehaviorType): Promise<void> {
    if (game.user?.isActiveGM) await this._redraw(true);
  }

  static async _onDeactivated(this: MidiRegionBarrierBehaviorType): Promise<void> {
    if (game.user?.isActiveGM) await this._redraw(false);
  }

  static async _onRegionBoundary(this: MidiRegionBarrierBehaviorType): Promise<void> {
    const behavior = (this as unknown as { behavior: { active?: boolean, disabled?: boolean } }).behavior;
    if (game.user?.isActiveGM && !behavior.disabled) await this._redraw(true);
  }

  static events = {
    [CONST.REGION_EVENTS.BEHAVIOR_ACTIVATED]: this._onActivated,
    [CONST.REGION_EVENTS.BEHAVIOR_DEACTIVATED]: this._onDeactivated,
    [CONST.REGION_EVENTS.REGION_BOUNDARY]: this._onRegionBoundary
  };

  /**
   * Walls must not outlive their region: a deleted region's go with it (its behaviours are deleted, not deactivated,
   * with it), and at ready any left by a removal no GM was there for are cleared.
   */
  static registerHooks() {
    Hooks.on("deleteRegion", (region: RegionDocument.Implementation) => {
      if (!game.user?.isActiveGM) return;
      // Queued behind the deactivation the delete also fires, which usually leaves nothing to do
      void queued(region, async () => {
        const ids = barrierWalls(region).map(wall => wall.id!);
        if (ids.length) await region.parent?.deleteEmbeddedDocuments("Wall", ids);
        const sides = barrierSideRegions(region).map(side => side.id!);
        if (sides.length) await region.parent?.deleteEmbeddedDocuments("Region", sides);
      });
    });
    Hooks.once("ready", () => {
      if (!game.user?.isActiveGM) return;
      for (const scene of game.scenes ?? []) {
        const orphans = scene.walls.filter(wall => {
          const uuid = (wall.flags as Flags)[MODULE_ID]?.barrier;
          return !!uuid && !scene.regions.some(region => region.uuid === uuid);
        }).map(wall => wall.id!);
        if (orphans.length) void scene.deleteEmbeddedDocuments("Wall", orphans).catch(err => console.warn("midi-qol | barrier walls", err));
        const sides = scene.regions.filter(region => {
          const uuid = (region.flags as Flags)[MODULE_ID]?.barrier;
          return !!uuid && !scene.regions.some(other => other.uuid === uuid);
        }).map(region => region.id!);
        if (sides.length) void scene.deleteEmbeddedDocuments("Region", sides).catch(err => console.warn("midi-qol | barrier sides", err));
      }
    });
  }
}
