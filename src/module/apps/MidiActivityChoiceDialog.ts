import { i18n } from "../../midi-qol.js";
import { safeGetGameSetting } from "../settings.js";
import { asyncHooksCallAll } from "../utils.js";
import { Activity } from "../../globals.js";
import { isAfterCast, isSpellRunning } from "../lib/afterCast.js";

//@ts-expect-error
const ActivityChoiceDialog = dnd5e.applications?.activity?.ActivityChoiceDialog;

// The post-hook choice list create() computed, keyed by item, so the dialog it opens reuses it in
// _prepareContext instead of re-running the filter + prune hook. Overwritten on each create(); the
// WeakMap lets entries be collected with their item.
const pendingChoices = new WeakMap();

/** dnd5e's context for one choice; `uses` from dnd5e 6.1 */
type ActivityChoiceContext = { id: string, name: string, img: string, sort: number, uses?: { value: number, max: number } | null,
  /** Used after its spell is cast (lib/afterCast); `running`: the spell is running */
  afterCast?: boolean, running?: boolean };

export class MidiActivityChoiceDialog extends ActivityChoiceDialog {
  declare _prepareActivityContext: (activity: Activity) => ActivityChoiceContext;
  declare element: HTMLElement;

  /** The item's offerable activities after midi's usability filter and the module prune hook.
   *  Returns the surviving choice contexts as dnd5e prepares them ({id, name, img, sort, uses}), sorted. Single source of truth
   *  for "which activities can be used" — shared by the dialog and the item-use entry points so the
   *  prompt-vs-autoselect-vs-skip decision matches exactly what the dialog would display. */
  static async getActivities(item: Item.Implementation) {
    // @ts-expect-error no dnd5e types — item.system.activities / item.flags.dnd5e aren't typed
    const all = [...item.system.activities];
    const activities = all
      .filter(a => a.canUse !== false && !a.isRider && !a.midiProperties?.automationOnly && !a.inProgress)
      // dnd5e's own context (6.1 adds the activity's uses); it reads nothing from the dialog
      .map(a => {
        const context = this.prototype._prepareActivityContext(a);
        return isAfterCast(a) ? { ...context, afterCast: true, running: isSpellRunning(item) } : context;
      })
      // After-cast activities last (their spell not running: greyed below "After casting")
      .sort((a, b) => Number(!!a.afterCast) - Number(!!b.afterCast) || a.sort - b.sort);
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

  /** After-cast activities: a divider before them, greyed while their spell isn't running (still usable) */
  async _onRender(context: { activities?: ActivityChoiceContext[] }, options: object) {
    await super._onRender(context, options);
    const after = (context.activities ?? []).filter(a => a.afterCast);
    if (!after.length) return;
    const element = this.element;
    after.forEach((a, index) => {
      const li = element.querySelector(`[data-activity-id="${a.id}"]`)?.closest("li");
      if (!li) return;
      if (!a.running) li.classList.add("midi-qol-after-cast-idle");
      if (index === 0) li.insertAdjacentHTML("beforebegin", `<li class="midi-qol-after-cast-divider">${i18n("midi-qol.AfterCast.Divider")}</li>`);
    });
  }
}
