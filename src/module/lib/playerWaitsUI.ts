/**
 * Player waits (playerWaits.ts) in Foundry's player list: a badge on each player midi is waiting for. The GM's opens a
 * popover to answer for them, and disconnected players with something pending are shown too; Gambit's Premades prompts
 * mirrored to the GM are listed under their player (optional), hidden until the GM shows one. A player sees their own
 * badge, which brings their open
 * prompts forward when one is hidden behind a sheet, and the others' read-only with the kind of prompt only
 * (playerWaitShowPlayers).
 */

import { MODULE_ID, i18n, i18nFormat } from "../../midi-qol.js";
import { configSettings, safeGetGameSetting } from "../settings.js";
import { playerForActor } from "../utils.js";
import { knownPlayerWaits, onPlayerWaitsChanged, settlePlayerWait, WaitInfo } from "./playerWaits.js";

const BADGE = "midi-qol-player-wait";
const POPOVER = "midi-qol-player-wait-popover";
/** On the body while Gambit's mirrored prompts are listed: they stay hidden (a CSS rule on Gambit's own mirror class, so
 * they are never painted and can't take focus) until the GM shows one. */
const HIDE_GAMBIT = "midi-qol-hide-gambit-mirrors";
const SHOWN_GAMBIT = "midi-qol-gambit-shown";

type GambitPrompt = { app: foundry.applications.api.ApplicationV2, title: string, actorName?: string };

/**
 * Gambit's Premades reaction prompts mirrored to this GM (Gambit's "Mirror 3rd Party Dialog for GMs"), by the player they
 * are for. Read from Gambit's own windows (id `gps-automation-…`, the prompt's token), as Gambit has no API for them.
 */
function listingGambit(): boolean {
  return !!game.user?.isGM && !!game.modules.get("gambits-premades")?.active && !!configSettings.playerWaitGM
    && !!configSettings.playerWaitGambit;
}

/** The player whose row lists a Gambit window: only the GM's copy of a prompt also sent to the player (Gambit's
 * "multiDialog"); a prompt only for the GM (Caltrops, or a player who is offline) is answered on the GM's screen anyway. */
function gambitPromptPlayer(app: foundry.applications.api.ApplicationV2): { userId: string, actorName?: string } | undefined {
  if (!String(app.id).startsWith("gps-automation-")) return undefined;
  const prompt = (app as unknown as { prompt?: { token?: TokenDocument.Implementation, type?: string } }).prompt;
  if (prompt?.type !== "multiDialog") return undefined;
  const actor = prompt.token?.actor;
  const userId = actor ? playerForActor(actor)?.id : undefined;
  return userId ? { userId, actorName: actor?.name ?? undefined } : undefined;
}

function gambitPrompts(userId: string): GambitPrompt[] {
  if (!listingGambit()) return [];
  const prompts: GambitPrompt[] = [];
  for (const app of foundry.applications.instances.values()) {
    if (!app.rendered) continue;
    const listed = gambitPromptPlayer(app);
    if (listed?.userId === userId) prompts.push({ app, title: app.title, actorName: listed.actorName });
  }
  return prompts;
}

/** Show a hidden Gambit prompt: the GM takes it over. It stays shown until it closes. */
function showGambitPrompt(app: foundry.applications.api.ApplicationV2) {
  app.element?.classList.add(SHOWN_GAMBIT);
  app.bringToFront();
  app.element?.querySelector<HTMLElement>("[data-gps-default]")?.focus({ preventScroll: true });
}

function syncGambitHiding() {
  document.body.classList.toggle(HIDE_GAMBIT, listingGambit());
}

function waitsFor(userId: string): WaitInfo[] {
  return knownPlayerWaits().filter(wait => wait.userId === userId);
}

const seconds = (wait: WaitInfo) => Math.round((Date.now() - wait.startedAt) / 1000);

/** What is asked: the wait's label for a GM, its kind for a player (who is not told the label). */
function what(wait: WaitInfo): string {
  if (wait.label) return game.i18n!.localize(wait.label);
  const key = `midi-qol.PlayerWaits.Kind.${wait.kind}`;
  return game.i18n!.has(key) ? i18n(key) : i18n("midi-qol.PlayerWaits.Kind.other");
}

