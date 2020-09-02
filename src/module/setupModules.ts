import { debug } from "../midi-qol";
import { log } from "../midi-qol";

let modules = {"about-time": "0.0", 
              "betterrolls5e": "1.1", 
              "dynamiceffects": "0.0", 
              "dice-so-nice": "0.0", 
              "itemacro": "1.0.0", 
              "lmrtfy": "0.9",
              "maestro": "0.7.0"};
export let installedModules = new Map();

export let setupModules = () => {
  for (let name of Object.keys(modules)) { 
    installedModules.set(name,game.modules.get(name)?.data.version);
    installedModules.set(name, isNewerVersion(installedModules.get(name) || "0.0", modules[name]) && game.modules.get(name)?.active) 
  }
  if (debug || true)
    for (let module of installedModules.keys()) log(`module ${module} has valid version ${installedModules.get(module)}`)
}