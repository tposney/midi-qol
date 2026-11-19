import type { Activity } from "../../globals.js";
import { hasConsumption } from "./use.js";
import { isMidiActivityType } from "./midiActivity.js";
import { i18n } from "../../midi-qol.js";
import { midiButtonVisibility } from "../ChatClasses/UsageCardMessage.js";
import { cardMidi, cardOtherConsumption } from "../lib/cardState.js";
import { configSettings } from "../settings.js";
import { activityHasAutoPlaceTemplate, activityHasEmanationNoTemplate } from "../utils.js";
import { Registry, type RegistryOptions } from "../api/registry.js";
import { reportServiceProblem } from "../api/services.js";
import { activityPolicy } from "./activityPrototype.js";

/*
 * midi's part in a usage card's buttons, for the activity types it automates: which buttons the card stores
 * (dnd5e.preCreateUsageMessage) and which it hides (the card model's _prepareButtons), and whether dnd5e runs
 * the activity's follow-up action after the use (usageConfig.subsequentActions).
 */

export type UsageButton = {
  action?: string, label?: { value?: string, short?: string, hidden?: string }, icon?: string, visibility?: string,
  canGroup?: boolean, dataset?: Record<string, unknown>
};

const actionOf = (b: UsageButton) => b.action || (b.dataset?.action as string | undefined);

/** Whether saves are rolled from the card's buttons rather than by midi. */
export function savesRolledFromChat(): boolean {
  const rollSaveOptions = new Set([configSettings.rollNPCLinkedSaves, configSettings.rollNPCSaves, configSettings.playerRollSaves]);
  return rollSaveOptions.has("none") || rollSaveOptions.has("chat") || configSettings.autoCheckSaves === "none";
}

/** A check activity's own buttons: damage when it has some, and a plain d20 roll when dnd5e drew no check button. */
function checkButtons(activity: Activity, buttons: UsageButton[]): UsageButton[] {
  const extra: UsageButton[] = [];
  // 6.0 button format: action at the top level, a label object holding the i18n key, icon as FontAwesome classes
  if (activity.damage?.parts?.length) extra.push({ action: "rollDamage", label: { value: "DND5E.Damage" }, icon: "fa-solid fa-burst" });
  if (!buttons.some(b => actionOf(b) === "rollCheck")) {
    const dc = activity.check?.dc?.value;
    const label = i18n("midi-qol.plain-d20-roll");
    // As dnd5e's own check buttons: the DC in label.value, the plain form in label.hidden (_prepareButtons picks)
    extra.push({
      action: "rollCheck",
      canGroup: true,
      icon: "systems/dnd5e/icons/svg/ability-score-improvement.svg",
      label: { hidden: label, value: dc ? game.i18n!.format("EDITOR.DND5E.Inline.DC", { dc: String(dc), check: label }) : label },
      dataset: dc ? { dc } : {},
      visibility: "all"
    });
  }
  return extra;
}

/** The buttons dnd5e gives an activity's card, with the type's own additions. */
function typeButtons(activity: Activity, message: object): UsageButton[] {
  const usageChatButtons: unknown = activity._usageChatButtons;
  const buttons: UsageButton[] = typeof usageChatButtons === "function" ? usageChatButtons.call(activity, message) : [];
  return activity.type === "check" ? [...checkButtons(activity, buttons), ...buttons] : buttons;
}

/** The card's buttons: dnd5e's (`base`) as midi draws them. */
export function midiUsageButtons(activity: Activity, message: object, base: UsageButton[]): UsageButton[] {
  let buttons = [...base];
  // Auto placed templates have no Place Template button
  if (activityHasAutoPlaceTemplate(activity) || activityHasEmanationNoTemplate(activity))
    buttons = buttons.filter(b => actionOf(b) !== "placeTemplate");
  // Rolled from the card when saves are not auto-rolled; the rollSave/rollCheck card action hands them to the activity they belong to.
  const saveSource = activity.otherSaveSource as Activity | undefined;
  if (saveSource && !activity.save && !activity.check && savesRolledFromChat())
    buttons.push(...typeButtons(saveSource, message).filter(b => ["rollSave", "rollCheck"].includes(actionOf(b) ?? "")));
  const otherActivity = activity.otherActivity as Activity | undefined;
  if (isMidiActivityType(otherActivity) && hasConsumption(otherActivity)) {
    // The label is a key: card-buttons.hbs localizes it at render
    buttons.push({
      action: "consumeOtherActivity",
      label: { value: "midi-qol.ConsumeOtherActivityResource", short: "midi-qol.ConsumeOtherActivityResourceShort" },
      icon: "fa-solid fa-cubes-stacked",
      visibility: "creator"
    }, {
      action: "refundOtherActivity",
      label: { value: "midi-qol.RefundOtherActivityResource", short: "midi-qol.RefundOtherActivityResourceShort" },
      icon: "fa-solid fa-clock-rotate-left",
      visibility: "creator"
    });
  }
  return activity.type === "check" ? [...checkButtons(activity, buttons), ...buttons] : buttons;
}

