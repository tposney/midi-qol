import { i18n } from "../../../midi-qol.js";

/*
 * M21c: midi's old Multiattack Automation sample item is gone (its Multiattack run replaced it: the two together would
 * attack twice). Copies on a world's actors (and unlinked tokens' own items) are found by its identifier; the active
 * GM is offered, once per world, to remove them all. With them, midi's old Legendary Resistance sample: its effect
 * (flags.midi-qol.optional.LegRes) would offer Legendary Resistance a second time beside the built-in one; only the
 * effect is removed, the item (the creature's Legendary Resistance and its text) stays.
 */

const IDENTIFIER = "multiattack-automation";
const SETTING = "multiattackSampleOffered" as const;

type Holder = { actor: Actor.Implementation, items: Item.Implementation[], effects: ActiveEffect.Implementation[] };

type WithChanges = { changes?: { key?: string }[], system?: { changes?: { key?: string }[] } };
const legResEffect = (effect: ActiveEffect.Implementation) =>
  ((effect as WithChanges).changes ?? (effect as WithChanges).system?.changes ?? []).some(change => change.key?.startsWith("flags.midi-qol.optional.LegRes"));

/** The actors carrying a copy: world actors, then unlinked tokens with their own copy */
export function sampleCopies(): Holder[] {
  const found: Holder[] = [];
  const consider = (actor: Actor.Implementation | null | undefined) => {
    if (!actor) return;
    const items = actor.items.filter(item => (item.system as { identifier?: string }).identifier === IDENTIFIER);
    const effects = actor.items.contents.flatMap(item => item.effects.filter(legResEffect));
    if ((items.length || effects.length) && !found.some(h => h.actor === actor)) found.push({ actor, items, effects });
  };
  for (const actor of game.actors ?? []) consider(actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens) if (!token.actorLink) consider(token.actor);
  return found;
}

export async function removeSampleCopies(holders: Holder[] = sampleCopies()): Promise<number> {
  let removed = 0;
  for (const { actor, items, effects } of holders) {
    if (items.length) await actor.deleteEmbeddedDocuments("Item", items.map(item => item.id ?? "").filter(Boolean));
    for (const effect of effects) if (!items.includes(effect.parent as Item.Implementation)) await effect.delete();
    removed += items.length + effects.length;
  }
  return removed;
}

async function offer() {
  if (!game.user?.isActiveGM || game.settings?.get("midi-qol", SETTING)) return;
  const holders = sampleCopies();
  if (!holders.length) return;
  const escape = foundry.utils.escapeHTML;
  const names = holders.map(h => `<li>${escape(h.actor.name ?? "")}</li>`).join("");
  const yes = await foundry.applications.api.DialogV2.confirm({
    window: { title: i18n("midi-qol.Multiattack.Retire.Title") },
    content: `<p>${i18n("midi-qol.Multiattack.Retire.Text")}</p><ul>${names}</ul>`,
    rejectClose: false
  });
  await game.settings?.set("midi-qol", SETTING, true);
  if (!yes) return;
  const removed = await removeSampleCopies(holders);
  ui.notifications?.info(i18n("midi-qol.Multiattack.Retire.Done").replace("{count}", String(removed)));
}

export function setupSampleRetirement() {
  game.settings?.register("midi-qol", SETTING, { scope: "world", config: false, type: Boolean, default: false });
  Hooks.once("ready", () => { void offer(); });
}
