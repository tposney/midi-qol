import { i18n, i18nFormat } from "../../midi-qol.js";
import { knownPlayerWaits, onPlayerWaitsChanged, type WaitInfo } from "./playerWaits.js";

/*
 * M32e (plan ~/Documents/midi-next-M32-plan-2026-11-22.md): a use's card says who it is waiting for and for what, from
 * the waits this client knows (the GM all of them, a player their own, or everyone's with Show waits to players: a
 * player sees a wait's kind, not its label). Redrawn when the waits change and when the card renders; gone when none.
 */

const LINE = "midi-qol-card-waiting";

function describe(wait: WaitInfo): string {
  const user = game.users?.get(wait.userId)?.name ?? "?";
  const what = wait.label || i18n(`midi-qol.PlayerWaits.Kind.${wait.kind}`);
  const who = wait.actorName ? `${user} (${wait.actorName})` : user;
  return `${foundry.utils.escapeHTML(who)}: ${foundry.utils.escapeHTML(what)}`;
}

function decorate(element: HTMLElement, cardUuid: string, waits: WaitInfo[]) {
  element.querySelector(`.${LINE}`)?.remove();
  const mine = waits.filter(w => w.cardUuid === cardUuid);
  if (!mine.length) return;
  const line = document.createElement("div");
  line.className = LINE;
  line.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ${i18nFormat("midi-qol.CardWaiting.Line", { who: mine.map(describe).join("; ") })}`;
  (element.querySelector(".message-content") ?? element).append(line);
}

/** Every rendered copy of the cards the waits name, and those that had a line */
function refresh() {
  const waits = knownPlayerWaits();
  const cards = new Set([...waits.map(w => w.cardUuid).filter((u): u is string => !!u)]);
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(`.${LINE}`))) {
    const id = element.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
    if (id) cards.add(`ChatMessage.${id}`);
  }
  for (const uuid of cards) {
    const id = uuid.split(".").pop();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(`[data-message-id="${id}"]`))) decorate(element, uuid, waits);
  }
}

export function registerCardWaits() {
  onPlayerWaitsChanged(refresh);
  Hooks.on("renderChatMessageHTML", (message: ChatMessage.Implementation, element: HTMLElement) => {
    if (message.uuid) decorate(element, message.uuid, knownPlayerWaits());
  });
}
