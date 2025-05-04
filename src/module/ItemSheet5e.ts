import { geti18nOptions, i18n } from "../midi-qol.js";
import { Workflow } from "./Workflow.js";
import { getCurrentSourceMacros } from "./apps/Item.js";
import { configSettings } from "./settings.js";

export var MidiItemSheet5e;

export function setupMidiItemSheet5e() {
  const baseClass = globalThis.dnd5e.applications.item.ItemSheet5e;
  MidiItemSheet5e = defineMidiItemSheet5eClass(baseClass);

  /*
  DocumentSheetConfig.registerSheet(Item, "dnd5e", MidiItemSheet5e, {
    makeDefault: false,
    label: "midi-qol.ItemSheetMidiTab",
    types: ["spell", "feat", "weapon", "consumable", "equipment", "power", "maneuver"],
  });
  */
}

let defineMidiItemSheet5eClass = (baseClass: any) => {
  return class MidiAttackActivitySheet extends baseClass {
    static PARTS = {
      ...super.PARTS,
      "midi-qol": {
        template: "modules/midi-qol/templates/midiPropertiesFormDefault.hbs",
        scrollable: [""]
      }
    }
    static TABS = [
      ...super.TABS,
      {
        tab: "midi-qol",
        label: "midi-qol.ItemSheetMidiTab",
        name: "midi",
        icon: "fas fa-dice-d20",
        condition: () => true, // function () { return ["spell", "feat", "weapon", "consumable", "equipment", "power", "maneuver"].includes(this.item?.type) }.bind(this),
        template: "modules/midi-qol/templates/midiPropertiesFormDefault.hbs",
      }
    ];
    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      //@ts-expect-error
      const config = game.system.config as any;
      const RemoveAttackDamageButtonsOptions = foundry.utils.mergeObject({ "default": i18n("midi-qol.MidiSettings") }, geti18nOptions("removeButtonsOptions"));

      if (partId === "midi-qol") {
        console.error("MidiItemSheet5e._preparePartContext", partId, context, options);
        context = foundry.utils.mergeObject(context, {
          allowUseMacro: configSettings.allowUseMacro,
          MacroPassOptions: Workflow.allMacroPasses,
          showCEOff: false,
          showCEOn: false,
          hasOtherDamage: true, // TODO fix this for activities 
          showHeader: !configSettings.midiFieldsTab,
          midiPropertyLabels: config.midiProperties,
          ConfirmTargetOptions: geti18nOptions("ConfirmTargetOptions"), // this is used for attack per target
          // AutoTargetOptions: autoTargetOptions,
          RemoveAttackDamageButtonsOptions,
          hasReaction: true, // can't test the item since any of the activities might be a reaction item.system.activation?.type?.includes("reaction"),
          onUseMacroParts: getCurrentSourceMacros(context.item),
          isGM: game.user?.isGM,
          isOwner: this.item.isOwner,
          flags: foundry.utils.deepClone(context.item.flags)
        })
      }
      return context;
    }
  }
}
