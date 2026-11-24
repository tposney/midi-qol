import { MODULE_ID, i18n } from "../../midi-qol.js";
import { registerInteraction, runInteraction } from "./interactions/registry.js";

/*
 * M27 stage 4: loadouts. Spell groups (`flags.midi-qol.spellGroups`): the levelled spells prepared, by item id; applying
 * one prepares them and unprepares the actor's other changeable spells (not always-prepared, innate or cantrips), out
 * of combat only (a preparation change is a rest's).
 *
 * Weapon sets saved on the actor (`flags.midi-qol.loadouts`): the weapons and shield equipped,
 * by item id. Swapping to a set equips its items and unequips the actor's other weapons and shields; in combat it is
 * the free object interaction (a second costs the action), as midi's object interactions are, through the
 * interaction registry (MidiQOL.interactions.run("midi-qol.loadout", token, undefined, { index })).
 */

export interface Loadout { name: string, items: string[] }

const LOADOUT_INTERACTION = "midi-qol.loadout";
type Equippable = Item.Implementation & { system: { equipped?: boolean, type?: { value?: string } } };

const swappable = (item: { type: unknown, system: unknown }) => item.type === "weapon"
  || (item.type === "equipment" && (item.system as Equippable["system"]).type?.value === "shield");

export function loadoutsOf(actor: Actor.Implementation): Loadout[] {
  const stored = actor.getFlag(MODULE_ID as never, "loadouts" as never) as unknown;
  return Array.isArray(stored) ? stored.filter((l): l is Loadout => !!l && typeof l.name === "string" && Array.isArray(l.items)) : [];
}

/** What is equipped now, as a set's items */
const equippedNow = (actor: Actor.Implementation) => actor.items.filter(i => swappable(i) && !!(i.system as Equippable["system"]).equipped).map(i => i.id ?? "").filter(Boolean);

/** The set equipped now (same items), if any */
export function currentLoadout(actor: Actor.Implementation): number {
  const now = new Set(equippedNow(actor));
  return loadoutsOf(actor).findIndex(l => l.items.length === now.size && l.items.every(id => now.has(id)));
}

export async function saveLoadout(actor: Actor.Implementation, name?: string): Promise<void> {
  const list = loadoutsOf(actor);
  list.push({ name: name || i18n("midi-qol.Loadout.Set").replace("{n}", String(list.length + 1)), items: equippedNow(actor) });
  await actor.setFlag(MODULE_ID as never, "loadouts" as never, list as never);
}

export async function removeLoadout(actor: Actor.Implementation, index: number): Promise<void> {
  const list = loadoutsOf(actor).filter((_l, i) => i !== index);
  await actor.setFlag(MODULE_ID as never, "loadouts" as never, list as never);
}

/** Swap to a set through the interaction (its cost in combat) */
export function swapLoadout(token: TokenDocument.Implementation, index: number) {
  return runInteraction(LOADOUT_INTERACTION, token, undefined, { index });
}

export function registerLoadouts() {
  registerInteraction(LOADOUT_INTERACTION, {
    label: "midi-qol.Loadout.Swap",
    icon: "fa-solid fa-shuffle",
    targets: "self",
    cost: { object: 1 },
    // Only when a set is named (the hub's buttons): not in the Token HUD's list
    relevant: ({ options }) => typeof options.index === "number",
    available: ({ subject, options }) => {
      const actor = subject.actor as Actor.Implementation | null;
      const set = actor ? loadoutsOf(actor)[options.index as number] : undefined;
      if (!set) return i18n("midi-qol.Loadout.None");
      return currentLoadout(actor!) === options.index ? i18n("midi-qol.Loadout.Current") : undefined;
    },
    run: async ({ subject, options }) => {
      const actor = subject.actor as Actor.Implementation | null;
      const set = actor ? loadoutsOf(actor)[options.index as number] : undefined;
      if (!actor || !set) return false;
      const wanted = new Set(set.items);
      const updates = actor.items.filter(swappable).map(i => ({ _id: i.id, "system.equipped": wanted.has(i.id ?? "") }))
        .filter(u => (actor.items.get(u._id ?? "") as Equippable | undefined)?.system.equipped !== u["system.equipped"]);
      if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never);
    }
  });
}

/* Spell groups */

export interface SpellGroup { name: string, spells: string[] }
type Preparable = Item.Implementation & { system: { level?: number, prepared?: number, canPrepare?: boolean } };

/** A spell whose preparation a group changes: levelled, preparable, not always prepared */
const changeable = (item: Item.Implementation) => {
  const system = (item as Preparable).system;
  return (item.type as string) === "spell" && (system.level ?? 0) > 0 && !!system.canPrepare && system.prepared !== 2;
};

export function spellGroupsOf(actor: Actor.Implementation): SpellGroup[] {
  const stored = actor.getFlag(MODULE_ID as never, "spellGroups" as never) as unknown;
  return Array.isArray(stored) ? stored.filter((g): g is SpellGroup => !!g && typeof g.name === "string" && Array.isArray(g.spells)) : [];
}

const preparedNow = (actor: Actor.Implementation) => actor.items.filter(i => changeable(i) && (i as Preparable).system.prepared === 1).map(i => i.id ?? "").filter(Boolean);

/** The group prepared now (same spells), if any */
export function currentSpellGroup(actor: Actor.Implementation): number {
  const now = new Set(preparedNow(actor));
  return spellGroupsOf(actor).findIndex(g => g.spells.length === now.size && g.spells.every(id => now.has(id)));
}

export async function saveSpellGroup(actor: Actor.Implementation, name?: string): Promise<void> {
  const list = spellGroupsOf(actor);
  list.push({ name: name || i18n("midi-qol.SpellGroup.Group").replace("{n}", String(list.length + 1)), spells: preparedNow(actor) });
  await actor.setFlag(MODULE_ID as never, "spellGroups" as never, list as never);
}

export async function removeSpellGroup(actor: Actor.Implementation, index: number): Promise<void> {
  const list = spellGroupsOf(actor).filter((_g, i) => i !== index);
  await actor.setFlag(MODULE_ID as never, "spellGroups" as never, list as never);
}

const inCombat = (actor: Actor.Implementation) => !!game.combats?.some(c => c.started && c.combatants.some(x => x.actor === actor));

/** Why a group can't be applied now (in combat), else undefined */
export function spellGroupBlocked(actor: Actor.Implementation): string | undefined {
  return inCombat(actor) ? i18n("midi-qol.SpellGroup.NotInCombat") : undefined;
}

/** Prepares the group's spells and unprepares the other changeable ones; a reason when it can't */
export async function applySpellGroup(actor: Actor.Implementation, index: number): Promise<string | undefined> {
  const group = spellGroupsOf(actor)[index];
  if (!group) return i18n("midi-qol.SpellGroup.None");
  const blocked = spellGroupBlocked(actor);
  if (blocked) return blocked;
  const wanted = new Set(group.spells);
  const updates = actor.items.filter(changeable).map(i => ({ _id: i.id, "system.prepared": wanted.has(i.id ?? "") ? 1 : 0 }))
    .filter(u => (actor.items.get(u._id ?? "") as Preparable | undefined)?.system.prepared !== u["system.prepared"]);
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never);
  return undefined;
}
