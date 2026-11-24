import { MODULE_ID } from "../../midi-qol.js";
import type { Activity, ActivityUseConfiguration, RollMessageConfig } from "../../globals.js";
import { activityPolicy, onActivityTypeAdopted } from "./activityPrototype.js";
import { economyChecks } from "./useChecks.js";
import type { MidiActivity } from "./midiActivity.js";

/*
 * M27: midi's work after dnd5e's usage dialog, before anything is consumed. dnd5e's use runs _prepareUsageScaling right
 * after the dialog (or where it would be), on the use's own item copy, and the card and consumption use the activity it
 * leaves; so the checks that depend on what the player chose there run here: the bonus action and reaction checks
 * (deferred by prepareUse). A refusal stops the use at dnd5e.preActivityConsumption, before any cost is spent.
 */

type ScalingConfig = ActivityUseConfiguration & { midiAfterDialog?: boolean, midiStopUse?: boolean };
type ItemCopy = Item.Implementation & { system: { activities: { get(id: string): Activity | undefined } } };

/** The use's activity once the dialog is answered: the copy's checks; false stops the use */
async function afterUseDialog(activity: MidiActivity, usageConfig: ScalingConfig): Promise<boolean> {
  const workflow = usageConfig.workflow;
  const deferred = workflow?.deferredEconomy;
  if (!workflow || !deferred) return true;
  workflow.deferredEconomy = undefined;
  return economyChecks(activity, deferred.usage, deferred.options);
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
        if (!await afterUseDialog(activity, usageConfig)) usageConfig.midiStopUse = true;
        return result;
      }, "WRAPPER");
  });
}

/** dnd5e.preActivityConsumption: a use the checks after the dialog refused stops here, before any cost */
export function stoppedAfterDialog(usageConfig: ActivityUseConfiguration): boolean {
  return !!(usageConfig as ScalingConfig).midiStopUse;
}
