import { MODULE_ID, i18n } from "../../midi-qol.js";
import { registerInteraction, runInteraction } from "./interactions/registry.js";
import { configSettings } from "../settings.js";
import { budget, spend } from "./economy/ledger.js";
import { attacksMax } from "./economy/cost.js";

/*
 * M27 hands (plan ~/Documents/midi-next-M27-hands-plan-2026-11-26.md): the weapon sets a creature switches between, as
 * Argon's and DAS's, each a main hand and an off hand. The active set is what it holds: the hub's bar starts with it
 * (the main hand attacks, the off hand is its off-hand attack or its shield). Stored on the actor
 * (`flags.midi-qol.hands`, item ids), seeded from what it has until first changed: a character's equipped weapons and
 * shield, then a ranged weapon; an NPC's action and bonus-action weapons, one set per pair.
 *
 * Switching (MidiQOL.hands.switch, the hub, the next/previous set keys) is the interaction `midi-qol.hands`: in combat
 * the free object interaction (a second costs the action). A character's switch equips the set's items and unequips the
 * other sets' items, nothing else; an NPC's only changes which set is shown.
 *
 * Hand rules: a two-handed weapon takes both hands; a shield is held in the off hand; the main hand is filled first.
 *
 * Stage 2 rules: an attack with a held weapon is made as it is held (handsAttackMode: the off hand's weapon off-hand,
 * a versatile main-hand weapon two-handed while the off hand is free, one-handed otherwise). A switch's cost: one that
 * dons or doffs a shield is the Utilize action; one that changes a single weapon during the Attack action, while an
 * attack made in it has no draw or stow of its own yet, is free (2024: equip or unequip one weapon with each attack);
 * otherwise the free object interaction (the action once that is used).
 */

/** A set: its main hand and off hand (item ids) */
export type HandSet = [string | null, string | null];
export interface Hands { sets: HandSet[]; active: number }
export const MIN_SETS = 2;
export const MAX_SETS = 4;
export const MAIN = 0;
export const OFF = 1;
const HANDS_INTERACTION = "midi-qol.hands";

type Wieldable = Item.Implementation & { system: { identifier?: string, equipped?: boolean, type?: { value?: string },
  properties?: Set<string>, armor?: { value?: number }, activities?: Iterable<{ type?: string, activation?: { type?: string } }> } };
const sys = (item: Item.Implementation) => (item as Wieldable).system;

export const isShield = (item: Item.Implementation | null | undefined) => !!item && (item.type as string) === "equipment" && sys(item).type?.value === "shield";
const isWeapon = (item: Item.Implementation | null | undefined) => !!item && (item.type as string) === "weapon" && sys(item).identifier !== "unarmed-strike";
/** What a hand can hold: a weapon (not the unarmed strike) or a shield */
export const wieldable = (item: Item.Implementation | null | undefined) => isWeapon(item) || isShield(item);
export const isTwoHanded = (item: Item.Implementation | null | undefined) => isWeapon(item) && !!sys(item!).properties?.has("two");
const isLight = (item: Item.Implementation | null | undefined) => isWeapon(item) && !!sys(item!).properties?.has("lgt");
const isVersatile = (item: Item.Implementation | null | undefined) => isWeapon(item) && !!sys(item!).properties?.has("ver");
const isRanged = (item: Item.Implementation) => ["simpleR", "martialR"].includes(sys(item).type?.value ?? "");
/** An NPC (or a transformed creature): sets from its attacks, nothing equipped or unequipped */
const npcLike = (actor: Actor.Implementation) => (actor.type as string) === "npc" || !!(actor.flags as { dnd5e?: { isPolymorphed?: boolean } }).dnd5e?.isPolymorphed;
/** The activation of the item's first attack (an NPC's action or bonus-action weapon) */
const attackActivation = (item: Item.Implementation) => [...(sys(item).activities ?? [])].find(a => a.type === "attack")?.activation?.type;

