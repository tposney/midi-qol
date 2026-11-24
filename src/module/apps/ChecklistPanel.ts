import { i18n } from "../../midi-qol.js";
import { checklistFor, type ChecklistItem } from "../lib/checklist.js";
import { activeHud } from "../services/turnModel/hud.js";

/*
 * M22b: the turn checklist panel. Opens for a creature's owners (players; per-player setting, on by default) when its
 * turn starts: what happens now, and what it hasn't used before ending, with End Turn. Follows the creature while open;
 * closes when the turn moves on. MidiQOL.checklist.open(actor) opens it for anyone (the GM included). Its setting is
 * the user's (it follows them to any browser).
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const SETTING = "turnChecklist" as const;

export class ChecklistPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "midi-qol-checklist",
    classes: ["midi-qol", "midi-qol-checklist"],
    window: { title: "midi-qol.Checklist.Title", icon: "fa-solid fa-list-check", resizable: true },
    position: { width: 340, height: "auto" as const },
    actions: { checklistEndTurn: ChecklistPanel.#onEndTurn }
  };

  static PARTS = { body: { template: "modules/midi-qol/templates/apps/Checklist/checklist.hbs" } };

  actor: Actor.Implementation;

  constructor(actor: Actor.Implementation) {
    super({});
    this.actor = actor;
  }

  static open(actor: Actor.Implementation) {
    const open = foundry.applications.instances.get("midi-qol-checklist") as ChecklistPanel | undefined;
    if (open && open.actor !== actor) void open.close();
    else if (open) return void open.render({ force: true });
    void new ChecklistPanel(actor).render({ force: true });
  }

  get title() { return i18n("midi-qol.Checklist.Title").replace("{name}", this.actor.name ?? ""); }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const items = checklistFor(this.actor);
    const view = (item: ChecklistItem) => ({ ...item, icon: item.icon ?? "fa-solid fa-circle-info" });
    const combat = game.combats?.find(c => !!c.started && c.combatant?.actor === this.actor);
    return {
      ...context,
      now: items.filter(i => i.phase === "start").map(view),
      before: items.filter(i => i.phase === "end").map(view),
      canEnd: !!combat && (game.user?.isGM || !!combat.combatant?.isOwner)
    };
  }

  static async #onEndTurn(this: ChecklistPanel) {
    const combat = game.combats?.find(c => !!c.started && c.combatant?.actor === this.actor);
    await combat?.nextTurn();
    await this.close();
  }
}

export function registerChecklistSetting() {
  game.settings?.register("midi-qol", SETTING, {
    name: "midi-qol.Checklist.Setting.Name", hint: "midi-qol.Checklist.Setting.Hint",
    scope: "user", config: true, type: Boolean, default: true
  });
}

export function setupChecklistPanel() {
  // A creature's turn starts: its owners (players) see the checklist
  Hooks.on("combatTurnChange", (combat: Combat.Implementation) => {
    const open = foundry.applications.instances.get("midi-qol-checklist") as ChecklistPanel | undefined;
    const actor = combat.combatant?.actor;
    if (open && open.actor !== actor) void open.close();
    if (!actor || game.user?.isGM || !actor.isOwner) return;
    // midi's hub shows the turn itself
    if (activeHud("combat")?.id === "midi-qol.hub") return;
    if (game.settings?.get("midi-qol", SETTING) === false) return;
    ChecklistPanel.open(actor);
  });
  // Kept up to date while open
  const refresh = () => {
    const open = foundry.applications.instances.get("midi-qol-checklist") as ChecklistPanel | undefined;
    if (open?.rendered) void open.render();
  };
  for (const hook of ["updateActor", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateToken", "updateChatMessage"] as const)
    Hooks.on(hook, refresh);
}
