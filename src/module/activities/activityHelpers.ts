import { Activity, ActivityUseConfiguration, RollMessageConfig, TokenOrDocument } from "../../globals.js";
import { MODULE_ID, debugEnabled, warn, error } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TargetConfirmationDialog, TargetConfirmationOptions } from "../apps/TargetConfirmation.js";
import { configSettings, safeGetGameSetting, targetConfirmation } from "../settings.js";
import { installedModules } from "../setupModules.js";
import { getFlankingEffect, CERemoveEffect, sumRolls, evalActivationCondition, computeTemplateShapeDistance, getToken, checkActivityRange, checkDefeated, checkIncapacitated, computeCoverBonus, getSpeaker, hasWallBlockingCondition, isValidTarget, tokenForActor, activityHasAreaTarget, activityHasAutoPlaceTemplate, activityHasEmanationNoTemplate, getActivityAutoTargetAction, getAoETargetType, doReactions, getUnitDist, updateUserTargets, MidiOptions } from "../utils.js";
import { allAttackTypes } from "../../midi-qol.js";
const { DialogV2 } = foundry.applications.api;
import Token = foundry.canvas.placeables.Token;

// Target types that represent discrete creatures (not areas)
const creatureTargetTypes = ["creature", "enemy", "ally", "willing"];

/**
 * Determines if the enforceSingleWeaponTarget setting should apply to this activity.
 * Returns false for emanation/AoE activities that naturally target multiple creatures.
 * @param activity The activity to check
 * @returns true if single target should be enforced
 */
export function shouldEnforceSingleTarget(activity: Activity): boolean {
  if (!configSettings.enforceSingleWeaponTarget) return false;
  if (!allAttackTypes.includes(activity.actionType)) return false;

  // Don't enforce for emanation or AoE targeting - these naturally target multiple creatures
  const isEmanationTargeting = activityHasAutoPlaceTemplate(activity) || activityHasEmanationNoTemplate(activity);
  const isAoETargeting = !isEmanationTargeting && activityHasAreaTarget(activity);
  if (isEmanationTargeting || isAoETargeting) return false;

  // If an explicit target count is set, respect it instead of enforcing single target
  const hasExplicitCount = activity.target?.affects?.count && activity.target.affects.count !== "";
  if (hasExplicitCount) return false;

  // Only enforce for creature-like target types
  return creatureTargetTypes.includes(activity.target?.affects?.type);
}

export async function confirmWorkflow(existingWorkflow: Workflow): Promise<boolean> {
  const validStates = [existingWorkflow.WorkflowState_Completed, existingWorkflow.WorkflowState_Start, existingWorkflow.WorkflowState_RollFinished]
  if (existingWorkflow.currentAction === existingWorkflow.WorkflowState_NoAction) return true;
  if (!(validStates.includes(existingWorkflow.currentAction!))) {// && configSettings.confirmAttackDamage !== "none") {
    if (configSettings.autoCompleteWorkflow) {
      existingWorkflow.aborted = true;
      await existingWorkflow.performState(existingWorkflow.WorkflowState_Cleanup);
      await Workflow.removeWorkflow(existingWorkflow.id);
    } else if (existingWorkflow.currentAction === existingWorkflow.WorkflowState_WaitForDamageRoll && existingWorkflow.hitTargets.size === 0) {
      existingWorkflow.aborted = true;
      await existingWorkflow.performState(existingWorkflow.WorkflowState_Cleanup);
    } else {
      switch (await DialogV2.wait({
        window: { title: game.i18n?.format("midi-qol.WaitingForPreviousWorkflow", { name: existingWorkflow.activity.name ?? "" }) },
        content: game.i18n?.localize("midi-qol.ResolvePreviousWorkflow"),
        rejectClose: false,
        close: () => { return false },
        buttons: [
          { action: "complete", label: `<i class="fas fa-check"></i> Complete previous`, callback: () => { return "complete" } },
          { action: "discard", label: `<i class="fas fa-trash"></i> Discard previous`, callback: () => { return "discard" } },
          { action: "undo", label: `<i class="fas fa-arrow-rotate-left"></i> Undo until previous`, callback: () => { return "undo" } },
          { action: "cancel", default: true, label: `<i class="fas fa-xmark"></i> Cancel New`, callback: () => { return "cancel" } }
        ],
      })) {
        case "complete":
          await existingWorkflow.performState(existingWorkflow.WorkflowState_Cleanup);
          await Workflow.removeWorkflow(existingWorkflow.id);
          break;
        case "discard":
          await existingWorkflow.performState(existingWorkflow.WorkflowState_Abort);
          Workflow.removeWorkflow(existingWorkflow.id);
          break;
        case "undo":
          await existingWorkflow.performState(existingWorkflow.WorkflowState_Cancel);
          Workflow.removeWorkflow(existingWorkflow.id);
          break;
        case "cancel":
        default:
          return false;
      }
    }
  }
  return true;
}
export async function removeFlanking(actor: Actor.Implementation): Promise<void> {
  let CEFlanking = getFlankingEffect();
  if (CEFlanking && CEFlanking.name) await CERemoveEffect({ effectName: CEFlanking.name, uuid: actor.uuid });
}

