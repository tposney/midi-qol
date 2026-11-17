import type { AnyMutableObject } from "fvtt-types/utils";
import type { Activity, ActivityUseConfiguration } from "../../globals.js";

/**
 * midi-next spike (option B): dnd5e's Activity#use runs unchanged; its synchronous preUseActivity hook cancels a midi
 * activity's use and midi starts the same use again, marked, after any async work. Off unless `enabled`.
 * `keepResult`: the cancelled call returns the relaunched use's result (only possible while midi still overrides use).
 */
export const useRelaunchSpike = {
  enabled: false,
  keepResult: false,
  log: [] as { event: string, activity: string, detail?: unknown }[]
};

const relaunches = new Map<string, Promise<unknown>>();

export function isRelaunched(usage: ActivityUseConfiguration | undefined): boolean {
  return !!usage?.useRelaunch?.relaunched;
}

type Use = (usage: object, dialog: object, message: object) => Promise<unknown>;

function realActivity(activity: Activity): Activity | undefined {
  const item = activity.item.actor?.items.get(activity.item.id ?? "");
  const activities: unknown = item && "activities" in item.system ? item.system.activities : undefined;
  if (!(activities instanceof Map)) return undefined;
  return activities.get(activity.id);
}

function onPreUseActivity(activity: Activity, usageConfig: AnyMutableObject & ActivityUseConfiguration, dialogConfig: AnyMutableObject, messageConfig: AnyMutableObject) {
  if (!useRelaunchSpike.enabled || !activity.isMidiActivity || isRelaunched(usageConfig)) return true;
  const real = realActivity(activity);
  const use: unknown = real?.use;
  if (!real || typeof use !== "function") {
    useRelaunchSpike.log.push({ event: "notRelaunchable", activity: activity.uuid });
    return true;
  }
  const relaunchUsage: ActivityUseConfiguration = { ...usageConfig, useRelaunch: { ...usageConfig.useRelaunch, relaunched: true } };
  useRelaunchSpike.log.push({ event: "cancelled", activity: activity.uuid, detail: { midiOptions: foundry.utils.deepClone(usageConfig.midiOptions ?? {}) } });
  const relaunch = (async () => {
    await Promise.resolve(); // the async pre-use work (reactions, GM round trips, macros) would run here
    useRelaunchSpike.log.push({ event: "relaunched", activity: real.uuid });
    return (use as Use).call(real, relaunchUsage, dialogConfig, messageConfig);
  })();
  const key = usageConfig.useRelaunch?.useKey;
  if (key) relaunches.set(key, relaunch);
  return false;
}

/** For the mixin's use(): the relaunch started by the call it just made, if dnd5e cancelled that call. */
export function takeRelaunch(useKey: string): Promise<unknown> | undefined {
  const relaunch = relaunches.get(useKey);
  relaunches.delete(useKey);
  return relaunch;
}

export function initUseRelaunch() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
}
