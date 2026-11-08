import { MODULE_ID } from "../midi-qol.js";
import { addNotes } from "./catMacros/automationNotes.mjs";
import { registerCATMacros } from "./catMacros/macros.mjs";
import { infernalWoundConfig } from "./catMacros/features/infernalWound.mjs";
import { detectMagicConfig } from "./catMacros/spells/detectMagic.mjs";

/** The last CAT whose getOriginActivitySync reads `effects` on a cast activity, which has none on dnd5e 6. */
const CAT_CAST_ACTIVITY_FIX_MAX = "0.1.7";

/**
 * Temporary, while CAT <= CAT_CAST_ACTIVITY_FIX_MAX is active: CAT's getOriginActivitySync looks for the activity holding an
 * effect's origin effect with `activity.effects.some(...)`, but a cast activity has no effects (dnd5e 6), so an item
 * with one (the Jewel of Three Prayers) made every effect pointing at it (its aura's copies) throw in CAT's
 * preCreateActiveEffect hook, thousands of times with Aura Effects.
 */
function setupCATCastActivityFix() {
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
 * CAT offers midi's sample items through its medkit. An item with `flags.cat.automation.version` automates the item
 * of the same identifier; demos and legacy copies have none and get a type no item has, so CAT never offers them.
 * Monster features (`flags.cat.automation.npc`, or a `monsterIdentifier`: that creature's copy) are for NPCs only: their
 * source type never matches a player's class feature.
 */
// Automations with configuration options (the Cat Kit's Configuration), by item identifier
const AUTOMATION_CONFIG: Record<string, object> = { ...infernalWoundConfig, ...detectMagicConfig };

function automationInfo(entry): object {
  const automation = entry.flags?.cat?.automation;
  if (!automation?.version) return { type: "midi-qol-sample" };
  // The item's notes block as plain text (compilePacks), shown in the medkit.
  const config = AUTOMATION_CONFIG[entry.system?.identifier];
  const notes = { ...(automation.notes ? { notes: automation.notes } : {}), ...(config ? { config } : {}) };
  if (automation.monsterIdentifier) return { ...notes, monsterIdentifier: automation.monsterIdentifier, sourceType: "midi-qol:npc" };
  return automation.npc ? { ...notes, sourceType: "midi-qol:npc" } : notes;
}

/**
 * CAT fires its medkit event (where midi's automation-notes macro re-adds an automation's notes block) only for items on
 * an actor; for a sidebar or compendium item midi adds the notes after the medkit applies the automation.
 */
function setupActorlessNotes() {
  const automationUtils = globalThis.cat?.utils.automationUtils;
  if (!automationUtils) return;
  const updateItem = automationUtils.updateItem;
  automationUtils.updateItem = async (item, options) => {
    const result = await updateItem.call(automationUtils, item, options);
    if (!item.actor) await addNotes({ document: item });
    return result;
  };
}

export function setupCATIntegration() {
  Hooks.once("catReady", async () => {
    setupCATCastActivityFix();
    setupActorlessNotes();
    registerCATMacros(MODULE_ID);
    await globalThis.cat?.api.registerAutomationModule(MODULE_ID, {
      infoFetcherCallback: automationInfo
    });
  });
}
