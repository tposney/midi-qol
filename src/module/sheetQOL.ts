import { i18n, debug, debugEnabled } from "../midi-qol.js";
import { configSettings } from "./settings.js";
import { areMidiKeysPressed, isAutoFastAttack, isAutoFastDamage } from "./utils.js";

/**
 * Supported dnd5e v13 actor sheet classes (ApplicationV2-based)
 */
const SUPPORTED_SHEETS = [
  "CharacterActorSheet",
  "NPCActorSheet"
];

/**
 * Set up hooks for injecting midi-qol buttons into actor sheets
 */
export function setupSheetQol() {
  for (const sheetName of SUPPORTED_SHEETS) {
    const hookName = `render${sheetName}`;
    if (debugEnabled > 0) debug("Registering sheetQOL hook:", hookName);
    // @ts-expect-error Dynamic hook names not in HookConfig
    Hooks.on(hookName, injectMidiButtons);
  }
}

/**
 * Main function to inject midi buttons into the actor sheet
 * ApplicationV2 signature: (app, html, context, options)
 */
function injectMidiButtons(app: any, html: HTMLElement, context?: object, options?: object) {
  // Check if feature is enabled
  if (!configSettings.addSheetButtons) return;

  // Handle both jQuery and native element (ApplicationV2 uses native)
  const element = html instanceof HTMLElement ? html : html[0];
  if (!element) return;

  if (debugEnabled > 0) debug("injectMidiButtons called for", app.constructor.name);

  // Find all item rows in the inventory and inject info icon
  element.querySelectorAll(".item.collapsible > .item-row").forEach(itemRow => {
    const itemElement = itemRow.closest(".item") as HTMLElement;
    const itemId = itemElement?.dataset.itemId;
    const item = app.document?.items?.get(itemId) ?? app.actor?.items?.get(itemId);
    if (!item) return;

    // Inject info icon after item name
    injectInfoIcon(itemRow as HTMLElement, item);
  });

  // Find all expanded item wrappers for activity buttons
  element.querySelectorAll(".item.collapsible .item-description .wrapper").forEach(wrapper => {
    const itemElement = wrapper.closest(".item") as HTMLElement;
    const itemId = itemElement?.dataset.itemId;
    const item = app.document?.items?.get(itemId) ?? app.actor?.items?.get(itemId);
    if (!item) return;

    // Inject activity-level buttons (Attack, Damage) to each activity row
    wrapper.querySelectorAll(".activity-row").forEach(activityRow => {
      const activityId = (activityRow as HTMLElement).dataset.activityId;
      const activity = item.system.activities?.get(activityId);
      if (!activity) return;

      injectActivityButtons(activityRow as HTMLElement, item, activity);
    });
  });

  // Attach event handlers
  attachMidiButtonHandlers(element, app);
}

/**
 * Inject info icon into the item row between the item icon and item name
 */
function injectInfoIcon(itemRow: HTMLElement, item: any) {
  // Check if already injected
  if (itemRow.querySelector(".midi-info-icon")) return;

  // Find the item-name element
  const itemName = itemRow.querySelector(".item-name");
  if (!itemName) return;

  // Add a small info icon after the item image, before the name
  const infoHtml = `<a class="midi-info-icon" data-midi-action="info" data-item-id="${item.id}" data-tooltip="${i18n("midi-qol.buttons.showChatInfo")}"><i class="fas fa-info-circle"></i></a>`;

  // Insert after the item-image, before name-stacked
  const itemImage = itemName.querySelector(".item-image");
  if (itemImage) {
    itemImage.insertAdjacentHTML("afterend", infoHtml);
  } else {
    // Fallback: prepend to item-name
    itemName.insertAdjacentHTML("afterbegin", infoHtml);
  }
}

/**
 * Inject activity-level buttons (Attack, Damage) into an activity row
 */
