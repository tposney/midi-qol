import { MODULE_ID } from "../../midi-qol.js";
import type { Activity, ActivityUseConfiguration, RollMessageConfig } from "../../globals.js";
import { activityPolicy, onActivityTypeAdopted } from "./activityPrototype.js";
import { economyChecks } from "./useChecks.js";
import type { MidiActivity } from "./midiActivity.js";
import { applyUseOptions, hasUseOptions, refundUseOptions, renderUseOptions } from "../services/useOptions/registry.js";

/*
 * M27: midi's work after dnd5e's usage dialog, before anything is consumed. dnd5e's use runs _prepareUsageScaling right
 * after the dialog (or where it would be), on the use's own item copy, and the card and consumption use the activity it
 * leaves; so what depends on what the player chose there runs here: the chosen use options are applied and paid, then
 * the bonus action and reaction checks (deferred by prepareUse). A refusal stops the use at
 * dnd5e.preActivityConsumption, before any cost is spent (the options' costs refunded).
 */

type ScalingConfig = ActivityUseConfiguration & { midiAfterDialog?: boolean, midiStopUse?: boolean };
type ItemCopy = Item.Implementation & { system: { activities: { get(id: string): Activity | undefined } } };

/** The use's activity once the dialog is answered: the copy's checks; false stops the use */
async function afterUseDialog(activity: MidiActivity, usageConfig: ScalingConfig, item: ItemCopy): Promise<boolean> {
  const workflow = usageConfig.workflow;
  if (!workflow) return true;
  const actor = activity.actor as Actor.Implementation | undefined;
  if (actor && !await applyUseOptions({ activity, item, actor, workflow, usageConfig })) return false;
  const deferred = workflow.deferredEconomy;
  if (!deferred) return true;
  workflow.deferredEconomy = undefined;
  if (await economyChecks(activity, deferred.usage, deferred.options)) return true;
  await refundUseOptions(workflow);
  return false;
}

export function installAfterUseDialog() {
  onActivityTypeAdopted(type => {
    if (activityPolicy(type).useRestart === false) return;
    globalThis.libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._prepareUsageScaling`,
      async function (this: Activity, wrapped: (...args: unknown[]) => Promise<unknown>, usageConfig: ScalingConfig, messageConfig: RollMessageConfig, item: ItemCopy) {
        const result = await wrapped(usageConfig, messageConfig, item);
        // Once per use (a type that inherits another's method is wrapped twice)
        if (!usageConfig?.workflow || usageConfig.midiAfterDialog) return result;
        usageConfig.midiAfterDialog = true;
        const activity = (item?.system.activities.get(this.id as string) ?? this) as MidiActivity;
        if (!await afterUseDialog(activity, usageConfig, item)) usageConfig.midiStopUse = true;
        return result;
      }, "WRAPPER");
    // A use with options to choose shows dnd5e's dialog for them, even with nothing else to configure
    globalThis.libWrapper.register(MODULE_ID, `CONFIG.DND5E.activityTypes.${type}.documentClass.prototype._requiresConfigurationDialog`,
      function (this: Activity, wrapped: (...args: unknown[]) => boolean, usageConfig: ActivityUseConfiguration, ...rest: unknown[]) {
        return wrapped(usageConfig, ...rest) || hasUseOptions(usageConfig?.workflow);
      }, "WRAPPER");
  });
  Hooks.on("renderActivityUsageDialog" as never, ((app: Parameters<typeof renderUseOptions>[0]) => renderUseOptions(app)) as never);
}

/** dnd5e.preActivityConsumption: a use the checks after the dialog refused stops here, before any cost */
export function stoppedAfterDialog(usageConfig: ActivityUseConfiguration): boolean {
  return !!(usageConfig as ScalingConfig).midiStopUse;
}
