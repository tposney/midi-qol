import { i18n, MODULE_ID } from "../../../midi-qol.js";
import { configSettings } from "../../settings.js";
import { playerForActor } from "../../utils.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "../requests.js";
import type { FoundEntry } from "./types.js";
import { promptControlHTML, readPromptControls, wirePromptControls, type PromptControlData } from "../../services/promptControls/service.js";
import { actorToggleEntries } from "./engine.js";
import { ruleFor } from "./rules.js";
import { rememberedChoices } from "../rememberedChoices.js";
import { STANDING_CHOICES, storedStandings, type StandingChoice } from "../../services/rollBonuses/standing.js";

/*
 * M15 stage 4d: offers at use and target events (a roll event's offers are rollBonuses').
 * - `toggle`: the entry runs while its actor's toggle for it is on (`flags.midi-qol.toggles`, set from the sheet's
 *   Toggles control or MidiQOL.entries.setToggle). Off by default.
 * - `ask`: the entry's actor's owner is asked through the request core (their player when connected, else the GM),
 *   with the reaction time-out and the GM able to answer "none" from the player list. One dialog per actor and event:
 *   each entry a choice, a group's entries one choice among them (several only where they stack).
 * An entry's `activity` is its cost: one use of the activity (else of its item), offered only while one is left.
 * An entry's `cost` is uses spent from the actor's items by identifier, in order (`{ amount, from, label }`).
 */

export const ENTRY_OFFER_REQUEST = "midi-qol.entryOffer";

export interface OfferOption { key: string, label: string, img?: string, description?: string, cost?: string, group?: string, stacks?: boolean, /** Shown once it is ticked (the promptControls service) */ controls?: PromptControlData[] }

const docOf = (f: FoundEntry) => f.document as { id?: string | null, uuid?: string, name?: string, img?: string | null, item?: Item.Implementation, parent?: unknown };

/** An entry's toggle key on its actor: its documents' ids and its id (no dots: a flag key) */
export function toggleKey(f: FoundEntry): string {
  const document = docOf(f);
  const item = document instanceof Item ? undefined : document.item ?? (document.parent instanceof Item ? document.parent : undefined);
  return [item?.id, document.id, f.entry.id].filter(Boolean).join("_").replace(/\./g, "_");
}

export function togglesOf(actor: Actor.Implementation | undefined): Record<string, boolean> {
  const stored = actor?.getFlag(MODULE_ID, "toggles");
  return stored && typeof stored === "object" ? stored as Record<string, boolean> : {};
}

export function toggleOn(f: FoundEntry): boolean {
  return !!togglesOf(f.actor)[toggleKey(f)];
}

export async function setToggle(actor: Actor.Implementation, key: string, on: boolean): Promise<void> {
  await actor.update({ [`flags.${MODULE_ID}.toggles.${key}`]: on });
}

/** What an entry is called in a prompt: its label, else its activity's, item's or effect's name */
export function entryLabel(f: FoundEntry): string {
  const label = (f.entry as { label?: unknown }).label;
  if (typeof label === "string") return label;
  return entryActivity(f)?.name ?? docOf(f).name ?? f.entry.id;
}

/**
 * What a prompt calls an offered entry. An entry a registered rule gives someone's item (their own copy of a feature,
 * whatever it is called) goes by the item's name, with the entry's label after it when the rule has several entries
 * for the item; an item's own entry goes by its label.
 */
export function offerName(f: FoundEntry): string {
  const document = f.document;
  if (f.home !== "item" || !(document instanceof Item) || !document.name) return entryLabel(f);
  const own = document.getFlag(MODULE_ID, "entries") as { id?: string }[] | undefined;
  if (Array.isArray(own) && own.some(entry => entry?.id === f.entry.id)) return entryLabel(f);
  const rule = ruleFor(document as Item.Implementation)?.rule;
  if (!rule) return entryLabel(f);
  return (rule.entries?.length ?? 0) > 1 ? `${document.name}: ${entryLabel(f)}` : document.name;
}

type Usable = { id?: string, uuid?: string, name?: string, img?: string, item?: Item.Implementation, uses?: { max?: number | string | null, value?: number, spent?: number }, update?(data: object): Promise<unknown> };

