import { adoptActivityType } from "./activityPrototype.js";
import { registerSheetExtras } from "./activitySheets.js";
import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";


export function setupForwardActivity() {
  if (debugEnabled > 0) warn("MidiQOL | ForwardActivity | setupForwardActivity | Called");
  adoptActivityType("forward");
  // Forward has no time or targeting: dnd5e's narrower activation part, which registers only the partials it uses
  registerSheetExtras("forward", { keepActivation: true });
}

