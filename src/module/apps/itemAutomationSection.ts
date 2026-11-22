import { canEditEntries, EntryEditor } from "./EntryEditor.js";

/*
 * The item sheet's Automation section (dnd5e's Description tab): what midi automates on the item, read as the entry
 * editor's sentences, so an item automated only by entries (Wild Magic Surge) doesn't look empty. Shown only when there
 * is something of midi's; its button opens the entry editor.
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
    if (!homes.length) return;
    const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, { homes, canEdit: canEditEntries(item) });
    const holder = document.createElement("div");
    holder.innerHTML = content;
    const section = holder.firstElementChild as HTMLElement | null;
    if (!section) return;
    section.querySelector("[data-midi-open-entries]")?.addEventListener("click", () => {
      void new EntryEditor(item as unknown as ConstructorParameters<typeof EntryEditor>[0]).render({ force: true });
    });
    const descriptions = tab.querySelector(".item-descriptions");
    if (descriptions) descriptions.after(section);
    else tab.append(section);
  });
}