//
export function setDamageRollMinTerms(rolls?: Roll[]) {
  if (rolls && sumRolls(rolls)) {
    for (let roll of rolls) {
      for (let term of roll.terms) {
        // I don't like the default display and it does not look good for dice so nice - fiddle the results for maximised rolls
        if (term instanceof foundry.dice.terms.Die && term.modifiers.includes(`min${term.faces}`)) {
          for (let result of term.results) {
            result.result = term.faces ?? 1;
          }
        }
      }
    }
  }
}

export async function doActivityReactions(activity: Activity, workflow: Workflow) {
  const promises: Promise<{
    name?: string;
    uuid?: string;
    ac?: number;
  }>[] = [];
  if (!foundry.utils.getProperty(activity, `flags.${MODULE_ID}.noProvokeReaction`) && !workflow?.workflowOptions.noProvokeReaction) {
    for (let targetToken of workflow.targets) {
      promises.push(new Promise(async resolve => {
        const result = await doReactions(targetToken, workflow.tokenUuid, null, "reactionpreattack", { item: this, workflow, workflowOptions: foundry.utils.mergeObject(workflow.workflowOptions, { sourceActorUuid: activity.actor?.uuid, sourceItemUuid: this?.uuid }, { inplace: false, overwrite: true }) });
        if (result.name) {
          targetToken.actor?.reset();
          workflow.actor.reset();
          // targetToken.actor?.prepareData(); // allow for any items applied to the actor - like shield spell
        }
        resolve(result);
      }));
    }
  }
  return await Promise.all(promises);
}

export function preActivityConsumptionHook(activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig): boolean {
  // console.error("preActivityConsumptionHook", activity, usageConfig, messageConfig);
  return true;
}

export function activityConsumptionHook(activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig, updates: unknown): boolean {
  // console.error("activityConsumptionHook", activity, usageConfig, messageConfig, updates);
  return true;
}

/**
 * Check if an activity's target count is a formula (not a plain number or blank).
 * By the time this runs, prepareFinalData has already evaluated the formula to a number,
 * so we check the raw _source data for the original formula string.
 * If activity.target.override is true, the formula lives on the activity;
 * otherwise it's inherited from the item via _setOverride.
 * A formula-based count means the target count may change with scaling or other roll data,
 * so target confirmation should be deferred until after the consumption dialog.
 */
export function activityHasScaledTargetCount(activity: Activity): boolean {
  // @ts-expect-error no dnd5e-types - override is added by dnd5e's _setOverride, _source is raw DataModel source
  const sourceCount = activity.target?.override
    // @ts-expect-error no dnd5e-types
    ? activity._source?.target?.affects?.count
    // @ts-expect-error no dnd5e-types
    : activity.item?.system?._source?.target?.affects?.count;
  // Blank or missing means no explicit count (infinite targets) — not scaled.
  // A plain numeric string like "3" is already resolved — not scaled.
  // Anything else is a formula that may depend on roll data — treat as scaled.
  if (typeof sourceCount !== "string" || sourceCount === "") return false;
  return /[^0-9.]/.test(sourceCount);
}

