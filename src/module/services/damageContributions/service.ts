import { defineService, entries, reportServiceProblem } from "../../api/services.js";

/*
 * damageContributions (contributors): damage a module adds to a use at its damage step (M2 stage 8; proposal
 * section 11), instead of writing midi's damage stores. Each contribution is rolled when the step runs and becomes its
 * own dnd5e damage message (role = the contribution's). Without targets it applies to every target the use hits;
 * with targets (token document uuids) only to those (the damageModifiers bonus stage).
 *
 *   MidiQOL.services.register("damageContributions", "my-module.smite", {
 *     for: ({ workflow }) => workflow.item?.name === "Longsword" ? [{ role: "my-module.smite", formula: "2d8", damageType: "radiant", label: "Smite" }] : []
 *   });
 */

export interface DamageContributionQuery {
  workflow: any;
  actor: Actor.Implementation;
  item?: Item.Implementation;
  activity?: unknown;
}

export interface DamageContribution {
  /** Its message's role (flags.midi-qol.damage.role): the contributing module's id, or one it names. */
  role: string;
  /** Rolled with the use's roll data. */
  formula: string;
  damageType?: string;
  label: string;
  /** Only these targets (token document uuids); all the use hits when omitted. */
  targets?: readonly string[];
  /**
   * M15 6b: false: never critical. Otherwise (default) it is critical exactly as the use's own damage roll is, with
   * the same rules (dnd5e's settings and midi's Critical Damage setting): Hex's die on a critical hit.
   */
  critical?: false;
}

export interface DamageContributor {
  for(query: DamageContributionQuery): readonly DamageContribution[] | undefined | Promise<readonly DamageContribution[] | undefined>;
}

declare module "../../api/services.js" {
  interface MidiServices { damageContributions: DamageContributor }
}

export let damageContributionsService: ReturnType<typeof defineService<DamageContributor>>;

export function defineDamageContributionsService() {
  damageContributionsService = defineService<DamageContributor>("damageContributions", {
    kind: "contributors",
    description: "Damage a module adds to a use at its damage step, each its own damage message"
  });
}

/** Every contributor's contributions for a use (a failing contributor is reported and skipped). */
export async function collectDamageContributions(query: DamageContributionQuery): Promise<{ contributor: string, contribution: DamageContribution }[]> {
  const found: { contributor: string, contribution: DamageContribution }[] = [];
  for (const { id, provider } of entries<DamageContributor>("damageContributions")) {
    try {
      for (const contribution of await provider.for(query) ?? []) found.push({ contributor: id, contribution });
    } catch (err) {
      reportServiceProblem("damageContributions", id, "failed", err);
    }
  }
  return found;
}
