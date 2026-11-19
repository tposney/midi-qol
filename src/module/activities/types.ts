import { attackAgain } from "../rolls/attack.js";
import { registerSheetExtras, type ActivitySheetApp } from "./activitySheets.js";
import type { AnyMutableObject } from "fvtt-types/utils";
import { onActivityTypeAdopted } from "./activityPrototype.js";
import { registerCardActions } from "./cardActions.js";
import { warn, error, GameSystemConfig, i18n, MODULE_ID } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { confirmTargetOptions, ammunitionPerTargetOptions, autoCheckSavesOptions } from "../settings.js";
import { validTargetTokens, speakerFor, getTokenDocument } from "../utils.js";
import { Activity, ActivityUseConfiguration, RollDialogConfig, RollMessageConfig } from "../../globals.js";
import { isMidiActivityType, type MidiActivity } from "./midiActivity.js";
import { preChatChecks, preTargetingChecks } from "./useChecks.js";
import { setCastChecks } from "./useRelaunch.js";
import type { CardActionHandler } from "./cardActions.js";
import type { SheetExtras } from "./activitySheets.js";

/*
 * midi's dnd5e activity types (M14: were one file and one class per type): what each adds to dnd5e's own, in one table.
 * Teleport and Transform, which carry features of their own, are teleport.ts and transform.ts.
 */

/** What each dnd5e activity type midi uses adds: card buttons, sheet extras and any setup of its own */
interface TypeSetup {
  actions?: Record<string, CardActionHandler>;
  sheet?: SheetExtras;
  setup?: () => void;
}

