import { tokenFor, tokenOf } from "../lib/tokenResolver.js";
import { MidiActivity } from "./midiActivity.js";
import { TokenDocumentSet, memberCount } from "../lib/tokenDocumentSet.js";
import { ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { error } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { configSettings } from "../settings.js";
import { activityHasAreaTarget, activityTargetsSelf, getOrCreateTokenForActor, validTargetTokens, userTargetsKeepingUndrawn, updateUserTargets, isValidTarget } from "../utils.js";
import { preTemplateTargets, requiresTargetConfirmation } from "./activityHelpers.js";

/*
 * A use's targets: set up from the caller, the player and the activity; confirmed.
 * (M14: from MidiActivityMixin.ts, midi's activity class layer until then.)
 */

export async function setupTargets(activity: MidiActivity, config: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean> {
  if (!config.workflow) {
    const errMessage = "MidiQOL | MidiActivity | setupTargets | No workflow found";
    error(errMessage);
    TroubleShooter.recordError(new Error("No workflow found"), errMessage);
    return false;
  }
  const workflow = config.workflow;
  const hasTargetsToUse = memberCount(config.midiOptions?.targetsToUse) > 0 && !activityHasAreaTarget(activity);
  const isSelfTargetActivity = activityTargetsSelf(activity);
  // The player's targets are the use's targets only where the player decides (confirmation) or the use took the
  // player's targets: an automated use (given its targets) and self-targeting leave them alone (M2 stage 7)
  let syncUserTargets = false;
  if (!isSelfTargetActivity && (requiresTargetConfirmation(activity, config.midiOptions ?? {})
    || configSettings.enforceSingleWeaponTarget)) {
    syncUserTargets = true;
    // The confirmation dialog shows the player's targets: the given ones, when the use was given some
    if (hasTargetsToUse) {
      const given = config.midiOptions!.targetsToUse!;
      const tokenIds = (given instanceof TokenDocumentSet ? given.documents : Array.from(given)).map(t => (t as Token | TokenDocument).id).filter((id): id is string => !!id);
      updateUserTargets(tokenIds);
    }
    if (!(await preTemplateTargets(activity, config.midiOptions ?? {})))
      return false;
    // Confirmation was shown: the user's final selection, keeping given targets with no canvas token (it can't show them)
    workflow.setTargets(validTargetTokens(hasTargetsToUse ? userTargetsKeepingUndrawn(config.midiOptions!.targetsToUse) : new Set(game.user?.targets)));
  } else if (hasTargetsToUse) {
    // No confirmation needed — set workflow targets directly from the provided Set
    // to avoid race conditions with game.user.targets being changed by concurrent effects.
    workflow.setTargets(validTargetTokens(config.midiOptions!.targetsToUse!));
    // Given its targets: later states keep them rather than re-reading the user's, which another use can change meanwhile.
    workflow.workflowOptions.ignoreUserTargets = true;
  } else {
    // No targetsToUse and no confirmation — use current user targets or self-target.
    let selfTarget = activityTargetsSelf(activity);
    // @ts-expect-error no dnd5e-types
    if (activity.item.type === "tool" && !activity.target?.affects.type)
      selfTarget = true;
    if (!selfTarget) {
      // The use took the player's targets (unless told to ignore them)
      syncUserTargets = !config.midiOptions?.ignoreUserTargets;
      // Use the target snapshot captured at the start of use() (before any await points)
      // to avoid a race condition where concurrent workflows clear game.user.targets
      // via updateUserTargets([]) during async gaps.
      const snapshotUuids = config.midiOptions?.workflowOptions?.preSelectedTargetUuids;
      const ignoreUser = config.midiOptions?.ignoreUserTargets;
      const userTargets = snapshotUuids?.length ? new TokenDocumentSet(snapshotUuids) : ignoreUser ? new Set<Token.Implementation>() : new Set(game.user?.targets);
      workflow.setTargets(validTargetTokens(userTargets));
    } else {
      foundry.utils.setProperty(config, "midiOptions.workflowOptions.targetConfirmation", "none");
      let potentialTarget = tokenOf(tokenFor(activity.actor, { create: true }));
      workflow.setTargets(new Set());
      if (potentialTarget) workflow.setTargets(workflow.targets.add(potentialTarget));
    }
  }
  // remove selection of un-targetable targets TODO
  if (canvas.scene && syncUserTargets) {
    const tokensIdsToUse: Array<string | null> = workflow.targets.tokens.filter(t => isValidTarget(t)).map(t => t.id);
    updateUserTargets(tokensIdsToUse);
  }
  return true;
}

export async function confirmTargets(activity: MidiActivity): Promise<void> {
}
