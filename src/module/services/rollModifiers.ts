import { defineService, entries } from "../api/services.js";
import type { RollModifierTracker } from "../lib/RollModifierTracker.js";
import { applyRollModifiers, RollKind, RollModifier } from "../rules/rollModifiers.js";

/*
 * rollModifiers (contributors): every registered contributor is asked about each d20 roll midi handles (attacks in a
 * workflow, saves, checks, skills, tools, death saves, concentration) and its answers go on the roll's
 * RollModifierTracker, attributed to it. midi combines them with its own rules as before.
 *
 *   MidiQOL.services.register("rollModifiers", "my-module.help", { for(query) { return [{ effect: "advantage", label: "Help" }]; } });
 */

export type { RollKind, RollModifier, RollModifierEffect } from "../rules/rollModifiers.js";

export interface RollQuery {
  kind: RollKind;
  actor: Actor.Implementation;
  /** The roller's token, when midi knows it (attacks). */
  token?: TokenDocument.Implementation;
  /** For an attack: the target it is checked against (the first target). */
  target?: TokenDocument.Implementation;
  activity?: unknown;
  item?: Item.Implementation;
  ability?: string;
  skill?: string;
  tool?: string;
  /** The workflow the roll belongs to, if any. */
  workflow?: unknown;
}

export interface RollModifierContributor {
  for(query: RollQuery): readonly RollModifier[] | undefined | Promise<readonly RollModifier[] | undefined>;
}

export let rollModifiersService: ReturnType<typeof defineService<RollModifierContributor>>;

export function defineRollModifiersService() {
  rollModifiersService = defineService<RollModifierContributor>("rollModifiers", {
    kind: "contributors",
    description: "Advantage, disadvantage, critical, fumble, success/fail and min/max for a d20 roll, with the reason shown"
  });
}

/** Asks every contributor about the roll and puts their answers on the tracker. A contributor that throws is skipped. */
export async function collectRollModifiers(query: RollQuery, tracker: RollModifierTracker): Promise<void> {
  if (!rollModifiersService) return;
  for (const { id, provider } of entries<RollModifierContributor>("rollModifiers")) {
    try {
      const modifiers = await provider.for(query);
      if (!modifiers?.length) continue;
      const problems = applyRollModifiers(tracker, modifiers, id);
      if (problems.length) console.warn(`midi-qol | rollModifiers | ${id}: ${problems.join("; ")}`);
    } catch (err) {
      console.warn(`midi-qol | rollModifiers | ${id} failed for a ${query.kind} roll`, err);
    }
  }
}
