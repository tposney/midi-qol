import type { Activity } from "../../globals.js";

/*
 * Activities used after a spell is cast (Flaming Sphere's Move and Ram, Gust of Wind's Push, Detect Magic's Sense
 * Magic). dnd5e has no such concept, so it is inferred: an activity of a levelled spell that doesn't consume a spell
 * slot, when another of the spell's activities does (the casting). A spell is running while the caster concentrates on
 * it, an effect it applied is on the caster, or a creature it summoned is in play. Choosers list after-cast activities
 * last and greyed while their spell isn't running; the hub offers them only while it runs.
 */

type ActivityLike = Activity & { id: string, consumption?: { spellSlot?: boolean }, item: Item.Implementation };
type SpellSystem = { level?: number, activities?: { contents: ActivityLike[] } };

/** The activity is used after its spell is cast (inferred: see above) */
export function isAfterCast(activity: ActivityLike): boolean {
  const item = activity.item;
  if ((item?.type as string) !== "spell") return false;
  const system = item.system as SpellSystem;
  if (!system.level || activity.consumption?.spellSlot !== false) return false;
  return !!system.activities?.contents.some(a => a.id !== activity.id && a.consumption?.spellSlot !== false);
}

/** The spell is running: concentrated on, an effect from it on the caster, or a creature it summoned in play */
export function isSpellRunning(item: Item.Implementation): boolean {
  const actor = item.actor as (Actor.Implementation & { concentration?: { items: Set<Item.Implementation> } }) | null;
  if (!actor) return false;
  if ([...(actor.concentration?.items ?? [])].some(i => i.id === item.id)) return true;
  const fromItem = (origin: unknown) => typeof origin === "string" && !!item.uuid && origin.startsWith(item.uuid);
  if (actor.effects.some(e => !e.transfer && fromItem(e.origin))) return true;
  const summons = (globalThis as { dnd5e?: { registry?: { summons?: { creatures(actor: Actor.Implementation): Actor.Implementation[] } } } }).dnd5e?.registry?.summons;
  return !!summons?.creatures(actor).some(a => fromItem(a?.getFlag("dnd5e" as never, "summon.origin" as never)));
}

/** A spell the caster hasn't prepared (one whose method prepares, left unprepared) */
export function isUnprepared(item: Item.Implementation): boolean {
  if ((item.type as string) !== "spell") return false;
  const system = item.system as { canPrepare?: boolean, prepared?: number };
  return !!system.canPrepare && !system.prepared;
}
