import { applySpellGroup, currentLoadout, currentSpellGroup, loadoutsOf, removeLoadout, removeSpellGroup, saveLoadout, saveSpellGroup, spellGroupBlocked, spellGroupsOf, swapLoadout } from "../../services/loadouts.js";
import { aroundMeOn } from "./layout.js";
import { knowledgeHtml, sinceLastTurnHtml } from "./recordViews.js";
import { explorationHtml, outOfCombatActions, outOfCombatHtml } from "./outOfCombat.js";
import { reminders, remindersOn } from "./reminders.js";
import { aroundMeHtml } from "./aroundMe.js";
import { configSettings } from "../../settings.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { listToggles, setToggle } from "../../lib/entries/offers.js";
import { setStandingChoice, STANDING_CHOICES, storedStandings, type StandingChoice } from "../../services/rollBonuses/standing.js";
import { forgetChoice, rememberedChoices } from "../../lib/rememberedChoices.js";
import { heldRequests, incomingRequests, type IncomingRequest, type InlineChoice } from "../../lib/requests.js";
import { METAMAGIC_OPTIONS, quickenHint } from "../../services/useOptions/metamagic.js";
import { i18n } from "../../../midi-qol.js";
import type { ActivityCell, TurnModel } from "../../services/turnModel/model.js";
import { escape, registerHubSection, type HubContext } from "./sections.js";
import { takeDash, takeDisengage } from "../../services/economy/movement.js";
import { runInteraction } from "../../services/interactions/registry.js";
import { deferredUses, dropDeferred, releaseDeferred } from "../../lib/deferred.js";
import { heldUses } from "../../lib/holds.js";
import { HoldPanel } from "../HoldPanel.js";
import { combatOfToken } from "../../lib/tokenResolver.js";
import { isMultiattackItem } from "../../services/multiattack/plans.js";
import { MidiActivityChoiceDialog } from "../MidiActivityChoiceDialog.js";
import { useOrPrime } from "../../services/clickToAttack/service.js";
import type { Activity } from "../../../globals.js";

/*
 * M27: midi's own hub sections. Left: the creature's state and its economy. Centre: its bar (the user's own, else the
 * sheet's favourites and its attacks), the tabs of everything else, and an NPC's Multiattack. Right: what's waiting
 * (requests, readied uses, the GM's holds, legendary and lair offers) and the turn (End turn, with what's unused).
 * Cost marks: one shape and colour per cost, on the pips and on every button that spends it.
 */

type Kind = "action" | "bonus" | "reaction" | "legendary" | "lair" | "free" | "other";

/** What a use costs, as a mark */
function costKind(cell: ActivityCell): Kind {
  if (cell.multiattack) return "free";
  if (cell.activation === "legendary" || cell.activation === "mythic") return "legendary";
  if (cell.activation === "lair") return "lair";
  if (cell.cost.action) return "action";
  if (cell.cost.bonus) return "bonus";
  if (cell.cost.reaction) return "reaction";
  if (cell.activation === "action") return "free";
  return "other";
}
const mark = (kind: Kind | "movement", spent = false) => `<span class="midi-hub-mark midi-hub-mark-${kind}${spent ? " midi-hub-spent" : ""}"></span>`;

/** A button that uses the activity (greyed with its reason when it can't) */
function useButton(cell: ActivityCell, options: { barIndex?: number, removable?: boolean, uuid?: string } = {}): string {
  const kind = costKind(cell);
  const several = cell.name && cell.name !== cell.itemName;
  const title = several ? `${cell.itemName}: ${cell.name}` : cell.itemName;
  const tip = [`<strong>${escape(title)}</strong>`, escape(i18n(`midi-qol.Hub.Cost.${kind}`)),
    ...(cell.uses ? [`${cell.uses.value}/${cell.uses.max}`] : []), ...(cell.spellLevel ? [i18n("midi-qol.Hub.SlotsLeft").replace("{n}", String(cell.slotsLeft ?? 0))] : []),
    ...(cell.reason ? [`<em>${escape(cell.reason)}</em>`] : []), ...quicken(cell),
    ...(options.removable ? [`<span class="hint">${escape(i18n("midi-qol.Hub.RightClickRemove"))}</span>`] : [])].join("<br>");
  // Blocked: greyed; an issue the policy only shows (action used, with enforcement off): marked, still usable
  const state = !cell.usable ? " midi-hub-unusable" : cell.issues.length ? " midi-hub-marked" : "";
  return `<button type="button" class="midi-hub-use${state}${cell.multiattack ? " midi-hub-allowed" : ""}" draggable="true"
    data-hub-action="use" data-uuid="${escape(cell.uuid)}" data-entry="${escape(options.uuid ?? cell.uuid)}" data-preview="${escape(cell.uuid)}"${options.barIndex !== undefined ? ` data-bar-index="${options.barIndex}" data-hub-context="remove"` : ""}
    data-tooltip-html="${escape(tip)}" data-tooltip-direction="UP">
    <img src="${escape(cell.img)}" alt="">${mark(kind)}${cell.uses ? `<span class="midi-hub-count">${cell.uses.value}</span>` : ""}</button>`;
}

const itemOf = (cell: ActivityCell) => fromUuidSync(cell.itemUuid) as Item.Implementation | null;
/** A spell cast with an action the caster can Quicken: said in its tooltip */
const quicken = (cell: ActivityCell) => { const hint = quickenHint(itemOf(cell), cell.activation); return hint ? [`<span class="hint">${escape(hint)}</span>`] : []; };
const isAttack = (cell: ActivityCell) => cell.type === "attack";

/** A bar or tab entry: an item (one button; its choices) or one activity */
interface Entry { uuid: string, item: boolean, cells: ActivityCell[] }

/** What the hub offers: what midi's chooser lists (no module-hidden activity), no unprepared spell, no after-cast
 * activity (those are in the Active group while their spell runs) */
/** A metamagic option's feature: chosen when a spell is cast (use options), not a use of its own */
const isMetamagic = (cell: ActivityCell) => METAMAGIC_OPTIONS.includes((itemOf(cell) as { identifier?: string } | null)?.identifier ?? "");
const offered = (model: TurnModel) => model.activities.filter(c => !c.hidden && !c.unprepared && !c.afterCast && !isMetamagic(c) && !isMultiattackItem(itemOf(c) as Item.Implementation));

/** A running spell's after-cast activity (Spiritual Weapon's attack, Flaming Sphere's Ram) */
const runningAfterCast = (c: ActivityCell) => c.afterCast && c.running && !c.unprepared && !c.hidden;

/** An item something in effect gave the creature: created by an effect (DAE), dependent on another document (dnd5e
 * riders, summons' items), or carrying an applied enchantment (Shillelagh's club, Magic Weapon) */
