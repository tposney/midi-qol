import { warn, debug, log, i18n, MESSAGE_TYPES, error, MQdefaultDamageType, debugEnabled, MQItemMacroLabel, geti18nOptions, GameSystemConfig, i18nSystem, allDamageTypes, MODULE_ID, NumericTerm, MQActivityMacroLabel } from "../midi-qol.js";
import { preferredActiveGM, prepareDamageListToJSON, socketlibSocket, timedAwaitExecuteAsGM, timedExecuteAsGM, unTimedExecuteAsGM } from "./GMAction.js";
import { installedModules } from "./setupModules.js";
import { configSettings, autoRemoveTargets, checkRule, checkMechanic, safeGetGameSetting, UseWeakReferences, SaveToChatCard } from "./settings.js";
import { createDamageDetailV4, processDamageRoll, untargetDeadTokens, checkIncapacitated, getAutoRollDamage, isAutoFastAttack, getAutoRollAttack, getRemoveDamageButtons, getRemoveAttackButtons, getTokenPlayerName, checkNearby, hasCondition, expireMyEffects, validTargetTokens, getOrCreateTokenForActorAsSet, doReactions, playerFor, requestPCActiveDefence, evalActivationCondition, processDamageRollBonusFlags, asyncHooksCallAll, asyncHooksCall, MQfromUuidSync, midiRenderRoll, markFlanking, canSense, tokenForActor, getOrCreateTokenForActor, createConditionData, evalCondition, removeHidden, hasDAE, computeCoverBonus, FULL_COVER, isInCombat, displayDSNForRoll, setActionUsed, removeInvisible, getTokenDocument, getToken, getIconFreeLink, activityHasAutoPlaceTemplate, addRollTo, sumRolls, midiRenderAttackRoll, midiRenderDamageRoll, midiRenderBonusDamageRoll, midiRenderOtherDamageRoll, debouncedUpdate, getCachedDocument, clearUpdatesCache, getDamageType, getTokenName, setRollOperatorEvaluated, evalAllConditionsAsync, getAppliedEffects, canSee, CEAddEffectWith, getCEEffectByName, CEHasEffectApplied, CERemoveEffect, CEToggleEffect, getActivityDefaultDamageType, activityHasAreaTarget, getsaveMultiplierForActivity, checkActivityRange, computeDistance, getAoETargetType, getActivityAutoTargetAction, activityHasEmanationNoTemplate, isAutoFastDamage, completeActivityUse, getActor, getRemoveAllButtons, requestPCSave, addUpdatesCache, addUpdatesCacheFlags, updatesCache } from "./utils.js"
import { OnUseMacros } from "./apps/Item.js";
import { bonusCheck, collectBonusFlags, defaultRollOptions, procAbilityAdvantage } from "./patching.js";
import { saveTargetsUndoData, saveUndoData } from "./undo.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { busyWait } from "./tests/setupTest.js";
import { MidiSummonActivity } from "./activities/SummonActivity.js";
import { postTemplateConfirmTargets, selectTargets, templateTokens } from "./activities/activityHelpers.js";
import { get } from "jquery";

export const shiftOnlyEvent = { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, type: "" };
export function noKeySet(event) { return !(event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey) }
export const WorkflowDataFlags = {
  activity: "midi-qol.activityUuid",
  actor: "midi-qol.sourceActorUuid",
  advantageSaves: "midi-qol.advantageSaveUuids",
  advReminderAttackAdvAttribution: "midi-qol.advReminderAttackAdvAttribution",
  ammunitionOnUseMacros: "midi-qol.ammunitionOnUseMacros",
  AoO: "midi-qol.AoO",
  attackAdvAttribution: "midi-qol.attackAdvAttribution",
  attackTotal: "midi-qol.attackTotal", // Cannot change
  attackRoll: "midi-qol.attackRoll", // Cannot change
  attackRollCount: "midi-qol.attackRollCount",
  bonusDamageRolls: "midi-qol.bonusDamageRolls",
  bonusDamageTotal: "midi-qol.bonusDamageTotal", //
  criticalSaves: "midi-qol.criticalSaveUuids",
  currentAction: "midi-qol.currentAction",
  d20AttackRoll: "midi-qol.d20AttackRoll", // cannot change
  damageList: "midi-qol.damageList",
  damageRollCount: "midi-qol.damageRollCount",
  damageRolls: "midi-qol.damageRolls",
  damageTotal: "midi-qol.damageTotal", // cannot change
  defaultDamageType: "midi-qol.defaultDamageType",
  diceRoll: "midi-qol.diceRoll", // cannot change
  effectsAlreadyExpired: "midi-qol.effectsAlreadyExpired",
  extraRolls: "midi-qol.extraRolls",
  failedSaves: "midi-qol.failedSaveUuids",
  fumbleSaves: "midi-qol.fumbleSaveUuids",
  hitTargets: "midi-qol.hitTargetUuids", // cannot change
  hitTargetsEC: "midi-qol.hitECTargetUuids", // cannot change
  inCombat: "midi-qol.inCombat",
  isCritical: "midi-qol.isCritical", // cannot change
  isFumble: "midi-qol.isFumble", // cannot change
  item: "dnd5e.item", // cannot change
  itemUseComplete: "midi-qol.itemUseComplete",
  needTemplate: "midi-qol.needTemplate",
  noOptionalRules: "midi-qol.noOptionalRules",
  onUseMacros: "midi-qol.OnUseMacros",
  otherDamageRolls: "midi-qol.otherDamageRolls",
  otherDamageTotal: "midi-qol.otherDamageTotal",
  rawBonusDamageDetail: "midi-qol.rawBonusDamageDetail",
  rawDamageDetail: "midi-qol.rawDamageDetail", // cannot change
  rawOtherDamageDetail: "midi-qol.rawOtherDamageDetail",
  saveDisplayData: "midi-qol.saveDisplayData",
  saveRolls: "midi-qol.saveRolls",
  saves: "midi-qol.saveUuids",
  semiSuperSavers: "midi-qol.semiSuperSaverUuids",
  speaker: "speaker", // cannot change
  superSavers: "midi-qol.superSaverUuids",
  suspended: "midi-qol.suspended",
  targets: "midi-qol.targetUuids", // cannot change
  targetsCanSee: "midi-qol.targetsCanSeeUuids",
  targetsCanSense: "midi-qol.targetsCanSenseUuids",
  tokenCanSee: "midi-qol.tokenCanSeeUuids",
  tokenCanSense: "midi-qol.tokenCanSenseUuids",
  token: "midi-qol.attackingTokenUuid",
  templateUuid: "midi-qol.templateUuid",
  workflowOptions: "midi-qol.workflowOptions",
  utilityRolls: "midi-qol.utilityRolls",
  rolls: "rolls",
  abort: "midi-qol.aborted",
}

function damageDetailToObject(damageDetail: any[]) {
  if (!damageDetail) return [];
  return foundry.utils.deepClone(damageDetail).map(d => {
    if (d.properties) d.properties = Array.from(d.properties);
    return d;
  })
}
function damageDetailsFromObject(damageDetail: any) {
  if (!damageDetail) return [];
  return damageDetail.map(d => {
    if (d.properties) d.properties = new Set(d.properties);
    return d;
  })
}

type damageBonusMacroSingleResult = {
  damageRoll: string | undefined;
  flavor: string | undefined;
  damageType: string | undefined;
};
type damageBonusMacroResult = damageBonusMacroSingleResult[] | damageBonusMacroSingleResult;

export type WorkflowState = undefined | ((context: any) => Promise<WorkflowState>);
export class Workflow {
  public static WorkflowDataFlags = WorkflowDataFlags;
  [x: string]: any;
  static get forceCreate(): boolean { return true }
  static _workflows: Map<string, WeakRef<Workflow> | Workflow> = new Map();
  static clearWorkflows() {
    Workflow._workflows = new Map();
  }

  static addWorkflow(workflow: Workflow) {
    if (Workflow._workflows.has(workflow.id)) console.warn("midi-qol | addWorkflow | Workflow already exists", workflow.id);
    if (Workflow._workflows.has(workflow.id)) Workflow.removeWorkflow(workflow.id);
    if (UseWeakReferences) Workflow._workflows.set(workflow.id, new WeakRef(workflow));
    else Workflow._workflows.set(workflow.id, workflow);
  }
  static get workflows() { return Workflow._workflows }
  static getWorkflow(id: string | undefined): Workflow | undefined {
    if (debugEnabled > 0) warn("Get workflow ", id, Workflow._workflows, Workflow._workflows[id ?? ""])

    if (debugEnabled > 1) debug("Get workflow ", id, Workflow._workflows, Workflow._workflows[id ?? ""])
    if (!id) return undefined;
    let workflow = Workflow._workflows.get(id);
    if (workflow instanceof WeakRef) {
      if (!workflow?.deref()) {
        console.warn("Weak Reference to workflow is not dereferenced", id);
        const _workflow = Workflow.fromChatCardUuid(id);
        if (_workflow) {
          workflow = new WeakRef(_workflow);
          Workflow._workflows.set(id, workflow);
        }
        return _workflow;
      }
      return workflow.deref();
    } else if (workflow) return workflow;
    const chatCard = fromUuidSync(id as any);
    if (chatCard instanceof ChatMessage && SaveToChatCard) {
      workflow = Workflow.fromChatCardUuid(id);
      if (workflow) Workflow._workflows.set(id, workflow);
      return workflow;
    }
    // TODO see if the ChatMessage exists and reconstruct the workflow from that.
    // try fetching via ActivityUuid
    return this.getWorkflowByActivityUuid(id);
  }

  static getWorkflowByActivityUuid(activityUuid: string | undefined): Workflow | undefined {
    if (!activityUuid) return undefined;
    // Hacky way to get the most recent workflow for an activityUuid - which is probably what we want.
    // depends on map iterating in order of insertion 
    const entries = Array.from(Workflow._workflows.entries()).reverse();
    let returnValue: any = undefined;
    for (const [key, workflow] of entries) {
      if (workflow instanceof WeakRef) {
        if (workflow?.deref()?.activity?.uuid === activityUuid) {
          returnValue = Workflow.getWorkflow(key);
          break;
        }
      } else if (workflow.activity?.uuid === activityUuid) {
        returnValue = Workflow.getWorkflow(key);
        break;
      }
    }
    if (debugEnabled > 0) warn(`Fetching workflow by activity uuid ${activityUuid} workflowId: ${returnValue?.id}`);
    return returnValue;
  }
  static deleteWorkflow(id: string) {
    Workflow._workflows.delete(id);
  }

  static fromChatCardUuid(chatCardUuid: string): Workflow | undefined {
    return new Workflow(null, null, null, null, { chatCardUuid });
  }

  performDebouncedUpdate(chatCard, updates, immediate = false) {
    // ugly hack to force updates into the cache for things that are sets
    if (SaveToChatCard) {
      this.actor = this.actor;
      this.activity = this.activity;
      this.targets = this.targets;
      this.token = this.token;
      this.saves = this.saves;
      this.failedSaves = this.failedSaves;
      this.criticalSaves = this.criticalSaves;
      this.superSavers = this.superSavers;
      this.semiSuperSavers = this.semiSuperSavers;
      this.hitTargets = this.hitTargets;
      this.hitTargetsEC = this.hitTargetsEC;
      this.fumbleSaves = this.fumbleSaves;
      this.advReminderAttackAdvAttribution = this.advReminderAttackAdvAttribution;
      this.attackAdvAttribution = this.attackAdvAttribution;
      this.actor = this.actor;
      this.targetsCanSee = this.targetsCanSee;
      this.targetsCanSense = this.targetsCanSense;
      this.tokenCanSee = this.tokenCanSee;
      this.tokenCanSense = this.tokenCanSense;
    }
    return debouncedUpdate(chatCard, updates, immediate);
  }