/** The sets a creature starts with, from what it has */
export function seedHands(actor: Actor.Implementation): Hands {
  const items = actor.items.filter(wieldable);
  if (npcLike(actor)) {
    const main = items.filter(i => isWeapon(i) && attackActivation(i) === "action");
    const off = items.filter(i => isWeapon(i) && attackActivation(i) === "bonus");
    const count = Math.min(MAX_SETS, Math.max(MIN_SETS, main.length, off.length));
    const sets = Array.from({ length: count }, (_, i): HandSet => [main[i]?.id ?? null, isTwoHanded(main[i]) ? null : off[i]?.id ?? null]);
    return { sets, active: 0 };
  }
  const equipped = items.filter(i => !!sys(i).equipped);
  const main = equipped.find(i => isWeapon(i) && !isRanged(i)) ?? equipped.find(isWeapon);
  const off = isTwoHanded(main) ? undefined : equipped.find(i => i !== main && isLight(i) && isLight(main)) ?? equipped.find(isShield);
  const ranged = items.find(i => isWeapon(i) && isRanged(i) && i !== main && i !== off);
  return { sets: [[main?.id ?? null, off?.id ?? null], [ranged?.id ?? null, null]], active: 0 };
}

/** The creature's hands: stored (items gone or no longer holdable dropped), else seeded */
export function handsOf(actor: Actor.Implementation): Hands {
  const stored = actor.getFlag(MODULE_ID, "hands");
  if (!stored || !Array.isArray(stored.sets)) return seedHands(actor);
  const valid = (id: unknown) => typeof id === "string" && wieldable(actor.items.get(id)) ? id : null;
  const sets = stored.sets.slice(0, MAX_SETS).map((set): HandSet => [valid(set?.[MAIN]), valid(set?.[OFF])]);
  while (sets.length < MIN_SETS) sets.push([null, null]);
  const active = Number.isInteger(stored.active) && stored.active >= 0 && stored.active < sets.length ? stored.active : 0;
  return { sets, active };
}

/** What a set holds: its items, and whether the off hand is taken by a two-handed main weapon */
export function heldIn(actor: Actor.Implementation, hands: Hands = handsOf(actor), index = hands.active) {
  const [mainId, offId] = hands.sets[index] ?? [null, null];
  const main = mainId ? actor.items.get(mainId) : undefined;
  const off = offId ? actor.items.get(offId) : undefined;
  return { main, off, blocked: isTwoHanded(main) };
}

export async function saveHands(actor: Actor.Implementation, hands: Hands): Promise<void> {
  await actor.setFlag(MODULE_ID, "hands", { sets: hands.sets.map(set => [set[MAIN], set[OFF]] as HandSet), active: hands.active });
  Hooks.callAll("midi-qol.handsChanged", actor, hands);
}

const copyOf = (hands: Hands): Hands => ({ sets: hands.sets.map(set => [set[MAIN], set[OFF]] as HandSet), active: hands.active });

/**
 * An item put in a hand of a set: a two-handed weapon takes both hands, a shield goes to the off hand, the main hand is
 * filled first; moved, not copied, within the set. Undefined when it can't be held there (an off hand behind a
 * two-handed weapon, an item that isn't a weapon or shield).
 */
export function placeInHand(actor: Actor.Implementation, hands: Hands, index: number, hand: number, itemId: string): Hands | undefined {
  const item = actor.items.get(itemId);
  if (!wieldable(item) || index < 0 || index >= MAX_SETS) return undefined;
  const next = copyOf(hands);
  while (next.sets.length <= index) next.sets.push([null, null]);
  const set = next.sets[index];
  for (const h of [MAIN, OFF]) if (set[h] === itemId) set[h] = null;
  if (isTwoHanded(item)) {
    next.sets[index] = [itemId, null];
    return next;
  }
  const main = set[MAIN] ? actor.items.get(set[MAIN]!) : undefined;
  const toOff = isShield(item) || (hand === OFF && !!main);
  if (toOff) {
    if (isTwoHanded(main)) return undefined;
    set[OFF] = itemId;
  } else set[MAIN] = itemId;
  return next;
}

