import { itemDeleteCheck, itemRollButtons } from "./settings.js";
import { i18n, debug, log, warn, debugEnabled } from "../midi-qol.js";
import { showItemInfo } from "./itemhandling.js";
import { itemHasDamage, itemIsVersatile } from "./utils.js";


const knownSheets = {
  BetterNPCActor5eSheet: ".item .rollable",
  ActorSheet5eCharacter: ".item .item-image",
  BetterNPCActor5eSheetDark: ".item .rollable",
  ActorSheet5eCharacterDark: ".item .item-image",
  DarkSheet: ".item .item-image",
  ActorNPC5EDark: ".item .item-image",
  DynamicActorSheet5e: ".item .item-image",
  ActorSheet5eNPC: ".item .item-image",
  DNDBeyondCharacterSheet5e: ".item .item-name .item-image",
  Tidy5eSheet: ".item .item-image",
  Tidy5eNPC: ".item .item-image",
  MonsterBlock5e: ".item .item-name",
  "sw5e.ActorSheet5eNPC": ".item .item-name"
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
    if (["Tidy5eSheet", "Tidy5eNPC"].includes(app.constructor.name)) {
      if (game.modules.get("tidy5e-sheet")?.active &&
        isNewerVersion(game.modules.get("tidy5e-sheet")?.data.version ?? "", "0.4.0") &&
        game.settings.get("tidy5e-sheet", "contextRollButtons")) {
        addTidy5eItemSheetButtons(app, html, data);
      } else {
        addItemSheetButtons(app, html, data);
      }
    } else {
      addItemSheetButtons(app, html, data);
    }
  return true;
};
let itemDeleteHandler = ev => {
  let actor = game.actors?.get(ev.data.data.actor._id);
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
          ev.data.app.object.items.get(itemId).delete();
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
  let alreadyExpandedElement;
  if (triggeringElement === "")
    triggeringElement = ".item .item-name";
  if (["BetterNPCActor5eSheet", "BetterNPCActor5eSheetDark"].includes(app.constructor.name)) {
    triggeringElement = ".item .npc-item-name";
    buttonContainer = ".item-properties";
    alreadyExpandedElement = ".item.expanded .npc-item-name";//CHANGE
  }
  if (buttonContainer === "")
    buttonContainer = ".item-properties";
  // adding an event for when the description is shown
  html.find(triggeringElement).click(event => {//CHANGE
    addItemRowButton(event.currentTarget, app, html, data, buttonContainer);
  });
  if (alreadyExpandedElement) {
    html.find(alreadyExpandedElement).get().forEach(el => {
      addItemRowButton(el, app, html, data, buttonContainer);
    });
  }
}

