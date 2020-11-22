import { debug, error, debugEnabled } from "../midi-qol";
import { log } from "../midi-qol";

let modules = {"about-time": "0.0", 
              "betterrolls5e": "1.1", 
              "dice-so-nice": "0.0", 
              "itemacro": "1.0.0", 
              "lmrtfy": "0.9",
              "dae": "0.0"
            };
export let installedModules = new Map();

export let setupModules = () => {
  for (let name of Object.keys(modules)) { 
    installedModules.set(name,game.modules.get(name)?.data.version);
    installedModules.set(name, isNewerVersion(installedModules.get(name) || "0.0", modules[name]) && game.modules.get(name)?.active) 
    if (game.modules.get(name)?.data.version && !installedModules.get(name)) {
      if (game.modules.get(name)?.active)
        error(`midi-qol requires ${name} to be of version ${modules[name]} or later, but it is version ${game.modules.get(name).data.version}`);
      else console.warn(`module ${name} not active - some features disabled`)
    }
  }
  if (debugEnabled > 0)
    for (let module of installedModules.keys()) log(`module ${module} has valid version ${installedModules.get(module)}`)
}