import { defineService } from "../../api/services.js";
import { perObserverHidden } from "../../../rules/hiddenAdvantage.js";
import { _canSenseModes } from "../../utils.js";

/*
 * The perception service: which detection modes an observer senses a target with, whether a hiding target is hidden
 * from an observer, and which detection modes are imprecise (no Invisible disadvantage for them). midi's provider
 * ("midi-qol", priority 0) is today's code; with no selector the highest priority available provider is used, so a
 * module takes over with `MidiQOL.services.register("perception", "my-module", provider, { priority: 10, available })`.
 * Each answer of undefined (or a missing optional method) falls back to midi's answer.
 * The calls are synchronous: they run inside Foundry's detection tests (lib/hiding.ts) and midi's sync checks.
 */

/** "sight": the sight detection modes and blindsight; "all": every mode the observer has. */
export type SenseModes = "sight" | "all" | string[];

export interface SenseQuery {
  modes?: SenseModes;
  /** Check a token without sight as if it had sight, whatever Force vision when checking is set to. */
  forceVision?: boolean;
}

export interface PerceptionProvider {
  /**
   * Detection mode ids the observer senses the target with ([] = none), or undefined when it can't judge.
   * Token documents, as everywhere in midi's services; a provider that needs the canvas token reads `document.object`.
   */
  senses(observer: TokenDocument.Implementation, target: TokenDocument.Implementation, query: SenseQuery): string[] | undefined;
  /** Whether a hiding target is hidden from the observer; runs inside detection tests, so it must not change either token. */
  hiddenFrom?(target: TokenDocument.Implementation, observer: TokenDocument.Implementation): boolean | undefined;
  imprecise?(modeId: string): boolean | undefined;
}

const NON_SIGHT_CONSIDERED_SIGHT = ["blindsight"];

function sightModes(): string[] {
  const detectionModes = CONFIG.Canvas.detectionModes;
  return Object.keys(detectionModes).filter(
    (d) =>
      detectionModes[d].type === foundry.canvas.perception.DetectionMode.DETECTION_TYPES.SIGHT ||
      NON_SIGHT_CONSIDERED_SIGHT.includes(d)
  );
}

function modeList(modes: SenseModes | undefined): string[] {
  if (modes === "sight") return sightModes();
  if (modes === "all" || modes === undefined) return ["all"];
  return modes;
}

/** midi's provider always answers */
interface MidiPerceptionProvider extends PerceptionProvider {
  senses(observer: TokenDocument.Implementation, target: TokenDocument.Implementation, query: SenseQuery): string[];
  hiddenFrom(target: TokenDocument.Implementation, observer: TokenDocument.Implementation): boolean;
  imprecise(modeId: string): boolean;
}

export const midiPerception: MidiPerceptionProvider = {
  // Foundry's detection tests work on canvas tokens: a token that is not drawn senses, and is sensed by, nothing
  senses(observer, target, { modes, forceVision }) {
    if (!observer.object || !target.object) return [];
    return _canSenseModes(observer.object, target.object, modeList(modes), { forceVision });
  },
  // The optional rule hiddenAdvantage per observer (src/rules/hiddenAdvantage.ts)
  hiddenFrom: (target, observer) => perObserverHidden(target, observer),
  // vision-5e marks its imprecise modes (blindsight, tremorsense...)
  imprecise(modeId) {
    const mode: object | undefined = CONFIG.Canvas.detectionModes[modeId];
    return !!mode && "imprecise" in mode && !!mode.imprecise;
  }
};

declare module "../../api/services.js" {
  interface MidiServices { perception: PerceptionProvider }
}

export let perceptionService: ReturnType<typeof defineService<PerceptionProvider>> | undefined;

export function definePerceptionService() {
  perceptionService = defineService<PerceptionProvider>("perception", {
    kind: "single",
    description: "Which detection modes a token senses another with, hiding, imprecise detection modes",
  });
  perceptionService.register("midi-qol", midiPerception, { label: "Midi-QOL", priority: 0 });
}

function provider(): PerceptionProvider | undefined {
  return perceptionService?.get();
}

export function sensesModes(observer: TokenDocument.Implementation, target: TokenDocument.Implementation, query: SenseQuery): string[] {
  return provider()?.senses(observer, target, query) ?? midiPerception.senses(observer, target, query);
}

export function isHiddenFrom(target: TokenDocument.Implementation, observer: TokenDocument.Implementation): boolean {
  return provider()?.hiddenFrom?.(target, observer) ?? midiPerception.hiddenFrom(target, observer);
}

export function isImprecise(modeId: string): boolean {
  return provider()?.imprecise?.(modeId) ?? midiPerception.imprecise(modeId);
}
