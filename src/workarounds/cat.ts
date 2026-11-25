import { addNotes } from "../module/catMacros/automationNotes.mjs";

/*
 * CAT (Coven's Automation Toolkit): two workarounds, installed when CAT is ready.
 * - Cast activities (CAT <= 0.1.8): its getOriginActivitySync throws for an item with a cast activity.
 * - Notes on items not on an actor: CAT fires its medkit event only for actor items.
 */

/** The last CAT whose getOriginActivitySync reads `effects` on a cast activity, which has none on dnd5e 6. */
const CAT_CAST_ACTIVITY_FIX_MAX = "0.1.8";

/**
 * Temporary, while CAT <= CAT_CAST_ACTIVITY_FIX_MAX is active: CAT's getOriginActivitySync looks for the activity holding an
 * effect's origin effect with `activity.effects.some(...)`, but a cast activity has no effects (dnd5e 6), so an item
 * with one (the Jewel of Three Prayers) made every effect pointing at it (its aura's copies) throw in CAT's
 * preCreateActiveEffect hook, thousands of times with Aura Effects.
 */
function castActivityOrigin() {
  const module = game.modules.get("cat");
  const effectUtils = globalThis.cat?.utils.effectUtils;
  if (!module?.active || !effectUtils || foundry.utils.isNewerVersion(module.version ?? "0", CAT_CAST_ACTIVITY_FIX_MAX)) return;
  const getOriginActivitySync = effectUtils.getOriginActivitySync;
  effectUtils.getOriginActivitySync = (effect) => {
    try {
      return getOriginActivitySync.call(effectUtils, effect);
    } catch {
      const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
      if (!(origin instanceof ActiveEffect) || !(origin.parent instanceof Item)) return undefined;
      // @ts-expect-error no dnd5e-types
      return origin.parent.system.activities?.find(activity => activity.effects?.some(e => e._id === origin.id));
    }
  };
}

/**
 * CAT fires its medkit event (where midi's automation-notes macro re-adds an automation's notes block) only for items on
 * an actor; for a sidebar or compendium item midi adds the notes after the medkit applies the automation.
 */
function actorlessNotes() {
  const automationUtils = globalThis.cat?.utils.automationUtils;
  if (!automationUtils) return;
  const updateItem = automationUtils.updateItem;
  automationUtils.updateItem = async (item, options) => {
    const result = await updateItem.call(automationUtils, item, options);
    if (!item.actor) await addNotes({ document: item });
    return result;
  };
}

export function installCAT(): void {
  Hooks.once("catReady", () => {
    castActivityOrigin();
    actorlessNotes();
  });
}
