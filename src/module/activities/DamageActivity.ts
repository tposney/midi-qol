import { adoptActivityType } from "./activityPrototype.js";
import { registerCardActions } from "./cardActions.js";
import { AnyMutableObject } from "fvtt-types/utils";
import { Activity } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";


export function setupDamageActivity() {
  if (debugEnabled > 0) warn("MidiQOL | DamageActivity | setupDamageActivity | Called");
  adoptActivityType("damage");
  registerCardActions(["damage"], {
    rollDamage: cardRollDamage
  });
}



function cardRollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  activity.rollDamage({ event, workflow }, {}, {});
}

