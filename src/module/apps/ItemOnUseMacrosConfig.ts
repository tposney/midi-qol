import { i18n } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { OnUseMacro, OnUseMacros } from "./Item.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api

export class ItemOnUseMacrosConfig extends HandlebarsApplicationMixin(DocumentSheetV2<Item>) {
  static override PARTS = {
    form: {
      id: "item-on-use-config",
      classes: ["midi-qol", "item-on-use-sheet", "standard-form"],
      template: "modules/midi-qol/templates/itemOnUseMacrosConfig.hbs"
    }
  };

  static override DEFAULT_OPTIONS = {
    form: {
      handler: this.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    position: {
      width: 600
    },
    tag: "form",
    actions: {
      addMacro: this.#onAddMacro,
      deleteMacro: this.#onDeleteMacro,
      editMacro: this.#onEditMacro
    }
  }

  /*
  New way to store on use macros, maybe:
  flags.midi-qol.onUseMacros: [
    {
      macro: "ItemMacro" or "ActivityMacro-ActivityId" or "Custom"
      customMacro: "Some Macro" or nullish
      macroPass: "the selected one of above"
    }
  ]
  */

  override async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // @ts-expect-error no dnd5e-types
    const activityMacros = this.document.system.activities.reduce((acc, activity) => ({
      ...acc,
      [`ActivityMacro-${activity.id}`]: `${activity.name} DIME`
    }), {});
    const macros = {
      ItemMacro: `${i18n("DOCUMENT.Item")} DIME`,
      ...activityMacros,
      Custom: i18n("midi-qol.CustomMacro")
    }
    const onUseMacros = (foundry.utils.getProperty(this.document, "flags.midi-qol.onUseMacroParts") as OnUseMacros)?.items ?? [];
    for (const currMacro of onUseMacros) {
      if (currMacro.macroName.startsWith("ActivityMacro-")) {
        currMacro.macro = currMacro.macroName;
        const activityId = currMacro.macroName.split("-").slice(1).join("-");
        // @ts-expect-error no dnd5e-types
        const activityType = this.document.system.activities.get(activityId)?.type;
        // TODO: dynamically populate based on activity type
        currMacro.macroPassOptions = Workflow.allMacroPasses;
      } else {
        currMacro.macroPassOptions = Workflow.allMacroPasses;
        if (currMacro.macroName === "ItemMacro") currMacro.macro = currMacro.macroName;
        else currMacro.macro = "Custom";
      }
    }
    foundry.utils.mergeObject(context, {
      onUseMacros,
      macros
    });
    return context;
  }

  static #onSubmit(
    this: ItemOnUseMacrosConfig,
    _event: Event | SubmitEvent,
    _form: HTMLFormElement,
    formData: FormDataExtended
  ) {
    const expandedData = foundry.utils.expandObject(formData.object);
    // @ts-expect-error can't know about flags
    if (!expandedData) return void this.document.update({ "flags.midi-qol.onUseMacroName": "" });
    // @ts-expect-error can't know about form data
    const onUseMacros = Object.values(expandedData.onUseMacros);
    // @ts-expect-error untyped i
    onUseMacros.forEach(i => i.macroName ??= i.macro);
    const newOnUseMacros = OnUseMacros.parseParts({ items: onUseMacros });
    // @ts-expect-error can't know about flags
    this.document.update({ "flags.midi-qol.onUseMacroName": newOnUseMacros.toString() });
  }

  static #onAddMacro(
    this: ItemOnUseMacrosConfig,
    _event: PointerEvent,
    _target: HTMLElement
  ) {
    const currOnUseMacros = foundry.utils.getProperty(this.document, "flags.midi-qol.onUseMacroParts") as OnUseMacros ?? new OnUseMacros();
    currOnUseMacros.items.push(new OnUseMacro());
    // @ts-expect-error can't know about flags
    this.document.update({ "flags.midi-qol.onUseMacroName": currOnUseMacros.toString() });
  }

  static #onDeleteMacro(
    this: ItemOnUseMacrosConfig,
    _event: PointerEvent,
    target: HTMLElement
  ) {
    const currOnUseMacros = (foundry.utils.getProperty(this.document, "flags.midi-qol.onUseMacroParts") as OnUseMacros)?.items ?? [];
    const macroIndex = target.closest<HTMLDivElement>("[data-macro-index]")?.dataset.macroIndex;
    if (macroIndex === undefined) return;
    const newOnUseMacros = OnUseMacros.parseParts({ items: currOnUseMacros.toSpliced(Number(macroIndex), 1) });
    // @ts-expect-error can't know about flags
    this.document.update({ "flags.midi-qol.onUseMacroName": newOnUseMacros.toString() });
  }

  static #onEditMacro(
    this: ItemOnUseMacrosConfig,
    _event: PointerEvent,
    target: HTMLElement
  ) {
    const macroIndex = target.closest<HTMLDivElement>("[data-macro-index]")?.dataset.macroIndex;
    if (macroIndex === undefined) return;
    const currOnUse = (foundry.utils.getProperty(this.document, "flags.midi-qol.onUseMacroParts") as OnUseMacros)?.items?.[macroIndex];
    if (!currOnUse) return;
    const DIMEditor = globalThis.DAE?.DIMEditor;
    if (!DIMEditor) return ui.notifications?.error("DIMEditor not available - install Dynamic Active Effects");
    if (currOnUse.macroName === "ItemMacro") {
      return new DIMEditor({ document: this.document }).render({ force: true });
    } else {
      const activityId = currOnUse.macroName.split("-").slice(1).join("-");
      // @ts-expect-error no dnd5e-types
      const activity = this.document.system.activities.get(activityId);
      if (activity) return new DIMEditor({ document: activity }).render({ force: true });
    }
  }
}