  itemCardUuid: string | undefined | null;
  _actor: any | undefined;
  // Since no dnd5e types can't use Actor5e and Actor throws too many errors
  get actor(): any | undefined {
    if (this._actor) return this._actor;
    if (this.itemCardUuid && SaveToChatCard) {
      this._actor = fromUuidSync(foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.actor));
    }
    return this._actor;
  }
  set actor(actor: Actor) {
    this._actor = actor;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.actor]: actor.uuid });
    }
  }

  _abort: boolean | undefined = undefined;
  get abort() {
    if (this._abort !== undefined) return this._abort;
    if (this.itemCardUuid && SaveToChatCard) {
      this._abort = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.abort);
    }
    return this._abort ?? false;
  }

  set abort(abort: boolean) {
    this._abort = abort;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { abort });
    }
  }
  _itemUseComplete: boolean | undefined = undefined;
  get itemUseComplete() {
    if (this._itemUseComplete !== undefined) return this._itemUseComplete;
    if (this.itemCardUuid && SaveToChatCard) {
      this._itemUseComplete = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.itemUseComplete);
    }
    return this._itemUseComplete ?? false;
  }
  set itemUseComplete(itemUseComplete: boolean) {
    this._itemUseComplete = !!itemUseComplete;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.itemUseComplete]: itemUseComplete });
    }
  }

  _token: Token | undefined;
  get token(): Token | undefined {
    if (this._token) return this._token;
    if (this.itemCardUuid && SaveToChatCard) {
      const tokenUuid = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.token);
      this._token = getToken(tokenUuid);
    }
    return this._token;
  }
  set token(token: Token | undefined) {
    this._token = token;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.token]: token?.document?.uuid ?? "" });
    }
  }

  _workflowOptions: any | undefined = undefined;
  // Provided for some backwards compatibility
  get options(): any {
    foundry.utils.logCompatibilityWarning("workflow#options is deprecated in favor of using"
      + " workflow.workflowOptions", { since: "12.4.32", until: "12.5" });
    return this.workflowOptions;
  }

  get workflowOptions(): any {
    if (this._workflowOptions) return this._workflowOptions;
    if (this.itemCardUuid && SaveToChatCard) {
      this._workflowOptions = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.workflowOptions);
    }
    return this._workflowOptions ?? {};
  }
  set workflowOptions(workflowOptions: any) {
    this._workflowOptions = workflowOptions;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.workflowOptions]: workflowOptions });
    }
  }

  get needItemCard(): boolean { return !!this.itemCardUuid };

  _activity: any | undefined = undefined;
  get activity(): any | undefined {
    if (this._activity) return this._activity;
    if (this.itemCardUuid && SaveToChatCard) {
      // If fetching the activity we need to redo scaling for the fetched activity.
      const activityUuid = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.activity);
      this._activity = fromUuidSync(activityUuid);
      const scaling = this.chatCard.getFlag("dnd5e", "scaling");
      if (scaling) {
        const item = this._activity.item.clone({ "flags.dnd5e.scaling": scaling }, { keepId: true });
        this.activity = item.system.activities.get(this.activity.id)
      }
      if (!this._activity) {
        const message = `midi-qol | get activity() | Could not find activity for workflow ${this.id} with activityUuid ${activityUuid}`;
        TroubleShooter.recordError(new Error(message));
        console.error(message);
      }
    }
    return this._activity;
  }
  set activity(activity: any) {
    this._activity = activity;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.activity]: activity.uuid });
    }
  }

  //@ts-expect-error dnd5e v10
  _item: globalThis.dnd5e.documents.Item5e | undefined = undefined;
  get item(): any | undefined {
    if (this._item) return this._item;
    if (this.itemCardUuid && SaveToChatCard) {
      const itemUuid = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.item)?.uuid;
      this._item = fromUuidSync(itemUuid);
      if (!this._item) {
        // foundry.utils.getProperty(this.chatCard, "flags." + chatCardFlags.item)?.itemData - can use this get the item back?
        const message = `midi-qol | get item() | Could not find item for workflow ${this.id} with itemUuid ${itemUuid}`;
        TroubleShooter.recordError(new Error(message));
        console.error(message);
      }
    }
    return this._item;
  }
  set item(item: Item) {
    this._item = item;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [`${WorkflowDataFlags.item}.uuid`]: item.uuid });
    }
  }

  event: { shiftKey: boolean, altKey: boolean, ctrlKey: boolean, metaKey: boolean, type: string };

  // This value is not stored in flags
  _speaker: any = undefined;
  get speaker(): any | undefined {
    if (this._speaker) return this._speaker;
    if (this.itemCardUuid && SaveToChatCard) {
      this._speaker = foundry.utils.getProperty(this.chatCard, WorkflowDataFlags.speaker);
    }
    return this._speaker;
  }
  set speaker(speaker: any) {
    // TODO do an equals check on the stored and passed speaker
    this._speaker = speaker;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCache(this.id, { [WorkflowDataFlags.speaker]: speaker });
    }
  }

  get attackingToken(): Token | undefined {
    return this.token
  }
  get tokenUuid(): string | undefined {
    return this.token?.document.uuid;
  }
  _targets: Set<Token | TokenDocument> | undefined = undefined;
  get targets(): Set<Token | TokenDocument> {
    if (this._targets) return this._targets;
    const cardTargets = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.targets);
    if (cardTargets) {
      this._targets = new Set(cardTargets.map(data => (fromUuidSync(data.uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._targets
    }
    return new Set();
  }
  set targets(targets: Set<Token | TokenDocument>) {
    this._targets = targets;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(targets).map(t => getTokenDocument(t)).filter(t => t);
      const targetUpdates = targetDocuments.map(t => ({ uuid: t.uuid, name: t.name }));
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.targets]: targetUpdates });
    }
  }

  _targetCanSee: Set<Token | TokenDocument> | undefined = undefined;
  get targetsCanSee(): Set<Token | TokenDocument> {
    if (this._targetCanSee) return this._targetCanSee;
    const cardTargets = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.targetsCanSee);
    if (cardTargets) {
      this._targetCanSee = new Set(cardTargets.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._targetCanSee
    }
    return new Set();
  }
  set targetsCanSee(targetsCanSee: Set<Token | TokenDocument>) {
    this._targetCanSee = targetsCanSee;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(targetsCanSee).map(t => getTokenDocument(t)).filter(t => t);
      const targetUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.targetsCanSee]: targetUpdates });
    }
  }
  _targetsCanSense: Set<Token | TokenDocument> | undefined = undefined;
  get targetsCanSense(): Set<Token | TokenDocument> {
    if (this._targetsCanSense) return this._targetsCanSense;
    const cardTargets = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.targetsCanSense);
    if (cardTargets) {
      this._targetsCanSense = new Set(cardTargets.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._targetsCanSense
    }
    return new Set();
  }
  set targetsCanSense(targetsCanSense: Set<Token | TokenDocument>) {
    this._targetsCanSense = targetsCanSense;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(targetsCanSense).map(t => getTokenDocument(t)).filter(t => t);
      const targetUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.targetsCanSense]: targetUpdates });
    }
  }

  _tokenCanSee: Set<Token | TokenDocument> | undefined = undefined;
  get tokenCanSee(): Set<Token | TokenDocument> {
    if (this._tokenCanSee) return this._tokenCanSee;
    const cardTargets = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.tokenCanSee);
    if (cardTargets) {
      this._tokenCanSee = new Set(cardTargets.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._tokenCanSee
    }
    return new Set();
  }
  set tokenCanSee(tokenCanSee: Set<Token | TokenDocument>) {
    this._tokenCanSee = tokenCanSee;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(tokenCanSee).map(t => getTokenDocument(t)).filter(t => t);
      const targetUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.tokenCanSee]: targetUpdates });
    }
  }

  _tokenCanSense: Set<Token | TokenDocument> | undefined = undefined;
  get tokenCanSense(): Set<Token | TokenDocument> {
    if (this._tokenCanSense) return this._tokenCanSense;
    const cardTargets = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.tokenCanSense);
    if (cardTargets) {
      this._tokenCanSense = new Set(cardTargets.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._tokenCanSense
    }
    return new Set();
  }
  set tokenCanSense(tokenCanSense: Set<Token | TokenDocument>) {
    this._tokenCanSense = tokenCanSense;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(tokenCanSense).map(t => getTokenDocument(t)).filter(t => t);
      const targetUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.tokenCanSense]: targetUpdates });
    }
  }

  _templateUuid: string | undefined = undefined;
  get templateUuid(): string | undefined {
    if (this._templateUuid) return this._templateUuid;
    if (this.itemCardUuid && SaveToChatCard) {
      this._templateUuid = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.templateUuid);
    }
    return this._templateUuid;
  }
  set templateUuid(templateUuid: string) {
    this._templateUuid = templateUuid;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.templateUuid]: templateUuid });
    }
  }

  get template(): MeasuredTemplate | undefined {
    return this._templateUuid ? fromUuidSync(this._templateUuid as any) as any as MeasuredTemplate : undefined;
  }

  get templateId() {
    if (!this.templateUuid || typeof this.templateUuid !== "string") return undefined;
    return this.templateUuid.split(".")[-1];
  }
  placeTemplateHookId: number | null;

  get inCombat() {
    return this.actor.inCombat
  }
  isTurn: boolean | undefined; // Is it the item wielder's turn.
  _AoO: boolean | undefined; // Is the attack an attack of opportunity
  get AoO() {
    if (this._AoO !== undefined) return this._AoO;
    if (this.itemCardUuid && SaveToChatCard) {
      this._AoO = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.AoO);
    }
    return this._AoO ?? false;
  }
  set AoO(AoO: boolean) {
    this._AoO = AoO;
    if (this.itemCardUuid) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.AoO]: AoO });
    }
  }
  _damageList: any[] | undefined;
  get damageList() {
    if (this._damageList) return this._damageList;
    if (this.itemCardUuid && SaveToChatCard) {
      this._damageList = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.damageList);
    }
    return this._damageList ?? [];
  }
  set damageList(damageList: any[]) {
    this._damageList = damageList;
    if (this.itemCardUuid && SaveToChatCard) {
      // This is just too big to store in the chat message - see if there can be a cut down version stored
      // addUpdatesCacheFlags(this.id, { [chatCardFlags.damageList]: damageList });
    }
  }

  saveDisplayFlavor: string | undefined;

  _id: string = "";
  get id() { return this._id }
  set id(id: string) { this._id = id }

  get uuid() {
    if (debugEnabled > 0) warn(`workflow.uuid is deprecated. Use workflow.id to reference the workflow and workflow.itemUuid to reference the item instead.
      Returning ${this.activity.uuid} workflowId: ${this.id}`);
    return this.activity.uuid;
  }

  __suspended: boolean | undefined = undefined;
  get suspended() {
    if (this._suspended !== undefined) return this._suspended;
    if (this.itemCardUuid && SaveToChatCard) {
      this._suspended = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.suspended);
    }
    return this._suspended ?? false;
  }
  set suspended(suspended: boolean) {
    this._suspended = suspended;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.suspended]: suspended });
    }
  }
  _currentAction: any | undefined = undefined;
  get currentAction() {
    if (this._currentAction) return this._currentAction;
    if (this.itemCardUuid && SaveToChatCard) {

      const [className, currentActionName] = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.currentAction) ?? ["none", "none"];
      if (className !== "none") {
        const actionClass = eval(className);
        if (actionClass === Workflow || actionClass.prototype instanceof Workflow) {
          const action = actionClass?.prototype[currentActionName];
          if (action) {
            this._currentAction = action;
          } else {
            error(`get currentAction() | Could not find action ${currentActionName} in class ${className}`);
          }
        } else error(`get currentAction() | Class ${className} is not a subclass of Workflow`);
      }
    }
    return this._currentAction;
  }
  set currentAction(currentAction: any) {
    this._currentAction = currentAction;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.currentAction]: [this.constructor.name, currentAction.name] });
    }
  }

  _isCritical: boolean | undefined = undefined;
  get isCritical() {
    if (this._isCritical !== undefined) return this._isCritical;
    if (this.itemCardUuid && SaveToChatCard) {
      this._isCritical = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.isCritical);
    }
    return this._isCritical ?? false;
  }
  set isCritical(isCritical: boolean) {
    this._isCritical = isCritical;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.isCritical]: isCritical });
    }
  }
  _isFumble: boolean | undefined = undefined;
  get isFumble() {
    if (this._isFumble !== undefined) return this._isFumble;
    if (this.itemCardUuid && SaveToChatCard) {
      this._isFumble = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.isFumble);
    }
    return this._isFumble ?? false;
  }
  set isFumble(isFumble: boolean) {
    this._isFumble = isFumble;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.isFumble]: isFumble });
    }
  }

  _d20AttackRoll: number | undefined = undefined;
  get d20AttackRoll() {
    if (this._d20AttackRoll) return this._d20AttackRoll;
    if (this.itemCardUuid && SaveToChatCard) {
      this._d20AttackRoll = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.d20AttackRoll);
    }
    return this._d20AttackRoll ?? -1;
  }
  set d20AttackRoll(d20AttackRoll: number) {
    this._d20AttackRoll = d20AttackRoll;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.d20AttackRoll]: d20AttackRoll });
    }
  }
  _hitTargets: Set<Token | TokenDocument> | undefined = undefined;
  get hitTargets(): Set<Token | TokenDocument> {
    if (this._hitTargets) return this._hitTargets;
    const cardTargets = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.hitTargets);
    if (cardTargets) {
      this._hitTargets = new Set(cardTargets.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._hitTargets
    }
    return new Set();
  }
  set hitTargets(hitTargets: Set<Token | TokenDocument>) {
    this._hitTargets = hitTargets;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(hitTargets).map(t => getTokenDocument(t)).filter(t => t);
      const hitTargetUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.hitTargets]: hitTargetUpdates });
    }
  }

  _hitTargetsEC: Set<Token | TokenDocument> | undefined = undefined;
  get hitTargetsEC(): Set<Token | TokenDocument> {
    if (this._hitTargetsEC) return this._hitTargetsEC;
    const cardTargets = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.hitTargetsEC);
    if (cardTargets) {
      this._hitTargetsEC = new Set(cardTargets.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._hitTargetsEC
    }
    return new Set();
  }
  set hitTargetsEC(hitTargetsEC: Set<Token | TokenDocument>) {
    this._hitTargetsEC = hitTargetsEC;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(hitTargetsEC).map(t => getTokenDocument(t)).filter(t => t);
      const hitTargetUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.hitTargetsEC]: hitTargetUpdates });
    }
  }
  _attackRoll: Roll | undefined;
  get attackRoll(): Roll | undefined {
    if (this._attackRoll) return this._attackRoll;
    if (this.itemCardUuid && SaveToChatCard) {
      this._attackRoll = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.attackRoll);
    }
    return this._attackRoll;
  }
  set attackRoll(attackRoll: Roll | undefined) {
    if (attackRoll) attackRoll.data = {};
    this._attackRoll = attackRoll;
    if (this.itemCardUuid && SaveToChatCard) {
      const attackRollData: any = attackRoll?.toJSON();
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.attackRoll]: attackRollData });
    }
  }

  _diceRoll: number | undefined;
  get diceRoll() {
    if (this._diceRoll) return this._diceRoll;
    if (this.itemCardUuid && SaveToChatCard) {
      this._diceRoll = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.diceRoll);
    }
    return this._diceRoll ?? 0;
  }
  set diceRoll(diceRoll: number) {
    this._diceRoll = diceRoll;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.diceRoll]: diceRoll });
    }
  }
  _attackTotal: number | undefined = undefined;
  get attackTotal() {
    if (this._attackTotal) return this._attackTotal;
    if (this.itemCardUuid && SaveToChatCard) {
      this._attackTotal = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.attackTotal);
    }
    return this._attackTotal ?? 0;
  }
  set attackTotal(attackTotal: number) {
    this._attackTotal = attackTotal;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.attackTotal]: attackTotal });
    }
  }
  attackRollHTML: HTMLElement | JQuery<HTMLElement> | string | undefined;
  _attackRollCount: number | undefined;
  get attackRollCount() {
    if (this._attackRollCount) return this._attackRollCount;
    if (this.itemCardUuid && SaveToChatCard) {
      this._attackRollCount = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.attackRollCount);
    }
    return this._attackRollCount ?? 0;
  }
  set attackRollCount(attackRollCount: number) {
    this._attackRollCount = attackRollCount;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.attackRollCount]: attackRollCount });
    }
  }
  noAutoAttack: boolean | undefined; // override attack roll for standard care

  hitDisplayData: any;

  get utilityRoll() {
    if (!this.utilityRolls || this.utilityRolls.length === 0) return undefined;
    let finalRoll = this.utilityRolls.slice(1).reduce((rolls, roll) => addRollTo(rolls, roll), this.utilityRolls[0]);
    return finalRoll;
  }
  set utilityRoll(roll: Roll | undefined) {
    if (roll) this.setUtilityRoll(roll);
  }

  get damageRoll(): Roll | undefined {
    if (!this.damageRolls || this.damageRolls.length === 0) return undefined;
    let finalRoll = this.damageRolls.slice(1).reduce((rolls, roll) => addRollTo(rolls, roll), this.damageRolls[0]);
    return finalRoll;
  }
  set damageRoll(roll: Roll | undefined) {
    if (roll) this.setDamageRoll(roll);
  }
  set bonusDamageRoll(roll: Roll | undefined) {
    if (roll) this.setBonusDamageRoll(roll);
  }
  get bonusDamageRoll(): Roll | undefined {
    if (!this.bonusDamageRolls || this.bonusDamageRolls.length === 0) return undefined;
    let finalRoll = this.bonusDamageRolls.slice(1).reduce((rolls, roll) => addRollTo(rolls, roll), this.bonusDamageRolls[0]);
    return finalRoll;
  }
  get otherDamageRoll(): Roll | undefined {
    if (!this.otherDamageRolls || this.otherDamageRolls.length === 0) return undefined;
    let finalRoll = this.otherDamageRolls.slice(1).reduce((rolls, roll) => addRollTo(rolls, roll), this.otherDamageRolls[0]);
    return finalRoll;
  }
  set otherDamageRoll(roll: Roll | undefined) {
    if (roll) this.setOtherDamageRoll(roll);
  }
  get otherActivity() {
    return this.activity.otherActivity;
  }
  get activityHasSave() {
    return this.saveActivity?.save || this.saveActivity?.check;
  }
  get saveActivity() {
    if (this.activity.save || this.activity.check) return this.activity;
    if (this.otherActivity?.save || this.otherActivity?.check) return this.otherActivity;
    return undefined;
  }

  get saveItem() {
    if (this.activity.save || this.activity.check) return this.item;
    return this.saveActivity?.item ?? this.activity.item;
  }

  _rolls: Roll[] | undefined = undefined;
  get rolls(): Roll[] {
    if (this._rolls) return this._rolls;
    if (this.itemCardUuid && SaveToChatCard) {
      this._rolls = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.rolls);
    }
    return this._rolls ?? [];
  }
  _damageRolls: Roll[] | undefined = undefined;
  get damageRolls(): Roll[] {
    if (this._damageRolls) return this._damageRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      const damageRollData =
        this._damageRolls = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.damageRolls);
    }
    return this._damageRolls ?? [];
  }
  set damageRolls(damageRolls: Roll[]) {
    this._damageRolls = damageRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.damageRolls]: damageRolls.map(r => r.toJSON()) });
    }
  }
  _bonusDamageRolls: Roll[] | undefined = undefined;
  get bonusDamageRolls(): Roll[] | undefined {
    if (this._bonusDamageRolls) return this._bonusDamageRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      this._bonusDamageRolls = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.bonusDamageRolls);

    }
    return this._bonusDamageRolls;
  }
  set bonusDamageRolls(bonusDamageRolls: Roll[] | undefined) {
    this._bonusDamageRolls = bonusDamageRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.bonusDamageRolls]: bonusDamageRolls?.map(r => r.toJSON()) });
    }
  }

  _otherDamageRolls: Roll[] | undefined = undefined;
  get otherDamageRolls(): Roll[] | undefined {
    if (this._otherDamageRolls) return this._otherDamageRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      this._otherDamageRolls = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.otherDamageRolls);
    }
    return this._otherDamageRolls;
  }
  set otherDamageRolls(otherDamageRolls: Roll[] | undefined) {
    this._otherDamageRolls = otherDamageRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.otherDamageRolls]: otherDamageRolls?.map(r => r.toJSON()) });
    }
  }
  _extraRolls: Roll[] | undefined;
  get extraRolls(): Roll[] | undefined {
    if (this._extraRolls) return this._extraRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      this._extraRolls = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.extraRolls);
    }
    return this._extraRolls ?? [];
  }
  set extraRolls(extraRolls: Roll[] | undefined) {
    this._extraRolls = extraRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.extraRolls]: this._extraRolls?.map(d => d.toJSON()) });
    }
  }
  _utilityRolls: Roll[] | undefined;
  get utilityRolls(): Roll[] | undefined {
    if (this._utilityRolls) return this._utilityRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      this._utilityRolls = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.utilityRolls);
    }
    return this._utilityRolls ?? [];
  }
  set utilityRolls(utilityRolls: Roll[] | undefined) {
    this._utilityRolls = utilityRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.utilityRolls]: utilityRolls?.map(d => { d.data = {}; return d.toJSON() }) });
    }
  }
  _saveRolls: Roll[] | undefined = undefined;
  get saveRolls(): Roll[] {
    if (this._saveRolls) return this._saveRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error
      const D20Roll = CONFIG.Dice.D20Roll;
      this._saveRolls = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.saveRolls)?.map(d => new D20Roll(d.formula, d));
    }
    return this._saveRolls ?? [];
  }
  set saveRolls(saveRolls: Roll[]) {
    this._saveRolls = saveRolls;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.saveRolls]: saveRolls.map(d => ({ formula: d.formula, options: d.options })) });
    }
  }
  _damageTotal: number | undefined;
  get damageTotal() {
    if (this._damageTotal) return this._damageTotal;
    if (this.itemCardUuid && SaveToChatCard) {
      this._damageTotal = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.damageTotal);
    }
    return this._damageTotal ?? 0;
  }
  set damageTotal(damageTotal: number) {
    this._damageTotal = damageTotal;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.damageTotal]: damageTotal });
    }
  }

  _rawDamageDetail: any[] | undefined = undefined;
  get rawDamageDetail(): any[] | undefined {
    if (this._rawDamageDetail) return this._rawDamageDetail;
    if (this.itemCardUuid && SaveToChatCard) {
      this._rawDamageDetail = damageDetailsFromObject(foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.rawDamageDetail));
    }
    return this._rawDamageDetail;
  }

  set rawDamageDetail(rawDamageDetail: any[]) {
    this._rawDamageDetail = rawDamageDetail;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.rawDamageDetail]: damageDetailToObject(rawDamageDetail) });
    }
  }

  _rawOtherDamageDetail: any[] | undefined = undefined;
  get rawOtherDamageDetail(): any[] | undefined {
    if (this._rawOtherDamageDetail) return this._rawOtherDamageDetail;
    if (this.itemCardUuid && SaveToChatCard) {
      this._rawOtherDamageDetail = damageDetailsFromObject(foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.rawOtherDamageDetail));
    }
    return this._rawOtherDamageDetail;
  }
  set rawOtherDamageDetail(rawOtherDamageDetail: any[]) {
    this._rawOtherDamageDetail = rawOtherDamageDetail;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.rawOtherDamageDetail]: damageDetailToObject(rawOtherDamageDetail) });
    }
  }
  _rawBonusDamageDetail: any[] | undefined = undefined;
  get rawBonusDamageDetail(): any[] | undefined {
    if (this._rawBonusDamageDetail) return this._rawBonusDamageDetail;
    if (this.itemCardUuid && SaveToChatCard) {
      this._rawBonusDamageDetail = damageDetailsFromObject(foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.rawBonusDamageDetail));
    }
    return this._rawBonusDamageDetail;
  }
  set rawBonusDamageDetail(rawBonusDamageDetail: any[]) {
    this._rawBonusDamageDetail = rawBonusDamageDetail;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.rawBonusDamageDetail]: damageDetailToObject(rawBonusDamageDetail) });
    }
  }

  // @ts-expect-error might be undefined
  damageRollHTML: HTMLElement | JQuery<HTMLElement> | string;

  _damageRollCount: number | undefined;
  get damageRollCount(): number {
    if (this._damageRollCount) return this._damageRollCount;
    if (this.itemCardUuid && SaveToChatCard) {
      this._damageRollCount = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.damageRollCount);
    }
    return this._damageRollCount ?? 0;
  }
  set damageRollCount(damageRollCount: number) {
    this._damageRollCount = damageRollCount;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.damageRollCount]: damageRollCount });
    }
  }
  _defaultDamageType: string | undefined;
  get defaultDamageType(): string {
    if (this._defaultDamageType) return this._defaultDamageType;
    if (this.itemCardUuid && SaveToChatCard) {
      this._defaultDamageType = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.defaultDamageType);
    }
    return this._defaultDamageType ?? "";
  }
  set defaultDamageType(defaultDamageType: string) {
    this._defaultDamageType = defaultDamageType;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.defaultDamageType]: defaultDamageType });
    }
  }

  _effectsAlreadyExpired: string[] | undefined = undefined;
  get effectsAlreadyExpired(): string[] {
    if (this._effectsAlreadyExpired) return this._effectsAlreadyExpired;
    if (this.itemCardUuid && SaveToChatCard) {
      this._effectsAlreadyExpired = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.effectsAlreadyExpired);
    }
    return this._effectsAlreadyExpired ?? [];
  }
  set effectsAlreadyExpired(effectsAlreadyExpired: string[]) {
    this._effectsAlreadyExpired = effectsAlreadyExpired;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.effectsAlreadyExpired]: effectsAlreadyExpired });
    }
  }
  // @ts-expect-error might be undefined
  noAutoDamage: boolean; // override damage roll for damage rolls

  _saves: Set<Token | TokenDocument> | undefined = undefined;
  get saves(): Set<Token | TokenDocument> {
    if (this._saves) return this._saves;
    const cardSaves = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.saves);
    if (cardSaves) {
      this._saves = new Set(cardSaves.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._saves
    }
    return new Set();
  }
  set saves(saves: Set<Token | TokenDocument>) {
    this._saves = saves;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(saves).map(t => getTokenDocument(t)).filter(t => t);
      const saveUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.saves]: saveUpdates });
    }
  }

  _superSavers: Set<Token | TokenDocument> | undefined = undefined;
  get superSavers(): Set<Token | TokenDocument> {
    if (this._superSavers) return this._superSavers;
    const cardSaves = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.superSavers);
    if (cardSaves) {
      this._superSavers = new Set(cardSaves.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._superSavers
    }
    return new Set();
  }
  set superSavers(superSavers: Set<Token | TokenDocument>) {
    this._superSavers = superSavers;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(superSavers).map(t => getTokenDocument(t)).filter(t => t);
      const saveUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.superSavers]: saveUpdates });
    }
  }
  _semiSuperSavers: Set<Token | TokenDocument> | undefined = undefined
  get semiSuperSavers(): Set<Token | TokenDocument> {
    if (this._semiSuperSavers) return this._semiSuperSavers;
    const cardSaves = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.semiSuperSavers);
    if (cardSaves) {
      this._semiSuperSavers = new Set(cardSaves.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._semiSuperSavers
    }
    return new Set();
  }
  set semiSuperSavers(semiSuperSavers: Set<Token | TokenDocument>) {
    this._semiSuperSavers = semiSuperSavers;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(semiSuperSavers).map(t => getTokenDocument(t)).filter(t => t);
      const saveUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.semiSuperSavers]: saveUpdates });
    }
  }
  _failedSaves: Set<Token | TokenDocument> | undefined = undefined;
  get failedSaves(): Set<Token | TokenDocument> {
    if (this._failedSaves) return this._failedSaves;
    const cardSaves = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.failedSaves);
    if (cardSaves) {
      this.failedSaves = new Set(cardSaves.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this.failedSaves
    }
    return new Set();
  }
  set failedSaves(failedSaves: Set<Token | TokenDocument>) {
    this._failedSaves = failedSaves;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(failedSaves).map(t => getTokenDocument(t)).filter(t => t);
      const saveUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.failedSaves]: saveUpdates });
    }
  }
  _fumbleSaves: Set<Token | TokenDocument> | undefined = undefined;
  get fumbleSaves(): Set<Token | TokenDocument> {
    if (this._fumbleSaves) return this._fumbleSaves;
    const cardSaves = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.fumbleSaves);
    if (cardSaves) {
      this._fumbleSaves = new Set(cardSaves.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._fumbleSaves
    }
    return new Set();
  }
  set fumbleSaves(fumbleSaves: Set<Token | TokenDocument>) {
    this._fumbleSaves = fumbleSaves;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(fumbleSaves).map(t => getTokenDocument(t)).filter(t => t);
      const saveUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.fumbleSaves]: saveUpdates });
    }
  }
  _criticalSaves: Set<Token | TokenDocument> | undefined = undefined;
  get criticalSaves(): Set<Token | TokenDocument> {
    if (this._criticalSaves) return this._criticalSaves;
    const cardSaves = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.criticalSaves);
    if (cardSaves) {
      this._criticalSaves = new Set(cardSaves.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._criticalSaves
    }
    return new Set();
  }
  set criticalSaves(criticalSaves: Set<Token | TokenDocument>) {
    this._criticalSaves = criticalSaves;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(criticalSaves).map(t => getTokenDocument(t)).filter(t => t);
      const saveUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.criticalSaves]: saveUpdates });
    }
  }
  _advantageSaves: Set<Token | TokenDocument> | undefined = undefined;
  get advantageSaves(): Set<Token | TokenDocument> {
    if (this._advantageSaves) return this._advantageSaves;
    const cardSaves = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.advantageSaves);
    if (cardSaves) {
      this._advantageSaves = new Set(cardSaves.map(uuid => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter(t => t));
      return this._advantageSaves
    }
    return new Set();
  }
  set advantageSaves(advantageSaves: Set<Token | TokenDocument>) {
    this._advantageSaves = advantageSaves;
    if (this.itemCardUuid && SaveToChatCard) {
      //@ts-expect-error parser can't work out that targetDocuments cant have undefined values
      const targetDocuments: TokenDocument[] = Array.from(advantageSaves).map(t => getTokenDocument(t)).filter(t => t);
      const saveUpdates = targetDocuments.map(t => t.uuid);
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.advantageSaves]: saveUpdates });
    }
  }
  saveRequests: any;
  saveTimeouts: any;

  _saveDisplayData: any | undefined = undefined;
  get saveDisplayData() {
    if (this._saveDisplayData) return this._saveDisplayData;
    if (this.itemCardUuid && SaveToChatCard) {
      // this._saveDisplayData = foundry.utils.getProperty(this.chatCard, "flags." + chatCardFlags.saveDisplayData);
    }
    return this._saveDisplayData;
  }
  set saveDisplayData(saveDisplayData) {
    this._saveDisplayData = saveDisplayData;
    if (this.itemCardUuid && SaveToChatCard) {
      // addUpdatesCacheFlags(this.id, { [chatCardFlags.saveDisplayData]: saveDisplayData });
      // This has lots of token details inside and I don't think it needs to be available.
    }
  }

  flagTags: {} | undefined;

  _onUseMacros: OnUseMacros | undefined = undefined;
  get onUseMacros(): OnUseMacros | undefined {
    if (this._onUseMacros) return this._onUseMacros;
    if (configSettings.allowUseMacro) {
      this._onUseMacros = new OnUseMacros();
      const itemOnUseMacros: OnUseMacros = foundry.utils.getProperty(this.item ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
      const actorOnUseMacros: OnUseMacros = foundry.utils.getProperty(this.actor ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
      if (this.workflowOptions?.onlyOnUseItemMacros) {
        this._onUseMacros.items = [...itemOnUseMacros.items];
        this.onUseMacros = this.onUseMacros
      } else {
        this._onUseMacros.items = [...itemOnUseMacros.items, ...actorOnUseMacros.items];
        this.onUseMacros = this.onUseMacros
      }
    }
    return this._onUseMacros;
  }
  set onUseMacros(onUseMacros: OnUseMacros | undefined) {
    this._onUseMacros = onUseMacros;
  }
  _ammunitionOnUseMacros: OnUseMacros | undefined;
  get ammunitionOnUseMacros(): OnUseMacros | undefined {
    if (this._ammunitionOnUseMacros) return this._ammunitionOnUseMacros;
    this._ammunitionOnUseMacros = new OnUseMacros();
    const ammunitionOnUseMacros: OnUseMacros = foundry.utils.getProperty(this.ammunition ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
    this._ammunitionOnUseMacros.items = ammunitionOnUseMacros.items;
    return this._ammunitionOnUseMacros;
  }
  set ammunitionOnUseMacros(ammunitionOnUseMacros: OnUseMacros | undefined) {
    this._ammunitionOnUseMacros = ammunitionOnUseMacros;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.ammunitionOnUseMacros]: ammunitionOnUseMacros });
    }
  }

  _attackAdvAttribution: Set<string> | undefined = undefined;
  get attackAdvAttribution(): Set<string> {
    if (this._attackAdvAttribution) return this._attackAdvAttribution;
    if (this.itemCardUuid && SaveToChatCard) {
      this._attackAdvAttribution = new Set(foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.attackAdvAttribution));
    }
    return this._attackAdvAttribution ?? new Set();
  }
  set attackAdvAttribution(attackAdvAttribution: Set<string>) {
    this._attackAdvAttribution = attackAdvAttribution;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.attackAdvAttribution]: Array.from(attackAdvAttribution) });
    }
  }

  _advReminderAttackAdvAttribution: Set<string> | undefined;
  get advReminderAttackAdvAttribution(): Set<string> {
    if (this._advReminderAttackAdvAttribution) return this._advReminderAttackAdvAttribution;
    if (this.itemCardUuid && SaveToChatCard) {
      this._advReminderAttackAdvAttribution = new Set(foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.advReminderAttackAdvAttribution));
    }
    return this._advReminderAttackAdvAttribution ?? new Set();
  }
  set advReminderAttackAdvAttribution(advReminderAttackAdvAttribution: Set<string>) {
    this._advReminderAttackAdvAttribution = advReminderAttackAdvAttribution;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.advReminderAttackAdvAttribution]: Array.from(advReminderAttackAdvAttribution) });
    }
  }

  _noOptionalRules: boolean | undefined;
  get noOptionalRules(): boolean {
    if (this._noOptionalRules) return this._noOptionalRules;
    if (this.itemCardUuid && SaveToChatCard) {
      this._noOptionalRules = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.noOptionalRules);
    }
    return this._noOptionalRules ?? false;
  }
  set noOptionalRules(noOptionalRules: boolean) {
    this._noOptionalRules = noOptionalRules;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.noOptionalRules]: noOptionalRules });
    }
  }
  undoData: any = undefined; // Way too big to store. Undos are blanked on reload

  get bonusDamageFlavor() {
    //@ts-expect-error
    return `(${this.bonusDamageRolls?.map(r => r.options.flavor ?? r.options.type)})`;
  }

  public get chatCard() {
    return getCachedDocument(this.itemCardUuid)
  }

  get itemCardId() {
    return this.chatCard?.id;
  }

  get damageFlavor() {
    if (this.activity.type === "heal") return i18n("midi-qol.BaseHealingFlavor");
    return i18n("midi-qol.BaseDamageFlavor");
    // See what the reception to a simple header is
    if (this.rawDamageDetail?.filter(d => d.damage !== 0).length === 0) return `(${allDamageTypes[this.defaultDamageType ?? "none"].label})`
    return `(${this.rawDamageDetail?.filter(d => d.damage !== 0).map(d => allDamageTypes[d.type].label || d.type)})`;
  }
  _randomItemId: string | undefined;
  get itemId(): string | undefined {
    if (this.item) return this.item.id;
    if (!this._randomItemId) this._randomItemId = foundry.utils.randomID();
    return this._randomItemId;
  }

  _needTemplate: boolean | undefined = undefined;
  get needTemplate(): boolean {
    if (this._needTemplate) return this._needTemplate;
    if (this.chatCard && SaveToChatCard) {
      this._needTemplate = foundry.utils.getProperty(this.chatCard, "flags." + WorkflowDataFlags.needTemplate);
    }
    return this._needTemplate ?? (activityHasAreaTarget(this.activity) && !activityHasAutoPlaceTemplate(this.activity));
  }
  set needTemplate(needTemplate: boolean) {
    this._needTemplate = needTemplate;
    if (this.itemCardUuid && SaveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.needTemplate]: needTemplate });
    }
  }

  get itemUuid(): string | undefined {
    return this.item?.uuid;
  }

  get otherDamageFlavor() {
    if (this.otherActivity?.type === "heal") return i18n("midi-qol.OtherHealIngFlavor");
    return i18n("midi-qol.OtherDamageFlavor");
  }

  get useCondition() {
    if (this.activity?.useCondition) return this.activity.useCondition;
    return foundry.utils.getProperty(this, `flags.${MODULE_ID}.itemCondition`);
  }

  get effectActivationCondition() {
    if (this.activity.effectCondition) return this.activity.effectCondition;
    return foundry.utils.getProperty(this, `flags.${MODULE_ID}.effectCondition`);
  }

  get hasSave(): boolean {
    return this.activity.save || this.activity.check || this.otherActivity?.save || this.otherActivity?.check;
  }

  get otherDamageFormula() {
    console.error("workflow.otherDamageFormula is deprecated without replacement.");
    return "";
  }

  get otherUseCondition() {
    if (this.otherActivity?.useCondition) return this.otherActivity?.useCondition;
    return foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.otherCondition`);
  }

  get otherEffectActivationCondition() {
    if (this.otherActivity?.effectCondition) return this.otherActivity?.effectCondition;
    return foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.otherCondition`);
  }

  get shouldRollDamage(): boolean {
    if (this.systemCard) return false;
    if (this.actor.type === configSettings.averageDamage || configSettings.averageDamage === "all") return true;
    const normalRoll = getAutoRollDamage(this) === "always"
      || (getAutoRollDamage(this) === "saveOnly" && this.activity.save && !this.activity.attack)
      || (getAutoRollDamage(this) !== "none" && (!this.activity.attack || configSettings.autoCheckHit === "none"))
      || (getAutoRollDamage(this) === "onHit" && (this.hitTargets.size > 0 || this.hitTargetsEC?.size > 0 || this.targets.size === 0))
      || (getAutoRollDamage(this) === "onHit" && (this.hitTargetsEC?.size > 0));
    return this.rollOptions?.rollToggle ? !normalRoll : normalRoll;
  }

  get spellLevel(): number {
    let spellLevel;
    if (this.chatCard && SaveToChatCard) spellLevel = foundry.utils.getProperty(this.chatCard, "flags.dnd5e.use.spellLevel")
    return spellLevel ?? this.item?.level ?? 0;
  }

  get workflowType() { return "BaseWorkflow" };

  setTargets(targets: Set<Token | TokenDocument>) {
    this.targets = new Set(targets);
    this.saves = new Set();
    this.failedSaves = new Set(this.targets)
    this.hitTargets = new Set();
    this.superSavers = new Set();
    this.semiSuperSavers = new Set();
    this.advantageSaves = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
    this.hitTargetsEC = new Set();
  }

  constructor(actor: any /* Actor5e*/, activity: any /* Item5e*/, speaker, targets, options: any = { chatCardUuid: undefined, storeWorkflow: true, item: undefined }) {
    if (options.chatCardUuid && SaveToChatCard) {
      this.itemCardUuid = options.chatCardUuid;
      this.id = options.chatCardUuid;
    } else {
      this.actor = actor;
      if (speaker.token) this.token = canvas?.tokens?.get(speaker.token);
      if (options.token) this.token = options.token;
      if (!this.token) {
        this.token = getOrCreateTokenForActor(this.actor);
      }
      if (targets && targets.size !== 0) this.targets = new Set(targets ? targets : []);
      this.item = activity?.item ?? options.item;
      this.activity = activity;
      this.speaker = speaker;
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      this.initSaveResults();
      this.attackTotal = -Infinity;
      this.isCritical = false;
      this.isFumble = false;
      this.currentAction = this.WorkflowState_NoAction;
      this.suspended = true;
      this.aborted = false;
      if (!this.activity || this instanceof DummyWorkflow) {
        this.id = foundry.utils.randomID();
        this.workflowName = `workflow ${this.id}`;
      } else {
        this.id = this.activity.uuid; // Temporary until the item card is created.
        const workflowName = options.workflowOptions?.workflowName ?? this.item?.name ?? "no item";
        this.workflowName = `${this.constructor.name} ${workflowName} ${foundry.utils.randomID()}`;
        if (options.storeWorkflow) Workflow.addWorkflow(this);
      }
      this.noOptionalRules = options?.noOptionalRules ?? !configSettings.optionalRulesEnabled;
      this.attackRollCount = 0;
      this.damageRollCount = 0;
      this.advantage = undefined;
      this.disadvantage = undefined;
      this.targetsCanSense = new Set();
      this.targetsCanSee = new Set();
      this.tokenCanSense = new Set();
      this.tokenCanSee = new Set();
      this.rawDamageDetail = [];
      this.rawOtherDamageDetail = [];
      this.effectsAlreadyExpired = [];
      this.workflowOptions = options?.workflowOptions ?? {};
      this.attackAdvAttribution = new Set();
      this.advReminderAttackAdvAttribution = new Set();
      this.extraRolls = [];
      const token: Token | undefined = canvas?.tokens?.get(speaker.tokenId);

      if (this.speaker.scene) this.speaker.scene = canvas?.scene?.id;
    }

    // this.spellLevel = item?.level || 0;

    this.event = options?.event;
    this.saveRequests = {};
    this.defenceRequests = {};
    this.saveTimeouts = {};
    this.defenceTimeouts = {}
    this.shouldRollOtherDamage = true;
    this.forceApplyEffects = false;
    this.placeTemplateHookId = null;
    this.onUseCalled = false;
    this.attackRolled = false;
    this.flagTags = undefined;
    if (options.rollOptions) this.rollOptions = options.rollOptions;
    else this.rollOptions = {};
    if (options.event) this.rollOptions.event = options.event;
    this.workflowOptions = foundry.utils.mergeObject(defaultRollOptions, {
      autoRollAttack: getAutoRollAttack(this),
      autoRollDamage: getAutoRollDamage(this),
      fastForwardAttack: isAutoFastAttack(this),
      fastForwardDamage: isAutoFastDamage(this)
    }, { inplace: false });
    if (options.workflowOptions)
      this.workflowOptions = foundry.utils.mergeObject(this.workflowOptions, options.workflowOptions, { overwrite: true });
    // For some hooks which rely on it....
    this.systemString = game.system?.id.toUpperCase();
    this.needsAttackAdvantageCheck = true;
    this.defaultDamageType = getActivityDefaultDamageType(this) ?? MQdefaultDamageType;
    if (this.activity?.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(this.defaultDamageType ?? "")) this.defaultDamageType = "healing";

    this.preSelectedTargets = canvas?.scene ? new Set(game.user?.targets) : new Set(); // record those targets targeted before cast.
    if (this.item && ["spell", "feat", "weapon"].includes(this.item.type)) {
      if (!this.item?.flags.midiProperties) {
        this.item.flags.midiProperties = {};
      }
    }
    if (this.needTemplate && options.noTemplateHook !== true) {
      if (debugEnabled > 0) warn("registering for preCreateMeasuredTemplate, createMeasuredTemplate")
      this.preCreateTemplateHookId = Hooks.once("preCreateMeasuredTemplate", this.setTemplateFlags.bind(this));
      this.placeTemplateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
    }
    if (this.activity instanceof MidiSummonActivity && configSettings.autoRemoveSummonedCreature) {
      this.postSummonHookId = Hooks.once("dnd5e.postSummon", (activity, profile, createdTokens, options) => {
        this.summonedCreatures = createdTokens;
      })
    }
    this.itemUseComplete = false;
    this.kickStart = false;
  }

  public someEventKeySet() {
    return this.event?.shiftKey || this.event?.altKey || this.event?.ctrlKey || this.event?.metaKey;
  }

  public someAutoRollEventKeySet() {
    return this.event?.altKey || this.event?.ctrlKey || this.event?.metaKey;
  }

  setTemplateFlags(templateDoc, data, context, user): boolean {
    if (debugEnabled > 0) warn("setTemplateFlags", templateDoc, this.item?.uuid, this.actor.uuid)
    if (this.item) templateDoc.updateSource({ "flags.midi-qol.itemUuid": this.item.uuid });
    if (this.actor) templateDoc.updateSource({ "flags.midi-qol.actorUuid": this.actor.uuid });
    if (this.activity) templateDoc.updateSource({ "flags.midi-qol.activityUuid": this.activity.uuid });
    templateDoc.updateSource({ "flags.midi-qol.workflowId": this.id });
    templateDoc.updateSource({ "flags.midi-qol.itemCardUuid": this.itemCardUuid });
    if (!foundry.utils.getProperty(templateDoc, "flags.dnd5e.origin")) templateDoc.updateSource({ "flags.dnd5e.origin": this.uuid });
    return true;
  }

  static async removeItemCardConfirmRollButton(itemCardUuid: string) {
    const chatMessage = getCachedDocument(itemCardUuid);
    let content = chatMessage?.content && foundry.utils.duplicate(chatMessage.content);
    if (!content) return;
    const confirmMissRe = /<button class="midi-qol-confirm-damage-roll-complete-miss" data-action="confirmDamageRollCompleteMiss">[^<]*?<\/button>/;
    content = content?.replace(confirmMissRe, "");
    const confirmRe = /<button class="midi-qol-confirm-damage-roll-complete" data-action="confirmDamageRollComplete">[^<]*?<\/button>/;
    content = content?.replace(confirmRe, "");
    const confirmHitRe = /<button class="midi-qol-confirm-damage-roll-complete-hit" data-action="confirmDamageRollCompleteHit">[^<]*?<\/button>/;
    content = content?.replace(confirmHitRe, "");
    const cancelRe = /<button class="midi-qol-confirm-damage-roll-cancel" data-action="confirmDamageRollCancel">[^<]*?<\/button>/;
    content = content?.replace(cancelRe, "");
    // TODO come back and make this cached.
    return debouncedUpdate(chatMessage, { content });
  }

  removeAllButtons(itemCardUuid: string) {
    const chatMessage = getCachedDocument(itemCardUuid);
    let content = chatMessage?.content && foundry.utils.duplicate(chatMessage.content);
    if (!content) return;
    const buttonRe = /<button\b[^>]*>(.*?)<\/button>/gi;
    content = content.replace(buttonRe, "");
    return this.performDebouncedUpdate(chatMessage, { content });
  }

  static async removeItemCardButtons(itemCardUuid: string | undefined, { removeAllButtons = false, removeAttackButtons = true, removeDamageButtons = false, removeDnD5eButtons = false, removeConfirmButtons = false, removeAllDnd5eButtons = false, removeDnd5eSaveButtons = false, removeDnd5eTemplateButtons = false } = {}) {
    try {
      const chatMessage = getCachedDocument(itemCardUuid);
      let content = chatMessage?.content && foundry.utils.duplicate(chatMessage.content);
      if (!content) return;
      if (removeAllButtons) {
        const buttonRe = /<button[\s\S]*?<\/button>/gi;
        content = content.replace(buttonRe, "");
        return debouncedUpdate(chatMessage, { content });
      } else {
        if (removeAttackButtons) {
          const attackRe = /<div class="midi-qol-attack-buttons[^"]*">[\s\S]*?<\/div>/;
          content = content?.replace(attackRe, "")
        }
        if (removeDamageButtons) {
          const damageRe = /<div class="midi-qol-damage-buttons[^"]*">[\s\S]*?<\/div>/
          const otherDamageRe = /<button class="midi-qol-otherDamage-button" data-action="rollDamage">[^<]*<\/button>/
          const formulaRe = /<button data-action="rollFormula">[^<]*<\/button>/
          content = content?.replace(damageRe, "")
          content = content?.replace(otherDamageRe, "")
          content = content?.replace(formulaRe, "")
        }
        if (removeAllDnd5eButtons) { // This is not correct
          const dnd5eRe = /<div class="midi-dnd5e-buttons">[\s\S]*?<div class="end-midi-dnd5e-buttons">/
          content = content?.replace(dnd5eRe, "<div class='midi-dnd5e-buttons'><\/div><div class='end-midi-dnd5e-buttons'>")
        } else {
          if (removeDnd5eSaveButtons) {
            const saveRe = /<button[\s\S].*?data-action="rollSave"[\s\S]*?<\/button>/
            for (let count = 0; count < 100; count++) {
              if (!content.match(saveRe)) break;
              content = content?.replace(saveRe, "")
            }
          }
          if (removeDnd5eTemplateButtons) {
            const templateRe = /<button[\s\S].*?data-action="placeTemplate"[\s\S]*?<\/button>/
            content = content?.replace(templateRe, "")
          }
        }
        if (removeConfirmButtons) {
          const confirmMissRe = /<button class="midi-qol-confirm-damage-roll-complete-miss" data-action="confirmDamageRollCompleteMiss">[^<]*?<\/button>/;
          content = content?.replace(confirmMissRe, "");
          const confirmRe = /<button class="midi-qol-confirm-damage-roll-complete" data-action="confirmDamageRollComplete">[^<]*?<\/button>/;
          content = content?.replace(confirmRe, "");
          const confirmHitRe = /<button class="midi-qol-confirm-damage-roll-complete-hit" data-action="confirmDamageRollCompleteHit">[^<]*?<\/button>/;
          content = content?.replace(confirmHitRe, "");
          const cancelRe = /<button class="midi-qol-confirm-damage-roll-cancel" data-action="confirmDamageRollCancel">[^<]*?<\/button>/;
          content = content?.replace(cancelRe, "");
        }
        // TODO work out what to do if we are a damage only workflow and betters rolls is active - display update wont work.

        // const otherAttackRe = /<button data-action="attack">[^<]*<\/button>/;

        // Come back and make this cached.
        await debouncedUpdate(chatMessage, { content });
      }
    } catch (err) {
      const message = `removeItemCardButtons`;
      TroubleShooter.recordError(err, message);
      throw err;
    }
  }

  static async removeWorkflow(id: string | undefined) {
    if (!id) {
      warn("removeWorkflow | No id");
      return;
    }
    const workflow = Workflow.getWorkflow(id);
    console.warn(`removeWorkflow deleting ${id}`, Workflow._workflows[id]); // TODO remove
    if (!workflow) {
      if (debugEnabled > 0) warn("removeWorkflow | No such workflow ", id);
      return;
    }
    // This can lay around if the template was never placed.
    if (workflow.placeTemplateHookId) {
      Hooks.off("createMeasuredTemplate", workflow.placeTemplateHookId)
      Hooks.off("preCreateMeasuredTemplate", workflow.preCreateTemplateHookId);
    }
    if (workflow.postSummonHookId) Hooks.off("dnd5e.postSummon", workflow.postSummonHookId);
    if (debugEnabled > 0) warn(`removeWorkflow deleting ${id}`, Workflow._workflows[id]);
    Workflow._workflows.delete(id);
    // Remove buttons
    if (workflow.itemCardUuid) {
      if (workflow.currentAction === workflow.WorkflowState_ConfirmRoll) {
        const itemCard = workflow.chatCard;
        if (itemCard) await itemCard.delete();
        clearUpdatesCache(workflow.itemCardUuid);
      } else {
        await Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        // await Workflow.removeItemCardConfirmRollButton(workflow.itemCardUuid);
        // await workflow.removeEffectsButton();
        setTimeout(() => {
          const chatMessageElt = document?.querySelector(`[data-message-id="${workflow.itemCardId ?? "XXX"}"]`);
          if (chatMessageElt) chatMessageElt?.querySelectorAll(".collapsible").forEach(ce => { if (!ce.classList.contains("collapsed")) ce.classList.add("collapsed") });
        }, 1)
      }
    }
  }

  public static get stateTable(): ({ name: string, value: WorkflowState } | {}) {
    const table = {};
    Reflect.ownKeys(this.prototype).filter(k => k.toString().startsWith("WorkflowState_")).forEach(k => table[k.toString()] = this.prototype[k.toString()]);
    return table;
  }

  public static get stateHooks(): any {
    const hooks: any = {};
    for (let key of Object.keys(this.stateTable)) {
      const name = this.nameForState(this.stateTable[key]);
      hooks[`pre${name}`] = `before ${name} (S*)`;
      hooks[`post${name}`] = `after ${name} (S*)`;
    }
    return hooks;
  }
  public static get allHooks(): any {
    const allHooks = foundry.utils.mergeObject(geti18nOptions("onUseMacroOptions"), this.stateHooks);
    return allHooks;
  }

  public static get allMacroPasses(): any {
    return this.allHooks;
  }

  async callHooksForAction(prePost: ("pre" | "post"), action: WorkflowState): Promise<boolean | undefined> {
    if (!action) {
      console.warn("midi-qol | callPreHooksForAction | No action");
      return true;
    }
    if (debugEnabled > 1) log(`callHooksForAction | ${prePost} ${this.nameForState(action)}`)
    let hookName = `midi-qol.${prePost}${this.nameForState(action)}`
    if (await asyncHooksCall(hookName, this) === false) return false;
    if (this.item && await asyncHooksCall(`${hookName}.${this.item.uuid}`, this) === false) return false;
    if (this.activity && await asyncHooksCall(`${hookName}.${this.activity.uuid}`, this) === false) return false;
    if (await asyncHooksCall(`${hookName}.${this.id}`, this) === false) return false;
    hookName = `midi-qol.premades.${prePost}${this.nameForState(action)}`
    if (await asyncHooksCall(hookName, this) === false) return false;
    if (this.item && await asyncHooksCall(`${hookName}.${this.item.uuid}`, this) === false) return false;
    if (this.activity && await asyncHooksCall(`${hookName}.${this.activity.uuid}`, this) === false) return false;
    if (await asyncHooksCall(`${hookName}.${this.id}`, this) === false) return false;

    return true;
  }
  async callOnUseMacrosForAction(prePost: ("pre" | "post"), action: WorkflowState): Promise<(damageBonusMacroResult | boolean | undefined)[]> {
    if (!configSettings.allowUseMacro || this.workflowOptions.noOnUseMacro === true) {
      warn(`Calling ${prePost}${this.nameForState(action)} disabled due to macro call settings`);
      return [];
    }
    if (!action) {
      console.warn("midi-qol | callOnUseMacrosForAction | No action");
      return [];
    }
    if (debugEnabled > 1) log(`callOnUseMacrosForAction | ${prePost} ${this.nameForState(action)}`)
    const macroPass = `${prePost}${this.nameForState(action)}`;

    if (this.ammunition) await this.callMacros(this.item, this.ammunitionOnUseMacros?.getMacros(macroPass), "OnUse", macroPass);
    if (debugEnabled > 1) log(`callOnUseMacrosForAction | ${this.onUseMacros?.getMacros(macroPass)}`)
    return this.callMacros(this.item, this.onUseMacros?.getMacros(macroPass), "OnUse", macroPass);

  };

  public static nameForState(state: WorkflowState | undefined): string {
    if (state === undefined) return "undefined";
    return state?.name.replace(/^WorkflowState_/, "") ?? state.name;
  }

  public nameForState(state: WorkflowState | undefined): string {
    return Workflow.nameForState(state);
  }

  /**
   * 
   * @param context context to be passed to the state call. Typically the data that caused the an unsuspend to fire, but can be others
   * Trigger execution of the current state with the context that triggered the unsuspend. e.g. attackRoll or damageRoll
   */
  public async unSuspend(context: any = {}) {
    if (context.templateDocument) {
      context.templateUuid = context.templateDocument.uuid;
      this.templateUuid = context.templateDocument?.uuid;
      // this.template = context.templateDocument;
      this.needTemplate = false;
      if (!this.needItemCard) context.itemUseComplete = true;
      if (debugEnabled > 0) warn(`${this.workflowName} unsuspend with template ${this.templateUuid}`, this.suspended, context.templateDocument.flags, this.nameForState(this.currentAction));
    }
    if (context.itemCardUuid) {
      this.itemCardUuid = context.itemCardUuid;

    }
    if (context.itemUseComplete) this.itemUseComplete = true;

    // Currently this just brings the workflow to life.
    // next version it will record the contexts in the workflow and bring the workflow to life.
    if (this.suspended) {
      this.suspended = false;
      // Need to record each of the possible things
      // attackRoll
      // damageRoll
      this.performState(this.currentAction, context);
    }
  }

  /**
   * 
   * @param newState the state to execute
   * @param context context to be passed to the state call. Typically the data that caused the an unsuspend to fire, but can be others
   * Continues to execute states until suspended, aborted or the state transition count is exceeded.
   */

  public async performState(newState: (() => Promise<WorkflowState>) | undefined, context: any = {}) {
    if (this.stateTransitionCount === undefined) this.stateTransitionCount = 0;
    const MaxTransitionCount = 250;
    let isAborting = this.aborted;

    try {
      while (this.stateTransitionCount < (this.MaxTransitionCount ?? MaxTransitionCount)) {
        const currentName = this.nameForState(this.currentAction);
        this.suspended = false;
        this.stateTransitionCount += 1;
        isAborting ||= this.aborted || (newState === this.WorkflowState_Abort);
        if (newState === undefined) {
          const message = `${this.workflowName} Perform state called with undefined action - previous state was ${this.nameForState(this.currentAction)}`
          error(message);
          TroubleShooter.recordError(new Error(message), message);
          this.suspended = true;
          break;
        }
        const name = this.nameForState(newState);
        await busyWait(0.01);
        if (this.currentAction !== newState) {
          if (!isAborting || this.currentAction === this.WorkflowState_Completed) {
            await this.callOnUseMacrosForAction("post", this.currentAction);
            if (await this.callHooksForAction("post", this.currentAction) === false && !isAborting) {
              console.warn(`${this.workflowName}${this.id} ${currentName} -> ${name} aborted by post ${this.nameForState(this.currentAction)} Hook`)
              newState = this.aborted ? this.WorkflowState_Abort : this.WorkflowState_RollFinished;
            }
            if (debugEnabled > 0) warn(`${this.workflowName} ${this.id} finished ${currentName}`);
            if (debugEnabled > 0) warn(`${this.workflowName} ${this.id} transition ${this.nameForState(this.currentAction)} -> ${name}`);

            if (!isAborting && this.aborted) {
              console.warn(`${this.workflowName} ${this.id} ${currentName} -> ${name} aborted by pre ${this.nameForState(this.currentAction)} macro pass`)
              newState = this.WorkflowState_Abort;
              continue;
            }
          }
          await this.callOnUseMacrosForAction("pre", newState);
          if (await this.callHooksForAction("pre", newState) === false && !isAborting) {
            console.warn(`${this.workflowName} ${this.id} ${currentName} -> ${name} aborted by pre ${this.nameForState(newState)} Hook`)
            newState = this.aborted ? this.WorkflowState_Abort : this.WorkflowState_RollFinished;
            continue;
          }
          if (this.aborted && !isAborting) {
            console.warn(`${this.workflowName} ${currentName} ${this.id} -> ${name} aborted by pre ${this.nameForState(newState)} macro pass`)
            newState = this.WorkflowState_Abort;
            continue;
          }
          this.currentAction = newState;
        }
        let nextState = await this.currentAction.bind(this)(context);

        if (nextState === this.WorkflowState_Suspend) {
          this.suspended = true;
          // this.currentAction = this.WorkflowState_Suspend;
          if (debugEnabled > 0) warn(`${this.workflowName} ${this.nameForState(this.currentAction)} -> suspended Workflow ${this.id}`);
          await this.performDebouncedUpdate(this.chatCard, { ["flags." + WorkflowDataFlags.suspended]: true });
          break;
        }
        newState = nextState;
        context = {};
      }

      if (this.stateTransitionCount >= (this.MaxTransitionCount ?? MaxTransitionCount)) {
        const message = `performState | ${this.workflowName} Workflow ${this.id} exceeded ${this.maxTransitionCount ?? MaxTransitionCount} iterations`;
        error(message);
        TroubleShooter.recordError(new Error(message), message);
      }
    } catch (err) {
      const message = `performState | ${this.workflowName} Workflow ${this.id}`;
      error(message, err);
      TroubleShooter.recordError(err, message);
    }
  }

  async WorkflowState_Suspend(context: any = {}): Promise<WorkflowState> {
    const message = `${this.workflowName} Workflow ${this.id} suspend should never be called`;
    error(message);
    TroubleShooter.recordError(new Error(message), message);
    return undefined;
  }

  async WorkflowState_NoAction(context: any = {}): Promise<WorkflowState> {
    if (debugEnabled > 0) warn("WorkflowState_NoAction", context);
    if (context.itemUseComplete) return this.WorkflowState_Start;
    return this.WorkflowState_Suspend;
  }

  async WorkflowState_Start(context: any = {}): Promise<WorkflowState> {
    this.selfTargeted = false;
    this.workflowStartTime = Date.now();
    if (this.targets.size === 0 && this.activity?.target?.affects.type === "self") {
      this.targets = await getOrCreateTokenForActorAsSet(this.actor);
      this.hitTargets = new Set();
      this.failedSaves = new Set(this.targets);
      this.selfTargeted = true;
    }
    this.rangeTargeting = activityHasEmanationNoTemplate(this.activity);
    if (this.rangeTargeting) {
      // Targets have already been set in activity.use
      return this.WorkflowState_AoETargetConfirmation;
    }

    this.tempTargetConfirmation = getActivityAutoTargetAction(this.activity) !== "none" && activityHasAreaTarget(this.activity);
    if (debugEnabled > 1) debug("WORKFLOW NONE", getActivityAutoTargetAction(this.activity), activityHasAreaTarget(this.activity));
    if (this.tempTargetConfirmation) {
      return this.WorkflowState_AwaitTemplate;
    }

    return this.WorkflowState_AoETargetConfirmation;
  }
  async WorkflowState_AwaitItemCard(context: any = {}): Promise<WorkflowState> {
    if (this.needItemCard || !this.itemUseComplete) {
      if (debugEnabled > 0) warn("WorkflowState_AwaitItemCard suspending because needItemCard/itemUseComplete", this.needItemCard, this.itemUseComplete);
      return this.WorkflowState_Suspend;
    }
    if (this.needTemplate) {
      if (debugEnabled > 0) warn("WorkflowState_AwaitItemCard  needTemplate -> await template");
      return this.WorkflowState_AwaitTemplate;
    }
    if (debugEnabled > 0) warn("WorkflowState_AwaitItemCard  -> TemplatePlaced");
    return this.WorkflowState_TemplatePlaced;
  }
  async WorkflowState_AwaitTemplate(context: any = {}): Promise<WorkflowState> {
    if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate started");
    if (context.templateUuid || this.templateUuid) {
      this.needTemplate = false;
      if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate context - template placed", "needTemplate", this.needTemplate, "needItemCard", this.needItemCard, "itemUseComplete", this.itemUseComplete);
      return this.WorkflowState_TemplatePlaced;
    }
    if (context.itemUseComplete || !this.needTemplate) {
      if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate context itemUseComplete", "needTemplate", this.needTemplate, "needItemCard", this.needItemCard, "itemUseComplete", this.itemUseComplete);
      return this.WorkflowState_AoETargetConfirmation;
    }
    if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate suspending", "needTemplate", this.needTemplate, "needItemCard", this.needItemCard, "itemUseComplete", this.itemUseComplete);
    return this.WorkflowState_Suspend;
  }
  async WorkflowState_TemplatePlaced(context: any = {}): Promise<WorkflowState> {
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
    }

    // Some modules stop being able to get the item card id.
    if (!this.itemCardUuid) return this.WorkflowState_AoETargetConfirmation;

    const chatMessage = this.chatCard;
    if (!chatMessage?.content) return this.WorkflowState_AoETargetConfirmation;
    // remove the place template button from the chat card.
    this.targets = validTargetTokens(this.targets);
    this.hitTargets = new Set()
    this.hitTargetsEC = new Set();
    let content = chatMessage && foundry.utils.duplicate(chatMessage.content)
    let buttonRe = /<button.*?data-action="placeTemplate"[^>]*?>[\s\S]*?<\/button>/
    content = content?.replace(buttonRe, "");
    await this.performDebouncedUpdate(chatMessage, { content, "flags.midi-qol.type": MESSAGE_TYPES.ITEM, style: CONST.CHAT_MESSAGE_STYLES.OTHER });
    return this.WorkflowState_AoETargetConfirmation;
  }
  async WorkflowState_AoETargetConfirmation(context: any = {}): Promise<WorkflowState> {
    const hasAoETemplate = activityHasAreaTarget(this.activity);
    const emanationNoTemplate = activityHasEmanationNoTemplate(this.activity);
    if ((hasAoETemplate || emanationNoTemplate) && this.workflowOptions.targetConfirmation !== "none") {
      if (!await postTemplateConfirmTargets(this.activity, { workflowOptions: this.workflowOptions }, this)) {
        return this.WorkflowState_Abort;
      }
    }
    return this.WorkflowState_ValidateRoll;
  }
  async WorkflowState_ValidateRoll(context: any = {}): Promise<WorkflowState> {
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) {
      await this.triggerTargetMacros(["isTargeted"]);
      if (this.aborted) return this.WorkflowState_Abort;
    }

    // do pre roll checks
    if (checkMechanic("checkRange") !== "none" && (!this.AoO || ["rwak", "rsak", "rpak"].includes(this.activity?.actionType)) && this.tokenUuid) {
      const { result, attackingToken, range, longRange } = checkActivityRange(this.activity, getToken(this.token) ?? "invalid", this.targets);
      switch (result) {
        case "fail": return this.WorkflowState_RollFinished;
        case "dis": this.disadvantage = true;
          this.attackAdvAttribution.add("DIS:range");
          this.advReminderAttackAdvAttribution.add("DIS:Long Range");
      }
      if (attackingToken && this.token !== attackingToken) {
        // changed the attacking token so update the canSee data
        this.token = attackingToken;
        await this.activity.setupCanSeeSense({ workflow: this });
      }
    }
    if (!this.workflowOptions.allowIncapacitated && checkMechanic("incapacitated") !== "nothing" && checkIncapacitated(this.actor, debugEnabled > 0, true)) {
      if (checkMechanic("incapacitated") === "enforce") return this.WorkflowState_RollFinished;
    }
    return this.WorkflowState_PreambleComplete;
  }
  async WorkflowState_PreambleComplete(context: any = {}): Promise<WorkflowState> {
    if (configSettings.undoWorkflow) await saveTargetsUndoData(this);
    this.effectsAlreadyExpired = [];

    const tokensToCheck: Set<Token | TokenDocument> = this.targets.size > 0 ? this.targets : this.token ? new Set([this.token]) : new Set();
    for (let token of tokensToCheck) {
      for (let theItem of [this.item, this.ammunition]) {
        if (!theItem) continue;
        const activationCondition = foundry.utils.getProperty(theItem, `flags.${MODULE_ID}.itemCondition`);
        if (activationCondition) {
          if (!(await evalActivationCondition(this, activationCondition, token, { async: true }))) {
            ui.notifications?.warn(`midi-qol | Activation condition ${activationCondition} failed roll cancelled`)
            return this.WorkflowState_Cancel;
          }
        }
      }
    }
    if (await asyncHooksCall("midi-qol.targetingComplete", this) === false) {
      ui.notifications?.warn(`midi-qol | Targeting complete hook cancelled roll`);
      return this.WorkflowState_Abort;
    };
    if (!getAutoRollAttack(this) && this.activity?.attack) {
      // Not auto rolling so display targets
      const rollMode = safeGetGameSetting("core", "rollMode");
      this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === CONST.DICE_ROLL_MODES.BLIND || rollMode === CONST.DICE_ROLL_MODES.PRIVATE;
      if (this.activity.target?.affects?.type !== "self") {
        await this.displayHitTargets(this.whisperAttackCard);
      }
    }
    return this.WorkflowState_WaitForAttackRoll;
  }
  async WorkflowState_WaitForAttackRoll(context: any = {}): Promise<WorkflowState> {
    if (context.attackRoll) {
      if (this.abort) return this.WorkflowState_Abort;
      return this.WorkflowState_AttackRollComplete;
    }
    if (!this.activity.attack) {
      this.hitTargets = new Set(this.targets);
      this.hitTargetsEC = new Set();
      if (this.activity.roll?.formula) return this.WorkflowState_WaitForUtilityRoll;
      return this.WorkflowState_WaitForDamageRoll;
    }

    const isFastRoll = this.rollOptions.fastForwardAttack ?? this.workflowOptions.fastForwardAttack ?? isAutoFastAttack(this);
    this.rollOptions.fastForwardAttack ||= isFastRoll;
    const autoRollAttack = this.rollOptions.autoRollAttack ?? getAutoRollAttack(this);
    if (!autoRollAttack) {
      // Not auto rolling attack so setup the buttons to display advantage/disadvantage
      const chatMessage = this.chatCard;
      let content = chatMessage?.content && foundry.utils.duplicate(chatMessage.content)
      if (content && (!autoRollAttack || !isFastRoll)) {
        // provide a hint as to the type of roll expected.
        let content = chatMessage && foundry.utils.duplicate(chatMessage.content)
        let searchRe = /<button data-action="attack">[^<]+<\/button>/;
        searchRe = /<div class="midi-attack-buttons".*<\/div>/;

        const hasAdvantage = this.advantage && !this.disadvantage;
        const hasDisadvantage = this.disadvantage && !this.advantage;
        let attackString = hasAdvantage ? i18n(`${this.systemString}.Advantage`) : hasDisadvantage ? i18n(`${this.systemString}.Disadvantage`) : i18n(`${this.systemString}.Attack`)
        if (isFastRoll && configSettings.showFastForward) attackString += ` ${i18n("midi-qol.fastForward")}`;
        let replaceString = `<button data-action="attack">${attackString}</button>`
        content = content.replace(searchRe, replaceString);
        await this.performDebouncedUpdate(chatMessage, { content });
      } else if (!chatMessage) {
        const message = `WaitForAttackRoll | no chat message`;
        error(message);
        TroubleShooter.recordError(new Error(message), message);
      }
    }

    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
    }
    if (this.activity.roll?.formula) return this.WorkflowState_WaitForUtilityRoll;
    if (autoRollAttack) {
      this.rollOptions.fastForwardAttack ||= isFastRoll;
      this.activity.rollAttack({ event: this.event, workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, {});
    }
    return this.WorkflowState_Suspend;
  }

  async WorkflowState_AttackRollComplete(context: any = {}): Promise<WorkflowState> {
    const attackRollCompleteStartTime = Date.now();
    const attackBonusMacro = foundry.utils.getProperty(this.actor.flags, `${game.system?.id}.AttackBonusMacro`);
    if (configSettings.allowUseMacro && attackBonusMacro && this.workflowOptions.noOnUseMacro !== true) {
      // dnd3 await this.rollAttackBonus(attackBonusMacro);
    }
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["isAttacked"]);
    await this.processAttackRoll();
    // REFACTOR look at splitting this into a couple of states
    await asyncHooksCallAll("midi-qol.preCheckHits", this);
    if (this.item) await asyncHooksCallAll(`midi-qol.preCheckHits.${this.item.uuid}`, this);
    if (this.activity) await asyncHooksCallAll(`midi-qol.preCheckHits.${this.activity.uuid}`, this);
    if (this.aborted) return this.WorkflowState_Abort;

    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
    }

    await this.processAttackRoll();
    this.needsAttackAdvantageCheck = true;

    if (configSettings.autoCheckHit !== "none") {
      await this.displayAttackRoll({ GMOnlyAttackRoll: true });
      await this.checkHits();
      await this.displayAttackRoll();

      const rollMode = safeGetGameSetting("core", "rollMode");
      this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === CONST.DICE_ROLL_MODES.BLIND || rollMode === CONST.DICE_ROLL_MODES.PRIVATE;
      await asyncHooksCallAll("midi-qol.hitsChecked", this);
      if (this.item)
        await asyncHooksCallAll(`midi-qol.hitsChecked.${this.item?.uuid}`, this);
      if (this.activity)
        await asyncHooksCallAll(`midi-qol.hitsChecked.${this.activity?.uuid}`, this);
      if (this.aborted)
        return this.WorkflowState_Abort;
      await this.displayHits(this.whisperAttackCard);
    } else {
      await this.displayAttackRoll();
    }
    if (checkRule("removeHiddenInvis")) await removeHidden.bind(this)();
    if (checkRule("removeHiddenInvis")) await removeInvisible.bind(this)();
    /*
    const attackExpiries = [
      "isAttacked"
    ];
    await this.expireTargetEffects(attackExpiries);
    */

    await asyncHooksCallAll("midi-qol.AttackRollComplete", this);
    if (this.item) await asyncHooksCallAll(`midi-qol.AttackRollComplete.${this.id}`, this);
    if (this.aborted) return this.WorkflowState_Abort;

    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
      if (this.aborted) return this.WorkflowState_Abort;
    }

    if (configSettings.autoCheckHit === "none") {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      return this.WorkflowState_WaitForDamageRoll;
    }
    if (getAutoRollDamage(this) === "always") return this.WorkflowState_WaitForDamageRoll;
    const noHits = this.hitTargets.size === 0 && this.hitTargetsEC.size === 0;
    const allMissed = noHits && this.targets.size !== 0;
    if (allMissed) {
      if (configSettings.confirmAttackDamage !== "none" && !this.workflowOptions.forceCompletion)
        return this.WorkflowState_ConfirmRoll;
      if (this.workflowOptions.forceCompletion || configSettings.autoCompleteWorkflow) {
        expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
        await this.expireTargetEffects(["isAttacked"]);
        return this.WorkflowState_RollFinished;
      }
      // if (configSettings.autoRollDamage !== "always") return this.WorkflowState_RollFinished;
      // else return this.WorkflowState_WaitForDamageRoll;
    }

    return this.WorkflowState_WaitForDamageRoll;
  }

  _formatAttackTargets() {
    const targets = new Map();
    for (const token of this.targets) {
      const { name } = token;
      const { img, system, uuid } = token.actor ?? {};
      // @ts-expect-error no dnd5e-types
      const ac = system?.attributes?.ac ?? {};
      if (uuid && Number.isNumeric(ac.value)) targets.set(uuid, { name, img, uuid, ac: ac.value });
    }
    return Array.from(targets.values());
  }

  async WorkflowState_WaitForDamageRoll(context: any = {}): Promise<WorkflowState> {
    if (context.damageRoll || context.otherDamageRoll) {
      // record the data - currently done in item handling
      return this.WorkflowState_ConfirmRoll;
    }
    const hasDamageRoll = this.activity.hasDamage || this.otherActivity?.hasDamage || this.activity.hasHealing || this.otherActivity?.hasHealing;
    if (!hasDamageRoll) return this.WorkflowState_WaitForSaves;
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    if (debugEnabled > 1) debug(`wait for damage roll has damage roll ${hasDamageRoll} isFumble ${this.isFumble} no auto damage ${this.noAutoDamage}`);

    if (checkMechanic("actionSpecialDurationImmediate"))
      expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);
    if (checkMechanic("actionSpecialDurationImmediate") && this.hitTargets.size)
      expireMyEffects.bind(this)(["1Hit"]);
    if (checkMechanic("actionSpecialDurationImmediate")) {
      expireMyEffects.bind(this)(["1Critical", "1Fumble"])
    }

    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageRoll"), "OnUse", "preDamageRoll");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preDamageRoll"), "OnUse", "preDamageRoll");
    }

    // if (this.noAutoDamage) return; // we are emulating the standard card specially.

    if (this.shouldRollDamage) {
      if (debugEnabled > 0) warn("waitForDamageRoll | rolling damage ", this.event, configSettings.autoRollAttack, configSettings.autoFastForward)
      const storedData: any = this.chatCard?.getFlag(game.system?.id, "item.data");
      if (storedData) { // If magic items is being used it fiddles the roll to include the item data
        this.item = new CONFIG.Item.documentClass(storedData, { parent: this.actor })
      }

      this.rollOptions.spellLevel = this.spellLevel;
      this.rollOptions.isCritical = this.isCritical;
      this.rollOptions.isFumble = this.isFumble;
      this.rollOptions.fastForwardDamage = isAutoFastDamage(this);
      this.activity.rollDamage({ workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, { create: false });
      return this.WorkflowState_Suspend;
    } else {
      const chatMessage = this.chatCard;
      if (chatMessage?.content) {
        // provide a hint as to the type of roll expected.
        let content = chatMessage && foundry.utils.duplicate(chatMessage.content)
        let searchRe = /<button data-action="damage">[^<]+<\/button>/;
        const damageTypeString = (this.activity?.actionType === "heal") ? i18n(`${this.systemString}.Healing`) : i18n(`${this.systemString}.Damage`);
        let damageString = (this.rollOptions.isCritical || this.isCritical) ? i18n(`${this.systemString}.Critical`) : damageTypeString;
        if (this.rollOptions.fastForwardDamage && configSettings.showFastForward) damageString += ` ${i18n("midi-qol.fastForward")}`;
        let replaceString = `<button data-action="damage">${damageString}</button>`
        content = content.replace(searchRe, replaceString);
        await this.performDebouncedUpdate(chatMessage, { content });
        setTimeout(() => {
          //@ts-expect-error protected
          ui.chat?.scrollBottom();
        }, 100);
      }
    }
    return this.WorkflowState_Suspend; // wait for a damage roll to advance the state.
  }
  async WorkflowState_ConfirmRoll(context: any = {}): Promise<WorkflowState> {
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    if (configSettings.confirmAttackDamage !== "none" && (this.activity.attack || this.activity.damage)) {
      await this.displayDamageRolls();
      return this.WorkflowState_Suspend; // wait for the confirm button
    }
    return this.WorkflowState_DamageRollStarted;
  }
  async WorkflowState_RollConfirmed(context: any = {}): Promise<WorkflowState> {
    expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
    await this.expireTargetEffects(["isAttacked"]);
    return this.WorkflowState_DamageRollStarted;
  }
  async WorkflowState_DamageRollStarted(context: any = {}): Promise<WorkflowState> {
    if (this.itemCardUuid) {
      await Workflow.removeItemCardButtons(this.itemCardUuid, { removeAllButtons: false, removeAttackButtons: getRemoveAttackButtons(this.item), removeDamageButtons: getRemoveDamageButtons(this.item), removeConfirmButtons: true });
    }
    if (getActivityAutoTargetAction(this.activity) === "none" && activityHasAreaTarget(this.activity) && !this.activity.attack) {
      // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
      this.targets = validTargetTokens(game.user?.targets);
      this.hitTargets = validTargetTokens(game.user?.targets);
      this.hitTargetsEC = new Set();
      if (debugEnabled > 0) warn("damageRollStarted | for non auto target area effects spells", this)
    }
    const damageBonusMacros = this.getDamageBonusMacros();
    if (damageBonusMacros) { //  && this.workflowType === "Workflow") { // TODO check this
      await this.rollBonusDamage(damageBonusMacros);
    }
    return this.WorkflowState_DamageRollComplete;
  }
  async WorkflowState_DamageRollComplete(context: any = {}): Promise<WorkflowState> {
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) { //
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
    }

    if (this.damageRolls)
      this.rawDamageDetail = createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    else this.rawDamageDetail = [];
    if (this.otherDamageRolls) {
      this.rawOtherDamageDetail = createDamageDetailV4({ roll: this.otherDamageRolls, activity: null, defaultType: this.defaultDamageType });
    } else this.rawOtherDamageDetail = [];
    if (this.bonusDamageRolls)
      this.rawBonusDamageDetail = createDamageDetailV4({ roll: this.bonusDamageRolls, activity: null, defaultType: this.defaultDamageType });
    else this.rawBonusDamageDetail = [];
    await asyncHooksCallAll("midi-qol.DamageRollComplete", this);
    if (this.item) await asyncHooksCallAll(`midi-qol.DamageRollComplete.${this.item.uuid}`, this);
    if (this.aborted) return this.WorkflowState_Abort;
    if (this.hitTargets?.size || this.hitTargetsEC?.size) expireMyEffects.bind(this)(["1Hit"]);

    expireMyEffects.bind(this)(["1Action", "1Attack", "1Spell", "1Critical", "1Fumble"]);
    await this.expireTargetEffects(["isAttacked"]);
    await this.displayDamageRolls();
    if (this.isFumble) {
      this.failedSaves = new Set();
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      return this.WorkflowState_ApplyDynamicEffects;
    }
    return this.WorkflowState_WaitForSaves;
  }

  async WorkflowState_WaitForUtilityRoll(context: any = {}): Promise<WorkflowState> {
    if (!this.activity.roll?.formula || context.utilityRolls) return this.WorkflowState_UtilityRollComplete;
    if (getAutoRollDamage(this) !== "none") {
      const rolls = await this.activity.rollFormula({ event: this.event, workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, { create: false });
      if (!rolls || this.abort) {
        return this.WorkflowState_Abort;
      }
      return this.WorkflowState_UtilityRollComplete;
    }
    return this.WorkflowState_Suspend;
  }

  async WorkflowState_UtilityRollComplete(context: any = {}): Promise<WorkflowState> {
    if (this.itemCardUuid && this.utilityRolls) {
      this.displayUtilityRolls();
    }
    return this.WorkflowState_WaitForDamageRoll;
  }
  async WorkflowState_DamageRollCompleteCancelled(context: any = {}): Promise<WorkflowState> {
    if (configSettings.undoWorkflow) {

    }
    return this.WorkflowState_Suspend;
  }
  async WorkflowState_WaitForSaves(context: any = {}): Promise<WorkflowState> {
    // TODO remove this afet CPR change
    if (this.damageRolls) this.rawDamageDetail = createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    if (configSettings.allowUseMacro) {
      if (this.workflowOptions.noOnUseMacro !== true) await this.callMacros(this.item, this.onUseMacros?.getMacros("preSave"), "OnUse", "preSave");
      if (this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["isAboutToSave"]); // ??
      if (this.ammunition && this.workflowOptions.noOnUseMacro !== true) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preSave"), "OnUse", "preSave");
    }
    if (this.workflowType === "BaseWorkflow" && !this.workflowOptions.ignoreUserTargets && !this.activity?.attack && this.activity?.target?.affects.type !== "self") { // Allow editing of targets if there is no attack that has already been processed.
      this.targets = new Set(game.user?.targets);
      this.hitTargets = new Set(this.targets);
    }
    this.failedSaves = new Set(this.hitTargets);
    if (!this.hasSave) {
      return this.WorkflowState_SavesComplete;
    }
    await this.displaySaveTargets();
    this.initSaveResults();
    if (configSettings.autoCheckSaves !== "none") {
      await asyncHooksCallAll("midi-qol.preCheckSaves", this);
      if (this.item) await asyncHooksCallAll(`midi-qol.preCheckSaves.${this.item?.uuid}`, this);
      if (this.aborted) return this.WorkflowState_Abort;
      if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessage"]?.length)
      // setup to process saving throws as generated
      let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
      // let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
      let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
      try {
        const saveDisplay = (this.activity?.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity?.saveDisplay;
        await this.checkSaves(saveDisplay !== "allShow");
      } catch (err) {
        const message = ("midi-qol | checkSaves error")
        TroubleShooter.recordError(err, message);
        error(message, err)
      } finally {
        Hooks.off("renderChatMessage", hookId);
        // Hooks.off("renderChatMessage", brHookId);
        Hooks.off("updateChatMessage", monksId);
      }
      if (debugEnabled > 1) debug("Check Saves: ", this.saveRequests, this.saveTimeouts, this.saves);
      if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessage"]?.length)
      await asyncHooksCallAll("midi-qol.postCheckSaves", this);
      if (this.item) await asyncHooksCallAll(`midi-qol.postCheckSaves.${this.item?.uuid}`, this);
      if (this.aborted) return this.WorkflowState_Abort;
      const saveDisplay = (this.activity?.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity?.saveDisplay;
      Workflow.removeItemCardButtons(this.itemCardUuid as string, { removeDnd5eSaveButtons: configSettings.autoCheckSaves !== "none", removeDnd5eTemplateButtons: true });
      await this.displaySaves(saveDisplay === "whisper");
    } else {// has saves but we are not checking so do nothing with the damage
      await this.expireTargetEffects(["isAttacked"])
      this.effectTargets = this.failedSaves;
      return this.WorkflowState_RollFinished;
    }
    return this.WorkflowState_SavesComplete;
  }
  async WorkflowState_SavesComplete(context: any = {}): Promise<WorkflowState> {
    expireMyEffects.bind(this)(["1Action", "1Spell"]);
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postSave"), "OnUse", "postSave");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postSave"), "OnUse", "postSave");
    }
    return this.WorkflowState_AllRollsComplete;
  }
  async WorkflowState_AllRollsComplete(context: any = {}): Promise<WorkflowState> {
    this.otherDamageMatches = new Set();
    let items: any[] = [];

    for (let token of this.targets) {
      const otherCondition = this.otherUseCondition;
      const ammoCondition = foundry.utils.getProperty(this.ammunition, `flags.${MODULE_ID}.otherCondition`);
      if (otherCondition) {
        if (await evalActivationCondition(this, otherCondition, token, { async: true, errorReturn: false }))
          this.otherDamageMatches.add(token);
      }
      else if (ammoCondition) { // TODO work out what this means with activities
        if (await evalActivationCondition(this, ammoCondition, token, { async: true, errorReturn: false }))
          this.otherDamageMatches.add(token);
      }
      else {
        this.otherDamageMatches.add(token);
      }
    }

    if (this.rawDamageDetail && (this.rawDamageDetail?.length || this.rawOtherDamageDetail?.length)) await processDamageRoll(this, this.rawDamageDetail[0]?.type ?? this.defaultDamageType)
    // If a damage card is going to be created don't call the isDamaged macro - wait for the damage card calculations to do a better job
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true && !configSettings.autoApplyDamage.includes("Card"))
      await this.triggerTargetMacros(["isDamaged"], this.hitTargets);
    if (debugEnabled > 1) debug("all rolls complete ", foundry.utils.duplicate(this.rawDamageDetail));
    return this.WorkflowState_ApplyDynamicEffects;
  }

  async WorkflowState_ApplyDynamicEffects(context: any = {}): Promise<WorkflowState> {
    const applyDynamicEffectsStartTime = Date.now();

    this.activationMatches = new Set();
    this.otherActivationMatches = new Set();
    this.activationFails = new Set();
    this.otherActivationFails = new Set();

    for (let token of this.targets) {
      const effectCondition = this.effectActivationCondition;
      const otherEffectCondition = this.otherEffectActivationCondition
      if (effectCondition) {
        if (await evalActivationCondition(this, effectCondition, token, { async: true, errorReturn: true })) {
          this.activationMatches.add(token);
        } else
          this.activationFails.add(token);
      } else this.activationMatches.add(token)

      if (otherEffectCondition) {
        if (await evalActivationCondition(this, otherEffectCondition, token, { async: true, errorReturn: true })) {
          this.otherActivationMatches.add(token);
        } else
          this.otherActivationFails.add(token);
      } else this.otherActivationMatches.add(token)
    }
    expireMyEffects.bind(this)(["1Action", "1Spell"]);

    this.effectTargets = new Set();
    this.otherEffectTargets = new Set();
    this.allOtherEffectTargets = new Set(this.targets);
    this.effectTargetsOnSave = this.activationMatches;
    this.otherEffectTargetsOnSave = this.otherActivationMatches;
    if (this.forceApplyEffects) {
      this.effectTargets = new Set();
    } else if ((this.saveActivity?.save || this.saveActivity?.check) && this.activity.attack) {
      this.effectTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
      this.effectTargets = new Set([...this.effectTargets].filter(t => this.failedSaves.has(t)));
    } else if (this.activity.save || this.activity.check) this.effectTargets = this.failedSaves;
    else if (this.activity.attack) {
      this.effectTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    } else
      this.effectTargets = this.targets;
    this.effectTargets = this.effectTargets.filter(t => this.activationMatches.has(t));

    if (this.forceApplyEffects) {
      this.otherEffectTargets = this.targets;
    } else if ((this.otherActivity?.save || this.otherActivity?.check) && this.activity.attack) {
      this.otherEffectTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
      // check saves when selecting the effects to apply - deal with always apply effects
      if (!this.otherEffectActivationCondition)
        this.otherEffectTargets = new Set([...this.otherEffectTargets].filter(t => this.failedSaves.has(t)));
    } else if (this.otherActivity?.save || this.otherActivity?.check) this.otherEffectTargets = this.failedSaves;
    else if (this.activity.attack) {
      this.otherEffectTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    } else
      this.otherEffectTargets = this.targets;
    this.otherEffectTargets = this.otherEffectTargets.filter(t => this.otherActivationMatches.has(t));
    // Do special expiries
    const specialExpiries = [
      "isAttacked",
      "isDamaged",
      "isHealed",
      "isSaveSuccess",
      "isSaveFailure",
      "isSave",
      "isHit"
    ];
    await this.expireTargetEffects(specialExpiries);

    if (configSettings.autoItemEffects === "off" && !this.forceApplyEffects) return this.WorkflowState_RollFinished; // TODO see if there is a better way to do this.

    // TODO look at macros being per activity rather than per item
    if (this.activity.item) {
      if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
        let results: any = await this.callMacros(this.activity.item, this.onUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
        // Special check for return of {haltEffectsApplication: true} from item macro
        if (results.some(r => r?.haltEffectsApplication))
          return this.WorkflowState_RollFinished;
        results = await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
        if (results.some(r => r?.haltEffectsApplication))
          return this.WorkflowState_RollFinished;
      }
    }

    // no item, not auto effects or not module skip
    let useCE = configSettings.autoCEEffects;
    if (!this.activity.item) return this.WorkflowState_RollFinished;
    const midiFlags = this.item.flags[MODULE_ID];
    if (midiFlags?.forceCEOff && ["both", "cepri", "itempri"].includes(useCE)) useCE = "none";
    else if (midiFlags?.forceCEOn && ["none", "itempri"].includes(useCE)) useCE = "cepri";
    const hasCE = installedModules.get("dfreds-convenient-effects")
    let ceEffect = getCEEffectByName(this.activity.name);
    if (!ceEffect) ceEffect = getCEEffectByName(this.activity.item.name);
    const isApplicableEffect = (activeEffect: ActiveEffect | undefined | null): boolean => {
      return !!activeEffect && activeEffect?.transfer !== true && (activeEffect?.type as string) !== "enchantment";
    }
    let activityEffects = (this.activity.effects ?? []).filter(efData => isApplicableEffect(efData.effect) && efData.onSave !== true).map(efData => efData.effect);
    let onSaveActivityEffects = (this.activity.effects ?? []).filter(efData => isApplicableEffect(efData.effect) && efData.onSave === true).map(efData => efData.effect);
    let otherActivityEffects = (this.otherActivity?.effects ?? []).filter(efData => isApplicableEffect(efData.effect) && efData.onSave !== true).map(efData => efData.effect);
    let onSaveOtherActivityEffects = (this.otherActivity?.effects ?? []).filter(efData => isApplicableEffect(efData.effect) && efData.onSave === true).map(efData => efData.effect);
    if (activityEffects.length > 0 && this.effectTargets.size > 0 && this.activity?.midiProperties?.chooseEffects) { // WIP
      activityEffects = await this.chooseEffects(activityEffects, {activity: this.activity, activityUuid: this.activity.uuid, isOtherActivity: false });
    }
    if (otherActivityEffects.length > 0 && this.otherEffectTargets.size > 0 && this.otherActivity?.midiProperties?.chooseEffects) { // WIP
      otherActivityEffects = await this.chooseEffects(otherActivityEffects, {activity: this.otherActivity, activityUuid: this.otherActivity.uuid, isOtherActivity: true });
    }
    const ceTargetEffect = ceEffect && !(ceEffect?.flags?.dae?.selfTarget || ceEffect?.flags?.dae?.selfTargetAlways);
    const ceSelfEffect = ceEffect && (ceEffect?.flags?.dae?.selfTarget || ceEffect?.flags?.dae?.selfTargetAlways);
    const hasActivityEffects = hasDAE(this) && activityEffects.length > 0;
    const hasOtherActivityEffects = hasDAE(this) && otherActivityEffects.length > 0;
    const activitySelfEffects = activityEffects.filter(ef => ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways) ?? [];
    const activitySelfAllEffect = activityEffects.filter(ef => ef.flags?.dae?.selfTargetAlways && !ef.transfer) ?? [];
    const otherActivitySelfEffects = otherActivityEffects.filter(ef => ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways) ?? [];
    const otherActivitySelfAllEffects = otherActivityEffects.filter(ef => ef.flags?.dae?.selfTargetAlways) ?? [];
    activityEffects = activityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    otherActivityEffects = otherActivityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    // let anyApplication = this.effectTargets.size > 0 || this.otherEffectTargets.size > 0;

    let selfEffectsToApply = "none";
    const metaData = {
      "flags": {
        "dae": { transfer: false },
        "midi-qol": {
          castData: this.castData
        }
      }
    };
    let origin = this.actor.effects.get(this.chatCard.getFlag("dnd5e", "use.concentrationId"))?.uuid;
    let damageComponents = {};
    let damageListItem;
    let hpDamage;
    let totalDamage;
    const doEffectsData: any = {
      damageTotal: totalDamage,
      critical: this.isCritical,
      fumble: this.isFumble,
      itemCardUuid: this.itemCardUuid,
      metaData,
      selfEffects: "none",
      spellLevel: this.spellLevel,
      toggleEffect: this.activity.midiProperties.toggleEffect ?? this.item?.flags.midiProperties?.toggleEffect,
      tokenUuid: this.tokenUuid,
      actorUuid: this.actor.uuid,
      whisper: false,
      workflowOptions: this.workflowOptions,
      context: {
        damageComponents,
        damageApplied: hpDamage,
        damage: totalDamage,  // this is currently ignored see damageTotal above
        otherDamage: this.otherDamageTotal ?? 0,
        bonusDamage: this.bonusDamageTotal ?? 0,
        itemData: this.item.toObject(),
        flags: {
          dnd5e: {
            scaling: this.chatCard.getFlag("dnd5e", "scaling"),
            spellLevel: this.chatCard.getFlag("dnd5e", "use.spellLevel")
          }
        }
      }
    }
    for (let token of this.targets) {
      const tokenDamages = this.damageList?.find(di => di.targetUuid === getTokenDocument(token)?.uuid);
      if (tokenDamages) {
        totalDamage = tokenDamages.totalDamage;
        hpDamage = tokenDamages.hpDamage;
        damageComponents = [tokenDamages.damageDetails["combinedDamage"], configSettings.singleConcentrationRoll ? [] : (tokenDamages.damageDetails["otherDamage"] ?? [])]
          .reduce((summary, damages) => {
            let damagesSummary = damages.reduce((damageComponents, damageEntry) => {
              damageComponents[damageEntry.type] = damageEntry.value + (damageComponents[damageEntry.type] ?? 0);
              return damageComponents;
            }, {});
            Object.keys(damagesSummary).forEach(key => {
              summary[key] = damagesSummary[key] + (summary[key] ?? 0);
            });
            return summary;
          }, {});
      }

      // Check for activity effects or ce effects
      if (this.forceApplyEffects || this.effectTargets.has(token)) {
        if (hasActivityEffects && (!ceTargetEffect || ["none", "both", "itempri"].includes(useCE))) {
          let selectedEffects = activityEffects;
          if (!this.forceApplyEffects) {
            selectedEffects = activityEffects.filter(ef =>
              this.effectTargets.has(token) && (
                !(this.activity?.save || this.activity?.check)
                || this.failedSaves.has(token)
                || this.activity?.effects.some(effectDetail => effectDetail.onSave == true && effectDetail._id === ef.id)
              )
            );
          }
          const effectsToApplyUuids = selectedEffects.map(ef => ef.uuid);
          if (effectsToApplyUuids?.length > 0) {
            doEffectsData.origin = origin ?? effectsToApplyUuids[0];
            await globalThis.DAE.doActivityEffects(this.activity, true, [token], effectsToApplyUuids, doEffectsData);
          }
        }
        if (ceTargetEffect && this.activity.item && token.actor) {
          if (ceEffect && ["both", "cepri"].includes(useCE) || (useCE === "itempri" && !hasActivityEffects)) {
            const targetHasEffect = (token.actor as Actor).effects.find(ef => ef.name === ceEffect.name);
            if ((this.activity.midiProperties?.toggleEffect ?? this.item?.flags.midiProperties?.toggleEffect) && targetHasEffect) {
              await CEToggleEffect({ effectName: ceEffect.name, uuid: (token.actor as Actor).uuid, origin });
            } else {
              // Check stacking status
              let removeExisting = (["none", "noneName"].includes(ceEffect.flags?.dae?.stackable ?? "none"));
              const hasExisting = await CEHasEffectApplied({ effectName: ceEffect.name, uuid: (token.actor as Actor).uuid })
              if (removeExisting && hasExisting) {
                await CERemoveEffect({ effectName: ceEffect.name, uuid: (token.actor as Actor).uuid, origin });
              }
              const effectData = foundry.utils.mergeObject(ceEffect.toObject(), metaData);
              if (isInCombat(token.actor as Actor) && effectData.duration.seconds <= 60) {
                effectData.duration.rounds = effectData.duration.rounds ?? Math.ceil(effectData.duration.seconds / CONFIG.time.roundTime);
                delete effectData.duration.seconds;
              }
              effectData.origin = origin ?? this.activity.uuid ?? this.activity.item.uuid;
              const effects = await CEAddEffectWith({ effectData, effectName: ceEffect.name, uuid: (token.actor as Actor).uuid, origin, overlay: false });
              if (this.chatCard.getFlag("dnd5e", "use.concentrationId")) {
                const originEffect = this.actor.effects.get(this.chatCard.getFlag("dnd5e", "use.concentrationId"));
                if (originEffect) {
                  if (!effects) {
                    for (let effect of token.actor.effects.filter(ef => ef.origin === originEffect.uuid)) {
                      if (!(originEffect.getFlag("dnd5e", "dependents") as any[] ?? []).some(d => d.uuid === effect.uuid))
                        originEffect.addDependent(effect);
                    }
                  } else for (let effect of effects) {
                    if (effect instanceof ActiveEffect && originEffect instanceof ActiveEffect) {
                      // @ts-expect-error no dnd5e-types
                      await originEffect.addDependent(effect);
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (this.effectTargetsOnSave.size > 0 && onSaveActivityEffects.length > 0) {
        let selectedEffects = onSaveActivityEffects;
        const effectsToApplyUuids = onSaveActivityEffects.map(ef => ef.uuid);
        if (effectsToApplyUuids?.length > 0) {
          doEffectsData.origin = effectsToApplyUuids[0].uuid;
          await globalThis.DAE.doActivityEffects(this.activity, true, [token], effectsToApplyUuids, doEffectsData)
        }
      }
      if (this.forceApplyEffects || this.otherEffectTargets.has(token)) {
        if (hasOtherActivityEffects) {
          let selectedEffects = otherActivityEffects;
          if (!this.forceApplyEffects) {
            selectedEffects = otherActivityEffects.filter(ef =>
              this.otherActivationMatches.has(token) && this.otherEffectTargets.has(token) && (
                !(this.otherActivity?.save || this.otherActivity?.check)
                || this.failedSaves.has(token)
                || this.otherActivity?.effects.some(effectDetail => effectDetail.onSave == true && effectDetail._id === ef.id)
              )
            );
          }
          const effectsToApplyUuids = selectedEffects.map(ef => ef.uuid);
          if (effectsToApplyUuids?.length > 0) {
            doEffectsData.origin = effectsToApplyUuids[0];
            await globalThis.DAE.doActivityEffects(this.otherActivity, true, [token], effectsToApplyUuids, doEffectsData)
          }
        }
      }
      if (this.otherEffectTargetsOnSave.size > 0 && onSaveOtherActivityEffects.length > 0) {
        let selectedEffects = onSaveOtherActivityEffects;
        const effectsToApplyUuids = onSaveOtherActivityEffects.map(ef => ef.uuid);
        if (effectsToApplyUuids?.length > 0) {
          doEffectsData.origin = effectsToApplyUuids[0];
          await globalThis.DAE.doActivityEffects(this.otherActivity, true, [token], effectsToApplyUuids, doEffectsData)
        }
      }
    }
    // Perhaps this should use this.effectTargets
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["postTargetEffectApplication"], this.targets);

    //Now do self effects
    let selfEffects: any[] = [];
    if (this.effectTargets?.size > 0) selfEffects = activitySelfEffects;
    else selfEffects = activitySelfAllEffect;
    const selfToken = getOrCreateTokenForActor(this.actor);
    if (selfEffects.length > 0 && selfToken) {
      doEffectsData.origin = origin ?? this.activity.uuid ?? this.item.uuid;
      await globalThis.DAE.doActivityEffects(this.activity, true, [selfToken], selfEffects.map(ef => ef.uuid), doEffectsData)
    }

    let otherSelfEffects: any[] = [];
    if (this.otherEffectTargets.size > 0) otherSelfEffects = otherActivitySelfAllEffects;
    else otherSelfEffects = otherActivitySelfEffects;
    if (otherSelfEffects.length > 0 && selfToken) {
      doEffectsData.origin = this.otherActivity.item.uuid;
      await globalThis.DAE.doActivityEffects(this.otherActivity, true, [selfToken], otherSelfEffects.map(ef => ef.uuid), doEffectsData)
    }

    if (ceSelfEffect && (this.effectTargets?.size > 0 || ceSelfEffect.flags?.dae?.selfTargetAlways)) {
      if (["both", "cepri"].includes(useCE) || (useCE === "itempri" && !selfEffects.length)) {
        const actorHasEffect = this.actor.effects.find(ef => ef.name === this.activity.name);
        if ((this.activity.midiProperties?.toggleEffect ?? this.item?.flags.midiProperties?.toggleEffect) && actorHasEffect) {
          CEToggleEffect({ effectName: this.activity.name, uuid: this.actor.uuid, origin });
        } else {
          // Check stacking status
          // if ((ceSelfEffectToApply.flags?.dae?.stackable ?? "none") === "none" && game.dfreds.effectInterface?.hasEffectApplied(theItem.name, this.actor.uuid)) {
          if ((ceSelfEffect.flags?.dae?.stackable ?? "none") === "none" && await CEHasEffectApplied({ effectName: this.activity.name, uuid: this.actor.uuid })) {
            await CERemoveEffect({ effectName: this.activity.name, uuid: this.actor.uuid, origin });
          }
          const effectData = foundry.utils.mergeObject(ceSelfEffect.toObject(), metaData);
          effectData.origin = origin;
          const effects = await CEAddEffectWith({ effectData, effectName: this.activity.name, uuid: this.actor.uuid, origin, overlay: false });
          if (this.chatCard.getFlag("dnd5e", "use.concentrationId")) {
            const originEffect = this.actor.effects.get(this.chatCard.getFlag("dnd5e", "use.concentrationId"));
            if (originEffect) {
              if (!effects) {
                for (let effect of this.actor.effects.filter(ef => ef.origin === originEffect.uuid)) {
                  if (!(originEffect.getFlag("dnd5e", "dependents") as any[] ?? []).some(d => d.uuid === effect.uuid))
                    originEffect.addDependent(effect);
                }
              } else for (let effect of effects) {
                if (effect instanceof ActiveEffect && origin instanceof ActiveEffect) {
                  await originEffect.addDependent(effect);
                }
              }
            }
          }
        }
      }
    }
    return this.WorkflowState_RollFinished;
  }
  async WorkflowState_Cleanup(context: any = {}): Promise<WorkflowState> {
    if (this.placeTemplateHookId) {
      Hooks.off("createMeasuredTemplate", this.placeTemplateHookId);
      Hooks.off("preCreateMeasuredTemplate", this.preCreateTemplateHookId);
    }
    const blfxActive = game.modules?.get("boss-loot-assets-premium")?.active ||
      game.modules?.get("boss-loot-assets-free")?.active;
    const AAActive = game.modules?.get("autoanimations")?.active;
    const elapsedTimeRequired = 5000;
    if (configSettings.autoRemoveInstantaneousTemplate && this.templateUuid && this.activity.duration.units === "inst") {
      if (!blfxActive) {
        const elapsed = Date.now() - this.workflowStartTime;
        // if auto animations is active we need to allow enough time for it to have grabbed the template data before deleting it.
        let timeout = AAActive ? Math.max(elapsedTimeRequired - elapsed, 1) : 1;
        timeout = Math.max(elapsedTimeRequired, timeout);
        setTimeout(() => {
          const templateToDelete = fromUuidSync(this.templateUuid) as MeasuredTemplateDocument || null;
          templateToDelete?.delete()
        }, timeout);
      } else {
        const timeout = 5000;
        setTimeout(() => {
          const templateToDelete = fromUuidSync(this.templateUuid) as MeasuredTemplateDocument || null;
          templateToDelete?.delete()
        }, elapsedTimeRequired);
        log("Not auto removing instantaneous template because boss loot assets active")
      }
    }
    if (this.postSummonHookId) Hooks.off("dnd5e.postSummon", this.postSummonHookid);
    if (configSettings.autoItemEffects === "applyRemove") await this.removeEffectsButton();
    // TODO see if we can delete the workflow - I think that causes problems for Crymic
    setTimeout(() => {
      //@ts-expect-error protected
      ui.chat?.scrollBottom();
    }, 100);
    return this.WorkflowState_Completed;
  }

  async WorkflowState_Completed(context: any = {}): Promise<WorkflowState> {
    if (this.itemCardUuid && MQfromUuidSync(this.itemCardUuid)) {
      if (this.damageList && SaveToChatCard && this.itemCardUuid) {
        const damageListData = prepareDamageListToJSON(this.damageList);
        damageListData.forEach((di => delete di.damageDetails))
        addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.damageList]: damageListData });
      }
      await Workflow.removeItemCardButtons(this.itemCardUuid, { removeAllButtons: getRemoveAllButtons(this.item), removeAttackButtons: getRemoveAttackButtons(this.item), removeDamageButtons: getRemoveDamageButtons(this.item), removeDnD5eButtons: getRemoveAllButtons(this.item) && configSettings.autoCheckSaves !== "none", removeDnd5eSaveButtons: configSettings.autoCheckSaves !== "none" });
    }
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    if (context.damageRoll) return this.WorkflowState_ConfirmRoll;
    if (this.activity.midiProperties?.triggeredActivityId && !this.aborted) {
      let activity = this.activity
      let shouldTrigger = true;
      let possibleTriggerActivity = await this.activity.getTriggeredActivity();
      while (possibleTriggerActivity) {
        if (possibleTriggerActivity.id === activity.id) {
          ui.notifications?.error((`midi-qol | loop detected in triggered activities for ${this.actor.name} ${this.item?.name} ${this.activity.name} - execution aborted`))
          shouldTrigger = false;
          break;
        }
        possibleTriggerActivity = await possibleTriggerActivity.getTriggeredActivity();
      }

      let triggeredActivity = await this.activity.getTriggeredActivity();
      if (shouldTrigger && triggeredActivity) {
        if (shouldTrigger) {
          let usage: any = {};
          usage.midiOptions = {};
          usage.midiOptions.event = this.event;
          usage.midiOptions.workflowOptions = this.workflowOptions;
          usage.midiOptions.rollOptions = this.rollOptions;
          usage.midiOptions.isTriggered = true;
          let targetUuids: string[] = [];
          const toUuids = (targets: Set<Token | TokenDocument>): string[] => {
            //@ts-expect-error
            return Array.from(targets ?? new Set()).map(t => t.document?.uuid ?? t.uuid)
          }

          if (this.activity.midiProperties?.triggeredActivityRollAs) {
            switch (this.activity.midiProperties.triggeredActivityRollAs) {
              case "firstTarget": usage.midiOptions.rollAs = getActor(this.targets.first()); break;
              case "firstHitTarget": usage.midiOptions.rollAs = getActor(this.hitTargets.first()); break;
              case "firstMissedTarget": usage.midiOptions.rollAs = getActor(this.targets.difference(this.hitTargets).first()); break;
              case "firstSaveTarget": usage.midiOptions.rollAs = getActor(this.saves.first()); break;
              case "firstFailedSaveTarget": usage.midiOptions.rollAs = getActor(this.failedSaves.first()); break;
              case "self":
              default:
                usage.midiOptions.rollAs = this.actor;
                break;
            }
          }
          if (!usage.midiOptions.rollAs.isOwner) usage.midiOptions.checkGMstatus = true;
          if (this.activity.midiProperties?.triggeredActivityTargets)
            switch (this.activity.midiProperties.triggeredActivityTargets) {
              case "self": targetUuids = [this.tokenUuid ?? ""]; break;
              case "hitTargets": targetUuids = toUuids(this.hitTargets); break;
              case "missedTargets": targetUuids = toUuids(this.targets.difference(this.hitTargets)); break;
              case "failedSaves": targetUuids = toUuids(this.failedSaves); break;
              case "saveTargets": targetUuids = toUuids(this.saveTargets); break;
              case "targets": targetUuids = toUuids(this.targets); break;
              case "retarget":
              default:
                // targetUuids = [];
                break;
            }
          usage.midiOptions.targetUuids = targetUuids;
          usage.midiOptions.triggeredActivity = true;
          const saveTargets = game.user?.targets;
          if (this.activity.midiProperties.triggeredActivityTargets !== "retarget" && targetUuids?.length === 0)
            shouldTrigger = false;
          if (this.activity.midiProperties?.triggeredActivityConditionText && shouldTrigger) {
            // @ts-expect-error
            const target: any = await fromUuid(targetUuids[0]);
            const condition = this.activity.midiProperties?.triggeredActivityConditionText;
            const conditionData = createConditionData({ workflow: this, activity: this.activity, item: this.item, target });
            shouldTrigger = await evalCondition(condition, conditionData, { async: true, errorReturn: false });
          }
          if (shouldTrigger) {
            foundry.utils.setProperty(usage, "midiOptions.isCritical", this.isCritical);
            foundry.utils.setProperty(usage, "midiOptions.workflowOptions.triggeringWorkflowId", this.id);
            foundry.utils.setProperty(usage, "midiOptions.workflowOptions.triggeringActivityUuid", this.activity.uuid);
            await completeActivityUse(triggeredActivity, usage, { configure: false }, {});
          }
        }
      }
    }
    return this.WorkflowState_Suspend;

  }

  async WorkflowState_Abort(context: any = {}): Promise<WorkflowState> {
    this.aborted = true;
    if (this.placeTemplateHookId) {
      Hooks.off("createMeasuredTemplate", this.placeTemplateHookId);
      Hooks.off("preCreateMeasuredTemplate", this.preCreateTemplateHookId);
    }
    if (this.postSummonHookId) Hooks.off("dnd5e.postSummon", this.postSummonHookid);
    if (!this.keepActivityCard && this.itemCardUuid && MQfromUuidSync(this.itemCardUuid)) {
      await this.chatCard.delete();
      clearUpdatesCache(this.itemCardUuid);
    }

    if (this.templateUuid) {
      const templateToDelete = await fromUuid(this.templateUuid as any);
      //@ts-expect-error
      if (templateToDelete) await templateToDelete.delete();
    }
    return this.WorkflowState_Cleanup;
  }

  async WorkflowState_Cancel(context: any = {}): Promise<WorkflowState> {
    // cancel will undo the workflow if it exists
    if (configSettings.undoWorkflow) await unTimedExecuteAsGM("undoTillWorkflow", this.uuid, true, true);
    return this.WorkflowState_Abort
  }

  async WorkflowState_RollFinished(context: any = {}): Promise<WorkflowState> {
    if (this.aborted) {
      const message = `${this.workflowName} Workflow ${this.id} RollFinished called when aborted`;
      error(message);
      TroubleShooter.recordError(new Error(message), message);
    }
    const specialExpiries = [
      "isDamaged",
      "isHealed",
      "1Reaction",
    ];
    await this.expireTargetEffects(specialExpiries)
    const rollFinishedStartTime = Date.now();
    const chatMessage = this.chatCard;
    let selfTarget = this.token ?? getOrCreateTokenForActor(this.actor);
    if (!this.hitTargetsDisplayed && this.targets?.size > 0 && chatMessage && (this.activity.effects?.length || this.otherActivity?.effects?.length)) {
      this.hitDisplayData = {};
      const theTargets = this.effectTargets?.size > 0 ? this.effectTargets : this.targets;
      for (let targetToken of theTargets) {
        const targetTokenUuid = (targetToken.actor as Actor).uuid;
        if (!targetTokenUuid) continue;
        let img = targetToken.document?.texture.src ?? (targetToken.actor as Actor).img;
        // @ts-expect-error no dnd5e-types
        if (configSettings.usePlayerPortrait && (targetToken.actor as Actor).type === "character") {
          img = (targetToken.actor as Actor).img ?? targetToken.document?.texture.src;
        }
        //@ts-expect-error
        if (foundry.helpers.media.VideoHelper.hasVideoExtension(img ?? "")) {
          img = await game.video?.createThumbnail(img ?? "", { width: 100, height: 100 });
        }
        this.hitDisplayData[targetTokenUuid] = {
          isPC: (targetToken.actor as Actor).hasPlayerOwner,
          target: targetToken,
          hitClass: "success",
          acClass: "",
          img,
          gmName: getTokenName(targetToken),
          playerName: getTokenPlayerName(targetToken),
          uuid: targetToken.uuid,
          showAC: false,
          isHit: true
        };
      }
      await this.displayHits(chatMessage.whisper.length > 0, true);
    }
    let content = chatMessage?.content && foundry.utils.duplicate(chatMessage?.content);
    let contentChanged = false;
    // TODO move this to call the omnibus remove buttons function
    if (content && getRemoveAttackButtons(this.item) && chatMessage && configSettings.confirmAttackDamage === "none") {
      let searchRe = /<button[^>]*? data-action="attack"[\s\S]*?<\/button>/;
      // searchRe = /<div class="midi-attack-buttons".*<\/div>/
      content = content.replace(searchRe, "");
      contentChanged = true;
    }
    // Once the roll if finished cannot place template again so remove the button
    if (content) {
      const searchRe = /<button[^>]*?data-action="placeTemplate"[\s\S]*?<\/button>/;
      content = content.replace(searchRe, "");
      contentChanged = true;
    }
    if (contentChanged) {
      const update: any = {
        "content": content,
        timestamp: Date.now(),
        "flags.midi-qol.type": MESSAGE_TYPES.ITEM,
      };
      await this.performDebouncedUpdate(chatMessage, update);
    }
    // Add concentration data if required
    let hasConcentration = this.item.requiresConcentration;
    const template = await fromUuid(this.templateUuid) as MeasuredTemplateDocument | null;
    if (hasConcentration && template && this.chatCard.getFlag("dnd5e", "use.concentrationId")) {
      let origin = this.actor.effects.get(this.chatCard.getFlag("dnd5e", "use.concentrationId"));
      if (origin instanceof ActiveEffect) {
        // @ts-expect-error no dnd5e-types
        await origin.addDependent(template);
      }
    } else if (installedModules.get("dae") && activityHasAreaTarget(this.activity) && template
      && this.activity.duration?.units && configSettings.autoRemoveTemplate) { // create an effect to delete the template
      // If we are not applying concentration and want to auto remove the template create an effect to do so
      const activityDuration = this.activity.duration;
      let effectData;
      const templateString = " " + i18n("midi-qol.MeasuredTemplate");
      let effect = this.item.actor.effects.find(ef => ef.name === this.item.name + templateString);
      if (effect) { // effect already applied
        if (template) { // we can add dependents so do that
          await effect.addDependent(template);
        }
      } else if (template) { // add an effect which will cause the template to be deleted
        effectData = {
          origin: this.item?.uuid, //flag the effect as associated to the spell being cast
          disabled: false,
          icon: this.item?.img,
          label: this.item?.name + templateString,
          name: this.item?.name + templateString,
          duration: {},
          flags: {
            dae: {
              stackable: "noneName"
            },
            dnd5e: { dependents: [{ uuid: template.uuid }] }
          },
        }

        const inCombat = (game?.combat as unknown as Combat)?.turns.some(combatant => (combatant.tokenId === selfTarget?.id));
        const convertedDuration = globalThis.DAE.convertDuration(activityDuration, inCombat);
        if (convertedDuration?.type === "seconds") {
          effectData.duration = { seconds: convertedDuration.seconds, startTime: game.time?.worldTime }
        } else if (convertedDuration?.type === "turns") {
          effectData.duration = {
            rounds: convertedDuration.rounds,
            turns: convertedDuration.turns,
            startRound: (game?.combat as unknown as Combat)?.round,
            startTurn: (game?.combat as unknown as Combat)?.turn,
          }
        }
        if (!(this.activity.duration?.units == "inst" && configSettings.autoRemoveInstantaneousTemplate)) {
          await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }
      }
    }
    if (hasConcentration && this.summonedCreatures && configSettings.autoRemoveSummonedCreature) {
      let origin = this.actor.effects.get(this.chatCard.getFlag("dnd5e", "use.concentrationId"));
      if (origin instanceof ActiveEffect) {
        // @ts-expect-error no dnd5e-types
        await origin.addDependent(...this.summonedCreatures);
      }
    } else if (configSettings.autoRemoveSummonedCreature && this.summonedCreatures) {
      // need to create an effect to remove the summoned creatures
      const activityDuration = this.activity.duration;
      let effectData;
      const summonString = i18n("DND5E.ActionSumm") + ": ";
      let effect = this.item.actor.effects.find(ef => ef.name === summonString + this.item.name);
      if (effect) { // effect already applied
        await effect.addDependent(...this.summonedCreatures);
      } else { // add an effect which will cause the template to be deleted
        effectData = {
          origin: this.item?.uuid, //flag the effect as associated to the spell being cast
          disabled: false,
          icon: this.item?.img,
          label: summonString + this.item?.name,
          duration: {},
          flags: {
            dae: {
              stackable: "noneName"
            },
            dnd5e: { dependents: this.summonedCreatures.map(sc => { return { uuid: sc.uuid } }) }
          },
        }
        const inCombat = (game.combat?.turns.some(combatant => (combatant as unknown as Combatant).token?.id === selfTarget.id));
        const convertedDuration = globalThis.DAE.convertDuration(activityDuration, inCombat);
        if (convertedDuration?.type === "seconds") {
          effectData.duration = { seconds: Math.max(convertedDuration.seconds, 1), startTime: game.time?.worldTime }
        } else if (convertedDuration?.type === "turns") {
          effectData.duration = {
            rounds: convertedDuration.rounds,
            turns: convertedDuration.rounds > 0 ? convertedDuration.turns : Math.max(convertedDuration.turns, 1),
            startRound: game.combat?.round,
            startTurn: game.combat?.turn,
          }
        }
        await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
      }
    }
    await asyncHooksCallAll("midi-qol.postActiveEffects", this);
    if (this.item) await asyncHooksCallAll(`midi-qol.postActiveEffects.${this.item?.uuid}`, this);
    // Call onUseMacro if not already called
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
    }
    if (this.aborted) return this.WorkflowState_Abort;  // TODO This is wrong

    await asyncHooksCallAll("midi-qol.RollComplete", this);
    if (this.item) await asyncHooksCallAll(`midi-qol.RollComplete.${this.item?.uuid}`, this);
    if (this.aborted) return this.WorkflowState_Abort;  // TODO This is wrong
    if (autoRemoveTargets !== "none") setTimeout(untargetDeadTokens, 500); // delay to let the updates finish
    const inCombat = isInCombat(this.actor);
    let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id)
    const isTurn = activeCombatants?.includes(this.token?.id);
    if (inCombat && isTurn && this.activity?.activation.type === "action" && !this.AoO) {
      await setActionUsed(this.actor);
    }
    return this.WorkflowState_Cleanup;
  }
  async WorkflowState_Default(context: any = {}): Promise<WorkflowState> { return this.WorkflowState_Suspend };

  initSaveResults() {
    this.saves = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
    this.failedSaves = this.activity?.hasAttack ? new Set(this.hitTargets) : new Set(this.targets);
    this.advantageSaves = new Set();
    this.disadvantageSaves = new Set();
    this.saveDisplayData = [];
    this.saveResults = [];
  };

  public async checkAttackAdvantage() {
    await this.checkFlankingAdvantage();
    if (!this.needsAttackAdvantageCheck) return;
    this.needsAttackAdvantageCheck = false;

    const midiFlags: any = this.actor?.flags[MODULE_ID];
    const advantage = midiFlags?.advantage;
    const disadvantage = midiFlags?.disadvantage;
    const actType = this.activity?.actionType || "none"
    let conditionData;
    if (advantage || disadvantage) {
      //@ts-expect-error
      const target: Token = this.targets.first();
      conditionData = createConditionData({ workflow: this, target, actor: this.actor });

      if (advantage) {
        if (advantage.all && await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.advantage.all`, conditionData)) {
          this.advantage = true;
          this.attackAdvAttribution.add(`ADV:all ${foundry.utils.getProperty(this.actor, "flags.midi.evaluated.advantage.all").effects.join(", ")}`);
          // foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.all", true);
        }
        if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.advantage.attack.all`, conditionData)) {
          this.attackAdvAttribution.add(`ADV:attack.all ${foundry.utils.getProperty(this.actor, "flags.midi.evaluated.advantage.attack.all").effects.join(", ")}`);
          this.advantage = true;
        }
        if (advantage.attack && advantage.attack[actType] && await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.advantage.attack.${actType}`, conditionData)) {
          this.attackAdvAttribution.add(`ADV:attack.${actType} ${foundry.utils.getProperty(this.actor, `flags.midi.evaluated.advantage.attack.${actType}`).effects.join(", ")}`);
          this.advantage = true;
        }
      }
      if (disadvantage) {
        const withDisadvantage = disadvantage.all || disadvantage.attack?.all || (disadvantage.attack && disadvantage.attack[actType]);
        if (disadvantage.all && await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.disadvantage.all`, conditionData)) {
          this.attackAdvAttribution.add(`DIS:all ${foundry.utils.getProperty(this.actor, "flags.midi.evaluated.disadvantage.all").effects.join(", ")}`);
          this.disadvantage = true;
        }
        if (disadvantage.attack?.all && await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.disadvantage.attack.all`, conditionData)) {
          this.attackAdvAttribution.add(`DIS:attack.all ${foundry.utils.getProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.all").effects.join(", ")}`);
          this.disadvantage = true;
        }
        if (disadvantage.attack && disadvantage.attack[actType] && await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.disadvantage.attack.${actType}`, conditionData)) {
          this.attackAdvAttribution.add(`DIS:attack.${actType} ${foundry.utils.getProperty(this.actor, `flags.midi.evaluated.disadvantage.attack.${actType}`).effects.join(", ")}`);
          this.disadvantage = true;
        }
      }
      await this.checkAbilityAdvantage();
    }
    // TODO Hidden should check the target to see if they notice them?
    const target = this.targets?.first();
    if (checkRule("invisAdvantage") && checkRule("invisAdvantage") !== "none" && target) {
      // if we are using a proxy token to attack use that for hidden invisible
      const invisibleToken = this.token ? hasCondition(this.token.actor as Actor, "invisible") : false;
      const invisibleTarget = hasCondition(target.actor as Actor, "invisible");
      const tokenCanSense = this.tokenCanSense?.has(target);
      const targetCanSense = this.token && this.targetsCanSense?.has(this.token);
      const invisAdvantage = (checkRule("invisAdvantage") === "RAW") ? invisibleToken || !targetCanSense : !targetCanSense;
      if (invisAdvantage) {
        if (invisibleToken) {
          this.attackAdvAttribution.add("ADV:Attacker invisible");
          this.advReminderAttackAdvAttribution.add("ADV:Attacker Invisible");
        } else if (!targetCanSense) {
          this.attackAdvAttribution.add("ADV:Attacker not detected");
          this.advReminderAttackAdvAttribution.add("ADV:Attacker not detected");
        }
        foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.invisible", { value: true, effects: ["Invisible Attacker"] });

        this.advantage = true;
      }

      const invisDisadvantage = (checkRule("invisAdvantage") === "RAW") ? invisibleTarget || !tokenCanSense : !tokenCanSense;
      if (invisDisadvantage) {
        // Attacker can't see target so disadvantage
        log(`Disadvantage given to ${this.actor.name} due to invisible target`, invisibleTarget, tokenCanSense);
        if (invisibleTarget) {
          this.attackAdvAttribution.add("DIS:invisible foe");
          this.advReminderAttackAdvAttribution.add("DIS:Invisible Foe");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.invisible", { value: true, effects: ["Invisible Defender"] });
        }
        if (!tokenCanSense) {
          this.attackAdvAttribution.add("DIS:Defender not detected");
          this.advReminderAttackAdvAttribution.add("DIS:Defender not detected");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.invisible", { value: true, effects: ["Defender not detected"] });
        }
        this.disadvantage = true;
      }
    }

    // Check hidden
    if (checkRule("hiddenAdvantage") && checkRule("HiddenAdvantage") !== "none" && target) {
      if (checkRule("hiddenAdvantage") === "perceptive" && installedModules.get("perceptive")?.active) {
        //@ts-expect-error .api
        const perceptiveApi = game.modules?.get("perceptive")?.api;
        const tokenSpotted = await perceptiveApi?.isSpottedby(this.token, target, { LOS: false, Range: true, Effects: true, Hidden: false, canbeSpotted: true }) ?? true;
        const targetSpotted = await perceptiveApi?.isSpottedby(target, this.token, { LOS: false, Range: true, Effects: true, Hidden: false, canbeSpotted: true }) ?? true;
        if (!tokenSpotted) {
          this.attackAdvAttribution.add("ADV:Attacker hidden");
          this.advReminderAttackAdvAttribution.add("ADV:Hidden");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.hidden", { value: true, effects: ["Hidden Attacker"] });
          this.advantage = true;
        }
        if (!targetSpotted) {
          this.attackAdvAttribution.add("DIS:hidden foe");
          this.advReminderAttackAdvAttribution.add("DIS:Hidden Foe");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.hidden", { vale: true, effects: ["Hidden Defender"] });
          this.disadvantage = true;
        }
      }

      if (checkRule("hiddenAdvantage") === "effect") {
        const hiddenToken = this.token ? hasCondition(this.token.actor as Actor, "hidden") : false;
        const hiddenTarget = hasCondition(target.actor as Actor, "hidden");
        if (hiddenToken) {
          this.attackAdvAttribution.add("ADV:Attacker hidden");
          this.advReminderAttackAdvAttribution.add("ADV:Hidden");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.hidden", { value: true, effects: ["Hidden Attacker"] });
          this.advantage = true;
        }
        if (hiddenTarget) {
          this.attackAdvAttribution.add("DIS:Target hidden");
          this.advReminderAttackAdvAttribution.add("DIS:Hidden Foe");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.hidden", { value: true, effects: ["Hidden Defender"] });
          this.disadvantage = true;
        }
      }
    }

    // Nearby foe gives disadvantage on ranged attacks
    if (checkRule("nearbyFoe")
      && !foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.ignoreNearbyFoes`)
      && (["rwak", "rsak", "rpak"].includes(actType) || (this.item.system.properties?.has("thr") && actType == "mwak"))) {
      let nearbyFoe;
      if (this.token) {
        if (actType !== "mwak") { // one of rwak/rsak/rpak
          nearbyFoe = checkNearby(-1, getToken(this.token), configSettings.optionalRules.nearbyFoe, { includeIncapacitated: false, canSee: true });
        } else if (this.item.system.properties?.has("thr")) {
          const meleeRange = this.item.system.range.reach ?? 5;
          if (computeDistance(this.token, this.targets.first(), { wallsBlock: false }) <= meleeRange) nearbyFoe = false;
          else nearbyFoe = checkNearby(-1, getToken(this.token), configSettings.optionalRules.nearbyFoe, { includeIncapacitated: false, canSee: true });
        }
        if (nearbyFoe) {
          if (debugEnabled > 0) warn(`checkAttackAdvantage | Ranged attack by ${this.actor.name} at disadvantage due to nearby foe`);
          this.attackAdvAttribution.add("DIS:nearbyFoe");
          this.advReminderAttackAdvAttribution.add("DIS:Nearby foe");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.nearbyFoe", { value: true, effects: ["Nearby Foe"] });
          this.disadvantage = true;
        }
      }
    }

    if (this.item.system.properties?.has("hvy")) {
      const failDisadvantageHeavy = foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.fail.disadvantage.heavy`);
      if (failDisadvantageHeavy && !conditionData)
        conditionData = createConditionData({ workflow: this, target, actor: this.actor });
      if (!failDisadvantageHeavy || !await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.fail.disadvantage.heavy`, conditionData)) {
        if (safeGetGameSetting("dnd5e", "rulesVersion") === "modern") {
          if ((this.activity?.actionType === "mwak" && this.actor.system.abilities?.str.value < 13) ||
            (this.activity?.actionType === "rwak" && this.actor.system.abilities?.dex.value < 13)) {
            this.disadvantage = true;
            this.attackAdvAttribution.add("DIS:heavy weapon");
            this.advReminderAttackAdvAttribution.add("DIS:Heavy Weapon");
          }
        } else if (safeGetGameSetting("dnd5e", "rulesVersion") === "legacy") {
          if (["tiny", "sm"].includes(this.actor.system.traits?.size)) {
            this.disadvantage = true;
            this.attackAdvAttribution.add("DIS:small");
            this.advReminderAttackAdvAttribution.add("DIS:Small");
          }
        }
      }
    }
    await this.checkTargetAdvantage();
  }

  async processCriticalFlags() {
    if (!this.actor) return; // in case a damage only workflow caused this.
    /*
    * flags.midi-qol.critical.all
    * flags.midi-qol.critical.mwak/rwak/msak/rsak/other
    * flags.midi-qol.noCritical.all
    * flags.midi-qol.noCritical.mwak/rwak/msak/rsak/other
    */
    // check actor force critical/noCritical
    const criticalFlags = foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.critical`) ?? {};
    const noCriticalFlags = foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.noCritical`) ?? {};
    const attackType = this.activity?.actionType;
    this.critFlagSet = false;
    this.noCritFlagSet = false;

    if (criticalFlags || noCriticalFlags) {
      //@ts-expect-error .first()
      const target: Token = this.hitTargets.first();
      const conditionData = createConditionData({ workflow: this, target, actor: this.actor });
      if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.critical.all`, conditionData)
        || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.critical.${attackType}`, conditionData)) {
        this.critFlagSet = true;
      }
      if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.noCritical.all`, conditionData)
        || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.noCritical.${attackType}`, conditionData)) {
        this.noCritFlagSet = true;
      }
    }

    // check target critical/noCritical
    if (this.hitTargets.size === 1) {
      const firstTarget = this.hitTargets.first();
      const grants = (firstTarget?.actor as Actor)?.flags[MODULE_ID]?.grants?.critical ?? {};
      const fails = (firstTarget?.actor as Actor)?.flags[MODULE_ID]?.fail?.critical ?? {};
      if (grants || fails) {
        if (Number.isNumeric(grants.range) && computeDistance(firstTarget, this.token, { wallsBlock: false }) <= Number(grants.range)) {
          this.critFlagSet = true;
        }
        const conditionData = createConditionData({ workflow: this, target: firstTarget, actor: this.actor });
        if (await evalAllConditionsAsync(firstTarget?.actor as Actor, `flags.${MODULE_ID}.grants.critical.all`, conditionData)
          || await evalAllConditionsAsync(firstTarget?.actor as Actor, `flags.${MODULE_ID}.grants.critical.${attackType}`, conditionData)) {
          this.critFlagSet = true;
        }
        if (await evalAllConditionsAsync(firstTarget?.actor as Actor, `flags.${MODULE_ID}.fail.critical.all`, conditionData)
          || await evalAllConditionsAsync(firstTarget?.actor as Actor, `flags.${MODULE_ID}.fail.critical.${attackType}`, conditionData)) {
          console.warn(`midi-qol | processCriticalFlags | ${(firstTarget?.actor as Actor).name} flags.${MODULE_ID}.fail.critical is dprecated user flags.${MODULE_ID}.grants.noCritical.all/.attackType instead`);
          this.noCritFlagSet = true;
        }
        if (await evalAllConditionsAsync(firstTarget?.actor as Actor, `flags.${MODULE_ID}.grants.noCritical.all`, conditionData)
          || await evalAllConditionsAsync(firstTarget?.actor as Actor, `flags.${MODULE_ID}.grants.noCritical.${attackType}`, conditionData)) {
          this.noCritFlagSet = true;
        }
      }
    }
    this.isCritical = this.isCritical || this.critFlagSet;
    if (this.noCritFlagSet) this.isCritical = false;
  }

  async checkAbilityAdvantage() {
    if (!["mwak", "rwak"].includes(this.activity?.actionType)) return;
    let ability = this.item?.abilityMod;
    if ("" === ability) ability = this.activity?.item?.system.properties?.has("fin") ? "dex" : "str";
    if (foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.advantage.attack.${ability}`)) {
      if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.advantage.attack.${ability}`, this.conditionData)) {
        this.advantage = true;
        this.attackAdvAttribution.add(`ADV:attack.${ability} ${foundry.utils.getProperty(this.actor, `flags.midi.evaluated.advantage.attack.${ability}`).effects.join(", ")}`);
      }
    }
    if (foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.disadvantage.attack.${ability}`)) {
      if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.disadvantage.attack.${ability}`, this.conditionData)) {
        this.disadvantage = true;
        this.attackAdvAttribution.add(`DIS:attack.${ability} ${foundry.utils.getProperty(this.actor, `flags.midi.evaluated.disadvantage.attack.${ability}`).effects.join(", ")}`);
      }
    }
  }

  async checkFlankingAdvantage(): Promise<boolean> {
    if (!canvas) {
      console.warn("midi-qol | CheckFlankingAdvantage | abandoned - no canvas defined")
      return false;
    }
    this.flankingAdvantage = false;
    if (this.item && !(["mwak", "msak", "mpak"].includes(this.activity?.actionType))) return false;
    const token = MQfromUuidSync(this.tokenUuid ?? null)?.object;
    //@ts-expect-error first
    const target: Token = this.targets.first();

    const needsFlanking = await markFlanking(token, target,);
    if (needsFlanking) {
      // this.attackAdvAttribution.add(`ADV:flanking`);
      foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.flanking", { value: true, effects: ["Flanking"] });
      // this.advReminderAttackAdvAttribution.add("ADV:flanking");
    }
    if (["advonly"].includes(checkRule("checkFlanking"))) this.flankingAdvantage = needsFlanking;
    return needsFlanking;
  }

  async checkTargetAdvantage() {
    if (!this.item) return;
    if (!this.targets?.size) return;
    const actionType = this.activity?.actionType;
    const firstTargetDocument = getTokenDocument(this.targets.first());
    const firstTarget = getToken(firstTargetDocument);
    if (!firstTargetDocument || !firstTarget) return;
    if (checkRule("nearbyAllyRanged") > 0 && ["rwak", "rsak", "rpak"].includes(actionType)) {
      if ((firstTargetDocument.width ?? 1) * (firstTargetDocument.height ?? 1) < Number(checkRule("nearbyAllyRanged"))) {
        const nearbyAlly = checkNearby(-1, firstTarget, (canvas?.dimensions?.distance ?? 5)); // targets near a friend that is not too big
        // TODO include thrown weapons in check
        if (nearbyAlly) {
          if (debugEnabled > 0) warn("checkTargetAdvantage | ranged attack with disadvantage because target is near a friend");
        }
        this.disadvantage = this.disadvantage || nearbyAlly;
        if (nearbyAlly) {
          this.attackAdvAttribution.add(`DIS:nearbyAlly`);
          this.advReminderAttackAdvAttribution.add("DIS:Nearby Ally");
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.nearbyAlly", { value: true, effects: ["Nearby Ally"] });
        }
      }
    }
    const grants = firstTargetDocument.actor?.flags[MODULE_ID]?.grants;
    if (!grants) return;
    if (!["rwak", "mwak", "rsak", "msak", "rpak", "mpak"].includes(actionType)) return;
    const attackAdvantage = grants.advantage?.attack || {};
    let grantsAdvantage;
    const conditionData = createConditionData({ workflow: this, target: this.token, actor: this.actor });
    if (grants.advantage?.all && await evalCondition(grants.advantage.all, conditionData, { errorReturn: false, async: true })) {
      grantsAdvantage = true;
      this.attackAdvAttribution.add(`ADV:grants.advantage.all ${firstTargetDocument.name}`);
    }
    if (attackAdvantage.all && await evalCondition(attackAdvantage.all, conditionData, { errorReturn: false, async: true })) {
      grantsAdvantage = true;
      this.attackAdvAttribution.add(`ADV:grants.advantage.attack.all ${firstTargetDocument.name}`);
    }
    if (attackAdvantage[actionType] && await evalCondition(attackAdvantage[actionType], conditionData, { errorReturn: false, async: true })) {
      grantsAdvantage = true;
      this.attackAdvAttribution.add(`ADV:grants.attack.${actionType} ${firstTargetDocument.name}`);
    }

    if (grants.noAdvantage?.attack?.all && await evalCondition(grants.noAdvantage.attack.all, conditionData, { errorReturn: false, async: true })) {
      grantsAdvantage = false;
      this.advantage = false;
      this.noAdvantage = true;
      this.attackAdvAttribution.add(`ADV:None grants.noAdvantage ${firstTargetDocument.name}`);
    }
    if (grants.noAdvantage?.attack && grants.noAdvantage.attack[actionType] && await evalCondition(grants.noAdvantage.attack[actionType], conditionData, { errorReturn: false, async: true })) {
      grantsAdvantage = false;
      this.advantage = false;
      this.noAdvantage = true;
      this.attackAdvAttribution.add(`ADV:None grants.noAdvantage${actionType} ${firstTargetDocument.name}`);
    }

    const attackDisadvantage = grants.disadvantage?.attack || {};
    let grantsDisadvantage;
    if (grants.disadvantage?.all && await evalCondition(grants.disadvantage.all, conditionData, { errorReturn: false, async: true })) {
      grantsDisadvantage = true;
      this.attackAdvAttribution.add(`DIS:grants.disadvantage.all ${firstTargetDocument.name}`);
    }
    if (attackDisadvantage.all && await evalCondition(attackDisadvantage.all, conditionData, { errorReturn: false, async: true })) {
      grantsDisadvantage = true;
      this.attackAdvAttribution.add(`DIS:grants.attack.all ${firstTargetDocument.name}`);
    }
    if (attackDisadvantage[actionType] && await evalCondition(attackDisadvantage[actionType], conditionData, { errorReturn: false, async: true })) {
      grantsDisadvantage = true;
      this.attackAdvAttribution.add(`DIS:grants.attack.${actionType} ${firstTargetDocument.name}`);
    }
    if (grants.noDisadvantage?.attack?.all && await evalCondition(grants.noDisadvantage.attack.all, conditionData, { errorReturn: false, async: true })) {
      grantsDisadvantage = false;
      this.disadvantage = false;
      this.noDisadvantage = true;
      this.attackAdvAttribution.add(`DIS:None grants.noDisadvantage.all ${firstTargetDocument.name}`);
    }
    if (grants.noDisadvantage?.attack && grants.noDisadvantage.attack[actionType] && await evalCondition(grants.noDisadvantage.attack[actionType], conditionData, { errorReturn: false, async: true })) {
      grantsDisadvantage = false;
      this.disadvantage = false;
      this.noDisadvantage = true;
      this.attackAdvAttribution.add(`DIS:None grants.noDisadvantage${actionType} ${firstTargetDocument.name}`);
    }
    this.advantage = this.advantage || grantsAdvantage;
    this.disadvantage = this.disadvantage || grantsDisadvantage;
  }

  async triggerTargetMacros(triggerList: string[], targets: Set<any> = this.targets, options: any = {}) {
    let results = {};
    for (let target of targets) {
      results[target.uuid ?? target.document.uuid] = [];
      let result = results[target.uuid ?? target.document.uuid];
      const actorOnUseMacros = foundry.utils.getProperty(target.actor ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
      const wasAttacked = this.activity?.attack;
      const wasHit = (this.activity ? wasAttacked : true) && (this.hitTargets?.has(target) || this.hitTargetsEC?.has(target));
      const wasMissed = (this.activity ? wasAttacked : true) && !this.hitTargets?.has(target) && !this.hitTargetsEC?.has(target);
      const wasDamaged = this.damageList
        && (this.hitTargets.has(target) || this.hitTargetsEC.has(target))
        && (this.damageList.find(dl => dl.tokenUuid === (target.uuid ?? target.document.uuid) && dl.hpDamage > 0));

      if (this.targets.has(target) && triggerList.includes("isTargeted")) {
        if (triggerList.includes("isTargeted")) {
          result.push(...await this.callMacros(this.item,
            actorOnUseMacros?.getMacros("isTargeted"),
            "TargetOnUse",
            "isTargeted",
            { actor: target.actor, token: target })
          );
        }
      }
      if (wasAttacked && triggerList.includes("isPreAttacked")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isPreAttacked"),
          "TargetOnUse",
          "isPreAttacked",
          { actor: target.actor, token: target })
        );
      }

      if (wasAttacked && triggerList.includes("isAttacked")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isAttacked"),
          "TargetOnUse",
          "isAttacked",
          { actor: target.actor, token: target })
        );
      }
      if (triggerList.includes("postTargetEffectApplication")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("postTargetEffectApplication"),
          "TargetOnUse",
          "postTargetEffectApplication",
          { actor: target.actor, token: target })
        );
      }
      // If auto applying damage can do a better test when damage application has been calculdated
      if (wasDamaged && triggerList.includes("isDamaged") && !configSettings.autoApplyDamage.toLocaleLowerCase().includes("yes")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isDamaged"),
          "TargetOnUse",
          "isDamaged",
          { actor: target.actor, token: target })
        );
      }
      if (wasHit && triggerList.includes("isHit")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isHit"),
          "TargetOnUse",
          "isHit",
          { actor: target.actor, token: target })
        );
      }
      if (wasMissed && triggerList.includes("isMissed")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isMissed"),
          "TargetOnUse",
          "isMissed",
          { actor: target.actor, token: target })
        );
      }
      if (triggerList.includes("preTargetDamageApplication")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("preTargetDamageApplication"),
          "TargetOnUse",
          "preTargetDamageApplication",
          { actor: target.actor, token: target })
        );
      }

      if (this.activityHasSave && triggerList.includes("preTargetSave")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("preTargetSave"),
          "TargetOnUse",
          "preTargetSave",
          { actor: target.actor, token: target })
        );
      }

      if (this.activityHasSave && triggerList.includes("isAboutToSave")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isAboutToSave"),
          "TargetOnUse",
          "isAboutToSave",
          { actor: target.actor, token: target })
        );
      }

      if (target.actor?.uuid !== this.actor.uuid && triggerList.includes("1Reaction")) {
      }
      if (this.activityHasSave && triggerList.includes("isSaveSuccess") && (this.saves.has(target) || options.saved === true)) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isSaveSuccess"),
          "TargetOnUse",
          "isSaveSuccess",
          { actor: target.actor, token: target })
        );
      }
      if (this.activityHasSave && triggerList.includes("isSaveFailure") && (!this.saves.has(target) || options.saved === false)) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isSaveFailure"),
          "TargetOnUse",
          "isSaveFailure",
          { actor: target.actor, token: target })
        );
      }
      if (this.activityHasSave && triggerList.includes("isSave")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isSave"),
          "TargetOnUse",
          "isSave",
          { actor: target.actor, token: target })
        );
      }
    }
    return results;
  }

  async expireTargetEffects(expireList: string[]) {
    if (debugEnabled > 0) warn(`expireTargetEffects | ${expireList}`)
    for (let target of this.targets) {
      const expiryReason: string[] = [];
      const appliedEffects = getAppliedEffects(target?.actor, { includeEnchantments: true });
      if (!appliedEffects) continue; // nothing to expire
      const expiredEffects: (string | null)[] = appliedEffects.filter(ef => {
        let wasExpired = false;
        const specialDuration = foundry.utils.getProperty(ef.flags, "dae.specialDuration");
        if (!specialDuration) return false;
        const wasAttacked = this.activity?.attack;
        //TODO this test will fail for damage only workflows - need to check the damage rolled instead
        const wasHit = (this.item ? wasAttacked : true) && (this.hitTargets?.has(target) || this.hitTargetsEC?.has(target));
        const wasDamaged = this.damageList
          // consider removing this - by having it here hand editing hp wont expire effects
          // but any damage application by an item will get picked up in applyTokenDamageMany
          // so this is only relevant if you are not auto applying damage
          && (this.hitTargets.has(target) || this.hitTargetsEC.has(target))
          //@ts-expect-error token.document
          && (this.damageList.find(dl => dl.tokenUuid === (target.uuid ?? target.document.uuid) && dl.hpDamage > 0));
        //@ts-expect-error target.dcoument
        const wasHealed = this.damageList && (this.damageList.find(dl => dl.tokenUuid === (target.uuid ?? target.document.uuid) && dl.hpDamage < 0))
        //TODO this is going to grab all the special damage types as well which is no good.
        if (wasAttacked && expireList.includes("isAttacked") && specialDuration.includes("isAttacked")) {
          wasExpired = true;
          expiryReason.push("isAttacked")
        }
        if (wasHit && this.isCritical && expireList.includes("isAttacked") && specialDuration.includes("isHitCritical")) {
          wasExpired = true;
          expiryReason.push("isHitCritical")
        }
        // If auto applying damage can do a better test when damage application has been calculdated
        if (wasDamaged && expireList.includes("isDamaged") && !configSettings.autoApplyDamage.toLocaleLowerCase().includes("yes")
          && specialDuration.includes("isDamaged")) {
          wasExpired = true;
          expiryReason.push("isDamaged");
        }
        // If auto applying damage can do a better test when damage application has been calculdated
        if (wasHealed && expireList.includes("isHealed") && !configSettings.autoApplyDamage.toLocaleLowerCase().includes("yes")
          && specialDuration.includes("isHealed")) {
          wasExpired = true;
          expiryReason.push("isHealed");
        }
        if (wasHit && expireList.includes("isHit") && specialDuration.includes("isHit")) {
          wasExpired = true;
          expiryReason.push("isHit");

        }
        if (((target.actor as Actor)?.uuid !== this.actor.uuid && expireList.includes("1Reaction") && specialDuration.includes("1Reaction"))) {
          wasExpired = true;
          expiryReason.push("1Reaction");
        }
        if (this.rawDamageDetail) for (let dt of this.rawDamageDetail) {
          if (expireList.includes(`isDamaged`) && (wasDamaged || dt.type === "healing") && specialDuration.includes(`isDamaged.${dt.type}`)) {
            wasExpired = true;
            expiryReason.push(`isDamaged.${dt.type}`);
            break;
          }
        }
        if (!this.item) return wasExpired;
        if ((this.activity.save || this.activity.check) && expireList.includes("isSaveSuccess") && specialDuration.includes(`isSaveSuccess`) && this.saves.has(target)) {
          wasExpired = true;
          expiryReason.push(`isSaveSuccess`);
        }
        if ((this.activity.save || this.activity.check) && expireList.includes("isSaveFailure") && specialDuration.includes(`isSaveFailure`) && !this.saves.has(target)) {
          wasExpired = true;
          expiryReason.push(`isSaveFailure`);
        }
        if ((this.activity.save || this.activity.check) && expireList.includes("isSave") && specialDuration.includes(`isSave`)) {
          wasExpired = true;
          expiryReason.push(`isSave`);
        }
        const abl = this.activity?.save?.ability ?? this.activity?.check?.ability;
        if ((this.activity.save || this.activity.check) && expireList.includes(`isSaveSuccess`) && specialDuration.includes(`isSaveSuccess.${abl}`) && this.saves.has(target)) {
          wasExpired = true;
          expiryReason.push(`isSaveSuccess.${abl}`);
        };
        if ((this.activity.save || this.activity.check) && expireList.includes(`isSaveFailure`) && specialDuration.includes(`isSaveFailure.${abl}`) && !this.saves.has(target)) {
          wasExpired = true;
          expiryReason.push(`isSaveFailure.${abl}`);
        };
        if ((this.activity.save || this.activity.check) && expireList.includes(`isSave`) && specialDuration.includes(`isSave.${abl}`)) {
          wasExpired = true;
          expiryReason.push(`isSave.${abl}`);
        };
        return wasExpired;
      }).map(ef => ef.uuid);
      if (expiredEffects.length > 0) {
        await timedAwaitExecuteAsGM("removeEffectUuids", {
          actorUuid: (target.actor as Actor)?.uuid,
          effects: expiredEffects,
          options: { "expiry-reason": `midi-qol:${expiryReason}` }
        });
      }
    }
  }

  getDamageBonusMacros(): string | undefined {
    const actorMacros = foundry.utils.getProperty(this.actor.flags, `${game.system?.id}.DamageBonusMacro`);
    const itemMacros = this.onUseMacros?.getMacros("damageBonus")
    if (!itemMacros?.length) return actorMacros;
    if (!actorMacros?.length) return itemMacros;
    return `${actorMacros},${itemMacros}`;
  }

  async rollBonusDamage(damageBonusMacro) {
    const extraDamages: (damageBonusMacroResult | undefined | boolean)[] = await this.callMacros(this.item, damageBonusMacro, "DamageBonus", "DamageBonus");
    if (!extraDamages) return;
    let rolls: Roll[] = [];
    try {
      for (let damageEntries of extraDamages) {
        if (!damageEntries || typeof damageEntries === "boolean") continue;
        if (!(damageEntries instanceof Array)) damageEntries = [damageEntries];
        for (let de of damageEntries) {
          if (!de) continue;
          let damageEntries: any = de;
          if (!(de instanceof Array)) damageEntries = [de];
          for (let damageEntry of damageEntries) {
            if (damageEntry instanceof Roll) {
              rolls.push(damageEntry)
            } else {
              let { damageRoll, damageType, flavor } = damageEntry;
              if (!damageRoll) continue;
              damageType = getDamageType(damageType);
              if (!damageType && flavor && getDamageType(flavor)) damageType = getDamageType(flavor);
              // @ts-expect-error no dnd5e-types
              if (!damageType && this.damageRolls) damageType = this.damageRolls[0].options?.type;
              if (!damageType) damageType = MQdefaultDamageType;

              const rollOptions = {
                type: damageType,
                flavor: flavor ?? damageType,
              }
              //@ts-expect-error
              rolls.push(await new CONFIG.Dice.DamageRoll(damageRoll, this.item?.getRollData() ?? this.actor.getRollData(), rollOptions).evaluate());
            }
          }
        }
      }
      await this.setBonusDamageRolls(rolls);
    } catch (err) {
      const message = `midi-qol | rollBonusDamage | error in evaluating${extraDamages} in bonus damage`
      TroubleShooter.recordError(err, message);
      console.warn(message, err);
      this.bonusDamageRolls = undefined;
      this.rawBonusDamageDetail = [];
    }
    if (this.bonusDamageRolls && this.workflowOptions?.damageRollDSN !== false) {
      await displayDSNForRoll(this.bonusDamageRolls, "damageRoll");
    }
    return;
  }

  macroDataToObject(macroData: any): any {
    const data = macroData
    for (let documentsName of ["targets", "failedSaves", "criticalSaves", "fumbleSaves", "saves", "superSavers", "semiSuperSavers"]) {
      delete data[documentsName];
    }
    data.actorUuid = data.actor?.uuid;
    delete data.actor;
    data.itemUuid = data.item?.uuid;
    delete data.item;
    delete data.workflow;
    return data;
  }

  getSafeMacroData(item: Item | undefined, options: any = {}): any {
    const niceData = this.getMacroData(item, options);
    let naughtyFields = ["actor", "workflow", "targets", "failedSaves", "criticalSaves", "fumbleSaves", "hitTargets", "hitTargetsEC", "saves", "superSavers", "semiSuperSavers"];
    for (let field of naughtyFields) delete niceData[field];
    return niceData;
  }

  getMacroData(item: Item | undefined, options: any = {}): any {
    if (!item) item = this.item;
    let targets: TokenDocument[] = [];
    let targetUuids: string[] = []
    let failedSaves: TokenDocument[] = [];
    let criticalSaves: TokenDocument[] = [];
    let criticalSaveUuids: string[] = [];
    let fumbleSaves: TokenDocument[] = [];
    let fumbleSaveUuids: string[] = [];
    let failedSaveUuids: string[] = [];
    let hitTargets: TokenDocument[] = [];
    let hitTargetsEC: TokenDocument[] = [];
    let hitTargetUuidsEC: string[] = [];
    let hitTargetUuids: string[] = [];
    let saves: TokenDocument[] = [];
    let saveUuids: string[] = [];
    let superSavers: TokenDocument[] = [];
    let superSaverUuids: string[] = [];
    let semiSuperSavers: TokenDocument[] = [];
    let semiSuperSaverUuids: string[] = [];
    for (let target of this.targets) {
      // @ts-expect-error v13ism
      if (target instanceof foundry.canvas.placeables.Token) {
        // TODO: remove these `as` once types understands `foundry.canvas.placeables.Token`
        targets.push((target as Token).document as unknown as TokenDocument);
        targetUuids.push((target as Token).document.uuid);
      } else {
        // TODO: same thing
        targets.push(target as TokenDocument);
        targetUuids.push((target as TokenDocument).uuid);
      }
    }
    for (let save of this.saves) {
      if (save instanceof TokenDocument) {
        saves.push(save);
        saveUuids.push(save.uuid);
      } else {
        saves.push(save.document as unknown as TokenDocument);
        saveUuids.push(save.document.uuid);
      }
    }
    for (let hit of this.hitTargets) {
      const htd = getTokenDocument(hit);
      if (htd) {
        hitTargets.push(htd);
        hitTargetUuids.push(htd.uuid);
      }
    }
    for (let hit of this.hitTargetsEC) {
      const htd = getTokenDocument(hit);
      if (htd) {
        hitTargetsEC.push(htd);
        hitTargetUuidsEC.push(htd.uuid);
      }
    }

    for (let failed of this.failedSaves) {
      // @ts-expect-error v13ism
      failedSaves.push(failed instanceof foundry.canvas.placeables.Token ? failed.document as unknown as TokenDocument : failed);
      // @ts-expect-error v13ism
      failedSaveUuids.push(failed instanceof foundry.canvas.placeables.Token ? failed.document?.uuid : failed.uuid);
    }
    for (let critical of this.criticalSaves) {
      // @ts-expect-error v13ism
      criticalSaves.push(critical instanceof foundry.canvas.placeables.Token ? critical.document as unknown as TokenDocument : critical);
      // @ts-expect-error v13ism
      criticalSaveUuids.push(critical instanceof foundry.canvas.placeables.Token ? critical.document?.uuid : critical.uuid);
    }
    for (let fumble of this.fumbleSaves) {
      // @ts-expect-error v13ism
      fumbleSaves.push(fumble instanceof foundry.canvas.placeables.Token ? fumble.document as unknown as TokenDocument : fumble);
      // @ts-expect-error v13ism
      fumbleSaveUuids.push(fumble instanceof foundry.canvas.placeables.Token ? fumble.document?.uuid : fumble.uuid);
    }
    for (let save of this.superSavers) {
      // @ts-expect-error v13ism
      superSavers.push(save instanceof foundry.canvas.placeables.Token ? save.document as unknown as TokenDocument : save);
      // @ts-expect-error v13ism
      superSaverUuids.push(save instanceof foundry.canvas.placeables.Token ? save.document?.uuid : save.uuid);
    };
    for (let save of this.semiSuperSavers) {
      // @ts-expect-error v13ism
      semiSuperSavers.push(save instanceof foundry.canvas.placeables.Token ? save.document as unknown as TokenDocument : save);
      // @ts-expect-error v13ism
      semiSuperSaverUuids.push(save instanceof foundry.canvas.placeables.Token ? save.document?.uuid : save.uuid);
    };
    const itemData: any = item?.toObject(false) ?? {};
    itemData.uuid = item?.uuid; // provide the uuid so the actual item can be recovered
    //@ts-expect-error no dnd5e-types
    Object.defineProperty(itemData, "actionType", { get() { return item?.actionType } });
    return {
      actor: this.actor,
      actorData: this.actor.toObject(false),
      actorUuid: this.actor.uuid,
      advantage: this.advantage,
      attackD20: this.diceRoll,
      attackRoll: this.attackRoll,
      attackTotal: this.attackTotal,
      bonusDamageDetail: this.rawBonusDamageDetail,
      bonusDamageHTML: this.bonusDamageHTML,
      bonusDamageRolls: this.bonusDamageRolls,
      bonusDamageRoll: this.bonusDamageRoll,
      bonusDamageTotal: this.bonusDamageTotal,
      criticalSaves,
      criticalSaveUuids,
      damageDetail: this.rawDamageDetail,
      damageList: this.damageList,
      damageRoll: this.damageRoll,
      damageRolls: this.damageRolls,
      damageTotal: this.damageTotal,
      diceRoll: this.diceRoll,
      disadvantage: this.disadvantage,
      event: this.event,
      failedSaves,
      failedSaveUuids,
      fumbleSaves,
      fumbleSaveUuids,
      hitTargets,
      hitTargetsEC,
      hitTargetUuids,
      hitTargetUuidsEC,
      id: this.id,
      isCritical: this.rollOptions.isCritical || this.isCritical || this.workflowOptions.isCritical,
      isFumble: this.isFumble,
      item: itemData,
      itemCardUuid: this.itemCardUuid,
      itemData,
      itemUuid: item?.uuid,
      otherDamageDetail: this.rawOtherDamageDetail,
      otherDamageList: this.otherDamageList,
      otherDamageTotal: this.otherDamageTotal,
      powerLevel: game.system?.id === "sw5e" ? this.spellLevel : undefined,
      rollData: (item ?? this.actor).getRollData(),
      rollOptions: this.rollOptions,
      saves,
      saveUuids,
      semiSuperSavers,
      semiSuperSaverUuids,
      castLevel: this.spellLevel,
      spellLevel: this.spellLevel,
      superSavers,
      superSaverUuids,
      targets,
      targetUuids,
      templateId: this.templateId, // deprecated
      templateUuid: this.templateUuid,
      tokenUuid: this.tokenUuid,
      uuid: this.itemUuid, // deprecated
      workflowOptions: this.workflowOptions,
      castData: this.castData,
      workflow: this,
      workflowId: this.id
    }
  }

  async callMacros(item: Item | undefined, macros: string | undefined, tag: string, macroPass: string, options: any = {}): Promise<(damageBonusMacroResult | boolean | undefined)[]> {
    if (!macros || macros?.length === 0) return [];
    const macroNames = macros.split(",").map(s => s.trim());
    let values: Promise<damageBonusMacroResult | any>[] = [];
    const macroData = this.getMacroData(item ?? this.item);
    macroData.workflow = this;
    macroData.options = options;
    macroData.tag = tag;
    macroData.macroPass = macroPass;
    this.macroPass = macroPass;
    this.tag = tag;
    if (debugEnabled > 1) {
      log("callMacros | calling", macros, "for", macroPass, "with", macroData);
    }
    for (let macro of macroNames) {
      if (macroNames.length > 0 && debugEnabled > 0) {
        warn(`callMacro | "${macro}" called for ${macroPass} ${item?.name} ${item?.uuid}`);
      }
      values.push(this.callMacro(item, macro, macroData, options).catch((err) => {
        const message = `midi-qol | called macro error in ${item?.name} ${item?.uuid} macro ${macro}`;
        console.warn(message, err);
        TroubleShooter.recordError(err, message);
        return undefined
      }));
      if (this.activity?.otherActivity) {
        values.push(this.callMacro(item, macro, macroData, foundry.utils.mergeObject(options, { otherActivityOnly: true }, { inplace: false })).catch((err) => {
          const message = `midi-qol | called macro error in ${item?.name} ${item?.uuid} macro ${macro}`;
          console.warn(message, err);
          TroubleShooter.recordError(err, message);
          return undefined
        }));

      }
    }
    let results: Array<damageBonusMacroResult | any> = await Promise.allSettled(values);
    if (debugEnabled === 1 && results.length) warn("callMacros | macro data ", macroData);
    results = results.map(p => p.value);
    return results;
  }


  async callMacro(item, macroName: string, macroData: any, options: any): Promise<damageBonusMacroResult | any> {
    let [name, uuid] = macroName?.trim().split("|");
    let macroItem = item;
    let macroActivity = this.activity;
    let macroEntity;
    if (uuid?.length > 0) {
      // @ts-expect-error
      macroEntity = await fromUuid(uuid);
    }
    if (macroEntity) {
      if (macroEntity instanceof ActiveEffect && macroEntity.parent instanceof Item) {
        macroItem = macroEntity.parent;
      } else if (macroEntity instanceof Item) {
        macroItem = macroEntity
      } else if (macroEntity.item) { // it points to an activity
        macroActivity = macroEntity;
        macroItem = macroEntity.item;
      }
    }
    if (options.otherActivityOnly) {
      if (!this.activity?.otherActivity || name !== "ActivityMacro") return;
      macroActivity = this.activity.otherActivity;
      macroItem = this.item;
    } else
      macroActivity = this.activity;
    let macro;
    let itemMacroData;
    const actorToUse = options.actor ?? this.actor;
    const rolledItem = item;

    try {
      if (macroItem?.macro && ["ItemMacro", MQItemMacroLabel].includes(name)) {
        macro = macroItem.macro;
      } else {
        if (!name) return undefined;
        if (name.startsWith("function.")) {
          macroActivity = undefined;
          let [func, uuid] = name.split("|");
          itemMacroData = {
            name: "function call",
            type: "script",
            command: `return await ${func.replace("function.", "").trim()}({ speaker, actor, token, character, item, rolledItem, macroItem, args, scope, workflow })`
          };
        } else if (name.startsWith(MQItemMacroLabel) || name.startsWith("ItemMacro")) {
          // ItemMacro
          // ItemMacro.ItemName
          // ItemMacro.uuid
          if (name === MQItemMacroLabel || name === "ItemMacro") { // TODO this should not occur so remove it
            if (!macroItem) return {};
            itemMacroData = foundry.utils.getProperty(macroItem, "flags.dae.macro") ?? foundry.utils.getProperty(macroItem, "flags.itemacro.macro");
            macroData.sourceItemUuid = macroItem?.uuid;
          } else {
            const parts = name.split(".");
            const itemNameOrUuid = parts.slice(1).join(".");
            // @ts-expect-error
            macroItem = await fromUuid(itemNameOrUuid); // item or activity
            if (macroItem instanceof ActiveEffect && macroItem.parent instanceof Item)
              macroItem = macroItem.parent;
            else if (macroItem?.item) macroItem = macroItem.item;
            // ItemMacro.name
            if (!macroItem) macroItem = actorToUse.items.find(i => i.name === itemNameOrUuid && (foundry.utils.getProperty(i.flags, "dae.macro") ?? foundry.utils.getProperty(i.flags, "itemacro.macro")))
            if (!macroItem && actorToUse instanceof Actor && uuid) {
              let itemId;
              if (uuid.includes("Activity."))
                itemId = uuid.split(".").slice(-3)[0];
              else if (uuid.includes("ActiveEffect."))
                itemId = uuid.split(".").slice(-3)[0];
              else
                itemId = uuid.split(".").slice(-1)[0];
              // @ts-expect-error can't know about flags
              const itemData = actorToUse.effects.find(effect => effect.flags.dae?.itemData?._id === itemId)?.flags.dae.itemData;
              if (itemData) macroItem = itemData;
            } else if (!macroItem) {
              console.warn("midi-qol | callMacro | No item for", name);
              return {};
            }
            itemMacroData = foundry.utils.getProperty(macroItem.flags, "dae.macro") ?? foundry.utils.getProperty(macroItem.flags, "itemacro.macro");
            macroData.sourceItemUuid = macroItem.uuid;
          }
        } else if (name.startsWith(MQActivityMacroLabel) || name.startsWith("ActivityMacro")) {
          // ActivityMacro
          // ActivityMacro.uuid
          // ActivityMacro.identifier
          // ActivityMacro.ActivityName
          if (name === MQActivityMacroLabel || name === "ActivityMacro") {
            if (!macroActivity) return {};
            macro = macroActivity.macro;
          } else {
            const parts = name.split(".");
            const activitySpec = parts.slice(1).join(".");
            let itemToUse = macroItem;
            macroItem = item;
            if (!macro) {
              // @ts-expect-error
              const activityOrItem: any = (activitySpec) ? await fromUuid(activitySpec) : macroActivity;
              if (activityOrItem instanceof Item)
                itemToUse = activityOrItem;
              else itemToUse = activityOrItem?.item ?? macroItem;
              // ActivityMacro.name or ActivityMacro.uuid where not found by fromUuid
              if (activityOrItem?.macro?.command) {
                macro = activityOrItem.macro;
                macroActivity = activityOrItem
              }
              const itemId = parts.at(-1);
              if (!macro?.command) {
                macroActivity = itemToUse.system.activities?.find(activity => activity.identifier === itemId);
                if (macroActivity?.macro?.command)
                  macro = macroActivity.macro;
              }
              if (!macro?.command) {
                macroActivity = itemToUse.system.activities?.find(activity => activity._id === itemId);
                if (macroActivity?.macro?.command)
                  macro = macroActivity.macro;
              }
              if (!macro?.command) {
                macroActivity = itemToUse.system.activities?.find(activity => activity.name === itemId);
                if (macroActivity?.macro.command) macro = macroActivity.macro;
              }
              if (!macro?.command && activityOrItem instanceof Item) {
                macroActivity ??= itemToUse.system.activities?.contents[0];
                if (macroActivity?.macro) macro = macroActivity.macro;
              }
              else if (!macro?.command) {
                macroActivity ??= activityOrItem;
                macro = macroActivity?.macro;
              }
            }
            macroData.sourceItemUuid = itemToUse.uuid;
            macroItem = itemToUse;
          }
        } else { // get a world/compendium macro.
          if (name.startsWith("Macro.")) name = name.replace("Macro.", "");
          macro = game.macros?.getName(name)
          if (!macro) {
            // @ts-expect-error
            const itemOrMacro = await fromUuid(name);
            if (itemOrMacro instanceof Item) {
              macroData.sourceItemUuid = itemOrMacro.uuid;
              itemMacroData = foundry.utils.getProperty(itemOrMacro, "flags.dae.macro") ?? foundry.utils.getProperty(itemOrMacro, "flags.itemacro.macro");
            } else if (itemOrMacro instanceof Macro) macro = itemOrMacro;
          }

          if (macro?.type === "chat") {
            macro.execute(); // use the core foundry processing for chat macros
            return {}
          }
        }

        if (!itemMacroData && !macro) {
          const message = `Could not find item/macro ${name}`;
          TroubleShooter.recordError(new Error(message), message);
          ui.notifications?.error(`midi-qol | Could not find macro ${name} does not exist`);
          return undefined;
        }

        if (itemMacroData) {
          if (!itemMacroData.command) itemMacroData = itemMacroData.data;
          if (!itemMacroData?.command) {
            if (debugEnabled > 0) warn(`callMacro | could not find item macro ${name}`);
            return {};
          }
        }
      }
      macroData.speaker = this.speaker;
      macroData.actor = actorToUse;
      if (!macro) {
        itemMacroData = foundry.utils.mergeObject({ name: "midi generated macro", type: "script", command: "" }, itemMacroData);
        const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        itemMacroData.ownership = { default: OWNER };
        itemMacroData.author = game.user?.id;
        macro = new CONFIG.Macro.documentClass(itemMacroData);
      }
      if (!macro?.command) return undefined;
      const speaker = this.speaker;
      const actor = actorToUse;
      const token = tokenForActor(actorToUse)
      const args = [macroData];

      const scope: any = {};
      scope.workflow = this;
      scope.rolledActivity = this.activity;
      scope.macroActivity = macroActivity;
      scope.item = rolledItem;
      scope.rolledItem = rolledItem;
      scope.macroItem = macroItem ?? rolledItem;
      scope.args = args;
      scope.options = options;
      scope.actor = actor;
      scope.token = token;
      scope.midiData = macroData;
      return macro.execute(scope);
    } catch (err) {
      TroubleShooter.recordError(err, "callMacro: Error evaluating macro");
      ui.notifications?.error(`There was an error running your macro. See the console(F12) for details`);
      error("Error evaluating macro ", err)
    }
    return {};
  }

  async removeEffectsButton() {
    if (!this.itemCardUuid) return;
    const chatMessage = this.chatCard;
    if (chatMessage?.content) {
      const buttonRe = /<button[^>]*?data-action="midiApplyEffects"[\s\S]*?<\/button>/;
      let content: any = foundry.utils.duplicate(chatMessage.content);
      content = content?.replace(buttonRe, "");
      await this.performDebouncedUpdate(chatMessage, { content });
    }
  }
  async displayUtilityRolls(displayOptions: any = {}) {
    const chatMessage = this.chatCard;
    let content = chatMessage && foundry.utils.duplicate(chatMessage.content);
    const flags = chatMessage?.flags || {};
    let newFlags = {};

    if (chatMessage) { // display the attack roll
      const utilityRoll = this.utilityRoll; // will concat as needed
      //let searchRe = /<div class="midi-qol-attack-roll">.*?<\/div>/;
      let searchRe = /<div class="midi-qol-utility-roll"[\s\S]*?<div class="end-midi-qol-utility-roll">/
      const rollString = i18n(`${this.systemString}.UTILITY.Title`);
      let replaceString = `<div class="midi-qol-utility-roll"><div style="text-align:center" >${rollString}</div>${this.utilityRollHTML}<div class="end-midi-qol-utility-roll">`
      content = content.replace(searchRe, replaceString);
      if (debugEnabled > 0) warn("displayUtilityRoll |", this.utilityRoll)
      newFlags = foundry.utils.mergeObject(flags, {
        "midi-qol":
        {
          type: MESSAGE_TYPES.OTHER,
          // roll: utilityRoll?.roll,
        }
      }, { overwrite: true, inplace: false }
      )
    }
    // for active defence, this.attackRoll is undefined, thus create the array like this to prevent errors further on
     const rolls = [...(this.attackRoll ? [this.attackRoll] : []), 
                    ...(this.utilityRoll ? [this.utilityRoll] : []),
                    ...(this.extraRolls ?? [])];
    // const rolls = [...(this.attackRoll ? [this.attackRoll] : []), ...(this.extraRolls ?? [])];
    await this.performDebouncedUpdate(chatMessage, { content, flags: newFlags, rolls }, true);
  }

  async displayAttackRoll(displayOptions: any = {}) {
    const chatMessage = this.chatCard;
    let content = chatMessage && foundry.utils.duplicate(chatMessage.content);
    const flags = chatMessage?.flags || {};
    let newFlags = {};

    if (game.user?.isGM && this.useActiveDefence) {
      const searchRe = /<div class="midi-qol-attack-roll"[\s\S]*?<div class="end-midi-qol-attack-roll">/;
      let DCString = "DC";
      if (game.system?.id === "dnd5e") {
        DCString = i18n(`${this.systemString}.AbbreviationDC`) ?? "DC";
      } else if (i18n("SW5E.AbbreviationDC") !== "SW5E.AbbreviationDC") {
        DCString = i18n("SW5E.AbbreviationDC") ?? "DC";
      }
      const attackString = `<label class="midi-qol-saveDC">${DCString} ${this.activeDefenceDC}</label> ${i18n("midi-qol.ActiveDefenceString")}`;
      const replaceString = `<div class="midi-qol-attack-roll"> <div style="text-align:center"> ${attackString} </div><div class="end-midi-qol-attack-roll">`;
      content = content.replace(searchRe, replaceString);
      const targetUuids = Array.from(this.targets).map(t => getTokenDocument(t)?.uuid);
      newFlags = foundry.utils.mergeObject(flags, {
        "midi-qol":
        {
          isHit: this.hitTargets.size > 0,
          isHitEC: this.hitTargetsEC.size > 0,
        },
        [WorkflowDataFlags.isCritical]: this.isCritical,
        [WorkflowDataFlags.isFumble]: this.isFumble,
        [WorkflowDataFlags.targets]: Array.from(this.targets).map(t => getTokenDocument(t)?.uuid),
        [WorkflowDataFlags.hitTargets]: Array.from(this.hitTargets).map(t => getTokenDocument(t)?.uuid),
        [WorkflowDataFlags.hitTargetsEC]: Array.from(this.hitTargetsEC).map(t => getTokenDocument(t)?.uuid),
      }, { overwrite: true, inplace: false });
    }
    if (chatMessage) { // display the attack roll
      let searchRe = /<div class="midi-qol-attack-roll"[\s\S]*?<div class="end-midi-qol-attack-roll">/
      let options: any = this.attackRoll?.terms[0].options;
      // @ts-expect-error no dnd5e-types
      const advantageMode = this.attackRoll?.options?.advantageMode;
      if (advantageMode !== undefined) {
        this.advantage = advantageMode === 1;
        this.disadvantage = advantageMode === -1;
      } else {
        this.advantage = options.advantage;
        this.disadvantage = options.disadvantage;
      }
      // const attackString = this.advantage ? i18n(`${this.systemString}.Advantage`) : this.disadvantage ? i18n(`${this.systemString}.Disadvantage`) : i18n(`${this.systemString}.Attack`)

      let attackString = this.advantage ? i18n(`${this.systemString}.Advantage`) : this.disadvantage ? i18n(`${this.systemString}.Disadvantage`) : i18n(`${this.systemString}.Attack`)
      if (configSettings.addFakeDice) // addFakeDice => roll 2d20 always - don't show advantage/disadvantage or players will know the 2nd d20 is fake
        attackString = i18n(`${this.systemString}.Attack`);

      let replaceString = `<div class="midi-qol-attack-roll"><div style="text-align:center" >${attackString}</div>${this.attackRollHTML}<div class="end-midi-qol-attack-roll">`

      content = content.replace(searchRe, replaceString);
      if (this.attackRollCount > 1) {
        const attackButtonRe = /<button data-action="attack" style="flex:3 1 0">(\[\d*\] )*([^<]+)<\/button>/;
        const match = content.match(attackButtonRe);
        content = content.replace(attackButtonRe, `<button data-action="attack" style="flex:3 1 0">[${this.attackRollCount}] $2</button>`);
        const confirmButtonRe = /<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">(\[[\d ]*\])*([^<]+)<\/button>/;
        content = content.replace(confirmButtonRe, `<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">[${this.attackRollCount} ${this.damageRollCount + 1}] $2</button>`);
      }

      if (this.attackRoll?.dice.length) {
        const d: any = this.attackRoll.dice[0]; // should be a dice term but DiceTerm.options not defined
        const isD20 = (d.faces === 20);
        if (isD20) {
          if (this.isCritical) {
            content = content.replace('dice-total', 'dice-total critical');
          } else if (this.isFumble) {
            content = content.replace('dice-total', 'dice-total fumble');
          } else if (d.options.target) {
            if ((this.attackRoll?.total || 0) >= d.options.target) content = content.replace('dice-total', 'dice-total success');
            else content = content.replace('dice-total', 'dice-total failure');
          }
          this.d20AttackRoll = d.total;
        }
      }
      if (debugEnabled > 0) warn("displayAttackRoll |", this.attackRoll)
      newFlags = foundry.utils.mergeObject(flags, {
        "midi-qol": {
          GMOnlyAttackRoll: displayOptions.GMOnlyAttackRoll ?? false,
          //@ts-expect-error no dnd5e types
          isHit: configSettings.autoCheckHit === "none" ? (this.attackRoll?.isSuccess ?? false) : this.hitTargets.size > 0,
          isHitEC: this.hitTargetsEC.size > 0,
          // roll: this.attackRoll,
          type: MESSAGE_TYPES.ATTACK,
        },
        [WorkflowDataFlags.d20AttackRoll]: this.d20AttackRoll,
        [WorkflowDataFlags.hitTargets]: Array.from(this.hitTargets).map(t => getTokenDocument(t)?.uuid),
        [WorkflowDataFlags.hitTargetsEC]: Array.from(this.hitTargetsEC).map(t => getTokenDocument(t)?.uuid),
        [WorkflowDataFlags.isCritical]: this.isCritical,
        [WorkflowDataFlags.isFumble]: this.isFumble,
        [WorkflowDataFlags.targets]: Array.from(this.targets).map(t => getTokenDocument(t)?.uuid),

      }, { overwrite: true, inplace: false }
      )
    }
    // for active defence, this.attackRoll is undefined, thus create the array like this to prevent errors further on
    const rolls = [...(this.attackRoll ? [this.attackRoll] : []), ...(this.extraRolls ?? [])];
    await this.performDebouncedUpdate(chatMessage, { content, flags: newFlags, rolls }, true);

  }

  async displayDamageRolls() {
    const chatMessage = this.chatCard;
    if (!chatMessage) {
      const message = `midi-qol | displayDamageRolls | no chat message to display damage rolls`;
      console.warn(message);
      TroubleShooter.recordError(new Error(message), message);
      return;
    }
    let content = (chatMessage && foundry.utils.duplicate(chatMessage.content)) ?? "";
    if ((getRemoveDamageButtons(this.item) && configSettings.confirmAttackDamage === "none") || this.workflowType === "TrapWorkflow") {
      const damageRe = /<button[^>]*?data-action="damage">[\s\S]*<\/button>/
      const formulaRe = /<button[^>]*?data-action="rollFormula"[\s\S]*?\/button>/
      content = content?.replace(damageRe, "<div></div>")
      content = content?.replace(formulaRe, "")
    }
    var newFlags = chatMessage?.flags || {};
    if (chatMessage) {
      if (this.damageRollHTML) {
        if (!this.useOther) {
          const searchRe = /<div[^>]*?class="midi-qol-damage-roll"[\s\S]*?<div class="end-midi-qol-damage-roll">/;
          const replaceString = `<div class="midi-qol-damage-roll"><div style="text-align:center">${this.damageFlavor}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-damage-roll">`
          content = content.replace(searchRe, replaceString);
        } else {
          const otherSearchRe = /<div[^>]*? class="midi-qol-other-damage-roll"[\s\S]*?<div class="end-midi-qol-other-damage-roll">/;
          const otherReplaceString = `<div class="midi-qol-other-damage-roll"><div style="text-align:center">${this.damageFlavor}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-other-damage-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.otherDamageRollHTML) {
          const otherSearchRe = /<div[^>]*?class="midi-qol-other-damage-roll"[\s\S]*?<div class="end-midi-qol-other-damage-roll">/;
          const otherReplaceString = `<div class="midi-qol-other-damage-roll"><div style="text-align:center" >${this.otherDamageFlavor}${this.otherDamageRollHTML || ""}</div><div class="end-midi-qol-other-damage-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.bonusDamageRolls) {
          const bonusSearchRe = /<div[^>]*?class="midi-qol-bonus-damage-roll"[\s\S]*?<div class="end-midi-qol-bonus-damage-roll">/;
          const bonusReplaceString = `<div class="midi-qol-bonus-damage-roll"><div style="text-align:center" >${this.bonusDamageFlavor}${this.bonusDamageHTML || ""}</div><div class="end-midi-qol-bonus-damage-roll">`
          content = content.replace(bonusSearchRe, bonusReplaceString);
        }
      } else {
        if (this.otherDamageRollHTML) {
          const otherSearchRe = /<div[^>]*?class="midi-qol-damage-roll"[\s\S]*?<div class="end-midi-qol-damage-roll">/;
          const otherReplaceString = `<div class="midi-qol-damage-roll"><div style="text-align:center">${this.otherDamageFlavor}</div>${this.otherDamageRollHTML || ""}<div class="end-midi-qol-damage-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.bonusDamageRolls) {
          const bonusSearchRe = /<div[^>]*?class="midi-qol-bonus-damage-roll"[\s\S]*?<div class="end-midi-qol-bonus-damage-roll">/;
          const bonusReplaceString = `<div class="midi-qol-bonus-damage-roll"><div style="text-align:center" >${this.bonusDamageFlavor}</div>${this.bonusDamageHTML || ""}<div class="end-midi-qol-bonus-damage-roll">`
          content = content.replace(bonusSearchRe, bonusReplaceString);
        }
      }

      const midiAttackTargets = Array.from(this.targets).map(token => {
        const t: TokenDocument | undefined = getTokenDocument(token);
        return {
          name: t?.name,
          img: (t?.actor as unknown as Actor)?.img,
          uuid: (t?.actor as unknown as Actor)?.uuid,
          //@ts-expect-error
          ac: t?.actor?.system?.attributes.ac.value,
        }
      })
      newFlags = foundry.utils.mergeObject(newFlags, {
        "midi-qol": {
          type: MESSAGE_TYPES.DAMAGE,
          damageDetail: this.useOther ? undefined : this.rawDamageDetail,
          otherDamageDetail: this.useOther ? this.rawDamageDetail : this.rawOtherDamageDetail,
          bonusDamageDetail: this.rawBonusDamageDetail,
          dnd5eTargets: midiAttackTargets,
          sourceActorUuid: this.actor.uuid
        },
        [WorkflowDataFlags.damageTotal]: this.useOther ? undefined : this.damageTotal,
        [WorkflowDataFlags.otherDamageTotal]: this.useOther ? this.damageTotal : this.otherDamageTotal,
        [WorkflowDataFlags.bonusDamageTotal]: this.bonusDamageTotal,
        "dnd5e": { // since this might have changed from dnd5e recorded it
          targets: midiAttackTargets
        }
      }, { overwrite: true, inplace: false });
    }

    if (this.damageRollCount > 1) {
      const damageButtonRe = /<button data-action="damage" style="flex:3 1 0">(\[\d*\] )*([^<]+)<\/button>/;
      content = content.replace(damageButtonRe, `<button data-action="damage" style="flex:3 1 0">[${this.damageRollCount}] $2</button>`);
      const confirmButtonRe = /<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">(\[[\d ]*\])*([^<]+)<\/button>/;
      content = content.replace(confirmButtonRe, `<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">[${this.attackRollCount} ${Math.max(this.damageRollCount, 1)}] $2</button>`);
    } else {
      const damageButtonRe = /<button data-action="damage" style="flex:3 1 0">(\[\d*\] )*([^<]+)<\/button>/;
      content = content.replace(damageButtonRe, `<button data-action="damage" style="flex:3 1 0">$2</button>`);
    }

    const result = await this.performDebouncedUpdate(chatMessage, { "content": content, flags: newFlags, rolls: this.chatRolls }, false);
    return result;
  }

  async displayHitTargets(whisper = false) {
    this.hitDisplayData = {};
    this.hitTargetsDisplayed = true;
    if (this.item.type === "feat" && ["ench", "class", undefined].includes(this.activity?.actionType)) return;
    for (let target of this.targets) {
      const targetToken = getToken(target);
      if (!targetToken) continue;
      let img = targetToken.document?.texture.src ?? (targetToken.actor as Actor).img;
      // @ts-expect-error no dnd5e-types
      if (configSettings.usePlayerPortrait && (targetToken.actor as Actor)?.type === "character") {
        img = (targetToken.actor as Actor).img ?? targetToken.document?.texture.src;
      }
      //@ts-expect-error
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img ?? "")) {
        img = await game.video?.createThumbnail(img ?? "", { width: 100, height: 100 });
      }
      const tokenUuid = getTokenDocument(targetToken)?.uuid ?? "";
      this.hitDisplayData[tokenUuid] = {
        isPC: (targetToken.actor as Actor)?.hasPlayerOwner,
        target: targetToken,
        hitClass: "",
        acClass: (targetToken.actor as Actor)?.hasPlayerOwner ? "" : "midi-qol-npc-ac",
        img,
        gmName: getTokenName(targetToken),
        playerName: getTokenPlayerName(targetToken),
        uuid: tokenUuid,
        showAC: true,
        isHit: this.hitTargets.has(targetToken)
      };
    }
    await this.displayHits(whisper, false);
  }

  async displayHits(whisper = false, showHits = true) {
    this.hitTargetsDisplayed = true;
    // if (["", undefined].includes(this.activity.target?.affects?.type)) return; This does not work for lots of srd items
    const templateData = {
      attackType: this.item?.name ?? "",
      attackTotal: this.attackTotal,
      oneCard: true,
      collapsibleTargets: configSettings.collapsibleTargets,
      showHits,
      hits: this.hitDisplayData,
      isGM: game.user?.isGM,
      displayHitResultNumeric: configSettings.displayHitResultNumeric && !this.isFumble && !this.isCritical
    };
    if (debugEnabled > 0) warn("displayHits |", templateData, whisper);
    const hitContent = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/hits.html", templateData) || "No Targets";
    const chatMessage = this.chatCard;

    if (chatMessage) {
      var content = chatMessage && foundry.utils.duplicate(chatMessage.content);
      var searchString;
      var replaceString;
      searchString = /<div[^>]*?class="midi-qol-hits-display">[\s\S]*?<div class="end-midi-qol-hits-display">/;
      replaceString = `<div class="midi-qol-hits-display">${hitContent}<div class="end-midi-qol-hits-display">`
      content = content.replace(searchString, replaceString);

      const update: any = {
        "content": content,
        timestamp: Date.now(),
        "flags.midi-qol.type": MESSAGE_TYPES.HITS,
      }
      // TODO: May not be required
      update.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
      await this.performDebouncedUpdate(chatMessage, update);
    }
  }

  computeSaveFlavors(): { fullDamageText: string, halfDamageText: string, noDamageText: string } {
    let fullDamage: string[] = [];
    let noDamage: string[] = [];
    let halfDamage: string[] = [];
    let fullDamageText = "";
    let noDamageText = "";
    let halfDamageText = "";
    //this.hitTargetsDisplayed = true;
    if ((this.activity.save || this.activity.check) && this.activity.damage?.parts.length > 0) {
      switch (getsaveMultiplierForActivity(this.activity)) {
        case 0:
          noDamage.push(`${this.damageFlavor} &#48;`)
          break;
        case 1:
          fullDamage.push(`${this.damageFlavor} &#49;`)
          break;
        default:
          halfDamage.push(`${this.damageFlavor} &frac12;`);
      }
    }
    if ((this.otherActivity?.save || this.otherActivity?.check) && this.otherActivity?.damage?.parts.length > 0) {
      switch (getsaveMultiplierForActivity(this.otherActivity)) {
        case 0:
          noDamage.push(`${this.otherDamageFlavor} &#48;`)
          break;
        case 1:
          fullDamage.push(`${this.otherDamageFlavor} &#49;`)
          break;
        default:
          halfDamage.push(`${this.otherDamageFlavor} &frac12;`);
      }
    }
    if (fullDamage.length > 0) fullDamageText = fullDamage.join(", ");
    if (noDamage.length > 0) noDamageText = noDamage.join(", ");
    if (halfDamage.length > 0) halfDamageText = halfDamage.join(", ");
    return { fullDamageText, halfDamageText, noDamageText };
  }
  //TODO refactor this with displaysaves
  async displaySaveTargets(whisper = false) {
    this.saveTargetsDisplayed = true;
    this.saveDisplayData = [];
    let rollType;
    let rollAbility;
    let rollSkill;
    let rollTool;
    let rollDC = this.saveActivity?.save?.dc.value ?? this.saveActivity?.check?.dc.value;

    if (this.saveActivity.save) {
      rollType = "save";
      if (this.saveActivity.save.ability instanceof Set) {
        // TODO work out how to let the player choose the save for dnd5e 4.1
        rollAbility = this.saveActivity.save.ability.first();
      }
      else rollAbility = this.saveActivity.save.ability;
    } else if (this.saveActivity?.check) {
      const isSkillOrTool = this.saveActivity.check.associated.size > 0 || this.item.type === "tool";
      let skillOrTool = this.saveActivity.check.associated.first();
      if (!skillOrTool && this.item.type === "tool") {
        skillOrTool = this.item.system.type.baseItem;
      }
      if (!skillOrTool) {
        rollType = "check";
        rollAbility = this.saveActivity.check.ability;
      } else if (GameSystemConfig.skills[skillOrTool]) {
        rollType = "skill";
        rollAbility = this.saveActivity.getAbility(skillOrTool);
        rollSkill = skillOrTool;
      } else {
        rollType = "tool";
        rollTool = skillOrTool;
        rollAbility = this.saveActivity.getAbility(skillOrTool);
      }
    }
    for (let target of this.targets) {
      const targetDocument = getTokenDocument(target);
      let img: string = targetDocument?.texture?.src ?? target.actor?.img ?? "";
      // @ts-expect-error no dnd5e-types
      if (configSettings.usePlayerPortrait && (target.actor as Actor).type === "character") {
        img = target.actor?.img ?? targetDocument?.texture?.src ?? "";
      }

      //@ts-expect-error
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
        img = await game.video?.createThumbnail(img, { width: 100, height: 100 }) ?? "";
      }

      let isPlayerOwned = (target.actor as Actor).hasPlayerOwner;
      this.saveDisplayData.push({
        gmName: getTokenName(target),
        playerName: getTokenPlayerName(target),
        img,
        isPC: isPlayerOwned,
        target,
        saveSymbol: "",
        saveTotalClass: "",
        rollTotal: "",
        rollDetail: "",
        rollHTML: "",
        id: target.id,
        adv: undefined,
        saveClass: ""
      });
    }
    let { fullDamageText, halfDamageText, noDamageText } = this.computeSaveFlavors();
    let templateData = {
      fullDamageText,
      halfDamageText,
      noDamageText,
      saveDisplayFlavor: await this.computeSaveDisplayFlavor(rollDC, rollType, { rollAbility, rollSkill, rollTool }),
      saves: this.saveDisplayData,
      // TODO force roll damage
    }
    const chatMessage = this.chatCard;

    const saveContent = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/saves.html", templateData);
    let content: string = foundry.utils.duplicate(chatMessage.content)

    let searchRe = /<div[^>]*?class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
    let replaceString = `<div class="midi-qol-saves-display"><div data-item-id="${this.item.id}">${saveContent}</div><div class="end-midi-qol-saves-display">`
    content = content.replace(searchRe, replaceString);
    await this.performDebouncedUpdate(chatMessage, { content, "flags.midi-qol.type": MESSAGE_TYPES.SAVES }, true);
  }
  async displaySaves(whisper: boolean = false) {
    let chatData: any = {};
    let { fullDamageText, halfDamageText, noDamageText } = this.computeSaveFlavors();
    let templateData = {
      fullDamageText,
      halfDamageText,
      noDamageText,
      saveDisplayFlavor: this.saveDisplayFlavor,
      saves: this.saveDisplayData,
      // TODO force roll damage
    }
    let chatMessage = this.chatCard;
    if (chatMessage) {
      templateData.saveDisplayFlavor = this.saveDisplayFlavor;
      const saveContent = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/saves.html", templateData);
      chatMessage = this.chatCard;
      let content: string = foundry.utils.duplicate(chatMessage.content)
      let searchRe;
      let replaceString;
      //@ts-expect-error
      let midiTargets: TokenDocument[] = Array.from(this.targets.map(t => getTokenDocument(t))).filter(t => t);
      let midiTargetDetails;
      let dnd5eTargets;
      if (midiTargets.length) {
        const saves = this.saves?.map(t => getTokenDocument(t)?.uuid);
        const semiSuperSavers = this.semiSuperSavers?.map(t => getTokenDocument(t)?.uuid);
        const superSavers = this.superSavers?.map(t => getTokenDocument(t)?.uuid);

        dnd5eTargets = midiTargets.map(t => {
          return {
            name: (t as unknown as Token)?.name,
            img: (t?.actor as unknown as Actor)?.img,
            uuid: t?.actor?.uuid,
            //@ts-expect-error
            ac: t.actor?.statuses.has("coverTotal") ? null : t?.actor?.system.attributes.ac.value,
          }
        });

        midiTargetDetails = midiTargets.map(t => {
          let uncannyDodge = foundry.utils.getProperty(t, `actor.flags.${MODULE_ID}.uncanny-dodge`) && this.activity?.attack;
          let saveMults: any = {};
          saveMults["otherDamage"] = this.otherActivity ? getsaveMultiplierForActivity(this.otherActivity) : 1;
          saveMults["defaultDamage"] = getsaveMultiplierForActivity(this.activity);
          saveMults["bonusDamage"] = getsaveMultiplierForActivity(this.activity);
          return {
            name: (t?.name as unknown as Token)?.name,
            img: (t?.actor as unknown as Actor)?.img,
            uuid: t?.actor?.uuid,
            //@ts-expect-error
            ac: t.actor?.statuses.has("coverTotal") ? null : t?.actor?.system.attributes.ac.value,
            saved: saves?.has(t.uuid),
            semiSuperSaver: semiSuperSavers?.has(t.uuid),
            superSaver: superSavers?.has(t.uuid),
            saveMults,
            itemType: this.item.type,
            uncannyDodge,
          }
        })
      }
      if (this.workflowType !== "DamageOnlyWorkflow") {
        searchRe = /<div[^>]*?class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
        replaceString = `<div class="midi-qol-saves-display"><div data-item-id="${this.item.id}">${saveContent}</div><div class="end-midi-qol-saves-display">`
        content = content.replace(searchRe, replaceString);
        const update: any = {
          content,
          /* rolls: this.chatRolls */
          flags: {
            "midi-qol.type": MESSAGE_TYPES.SAVES,
            [WorkflowDataFlags.saves]: Array.from(this.saves).map(t => getTokenDocument(t)?.uuid),
            [WorkflowDataFlags.failedSaves]: Array.from(this.failedSaves).map(t => getTokenDocument(t)?.uuid),
            [WorkflowDataFlags.superSavers]: Array.from(this.superSavers).map(t => getTokenDocument(t)?.uuid),
            [WorkflowDataFlags.semiSuperSavers]: Array.from(this.semiSuperSavers).map(t => getTokenDocument(t)?.uuid),
            [WorkflowDataFlags.criticalSaves]: Array.from(this.criticalSaves).map(t => getTokenDocument(t)?.uuid),
            [WorkflowDataFlags.fumbleSaves]: Array.from(this.fumbleSaves).map(t => getTokenDocument(t)?.uuid),
            [WorkflowDataFlags.advantageSaves]: Array.from(this.advantageSaves).map(t => getTokenDocument(t)?.uuid),
            "midi-qol.dnd5eTargets": midiTargetDetails,
            [WorkflowDataFlags.actor]: this.actor.uuid,
          }
        };
        if (dnd5eTargets) update["flags.dnd5e.targets"] = dnd5eTargets;
        update.style = CONST.CHAT_MESSAGE_STYLES.OTHER;
        await this.performDebouncedUpdate(chatMessage, update/*, true*/);
      }
    }
  }

  get chatRolls(): Roll[] {
    let messageRolls: Roll[] = [];
    if (this.attackRoll) messageRolls.push(this.attackRoll);
    if (this.utilityRoll) messageRolls.push(this.utilityRoll);
    if (this.damageRolls) messageRolls.push(...this.damageRolls);
    if (this.bonusDamageRolls) messageRolls.push(...this.bonusDamageRolls);
    if (this.otherDamageRolls) messageRolls.push(...this.otherDamageRolls);
    if (this.saveRolls) messageRolls.push(...this.saveRolls);
    return messageRolls;
  }

  /**
   * update this.saves to be a Set of successful saves from the set of tokens this.hitTargets and failed saves to be the complement
   */
  async checkSaves(whisper = false, simulate = false) {
    this.initSaveResults();
    this.saveRolls = [];
    this.tokenSaves = {};
    if (debugEnabled > 1) debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)
    if (this.hitTargets.size <= 0 && this.hitTargetsEC.size <= 0) {
      this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`
      return;
    }

    if (!this.saveActivity) return;
    //@ts-expect-error
    if (!evalActivationCondition(this, this.saveActivity.useCondition, this.targets.first())) return;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    if (allHitTargets.size === 0) return;
    let rollDC = this.saveActivity?.save?.dc.value ?? this.saveActivity?.check?.dc.value;
    //@ts-expect-error 
    const D20Roll = CONFIG.Dice.D20Roll;
    this.saveDC = rollDC;
    const requestCards: Array<Promise<ChatMessage> | undefined> = [];
    let promises: Promise<any>[] = [];
    let rollAction;
    let rollType // save/check/skill/tool
    let rollSkill;
    let rollTool;
    var flagRollType;
    let rollAbility;
    if (this.saveActivity?.save) {
      rollType = "save";
      flagRollType = "save";
      if (this.saveActivity.save.ability instanceof Set) {
        // TODO work out how to let the player choose the save for dnd5e 4.1
        rollAbility = this.saveActivity.save.ability.first();
      }
      else rollAbility = this.saveActivity.save.ability;
      // @ts-expect-error no dnd5e-types
      rollAction = CONFIG.Actor.documentClass.prototype.rollSavingThrow;
    } else if (this.saveActivity?.check) {
      const isSkillOrTool = this.saveActivity.check.associated.size > 0 || this.item.type === "tool";
      let skillOrTool = this.saveActivity.check.associated.first();
      if (!skillOrTool && this.item.type === "tool") {
        skillOrTool = this.item.system.type.baseItem;
      }
      if (!skillOrTool) {
        rollType = "check";
        rollAbility = this.saveActivity.check.ability;
        // @ts-expect-error no dnd5e-types
        rollAction = CONFIG.Actor.documentClass.prototype.rollAbilityCheck;
        flagRollType = "check";
      } else if (GameSystemConfig.skills[skillOrTool]) {
        rollType = "skill";
        rollAbility = this.saveActivity.getAbility(skillOrTool);
        rollSkill = skillOrTool;
        flagRollType = "skill";
        // @ts-expect-error no dnd5e-types
        rollAction = CONFIG.Actor.documentClass.prototype.rollSkill;
      } else {
        // @ts-expect-error no dnd5e-types
        rollAction = CONFIG.Actor.documentClass.prototype.rollToolCheck;
        rollType = "tool";
        rollTool = skillOrTool;
        rollAbility = this.saveActivity.getAbility(skillOrTool);
        flagRollType = "tool";
      }
    }

    if (this.chatUseFlags?.babonus?.saveDC) {
      rollDC = this.chatUseFlags.babonus.saveDC;
    }
    const playerMonksTB = !simulate && flagRollType !== "tool" && installedModules.get("monks-tokenbar") && configSettings.playerRollSaves === "mtb";
    const playerEpicRolls = !simulate && installedModules.get("epic-rolls-5e") && configSettings.playerRollSaves === "rer"
    let monkRequestsPlayer: any[] = [];
    let rerRequestsPlayer: any[] = [];
    let monkRequestsGM: any[] = [];
    let rerRequestsGM: any[] = [];
    const saveDisplay = (this.activity?.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity?.saveDisplay;
    const isMagicSave = this.item?.type === "spell" || this.item?.flags.midiProperties?.magiceffect || this.item?.flags.midiProperties?.magiceffect;

    try {
      let actorDisposition;
      if (this.token && this.token.document?.disposition) actorDisposition = this.token.document.disposition;
      else { // no token to use so make a guess
        actorDisposition = this.actor?.type === "npc" ? -1 : 1;
      }

      for (let target of allHitTargets) {
        let showRoll = saveDisplay === "allShow";
        if (simulate) showRoll = false;
        if (!foundry.utils.getProperty(this.item, `flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
          await doReactions(target, this.tokenUuid, this.attackRoll ?? new Roll(""), "reactionsave", { workflow: this, activity: this.activity, item: this.item })
        }
        if (!target || !target?.actor) continue;
        const conditionData = createConditionData({ workflow: this, target, actor: target.actor });
        const targetDocument = getTokenDocument(target);
        const saveDetails: {
          advantage: boolean | undefined,
          disadvantage: boolean | undefined,
          isFriendly: boolean,
          isMagicSave: boolean,
          isConcentrationCheck: boolean | undefined,
          rollDC: number,
          saveItemUuid: string,
          workflowId: string,
          itemCardUuid: string,
          workflowUuid: string, // deprecated
          workflowOptions: object,
        } = {
          advantage: undefined,
          disadvantage: undefined,
          isMagicSave: isMagicSave,
          isFriendly: targetDocument?.disposition === actorDisposition,
          isConcentrationCheck: undefined,
          rollDC,
          saveItemUuid: this.saveItem?.uuid ?? "",
          workflowId: this.id,
          itemCardUuid: this.itemCardUuid ?? "",
          workflowUuid: this.id, // deprecated
          workflowOptions: this.workflowOptions,
        };

        let magicResistance: boolean = false;
        let magicVulnerability: boolean = false;
        // If spell, check for magic resistance
        if (isMagicSave) {
          // check magic resistance in custom damage reduction traits
          //@ts-expect-error .system
          saveDetails.advantage = (targetDocument?.actor?.system.traits?.dr?.custom || "").includes(i18n("midi-qol.MagicResistant").trim());
          // check magic resistance as a feature (based on the SRD name as provided by the DnD5e system)
          // @ts-expect-error no dnd5e-types
          saveDetails.advantage = saveDetails.advantage || (target?.actor as Actor)?.items.find(a => a.type === "feat" && a.name === i18n("midi-qol.MagicResistanceFeat")?.trim()) !== undefined;
          if (!saveDetails.advantage) saveDetails.advantage = undefined;
          if (await evalAllConditionsAsync(target.actor as Actor, `flags.${MODULE_ID}.magicResistance.all`, conditionData)
            || await evalAllConditionsAsync(target.actor as Actor, `flags.${MODULE_ID}.magicResistance.${rollAbility}`, conditionData)) {
            saveDetails.advantage = true;
            magicResistance = true;
          }
          if (await evalAllConditionsAsync(target.actor as Actor, `flags.${MODULE_ID}.magicVulnerability.all`, conditionData)
            || await evalAllConditionsAsync(target.actor as Actor, `flags.${MODULE_ID}.magicVulnerability.${rollAbility}`, conditionData)) {
            saveDetails.disadvantage = true;
            magicVulnerability = true;
          }
          if (debugEnabled > 1) debug(`${(target.actor as Actor).name} resistant to magic : ${saveDetails.advantage}`);
          if (debugEnabled > 1) debug(`${(target.actor as Actor).name} vulnerable to magic : ${saveDetails.disadvantage}`);
        }

        const settingsOptions = await procAbilityAdvantage(target.actor, rollType, this.saveActivity.save?.ability ?? this.saveActivity.check?.ability, { workflow: this });
        if (settingsOptions.advantage) saveDetails.advantage = true;
        if (settingsOptions.disadvantage) saveDetails.disadvantage = true;
        saveDetails.isConcentrationCheck = this.item.flags?.[MODULE_ID]?.isConcentrationCheck;
        // The rollAbilitycheck function eventually calls actor.rollConcentration so all the falgs are set.

        // Check grants save fields
        if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.grants.advantage.all`, conditionData)
          || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.grants.advantage.${flagRollType}.all`, conditionData)
          || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.grants.advantage.${flagRollType}.${rollAbility}`, conditionData)) {
          saveDetails.advantage = true;
        }
        if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.grants.disadvantage.all`, conditionData)
          || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.grants.disadvantage.${flagRollType}.all`, conditionData)
          || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.grants.disadvantage.${flagRollType}.${rollAbility}`, conditionData)) {
          saveDetails.disadvantage = true;
        }
        // TODO manage grants.noAdvantage/disAdvantage for the roll
        if (await evalAllConditionsAsync(target.actor, `flags.${MODULE_ID}.grants.noAdvantage.all`, conditionData)
          || await evalAllConditionsAsync(target.actor, `flags.${MODULE_ID}.grants.noAdvantage.${flagRollType}`, conditionData))
          saveDetails.advantage = false;
        if (await evalAllConditionsAsync(target.actor, `flags.${MODULE_ID}.grants.noDisadvantage.all`, conditionData)
          || await evalAllConditionsAsync(target.actor, `flags.${MODULE_ID}.grants.noDisadvantage.${flagRollType}`, conditionData))
          saveDetails.disadvantage = false;
        if (saveDetails.advantage && !saveDetails.disadvantage) this.advantageSaves.add(target);
        else if (saveDetails.disadvantage && !saveDetails.advantage) this.disadvantageSaves.add(target);
        var player = playerFor(target);
        if (!player || !player.active) player = preferredActiveGM();
        let promptPlayer = !player?.isGM && !(["none", "noneDialogPublic", "noneDialogPrivate", "noneDialogSelf", "noneDialogBlind"].includes(configSettings.playerRollSaves));
        let showRollDialog = !player?.isGM && ["noneDialogPublic", "noneDialogPrivate", "noneDialogSelf", "noneDialogBlind"].includes(configSettings.playerRollSaves);
        if (simulate) promptPlayer = false;
        let GMprompt;
        let gmMonksTB;
        let gmRER;
        let playerRER = !player?.isGM && ["rer"].includes(configSettings.playerRollSaves);
        const playerChat = !player?.isGM && ["chat"].includes(configSettings.playerRollSaves);
        if (player?.isGM) {
          const targetDocument = getTokenDocument(target);
          const monksTBSetting = targetDocument?.isLinked ? configSettings.rollNPCLinkedSaves === "mtb" : configSettings.rollNPCSaves === "mtb"
          const epicRollsSetting = targetDocument?.isLinked ? configSettings.rollNPCLinkedSaves === "rer" : configSettings.rollNPCSaves === "rer"
          gmMonksTB = flagRollType !== "tool" && installedModules.get("monks-tokenbar") && monksTBSetting;
          gmRER = installedModules.get("epic-rolls-5e") && epicRollsSetting;
          GMprompt = (targetDocument?.isLinked ? configSettings.rollNPCLinkedSaves : configSettings.rollNPCSaves);

          promptPlayer = !["auto", "autoDialog"].includes(GMprompt);
          showRollDialog = GMprompt === "autoDialog";
          if (simulate) {
            gmMonksTB = false;
            GMprompt = false;
            gmRER = false;
            promptPlayer = false;
            showRollDialog = false;
          }
        }

        this.saveDetails = saveDetails;
        //@ts-expect-error [target]
        if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["preTargetSave"], [target]);

        if (saveDetails.isFriendly &&
          (this.item.system.description.value.toLowerCase().includes(i18n("midi-qol.autoFailFriendly")?.toLowerCase())
            || this.item.flags.midiProperties?.autoFailFriendly)) {
          promises.push(new D20Roll("-1").evaluate());
        } else if (saveDetails.isFriendly && this.item.flags.midiProperties?.autoSaveFriendly) {
          promises.push(new D20Roll("99").evaluate());
        } else if ((!player?.isGM && playerMonksTB) || (player?.isGM && gmMonksTB)) {
          promises.push(new Promise((resolve) => {
            let requestId = target.id ?? foundry.utils.randomID();
            this.saveRequests[requestId] = resolve;
          }));

          if (isMagicSave) {
            if (magicResistance) saveDetails.advantage = true;
            if (magicVulnerability) saveDetails.disadvantage = true;
          }
          const requests = player?.isGM ? monkRequestsGM : monkRequestsPlayer;
          requests.push({
            token: target.id,
            dc: saveDetails.rollDC,
            showdc: configSettings.displaySaveDC, // TODO: improve to use dnd5e settings as well
            advantage: saveDetails.advantage, // seems that monks ignores this again - set alt/ctrl key
            altKey: saveDetails.advantage === true,
            disadvantage: saveDetails.disadvantage, // seems that monks ignores this again - set alt/ctrl key
            ctrlKey: saveDetails.disadvantage === true,
            fastForward: false,
            isMagicSave,
            isConcentrationCheck: saveDetails.isConcentrationCheck,
            workflowOptions: saveDetails.workflowOptions,
            options: { // This does nothing as monks does not pass these through
              midiOptions: {
                itemUuid: this.saveItem.uuid,
                workflowId: this.id,
                itemCardUuid: this.itemCardUuid
              }
            }
          })
        } else if ((!player?.isGM && playerEpicRolls) || (player?.isGM && gmRER)) {
          promises.push(new Promise((resolve) => {
            let requestId = (target?.actor as Actor)?.uuid ?? foundry.utils.randomID();
            this.saveRequests[requestId] = resolve;
          }));

          if (isMagicSave) {
            if (magicResistance) saveDetails.advantage = true;
            if (magicVulnerability) saveDetails.disadvantage = true;
          }
          const requests = player?.isGM ? rerRequestsGM : rerRequestsPlayer;
          requests.push({
            actorUuid: (target.actor as Actor).uuid,
            token: target.id,
            advantage: saveDetails.advantage,
            disadvantage: saveDetails.disadvantage,
            dc: saveDetails.rollDC,
            showdc: configSettings.displaySaveDC,
            // altKey: advantage === true,
            // ctrlKey: disadvantage === true,
            fastForward: false,
            isMagicSave,
            isconcentrationCheck: saveDetails.isConcentrationCheck, // Not sure if epic rolls will pick this up
            workflowOptions: saveDetails.workflowOptions
          })
        } else if ((player?.active && playerChat) || (player?.isGM && GMprompt === "none")) {
          if (debugEnabled > 0) warn(`checkSaves | Player ${player?.name} controls actor ${(target.actor as Actor).name} - requesting ${rollAbility} ${rollType}`);
          promises.push(new Promise((resolve) => {
            let requestId = target?.id ?? foundry.utils.randomID();
            const playerId = player?.id;
            this.saveRequests[requestId] = resolve;
            requestCards.push(requestPCSave(rollAbility, rollType, player, target.actor, { flavor: this.item.name, requestId, GMprompt, isMagicSave, magicResistance, magicVulnerability, saveDetails }));

            // set a timeout for taking over the roll
            if (configSettings.playerSaveTimeout > 0) {
              this.saveTimeouts[requestId] = setTimeout(async () => {
                if (this.saveRequests[requestId]) {
                  delete this.saveRequests[requestId];
                  delete this.saveTimeouts[requestId];
                  let result;
                  const saveDisplay = (this.activity?.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity?.saveDisplay;
                  if (!game.user?.isGM && saveDisplay === "allShow") {
                    // non-gm users don't have permission to create chat cards impersonating the GM so hand the role to a GM client
                    result = await timedAwaitExecuteAsGM("rollAbility", {
                      targetUuid: (target.actor as Actor)?.uuid ?? "",
                      request: rollType,
                      ability: rollAbility,
                      skill: rollSkill,
                      tool: rollTool,
                      // rollDC: saveDetails.rollDC,
                      options: { // GMAction will map this -> midiOptions
                        messageData: { user: playerId },
                        target: configSettings.autoCheckSaves === "whisper" ? undefined : saveDetails.rollDC,
                        chatMessage: showRoll,
                        mapKeys: false,
                        rollMode: ((this.activity?.midiProperties?.rollMode ?? "default") !== "default") ? this.activity.midiProperties.rollMode : CONST.DICE_ROLL_MODES.PUBLIC, // since it's allShow we want to display the roll to evryone whisper ? CONST.DICE_ROLL_MODES.PRIVATE : CONST.DICE_ROLL_MODES.PUBLIC,
                        advantage: saveDetails.advantage,
                        disadvantage: saveDetails.disadvantage,
                        fastForward: true,
                        saveItemUuid: this.saveItem.uuid,
                        isConcentrationCheck: saveDetails.isConcentrationCheck,
                        workflowOptions: saveDetails.workflowOptions,
                        workflowId: this.id,
                        itemCardUuid: this.itemCardUuid,
                        itemId: this.saveActivity.item.id
                      }
                    });
                  } else {
                    let config: any = {
                      configure: false,
                      target: rollDC,
                      midiOptions: {
                        workflowId: this.workflowId,
                        itemCardUuid: this.itemCardUuid,
                        advantage: saveDetails.advantage,
                        disadvantage: saveDetails.disadvantage,
                        mapKeys: false,
                        fastForward: true,
                        saveItemUuid: this.saveItem.uuid,
                        isConcentrationCheck: saveDetails.isConcentrationCheck,
                        workflowOptions: saveDetails.workflowOptions
                      }
                    };
                    let dialog: any = { ability: rollAbility, skill: rollSkill, tool: rollTool };
                    let message: any = { create: showRoll };
                    config.ability
                    if (rollType === "tool") {
                      let tool: any = target.actor?.items.get(this.saveActivity.item.id);
                      //@ts-expect-error no dnd5e types
                      if (!tool) tool = (target.actor as Actor).items.find(i => i.type === "tool" && i.system.type.baseItem === rollTool);
                      if (!tool) { // no tool of the requested type - auto fail
                        //@ts-expect-error
                        resolve([await new CONFIG.Dice.D20Roll("-1").roll()]);
                        return;
                      } else {
                        config.bonus = tool.system.bonus;
                        config.prof = tool.system.prof;
                        config.item = tool;
                      }
                    }
                    result = await rollAction.bind(target.actor)(config, dialog, message);
                    resolve(result);
                  }
                }
              }, (configSettings.playerSaveTimeout || 1) * 1000);
            }
          }))
        } else {
          // Find a player owner for the roll if possible
          let owner = playerFor(target);
          if (!owner?.isGM && owner?.active) showRoll = true; // Always show player save rolls
          if (!owner?.active) owner = preferredActiveGM();
          // Fall back to rolling as the current user
          if (!owner) owner = game.user;
          let rollMode = ((this.activity?.midiProperties?.rollMode ?? "default") !== "default") ? this.activity.midiProperties.rollMode : whisper ? CONST.DICE_ROLL_MODES.PRIVATE : CONST.DICE_ROLL_MODES.PUBLIC;
          if (!owner?.isGM) {
            if ((this.activity?.midiProperties?.rollMode ?? "default") === "default") {
              if (["noneDialogPublic", "nonePublic"].includes(configSettings.playerRollSaves)) rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
              else if (["noneDialogPrivate", "none"].includes(configSettings.playerRollSaves)) rollMode = CONST.DICE_ROLL_MODES.PRIVATE;
              else if (configSettings.playerRollSaves === "noneDialogSelf") rollMode = CONST.DICE_ROLL_MODES.SELF;
              else if (configSettings.playerRollSaves === "noneDialogBlind") rollMode = CONST.DICE_ROLL_MODES.BLIND;
            }
          }
          promises.push(socketlibSocket.executeAsUser("rollAbility", owner?.id, {
            targetUuid: (target.actor as Actor).uuid,
            request: rollType,
            ability: rollAbility,
            skill: rollSkill,
            tool: rollTool,
            // rollDC: saveDetails.rollDC,
            options: {
              simulate,
              target: saveDetails.rollDC,
              messageData: { user: owner?.id },
              chatMessage: showRoll,
              rollMode,
              mapKeys: false,
              advantage: saveDetails.advantage,
              disadvantage: saveDetails.disadvantage,
              fastForward: simulate || !showRollDialog,
              isMagicSave,
              saveItemUuid: this.item.uuid,
              isConcentrationCheck: saveDetails.isConcentrationCheck,
              workflowId: this.id,
              itemCardUuid: this.itemCardUuid,
              itemUuid: this.itemUuid,
              workflowOptions: saveDetails.workflowOptions,
              itemId: this.saveActivity.item.id
            },
          }));
        }
      }
    } catch (err) {
      TroubleShooter.recordError(err);
      console.warn(err)
    } finally {
    }
    const monkRequests = monkRequestsPlayer.concat(monkRequestsGM);

    if (!whisper && monkRequests.length > 0) {
      const requestData: any = {
        tokenData: monkRequests,
        request: `${rollType === "check" ? "ability" : rollType}:${rollAbility}`,
        silent: true,
        showdc: configSettings.displaySaveDC,
        rollMode: ((this.activity?.midiProperties?.rollMode ?? "default") !== "default") ? this.activity.midiProperties.rollMode : whisper ? CONST.DICE_ROLL_MODES.PRIVATE : CONST.DICE_ROLL_MODES.PUBLIC // should be CONST.DICE_ROLL_MODES.PUBLIC but monks does not check it
      };
      // Display dc triggers the tick/cross on monks tb
      if (configSettings.displaySaveDC && "whisper" !== configSettings.autoCheckSaves) requestData.dc = rollDC
      timedExecuteAsGM("monksTokenBarSaves", requestData);
    } else if (monkRequestsPlayer.length > 0 || monkRequestsGM.length > 0) {
      let request: string | undefined;
      if (rollType === "save") {
        request = `save:${rollAbility}`;
      } else if (rollType === "check") {
        request = `ability:${rollAbility}`;
      } else if (rollType === "skill") {
        request = `skill:${rollSkill}`;
      }
      const requestDataGM: any = {
        tokenData: monkRequestsGM,
        request,
        silent: true,
        rollMode: whisper ? CONST.DICE_ROLL_MODES.PRIVATE : "roll", // should be CONST.DICE_ROLL_MODES.PUBLIC but monks does not check it
        isMagicSave,
        options: { // This does nothing as monks does not pass through any optiosn to the roll - just here in hope
          workflowOptions: this.workflowOptions,
          midiOptions: {
            isConcentrationCheck: this.item.flags[MODULE_ID]?.isConcentrationCheck,
            isMagicSave,
            saveItemUuid: this.item.uuid,
            workflowId: this.id,
            itemCardUuid: this.itemCardUuid,
          }
        }
      }
      const requestDataPlayer: any = {
        tokenData: monkRequestsPlayer,
        request,
        silent: true,
        rollMode: ((this.activity?.midiProperties?.rollMode ?? "default") !== "default") ? this.activity.midiProperties.rollMode : "roll",// should be CONST.DICE_ROLL_MODES.PUBLIC but monks does not check it
        isMagicSave,
        saveItemUuid: this.item.uuid,
        workflowId: this.id,
        itemCardUuid: this.itemCardUuid
      }
      // Display dc triggers the tick/cross on monks tb
      if (configSettings.displaySaveDC && "whisper" !== configSettings.autoCheckSaves) {
        requestDataPlayer.dc = rollDC
        requestDataGM.dc = rollDC
      }
      if (monkRequestsPlayer.length > 0) {
        timedExecuteAsGM("monksTokenBarSaves", requestDataPlayer);
      };
      if (monkRequestsGM.length > 0) {
        timedExecuteAsGM("monksTokenBarSaves", requestDataGM);
      };
    }
    const rerRequests = rerRequestsPlayer.concat(rerRequestsGM);
    if (rerRequests.length > 0) {
      // rollType is save/abil/skill
      const rerType = rollType;
      const type = `${rerType}.${this.saveActivity.save?.ability.first() ?? this.saveActivity.check?.associated.first() ?? "dex"}`
      const rerRequest: any = {
        actors: rerRequests.map(request => request.actorUuid),
        contestants: [],
        type,
        options: {
          DC: rollDC,
          showDC: configSettings.displaySaveDC,
          blindRoll: configSettings.autoCheckSaves === "whisper",
          showRollResults: false, // configSettings.autoCheckSaves === "allShow",
          hideNames: true,
          noMessage: true,
          rollSettings: rerRequests.map(request => ({
            advantage: request.advantage,
            disadvantage: request.disadvantage,
            uuid: request.actorUuid
          })),
        }
      };
      //@ts-expect-error
      ui?.EpicRolls5e.requestRoll(rerRequest).then((rerResult: any) => {
        if (rerResult.cancelled) {
          //@ts-expect-error
          const D20Roll = CONFIG.Dice.D20Roll;
          let roll = new D20Roll("-1");
          roll = roll.evaluateSync({ strict: false })
          for (let uuid of rerRequest.actors) {
            const fn = this.saveRequests[uuid];
            delete this.saveRequests[uuid];
            fn(roll)
          }
        } else for (let rerRoll of rerResult.results) {
          const actorUuid = rerRoll.actor.uuid;
          const fn = this.saveRequests[actorUuid];
          delete this.saveRequests[actorUuid];
          const roll = Roll.fromJSON(JSON.stringify(rerRoll.roll));
          fn(roll);
        }
      })
    };

    if (debugEnabled > 1) debug("check saves: requests are ", this.saveRequests)
    var results = await Promise.all(promises);
    (await Promise.all(requestCards)).forEach(chatMessage => chatMessage?.delete());
    if (rerRequests?.length > 0) await busyWait(0.01);
    delete this.saveDetails;
    for (let i = 0; i < results.length; i++) {
      if (results[i] instanceof Roll) results[i] = [results[i]];
      if (results[i] instanceof Array)
        for (let j = 0; j < results[i].length; j++) {
          if (!(results[i][j] instanceof Roll)) {
            //@ts-expect-error
            results[i][j] = CONFIG.Dice.D20Roll.fromJSON(JSON.stringify(results[i][j]));
          }
        }
    }
    this.saveResults = results;
    let i = 0;
    if (activityHasAreaTarget(this.activity) && this.templateUuid) {
      const templateDocument = await fromUuid(this.templateUuid) as MeasuredTemplateDocument | null;
      var template = templateDocument?.object;
    }
    for (let tokenOrDocument of allHitTargets) {
      let target = getToken(tokenOrDocument)
      const targetDocument = getTokenDocument(tokenOrDocument);
      if (!target?.actor || !target || !targetDocument) continue; // these were skipped when doing the rolls so they can be skipped now
      if (!results[i]?.[0] || results[i]?.[0]?.total === undefined) {
        const message = `Token ${target?.name} could not roll save/check assuming 1`;
        error(message, target);
        TroubleShooter.recordError(new Error(message), message);
        //@ts-expect-error
        const D20Roll = CONFIG.Dice.D20Roll;
        results[i] = [await new D20Roll("1").evaluate()];
      }

      let result = results[i];
      let saveRollTotal = result.reduce((acc, r) => acc + r.total, 0);
      let saveRolls = result;
      if (result[0]?.options?.advantage) this.advantageSaves.add(target);
      else this.advantageSaves.delete(target);
      if (result[0]?.options?.disadvantage) this.disadvantageSaves.add(target);
      else this.disadvantageSaves.delete(target);
      if (this.advantageSaves.has(target) && this.disadvantageSaves.has(target)) {
        this.advantageSaves.delete(target);
        this.disadvantageSaves.delete(target);
      }
      let isFumble = false;
      let isCritical = false;
      if (saveRolls[0]?.terms) { // normal d20 roll/monks roll
        const dterm: foundry.dice.terms.DiceTerm = saveRolls[0].terms[0];
        const diceRoll = dterm?.results?.find(result => result.active)?.result ?? saveRollTotal;
        //@ts-expect-error
        isFumble = diceRoll <= (dterm.options?.fumble ?? 1)
        //@ts-expect-error
        isCritical = diceRoll >= (dterm.options?.critical ?? 20);
      }
      let coverSaveBonus = 0;

      if (this.item && this.activityHasSave && rollAbility === "dex") {
        if (this.activity?.actionType === "rsak" && foundry.utils.getProperty(this.actor, "flags.dnd5e.spellSniper"))
          coverSaveBonus = 0;
        else if (activityHasAreaTarget(this.activity) && template) {
          const position: any = foundry.utils.duplicate(template.center);
          const dimensions = canvas?.dimensions;
          if (template.document.t === "rect") {
            // TODO in v12 width seems to be always 0 so this does nothing
            position.x += (template.document.width ?? 1) / (dimensions?.distance ?? 5) / 2 * (dimensions?.size ?? 100);
            position.y += (template.document.width ?? 1) / (dimensions?.distance ?? 5) / 2 * (dimensions?.size ?? 100);
          }
          if (configSettings.optionalRules.coverCalculation === "levelsautocover"
            && installedModules.get("levelsautocover")) {
            // TODO Fix this monstrosity
            coverSaveBonus = computeCoverBonus({
              center: position,
              document: {
                elevation: template.document.elevation,
                disposition: targetDocument?.disposition,
              }
            } as unknown as Token, target, this.activity);
          } else if (configSettings.optionalRules.coverCalculation === "simbuls-cover-calculator"
            && installedModules.get("simbuls-cover-calculator")) {
            // Special case for templaes
            coverSaveBonus = 0;
            const coverData = await globalThis.CoverCalculator.checkCoverViaCoordinates(
              position.x, position.y, false, 'AoE', false, target);
            if (coverData?.data.results.cover === 3) coverSaveBonus = FULL_COVER;
            else coverSaveBonus = -coverData.data.results.value;
          } if (configSettings.optionalRules.coverCalculation === "tokencover" && installedModules.get("tokencover")) {
            if (this.token) coverSaveBonus = computeCoverBonus(foundry.utils.deepClone(this.token, { center: position } as any), target, this.activity);
          }
        } else if (this.token) {
          coverSaveBonus = computeCoverBonus(this.token, target, this.activity);
        }
      }
      saveRollTotal += coverSaveBonus;
      // Adjust the save dc if something changed it during the roll
      let resultDC = rollDC;
      if (Number.isNumeric(result[0]?.options.target)) resultDC = result[0]?.options.target;
      let saved = saveRollTotal >= resultDC;

      if (checkRule("criticalSaves")) { // normal d20 roll/monks roll
        saved = (isCritical || saveRollTotal >= resultDC) && !isFumble;
      }
      if (foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.sculptSpells`) && (this.rangeTargeting || this.tempTargetConfirmation) && this.activity?.item?.system.school === "evo" && this.preSelectedTargets.has(target)) {
        saved = true;
        this.superSavers.add(target)
      }
      if (foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.carefulSpells`) && (this.rangeTargeting || this.tempTargetConfirmation) && this.preSelectedTargets.has(target)) {
        saved = true;
      }
      if (saved) {
        this.saves.add(target);
        this.failedSaves.delete(target);
      } else {
        this.saves.delete(target);
        this.failedSaves.add(target);
      }
      if (!foundry.utils.getProperty(this.item, `flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
        if (saved)
          //@ts-expect-error
          await doReactions(target, this.tokenUuid, this.attackRoll, "reactionsavesuccess", { workflow: this, activity: this.activity, item: this.item })
        else
          //@ts-expect-error
          await doReactions(target, this.tokenUuid, this.attackRoll, "reactionsavefail", { workflow: this, activity: this.activity, item: this.item })
      }
      if (isCritical) this.criticalSaves.add(target);

      let newRolls;
      if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) {
        const rollResults = await this.triggerTargetMacros(["isSave", "isSaveSuccess", "isSaveFailure"], new Set([target]), { saved });
        newRolls = rollResults[target.document.uuid];
        if (newRolls[0] instanceof Roll) {
          saveRolls = newRolls;
          saveRollTotal = newRolls.reduce((acc, r) => acc + r.total, 0);
          saved = saveRollTotal >= resultDC;
          const dterm: foundry.dice.terms.DiceTerm = saveRolls[0].terms[0];
          const diceRoll = dterm?.results?.find(result => result.active)?.result ?? saveRollTotal;
          //@ts-expect-error
          isFumble = diceRoll <= (dterm.options?.fumble ?? 1)
          //@ts-expect-error
          isCritical = diceRoll >= (dterm.options?.critical ?? 20);
        }
      }
      if (!(result[0] instanceof D20Roll)) result[0] = D20Roll.fromRoll(result[0]);
      if (!saved && !Number.isNumeric(result[0].options.target)) { // if options.target is set the saving throw roll will pick out the fail optional bonus
        // const newRoll = await bonusCheck(target.actor, result, rollType, "fail")
        const failFlagsLength = collectBonusFlags(target.actor, rollType, "fail.all").length;
        const failAbilityFlagsLength = collectBonusFlags(target.actor, rollType, `fail.${rollAbility}`).length
        if (failFlagsLength || failAbilityFlagsLength) {
          // If the roll fails and there is an flags.midi-qol.save.fail then apply the bonus
          let owner = playerFor(target);
          if (!owner?.active) owner = game.users?.find((u: User) => u.isGM && u.active);
          if (owner) {
            let newRoll;
            if (owner?.isGM && game.user?.isGM) {
              newRoll = await bonusCheck(target.actor, result[0], rollType, failAbilityFlagsLength ? `fail.${rollAbility}` : "fail.all");
            } else {
              newRoll = await socketlibSocket.executeAsUser("bonusCheck", owner?.id, {
                actorUuid: (target.actor as Actor).uuid,
                result: JSON.stringify(result[0].toJSON()),
                rollType,
                selector: failFlagsLength ? "fail.all" : `fail.${rollAbility}`
              });

            }

            saveRolls[0] = Roll.fromJSON(JSON.stringify(newRoll));
            saveRollTotal = saveRolls.reduce((acc, r) => acc + r.total, 0);
          }
        }
        saved = saveRollTotal >= resultDC;
        const dterm: foundry.dice.terms.DiceTerm = saveRolls[0].terms[0];
        const diceRoll = dterm?.results?.find(result => result.active)?.result ?? saveRollTotal;
        //@ts-expect-error
        isFumble = diceRoll <= (dterm.options?.fumble ?? 1)
        //@ts-expect-error
        isCritical = diceRoll >= (dterm.options?.critical ?? 20);
      }
      if (isFumble) this.fumbleSaves.add(target);
      if (isCritical) this.criticalSaves.add(target);
      if (this.checkSuperSaver(target, this.saveActivity?.save?.ability))
        this.superSavers.add(target);
      if (this.checkSemiSuperSaver(target, this.saveActivity?.save?.ability))
        this.semiSuperSavers.add(target);

      if (this.item.flags[MODULE_ID]?.isConcentrationCheck) {
        const checkBonus = foundry.utils.getProperty(target, `actor.flags.${MODULE_ID}.concentrationSaveBonus`);
        if (checkBonus) {
          //@ts-expect-error
          const D20Roll = CONFIG.Dice.D20Roll;
          const rollBonus = (await new D20Roll(`${checkBonus}`, (target.actor as Actor)?.getRollData()).evaluate());
          result = addRollTo(result[0], rollBonus);
          saveRolls[0] = result;
          saveRollTotal = result.reduce((acc, r) => acc + r.total, 0);
          //TODO 
          // rollDetail = (await new D20Roll(`${rollDetail.total} + ${rollBonus}`).evaluate());
          saved = saveRollTotal >= resultDC;
          if (checkRule("criticalSaves")) { // normal d20 roll/monks roll
            saved = (isCritical || saveRollTotal >= resultDC) && !isFumble;
          }
        }
      }

      if (saved) {
        this.saves.add(target);
        this.failedSaves.delete(target);
      } else {
        this.saves.delete(target);
        this.failedSaves.add(target);
      }

      if (game.user?.isGM) log(`Ability save/check: ${target.name} rolled ${saveRollTotal} vs ${rollAbility} DC ${rollDC}`);
      let adv = "";
      if (configSettings.displaySaveAdvantage) {
        if (game.system?.id === "dnd5e") {
          adv = this.advantageSaves.has(target) ? `(${i18n("DND5E.Advantage")})` : "";
          if (this.disadvantageSaves.has(target)) adv = `(${i18n("DND5E.Disadvantage")})`;
        } else if (game.system?.id === "sw5e") {
          adv = this.advantageSaves.has(target) ? `(${i18n("SW5E.Advantage")})` : "";
          if (this.disadvantageSaves.has(target)) adv = `(${i18n("SW5E.Disadvantage")})`;
        }
      }
      if (coverSaveBonus) adv += `(+${coverSaveBonus} Cover)`
      let img: string = targetDocument?.texture?.src ?? target.actor.img ?? "";
      // @ts-expect-error no dnd5e-types
      if (configSettings.usePlayerPortrait && (target.actor as Actor).type === "character") {
        img = target.actor?.img ?? targetDocument?.texture?.src ?? "";
      }

      //@ts-expect-error
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
        img = await game.video?.createThumbnail(img, { width: 100, height: 100 }) ?? "";
      }

      let isPlayerOwned = (target.actor as Actor).hasPlayerOwner;
      let saveStyle = "";
      if (configSettings.highlightSuccess) {
        if (saved) saveStyle = "color: green;";
        else saveStyle = "color: red;";
      }
      const rollHTML = await midiRenderRoll(saveRolls[0]);
      this.saveRolls.push(saveRolls[0]);
      this.tokenSaves[getTokenDocument(target)?.uuid ?? "none"] = saveRolls[0];
      this.saveDisplayData.push({
        gmName: getTokenName(target),
        playerName: getTokenPlayerName(target),
        img,
        isPC: isPlayerOwned,
        target,
        saveSymbol: (rollDC === null) ? "" : (
          ((target.actor as Actor).hasPlayerOwner ? "" : "midi-qol-npc-save-symbol")
          + " midi-qol-save-symbol "
          + (saved ? "fa-check" : "fa-times")),
        saveTotalClass: (target.actor as Actor).hasPlayerOwner ? "" : "midi-qol-npc-save-total",
        saveToolTipClass: (target.actor as Actor).hasPlayerOwner ? "" : "midi-qol-npc-save-tooltip",
        rollTotal: saveRollTotal,
        rollDetail: saveRolls[0],
        rollHTML,
        id: target.id,
        adv,
        saveClass: (rollDC === null) ? "" : (saved ? "success" : "failure"),
      });
      i++;
    }
    this.saves = this.saves;
    this.failedSaves = this.failedSaves;
    this.superSavers = this.superSavers;
    this.semiSuperSavers = this.semiSuperSavers;
    this.criticalSaves = this.criticalSaves;
    this.fumbleSaves = this.fumbleSaves;
    this.advantageSaves = this.advantageSaves;
    this.saveDisplayFlavor = await this.computeSaveDisplayFlavor(rollDC, rollType, { rollAbility, rollSkill, rollTool });
  }

  async computeSaveDisplayFlavor(rollDC: number | undefined, rollType: string, options: { rollAbility: string, rollSkill: string, rollTool: string }): Promise<string> {
    let { rollAbility, rollSkill, rollTool } = options;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    let saveDisplayFlavor: string = "";
    let DCString = i18n(`${this.systemString}.AbbreviationDC`) ?? "DC";
    if (DCString === `${this.systgemString}.AbbreviationDC`) DCString = "DC";
    DCString = `${DCString} ${rollDC}`;
    if ((rollDC ?? -1) === -1) DCString = "";
    if (rollType === "save")
      saveDisplayFlavor = `<label class="midi-qol-saveDC">${DCString}</label> ${GameSystemConfig.abilities[rollAbility]?.label ?? rollAbility} ${i18n(allHitTargets.size > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw")}`;
    else if (rollType === "check")
      saveDisplayFlavor = `<label class="midi-qol-saveDC">${DCString}</label> ${GameSystemConfig.abilities[rollAbility]?.label ?? rollAbility} ${i18n(allHitTargets.size > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check")}:`;
    else if (rollType === "skill")
      saveDisplayFlavor = `<label class="midi-qol-saveDC">${DCString}</label> ${GameSystemConfig.skills[rollSkill]?.label ?? rollSkill}`;
    else if (rollType === "tool") {
      //@ts-expect-error documents
      const toolLabel = await game.system?.documents.Trait.keyLabel(`tool:${rollTool}`);
      saveDisplayFlavor = `<label class="midi-qol-saveDC">${DCString}</label> ${toolLabel}`;
    }
    return saveDisplayFlavor;
  }
  monksSavingCheck(message, update, options, user) {
    if (!update.flags || !update.flags["monks-tokenbar"]) return true;
    const updateFlags = update.flags["monks-tokenbar"];
    const mflags = message.flags["monks-tokenbar"];
    for (let key of Object.keys(mflags)) {
      if (!key.startsWith("token")) continue;
      if (!mflags[key].roll) continue;
      const requestId = key.replace("token", "");
      if (!mflags[key].reveal) continue; // Must be showing the roll
      if (this.saveRequests[requestId]) {
        let roll;
        try {
          roll = Roll.fromJSON(JSON.stringify(mflags[key].roll));
        } catch (err) {
          roll = foundry.utils.deepClone(mflags[key].roll);
        }

        const func = this.saveRequests[requestId];
        delete this.saveRequests[requestId];
        func(roll)
      }
    }
    return true;
  }

  async displayChatCardWithoutDamageDetail() {
    let chatMessage = getCachedDocument(this.itemCardUuid);
    //@ts-ignore content v10
    let content = (chatMessage && chatMessage.content) ?? "";
    let data;
    if (content) {
      data = chatMessage?.toObject(); // TODO check this v10
      content = data.content || "";
      let searchRe = /<div[^>]*?class="midi-qol-damage-roll">[\s\S]*?<div class="end-midi-qol-damage-roll">/;
      let replaceString = `<div class="midi-qol-damage-roll"><div class="end-midi-qol-damage-roll">`
      content = content.replace(searchRe, replaceString);
      searchRe = /<div[^>]*?class="midi-qol-other-roll"[\s\S]*?<div class="end-midi-qol-other-roll">/;
      replaceString = `<div class="midi-qol-other-roll"><div class="end-midi-qol-other-roll">`
      content = content.replace(searchRe, replaceString);
      searchRe = /<div[^>]*?class="midi-qol-bonus-roll">[\s\S]*?<div class="end-midi-qol-bonus-roll">/;
      replaceString = `<div class="midi-qol-bonus-roll"><div class="end-midi-qol-bonus-roll">`
      content = content.replace(searchRe, replaceString);
    }
    if (installedModules.get("ready-set-roll-5e")) return;
    if (data && this.currentAction === this.WorkflowState_Completed) {
      if (this.itemCardUuid) {
        await Workflow.removeItemCardButtons(this.itemCardUuid, { removeAllButtons: true });
        // await Workflow.removeItemCardConfirmRollButton(this.itemCardUuid);
      }
      delete data._id;
      const itemCard = await CONFIG.ChatMessage.documentClass.create(data);
      this.itemCardUuid = itemCard?.uuid;
    }
  }

  async callV3DamageHooks(damages, token: Token) {
    this.damageItem = damages;
    if (configSettings.allowUseMacro && !this.workflowOptions?.noTargetOnUseMacro && this.item?.flags) {
      await this.triggerTargetMacros(["preTargetDamageApplication"], new Set([token]));
    }
    await asyncHooksCallAll(`midi-qol.preTargetDamageApplication`, token, { item: this.item, workflow: this, damageItem: damages, ditem: damages });

    if (damages.hpDamage !== 0 && (this.hitTargets.has(token) || this.hitTargetsEC.has(token) || this.otherActivity?.save || this.otherActivity?.check)) {
      let healedDamaged = damages.hpDamage < 0 ? "isHealed" : "isDamaged";
      await asyncHooksCallAll(`midi-qol.${healedDamaged}`, token, { item: this.item, workflow: this, damageItem: damages, ditem: damages });
      const actorOnUseMacros = foundry.utils.getProperty(token.actor ?? {}, `flags.${MODULE_ID}.onUseMacroParts`) ?? new OnUseMacros();
      // It seems applyTokenDamageMany without a this gets through to here - so a silly guard in place TODO come back and fix this properly
      if (this.callMacros) await this.callMacros(this.item,
        actorOnUseMacros?.getMacros(healedDamaged),
        "TargetOnUse",
        healedDamaged,
        { actor: token.actor, token: token });
      healedDamaged = damages.hpDamage < 0 ? "isHealed" : "isDamaged";  //recalculate what the total damage and trigger the correct special duration expiration.
      const expiredEffects = getAppliedEffects(token?.actor, { includeEnchantments: true }).filter(ef => {
        const specialDuration = foundry.utils.getProperty(ef, "flags.dae.specialDuration");
        if (!specialDuration) return false;
        return specialDuration.includes(healedDamaged);
      }).map(ef => ef.uuid)
      if (expiredEffects?.length ?? 0 > 0) {
        await timedAwaitExecuteAsGM("removeEffectUuids", {
          actorUuid: (token.actor as Actor)?.uuid,
          effects: expiredEffects,
          options: { "expiry-reason": `midi-qol:${healedDamaged}` }
        });
      }
    }
    // Call the preDamageApplication hook which can change the damage
    if (configSettings.allowUseMacro && this.item?.flags) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication", damages);
    }
    Object.assign(damages, this.damageItem);

  }

  processDefenceRoll(message, html, data) {
    if (!this.defenceRequests) return true;
    const requestId = message?.speaker?.actor;
    if (debugEnabled > 0) warn("processDefenceRoll |", requestId, this.saveRequests)

    if (!requestId) return true;
    if (!this.defenceRequests[requestId]) return true;

    clearTimeout(this.defenceTimeouts[requestId]);
    const handler = this.defenceRequests[requestId]
    delete this.defenceRequests[requestId];
    delete this.defenceTimeouts[requestId];
    handler(message.rolls[0])
    return true;
  }

  processSaveRoll(message, html, data) {
    if (!this.saveRequests) return {};
    const ddbglFlags = message.flags && message.flags["ddb-game-log"];
    const isDDBGL = ddbglFlags?.cls === "save" && !ddbglFlags?.pending;
    const midiFlags = message.flags && message.flags[MODULE_ID];
    const isRoll = message.flags?.dnd5e?.messageType === "roll";
    let requestId = message?.speaker?.token;
    if (!requestId && isDDBGL) requestId = message?.speaker?.actor;
    if (debugEnabled > 0) warn("processSaveRoll |", requestId, this.saveRequests)
    if (!requestId) return true;

    // TODO check the roll against the sort of roll we are waiting for.
    if (!this.saveRequests[requestId] || !isRoll) return true;

    if (this.saveRequests[requestId]) {
      clearTimeout(this.saveTimeouts[requestId]);
      const handler = this.saveRequests[requestId]
      delete this.saveRequests[requestId];
      delete this.saveTimeouts[requestId];
      if (configSettings.undoWorkflow) {
        this.undoData.chatCardUuids = this.undoData.chatCardUuids.concat([message.uuid]);
        unTimedExecuteAsGM("updateUndoChatCardUuids", this.undoData);
      }
      handler(message.rolls[0])
    }
    const saveDisplay = (this.activity?.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity?.saveDisplay;
    if (game.user?.id !== message.author.id && !["allShow"].includes(saveDisplay)) {
      setTimeout(() => html.remove(), 100);
    }
    return true;
  }

  checkSuperSaver(token, abilities: Set<string> | undefined): boolean {
    if (!abilities) return false;
    for (let ability of abilities.values()) {
      const actor = token.actor ?? {};
      const flags = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.superSaver`);
      if (!flags) return false;
      if (flags?.all) {
        const flagVal = evalActivationCondition(this, flags.all, token, { errorReturn: false });
        if (flagVal) return true;
      }
      if (foundry.utils.getProperty(flags, `${ability}`)) {
        const flagVal = evalActivationCondition(this, foundry.utils.getProperty(flags, `${ability}`), token, { errorReturn: false });
        if (flagVal) return true;
      }
      if (foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.sculptSpells`) && this.item?.school === "evo" && this.preSelectedTargets.has(token)) {
        return true;
      }
    }
    return false;
  }

  checkSemiSuperSaver(token, abilities: Set<string> | undefined) {
    if (!abilities) return false;
    for (let ability of abilities.values()) {
      const actor = token.actor ?? {};
      const flags = foundry.utils.getProperty(actor, `flags.${MODULE_ID}.semiSuperSaver`);
      if (!flags) return false;
      if (flags?.all) {
        const flagVal = evalActivationCondition(this, flags.all, token, { errorReturn: false });
        if (flagVal) return true;
      }
      if (foundry.utils.getProperty(flags, `${ability}`)) {
        const flagVal = evalActivationCondition(this, foundry.utils.getProperty(flags, `${ability}`), token, { errorReturn: false });
        if (flagVal) return true;
      }
    }
    return false;
  }

  processCustomRoll(customRoll: any) {
    const formula = "1d20";
    const isSave = customRoll.fields.find(e => e[0] === "check");
    if (!isSave) return true;
    const rollEntry = customRoll.entries?.find((e) => e.type === "multiroll");
    let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
    let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
    let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
    return ({ total, formula, terms: [{ options: { advantage, disadvantage } }] });
  }

  async processAttackRoll() {
    if (!this.attackRoll) return;
    const terms = this.attackRoll.terms;

    if (terms[0] instanceof NumericTerm) {
      this.diceRoll = Number(terms[0].total);
    } else {
      this.diceRoll = Number(terms[0].total)
      //TODO find out why this is using results - seems it should just be the total
      // this.diceRoll = terms[0].results.find(d => d.active).result;
    }
    // @ts-expect-error no dnd5e-types
    let criticalThreshold = this.attackRoll.options.criticalSuccess ?? 20;
    if (this.targets.size > 0) {
      const midiFlags = this.targets.first()?.actor?.flags[MODULE_ID];
      let targetCrit = criticalThreshold;
      if (midiFlags?.grants?.criticalThreshold) {
        const conditionData = createConditionData({ workflow: this, target: this.targets.first(), actor: this.actor });
        targetCrit = await evalCondition(midiFlags.grants.criticalThreshold, conditionData, { errorReturn: criticalThreshold, async: true });
      }
      if (isNaN(targetCrit) || !Number.isNumeric(targetCrit)) targetCrit = criticalThreshold;
      criticalThreshold = Math.min(criticalThreshold, targetCrit);
    }
    this.isCritical = this.diceRoll >= criticalThreshold;
    const midiFumble = this.item && foundry.utils.getProperty(this.item, `flags.${MODULE_ID}.fumbleThreshold`);
    //@ts-expect-error .funble
    let fumbleTarget = this.attackRoll.terms[0].options.criticalFailure ?? 1;
    if (Number.isNumeric(midiFumble)) fumbleTarget = midiFumble;
    this.isFumble = this.diceRoll <= fumbleTarget;
    this.attackTotal = this.attackRoll.total ?? 0;
    if (debugEnabled > 1) debug("processAttackRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble);
  }

  async checkHits(options: { workflowOptions?: any, noOnuseMacro?: boolean, noTargetOnUseMacro?: boolean } = {}) {
    let isHit = true;
    let isHitEC = false;

    let item = this.item;
    const activity = this.activity;
    // check for a hit/critical/fumble
    if (this.activity.target?.affects?.type === "self") {
      this.targets = await getOrCreateTokenForActorAsSet(this.actor);
    }
    if (!this.useActiveDefence) {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set(); //TODO wonder if this can work with active defence?
    };
    this.hitDisplayData = {};
    const challengeModeArmorSet = !([undefined, false, "none"].includes(checkRule("challengeModeArmor")));
    for (let targetToken of this.targets) {
      let targetName = configSettings.useTokenNames && targetToken.name ? targetToken.name : (targetToken.actor as Actor)?.name;
      //@ts-expect-error dnd5e v10
      let targetActor: globalThis.dnd5e.documents.Actor5e = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      let targetAC: number = Number.parseInt(targetActor.system.attributes.ac.value ?? 10);
      let attackBonus = 0;
      const wjVehicle = installedModules.get("wjmais") ? foundry.utils.getProperty(targetActor, "flags.wjmais.crew.min") != null : false;
      if (targetActor.type === "vehicle" && !wjVehicle) {
        const inMotion = foundry.utils.getProperty(targetActor, `flags.${MODULE_ID}.inMotion`);
        if (inMotion) targetAC = Number.parseInt(targetActor.system.attributes.ac.flat ?? 10);
        else targetAC = Number.parseInt(targetActor.system.attributes.ac.motionless);
        if (isNaN(targetAC)) {
          console.warn("Error when getting vehicle armor class make sure motionless is set");
          targetAC = 10;
        }
      }
      let hitResultNumeric;

      let targetEC = targetActor.system.attributes.ac.EC ?? 0;
      let targetAR = targetActor.system.attributes.ac.AR ?? 0;

      let bonusAC = 0;

      isHit = false;
      isHitEC = false;
      let attackTotal = this.attackTotal;

      if (this.useActiveDefence) {
        isHit = this.hitTargets.has(targetToken);
        hitResultNumeric = "";
      } else {
        const noCoverFlag = foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.ignoreCover`);
        let ignoreCover = false;
        if (noCoverFlag) {
          const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
          ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.ignoreCover`, conditionData);
        }
        if (this.activity?.actionType === "rsak" && foundry.utils.getProperty(this.actor, "flags.dnd5e.spellSniper")) {
          const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
          ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.dnd5e.spellSniper`, conditionData);
        }
        const sharpShooterFlag = foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.sharpShooter`) || foundry.utils.getProperty(this.actor, `flags.dnd5e.sharpShooter`);
        if (this.activity?.actionType === "rwak" && sharpShooterFlag) {
          const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
          ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.sharpShooter`, conditionData);
          ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.dnd5e.sharpShooter`, conditionData);
        }
        if (this.token) bonusAC = computeCoverBonus(this.token, targetToken, activity);
        if (ignoreCover && bonusAC < FULL_COVER) bonusAC = 0;
        targetAC += bonusAC;

        const midiFlagsAttackBonus = foundry.utils.getProperty(targetActor, `flags.${MODULE_ID}.grants.attack.bonus`);
        if (!this.isFumble) {
          if (midiFlagsAttackBonus) {
            if (midiFlagsAttackBonus?.all) {
              const attackBonusRoll = await (new Roll(midiFlagsAttackBonus.all, targetActor.getRollData()))?.evaluate();
              attackBonus = attackBonusRoll?.total ?? 0;
              foundry.utils.setProperty(this.actor, "flags.midi.evaluated.grants.attack.bonus.all", { value: attackBonus, effects: [`${targetActor.name}`] });
            }
            if (midiFlagsAttackBonus[activity.actionType]) {
              const attackBonusRoll = await (new Roll(midiFlagsAttackBonus[activity.actionType], targetActor.getRollData())).evaluate();
              attackBonus = attackBonusRoll?.total ?? 0;
              foundry.utils.setProperty(this.actor, `flags.midi.evaluated.grants.attack.bonus.${activity.actionType}`, { value: attackBonus, effects: [`${targetActor.name}`] });
            }
          }
          if (challengeModeArmorSet) isHit = attackTotal > targetAC || this.isCritical;
          else {
            if (this.attackRoll && !foundry.utils.getProperty(this.item, `flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
              const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item?.uuid }, { inplace: false, overwrite: true });
              const result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reactionattacked", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
              // TODO what else to do once rolled
              targetAC = Number.parseInt(targetActor.system.attributes.ac.value ?? 10) + bonusAC;
            }
            isHit = (attackTotal + attackBonus) >= targetAC || this.isCritical;
          }
          if (bonusAC === FULL_COVER) isHit = false; // bonusAC will only be FULL_COVER if cover bonus checking is enabled.

          if (targetEC) isHitEC = challengeModeArmorSet && attackTotal <= targetAC && attackTotal >= targetEC && bonusAC !== FULL_COVER;
          // check to see if the roll hit the target
          if ((isHit || isHitEC) && this.activity?.attack && this.attackRoll && targetToken !== null && !foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
            const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item?.uuid }, { inplace: false, overwrite: true });
            // reaction is the same as reactionhit to accomodate the existing reaction workflow
            let result;
            if (!foundry.utils.getProperty(this.item, `flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
              result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reaction", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
            }
            if (!Workflow.getWorkflow(this.id)) // workflow has been removed - bail out
              return;
            targetAC = Number.parseInt(targetActor.system.attributes.ac.value) + bonusAC;
            if (targetEC) targetEC = targetActor.system.attributes.ac.EC + bonusAC;
            if (result.ac) targetAC = result.ac + bonusAC; // deal with bonus ac if any.
            if (targetEC) targetEC = targetAC - targetAR;
            if (bonusAC === FULL_COVER) isHit = false; // bonusAC will only be FULL_COVER if cover bonus checking is enabled.
            isHit = (attackTotal + attackBonus >= targetAC || this.isCritical) && result.name !== "missed";
            if (challengeModeArmorSet) isHit = this.attackTotal >= targetAC || this.isCritical;
            if (targetEC) isHitEC = challengeModeArmorSet && this.attackTotal <= targetAC && this.attackTotal >= targetEC;
          } else if ((!isHit && !isHitEC) && this.activity?.attack && this.attackRoll && targetToken !== null && !foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.noProvokeReaction`)) {
            const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item?.uuid }, { inplace: false, overwrite: true });
            if (!foundry.utils.getProperty(this.item, `flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
              let result;
              if (isHit || isHitEC) {
                result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reactionhit", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
              }
              else
                result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reactionmissed", { activity: this.activity, item: this.item, workflow: this, workflowOptions });

            }
            // TODO what else to do once rolled
          }
          const optionalCrits = checkRule("optionalCritRule");
          if (this.targets.size === 1 && optionalCrits !== false && optionalCrits > -1) {
            if (checkRule("criticalNat20") && this.isCritical) {
            } else {
              this.isCritical = attackTotal >= targetAC + optionalCrits;
            }
          }
          hitResultNumeric = this.isCritical ? "++" : `${attackTotal}/${Math.abs(attackTotal - targetAC)}`;
        }

        // TODO come back and parameterise with flags and actor to use

        const midiFlagsActorFail = foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.fail`);
        if (midiFlagsActorFail) {
          const conditionData = createConditionData({ workflow: this, target: this.token, actor: this.actor });
          if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.fail.all`, conditionData)
            || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.fail.attack`, conditionData)
            || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.fail.attack.${activity.actionType}`, conditionData)) {
            isHit = false;
            isHitEC = false;
            this.isCritical = false;
          }
        }
        const midiFlagsActorSuccess = foundry.utils.getProperty(this.actor, `flags.${MODULE_ID}.success`);
        if (midiFlagsActorSuccess) {
          const conditionData = createConditionData({ workflow: this, target: this.token, actor: this.actor });
          if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.success.all`, conditionData)
            || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.success.attack.all`, conditionData)
            || await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.success.attack.${activity.actionType}`, conditionData)) {
            isHit = true;
            isHitEC = false;
            this.isFumble = false;
          }
        }

        const midiFlagsGrantsAttackSuccess = foundry.utils.getProperty(targetActor, `flags.${MODULE_ID}.grants.attack.success`);
        const midiFlagsGrantsAttackFail = foundry.utils.getProperty(targetActor, `flags.${MODULE_ID}.grants.attack.fail`);
        let conditionData;
        if (midiFlagsGrantsAttackSuccess || midiFlagsGrantsAttackFail) {
          conditionData = createConditionData({ workflow: this, target: this.token, actor: this.actor });

          if (await evalAllConditionsAsync(targetActor, `flags.${MODULE_ID}.grants.attack.success.all`, conditionData)
            || await evalAllConditionsAsync(targetActor, `flags.${MODULE_ID}.grants.attack.success.${activity.actionType}`, conditionData)) {
            isHit = true;
            isHitEC = false;
            this.isFumble = false;
          }
          if (await evalAllConditionsAsync(targetActor, `flags.${MODULE_ID}.grants.attack.fail.all`, conditionData)
            || await evalAllConditionsAsync(targetActor, `flags.${MODULE_ID}.grants.attack.fail.${activity.actionType}`, conditionData)) {
            isHit = false;
            isHitEC = false;
            this.isCritical = false;
          }
        }

        let hitScale = 1;
        if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && !this.isCritical) hitScale = Math.floor((this.attackTotal - targetEC + 1) / ((targetActor?.system.attributes.ac.AR ?? 0) + 1) * 10) / 10;
        if (!this.challengeModeScale) this.challengeModeScale = {};
        this.challengeModeScale[(targetToken.actor as Actor)?.uuid ?? "dummy"] = hitScale;
        if (this.isCritical) isHit = true;
        if (isHit || this.isCritical) this.hitTargets.add(targetToken);
        if (isHitEC) this.hitTargetsEC.add(targetToken);
        if (isHit || isHitEC) await this.processCriticalFlags();
        // This was set by computeCoverBonus so clear it after use.
        foundry.utils.setProperty(targetActor, `flags.${MODULE_ID}.acBonus`, 0);
      }
      if (game.user?.isGM) log(`${this.speaker.alias} Rolled a ${this.attackTotal + attackBonus} to hit ${targetName} 's AC of ${targetAC} ${(isHit || this.isCritical) ? "hitting" : "missing"}`);
      // Log the hit on the target
      let attackType = ""; //item?.name ? i18n(item.name) : "Attack";

      let hitSymbol = "fa-blank"
      // if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && !this.isCritical) hitScale = Math.floor(this.challengeModeScale[targetActor.uuid]);
      let isHitResult = "miss";
      if (game.user?.isGM && ["hitDamage", "all"].includes(configSettings.hideRollDetails) && (this.isCritical || this.isHit || this.isHitEC)) {
        isHitResult = "hit";
        hitSymbol = "fa-tick";
      } else if (this.isCritical) {
        isHitResult = "critical";
        hitSymbol = "fa-check-double"
      } else if (game.user?.isGM && this.isFumble && ["hitDamage", "all"].includes(configSettings.hideRollDetails)) {
        isHitResult = "miss";
        hitSymbol = "fa-times";
      } else if (this.isFumble) {
        isHitResult = "fumble";
        hitSymbol = "fa-times";
      } else if (isHit) {
        isHitResult = "hit";
        hitSymbol = "fa-check";
      } else if (isHitEC && ["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor"))) {
        isHitResult = "hitEC";
        hitSymbol = "fa-check";
      } else if (isHitEC) {
        isHitResult = "hitEC";
        hitSymbol = "fa-check";
      } else {
        isHitResult = "miss";
        hitSymbol = "fa-times";
      }
      let hitStyle = "";
      /* success highlighting needs to be in chatmessage handling
      if (configSettings.highlightSuccess && safeGetGameSetting("dnd5e", "attackVisibility") !== "none") {
        if (isHit || isHitEC) hitStyle = "color: green;";
        else hitStyle = "color: red;";
      }
      */
      //TODO work out how to do
      if (attackTotal !== this.attackTotal) {
        if (!configSettings.displayHitResultNumeric &&
          (!game.user?.isGM || ["none", "detailsDSN", "details"].includes(configSettings.hideRollDetails))) {
          // hitString = `(${attackTotal}) ${hitString}`; // prepend the modified hit roll
        } else {
          // hitString = `(${attackTotal - this.attackTotal}) ${hitString}`; // prepend the diff in the modified roll
        }
      }

      // @ts-expect-error v13ism
      let img = (targetToken instanceof foundry.canvas.placeables.Token ? targetToken.document : targetToken)?.texture?.src || (targetToken.actor as Actor).img;
      // @ts-expect-error no dnd5e-types
      if (configSettings.usePlayerPortrait && (targetToken.actor as Actor)?.type === "character") {
        // @ts-expect-error v13ism
        img = (targetToken.actor as Actor).img || (targetToken instanceof foundry.canvas.placeables.Token ? targetToken.document : targetToken)?.texture?.src;
      }
      //@ts-expect-error
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img ?? "")) {
        img = await game.video?.createThumbnail(img ?? "", { width: 100, height: 100 }) ?? "";
      }
      // If using active defence hitTargets are up to date already.
      if (this.useActiveDefence) {
        if (this.activeDefenceRolls[getTokenDocument(targetToken)?.uuid ?? ""]) {
          const adRoll = this.activeDefenceRolls[getTokenDocument(targetToken)?.uuid ?? ""] ?? {};
          targetAC = adRoll.result ?? adRoll.total;
          // const adRoll = this.activeDefenceRolls[getTokenDocument(targetToken)?.uuid ?? ""] ?? {};
          // hitString = `(${adRoll.result ?? adRoll.total}): ${hitString}`
        }
      }
      if (this.isFumble) hitResultNumeric = "--";
      const targetUuid = getTokenDocument(targetToken)?.uuid ?? "";

      let acBonusString = "";
      let targetACString = `${targetAC}`;
      if (attackBonus || bonusAC) {
        //@ts-expect-error no dnd5e-types
        acBonusString = ` (${targetToken.actor?.system.attributes.ac?.value ?? 10}`;
        if (attackBonus) {
          acBonusString += `-${attackBonus}`;
          targetACString = `${targetAC - attackBonus}`;
        }
        if (bonusAC) acBonusString += `+${bonusAC}`;
        acBonusString += ")";
      }
      const acDisplay = `${targetACString}${acBonusString}`;

      this.hitDisplayData[targetUuid] = {
        isPC: (targetToken.actor as Actor)?.hasPlayerOwner,
        target: targetToken,
        actorUuid: (targetToken.actor as Actor).uuid,
        tokenuuid: targetUuid,
        hitStyle,
        attackBonus,
        ac: targetAC - attackBonus,
        acDisplay,
        baseAc: targetAC - bonusAC,
        hitClass: ["hit", "critical", "isHitEC"].includes(isHitResult) ? "success" : "failure",
        acClass: (targetToken.actor as Actor).hasPlayerOwner ? "" : "midi-qol-npc-ac",
        hitSymbol,
        attackType,
        showAC: true,
        img,
        gmName: getIconFreeLink(targetToken),
        // @ts-expect-error v13ism
        playerName: getTokenPlayerName((targetToken instanceof foundry.canvas.placeables.Token ? targetToken.document : targetToken) as TokenDocument),
        bonusAC,
        hitResultNumeric,
        attackTotal
      };
    }
    if (configSettings.allowUseMacro && !options.noTargetOnUseMacro) await this.triggerTargetMacros(["isHit"], new Set([...this.hitTargets, ...this.hitTargetsEC]));
    if (configSettings.allowUseMacro && !options.noTargetOnUseMacro) await this.triggerTargetMacros(["isMissed"], this.targets.difference(this.hitTargets).difference(this.hitTargetsEC));
    this.hitTargets = this.hitTargets; // force update
    this.hitTargetsEC = this.hitTargetsEC; // force update
  }

  async activeDefence(item, roll) {
    // Roll is d20 + AC - 10
    let hookId = Hooks.on("renderChatMessage", this.processDefenceRoll.bind(this));
    try {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      this.defenceRequests = {};
      this.defenceTimeouts = {};
      this.activeDefenceRolls = {};
      this.isCritical = false;
      this.isFumble = false;
      // Get the attack bonus for the attack
      const attackBonus = roll.total - roll.dice[0].total; // TODO see if there is a better way to work out roll plusses
      await this.checkActiveAttacks(attackBonus, false, 20 - (roll.options.fumble ?? 1) + 1, 20 - (roll.options.critical ?? 20) + 1);
      this.hitTargets = this.hitTargets; // force update
    } catch (err) {
      TroubleShooter.recordError(err, "activeDefence");
    } finally {
      Hooks.off("renderChatMessage", hookId);
    }
    return this.performState(this.WorkflowState_AttackRollComplete);
  }

  get useActiveDefence() {
    return game.user?.isGM && checkRule("activeDefence");
  }

  async checkActiveAttacks(attackBonus = 0, whisper = false, fumbleTarget, criticalTarget) {
    if (debugEnabled > 1) debug(`active defence : whisper ${whisper}  hit targets ${this.targets}`)
    if (this.targets.size <= 0) {
      return;
    }
    this.activeDefenceDC = 12 + attackBonus;

    let promises: Promise<any>[] = [];

    for (let target of this.targets) {
      if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
      let advantage: boolean | undefined = undefined;
      // @ts-expect-error no dnd5e-types
      let advantageMode = game.system.dice.D20Roll.ADV_MODE.NORMAL;
      const targetActorSystem = target.actor.system;

      // TODO: Add in AC Bonus for cover
      // @ts-expect-error no dnd5e-types
      const dcMod = targetActorSystem.attributes.ac.value - 10;
      let modString;
      if (dcMod < 0) modString = ` ${dcMod}`;
      else if (dcMod == 0) modString = "";
      else modString = `+ ${dcMod}`;
      let formula = `1d20${modString}`;
      // Advantage/Disadvantage is reversed for active defence rolls.
      const wfadvantage = this.advantage || this.rollOptions.advantage;
      const wfdisadvantage = this.disadvantage || this.rollOptions.disadvantage;
      if (wfadvantage && !wfdisadvantage) {
        advantage = false;
        formula = `2d20kl${modString}`;
        // @ts-expect-error no dnd5e-types
        advantageMode = game.system.dice.D20Roll.ADV_MODE.DISADVANTAGE;
      } else if (!wfadvantage && wfdisadvantage) {
        // @ts-expect-error no dnd5e-types
        advantageMode = game.system.dice.D20Roll.ADV_MODE.ADVANTAGE;
        advantage = true;
        formula = `2d20kh${modString}`;
      }
      // @ts-expect-error v13ism
      var player = playerFor(target instanceof foundry.canvas.placeables.Token ? target : target.object);
      // if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
      if (debugEnabled > 0) warn(`checkSaves | Player ${player?.name} controls actor ${(target.actor as Actor).name} - requesting ${this.activity.save.ability} save`);
      if (player && player.active && !player.isGM) {
        promises.push(new Promise((resolve) => {
          const requestId = (target.actor as Actor)?.uuid ?? foundry.utils.randomID();
          const playerId = player?.id;
          this.defenceRequests[requestId] = resolve;
          requestPCActiveDefence(player, target.actor, advantage, this.item.name, this.activeDefenceDC, formula, requestId, { workflow: this })
          // set a timeout for taking over the roll
          if (configSettings.playerSaveTimeout > 0) {
            this.defenceTimeouts[requestId] = setTimeout(async () => {
              if (this.defenceRequests[requestId]) {
                delete this.defenceRequests[requestId];
                delete this.defenceTimeouts[requestId];
                //@ts-expect-error
                const result = await (new game.system.dice.D20Roll(formula, {}, { advantageMode })).evaluate();
                result.toMessage({ flavor: `${this.item.name} ${i18n("midi-qol.ActiveDefenceString")}` });

                resolve(result);
              }
            }, configSettings.playerSaveTimeout * 1000);
          }
        }));
      } else {  // must be a GM so can do the roll direct
        promises.push(
          new Promise(async (resolve) => {
            //@ts-expect-error
            const result = await (new game.system.dice.D20Roll(formula, {}, { advantageMode })).evaluate();
            displayDSNForRoll(result, "attackRoll")
            resolve(result);
          })
        );
      }
    }
    if (debugEnabled > 1) debug("check saves: requests are ", this.saveRequests)
    var results = await Promise.all(promises);

    this.rollResults = results;
    let i = 0;
    for (let target of this.targets) {
      if (!target.actor) continue; // these were skipped when doing the rolls so they can be skipped now
      if (!results[i]) {
        const message = `Token ${target?.name} ${getTokenDocument(target)?.uuid}, "could not roll active defence assuming 1`;
        error(message, target);
        TroubleShooter.recordError(new Error(message), message);
        //@ts-expect-error
        const D20Roll = CONFIG.Dice.D20Roll;
        results[i] = await new D20Roll("1").evaluate();
      }
      const result = results[i];
      let rollTotal = results[i]?.total || 0;
      this.isCritical = result.dice[0].total <= criticalTarget
      this.isFumble = result.dice[0].total >= fumbleTarget;
      this.activeDefenceRolls[getTokenDocument(target)?.uuid ?? ""] = results[i];
      let hit = this.isCritical || rollTotal < this.activeDefenceDC;
      if (hit) {
        this.hitTargets.add(target);
      } else this.hitTargets.delete(target);
      if (game.user?.isGM) log(`Ability active defence: ${target.name} rolled ${rollTotal} vs attack DC ${this.activeDefenceDC}`);
      i++;
    }
  }

  async setAttackRoll(roll: Roll) {
    this.attackRoll = roll;
    foundry.utils.setProperty(roll, "options.midi-qol.rollType", "attack");
    this.attackTotal = roll.total ?? 0;
    // foundry.utils.setProperty(roll, "options.flavor", `${this.otherDamageItem.name} - ${i18nSystem("Bonus")}`);
    this.attackRollHTML = await midiRenderAttackRoll(roll);
  }

  async setUtilityRolls(rolls: Array<Roll> | Roll | undefined | null) {
    if (!rolls) {
      this.utilityRolls = undefined;
      return;
    };
    if (rolls instanceof Roll) rolls = [rolls];
    this.utilityRolls = rolls;
    this.utilityRollHTML = "";
    for (let roll of this.utilityRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "utility");
      this.utilityRollHTML += await midiRenderRoll(roll);
    }
  }

  setUtilityRoll(roll: Roll) {
    this.setUtilityRolls([roll]);
  }

  convertRollToDamageRoll(roll) {
    //@ts-expect-error
    const DamageRoll = CONFIG.Dice.DamageRoll;
    if (!(roll instanceof DamageRoll)) { // we got passed a normal roll which really should be a damage roll
      let damageType = MQdefaultDamageType;
      if (roll.terms[0].options.flavor && getDamageType(roll.terms[0].options.flavor)) {
        damageType = getDamageType(roll.terms[0].options.flavor);
      } else if (this.activity.hasDamage) damageType = this.activity.damage.parts[0]?.[1];
      else if (this.activity.hasHealing) damageType = this.activity.healing.types[0] ?? "healing";
      const message = `convertRollToDamageRoll: roll is not a damage roll, setting type to ${damageType}`;
      TroubleShooter.recordError(new Error(message));
      console.error("convertRollToDamageRoll: roll is not a damage roll", DamageRoll.fromRoll(roll, {}, { type: damageType }));
      return new DamageRoll.fromRoll(roll.formula, {}, { type: damageType })[0];
    }
    return roll;
  }

  async setDamageRoll(roll: Roll) {
    this.setDamageRolls([this.convertRollToDamageRoll(roll)]);
  }

  async addDamageRolls(rolls: Array<Roll> | Roll | undefined | null) {
    if (!rolls) return;
    if (rolls instanceof Roll) rolls = [rolls];
    if (!this.damageRolls) this.damageRolls = [];
    this.damageRolls = this.damageRolls.concat(rolls.map(roll => this.convertRollToDamageRoll(roll)));
    this.damageTotal = sumRolls(this.damageRolls, "positive")
    this.healingAdjustedDamageTotal = sumRolls(this.damageRolls, "negativeIgnoreTemp")
    this.damageRollHTML = "";
    for (let roll of this.damageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "defaultDamage");
      foundry.utils.setProperty(roll, "options.flavor", "");
      this.damageRollHTML += await midiRenderDamageRoll(roll);
    }
    this.rawDamageDetail = createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.damageDetail = this.rawDamageDetail; // createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    return;
  }

  async setDamageRolls(rolls: Array<Roll> | Roll | undefined | null) {
    if (!rolls) {
      this.damageRolls = [];
      return;
    };

    if (rolls instanceof Roll) rolls = [rolls];
    // @ts-expect-error no dnd5e-types
    const baseRollProperties = rolls[0]?.options?.properties ?? [];
    rolls.forEach(roll => {
      setRollOperatorEvaluated(roll);
    });

    for (let i = 0; i < rolls.length; i++) {
      rolls[i] = await rolls[i]; // only here in case someone passes an unawaited roll
      //@ts-expect-error
      if (!rolls[i]._evaluated) rolls[i] = await rolls[i].evaluate();
      //@ts-expect-error
      rolls[i]._evaluated = true;
    }
    for (let i = 1; i < rolls.length; i++) {
      // @ts-expect-error no dnd5e-types
      foundry.utils.setProperty(rolls[i], "options.properties", (rolls[i].options?.properties ?? []).concat(baseRollProperties));
    }
    this.damageRolls = rolls;
    this.damageTotal = sumRolls(this.damageRolls, "positive")
    this.healingAdjustedDamageTotal = sumRolls(this.damageRolls, "negativeIgnoreTemp")
    this.damageRollHTML = "";
    for (let roll of this.damageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "defaultDamage");
      foundry.utils.setProperty(roll, "options.flavor", "");

      this.damageRollHTML += await midiRenderDamageRoll(roll);
    }
    this.flavor = `${i18nSystem("Damage")}`;
    this.rawDamageDetail = createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.damageDetail = this.rawDamageDetail; // createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    return;
  }

  async setBonusDamageRolls(rolls: Array<Roll> | Roll | undefined | null) {
    if (!rolls) {
      this.bonusDamageRolls = undefined;
      this.rawBonusDamageDetail = [];
      return;
    };
    if (rolls instanceof Roll) rolls = [rolls];
    rolls.forEach(roll => {
      setRollOperatorEvaluated(roll);
    });

    for (let i = 0; i < rolls.length; i++) {
      rolls[i] = await rolls[i]; // only here in case someone passes an unawaited roll
      //@ts-expect-error
      if (!rolls[i]._evaluated) rolls[i] = await rolls[i].evaluate();
    }
    this.bonusDamageRolls = rolls;
    this.bonusDamageTotal = sumRolls(this.bonusDamageRolls, "positive");
    this.healingAdjustedBonusDamageTotal = sumRolls(this.bonusDamageRolls, "negativeIgnoreTemp");
    this.bonusDamageRollHTML = "";
    for (let roll of this.bonusDamageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "bonusDamage");
      this.bonusDamageRollHTML += await midiRenderBonusDamageRoll(roll);
    }
    this.rawBonusDamageDetail = createDamageDetailV4({ roll: this.bonusDamageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.bonusDamageDetail = createDamageDetailV4({ roll: this.bonusDamageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    return;
  }

  async setBonusDamageRoll(roll: Roll) {
    this.setBonusDamageRolls([this.convertRollToDamageRoll(roll)]);
  }

  async setOtherDamageRolls(rolls: Array<Roll> | Roll | undefined | null) {
    if (!rolls) {
      this.otherDamageRolls = undefined;
      this.rawOtherDamageDetail = [];
      return;
    };
    if (rolls instanceof Roll) rolls = [rolls];
    rolls.forEach(roll => {
      setRollOperatorEvaluated(roll);
    });

    for (let i = 0; i < rolls.length; i++) {
      rolls[i] = await rolls[i]; // only here in case someone passes an unawaited roll
      //@ts-expect-error
      if (!rolls[i]._evaluated) rolls[i] = await rolls[i].evaluate();
    }
    this.otherDamageRolls = rolls;
    this.otherDamageTotal = sumRolls(this.otherDamageRolls, "positive");
    this.healingAdjustedOtherDamageTotal = sumRolls(this.otherDamageRolls, "negativeIgnoreTemp");
    this.otherDamageRollHTML = "";
    for (let roll of this.otherDamageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "otherDamage");
      this.otherDamageRollHTML += await midiRenderOtherDamageRoll(roll);
    }
    this.rawOtherDamageDetail = createDamageDetailV4({ roll: this.otherDamageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.otherDamageDetail = createDamageDetailV4({ roll: this.otherDamageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    return;
  }

  async setOtherDamageRoll(roll: Roll) {
    this.setOtherDamageRolls([this.convertRollToDamageRoll(roll)]);
  }

  async chooseEffects(effects, options) {
    if (effects.length === 0) {
      if (debugEnabled > 0)
        warn(`chooseEffect | no effects found for ${this.item.name}`);
      return false;
    }
    let origin = effects[0].uuid; // item?.uuid;
    let returnValue = new Promise((resolve, reject) => {
      const callback = async function (dialog, html, event) {
        resolve(this);
      };

      const style = `
        <style>
        .dnd5e2.effectNoTarget.dialog .dialog-buttons button.dialog-button {
          border: 5px;
          margin: 0;
          display: grid;			
          grid-template-columns: 40px 150px;
          grid-gap: 5px
        }
           .dnd5e2.effectNoTarget.dialog .dialog-buttons button.dialog-button span {
          overflow: hidden;
            text-overflow: ellipsis;
          }
         .dnd5e2.effectNoTarget.dialog .window-header .window-title {
          visibility: visible;
          color: initial;
          text-align: center;
          font-weight: bold;
           }
        </style>`;
      function render([html]) {
        html.parentElement.querySelectorAll('.dialog-button').forEach((n) => {
          const img = document.createElement('IMG');
          const eff = MQfromUuidSync(n.dataset.button);
          //@ts-expect-error
          img.src = eff.img ?? eff.icon;
          const effNameSpan = document.createElement('span');
          effNameSpan.textContent = eff.name;
          n.innerHTML = '';
          n.appendChild(img);
          n.appendChild(effNameSpan);
          n.dataset.tooltip = eff.name;
        });
      }
      let buttons = {};
      for (let effect of effects) {
        buttons[effect.uuid] = {
          label: effect.name,
          callback: callback.bind(effect),
        };
      }
      //@ts-expect-error
      const Mixin = game.system.applications.DialogMixin(Dialog);
      const dialogOptions = {
        classes: ['dnd5e2', 'effectNoTarget', 'dialog'],
        width: 220,
        height: 'auto',
      };
      const data = {
        title: `${i18n('CONTROLS.CommonSelect')} ${i18n('DOCUMENT.ActiveEffect')}`,
        content: `${style}`,
        buttons,
        render,
        midiOptions: options,
      };

      let dialog = new Mixin(data, dialogOptions);
      dialog.render(true);
    });
    return [await returnValue];
  }
}
export class UserWorkflow extends Workflow {
  static get forceCreate() { return true; }
}

export class DamageOnlyWorkflow extends Workflow {
  //@ts-expect-error
  constructor(actor: globalThis.dnd5e.documents.Actor5e, token: Token, damageTotal: number, damageType: string, targets: [Token], roll: Roll,
    options: { flavor: string, itemCardId: string, itemCardUuid: string, damageList: [], useOther: boolean, itemData: any, isCritical: boolean, item?: Item, storeWorkflow?: boolean }) {
    if (options.storeWorkflow === undefined) options.storeWorkflow = true;
    if (!actor) actor = token.actor ?? targets[0]?.actor;
    const theTargets = Array.from(targets).map(t => getToken(t)).filter(t => t);
    let damageRoll = roll;
    if (!damageRoll) {
      // @ts-expect-error no dnd5e-types
      damageRoll = new CONFIG.Dice.DamageRoll(`${damageTotal}`, {}, { type: damageType }).evaluateSync();
    }
    let theItem: any = null;
    const extraItemData = {
      name: options.flavor ?? "Damage Only Workflow",
      type: "feat", _id: foundry.utils.randomID(),
      system: {
        activities: {
          dnd5eactivity000: {
            type: "damage",
            _id: foundry.utils.randomID(),
            damage: {
              // @ts-expect-error no dnd5e-types
              parts: [{ custom: { enabled: true, formula: damageRoll.formula }, types: [damageRoll.options.type] }],
            },
            range: {
              override: true,
              units: ""
            },
            midiProperties: {
              ignoreTraits: [],
              triggeredActivityId: "none",
              triggeredActivityConditionText: "",
              triggeredActivityTargets: "targets",
              triggeredActivityRollAs: "self",
              forceDialog: false,
              confirmTargets: "default",
              autoTargetType: "any",
              autoTargetAction: "default",
              automationOnly: false,
              otherActivityCompatible: true,
              identifier: ""
            },
            target: {
              affects: {
                type: "creature",
                special: ""
              }
            }
          }
        },
      }
    }
    // Create a synthetic item with a single damage activity - activity is needed for displaying the activity card if required
    if (options.item || options.itemData) { // use any item data passed in
      let itemData: any = options.item ? options.item.toObject() : options.itemData;
      if (itemData.system?.activities) delete itemData.system.activities;
      itemData = foundry.utils.mergeObject(itemData, extraItemData, { inplace: false });
      foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.syntheticItem`, true);
      foundry.utils.setProperty(itemData, "_id", itemData._id ?? foundry.utils.randomID());
      theItem = new CONFIG.Item.documentClass(itemData, { parent: actor });
    } else {
      foundry.utils.setProperty(extraItemData, `flags.${MODULE_ID}.syntheticItem`, true);
      //@ts-expect-error no dnd5e types
      theItem = new CONFIG.Item.documentClass(extraItemData, { parent: actor });
    }
    if (!theItem) return;

    // theItem.setFlag = async (scope: string, key: string, value: any) => { return theItem };
    theItem.prepareData();
    theItem.prepareFinalAttributes();
    super(actor, theItem.system.activities.contents[0], ChatMessage.getSpeaker({ token, actor }), new Set(theTargets), { event: shiftOnlyEvent, workflowOptions: { noOnUseMacro: true } });
    // Do the supplied damageRoll
    this.flavor = options.flavor;
    this.defaultDamageType = GameSystemConfig.damageTypes[damageType]?.label ?? damageType;
    // Since this could to be the same item don't roll the on use macro, since this could loop forever
    foundry.utils.setProperty(this.item, `flags.${MODULE_ID}.onUseMacroName`, null);
    this.stateTransitionCount = 0;
    if (options.itemCardId)
      foundry.utils.logCompatibilityWarning(
        "midi-qol | DamageOnlyWorkflow: itemCardId is deprecated, use itemCardUuid instead",
        { since: "midi-qol 12.4.32", until: "midi-qol 12.5.0" }
      );

    if (options.itemCardUuid) this.itemCardUuid = options.itemCardUuid;
    else {
      const message = game.messages?.get(options.itemCardId);
      if (message) this.itemCardUuid = message?.uuid;
    }
    this.setDamageRolls([damageRoll]).then(() => {
      this.damageTotal = damageTotal;
      this.isCritical = options.isCritical ?? false;
      this.kickStart = false;
      this.suspended = false;
      this.performState(this.WorkflowState_Start);
    })
    return this;
  }
  static get forceCreate() { return false; }
  async WorkflowState_Start(context: any = {}): Promise<WorkflowState> {
    this.effectsAlreadyExpired = [];

    // @ts-expect-error
    if (this.itemCardUuid === "new" || !fromUuidSync(this.itemCardUuid)) {
      const message = {}
      const messageConfig = foundry.utils.mergeObject({
        create: true,
        data: {
          flags: {
            dnd5e: {
              ...this.activity.messageFlags,
              messageType: "usage",
              use: {
                effects: this.applicableEffects?.map(e => e.id)
              }
            }
          },
          rolls: this.damageRolls,
        },
        hasConsumption: false
      }, message);
      this.itemCard = await this.activity._createUsageMessage(messageConfig);
      this.itemCardUuid = this.itemCard.uuid;
    }
    const whisperCard = configSettings.autoCheckHit === "whisper" || safeGetGameSetting("core", "rollMode") === CONST.DICE_ROLL_MODES.BLIND;
    if (this.actor) { // Hacky process bonus flags
      // TODO come back and fix this for dnd3
      const newRolls = await processDamageRollBonusFlags.bind(this)(this.damageRolls);
      await this.setDamageRolls(newRolls);
    }

    if (this.itemCardUuid) {
      this.isFumble = false;
      this.attackTotal = 9999;
      await this.checkHits(this.workflowOptions);
      this.hitTargets = new Set(this.targets);
      await this.displayHits(whisperCard, false);
      await this.displayDamageRolls();
    } else {
      await this.damageRoll?.toMessage({ flavor: this.flavor });
    }
    this.hitTargets = new Set(this.targets);
    this.hitTargetsEC = new Set();
    this.effectTargets = new Set(this.targets);
    // TODO change this to the new apply token damage call - sigh
    //this.damageList = await applyTokenDamage(this.rawDamageDetail, this.damageTotal, this.targets, this.item, new Set(), { existingDamage: this.damageList, superSavers: new Set(), semiSuperSavers: new Set(), workflow: this, updateContext: undefined, forceApply: false })
    const result = await this.WorkflowState_AllRollsComplete()
    return result;
  }
}

export class TrapWorkflow extends Workflow {
  templateLocation: { x: number, y: number, direction?: number, removeDelay?: number } | undefined;
  saveTargets: any;
  static get forceCreate() { return false; }
  //
  constructor(actor: Actor, activity, targets: Array<Token> | undefined,
    templateLocation: { x: number, y: number, direction?: number, removeDelay?: number } | undefined = undefined,
    trapSound: { playlist: string, sound: string } | undefined = undefined, event: any = {}, storeWorkflow: boolean = false) {
    super(actor, activity, ChatMessage.getSpeaker({ actor }), new Set(targets), { event, storeWorkflow: false });
    // this.targets = new Set(targets);
    if (!this.event) this.event = foundry.utils.duplicate(shiftOnlyEvent);
    if (templateLocation) this.templateLocation = templateLocation;
    // this.saveTargets = game.user?.targets; 
    this.rollOptions.fastForward = true;
    this.kickStart = false;
    this.suspended = false;
    this.activity.use({ configure: false, workflow: this, midiOptions: { workflowOptions: this.workflowOptions } }, {}, {})
    // this.performState(this.WorkflowState_Start);
    return this;
  }

  get workflowType() { return "TrapWorkflow" };

  async WorkflowState_Start(context: any = {}): Promise<WorkflowState> {
    this.saveTargets = validTargetTokens(game.user?.targets);
    this.effectsAlreadyExpired = [];
    this.onUseMacroCalled = false;
    if (debugEnabled > 1) debug(" Trapworkflow | WorkflowState_Start ", this.item, getActivityAutoTargetAction(this.activity), activityHasAreaTarget(this.activity), this.targets);
    // don't support the placement of a template
    return this.WorkflowState_AwaitTemplate
  }
  async WorkflowState_AwaitTemplate(context: any = {}): Promise<WorkflowState> {
    if (activityHasEmanationNoTemplate(this.activity)) {
      // Targets have already been set in activity.use
      return this.WorkflowState_TemplatePlaced;
    }
    if (!activityHasAreaTarget(this.activity) || !this.templateLocation)
      return this.WorkflowState_TemplatePlaced;
    //@ts-expect-error .canvas
    const TemplateClass = game.system.canvas.AbilityTemplate;
    const abilityTemplates = TemplateClass.fromActivity(this.activity);
    const templateData: any = abilityTemplates[0].document.toObject(false);
    // template.draw();
    // get the x and y position from the trapped token
    templateData.x = this.templateLocation?.x || 0;
    templateData.y = this.templateLocation?.y || 0;
    templateData.direction = this.templateLocation?.direction || 0;

    // Create the template
    let templates = await (canvas?.scene as unknown as Scene)?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    if (templates) {
      const templateDocument: any = templates[0];
      const selfToken = getToken(this.tokenUuid);
      const ignoreSelf = foundry.utils.getProperty(this.item, `flags.${MODULE_ID}.trapWorkflow.ignoreSelf`) ?? false;
      const AoETargetType = getAoETargetType(this.activity);
      templateTokens(templateDocument.object, selfToken, ignoreSelf, AoETargetType);
      selectTargets.bind(this)(templateDocument, null, game.user?.id); // Target the tokens from the template
      this.targets = new Set(game.user?.targets);
      if (this.templateLocation?.removeDelay) {
        let ids: string[] = templates.map(td => td._id as string)
        //TODO test this again
        setTimeout(() => canvas?.scene?.deleteEmbeddedDocuments("MeasuredTemplate", ids), this.templateLocation.removeDelay * 1000);
      }
    }
    return this.WorkflowState_TemplatePlaced
  }
  async WorkflowState_TemplatePlaced(context: any = {}): Promise<WorkflowState> {
    // perhaps auto place template?
    this.needTemplate = false;
    return this.WorkflowState_ValidateRoll;
  }
  async WorkflowState_ValidateRoll(context: any = {}): Promise<WorkflowState> {
    // do pre roll checks
    return this.WorkflowState_WaitForSaves
  }
  async WorkflowState_WaitForAttackRoll(context: any = {}): Promise<WorkflowState> {
    if (!this.activity.attack) {
      this.hitTargets = new Set(this.targets);
      this.hitTargetsEC = new Set();
      return this.WorkflowState_WaitForSaves;
    }
    if (debugEnabled > 0) warn("waitForAttackRoll | attack roll ", this.event)
    this.activity.rollAttack({ event: this.event, workflow: this, midiOptions: { workflowOptions: this.workflowOptions } });
    return this.WorkflowState_Suspend;
  }
  async WorkflowState_AttackRollComplete(context: any = {}): Promise<WorkflowState> {
    const attackRollCompleteStartTime = Date.now();
    await this.processAttackRoll();
    await this.displayAttackRoll();
    await this.checkHits(this.workflowOptions);
    const whisperCard = configSettings.autoCheckHit === "whisper" || safeGetGameSetting("core", "rollMode") === CONST.DICE_ROLL_MODES.BLIND;
    await this.displayHits(whisperCard);
    return this.WorkflowState_WaitForSaves;
  }
  async WorkflowState_WaitForSaves(context: any = {}): Promise<WorkflowState> {
    if (!this.activity.save) {
      this.saves = new Set(); // no saving throw, so no-one saves
      const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
      this.failedSaves = new Set(allHitTargets);
      return this.WorkflowState_WaitForDamageRoll;
    }
    let hookId = Hooks.on("createChatMessage", this.processSaveRoll.bind(this));
    //        let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
    let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
    try {
      const saveDisplay = (this.activity?.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity?.saveDisplay;
      await this.checkSaves(saveDisplay !== "allShow");
    } catch (err) {
      TroubleShooter.recordError(err, "checkSaves");
    } finally {
      Hooks.off("renderChatMessage", hookId);
      //          Hooks.off("renderChatMessage", brHookId);
      Hooks.off("updateChatMessage", monksId)
    }
    if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessage"]?.length);
    const saveDisplay = (this.activity?.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity?.saveDisplay;
    await this.displaySaves(saveDisplay === "whisper");
    return this.WorkflowState_SavesComplete;
  }
  async WorkflowState_SavesComplete(context: any = {}): Promise<WorkflowState> {
    return this.WorkflowState_WaitForDamageRoll
  }

  async WorkflowState_WaitForDamageRoll(context: any = {}): Promise<WorkflowState> {
    if (context.damageRoll) return this.WorkflowState_DamageRollComplete;
    if (!this.activity.hasDamage && !this.activity.hasHealing) return this.WorkflowState_AllRollsComplete;

    if (this.isFumble) {
      // fumble means no trap damage/effects
      return this.WorkflowState_RollFinished;
    }
    if (debugEnabled > 1) debug("TrapWorkflow: Rolling damage ", this.event, this.spellLevel, this.workflowOptions.versatile, this.targets, this.hitTargets);
    this.rollOptions.fastForward = true;
    this.rollOptions.spellLevel = this.spellLevel;
    this.activity.rollDamage({ workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, {});
    return this.WorkflowState_Suspend; // wait for a damage roll to advance the state.
  }
  async WorkflowState_DamageRollComplete(context: any = {}): Promise<WorkflowState> {
    if (!this.activity.attack) { // no attack roll so everyone is hit
      this.hitTargets = new Set(this.targets);
      this.hitTargetsEC = new Set();
      if (debugEnabled > 0) warn("damageRollComplete | for non auto target area effects spells", this)
    }

    // If the item does damage, use the same damage type as the item
    let defaultDamageType = getActivityDefaultDamageType(this) ?? this.defaultDamageType
    this.rawDamageDetail = createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: defaultDamageType });
    if (this.bonusDamageRolls)
      this.rawBonusDamageDetail = createDamageDetailV4({ roll: this.bonusDamageRolls, activity: this.activity, defaultType: defaultDamageType });
    else
      this.rawBonusDamageDetail = [];
    if (this.otherDamageRolls)
      this.rawOtherDamageDetail = createDamageDetailV4({ roll: this.otherDamageRolls, activity: this.activity, defaultType: defaultDamageType });
    else
      this.rawOtherDamageDetail = [];
    // apply damage to targets plus saves plus immunities
    await this.displayDamageRolls();
    if (this.isFumble) {
      return this.WorkflowState_ApplyDynamicEffects
    }
    return this.WorkflowState_AllRollsComplete;
  }
  async WorkflowState_AllRollsComplete(context: any = {}): Promise<WorkflowState> {
    if (debugEnabled > 1) debug("all rolls complete ", foundry.utils.duplicate(this.rawDamageDetail))
    if (this.rawDamageDetail?.length) await processDamageRoll(this, this.rawDamageDetail[0].type)
    return this.WorkflowState_ApplyDynamicEffects;
  }
  async WorkflowState_RollFinished(context: any = {}): Promise<WorkflowState> {
    // area effect trap, put back the targets the way they were
    if (this.saveTargets && activityHasAreaTarget(this.activity)) {
      game.user?.targets.forEach(t => {
        t.setTarget(false, { releaseOthers: false });
      });
      game.user?.targets.clear();
      this.saveTargets.forEach(t => {
        t.setTarget(true, { releaseOthers: false })
        game.user?.targets.add(t)
      })
    }
    return super.WorkflowState_RollFinished
  }
}

export class DDBGameLogWorkflow extends Workflow {
  // @ts-expect-error
  DDBGameLogHookId: number;
  static get forceCreate() { return false }
  static get(id: string): DDBGameLogWorkflow {
    return Workflow._workflows[id];
  }

  //@ts-expect-error dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, item: globalThis.dnd5e.documents.Item5e, speaker, targets: Token[], options: any) {
    super(actor, item, speaker, targets, options);
    this.needTemplate = activityHasAreaTarget(this.activity) ?? false;
    // this.needItemCard = false; TODO see where this is used
    this.needsDamage = this.item.hasDamage;
    this.attackRolled = !item.hasAttack;
    if (configSettings.undoWorkflow) this.undoData = { actor: actor.id, item: item.id, targets: Array.from(targets).map(t => t.id), options: options };
    this.kickStart = true;
    this.flagTags = { "ddb-game-log": { "midi-generated": true } };
    if (configSettings.undoWorkflow) saveUndoData(this);
  }

  async complete() {
    if (this._roll) {
      await this._roll.update({
        "flags.midi-qol.type": MESSAGE_TYPES.HITS,
      });
      this._roll = null;
    }
  }
  async WorkflowState_PreambleComplete(context: any = {}): Promise<WorkflowState> {
    return super.WorkflowState_PreambleComplete(context);
  }

  async WorkflowState_WaitForAttackRoll(context: any = {}): Promise<WorkflowState> {
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    if (!this.activity.attack) {
      return this.WorkflowState_AttackRollComplete;
    }
    if (!this.attackRolled) return this.WorkflowState_Suspend;
    return this.WorkflowState_AttackRollComplete;
  }
  async WorkflowState_AttackRollComplete(context: any = {}): Promise<WorkflowState> {
    this.effectsAlreadyExpired = [];
    if (checkRule("removeHiddenInvis")) await removeHidden.bind(this)();
    await asyncHooksCallAll("midi-qol.preCheckHits", this);
    if (this.item) await asyncHooksCallAll(`midi-qol.preCheckHits.${this.item.uuid}`, this);

    if (debugEnabled > 1) debug(this.attackRollHTML)
    if (configSettings.autoCheckHit !== "none" && this.activity.attack) {
      await this.checkHits(this.workflowOptions);
      await this.displayHits(configSettings.autoCheckHit === "whisper");
    }
    await asyncHooksCallAll("midi-qol.AttackRollComplete", this);
    if (this.item) await asyncHooksCallAll(`midi-qol.AttackRollComplete.${this.item.uuid}`, this);
    if (this.aborted) return this.WorkflowState_Abort;
    return this.WorkflowState_WaitForDamageRoll;
  }

  async WorkflowState_AwaitTemplate(context: any = {}): Promise<WorkflowState> {
    if (!activityHasAreaTarget(this.activity)) return super.WorkflowState_AwaitTemplate;
    let system: any = game.system;
    // Create the template
    const template = system.canvas.AbilityTemplate.Activity(this.activity);
    if (template) template.drawPreview();
    return super.WorkflowState_AwaitTemplate;
  }
  async WorkflowState_WaitForDamageRoll(context: any = {}): Promise<WorkflowState> {
    if (this.needsDamage && this.item.hasDamage) return this.WorkflowState_Suspend;
    if (this.needsOtherDamage) return this.WorkflowState_Suspend;
    if (context.attackRoll) return this.WoorkflowState_AttackRollComplete;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    this.failedSaves = new Set(allHitTargets);
    if (!this.activity.hasDamage && !this.activity.hasHealing) return this.WorkflowState_WaitForSaves;
    return this.WorkflowState_DamageRollComplete;
  }
  async WorkflowState_DamageRollComplete(context: any = {}): Promise<WorkflowState> {
    this.defaultDamageType = getActivityDefaultDamageType(this) ?? this.defaultDamageType ?? MQdefaultDamageType;
    if (this.activity?.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(this.defaultDamageType ?? "")) this.defaultDamageType = "healing";

    this.rawDamageDetail = createDamageDetailV4({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });

    const damageBonusMacros = this.getDamageBonusMacros();
    if (damageBonusMacros) {
      await this.rollBonusDamage(damageBonusMacros);
    }
    this.rawOtherDamageDetail = [];
    if (this.bonusDamageRolls) {
      const messageData = {
        flavor: this.bonusDamageFlavor,
        speaker: this.speaker
      }
      // foundry.utils.setProperty(messageData, `flags.${game.system?.id}.roll.type`, "midi");
      this.bonusDamageRoll?.toMessage(messageData); // see if this can deal with an array of rolls
    }
    expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);

    if (getActivityAutoTargetAction(this.activity) === "none" && activityHasAreaTarget(this.activity) && !this.activity.attack) {
      // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
      this.targets = validTargetTokens(game.user?.targets);
      this.hitTargets = validTargetTokens(game.user?.targets);
      this.hitTargetsEC = new Set();
    }
    // apply damage to targets plus saves plus immunities
    if (this.isFumble) { //TODO: Is this right?
      return this.WorkflowState_RollFinished;
    }
    if (this.activity.save) return this.WorkflowState_WaitForSaves
    return this.WorkflowState_AllRollsComplete;
  }

  async WorkflowState_RollFinished(context: any = {}): Promise<WorkflowState> {
    if (this.placeTemplateHookId) {
      Hooks.off("createMeasuredTemplate", this.placeTemplateHookId);
      Hooks.off("preCreateMeasuredTemplate", this.preCreateTemplateHookId);
    }
    if (this.postSummonHookId) Hooks.off("dnd5e.postSummon", this.postSummonHookId);
    super.WorkflowState_RollFinished();
    return this.WorkflowState_Suspend;
  }
}

export class DummyWorkflow extends Workflow {
  static get forceCreate() { return false }
  //@ts-expect-error dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, activity: any, speaker, targets, options: any) {
    options.noTemplateHook = true;
    super(actor, activity, speaker, targets, options);
    this.advantage = options?.advantage;
    this.disadvantage = options?.disadvantage
    this.rollOptions.fastForward = options?.fastForward;
    this.rollOptions.fastForwardKey = options?.fastFowrd;
  }

  async performState(newState: (() => Promise<WorkflowState>) | undefined) {
    return super.performState(this.WorkflowState_Suspend);
  }
  async simulateSave(targets: Token[]) {
    this.targets = new Set(targets);
    this.hitTargets = new Set(targets)
    this.initSaveResults();
    await this.checkSaves(true, true);
    for (let result of this.saveResults) {
      result.saveAdvantage = result.options.advantageMode === 1;
      result.saveDisadvantage = result.options.advantageMode === -1;
      //@ts-expect-error
      const D20Roll = CONFIG.Dice.D20Roll;
      result.saveRoll = await new D20Roll(result.formula).evaluate();
      const maxroll = (await result.saveRoll?.reroll({ maximize: true }))?.total;
      const minroll = (await result.saveRoll?.reroll({ minimize: true }))?.total;
      result.expectedSaveRoll = ((maxroll || 0) + (minroll || 0)) / 2;
      if (result.saveAdvantage) result.expectedSaveRoll += 3.325;
      if (result.saveDisadvantage) result.expectedSaveRoll -= 3.325;
    }
    return this;
  }
  async simulateAttack(target: Token) {
    this.targets = new Set([target]);
    this.advantage = false;
    this.disadvantage = false;
    await this.checkAttackAdvantage();
    // Block updates to quantity
    const hookId = Hooks.on("dnd5e.rollAttack", (item, roll, ammoUpdate) => {
      if (item === this.item && ammoUpdate?.length) ammoUpdate.length = 0
    });
    try {
      this.attackRoll = await this.activity?.rollAttack({ midiOptions: { fastForward: true, chatMessage: false, isDummy: true, workflowOptions: this.workflowOptions } }, {}, {})
    } catch (err) {
      TroubleShooter.recordError(err, "simulate attack");
    } finally {
      Hooks.off("preUpdateItem", hookId)
    }
    const maxroll = (await this.attackRoll?.reroll({ maximize: true }))?.total;
    const minroll = (await this.attackRoll?.reroll({ minimize: true }))?.total;
    this.expectedAttackRoll = ((maxroll || 0) + (minroll || 0)) / 2;
    if (this.advantage) this.expectedAttackRoll += 3.325;
    if (this.disadvantage) this.expectedAttackRoll -= 3.325;
    return this;
  }
}
