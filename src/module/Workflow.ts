import { isRollOf } from "./rolls/common.js";
import { withFixedDice, type FixedDice } from "./lib/fixedDice.js";
import { attachRegionActivityBehavior } from "./activities/regions.js";
import { hasConsumption, shouldAutoConsume } from "./activities/use.js";
import { isMidiActivityType } from "./activities/midiActivity.js";
import { setupCanSeeSense } from "./activities/useChecks.js";
import { rollOtherDamage } from "./rolls/damage.js";
import { allSteps, getStep, REACTION_STEPS, stepForMethod, type StepContext } from "./steps/steps.js";
import { MIDI_SAVE_PROVIDERS, requestSaves, settingsProviderFor, type SaveRequest, type SaveRequestEntry } from "./services/saveRequests/service.js";
import { PendingSaves } from "./services/saveRequests/pending.js";
import { deprecation, removedError } from "./lib/compatLine.js";
import { assembleSteps, stepAfterInFlow, type AssembledSteps, type StepChange, type StepChangeInput } from "./steps/assembly.js";
import { missingSteps, reportAssembly, useStepChanges } from "./steps/api.js";
import { flowVariant, getFlow } from "./steps/flows.js";
import { ABORT, runSteps, SUSPEND, type EngineHost, type StepMove } from "./steps/engine.js";
import { PORT_NAMES, type PortName, type WorkflowPorts } from "./steps/ports.js";
import { getDistance } from "./services/distance/service.js";
import { computeFlankedStatus, computeFlankingStatus } from "./services/flanking/service.js";
import { speakerFor } from "./utils.js";
import { warn, debug, log, i18n, i18nFormat, busyWait, error, debugEnabled, MQItemMacroLabel, GameSystemConfig, MODULE_ID, MQActivityMacroLabel, gameStats, MQDamageRollTypes } from "../midi-qol.js";
import { TeleportOption } from "./activities/teleport.js";
import { cardWorkflowOptions, decodeWorkflowOptions, inheritableWorkflowOptions } from "./lib/workflowOptionsCodec.js";
import { eventModifiers } from "./lib/rollKeys.js";
import { TokenDocumentSet, hookTarget, tokenOf } from "./lib/tokenDocumentSet.js";
import type { TagSnapshot } from "./lib/tags.js";
import { chosenEffectId, rolledDamageTypeChoice, type ChoiceValue, type StoredChoice } from "./lib/choices.js";
import { RECORD_SETS, RecordSet, RecordFacts, STATE_KEYS, StateKey, attributionMap, attributionTriples, cardDamageRolls, cardMidi, rollTypeOf, cardOtherConsumption, cardPreSelected, messagesFrom, recordList, recordPath, recordPathOfUuid, storedMidiFlag } from "./lib/cardState.js";
import { preferredActiveGM, rollAbility, useDamageList, SAVE_REQUEST, socketlibSocket, timedAwaitExecuteAsGM, timedExecuteAsGM, unTimedExecuteAsGM } from "./GMAction.js";
import { askUser } from "./lib/requests.js";
import { beginPlayerWait, endPlayerWaitsOwnedBy, rollDialogsFor, trackPlayerWait, type WaitChoiceSpec } from "./lib/playerWaits.js";
import { installedModules } from "./setupModules.js";
import { offerFollowUps } from "./followUps.js";
import { configSettings, autoRemoveTargets, checkRule, checkMechanic, safeGetGameSetting, useWeakReferences, onUseMacroOptions, chatCardUpdates } from "./settings.js";
import { challengeVisibleToPlayers, saveDisplayMode } from "./lib/saveVisibility.js";
import { BONUS_REQUEST, createDamageDetail, processDamageRoll, reconstructDamageLists, untargetDeadTokens, checkIncapacitated, getAutoRollDamage, isAutoFastForward, getAutoRollAttack, checkNearby, expireMyEffects, validTargetTokens, userTargetsKeepingUndrawn, HEALING_BUTTON_KEY, isActivityType, getOrCreateTokenForActorAsSet, doReactions, type ReactionResult, playerFor, requestPCActiveDefence, evalActivationCondition, asyncHooksCallAll, asyncHooksCall, renderSaveRollHTML, markFlanking, tokenForActor, getOrCreateTokenForActor, createConditionData, evalCondition, computeCoverBonus, computeTargetAC, TOTAL_COVER, THREE_QUARTERS_COVER, HALF_COVER, hasCoverTotal, isInCombat, displayDSNForRoll, setActionUsed, getTokenDocument, getToken, addRollTo, sumRolls, throttledUpdate, getCachedDocument, getUpdatesCache, clearUpdatesCache, getDamageType, getTokenName, tokenPortrait, setRollOperatorEvaluated, evalAllConditions, evalAllConditionsAsync, getAppliedEffects, CEAddEffectWith, getCEEffectByName, CEHasEffectApplied, CERemoveEffect, CEToggleEffect, getActivityDefaultDamageType, activityHasAreaTarget, DSNMarkDiceDisplayed, expectedTemplateCount, getSaveMultiplierForActivity, checkActivityRange, isRangeCheckable, getActivityAutoTargetAction, activityHasEmanationNoTemplate, completeActivityUse, getActor, getConcentrationEffect, convertDuration, getRemoveAllButtons, requestPCSave, pcSaveOptions, addUpdatesCache, MidiOptions, getOptionalCountRemainingShortFlag, bonusDialog, getTargetDescriptor, queueUpdate, addAttribution, renderAttributionTooltip, getAdvantageModeTitle, resolveItemMacro, resolveActivityMacro, midiFlag, updateUserTargets, getConsumptionData, toMessageMode, toLegacyRollMode, isDnd5eRollMessage, rollAnswersRequest, type SaveRequestKind, dnd5eRollType, tokenSourceElevation, applyStatusCondition } from "./utils.js";
import { OnUseMacros } from "./apps/Item.js";
import { bonusCheck, collectBonusFlags, defaultRollOptions, buildPreComputedAdvantageMap, checkActivityAbilities } from "./patching.js";
import { collectRollModifiers } from "./services/rollModifiers/service.js";
import { collectDamageContributions } from "./services/damageContributions/service.js";
import { collectBonusCandidates, spendBonusCost, type OfferedBonus, type RollBonusQuery } from "./services/rollBonuses/service.js";
import { reportServiceProblem } from "./api/services.js";
import { saveTargetsUndoData, saveUndoData } from "./undo.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { restoredUse, useChangesJson } from "./lib/useChanges.js";
import { SECTION_TEMPLATES, USAGE_MESSAGE_TYPE, cardSaveRoll, type MidiCardSection, type SectionName } from "./ChatClasses/UsageCardMessage.js";
import { activityHasScaledTargetCount, computeActivityTemplateTargets, computeOffLevelTemplateTargets, createActivityTemplateRegions, postTemplateConfirmTargets, regionShapeOrigin, setDamageRollMinTerms } from "./activities/activityHelpers.js";
import { Activity, Dnd5eChatMessage, ActivitySave, ActivityCheck, ActivityUseConfiguration, DamageDescription, DamageListEntry, TokenOrDocument, DND5ETargetDescriptor, CombinedTargetDescriptor, ActivityEffectData, QueueSaveRollOptions, SaveDetails, ProcessTargetSaveContext, ModuleIntegrationFlags, ModuleIntegrationRequests, MonksTokenBarRequest, FlashRollsRequest, EpicRollsRequest, RollProcessConfig, RollDialogConfig } from "../globals.js";
import { AnyMutableObject, AnyObject, EmptyObject, InexactPartial } from "fvtt-types/utils";
import Token = foundry.canvas.placeables.Token;
import { computeAttackAdvantage } from "./rolls/attack.js";
import { collectDamageRules, DamageRules, mergeDamageRules, sameDamageRules, storeDamageRules } from "./lib/damageRules.js";
import { RollModifierTracker, CriticalModifierFlags, computeCriticalModifiers, computeTargetCriticalModifiers, getFlagDisplayName } from "./lib/RollModifierTracker.js";

/**
 * Result of resolving a macro specification in callMacro.
 * Either macro (for world/compendium macros) or macroData (for item/function macros) will be set.
 */
interface ResolvedMacro {
  macro?: Macro.Implementation;
  macroData?: Macro.CreateData;
  item?: Item.Implementation | Item.InitializedData;
  macroActivity?: Activity;
  sourceItemUuid?: string | null;
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

export type AttributionType = 'ADV' | 'DIS' | 'NOADV' | 'NODIS' | 'CRIT' | 'NOCRIT' | 'FUMBLE' | 'NOFUMBLE';
export type AttributionMap = Partial<Record<AttributionType, Record<string, string>>>;
export interface AttributionEntry {
  type: AttributionType;
  /** Source identifier (e.g., "invisible", "flanking", "magicResistance") */
  source: string;
  /** Human-readable display name for tooltips */
  displayName: string;
}

export interface DamageDescriptionObject extends Omit<DamageDescription, 'properties'> {
  properties: string[];
};
export function damageDetailToObject(damageDetail?: DamageDescription[]): DamageDescriptionObject[] {
  return (damageDetail ?? []).map(d => ({
    ...d,
    properties: Array.from(d.properties ?? [])
  }));
}

type DamageBonusMacroSingleResult = {
  damageRoll?: string;
  flavor?: string;
  damageType?: string;
};
type DamageBonusMacroResult = DamageBonusMacroSingleResult[] | DamageBonusMacroSingleResult;

/** Where a step goes: a step id (`"midi-qol.WaitForSaves"`), or for old callers a state method */
export type WorkflowState = undefined | string | StateMethod;
/** A step's `WorkflowState_<name>` method */
export type StateMethod = () => Promise<WorkflowState>;
/** What a suspended workflow is woken by (Workflow#resume) */
export type WorkflowEvent = "attackRolled" | "damageRolled" | "noDamage" | "utilityRolled";
export type WorkflowOutcome = "ok" | "allMissed" | "invalid" | "split" | "manualSaves" | "cancelled" | "aborted";

// The states whose end is a chat card milestone (Workflow#performState). Cleanup's end is the use's completion
// (postCleanup, which completeActivityUse waits for): callers then read a written card.

const RECORD_VALUES = ["otherDamage", "ammunitionDamage", "preSelected"] as const;

/**
 * The workflow's stored fields: kept in memory, written to its card (lib/cardState.ts) through the card's update cache.
 * The card is read only when the workflow is rebuilt from it (load). Writing undefined forgets the value.
 */
/** `value` with only what survives JSON (primitives, arrays and plain objects of them); undefined if nothing does */
/** Plain data only (primitives, arrays of them, plain objects): class instances (an Event, a module's session object) are left out */
export function jsonSafe(value: unknown): unknown {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.every(v => jsonSafe(v) === v) ? value : undefined;
  // A plain object only: getType calls any class instance (an Event) "Object"
  const prototype = typeof value === "object" ? Object.getPrototypeOf(value) : undefined;
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const kept = Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, jsonSafe(v)] as const).filter(([, v]) => v !== undefined);
  return kept.length ? Object.fromEntries(kept) : undefined;
}

/** A step a use ran (M25: its trace) */
export interface TraceStep {
  step: string;
  /** The step it went on to (midi-qol.Suspend while it waits) */
  next?: string;
  at: number;
  ms: number;
  /** The step changes that acted on it, with who made them */
  changes?: { kind: string, step: string, source?: string, layer: string }[];
}

/** diffObject, surviving a value it can't compare (an object with no valueOf): such a key differs unless it is the same object */
function diffOptions(original: WorkflowOptions, other: WorkflowOptions): WorkflowOptions {
  try {
    return foundry.utils.diffObject(original, other) as WorkflowOptions;
  } catch {
    const diff: Record<string, unknown> = {};
    const before = original as Record<string, unknown>;
    for (const [key, value] of Object.entries(other as Record<string, unknown>)) {
      try {
        Object.assign(diff, foundry.utils.diffObject(key in before ? { [key]: before[key] } : {}, { [key]: value }));
      } catch {
        if (before[key] !== value) diff[key] = value;
      }
    }
    return diff as WorkflowOptions;
  }
}

/** A roll another workflow added to a card (addedBy) */
function addedByOther(roll: Roll, workflowId: string): boolean {
  const addedBy = foundry.utils.getProperty(roll, `options.${MODULE_ID}.addedBy`);
  return !!addedBy && addedBy !== workflowId;
}