function addItemRowButton(target, app, html, data, buttonContainer) {
  let li = $(target).parents(".item");
  if (!li.hasClass("expanded"))
    return;
  let item = app.object.items.get(li.attr("data-item-id"));
  if (!item)
    return;
  let actor = app.object;
  let chatData = item.getChatData();
  let targetHTML = $(target.parentNode.parentNode);
  let buttonTarget = targetHTML.find(".item-buttons");
  if (buttonTarget.length > 0)
    return; // already added buttons
  let buttonsWereAdded = false;
  // Create the buttons
  let buttons = $(`<div class="item-buttons"></div>`);
  switch (item.data.type) {
    case "weapon":
    case "spell":
    case "power":
    case "feat":
      buttons.append(`<span class="tag"><button data-action="basicRoll">${i18n("midi-qol.buttons.roll")}</button></span>`);
      if (item.hasAttack)
        buttons.append(`<span class="tag"><button data-action="attack">${i18n("midi-qol.buttons.attack")}</button></span>`);
      if (item.hasDamage)
        buttons.append(`<span class="tag"><button data-action="damage">${i18n("midi-qol.buttons.damage")}</button></span>`);
      if (itemIsVersatile(item))
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
  if (buttonsWereAdded) {
    buttons.append(`<br><header style="margin-top:6px"></header>`);
    // adding the buttons to the sheet
    targetHTML.find(buttonContainer).prepend(buttons);
    buttons.find("button").click({ app, data, html }, async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (debugEnabled > 1) debug("roll handler ", ev.target.dataset.action);
      let event = { shiftKey: ev.shiftKey == true, ctrlKey: ev.ctrlKey === true, metaKey: ev.metaKey === true, altKey: ev.altKey === true };
      // If speed rolls are off
      switch (ev.target.dataset.action) {
        case "attack":
          await item.rollAttack({ event, versatile: false, resetAdvantage: true });
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
          item.roll({ configureDialog: true, showFullCard: true, event });
          break;
        case "info":
          await showItemInfo.bind(item)();
      }
    })
  }
}
/*
function addItemRowButton(target, app, html, data, buttonContainer) {
/** Existing contents of the click handler except I replaced all references to
the event.currentTarget/event.target with the target variable **/
/*
function addItemSheetButtons(app, html, data, triggeringElement = "", buttonContainer = "") {
  // Setting default element selectors
  if (triggeringElement === "")
      triggeringElement = ".item .item-name";
  if (["BetterNPCActor5eSheet", "BetterNPCActor5eSheetDark"].includes(app.constructor.name)) {
      triggeringElement = ".item .npc-item-name";
      buttonContainer = ".item-properties";
  }
  if (buttonContainer === "")
      buttonContainer = ".item-properties";
  // adding an event for when the description is shown
  html.find(triggeringElement).click(event => {
      let li = $(event.currentTarget).parents(".item");
      if (!li.hasClass("expanded"))
          return;
      let item = app.object.items.get(li.attr("data-item-id"));
      if (!item)
          return;
      let actor = app.object;
      let chatData = item.getChatData();
      let targetHTML = $(event.target.parentNode.parentNode);
      let buttonTarget = targetHTML.find(".item-buttons");
      if (buttonTarget.length > 0)
          return; // already added buttons
      let buttonsWereAdded = false;
      // Create the buttons
      let buttons = $(`<div class="item-buttons"></div>`);
      switch (item.data.type) {
          case "weapon":
          case "spell":
          case "power":
          case "feat":
              buttons.append(`<span class="tag"><button data-action="basicRoll">${i18n("midi-qol.buttons.roll")}</button></span>`);
              if (item.hasAttack)
                  buttons.append(`<span class="tag"><button data-action="attack">${i18n("midi-qol.buttons.attack")}</button></span>`);
              if (item.hasDamage)
                  buttons.append(`<span class="tag"><button data-action="damage">${i18n("midi-qol.buttons.damage")}</button></span>`);
              if (itemIsVersatile(item))
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
      if (buttonsWereAdded) {
          buttons.append(`<br><header style="margin-top:6px"></header>`);
          // adding the buttons to the sheet
          targetHTML.find(buttonContainer).prepend(buttons);
          buttons.find("button").click({ app, data, html }, async (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              if (debugEnabled > 1) debug("roll handler ", ev.target.dataset.action);
              let event = { shiftKey: ev.shiftKey == true, ctrlKey: ev.ctrlKey === true, metaKey: ev.metaKey === true, altKey: ev.altKey === true};
              // If speed rolls are off
              switch (ev.target.dataset.action) {
                  case "attack":
                      await item.rollAttack({ event, versatile: false, resetAdvantage: true});
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
                      item.roll({configureDialog: true, showFullCard: true, event});
                      break;
                  case "info":
                      await showItemInfo.bind(item)();
              }
          });
      }
  });
}
*/
function addTidy5eItemSheetButtons(app, html, data) {
  let actor = app.object;

  $('.tidy5e-sheet .inventory-list:not(favorites) .item').each(function () {

    let buttonContainer;
    if (isNewerVersion(game.modules.get("tidy5e-sheet")?.data.version ?? "", "0.4.17"))
      buttonContainer = $(this).find(".mod-roll-buttons");
    else
      buttonContainer = $(this).find(".item-controls");
    // adding an event for when the description is shown
    let item = app.object.items.get($(this).attr("data-item-id"));
    if (!item)
      return;
    let chatData = item.getChatData();
    let buttonTarget = buttonContainer.find(".item-buttons");
    if (buttonTarget.length > 0)
      return; // already added buttons
    let buttonsWereAdded = false;
    // Create the buttons
    let buttons = $(`<div class="item-buttons"></div>`);
    switch (item.data.type) {
      case "weapon":
      case "spell":
      case "power":
      case "feat":
        buttons.append(`<a class="button" data-action="basicRoll" title="${i18n("midi-qol.buttons.roll")}"><i class="fas fa-comment-alt"></i> ${i18n("midi-qol.buttons.roll")}</a>`);
        if (item.hasAttack)
          buttons.append(`<a class="button" data-action="attack" title="Roll standard/advantage/disadvantage ${i18n("midi-qol.buttons.attack")}"><i class="fas fa-dice-d20"></i> ${i18n("midi-qol.buttons.attack")}</a>`);
        if (itemHasDamage(item))
          buttons.append(`<a class="button" data-action="damage" title="Roll ${i18n("midi-qol.buttons.damage")}"><i class="fas fa-dice-six"></i> ${i18n("midi-qol.buttons.damage")}</a>`);
        if (itemIsVersatile(item))
          buttons.append(`<a class="button" data-action="versatileDamage" title="Roll ${i18n("midi-qol.buttons.versatileDamage")}"><i class="fas fa-dice-six"></i> ${i18n("midi-qol.buttons.versatileDamage")}</a>`);
        buttonsWereAdded = true;
        break;
      case "consumable":
        if (chatData.hasCharges)
          buttons.append(`<a class="button" data-action="consume" title="${i18n("midi-qol.buttons.itemUse")} ${item.name}"><i class="fas fa-wine-bottle"></i> ${i18n("midi-qol.buttons.itemUse")} ${item.name}</a>`);
        buttonsWereAdded = true;
        break;
      case "tool":
        buttons.append(`<a class="button" data-action="toolCheck" data-ability="${chatData.ability.value}" title="${i18n("midi-qol.buttons.itemUse")} ${item.name}"><i class="fas fa-hammer"></i>  ${i18n("midi-qol.buttons.itemUse")} ${item.name}</a>`);
        buttonsWereAdded = true;
        break;
    }
    buttons.append(`<a class="button" data-action="info" title="${i18n("midi-qol.buttons.info")}"><i class="fas fa-info-circle"></i> ${i18n("midi-qol.buttons.info")}</a>`);
    buttonsWereAdded = true;
    if (buttonsWereAdded) {
      // adding the buttons to the sheet
      buttonContainer.prepend(buttons);
      buttons.find(".button").click({ app, data, html }, async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (debugEnabled > 1) debug("roll handler ", ev.target.dataset.action);
        let event = { shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, altKey: ev.altKey };
        // If speed rolls are off
        switch (ev.target.dataset.action) {
          case "attack":
            await item.rollAttack({ event, versatile: false });
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
            await item.roll({ showFullCard: true, event });
            break;
          case "info":
            await showItemInfo.bind(item)();
        }
      });
    }
  });
}