/** A wait's heading: the creature over what is asked, with the time waited on the right. */
function waitHeading(actorName: string | undefined, text: string, time?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "row";
  const body = document.createElement("div");
  body.className = "what";
  if (actorName) {
    const actor = document.createElement("strong");
    actor.textContent = actorName;
    body.append(actor);
  }
  const label = document.createElement("span");
  label.textContent = text;
  body.append(label);
  element.append(body);
  if (time) {
    const timeElement = document.createElement("span");
    timeElement.className = "time";
    timeElement.textContent = time;
    element.append(timeElement);
  }
  return element;
}

const elapsed = (wait: WaitInfo) => i18nFormat("midi-qol.PlayerWaits.Elapsed", { seconds: seconds(wait) });

/** The badge's tooltip: a heading per wait. */
function tooltipHTML(waits: WaitInfo[], gambit: GambitPrompt[], own = false): string {
  const list = document.createElement("div");
  for (const wait of waits) list.append(waitHeading(wait.actorName, what(wait), elapsed(wait)));
  for (const prompt of gambit) list.append(waitHeading(prompt.actorName, prompt.title));
  if (own) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = i18n("midi-qol.PlayerWaits.BringForward");
    list.append(hint);
  }
  return list.innerHTML;
}

/** midi's prompts open on this client (and the roll dialogs it asked for), reactions last so they end up on top. */
function openPrompts(): foundry.applications.api.ApplicationV2[] {
  const RollConfigurationDialog = globalThis.dnd5e?.applications?.dice?.RollConfigurationDialog;
  const isRoll = (app: foundry.applications.api.ApplicationV2) => !!RollConfigurationDialog && app instanceof RollConfigurationDialog;
  // The reaction and bonus dialogs' classes are on their content part, the others' on the window
  const has = (app: foundry.applications.api.ApplicationV2, selector: string) => app.element.matches(selector) || !!app.element.querySelector(selector);
  const order = (app: foundry.applications.api.ApplicationV2) =>
    has(app, ".midi-qol.reaction") ? 3 : isRoll(app) ? 0 : has(app, ".midi-targeting") ? 1 : 2;
  return [...foundry.applications.instances.values()]
    .filter(app => app.rendered && app.hasFrame && (isRoll(app)
      || has(app, ".midi-qol.reaction, .midi-qol.optional, .midi-qol-choose-effect, .midi-targeting, .midi-qol-confirm-reroll, .midi-qol-countdown")))
    .sort((a, b) => order(a) - order(b));
}

async function bringPromptsForward() {
  const apps = openPrompts();
  if (!apps.length) ui.notifications?.info(i18n("midi-qol.PlayerWaits.NothingOpen"));
  for (const app of apps) {
    if (app.minimized) await app.maximize();
    app.bringToFront();
  }
}

/** The open "answer for them" popover */
let popover: { userId: string, element: HTMLElement, anchor: HTMLElement, timer: number, shown?: string } | undefined;