function activityRequiresPostTemplateConfirmation(activity: Activity): boolean {
  // const isRangeTargeting = ["ft", "m"].includes(activity.range?.units) && ["creature", "ally", "enemy"].includes(activity.target?.affects.type);
  if (activity.target?.template?.type) {
    return true;
    //  } else if (isRangeTargeting) {
    //    return true;
  }
  if (activityHasScaledTargetCount(activity)) return true;
  return false;
}

function itemRequiresPostTemplateConfirmation(activity: Activity): boolean {
  // @ts-expect-error no dnd5e-types
  const isRangeTargeting = ["ft", "m"].includes(activity.item.system.range?.units) && ["creature", "ally", "enemy"].includes(activity.target?.affects.type);
  if (activity.target?.template?.type) {
    return true;
  } else if (isRangeTargeting) {
    return true;
  }
  return false;
}

export function requiresTargetConfirmation(activity: Activity, options: MidiOptions): boolean {
  // if (!activity.item) debugger;
  // fix for very silly value choice in midi properties.
  if (["none", "never"].includes(options.workflowOptions?.targetConfirmation ?? "")) return false;
  if (options.workflowOptions?.targetConfirmation === "always") return true;
  if (["enchant", "summon"].includes(activity.type)) return false;
  if (activity.target?.affects?.choice) return true;
  if (["", "self", undefined].includes(activity.target?.affects?.type) && ["", undefined, "self"].includes(activity.range?.units)) return false;
  if (activity.target?.affects.type === "self") return false;
  if (options.workflowOptions?.attackPerTarget === true) return false;
  if ((activity.forcedTargetConfirmation ?? activity.midiProperties?.confirmTargets) === "always") return true;
  if ((activity.forcedTargetConfirmation ?? activity.midiProperties?.confirmTargets) === "never") return false;
  if (targetConfirmation.noneTargeted && ((activity.target?.affects.type ?? "") !== "" || activity.attack) && (game.user?.targets?.size ?? 0) === 0)
    return true;
  let numTargets = game.user?.targets?.size ?? 0;
  // @ts-expect-error no dnd5e-types
  if (numTargets === 0 && activity.item.type === "weapon" && shouldEnforceSingleTarget(activity))
    numTargets = 1;
  const token = tokenForActor(activity.actor);
  if (targetConfirmation.enabled) {
    if (targetConfirmation.always && (activity.target?.affects.type ?? "") !== "self") {
      if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.always");
      return true;
    }
    if (activity.attack && targetConfirmation.hasAttack) {
      if (debugEnabled > 0) warn("target confirmation triggered by targetConfirmation.hasAttack");
      return true;
    }
    if (activity.target?.affects.type === "creature" && targetConfirmation.hasCreatureTarget) {
      if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.hasCreatureTarget");
      return true;
    }
    if (targetConfirmation.noneTargeted && ((activity.target?.affects.type ?? "") !== "" || activity.attack) && numTargets === 0) {
      if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.noneTargeted");
      return true;
    }
    if (targetConfirmation.allies && token && numTargets > 0 && activity.target?.affects.type !== "self") {
      if (game.user?.targets.some(t => t.document.disposition == token.document.disposition)) {
        if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.allies");
        return true;
      }
    }
    if (targetConfirmation.targetSelf && activity.target?.affects.type !== "self") {
      let tokenToUse = token;
      /*
      if (tokenToUse && game.user?.targets) {
        const { result, attackingToken } = checkActivityRange(activity, tokenToUse, new Set(game.user?.targets))
        if (speaker.token && result === "fail")
          tokenToUse = undefined; 
        else tokenToUse = attackingToken;
      }
      */
      if (tokenToUse && game.user?.targets?.has(tokenToUse)) {
        if (debugEnabled > 0) warn("target confirmation triggered by has targetConfirmation.targetSelf");
        return true;
      }
    }
    if (targetConfirmation.mixedDisposition && numTargets > 0 && game.user?.targets) {
      const dispositions = new Set();
      for (let target of game.user?.targets) {
        if (target) dispositions.add(target.document.disposition);
      }
      if (dispositions.size > 1) {
        if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.mixedDisposition");
        return true;
      }
    }
    if (targetConfirmation.longRange && game.user?.targets && numTargets > 0 &&
      // @ts-expect-error no dnd5e-types
      (["ft", "m"].includes(activity.item.system.range?.units) || activity.item.system.range?.type === "touch")) {
      if (token) {
        for (let target of game.user?.targets) {
          const { result, attackingToken } = checkActivityRange(activity, token, new Set([target]))
          if (result !== "normal") {
            if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.longRange");
            return true;
          }
        }
      }
    }
    if (targetConfirmation.inCover && numTargets > 0 && token && game.user?.targets) {
      const isRangeTargeting = ["ft", "m"].includes(activity.range?.units ?? "") && ["creature", "ally", "enemy"].includes(activity.target?.affects?.type ?? "");
      if (!activity.target?.template?.type && !isRangeTargeting && token) {
        for (let target of game.user?.targets) {
          if (computeCoverBonus(token, target, activity) > 0) {
            if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.inCover");
            return true;
          }
        }
      }
    }
    const isRangeTargeting = ["ft", "m"].includes(activity.range?.units ?? "") && ["creature", "ally", "enemy"].includes(activity.target?.affects.type ?? "");
    if (activity.target?.template?.type && (targetConfirmation.hasAoE)) {
      if (debugEnabled > 0) warn("target confirmation triggered by targetConfirmation.hasAoE")
      return true;
    } else if (isRangeTargeting && (targetConfirmation.hasRangedAoE)) {
      if (debugEnabled > 0) warn("target confirmation triggered by has targetConfirmation.hasRangedAoE");
      return true;
    }
  }
  return false;
}

