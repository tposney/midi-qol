import type { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, warn } from "../../midi-qol.js";
import { heldKeys } from "../lib/rollKeys.js";
import { areMidiKeysPressed, callActivityHooks, displayDSNForRoll, isAutoFastForward, setMessageTargets } from "../utils.js";
import { Workflow } from "../Workflow.js";
import { dialogByProperty } from "./damage.js";

/*
 * midi's formula roll (M13): a libWrapper MIXED wrap (a roll blocked by midi-qol.preFormulaRoll is not made) on dnd5e's
 * UtilityActivity#rollFormula, in place of the method
 * graft.ts installed. Without a workflow it is dnd5e's roll (it used to log an error and not roll).
 */

type RollFormula = (config?: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig) => Promise<Roll[] | undefined>;

async function rollFormulaWrapper(this: Activity, wrapped: RollFormula, config: RollProcessConfig = {}, dialog: RollDialogConfig = {}, message: RollMessageConfig = {}): Promise<Roll[] | void | undefined> {
  config ??= {};
  dialog ??= {};
  message ??= {};
  if (debugEnabled > 0) warn("rollFormula | Called", config, dialog, message);
  const workflow = config.workflow as Workflow | undefined;
  if (!workflow) {
    // No use given (a macro, another module): this user's use waiting for its formula roll takes it, as its card's button
    const waiting = Workflow.awaitingRoll(this, "utility");
    if (waiting) return waiting.activityFor(this).rollFormula?.({ event: config.event, workflow: waiting }, {}, {});
    return wrapped(config, dialog, message);
  }
  config.midiOptions ??= {};
  config.midiOptions.fastForwardDamage ??= isAutoFastForward("damage", { workflow });
  if (await callActivityHooks(this, "midi-qol.preFormulaRoll", workflow) === false) {
    console.warn("midi-qol | UtilityActivity | Formula roll blocked via pre-hook");
    return;
  }
  const keys = heldKeys(config.event);
  // A held key shows the dialog unless Force damage dialog is "never" (as for damage; it used to test "always")
  if (keys.normal || keys.advantage || keys.disadvantage) dialog.configure = this.midiProperties?.forceDamageDialog !== "never";
  else if (dialog.configure === undefined) dialog.configure = dialogByProperty(this, config);
  if (workflow.rollOptions?.rollToggle) dialog.configure = !dialog.configure;
  const rollToggle = areMidiKeysPressed(config.event, "RollToggle");
  workflow.rollOptions.rollToggle = rollToggle;
  if (rollToggle) dialog.configure = !dialog.configure;
  const raisedWait = dialog.configure ? workflow.ensureRollWait("utility") : false;
  message.create ??= false;
  message = setMessageTargets(message, workflow);
  const result = await wrapped(config, dialog, message);
  if (result && raisedWait) workflow.endRollWait();
  if (result && workflow.workflowOptions?.formulaDSN !== false) await displayDSNForRoll(result[0], "formulaD20", undefined, undefined, workflow.actor);
  if (config.midiOptions.updateWorkflow !== false) {
    if (result) await workflow.setUtilityRolls(result);
    workflow.resume(result ? "utilityRolled" : undefined);
  }
  return result;
}

type Placement = { prototypeToken: unknown, x: number, y: number, elevation: number, rotation: number, index: { total: number, unique: number } };
type GetPlacement = (token: TokenDocument.Implementation, profile: unknown, options?: SummonPlacementOptions) => Promise<Placement[]>;
interface SummonPlacementOptions { placements?: { x: number, y: number, elevation?: number, rotation?: number }[], creatureSize?: string }

/** Fixed placements (`use({ summons: { placements } })`) instead of dnd5e's interactive placement: a MIXED wrap on SummonActivity#getPlacement */
async function getPlacementWrapper(this: Activity, wrapped: GetPlacement, token: TokenDocument.Implementation, profile: unknown, options?: SummonPlacementOptions): Promise<Placement[]> {
  if (!options?.placements?.length) return wrapped(token, profile, options);
  // Creature size overrides, as dnd5e's
  // @ts-expect-error no dnd5e-types
  if (this.creatureSizes.size) {
    // @ts-expect-error no dnd5e-types
    const size: string = this.creatureSizes.has(options.creatureSize) ? options.creatureSize : this.creatureSizes.first();
    const config = CONFIG.DND5E.actorSizes[size];
    if (config) token = token.clone({ width: config.token ?? 1, height: config.token ?? 1 });
  }
  // @ts-expect-error no dnd5e-types
  const elevation: number = this.getUsageToken()?.elevation ?? 0;
  return options.placements.map((p, i) => ({
    prototypeToken: token, x: p.x, y: p.y, elevation: p.elevation ?? elevation, rotation: p.rotation ?? 0, index: { total: i, unique: i }
  }));
}

type LibWrapperRegister = { register(packageId: string, target: string, fn: (...args: never[]) => unknown, type: string): unknown };

/** midi's formula roll and fixed summon placements on dnd5e's classes; once, from setupActivities */
export function installFormulaAndPlacement(): void {
  const libWrapper = (globalThis as { libWrapper?: LibWrapperRegister }).libWrapper;
  libWrapper?.register("midi-qol", "CONFIG.DND5E.activityTypes.utility.documentClass.prototype.rollFormula", rollFormulaWrapper, "MIXED");
  libWrapper?.register("midi-qol", "CONFIG.DND5E.activityTypes.summon.documentClass.prototype.getPlacement", getPlacementWrapper, "MIXED");
}