/** The activity an entry names (`activity`, on the entry's item; an activity home is its own) */
export function entryActivity(f: FoundEntry): Usable | undefined {
  const document = docOf(f);
  const item = document instanceof Item ? document : document.item ?? (document.parent instanceof Item ? document.parent : undefined);
  if (!f.entry.activity) return document.item ? document as Usable : undefined;
  // @ts-expect-error no dnd5e-types
  return item?.system.activities?.get(f.entry.activity) as Usable | undefined;
}

/** The entry's activity's own consumption (dnd5e's targets: Font of Magic's uses for a Metamagic option), if it has any */
function consumingActivity(f: FoundEntry): { consume(config: object, message: object): Promise<unknown> } | undefined {
  if (!f.entry.activity) return undefined;
  const activity = entryActivity(f) as (Usable & { consumption?: { targets?: unknown[] }, consume?(config: object, message: object): Promise<unknown> }) | undefined;
  return activity?.consumption?.targets?.length && activity.consume ? activity as { consume(config: object, message: object): Promise<unknown> } : undefined;
}

/**
 * An entry whose activity has consumption targets is paid through dnd5e before it runs (its resources only: no
 * action, no slot); false if dnd5e refused (not enough left; dnd5e says why). Other entries pay after (spendEntryCost).
 */
export async function payEntryConsumption(f: FoundEntry): Promise<boolean> {
  const activity = consumingActivity(f);
  if (!activity) return true;
  const result = await activity.consume({ consume: { resources: true, action: false, spellSlot: false }, scaling: 0 }, {});
  return result !== false;
}

/** What paying for the entry spends: one use of its activity, else of its item (none: free) */
function costHolder(f: FoundEntry): { kind: "activity" | "item", holder: Usable } | undefined {
  if (!f.entry.activity || consumingActivity(f)) return undefined;
  const activity = entryActivity(f);
  if (activity?.uses?.max) return { kind: "activity", holder: activity };
  const item = activity?.item as unknown as Usable | undefined;
  // @ts-expect-error no dnd5e-types
  if (item && (activity?.item?.system.uses?.max)) return { kind: "item", holder: { ...item, uses: activity.item.system.uses } };
  return undefined;
}

type PoolItem = Item.Implementation & { identifier?: string, system: { uses?: { value?: number, max?: number | string | null, spent?: number } } };
export type PoolReceipt = { item: PoolItem, taken: number }[];

/** The entry's `cost`: how much, the actor's items it is paid from (those with uses), what is left in them, its name */
export function poolCost(f: FoundEntry): { amount: number, pools: PoolItem[], left: number, label: string, from: string[] } | undefined {
  const cost = f.entry.cost;
  if (!cost || !Array.isArray(cost.from)) return undefined;
  const actor = f.actor;
  const pools = cost.from.map(id => actor?.items.find(i => (i as PoolItem).identifier === id) as PoolItem | undefined)
    .filter((i): i is PoolItem => !!i && !!Number(i.system.uses?.max));
  let amount = Number(cost.amount);
  if (!Number.isFinite(amount)) {
    try { amount = Number(Roll.safeEval(Roll.replaceFormulaData(String(cost.amount), actor?.getRollData() ?? {}))); } catch { amount = NaN; }
  }
  const left = pools.reduce((total, i) => total + Number(i.system.uses?.value ?? 0), 0);
  return { amount, pools, left, label: cost.label ? i18n(cost.label) : pools[0]?.name ?? cost.from[0] ?? "", from: cost.from };
}

/** Pay the entry's `cost` from its pools in order: what was taken (to give back), false when there isn't enough */
export async function payEntryPools(f: FoundEntry): Promise<PoolReceipt | false> {
  const cost = poolCost(f);
  if (!cost) return [];
  if (!(cost.amount <= cost.left)) return false;
  const receipt: PoolReceipt = [];
  let owed = cost.amount;
  for (const item of cost.pools) {
    const taken = Math.min(owed, Number(item.system.uses?.value ?? 0));
    if (taken <= 0) continue;
    await item.update({ "system.uses.spent": Number(item.system.uses?.spent ?? 0) + taken } as never);
    receipt.push({ item, taken });
    owed -= taken;
    if (owed <= 0) break;
  }
  return receipt;
}

export async function refundEntryPools(receipt: PoolReceipt): Promise<void> {
  for (const { item, taken } of receipt) await item.update({ "system.uses.spent": Math.max(0, Number(item.system.uses?.spent ?? 0) - taken) } as never);
}

