import { canEditEntries, EntryEditor } from "./EntryEditor.js";
import { overlayItemFor, overlayModeOf, overlaysOn, type OverlayMode } from "../lib/entries/overlays.js";
import { i18n } from "../../midi-qol.js";

/*
 * The item sheet's Automation section (dnd5e's Description tab): what midi automates on the item, read as the entry
 * editor's sentences, so an item automated only by entries (Wild Magic Surge) doesn't look empty. Shown only when there
 * is something of midi's; its button opens the entry editor. An item an overlay matches has the overlay's name and a
 * choice of whether it applies (the world setting, always or never), shown even when it doesn't.
 */

const TEMPLATE = "modules/midi-qol/templates/apps/EntryEditor/itemAutomation.hbs";

export function registerItemAutomationSection() {
  Hooks.on("renderItemSheet5e", async (app, html) => {
    const item = app.document;
    if (!(item instanceof Item)) return;
    const tab = html.querySelector<HTMLElement>('section.tab[data-tab="description"]');
    if (!tab) return;
    tab.querySelector(".midi-qol-item-automation")?.remove();
    const homes = new EntryEditor(item as unknown as ConstructorParameters<typeof EntryEditor>[0]).summary();
    const overlayItem = item.parent instanceof Actor ? overlayItemFor(item as Item.Implementation) : undefined;
    if (!homes.length && !overlayItem) return;
    const world = i18n(overlaysOn() ? "midi-qol.OverlayItems.On" : "midi-qol.OverlayItems.Off");
    const overlay = overlayItem ? {
      name: overlayItem.name, mode: overlayModeOf(item as Item.Implementation),
      modes: { default: i18n("midi-qol.OverlayItems.Default").replace("{world}", world), enable: i18n("midi-qol.OverlayItems.Enable"), disable: i18n("midi-qol.OverlayItems.Disable") }
    } : undefined;
    const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, { homes, overlay, canEdit: canEditEntries(item) });
    const holder = document.createElement("div");
    holder.innerHTML = content;
    const section = holder.firstElementChild as HTMLElement | null;
    if (!section) return;
    section.querySelector<HTMLSelectElement>("[data-midi-overlay-mode]")?.addEventListener("change", event => {
      const mode = (event.currentTarget as HTMLSelectElement).value as OverlayMode;
      void (mode === "default" ? item.unsetFlag("midi-qol", "overlayMode") : item.setFlag("midi-qol", "overlayMode", mode));
    });
    section.querySelector("[data-midi-open-entries]")?.addEventListener("click", () => {
      void new EntryEditor(item as unknown as ConstructorParameters<typeof EntryEditor>[0], { view: "sentence" }).render({ force: true });
    });
    const descriptions = tab.querySelector(".item-descriptions");
    if (descriptions) descriptions.after(section);
    else tab.append(section);
  });
}