/** Add, update or remove the badge on each player's row. */
function decorate(root: HTMLElement | undefined) {
  if (!root) return;
  root.querySelectorAll(`.${BADGE}`).forEach(el => el.remove());
  const isGM = !!game.user?.isGM;
  if (isGM && !configSettings.playerWaitGM) return;
  let pendingOffline = false;
  for (const row of Array.from(root.querySelectorAll<HTMLElement>("li.player[data-user-id]"))) {
    const userId = row.dataset.userId!;
    const own = !isGM && userId === game.user?.id;
    if (!isGM && !own && !configSettings.playerWaitShowPlayers) continue;
    const waits = waitsFor(userId);
    const gambit = isGM ? gambitPrompts(userId) : [];
    const count = waits.length + gambit.length;
    if (!count) continue;
    if (!game.users?.get(userId)?.active) pendingOffline = true;
    // Another player's is read-only: a plain badge with the tooltip
    const badge = document.createElement(isGM || own ? "button" : "span");
    if (badge instanceof HTMLButtonElement) badge.type = "button";
    badge.className = isGM ? BADGE : own ? `${BADGE} own` : `${BADGE} read-only`;
    badge.dataset.userId = userId;
    // No tooltip while this player's popover is open: it would cover the popover
    if (popover?.userId !== userId) badge.dataset.tooltipHtml = tooltipHTML(waits, gambit, own);
    badge.dataset.tooltipClass = "midi-qol-player-wait-tooltip";
    badge.dataset.tooltipDirection = "RIGHT";
    // A bolt segment for reactions (midi's and Gambit's), a d20 segment for rolls, each with its count
    const reactions = gambit.length + waits.filter(wait => wait.kind === "reaction").length;
    const rolls = count - reactions;
    const segment = (kind: string, icon: string, n: number) =>
      n ? `<span class="segment ${kind}"><i class="fa-solid ${icon}"></i><span class="count">${n}</span></span>` : "";
    badge.innerHTML = segment("reaction", "fa-bolt", reactions) + segment("roll", "fa-dice-d20", rolls);
    if (isGM || own) badge.addEventListener("click", event => {
      event.stopPropagation();
      if (own) bringPromptsForward();
      else {
        game.tooltip?.deactivate();
        delete badge.dataset.tooltipHtml;
        openPopover(userId, badge);
      }
    });
    row.append(badge);
  }
  // A disconnected player's row is in the collapsed part of the list
  if (isGM && pendingOffline && ui.players && !ui.players.expanded) ui.players.toggleExpanded(true);
}

function closePopover() {
  if (!popover) return;
  window.clearInterval(popover.timer);
  popover.element.remove();
  popover = undefined;
  document.removeEventListener("pointerdown", onOutsidePointer, true);
  refreshTooltips();
}

function onOutsidePointer(event: PointerEvent) {
  if (popover && !popover.element.contains(event.target as Node)) closePopover();
}

function choiceButton(wait: WaitInfo, choice: WaitInfo["choices"][number]): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = choice.label ? game.i18n!.localize(choice.label) : i18n(`midi-qol.PlayerWaits.Choice.${choice.id}`);
  button.addEventListener("click", async () => {
    button.disabled = true;
    await settlePlayerWait(wait.id, choice.id);
  });
  return button;
}

function renderPopover() {
  if (!popover) return;
  const { userId, element } = popover;
  const waits = waitsFor(userId);
  const gambit = gambitPrompts(userId);
  if (!waits.length && !gambit.length) return closePopover();
  const user = game.users?.get(userId);
  // Rebuilt only when what it lists changes, so a button isn't replaced between pressing and releasing it (the click
  // would be lost); otherwise the times and Gambit's titles (which carry its countdown) are updated in place.
  const shown = [user?.active, ...waits.map(wait => `${wait.id}:${wait.choices.map(choice => choice.id).join(",")}`),
    ...gambit.map(prompt => prompt.app.id)].join("|");
  if (shown === popover.shown) {
    for (const wait of waits) {
      const time = element.querySelector(`[data-wait-id="${wait.id}"] .time`);
      if (time) time.textContent = elapsed(wait);
    }
    for (const prompt of gambit) {
      const label = element.querySelector(`[data-gambit-id="${prompt.app.id}"] .what span`);
      if (label) label.textContent = prompt.title;
    }
    return;
  }
  popover.shown = shown;
  element.replaceChildren();
  const header = document.createElement("header");
  header.textContent = i18nFormat("midi-qol.PlayerWaits.Title", { name: user?.name ?? "" })
    + (user?.active ? "" : ` ${i18n("midi-qol.PlayerWaits.Offline")}`);
  element.append(header);
  for (const wait of waits) {
    const row = document.createElement("div");
    row.className = "midi-qol-player-wait-row";
    row.dataset.waitId = wait.id;
    const text = waitHeading(wait.actorName, what(wait), elapsed(wait));
    const buttons = document.createElement("div");
    buttons.className = "midi-qol-player-wait-choices";
    buttons.append(...wait.choices.map(choice => choiceButton(wait, choice)));
    row.append(text, buttons);
    element.append(row);
  }
  for (const prompt of gambit) {
    const row = document.createElement("div");
    row.className = "midi-qol-player-wait-row";
    row.dataset.gambitId = prompt.app.id;
    const text = waitHeading(prompt.actorName, prompt.title);
    const focus = document.createElement("button");
    focus.type = "button";
    focus.textContent = i18n("midi-qol.PlayerWaits.Focus");
    focus.addEventListener("click", () => {
      showGambitPrompt(prompt.app);
      closePopover();
    });
    const buttons = document.createElement("div");
    buttons.className = "midi-qol-player-wait-choices";
    buttons.append(focus);
    row.append(text, buttons);
    element.append(row);
  }
}

