import { MODULE_ID } from "../midi-qol.js";

/** The last CAT whose medkit can update an item that an earlier update in the same run deleted. */
const CAT_MEDKIT_FIX_MAX = "0.1.3";

/**
 * An item the medkit listed that is gone or going: deleted, or a cast activity's cached spell that dnd5e is replacing
 * because the activity now casts a different spell (its delete may not have landed yet).
 */
function isGone(item: Item.Implementation): boolean {
  const actor = item.parent;
  if (!(actor instanceof Actor)) return false;
  if (!actor.items.has(item.id ?? "")) return true;
  const cachedFor = item.getFlag("dnd5e", "cachedFor");
  if (typeof cachedFor !== "string") return false;
  const activity = fromUuidSync(cachedFor, { relative: actor, strict: false });
  // @ts-expect-error no dnd5e-types
  return activity?.spell?.uuid !== item._stats.compendiumSource;
}

/**
 * Temporary, while CAT <= CAT_MEDKIT_FIX_MAX is active: the medkit lists an actor's items before updating them, and
 * replacing an item with a cast activity can make dnd5e delete and recreate the activity's cached spell, so a listed
 * item may be gone when its turn comes. Updating it threw and stopped the run.
 */
function setupCATMedkitFix() {
  const module = game.modules.get("cat");
  const automationUtils = globalThis.cat?.utils.automationUtils;
  if (!module?.active || !automationUtils || foundry.utils.isNewerVersion(module.version ?? "0", CAT_MEDKIT_FIX_MAX)) return;
  const updateItem = automationUtils.updateItem;
  automationUtils.updateItem = async (item, options) => {
    if (isGone(item)) return;
    return updateItem.call(automationUtils, item, options);
  };
}

/**
 * CAT offers midi's sample items through its medkit. An item with `flags.cat.automation.version` automates the item
 * of the same identifier; demos and legacy copies have none and get a type no item has, so CAT never offers them.
 */
export function setupCATIntegration() {
  Hooks.once("catReady", async () => {
    setupCATMedkitFix();
    await globalThis.cat?.api.registerAutomationModule(MODULE_ID, {
      infoFetcherCallback: entry => entry.flags?.cat?.automation?.version ? {} : { type: "midi-qol-sample" }
    });
  });
}
