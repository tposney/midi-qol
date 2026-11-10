import { error, warn, log, debugEnabled, i18nFormat } from "../midi-qol.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";

export const DAE_REQUIRED_VERSION = "14.6.7";
export const USEFUL_MODULE_VERSIONS = {
  "about-time": "0.0",
  "ActiveAuras": "0.4.13",
  "anonymous": "0.0.0",
  "auraeffects": "1.3.4",
  "autoanimations": "3.2.991",
  "cat": "0.0.8",
  "chris-premades": "2.0.0",
  "condition-lab-triggler": "1.4",
  "dae": DAE_REQUIRED_VERSION,
  "dfreds-convenient-effects": "5.0.4",
  "dice-so-nice": "4.1.1",
  "epic-rolls-5e": "3.1.1",
  "flash-rolls-5e": "1.13.1",
  "gambits-premades": "2.0.1",
  "levels": "6.0.0",
  "levelsautocover": "5.0.1",
  "levelsvolumetrictemplates": "0.0.0",
  "lib-changelogs": "0.0.0",
  "lib-wrapper": "1.3.5",
  "magicitems": "4.0.0",
  "midi-item-showcase-community": "1.5",
  "monks-tokenbar": "1.0.55",
  "multilevel-tokens": "13.0.0",
  "perceptive": "3.2.1",
  "seasons-and-stars": "0.11.0",
  "simplecover5e": "1.3.1",
  "socketlib": "0.0",
  "tokencover": "0.6.0",
  "vision-5e": "3.0.6",
  "walledtemplates": "0.0.0",
  "wjmais": "0.0.0",
};
export let installedModules = new Map<string, boolean>();

export function getModuleVersion(moduleName: string): string {
  let modVer = game.modules.get(moduleName)?.version || "0.0.0";
  if (!/[0-9\.]+/.test(modVer)) {
    console.warn(`midi-qol | module ${moduleName} has unrecognised version ${modVer} using ${USEFUL_MODULE_VERSIONS[moduleName]} instead}`);
    modVer = USEFUL_MODULE_VERSIONS[moduleName];
  }
  return modVer;
}
export let setupModules = () => {
  for (let name of Object.keys(USEFUL_MODULE_VERSIONS)) {
    const modVer = getModuleVersion(name);
    const neededVer = USEFUL_MODULE_VERSIONS[name];
    const isValidVersion = foundry.utils.isNewerVersion(modVer, neededVer) || !foundry.utils.isNewerVersion(neededVer, modVer);
    if (!installedModules.get(name)) installedModules.set(name, game.modules.get(name)?.active && isValidVersion)
    if (!installedModules.get(name)) {
      if (game.modules.get(name)?.active) {
        const message = `midi-qol requires ${name} to be of version ${USEFUL_MODULE_VERSIONS[name]} or later, but it is version ${game.modules.get(name)?.version}`;
        error(message);
        TroubleShooter.recordError(new Error(message), message);
        // midi doesn't use it, so say so where the GM sees it
        const title = game.modules.get(name)?.title ?? name;
        Hooks.once("ready", () => {
          if (game.user?.isGM) ui.notifications?.warn(i18nFormat("midi-qol.ModuleTooOld", { title, version: game.modules.get(name)?.version ?? "?", required: USEFUL_MODULE_VERSIONS[name] }));
        });
      } else warn(`optional module ${name} not active - some features disabled`)
    }
  }
  if (debugEnabled > 0) {
    for (let module of installedModules.keys())
      log(`module ${module} has valid version ${installedModules.get(module)}`);
  }
}

export function dice3dEnabled() {
  // DSN's own check: the user's setting and its world rules (e.g. Disabled during combat)
  // @ts-expect-error no dsn types
  return Boolean(installedModules.get("dice-so-nice") && (game.dice3d?.isEnabled?.() ?? game.dice3d?.config?.enabled));
}

export function checkModules() { // this really should happen in TroubleShooter
  if (game.user?.isGM && !installedModules.get("socketlib")) {
    ui.notifications?.error("midi-qol.NoSocketLib", {permanent: true, localize: true});
  }
}
