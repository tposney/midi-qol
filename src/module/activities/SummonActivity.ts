import { adoptActivityType } from "./activityPrototype.js";
import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { getTokenDocument } from "../utils.js";


export function setupSummonActivity() {
  if (debugEnabled > 0) warn("MidiQOL | SummonActivity | setupSummonActivity | Called");
  adoptActivityType("summon");
  //@ts-expect-error
  Hooks.on("dnd5e.summonToken", (activity, profile, tokenData, options) => {
    if (!activity.friendlySummon) return;
    const caster = getTokenDocument(activity.actor);
    if (caster) tokenData.disposition = caster.disposition;
  });
}

