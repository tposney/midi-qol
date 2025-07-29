import { configSettings } from "./settings.js";

// TODO: Since we're just replacing this one function, maybe wrap instead of overriding the class
export class MidiCombat5e extends globalThis.dnd5e.documents.Combat5e {
  async endCombat() {
    if (configSettings.activationAutomation !== "auto") return super.endCombat();
    await Reflect.apply(Combat.prototype.endCombat, this, []);
    super._recoverUses({turn: true, turnEnd: true, turnStart: false});
    return this;
  }
}