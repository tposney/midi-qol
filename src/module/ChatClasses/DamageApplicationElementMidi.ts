import { configSettings } from "../settings.js"; 
import { GameSystemConfig, MODULE_ID, MQDamageRollTypes, debugEnabled, i18nFormat, log, warn } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { CombinedTargetDescriptor, DamageApplicationOptions } from "../../globals.js";
import { WorkflowDataFlags } from "../Workflow.js";

// SVG Icons for midi-qol custom change sources (using dnd5e SVGs for consistent styling)
const MIDI_CHANGE_ICONS: Record<string, string> = {
  saved: "systems/dnd5e/icons/svg/activity/save.svg",
  superSaver: "systems/dnd5e/icons/svg/checked-shield.svg",
  semiSuperSaver: "systems/dnd5e/icons/svg/checked-shield.svg",
  uncannyDodge: "systems/dnd5e/icons/svg/activity/utility.svg",
  absorption: "systems/dnd5e/icons/svg/damage/healing.svg",
  DR: "systems/dnd5e/icons/svg/damage/threshold.svg",
  spell: "systems/dnd5e/icons/svg/activity/cast.svg",
  magic: "systems/dnd5e/icons/svg/activity/enchant.svg",
  nonmagic: "systems/dnd5e/icons/svg/activity/attack.svg"
};

export class DamageApplicationElementMidi extends globalThis.dnd5e.applications.components.DamageApplicationElement {
  #targetOptions: Map<string, DamageApplicationOptions> = new Map();
  chatMessage;
  damages: any[] = [];
  damageType: string = "defaultDamage";

  /**
   * Override to handle "all" type for consolidated save icons and other midi custom types
   */
  getChangeSourceButton({ change, icon, type }, targetOptions: DamageApplicationOptions): string {
    // For midi custom change types with "all", provide custom icon and handling
    if (type === "all" || !GameSystemConfig.damageTypes[type]) {
      const customIcon = icon || MIDI_CHANGE_ICONS[change];
      if (customIcon) {
        const { label, pressed } = this.getChangeSourceOptions(type, change, targetOptions);
        return `
          <button class="change-source unbutton" type="button" data-type="${type}" data-change="${change}"
                  data-tooltip aria-label="${label}" aria-pressed="${pressed}">
            <dnd5e-icon src="${customIcon}" inert></dnd5e-icon>
            <i class="fa-solid fa-slash" inert></i>
            <i class="fa-solid fa-arrow-turn-down" inert></i>
          </button>
        `;
      }
    }
    // Fall back to parent implementation for standard damage types
    return super.getChangeSourceButton({ change, icon, type }, targetOptions);
  }

  /**
   * Override to handle "all" type and midi custom change types for labels
   */
  getChangeSourceOptions(type: string, change: string, options: DamageApplicationOptions): { label: string, pressed: string } {
    let mode = "active";
    if ((options.ignore?.[change] === true) || options.ignore?.[change]?.has?.(type)) mode = "ignore";
    else if ((change === "immunity") && (options.downgrade as Set<string>)?.has(type)) mode = "downgrade";

    const changeKey = change.charAt(0).toUpperCase() + change.slice(1);
    const typeLabel = GameSystemConfig.damageTypes[type]?.label ?? GameSystemConfig.healingTypes?.[type]?.label ?? "";
    let label = i18nFormat(`DND5E.DamageApplication.Change.${changeKey}`, { type: typeLabel });

    if (mode === "ignore") label = i18nFormat("DND5E.DamageApplication.Ignoring", { source: label });
    if (mode === "downgrade") label = i18nFormat("DND5E.DamageApplication.Downgrading", { source: label });

    return { label, pressed: mode === "active" ? "false" : mode === "ignore" ? "true" : "mixed" };
  }

