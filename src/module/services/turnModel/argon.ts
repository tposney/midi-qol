import { i18n } from "../../../midi-qol.js";
import { FOUNDRY_HUD, hudChoice, registerHud } from "./hud.js";
import { getTurnModel, peekTurnModel } from "./model.js";

/*
 * M7d: Argon (Combat HUD: enhancedcombathud with enhancedcombathud-dnd5e) as a combat HUD in midi's registry, registered by
 * midi on its behalf (a proof that a HUD midi doesn't own can show midi's turn model).
 * - Shown and hidden through Argon's own switch (ui.ARGON.enabled), bound to the token midi gives.
 * - While another combat HUD (or none) is chosen, Argon's "always on" doesn't bring it back on a token's control; with
 *   Foundry's hotbar chosen, Argon behaves as it does without midi.
 * - Its item buttons are greyed, with midi's reasons on a badge, when midi's turn model says they can't be used now; its own
 *   buttons (Dash, Dodge..., the spell and feature drawers) when their panel's action is spent. Its action pips read midi's
 *   action flags; a turn model change redraws the pips and the marks.
 */

const ARGON_ID = "midi-qol.argon";

type ArgonPanel = { label?: string, maxActions?: number | null, currentActions?: number | null, _buttons?: ArgonButton[], updateActionUse?(): void };
type ArgonButton = { element?: HTMLElement | null, activity?: { uuid?: string } | null, item?: unknown, parent?: ArgonButton | ArgonPanel | null,
  button1?: ArgonButton, button2?: ArgonButton, render?(): unknown };
type ArgonHud = { enabled: boolean | Token.Implementation, _actor?: Actor.Implementation | null, _itemButtons?: Set<ArgonButton>,
  components?: { main?: ArgonPanel[] } };
type Renderable = { prototype: { _renderInner(...args: unknown[]): Promise<unknown> } };
type ArgonCore = {
  ARGON: { MAIN: { BUTTONS: { ItemButton: Renderable, ActionButton: Renderable, ButtonPanelButton: Renderable } } },
  prototype: { _onControlToken(...args: unknown[]): unknown }
};

/** midi's wording for a spent panel's kind (Argon's dnd5e panel labels) */
const PANEL_USED: Record<string, string> = {
  "DND5E.Action": "midi-qol.Economy.ActionUsed", "DND5E.BonusAction": "midi-qol.EnforceBonusActions.Content", "DND5E.Reaction": "midi-qol.EnforceReactions.Content"
};

/** The action panel a button sits in (through a split button) */
function panelOf(button: ArgonButton): ArgonPanel | undefined {
  let at: ArgonButton | ArgonPanel | null | undefined = button.parent;
  while (at && !("maxActions" in at)) at = (at as ArgonButton).parent;
  return at as ArgonPanel | undefined;
}

/** Argon's own buttons (no activity of their own): spent when their panel's action is */
function panelReasons(button: ArgonButton): string[] {
  const panel = panelOf(button);
  const key = panel?.label ? PANEL_USED[panel.label] : undefined;
  if (!key || panel?.maxActions === null || panel?.maxActions === undefined || (panel.currentActions ?? 1) > 0) return [];
  return [i18n(key)];
}

const argonHud = () => (ui as unknown as { ARGON?: ArgonHud }).ARGON;
const argonActive = () => !!game.modules.get("enhancedcombathud")?.active && !!game.modules.get("enhancedcombathud-dnd5e")?.active;

/** Argon left to itself: chosen, or Foundry's hotbar chosen (Argon as without midi) */
const argonFree = () => [ARGON_ID, FOUNDRY_HUD].includes(hudChoice("combat"));

/** midi's reasons a button's activity can't be used now (the cached turn model; a fresh one asked for if none) */
function reasonsFor(button: ArgonButton): string[] {
  const actor = argonHud()?._actor;
  const uuid = button.activity?.uuid;
  if (!actor || !uuid) return [];
  const model = peekTurnModel(actor);
  if (!model) { void getTurnModel(actor); return []; }
  return model.activities.find(cell => cell.uuid === uuid)?.issues.map(issue => issue.label) ?? [];
}

