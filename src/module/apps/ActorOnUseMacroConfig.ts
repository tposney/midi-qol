import { geti18nOptions, i18n } from "../../midi-qol.js";
import { activateMacroListeners, getCurrentMacros, getCurrentSourceMacros, OnUseMacro, OnUseMacros } from "./Item.js";

export class ActorOnUseMacrosConfig extends FormApplication {
  object: any;
  constructor(object, options) {
    super(object, options);
  }

  static get defaultOptions() {
	  return foundry.utils.mergeObject(super.defaultOptions, {
	    template: "modules/midi-qol/templates/actorOnUseMacrosConfig.html",
      classes: ["form", "active-effect-sheet","sheet"],
      width: "550",
      height: "auto",
      title: i18n("midi-qol.ActorOnUseMacros"),
      closeOnSubmit: false,
      submitOnClose: true,
      resizable: false,
      jQuery: true
    });
  }

  async getData(options) {
    let data: any = await super.getData(options);
    data.onUseMacroName = getProperty(this.object._source, "flags.midi-qol.onUseMacroName");
    if (data.onUseMacroName !== undefined) data.onUseMacroParts = new OnUseMacros(data.onUseMacroName).items;
    else data.onUseMacroParts = new OnUseMacros(null).items;
    data.MacroPassOptions = geti18nOptions("onUseMacroOptions");
    return data;
  }

  async _updateObject(event, data) {
    await this.object.setFlag("midi-qol", "onUseMacroParts", {items: data.onUseMacroParts});
    // don't need to update onUseMacroName since the preUpdate hook will do this
    this.render();
  }

  _getSubmitData(updateData={}) {
    //@ts-ignore
    const fd = new FormDataExtended(this.form, {editors: this.editors});
    //@ts-ignore .object v10
    let data = foundry.utils.expandObject(fd.object);
    if ( updateData ) foundry.utils.mergeObject(data, updateData);
    //@ts-ignore
    data.onUseMacroParts = Array.from(Object.values(data.onUseMacroParts ?? {})).map(oumData => OnUseMacro.parsePart([oumData.macroName, oumData.option]));
    return data;
  }

  activateListeners(html) {
    if (this.isEditable) {
      html.find(".macro-control").click(this.onMacroControl.bind(this));    
    }
  }
  
  async onMacroControl(event){
    event.preventDefault();
    const a = event.currentTarget;
  
    // Add new macro component
    if ( a.classList.contains("add-macro") ) {
      const macros = getCurrentMacros(this.object);
      const index = macros.items.length;
      // await this._onSubmit(event);  // Submit any unsaved changes
      // macros.items.push(new OnUseMacro());
      
      return this.submit({preventClose: true, updateData: {
        [`onUseMacroParts.${index}`]: {macroName: "",  option: "postActiveEffects"}
      //@ts-ignore
      }}).then(() => this.render(true));
    }
  
    // Remove a macro component
    if ( a.classList.contains("delete-macro") ) {
      a.closest(".macro-change").remove();
      //@ts-ignore
      return this.submit({preventClose: true}).then(() => this.render(true));
    }
  }
}