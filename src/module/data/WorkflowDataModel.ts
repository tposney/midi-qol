/**
 * WorkflowDataModel — Phase 1 pilot
 *
 * A Foundry DataModel subclass used as a structured in-memory backing store
 * for Workflow scalar fields.  It is **not** persisted on its own — the
 * existing per-field `addUpdatesCacheFlags` logic in Workflow getters/setters
 * still owns persistence.
 *
 * Phase 1 migrates 15 simple scalar fields.  Phase 2 will add UUID
 * references, token-UUID sets, rolls, and damage details.
 */

const { StringField, NumberField, BooleanField } = foundry.data.fields;

export class WorkflowDataModel extends foundry.abstract.DataModel<foundry.data.fields.DataSchema> {
  // ── Typed property declarations (populated at runtime by DataModel from schema) ──
  declare attackTotal: number;
  declare damageTotal: number;
  declare diceRoll: number;
  declare d20AttackRoll: number;
  declare attackRollCount: number;
  declare damageRollCount: number;
  declare suspended: boolean;
  declare abort: boolean;
  declare itemUseComplete: boolean;
  declare noOptionalRules: boolean;
  declare AoO: boolean;
  declare isCritical: boolean;
  declare isFumble: boolean;
  declare needTemplate: boolean | null;
  declare defaultDamageType: string;

  static override defineSchema(): foundry.data.fields.DataSchema {
    return {
      // ── Simple Scalars (Phase 1 pilot) ──

      // Attack / damage totals
      attackTotal:     new NumberField({ initial: 0, nullable: false }),
      damageTotal:     new NumberField({ initial: 0, nullable: false }),
      diceRoll:        new NumberField({ initial: 0, nullable: false }),
      d20AttackRoll:   new NumberField({ initial: -1, nullable: false }),

      // Roll counts
      attackRollCount: new NumberField({ initial: 0, nullable: false }),
      damageRollCount: new NumberField({ initial: 0, nullable: false }),

      // Boolean state flags
      suspended:       new BooleanField({ initial: false }),
      abort:           new BooleanField({ initial: false }),
      itemUseComplete: new BooleanField({ initial: false }),
      noOptionalRules: new BooleanField({ initial: false }),
      AoO:             new BooleanField({ initial: false }),
      isCritical:      new BooleanField({ initial: false }),
      isFumble:        new BooleanField({ initial: false }),

      // needTemplate uses nullable so `null` means "not explicitly set — use
      // computed fallback" while `false` means "explicitly set to false".
      needTemplate:    new BooleanField({ initial: undefined, nullable: true }),

      // String fields
      defaultDamageType: new StringField({ initial: "" }),

      // ── UUID References (Phase 2) ──
      // sourceActorUuid, attackingTokenUuid, activityUuid, templateUuid

      // ── Token UUID Sets (Phase 2) ──
      // hitTargetUuids, saveUuids, failedSaveUuids, etc.

      // ── Rolls (Phase 2) ──
      // attackRoll, damageRolls, bonusDamageRolls, etc.

      // ── Damage Details (Phase 2) ──
      // damageDetail, otherDamageDetail, rawDamageDetail, etc.

      // ── Other (Phase 2) ──
      // workflowOptions, currentAction, effectsAlreadyExpired, etc.
    };
  }
}
