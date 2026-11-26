import { tokenFor, tokenOf } from "../tokenResolver.js";
import { GameSystemConfig, MODULE_ID, i18n } from "../../../midi-qol.js";
import { preferredActiveGM } from "../../GMAction.js";
import { OnUseMacros } from "../../apps/Item.js";
import { applyReplacementEffect } from "../../Hooks.js";
import { TroubleShooter } from "../../apps/TroubleShooter.js";
import {
  buildOvertimeItemData, completeItemUse, createConditionData, doActivityOverTimeEffect, evalCondition, expireEffects,
  getEffectStackCount, getOrCreateTokenForActor, handleActionSaveDialog, handleActionSaveRollRequest,
  handleActionSaveRollResponse, overTimeRemoveConditionMet, parseOvertimeDetails, playerForActor, replaceAtFields,
  splitOvertimeSpec, type ActionSaveContext, type CountAction, type OvertimeDetails
} from "../../utils.js";
import type { Workflow } from "../../Workflow.js";
import { isUseEvent, useDamageAction } from "./useEvents.js";
import { useActivityAction } from "./triggerEntries.js";
import { actionRollAction, activityRollAction, byRollAction, isActivityRef } from "./activityActions.js";
import { originView } from "./conditionData.js";
import { applyingActivity, originActor, registerAction, registerEffectEntryReader, registerEvent, type ActionRun } from "./engine.js";
import type { Entry, EntryAction } from "./types.js";

/*
 * M15 stage 2, phase A: `flags.midi-qol.OverTime` read as entries (the key stays readable; the OverTime editor still
 * writes it). Each change becomes an entry on its turn event whose `save` action is the tick: today's behaviour
 * (apply and remove conditions, a permanent effect, stacks, the tick's item built from the spec, its card), and whose
 * `then`/`else` are the save and fail counts, kept where they always were (`flags.midi-qol.overtime`), so an effect
 * part-way through its count in a world keeps counting. Action saves (`actionSave=`) stay on the old path until stage
 * 2's second step. Phase B runs the tick on the applying activity's own card.
 */

/** A converted change's tick: the parsed spec, less what the entry carries (the turn, the counts) */
type Tick = Omit<OvertimeDetails, "turn" | "saveCount" | "failCount" | "actionSave"> & { multiplyByStacks: boolean };

function rollDataFor(actor: Actor.Implementation, effect: ActiveEffect.Implementation): Record<string, any> {
  const rollData: Record<string, any> = createConditionData({ actor, workflow: undefined, target: actor, effect });
  if (!rollData.flags) rollData.flags = actor.flags;
  rollData.flags.midiqol = rollData.flags[MODULE_ID];
  // A native entry's formulas read the applying use (@entry.origin.spellLevel, .dc)
  rollData.entry = { origin: originView(effect, applyingActivity(effect), originActor(effect)) };
  return rollData;
}

/** A count reached: the effect spec applied, then the effect ended or made permanent (the spec's `-`, `+`, `c`) */
function countActions(kind: "saves" | "fails", count: CountAction | undefined, other: CountAction | undefined): EntryAction[] {
  if (!count) return kind === "saves" ? [{ count: "saves", legacy: true }] : [];
  return [{ count: kind, legacy: true, max: count.count, mode: count.mode, effect: count.effectSpec,
    ...(other?.consecutive ? { reset: other.count } : {}) }];
}

