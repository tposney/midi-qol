import { defineService, reportServiceProblem } from "../../api/services.js";

/*
 * M30: two contributors services for rules that decide an outcome once a roll is made (rollModifiers' contributors
 * answer before the roll):
 *
 * - saveOutcome: whether a save succeeded. midi's answer is total >= DC; a contributor may answer instead (the first
 *   answer, highest priority first). `usesCriticals`: a natural 20 or 1 matters to it, so a save roll keeps them.
 *     MidiQOL.services.register("saveOutcome", "my-module.nat20", { usesCriticals: true, for: q => q.critical ? { success: true } : undefined });
 *
 * - attackOutcome: whether a hit on a target is a critical, at the hit check (the target's AC known): a contributor's
 *   answer overrides the roll's critical, with its reason.
 *     MidiQOL.services.register("attackOutcome", "my-module.margin", { for: q => ({ critical: q.total >= q.ac + 5, label: "By 5" }) });
 */

export interface SaveOutcomeQuery {
  total: number;
  dc: number;
  /** A natural 20 / 1 on the roll */
  critical: boolean;
  fumble: boolean;
  actor?: Actor.Implementation;
}

export interface SaveOutcomeContributor {
  usesCriticals?: boolean;
  for(query: SaveOutcomeQuery): { success: boolean } | undefined;
}

export interface AttackOutcomeQuery {
  total: number;
  ac: number;
  critical: boolean;
  /** The attack's targets (one target: a margin rule applies) */
  targetCount: number;
  workflow?: unknown;
}

export interface AttackOutcomeContributor {
  for(query: AttackOutcomeQuery): { critical: boolean, key: string, label: string } | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { saveOutcome: SaveOutcomeContributor, attackOutcome: AttackOutcomeContributor }
}

export let saveOutcomeService: ReturnType<typeof defineService<SaveOutcomeContributor>>;
export let attackOutcomeService: ReturnType<typeof defineService<AttackOutcomeContributor>>;

export function defineOutcomeServices() {
  saveOutcomeService = defineService<SaveOutcomeContributor>("saveOutcome", {
    kind: "contributors",
    description: "Whether a save succeeded, once rolled (midi's: total >= DC; a rule may decide instead)"
  });
  attackOutcomeService = defineService<AttackOutcomeContributor>("attackOutcome", {
    kind: "contributors",
    description: "Whether a hit is a critical, at the hit check with the target's AC"
  });
}

/** A contributor's answer on the save, if one gives one */
export function saveOutcomeOverride(query: SaveOutcomeQuery): boolean | undefined {
  for (const contributor of saveOutcomeService?.all() ?? []) {
    try {
      const answer = contributor.for(query);
      if (answer) return answer.success;
    } catch (err) { reportServiceProblem("saveOutcome", "contributor", "for failed", err); }
  }
  return undefined;
}

/** The save's outcome: a contributor's answer, else total >= DC */
export function saveSucceeded(query: SaveOutcomeQuery): boolean {
  return saveOutcomeOverride(query) ?? query.total >= query.dc;
}

/** A natural 20 or 1 on a save matters to an available contributor */
export const saveCriticalsCount = () => (saveOutcomeService?.all() ?? []).some(c => c.usesCriticals);

/** A contributor's verdict on a hit's critical, if one gives one */
export function attackCritical(query: AttackOutcomeQuery): { critical: boolean, key: string, label: string } | undefined {
  for (const contributor of attackOutcomeService?.all() ?? []) {
    try {
      const answer = contributor.for(query);
      if (answer) return answer;
    } catch (err) { reportServiceProblem("attackOutcome", "contributor", "for failed", err); }
  }
  return undefined;
}
