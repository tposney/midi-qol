import { i18n } from "../../../midi-qol.js";
import type { Activity } from "../../../globals.js";
import { register } from "../../api/services.js";
import { onTurnEvent, type TurnEvent } from "../../lib/turnEvents.js";
import { configSettings } from "../../settings.js";
import { checkIncapacitated } from "../../utils.js";
import type { BonusCandidate, RollBonusQuery } from "../rollBonuses/service.js";

/*
 * M21 stage 2: legendary creatures (plan ~/Documents/midi-next-M21-plan-2026-11-24.md). All from dnd5e's data: the
 * legendary and lair activation types, each activity's cost (activation.value, spent from resources.legact by dnd5e
 * when the activity is used), the creature's legendary action count and its resets (turn end, encounter start), its
 * lair (resources.lair: 2014 lair actions on its initiative count; 2024 creatures get a legendary action more, which
 * dnd5e adds).
 * - Legendary actions: at the end of each other creature's turn the GM is offered, per legendary creature in the
 *   combat with uses left and able to act, its legendary activities it can pay for; one is used as an ordinary use.
 * - Lair actions: once a round, when the combat passes the creature's lair initiative (losing ties), the GM is offered
 *   its lair activities.
 * - Legendary Resistance: a roll bonus on a failed save of a creature with legendary resistances left: the save
 *   succeeds; spent as dnd5e's own resist does (resources.legres.spent + 1). Asked, or taken at once (setting).
 * Offers still open when the next one comes are closed (they are stale).
 */

type ActivityLike = Activity & { uuid: string, name?: string | null, img?: string | null, item: Item.Implementation, activation?: { type?: string, value?: number | null }, use(usage?: object, dialog?: object, message?: object): Promise<unknown> };
type Resources = { legact?: { max?: number, value?: number }, legres?: { max?: number, value?: number, spent?: number }, lair?: { value?: boolean, initiative?: number | null } };

const resources = (actor: Actor.Implementation | null | undefined): Resources => (actor?.system as { resources?: Resources } | undefined)?.resources ?? {};

const activitiesOfType = (actor: Actor.Implementation, types: readonly string[]): ActivityLike[] =>
  actor.items.contents.flatMap(item => ((item.system as { activities?: { contents?: ActivityLike[] } }).activities?.contents ?? [])
    .filter(activity => types.includes(activity.activation?.type ?? "")));

const cost = (activity: ActivityLike) => Math.max(1, Number(activity.activation?.value) || 1);

const able = (actor: Actor.Implementation) => {
  const hp = (actor.system as { attributes?: { hp?: { value?: number } } }).attributes?.hp?.value;
  return !(hp !== undefined && hp <= 0) && !checkIncapacitated(actor, false, false) && !actor.statuses.has("dead") && !actor.statuses.has("defeated");
};

/** The offers open now (closed when the next comes) */
const open = new Set<foundry.applications.api.DialogV2>();
async function closeOpen() {
  for (const dialog of [...open]) { open.delete(dialog); await dialog.close(); }
  closeHubOffers?.();
}
let closeHubOffers: (() => void) | undefined;
/** The presenter's own clean-up when a newer offer comes (stale ones dropped) */
export function setOfferCloser(close: (() => void) | undefined) { closeHubOffers = close; }

/** An offer for the GM: a creature's legendary or lair choices; the answer the activity chosen, or none */
export interface LegendaryOffer { actor: Actor.Implementation, title: string, reason: string, choices: { uuid: string, label: string, cost?: number }[] }
/** The chosen activity's uuid, undefined for none, or OFFER_DIALOG: the presenter gave it up (the hub closed), the dialog asks */
type OfferPresenter = (offer: LegendaryOffer) => Promise<string | undefined>;
export const OFFER_DIALOG = "midi-qol.offerDialog";
let presenter: OfferPresenter | undefined;
/** Where the offers are shown instead of a dialog (midi's hub while it runs for the GM); none: the dialog */
export function setOfferPresenter(next: OfferPresenter | undefined) { presenter = next; }