/** Greys a button midi says can't be used now, its reasons on a badge's tooltip */
function markButton(button: ArgonButton) {
  const el = button.element;
  if (!el) return;
  const reasons = button.activity ? reasonsFor(button) : panelReasons(button);
  el.classList.toggle("midi-qol-argon-unusable", reasons.length > 0);
  let badge = el.querySelector<HTMLElement>(".midi-qol-argon-reason");
  if (!reasons.length) return void badge?.remove();
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "midi-qol-argon-reason fa-solid fa-ban";
    el.append(badge);
  }
  badge.dataset.tooltip = reasons.join("<br>");
}

/** A turn model change: the panels' pips redrawn, every button marked again */
function markAll() {
  for (const panel of argonHud()?.components?.main ?? []) {
    panel.updateActionUse?.();
    const walk = (button: ArgonButton) => { markButton(button); if (button.button1) walk(button.button1); if (button.button2) walk(button.button2); };
    for (const button of panel._buttons ?? []) walk(button);
  }
  for (const button of argonHud()?._itemButtons ?? []) markButton(button);
}

export function setupArgon() {
  Hooks.once("argonInit" as never, ((CoreHUD: ArgonCore) => {
    const { ItemButton, ActionButton, ButtonPanelButton } = CoreHUD.ARGON.MAIN.BUTTONS;
    for (const cls of [ItemButton, ActionButton, ButtonPanelButton]) {
      const render = cls.prototype._renderInner;
      cls.prototype._renderInner = async function (this: ArgonButton, ...args: unknown[]) {
        const result = await render.apply(this, args);
        markButton(this);
        return result;
      };
    }
    const onControl = CoreHUD.prototype._onControlToken;
    CoreHUD.prototype._onControlToken = function (this: unknown, ...args: unknown[]) {
      if (!argonFree()) return;
      return onControl.apply(this, args);
    };
  }) as never);
  Hooks.on("midi-qol.turnModelChanged" as never, ((uuid: string) => {
    if (argonHud()?._actor?.uuid === uuid) markAll();
  }) as never);
  Hooks.once("ready", () => {
    if (!argonActive()) return;
    registerHud(ARGON_ID, {
      role: "combat",
      label: "Argon (Combat HUD)",
      available: argonActive,
      show: token => { const hud = argonHud(); if (hud) hud.enabled = (token?.object as Token.Implementation | null) ?? true; },
      hide: () => { const hud = argonHud(); if (hud) hud.enabled = false; },
      credit: `<a href="https://github.com/theripper93/enhancedcombathud">Argon, Combat HUD</a> by theripper93 and Mouse0270; midi-qol shows its turn model there.`,
      settings: {
        tabs: [
          { id: "argon", label: "Argon", icon: "fa-solid fa-shield-halved", roles: ["combat"], keys: [
            "enhancedcombathud.alwaysOn", "enhancedcombathud.openCombatStart", "enhancedcombathud.autoScale", "enhancedcombathud.scale",
            "enhancedcombathud.fadeOutInactive", "enhancedcombathud.showTooltips", "enhancedcombathud.playerDetailsBottom",
            "enhancedcombathud.hideMacroPlayers", "enhancedcombathud.rangepicker"] },
          { id: "argonDnd5e", label: "Argon: dnd5e", icon: "fa-solid fa-dice-d20", roles: ["combat"], keys: [
            "enhancedcombathud-dnd5e.showSpecialActions", "enhancedcombathud-dnd5e.macroPanel", "enhancedcombathud-dnd5e.switchEquip",
            "enhancedcombathud-dnd5e.explodeItemActivities", "enhancedcombathud-dnd5e.showWeaponsItems", "enhancedcombathud-dnd5e.showClassActions"] }
        ]
      }
    });
  });
}
