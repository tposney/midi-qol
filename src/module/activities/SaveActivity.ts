import { adoptActivityType } from "./activityPrototype.js";
import { registerSheetExtras } from "./activitySheets.js";
import { registerCardActions } from "./cardActions.js";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, warn, i18n, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";


export function setupSaveActivity() {
  if (debugEnabled > 0) warn("MidiQOL | SaveActivity | setupSaveActivity | Called");
  adoptActivityType("save");
  registerCardActions(["save"], {
    rollDamage: cardRollDamage
  });
  registerSheetExtras("save", {
    effect: { template: "modules/midi-qol/templates/activity/save-effect.hbs",
      templates: ["modules/midi-qol/templates/activity/parts/save-extras.hbs", "modules/midi-qol/templates/activity/parts/save-damage.hbs"] },
    classes: ["save-activity", "damage-activity"],
    context: (_app, context) => { context.FriendlySaveOptions = friendlySaveOptions(); }
  });
}

/** The friendly-save choices on Save's and Check's sheets */
export const friendlySaveOptions = () => [
  { value: "default", label: i18n("midi-qol.SAVE.friendlySave.default") },
  { value: "friendlySuccess", label: i18n("midi-qol.SAVE.friendlySave.friendlySuccess") },
  { value: "friendlyFail", label: i18n("midi-qol.SAVE.friendlySave.friendlyFail") },
];



export function cardRollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow }, {}, {});
}

