export class OnUseMacros {
  items: OnUseMacro[];

  constructor(onUseMacros: any = null){
    if (typeof onUseMacros === "string") {
      this.items = onUseMacros?.split(',')?.filter((value: string) => value.trim().length > 0)?.map((macro: string) => new OnUseMacro(macro)) ?? [];
    } else {
      this.items = [];
    }
  }

  static parseParts(parts) {
    const macros = new OnUseMacros();
    Object.keys(parts).map(x => parts[x]).forEach(x => macros.items.push(OnUseMacro.parsePart(x)));
    return macros;
  }

  public getMacros(currentOption: string) {
    return this.items.filter(x => x.macroName?.length > 0 && (x.option === currentOption || x.option === "all")).map(x => x.macroName).toString();
  }

  public toString() {
    return this.items.map(m => m.toString()).join(',');
  }

  get selectListOptions() {
    return this.items.reduce((value: string, macro: OnUseMacro, index: number) => value += macro.toListItem(index, OnUseMacroOptions.getOptions), "");
  }
}

export class OnUseMacro {
    macroName: string;
    option: string; 
  
    constructor(macro: string | undefined = undefined) {
      if (macro === undefined) {
        this.macroName = "";
      } else {
        const pattern = new RegExp('(?:\\[(?<option>.*?)\\])?(?<macroName>.*)', '');
        let data = macro.match(pattern)?.groups; 
        this.macroName = data!["macroName"].trim();
        this.option = data!["option"];
      }
      if (this.option === undefined)
        this.option = "postActiveEffects";
    }

    static parsePart(parts: [string, string]) {
      const m =  new OnUseMacro();
      m.macroName = parts[0]
      m.option = parts[1] ?? m.option;
      return m;
    }

    public toString() {
      return `[${this.option}]${this.macroName}`;
    }

    public toListItem (index: Number, macroOptions: OnUseMacroOptions) {    
      const options = OnUseMacroOptions.getOptions?.reduce((opts: string, x: {option: string, label: string}) => opts += `<option value="${x.option}" ${x.option === this.option ? 'selected' : ''}>${x.label}</option>`, "");
      return `<li class="damage-part flexrow" data-midiqol-macro-part="${index}">
    <input type="text" name="flags.midi-qol.onUseMacroParts.${index}.0" value="${this.macroName}">
    <select name="flags.midi-qol.onUseMacroParts.${index}.1">
      ${options}
    </select>

    <a class="macro-control damage-control delete-macro"><i class="fas fa-minus"></i></a>
  </li>`;
    }
}
export class OnUseMacroOptions {
  static options : Array<{option: string, label: string}>;

  static setOptions(options: any) {
    this.options = [];
    for (let option of Object.keys(options)) {
      this.options.push({option, label: options[option]});
    }
  }

  static get getOptions(): Array<{option: string, label: string}> {
    return this.options;
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
    const macros = getCurrentMacros(this.item);
    await this._onSubmit(event);  // Submit any unsaved changes
    macros.items.push(new OnUseMacro());
    return this.item.update({"flags.midi-qol.onUseMacroName":  macros.toString()});
  }

  // Remove a macro component
  if ( a.classList.contains("delete-macro") ) {
    const macros = getCurrentMacros(this.item);
    await this._onSubmit(event);  // Submit any unsaved changes
    const li = a.closest(".damage-part");
    macros.items.splice(Number(li.dataset.midiqolMacroPart), 1);
    return this.item.update({"flags.midi-qol.onUseMacroName": macros.toString()});
  }
}

function getCurrentMacros(item): OnUseMacros {
  const macroField = getProperty(item, "data.flags.midi-qol.onUseMacroParts");
  return macroField;
}