/** Whether a card button is hidden: true hides it, false shows it, undefined leaves it to the next rule. */
export type CardButtonRule = (button: UsageButton, message: ChatMessage.Implementation, activity: Activity | undefined) => boolean | undefined;

const buttonRules = new Map<string, Registry<CardButtonRule>>();

/**
 * A hide rule for the card buttons with `action` (another module's own button, or one of midi's). Rules for an action
 * are asked before midi's own rule, higher priority first, then in registration order; the first answer that is not
 * undefined decides. Not asked once the card's buttons are all removed (a finished use).
 */
export function registerCardButtonRule(action: string, id: string, rule: CardButtonRule, options: RegistryOptions = {}) {
  let rules = buttonRules.get(action);
  if (!rules) buttonRules.set(action, rules = new Registry());
  rules.set(id, rule, options);
}

/**
 * midi's decision for a button of the card (one not visible to all): true hides it, false shows it, undefined leaves
 * it to dnd5e's own `shouldHideChatButton`.
 */
export function midiButtonHidden(button: UsageButton, message: ChatMessage.Implementation, activity: Activity | undefined): boolean | undefined {
  const action = actionOf(button);
  const midi = cardMidi(message);
  // The same rule midi's own buttons are drawn by, so the two cannot disagree
  const visible = midiButtonVisibility(message, activity);
  if (visible.allRemoved) return true;
  for (const { id, value: rule } of buttonRules.get(action ?? "")?.entries() ?? []) {
    try {
      const hidden = rule(button, message, activity);
      if (hidden !== undefined) return hidden;
    } catch (err) {
      reportServiceProblem("cardButtons", id, `its rule for "${action}" failed and is skipped`, err);
    }
  }
  const { consumed } = cardOtherConsumption(message);
  switch (action) {
    // midi draws its own attack and damage controls; dnd5e's stay stored for a card midi did not draw
    case "rollAttack": return midi?.hasAttack || visible.attackSpent ? true : undefined;
    case "rollDamage": return midi?.hasDamage || visible.damageSpent ? true : undefined;
    // Consume shows only when rolled without consuming ({}); refund only when something was consumed
    case "consumeOtherActivity": return !(consumed && foundry.utils.isEmpty(consumed));
    case "refundOtherActivity": return !consumed || foundry.utils.isEmpty(consumed);
    case "planTeleport": return visible.teleported ? true : undefined;
    // dnd5e hides it without a canvas scene, which is the case while the page reloads: only the permission counts
    case "placeTemplate":
      if (visible.templatesPlaced) return true;
      return !game.user?.can("REGION_CREATE" as User.ActionPermission);
    case "rollSave":
    case "rollCheck":
      return visible.savesResolved ? true : undefined;
  }
  return undefined;
}

function onPreCreateUsageMessage(activity: Activity, messageConfig: { data?: { system?: { buttons?: UsageButton[] } } }): void {
  if (!activityPolicy(activity).automated || !messageConfig.data) return;
  const buttons = midiUsageButtons(activity, messageConfig, messageConfig.data.system?.buttons ?? []);
  if (buttons.length) foundry.utils.setProperty(messageConfig.data, "system.buttons", buttons);
  else if (messageConfig.data.system) delete messageConfig.data.system.buttons;
}

function onPreUseActivity(activity: Activity, usageConfig: { subsequentActions?: boolean }) {
  const policy = activityPolicy(activity);
  if (policy.automated && !policy.subsequentActions(activity)) usageConfig.subsequentActions = false;
  return true;
}

export function installUsageButtons() {
  Hooks.on("dnd5e.preCreateUsageMessage", onPreCreateUsageMessage);
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
}
