import { MidiActivity, isMidiActivityType } from "./midiActivity.js";
import { queryUser } from "../lib/midiQueries.js";
import { registerCardAction, registerCardActions } from "./cardActions.js";
import { cardOtherConsumption } from "../lib/cardState.js";
import { Activity, ActivityEffectData, MidiUsageChatContext } from "../../globals.js";
import { MODULE_ID, debugEnabled, error, i18n, i18nFormat, warn } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { runFollowUp } from "../followUps.js";
import { configSettings } from "../settings.js";
import { getAutoRollAttack, getAutoRollDamage, getRemoveAttackButtons, getRemoveDamageButtons, HEALING_BUTTON_KEY, getConsumptionData } from "../utils.js";

/*
 * midi's part of a use card: its data at creation (dnd5e's usage message hooks), the buttons shared by every activity type, and the confirm-before-damage step.
 * (M14: from MidiActivityMixin.ts, midi's activity class layer until then.)
 */

export function setupUsageCard() {
  registerUsageMessageHooks();
  registerCardActions(undefined, {
    placeTemplate: cardPlaceTemplate,
    rollDamage: cardRollDamage,
    rollDamageNoCritical: cardRollDamageNoCritical,
    rollDamageCritical: cardRollDamageCritical,
    confirmDamageRollCancel: cardConfirmDamageRollCancel,
    confirmDamageRollComplete: cardConfirmDamageRollComplete,
    confirmDamageRollCompleteHit: cardConfirmDamageRollCompleteHit,
    confirmDamageRollCompleteMiss: cardConfirmDamageRollCompleteMiss,
    midiApplyEffects: cardApplyEffects,
    midiFollowUp: cardFollowUp,
    refundOtherActivity: cardRefundOtherActivity,
    consumeOtherActivity: cardConsumeOtherActivity
  });
  // Only where the activity type has no handler of its own: save and check activities keep theirs.
  registerCardAction("rollSave", cardRollOtherSave, { whenAbsent: true });
  registerCardAction("rollCheck", cardRollOtherSave, { whenAbsent: true });
}

/**
 * Handle the "Place Template" button click from the chat card.
 * Places all templates sequentially and delegates to workflow for validation and processing.
 */
export async function cardPlaceTemplate(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  // `TemplatePlacement.fromActivity` runs the placement UI and creates the Regions itself,
  // returning them; the deprecated `AbilityTemplate` preview/draw dance is gone.
  let templates: MeasuredTemplateDocument[] = [];
  try {
    const created = await globalThis.dnd5e.canvas.TemplatePlacement.fromActivity(this);
    if (created?.length) templates = created as unknown as MeasuredTemplateDocument[];
  } catch (err) {
    // User cancelled during placement — fall through to validation
  }

  // Find workflow and process (handles count validation, deletion if incomplete)
  const workflow = Workflow.findWorkflow(message.uuid);
  if (!workflow) {
    warn("MidiActivityMixin | #placeTemplate | No workflow found for message", message.uuid);
    return;
  }

  // processPlacedTemplates handles validation, cleanup, and workflow advancement
  await workflow.processPlacedTemplates(templates, this);
}

export function cardRollDamage(this: Activity, event, target, message) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow, midiOptions: { isCritical: workflow?.workflowOptions?.isCritical || workflow?.isCritical } }, {}, message);
}

export function cardRollDamageNoCritical(this: Activity, event, target, message) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow, critical: { allow: false }, midiOptions: { isCritical: false } }, {}, message);
}

export function cardRollDamageCritical(this: Activity, event, target, message) {
  const workflow = Workflow.forDamageButton(message);
  if (workflow === false) return;
  const activity = workflow && !workflow.readOnly ? workflow.activityFor(this) : this;
  return activity.rollDamage({ event, workflow, critical: { allow: true }, midiOptions: { isCritical: true } }, {}, message);
}

