import type { Activity } from "../../../globals.js";

/* A creature's reach, for opportunity attacks, the reach events and entries' `within: "reach"` (one measure for all) */

/** The longest reach of the creature's melee attacks (equipped weapons, natural weapons, a feature's attack); 5 ft at least */
export function meleeReach(actor: Actor.Implementation | null | undefined): number {
  let reach = 5;
  for (const item of actor?.items ?? []) {
    const system = item.system as { equipped?: boolean, type?: { value?: string }, range?: { reach?: number | null }, activities?: { contents?: Activity[] } };
    if ((item.type as string) === "weapon" && system.equipped === false && system.type?.value !== "natural") continue;
    for (const activity of meleeAttacks(item)) reach = Math.max(reach, Number(activity.range?.reach ?? system.range?.reach ?? 5) || 5);
  }
  return reach;
}

export function meleeAttacks(item: Item.Implementation): Activity[] {
  const activities = (item.system as { activities?: { contents?: Activity[] } }).activities?.contents ?? [];
  return activities.filter(a => a.type === "attack" && (a as { attack?: { type?: { value?: string } } }).attack?.type?.value === "melee");
}