function openPopover(userId: string, anchor: HTMLElement) {
  closePopover();
  const element = document.createElement("div");
  element.className = `${POPOVER} themed theme-dark`;
  document.body.append(element);
  const rect = anchor.getBoundingClientRect();
  element.style.left = `${rect.right + 8}px`;
  element.style.bottom = `${window.innerHeight - rect.bottom}px`;
  popover = { userId, element, anchor, timer: window.setInterval(renderPopover, 1000) };
  renderPopover();
  document.addEventListener("pointerdown", onOutsidePointer, true);
}

function refresh() {
  decorate(ui.players?.element ?? undefined);
  renderPopover();
}

/** Right-click on a player: answer everything pending for them with each wait's default. */
function addContextOption(_app: unknown, options: foundry.applications.ux.ContextMenu.Entry<HTMLElement>[]) {
  options.push({
    name: "midi-qol.PlayerWaits.SkipAll",
    icon: '<i class="fa-solid fa-forward"></i>',
    condition: (li: HTMLElement) => !!game.user?.isGM && !!configSettings.playerWaitGM && waitsFor(li.dataset.userId ?? "").length > 0,
    callback: async (li: HTMLElement) => {
      for (const wait of waitsFor(li.dataset.userId ?? "")) await settlePlayerWait(wait.id, wait.choices[0].id);
    }
  });
}

/** Keep the badges' tooltips' times current (the badges are redrawn only when the waits change). */
function refreshTooltips() {
  const badges = ui.players?.element?.querySelectorAll<HTMLElement>(`.${BADGE}`);
  if (!badges?.length) return;
  for (const badge of Array.from(badges)) {
    const userId = badge.dataset.userId!;
    if (popover?.userId === userId) continue;
    badge.dataset.tooltipHtml = tooltipHTML(waitsFor(userId), game.user?.isGM ? gambitPrompts(userId) : [], badge.classList.contains("own"));
  }
}

export function setupPlayerWaitsUI() {
  window.setInterval(refreshTooltips, 1000);
  Hooks.on("renderPlayers", (_app: unknown, element: HTMLElement) => decorate(element));
  Hooks.on("getUserContextOptions", addContextOption);
  syncGambitHiding();
  Hooks.on("midi-qol.ConfigSettingsChanged", () => {
    syncGambitHiding();
    refresh();
  });
  // A player who disconnects leaves the GM's copy as the only one: show it
  Hooks.on("userConnected", (user: User.Implementation, connected: boolean) => {
    if (connected || !game.user?.isGM) return;
    for (const prompt of gambitPrompts(user.id!)) showGambitPrompt(prompt.app);
  });
  onPlayerWaitsChanged(refresh);
  // Gambit's prompts open and close outside midi
  const onGambit = (app: foundry.applications.api.ApplicationV2) => {
    if (!game.user?.isGM || !String(app.id).startsWith("gps-automation-")) return;
    // A mirrored copy midi can't list under a player is never left hidden
    if (!gambitPromptPlayer(app)) app.element?.classList.add(SHOWN_GAMBIT);
    refresh();
  };
  Hooks.on("renderApplicationV2", onGambit);
  Hooks.on("closeApplicationV2", (app: foundry.applications.api.ApplicationV2) => {
    // Closing hooks fire before the app is unregistered
    if (game.user?.isGM && String(app.id).startsWith("gps-automation-")) window.setTimeout(refresh, 0);
  });
}
