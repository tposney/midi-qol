/**
 * Follow-up buttons on a usage card: activities offered when another of the item's activities finishes, which the user
 * can run from the card or ignore. Nothing prompts and the workflow doesn't wait. An activity declares itself a follow-up
 * (midiProperties.followUp, with an optional condition and which creatures it runs at); automations offer any activity
 * with MidiQOL.addFollowUp. Each entry keeps its targets and whether the use was a critical, so it runs as the use left
 * them.
 */

import { MODULE_ID, debug } from "../midi-qol.js";
import { Activity } from "../globals.js";
import { completeActivityUse, evalActivationCondition } from "./utils.js";
import type { Workflow } from "./Workflow.js";

/** Update key for the card's follow-ups; a string, as the system fields are untyped. */
const FOLLOW_UPS: string = "system.midi.followUps";

export type FollowUpEntry = { activityUuid: string, label: string, targetUuids: string[], critical: boolean, used: boolean };

export const followUpTargetModes = ["default", "self", "targets", "hitTargets", "missedTargets", "failedSaves", "saveTargets"] as const;
export type FollowUpTargetMode = typeof followUpTargetModes[number];

/** Who a follow-up runs at. Default: the creatures hit by an attack, else all the targets. */
export function followUpTargets(workflow: Workflow, mode: FollowUpTargetMode | string = "default"): Set<Token.Implementation> {
  switch (mode) {
    case "self": return workflow.token ? new Set([workflow.token]) : new Set();
    case "targets": return new Set(workflow.targets);
    case "hitTargets": return new Set(workflow.hitTargets);
    case "missedTargets": return workflow.targets.difference(workflow.hitTargets);
    case "failedSaves": return new Set(workflow.failedSaves);
    case "saveTargets": return new Set(workflow.saves);
    default: return new Set(workflow.activity?.attack ? workflow.hitTargets : workflow.targets);
  }
}

function followUpsOf(message: ChatMessage.Implementation | undefined): FollowUpEntry[] {
  return foundry.utils.deepClone(foundry.utils.getProperty(message ?? {}, "system.midi.followUps") ?? []) as FollowUpEntry[];
}

/**
 * Offer an activity as a button on the workflow's card, run at `options.targets` (default: the creatures an attack hit,
 * else all the targets; none is allowed). Returns false if the card is missing or the activity is already offered.
 */
export async function addFollowUp(workflow: Workflow, activity: Activity, options: { label?: string, targets?: Iterable<Token.Implementation> } = {}): Promise<boolean> {
  const message = workflow.chatCard as ChatMessage.Implementation | undefined;
  if (!message || !activity?.uuid) return false;
  const targets = Array.from(options.targets ?? followUpTargets(workflow));
  const followUps = followUpsOf(message);
  if (followUps.some(entry => entry.activityUuid === activity.uuid)) return false;
  followUps.push({
    activityUuid: activity.uuid,
    label: options.label ?? activity.name ?? "",
    targetUuids: targets.map(token => token.document.uuid),
    critical: !!workflow.isCritical,
    used: false
  });
  await message.update({ [FOLLOW_UPS]: followUps });
  return true;
}

/**
 * The item's activities declared as follow-ups whose condition holds, offered once one of its other activities finishes.
 * One that would run at no one, after a use that had targets (an attack that missed, no failed save), isn't offered.
 */
export async function offerFollowUps(workflow: Workflow): Promise<void> {
  if (workflow.aborted) return;
  // @ts-expect-error no dnd5e-types
  const activities: Activity[] = workflow.item?.system.activities?.contents ?? [];
  for (const activity of activities) {
    if (activity === workflow.activity || !activity.midiProperties?.followUp) continue;
    const targets = followUpTargets(workflow, activity.midiProperties.followUpTargets);
    if (!targets.size && workflow.targets.size && activity.midiProperties.followUpTargets !== "self") continue;
    const condition = activity.midiProperties.followUpCondition;
    if (condition && !await evalActivationCondition(workflow, condition, targets.first(), { errorReturn: false, item: workflow.item })) continue;
    await addFollowUp(workflow, activity, { targets });
  }
}

/** Why the follow-up can't be used now (its item's or own uses are spent), or undefined. */
export function followUpUnavailable(activity: Activity | undefined): string | undefined {
  if (!activity) return "missing";
  const item = activity.item;
  for (const target of activity.consumption?.targets ?? []) {
    const need = Number(target.value) || 1;
    if (target.type === "itemUses") {
      const source = target.target ? item?.actor?.items.get(target.target) ?? item : item;
      // @ts-expect-error no dnd5e-types
      const uses: { max?: number, value: number } | undefined = source?.system.uses;
      if (uses?.max && uses.value < need) return "noUses";
    } else if (target.type === "activityUses") {
      if (activity.uses?.max && activity.uses.value < need) return "noUses";
    }
  }
  return undefined;
}

/** The card's follow-ups for rendering: unused ones, for the attacker's owners and the GM. */
export function followUpButtons(message: ChatMessage.Implementation): { index: number, label: string, disabled: boolean }[] {
  const followUps = followUpsOf(message);
  if (!followUps.length) return [];
  const actor = message.speakerActor;
  if (!game.user?.isGM && !actor?.isOwner) return [];
  return followUps.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.used)
    .map(({ entry, index }) => ({ index, label: entry.label, disabled: !!followUpUnavailable(fromUuidSync(entry.activityUuid) as Activity | undefined) }));
}

/** Run a card's follow-up at the stored targets (a critical as a critical), link its card to this one, mark it used. */
export async function runFollowUp(message: ChatMessage.Implementation, index: number): Promise<void> {
  const followUps = followUpsOf(message);
  const entry = followUps[index];
  if (!entry || entry.used) return;
  const activity = await fromUuid(entry.activityUuid) as Activity | null;
  if (!activity) return;
  const unavailable = followUpUnavailable(activity);
  if (unavailable) {
    ui.notifications?.warn(game.i18n?.format("midi-qol.FollowUp.Unavailable", { name: entry.label }) ?? entry.label);
    return;
  }
  // No targets means none, not the user's current ones.
  const usage = { midiOptions: { targetUuids: entry.targetUuids, ignoreUserTargets: true, isCritical: entry.critical, workflowOptions: { targetConfirmation: "none" } } };
  const workflow: Workflow | undefined = await completeActivityUse(activity, usage, { configure: false }, {});
  if (!workflow || workflow.aborted) return;
  const card = workflow.chatCard as ChatMessage.Implementation | undefined;
  const origin: string = "system.origin";
  if (card?.isOwner && !foundry.utils.getProperty(card, "_source.system.origin")) await card.update({ [origin]: message.id });
  followUps[index].used = true;
  if (message.isOwner) await message.update({ [FOLLOW_UPS]: followUps });
  else debug(`${MODULE_ID} | follow-up ${entry.label} used, but this user can't update ${message.id}`);
}
