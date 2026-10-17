import { MODULE_ID, i18n, debugEnabled, error, warn } from "../../midi-qol.js";
import { completeActivityUse, fromActorUuid, getToken, isValidTarget, playerForActor } from "../utils.js";
import { preferredActiveGM, socketlibSocket } from "../GMAction.js";
import { V14RegionDocument } from "../../globals.js";

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
      activationEntry: new BooleanField({
        initial: true,
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.activationEntry.label`,
        hint: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.activationEntry.hint`,
      }),
      moveDistance: new NumberField({ initial: 0, min: 0,
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.moveDistance.label` }),
      moveDirection: new StringField({ initial: "away", choices: ["away", "choose"],
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.moveDirection.label` }),
      moveTiming: new StringField({ initial: "start", choices: ["start", "end"],
        label: `BEHAVIOR.TYPES.${MODULE_ID}.regionActivity.FIELDS.moveTiming.label` }),
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
   * Flag path: `flags.midi-qol.regionTriggers.{behaviorId}.{tokenId}-{activityKey}`. The token, not its actor: unlinked
   * tokens of one actor share the actor's id.
   * Flag value: `"{round}.{turn}"` — identifies the specific combatant turn.
   * The behaviorId scopes entries per-cast so re-casting after concentration drop
   * creates a new namespace with no stale data.
   */
  _hasTriggeredThisTurn(token: TokenDocument.Implementation, activityUuid: string, turn?: string): boolean {
    if (!activityUuid) return false;
    const combat = game.combat;
    if (!combat?.active) return false;
    const behaviorId = (this as any).parent?.id ?? "";
    const activityKey = this._activityKeyFromUuid(activityUuid);
    const flagPath = `regionTriggers.${behaviorId}.${token.id}-${activityKey}`;
    // @ts-expect-error dynamic flag key
    const lastValue = combat.getFlag(MODULE_ID, flagPath) as string | undefined;
    if (!lastValue) return false;
    return lastValue === (turn ?? `${combat.round}.${combat.turn}`);
  }

  async _markTriggeredThisTurn(token: TokenDocument.Implementation, activityUuid: string, turn?: string): Promise<void> {
    if (!activityUuid) return;
    const combat = game.combat;
    if (!combat?.active) return;
    const behaviorId = (this as any).parent?.id ?? "";
    const activityKey = this._activityKeyFromUuid(activityUuid);
    const flagPath = `regionTriggers.${behaviorId}.${token.id}-${activityKey}`;
    // @ts-expect-error dynamic flag key
    await combat.setFlag(MODULE_ID, flagPath, turn ?? `${combat.round}.${combat.turn}`);
  }

  /* ---------------------------------------- */
  /*  Unified Rule Execution                  */
  /* ---------------------------------------- */

  /** `turn` ("round.turn") is the turn a turn event belongs to: turn end fires once the combat has moved on. */
  async _executeRulesForTrigger(token: TokenDocument.Implementation, trigger: string, turn?: string): Promise<void> {
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
            if (oncePerTurn && this._hasTriggeredThisTurn(token, rule.targetUuid, turn)) {
              continue;
            }
            // Marked first: the activity's workflow can outlast the turn (a save), and its end must not trigger it again.
            if (oncePerTurn) await this._markTriggeredThisTurn(token, rule.targetUuid, turn);
            await this._triggerActivity(token, rule.targetUuid);
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

  declare sourceActorUuid: string;
  declare activationEntry: boolean;
  declare moveDistance: number;
  declare moveDirection: "away" | "choose";
  declare moveTiming: "start" | "end";

  /** Core sends tokens already inside an entry right after activating a behavior, in the same synchronous pass. */
  _activating = false;

  static _onBehaviorActivated(this: MidiRegionActivityBehaviorType): void {
    this._activating = true;
    queueMicrotask(() => this._activating = false);
  }

  static async _onTokenEnter(this: MidiRegionActivityBehaviorType, event: any): Promise<void> {
    if (this._activating && !this.activationEntry) return;
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

    await this._executeRulesForTrigger(token, "turnStart", `${event.data.round}.${event.data.turn}`);
  }

  static async _onTokenTurnEnd(this: MidiRegionActivityBehaviorType, event: any): Promise<void> {
    if (!preferredActiveGM()?.isSelf) return;
    const { token } = event.data;
    const actor = token.actor;
    if (!actor) return;

    if (this._isSourceToken(token)) return;
    if (!this._passesDispositionFilter(token)) return;
    if (!isValidTarget(token)) return;

    await this._executeRulesForTrigger(token, "turnEnd", `${event.data.round}.${event.data.turn}`);
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
    [CONST.REGION_EVENTS.BEHAVIOR_ACTIVATED]: this._onBehaviorActivated,
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this._onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this._onTokenExit,
    [CONST.REGION_EVENTS.TOKEN_TURN_START]: this._onTokenTurnStart,
    [CONST.REGION_EVENTS.TOKEN_TURN_END]: this._onTokenTurnEnd,
  };
}

/* ---------------------------------------- */
/*  Moving a region each turn               */
/* ---------------------------------------- */

