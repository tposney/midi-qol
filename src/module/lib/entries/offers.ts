import { i18n, MODULE_ID } from "../../../midi-qol.js";
import { configSettings } from "../../settings.js";
import { playerForActor } from "../../utils.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "../requests.js";
import type { FoundEntry } from "./types.js";
import { actorToggleEntries } from "./engine.js";
import { STANDING_CHOICES, storedStandings, type StandingChoice } from "../../services/rollBonuses/standing.js";

/*
 * M15 stage 4d: offers at use and target events (a roll event's offers are rollBonuses').
 * - `toggle`: the entry runs while its actor's toggle for it is on (`flags.midi-qol.toggles`, set from the sheet's
 *   Toggles control or MidiQOL.entries.setToggle). Off by default.
 * - `ask`: the entry's actor's owner is asked through the request core (their player when connected, else the GM),
 *   with the reaction time-out and the GM able to answer "none" from the player list. One dialog per actor and event:
 *   each entry a choice, a group's entries one choice among them (several only where they stack).
 * An entry's `activity` is its cost: one use of the activity (else of its item), offered only while one is left.
 */

export const ENTRY_OFFER_REQUEST = "midi-qol.entryOffer";

export interface OfferOption { key: string, label: string, img?: string, description?: string, group?: string, stacks?: boolean }

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

type Usable = { id?: string, uuid?: string, name?: string, img?: string, item?: Item.Implementation, uses?: { max?: number | string | null, value?: number, spent?: number }, update?(data: object): Promise<unknown> };

/** The activity an entry names (`activity`, on the entry's item; an activity home is its own) */
export function entryActivity(f: FoundEntry): Usable | undefined {
  const document = docOf(f);
  const item = document instanceof Item ? document : document.item ?? (document.parent instanceof Item ? document.parent : undefined);
  if (!f.entry.activity) return document.item ? document as Usable : undefined;
  // @ts-expect-error no dnd5e-types
  return item?.system.activities?.get(f.entry.activity) as Usable | undefined;
}

/** What paying for the entry spends: one use of its activity, else of its item (none: free) */
function costHolder(f: FoundEntry): { kind: "activity" | "item", holder: Usable } | undefined {
  if (!f.entry.activity) return undefined;
  const activity = entryActivity(f);
  if (activity?.uses?.max) return { kind: "activity", holder: activity };
  const item = activity?.item as unknown as Usable | undefined;
  // @ts-expect-error no dnd5e-types
  if (item && (activity?.item?.system.uses?.max)) return { kind: "item", holder: { ...item, uses: activity.item.system.uses } };
  return undefined;
}

/** The entry can be paid for */
export function costAllows(f: FoundEntry): boolean {
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
  return {
    key, label: entryLabel(f), img: activity?.img ?? docOf(f).img ?? undefined,
    ...(typeof description === "string" ? { description } : {}),
    ...(f.entry.group ? { group: f.entry.group, stacks: !!f.entry.stacks } : {})
  };
}

/** Ask the actor's owner which of `options` to take (keys); none on a time-out, a GM's "none" or a disconnect */
export async function askOffers(actor: Actor.Implementation, title: string, options: OfferOption[]): Promise<string[]> {
  if (!options.length) return [];
  const player = playerForActor(actor) as User.Implementation | undefined;
  const user = player?.active ? player : game.users?.activeGM ?? undefined;
  if (!user) return [];
  const request = askUser<string[]>(user, {
    type: ENTRY_OFFER_REQUEST, data: { title, options }, kind: "offer", actorUuid: actor.uuid ?? undefined, label: title,
    timeoutMs: (configSettings.reactionTimeout ?? 0) * 1000,
    fallback: () => [],
    gmChoices: { none: () => [] }
  });
  try {
    const { value } = await request.settled;
    const known = new Set(options.map(o => o.key));
    return Array.isArray(value) ? value.filter(key => known.has(key)) : [];
  } catch {
    return [];
  }
}

const escape = (text: string) => foundry.utils.escapeHTML(text);

function optionHTML(option: OfferOption, input: string): string {
  const img = option.img ? `<img src="${escape(option.img)}" width="24" height="24" style="border: none; vertical-align: middle">` : "";
  const tip = option.description ? ` data-tooltip="${escape(option.description)}"` : "";
  return `<label class="checkbox"${tip}>${input} ${img} ${escape(option.label)}</label>`;
}