export async function preTemplateTargets(activity: Activity, options: MidiOptions): Promise<boolean> {
  if (activityRequiresPostTemplateConfirmation(activity)) return true;
  if (requiresTargetConfirmation(activity, options))
    return await resolveTargetConfirmation(activity, options) === true;
  return true;
}

export async function postTemplateConfirmTargets(activity: Activity, options: MidiOptions, workflow: Workflow): Promise<boolean> {
  const updateTargets = async () => {
    const needCanSeeSense = game.user?.targets && !workflow.targets.equals(new Set(game.user?.targets));
    workflow.setTargets(new Set(game.user?.targets));
    if (needCanSeeSense) await workflow.activity.setupCanSeeSense({ workflow });
  }
  // Only show confirmation here if the activity deferred from pre-template
  // (i.e. it has a template or scaled target count). Otherwise preTemplateTargets
  // already handled confirmation and we just need to sync targets.
  if (activityRequiresPostTemplateConfirmation(activity) && requiresTargetConfirmation(activity, options)) {
    const result = await resolveTargetConfirmation(activity, options);
    if (result && game.user?.targets) {
      await updateTargets();
    }
    return result === true;
  }
  // Only sync targets from game.user.targets when the activity has a template or
  // scaled target count — these need post-template syncing because dnd5e auto-targets
  // tokens inside the template. For non-template activities, targets were already set
  // in setupTargets and must not be overwritten from game.user.targets (which may have
  // been changed by concurrent effects during the async workflow state transitions).
  if (activityRequiresPostTemplateConfirmation(activity) && game.user?.targets) {
    await updateTargets();
  }
  return true;
}

