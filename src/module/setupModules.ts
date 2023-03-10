import { error, debugEnabled, i18n } from "../midi-qol.js";
import { log } from "../midi-qol.js";
import { configSettings } from "./settings.js";

const modules = {
  "about-time": "0.0", 
  "anonymous": "0.0.0",
  "combat-utility-belt": "1.3.8",
  "dae": "10.0.9",
  "ddb-game-log": "0.0.0",
  "df-templates": "1.0.0",
  "dfreds-convenient-effects": "4.1.0",
  "dice-so-nice": "4.1.1", 
  "itemacro": "1.0.0", 
  "levels": "3.0.6", 
  "levelsautocover": "1.4",
  "levelsvolumetrictemplates": "0.0.0",
  "lib-changelogs": "0.0.0",
  "lib-wrapper": "1.3.5",
  "lmrtfy": "3.1.2",
  "monks-tokenbar": "1.0.55",
  "multilevel-tokens": "1.6.0",
  "ready-set-roll-5e": "1.2.0",
  "simbuls-cover-calculator":  "1.0.2",
  "socketlib": "0.0",
  "times-up": "0.1.2",
  "walledtemplates": "0.0.0",
  "wjmais": "0.0.0",
};
export let installedModules = new Map();

export let setupModules = () => {
  for (let name of Object.keys(modules)) { 
    //@ts-ignore .version v10
    const modVer = game.modules.get(name)?.version || "0.0.0";
    const neededVer = modules[name];
    const isValidVersion = isNewerVersion(modVer, neededVer) || !isNewerVersion(neededVer, modVer);
    if (!installedModules.get(name)) installedModules.set(name, game.modules.get(name)?.active && isValidVersion) 
    if (!installedModules.get(name)) {
      if (game.modules.get(name)?.active) {
        //@ts-ignore game.module.version
        error(`midi-qol requires ${name} to be of version ${modules[name]} or later, but it is version ${game.modules.get(name)?.version}`);
        if (name === "dfreds-convenient-effects") ui.notifications?.warn(`You must upgrade convenient effects t0 4.0.2 or later`, {permanent: true});
      } else console.warn(`midi-qol | module ${name} not active - some features disabled`)
    }
  }
  if (debugEnabled > 0) {
    for (let module of installedModules.keys()) 
      log(`module ${module} has valid version ${installedModules.get(module)}`);
  }
}

export function dice3dEnabled() {
  //@ts-ignore
  // return installedModules.get("dice-so-nice") && game.dice3d?.isEnabled();
  return installedModules.get("dice-so-nice") && (game.dice3d?.config?.enabled || game.dice3d?.isEnabled());
}

export function checkModules() {
  if (game.user?.isGM && !installedModules.get("socketlib")) {
    //@ts-ignore expected one argument but got 2
    ui.notifications.error("midi-qol.NoSocketLib", {permanent: true, localize: true});
  }
  //@ts-ignore
  const midiVersion = game.modules.get("midi-qol").version;
  const notificationVersion = game.settings.get("midi-qol", "notificationVersion");

  checkCubInstalled();
}

export function checkCubInstalled() {
  return;
  if (game.user?.isGM && configSettings.concentrationAutomation && !installedModules.get("combat-utility-belt")) {
    let d = new Dialog({
      // localize this text
      title: i18n("midi-qol.confirm"),
      content: i18n("midi-qol.NoCubInstalled"), 
      buttons: {
          one: {
              icon: '<i class="fas fa-check"></i>',
              label: "OK",
              callback: ()=>{
                configSettings.concentrationAutomation = false;
              }
          }
      },
      default: "one"
    })
    d.render(true);
  }
}
