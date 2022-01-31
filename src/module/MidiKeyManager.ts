import { i18n } from "../midi-qol.js";
import { Options } from "./patching.js";
import { configSettings } from "./settings.js";
import { setupSheetQol } from "./sheetQOL";

export class MidiKeyManager {
  _adv = false;
  _dis = false;
  _vers = false;
  _rollToggle = false;
  _other = false;
  _fastForward = false;
  _critical = false;
  _lastReturned: Options = {
    advantage: undefined,
    disadvantage: undefined,
    versatile: undefined,
    other: undefined,
    rollToggle: undefined,
    fastForward: undefined,
    parts: undefined,
    chatMessage: undefined,
    critical: undefined,
    event: null,
    fastForwardAbility: undefined,
    fastForwardDamage: undefined,
    fastForwardAttack: undefined,
  };

  constructor() {
    this._adv = false;
    this._dis = false;
    this._vers = false;
    this._other = false;
    this._rollToggle = false;
    this._fastForward  = false;
    this._critical = false;
  }
  getstate(): Options {
    return {
      advantage: this._adv,
      disadvantage: this._dis,
      versatile: this._vers,
      other: this._other,
      rollToggle: this._rollToggle,
      fastForward: this._fastForward,
      fastForwardAbility: undefined,
      fastForwardDamage: undefined,
      fastForwardAttack: undefined,
      parts: undefined,
      chatMessage: undefined,
      critical: this._critical,
      event: null
    }
  }
  get pressedKeys(): Options {
    const returnValue = this.getstate();
    this._lastReturned = returnValue;
    return returnValue;
  }

  // Return keys pressed since last queried
  diffKeys(): {} {
    const current = this.getstate();
    const returnValue = diffObject(this._lastReturned, current);
    this._lastReturned = current;
    return returnValue;
  }

  setupKeyMappings() {
    //@ts-ignore
    const keybindings = game.keybindings;
    keybindings.set("midi-qol", "rollToggle", [
      {
        key: "T"
      },
      {
        key: "Alt",
        modifiers: [ "Control" ]
      },
      {
        key: "Control",
        modifiers: ["Alt"]
      }
   ]);
  }
  initKeyMappings() {
    const worldSettings = configSettings.worldKeyMappings ?? false;
    //@ts-ignore
    const keybindings = game.keybindings;
    //@ts-ignore
    const normalPrecedence = CONST.KEYBINDING_PRECEDENCE.NORMAL;
    keybindings.register("midi-qol", "AdvantageRoll", {
      name: "DND5E.Advantage",
      hint: "midi-qol.KeysAdvantage.Hint",
      editable: [
        { key: "AltLeft" },
        { key: "AltRight" },
      ],
      onDown: () => { this._adv = true },
      onUp: () => { this._adv = false },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
    keybindings.register("midi-qol", "DisadvantageRoll", {
      name: "DND5E.Disadvantage",
      hint: "midi-qol.KeysDisadvantage.Hint",
      editable: [
        { key: "ControlLeft"},
        { key: "ControlRight"},
      ],
      onDown: () => { this._dis = true },
      onUp: () => { this._dis = false },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "Versatile", {
      name: i18n("DND5E.Versatile"),
      hint: "midi-qol.KeysVersatile.Hint",
      editable: [
        { key: "KeyV"}, 
        { key: "Shift" },
      ],
      onDown: () => { this._vers = true },
      onUp: () => { this._vers = false },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "rolOther", {
      name: i18n("DND5E.OtherFormula"),
      hint: "midi-qol.KeysOther.Hint",

      editable: [
        { key: "KeyO" },
      ],
      onDown: () => { this._other = true },
      onUp: () => { this._other = false },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
    

    keybindings.register("midi-qol", "Critical", {
      name: i18n("DND5E.Critical"),
      hint: "midi-qol.KeysCritical.Hint",
      editable: [
        { key: "KeyC" },
        { key: "ControlLeft" },
        { key: "ControlRight" },

      ],
      onDown: () => { this._critical = true },
      onUp: () => { this._critical = false },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "rollToggle", {
      name: i18n("midi-qol.RollToggle.Name"),
      hint: i18n("midi-qol.RollToggle.Hint"),
      editable: [
        { key: "KeyT" },
        /*
        { key: "ControlLeft", modifiers: ["Alt"]},
        { key: "ControlRight", modifiers: ["Alt"]},
        { key: "AltLeft", modifiers: ["Control"]},
        { key: "AltRight", modifiers: ["Control"]}
        */
      ],
      onDown: () => { this._rollToggle = true; },
      onUp: () => { this._rollToggle = false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
  }
}