function isGranted(item: Item.Implementation | null): boolean {
  if (!item) return false;
  const flags = item.flags as { dae?: { DAECreated?: boolean }, dnd5e?: { dependentOn?: string } };
  if (flags.dae?.DAECreated || flags.dnd5e?.dependentOn) return true;
  return item.effects.some(e => (e as { isAppliedEnchantment?: boolean }).isAppliedEnchantment === true);
}

/** Uses that something in use gives: running spells' after-cast activities and granted items' activities */
const isActiveCell = (c: ActivityCell) => runningAfterCast(c) || (!c.hidden && !c.unprepared && isGranted(itemOf(c)));

/** Everything the hub offers in its lists: what's offered, and a running spell's after-cast activities with its casting */
const available = (model: TurnModel) => [...offered(model), ...model.activities.filter(runningAfterCast)];

/** A filter: a cost, or "active" (what something in use gives); "" matches all */
const matches = (c: ActivityCell, filter: string) => !filter || (filter === "active" ? isActiveCell(c) : costKind(c) === filter);

/** One entry per item, in the cells' order */
function itemEntries(cells: ActivityCell[]): Entry[] {
  const byItem = new Map<string, Entry>();
  for (const cell of cells) {
    const entry = byItem.get(cell.itemUuid) ?? { uuid: cell.itemUuid, item: true, cells: [] };
    entry.cells.push(cell);
    byItem.set(cell.itemUuid, entry);
  }
  return [...byItem.values()];
}

/** A stored or favourite uuid as an entry: an item's (its offered activities) or one activity's */
function entryFor(model: TurnModel, uuid: string): Entry | undefined {
  const cells = available(model);
  const one = cells.find(c => c.uuid === uuid);
  if (one) return { uuid, item: false, cells: [one] };
  const ofItem = cells.filter(c => c.itemUuid === uuid);
  return ofItem.length ? { uuid, item: true, cells: ofItem } : undefined;
}

/** The user's own bar for this creature (item or activity uuids), else the sheet's favourites then its attack items */
function barEntries(ctx: HubContext): { entries: Entry[], own: boolean } {
  const own = game.user?.flags?.["midi-qol"]?.hubBars?.find(b => b.actor === ctx.actor.uuid);
  if (own) return { entries: own.entries.map(uuid => entryFor(ctx.model, uuid)).filter((e): e is Entry => !!e), own: true };
  const favourites = ((ctx.actor.system as { favorites?: { type?: string, id?: string }[] }).favorites ?? []).flatMap(f => {
    if (!f.id || (f.type !== "item" && f.type !== "activity")) return [];
    const uuid = (fromUuidSync(f.id, { relative: ctx.actor as never }) as { uuid?: string } | null)?.uuid;
    const entry = uuid ? entryFor(ctx.model, uuid) : undefined;
    return entry ? [entry] : [];
  });
  const listed = new Set(favourites.flatMap(e => e.cells.map(c => c.itemUuid)));
  const attacks = itemEntries(offered(ctx.model).filter(isAttack)).filter(e => !listed.has(e.uuid))
    .map(e => entryFor(ctx.model, e.uuid)!);
  return { entries: [...favourites, ...attacks], own: false };
}

async function saveBar(ctx: HubContext, entries: string[] | undefined) {
  const bars = (game.user?.flags?.["midi-qol"]?.hubBars ?? []).filter(b => b.actor !== ctx.actor.uuid);
  await game.user?.setFlag("midi-qol", "hubBars", entries ? [...bars, { actor: ctx.actor.uuid ?? "", entries }] : bars);
}

const TABS = ["bar", "weapons", "spells", "features", "items", "actions", "loadouts", "resources", "around", "choices"] as const;

type Recovery = { period?: string };
type UsesData = { value?: number, max?: number | string, recovery?: Recovery[] };
/** What gives a resource back, as a label (the first period: Long rest, Short rest, Dawn...) */
function recoveryLabel(recovery: Recovery[] | undefined): string {
  const period = recovery?.[0]?.period;
  const periods = (CONFIG as unknown as { DND5E: { limitedUsePeriods: Record<string, { label?: string, abbreviation?: string }> } }).DND5E.limitedUsePeriods;
  return period ? i18n(periods[period]?.label ?? period) : "";
}

/** The Resources tab: spell slots, hit dice and every use that recovers, with what gives it back */
function resourcesHtml(actor: Actor.Implementation): string {
  const system = actor.system as { spells?: SpellSlots, attributes?: { hd?: { value?: number, max?: number } } };
  const row = (label: string, value: number, max: number, when: string) => `<div class="midi-hub-resource${value <= 0 ? " midi-hub-no-slots" : ""}">
    <span class="midi-hub-label">${escape(label)}</span><span class="midi-hub-resource-count">${value}/${max}</span>${when ? `<span class="hint">${escape(when)}</span>` : ""}</div>`;
  const rows: string[] = [];
  const spells = system.spells ?? {};
  const longRest = i18n("DND5E.REST.Long.Label");
  const shortRest = i18n("DND5E.REST.Short.Label");
  for (let level = 1; level <= 9; level++) {
    const slot = spells[`spell${level}`];
    if (Number(slot?.max)) rows.push(row(i18n("midi-qol.Hub.Level").replace("{n}", String(level)), Number(slot?.value ?? 0), Number(slot?.max), longRest));
  }
  const pact = spells.pact;
  if (Number(pact?.max)) rows.push(row(i18n("midi-qol.Hub.PactSlots").replace("{n}", String(pact?.level ?? "")), Number(pact?.value ?? 0), Number(pact?.max), shortRest));
  const hd = system.attributes?.hd;
  if (Number(hd?.max)) rows.push(row(i18n("DND5E.HitDice"), Number(hd?.value ?? 0), Number(hd?.max), longRest));
  for (const item of actor.items) {
    const uses = (item.system as { uses?: UsesData }).uses;
    if (!Number(uses?.max) || !uses?.recovery?.length) continue;
    rows.push(row(item.name ?? "", Number(uses.value ?? 0), Number(uses.max), recoveryLabel(uses.recovery)));
  }
  return rows.join("");
}

/** The Choices tab: the creature's toggles, its bonuses' standing choices and its remembered choices (the sheet's
 * Toggles and choices window), changed at once; shown when it has any */
