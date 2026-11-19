import { adoptActivityType } from "./activityPrototype.js";
import { registerCardActions } from "./cardActions.js";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";


export function setupHealActivity() {
  if (debugEnabled > 0) warn("MidiQOL | HealActivity | setupHealActivity | Called");
  adoptActivityType("heal");
  registerCardActions(["heal"], {
    rollHealing: cardRollHealing
  });
}



function cardRollHealing(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({event, workflow}, {}, {});
}

