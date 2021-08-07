import { debug, error, debugEnabled } from "../midi-qol.js";
import { log } from "../midi-qol.js";

let modules = {"about-time": "0.0", 
              "betterrolls5e": "1.1.0", 
              "dice-so-nice": "4.1.1", 
              "itemacro": "1.0.0", 
              "lmrtfy": "0.9",
              "lib-wrapper": "1.3.5",
              "dae": "0.8.18",
              "combat-utility-belt": "1.3.8",
              "times-up": "0.1.2",
              "conditional-visibility": "0.0",
              "monks-tokenbar": "0.0",
              "socketlib": "0.0",
              "advanced-macros": "1.0",
              "dnd5e-helpers":  "2.0.5",
              "dfreds-convenient-effects": "1.8.0"
            };
export let installedModules = new Map();

export let setupModules = () => {
  for (let name of Object.keys(modules)) { 
    const modVer = game.modules.get(name)?.data.version || "0.0.0";
    const neededVer = modules[name];
    const isValidVersion = isNewerVersion(modVer, neededVer) || !isNewerVersion(neededVer, modVer) ;
    installedModules.set(name, game.modules.get(name)?.active && isValidVersion) 
    if (!installedModules.get(name)) {
      if (game.modules.get(name)?.active)
        error(`midi-qol requires ${name} to be of version ${modules[name]} or later, but it is version ${game.modules.get(name)?.data.version}`);
      else console.warn(`module ${name} not active - some features disabled`)
    }
  }
  if (debugEnabled > 0)
    for (let module of installedModules.keys()) log(`module ${module} has valid version ${installedModules.get(module)}`)
}

export function dice3dEnabled() {
  //@ts-ignore
  return installedModules.get("dice-so-nice") && game.dice3d.isEnabled();
}