const hasChoices = (actor: Actor.Implementation) => !!(listToggles(actor).length || storedStandings(actor).length || rememberedChoices(actor).length);
function choicesHtml(actor: Actor.Implementation): string {
  const toggles = listToggles(actor).map(t => `<label class="checkbox midi-hub-choice"><input type="checkbox" data-hub-action="choiceToggle" data-key="${escape(t.key)}"${t.on ? " checked" : ""}> ${escape(t.label)}</label>`).join("");
  const standings = storedStandings(actor).map(s => `<div class="midi-hub-choice"><span class="midi-hub-label">${escape(s.label)}</span>${STANDING_CHOICES.map(c =>
    `<button type="button" class="midi-hub-standing${c === s.choice ? " active" : ""}" data-hub-action="standing" data-key="${escape(s.key)}" data-label="${escape(s.label)}" data-choice="${c}">${escape(i18n(`midi-qol.Standing.${c}`))}</button>`).join("")}</div>`).join("");
  const remembered = rememberedChoices(actor).map(c => `<div class="midi-hub-choice"><span class="midi-hub-label">${escape(c.label)}: ${escape(c.valueLabel ?? String(c.value))}</span>
    <button type="button" data-hub-action="forgetChoice" data-key="${escape(c.key)}">${escape(i18n("midi-qol.RememberChoice.Forget"))}</button></div>`).join("");
  return [toggles && `<div class="midi-hub-row midi-hub-choices-toggles">${toggles}</div>`,
    standings && `<p class="hint">${escape(i18n("midi-qol.Standing.Hint"))}</p>${standings}`,
    remembered && `<p class="hint">${escape(i18n("midi-qol.RememberChoice.Hint"))}</p>${remembered}`].filter(Boolean).join("");
}
/** A tab's entries, narrowed by a filter to the choices that match it (an entry with none dropped) */
function tabEntries(model: TurnModel, tab: string, filter = ""): Entry[] {
  return itemEntries(available(model).filter(cell => matches(cell, filter)).filter(cell => {
    const type = itemOf(cell)?.type as string | undefined;
    switch (tab) {
      case "weapons": return type === "weapon";
      case "spells": return type === "spell";
      case "features": return type === "feat";
      case "items": return !!type && !["weapon", "spell", "feat"].includes(type);
      default: return false;
    }
  }));
}

/** The filters offered, in order: what something in use gives, then the costs; "other" is Special (no activation,
 * dnd5e's special, minutes and longer) */
const FILTERS = ["active", "action", "bonus", "reaction", "other", "legendary"] as const;
const LISTS = ["weapons", "spells", "features", "items"] as const;

/** The filter chips: All, then each filter the creature has a use for (in the open tab, else in all of them), with its
 * count of usable ones. With a tab open a chip narrows the tab; with none it lists that filter's uses across them */
function filterChips(ctx: HubContext, { labelled = false }: { labelled?: boolean } = {}): string {
  const tabs = ctx.tab !== "bar" && ctx.tab !== "actions" ? [ctx.tab] : [...LISTS];
  const counts = FILTERS.map(kind => {
    const entries = tabs.flatMap(tab => tabEntries(ctx.model, tab, kind));
    return { kind, n: entries.filter(e => e.cells.some(c => c.usable)).length, any: entries.length > 0 };
  }).filter(f => f.any || f.kind === ctx.filter);
  if (!counts.length) return "";
  const icon = (kind: string) => kind === "active" ? `<i class="fa-solid fa-wand-sparkles"></i>` : mark(kind as Kind);
  const name = (kind: string) => i18n(kind === "active" ? "midi-qol.Hub.Active" : `midi-qol.Hub.Cost.${kind}`);
  // In a list's drawer: each filter named (the bar's row keeps the marks and counts)
  return `<div class="midi-hub-filters${labelled ? " midi-hub-filters-labelled" : ""}"><a class="midi-hub-filter${ctx.filter ? "" : " active"}" data-hub-action="filter" data-filter="">${escape(i18n("midi-qol.Hub.All"))}</a>${counts.map(f =>
    `<a class="midi-hub-filter midi-hub-filter-${f.kind}${ctx.filter === f.kind ? " active" : ""}" data-hub-action="filter" data-filter="${f.kind}" data-tooltip="${escape(i18n(f.kind === "active" ? "midi-qol.Hub.ActiveHint" : `midi-qol.Hub.Cost.${f.kind}`))}">${icon(f.kind)}${labelled ? ` ${escape(name(f.kind))}` : ""} ${f.n}</a>`).join("")}</div>`;
}

/** An entry's button: one activity's, or an item's (its choices in a menu on click; one choice used directly) */
function entryButton(entry: Entry, options: { barIndex?: number, removable?: boolean } = {}): string {
  if (entry.cells.length === 1) return useButton(entry.cells[0], { ...options, uuid: entry.uuid });
  const item = itemOf(entry.cells[0]);
  const kinds = [...new Set(entry.cells.map(costKind))];
  const usable = entry.cells.some(c => c.usable);
  const marked = usable && entry.cells.every(c => c.issues.length);
  const first = entry.cells.find(c => c.usable) ?? entry.cells[0];
  const tip = [`<strong>${escape(item?.name ?? first.itemName)}</strong>`,
    ...entry.cells.map(c => `${mark(costKind(c))} ${escape(c.name)}${c.reason ? ` <em>${escape(c.reason)}</em>` : ""}`),
    ...(first.spellLevel ? [i18n("midi-qol.Hub.SlotsLeft").replace("{n}", String(first.slotsLeft ?? 0))] : []),
    ...(options.removable ? [`<span class="hint">${escape(i18n("midi-qol.Hub.RightClickRemove"))}</span>`] : [])].join("<br>");
  return `<button type="button" class="midi-hub-use midi-hub-choices${usable ? (marked ? " midi-hub-marked" : "") : " midi-hub-unusable"}" draggable="true"
    data-hub-action="choose" data-uuid="${escape(entry.uuid)}" data-preview="${escape(first.uuid)}"${options.barIndex !== undefined ? ` data-bar-index="${options.barIndex}" data-hub-context="remove"` : ""}
    data-tooltip-html="${escape(tip)}" data-tooltip-direction="UP">
    <img src="${escape(item?.img ?? first.img)}" alt="">${mark(kinds.length === 1 ? kinds[0] : costKind(first))}<span class="midi-hub-count">${entry.cells.length}</span></button>`;
}