/** An effect's OverTime changes as entries (stage 2 phase A); action saves are left to the old path */
export function overtimeEntries(effect: ActiveEffect.Implementation, actor: Actor.Implementation): Entry[] {
  const auraFlags = (effect.flags as { ActiveAuras?: { isAura?: boolean, ignoreSelf?: boolean } }).ActiveAuras ?? {};
  if (auraFlags.isAura && auraFlags.ignoreSelf) return [];
  // @ts-expect-error fvtt-types v14 ActiveEffect
  const changes = (effect.system.changes as { key: string, value: unknown }[]).filter(change => change.key.startsWith(`flags.${MODULE_ID}.OverTime`));
  if (!changes.length) return [];
  const rollData = rollDataFor(actor, effect);
  const entries: Entry[] = [];
  changes.forEach((change, index) => {
    const value = typeof change.value === "string" ? change.value : String(change.value ?? "");
    const details = parseOvertimeDetails(value, rollData, effect.name);
    if (!details) return;
    const multiplyByStacks = !(splitOvertimeSpec(value).damageRoll ?? "").includes("@stackCount");
    if (details.actionSave) {
      // Asked at the bearer's turn start, its cards cleared at turn end, a roll from its card answered (actionRoll)
      entries.push({ id: `overtime-${index}`, on: ["turnStart", "turnEnd", ACTION_ROLL], do: [{ actionSave: { ...details, multiplyByStacks } }] });
      return;
    }
    const { turn, saveCount, failCount, actionSave: _actionSave, ...rest } = details;
    const tick: Tick = { ...rest, multiplyByStacks };
    const counted = (saveCount || failCount) && details.saveDC > -1;
    entries.push({
      id: `overtime-${index}`,
      on: turn === "end" ? "turnEnd" : "turnStart",
      do: [{ save: tick, ...(counted ? {
        then: countActions("saves", saveCount, failCount),
        else: failCount ? countActions("fails", failCount, saveCount) : saveCount?.consecutive ? [{ count: "saves", legacy: true, reset: saveCount.count, only: "reset" }] : []
      } : {}) }]
    });
  });
  return entries;
}

/** An effect's ActivityOverTime changes as entries: each a use of the named activity at the turn it chooses */
export function activityOvertimeEntries(effect: ActiveEffect.Implementation): Entry[] {
  // @ts-expect-error fvtt-types v14 ActiveEffect
  const changes = (effect.system.changes as { key: string, value: unknown, priority?: number }[])
    .filter(change => change.key.startsWith(`flags.${MODULE_ID}.ActivityOverTime`))
    .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
  return changes.map((change, index) => ({ id: `activity-overtime-${index}`, on: ["turnStart", "turnEnd"], do: [{ use: String(change.value ?? "") }] }));
}

/** A player's roll from an action save's card (chatMessageHandling), answered by the effect's actionSave entry */
export const ACTION_ROLL = "overtime.actionRoll";

type TickKind = "save" | "check" | "damage";

