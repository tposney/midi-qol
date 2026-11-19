import { adoptActivityType } from "./activityPrototype.js";
import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";


export function setupEnchantActivity() {
  if (debugEnabled > 0) warn("MidiQOL | EnchantActivity | setupEnchantActivity | Called");
  adoptActivityType("enchant");
}


// The effect part is dnd5e's own: midi's copy of the template included a partial dnd5e 6 removed.