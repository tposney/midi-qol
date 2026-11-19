import { attackAgain } from "../rolls/attack.js";
import { adoptActivityType } from "./graft.js";
import { registerCardActions } from "./cardActions.js";
import { TokenDocumentSet } from "../lib/tokenDocumentSet.js";
import { debugEnabled, warn, error, busyWait, GameSystemConfig, debug, i18n, MODULE_ID, i18nFormat } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { decideRollDialog, dialogShown, heldKeys } from "../lib/rollKeys.js";
import { RollModifierTracker, AdvantageFlags, computeAdvantageFlags, computeRollModifiers, applyRollModifiers, RollModifierFlags, applyTrackerAdvantage } from "../lib/RollModifierTracker.js";
import { MidiOptions, setMessageTargets } from "../utils.js";
import { configSettings, confirmTargetOptions, ammunitionPerTargetOptions } from "../settings.js";
import { addAttribution, areMidiKeysPressed, callActivityHooks, displayDSNForRoll, getSpeaker, isAutoFastForward, updateUserTargets, validTargetTokens, getToken, tokenSourceCenter } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet, findAmmunitionActivity } from "./MidiActivityMixin.js";
import { doActivityReactions } from "./activityHelpers.js";
import { OnUseMacros } from "../apps/Item.js";
import { USAGE_MESSAGE_TYPE } from "../ChatClasses/UsageCardMessage.js";
import { Activity, ActivityUseConfiguration, DND5ETargetDescriptor, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";

export let MidiAttackSheet: ReturnType<typeof defineMidiAttackSheetClass>;
export let MidiAttackActivity: ReturnType<typeof defineMidiAttackActivityClass>;
// export let MidiAttackActivityData;

export function setupAttackActivity() {
  if (debugEnabled > 0) warn("MidiQOL | AttackActivity | setupAttackActivity | Called");

  //@ts-expect-error
  MidiAttackSheet = defineMidiAttackSheetClass(game.system.applications.activity.AttackSheet);
  MidiAttackActivity = defineMidiAttackActivityClass(GameSystemConfig.activityTypes.attack.documentClass as Activity);
  adoptActivityType("attack", MidiAttackActivity, MidiAttackSheet);
  registerCardActions(["attack"], {
    rollAttack: cardRollAttack,
    rollAttackAdvantage: cardRollAttackAdvantage,
    rollAttackDisadvantage: cardRollAttackDisadvantage,
    rollDamage: cardRollDamage,
    rollDamageNoCritical: cardRollDamageNoCritical,
    rollDamageCritical: cardRollDamageCritical
  });
}

let defineMidiAttackSheetClass = (baseClass: any) => {
  return class MidiAttackActivitySheet extends MidiActivityMixinSheet(baseClass) {

    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/attack-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates,
          "modules/midi-qol/templates/activity/parts/attack-extras.hbs",
        ]
      }
    }

    async _prepareEffectContext(context) {
      const activity = this.activity;
      context = await super._prepareEffectContext(context);
      context.attackModeOptions = this.item.system.attackModes;
      context.hasAmmunition = this.item.system.properties.has("amm");
      context.ammunitionOptions = this.item.system.ammunitionOptions ?? [];
      context.ammunitionOptions?.forEach(option => {
        option.selected = option.value === this.activity.ammunition;
      });
      if (activity.otherActivityUuid) {
        ui.notifications?.warn("Please update other activity. otherActivityUuid is deprecated");
        activity.otherActivityUuid = undefined;
      }
      // Add healing types to the existing damageParts typeOptions (dnd5e only includes damageTypes)
      if (context.damageParts?.length) {
        const healingTypes = Object.entries(GameSystemConfig.healingTypes).map(([value, config]) => ({
          value, label: config.label, selected: false
        }));
        for (const part of context.damageParts) {
          // Mark existing healing type selections (types may be a Set or undefined)
          const typesSet = part.data?.types instanceof Set ? part.data.types : new Set();
          for (const healingType of healingTypes) {
            healingType.selected = typesSet.has(healingType.value);
          }
          // Add healing types to the end of typeOptions
          part.typeOptions = [...(part.typeOptions ?? []), ...healingTypes.map(h => ({ ...h }))];
        }
      }
      context.ConfirmTargetOptions = Object.entries(confirmTargetOptions).map(([value, label]) => ({ value, label }));
      context.AmmunitionPerTargetOptions = Object.entries(ammunitionPerTargetOptions).map(([value, label]) => ({ value, label }));

      if (debugEnabled > 0) {
        warn(("prepareEffectContext | context"), context);
      }
      return context;
    }

    _prepareSubmitData(event, formData) {
      let submitData = super._prepareSubmitData(event, formData);
      submitData.otherActivityUuid = "";
      return submitData;
    }

  }
}

let defineMidiAttackActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiAttackActivity extends MidiActivityMixin(ActivityClass) {
    _otherActivity: Activity | undefined;

    static LOCALIZATION_PREFIXES = [...super.LOCALIZATION_PREFIXES, "midi-qol.ATTACK"];

    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        sheetClass: MidiAttackSheet,
        midiTitle: "midi-qol.ATTACK.Title.one",
        dnd5eTitle: ActivityClass.metadata.title,
        usage: {
          /*
           * No `chatCard`. Supplying one puts the activity on dnd5e's legacy content path
           * (`activity/mixin.mjs#legacyUsageContent`), which renders the template into
           * `message.content` — and `usage-card.hbs` short-circuits on `content`, so the system's own
           * card face never runs. That is what cost the card its background, its colours and the
           * damage tray. The card is now rendered by `MidiUsageMessageData` from stored state.
           *
           * `usage.chatCard` is deprecated in dnd5e 6.0 and removed in 6.2, so this had to go anyway.
           */
        },
      }, { inplace: false, insertKeys: true, insertValues: true })

    prepareData() {
      super.prepareData();
      if (this.otherActivityUuid && this.otherActivityUuid !== "") {
        console.warn(`midi-qol | otherActivityUuid is deprecated. Edit ${this.actor?.name ?? ""} ${this.item?.name ?? ""} ${this.name} and reset other activity. Currently ${this.otherActivityUuid}`);
      }
    }
    async _midiUsageContext(message) {
      const context = await super._midiUsageContext(message);

      context.hasAttack = !!this.attack; // && !minimalCard && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
      return context;
    }
  }
}

/**
 * Compute attack advantage/disadvantage from actor flags and target grants flags.
 * This handles the flag-based advantage checks for attacks.
 * Special rules (flanking, invisible, nearby foe, heavy weapons) are handled separately in Workflow.
 *
 * @param actor - The attacking actor
 * @param actionType - The action type (mwak, rwak, msak, rsak, etc.)
 * @param options - MidiOptions including workflow, target info
 * @param abilityId - Optional ability ID for ability-based attack flags (e.g., "str", "dex")
 * @param tracker - Optional existing RollModifierTracker to populate
 * @returns RollModifierTracker with attack advantage attribution
 */
