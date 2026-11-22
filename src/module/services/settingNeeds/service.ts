import { defineService, entries, reportServiceProblem } from "../../api/services.js";
import { configSettings, safeGetGameSetting, safeSetGameSetting } from "../../settings.js";

/*
 * settingNeeds (contributors; M32b): the midi settings a module needs. The TroubleShooter lists each that isn't met as a
 * problem, with the module's reason and an Auto Fix, in place of a module keeping its own list of midi settings (CAT's
 * requiredSettings for midi-qol).
 *
 *   MidiQOL.services.register("settingNeeds", "my-module", {
 *     needs: () => [{ setting: "ConfigSettings.autoCheckHit", expected: value => value !== "none", fix: "all", why: "hits are checked by midi" }]
 *   });
 *
 * `setting`: a midi setting's key ("EnableWorkflow"), or "ConfigSettings.<key>" for one of the workflow settings.
 * `expected`: the value needed, or a test of the current value; omitted: the fix value.
 */

export interface SettingNeed {
  setting: string;
  expected?: unknown | ((value: unknown) => boolean);
  /** The value Auto Fix sets; none: no Auto Fix */
  fix?: unknown;
  /** Why the module needs it (shown with the problem) */
  why?: string;
  /** Shown in place of the setting's own name */
  label?: string;
}

export interface SettingNeedsContributor {
  needs(): readonly SettingNeed[] | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { settingNeeds: SettingNeedsContributor }
}

export function defineSettingNeedsService() {
  defineService<SettingNeedsContributor>("settingNeeds", {
    kind: "contributors",
    description: "The midi settings a module needs: listed in the TroubleShooter when not met, with an Auto Fix"
  });
}

const CONFIG_PREFIX = "ConfigSettings.";

export function currentSetting(setting: string): unknown {
  if (setting.startsWith(CONFIG_PREFIX)) return foundry.utils.getProperty(configSettings, setting.slice(CONFIG_PREFIX.length));
  return safeGetGameSetting("midi-qol", setting);
}

export async function setSetting(setting: string, value: unknown): Promise<void> {
  if (setting.startsWith(CONFIG_PREFIX)) {
    const stored = foundry.utils.deepClone(safeGetGameSetting("midi-qol", "ConfigSettings") ?? {});
    foundry.utils.setProperty(stored, setting.slice(CONFIG_PREFIX.length), value);
    await safeSetGameSetting("midi-qol", "ConfigSettings", stored);
  } else await safeSetGameSetting("midi-qol", setting, value);
}

export function needMet(need: SettingNeed, value: unknown): boolean {
  const expected = need.expected === undefined ? need.fix : need.expected;
  if (typeof expected === "function") return !!(expected as (value: unknown) => boolean)(value);
  return foundry.utils.objectsEqual({ v: value }, { v: expected });
}

/** Every contributor's needs that aren't met now */
export function unmetSettingNeeds(): { contributor: string, need: SettingNeed, value: unknown }[] {
  const unmet: { contributor: string, need: SettingNeed, value: unknown }[] = [];
  for (const { id, provider } of entries<SettingNeedsContributor>("settingNeeds")) {
    let needs: readonly SettingNeed[];
    try { needs = provider.needs() ?? []; }
    catch (err) { reportServiceProblem("settingNeeds", id, "needs() failed", err); continue; }
    for (const need of needs) {
      if (!need?.setting) continue;
      const value = currentSetting(need.setting);
      try { if (!needMet(need, value)) unmet.push({ contributor: id, need, value }); }
      catch (err) { reportServiceProblem("settingNeeds", id, `expected() failed for ${need.setting}`, err); }
    }
  }
  return unmet;
}
