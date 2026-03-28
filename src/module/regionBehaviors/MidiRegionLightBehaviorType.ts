import { MODULE_ID } from "../../midi-qol.js";

const { NumberField, StringField, ColorField } = foundry.data.fields;

/**
 * A custom RegionBehaviorType that manages an AmbientLight at the region center.
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
      animationType: new StringField({ initial: null, nullable: true,
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

  _buildLightConfig(): Record<string, any> {
    const self = this as any;
    return {
      dim: self.dim ?? 0,
      bright: self.bright ?? 0,
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
    const region = self.region;
    if (!region?.object) return;

    const { x, y } = region.object.center;
    const lightData = {
      x,
      y,
      config: self._buildLightConfig(),
      walls: false,
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

    const region = self.region;
    if (!region?.object) return;

    const { x, y } = region.object.center;
    await canvas.scene?.updateEmbeddedDocuments("AmbientLight", [{ _id: lightDocId, x, y }]);
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

    canvas.scene?.updateEmbeddedDocuments("AmbientLight", [{
      _id: lightDocId,
      config: self._buildLightConfig(),
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
