import { ItemDataSchema } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/itemData";
import { i18n } from "../../midi-qol.js";

export class OnUseMacros {
  items: OnUseMacro[];

  constructor(onUseMacroNames: string){
    this.items = onUseMacroNames?.split(',')?.filter((value: string) => value.trim().length > 0)?.map((macro: string) => new OnUseMacro(macro)) ?? [];
  }

  public getMacros(currentOption: string) {
    return this.items.filter(x => x.macroName?.length > 0).filter(x => x.option === currentOption || x.option === "all").map(x => x.macroName).toString();
  }

  get selectListOptions() {
    const macroOptions = new OnUseMacroOptions(i18n('midi-qol.onUseMacroOptions')).getOptions;
    return this.items.reduce((value: string, macro: OnUseMacro, index: number) => value += macro.toListItem(index, macroOptions), "");
  }
}

class OnUseMacro {
    macroName: string;
    option: string; 
  
    constructor(macro: string) {
      const pattern = new RegExp('(?:\\[(?<option>.*?)\\])?(?<macroName>.*)', '');
      let data = macro.match(pattern)?.groups; 
  
      this.macroName = data!["macroName"].trim();
      this.option = data!["option"] ?? "postActiveEffects";
    }

    public toListItem (index: Number, macroOptions: Array<OnUseMacroOption>) {    
      const options = macroOptions?.reduce((opts: string, x: OnUseMacroOption) => opts += `<option value="${x.option}" ${x.option === this.option ? 'selected' : ''}>${x.label}</option>`, "");
      return `<li class="macro-part flexrow" midiqol-macro-part="${index}">
    <input type="text" name="flags.midi-qol.onUseMacroName.parts.${index}.0" value="${this.macroName}">
    <select name="flags.midi-qol.onUseMacroName.parts.${index}.1">
      ${options}
    </select>
    <a class="macro-control delete-macro"><i class="fas fa-minus"></i></a>
  </li>`;
    }
}

class OnUseMacroOption {
  option: string;
  label: string;

  constructor(option, label){
    this.option = option;
    this.label = label;
  }
}

class OnUseMacroOptions {
  preAttackRoll: string;
	preCheckHits: string;
	postAttackRoll: string;
	preSave: string;
	postSave: string;
	preDamageRoll: string;
	postDamageRoll: string;
	preDamageApplication: string;
	preActiveEffects: string;
	postActiveEffects: string;
	all: string;

  constructor(data: any) {
    this.preAttackRoll = "preAttackRoll";
    this.preCheckHits = "preCheckHits";
    this.postAttackRoll = "postAttackRoll";
    this.preSave = "preSave";
    this.postSave = "postSave";
    this.preDamageRoll = "preDamageRoll";
    this.postDamageRoll = "postDamageRoll";
    this.preDamageApplication = "preDamageApplication";
    this.preActiveEffects = "preActiveEffects";
    this.postActiveEffects = "postActiveEffects";
    this.all = "all";
    for(const [k, v] of Object.entries(data)) {
      if(this[k]) {
        this[k] = v;
      }
    }
  }

  get getOptions() {
    let result: Array<OnUseMacroOption> = [];
    for(const [option, label] of Object.entries(this)) {
      result.push(new OnUseMacroOption(option, label));
    }
    return result;
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