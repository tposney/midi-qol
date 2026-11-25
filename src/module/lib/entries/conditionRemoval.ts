/*
 * Ending a condition on a creature, pure (no Foundry globals). A condition is on a creature through every effect
 * whose statuses include it: dnd5e's bare status effect, and any effect a spell or feature applied that carries it.
 * Toggling the status off removes only the first. Ending the condition takes it from all of them:
 *  - an effect that is only that condition (no other status but its riders, no changes) is deleted;
 *  - an effect that carries more keeps the rest and loses the status (the actor's statuses follow from its effects'
 *    when it is prepared), unless the whole effect is asked for;
 *  - dnd5e's rider statuses (Paralyzed brings Incapacitated, as effects of their own depending on the first) go with
 *    the status they came from when the effect stays.
 */

export interface EffectFacts {
  id: string;
  statuses: readonly string[];
  hasChanges: boolean;
  /** The effect this one depends on (a rider's parent), as an id or a uuid */
  dependsOn?: string;
  uuid?: string;
}

export interface ConditionRemoval {
  /** Effects to delete (their dependents go with them) */
  delete: string[];
  /** Effects that stay, with the statuses left to them */
  strip: { id: string, statuses: string[] }[];
}

/**
 * @param ridersOf the statuses a status brings with it (dnd5e's riders)
 * @param whole    end every effect that carries the condition, whatever else it does
 */
export function planConditionRemoval(effects: readonly EffectFacts[], statusId: string, ridersOf: (status: string) => readonly string[], whole = false): ConditionRemoval {
  const plan: ConditionRemoval = { delete: [], strip: [] };
  const riders = new Set(ridersOf(statusId));
  for (const effect of effects) {
    if (!effect.statuses.includes(statusId)) continue;
    const rest = effect.statuses.filter(status => status !== statusId && !riders.has(status));
    if (whole || (!rest.length && !effect.hasChanges)) { plan.delete.push(effect.id); continue; }
    // What the statuses that stay bring themselves is kept
    const kept = new Set(rest.flatMap(status => [status, ...ridersOf(status)]));
    plan.strip.push({ id: effect.id, statuses: effect.statuses.filter(status => kept.has(status)) });
    // The condition's rider effects that hang on this one, where nothing that stays brings the same rider
    for (const rider of effects) {
      if (rider === effect || !rider.dependsOn || ![effect.id, effect.uuid].includes(rider.dependsOn)) continue;
      if (rider.hasChanges || !rider.statuses.length) continue;
      if (rider.statuses.every(status => riders.has(status) && !kept.has(status))) plan.delete.push(rider.id);
    }
  }
  plan.delete = [...new Set(plan.delete)];
  return plan;
}

/** Of `from`, the conditions any of the creatures has (in `from`'s order) */
export function conditionsPresent(from: readonly string[], statusSets: readonly Iterable<string>[]): string[] {
  const present = new Set<string>();
  for (const statuses of statusSets) for (const status of statuses) present.add(status);
  return from.filter(status => present.has(status));
}
