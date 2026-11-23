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

const COMPASS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];

/** The doors near the token, each with what can be done at it now (a door none can be done at is left out) */
function doorOffers(subject: TokenDocument.Implementation): { offer: InteractionOffer, against: WallDocument.Implementation }[] {
  const scene = subject.parent;
  if (!scene) return [];
  const size = scene.grid.size;
  const centre = { x: subject._source.x + (subject.width * size) / 2, y: subject._source.y + (subject.height * size) / 2 };
  const out: { offer: InteractionOffer, against: WallDocument.Implementation }[] = [];
  for (const wall of scene.walls.contents as WallDocument.Implementation[]) {
    if (!((wall.door ?? 0) > 0)) continue;
    const [x0, y0, x1, y1] = wall.c;
    const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    if (Math.hypot(mid.x - centre.x, mid.y - centre.y) > 2 * size) continue;
    const offers = availableInteractions(subject, wall).filter(o => !o.reason || !/range/i.test(o.reason));
    if (!offers.length) continue;
    const angle = Math.atan2(mid.y - centre.y, mid.x - centre.x);
    const where = COMPASS[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
    for (const offer of offers) out.push({ offer: { ...offer, label: `${offer.label} (${where})` }, against: wall });
  }
  return out;
}

function onRenderTokenHUD(hud: { document?: TokenDocument.Implementation, close?: () => unknown }, html: HTMLElement) {
  const subject = hud.document;
  if (!subject?.isOwner || !subject.actor) return;
  const target = [...(game.user?.targets ?? [])].map(t => t.document as TokenDocument.Implementation).find(t => t !== subject);
  const own = availableInteractions(subject).map(offer => ({ offer, against: undefined as TokenDocument.Implementation | undefined }));
  const atTarget = target ? availableInteractions(subject, target).map(offer => ({ offer, against: target as TokenDocument.Implementation | WallDocument.Implementation | undefined })) : [];
  const offers = [...own, ...atTarget, ...doorOffers(subject)];
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
      void runInteraction(offer.id, subject, against as never).then(result => {
        if (!result.done && result.reason) ui.notifications?.warn(result.reason);
      });
    }));
  }
  column.append(button, palette);
}

export function setupInteractionsHUD() {
  Hooks.on("renderTokenHUD", (hud, html) => onRenderTokenHUD(hud as never, html as HTMLElement));
}