export async function cardConfirmDamageRollCancel(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflowId = message.uuid;
  const authorId = message.author?.id;
  if (!authorId || !workflowId) return;
  if (!game.user?.isGM && configSettings.confirmAttackDamage === "gmOnly") {
    return;
  }
  /* TODO Since workflows are available locally we can use them to cancel the workflow without a socket call
    const workflow = Workflow.findWorkflow(workflowId);
    if (workflow) cancelWorkflow(workflowId);
  */
  const user = game.users?.get(authorId);
  if (user?.active) {
    await queryUser(game.users?.get(authorId ?? ""), "cancelWorkflow", { workflowId, itemCardUuid: message.uuid }).then(result => {
      if (typeof result === "string") ui.notifications?.warn(result);
    });
  } else {
    await Workflow.removeItemCardButtons(message.uuid, { removeAllButtons: true });
  }
}

/** The activity's own confirmation step (midi's activities) */
export async function confirmOnCard(activity: Activity, action: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  if (isMidiActivityType(activity)) await doConfirmation(activity, action, event, target, message);
}

export async function cardConfirmDamageRollComplete(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  await confirmOnCard(this, "confirmDamageRollComplete", event, target, message);
}

export async function cardConfirmDamageRollCompleteHit(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  await confirmOnCard(this, "confirmDamageRollCompleteHit", event, target, message);
}

export async function cardConfirmDamageRollCompleteMiss(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  await confirmOnCard(this, "confirmDamageRollCompleteMiss", event, target, message);
}

export async function cardApplyEffects(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message.uuid);
  if (workflow) workflow.activityFor(this);
  if (!workflow) {
    const errMessage = "MidiQOL | MidiActivity | applyEffects | No workflow found";
    error(errMessage);
    TroubleShooter.recordError(new Error("No workflow found"), errMessage);
    return;
  }
  const authorId = message.author?.id;
  if (game.user?.id !== authorId) {
    // applying effects on behalf of another user;
    if (!game.user?.isGM) {
      ui.notifications?.warn("Only the GM can apply effects for other players")
      return;
    }
    if (game.user?.targets.size === 0) {
      ui.notifications?.warn(i18n("midi-qol.noTargets"));
      return;
    }
    await queryUser(game.users?.get(authorId ?? ""), "applyEffects", {
      workflowId: message.uuid,
      targets: Array.from(game.user?.targets).map(t => t.document.uuid)
    });
  } else {
    // Forced: effects go to the use's targets; the user's only confirm the request
    workflow.forceApplyEffects = true;
    if (game.user?.targets.size) await workflow.performState("midi-qol.ApplyDynamicEffects")
  }
}

export async function cardFollowUp(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const index = Number(target.dataset.followUp);
  if (Number.isInteger(index)) await runFollowUp(message, index);
}

export async function cardRefundOtherActivity(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  // Get the other activity from the associated activity on the message
  //@ts-expect-error no dnd5e types
  const activity = message.getAssociatedActivity?.() as Activity | undefined;
  const otherActivity = activity?.otherActivity;
  if (!otherActivity) return;

  // What the other activity's use consumed (mirrors dnd5e's structure)
  const { consumed } = cardOtherConsumption(message);
  if (!consumed || foundry.utils.isEmpty(consumed)) return;
  await otherActivity.refund(consumed);
  // Nothing consumed now: the refund button goes (shouldHideChatButton)
  await message.update({ "system.midi.state.otherConsumed": null } as ChatMessage.UpdateData);
  // A card made before 14.6.9 kept it in its flags
  if (message.flags[MODULE_ID]?.use?.consumed) await message.update({ [`flags.${MODULE_ID}.use.consumed`]: null } as ChatMessage.UpdateData);
}

export async function cardConsumeOtherActivity(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  // Get the other activity from the associated activity on the message
  //@ts-expect-error no dnd5e types
  const activity = message.getAssociatedActivity?.() as Activity | undefined;
  const otherActivity = activity?.otherActivity;
  if (!otherActivity) return;

  // Prepare usage config for consumption
  const otherUsageConfig = otherActivity._prepareUsageConfig({
    consume: { resources: true, spellSlot: false, action: false }
  });

  // Check if consumption would succeed
  const consumptionCheck = await otherActivity._prepareUsageUpdates(otherUsageConfig, { returnErrors: true });
  if (Array.isArray(consumptionCheck) && consumptionCheck.length > 0) {
    // Consumption would fail - show warning
    ui.notifications?.warn(i18nFormat("midi-qol.otherActivityConsumptionFailed", {
      actorName: otherActivity.actor?.name ?? "Unknown",
      itemName: otherActivity.item?.name ?? "Unknown",
      activityName: otherActivity.name ?? "Unknown"
    }));
    return;
  }

  // Consume resources
  const messageConfig: any = { data: {} };
  const consumeResult = await otherActivity.consume(otherUsageConfig, messageConfig);
  if (consumeResult === false) {
    // Consumption was cancelled by a hook
    return;
  }

  // Get consumed delta data from messageConfig (not return value)
  const consumed = getConsumptionData(messageConfig);

  // Recorded on the card: the consume button goes and the refund button shows (shouldHideChatButton)
  if (consumed) await message.update({ "system.midi.state.otherConsumed": consumed, "system.midi.state.otherDeclined": null } as ChatMessage.UpdateData);
}