export async function computeAttackAdvantage(
  actor: Actor.Implementation,
  actionType: string,
  options: MidiOptions,
  abilityId?: string,
  tracker?: RollModifierTracker
): Promise<RollModifierTracker> {
  tracker ??= new RollModifierTracker();

  // Spell school for school-specific attack flags
  // @ts-expect-error no dnd5e-types
  const attackSchool: string | undefined = options.item?.system?.school;

  // Define attack advantage flags
  const attackFlags: AdvantageFlags = {
    advantageFlags: [
      "advantage.all",
      "advantage.attack.all",
      `advantage.attack.${actionType}`,
      // Include ability-based attack flags if abilityId is provided
      ...(abilityId ? [`advantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`advantage.attack.school.${attackSchool}`] : [])
    ],
    disadvantageFlags: [
      "disadvantage.all",
      "disadvantage.attack.all",
      `disadvantage.attack.${actionType}`,
      ...(abilityId ? [`disadvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`disadvantage.attack.school.${attackSchool}`] : [])
    ],
    noAdvantageFlags: [
      "noAdvantage.all",
      "noAdvantage.attack.all",
      `noAdvantage.attack.${actionType}`,
      ...(abilityId ? [`noAdvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`noAdvantage.attack.school.${attackSchool}`] : [])
    ],
    noDisadvantageFlags: [
      "noDisadvantage.all",
      "noDisadvantage.attack.all",
      `noDisadvantage.attack.${actionType}`,
      ...(abilityId ? [`noDisadvantage.attack.${abilityId}`] : []),
      ...(attackSchool ? [`noDisadvantage.attack.school.${attackSchool}`] : [])
    ],
    systemRollModeFields: [...(abilityId ? [`abilities.${abilityId}.attack.roll.mode`] : []), "rolls.attack.mode", `rolls.attack.${actionType}.mode`],
    ...(options.workflow?.activity ? { systemRules: { category: "attack" as const, item: options.workflow.activity.item,
      // @ts-expect-error no dnd5e-types
      rollData: options.workflow.activity.getRollData({ roll: { ability: abilityId, attackMode: options.workflow.attackMode } }) } } : {}),
    // Target grants flags (checked on target actor)
    sourceAdvantageFlags: [
      "grants.advantage.all",
      "grants.advantage.attack.all",
      `grants.advantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.advantage.attack.school.${attackSchool}`] : [])
    ],
    sourceDisadvantageFlags: [
      "grants.disadvantage.all",
      "grants.disadvantage.attack.all",
      `grants.disadvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.disadvantage.attack.school.${attackSchool}`] : [])
    ],
    sourceNoAdvantageFlags: [
      "grants.noAdvantage.attack.all",
      `grants.noAdvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.noAdvantage.attack.school.${attackSchool}`] : [])
    ],
    sourceNoDisadvantageFlags: [
      "grants.noDisadvantage.attack.all",
      `grants.noDisadvantage.attack.${actionType}`,
      ...(attackSchool ? [`grants.noDisadvantage.attack.school.${attackSchool}`] : [])
    ]
  };

  // For attacks, the entity that grants advantage/disadvantage is the defender (target)
  const targetToken = options.workflow?.targets?.documents[0];
  const targetActor = targetToken?.actor ?? undefined;

  await computeAdvantageFlags(actor, attackFlags, {
    ...options,
    grantsActor: targetActor,
    grantsToken: targetToken
  }, tracker);

  return tracker;
}
/** The label of dnd5e's combined roll bonus term (its `@ruleBonus` part), which rollBonusSources breaks down. */
export function rollBonusLabel(): string {
  return i18n("midi-qol.AttackTerm.RollBonus");
}

/**
 * dnd5e's attack roll parts (getAttackData: `@mod`, `@prof`, `@bonus`, …) with a label in brackets, which each
 * evaluated term keeps as its flavor. Parts that aren't one of these references are left as they are.
 */
export function labelAttackParts(parts: string[], ability: string | undefined): string[] {
  const labels: Record<string, string | undefined> = {
    mod: ability ? GameSystemConfig.abilities[ability]?.label : undefined,
    prof: i18n("DND5E.Proficiency"),
    bonus: i18n("DND5E.BonusAttack"),
    weaponMagic: i18n("DND5E.MagicalBonus"),
    ammoMagic: i18n("DND5E.ConsumeAmmunition"),
    ruleBonus: rollBonusLabel(),
    situational: i18n("midi-qol.AttackTerm.Situational")
  };
  return parts.map(part => {
    const key = /^@([\w.]+)$/.exec(part)?.[1];
    if (!key) return part;
    const label = key.startsWith("reductions.") ? i18n("DND5E.Exhaustion") : labels[key];
    return label ? `${part}[${label.replace(/[[\]]/g, "")}]` : part;
  });
}

/**
 * The effects behind dnd5e's combined roll bonus for this attack (`@ruleBonus`: the attack roll bonuses for the
 * ability, all attacks and the action type), each with its own value resolved against the actor's data. Only adding
 * changes have a value of their own; an override or custom change is listed without one.
 */
export function rollBonusSources(activity: any, ability: string | undefined, actionType: string | undefined): Array<{ label: string, value?: string, img?: string }> {
  const actor = activity?.actor;
  if (!actor) return [];
  const keys = new Set([
    "system.rolls.attack.bonus",
    ...(actionType ? [`system.rolls.attack.${actionType}.bonus`, `system.bonuses.${actionType}.attack`] : []),
    ...(ability ? [`system.abilities.${ability}.attack.roll.bonus`] : [])
  ]);
  const rollData = actor.getRollData();
  const sources: Array<{ label: string, value?: string, img?: string }> = [];
  for (const effect of actor.allApplicableEffects()) {
    if (!effect.active) continue;
    for (const change of effect.system.changes ?? []) {
      if (!keys.has(change.key)) continue;
      if (change.type !== "add") {
        sources.push({ label: effect.name, img: effect.img ?? undefined });
        continue;
      }
      const resolved = Roll.replaceFormulaData(`${change.value}`.trim(), rollData).replace(/^\+\s*/, "");
      sources.push({ label: effect.name, value: resolved.startsWith("-") ? resolved : `+${resolved}`, img: effect.img ?? undefined });
    }
  }
  return sources;
}

function cardRollAttack(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message?.uuid);

  if (!message || !workflow || (workflow.currentStep && ["midi-qol.Abort", "midi-qol.Completed"].includes(workflow.currentStep ?? ""))) {
    attackAgain(this, workflow, event);
  } else {
    const attackConfig: ActivityUseConfiguration = { workflow };
    attackConfig.midiOptions = workflow?.rollOptions ?? {};
    attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
    workflow.advantage = undefined;
    workflow.disadvantage = undefined;
    attackConfig.midiOptions.advantage = undefined;
    attackConfig.midiOptions.disadvantage = undefined;
    const activity = workflow.activityFor(this);
    // Update targets if user has selected new ones; preserve existing targets otherwise
    // (e.g. template-derived targets, programmatic targetsToUse, or no selection)
    const currentTargets = validTargetTokens(new Set(game.user?.targets));
    if (currentTargets.count > 0) workflow.setTargets(currentTargets);
    // @ts-expect-error
    return activity.rollAttack({ workflow }, {}, {});
  }
}

function cardRollAttackAdvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message?.uuid);
  if (!message || !workflow || (workflow.currentStep && ["midi-qol.Abort", "midi-qol.Completed"].includes(workflow.currentStep ?? ""))) {
    if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
    const attackConfig: any = { event, workflow };
    attackConfig.midiOptions = workflow?.rollOptions ?? {};
    attackConfig.midiOptions.workflowOptions ??= {};
    attackConfig.workflow = workflow;
    if (workflow) {
      attackConfig.midiOptions.workflowOptions ??= {};
      attackConfig.midiOptions.workflowOptions.advantage = true;
      attackConfig.midiOptions.workflowOptions.disadvantage = false;
      attackConfig.midiOptions.workflowOptions.autoRollAttack = true;
    }
    //@ts-expect-error
    this.use(attackConfig, {}, {});
  } else {
    const attackConfig: ActivityUseConfiguration = { workflow };
    attackConfig.midiOptions = workflow?.rollOptions ?? {};
    attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
    // User explicitly chose advantage — set workflowOptions so checkAttackAdvantage processes it
    attackConfig.midiOptions.workflowOptions.advantage = true;
    attackConfig.midiOptions.workflowOptions.disadvantage = false;
    const activity = workflow.activityFor(this);
    // Update targets if user has selected new ones; preserve existing targets otherwise
    const currentTargets = validTargetTokens(new Set(game.user?.targets));
    if (currentTargets.count > 0) workflow.setTargets(currentTargets);
    //@ts-expect-error
    return activity.rollAttack(attackConfig, {}, {});
  }
}

function cardRollAttackDisadvantage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message?.uuid);
  if (!message || !workflow || (workflow.currentStep && ["midi-qol.Abort", "midi-qol.Completed"].includes(workflow.currentStep ?? ""))) {
    if (workflow?.itemCardUuid) Workflow.removeItemCardButtons(workflow.itemCardUuid, { removeAllButtons: true });
    const attackConfig: ActivityUseConfiguration = { event, workflow };
    attackConfig.midiOptions = workflow?.rollOptions ?? {};
    attackConfig.midiOptions.workflowOptions ??= {};
    attackConfig.workflow = workflow;
    if (workflow) {
      attackConfig.midiOptions.workflowOptions ??= {};
      attackConfig.midiOptions.workflowOptions.autoRollAttack = true;
      attackConfig.midiOptions.advantage = false;
      attackConfig.midiOptions.disadvantage = true;
    }
    //@ts-expect-error
    this.use(attackConfig, {}, {});
  } else {
    const attackConfig: any = { workflow };
    attackConfig.midiOptions = workflow?.rollOptions ?? {};
    attackConfig.midiOptions.workflowOptions ??= workflow.workflowOptions ?? {};
    // User explicitly chose disadvantage — set workflowOptions so checkAttackAdvantage processes it
    attackConfig.midiOptions.workflowOptions.advantage = false;
    attackConfig.midiOptions.workflowOptions.disadvantage = true;
    const activity = workflow.activityFor(this);
    // Update targets if user has selected new ones; preserve existing targets otherwise
    const currentTargets = validTargetTokens(new Set(game.user?.targets));
    if (currentTargets.count > 0) workflow.setTargets(currentTargets);
    //@ts-expect-error
    return activity.rollAttack(attackConfig, {}, {});
  }
}

function cardRollDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  // @ts-expect-error
  return activity.rollDamage({ event, workflow, midiOptions: { isCritical: workflow?.workflowOptions?.isCritical || workflow?.isCritical } }, {}, message);
}

function cardRollDamageNoCritical(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  // @ts-expect-error
  return activity.rollDamage({ event, workflow, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
}

function cardRollDamageCritical(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  // @ts-expect-error
  return activity.rollDamage({ event, workflow, midiOptions: { isCritical: true } }, {}, message);
}

