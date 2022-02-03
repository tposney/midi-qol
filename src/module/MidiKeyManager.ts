import { config } from "simple-peer";
import { i18n } from "../midi-qol.js";
import { Options } from "./patching.js";
import { autoFastForwardAbilityRolls, configSettings } from "./settings.js";
import { setupSheetQol } from "./sheetQOL";
import { isAutoFastAttack, isAutoFastDamage } from "./utils.js";

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
    this._fastForward = false;
    this._critical = false;
    window.addEventListener('keyup', (event) => this.handleKeyUpEvent(event));
  }

  handleKeyUpEvent(event) {
    if (!configSettings.fixStickyKeys) return;
    if (event.isComposing) return;
    if (!event.key && !event.code) return;

    const debug: any = CONFIG.debug;
    const keyboardManager = game.keyboard;
    //@ts-ignore
    const context = KeyboardManager.getKeyboardEventContext(event, true);
    // Don't do anything if downKeys for the key is not set
    //@ts-ignore .downKeys
    if (!keyboardManager?.downKeys.has(context.key)) return;
    if (!(keyboardManager?.hasFocus && ["Control", "Alt", "Shift"].includes(context.event.key))) return;
    //@ts-ignore
    keyboardManager?.downKeys.delete(context.key);
    // Open debugging group
    if (debug.keybindings) {
      console.group(`[${context.up ? 'UP' : 'DOWN'}] Checking for keybinds that respond to ${context.modifiers}+${context.key}`);
      console.dir(context);
      //@ts-ignore
      console.log("midi-qol | keyboard handler removing key pressed status for ", context.key)
    }

    // Check against registered Keybindings
    //@ts-ignore
    const actions = KeyboardManager._getMatchingActions(context);
    if (actions.length === 0) {
      if (debug.keybindings) {
        console.log("No matching keybinds");
        console.groupEnd();
      }
      return;
    }

    // Execute matching Keybinding Actions to see if any consume the event
    let handled;
    for (const action of actions) {
      //@ts-ignore
      handled = KeyboardManager._executeKeybind(action, context);
      if (handled) break;
    }

    // Don't Cancel event since it should do whatever else it is supposed to.
    if ( handled && context.event ) {
      //@ts-ignore
      if ( CONFIG.debug.keybindings ) console.log("Event was not consumed");
    }
    if (debug.keybindings) console.groupEnd();
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
    const keyboardManager = game.keyboard;
    const returnValue = this.getstate();
    this._lastReturned = returnValue;
    //@ts-ignore
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
        modifiers: ["Control"]
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
      onDown: () => { this._adv = true; return false; },
      onUp: () => { this._adv = false; return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
    keybindings.register("midi-qol", "DisadvantageRoll", {
      name: "DND5E.Disadvantage",
      hint: "midi-qol.KeysDisadvantage.Hint",
      editable: [
        { key: "ControlLeft" },
        { key: "ControlRight" },
      ],
      onDown: () => { this._dis = true; return false; },
      onUp: () => { this._dis = false; return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "Versatile", {
      name: i18n("DND5E.Versatile"),
      hint: "midi-qol.KeysVersatile.Hint",
      editable: [
        { key: "KeyV" },
        { key: "ShiftLeft" },
        { key: "ShiftRight" }
      ],
      onDown: () => { this._vers = true; return false; },
      onUp: () => { this._vers = false; return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "rolOther", {
      name: i18n("DND5E.OtherFormula"),
      hint: "midi-qol.KeysOther.Hint",

      editable: [
        { key: "KeyO" },
      ],
      onDown: () => { this._other = true; return false; },
      onUp: () => { this._other = false; return false; },
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
      onDown: () => { this._critical = true; return false; },
      onUp: () => { this._critical = false; return false; },
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
      onDown: () => { this._rollToggle = true; return false; },
      onUp: () => { this._rollToggle = false; return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
  }
}

export function mapSpeedKeys(keys, type: string, forceToggle = false): Options | undefined {
  // if (installedModules.get("betterrolls5e")) return undefined;

  const pressedKeys = duplicate(keys ?? globalThis.MidiKeyManager.pressedKeys);
  let hasToggle = pressedKeys.rollToggle || forceToggle;
  if (pressedKeys.rollToggle && forceToggle) hasToggle = false;
  switch (type) {
    case "ability":
      pressedKeys.fastForwardAbility = hasToggle ? !autoFastForwardAbilityRolls : autoFastForwardAbilityRolls;
      if (pressedKeys.rollToggle) {
        pressedKeys.advantage = false;
        pressedKeys.disadvantage = false;
      }
      if (pressedKeys.advantage || pressedKeys.disadvantage) pressedKeys.fastForwardAbility = true;
      pressedKeys.fastForward = pressedKeys.fastForwardAbility;
      pressedKeys.critical = undefined;
      break;
    case "damage":
      pressedKeys.fastForwardDamage = (hasToggle ? !isAutoFastDamage() : isAutoFastDamage()) || pressedKeys.critical;
      pressedKeys.fastForward = pressedKeys.fastForwardDamage;
      pressedKeys.advantage = undefined;
      pressedKeys.disadvantage = undefined;
      break;

    case "attack":
    default:
      pressedKeys.critical = undefined;
      pressedKeys.fastForwardAttack = (hasToggle ? !isAutoFastAttack() : isAutoFastAttack()) || pressedKeys.advantage || pressedKeys.disadvantage;
      pressedKeys.fastForward = pressedKeys.fastForwardAttack;
      pressedKeys.critical = false;
      pressedKeys.fastForwardDamage = hasToggle ? !isAutoFastDamage() : isAutoFastDamage();
      if (pressedKeys.advantage && pressedKeys.disadvantage) {
        pressedKeys.advantage = false;
        pressedKeys.disadvantage = false;
      }
      break;
  }
  return pressedKeys;
}
