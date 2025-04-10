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
