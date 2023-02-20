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
  _fastForwardSet = false;
  _critical = false;
  _noop = false;
  _lastReturned: Options = {
    advantage: undefined,
    disadvantage: undefined,
    versatile: undefined,
    other: undefined,
    rollToggle: undefined,
    fastForward: undefined,
    fastForwardSet: undefined,
    parts: undefined,
    chatMessage: undefined,
    critical: undefined,
    event: null,
    fastForwardAbility: undefined,
    fastForwardDamage: undefined,
    fastForwardAttack: undefined,
    autoRollAttack: undefined,
    autoRollDamage: undefined
  };

  resetKeyState() {
    this._adv = false;
    this._dis = false;
    this._vers = false;
    this._other = false;
    this._rollToggle = false;
    this._fastForward = false;
    this._fastForwardSet = false;
    this._critical = false;
  }
  constructor() {
    this.resetKeyState();
    window.addEventListener('keyup', (event) => this.handleKeyUpEvent(event));
  }

  handleKeyUpEvent(event) { // Not being used TODO remove if not required
    if (!configSettings.fixStickyKeys) return;
    if (event.isComposing) return;
    if (!event.key && !event.code) return;
    const debug: any = CONFIG.debug;
    const keyboardManager = game.keyboard;
    if (!keyboardManager?.hasFocus) return;
    //@ts-ignore
    const context = KeyboardManager.getKeyboardEventContext(event, true);

    // Don't do anything if downKeys for the key is not set
    // Had to take this out since ctrl-space removes the downKey(Control) but does not send a CTRL-Up status
    //@ts-ignore .downKeys
    // if (!keyboardManager?.downKeys.has(context.key)) return;
    if (!(keyboardManager?.hasFocus && ["Control", "Alt", "Shift"].includes(context.event.key))) return;
    //@ts-ignore
    keyboardManager?.downKeys.delete(context.key);
    // Open debugging group
    if (debug.keybindings) {
      console.group(`[${context.up ? 'UP' : 'DOWN'}] Checking for keybindings that respond to ${context.modifiers}+${context.key}`);
      console.dir(context);
      //@ts-ignore
      console.log("midi-qol | keyboard handler removing key pressed status for ", context.key)
    }

    // Check against registered Keybindings
    //@ts-ignore
    const actions = KeyboardManager._getMatchingActions(context);
    if (actions.length === 0) {
      if (debug.keybindings) {
        console.log("No matching keybindings");
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
      if ( debug.keybindings ) console.log("Event was not consumed");
    }
    if (debug.keybindings) console.groupEnd();
  }
  getstate(): Options {
    const state: Options =  {
      advantage: this._rollToggle ? false: this._adv,
      disadvantage: this._rollToggle ? false : this._dis,
      versatile: this._vers,
      other: this._other,
      rollToggle: this._rollToggle,
      fastForward: this._fastForward,
      fastForwardSet: this._fastForwardSet,
      fastForwardAbility: undefined,
      fastForwardDamage: undefined,
      fastForwardAttack: undefined,
      parts: undefined,
      chatMessage: undefined,
      critical: this._critical,
      autoRollAttack: undefined,
      autoRollDamage: false,
      event: {},
    }
    state.autoRollAttack = state.advantage || state.disadvantage || state.fastForwardAttack;
    return state;
  }
  get pressedKeys(): Options {
    if (configSettings.fixStickyKeys) {
      const formElements = [ "button"];
      const selector = formElements.map(el => `${el}:focus`).join(", ");
      const selectors = document.querySelectorAll(selector);
      //@ts-ignore
      // if (selectors.length > 0) selectors.forEach(selector => selector.blur())
    }
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

  track (status: string) {
    //@ts-ignore
    if (CONFIG.debug.keybindings) {
      console.log("midi-qol | key pressed ", status);
    }
  }
  initKeyMappings() {
    const worldSettings = false; // configSettings.worldKeyMappings ?? false;
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
      onDown: () => { this._adv = true; this.track("adv down"); return false; },
      onUp: () => { this._adv = false; this.track("adv up"); return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
    keybindings.register("midi-qol", "DisadvantageRoll", {
      name: "DND5E.Disadvantage",
      hint: "midi-qol.KeysDisadvantage.Hint",
      editable: [
        { key: "ControlLeft" },
        { key: "ControlRight" },
        { key: "MetaLeft"},
        { key: "MetaRight"}
      ],
      onDown: () => { this._dis = true; this.track("dis down"); return false; },
      onUp: () => { this._dis = false; this.track("dis up"); return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "noOptionalRules", {
      name: "midi-qol.NoOptionalRules.Name",
      hint: "midi-qol.NoOptionalRules.Hint",
      editable: [
      ],
      onDown: () => { configSettings.toggleOptionalRules = true; this.track("no opt rules down"); return false; },
      onUp: () => { configSettings.toggleOptionalRules = false; this.track("no opt rules up"); return false; },
      restricted: true,                         // Restrict this Keybinding to gamemaster only?
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
      onDown: () => { this._vers = true; this.track("versatile down");return false; },
      onUp: () => { this._vers = false; this.track("versatile up"); return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "rolOther", {
      name: i18n("DND5E.OtherFormula"),
      hint: "midi-qol.KeysOther.Hint",

      editable: [
        { key: "KeyO" },
      ],
      onDown: () => { this._other = true; this.track("roll other down"); return false; },
      onUp: () => { this._other = false; this.track("roll other up"); return false; },
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
        { key: "MetaLeft"},
        { key: "MetaRight"}

      ],
      onDown: () => { this._critical = true; this.track("crit down"); return false; },
      onUp: () => { this._critical = false; this.track("crit up"); return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });

    keybindings.register("midi-qol", "fastForward", {
      name: i18n("midi-qol.FastForward.Name"),
      hint: i18n("midi-qol.FastForward.Hint"),
      editable: [
        { key: "KeyF" },
      ],
      onDown: () => { this._fastForwardSet = true; this.track("roll ff down"); return false; },
      onUp: () => { this._fastForwardSet = false; this.track("roll ff up"); return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
    
    keybindings.register("midi-qol", "rollToggle", {
      name: i18n("midi-qol.RollToggle.Name"),
      hint: i18n("midi-qol.RollToggle.Hint"),
      editable: [
        { key: "KeyT" },
        
        { key: "ControlLeft", modifiers: ["Alt"]},
        { key: "ControlRight", modifiers: ["Alt"]},
        { key: "AltLeft", modifiers: ["Control"]},
        { key: "AltRight", modifiers: ["Control"]}
        
      ],
      onDown: () => { this._rollToggle = true; this.track("roll toggle down"); return false; },
      onUp: () => { this._rollToggle = false; this.track("roll toggle up"); return false; },
      restricted: worldSettings,                         // Restrict this Keybinding to gamemaster only?
      precedence: normalPrecedence
    });
  }

}

export function mapSpeedKeys(keys: Options | undefined, type: string, forceToggle = false): Options | undefined {
  // if (installedModules.get("betterrolls5e")) return undefined;

  const pressedKeys = deepClone(keys ?? globalThis.MidiKeyManager.pressedKeys);
  let hasToggle = pressedKeys.rollToggle || forceToggle;
  if (pressedKeys.rollToggle && forceToggle) hasToggle = false;
  switch (type) {
    case "ability":
      pressedKeys.fastForwardAbility = hasToggle ? !autoFastForwardAbilityRolls : autoFastForwardAbilityRolls;
      if (pressedKeys.fastForwardSet) pressedKeys.fastForwardAbility = true;
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
      if (pressedKeys.fastForwardSet) pressedKeys.fastForwardDamage = true;
      if (pressedKeys.fastForward) pressedKeys.fastForwardDamage = true;
      if (pressedKeys.critical) pressedKeys.autoRollDamage = true;
      pressedKeys.advantage = undefined;
      pressedKeys.disadvantage = undefined;
      break;

    case "attack":
    default:
      pressedKeys.critical = undefined;
      pressedKeys.fastForwardAttack = (hasToggle ? !isAutoFastAttack() : isAutoFastAttack()) || pressedKeys.advantage || pressedKeys.disadvantage;
      if (pressedKeys.fastForwardSet) pressedKeys.fastForwardAttack = true;
      pressedKeys.fastForward = pressedKeys.fastForwardAttack;
      pressedKeys.critical = false;
      pressedKeys.fastForwardDamage = hasToggle ? !isAutoFastDamage() : isAutoFastDamage();
      if (pressedKeys.advantage || pressedKeys.disadvantage) pressedKeys.autoRollAttack = true;
      if (pressedKeys.advantage && pressedKeys.disadvantage) {
        pressedKeys.advantage = false;
        pressedKeys.disadvantage = false;
      }
      break;
  }
  return pressedKeys;
}
