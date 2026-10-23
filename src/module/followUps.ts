/**
 * Follow-up buttons on a usage card: activities offered after an attack hits, which the user can run from the card or
 * ignore. Nothing prompts and the workflow doesn't wait. An activity declares itself a follow-up of its item's attacks
 * (midiProperties.followUp, with an optional condition); automations offer any activity with MidiQOL.addFollowUp.
 * Each entry keeps the attack's hit targets and whether it was a critical, so it runs as the attack left them.
 */

import { MODULE_ID, debug } from "../midi-qol.js";
import { Activity } from "../globals.js";
import { completeActivityUse, evalActivationCondition } from "./utils.js";
import type { Workflow } from "./Workflow.js";

/** Update key for the card's follow-ups; a string, as the system fields are untyped. */
const FOLLOW_UPS: string = "system.midi.followUps";

export type FollowUpEntry = { activityUuid: string, label: string, targetUuids: string[], critical: boolean, used: boolean };

function followUpsOf(message: ChatMessage.Implementation | undefined): FollowUpEntry[] {
  return foundry.utils.deepClone(foundry.utils.getProperty(message ?? {}, "system.midi.followUps") ?? []) as FollowUpEntry[];
}

/**
 * Offer an activity as a button on the workflow's card, run at the workflow's hit targets. Returns false if the card or
 * the hit targets are missing, or the activity is already offered.
 */
export async function addFollowUp(workflow: Workflow, activity: Activity, options: { label?: string } = {}): Promise<boolean> {
  const message = workflow.chatCard as ChatMessage.Implementation | undefined;
  if (!message || !activity?.uuid || !workflow.hitTargets.size) return false;
  const followUps = followUpsOf(message);
  if (followUps.some(entry => entry.activityUuid === activity.uuid)) return false;
  followUps.push({
    activityUuid: activity.uuid,
    label: options.label ?? activity.name ?? "",
    targetUuids: Array.from(workflow.hitTargets).map(token => token.document.uuid),
    critical: !!workflow.isCritical,
    used: false
  });
  await message.update({ [FOLLOW_UPS]: followUps });
  return true;
}

/** The item's activities declared as follow-ups whose condition holds, offered once its attack hits. */
export async function offerFollowUps(workflow: Workflow): Promise<void> {
  if (workflow.aborted || !workflow.hitTargets.size || !workflow.activity?.attack) return;
  // @ts-expect-error no dnd5e-types
  const activities: Activity[] = workflow.item?.system.activities?.contents ?? [];
  for (const activity of activities) {
    if (activity === workflow.activity || !activity.midiProperties?.followUp) continue;
    const condition = activity.midiProperties.followUpCondition;
    if (condition && !await evalActivationCondition(workflow, condition, workflow.hitTargets.first(), { errorReturn: false, item: workflow.item })) continue;
    await addFollowUp(workflow, activity);
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
  const usage = { midiOptions: { targetUuids: entry.targetUuids, isCritical: entry.critical, workflowOptions: { targetConfirmation: "none" } } };
  const workflow: Workflow | undefined = await completeActivityUse(activity, usage, { configure: false }, {});
  if (!workflow || workflow.aborted) return;
  const card = workflow.chatCard as ChatMessage.Implementation | undefined;
  const origin: string = "system.origin";
  if (card?.isOwner && !foundry.utils.getProperty(card, "_source.system.origin")) await card.update({ [origin]: message.id });
  followUps[index].used = true;
  if (message.isOwner) await message.update({ [FOLLOW_UPS]: followUps });
  else debug(`${MODULE_ID} | follow-up ${entry.label} used, but this user can't update ${message.id}`);
}