function injectActivityButtons(activityRow: HTMLElement, item: any, activity: any) {
  // Check if buttons already injected
  if (activityRow.querySelector(".midi-activity-buttons")) return;

  const buttons: string[] = [];
  const itemId = item.id;
  const activityId = activity.id;

  if (activity.hasAttack) {
    buttons.push(`
      <button type="button" data-midi-action="attack" data-item-id="${itemId}" data-activity-id="${activityId}"
              data-tooltip="${i18n("midi-qol.buttons.attack")}">
        <dnd5e-icon src="systems/dnd5e/icons/svg/activity/attack.svg"></dnd5e-icon>
      </button>
    `);
  }

  if (activity.hasDamage) {
    buttons.push(`
      <button type="button" data-midi-action="damage" data-item-id="${itemId}" data-activity-id="${activityId}"
              data-tooltip="${i18n("midi-qol.buttons.damage")}">
        <dnd5e-icon src="systems/dnd5e/icons/svg/activity/damage.svg"></dnd5e-icon>
      </button>
    `);

    // Add versatile button if item has versatile property (dnd5e getter)
    if (item.isVersatile) {
      buttons.push(`
        <button type="button" data-midi-action="versatile" data-item-id="${itemId}" data-activity-id="${activityId}"
                data-tooltip="${i18n("midi-qol.buttons.versatileDamage")}">
          <i class="fas fa-hand-fist"></i>
        </button>
      `);
    }
  }

  // Add use button if activity has a rollable formula
  if (activity.roll?.formula) {
    buttons.push(`
      <button type="button" data-midi-action="use" data-item-id="${itemId}" data-activity-id="${activityId}"
              data-tooltip="${i18n("midi-qol.buttons.itemUse")}">
        <dnd5e-icon src="systems/dnd5e/icons/svg/activity/utility.svg"></dnd5e-icon>
      </button>
    `);
  }

  if (buttons.length === 0) return;

  const buttonsHtml = `<div class="midi-activity-buttons">${buttons.join("")}</div>`;

  // Append to end of activity row (after columns)
  activityRow.insertAdjacentHTML("beforeend", buttonsHtml);
}


/**
 * Attach click handlers to all midi buttons
 */
function attachMidiButtonHandlers(html: HTMLElement, app: any) {
  // Only attach to buttons that don't already have handlers
  html.querySelectorAll("[data-midi-action]:not([data-midi-handled])").forEach(button => {
    button.setAttribute("data-midi-handled", "true");

    button.addEventListener("click", async (event: Event) => {
      event.preventDefault();
      event.stopPropagation();

      const btn = event.currentTarget as HTMLElement;
      const action = btn.dataset.midiAction;
      const itemId = btn.dataset.itemId;
      const activityId = btn.dataset.activityId;

      const actor = app.document ?? app.actor;
      const item = actor?.items?.get(itemId);
      if (!item) return;

      if (debugEnabled > 1) debug("midi sheet button handler", action, item.name, activityId);

      const activity = activityId ? item.system.activities?.get(activityId) : null;

      switch (action) {
        case "info":
          // Show item info card using dnd5e's displayCard
          await item.displayCard();
          break;

        case "attack":
          // Roll attack - respect midi auto fast forward and roll toggle settings
          if (activity?.rollAttack) {
            let configure = !isAutoFastAttack();
            if (areMidiKeysPressed(event as any, "RollToggle")) configure = !configure;
            await activity.rollAttack({ event }, { configure }, { create: true });
          }
          break;

        case "damage":
          // Roll damage - respect midi auto fast forward and roll toggle settings
          if (activity?.rollDamage) {
            let configure = !isAutoFastDamage();
            if (areMidiKeysPressed(event as any, "RollToggle")) configure = !configure;
            await activity.rollDamage({ event, versatile: false }, { configure }, { create: true });
          }
          break;

        case "versatile":
          // Roll versatile damage - respect midi auto fast forward and roll toggle settings
          if (activity?.rollDamage) {
            let configure = !isAutoFastDamage();
            if (areMidiKeysPressed(event as any, "RollToggle")) configure = !configure;
            await activity.rollDamage({ event, versatile: true }, { configure }, { create: true });
          }
          break;

        case "use":
          // Use the activity (triggers full workflow including formula roll)
          if (activity?.use) {
            await activity.use({ event }, {}, {});
          }
          break;
      }
    });
  });
}