/** A hand emptied: an off-hand weapon moves to an emptied main hand (a shield stays) */
export function clearHand(actor: Actor.Implementation, hands: Hands, index: number, hand: number): Hands {
  const next = copyOf(hands);
  const set = next.sets[index];
  if (!set) return next;
  set[hand] = null;
  if (hand === MAIN && set[OFF] && isWeapon(actor.items.get(set[OFF]!))) [set[MAIN], set[OFF]] = [set[OFF], null];
  return next;
}

/** One more (empty) set, up to the most */
export function addSet(hands: Hands): Hands {
  const next = copyOf(hands);
  if (next.sets.length < MAX_SETS) next.sets.push([null, null]);
  return next;
}

/** A set removed (not below the fewest); the active one follows */
export function removeSet(hands: Hands, index: number): Hands {
  const next = copyOf(hands);
  if (next.sets.length <= MIN_SETS || !next.sets[index]) return next;
  next.sets.splice(index, 1);
  if (next.active > index || next.active >= next.sets.length) next.active = Math.max(0, next.active - 1);
  return next;
}

/**
 * The mode an attack with this weapon is made in, as it is held: the off hand's weapon off-hand (thrown off-hand when
 * thrown), a versatile main-hand weapon two-handed with the off hand free, one-handed otherwise; undefined when it isn't
 * held (or the mode isn't one the attack offers). `current`: the mode the attack would otherwise use.
 */
export function handsAttackMode(actor: Actor.Implementation | null | undefined, item: Item.Implementation | null | undefined, offered: string[], current?: string): string | undefined {
  if (!actor || !item?.id || !isWeapon(item)) return undefined;
  const { main, off } = heldIn(actor);
  const thrown = !!current?.startsWith("thrown");
  let mode: string | undefined;
  if (off?.id === item.id && main?.id !== item.id) mode = thrown ? "thrown-offhand" : "offhand";
  else if (main?.id === item.id && !thrown && isVersatile(item)) mode = off ? "oneHanded" : "twoHanded";
  return mode && offered.includes(mode) ? mode : undefined;
}

/** The items a switch to set `index` equips or unequips (those in one set and not the other) */
function changedBy(hands: Hands, index: number): string[] {
  const from = new Set(hands.sets[hands.active]?.filter((id): id is string => !!id));
  const to = new Set(hands.sets[index]?.filter((id): id is string => !!id));
  return [...from, ...to].filter(id => from.has(id) !== to.has(id));
}

/** 2024: the Attack action's attacks each let the creature draw or stow one weapon; those made, less those used */
function attackDrawsLeft(actor: Actor.Implementation): number {
  const counters = budget(actor, "action").counters;
  if (counters.attacksLeft === undefined) return 0;
  const made = attacksMax(actor) - Number(counters.attacksLeft ?? 0);
  return Math.max(0, made - Number(counters.attackDraws ?? 0));
}

/** What a switch to set `index` costs (a shield's don/doff the action, a single weapon during the Attack action free) */
function switchCost(actor: Actor.Implementation, index: number): { action?: number, object?: number, free?: boolean } {
  const changed = changedBy(handsOf(actor), index);
  if (changed.some(id => isShield(actor.items.get(id)))) return { action: 1 };
  if (changed.length <= 1 && attackDrawsLeft(actor) > 0) return { free: true };
  return { object: 1 };
}

/** Switch to a set: the interaction (its cost in combat); with midi's interactions off, at once and free */
export async function switchHands(token: TokenDocument.Implementation, index: number): Promise<{ done: boolean, reason?: string }> {
  if (configSettings.interactions !== false) return runInteraction(HANDS_INTERACTION, token, undefined, { index });
  const actor = token.actor as Actor.Implementation | null;
  const hands = actor ? handsOf(actor) : undefined;
  if (!actor || !hands?.sets[index]) return { done: false, reason: i18n("midi-qol.Hands.NoSet") };
  await activate(actor, hands, index);
  return { done: true };
}