export async function resolveTargetConfirmation(activity: Activity, options: TargetConfirmationOptions = {}): Promise<boolean> {
  if (!canvas.tokens?.active) {
    await canvas.tokens?.activate();
  }
  // TODO looks like fvtt-types is broken for scene controls
  const uiControls = ui.controls as any;
  const savedControl = uiControls?.control;
  const savedTool = uiControls?.tool;
  const tokenControl = uiControls?.controls.tokens;
  const tokenTargetTool = tokenControl?.tools?.target;
  await uiControls?.activate({ control: tokenControl.name, tool: tokenTargetTool.name });
  const wasMaximized = !((activity.actor?.sheet as foundry.applications.api.ApplicationV2)?.minimized);
  // Hide the sheet that originated the preview
  if (wasMaximized) await activity.actor?.sheet?.minimize();

  let targets = new Promise((resolve, reject) => {
    // no timeout since there is a dialog to close
    // create target dialog which updates the target display
    options ??= {};
    options.callback = resolve;
    new TargetConfirmationDialog(activity.actor!, activity, game.user!, options).render({ force: true });
  });
  let shouldContinue = await targets;
  for (let token of canvas.tokens?.placeables ?? []) token.initializeVisionSource();
  if (savedTool) await ui.controls?.activate({ control: savedControl.name, tool: savedTool.name });


  if (wasMaximized) await activity.actor?.sheet?.maximize();
  return !!shouldContinue;
}

export async function showItemInfo(this: Item.Implementation): Promise<ChatMessage.Implementation | undefined> {
  const token = this.actor?.token;

  const templateData = {
    actor: this.actor,
    // tokenId: token?.id,
    tokenId: token?.uuid,
    tokenUuid: token?.uuid,
    item: this,
    itemUuid: this.uuid,
    // @ts-expect-error no dnd5e-types
    data: await this.system.getCardData(),
    // @ts-expect-error no dnd5e-types
    labels: this.labels,
    condensed: false,
    hasAttack: false,
    isHealing: false,
    hasDamage: false,
    // @ts-expect-error no dnd5e-types
    isSpell: this.type === "spell",
    isPower: false,
    hasSave: false,
    hasAreaTarget: false,
    hasAttackRoll: false,
    configSettings,
    hideItemDetails: false,
    hasEffects: false,
    isMerge: false,
  };

  const templateType = ["tool"].includes(this.type) ? this.type : "item";
  const template = `modules/midi-qol/templates/${templateType}-card.hbs`;
  const html = await foundry.applications.handlebars.renderTemplate(template, templateData);

  const chatData: ChatMessage.CreateData = {
    content: html,
    // @ts-expect-error no dnd5e-types
    flavor: this.system.chatFlavor || this.name,
    speaker: getSpeaker(this.actor!),
    flags: {
      "core": { "canPopout": true }
    }
  };
  chatData.style = CONST.CHAT_MESSAGE_STYLES.OTHER;

  // Toggle default roll mode
  let rollMode = safeGetGameSetting("core", "rollMode") ?? "public";
  if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
  if (rollMode === "blindroll") chatData["blind"] = true;
  if (rollMode === "selfroll") chatData["whisper"] = [game.user?.id];

  // Create the chat message
  return ChatMessage.create(chatData);
}

