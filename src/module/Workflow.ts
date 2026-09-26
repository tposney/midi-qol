import { warn, debug, log, i18n, i18nFormat, busyWait, MESSAGE_TYPES, error, debugEnabled, MQItemMacroLabel, GameSystemConfig, MODULE_ID, MQActivityMacroLabel, gameStats } from "../midi-qol.js";
import { preferredActiveGM, prepareDamageListToJSON, socketlibSocket, timedAwaitExecuteAsGM, timedExecuteAsGM, unTimedExecuteAsGM } from "./GMAction.js";
import { installedModules } from "./setupModules.js";
import { configSettings, autoRemoveTargets, checkRule, checkMechanic, safeGetGameSetting, useWeakReferences, saveToChatCard, onUseMacroOptions, shouldDisplaySaveDC, isDnd5e53 } from "./settings.js";
import {
  createDamageDetail,
  processDamageRoll,
  untargetDeadTokens,
  checkIncapacitated,
  getAutoRollDamage,
  isAutoFastForward,
  getAutoRollAttack,
  getRemoveDamageButtons,
  getRemoveAttackButtons,
  getTokenPlayerName,
  checkNearby,
  hasCondition,
  expireMyEffects,
  validTargetTokens,
  getOrCreateTokenForActorAsSet,
  doReactions,
  playerFor,
  requestPCActiveDefence,
  evalActivationCondition,
  asyncHooksCallAll,
  asyncHooksCall,
  midiRenderRoll,
  markFlanking,
  computeFlankingStatus,
  computeFlankedStatus,
  canSense,
  tokenForActor,
  getOrCreateTokenForActor,
  createConditionData,
  evalCondition,
  removeHidden,
  hasDAE,
  computeCoverBonus,
  computeTargetAC,
  TOTAL_COVER,
  THREE_QUARTERS_COVER,
  HALF_COVER,
  hasCoverTotal,
  isInCombat,
  displayDSNForRoll,
  setActionUsed,
  removeInvisible,
  getTokenDocument,
  getToken,
  activityHasAutoPlaceTemplate,
  addRollTo,
  sumRolls,
  midiRenderAttackRoll,
  midiRenderDamageRoll,
  midiRenderBonusDamageRoll,
  midiRenderOtherDamageRoll,
  midiRenderFormulaRoll,
  throttledUpdate,
  getCachedDocument,
  clearUpdatesCache,
  getDamageType,
  getTokenName,
  setRollOperatorEvaluated,
  evalAllConditionsAsync,
  getAppliedEffects,
  canSee,
  CEAddEffectWith,
  getCEEffectByName,
  CEHasEffectApplied,
  CERemoveEffect,
  CEToggleEffect,
  getActivityDefaultDamageType,
  activityHasAreaTarget,
  getSaveMultiplierForActivity,
  checkActivityRange,
  isRangeCheckable,
  getDistance,
  getActivityAutoTargetAction,
  activityHasEmanationNoTemplate,
  completeActivityUse,
  getActor,
  getConcentrationEffect,
  convertDuration,
  getRemoveAllButtons,
  requestPCSave,
  pcSaveOptions,
  addUpdatesCache,
  addUpdatesCacheFlags,
  MidiOptions,
  getOptionalCountRemainingShortFlag,
  bonusDialog,
  getTargetDescriptor,
  getThrottlingFunction,
  addAttribution,
  renderAttributionTooltip,
  getAdvantageModeTitle,
  resolveItemMacro,
  resolveActivityMacro,
  resolveDAEItemData,
  midiFlag,
  getAoETargetType,
  updateUserTargets,
  popTargetSave,
  clearTargetSave,
  getToolLabel,
  getConsumptionData,
  toMessageMode,
  toLegacyRollMode,
} from "./utils.js"
import { OnUseMacros } from "./apps/Item.js";
import { bonusCheck, collectBonusFlags, defaultRollOptions, computeAbilityAdvantage, buildPreComputedAdvantageMap } from "./patching.js";
import { PreComputedAdvantage } from "./apps/MidiRollChoiceDialog.js";
import { saveTargetsUndoData, saveUndoData } from "./undo.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { MidiSummonActivity } from "./activities/SummonActivity.js";
import { activityHasScaledTargetCount, computeTargetsFromTemplates, postTemplateConfirmTargets } from "./activities/activityHelpers.js";
import { Activity, ActivitySave, ActivityCheck, ActivityUseConfiguration, DamageDescription, DamageListEntry, TokenOrDocument, DND5ETargetDescriptor, CombinedTargetDescriptor, ActivityEffectData, QueueSaveRollOptions, SaveDetails, ProcessTargetSaveContext, ModuleIntegrationFlags, ModuleIntegrationRequests, MonksTokenBarRequest, FlashRollsRequest, EpicRollsRequest, RollProcessConfig, RollDialogConfig } from "../globals.js";
import { AnyMutableObject, AnyObject, EmptyObject, InexactPartial } from "fvtt-types/utils";
import Token = foundry.canvas.placeables.Token;
import { MidiTransformActivity } from "./activities/TransformActivity.js";
import { MidiAttackActivity, computeAttackAdvantage } from "./activities/AttackActivity.js";
import { RollModifierTracker, AdvantageAttributionType, CriticalModifierFlags, computeCriticalModifiers, computeTargetCriticalModifiers, getFlagDisplayName } from "./lib/RollModifierTracker.js";

/**
 * Result of resolving a macro specification in callMacro.
 * Either macro (for world/compendium macros) or macroData (for item/function macros) will be set.
 */
interface ResolvedMacro {
  macro?: Macro.Implementation;
  macroData?: Macro.CreateData;
  item?: Item.Implementation | Item.InitializedData;
  macroActivity?: Activity;
  sourceItemUuid?: string;
}

/**
 * Context for macro resolution, parsed from the macro name and options.
 */
interface CallMacroContext {
  name: string;
  uuid?: string;
  macroItem?: Item.Implementation | Item.InitializedData;
  macroActivity?: Activity;
  actorToUse: Actor.Implementation;
}

export const shiftOnlyEvent = { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, type: "" };

/** Sentinel value for attackTotal before any attack roll has been made. */
export const minAttackTotal = -100;
export function noKeySet(event: AugmentedEvent) { return !(event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey) }

export type AttributionType = 'ADV' | 'DIS' | 'NOADV' | 'NODIS' | 'CRIT' | 'NOCRIT' | 'FUMBLE' | 'NOFUMBLE';
export type AttributionMap = Partial<Record<AttributionType, Record<string, string>>>;
export interface AttributionEntry {
  type: AttributionType;
  /** Source identifier (e.g., "invisible", "flanking", "magicResistance") */
  source: string;
  /** Human-readable display name for tooltips */
  displayName: string;
}

/**
 * Chat card flag keys for fields that are persisted directly via
 * addUpdatesCacheFlags in their own setters (not through persistFields).
 */
export enum WorkflowDataFlags {
  ammunitionOnUseMacros = "ammunitionOnUseMacros",
  bonusDamageTotal = "bonusDamageTotal",
  currentAction = "currentAction",
  damageList = "damageList",
  inCombat = "inCombat",
  onUseMacros = "OnUseMacros",
  otherDamageTotal = "otherDamageTotal",
  /** Structured save attribution - keyed by target UUID */
  saveAttribution = "saveAttribution",
  saveDisplayData = "saveDisplayData",
  targetDescriptors = "flags.dnd5e.targets",
  otherActivityConsumed = "use.consumed",
  otherActivityScaling = "use.otherScaling",
}

export interface DamageDescriptionObject extends Omit<DamageDescription, 'properties'> {
  properties: string[];
};
function damageDetailToObject(damageDetail?: DamageDescription[]): DamageDescriptionObject[] {
  return (damageDetail ?? []).map(d => ({
    ...d,
    properties: Array.from(d.properties ?? [])
  }));
}
function damageDetailsFromObject(damageDetail?: DamageDescriptionObject[]): DamageDescription[] {
  return (damageDetail ?? []).map(d => ({
    ...d,
    properties: new Set(d.properties ?? [])
  }));
}

type DamageBonusMacroSingleResult = {
  damageRoll?: string;
  flavor?: string;
  damageType?: string;
};
type DamageBonusMacroResult = DamageBonusMacroSingleResult[] | DamageBonusMacroSingleResult;

export type WorkflowState = undefined | ((context: WorkflowContext) => Promise<WorkflowState>);

/**
 * Write-through cache in front of the workflow's chat-card flags.
 * Getters fall back to the persisted flag value (then the default) until the
 * field is first written; writing undefined clears the cache so the getter
 * falls back to the persisted value again (matches the old #field semantics).
 */
class PersistedFieldStore {
  #cache = new Map<string, unknown>();
  #getFlags: () => Record<string, any> | undefined;
  #persist: (updates: Record<string, unknown>) => void;
  #forcePersist: (updates: Record<string, unknown>) => void;
  #persistRolls: () => void;

  constructor(getFlags: () => Record<string, any> | undefined, persist: (updates: Record<string, unknown>) => void, forcePersist: (updates: Record<string, unknown>) => void, persistRolls: () => void) {
    this.#getFlags = getFlags;
    this.#persist = persist;
    this.#forcePersist = forcePersist;
    this.#persistRolls = persistRolls;
  }

  scalar<T>(key: string, dflt: T, legacyKey?: string): T {
    if (this.#cache.has(key)) return this.#cache.get(key) as T;
    const flags = this.#getFlags();
    return (flags?.[key] ?? (legacyKey ? flags?.[legacyKey] : undefined) ?? dflt) as T;
  }

  setScalar<T>(key: string, value: T): void {
    if (value === undefined) this.#cache.delete(key);
    else this.#cache.set(key, value);
    this.#persist({ [key]: value });
  }

  // Token sets persist as uuid arrays (or {uuid, name} pairs for "targets") and
  // restore to Sets of canvas placeables. An empty restore returns an uncached
  // fresh Set so a later flag write is still picked up.
  tokenSet(key: string, namePairs = false): Set<Token.Implementation> {
    if (this.#cache.has(key)) return this.#cache.get(key) as Set<Token.Implementation>;
    const data = this.#getFlags()?.[key];
    if (data?.length) {
      const tokens: Set<Token.Implementation> = new Set(data
        .map((entry: any) => (fromUuidSync(namePairs ? entry.uuid : entry) as TokenDocument.Implementation | undefined)?.object)
        .filter((t: Token.Implementation | undefined): t is Token.Implementation => !!t));
      this.#cache.set(key, tokens);
      return tokens;
    }
    return new Set();
  }

  setTokenSet(key: string, tokens: Set<TokenOrDocument> | undefined, namePairs = false): void {
    if (tokens === undefined) this.#cache.delete(key);
    else this.#cache.set(key, new Set(Array.from(tokens).map(t => t instanceof TokenDocument ? t.object : t).filter(t => !!t)));
    const targetDocuments = Array.from(tokens ?? []).map(t => getTokenDocument(t)).filter((t): t is TokenDocument.Implementation => !!t);
    this.#persist({ [key]: targetDocuments.map(t => namePairs ? { uuid: t.uuid, name: t.name } : t.uuid) });
  }

  // Rolls persist as toJSON() data and must be rehydrated with Roll.fromData
  // (which redirects to the persisted subclass via data.class). Falls back to
  // the raw data if the class is no longer registered.
  #rollFromData(data: any): Roll {
    if (data instanceof Roll) return data;
    try {
      return Roll.fromData(data) as Roll;
    } catch (err) {
      TroubleShooter.recordError(err, `PersistedFieldStore | could not rehydrate roll ${data?.class}`);
      return data;
    }
  }

  roll(key: string): Roll | undefined {
    if (this.#cache.has(key)) return this.#cache.get(key) as Roll;
    const data = this.#getFlags()?.[key];
    if (data) {
      const roll = this.#rollFromData(data);
      this.#cache.set(key, roll);
      return roll;
    }
    return undefined;
  }

  /**
   * `derived` fields are not written to the flags: the roll is already in `message.rolls`, tagged
   * with its `options["midi-qol"].rollType`, and ChatMessageMidi.prepareDerivedData rebuilds the
   * flag from there. Storing both was storing the same roll twice.
   */
  setRoll(key: string, roll: Roll | undefined, derived = false): void {
    if (roll === undefined) this.#cache.delete(key);
    else this.#cache.set(key, roll);
    if (derived) this.#persistRolls();
    else this.#forcePersist({ [key]: roll?.toJSON() ?? null });
  }

  rolls(key: string): Roll[] | undefined {
    if (this.#cache.has(key)) return this.#cache.get(key) as Roll[];
    const data = this.#getFlags()?.[key];
    if (data?.length) {
      const rolls = data.map((r: any) => this.#rollFromData(r));
      this.#cache.set(key, rolls);
      return rolls;
    }
    return undefined;
  }

  setRolls(key: string, rolls: Roll[] | undefined, derived = false): void {
    if (rolls === undefined) this.#cache.delete(key);
    else this.#cache.set(key, rolls);
    if (derived) this.#persistRolls();
    else this.#forcePersist({ [key]: rolls?.map(r => r.toJSON()) ?? [] });
  }

  damageDetail(key: string): DamageDescription[] {
    if (this.#cache.has(key)) return this.#cache.get(key) as DamageDescription[];
    const data = this.#getFlags()?.[key];
    if (data?.length) {
      const detail = damageDetailsFromObject(data as unknown as DamageDescriptionObject[]);
      this.#cache.set(key, detail);
      return detail;
    }
    return [];
  }

  setDamageDetail(key: string, detail: DamageDescription[]): void {
    if (detail === undefined) this.#cache.delete(key);
    else this.#cache.set(key, detail);
    this.#persist({ [key]: damageDetailToObject(detail) });
  }
}

export class Workflow {
  public static WorkflowDataFlags = WorkflowDataFlags;

  static get forceCreate(): boolean { return true };

  static #workflows: Map<string, WeakRef<Workflow> | Workflow> = new Map();
  static get workflows() {
    return Workflow.#workflows
  }
  static set workflows(workflows: Map<string, WeakRef<Workflow> | Workflow>) {
    Workflow.#workflows = workflows;
  }

  static clearWorkflows() {
    Workflow.workflows = new Map();
  }
  static addWorkflow(workflow: Workflow) {
    if (Workflow.workflows.has(workflow.id)) console.warn("midi-qol | addWorkflow | Workflow already exists", workflow.id);
    if (Workflow.workflows.has(workflow.id)) Workflow.removeWorkflow(workflow.id);
    if (useWeakReferences) Workflow.workflows.set(workflow.id, new WeakRef(workflow));
    else Workflow.workflows.set(workflow.id, workflow);
  }
  static getWorkflow(id?: string): Workflow | undefined {
    if (debugEnabled > 0) warn("Get workflow ", id, Workflow.workflows, Workflow.workflows.get(id ?? ""))
    if (debugEnabled > 1) debug("Get workflow ", id, Workflow.workflows, Workflow.workflows.get(id ?? ""))
    if (!id) return;
    let workflow = Workflow.workflows.get(id);
    if (workflow instanceof WeakRef) {
      if (!workflow?.deref()) {
        console.warn("Weak Reference to workflow is not dereferenced", id);
        const _workflow = Workflow.fromChatCardUuid(id);
        if (_workflow) {
          workflow = new WeakRef(_workflow);
          Workflow.workflows.set(id, workflow);
        }
        return _workflow;
      }
      return workflow.deref();
    } else if (workflow) return workflow;
    const chatCard = fromUuidSync(id);
    if (chatCard instanceof ChatMessage && saveToChatCard) {
      workflow = Workflow.fromChatCardUuid(id);
      if (workflow) Workflow.workflows.set(id, workflow);
      return workflow;
    }
    // TODO see if the ChatMessage exists and reconstruct the workflow from that.
    // try fetching via ActivityUuid
    return this.getWorkflowByActivityUuid(id);
  }

  static getWorkflowByActivityUuid(activityUuid?: string): Workflow | undefined {
    if (!activityUuid) return;
    // Direct map lookup — the workflow is keyed by activity.uuid until the chat card is
    // created, at which point the activity.uuid entry is deleted and replaced by the
    // chatMessage.uuid entry. A direct get() avoids finding stale re-keyed workflows.
    // Use workflows.get() directly (not getWorkflow()) to avoid infinite recursion,
    // since getWorkflow() falls back to getWorkflowByActivityUuid().
    const entry = Workflow.workflows.get(activityUuid);
    let returnValue: Workflow | undefined;
    if (entry instanceof WeakRef) {
      returnValue = entry.deref();
    } else {
      returnValue = entry;
    }
    if (debugEnabled > 0) warn(`Fetching workflow by activity uuid ${activityUuid} workflowId: ${returnValue?.id}`);
    return returnValue;
  }
  static deleteWorkflow(id: string) {
    Workflow.workflows.delete(id);
  }

  static fromChatCardUuid(chatCardUuid: string): Workflow | undefined {
    return new Workflow(null, null, null, null, { chatCardUuid });
  }

  async performThrottledUpdate(chatCard: ChatMessage.Implementation, updates: ChatMessage.UpdateData, immediate = false) {
    return await throttledUpdate(chatCard, updates, this.throttleChatMessageUpdates, immediate);
  }

  itemCardUuid: string | undefined;

  private get midiFlags(): Record<string, any> | undefined {
    return this.chatCard?.flags?.[MODULE_ID];
  }

  private persistFields(updates: Record<string, unknown>): void {
    if (this.itemCardUuid && saveToChatCard) {
      addUpdatesCacheFlags(this.id, updates, "midi-qol");
    }
  }

  private forcePersistFields(updates: Record<string, unknown>): void {
    if (this.itemCardUuid) {
      addUpdatesCacheFlags(this.id, updates, "midi-qol");
    }
  }

  /**
   * Rolls persist to `message.rolls`, never to the flags — ChatMessageMidi.prepareDerivedData puts
   * them back on the flags when the message is prepared. Written unconditionally, like the flags
   * they replace, so `workflow.attackRoll` survives a reload with saveToChatCard off.
   */
  private persistRolls(): void {
    if (this.itemCardUuid) addUpdatesCache(this.id, { rolls: this.chatRolls });
  }

  #persisted = new PersistedFieldStore(() => this.midiFlags, updates => this.persistFields(updates),
    updates => this.forcePersistFields(updates), () => this.persistRolls());

  get useActiveDefence() { return false; }
  get actor(): Actor.Implementation {
    return this.activity?.actor!;
  }

  get abort() { return this.#persisted.scalar("abort", false, "aborted"); }
  set abort(abort: boolean | undefined) { this.#persisted.setScalar("abort", !!abort); }

  get itemUseComplete() { return this.#persisted.scalar("itemUseComplete", false); }
  set itemUseComplete(itemUseComplete: boolean | undefined) { this.#persisted.setScalar("itemUseComplete", !!itemUseComplete); }

  #token: Token.Implementation | undefined;
  get token(): Token.Implementation | undefined {
    if (this.#token) return this.#token;
    const uuid = this.midiFlags?.attackingTokenUuid;
    if (uuid) {
      this.#token = getToken(uuid);
    }
    return this.#token;
  }
  set token(token: Token.Implementation | undefined) {
    this.#token = token;
    this.persistFields({ attackingTokenUuid: token?.document?.uuid ?? "" });
  }

  get workflowOptions(): WorkflowOptions {
    return this.#persisted.scalar<WorkflowOptions>("workflowOptions", {});
  }
  set workflowOptions(workflowOptions: WorkflowOptions) {
    this.#persisted.setScalar("workflowOptions", workflowOptions);
  }

  get needItemCard(): boolean { return !!this.itemCardUuid };

  #activity: Activity | undefined;
  get activity(): Activity {
    if (this.#activity) return this.#activity;

    // Use dnd5e's chat card methods — handles both regular and synthetic items
    if (this.chatCard) {
      // @ts-expect-error no dnd5e-types
      this.#activity = this.chatCard.getAssociatedActivity() as Activity;
      // Apply scaling (stored on message, not on item) — same as dnd5e's _fetchActivity()
      if (this.#activity) {
        const scaling = this.chatCard.getFlag("dnd5e", "scaling");
        if (scaling) {
          const item = this.#activity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });
          // @ts-expect-error no dnd5e-types
          this.#activity = item.system.activities.get(this.#activity.id);
        }
      }
    }

    // Fallback: UUID from store (for workflows without a chat card)
    if (!this.#activity) {
      const activityUuid = this.midiFlags?.activityUuid;
      if (activityUuid) {
        this.#activity = fromUuidSync(activityUuid) as Activity;
      }
    }

    if (!this.#activity) {
      const message = `midi-qol | get activity() | Could not find activity for workflow ${this.id}`;
      TroubleShooter.recordError(new Error(message));
      error(message);
    }
    return this.#activity!;
  }
  set activity(activity: Activity) {
    this.#activity = activity;
    this.persistFields({ activityUuid: activity?.uuid ?? "" });
  }

  #item: Item.Implementation | undefined;
  get item(): Item.Implementation {
    if (this.#item) return this.#item;
    if (this.itemCardUuid && saveToChatCard) {
      const itemUuid = this.chatCard?.getFlag("dnd5e", "item")?.uuid;
      this.#item = fromUuidSync(itemUuid) as Item.Implementation;
      if (!this.#item) {
        // foundry.utils.getProperty(this.chatCard, "flags." + chatCardFlags.item)?.itemData - can use this get the item back?
        const message = `get item() | Could not find item for workflow ${this.id} with itemUuid ${itemUuid}`;
        TroubleShooter.recordError(new Error(message));
        error(message);
      }
    }
    return this.#item!;
  }
  set item(item: Item.Implementation) {
    this.#item = item;
    if (this.itemCardUuid && saveToChatCard) {
      addUpdatesCacheFlags(this.id, { ["dnd5e.item.uuid"]: item?.uuid });
    }
  }

  // This value is not stored in flags
  #speaker: ChatMessage.SpeakerData | undefined = undefined;
  get speaker(): ChatMessage.SpeakerData {
    if (this.#speaker) return this.#speaker;
    if (this.itemCardUuid && saveToChatCard) {
      this.#speaker = this.chatCard.speaker;
    }
    return this.#speaker!;
  }
  set speaker(speaker: ChatMessage.SpeakerData) {
    // TODO do an equals check on the stored and passed speaker
    this.#speaker = speaker;
    if (this.itemCardUuid && saveToChatCard) {
      addUpdatesCache(this.id, { speaker });
    }
  }

  get attackingToken() {
    return this.token
  }
  get tokenUuid() {
    return this.token?.document.uuid;
  }

  get targets(): Set<Token.Implementation> { return this.#persisted.tokenSet("targets", true); }
  set targets(targets: Set<TokenOrDocument>) { this.#persisted.setTokenSet("targets", targets ?? new Set(), true); }

  get targetsCanSee(): Set<Token.Implementation> { return this.#persisted.tokenSet("targetsCanSeeUuids"); }
  set targetsCanSee(targetsCanSee: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("targetsCanSeeUuids", targetsCanSee); }
  get targetsCanSense(): Set<Token.Implementation> { return this.#persisted.tokenSet("targetsCanSenseUuids"); }
  set targetsCanSense(targetsCanSense: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("targetsCanSenseUuids", targetsCanSense); }

  get tokenCanSee(): Set<Token.Implementation> { return this.#persisted.tokenSet("tokenCanSeeUuids"); }
  set tokenCanSee(tokenCanSee: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("tokenCanSeeUuids", tokenCanSee); }

  get tokenCanSense(): Set<Token.Implementation> { return this.#persisted.tokenSet("tokenCanSenseUuids"); }
  set tokenCanSense(tokenCanSense: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("tokenCanSenseUuids", tokenCanSense); }

  templateUuids: string[] = [];
  expectedTemplateCount: number = 0;
  placedTemplateCount: number = 0;

  // Backward compat: templateUuid returns the first template UUID
  get templateUuid(): string {
    if (this.templateUuids.length > 0) return this.templateUuids[0];
    return this.midiFlags?.templateUuid ?? "";
  }
  set templateUuid(templateUuid: string) {
    // Backward compat: push to array if not already present
    if (templateUuid && !this.templateUuids.includes(templateUuid)) {
      this.templateUuids.push(templateUuid);
    }
    this.persistFields({ templateUuid, templateUuids: this.templateUuids });
  }

  // v14: templates are backed by Regions — this may return either a MeasuredTemplateDocument or RegionDocument
  get template(): MeasuredTemplateDocument.Implementation | RegionDocument.Implementation | undefined {
    if (!this.templateUuid) return undefined;
    const doc = fromUuidSync(this.templateUuid);
    if (doc instanceof MeasuredTemplateDocument) return doc;
    if (doc instanceof RegionDocument) return doc;
    return undefined;
  }
  set template(template: MeasuredTemplateDocument.Implementation | RegionDocument.Implementation | undefined) {
    if (template?.uuid) this.templateUuid = template.uuid;
  }

  get templateId() {
    if (!this.templateUuid || typeof this.templateUuid !== "string") return;
    return this.templateUuid.split(".").at(-1);
  }

  get inCombat() {
    return this.actor.inCombat
  }
  isTurn: boolean | undefined; // Is it the item wielder's turn.
  get AoO() { return this.#persisted.scalar("AoO", false); }
  set AoO(AoO: boolean) { this.#persisted.setScalar("AoO", AoO); }

  #damageList: DamageListEntry[] | undefined;
  get damageList() {
    if (this.#damageList) return this.#damageList;
    // See below
    // if (this.itemCardUuid && SaveToChatCard) {
    //   this.#damageList = this.chatCard?.getFlag(MODULE_ID, WorkflowDataFlags.damageList);
    // }
    return this.#damageList ?? [];
  }
  set damageList(damageList: DamageListEntry[]) {
    this.#damageList = damageList;
    // This is just too big to store in the chat message - see if there can be a cut down version stored
    // if (this.itemCardUuid && SaveToChatCard) {
    //   addUpdatesCacheFlags(this.id, { [chatCardFlags.damageList]: damageList }, "midi-qol");
    // }
  }

  saveDisplayFlavor: string | undefined;

  #id: string = "";
  get id() { return this.#id }
  set id(id: string) { this.#id = id }

  get uuid() {
    if (debugEnabled > 0) warn(`workflow.uuid is deprecated. Use workflow.id to reference the workflow and workflow.itemUuid to reference the item instead.
      Returning ${this.activity.uuid} workflowId: ${this.id}`);
    return this.activity.uuid;
  }

  get suspended() { return this.#persisted.scalar("suspended", false); }
  set suspended(suspended: boolean) { this.#persisted.setScalar("suspended", suspended); }

  #currentAction: WorkflowState;
  get currentAction() {
    if (this.#currentAction) return this.#currentAction;
    if (this.itemCardUuid && saveToChatCard) {

      const [className, currentActionName] = this.chatCard?.getFlag(MODULE_ID, WorkflowDataFlags.currentAction) ?? ["none", "none"];
      if (className !== "none") {
        const actionClass = WorkflowRegistry[className];
        if (actionClass && (actionClass === Workflow || actionClass.prototype instanceof Workflow)) {
          const action = actionClass?.prototype[currentActionName];
          if (action) {
            this.#currentAction = action;
          } else {
            error(`get currentAction() | Could not find action ${currentActionName} in class ${className}`);
          }
        } else error(`get currentAction() | Class ${className} is not a subclass of Workflow`);
      }
    }
    return this.#currentAction;
  }
  set currentAction(currentAction: WorkflowState) {
    this.#currentAction = currentAction;
    if (this.itemCardUuid && saveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.currentAction]: [this.constructor.name, currentAction?.name] }, "midi-qol");
    }
  }

  #isCriticalRestored: boolean = false;
  get isCritical(): boolean {
    // Restore from store on first access
    if (!this.#isCriticalRestored && this.itemCardUuid && saveToChatCard) {
      if (this.midiFlags?.isCritical) {
        this.attackRollModifierTracker.critical.setOverride(true, "restored", "Restored from chat card");
      }
      this.#isCriticalRestored = true;
    }
    return this.attackRollModifierTracker.isCritical;
  }
  set isCritical(isCritical: boolean) {
    this.attackRollModifierTracker.critical.setOverride(isCritical, "direct", "Direct assignment");
    this.#isCriticalRestored = true;
    this.persistFields({ isCritical });
  }

  #isFumbleRestored: boolean = false;
  get isFumble(): boolean {
    // Restore from store on first access
    if (!this.#isFumbleRestored && this.itemCardUuid && saveToChatCard) {
      if (this.midiFlags?.isFumble) {
        this.attackRollModifierTracker.fumble.setOverride(true, "restored", "Restored from chat card");
      }
      this.#isFumbleRestored = true;
    }
    return this.attackRollModifierTracker.isFumble;
  }
  set isFumble(isFumble: boolean) {
    this.attackRollModifierTracker.fumble.setOverride(isFumble, "direct", "Direct assignment");
    this.#isFumbleRestored = true;
    this.persistFields({ isFumble });
  }

  /**
   * @deprecated Use workflow.attackRollModifierTracker.critical.isForced instead
   */
  get critFlagSet(): boolean {
    foundry.utils.logCompatibilityWarning(
      "midi-qol | workflow.critFlagSet is deprecated. Use workflow.attackRollModifierTracker.critical.isForced instead.",
      { since: "13.0.40", until: "14", once: true }
    );
    return this.attackRollModifierTracker.critical.isForced;
  }

  /**
   * @deprecated Use workflow.attackRollModifierTracker.critical.isSuppressed instead
   */
  get noCritFlagSet(): boolean {
    foundry.utils.logCompatibilityWarning(
      "midi-qol | workflow.noCritFlagSet is deprecated. Use workflow.attackRollModifierTracker.critical.isSuppressed instead.",
      { since: "13.0.40", until: "14", once: true }
    );
    return this.attackRollModifierTracker.critical.isSuppressed;
  }

  get d20AttackRoll() { return this.#persisted.scalar("d20AttackRoll", -1); }
  set d20AttackRoll(d20AttackRoll: number) { this.#persisted.setScalar("d20AttackRoll", d20AttackRoll); }

  get hitTargets(): Set<Token.Implementation> { return this.#persisted.tokenSet("hitTargetUuids"); }
  set hitTargets(hitTargets: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("hitTargetUuids", hitTargets); }

  get hitTargetsEC(): Set<Token.Implementation> { return this.#persisted.tokenSet("hitECTargetUuids"); }
  set hitTargetsEC(hitTargetsEC: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("hitECTargetUuids", hitTargetsEC); }

  #otherDamageMatches: Set<Token.Implementation> | undefined;
  get otherDamageMatches(): Set<Token.Implementation> | undefined {
    if (this.#otherDamageMatches !== undefined) return this.#otherDamageMatches;
    const uuids = this.midiFlags?.otherDamageMatchUuids;
    if (uuids) {
      this.#otherDamageMatches = new Set(
        uuids.map((uuid: string) => (fromUuidSync(uuid) as TokenDocument | undefined)?.object).filter((t: Token.Implementation | undefined): t is Token.Implementation => !!t)
      );
      return this.#otherDamageMatches;
    }
    return undefined;
  }
  set otherDamageMatches(matches: Set<Token.Implementation> | undefined) {
    this.#otherDamageMatches = matches;
    const uuids = matches ? Array.from(matches).map(t => getTokenDocument(t)?.uuid).filter((u): u is string => !!u) : [];
    this.persistFields({ otherDamageMatchUuids: uuids });
  }

  get attackRoll(): Roll | undefined { return this.#persisted.roll("attackRoll"); }
  set attackRoll(attackRoll: Roll | undefined) {
    if (attackRoll) attackRoll.data = {};
    this.#persisted.setRoll("attackRoll", attackRoll, true);
  }

  get diceRoll() { return this.#persisted.scalar("diceRoll", 0); }
  set diceRoll(diceRoll: number) { this.#persisted.setScalar("diceRoll", diceRoll); }

  get attackTotal() { return this.#persisted.scalar("attackTotal", 0); }
  set attackTotal(attackTotal: number) { this.#persisted.setScalar("attackTotal", attackTotal); }

  attackRollHTML: HTMLElement | string | undefined;

  get attackRollCount() { return this.#persisted.scalar("attackRollCount", 0); }
  set attackRollCount(attackRollCount: number) { this.#persisted.setScalar("attackRollCount", attackRollCount); }

  #attackRollModifierTracker: RollModifierTracker = new RollModifierTracker();
  #attackRollModifierTrackerRestored = false;
  get attackRollModifierTracker(): RollModifierTracker {
    if (!this.#attackRollModifierTrackerRestored && this.itemCardUuid && saveToChatCard) {
      const data = this.midiFlags?.attackRollModifierTrackerData;
      if (data) {
        this.#attackRollModifierTracker.restore(data);
        // Full tracker restore supersedes the boolean-only isCritical/isFumble restore
        this.#isCriticalRestored = true;
        this.#isFumbleRestored = true;
      }
      this.#attackRollModifierTrackerRestored = true;
    }
    return this.#attackRollModifierTracker;
  }

  /** Alias for attackRollModifierTracker */
  get tracker(): RollModifierTracker {
    return this.attackRollModifierTracker;
  }

  private persistAttackTracker(): void {
    this.persistFields({ attackRollModifierTrackerData: this.#attackRollModifierTracker.toJSON() });
  }

  get advantage(): boolean | undefined {
    return this.#attackRollModifierTracker.hasAdvantage;
  }

  /**
   * Backward compatibility setter for advantage.
   * - `true`: adds one source of advantage
   * - `false`: clears all advantage sources (preserves suppression)
   * - `undefined`: resets the entire advantage mode state
   */
  set advantage(value: boolean | undefined) {
    if (value === true) {
      this.#attackRollModifierTracker.advantage.add();
    } else if (value === undefined) {
      this.#attackRollModifierTracker.reset();
    } else if (value === false) {
      this.#attackRollModifierTracker.advantage.clear();
    }
  }

  /**
   * Backward compatibility getter for disadvantage.
   * Returns true if there's effective disadvantage, false if suppressed, undefined if no sources.
   */
  get disadvantage(): boolean | undefined {
    return this.#attackRollModifierTracker.hasDisadvantage;
  }

  /**
   * Backward compatibility setter for disadvantage.
   * - `true`: adds one source of disadvantage
   * - `false`: clears all disadvantage sources (preserves suppression)
   * - `undefined`: resets the entire advantage mode state
   */
  set disadvantage(value: boolean | undefined) {
    if (value === true) {
      this.#attackRollModifierTracker.disadvantage.add();
    } else if (value === undefined) {
      this.#attackRollModifierTracker.reset();
    } else if (value === false) {
      this.#attackRollModifierTracker.disadvantage.clear();
    }
  }

  get noAdvantage(): boolean {
    return this.#attackRollModifierTracker.advantage.isSuppressed;
  }

  set noAdvantage(value: boolean | undefined) {
    if (value === true) {
      this.#attackRollModifierTracker.advantage.suppress();
    }
  }

  get noDisadvantage(): boolean {
    return this.#attackRollModifierTracker.disadvantage.isSuppressed;
  }

  set noDisadvantage(value: boolean | undefined) {
    if (value === true) {
      this.#attackRollModifierTracker.disadvantage.suppress();
    }
  }

  get dnd5eFlags(): any | undefined {
    return foundry.utils.getProperty(this.chatCard, "flags.dnd5e") as AnyObject | undefined;
  }
  set dnd5eFlags(dnd5eFlags: any | undefined) {
    if (this.chatCard)
      addUpdatesCache(this.id, { "flags.dnd5e": dnd5eFlags });
  }

  get targetDescriptors(): Array<DND5ETargetDescriptor> | undefined {
    return foundry.utils.getProperty(this.chatCard, WorkflowDataFlags.targetDescriptors) as Array<DND5ETargetDescriptor>;
  }
  set targetDescriptors(targetDescriptors: Array<DND5ETargetDescriptor>) {
    if (this.chatCard)
      addUpdatesCache(this.id, { [WorkflowDataFlags.targetDescriptors]: targetDescriptors });
  }
  noAutoAttack: boolean | undefined; // override attack roll for standard care

  hitDisplayData: Record<string, {
    ac?: number;
    acClass: string;
    acDisplay?: string;
    acTooltip?: string;
    actorUuid?: string;
    attackBonus?: number;
    attackTotal?: number;
    attackType?: string;
    baseAc?: number;
    acIcons?: Array<{ img?: string; icon?: string; tooltip?: string; cssClass: string; useDnd5eIcon?: boolean }>;
    gmName: string;
    hitClass: string;
    hitResultNumeric?: string;
    hitString?: string;
    hitStyle?: string;
    hitSymbol?: string;
    img: string;
    isHit: boolean;
    targetClass: string;
    playerName: string;
    showAC: boolean;
    target: Token.Implementation;
    uuid: string;
  }> | undefined;

  saveDisplayData: {
    gmName: string;
    playerName: string;
    img: string;
    targetClass: string;
    target: Token.Implementation;
    saveSymbol: string;
    saveTotalClass: string;
    saveToolTipClass?: string;
    rollTotal: string;
    rollDetail: string;
    rollHTML: string;
    id: string;
    adv?: boolean;
    modifierTracker?: RollModifierTracker;  // Full RollModifierTracker for attribution tracking
    attributionTooltip?: string;  // HTML-escaped attribution tooltip for data-tooltip-html attribute
    hasAttribution?: boolean;  // Whether there is attribution data to display an info icon
    coverLabel?: string;  // SVG path for cover indicator icon
    saveTooltip?: string;  // Tooltip showing save roll breakdown vs DC
    saveClass: string;
  }[] | undefined;

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

  /**
   * The other activity if there is one, otherwise the ammunition's. Used where the question is
   * "does the extra activity have a save/check", which decides how otherEffectTargets is derived —
   * ammunition effects share that collection, so its save must count when the item has no other
   * activity of its own.
   */
  get otherActivityOrAmmunition() {
    return this.otherActivity ?? this.ammunitionActivity;
  }

  /**
   * Check if an activity has a valid save configuration (save with abilities, or check with ability/associated)
   */
  protected hasValidSaveOrCheck(activity: Activity | null | undefined): boolean {
    if (!activity) return false;
    if (activity.save) {
      // Save must have at least one ability configured
      const abilities = activity.save.ability;
      if (abilities instanceof Set) return abilities.size > 0;
      return !!abilities;
    }
    if (activity.check) {
      // Check is valid with ability, associated skills/tools, or as a plain d20 roll
      return true;
    }
    return false;
  }

  get activityHasSave() {
    return this.hasValidSaveOrCheck(this.saveActivity);
  }
  get saveActivity() {
    if (this.hasValidSaveOrCheck(this.activity)) return this.activity;
    if (this.hasValidSaveOrCheck(this.otherActivity)) return this.otherActivity;
    return undefined;
  }
  get saveActivityDetails(): ActivitySave | ActivityCheck | undefined {
    return this.saveActivity?.save || this.saveActivity?.check;
  }

  get saveItem() {
    if (this.activity.save || this.activity.check) return this.item;
    return this.saveActivity?.item ?? this.activity.item;
  }

  #rolls: Roll[] | undefined;
  get rolls(): Roll[] {
    if (this.#rolls) return this.#rolls;
    if (this.itemCardUuid && saveToChatCard) {
      this.#rolls = this.chatCard.rolls as Roll[];
    }
    return this.#rolls ?? [];
  }

  get damageRolls(): Roll[] { return this.#persisted.rolls("damageRolls") ?? []; }
  set damageRolls(damageRolls: Roll[]) { this.#persisted.setRolls("damageRolls", damageRolls, true); }

  get bonusDamageRolls(): Roll[] | undefined { return this.#persisted.rolls("bonusDamageRolls"); }
  set bonusDamageRolls(bonusDamageRolls: Roll[] | undefined) { this.#persisted.setRolls("bonusDamageRolls", bonusDamageRolls, true); }

  get otherDamageRolls(): Roll[] | undefined { return this.#persisted.rolls("otherDamageRolls"); }
  set otherDamageRolls(otherDamageRolls: Roll[] | undefined) { this.#persisted.setRolls("otherDamageRolls", otherDamageRolls, true); }

  get utilityRolls(): Roll[] | undefined { return this.#persisted.rolls("utilityRolls") ?? []; }
  // Not derived: chatRolls carries the merged utilityRoll, so individual rolls can't be recovered.
  set utilityRolls(utilityRolls: Roll[] | undefined) {
    utilityRolls?.forEach(d => d.data = {});
    this.#persisted.setRolls("utilityRolls", utilityRolls);
  }

  get damageTotal() { return this.#persisted.scalar("damageTotal", 0); }
  set damageTotal(damageTotal: number) { this.#persisted.setScalar("damageTotal", damageTotal); }

  get rawDamageDetail(): DamageDescription[] { return this.#persisted.damageDetail("rawDamageDetail"); }
  set rawDamageDetail(rawDamageDetail: DamageDescription[]) { this.#persisted.setDamageDetail("rawDamageDetail", rawDamageDetail); }

  get rawOtherDamageDetail(): DamageDescription[] { return this.#persisted.damageDetail("rawOtherDamageDetail"); }
  set rawOtherDamageDetail(rawOtherDamageDetail: DamageDescription[]) { this.#persisted.setDamageDetail("rawOtherDamageDetail", rawOtherDamageDetail); }

  get rawBonusDamageDetail(): DamageDescription[] { return this.#persisted.damageDetail("rawBonusDamageDetail"); }
  set rawBonusDamageDetail(rawBonusDamageDetail: DamageDescription[]) { this.#persisted.setDamageDetail("rawBonusDamageDetail", rawBonusDamageDetail); }

  get damageDetail(): DamageDescription[] { return this.#persisted.damageDetail("damageDetail"); }
  set damageDetail(damageDetail: DamageDescription[]) { this.#persisted.setDamageDetail("damageDetail", damageDetail); }
  get otherDamageDetail(): DamageDescription[] { return this.#persisted.damageDetail("otherDamageDetail"); }
  set otherDamageDetail(otherDamageDetail: DamageDescription[]) { this.#persisted.setDamageDetail("otherDamageDetail", otherDamageDetail); }

  get bonusDamageDetail(): DamageDescription[] { return this.#persisted.damageDetail("bonusDamageDetail"); }
  set bonusDamageDetail(bonusDamageDetail: DamageDescription[]) { this.#persisted.setDamageDetail("bonusDamageDetail", bonusDamageDetail); }

  damageRollHTML: HTMLElement | string | undefined;

  get damageRollCount(): number { return this.#persisted.scalar("damageRollCount", 0); }
  set damageRollCount(damageRollCount: number) { this.#persisted.setScalar("damageRollCount", damageRollCount); }

  get defaultDamageType(): string { return this.#persisted.scalar("defaultDamageType", ""); }
  set defaultDamageType(defaultDamageType: string) { this.#persisted.setScalar("defaultDamageType", defaultDamageType); }

  get effectsAlreadyExpired(): string[] { return this.#persisted.scalar<string[]>("effectsAlreadyExpired", []); }
  set effectsAlreadyExpired(effectsAlreadyExpired: string[]) { this.#persisted.setScalar("effectsAlreadyExpired", effectsAlreadyExpired); }

  noAutoDamage: boolean | undefined; // override damage roll for damage rolls

  #consumptionRefunded = false;

  /**
   * Set when MidiActivityMixin suppressed dnd5e's concentration so it can be started after the
   * workflow's checks pass. Carries what Activity#use would have used. Cleared once begun.
   */
  deferredConcentration: { scaling?: number, end?: string } | undefined;

  get saves(): Set<Token.Implementation> { return this.#persisted.tokenSet("saveUuids"); }
  set saves(saves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("saveUuids", saves); }

  get superSavers(): Set<Token.Implementation> { return this.#persisted.tokenSet("superSaverUuids"); }
  set superSavers(superSavers: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("superSaverUuids", superSavers); }
  get semiSuperSavers(): Set<Token.Implementation> { return this.#persisted.tokenSet("semiSuperSaverUuids"); }
  set semiSuperSavers(semiSuperSavers: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("semiSuperSaverUuids", semiSuperSavers); }

  get failedSaves(): Set<Token.Implementation> { return this.#persisted.tokenSet("failedSaveUuids"); }
  set failedSaves(failedSaves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("failedSaveUuids", failedSaves); }

  get fumbleSaves(): Set<Token.Implementation> { return this.#persisted.tokenSet("fumbleSaveUuids"); }
  set fumbleSaves(fumbleSaves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("fumbleSaveUuids", fumbleSaves); }
  get criticalSaves(): Set<Token.Implementation> { return this.#persisted.tokenSet("criticalSaveUuids"); }
  set criticalSaves(criticalSaves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("criticalSaveUuids", criticalSaves); }
  get advantageSaves(): Set<Token.Implementation> { return this.#persisted.tokenSet("advantageSaveUuids"); }
  set advantageSaves(advantageSaves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("advantageSaveUuids", advantageSaves); }
  saveRequests: Record<string, (value: any) => void>;
  saveTimeouts: Record<string, NodeJS.Timeout>;
  defenceRequests: Record<string, (value: any) => void>;
  defenceTimeouts: Record<string, NodeJS.Timeout>;

  flagTags: AnyMutableObject | undefined;

  #onUseMacros: OnUseMacros | undefined;
  get onUseMacros() {
    if (this.#onUseMacros) return this.#onUseMacros;
    if (configSettings.allowUseMacro) {
      this.#onUseMacros = new OnUseMacros();
      const itemOnUseMacros = this.item.getFlag(MODULE_ID, "onUseMacroParts") ?? new OnUseMacros();
      const actorOnUseMacros = this.actor.getFlag(MODULE_ID, "onUseMacroParts") ?? new OnUseMacros();
      if (this.workflowOptions?.onlyOnUseItemMacros) {
        this.#onUseMacros.items = [...itemOnUseMacros.items];
        this.onUseMacros = this.onUseMacros
      } else {
        this.#onUseMacros.items = [...itemOnUseMacros.items, ...actorOnUseMacros.items];
        this.onUseMacros = this.onUseMacros
      }
    }
    return this.#onUseMacros;
  }
  set onUseMacros(onUseMacros: OnUseMacros | undefined) {
    this.#onUseMacros = onUseMacros;
  }

  #ammunitionOnUseMacros: OnUseMacros | undefined;
  get ammunitionOnUseMacros() {
    if (this.#ammunitionOnUseMacros) return this.#ammunitionOnUseMacros;
    this.#ammunitionOnUseMacros = new OnUseMacros();
    const ammunitionOnUseMacros = this.ammunition?.getFlag(MODULE_ID, "onUseMacroParts") ?? new OnUseMacros();
    this.#ammunitionOnUseMacros.items = ammunitionOnUseMacros.items;
    return this.#ammunitionOnUseMacros;
  }
  set ammunitionOnUseMacros(ammunitionOnUseMacros: OnUseMacros | undefined) {
    this.#ammunitionOnUseMacros = ammunitionOnUseMacros;
    if (this.itemCardUuid && saveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.ammunitionOnUseMacros]: ammunitionOnUseMacros }, "midi-qol");
    }
  }

  // Legacy Set - delegates to RollModifierTracker
  get attackAdvAttribution(): Set<string> {
    return this.#attackRollModifierTracker.legacyAttribution;
  }
  set attackAdvAttribution(_value: Set<string>) {
    this.#attackRollModifierTracker.reset();
  }

  // Structured attack attribution - delegates to attackRollModifierTracker
  // Uses AttributionMap: type -> source -> displayName for O(1) lookups
  get attackAttribution(): AttributionMap {
    return this.#attackRollModifierTracker.attribution as AttributionMap;
  }

  // Structured save attribution - keyed by target UUID
  // Uses AttributionMap per target for O(1) lookups
  #saveAttribution: Record<string, AttributionMap> | undefined;
  get saveAttribution(): Record<string, AttributionMap> {
    if (this.#saveAttribution) return this.#saveAttribution;
    if (this.itemCardUuid && saveToChatCard) {
      this.#saveAttribution = this.chatCard?.getFlag(MODULE_ID, WorkflowDataFlags.saveAttribution) as Record<string, AttributionMap> | undefined;
    }
    return this.#saveAttribution ?? {};
  }
  set saveAttribution(saveAttribution: Record<string, AttributionMap>) {
    this.#saveAttribution = saveAttribution;
    if (this.itemCardUuid && saveToChatCard) {
      addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.saveAttribution]: saveAttribution }, "midi-qol");
    }
  }

  addSaveAttribution(targetUuid: string, type: AttributionType, source: string, displayName: string): void {
    const current = this.#saveAttribution ?? {};
    current[targetUuid] ??= {};
    current[targetUuid][type] ??= {};
    current[targetUuid][type]![source] = displayName;
    this.saveAttribution = current;
  }

  get advReminderAttackAdvAttribution(): Set<string> {
    return this.#attackRollModifierTracker.advReminderAttribution;
  }
  set advReminderAttackAdvAttribution(_value: Set<string>) {
    this.#attackRollModifierTracker.reset();
  }

  get noOptionalRules() { return this.#persisted.scalar("noOptionalRules", false); }
  set noOptionalRules(noOptionalRules: boolean) { this.#persisted.setScalar("noOptionalRules", noOptionalRules); }
  undoData: UndoData | undefined; // Way too big to store. Undos are blanked on reload

  get bonusDamageFlavor() {
    // @ts-expect-error options.type is specific to 5e `DamageRoll`s
    return `(${this.bonusDamageRolls?.map(r => r.options.flavor ?? r.options.type)})`;
  }

  public get chatCard() {
    return getCachedDocument(this.itemCardUuid) as ChatMessage.Implementation;
  }

  get itemCardId() {
    return this.chatCard?.id;
  }

  get damageFlavor() {
    if (this.activity.type === "heal") return i18n("midi-qol.BaseHealingFlavor");
    return i18n("midi-qol.BaseDamageFlavor");
    // See what the reception to a simple header is
    // if (this.rawDamageDetail?.filter(d => d.damage !== 0).length === 0) return `(${allDamageTypes[this.defaultDamageType ?? "none"].label})`
    // return `(${this.rawDamageDetail?.filter(d => d.damage !== 0).map(d => allDamageTypes[d.type].label || d.type)})`;
  }

  #randomItemId: string | undefined;
  get itemId() {
    if (this.item) return this.item.id!;
    if (!this.#randomItemId) this.#randomItemId = foundry.utils.randomID();
    return this.#randomItemId;
  }

  get needTemplate(): boolean {
    return this.expectedTemplateCount > 0 && this.templateUuids.length < this.expectedTemplateCount;
  }

  get itemUuid(): string | undefined {
    return this.item.uuid;
  }

  get otherDamageFlavor() {
    if (this.otherActivity?.type === "heal") return i18n("midi-qol.OtherHealIngFlavor");
    if (this.otherActivity?.midiProperties?.displayActivityName) {
      return i18n(this.otherActivity.name);
    }
    return i18n("midi-qol.OtherDamageFlavor");
  }

  get useCondition() {
    return this.activity.useCondition;
  }

  get effectActivationCondition() {
    return this.activity.effectCondition;
  }

  get hasSave(): boolean {
    return Boolean(this.activity.save || this.activity.check || this.otherActivity?.save || this.otherActivity?.check);
  }

  get otherDamageFormula() {
    error("workflow.otherDamageFormula is deprecated without replacement.");
    return "";
  }

  get otherUseCondition() {
    return this.otherActivity?.useCondition;
  }

  get otherEffectActivationCondition() {
    return this.otherActivity?.effectCondition;
  }

  get shouldRollDamage(): boolean {
    if (this.systemCard) return false;
    if (this.actor.type === configSettings.averageDamage || configSettings.averageDamage === "all") return true;
    const normalRoll = getAutoRollDamage(this) === "always"
      || !!(getAutoRollDamage(this) === "saveOnly" && this.activity.save && !this.activity.attack)
      || !!(getAutoRollDamage(this) !== "none" && (!this.activity.attack || configSettings.autoCheckHit === "none"))
      || !!(getAutoRollDamage(this) === "onHit" && (this.hitTargets.size > 0 || this.hitTargetsEC?.size > 0 || this.targets.size === 0))
      || !!(getAutoRollDamage(this) === "onHit" && (this.hitTargetsEC?.size > 0));
    return this.rollOptions?.rollToggle ? !normalRoll : normalRoll;
  }

  get spellLevel(): number {
    let spellLevel;
    if (this.chatCard) {
      spellLevel = isDnd5e53
        ? foundry.utils.getProperty(this.chatCard, "system.spellLevel")
        : foundry.utils.getProperty(this.chatCard, "flags.dnd5e.use.spellLevel");
    }
    return spellLevel ?? this.castData?.castLevel ?? 0;
  }

  get workflowType() { return "BaseWorkflow" };

  setTargets(targets: Set<TokenOrDocument>) {
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

  get saveRolls() {
    foundry.utils.logCompatibilityWarning("Workflow.saveRolls is deprecated without replacement. Use workflow.tokenSaves instead", { since: "midi-qol 13.0.42", until: "mid-qol 13.1.0" });
    if (this.tokenSaves)
      return Object.values(this.tokenSaves);
    return [];
  }

  ammunition: Item.Implementation | undefined;
  /** An activity carried by the loaded ammunition. Independent of otherActivity — both can run. */
  ammunitionActivity: any | undefined;
  systemCard: boolean | undefined;
  aborted: boolean = false;
  workflowName: string | undefined;
  forceApplyEffects: boolean;
  onUseCalled: boolean;
  attackRolled: boolean;
  longRangeAttack: boolean | undefined;
  preSelectedTargets: Set<Token.Implementation>;
  postSummonHookId: number | undefined;
  summonedCreatures: TokenDocument.Implementation[] | undefined;
  transformedActorUuids: string[] | undefined;
  transformedActors: Actor.Implementation[] | undefined;
  kickStart: boolean | undefined;
  disadvantageSaves: Set<Token.Implementation> | undefined;
  saveResults: Roll[] | undefined; /* D20Roll */
  stateTransitionCount: number | undefined;
  maxTransitionCount: number = 250;
  selfTargeted: boolean | undefined;
  workflowStartTime: number | undefined;
  rangeTargeting: boolean | undefined;
  tempTargetConfirmation: boolean | undefined;
  whisperAttackCard: boolean | undefined;
  effectTargets: Set<Token.Implementation> | undefined;
  // Deferred other activity damage rolling - stored when consumption needs to be checked first
  otherDamageConfig: RollProcessConfig | undefined;
  otherDamageDialog: RollDialogConfig | undefined;
  activationMatches: Set<Token.Implementation> | undefined;
  activationFails: Set<Token.Implementation> | undefined;
  otherActivationMatches: Set<Token.Implementation> | undefined;
  otherActivationFails: Set<Token.Implementation> | undefined;
  otherEffectTargets: Set<Token.Implementation> | undefined;
  allOtherEffectTargets: Set<Token.Implementation> | undefined;
  effectTargetsOnSave: Set<Token.Implementation> | undefined;
  otherEffectTargetsOnSave: Set<Token.Implementation> | undefined;
  otherDamageTotal: number | undefined;
  bonusDamageTotal: number | undefined;
  keepActivityCard: boolean | undefined;
  needsHitTargetsDisplayed: boolean = true;
  // TODO: Type this
  conditionData: any | undefined;
  flankingAdvantage: boolean | undefined;
  bonusDamageHTML: string | undefined;
  otherDamageList: DamageListEntry[] | undefined;
  macroPass: string | undefined;
  tag: string | undefined;
  activeDefenceDC: number | undefined;
  utilityRollHTML: string | undefined;
  useOther: boolean | undefined;
  otherDamageRollHTML: string | undefined;
  saveTargetsDisplayed: boolean | undefined;
  targetSaveDetails: Record<string, SaveDetails> | undefined;  // Per-target SaveDetails for attribution tracking

  /** Get save rolls keyed by target UUID - derived from targetSaveDetails */
  get tokenSaves(): Record<string, Roll> | undefined {
    if (!this.targetSaveDetails) return undefined;
    const result: Record<string, Roll> = {};
    for (const [uuid, details] of Object.entries(this.targetSaveDetails)) {
      if (details.saveRoll) result[uuid] = details.saveRoll;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  saveDC: number | undefined;
  saveDetails: SaveDetails | undefined;
  damageItem: DamageListEntry | undefined;
  challengeModeScale: Record<string, number> | undefined;
  activeDefenceRolls: Record<string, Roll> | undefined;
  rollResults: Roll[] | undefined;
  healingAdjustedDamageTotal: number | undefined;
  flavor: string | undefined;
  healingAdjustedBonusDamageTotal: number | undefined;
  bonusDamageRollHTML: string | undefined;
  healingAdjustedOtherDamageTotal: number | undefined;
  attackMode: string | undefined;
  itemUsesReaction: boolean | undefined;
  itemUsesBonusAction: boolean | undefined;
  rangeDetails: {
    result: string;
    attackingToken?: Token.Implementation;
    range?: number;
    longRange?: number
  } | undefined;

  sequenceId?: string;
  targetACModifiers: Map<string, number> = new Map(); // Map of actor uuid to AC modifier, used for active defences

  // Does this do anything?
  applicationTargets: Set<Token.Implementation> | undefined;

  // TODO: these
  rollOptions: WorkflowRollOptions;
  castData: {
    castLevel?: number;
  } | undefined;

  throttleChatMessageUpdates: undefined | ((document: foundry.abstract.Document.Any, updates: ChatMessage.UpdateData) => Promise<void>);
  // TODO: type options
  constructor(
    actor: Actor.Implementation | null /* Actor5e*/,
    activity: Activity | null,
    speaker: ChatMessage.SpeakerData | null,
    targets: Set<TokenOrDocument> | TokenOrDocument[] | null,
    options: WorkflowConstructorOptions = { chatCardUuid: undefined, storeWorkflow: true, item: undefined }
  ) {
    this.workflowStartTime = Date.now();
    if (options.chatCardUuid && saveToChatCard) {
      this.itemCardUuid = options.chatCardUuid;
      this.id = options.chatCardUuid;
    } else {
      // In this case, `actor`, `activity`, and `speaker` are mandatory
      if (!actor || !activity || !speaker) {
        error(`Workflow was not provided with valid arguments: ${actor}, ${activity}, ${speaker}, ${targets}, ${options}`);
        throw new Error("Workflow could not be created");
      }
      this.activity = activity;
      this.item = activity.item ?? options.item;
      if (speaker.token) this.token = canvas.tokens?.get(speaker.token);
      if (options.token) this.token = options.token;
      if (!this.token) {
        this.token = getOrCreateTokenForActor(this.actor);
      }
      if (targets && (targets instanceof Set ? targets.size : targets.length) !== 0) this.targets = new Set(targets ? targets : []);
      if (speaker) this.speaker = speaker;
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      this.initSaveResults();
      this.attackTotal = minAttackTotal;
      // isCritical/isFumble default to false via tracker — no explicit reset needed
      this.currentAction = this.WorkflowState_NoAction;
      this.suspended = true;
      this.aborted = false;
      if (!this.activity || this instanceof DummyWorkflow) {
        this.id = foundry.utils.randomID();
        this.workflowName = `workflow ${this.id}`;
      } else {
        this.id = this.activity.uuid; // Temporary until the item card is created.
        const workflowName = options.workflowOptions?.workflowName ?? this.item.name ?? "no item";
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
      if (this.speaker.scene) this.speaker.scene = canvas.scene?.id ?? "";
    }

    this.saveRequests = {};
    this.defenceRequests = {};
    this.saveTimeouts = {};
    this.defenceTimeouts = {}
    this.forceApplyEffects = false;
    this.onUseCalled = false;
    this.attackRolled = false;
    this.flagTags = undefined;
    if (options.rollOptions) this.rollOptions = options.rollOptions;
    else this.rollOptions = {};
    if (options.event) this.rollOptions.event = options.event;
    else if (options.workflowOptions?.event) this.rollOptions.event = options.workflowOptions.event;
    this.workflowOptions = foundry.utils.mergeObject(defaultRollOptions, {
      autoRollAttack: getAutoRollAttack(this),
      autoRollDamage: getAutoRollDamage(this),
      fastForwardAttack: isAutoFastForward("attack", { workflow: this }),
      fastForwardDamage: isAutoFastForward("damage", { workflow: this })
    }, { inplace: false });
    if (options.workflowOptions)
      foundry.utils.mergeObject(this.workflowOptions, options.workflowOptions, { overwrite: true });
    if (this.activity.midiProperties?.noConcentrationCheck) this.workflowOptions.noConcentrationCheck = true;
    if (this.workflowOptions.templateUuid) this.templateUuid = this.workflowOptions.templateUuid;

    this.defaultDamageType = getActivityDefaultDamageType(this) ?? MidiQOL.MQdefaultDamageType;
    MidiQOL.MQdefaultDamageType = this.defaultDamageType; // Set the default damage type for the module.
    if (this.activity.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(this.defaultDamageType ?? "")) this.defaultDamageType = "healing";

    // Record targets selected before cast — prefer UUIDs captured early in use() before template targeting
    // preSelectedTargets is used by sculpt spells logic
    if (this.workflowOptions?.preSelectedTargetUuids?.length) {
      this.preSelectedTargets = new Set(
        this.workflowOptions.preSelectedTargetUuids
          .map(uuid => (fromUuidSync(uuid) as TokenDocument | null)?.object)
          .filter((t): t is Token.Implementation => !!t)
      );
    } else {
      this.preSelectedTargets = canvas?.scene ? new Set(game.user?.targets ?? []) : new Set();
    }
    if (activityHasAreaTarget(this.activity) && !activityHasAutoPlaceTemplate(this.activity)) {
      this.expectedTemplateCount = Number(this.activity?.target?.template?.count) || 1;
    } else {
      this.expectedTemplateCount = 0;
    }
    this.templateUuids = [];
    if (this.activity instanceof MidiSummonActivity && configSettings.autoRemoveSummonedCreature) {
      // Hooks.on + uuid filter rather than Hooks.once: concurrent summon workflows must not consume each other's hook
      this.postSummonHookId = Hooks.on("dnd5e.postSummon", (activity, profile, createdTokens, options) => {
        if (activity?.uuid !== this.activity?.uuid) return;
        this.summonedCreatures = createdTokens;
      })
    }
    this.itemUseComplete = false;
    this.kickStart = false;
    this.throttleChatMessageUpdates = getThrottlingFunction();
  }

  public someEventKeySet() {
    const event = this.rollOptions.event as AugmentedEvent | undefined;
    return event?.shiftKey || event?.altKey || event?.ctrlKey || event?.metaKey;
  }

  public someAutoRollEventKeySet() {
    const event = this.rollOptions.event as AugmentedEvent | undefined;
    return event?.altKey || event?.ctrlKey || event?.metaKey;
  }

  static async removeItemCardConfirmRollButton(itemCardUuid: string) {
    const chatMessage = getCachedDocument(itemCardUuid) as ChatMessage.Implementation;
    const workflow = Workflow.getWorkflow(itemCardUuid);
    if (!chatMessage?.content) return;
    let content = chatMessage.content;
    const confirmMissRe = /<button class="midi-qol-confirm-damage-roll-complete-miss" data-action="confirmDamageRollCompleteMiss">[^<]*?<\/button>/;
    content = content?.replace(confirmMissRe, "");
    const confirmRe = /<button class="midi-qol-confirm-damage-roll-complete" data-action="confirmDamageRollComplete">[^<]*?<\/button>/;
    content = content?.replace(confirmRe, "");
    const confirmHitRe = /<button class="midi-qol-confirm-damage-roll-complete-hit" data-action="confirmDamageRollCompleteHit">[^<]*?<\/button>/;
    content = content?.replace(confirmHitRe, "");
    const cancelRe = /<button class="midi-qol-confirm-damage-roll-cancel" data-action="confirmDamageRollCancel">[^<]*?<\/button>/;
    content = content?.replace(cancelRe, "");
    // TODO come back and make this cached.
    return await throttledUpdate(chatMessage, { content }, workflow?.throttleChatMessageUpdates, false);
  }

  static async removeItemCardButtons(itemCardUuid: string | undefined, { removeAllButtons = false, removeAttackButtons = true, removeDamageButtons = false, removeDnD5eButtons = false, removeConfirmButtons = false, removeAllDnd5eButtons = false, removeDnd5eSaveButtons = false, removeDnd5eTemplateButtons = false } = {}) {
    try {
      const workflow = Workflow.getWorkflow(itemCardUuid);
      const chatMessage = workflow?.chatCard;
      if (!chatMessage?.content) return;
      let content = chatMessage?.content;
      let allowRemoveAll = !(workflow && workflow.activity?.target.affects.type === "" && workflow.targets.size === 0)
      if (removeAllButtons && allowRemoveAll) {
        const buttonRe = /<button[\s\S]*?<\/button>/gi;
        content = content.replace(buttonRe, "");
        return await throttledUpdate(chatMessage, { content }, workflow?.throttleChatMessageUpdates, false);
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
        return await throttledUpdate(chatMessage, { content }, workflow?.throttleChatMessageUpdates);
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
    if (!workflow) {
      if (debugEnabled > 0) warn("removeWorkflow | No such workflow ", id);
      return;
    }
    if (workflow.postSummonHookId) Hooks.off("dnd5e.postSummon", workflow.postSummonHookId);
    if (debugEnabled > 0) warn(`removeWorkflow deleting ${id}`, Workflow.workflows.get(id));
    Workflow.workflows.delete(id);
    // Remove buttons
    if (workflow.itemCardUuid) {
      if (workflow.currentAction === workflow.WorkflowState_ConfirmRoll) {
        const itemCard = workflow.chatCard;
        if (itemCard) await itemCard.delete();
        clearUpdatesCache(workflow.itemCardUuid);
      } else {
        await Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        setTimeout(() => {
          const chatMessageElt = document?.querySelector(`[data-message-id="${workflow.itemCardId ?? "XXX"}"]`);
          if (chatMessageElt) chatMessageElt.querySelectorAll(".collapsible").forEach(ce => { if (!ce.classList.contains("collapsed")) ce.classList.add("collapsed") });
        }, 1)
      }
    }
  }

  public static get stateTable(): Record<string, WorkflowState> {
    const table = {};
    Reflect.ownKeys(this.prototype).filter(k => k.toString().startsWith("WorkflowState_")).forEach(k => table[k.toString()] = this.prototype[k.toString()]);
    return table;
  }

  public static get stateHooks(): Record<string, string> {
    const hooks = {};
    for (let state of Object.values(this.stateTable)) {
      const name = this.nameForState(state);
      hooks[`pre${name}`] = `before ${name} (S*)`;
      hooks[`post${name}`] = `after ${name} (S*)`;
    }
    return hooks;
  }
  public static get allHooks(): Record<string, string> {
    const allHooks = foundry.utils.mergeObject(onUseMacroOptions, this.stateHooks, { inplace: false });
    return allHooks;
  }

  public static get allMacroPasses(): Record<string, string> {
    return this.allHooks;
  }

  async callHooksForAction(prePost: ("pre" | "post"), action: WorkflowState): Promise<boolean | undefined> {
    if (!action) {
      console.warn("midi-qol | callPreHooksForAction | No action");
      return true;
    }
    if (debugEnabled > 1) log(`callHooksForAction | ${prePost} ${this.nameForState(action)}`)
    return this.callCancellableHooks(`midi-qol.${prePost}${this.nameForState(action)}`);
  }
  async callOnUseMacrosForAction(prePost: ("pre" | "post"), action: WorkflowState): Promise<(DamageBonusMacroResult | any)[]> {
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

  public static nameForState(state: WorkflowState): string {
    if (state === undefined) return "undefined";
    return state.name.replace(/^WorkflowState_/, "") ?? state.name;
  }

  public nameForState(state: WorkflowState): string {
    return Workflow.nameForState(state);
  }

  public async unSuspend(context: WorkflowContext = {}) {
    if (context.itemCardUuid) {
      this.itemCardUuid = context.itemCardUuid;

    }
    if (context.itemUseComplete) this.itemUseComplete = true;
    if (this.suspended) {
      this.suspended = false;
      this.performState(this.currentAction, context);
    }
  }

  async processPlacedTemplates(templates: MeasuredTemplateDocument[], activity?: Activity): Promise<boolean> {
    if (!templates || templates.length === 0) return false;
    const expectedCount = Number(activity?.target?.template?.count) || 1;
    if (templates.length < expectedCount) {
      // Incomplete placement: delete any templates placed so far
      for (const tDoc of templates) {
        try { await tDoc.delete(); } catch (e) { /* template may already be gone */ }
      }
      return false;
    }

    // Set midi-qol flags on each template and register cleanup
    // v14: resolve proxy MeasuredTemplateDocuments to actual RegionDocuments
    for (const tDoc of templates) {
      const regionDoc = tDoc._id ? canvas.scene?.regions.get(tDoc._id) : undefined;
      const docToStore = regionDoc ?? tDoc;
      this.templateUuid = docToStore.uuid;  // setter pushes to array + persists
      await this.setupTemplateCleanup(docToStore);
    }
    this.placedTemplateCount = templates.length;
    // Auto-target before attaching region behaviors so attachToken "target" resolution
    // sees the template targets rather than the stale pre-template selection
    this.selectAllTemplateTargets(activity);
    for (const tDoc of templates) {
      const regionDoc = tDoc._id ? canvas.scene?.regions.get(tDoc._id) : undefined;
      if (regionDoc && activity) {
        const overTimeActivity = activity.isOverTimeFlag
          ? activity
          // @ts-expect-error no dnd5e types for activities iterable
          : activity.item?.system?.activities?.find((a: any) => a.isOverTimeFlag);
        // @ts-expect-error _attachRegionActivityBehavior is defined on MidiActivityMixin
        await activity._attachRegionActivityBehavior?.(regionDoc, this, overTimeActivity, this.spellLevel);
      }
    }
    if (this.suspended && this.currentAction === this.WorkflowState_AwaitTemplate) {
      this.unSuspend();
    }
    return true;
  }

  selectAllTemplateTargets(activity?: Activity): void {
    if (!activity) activity = this.activity;
    const selfToken = getToken(activity?.actor);
    const ignoreSelf = (activity?.target?.affects.special ?? "").split(";").some(spec => ["-self"].includes(spec));
    const AoETargetType = activity ? getAoETargetType(activity) : "any";
    const targeting = getActivityAutoTargetAction(activity);
    if (targeting === "none") return;

    let allTargetTokens = computeTargetsFromTemplates(this.templateUuids, selfToken, ignoreSelf, AoETargetType, targeting);

    // Apply target count limit if configured
    if (activity?.target?.affects.count) {
      const maxTargets = Number(activity.target.affects.count) || 0;
      if (maxTargets > 0 && allTargetTokens.length > maxTargets) {
        allTargetTokens = allTargetTokens.slice(0, maxTargets);
      }
    }

    const allIds = allTargetTokens.map(t => t.id).filter(Boolean) as string[];
    updateUserTargets(allIds);
    this.setTargets(new Set(game.user?.targets ?? []));
  }

  async setupTemplateCleanup(templateDocument: MeasuredTemplateDocument | RegionDocument.Implementation): Promise<boolean> {
    if (!templateDocument) return false;
    // Both MeasuredTemplateDocument and RegionDocument inherit setFlag/getFlag from Document base
    const flagDoc = templateDocument as MeasuredTemplateDocument | RegionDocument.Implementation;

    if (configSettings.autoRemoveInstantaneousTemplate &&
      this.activity?.duration?.units === "inst") {
      return false;
    }

    // Concentration deferred: the effect does not exist yet, so neither link to a stale one from
    // an earlier cast of the same item nor fall through to the non-concentration deletion effect.
    // beginDeferredConcentration links every template in templateUuids once it has the effect.
    if (this.deferredConcentration) return true;

    const concentrationEffect = getConcentrationEffect(this.actor, this.item);
    if (concentrationEffect) {
      await (flagDoc as MeasuredTemplateDocument).setFlag("dnd5e", "dependentOn", concentrationEffect.uuid);
      return true;
    }

    if (!installedModules.get("dae") || !configSettings.autoRemoveTemplate) {
      return false;
    }

    // Check if effect already exists (e.g., from a previous cast)
    const templateString = " " + i18n("midi-qol.MeasuredTemplate");
    const existingEffect = this.actor?.effects.find(
      ef => ef.name === (this.item.name + templateString)
    );

    if (existingEffect) {
      await (flagDoc as MeasuredTemplateDocument).setFlag("dnd5e", "dependentOn", existingEffect.uuid);
      return true;
    }

    const activityDuration = this.activity.duration;
    if (!activityDuration?.units) return false;

    const selfTarget = this.token;
    const inCombat = (game.combat as Combat)?.turns.some(
      combatant => combatant.tokenId === selfTarget?.id
    );
    const converted = convertDuration(activityDuration, inCombat);
    if (converted.type === "none") {
      return false;
    }

    const effectData: ActiveEffect.CreateData = {
      origin: this.item.uuid,
      disabled: false,
      img: this.item.img,
      name: this.item.name + templateString,
      duration: {},
      flags: {
        dae: { stackable: "noneName", expiryMode: "delete" }
      },
    };

    if (converted.type === "seconds") {
      if (converted.seconds !== undefined) {
        // @ts-expect-error fvtt-types v14 duration
        effectData.duration = { value: converted.seconds, units: "seconds", expiry: "updateWorldTime" };
      }
      // @ts-expect-error fvtt-types v14 duration
      effectData.start = { time: game.time?.worldTime ?? 0 };
    } else if (converted.type === "turns") {
      if ((converted.rounds ?? 0) > 0) {
        // @ts-expect-error fvtt-types v14 duration
        effectData.duration = { value: converted.rounds, units: "rounds", expiry: "updateWorldTime" };
      } else if ((converted.turns ?? 0) > 0) {
        // @ts-expect-error fvtt-types v14 duration
        effectData.duration = { value: Math.max(converted.turns ?? 1, 1), units: "turns", expiry: "updateWorldTime" };
      }
      // @ts-expect-error fvtt-types v14 duration
      effectData.start = { round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
    }

    const effects = await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    if (effects.length > 0) {
      await (flagDoc as MeasuredTemplateDocument).setFlag("dnd5e", "dependentOn", effects[0].uuid);
      return true;
    }

    return false;
  }

  async renderAttributionTooltip(): Promise<string> {
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
    const mode = this.attackRoll?.options?.advantageMode ?? this.attackRollModifierTracker.advantageMode ?? ADV_MODE.NORMAL;
    const title = getAdvantageModeTitle(mode);
    return renderAttributionTooltip(this.attackAttribution ?? {}, title);
  }

  public async performState(newState: WorkflowState, context: WorkflowContext = {}) {
    if (this.stateTransitionCount === undefined) this.stateTransitionCount = 0;
    let isAborting = this.aborted;

    try {
      while (this.stateTransitionCount < (this.maxTransitionCount)) {
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
        // TODO: Is this necessary?
        await busyWait(1);
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
          this.performThrottledUpdate(this.chatCard, {}, false);
          // this.currentAction = this.WorkflowState_Suspend;
          if (debugEnabled > 0) warn(`${this.workflowName} ${this.nameForState(this.currentAction)} -> suspended Workflow ${this.id}`);
          // await this.performDebouncedUpdate(this.chatCard, { ["flags.midi-qol." + WorkflowDataFlags.suspended]: true });
          break;
        }
        newState = nextState;
        context = {};
      }

      if (this.stateTransitionCount >= this.maxTransitionCount) {
        const message = `performState | ${this.workflowName} Workflow ${this.id} exceeded ${this.maxTransitionCount} iterations`;
        error(message);
        TroubleShooter.recordError(new Error(message), message);
      }
    } catch (err) {
      const message = `performState | ${this.workflowName} Workflow ${this.id}`;
      error(message, err);
      TroubleShooter.recordError(err, message);
    }
  }

  async WorkflowState_Suspend(context: WorkflowContext = {}): Promise<WorkflowState> {
    const message = `${this.workflowName} Workflow ${this.id} suspend should never be called`;
    error(message);
    TroubleShooter.recordError(new Error(message), message);
    return undefined;
  }

  async WorkflowState_NoAction(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (debugEnabled > 0) warn("WorkflowState_NoAction", context);
    if (context.itemUseComplete) return this.WorkflowState_Start;
    return this.WorkflowState_Suspend;
  }

  async WorkflowState_Start(context: WorkflowContext = {}): Promise<WorkflowState> {
    // Self-target push/clear is handled in MidiActivityMixin.use() before setupTargets()
    if (!this.selfTargeted) {
      clearTargetSave();
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

  async WorkflowState_AwaitItemCard(context: WorkflowContext = {}): Promise<WorkflowState> {
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

  async WorkflowState_AwaitTemplate(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (debugEnabled > 0) warn("WorkflowState_AwaitTemplate started");
    if (this.templateUuids.length >= this.expectedTemplateCount) {
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

  async WorkflowState_TemplatePlaced(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
    }
    if (!this.itemCardUuid) return this.WorkflowState_AoETargetConfirmation;

    const chatMessage = this.chatCard;
    if (!chatMessage?.content) return this.WorkflowState_AoETargetConfirmation;
    // remove the place template button from the chat card only if all templates have been placed
    this.targets = validTargetTokens(this.targets);
    this.hitTargets = new Set()
    this.hitTargetsEC = new Set();
    let content = chatMessage.content;
    if (this.placedTemplateCount >= (Number(this.activity?.target?.template?.count) || 1)) {
      const buttonRe = /<button.*?data-action="placeTemplate"[^>]*?>[\s\S]*?<\/button>/
      content = chatMessage.content?.replace(buttonRe, "");
    }
    await this.performThrottledUpdate(chatMessage, { content, flags: { "midi-qol": { type: MESSAGE_TYPES.ITEM } }, style: CONST.CHAT_MESSAGE_STYLES.OTHER });
    return this.WorkflowState_AoETargetConfirmation;
  }

  async WorkflowState_AoETargetConfirmation(context: WorkflowContext = {}): Promise<WorkflowState> {
    // postTemplateConfirmTargets uses requiresTargetConfirmation to decide whether to show
    // the confirmation dialog — covers AoE templates, scaled counts, activity/global settings,
    // and workflowOptions.targetConfirmation overrides.
    if (!await postTemplateConfirmTargets(this.activity, { workflowOptions: this.workflowOptions }, this)) {
      await this.refundConsumption();
      return this.WorkflowState_Abort;
    }
    const hasScaledTargetCount = activityHasScaledTargetCount(this.activity);
    if (hasScaledTargetCount) {
      const allowedTargets = Number(this.activity.target?.affects?.count);
      if (allowedTargets && this.targets.size > allowedTargets) {
        ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
        await this.refundConsumption();
        return this.WorkflowState_Abort;
      }
    }
    return this.WorkflowState_ValidateRoll;
  }

  async WorkflowState_ValidateRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) {
      await this.triggerTargetMacros(["isTargeted"]);
      if (this.aborted) return this.WorkflowState_Abort;
    }

    // do pre roll checks
    /*
     * Thrown weapons are ranged attacks and the range rules apply to them — "hurl a handaxe" is the
     * rules' own example of making one. A thrown weapon is a melee weapon carrying the property, so
     * its activity is mwak and this gate was skipping it: no long-range disadvantage, and no
     * out-of-range failure either. `checkActivityRange` was always written to cope with them (it
     * clamps the long range away only for melee weapons *without* the property) and
     * TargetConfirmation already calls it for mwak, so this caller was the odd one out.
     *
     * No guard is needed for one used in melee: with its normal range read correctly, a javelin
     * thirty feet out is inside it and reports normal.
     */
    if (checkMechanic("checkRange") !== "none" && !this.AoO && isRangeCheckable(this.activity) && this.tokenUuid) {
      const { result, attackingToken, range, longRange } = checkActivityRange(this.activity, getToken(this.token) ?? "invalid", this.targets);
      switch (result) {
        case "fail": return this.WorkflowState_RollFinished;
        case "dis": this.longRangeAttack = true;
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

  async WorkflowState_PreambleComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    await this.beginDeferredConcentration();
    if (configSettings.undoWorkflow) await saveTargetsUndoData(this);
    this.effectsAlreadyExpired = [];

    if (await this.callCancellableHooks("midi-qol.targetingComplete") === false) {
      ui.notifications?.warn(`midi-qol | Targeting complete hook cancelled roll`);
      return this.WorkflowState_Abort;
    }
    if ((!getAutoRollAttack(this) && this.activity.attack) || this.activity instanceof MidiTransformActivity) {
      // Not auto rolling so display targets
      const rollMode = safeGetGameSetting("core", "messageMode") as string;
      this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blind" || rollMode === "gm";
      if (this.activity.target?.affects?.type !== "self") {
        await this.displayHitTargets(this.whisperAttackCard);
      }
    }
    return this.WorkflowState_WaitForAttackRoll;
  }
  get postAttackRollState(): WorkflowState {
    return this.WorkflowState_WaitForDamageRoll
  }

  async WorkflowState_WaitForAttackRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (context.attackRoll) {
      if (this.abort) return this.WorkflowState_Abort;
      return this.WorkflowState_AttackRollComplete;
    }
    if (!this.activity.attack) {
      this.hitTargets = new Set(this.targets);
      this.hitTargetsEC = new Set();
      if (this.hasSave) {
        this.needsHitTargetsDisplayed = false;
      } else if (this.targets.size > 0 && this.activity.target?.affects?.type !== "self") {
        await this.displayHitTargets(false);
      }
      if (this.activity.roll?.formula) return this.WorkflowState_WaitForUtilityRoll;
      return this.postAttackRollState;
    }

    const isFastRoll = this.rollOptions.fastForwardAttack ?? this.workflowOptions.fastForwardAttack ?? isAutoFastForward("attack", { workflow: this });
    this.rollOptions.fastForwardAttack ||= isFastRoll;
    const autoRollAttack = getAutoRollAttack(this);
    if (!autoRollAttack) {
      const chatMessage = this.chatCard;
      let content = chatMessage?.content;
      if (content && !isFastRoll) {
        const searchRe = /(<button[^>]*data-action="rollAttack"[^>]*>)<span>[^<]*<\/span>(<\/button>)/;

        const hasAdvantage = this.advantage && !this.disadvantage;
        const hasDisadvantage = this.disadvantage && !this.advantage;
        let attackString = hasAdvantage ? i18n("DND5E.Advantage") : hasDisadvantage ? i18n("DND5E.Disadvantage") : i18n("DND5E.Attack")
        let replaceString = `$1<span>${attackString}</span>$2`;
        content = content.replace(searchRe, replaceString);
        await this.performThrottledUpdate(chatMessage, { content });
      } else if (!chatMessage) {
        const message = `WaitForAttackRoll | no chat message`;
        error(message);
        TroubleShooter.recordError(new Error(message), message);
      }
    }

    if (this.activity.roll?.formula) return this.WorkflowState_WaitForUtilityRoll;
    if (autoRollAttack) {
      this.rollOptions.fastForwardAttack ||= isFastRoll;
      this.activity.rollAttack!({ event: this.rollOptions.event, workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, {});
    }
    return this.WorkflowState_Suspend;
  }

  async WorkflowState_AttackRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["isAttacked"]);
    await this.processAttackRoll();
    await this.callMidiHooks("midi-qol.preCheckHits");
    if (this.aborted) return this.WorkflowState_Abort;

    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
    }

    await this.processAttackRoll();
    this.recordAttackStats();

    if (configSettings.autoCheckHit !== "none") {
      await this.displayAttackRoll({ GMOnlyAttackRoll: true });
      this.recordTargetACModifiers();
      await this.recordFlankingBonuses();
      await this.checkHits();
      await this.displayAttackRoll();
      const rollMode = safeGetGameSetting("core", "messageMode") as string;
      this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blind" || rollMode === "gm";
      await this.callMidiHooks("midi-qol.hitsChecked");
      if (this.aborted) return this.WorkflowState_Abort;
      await this.displayHits(this.whisperAttackCard);
    } else {
      await this.displayAttackRoll();
    }
    if (checkRule("removeHiddenInvis")) await removeHidden.bind(this)();
    if (checkRule("removeHiddenInvis")) await removeInvisible.bind(this)();
    await this.expireTargetEffects(["isAttacked"]);

    await this.callMidiHooks("midi-qol.AttackRollComplete");
    if (this.aborted) return this.WorkflowState_Abort;

    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
      if (this.aborted) return this.WorkflowState_Abort;
    }

    if (configSettings.autoCheckHit === "none") {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      if (this.targets.size > 0 && this.activity.target?.affects?.type !== "self") {
        await this.displayHitTargets(false);
      }
      return this.postAttackRollState;
    }
    if (getAutoRollDamage(this) === "always") return this.postAttackRollState;
    const noHits = this.hitTargets.size === 0 && this.hitTargetsEC.size === 0;
    const allMissed = noHits && this.targets.size !== 0;
    if (allMissed) {
      if (configSettings.confirmAttackDamage !== "none" && !this.workflowOptions.forceCompletion)
        return this.WorkflowState_ConfirmRoll;
      if (this.workflowOptions.forceCompletion || configSettings.autoCompleteWorkflow) {
        expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
        return this.WorkflowState_RollFinished;
      }
      // if (configSettings.autoRollDamage !== "always") return this.WorkflowState_RollFinished;
      // else return this.WorkflowState_WaitForDamageRoll;
    }
    return this.postAttackRollState;
  }

  _formatAttackTargets() {
    const targets = new Map<string, { name: string; img?: string | null; uuid: string; ac: number | string }>();
    for (const token of this.targets) {
      const { name } = token;
      const { img, system, uuid } = token.actor ?? {};
      // @ts-expect-error no dnd5e-types
      const ac: number | string = system?.attributes?.ac?.value ?? "";
      if (uuid && Number.isNumeric(ac)) targets.set(uuid, { name, img, uuid, ac: ac });
    }
    return Array.from(targets.values());
  }

  async WorkflowState_WaitForDamageRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (context.damageRoll || context.otherDamageRoll) {
      // record the data - currently done in item handling
      return this.WorkflowState_ConfirmRoll;
    }
    if (context.noDamage) return this.WorkflowState_WaitForSaves;
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

    if (this.shouldRollDamage) {
      if (debugEnabled > 0) warn("waitForDamageRoll | rolling damage ", this.rollOptions.event, configSettings.autoRollAttack, configSettings.autoFastForward)
      const storedData = this.chatCard?.getFlag("dnd5e", "item")?.data;
      if (storedData) { // If magic items is being used it fiddles the roll to include the item data
        this.item = new CONFIG.Item.documentClass(storedData, { parent: this.actor })
      }

      this.rollOptions.isCritical = this.isCritical;
      this.rollOptions.fastForwardDamage = isAutoFastForward("damage", { workflow: this });
      this.activity.rollDamage({ workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, { create: false });
      return this.WorkflowState_Suspend;
    } else {
      const chatMessage = this.chatCard;
      if (chatMessage?.content) {
        const searchRe = /(<button[^>]*data-action="rollDamage"[^>]*>)(?:<span>)?[^<]*(?:<\/span>)?(<\/button>)/;
        const damageTypeString = (this.activity.actionType === "heal") ? i18n("DND5E.HEAL.HealingButton") : i18n("DND5E.Damage");
        let damageString = (this.rollOptions.isCritical || this.isCritical) ? i18n("DND5E.Critical") : damageTypeString;
        if (this.rollOptions.fastForwardDamage && configSettings.showFastForward) damageString += ` ${i18n("midi-qol.fastForward")}`;
        // Preserve button tag, replace content with span for consistency
        let replaceString = `$1<span>${damageString}</span>$2`;
        let content = chatMessage.content.replace(searchRe, replaceString);
        await this.performThrottledUpdate(chatMessage, { content });
      }
    }
    return this.WorkflowState_Suspend; // wait for a damage roll to advance the state.
  }
  async WorkflowState_ConfirmRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    if (configSettings.confirmAttackDamage !== "none" && (this.activity.attack || this.activity.damage)) {
      await this.displayDamageRolls();
      return this.WorkflowState_Suspend; // wait for the confirm button
    }
    return this.WorkflowState_DamageRollStarted;
  }
  async WorkflowState_RollConfirmed(context: WorkflowContext = {}): Promise<WorkflowState> {
    expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
    return this.WorkflowState_DamageRollStarted;
  }
  async WorkflowState_DamageRollStarted(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (this.itemCardUuid) {
      await Workflow.removeItemCardButtons(this.itemCardUuid, { removeAllButtons: false, removeAttackButtons: getRemoveAttackButtons(this.activity), removeDamageButtons: getRemoveDamageButtons(this.activity), removeConfirmButtons: true });
    }
    if (getActivityAutoTargetAction(this.activity) === "none" && activityHasAreaTarget(this.activity) && !this.activity.attack) {
      this.targets = validTargetTokens(new Set(game.user?.targets));
      this.hitTargets = validTargetTokens(new Set(game.user?.targets));
      this.hitTargetsEC = new Set();
      if (debugEnabled > 0) warn("damageRollStarted | for non auto target area effects spells", this)
    }
    await this.rollAllBonusDamage();
    return this.WorkflowState_DamageRollComplete;
  }

  async WorkflowState_DamageRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) { //
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
    }
    await this.callMidiHooks("midi-qol.DamageRollComplete");
    if (this.aborted) return this.WorkflowState_Abort;
    if (this.hitTargets?.size || this.hitTargetsEC?.size) expireMyEffects.bind(this)(["1Hit"]);
    expireMyEffects.bind(this)(["1Action", "1Attack", "1Spell", "1Critical", "1Fumble"]);
    await this.displayDamageRolls();

    if (this.isFumble) {
      this.failedSaves = new Set();
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      return this.WorkflowState_ApplyDynamicEffects;
    }
    await Workflow.removeItemCardButtons(this.itemCardUuid, { removeAllButtons: false, removeAttackButtons: getRemoveAttackButtons(this.activity), removeDamageButtons: getRemoveDamageButtons(this.activity), removeDnD5eButtons: false, removeDnd5eSaveButtons: false });
    return this.WorkflowState_WaitForSaves;
  }

  async WorkflowState_WaitForUtilityRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (!this.activity.roll?.formula || context.utilityRolls) return this.WorkflowState_UtilityRollComplete;
    if (getAutoRollDamage(this) !== "none") {
      const rolls = await this.activity.rollFormula!({ event: this.rollOptions.event, workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, { create: false });
      if (!rolls || this.abort) {
        return this.WorkflowState_Abort;
      }
      return this.WorkflowState_UtilityRollComplete;
    }
    return this.WorkflowState_Suspend;
  }

  async WorkflowState_UtilityRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (this.itemCardUuid && this.utilityRolls) {
      this.displayUtilityRolls();
    }
    return this.WorkflowState_WaitForDamageRoll;
  }
  async WorkflowState_DamageRollCompleteCancelled(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (configSettings.undoWorkflow) {

    }
    return this.WorkflowState_Suspend;
  }
  async WorkflowState_WaitForSaves(context: WorkflowContext = {}): Promise<WorkflowState> {
    // If the save is from the other activity, check consumption first
    // If consumption fails or is cancelled, skip the save entirely
    if (this.saveActivity === this.otherActivity && this.otherActivity) {
      // For attacks, skip other activity if nothing was hit (don't consume resources for a miss)
      if (this.activity.attack && this.hitTargets.size === 0 && this.hitTargetsEC.size === 0) {
        addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.otherActivityConsumed]: false }, "midi-qol"); // Mark as skipped
        this.rawOtherDamageDetail = [];
        this.initSaveResults();
        return this.WorkflowState_SavesComplete;
      }
      const consumptionSuccess = await this.checkOtherActivityConsumption();
      if (!consumptionSuccess) {
        this.initSaveResults();
        return this.WorkflowState_SavesComplete;
      }
    }

    if (configSettings.allowUseMacro) {
      if (this.workflowOptions.noOnUseMacro !== true) await this.callMacros(this.item, this.onUseMacros?.getMacros("preSave"), "OnUse", "preSave");
      if (this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["isAboutToSave"]); // ??
      if (this.ammunition && this.workflowOptions.noOnUseMacro !== true) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preSave"), "OnUse", "preSave");
    }
    if (this.workflowType === "BaseWorkflow" && !this.workflowOptions.ignoreUserTargets && !this.activity.attack && this.activity.target?.affects.type !== "self") { // Allow editing of targets if there is no attack that has already been processed.
      this.targets = new Set(game.user?.targets);
      this.hitTargets = new Set(this.targets);
    }
    this.failedSaves = new Set(this.hitTargets);
    if (!this.hasSave) {
      this.initSaveResults();  // Ensure saveResults is initialized even without a save
      return this.WorkflowState_SavesComplete;
    }
    await this.displaySaveTargets();
    this.initSaveResults();
    if (configSettings.autoCheckSaves !== "none") {
      await this.callMidiHooks("midi-qol.preCheckSaves");
      if (this.aborted) return this.WorkflowState_Abort;
      if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessageHTML"]?.length)
      let hookId = Hooks.on("renderChatMessageHTML", this.processSaveRoll.bind(this));
      let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
      //@ts-expect-error flash-rolls-5e custom hook
      let flashId = Hooks.on("flash-rolls-5e.rollComplete", this.flashSavingCheck.bind(this));
      try {
        const saveDisplay = (this.activity.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity.saveDisplay;
        await this.checkSaves(saveDisplay !== "allShow");
      } catch (err) {
        const message = ("midi-qol | checkSaves error")
        TroubleShooter.recordError(err, message);
        error(message, err)
      } finally {
        Hooks.off("renderChatMessageHTML", hookId);
        Hooks.off("updateChatMessage", monksId);
        //@ts-expect-error flash-rolls-5e custom hook
        Hooks.off("flash-rolls-5e.rollComplete", flashId);
      }
      if (debugEnabled > 1) debug("Check Saves: ", this.saveRequests, this.saveTimeouts, this.saves);
      if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessageHTML"]?.length)
      await this.callMidiHooks("midi-qol.postCheckSaves");
      if (this.aborted) return this.WorkflowState_Abort;
      const saveDisplay = (this.activity.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity.saveDisplay;
      await Workflow.removeItemCardButtons(this.itemCardUuid as string, { removeDnd5eSaveButtons: configSettings.autoCheckSaves !== "none", removeDnd5eTemplateButtons: this.placedTemplateCount >= (Number(this.activity?.target?.template?.count) || 1) });
      await this.displaySaves(saveDisplay === "whisper");
    } else {// has saves but we are not checking so do nothing with the damage
      this.effectTargets = this.failedSaves;
      return this.WorkflowState_RollFinished;
    }
    return this.WorkflowState_SavesComplete;
  }
  async WorkflowState_SavesComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    expireMyEffects.bind(this)(["1Action", "1Spell"]);
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postSave"), "OnUse", "postSave");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postSave"), "OnUse", "postSave");
    }
    if (configSettings.keepRollStats && this.item && this.hasSave) {
      gameStats.addSaveResult(
        this.saves.size + this.failedSaves.size,
        this.saves.size,
        this.failedSaves.size,
        this.item
      );
    }
    return this.WorkflowState_AllRollsComplete;
  }

  async WorkflowState_AllRollsComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    let items: any[] = [];

    // Skip other damage processing entirely if consumption was already declined
    const consumedFlag = this.chatCard?.getFlag(MODULE_ID, "use.consumed");
    if (consumedFlag === false) {
      // Consumption was declined - ensure other damage is cleared
      this.otherDamageMatches = new Set();
      this.rawOtherDamageDetail = [];
    } else {
      // Build otherDamageMatches (no-op if rollOtherDamage already built it)
      await this.buildOtherDamageMatches();

      // Process consumption for other activity if it will be applied
      if (this.otherDamageMatches!.size > 0) {
        await this.checkOtherActivityConsumption();
      }
    }

    if (this.rawDamageDetail && (this.rawDamageDetail?.length || this.rawOtherDamageDetail?.length)) await processDamageRoll(this, this.rawDamageDetail[0]?.type ?? this.defaultDamageType)
    this.recordDamageStats();
    // If a damage card is going to be created don't call the isDamaged macro - wait for the damage card calculations to do a better job
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true && !configSettings.autoApplyDamage.includes("Card"))
      await this.triggerTargetMacros(["isDamaged"], this.hitTargets);
    if (debugEnabled > 1) debug("all rolls complete ", foundry.utils.duplicate(this.rawDamageDetail));
    return this.WorkflowState_ApplyDynamicEffects;
  }

  async checkOtherActivityConsumption(): Promise<boolean> {
    if (!this.otherActivity || !this.otherActivity.hasConsumption()) {
      return true;
    }

    const existingFlag = this.chatCard?.getFlag(MODULE_ID, "use.consumed");
    if (existingFlag !== undefined) {
      return existingFlag !== false;
    }

    const shouldShowDialog = !this.otherActivity.shouldAutoConsume(this);
    let otherUsageConfig: ActivityUseConfiguration = this.otherActivity._prepareUsageConfig({
      consume: { resources: true, spellSlot: false, action: false }
    }) as ActivityUseConfiguration;

    if (shouldShowDialog) {
      try {
        // @ts-expect-error no dnd5e-types
        const DialogClass = this.otherActivity.metadata?.usage?.dialog ?? game.dnd5e.applications.activity.ActivityUsageDialog;
        const canScale = this.otherActivity.canScale ?? this.otherActivity.consumption?.scaling?.allowed ?? false;
        otherUsageConfig = await DialogClass.create(this.otherActivity, otherUsageConfig, {
          display: { consumption: true, scaling: canScale, concentration: false, creation: false }
        });
        const messageConfig: any = { data: {} };
        const consumeResult = await this.otherActivity.consume(otherUsageConfig, messageConfig);
        if (consumeResult === false) {
          this.otherDamageMatches = new Set();
          this.rawOtherDamageDetail = [];
          addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.otherActivityConsumed]: false }, "midi-qol");
          return false;
        }
        const consumed = getConsumptionData(messageConfig) ?? {};
        const scaling = otherUsageConfig.scaling;
        if (this.itemCardUuid) {
          addUpdatesCacheFlags(this.id, {
            [WorkflowDataFlags.otherActivityConsumed]: consumed,
            [WorkflowDataFlags.otherActivityScaling]: scaling
          }, "midi-qol");
        }
      } catch (e) {
        this.otherDamageMatches = new Set();
        this.rawOtherDamageDetail = [];
        addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.otherActivityConsumed]: false }, "midi-qol");
        return false;
      }
    } else {
      const consumptionCheck = await this.otherActivity._prepareUsageUpdates(otherUsageConfig, { returnErrors: true });
      if (Array.isArray(consumptionCheck) && consumptionCheck.length > 0) {
        ui.notifications?.warn(i18nFormat("midi-qol.otherActivityConsumptionFailed", {
          actorName: this.actor?.name ?? "Unknown",
          itemName: this.item?.name ?? "Unknown",
          activityName: this.activity?.name ?? "Unknown"
        }));
        this.otherDamageMatches = new Set();
        this.rawOtherDamageDetail = [];
        addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.otherActivityConsumed]: false }, "midi-qol");
        return false;
      }

      const messageConfig: any = { data: {} };
      const consumeResult = await this.otherActivity.consume(otherUsageConfig, messageConfig);
      if (consumeResult === false) {
        // Consumption was cancelled by a hook
        this.otherDamageMatches = new Set();
        this.rawOtherDamageDetail = [];
        addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.otherActivityConsumed]: false }, "midi-qol");
        return false;
      }
      const consumed = getConsumptionData(messageConfig) ?? {};
      const scaling = otherUsageConfig.scaling;
      if (this.itemCardUuid) {
        addUpdatesCacheFlags(this.id, {
          [WorkflowDataFlags.otherActivityConsumed]: consumed,
          [WorkflowDataFlags.otherActivityScaling]: scaling
        }, "midi-qol");
      }
    }
    await this.rollDeferredOtherDamage();
    return true;
  }

  async buildOtherDamageMatches(): Promise<void> {
    if (this.otherDamageMatches !== undefined) return; // already built (may be empty if condition matched no targets)
    this.otherDamageMatches = new Set();
    const otherCondition = this.otherUseCondition;
    const targetsForOtherDamage = this.activity.attack
      ? new Set([...this.hitTargets, ...this.hitTargetsEC])
      : this.targets;
    for (const token of targetsForOtherDamage) {
      if (otherCondition) {
        if (await evalActivationCondition(this, otherCondition, token, { async: true, errorReturn: false }))
          this.otherDamageMatches.add(token);
      } else {
        this.otherDamageMatches.add(token);
      }
    }
  }

  async rollDeferredOtherDamage(): Promise<void> {
    const config = this.otherDamageConfig;
    if (!config || !this.otherActivityOrAmmunition) return;

    const dialog = this.otherDamageDialog ?? {};

    try {
      const otherResult = await this.activity.rollOtherDamage(config, dialog);

      if (otherResult) {
        await this.displayDamageRolls();
      }
    } catch (err) {
      TroubleShooter.recordError(err, "midi-qol | rollDeferredOtherDamage error");
      error("rollDeferredOtherDamage error", err);
    }

    this.otherDamageConfig = undefined;
    this.otherDamageDialog = undefined;
  }

  async WorkflowState_ApplyDynamicEffects(context: WorkflowContext = {}): Promise<WorkflowState> {
    this.activationMatches = new Set();
    this.otherActivationMatches = new Set();
    this.activationFails = new Set();
    this.otherActivationFails = new Set();
    let targetsToUse = this.targets;
    // Special case for target affects not specified an no targets selected when rolled - assume user has selected new targets so use those
    if (this.activity.target?.affects?.type === "" && this.targets.size == 0)
      targetsToUse = new Set(game.user?.targets);
    for (let token of targetsToUse) {
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
    this.effectTargets = this.effectTargets.filter(t => this.activationMatches!.has(t));

    if (this.forceApplyEffects) {
      this.otherEffectTargets = this.targets;
    } else if ((this.otherActivityOrAmmunition?.save || this.otherActivityOrAmmunition?.check) && this.activity.attack) {
      this.otherEffectTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
      // check saves when selecting the effects to apply - deal with always apply effects
      if (!this.otherEffectActivationCondition)
        this.otherEffectTargets = new Set([...this.otherEffectTargets].filter(t => this.failedSaves.has(t)));
    } else if (this.otherActivityOrAmmunition?.save || this.otherActivityOrAmmunition?.check) this.otherEffectTargets = this.failedSaves;
    else if (this.activity.attack) {
      this.otherEffectTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    } else
      this.otherEffectTargets = this.targets;
    this.otherEffectTargets = this.otherEffectTargets.filter(t => this.otherActivationMatches!.has(t));

    // Check consumption for other activity effects if not already checked
    // This handles the case where other activity has effects but no save and no damage
    if (this.otherActivity && this.otherEffectTargets.size > 0) {
      const otherConsumedFlag = this.chatCard?.getFlag(MODULE_ID, "use.consumed");
      if (otherConsumedFlag === false) {
        // Consumption was already declined - skip other effects
        this.otherEffectTargets = new Set();
      } else if (otherConsumedFlag === undefined && this.otherActivity.hasConsumption()) {
        // Consumption not yet checked and other activity has consumption - check now
        const consumptionSuccess = await this.checkOtherActivityConsumption();
        if (!consumptionSuccess) {
          this.otherEffectTargets = new Set();
        }
      }
    }

    // Do special expiries
    const specialExpiries = [
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
        let results: any[] = await this.callMacros(this.activity.item, this.onUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
        // Special check for return of {haltEffectsApplication: true} from item macro
        if (results.some(r => r?.haltEffectsApplication))
          return this.WorkflowState_RollFinished;
        results = await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
        if (results.some(r => r?.haltEffectsApplication))
          return this.WorkflowState_RollFinished;
      }
    }

    // no item, not auto effects or not module skip
    let useCE: string = configSettings.autoCEEffects;
    if (!this.activity.item) return this.WorkflowState_RollFinished;
    if (this.activity.midiProperties?.autoCEEffects && this.activity.midiProperties.autoCEEffects !== "default") {
      useCE = this.activity.midiProperties.autoCEEffects;
    }
    let ceEffect = getCEEffectByName(this.activity.name);
    if (!ceEffect) ceEffect = getCEEffectByName(this.activity.item.name);
    const isApplicableEffect = (activity: Activity | undefined | null, efData: ActivityEffectData | undefined | null): boolean => {
      if (!efData || !activity) return false;
      const level = activity.relevantLevel;
      //@ts-expect-error no dnd5e-types
      if (((efData.level?.min ?? -Infinity) > level) || (level > (efData.level?.max ?? Infinity)))
        return false;
      // @ts-expect-error no dnd5e-types
      return !!efData.effect && efData.effect?.transfer !== true && efData.effect?.type !== "enchantment";
    }
    // can't use this.activity.applicableEffects since we need to know about onSave or not
    let activityEffects = (this.activity.effects ?? []).filter(efData => isApplicableEffect(this.activity, efData) && efData.onSave !== true).map(efData => efData.effect!);
    let onSaveActivityEffects = (this.activity.effects ?? []).filter(efData => isApplicableEffect(this.activity, efData) && efData.onSave === true).map(efData => efData.effect!);
    let otherActivityEffects = (this.otherActivity?.effects ?? []).filter(efData => isApplicableEffect(this.otherActivity, efData) && efData.onSave !== true).map(efData => efData.effect!);
    let onSaveOtherActivityEffects = (this.otherActivity?.effects ?? []).filter(efData => isApplicableEffect(this.otherActivity, efData) && efData.onSave === true).map(efData => efData.effect!);
    /*
     * Ammunition effects. The ammunition activity is resolved independently of otherActivity, so an
     * item's own other activity and its ammunition can both contribute. They join the other-activity
     * collections rather than getting a third application path: the targeting and consumption
     * handling below is exactly what they need, and an activity can no longer be both, so nothing is
     * collected twice.
     */
    const ammunitionActivity = this.ammunitionActivity;
    if (ammunitionActivity && ammunitionActivity !== this.otherActivity) {
      const ammunitionEffects = (ammunitionActivity.effects ?? [])
        .filter((efData: any) => isApplicableEffect(ammunitionActivity, efData));
      otherActivityEffects = otherActivityEffects.concat(
        ammunitionEffects.filter((efData: any) => efData.onSave !== true).map((efData: any) => efData.effect!));
      onSaveOtherActivityEffects = onSaveOtherActivityEffects.concat(
        ammunitionEffects.filter((efData: any) => efData.onSave === true).map((efData: any) => efData.effect!));
    }
    if (activityEffects.length > 0 && this.effectTargets.size > 0 && this.activity.midiProperties?.chooseEffects) { // WIP
      activityEffects = await this.chooseEffects(activityEffects, { activity: this.activity, activityUuid: this.activity.uuid, isOtherActivity: false });
    }
    if (otherActivityEffects.length > 0 && this.otherEffectTargets.size > 0 && this.otherActivity?.midiProperties?.chooseEffects) { // WIP
      otherActivityEffects = await this.chooseEffects(otherActivityEffects, { activity: this.otherActivity, activityUuid: this.otherActivity.uuid, isOtherActivity: true });
    }
    const ceTargetEffect = ceEffect && !(ceEffect?.flags?.dae?.selfTarget || ceEffect?.flags?.dae?.selfTargetAlways);
    const ceSelfEffect = ceEffect && (ceEffect?.flags?.dae?.selfTarget || ceEffect?.flags?.dae?.selfTargetAlways);
    const hasActivityEffects = hasDAE(this) && activityEffects.length > 0;
    const hasOtherActivityEffects = hasDAE(this) && otherActivityEffects.length > 0;

    const activitySelfEffects = [...activityEffects, ...onSaveActivityEffects].filter(ef => ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways) ?? [];
    const activitySelfAllEffect = [...activityEffects, ...onSaveActivityEffects].filter(ef => ef.flags?.dae?.selfTargetAlways) ?? [];
    const otherActivitySelfEffects = [...otherActivityEffects, ...onSaveOtherActivityEffects].filter(ef => ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways) ?? [];
    const otherActivitySelfAllEffects = [...otherActivityEffects, ...onSaveOtherActivityEffects].filter(ef => ef.flags?.dae?.selfTargetAlways) ?? [];

    activityEffects = activityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    otherActivityEffects = otherActivityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    onSaveActivityEffects = onSaveActivityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    onSaveOtherActivityEffects = onSaveOtherActivityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
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
    let origin = this.actor.effects.get(this.chatCard?.getFlag("dnd5e", "use.concentrationId") ?? "")?.uuid
      ?? getConcentrationEffect(this.actor, this.item)?.uuid;
    let damageComponents = {};
    let damageListItem;
    let hpDamage;
    let totalDamage: number | undefined;
    const doEffectsData = {
      damageTotal: 0,
      damage: 0,
      critical: this.isCritical,
      fumble: this.isFumble,
      itemCardUuid: this.itemCardUuid,
      metaData,
      selfEffects: "none",
      spellLevel: this.spellLevel,
      origin: "",
      toggleEffect: this.activity.midiProperties?.toggleEffect,
      // Is this used?
      tokenUuid: this.tokenUuid,
      // Is this used?
      actorUuid: this.actor.uuid,
      whisper: false,
      // Is this used?
      workflowOptions: this.workflowOptions,
      context: {
        damageComponents: {},
        damageTotal: 0,
        damageApplied: 0,
        otherDamage: this.otherDamageTotal ?? 0,
        bonusDamage: this.bonusDamageTotal ?? 0,
        itemData: this.item?.getRollData?.()?.item,
        activity: this.activity?.getRollData?.()?.activity,
        flags: {
          dnd5e: {
            scaling: this.chatCard?.getFlag("dnd5e", "scaling"),
            spellLevel: this.chatCard?.getFlag("dnd5e", "use.spellLevel")
          }
        },
        utilityRollTotal: this.utilityRoll?.total,
      }
    }
    for (let token of this.targets) {
      const tokenDamages = this.damageList?.find(di => di.targetUuid === getTokenDocument(token)?.uuid);
      if (tokenDamages) {
        doEffectsData.damageTotal = tokenDamages.totalDamage;
        doEffectsData.context.damageTotal = tokenDamages.totalDamage;
        doEffectsData.damage = tokenDamages.hpDamage;
        doEffectsData.context.damageApplied = tokenDamages.hpDamage;
        doEffectsData.context.damageComponents = [tokenDamages.damageDetails["combinedDamage"], configSettings.singleConcentrationRoll ? [] : (tokenDamages.damageDetails["otherDamage"] ?? [])]
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
              this.effectTargets?.has(token) && (
                !(this.activity.save || this.activity.check)
                || this.failedSaves.has(token)
                || this.activity.effects.some(effectDetail => effectDetail.onSave == true && effectDetail._id === ef.id)
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
          if (ceEffect && (["both", "cepri", "ceOnly"].includes(useCE) || (useCE === "itempri" && !hasActivityEffects))) {
            const targetHasEffect = token.actor.effects.find(ef => ef.name === ceEffect.name);
            if (this.activity.midiProperties?.toggleEffect && targetHasEffect) {
              await CEToggleEffect({ effectName: ceEffect.name, uuid: token.actor.uuid, origin });
            } else {
              // Check stacking status
              let removeExisting = (["none", "noneName"].includes(ceEffect.flags?.dae?.stackable ?? "none"));
              const hasExisting = await CEHasEffectApplied({ effectName: ceEffect.name, uuid: token.actor.uuid })
              if (removeExisting && hasExisting) {
                await CERemoveEffect({ effectName: ceEffect.name, uuid: token.actor.uuid, origin });
              }
              const effectData = foundry.utils.mergeObject(ceEffect.toObject(), metaData);
              // @ts-expect-error fvtt-types v14 duration
              if (isInCombat(token.actor) && effectData.duration?.units === "seconds" && (effectData.duration?.value ?? 0) <= 60) {
                // @ts-expect-error fvtt-types v14 duration
                effectData.duration = { value: Math.ceil((effectData.duration.value ?? 0) / CONFIG.time.roundTime), units: "rounds" };
              }
              effectData.origin = origin ?? this.activity.uuid ?? this.activity.item.uuid;
              const concentrationUuid = this.actor.effects.get(this.chatCard?.getFlag("dnd5e", "use.concentrationId") ?? "")?.uuid;
              if (concentrationUuid) {
                foundry.utils.setProperty(effectData, "flags.dnd5e.dependentOn", concentrationUuid);
              }
              const effects = await CEAddEffectWith({ effectData, effectName: ceEffect.name, uuid: token.actor.uuid, origin, overlay: false });
            }
          }
        }
      }

      if (this.effectTargetsOnSave.size > 0 && onSaveActivityEffects.length > 0) {
        let selectedEffects = onSaveActivityEffects;
        const effectsToApplyUuids = onSaveActivityEffects.map(ef => ef.uuid);
        if (effectsToApplyUuids?.length > 0) {
          // TODO: Is this right?
          doEffectsData.origin = effectsToApplyUuids[0];
          await globalThis.DAE.doActivityEffects(this.activity, true, [token], effectsToApplyUuids, doEffectsData)
        }
      }
      if (this.forceApplyEffects || this.otherEffectTargets.has(token)) {
        if (hasOtherActivityEffects) {
          let selectedEffects = otherActivityEffects;
          if (!this.forceApplyEffects) {
            selectedEffects = otherActivityEffects.filter(ef =>
              this.otherActivationMatches?.has(token) && this.otherEffectTargets?.has(token) && (
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
    let selfEffects: ActiveEffect.Implementation[] = [];
    if (this.effectTargets?.size > 0) selfEffects = activitySelfEffects;
    else selfEffects = activitySelfAllEffect;
    const selfToken = getOrCreateTokenForActor(this.actor);
    if (selfEffects.length > 0 && selfToken) {
      doEffectsData.origin = origin ?? this.activity.uuid ?? this.item.uuid;
      await globalThis.DAE.doActivityEffects(this.activity, true, [selfToken], selfEffects.map(ef => ef.uuid), doEffectsData)
    }

    let otherSelfEffects: ActiveEffect.Implementation[] = [];
    if (this.otherEffectTargets.size > 0) otherSelfEffects = otherActivitySelfAllEffects;
    else otherSelfEffects = otherActivitySelfEffects;
    if (otherSelfEffects.length > 0 && selfToken) {
      doEffectsData.origin = this.otherActivity!.item.uuid;
      await globalThis.DAE.doActivityEffects(this.otherActivity, true, [selfToken], otherSelfEffects.map(ef => ef.uuid), doEffectsData)
    }

    if (this.actor && ceSelfEffect && (this.effectTargets?.size > 0 || ceEffect!.flags?.dae?.selfTargetAlways)) {
      if (["both", "cepri"].includes(useCE) || (useCE === "itempri" && !selfEffects.length)) {
        const actorHasEffect = this.actor.effects.find(ef => ef.name === this.activity.name);
        if (this.activity.midiProperties?.toggleEffect && actorHasEffect) {
          CEToggleEffect({ effectName: this.activity.name, uuid: this.actor.uuid, origin });
        } else {
          // Check stacking status
          if ((ceEffect!.flags?.dae?.stackable ?? "none") === "none" && await CEHasEffectApplied({ effectName: this.activity.name, uuid: this.actor.uuid })) {
            await CERemoveEffect({ effectName: this.activity.name, uuid: this.actor.uuid, origin });
          }
          const effectData: ActiveEffect.CreateData = foundry.utils.mergeObject(ceEffect!.toObject(), metaData);
          effectData.origin = origin;
          const concentrationUuid = this.actor.effects.get(this.chatCard?.getFlag("dnd5e", "use.concentrationId") ?? "")?.uuid;
          if (concentrationUuid) {
            foundry.utils.setProperty(effectData, "flags.dnd5e.dependentOn", concentrationUuid);
          }
          const effects = await CEAddEffectWith({ effectData, effectName: this.activity.name, uuid: this.actor.uuid, origin, overlay: false });
        }
      }
    }
    return this.WorkflowState_RollFinished;
  }
  async WorkflowState_Cleanup(context: WorkflowContext = {}): Promise<WorkflowState> {
    const blfxActive = game.modules.get("boss-loot-assets-premium")?.active ||
      game.modules.get("boss-loot-assets-free")?.active;
    const AAActive = game.modules.get("autoanimations")?.active;
    const elapsedTimeRequired = 5000;
    if (configSettings.autoRemoveInstantaneousTemplate && this.templateUuids.length > 0 && this.activity.duration?.units === "inst") {
      for (const tUuid of this.templateUuids) {
        if (!blfxActive) {
          const elapsed = Date.now() - (this.workflowStartTime ?? 0);
          // if auto animations is active we need to allow enough time for it to have grabbed the template data before deleting it.
          let timeout = AAActive ? Math.max(elapsedTimeRequired - elapsed, 1) : 1;
          timeout = Math.max(elapsedTimeRequired, timeout);
          setTimeout(() => {
            (fromUuidSync(tUuid) as MeasuredTemplateDocument | null)?.delete()
          }, timeout);
        } else {
          setTimeout(() => {
            (fromUuidSync(tUuid) as MeasuredTemplateDocument | null)?.delete()
          }, elapsedTimeRequired);
          log("Not auto removing instantaneous template because boss loot assets active")
        }
      }
    }
    if (this.postSummonHookId) Hooks.off("dnd5e.postSummon", this.postSummonHookId);
    if (this.activity.target?.affects.type !== "" || this.targets.size !== 0) {
      // moved inside RollFinished if (configSettings.autoItemEffects === "applyRemove") await this.removeEffectsButton();
    }

    // Restore user targets if this was a self-target workflow
    if (this.selfTargeted) popTargetSave();

    return this.WorkflowState_Completed;
  }

  async WorkflowState_Completed(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (this.itemCardUuid && this.chatCard) {
      if (this.damageList && saveToChatCard && this.itemCardUuid) {
        const damageListData = prepareDamageListToJSON(this.damageList);
        // @ts-expect-error deleting something that is "required" in other contexts
        damageListData.forEach((di => delete di.damageDetails))
        addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.damageList]: damageListData }, "midi-qol");
      }
      await Workflow.removeItemCardButtons(this.itemCardUuid, { removeAllButtons: getRemoveAllButtons(this.activity), removeAttackButtons: getRemoveAttackButtons(this.activity), removeDamageButtons: getRemoveDamageButtons(this.activity), removeDnD5eButtons: getRemoveAllButtons(this.activity) && configSettings.autoCheckSaves !== "none", removeDnd5eSaveButtons: configSettings.autoCheckSaves !== "none" });
    }
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    if (context.damageRoll) return this.WorkflowState_ConfirmRoll;
    if (debugEnabled > 0) warn("Workflow complete ", this.id, "elapsed time", Date.now() - (this.workflowStartTime ?? 0));
    warn("Workflow complete ", this.id, "elapsed time", Date.now() - (this.workflowStartTime ?? 0));

    let shouldTrigger = false;
    if (this.activity.midiProperties?.triggeredActivityId && !this.aborted) {
      let activity = this.activity
      shouldTrigger = true;
      let possibleTriggerActivity = await this.activity.getTriggeredActivity();
      const visitedActivities = new Set([activity.uuid]);
      while (possibleTriggerActivity) {
        if (visitedActivities.has(possibleTriggerActivity.uuid)) {
          ui.notifications?.error((`midi-qol | loop detected in triggered activities for ${this.actor.name} ${this.item.name} ${this.activity.name} - execution aborted`))
          shouldTrigger = false;
          break;
        }
        visitedActivities.add(possibleTriggerActivity.uuid);
        possibleTriggerActivity = await possibleTriggerActivity.getTriggeredActivity();
      }

      let triggeredActivity = await this.activity.getTriggeredActivity();
      if (shouldTrigger && triggeredActivity) {
        if (shouldTrigger) {
          let usage: { midiOptions: MidiOptions } = { midiOptions: {} };
          usage.midiOptions.event = this.rollOptions.event;
          /*
           * Inherit the triggering workflow's options, but not targetConfirmation. That one
           * describes how a particular invocation was made, not the workflow: AttackActivity sets
           * it to "never" for each iteration of the roll-attack-per-target loop, because the loop
           * already knows its target. Passing it on suppressed confirmation for the triggered
           * activity too, overriding that activity's own confirmTargets setting.
           *
           * rollAttackPerTarget leaks the same way and from the same loop: it says this attack is
           * being rolled once per target, which has no bearing on the activity it triggers.
           */
          const {
            targetConfirmation: _triggeringTargetConfirmation,
            rollAttackPerTarget: _triggeringRollAttackPerTarget,
            ...inheritedWorkflowOptions
          } = this.workflowOptions ?? {};
          usage.midiOptions.workflowOptions = inheritedWorkflowOptions;
          usage.midiOptions.rollOptions = this.rollOptions;
          usage.midiOptions.isTriggered = true;
          let targetUuids: string[] = [];
          const toUuids = (targets: Set<TokenOrDocument>): string[] => {
            return Array.from(targets ?? new Set()).map(t => (t instanceof TokenDocument ? t : t.document).uuid)
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
          if (!usage.midiOptions.rollAs?.isOwner) usage.midiOptions.checkGMstatus = true;
          if (this.activity.midiProperties?.triggeredActivityTargets)
            switch (this.activity.midiProperties.triggeredActivityTargets) {
              case "self": targetUuids = [this.tokenUuid ?? ""]; break;
              case "hitTargets": targetUuids = toUuids(this.hitTargets); break;
              case "missedTargets": targetUuids = toUuids(this.targets.difference(this.hitTargets)); break;
              case "failedSaves": targetUuids = toUuids(this.failedSaves); break;
              case "saveTargets": targetUuids = toUuids(this.saves); break;
              case "targets": targetUuids = toUuids(this.targets); break;
              case "retarget":
              default:
                // targetUuids = [];
                break;
            }
          usage.midiOptions.targetUuids = targetUuids;
          usage.midiOptions.triggeredActivity = true;
          if (this.activity.midiProperties.triggeredActivityTargets !== "retarget" && targetUuids?.length === 0)
            shouldTrigger = false;
          if (this.activity.midiProperties?.triggeredActivityConditionText && shouldTrigger) {
            const target = await fromUuid(targetUuids[0]) as TokenDocument.Implementation | undefined;;
            const condition = this.activity.midiProperties?.triggeredActivityConditionText;
            const conditionData = createConditionData({ workflow: this, activity: this.activity, item: this.item, target });
            shouldTrigger = await evalCondition(condition, conditionData, { async: true, errorReturn: false });
          }
          if (shouldTrigger) {
            foundry.utils.setProperty(usage, "midiOptions.isCritical", this.isCritical);
            foundry.utils.setProperty(usage, "midiOptions.workflowOptions.triggeringWorkflowId", this.id);
            foundry.utils.setProperty(usage, "midiOptions.workflowOptions.triggeringActivityUuid", this.activity.uuid);
            const triggerConsume = this.activity.midiProperties?.triggeredActivityConsume ?? true;
            const triggerConfigure = this.activity.midiProperties?.triggeredActivityConfigure ?? true;
            if (!triggerConsume) foundry.utils.setProperty(usage, "consume", { resources: false, spellSlot: false, action: false });
            await completeActivityUse(triggeredActivity, usage, { configure: triggerConfigure }, {});
          }
        }
      }
    }
    return this.WorkflowState_Suspend;

  }

  /**
   * Hand back whatever dnd5e consumed for this use.
   *
   * Aborting deletes the activity card, and the card is where dnd5e keeps the consumption deltas
   * and its own "Refund Resource" button - so an abort that happens before the roll has to refund
   * itself or the slot/uses are lost with no way to recover them. postChatCardChecks already does
   * this for the checks it runs; the checks deferred to WorkflowState_AoETargetConfirmation (which
   * is where a scaled target count such as Banishment's is first known) did not.
   *
   * Idempotent: a workflow can reach more than one abort path.
   */
  async refundConsumption(): Promise<void> {
    if (this.#consumptionRefunded) return;
    const consumed = getConsumptionData(this.chatCard);
    if (!consumed || foundry.utils.isEmpty(consumed)) return;
    this.#consumptionRefunded = true;
    try {
      await this.activity?.refund(consumed);
    } catch (err) {
      const message = `${this.workflowName} could not refund consumption`;
      error(message, err);
      TroubleShooter.recordError(err, message);
    }
  }

  /**
   * Start the concentration that MidiActivityMixin deferred, now the checks have passed.
   *
   * Mirrors what Activity#use does: begin, record the effect id on the card (midi and dnd5e both
   * read system.concentration from there), then end the previous concentration if the actor was
   * at its limit - in that order, so a cast that never happens costs the caster nothing.
   */
  async beginDeferredConcentration(): Promise<void> {
    const deferred = this.deferredConcentration;
    if (!deferred) return;
    this.deferredConcentration = undefined;
    try {
      // @ts-expect-error no dnd5e-types
      const effect = await this.actor.beginConcentrating(this.activity, { "flags.dnd5e.scaling": deferred.scaling });
      if (!effect) return;
      // @ts-expect-error no dnd5e-types
      if (this.chatCard) await this.chatCard.update({ "system.concentration": effect.id });
      // Templates placed by this use could not be linked while the effect did not exist yet.
      for (const templateUuid of this.templateUuids) {
        const templateDocument = await fromUuid(templateUuid) as MeasuredTemplateDocument | undefined;
        if (templateDocument) await templateDocument.setFlag("dnd5e", "dependentOn", effect.uuid);
      }
      if (deferred.end) {
        // @ts-expect-error no dnd5e-types
        await this.actor.endConcentration(deferred.end);
      }
    } catch (err) {
      const message = `${this.workflowName} could not begin deferred concentration`;
      error(message, err);
      TroubleShooter.recordError(err, message);
    }
  }

  async WorkflowState_Abort(context: WorkflowContext = {}): Promise<WorkflowState> {
    this.aborted = true;
    if (this.postSummonHookId) Hooks.off("dnd5e.postSummon", this.postSummonHookId);
    if (!this.keepActivityCard && this.itemCardUuid && fromUuidSync(this.itemCardUuid)) {
      await this.chatCard.delete();
      clearUpdatesCache(this.itemCardUuid);
    }

    for (const tUuid of this.templateUuids) {
      const templateToDelete = await fromUuid(tUuid) as MeasuredTemplateDocument | undefined;
      if (templateToDelete) await templateToDelete.delete();
    }
    return this.WorkflowState_Cleanup;
  }

  async WorkflowState_Cancel(context: WorkflowContext = {}): Promise<WorkflowState> {
    // cancel will undo the workflow if it exists
    if (configSettings.undoWorkflow) await unTimedExecuteAsGM("undoTillWorkflow", this.uuid, true, true);
    return this.WorkflowState_Abort
  }

  async WorkflowState_RollFinished(context: WorkflowContext = {}): Promise<WorkflowState> {
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
    let chatMessage = this.chatCard;
    let selfTarget = this.token ?? getOrCreateTokenForActor(this.actor);
    if (this.needsHitTargetsDisplayed && this.targets?.size > 0 && chatMessage && (this.activity.effects?.length || this.otherActivity?.effects?.length)) {
      this.hitDisplayData = {};
      // Always show all targets in the display, not just effectTargets (failed saves)
      const theTargets = this.targets;
      for (let targetToken of theTargets) {
        if (!targetToken.actor) continue;
        const targetTokenUuid = targetToken.actor?.uuid;
        if (!targetTokenUuid) continue;
        let img: string | null | undefined = targetToken.document?.texture.src ?? targetToken.actor.img;
        // @ts-expect-error no dnd5e-types
        if (configSettings.usePlayerPortrait && targetToken.actor.type === "character") {
          img = targetToken.actor.img ?? targetToken.document?.texture.src;
        }
        if (foundry.helpers.media.VideoHelper.hasVideoExtension(img ?? "")) {
          img = await game.video?.createThumbnail(img ?? "", { width: 100, height: 100 });
        }
        this.hitDisplayData[targetTokenUuid] = {
          targetClass: targetToken.actor.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-nonplayer-target",
          target: targetToken,
          hitClass: "success",
          acClass: "",
          img: img ?? "",
          gmName: getTokenName(targetToken),
          playerName: getTokenPlayerName(targetToken) ?? "",
          uuid: targetToken.document.uuid,
          showAC: false,
          isHit: true
        };
      }
      await this.displayHits(chatMessage.whisper.length > 0, true);
      chatMessage = this.chatCard
    }
    let content = chatMessage?.content;
    let contentChanged = false;
    // TODO move this to call the omnibus remove buttons function
    if (content && getRemoveAttackButtons(this.activity) && chatMessage && configSettings.confirmAttackDamage === "none") {
      // Match rollAttack button from activity-card.hbs
      let searchRe = /<button[^>]*?data-action="rollAttack"[\s\S]*?<\/button>/;
      content = content.replace(searchRe, "");
      contentChanged = true;
    }
    // Once the roll is finished and all templates placed, remove the template button
    if (content) {
      let isEmanationTargeting = activityHasAutoPlaceTemplate(this.activity) || activityHasEmanationNoTemplate(this.activity);
      let isAoETargeting = !isEmanationTargeting && activityHasAreaTarget(this.activity);
      if (isAoETargeting && !isEmanationTargeting && this.placedTemplateCount >= (Number(this.activity?.target?.template?.count) || 1)) {
        const searchRe = /<button[^>]*?data-action="placeTemplate"[\s\S]*?<\/button>/;
        content = content.replace(searchRe, "");
        contentChanged = true;
      }
    }
    if (this.activity.target?.affects.type !== "" || this.targets.size !== 0) {
      if (configSettings.autoItemEffects === "applyRemove" && content) {
        const buttonRe = /<button[^>]*?data-action="midiApplyEffects"[\s\S]*?<\/button>/;
        content = content?.replace(buttonRe, "");
        contentChanged = true;
      }
    }
    if (contentChanged) {
      const update: ChatMessage.UpdateData = {
        "content": content,
        flags: { "midi-qol": { type: MESSAGE_TYPES.ITEM } },
      };
      await this.performThrottledUpdate(chatMessage, update);
    }
    // Template cleanup is now handled by setupTemplateCleanup in unSuspend

    if (configSettings.autoRemoveSummonedCreature && this.summonedCreatures && this.summonedCreatures.length > 0) {
      let origin = getConcentrationEffect(this.actor, this.item);
      if (origin) {
        for (let sc of this.summonedCreatures) {
          //@ts-expect-error
          sc.setFlag("dnd5e", "dependentOn", origin.uuid);
        }
      } else {
        // need to create an effect to remove the summoned creatures
        const activityDuration = this.activity.duration;
        let effectData: ActiveEffect.CreateData;
        const summonString = i18n("DND5E.ActionSumm") + ": ";
        let effect = this.item.actor?.effects.find(ef => ef.name === (summonString + this.item.name));
        if (effect) { // effect already applied
          for (let sc of this.summonedCreatures) {
            //@ts-expect-error
            sc.setFlag("dnd5e", "dependentOn", effect.uuid);
          }
        } else { // add an effect which will cause the summoned creature to be deleted
          effectData = {
            origin: this.item.uuid, //flag the effect as associated to the spell being cast
            disabled: false,
            img: this.item.img,
            name: summonString + this.item.name,
            duration: {},
            flags: {
              dae: {
                stackable: "noneName"
              },
            },
          }
          const inCombat = !!(game.combat?.turns.some(combatant => combatant.token?.id === selfTarget?.id));
          const converted = convertDuration(activityDuration, inCombat);
          if (converted.type === "none" || activityDuration?.units === "inst") {
            // Permanent/special duration - no expiry. dnd5e summons are often instantaneous (e.g. find familiar)
            // @ts-expect-error fvtt-types v14 duration
            effectData.start = { time: game.time?.worldTime ?? 0, round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
          } else if (converted.type === "seconds") {
            // @ts-expect-error fvtt-types v14 duration
            effectData.duration = { value: Math.max(converted.seconds ?? 1, 1), units: "seconds" };
            // @ts-expect-error fvtt-types v14 duration
            effectData.start = { time: game.time?.worldTime ?? 0 };
          } else if (converted.type === "turns") {
            if ((converted.rounds ?? 0) > 0) {
              // @ts-expect-error fvtt-types v14 duration
              effectData.duration = { value: converted.rounds, units: "rounds" };
            } else {
              // @ts-expect-error fvtt-types v14 duration
              effectData.duration = { value: Math.max(converted.turns ?? 1, 1), units: "turns" };
            }
            // @ts-expect-error fvtt-types v14 duration
            effectData.start = { round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
          }
          const effects = await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
          if (effects.length > 0) {
            for (let sc of this.summonedCreatures) {
              //@ts-expect-error
              sc.setFlag("dnd5e", "dependentOn", effects[0].uuid);
            }
          }
        }
      }
    }

    if (configSettings.autoUndoTransformations && this.transformedActorUuids && this.transformedActorUuids.length > 0) {
      let origin = getConcentrationEffect(this.actor, this.item);
      if (origin) {
        await origin.setFlag("midi-qol", "transformedActorUuids", this.transformedActorUuids);
        // Also set the flag on the polymorphed actors' concentration effects,
        // since the player controls the polymorphed form and concentration breaks there
        if (this.transformedActors) {
          for (const polyActor of this.transformedActors) {
            const polyConcentration = getConcentrationEffect(polyActor, this.item);
            if (polyConcentration) {
              await polyConcentration.setFlag("midi-qol", "transformedActorUuids", this.transformedActorUuids);
            }
          }
        }
      } else {
        // need to create an effect to remove the summoned creatures
        const activityDuration = this.activity.duration;
        let effectData: ActiveEffect.CreateData;
        const transformString = i18n("DND5E.TRANSFORM.Action.Transform") + ": ";
        let effect = this.item.actor?.effects.find(ef => ef.name === (transformString + this.item.name));
        if (effect) {
          const transformedUuids = effect.getFlag("midi-qol", "transformedActorUuids") ?? [];
          await effect.setFlag("midi-qol", "transformedActorUuids", [...transformedUuids, ...this.transformedActorUuids]);
        } else { // add an effect which will cause the summoned creature to be deleted
          effectData = {
            origin: this.item.uuid, //flag the effect as associated to the spell being cast
            disabled: false,
            img: this.item.img,
            name: transformString + this.item.name,
            duration: {},
            flags: {
              dae: {
                stackable: "noneName"
              },
              "midi-qol": { transformedActorUuids: this.transformedActorUuids }
            },
          }
          const inCombat = !!(game.combat?.turns.some(combatant => combatant.token?.id === selfTarget?.id));
          if (activityDuration?.units === "inst") {
            // This seems wrong, however lots of dnd5e summons activities have a duration of inst - e.g. find familiar
            // @ts-expect-error fvtt-types v14 duration
            effectData.start = { time: game.time?.worldTime ?? 0, round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
            //@ts-expect-error CONFIG.DND5E
          } else if (CONFIG.DND5E.permanentTimePeriods[activityDuration.units]) {
            // @ts-expect-error fvtt-types v14 duration
            effectData.start = { time: game.time?.worldTime ?? 0, round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
          } else {
            const convertedDuration = convertDuration(activityDuration, inCombat);
            if (convertedDuration.type === "seconds") {
              // @ts-expect-error fvtt-types v14 duration
              effectData.duration = { value: Math.max(convertedDuration.seconds ?? 1, 1), units: "seconds" };
              // @ts-expect-error fvtt-types v14 duration
              effectData.start = { time: game.time?.worldTime ?? 0 };
            } else if (convertedDuration.type === "turns") {
              if ((convertedDuration.rounds ?? 0) > 0) {
                // @ts-expect-error fvtt-types v14 duration
                effectData.duration = { value: convertedDuration.rounds, units: "rounds" };
              } else {
                // @ts-expect-error fvtt-types v14 duration
                effectData.duration = { value: Math.max(convertedDuration.turns ?? 1, 1), units: "turns" };
              }
              // @ts-expect-error fvtt-types v14 duration
              effectData.start = { round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
            }
          }
          await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }
      }
    }

    await this.callMidiHooks("midi-qol.postActiveEffects");
    // Call onUseMacro if not already called
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
    }
    if (this.aborted) return this.WorkflowState_Abort;  // TODO This is wrong

    await this.callMidiHooks("midi-qol.RollComplete");
    if (this.aborted) return this.WorkflowState_Abort;  // TODO This is wrong
    if (autoRemoveTargets !== "none") setTimeout(untargetDeadTokens, 500); // delay to let the updates finish
    const inCombat = this.actor && isInCombat(this.actor);
    let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id)
    const isTurn = activeCombatants?.includes(this.token?.id);
    if (inCombat && isTurn && this.activity.activation?.type === "action" && !this.AoO) {
      await setActionUsed(this.actor);
    }
    return this.WorkflowState_Cleanup;
  }
  async WorkflowState_Default(context: WorkflowContext = {}): Promise<WorkflowState> { return this.WorkflowState_Suspend };

  initSaveResults() {
    this.saves = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
    this.failedSaves = this.activity.hasAttack ? new Set(this.hitTargets) : new Set(this.targets);
    this.advantageSaves = new Set();
    this.disadvantageSaves = new Set();
    this.saveDisplayData = [];
    this.saveResults = [];
  };

  public async checkAttackAdvantage() {
    // Reset tracker so it can be safely re-called (e.g. after preAttackRoll hooks modify flags)
    this.attackRollModifierTracker.reset();

    // Add workflowOptions and rollOptions attribution first (before flag-based checks)
    if (this.workflowOptions?.advantage) {
      this.attackRollModifierTracker.advantage.add("workflowOptions", i18n("midi-qol.WorkflowOptions"));
    }
    if (this.workflowOptions?.disadvantage) {
      this.attackRollModifierTracker.disadvantage.add("workflowOptions", i18n("midi-qol.WorkflowOptions"));
    }
    // Long range disadvantage (set in WorkflowState_ValidateRoll)
    if (this.longRangeAttack) {
      this.attackRollModifierTracker.disadvantage.add('range', 'Long Range');
    }

    await this.checkFlankingAdvantage();
    if (this.flankingAdvantage) this.attackRollModifierTracker.advantage.add('flanking', i18n("midi-qol.Flanking"));

    // This should never happen
    if (!this.actor) return;

    const actType = this.activity.actionType || "none";
    const firstTarget = this.targets.first();

    // Determine ability for weapon attacks (mwak/rwak use str/dex)
    let attackAbility: string | undefined;
    if (["mwak", "rwak"].includes(actType)) {
      // @ts-expect-error no dnd5e-types
      attackAbility = this.item?.abilityMod ?? "";
      // @ts-expect-error no dnd5e-types
      if (!attackAbility) attackAbility = this.activity.item?.system.properties?.has("fin") ? "dex" : "str";
    }

    // Use computeAttackAdvantage for flag-based checks (actor flags + target grants)
    await computeAttackAdvantage(
      this.actor,
      actType,
      { workflow: this, item: this.item },
      attackAbility,
      this.attackRollModifierTracker
    );

    let conditionData;
    // TODO Hidden should check the target to see if they notice them?
    if (checkRule("invisAdvantage") && checkRule("invisAdvantage") !== "none" && firstTarget) {
      // if we are using a proxy token to attack use that for hidden invisible
      const invisibleToken = this.token ? hasCondition(this.token.actor as Actor, "invisible") : false;
      const invisibleTarget = hasCondition(firstTarget.actor as Actor, "invisible");

      // RAW 2014: Invisible condition explicitly grants adv/disadv; canSense used for non-invisible "unseen" cases
      // RAW 2024: Only "can you see the creature?" matters (blindsight/truesight = can see; tremorsense = cannot see)
      const isRAW2014 = checkRule("invisAdvantage") === "RAW2014";
      const tokenCanPerceive = isRAW2014 ? this.tokenCanSense?.has(firstTarget) : this.tokenCanSee?.has(firstTarget);
      const targetCanPerceive = isRAW2014
        ? (this.token && this.targetsCanSense?.has(this.token))
        : (this.token && this.targetsCanSee?.has(this.token));

      const invisAdvantage = isRAW2014 ? invisibleToken || !targetCanPerceive : !targetCanPerceive;
      if (invisAdvantage) {
        if (!targetCanPerceive) {
          this.attackRollModifierTracker.advantage.add('Attacker not detected', 'Attacker not detected');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.invisible", { value: true, effects: ["Attacker not detected"] });
        }

        if (invisibleToken && isRAW2014) {
          this.attackRollModifierTracker.advantage.add('Attacker invisible', 'Attacker invisible');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.invisible", { value: true, effects: ["Invisible Attacker"] });
        }
      }

      const invisDisadvantage = isRAW2014 ? invisibleTarget || !tokenCanPerceive : !tokenCanPerceive;
      if (invisDisadvantage) {
        // Attacker can't see target so disadvantage
        log(`Disadvantage given to ${this.actor.name} due to invisible target`, invisibleTarget, tokenCanPerceive);
        if (invisibleTarget && isRAW2014) {
          this.attackRollModifierTracker.disadvantage.add('invisible foe', 'Invisible foe');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.invisible", { value: true, effects: ["Invisible Defender"] });
        }
        if (!tokenCanPerceive) {
          this.attackRollModifierTracker.disadvantage.add('Defender not detected', 'Defender not detected');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.invisible", { value: true, effects: ["Defender not detected"] });
        }
      }
    }

    // Check hidden
    if (checkRule("hiddenAdvantage") && checkRule("hiddenAdvantage") !== "none" && firstTarget) {
      if (checkRule("hiddenAdvantage") === "perceptive" && installedModules.get("perceptive")) {
        //@ts-expect-error .api
        const perceptiveApi = game.modules.get("perceptive")?.api;
        const tokenSpotted = await perceptiveApi?.isSpottedby(this.token, firstTarget, { LOS: false, Range: true, Effects: true, Hidden: false, canbeSpotted: true }) ?? true;
        const targetSpotted = await perceptiveApi?.isSpottedby(firstTarget, this.token, { LOS: false, Range: true, Effects: true, Hidden: false, canbeSpotted: true }) ?? true;
        if (!tokenSpotted) {
          this.attackRollModifierTracker.advantage.add('Attacker hidden', 'Attacker hidden');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.hidden", { value: true, effects: ["Hidden Attacker"] });
        }
        if (!targetSpotted) {
          this.attackRollModifierTracker.disadvantage.add('Hidden foe', 'Hidden foe');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.hidden", { value: true, effects: ["Hidden Defender"] });
        }
      }

      if (checkRule("hiddenAdvantage") === "effect") {
        const hiddenToken = this.token ? hasCondition(this.token.actor as Actor, "hidden") : false;
        const hiddenTarget = hasCondition(firstTarget.actor as Actor, "hidden");
        if (hiddenToken) {
          this.attackRollModifierTracker.advantage.add('Attacker hidden', 'Attacker hidden');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.hidden", { value: true, effects: ["Hidden Attacker"] });
        }
        if (hiddenTarget) {
          this.attackRollModifierTracker.disadvantage.add('Target hidden', 'Target hidden');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.hidden", { value: true, effects: ["Hidden Defender"] });
        }
      }
    }

    // Nearby foe gives disadvantage on ranged attacks
    if (checkRule("nearbyFoe")) {
      conditionData ??= createConditionData({ workflow: this, target: firstTarget, actor: this.actor });
      const ignoreNearbyFoes = await evalAllConditionsAsync(this.actor, midiFlag(`ignoreNearbyFoes`), conditionData);
      // @ts-expect-error no dnd5e-types
      if (!ignoreNearbyFoes && (["rwak", "rsak"].includes(actType) || (this.item.system.properties?.has("thr") && actType == "mwak"))) {
        let nearbyFoe: boolean = false;
        if (this.token) {
          if (actType !== "mwak") { // one of rwak/rsak
            nearbyFoe = checkNearby(-1, getToken(this.token), configSettings.optionalRules.nearbyFoe, { includeIncapacitated: false, canSee: true });
            // @ts-expect-error no dnd5e-types
          } else if (this.item.system.properties?.has("thr")) {
            // @ts-expect-error no dnd5e-types
            const meleeRange = this.item.system.range.reach ?? 5;
            if (getDistance(this.token, firstTarget, { wallsBlock: false }) <= meleeRange) nearbyFoe = false;
            else nearbyFoe = checkNearby(-1, getToken(this.token), configSettings.optionalRules.nearbyFoe, { includeIncapacitated: false, canSee: true });
          }
          if (nearbyFoe) {
            if (debugEnabled > 0) warn(`checkAttackAdvantage | Ranged attack by ${this.actor.name} at disadvantage due to nearby foe`);
            this.attackRollModifierTracker.disadvantage.add('nearbyFoe', 'Nearby foe');
            foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.nearbyFoe", { value: true, effects: ["Nearby Foe"] });
          }
        }
      }
    }

    // @ts-expect-error no dnd5e-types
    if (this.item.system.properties?.has("hvy")) {
      const failDisadvantageHeavy = this.actor.flags?.[MODULE_ID]?.fail?.disadvantage?.heavy;
      if (failDisadvantageHeavy) conditionData ??= createConditionData({ workflow: this, target: firstTarget, actor: this.actor });
      if (!failDisadvantageHeavy || !await evalAllConditionsAsync(this.actor, midiFlag(`fail.disadvantage.heavy`), conditionData)) {
        if (safeGetGameSetting("dnd5e", "rulesVersion") === "modern") {
          // @ts-expect-error no dnd5e-types
          if ((this.activity.actionType === "mwak" && this.actor.system.abilities?.str.value < 13) ||
            // @ts-expect-error no dnd5e-types
            (this.activity.actionType === "rwak" && this.actor.system.abilities?.dex.value < 13)) {
            this.attackRollModifierTracker.disadvantage.add('heavy weapon', 'Heavy weapon');
          }
        } else if (safeGetGameSetting("dnd5e", "rulesVersion") === "legacy") {
          // @ts-expect-error no dnd5e-types
          if (["tiny", "sm"].includes(this.actor.system.traits?.size)) {
            this.attackRollModifierTracker.disadvantage.add('small', 'Small creature');
          }
        }
      }
    }
    await this.checkTargetAdvantage();
  }

  async processCriticalFlags() {
    if (!this.actor) return; // in case a damage only workflow caused this.
    /*
    * Target grants flags for critical:
    * flags.midi-qol.grants.critical.all
    * flags.midi-qol.grants.critical.mwak/rwak/msak/rsak/other
    * flags.midi-qol.grants.critical.range
    * flags.midi-qol.grants.noCritical.all
    * flags.midi-qol.grants.noCritical.mwak/rwak/msak/rsak/other
    */
    const attackType = this.activity?.actionType;
    const trackerHadCritical = this.attackRollModifierTracker.critical.isForced;
    const trackerHadNoCritical = this.attackRollModifierTracker.critical.isSuppressed;

    // Check target grants.critical and grants.noCritical
    // For multiple targets: crit if ANY target grants crit, no crit if ALL targets grant noCrit
    if (this.hitTargets.size >= 1) {
      // grants.critical - check if ANY target has this flag
      for (const target of this.hitTargets) {
        if (!target?.actor) continue;
        const targetName = target?.name ?? target?.actor?.name ?? "";
        const grants = target?.actor?.flags[MODULE_ID]?.grants?.critical ?? {};
        const fails = target?.actor?.flags[MODULE_ID]?.fail?.critical ?? {};

        // Special case: grants.critical.range
        if (Number.isNumeric(grants.range) && getDistance(target, this.token, { wallsBlock: false }) <= Number(grants.range)) {
          this.attackRollModifierTracker.critical.force('grants.critical.range', `${getFlagDisplayName('grants.critical.range')} (${targetName})`);
        }

        if (grants || fails) {
          const conditionData = createConditionData({ workflow: this, target, actor: this.actor });

          // Check grants.critical.all and grants.critical.{attackType}
          if (await evalAllConditionsAsync(target.actor, midiFlag(`grants.critical.all`), conditionData)) {
            this.attackRollModifierTracker.critical.force('grants.critical.all', `${getFlagDisplayName('grants.critical.all')} (${targetName})`);
          }
          if (attackType && await evalAllConditionsAsync(target.actor, midiFlag(`grants.critical.${attackType}`), conditionData)) {
            this.attackRollModifierTracker.critical.force(`grants.critical.${attackType}`, `${getFlagDisplayName(`grants.critical.${attackType}`)} (${targetName})`);
          }

          // Deprecated fail.critical flags
          if (await evalAllConditionsAsync(target.actor, midiFlag(`fail.critical.all`), conditionData)
            || (attackType && await evalAllConditionsAsync(target.actor, midiFlag(`fail.critical.${attackType}`), conditionData))) {
            console.warn(`midi-qol | processCriticalFlags | ${target.actor.name} flags.${MODULE_ID}.fail.critical is deprecated use flags.${MODULE_ID}.grants.noCritical.all/.attackType instead`);
            this.attackRollModifierTracker.critical.suppress('fail.critical', `${getFlagDisplayName('fail.critical')} (${targetName})`);
          }
        }
        if (this.attackRollModifierTracker.critical.isForced) break; // Found a target that grants crit, no need to check more
      }

      // grants.noCritical - check if ALL targets have this flag
      let allTargetsGrantNoCrit = true;
      const noCritTargets: string[] = [];
      let noCritFlag = "grants.noCritical.all";
      for (const target of this.hitTargets) {
        if (!target?.actor) {
          allTargetsGrantNoCrit = false;
          break;
        }
        const targetName = target?.name ?? target?.actor?.name ?? "";
        const conditionData = createConditionData({ workflow: this, target, actor: this.actor });
        const hasNoCritAll = await evalAllConditionsAsync(target.actor, midiFlag(`grants.noCritical.all`), conditionData);
        const hasNoCritType = attackType && await evalAllConditionsAsync(target.actor, midiFlag(`grants.noCritical.${attackType}`), conditionData);
        if (!hasNoCritAll && !hasNoCritType) {
          allTargetsGrantNoCrit = false;
          break;
        }
        if (hasNoCritType) noCritFlag = `grants.noCritical.${attackType}`;
        noCritTargets.push(targetName);
      }
      if (allTargetsGrantNoCrit && this.hitTargets.size > 0) {
        this.attackRollModifierTracker.critical.suppress(noCritFlag, `${getFlagDisplayName(noCritFlag)} (${noCritTargets.join(", ")})`);
      }
    }

    // Tracker computes isCritical from all sources (grants.critical added above)
    // Persist to chat card if state changed
    this.persistFields({ isCritical: this.isCritical });

    // Update roll with attribution and regenerate HTML if crit/noCrit flags changed
    const criticalChanged = this.attackRollModifierTracker.critical.isForced !== trackerHadCritical;
    const noCriticalChanged = this.attackRollModifierTracker.critical.isSuppressed !== trackerHadNoCritical;
    if (this.attackRoll && (criticalChanged || noCriticalChanged)) {
      addAttribution(this.attackRoll, this.attackAttribution);
      this.attackRollHTML = await midiRenderAttackRoll(this.attackRoll);
    }
  }

  async checkFlankingAdvantage(): Promise<boolean> {
    if (!canvas) {
      console.warn("midi-qol | checkFlankingAdvantage | abandoned - no canvas defined")
      return false;
    }
    this.flankingAdvantage = false;
    if (this.item && !(["mwak", "msak"].includes(this.activity.actionType ?? ""))) return false;

    const token = (fromUuidSync(this.tokenUuid) as TokenDocument)?.object;
    const target = this.targets.first();
    const flankingMode = checkRule("checkFlanking") as string;
    const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
    const flankingBonusSetting = configSettings.optionalRules.flankingBonus ?? "advantage";

    // Flanked modes: markFlanking applies the flanked status to the target.
    if (isFlankedMode) {
      if (flankingBonusSetting === "advantage") {
        // Advantage mode: flanked status grants advantage via getFlankedStatusChanges
        await markFlanking(token, target);
      }
      // Numeric mode: flanked status is visual-only; bonus computed in recordFlankingBonuses
      return false;
    }

    // Flanking modes (advonly, ceonly, midiFlanking) from here.
    if (flankingBonusSetting === "advantage") {
      // markFlanking checks first target and applies attacker status for ceonly/midiFlanking
      const needsFlanking = await markFlanking(token, target);
      if (needsFlanking && this.actor) {
        foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.flanking", { value: true, effects: ["Flanking"] });
      }
      if (flankingMode === "advonly") {
        this.flankingAdvantage = needsFlanking;
      }
      return needsFlanking;
    }

    // Numeric bonus: nothing to do here — per-target flanking bonus
    // is computed and recorded on target descriptors in recordFlankingBonuses(),
    // which runs after target descriptors are captured (in WorkflowState_AttackRollComplete).
    return false;
  }

  async recordFlankingBonuses(): Promise<void> {
    // Flanking only applies to melee attacks
    if (!(["mwak", "msak"].includes(this.activity?.actionType ?? ""))) return;
    const flankingBonusSetting = configSettings.optionalRules.flankingBonus ?? "advantage";
    if (flankingBonusSetting === "advantage") return;
    const bonusValue = Number(flankingBonusSetting) || 0;
    if (!bonusValue) return;
    const flankingMode = checkRule("checkFlanking") as string;
    const isFlankingMode = ["advonly", "ceonly", "midiFlanking"].includes(flankingMode);
    const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
    if (!isFlankingMode && !isFlankedMode) return;
    if (isFlankingMode && !this.token) return;

    const allDescriptors = this.targetDescriptors;
    if (!allDescriptors) return;
    let modified = false;
    for (const t of this.targets) {
      const hasBonus = isFlankingMode
        ? await computeFlankingStatus(this.token!, t)
        : await computeFlankedStatus(t);
      if (hasBonus) {
        const targetDescriptor = getTargetDescriptor(t.actor?.uuid ?? "", allDescriptors) as CombinedTargetDescriptor | undefined;
        if (targetDescriptor) {
          targetDescriptor.flankingBonus = bonusValue;
          modified = true;
        }
      }
    }
    if (modified) {
      this.targetDescriptors = allDescriptors; // trigger setter to persist
    }
  }

  async checkTargetAdvantage() {
    // Note: Target grants flags and actor noAdvantage/noDisadvantage flags
    // are now handled by computeAttackAdvantage in checkAttackAdvantage()
    // This method only handles special rules that require game logic

    if (!this.item) return;
    if (!this.targets?.size) return;
    const actionType = this.activity.actionType ?? "";
    const firstTargetDocument = getTokenDocument(this.targets.first());
    const firstTarget = getToken(firstTargetDocument);
    if (!firstTargetDocument || !firstTarget) return;

    // Check nearby ally disadvantage for ranged attacks
    if ((checkRule("nearbyAllyRanged") as number) > 0 && ["rwak", "rsak"].includes(actionType)) {
      if ((firstTargetDocument.width ?? 1) * (firstTargetDocument.height ?? 1) < Number(checkRule("nearbyAllyRanged"))) {
        const nearbyAlly = checkNearby(-1, firstTarget, (canvas.dimensions?.distance ?? 5)); // targets near a friend that is not too big
        // TODO include thrown weapons in check
        if (nearbyAlly) {
          if (debugEnabled > 0) warn("checkTargetAdvantage | ranged attack with disadvantage because target is near a friend");
          this.attackRollModifierTracker.disadvantage.add('nearbyAlly', 'Nearby Ally');
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.disadvantage.attack.nearbyAlly", { value: true, effects: ["Nearby Ally"] });
        }
      }
    }
  }

  async triggerTargetMacros(triggerList: string[], targets: Set<Token.Implementation> = this.targets, options: { saved?: boolean } = {}) {
    let results: Record<string, unknown[]> = {};
    for (let target of targets) {
      results[target.document.uuid] = [];
      let result = results[target.document.uuid];
      const actorOnUseMacros = target.actor?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
      const wasAttacked = !!this.activity.attack;
      const wasHit = (this.activity ? wasAttacked : true) && (this.hitTargets?.has(target) || this.hitTargetsEC?.has(target));
      const wasMissed = (this.activity ? wasAttacked : true) && !this.hitTargets?.has(target) && !this.hitTargetsEC?.has(target);
      const wasDamaged = this.damageList
        && (this.hitTargets.has(target) || this.hitTargetsEC.has(target))
        && (this.damageList.some(dl => dl.targetUuid === target.document.uuid && (dl.hpDamage > 0 || dl.tempDamage > 0)));

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
      // 13.0.39 isDamaged Hook is always called inside processDamageRoll, so don't do it here
      // If auto applying damage can do a better test when damage application has been calculdated
      // if (wasDamaged && triggerList.includes("isDamaged") && !configSettings.autoApplyDamage.toLocaleLowerCase().includes("yes")) {
      //  result.push(...await this.callMacros(this.item,
      //    actorOnUseMacros?.getMacros("isDamaged"),
      //    "TargetOnUse",
      //    "isDamaged",
      //    { actor: target.actor, token: target })
      //  );
      // }
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

  async callMidiHooks(...hookNames: string[]): Promise<void> {
    for (const hookName of hookNames) {
      await asyncHooksCallAll(hookName, this);
      if (this.item) await asyncHooksCallAll(`${hookName}.${this.item.uuid}`, this);
      if (this.activity) await asyncHooksCallAll(`${hookName}.${this.activity.uuid}`, this);
    }
  }

  async callCancellableHooks(hookName: string): Promise<boolean> {
    if (await asyncHooksCall(hookName, this) === false) return false;
    if (this.item && await asyncHooksCall(`${hookName}.${this.item.uuid}`, this) === false) return false;
    if (this.activity && await asyncHooksCall(`${hookName}.${this.activity.uuid}`, this) === false) return false;
    if (await asyncHooksCall(`${hookName}.${this.id}`, this) === false) return false;
    const premadesHook = hookName.replace("midi-qol.", "midi-qol.premades.");
    if (await asyncHooksCall(premadesHook, this) === false) return false;
    if (this.item && await asyncHooksCall(`${premadesHook}.${this.item.uuid}`, this) === false) return false;
    if (this.activity && await asyncHooksCall(`${premadesHook}.${this.activity.uuid}`, this) === false) return false;
    if (await asyncHooksCall(`${premadesHook}.${this.id}`, this) === false) return false;
    return true;
  }

  async expireTargetEffects(expireList: string[]) {
    if (debugEnabled > 0) warn(`expireTargetEffects | ${expireList}`)
    for (let target of this.targets) {
      const expiryReason: string[] = [];
      const appliedEffects = getAppliedEffects(target.actor, { includeEnchantments: true });
      if (!appliedEffects) continue; // nothing to expire
      const expiredEffects: (string | null)[] = appliedEffects.filter(ef => {
        let wasExpired = false;
        const specialDuration = ef.flags?.dae?.specialDuration;
        if (!specialDuration) return false;
        const wasAttacked = this.activity.attack;
        //TODO this test will fail for damage only workflows - need to check the damage rolled instead
        const wasHit = (this.item ? wasAttacked : true) && (this.hitTargets?.has(target) || this.hitTargetsEC?.has(target));
        const wasDamaged = this.damageList
          // consider removing this - by having it here hand editing hp wont expire effects
          // but any damage application by an item will get picked up in applyTokenDamageMany
          // so this is only relevant if you are not auto applying damage
          && (this.hitTargets.has(target) || this.hitTargetsEC.has(target))
          && (this.damageList.find(dl => dl.targetUuid === target.document.uuid && dl.hpDamage > 0));
        const wasHealed = this.damageList && (this.damageList.find(dl => dl.targetUuid === target.document.uuid && dl.hpDamage < 0))
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
        if ((target.actor?.uuid !== this.actor.uuid && expireList.includes("1Reaction") && specialDuration.includes("1Reaction"))) {
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
        if (!this.activity) return wasExpired;
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
        const abl = this.activity.save?.ability ?? this.activity.check?.ability;
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
          actorUuid: target.actor?.uuid,
          effects: expiredEffects,
          options: { "expiry-reason": `midi-qol:${expiryReason}` }
        });
      }
    }
  }

  getDamageBonusMacros(): string | undefined {
    const actorMacros = this.actor.getFlag("dnd5e", "DamageBonusMacro");
    const itemMacros = this.onUseMacros?.getMacros("damageBonus")
    if (!itemMacros?.length) return actorMacros;
    if (!actorMacros?.length) return itemMacros;
    return `${actorMacros},${itemMacros}`;
  }

  async rollBonusDamage(damageBonusMacro: string, item: Item.Implementation | undefined = this.item): Promise<Roll[]> {
    const extraDamages = (await this.callMacros(item, damageBonusMacro, "DamageBonus", "DamageBonus"))?.deepFlatten();
    if (!extraDamages) return [];
    const rolls: Roll[] = [];
    try {
      for (let damageEntry of extraDamages) {
        if (!damageEntry || typeof damageEntry !== "object") continue;
        if (damageEntry instanceof Roll) {
          rolls.push(damageEntry);
        } else {
          let { damageRoll, damageType, flavor } = damageEntry as DamageBonusMacroSingleResult;
          if (!damageRoll) continue;
          damageType = getDamageType(damageType);
          if (!damageType && flavor && getDamageType(flavor)) damageType = getDamageType(flavor);
          // @ts-expect-error no dnd5e-types
          if (!damageType && this.damageRolls) damageType = this.damageRolls[0].options?.type;
          if (!damageType) damageType = MidiQOL.MQdefaultDamageType;
          const rollOptions = {
            type: damageType,
            flavor: flavor ?? damageType
          }
          // @ts-expect-error no dnd5e-types
          rolls.push(await new CONFIG.Dice.DamageRoll(damageRoll, item?.getRollData() ?? this.actor.getRollData(), rollOptions).evaluate());
        }
      }
    } catch (err) {
      const message = `midi-qol | rollBonusDamage | error in evaluating${extraDamages} in bonus damage`
      TroubleShooter.recordError(err, message);
      console.warn(message, err);
      return [];
    }
    return rolls;
  }

  // Run item-level + ammunition-level DamageBonus macros and store the combined rolls.
  // Ammunition macros run with the ammo item as their context so `rolledItem`/`macroItem`
  // resolve to the arrow rather than the bow.
  async rollAllBonusDamage(): Promise<void> {
    const rolls: (Roll | undefined)[] = [];
    const itemMacros = this.getDamageBonusMacros();
    if (itemMacros) rolls.push(...await this.rollBonusDamage(itemMacros));
    if (this.ammunition) {
      const ammoMacros = this.ammunitionOnUseMacros?.getMacros("damageBonus");
      if (ammoMacros?.length) rolls.push(...await this.rollBonusDamage(ammoMacros, this.ammunition));
    }
    // Filter undefined — a macro that throws bubbles up as `undefined` from callMacros' catch
    // wrapper and a future macro author may return undefined rolls directly.
    const validRolls = rolls.filter((r): r is Roll => r instanceof Roll);
    if (!validRolls.length) return;
    await this.setBonusDamageRolls(validRolls);
    if (this.workflowOptions?.damageRollDSN !== false) {
      await displayDSNForRoll(this.bonusDamageRolls!, "damageRoll");
    }
  }

  // TODO: Kill?
  // macroDataToObject(macroData: any): any {
  //   const data = macroData
  //   for (let documentsName of ["targets", "failedSaves", "criticalSaves", "fumbleSaves", "saves", "superSavers", "semiSuperSavers"]) {
  //     delete data[documentsName];
  //   }
  //   data.actorUuid = data.actor?.uuid;
  //   delete data.actor;
  //   data.itemUuid = data.item?.uuid;
  //   delete data.item;
  //   delete data.workflow;
  //   return data;
  // }

  getSafeMacroData(item?: Item.Implementation, options: any = {}): MidiMacroData {
    const niceData = this.getMacroData(item, options);
    let naughtyFields = ["actor", "workflow", "targets", "failedSaves", "criticalSaves", "fumbleSaves", "hitTargets", "hitTargetsEC", "saves", "superSavers", "semiSuperSavers"];
    for (let field of naughtyFields) delete niceData[field];
    return niceData;
  }

  getMacroData(item?: Item, options: any = {}): MidiMacroData {
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
      targets.push(target.document);
      targetUuids.push(target.document.uuid);
    }
    for (let save of this.saves) {
      saves.push(save.document);
      saveUuids.push(save.document.uuid);
    }
    for (let hit of this.hitTargets) {
      hitTargets.push(hit.document);
      hitTargetUuids.push(hit.document.uuid);
    }
    for (let hit of this.hitTargetsEC) {
      hitTargetsEC.push(hit.document);
      hitTargetUuidsEC.push(hit.document.uuid);
    }

    for (let failed of this.failedSaves) {
      failedSaves.push(failed.document);
      failedSaveUuids.push(failed.document.uuid);
    }
    for (let critical of this.criticalSaves) {
      criticalSaves.push(critical.document);
      criticalSaveUuids.push(critical.document.uuid);
    }
    for (let fumble of this.fumbleSaves) {
      fumbleSaves.push(fumble.document);
      fumbleSaveUuids.push(fumble.document.uuid);
    }
    for (let save of this.superSavers) {
      superSavers.push(save.document);
      superSaverUuids.push(save.document.uuid);
    };
    for (let save of this.semiSuperSavers) {
      semiSuperSavers.push(save.document);
      semiSuperSaverUuids.push(save.document.uuid);
    };
    const itemData = (item?.toObject(false) ?? {}) as Item.Source & { uuid?: string };
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
      event: this.rollOptions.event,
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
      rollData: (item ?? this.actor)?.getRollData() ?? {},
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
      templateUuid: this.templateUuid, // first template UUID (backward compat)
      templateUuids: this.templateUuids, // all template UUIDs
      tokenUuid: this.tokenUuid,
      utilityRoll: this.utilityRoll,
      utilityRolls: this.utilityRolls,
      uuid: this.itemUuid, // deprecated
      workflowOptions: this.workflowOptions,
      castData: this.castData,
      workflow: this,
      workflowId: this.id
    }
  }

  async callMacros(
    item: Item.Implementation | undefined,
    macros: string | undefined,
    tag: string,
    macroPass: string,
    options: AnyObject = {}
  ): Promise<any[]> {
    if (!macros || macros?.length === 0) return [];
    const macroNames = macros.split(",").map(s => s.trim());
    let values: Promise<DamageBonusMacroResult | any>[] = [];
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
        return;
      }));
      if (this.activity.otherActivity) {
        values.push(this.callMacro(item, macro, macroData, foundry.utils.mergeObject(options, { otherActivityOnly: true }, { inplace: false })).catch((err) => {
          const message = `midi-qol | called macro error in ${item?.name} ${item?.uuid} macro ${macro}`;
          console.warn(message, err);
          TroubleShooter.recordError(err, message);
          return;
        }));

      }
    }
    let results: Array<DamageBonusMacroResult | any> = await Promise.allSettled(values);
    if (debugEnabled === 1 && results.length) warn("callMacros | macro data ", macroData);
    results = results.map(p => p.value);
    return results;
  }


  /**
   * Parse the macro name and resolve context from UUID if provided.
   */
  private async parseCallMacroContext(
    macroName: string,
    item: Item.Implementation | undefined,
    options: AnyObject
  ): Promise<CallMacroContext | undefined> {
    const [name, uuid] = macroName?.trim().split("|") ?? [];
    if (!name) return undefined;

    let macroItem: Item.Implementation | Item.InitializedData | undefined = item;
    let macroActivity: Activity | undefined = this.activity;
    const actorToUse = (options.actor as Actor.Implementation | undefined) ?? this.actor;

    // Resolve entity from UUID if provided
    if (uuid?.length > 0) {
      const macroEntity = await fromUuid(uuid) as any;
      if (macroEntity) {
        if (macroEntity instanceof ActiveEffect) {
          if (macroEntity.parent instanceof Item) macroItem = macroEntity.parent;
        } else if (macroEntity instanceof Item) {
          macroItem = macroEntity;
        } else if (macroEntity.item) { // Activity
          macroActivity = macroEntity;
          macroItem = macroEntity.item;
        }
      }
    }

    // Handle otherActivityOnly option
    if (options.otherActivityOnly) {
      if (!this.activity.otherActivity) return undefined;
      if (name !== "ActivityMacro" && !name.startsWith("ActivityMacro-")) return undefined;
      macroActivity = this.activity.otherActivity;
      macroItem = this.item;
    }

    return { name, uuid, macroItem, macroActivity, actorToUse };
  }

  /**
   * Resolve a function.* macro specification.
   */
  private resolveFunctionMacro(name: string, context: CallMacroContext): ResolvedMacro {
    const func = name.replace("function.", "").trim();
    return {
      item: context.macroItem,
      macroActivity: context.macroActivity,
      macro: DAE.createSyntheticMacro(
        `return await ${func}({ speaker, actor, token, character, item, rolledItem, macroItem, args, scope, workflow })`,
        "function call"
      )
    };
  }

  /**
   * Resolve an ItemMacro specification, with DAE itemData fallback.
   */
  private async resolveItemMacroCall(name: string, context: CallMacroContext): Promise<ResolvedMacro | undefined> {
    const { uuid, macroItem, actorToUse } = context;

    // Try standard resolution first
    const resolved = await resolveItemMacro(name, { actor: actorToUse, originItem: macroItem as Item.Implementation });
    if (resolved) {
      return {
        item: resolved.item,
        macroActivity: context.macroActivity,
        macroData: resolved.macroData,
        sourceItemUuid: resolved.item?.uuid
      };
    }

    // DAE itemData fallback - look for item data stored in effect flags
    if (actorToUse instanceof Actor && uuid) {
      const itemData = resolveDAEItemData(actorToUse, uuid);
      const command = itemData ? DAE.getItemMacroCommand(itemData) : undefined;
      if (itemData && command) {
        return {
          item: itemData,
          macroActivity: context.macroActivity,
          macro: DAE.createSyntheticMacro(command),
          // @ts-expect-error uuid may not be on data
          sourceItemUuid: itemData?.uuid
        };
      }
    }

    console.warn("midi-qol | callMacro | No item for", name);
    return undefined;
  }

  /**
   * Resolve an ActivityMacro specification.
   */
  private async resolveActivityMacroCall(name: string, context: CallMacroContext): Promise<ResolvedMacro | undefined> {
    const { macroItem, macroActivity } = context;

    // Workflow-specific guard: ActivityMacro-id must match current activity
    if (name.startsWith("ActivityMacro-")) {
      const activityId = name.split("-").slice(1).join("-");
      if (!macroActivity || activityId !== macroActivity?.id) return undefined;
    }

    const resolved = await resolveActivityMacro(name, {
      originItem: macroItem as Item.Implementation,
      originActivity: macroActivity
    });

    if (resolved) {
      return {
        item: resolved.item,
        macroActivity: resolved.activity,
        macro: resolved.macro,
        sourceItemUuid: resolved.item?.uuid
      };
    }
    return undefined;
  }

  /**
   * Resolve a world or compendium macro.
   */
  private async resolveWorldMacro(name: string, context: CallMacroContext): Promise<ResolvedMacro | undefined> {
    const macroName = name.startsWith("Macro.") ? name.slice(6) : name;
    const macro = await DAE.resolveWorldMacro(macroName);

    if (!macro) return undefined;

    if (macro.type === "chat") {
      macro.execute();
      return undefined;
    }

    return { item: context.macroItem, macroActivity: context.macroActivity, macro };
  }

  /**
   * Create a Macro instance from macro data and execute it with the given scope.
   * @param resolved - The resolved macro specification
   * @param workflowContext - Workflow context data passed to macro as args[0] and midiData
   * @param options - Call options
   * @param rolledItem - The item that was rolled to trigger this macro
   */
  private executeMacroWithScope(
    resolved: ResolvedMacro,
    workflowContext: MidiMacroData,
    options: AnyObject,
    rolledItem: Item.Implementation | undefined
  ): Promise<any> | void | undefined {
    const macro = this.createMacroFromResolved(resolved);
    if (!macro?.command) return undefined;

    const actorToUse = (options.actor as Actor.Implementation | undefined) ?? this.actor;
    const scope: Macro.UnknownScope = {
      workflow: this,
      rolledActivity: this.activity,
      macroActivity: resolved.macroActivity,
      item: rolledItem,
      rolledItem: rolledItem,
      macroItem: resolved.item ?? rolledItem,
      args: [workflowContext],
      options: options,
      actor: actorToUse,
      token: tokenForActor(actorToUse),
      midiData: workflowContext
    };

    return macro.execute(scope);
  }

  /**
   * Create a Macro document from resolved macro data.
   */
  private createMacroFromResolved(resolved: ResolvedMacro): Macro.Implementation | undefined {
    if (resolved.macro) return resolved.macro;

    const macroData = resolved.macroData;
    if (!macroData?.command) {
      if (debugEnabled > 0) warn(`callMacro | could not find item macro command`);
      return undefined;
    }

    return DAE.createSyntheticMacro(macroData.command, macroData.name ?? "midi generated macro");
  }

  /**
   * Call a macro by name, resolving the macro type and executing it.
   */
  async callMacro(
    item: Item.Implementation | undefined,
    macroName: string,
    macroData: MidiMacroData,
    options: AnyObject
  ): Promise<any> {
    try {
      // Phase 1: Parse and resolve context
      const context = await this.parseCallMacroContext(macroName, item, options);
      if (!context) return undefined;

      const { name, actorToUse } = context;
      let resolved: ResolvedMacro | undefined;

      // Phase 2: Resolve macro based on type
      if (name.startsWith("function.")) {
        resolved = this.resolveFunctionMacro(name, context);
      } else if (name.startsWith(MQItemMacroLabel) || name.startsWith("ItemMacro")) {
        resolved = await this.resolveItemMacroCall(name, context);
      } else if (name.startsWith(MQActivityMacroLabel) || name.startsWith("ActivityMacro")) {
        resolved = await this.resolveActivityMacroCall(name, context);
      } else {
        // World/compendium macro - show error if not found
        resolved = await this.resolveWorldMacro(name, context);
        if (!resolved) {
          const message = `Could not find macro ${name}`;
          TroubleShooter.recordError(new Error(message), message);
          ui.notifications?.error(`midi-qol | ${message}`);
          return undefined;
        }
      }

      // ItemMacro/ActivityMacro may return undefined for expected reasons
      // (e.g., ActivityMacro-id not matching current activity)
      if (!resolved) return undefined;

      // Update macroData with source info
      if (resolved.sourceItemUuid) {
        macroData.sourceItemUuid = resolved.sourceItemUuid;
      }
      macroData.speaker = this.speaker;
      macroData.actor = actorToUse;

      // Phase 3: Execute
      return this.executeMacroWithScope(resolved, macroData, options, item);
    } catch (err) {
      TroubleShooter.recordError(err, "callMacro: Error evaluating macro");
      ui.notifications?.error(`There was an error running your macro. See the console(F12) for details`);
      error("Error evaluating macro ", err);
      return {};
    }
  }

  async removeEffectsButton() {
    if (!this.itemCardUuid) return;
    const chatMessage = this.chatCard;
    if (chatMessage?.content) {
      const buttonRe = /<button[^>]*?data-action="midiApplyEffects"[\s\S]*?<\/button>/;
      let content = chatMessage.content.replace(buttonRe, "");
      await this.performThrottledUpdate(chatMessage, { content });
    }
  }
  async displayUtilityRolls() {
    const chatMessage = this.chatCard;
    let newFlags = {};
    let content;
    if (chatMessage?.content) { // display the attack roll
      const utilityRoll = this.utilityRoll; // will concat as needed
      //let searchRe = /<div class="midi-qol-attack-roll">.*?<\/div>/;
      let searchRe = /<div[^>]*?class="midi-qol-utility-roll[^"]*"[\s\S]*?<div class="end-midi-qol-utility-roll">/
      // Display roll name if available, otherwise default to utility activity type title
      const rollString = this.activity?.roll?.name || i18n("DND5E.UTILITY.Title");
      let replaceString = `<div class="midi-qol-utility-roll"><div class="midi-roll-label">${rollString}</div>${this.utilityRollHTML}<div class="end-midi-qol-utility-roll">`
      content = chatMessage.content.replace(searchRe, replaceString);
      if (debugEnabled > 0) warn("displayUtilityRoll |", this.utilityRoll)
      newFlags = {
        "midi-qol":
        {
          type: MESSAGE_TYPES.OTHER,
          // roll: utilityRoll?.roll,
        }
      }
    }
    // chatRolls, not just this roll: message.rolls is where the rolls are stored now, so a partial
    // array here would drop the ones already made.
    await this.performThrottledUpdate(chatMessage, { content, flags: newFlags, rolls: this.chatRolls });
  }

  async displayAttackRoll(displayOptions: { GMOnlyAttackRoll?: boolean } = {}) {
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
    const chatMessage = this.chatCard;
    let newFlags = {};
    let content;
    if (chatMessage?.content) { // display the attack roll
      content = chatMessage.content;
      let searchRe = /<div[^>]*?class="midi-qol-attack-roll[^"]*"[\s\S]*?<div class="end-midi-qol-attack-roll">/
      // Determine attack label based on attackRollModifierTracker.advantageMode
      let attackString: string;
      const mode = this.attackRoll?.options?.advantageMode ?? this.attackRollModifierTracker.advantageMode ?? ADV_MODE.NORMAL;
      if (mode === ADV_MODE.ADVANTAGE) {
        attackString = i18n("DND5E.Advantage");
      } else if (mode === ADV_MODE.DISADVANTAGE) {
        attackString = i18n("DND5E.Disadvantage");
      } else {
        attackString = i18n("DND5E.Attack");
      }
      if (configSettings.addFakeDice) // addFakeDice => roll 2d20 always - don't show advantage/disadvantage or players will know the 2nd d20 is fake
        attackString = i18n("DND5E.Attack");

      // Add attribution info icon if there's any attribution data
      let attributionIcon = "";
      if (Object.keys(this.attackAttribution).length > 0) {
        const tooltipContent = await this.renderAttributionTooltip();
        if (tooltipContent) {
          attributionIcon = ` <span class="midi-attribution-info" data-tooltip-html="${foundry.utils.escapeHTML(tooltipContent)}" data-tooltip-direction="DOWN"><i class="fas fa-info-circle"></i></span>`;
        }
      }

      let replaceString = `<div class="midi-qol-attack-roll midi-qol-section-filled"><div class="midi-roll-label">${attackString}${attributionIcon}</div>${this.attackRollHTML}<div class="end-midi-qol-attack-roll">`

      content = content.replace(searchRe, replaceString);
      if (this.attackRollCount > 1) {
        // Match rollAttack button - handles both multi mode (no span) and single mode (with span)
        // Also handles optional style attribute with flexible spacing
        const attackButtonRe = /(<button[^>]*data-action="rollAttack"[^>]*>)(?:<span>)?(\[\d*\] )*([^<]+)(?:<\/span>)?(<\/button>)/;
        content = content.replace(attackButtonRe, `$1<span>[${this.attackRollCount}] $3</span>$4`);
        const confirmButtonRe = /<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">(\[[\d ]*\])*([^<]+)<\/button>/;
        content = content.replace(confirmButtonRe, `<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">[${this.attackRollCount} ${this.damageRollCount + 1}] $2</button>`);
      }

      if (this.attackRoll?.dice.length) {
        const d: any = this.attackRoll.dice[0]; // should be a dice term but DiceTerm.options not defined
        const isD20 = (d.faces === 20);
        if (isD20) {
          // Success/failure/critical/fumble classes are applied at render time
          // by ChatMessageMidi._applyAttackRollHighlight, not baked into content.
          this.d20AttackRoll = d.total;
        }
      }
      if (debugEnabled > 0) warn("displayAttackRoll |", this.attackRoll)
      newFlags = {
        "midi-qol": {
          GMOnlyAttackRoll: displayOptions.GMOnlyAttackRoll ?? false,
          //@ts-expect-error no dnd5e types
          isHit: configSettings.autoCheckHit === "none" ? (this.attackRoll?.isSuccess ?? false) : this.hitTargets.size > 0,
          isHitEC: this.hitTargetsEC.size > 0,
          // roll: this.attackRoll,
          type: MESSAGE_TYPES.ATTACK,
          d20AttackRoll: this.d20AttackRoll,
          hitTargetUuids: Array.from(this.hitTargets).map(t => t.document.uuid),
          hitECTargetUuids: Array.from(this.hitTargetsEC).map(t => t.document.uuid),
          isCritical: this.isCritical,
          isFumble: this.isFumble,
          targets: Array.from(this.targets).map(t => ({ uuid: t.document.uuid, name: t.document.name })),
        },

      }
    }
    await this.performThrottledUpdate(chatMessage, { content, flags: newFlags, rolls: this.chatRolls });
  }

  async displayDamageRolls() {
    const chatMessage = this.chatCard;
    if (!chatMessage?.content) {
      const message = `midi-qol | displayDamageRolls | no chat message to display damage rolls`;
      console.warn(message);
      TroubleShooter.recordError(new Error(message), message);
      return;
    }
    let content = chatMessage.content;
    if ((getRemoveDamageButtons(this.activity) && configSettings.confirmAttackDamage === "none") || this.workflowType === "TrapWorkflow") {
      // Match rollDamage button from activity-card.hbs
      const damageRe = /<button[^>]*?data-action="rollDamage"[\s\S]*?<\/button>/
      const formulaRe = /<button[^>]*?data-action="rollFormula"[\s\S]*?<\/button>/
      content = content?.replace(damageRe, "<div></div>")
      content = content?.replace(formulaRe, "")
    }
    let newFlags = {};
    if (chatMessage) {
      if (this.damageRollHTML) {
        if (!this.useOther) {
          const searchRe = /<div[^>]*?class="midi-qol-damage-roll[^"]*"[\s\S]*?<div class="end-midi-qol-damage-roll">/;
          const replaceString = `<div class="midi-qol-damage-roll midi-qol-section-filled"><div class="midi-roll-label">${this.damageFlavor}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-damage-roll">`
          content = content.replace(searchRe, replaceString);
        } else {
          const otherSearchRe = /<div[^>]*?class="midi-qol-other-damage-roll[^"]*"[\s\S]*?<div class="end-midi-qol-other-damage-roll">/;
          const otherReplaceString = `<div class="midi-qol-other-damage-roll midi-qol-section-filled"><div class="midi-roll-label">${this.damageFlavor}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-other-damage-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.otherDamageRollHTML) {
          const otherSearchRe = /<div[^>]*?class="midi-qol-other-damage-roll[^"]*"[\s\S]*?<div class="end-midi-qol-other-damage-roll">/;
          const otherReplaceString = `<div class="midi-qol-other-damage-roll midi-qol-section-filled"><div class="midi-roll-label">${this.otherDamageFlavor}${this.otherDamageRollHTML || ""}</div><div class="end-midi-qol-other-damage-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.bonusDamageRolls) {
          const bonusSearchRe = /<div[^>]*?class="midi-qol-bonus-damage-roll[^"]*"[\s\S]*?<div class="end-midi-qol-bonus-damage-roll">/;
          const bonusReplaceString = `<div class="midi-qol-bonus-damage-roll midi-qol-section-filled"><div class="midi-roll-label">${this.bonusDamageFlavor}${this.bonusDamageHTML || ""}</div><div class="end-midi-qol-bonus-damage-roll">`
          content = content.replace(bonusSearchRe, bonusReplaceString);
        }
      } else {
        if (this.otherDamageRollHTML) {
          const otherSearchRe = /<div[^>]*?class="midi-qol-damage-roll[^"]*"[\s\S]*?<div class="end-midi-qol-damage-roll">/;
          const otherReplaceString = `<div class="midi-qol-damage-roll midi-qol-section-filled"><div class="midi-roll-label">${this.otherDamageFlavor}</div>${this.otherDamageRollHTML || ""}<div class="end-midi-qol-damage-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.bonusDamageRolls) {
          const bonusSearchRe = /<div[^>]*?class="midi-qol-bonus-damage-roll[^"]*"[\s\S]*?<div class="end-midi-qol-bonus-damage-roll">/;
          const bonusReplaceString = `<div class="midi-qol-bonus-damage-roll midi-qol-section-filled"><div class="midi-roll-label">${this.bonusDamageFlavor}</div>${this.bonusDamageHTML || ""}<div class="end-midi-qol-bonus-damage-roll">`
          content = content.replace(bonusSearchRe, bonusReplaceString);
        }
      }

      const midiAttackTargets = Array.from(this.targets).map(token => {
        const t = getTokenDocument(token);
        return {
          name: t?.name,
          img: t?.actor?.img,
          uuid: t?.actor?.uuid,
          //@ts-expect-error no dnd5e-types
          ac: t?.actor?.system?.attributes.ac.value,
        }
      });
      newFlags = foundry.utils.mergeObject(newFlags, {
        "midi-qol": {
          type: MESSAGE_TYPES.DAMAGE,
          damageDetail: this.useOther ? undefined : damageDetailToObject(this.rawDamageDetail),
          otherDamageDetail: this.useOther ? damageDetailToObject(this.rawDamageDetail) : damageDetailToObject(this.rawOtherDamageDetail),
          bonusDamageDetail: damageDetailToObject(this.rawBonusDamageDetail),
          sourceActorUuid: this.actor.uuid,
          damageTotal: this.useOther ? undefined : this.damageTotal,
          [WorkflowDataFlags.otherDamageTotal]: this.useOther ? this.damageTotal : this.otherDamageTotal,
          [WorkflowDataFlags.bonusDamageTotal]: this.bonusDamageTotal,
        }
      }, { overwrite: true, inplace: false });
    }

    if (this.damageRollCount > 1) {
      // Match rollDamage button - handles both multi mode (no span) and single mode (with span)
      const damageButtonRe = /(<button[^>]*data-action="rollDamage"[^>]*>)(?:<span>)?(\[\d*\] )*([^<]+)(?:<\/span>)?(<\/button>)/;
      content = content.replace(damageButtonRe, `$1<span>[${this.damageRollCount}] $3</span>$4`);
      const confirmButtonRe = /<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">(\[[\d ]*\])*([^<]+)<\/button>/;
      content = content.replace(confirmButtonRe, `<button class="midi-qol-confirm-damage-roll-complete" data-action="confirm-damage-roll-complete">[${this.attackRollCount} ${Math.max(this.damageRollCount, 1)}] $2</button>`);
    } else {
      // Match rollDamage button - handles both multi mode (no span) and single mode (with span)
      const damageButtonRe = /(<button[^>]*data-action="rollDamage"[^>]*>)(?:<span>)?(\[\d*\] )*([^<]+)(?:<\/span>)?(<\/button>)/;
      content = content.replace(damageButtonRe, `$1<span>$3</span>$4`);
    }
    return await this.performThrottledUpdate(chatMessage, { "content": content, flags: newFlags, rolls: this.chatRolls }, false);
  }

  async displayHitTargets(whisper = false) {
    this.hitDisplayData = {};
    this.needsHitTargetsDisplayed = false;
    // @ts-expect-error no dnd5e-types
    if (this.item.type === "feat" && ["ench", "class", undefined].includes(this.activity.actionType)) return;
    for (let target of this.targets) {
      if (!target) continue;
      let img = target.document?.texture.src ?? target.actor?.img ?? "";
      // @ts-expect-error no dnd5e-types
      if (configSettings.usePlayerPortrait && target.actor?.type === "character") {
        img = target.actor.img ?? target.document?.texture.src ?? "";
      }
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img ?? "")) {
        img = (await game.video?.createThumbnail(img ?? "", { width: 100, height: 100 })) ?? "";
      }
      const tokenUuid = target.document.uuid;
      // @ts-expect-error no dnd5e-types
      const baseAc = target.actor?.system?.attributes?.ac?.value ?? 10;
      this.hitDisplayData[tokenUuid] = {
        targetClass: (target.actor as Actor)?.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-npc-target",
        target: target,
        hitClass: "",
        acClass: (target.actor as Actor)?.hasPlayerOwner ? "" : "midi-qol-npc-ac",
        img,
        gmName: getTokenName(target),
        playerName: getTokenPlayerName(target) ?? "",
        uuid: tokenUuid,
        showAC: !!this.activity.attack,
        acDisplay: `${baseAc}`,
        acIcons: [],
        isHit: this.hitTargets.has(target)
      };
    }
    await this.displayHits(whisper, false);
  }

  async displayHits(whisper = false, showHits = true) {
    this.needsHitTargetsDisplayed = false;
    // if (["", undefined].includes(this.activity.target?.affects?.type)) return; This does not work for lots of srd items
    const templateData = {
      attackType: this.item.name ?? "",
      attackTotal: this.attackTotal,
      oneCard: true,
      collapsibleTargets: configSettings.collapsibleTargets,
      showHits,
      hits: this.hitDisplayData,
      isGM: game.user?.isGM,
    };
    if (debugEnabled > 0) warn("displayHits |", templateData, whisper);
    const hitContent = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/hits.html", templateData) || "No Targets";
    const chatMessage = this.chatCard;

    if (chatMessage?.content) {
      let searchString = /<div[^>]*?class="midi-qol-hits-display[^"]*"[\s\S]*?<div class="end-midi-qol-hits-display">/;
      let replaceString = `<div class="midi-qol-hits-display midi-qol-section-filled">${hitContent}<div class="end-midi-qol-hits-display">`
      let content = chatMessage.content.replace(searchString, replaceString);

      const update = {
        content,
        flags: { "midi-qol": { type: MESSAGE_TYPES.HITS } },
        // TODO: May not be required
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
      }
      await this.performThrottledUpdate(chatMessage, update);
    }
  }

  computeSaveFlavors(): { fullDamageText: string, halfDamageText: string, noDamageText: string } {
    let fullDamage: string[] = [];
    let noDamage: string[] = [];
    let halfDamage: string[] = [];
    let fullDamageText = "";
    let noDamageText = "";
    let halfDamageText = "";
    //this.needsHitTargetsDisplayed = false;
    if (this.activity && (this.activity.save || this.activity.check) && (this.activity.damage?.parts.length ?? 0) > 0) {
      switch (getSaveMultiplierForActivity(this.activity)) {
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
    if ((this.otherActivity?.save || this.otherActivity?.check) && (this.otherActivity?.damage?.parts.length ?? 0) > 0) {
      switch (getSaveMultiplierForActivity(this.otherActivity)) {
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
  async displaySaveTargets(_whisper = false) {
    this.saveTargetsDisplayed = true;
    this.saveDisplayData = [];
    let rollType: string = "";
    let rollAbilities: string[] = [];
    let rollSkills: string[] = [];
    let rollTools: string[] = [];
    let rollDC = this.saveActivity?.save?.dc.value ?? this.saveActivity?.check?.dc.value;

    if (this.saveActivity?.save) {
      rollType = "save";
      if (this.saveActivity.save.ability instanceof Set) {
        rollAbilities = Array.from(this.saveActivity.save.ability);
      } else {
        const ability = this.saveActivity.save.ability;
        if (ability) rollAbilities = [ability];
      }
    } else if (this.saveActivity?.check) {
      let skillOrTool = this.saveActivity.check.associated.first();
      // @ts-expect-error no dnd5e-types
      if (!skillOrTool && this.item.type === "tool") {
        // @ts-expect-error no dnd5e-types
        skillOrTool = this.item.system.type!.baseItem;
      }
      if (!skillOrTool) {
        rollType = "check";
        const ability = this.saveActivity.check.ability;
        if (ability) rollAbilities = [ability];
      } else if (GameSystemConfig.skills[skillOrTool]) {
        rollType = "skill";
        rollSkills = [skillOrTool];
      } else {
        rollType = "tool";
        rollTools = [skillOrTool];
      }
    }
    for (let target of this.targets) {
      const targetDocument = target.document;
      let img = targetDocument.texture.src ?? target.actor?.img ?? "";
      // @ts-expect-error no dnd5e-types
      if (configSettings.usePlayerPortrait && (target.actor as Actor).type === "character") {
        img = target.actor?.img ?? targetDocument.texture.src ?? "";
      }

      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
        img = await game.video?.createThumbnail(img, { width: 100, height: 100 }) ?? "";
      }

      let isPlayerOwned = !!target.actor?.hasPlayerOwner;
      this.saveDisplayData.push({
        gmName: getTokenName(target),
        playerName: getTokenPlayerName(target) ?? "",
        img,
        targetClass: isPlayerOwned ? "midi-qol-player-target" : "midi-qol-npc-target",
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
      hasDamageText: !!(fullDamageText || halfDamageText || noDamageText),
      saveDisplayFlavor: await this.computeSaveDisplayFlavor(rollDC, rollType, { rollAbilities, rollSkills, rollTools }),
      saves: this.saveDisplayData,
      // TODO force roll damage
    }
    const chatMessage = this.chatCard;

    const saveContent = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/saves.html", templateData);
    let searchRe = /<div[^>]*?class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
    let replaceString = `<div class="midi-qol-saves-display"><div data-item-id="${this.item.id}">${saveContent}</div><div class="end-midi-qol-saves-display">`
    let content = chatMessage.content.replace(searchRe, replaceString);
    await this.performThrottledUpdate(chatMessage, { content, flags: { "midi-qol": { type: MESSAGE_TYPES.SAVES } } });
  }
  async displaySaves(_whisper: boolean = false) {
    let { fullDamageText, halfDamageText, noDamageText } = this.computeSaveFlavors();
    let templateData = {
      fullDamageText,
      halfDamageText,
      noDamageText,
      hasDamageText: !!(fullDamageText || halfDamageText || noDamageText),
      saveDisplayFlavor: this.saveDisplayFlavor,
      saves: this.saveDisplayData,
      // TODO force roll damage
    }
    let chatMessage = this.chatCard; // XXX await asyncGetCachedDocument(this.itemCardUuid);
    if (chatMessage?.content) {
      templateData.saveDisplayFlavor = this.saveDisplayFlavor;
      const saveContent = await foundry.applications.handlebars.renderTemplate("modules/midi-qol/templates/saves.html", templateData);
      let searchRe: RegExp;
      let replaceString: string;
      let midiTargets = Array.from(this.targets.map(t => t.document));
      let midiTargetDescriptors: CombinedTargetDescriptor[] | undefined;

      if (midiTargets.length) {
        const saves = this.saves?.map(t => t.document.uuid);
        const semiSuperSavers = this.semiSuperSavers?.map(t => t.document.uuid);
        const superSavers = this.superSavers?.map(t => t.document.uuid);
        const targetDescriptors = this.targetDescriptors;
        midiTargetDescriptors = midiTargets.map(t => {
          let uncannyDodge = !!(t.actor?.flags?.[MODULE_ID]?.["uncanny-dodge"] && this.activity.attack);
          let saveMults = {
            otherDamage: this.otherActivity ? getSaveMultiplierForActivity(this.otherActivity) : 1,
            defaultDamage: getSaveMultiplierForActivity(this.activity),
            bonusDamage: getSaveMultiplierForActivity(this.activity)
          };

          const targetDescriptor = getTargetDescriptor(t.actor?.uuid ?? "", targetDescriptors) ?? {}
          return foundry.utils.mergeObject({
            name: t.name,
            img: t.actor?.img as string,
            uuid: t.actor?.uuid ?? "",
            //@ts-expect-error no dnd5e-types
            ac: hasCoverTotal(t.actor) ? null : t?.actor?.system.attributes.ac.value as number,
            saved: saves?.has(t.uuid),
            semiSuperSaver: semiSuperSavers?.has(t.uuid),
            superSaver: superSavers?.has(t.uuid),
            saveMults,
            itemType: this.item.type,
            uncannyDodge,
          }, targetDescriptor);
        })
      }
      if (this.workflowType !== "DamageOnlyWorkflow") {
        searchRe = /<div[^>]*?class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
        replaceString = `<div class="midi-qol-saves-display"><div data-item-id="${this.item.id}">${saveContent}</div><div class="end-midi-qol-saves-display">`
        let content = chatMessage.content.replace(searchRe, replaceString);
        const update = {
          content,
          /* rolls: this.chatRolls */
          flags: {
            "midi-qol": {
              type: MESSAGE_TYPES.SAVES,
              saveUuids: Array.from(this.saves).map(t => t.document.uuid),
              failedSaveUuids: Array.from(this.failedSaves).map(t => t.document.uuid),
              superSaverUuids: Array.from(this.superSavers).map(t => t.document.uuid),
              semiSuperSaverUuids: Array.from(this.semiSuperSavers).map(t => t.document.uuid),
              criticalSaveUuids: Array.from(this.criticalSaves).map(t => t.document.uuid),
              fumbleSaveUuids: Array.from(this.fumbleSaves).map(t => t.document.uuid),
              advantageSaveUuids: Array.from(this.advantageSaves).map(t => t.document.uuid),
              sourceActorUuid: this.actor.uuid,
            },
            dnd5e: { targets: midiTargetDescriptors }
          },
          style: CONST.CHAT_MESSAGE_STYLES.OTHER
        };
        await this.performThrottledUpdate(chatMessage, update);
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
    return messageRolls;
  }

  /**
   * Gets an auto-roll for a friendly target if applicable
   * @param saveDetails The save details object with isFriendly flag
   * @returns A promise that resolves to a roll if the target should auto-pass/fail, null otherwise
   */
  protected getFriendlyTargetRoll(
    saveDetails: { isFriendly: boolean }
  ): Promise<Roll> | null {
    //@ts-expect-error
    const BasicRoll = CONFIG.Dice.BasicRoll as typeof Roll;

    if (!saveDetails.isFriendly) return null;

    // Check for auto-fail on friendly targets
    // @ts-expect-error no dnd5e-types
    const descriptionIncludesAutoFail = this.item.system.description?.value?.toLowerCase().includes(i18n("midi-qol.autoFailFriendly")?.toLowerCase());
    if (descriptionIncludesAutoFail || this.activity.friendlySave === "friendlyFail") {
      return new BasicRoll("-1").evaluate();
    }

    // Check for auto-success on friendly targets
    if (this.activity.friendlySave === "friendlySuccess") {
      return new BasicRoll("99").evaluate();
    }

    return null;
  }

  /**
   * Gets the portrait image for a target token
   * Handles player portrait preference and video thumbnail generation
   * @param target The target token
   * @returns Promise resolving to the image URL string
   */
  protected async getTargetPortraitImage(target: Token): Promise<string> {
    const targetDocument = target.document;
    let img = targetDocument.texture.src ?? target.actor?.img ?? "";

    // @ts-expect-error no dnd5e-types
    if (configSettings.usePlayerPortrait && target.actor?.type === "character") {
      img = target.actor.img ?? targetDocument.texture.src ?? "";
    }

    if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
      img = await game.video?.createThumbnail(img, { width: 100, height: 100 }) ?? "";
    }

    return img;
  }

  /**
   * Checks if target should auto-succeed due to Sculpt Spells or Careful Spells features
   * Sculpt Spells: Evocation wizard feature - pre-selected targets auto-succeed on saves
   * Careful Spells: Sorcerer metamagic - pre-selected targets auto-succeed on saves
   * @param target The target token to check
   * @returns true if target should auto-succeed, false otherwise
   */
  protected checkSculptOrCarefulSpells(target: Token): boolean {
    // Sculpt Spells: Evocation spells auto-succeed for pre-selected targets (adds to superSavers)
    // @ts-expect-error no dnd5e-types - accessing .school property
    const isEvocationSpell = this.activity.item?.system.school === "evo";
    if (this.actor.flags?.[MODULE_ID]?.sculptSpells &&
      (this.rangeTargeting || this.tempTargetConfirmation) &&
      isEvocationSpell &&
      this.preSelectedTargets.has(target)) {
      this.superSavers = this.superSavers.add(target);
      return true;
    }

    // Careful Spells: Pre-selected targets auto-succeed
    if (this.actor.flags?.[MODULE_ID]?.carefulSpells &&
      (this.rangeTargeting || this.tempTargetConfirmation) &&
      this.preSelectedTargets.has(target)) {
      return true;
    }

    return false;
  }

  /**
   * Applies concentration save bonus if applicable
   * Only applies when item has isConcentrationCheck flag and target has concentrationSaveBonus
   * @param target The target token
   * @param saveRoll The original save roll
   * @param resultDC The save DC
   * @param isCritical Whether the roll was a critical
   * @param isFumble Whether the roll was a fumble
   * @returns Updated roll info or null if no bonus applies
   */
  protected async applyConcentrationSaveBonus(
    target: Token,
    saveRoll: Roll,
    resultDC: number,
    isCritical: boolean,
    isFumble: boolean
  ): Promise<{ saveRoll: Roll, saveRollTotal: number, saved: boolean } | null> {
    if (!this.item.flags?.[MODULE_ID]?.isConcentrationCheck) return null;

    const checkBonus = target.actor?.flags?.[MODULE_ID]?.concentrationSaveBonus;
    if (!checkBonus) return null;

    //@ts-expect-error
    const D20Roll = CONFIG.Dice.D20Roll as typeof Roll;
    const rollBonus = await new D20Roll(`${checkBonus}`, target.actor?.getRollData()).evaluate();
    const newSaveRoll = addRollTo(saveRoll, rollBonus);
    const newSaveRollTotal = newSaveRoll.total!;

    let saved = newSaveRollTotal >= resultDC;
    if (checkRule("criticalSaves")) {
      saved = (isCritical || newSaveRollTotal >= resultDC) && !isFumble;
    }

    return { saveRoll: newSaveRoll, saveRollTotal: newSaveRollTotal, saved };
  }

  /**
   * Builds and stores save display entry for a target
   * Handles advantage/disadvantage display, cover bonus, and roll rendering
   * @param target The target token
   * @param saveRoll The save roll result
   * @param saved Whether the target saved
   * @param rollDC The save DC (or undefined if no DC)
   * @param coverSaveBonus Computed cover bonus (for label when no cover status); total cover displays as ∞
   */
  protected async buildSaveDisplayEntry(
    target: Token,
    saveRoll: Roll,
    saved: boolean,
    rollDC: number | undefined,
    coverSaveBonus: number = 0,
  ): Promise<void> {
    const saveRollTotal = coverSaveBonus >= TOTAL_COVER ? Infinity : (saveRoll.total ?? 0);
    let adv = "";
    if (configSettings.displaySaveAdvantage) {
      adv = this.advantageSaves.has(target) ? `(${i18n("DND5E.Advantage")})` : "";
      if (this.disadvantageSaves?.has(target)) adv = `(${i18n("DND5E.Disadvantage")})`;
    }

    const img = await this.getTargetPortraitImage(target);
    const isPlayerOwned = target.actor?.hasPlayerOwner ?? false;

    let rollHTML = await midiRenderRoll(saveRoll);
    //@ts-expect-error midiChosenId is a custom roll option
    const midiChosenId: string | undefined = saveRoll.options?.midiChosenId;
    if (midiChosenId) {
      let choiceTitle = "";
      if (GameSystemConfig.abilities[midiChosenId]) {
        const abilityLabel = GameSystemConfig.abilities[midiChosenId].label ?? "";
        choiceTitle = i18nFormat("DND5E.SavePromptTitle", { ability: abilityLabel });
      } else if (GameSystemConfig.skills[midiChosenId]) {
        const skillLabel = GameSystemConfig.skills[midiChosenId].label ?? "";
        choiceTitle = i18nFormat("DND5E.SkillPromptTitle", { skill: skillLabel, ability: "" });
      } else {
        const toolLabel = getToolLabel(midiChosenId);
        if (toolLabel && toolLabel !== midiChosenId) choiceTitle = i18nFormat("DND5E.ToolPromptTitle", { tool: toolLabel });
      }
      if (choiceTitle) rollHTML = `<div style="font-weight:bold; text-align:center;">${choiceTitle}</div>${rollHTML}`;
    }
    const targetDocUuid = getTokenDocument(target)?.uuid ?? "none";

    // Retrieve the per-target saveDetails for attribution tracking
    const saveDetails = this.targetSaveDetails?.[targetDocUuid];

    // Store the save roll in targetSaveDetails (tokenSaves getter reads from here)
    if (saveDetails) saveDetails.saveRoll = saveRoll;

    // Use the tracker for the actually-chosen ability/skill/tool when multiple choices were available
    // Reconstruct tracker if needed (tracker may be a plain object after socketlib transfer)
    let chosenTracker: RollModifierTracker | undefined;
    if (midiChosenId && saveDetails?.advantageByChoice) {
      const chosenData = saveDetails.advantageByChoice[midiChosenId];
      if (chosenData?.tracker) {
        if (chosenData.tracker instanceof RollModifierTracker) {
          chosenTracker = chosenData.tracker;
        } else {
          // Reconstruct from plain object and cache for future access
          chosenTracker = new RollModifierTracker();
          chosenTracker.restore(chosenData.tracker);
          chosenData.tracker = chosenTracker;
        }
      }
    }
    const advMode = chosenTracker ?? saveDetails?.modifierTracker;
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
    const mode = saveRoll?.options?.advantageMode ?? advMode?.advantageMode ?? ADV_MODE.NORMAL;
    const title = getAdvantageModeTitle(mode);
    const attributionTooltip = await renderAttributionTooltip(advMode?.attribution ?? {}, title);

    // Determine cover label from effective cover (status + module delta)
    // coverSaveBonus is the delta above status; add status back for display purposes
    //@ts-expect-error no dnd5e-types
    const statusSaveCover: number = target.actor?.system?.attributes?.ac?.cover ?? 0;
    const totalSaveCover = statusSaveCover + coverSaveBonus;
    let coverLabel: string | undefined;
    if (totalSaveCover >= TOTAL_COVER) coverLabel = "systems/dnd5e/icons/svg/statuses/cover-total.svg";
    else if (totalSaveCover >= THREE_QUARTERS_COVER) coverLabel = "systems/dnd5e/icons/svg/statuses/cover-three-quarters.svg";
    else if (totalSaveCover >= HALF_COVER) coverLabel = "systems/dnd5e/icons/svg/statuses/cover-half.svg";

    // Build save tooltip showing breakdown: "15 = 1d20(12) + 3 vs DC 14"
    let saveTooltip: string | undefined;
    if (rollDC !== undefined) {
      if (!isFinite(saveRollTotal)) {
        saveTooltip = `∞ vs DC ${rollDC}`;
      } else {
        const resultString = saveRoll.result;
        if (resultString && resultString !== String(saveRollTotal)) {
          saveTooltip = `${saveRollTotal} = ${resultString} vs DC ${rollDC}`;
        } else {
          saveTooltip = `${saveRollTotal} vs DC ${rollDC}`;
        }
      }
    }

    this.saveDisplayData?.push({
      gmName: getTokenName(target),
      playerName: getTokenPlayerName(target) ?? "",
      img,
      targetClass: isPlayerOwned ? "midi-qol-player-target" : "midi-qol-npc-target",
      target,
      saveSymbol: (rollDC === null) ? "" : (
        ((target.actor as Actor).hasPlayerOwner ? "" : "midi-qol-npc-save-symbol")
        + " midi-qol-save-symbol "
        + (saved ? "fa-check" : "fa-xmark")),
      saveTotalClass: target.actor?.hasPlayerOwner ? "" : "midi-qol-npc-save-total",
      saveToolTipClass: target.actor?.hasPlayerOwner ? "" : "midi-qol-npc-save-tooltip",
      rollTotal: isFinite(saveRollTotal) ? String(saveRollTotal) : "∞",
      rollDetail: "",
      rollHTML,
      id: target.id,
      modifierTracker: saveDetails?.modifierTracker,  // Store per-target modifierTracker for attribution
      attributionTooltip: foundry.utils.escapeHTML(attributionTooltip),  // Escaped for data-tooltip-html, always shown
      hasAttribution: Object.keys(advMode?.attribution ?? {}).length > 0,
      coverLabel,
      saveTooltip,
      saveClass: (rollDC === null) ? "" : (saved ? "success" : "failure"),
    });
  }

  /**
   * Determines roll settings for a target's save roll
   * @param target The target token
   * @param flagRollType The roll type for module settings (save/check/skill/tool)
   * @param simulate Whether this is a simulation (disables prompts and modules)
   * @returns Object with player, roll settings, and module flags
   */
  protected determineTargetRollSettings(
    target: Token,
    flagRollType: string | undefined,
    simulate: boolean
  ): {
    player: User | undefined;
    promptPlayer: boolean;
    showRollDialog: boolean;
    GMprompt: string | boolean | undefined;
    gmMonksTB: boolean | undefined;
    gmFlashTB: boolean | undefined;
    gmRER: boolean | undefined;
    playerChat: boolean;
  } {
    let player = playerFor(target);
    if (!player || !player.active) player = preferredActiveGM();

    let promptPlayer = !player?.isGM && !(["none", "noneDialogPublic", "noneDialogPrivate", "noneDialogSelf", "noneDialogBlind"].includes(configSettings.playerRollSaves));
    let showRollDialog = !player?.isGM && ["noneDialogPublic", "noneDialogPrivate", "noneDialogSelf", "noneDialogBlind"].includes(configSettings.playerRollSaves);
    if (simulate) promptPlayer = false;

    let GMprompt: string | boolean | undefined;
    let gmMonksTB: boolean | undefined;
    let gmFlashTB: boolean | undefined;
    let gmRER: boolean | undefined;
    const playerChat = !player?.isGM && ["chat"].includes(configSettings.playerRollSaves);

    if (player?.isGM) {
      const targetDocument = getTokenDocument(target);
      const monksTBSetting = targetDocument?.isLinked ? configSettings.rollNPCLinkedSaves === "mtb" : configSettings.rollNPCSaves === "mtb";
      const flashTBSetting = targetDocument?.isLinked ? configSettings.rollNPCLinkedSaves === "ftb" : configSettings.rollNPCSaves === "ftb";
      const epicRollsSetting = targetDocument?.isLinked ? configSettings.rollNPCLinkedSaves === "rer" : configSettings.rollNPCSaves === "rer";
      gmMonksTB = flagRollType !== "tool" && installedModules.get("monks-tokenbar") && monksTBSetting;
      gmFlashTB = installedModules.get("flash-rolls-5e") && flashTBSetting;
      gmRER = installedModules.get("epic-rolls-5e") && epicRollsSetting;
      GMprompt = targetDocument?.isLinked ? configSettings.rollNPCLinkedSaves : configSettings.rollNPCSaves;

      promptPlayer = !["auto", "autoDialog"].includes(GMprompt as string);
      showRollDialog = GMprompt === "autoDialog";

      if (simulate) {
        gmMonksTB = false;
        gmFlashTB = false;
        GMprompt = false;
        gmRER = false;
        promptPlayer = false;
        showRollDialog = false;
      }
    }

    return { player: player ?? undefined, promptPlayer, showRollDialog, GMprompt, gmMonksTB, gmFlashTB, gmRER, playerChat };
  }

  /**
   * Calculates the cover save bonus for a DEX save target.
   * dnd5e already bakes the status cover bonus into the DEX save via prepareAbilities(),
   * so this returns only the delta above status cover from module-computed cover.
   * @param target The target token
   * @param template The measured template (for area effects)
   * @param rollAbility The ability being used for the save
   * @returns The extra cover bonus to add to the save (above what dnd5e already includes)
   */
  protected async calculateCoverSaveBonus(
    target: Token,
    template: foundry.canvas.placeables.MeasuredTemplate.Implementation | undefined | null,
    rollAbility: string | undefined | null,
    templateCoverOrigin?: { x: number, y: number, elevation?: number }
  ): Promise<number> {
    if (!this.item || !this.activityHasSave || rollAbility !== "dex") {
      return 0;
    }

    const targetDocument = target.document;
    const targetActor = target.actor;
    //@ts-expect-error no dnd5e-types
    let statusCoverBonus: number = targetActor?.system?.attributes?.ac?.cover ?? 0;
    if (hasCoverTotal(targetActor)) statusCoverBonus = TOTAL_COVER;

    // Get the raw module-computed cover bonus
    let moduleCoverBonus = 0;

    // Determine the cover origin point: explicit coverOrigin > templateCoverOrigin > template placeable > caster token
    let position: { x: number, y: number } | undefined;
    let originElevation: number = this.token?.document?.elevation ?? 0;

    if (this.workflowOptions.coverOrigin) {
      position = { x: this.workflowOptions.coverOrigin.x, y: this.workflowOptions.coverOrigin.y };
      originElevation = this.workflowOptions.coverOrigin.elevation ?? originElevation;
    } else if (templateCoverOrigin) {
      // v14: pre-computed cover origin from template/region shape data
      position = { x: templateCoverOrigin.x, y: templateCoverOrigin.y };
      originElevation = templateCoverOrigin.elevation ?? originElevation;
    } else if (template) {
      position = foundry.utils.duplicate(template.center);
      const dimensions = canvas.dimensions;
      if (template.document.t === "rect") {
        position.x += (template.document.width ?? 1) / (dimensions?.distance ?? 5) / 2 * (dimensions?.size ?? 100);
        position.y += (template.document.width ?? 1) / (dimensions?.distance ?? 5) / 2 * (dimensions?.size ?? 100);
      }
      originElevation = template.document.elevation;
    }

    if (position) {
      // Cover calculation from a point (coverOrigin, template center, etc.)
      if (configSettings.optionalRules.coverCalculation === "levelsautocover"
        && installedModules.get("levelsautocover")) {
        moduleCoverBonus = computeCoverBonus({
          center: position,
          x: position.x,
          y: position.y,
          id: this.token?.id,
          elevation: originElevation,
          getCenterPoint() { return { x: position.x, y: position.y }; },
          document: {
            x: position.x,
            y: position.y,
            elevation: originElevation,
            disposition: targetDocument?.disposition,
            object: { id: this.token?.id },
          }
        } as unknown as Token, target, this.activity);
      } else if (configSettings.optionalRules.coverCalculation === "simbuls-cover-calculator"
        && installedModules.get("simbuls-cover-calculator")) {
        const coverData = await globalThis.CoverCalculator.checkCoverViaCoordinates(
          position.x, position.y, false, 'AoE', false, target);
        if (coverData?.data.results.cover === 3) moduleCoverBonus = TOTAL_COVER;
        else moduleCoverBonus = -coverData.data.results.value;
      } else if (configSettings.optionalRules.coverCalculation === "tokencover" && installedModules.get("tokencover")) {
        if (this.token) moduleCoverBonus = computeCoverBonus(foundry.utils.deepClone(this.token, { center: position } as any), target, this.activity);
      } else if (configSettings.optionalRules.coverCalculation === "simplecover5e"
        && installedModules.get("simplecover5e")) {
        const syntheticAttacker = {
          center: position,
          scene: canvas.scene,
          id: this.token?.id,
          x: position.x,
          y: position.y,
          elevation: originElevation,
          getCenterPoint() { return { x: position.x, y: position.y }; },
          document: {
            x: position.x,
            y: position.y,
            elevation: originElevation,
            disposition: targetDocument?.disposition,
            getCenterPoint() { return { x: position.x, y: position.y }; },
          }
        };
        moduleCoverBonus = computeCoverBonus(syntheticAttacker as unknown as Token, target, this.activity);
      }
    } else if (this.token) {
      // Direct targeting (no template) — cover from caster position
      moduleCoverBonus = computeCoverBonus(this.token, target, this.activity);
    }
    const effectiveCoverBonus = Math.max(moduleCoverBonus, statusCoverBonus);

    // Spell Sniper ignores 1/2 3/4 cover for ranged spell attacks
    if (this.activity.actionType === "rsak" && this.actor.flags?.dnd5e?.spellSniper && effectiveCoverBonus !== TOTAL_COVER) {
      // If actor has status cover, dnd5e already added it — we need to negate it
      return -statusCoverBonus;
    }
    if (effectiveCoverBonus === TOTAL_COVER) {
      if (this.activity.midiProperties?.ignoreFullCover) {
        // Downgrade total cover to three-quarters
        return Math.max(THREE_QUARTERS_COVER - statusCoverBonus, 0);
      }
      return TOTAL_COVER;
    }
    // dnd5e already includes status cover in the DEX save bonus.
    // Return only the delta: how much module cover exceeds status cover.
    return Math.max(moduleCoverBonus - statusCoverBonus, 0);
  }

  /**
   * Determines if a save roll is a critical success (natural 20) or fumble (natural 1)
   * @param saveRoll The save roll to check
   * @param fallbackTotal Fallback total if dice results can't be read
   * @returns Object with isCritical and isFumble booleans
   */
  protected determineCriticalOrFumble(saveRoll: Roll | undefined, fallbackTotal: number): { isCritical: boolean; isFumble: boolean } {
    if (!saveRoll?.terms) {
      return { isCritical: false, isFumble: false };
    }
    const dterm = saveRoll.terms[0] as foundry.dice.terms.DiceTerm;
    const diceRoll = dterm?.results?.find(result => result.active)?.result ?? fallbackTotal;
    //@ts-expect-error no dnd5e-types
    const isFumble = diceRoll <= (dterm.options?.fumble ?? 1);
    //@ts-expect-error no dnd5e-types
    const isCritical = diceRoll >= (dterm.options?.critical ?? 20);
    return { isCritical, isFumble };
  }

  /**
   * Updates the advantageSaves and disadvantageSaves sets based on the roll result
   * @param target The target token
   * @param result The roll result array
   */
  protected updateAdvantageTrackingFromRoll(target: Token, result: Roll[]): void {
    const advantageMode = result[0]?.options?.advantageMode;
    if (advantageMode !== undefined) {
      // Standard dnd5e roll with advantageMode
      if (advantageMode === 1) this.advantageSaves.add(target);
      else this.advantageSaves.delete(target);
      if (advantageMode === -1) this.disadvantageSaves?.add(target);
      else this.disadvantageSaves?.delete(target);
    } else {
      // Fallback for custom rolls (e.g., Better Rolls) that set terms[0].options
      // @ts-expect-error no dnd5e-types
      if (result[0]?.terms?.[0]?.options?.advantage) this.advantageSaves.add(target);
      else this.advantageSaves.delete(target);
      // @ts-expect-error no dnd5e-types
      if (result[0]?.terms?.[0]?.options?.disadvantage) this.disadvantageSaves?.add(target);
      else this.disadvantageSaves?.delete(target);
    }
    // If both advantage and disadvantage, they cancel out
    if (this.advantageSaves.has(target) && this.disadvantageSaves?.has(target)) {
      this.advantageSaves.delete(target);
      this.disadvantageSaves.delete(target);
    }
    // Trigger setter to persist advantageSaves after in-place mutations
    this.advantageSaves = this.advantageSaves;
  }

  /**
   * Determines the roll type, action, and related properties based on the save activity
   * @returns Object containing rollAction, rollType, rollAbilities, rollSkills, rollTools, and flagRollType
   */
  protected determineRollTypeAndAction(): {
    rollAction: ((config?: AnyObject, dialog?: AnyObject, message?: AnyObject) => Promise<Roll[] | null>) | undefined;
    rollType: string | undefined;
    rollAbilities: string[];
    rollSkills: string[];
    rollTools: string[];
    flagRollType: string | undefined;
  } {
    let rollAction: ((config?: AnyObject, dialog?: AnyObject, message?: AnyObject) => Promise<Roll[] | null>) | undefined;
    let rollType: string | undefined;
    let rollAbilities: string[] = [];
    let rollSkills: string[] = [];
    let rollTools: string[] = [];
    let flagRollType: string | undefined;

    if (this.saveActivity?.save) {
      rollType = "save";
      flagRollType = "save";
      if (this.saveActivity.save.ability instanceof Set) {
        rollAbilities = Array.from(this.saveActivity.save.ability);
      }
      else {
        const ability = this.saveActivity.save.ability;
        if (ability) rollAbilities = [ability];
      }
      // @ts-expect-error no dnd5e-types
      rollAction = CONFIG.Actor.documentClass.prototype.rollSavingThrow;
    } else if (this.saveActivity?.check) {
      const associatedArray = Array.from(this.saveActivity.check.associated);
      // @ts-expect-error no dnd5e-types
      if (associatedArray.length === 0 && this.item.type === "tool") {
        // @ts-expect-error no dnd5e-types
        const baseItem = this.item.system.type.baseItem;
        if (baseItem) associatedArray.push(baseItem);
      }
      if (associatedArray.length === 0) {
        rollType = "check";
        const ability = this.saveActivity.check.ability;
        if (ability) rollAbilities = [ability];
        // @ts-expect-error no dnd5e-types
        rollAction = CONFIG.Actor.documentClass.prototype.rollAbilityCheck;
        flagRollType = "check";
      } else {
        // Classify entries as skills or tools
        const skills = associatedArray.filter(id => !!GameSystemConfig.skills[id]);

        if (skills.length > 0 && skills.length === associatedArray.length) {
          // All entries are skills
          rollType = "skill";
          rollSkills = skills;
          const ability = this.saveActivity?.getAbility?.(skills[0]);
          if (ability) rollAbilities = [ability];
          flagRollType = "skill";
          // @ts-expect-error no dnd5e-types
          rollAction = CONFIG.Actor.documentClass.prototype.rollSkill;
        } else if (skills.length === 0) {
          // All entries are tools
          // @ts-expect-error no dnd5e-types
          rollAction = CONFIG.Actor.documentClass.prototype.rollToolCheck;
          rollType = "tool";
          rollTools = associatedArray;
          const ability = this.saveActivity?.getAbility?.(associatedArray[0]);
          if (ability) rollAbilities = [ability];
          flagRollType = "tool";
        } else {
          // Mixed skills/tools — take first entry
          const first = associatedArray[0];
          if (GameSystemConfig.skills[first]) {
            rollType = "skill";
            rollSkills = [first];
            const ability = this.saveActivity?.getAbility?.(first);
            if (ability) rollAbilities = [ability];
            flagRollType = "skill";
            // @ts-expect-error no dnd5e-types
            rollAction = CONFIG.Actor.documentClass.prototype.rollSkill;
          } else {
            // @ts-expect-error no dnd5e-types
            rollAction = CONFIG.Actor.documentClass.prototype.rollToolCheck;
            rollType = "tool";
            rollTools = [first];
            const ability = this.saveActivity?.getAbility?.(first);
            if (ability) rollAbilities = [ability];
            flagRollType = "tool";
          }
        }
      }
    }

    return { rollAction, rollType, rollAbilities, rollSkills, rollTools, flagRollType };
  }

  /**
   * Build a Monks Token Bar save request for a target
   */
  buildMonksTokenBarRequest(target: Token, saveDetails: AnyMutableObject): MonksTokenBarRequest {
    // Monks TokenBar's getTokenEntries reads: token, advantage, disadvantage, request, fastForward.
    // dc/showdc are read from the top-level options (2nd arg to requestRoll), not per-token.
    // We don't pass fastForward — let Monks use its own bypass-roll-dialog setting instead.
    return {
      token: target.id ?? "",
      advantage: saveDetails.advantage as boolean | undefined,
      disadvantage: saveDetails.disadvantage as boolean | undefined,
    };
  }

  /**
   * Build a Flash Rolls 5e save request for a target
   */
  buildFlashRollsRequest(target: Token, saveDetails: AnyMutableObject): FlashRollsRequest {
    // dispatchFlashRollsSaves aggregates these into a single FlashAPI.requestRoll call,
    // reading only: token, advantage, disadvantage from per-target entries.
    return {
      token: target.id ?? "",
      advantage: saveDetails.advantage as boolean | undefined,
      disadvantage: saveDetails.disadvantage as boolean | undefined,
    };
  }

  /**
   * Build an Epic Rolls 5e save request for a target
   */
  buildEpicRollsRequest(target: Token, saveDetails: AnyMutableObject): EpicRollsRequest {
    return {
      actorUuid: (target.actor as Actor).uuid,
      advantage: saveDetails.advantage as boolean | undefined,
      disadvantage: saveDetails.disadvantage as boolean | undefined,
    };
  }

  /**
   * Dispatch save requests to Monks Token Bar
   */
  dispatchMonksTokenBarSaves(
    monkRequestsPlayer: MonksTokenBarRequest[],
    monkRequestsGM: MonksTokenBarRequest[],
    rollType: string,
    rollAbilities: string[],
    rollSkills: string[],
    rollDC: number | undefined,
    whisper: boolean,
  ): void {
    const monkRequests = monkRequestsPlayer.concat(monkRequestsGM);
    if (monkRequests.length === 0) return;

    // MTB request string format: "save:dex", "ability:str", "skill:prc"
    let request: string | undefined;
    if (rollType === "save") {
      request = `save:${rollAbilities[0]}`;
    } else if (rollType === "check") {
      request = rollAbilities[0] ? `ability:${rollAbilities[0]}` : `dice:1d20`;
    } else if (rollType === "skill") {
      request = `skill:${rollSkills[0]}`;
    }

    const showdc = shouldDisplaySaveDC(this.actor);

    // MTB requestRoll options only reads: request, silent, rollmode, dc, showdc, callback
    const buildRequestData = (tokenData: MonksTokenBarRequest[], rollMode: string): AnyMutableObject => {
      const requestData: AnyMutableObject = {
        tokenData,
        request,
        silent: true,
        showdc,
        rollMode,
      };
      if (showdc && "whisper" !== configSettings.autoCheckSaves) {
        requestData.dc = rollDC;
      }
      return requestData;
    };

    if (!whisper) {
      // monks-tokenbar uses the legacy roll-mode vocabulary ("roll" = public) — translate at the boundary.
      const rollMode = ((this.activity.midiProperties?.rollMode ?? "default") !== "default")
        ? toLegacyRollMode(this.activity.midiProperties!.rollMode)
        : "roll";
      timedExecuteAsGM("monksTokenBarSaves", buildRequestData(monkRequests, rollMode));
    } else {
      // Whisper mode - send GM and player requests separately with different roll modes
      const playerRollMode = ((this.activity.midiProperties?.rollMode ?? "default") !== "default")
        ? toLegacyRollMode(this.activity.midiProperties!.rollMode)
        : "roll";
      if (monkRequestsPlayer.length > 0) {
        timedExecuteAsGM("monksTokenBarSaves", buildRequestData(monkRequestsPlayer, playerRollMode));
      }
      if (monkRequestsGM.length > 0) {
        timedExecuteAsGM("monksTokenBarSaves", buildRequestData(monkRequestsGM, "gmroll"));
      }
    }
  }

  /**
   * Dispatch save requests to Flash Rolls 5e
   */
  dispatchFlashRollsSaves(
    flashRequestsPlayer: FlashRollsRequest[],
    flashRequestsGM: FlashRollsRequest[],
    rollType: string,
    rollAbilities: string[],
    rollSkills: string[],
    rollTools: string[],
    rollDC: number | undefined
  ): void {
    const flashRequests = flashRequestsPlayer.concat(flashRequestsGM);
    if (flashRequests.length === 0) return;

    // Determine Flash Token Bar requestType
    let flashRequestType: string;
    if (rollType === "save") {
      flashRequestType = "savingthrow";
    } else if (rollType === "check") {
      flashRequestType = "ability";
    } else if (rollType === "skill") {
      flashRequestType = "skill";
    } else if (rollType === "tool") {
      flashRequestType = "tool";
    } else {
      flashRequestType = "savingthrow"; // default
    }

    const flashRollKey = rollAbilities?.[0] ?? rollSkills?.[0] ?? rollTools?.[0];
    if (!flashRollKey) {
      flashRequestType = "custom";
    }
    const flashRequest = {
      requestType: flashRequestType,
      rollKey: flashRollKey ?? "1d20",
      actorIds: flashRequests.map(request => request.token),
      dc: rollDC,
      advantage: flashRequests.some(r => r.advantage) || undefined,
      disadvantage: flashRequests.some(r => r.disadvantage) || undefined,
      skipRollDialog: true,
      sendAsRequest: true,
      // flash-rolls-5e uses the legacy roll-mode vocabulary ("roll" = public) — translate at the boundary.
      rollMode: ((this.activity.midiProperties?.rollMode ?? "default") !== "default")
        ? toLegacyRollMode(this.activity.midiProperties!.rollMode)
        : "roll",
      workflowId: this.id,
    };

    timedExecuteAsGM("flashTokenBarSaves", flashRequest);
  }

  /**
   * Dispatch save requests to Epic Rolls 5e
   */
  dispatchEpicRollsSaves(
    rerRequestsPlayer: EpicRollsRequest[],
    rerRequestsGM: EpicRollsRequest[],
    rollType: string,
    rollDC: number | undefined
  ): void {
    //@ts-expect-error
    const BasicRoll = CONFIG.Dice.BasicRoll as typeof Roll;
    const rerRequests = rerRequestsPlayer.concat(rerRequestsGM);
    if (rerRequests.length === 0) return;

    const rerType = rollType;
    const abilityOrAssociated = this.saveActivity?.save?.ability.first() ?? this.saveActivity?.check?.associated.first();
    const type = abilityOrAssociated ? `${rerType}.${abilityOrAssociated}` : "custom";
    const rerRequest = {
      actors: rerRequests.map(request => request.actorUuid),
      contestants: [],
      type,
      options: {
        DC: rollDC,
        showDC: shouldDisplaySaveDC(this.actor),
        blindRoll: configSettings.autoCheckSaves === "whisper",
        showRollResults: false,
        hideNames: true,
        noMessage: true,
        ...(abilityOrAssociated ? {} : { formula: "1d20" }),
        rollSettings: rerRequests.map(request => ({
          advantage: request.advantage,
          disadvantage: request.disadvantage,
          uuid: request.actorUuid
        })),
      }
    };

    //@ts-expect-error
    ui.EpicRolls5e.requestRoll(rerRequest).then((rerResult: {
      cancelled: boolean;
      results: {
        actor: Actor.Implementation;
        roll: unknown;
      }[];
    }) => {
      if (rerResult.cancelled) {
        let roll = new BasicRoll("-1");
        roll = roll.evaluateSync({ strict: false });
        for (let uuid of rerRequest.actors) {
          const fn = this.saveRequests[uuid];
          delete this.saveRequests[uuid];
          fn(roll);
        }
      } else {
        for (let rerRoll of rerResult.results) {
          const actorUuid = rerRoll.actor.uuid;
          const fn = this.saveRequests[actorUuid];
          delete this.saveRequests[actorUuid];
          const roll = Roll.fromJSON(JSON.stringify(rerRoll.roll));
          fn(roll);
        }
      }
    });
  }

  /**
   * Create a player chat save request with timeout handling
   */
  createPlayerChatSaveRequest(
    target: Token,
    player: User,
    saveDetails: AnyMutableObject,
    rollType: string,
    rollAbilities: string[],
    rollSkills: string[],
    rollTools: string[],
    rollDC: number | undefined,
    showRoll: boolean,
    GMprompt: string,
    isMagicSave: boolean,
    rollAction: Function
  ): { promise: Promise<Roll[] | Roll | null>, requestCard: Promise<ChatMessage | undefined> | undefined } {
    const rollAbility = rollAbilities[0];
    const rollSkill = rollSkills[0];
    const rollTool = rollTools[0];
    //@ts-expect-error
    const BasicRoll = CONFIG.Dice.BasicRoll as typeof Roll;

    const requestId = target?.id ?? foundry.utils.randomID();
    const saveDisplay = (this.activity.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity.saveDisplay;

    const promise = new Promise<Roll[] | Roll | null>((resolve) => {
      this.saveRequests[requestId] = resolve;

      // Set a timeout for taking over the roll
      if (configSettings.playerSaveTimeout > 0) {
        this.saveTimeouts[requestId] = setTimeout(async () => {
          if (this.saveRequests[requestId]) {
            delete this.saveRequests[requestId];
            delete this.saveTimeouts[requestId];
            let result: Roll[] | null;

            // Only pass target DC if player should see success/failure (based on autoCheckSaves and visibility)
            const showTargetDC = configSettings.autoCheckSaves !== "whisper" && shouldDisplaySaveDC(this.actor);
            if (!game.user?.isGM && saveDisplay === "allShow") {
              // Non-GM users don't have permission to create chat cards impersonating the GM
              const rollMode = toMessageMode(this.activity.midiProperties?.rollMode);
              result = await timedAwaitExecuteAsGM("rollAbility", {
                saveDetails,
                displayOptions: {
                  fastForward: true,
                  chatMessage: showRoll,
                  rollMode,
                  showTargetDC
                }
              });
            } else {
              let config: AnyMutableObject = {
                target: showTargetDC ? rollDC : undefined,
                ability: rollAbility,
                skill: rollSkill,
                midiOptions: {
                  workflowId: this.id,
                  itemCardUuid: this.itemCardUuid,
                  advantage: saveDetails.advantage,
                  disadvantage: saveDetails.disadvantage,
                  mapKeys: false,
                  // Timeout: auto-resolve with best choice, patching.ts handles multi-choice auto-selection
                  fastForward: true,
                  recomputeAdvantage: true, // compute advantage/disadvantage from flags in roll function
                  saveItemUuid: this.saveItem?.uuid,
                  isConcentrationCheck: saveDetails.isConcentrationCheck,
                  workflowOptions: saveDetails.workflowOptions,
                  rollAbilities,
                  rollSkills,
                  rollTools,
                  advantageByChoice: saveDetails.advantageByChoice
                }
              };
              let dialog: AnyObject = { ability: rollAbility, skill: rollSkill, tool: rollTool };
              let message: AnyObject = { create: showRoll };
              if (rollType === "tool") {
                let tool = target.actor?.items.get(this.saveActivity?.item.id ?? "");
                //@ts-expect-error no dnd5e types
                if (!tool) tool = target.actor?.items.find(i => i.type === "tool" && i.system.type.baseItem === rollTool);
                if (!tool) {
                  // No tool of the requested type - auto fail
                  resolve([await new BasicRoll("-1").evaluate()]);
                  return;
                } else {
                  //@ts-expect-error no dnd5e-types
                  config.bonus = tool.system.bonus;
                  //@ts-expect-error no dnd5e-types
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
    });

    const requestCard = requestPCSave(
      rollAbility ?? "",
      rollType,
      player.id!,
      target.actor,
      {
        flavor: this.item.name ?? "",
        requestId,
        GMprompt,
        isMagicSave: !!isMagicSave,
        rollAbilities,
        rollSkills,
        rollTools,
        saveDetails: saveDetails as pcSaveOptions["saveDetails"]
      }
    );

    return { promise, requestCard };
  }

  /**
   * Create a standard socketlib save roll
   */
  createStandardSaveRoll(
    target: Token,
    saveDetails: SaveDetails,
    whisper: boolean,
    showRoll: boolean,
    showRollDialog: boolean,
    simulate: boolean
  ): Promise<Roll[] | Roll | null> {
    const { rollType, rollAbilities = [] } = saveDetails;
    // Validate abilities for save/check types
    if (rollType === "save" && rollAbilities.length === 0) {
      console.warn(`midi-qol | createStandardSaveRoll called with rollType=save but no abilities`);
      return Promise.resolve(null);
    }
    // Find a player owner for the roll if possible
    let owner = playerFor(target);
    if (!owner?.isGM && owner?.active) showRoll = true; // Always show player save rolls
    if (!owner?.active) owner = preferredActiveGM();
    // Fall back to rolling as the current user
    if (!owner) owner = game.user;

    let rollMode = ((this.activity.midiProperties?.rollMode ?? "default") !== "default")
      ? toMessageMode(this.activity.midiProperties!.rollMode)
      : whisper ? "gm" : "public";

    if (!owner?.isGM) {
      if ((this.activity.midiProperties?.rollMode ?? "default") === "default") {
        if (["noneDialogPublic", "nonePublic"].includes(configSettings.playerRollSaves)) {
          rollMode = "public";
        } else if (["noneDialogPrivate", "none"].includes(configSettings.playerRollSaves)) {
          rollMode = "gm";
        } else if (configSettings.playerRollSaves === "noneDialogSelf") {
          rollMode = "self";
        } else if (configSettings.playerRollSaves === "noneDialogBlind") {
          rollMode = "blind";
        }
      }
    }

    // dnd5e challengeVisibility: when an NPC target's challenge should be hidden from players
    // (visibility "player"/"none"), keep its save-roll chat card private to the GM — otherwise under
    // autoCheckSaves "allShow" the dnd5e card is created public. Respect an explicit activity rollMode.
    if ((this.activity.midiProperties?.rollMode ?? "default") === "default"
      && !target.actor?.hasPlayerOwner
      && !shouldDisplaySaveDC(target.actor as Actor)
      && ["public", "ic"].includes(rollMode)) {
      rollMode = "gm";
    }

    // Only pass target DC if player should see success/failure (based on autoCheckSaves and visibility)
    // GM always sees DC, non-GM only when visibility allows and not whisper mode
    const showTargetDC = owner?.isGM || (configSettings.autoCheckSaves !== "whisper" && shouldDisplaySaveDC(this.actor));
    return socketlibSocket.executeAsUser("rollAbility", owner?.id, {
      saveDetails,
      displayOptions: {
        fastForward: simulate || !showRollDialog,
        chatMessage: showRoll,
        rollMode,
        showTargetDC
      }
    });
  }

  /**
   * Queue a target's save roll to the appropriate handler based on settings
   * Returns the promise and optionally adds to module-specific request arrays
   */
  queueTargetSaveRoll(options: QueueSaveRollOptions): { promise: Promise<Roll[] | Roll | null> | null, requestCard: Promise<ChatMessage | undefined> | undefined } {
    const { target, saveDetails, rollInfo, isMagicSave, displayOptions, playerInfo, moduleFlags, moduleRequests } = options;
    const { type: rollType, abilities: rollAbilities, skills: rollSkills, tools: rollTools, action: rollAction } = rollInfo;
    const { whisper, showRoll, showRollDialog, simulate } = displayOptions;
    const { player, GMprompt, playerChat } = playerInfo;
    const { playerMonksTB, playerFlashTB, playerEpicRolls, gmMonksTB, gmFlashTB, gmRER } = moduleFlags;
    // Check for friendly roll first
    const friendlyRoll = this.getFriendlyTargetRoll(saveDetails as { isFriendly: boolean });
    if (friendlyRoll) {
      return { promise: friendlyRoll, requestCard: undefined };
    }

    // Monks Token Bar
    if ((!player?.isGM && playerMonksTB) || (player?.isGM && gmMonksTB)) {
      const promise = new Promise<Roll[] | Roll | null>((resolve) => {
        let requestId = target.id ?? foundry.utils.randomID();
        this.saveRequests[requestId] = resolve;
      });

      const requests = player?.isGM ? moduleRequests.monks.gm : moduleRequests.monks.player;
      requests.push(this.buildMonksTokenBarRequest(target, saveDetails));
      return { promise, requestCard: undefined };
    }

    // Flash Rolls 5e
    if ((!player?.isGM && playerFlashTB) || (player?.isGM && gmFlashTB)) {
      const promise = new Promise<Roll[] | Roll | null>((resolve) => {
        let requestId = target.actor?.uuid ?? foundry.utils.randomID();
        this.saveRequests[requestId] = resolve;
      });

      const requests = player?.isGM ? moduleRequests.flash.gm : moduleRequests.flash.player;
      requests.push(this.buildFlashRollsRequest(target, saveDetails));
      return { promise, requestCard: undefined };
    }

    // Epic Rolls 5e
    if ((!player?.isGM && playerEpicRolls) || (player?.isGM && gmRER)) {
      const promise = new Promise<Roll[] | Roll | null>((resolve) => {
        let requestId = target.actor?.uuid ?? foundry.utils.randomID();
        this.saveRequests[requestId] = resolve;
      });

      const requests = player?.isGM ? moduleRequests.epic.gm : moduleRequests.epic.player;
      requests.push(this.buildEpicRollsRequest(target, saveDetails));
      return { promise, requestCard: undefined };
    }

    // Player Chat save request
    if ((player?.active && playerChat) || (player?.isGM && GMprompt === "none")) {
      if (debugEnabled > 0) {
        warn(`checkSaves | Player ${player?.name} controls actor ${(target.actor as Actor).name} - requesting ${rollAbilities[0]} ${rollType}`);
      }
      const result = this.createPlayerChatSaveRequest(
        target, player!, saveDetails, rollType, rollAbilities, rollSkills, rollTools, saveDetails.rollDC as number | undefined,
        showRoll, GMprompt, isMagicSave, rollAction
      );
      return { promise: result.promise, requestCard: result.requestCard };
    }

    // Standard socketlib roll
    const promise = this.createStandardSaveRoll(
      target, saveDetails, whisper, showRoll, showRollDialog, simulate
    );
    return { promise, requestCard: undefined };
  }

  /**
   * Process a single target's save result - determine if saved, apply bonuses, update tracking sets
   */
  async processTargetSaveResult(
    target: Token,
    result: Roll[],
    context: ProcessTargetSaveContext
  ): Promise<void> {
    const { rollDC, rollAbility, rollType, template, templateCoverOrigin, D20Roll } = context;

    let saveRollTotal = result.reduce((acc, r) => acc + r.total!, 0);
    let saveRolls = result;
    this.updateAdvantageTrackingFromRoll(target, result);
    let { isFumble, isCritical } = this.determineCriticalOrFumble(saveRolls[0], saveRollTotal);
    const coverSaveBonus = await this.calculateCoverSaveBonus(target, template, rollAbility, templateCoverOrigin);
    if (coverSaveBonus > 0 && coverSaveBonus < TOTAL_COVER && saveRolls[0]) {
      // Inject cover bonus into the roll so it's visible in the roll tooltip
      const OperatorTerm = foundry.dice.terms.OperatorTerm;
      const NumericTerm = foundry.dice.terms.NumericTerm;
      saveRolls[0].terms.push(
        new OperatorTerm({ operator: "+" }),
        new NumericTerm({ number: coverSaveBonus, options: { flavor: i18n("DND5E.Cover") } })
      );
      saveRolls[0].resetFormula();
      //@ts-expect-error _total is protected
      saveRolls[0]._total += coverSaveBonus;
      saveRollTotal += coverSaveBonus;
    }

    // Adjust the save dc if something changed it during the roll
    let resultDC = rollDC ?? 0;
    // @ts-expect-error no dnd5e-types
    if (Number.isNumeric(result[0]?.options.target)) resultDC = result[0]!.options.target;
    let saved = saveRollTotal >= resultDC;

    if (checkRule("criticalSaves")) {
      saved = (isCritical || saveRollTotal >= resultDC) && !isFumble;
    }
    if (this.checkSculptOrCarefulSpells(target)) {
      saved = true;
    }
    if (coverSaveBonus >= TOTAL_COVER) {
      saved = true;
    }

    this.updateSaveFailSets(target, saved);

    if (!this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
      if (saved)
        await doReactions(target, this.tokenUuid, this.attackRoll, "reactionsavesuccess", { workflow: this, activity: this.activity, item: this.item })
      else
        await doReactions(target, this.tokenUuid, this.attackRoll, "reactionsavefail", { workflow: this, activity: this.activity, item: this.item })
    }
    if (isCritical) this.criticalSaves = this.criticalSaves.add(target);

    // Trigger target macros that might modify the roll
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) {
      const rollResults = await this.triggerTargetMacros(["isSave", "isSaveSuccess", "isSaveFailure"], new Set([target]), { saved }) as Record<string, Roll[]>;
      const newRolls = rollResults[target.document.uuid];
      if (newRolls?.[0] instanceof Roll) {
        saveRolls = newRolls;
        saveRollTotal = newRolls.reduce((acc, r) => acc + (r?.total ?? 0), 0);
        saved = saveRollTotal >= resultDC;
        ({ isFumble, isCritical } = this.determineCriticalOrFumble(saveRolls[0], saveRollTotal));
      }
    }

    // Apply fail bonuses if the save failed
    // @ts-expect-error no dnd5e-types
    if (!(result[0] instanceof D20Roll)) result[0] = D20Roll.fromRoll(result[0]);
    // @ts-expect-error no dnd5e-types
    if (!saved && !Number.isNumeric(result[0].options.target)) {
      const failBonusResult = await this.applyFailedSaveBonuses(target, result, saveRolls, rollType ?? "", rollAbility ?? "");
      if (failBonusResult) {
        saveRolls = failBonusResult.saveRolls;
        saveRollTotal = failBonusResult.saveRollTotal;
        saved = saveRollTotal >= resultDC;
        ({ isFumble, isCritical } = this.determineCriticalOrFumble(saveRolls[0], saveRollTotal));
      }
    }

    if (isFumble) this.fumbleSaves = this.fumbleSaves.add(target);
    if (isCritical) this.criticalSaves = this.criticalSaves.add(target);
    // Use only the actually-chosen ability (from midiChosenId or rollAbility), not all abilities from the activity
    const saveAbilities = rollAbility ? new Set([rollAbility]) : this.saveActivity?.save?.ability;
    if (await this.checkSuperSaver(target, saveAbilities))
      this.superSavers = this.superSavers.add(target);
    if (await this.checkSemiSuperSaver(target, saveAbilities))
      this.semiSuperSavers = this.semiSuperSavers.add(target);

    // Apply concentration save bonus if applicable
    const concentrationResult = await this.applyConcentrationSaveBonus(target, saveRolls[0], resultDC, isCritical, isFumble);
    if (concentrationResult) {
      saveRolls[0] = concentrationResult.saveRoll;
      saveRollTotal = concentrationResult.saveRollTotal;
      saved = concentrationResult.saved;
    }

    this.updateSaveFailSets(target, saved);

    if (game.user?.isGM) log(`Ability save/check: ${target.name} rolled ${saveRollTotal} vs ${rollAbility} DC ${rollDC}`);
    await this.buildSaveDisplayEntry(target, saveRolls[0], saved, rollDC, coverSaveBonus);
  }

  /**
   * Update the saves and failedSaves sets based on whether the target saved
   */
  updateSaveFailSets(target: Token, saved: boolean): void {
    if (saved) {
      this.saves = this.saves.add(target);
      this.failedSaves.delete(target);
      this.failedSaves = this.failedSaves;
    } else {
      this.saves.delete(target);
      this.saves = this.saves;
      this.failedSaves = this.failedSaves.add(target);
    }
  }

  /**
   * Apply fail bonuses (flags.midi-qol.save.fail) if the save failed
   */
  async applyFailedSaveBonuses(
    target: Token,
    result: Roll[],
    saveRolls: Roll[],
    rollType: string,
    rollAbility: string
  ): Promise<{ saveRolls: Roll[], saveRollTotal: number } | null> {
    const failFlagsLength = collectBonusFlags(target.actor!, rollType, "fail.all").length;
    const failAbilityFlagsLength = collectBonusFlags(target.actor!, rollType, `fail.${rollAbility}`).length;

    if (!failFlagsLength && !failAbilityFlagsLength) return null;

    // If the roll fails and there is a flags.midi-qol.save.fail then apply the bonus
    let owner = playerFor(target);
    if (!owner?.active) owner = game.users?.find((u: User) => u.isGM && u.active);
    if (!owner) return null;

    let newRoll: Roll;
    if (owner?.isGM && game.user?.isGM) {
      newRoll = await bonusCheck(target.actor!, result[0], rollType, failAbilityFlagsLength ? `fail.${rollAbility}` : "fail.all");
    } else {
      newRoll = await socketlibSocket.executeAsUser("bonusCheck", owner?.id, {
        actorUuid: (target.actor as Actor).uuid,
        result: JSON.stringify(result[0].toJSON()),
        rollType,
        selector: failFlagsLength ? "fail.all" : `fail.${rollAbility}`
      });
    }

    const updatedSaveRolls = [...saveRolls];
    updatedSaveRolls[0] = Roll.fromJSON(JSON.stringify(newRoll)) as Roll<EmptyObject>;
    const saveRollTotal = updatedSaveRolls.reduce((acc, r) => acc + r.total!, 0);

    return { saveRolls: updatedSaveRolls, saveRollTotal };
  }

  /**
   * Compute module integration settings for save rolls (Monks TB, Flash Rolls, Epic Rolls)
   */
  computeModuleIntegrationSettings(simulate: boolean, flagRollType: string): {
    flags: ModuleIntegrationFlags;
    requests: ModuleIntegrationRequests;
  } {
    const playerMonksTB = !simulate && flagRollType !== "tool" && !!installedModules.get("monks-tokenbar") && configSettings.playerRollSaves === "mtb";
    const playerFlashTB = !simulate && !!installedModules.get("flash-rolls-5e") && configSettings.playerRollSaves === "ftb";
    const playerEpicRolls = !simulate && !!installedModules.get("epic-rolls-5e") && configSettings.playerRollSaves === "rer";

    return {
      flags: {
        playerMonksTB,
        playerFlashTB,
        playerEpicRolls,
        gmMonksTB: false,  // Set per-target in determineTargetRollSettings
        gmFlashTB: false,
        gmRER: false
      },
      requests: {
        monks: { player: [], gm: [] },
        flash: { player: [], gm: [] },
        epic: { player: [], gm: [] }
      }
    };
  }

  /**
   * Build SaveDetails for a target, including magic resistance/vulnerability and advantage checks.
   * When multiple choices are available (abilities, skills, or tools), pre-computes advantage
   * for each option and stores results in saveDetails.advantageByChoice.
   * A roll is always ONE type, so a single map suffices.
   */
  async buildSaveDetailsForTarget(
    target: Token,
    context: {
      rollDC: number | undefined;
      rollType: string | undefined;
      rollAbilities: string[];
      rollSkills: string[];
      rollTools: string[];
      flagRollType: string;
      isMagicSave: boolean;
      actorDisposition: number;
    }
  ): Promise<SaveDetails> {
    const { rollDC, rollType, isMagicSave, actorDisposition, rollAbilities, rollSkills, rollTools } = context;
    const targetDocument = target.document;

    const saveDetails: SaveDetails = {
      actorUuid: target.actor?.uuid ?? "",
      advantage: undefined,
      disadvantage: undefined,
      modifierTracker: undefined,
      isMagicSave: !!isMagicSave,
      isFriendly: targetDocument?.disposition === actorDisposition,
      isConcentrationCheck: undefined,
      rollDC: rollDC ?? 0,
      saveItemUuid: this.saveItem?.uuid ?? "",
      workflowId: this.id,
      itemCardUuid: this.itemCardUuid ?? "",
      workflowOptions: this.workflowOptions,
      rollType: rollType ?? "save",
      rollAbilities,
      rollSkills,
      rollTools,
      itemId: this.saveActivity?.item.id ?? "",
    };

    // Check ability advantage/disadvantage from settings, source grants flags, and magic resistance/vulnerability
    // Use the shared helper to compute full trackers (advantage + roll modifiers) for all abilities
    const abilityId = this.saveActivity!.save?.ability?.first() ?? this.saveActivity!.check?.ability ?? "";
    const preComputedMap = await buildPreComputedAdvantageMap(
      target.actor!,
      rollType ?? "",
      rollAbilities,
      { workflow: this, isMagicSave: !!isMagicSave }
    );

    // Get the default ability's tracker for saveDetails
    const defaultAbilityData = preComputedMap[abilityId];
    // tracker is always a RollModifierTracker instance here (before socketlib serialization)
    saveDetails.modifierTracker = defaultAbilityData?.tracker instanceof RollModifierTracker ? defaultAbilityData.tracker : undefined;
    saveDetails.advantage = defaultAbilityData?.hasAdvantage;
    saveDetails.disadvantage = defaultAbilityData?.hasDisadvantage;
    saveDetails.isConcentrationCheck = this.item.flags?.[MODULE_ID]?.isConcentrationCheck;

    // Pre-compute advantage for all choices when multiple are available.
    // A roll is always ONE type (save, skill check, or tool check), so we use a single object.
    // tracker.toJSON() is called automatically during socketlib transmission; GMAction reconstructs.
    const multipleChoices = rollAbilities.length > 1 || rollSkills.length > 1 || rollTools.length > 1;
    if (multipleChoices) {
      // Determine which type has multiple choices and build the object
      let choiceMap: Record<string, PreComputedAdvantage>;
      if (rollAbilities.length > 1) {
        // Already computed above for abilities
        choiceMap = preComputedMap;
      } else if (rollSkills.length > 1) {
        choiceMap = await buildPreComputedAdvantageMap(
          target.actor!,
          "skill",
          rollSkills,
          { workflow: this, isMagicSave: false }
        );
      } else {
        choiceMap = await buildPreComputedAdvantageMap(
          target.actor!,
          "tool",
          rollTools,
          { workflow: this, isMagicSave: false }
        );
      }

      // Copy the choice map data to saveDetails (tracker is always an instance here, before socketlib)
      saveDetails.advantageByChoice = choiceMap;
    }

    // Check for friendly target auto-fail/success from activity settings
    if (saveDetails.isFriendly && saveDetails.modifierTracker) {
      // @ts-expect-error no dnd5e-types
      const descriptionIncludesAutoFail = this.item.system.description?.value?.toLowerCase().includes(i18n("midi-qol.autoFailFriendly")?.toLowerCase());
      if (descriptionIncludesAutoFail || this.activity.friendlySave === "friendlyFail") {
        saveDetails.modifierTracker.addAttribution('FAIL', "friendlyFail", i18n("midi-qol.FriendlyAutoFail"));
      } else if (this.activity.friendlySave === "friendlySuccess") {
        saveDetails.modifierTracker.addAttribution('SUCCESS', "friendlySuccess", i18n("midi-qol.FriendlyAutoSuccess"));
      }
    }

    // Update advantage/disadvantage tracking sets
    if (saveDetails.advantage && !saveDetails.disadvantage) this.advantageSaves = this.advantageSaves.add(target);
    else if (saveDetails.disadvantage && !saveDetails.advantage) this.disadvantageSaves?.add(target);

    return saveDetails;
  }

  /**
   * Normalize roll results to ensure they are all Roll[] arrays
   */
  normalizeRollResults(results: (Roll | Roll[] | null)[], D20Roll: typeof Roll): Roll[][] {
    const normalized: Roll[][] = [];
    for (let i = 0; i < results.length; i++) {
      const currResult = results[i];
      if (currResult instanceof Roll) {
        normalized[i] = [currResult];
      } else if (currResult instanceof Array) {
        normalized[i] = currResult.map(r => {
          if (!(r instanceof Roll)) {
            return D20Roll.fromJSON(JSON.stringify(r)) as Roll<EmptyObject>;
          }
          return r;
        });
      } else {
        normalized[i] = [];
      }
    }
    return normalized;
  }

  /**
   * update this.saves to be a Set of successful saves from the set of tokens this.hitTargets and failed saves to be the complement
   */

  async checkSaves(whisper = false, simulate = false) {
    this.initSaveResults();
    this.targetSaveDetails = {};
    if (debugEnabled > 1) debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)
    if (this.hitTargets.size <= 0 && this.hitTargetsEC.size <= 0) {
      this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`
      return;
    }

    if (!this.saveActivity) return;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    if (allHitTargets.size === 0) return;
    let rollDC = this.saveActivity?.save?.dc.value ?? this.saveActivity?.check?.dc.value;
    //@ts-expect-error
    const D20Roll = CONFIG.Dice.D20Roll as typeof Roll;

    this.saveDC = rollDC;
    const requestCards: Array<Promise<ChatMessage | undefined> | undefined> = [];
    let promises: Promise<Roll[] | Roll | null>[] = [];
    const { rollAction, rollType, rollAbilities, rollSkills, rollTools, flagRollType } = this.determineRollTypeAndAction();
    if (!rollAction) return; // No save or check configured on activity

    // Validate that abilities are set for save types (checks can be plain d20 with no ability)
    if (rollType === "save" && rollAbilities.length === 0) {
      console.warn(`midi-qol | ${this.item.name} ${this.saveActivity?.name} has a save activity but no ability configured`);
      return;
    }

    const { flags: moduleFlags, requests: moduleRequests } = this.computeModuleIntegrationSettings(simulate, flagRollType ?? "");
    const { playerMonksTB, playerFlashTB, playerEpicRolls } = moduleFlags;
    const saveDisplay = (this.activity.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity.saveDisplay;
    // @ts-expect-error no dnd5e-types
    const isMagicSave = this.item.type === "spell" || this.activity.midiProperties?.magicEffect;

    try {
      let actorDisposition: number;
      if (this.token && this.token.document?.disposition !== undefined) actorDisposition = this.token.document.disposition;
      else { // no token to use so make a guess
        // @ts-expect-error no dnd5e-types
        actorDisposition = this.actor.type === "npc" ? -1 : 1;
      }

      for (let target of allHitTargets) {
        if (!target || !target?.actor) continue;
        let showRoll = saveDisplay === "allShow";
        if (simulate) showRoll = false;
        if (!this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
          await doReactions(target, this.tokenUuid, this.attackRoll ?? new Roll(""), "reactionsave", { workflow: this, activity: this.activity, item: this.item })
        }

        // Build save details for this target
        const saveDetails = await this.buildSaveDetailsForTarget(target, {
          rollDC,
          rollType,
          rollAbilities,
          rollSkills,
          rollTools,
          flagRollType: flagRollType ?? "",
          isMagicSave: !!isMagicSave,
          actorDisposition
        });

        // Determine roll settings for this target
        const { player, showRollDialog, GMprompt, gmMonksTB, gmFlashTB, gmRER, playerChat } =
          this.determineTargetRollSettings(target, flagRollType, simulate);

        this.saveDetails = saveDetails;
        // Store per-target saveDetails for later retrieval during result processing
        const targetDocUuid = getTokenDocument(target)?.uuid;
        if (targetDocUuid && this.targetSaveDetails) this.targetSaveDetails[targetDocUuid] = saveDetails;
        // Call preTargetSave hook - allows external modules to modify saveDetails/tracker before the roll
        await asyncHooksCallAll("midi-qol.preTargetSave", target, this, saveDetails);
        if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["preTargetSave"], new Set([target]));

        // Queue the save roll using the appropriate handler
        const { promise, requestCard } = this.queueTargetSaveRoll({
          target,
          saveDetails,
          rollInfo: {
            type: rollType ?? "save",
            abilities: rollAbilities,
            skills: rollSkills,
            tools: rollTools,
            action: rollAction
          },
          isMagicSave: !!isMagicSave,
          displayOptions: {
            whisper,
            showRoll,
            showRollDialog,
            simulate
          },
          playerInfo: {
            player,
            GMprompt: typeof GMprompt === "string" ? GMprompt : "none",
            playerChat
          },
          moduleFlags: {
            playerMonksTB,
            playerFlashTB,
            playerEpicRolls,
            gmMonksTB: gmMonksTB ?? false,
            gmFlashTB: gmFlashTB ?? false,
            gmRER: gmRER ?? false
          },
          moduleRequests
        });

        if (promise) promises.push(promise);
        if (requestCard) requestCards.push(requestCard);
      }
    } catch (err) {
      TroubleShooter.recordError(err);
      console.warn(err)
    }

    // Dispatch batched requests to external modules
    this.dispatchMonksTokenBarSaves(
      moduleRequests.monks.player, moduleRequests.monks.gm,
      rollType ?? "save", rollAbilities, rollSkills, rollDC,
      whisper,
    );
    this.dispatchFlashRollsSaves(
      moduleRequests.flash.player, moduleRequests.flash.gm,
      rollType ?? "save", rollAbilities, rollSkills, rollTools, rollDC
    );
    this.dispatchEpicRollsSaves(
      moduleRequests.epic.player, moduleRequests.epic.gm,
      rollType ?? "save", rollDC
    );

    if (debugEnabled > 1) debug("check saves: requests are ", this.saveRequests)
    const rawResults = await Promise.all(promises);
    (await Promise.all(requestCards)).forEach(chatMessage => chatMessage?.delete());
    const epicRequests = moduleRequests.epic.player.concat(moduleRequests.epic.gm);
    if (epicRequests?.length > 0) await busyWait(10);
    // Keep saveDetails for the last target (used for attribution tracking)
    const results = this.normalizeRollResults(rawResults, D20Roll);
    this.saveResults = results.filter(r => !!r).flat();

    // Get template for area target saves (also when templateUuid is set explicitly via midiOptions)
    // v14: templates are backed by Regions — resolve either type for cover origin
    let template: foundry.canvas.placeables.MeasuredTemplate.Implementation | undefined | null;
    let templateCoverOrigin: { x: number, y: number, elevation?: number } | undefined;
    if (this.templateUuid) {
      const doc = await fromUuid(this.templateUuid);
      if (doc?.documentName === "Region") {
        // v14 Region-backed template: extract cover origin from shape data
        const regionDoc = doc as RegionDocument.Implementation;
        const shape = regionDoc.shapes?.at?.(0) as any;
        if (shape) {
          templateCoverOrigin = { x: shape.x ?? 0, y: shape.y ?? 0 };
          if (shape.type === "rectangle") {
            templateCoverOrigin.x += (shape.width ?? 0) / 2;
            templateCoverOrigin.y += (shape.height ?? 0) / 2;
          }
          templateCoverOrigin.elevation = regionDoc.elevation?.bottom ?? 0;
        }
      } else {
        const templateDoc = doc as MeasuredTemplateDocument | null;
        template = templateDoc?.object ?? undefined;
        // If we have a placeable, compute cover origin from it
        if (template) {
          templateCoverOrigin = foundry.utils.duplicate(template.center);
          const dimensions = canvas.dimensions;
          if (template.document.t === "rect") {
            templateCoverOrigin.x += (template.document.width ?? 1) / (dimensions?.distance ?? 5) / 2 * (dimensions?.size ?? 100);
            templateCoverOrigin.y += (template.document.width ?? 1) / (dimensions?.distance ?? 5) / 2 * (dimensions?.size ?? 100);
          }
          templateCoverOrigin.elevation = template.document.elevation;
        }
      }
    }

    // Process each target's save result
    const processContext = { rollDC, rollAbility: rollAbilities[0], rollType, template, templateCoverOrigin, D20Roll };
    let i = 0;
    for (let target of allHitTargets) {
      if (!target.actor) continue; // these were skipped when doing the rolls so they can be skipped now

      // Ensure we have a valid result array
      if (!results[i]?.[0] || results[i]?.[0]?.total === undefined) {
        const message = `Token ${target.name} could not roll save/check assuming 1`;
        error(message, target);
        TroubleShooter.recordError(new Error(message), message);
        results[i] = [await new D20Roll("1").evaluate()];
      }

      const tmpResult = results[i];
      const result = tmpResult instanceof Array
        ? tmpResult
        : tmpResult
          ? [tmpResult]
          : [new D20Roll("1").evaluateSync()];

      // Update rollAbility to the actually-chosen ability from the roll's midiChosenId
      //@ts-expect-error midiChosenId is a custom roll option
      const midiChosenId: string | undefined = result[0]?.options?.midiChosenId;
      if (midiChosenId) processContext.rollAbility = midiChosenId;

      await this.processTargetSaveResult(target, result, processContext);
      i++;
    }

    this.saveDisplayFlavor = await this.computeSaveDisplayFlavor(rollDC, rollType ?? "", { rollAbilities: rollAbilities ?? [], rollSkills: rollSkills ?? [], rollTools: rollTools ?? [] });
  }


  async computeSaveDisplayFlavor(rollDC: number | undefined, rollType: string, options: { rollAbilities: string[], rollSkills: string[], rollTools: string[] }): Promise<string> {
    let { rollAbilities, rollSkills, rollTools } = options;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    let DCString = i18n("DND5E.AbbreviationDC") ?? "DC";
    if (DCString === "DND5E.AbbreviationDC") DCString = "DC";
    DCString = `${DCString} ${rollDC}`;
    if ((rollDC ?? -1) === -1) DCString = "";
    const dcLabel = `<label class="midi-qol-saveDC">${DCString}</label>`;

    if (rollType === "save") {
      const throwLabel = i18n(allHitTargets.size > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw");
      const lines = rollAbilities.map(ability =>
        `${dcLabel} ${GameSystemConfig.abilities[ability]?.label ?? ability} ${throwLabel}`
      );
      return lines.join("<br>");
    } else if (rollType === "check") {
      if (rollAbilities.length === 0) {
        return `${dcLabel} ${i18n("midi-qol.plain-d20-roll")}:`;
      }
      const checkLabel = i18n(allHitTargets.size > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check");
      const lines = rollAbilities.map(ability =>
        `${dcLabel} ${GameSystemConfig.abilities[ability]?.label ?? ability} ${checkLabel}:`
      );
      return lines.join("<br>");
    } else if (rollType === "skill") {
      const lines = rollSkills.map(skill =>
        `${dcLabel} ${GameSystemConfig.skills[skill]?.label ?? skill}`
      );
      return lines.join("<br>");
    } else if (rollType === "tool") {
      const lines: string[] = [];
      for (const tool of rollTools) {
        //@ts-expect-error no dnd5e-types
        const toolLabel = await game.system?.documents.Trait.keyLabel(`tool:${tool}`);
        lines.push(`${dcLabel} ${toolLabel}`);
      }
      return lines.join("<br>");
    }
    return "";
  }

  monksSavingCheck(message: ChatMessage.Implementation, update: ChatMessage.UpdateData, _options: ChatMessage.Database.UpdateOptions, _userId: string) {
    if (!update.flags || !update.flags["monks-tokenbar"]) return true;
    const mflags = message.flags["monks-tokenbar"];
    for (let key of Object.keys(mflags)) {
      if (!key.startsWith("token")) continue;
      if (!mflags[key].roll) continue;
      const requestId = key.replace("token", "");
      if (!mflags[key].reveal) continue; // Must be showing the roll
      if (this.saveRequests[requestId]) {
        let roll: Roll.Any;
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

  flashSavingCheck(data: { actorUuid: string; roll: Roll.Any; total: number }) {
    if (debugEnabled > 0) debug(`flashSavingCheck | Received roll for ${data.actorUuid}`, data);
    if (debugEnabled > 0) debug(`flashSavingCheck | Available saveRequests keys:`, Object.keys(this.saveRequests));

    const requestId = data.actorUuid;
    if (!this.saveRequests[requestId]) {
      if (debugEnabled > 0) debug(`flashSavingCheck | No pending request for ${requestId}`);
      return;
    }

    const func = this.saveRequests[requestId];
    delete this.saveRequests[requestId];
    if (debugEnabled > 0) debug(`flashSavingCheck | Resolving save for ${requestId} with roll total ${data.total}`);
    func(data.roll);
  }

  async displayChatCardWithoutDamageDetail() {
    let chatMessage = getCachedDocument(this.itemCardUuid) as ChatMessage.Implementation | undefined;
    let data: ChatMessage.CreateData | undefined;
    if (chatMessage?.content) {
      let content = chatMessage.content;
      data = chatMessage!.toObject();
      content = data.content || "";
      let searchRe = /<div[^>]*?class="midi-qol-damage-roll[^"]*"[\s\S]*?<div class="end-midi-qol-damage-roll">/;
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
      }
      delete data._id;
      const itemCard = await CONFIG.ChatMessage.documentClass.create(data);
      this.itemCardUuid = itemCard?.uuid;
    }
  }

  async callDamageHooksAndMacros(damages: DamageListEntry, token: Token.Implementation) {
    this.damageItem = damages;
    if (configSettings.allowUseMacro && !this.workflowOptions?.noTargetOnUseMacro && this.item.flags) {
      await this.triggerTargetMacros(["preTargetDamageApplication"], new Set([token]));
    }
    await asyncHooksCallAll(`midi-qol.preTargetDamageApplication`, token, { item: this.item, workflow: this, damageItem: damages, ditem: damages });

    if ((damages.hpDamage !== 0 || damages.tempDamage > 0) && (this.hitTargets.has(token) || this.hitTargetsEC.has(token) || this.otherActivity?.save || this.otherActivity?.check)) {
      let healedDamaged = damages.hpDamage < 0 ? "isHealed" : "isDamaged";
      await asyncHooksCallAll(`midi-qol.${healedDamaged}`, token, { item: this.item, workflow: this, damageItem: damages, ditem: damages });
      const actorOnUseMacros = foundry.utils.getProperty(token.actor ?? {}, midiFlag(`onUseMacroParts`)) as OnUseMacros ?? new OnUseMacros();
      // It seems applyTokenDamageMany without a this gets through to here - so a silly guard in place TODO come back and fix this properly
      if (this.callMacros) await this.callMacros(this.item,
        actorOnUseMacros?.getMacros(healedDamaged),
        "TargetOnUse",
        healedDamaged,
        { actor: token.actor, token: token });
      healedDamaged = damages.hpDamage < 0 ? "isHealed" : "isDamaged";  //recalculate what the total damage and trigger the correct special duration expiration.
      const expiredEffects = getAppliedEffects(token?.actor, { includeEnchantments: true }).filter(ef => {
        const specialDuration = ef.flags?.dae?.specialDuration;
        if (!specialDuration) return false;
        return specialDuration.includes(healedDamaged);
      }).map(ef => ef.uuid)
      if ((expiredEffects?.length ?? 0) > 0) {
        await timedAwaitExecuteAsGM("removeEffectUuids", {
          actorUuid: token.actor?.uuid,
          effects: expiredEffects,
          options: { "expiry-reason": `midi-qol:${healedDamaged}` }
        });
      }
    }
    // Call the preDamageApplication hook which can change the damage
    if (configSettings.allowUseMacro && this.item.flags) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication", damages);
    }
    Object.assign(damages, this.damageItem);

  }

  processDefenceRoll(message: ChatMessage.Implementation, _html: HTMLElement, _data: ChatMessage.MessageData) {
    if (!this.defenceRequests) return true;
    const requestId = message?.speakerActor?.uuid;
    if (debugEnabled > 0) warn("processDefenceRoll |", requestId, this.saveRequests)

    if (!requestId) return true;
    if (!this.defenceRequests[requestId]) return true;

    clearTimeout(this.defenceTimeouts[requestId]);
    const handler = this.defenceRequests[requestId];
    if (!handler) // the roll must have timed out so ignore this result
      return true;
    delete this.defenceRequests[requestId];
    delete this.defenceTimeouts[requestId];
    handler(message.rolls[0])
    return true;
  }

  processSaveRoll(message: ChatMessage.Implementation, _html: HTMLElement | ChatMessage.Database.CreateOptions, _dataOrUserId: ChatMessage.MessageData | string) {
    if (!this.saveRequests) return {};
    const ddbglFlags = message.flags && message.flags["ddb-game-log"];
    const isDDBGL = ddbglFlags?.cls === "save" && !ddbglFlags?.pending;
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
        if (this.undoData) this.undoData.chatCardUuids.push(message.uuid);
        unTimedExecuteAsGM("updateUndoChatCardUuids", this.undoData);
      }
      handler(message.rolls[0])
    }
    const saveDisplay = (this.activity.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : (this.activity.saveDisplay as string)
    if (game.user?.id !== message.author?.id && !["allShow"].includes(saveDisplay)) {
      setTimeout(() => ui.chat?.element.querySelector(`[data-message-id="${message.id}"]`)?.remove(), 100);
    }
    return true;
  }

  async checkSuperSaver(token: Token.Implementation, abilities: Set<string> | undefined): Promise<boolean> {
    if (!abilities) return false;
    for (let ability of abilities.values()) {
      const flags = token.actor?.flags?.[MODULE_ID]?.superSaver;
      if (!flags) return false;
      if (flags.all) {
        const flagVal = await evalActivationCondition(this, flags.all, token, { errorReturn: false });
        if (flagVal) return true;
      }
      if (flags[ability]) {
        const flagVal = await evalActivationCondition(this, flags[ability], token, { errorReturn: false });
        if (flagVal) return true;
      }
      // @ts-expect-error no dnd5e-types
      if (this.actor.flags?.[MODULE_ID]?.sculptSpells && this.item.school === "evo" && this.preSelectedTargets.has(token)) {
        return true;
      }
    }
    return false;
  }

  async checkSemiSuperSaver(token: Token.Implementation, abilities: Set<string> | undefined): Promise<boolean> {
    if (!abilities) return false;
    for (let ability of abilities.values()) {
      const flags = token.actor?.flags?.[MODULE_ID]?.semiSuperSaver;
      if (!flags) return false;
      if (flags.all) {
        const flagVal = await evalActivationCondition(this, flags.all, token, { errorReturn: false });
        if (flagVal) return true;
      }
      if (flags[ability]) {
        const flagVal = await evalActivationCondition(this, flags[ability], token, { errorReturn: false });
        if (flagVal) return true;
      }
    }
    return false;
  }

  // TODO: Kill?
  // processCustomRoll(customRoll: any) {
  //   const formula = "1d20";
  //   const isSave = customRoll.fields.find(e => e[0] === "check");
  //   if (!isSave) return true;
  //   const rollEntry = customRoll.entries?.find((e) => e.type === "multiroll");
  //   let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
  //   let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
  //   let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
  //   return ({ total, formula, terms: [{ options: { advantage, disadvantage } }] });
  // }

  async processAttackRoll() {
    if (!this.attackRoll) return;
    const terms = this.attackRoll.terms;

    if (terms[0] instanceof foundry.dice.terms.NumericTerm) {
      this.diceRoll = Number(terms[0].total);
    } else {
      const dterm = terms[0] as foundry.dice.terms.DiceTerm;
      const activeResult = dterm.results?.find(d => d.active);
      this.diceRoll = activeResult ? Number(activeResult.result) : Number(terms[0].total);
    }

    // For natural critical/fumble detection, use the actual die face when auto-success/fail
    // is active (min99/max1 from success.attack/fail.attack flags), since those just force
    // hit/miss without implying a natural crit/fumble. Regular min/max modifiers (e.g. min20
    // from min.attack.all) should use terms[0].total which includes the modifier adjustment.
    let critFumbleDiceRoll = this.diceRoll;
    if (this.attackRollModifierTracker.modifiers.willSucceed || this.attackRollModifierTracker.modifiers.willFail) {
      if (!(terms[0] instanceof foundry.dice.terms.NumericTerm)) {
        const dterm = terms[0] as foundry.dice.terms.DiceTerm;
        const activeResult = dterm.results?.find(d => d.active);
        if (activeResult) critFumbleDiceRoll = Number(activeResult.result);
      }
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

    // Determine natural critical/fumble from thresholds
    const naturalCritical = critFumbleDiceRoll >= criticalThreshold;
    if (naturalCritical) {
      this.attackRollModifierTracker.critical.setNatural('naturalCrit', `${i18n("DND5E.Roll")} >= ${criticalThreshold}`);
    }

    const midiFumble: number = (this.activity?.fumbleThreshold as number) ?? 1;
    //@ts-expect-error no dnd5e-types
    const attackRollFumbleTarget = this.attackRoll.options.criticalFailure;
    const fumbleTarget =
      attackRollFumbleTarget === 0 || midiFumble === 0 && attackRollFumbleTarget === 1
        ? 0
        : Math.max(attackRollFumbleTarget, midiFumble);

    const naturalFumble = critFumbleDiceRoll <= fumbleTarget;
    if (naturalFumble) {
      this.attackRollModifierTracker.fumble.setNatural('naturalFumble', `${i18n("DND5E.Roll")} <= ${fumbleTarget}`);
    }

    // Evaluate actor critical/fumble flags using tracker
    const actionType = this.activity?.actionType;
    const actorCriticalFlags: CriticalModifierFlags = {
      criticalFlags: actionType ? ["critical.all", `critical.${actionType}`] : ["critical.all"],
      noCriticalFlags: actionType ? ["noCritical.all", `noCritical.${actionType}`] : ["noCritical.all"],
      fumbleFlags: actionType ? ["fumble.all", `fumble.${actionType}`] : ["fumble.all"],
      noFumbleFlags: actionType ? ["noFumble.all", `noFumble.${actionType}`] : ["noFumble.all"]
    };
    await computeCriticalModifiers(this.actor!, actorCriticalFlags, this.attackRollModifierTracker, { workflow: this, actionType });

    // Evaluate target grants.fumble and grants.noFumble flags
    // Note: grants.critical/noCritical are checked in processCriticalFlags on hitTargets
    // because you only get crit bonus from targets you actually hit
    if (this.targets.size >= 1) {
      const targetGrantsFumbleFlags: CriticalModifierFlags = {
        criticalFlags: [],
        noCriticalFlags: [],
        fumbleFlags: actionType ? ["grants.fumble.all", `grants.fumble.${actionType}`] : ["grants.fumble.all"],
        noFumbleFlags: []
      };

      // grants.fumble - check if ANY target has this flag
      for (const target of this.targets) {
        if (target?.actor) {
          const targetName = target?.name ?? target?.actor?.name ?? "";
          await computeTargetCriticalModifiers(target.actor, targetName, targetGrantsFumbleFlags, this.attackRollModifierTracker, { workflow: this, grantsActor: this.actor });
          if (this.attackRollModifierTracker.fumble.isForced) break;
        }
      }

      // grants.noFumble - check if ALL targets have this flag
      // Only check if we have a fumble (natural or forced)
      if (naturalFumble || this.attackRollModifierTracker.fumble.isForced) {
        let allTargetsGrantNoFumble = true;
        const noFumbleTargets: string[] = [];
        let noFumbleFlag = "grants.noFumble.all";
        for (const target of this.targets) {
          if (!target?.actor) {
            allTargetsGrantNoFumble = false;
            break;
          }
          const targetName = target?.name ?? target?.actor?.name ?? "";
          const conditionData = createConditionData({ workflow: this, target, actor: this.actor });
          const hasNoFumbleAll = await evalAllConditionsAsync(target.actor, midiFlag(`grants.noFumble.all`), conditionData);
          const hasNoFumbleType = actionType && await evalAllConditionsAsync(target.actor, midiFlag(`grants.noFumble.${actionType}`), conditionData);
          if (!hasNoFumbleAll && !hasNoFumbleType) {
            allTargetsGrantNoFumble = false;
            break;
          }
          if (hasNoFumbleType) noFumbleFlag = `grants.noFumble.${actionType}`;
          noFumbleTargets.push(targetName);
        }
        if (allTargetsGrantNoFumble && this.targets.size > 0) {
          this.attackRollModifierTracker.fumble.suppress(noFumbleFlag, `${getFlagDisplayName(noFumbleFlag)} (${noFumbleTargets.join(", ")})`);
        }
      }
    }

    // Tracker now computes final isCritical/isFumble from:
    // override > noCritical/noFumble > forceCritical/forceFumble > naturalCritical/naturalFumble
    // Access tracker state via this.isCritical / this.isFumble getters

    // Persist to chat card (triggers via setter which uses override, but we want to persist computed state)
    this.persistFields({ isCritical: this.isCritical, isFumble: this.isFumble });
    this.persistAttackTracker();

    this.attackTotal = this.attackRoll.total ?? 0;
    if (debugEnabled > 1) debug("processAttackRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble);

    // Update roll with attribution and regenerate HTML if crit/fumble occurred
    if (this.isCritical || this.isFumble) {
      addAttribution(this.attackRoll, this.attackAttribution);
      this.attackRollHTML = await midiRenderAttackRoll(this.attackRoll);
    }
  }

  protected recordAttackStats() {
    if (!configSettings.keepRollStats || !this.item || !this.attackRoll) return;
    // @ts-expect-error CONFIG.Dice.D20Roll.ADV_MODE not typed
    const ADV_MODE = CONFIG.Dice.D20Roll.ADV_MODE;
    gameStats.addAttackRoll({
      rawRoll: this.diceRoll,
      fumble: this.isFumble,
      critical: this.isCritical,
      total: this.attackTotal,
      advantageMode: this.attackRoll.options?.advantageMode ?? ADV_MODE.NORMAL
    }, this.item);
  }

  protected recordDamageStats() {
    if (!configSettings.keepRollStats || !this.item || !this.damageList?.length) return;
    // Only count actual damage (positive hpDamage), not healing
    const totalHpDamage = this.damageList.reduce((sum, dl) => sum + Math.max(0, dl.hpDamage ?? 0), 0);
    // Sum raw damage from non-healing types only
    let totalDamage = 0;
    for (const dl of this.damageList) {
      if (dl.rawDamageDetail) {
        for (const dd of dl.rawDamageDetail) {
          if (dd.value > 0 && dd.type && !GameSystemConfig.healingTypes[dd.type]) {
            totalDamage += dd.value;
          }
        }
      }
    }

    let maxDamage = 0;
    let healingDone = 0;
    let kills = 0;
    for (const dl of this.damageList) {
      const hp = dl.hpDamage ?? 0;
      if (hp > 0) maxDamage = Math.max(maxDamage, hp);
      if (hp < 0) healingDone += Math.abs(hp);
      if ((dl.oldHP ?? 0) > 0 && (dl.newHP ?? 0) <= 0) kills += 1;

      // Record damage taken or healing received on the target actor
      if (hp !== 0 && dl.actorId) {
        const damageByType: Record<string, number> = {};
        if (hp > 0 && dl.damageDetail) {
          for (const dd of dl.damageDetail) {
            if (dd.value > 0 && dd.type) {
              damageByType[dd.type] = (damageByType[dd.type] ?? 0) + dd.value;
            }
          }
        }
        gameStats.addDamageTaken(dl.actorId, hp, damageByType);
      }
    }

    gameStats.addDamage(totalHpDamage, totalDamage, this.item, maxDamage, healingDone, kills, this.isCritical);

    // Aggregate damage dealt by type across all targets (attacker-side stats), excluding healing types
    const dealtByType: Record<string, number> = {};
    const appliedByType: Record<string, number> = {};
    for (const dl of this.damageList) {
      if (dl.rawDamageDetail) {
        for (const dd of dl.rawDamageDetail) {
          if (dd.value > 0 && dd.type && !GameSystemConfig.healingTypes[dd.type]) {
            dealtByType[dd.type] = (dealtByType[dd.type] ?? 0) + dd.value;
          }
        }
      }
      if (dl.damageDetail) {
        for (const dd of dl.damageDetail) {
          if (dd.value > 0 && dd.type && !GameSystemConfig.healingTypes[dd.type]) {
            appliedByType[dd.type] = (appliedByType[dd.type] ?? 0) + dd.value;
          }
        }
      }
    }
    if (Object.keys(dealtByType).length > 0 || Object.keys(appliedByType).length > 0) {
      gameStats.addDamageDealtByType(this.item, dealtByType, appliedByType);
    }
  }

  // Builds a [optionalKeys, flagOwners] tuple for the rolling actor + item enchantments.
  // flagOwners maps full flag paths (e.g. "flags.midi-qol.optional.dragonSlayer") to the item
  // when an enchantment on the rolling item is the source of that key. Actor keys take precedence.
  private collectOptionalFlagSources(): { keys: string[], owners: Record<string, any> } {
    const actorOptional = this.actor.flags?.[MODULE_ID]?.optional ?? {};
    const itemOptional = (this.item?.flags?.[MODULE_ID]?.optional ?? {}) as Record<string, any>;
    const keys: string[] = Object.keys(actorOptional);
    const owners: Record<string, any> = {};
    for (const key of Object.keys(itemOptional)) {
      if (!(key in actorOptional)) {
        keys.push(key);
        owners[`flags.${MODULE_ID}.optional.${key}`] = this.item;
      }
    }
    return { keys, owners };
  }

  async processAttackRollBonusFlags() {
    let attackBonus = "attack.all";
    if (this.activity && this.activity.hasAttack) attackBonus = `attack.${this.activity.actionType}`;
    const { keys: allOptionalKeys, owners: flagOwners } = this.collectOptionalFlagSources();
    const ownerOfShort = (flag: string): any => flagOwners[`flags.${MODULE_ID}.optional.${flag}`] ?? this.actor;
    // If the attack roll is a fumble only select flags that allow the roll to be rerolled.
    let bonusFlags = allOptionalKeys
      .filter(flag => {
        const owner = ownerOfShort(flag);
        const hasAttackFlag = foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}.attack.all`)) as string ||
          foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}.${attackBonus}`)) as string;
        if (hasAttackFlag === undefined) return false;
        if (this.isFumble && !hasAttackFlag?.includes("roll")) return false;
        const flagData = foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}`)) as any;
        if (!flagData?.count) return true;
        return getOptionalCountRemainingShortFlag(this.actor, flag, owner) > 0;
      })
      .map(flag => midiFlag(`optional.${flag}`));

    if (bonusFlags.length > 0) {
      const displayBonusRolls: boolean | undefined = bonusFlags.reduce((acc: boolean | undefined, flag) => (acc || (foundry.utils.getProperty(flagOwners[flag] ?? this.actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined)
        ?? checkMechanic("displayBonusRolls") as boolean;
      const newRoll = await bonusDialog.bind(this)(bonusFlags, attackBonus, displayBonusRolls, `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, this.attackRoll!, "attackRoll", { flagOwners })
      if (newRoll) this.setAttackRoll(newRoll);
    }
    if (this.targets.size === 1) {
      const target = this.targets.first()!;
      // Use the AC captured at roll time (matches what checkHits will compare against
      // via computeTargetAC). Falls back to live ac.value when no descriptor exists.
      const descriptor = getTargetDescriptor(target.actor?.uuid ?? "", this.targetDescriptors);
      // @ts-expect-error no dnd5e-types
      const targetAC = descriptor?.ac ?? target.actor?.system.attributes.ac.value;
      await this.processAttackRoll();
      const isMiss = this.isFumble || (this.attackRoll!.total ?? 0) < targetAC;
      if (isMiss) {
        attackBonus = "attack.fail.all"
        if (this.activity && this.activity.hasAttack) attackBonus = `attack.fail.${this.activity.actionType}`;
        let bonusFlags = allOptionalKeys
          .filter(flag => {
            const owner = ownerOfShort(flag);
            const hasAttackFlag = foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}.attack.fail.all`)) as string
              || foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}.${attackBonus}`)) as string;
            if (hasAttackFlag === undefined) return false;
            if (this.isFumble && !hasAttackFlag?.includes("roll")) return false;
            const flagData = foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}`)) as any;
            if (!flagData?.count) return true;
            return getOptionalCountRemainingShortFlag(this.actor, flag, owner) > 0;
          })
          .map(flag => midiFlag(`optional.${flag}`));
        if (bonusFlags.length > 0) {
          const displayBonusRolls: boolean | undefined = bonusFlags.reduce((acc: boolean | undefined, flag: string) => (acc || (foundry.utils.getProperty(flagOwners[flag] ?? this.actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined)
            ?? checkMechanic("displayBonusRolls") as boolean;
          const newRoll = await bonusDialog.bind(this)(bonusFlags, attackBonus, displayBonusRolls, `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, this.attackRoll, "attackRoll", { flagOwners });
          if (newRoll) this.setAttackRoll(newRoll);
        }
      }
    }
    return this.attackRoll!;
  }

  async processDamageRollBonusFlags(damageRolls: Roll[]): Promise<Roll[]> {
    let damageBonus = "damage.all";
    const rollMode = safeGetGameSetting("core", "messageMode") as string;
    const hideDSN = game.user?.isGM && ["self", "blind", "gm"].includes(rollMode);
    if (this.activity) damageBonus = `damage.${this.activity.actionType}`;
    const { keys: allOptionalKeys, owners: flagOwners } = this.collectOptionalFlagSources();
    const ownerOfShort = (flag: string): any => flagOwners[`flags.${MODULE_ID}.optional.${flag}`] ?? this.actor;
    const bonusFlags = allOptionalKeys
      .filter(flag => {
        const owner = ownerOfShort(flag);
        const hasDamageFlag = foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}.damage.all`)) !== undefined ||
          foundry.utils.getProperty(owner ?? {}, midiFlag(`optional.${flag}.${damageBonus}`)) !== undefined;
        if (!hasDamageFlag) return false;
        return getOptionalCountRemainingShortFlag(this.actor, flag, owner) > 0;
      })
      .map(flag => midiFlag(`optional.${flag}`));
    if (bonusFlags.length > 0) {
      // this.damageRollHTML = await midiRenderDamageRoll(this.damageRoll);
      // this.damamgeRollHTML = $(this.damageRolHTML).find(".dice-roll").remove();
      // TODO dnd3 work out what this means for multiple rolls
      const displayBonusRolls: boolean | undefined = bonusFlags.reduce((acc: boolean | undefined, flag: string) => (acc || (foundry.utils.getProperty(flagOwners[flag] ?? this.actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined)
        ?? checkMechanic("displayBonusRolls") as boolean;
      let newRoll = await bonusDialog.bind(this)(bonusFlags, damageBonus, displayBonusRolls === true, `${this.actor.name} - ${i18n("DND5E.Damage")} ${i18n("DND5E.Roll")}`, damageRolls[0], "damageRoll", { hideDSN, damageRolls, flagOwners })
      if (newRoll) damageRolls[0] = newRoll;
    }
    return damageRolls;
  }

  recordTargetACModifiers() {
    this.targetACModifiers = new Map() as Map<string, number>;
    const allTargetDescriptors = this.targetDescriptors;
    for (let targetToken of this.targets) {
      let targetActor = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      const targetDescriptor = getTargetDescriptor(targetActor.uuid, allTargetDescriptors);
      // null AC means coverTotal — no modifier to compute; cover is handled via status in checkHits
      if (targetDescriptor?.ac != null) {
        //@ts-expect-error no dnd5e-types
        this.targetACModifiers.set(targetActor.uuid, targetDescriptor.ac - targetActor.system.attributes.ac.value);
      }
    }
  }

  async checkHits(options: { workflowOptions?: WorkflowOptions, noOnuseMacro?: boolean, noTargetOnUseMacro?: boolean } = {}) {
    let isHit = true;
    let isHitEC = false;

    // check for a hit/critical/fumble
    if (this.activity.target?.affects?.type === "self") {
      this.targets = await getOrCreateTokenForActorAsSet(this.actor);
      this.hitTargets = new Set(this.targets)
    } else this.hitTargets = new Set();

    this.hitDisplayData = {};
    const challengeModeArmorSet = !([undefined, false, "none"].includes((checkRule("challengeModeArmor") as string | boolean | undefined)));
    for (let targetToken of this.targets) {
      let targetName = configSettings.useTokenNames && targetToken.name ? targetToken.name : targetToken.actor?.name;
      let targetActor = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      let targetACMod = this.targetACModifiers.get(targetActor.uuid) ?? 0;
      let attackBonus = 0;

      // Vehicle AC override
      let vehicleACOverride: number | undefined;
      const wjVehicle = installedModules.get("wjmais") ? foundry.utils.getProperty(targetActor, "flags.wjmais.crew.min") != null : false;
      // @ts-expect-error no dnd5e-types
      if (targetActor.type === "vehicle" && !wjVehicle) {
        const inMotion = targetActor.flags?.[MODULE_ID]?.inMotion;
        // @ts-expect-error no dnd5e-types
        if (inMotion) vehicleACOverride = Number.parseInt(targetActor.system.attributes.ac.flat ?? 10);
        // @ts-expect-error no dnd5e-types
        else vehicleACOverride = Number.parseInt(targetActor.system.attributes.ac.motionless);
        if (isNaN(vehicleACOverride!)) {
          console.warn("Error when getting vehicle armor class make sure motionless is set");
          vehicleACOverride = 10;
        }
      }

      let hitResultNumeric: string | undefined;

      // @ts-expect-error no dnd5e-types
      let targetEC = (targetActor.system.attributes.ac.EC ?? 0) + targetACMod;
      // @ts-expect-error no dnd5e-types
      let targetAR = (targetActor.system.attributes.ac.AR ?? 0) + targetACMod;

      isHit = false;
      isHitEC = false;
      let attackTotal = this.attackTotal;

      // Evaluate ignoreCover flags
      const noCoverFlag = this.actor.flags?.[MODULE_ID]?.ignoreCover;
      let ignoreCover = false;
      if (noCoverFlag) {
        const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
        ignoreCover ||= await evalAllConditionsAsync(this.actor, midiFlag(`ignoreCover`), conditionData);
      }
      if (this.activity.actionType === "rsak" && this.actor.flags?.dnd5e?.spellSniper) {
        const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
        ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.dnd5e.spellSniper`, conditionData);
      }
      const sharpShooterFlag = this.actor.flags?.[MODULE_ID]?.sharpShooter || this.actor.flags?.dnd5e?.sharpShooter;
      if (this.activity.actionType === "rwak" && sharpShooterFlag) {
        const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
        ignoreCover ||= await evalAllConditionsAsync(this.actor, midiFlag(`sharpShooter`), conditionData);
        ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.dnd5e.sharpShooter`, conditionData);
      }

      // Flanking bonus (fixed-value mode): reduce effective AC for this target
      // flankingBonus is recorded per-target in recordFlankingBonuses() before checkHits()
      let flankingACMod = 0;
      const flankingBonusSetting = configSettings.optionalRules.flankingBonus ?? "advantage";
      if (flankingBonusSetting !== "advantage") {
        const allDescriptors = this.targetDescriptors;
        const targetFlankDescriptor = getTargetDescriptor(targetActor.uuid, allDescriptors) as CombinedTargetDescriptor | undefined;
        flankingACMod = targetFlankDescriptor?.flankingBonus ?? 0;
      }

      // Compute effective AC: reconciles status cover with module cover (status as minimum),
      // applies attack-specific reductions (ignoreFullCover, sharpShooter, spellSniper, ignoreCover),
      // and incorporates flanking and targetACMod.
      let acResult = this.token
        ? computeTargetAC(this.token, targetToken, this.activity, { ignoreCover, flankingMod: flankingACMod, targetACMod })
        : undefined;

      let targetAC = vehicleACOverride ?? acResult?.effectiveAC
        //@ts-expect-error no dnd5e-types
        ?? (Number.parseInt(targetActor.system.attributes.ac.value ?? 10) + targetACMod);
      let bonusAC = acResult?.effectiveCoverBonus ?? 0;

      const midiFlagsAttackBonus = targetActor.flags?.[MODULE_ID]?.grants?.attack?.bonus;
      let reactionACDelta = 0;
      let reactionItemName: string | undefined;
      if (!this.isFumble) {
        if (midiFlagsAttackBonus) {
          if (midiFlagsAttackBonus?.all) {
            const bonusValue = midiFlagsAttackBonus.all;
            attackBonus = Number.isNumeric(bonusValue) ? Number(bonusValue)
              : (await (new Roll(`${bonusValue}`, targetActor.getRollData())).evaluate()).total ?? 0;
            foundry.utils.setProperty(this.actor, "flags.midi.evaluated.grants.attack.bonus.all", { value: attackBonus, effects: [`${targetActor.name}`] });
          }
          if (midiFlagsAttackBonus[this.activity.actionType]) {
            const bonusValue = midiFlagsAttackBonus[this.activity.actionType];
            attackBonus = Number.isNumeric(bonusValue) ? Number(bonusValue)
              : (await (new Roll(`${bonusValue}`, targetActor.getRollData())).evaluate()).total ?? 0;
            foundry.utils.setProperty(this.actor, `flags.midi.evaluated.grants.attack.bonus.${this.activity.actionType}`, { value: attackBonus, effects: [`${targetActor.name}`] });
          }
        }
        if (challengeModeArmorSet) isHit = attackTotal > targetAC || this.isCritical;
        else {
          if (this.attackRoll && !this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
            const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item.uuid }, { inplace: false, overwrite: true });
            const result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reactionattacked", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
            if (result?.ac && isFinite(targetAC)) { // result.ac is a newAC total from optional bonus dialog; don't override total cover (Infinity)
              //@ts-expect-error no dnd5e-types
              const preReactionRawAC: number = targetToken.actor?.system.attributes.ac?.value ?? 10;
              reactionACDelta = result.ac - preReactionRawAC;
              reactionItemName = result.name;
              targetAC = result.ac + (acResult?.appliedCoverDelta ?? 0) + targetACMod - flankingACMod;
            } else if (result?.uuid && isFinite(targetAC)) {
              // Spell reaction (e.g. Shield) was used but didn't return ac directly.
              // The actor's AC has been updated by the reaction workflow — recompute effective AC.
              const postReactionACResult = this.token
                ? computeTargetAC(this.token, targetToken, this.activity, { ignoreCover, flankingMod: flankingACMod, targetACMod })
                : undefined;
              if (postReactionACResult && postReactionACResult.effectiveAC !== targetAC) {
                // Show the reaction's contribution separately: restore pre-reaction baseAC and track the delta
                const preReactionBaseAC = acResult?.baseAC ?? postReactionACResult.baseAC;
                reactionACDelta = postReactionACResult.baseAC - preReactionBaseAC;
                postReactionACResult.baseAC = preReactionBaseAC;
                acResult = postReactionACResult;
                targetAC = acResult.effectiveAC;
                bonusAC = acResult.effectiveCoverBonus;
                reactionItemName = result.itemName ?? result.name;
              }
            }
          }
          isHit = (attackTotal + attackBonus) >= targetAC || this.isCritical;
        }
        if (!isFinite(targetAC)) isHit = false; // total cover (coverTotal status or TOTAL_COVER from computeCoverBonus)

        if (targetEC) isHitEC = challengeModeArmorSet && attackTotal <= targetAC && attackTotal >= targetEC && isFinite(targetAC);
        // check to see if the roll hit the target
        if ((isHit || isHitEC) && this.activity.attack && this.attackRoll && targetToken !== null && !foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
          const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item.uuid }, { inplace: false, overwrite: true });
          // reaction is the same as reactionhit to accomodate the existing reaction workflow
          let result;
          if (!this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
            result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reaction", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
          }
          if (!Workflow.getWorkflow(this.id)) // workflow has been removed - bail out
            return;
          // targetAC already has cover, flanking, and targetACMod from computeTargetAC (via acResult.effectiveAC)
          // Only update if the hit reaction returned a new AC total
          if (result?.ac) {
            //@ts-expect-error no dnd5e-types
            const preReactionRawAC: number = targetToken.actor?.system.attributes.ac?.value ?? 10;
            reactionACDelta = result.ac - preReactionRawAC;
            reactionItemName = result.name;
            targetAC = result.ac + (acResult?.appliedCoverDelta ?? 0) - flankingACMod;
          } else if (result?.uuid) {
            // Spell reaction was used but didn't return ac directly — recompute effective AC.
            const postReactionACResult = this.token
              ? computeTargetAC(this.token, targetToken, this.activity, { ignoreCover, flankingMod: flankingACMod, targetACMod })
              : undefined;
            if (postReactionACResult && postReactionACResult.effectiveAC !== targetAC) {
              const preReactionBaseAC = acResult?.baseAC ?? postReactionACResult.baseAC;
              reactionACDelta = postReactionACResult.baseAC - preReactionBaseAC;
              postReactionACResult.baseAC = preReactionBaseAC;
              acResult = postReactionACResult;
              targetAC = acResult.effectiveAC;
              bonusAC = acResult.effectiveCoverBonus;
              reactionItemName = result.itemName ?? result.name;
            }
          }
          if (targetEC) targetEC = targetAC - targetAR + targetACMod; // targetEC is always the same as targetAC - targetAR + descriptorMod
          isHit = (attackTotal + attackBonus >= targetAC || this.isCritical) && result?.name !== "missed";
          if (challengeModeArmorSet) isHit = this.attackTotal >= targetAC || this.isCritical;
          if (targetEC) isHitEC = challengeModeArmorSet && this.attackTotal <= targetAC && this.attackTotal >= targetEC && isFinite(targetAC);
        } else if ((!isHit && !isHitEC) && this.activity.attack && this.attackRoll && targetToken !== null && !foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.noProvokeReaction`)) {
          const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item.uuid }, { inplace: false, overwrite: true });
          if (!this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
            await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reactionmissed", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
          }
          // TODO what else to do once rolled
        }
        const optionalCrits = checkRule("optionalCritRule") as number;
        if (this.targets.size === 1 && configSettings.optionalRulesEnabled && optionalCrits > -1) {
          if (checkRule("criticalNat20") && this.isCritical) {
            // criticalNat20 rule: natural 20 always crits, so don't change
          } else {
            // Optional crit rule: only crit if attack exceeds AC by optionalCrits
            const optionalCrit = attackTotal >= targetAC + optionalCrits;
            this.attackRollModifierTracker.critical.setOverride(optionalCrit, "optionalCritRule", i18n("midi-qol.OptionalCritRule"));
          }
        }
        hitResultNumeric = this.isCritical ? "++" : !isFinite(targetAC) ? `${attackTotal}/∞` : `${attackTotal}/${Math.abs(attackTotal - targetAC)}`;
      }

      const midiFlagsActorFail = this.actor.flags?.[MODULE_ID]?.fail;
      if (midiFlagsActorFail) {
        const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
        let failFlag: string | undefined;
        if (await evalAllConditionsAsync(this.actor, midiFlag(`fail.attack.${this.activity.actionType}`), conditionData))
          failFlag = `fail.attack.${this.activity.actionType}`;
        else if (await evalAllConditionsAsync(this.actor, midiFlag(`fail.attack.all`), conditionData))
          failFlag = "fail.attack.all";
        else if (await evalAllConditionsAsync(this.actor, midiFlag(`fail.all`), conditionData))
          failFlag = "fail.all";
        if (failFlag) {
          isHit = false;
          isHitEC = false;
          this.attackRollModifierTracker.critical.setOverride(false, failFlag, getFlagDisplayName(failFlag));
        }
      }
      const midiFlagsActorSuccess = this.actor.flags?.[MODULE_ID]?.success;
      if (midiFlagsActorSuccess) {
        const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
        let successFlag: string | undefined;
        if (await evalAllConditionsAsync(this.actor, midiFlag(`success.attack.${this.activity.actionType}`), conditionData))
          successFlag = `success.attack.${this.activity.actionType}`;
        else if (await evalAllConditionsAsync(this.actor, midiFlag(`success.attack.all`), conditionData))
          successFlag = "success.attack.all";
        else if (await evalAllConditionsAsync(this.actor, midiFlag(`success.all`), conditionData))
          successFlag = "success.all";
        if (successFlag) {
          isHit = true;
          isHitEC = false;
          this.attackRollModifierTracker.fumble.setOverride(false, successFlag, getFlagDisplayName(successFlag));
        }
      }

      const midiFlagsGrantsAttackSuccess = targetActor.flags?.[MODULE_ID]?.grants?.attack?.success;
      const midiFlagsGrantsAttackFail = targetActor.flags?.[MODULE_ID]?.grants?.attack?.fail;
      let conditionData;
      if (midiFlagsGrantsAttackSuccess || midiFlagsGrantsAttackFail) {
        conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });

        let grantsSuccessFlag: string | undefined;
        if (await evalAllConditionsAsync(targetActor, midiFlag(`grants.attack.success.${this.activity.actionType}`), conditionData))
          grantsSuccessFlag = `grants.attack.success.${this.activity.actionType}`;
        else if (await evalAllConditionsAsync(targetActor, midiFlag(`grants.attack.success.all`), conditionData))
          grantsSuccessFlag = "grants.attack.success.all";
        if (grantsSuccessFlag) {
          isHit = true;
          isHitEC = false;
          this.attackRollModifierTracker.fumble.setOverride(false, grantsSuccessFlag, getFlagDisplayName(grantsSuccessFlag));
        }
        let grantsFailFlag: string | undefined;
        if (await evalAllConditionsAsync(targetActor, midiFlag(`grants.attack.fail.${this.activity.actionType}`), conditionData))
          grantsFailFlag = `grants.attack.fail.${this.activity.actionType}`;
        else if (await evalAllConditionsAsync(targetActor, midiFlag(`grants.attack.fail.all`), conditionData))
          grantsFailFlag = "grants.attack.fail.all";
        if (grantsFailFlag) {
          isHit = false;
          isHitEC = false;
          this.attackRollModifierTracker.critical.setOverride(false, grantsFailFlag, getFlagDisplayName(grantsFailFlag));
        }
      }

      let hitScale = 1;
      // @ts-expect-error no dnd5e-types
      if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && !this.isCritical) hitScale = Math.floor((this.attackTotal - targetEC + 1) / ((targetActor?.system.attributes.ac.AR ?? 0) + 1) * 10) / 10;
      if (!this.challengeModeScale) this.challengeModeScale = {};
      this.challengeModeScale[targetToken.actor?.uuid ?? "dummy"] = hitScale;
      if (this.isCritical && isFinite(targetAC)) isHit = true;
      if (isHit || (this.isCritical && isFinite(targetAC))) this.hitTargets = this.hitTargets.add(targetToken);
      if (isHitEC) this.hitTargetsEC = this.hitTargetsEC.add(targetToken);
      if (isHit || isHitEC) await this.processCriticalFlags();
      // acBonus flag is no longer set by computeCoverBonus — nothing to clear.

      if (game.user?.isGM) log(`${this.speaker?.alias} Rolled a ${this.attackTotal + attackBonus} to hit ${targetName} 's AC of ${targetAC} ${isHit ? "hitting" : "missing"}`);
      // Log the hit on the target
      let attackType = ""; //item?.name ? i18n(item.name) : "Attack";

      let hitSymbol = "fa-blank"
      // if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && !this.isCritical) hitScale = Math.floor(this.challengeModeScale[targetActor.uuid]);
      let isHitResult = "miss";
      if (game.user?.isGM && ["hitMiss", "hidden"].includes(configSettings.gmAttackDisplay ?? "full") && (this.isCritical || isHit || isHitEC)) {
        isHitResult = "hit";
        hitSymbol = "fa-tick";
      } else if (this.isCritical) {
        isHitResult = "critical";
        hitSymbol = "fa-check-double"
      } else if (game.user?.isGM && this.isFumble && ["hitMiss", "hidden"].includes(configSettings.gmAttackDisplay ?? "full")) {
        isHitResult = "miss";
        hitSymbol = "fa-xmark";
      } else if (this.isFumble) {
        isHitResult = "fumble";
        hitSymbol = "fa-xmark";
      } else if (isHit) {
        isHitResult = "hit";
        hitSymbol = "fa-check";
      } else if (isHitEC && ["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor") as string)) {
        isHitResult = "hitEC";
        hitSymbol = "fa-check";
      } else if (isHitEC) {
        isHitResult = "hitEC";
        hitSymbol = "fa-check";
      } else {
        isHitResult = "miss";
        hitSymbol = "fa-xmark";
      }
      let hitStyle = "";

      let img = targetToken.document.texture.src || targetToken.actor?.img || "";
      // @ts-expect-error no dnd5e-types
      if (configSettings.usePlayerPortrait && targetToken.actor?.type === "character") {
        img = targetToken.actor?.img || targetToken.document.texture.src || "";
      }
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img ?? "")) {
        img = await game.video?.createThumbnail(img ?? "", { width: 100, height: 100 }) ?? "";
      }

      if (this.isFumble) hitResultNumeric = "--";
      const targetUuid = targetToken.document.uuid;

      const effectiveAC = targetAC - attackBonus;
      const acDisplay = !isFinite(targetAC) ? "∞" : `${effectiveAC}`;

      // Build array of AC modifier icons and AC tooltip — icon order matches tooltip order
      const acIcons: Array<{ img?: string; icon?: string; tooltip?: string; cssClass: string; useDnd5eIcon?: boolean }> = [];
      let acTooltipParts = `${acResult?.baseAC ?? effectiveAC}`;
      if (targetACMod) acTooltipParts += ` ${targetACMod > 0 ? "+" : ""}${targetACMod}`;

      const displayCover = acResult?.effectiveCoverBonus ?? 0;
      if (!acResult?.coverIgnored && displayCover >= TOTAL_COVER) {
        acIcons.push({ img: "systems/dnd5e/icons/svg/statuses/cover-total.svg", tooltip: `+${displayCover}: ${i18n("EFFECT.DND5E.StatusTotalCover")}`, cssClass: "midi-qol-ac-icon", useDnd5eIcon: true });
      } else if (!acResult?.coverIgnored && displayCover >= THREE_QUARTERS_COVER) {
        acIcons.push({ img: "systems/dnd5e/icons/svg/statuses/cover-three-quarters.svg", tooltip: `+${displayCover}: ${i18n("EFFECT.DND5E.StatusThreeQuartersCover")}`, cssClass: "midi-qol-ac-icon", useDnd5eIcon: true });
      } else if (!acResult?.coverIgnored && displayCover >= HALF_COVER) {
        acIcons.push({ img: "systems/dnd5e/icons/svg/statuses/cover-half.svg", tooltip: `+${displayCover}: ${i18n("EFFECT.DND5E.StatusHalfCover")}`, cssClass: "midi-qol-ac-icon", useDnd5eIcon: true });
      }
      if (!acResult?.coverIgnored && acResult && acResult.effectiveCoverBonus > 0)
        acTooltipParts += ` +${acResult.effectiveCoverBonus}`;

      if (acResult?.coverIgnored) {
        if (this.activity?.actionType === "rwak") {
          acIcons.push({ img: "icons/skills/targeting/target-strike-gray.webp", tooltip: i18n("midi-qol.SharpShooter"), cssClass: "midi-qol-ac-icon-img" });
        } else if (this.activity?.actionType === "rsak") {
          acIcons.push({ img: "icons/skills/targeting/crosshair-triple-strike-orange.webp", tooltip: i18n("midi-qol.SpellSniper"), cssClass: "midi-qol-ac-icon-img" });
        }
      }

      const isMeleeAction = ["mwak", "msak"].includes(this.activity?.actionType ?? "");
      if (flankingACMod > 0 && isMeleeAction) {
        const flankingMode = checkRule("checkFlanking") as string;
        const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
        acIcons.push({
          img: isFlankedMode ? "modules/midi-qol/icons/encirclement.svg" : "icons/svg/sword.svg",
          tooltip: `-${flankingACMod}: ${isFlankedMode ? i18n("midi-qol.Flanked") : i18n("midi-qol.Flanking")}`,
          cssClass: "midi-qol-ac-icon-img"
        });
        acTooltipParts += ` -${flankingACMod}`;
      }

      if (reactionACDelta) {
        acIcons.push({ img: "modules/midi-qol/icons/reaction.svg", tooltip: `${reactionACDelta > 0 ? "+" : ""}${reactionACDelta}: ${i18n("DND5E.Reaction")}: ${reactionItemName}`, cssClass: "midi-qol-ac-icon", useDnd5eIcon: true });
        acTooltipParts += ` ${reactionACDelta > 0 ? "+" : ""}${reactionACDelta}`;
      }

      if (attackBonus) {
        const grantsFlagKey = `flags.${MODULE_ID}.grants.attack.bonus`;
        const grantsEffectNames = targetActor.allApplicableEffects()
          // @ts-expect-error fvtt-types v14 ActiveEffect
          .filter(e => !e.disabled && e.system.changes?.some(c => c.key.startsWith(grantsFlagKey)))
          .map(e => e.name)
          .toArray();
        if (grantsEffectNames.length) {
          const acDelta = -attackBonus;
          acIcons.push({ icon: "fas fa-bolt", tooltip: `${acDelta > 0 ? "+" : ""}${acDelta}: ${grantsEffectNames.join(", ")}`, cssClass: "midi-qol-ac-icon-fa" });
        }
        acTooltipParts += ` ${-attackBonus > 0 ? "+" : ""}${-attackBonus}`;
      }

      let acTooltip: string | undefined;
      if (isFinite(targetAC) && acTooltipParts !== `${effectiveAC}`) {
        acTooltip = `${effectiveAC} = ${acTooltipParts}`;
      }

      this.hitDisplayData[targetUuid] = {
        targetClass: !!targetToken.actor?.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-npc-target",
        target: targetToken,
        actorUuid: targetToken.actor?.uuid,
        uuid: targetUuid,
        hitStyle,
        attackBonus,
        ac: effectiveAC,
        acDisplay,
        acTooltip,
        //@ts-expect-error no dnd5e-types
        baseAc: targetToken.actor?.system.attributes.ac?.value ?? 10,
        hitClass: ["hit", "critical", "isHitEC"].includes(isHitResult) ? "success" : "failure",
        acClass: (targetToken.actor as Actor).hasPlayerOwner ? "" : "midi-qol-npc-ac",
        acIcons,
        hitSymbol,
        attackType,
        showAC: true,
        img,
        gmName: getTokenName(targetToken),
        playerName: getTokenPlayerName(targetToken.document) ?? "",
        hitResultNumeric,
        attackTotal,
        isHit: ["hit", "critical", "isHitEC"].includes(isHitResult)
      };
    }
    if (configSettings.allowUseMacro && !options.noTargetOnUseMacro) await this.triggerTargetMacros(["isHit"], new Set([...this.hitTargets, ...this.hitTargetsEC]));
    if (configSettings.allowUseMacro && !options.noTargetOnUseMacro) await this.triggerTargetMacros(["isMissed"], this.targets.difference(this.hitTargets).difference(this.hitTargetsEC));
    this.hitTargets = this.hitTargets; // force update
    this.hitTargetsEC = this.hitTargetsEC; // force update
    this.persistAttackTracker();
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
      this.utilityRollHTML += await midiRenderFormulaRoll(roll);
    }
  }

  setUtilityRoll(roll: Roll) {
    return this.setUtilityRolls([roll]);
  }

  convertRollToDamageRoll(roll: Roll.Any) {
    //@ts-expect-error
    const DamageRoll = CONFIG.Dice.DamageRoll;
    if (!(roll instanceof DamageRoll)) { // we got passed a normal roll which really should be a damage roll
      let damageType: string | undefined = MidiQOL.MQdefaultDamageType;
      if (roll.terms[0].options.flavor && getDamageType(roll.terms[0].options.flavor)) {
        damageType = getDamageType(roll.terms[0].options.flavor);
      } else if (this.activity.hasDamage) damageType = this.activity.damage!.parts[0]?.types.first();
      else if (this.activity.hasHealing) damageType = this.activity.healing!.types.first() ?? "healing";
      const message = `convertRollToDamageRoll: roll is not a damage roll, setting type to ${damageType}`;
      TroubleShooter.recordError(new Error(message));
      // DamageRoll has no static fromRoll (only D20Roll does) - mirror it, then stamp the damage type
      const damageRoll = new DamageRoll(roll.formula, roll.data, roll.options);
      Object.assign(damageRoll, roll);
      damageRoll.options.type = damageType;
      error("convertRollToDamageRoll: roll is not a damage roll", damageRoll);
      return damageRoll;
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
    this.rawDamageDetail = createDamageDetail({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.damageDetail = foundry.utils.deepClone(this.rawDamageDetail);
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
      //@ts-expect-error protected
      if (!rolls[i]._evaluated) rolls[i] = await rolls[i].evaluate();
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
    this.flavor = i18n("DND5E.Damage");
    this.rawDamageDetail = createDamageDetail({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.damageDetail = foundry.utils.deepClone(this.rawDamageDetail);
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
      //@ts-expect-error protected
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
    this.rawBonusDamageDetail = createDamageDetail({ roll: this.bonusDamageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.bonusDamageDetail = foundry.utils.deepClone(this.rawBonusDamageDetail);
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
      //@ts-expect-error protected
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
    this.rawOtherDamageDetail = createDamageDetail({ roll: this.otherDamageRolls, activity: this.activity, defaultType: this.defaultDamageType });
    this.otherDamageDetail = foundry.utils.deepClone(this.rawOtherDamageDetail);
    return;
  }

  async setOtherDamageRoll(roll: Roll) {
    this.setOtherDamageRolls([this.convertRollToDamageRoll(roll)]);
  }

  async chooseEffects(effects: ActiveEffect.Implementation[], options) {
    if (effects.length === 0) {
      if (debugEnabled > 0)
        warn(`chooseEffect | no effects found for ${this.item.name}`);
      return [];
    }
    const { DialogV2 } = foundry.applications.api;
    const buttons = effects.map(effect => ({
      action: effect.uuid,
      label: effect.name,
      callback: () => effect,
    }));
    const chosen: ActiveEffect.Implementation | null = await DialogV2.wait({
      window: { title: `${i18n('CONTROLS.CommonSelect')} ${i18n('DOCUMENT.ActiveEffect')}` },
      classes: ["midi-qol-choose-effect"],
      position: { width: 220 },
      buttons,
      render: (_event, dialog) => {
        dialog.element.querySelectorAll<HTMLButtonElement>(".form-footer button").forEach((btn) => {
          const eff = fromUuidSync(btn.dataset.action ?? "") as ActiveEffect.Implementation;
          if (!eff) return;
          const img = document.createElement('img');
          img.src = eff.img as string ?? "";
          const span = btn.querySelector("span");
          if (span) span.dataset.tooltip = eff.name;
          btn.prepend(img);
        });
      },
    });
    if (!chosen) return [];
    return [chosen];
  }
}
export class SavesFirstWorkflow extends Workflow {
  get postAttackRollState(): WorkflowState {
    return this.WorkflowState_WaitForSaves;
  }

  async WorkflowState_WaitForSaves(context: WorkflowContext = {}): Promise<WorkflowState> {
    await super.WorkflowState_WaitForSaves(context);
    return this.WorkflowState_SavesComplete;
  }

  async WorkflowState_SavesComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    expireMyEffects.bind(this)(["1Action", "1Spell"]);
    if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
      await this.callMacros(this.item, this.onUseMacros?.getMacros("postSave"), "OnUse", "postSave");
      if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("postSave"), "OnUse", "postSave");
    }
    const hasDamageRoll = this.activity.hasDamage || this.otherActivity?.hasDamage || this.activity.hasHealing || this.otherActivity?.hasHealing;
    if (!hasDamageRoll) return this.WorkflowState_AllRollsComplete;
    if (getAutoRollDamage(this) === "always") return this.WorkflowState_WaitForDamageRoll;
    const noHits = this.hitTargets.size === 0 && this.hitTargetsEC.size === 0;
    const allMissed = noHits && this.targets.size !== 0;
    if (allMissed) {
      if (configSettings.confirmAttackDamage !== "none" && !this.workflowOptions.forceCompletion)
        return this.WorkflowState_ConfirmRoll;
      if (this.workflowOptions.forceCompletion || configSettings.autoCompleteWorkflow) {
        expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
        return this.WorkflowState_RollFinished;
      }
    }
    return this.WorkflowState_WaitForDamageRoll;
  }

  async WorkflowState_WaitForDamageRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (context.damageRoll || context.otherDamageRoll) {
      // record the data - currently done in item handling
      return this.WorkflowState_ConfirmRoll;
    }
    const hasDamageRoll = this.activity.hasDamage || this.otherActivity?.hasDamage || this.activity.hasHealing || this.otherActivity?.hasHealing;
    if (!hasDamageRoll) return this.WorkflowState_AllRollsComplete;
    return super.WorkflowState_WaitForDamageRoll(context);
  }

  async WorkflowState_DamageRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    await super.WorkflowState_DamageRollComplete(context);
    return this.WorkflowState_AllRollsComplete;
  }
}

export class ActiveDefenceWorkflow extends Workflow {
  async WorkflowState_WaitForAttackRoll(context?: WorkflowContext): Promise<WorkflowState> {
    this.workflowOptions.attackRollDSN = false;
    return super.WorkflowState_WaitForAttackRoll(context);
  }
  async processAttackRoll() {
    return super.processAttackRoll();
  }

  async WorkflowState_AttackRollComplete(context?: WorkflowContext): Promise<WorkflowState> {
    const attackBonus = (this.attackRoll?.total ?? 0) - (this.attackRoll?.dice[0]?.total ?? 0); // TODO see if there is a better way to work out roll plusses
    this.activeDefenceDC = configSettings.optionalRules.activeDefenceModifier + attackBonus;
    return super.WorkflowState_AttackRollComplete(context);
  }

  async checkHits() {
    if (!this.attackRoll || !this.item) return;
    if (!this.attackRoll?.total) {
      this.abort = true;
      return this.performState(this.WorkflowState_Abort);
    }

    this.displayHitTargets(false);
    // Roll is d20 + AC - 10
    let hookId = Hooks.on("renderChatMessageHTML", this.processDefenceRoll.bind(this));
    try {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      this.defenceRequests = {};
      this.defenceTimeouts = {};
      this.activeDefenceRolls = {};
      this.isCritical = false;
      this.isFumble = false;
      // Get the attack bonus for the attack

      await this.displayAttackRoll();
      await this.checkActiveAttacks(false, this.attackRoll);
      this.hitTargets = this.hitTargets; // force update
      const isHitEC = false;
      for (let targetToken of this.targets) {
        let targetAC: number | undefined;
        let adRoll: Roll | undefined;
        const targetTokenDocument = getTokenDocument(targetToken);
        if (!targetTokenDocument) continue;
        if (this.activeDefenceRolls[targetTokenDocument.uuid ?? ""]) {
          adRoll = this.activeDefenceRolls[targetTokenDocument.uuid] ?? {};

          let attackType = ""; //item?.name ? i18n(item.name) : "Attack";
          const isHit = this.hitTargets.has(targetToken);
          let hitSymbol = "fa-blank"
          // if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && !this.isCritical) hitScale = Math.floor(this.challengeModeScale[targetActor.uuid]);
          let isHitResult = "miss";
          // Inverse hit/miss icons from normal attacks so the result looks the same as with saving throws
          if (game.user?.isGM && ["hitMiss", "hidden"].includes(configSettings.gmAttackDisplay ?? "full") && (this.isCritical || isHit || isHitEC)) {
            // Failed defence roll
            isHitResult = "miss";
            hitSymbol = "fa-xmark";
          } else if (this.isCritical) {
            // Fumbled defence roll
            isHitResult = "fumble";
            hitSymbol = "fa-xmarks-lines";
          } else if (game.user?.isGM && this.isFumble && ["hitMiss", "hidden"].includes(configSettings.gmAttackDisplay ?? "full")) {
            // Successful defence roll
            isHitResult = "hit";
            hitSymbol = "fa-check";
          } else if (this.isFumble) {
            // Nat 20 defence roll
            isHitResult = "critical";
            hitSymbol = "fa-check-double";
          } else if (isHit) {
            // Failed defence roll
            isHitResult = "miss";
            hitSymbol = "fa-xmark";
          } else if (isHitEC && ["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor") as string)) {
            // Failed defence roll
            isHitResult = "miss";
            hitSymbol = "fa-xmark";
          } else if (isHitEC) {
            // Failed defence roll
            isHitResult = "miss";
            hitSymbol = "fa-xmark";
          } else {
            // Successful defence roll
            isHitResult = "hit";
            hitSymbol = "fa-check";
          }
          let hitStyle = "";

          let img = targetTokenDocument.texture.src || targetTokenDocument.actor?.img;
          // @ts-expect-error no dnd5e-types
          if (configSettings.usePlayerPortrait && targetTokenDocument.actor?.type === "character") {
            img = targetTokenDocument.actor?.img || targetTokenDocument.texture.src;
          }
          if (foundry.helpers.media.VideoHelper.hasVideoExtension(img ?? "")) {
            img = await game.video?.createThumbnail(img ?? "", { width: 100, height: 100 }) ?? "";
          }
          // Why?
          let acBonusString: string | undefined;
          const acDisplay = `${adRoll.total}${acBonusString ?? ""}`;
          const bonusAC = 0;
          let attackBonus = (this.activeDefenceDC ?? 0) - configSettings.optionalRules.activeDefenceModifier;
          // Compute cover bonus and apply
          const targetUuid = targetTokenDocument.uuid;
          this.hitDisplayData ??= {};
          this.hitDisplayData[targetUuid] = {
            targetClass: !!targetTokenDocument.actor?.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-npc-target",
            target: targetToken,
            actorUuid: targetTokenDocument.actor?.uuid,
            uuid: targetUuid,
            hitStyle,
            attackBonus,
            ac: (targetAC ?? 0) - attackBonus,
            acDisplay,
            baseAc: (targetAC ?? 0) - bonusAC,
            hitClass: ["hit", "critical", "isHitEC"].includes(isHitResult) ? "success" : "failure",
            acClass: targetTokenDocument.actor?.hasPlayerOwner ? "" : "midi-qol-npc-ac",
            hitSymbol,
            attackType,
            showAC: true,
            img: img as string ?? "",
            isHit,
            gmName: getTokenName(targetTokenDocument),
            playerName: getTokenPlayerName(targetTokenDocument) ?? "",
            hitResultNumeric: String(adRoll.total),
            attackTotal: adRoll.total
          };
        }
      }
    } catch (err) {
      TroubleShooter.recordError(err, "activeDefence");
    } finally {
      Hooks.off("renderChatMessageHTML", hookId);
    }
  }

  //@ts-expect-error no dnd5e types
  async checkActiveAttacks(whisper = false, roll: CONFIG.Dice.D20Roll, _coverBonus = 0) {
    //@ts-expect-error
    const BasicRoll = CONFIG.Dice.BasicRoll;
    if (debugEnabled > 1) debug(`active defence : whisper ${whisper}  hit targets ${this.targets}`)
    if (this.targets.size <= 0) {
      return;
    }
    //@ts-expect-error no dnd5e types
    const D20Roll = CONFIG.Dice.D20Roll;

    const criticalTarget = 20 - (roll.options.criticalFailure ?? 1) + 1;
    const fumbleTarget = 20 - (roll.options.criticalSuccess ?? 20) + 1;
    let advantageMode = roll?.options?.advantageMode ?? D20Roll.NORMAL;
    let promises: Promise<any>[] = [];
    for (let target of this.targets) {
      if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
      const targetActor = target.actor;
      const targetActorSystem = target.actor.system;
      const midiFlagsAttackBonus = targetActor.flags?.[MODULE_ID]?.grants?.attack?.bonus;

      // TODO: Add in AC Bonus for cover
      // @ts-expect-error no dnd5e-types
      const actorAC = targetActorSystem.attributes.ac.value + (this.targetACModifiers.get(target.actor.uuid) ?? 0);
      let dcMod = actorAC - (22 - configSettings.optionalRules.activeDefenceModifier);
      let modString = `+ ${dcMod}`;
      if (dcMod < 0) modString = `- ${Math.abs(dcMod)}`;
      let attackBonus = 0;
      if (midiFlagsAttackBonus) {
        if (midiFlagsAttackBonus?.all) {
          const attackBonusRoll = await (new Roll(midiFlagsAttackBonus.all, targetActor.getRollData()))?.evaluate();
          attackBonus -= attackBonusRoll?.total ?? 0;
          foundry.utils.setProperty(this.actor, "flags.midi.evaluated.grants.attack.bonus.all", { value: attackBonus, effects: [`${targetActor.name}`] });
        }
        if (midiFlagsAttackBonus[this.activity.actionType]) {
          const attackBonusRoll = await (new Roll(midiFlagsAttackBonus[this.activity.actionType], targetActor.getRollData())).evaluate();
          attackBonus -= attackBonusRoll?.total ?? 0;
          foundry.utils.setProperty(this.actor, `flags.midi.evaluated.grants.attack.bonus.${this.activity.actionType}`, { value: attackBonus, effects: [`${targetActor.name}`] });
        }
      }
      if (attackBonus < 0)
        modString = `${modString} - ${Math.abs(attackBonus)}`;
      else if (attackBonus > 0)
        modString = `${modString} + ${attackBonus}`;
      dcMod += attackBonus;
      let coverBonus = 0;
      const noCoverFlag = this.actor.flags?.[MODULE_ID]?.ignoreCover;
      let ignoreCover = false;
      if (noCoverFlag) {
        const conditionData = createConditionData({ workflow: this, target, actor: this.actor });
        ignoreCover ||= await evalAllConditionsAsync(this.actor, midiFlag(`ignoreCover`), conditionData);
      }
      if (this.activity?.actionType === "rsak" && this.actor.flags?.dnd5e?.spellSniper) {
        const conditionData = createConditionData({ workflow: this, target, actor: this.actor });
        ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.dnd5e.spellSniper`, conditionData);
      }
      const sharpShooterFlag = this.actor.flags?.[MODULE_ID]?.sharpShooter || this.actor.flags?.dnd5e?.sharpShooter;
      if (this.activity?.actionType === "rwak" && sharpShooterFlag) {
        const conditionData = createConditionData({ workflow: this, target, actor: this.actor });
        ignoreCover ||= await evalAllConditionsAsync(this.actor, midiFlag(`sharpShooter`), conditionData);
        ignoreCover ||= await evalAllConditionsAsync(this.actor, `flags.dnd5e.sharpShooter`, conditionData);
      }
      if (this.token) {
        const moduleCover = computeCoverBonus(this.token, target, this.activity);
        //@ts-expect-error no dnd5e-types
        const statusCover: number = target.actor?.system?.attributes?.ac?.cover ?? 0;
        // Status cover is already in the target's AC; only add the delta
        coverBonus = Math.max(moduleCover - statusCover, 0);
      }
      if (ignoreCover && coverBonus < TOTAL_COVER) coverBonus = 0;
      if (coverBonus) modString += ` + ${coverBonus}`;
      let formula = `1d20${modString}`;

      if (advantageMode === D20Roll.ADV_MODE.ADVANTAGE) {
        advantageMode = D20Roll.ADV_MODE.DISADVANTAGE
      } else if (advantageMode === D20Roll.ADV_MODE.DISADVANTAGE) {
        advantageMode = D20Roll.ADV_MODE.ADVANTAGE;
      }
      const options = {
        criticalSuccess: criticalTarget,
        criticalFailure: fumbleTarget,
        advantageMode,
        target: this.activeDefenceDC
      };
      /*
                  if (this.attackRoll && !this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
                    const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item.uuid }, { inplace: false, overwrite: true });
                    const result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reactionattacked", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
                    // TODO what else to do once rolled
                    // @ts-expect-error no dnd5e-types
                    targetAC = Number.parseInt(targetActor.system.attributes.ac.value ?? 10) + bonusAC + descriptorMod;
                  }
                  isHit = (attackTotal + attackBonus) >= targetAC || this.isCritical;
      */

      let player = playerFor(target);
      // if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
      if (debugEnabled > 0) warn(`checkSaves | Player ${player?.name} controls actor ${target.actor.name} - requesting DC ${this.activeDefenceDC} save`);
      if (player && player.active && !player.isGM && target.actor) {
        promises.push(new Promise((resolve) => {
          const requestId = target.actor?.uuid ?? foundry.utils.randomID();
          this.defenceRequests[requestId] = resolve;
          if (player) requestPCActiveDefence(player, target.actor!, this.item.name, requestId, { formula, rollOptions: options, bonus: dcMod, coverBonus, workflow: this })
          // set a timeout for taking over the roll
          if (configSettings.playerSaveTimeout > 0) {
            this.defenceTimeouts[requestId] = setTimeout(async () => {
              if (this.defenceRequests[requestId]) {
                delete this.defenceRequests[requestId];
                delete this.defenceTimeouts[requestId];
                const result = await (new D20Roll(formula, {}, options)).evaluate();
                result.toMessage({ flavor: `${this.item.name} ${i18n("midi-qol.ActiveDefenceString")}` });
                resolve(result);
              }
            }, configSettings.playerSaveTimeout * 1000);
          }
        }));
      } else {  // must be a GM so can do the roll direct
        promises.push(
          new Promise(async (resolve) => {
            const result = await (new D20Roll(formula, {}, options)).evaluate();
            result.toMessage({ flavor: `${this.item.name} ${i18n("midi-qol.ActiveDefenceString")} ${options.criticalSuccess}/${options.criticalFailure}` }, { rollMode: toMessageMode(configSettings.optionalRules.activeDefenceShow) });
            // displayDSNForRoll(result, "attackRoll")
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
        results[i] = await new BasicRoll("1").evaluate();
      }
      const result = results[i];
      let rollTotal = results[i]?.total || 0;
      this.isFumble = result.dice[0].total >= criticalTarget; // save fumbled so critical hit
      this.isCritical = result.dice[0].total <= fumbleTarget; // save critical so fumbled attack
      this.activeDefenceRolls ??= {};
      // do Reactions for active defence
      let isHit = this.isCritical || rollTotal < (this.activeDefenceDC ?? 0);
      // check to see if the roll hit the target
      if (isHit && this.activity.attack && this.attackRoll && target !== null && !foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.noProvokeReaction`) && !this.workflowOptions.noProvokeReaction) {
        const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item.uuid }, { inplace: false, overwrite: true });
        // reaction is the same as reactionhit to accomodate the existing reaction workflow
        let reaction: {
          name?: string;
          uuid?: string;
          ac?: number;
        };
        if (!this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
          //@ts-expect-error no dnd5e-types
          const savedAC = target.actor.system.attributes.ac.value;
          reaction = await doReactions(target, this.tokenUuid, this.attackRoll, "reaction", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
          //@ts-expect-error no dnd5e-types
          const acChange = target.actor.system.attributes.ac.value - savedAC;
          rollTotal += (reaction.ac ?? 0) + acChange; // deal with bonus ac if any.
          results[i] = await new BasicRoll(`${rollTotal}`, {}, { type: "activeDefence" }).evaluate();

          // if (coverBonus === TOTAL_COVER) isHit = false; // bonusAC will only be TOTAL_COVER if cover bonus checking is enabled.
        }
      } else if (!isHit && this.activity.attack && this.attackRoll && target !== null && !foundry.utils.getProperty(this, `item.flags.${MODULE_ID}.noProvokeReaction`)) {
        const workflowOptions = foundry.utils.mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item.uuid }, { inplace: false, overwrite: true });
        if (!this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
          //@ts-expect-error no dnd5e-types
          const savedAC = target.actor.system.attributes.ac.value;
          let reaction: {
            name?: string;
            uuid?: string;
            ac?: number;
          } = await doReactions(target, this.tokenUuid, this.attackRoll, "reactionmissed", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
          //@ts-expect-error no dnd5e-types
          const acChange = target.actor.system.attributes.ac.value - savedAC;
          rollTotal += (reaction.ac ?? 0) + acChange; // deal with bonus ac if any.
          results[i] = await new BasicRoll(`${rollTotal}`, {}, { type: "activeDefence" }).evaluate();
        }
      }
      isHit = this.isCritical || rollTotal < (this.activeDefenceDC ?? 0);
      this.activeDefenceRolls[getTokenDocument(target)?.uuid ?? ""] = results[i];
      if (isHit)
        this.hitTargets = this.hitTargets.add(target);
      else {
        this.hitTargets.delete(target);
        this.hitTargets = this.hitTargets;
      }
      if (game.user?.isGM) log(`Active defence: ${target.name} rolled ${rollTotal} vs attack DC ${this.activeDefenceDC}`, results[i]);
      i++;
    }
  }

  async displayAttackRoll() {
    const chatMessage = this.chatCard;
    let newFlags = {};
    const searchRe = /<div[^>]*?class="midi-qol-attack-roll[^"]*"[\s\S]*?<div class="end-midi-qol-attack-roll">/;
    let DCString = "DC";
    DCString = i18n("DND5E.AbbreviationDC") ?? "DC";
    const attackString = `<label class="midi-qol-active-defence-dc">${DCString} ${this.activeDefenceDC}</label> ${i18n("midi-qol.ActiveDefenceString")}`;
    const replaceString = `<div class="midi-qol-attack-roll midi-qol-section-filled"><div class="midi-roll-label">${attackString}</div><div class="end-midi-qol-attack-roll">`;
    let content = chatMessage?.content.replace(searchRe, replaceString) ?? "";
    newFlags = {
      "midi-qol":
      {
        isHit: this.hitTargets.size > 0,
        isHitEC: this.hitTargetsEC.size > 0,
        isCritical: this.isCritical,
        isFumble: this.isFumble,
        targets: Array.from(this.targets).map(t => ({ uuid: getTokenDocument(t)?.uuid, name: getTokenDocument(t)?.name })),
        hitTargetUuids: Array.from(this.hitTargets).map(t => getTokenDocument(t)?.uuid),
        hitECTargetUuids: Array.from(this.hitTargetsEC).map(t => getTokenDocument(t)?.uuid),
      }
    };
    await this.performThrottledUpdate(chatMessage, { content, flags: newFlags, rolls: this.chatRolls });
  }
}
export class UserWorkflow extends Workflow {
  static get forceCreate() { return true; }
}

export class DamageOnlyWorkflow extends Workflow {
  itemCard: ChatMessage.Implementation | undefined;
  ready!: Promise<void>;
  constructor(
    actor: Actor.Implementation | null,
    token: Token.Implementation,
    damageTotal: number,
    damageType: string,
    targets: Token.Implementation[],
    roll: Roll,
    options: {
      flavor: string,
      itemCardId: string,
      itemCardUuid: string,
      damageList: DamageListEntry[],
      useOther: boolean,
      itemData: Item.Source,
      isCritical: boolean,
      item?: Item,
      storeWorkflow?: boolean
    }) {
    if (options.storeWorkflow === undefined) options.storeWorkflow = true;
    if (!actor) actor = token.actor ?? targets[0]?.actor;
    const theTargets = Array.from(targets).map(t => getToken(t)).filter(t => !!t);
    let damageRoll = roll;
    if (!damageRoll) {
      // @ts-expect-error no dnd5e-types
      damageRoll = new CONFIG.Dice.DamageRoll(`${damageTotal}`, {}, { type: damageType }).evaluateSync();
    }
    let theItem: Item.Implementation | null = null;
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
              forceConfigDialog: "default",
              forceRollDialog: "default",
              forceDamageDialog: "default",
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
      foundry.utils.setProperty(itemData, midiFlag(`syntheticItem`), true);
      foundry.utils.setProperty(itemData, "_id", itemData._id ?? foundry.utils.randomID());
      theItem = new CONFIG.Item.documentClass(itemData, { parent: actor });
    } else {
      foundry.utils.setProperty(extraItemData, midiFlag(`syntheticItem`), true);
      //@ts-expect-error no dnd5e types
      theItem = new CONFIG.Item.documentClass(extraItemData, { parent: actor });
    }
    if (!theItem) throw new Error("DamageOnlyWorkflow | could not create synthetic item"); // cannot return before super()

    // theItem.setFlag = async (scope: string, key: string, value: any) => { return theItem };
    theItem.prepareData();
    // @ts-expect-error no dnd5e-types
    theItem.prepareFinalAttributes();
    // @ts-expect-error no dnd5e-types
    super(actor, theItem.system.activities.contents[0], ChatMessage.getSpeaker({ token, actor }), new Set(theTargets), { event: shiftOnlyEvent as KeyboardEvent, workflowOptions: { noOnUseMacro: true } });
    // Do the supplied damageRoll
    this.flavor = options.flavor;
    this.defaultDamageType = GameSystemConfig.damageTypes[damageType]?.label ?? damageType;
    // Since this could to be the same item don't roll the on use macro, since this could loop forever
    if (this.item) foundry.utils.setProperty(this.item, midiFlag(`onUseMacroName`), null);
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
    this.ready = this.setDamageRolls([damageRoll]).then(async () => {
      this.damageTotal = damageTotal;
      this.isCritical = options.isCritical ?? false;
      this.kickStart = false;
      this.suspended = false;
      await this.performState(this.WorkflowState_Start);
    });
    return this;
  }
  static get forceCreate() { return false; }
  async WorkflowState_Start(context: WorkflowContext = {}): Promise<WorkflowState> {
    this.effectsAlreadyExpired = [];

    if (this.itemCardUuid === "new" || !fromUuidSync(this.itemCardUuid)) {
      const message = {}
      const messageConfig = foundry.utils.mergeObject({
        create: true,
        data: {
          flags: {
            dnd5e: {
              ...(this.activity.messageFlags as AnyObject),
              messageType: "usage",
              use: {
                // @ts-expect-error TODO: is this right?
                effects: this.applicableEffects?.map(e => e.id)
              }
            }
          },
          rolls: this.damageRolls,
        },
        hasConsumption: false
      }, message);
      // @ts-expect-error no dnd5e-types
      this.itemCard = await this.activity._createUsageMessage(messageConfig);
      this.itemCardUuid = this.itemCard?.uuid;
    }
    const whisperCard = configSettings.autoCheckHit === "whisper" || safeGetGameSetting("core", "messageMode") === "blind";
    if (this.actor) { // Hacky process bonus flags
      // TODO come back and fix this for dnd3
      const newRolls = await this.processDamageRollBonusFlags(this.damageRolls);
      await this.setDamageRolls(newRolls);
    }

    if (this.itemCardUuid) {
      this.isFumble = false;
      this.attackTotal = 9999;
      this.recordTargetACModifiers();
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
  onUseMacroCalled: boolean | undefined;
  targetsPassedToConstructor: boolean;
  static get forceCreate() { return false; }
  constructor(
    actor: Actor,
    activity: Activity,
    targets: Array<Token> | undefined,
    templateLocation: { x: number, y: number, direction?: number, removeDelay?: number } | undefined = undefined,
    _trapSound: { playlist: string, sound: string } | undefined = undefined,
    event: any = {},
    _storeWorkflow: boolean = false) {
    super(actor, activity, ChatMessage.getSpeaker({ actor }), new Set(targets ?? []), { event, storeWorkflow: false });
    this.targetsPassedToConstructor = targets !== undefined;
    // Sync game.user.targets from targets passed to constructor (for non-AoE activities)
    if (this.targetsPassedToConstructor && targets && targets.length > 0) {
      game.user?.targets.forEach(t => t.setTarget(false, { releaseOthers: false }));
      game.user?.targets.clear();
      for (const t of targets) {
        t.setTarget(true, { releaseOthers: false });
        game.user?.targets.add(t);
      }
    }
    if (templateLocation) this.templateLocation = templateLocation;
    // Use fastForwardAttack/fastForwardDamage instead of shiftOnlyEvent to skip dialogs
    // Clear any event passed to constructor - it lacks target property that dnd5e's buildPost expects
    this.rollOptions.event = undefined;
    this.rollOptions.fastForwardAttack = true;
    this.rollOptions.fastForwardDamage = true;
    this.kickStart = false;
    this.suspended = false;
    // @ts-expect-error no dnd5e-types
    this.activity.use({ configure: false, workflow: this, midiOptions: { workflowOptions: this.workflowOptions } }, {}, {})
    // this.performState(this.WorkflowState_Start);
    return this;
  }

  get workflowType() { return "TrapWorkflow" }

  async WorkflowState_Start(context: WorkflowContext = {}): Promise<WorkflowState> {
    this.saveTargets = validTargetTokens(new Set(game.user?.targets));
    this.effectsAlreadyExpired = [];
    this.onUseMacroCalled = false;
    if (debugEnabled > 1) debug(" Trapworkflow | WorkflowState_Start ", this.item, getActivityAutoTargetAction(this.activity), activityHasAreaTarget(this.activity), this.targets);
    // don't support the placement of a template
    return this.WorkflowState_AwaitTemplate
  }
  async WorkflowState_AwaitTemplate(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (activityHasEmanationNoTemplate(this.activity)) {
      // Targets have already been set in activity.use
      return this.WorkflowState_TemplatePlaced;
    }
    if (!activityHasAreaTarget(this.activity) || !this.templateLocation) {
      return this.WorkflowState_TemplatePlaced;
    }
    //@ts-expect-error no dnd5e-types
    const TemplateClass = game.system.canvas.AbilityTemplate;
    const abilityTemplates = TemplateClass.fromActivity(this.activity);
    const templateData: any = abilityTemplates[0].document.toObject(false);
    // template.draw();
    // get the x and y position from the trapped token
    templateData.x = this.templateLocation?.x || 0;
    templateData.y = this.templateLocation?.y || 0;
    templateData.direction = this.templateLocation?.direction || 0;

    // Create the template
    let templates = await (canvas.scene as unknown as Scene)?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
    if (templates) {
      for (const tDoc of templates) {
        if (!tDoc?.uuid) continue;
        // v14: resolve proxy MeasuredTemplate to actual RegionDocument
        const regionDoc = tDoc._id ? canvas.scene?.regions.get(tDoc._id) : undefined;
        const docToStore = regionDoc ?? tDoc;
        this.templateUuid = docToStore.uuid;
        await this.setupTemplateCleanup(docToStore);
      }
      this.placedTemplateCount = templates.length;
      this.selectAllTemplateTargets();
      if (this.templateLocation?.removeDelay) {
        let ids: string[] = templates.map(td => td._id as string)
        //TODO test this again
        // v14: templates are backed by Regions — delete as Region documents
        setTimeout(() => canvas.scene?.deleteEmbeddedDocuments("Region", ids), this.templateLocation.removeDelay * 1000);
      }
    }
    return this.WorkflowState_TemplatePlaced
  }
  async WorkflowState_TemplatePlaced(context: WorkflowContext = {}): Promise<WorkflowState> {
    return this.WorkflowState_ValidateRoll;
  }
  async WorkflowState_ValidateRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    // do pre roll checks
    return this.WorkflowState_WaitForAttackRoll
  }
  async WorkflowState_WaitForAttackRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    // Check if we're being unsuspended after attack roll completed
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;

    if (!this.activity.attack && !this.activity.hasAttack) {
      // No attack on activity, all targets are hit
      this.hitTargets = new Set(this.targets);
      this.hitTargetsEC = new Set();
      return this.WorkflowState_WaitForSaves;
    }
    warn("TrapWorkflow | WaitForAttackRoll rolling attack for", this.activity.name, "hasAttack:", this.activity.hasAttack, "attack:", this.activity.attack);
    // TrapWorkflow has no event - dialog skipping is controlled via rollOptions.fastForwardAttack
    this.activity.rollAttack?.({ workflow: this, midiOptions: { workflowOptions: this.workflowOptions } }, {}, {});
    return this.WorkflowState_Suspend;
  }
  async WorkflowState_AttackRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    await this.processAttackRoll();
    this.recordAttackStats();
    await this.displayAttackRoll();
    this.recordTargetACModifiers();
    await this.checkHits(this.workflowOptions);
    const whisperCard = configSettings.autoCheckHit === "whisper" || safeGetGameSetting("core", "messageMode") === "blind";
    await this.displayHits(whisperCard);
    return this.WorkflowState_WaitForSaves;
  }
  setDescriptorACModifiers() {
    throw new Error("Method not implemented.");
  }
  async WorkflowState_WaitForSaves(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (!this.activityHasSave) {
      this.saves = new Set(); // no saving throw, so no-one saves
      const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
      this.failedSaves = new Set(allHitTargets);
      return this.WorkflowState_WaitForDamageRoll;
    }
    let hookId = Hooks.on("createChatMessage", this.processSaveRoll.bind(this));
    let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
    //@ts-expect-error flash-rolls-5e custom hook
    let flashId = Hooks.on("flash-rolls-5e.rollComplete", this.flashSavingCheck.bind(this));
    try {
      const saveDisplay = (this.activity.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity.saveDisplay;
      await this.checkSaves(saveDisplay !== "allShow");
    } catch (err) {
      TroubleShooter.recordError(err, "checkSaves");
    } finally {
      Hooks.off("createChatMessage", hookId);
      Hooks.off("updateChatMessage", monksId);
      //@ts-expect-error flash-rolls-5e custom hook
      Hooks.off("flash-rolls-5e.rollComplete", flashId);
    }
    if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks.events["renderChatMessageHTML"]?.length);
    const saveDisplay = (this.activity.saveDisplay ?? "default") === "default" ? configSettings.autoCheckSaves : this.activity.saveDisplay;
    await this.displaySaves(saveDisplay === "whisper");
    return this.WorkflowState_SavesComplete;
  }
  async WorkflowState_SavesComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    return this.WorkflowState_WaitForDamageRoll
  }

  async WorkflowState_WaitForDamageRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (context.damageRoll) return this.WorkflowState_DamageRollComplete;
    if (!this.activity.hasDamage && !this.activity.hasHealing) return this.WorkflowState_AllRollsComplete;

    if (this.isFumble) {
      // fumble means no trap damage/effects
      return this.WorkflowState_RollFinished;
    }
    if (debugEnabled > 1) debug("TrapWorkflow: Rolling damage ", this.rollOptions.event, this.spellLevel, this.workflowOptions.versatile, this.targets, this.hitTargets);
    this.rollOptions.fastForward = true;
    this.activity.rollDamage({ workflow: this, midiOptions: { ...this.rollOptions, workflowOptions: this.workflowOptions } }, {}, {});
    return this.WorkflowState_Suspend; // wait for a damage roll to advance the state.
  }
  async WorkflowState_DamageRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    // If the item does damage, use the same damage type as the item
    /*
    let defaultDamageType = getActivityDefaultDamageType(this) ?? this.defaultDamageType
    this.rawDamageDetail = createDamageDetail({ roll: this.damageRolls, activity: this.activity, defaultType: defaultDamageType });
    if (this.bonusDamageRolls)
      this.rawBonusDamageDetail = createDamageDetail({ roll: this.bonusDamageRolls, activity: this.activity, defaultType: defaultDamageType });
    else
      this.rawBonusDamageDetail = [];
    if (this.otherDamageRolls)
      this.rawOtherDamageDetail = createDamageDetail({ roll: this.otherDamageRolls, activity: this.activity, defaultType: defaultDamageType });
    else
      this.rawOtherDamageDetail = [];
    */
    // apply damage to targets plus saves plus immunities
    await this.displayDamageRolls();
    if (this.isFumble) {
      return this.WorkflowState_ApplyDynamicEffects
    }
    return this.WorkflowState_AllRollsComplete;
  }
  async WorkflowState_AllRollsComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (debugEnabled > 1) debug("all rolls complete ", foundry.utils.duplicate(this.rawDamageDetail))
    if (this.rawDamageDetail?.length) await processDamageRoll(this, this.rawDamageDetail[0].type)
    this.recordDamageStats();
    return this.WorkflowState_ApplyDynamicEffects;
  }
  async WorkflowState_RollFinished(context: WorkflowContext = {}): Promise<WorkflowState> {
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
  DDBGameLogHookId: number | undefined;
  needsDamage: boolean;
  needsOtherDamage: boolean | undefined;
  static get forceCreate() { return false }
  static get(id: string): DDBGameLogWorkflow | undefined {
    return Workflow.getWorkflow(id) as DDBGameLogWorkflow | undefined;
  }

  constructor(actor: Actor.Implementation, activity: Activity, speaker: ChatMessage.SpeakerData, targets: Token.Implementation[], options: any) {
    super(actor, activity, speaker, targets, options);
    this.expectedTemplateCount = activityHasAreaTarget(this.activity) ? 1 : 0;
    this.templateUuids = [];
    // this.needItemCard = false; TODO see where this is used
    this.needsDamage = !!this.activity.hasDamage;
    this.attackRolled = !activity.hasAttack;
    // @ts-expect-error TODO: this
    if (configSettings.undoWorkflow) this.undoData = { actorUuid: actor?.uuid, itemUuid: this.item.uuid, targets: Array.from(targets).map(t => t.id), options: options };
    this.kickStart = true;
    this.flagTags = { "ddb-game-log": { "midi-generated": true } };
    if (configSettings.undoWorkflow) saveUndoData(this);
  }

  async complete() {
    if (this.chatCard) {
      await this.chatCard.update({
        flags: { "midi-qol": { type: MESSAGE_TYPES.HITS } },
      });
    }
  }
  async WorkflowState_PreambleComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    return super.WorkflowState_PreambleComplete(context);
  }

  async WorkflowState_WaitForAttackRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    if (!this.activity.attack) {
      return this.WorkflowState_AttackRollComplete;
    }
    if (!this.attackRolled) return this.WorkflowState_Suspend;
    return this.WorkflowState_AttackRollComplete;
  }
  async WorkflowState_AttackRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    this.effectsAlreadyExpired = [];
    if (checkRule("removeHiddenInvis")) await removeHidden.bind(this)();
    await this.callMidiHooks("midi-qol.preCheckHits");

    if (debugEnabled > 1) debug(this.attackRollHTML)
    if (configSettings.autoCheckHit !== "none" && this.activity.attack) {
      this.recordTargetACModifiers(); // Not sure this is relevant
      await this.checkHits(this.workflowOptions);
      await this.displayHits(configSettings.autoCheckHit === "whisper");
    }
    await this.callMidiHooks("midi-qol.AttackRollComplete");
    if (this.aborted) return this.WorkflowState_Abort;
    return this.WorkflowState_WaitForDamageRoll;
  }

  async WorkflowState_AwaitTemplate(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (!activityHasAreaTarget(this.activity)) return super.WorkflowState_AwaitTemplate;
    let system: any = game.system;
    // Create the template
    const template = system.canvas.AbilityTemplate.fromActivity(this.activity);
    if (template) template.drawPreview();
    return super.WorkflowState_AwaitTemplate;
  }
  async WorkflowState_WaitForDamageRoll(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (this.needsDamage && this.activity.hasDamage) return this.WorkflowState_Suspend;
    if (this.needsOtherDamage) return this.WorkflowState_Suspend;
    if (context.attackRoll) return this.WorkflowState_AttackRollComplete;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    this.failedSaves = new Set(allHitTargets);
    if (!this.activity.hasDamage && !this.activity.hasHealing) return this.WorkflowState_WaitForSaves;
    return this.WorkflowState_DamageRollComplete;
  }
  async WorkflowState_DamageRollComplete(context: WorkflowContext = {}): Promise<WorkflowState> {
    this.defaultDamageType = getActivityDefaultDamageType(this) ?? this.defaultDamageType ?? MidiQOL.MQdefaultDamageType;
    if (this.activity.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(this.defaultDamageType ?? "")) this.defaultDamageType = "healing";

    this.rawDamageDetail = createDamageDetail({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });

    await this.rollAllBonusDamage();
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
      this.targets = validTargetTokens(new Set(game.user?.targets));
      this.hitTargets = validTargetTokens(new Set(game.user?.targets));
      this.hitTargetsEC = new Set();
    }
    // apply damage to targets plus saves plus immunities
    if (this.isFumble) { //TODO: Is this right?
      return this.WorkflowState_RollFinished;
    }
    if (this.activity.save) return this.WorkflowState_WaitForSaves
    return this.WorkflowState_AllRollsComplete;
  }

  async WorkflowState_RollFinished(context: WorkflowContext = {}): Promise<WorkflowState> {
    if (this.postSummonHookId) Hooks.off("dnd5e.postSummon", this.postSummonHookId);
    await super.WorkflowState_RollFinished();
    return this.WorkflowState_Suspend;
  }
}

export class DummyWorkflow extends Workflow {
  static get forceCreate() { return false }
  expectedAttackRoll: number | undefined;
  _dummyActor: Actor.Implementation | undefined;
  //@ts-expect-error dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, activity: any, speaker, targets, options: any) {
    options.noTemplateHook = true;
    super(actor, activity, speaker, targets, options);
    this._dummyActor = actor;
    this.advantage = options?.advantage;
    this.disadvantage = options?.disadvantage
    this.rollOptions.fastForward = options?.fastForward;
  }

  override get actor(): Actor.Implementation {
    return this._dummyActor ?? super.actor;
  }

  async performState(newState: WorkflowState) {
    return super.performState(this.WorkflowState_Suspend);
  }
  async simulateSave(targets: Token.Implementation[]) {
    this.targets = new Set(targets);
    this.hitTargets = new Set(targets)
    this.initSaveResults();
    await this.checkSaves(true, true);
    for (let result of this.saveResults!) {
      // @ts-expect-error what is happening
      result.saveAdvantage = result.options.advantageMode === 1;
      // @ts-expect-error what is happening
      result.saveDisadvantage = result.options.advantageMode === -1;
      //@ts-expect-error
      const D20Roll = CONFIG.Dice.D20Roll;
      // @ts-expect-error what is happening
      result.saveRoll = await new D20Roll(result.formula).evaluate();
      // @ts-expect-error what is happening
      const maxroll = (await result.saveRoll?.reroll({ maximize: true }))?.total;
      // @ts-expect-error what is happening
      const minroll = (await result.saveRoll?.reroll({ minimize: true }))?.total;
      // @ts-expect-error what is happening
      result.expectedSaveRoll = ((maxroll || 0) + (minroll || 0)) / 2;
      // @ts-expect-error what is happening
      if (result.saveAdvantage) result.expectedSaveRoll += 3.325;
      // @ts-expect-error what is happening
      if (result.saveDisadvantage) result.expectedSaveRoll -= 3.325;
    }
    return this;
  }
  async simulateAttack(target: Token.Implementation) {
    this.targets = new Set([target]);
    await this.checkAttackAdvantage(); // resets tracker internally
    // Block updates to quantity
    //@ts-expect-error
    const hookId = Hooks.on("dnd5e.rollAttack", (item, roll, ammoUpdate) => {
      if (item === this.item && ammoUpdate?.length) ammoUpdate.length = 0
    });
    try {
      [this.attackRoll] = await this.activity.rollAttack?.({ midiOptions: { fastForward: true, chatMessage: false, isDummy: true, workflowOptions: this.workflowOptions } }, {}, {}) as Roll[];
    } catch (err) {
      TroubleShooter.recordError(err, "simulate attack");
    } finally {
      Hooks.off("dnd5e.rollAttack", hookId)
    }
    const maxroll = (await this.attackRoll?.reroll({ maximize: true }))?.total;
    const minroll = (await this.attackRoll?.reroll({ minimize: true }))?.total;
    this.expectedAttackRoll = ((maxroll || 0) + (minroll || 0)) / 2;
    if (this.advantage) this.expectedAttackRoll += 3.325;
    if (this.disadvantage) this.expectedAttackRoll -= 3.325;
    return this;
  }
}

// Registry of workflow classes for dynamic lookup (avoids eval)
// Using a looser type since subclasses have different constructor signatures
export const WorkflowRegistry: Record<string, new (...args: any[]) => Workflow> = {
  Workflow,
  SavesFirstWorkflow,
  ActiveDefenceWorkflow,
  UserWorkflow,
  DamageOnlyWorkflow,
  TrapWorkflow,
  DDBGameLogWorkflow,
  DummyWorkflow,
};

// `options` arg for Workflow
type WorkflowConstructorOptions = InexactPartial<{
  chatCardUuid: string;
  event: MouseEvent | KeyboardEvent;
  item: Item.Implementation;
  noOptionalRules: boolean;
  noTemplateHook: boolean;
  rollOptions: WorkflowRollOptions
  storeWorkflow: boolean;
  token: Token.Implementation;
  workflowOptions: WorkflowOptions
}>;

type TrapWorkflowConstructorOptions = WorkflowConstructorOptions & {
  templateLocation: { x: number, y: number, direction?: number, removeDelay?: number };
  trapSound: { playlist: string, sound: string };
}

// `workflowOptions`
export type WorkflowOptions = InexactPartial<{
  advantage: boolean;
  allowIncapacitated: boolean;
  /**
   * Caller-supplied control over per-target attack splitting: true forces it on, false off,
   * absent falls through to the activity flag and the world setting. The pre-13 item-based
   * implementation passed false into each iteration of its own loop to stop it re-splitting.
   * Nothing has written it since that implementation was replaced (68664c1f, 2024-11-10), so
   * the sole remaining read — activityHelpers.requiresTargetConfirmation — is vestigial.
   */
  attackPerTarget: boolean;
  /**
   * Status, not control: this invocation is one iteration of a per-target attack roll. Set by
   * AttackActivity via setProperty. Distinct from attackPerTarget above, which is an input.
   */
  rollAttackPerTarget: boolean;
  attackMode: string;
  attackRollDSN: boolean;
  autoConsumeResource: string;
  autoFastAttack: boolean;
  autoRollAttack: boolean;
  autoRollDamage: string;
  chatMessage: boolean;
  damageRollDSN: boolean;
  disadvantage: boolean;
  event: AugmentedEvent;
  excludeTargets: string[];
  includeTargets: string[];
  fastForward: boolean;
  fastForwardAbility: boolean;
  fastForwardAttack: boolean;
  fastForwardDamage: boolean;
  fastForwardSet: boolean;
  forceCompletion: boolean;
  forceTemplateTargeting: boolean;
  formulaDSN: boolean;
  ignoreUserTargets: boolean;
  isCritical: boolean;
  isMagicSave: boolean;
  isReaction: boolean;
  item: Item.Implementation;
  noConcentrationCheck: boolean;
  noOnUseMacro: boolean;
  noProvokeReaction: boolean;
  noTargetOnUseMacro: boolean;
  noUseWarning: boolean;
  notBonusAction: boolean;
  notReaction: boolean;
  onlyOnUseItemMacros: boolean;
  other: boolean;
  parts: string[];
  rollToggle: boolean;
  rollType: string;
  saveItem: Item.Implementation;
  saveItemUuid: string;
  simulate: boolean;
  target: number;
  targetConfirmation: string;
  updateWorkflow: boolean;
  versatile: boolean;
  workflowName: string;
  castUsesReaction: boolean;
  castUsesBonusAction: boolean;
  coverOrigin: { x: number, y: number, elevation?: number };
  templateUuid: string;
  preSelectedTargetUuids: string[];
  // UUID of the over-time effect that triggered this workflow, used by overtime processing.
  overTimeEffectUuid: string;
}>

// Workflow's `rollOptions`
export type WorkflowRollOptions = InexactPartial<{
  event: AugmentedEvent;
  fastForward: boolean;
  fastForwardAttack: boolean;
  fastForwardDamage: boolean;
  isCritical: boolean;
  rollToggle: boolean;
}>;

export type UndoData = {
  id: string;
  userId?: string;
  itemName?: string;
  itemUuid?: string;
  userName?: string;
  tokendocUuid?: string;
  actorUuid: string;
  actorName?: string;
  chatCardUuids: string[];
  isReaction: boolean;
  templateUuids: string[];
  sequencerUuid?: string;
  serverTime?: number;
  itemCardUuid?: string;
  actorEntry?: {
    actorUuid: string;
    tokenUuid?: string;
    actorData?: Actor.Source;
    tokenData?: TokenDocument.Source;
  };
  allTargets?: Collection<{
    tokenUuid: string;
    actorUuid: string;
    actorData?: Actor.Source;
    tokenData?: TokenDocument.Source;
  }>;
  targets?: {
    tokenUuid: string;
    actorUuid: string;
  }[]
}

// `context` passed to some functions
type WorkflowContext = InexactPartial<{
  attackRoll: Roll;
  damageRoll: Roll;
  itemCardUuid: string;
  itemUseComplete: boolean;
  noDamage: boolean;
  otherDamageRoll: Roll;
  utilityRolls: Roll[];
}>;

type MidiMacroData = {
  actor?: Actor.Implementation;
  actorData?: Actor.Source;
  actorUuid?: string;
  advantage?: boolean;
  attackD20: number;
  attackRoll?: Roll;
  attackTotal: number;
  bonusDamageDetail?: DamageDescription[];
  bonusDamageHTML?: string;
  bonusDamageRoll?: Roll;
  bonusDamageRolls?: Roll[];
  bonusDamageTotal?: number;
  castData: unknown;
  castLevel: number;
  criticalSaves: TokenDocument.Implementation[];
  criticalSaveUuids: string[];
  damageDetail?: DamageDescription[];
  damageList: DamageListEntry[];
  damageRoll?: Roll;
  damageRolls: Roll[];
  damageTotal: number;
  diceRoll: number;
  disadvantage?: boolean;
  event?: AugmentedEvent;
  failedSaves: TokenDocument.Implementation[];
  failedSaveUuids: string[];
  fumbleSaves: TokenDocument.Implementation[];
  fumbleSaveUuids: string[];
  hitTargets: TokenDocument.Implementation[];
  hitTargetsEC: TokenDocument.Implementation[];
  hitTargetUuids: string[];
  hitTargetUuidsEC: string[];
  id: string;
  isCritical?: boolean;
  isFumble: boolean;
  item: Item.Source & { uuid?: string };
  itemCardUuid?: string;
  itemData: Item.Source & { uuid?: string };
  itemUuid?: string;
  macroPass?: string;
  options?: AnyObject;
  otherDamageDetail?: DamageDescription[];
  otherDamageList?: DamageListEntry[];
  otherDamageTotal?: number;
  roll?: Roll;
  rollData: AnyObject;
  rollOptions: WorkflowRollOptions;
  saves: TokenDocument.Implementation[];
  saveUuids: string[];
  semiSuperSavers: TokenDocument.Implementation[];
  semiSuperSaverUuids: string[];
  sourceItemUuid?: string;
  speaker?: ChatMessage.SpeakerData;
  spellLevel: number;
  superSavers: TokenDocument.Implementation[];
  superSaverUuids: string[];
  tag?: string;
  targets: TokenDocument.Implementation[];
  targetUuids: string[];
  templateId?: string;
  templateUuid?: string;
  templateUuids?: string[];
  tokenUuid?: string;
  utilityRoll?: Roll;
  utilityRolls?: Roll[];
  uuid?: string;
  workflow: Workflow;
  workflowId: string;
  workflowOptions: WorkflowOptions;
}

export interface AugmentedEvent extends Event {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  type: string;
}
