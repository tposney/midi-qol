import { i18n } from "../../midi-qol.js";
import { safeGetGameSetting } from "../settings.js";
import { asyncHooksCall, asyncHooksCallAll } from "../utils.js";

//@ts-expect-error
const ActivityChoiceDialog = dnd5e.applications?.activity?.ActivityChoiceDialog;
export class MidiActivityChoiceDialog extends ActivityChoiceDialog {
  static get defaultOptions() {
    return super.getDefaultOptions();
  }
  // Only here to satisfy the linter
  static async create(...args) {
    return super.create(...args)
  }
  // Only here to satisfy the linter
  get item() {return super.item};

  // Only here to satisfy the linter
_prepareActivityContext(...args) { return super._prepareActivityContext(...args) }
  async _prepareContext(options) {
    let controlHint;
    if ( safeGetGameSetting("dnd5e", "controlHints") ) {
      controlHint = i18n("DND5E.Controls.Activity.FastForwardHint");
      controlHint = controlHint.replace(
        "<left-click>",
        `<img src="systems/dnd5e/icons/svg/mouse-left.svg" alt="${i18n("DND5E.Controls.LeftClick")}">`
      );
    }
    // Filter usable activities: exclude riders, automationOnly, and activities that fail visibility checks (canUse)
    const activities = this.item.system.activities
      .filter(a => a.canUse !== false)
      .filter(a => !this.item.flags.dnd5e?.riders?.activity?.includes(a.id))
      .filter(a => !a.midiProperties?.automationOnly)
      .map(this._prepareActivityContext.bind(this))
      .sort((a, b) => a.sort - b.sort);
    await asyncHooksCallAll("midi-qol.itemUseActivitySelect", {activities, item: this.item});
    return {
      ...await super._prepareContext(options),
      controlHint, 
      activities
    };
  }
}