/** A save or check button for another activity's save, on this activity's card: that activity rolls it. */
export async function cardRollOtherSave(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  const workflow = Workflow.findWorkflow(message.uuid);
  const source: Activity | undefined = workflow?.otherSaveActivity ?? (this.otherSaveSource as Activity | undefined);
  // @ts-expect-error no dnd5e-types
  const action = target.dataset.action ?? message.system.getButton(target)?.action;
  const handler = source?.metadata?.usage?.actions?.[action];
  if (!source || source === this || !handler) return;
  // A save activity's handler adopts the card's workflow as its own; this card's workflow stays this activity's.
  const activity = workflow?.activity;
  try {
    return await handler.call(source, event, target, message);
  } finally {
    if (workflow && activity) workflow.activity = activity;
  }
}

/**
 * midi's part of a use card's creation, on dnd5e's hooks (M14; was an override of `_createUsageMessage`).
 * Before: the card's rendering decisions, settled into its system data. They depend on the workflow, which exists now
 * and is gone by the time the card is drawn again after a reload, so they are decided once and stored
 * (`MidiUsageMessageData` reads them back); `midiUsageContext` works them out. A use started from inside another of the
 * actor's workflows is linked to its card, as dnd5e links saves.
 * After: the use's workflow is its card's from now on, filed under the card's uuid before dnd5e places the use's
 * templates and calls postUseActivity (not only when use() returns).
 */
/** An activity of a type midi uses: it works out its card's context */
export type UsageCardActivity = Activity & { midiUsageContext?: (message: unknown) => MidiUsageChatContext };

export function registerUsageMessageHooks() {
  Hooks.on("dnd5e.preCreateUsageMessage", (activity: UsageCardActivity, messageConfig: { data?: Record<string, unknown> }) => {
    if (!isMidiActivityType(activity)) return;
    try {
      const context = midiUsageContext(activity, messageConfig);
      // Only what is set: the schema reads an absent flag as false, absent displayProperties as true
      const flags = ["hasAttack", "hasDamage", "hasEffects", "condensed", "mergeCardMulti",
        "confirmAttackDamage", "hideItemDetails"] as const;
      const midi: Record<string, unknown> = Object.fromEntries(flags.filter(key => context[key]).map(key => [key, true]));
      if (!context.displayProperties) midi.displayProperties = false;
      if (context.dmgBtnText) midi.dmgBtnText = context.dmgBtnText;
      const origin = activity.actor ? Workflow.executingCardFor(activity.actor)?.id ?? null : null;
      messageConfig.data ??= {};
      foundry.utils.mergeObject(messageConfig.data, { system: { midi, ...(origin ? { origin } : {}) } });
    } catch (err) {
      // A card that cannot describe itself is still better than no card at all
      console.error(`${MODULE_ID} | could not record usage card state`, err);
    }
  });
  Hooks.on("dnd5e.postCreateUsageMessage", (activity: Activity, card: ChatMessage.Implementation | object) => {
    const workflow = Workflow.workflowFor(activity);
    if (!(card instanceof ChatMessage) || !workflow || workflow.itemCardUuid) return;
    workflow.itemCardUuid = card.uuid;
    workflow.id = card.uuid;
    Workflow.addWorkflow(workflow);
  });
}

export async function doConfirmation(activity: MidiActivity, actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
  if (!game.user?.isGM && configSettings.confirmAttackDamage === "gmOnly") {
    return;
  }
  if (message.author?.active) {
    const result = await queryUser(message.author, actionToCall, { workflowId: message.uuid, activityUuid: activity.uuid, itemCardUuid: message.uuid });
    if (typeof result === "string") ui.notifications?.warn(result);
  } else {
    await Workflow.removeItemCardButtons(message.uuid, { removeConfirmButtons: true });
  }
}

