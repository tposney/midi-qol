import { MODULE_ID, error } from "../../midi-qol.js";
import { completeActivityUse, fromActorUuid, getToken, isValidTarget, playerForActor } from "../utils.js";
import { preferredActiveGM, socketlibSocket } from "../GMAction.js";
import { Activity } from "../../globals.js";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * A custom RegionBehaviorType that runs activities for tokens entering/exiting a region or on their turns. Effects
 * applied while inside are dnd5e's `applyActiveEffect` behaviour, created alongside (see `_attachRegionActivityBehavior`).
 *
 * Each rule is { trigger, action, targetUuid } where:
 * - trigger: "entry" | "exit" | "turnStart" | "turnEnd"
 * - action: "useActivity"
 * - targetUuid: full UUID of the activity
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

    for (const rule of rules) {
      if (rule.trigger !== trigger) continue;
      try {
        switch (rule.action) {
          case "useActivity":
            if (oncePerTurn && this._hasTriggeredThisTurn(actor, rule.targetUuid)) {
              continue;
            }
            await this._triggerActivity(token, rule.targetUuid);
            if (oncePerTurn) await this._markTriggeredThisTurn(actor, rule.targetUuid);
            break;
          // applyEffect/removeEffect rules on older regions: effects are now dnd5e's apply-effect behaviour.
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

  async _triggerActivity(token: TokenDocument.Implementation, activityUuid: string): Promise<void> {
    const self = this as any;
    const castLevel = self.castLevel as number;
    const sourceActorUuid = self.sourceActorUuid as string;

    if (!activityUuid) return;

    const triggerData = {
      activityUuid,
      targetUuids: [token.uuid],
      castLevel,
      sourceActorUuid,
    };

    // Resolve the source actor's player owner so the triggered activity is attributed
    // to them (chat author, speaker, rolls). Dispatch directly to that user when
    // possible to avoid a redundant GM hop. playerForActor returns an active player
    // owner if one exists, else falls back to preferredActiveGM.
    const sourceActor = sourceActorUuid ? fromActorUuid(sourceActorUuid) : null;
    const asUser = sourceActor ? playerForActor(sourceActor) : undefined;

    if (asUser?.active && asUser.id === game.user?.id) {
      await MidiRegionActivityBehaviorType._executeTriggerActivity(triggerData);
    } else if (asUser?.active) {
      // midiRegionTriggerActivity is in the canCall whitelist for any user.
      await socketlibSocket.executeAsUser("midiRegionTriggerActivity", asUser.id, triggerData);
    } else if (game.user?.isGM) {
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
    const activity = fromUuidSync(data.activityUuid);
    if (!activity) {
      error(`MidiRegionActivity: activity ${data.activityUuid} not found`);
      return;
    }

    const targetTokens: Set<Token.Implementation> = new Set();
    for (const uuid of data.targetUuids) {
      const tokenDoc = fromUuidSync(uuid) as TokenDocument.Implementation | null;
      const token = tokenDoc?.object ?? (tokenDoc ? getToken(tokenDoc) : null);
      if (token) targetTokens.add(token);
    }
    if (!targetTokens.size) return;

    // _triggerActivity has already dispatched us to the correct client (source
    // actor's owner if online, else GM). Run completeActivityUse locally — chat
    // messages, rolls, and speaker attribution come from whichever user is here.
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

/**
 * `preCreateActiveEffect`: dnd5e's region behaviours apply to every matching token, the caster included. When the
 * activity's midi region settings exclude the source, the caster's copy is not created, on entry or on re-application.
 */
export function excludeRegionSourceEffect(effect: ActiveEffect.Implementation, data: ActiveEffect.CreateData): boolean | void {
  // @ts-expect-error no dnd5e-types
  const behaviorUuid: string | null | undefined = data?.system?.origin?.behavior ?? data?.origin;
  if (typeof behaviorUuid !== "string" || !behaviorUuid.includes(".RegionBehavior.")) return;
  const behavior = fromUuidSync(behaviorUuid) as RegionBehavior.Implementation | null;
  if (!behavior || String(behavior.type) !== "dnd5e.applyActiveEffect") return;
  const region = behavior.parent;
  // @ts-expect-error no dnd5e-types
  const activity = fromUuidSync(region?.flags.dnd5e?.activity) as Activity | null;
  const settings = activity?.regionBehavior as { enabled?: boolean, excludeSource?: boolean } | undefined;
  // Set by midi on the behaviours it creates; otherwise the activity's midi region settings decide.
  const excludeSource = behavior.flags[MODULE_ID]?.excludeSource ?? (settings?.enabled && settings.excludeSource);
  if (!excludeSource) return;
  // @ts-expect-error no dnd5e-types
  const originToken = fromUuidSync(region?.flags.dnd5e?.origin) as TokenDocument.Implementation | null;
  const caster = originToken?.actor ?? activity?.actor;
  if (caster && effect.parent?.uuid === caster.uuid) return false;
}
