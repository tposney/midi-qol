import { MODULE_ID, debugEnabled, warn, error } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TargetConfirmationDialog } from "../apps/TargetConfirmation.js";
import { configSettings, safeGetGameSetting, targetConfirmation } from "../settings.js";
import { installedModules } from "../setupModules.js";
import { getFlankingEffect, CERemoveEffect, sumRolls, evalActivationCondition, computeTemplateShapeDistance, getToken, MQfromUuidSync, checkActivityRange, checkDefeated, checkIncapacitated, computeCoverBonus, getSpeaker, hasWallBlockingCondition, isValidTarget, tokenForActor, activityHasAreaTarget, getActivityAutoTargetAction, getAoETargetType, doReactions, getUnitDist, updateUserTargets } from "../utils.js";
const { DialogV2 } = foundry.applications.api;

export async function confirmWorkflow(existingWorkflow: Workflow): Promise<boolean> {
  const validStates = [existingWorkflow.WorkflowState_Completed, existingWorkflow.WorkflowState_Start, existingWorkflow.WorkflowState_RollFinished]
  if (existingWorkflow.currentAction === existingWorkflow.WorkflowState_NoAction) return true;
  if (!(validStates.includes(existingWorkflow.currentAction))) {// && configSettings.confirmAttackDamage !== "none") {
    if (configSettings.autoCompleteWorkflow) {
      existingWorkflow.aborted = true;
      await existingWorkflow.performState(existingWorkflow.WorkflowState_Cleanup);
      await Workflow.removeWorkflow(existingWorkflow.id);
    } else if (existingWorkflow.currentAction === existingWorkflow.WorkflowState_WaitForDamageRoll && existingWorkflow.hitTargets.size === 0) {
      existingWorkflow.aborted = true;
      await existingWorkflow.performState(existingWorkflow.WorkflowState_Cleanup);
    } else {
      switch (await DialogV2.wait({
        window: { title: game.i18n?.format("midi-qol.WaitingForPreviousWorkflow", { name: existingWorkflow.activity.name }) },
        content: game.i18n?.localize("midi-qol.ResolvePreviousWorkflow"),
        rejectClose: false,
        close: () => { return false },
        buttons: [
          { action: "complete", label: `<i class="fas fa-check"></i> Complete previous`, callback: () => { return "complete" } },
          { action: "discard", label: `<i class="fas fa-trash"></i> Discard previous`, callback: () => { return "discard" } },
          { action: "undo", label: `<i class="fas fa-undo"></i> Undo until previous`, callback: () => { return "undo" } },
          { action: "cancel", default: true, label: `<i class="fas fa-times"></i> Cancel New`, callback: () => { return "cancel" } }
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
export async function removeFlanking(actor: Actor): Promise<void> {
  let CEFlanking = getFlankingEffect();
  if (CEFlanking && CEFlanking.name) await CERemoveEffect({ effectName: CEFlanking.name, uuid: actor.uuid });
}

//
export function setDamageRollMinTerms(rolls: Array<Roll | any> | undefined) {
  const Die: any = foundry.dice.terms.Die;
  if (rolls && sumRolls(rolls)) {
    for (let roll of rolls) {
      for (let term of roll.terms) {
        // I don't like the default display and it does not look good for dice so nice - fiddle the results for maximised rolls
        if (term instanceof Die && term.modifiers.includes(`min${term.faces}`)) {
          for (let result of term.results) {
            result.result = term.faces;
          }
        }
      }
    }
  }
}

export async function doActivityReactions(activity, workflow: Workflow) {
  const promises: Promise<any>[] = [];
  if (!foundry.utils.getProperty(activity, `flags.${MODULE_ID}.noProvokeReaction`) && !workflow?.workflowOptions.noProvokeReaction) {
    for (let targetToken of workflow.targets) {
      promises.push(new Promise(async resolve => {
        //@ts-expect-error targetToken Type
        const result = await doReactions(targetToken, workflow.tokenUuid, null, "reactionpreattack", { item: this, workflow, workflowOptions: foundry.utils.mergeObject(workflow.workflowOptions, { sourceActorUuid: activity.actor?.uuid, sourceItemUuid: this?.uuid }, { inplace: false, overwrite: true }) });
        if (result?.name) {
          //@ts-expect-error
          targetToken.actor?._initialize();
          workflow.actor._initialize();
          // targetToken.actor?.prepareData(); // allow for any items applied to the actor - like shield spell
          workflow.needsAttackAdvantageCheck = true; // Toggle this on in case
        }
        resolve(result);
      }));
    }
  }
  return await Promise.all(promises);
}

export function preActivityConsumptionHook(activity, usageConfig, messageConfig): boolean {
  // console.error("preActivityConsumptionHook", activity, usageConfig, messageConfig);
  return true;
}

export function activityConsumptionHook(activity, usageConfig, messageConfig, updates): boolean {
  // console.error("activityConsumptionHook", activity, usageConfig, messageConfig, updates);
  return true;
}

function activityRequiresPostTemplateConfirmation(activity): boolean {
  // const isRangeTargeting = ["ft", "m"].includes(activity.range?.units) && ["creature", "ally", "enemy"].includes(activity.target?.affects.type);
  if (activity.target?.template?.type) {
    return true;
    //  } else if (isRangeTargeting) {
    //    return true;
  }
  return false;
}

function itemRequiresPostTemplateConfirmation(activity): boolean {
  const isRangeTargeting = ["ft", "m"].includes(activity.item.system.range?.units) && ["creature", "ally", "enemy"].includes(activity.target?.affects.type);
  if (activity.target?.template?.type) {
    return true;
  } else if (isRangeTargeting) {
    return true;
  }
  return false;
}

export function requiresTargetConfirmation(activity, options): boolean {
  if (!activity.item) debugger;
  // fix for very silly value choice in midi properties.
  if (["none", "never"].includes(options.workflowOptions?.targetConfirmation)) return false;
  if (options.workflowOptions?.targetConfirmation === "always") return true;
  if (["enchant", "summon"].includes(activity.type)) return false;
  if (activity.target?.affects?.choice) return true;
  if (["", "self", undefined].includes(activity.target?.affects?.type) && ["", undefined, "self"].includes(activity.range?.units)) return false;
  if (activity.target?.affects.type === "self") return false;
  if (options.workflowOptions?.attackPerTarget === true) return false;
  if ((activity.forcedTargetConfirmation ?? activity.midiProperties?.confirmTargets) === "always") return true;
  if ((activity.forcedTargetConfirmation ?? activity.midiProperties?.confirmTargets) === "never") return false;
  let numTargets = game.user?.targets?.size ?? 0;
  if (numTargets === 0 && configSettings.enforceSingleWeaponTarget && activity.item.type === "weapon")
    numTargets = 1;
  const token = tokenForActor(activity.actor);
  if (targetConfirmation.enabled) {
    if (targetConfirmation.all && (activity.target?.affects.type ?? "") !== "self") {
      if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.all");
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
      (["ft", "m"].includes(activity.item.system.range?.units) || activity.item.system.range.type === "touch")) {
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
      const isRangeTargeting = ["ft", "m"].includes(activity.target?.affects.count) && ["creature", "ally", "enemy"].includes(activity.target?.affects.type);
      if (!activity.target?.template?.type && !isRangeTargeting && token) {
        for (let target of game.user?.targets) {
          if (computeCoverBonus(token, target, activity) > 0) {
            if (debugEnabled > 0) warn("target confirmation triggered from targetConfirmation.inCover");
            return true;
          }
        }
      }
    }
    const isRangeTargeting = ["ft", "m"].includes(activity.target?.affects.count) && ["creature", "ally", "enemy"].includes(activity.target?.affects.type);
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

export async function preTemplateTargets(activity, options): Promise<boolean> {
  if (activityRequiresPostTemplateConfirmation(activity)) return true;
  if (requiresTargetConfirmation(activity, options))
    return await resolveTargetConfirmation(activity, options) === true;
  return true;
}

export async function postTemplateConfirmTargets(activity, options, workflow): Promise<boolean> {
  const updateTargets = async () => {
    const needCanSeeSense = game.user?.targets && !workflow.targets.equals(game.user?.targets);
    workflow.setTargets(game.user?.targets);
    if (needCanSeeSense) await workflow.activity.setupCanSeeSense({ workflow });
  }
  if (activityRequiresPostTemplateConfirmation(activity) && (requiresTargetConfirmation(activity, options) || activity.target?.affects?.choice)) {
    let result = true;
    result = await resolveTargetConfirmation(activity, options);
    if (result && game.user?.targets) {
      await updateTargets();
    }
    return result === true;
  }
  if (game.user?.targets) {
    await updateTargets();
    return true;
  }
  return true;
}

export async function resolveTargetConfirmation(activity, options: any = {}): Promise<boolean> {
  if (!canvas?.tokens?.active) {
    await canvas?.tokens?.activate();
  }
  //@ts-expect-error
  const savedControl = ui.controls?.control?.name;
  //@ts-expect-error
  const savedTool = ui.controls?.tool?.name;
  // @ts-expect-error v13ism
  await ui.controls?.render({ control: "tokens", tool: "target" });
  const wasMaximized = !(activity.actor.sheet?._minimized);
  // Hide the sheet that originated the preview
  if (wasMaximized) await activity.actor.sheet.minimize();

  let targets = new Promise((resolve, reject) => {
    // no timeout since there is a dialog to close
    // create target dialog which updates the target display
    options ??= {};
    options.callback = resolve;
    new TargetConfirmationDialog(activity.actor, activity, game.user, options).render({ force: true });
  });
  let shouldContinue = await targets;
  //@ts-expect-error
  for (let token of canvas?.tokens?.placeables) await token.initializeVisionSource();
  // @ts-expect-error v13ism
  if (savedTool) await ui.controls?.render({ control: savedControl, tool: savedTool });


  if (wasMaximized) await activity.actor.sheet.maximize();
  return !!shouldContinue;
}

export async function showItemInfo(): Promise<ChatMessage | undefined> {
  const token = this.actor.token;
  const sceneId = token?.scene && token.scene.id || canvas?.scene?.id;

  const templateData = {
    actor: this.actor,
    // tokenId: token?.id,
    tokenId: token?.document?.uuid ?? token?.uuid,
    tokenUuid: token?.document?.uuid ?? token?.uuid,
    item: this,
    itemUuid: this.uuid,
    data: await await this.system.getCardData(),
    labels: this.labels,
    condensed: false,
    hasAttack: false,
    isHealing: false,
    hasDamage: false,
    isSpell: this.type === "spell",
    isPower: this.type === "power",
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
  const html = await renderTemplate(template, templateData);

  const chatData: any = {
    user: game.user?.id,
    content: html,
    flavor: this.system.chatFlavor || this.name,
    speaker: getSpeaker(this.actor),
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

function isTokenInside(template: MeasuredTemplate, token: Token, wallsBlockTargeting): boolean {
  //@ts-ignore grid v10
  const grid = canvas?.scene?.grid;
  if (!grid) return false;
  const templatePos = template.document ? { x: template.document.x, y: template.document.y } : { x: template.x, y: template.y };
  if (configSettings.optionalRules.wallsBlockRange !== "none" && hasWallBlockingCondition(token))
    return false;
  if (!isValidTarget(token)) return false;

  // Check for center of  each square the token uses.
  // e.g. for large tokens all 4 squares
  //@ts-ignore document.width
  const startX = token.document.width >= 1 ? 0.5 : (token.document.width / 2);
  //@ts-ignore document.height
  const startY = token.document.height >= 1 ? 0.5 : (token.document.height / 2);
  //@ts-ignore document.width
  for (let x = startX; x < token.document.width; x++) {
    //@ts-ignore document.height
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
        // @ts-expect-error v13ism
        const r = new foundry.canvas.geometry.Ray({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y });

        // If volumetric templates installed always leave targeting to it.
        if (
          configSettings.optionalRules.wallsBlockRange === "centerLevels"
          && installedModules.get("levels")
          && !installedModules.get("levelsvolumetrictemplates")) {
          let p1 = {
            x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y,
            //@ts-expect-error
            z: token.elevation
          }
          // installedModules.get("levels").lastTokenForTemplate.elevation no longer defined
          //@ts-expect-error .elevation CONFIG.Levels.UI v10
          // const p2z = _token?.document?.elevation ?? CONFIG.Levels.UI.nextTemplateHeight ?? 0;
          const { elevation } = CONFIG.Levels.handlers.TemplateHandler.getTemplateData(false)
          let p2 = {
            x: tx, y: ty,
            //@ts-ignore
            z: elevation
          }
          contains = getUnitDist(p2.x, p2.y, p2.z, token) <= template.document.distance;
          //@ts-expect-error .Levels
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
export function isAoETargetable(targetToken, options: { selfToken?: Token | TokenDocument | string | null | undefined, ignoreSelf?: boolean, AoETargetType?: string, autoTarget?: string } = { ignoreSelf: false, AoETargetType: "any" }): boolean {
  if (!isValidTarget(targetToken)) return false;
  const autoTarget = options.autoTarget ?? configSettings.autoTarget;
  const selfToken = getToken(options.selfToken);
  if (["wallsBlockIgnoreIncapacitated", "alwaysIgnoreIncapacitated"].includes(autoTarget) && checkIncapacitated(targetToken.actor, false, false)) return false;
  if (["wallsBlockIgnoreDefeated", "alwaysIgnoreDefeated"].includes(autoTarget) && checkDefeated(targetToken)) return false;
  if (targetToken === selfToken && options.ignoreSelf) return false;
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
    default: return true;
  }
}

export function templateTokens(templateDetails: MeasuredTemplate, selfTokenRef: Token | TokenDocument | string | null | undefined = "", ignoreSelf: boolean = false, AoETargetType: string = "any", autoTarget?: string): Token[] {
  if (!autoTarget) autoTarget = configSettings.autoTarget
  // deprecated if (!autoTarget) autoTarget = getAutoTarget(templateDetails.item);
  if ((autoTarget) === "none") return [];
  const wallsBlockTargeting = ["wallsBlock", "wallsBlockIgnoreDefeated", "wallsBlockIgnoreIncapacitated"].includes(autoTarget);
  const tokens: Token[] = canvas?.tokens?.placeables ?? []; //.map(t=>t)
  const selfToken = getToken(selfTokenRef);
  let targetIds: string[] = [];
  let targetTokens: Token[] = [];
  updateUserTargets([]);
  if (autoTarget === "walledtemplates" && game.modules?.get("walledtemplates")?.active) {
    //@ts-expect-error
    if (foundry.utils.getProperty(templateDetails?.item, "flags.walledtemplates.noAutotarget")) return targetTokens
    //@ts-expect-error
    targetTokens = (templateDetails.targetsWithinShape) ? templateDetails.targetsWithinShape() : [];
    targetTokens = targetTokens.filter(token => isAoETargetable(token, { selfToken, ignoreSelf, AoETargetType, autoTarget }))
    targetIds = targetTokens.map(t => t.id);
  } else {
    for (const token of tokens) {
      if (!isAoETargetable(token, { selfToken, ignoreSelf, AoETargetType, autoTarget })) continue;
      if (token.actor && isTokenInside(templateDetails, token, wallsBlockTargeting)) {
        if (token.id) {
          targetTokens.push(token);
          targetIds.push(token.id);
        }
      }
    }
  }
  updateUserTargets(targetIds);
  game.user?.broadcastActivity({ targets: targetIds });
  return targetTokens;
}


// this is bound to a workflow when called - most of the time
export function selectTargets(templateDocument: MeasuredTemplateDocument, data?, user?) {
  // const workflow = this?.currentAction ? this : Workflow.getWorkflow(templateDocument.flags?.dnd5e?.origin);
  const activity = this?.activity;
  if (debugEnabled > 0) warn("selectTargets ", this, templateDocument, data, user);
  const selfToken = getToken(activity.actor);
  const ignoreSelf = (activity?.target.affects.special ?? "").split(";").some(spec => spec === "self");
  let AoETargetType = getAoETargetType(activity);
  let targeting = getActivityAutoTargetAction(activity);
  if ((game.user?.targets.size === 0 || this?.workflowOptions.forceTemplateTargeting || user !== game.user?.id || installedModules.get("levelsvolumetrictemplates")) && targeting !== "none") {
    let mTemplate: MeasuredTemplate = MQfromUuidSync(templateDocument.uuid)?.object;
    if (templateDocument?.object && !installedModules.get("levelsvolumetrictemplates")) {
      if (!mTemplate.shape) {
        // @ ts-expect-error
        // mTemplate.shape = mTemplate._computeShape();
        let { shape, distance } = computeTemplateShapeDistance(templateDocument);
        //@ts-expect-error
        mTemplate.shape = shape;
        //@ ts-expect-error
        // mTemplate.distance = distance;
        if (debugEnabled > 0) warn(`selectTargets computed shape ${shape} distance ${distance}`)
      }
      templateTokens(mTemplate, selfToken, ignoreSelf, AoETargetType, getActivityAutoTargetAction(activity));
    } else if (templateDocument.object) {
      //@ts-expect-error
      VolumetricTemplates.compute3Dtemplate(templateDocument.object, canvas?.tokens?.placeables);
    }
  }
  if (this) {
    this.templateUuid = templateDocument?.uuid;
  }
  if (targeting === "none") { // this is no good
    Hooks.callAll("midi-qol-targeted", this?.targets);
    return true;
  }

  game.user?.targets?.forEach(token => {
    if (!isAoETargetable(token, { ignoreSelf, selfToken, AoETargetType, autoTarget: getActivityAutoTargetAction(activity) }))
      token.setTarget(false, { user: game.user, releaseOthers: false })
    if (activity.target?.affects.count && (game.user?.targets?.size ?? 0) > activity.target?.affects?.count)
      token.setTarget(false, { user: game.user, releaseOthers: false });
  });

  if (this?.workflowType === "TrapWorkflow") return;
  if (debugEnabled > 0) warn("selectTargets ", this?.suspended, this?.needTemplate, templateDocument);

  if (this?.needTemplate) {
    this.needTemplate = false;
    this.templateUuid = templateDocument?.uuid;
    if (this.suspended && this.currentAction === this.WorkflowState_AwaitTemplate) 
      this.unSuspend.bind(this)({ templateDocument });
  }
  return;
};

// If we are blocking the roll let anyone waiting on the roll know it is complete
function blockRoll(item, workflow) {
  if (item) {
    if (workflow) workflow.aborted = true;
    let hookName = `midi-qol.RollComplete.${item?.uuid}`;
    Hooks.callAll(hookName, workflow)
  }
  return false;
}

/**
 * Get currently selected tokens in the scene or user's character's tokens.
 * @returns {Token5e[]}
 */


export function getSceneTargets(): Token[] {
  return globalThis.dnd5e.utils.getSceneTargets();
}