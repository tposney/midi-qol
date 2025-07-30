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
}

export class OnUseMacro {
  macroName: string;
  option: string;
  macro: string | undefined = undefined;
  macroPassOptions: Record<string, string> = {};

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

export function getCurrentSourceMacros(document: Actor.Implementation): OnUseMacros {
  const macroField = new OnUseMacros(foundry.utils.getProperty(document, "_source.flags.midi-qol.onUseMacroName") ?? null)
  // const macroField = foundry.utils.getProperty(object, "_source.flags.midi-qol.onUseMacroParts");
  return macroField;
}