/** Workflow.workflows: a copy, so changing it changes nothing (warned) */
class WorkflowsCopy extends Map<string, Workflow> {
  #filled = false;
  #warn() {
    if (this.#filled) deprecation("midi-qol | Workflow.workflows is a copy: changing it changes nothing. Use MidiQOL.Workflow.addWorkflow / removeWorkflow.", { since: "14.6.9", until: "14.8.0", once: true });
  }
  filled(): this { this.#filled = true; return this; }
  override set(key: string, value: Workflow): this { this.#warn(); return super.set(key, value); }
  override delete(key: string): boolean { this.#warn(); return super.delete(key); }
  override clear(): void { this.#warn(); super.clear(); }
}

/** A damageContributions contribution of a use: its key (contributor#n), its message's role and its rolls */
interface DamageContribution { key: string, role: string, rolls: Roll[] }

class CardStateStore {
  #cache = new Map<string, unknown>();
  #write: (updates: Record<string, unknown>) => void;
  #persistRolls: () => void;

  /** `write`: updates by path, queued with the card's next update; `persistRolls`: the card's rolls */
  constructor(write: (updates: Record<string, unknown>) => void, persistRolls: () => void) {
    this.#write = write;
    this.#persistRolls = persistRolls;
  }

  // The roll counts are the card's own (its buttons show them), not workflow state
  static #path(key: string) {
    return ["attackRollCount", "damageRollCount"].includes(key) ? `system.midi.${key}` : `system.midi.state.${key}`;
  }

  /** What the card holds, for a workflow rebuilt from it: its state, its records' token sets and its rolls */
  /** Only for a card with a workflow recorded (fromChatCardUuid) */
  load(card: ChatMessage.Implementation): void {
    const midi = cardMidi(card);
    const state = midi.state ?? {};
    this.#cache.set("workflowClass", state.workflowClass);
    for (const key of STATE_KEYS) {
      const value = state[key];
      if (value === undefined || value === null) continue;
      if (key === "workflowOptions") this.#cache.set(key, decodeWorkflowOptions(foundry.utils.deepClone(value)));
      else if (key === "damageRules") this.#cache.set(key, mergeDamageRules(value as Parameters<typeof mergeDamageRules>[0]));
      else if (key === "damageMessages") this.#cache.set(key, Object.fromEntries((value as { key: string, id: string }[]).map(({ key, id }) => [key, id])));
      else this.#cache.set(key, foundry.utils.deepClone(value));
    }
    for (const key of ["attackRollCount", "damageRollCount"] as const) if (midi[key] != null) this.#cache.set(key, midi[key]);
    // Pre-selected targets are kept in the records, not the stored options
    this.#cache.set("workflowOptions", { ...((this.#cache.get("workflowOptions") as WorkflowOptions | undefined) ?? {}), preSelectedTargetUuids: cardPreSelected(midi.records) });
    const records = recordList(midi.records);
    for (const field of RECORD_VALUES) {
      const uuids = records.filter(record => record[field]).map(record => record.uuid);
      if (uuids.length) this.#cache.set(`recordValues.${field}`, new Set(uuids));
    }
    // Every member, with a canvas token or not (TokenDocumentSet); a record whose token no longer exists is left alone
    for (const field of Object.keys(RECORD_SETS) as RecordSet[]) {
      const tokens = new TokenDocumentSet(records.filter(record => record[field]).map(record => record.uuid));
      this.#cache.set(field, tokens);
      this.#cache.set(`written.${field}`, new Set(tokens.uuids));
    }
    const hitRows = records.filter(record => typeof record.hitClass === "string").map(record => record.uuid);
    if (hitRows.length) this.#cache.set("hitRows", new Set(hitRows));
    const attribution = Object.fromEntries(records.filter(record => record.saveAttribution?.length)
      .map(record => [record.uuid, attributionMap(record.saveAttribution) as AttributionMap]));
    if (!foundry.utils.isEmpty(attribution)) this.#cache.set("saveAttribution", attribution);
    // Rolls by the type midi tags them with
    const rollKeys: Record<string, string> = { attack: "attackRoll", defaultDamage: "damageRolls", bonusDamage: "bonusDamageRolls", otherDamage: "otherDamageRolls", utility: "utilityRolls" };
    for (const roll of (card.rolls ?? []) as Roll[]) {
      // Another workflow's: not this card's own rolls
      if (foundry.utils.getProperty(roll, `options.${MODULE_ID}.addedBy`)) continue;
      const key = rollKeys[String(rollTypeOf(roll))];
      if (!key) continue;
      if (key === "attackRoll") { if (!this.#cache.has(key)) this.#cache.set(key, roll); }
      else this.#cache.set(key, [...((this.#cache.get(key) as Roll[] | undefined) ?? []), roll]);
    }
    this.#loadDamageMessages(this.#cache.get("damageMessages") as Record<string, string> | undefined);
  }

  /** The damage contributions read back from their messages (loadDamageMessages), for the workflow's ledger */
  loadedContributions: DamageContribution[] = [];

  /**
   * The use's damage from its contributions' messages (M13): the card holds none of the damage they do. A message gone
   * (deleted) takes its damage with it; the card's rolls are left for damage never in a message (a card from before
   * them). Copies: the messages' rolls are theirs. A contribution's untargeted rolls were also bonus damage.
   */
  #loadDamageMessages(ids: Record<string, string> | undefined): void {
    const entries = Object.entries(ids ?? {});
    if (!entries.length) return;
    const messages = entries.map(([key, id]) => [key, game.messages?.get(id)] as const);
    const copy = (rolls: Roll[]) => rolls.map(roll => Roll.fromJSON(JSON.stringify(roll)) as Roll);
    const rollsOf = (key: string) => copy((messages.find(([k]) => k === key)?.[1]?.rolls ?? []) as Roll[]);
    const own: Record<string, string> = { activity: "damageRolls", other: "otherDamageRolls", bonus: "bonusDamageRolls" };
    for (const [key, field] of Object.entries(own)) {
      if (!ids?.[key]) continue;
      const rolls = rollsOf(key);
      if (rolls.length) this.#cache.set(field, rolls);
      else this.#cache.delete(field);
    }
    this.loadedContributions = messages.filter(([key, message]) => !own[key] && message).map(([key, message]) => ({
      key, role: String(foundry.utils.getProperty(message!, `flags.${MODULE_ID}.damage.role`) ?? "module"), rolls: rollsOf(key)
    }));
    const untargeted = this.loadedContributions.flatMap(c => c.rolls.filter(roll => !foundry.utils.getProperty(roll, `options.${MODULE_ID}.contribution.targeted`)));
    if (untargeted.length) this.#cache.set("bonusDamageRolls", [...((this.#cache.get("bonusDamageRolls") as Roll[] | undefined) ?? []), ...untargeted]);
  }

  scalar<T>(key: StateKey | "attackRollCount" | "damageRollCount", dflt: T): T {
    return (this.#cache.has(key) ? this.#cache.get(key) : dflt) as T;
  }

  setScalar<T>(key: StateKey | "attackRollCount" | "damageRollCount", value: T, storeAs?: (value: T) => unknown): void {
    if (value === undefined) {
      this.#cache.delete(key);
      const cleared = CardStateStore.#cleared(key);
      if (cleared !== undefined) this.#write({ [CardStateStore.#path(key)]: cleared });
      return;
    }
    this.#cache.set(key, value);
    this.#write({ [CardStateStore.#path(key)]: storeAs ? storeAs(value) : value });
  }

  /** What clears a stored value: false for a BooleanField, null for a nullable field (a non-nullable one drops null) */
  static #cleared(key: string): false | null | undefined {
    const path = CardStateStore.#path(key).replace(/^system\./, "");
    const models: Partial<Record<string, typeof foundry.abstract.DataModel>> = CONFIG.ChatMessage.dataModels;
    const field = models.usage?.schema?.getField(path);
    if (field instanceof foundry.data.fields.BooleanField) return false;
    if (field?.nullable) return null;
    console.warn(`midi-qol | the card's ${path} can't be cleared`);
    return undefined;
  }

  /** The workflow's tokens in set `field`: the same TokenDocumentSet each time, so changes made in place are written (syncTokenSets) */
  tokenSet(field: RecordSet): TokenDocumentSet {
    let tokens = this.#cache.get(field) as TokenDocumentSet | undefined;
    if (!tokens) this.#cache.set(field, tokens = new TokenDocumentSet());
    return tokens;
  }

  setTokenSet(field: RecordSet, tokens: Set<TokenOrDocument> | undefined, store = true): void {
    if (tokens === undefined) this.#cache.delete(field);
    // syncTokenSets passes the cached set itself: kept, so references to it stay the workflow's; another TokenDocumentSet is
    // copied, keeping its members with no canvas token
    else if (tokens !== this.#cache.get(field)) this.#cache.set(field, new TokenDocumentSet(tokens as Iterable<Token.Implementation | TokenDocument.Implementation>));
    if (!store) {
      this.#unstoredSets.add(field);
      return;
    }
    this.#unstoredSets.delete(field);
    const members = new Set(this.tokenSet(field).documents);
    // Compared with what was last written, not the cached set: callers change that in place before assigning it
    const written = `written.${field}`;
    const before = (this.#cache.get(written) as Set<string> | undefined) ?? new Set<string>();
    const leaves: Record<string, unknown> = {};
    const mark = (document: TokenDocument.Implementation, value: boolean) => {
      const at = recordPath(document);
      if (!at) return;
      // A record is created whole, so it always gets its uuid
      Object.assign(leaves, { [`${at}.uuid`]: document.uuid, [`${at}.${field}`]: value });
    };
    for (const document of members) mark(document, true);
    // By uuid: a token deleted since has no document, and its record must still lose the mark
    const memberUuids = new Set([...members].map(document => document.uuid));
    for (const uuid of before) {
      const at = memberUuids.has(uuid) ? undefined : recordPathOfUuid(uuid);
      if (at) leaves[`${at}.${field}`] = false;
    }
    // As syncTokenSets compares (the set's uuids): midi's stand-in for an actor with no token has none and no record
    this.#cache.set(written, new Set(this.tokenSet(field).uuids));
    this.#write(leaves);
  }

  // Sets last assigned as not stored (failed saves of a use with no save)
  #unstoredSets = new Set<RecordSet>();

  /**
   * The sets as they are now, written where they differ from what was last written: macros change them in place
   * (`workflow.saves.add(token)`), which no setter sees. Before each card write (Workflow#flushCardWrites).
   */
  syncTokenSets(): void {
    for (const field of Object.keys(RECORD_SETS) as RecordSet[]) {
      if (this.#unstoredSets.has(field)) continue;
      const current = this.#cache.get(field) as TokenDocumentSet | undefined;
      const now = new Set(current?.uuids ?? []);
      const written = (this.#cache.get(`written.${field}`) as Set<string> | undefined) ?? new Set<string>();
      if (now.size !== written.size || [...now].some(uuid => !written.has(uuid))) this.setTokenSet(field, current);
    }
  }

  setClass(name: string): void {
    if (this.#cache.get("workflowClass") === name) return;
    this.#cache.set("workflowClass", name);
    this.#write({ "system.midi.state.workflowClass": name });
  }

  /** The flow the workflow follows (M2): written with the card's next flush */
  setFlow(id: string | undefined): void {
    if (!id || this.#cache.get("flow") === id) return;
    this.#cache.set("flow", id);
    this.#write({ "system.midi.state.flow": id });
  }

  /** The step the workflow is in (M2): written with the card's next flush */
  setStep(id: string | undefined): void {
    if (!id || this.#cache.get("step") === id) return;
    this.#cache.set("step", id);
    this.#write({ "system.midi.state.step": id });
  }

  /** The records' save attribution, keyed by token uuid as the workflow uses it */
  saveAttribution(): Record<string, AttributionMap> {
    return (this.#cache.get("saveAttribution") as Record<string, AttributionMap> | undefined) ?? {};
  }

  setSaveAttribution(attribution: Record<string, AttributionMap>): void {
    this.#cache.set("saveAttribution", attribution);
    for (const [uuid, map] of Object.entries(attribution)) {
      const document = fromUuidSync(uuid);
      if (document instanceof TokenDocument) this.setRecordFacts(document, { saveAttribution: attributionTriples(map) });
    }
  }

  /** The hits rows: each token's row facts; a token whose row went (a re-rolled attack) has its row cleared */
  setHitRows(rows: [TokenDocument.Implementation, RecordFacts][]): void {
    const shown = new Set(rows.map(([document]) => document.uuid));
    const before = (this.#cache.get("hitRows") as Set<string> | undefined) ?? new Set();
    for (const uuid of before) {
      const document = fromUuidSync(uuid);
      if (!shown.has(uuid) && document instanceof TokenDocument) this.setRecordFacts(document, { hitClass: null });
    }
    // A null clears a value a previous row had; a new row needs none
    for (const [document, facts] of rows)
      this.setRecordFacts(document, document.uuid && before.has(document.uuid) ? facts : Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== null)));
    this.#cache.set("hitRows", shown);
  }

  /** A per-token value on the records for the tokens given, cleared from tokens that had one */
  setRecordValues(field: typeof RECORD_VALUES[number], values: Map<TokenDocument.Implementation, true | number>): void {
    const key = `recordValues.${field}`;
    const before = (this.#cache.get(key) as Set<string> | undefined) ?? new Set();
    const now = new Set<string>();
    for (const [document, value] of values) {
      if (document.uuid) now.add(document.uuid);
      this.setRecordFacts(document, { [field]: value });
    }
    for (const uuid of before) {
      const document = fromUuidSync(uuid);
      if (!now.has(uuid) && document instanceof TokenDocument) this.setRecordFacts(document, { [field]: field === "preSelected" ? null : false });
    }
    this.#cache.set(key, now);
  }

  /** The damage tray's matches: the matched tokens flagged in the records, and the state marked as worked out */
  setDamageMatches(kind: "otherDamage" | "ammunitionDamage", matches: TokenDocumentSet | undefined): void {
    this.#write({ [`system.midi.state.${kind}Matched`]: !!matches });
    const documents = matches?.documents ?? [];
    this.setRecordValues(kind, new Map(documents.map(document => [document, true as const])));
  }

  /** The workflow's options, stored as `stored` gives them; the pre-selected targets go in the records */
  setWorkflowOptions(options: WorkflowOptions, stored: (options: WorkflowOptions) => WorkflowOptions): void {
    const { preSelectedTargetUuids, ...rest } = stored(options) as WorkflowOptions & { preSelectedTargetUuids?: string[] };
    // What survives JSON: the use's event as the keys it held; documents and Sets are per-use state
    const event = rest.event instanceof Event ? eventModifiers(rest.event) : rest.event;
    this.setScalar("workflowOptions", options, () => jsonSafe({ ...rest, event }) ?? {});
    const documents = (preSelectedTargetUuids ?? []).map(uuid => fromUuidSync(uuid)).filter((d): d is TokenDocument.Implementation => d instanceof TokenDocument);
    this.setRecordValues("preSelected", new Map(documents.map((document, index) => [document, index + 1])));
  }

  /** A token's facts on the card besides its sets: its save row (UsageCardMessage), the damage tray's detail */
  setRecordFacts(document: TokenDocument.Implementation, facts: RecordFacts): void {
    if (!document.id) return;
    const uuid = document.uuid;
    if ("saveAttribution" in facts && uuid) {
      const attribution = { ...this.saveAttribution() };
      if (facts.saveAttribution?.length) attribution[uuid] = attributionMap(facts.saveAttribution) as AttributionMap;
      else delete attribution[uuid];
      this.#cache.set("saveAttribution", attribution);
    }
    const at = recordPath(document);
    if (!at) return;
    const leaves: Record<string, unknown> = { [`${at}.uuid`]: document.uuid };
    for (const [key, value] of Object.entries(facts)) if (value !== undefined) leaves[`${at}.${key}`] = value;
    this.#write(leaves);
  }

  /** Rolls are written as the card's `message.rolls` */
  roll(key: string): Roll | undefined {
    return this.#cache.get(key) as Roll | undefined;
  }

  setRoll(key: string, roll: Roll | undefined): void {
    if (roll === undefined) this.#cache.delete(key);
    else this.#cache.set(key, roll);
    this.#persistRolls();
  }

  rolls(key: string): Roll[] | undefined {
    return this.#cache.get(key) as Roll[] | undefined;
  }

  setRolls(key: string, rolls: Roll[] | undefined): void {
    if (rolls === undefined) this.#cache.delete(key);
    else this.#cache.set(key, rolls);
    this.#persistRolls();
  }
}

/** A reason shown on the attack roll: a bonus part (value) or the source of advantage. */
/** A reason the attack roll shows: flanking, a target-granted bonus, or a roll bonus added to the formula (rollBonuses preRoll) */
export interface AttackModifier { kind: "flanking" | "flanked" | "granted" | "bonus", label: string, value?: string, advantage?: boolean }

/** The workflow's own copy of an assigned set: a TokenDocumentSet is kept, so sets assigned from one another stay shared */
function asTokenDocumentSet(tokens: Set<TokenOrDocument> | undefined | null): TokenDocumentSet | undefined {
  if (!tokens) return undefined;
  return tokens instanceof TokenDocumentSet ? tokens : new TokenDocumentSet(tokens);
}

/** What a target macro is given: the target's actor, its canvas token (none on another scene or level) and its TokenDocument */
function targetMacroOptions(target: TokenOrDocument) {
  const tokenDocument = target instanceof TokenDocument ? target : target.document;
  return { actor: target.actor, token: tokenOf(tokenDocument) ?? null, tokenDocument };
}

/** What midi's step modules (workflowSteps/) use of a workflow's internals. Not part of MidiQOL's API. */
export interface WorkflowStepHost {
  damageButtonText(): string;
  setOtherConsumption(consumed: object | false, scaling?: number | false): void;
  targetsUpdate(): Record<string, unknown>;
  fileFinished(): void;
}
let stepHostOf: (workflow: Workflow) => WorkflowStepHost;
/** The generated WorkflowState_<name> forwarders: never a step's own implementation */
const stepForwarders = new WeakSet<Function>();
export function workflowStepHost(workflow: Workflow): WorkflowStepHost { return stepHostOf(workflow); }

export class Workflow {
  /*
   * M5 (plan ~/Documents/midi-next-M5-steps-as-data-plan-2026-11-19.md): midi's steps are registered steps with a run
   * of their own (workflowSteps/). `WorkflowState_<name>` is each one's forwarder, for old callers: it runs the step
   * (the flow's variant, if it has one) and returns the next step's forwarder, as the method did, with a deprecation
   * warning. One function per name, so comparing `currentAction` with it still works (no warning).
   */
  declare WorkflowState_Suspend: StateMethod;
  declare WorkflowState_NoAction: StateMethod;
  declare WorkflowState_Start: StateMethod;
  declare WorkflowState_AwaitTemplate: StateMethod;
  declare WorkflowState_TemplatePlaced: StateMethod;
  declare WorkflowState_AoETargetConfirmation: StateMethod;
  declare WorkflowState_Choices: StateMethod;
  declare WorkflowState_ValidateRoll: StateMethod;
  declare WorkflowState_PreambleComplete: StateMethod;
  declare WorkflowState_WaitForAttackRoll: StateMethod;
  declare WorkflowState_AttackRollComplete: StateMethod;
  declare WorkflowState_WaitForDamageRoll: StateMethod;
  declare WorkflowState_ConfirmRoll: StateMethod;
  declare WorkflowState_RollConfirmed: StateMethod;
  declare WorkflowState_DamageRollStarted: StateMethod;
  declare WorkflowState_DamageRollComplete: StateMethod;
  declare WorkflowState_WaitForUtilityRoll: StateMethod;
  declare WorkflowState_UtilityRollComplete: StateMethod;
  declare WorkflowState_WaitForSaves: StateMethod;
  declare WorkflowState_SavesComplete: StateMethod;
  declare WorkflowState_AllRollsComplete: StateMethod;
  declare WorkflowState_ApplyDynamicEffects: StateMethod;
  declare WorkflowState_RollFinished: StateMethod;
  declare WorkflowState_Cleanup: StateMethod;
  declare WorkflowState_Completed: StateMethod;
  declare WorkflowState_Abort: StateMethod;
  declare WorkflowState_Cancel: StateMethod;
  static {
    stepHostOf = workflow => ({
      damageButtonText: () => workflow.#damageButtonText(),
      setOtherConsumption: (consumed, scaling) => workflow.#setOtherConsumption(consumed, scaling),
      targetsUpdate: () => workflow.#targetsUpdate(),
      fileFinished: () => Workflow.#fileFinished(workflow)
    });
    for (const step of allSteps()) {
      if (!step.method || Object.prototype.hasOwnProperty.call(Workflow.prototype, step.method)) continue;
      const id = step.id;
      const method = step.method;
      const forwarder = async function (this: Workflow): Promise<WorkflowState> {
        foundry.utils.logCompatibilityWarning(`midi-qol | workflow.${method}() is deprecated: midi's steps are registered steps. `
          + `To run the workflow from a step use workflow.performState("${id}"); to change what a step does use MidiQOL.steps `
          + `(replace, wrap, insert). Comparing workflow.currentAction with it still works; workflow.currentStep is the step's id.`,
          { since: "15.0.0", once: true });
        const next = await this.#runOwn(id);
        return next ? (this.methodForStep(next) ?? next) : undefined;
      };
      Object.defineProperty(forwarder, "name", { value: step.method });
      stepForwarders.add(forwarder);
      Object.defineProperty(Workflow.prototype, step.method, { value: forwarder, writable: true, configurable: true });
    }
  }

  static get forceCreate(): boolean { return true };

  // Finished workflows (and all of them with Use Weak References) are filed as WeakRefs
  static #workflows: Map<string, WeakRef<Workflow> | Workflow> = new Map();

  /** The workflows in memory, by id: a new Map on each read (one that has been collected is rebuilt by getWorkflow) */
  static get workflows(): Map<string, Workflow> {
    const live = new WorkflowsCopy();
    for (const [id, entry] of Workflow.#workflows) {
      const workflow = entry instanceof WeakRef ? entry.deref() : entry;
      if (workflow) live.set(id, workflow);
    }
    return live.filled();
  }

  /** Whether a workflow is filed weakly (finished, or Use Weak References), for tests */
  static heldWeakly(id: string): boolean {
    return Workflow.#workflows.get(id) instanceof WeakRef;
  }

  static clearWorkflows() {
    Workflow.#workflows = new Map();
  }
  // Workflows ended this session (removeWorkflow): never rebuilt from their cards
  static #ended = new Set<string>();

  /**
   * File a finished workflow weakly: an unfinished one is held, so what macros keep on it between passes survives; a
   * finished one is rarely looked up again and is rebuilt from its card if it has been collected (getWorkflow).
   */
  static #fileFinished(workflow: Workflow) {
    const id = workflow.id;
    if (id && Workflow.#workflows.get(id) === workflow) Workflow.#workflows.set(id, new WeakRef(workflow));
  }

  /** A finished workflow running again (a re-roll): held until it finishes, unless every workflow is held weakly */
  static #holdRunning(workflow: Workflow) {
    const id = workflow.id;
    if (!useWeakReferences && id && Workflow.#workflows.get(id) instanceof WeakRef) Workflow.#workflows.set(id, workflow);
  }

  static addWorkflow(workflow: Workflow) {
    if (!workflow.id) return;
    // A collected entry is just replaced; another live workflow under the id is removed first
    const entry = Workflow.#workflows.get(workflow.id);
    const existing = entry instanceof WeakRef ? entry.deref() : entry;
    if (existing && existing !== workflow) {
      console.warn("midi-qol | addWorkflow | Workflow already exists", workflow.id);
      Workflow.removeWorkflow(workflow.id);
    }
    // After the removal, which ends the id
    Workflow.#ended.delete(workflow.id);
    // The actor's earlier uses still waiting on a roll were left unrolled
    if (!workflow.readOnly) Workflow.endRollWaits(other => other !== workflow && !!workflow.actor && other.actor?.uuid === workflow.actor.uuid);
    if (useWeakReferences) Workflow.#workflows.set(workflow.id, new WeakRef(workflow));
    else Workflow.#workflows.set(workflow.id, workflow);
  }
  // Each use's workflow by its activity: the copy midi's use() makes and dnd5e's scaled copy, both for that use alone
  static #uses = new WeakMap<object, Workflow>();
  static setUse(activity: Activity, workflow: Workflow) { Workflow.#uses.set(activity, workflow); }
  /**
   * The workflow of the use `activity` belongs to: the activity a use's hooks and macros are given (midi's or dnd5e's
   * copy for that use). For a use before its card exists, on the client running it; after that, getWorkflow(cardUuid).
   */
  static workflowFor(activity: Activity | undefined | null): Workflow | undefined { return activity ? Workflow.#uses.get(activity) : undefined; }
  /** The use a template of `activity` is placed for: its workflow's id (its card's uuid) and card */
  static templateWorkflowFlags(activity: Activity): { workflowId?: string, itemCardUuid?: string } {
    const workflow = Workflow.workflowFor(activity);
    return { workflowId: workflow?.itemCardUuid ? workflow.id : undefined, itemCardUuid: workflow?.itemCardUuid };
  }

  /**
   * This user's use of `activity` stopped for that roll, the most recent if several: a roll started without a use (a
   * sheet button, a macro, another module) is its roll, as the card's button would make it (14.6.15/14.7.1; midi-next:
   * the roll wraps, attack, damage and utility alike). Matched before the roll, so midi's advantage, bonuses, ammunition
   * and pre-roll macros apply. Not while a roll dialog is open for the actor: that roll is already under way.
   */
  static awaitingRoll(activity: { uuid?: string | null }, kind: "attack" | "damage" | "utility"): Workflow | undefined {
    const step = kind === "attack" ? "midi-qol.WaitForAttackRoll" : kind === "damage" ? "midi-qol.WaitForDamageRoll" : "midi-qol.WaitForUtilityRoll";
    let found: Workflow | undefined;
    for (const entry of Workflow.#workflows.values()) {
      const workflow = entry instanceof WeakRef ? entry.deref() : entry;
      if (!workflow || workflow.readOnly || workflow.aborted || !workflow.suspended || !workflow.#activity) continue;
      if (!activity.uuid || workflow.#activity.uuid !== activity.uuid) continue;
      if (workflow.chatCard && workflow.chatCard.author?.id !== game.user?.id) continue;
      if (workflow.currentStep === step) found = workflow;
    }
    if (found?.actor?.uuid && rollDialogsFor(found.actor.uuid).length) return undefined;
    return found;
  }

  /** The item's workflow that is executing now (a macro inside its use), the most recently filed if several */
  static runningFor(item: Item.Implementation): Workflow | undefined {
    let found: Workflow | undefined;
    for (const entry of Workflow.#workflows.values()) {
      const workflow = entry instanceof WeakRef ? entry.deref() : entry;
      if (workflow?.executingStates && workflow.item?.uuid === item.uuid) found = workflow;
    }
    return found;
  }

  /**
   * The usage card of the actor's workflow that is executing now, if any: an item use started from inside it (a macro
   * spending a resource item, a triggered activity) belongs to that card. The most recently added one wins.
   */
  static executingCardFor(actor: Actor.Implementation): ChatMessage.Implementation | undefined {
    let parent: Workflow | undefined;
    for (const entry of Workflow.#workflows.values()) {
      const workflow = entry instanceof WeakRef ? entry.deref() : entry;
      if (!workflow?.executingStates || workflow.suspended || !workflow.itemCardUuid) continue;
      if (workflow.actor?.uuid === actor.uuid) parent = workflow;
    }
    return parent ? fromUuidSync(parent.itemCardUuid!) as ChatMessage.Implementation | undefined : undefined;
  }

  /**
   * Delete an aborted workflow's card. Usage cards of other workflows linked to it (a nested use that is the real
   * result, e.g. CPR's grapple handing off to CAT) are moved to the card's own origin first, so they survive the
   * linked-card cascade.
   */
  static async deleteAbortedCard(card: ChatMessage.Implementation | undefined): Promise<void> {
    if (!card) return;
    const origin = (card._source.system as { origin?: string | null } | undefined)?.origin ?? null;
    const nested = messagesFrom(card.id!, USAGE_MESSAGE_TYPE).filter(m => m.id !== card.id && m.canUserModify(game.user!, "update"));
    const path: string = "system.origin";
    if (nested.length) await ChatMessage.updateDocuments(nested.map(m => ({ _id: m.id, [path]: origin })));
    // The delete waits for the card's write in flight (ChatMessageMidi._preDeleteOperation)
    await card.delete();
  }

  /** Count the workflow as executing while `fn` runs: a roll from a card button happens outside performState. */
  async whileExecuting<T>(fn: () => Promise<T>): Promise<T> {
    this.executingStates += 1;
    try {
      // A card button's roll is the use's: its dice fixed with the use's (M25)
      return await withFixedDice(this.workflowOptions?.fixedDice, fn);
    } finally {
      this.executingStates -= 1;
    }
  }

  // Read-only copies of other users' workflows (getWorkflow), dropped when their card changes
  static #readOnlyCopies = new Map<string, WeakRef<Workflow>>();
  static dropReadOnlyCopy(id: string | null) {
    if (id) Workflow.#readOnlyCopies.delete(id);
  }

  /**
   * The workflow of a card: the one in memory, for any user. Otherwise for the card's author the live workflow rebuilt
   * from the card; for another user a read-only copy rebuilt from the card: it does not run or write, and is never
   * updated: when the card changes it is discarded, and the next call builds a new one. With `readOnly` false another
   * user gets a live rebuild, which runs and writes the card alongside the author's (warned). A use before its card
   * exists: Workflow.workflowFor(activity).
   */
  static getWorkflow(id?: string | null, readOnly = true): Workflow | undefined {
    const workflow = Workflow.findWorkflow(id);
    if (workflow || !id) return workflow;
    if (/\.Activity\.[^.]+$/.test(id)) {
      deprecation("midi-qol | Workflow.getWorkflow is given a card's uuid; an activity's finds nothing: use MidiQOL.Workflow.workflowFor(activity) during a use, MidiQOL.Workflow.getWorkflow(cardUuid) once its card exists.", { since: "14.6.9", until: "14.8.0", once: true });
      return undefined;
    }
    const card = fromUuidSync(id);
    if (!(card instanceof ChatMessage) || card.author === game.user) return undefined;
    if (!readOnly) {
      const live = Workflow.#rebuild(id, { anyAuthor: true });
      if (live) console.warn(`midi-qol | getWorkflow | ${live.workflowName}: a live copy of ${card.author?.name ?? "another user"}'s workflow. It runs and writes the card as the author's does; if theirs is running too, both apply their changes, rolls, damage and effects. Use getWorkflow(uuid) for a read-only copy.`);
      return live;
    }
    return Workflow.cardView(id);
  }

  /** A card's workflow to read: the one in memory, else a read-only copy (whoever the author, ended or not) */
  static cardView(id: string): Workflow | undefined {
    const entry = Workflow.#workflows.get(id);
    const live = entry instanceof WeakRef ? entry.deref() : entry;
    if (live) return live;
    const held = Workflow.#readOnlyCopies.get(id)?.deref();
    if (held) return held;
    const copy = Workflow.fromChatCardUuid(id, { readOnly: true });
    if (copy) Workflow.#readOnlyCopies.set(id, new WeakRef(copy));
    return copy;
  }

  /**
   * The workflow a card's damage button rolls for: the one in memory, else for a completed use a read-only copy (its
   * re-roll reads it). False while that workflow is running, after saying so.
   */
  static forDamageButton(message: ChatMessage.Implementation | undefined): Workflow | undefined | false {
    if (!message?.uuid) return undefined;
    const workflow = Workflow.findWorkflow(message.uuid)
      ?? (Workflow.cardResumePoint(message) === "WorkflowState_Completed" ? Workflow.cardView(message.uuid) : undefined);
    if (workflow && !workflow.readOnly && !workflow.suspended) {
      ui.notifications?.warn(i18nFormat("midi-qol.WorkflowRunning", { name: workflow.item?.name ?? "" }));
      return false;
    }
    return workflow;
  }

  /**
   * Damage rolled again for a completed use, as dnd5e rolls another damage message: a damage-only workflow on its own
   * card, with the use's targets, hits and saves, and its own undo; the use and its card are left as they are.
   */
  static async rerollDamage(first: Workflow, activity: Activity, config: Record<string, any>, dialog: Record<string, any>, message: Record<string, any>) {
    const source = first.chatCard?.toObject() as Record<string, any> | undefined;
    if (!source) return;
    // The card as the use made it (its buttons, sources and other modules' flags), without the use's results; the roller's
    const { _id, timestamp, _stats, author, ...data } = source;
    data.rolls = [];
    const midi = data.system?.midi ?? {};
    for (const key of ["state", "records", "sections", "progress", "attackRollCount", "damageRollCount", "followUps"]) delete midi[key];
    // The use's consumption and concentration stay the use's: the re-roll's Refund would refund them again
    if (data.system) for (const key of ["deltas", "concentration"]) delete data.system[key];
    const workflow = new Workflow(first.actor, activity, first.speaker, new TokenDocumentSet(first.targets),
      { workflowOptions: { ...first.workflowOptions }, event: config.event, storeWorkflow: false });
    const card = await CONFIG.ChatMessage.documentClass.create(data as ChatMessage.CreateData);
    if (!card) return;
    workflow.id = card.uuid;
    workflow.itemCardUuid = card.uuid;
    workflow.damageOnly = true;
    workflow.hitTargets = new TokenDocumentSet(first.hitTargets);
    workflow.hitTargetsEC = new TokenDocumentSet(first.hitTargetsEC);
    workflow.saves = new TokenDocumentSet(first.saves);
    workflow.failedSaves = new TokenDocumentSet(first.failedSaves);
    workflow.superSavers = new TokenDocumentSet(first.superSavers);
    workflow.semiSuperSavers = new TokenDocumentSet(first.semiSuperSavers);
    workflow.criticalSaves = new TokenDocumentSet(first.criticalSaves);
    workflow.fumbleSaves = new TokenDocumentSet(first.fumbleSaves);
    workflow.isCritical = first.isCritical;
    Workflow.addWorkflow(workflow);
    if (configSettings.undoWorkflow) await saveUndoData(workflow);
    workflow.currentAction = "midi-qol.WaitForDamageRoll";
    workflow.suspended = true;
    return activity.rollDamage({ ...config, workflow }, dialog, message);
  }

  /** midi's own lookup: the workflow in memory, or rebuilt from its card for the card's author; never a read-only copy */
  static findWorkflow(id?: string | null): Workflow | undefined {
    if (debugEnabled > 0) warn("Get workflow ", id, Workflow.#workflows.get(id ?? ""))
    if (debugEnabled > 1) debug("Get workflow ", id, Workflow.#workflows.get(id ?? ""))
    if (!id) return;
    const entry = Workflow.#workflows.get(id);
    const live = entry instanceof WeakRef ? entry.deref() : entry;
    if (live) return live;
    // Rebuilt from its card once, also after its weak entry was collected: filed under the card, so later calls find it
    if (fromUuidSync(id) instanceof ChatMessage) return Workflow.#rebuild(id);
    return undefined;
  }

  static #rebuild(id: string, options: { anyAuthor?: boolean } = {}): Workflow | undefined {
    const rebuilt = Workflow.fromChatCardUuid(id, options);
    if (!rebuilt) return undefined;
    Workflow.addWorkflow(rebuilt);
    if (rebuilt.currentStep === "midi-qol.Completed") Workflow.#fileFinished(rebuilt);
    return rebuilt;
  }

  /** @deprecated workflows are not found by activity uuid: Workflow.workflowFor(activity) during a use, getWorkflow(cardUuid) after */
  static getWorkflowByActivityUuid(_activityUuid?: string): Workflow | undefined {
    if (!deprecation("midi-qol | Workflow.getWorkflowByActivityUuid is deprecated and finds nothing: use MidiQOL.Workflow.workflowFor(activity) during a use, MidiQOL.Workflow.getWorkflow(cardUuid) once its card exists.", { since: "14.6.9", until: "14.8.0", once: true }))
      throw removedError("Workflow.getWorkflowByActivityUuid", "14.8.0", "use MidiQOL.Workflow.workflowFor(activity) during a use, MidiQOL.Workflow.getWorkflow(cardUuid) after");
    return undefined;
  }
  static deleteWorkflow(id: string | null) {
    if (!id) return;
    // Its card is gone: nobody is waited for on its behalf
    const entry = Workflow.#workflows.get(id);
    const workflow = entry instanceof WeakRef ? entry.deref() : entry;
    if (workflow) {
      workflow.endRollWait();
      endPlayerWaitsOwnedBy(workflow);
    }
    Workflow.#workflows.delete(id);
  }

  /**
   * The workflow of a card, rebuilt from it after a reload. Only for the card's author, whose client ran the workflow
   * (elsewhere it would be a second copy of one still running), unless `readOnly` (a copy that does not run or write) or
   * `anyAuthor` (a live second copy: getWorkflow warns). Never one removed this session. Only workflow classes built like
   * Workflow itself.
   */
  static fromChatCardUuid(chatCardUuid: string, options: { readOnly?: boolean, anyAuthor?: boolean } = {}): Workflow | undefined {
    const card = fromUuidSync(chatCardUuid);
    const author = card instanceof ChatMessage && (card.author === game.user || options.readOnly || options.anyAuthor);
    if (!author || (!options.readOnly && Workflow.#ended.has(chatCardUuid))) return undefined;
    const className: string | undefined = cardMidi(card).state?.workflowClass;
    const WorkflowClass = className ? RESTORABLE_WORKFLOWS[className] : undefined;
    if (!WorkflowClass) return undefined;
    // A card that failed is retried only once it has changed
    const modified = card._stats.modifiedTime ?? 0;
    if (Workflow.#unrestorable.get(chatCardUuid) === modified) return undefined;
    try {
      const workflow = new WorkflowClass(null, null, null, null, { chatCardUuid, readOnly: options.readOnly });
      // For what isn't item or activity data (the card keeps those): a module's own state, from its own flags
      Hooks.callAll("midi-qol.workflowRebuilt", workflow, card, { readOnly: !!options.readOnly });
      return workflow;
    } catch (err) {
      Workflow.#unrestorable.set(chatCardUuid, modified);
      TroubleShooter.recordError(err, `fromChatCardUuid | could not restore the workflow of ${chatCardUuid}`);
      return undefined;
    }
  }
  static #unrestorable = new Map<string, number>();

  // While a state runs its card changes are queued and written at milestones (MILESTONE_STATES, a reaction prompt, a
  // wait) or, with Chat card updates "At every step", after each step that changed the card. `workflow.chatCard`
  // includes queued changes.
  #queueingWrites = 0;
  #displayQueued = false;

  async performThrottledUpdate(chatCard: ChatMessage.Implementation, updates: ChatMessage.UpdateData) {
    if (this.readOnly) return;
    if (this.#queueingWrites && chatCard?.uuid === this.itemCardUuid) {
      this.#displayQueued = true;
      return queueUpdate(chatCard, updates);
    }
    return await throttledUpdate(chatCard, updates);
  }

  /** Write the card's queued changes: `displayOnly` when a state ends (only if it changed what the card shows) */
  /** What the use changed in its item and activity (a macro's modified copy), on the card for a rebuilt workflow */
  #syncUseChanges() {
    const card = this.#ownCard();
    if (!card || !this.#item || !this.#activity) return;
    const json = useChangesJson(card, this.#item, this.#activity);
    if (json !== this.#persisted.scalar<string | undefined>("useChanges", undefined)) this.#persisted.setScalar("useChanges", json);
  }

  async flushCardWrites(displayOnly = false): Promise<void> {
    if (this.readOnly) return;
    if (displayOnly && !this.#displayQueued) return;
    this.#displayQueued = false;
    this.#syncWorkflowOptions();
    this.#persisted.syncTokenSets();
    this.#syncUseChanges();
    const card = this.itemCardUuid ? fromUuidSync(this.itemCardUuid) as ChatMessage.Implementation | null : null;
    if (card && !foundry.utils.isEmpty(getUpdatesCache(card.uuid))) await throttledUpdate(card, {});
  }


  /** Write one section of the card (system.midi.sections), with the workflow's rolls */
  async setCardSection(
    name: SectionName,
    section: MidiCardSection,
    extraUpdates: Record<string, unknown> = {}
  ): Promise<void> {
    const chatCard = this.chatCard;
    if (!chatCard) return;
    this.#persistRolls();
    await this.performThrottledUpdate(chatCard, this.#sectionsUpdate({ [name]: section }, extraUpdates));
  }

  #itemCardUuid: string | undefined;
  get itemCardUuid(): string | undefined { return this.#itemCardUuid; }
  set itemCardUuid(uuid: string | null | undefined) {
    this.#itemCardUuid = uuid ?? undefined;
    this.#storeUnstored();
  }

  /** A copy of another user's workflow (getWorkflow): it does not run or write the card */
  readOnly = false;

  /** A workflow keeps its state on its own card, the one it is registered under; never on another workflow's card */
  get ownsCard(): boolean {
    return !!this.itemCardUuid && this.itemCardUuid === this.id;
  }

  // Written before the workflow has its card; stored when it gets it
  #unstored: Record<string, unknown> = {};

  /** By path; queued in the card's update cache: written with its next (throttled) update, never on its own */
  #persistFields(updates: Record<string, unknown>): void {
    if (this.ownsCard) this.#cacheCardUpdates(updates);
    else Object.assign(this.#unstored, updates);
  }

  #storeUnstored() {
    if (!this.ownsCard || foundry.utils.isEmpty(this.#unstored)) return;
    this.#cacheCardUpdates(this.#unstored);
    this.#unstored = {};
  }

  /** The workflow's own card with its queued changes: what a rebuilt workflow reads its state from */
  #ownCard(): ChatMessage.Implementation | undefined {
    return this.ownsCard ? getCachedDocument(this.itemCardUuid) : undefined;
  }

  /**
   * The card's `rolls`: every roll the workflow holds (chatRolls), the only writer of them. Called by the store when a roll
   * is set and by each display, which also covers rolls changed in place (attribution) and save rolls.
   */
  #persistRolls(): void {
    if (!this.ownsCard) return;
    // Rolls another workflow added (a damage-only workflow's) stay theirs
    const added = ((getCachedDocument(this.itemCardUuid)?.rolls ?? []) as Roll[]).filter(roll => addedByOther(roll, this.id ?? ""));
    this.#cacheCardUpdates({ rolls: [...this.chatRolls, ...added] });
  }

  /** Queued for the card's next write; a read-only copy queues nothing (the queue is the card's, not the workflow's) */
  #cacheCardUpdates(updates: Record<string, unknown>) {
    if (!this.readOnly) addUpdatesCache(this.id, updates);
  }

  #persisted = new CardStateStore(updates => this.#persistFields(updates), () => this.#persistRolls());

  get useActiveDefence() { return false; }
  get actor(): Actor.Implementation {
    return this.activity?.actor!;
  }

  /** @deprecated (M2): the same flag as `aborted`; the two used to be separate and read in different places */
  get abort(): boolean { return this.aborted; }
  set abort(value: boolean | undefined) { this.aborted = !!value; }

  itemUseComplete: boolean | undefined = false;

  // Not stored: a rebuilt workflow takes its card's speaker's token (#restoreFromCard)
  token: Token.Implementation | undefined;

  get workflowOptions(): WorkflowOptions {
    return this.#persisted.scalar<WorkflowOptions>("workflowOptions", {});
  }
  // Stored as #mergeWorkflowOptions stores them: the caller's options, with what this assignment changes from the merged ones
  set workflowOptions(workflowOptions: WorkflowOptions) {
    this.#callerOptions = { ...this.#callerOptions, ...diffOptions(this.#mergedOptions, workflowOptions) };
    this.#mergedOptions = foundry.utils.deepClone(workflowOptions);
    const callerOptions = this.#callerOptions;
    this.#persisted.setWorkflowOptions(workflowOptions, () => cardWorkflowOptions(callerOptions));
  }
  #callerOptions: WorkflowOptions = {};
  /**
   * Changes made in place (midi's ignoreUserTargets, macros) added to what the card stores. Only values that survive JSON:
   * the rest (CAT's activity, the use's event, Sets) is per-use state, never stored.
   */
  #syncWorkflowOptions() {
    // Only what can be stored is compared: the rest (an event, a module's object) need not be comparable
    const changed = foundry.utils.diffObject((jsonSafe(this.#mergedOptions) ?? {}) as WorkflowOptions, (jsonSafe(this.workflowOptions) ?? {}) as WorkflowOptions) as WorkflowOptions;
    this.#mergedOptions = foundry.utils.deepClone(this.workflowOptions);
    if (!changed || foundry.utils.isEmpty(changed)) return;
    this.#callerOptions = foundry.utils.mergeObject(foundry.utils.deepClone(this.#callerOptions), changed) as WorkflowOptions;
    const callerOptions = this.#callerOptions;
    this.#persisted.setWorkflowOptions(this.workflowOptions, () => cardWorkflowOptions(callerOptions));
  }
  // As last merged or assigned: a change made in place since is found by comparing with it
  #mergedOptions: WorkflowOptions = {};

  get needItemCard(): boolean { return !!this.itemCardUuid };

  #activity: Activity | undefined;
  get activity(): Activity {
    if (!this.#activity) {
      const message = `midi-qol | get activity() | Could not find activity for workflow ${this.id}`;
      TroubleShooter.recordError(new Error(message));
      error(message);
    }
    return this.#activity!;
  }
  set activity(activity: Activity) {
    this.#activity = activity;
  }

  /**
   * The activity a card button runs for this use. A button runs the activity dnd5e finds from the card, the original:
   * when it is the workflow's own activity (same uuid), the workflow's copy is kept and run (a macro's modified copy
   * stays the use's); another activity becomes the workflow's.
   */
  activityFor<T extends Activity>(activity: T): T {
    if (this.#activity && this.#activity.uuid === activity.uuid) return this.#activity as T;
    this.activity = activity;
    return activity;
  }

  // Undefined only while a card's workflow is rebuilt without its item (reported in #restoreFromCard)
  #item: Item.Implementation | undefined;
  get item(): Item.Implementation {
    return this.#item!;
  }
  set item(item: Item.Implementation) {
    this.#item = item;
  }


  // A rebuilt workflow's is its card's
  #speaker: ChatMessage.SpeakerData | undefined = undefined;
  get speaker(): ChatMessage.SpeakerData {
    return this.#speaker!;
  }
  set speaker(speaker: ChatMessage.SpeakerData) {
    // TODO do an equals check on the stored and passed speaker
    this.#speaker = speaker;
    if (this.ownsCard) this.#cacheCardUpdates({ speaker });
  }

  get attackingToken() {
    return this.token
  }
  get attackingTokenDocument(): TokenDocument.Implementation | undefined {
    return this.tokenDocument;
  }
  get tokenUuid() {
    return this.token?.document.uuid;
  }
  /** The using token's TokenDocument: what the workflow's token sets hold (workflow.token stays the placeable) */
  get tokenDocument(): TokenDocument.Implementation | undefined {
    return this.token?.document ?? undefined;
  }

  get targets(): TokenDocumentSet { return this.#persisted.tokenSet("targets"); }
  set targets(targets: Set<TokenOrDocument>) { this.#persisted.setTokenSet("targets", targets ?? new Set()); }

  // Worked out again when the workflow is rebuilt (setupCanSeeSense)
  /** The targets that see / sense the actor; `tokenCanSee` / `tokenCanSense`: the targets the actor sees / senses */
  targetsCanSee: Set<Token.Implementation> = new Set();
  targetsCanSense: Set<Token.Implementation> = new Set();
  tokenCanSee: Set<Token.Implementation> = new Set();
  tokenCanSense: Set<Token.Implementation> = new Set();

  /** The use's templates (regions): replace the array to change it, a change in place isn't stored */
  get templateUuids(): string[] { return this.#persisted.scalar<string[]>("templateUuids", []); }
  /**
   * The use's choices (M28, lib/choices.ts) by id: those the Choices step stored, and dnd5e's own damage type pick
   * (`damageType`, read from the rolls) unless the activity declares a choice of that id
   */
  get choices(): Record<string, ChoiceValue> {
    const result: Record<string, ChoiceValue> = {};
    const rolled = rolledDamageTypeChoice(this);
    if (rolled) result.damageType = rolled;
    for (const { id, value } of this.#persisted.scalar<StoredChoice[]>("choices", [])) result[id] = value;
    return result;
  }
  setChoice(id: string, value: ChoiceValue): void {
    if (this.readOnly) return;
    const kept = this.#persisted.scalar<StoredChoice[]>("choices", []).filter(choice => choice.id !== id);
    this.#persisted.setScalar("choices", [...kept, { id, value }]);
  }
  /** Snapshot tags fixed at the use's resolution (M26, lib/tags.ts) */
  get tagSnapshots(): readonly TagSnapshot[] { return this.#persisted.scalar<TagSnapshot[]>("tagSnapshots", []); }
  recordTagSnapshot(snapshot: TagSnapshot): void {
    if (this.readOnly) return;
    const kept = this.tagSnapshots.filter(other => other.tag !== snapshot.tag || other.target !== snapshot.target);
    this.#persisted.setScalar("tagSnapshots", [...kept, snapshot]);
  }
  set templateUuids(templateUuids: string[]) { this.#persisted.setScalar("templateUuids", [...templateUuids]); }
  expectedTemplateCount: number = 0;
  placedTemplateCount: number = 0;

  // Backward compat: templateUuid returns the first template UUID
  get templateUuid(): string {
    if (this.templateUuids.length > 0) return this.templateUuids[0];
    return "";
  }
  set templateUuid(templateUuid: string) {
    if (templateUuid && !this.templateUuids.includes(templateUuid)) this.templateUuids = [...this.templateUuids, templateUuid];
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

  /** When the use started, the actor was a combatant (of any combat) */
  get inCombat(): boolean { return this.#persisted.scalar("inCombat", false); }
  set inCombat(inCombat: boolean) { this.#persisted.setScalar("inCombat", inCombat); }
  /** When the use started, it was the actor's turn in a started combat */
  get isTurn(): boolean { return this.#persisted.scalar("isTurn", false); }
  set isTurn(isTurn: boolean) { this.#persisted.setScalar("isTurn", isTurn); }
  AoO: boolean = false;

  #damageList: DamageListEntry[] = [];
  #targetDamage: Record<string, DamageListEntry[]> | undefined;
  // A rebuilt use's damage lists, worked out when first read: from its damage cards (as applied), and for a use whose
  // damage step was reached, the targets no card records as the rolls would do now (reconstructDamageLists; user, 2026-11-20)
  #damageFromCards = false;
  #damageReached = false;
  /** Each target's damage record from the damage application */
  get damageList(): DamageListEntry[] {
    this.#loadDamageFromCards();
    return this.#damageList;
  }
  set damageList(damageList: DamageListEntry[]) {
    this.#damageFromCards = false;
    this.#damageList = damageList;
  }
  /** Each target's damage entries, one per list */
  get targetDamage(): Record<string, DamageListEntry[]> | undefined {
    this.#loadDamageFromCards();
    return this.#targetDamage;
  }
  set targetDamage(targetDamage: Record<string, DamageListEntry[]> | undefined) {
    this.#damageFromCards = false;
    this.#targetDamage = targetDamage;
  }
  #loadDamageFromCards(): void {
    const cardId = this.itemCardId;
    if (!this.#damageFromCards || !cardId) return;
    this.#damageFromCards = false;
    this.#damageList = [];
    this.#targetDamage = {};
    // The card keeps what undo needs; who was hit or saved, and the crit, are the use's own
    for (const stored of useDamageList(cardId)) {
      const uuid = stored.targetUuid;
      const entry: DamageListEntry = { ...stored, actorId: getActor(stored.actorUuid)?.id ?? "", critical: this.isCritical,
        isHit: this.hitTargets.has(uuid) || this.hitTargetsEC.has(uuid), saved: this.saves.has(uuid), semiSuperSaver: this.semiSuperSavers.has(uuid),
        superSaver: this.superSavers.has(uuid), sceneId: foundry.utils.parseUuid(uuid)?.primaryId ?? "",
        tempDamage: (stored.oldTempHP ?? 0) - (stored.newTempHP ?? 0), details: [] };
      this.#damageList.push(entry);
      (this.#targetDamage[uuid] ??= []).push(entry);
    }
    const unrecorded = new Set(this.targets.uuids.filter(uuid => !this.#targetDamage?.[uuid]));
    if (!this.#damageReached || !unrecorded.size) return;
    const worked = reconstructDamageLists(this, unrecorded);
    this.#damageList.push(...worked.damageList);
    Object.assign(this.#targetDamage, worked.targetDamage);
  }

  saveDisplayFlavor: string | undefined;

  /** Its card's uuid, which it is filed under: undefined for a use until its card exists (a workflow with no card of its own has a generated id) */
  #id: string | undefined;
  get id(): string | undefined { return this.#id }
  set id(id: string | null | undefined) {
    this.#id = id ?? undefined;
    this.#storeUnstored();
  }

  get uuid() {
    if (debugEnabled > 0) warn(`workflow.uuid is deprecated. Use workflow.id to reference the workflow and workflow.itemUuid to reference the item instead.
      Returning ${this.activity.uuid} workflowId: ${this.id}`);
    return this.activity.uuid;
  }

  // Not stored: a workflow rebuilt from its card is suspended
  suspended: boolean = false;

  /** The step the workflow is in or waits in (steps/steps.ts) */
  #currentStep: string | undefined;
  get currentStep(): string | undefined {
    return this.#currentStep;
  }
  /** The current step's method: compatible with comparing against `workflow.WorkflowState_<name>` */
  get currentAction(): StateMethod | undefined {
    return this.methodForStep(this.#currentStep);
  }
  set currentAction(currentAction: WorkflowState | string) {
    // A step id that isn't registered here is kept: running it stops the use with a message (#runStep)
    this.#currentStep = Workflow.stepIdOf(currentAction) ?? (typeof currentAction === "string" ? currentAction : undefined);
    if (this.#currentStep === "midi-qol.SavesComplete") this.#savesResolved = true;
    this.#persisted.setClass(this.constructor.name);
    // Recorded for M2's flows; a rebuilt workflow still works out where it waits from its card (cardResumePoint)
    this.#persisted.setStep(this.#currentStep);
    this.#persisted.setFlow(this.flowId);
  }

  /** A step's id from a step id or a workflow state method (`this.WorkflowState_<name>`, as callers pass it) */
  static stepIdOf(state: WorkflowState | string | undefined): string | undefined {
    if (typeof state === "string") return getStep(state)?.id ?? stepForMethod(state)?.id;
    return stepForMethod(state?.name?.replace(/^bound /, ""))?.id;
  }

  /** The method that runs a step on this workflow (its class's override, if it has one) */
  methodForStep(id: string | undefined): StateMethod | undefined {
    const method = id ? getStep(id)?.method : undefined;
    return method ? (this as any)[method] : undefined;
  }

  /** The flow this workflow follows (steps/flows.ts) */
  get flowId(): string {
    if (this.damageOnly && this.constructor === Workflow) return "midi-qol.damageReroll";
    return (this.constructor as typeof Workflow).flowId;
  }
  static flowId = "midi-qol.standard";

  /*
   * The ports (M2 stage 4) are deprecated (M5b): saves go through the saveRequests service, reactions through the reaction
   * steps, and the damage card is a direct call. A port a module replaced (Workflow.defaultPorts, workflow.setPort)
   * still takes effect, with a warning, until 15.1.0.
   */
  static readonly #builtinPorts: WorkflowPorts = {
    requestSaves: (workflow, ...args) => (workflow as Workflow).checkSaves(...(args as [boolean?, boolean?])),
    askReactions: (...args) => doReactions(...(args as Parameters<typeof doReactions>)),
    applyDamageCard: data => timedAwaitExecuteAsGM("createReverseDamageCard", data)
  };
  static #replacedPorts: Partial<WorkflowPorts> = {};
  static #portDeprecation(what: string, instead: string): void {
    deprecation(`midi-qol | ${what} is deprecated: ${instead}`, { since: "15.0.0", until: "15.1.0", once: true });
  }
  static readonly #portInstead: Record<PortName, string> = {
    requestSaves: "register a saveRequests provider (MidiQOL.services.register(\"saveRequests\", ...))",
    askReactions: "replace or extend the reaction steps (MidiQOL.steps)",
    applyDamageCard: "change a target's damage in midi-qol.preTargetDamageApplication"
  };
  /** @deprecated since 15.0.0: see the ports' replacements (#portInstead). Assigning one of its ports still replaces it. */
  static readonly defaultPorts: WorkflowPorts = Object.defineProperties({} as WorkflowPorts, Object.fromEntries(PORT_NAMES.map(name => [name, {
    enumerable: true,
    get: () => Workflow.#replacedPorts[name] ?? Workflow.#builtinPorts[name],
    set: (port: WorkflowPorts[typeof name]) => {
      Workflow.#portDeprecation(`Workflow.defaultPorts.${name}`, Workflow.#portInstead[name]);
      if (port === Workflow.#builtinPorts[name]) delete Workflow.#replacedPorts[name];
      else (Workflow.#replacedPorts as Record<PortName, unknown>)[name] = port;
    }
  }])));
  #portOverrides: Partial<WorkflowPorts> = {};
  /** @deprecated since 15.0.0: this use's ports */
  get ports(): WorkflowPorts {
    Workflow.#portDeprecation("workflow.ports", "the saves step, the reaction steps and the damage card are no longer ports");
    return { ...Workflow.#builtinPorts, ...Workflow.#replacedPorts, ...this.#portOverrides };
  }
  /** @deprecated since 15.0.0: carry out one kind of wait differently for this use */
  setPort<K extends PortName>(name: K, port: WorkflowPorts[K] | undefined): void {
    Workflow.#portDeprecation(`workflow.setPort("${name}")`, Workflow.#portInstead[name]);
    if (port) this.#portOverrides[name] = port;
    else delete this.#portOverrides[name];
  }
  /** A port a module replaced (deprecated), for this use or for all; undefined: midi's own code runs */
  replacedPort<K extends PortName>(name: K): WorkflowPorts[K] | undefined {
    return (this.#portOverrides[name] ?? Workflow.#replacedPorts[name]) as WorkflowPorts[K] | undefined;
  }

  /**
   * The state a workflow rebuilt from `card` waits in, worked out from the card: what has been placed, rolled and
   * confirmed. Undefined for a card with no workflow.
   */
  static cardResumePoint(card: ChatMessage.Implementation | undefined): string | undefined {
    const midi = cardMidi(card);
    if (!card || !midi.state?.workflowClass) return undefined;
    const progress = midi.progress ?? {};
    if (progress.finished || progress.attacksSplit) return "WorkflowState_Completed";
    const activity = (card as Dnd5eChatMessage).getAssociatedActivity?.() as Activity | undefined;
    const rolled = new Set(card.rolls.map(roll => rollTypeOf(roll)));
    const templates = expectedTemplateCount(activity);
    if ((midi.state.templateUuids?.length ?? 0) < templates) return "WorkflowState_AwaitTemplate";
    if (activity?.roll?.formula && !rolled.has("utility")) return "WorkflowState_WaitForUtilityRoll";
    if (activity?.attack && !rolled.has("attack")) return "WorkflowState_WaitForAttackRoll";
    const other = activity?.otherActivity;
    const damages = activity?.hasDamage || other?.hasDamage || activity?.hasHealing || other?.hasHealing;
    if (damages && !cardDamageRolls(card, MQDamageRollTypes).length) return "WorkflowState_WaitForDamageRoll";
    if (midi.confirmAttackDamage && !progress.confirmed) return "WorkflowState_ConfirmRoll";
    return "WorkflowState_Completed";
  }

  // The tracker decides; a rebuilt workflow gets the stored decision back as an override (#restoreFromCard)
  get isCritical(): boolean {
    return this.attackRollModifierTracker.isCritical;
  }
  set isCritical(isCritical: boolean) {
    this.attackRollModifierTracker.critical.setOverride(isCritical, "direct", "Direct assignment");
    this.#persistAttackTracker();
  }

  get isFumble(): boolean {
    return this.attackRollModifierTracker.isFumble;
  }
  set isFumble(isFumble: boolean) {
    this.attackRollModifierTracker.fumble.setOverride(isFumble, "direct", "Direct assignment");
    this.#persistAttackTracker();
  }

  /** Whether the attack hit: a target hit, or with hits not checked the attack roll's own result */
  get isHit(): boolean {
    return configSettings.autoCheckHit === "none" ? !!(this.attackRoll as { isSuccess?: boolean } | undefined)?.isSuccess : this.hitTargets.count > 0;
  }
  /** Whether the attack was a glancing blow on a target (Challenge Mode Armor: at least its EC, not above its AC) */
  get isHitEC(): boolean {
    return this.hitTargetsEC.count > 0;
  }

  /** A damage-only workflow's damage is its other damage (shown and stored as other damage), not its main damage */
  useOther = false;

  /** A damage roll on its own (rerollDamage, DamageOnlyWorkflow): targets, hits and saves given; no effects or use-level passes */
  get damageOnly(): boolean { return this.#persisted.scalar("damageOnly", false); }
  set damageOnly(damageOnly: boolean) { this.#persisted.setScalar("damageOnly", damageOnly); }

  /** dnd5e 6.1's attacker ignore/downgrade rules from the use's damage rolls, applied to every target's damage */
  get damageRules(): DamageRules | undefined { return this.#persisted.scalar<DamageRules | undefined>("damageRules", undefined); }

  /** Add a damage roll's rules (`rollConfig.applicationOptions`) to the use's */
  addDamageRules(applicationOptions: Parameters<typeof mergeDamageRules>[0]): void {
    const rules = mergeDamageRules(this.damageRules, applicationOptions);
    if (sameDamageRules(rules, this.damageRules)) return;
    this.#persisted.setScalar("damageRules", rules, storeDamageRules);
  }

  /** The use's damage is rolled anew: its rules are that roll's, not an earlier roll's as well */
  clearDamageRules(): void {
    if (this.damageRules) this.#persisted.setScalar("damageRules", undefined, storeDamageRules);
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

  /*
   * Worked out from the stored rolls, so a rebuilt workflow has them and an edit to a roll shows. Assigning one sets it
   * until its roll is replaced (TrapWorkflow's attack total, a damage-only workflow's given total).
   */
  #assigned = new Map<string, { basis: unknown, value: number | undefined }>();
  #derived(key: string, basis: unknown, compute: () => number | undefined): number | undefined {
    const assigned = this.#assigned.get(key);
    return assigned && assigned.basis === basis ? assigned.value : compute();
  }
  #assign(key: string, basis: unknown, value: number | undefined) { this.#assigned.set(key, { basis, value }); }

  /** The attack's d20 result (-1 with no attack roll, or none counting as a d20) */
  get d20AttackRoll(): number {
    const roll = this.attackRoll;
    return this.#derived("d20AttackRoll", roll, () => (roll ? Workflow.d20Of(roll) : undefined) ?? -1) ?? -1;
  }
  set d20AttackRoll(value: number) { this.#assign("d20AttackRoll", this.attackRoll, value); }

  get hitTargets(): TokenDocumentSet { return this.#persisted.tokenSet("hit"); }
  set hitTargets(hitTargets: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("hit", hitTargets); }

  get hitTargetsEC(): TokenDocumentSet { return this.#persisted.tokenSet("hitEC"); }
  set hitTargetsEC(hitTargetsEC: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("hitEC", hitTargetsEC); }

  #otherDamageMatches: TokenDocumentSet | undefined;
  // Written for the damage tray; the workflow works them out before it uses them (buildOtherDamageMatches)
  get otherDamageMatches(): TokenDocumentSet | undefined {
    return this.#otherDamageMatches;
  }
  set otherDamageMatches(matches: Set<TokenOrDocument> | undefined) {
    this.#otherDamageMatches = matches && new TokenDocumentSet(matches);
    // For the damage tray, which has other damage only from the other activity
    if (this.otherActivity) this.#persisted.setDamageMatches("otherDamage", this.#otherDamageMatches);
  }

  /** The targets the ammunition's damage applies to: hit targets passing its own use condition. */
  #ammunitionDamageMatches: TokenDocumentSet | undefined;
  get ammunitionDamageMatches(): TokenDocumentSet | undefined {
    return this.#ammunitionDamageMatches;
  }
  set ammunitionDamageMatches(matches: Set<TokenOrDocument> | undefined) {
    this.#ammunitionDamageMatches = matches && new TokenDocumentSet(matches);
    // The damage tray reads it
    this.#persisted.setDamageMatches("ammunitionDamage", this.#ammunitionDamageMatches);
  }

  /**
   * What a successful save does to each kind of damage, before Super Saver (applySaves adds that per damage entry).
   * One save is rolled per use: the other activity's and the ammunition's damage follow it only when it is their
   * own, else take it in full; with neither having it, other damage follows the activity's save as before.
   */
  damageSaveMultipliers(): { defaultDamage: number, bonusDamage: number, otherDamage: number, ammunition: number } {
    const activityMultiplier = getSaveMultiplierForActivity(this.activity);
    const saveSource = this.otherSaveActivity;
    const sourceMultiplier = (source: Activity | undefined | null) => saveSource
      ? (saveSource === source ? getSaveMultiplierForActivity(saveSource) : 1)
      : activityMultiplier;
    return {
      defaultDamage: activityMultiplier,
      bonusDamage: activityMultiplier,
      otherDamage: sourceMultiplier(this.otherActivity),
      ammunition: sourceMultiplier(this.ammunitionActivity)
    };
  }

  /**
   * A target's other damage: the other activity's where its condition matched the target, the ammunition's where the
   * ammunition's did, each with its own save multiplier.
   */
  otherDamageFor(token: TokenOrDocument): DamageDescription[] {
    const multipliers = this.damageSaveMultipliers();
    const otherApplies = this.otherDamageMatches?.has(token) ?? true;
    const ammunitionApplies = this.ammunitionDamageMatches?.has(token) ?? true;
    return (this.otherDamageDetail ?? [])
      .filter(d => d.midiAmmunition ? ammunitionApplies : otherApplies)
      .map(d => ({ ...d, midiSaveMultiplier: d.midiAmmunition ? multipliers.ammunition : multipliers.otherDamage }));
  }

  /** Drop the other activity's damage (its use was declined), keeping the ammunition's. */
  dropOtherActivityDamage() {
    this.otherDamageMatches = new Set();
    this.rawOtherDamageDetail = (this.rawOtherDamageDetail ?? []).filter(d => d.midiAmmunition);
    this.otherDamageDetail = (this.otherDamageDetail ?? []).filter(d => d.midiAmmunition);
  }

  get attackRoll(): Roll | undefined { return this.#persisted.roll("attackRoll"); }
  set attackRoll(attackRoll: Roll | undefined) {
    if (attackRoll) attackRoll.data = {};
    this.#persisted.setRoll("attackRoll", attackRoll);
  }

  /** The value the attack's d20 counts as (a minimum or maximum applied) */
  get diceRoll(): number {
    const roll = this.attackRoll;
    return this.#derived("diceRoll", roll, () => roll ? Workflow.diceRollOf(roll) : 0) ?? 0;
  }
  set diceRoll(value: number) { this.#assign("diceRoll", this.attackRoll, value); }

  get attackTotal(): number {
    const roll = this.attackRoll;
    return this.#derived("attackTotal", roll, () => roll ? roll.total ?? 0 : minAttackTotal) ?? minAttackTotal;
  }
  set attackTotal(value: number) { this.#assign("attackTotal", this.attackRoll, value); }


  get attackRollCount() { return this.#persisted.scalar("attackRollCount", 0); }
  set attackRollCount(attackRollCount: number) { this.#persisted.setScalar("attackRollCount", attackRollCount, count => count || null); }

  // Not stored: a rebuilt workflow keeps only its critical and fumble (isCritical/isFumble)
  #attackRollModifierTracker: RollModifierTracker = new RollModifierTracker();
  get attackRollModifierTracker(): RollModifierTracker {
    return this.#attackRollModifierTracker;
  }

  /** Alias for attackRollModifierTracker */
  get tracker(): RollModifierTracker {
    return this.attackRollModifierTracker;
  }

  /** The tracker's critical/fumble decision, stored on the card: the only writer of both */
  #persistAttackTracker(): void {
    this.#persisted.setScalar("isCritical", this.#attackRollModifierTracker.isCritical);
    this.#persisted.setScalar("isFumble", this.#attackRollModifierTracker.isFumble);
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

  get targetDescriptors(): Array<CombinedTargetDescriptor> | undefined {
    // @ts-expect-error no dnd5e-types
    return this.chatCard?.system.targets;
  }
  set targetDescriptors(targetDescriptors: Array<DND5ETargetDescriptor>) {
    if (this.ownsCard) this.#cacheCardUpdates({ "system.targets": targetDescriptors });
  }
  noAutoAttack: boolean | undefined; // override attack roll for standard care

  hitDisplayData: Record<string, {
    ac?: number;
    acClass: string;
    acDisplay?: string;
    acTooltip?: string;
    actorUuid?: string | null;
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
    showAC: boolean;
    target: TokenOrDocument;
    uuid: string;
  }> | undefined;

  saveDisplayData: {
    gmName: string;
    img: string;
    targetClass: string;
    target: TokenOrDocument;
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
  get saveActivity(): Activity | undefined {
    if (this.hasValidSaveOrCheck(this.activity)) return this.activity;
    return this.otherSaveActivity;
  }
  /** The save behind the other damage: the item's own other activity's, else the ammunition's. */
  get otherSaveActivity(): Activity | undefined {
    if (this.hasValidSaveOrCheck(this.otherActivity)) return this.otherActivity ?? undefined;
    if (this.hasValidSaveOrCheck(this.ammunitionActivity)) return this.ammunitionActivity;
    return undefined;
  }
  get saveActivityDetails(): ActivitySave | ActivityCheck | undefined {
    return this.saveActivity?.save || this.saveActivity?.check;
  }

  get saveItem() {
    if (this.activity.save || this.activity.check) return this.item;
    return this.saveActivity?.item ?? this.activity.item;
  }

  /** The card's rolls */
  get rolls(): Roll[] {
    return (this.chatCard?.rolls ?? []) as Roll[];
  }

  get damageRolls(): Roll[] { return this.#persisted.rolls("damageRolls") ?? []; }
  set damageRolls(damageRolls: Roll[]) { this.#persisted.setRolls("damageRolls", damageRolls); }

  get bonusDamageRolls(): Roll[] | undefined { return this.#persisted.rolls("bonusDamageRolls"); }
  set bonusDamageRolls(bonusDamageRolls: Roll[] | undefined) { this.#persisted.setRolls("bonusDamageRolls", bonusDamageRolls); }

  get otherDamageRolls(): Roll[] | undefined { return this.#persisted.rolls("otherDamageRolls"); }
  set otherDamageRolls(otherDamageRolls: Roll[] | undefined) { this.#persisted.setRolls("otherDamageRolls", otherDamageRolls); }

  // A rebuilt workflow gets the card's merged utility roll back as its one roll
  get utilityRolls(): Roll[] { return this.#persisted.rolls("utilityRolls") ?? []; }
  set utilityRolls(utilityRolls: Roll[] | undefined) {
    utilityRolls?.forEach(d => d.data = {});
    this.#persisted.setRolls("utilityRolls", utilityRolls);
  }

  get damageTotal(): number {
    const rolls = this.#persisted.rolls("damageRolls");
    return this.#derived("damageTotal", rolls, () => sumRolls(rolls ?? [], "positive")) ?? 0;
  }
  set damageTotal(value: number) { this.#assign("damageTotal", this.#persisted.rolls("damageRolls"), value); }

  // These from the damage rolls, worked out again when the workflow is rebuilt (#restoreFromCard)
  rawDamageDetail: DamageDescription[] = [];
  rawOtherDamageDetail: DamageDescription[] = [];
  rawBonusDamageDetail: DamageDescription[] = [];

  // The damage detail as applied; a rebuilt workflow works it out from its rolls (#restoreFromCard)
  damageDetail: DamageDescription[] = [];
  otherDamageDetail: DamageDescription[] = [];

  bonusDamageDetail: DamageDescription[] = [];


  get damageRollCount(): number { return this.#persisted.scalar("damageRollCount", 0); }
  set damageRollCount(damageRollCount: number) { this.#persisted.setScalar("damageRollCount", damageRollCount, count => count || null); }

  defaultDamageType: string = "";

  // Not stored: once expired an effect is gone, so a rebuilt workflow finds nothing to expire again
  effectsAlreadyExpired: string[] = [];

  /** @deprecated since 14.6.9: has no effect (use workflowOptions.autoRollDamage, or return false from preDamageRollConfig) */
  get noAutoDamage(): undefined {
    deprecation("midi-qol | Workflow#noAutoDamage is deprecated and has no effect: set workflowOptions.autoRollDamage to \"none\", or return false from a preDamageRollConfig macro.", { since: "14.6.9", until: "14.8.0", once: true });
    return undefined;
  }
  set noAutoDamage(_value: boolean | undefined) {
    deprecation("midi-qol | Workflow#noAutoDamage is deprecated and has no effect: set workflowOptions.autoRollDamage to \"none\", or return false from a preDamageRollConfig macro.", { since: "14.6.9", until: "14.8.0", once: true });
  }

  #consumptionRefunded = false;

  /**
   * Set when MidiActivityMixin suppressed dnd5e's concentration so it can be started after the
   * workflow's checks pass. Carries what Activity#use would have used. Cleared once begun.
   */
  get deferredConcentration(): { scaling?: number, end?: string } | undefined {
    return this.#persisted.scalar<{ scaling?: number, end?: string } | null>("deferredConcentration", null) ?? undefined;
  }
  set deferredConcentration(deferred: { scaling?: number, end?: string } | undefined) {
    this.#persisted.setScalar("deferredConcentration", deferred ?? null);
  }

  get saves(): TokenDocumentSet { return this.#persisted.tokenSet("saved"); }
  set saves(saves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("saved", saves); }

  get superSavers(): TokenDocumentSet { return this.#persisted.tokenSet("superSaver"); }
  set superSavers(superSavers: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("superSaver", superSavers); }
  get semiSuperSavers(): TokenDocumentSet { return this.#persisted.tokenSet("semiSuperSaver"); }
  set semiSuperSavers(semiSuperSavers: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("semiSuperSaver", semiSuperSavers); }

  get failedSaves(): TokenDocumentSet { return this.#persisted.tokenSet("failedSave"); }
  // With no save they are the attacked (hit) targets, worked out again when rebuilt (#restoreFromCard): not stored
  set failedSaves(failedSaves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("failedSave", failedSaves, this.hasSave); }

  get fumbleSaves(): TokenDocumentSet { return this.#persisted.tokenSet("fumbleSave"); }
  set fumbleSaves(fumbleSaves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("fumbleSave", fumbleSaves); }
  get criticalSaves(): TokenDocumentSet { return this.#persisted.tokenSet("criticalSave"); }
  set criticalSaves(criticalSaves: Set<TokenOrDocument> | undefined) { this.#persisted.setTokenSet("criticalSave", criticalSaves); }
  // Not stored: each target's record has its save's advantage mode (saveMode), which a rebuilt workflow reads (#restoreFromCard)
  #advantageSaves = new TokenDocumentSet();
  #disadvantageSaves = new TokenDocumentSet();
  get advantageSaves(): TokenDocumentSet { return this.#advantageSaves; }
  set advantageSaves(advantageSaves: Set<TokenOrDocument> | undefined) { this.#advantageSaves = new TokenDocumentSet(advantageSaves ?? []); }
  get disadvantageSaves(): TokenDocumentSet { return this.#disadvantageSaves; }
  set disadvantageSaves(disadvantageSaves: Set<TokenOrDocument> | undefined) { this.#disadvantageSaves = new TokenDocumentSet(disadvantageSaves ?? []); }
  /** The saves this use waits for, by token uuid (M5b: the saveRequests providers' and the chat card's answers) */
  pendingSaves = new PendingSaves();

  #onUseMacros: OnUseMacros | undefined;
  get onUseMacros() {
    if (this.#onUseMacros) return this.#onUseMacros;
    if (configSettings.allowUseMacro) {
      this.#onUseMacros = new OnUseMacros();
      const itemOnUseMacros = OnUseMacros.withDefaults(this.item.getFlag(MODULE_ID, "onUseMacroParts"), this.item, this.activity);
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
    const ammunitionActivity = this.ammunitionActivity;
    const ammunitionOnUseMacros = OnUseMacros.withDefaults(this.ammunition?.getFlag(MODULE_ID, "onUseMacroParts"), this.ammunition,
      ammunitionActivity, ammunitionActivity ? `ActivityMacro.${ammunitionActivity.uuid}` : undefined);
    this.#ammunitionOnUseMacros.items = ammunitionOnUseMacros.items;
    return this.#ammunitionOnUseMacros;
  }
  set ammunitionOnUseMacros(ammunitionOnUseMacros: OnUseMacros | undefined) {
    this.#ammunitionOnUseMacros = ammunitionOnUseMacros;
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

  /** Why each target's save had advantage or disadvantage, by token uuid */
  get saveAttribution(): Record<string, AttributionMap> {
    return this.#persisted.saveAttribution();
  }
  set saveAttribution(saveAttribution: Record<string, AttributionMap>) {
    this.#persisted.setSaveAttribution(saveAttribution);
  }

  addSaveAttribution(targetUuid: string, type: AttributionType, source: string, displayName: string): void {
    const current = foundry.utils.deepClone(this.saveAttribution);
    ((current[targetUuid] ??= {})[type] ??= {})[source] = displayName;
    this.saveAttribution = current;
  }

  get advReminderAttackAdvAttribution(): Set<string> {
    return this.#attackRollModifierTracker.advReminderAttribution;
  }
  set advReminderAttackAdvAttribution(_value: Set<string>) {
    this.#attackRollModifierTracker.reset();
  }

  /** @deprecated since 14.6.9: has no effect (optional rules follow the Optional rules setting) */
  get noOptionalRules(): boolean | undefined {
    if (!deprecation("midi-qol | Workflow#noOptionalRules is deprecated and has no effect: optional rules follow the Optional rules setting.", { since: "14.6.9", until: "14.8.0", once: true })) return undefined;
    return !configSettings.optionalRulesEnabled;
  }
  set noOptionalRules(_value: boolean | undefined) {
    deprecation("midi-qol | Workflow#noOptionalRules is deprecated and has no effect: optional rules follow the Optional rules setting.", { since: "14.6.9", until: "14.8.0", once: true });
  }
  undoData: UndoData | undefined; // Way too big to store. Undos are blanked on reload

  get bonusDamageFlavor() {
    // @ts-expect-error options.type is specific to 5e `DamageRoll`s
    return `(${this.bonusDamageRolls?.map(r => r.options.flavor ?? r.options.type)})`;
  }

  public get chatCard() {
    return getCachedDocument(this.itemCardUuid) as ChatMessage.Implementation;
  }

  get itemCardId() {
    // The stored card's id: the card with its queued changes isn't needed for it
    return this.itemCardUuid ? (fromUuidSync(this.itemCardUuid) as ChatMessage.Implementation | null)?.id ?? undefined : undefined;
  }

  get damageFlavor() {
    if (isActivityType(this.activity, "heal")) return i18n("midi-qol.BaseHealingFlavor");
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
    return this.item.uuid ?? undefined;
  }

  get otherDamageFlavor() {
    if (isActivityType(this.otherActivity, "heal")) return i18n("midi-qol.OtherHealingFlavor");
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
    return Boolean(this.activity.save || this.activity.check || this.otherActivity?.save || this.otherActivity?.check || this.otherSaveActivity);
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
      || !!(getAutoRollDamage(this) === "onHit" && (this.hitTargets.count > 0 || this.hitTargetsEC?.count > 0 || this.targets.count === 0))
      || !!(getAutoRollDamage(this) === "onHit" && (this.hitTargetsEC?.count > 0));
    return this.rollOptions?.rollToggle ? !normalRoll : normalRoll;
  }

  /** The id of the concentration effect this use began, from the usage card. */
  get concentrationId(): string | undefined {
    // @ts-expect-error no dnd5e-types
    return this.chatCard?.system.concentration;
  }

  get spellLevel(): number {
    let spellLevel;
    if (this.chatCard) {
      // @ts-expect-error no dnd5e-types
      spellLevel = this.chatCard.system.level;
    }
    return spellLevel ?? this.castData?.castLevel ?? 0;
  }

  get workflowType() { return "BaseWorkflow" };

  setTargets(targets: Set<TokenOrDocument>) {
    // A token set: a plain copy of one would be its canvas tokens
    this.targets = new TokenDocumentSet(targets);
    this.saves = new Set();
    this.failedSaves = new TokenDocumentSet(this.targets)
    this.hitTargets = new Set();
    this.superSavers = new Set();
    this.semiSuperSavers = new Set();
    this.advantageSaves = new Set();
    this.disadvantageSaves = new Set();
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
  /** How the use ended up, for the stages after it: "ok" unless one of the genuine early exits or every target missed */
  outcome: WorkflowOutcome = "ok";
  longRangeAttack: boolean | undefined;
  #preSelected = new TokenDocumentSet();
  get preSelectedTargets(): TokenDocumentSet { return this.#preSelected; }
  set preSelectedTargets(tokens: Set<TokenOrDocument>) { this.#preSelected = asTokenDocumentSet(tokens) ?? new TokenDocumentSet(); }
  postSummonHookId: number | undefined;
  summonedCreatures: TokenDocument.Implementation[] | undefined;
  transformedActorUuids: string[] | undefined;
  /** A teleport activity's moves: dnd5e's TeleportMovementResult list (token, plan, moved). */
  teleportResults: { token: Token.Implementation, plan: unknown, moved: boolean }[] | undefined;
  transformedActors: Actor.Implementation[] | undefined;
  saveResults: Roll[] | undefined; /* D20Roll */
  stateTransitionCount: number | undefined;
  /** Running performState calls: above 0 while the workflow executes, 0 when it is paused, finished or failed. */
  executingStates = 0;
  maxTransitionCount: number = 250;
  selfTargeted: boolean | undefined;
  workflowStartTime: number | undefined;
  /** Targets from an emanation with no template */
  get rangeTargeting(): boolean {
    return activityHasEmanationNoTemplate(this.activity);
  }
  /** Targets from a template that auto-targets */
  get tempTargetConfirmation(): boolean {
    return getActivityAutoTargetAction(this.activity) !== "none" && activityHasAreaTarget(this.activity);
  }
  whisperAttackCard: boolean | undefined;
  #effectTargets: TokenDocumentSet | undefined;
  get effectTargets(): TokenDocumentSet | undefined { return this.#effectTargets; }
  set effectTargets(tokens: Set<TokenOrDocument> | undefined) { this.#effectTargets = asTokenDocumentSet(tokens); }
  // Deferred other activity damage rolling - stored when consumption needs to be checked first
  otherDamageConfig: RollProcessConfig | undefined;
  otherDamageDialog: RollDialogConfig | undefined;
  activationMatches: TokenDocumentSet | undefined;
  activationFails: TokenDocumentSet | undefined;
  otherActivationMatches: TokenDocumentSet | undefined;
  otherActivationFails: TokenDocumentSet | undefined;
  #otherEffectTargets: TokenDocumentSet | undefined;
  get otherEffectTargets(): TokenDocumentSet | undefined { return this.#otherEffectTargets; }
  set otherEffectTargets(tokens: Set<TokenOrDocument> | undefined) { this.#otherEffectTargets = asTokenDocumentSet(tokens); }
  #effectTargetsOnSave: TokenDocumentSet | undefined;
  get effectTargetsOnSave(): TokenDocumentSet | undefined { return this.#effectTargetsOnSave; }
  set effectTargetsOnSave(tokens: Set<TokenOrDocument> | undefined) { this.#effectTargetsOnSave = asTokenDocumentSet(tokens); }
  #otherEffectTargetsOnSave: TokenDocumentSet | undefined;
  get otherEffectTargetsOnSave(): TokenDocumentSet | undefined { return this.#otherEffectTargetsOnSave; }
  set otherEffectTargetsOnSave(tokens: Set<TokenOrDocument> | undefined) { this.#otherEffectTargetsOnSave = asTokenDocumentSet(tokens); }
  get otherDamageTotal(): number | undefined {
    const rolls = this.#persisted.rolls("otherDamageRolls");
    return this.#derived("otherDamageTotal", rolls, () => rolls ? sumRolls(rolls, "positive") : undefined);
  }
  set otherDamageTotal(value: number | undefined) { this.#assign("otherDamageTotal", this.#persisted.rolls("otherDamageRolls"), value); }
  get bonusDamageTotal(): number | undefined {
    const rolls = this.#persisted.rolls("bonusDamageRolls");
    return this.#derived("bonusDamageTotal", rolls, () => rolls ? sumRolls(rolls, "positive") : undefined);
  }
  set bonusDamageTotal(value: number | undefined) { this.#assign("bonusDamageTotal", this.#persisted.rolls("bonusDamageRolls"), value); }
  needsHitTargetsDisplayed: boolean = true;
  // TODO: Type this
  conditionData: any | undefined;
  flankingAdvantage: boolean | undefined;
  /** A fixed flanking bonus for this single-target melee attack, added to the roll (attackRollParts). */
  flankingRollBonus: { bonus: number, kind: AttackModifier["kind"], label: string } | undefined;
  /** The target whose granted attack bonus is already in the attack roll, so checkHits doesn't add it again. */
  grantedAttackBonusInRollUuid: string | null | undefined;
  /** Flanking that gave this attack advantage, shown on the attack roll ("flanking" or "flanked"). */
  flankingAdvantageKind: AttackModifier["kind"] | undefined;
  macroPass: string | undefined;
  tag: string | undefined;
  activeDefenceDC: number | undefined;
  /** What midi's damage calculation actually applied, per target uuid. Set by `processDamageRoll`. */
  /** What the damage calculation applied that the card shows, by token uuid (set once it has run) */
  midiTargetDetail: Record<string, { uncannyDodge?: unknown, uncannyDodgeIcon?: unknown }> | undefined;
  /** Each target's damage entries, one per damage list (other damage may have its own), by token uuid (processDamageRoll); not stored */
  targetSaveDetails: Record<string, SaveDetails> | undefined;  // Per-target SaveDetails for attribution tracking

  /** Get save rolls keyed by target UUID - derived from targetSaveDetails */
  // A rebuilt workflow's save rolls, from its card (#restoreFromCard), until it processes saves of its own
  #restoredSaves: Record<string, Roll> | undefined;
  get tokenSaves(): Record<string, Roll> | undefined {
    if (!this.targetSaveDetails) return this.#restoredSaves;
    const result: Record<string, Roll> = {};
    for (const [uuid, details] of Object.entries(this.targetSaveDetails)) {
      if (details.saveRoll) result[uuid] = details.saveRoll;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  /** A target's save roll (a Token, TokenDocument or token uuid); undefined until it has rolled */
  saveRoll(token: TokenOrDocument | string): Roll | undefined {
    const uuid = typeof token === "string" ? token : getTokenDocument(token)?.uuid;
    if (!uuid) return undefined;
    return this.targetSaveDetails ? this.targetSaveDetails[uuid]?.saveRoll : this.#restoredSaves?.[uuid];
  }
  saveDC: number | undefined;
  saveDetails: SaveDetails | undefined;
  damageItem: DamageListEntry | undefined;
  challengeModeScale: Record<string, number> | undefined;
  activeDefenceRolls: Record<string, Roll> | undefined;
  flavor: string | undefined;
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

  // TODO: these
  rollOptions: WorkflowRollOptions;
  castData: {
    castLevel?: number;
  } | undefined;

  // TODO: type options
  constructor(
    actor: Actor.Implementation | null /* Actor5e*/,
    activity: Activity | null,
    speaker: ChatMessage.SpeakerData | null,
    targets: Set<TokenOrDocument> | TokenOrDocument[] | null,
    options: WorkflowConstructorOptions = { chatCardUuid: undefined, storeWorkflow: true, item: undefined }
  ) {
    this.workflowStartTime = Date.now();
    // Rebuilt from its card (fromChatCardUuid): the stored state stays as it is
    const restoring = !!options.chatCardUuid;
    this.readOnly = !!options.readOnly;
    if (restoring) {
      this.itemCardUuid = options.chatCardUuid;
      this.id = options.chatCardUuid!;
      const card = this.#ownCard();
      if (card) {
        this.#persisted.load(card);
        // The damage contributions' rolls, from their messages (M13 stage 2)
        this.#contributions = this.#persisted.loadedContributions;
        // The use's item and activity, scaled, with what the use changed in them: the activity's item is the item
        const use = restoredUse(card);
        this.#activity = use.activity;
        this.#item = use.item;
        this.#speaker = card.speaker;
      }
      if (!this.#activity?.item) throw new Error(`the card's activity can't be found (${options.chatCardUuid})`);
      this.workflowName = `${this.constructor.name} ${this.item?.name ?? "no item"} restored`;
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
      // Kept as a token set: a plain copy would read as the canvas tokens only
      const given = targets ? new TokenDocumentSet(targets) : undefined;
      if (given?.count) this.targets = given;
      if (speaker) this.speaker = speaker;
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      this.initSaveResults();
      // isCritical/isFumble default to false via tracker — no explicit reset needed
      this.currentAction = "midi-qol.NoAction";
      this.suspended = true;
      this.aborted = false;
      if (!this.activity || this instanceof DummyWorkflow) {
        this.id = foundry.utils.randomID();
        this.workflowName = `workflow ${this.id}`;
      } else {
        // No id until the use's card exists (its uuid): before then it is found by its activity (workflowFor)
        const workflowName = options.workflowOptions?.workflowName ?? this.item.name ?? "no item";
        this.workflowName = `${this.constructor.name} ${workflowName} ${foundry.utils.randomID()}`;
      }
      if (options?.noOptionalRules !== undefined) this.noOptionalRules = options.noOptionalRules;
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
      if (this.speaker.scene) this.speaker.scene = canvas.scene?.id ?? "";
    }

    this.pendingSaves = new PendingSaves();
    this.forceApplyEffects = false;
    if (options.rollOptions) this.rollOptions = options.rollOptions;
    else this.rollOptions = {};
    if (options.event) this.rollOptions.event = options.event;
    else if (options.workflowOptions?.event) this.rollOptions.event = options.workflowOptions.event;
    this.expectedTemplateCount = expectedTemplateCount(this.activity);
    if (!restoring) {
      this.#mergeWorkflowOptions(options.workflowOptions ?? {});
      if (this.workflowOptions.templateUuid) this.templateUuid = this.workflowOptions.templateUuid;
      if (this.actor) {
        this.inCombat = isInCombat(this.actor);
        this.isTurn = !!game.combats?.some(combat => combat.started && combat.combatant?.actor?.uuid === this.actor.uuid);
      }
    }

    this.defaultDamageType = getActivityDefaultDamageType(this) ?? MidiQOL.MQdefaultDamageType;
    if (this.activity.actionType === "heal" && !Object.keys(GameSystemConfig.healingTypes).includes(this.defaultDamageType ?? "")) this.defaultDamageType = "healing";
    if (restoring) {
      this.preSelectedTargets = new TokenDocumentSet();
      this.#restoreFromCard();
      return;
    }

    this.preSelectedTargets = this.#preSelectedTargets();
    if (isActivityType(this.activity, "summon") && configSettings.autoRemoveSummonedCreature) {
      // Hooks.on + uuid filter rather than Hooks.once: concurrent summon workflows must not consume each other's hook
      this.postSummonHookId = Hooks.on("dnd5e.postSummon", (activity, profile, createdTokens, options) => {
        if (activity?.uuid !== this.activity?.uuid) return;
        this.summonedCreatures = createdTokens;
      })
    }
    this.itemUseComplete = false;
  }

  /**
   * The use's options: the caller's over midi's defaults and the roller's settings. The card stores only the caller's
   * and later changes (assigned, or made in place: #syncWorkflowOptions), and a rebuilt workflow merges them again.
   */
  #mergeWorkflowOptions(callerOptions: WorkflowOptions): void {
    const stored = () => cardWorkflowOptions(callerOptions);
    // The auto-roll settings give way to the caller's options, read from the workflow
    this.#persisted.setWorkflowOptions(callerOptions, stored);
    const merged: WorkflowOptions = foundry.utils.mergeObject(defaultRollOptions, {
      autoRollAttack: getAutoRollAttack(this),
      autoRollDamage: getAutoRollDamage(this),
      fastForwardAttack: isAutoFastForward("attack", { workflow: this }),
      fastForwardDamage: isAutoFastForward("damage", { workflow: this })
    }, { inplace: false });
    foundry.utils.mergeObject(merged, callerOptions, { overwrite: true });
    if (this.activity.midiProperties?.noConcentrationCheck) merged.noConcentrationCheck = true;
    this.#callerOptions = { ...callerOptions };
    this.#mergedOptions = foundry.utils.deepClone(merged);
    this.#persisted.setWorkflowOptions(merged, stored);
  }

  /**
   * Targets selected before the use: UUIDs captured early in use(), before template targeting. Sculpt Spells and
   * Careful Spells read them at the saves.
   */
  #preSelectedTargets(): TokenDocumentSet {
    // An empty snapshot is a choice of none; only a use with no snapshot (not started by use()) reads the user's targets
    if (this.workflowOptions?.preSelectedTargetUuids !== undefined) return new TokenDocumentSet(this.workflowOptions.preSelectedTargetUuids);
    return canvas?.scene ? new TokenDocumentSet(game.user?.targets ?? []) : new TokenDocumentSet();
  }

  /** Each target's sight, as setupCanSeeSense decided it, on its record (a point-in-time fact) */
  recordSight(): void {
    if (!this.ownsCard) return;
    for (const target of this.targets.tokens) {
      this.#persisted.setRecordFacts(target.document, {
        canSee: this.tokenCanSee.has(target), canSense: this.tokenCanSense.has(target),
        seesActor: this.targetsCanSee.has(target), sensesActor: this.targetsCanSense.has(target)
      });
    }
  }

  /** The recorded sight back into the sets; false for a card with none recorded */
  #restoreSight(): boolean {
    const records = recordList(cardMidi(this.#ownCard()).records).filter(record => typeof record.canSee === "boolean");
    if (!records.length) return false;
    for (const record of records) {
      const target = (fromUuidSync(record.uuid) as TokenDocument.Implementation | null)?.object;
      if (!target) continue;
      if (record.canSee) this.tokenCanSee.add(target);
      if (record.canSense) this.tokenCanSense.add(target);
      if (record.seesActor) this.targetsCanSee.add(target);
      if (record.sensesActor) this.targetsCanSense.add(target);
    }
    return true;
  }

  /** A rebuilt workflow's values that are worked out from its card and the canvas, not stored */
  #restoreFromCard() {
    this.suspended = true;
    this.#fromCard = true;
    this.itemUseComplete = true;
    if (this.#persisted.scalar("isCritical", false)) this.attackRollModifierTracker.critical.setOverride(true, "restored", "Restored from chat card");
    if (this.#persisted.scalar("isFumble", false)) this.attackRollModifierTracker.fumble.setOverride(true, "restored", "Restored from chat card");
    // Where it waits, worked out from the card
    const resumePoint = Workflow.cardResumePoint(this.#ownCard()) ?? "";
    const action: unknown = Reflect.get(this, resumePoint);
    const isState = (value: unknown): value is WorkflowState => typeof value === "function";
    if (isState(action)) this.#currentStep = Workflow.stepIdOf(action);
    else error(`${this.workflowName} | no state ${resumePoint} to resume in`);
    // Waiting in a step a module inserted: there, with the rest of its move (the card can't tell that from its rolls)
    const move = this.#persisted.scalar<StepMove | undefined>("stepMove", undefined);
    const step: string | undefined = cardMidi(this.#ownCard()).state?.step;
    if (move?.inserted && step && !getStep(step)?.method) {
      this.#stepMove = { queue: [...(move.queue ?? [])], then: move.then, inserted: true };
      this.#currentStep = step;
    }
    if (!this.#item) error(`${this.workflowName} | could not find the item of card ${this.itemCardUuid}`);
    this.#mergeWorkflowOptions(this.workflowOptions);
    if (this.workflowOptions.preSelectedTargetUuids?.length) this.preSelectedTargets = this.#preSelectedTargets();
    if (!this.hasSave) this.failedSaves = this.activity.attack ? this.hitTargets.union(this.hitTargetsEC) : new TokenDocumentSet(this.targets);
    const records = recordList(cardMidi(this.#ownCard()).records);
    this.#advantageSaves = new TokenDocumentSet(records.filter(record => record.saveMode === 1).map(record => record.uuid));
    this.#disadvantageSaves = new TokenDocumentSet(records.filter(record => record.saveMode === -1).map(record => record.uuid));
    const speaker = this.chatCard?.speaker;
    const speakerToken = speaker?.token ? game.scenes?.get(speaker.scene ?? "")?.tokens.get(speaker.token)?.object : undefined;
    this.token = speakerToken ?? getOrCreateTokenForActor(this.actor) ?? undefined;
    if (this.damageRolls?.length) this.deriveDamage();
    if (this.bonusDamageRolls?.length) this.deriveBonusDamage();
    if (this.otherDamageRolls?.length) this.deriveOtherDamage();
    this.damageDetail = foundry.utils.deepClone(this.rawDamageDetail);
    this.bonusDamageDetail = foundry.utils.deepClone(this.rawBonusDamageDetail);
    this.otherDamageDetail = foundry.utils.deepClone(this.rawOtherDamageDetail);
    // The other activity's use declined: its damage dropped, the ammunition's kept
    if (this.otherConsumed === false) this.dropOtherActivityDamage();
    // A read-only copy is for reading the card: it doesn't recompute sight (asynchronous, so not there to read anyway)
    this.#damageFromCards = true;
    this.#damageReached = resumePoint === "WorkflowState_Completed" && !!(this.damageRolls?.length || this.otherDamageRolls?.length || this.bonusDamageRolls?.length);
    // Sight as it was decided, from the records (tokens move: recomputing would answer for where they are now); a card
    // written before sight was recorded is worked out again, as it was then
    if (!this.#restoreSight() && !this.readOnly && isMidiActivityType(this.activity)) void setupCanSeeSense(this.activity, { workflow: this });
    const saves = this.targets.documents.flatMap(t => t.uuid ? [[t.uuid, cardSaveRoll(this.chatCard, t.uuid)] as const] : []).filter(([, roll]) => !!roll);
    if (saves.length) this.#restoredSaves = Object.fromEntries(saves) as Record<string, Roll>;
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
    const workflow = Workflow.findWorkflow(itemCardUuid);
    if (!chatMessage) return;
    const update = { "system.midi.progress": { confirmed: true } } as ChatMessage.UpdateData;
    return workflow ? await workflow.performThrottledUpdate(chatMessage, update) : await throttledUpdate(chatMessage, update);
  }

  static async removeItemCardButtons(itemCardUuid: string | null | undefined, { removeAllButtons = false, removeConfirmButtons = false, removeAllDnd5eButtons = false, removeDnd5eSaveButtons = false, finished = false } = {}) {
    try {
      const workflow = Workflow.findWorkflow(itemCardUuid);
      const chatMessage = workflow?.chatCard;
      if (!chatMessage) return;
      let allowRemoveAll = !(workflow && workflow.activity?.target.affects.type === "" && workflow.targets.count === 0)

      // The card is drawn from its data, so the events are recorded and `midiButtonVisibility` decides what each
      // viewer sees; the removal policies are the viewer's settings, read at render
        const progress: Record<string, boolean> = {};
        if (removeAllButtons && allowRemoveAll) progress.allRemoved = true;
        if (removeConfirmButtons) progress.confirmed = true;
        if (removeDnd5eSaveButtons || removeAllDnd5eButtons) progress.savesResolved = true;
        if (finished) progress.finished = true;
        if (foundry.utils.isEmpty(progress)) return;
        return await workflow.performThrottledUpdate(chatMessage, { "system.midi.progress": progress } as ChatMessage.UpdateData);

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
    // Only one in memory: an ended or forgotten workflow is not rebuilt to be removed
    Workflow.#ended.add(id);
    const entry = Workflow.#workflows.get(id);
    const workflow = entry instanceof WeakRef ? entry.deref() : entry;
    if (!workflow) {
      if (debugEnabled > 0) warn("removeWorkflow | No such workflow ", id);
      return;
    }
    if (workflow.postSummonHookId) Hooks.off("dnd5e.postSummon", workflow.postSummonHookId);
    // Nobody is waited for on behalf of a use that is gone
    workflow.endRollWait();
    endPlayerWaitsOwnedBy(workflow);
    if (debugEnabled > 0) warn(`removeWorkflow deleting ${id}`, workflow);
    // Remove buttons while the workflow is still filed: removeItemCardButtons finds it by id, and an ended id is not rebuilt
    try {
      await Workflow.#removeCardButtons(workflow);
    } finally {
      Workflow.#workflows.delete(id);
    }
  }

  static async #removeCardButtons(workflow: Workflow) {
    if (workflow.ownsCard) {
      if (workflow.currentStep === "midi-qol.ConfirmRoll") {
        await Workflow.deleteAbortedCard(workflow.chatCard);
        clearUpdatesCache(workflow.itemCardUuid);
      } else {
        await Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
        await workflow.flushCardWrites();
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

  /**
   * The pre/post hooks and onUse passes of midi's engine-run steps (steps/steps.ts), as the item sheet lists them; not
   * the inline reaction steps, which fire none
   */
  public static get stateHooks(): Record<string, string> {
    const hooks = {};
    for (const { name } of allSteps().filter(step => step.method)) {
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

  async callHooksForAction(prePost: ("pre" | "post"), action: WorkflowState | string): Promise<boolean | undefined> {
    if (!action) {
      console.warn("midi-qol | callPreHooksForAction | No action");
      return true;
    }
    if (debugEnabled > 1) log(`callHooksForAction | ${prePost} ${this.nameForState(action)}`)
    return this.callCancellableHooks(`midi-qol.${prePost}${this.nameForState(action)}`);
  }
  async callOnUseMacrosForAction(prePost: ("pre" | "post"), action: WorkflowState | string): Promise<(DamageBonusMacroResult | any)[]> {
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

    if (this.ammunition) await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros(macroPass), "OnUse", macroPass);
    if (debugEnabled > 1) log(`callOnUseMacrosForAction | ${this.onUseMacros?.getMacros(macroPass)}`)
    return this.callMacros(this.item, this.onUseMacros?.getMacros(macroPass), "OnUse", macroPass);

  };

  public static nameForState(state: WorkflowState | string): string {
    if (state === undefined) return "undefined";
    if (typeof state === "string") return getStep(state)?.name ?? state;
    return state.name.replace(/^WorkflowState_/, "") ?? state.name;
  }

  public nameForState(state: WorkflowState | string): string {
    return Workflow.nameForState(state);
  }

  // A roll that finished while its waiting state was still on its way to suspending (writing the card): taken up then
  #pendingEvent: { step: string | undefined, event?: WorkflowEvent } | undefined;

  /** The state that waits for `event`, if the workflow is in it */
  #awaits(event: WorkflowEvent | undefined): boolean {
    const waiting = this.currentStep;
    switch (event) {
      case "attackRolled": return waiting === "midi-qol.WaitForAttackRoll";
      case "damageRolled": case "noDamage": return waiting === "midi-qol.WaitForDamageRoll";
      case "utilityRolled": return waiting === "midi-qol.WaitForUtilityRoll";
      default: return false;
    }
  }

  /** Wake a suspended workflow; without an event it re-runs the state it waits in */
  public async resume(event?: WorkflowEvent) {
    // The roll a step started and awaits: the step goes on itself (#rollInStep). Only the event that step waits for
    // answers it (its own roll's); another (a button for a different roll meanwhile) is dropped, as for a running step
    if (this.#stepRoll) {
      if (this.#awaits(event)) this.#stepRoll.event = event;
      else if (debugEnabled > 0) warn(`${this.workflowName} | resume(${event}) while ${this.nameForState(this.currentAction)} awaits its own roll: ignored`);
      return;
    }
    if (!this.suspended) {
      if (this.executingStates > 0 && this.#awaits(event)) this.#pendingEvent = { step: this.#currentStep, event };
      return;
    }
    // New damage while saves are awaited is shown, and the saves keep waiting
    if (event === "damageRolled" && this.currentStep === "midi-qol.WaitForSaves") return this.displayDamageRolls();
    this.suspended = false;
    Workflow.#holdRunning(this);
    // A module's step has no state method: it waits in its step id and is run again
    return this.performState((event ? this.stateAfter(event) : this.currentAction) ?? this.#currentStep!);
  }

  #stepRoll: { event?: WorkflowEvent } | undefined;
  /** A step is awaiting a roll it started (M2 stage 5): the roll's resume is the step's answer */
  get inStepRoll(): boolean { return !!this.#stepRoll; }

  /**
   * Start a roll and wait for it inside the step (an auto roll). The roll's resume(event) answers the step instead of
   * resuming the workflow; the step goes on to `stateAfter(event)`, or waits (Suspend) when the roll was cancelled.
   */
  /** @internal */
  async rollInStep(roll: () => unknown): Promise<WorkflowState> {
    const stepRoll: { event?: WorkflowEvent } = {};
    this.#stepRoll = stepRoll;
    try {
      await roll();
    } finally {
      this.#stepRoll = undefined;
    }
    if (this.aborted) return "midi-qol.Abort";
    return stepRoll.event ? this.stateAfter(stepRoll.event) : "midi-qol.Suspend";
  }

  /** Where a suspended workflow goes when `event` arrives: by the state it waits in, else that state again */
  stateAfter(event: WorkflowEvent): WorkflowState {
    const waiting = this.currentStep;
    switch (event) {
      case "attackRolled":
        if (waiting === "midi-qol.WaitForAttackRoll") return this.abort ? "midi-qol.Abort" : "midi-qol.AttackRollComplete";
        // A re-rolled attack
        if (waiting === "midi-qol.WaitForDamageRoll" || waiting === "midi-qol.ConfirmRoll" || waiting === "midi-qol.Completed")
          return "midi-qol.AttackRollComplete";
        break;
      case "damageRolled":
        if (waiting === "midi-qol.WaitForDamageRoll" || waiting === "midi-qol.Completed") return "midi-qol.ConfirmRoll";
        break;
      case "noDamage":
        if (waiting === "midi-qol.WaitForDamageRoll") return "midi-qol.WaitForSaves";
        break;
      case "utilityRolled":
        if (waiting === "midi-qol.WaitForUtilityRoll" || waiting === "midi-qol.Completed") return "midi-qol.UtilityRollComplete";
        break;
    }
    return waiting;
  }

  /** @deprecated since 14.6.9: use resume(event) */
  public async unSuspend(context: WorkflowContext = {}) {
    if (!deprecation("Workflow#unSuspend is deprecated: use Workflow#resume(event), event one of attackRolled, damageRolled, noDamage, utilityRolled.", { since: "14.6.9", until: "14.8.0" }))
      throw removedError("Workflow#unSuspend", "14.8.0", "use Workflow#resume(event)");
    const event: WorkflowEvent | undefined = context.attackRoll ? "attackRolled" : context.damageRoll || context.otherDamageRoll ? "damageRolled"
      : context.noDamage ? "noDamage" : context.utilityRolls ? "utilityRolled" : undefined;
    return this.resume(event);
  }

  async processPlacedTemplates(templates: (MeasuredTemplateDocument | RegionDocument)[], activity?: Activity): Promise<boolean> {
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
      if (docToStore.uuid) this.templateUuid = docToStore.uuid;  // setter pushes to array + persists
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
        if (isMidiActivityType(activity)) await attachRegionActivityBehavior(activity, regionDoc, this, overTimeActivity, this.spellLevel);
      }
    }
    if (this.suspended && this.currentStep === "midi-qol.AwaitTemplate") {
      this.resume();
    }
    return true;
  }

  /**
   * A person drives this use, so its template's targets are shown as the player's (user-targets plan stage 2). Not a
   * use given its targets, one started by completeActivityUse or attack per target (a sequence), a trap or over-time.
   */
  get showsTargetsToUser(): boolean {
    return !this.workflowOptions.ignoreUserTargets && this.sequenceId === undefined && !this.workflowOptions.isOverTime
      && this.flowId !== "midi-qol.trap";
  }

  /** The use's targets were worked out from its templates (auto-target), not left to the player's selection */
  templateTargetsComputed = false;

  /** The template's targets are the use's, worked out directly; the player sees them only when they drive the use */
  selectAllTemplateTargets(activity?: Activity): void {
    const tokens = computeActivityTemplateTargets(activity ?? this.activity, this.templateUuids);
    if (!tokens) return;
    // Creatures on other levels reached through an opening have no canvas token, so they join the use's targets, not the user's
    const offLevel = computeOffLevelTemplateTargets(activity ?? this.activity, this.templateUuids);
    this.setTargets(new Set<TokenOrDocument>([...tokens, ...offLevel]));
    this.templateTargetsComputed = true;
    if (this.showsTargetsToUser) updateUserTargets(tokens.map(t => t.id).filter(Boolean) as string[]);
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
      if (concentrationEffect.uuid) await (flagDoc as MeasuredTemplateDocument).setFlag("dnd5e", "dependentOn", concentrationEffect.uuid);
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
        dae: { stackable: "noneName", expiryMode: "delete" },
        dnd5e: this.casterEffectSource()
      },
    };

    if (converted.type === "seconds") {
      if (converted.seconds !== undefined) {
        effectData.duration = { value: converted.seconds, units: "seconds", expiry: null };
      }
      effectData.start = { time: game.time?.worldTime ?? 0 };
    } else if (converted.type === "turns") {
      if ((converted.rounds ?? 0) > 0) {
        effectData.duration = { value: converted.rounds, units: "rounds", expiry: null };
      } else if ((converted.turns ?? 0) > 0) {
        effectData.duration = { value: Math.max(converted.turns ?? 1, 1), units: "turns", expiry: null };
      }
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

  /**
   * Run the workflow from `newState` (a step id or a state method) until it suspends or ends. On each move to a new
   * step: the old step's post pass and hook, then the new step's pre pass and hook (either can cancel or abort).
   */
  public async performState(newState: WorkflowState | string) {
    const workflow = this;
    const next: string | undefined = Workflow.stepIdOf(newState);
    // The workflow moved on: a roll it waited on its player for is done
    if (next !== SUSPEND) this.endRollWait();
    if (this.readOnly) {
      console.warn(`midi-qol | ${this.workflowName} is a read-only copy of another user's workflow: it does not run`);
      return;
    }
    if (this.stateTransitionCount === undefined) this.stateTransitionCount = 0;
    this.executingStates += 1;
    const nameOf = (id: string | undefined) => (id && getStep(id)?.name) ?? String(id);

    try {
      const host: EngineHost = {
        get currentStep() { return workflow.#currentStep; },
        set currentStep(id) { workflow.currentAction = id; },
        get aborted() { return workflow.aborted; },
        cancelled: () => { this.outcome = "cancelled"; },
        // Named after the step (midi's or a module's): a module's step has hooks and passes as midi's do
        pass: (prePost, step) => this.callOnUseMacrosForAction(prePost, step as string),
        hook: (prePost, step) => this.callHooksForAction(prePost, step as string),
        changes: step => this.assembledSteps.anchors[step],
        flowNext: step => stepAfterInFlow(getFlow(this.flowId)?.steps ?? [], step),
        get move() { return workflow.#stepMove; },
        set move(value) {
          workflow.#stepMove = value;
          // On the card, so a use rebuilt while an inserted step waits resumes in it
          if (!workflow.readOnly) workflow.#persisted.setScalar("stepMove", value ? { ...value, queue: [...value.queue] } : undefined);
        },
        run: async step => {
          this.#queueingWrites += 1;
          const at = Date.now();
          let after: string | undefined;
          try {
            return after = Workflow.stepIdOf(await this.#runStep(step));
          } finally {
            this.#queueingWrites -= 1;
            if (step) this.#recordStep(step, after, at);
          }
        },
        stepEnded: async (step, after) => {
          if (after === SUSPEND || getStep(step ?? "")?.flush) await this.flushCardWrites();
          else if (chatCardUpdates === "everyStep") await this.flushCardWrites(true);
          if (after === SUSPEND && debugEnabled > 0) warn(`${this.workflowName} ${nameOf(step)} -> suspended Workflow ${this.id}`);
        },
        pendingNext: step => {
          const pending = this.#pendingEvent;
          this.#pendingEvent = undefined;
          return pending && pending.step === step ? Workflow.stepIdOf(this.stateAfter(pending.event!)) : undefined;
        },
        countTransition: () => {
          const count = this.stateTransitionCount ?? 0;
          if (count >= this.maxTransitionCount) return false;
          this.stateTransitionCount = count + 1;
          return true;
        },
        get suspended() { return workflow.suspended; },
        set suspended(value) { workflow.suspended = value; },
        tick: async () => { await busyWait(1); },
        report: message => {
          const text = `${this.workflowName} ${message}`;
          error(text);
          TroubleShooter.recordError(new Error(text), text);
        },
        note: message => console.warn(`${this.workflowName} ${this.id} ${message}`),
        name: nameOf
      };
      const stopped = await withFixedDice(this.workflowOptions?.fixedDice, () => runSteps(host, next));
      if (stopped === "limit") {
        const message = `performState | ${this.workflowName} Workflow ${this.id} exceeded ${this.maxTransitionCount} iterations`;
        error(message);
        TroubleShooter.recordError(new Error(message), message);
      }
    } catch (err) {
      const message = `performState | ${this.workflowName} Workflow ${this.id}`;
      error(message, err);
      TroubleShooter.recordError(err, message);
      // The run failed before it could wait properly: nobody is shown as waited for by a use that has stopped
      if (!this.suspended) {
        this.endRollWait();
        endPlayerWaitsOwnedBy(this);
      }
    } finally {
      // The run ended (finished, aborted, or an error): nothing stays queued
      try {
        if (this.executingStates === 1) await this.flushCardWrites();
      } finally {
        this.executingStates -= 1;
      }
    }
  }

  /** A move with inserted steps under way (steps/engine.ts), kept across runs */
  #stepMove: StepMove | undefined;
  #assembledSteps: AssembledSteps | undefined;
  /** Rebuilt from its card: its flow changes are the ones stored when it started */
  #fromCard = false;
  /**
   * This use's changes to its flow (steps/assembly.ts): the global changes whose `when` applies and its call's
   * (`workflowOptions.steps`), worked out when it first runs a step and stored on the card for a rebuild.
   */
  get assembledSteps(): AssembledSteps {
    if (this.#assembledSteps) return this.#assembledSteps;
    let changes: StepChange[];
    if (this.#fromCard) changes = this.#persisted.scalar<StepChange[] | undefined>("stepChanges", undefined) ?? [];
    else {
      changes = useStepChanges(this, this.workflowOptions?.steps, { item: this.item, activity: this.activity });
      if (changes.length && !this.readOnly) this.#persisted.setScalar("stepChanges", changes);
    }
    this.#stepChangeList = changes;
    this.#assembledSteps = assembleSteps(changes);
    reportAssembly(this.#assembledSteps);
    const missing = missingSteps(changes);
    if (missing.length) this.#reportMissingSteps(missing);
    return this.#assembledSteps;
  }

  /** The step changes this use was assembled from (for the trace: who changed each step) */
  #stepChangeList: StepChange[] = [];
  #trace: TraceStep[] = [];
  /** The steps this use ran, in order (M25: lib/useTrace.ts builds the whole trace from it and the outcome) */
  get trace(): readonly TraceStep[] { return this.#trace; }

  /** A step ran: when, how long, where it went on to, and the step changes that acted on it (inserted, replaced, wrapped) */
  #recordStep(step: string, next: string | undefined, at: number) {
    const changes = this.#stepChangeList.filter(change =>
      (change.kind === "insert" && change.step === step) || ((change.kind === "replace" || change.kind === "wrap" || change.kind === "remove") && change.target === step))
      .map(change => ({ kind: change.kind, step: change.kind === "wrap" ? change.wrapper : change.kind === "remove" ? change.target : change.step, source: change.source, layer: change.layer }));
    // A run bounded by maxTransitionCount: a trace of at most that many steps per run
    this.#trace.push({ step, next, at, ms: Date.now() - at, ...(changes.length ? { changes } : {}) });
  }

  #missingReported = false;
  /** A step the use needs isn't registered here (its module isn't active on this client, or it changed): said once */
  #reportMissingSteps(missing: string[]) {
    if (this.#missingReported) return;
    this.#missingReported = true;
    const text = `${this.workflowName}: this use needs the step${missing.length > 1 ? "s" : ""} ${missing.join(", ")}, not registered on this client (is the module that adds ${missing.length > 1 ? "them" : "it"} active?)`;
    ui.notifications?.error(`midi-qol | ${text}`);
    TroubleShooter.recordError(new Error(text), "steps");
  }

  /** Run one step: its replacement if the use has one, inside its wrappers; midi's steps by their method, a module's by its run */
  async #runStep(id: string | undefined): Promise<WorkflowState | string | undefined> {
    if (!id) throw new Error(`${this.workflowName}: no step to run`);
    const anchor = this.assembledSteps.anchors[id];
    const target = anchor?.replacement ?? id;
    const missing = [target, ...(anchor?.wraps ?? [])].filter(step => !getStep(step));
    if (missing.length) {
      this.#reportMissingSteps(missing);
      return ABORT;
    }
    const flowNext = () => stepAfterInFlow(getFlow(this.flowId)?.steps ?? [], id);
    // A replacement that names no step: on to the step after the one it replaced in the flow
    let run = anchor?.replacement
      ? async (): Promise<string | undefined> => (await this.#runOwn(target)) ?? flowNext()
      : (): Promise<string | undefined> => this.#runOwn(target);
    for (const wrapperId of [...(anchor?.wraps ?? [])].reverse()) {
      const wrapper = getStep(wrapperId);
      if (!wrapper?.run) { reportServiceProblem("steps", wrapperId, `wraps ${id} but isn't a registered step with run`); continue; }
      const inner = run;
      // A wrapper that names no step keeps what the step it wrapped said (its Suspend included); one that never
      // ran it stands in for it, and goes on to the flow's next step
      run = async () => {
        let called = false;
        let innerAnswer: string | undefined;
        const next = async () => { called = true; return innerAnswer = await inner(); };
        const answer = Workflow.#asStepId(await wrapper.run!({ workflow: this, next }));
        return answer ?? (called ? innerAnswer : flowNext());
      };
    }
    return run();
  }

  /** What a module's step returned, as a step to go to (anything but a step id: go on) */
  static #asStepId(value: unknown): string | undefined {
    return typeof value === "string" ? Workflow.stepIdOf(value) ?? value : undefined;
  }

  /**
   * An inline step (a reaction trigger: steps.ts `inline`): `own` is what it does; the use's changes apply. Inserted
   * steps fire their pre/post hooks and passes; their results are ignored (no branching from here).
   */
  async runInlineStep<T>(id: string, own: () => Promise<T>, extra: Partial<StepContext> = {}): Promise<T | undefined> {
    const anchor = this.assembledSteps.anchors[id];
    if (!anchor) return own();
    const runModule = async (stepId: string, next: () => Promise<unknown>): Promise<unknown> => {
      const step = getStep(stepId);
      if (!step?.run) { this.#reportMissingSteps([stepId]); return undefined; }
      return step.run({ ...extra, workflow: this, next });
    };
    const inserted = async (stepId: string) => {
      await this.callOnUseMacrosForAction("pre", stepId);
      if (await this.callHooksForAction("pre", stepId) === false) return;
      await runModule(stepId, async () => undefined);
      await this.callOnUseMacrosForAction("post", stepId);
      await this.callHooksForAction("post", stepId);
    };
    for (const stepId of anchor.before) await inserted(stepId);
    let result: T | undefined;
    if (!anchor.removed) {
      let run: () => Promise<unknown> = anchor.replacement ? () => runModule(anchor.replacement!, async () => undefined) : own;
      for (const wrapperId of [...anchor.wraps].reverse()) {
        const inner = run;
        run = () => runModule(wrapperId, inner);
      }
      result = await run() as T | undefined;
    }
    for (const stepId of anchor.after) await inserted(stepId);
    return result;
  }

  /** A reaction trigger: the reaction step for `triggerType` (REACTION_STEPS), whose default asks the target (doReactions) */
  async askReactionsStep(target: TokenOrDocument | string, triggerTokenUuid: string | null | undefined, triggeringRoll: Roll | null | undefined, triggerType: string, options: any = {}): Promise<ReactionResult> {
    const id = REACTION_STEPS[triggerType];
    const replaced = this.replacedPort("askReactions");
    const ask = () => (replaced ?? doReactions)(target, triggerTokenUuid, triggeringRoll, triggerType, options) as Promise<ReactionResult>;
    if (!id) return ask();
    // A step's context gives TokenDocuments (proposal section 18): the target as given goes only to midi's own ask
    return (await this.runInlineStep(id, ask, { reaction: { target: getTokenDocument(target), triggerTokenUuid, triggeringRoll, triggerType, options } })) ?? {};
  }

  async #runOwn(id: string): Promise<string | undefined> {
    const own = async (): Promise<unknown> => {
      const step = getStep(id);
      if (step?.run) return step.run({ workflow: this, next: async () => undefined });
      const method = this.methodForStep(id);
      if (!method || stepForwarders.has(method)) throw new Error(`${this.workflowName}: no step ${id}`);
      return method.call(this);
    };
    // The flow's own implementation of the step (a trap's, saves first's...), which may run the step's own
    const variant = flowVariant(this.flowId, id);
    const result = variant ? await variant({ workflow: this, base: own }) : await own();
    return typeof result === "string" ? Workflow.#asStepId(result) : Workflow.stepIdOf(result as WorkflowState);
  }

  get postAttackRollState(): WorkflowState {
    return "midi-qol.WaitForDamageRoll"
  }

  /** A roll this player's workflow waits for them to make, shown to the GM (the player list) to roll for them. */
  #rollWait: { end: () => void } | undefined;

  /**
   * The workflow waits for its player to roll (a card button, or the roll dialog auto-roll opened): let the GM roll for
   * them, with the choices the roll dialog offers. Not for a GM's own use.
   */
  waitOnPlayerRoll(kind: "attack" | "damage" | "utility") {
    this.endRollWait();
    if (!game.user || game.user.isGM || !this.actor) return;
    // midi isn't checking hits, so it can't know a damage roll is due
    if (kind === "damage" && this.activity.attack && configSettings.autoCheckHit === "none") return;
    // The actor's earlier uses still waiting were left unrolled
    Workflow.endRollWaits(workflow => workflow !== this && workflow.actor?.uuid === this.actor.uuid);
    const dismiss = { label: "midi-qol.PlayerWaits.Choice.dismiss", value: () => undefined };
    const choice = (mode: string) => ({ label: `midi-qol.PlayerWaits.Choice.${mode}`, value: () => this.rollForPlayer(kind, mode) });
    const choices = kind === "attack" ? { normal: choice("normal"), advantage: choice("advantage"), disadvantage: choice("disadvantage"), dismiss }
      : kind === "damage" ? { normal: choice("normal"), critical: choice("critical"), dismiss }
      : { roll: { label: "midi-qol.PlayerWaits.Choice.roll", value: () => this.rollForPlayer(kind, "normal") }, dismiss };
    this.#rollWait = beginPlayerWait<unknown>({
      kind, userId: game.user.id!, actorUuid: this.actor.uuid ?? undefined, tokenUuid: this.tokenDocument?.uuid ?? undefined, keepDialogs: true,
      label: i18nFormat(`midi-qol.PlayerWaits.${kind}Label`, { item: this.item?.name ?? "" }),
      choices,
      onSettled: () => { this.#rollWait = undefined; Workflow.#rollWaiters.delete(this); }
    });
    if (this.#rollWait) Workflow.#rollWaiters.add(this);
  }

  /** This client's uses waiting on their player's roll. */
  static #rollWaiters = new Set<Workflow>();

  /** The roll is made, or no longer expected: the wait is no longer shown. The use itself is unchanged. */
  endRollWait() {
    this.#rollWait?.end();
    this.#rollWait = undefined;
    Workflow.#rollWaiters.delete(this);
  }

  /** Ends the roll waits of uses left unrolled: a deleted card, another use by the actor (not a turn change: user, 2026-11-19). */
  static endRollWaits(matches: (workflow: Workflow) => boolean = () => true) {
    for (const workflow of [...Workflow.#rollWaiters]) if (matches(workflow)) workflow.endRollWait();
  }

  /** Roll for the player as their roll dialog would: press its button when it is open, else roll without it. */
  async rollForPlayer(kind: "attack" | "damage" | "utility", mode: string) {
    const dialog = this.actor.uuid ? rollDialogsFor(this.actor.uuid)[0] : undefined;
    const button = dialog?.element?.querySelector<HTMLButtonElement>(`button[data-action="${mode}"]`)
      ?? dialog?.element?.querySelector<HTMLButtonElement>(`button[data-action="normal"]`);
    if (button) return button.click();
    const midiOptions: Record<string, unknown> = { ...this.rollOptions, workflowOptions: this.workflowOptions };
    if (kind === "attack") {
      // As the card's Advantage/Disadvantage buttons: the attack's advantage check reads the workflow's options
      this.workflowOptions.advantage = mode === "advantage";
      this.workflowOptions.disadvantage = mode === "disadvantage";
      Object.assign(midiOptions, { fastForwardAttack: true });
      await this.activity.rollAttack!({ workflow: this, midiOptions }, { configure: false }, {});
    } else if (kind === "damage") {
      Object.assign(midiOptions, { fastForwardDamage: true, isCritical: mode === "critical" || this.isCritical });
      await this.activity.rollDamage({ workflow: this, midiOptions }, { configure: false }, { create: false });
    } else {
      await this.activity.rollFormula!({ workflow: this, midiOptions }, { configure: false }, { create: false });
    }
  }

  _formatAttackTargets() {
    const targets = new Map<string, { name: string; img?: string | null; uuid: string; ac: number | string }>();
    for (const token of this.targets.documents) {
      const { name } = token;
      const { img, system, uuid } = token.actor ?? {};
      // @ts-expect-error no dnd5e-types
      const ac: number | string = system?.attributes?.ac?.value ?? "";
      if (uuid && Number.isNumeric(ac)) targets.set(uuid, { name, img, uuid, ac: ac });
    }
    return Array.from(targets.values());
  }

  // Never read by midi or any known module: kept for macros, worked out when asked. Remove in 14.8.0.
  /** Whether a deprecated field is still served (warning) or, on a line at or past 14.8.0, gone */
  static #deprecatedField(name: string): boolean {
    return deprecation(`midi-qol | workflow.${name} is deprecated and will be removed in 14.8.0`, { since: "14.6.9", until: "14.8.0", once: true });
  }
  get healingAdjustedDamageTotal() { return Workflow.#deprecatedField("healingAdjustedDamageTotal") ? sumRolls(this.damageRolls, "negativeIgnoreTemp") : undefined; }
  get healingAdjustedBonusDamageTotal() { return Workflow.#deprecatedField("healingAdjustedBonusDamageTotal") ? sumRolls(this.bonusDamageRolls ?? [], "negativeIgnoreTemp") : undefined; }
  get healingAdjustedOtherDamageTotal() { return Workflow.#deprecatedField("healingAdjustedOtherDamageTotal") ? sumRolls(this.otherDamageRolls ?? [], "negativeIgnoreTemp") : undefined; }
  get saveTargetsDisplayed() { return Workflow.#deprecatedField("saveTargetsDisplayed") ? !!this.saveDisplayData?.length : undefined; }
  get allOtherEffectTargets() { return Workflow.#deprecatedField("allOtherEffectTargets") ? new TokenDocumentSet(this.targets) : undefined; }

  /** The ammunition as it was when its last piece was spent and deleted (on the card); cards before 14.6.9 kept a flag */
  get spentAmmunitionData(): Item.CreateData | undefined {
    return this.#persisted.scalar<Item.CreateData | undefined>("ammunitionData", undefined) ?? storedMidiFlag(this.chatCard, "ammunitionData");
  }

  set spentAmmunitionData(data: Item.CreateData | undefined) {
    this.#persisted.setScalar("ammunitionData", data);
  }

  /** What the other activity's use consumed, false when declined or skipped, undefined until settled (on the card) */
  get otherConsumed(): object | false | undefined {
    return cardOtherConsumption(this.chatCard).consumed;
  }

  #setOtherConsumption(consumed: object | false, scaling?: number | false) {
    if (consumed === false) return this.#persisted.setScalar("otherDeclined", true);
    this.#persisted.setScalar("otherConsumed", consumed);
    if (typeof scaling === "number") this.#persisted.setScalar("otherScaling", scaling);
  }

  async checkOtherActivityConsumption(): Promise<boolean> {
    if (!isMidiActivityType(this.otherActivity) || !hasConsumption(this.otherActivity)) {
      return true;
    }

    const existing = this.otherConsumed;
    if (existing !== undefined) return existing !== false;

    const shouldShowDialog = !shouldAutoConsume(this.otherActivity, this);
    let otherUsageConfig: ActivityUseConfiguration = this.otherActivity._prepareUsageConfig({
      consume: { resources: true, spellSlot: false, action: false }
    }) as ActivityUseConfiguration;

    if (shouldShowDialog) {
      await this.flushCardWrites(); // a person decides next
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
          this.dropOtherActivityDamage();
          this.#setOtherConsumption(false);
          return false;
        }
        const consumed = getConsumptionData(messageConfig) ?? {};
        const scaling = otherUsageConfig.scaling;
        this.#setOtherConsumption(consumed, scaling);
      } catch (e) {
        this.dropOtherActivityDamage();
        this.#setOtherConsumption(false);
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
        this.dropOtherActivityDamage();
        this.#setOtherConsumption(false);
        return false;
      }

      const messageConfig: any = { data: {} };
      const consumeResult = await this.otherActivity.consume(otherUsageConfig, messageConfig);
      if (consumeResult === false) {
        // Consumption was cancelled by a hook
        this.dropOtherActivityDamage();
        this.#setOtherConsumption(false);
        return false;
      }
      const consumed = getConsumptionData(messageConfig) ?? {};
      const scaling = otherUsageConfig.scaling;
      this.#setOtherConsumption(consumed, scaling);
    }
    await this.rollDeferredOtherDamage();
    return true;
  }

  /** The targets the other activity's and the ammunition's damage apply to, each by its own use condition. */
  async buildOtherDamageMatches(): Promise<void> {
    const targets = this.activity.attack ? this.hitTargets.union(this.hitTargetsEC) : this.targets;
    // Every target, with a canvas token or not: a condition is evaluated against its Token, or its TokenDocument when it has none
    const matching = async (condition: string | undefined) => {
      const matches = new TokenDocumentSet();
      for (const document of targets.documents) {
        const target = targets.placeableOf(document) ?? document;
        if (await evalActivationCondition(this, condition, target, { async: true, errorReturn: false })) matches.add(target);
      }
      return matches;
    };
    // Already built (may be empty if the condition matched no targets)
    if (this.otherDamageMatches === undefined) this.otherDamageMatches = await matching(this.otherUseCondition);
    if (this.ammunitionDamageMatches === undefined && this.ammunitionActivity) this.ammunitionDamageMatches = await matching(this.ammunitionActivity.useCondition);
  }

  async rollDeferredOtherDamage(): Promise<void> {
    const config = this.otherDamageConfig;
    if (!config || !this.otherActivityOrAmmunition) return;

    const dialog = this.otherDamageDialog ?? {};

    try {
      const otherResult = await rollOtherDamage(this.activity, config, dialog);

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

  /**
   * The activity and item, as dnd5e's concentration effect records them, for midi's caster-side template, summon and
   * transform effects (which, like it, keep the item as their origin).
   */
  casterEffectSource() {
    return {
      activity: { type: this.activity.type, id: String(this.activity.id), uuid: this.activity.uuid },
      item: { type: this.item.type, id: this.item.id ?? "", uuid: this.item.uuid ?? "" }
    };
  }

  /** A Convenient Effects effect's source, recorded as dnd5e and DAE record an applied effect's. */
  recordEffectOrigin(effectData: ActiveEffect.CreateData, concentrationUuid: string | undefined) {
    effectData.origin = concentrationUuid ?? this.activity.uuid;
    foundry.utils.setProperty(effectData, "system.origin", { activity: this.activity.uuid, effect: concentrationUuid ?? null, message: this.itemCardUuid ?? null });
  }

  /**
   * An activity's statuses (midiProperties.statuses) for `token`, applied as the condition itself and tied to
   * concentration as its effects are: those marked onSave, or the others.
   */
  async applyActivityStatuses(activity: Activity | undefined, token: TokenOrDocument, onSave: boolean) {
    const entries = (activity?.midiProperties?.statuses ?? []).filter(entry => entry.id && !!entry.onSave === onSave);
    if (!activity || !entries.length || !token.actor) return;
    const concentrationUuid = this.actor.effects.get(this.concentrationId ?? "")?.uuid;
    const prepare = (effectData: ActiveEffect.CreateData) => {
      effectData.origin = concentrationUuid ?? activity.uuid;
      foundry.utils.setProperty(effectData, "system.origin", { activity: activity.uuid, effect: concentrationUuid ?? null, message: this.itemCardUuid ?? null });
      if (concentrationUuid) foundry.utils.setProperty(effectData, "flags.dnd5e.dependentOn", concentrationUuid);
    };
    for (const entry of entries) await applyStatusCondition(token.actor, entry.id, { specialDuration: entry.specialDuration, prepare });
  }

  /** effectsSelectTargets has run: its target sets are set for the steps after it */
  effectTargetsSelected(): asserts this is this & { effectTargets: TokenDocumentSet; otherEffectTargets: TokenDocumentSet;
    effectTargetsOnSave: TokenDocumentSet; otherEffectTargetsOnSave: TokenDocumentSet } {
    if (!this.effectTargets || !this.otherEffectTargets || !this.effectTargetsOnSave || !this.otherEffectTargetsOnSave)
      throw new Error("midi-qol | effects stage: targets not selected");
  }

  /** Activation conditions per target: the activity's, the other activity's and the ammunition's own */
  async effectsMatchTargets() {
    this.activationMatches = new TokenDocumentSet();
    this.otherActivationMatches = new TokenDocumentSet();
    this.activationFails = new TokenDocumentSet();
    this.otherActivationFails = new TokenDocumentSet();
    let targetsToUse = this.targets.documents;
    // Special case for target affects not specified an no targets selected when rolled - assume user has selected new targets so use those
    if (this.activity.target?.affects?.type === "" && targetsToUse.length == 0)
      targetsToUse = new TokenDocumentSet(game.user?.targets).documents;
    // The ammunition's effects apply by its own effect condition and save, not the other activity's.
    const ammunition = this.ammunitionActivity && this.ammunitionActivity !== this.otherActivity ? this.ammunitionActivity : undefined;
    const ammunitionEffectCondition: string | undefined = ammunition?.effectCondition;
    const ammunitionHasSave = !!ammunition && this.otherSaveActivity === ammunition;
    const ammunitionActivationMatches = new TokenDocumentSet();
    for (let token of targetsToUse) {
      if (!ammunitionEffectCondition || await evalActivationCondition(this, ammunitionEffectCondition, token, { async: true, errorReturn: true }))
        ammunitionActivationMatches.add(token);
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
    return { ammunition, ammunitionEffectCondition, ammunitionHasSave, ammunitionActivationMatches };
  }

  /** Which targets get the activity's, the other activity's and the ammunition's effects (applied and on save) */
  async effectsSelectTargets(ammo: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>) {
    const { ammunitionEffectCondition, ammunitionHasSave, ammunitionActivationMatches } = ammo;
    // By document, so targets with no canvas token (another scene or level) get their effects too
    const within = (set: TokenDocumentSet, keep: TokenDocumentSet) => new TokenDocumentSet(set.documents.filter(document => keep.has(document)));
    const allHits = this.hitTargets.union(this.hitTargetsEC);
    this.effectTargets = new TokenDocumentSet();
    this.otherEffectTargets = new TokenDocumentSet();
    // "On save" means whatever the save, not whatever the attack: an attack's on-save effects and statuses are for the
    // creatures it hit (all targets for an activity without an attack, or when effects are forced on)
    const hits = this.activity.attack ? allHits : this.targets;
    this.effectTargetsOnSave = this.forceApplyEffects ? this.activationMatches! : within(hits, this.activationMatches!);
    this.otherEffectTargetsOnSave = this.forceApplyEffects ? this.otherActivationMatches! : within(hits, this.otherActivationMatches!);
    if (this.forceApplyEffects) {
      this.effectTargets = new TokenDocumentSet();
    } else if ((this.saveActivity?.save || this.saveActivity?.check) && this.activity.attack) {
      this.effectTargets = within(allHits, this.failedSaves);
    } else if (this.activity.save || this.activity.check) this.effectTargets = this.failedSaves;
    else if (this.activity.attack) {
      this.effectTargets = allHits;
    } else
      this.effectTargets = this.targets;
    this.effectTargets = within(this.effectTargets, this.activationMatches!);

    if (this.forceApplyEffects) {
      this.otherEffectTargets = this.targets;
    } else if ((this.otherActivityOrAmmunition?.save || this.otherActivityOrAmmunition?.check) && this.activity.attack) {
      // check saves when selecting the effects to apply - deal with always apply effects
      this.otherEffectTargets = this.otherEffectActivationCondition ? allHits : within(allHits, this.failedSaves);
    } else if (this.otherActivityOrAmmunition?.save || this.otherActivityOrAmmunition?.check) this.otherEffectTargets = this.failedSaves;
    else if (this.activity.attack) {
      this.otherEffectTargets = allHits;
    } else
      this.otherEffectTargets = this.targets;
    this.otherEffectTargets = within(this.otherEffectTargets, this.otherActivationMatches!);

    let ammunitionEffectTargets = this.forceApplyEffects ? this.targets : hits;
    if (!this.forceApplyEffects && ammunitionHasSave && !ammunitionEffectCondition)
      ammunitionEffectTargets = within(ammunitionEffectTargets, this.failedSaves);
    ammunitionEffectTargets = within(ammunitionEffectTargets, ammunitionActivationMatches);
    const ammunitionEffectTargetsOnSave = within(hits, ammunitionActivationMatches);

    // Check consumption for other activity effects if not already checked
    // This handles the case where other activity has effects but no save and no damage
    if (this.otherActivity && this.otherEffectTargets.documents.length > 0) {
      const otherConsumedFlag = this.otherConsumed;
      if (otherConsumedFlag === false) {
        // Consumption was already declined - skip other effects
        this.otherEffectTargets = new TokenDocumentSet();
      } else if (otherConsumedFlag === undefined && isMidiActivityType(this.otherActivity) && hasConsumption(this.otherActivity)) {
        // Consumption not yet checked and other activity has consumption - check now
        const consumptionSuccess = await this.checkOtherActivityConsumption();
        if (!consumptionSuccess) {
          this.otherEffectTargets = new TokenDocumentSet();
        }
      }
    }
    return { ammunitionEffectTargets, ammunitionEffectTargetsOnSave };
  }

  /** False when effects are not applied: item effects off, or a preActiveEffects macro halted them */
  async effectsMayApply(): Promise<boolean> {
    if (configSettings.autoItemEffects === "off" && !this.forceApplyEffects) return false; // TODO see if there is a better way to do this.

    // TODO look at macros being per activity rather than per item
    if (this.activity.item) {
      if (configSettings.allowUseMacro && this.workflowOptions.noOnUseMacro !== true) {
        let results: any[] = await this.callMacros(this.activity.item, this.onUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
        // Special check for return of {haltEffectsApplication: true} from item macro
        if (results.some(r => r?.haltEffectsApplication))
          return false;
        results = await this.callMacros(this.ammunition, this.ammunitionOnUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
        if (results.some(r => r?.haltEffectsApplication))
          return false;
      }
    }
    return true;
  }

  /** The effects to apply: resolved from the activities' profiles, chosen, split between self and targets */
  async effectsResolve(ammunition: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>["ammunition"], ammunitionEffectTargets: TokenDocumentSet) {
    this.effectTargetsSelected();
    // no item, not auto effects or not module skip
    let useCE: string = configSettings.autoCEEffects;
    if (this.activity.midiProperties?.autoCEEffects && this.activity.midiProperties.autoCEEffects !== "default") {
      useCE = this.activity.midiProperties.autoCEEffects;
    }
    let ceEffect = getCEEffectByName(this.activity.name);
    if (!ceEffect) ceEffect = getCEEffectByName(this.activity.item.name);
    /*
     * An activity's effects, resolved from their dnd5e 6 profiles and split by onSave. Not
     * applicableEffects: that drops onSave. A profile names a local effect or, by uuid, a standalone
     * one such as a compendium effect, which only resolves asynchronously.
     */
    // An effect the use's region applies on entry reaches the creatures in the area through the region, not from the use as well
    const regionBehavior = this.activity.regionBehavior as { enabled?: boolean, rules?: { trigger: string, action: string, targetId: string }[] } | undefined;
    const regionRules = this.templateUuids.some(uuid => uuid.includes(".Region.")) && regionBehavior?.enabled ? regionBehavior.rules ?? [] : [];
    const regionEffectIds = new Set<string>(regionRules.filter(rule => rule.action === "applyEffect" && rule.trigger === "entry").map(rule => rule.targetId));
    const chosenEffect = chosenEffectId(this);
    const resolveEffects = async (activity: Activity | undefined | null) => {
      const resolved = { applied: [] as ActiveEffect.Implementation[], onSave: [] as ActiveEffect.Implementation[] };
      if (!activity) return resolved;
      // A Select Form transform's effects are its forms; dnd5e applies the chosen one.
      // @ts-expect-error no dnd5e-types
      if (isActivityType(activity, "transform") && activity.transform?.mode === "form") return resolved;
      const level = activity.relevantLevel;
      for (const profile of (activity.effects ?? []) as ActivityEffectData[]) {
        if (((profile.level?.min ?? -Infinity) > level) || (level > (profile.level?.max ?? Infinity))) continue;
        const effect = await profile.getEffect();
        // @ts-expect-error no dnd5e-types
        if (!effect || effect.transfer || effect.type === "enchantment") continue;
        if (activity === this.activity && effect.id && regionEffectIds.has(effect.id)) continue;
        // A choice of the activity's effects (M28): only the chosen one
        if (activity === this.activity && chosenEffect !== undefined && effect.id !== chosenEffect) continue;
        (profile.onSave === true ? resolved.onSave : resolved.applied).push(effect);
      }
      return resolved;
    };
    const activityResolved = await resolveEffects(this.activity);
    let activityEffects = activityResolved.applied;
    let onSaveActivityEffects = activityResolved.onSave;
    const otherResolved = await resolveEffects(this.otherActivity);
    let otherActivityEffects = otherResolved.applied;
    let onSaveOtherActivityEffects = otherResolved.onSave;
    // The ammunition's effects, applied with the other activity's (an item's other activity and its ammunition both can)
    const ammunitionResolved = await resolveEffects(ammunition);
    let ammunitionEffects = ammunitionResolved.applied;
    let onSaveAmmunitionEffects = ammunitionResolved.onSave;
    if (chosenEffect === undefined && activityEffects.length > 0 && this.effectTargets.count > 0 && this.activity.midiProperties?.chooseEffects) { // WIP
      activityEffects = await this.chooseEffects(activityEffects, { activity: this.activity, activityUuid: this.activity.uuid, isOtherActivity: false });
    }
    if (otherActivityEffects.length > 0 && this.otherEffectTargets.count > 0 && this.otherActivity?.midiProperties?.chooseEffects) { // WIP
      otherActivityEffects = await this.chooseEffects(otherActivityEffects, { activity: this.otherActivity, activityUuid: this.otherActivity.uuid, isOtherActivity: true });
    }
    if (ammunitionEffects.length > 0 && ammunitionEffectTargets.count > 0 && ammunition?.midiProperties?.chooseEffects) {
      ammunitionEffects = await this.chooseEffects(ammunitionEffects, { activity: ammunition, activityUuid: ammunition.uuid, isOtherActivity: true });
    }
    const ceTargetEffect = ceEffect && !(ceEffect?.flags?.dae?.selfTarget || ceEffect?.flags?.dae?.selfTargetAlways);
    const ceSelfEffect = ceEffect && (ceEffect?.flags?.dae?.selfTarget || ceEffect?.flags?.dae?.selfTargetAlways);
    // The resolved effects, not the item's: a profile can name an effect that is not on the item.
    const daeInstalled = !!installedModules.get("dae");
    const hasActivityEffects = daeInstalled && activityEffects.length > 0;
    const hasOtherActivityEffects = daeInstalled && otherActivityEffects.length > 0;
    const isSelfEffect = (ef: ActiveEffect.Implementation) => !!(ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways);
    const ammunitionSelfEffects = [...ammunitionEffects, ...onSaveAmmunitionEffects].filter(isSelfEffect);
    const ammunitionSelfAllEffects = ammunitionSelfEffects.filter(ef => ef.flags?.dae?.selfTargetAlways);
    ammunitionEffects = ammunitionEffects.filter(ef => !isSelfEffect(ef));
    onSaveAmmunitionEffects = onSaveAmmunitionEffects.filter(ef => !isSelfEffect(ef));

    const activitySelfEffects = [...activityEffects, ...onSaveActivityEffects].filter(ef => ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways) ?? [];
    const activitySelfAllEffect = [...activityEffects, ...onSaveActivityEffects].filter(ef => ef.flags?.dae?.selfTargetAlways) ?? [];
    const otherActivitySelfEffects = [...otherActivityEffects, ...onSaveOtherActivityEffects].filter(ef => ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways) ?? [];
    const otherActivitySelfAllEffects = [...otherActivityEffects, ...onSaveOtherActivityEffects].filter(ef => ef.flags?.dae?.selfTargetAlways) ?? [];

    activityEffects = activityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    otherActivityEffects = otherActivityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    onSaveActivityEffects = onSaveActivityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    onSaveOtherActivityEffects = onSaveOtherActivityEffects.filter(ef => !ef.flags?.dae?.selfTarget && !ef.flags?.dae?.selfTargetAlways);
    return {
      useCE, ceEffect, ceTargetEffect, ceSelfEffect, daeInstalled, hasActivityEffects, hasOtherActivityEffects,
      activityEffects, onSaveActivityEffects, otherActivityEffects, onSaveOtherActivityEffects, ammunitionEffects, onSaveAmmunitionEffects,
      activitySelfEffects, activitySelfAllEffect, otherActivitySelfEffects, otherActivitySelfAllEffects, ammunitionSelfEffects, ammunitionSelfAllEffects
    };
  }

  /** What DAE is given with each application: metadata, the concentration origin and the roll context */
  effectsApplicationData() {
    const metaData = {
      "flags": {
        "dae": { transfer: false },
        "midi-qol": {
          castData: this.castData,
          // The use's choices go with the effects it applies (M28): read on later turns, after the card is gone
          ...(Object.keys(this.choices).length ? { choices: this.choices } : {})
        }
      }
    };
    let origin = this.actor.effects.get(this.concentrationId ?? "")?.uuid
      ?? getConcentrationEffect(this.actor, this.item)?.uuid ?? undefined;
    // DAE records the source in system.origin as dnd5e does: the activity, this concentration and the card.
    const doEffectsData = {
      damageTotal: 0,
      damage: 0,
      critical: this.isCritical,
      fumble: this.isFumble,
      itemCardUuid: this.itemCardUuid,
      metaData,
      selfEffects: "none",
      spellLevel: this.spellLevel,
      concentrationUuid: origin,
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
            // @ts-expect-error no dnd5e-types
            scaling: this.chatCard?.system.scaling,
            // @ts-expect-error no dnd5e-types
            spellLevel: this.chatCard?.system.level
          }
        },
        utilityRollTotal: this.utilityRoll?.total,
      }
    }
    return { metaData, origin, doEffectsData };
  }

  /** Each target's effects and statuses: the activity's, the other activity's, the ammunition's, and CE */
  async applyTargetEffects(fx: Awaited<ReturnType<Workflow["effectsResolve"]>>, ammo: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>, ammoTargets: Awaited<ReturnType<Workflow["effectsSelectTargets"]>>, data: ReturnType<Workflow["effectsApplicationData"]>) {
    this.effectTargetsSelected();
    const { useCE, ceEffect, ceTargetEffect, daeInstalled, hasActivityEffects, hasOtherActivityEffects, activityEffects, onSaveActivityEffects,
      otherActivityEffects, onSaveOtherActivityEffects, ammunitionEffects, onSaveAmmunitionEffects } = fx;
    const { ammunition, ammunitionHasSave } = ammo;
    const { ammunitionEffectTargets, ammunitionEffectTargetsOnSave } = ammoTargets;
    const { metaData, origin, doEffectsData } = data;
    for (const token of this.targets.documents) {
      const tokenDamages = this.damageList?.find(di => di.targetUuid === token.uuid);
      if (tokenDamages) {
        doEffectsData.damageTotal = tokenDamages.totalDamage;
        doEffectsData.context.damageTotal = tokenDamages.totalDamage;
        doEffectsData.damage = tokenDamages.hpDamage;
        doEffectsData.context.damageApplied = tokenDamages.hpDamage;
        // All of the target's damage, as macros left it: other damage may be in an entry of its own
        doEffectsData.context.damageComponents = ((token.uuid ? this.targetDamage?.[token.uuid] : undefined) ?? [tokenDamages]).flatMap(entry => entry.calculatedDamages)
          .reduce((components: Record<string, number>, damage) => {
            components[damage.type] = damage.value + (components[damage.type] ?? 0);
            return components;
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
              )
            );
          }
          const effectsToApplyUuids = selectedEffects.map(ef => ef.uuid);
          if (effectsToApplyUuids?.length > 0) {
            await globalThis.DAE.doActivityEffects(this.activity, true, [token], effectsToApplyUuids, doEffectsData);
          }
        }
        const targetActorUuid = token.actor?.uuid;
        if (ceTargetEffect && this.activity.item && token.actor && targetActorUuid) {
          if (ceEffect && (["both", "cepri", "ceOnly"].includes(useCE) || (useCE === "itempri" && !hasActivityEffects))) {
            const targetHasEffect = token.actor.effects.find(ef => ef.name === ceEffect.name);
            if (this.activity.midiProperties?.toggleEffect && targetHasEffect) {
              await CEToggleEffect({ effectName: ceEffect.name, uuid: targetActorUuid, origin });
            } else {
              // Check stacking status
              let removeExisting = (["none", "noneName"].includes(ceEffect.flags?.dae?.stackable ?? "none"));
              const hasExisting = await CEHasEffectApplied({ effectName: ceEffect.name, uuid: targetActorUuid })
              if (removeExisting && hasExisting) {
                await CERemoveEffect({ effectName: ceEffect.name, uuid: targetActorUuid, origin });
              }
              const effectData = foundry.utils.mergeObject(ceEffect.toObject(), metaData);
              if (isInCombat(token.actor) && effectData.duration?.units === "seconds" && (effectData.duration?.value ?? 0) <= 60) {
                // @ts-expect-error fvtt-types v14 duration
                effectData.duration = { value: Math.ceil((effectData.duration.value ?? 0) / CONFIG.time.roundTime), units: "rounds" };
              }
              const concentrationUuid = this.actor.effects.get(this.concentrationId ?? "")?.uuid ?? undefined;
              this.recordEffectOrigin(effectData, concentrationUuid);
              if (concentrationUuid) {
                foundry.utils.setProperty(effectData, "flags.dnd5e.dependentOn", concentrationUuid);
              }
              await CEAddEffectWith({ effectData, effectName: ceEffect.name, uuid: targetActorUuid, origin, overlay: false });
            }
          }
        }
      }

      if (this.effectTargetsOnSave.has(token) && onSaveActivityEffects.length > 0) {
        const effectsToApplyUuids = onSaveActivityEffects.map(ef => ef.uuid);
        if (effectsToApplyUuids?.length > 0) {
          await globalThis.DAE.doActivityEffects(this.activity, true, [token], effectsToApplyUuids, doEffectsData)
        }
      }
      if (this.forceApplyEffects || this.effectTargets.has(token)) await this.applyActivityStatuses(this.activity, token, false);
      if (this.effectTargetsOnSave.has(token)) await this.applyActivityStatuses(this.activity, token, true);
      if (this.forceApplyEffects || this.otherEffectTargets.has(token)) {
        if (hasOtherActivityEffects) {
          let selectedEffects = otherActivityEffects;
          if (!this.forceApplyEffects) {
            selectedEffects = otherActivityEffects.filter(ef =>
              this.otherActivationMatches?.has(token) && this.otherEffectTargets?.has(token) && (
                !(this.otherActivity?.save || this.otherActivity?.check)
                || this.failedSaves.has(token)
              )
            );
          }
          const effectsToApplyUuids = selectedEffects.map(ef => ef.uuid);
          if (effectsToApplyUuids?.length > 0) {
            await globalThis.DAE.doActivityEffects(this.otherActivity, true, [token], effectsToApplyUuids, doEffectsData)
          }
        }
      }
      if (this.otherEffectTargetsOnSave.has(token) && onSaveOtherActivityEffects.length > 0) {
        const effectsToApplyUuids = onSaveOtherActivityEffects.map(ef => ef.uuid);
        if (effectsToApplyUuids?.length > 0) {
          await globalThis.DAE.doActivityEffects(this.otherActivity, true, [token], effectsToApplyUuids, doEffectsData)
        }
      }
      if (this.otherActivity) {
        const otherApplies = this.forceApplyEffects || (this.otherActivationMatches?.has(token) && this.otherEffectTargets.has(token)
          && (!(this.otherActivity.save || this.otherActivity.check) || this.failedSaves.has(token)));
        if (otherApplies) await this.applyActivityStatuses(this.otherActivity, token, false);
        if (this.otherEffectTargetsOnSave.has(token)) await this.applyActivityStatuses(this.otherActivity, token, true);
      }
      if (ammunition) {
        const applies = this.forceApplyEffects
          || (ammunitionEffectTargets.has(token) && (!ammunitionHasSave || this.failedSaves.has(token)));
        const uuids = [...(applies ? ammunitionEffects : []), ...(ammunitionEffectTargetsOnSave.has(token) ? onSaveAmmunitionEffects : [])].map(ef => ef.uuid);
        if (daeInstalled && uuids.length) await globalThis.DAE.doActivityEffects(ammunition, true, [token], uuids, doEffectsData);
        if (applies) await this.applyActivityStatuses(ammunition, token, false);
        if (ammunitionEffectTargetsOnSave.has(token)) await this.applyActivityStatuses(ammunition, token, true);
      }
    }
  }

  /** Self effects: all of them when targets were affected, only "apply to self always" ones when not */
  async applySelfEffects(fx: Awaited<ReturnType<Workflow["effectsResolve"]>>, ammo: Awaited<ReturnType<Workflow["effectsMatchTargets"]>>, ammoTargets: Awaited<ReturnType<Workflow["effectsSelectTargets"]>>, data: ReturnType<Workflow["effectsApplicationData"]>): Promise<ActiveEffect.Implementation[]> {
    this.effectTargetsSelected();
    const { daeInstalled, activitySelfEffects, activitySelfAllEffect, otherActivitySelfEffects, otherActivitySelfAllEffects, ammunitionSelfEffects, ammunitionSelfAllEffects } = fx;
    const { ammunition } = ammo;
    const { ammunitionEffectTargets } = ammoTargets;
    const { doEffectsData } = data;
    //Now do self effects
    let selfEffects: ActiveEffect.Implementation[] = [];
    if (this.effectTargets.documents.length > 0) selfEffects = activitySelfEffects;
    else selfEffects = activitySelfAllEffect;
    const selfToken = getOrCreateTokenForActor(this.actor);
    if (selfEffects.length > 0 && selfToken) {
      await globalThis.DAE.doActivityEffects(this.activity, true, [selfToken], selfEffects.map(ef => ef.uuid), doEffectsData)
    }

    let otherSelfEffects: ActiveEffect.Implementation[] = [];
    if (this.otherEffectTargets.documents.length > 0) otherSelfEffects = otherActivitySelfEffects;
    else otherSelfEffects = otherActivitySelfAllEffects;
    if (otherSelfEffects.length > 0 && selfToken) {
      await globalThis.DAE.doActivityEffects(this.otherActivity, true, [selfToken], otherSelfEffects.map(ef => ef.uuid), doEffectsData)
    }
    const ammunitionSelf = ammunitionEffectTargets.documents.length > 0 ? ammunitionSelfEffects : ammunitionSelfAllEffects;
    if (daeInstalled && ammunition && ammunitionSelf.length > 0 && selfToken) {
      await globalThis.DAE.doActivityEffects(ammunition, true, [selfToken], ammunitionSelf.map(ef => ef.uuid), doEffectsData);
    }
    return selfEffects;
  }

  /** The Convenient Effects self effect */
  async applyCESelfEffect(fx: Awaited<ReturnType<Workflow["effectsResolve"]>>, data: ReturnType<Workflow["effectsApplicationData"]>, selfEffects: ActiveEffect.Implementation[]) {
    this.effectTargetsSelected();
    const { useCE, ceEffect, ceSelfEffect } = fx;
    const { metaData, origin } = data;
    const actorUuid = this.actor?.uuid;
    if (this.actor && actorUuid && ceSelfEffect && (this.effectTargets.documents.length > 0 || ceEffect!.flags?.dae?.selfTargetAlways)) {
      if (["both", "cepri"].includes(useCE) || (useCE === "itempri" && !selfEffects.length)) {
        const actorHasEffect = this.actor.effects.find(ef => ef.name === this.activity.name);
        if (this.activity.midiProperties?.toggleEffect && actorHasEffect) {
          CEToggleEffect({ effectName: this.activity.name, uuid: actorUuid, origin });
        } else {
          // Check stacking status
          if ((ceEffect!.flags?.dae?.stackable ?? "none") === "none" && await CEHasEffectApplied({ effectName: this.activity.name, uuid: actorUuid })) {
            await CERemoveEffect({ effectName: this.activity.name, uuid: actorUuid, origin });
          }
          const effectData: ActiveEffect.CreateData = foundry.utils.mergeObject(ceEffect!.toObject(), metaData);
          const concentrationUuid = this.actor.effects.get(this.concentrationId ?? "")?.uuid ?? undefined;
          this.recordEffectOrigin(effectData, concentrationUuid);
          if (concentrationUuid) {
            foundry.utils.setProperty(effectData, "flags.dnd5e.dependentOn", concentrationUuid);
          }
          await CEAddEffectWith({ effectData, effectName: this.activity.name, uuid: actorUuid, origin, overlay: false });
        }
      }
    }
  }

  /** The card's buttons removed as the workflow is finished */
  /** Only the card's own workflow finishes it: a damage-only workflow adding to another use's card leaves that card alone */
  async completeCard() {
    if (this.ownsCard && this.chatCard) {
      await Workflow.removeItemCardButtons(this.itemCardUuid, { removeAllButtons: getRemoveAllButtons(this.activity), removeDnd5eSaveButtons: configSettings.autoCheckSaves !== "none", finished: true });
    }
  }

  /** The activity's triggered activity, unless it loops, its targets are missing or its condition fails */
  async runTriggeredActivity() {
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
        possibleTriggerActivity = await possibleTriggerActivity.getTriggeredActivity?.();
      }

      let triggeredActivity = await this.activity.getTriggeredActivity();
      if (shouldTrigger && triggeredActivity) {
        if (shouldTrigger) {
          let usage: { midiOptions: MidiOptions } = { midiOptions: {} };
          usage.midiOptions.event = this.rollOptions.event;
          // The triggering workflow's options, but not how that one invocation was made (the attack-per-target loop's
          // targetConfirmation "never" and rollAttackPerTarget): the triggered activity keeps its own confirmation
          const {
            targetConfirmation: _triggeringTargetConfirmation,
            rollAttackPerTarget: _triggeringRollAttackPerTarget,
            attackSplit: _triggeringAttackSplit,
            ...inheritedWorkflowOptions
          } = this.workflowOptions ?? {};
          // Only what transmission would carry: other modules' per-use state stays with this workflow.
          usage.midiOptions.workflowOptions = inheritableWorkflowOptions(inheritedWorkflowOptions);
          usage.midiOptions.rollOptions = this.rollOptions;
          usage.midiOptions.isTriggered = true;
          let targetUuids: string[] = [];
          const toUuids = (targets: TokenDocumentSet): string[] => targets.uuids;

          if (this.activity.midiProperties?.triggeredActivityRollAs) {
            switch (this.activity.midiProperties.triggeredActivityRollAs) {
              case "firstTarget": usage.midiOptions.rollAs = getActor(this.targets.documents[0]); break;
              case "firstHitTarget": usage.midiOptions.rollAs = getActor(this.hitTargets.documents[0]); break;
              case "firstMissedTarget": usage.midiOptions.rollAs = getActor(this.targets.difference(this.hitTargets).documents[0]); break;
              case "firstSaveTarget": usage.midiOptions.rollAs = getActor(this.saves.documents[0]); break;
              case "firstFailedSaveTarget": usage.midiOptions.rollAs = getActor(this.failedSaves.documents[0]); break;
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
  }

  /**
   * Hand back what dnd5e consumed for this use: an abort deletes the card, where dnd5e keeps the consumption and its
   * Refund button. Idempotent: a workflow can reach more than one abort path.
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
   * Begin the concentration MidiActivityMixin deferred, once the use can no longer be cancelled.
   * Same order as Activity#use: begin, record it on the card, then end the one it replaces.
   */
  async beginDeferredConcentration(): Promise<void> {
    const deferred = this.deferredConcentration;
    if (!deferred) return;
    this.deferredConcentration = undefined;
    let effect: ActiveEffect.Implementation | undefined;
    try {
      // @ts-expect-error no dnd5e-types
      effect = await this.actor.beginConcentrating(this.activity, { "flags.dnd5e.scaling": deferred.scaling });
      if (!effect) return;
      // @ts-expect-error no dnd5e-types
      if (this.chatCard) await this.chatCard.update({ "system.concentration": effect.id });
      // Templates placed by this use could not be linked while the effect did not exist yet.
      for (const templateUuid of this.templateUuids) {
        const templateDocument = await fromUuid(templateUuid) as MeasuredTemplateDocument | undefined;
        if (templateDocument && effect.uuid) await templateDocument.setFlag("dnd5e", "dependentOn", effect.uuid);
      }
      if (deferred.end) {
        // @ts-expect-error no dnd5e-types
        await this.actor.endConcentration(deferred.end);
      }
    } catch (err) {
      const message = `${this.workflowName} could not begin deferred concentration`;
      error(message, err);
      TroubleShooter.recordError(err, message);
    } finally {
      // Templates held back for the concentration link get the non-concentration cleanup instead.
      if (!effect) {
        for (const templateUuid of this.templateUuids) {
          const templateDocument = await fromUuid(templateUuid) as MeasuredTemplateDocument | undefined;
          if (templateDocument) await this.setupTemplateCleanup(templateDocument);
        }
      }
    }
  }

  /** For an activity with effects, every target shown as affected on the card */
  async finishHitDisplay() {
    let chatMessage = this.chatCard;
    if (this.needsHitTargetsDisplayed && this.targets.documents.length > 0 && chatMessage && (this.activity.effects?.length || this.otherActivity?.effects?.length)) {
      this.hitDisplayData = {};
      // Always show all targets in the display, not just effectTargets (failed saves)
      for (const targetDocument of this.targets.documents) {
        const targetToken: TokenOrDocument = this.targets.placeableOf(targetDocument) ?? targetDocument;
        if (!targetToken.actor) continue;
        const targetTokenUuid = targetToken.actor?.uuid;
        if (!targetTokenUuid) continue;
        const img = await tokenPortrait(targetDocument);
        this.hitDisplayData[targetTokenUuid] = {
          targetClass: targetToken.actor.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-nonplayer-target",
          target: hookTarget(targetToken),
          hitClass: "success",
          acClass: "",
          img: img ?? "",
          gmName: getTokenName(targetToken),
          uuid: targetDocument.uuid ?? "",
          showAC: false,
          isHit: true
        };
      }
      await this.displayHits(chatMessage.whisper.length > 0, true);
      chatMessage = this.chatCard
    }
  }

  /** Card progress: effects applied (Apply and Remove), all of the activity's templates placed */
  async finishCardProgress() {
    {
      // The attack-button strip that used to live here is now `midiButtonVisibility`, which reaches
      // the same answer from `message.rolls` and re-reads the policy per viewer.
      const progress: Record<string, boolean> = {};
      if (configSettings.autoItemEffects === "applyRemove"
        && (this.activity.target?.affects.type !== "" || this.targets.count !== 0)) progress.effectsApplied = true;
      if (!foundry.utils.isEmpty(progress)) {
        await this.performThrottledUpdate(this.chatCard!,
          { "system.midi.progress": progress } as ChatMessage.UpdateData);
      }
    }
  }

  /** Summoned creatures depend on the concentration, or on an effect lasting the activity's duration */
  async finishSummonedCreatures(selfTarget: ReturnType<typeof getOrCreateTokenForActor> | Token.Implementation | undefined) {
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
              dnd5e: this.casterEffectSource()
            },
          }
          const inCombat = !!(game.combat?.turns.some(combatant => combatant.token?.id === selfTarget?.id));
          const converted = convertDuration(activityDuration, inCombat);
          if (converted.type === "none" || activityDuration?.units === "inst") {
            // Permanent/special duration - no expiry. dnd5e summons are often instantaneous (e.g. find familiar)
            effectData.start = { time: game.time?.worldTime ?? 0, round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
          } else if (converted.type === "seconds") {
            effectData.duration = { value: Math.max(converted.seconds ?? 1, 1), units: "seconds" };
            effectData.start = { time: game.time?.worldTime ?? 0 };
          } else if (converted.type === "turns") {
            if ((converted.rounds ?? 0) > 0) {
              effectData.duration = { value: converted.rounds, units: "rounds" };
            } else {
              effectData.duration = { value: Math.max(converted.turns ?? 1, 1), units: "turns" };
            }
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
  }

  /** Transformed actors are recorded on the concentration, or on an effect lasting the activity's duration */
  async finishTransformations(selfTarget: ReturnType<typeof getOrCreateTokenForActor> | Token.Implementation | undefined) {
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
              "midi-qol": { transformedActorUuids: this.transformedActorUuids },
              dnd5e: this.casterEffectSource()
            },
          }
          const inCombat = !!(game.combat?.turns.some(combatant => combatant.token?.id === selfTarget?.id));
          if (activityDuration?.units === "inst") {
            // This seems wrong, however lots of dnd5e summons activities have a duration of inst - e.g. find familiar
            effectData.start = { time: game.time?.worldTime ?? 0, round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
            //@ts-expect-error CONFIG.DND5E
          } else if (CONFIG.DND5E.permanentTimePeriods[activityDuration.units]) {
            effectData.start = { time: game.time?.worldTime ?? 0, round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
          } else {
            const convertedDuration = convertDuration(activityDuration, inCombat);
            if (convertedDuration.type === "seconds") {
              effectData.duration = { value: Math.max(convertedDuration.seconds ?? 1, 1), units: "seconds" };
              effectData.start = { time: game.time?.worldTime ?? 0 };
            } else if (convertedDuration.type === "turns") {
              if ((convertedDuration.rounds ?? 0) > 0) {
                effectData.duration = { value: convertedDuration.rounds, units: "rounds" };
              } else {
                effectData.duration = { value: Math.max(convertedDuration.turns ?? 1, 1), units: "turns" };
              }
              effectData.start = { round: game.combat?.round ?? 0, turn: game.combat?.turn ?? 0 };
            }
          }
          await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }
      }
    }
  }

  /** Dead targets untargeted, and the action marked used on the actor's turn */
  async finishTurnBookkeeping() {
    // Delayed to let the updates finish; only this workflow's targets, not ones targeted since for another use.
    if (autoRemoveTargets !== "none") {
      const finishedTargets = new TokenDocumentSet(this.targets);
      setTimeout(() => untargetDeadTokens(finishedTargets), 500);
    }
    if (this.inCombat && this.isTurn && this.activity.activation?.type === "action" && !this.AoO) {
      await setActionUsed(this.actor);
    }
  }

  initSaveResults() {
    this.saves = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
    this.failedSaves = this.activity.hasAttack ? new TokenDocumentSet(this.hitTargets) : new TokenDocumentSet(this.targets);
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
    // Sets this.flankingAdvantage, which the midi-qol.flanking rollModifiers contributor reads
    await this.checkFlankingAdvantage();

    // This should never happen
    if (!this.actor) return;

    const actType = this.activity.actionType || "none";

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

    await this.checkTargetAdvantage();
    // Long range, flanking, unseen/invisible/hidden, nearby foe and heavy weapon are midi's rollModifiers contributors (services/attackRollRules.ts)
    await collectRollModifiers({
      kind: "attack", actor: this.actor, token: getTokenDocument(this.token), target: this.targets.documents[0],
      activity: this.activity, item: this.item, workflow: this
    }, this.attackRollModifierTracker);
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
    if (this.hitTargets.count >= 1) {
      // grants.critical - check if ANY target has this flag
      for (const target of this.hitTargets.documents) {
        if (!target?.actor) continue;
        const targetName = target?.name ?? target?.actor?.name ?? "";
        const grants = target?.actor?.flags[MODULE_ID]?.grants?.critical ?? {};
        const fails = target?.actor?.flags[MODULE_ID]?.fail?.critical ?? {};

        // Special case: grants.critical.range
        // Measured to a target with a canvas token (getDistance gives -1 for one with no canvas token)
        const drawn = this.hitTargets.placeableOf(target);
        if (Number.isNumeric(grants.range) && drawn && getDistance(drawn, this.token, { wallsBlock: false }) <= Number(grants.range)) {
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
      for (const target of this.hitTargets.documents) {
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
      if (allTargetsGrantNoCrit && this.hitTargets.count > 0) {
        this.attackRollModifierTracker.critical.suppress(noCritFlag, `${getFlagDisplayName(noCritFlag)} (${noCritTargets.join(", ")})`);
      }
    }

    this.#persistAttackTracker();

    // Update roll with attribution and regenerate HTML if crit/noCrit flags changed
    const criticalChanged = this.attackRollModifierTracker.critical.isForced !== trackerHadCritical;
    const noCriticalChanged = this.attackRollModifierTracker.critical.isSuppressed !== trackerHadNoCritical;
    if (this.attackRoll && (criticalChanged || noCriticalChanged)) addAttribution(this.attackRoll, this.attackAttribution);
  }

  async checkFlankingAdvantage(): Promise<boolean> {
    if (!canvas) {
      console.warn("midi-qol | checkFlankingAdvantage | abandoned - no canvas defined")
      return false;
    }
    this.flankingAdvantage = false;
    this.flankingRollBonus = undefined;
    this.flankingAdvantageKind = undefined;
    if (this.item && !(["mwak", "msak"].includes(this.activity.actionType ?? ""))) return false;
    // Flanking is between an attacker and one enemy: an attack roll against several targets gets none.
    // Roll a separate attack per target gives each roll its own.
    if (this.targets.count !== 1) return false;

    const token = (fromUuidSync(this.tokenUuid) as TokenDocument)?.object;
    // Flanking is measured on the canvas: none for a target with no canvas token
    const target = this.targets.tokens[0];
    if (!target) return false;
    const flankingMode = checkRule("checkFlanking") as string;
    const isFlankedMode = ["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(flankingMode);
    const isFlankingMode = ["advonly", "ceonly", "midiFlanking"].includes(flankingMode);
    if (!isFlankedMode && !isFlankingMode) return false;
    const flankingBonusSetting = configSettings.optionalRules.flankingBonus ?? "advantage";

    // A fixed bonus goes into the attack roll as a labelled part (attackRollParts)
    if (flankingBonusSetting !== "advantage") {
      const bonus = Number(flankingBonusSetting) || 0;
      const flanked = isFlankedMode ? await computeFlankedStatus(target!) : !!token && await computeFlankingStatus(token, target!);
      if (bonus && flanked) this.flankingRollBonus = { bonus, kind: isFlankedMode ? "flanked" : "flanking", label: i18n(isFlankedMode ? "midi-qol.Flanked" : "midi-qol.Flanking") };
      return false;
    }

    // Flanked modes: markFlanking applies the flanked status to the target, which grants advantage
    if (isFlankedMode) {
      if (await markFlanking(token, target)) this.flankingAdvantageKind = "flanked";
      return false;
    }

    // Flanking modes (advonly, ceonly, midiFlanking): markFlanking applies the attacker's status (ceonly, midiFlanking)
    const needsFlanking = await markFlanking(token, target);
    if (needsFlanking) this.flankingAdvantageKind = "flanking";
    if (needsFlanking && this.actor) {
      foundry.utils.setProperty(this.actor, "flags.midi.evaluated.advantage.attack.flanking", { value: true, effects: ["Flanking"] });
    }
    if (flankingMode === "advonly") {
      this.flankingAdvantage = needsFlanking;
    }
    return needsFlanking;
  }

  /**
   * Parts added to a single-target attack roll before it is rolled, labelled so the roll shows them: a fixed
   * flanking bonus and the target's granted attack bonus (flags.midi-qol.grants.attack.bonus). With several
   * targets the granted bonus is added per target when hits are checked, as one roll can't carry it for some only.
   * `modifiers` are the reasons the attack roll's display shows (attackRollModifiers on the roll's options).
   */
  attackRollParts(): { parts: string[], modifiers: AttackModifier[] } {
    const parts: string[] = [];
    const modifiers: AttackModifier[] = [];
    this.grantedAttackBonusInRollUuid = undefined;
    // rollBonuses' automatic preRoll bonuses (collectPreRollBonuses): parts of the formula, labelled
    for (const bonus of this.#preRollBonuses.attack ?? []) {
      if (bonus.effect.kind !== "add") continue;
      parts.push(`${bonus.effect.formula}[${bonus.label}]`);
      modifiers.push({ kind: "bonus", label: bonus.label, value: `+${bonus.effect.formula}` });
    }
    if (this.flankingAdvantageKind)
      modifiers.push({ kind: this.flankingAdvantageKind, label: i18n(this.flankingAdvantageKind === "flanked" ? "midi-qol.Flanked" : "midi-qol.Flanking"), advantage: true });
    if (this.targets.count !== 1) return { parts, modifiers };
    if (this.flankingRollBonus) {
      parts.push(`${this.flankingRollBonus.bonus}[${this.flankingRollBonus.label}]`);
      modifiers.push({ kind: this.flankingRollBonus.kind, label: this.flankingRollBonus.label, value: `+${this.flankingRollBonus.bonus}` });
    }
    const targetActor = this.targets.documents[0]?.actor;
    const granted = targetActor?.flags?.[MODULE_ID]?.grants?.attack?.bonus;
    if (!targetActor || !granted) return { parts, modifiers };
    const formulas = [granted.all, granted[this.activity?.actionType ?? ""]].filter(f => f !== undefined && f !== null && `${f}`.trim() !== "");
    if (!formulas.length) return { parts, modifiers };
    const grantsFlagKey = `flags.${MODULE_ID}.grants.attack.bonus`;
    const label = targetActor.allApplicableEffects()
      // @ts-expect-error fvtt-types v14 ActiveEffect
      .filter(e => !e.disabled && e.system.changes?.some(c => c.key.startsWith(grantsFlagKey)))
      .map(e => e.name)
      .toArray().join(", ") || targetActor.name;
    const rollData = targetActor.getRollData();
    for (const formula of formulas) {
      // Evaluated against the target's data, as the hit check did
      const resolved = Roll.replaceFormulaData(`${formula}`, rollData);
      const numeric = Number.isNumeric(resolved);
      parts.push(numeric ? `${Number(resolved)}[${label}]` : `(${resolved})[${label}]`);
      modifiers.push({ kind: "granted", label, value: numeric ? `${Number(resolved) >= 0 ? "+" : ""}${Number(resolved)}` : `+${resolved}` });
    }
    this.grantedAttackBonusInRollUuid = targetActor.uuid;
    return { parts, modifiers };
  }

  async checkTargetAdvantage() {
    // Note: Target grants flags and actor noAdvantage/noDisadvantage flags
    // are now handled by computeAttackAdvantage in checkAttackAdvantage()
    // This method only handles special rules that require game logic

    if (!this.item) return;
    if (!this.targets?.count) return;
    const actionType = this.activity.actionType ?? "";
    const firstTargetDocument = this.targets.documents[0];
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

  async triggerTargetMacros(triggerList: string[], targets: TokenDocumentSet | Set<TokenOrDocument> = this.targets, options: { saved?: boolean } = {}) {
    let results: Record<string, unknown[]> = {};
    // Every target, with a canvas token or not (targetMacroOptions)
    for (let target of targets instanceof TokenDocumentSet ? targets.documents : targets) {
      const uuid = getTokenDocument(target)?.uuid ?? "";
      results[uuid] = [];
      let result = results[uuid];
      const actorOnUseMacros = target.actor?.flags?.[MODULE_ID]?.onUseMacroParts ?? new OnUseMacros();
      const wasAttacked = !!this.activity.attack;
      const wasHit = (this.activity ? wasAttacked : true) && (this.hitTargets?.has(target) || this.hitTargetsEC?.has(target));
      const wasMissed = (this.activity ? wasAttacked : true) && !this.hitTargets?.has(target) && !this.hitTargetsEC?.has(target);
      if (this.targets.has(target) && triggerList.includes("isTargeted")) {
        if (triggerList.includes("isTargeted")) {
          result.push(...await this.callMacros(this.item,
            actorOnUseMacros?.getMacros("isTargeted"),
            "TargetOnUse",
            "isTargeted",
            targetMacroOptions(target))
          );
        }
      }
      if (wasAttacked && triggerList.includes("isPreAttacked")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isPreAttacked"),
          "TargetOnUse",
          "isPreAttacked",
          targetMacroOptions(target))
        );
      }

      if (wasAttacked && triggerList.includes("isAttacked")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isAttacked"),
          "TargetOnUse",
          "isAttacked",
          targetMacroOptions(target))
        );
      }
      if (triggerList.includes("postTargetEffectApplication")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("postTargetEffectApplication"),
          "TargetOnUse",
          "postTargetEffectApplication",
          targetMacroOptions(target))
        );
      }
      // 13.0.39 isDamaged Hook is always called inside processDamageRoll, so don't do it here
      // If auto applying damage can do a better test when damage application has been calculdated
      // if (wasDamaged && triggerList.includes("isDamaged") && !configSettings.autoApplyDamage.toLocaleLowerCase().includes("yes")) {
      //  result.push(...await this.callMacros(this.item,
      //    actorOnUseMacros?.getMacros("isDamaged"),
      //    "TargetOnUse",
      //    "isDamaged",
      //    targetMacroOptions(target))
      //  );
      // }
      if (wasHit && triggerList.includes("isHit")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isHit"),
          "TargetOnUse",
          "isHit",
          targetMacroOptions(target))
        );
      }
      if (wasMissed && triggerList.includes("isMissed")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isMissed"),
          "TargetOnUse",
          "isMissed",
          targetMacroOptions(target))
        );
      }
      if (triggerList.includes("preTargetDamageApplication")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("preTargetDamageApplication"),
          "TargetOnUse",
          "preTargetDamageApplication",
          targetMacroOptions(target))
        );
      }

      if (this.activityHasSave && triggerList.includes("preTargetSave")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("preTargetSave"),
          "TargetOnUse",
          "preTargetSave",
          targetMacroOptions(target))
        );
      }

      if (this.activityHasSave && triggerList.includes("isAboutToSave")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isAboutToSave"),
          "TargetOnUse",
          "isAboutToSave",
          targetMacroOptions(target))
        );
      }

      if (target.actor?.uuid !== this.actor.uuid && triggerList.includes("1Reaction")) {
      }
      if (this.activityHasSave && triggerList.includes("isSaveSuccess") && (this.saves.has(target) || options.saved === true)) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isSaveSuccess"),
          "TargetOnUse",
          "isSaveSuccess",
          targetMacroOptions(target))
        );
      }
      if (this.activityHasSave && triggerList.includes("isSaveFailure") && (!this.saves.has(target) || options.saved === false)) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isSaveFailure"),
          "TargetOnUse",
          "isSaveFailure",
          targetMacroOptions(target))
        );
      }
      if (this.activityHasSave && triggerList.includes("isSave")) {
        result.push(...await this.callMacros(this.item,
          actorOnUseMacros?.getMacros("isSave"),
          "TargetOnUse",
          "isSave",
          targetMacroOptions(target))
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
    if (this.id && await asyncHooksCall(`${hookName}.${this.id}`, this) === false) return false;
    const premadesHook = hookName.replace("midi-qol.", "midi-qol.premades.");
    if (await asyncHooksCall(premadesHook, this) === false) return false;
    if (this.item && await asyncHooksCall(`${premadesHook}.${this.item.uuid}`, this) === false) return false;
    if (this.activity && await asyncHooksCall(`${premadesHook}.${this.activity.uuid}`, this) === false) return false;
    if (this.id && await asyncHooksCall(`${premadesHook}.${this.id}`, this) === false) return false;
    return true;
  }

  async expireTargetEffects(expireList: string[]) {
    if (debugEnabled > 0) warn(`expireTargetEffects | ${expireList}`)
    // Every target, with a canvas token or not: a target on another scene or level still has its effects expired
    for (let target of this.targets.documents) {
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
          && (this.damageList.find(dl => dl.targetUuid === target.uuid && dl.hpDamage > 0));
        const wasHealed = this.damageList && (this.damageList.find(dl => dl.targetUuid === target.uuid && dl.hpDamage < 0))
        //TODO this is going to grab all the special damage types as well which is no good.
        if (wasAttacked && expireList.includes("isAttacked") && specialDuration.includes("isAttacked")) {
          wasExpired = true;
          expiryReason.push("isAttacked")
        }
        const actionType = this.activity?.actionType;
        if (wasAttacked && expireList.includes("isAttacked") && specialDuration.includes(`isAttacked:${actionType}`)) {
          wasExpired = true;
          expiryReason.push(`isAttacked:${actionType}`);
        }
        if (wasHit && this.isCritical && expireList.includes("isAttacked") && specialDuration.includes("isHitCritical")) {
          wasExpired = true;
          expiryReason.push("isHitCritical")
        }
        if (wasAttacked && !wasHit && expireList.includes("isAttacked") && specialDuration.includes("isMissed")) {
          wasExpired = true;
          expiryReason.push("isMissed")
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
        if (wasHit && expireList.includes("isHit") && specialDuration.includes(`isHit:${actionType}`)) {
          wasExpired = true;
          expiryReason.push(`isHit:${actionType}`);
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
        // the save or check of the workflow's save activity (which may be another activity than the one used)
        const saveDetails = this.saveActivityDetails;
        if (!saveDetails) return wasExpired;
        // only targets whose save was rolled (failedSaves starts as every hit target)
        const saveRoll = target.uuid ? this.targetSaveDetails?.[target.uuid]?.saveRoll : undefined;
        if (!saveRoll) return wasExpired;
        const saved = this.saves.has(target);
        const failed = !saved && this.failedSaves.has(target);
        // the ability the target chose, else the save's only one; with several and no choice recorded only the bare keys
        const offered: string[] = typeof saveDetails.ability === "string" ? [saveDetails.ability] : [...(saveDetails.ability ?? [])];
        const rollOptions = saveRoll.options;
        const chosen = rollOptions && "midiChosenId" in rollOptions && typeof rollOptions.midiChosenId === "string" ? rollOptions.midiChosenId : undefined;
        const abilities = chosen && offered.includes(chosen) ? [chosen] : offered.length === 1 ? offered : [];
        for (const suffix of ["", ...abilities.map(abl => `.${abl}`)]) {
          if (expireList.includes("isSaveSuccess") && saved && specialDuration.includes(`isSaveSuccess${suffix}`)) {
            wasExpired = true;
            expiryReason.push(`isSaveSuccess${suffix}`);
          }
          if (expireList.includes("isSaveFailure") && failed && specialDuration.includes(`isSaveFailure${suffix}`)) {
            wasExpired = true;
            expiryReason.push(`isSaveFailure${suffix}`);
          }
          if (expireList.includes("isSave") && specialDuration.includes(`isSave${suffix}`)) {
            wasExpired = true;
            expiryReason.push(`isSave${suffix}`);
          }
        }
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
    setDamageRollMinTerms(validRolls);
    await this.setBonusDamageRolls(validRolls);
    if (this.workflowOptions?.damageRollDSN !== false) await this.throwDamageDice(this.bonusDamageRolls!);
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
    let targetUuids: (string | null)[] = []
    let failedSaves: TokenDocument[] = [];
    let criticalSaves: TokenDocument[] = [];
    let criticalSaveUuids: (string | null)[] = [];
    let fumbleSaves: TokenDocument[] = [];
    let fumbleSaveUuids: (string | null)[] = [];
    let failedSaveUuids: (string | null)[] = [];
    let hitTargets: TokenDocument[] = [];
    let hitTargetsEC: TokenDocument[] = [];
    let hitTargetUuidsEC: (string | null)[] = [];
    let hitTargetUuids: (string | null)[] = [];
    let saves: TokenDocument[] = [];
    let saveUuids: (string | null)[] = [];
    let superSavers: TokenDocument[] = [];
    let superSaverUuids: (string | null)[] = [];
    let semiSuperSavers: TokenDocument[] = [];
    let semiSuperSaverUuids: (string | null)[] = [];
    // Every member, with a canvas token or not
    for (let target of this.targets.documents) {
      targets.push(target);
      targetUuids.push(target.uuid);
    }
    for (let save of this.saves.documents) {
      saves.push(save);
      saveUuids.push(save.uuid);
    }
    for (let hit of this.hitTargets.documents) {
      hitTargets.push(hit);
      hitTargetUuids.push(hit.uuid);
    }
    for (let hit of this.hitTargetsEC.documents) {
      hitTargetsEC.push(hit);
      hitTargetUuidsEC.push(hit.uuid);
    }

    for (let failed of this.failedSaves.documents) {
      failedSaves.push(failed);
      failedSaveUuids.push(failed.uuid);
    }
    for (let critical of this.criticalSaves.documents) {
      criticalSaves.push(critical);
      criticalSaveUuids.push(critical.uuid);
    }
    for (let fumble of this.fumbleSaves.documents) {
      fumbleSaves.push(fumble);
      fumbleSaveUuids.push(fumble.uuid);
    }
    for (let save of this.superSavers.documents) {
      superSavers.push(save);
      superSaverUuids.push(save.uuid);
    };
    for (let save of this.semiSuperSavers.documents) {
      semiSuperSavers.push(save);
      semiSuperSaverUuids.push(save.uuid);
    };
    const itemData = (item?.toObject(false) ?? {}) as Item.Source & { uuid?: string | null };
    itemData.uuid = item?.uuid; // provide the uuid so the actual item can be recovered
    // Macros reading itemData.actionType get the action type of the activity being used.
    const activity = this.activity;
    //@ts-expect-error no dnd5e-types
    Object.defineProperty(itemData, "actionType", { get() { return (activity ?? item?.system.activities?.contents[0])?.actionType } });
    return {
      actor: this.actor,
      actorData: this.actor.toObject(false),
      actorUuid: this.actor.uuid,
      advantage: this.advantage,
      attackD20: this.diceRoll,
      attackRoll: this.attackRoll,
      attackTotal: this.attackTotal,
      bonusDamageDetail: this.rawBonusDamageDetail,
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
        `return await ${func}({ speaker, actor, token, tokenDocument, character, item, rolledItem, macroItem, args, scope, options, workflow })`,
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
      const itemData = DAE.getActorItemData(actorToUse, uuid) as Item.InitializedData | undefined;
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
    const token = tokenForActor(actorToUse);
    const targetOptions: { token?: Token.Implementation | null; tokenDocument?: TokenDocument.Implementation } = options;
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
      // A target macro's are the target's (targetMacroOptions): no Token for a target with no canvas token
      token: targetOptions.tokenDocument ? targetOptions.token ?? undefined : token,
      tokenDocument: targetOptions.tokenDocument ?? token?.document ?? (actorToUse === this.actor ? this.tokenDocument : undefined),
      midiData: workflowContext
    };
    if (targetOptions.tokenDocument && !targetOptions.token) {
      // Foundry gives a macro with no token the canvas token with the speaker's token id, which another scene's token
      // can share (a copied scene)
      const speaker = speakerFor({ actor: actorToUse, token: targetOptions.tokenDocument });
      if (speaker.token && canvas?.tokens?.get(speaker.token)) speaker.token = null;
      scope.speaker = speaker;
    }

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
      return await this.performThrottledUpdate(chatMessage!,
        { "system.midi.progress": { effectsApplied: true } } as ChatMessage.UpdateData);
  }
  async displayUtilityRolls() {
    const chatMessage = this.chatCard;
    let section: MidiCardSection | undefined;
    if (chatMessage) { // display the utility roll
      // Display roll name if available, otherwise default to utility activity type title
      const rollString = this.activity?.roll?.name || i18n("DND5E.UTILITY.Title");
      section = { label: rollString, rollType: "utility" };
      if (debugEnabled > 0) warn("displayUtilityRoll |", this.utilityRoll)
    }
    this.#persistRolls();
    await this.performThrottledUpdate(chatMessage, this.#sectionUpdate("utility", section, {}));
  }

  // `_displayOptions.GMOnlyAttackRoll` is no longer used: the card's hit result is worked out from its records
  async displayAttackRoll(_displayOptions: { GMOnlyAttackRoll?: boolean } = {}) {
    // @ts-expect-error CONFIG.Dice.D20Roll not typed
    const ADV_MODE: { DISADVANTAGE: number, NORMAL: number, ADVANTAGE: number } = CONFIG.Dice.D20Roll.ADV_MODE;
    const chatMessage = this.chatCard;
    let section: MidiCardSection | undefined;
    if (chatMessage) { // display the attack roll
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

      // Named, not stored: the attack roll is already in `message.rolls`, and so are its attributions,
      // so the card renders both from there rather than carrying a second copy.
      section = { label: attackString, rollType: "attack" };

      // Success/failure/critical/fumble classes are applied at render time
      // by ChatMessageMidi._applyAttackRollHighlight, not baked into content.
      if (debugEnabled > 0) warn("displayAttackRoll |", this.attackRoll)
    }
    // The damage button is already showing, so it takes its label with the roll that decides a critical.
    this.#persistRolls();
    await this.performThrottledUpdate(chatMessage, this.#sectionUpdate("attack", section,
      { "system.midi.dmgBtnText": this.#damageButtonText() }));
  }

  #damageButtonText(): string {
    let text = (this.rollOptions.isCritical || this.isCritical) ? i18n("DND5E.Critical")
      : i18n(this.activity.actionType === "heal" ? HEALING_BUTTON_KEY : "DND5E.Damage");
    if (this.rollOptions.fastForwardDamage && configSettings.showFastForward) text += ` ${i18n("midi-qol.fastForward")}`;
    return text;
  }

  /** The card update for one display method's section, with `extras` */
  #sectionUpdate(
    name: SectionName,
    section: MidiCardSection | undefined,
    extras: Record<string, unknown> = {}
  ): ChatMessage.UpdateData {
    return this.#sectionsUpdate(section ? { [name]: section } : {}, extras);
  }

  /** The saves section's own data: its rows are drawn from the records and the save rolls (UsageCardMessage) */
  #saveSectionData(templateData: Record<string, any>): Record<string, unknown> {
    const { saves, ...data } = templateData;
    return { ...data, dc: this.saveActivity?.save?.dc.value ?? this.saveActivity?.check?.dc.value ?? null };
  }

  /** As `#sectionUpdate`, for a display method that fills more than one slot in a single update. */
  #sectionsUpdate(
    sections: Partial<Record<SectionName, MidiCardSection>>,
    extras: Record<string, unknown> = {}
  ): ChatMessage.UpdateData {
    const updates: Record<string, unknown> = { ...extras };
    for (const [name, section] of Object.entries(sections)) updates[`system.midi.sections.${name}`] = this.#storedSection(name, section);
    return this.#withRollMessageFlags(updates) as ChatMessage.UpdateData;
  }

  /**
   * A section as its own card stores it: a roll section's label and a section's usual template are worked out when it is
   * drawn (UsageCardMessage). A card it doesn't own (a damage-only workflow's) keeps them.
   */
  #storedSection(name: string, section: MidiCardSection | undefined): MidiCardSection | undefined {
    if (!section || !this.ownsCard) return section;
    const { label, template, ...rest } = section;
    const stored: MidiCardSection = rest;
    if (template && template !== SECTION_TEMPLATES[name]) stored.template = template;
    if (!section.rollType && label) stored.label = label;
    // An empty section is not stored at all: the hits section (rows from the records) is kept by its empty label
    const data = (stored as { data?: object }).data;
    if (!Object.keys(stored).some(key => key !== "data" || (data && !foundry.utils.isEmpty(data)))) stored.label = label ?? "";
    return stored;
  }

  async displayDamageRolls() {
    const chatMessage = this.chatCard;
    if (!chatMessage) {
      const message = `midi-qol | displayDamageRolls | no chat message to display damage rolls`;
      console.warn(message);
      TroubleShooter.recordError(new Error(message), message);
      return;
    }
    const sections: Partial<Record<SectionName, MidiCardSection>> = {};
    if (this.damageRolls?.length) {
      sections.damage = { label: this.damageFlavor ?? "", rollType: "defaultDamage" };
      if (this.otherDamageRolls?.length) sections.otherDamage = { label: this.otherDamageFlavor ?? "", rollType: "otherDamage" };
    } else if (this.otherDamageRolls?.length) {
      sections[this.useOther ? "otherDamage" : "damage"] = { label: this.otherDamageFlavor ?? "", rollType: "otherDamage" };
    }
    if (this.bonusDamageRolls) sections.bonusDamage = { label: this.bonusDamageFlavor ?? "", rollType: "bonusDamage" };

    if (!this.ownsCard) {
      // Another card (a damage-only workflow's macro gave it): its rolls stay and these are added. Its targets, counts and
      // flags are its own workflow's.
      const ownRoll = (roll: Roll) => foundry.utils.getProperty(roll, `options.${MODULE_ID}.addedBy`) === this.id;
      const existing = (chatMessage.rolls as Roll[]).filter(roll => !ownRoll(roll));
      const added = this.chatRolls.map(roll => { foundry.utils.setProperty(roll, `options.${MODULE_ID}.addedBy`, this.id); return roll; });
      return await this.performThrottledUpdate(chatMessage, this.#sectionsUpdate(sections, { rolls: [...existing, ...added] }));
    }

    this.#persistRolls();
    return await this.performThrottledUpdate(chatMessage,
      this.#sectionsUpdate(sections, {
        // Refreshed as well as at displayHits: reactions resolve in between (Uncanny Dodge after the hit)
        ...this.#targetsUpdate()
      }));
  }

  /** Attack per target: one target's hit or miss, from its own use, on this use's card */
  async addSplitAttackResult(split: Workflow) {
    this.hitDisplayData = { ...(this.hitDisplayData ?? {}), ...(split.hitDisplayData ?? {}) };
    this.hitTargets = this.hitTargets.union(split.hitTargets);
    this.hitTargetsEC = this.hitTargetsEC.union(split.hitTargetsEC);
    if (configSettings.autoCheckHit !== "none") await this.displayHits(this.whisperAttackCard);
  }

  async displayHitTargets(whisper = false) {
    this.hitDisplayData = {};
    this.needsHitTargetsDisplayed = false;
    // @ts-expect-error no dnd5e-types
    if (this.item.type === "feat" && ["ench", "class", undefined].includes(this.activity.actionType)) return;
    for (let target of this.targets.documents) {
      if (!target?.uuid) continue;
      const img = await tokenPortrait(target);
      const tokenUuid = target.uuid;
      // @ts-expect-error no dnd5e-types
      const baseAc = target.actor?.system?.attributes?.ac?.value ?? 10;
      this.hitDisplayData[tokenUuid] = {
        targetClass: (target.actor as Actor)?.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-npc-target",
        target: target,
        hitClass: "",
        acClass: (target.actor as Actor)?.hasPlayerOwner ? "" : "midi-qol-npc-ac",
        img,
        gmName: getTokenName(target),
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
    const chatMessage = this.chatCard;

    if (chatMessage) {
      // The data, not the markup: a list (uuid keys have dots, which the update would split), the Token reduced to its id,
      // and nothing per viewer (oneCard, collapsibleTargets, isGM are added when drawn)
      const entries = Object.entries(this.hitDisplayData ?? {});
      // Its own card draws the rows from the records (UsageCardMessage); another's stores them
      if (this.ownsCard) this.#persisted.setHitRows(entries.map(([, hit]: [string, any]) => [getTokenDocument(hit?.target), {
        hitClass: hit?.hitClass ?? "", hitSymbol: hit?.hitSymbol || null, hitShowAC: hit?.showAC || null,
        acDisplay: hit?.acDisplay || null, acTooltip: hit?.acTooltip || null, acIcons: hit?.acIcons?.length ? hit.acIcons : null
      }] as [TokenDocument.Implementation | undefined, RecordFacts]).filter((e): e is [TokenDocument.Implementation, RecordFacts] => !!e[0]));
      const hits = this.ownsCard ? undefined : entries.map(([actorUuid, hit]: [string, any]) =>
        ({ ...hit, actorUuid, target: { id: hit?.target?.id ?? hit?.target?.document?.id ?? "" } }));
      const section = {
        label: "",
        template: SECTION_TEMPLATES.hits,
        // hits.html shows only the rows: the attack's name and total are the card's own
        data: hits ? { hits } : {}
      };
      await this.performThrottledUpdate(chatMessage, this.#sectionUpdate("hits", section, this.#targetsUpdate()));
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
    if (this.otherSaveActivity && (this.otherSaveActivity.damage?.parts.length ?? 0) > 0) {
      switch (getSaveMultiplierForActivity(this.otherSaveActivity)) {
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
    for (const target of this.targets.documents) {
      const targetDocument = target;
      const img = await tokenPortrait(targetDocument);

      let isPlayerOwned = !!target.actor?.hasPlayerOwner;
      this.saveDisplayData.push({
        gmName: getTokenName(target),
        img,
        targetClass: isPlayerOwned ? "midi-qol-player-target" : "midi-qol-npc-target",
        target: hookTarget(target),
        saveSymbol: "",
        saveTotalClass: "",
        rollTotal: "",
        rollDetail: "",
        rollHTML: "",
        id: target.id ?? "",
        adv: undefined,
        saveClass: ""
      });
    }
    let { fullDamageText, halfDamageText, noDamageText } = this.computeSaveFlavors();
    let templateData = {
      fullDamageText,
      halfDamageText,
      noDamageText,
      saveDisplayFlavor: await this.computeSaveDisplayFlavor(rollDC, rollType, { rollAbilities, rollSkills, rollTools }),
      saves: this.saveDisplayData,
      // TODO force roll damage
    }
    const chatMessage = this.chatCard;

    const section = { label: "", template: SECTION_TEMPLATES.saves,
      data: this.#saveSectionData(templateData) };
    await this.performThrottledUpdate(chatMessage,
      this.#sectionUpdate("saves", section));
  }
  async displaySaves(_whisper: boolean = false) {
    let { fullDamageText, halfDamageText, noDamageText } = this.computeSaveFlavors();
    let templateData = {
      fullDamageText,
      halfDamageText,
      noDamageText,
      saveDisplayFlavor: this.saveDisplayFlavor,
      saves: this.saveDisplayData,
      // TODO force roll damage
    }
    let chatMessage = this.chatCard; // XXX await asyncGetCachedDocument(this.itemCardUuid);
    if (chatMessage) {
      templateData.saveDisplayFlavor = this.saveDisplayFlavor;
      if (this.workflowType !== "DamageOnlyWorkflow") {
        const section = { label: "", template: SECTION_TEMPLATES.saves,
          data: this.#saveSectionData(templateData) };
        this.#persistRolls();
        await this.performThrottledUpdate(chatMessage, this.#sectionUpdate("saves", section, this.#targetsUpdate()));
      }
    }
  }

  /**
   * The workflow's targets as dnd5e records them (`system.targets`, TargetsField's own descriptors): dnd5e takes them from
   * the user's targets when the card is created, and midi settles its targets later (templates, confirmation).
   */
  #targetsUpdate(): Record<string, unknown> {
    const TargetsField = globalThis.dnd5e?.dataModels?.chatMessage?.fields?.TargetsField;
    if (!TargetsField?.getDescriptors) return {};
    const tokens = this.targets.documents;
    if (!tokens.length) return {};
    // midi's detail for the damage tray goes in the card's state and records (cardTargetDetail), or on the descriptors of
    // a card the workflow does not own (a damage-only workflow's)
    // Wrapped as dnd5e reads a Token (`target.document`): a TokenDocument's own `document` is midi's deprecated alias
    const descriptors = TargetsField.getDescriptors(tokens.map(document => ({ document }))) as Record<string, unknown>[];
    const details = this.buildMidiTargetDescriptors(tokens);
    if (!this.ownsCard) {
      const byToken = new Map(details.map(d => [d.token, d]));
      for (const descriptor of descriptors) {
        const detail = byToken.get(descriptor.token as string);
        if (!detail) continue;
        const { saved, superSaver, semiSuperSaver, saveMults, uncannyDodge, uncannyDodgeIcon } = detail;
        Object.assign(descriptor, { saved, superSaver, semiSuperSaver, saveMults, uncannyDodge, uncannyDodgeIcon });
      }
      return { "system.targets": descriptors };
    }
    // Only a save, or Evasion on a failed one, uses them
    if (details[0]?.saveMults && details.some(d => d.saved || d.superSaver || d.semiSuperSaver)) this.#persisted.setScalar("saveMults", details[0].saveMults);
    for (const detail of details) {
      const document = fromUuidSync(detail.token) as TokenDocument.Implementation | null;
      if (document) this.#persisted.setRecordFacts(document, { uncannyDodge: detail.uncannyDodge || undefined, uncannyDodgeIcon: detail.uncannyDodgeIcon || undefined });
    }
    return { "system.targets": descriptors };
  }

  /**
   * Each target's descriptor with midi's detail for the damage tray (save results and multipliers, uncanny dodge), which
   * DamageApplicationElementMidi.getTargetOptions reads back into `options.midi` (#targetsUpdate stores it)
   */
  buildMidiTargetDescriptors(targets: TokenDocument.Implementation[]): CombinedTargetDescriptor[] {
    const saves = new Set(this.saves.uuids);
    const semiSuperSavers = new Set(this.semiSuperSavers.uuids);
    const superSavers = new Set(this.superSavers.uuids);
    const existing = this.targetDescriptors;
    const saveMults = this.damageSaveMultipliers();
    return targets.map(t => {
      // What the damage calculation used, if it has run; the live flag is transient for reactions.
      const applied = t.uuid ? this.midiTargetDetail?.[t.uuid] : undefined;
      const uncannyDodge = applied
        ? !!applied.uncannyDodge
        : !!(t.actor?.flags?.[MODULE_ID]?.["uncanny-dodge"] && this.activity?.attack);
      const uncannyDodgeIcon = applied?.uncannyDodgeIcon as string | undefined;
      // The card's entry keeps what was recorded at roll time; midi's own detail is always recomputed.
      const recorded = getTargetDescriptor(t.actor?.uuid ?? "", existing);
      return {
        name: t.name,
        img: t.actor?.img as string,
        actor: t.actor?.uuid ?? "",
        token: t.uuid,
        //@ts-expect-error no dnd5e-types
        ac: recorded ? recorded.ac : (hasCoverTotal(t.actor) ? null : t?.actor?.system.attributes.ac.value as number),
        saved: !!t.uuid && saves.has(t.uuid),
        semiSuperSaver: !!t.uuid && semiSuperSavers.has(t.uuid),
        superSaver: !!t.uuid && superSavers.has(t.uuid),
        saveMults,
        uncannyDodge,
        uncannyDodgeIcon
      } as CombinedTargetDescriptor;
    });
  }

  get chatRolls(): Roll[] {
    let messageRolls: Roll[] = [];
    if (this.attackRoll) messageRolls.push(this.attackRoll);
    if (this.utilityRoll) messageRolls.push(this.utilityRoll);
    // Damage a damage message holds is the message's (M13 stage 3): the card keeps only damage not in one yet
    const held = this.#damageKeysInMessages();
    if (this.damageRolls && !held.has("activity")) messageRolls.push(...this.damageRolls);
    if (this.bonusDamageRolls) messageRolls.push(...this.bonusDamageRolls.filter(roll => {
      const contribution = foundry.utils.getProperty(roll, `options.${MODULE_ID}.contribution.key`);
      return !held.has(typeof contribution === "string" ? contribution : "bonus");
    }));
    if (this.otherDamageRolls && !held.has("other")) messageRolls.push(...this.otherDamageRolls);
    /*
     * Saves go last so `rolls[0]` keeps meaning what it did to anything still indexing it. Only those the card's own
     * save and check messages don't hold: another module's, or one midi changed.
     */
    const saves = Object.values(this.tokenSaves ?? {});
    if (saves.length) {
      const card = this.itemCardUuid ? fromUuidSync(this.itemCardUuid) as Dnd5eChatMessage | null : null;
      const linked = [...(card?.getAssociatedRolls?.("save") ?? []), ...(card?.getAssociatedRolls?.("check") ?? [])];
      for (const roll of saves) if (this.#keepsSaveRoll(roll, linked)) messageRolls.push(roll);
    }
    return messageRolls;
  }

  /**
   * A save roll goes on the card unless the card's linked save or check message for its token has it (dnd5e's own
   * save rolls, midi's or from the card's buttons). Other modules' are kept: their messages may not last.
   */
  #keepsSaveRoll(roll: Roll, linked: ChatMessage.Implementation[]): boolean {
    if (foundry.utils.getProperty(roll, `options.${MODULE_ID}.external`)) return true;
    const tokenId = String(foundry.utils.getProperty(roll, `options.${MODULE_ID}.targetUuid`) ?? "").split(".").pop();
    return !linked.some(message => message.speaker?.token === tokenId && message.rolls?.[0]?.total === roll.total);
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
  protected async getTargetPortraitImage(target: TokenOrDocument): Promise<string> {
    const document = getTokenDocument(target);
    return document ? tokenPortrait(document) : target.actor?.img ?? "";
  }

  /**
   * Sculpt Spells and Careful Spell (2024): an area use's creatures targeted before casting are the caster's choice.
   * They succeed on the save and take no damage where a save halves it.
   */
  protected checkSculptOrCarefulSpells(target: TokenOrDocument): boolean {
    if (!(this.rangeTargeting || this.tempTargetConfirmation) || !this.preSelectedTargets.has(target)) return false;
    const conditionData = createConditionData({ workflow: this, target });
    // @ts-expect-error no dnd5e-types - accessing .school property
    const sculpted = this.activity.item?.system.school === "evo" && evalAllConditions(this.actor, `flags.${MODULE_ID}.sculptSpells`, conditionData);
    // @ts-expect-error no dnd5e-types
    const isSpell = this.item.type === "spell";
    const careful = !sculpted && isSpell && this.#carefulTargets().has(target)
      && evalAllConditions(this.actor, `flags.${MODULE_ID}.carefulSpells`, conditionData);
    if (!sculpted && !careful) return false;
    this.superSavers = this.superSavers.add(target);
    return true;
  }

  #carefulProtected: TokenDocumentSet | undefined;
  /** Careful Spell's creatures: the first pre-selected targets, up to the caster's Charisma modifier (minimum 1) */
  #carefulTargets(): TokenDocumentSet {
    if (this.#carefulProtected) return this.#carefulProtected;
    const chosen = this.preSelectedTargets.documents.filter(document => this.targets.has(document));
    // @ts-expect-error no dnd5e-types
    const max = Math.max(1, Number(this.actor.system.abilities?.cha?.mod) || 0);
    this.#carefulProtected = new TokenDocumentSet(chosen.slice(0, max));
    if (chosen.length > max && evalAllConditions(this.actor, `flags.${MODULE_ID}.carefulSpells`, createConditionData({ workflow: this })))
      ui.notifications?.warn(i18nFormat("midi-qol.CarefulSpellTooMany", { max, names: this.#carefulProtected.documents.map(token => getTokenName(token)).join(", ") }));
    return this.#carefulProtected;
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
    target: TokenOrDocument,
    saveRoll: Roll,
    resultDC: number,
    isCritical: boolean,
    isFumble: boolean
  ): Promise<{ saveRoll: Roll, saveRollTotal: number, saved: boolean } | null> {
    if (!this.item.flags?.[MODULE_ID]?.isConcentrationCheck) return null;

    // Only reached when set on the actor directly; effects are mapped by DAE. Remove in 14.6.10.
    const checkBonus = target.actor?.flags?.[MODULE_ID]?.concentrationSaveBonus;
    if (!checkBonus) return null;
    foundry.utils.logCompatibilityWarning(
      "midi-qol | flags.midi-qol.concentrationSaveBonus is deprecated; use system.attributes.concentration.roll.bonus. Setting it on an actor directly stops working in 14.6.10.",
      { once: true });

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
    target: TokenOrDocument,
    saveRoll: Roll,
    saved: boolean,
    rollDC: number | undefined,
    coverSaveBonus: number = 0,
  ): Promise<void> {
    const saveRollTotal = coverSaveBonus >= TOTAL_COVER ? Infinity : (saveRoll.total ?? 0);

    const img = await this.getTargetPortraitImage(target);
    const isPlayerOwned = target.actor?.hasPlayerOwner ?? false;

    let rollHTML = await renderSaveRollHTML(saveRoll);
    //@ts-expect-error midiChosenId is a custom roll option
    const midiChosenId: string | undefined = saveRoll.options?.midiChosenId;
    const targetDocUuid = getTokenDocument(target)?.uuid ?? "none";

    // Tagged so the roll can be found on the card: `rollType` the way every other midi roll is
    // tagged, and the target uuid because saves are per-target and the card has no other way back.
    foundry.utils.setProperty(saveRoll, `options.${MODULE_ID}.rollType`, "save");
    foundry.utils.setProperty(saveRoll, `options.${MODULE_ID}.targetUuid`, targetDocUuid);

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
    // Keys held when the creature's own roll was asked for change it after the tracker was built: name them.
    if (saveDetails?.heldModifiers) advMode?.reconcileWithRoll(saveRoll?.options?.advantageMode, false);
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
    const targetDocument = getTokenDocument(target);
    if (targetDocument) this.#persisted.setRecordFacts(targetDocument, {
      saveTotal: isFinite(saveRollTotal) ? saveRollTotal : null,
      saveCover: totalSaveCover >= TOTAL_COVER ? "total" : totalSaveCover >= THREE_QUARTERS_COVER ? "threeQuarters" : totalSaveCover >= HALF_COVER ? "half" : undefined,
      saveCoverAuto: coverSaveBonus >= TOTAL_COVER || undefined,
      saveMode: mode || null,
      saveAttribution: advMode?.attribution && !foundry.utils.isEmpty(advMode.attribution) ? attributionTriples(advMode.attribution) : undefined
    });

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
      img,
      targetClass: isPlayerOwned ? "midi-qol-player-target" : "midi-qol-npc-target",
      target: hookTarget(target),
      saveSymbol: (rollDC === null) ? "" : (
        ((target.actor as Actor).hasPlayerOwner ? "" : "midi-qol-npc-save-symbol")
        + " midi-qol-save-symbol "
        + (saved ? "fa-check" : "fa-xmark")),
      saveTotalClass: target.actor?.hasPlayerOwner ? "" : "midi-qol-npc-save-total",
      saveToolTipClass: target.actor?.hasPlayerOwner ? "" : "midi-qol-npc-save-tooltip",
      rollTotal: isFinite(saveRollTotal) ? String(saveRollTotal) : "∞",
      rollDetail: "",
      rollHTML,
      id: target.id ?? "",
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
    target: TokenOrDocument,
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
    target: TokenOrDocument,
    template: foundry.canvas.placeables.MeasuredTemplate.Implementation | undefined | null,
    rollAbility: string | undefined | null,
    templateCoverOrigin?: { x: number, y: number, elevation?: number }
  ): Promise<number> {
    if (!this.item || !this.activityHasSave || rollAbility !== "dex") {
      return 0;
    }

    const targetActor = target.actor;
    //@ts-expect-error no dnd5e-types
    let statusCoverBonus: number = targetActor?.system?.attributes?.ac?.cover ?? 0;
    if (hasCoverTotal(targetActor)) statusCoverBonus = TOTAL_COVER;

    // Get the raw module-computed cover bonus
    let moduleCoverBonus = 0;

    // Determine the cover origin point: explicit coverOrigin > templateCoverOrigin > template placeable > caster token
    let position: { x: number, y: number } | undefined;
    let originElevation: number = this.token ? tokenSourceElevation(this.token) : 0;

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
      // From a point (coverOrigin, the template's origin): the cover provider measures from it, the caster making it
      moduleCoverBonus = computeCoverBonus(this.token, target, this.activity, { origin: { x: position.x, y: position.y, elevation: originElevation } });
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
    // The value the die counts as, except under midi's auto-success/fail, which force the result without a natural
    // crit/fumble: the face decides, and an auto-fail is never critical nor an auto-success a fumble (as for attacks).
    // @ts-expect-error midiAutoResult is a custom roll option
    const autoResult: "fail" | "success" | undefined = saveRoll.options?.midiAutoResult;
    const diceRoll = activeDiceTotal(dterm, !autoResult) ?? fallbackTotal;
    // dnd5e's D20Die holds the thresholds; another die (e.g. Custom D&D 5e's 3d6) brings its own.
    //@ts-expect-error no dnd5e-types
    const isFumble = autoResult !== "success" && diceRoll <= (dterm.options?.criticalFailure ?? dterm.options?.fumble ?? 1);
    //@ts-expect-error no dnd5e-types
    const isCritical = autoResult !== "fail" && diceRoll >= (dterm.options?.criticalSuccess ?? dterm.options?.critical ?? 20);
    return { isCritical, isFumble };
  }

  /**
   * Updates the advantageSaves and disadvantageSaves sets based on the roll result
   * @param target The target token
   * @param result The roll result array
   */
  protected updateAdvantageTrackingFromRoll(target: TokenOrDocument, result: Roll[]): void {
    const advantageMode = result[0]?.options?.advantageMode;
    if (advantageMode !== undefined) {
      // Standard dnd5e roll with advantageMode
      if (advantageMode === 1) this.advantageSaves.add(target);
      else this.advantageSaves.delete(target);
      if (advantageMode === -1) this.disadvantageSaves.add(target);
      else this.disadvantageSaves.delete(target);
    } else {
      // Fallback for custom rolls (e.g., Better Rolls) that set terms[0].options
      // @ts-expect-error no dnd5e-types
      if (result[0]?.terms?.[0]?.options?.advantage) this.advantageSaves.add(target);
      else this.advantageSaves.delete(target);
      // @ts-expect-error no dnd5e-types
      if (result[0]?.terms?.[0]?.options?.disadvantage) this.disadvantageSaves.add(target);
      else this.disadvantageSaves.delete(target);
    }
    // If both advantage and disadvantage, they cancel out
    if (this.advantageSaves.has(target) && this.disadvantageSaves.has(target)) {
      this.advantageSaves.delete(target);
      this.disadvantageSaves.delete(target);
    }
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
  buildMonksTokenBarRequest(target: TokenOrDocument, saveDetails: AnyMutableObject): MonksTokenBarRequest {
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
  buildFlashRollsRequest(target: TokenOrDocument, saveDetails: AnyMutableObject): FlashRollsRequest {
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
  buildEpicRollsRequest(target: TokenOrDocument, saveDetails: AnyMutableObject): EpicRollsRequest {
    return {
      actorUuid: (target.actor as Actor).uuid ?? "",
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

    const showdc = challengeVisibleToPlayers(this.actor);

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

    // A tool or skill check also lists the ability it is rolled with; its key is the tool or skill (https://gitlab.com/tposney/midi-qol/-/issues/1575).
    const flashRollKey = rollType === "skill" ? rollSkills?.[0]
      : rollType === "tool" ? rollTools?.[0]
        : rollAbilities?.[0];
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
      // Links the save messages to the card, as dnd5e's own save buttons do.
      originMessageId: this.itemCardId,
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
        showDC: challengeVisibleToPlayers(this.actor),
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
      canceled: boolean;
      results: {
        actor: Actor.Implementation;
        roll: unknown;
      }[];
    }) => {
      // A cancelled request, or an actor with no roll, counts as a failed save rather than leaving the save waiting.
      const failed = () => new BasicRoll("-1").evaluateSync({ strict: false });
      if (!rerResult.canceled) {
        for (const rerRoll of rerResult.results) {
          // An actor's roll answers one of its tokens' saves (two tokens of one linked actor each get one)
          const [key] = this.pendingSaves.keysForActor(rerRoll.actor?.uuid);
          if (!key || !rerRoll.roll) continue;
          this.pendingSaves.answer(key, Roll.fromJSON(JSON.stringify(rerRoll.roll)));
        }
      }
      for (const uuid of rerRequest.actors)
        for (const key of this.pendingSaves.keysForActor(uuid)) this.pendingSaves.answer(key, failed());
    });
  }

  /**
   * Create a player chat save request with timeout handling
   */
  createPlayerChatSaveRequest(
    target: TokenOrDocument,
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

    const saveDisplay = saveDisplayMode();
    const { key: requestId, promise } = this.pendingSaves.wait(target, { rollType, abilities: rollAbilities, skills: rollSkills, tools: rollTools });
    {
      // Set a timeout for taking over the roll
      if (configSettings.playerSaveTimeout > 0) {
        this.pendingSaves.setTimeout(requestId, setTimeout(async () => {
          // Taken: a late roll by the player doesn't answer it meanwhile
          const resolve = this.pendingSaves.take(requestId);
          if (resolve) {
            let result: Roll[] | null;

            // The DC goes on the roll so dnd5e can tell success from failure; who sees it is decided when the card is shown.
            const showTargetDC = true;
            // A player's client rolls only its own creatures: another player's save is made by a GM, as the player's
            // roll would have been (its mode, its whispers); with no GM connected, here without prompts.
            const owned = !!target.actor?.isOwner;
            if (!game.user?.isGM && (saveDisplay === "allShow" || !owned) && preferredActiveGM()) {
              result = await timedAwaitExecuteAsGM("rollAbility", {
                saveDetails,
                displayOptions: {
                  fastForward: true,
                  chatMessage: showRoll,
                  rollMode: this.playerSaveMessageMode(),
                  showTargetDC,
                  forUserId: player.id
                }
              });
              // The GM's roll answers it (it used to be dropped, leaving the save waiting)
              resolve(result);
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
                  saveActivityUuid: this.saveActivity?.uuid,
                  isConcentrationCheck: saveDetails.isConcentrationCheck,
                  workflowOptions: saveDetails.workflowOptions,
                  // Another player's creature, rolled here because no GM is connected: nobody here may answer its prompts
                  unattended: !owned,
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
        }, (configSettings.playerSaveTimeout || 1) * 1000));
      }
    }

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

  /** A save's message mode with no player rolling it: the activity's own, else by the save display */
  defaultSaveMessageMode(): string {
    if ((this.activity.midiProperties?.rollMode ?? "default") !== "default") return toMessageMode(this.activity.midiProperties!.rollMode);
    return ["whisper", "gmOnly"].includes(saveDisplayMode()) ? "gm" : "public";
  }

  /** The message mode of a player's own save roll: the activity's own, else by Player roll saves */
  playerSaveMessageMode(): string {
    if ((this.activity.midiProperties?.rollMode ?? "default") !== "default") return this.defaultSaveMessageMode();
    switch (configSettings.playerRollSaves) {
      case "noneDialogPublic":
      case "nonePublic": return "public";
      case "noneDialogPrivate":
      case "none": return "gm";
      case "noneDialogSelf": return "self";
      case "noneDialogBlind": return "blind";
      default: return this.defaultSaveMessageMode();
    }
  }

  /**
   * Create a standard socketlib save roll
   */
  createStandardSaveRoll(
    target: TokenOrDocument,
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

    let rollMode = owner?.isGM ? this.defaultSaveMessageMode() : this.playerSaveMessageMode();

    // An NPC's save message is kept to the GM when players don't see this card's challenge, as its row in midi's saves
    // section isn't shown to them. Respect an explicit activity rollMode.
    if ((this.activity.midiProperties?.rollMode ?? "default") === "default"
      && !target.actor?.hasPlayerOwner
      && !challengeVisibleToPlayers(this.actor)
      && ["public", "ic"].includes(rollMode)) {
      rollMode = "gm";
    }

    // The DC goes on the roll so dnd5e can tell success from failure; who sees it is decided when the card is shown.
    const showTargetDC = true;
    const data = { saveDetails, displayOptions: { fastForward: simulate || !showRollDialog, chatMessage: showRoll, rollMode, showTargetDC } };
    if (!owner || owner.isSelf) return rollAbility(data) as Promise<Roll[] | Roll | null>;
    // Another client (a GM's): through the request core (M5b), with its deadline. On time-out, disconnect or error midi
    // rolls it here without prompts, so one GM leaving no longer fails every target's save.
    const what = [...rollAbilities, ...(saveDetails.rollSkills ?? []), ...(saveDetails.rollTools ?? [])].map(key => String(key).toUpperCase()).join("/");
    return askUser<Roll[] | Roll | null>(owner, {
      owner: this,
      type: SAVE_REQUEST,
      data,
      kind: rollType === "save" ? "save" : "check",
      actorUuid: target.actor?.uuid ?? undefined,
      tokenUuid: getTokenDocument(target)?.uuid ?? undefined,
      label: i18nFormat("midi-qol.PlayerWaits.SaveLabel", {
        what, type: i18n(rollType === "save" ? "DND5E.SavingThrow" : "DND5E.AbilityCheck"), item: this.item?.name ?? ""
      }),
      timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000,
      fallback: async () => await rollAbility({ ...data, displayOptions: { ...data.displayOptions, fastForward: true, unattended: !target.actor?.isOwner } }) as Roll[] | Roll | null
    }).settled.then(settled => settled.value, async err => {
      TroubleShooter.recordError(err, `${this.workflowName} | save for ${target.name} could not be made`);
      //@ts-expect-error CONFIG.Dice.BasicRoll: no dnd5e-types
      return [await new CONFIG.Dice.BasicRoll("-1").evaluate()];
    });
  }

  /** A player's save that wasn't asked through the request core goes on the player list, with the GM's choices (the GM answers for them) */
  withSavePlayerWait(options: SaveRequest, queued: SaveRequestEntry): Promise<Roll[] | Roll | null> | null {
    const { target, saveDetails, rollInfo, displayOptions, playerInfo: { player } } = options;
    const queuedPromise = queued.promise;
    // Asked through the request core: it put the request on the player list itself
    if (!queuedPromise || queued.asked || !player || player.isGM) return queuedPromise;
    const what = [...rollInfo.abilities, ...rollInfo.skills, ...rollInfo.tools].map(key => key.toUpperCase()).join("/");
    return trackPlayerWait<Roll[] | Roll | null>({
      kind: rollInfo.type === "save" ? "save" : "check", owner: this,
      userId: player.id!,
      actorUuid: target.actor?.uuid ?? undefined,
      tokenUuid: getTokenDocument(target)?.uuid ?? undefined,
      label: i18nFormat("midi-qol.PlayerWaits.SaveLabel", {
        what, type: i18n(rollInfo.type === "save" ? "DND5E.SavingThrow" : "DND5E.AbilityCheck"), item: this.item?.name ?? ""
      }),
      choices: this.gmSaveChoices(saveDetails, player, displayOptions.showRoll),
      onSettled: () => this.pendingSaves.cancel(getTokenDocument(target)?.uuid)
    }, () => queuedPromise);
  }

  /**
   * What the GM can answer a player's save with from the player list: rolled for them (normal, with advantage or
   * disadvantage), or on the GM's screen; shown as the player's own roll would have been (their roll mode; private and
   * self whispered to them, blind not). Both the chat-card path and askPlayerSave offer these.
   */
  gmSaveChoices(saveDetails: SaveDetails, player: User, showRoll: boolean): Record<"roll" | "advantage" | "disadvantage" | "gmRoll", WaitChoiceSpec<Roll[] | Roll | null>> {
    const rollForThem = (fastForward: boolean, mode?: "advantage" | "disadvantage") => unTimedExecuteAsGM("rollAbility", {
      saveDetails: mode ? { ...saveDetails, advantage: mode === "advantage", disadvantage: mode === "disadvantage" } : saveDetails,
      displayOptions: { fastForward, chatMessage: showRoll, rollMode: this.playerSaveMessageMode(), showTargetDC: true, forUserId: player.id }
    });
    return {
      roll: { label: "midi-qol.PlayerWaits.Choice.normal", value: () => rollForThem(true) },
      advantage: { label: "midi-qol.PlayerWaits.Choice.advantage", value: () => rollForThem(true, "advantage") },
      disadvantage: { label: "midi-qol.PlayerWaits.Choice.disadvantage", value: () => rollForThem(true, "disadvantage") },
      gmRoll: () => rollForThem(false)
    };
  }

  /**
   * A player's save through the request core (M3 stage 5; rules: ~/Documents/midi-request-redesign-plan-2026-11-10.md).
   * Their roll dialog shows this client's deadline (Player save timeout); confirming it claims the request, after which
   * the roll is waited for. A GM answers from the player list. When the deadline passes the save is made without them,
   * non-interactively: here if this client owns the creature, else by a GM, shown as the player's roll would have
   * been; with no GM connected, here unattended (no prompts).
   */
  askPlayerSave(target: TokenOrDocument, player: User.Implementation, saveDetails: SaveDetails,
    rollInfo: QueueSaveRollOptions["rollInfo"], displayOptions: QueueSaveRollOptions["displayOptions"]): Promise<Roll[] | Roll | null> {
    const rollMode = this.playerSaveMessageMode();
    const rollFor = (fastForward: boolean, mode?: "advantage" | "disadvantage", unattended?: boolean) => ({
      saveDetails: mode ? { ...saveDetails, advantage: mode === "advantage", disadvantage: mode === "disadvantage" } : saveDetails,
      displayOptions: { fastForward, chatMessage: displayOptions.showRoll, rollMode, showTargetDC: true, forUserId: player.id!, unattended }
    });
    const withoutPlayer = async (): Promise<Roll[] | Roll | null> => {
      if (target.actor?.isOwner) return await rollAbility(rollFor(true)) as Roll[] | Roll | null;
      if (preferredActiveGM()) return unTimedExecuteAsGM("rollAbility", rollFor(true));
      return await rollAbility(rollFor(true, undefined, true)) as Roll[] | Roll | null;
    };
    const what = [...rollInfo.abilities, ...rollInfo.skills, ...rollInfo.tools].map(key => key.toUpperCase()).join("/");
    return askUser<Roll[] | Roll | null>(player, {
      owner: this,
      type: SAVE_REQUEST,
      data: { saveDetails, displayOptions: { fastForward: displayOptions.simulate || !displayOptions.showRollDialog, chatMessage: true, rollMode, showTargetDC: true } },
      kind: rollInfo.type === "save" ? "save" : "check",
      actorUuid: target.actor?.uuid ?? undefined,
      tokenUuid: getTokenDocument(target)?.uuid ?? undefined,
      label: i18nFormat("midi-qol.PlayerWaits.SaveLabel", {
        what, type: i18n(rollInfo.type === "save" ? "DND5E.SavingThrow" : "DND5E.AbilityCheck"), item: this.item?.name ?? ""
      }),
      timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000,
      fallback: withoutPlayer,
      gmChoices: this.gmSaveChoices(saveDetails, player, displayOptions.showRoll)
    }).settled.then(settled => settled.value, async err => {
      // Nobody could make the save (the player's answer and the save made without them both failed): it fails, as the
      // other save paths' unanswered requests do, rather than failing every target's save
      TroubleShooter.recordError(err, `${this.workflowName} | save for ${target.name} could not be made`);
      //@ts-expect-error CONFIG.Dice.BasicRoll: no dnd5e-types
      return [await new CONFIG.Dice.BasicRoll("-1").evaluate()];
    });
  }

  /**
   * Process a single target's save result - determine if saved, apply bonuses, update tracking sets
   */
  async processTargetSaveResult(
    target: TokenOrDocument,
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
        await this.askReactionsStep(target, this.tokenUuid, this.attackRoll, "reactionsavesuccess", { workflow: this, activity: this.activity, item: this.item })
      else
        await this.askReactionsStep(target, this.tokenUuid, this.attackRoll, "reactionsavefail", { workflow: this, activity: this.activity, item: this.item })
    }
    if (isCritical) this.criticalSaves = this.criticalSaves.add(target);

    // Trigger target macros that might modify the roll
    if (configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) {
      const rollResults = await this.triggerTargetMacros(["isSave", "isSaveSuccess", "isSaveFailure"], new Set([target]), { saved }) as Record<string, Roll[]>;
      const newRolls = rollResults[getTokenDocument(target)?.uuid ?? ""];
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
  updateSaveFailSets(target: TokenOrDocument, saved: boolean): void {
    if (saved) {
      this.saves = this.saves.add(target);
      this.failedSaves.delete(target);
    } else {
      this.saves.delete(target);
      this.failedSaves = this.failedSaves.add(target);
    }
  }

  /**
   * Apply fail bonuses (flags.midi-qol.save.fail) if the save failed
   */
  async applyFailedSaveBonuses(
    target: TokenOrDocument,
    result: Roll[],
    saveRolls: Roll[],
    rollType: string,
    rollAbility: string
  ): Promise<{ saveRolls: Roll[], saveRollTotal: number } | null> {
    const failFlagsLength = collectBonusFlags(target.actor!, rollType, "fail.all").length;
    const failAbilityFlagsLength = collectBonusFlags(target.actor!, rollType, `fail.${rollAbility}`).length;

    if (!failFlagsLength && !failAbilityFlagsLength) {
      // Without fail flags, only when a rollBonuses contributor offers something after this failure
      const kind = rollType.startsWith("save") ? "save" : rollType.startsWith("skill") ? "skill" : "check";
      const offered = await collectBonusCandidates({ kind, actor: target.actor!, ability: rollAbility || undefined }, "postResult", result[0], { success: false });
      if (!offered.length) return null;
    }

    // If the roll fails and there is a flags.midi-qol.save.fail then apply the bonus
    let owner = playerFor(target);
    if (!owner?.active) owner = game.users?.find((u: User) => u.isGM && u.active);
    if (!owner) return null;

    // The ability's own fail flags when it has any, else the general ones (one rule for both paths: the player's used
    // to prefer fail.all when an actor had both)
    const selector = failAbilityFlagsLength ? `fail.${rollAbility}` : "fail.all";
    let newRoll: Roll;
    if (owner?.isGM && game.user?.isGM) {
      newRoll = await bonusCheck(target.actor!, result[0], rollType, selector, { system: { origin: this.itemCardId } });
    } else {
      // Asked through the request core (M5b): its deadline, after which (or on the GM's "skip" from the player list, or a
      // disconnect) the roll stands
      newRoll = await askUser<Roll>(owner, {
        owner: this,
        type: BONUS_REQUEST,
        data: { actorUuid: (target.actor as Actor).uuid, result: JSON.stringify(result[0].toJSON()), rollType, selector },
        kind: "bonus", actorUuid: target.actor?.uuid ?? undefined, tokenUuid: getTokenDocument(target)?.uuid ?? undefined,
        label: i18nFormat("midi-qol.PlayerWaits.BonusLabel", { item: this.item?.name ?? "" }),
        timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000,
        fallback: () => result[0],
        gmChoices: { skip: () => result[0] }
      }).settled.then(settled => settled.value ?? result[0], () => result[0]);
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
    target: TokenOrDocument,
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
    const targetDocument = getTokenDocument(target);

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
      saveActivityUuid: this.saveActivity?.uuid,
      workflowId: this.id ?? "",
      itemCardUuid: this.itemCardUuid ?? "",
      workflowOptions: this.workflowOptions,
      rollType: rollType ?? "save",
      rollAbilities,
      rollSkills,
      rollTools,
      itemId: this.saveActivity?.item.id ?? "",
    };
    // A creature rolling its own check or save (Hide, Search) rolls it with the keys held when it was used.
    const event = this.rollOptions.event as AugmentedEvent | undefined;
    if (event && target.actor?.uuid === this.actor?.uuid)
      saveDetails.heldModifiers = eventModifiers(event);

    // Trackers (advantage and roll modifiers) for each choice the roll offers: abilities for a save or plain check,
    // else the skills or tools, each rolled with its ability.
    const isSkillOrTool = rollType === "skill" || rollType === "tool";
    const choiceIds = rollType === "skill" ? rollSkills : rollType === "tool" ? rollTools : rollAbilities;
    const checkAbility = this.saveActivity?.check?.ability || undefined;
    const abilityFor = isSkillOrTool ? checkActivityAbilities(this.saveActivity, target.actor) : undefined;
    const isConcentrationCheck = this.item.flags?.[MODULE_ID]?.isConcentrationCheck;
    // A concentration check's save also takes the concentration advantage flags.
    const preComputedMap = await buildPreComputedAdvantageMap(
      target.actor!,
      (rollType === "save" && isConcentrationCheck) ? "concentration" : rollType ?? "",
      choiceIds,
      { workflow: this, isMagicSave: !!isMagicSave },
      abilityFor
    );

    const defaultId = isSkillOrTool ? choiceIds[0] : (this.saveActivity!.save?.ability?.first() ?? checkAbility ?? "");
    const defaultData = preComputedMap[defaultId ?? ""];
    // tracker is always a RollModifierTracker instance here (before socketlib serialization)
    saveDetails.modifierTracker = defaultData?.tracker instanceof RollModifierTracker ? defaultData.tracker : undefined;
    saveDetails.advantage = defaultData?.hasAdvantage;
    saveDetails.disadvantage = defaultData?.hasDisadvantage;
    saveDetails.isConcentrationCheck = isConcentrationCheck;

    // A roll is always ONE type (save, skill check, or tool check), so one map covers its choices.
    // tracker.toJSON() is called automatically during socketlib transmission; GMAction reconstructs.
    if (choiceIds.length > 1) saveDetails.advantageByChoice = preComputedMap;

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
    else if (saveDetails.disadvantage && !saveDetails.advantage) this.disadvantageSaves.add(target);

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

  /** Rolls the hit targets' saves: this.saves the ones that saved, this.failedSaves the rest */
  async checkSaves(whisper = false, simulate = false) {
    if (!simulate) await this.flushCardWrites();
    this.initSaveResults();
    this.targetSaveDetails = {};
    if (debugEnabled > 1) debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)
    if (this.hitTargets.count <= 0 && this.hitTargetsEC.count <= 0) {
      this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`
      return;
    }

    if (!this.saveActivity) return;
    // Every hit target rolls, with a canvas token or not, as its Token when it has one: cover, reactions, hooks and target macros need it
    const hitSet = this.hitTargets.union(this.hitTargetsEC);
    const allHitTargets: TokenOrDocument[] = hitSet.documents.map(document => hitSet.placeableOf(document) ?? document);
    if (allHitTargets.length === 0) return;
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

    const { flags: moduleFlags } = this.computeModuleIntegrationSettings(simulate, flagRollType ?? "");
    const { playerMonksTB, playerFlashTB, playerEpicRolls } = moduleFlags;
    // Each target's save, asked of the saveRequests service once every target is set up (M5b); a friendly auto result has its roll
    const slots: ({ request: SaveRequest } | { friendly: Promise<Roll[] | Roll | null> })[] = [];
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
        // Every save gets a message, linked to the card; each viewer's "Summarize chat cards" decides whether it
        // shows in the log or folds into the card.
        const showRoll = !simulate;
        if (!this.item.flags?.[MODULE_ID]?.noProvokeReaction && !this.workflowOptions.noProvokeReaction) {
          await this.askReactionsStep(target, this.tokenUuid, this.attackRoll ?? new Roll(""), "reactionsave", { workflow: this, activity: this.activity, item: this.item })
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
        const targetUuid = getTokenDocument(target)?.uuid;
        if (targetUuid && this.targetSaveDetails) this.targetSaveDetails[targetUuid] = saveDetails;
        // preTargetSave: modules and target macros may change saveDetails/tracker before the roll. Every target, as its
        // Token, or its TokenDocument when it has none (another scene or level)
        const saver = getToken(target) ?? getTokenDocument(target);
        await asyncHooksCallAll("midi-qol.preTargetSave", saver && hookTarget(saver), this, saveDetails);
        if (saver && configSettings.allowUseMacro && this.workflowOptions.noTargetOnUseMacro !== true) await this.triggerTargetMacros(["preTargetSave"], new Set([saver]));

        const friendly = this.getFriendlyTargetRoll(saveDetails as { isFriendly: boolean });
        if (friendly) {
          slots.push({ friendly });
          continue;
        }
        slots.push({ request: {
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
          }
        } });
      }
    } catch (err) {
      TroubleShooter.recordError(err);
      console.warn(err)
    }

    // The saveRequests service asks each provider once with its targets; a player's save not asked through the request
    // core goes on the player list here, as it always did
    const toAsk = slots.flatMap(slot => "request" in slot ? [slot.request] : []);
    // The providers' listeners (roll messages, Monk's TokenBar updates, Flash Rolls' hook), until every save is in
    const listeners = new Map<string, { hook: string, id: number }>();
    const listen = (hook: string, key: string, fn: (...args: never[]) => unknown) => {
      if (!listeners.has(key)) listeners.set(key, { hook, id: Hooks.on(hook as Hooks.HookName, fn as unknown as Hooks.Function<Hooks.HookName>) });
    };
    const answered = requestSaves(toAsk, { workflow: this, listen });
    let next = 0;
    for (const slot of slots) {
      if ("friendly" in slot) { promises.push(slot.friendly); continue; }
      const entry = answered[next++];
      const promise = this.withSavePlayerWait(slot.request, entry);
      if (promise) promises.push(promise);
      if (entry.requestCard) requestCards.push(entry.requestCard);
    }

    if (debugEnabled > 1) debug("check saves: waiting for ", this.pendingSaves.keys())
    let rawResults: (Roll[] | Roll | null)[];
    try {
      rawResults = await Promise.all(promises);
    } finally {
      for (const { hook, id } of listeners.values()) Hooks.off(hook as Hooks.HookName, id);
    }
    (await Promise.all(requestCards)).forEach(chatMessage => chatMessage?.delete());
    if (toAsk.some(request => settingsProviderFor(request) === MIDI_SAVE_PROVIDERS.epic)) await busyWait(10);
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
        const origin = regionShapeOrigin(regionDoc);
        if (origin) templateCoverOrigin = { ...origin, elevation: regionDoc.elevation?.bottom ?? 0 };
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
    const allHitTargets = this.hitTargets.union(this.hitTargetsEC).documents;
    let DCString = i18n("DND5E.AbbreviationDC") ?? "DC";
    if (DCString === "DND5E.AbbreviationDC") DCString = "DC";
    DCString = `${DCString} ${rollDC}`;
    if ((rollDC ?? -1) === -1) DCString = "";
    const dcLabel = `<label class="midi-qol-saveDC">${DCString}</label>`;

    if (rollType === "save") {
      const throwLabel = i18n(allHitTargets.length > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw");
      const lines = rollAbilities.map(ability =>
        `${dcLabel} ${GameSystemConfig.abilities[ability]?.label ?? ability} ${throwLabel}`
      );
      return lines.join("<br>");
    } else if (rollType === "check") {
      if (rollAbilities.length === 0) {
        return `${dcLabel} ${i18n("midi-qol.plain-d20-roll")}:`;
      }
      const checkLabel = i18n(allHitTargets.length > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check");
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

  monksSavingCheck(message: ChatMessage.Implementation, update: ChatMessage.UpdateData, _options: ChatMessage.Database.OnUpdateOptions, _userId: string) {
    if (!update.flags || !update.flags["monks-tokenbar"]) return true;
    const mflags = message.flags["monks-tokenbar"];
    for (let key of Object.keys(mflags)) {
      if (!key.startsWith("token")) continue;
      if (!mflags[key].roll) continue;
      const requestId = key.replace("token", "");
      if (!mflags[key].reveal) continue; // Must be showing the roll
      const pendingKey = this.pendingSaves.keyForToken(requestId, message.speaker?.scene);
      if (pendingKey) {
        let roll: Roll.Any;
        try {
          roll = Roll.fromJSON(JSON.stringify(mflags[key].roll));
        } catch (err) {
          roll = foundry.utils.deepClone(mflags[key].roll);
        }
        this.pendingSaves.answer(pendingKey, roll);
      }
    }
    return true;
  }

  flashSavingCheck(data: { actorUuid: string; roll: Roll.Any; total: number }) {
    if (debugEnabled > 0) debug(`flashSavingCheck | Received roll for ${data.actorUuid}`, data);
    if (debugEnabled > 0) debug(`flashSavingCheck | Waiting for:`, this.pendingSaves.keys());

    const requestId = data.actorUuid;
    // An actor's roll answers one of its tokens' saves (two tokens of one linked actor each get one)
    const [key] = this.pendingSaves.keysForActor(requestId);
    if (!key) {
      if (debugEnabled > 0) debug(`flashSavingCheck | No pending request for ${requestId}`);
      return;
    }
    if (debugEnabled > 0) debug(`flashSavingCheck | Resolving save for ${requestId} with roll total ${data.total}`);
    // Kept on the card: Flash Rolls may delete its save messages once rolled
    foundry.utils.setProperty(data.roll, `options.${MODULE_ID}.external`, "flash-rolls-5e");
    this.pendingSaves.answer(key, data.roll);
  }

  async callDamageHooksAndMacros(damages: DamageListEntry, token: TokenOrDocument) {
    this.damageItem = damages;
    if (configSettings.allowUseMacro && !this.workflowOptions?.noTargetOnUseMacro && this.item.flags) {
      await this.triggerTargetMacros(["preTargetDamageApplication"], new Set([token]));
    }
    await asyncHooksCallAll(`midi-qol.preTargetDamageApplication`, hookTarget(token), { item: this.item, workflow: this, damageItem: damages, ditem: damages });

    // A creature at 0 HP loses no hit points but is still damaged (e.g. ends Stable).
    const damagedAtZero = (damages.oldHP ?? 1) <= 0 && (damages.totalDamage ?? 0) > 0 && (damages.hpDamage ?? 0) >= 0;
    if ((damages.hpDamage !== 0 || damages.tempDamage > 0 || damagedAtZero) && (this.hitTargets.has(token) || this.hitTargetsEC.has(token) || this.otherActivity?.save || this.otherActivity?.check)) {
      let healedDamaged = damages.hpDamage < 0 ? "isHealed" : "isDamaged";
      await asyncHooksCallAll(`midi-qol.${healedDamaged}`, hookTarget(token), { item: this.item, workflow: this, damageItem: damages, ditem: damages });
      const actorOnUseMacros = foundry.utils.getProperty(token.actor ?? {}, midiFlag(`onUseMacroParts`)) as OnUseMacros ?? new OnUseMacros();
      // It seems applyTokenDamageMany without a this gets through to here - so a silly guard in place TODO come back and fix this properly
      if (this.callMacros) await this.callMacros(this.item,
        actorOnUseMacros?.getMacros(healedDamaged),
        "TargetOnUse",
        healedDamaged,
        targetMacroOptions(token));
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

  processSaveRoll(message: ChatMessage.Implementation, _html: HTMLElement | ChatMessage.Database.OnCreateOptions, _dataOrUserId?: ChatMessage.MessageData | string) {
    // An initiative roll by the same token is not the save being waited for
    const isRoll = isDnd5eRollMessage(message) && dnd5eRollType(message) !== "initiative";
    const key = this.pendingSaves.keyForToken(message?.speaker?.token, message?.speaker?.scene);
    if (debugEnabled > 0) warn("processSaveRoll |", key, this.pendingSaves.keys())
    if (!key || !isRoll) return true;
    // Only the kind of roll asked for answers it: another roll by the same token (a different save, an attack) doesn't
    const kind = this.pendingSaves.kindOf(key);
    if (kind && !rollAnswersRequest(message, kind)) return true;
    // A save another module rolled may not be linked to the card: record it for undo.
    if (configSettings.undoWorkflow && this.undoData) unTimedExecuteAsGM("addUndoChatCards", { id: this.undoData.id, chatCardUuids: [message.uuid] });
    this.pendingSaves.answer(key, message.rolls[0]);
    return true;
  }

  async checkSuperSaver(token: TokenOrDocument, abilities: Set<string> | undefined): Promise<boolean> {
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
    }
    return false;
  }

  async checkSemiSuperSaver(token: TokenOrDocument, abilities: Set<string> | undefined): Promise<boolean> {
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

  /** The attack's die as it counts (a min/max such as rolls.attack.min 20 counts) */
  static diceRollOf(roll: Roll): number {
    const term = roll.terms[0];
    if (term instanceof foundry.dice.terms.NumericTerm) return Number(term.total);
    return activeDiceTotal(term as foundry.dice.terms.DiceTerm) ?? Number(term?.total);
  }

  /** The attack's d20 result, or a die replacing the d20 that dnd5e accepts as one (e.g. Custom D&D 5e's 2d10) */
  static d20Of(roll: Roll): number | undefined {
    const d: any = roll.dice[0]; // should be a dice term but DiceTerm.options not defined
    if (!d) return undefined;
    const isD20 = (d.faces === 20) || ("validD20Roll" in roll && !!roll.validD20Roll);
    return isD20 ? d.total : undefined;
  }

  async processAttackRoll() {
    if (!this.attackRoll) return;
    const terms = this.attackRoll.terms;

    // Critical/fumble from the value the die counts as (a min/max such as rolls.attack.min 20 counts), as dnd5e does;
    // midi's auto-success/fail (min99/max1) force hit/miss without implying a natural crit/fumble, so they use the face.
    let critFumbleDiceRoll = this.diceRoll;
    const autoResult = this.attackRollModifierTracker.modifiers.willSucceed || this.attackRollModifierTracker.modifiers.willFail;
    if (!autoResult && !(terms[0] instanceof foundry.dice.terms.NumericTerm)) {
      critFumbleDiceRoll = activeDiceTotal(terms[0] as foundry.dice.terms.DiceTerm, true) ?? critFumbleDiceRoll;
    }

    // @ts-expect-error no dnd5e-types
    let criticalThreshold = this.attackRoll.options.criticalSuccess ?? 20;
    if (this.targets.count > 0) {
      const midiFlags = this.targets.documents[0]?.actor?.flags[MODULE_ID];
      let targetCrit = criticalThreshold;
      if (midiFlags?.grants?.criticalThreshold) {
        const conditionData = createConditionData({ workflow: this, target: this.targets.documents[0], actor: this.actor });
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
    if (this.targets.count >= 1) {
      const targetGrantsFumbleFlags: CriticalModifierFlags = {
        criticalFlags: [],
        noCriticalFlags: [],
        fumbleFlags: actionType ? ["grants.fumble.all", `grants.fumble.${actionType}`] : ["grants.fumble.all"],
        noFumbleFlags: []
      };

      // grants.fumble - check if ANY target has this flag
      for (const target of this.targets.documents) {
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
        for (const target of this.targets.documents) {
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
        if (allTargetsGrantNoFumble && this.targets.count > 0) {
          this.attackRollModifierTracker.fumble.suppress(noFumbleFlag, `${getFlagDisplayName(noFumbleFlag)} (${noFumbleTargets.join(", ")})`);
        }
      }
    }

    // The tracker decides: override > noCritical/noFumble > forceCritical/forceFumble > natural
    this.#persistAttackTracker();

    if (debugEnabled > 1) debug("processAttackRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble);

    // The roll's attribution when a crit/fumble occurred
    if (this.isCritical || this.isFumble) addAttribution(this.attackRoll, this.attackAttribution);
  }

  recordAttackStats() {
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

  recordDamageStats() {
    if (!configSettings.keepRollStats || !this.item || !this.damageList?.length) return;
    // Only count actual damage (positive hpDamage), not healing
    const totalHpDamage = this.damageList.reduce((sum, dl) => sum + Math.max(0, dl.hpDamage ?? 0), 0);
    // Sum raw damage from non-healing types only
    let totalDamage = 0;
    for (const dl of this.damageList) {
      if (dl.damages) {
        for (const dd of dl.damages) {
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
        if (hp > 0 && dl.calculatedDamages) {
          for (const dd of dl.calculatedDamages) {
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
      if (dl.damages) {
        for (const dd of dl.damages) {
          if (dd.value > 0 && dd.type && !GameSystemConfig.healingTypes[dd.type]) {
            dealtByType[dd.type] = (dealtByType[dd.type] ?? 0) + dd.value;
          }
        }
      }
      if (dl.calculatedDamages) {
        for (const dd of dl.calculatedDamages) {
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

  #preRollBonuses: { attack?: OfferedBonus[] } = {};
  /** The damage dice of this use's damage step, thrown together (Dice So Nice): set while collecting */
  #damageThrow: Roll[] | undefined;

  /** damageContributions' rolls this use, each its own damage message (the untargeted ones are also bonus damage) */
  /** The damageContributions rolled for this use: key = contributor and its position (roles can repeat), role = its message's label */
  #contributions: DamageContribution[] = [];

  /**
   * The damageContributions service's damage (M2 stage 8): each contribution rolled with the use's roll data; without
   * targets it joins the bonus damage (every target hit), with targets it goes to those targets only
   * (addTargetedDamageBonus); each is its own damage message (createDamageMessages).
   */
  async rollDamageContributions(): Promise<void> {
    const found = await collectDamageContributions({ workflow: this, actor: this.actor, item: this.item, activity: this.activity });
    if (!found.length) return;
    const rollData = (this.activity ?? this.item ?? this.actor)?.getRollData() ?? {};
    const untargeted: Roll[] = [];
    const counts: Record<string, number> = {};
    for (const { contributor, contribution } of found) {
      const key = `${contributor}#${counts[contributor] = (counts[contributor] ?? 0) + 1}`;
      try {
        const type = contribution.damageType ?? this.damageRolls?.[0]?.options?.type ?? MidiQOL.MQdefaultDamageType;
        // @ts-expect-error no dnd5e-types
        const roll: Roll = await new CONFIG.Dice.DamageRoll(contribution.formula, rollData, { type, flavor: contribution.label }).evaluate();
        if (contribution.targets?.length) this.addTargetedDamageBonus({ targets: [...contribution.targets], amount: roll.total ?? 0, type, label: contribution.label });
        else untargeted.push(roll);
        // Tagged: told apart from other bonus damage by the tag, not by object (a rebuilt use's rolls are copies)
        foundry.utils.setProperty(roll, `options.${MODULE_ID}.contribution`, { key, targeted: !!contribution.targets?.length });
        this.#contributions.push({ key, role: contribution.role, rolls: [roll] });
        if (this.workflowOptions?.damageRollDSN !== false) await this.throwDamageDice(roll);
      } catch (err) {
        reportServiceProblem("damageContributions", contributor, `${contribution.label}: rolling it failed`, err);
      }
    }
    if (untargeted.length) await this.setBonusDamageRolls([...(this.bonusDamageRolls ?? []), ...untargeted]);
  }

  /** This use's damage messages (createDamageMessages), by contribution key: on its card's state, so a rebuilt use finds them */
  get #damageMessageIds(): Record<string, string> { return this.#persisted.scalar("damageMessages", {} as Record<string, string>); }
  set #damageMessageIds(ids: Record<string, string>) {
    this.#persisted.setScalar("damageMessages", ids, ids => Object.entries(ids).map(([key, id]) => ({ key, id })));
  }
  /** A damage-only workflow's messages on another use's card (D2): kept here, the card's state is that use's */
  #foreignDamageMessageIds: Record<string, string> = {};
  #damageMessagesSync: Promise<void> | undefined;

  /** The contribution keys (activity, other, bonus, a contributor's) whose damage message exists */
  #damageKeysInMessages(): Set<string> {
    const ids = this.ownsCard ? this.#damageMessageIds : this.#foreignDamageMessageIds;
    const prefix = `workflow:${this.id}:`;
    return new Set(Object.entries(ids).filter(([, id]) => game.messages?.has(id))
      .map(([key]) => key.startsWith(prefix) ? key.slice(prefix.length) : key));
  }

  /** The damage rolls changed once their messages exist (a macro, a later bonus): the messages follow, once per change burst */
  syncDamageMessages(): void {
    if (this.readOnly || this.#damageMessagesSync) return;
    const ids = this.ownsCard ? this.#damageMessageIds : this.#foreignDamageMessageIds;
    if (foundry.utils.isEmpty(ids)) return;
    this.#damageMessagesSync = Promise.resolve().then(() => {
      this.#damageMessagesSync = undefined;
      return this.createDamageMessages();
    }).catch(err => error(`${this.workflowName} | updating the damage messages failed`, err));
  }

  /**
   * M2 stage 8: the use's damage as dnd5e damage messages, one per contribution (the activity's, the other activity's or
   * the ammunition's, bonus damage), origin the use card, so dnd5e and other modules find them
   * (getAssociatedRolls("damage"), damage message readers). They are folded into the use card (an empty summary, the
   * card shows the damage as before) and hidden in the log; with dnd5e's chat card summaries off none are made (they
   * would show as cards beside midi's). A contribution changed later (a bonus after the saves) updates its message.
   */
  async createDamageMessages(): Promise<void> {
    const card = this.chatCard;
    // Made whatever dnd5e's chat card summaries setting: off, they show in the log as dnd5e's own (user, M13 D1 b)
    if (this.readOnly || !card?.id) return;
    // A damage-only workflow adding to another use's card adds its own messages to it (user, M13 D2): keyed by the
    // workflow, role module, kept here (the card's state is the other use's)
    const owns = this.ownsCard;
    const ids = owns ? { ...this.#damageMessageIds } : this.#foreignDamageMessageIds;
    const TargetsField = globalThis.dnd5e?.dataModels?.chatMessage?.fields?.TargetsField;
    const targets = TargetsField ? TargetsField.getDescriptors(this.hitTargets.documents) : [];
    const other = this.otherDamageRolls ?? [];
    // The ammunition's rolls are tagged options.midi-qol.ammunition (rolls/damage.ts); this read options.midiAmmunition, so never matched
    const otherRole = other.some(roll => !!foundry.utils.getProperty(roll, `options.${MODULE_ID}.ammunition`)) ? "ammunition" : "other";
    // midi's own damage is keyed by its role; a module's contributions by contributor (two may share a role)
    const contributions = [
      { key: "activity", role: "activity", rolls: this.damageRolls ?? [] },
      { key: "other", role: otherRole, rolls: other },
      // Bonus damage without the contributions' rolls, which have their own messages
      { key: "bonus", role: "bonus", rolls: (this.bonusDamageRolls ?? []).filter(roll => !foundry.utils.getProperty(roll, `options.${MODULE_ID}.contribution`)) },
      ...this.#contributions
    ].filter(c => c.rolls.length)
      .map(c => owns ? c : { ...c, key: `workflow:${this.id}:${c.key}`, role: "module" });
    // Their dice were thrown with the damage step (copies marked shown, so the messages don't throw them again)
    const markShown = (data: unknown): void => {
      if (Array.isArray(data)) { data.forEach(markShown); return; }
      if (!data || typeof data !== "object") return;
      const results = (data as { results?: unknown }).results;
      if (Array.isArray(results)) for (const result of results) if (result && typeof result === "object") (result as { hidden?: boolean }).hidden = true;
      Object.values(data).forEach(markShown);
    };
    const shown = (rolls: Roll[]) => rolls.map(roll => { const json = foundry.utils.deepClone(roll.toJSON()); markShown(json); return json; });
    const creates: object[] = [];
    for (const { key, role, rolls } of contributions) {
      const id = ids[key];
      const existing = id ? game.messages?.get(id) : undefined;
      if (existing) {
        // Unchanged: no write (each one redraws the card)
        const next = shown(rolls);
        const stored = (existing.rolls as Roll[]).map(roll => JSON.stringify(roll.toJSON()));
        if (stored.length !== next.length || next.some((roll, i) => JSON.stringify(roll) !== stored[i]))
          await existing.update({ rolls: next } as ChatMessage.UpdateData);
      }
      else creates.push({
        type: "damage", rolls: shown(rolls), speaker: card.speaker, whisper: card.whisper, blind: card.blind, author: game.user?.id,
        system: { ...(this.activity?.messageSources ?? {}), origin: card.id, targets },
        flags: { [MODULE_ID]: { damage: { role, key } } }
      });
    }
    if (creates.length) {
      const created = await ChatMessage.implementation.createDocuments(creates as ChatMessage.CreateData[]);
      for (const message of created ?? []) {
        const key = foundry.utils.getProperty(message, `flags.${MODULE_ID}.damage.key`) as string | undefined;
        if (key && message.id) ids[key] = message.id;
      }
      if (owns) this.#damageMessageIds = ids;
    }
    // The card no longer holds the damage its messages do (M13 stage 3)
    if (owns) {
      this.#persistRolls();
      await this.performThrottledUpdate(card, {});
    } else {
      const ownRoll = (roll: Roll) => foundry.utils.getProperty(roll, `options.${MODULE_ID}.addedBy`) === this.id;
      const added = this.chatRolls.map(roll => { foundry.utils.setProperty(roll, `options.${MODULE_ID}.addedBy`, this.id); return roll; });
      await this.performThrottledUpdate(card, { rolls: [...(card.rolls as Roll[]).filter(roll => !ownRoll(roll)), ...added] } as ChatMessage.UpdateData);
    }
  }

  /** Start collecting the damage step's dice (the activity's, the other activity's, bonus damage) for one throw */
  beginDamageThrow(): void {
    this.#damageThrow ??= [];
  }

  /** Throw these damage dice now, or with the rest of the damage step's when it is collecting */
  async throwDamageDice(rolls: Roll | Roll[]): Promise<void> {
    const list = rolls instanceof Array ? rolls : [rolls];
    if (this.#damageThrow) {
      this.#damageThrow.push(...list);
      return;
    }
    await Promise.all(list.map(roll => displayDSNForRoll(roll, "damageRoll", undefined, undefined, this.actor)));
  }

  /** The damage step's dice in one throw: one roll of all their terms (damage-type flavours kept for DSN's colours) */
  async flushDamageThrow(): Promise<void> {
    const rolls = this.#damageThrow;
    this.#damageThrow = undefined;
    if (!rolls?.length) return;
    if (rolls.length === 1) return displayDSNForRoll(rolls[0], "damageRoll", undefined, undefined, this.actor);
    // Joined without rolling any dice again (addRollTo joins the evaluated terms)
    const combined = rolls.slice(1).reduce((joined, roll) => addRollTo(joined, roll), rolls[0]);
    await displayDSNForRoll(combined, "damageRoll", undefined, undefined, this.actor);
    // The rolls' own messages, when created, are already shown
    DSNMarkDiceDisplayed(rolls);
  }
  #savesResolved = false;
  #deferredDamageBonuses = false;

  /**
   * rollBonuses decision 4: a use with saves offers contributors' damage bonuses once the saves are known (here, as
   * the damage is calculated), so a bonus can depend on who saved; the damage is worked out again with the new roll.
   */
  async offerDeferredDamageBonuses(): Promise<void> {
    if (!this.#deferredDamageBonuses) return;
    this.#deferredDamageBonuses = false;
    const roll = this.damageRolls?.[0];
    if (!roll) return;
    const bonusQuery = this.rollBonusQuery("damage");
    const candidates = await collectBonusCandidates(bonusQuery, "postResult", roll);
    if (!candidates.length) return;
    await this.flushCardWrites(); // a person decides next
    const newRoll = await bonusDialog.bind(this)([], "damage.all", false, `${this.actor.name} - ${i18n("DND5E.Damage")} ${i18n("DND5E.Roll")}`, roll, "damageRoll",
      { damageRolls: this.damageRolls, bonusQuery, bonusPhase: "postResult", candidates });
    if (newRoll && newRoll !== roll) {
      const rolls = [...this.damageRolls!];
      rolls[0] = newRoll;
      await this.setDamageRolls(rolls);
      await this.displayDamageRolls();
      await this.createDamageMessages();
    }
  }

  /** rollBonuses' damage bonuses for particular targets (stage 9), added to those targets' damage by midi's damageModifiers contributor */
  targetedDamageBonuses: { targets: string[], amount: number, type: string, label: string }[] = [];
  addTargetedDamageBonus(bonus: { targets: string[], amount: number, type: string, label: string }): void {
    this.targetedDamageBonuses.push(bonus);
  }

  /**
   * rollBonuses' preRoll phase (stage 7): automatic bonuses that add to the formula are collected before the roll and
   * become parts of it (attackRollParts), so they show in the roll and dnd5e doubles their dice on a critical. Optional
   * preRoll bonuses are not offered yet (the prompt opens after the roll).
   */
  async collectPreRollBonuses(kind: "attack"): Promise<void> {
    const offered = await collectBonusCandidates(this.rollBonusQuery(kind), "preRoll", new Roll("0"));
    this.#preRollBonuses[kind] = offered.filter(candidate => !candidate.optional && candidate.effect.kind === "add");
  }

  /** After the roll: the preRoll bonuses it carries are recorded as used, their costs spent and their onChosen run. */
  async settlePreRollBonuses(kind: "attack", roll: Roll): Promise<void> {
    const applied = this.#preRollBonuses[kind] ?? [];
    this.#preRollBonuses[kind] = undefined;
    if (!applied.length) return;
    const used: string[] = foundry.utils.getProperty(roll, `flags.${MODULE_ID}.optionalsUsed`) as string[] ?? [];
    for (const bonus of applied) {
      used.push(bonus.id);
      try {
        if (!bonus.spendsOwnCost) await spendBonusCost(this.actor, bonus.cost, bonus.label);
        await bonus.onChosen?.({ query: this.rollBonusQuery(kind), phase: "preRoll", roll });
      } catch (err) {
        reportServiceProblem("rollBonuses", bonus.contributor, `${bonus.label}: applying it failed`, err);
      }
    }
    foundry.utils.setProperty(roll, `flags.${MODULE_ID}.optionalsUsed`, used);
  }

  /** What rollBonuses contributors are told about this use's attack or damage roll. */
  rollBonusQuery(kind: "attack" | "damage"): RollBonusQuery {
    return {
      kind, actor: this.actor, token: getTokenDocument(this.token), workflow: this, activity: this.activity, item: this.item,
      target: this.targets.count === 1 ? this.targets.documents[0] : undefined, actionType: this.activity?.actionType
    };
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

    const bonusQuery = this.rollBonusQuery("attack");
    let candidates = await collectBonusCandidates(bonusQuery, "preResult", this.attackRoll!, { isFumble: this.isFumble });
    if (bonusFlags.length > 0 || candidates.length > 0) {
      const displayBonusRolls: boolean | undefined = bonusFlags.reduce((acc: boolean | undefined, flag) => (acc || (foundry.utils.getProperty(flagOwners[flag] ?? this.actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined)
        ?? checkMechanic("displayBonusRolls") as boolean;
      await this.flushCardWrites(); // a person decides next
      const newRoll = await bonusDialog.bind(this)(bonusFlags, attackBonus, displayBonusRolls, `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, this.attackRoll!, "attackRoll", { flagOwners, bonusQuery, bonusPhase: "preResult", candidates })
      if (newRoll) this.setAttackRoll(newRoll);
    }
    if (this.targets.count === 1) {
      const target = this.targets.documents[0]!;
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
        candidates = await collectBonusCandidates(bonusQuery, "postResult", this.attackRoll!, { success: false, isFumble: this.isFumble });
        if (bonusFlags.length > 0 || candidates.length > 0) {
          const displayBonusRolls: boolean | undefined = bonusFlags.reduce((acc: boolean | undefined, flag: string) => (acc || (foundry.utils.getProperty(flagOwners[flag] ?? this.actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined)
            ?? checkMechanic("displayBonusRolls") as boolean;
          await this.flushCardWrites(); // a person decides next
          const newRoll = await bonusDialog.bind(this)(bonusFlags, attackBonus, displayBonusRolls, `${this.actor.name} - ${i18n("DND5E.Attack")} ${i18n("DND5E.Roll")}`, this.attackRoll, "attackRoll", { flagOwners, bonusQuery, bonusPhase: "postResult", candidates });
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
    const bonusQuery = this.rollBonusQuery("damage");
    // Contributors' damage bonuses wait until the saves are known (offerDeferredDamageBonuses); flags keep their timing
    const deferContributors = this.hasSave && !this.#savesResolved;
    if (deferContributors) this.#deferredDamageBonuses = true;
    const candidates = damageRolls[0] && !deferContributors ? await collectBonusCandidates(bonusQuery, "postResult", damageRolls[0]) : [];
    if (bonusFlags.length > 0 || candidates.length > 0) {
      // this.damamgeRollHTML = $(this.damageRolHTML).find(".dice-roll").remove();
      // TODO dnd3 work out what this means for multiple rolls
      const displayBonusRolls: boolean | undefined = bonusFlags.reduce((acc: boolean | undefined, flag: string) => (acc || (foundry.utils.getProperty(flagOwners[flag] ?? this.actor ?? {}, `${flag}.displayBonusRolls`) as boolean)), undefined)
        ?? checkMechanic("displayBonusRolls") as boolean;
      await this.flushCardWrites(); // a person decides next
      let newRoll = await bonusDialog.bind(this)(bonusFlags, damageBonus, displayBonusRolls === true, `${this.actor.name} - ${i18n("DND5E.Damage")} ${i18n("DND5E.Roll")}`, damageRolls[0], "damageRoll", { hideDSN, damageRolls, flagOwners, bonusQuery, bonusPhase: "postResult", candidates })
      if (newRoll) damageRolls[0] = newRoll;
    }
    return damageRolls;
  }

  recordTargetACModifiers() {
    this.targetACModifiers = new Map() as Map<string, number>;
    const allTargetDescriptors = this.targetDescriptors;
    for (let targetToken of this.targets.documents) {
      let targetActor = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      const targetDescriptor = getTargetDescriptor(targetActor.uuid ?? "", allTargetDescriptors);
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
      this.hitTargets = new TokenDocumentSet(this.targets)
    } else this.hitTargets = new Set();

    this.hitDisplayData = {};
    const challengeModeArmorSet = !([undefined, false, "none"].includes((checkRule("challengeModeArmor") as string | boolean | undefined)));
    for (const targetDocument of this.targets.documents) {
      // No canvas token (another scene or level): its actor's AC, with no cover or reactions
      const drawnToken = this.targets.placeableOf(targetDocument);
      const targetToken: TokenOrDocument = drawnToken ?? targetDocument;
      let targetName = configSettings.useTokenNames && targetToken.name ? targetToken.name : targetToken.actor?.name;
      let targetActor = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      let targetACMod = (targetActor.uuid ? this.targetACModifiers.get(targetActor.uuid) : undefined) ?? 0;
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

      // Compute effective AC: reconciles status cover with module cover (status as minimum),
      // applies attack-specific reductions (ignoreFullCover, sharpShooter, spellSniper, ignoreCover),
      // and incorporates targetACMod.
      let acResult = this.token && drawnToken
        ? computeTargetAC(this.token, drawnToken, this.activity, { ignoreCover, targetACMod })
        : undefined;

      let targetAC = vehicleACOverride ?? acResult?.effectiveAC
        //@ts-expect-error no dnd5e-types
        ?? (Number.parseInt(targetActor.system.attributes.ac.value ?? 10) + targetACMod);

      // Already in the attack roll for a single target (attackRollParts)
      const midiFlagsAttackBonus = this.grantedAttackBonusInRollUuid === targetActor.uuid ? undefined : targetActor.flags?.[MODULE_ID]?.grants?.attack?.bonus;
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
            const result = await this.askReactionsStep(targetToken, this.tokenUuid, this.attackRoll, "reactionattacked", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
            if (result?.ac && isFinite(targetAC)) { // result.ac is a newAC total from optional bonus dialog; don't override total cover (Infinity)
              //@ts-expect-error no dnd5e-types
              const preReactionRawAC: number = targetToken.actor?.system.attributes.ac?.value ?? 10;
              reactionACDelta = result.ac - preReactionRawAC;
              reactionItemName = result.name;
              targetAC = result.ac + (acResult?.appliedCoverDelta ?? 0) + targetACMod;
            } else if (result?.uuid && isFinite(targetAC)) {
              // Spell reaction (e.g. Shield) was used but didn't return ac directly.
              // The actor's AC has been updated by the reaction workflow — recompute effective AC.
              const postReactionACResult = this.token && drawnToken
                ? computeTargetAC(this.token, drawnToken, this.activity, { ignoreCover, targetACMod })
                : undefined;
              if (postReactionACResult && postReactionACResult.effectiveAC !== targetAC) {
                // Show the reaction's contribution separately: restore pre-reaction baseAC and track the delta
                const preReactionBaseAC = acResult?.baseAC ?? postReactionACResult.baseAC;
                reactionACDelta = postReactionACResult.baseAC - preReactionBaseAC;
                postReactionACResult.baseAC = preReactionBaseAC;
                acResult = postReactionACResult;
                targetAC = acResult.effectiveAC;
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
            result = await this.askReactionsStep(targetToken, this.tokenUuid, this.attackRoll, "reaction", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
          }
          if (!Workflow.findWorkflow(this.id)) // workflow has been removed - bail out
            return;
          // targetAC already has cover, flanking, and targetACMod from computeTargetAC (via acResult.effectiveAC)
          // Only update if the hit reaction returned a new AC total
          if (result?.ac) {
            //@ts-expect-error no dnd5e-types
            const preReactionRawAC: number = targetToken.actor?.system.attributes.ac?.value ?? 10;
            reactionACDelta = result.ac - preReactionRawAC;
            reactionItemName = result.name;
            targetAC = result.ac + (acResult?.appliedCoverDelta ?? 0);
          } else if (result?.uuid) {
            // Spell reaction was used but didn't return ac directly — recompute effective AC.
            const postReactionACResult = this.token && drawnToken
              ? computeTargetAC(this.token, drawnToken, this.activity, { ignoreCover, targetACMod })
              : undefined;
            if (postReactionACResult && postReactionACResult.effectiveAC !== targetAC) {
              const preReactionBaseAC = acResult?.baseAC ?? postReactionACResult.baseAC;
              reactionACDelta = postReactionACResult.baseAC - preReactionBaseAC;
              postReactionACResult.baseAC = preReactionBaseAC;
              acResult = postReactionACResult;
              targetAC = acResult.effectiveAC;
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
            await this.askReactionsStep(targetToken, this.tokenUuid, this.attackRoll, "reactionmissed", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
          }
          // TODO what else to do once rolled
        }
        const optionalCrits = checkRule("optionalCritRule") as number;
        if (this.targets.documents.length === 1 && configSettings.optionalRulesEnabled && optionalCrits > -1) {
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

      // An auto success or failure decides the hit whatever the AC
      let forcedResult = false;
      {
        const conditionData = createConditionData({ workflow: this, target: targetToken, actor: this.actor });
        const actionType = this.activity.actionType;
        const attackFields = [`abilities.${this.activity.ability}.attack.roll`, "rolls.attack", `rolls.attack.${actionType}`];
        // dnd5e's roll fields, then midi's flag for every roll
        const firstMatch = async (kind: "fail" | "success"): Promise<string | undefined> => {
          for (const path of attackFields)
            if (await evalAllConditionsAsync(this.actor, `system.${path}.${kind}`, conditionData)) return `${path}.${kind}`;
          if (await evalAllConditionsAsync(this.actor, midiFlag(`${kind}.all`), conditionData)) return `${kind}.all`;
          return undefined;
        };
        const failFlag = await firstMatch("fail");
        if (failFlag) {
          isHit = false;
          isHitEC = false;
          forcedResult = true;
          this.attackRollModifierTracker.critical.setOverride(false, failFlag, getFlagDisplayName(failFlag));
        }
        const successFlag = await firstMatch("success");
        if (successFlag) {
          isHit = true;
          isHitEC = false;
          forcedResult = true;
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
          forcedResult = true;
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
          forcedResult = true;
          this.attackRollModifierTracker.critical.setOverride(false, grantsFailFlag, getFlagDisplayName(grantsFailFlag));
        }
      }

      let hitScale = 1;
      // @ts-expect-error no dnd5e-types
      if (["scale", "scaleNoAR"].includes(checkRule("challengeModeArmor")) && !this.isCritical) hitScale = Math.floor((this.attackTotal - targetEC + 1) / ((targetActor?.system.attributes.ac.AR ?? 0) + 1) * 10) / 10;
      if (!this.challengeModeScale) this.challengeModeScale = {};
      this.challengeModeScale[targetToken.actor?.uuid ?? "dummy"] = hitScale;
      if (this.isCritical && isFinite(targetAC)) isHit = true;
      // Premades decide last (midi-qol.premades.checkHitTarget): a changed AC or critical is tested again, unless an auto
      // success or failure decided the hit; a changed result (isHit, isHitEC) is kept as set
      const acBefore = targetAC;
      const criticalBefore = this.isCritical;
      const hitCheck = { workflow: this, target: hookTarget(targetToken), attackTotal: attackTotal + attackBonus, targetAC, isHit, isHitEC, isCritical: this.isCritical, isFumble: this.isFumble };
      await asyncHooksCallAll("midi-qol.premades.checkHitTarget", hitCheck);
      if (hitCheck.isCritical !== this.isCritical) this.attackRollModifierTracker.critical.setOverride(!!hitCheck.isCritical, "checkHitTarget", "midi-qol.premades.checkHitTarget");
      if (hitCheck.isFumble !== this.isFumble) this.attackRollModifierTracker.fumble.setOverride(!!hitCheck.isFumble, "checkHitTarget", "midi-qol.premades.checkHitTarget");
      if (typeof hitCheck.targetAC === "number" && !Number.isNaN(hitCheck.targetAC)) targetAC = hitCheck.targetAC;
      const retest = targetAC !== acBefore || this.isCritical !== criticalBefore;
      if (hitCheck.isHit !== isHit || hitCheck.isHitEC !== isHitEC) {
        isHit = !!hitCheck.isHit;
        isHitEC = !!hitCheck.isHitEC;
      } else if (retest && !forcedResult) {
        isHit = isFinite(targetAC) && (attackTotal + attackBonus >= targetAC || this.isCritical);
        if (challengeModeArmorSet) isHit = isFinite(targetAC) && (this.attackTotal > targetAC || this.isCritical);
        if (targetEC) isHitEC = challengeModeArmorSet && this.attackTotal <= targetAC && this.attackTotal >= targetEC && isFinite(targetAC);
      }
      if (retest) hitResultNumeric = this.isCritical ? "++" : !isFinite(targetAC) ? `${attackTotal}/∞` : `${attackTotal}/${Math.abs(attackTotal - targetAC)}`;
      if (isHit) this.hitTargets = this.hitTargets.add(targetToken);
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

      const img = await tokenPortrait(targetDocument);

      if (this.isFumble) hitResultNumeric = "--";
      const targetUuid = targetDocument.uuid;

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

      if (targetUuid) this.hitDisplayData[targetUuid] = {
        targetClass: !!targetToken.actor?.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-npc-target",
        target: hookTarget(targetToken),
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
        hitResultNumeric,
        attackTotal,
        isHit: ["hit", "critical", "isHitEC"].includes(isHitResult)
      };
    }
    if (configSettings.allowUseMacro && !options.noTargetOnUseMacro) await this.triggerTargetMacros(["isHit"], this.hitTargets.union(this.hitTargetsEC));
    if (configSettings.allowUseMacro && !options.noTargetOnUseMacro) await this.triggerTargetMacros(["isMissed"], this.targets.difference(this.hitTargets).difference(this.hitTargetsEC));
    this.#persistAttackTracker();
  }

  /** Link a card roll to the card as dnd5e links the rolls it posts (Roll#getOriginatingMessage, options.rollType). */
  #linkRollToCard(roll: Roll, rollType: "attack" | "damage") {
    if (this.itemCardId) foundry.utils.setProperty(roll, "options.originatingMessage", this.itemCardId);
    const type = rollType === "damage" && isActivityType(this.activity, "heal") ? "healing" : rollType;
    if (!foundry.utils.getProperty(roll, "options.rollType")) foundry.utils.setProperty(roll, "options.rollType", type);
  }

  /**
   * Run one of dnd5e's rolls for `subject`, keeping the flags other modules put on its message config: midi rolls without
   * dnd5e's messages, so they go on the card with its next roll update (midi's, dnd5e's and core's left out). dnd5e
   * rolls on a copy of the message config.
   */
  async keepRollMessageFlags<T>(subject: unknown, roll: () => Promise<T>): Promise<T> {
    const id = Hooks.on("dnd5e.postRollConfiguration", (_rolls, config, _dialog, message) => {
      if ((config as { subject?: unknown }).subject === subject) this.addRollMessageFlags(message as { data?: Record<string, unknown> });
    });
    try { return await roll(); } finally { Hooks.off("dnd5e.postRollConfiguration", id); }
  }

  addRollMessageFlags(message: { data?: Record<string, unknown> } | undefined) {
    const data: { flags?: Record<string, unknown> } = foundry.utils.expandObject(message?.data ?? {});
    const flags = data.flags;
    if (!flags) return;
    for (const [scope, value] of Object.entries(flags)) {
      if ([MODULE_ID, "dnd5e", "core"].includes(scope) || !value || typeof value !== "object") continue;
      this.#rollMessageFlags[scope] = foundry.utils.mergeObject(this.#rollMessageFlags[scope] ?? {}, value, { inplace: false });
    }
  }
  #rollMessageFlags: Record<string, object> = {};

  /** A card update carrying the kept roll message flags; midi's own flags in the update win. */
  #withRollMessageFlags<T extends Record<string, unknown>>(updates: T): T {
    if (!Object.keys(this.#rollMessageFlags).length) return updates;
    const flags = foundry.utils.mergeObject(foundry.utils.deepClone(this.#rollMessageFlags), (updates.flags as object) ?? {}, { inplace: false });
    return { ...updates, flags };
  }

  async setAttackRoll(roll: Roll) {
    this.attackRoll = roll;
    foundry.utils.setProperty(roll, "options.midi-qol.rollType", "attack");
    this.#linkRollToCard(roll, "attack");
  }

  async setUtilityRolls(rolls: Array<Roll> | Roll | undefined | null) {
    if (!rolls) {
      this.utilityRolls = undefined;
      return;
    };
    if (rolls instanceof Roll) rolls = [rolls];
    this.utilityRolls = rolls;
    for (let roll of this.utilityRolls) foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "utility");
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
    for (let roll of this.damageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "defaultDamage");
      this.#linkRollToCard(roll, "damage");
      foundry.utils.setProperty(roll, "options.flavor", "");
    }
    this.deriveDamage();
    this.damageDetail = foundry.utils.deepClone(this.rawDamageDetail);
    this.syncDamageMessages();
    return;
  }

  /** Detail from the damage rolls; also how a rebuilt workflow gets it back */
  deriveDamage() {
    this.rawDamageDetail = createDamageDetail({ roll: this.damageRolls, activity: this.activity, defaultType: this.defaultDamageType });
  }

  deriveBonusDamage() {
    const rolls = this.bonusDamageRolls ?? [];
    this.rawBonusDamageDetail = createDamageDetail({ roll: rolls, activity: this.activity, defaultType: this.defaultDamageType });
  }

  deriveOtherDamage() {
    const rolls = this.otherDamageRolls ?? [];
    const isAmmunition = (roll: Roll) => !!foundry.utils.getProperty(roll, `options.${MODULE_ID}.ammunition`);
    const detailOf = (rolls: Roll[]) => rolls.length ? createDamageDetail({ roll: rolls, activity: this.activity, defaultType: this.defaultDamageType }) : [];
    // The ammunition's damage marked as such
    this.rawOtherDamageDetail = detailOf(rolls.filter(roll => !isAmmunition(roll)))
      .concat(detailOf(rolls.filter(isAmmunition)).map(d => ({ ...d, midiAmmunition: true })));
  }

  async setDamageRolls(rolls: Array<Roll> | Roll | undefined | null) {
    if (!rolls) {
      this.damageRolls = [];
      return;
    };

    if (rolls instanceof Roll) rolls = [rolls];
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
      foundry.utils.setProperty(rolls[i], "options.properties", (rolls[i].options?.properties ?? []).concat(baseRollProperties));
    }
    this.damageRolls = rolls;
    for (let roll of this.damageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "defaultDamage");
      this.#linkRollToCard(roll, "damage");
      foundry.utils.setProperty(roll, "options.flavor", "");
    }
    this.flavor = i18n("DND5E.Damage");
    this.deriveDamage();
    this.damageDetail = foundry.utils.deepClone(this.rawDamageDetail);
    this.syncDamageMessages();
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
    for (let roll of this.bonusDamageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "bonusDamage");
      this.#linkRollToCard(roll, "damage");
    }
    this.deriveBonusDamage();
    this.bonusDamageDetail = foundry.utils.deepClone(this.rawBonusDamageDetail);
    this.syncDamageMessages();
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
    for (let roll of this.otherDamageRolls) {
      foundry.utils.setProperty(roll, `options.${MODULE_ID}.rollType`, "otherDamage");
      this.#linkRollToCard(roll, "damage");
    }
    this.deriveOtherDamage();
    this.otherDamageDetail = foundry.utils.deepClone(this.rawOtherDamageDetail);
    this.syncDamageMessages();
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
    await this.flushCardWrites(); // a person decides next
    const { DialogV2 } = foundry.applications.api;
    const buttons = effects.map(effect => ({
      action: effect.uuid ?? "",
      label: effect.name,
      callback: () => effect,
    }));
    const result = await DialogV2.wait({
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
    const chosen = effects.find(effect => effect === result);
    if (!chosen) return [];
    return [chosen];
  }
}
export class SavesFirstWorkflow extends Workflow {
  static flowId = "midi-qol.savesFirst";
  get postAttackRollState(): WorkflowState {
    return "midi-qol.WaitForSaves";
  }

}

export class ActiveDefenceWorkflow extends Workflow {
  static flowId = "midi-qol.activeDefence";
  async processAttackRoll() {
    return super.processAttackRoll();
  }

  async checkHits() {
    if (!this.attackRoll || !this.item) return;
    if (!this.attackRoll?.total) {
      this.abort = true;
      return this.performState("midi-qol.Abort");
    }

    this.displayHitTargets(false);
    // Roll is d20 + AC - 10
    try {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      this.activeDefenceRolls = {};
      this.isCritical = false;
      this.isFumble = false;
      // Get the attack bonus for the attack

      await this.displayAttackRoll();
      await this.checkActiveAttacks(false, this.attackRoll);
      const isHitEC = false;
      // Active defence: the targets with a canvas token (cover, the player asked to roll)
      for (let targetToken of this.targets.tokens) {
        let targetAC: number | undefined;
        let adRoll: Roll | undefined;
        const targetTokenDocument = getTokenDocument(targetToken);
        if (!targetTokenDocument) continue;
        const rollKey = targetTokenDocument.uuid ?? "";
        if (this.activeDefenceRolls[rollKey]) {
          adRoll = this.activeDefenceRolls[rollKey];

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

          const img = await tokenPortrait(targetTokenDocument);
          // Why?
          let acBonusString: string | undefined;
          const acDisplay = `${adRoll.total}${acBonusString ?? ""}`;
          const bonusAC = 0;
          let attackBonus = (this.activeDefenceDC ?? 0) - configSettings.optionalRules.activeDefenceModifier;
          // Compute cover bonus and apply
          const targetUuid = targetTokenDocument.uuid;
          this.hitDisplayData ??= {};
          if (targetUuid) this.hitDisplayData[targetUuid] = {
            targetClass: !!targetTokenDocument.actor?.hasPlayerOwner ? "midi-qol-player-target" : "midi-qol-npc-target",
            target: hookTarget(targetToken),
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
            hitResultNumeric: String(adRoll.total),
            attackTotal: adRoll.total
          };
        }
      }
    } catch (err) {
      TroubleShooter.recordError(err, "activeDefence");
    }
  }

  //@ts-expect-error no dnd5e types
  async checkActiveAttacks(whisper = false, roll: CONFIG.Dice.D20Roll, _coverBonus = 0) {
    //@ts-expect-error
    const BasicRoll = CONFIG.Dice.BasicRoll;
    if (debugEnabled > 1) debug(`active defence : whisper ${whisper}  hit targets ${this.targets}`)
    if (this.targets.count <= 0) {
      return;
    }
    //@ts-expect-error no dnd5e types
    const D20Roll = CONFIG.Dice.D20Roll;

    const criticalTarget = 20 - (roll.options.criticalFailure ?? 1) + 1;
    const fumbleTarget = 20 - (roll.options.criticalSuccess ?? 20) + 1;
    let advantageMode = roll?.options?.advantageMode ?? D20Roll.NORMAL;
    let promises: Promise<any>[] = [];
    // Active defence rolls are for the targets with a canvas token; results are read back in the same order below
    for (let target of this.targets.tokens) {
      if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
      const targetActor = target.actor;
      const targetActorSystem = target.actor.system;
      // Already in the attack roll for a single target (attackRollParts)
      const midiFlagsAttackBonus = this.grantedAttackBonusInRollUuid === targetActor.uuid ? undefined : targetActor.flags?.[MODULE_ID]?.grants?.attack?.bonus;

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
                    const result = await this.askReactionsStep(targetToken, this.tokenUuid, this.attackRoll, "reactionattacked", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
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
        const requestId = target.actor.uuid ?? foundry.utils.randomID();
        // As the player's own defence roll would have been shown (Active Defence roll display, whispered to them unless blind)
        const rollForThem = async () => {
          const result = await (new D20Roll(formula, {}, options)).evaluate();
          result.toMessage({ flavor: `${this.item.name} ${i18n("midi-qol.ActiveDefenceString")}`, speaker: speakerFor({ actor: target.actor }),
            flags: { [MODULE_ID]: { rollFor: player.id } } }, { messageMode: toMessageMode((checkRule("activeDefenceShow") as string) || "self") });
          return result;
        };
        // Asked through the request core (M5b): its deadline, the GM's "roll for them" from the player list, and on
        // time-out or disconnect the roll made for them (one way to answer, where there were a socket reply and a
        // chat listener with a timer each side)
        promises.push(requestPCActiveDefence(player, target.actor, this.item.name, getTokenDocument(target)?.uuid ?? undefined,
          { formula, rollOptions: options, bonus: dcMod, coverBonus, rollForThem, owner: this }));
      } else {  // must be a GM so can do the roll direct
        promises.push(
          new Promise(async (resolve) => {
            const result = await (new D20Roll(formula, {}, options)).evaluate();
            result.toMessage({ flavor: `${this.item.name} ${i18n("midi-qol.ActiveDefenceString")} ${options.criticalSuccess}/${options.criticalFailure}` }, { messageMode: toMessageMode(configSettings.optionalRules.activeDefenceShow) });
            // displayDSNForRoll(result, "attackRoll")
            resolve(result);
          })
        );
      }
    }
    if (debugEnabled > 1) debug("check saves: waiting for ", this.pendingSaves.keys())
    var results = await Promise.all(promises);
    let i = 0;
    for (let target of this.targets.tokens) {
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
          reaction = await this.askReactionsStep(target, this.tokenUuid, this.attackRoll, "reaction", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
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
          } = await this.askReactionsStep(target, this.tokenUuid, this.attackRoll, "reactionmissed", { activity: this.activity, item: this.item, workflow: this, workflowOptions });
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
      }
      if (game.user?.isGM) log(`Active defence: ${target.name} rolled ${rollTotal} vs attack DC ${this.activeDefenceDC}`, results[i]);
      i++;
    }
  }

  async displayAttackRoll() {
    const DCString = i18n("DND5E.AbbreviationDC") ?? "DC";
    const attackString = `<label class="midi-qol-active-defence-dc">${DCString} ${this.activeDefenceDC}</label> ${i18n("midi-qol.ActiveDefenceString")}`;
    const section = { label: attackString, html: "" };
    await this.setCardSection("attack", section);
  }
}
export class UserWorkflow extends Workflow {
  static get forceCreate() { return true; }
}

export class DamageOnlyWorkflow extends Workflow {
  static flowId = "midi-qol.damageOnly";
  /** @deprecated use itemCardUuid */
  get itemCard(): ChatMessage.Implementation | undefined {
    if (!deprecation("midi-qol | DamageOnlyWorkflow#itemCard is deprecated and will be removed in 14.8.0: use itemCardUuid.", { since: "14.6.9", until: "14.8.0", once: true })) return undefined;
    return this.itemCardUuid ? fromUuidSync(this.itemCardUuid) as ChatMessage.Implementation | undefined : undefined;
  }
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
      /** The damage is the workflow's other damage */
      useOther?: boolean,
      itemData: Item.Source,
      isCritical: boolean,
      item?: Item,
      storeWorkflow?: boolean
    }) {
    if (options.storeWorkflow === undefined) options.storeWorkflow = true;
    if (!actor) actor = token.actor ?? targets[0]?.actor;
    // A target with no canvas token (another level or scene) stays as its document
    const theTargets = Array.from(targets).map(t => getToken(t) ?? getTokenDocument(t)).filter(t => !!t);
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
    this.damageOnly = true;
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
    // On another workflow's card it has no card of its own: an id of its own tags the rolls it adds there (addedBy)
    if (this.itemCardUuid && this.itemCardUuid !== "new") this.id = foundry.utils.randomID();
    // Undo is kept by workflow id: one on its own card saves it once the card exists (WorkflowState_Start)
    if (configSettings.undoWorkflow && this.id) saveUndoData(this);
    this.useOther = options.useOther ?? false;
    this.ready = (this.useOther ? this.setOtherDamageRolls([damageRoll]) : this.setDamageRolls([damageRoll])).then(async () => {
      if (!this.useOther) this.damageTotal = damageTotal;
      this.isCritical = options.isCritical ?? false;
      this.suspended = false;
      await this.performState("midi-qol.Start");
    });
    return this;
  }
  static get forceCreate() { return false; }
  get otherDamageFlavor() {
    return this.useOther && this.flavor ? this.flavor : super.otherDamageFlavor;
  }
}

export class TrapWorkflow extends Workflow {
  static flowId = "midi-qol.trap";
  templateLocation: { x: number, y: number, direction?: number, removeDelay?: number } | undefined;
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
    super(actor, activity, speakerFor({ actor }), new Set(targets ?? []), { event, storeWorkflow: false });
    this.targetsPassedToConstructor = targets !== undefined;
    if (templateLocation) this.templateLocation = templateLocation;
    // Use fastForwardAttack/fastForwardDamage instead of shiftOnlyEvent to skip dialogs
    // Clear any event passed to constructor - it lacks target property that dnd5e's buildPost expects
    this.rollOptions.event = undefined;
    this.rollOptions.fastForwardAttack = true;
    this.rollOptions.fastForwardDamage = true;
    this.suspended = false;
    // Its targets go with its use, not through the player's (user-targets plan stage 2): a trap leaves those alone
    const targetsToUse = this.targetsPassedToConstructor && targets?.length ? new Set(targets) : undefined;
    // @ts-expect-error no dnd5e-types
    this.activity.use({ configure: false, workflow: this, midiOptions: { workflowOptions: this.workflowOptions, ...(targetsToUse ? { targetsToUse } : {}) } }, {}, {})
    // this.performState("midi-qol.Start");
    return this;
  }

  get workflowType() { return "TrapWorkflow" }

  override stateAfter(event: WorkflowEvent): WorkflowState {
    if (this.currentStep === "midi-qol.WaitForAttackRoll" && event === "attackRolled") return "midi-qol.AttackRollComplete";
    if (this.currentStep === "midi-qol.WaitForDamageRoll") return event === "damageRolled" ? "midi-qol.DamageRollComplete" : this.currentAction;
    return super.stateAfter(event);
  }
  setDescriptorACModifiers() {
    throw new Error("Method not implemented.");
  }

}

export class DummyWorkflow extends Workflow {
  static get forceCreate() { return false }
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
    return super.performState("midi-qol.Suspend");
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
    // A simulated attack spends no ammunition (dnd5e 6.1's arguments: the guard never matched with the old ones)
    const hookId = Hooks.on("dnd5e.rollAttack", (_rolls, { ammoUpdate, subject }) => {
      if (!ammoUpdate || !subject || !isRollOf(subject, this.activity)) return;
      // @ts-expect-error no dnd5e-types
      ammoUpdate.quantity = this.actor.items.get(ammoUpdate.id)?.system.quantity ?? ammoUpdate.quantity;
      ammoUpdate.destroy = false;
    });
    try {
      [this.attackRoll] = await this.activity.rollAttack?.({ midiOptions: { fastForward: true, chatMessage: false, isDummy: true, workflowOptions: this.workflowOptions } }, {}, {}) as Roll[];
    } catch (err) {
      TroubleShooter.recordError(err, "simulate attack");
    } finally {
      Hooks.off("dnd5e.rollAttack", hookId)
    }
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
  DummyWorkflow,
};

// The classes a card's workflow is rebuilt as: a damage-only workflow's card as a Workflow (its state says damage-only)
const RESTORABLE_WORKFLOWS: Record<string, typeof Workflow> = { Workflow, SavesFirstWorkflow, ActiveDefenceWorkflow, UserWorkflow, DamageOnlyWorkflow: Workflow };

// `options` arg for Workflow
type WorkflowConstructorOptions = InexactPartial<{
  chatCardUuid: string;
  readOnly: boolean;
  event: MouseEvent | KeyboardEvent;
  item: Item.Implementation;
  /** @deprecated since 14.6.9: has no effect */
  noOptionalRules: boolean;
  noTemplateHook: boolean;
  rollOptions: WorkflowRollOptions
  storeWorkflow: boolean;
  token: Token.Implementation;
  workflowOptions: WorkflowOptions
}>;


// `workflowOptions`
export type WorkflowOptions = InexactPartial<{
  advantage: boolean;
  /** Every die the use rolls shows this face (M25: tests, examples): "min", "average", "max" or a position 0–1 in the die's range */
  fixedDice: FixedDice;
  /** The activity's choices (M28), by id: not asked */
  choices: Record<string, ChoiceValue>;
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
  /** One target's use of an attack per target: its index among `count`, and the ammunition the first chose. */
  attackSplit: { index: number, count: number, ammunition?: string };
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
  /** This use's changes to its flow (steps/api.ts): the call layer, winning over modules' global changes */
  steps: StepChangeInput[];
  castUsesBonusAction: boolean;
  coverOrigin: { x: number, y: number, elevation?: number };
  templateUuid: string;
  preSelectedTargetUuids: string[];
  // UUID of the over-time effect that triggered this workflow, used by overtime processing.
  overTimeEffectUuid: string;
  /** An over-time effect's use (utils doOverTimeEffect); CAT reads it too */
  isOverTime: boolean;
  // A teleport's destinations, or "button" to leave a Plan: Auto teleport to the card's button.
  teleport: TeleportOption;
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
  /** Messages the use produced that aren't linked to its card (another module's rolls, a re-posted card) */
  chatCardUuids: string[];
  isReaction: boolean;
  /** When the GM started the entry (Date.now()): started entries whose use never finished are dropped */
  startedAt?: number;
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
/** unSuspend's (deprecated) argument */
type WorkflowContext = InexactPartial<{
  attackRoll: Roll;
  damageRoll: Roll;
  noDamage: boolean;
  otherDamageRoll: Roll;
  utilityRolls: Roll[];
}>;

type MidiMacroData = {
  actor?: Actor.Implementation;
  actorData?: Actor.Source;
  actorUuid?: string | null;
  advantage?: boolean;
  attackD20: number;
  attackRoll?: Roll;
  attackTotal: number;
  bonusDamageDetail?: DamageDescription[];
  bonusDamageRoll?: Roll;
  bonusDamageRolls?: Roll[];
  bonusDamageTotal?: number;
  castData: unknown;
  castLevel: number;
  criticalSaves: TokenDocument.Implementation[];
  criticalSaveUuids: (string | null)[];
  damageDetail?: DamageDescription[];
  damageList: DamageListEntry[];
  damageRoll?: Roll;
  damageRolls: Roll[];
  damageTotal: number;
  diceRoll: number;
  disadvantage?: boolean;
  event?: AugmentedEvent;
  failedSaves: TokenDocument.Implementation[];
  failedSaveUuids: (string | null)[];
  fumbleSaves: TokenDocument.Implementation[];
  fumbleSaveUuids: (string | null)[];
  hitTargets: TokenDocument.Implementation[];
  hitTargetsEC: TokenDocument.Implementation[];
  hitTargetUuids: (string | null)[];
  hitTargetUuidsEC: (string | null)[];
  /** The workflow's id (its card's uuid): undefined in a use's passes before its card exists */
  id: string | undefined;
  isCritical?: boolean;
  isFumble: boolean;
  item: Item.Source & { uuid?: string | null };
  itemCardUuid?: string;
  itemData: Item.Source & { uuid?: string | null };
  itemUuid?: string | null;
  macroPass?: string;
  options?: AnyObject;
  otherDamageDetail?: DamageDescription[];
  otherDamageTotal?: number;
  roll?: Roll;
  rollData: AnyObject;
  rollOptions: WorkflowRollOptions;
  saves: TokenDocument.Implementation[];
  saveUuids: (string | null)[];
  semiSuperSavers: TokenDocument.Implementation[];
  semiSuperSaverUuids: (string | null)[];
  sourceItemUuid?: string;
  speaker?: ChatMessage.SpeakerData;
  spellLevel: number;
  superSavers: TokenDocument.Implementation[];
  superSaverUuids: (string | null)[];
  tag?: string;
  targets: TokenDocument.Implementation[];
  targetUuids: (string | null)[];
  templateId?: string;
  templateUuid?: string;
  templateUuids?: string[];
  tokenUuid?: string | null;
  utilityRoll?: Roll;
  utilityRolls?: Roll[];
  uuid?: string;
  workflow: Workflow;
  workflowId: string | undefined;
  workflowOptions: WorkflowOptions;
}

export interface AugmentedEvent extends Event {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  type: string;
}

/** The natural roll of a die term: the sum of its kept dice, so a replacement die such as 2d10 counts as a whole. */
/** The active dice's faces, or with `counted` the values they count as (a minimum or maximum changes those) */
function activeDiceTotal(term: foundry.dice.terms.DiceTerm | undefined, counted = false): number | undefined {
  const active = term?.results?.filter(r => r.active);
  if (!active?.length) return undefined;
  return active.reduce((sum, r) => sum + Number(counted ? r.count ?? r.result : r.result), 0);
}

/**
 * damageModifiers contributor "midi-qol.targetedBonuses": a use's damage bonuses chosen for particular targets
 * (rollBonuses stage 9), each added to its targets' damage only.
 */
export const targetedDamageBonusContributor = {
  stage: "bonus" as const,
  for(query: { options: { midi?: { itemCardUuid?: string, targetUuid?: string } } }) {
    const midi = query.options?.midi;
    if (!midi?.itemCardUuid || !midi.targetUuid) return undefined;
    const workflow = Workflow.getWorkflow(midi.itemCardUuid);
    return workflow?.targetedDamageBonuses.filter(bonus => bonus.targets.includes(midi.targetUuid!))
      .map(bonus => ({ types: [bonus.type], amount: bonus.amount, label: bonus.label }));
  }
};
