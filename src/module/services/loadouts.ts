import { MODULE_ID, i18n } from "../../midi-qol.js";
import { registerInteraction, runInteraction } from "./interactions/registry.js";

/*
 * M27 stage 4: weapon sets saved on the actor (`flags.midi-qol.loadouts`): the weapons and shield equipped,
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
