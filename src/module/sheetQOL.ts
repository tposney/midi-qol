import { itemDeleteCheck, itemRollButtons } from "./settings";
import { i18n, debug, log, warn } from "../midi-qol";
import { Workflow, noKeySet, shiftOnlyEvent } from "./workflow";


let knownSheets = {
  BetterNPCActor5eSheet: ".item .rollable",
  ActorSheet5eCharacter: ".item .item-image",
  BetterNPCActor5eSheetDark: ".item .rollable",
  ActorSheet5eCharacterDark: ".item .item-image",
  DarkSheet: ".item .item-image",
  ActorNPC5EDark: ".item .item-image",
  DynamicActorSheet5e: ".item .item-image",
  ActorSheet5eNPC: ".item .item-image",
  DNDBeyondCharacterSheet5e: ".item .item-name .item-image",
  Tidy5eSheet:  ".item .item-image",
  Tidy5eNPC: ".item .item-image",
  MonsterBlock5e: ".item .item-name"

//  Sky5eSheet: ".item .item-image",
};

export function setupSheetQol() {
  for (let sheetName of Object.keys(knownSheets)) {
    Hooks.on("render" + sheetName, enableSheetQOL);
  }
  Hooks.on("renderedAlt5eSheet", enableSheetQOL);
  Hooks.on("renderedTidy5eSheet", enableSheetQOL);
}

let enableSheetQOL = (app, html, data) => {
  // find out how to reinstate the original handler later.
  const defaultTag = ".item .item-image";
  //Add a check for item deletion
  if (itemDeleteCheck) {
      // remove current handler - this is a bit clunky since it results in a case with no delete handler
      $(html).find(".item-delete").off("click");
      $(html).find(".item-delete").click({ app, data: data }, itemDeleteHandler);
  }

  let rollTag = knownSheets[app.constructor.name] ? knownSheets[app.constructor.name] : defaultTag;

  if (itemRollButtons)
      addItemSheetButtons(app, html, data);
  return true;
};

let itemDeleteHandler = ev => {
  let actor = game.actors.get(ev.data.data.actor._id);
  let d = new Dialog({
      // localize this text
      title: i18n("midi-qol.reallyDelete"),
      content: `<p>${i18n("midi-qol.sure")}</p>`,
      buttons: {
          one: {
              icon: '<i class="fas fa-check"></i>',
              label: "Delete",
              callback: () => {
                  let li = $(ev.currentTarget).parents(".item"), itemId = li.attr("data-item-id");
                  ev.data.app.object.deleteOwnedItem(itemId);
                  li.slideUp(200, () => ev.data.app.render(false));
              }
          },
          two: {
              icon: '<i class="fas fa-times"></i>',
              label: "Cancel",
              callback: () => { }
          }
      },
      default: "two"
  });
  d.render(true);
};

function addItemSheetButtons(app, html, data, triggeringElement = "", buttonContainer = "") {
  // Setting default element selectors
  if (triggeringElement === "")
      triggeringElement = ".item .item-name";

      if (["BetterNPCActor5eSheet", "BetterNPCActor5eSheetDark"].includes(app.constructor.name)) {
    triggeringElement = ".item .npc-item-name"
    buttonContainer = ".item-properties"
  }
  if (buttonContainer === "")
      buttonContainer = ".item-properties";

  // adding an event for when the description is shown
  html.find(triggeringElement).click(event => {
      let li = $(event.currentTarget).parents(".item");
      if (!li.hasClass("expanded")) return; 
      let item = app.object.getOwnedItem(li.attr("data-item-id"));
      if (!item) return;
      let actor = app.object;
      let chatData = item.getChatData();
      let targetHTML = $(event.target.parentNode.parentNode);
      let buttonTarget = targetHTML.find(".item-buttons");
      if (buttonTarget.length > 0) return; // already added buttons
      let buttonsWereAdded = false;
      // Create the buttons
      let buttons = $(`<div class="item-buttons"></div>`);
      switch (item.data.type) {
          case "weapon":
          case "spell":
          case "feat":
              buttons.append(`<span class="tag"><button data-action="basicRoll">${i18n("midi-qol.buttons.roll")}</button></span>`);
              if (item.hasAttack)
                  buttons.append(`<span class="tag"><button data-action="attack">${i18n("midi-qol.buttons.attack")}</button></span>`);
              if (item.hasDamage)
                  buttons.append(`<span class="tag"><button data-action="damage">${i18n("midi-qol.buttons.damage")}</button></span>`);
              if (item.isVersatile) 
                  buttons.append(`<span class="tag"><button data-action="versatileAttack">${i18n("midi-qol.buttons.versatileAttack")}</button></span>`);
              if (item.isVersatile) 
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
      if (buttonsWereAdded) {
          buttons.append(`<br><header style="margin-top:6px"></header>`);
          // adding the buttons to the sheet

          targetHTML.find(buttonContainer).prepend(buttons);
          buttons.find("button").click({app, data, html}, async (ev) =>  {
              ev.preventDefault();
              ev.stopPropagation();
              debug("roll handler ", ev.target.dataset.action);
              let event = {shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altKey: ev.altKey};
              // If speed rolls are off
              switch (ev.target.dataset.action) {
                  case "attack":
                    console.warn("Inside roll attack button ", event)
                      await item.rollAttack({ event, versatile: false });
                      break;
                  case "versatileAttack":
                      await item.rollAttack({ event, versatile: true });
                      break;
                  case "damage":
                      await item.rollDamage({ event, versatile: false });
                      break;
                  case "versatileDamage":
                      await item.rollDamage({ event, versatile: true });
                      break;
                  case "consume":
                      await item.roll({ event });
                      break;
                  case "toolCheck":
                      await item.rollToolCheck({ event });
                      break;
                  case "basicRoll":
                      if (item.type === "spell") {
                        await actor.useSpell(item, { configureDialog: true , showFullCard: true});
                      }
                      else
                          await item.roll({showFullCard: true, event});
                      break;
              }
          });
      }
  });
}