/** The menu of an item's choices: midi's chooser's list (its filter and the modules' prune hook) that the hub offers */
async function openChoices(ctx: HubContext, button: HTMLElement) {
  document.querySelectorAll(".midi-hub-menu").forEach(m => m.remove());
  const entry = entryFor(ctx.model, button.dataset.uuid ?? "");
  const item = entry ? itemOf(entry.cells[0]) : null;
  if (!entry || !item) return;
  const listed = (await MidiActivityChoiceDialog.getActivities(item)).map((a: { id: string }) => a.id);
  const cells = entry.cells.filter(c => listed.includes(c.uuid.split(".").pop() ?? "") && matches(c, ctx.filter));
  if (cells.length === 1) {
    const activity = fromUuidSync(cells[0].uuid) as Activity | null;
    if (cells[0].usable && activity) { ctx.afterUse(); await useOrPrime(activity); }
    return;
  }
  if (!cells.length) return;
  const menu = document.createElement("div");
  menu.className = "midi-hub-menu";
  menu.innerHTML = `<div class="midi-hub-label">${escape(item.name)}</div>` + cells.map(c => `<button type="button" class="midi-hub-menu-choice${c.usable ? "" : " midi-hub-unusable"}"
    data-hub-action="use" data-uuid="${escape(c.uuid)}" data-preview="${escape(c.uuid)}"${c.reason ? ` data-tooltip="${escape(c.reason)}"` : ""}>${mark(costKind(c))} ${escape(c.name)}${c.uses ? ` <span class="midi-hub-label">${c.uses.value}/${c.uses.max}</span>` : ""}</button>`).join("");
  button.closest("[data-section]")?.append(menu);
  const rect = button.getBoundingClientRect();
  const host = (button.closest("[data-section]") as HTMLElement).getBoundingClientRect();
  menu.style.left = `${rect.left - host.left}px`;
  menu.style.bottom = `${host.bottom - rect.top + 4}px`;
  const close = (event: Event) => {
    if ((event as KeyboardEvent).key && (event as KeyboardEvent).key !== "Escape") return;
    setTimeout(() => menu.remove(), 0);
    document.removeEventListener("click", close, true);
    document.removeEventListener("keydown", close, true);
  };
  setTimeout(() => { document.addEventListener("click", close, true); document.addEventListener("keydown", close, true); }, 0);
}

/** Requests answered inline in the hub (its presenter, setup.ts): the choice, and how to answer */
export const inlineAsks: { request: IncomingRequest, choice: InlineChoice, resolve(values: string[] | undefined): void }[] = [];

/** The inbox: what this user is asked (inline when it can be, else a line to bring its window forward), and what this
 * client waits on from others; each with its countdown */
function inboxHtml(): string {
  const parts: string[] = [];
  const ends = (ms: number) => ms > 0 ? ` <span class="midi-hub-countdown" data-ends="${Date.now() + ms}">${Math.ceil(ms / 1000)}s</span>` : "";
  inlineAsks.forEach((ask, index) => {
    const choices = ask.choice.choices.map(c => ask.choice.multiple
      ? `<label class="checkbox"${c.hint ? ` data-tooltip="${escape(c.hint)}"` : ""}><input type="checkbox" data-inbox-value="${escape(c.value)}">${c.img ? `<img src="${escape(c.img)}" alt="">` : ""} ${escape(c.label)}</label>`
      : `<button type="button" data-hub-action="inboxAnswer" data-ask="${index}" data-value="${escape(c.value)}"${c.hint ? ` data-tooltip="${escape(c.hint)}"` : ""}>${escape(c.label)}</button>`).join("");
    parts.push(`<div class="midi-hub-offer midi-hub-inbox" data-ask="${index}"><div class="midi-hub-label">${escape(ask.choice.title)}${ends(ask.request.remaining)}</div>
      ${ask.choice.hint ? `<div class="hint">${escape(ask.choice.hint)}</div>` : ""}${choices}
      ${ask.choice.multiple ? `<button type="button" data-hub-action="inboxAnswer" data-ask="${index}">${escape(i18n("midi-qol.Use"))}</button>` : ""}
      ${ask.choice.none !== false ? `<button type="button" data-hub-action="inboxAnswer" data-ask="${index}" data-none="1">${escape(i18n("midi-qol.UseOptions.None"))}</button>` : ""}
      ${ask.choice.dialog !== false ? `<a data-hub-action="inboxAnswer" data-ask="${index}" data-dialog="1" data-tooltip="${escape(i18n("midi-qol.Inbox.DialogHint"))}"><i class="fa-solid fa-window-restore"></i> ${escape(i18n("midi-qol.Inbox.Dialog"))}</a>` : ""}</div>`);
  });
  const inline = new Set(inlineAsks.map(a => a.request));
  for (const request of incomingRequests().filter(r => !inline.has(r))) {
    const label = request.meta.label || i18n("midi-qol.Hub.Asked");
    parts.push(`<div class="midi-hub-note midi-hub-inbox-owed"><i class="fa-solid fa-inbox"></i> ${escape(label)}${ends(request.remaining)}
      ${request.window ? `<a data-hub-action="inboxShow" data-id="${escape(request.id)}" data-tooltip="${escape(i18n("midi-qol.Hub.ShowRequest"))}"><i class="fa-solid fa-up-right-from-square"></i></a>` : ""}</div>`);
  }
  for (const request of heldRequests().filter(r => r.pending && r.spec.userId && r.spec.userId !== game.userId)) {
    const user = game.users?.get(request.spec.userId!)?.name ?? "";
    const actor = request.spec.actorUuid ? (fromUuidSync(request.spec.actorUuid) as { name?: string } | null)?.name : undefined;
    parts.push(`<div class="midi-hub-note midi-hub-inbox-waiting"><i class="fa-solid fa-hourglass-half"></i> ${escape(i18n("midi-qol.Hub.WaitingFor").replace("{user}", user))}${actor ? ` (${escape(actor)})` : ""}${ends(request.deadline.remaining)}</div>`);
  }
  return parts.join("");
}

/** Offers the GM is to answer in the hub (legendary and lair): set by the hub's presenter */
export const hubOffers: { actor: Actor.Implementation, title: string, reason: string, choices: { uuid: string, label: string }[], resolve(uuid: string | undefined): void }[] = [];

type SpellSlots = Record<string, { value?: number, max?: number, level?: number }>;

/** A spell level's slots (pact slots of that level or higher counted with them): pips, and whether any is left at or above it */
function slotInfo(actor: Actor.Implementation, level: number): { pips: string, none: boolean } {
  const spells = (actor.system as { spells?: SpellSlots }).spells ?? {};
  const own = spells[`spell${level}`] ?? {};
  const max = Number(own.max ?? 0), value = Number(own.value ?? 0);
  const pips = Array.from({ length: max }, (_, i) => `<span class="midi-hub-slot${i >= value ? " midi-hub-spent" : ""}"></span>`).join("");
  let left = 0;
  for (let l = level; l <= 9; l++) left += Number(spells[`spell${l}`]?.value ?? 0);
  if (Number(spells.pact?.level ?? 0) >= level) left += Number(spells.pact?.value ?? 0);
  return { pips, none: left === 0 };
}