/** The dialog: each option a checkbox; a group's non-stacking options radios with "None" */
function offerContent(options: OfferOption[]): string {
  const rows: string[] = [];
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
async function answerOffer(data: { title: string, options: OfferOption[] }, request: IncomingRequest): Promise<string[]> {
  const countdown = request.countdown();
  let dialog: foundry.applications.api.DialogV2 | undefined;
  request.onSettled(() => { void dialog?.close(); });
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: data.title },
    content: offerContent(data.options),
    buttons: [
      {
        action: "use", label: i18n("midi-qol.Use"), default: true,
        callback: (_event: Event, button: HTMLButtonElement) => {
          const form = button.form;
          if (!form) return [];
          return Array.from(form.querySelectorAll<HTMLInputElement>("input:checked")).map(input => input.value).filter(Boolean);
        }
      },
      { action: "none", label: game.i18n?.localize("None") ?? "None", callback: () => [] }
    ],
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => {
      dialog = app;
      countdown?.attach(app.element);
    }
  }) as string[] | null | undefined;
  if (request.settledHow) return [];
  if (!await request.claim()) return [];
  return Array.isArray(picked) ? picked : [];
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

/** The sheet's Toggles and choices control: each toggle entry a checkbox; each standing choice a select (M15 5a); saved on the actor */
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
  const content = (rows.length ? `<p class="hint">${escape(i18n("midi-qol.EntryTogglesHint"))}</p><div class="midi-qol-entry-toggles">${rows.join("")}</div>` : "")
    + (choiceRows.length ? `<p class="hint">${escape(i18n("midi-qol.Standing.Hint"))}</p><div class="midi-qol-standing-choices">${choiceRows.join("")}</div>` : "");
  const values = await foundry.applications.api.DialogV2.wait({
    window: { title: `${actor.name}: ${i18n("midi-qol.EntryToggles")}` },
    position: { width: 440 },
    content,
    buttons: [{
      action: "save", label: game.i18n?.localize("Save") ?? "Save", default: true,
      callback: (_event: Event, button: HTMLButtonElement) => ({
        toggles: Object.fromEntries([...seen].map(key => [key, !!button.form?.querySelector<HTMLInputElement>(`input[name="${CSS.escape(key)}"]`)?.checked])),
        choices: standings.map((_s, index) => button.form?.querySelector<HTMLSelectElement>(`select[name="standing-${index}"]`)?.value as StandingChoice | undefined)
      })
    }],
    rejectClose: false
  }) as { toggles: Record<string, boolean>, choices: (StandingChoice | undefined)[] } | null | undefined;
  if (!values || typeof values !== "object") return;
  const changed = Object.entries(values.toggles).filter(([key, on]) => !!stored[key] !== on);
  const updates: Record<string, unknown> = Object.fromEntries(changed.map(([key, on]) => [`flags.${MODULE_ID}.toggles.${key}`, on]));
  const kept = standings.flatMap((s, index) => {
    const choice = values.choices[index] ?? s.choice;
    return choice === "ask" ? [] : [{ ...s, choice }];
  });
  if (kept.length !== standings.length || kept.some((s, i) => s.choice !== standings[i]?.choice)) updates[`flags.${MODULE_ID}.bonusChoices`] = kept;
  if (Object.keys(updates).length) await actor.update(updates);
}

export function registerEntryOffers() {
  registerRequestHandler(ENTRY_OFFER_REQUEST, answerOffer);
  Hooks.on("getHeaderControlsActorSheetV2", (app: foundry.applications.api.DocumentSheetV2<Actor>, controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]) => {
    const actor = app.document as Actor.Implementation;
    if (!actor?.isOwner || (!actorToggleEntries(actor).length && !storedStandings(actor).length)) return;
    // Core runs a control's onClick (fvtt-types has only `action`)
    (controls as (typeof controls[number] | { label: string, icon: string, onClick: () => void })[]).push({
      label: "midi-qol.EntryToggles",
      icon: "fa-solid fa-toggle-on",
      onClick: () => { void editToggles(actor); }
    });
  });
}
