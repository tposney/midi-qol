import type { Activity } from "../../../globals.js";
import { defineService } from "../../api/services.js";
import type { TargetConfirmationOptions } from "../../apps/TargetConfirmation.js";

/*
 * targetConfirmation (single): the UI that lets a user confirm or change a use's targets before it goes on. The
 * provider resolves true to continue (the targets chosen are the user's targets) or false to cancel. When to confirm
 * stays midi's decision (requiresTargetConfirmation and its settings); midi's TargetConfirmationDialog is the default.
 *
 *   MidiQOL.services.register("targetConfirmation", "my-module", { confirm: async ({ activity }) => MyPicker.run(activity) }, { priority: 10 });
 */

export interface TargetConfirmationRequest {
  activity: Activity;
  /** "preTemplate": before the use; "postTemplate": after an area was placed. */
  phase: "preTemplate" | "postTemplate";
  options: TargetConfirmationOptions;
}

export interface TargetConfirmationProvider {
  confirm(request: TargetConfirmationRequest): Promise<boolean>;
}

declare module "../../api/services.js" {
  interface MidiServices { targetConfirmation: TargetConfirmationProvider }
}

export let targetConfirmationService: ReturnType<typeof defineService<TargetConfirmationProvider>>;
let midiDefault: TargetConfirmationProvider | undefined;

/** `midiConfirm` is midi's dialog (passed in to keep this module free of an import cycle with activityHelpers). */
export function defineTargetConfirmationService(midiConfirm: (activity: Activity, options: TargetConfirmationOptions) => Promise<boolean>) {
  targetConfirmationService = defineService<TargetConfirmationProvider>("targetConfirmation", {
    kind: "single",
    description: "Confirm or change a use's targets before it goes on"
  });
  midiDefault = { confirm: ({ activity, options }) => midiConfirm(activity, options) };
  targetConfirmationService.register("midi-qol", midiDefault, { label: "Midi-QOL target confirmation" });
}

/** The active provider's answer (midi's dialog when no other provider is registered). */
export async function confirmTargets(activity: Activity, phase: TargetConfirmationRequest["phase"], options: TargetConfirmationOptions = {}): Promise<boolean> {
  const provider = targetConfirmationService?.get() ?? midiDefault;
  if (!provider) return true;
  return await provider.confirm({ activity, phase, options }) === true;
}