const TYPES: Record<string, TypeSetup> = {
  attack: {
    actions: { rollAttack: cardRollAttack, rollAttackAdvantage: cardRollAttackAdvantage, rollAttackDisadvantage: cardRollAttackDisadvantage,
      rollDamage: cardRollDamage, rollDamageNoCritical: cardRollDamageNoCritical, rollDamageCritical: cardRollDamageCritical },
    sheet: {
      effect: { template: "modules/midi-qol/templates/activity/attack-effect.hbs", templates: ["modules/midi-qol/templates/activity/parts/attack-extras.hbs"] },
      context: attackSheetContext
    },
    // The one sheet wrap (user, 2026-11-20): dnd5e builds the damage parts' type lists while drawing the effect part
    setup: () => globalThis.libWrapper.register(MODULE_ID, "dnd5e.applications.activity.AttackSheet.prototype._prepareEffectContext", healingDamageTypes, "WRAPPER")
  },
  cast: { setup: () => setCastChecks(async (activity, usage, dialog, message) => !isMidiActivityType(activity) || castPreChecks(activity, usage, dialog, message)) },
  check: {
    actions: { rollDamage: cardRollActivityDamage },
    sheet: {
      effect: { template: "modules/midi-qol/templates/activity/check-effect.hbs", templates: [
        "modules/midi-qol/templates/activity/parts/save-extras.hbs", "modules/midi-qol/templates/activity/parts/save-damage.hbs",
        "systems/dnd5e/templates/activity/parts/damage-part.hbs", "systems/dnd5e/templates/activity/parts/damage-parts.hbs"] },
      context: (_app, context) => {
        context.FriendlySaveOptions = friendlySaveOptions();
        context.onSaveOptions = [
          { value: "none", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.None") },
          { value: "half", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Half") },
          { value: "full", label: i18n("DND5E.SAVE.FIELDS.damage.onSave.Full") }
        ];
        context.SaveDisplayOptions = [{ value: "default", label: i18n("Default") },
          ...Object.entries(autoCheckSavesOptions).filter(([value]) => value !== "none").map(([value, label]) => ({ value, label }))];
      }
    }
  },
  damage: { actions: { rollDamage: cardRollActivityDamage } },
  // The effect part is dnd5e's own: midi's copy of the template included a partial dnd5e 6 removed
  enchant: {},
  // Forward has no time or targeting: dnd5e's narrower activation part, which registers only the partials it uses
  forward: { sheet: { keepActivation: true } },
  heal: { actions: { rollHealing: cardRollActivityDamage } },
  save: {
    actions: { rollDamage: cardRollActivityDamage },
    sheet: {
      effect: { template: "modules/midi-qol/templates/activity/save-effect.hbs",
        templates: ["modules/midi-qol/templates/activity/parts/save-extras.hbs", "modules/midi-qol/templates/activity/parts/save-damage.hbs"] },
      classes: ["save-activity", "damage-activity"],
      context: (_app, context) => { context.FriendlySaveOptions = friendlySaveOptions(); }
    }
  },
  summon: {
    // Friendly Summons: a summoned token takes its caster's disposition
    setup: () => {
      //@ts-expect-error
      Hooks.on("dnd5e.summonToken", (activity, profile, tokenData, options) => {
        if (!activity.friendlySummon) return;
        const caster = getTokenDocument(activity.actor);
        if (caster) tokenData.disposition = caster.disposition;
      });
    }
  },
  utility: { actions: { rollFormula: cardRollFormula } }
};

/**
 * midi's additions for its own types, applied as each is adopted (adoption follows the policy: activityPrototype.ts).
 * Card buttons and sheet extras are registered first, so the card-action and sheet installers find them. A type of a
 * module's, or one dnd5e adds later, gets midi's shared additions with no entry here.
 */
export function setupActivityTypes() {
  for (const [type, { actions, sheet }] of Object.entries(TYPES)) {
    if (actions) registerCardActions([type], actions);
    if (sheet) registerSheetExtras(type, sheet);
  }
  onActivityTypeAdopted(type => TYPES[type]?.setup?.());
}

/** Attack's sheet data (was midi's Attack sheet's _prepareEffectContext) */
function attackSheetContext(app: ActivitySheetApp, context: AnyMutableObject) {
  const item = app.item;
  // @ts-expect-error no dnd5e-types
  context.attackModeOptions = item.system.attackModes;
  // @ts-expect-error no dnd5e-types
  context.hasAmmunition = item.system.properties?.has("amm");
  // @ts-expect-error no dnd5e-types
  const ammunitionOptions: { value: string, selected?: boolean }[] = item.system.ammunitionOptions ?? [];
  for (const option of ammunitionOptions) option.selected = option.value === app.activity.ammunition;
  context.ammunitionOptions = ammunitionOptions;
  if (app.activity.otherActivityUuid) {
    ui.notifications?.warn("Please update other activity. otherActivityUuid is deprecated");
    app.activity.otherActivityUuid = undefined;
  }
  context.ConfirmTargetOptions = Object.entries(confirmTargetOptions).map(([value, label]) => ({ value, label }));
  context.AmmunitionPerTargetOptions = Object.entries(ammunitionPerTargetOptions).map(([value, label]) => ({ value, label }));
}

type DamagePartContext = { data?: { types?: Set<string> }, typeOptions?: { value: string, label: string, selected: boolean }[] };

/** The healing types after the damage types in each damage part's type list (dnd5e lists damage types only) */
async function healingDamageTypes(this: unknown, wrapped: (...args: unknown[]) => Promise<{ damageParts?: DamagePartContext[] }>, ...args: unknown[]) {
  const context = await wrapped(...args);
  for (const part of context.damageParts ?? []) {
    const types = part.data?.types instanceof Set ? part.data.types : new Set<string>();
    const healing = Object.entries(GameSystemConfig.healingTypes).map(([value, config]) => ({ value, label: config.label, selected: types.has(value) }));
    part.typeOptions = [...(part.typeOptions ?? []), ...healing];
  }
  return context;
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

/**
 * midi's checks before a Cast activity hands its use to the spell (M14: were an override of Cast's `use`; run from
 * `dnd5e.preUseLinkedSpell` through the restart, useRelaunch.ts): the hooks, macros and reaction/bonus action
 * enforcement of the Cast activity itself, on a temporary workflow. The spell's own workflow then marks the reaction
 * or bonus action as used and skips checking them again. False: the use stops.
 */
export async function castPreChecks(activity: MidiActivity, usage: ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean> {
  if (!activity.item.isEmbedded || !activity.item.isOwner || !activity.canUse) return true;
  usage.midiOptions ??= {};
  usage.midiOptions.workflowOptions ??= {};
  usage.midiOptions.proceedChecks ??= {};
  const speaker = speakerFor({ actor: activity.item.actor });
  const tempWorkflow = new Workflow(activity.actor ?? null, activity, speaker, null, { storeWorkflow: false });
  usage.workflow = tempWorkflow;
  try {
    if (!await preTargetingChecks(activity, usage, dialog, message)) return false;
    // Spell component checks are the spell's, not the Cast activity's
    if (!await preChatChecks(activity, usage, dialog, message, { checkComponents: false })) return false;
    usage.midiOptions.proceedChecks.checkReaction = false;
    usage.midiOptions.proceedChecks.checkBonusAction = false;
    usage.midiOptions.workflowOptions.castUsesReaction = tempWorkflow.itemUsesReaction;
    usage.midiOptions.workflowOptions.castUsesBonusAction = tempWorkflow.itemUsesBonusAction;
    return true;
  } finally {
    Workflow.removeWorkflow(tempWorkflow.id);
    delete usage.workflow;
  }
}

/** The friendly-save choices on Save's and Check's sheets */
const friendlySaveOptions = () => [
  { value: "default", label: i18n("midi-qol.SAVE.friendlySave.default") },
  { value: "friendlySuccess", label: i18n("midi-qol.SAVE.friendlySave.friendlySuccess") },
  { value: "friendlyFail", label: i18n("midi-qol.SAVE.friendlySave.friendlyFail") },
];

/** The damage (or healing) button of a type with no attack: the use waiting for it rolls, else dnd5e's roll */
function cardRollActivityDamage(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow }, {}, {});
}

function cardRollFormula(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message?.uuid);
  const activity = workflow ? workflow.activityFor(this) : this;

  return activity.rollFormula?.({ event, workflow }, {}, {});
}
