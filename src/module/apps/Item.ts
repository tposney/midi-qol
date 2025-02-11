export class OnUseMacros {
  items: OnUseMacro[];

  constructor(onUseMacros: any = null) {
    if (typeof onUseMacros === "string") {
      this.items = onUseMacros?.split(',')?.filter((value: string) => value.trim().length > 0)?.map((macro: string) => new OnUseMacro(macro));
    } else {
      this.items = [];
    }
  }

  static parseParts(parts) {
    const macros = new OnUseMacros();
    parts.items?.forEach(x => macros.items.push(OnUseMacro.parsePart(x)));
    return macros;
  }

  public getMacros(currentOption: string | undefined): string {
    return this.items.filter(x => x.macroName?.length > 0 && (x.option.toLocaleLowerCase() === (currentOption ?? "").toLocaleLowerCase() || x.option === "all")).map(x => x.macroName).toString();
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
      this.macroName = "ItemMacro";
    } else {
      const pattern = new RegExp('(?:\\[(?<option>.*?)\\])?(?<macroName>.*)', '');
      let data = macro.match(pattern)?.groups;
      this.macroName = data!["macroName"].trim();
      this.option = data!["option"];
    }
    this.option ??= "postActiveEffects";
  }

  static parsePart(parts: { macroName: string, option: string | undefined }) {
    const m = new OnUseMacro();
    m.macroName = parts.macroName;
    m.option = parts.option ?? m.option;
    return m;
  }

  public toString() {
    return `[${this.option}]${this.macroName}`;
  }

  public toListItem(index: Number, macroOptions: OnUseMacroOptions) {
    const options = OnUseMacroOptions.getOptions?.reduce((opts: string, x: { option: string, label: string }) => opts += `<option value="${x.option}" ${x.option === this.option ? 'selected' : ''}>${x.label}</option>`, "");
    return `<li class="damage-part flexrow" data-midiqol-macro-part="${index}">
    <input type="text" class="midi-onuse-macro-name" name="flags.midi-qol.onUseMacroParts.items.${index}.macroName" value="${this.macroName}">
    <select name="flags.midi-qol.onUseMacroParts.items.${index}.option">
      ${options}
    </select>

    <a class="macro-control damage-control delete-macro"><i class="fas fa-minus"></i></a>
  </li>`;
  }
}
export class OnUseMacroOptions {
  static options: Array<{ option: string, label: string }>;

  static setOptions(options: any) {
    this.options = [];
    for (let option of Object.keys(options)) {
      this.options.push({ option, label: options[option] });
    }
  }

  static get getOptions(): Array<{ option: string, label: string }> {
    return this.options;
  }
}

export function activateMacroListeners(app: Application, html) {
  //@ts-ignore
  if (app.isEditable) {
    $(html).find(".macro-control").on("click", _onMacroControl.bind(app));
    const dd = new DragDrop({
      dragSelector: undefined,
      dropSelector: ".midi-onuse-macro-name",
      permissions: {dragstart: () => false, drop: () => true},
      callbacks: { drop: _onDrop },
    });

    //@ts-expect-error .form
    dd.bind(app.form ?? app.element);
  }
}

async function _onDrop(ev) {
  ev.preventDefault();
  const data: any = TextEditor.getDragEventData(ev);
  if (data.uuid) {
    const entity: any = await fromUuid(data.uuid);
    if (entity instanceof Item)ev.target.value = `ItemMacro.${data.uuid}`;
    else if (entity instanceof Macro) ev.target.value = `Macro.${data.uuid}`;
    else if (entity?.macro) ev.target.value = `ActivityMacro.${data.uuid}`;
  }
}

async function _onMacroControl(event) {
  event.preventDefault();
  const a = event.currentTarget;

  // Add new macro component
  if (a.classList.contains("add-macro")) {
    const macros = getCurrentSourceMacros(this.object);
    this.selectMidiTab = true;
    if (this._onSubmit) await this._onSubmit(event);  // Submit any unsaved changes
    macros.items.push(new OnUseMacro());
    this.selectMidiTab = true;
    await this.object.update({ "flags.midi-qol.onUseMacroName": macros.toString() });
  }

  // Remove a macro component
  if (a.classList.contains("delete-macro")) {
    const macros = getCurrentSourceMacros(this.object);
    const li = a.closest(".damage-part");
    this.selectMidiTab = true;
    if (this._onSubmit) await this._onSubmit(event);  // Submit any unsaved changes
    macros.items.splice(Number(li.dataset.midiqolMacroPart), 1);
    this.selectMidiTab = true;
    await this.object.update({ "flags.midi-qol.onUseMacroName": macros.toString() });
  }

  if (a.classList.contains("edit-macro")) {
    new globalThis.DAE.DIMEditor(this.document, {}).render(true);
  }
  this.selectMidiTab = true;
}

export function getCurrentMacros(object): OnUseMacros {
  const macroField = foundry.utils.getProperty(object, "flags.midi-qol.onUseMacroParts");
  return macroField;
}

export function getCurrentSourceMacros(object): OnUseMacros {
  const macroField = new OnUseMacros(foundry.utils.getProperty(object, "_source.flags.midi-qol.onUseMacroName") ?? null)
  // const macroField = foundry.utils.getProperty(object, "_source.flags.midi-qol.onUseMacroParts");
  return macroField;
}