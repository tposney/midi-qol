import { availableInteractions, runInteraction, type InteractionOffer } from "./registry.js";

/*
 * M8b: the Token HUD's Interactions palette (Foundry's own palette: a control-icon with data-action togglePalette and a
 * `.palette` list, as the level picker). The HUD's token is the creature acting (a player can open the HUD only on
 * their own tokens): its own interactions, then those against the user's target, if one. One not possible now is
 * listed faint with its reason as the tooltip.
 */

const PALETTE = "midiInteractions";

function entry(offer: InteractionOffer, onClick: () => void): HTMLElement {
  const a = document.createElement("a");
  a.className = "palette-list-entry" + (offer.reason ? " midi-qol-faint" : "");
  a.dataset.tooltip = offer.reason ?? offer.hint ?? "";
  if (offer.reason) a.setAttribute("aria-disabled", "true");
  const icon = offer.icon ? `<i class="${offer.icon}" inert></i> ` : "";
  a.innerHTML = `${icon}<span></span>`;
  a.querySelector("span")!.textContent = offer.label;
  if (!offer.reason) a.addEventListener("click", event => { event.preventDefault(); onClick(); });
  return a;
}

function onRenderTokenHUD(hud: { document?: TokenDocument.Implementation, close?: () => unknown }, html: HTMLElement) {
  const subject = hud.document;
  if (!subject?.isOwner || !subject.actor) return;
  const target = [...(game.user?.targets ?? [])].map(t => t.document as TokenDocument.Implementation).find(t => t !== subject);
  const own = availableInteractions(subject).map(offer => ({ offer, against: undefined as TokenDocument.Implementation | undefined }));
  const atTarget = target ? availableInteractions(subject, target).map(offer => ({ offer, against: target })) : [];
  const offers = [...own, ...atTarget];
  if (!offers.length) return;
  const column = html.querySelector(".col.right") ?? html.querySelector(".col.left");
  if (!column) return;
  const title = game.i18n?.localize("midi-qol.Interactions.Title") ?? "Interactions";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon";
  button.dataset.action = "togglePalette";
  button.dataset.palette = PALETTE;
  button.dataset.tooltip = target ? `${title}: ${target.name}` : title;
  button.setAttribute("aria-label", title);
  button.innerHTML = `<i class="fa-solid fa-hand-sparkles" inert></i>`;
  const palette = document.createElement("div");
  palette.className = "palette palette-list";
  palette.dataset.palette = PALETTE;
  for (const { offer, against } of offers) {
    palette.append(entry(offer, () => {
      void hud.close?.();
      void runInteraction(offer.id, subject, against).then(result => {
        if (!result.done && result.reason) ui.notifications?.warn(result.reason);
      });
    }));
  }
  column.append(button, palette);
}

export function setupInteractionsHUD() {
  Hooks.on("renderTokenHUD", (hud, html) => onRenderTokenHUD(hud as never, html as HTMLElement));
}
