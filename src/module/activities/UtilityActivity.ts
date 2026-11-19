import { adoptActivityType } from "./activityPrototype.js";
import { registerCardActions } from "./cardActions.js";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, i18n, warn, error, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { heldKeys } from "../lib/rollKeys.js";
import { areMidiKeysPressed, callActivityHooks, isAutoFastForward, setMessageTargets } from "../utils.js";
import { displayDSNForRoll } from "../utils.js";


export function setupUtilityActivity() {
  if (debugEnabled > 0) warn("MidiQOL | UtilityActivity | setupUtilityActivity | Called");

  adoptActivityType("utility");
  registerCardActions(["utility"], {
    rollFormula: cardRollFormula
  });
}



function cardRollFormula(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message?.uuid);
  const activity = workflow ? workflow.activityFor(this) : this;

  return activity.rollFormula?.({ event, workflow }, {}, {});
}

