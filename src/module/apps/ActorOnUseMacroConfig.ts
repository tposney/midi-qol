import { AnyObject } from "fvtt-types/utils";
import { geti18nOptions, i18n } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { getCurrentMacros, getCurrentSourceMacros, OnUseMacro, OnUseMacros } from "./Item.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ActorOnUseMacrosConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  document: Actor.Implementation
  constructor(options) {
    super(options);
    this.document = options.document;
  }

  // old "form" "active-effect-sheet" "sheet"
  static override PARTS = {
    dialog: {
      id: "dialog-onuse-config",
      classes: ["dialog", "active-effect-sheet", "midi-qol"],
      template: "modules/midi-qol/templates/actorOnUseMacrosConfig.hbs"
    }
  }

  // TODO: dragDrop? dropSelector .key
  static override DEFAULT_OPTIONS = {
    window: {
      resizable: false,
      title: "midi-qol.ActorOnUseMacros"
    },
    position: {
      height: "auto" as "auto",
      width: 550
    },
    form: {
      closeOnSubmit: false,
      submitOnClose: true
    }
  };

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.isEditable) {
      for (const control of Array.from(this.element.querySelectorAll(".macro-control"))) {
        control.addEventListener("click", this.onMacroControl.bind(this));
      }
    }
  }

  get isEditable() {
    if ( this.document.pack ) {
      const pack = game.packs?.get(this.document.pack);
      if ( pack?.locked ) return false;
    }
    return this.document.testUserPermission(game.user as User, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  }

  async _prepareContext(options) {
    let context: any = await super._prepareContext(options);
    context.onUseMacroName = foundry.utils.getProperty(this.document._source, "flags.midi-qol.onUseMacroName");
    if (context.onUseMacroName !== undefined) context.onUseMacroParts = new OnUseMacros(context.onUseMacroName);
    else context.onUseMacroParts = new OnUseMacros(null);
    context.MacroPassOptions = foundry.utils.mergeObject(geti18nOptions("onUseMacroOptions"), Workflow.stateHooks);
    return context;
  }

  _onDragStart(ev) {}

  _onDrop(ev) {
    ev.preventDefault();
    const data: any = TextEditor.getDragEventData(ev);
    if (data.uuid) ev.target.value += data.uuid;
  }
  
  async onMacroControl(event?){
    event?.preventDefault();
    const a = event?.currentTarget;
    const macros = getCurrentSourceMacros(this.document);
    //@ts-expect-error
    const formMacros = Object.entries(new foundry.applications.ux.FormDataExtended(this.element.querySelector("form") as HTMLFormElement)?.object) ?? [];
    for (const [k, v] of formMacros) {
      foundry.utils.setProperty(macros, k.split('.').slice(1).join('.'), v);
    }
    
    if ( a?.classList.contains("add-macro") ) {
      // Add new macro component
      macros.items.push(new OnUseMacro(""));
    } else  if ( a?.classList.contains("delete-macro") ) {
      // Remove a macro component
      const li = a.closest(".macro-change");
      macros.items.splice(Number(li.dataset.macropart), 1);
    }
    // @ts-expect-error can't know about flags
    await this.document.update({"flags.midi-qol.onUseMacroName": macros.toString()});
    if (event) this.render({force: true});
  }

  async _preClose(options) {
    await this.onMacroControl();
    return;
  }
}