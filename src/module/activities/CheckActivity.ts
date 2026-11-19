import { adoptActivityType } from "./activityPrototype.js";
import { registerSheetExtras } from "./activitySheets.js";
import { registerCardActions } from "./cardActions.js";
import { cardRollDamage, friendlySaveOptions } from "./SaveActivity.js";
import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, warn } from "../../midi-qol.js";
import { autoCheckSavesOptions } from "../settings.js";


export function setupCheckActivity() {
  if (debugEnabled > 0) warn("MidiQOL | CheckActivity | setupCheckActivity | Called");
  adoptActivityType("check");
  registerCardActions(["check"], {
    rollDamage: cardRollDamage
  });
  registerSheetExtras("check", {
    effect: { template: "modules/midi-qol/templates/activity/check-effect.hbs", templates: [
      "modules/midi-qol/templates/activity/parts/save-extras.hbs", "modules/midi-qol/templates/activity/parts/save-damage.hbs",
      "systems/dnd5e/templates/activity/parts/damage-part.hbs", "systems/dnd5e/templates/activity/parts/damage-parts.hbs"] },
    context: (_app, context) => {
      context.FriendlySaveOptions = friendlySaveOptions();
      context.onSaveOptions = [
        { value: "none", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.None") },
        { value: "half", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Half") },
        { value: "full", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Full") }
      ];
      context.SaveDisplayOptions = [{ value: "default", label: i18n("Default") },
        ...Object.entries(autoCheckSavesOptions).filter(([value]) => value !== "none").map(([value, label]) => ({ value, label }))];
    }
  });
}