async function activate(actor: Actor.Implementation, hands: Hands, index: number) {
  hands.active = index;
  await saveHands(actor, hands);
  await equipActive(actor, hands);
}

/** The next (1) or previous (-1) set */
export function cycleHands(token: TokenDocument.Implementation, direction: 1 | -1) {
  const actor = token.actor as Actor.Implementation | null;
  if (!actor) return undefined;
  const { sets, active } = handsOf(actor);
  return switchHands(token, (active + direction + sets.length) % sets.length);
}

/** Equip the active set's items, unequip the other sets' (a character's; nothing else is touched) */
async function equipActive(actor: Actor.Implementation, hands: Hands): Promise<void> {
  if (npcLike(actor)) return;
  const wanted = new Set(hands.sets[hands.active].filter((id): id is string => !!id));
  const others = new Set(hands.sets.flat().filter((id): id is string => !!id && !wanted.has(id)));
  const updates = [...wanted, ...others].flatMap(id => {
    const item = actor.items.get(id);
    const equip = wanted.has(id);
    return item && !!sys(item).equipped !== equip ? [{ _id: id, "system.equipped": equip }] : [];
  });
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates as never);
}

export function registerHands() {
  registerInteraction(HANDS_INTERACTION, {
    label: "midi-qol.Hands.Switch",
    icon: "fa-solid fa-shuffle",
    targets: "self",
    cost: ({ subject, options }) => {
      const actor = subject.actor as Actor.Implementation | null;
      if (!actor || typeof options.index !== "number") return { object: 1 };
      const { free: _free, ...cost } = switchCost(actor, options.index);
      return cost;
    },
    // Only when a set is named (the hub, the keys): not in the Token HUD's list
    relevant: ({ options }) => typeof options.index === "number",
    available: ({ subject, options }) => {
      const actor = subject.actor as Actor.Implementation | null;
      const hands = actor ? handsOf(actor) : undefined;
      const index = options.index as number;
      if (!hands?.sets[index]) return i18n("midi-qol.Hands.NoSet");
      return hands.active === index ? i18n("midi-qol.Hands.Current") : undefined;
    },
    run: async ({ subject, options }) => {
      const actor = subject.actor as Actor.Implementation | null;
      if (!actor) return false;
      const hands = handsOf(actor);
      if (!hands.sets[options.index as number]) return false;
      // A draw or stow the Attack action allows: one of its attacks' allowance used
      const combatant = (subject as { combatant?: { combat?: { started?: boolean } } | null }).combatant;
      if (combatant?.combat?.started && switchCost(actor, options.index as number).free)
        await spend(actor, "action", { count: 0, counters: { attackDraws: Number(budget(actor, "action").counters.attackDraws ?? 0) + 1 } });
      await activate(actor, hands, options.index as number);
    }
  });
}

/** The next / previous set keys: the controlled token's (unbound by default) */
export function registerHandsKeys() {
  const cycle = (direction: 1 | -1) => () => {
    const token = canvas?.tokens?.controlled[0]?.document as TokenDocument.Implementation | undefined;
    if (!token?.actor?.isOwner) return false;
    void cycleHands(token, direction)?.then(result => { if (!result.done && result.reason) ui.notifications?.warn(result.reason); });
    return true;
  };
  game.keybindings?.register(MODULE_ID, "HandsNext", { name: "midi-qol.Hands.NextKey", hint: "midi-qol.Hands.KeyHint", editable: [], onDown: cycle(1) });
  game.keybindings?.register(MODULE_ID, "HandsPrevious", { name: "midi-qol.Hands.PreviousKey", hint: "midi-qol.Hands.KeyHint", editable: [], onDown: cycle(-1) });
}

export const handsApi = { get: handsOf, held: heldIn, attackMode: handsAttackMode, switch: switchHands, cycle: cycleHands, place: placeInHand, clear: clearHand, save: saveHands };