/** A value or formula (`@entry.origin.dc`, `8 + @prof`) against the tick's roll data */
function numberFrom(value: unknown, rollData: Record<string, any>): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const result = Roll.safeEval(replaceAtFields(value, rollData, { blankValue: 0, maxIterations: 3 }));
    return typeof result === "number" && Number.isFinite(result) ? result : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The tick an action asks for. Converted OverTime carries its parsed spec. A native action:
 * - `{ save: "applying" }`: the applying activity's save, with the DC recorded when the effect was applied
 *   (castData.saveDC; the activity's current DC only when none was recorded);
 * - `{ save: { ability, dc } }`; `{ check: { ability, skill?: [...], dc } }`;
 * - `damage` (a formula), `type`, `onSave` ("half" | "none" | "full"), alone or with a save;
 * - `label`, `flavor`, `rollMode`, `killAnim`, `macro` for its card.
 */
function tickFor(kind: TickKind, action: Record<string, unknown>, effect: ActiveEffect.Implementation, rollData: Record<string, any>): Tick | undefined {
  const spec = action[kind];
  if (kind === "save" && spec && typeof spec === "object" && "rollType" in spec) return spec as Tick;
  const applying = applyingActivity(effect) as { item?: Item.Implementation, save?: { ability?: Set<string>, dc?: { value?: number } } } | undefined;
  let rollType: Tick["rollType"] = "damage";
  let abilities: string[] = [];
  let dc = -1;
  if (kind === "save" && (spec === "applying" || spec === true)) {
    rollType = "save";
    abilities = [...(applying?.save?.ability ?? [])];
    dc = effect.flags?.[MODULE_ID]?.castData?.saveDC ?? applying?.save?.dc?.value ?? -1;
  } else if ((kind === "save" || kind === "check") && spec && typeof spec === "object") {
    const given = spec as { ability?: string | string[], skill?: string | string[], dc?: unknown };
    const skills = [given.skill ?? []].flat();
    rollType = kind === "check" && skills.length ? "skill" : kind;
    abilities = skills.length && kind === "check" ? skills : [given.ability ?? []].flat();
    dc = numberFrom(given.dc, rollData) ?? -1;
  }
  if (kind !== "damage" && (!abilities.length || dc < 0)) {
    console.warn(`midi-qol | entry on ${effect.name}: its ${kind} has no ability or DC`, action);
    return undefined;
  }
  // @ts-expect-error item.type includes dnd5e subtypes
  const spell = applying?.item?.type === "spell";
  const onSave = action.onSave === "half" ? "halfdamage" : action.onSave === "full" ? "fulldamage" : "nodamage";
  const text = (key: string) => typeof action[key] === "string" ? action[key] as string : undefined;
  return {
    label: text("label") ?? effect.name, rollType, rollTypeString: rollType, saveAbility: abilities, saveAbilityString: abilities.join("|"),
    saveDC: dc, saveMagic: spell,
    // Its @entry.origin references resolved now: the tick's item has none of the effect's data
    damageRoll: text("damage")?.replace(/@entry\.origin\.(\w+)/g, (_, key: string) => String(rollData.entry?.origin?.[key] ?? 0)), damageType: text("type") ?? "", damageBeforeSave: false, saveDamage: onSave,
    allowIncapacitated: false, killAnim: !!action.killAnim, macro: text("macro"), chatFlavor: text("flavor") ?? "", rollMode: text("rollMode"),
    fastForwardDamage: true, fastForwardAttack: true, autoRollAttack: true, autoRollDamage: true, multiplyByStacks: false
  };
}

/** The last tick's use, still finishing: the next one starts after it */
let previousTick: Promise<void> = Promise.resolve();

/**
 * A tick's use on the bearer: its item built from the tick (on the applying item's card when that item still exists),
 * run as a use of its origin's (or the bearer's), the outcome taken at RollComplete; null if the use failed.
 */
async function runTickUse(actor: Actor.Implementation, effect: ActiveEffect.Implementation, tick: Tick, permanent: boolean): Promise<Workflow | undefined | null> {
  const details = { ...tick, turn: "start", saveCount: undefined, failCount: undefined, actionSave: undefined } as OvertimeDetails;
  const { itemData, activityData } = await buildOvertimeItemData({ actor, effect, details, label: tick.label, isPermanent: permanent });
  const target = tokenOf(tokenFor(actor, { create: true }))!;
  if (tick.damageRoll && activityData.damage?.parts?.[0]) {
    let formula = tick.damageRoll;
    if (tick.multiplyByStacks) for (let i = 1; i < getEffectStackCount(effect, target); i++) formula = `${formula} + ${tick.damageRoll}`;
    activityData.damage.parts[0].custom.formula = formula;
  }
  foundry.utils.setProperty(itemData.flags ??= {}, "midi-qol.forceCEOff", true);
  if (tick.killAnim) foundry.utils.setProperty(itemData.flags, "autoanimations.killAnim", true);
  if (tick.macro) {
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.onUseMacroName`, tick.macro);
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.onUseMacroParts`, new OnUseMacros(tick.macro));
  }
  let origin: unknown = fromUuidSync(effect.origin ?? "");
  while (origin && !(origin instanceof Actor)) origin = (origin as { parent?: unknown }).parent;
  // The applying item's card: its name and image, the entry's label on the activity
  const applyingItem = (applyingActivity(effect) as { item?: Item.Implementation } | undefined)?.item;
  if (applyingItem) {
    itemData.name = applyingItem.name;
    itemData.img = applyingItem.img;
    activityData.name = tick.label;
  }
  itemData.system.activities = { overtime: activityData };
  foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.syntheticItem`, true);
  const item = new CONFIG.Item.documentClass(itemData, { parent: origin instanceof Actor ? origin : actor });
  item.prepareData();
  // @ts-expect-error no dnd5e-types
  item.prepareFinalAttributes();
  // As the old path: the outcome is acted on when the use's rolls are complete (midi-qol.RollComplete), while the
  // use finishes; the next tick waits for this use to finish (one at a time)
  await previousTick;
  let hookId: number | undefined;
  const rollComplete = new Promise<Workflow | undefined>(resolve => {
    hookId = Hooks.on("midi-qol.RollComplete", async (done: Workflow) => {
      // The use clones the item (activity.use): matched by its id, a random one per tick
      if ((done.item?.id ?? done.activity?.item?.id) !== item.id) return;
      if (hookId !== undefined) Hooks.off("midi-qol.RollComplete", hookId);
      resolve(done);
    });
  });
  let workflow: Workflow | undefined;
  try {
    // As the old path built them (midi options it reads that MidiOptions doesn't declare)
    const midiOptions = {
      createWorkflow: true, configureDialog: false, saveDC: tick.saveDC,
      fastForwardAttack: tick.fastForwardAttack, fastForwardDamage: tick.fastForwardDamage,
      autoRollAttack: tick.autoRollAttack, autoRollDamage: tick.autoRollDamage ? "onHit" : "none",
      checkGMStatus: true, targetsToUse: new Set([target]), ignoreUserTargets: true,
      workflowOptions: { targetConfirmation: "none", isOverTime: true, allowIncapacitated: tick.allowIncapacitated, overTimeEffectUuid: effect.uuid ?? undefined }
    };
    const used = completeItemUse(item, { midiOptions }, { configure: false }, { rollMode: tick.rollMode as keyof CONFIG.Dice.RollModes | undefined, systemCard: false }) as Promise<Workflow | undefined>;
    previousTick = used.then(() => undefined, () => undefined);
    workflow = await Promise.race([rollComplete, used]);
  } catch (err) {
    TroubleShooter.recordError(err, "midi-qol | overtime tick | completeItemUse");
    console.warn("midi-qol | overtime tick | completeItemUse error", err);
    return null;
  } finally {
    if (hookId !== undefined) Hooks.off("midi-qol.RollComplete", hookId);
  }
  return workflow;
}

/**
 * The tick: a use on the bearer, on the applying item's card (its name and image, the entry's label) when that item
 * still exists, else on a card built from the spec as before; a save or a fail picks then/else.
 */
const tickAction = (kind: TickKind) => async ({ action, found, context }: ActionRun): Promise<{ success?: boolean } | void> => {
  const effect = found.document;
  if (!(effect instanceof ActiveEffect)) return;
  const actor = found.actor ?? context.actor;
  const rollData = rollDataFor(actor, effect);
  const tick = tickFor(kind, action, effect, rollData);
  if (!tick) return;
  if (tick.applyCondition) {
    const value = replaceAtFields(tick.applyCondition, rollData, { blankValue: 0, maxIterations: 3 });
    let applies = true;
    try {
      applies = !!await evalCondition(value, rollData, { async: true });
    } catch (err) {
      const message = `midi-qol | overtime tick | error evaluating the apply condition ${value} - assuming true`;
      TroubleShooter.recordError(err, message);
      console.warn(message, err);
    }
    if (!applies) return;
  }
  const permanent = !!effect.flags?.[MODULE_ID]?.overtime?.permanent;
  if (permanent && !tick.damageRoll && !tick.macro) {
    if (tick.removeCondition && await overTimeRemoveConditionMet(tick.removeCondition, rollData))
      await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
    return;
  }
  // Evaluated before the tick, applied after it
  const removeAfter = !!tick.removeCondition && await overTimeRemoveConditionMet(tick.removeCondition, rollData);
  const workflow = await runTickUse(actor, effect, tick, permanent);
  if (workflow === null) return;
  if (removeAfter) {
    await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
    return;
  }
  if (permanent || tick.saveDC <= -1 || !workflow) return;
  if (workflow.saves.count === 1) return { success: true };
  if (workflow.failedSaves.count === 1) return { success: false };
};

/**
 * A count: `{ count: "saves" | "fails", max, mode, effect, reset }`. Converted OverTime (`legacy`) counts down where it
 * always did (`flags.midi-qol.overtime.savesRemaining` / `failsRemaining`); reaching it applies `effect` (a status,
 * effect uuid or macro), then ends the effect (`mode: "remove"`) or makes it permanent. `reset`: a consecutive count of
 * the other kind starts again. `only: "reset"` resets without counting. No `max` on a save: the effect ends unless
 * permanent (a converted spec with only a fail count).
 */
async function count({ action, found, context }: ActionRun): Promise<void> {
  const effect = found.document;
  if (!(effect instanceof ActiveEffect)) return;
  const actor = (effect.parent instanceof Actor ? effect.parent : context.actor) as Actor.Implementation;
  const kind = action.count === "fails" ? "fails" : "saves";
  const field = `flags.${MODULE_ID}.overtime.${kind === "saves" ? "savesRemaining" : "failsRemaining"}`;
  const otherField = `flags.${MODULE_ID}.overtime.${kind === "saves" ? "failsRemaining" : "savesRemaining"}`;
  if (action.only === "reset") {
    const resetUpdate: Record<string, unknown> = { [field]: action.reset };
    await effect.update(resetUpdate);
    return;
  }
  const max = typeof action.max === "number" ? action.max : undefined;
  if (max === undefined) {
    if (!effect.flags?.[MODULE_ID]?.overtime?.permanent) await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
    return;
  }
  let remaining = foundry.utils.getProperty(effect, field) as number | undefined;
  remaining = (remaining ?? max) - 1;
  if (remaining <= 0) {
    if (typeof action.effect === "string" && action.effect) await applyReplacementEffect(actor, action.effect, effect);
    if (action.mode === "remove") await expireEffects(actor, [effect], { "expiry-reason": `midi-qol:overTime:${kind === "saves" ? "saveCount" : "failCount"}` });
    else {
      const permanentUpdate: Record<string, unknown> = { [`flags.${MODULE_ID}.overtime.permanent`]: true };
      await effect.update(permanentUpdate);
    }
    return;
  }
  const updates: Record<string, unknown> = { [field]: remaining, ...(typeof action.reset === "number" ? { [otherField]: action.reset } : {}) };
  await effect.update(updates);
}

/**
 * An action save (`actionSave=dialog|roll`): the bearer repeats the save by spending its action. Dialog: asked at its
 * turn start; roll: a prompt card at its turn start, the roll from it answered at actionRoll, the cards cleared at its
 * turn end. The effect's tick then runs without a save (the save is the action's), and a success ends the effect.
 * The old engine's per-change logic, unchanged.
 */
async function actionSave({ action, found, context, eventId }: ActionRun): Promise<void> {
  const effect = found.document;
  if (!(effect instanceof ActiveEffect)) return;
  const actor = found.actor ?? context.actor;
  const details = action.actionSave as OvertimeDetails & { multiplyByStacks: boolean };
  const isActionSave = eventId === ACTION_ROLL;
  const startTurn = eventId === "turnStart" || isActionSave;
  const endTurn = eventId === "turnEnd";
  const event = (context.event ?? {}) as { roll?: Roll, rollFlags?: Record<string, unknown> };
  const rollData = rollDataFor(actor, effect);
  if (details.applyCondition) {
    const value = replaceAtFields(details.applyCondition, rollData, { blankValue: 0, maxIterations: 3 });
    let applies = true;
    try {
      applies = !!await evalCondition(value, rollData, { async: true });
    } catch (err) {
      TroubleShooter.recordError(err, `midi-qol | action save | error evaluating the apply condition ${value} - assuming true`);
    }
    if (!applies) return;
  }
  const { turn, label, rollTypeString, saveAbilityString } = details;
  const changeTurnStart = turn === "start";
  const changeTurnEnd = turn === "end";
  const messageFlavor: Record<string, string> = {
    "save": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.saving-throw")}`,
    "check": `${GameSystemConfig.abilities[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.ability-check")}`,
    "skill": `${GameSystemConfig.skills[saveAbilityString]?.label ?? saveAbilityString} ${i18n("midi-qol.skill-check")}`
  };
  const rollTypeArray = (rollTypeString.includes("|") ? rollTypeString.split("|") : [rollTypeString]).map(s => s.trim().toLowerCase());
  if (endTurn) {
    for (const uuid of effect.getFlag(MODULE_ID, "overtimeChatCardUuids") ?? []) (fromUuidSync(uuid) as ChatMessage.Implementation | undefined)?.delete();
  }
  if (isActionSave && details.actionSave === "dialog") return;
  let owner: User.Implementation | null | undefined = playerForActor(actor) as User.Implementation | undefined ?? preferredActiveGM();
  if (!owner?.active) owner = preferredActiveGM();
  const ctx: ActionSaveContext = { actor, effect, details, owner, messageFlavor };
  if (details.actionSave === "dialog" && startTurn) {
    if (!await handleActionSaveDialog(ctx)) return;
  } else if (details.actionSave === "roll" && isActionSave && event.roll) {
    if (await handleActionSaveRollResponse(ctx, { saveToUse: event.roll, rollFlags: event.rollFlags }, rollTypeArray) !== undefined) return;
  } else if (details.actionSave === "roll" && startTurn) {
    if (await handleActionSaveRollRequest(ctx, changeTurnEnd) !== undefined) return;
  }
  const actionSaveSuccess = effect.flags?.[MODULE_ID]?.actionSaveSuccess;
  if (actionSaveSuccess === true && changeTurnEnd) {
    await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
    return;
  }
  if (!((endTurn && changeTurnEnd) || (startTurn && changeTurnStart))) return;
  // The save is the action's: the tick itself has none
  if (!details.damageRoll && !details.macro) {
    if (actionSaveSuccess || (details.removeCondition && await overTimeRemoveConditionMet(details.removeCondition, rollData)))
      await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
    return;
  }
  const { saveCount: _s, failCount: _f, actionSave: _a, turn: _t, ...tick } = details;
  // Evaluated before the tick, applied after it
  const removeAfter = !!details.removeCondition && await overTimeRemoveConditionMet(details.removeCondition, rollData);
  if (await runTickUse(actor, effect, tick, true) === null) return;
  if (actionSaveSuccess) await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime:actionSave" });
  else if (removeAfter) await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
}

