import { installCAT } from "./cat.js";
import { installCustomDnd5e } from "./customDnd5e.js";
import { installMonksTokenBar } from "./monksTokenBar.js";
import { installSequencer } from "./sequencer.js";

/*
 * Workarounds for other modules: code that exists only because another module has a bug or a limitation midi has to
 * live with, not an integration through its API. One file per module; each file's header says what it works around,
 * for which version, and when it can be removed (css/workarounds.css for their stylesheet fixes). Installed once, at
 * init.
 */
export function installWorkarounds(): void {
  installCAT();
  installCustomDnd5e();
  installMonksTokenBar();
  installSequencer();
}