/** midi's additions to the usage context; not named `_usageChatContext`, which would keep dnd5e's legacy content path. */
export function midiUsageContext(activity: MidiActivity, message) {
  const workflow = Workflow.workflowFor(activity);
  let systemCard = message.systemCard ?? false;
  const minimalCard = false;

  // An emanation is placed once the card exists, by the PlaceEmanation step (M14 D1)
  if (debugEnabled > 0) warn("show item card ", activity, activity.actor, activity.actor?.token, systemCard, workflow);
  let needAttackButton = !getRemoveAttackButtons(activity) || configSettings.mergeCardMulti
    || configSettings.confirmAttackDamage !== "none" ||
    !(workflow?.someAutoRollEventKeySet() && !getAutoRollAttack(workflow));
  const needDamageButton = (activity.hasDamage || activity.hasHealing) && (
    (["none", "saveOnly"].includes(getAutoRollDamage(workflow)) || workflow?.rollOptions.rollToggle)
    || configSettings.confirmAttackDamage !== "none"
    || !getRemoveDamageButtons(activity)
    || systemCard
    || configSettings.mergeCardMulti);
  // not used const sceneId = token?.scene && token.scene.id || canvas.scene?.id;
  const isPlayerOwned = activity.item.actor?.hasPlayerOwner;
  const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
    || !configSettings.itemTypeList?.includes(activity.item.type);
  // Are there any potential effects to apply
  // Read without waiting (the card's creation hook is synchronous): a compendium effect not loaded is its index entry,
  // counted as an effect to apply
  const effects = workflow?.workflowType === "BaseWorkflow"
    ? ((activity.effects ?? []) as (ActivityEffectData & { uuid?: string, _id?: string })[]).map(profile => profile.uuid
      ? fromUuidSync(profile.uuid, { strict: false }) as ActiveEffect.Implementation | null
      : activity.item.effects.get(profile._id ?? "")) : [];
  let hasEffects = effects.some(effect => effect && !effect.transfer && !effect.flags?.dae?.dontApply);
  // if target type is not blank or there are targets only set hasEffects if we are not going to remove the button later
  if (activity.target?.affects.type !== "" || workflow?.targets.count !== 0)
    hasEffects &&= !["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects);
  let dmgBtnText = (activity.actionType === "heal") ? i18n(HEALING_BUTTON_KEY) : i18n("DND5E.Damage");
  if (workflow?.workflowOptions?.fastForwardDamage && configSettings.showFastForward) dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;

  const midiContextData: MidiUsageChatContext = {
    labels: activity.labels,
    //@ ts-expect-error TODO needed for abilities translation
    // config: game.system.config,
    condensed: configSettings.mergeCardCondensed && !!activity.attack,
    hasAttack: !!activity.attack && !minimalCard && (systemCard || needAttackButton || configSettings.confirmAttackDamage !== "none"),
    // @ts-expect-error no dnd5e-types
    isHealing: !minimalCard && activity.item.isHealing && (systemCard || configSettings.autoRollDamage !== "always"),
    hasDamage: needDamageButton,
    configSettings,
    hideItemDetails,
    dmgBtnText,
    hasEffects,
    effects: activity.item.effects,
    isMerge: true,
    mergeCardMulti: configSettings.mergeCardMulti && !!(activity.attack || activity.hasDamage),
    confirmAttackDamage: configSettings.confirmAttackDamage !== "none" && !!(activity.attack || activity.hasDamage),
    RequiredMaterials: i18n("DND5E.RequiredMaterials"),
    Attack: i18n("DND5E.Attack"),
    OtherFormula: i18n("DND5E.OtherFormula"),
    displayProperties: configSettings.displayProperties,
    canCancel: configSettings.undoWorkflow, // TODO enable activity when more testing done.
  };
  // Attack and Utility had their own versions (M14): an attack card always has its attack, a utility card its formula
  if (activity.type === "attack") midiContextData.hasAttack = !!activity.attack;
  if (activity.type === "utility") midiContextData.hasRollFormula = true;
  // dnd5e 6 draws the card from its data (MidiUsageMessageData), so only these decisions are kept
  return midiContextData;
}
