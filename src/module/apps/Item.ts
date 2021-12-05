import { ItemDataSchema } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/itemData";
import { i18n } from "../../midi-qol.js";


export class OnUseMacros {
  items: OnUseMacro[];

  constructor(onUseMacroNames: string){
    this.items = onUseMacroNames?.split(',')?.filter((value: string) => value.trim().length > 0)?.map((macro: string) => new OnUseMacro(macro)) ?? [];
  }

  public getMacros(designation: string) {
    return this.items.filter(x => (x.designation === designation && !x.called) || x.designation === "all").map(x => x.macroName).toString();
  }

  public setDesignationCalled(designation: string) {
    this.items.filter(x => x.designation === designation).forEach(x => x.called === true);
  }

  get selectListOptions() {
    const designations = i18n('midi-qol.onUseMacro.designation') as any as [string, string];
    return this.items.reduce((value: string, macro: OnUseMacro, index: number) => value += macro.toListItem(index, designations), "");
  }
}

class OnUseMacro {
    macroName: string;
    designation: string; 
    called: boolean;
  
    constructor(macro: string) {
      const pattern = new RegExp('(?:\\[(?<designation>.*?)\\])?(?<macroName>.*)', '');
      let data = macro.match(pattern)?.groups; 
  
      this.macroName = data!["macroName"].trim();
      this.designation = data!["designation"] ?? "postActiveEffects";
      this.called = false;
    }

    public toListItem (index: Number, designations: [string, string]) {    
      const options = designations?.reduce((opts: string, x: string) => opts += `<option value="${x[0]}" ${x[0] === this.designation ? 'selected' : ''}>${x[1]}</option>`, "");
      return `<li class="macro-part flexrow" midiqol-macro-part="${index}">
    <input type="text" name="flags.midi-qol.onUseMacroName.parts.${index}.0" value="${this.macroName}">
    <select name="flags.midi-qol.onUseMacroName.parts.${index}.1">
      ${options}
    </select>
    <a class="macro-control delete-macro"><i class="fas fa-minus"></i></a>
  </li>`;
    }
}

export function activateMacroListeners(app: ItemSheet, html) {
  if (app.isEditable) {
    html.find(".macro-control").click(_onMacroControl.bind(app));    
  }
}

async function _onMacroControl(event){
  event.preventDefault();
  const a = event.currentTarget;

  // Add new macro component
  if ( a.classList.contains("add-macro") ) {
    await this._onSubmit(event);  // Submit any unsaved changes    
    const macros = getProperty(this.item, "data.flags.midi-qol.onUseMacroName");
    return this.item.update({"flags.midi-qol.onUseMacroName":  macros.concat(',', "[postActiveEffects]")});
  }

  // Remove a macro component
  if ( a.classList.contains("delete-macro") ) {
    await this._onSubmit(event);  // Submit any unsaved changes
    const li = a.closest(".macro-part");
    const macros = getProperty(this.item, "data.flags.midi-qol.onUseMacroName");         
    return this.item.update({"flags.midi-qol.onUseMacroName": macros.substring(0, macros.lastIndexOf(','))});
  }
}