/** The entry can be paid for */
export function costAllows(f: FoundEntry): boolean {
  const pool = poolCost(f);
  if (pool && !(pool.amount <= pool.left)) return false;
  const cost = costHolder(f);
  return !cost || (cost.holder.uses?.value ?? 0) > 0;
}

export async function spendEntryCost(f: FoundEntry): Promise<void> {
  const cost = costHolder(f);
  if (!cost) return;
  const spent = (cost.holder.uses?.spent ?? 0) + 1;
  if (cost.kind === "activity") await cost.holder.update?.({ "uses.spent": spent });
  // @ts-expect-error no dnd5e-types
  else await entryActivity(f)?.item?.update({ "system.uses.spent": spent });
}

export function offerOption(f: FoundEntry, key: string): OfferOption {
  const activity = entryActivity(f);
  const description = (f.entry as { description?: unknown }).description;
  const pool = poolCost(f);
  return {
    key, label: offerName(f), img: activity?.img ?? docOf(f).img ?? undefined,
    ...(typeof description === "string" ? { description: i18n(description) } : {}),
    ...(pool ? { cost: (game.i18n?.format("midi-qol.Entries.Offer.Cost", { n: String(pool.amount), left: String(pool.left), label: pool.label }) ?? "") } : {}),
    ...(f.entry.group ? { group: f.entry.group, stacks: !!f.entry.stacks } : {})
  };
}

/** Ask the actor's owner which of `options` to take (keys); none on a time-out, a GM's "none" or a disconnect */
export async function askOffers(actor: Actor.Implementation, title: string, options: OfferOption[], detail?: string): Promise<string[]> {
  return (await askOfferChoices(actor, title, options, detail)).keys;
}

/** What was taken: its keys, and each taken option's control values (promptControls) */
export interface OfferAnswer { keys: string[], values: Record<string, Record<string, unknown>> }

/** The options taken, with the values of their controls */
export async function askOfferChoices(actor: Actor.Implementation, title: string, options: OfferOption[], detail?: string): Promise<OfferAnswer> {
  const none: OfferAnswer = { keys: [], values: {} };
  if (!options.length) return none;
  const player = playerForActor(actor) as User.Implementation | undefined;
  const user = player?.active ? player : game.users?.activeGM ?? undefined;
  if (!user) return none;
  const request = askUser<string[] | OfferAnswer>(user, {
    type: ENTRY_OFFER_REQUEST, data: { title, options, ...(detail ? { detail } : {}) }, kind: "offer", actorUuid: actor.uuid ?? undefined, label: title,
    timeoutMs: (configSettings.reactionTimeout ?? 0) * 1000,
    fallback: () => [],
    gmChoices: { none: () => [] }
  });
  try {
    const { value } = await request.settled;
    const known = new Set(options.map(o => o.key));
    // The GM answering for the player gives a list of keys; the dialog gives keys and values
    const answer: OfferAnswer = Array.isArray(value) ? { keys: value, values: {} } : value && typeof value === "object" ? value : none;
    const keys = (answer.keys ?? []).filter(key => known.has(key));
    return { keys, values: Object.fromEntries(Object.entries(answer.values ?? {}).filter(([key]) => keys.includes(key))) };
  } catch {
    return none;
  }
}

const escape = (text: string) => foundry.utils.escapeHTML(text);

function optionHTML(option: OfferOption, input: string): string {
  const img = option.img ? `<img src="${escape(option.img)}" width="24" height="24" style="border: none; vertical-align: middle">` : "";
  const cost = option.cost ? ` <span class="midi-qol-entry-offer-cost">${escape(option.cost)}</span>` : "";
  const description = option.description ? `<div class="midi-qol-entry-offer-description hint">${escape(option.description)}</div>` : "";
  const controls = option.controls?.length ? `<div class="midi-qol-entry-offer-controls" data-offer="${escape(option.key)}" hidden>${option.controls.map(control => promptControlHTML(control)).join("")}</div>` : "";
  return `<label class="checkbox">${input} ${img} <strong>${escape(option.label)}</strong>${cost}</label>${description}${controls}`;
}

/** A ticked option's controls shown, the others hidden */
function showTickedControls(root: HTMLElement): void {
  const ticked = new Set(Array.from(root.querySelectorAll<HTMLInputElement>(".midi-qol-entry-offers input:checked")).map(input => input.value));
  for (const controls of Array.from(root.querySelectorAll<HTMLElement>(".midi-qol-entry-offer-controls[data-offer]")))
    controls.hidden = !ticked.has(controls.dataset.offer ?? "");
}

