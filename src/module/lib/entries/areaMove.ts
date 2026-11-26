import { i18nFormat } from "../../../midi-qol.js";
import type { V14RegionDocument } from "../../../globals.js";
import { shiftRegion } from "../../regionBehaviors/MidiRegionActivityBehaviorType.js";
import { registerAction, type ActionRun } from "./engine.js";
import { measureGridPath } from "../../utils.js";
import { snappedOffset } from "../areaMoveGeometry.js";

/*
 * `{ moveArea: { within, teleport? } }`: the area the entry's item placed moves to a point its user picks within
 * `within` (scene units, a formula) of where it is: Moonbeam's "move the Cylinder up to 60 feet" (a Magic action: the
 * cost is the activity's), Cloud of Daggers' "teleport the Cube up to 30 feet" (`teleport`: creatures it passes over
 * don't enter it). Moved in grid-sized steps otherwise, so those it passes over enter it, as the rules' "moves into its
 * space". An area attached to a token moves with the token and is left alone.
 */

interface MoveAreaSpec { within?: unknown, teleport?: boolean }

/** The regions an item placed on a scene (dnd5e's flags.dnd5e.item), not attached to a token */
export function itemAreas(item: Item.Implementation, scene: Scene.Implementation | null | undefined): V14RegionDocument[] {
  if (!scene) return [];
  return (scene.regions.contents as unknown as V14RegionDocument[]).filter(region =>
    foundry.utils.getProperty(region, "flags.dnd5e.item") === item.uuid && !region.attachment?.token);
}

/** The point picked by placing a preview of the area's first shape, held within `within` (feet) of where it is */
async function pickOffset(region: V14RegionDocument, within: number): Promise<{ x: number, y: number } | undefined> {
  const scene = region.parent!;
  const shape = region.shapes[0];
  if (!shape || !canvas?.regions || !canvas.grid) return undefined;
  const origin = shape.origin;
  const max = within * scene.dimensions.distancePixels;
  const pixelsPerUnit = scene.dimensions.distancePixels;
  const measure = (o: { x: number, y: number }) => (measureGridPath(canvas!.grid!, [origin, { x: origin.x + o.x, y: origin.y + o.y }])?.distance ?? 0) * pixelsPerUnit;
  const data = region.toObject() as Record<string, unknown> & { shapes: unknown[] };
  delete data._id;
  data.behaviors = [];
  data.shapes = [data.shapes[0]];
  data.attachment = { token: null };
  data.visibility = CONST.REGION_VISIBILITY.ALWAYS;
  data.name = i18nFormat("midi-qol.MoveArea.Preview", { name: region.name ?? "" });
  ui.notifications?.info(i18nFormat("midi-qol.MoveArea.Pick", { name: region.name ?? "", within: String(within), units: scene.grid.units ?? "" }));
  let last = { x: 0, y: 0 };
  const onMove = ({ shape: preview, position }: { shape: { move(p: { x: number, y: number }, options?: object): void }, position: { x: number, y: number } }) => {
    last = snappedOffset({ x: position.x - origin.x, y: position.y - origin.y }, max, scene.grid.size, measure);
    preview.move({ x: origin.x + last.x, y: origin.y + last.y }, { snap: false });
    return false;
  };
  const placed = await (canvas.regions as unknown as { placeRegions(data: object[], options: object): Promise<unknown[] | null> })
    .placeRegions([data], { create: false, allowRotation: false, onMove });
  if (!placed?.length) return undefined;
  return last;
}

async function moveAreaAction(run: ActionRun): Promise<void> {
  const spec = (run.action.moveArea ?? {}) as MoveAreaSpec;
  const document = run.found.document as { item?: Item.Implementation, parent?: unknown };
  const item = run.context.item ?? (document instanceof Item ? document : document.item ?? (document.parent instanceof Item ? document.parent : undefined));
  if (!item) return;
  const scene = run.context.workflow?.token?.document?.parent ?? canvas?.scene;
  const areas = itemAreas(item, scene);
  if (!areas.length) {
    ui.notifications?.warn(i18nFormat("midi-qol.MoveArea.None", { name: item.name ?? "" }));
    return;
  }
  // Several (a spell cast twice): the one most recently placed
  const region = areas.at(-1)!;
  const formula = spec.within ?? 30;
  let within = typeof formula === "number" ? formula : Number(formula);
  if (!Number.isFinite(within)) {
    try { within = (await new Roll(String(formula), run.conditionData).evaluate()).total ?? 0; } catch { within = 0; }
  }
  if (!(within > 0)) return;
  const offset = await pickOffset(region, within);
  if (!offset || (offset.x === 0 && offset.y === 0)) return;
  await shiftRegion(region, offset, { teleport: !!spec.teleport });
}

export function registerAreaMoveActions() {
  registerAction("moveArea", moveAreaAction);
}