/** ActivityOverTime: a use of the named activity (the applying item's, or by uuid), as it always ran */
async function activityUse(run: ActionRun): Promise<void> {
  const { action, found, context, eventId } = run;
  // At a use's event, an activity ref is a trigger (Trigger Activity, lib/entries/triggerEntries.ts)
  if (context.workflow && isActivityRef(action.use) && (isUseEvent(eventId) || eventId === "use.completed")) return useActivityAction(run);
  const effect = found.document;
  if (!(effect instanceof ActiveEffect) || (eventId !== "turnStart" && eventId !== "turnEnd")) return;
  await doActivityOverTimeEffect(found.actor ?? context.actor, effect, eventId === "turnStart", { onlyChange: String(action.use ?? "") });
}

export function registerOvertimeEntries() {
  registerEvent(ACTION_ROLL, { label: "The bearer rolls an action save from its card" });
  registerEffectEntryReader("midi-qol.activityOvertime", activityOvertimeEntries);
  registerAction("actionSave", actionSave);
  registerAction("use", activityUse);
  registerEffectEntryReader("midi-qol.overtime", overtimeEntries);
  // An activity ref uses that activity; at an action the taker rolls; otherwise an effect's tick
  const rollAction = (kind: "save" | "check") => (run: ActionRun) => isActivityRef(run.action[kind]) ? activityRollAction(run, kind)
    : run.action.by ? byRollAction(run, kind)
    : run.eventId === "action" ? actionRollAction(run, kind) : tickAction(kind)(run);
  registerAction("save", rollAction("save"), { priority: 10 });
  registerAction("check", rollAction("check"), { priority: 10 });
  // At a use event, damage the use deals; otherwise the tick's
  registerAction("damage", run => isUseEvent(run.eventId) ? useDamageAction(run, false) : tickAction("damage")(run));
  registerAction("count", count);
}
