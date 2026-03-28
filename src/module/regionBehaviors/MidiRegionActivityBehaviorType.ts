import { MODULE_ID, debugEnabled, error, warn } from "../../midi-qol.js";
import { completeActivityUse, fromActorUuid, getToken, isValidTarget } from "../utils.js";
import { preferredActiveGM, socketlibSocket } from "../GMAction.js";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * A custom RegionBehaviorType that applies activity effects to tokens entering/exiting a region.
 * Uses a rules-based trigger→action model instead of separate per-event UUID sets.
 *
 * Each rule is { trigger, action, targetUuid } where:
 * - trigger: "entry" | "exit" | "turnStart" | "turnEnd"
 * - action: "useActivity" | "applyEffect" | "removeEffect"
 * - targetUuid: full UUID of the activity or effect to act on
 *
 * Registration: CONFIG.RegionBehavior.dataModels["midi-qol.regionActivity"]
 */
// @ts-expect-error fvtt-types RegionBehaviorType generic constraints
export class MidiRegionActivityBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static LOCALIZATION_PREFIXES = [
    `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity`,
    "BEHAVIOR.TYPES.base"
  ];

  static defineSchema() {
    return {
      sourceItemUuid: new StringField({
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.sourceItemUuid.label`,
        hint: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.sourceItemUuid.hint`,
      }),
      sourceActorUuid: new StringField({
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.sourceActorUuid.label`,
        hint: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.sourceActorUuid.hint`,
      }),
      rules: new ArrayField(new SchemaField({
        trigger: new StringField({ required: true, blank: false,
          label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.rules.trigger.label` }),
        action: new StringField({ required: true, blank: false,
          label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.rules.action.label` }),
        targetUuid: new StringField({ required: true, blank: false,
          label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.rules.targetUuid.label` }),
      }), {
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.rules.label`,
      }),
      dispositionFilter: new NumberField({
        initial: -1,
        choices: { [-1]: "Enemies", [0]: "All", [1]: "Allies" },
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.dispositionFilter.label`,
        hint: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.dispositionFilter.hint`,
      }),
      castLevel: new NumberField({
        initial: 0,
        integer: true,
        min: 0,
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.castLevel.label`,
      }),
      excludeSource: new BooleanField({
        initial: true,
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.excludeSource.label`,
      }),
      oncePerTurn: new BooleanField({
        initial: true,
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.oncePerTurn.label`,
      }),
      wallRestriction: new StringField({
        initial: "none",
        // @ts-expect-error fvtt-types missing EDGE_RESTRICTION_TYPES (v14 regions use EDGE not WALL)
        choices: ["none", ...CONST.EDGE_RESTRICTION_TYPES],
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.wallRestriction.label`,
        hint: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.wallRestriction.hint`,
      }),
    };
  }

  /* ---------------------------------------- */
  /*  Helpers                                 */
  /* ---------------------------------------- */

  _passesDispositionFilter(token: TokenDocument.Implementation): boolean {
    const self = this as any;
    const filter = self.dispositionFilter as number;
    if (filter === 0) return true;

    const sourceActorUuid = self.sourceActorUuid as string;
    const sourceActor = sourceActorUuid ? fromActorUuid(sourceActorUuid) : null;
    const sourceToken = sourceActor ? getToken(sourceActor) : null;
    if (!sourceToken) return true;

    const sourceDisposition = sourceToken.document.disposition;
    const tokenDisposition = token.disposition;

    if (filter === 1) return tokenDisposition === sourceDisposition;
    if (filter === -1) return tokenDisposition !== sourceDisposition;
    return true;
  }

  _isSourceToken(token: TokenDocument.Implementation): boolean {
    const self = this as any;
    if (!self.excludeSource) return false;
    const sourceActorUuid = self.sourceActorUuid as string;
    if (!sourceActorUuid) return false;
    return token.actor?.uuid === sourceActorUuid;
  }

  /** Extract a stable short key from an activity UUID. */
  _activityKeyFromUuid(activityUuid: string): string {
    const parts = activityUuid.split(".");
    return parts[parts.length - 1] || activityUuid;
  }

  /**
   * Once-per-turn tracking stored on the Combat document.
   *
   * Why the Combat document:
   * - Only exists during combat (which is exactly when "once per turn" matters)
   * - Persists through page reloads (unlike a runtime Map)
   * - Automatically cleaned up when combat ends (unlike actor flags)
   * - No pollution of actor or behavior documents
   *
   * Flag path: `flags.midi-qol.regionTriggers.{behaviorId}.{actorId}-{activityKey}`
   * Flag value: `"{round}.{turn}"` — identifies the specific combatant turn.
   * The behaviorId scopes entries per-cast so re-casting after concentration drop
   * creates a new namespace with no stale data.
   */
  _hasTriggeredThisTurn(actor: Actor.Implementation, activityUuid: string): boolean {
    if (!activityUuid) return false;
    const combat = game.combat;
    if (!combat?.active) return false;
    const behaviorId = (this as any).parent?.id ?? "";
    const activityKey = this._activityKeyFromUuid(activityUuid);
    const flagPath = `regionTriggers.${behaviorId}.${actor.id}-${activityKey}`;
    // @ts-expect-error dynamic flag key
    const lastValue = combat.getFlag(MODULE_ID, flagPath) as string | undefined;
    if (!lastValue) return false;
    return lastValue === `${combat.round}.${combat.turn}`;
  }

  async _markTriggeredThisTurn(actor: Actor.Implementation, activityUuid: string): Promise<void> {
    if (!activityUuid) return;
    const combat = game.combat;
    if (!combat?.active) return;
    const behaviorId = (this as any).parent?.id ?? "";
    const activityKey = this._activityKeyFromUuid(activityUuid);
    const flagPath = `regionTriggers.${behaviorId}.${actor.id}-${activityKey}`;
    // @ts-expect-error dynamic flag key
    await combat.setFlag(MODULE_ID, flagPath, `${combat.round}.${combat.turn}`);
  }

  /* ---------------------------------------- */
  /*  Unified Rule Execution                  */
  /* ---------------------------------------- */

  async _executeRulesForTrigger(token: TokenDocument.Implementation, trigger: string): Promise<void> {
    const self = this as any;
    const rules = self.rules as Array<{trigger: string, action: string, targetUuid: string}>;
    const oncePerTurn = self.oncePerTurn as boolean;
    const actor = token.actor;
    if (!actor) return;

    console.error(`MidiRegionActivity._executeRulesForTrigger | trigger=${trigger} rules=`, rules, `token=${token.name}`);

    for (const rule of rules) {
      if (rule.trigger !== trigger) continue;
      console.error(`MidiRegionActivity._executeRulesForTrigger | matched rule:`, rule);
      try {
        switch (rule.action) {
          case "useActivity":
            if (oncePerTurn && this._hasTriggeredThisTurn(actor, rule.targetUuid)) {
              console.error(`MidiRegionActivity._executeRulesForTrigger | skipped (already triggered this turn)`);
              continue;
            }
            console.error(`MidiRegionActivity._executeRulesForTrigger | calling _triggerActivity uuid=${rule.targetUuid}`);
            await this._triggerActivity(token, rule.targetUuid);
            if (oncePerTurn) await this._markTriggeredThisTurn(actor, rule.targetUuid);
            break;
          case "applyEffect":
            await this._applyEffectsToToken(token, new Set([rule.targetUuid]));
            break;
          case "removeEffect":
            await this._removeEffectsFromToken(token, new Set([rule.targetUuid]));
            break;
        }
      } catch (err) {
        console.error(`MidiRegionActivity._executeRulesForTrigger | error executing rule:`, rule, err);
      }
    }
  }

  /* ---------------------------------------- */
  /*  Event Handlers                          */
  /* ---------------------------------------- */

  static async _onTokenEnter(this: MidiRegionActivityBehaviorType, event: any): Promise<void> {
    if (!event.user.isSelf) return;
    const { token, movement } = event.data;
    const actor = token.actor;
    if (!actor) return;

    if (this._isSourceToken(token)) return;
    if (!this._passesDispositionFilter(token)) return;
    if (!isValidTarget(token)) return;

    const resumeMovement = movement ? token.pauseMovement() : undefined;
    try {
      await this._executeRulesForTrigger(token, "entry");
    } finally {
      await resumeMovement?.();
    }
  }

  static async _onTokenExit(this: MidiRegionActivityBehaviorType, event: any): Promise<void> {
    if (!event.user.isSelf) return;
    const { token, movement } = event.data;

    const resumeMovement = movement ? token.pauseMovement() : undefined;
    try {
      await this._executeRulesForTrigger(token, "exit");
    } finally {
      await resumeMovement?.();
    }
  }

  static async _onTokenTurnStart(this: MidiRegionActivityBehaviorType, event: any): Promise<void> {
    if (!preferredActiveGM()?.isSelf) return;
    const { token } = event.data;
    const actor = token.actor;
    if (!actor) return;

    if (this._isSourceToken(token)) return;
    if (!this._passesDispositionFilter(token)) return;
    if (!isValidTarget(token)) return;

    await this._executeRulesForTrigger(token, "turnStart");
  }

  static async _onTokenTurnEnd(this: MidiRegionActivityBehaviorType, event: any): Promise<void> {
    if (!preferredActiveGM()?.isSelf) return;
    const { token } = event.data;
    const actor = token.actor;
    if (!actor) return;

    if (this._isSourceToken(token)) return;
    if (!this._passesDispositionFilter(token)) return;
    if (!isValidTarget(token)) return;

    await this._executeRulesForTrigger(token, "turnEnd");
  }

  /* ---------------------------------------- */
  /*  Effect & Activity Execution             */
  /* ---------------------------------------- */

  async _applyEffectsToToken(token: TokenDocument.Implementation, effectUuids: Set<string>): Promise<void> {
    const actor = token.actor;
    if (!actor) return;

    const self = this as any;

    if (!effectUuids.size) return;

    const toCreate: ActiveEffect.CreateData[] = [];
    for (const effectUuid of effectUuids) {
      const sourceEffect = fromUuidSync(effectUuid) as ActiveEffect.Implementation | null;
      if (!sourceEffect) {
        if (debugEnabled > 0) warn(`MidiRegionActivity: effect ${effectUuid} not found`);
        continue;
      }
      // JSON round-trip strips the non-enumerable `changes` getter that shimData adds
      // to toObject() output. Without this, createEmbeddedDocuments → migrateData sees
      // the shimmed getter, enters the v13→v14 migration block, and runs
      // #migrateChangeValue which converts "1" → JSON.parse("1") → 1 (number).
      const data = JSON.parse(JSON.stringify(sourceEffect.toObject()));
      delete (data as any)._id;
      data.origin = self.parent.uuid;
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.regionSourceEffectUuid`, effectUuid);
      if ((data as any)._stats) {
        (data as any)._stats.duplicateSource = sourceEffect.uuid;
        (data as any)._stats.compendiumSource = null;
        (data as any)._stats.exportSource = null;
      }
      toCreate.push(data);
    }

    if (toCreate.length) {
      if (game.user?.isGM) {
        await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
      } else {
        await socketlibSocket.executeAsGM("midiRegionApplyEffects", {
          actorUuid: actor.uuid,
          effects: toCreate,
        });
      }
    }
  }

  async _removeEffectsFromToken(token: TokenDocument.Implementation, effectUuids: Set<string>): Promise<void> {
    const actor = token.actor;
    if (!actor) return;

    const behaviorUuid = (this as any).parent.uuid;
    const toDelete: string[] = [];
    for (const effect of actor.effects) {
      if (effect.origin !== behaviorUuid) continue;
      // @ts-expect-error dynamic flag key
      const regionSourceEffectUuid = effect.getFlag(MODULE_ID, "regionSourceEffectUuid") as string | undefined;
      if (regionSourceEffectUuid && effectUuids.has(regionSourceEffectUuid)) {
        toDelete.push(effect.id!);
      }
    }
    if (!toDelete.length) return;

    if (game.user?.isGM) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
    } else {
      await socketlibSocket.executeAsGM("midiRegionRemoveEffects", {
        actorUuid: actor.uuid,
        effectIds: toDelete,
      });
    }
  }

  async _triggerActivity(token: TokenDocument.Implementation, activityUuid: string): Promise<void> {
    const self = this as any;
    const castLevel = self.castLevel as number;
    const sourceActorUuid = self.sourceActorUuid as string;

    if (!activityUuid) {
      console.error(`MidiRegionActivity._triggerActivity | no activityUuid, returning`);
      return;
    }

    const triggerData = {
      activityUuid,
      targetUuids: [token.uuid],
      castLevel,
      sourceActorUuid,
    };
    console.error(`MidiRegionActivity._triggerActivity | isGM=${game.user?.isGM} triggerData=`, triggerData);

    if (game.user?.isGM) {
      await MidiRegionActivityBehaviorType._executeTriggerActivity(triggerData);
    } else {
      await socketlibSocket.executeAsGM("midiRegionTriggerActivity", triggerData);
    }
  }

  static async _executeTriggerActivity(data: {
    activityUuid: string;
    targetUuids: string[];
    castLevel: number;
    sourceActorUuid: string;
  }): Promise<void> {
    console.error(`MidiRegionActivity._executeTriggerActivity | activityUuid=${data.activityUuid}`);
    const activity = fromUuidSync(data.activityUuid);
    if (!activity) {
      console.error(`MidiRegionActivity._executeTriggerActivity | activity NOT FOUND for uuid=${data.activityUuid}`);
      error(`MidiRegionActivity: activity ${data.activityUuid} not found`);
      return;
    }
    console.error(`MidiRegionActivity._executeTriggerActivity | found activity:`, (activity as any).name);

    const targetTokens: Set<Token.Implementation> = new Set();
    for (const uuid of data.targetUuids) {
      const tokenDoc = fromUuidSync(uuid) as TokenDocument.Implementation | null;
      const token = tokenDoc?.object ?? (tokenDoc ? getToken(tokenDoc) : null);
      if (token) targetTokens.add(token);
    }
    if (!targetTokens.size) {
      console.error(`MidiRegionActivity._executeTriggerActivity | no valid target tokens resolved`);
      return;
    }
    console.error(`MidiRegionActivity._executeTriggerActivity | calling completeActivityUse with ${targetTokens.size} targets`);

    await completeActivityUse(activity as any, {
      midiOptions: {
        targetsToUse: targetTokens,
        spellLevel: data.castLevel || undefined,
        checkGMstatus: false,
        workflowOptions: { noProvokeReaction: true, autoConsumeResource: "both" },
      },
    }, {
      configure: false,
    }, {
      create: true,
    });
  }

  /* ---------------------------------------- */
  /*  Static Event Registration               */
  /* ---------------------------------------- */

  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this._onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this._onTokenExit,
    [CONST.REGION_EVENTS.TOKEN_TURN_START]: this._onTokenTurnStart,
    [CONST.REGION_EVENTS.TOKEN_TURN_END]: this._onTokenTurnEnd,
  };
}