  /**
   * Override to append midi custom change source buttons after parent builds the entry
   */
  buildTargetListEntry({ uuid, name }): HTMLLIElement | void {
    // Let parent build the base entry
    const li = super.buildTargetListEntry({ uuid, name }) as HTMLLIElement | undefined;
    if (!li) return;

    // Get the active flags which include our custom midi types
    const targetOptions = this.getTargetOptions(uuid);
    const actor = fromUuidSync(uuid) as Actor.Implementation | null;
    if (!actor) return li;

    const { active } = this.calculateDamage(actor, targetOptions);

    // Find midi custom types that parent skipped (type "all" or types not in damageTypes config)
    const subtitle = li.querySelector(".subtitle");
    if (!subtitle) return li;

    for (const [change, values] of Object.entries(active)) {
      if (foundry.utils.getType(values) !== "Set") continue;
      for (const type of values as Set<string>) {
        // Skip types that parent already handled
        if (GameSystemConfig.damageTypes[type] || GameSystemConfig.healingTypes?.[type]) continue;
        // Add button for midi custom type
        if (MIDI_CHANGE_ICONS[change]) {
          const button = this.getChangeSourceButton({ type, change, icon: MIDI_CHANGE_ICONS[change] }, targetOptions);
          subtitle.insertAdjacentHTML("beforeend", button);
        }
      }
    }

    return li;
  }

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
    // Call actor.calculateDamage once and extract both total and active flags from same calculation
    // This ensures the displayed total correctly reflects any ignore flags (e.g., ignored saves)
    // Note: Save multiplier is applied in dnd5e.preCalculateDamage/calculateDamage hooks via applySavesToDamage()
    // The ordering depends on configSettings.saveDROrder
    console.error("DamageApplicationElementMidi.calculateDamage", {
      actor: actor.name,
      inputDamages: this.damages,
      options_multiplier: options.multiplier,
      options_midi: options.midi,
      options_midi_saved: options.midi?.saved,
      options_midi_saveMultiplier: options.midi?.saveMultiplier,
      options_ignore: options.ignore
    });
    // @ts-expect-error no dnd5e-types
    const damages = actor.calculateDamage(this.damages, options) as DamageDescription[];
    // @ts-expect-error amount and temp are on the damages array
    let { amount: total, temp } = damages;
    console.error("DamageApplicationElementMidi.calculateDamage result", {
      total,
      temp,
      damages: damages.map(d => ({ type: d.type, value: d.value, active: d.active }))
    });
    temp = Math.floor(Math.max(0, temp ?? 0));

    // Build active object with both dnd5e standard sets and midi custom sets
    const active: Record<string, Set<string> | boolean> = {
      // dnd5e standard
      modification: new Set(),
      resistance: new Set(),
      vulnerability: new Set(),
      immunity: new Set(),
      threshold: false,
      // midi custom
      absorption: new Set(),
      saved: new Set(),
      superSaver: new Set(),
      semiSuperSaver: new Set(),
      spell: new Set(),
      magic: new Set(),
      uncannyDodge: new Set(),
      nonmagic: new Set(),
      DR: new Set()
    };

    try {
      for (const damage of damages) {
        // Skip DR/no-type damage for save-related flags - they shouldn't show icons
        const isDRType = ["none", "midi-none"].includes(damage.type);

        // dnd5e standard active flags
        if (damage.active?.modification) (active.modification as Set<string>).add(damage.type);
        if (damage.active?.resistance) (active.resistance as Set<string>).add(damage.type);
        if (damage.active?.vulnerability) (active.vulnerability as Set<string>).add(damage.type);
        if (damage.active?.immunity) (active.immunity as Set<string>).add(damage.type);
        if (damage.active?.threshold) active.threshold = true;
        // midi custom active flags
        if (damage.active?.absorption) (active.absorption as Set<string>).add(damage.type);
        if (damage.active?.spell) (active.spell as Set<string>).add(damage.type);
        if (damage.active?.magic) (active.magic as Set<string>).add(damage.type);
        if (damage.active?.nonmagic) (active.nonmagic as Set<string>).add(damage.type);
        if (damage.active?.DR) (active.DR as Set<string>).add(damage.type);
        // Save-related flags: use "all" for a single consolidated icon, skip DR types
        if (!isDRType) {
          if (damage.active?.superSaver) (active.superSaver as Set<string>).add("all");
          if (damage.active?.semiSuperSaver) (active.semiSuperSaver as Set<string>).add("all");
          if (damage.active?.saved) (active.saved as Set<string>).add("all");
        }
        if (damage.active?.uncannyDodge) (active.uncannyDodge as Set<string>).add(damage.type);
      }

      // Union with ignore sets to preserve button display for ignored items
      const union = (t: string) => {
        if (foundry.utils.getType(options.ignore?.[t]) === "Set") {
          active[t] = (active[t] as Set<string>).union(options.ignore?.[t]);
        }
      };
      // dnd5e standard
      union("modification");
      union("resistance");
      union("vulnerability");
      union("immunity");
      if (options.downgrade instanceof Set) {
        active.immunity = (active.immunity as Set<string>).union(options.downgrade);
      }
      // @ts-expect-error threshold exists on dnd5e's ignore type
      active.threshold ||= options.ignore?.threshold ?? false;
      // midi custom
      union("absorption");
      union("spell");
      union("magic");
      union("nonmagic");
      union("saved");
      union("superSaver");
      union("semiSuperSaver");
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