/** Spells a level, each with its slots; a level with no slot left at or above it greyed (cantrips and slotless casting aside) */
function spellsHtml(ctx: HubContext): string {
  const byLevel = new Map<number, Entry[]>();
  for (const entry of tabEntries(ctx.model, "spells", ctx.filter)) {
    const level = (itemOf(entry.cells[0])?.system as { level?: number } | undefined)?.level ?? 0;
    byLevel.set(level, [...(byLevel.get(level) ?? []), entry]);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const name = (level: number) => level ? i18n("midi-qol.Hub.Level").replace("{n}", String(level)) : i18n("midi-qol.Hub.Cantrips");
  const jump = levels.length > 3 ? `<div class="midi-hub-levels">${levels.map(level => `<a data-hub-action="jump" data-level="${level}">${level || "C"}</a>`).join("")}</div>` : "";
  return jump + levels.map(level => {
    const slots = level ? slotInfo(ctx.actor, level) : { pips: "", none: false };
    const slotless = byLevel.get(level)!.every(e => !(itemOf(e.cells[0])?.system as { canScale?: boolean } | undefined)?.canScale);
    return `<div class="midi-hub-row midi-hub-level${slots.none && !slotless ? " midi-hub-no-slots" : ""}" data-level="${level}">
      <span class="midi-hub-label">${escape(name(level))}<span class="midi-hub-slots">${slots.pips}</span></span>${byLevel.get(level)!.map(e => entryButton(e)).join("")}</div>`;
  }).join("");
}

/** The drawer: a tab's contents or a cost filter's (everything with that cost, a row per category), above the bar */
/** The Loadouts tab: weapon sets (swap: the free object interaction in combat) and spell groups (out of combat); save
 * what is equipped or prepared now, right-click to remove */
function loadoutsHtml(actor: Actor.Implementation): string {
  const sets = loadoutsOf(actor);
  const current = currentLoadout(actor);
  const weapons = `<div class="midi-hub-row midi-hub-loadouts"><span class="midi-hub-label">${escape(i18n("midi-qol.Loadout.Title"))}</span>${sets.map((set, index) =>
    `<button type="button" class="midi-hub-action${index === current ? " active" : ""}" data-hub-action="loadout" data-index="${index}" data-hub-context="removeLoadout"
      data-tooltip="${escape(i18n(index === current ? "midi-qol.Loadout.Current" : "midi-qol.Loadout.SwapHint"))}"><i class="fa-solid fa-shuffle"></i> ${escape(set.name)}</button>`).join("")}
    <button type="button" class="midi-hub-action" data-hub-action="saveLoadout" data-tooltip="${escape(i18n("midi-qol.Loadout.SaveHint"))}"><i class="fa-solid fa-floppy-disk"></i> ${escape(i18n("midi-qol.Loadout.Save"))}</button></div>`;
  const hasSpells = actor.items.some(i => (i.type as string) === "spell");
  if (!hasSpells) return weapons;
  const groups = spellGroupsOf(actor);
  const prepared = currentSpellGroup(actor);
  const blocked = spellGroupBlocked(actor);
  const spells = `<div class="midi-hub-row midi-hub-spell-groups"><span class="midi-hub-label">${escape(i18n("midi-qol.SpellGroup.Title"))}</span>${groups.map((group, index) => {
    const names = group.spells.map(id => actor.items.get(id)?.name).filter(Boolean).join(", ");
    const tip = [index === prepared ? i18n("midi-qol.SpellGroup.Current") : blocked ?? i18n("midi-qol.SpellGroup.ApplyHint"), names].filter(Boolean).join("<br>");
    return `<button type="button" class="midi-hub-action${index === prepared ? " active" : ""}${blocked && index !== prepared ? " midi-hub-unusable" : ""}" data-hub-action="spellGroup" data-index="${index}" data-hub-context="removeSpellGroup"
      data-tooltip="${escape(tip)}"><i class="fa-solid fa-book"></i> ${escape(group.name)}</button>`;
  }).join("")}
    <button type="button" class="midi-hub-action" data-hub-action="saveSpellGroup" data-tooltip="${escape(i18n("midi-qol.SpellGroup.SaveHint"))}"><i class="fa-solid fa-floppy-disk"></i> ${escape(i18n("midi-qol.Loadout.Save"))}</button></div>`;
  return weapons + spells;
}

function drawerHtml(ctx: HubContext): string {
  let title = "";
  let body = "";
  const filterName = ctx.filter === "active" ? i18n("midi-qol.Hub.Active") : ctx.filter ? i18n(`midi-qol.Hub.Cost.${ctx.filter}`) : "";
  if (ctx.filter && (ctx.tab === "bar" || ctx.tab === "actions")) {
    // A filter on its own: its uses in every list, what something in use gives first
    title = filterName;
    const active = ctx.filter === "active" ? [] : itemEntries(ctx.model.activities.filter(c => isActiveCell(c) && matches(c, ctx.filter)));
    body = [
      ...(active.length ? [`<div class="midi-hub-row midi-hub-active-row"><span class="midi-hub-label">${escape(i18n("midi-qol.Hub.Active"))}</span>${active.map(e => entryButton(e)).join("")}</div>`] : []),
      ...LISTS.map(tab => {
        const entries = tabEntries(ctx.model, tab, ctx.filter);
        return entries.length ? `<div class="midi-hub-row midi-hub-filtered"><span class="midi-hub-label">${escape(i18n(`midi-qol.Hub.Tab.${tab}`))}</span>${entries.map(e => entryButton(e)).join("")}</div>` : "";
      })
    ].join("");
  } else if (ctx.tab === "resources") {
    title = i18n("midi-qol.Hub.Tab.resources");
    body = resourcesHtml(ctx.actor);
  } else if (ctx.tab === "choices") {
    title = i18n("midi-qol.Hub.Tab.choices");
    body = choicesHtml(ctx.actor);
  } else if (ctx.tab === "actions") {
    title = i18n("midi-qol.Hub.Tab.actions");
    const offers = [...ctx.model.interactions.self, ...ctx.model.interactions.target].map(o =>
      `<button type="button" class="midi-hub-action${o.reason ? " midi-hub-unusable" : ""}" data-hub-action="interaction" data-id="${escape(o.id)}" data-tooltip="${escape(o.reason ?? o.hint ?? "")}">${o.icon ? `<i class="${escape(o.icon)}"></i> ` : ""}${escape(i18n(o.label))}</button>`);
    const own = ctx.model.economy.movement ? [
      `<button type="button" class="midi-hub-action" data-hub-action="dash">${mark("action")} ${escape(i18n("midi-qol.Hub.Dash"))}</button>`,
      `<button type="button" class="midi-hub-action" data-hub-action="disengage">${mark("action")} ${escape(i18n("midi-qol.Hub.Disengage"))}</button>`] : [];
    // Out of combat: the exploration actions, each its skills
    body = `<div class="midi-hub-actions">${[...own, ...offers].join("")}</div>${ctx.model.inCombat ? "" : explorationHtml()}`;
  } else if (ctx.tab === "around") {
    title = i18n("midi-qol.Hub.Tab.around");
    body = aroundMeHtml(ctx.token, ctx.actor);
  } else if (ctx.tab === "loadouts") {
    title = i18n("midi-qol.Hub.Tab.loadouts");
    body = loadoutsHtml(ctx.actor);
  } else if (ctx.tab === "spells") {
    title = i18n("midi-qol.Hub.Tab.spells") + (filterName ? ` · ${filterName}` : "");
    body = spellsHtml(ctx);
  } else {
    title = i18n(`midi-qol.Hub.Tab.${ctx.tab}`) + (filterName ? ` · ${filterName}` : "");
    const entries = tabEntries(ctx.model, ctx.tab, ctx.filter);
    body = entries.length ? `<div class="midi-hub-row">${entries.map(e => entryButton(e)).join("")}</div>` : "";
  }
  // A list's drawer filters by cost in its header
  const chips = LISTS.includes(ctx.tab as typeof LISTS[number]) ? filterChips(ctx, { labelled: true }) : "";
  return `<div class="midi-hub-drawer">
    <header class="midi-hub-drawer-header"><span>${escape(title)}</span>${chips}
      <a data-hub-action="drawerPin" class="${ctx.pinned ? "active" : ""}" data-tooltip="${escape(i18n(ctx.pinned ? "midi-qol.Hub.Unpin" : "midi-qol.Hub.Pin"))}"><i class="fa-solid fa-thumbtack"></i></a>
      <a data-hub-action="drawerClose" data-tooltip="${escape(i18n("Close"))}"><i class="fa-solid fa-xmark"></i></a></header>
    <div class="midi-hub-drawer-body">${body || `<span class="hint">${escape(i18n("midi-qol.Hub.Nothing"))}</span>`}</div>
  </div>`;
}

export function registerMidiHubSections() {
  // State: portrait, HP, AC, speed, concentration, conditions, what ends soon
  registerHubSection({
    id: "midi-qol.state", area: "left", order: 10,
    render: ({ actor, token, model }) => {
      const sys = actor.system as { attributes?: { hp?: { value?: number, max?: number, temp?: number, pct?: number, bloodied?: number }, ac?: { value?: number } } };
      const hp = sys.attributes?.hp ?? {};
      // The damage card's heart; cracked when bloodied (dnd5e's test: pct at or below the actor's threshold, a percent,
      // and not full), a skull at 0
      const value = hp.value ?? 0;
      const bloodied = hp.pct !== undefined && hp.bloodied !== undefined && hp.pct < 100 && hp.pct <= hp.bloodied;
      const hpState = value <= 0 ? "down" : bloodied ? "bloodied" : "healthy";
      const hpIcon = { down: "fa-skull", bloodied: "fa-heart-crack", healthy: "fa-heart" }[hpState];
      const hpTip = [i18n("midi-qol.Hub.HP"), ...(hpState === "bloodied" ? [i18n("midi-qol.Hub.Bloodied")] : [])].join(": ");
      const conditions = [...actor.statuses].map(id => CONFIG.statusEffects.find(s => s.id === id)).filter(Boolean)
        .map(s => `<img class="midi-hub-condition" src="${escape(s!.img)}" data-tooltip="${escape(s!.name ? i18n(s!.name) : s!.id)}">`).join("");
      const held = model.checklist.filter(i => i.phase === "start" && (i.kind === "held" || i.kind === "ending"))
        .map(i => `<div class="midi-hub-note midi-hub-note-${i.kind}"><i class="${escape(i.icon ?? "fa-solid fa-circle-info")}"></i> ${escape(i.label)}</div>`).join("");
      return `<div class="midi-hub-state">
        <img class="midi-hub-portrait" src="${escape(token?.texture?.src ?? actor.img)}" alt="">
        <div class="midi-hub-vitals">
          <div class="midi-hub-name">${escape(token?.name ?? actor.name)}</div>
          <div class="midi-hub-hp midi-hub-hp-${hpState}"><span data-tooltip="${escape(hpTip)}"><i class="fa-solid ${hpIcon}"></i> ${value}/${hp.max ?? 0}</span>
            ${hp.temp ? `<span class="midi-hub-hp-temp" data-tooltip="${escape(i18n("midi-qol.Hub.TempHP"))}"><i class="fa-solid fa-shield-alt"></i> ${hp.temp}</span>` : ""}</div>
          <div class="midi-hub-stats"><span data-tooltip="${escape(i18n("midi-qol.Hub.AC"))}"><i class="fa-solid fa-shield-halved"></i> ${sys.attributes?.ac?.value ?? "-"}</span>
            ${model.economy.movement ? `<span data-tooltip="${escape(i18n("midi-qol.Hub.Movement"))}">${mark("movement")} ${model.economy.movement.remaining}/${model.economy.movement.allowed} ${escape(model.economy.movement.units)}</span>` : ""}</div>
          <div class="midi-hub-conditions">${conditions}</div>
          ${held}
        </div>
      </div>`;
    }
  });

  // Economy: a pip per use left of each kind, in its cost shape; legendary uses; attacks left
  registerHubSection({
    id: "midi-qol.economy", area: "left", order: 20,
    render: ({ model }) => {
      const order = (id: string) => ["action", "bonus", "reaction"].indexOf(id) >= 0 ? ["action", "bonus", "reaction"].indexOf(id) : 9;
      const kinds = Object.entries(model.economy.windows).filter(([, w]) => w.tracked).sort((a, b) => order(a[0]) - order(b[0]));
      const pips = kinds.map(([id, w]) => {
        const kind = (["action", "bonus", "reaction"].includes(id) ? id : "other") as Kind;
        const marks = Array.from({ length: Math.max(1, w.max) }, (_, i) => mark(kind, i >= w.max - w.used)).join("");
        return `<span class="midi-hub-pips" data-tooltip="${escape(w.label)}">${marks}</span>`;
      });
      const legendary = model.economy.legendary
        ? `<span class="midi-hub-pips" data-tooltip="${escape(i18n("midi-qol.Hub.Cost.legendary"))}">${Array.from({ length: model.economy.legendary.max }, (_, i) => mark("legendary", i >= model.economy.legendary!.value)).join("")}</span>` : "";
      const attacks = model.economy.attacksLeft > 0 ? `<span class="midi-hub-badge">${escape(i18n("midi-qol.Hub.AttacksLeft").replace("{n}", String(model.economy.attacksLeft)))}</span>` : "";
      return `<div class="midi-hub-economy">${pips.join("")}${legendary}${attacks}</div>`;
    }
  });

  // An NPC's Multiattack: its own button; while the run is open, the attacks it allows (marked free)
  registerHubSection({
    id: "midi-qol.multiattack", area: "center", order: 5,
    when: ({ actor, model }) => (actor.type as string) === "npc" && model.activities.some(c => isMultiattackItem(itemOf(c) as Item.Implementation)),
    render: ({ model }) => {
      const own = model.activities.find(c => isMultiattackItem(itemOf(c) as Item.Implementation))!;
      const run = model.economy.multiattack;
      const allowed = run ? model.activities.filter(c => run.allowed.includes(c.uuid)) : [];
      const left = run?.attacksLeft !== null && run?.attacksLeft !== undefined ? ` (${escape(i18n("midi-qol.Hub.AttacksLeft").replace("{n}", String(run.attacksLeft)))})` : "";
      return `<div class="midi-hub-multiattack">
        <button type="button" class="midi-hub-multi${own.usable ? "" : " midi-hub-unusable"}" data-hub-action="use" data-uuid="${escape(own.uuid)}"
          data-tooltip="${escape(own.usable ? i18n("midi-qol.Multiattack.Title").replace("{name}", "") : own.reason ?? "")}"><i class="fa-solid fa-burst"></i> ${escape(own.itemName)}</button>
        ${run ? `<span class="midi-hub-label">${run.complete ? escape(i18n("midi-qol.Multiattack.Done")) : escape(i18n("midi-qol.Hub.AllowedNow")) + left}</span>${allowed.map(c => useButton(c)).join("")}` : ""}
      </div>`;
    }
  });

  // The bar and the tabs: the user's own bar (drag on, drag to reorder, right-click to remove) or the default
  registerHubSection({
    id: "midi-qol.use", area: "center", order: 10,
    render: (ctx) => {
      const tabs = TABS.filter(tab => tab !== "bar" && (tab !== "choices" || hasChoices(ctx.actor)) && (tab !== "around" || aroundMeOn())).map(tab => `<a class="midi-hub-tab${ctx.tab === tab ? " active" : ""}" data-hub-action="tab" data-tab="${tab}">${escape(i18n(`midi-qol.Hub.Tab.${tab}`))}</a>`).join("");
      const chips = filterChips(ctx);
      // The bar: always shown, always the same height. First what something in use gives: a running spell's after-cast
      // activities, and granted items not already on the bar
      const { entries, own } = barEntries(ctx);
      const onBar = new Set(entries.flatMap(e => e.cells.map(c => c.itemUuid)));
      const granted = itemEntries(offered(ctx.model).filter(c => isGranted(itemOf(c)) && !onBar.has(c.itemUuid)));
      const active = [...ctx.model.activities.filter(runningAfterCast).map(c => useButton(c)), ...granted.map(e => entryButton(e))];
      const bar = `<div class="midi-hub-bar" data-hub-drop="bar">${active.length ? `<span class="midi-hub-active">${active.join("")}</span>` : ""}${entries.map((e, i) => entryButton(e, { barIndex: i, removable: true })).join("")}
          <span class="midi-hub-drop-hint">${escape(i18n(own ? "midi-qol.Hub.DropHere" : "midi-qol.Hub.DropToArrange"))}</span>
          ${own ? `<a class="midi-hub-reset" data-hub-action="resetBar" data-tooltip="${escape(i18n("midi-qol.Hub.ResetBar"))}"><i class="fa-solid fa-rotate-left"></i></a>` : ""}</div>`;
      const drawer = ctx.filter || ctx.tab !== "bar" ? drawerHtml(ctx) : "";
      return `<nav class="midi-hub-tabs">${tabs}${chips}</nav>${drawer}${bar}`;
    },
    actions: {
      interaction: async ({ token }, target) => { if (token && target.dataset.id) await runInteraction(target.dataset.id, token, [...(game.user?.targets ?? [])][0]?.document); },
      dash: async ({ actor }) => { await takeDash(actor); },
      disengage: async ({ actor }) => { await takeDisengage(actor); },
      choose: async (ctx, target) => { await openChoices(ctx, target); },
      loadout: async ({ token }, target) => {
        if (!token) return;
        const result = await swapLoadout(token, Number(target.dataset.index));
        if (!result.done && result.reason) ui.notifications?.warn(result.reason);
      },
      saveLoadout: async ({ actor }) => { await saveLoadout(actor); },
      removeLoadout: async ({ actor }, target) => { await removeLoadout(actor, Number(target.dataset.index)); },
      spellGroup: async ({ actor }, target) => {
        const reason = await applySpellGroup(actor, Number(target.dataset.index));
        if (reason) ui.notifications?.warn(reason);
      },
      saveSpellGroup: async ({ actor }) => { await saveSpellGroup(actor); },
      exploreSkill: outOfCombatActions.exploreSkill,
      removeSpellGroup: async ({ actor }, target) => { await removeSpellGroup(actor, Number(target.dataset.index)); },
      choiceToggle: async ({ actor }, target) => { await setToggle(actor, target.dataset.key ?? "", (target as HTMLInputElement).checked); },
      standing: async ({ actor }, target) => {
        await setStandingChoice(actor, target.dataset.key ?? "", target.dataset.choice as StandingChoice, target.dataset.label ?? "");
      },
      forgetChoice: async ({ actor }, target) => { await forgetChoice(actor, target.dataset.key ?? ""); },
      jump: (_ctx, target) => {
        target.closest(".midi-hub-drawer")?.querySelector(`.midi-hub-level[data-level="${target.dataset.level}"]`)?.scrollIntoView({ block: "nearest" });
      },
      resetBar: async (ctx) => { await saveBar(ctx, undefined); },
      remove: async (ctx, target) => {
        const { entries } = barEntries(ctx);
        const index = Number(target.dataset.barIndex);
        await saveBar(ctx, entries.map(e => e.uuid).filter((_, i) => i !== index));
      },
      drop: async (ctx, _zone, event) => {
        const drop = (event as Event & { midiHub?: { uuid: string, from: string | null, before: string | null } }).midiHub;
        if (!drop) return;
        const entries = barEntries(ctx).entries.map(e => e.uuid);
        if (drop.from !== null) entries.splice(Number(drop.from), 1);
        else if (entries.includes(drop.uuid)) entries.splice(entries.indexOf(drop.uuid), 1);
        const at = drop.before !== null ? Math.min(Number(drop.before) - (drop.from !== null && Number(drop.from) < Number(drop.before) ? 1 : 0), entries.length) : entries.length;
        entries.splice(at, 0, drop.uuid);
        await saveBar(ctx, entries);
      }
    }
  });

  // What's waiting: requests owed, readied uses, the GM's holds, legendary and lair offers
  registerHubSection({
    id: "midi-qol.waiting", area: "right", order: 10,
    render: ({ actor, model, gm }) => {
      const parts: string[] = [inboxHtml()];
      if (model.pending && !incomingRequests().length) parts.push(`<div class="midi-hub-note"><i class="fa-solid fa-inbox"></i> ${escape(i18n("midi-qol.Checklist.Requests").replace("{count}", String(model.pending)))}</div>`);
      for (const use of deferredUses({ actor })) parts.push(`<div class="midi-hub-note"><i class="fa-solid fa-hourglass-half"></i> ${escape(i18n("midi-qol.Checklist.Readied").replace("{name}", use.activity?.item?.name ?? ""))}
        <a data-hub-action="release" data-id="${escape(use.id)}" data-tooltip="${escape(i18n("midi-qol.Deferred.Release"))}"><i class="fa-solid fa-bolt"></i></a>
        <a data-hub-action="drop" data-id="${escape(use.id)}" data-tooltip="${escape(i18n("midi-qol.Hold.Drop"))}"><i class="fa-solid fa-xmark"></i></a></div>`);
      if (gm) {
        const held = heldUses().filter(h => h.hold.kind !== "deferred").length;
        if (held) parts.push(`<div class="midi-hub-note"><a data-hub-action="holds"><i class="fa-solid fa-hand"></i> ${escape(i18n("midi-qol.Hub.Held").replace("{n}", String(held)))}</a></div>`);
        hubOffers.forEach((offer, index) => parts.push(`<div class="midi-hub-offer"><div class="midi-hub-label">${escape(offer.title)}</div><div class="hint">${escape(offer.reason)}</div>
          ${offer.choices.map(c => `<button type="button" data-hub-action="offer" data-offer="${index}" data-uuid="${escape(c.uuid)}">${escape(c.label)}</button>`).join("")}
          <button type="button" data-hub-action="offer" data-offer="${index}">${escape(i18n("midi-qol.Legendary.Skip"))}</button></div>`));
      }
      // Undo of this user's last use (the GM's: the most recent), where the table allows it
      if (configSettings.undoWorkflow && (gm || configSettings.playerUndo))
        parts.push(`<a class="midi-hub-undo" data-hub-action="undo" data-tooltip="${escape(i18n(gm ? "midi-qol.Hub.UndoGM" : "midi-qol.Hub.UndoMine"))}"><i class="fa-solid fa-rotate-left"></i> ${escape(i18n("midi-qol.Hub.Undo"))}</a>`);
      // Where the inbox is, when nothing is waiting
      if (!parts.some(Boolean)) parts.push(`<div class="midi-hub-note midi-hub-inbox-empty hint"><i class="fa-solid fa-inbox"></i> ${escape(i18n("midi-qol.Inbox.Nothing"))}</div>`);
      return parts.join("");
    },
    actions: {
      undo: async () => {
        const result = await unTimedExecuteAsGM("undoLastUseOf") as true | string | undefined;
        if (result !== true) ui.notifications?.warn(i18n(result ?? "midi-qol.Hub.UndoNothing"));
      },
      release: async (_ctx, target) => { if (target.dataset.id) await releaseDeferred(target.dataset.id, { targets: [...(game.user?.targets ?? [])].map(t => t.document.uuid ?? "") }); },
      drop: async (_ctx, target) => { if (target.dataset.id) await dropDeferred(target.dataset.id); },
      holds: () => { HoldPanel.open(); },
      inboxAnswer: (ctx, target) => {
        const ask = inlineAsks[Number(target.dataset.ask)];
        if (!ask) return;
        const box = target.closest<HTMLElement>(".midi-hub-inbox");
        // The handler's own dialog: undefined
        const values = target.dataset.dialog ? undefined : target.dataset.none ? [] : target.dataset.value !== undefined ? [target.dataset.value]
          : Array.from(box?.querySelectorAll<HTMLInputElement>("input[data-inbox-value]:checked") ?? []).map(i => i.dataset.inboxValue ?? "");
        inlineAsks.splice(inlineAsks.indexOf(ask), 1);
        ask.resolve(values);
        ctx.refresh();
      },
      inboxShow: (_ctx, target) => {
        const request = incomingRequests().find(r => r.id === target.dataset.id);
        const app = request?.window ? foundry.applications.instances.get(request.window.id) as { bringToFront?(): void } | undefined : undefined;
        app?.bringToFront?.();
        request?.window?.scrollIntoView?.({ block: "nearest" });
      },
      offer: (ctx, target) => {
        const offer = hubOffers[Number(target.dataset.offer)];
        if (!offer) return;
        hubOffers.splice(hubOffers.indexOf(offer), 1);
        offer.resolve(target.dataset.uuid || undefined);
        ctx.refresh();
      }
    }
  });

  // Out of combat: light sources with their time left
  registerHubSection({
    id: "midi-qol.outOfCombat", area: "right", order: 20,
    when: ({ model }) => !model.inCombat,
    render: ({ actor }) => outOfCombatHtml(actor),
    actions: outOfCombatActions
  });

  // The turn: whose it is; End turn with what's unused
  registerHubSection({
    id: "midi-qol.turn", area: "right", order: 20,
    when: ({ model }) => model.inCombat,
    render: ({ token, actor, model, owner, gm }) => {
      const combat = combatOfToken(token);
      const next = combat?.turns[((combat.turn ?? 0) + 1) % (combat.turns.length || 1)];
      // Coordination: who acts next (a combatant this user can see)
      const nextName = next && next.tokenId !== token?.id && (next.token?.object as Token.Implementation | undefined)?.visible && !next.hidden ? next.name : undefined;
      const nextLine = nextName ? `<div class="midi-hub-note midi-hub-next">${escape(i18n("midi-qol.Hub.NextUp").replace("{name}", nextName))}</div>` : "";
      if (!model.isTurn) {
        return next?.tokenId === token?.id ? `<div class="midi-hub-ondeck">${escape(i18n("midi-qol.Hub.OnDeck"))}</div>` : nextLine;
      }
      const unused = model.checklist.filter(i => i.phase === "end").map(i => `<div class="midi-hub-note midi-hub-note-unused">${escape(i.label)}</div>`).join("");
      // Reminders, when the player has them on (off by default)
      const reminded = remindersOn() ? reminders(actor, token, model).map(r => `<div class="midi-hub-note midi-hub-reminder"><i class="fa-solid fa-lightbulb"></i> ${escape(r)}</div>`).join("") : "";
      return `<div class="midi-hub-turn"><div class="midi-hub-yourturn">${escape(i18n("midi-qol.Hub.YourTurn"))}</div>${nextLine}${sinceLastTurnHtml(token)}${unused}${reminded}
        ${owner || gm ? `<button type="button" class="midi-hub-endturn" data-hub-action="endTurn"><i class="fa-solid fa-forward"></i> ${escape(i18n("midi-qol.Checklist.EndTurn"))}</button>` : ""}</div>`;
    },
    actions: { endTurn: async ({ token }) => { await combatOfToken(token)?.nextTurn(); } }
  });
}
