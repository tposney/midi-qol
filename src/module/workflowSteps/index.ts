import { registerAbortSteps } from "./abort.js";
import { registerAttackSteps } from "./attack.js";
import { registerDamageSteps } from "./damage.js";
import { registerDamageRollSteps } from "./damageRoll.js";
import { registerEffectsSteps } from "./effects.js";
import { registerFinishSteps } from "./finish.js";
import { registerFlowVariants } from "./flowVariants.js";
import { registerPreambleSteps } from "./preamble.js";
import { registerSavesSteps } from "./saves.js";
import { registerUtilitySteps } from "./utility.js";

/** midi's steps get their implementations, then the flows their variants (at init, before any use) */
export function registerMidiSteps(): void {
  registerPreambleSteps();
  registerUtilitySteps();
  registerAttackSteps();
  registerDamageRollSteps();
  registerSavesSteps();
  registerDamageSteps();
  registerEffectsSteps();
  registerFinishSteps();
  registerAbortSteps();
  registerFlowVariants();
}
