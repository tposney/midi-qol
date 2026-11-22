import type { Workflow } from "../Workflow.js";

/*
 * M32c (plan ~/Documents/midi-next-M32-plan-2026-11-22.md; proposal 13b part 2): the optional bonuses a roll takes
 * before it is rolled, ticked in dnd5e's own roll dialog when it shows. midi's section is part of the dialog's form, so
 * a tick rebuilds the rolls as any of its fields does: dnd5e's build hook adds the ticked adds as parts of the first
 * roll (the formula shown updates), and the roll made is built the same way. After the roll the workflow takes the
 * ticked ones (Workflow.takeDialogBonuses) and settles them with its other before-roll bonuses.
 */

type Kind = "attack" | "damage";
type DialogLike = { config?: { workflow?: unknown, hookNames?: string[] } };
/** dnd5e's RollConfigurationDialog: its process config */
const dialogOf = (app: foundry.applications.api.ApplicationV2) => app as DialogLike;

function workflowOf(app: DialogLike): Workflow | undefined {
  const workflow = app.config?.workflow as Workflow | undefined;
  return workflow && typeof workflow.dialogOffers === "function" ? workflow : undefined;
}

function kindOf(app: DialogLike): Kind | undefined {
  const names = app.config?.hookNames ?? [];
  return names.includes("attack") ? "attack" : names.includes("damage") ? "damage" : undefined;
}

const field = (index: number) => `midiBonus-${index}`;

/** midi's section in the dialog's configuration part (once) */
function addSection(application: foundry.applications.api.ApplicationV2, element: HTMLElement) {
  const app = dialogOf(application);
  const workflow = workflowOf(app);
  const kind = kindOf(app);
  if (!workflow || !kind) return;
  const offers = workflow.dialogOffers(kind);
  if (!offers.length) return;
  const part = element.querySelector<HTMLElement>("[data-application-part='configuration']");
  if (!part || part.querySelector(".midi-qol-roll-bonuses")) return;
  const esc = foundry.utils.escapeHTML;
  const rows = offers.map((offer, index) => {
    const formula = offer.effect.kind === "add" ? ` (+${offer.effect.formula})` : "";
    return `<div class="form-group"><label class="checkbox" ${offer.description ? `data-tooltip="${esc(offer.description)}"` : ""}>`
      + `<input type="checkbox" name="${field(index)}"> ${esc(offer.label)}${esc(formula)}</label></div>`;
  }).join("");
  const fieldset = document.createElement("fieldset");
  fieldset.className = "midi-qol-roll-bonuses";
  fieldset.innerHTML = `<legend>${esc(game.i18n?.localize("midi-qol.RollDialogBonuses.Legend") ?? "Bonuses")}</legend>${rows}`;
  part.append(fieldset);
}

/** dnd5e's build hook: the ticked adds as parts of the first roll, and recorded as ticked */
function addTicked(application: foundry.applications.api.ApplicationV2, rollConfig: { parts?: string[] }, formData: foundry.applications.ux.FormDataExtended | undefined, index: number) {
  if (index !== 0 || !formData) return;
  const app = dialogOf(application);
  const workflow = workflowOf(app);
  const kind = kindOf(app);
  if (!workflow || !kind) return;
  const offers = workflow.dialogOffers(kind);
  if (!offers.length) return;
  const ticked = new Set<string>();
  offers.forEach((offer, i) => {
    if (!formData.get(field(i)) || offer.effect.kind !== "add") return;
    rollConfig.parts = [...(rollConfig.parts ?? []), `${offer.effect.formula}[${offer.label}]`];
    ticked.add(offer.id);
  });
  workflow.setDialogTicked(kind, ticked);
}

export function registerRollDialogBonuses() {
  Hooks.on("renderRollConfigurationDialog", (app, element) => addSection(app, element));
  Hooks.on("dnd5e.buildAttackRollConfig", addTicked);
  Hooks.on("dnd5e.buildDamageRollConfig", addTicked);
}
