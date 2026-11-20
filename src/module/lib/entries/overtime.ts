import { MODULE_ID } from "../../../midi-qol.js";
import { OnUseMacros } from "../../apps/Item.js";
import { applyReplacementEffect } from "../../Hooks.js";
import { TroubleShooter } from "../../apps/TroubleShooter.js";
import {
  buildOvertimeItemData, completeItemUse, createConditionData, evalCondition, expireEffects, getEffectStackCount,
  getOrCreateTokenForActor, overTimeRemoveConditionMet, parseOvertimeDetails, replaceAtFields, splitOvertimeSpec,
  type CountAction, type OvertimeDetails
} from "../../utils.js";
import type { Workflow } from "../../Workflow.js";
import { registerAction, registerEffectEntryReader, type ActionRun } from "./engine.js";
import type { Entry, EntryAction } from "./types.js";

/*
 * M15 stage 2, phase A: `flags.midi-qol.OverTime` read as entries (the key stays readable; the OverTime editor still
 * writes it). Each change becomes an entry on its turn moment whose `save` action is the tick: today's behaviour
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
    if (!details || details.actionSave) return;
    const { turn, saveCount, failCount, actionSave: _actionSave, ...rest } = details;
    const tick: Tick = { ...rest, multiplyByStacks: !(splitOvertimeSpec(value).damageRoll ?? "").includes("@stackCount") };
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

/** The last tick's use, still finishing: the next one starts after it */
let previousTick: Promise<void> = Promise.resolve();

/** The tick: today's OverTime use, from the spec, on a card of its own; a save or a fail picks then/else */
async function overtimeTick({ action, found, context }: ActionRun): Promise<{ success?: boolean } | void> {
  const effect = found.document;
  if (!(effect instanceof ActiveEffect)) return;
  const actor = context.actor;
  const tick = action.save as Tick;
  const rollData = rollDataFor(actor, effect);
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
  const details = { ...tick, turn: "start", saveCount: undefined, failCount: undefined, actionSave: undefined } as OvertimeDetails;
  const { itemData, activityData } = await buildOvertimeItemData({ actor, effect, details, label: tick.label, isPermanent: permanent });
  const target = getOrCreateTokenForActor(actor)!;
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
    return;
  } finally {
    if (hookId !== undefined) Hooks.off("midi-qol.RollComplete", hookId);
  }
  if (removeAfter) {
    await expireEffects(actor, [effect], { "expiry-reason": "midi-qol:overTime" });
    return;
  }
  if (permanent || tick.saveDC <= -1 || !workflow) return;
  if (workflow.saves.count === 1) return { success: true };
  if (workflow.failedSaves.count === 1) return { success: false };
}

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

export function registerOvertimeEntries() {
  registerEffectEntryReader("midi-qol.overtime", overtimeEntries);
  registerAction("save", overtimeTick);
  registerAction("count", count);
}
