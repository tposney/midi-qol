import { configSettings, itemRollButtons } from "./settings.js";
import { i18n, debug, log, warn, debugEnabled } from "../midi-qol.js";
import { itemHasDamage } from "./utils.js";
import { ActorOnUseMacrosConfig } from "./apps/ActorOnUseMacroConfig.js";
import { Workflow } from "./Workflow.js";
import { showItemInfo } from "./activities/activityHelpers.js";


const knownSheets = {
  BetterNPCActor5eSheet: ".item .rollable",
  ActorSheet5eCharacter: ".item-list .item-name",
  BetterNPCActor5eSheetDark: ".item .rollable",
  ActorSheet5eCharacter2: ".item .item-image",
  ActorSheet5eCharacterDark: ".item .item-image",
  DarkSheet: ".item .item-image",
  ActorNPC5EDark: ".item .item-image",
  DynamicActorSheet5e: ".item .item-image",
  ActorSheet5eNPC: ".item .item-image",
  DNDBeyondCharacterSheet5e: ".item .item-name .item-image",
  // Tidy5eSheet: ".item .item-image",
  // Tidy5eNPC: ".item .item-image",
  MonsterBlock5e: ".item .item-name",
  "sw5e.ActorSheet5eNPC": ".item .item-name"
  //  Sky5eSheet: ".item .item-image",
};
export function setupSheetQol() {
  for (let sheetName of Object.keys(knownSheets)) {
    Hooks.on("render" + sheetName, enableSheetQOL);
  }
  // Hooks.on("renderedAlt5eSheet", enableSheetQOL);
  // Hooks.on("renderedTidy5eSheet", enableSheetQOL);
}
let enableSheetQOL = (app, html, data) => {
  if (["Tidy5eSheet", "Tidy5eNPC"].includes(app.constructor.name)) {
  } else {
    // WIP addItemSheetButtons(app, html, data);
  }

  if (configSettings.allowActorUseMacro) {
    // Add actor macros
    if (html.find(".midiqol-onuse-macros").length === 0) {
      html.find('.config-button[data-action="senses').parent().parent().parent().append(`<div>
      <label>${i18n("midi-qol.ActorOnUseMacros")}</label>
      <a class="config-button midiqol-onuse-macros" data-action="midi-onuse-macros" title="midi onuse macros">
        <i class="fas fa-cog"></i>
      </a>
      </div>`);
      html.find(".midiqol-onuse-macros").click(ev => {
        new ActorOnUseMacrosConfig({document: app.object}).render({force: true});
      });
    }
  }
  return true;
};

function addItemSheetButtons(app, html, data, triggeringElement = "", buttonContainer = "") {
  // Setting default element selectors
  let alreadyExpandedElement = ".item.expanded";
  if (triggeringElement === "")
    triggeringElement = ".item .collapsible";
  if (buttonContainer === "")
    buttonContainer = ".wrapper .item-summary";
  html[0].querySelectorAll(triggeringElement)?.forEach((element) => {
      addItemRowButtonForTarget(app, data, element, buttonContainer);
  });
}

function addItemRowButtonForTarget(app, data, element, buttonContainer: string) {
  let item = app.object.items.get(element.dataset.itemId);
  addItemRowButton(element, item, app, data, element, buttonContainer);
}

function addItemRowButton(target, item, app, data, html, buttonContainer) {
  // let li = $(target).parents(".item");
  // let item = app.object.items.get(target.attr("data-item-id"));
  if (!item)
    return;
  let actor = app.object;
  item.getChatData().then(chatData => {
    let targetHTML = $(target);
    let buttonTarget = html.find(buttonContainer);
    if (buttonTarget.length > 0)
      return; // already added buttons
    let buttonsWereAdded = false;
    // Create the buttons
    let buttons = $(`<div class="item-buttons"></div>`);
    switch (item.type) {
      case "weapon":
      case "spell":
      case "power":
      case "feat":
        buttons.append(`<span class="tag"><button data-action="basicRoll">${i18n("midi-qol.buttons.roll")}</button></span>`);
        if (item.hasAttack)
          buttons.append(`<span class="tag"><button data-action="attack">${i18n("midi-qol.buttons.attack")}</button></span>`);
        if (item.hasDamage)
          buttons.append(`<span class="tag"><button data-action="damage">${i18n("midi-qol.buttons.damage")}</button></span>`);
        if (item.system.properties?.has("ver"))
          buttons.append(`<span class="tag"><button data-action="versatileDamage">${i18n("midi-qol.buttons.versatileDamage")}</button></span>`);
        buttonsWereAdded = true;
        break;
      case "consumable":
        if (chatData.hasCharges)
          buttons.append(`<span class="tag"><button data-action="consume">${i18n("midi-qol.buttons.itemUse")} ${item.name}</button></span>`);
        buttonsWereAdded = true;
        break;
      case "tool":
        buttons.append(`<span class="tag"><button data-action="toolCheck" data-ability="${chatData.ability.value}">${i18n("midi-qol.buttons.itemUse")} ${item.name}</button></span>`);
        buttonsWereAdded = true;
        break;
    }
    buttons.append(`<span class="tag"><button data-action="info">${i18n("midi-qol.buttons.info")}</button></span>`);
    buttonsWereAdded = true;
    buttons.append(`<br><header style="margin-top:6px"></header>`);
    if (buttonsWereAdded) {
      // adding the buttons to the sheet
      targetHTML.find(buttonContainer).prepend(buttons);
      buttons.find("button").click({ app, data, html }, async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (debugEnabled > 1) debug("roll handler ", ev.target.dataset.action);
        // let event = { shiftKey: ev.shiftKey == true, ctrlKey: ev.ctrlKey === true, metaKey: ev.metaKey === true, altKey: ev.altKey === true };
        // If speed rolls are off
        switch (ev.target.dataset.action) {
          case "attack":
            await item.rollAttack({ event: ev, versatile: false, resetAdvantage: true, systemCard: true });
            break;
          case "damage":
            await item.rollDamage({ event: ev, versatile: false, systemCard: true });
            break;
          case "versatileDamage":
            await item.rollDamage({ event: ev, versatile: true, systemCard: true });
            break;
          case "consume":
            await item.use({ event: ev, systemCard: true }, {});
            break;
          case "toolCheck":
            await item.rollToolCheck({ event: ev, systemCard: true });
            break;
          case "basicRoll":
            Workflow.removeWorkflow(item.uuid);
            item.use({}, { event: ev, configureDialog: true, systemCard: true });
            break;
          case "info":
            await showItemInfo.bind(item)();
        }
      })
    }
  });
}