const COMPASS: Record<string, { x: number, y: number, label: string }> = {
  nw: { x: -1, y: -1, label: "↖" }, n: { x: 0, y: -1, label: "↑" }, ne: { x: 1, y: -1, label: "↗" },
  w: { x: -1, y: 0, label: "←" }, away: { x: 0, y: 0, label: "" }, e: { x: 1, y: 0, label: "→" },
  sw: { x: -1, y: 1, label: "↙" }, s: { x: 0, y: 1, label: "↓" }, se: { x: 1, y: 1, label: "↘" },
};

/** Asks which way to move: a compass direction, away from the caster, or not at all. */
async function chooseMoveDirection(region: V14RegionDocument, distance: number, units: string): Promise<string | null> {
  const buttons = Object.entries(COMPASS).map(([action, { label }]) => ({
    action, label: action === "away" ? i18n("midi-qol.REGION_BEHAVIOR.move.away") : label,
  }));
  buttons.push({ action: "stay", label: i18n("midi-qol.REGION_BEHAVIOR.move.stay") });
  const { DialogV2 } = foundry.applications.api;
  const choice = await DialogV2.wait({
    window: { title: region.name },
    classes: ["midi-qol-move-region"],
    position: { width: 260 },
    content: `<p>${i18n("midi-qol.REGION_BEHAVIOR.move.prompt").replace("{distance}", `${distance} ${units}`)}</p>`,
    buttons,
    rejectClose: false,
  });
  return typeof choice === "string" && choice !== "stay" ? choice : null;
}

/** `combatTurnChange`: moves the regions whose behaviour moves them on the turn that just started or ended. */
export async function moveRegionsOnTurnChange(combat: Combat.Implementation, previous: Combat.HistoryData | undefined, current: Combat.HistoryData) {
  if (!previous || current.round === null || previous.round === null) return;
  // Only forward: no moves when the GM steps back.
  if ((current.round ?? 0) < (previous.round ?? 0) || (current.round === previous.round && (current.turn ?? 0) <= (previous.turn ?? 0))) return;
  const scene = combat.scene ?? canvas?.scene;
  for (const region of (scene?.regions ?? []) as Iterable<V14RegionDocument>) {
    if (region.attachment?.token) continue;
    for (const behavior of region.behaviors) {
      if (behavior.disabled || String(behavior.type) !== `${MODULE_ID}.regionActivity`) continue;
      const system = behavior.system as unknown as MidiRegionActivityBehaviorType;
      const { moveDistance, moveDirection, moveTiming } = system;
      if (!(moveDistance > 0)) continue;
      const combatantId = moveTiming === "end" ? previous.combatantId : current.combatantId;
      const combatant = combatantId ? combat.combatants.get(combatantId) : undefined;
      const actor = combatant?.actor;
      if (!actor || actor.uuid !== system.sourceActorUuid) continue;
      const owner = moveDirection === "choose" ? playerForActor(actor) : undefined;
      const mover = owner?.active ? owner : preferredActiveGM();
      if (!mover?.isSelf) continue;
      const casterToken = combatant?.token;
      if (!casterToken) continue;
      let direction: string | null = "away";
      if (moveDirection === "choose") direction = await chooseMoveDirection(region, moveDistance, scene!.grid.units);
      if (!direction) continue;
      let unit = COMPASS[direction];
      if (direction === "away") {
        const from = casterToken.getCenterPoint();
        const to = region.bounds.center;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length < 1) {
          ui.notifications?.warn(i18n("midi-qol.REGION_BEHAVIOR.move.noDirection").replace("{name}", region.name));
          continue;
        }
        unit = { x: (to.x - from.x) / length, y: (to.y - from.y) / length, label: "" };
      } else {
        const length = Math.hypot(unit.x, unit.y);
        unit = { x: unit.x / length, y: unit.y / length, label: "" };
      }
      await moveRegion(region, unit, moveDistance);
    }
  }
}

/** Moves in grid-sized steps, so tokens the region passes over enter it as well as those it ends on. */
async function moveRegion(region: V14RegionDocument, unit: { x: number, y: number }, distance: number) {
  const scene = region.parent!;
  const stepDistance = scene.grid.distance || distance;
  const steps = Math.max(1, Math.ceil(distance / stepDistance));
  const pixels = distance * scene.dimensions.distancePixels;
  const start = region.shapes.map(s => s.origin);
  for (let i = 1; i <= steps; i++) {
    const offset = { x: unit.x * pixels * i / steps, y: unit.y * pixels * i / steps };
    const shapes = region.shapes.map((shape, j) => {
      const moved = shape.clone({}, { parent: scene });
      moved.move({ x: start[j].x + offset.x, y: start[j].y + offset.y });
      return moved._source;
    });
    if (game.user?.isGM) await region.update({ shapes });
    else await socketlibSocket.executeAsGM("setupRegion", { regionUuid: region.uuid, update: { shapes } });
    // Let the tokens' region membership catch up, so each step's entries fire.
    if (i < steps) await new Promise(resolve => setTimeout(resolve, 250));
  }
}