/** Ask the GM which of these to use now (or none); the chosen one is used as an ordinary use */
async function offer(actor: Actor.Implementation, title: string, reason: string, choices: ActivityLike[]): Promise<ActivityLike | undefined> {
  if (!choices.length) return undefined;
  if (presenter) {
    const uuid = await presenter({ actor, title, reason, choices: choices.map(a => ({ uuid: a.uuid, label: `${a.item.name ?? ""}${a.activation?.type === "lair" ? "" : ` (${cost(a)})`}`, ...(a.activation?.type === "lair" ? {} : { cost: cost(a) }) })) });
    if (uuid !== OFFER_DIALOG) return choices.find(a => a.uuid === uuid);
  }
  const escape = foundry.utils.escapeHTML;
  let dialog: foundry.applications.api.DialogV2 | undefined;
  const label = (a: ActivityLike) => {
    const several = ((a.item.system as { activities?: { size?: number } }).activities?.size ?? 1) > 1;
    const name = several ? `${a.item.name}: ${a.name}` : a.item.name ?? "";
    return a.activation?.type === "lair" ? name : `${name} (${i18n("midi-qol.Legendary.Cost").replace("{n}", String(cost(a)))})`;
  };
  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<p>${escape(reason)}</p>`,
    buttons: [
      ...choices.map((a, i) => ({ action: `use-${i}`, label: label(a), icon: a.img ? undefined : "fa-solid fa-crown" })),
      { action: "skip", label: i18n("midi-qol.Legendary.Skip"), default: true }
    ],
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => { dialog = app; open.add(app); }
  }) as string | null | undefined;
  if (dialog) open.delete(dialog);
  const index = typeof chosen === "string" && chosen.startsWith("use-") ? Number(chosen.slice(4)) : -1;
  return choices[index];
}

/** A combatant's turn ended: each other legendary creature able to act is offered its legendary actions */
async function legendaryAtTurnEnd({ combat, combatant }: TurnEvent) {
  if (!game.user?.isActiveGM || configSettings.legendaryActions === false || !combatant) return;
  await closeOpen();
  const ended = combatant.token?.name ?? combatant.name ?? "";
  for (const other of combat.combatants) {
    const actor = other.actor as Actor.Implementation | null;
    if (!actor || other === combatant || other.defeated || actor === combatant.actor) continue;
    const left = resources(actor).legact?.value ?? 0;
    if (!(resources(actor).legact?.max ?? 0) || left <= 0 || !able(actor)) continue;
    const choices = activitiesOfType(actor, ["legendary"]).filter(a => cost(a) <= left);
    const reason = i18n("midi-qol.Legendary.Reason").replace("{name}", ended).replace("{creature}", actor.name ?? "").replace("{left}", String(left));
    const chosen = await offer(actor, i18n("midi-qol.Legendary.Title").replace("{creature}", actor.name ?? ""), reason, choices);
    // Chosen in the offer: used without dnd5e's usage dialog (its cost spent as dnd5e spends it)
    if (chosen) await chosen.use({}, { configure: false });
  }
}

/** Lair actions offered this round, by combat id: the creatures already offered */
const lairOffered = new Map<string, { round: number, actors: Set<string> }>();

async function offerLair(combat: Combat.Implementation, before: (initiative: number) => boolean) {
  if (!game.user?.isActiveGM || configSettings.lairActions === false || !combat.id) return;
  let record = lairOffered.get(combat.id);
  if (!record || record.round !== combat.round) lairOffered.set(combat.id, record = { round: combat.round, actors: new Set() });
  for (const other of combat.combatants) {
    const actor = other.actor as Actor.Implementation | null;
    const count = resources(actor).lair?.initiative;
    if (!actor?.uuid || other.defeated || typeof count !== "number" || record.actors.has(actor.uuid) || !before(count)) continue;
    const choices = activitiesOfType(actor, ["lair"]);
    if (!choices.length) continue;
    record.actors.add(actor.uuid);
    await closeOpen();
    const reason = i18n("midi-qol.Lair.Reason").replace("{creature}", actor.name ?? "").replace("{count}", String(count));
    const chosen = await offer(actor, i18n("midi-qol.Lair.Title").replace("{creature}", actor.name ?? ""), reason, choices);
    // Chosen in the offer: used without dnd5e's usage dialog (its cost spent as dnd5e spends it)
    if (chosen) await chosen.use({}, { configure: false });
  }
}

/** A turn starts: lair actions whose count lies between the last turn's initiative and this one's (losing ties) */
async function lairAtTurnStart({ combat }: TurnEvent) {
  const turns = combat.turns;
  const index = combat.turn ?? 0;
  const now = turns[index]?.initiative ?? -Infinity;
  const previous = index > 0 ? (turns[index - 1]?.initiative ?? Infinity) : Infinity;
  await offerLair(combat, count => now < count && previous >= count);
}

/** A round ends: lair actions below everyone's initiative not offered yet */
async function lairAtRoundEnd({ combat }: TurnEvent) {
  await offerLair(combat, () => true);
}

/** Legendary Resistance as a roll bonus: a failed save succeeds, a legendary resistance spent */
function legendaryResistance(query: RollBonusQuery): BonusCandidate[] | undefined {
  const mode = configSettings.legendaryResistance ?? "ask";
  if (mode === "off" || query.kind !== "save") return undefined;
  const actor = query.actor;
  const legres = resources(actor).legres;
  if (!legres?.max || (legres.value ?? 0) <= 0) return undefined;
  // An optional bonus already spending the creature's legendary resistances (midi's old sample, a module's or the
  // GM's own flag counted against @resources.legres): not offered twice
  const optional = (actor.flags as { "midi-qol"?: { optional?: Record<string, unknown> } })["midi-qol"]?.optional ?? {};
  if (Object.values(optional).some(bonus => !!bonus && typeof bonus === "object" && String((bonus as { count?: unknown }).count ?? "").includes("legres"))) return undefined;
  const item = actor.items.find(i => (i.system as { identifier?: string }).identifier === "legendary-resistance");
  return [{
    id: "legendaryResistance",
    label: `${item?.name ?? i18n("midi-qol.Legendary.Resistance")} (${legres.value}/${legres.max})`,
    ...(item?.img ? { img: item.img } : {}),
    phases: ["postResult"], when: "failure",
    effect: { kind: "outcome", success: true },
    optional: mode !== "auto",
    spendsOwnCost: true,
    onChosen: async () => {
      const spent = resources(actor).legres?.spent ?? 0;
      await actor.update({ "system.resources.legres.spent": spent + 1 } as Actor.UpdateData);
    }
  }];
}

export function setupLegendary() {
  onTurnEvent("turnEnd", "midi-qol.legendaryActions", legendaryAtTurnEnd, { detached: true });
  onTurnEvent("turnStart", "midi-qol.lairActions", lairAtTurnStart, { detached: true });
  onTurnEvent("roundEnd", "midi-qol.lairActionsRoundEnd", lairAtRoundEnd, { detached: true });
  register("rollBonuses", "midi-qol.legendaryResistance", { kinds: ["save"], for: legendaryResistance });
}

/** The turn model's view: dnd5e's legendary action count, for a creature that has them */
export function legendaryState(actor: Actor.Implementation): { max: number, value: number } | undefined {
  const legact = resources(actor).legact;
  return legact?.max ? { max: legact.max, value: legact.value ?? 0 } : undefined;
}
