import { geti18nOptions, i18n } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { getCurrentMacros, getCurrentSourceMacros, OnUseMacros } from "./Item.js";

export class ActorOnUseMacrosConfig extends FormApplication {
  // @ts-expect-error will be replaced in v2 anyway
  object: any;
  constructor(object, options) {
    super(object, options);
  }

  static get defaultOptions() {
    const height: number | "auto" | undefined = "auto"
	  return foundry.utils.mergeObject(super.defaultOptions, {
	    template: "modules/midi-qol/templates/actorOnUseMacrosConfig.html",
      classes: ["form", "active-effect-sheet","sheet"],
      width: 550,
      height,
      title: i18n("midi-qol.ActorOnUseMacros") ?? "Actor On Use Macros",
      closeOnSubmit: false,
      submitOnClose: true,
      resizable: false,
      jQuery: true,
      dragDrop: [{dropSelector: ".key"}]
    });
  }

  async getData(options) {
    let data: any = await super.getData(options);
    data.onUseMacroName = foundry.utils.getProperty(this.object._source, "flags.midi-qol.onUseMacroName");
    if (data.onUseMacroName !== undefined) data.onUseMacroParts = new OnUseMacros(data.onUseMacroName);
    else data.onUseMacroParts = new OnUseMacros(null);
    data.MacroPassOptions = foundry.utils.mergeObject(geti18nOptions("onUseMacroOptions"), Workflow.stateHooks);
    return data;
  }

  async _updateObject(event, data) {
    await this.object.setFlag("midi-qol", "onUseMacroParts", data.onUseMacroParts);
    // don't need to update onUseMacroName since the preUpdate hook will do this
    this.render();
  }

  // @ts-expect-error will be replaced in v2 anyway
  _getSubmitData(updateData={}) {

    //@ts-ignore
    const fd = new FormDataExtended(this.form, {editors: this.editors});
    //@ts-ignore .object v10
    let data = foundry.utils.expandObject(fd.object);
    if ( updateData ) foundry.utils.mergeObject(data, updateData);
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (this.isEditable) {
      html.find(".macro-control").click(this.onMacroControl.bind(this));    
      // html.find(".key").onDrop = ev => this._onDrop(ev);
    }
  }

  _onDragStart(ev) {}

  _onDrop(ev) {
    ev.preventDefault();
    //@ts-ignore
    const data: any = TextEditor.getDragEventData(ev);
    if (data.uuid) ev.target.value += data.uuid;
  }
  
  async onMacroControl(event){
    event.preventDefault();
    const a = event.currentTarget;
  
    // Add new macro component
    if ( a.classList.contains("add-macro") ) {
      const macros = getCurrentSourceMacros(this.object);
      const index = macros.items.length;
      await this._onSubmit(event);  // Submit any unsaved changes
      const updateData =  {};
      updateData[`onUseMacroParts.items.${index}`] = {macroName: "",  option: "postActiveEffects"};
      return this.submit({preventClose: true, updateData})?.then(() => this.render(true));
    }
  
    // Remove a macro component
    if ( a.classList.contains("delete-macro") ) {
      const li = a.closest(".macro-change");
      const macros = getCurrentSourceMacros(this.object);
      macros.items.splice(Number(li.dataset.macropart), 1);
      return this.object.update({"flags.midi-qol.onUseMacroName": macros.toString()}).then(() => this.render(true));
    }
  }
}