function isTokenInside(template: foundry.canvas.placeables.MeasuredTemplate.Implementation, token: Token.Implementation, wallsBlockTargeting: boolean): boolean {
  const grid = canvas.scene?.grid;
  if (!grid) return false;
  const templatePos = { x: template.document.x, y: template.document.y };
  if (configSettings.optionalRules.wallsBlockRange !== "none" && hasWallBlockingCondition(token))
    return false;
  if (!isValidTarget(token)) return false;

  // TODO: This can be vastly simplified, _IF_ we can assume gridded scenes
  // Check for center of each square the token uses.
  // e.g. for large tokens all 4 squares
  const startX = token.document.width >= 1 ? 0.5 : (token.document.width / 2);
  const startY = token.document.height >= 1 ? 0.5 : (token.document.height / 2);
  for (let x = startX; x < token.document.width; x++) {
    for (let y = startY; y < token.document.height; y++) {
      const currGrid = {
        x: token.x + x * grid.size! - templatePos.x,
        y: token.y + y * grid.size! - templatePos.y,
      };
      let contains = template.shape?.contains(currGrid.x, currGrid.y);
      if (contains && wallsBlockTargeting) {
        let tx = templatePos.x;
        let ty = templatePos.y;
        if (template.shape instanceof PIXI.Rectangle) {
          tx = tx + template.shape.width / 2;
          ty = ty + template.shape.height / 2;
        }
        const r = new foundry.canvas.geometry.Ray({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y });

        // If volumetric templates installed always leave targeting to it.
        if (
          configSettings.optionalRules.wallsBlockRange === "centerLevels"
          && installedModules.get("levels")
          && !installedModules.get("levelsvolumetrictemplates")) {
          let p1 = {
            x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y,
            z: token.document.elevation
          }
          // installedModules.get("levels").lastTokenForTemplate.elevation no longer defined
          //@ts-expect-error no levels types
          const { elevation } = CONFIG.Levels.handlers.TemplateHandler.getTemplateData(false)
          let p2 = {
            x: tx, y: ty,
            z: elevation as number
          }
          contains = getUnitDist(p2.x, p2.y, p2.z, token) <= template.document.distance;
          //@ts-expect-error no levels types
          contains = contains && !CONFIG.Levels?.API?.testCollision(p1, p2, "collision");
        } else if (!installedModules.get("levelsvolumetrictemplates")) {
          contains = !CONFIG.Canvas.polygonBackends.sight.testCollision({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y }, { mode: "any", type: "move" })
        }
      }
      // Check the distance from origin.
      if (contains) return true;
    }
  }
  return false;
}
export function isAoETargetable(targetToken: Token.Implementation, options: { selfToken?: TokenOrDocument | string | null | undefined, ignoreSelf?: boolean, AoETargetType?: string, autoTarget?: string } = { ignoreSelf: false, AoETargetType: "any" }): boolean {
  if (!isValidTarget(targetToken)) return false;
  const autoTarget = options.autoTarget ?? configSettings.autoTarget;
  const selfToken = getToken(options.selfToken);
  if (["wallsBlockIgnoreIncapacitated", "alwaysIgnoreIncapacitated"].includes(autoTarget) && checkIncapacitated(targetToken.actor, false, false)) return false;
  if (["wallsBlockIgnoreDefeated", "alwaysIgnoreDefeated"].includes(autoTarget) && checkDefeated(targetToken)) return false;
  if (targetToken.document.uuid === selfToken?.document.uuid && options.ignoreSelf) return false;
  const selfDisposition = selfToken?.document.disposition ?? 1;
  switch (options.AoETargetType) {
    case "any":
      return true;
    case "ally":
      return targetToken.document.disposition === selfDisposition;
    case "notAlly":
      return targetToken.document.disposition !== selfDisposition
    case "enemy":
      return targetToken.document.disposition === -selfDisposition || targetToken.document.disposition == CONST.TOKEN_DISPOSITIONS.SECRET;
    case "notEnemy":
      return targetToken.document.disposition !== -selfDisposition && targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.SECRET;
    case "neutral":
      return targetToken.document.disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL;
    case "notNeutral":
      return targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.NEUTRAL;
    case "friendly":
      return targetToken.document.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    case "notFriendly":
      return targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    case "hostile":
      return targetToken.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE || targetToken.document.disposition == CONST.TOKEN_DISPOSITIONS.SECRET;
    case "notHostile":
      return targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE && targetToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.SECRET;
    default:
      return true;
  }
}

export function selectTargetsFromTemplates(
  templates: (foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument | string)[],
  selfTokenRef: TokenOrDocument | string | null | undefined = "",
  ignoreSelf: boolean = false,
  AoETargetType: string = "any",
  autoTarget?: string
): Token.Implementation[] {
  const tokens = computeTargetsFromTemplates(templates, selfTokenRef, ignoreSelf, AoETargetType, autoTarget);
  const targetIds = tokens.map(t => t.id).filter(Boolean) as string[];
  updateUserTargets(targetIds);
  return tokens;
}


/**
 * Returns tokens inside a template without modifying game.user.targets.
 * Accepts a MeasuredTemplate placeable, a MeasuredTemplateDocument, or a UUID string.
 * Handles WalledTemplates, VolumetricTemplates, and standard template targeting.
 * Note: When VolumetricTemplates is active, game.user.targets may be modified as a
 * side effect of compute3Dtemplate — the returned array is still the authoritative result.
 */
