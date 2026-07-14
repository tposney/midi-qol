import { i18n } from "../../midi-qol.js";
import { safeGetGameSetting } from "../settings.js";
import { asyncHooksCall, asyncHooksCallAll } from "../utils.js";

//@ts-expect-error
const ActivityChoiceDialog = dnd5e.applications?.activity?.ActivityChoiceDialog;

// The post-hook choice list create() computed, keyed by item, so the dialog it opens reuses it in
// _prepareContext instead of re-running the filter + prune hook. Overwritten on each create(); the
// WeakMap lets entries be collected with their item.
const pendingChoices = new WeakMap();

export class MidiActivityChoiceDialog extends ActivityChoiceDialog {
  static get defaultOptions() {
    return super.getDefaultOptions();
  }

  /** The item's offerable activities after midi's usability filter and the module prune hook.
   *  Returns the surviving choice contexts ({id, name, img, sort}), sorted. Single source of truth
   *  for "which activities can be used" — shared by the dialog and the item-use entry points so the
   *  prompt-vs-autoselect-vs-skip decision matches exactly what the dialog would display. */
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

  /** Resolve the activity to use for an item, applying the prune hook exactly once:
   *  - 0 survivors  → null (caller should skip rolling the item)
   *  - 1 survivor   → that Activity directly, no dialog (unless chooseActivity forces the prompt)
   *  - 2+ survivors → render the picker and resolve to the chosen Activity (or null if dismissed) */
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
    // Reuse the list create() already computed (filter + prune hook fired once); only recompute if
    // the dialog was constructed by some path that didn't go through create().
    const activities = pendingChoices.get(this.item) ?? await MidiActivityChoiceDialog.getActivities(this.item);
    return {
      ...await super._prepareContext(options),
      controlHint,
      activities
    };
  }
}
