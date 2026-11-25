import { register } from "./api/services.js";
import { catForcedMovement } from "./services/forcedMovement/service.js";
import { MODULE_ID } from "../midi-qol.js";
import { registerCATMacros } from "./catMacros/macros.mjs";
import { infernalWoundConfig } from "./catMacros/features/infernalWound.mjs";
import { detectMagicConfig } from "./catMacros/spells/detectMagic.mjs";

/**
 * CAT offers midi's sample items through its medkit. An item with `flags.cat.automation.version` automates the item
 * of the same identifier; demos and legacy copies have none and get a type no item has, so CAT never offers them.
 * A creature's copy (`monsterIdentifier`) is matched to its creature by CAT (0.1.8). Other monster features
 * (`flags.cat.automation.npc`) are for NPCs only: their source type never matches a player's class feature.
 */
// Automations with configuration options (the Cat Kit's Configuration), by item identifier
const AUTOMATION_CONFIG: Record<string, object> = { ...infernalWoundConfig, ...detectMagicConfig };

function automationInfo(entry): object {
  const automation = entry.flags?.cat?.automation;
  if (!automation?.version) return { type: "midi-qol-sample" };
  // The item's notes block as plain text (compilePacks), shown in the medkit.
  const config = AUTOMATION_CONFIG[entry.system?.identifier];
  const notes = { ...(automation.notes ? { notes: automation.notes } : {}), ...(config ? { config } : {}) };
  if (automation.monsterIdentifier) return { ...notes, monsterIdentifier: automation.monsterIdentifier };
  return automation.npc ? { ...notes, sourceType: "midi-qol:npc" } : notes;
}

export function setupCATIntegration() {
  Hooks.once("catReady", async () => {
    registerCATMacros(MODULE_ID);
    // CAT's push and pull for midi's forcedMovement service, registered for CAT until CAT registers its own
    if (typeof globalThis.cat?.utils?.tokenUtils?.slideToken === "function")
      register("forcedMovement", "cat", catForcedMovement, { label: "CAT", priority: 10, available: () => !!game.modules.get("cat")?.active });
    await globalThis.cat?.api.registerAutomationModule(MODULE_ID, {
      infoFetcherCallback: automationInfo
    });
  });
}
