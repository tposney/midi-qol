import { configSettings } from "./settings.js";

export class MidiCombat5e extends globalThis.dnd5e.documents.Combat5e {
  async endCombat() {
    if (configSettings.activationAutomation !== "auto") return super.endCombat();
    await Reflect.apply(Combat.prototype.endCombat, this, []);
    super._recoverUses({turn: true, turnEnd: true, turnStart: false});
    return this;
  }
}