export function computeTargetsFromTemplate(
  template: foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument | string,
  selfTokenRef: TokenOrDocument | string | null | undefined = "",
  ignoreSelf: boolean = false,
  AoETargetType: string = "any",
  autoTarget?: string
): Token.Implementation[] {
  if (!autoTarget) autoTarget = configSettings.autoTarget;
  if (autoTarget === "none") return [];

  // Resolve to a MeasuredTemplate placeable
  let mTemplate: foundry.canvas.placeables.MeasuredTemplate.Implementation | undefined;
  if (typeof template === "string") {
    const tDoc = fromUuidSync(template) as MeasuredTemplateDocument | null;
    mTemplate = tDoc?.object ?? undefined;
  } else if (template instanceof MeasuredTemplateDocument) {
    mTemplate = template.object ?? undefined;
  } else {
    mTemplate = template;
  }
  if (!mTemplate) return [];

  const useWalledTemplates = autoTarget === "walledtemplates" && game.modules.get("walledtemplates")?.active;
  if (!useWalledTemplates) {
    // For cones/rays during preview, the shape may be stale (computed with old direction)
    const templateType = mTemplate.document.t;
    if (templateType === "cone" || templateType === "ray" || !mTemplate.shape) {
      const { shape } = computeTemplateShapeDistance(mTemplate.document);
      mTemplate.shape = shape;
    }
  }

  const selfToken = getToken(selfTokenRef);
  let targetTokens: Token.Implementation[] = [];

  if (installedModules.get("levelsvolumetrictemplates")) {
    const tokensToCheck = canvas.tokens?.placeables?.filter(tk =>
      isAoETargetable(tk, { selfToken, ignoreSelf, AoETargetType, autoTarget })
    );
    //@ts-expect-error VolumetricTemplates
    VolumetricTemplates.compute3Dtemplate(mTemplate, tokensToCheck);
    targetTokens = Array.from(game.user?.targets ?? []);
  } else if (useWalledTemplates) {
    //@ts-expect-error walledtemplates
    targetTokens = (mTemplate.targetsWithinShape) ? mTemplate.targetsWithinShape() : [];
    targetTokens = targetTokens.filter(token => isAoETargetable(token, { selfToken, ignoreSelf, AoETargetType, autoTarget }));
  } else {
    const wallsBlockTargeting = ["wallsBlock", "wallsBlockIgnoreDefeated", "wallsBlockIgnoreIncapacitated"].includes(autoTarget);
    for (const token of (canvas.tokens?.placeables ?? [])) {
      if (!isAoETargetable(token, { selfToken, ignoreSelf, AoETargetType, autoTarget })) continue;
      if (token.actor && isTokenInside(mTemplate, token, wallsBlockTargeting)) {
        if (token.id) {
          targetTokens.push(token);
        }
      }
    }
  }
  return targetTokens;
}

export function computeTargetsFromTemplates(
  templates: (foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument | string)[],
  selfTokenRef: TokenOrDocument | string | null | undefined = "",
  ignoreSelf: boolean = false,
  AoETargetType: string = "any",
  autoTarget?: string
): Token.Implementation[] {
  const allTargetTokens: Set<Token.Implementation> = new Set();

  for (const template of templates) {
    const tokens = computeTargetsFromTemplate(template, selfTokenRef, ignoreSelf, AoETargetType, autoTarget);
    tokens.forEach(t => allTargetTokens.add(t));
  }
  return Array.from(allTargetTokens);
}

// If we are blocking the roll let anyone waiting on the roll know it is complete
function blockRoll(item, workflow) {
  if (item) {
    if (workflow) workflow.aborted = true;
    let hookName = `midi-qol.RollComplete.${item?.uuid}`;
    //@ts-expect-error
    Hooks.callAll(hookName, workflow)
  }
  return false;
}

/**
 * Get currently selected tokens in the scene or user's character's tokens.
 * @returns {Token5e[]}
 */


export function getSceneTargets(): Token.Implementation[] {
  return globalThis.dnd5e.utils.getSceneTargets();
}