import { i18n } from "../../midi-qol.js";
import { safeGetGameSetting } from "../settings.js";
import { asyncHooksCall, asyncHooksCallAll } from "../utils.js";

//@ts-expect-error
const ActivityChoiceDialog = dnd5e.applications?.activity?.ActivityChoiceDialog;

// One-shot handoff of create()'s choice list to the dialog it opens, so the prune hook fires once.
const pendingChoices = new WeakMap();

export class MidiActivityChoiceDialog extends ActivityChoiceDialog {
  /** Offerable activities after the usability filter and the prune hook, sorted. */
  static async getActivities(item: Item.Implementation) {
    // @ts-expect-error no dnd5e types — item.system.activities / item.flags.dnd5e aren't typed
    const all = [...item.system.activities];
    const riders: string[] = item.flags.dnd5e?.riders?.activity ?? [];
    const activities = all
      .filter(a => a.canUse !== false && !riders.includes(a.id) && !a.midiProperties?.automationOnly && !a.inProgress)
      .map(a => ({ id: a.id, name: a.name, img: a.img, sort: a.sort }))
      .sort((a, b) => a.sort - b.sort);
    // Modules may remove entries from `activities` to make them unavailable for this use.
    await asyncHooksCallAll("midi-qol.itemUseActivitySelect", { activities, item });
    return activities;
  }

  /** 0 survivors → null (skip the roll); 1 → that activity; 2+ (or chooseActivity) → the picker. */
  static async create(item: Item.Implementation, { chooseActivity, ...options }: { chooseActivity?: boolean } & Record<string, unknown> = {}) {
    const activities = await this.getActivities(item);
    if (activities.length === 0) return null;
    // @ts-expect-error no dnd5e types
    if (activities.length === 1 && !chooseActivity) return item.system.activities.get(activities[0].id);
    pendingChoices.set(item, activities);
    return super.create(item, options);
  }

  // Only here to satisfy the linter
  get item() { return super.item };

  async _prepareContext(options) {
    let controlHint;
    if ( safeGetGameSetting("dnd5e", "controlHints") ) {
      controlHint = i18n("DND5E.Controls.Activity.FastForwardHint");
      controlHint = controlHint.replace(
        "<left-click>",
        `<img src="systems/dnd5e/icons/svg/mouse-left.svg" alt="${i18n("DND5E.Controls.LeftClick")}">`
      );
    }
    // Recompute only when opened by a path that bypassed create().
    const activities = pendingChoices.get(this.item) ?? await MidiActivityChoiceDialog.getActivities(this.item);
    pendingChoices.delete(this.item);
    return {
      ...await super._prepareContext(options),
      controlHint,
      activities
    };
  }
}
