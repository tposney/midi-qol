import { configSettings } from "../settings.js"; 
import { GameSystemConfig, MODULE_ID, MQDamageRollTypes, debugEnabled, i18n, log, warn } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { CombinedTargetDescriptor, DamageApplicationOptions } from "../../globals.js";
import { WorkflowDataFlags } from "../Workflow.js";

export class DamageApplicationElementMidi extends globalThis.dnd5e.applications.components.DamageApplicationElement {
  #targetOptions: Map<string, DamageApplicationOptions> = new Map();
  chatMessage;
  damages: any[] = [];
  damageType: string = "defaultDamage";
  
  getTargetOptions(uuid: string): DamageApplicationOptions {
    if (!this.#targetOptions.has(uuid)) this.#targetOptions.set(uuid, { multiplier: 1 } as DamageApplicationOptions);
    const options = this.#targetOptions.get(uuid);
    if (!options) return { multiplier: 1 } as DamageApplicationOptions; // just to keep the linter happy - can never happen
    let sourceActorUuid = foundry.utils.getProperty(this.chatMessage, "flags.midi-qol.sourceActorUuid");
    try {
      let targetDetails;
        const targets = (foundry.utils.getProperty(this.chatMessage, WorkflowDataFlags.targetDescriptors) ?? []) as Array<CombinedTargetDescriptor>;
        targetDetails = targets.find(target => target.uuid === uuid);
        if (!targetDetails) return options;
        options.midi = foundry.utils.duplicate(targetDetails);
        const saveMultiplier = targetDetails.saveMults?.[this.damageType];
        if (targetDetails.saved) {
          foundry.utils.setProperty(options, "midi.saveMultiplier", saveMultiplier ?? configSettings.defaultSaveMultiplier);
        }
        if (saveMultiplier !== undefined) {
          if (targetDetails.superSaver && saveMultiplier === configSettings.defaultSaveMultiplier) {
            foundry.utils.setProperty(options, "midi.saveMultiplier", targetDetails.saved ? 0 : configSettings.defaultSaveMultiplier);
          }
          if (targetDetails.semiSuperSaver && saveMultiplier === configSettings.defaultSaveMultiplier) {
            foundry.utils.setProperty(options, "midi.saveMultiplier", targetDetails.saved ? 0 : 1);
          }
        }
        if (targetDetails.uncannyDodge) {
          foundry.utils.setProperty(options, "midi.uncannyDodge", true);
        }
        // Left in for backwards compatibility of previous midi versions
        if (targetDetails.sourceActorUuid) {
          sourceActorUuid = targetDetails.sourceActorUuid;
        }
    } catch (err) {
      const message = `midi-qol | _DAgetTargetOptions failed to get target options`;
      console.warn(message, err);
      TroubleShooter.recordError(err, message);
    } finally {
      foundry.utils.setProperty(options, "midi.sourceActorUuid", sourceActorUuid);
      return options;
    }
  }
  calculateDamage(actor: Actor.Implementation, options: DamageApplicationOptions) {
    const { temp, total, active } = super.calculateDamage(actor, options);
    try {
      active.absorption = new Set();
      active.saved = new Set();
      active.superSaver = new Set();
      active.semiSuperSaver = new Set();
      active.spell = new Set();
      active.magic = new Set();
      active.uncannyDodge = new Set();
      active.nonmagic = new Set();
      active.DR = new Set();
      // @ts-expect-error no dnd5e-types
      const damages = actor.calculateDamage(this.damages, options) as DamageDescription[];
      for (const damage of damages) {
        if (damage.active?.absorption) active.absorption.add(damage.type);
        if (damage.active?.spell) active.spell.add(damage.type);
        if (damage.active?.magic) active.magic.add(damage.type);
        if (damage.active?.nonmagic) active.nonmagic.add(damage.type);
        if (damage.active?.DR) active.DR.add(damage.type);
        if (damage.active?.superSaver) active.superSaver.add(damage.type);
        else if (damage.active?.semiSuperSaver) active.semiSuperSaver.add(damage.type);
        else if (damage.active?.saved) active.saved.add(damage.type);
  
        if (damage.active?.uncannyDodge) active.uncannyDodge.add(damage.type);
      }
      const union = (t: string) => {
        if (foundry.utils.getType(options.ignore?.[t]) === "Set") active[t] = active[t].union(options.ignore?.[t]);
      };
      union("absorption");
      union("spell")
      union("magic");
      union("nonmagic");
      union("saved");
      union("uncannyDodge");
      union("DR");
    } catch (err) {
      const message = `midi-qol | calculateDamage failed to calculate damage`;
      console.warn(message, err);
      TroubleShooter.recordError(err, message);
    }
    return { temp, total, active };
  }
}