/** The dialog: each option a checkbox; a group's non-stacking options radios with "None" */
function offerContent(options: OfferOption[], detail?: string): string {
  // What the offer is about (the roll just made), then the options
  const rows: string[] = detail ? [`<p class="midi-qol-entry-offer-detail">${escape(detail)}</p>`] : [];
  const groups = new Map<string, OfferOption[]>();
  for (const option of options) {
    if (option.group && !option.stacks) {
      const list = groups.get(option.group) ?? [];
      if (!list.length) groups.set(option.group, list);
      list.push(option);
    } else rows.push(optionHTML(option, `<input type="checkbox" name="pick" value="${escape(option.key)}">`));
  }
  for (const [group, list] of groups) {
    const name = `group-${escape(group)}`;
    rows.push(`<fieldset><legend>${escape(group)}</legend>${list.map(o => optionHTML(o, `<input type="radio" name="${name}" value="${escape(o.key)}">`)).join("")}`
      + `<label class="checkbox"><input type="radio" name="${name}" value="" checked> ${escape(game.i18n?.localize("None") ?? "None")}</label></fieldset>`);
  }
  return `<div class="midi-qol-entry-offers">${rows.join("")}</div>`;
}

/** On the asked client: the dialog, with the requester's countdown; closed when answered for the player */
async function answerOffer(data: { title: string, options: OfferOption[], detail?: string }, request: IncomingRequest): Promise<OfferAnswer> {
  const none: OfferAnswer = { keys: [], values: {} };
  // Always its own dialog (user, 2026-11-25): an offer needs what it is about, its cost and what it does, which the
  // hub's inbox line can't hold. The inbox lists it (its countdown, Show) as any request with a window.
  const countdown = request.countdown();
  let dialog: foundry.applications.api.DialogV2 | undefined;
  request.onSettled(() => { void dialog?.close(); });
  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: data.title },
    content: offerContent(data.options, data.detail),
    buttons: [
      {
        action: "use", label: i18n("midi-qol.Use"), default: true,
        callback: (_event: Event, button: HTMLButtonElement): OfferAnswer => {
          const form = button.form;
          if (!form) return none;
          const keys = Array.from(form.querySelectorAll<HTMLInputElement>(".midi-qol-entry-offers > label input:checked, .midi-qol-entry-offers fieldset > label input:checked")).map(input => input.value).filter(Boolean);
          const values: OfferAnswer["values"] = {};
          for (const key of keys) {
            const controls = Array.from(form.querySelectorAll<HTMLElement>(".midi-qol-entry-offer-controls[data-offer]")).find(e => e.dataset.offer === key);
            if (controls) values[key] = readPromptControls(controls);
          }
          return { keys, values };
        }
      },
      { action: "none", label: game.i18n?.localize("None") ?? "None", callback: () => none }
    ],
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => {
      dialog = app;
      countdown?.attach(app.element);
      wirePromptControls(app.element);
      showTickedControls(app.element);
      app.element.querySelector(".midi-qol-entry-offers")?.addEventListener("change", event => {
        if ((event.target as HTMLElement).closest(".midi-qol-entry-offer-controls")) return;
        showTickedControls(app.element);
      });
    }
  }) as OfferAnswer | null | undefined;
  if (request.settledHow) return none;
  if (!await request.claim()) return none;
  return chosen && typeof chosen === "object" ? chosen : none;
}

/** The actor's toggles: key, label, on (MidiQOL.entries.toggles) */
export function listToggles(actor: Actor.Implementation): { key: string, label: string, on: boolean }[] {
  const stored = togglesOf(actor);
  const seen = new Map<string, { key: string, label: string, on: boolean }>();
  for (const f of actorToggleEntries(actor)) {
    const key = toggleKey(f);
    if (!seen.has(key)) seen.set(key, { key, label: entryLabel(f), on: !!stored[key] });
  }
  return [...seen.values()];
}

/** The sheet's Toggles and choices control: each toggle entry a checkbox; each standing choice a select (5a); each remembered choice kept or forgotten (5e); saved on the actor */
export async function editToggles(actor: Actor.Implementation): Promise<void> {
  const found = actorToggleEntries(actor);
  const stored = togglesOf(actor);
  const seen = new Set<string>();
  const rows = found.flatMap(f => {
    const key = toggleKey(f);
    if (seen.has(key)) return [];
    seen.add(key);
    const option = offerOption(f, key);
    return [optionHTML(option, `<input type="checkbox" name="${escape(key)}"${stored[key] ? " checked" : ""}>`)];
  });
  const standings = storedStandings(actor);
  const choiceRows = standings.map((s, index) => `<div class="form-group"><label>${escape(s.label)}</label><div class="form-fields">`
    + `<select name="standing-${index}">${STANDING_CHOICES.map(c => `<option value="${c}"${c === s.choice ? " selected" : ""}>${escape(i18n(`midi-qol.Standing.${c}`))}</option>`).join("")}</select></div></div>`);
  const remembered = rememberedChoices(actor);
  const rememberedRows = remembered.map((c, index) => `<div class="form-group"><label>${escape(c.label)}</label><div class="form-fields">`
    + `<select name="remembered-${index}"><option value="keep" selected>${escape(c.valueLabel ?? String(c.value))}</option>`
    + `<option value="forget">${escape(i18n("midi-qol.RememberChoice.Forget"))}</option></select></div></div>`);
  const content = (rows.length ? `<p class="hint">${escape(i18n("midi-qol.EntryTogglesHint"))}</p><div class="midi-qol-entry-toggles">${rows.join("")}</div>` : "")
    + (choiceRows.length ? `<p class="hint">${escape(i18n("midi-qol.Standing.Hint"))}</p><div class="midi-qol-standing-choices">${choiceRows.join("")}</div>` : "")
    + (rememberedRows.length ? `<p class="hint">${escape(i18n("midi-qol.RememberChoice.Hint"))}</p><div class="midi-qol-remembered-choices">${rememberedRows.join("")}</div>` : "");
  const values = await foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name}: ${i18n("midi-qol.EntryToggles")}` },
    position: { width: 440 },
    content,
    buttons: [{
      action: "save", label: game.i18n?.localize("Save") ?? "Save", default: true,
      callback: (_event: Event, button: HTMLButtonElement) => ({
        toggles: Object.fromEntries([...seen].map(key => [key, !!button.form?.querySelector<HTMLInputElement>(`input[name="${CSS.escape(key)}"]`)?.checked])),
        choices: standings.map((_s, index) => button.form?.querySelector<HTMLSelectElement>(`select[name="standing-${index}"]`)?.value as StandingChoice | undefined),
        forget: remembered.filter((_c, index) => button.form?.querySelector<HTMLSelectElement>(`select[name="remembered-${index}"]`)?.value === "forget").map(c => c.key)
      })
    }],
    rejectClose: false
  }) as { toggles: Record<string, boolean>, choices: (StandingChoice | undefined)[], forget: string[] } | null | undefined;
  if (!values || typeof values !== "object") return;
  const changed = Object.entries(values.toggles).filter(([key, on]) => !!stored[key] !== on);
  const updates: Record<string, unknown> = Object.fromEntries(changed.map(([key, on]) => [`flags.${MODULE_ID}.toggles.${key}`, on]));
  const kept = standings.flatMap((s, index) => {
    const choice = values.choices[index] ?? s.choice;
    return choice === "ask" ? [] : [{ ...s, choice }];
  });
  if (kept.length !== standings.length || kept.some((s, i) => s.choice !== standings[i]?.choice)) updates[`flags.${MODULE_ID}.bonusChoices`] = kept;
  if (values.forget.length) updates[`flags.${MODULE_ID}.rememberedChoices`] = remembered.filter(c => !values.forget.includes(c.key));
  if (Object.keys(updates).length) await actor.update(updates);
}

export function registerEntryOffers() {
  registerRequestHandler(ENTRY_OFFER_REQUEST, answerOffer);
  Hooks.on("getHeaderControlsActorSheetV2", (app: foundry.applications.api.DocumentSheetV2<Actor>, controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]) => {
    const actor = app.document as Actor.Implementation;
    if (!actor?.isOwner || (!actorToggleEntries(actor).length && !storedStandings(actor).length && !rememberedChoices(actor).length)) return;
    // Core runs a control's onClick (fvtt-types has only `action`)
    (controls as (typeof controls[number] | { label: string, icon: string, onClick: () => void })[]).push({
      label: "midi-qol.EntryToggles",
      icon: "fa-solid fa-toggle-on",
      onClick: () => { void editToggles(actor); }
    });
  });
}
