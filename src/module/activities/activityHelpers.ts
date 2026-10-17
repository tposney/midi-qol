import { Activity, ActivityUseConfiguration, RollMessageConfig, TokenOrDocument } from "../../globals.js";
import { MODULE_ID, debugEnabled, warn, i18n, GameSystemConfig } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { TargetConfirmationDialog, TargetConfirmationOptions } from "../apps/TargetConfirmation.js";
import { configSettings, targetConfirmation } from "../settings.js";
import { installedModules } from "../setupModules.js";
import { collisionLevel, getFlankingEffect, CERemoveEffect, sumRolls, computeTemplateShapeDistance, getToken, checkActivityRange, checkDefeated, checkIncapacitated, computeCoverBonus, hasWallBlockingCondition, isValidTarget, tokenForActor, activityHasAreaTarget, activityHasAutoPlaceTemplate, activityHasEmanationNoTemplate, getActivityAutoTargetAction, getAoETargetType, doReactions, updateUserTargets, rangeToSceneUnits, tokenSourcePosition, tokenSourceCenter, tokenSourceElevation, getTokenVisionElevation, MidiOptions } from "../utils.js";
import { allAttackTypes } from "../../midi-qol.js";
import Token = foundry.canvas.placeables.Token;

// Target types that represent discrete creatures (not areas)
const creatureTargetTypes = ["creature", "enemy", "ally", "willing"];

/**
 * Determines if the enforceSingleWeaponTarget setting should apply to this activity.
 * Returns false for emanation/AoE activities that naturally target multiple creatures.
 * @param activity The activity to check
 * @returns true if single target should be enforced
 */
export function attachTokenOptions(selected: string) {
  return ["default", "caster", "target"].map(value => ({
    value,
    label: i18n(`midi-qol.REGION_BEHAVIOR.attachToken.${value}`),
    selected: selected === value
  }));
}

export function templateOriginOptions(selected: string) {
  return ["default", "base", "top", "eye"].map(value => ({
    value,
    label: i18n(`midi-qol.REGION_BEHAVIOR.templateOrigin.${value}`),
    selected: selected === value
  }));
}

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

  // Enforce for creature-like target types, or when there's no target specification at all
  const affectsType = activity.target?.affects?.type;
  return !affectsType || creatureTargetTypes.includes(affectsType);
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
      promises.push((async () => {
        const result = await doReactions(targetToken, workflow.tokenUuid, null, "reactionpreattack", { item: activity.item, workflow, workflowOptions: foundry.utils.mergeObject(workflow.workflowOptions, { sourceActorUuid: activity.actor?.uuid, sourceItemUuid: activity.item?.uuid }, { inplace: false, overwrite: true }) });
        if (result.name) {
          targetToken.actor?.reset();
          workflow.actor.reset();
          // targetToken.actor?.prepareData(); // allow for any items applied to the actor - like shield spell
        }
        return result;
      })());
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

export function requiresTargetConfirmation(activity: Activity, options: MidiOptions): boolean {
  // if (!activity.item) debugger;
  // fix for very silly value choice in midi properties.
  if (["none", "never"].includes(options.workflowOptions?.targetConfirmation ?? "")) return false;
  if (options.workflowOptions?.targetConfirmation === "always") return true;
  if (["enchant", "summon"].includes(activity.type)) return false;
  /*
   * "Choose Targets" (target.affects.choice) means "when targeting an area, can the user choose who
   * it affects?". dnd5e only renders the checkbox while a template type is set
   * (shared/fields/field-targets.hbs), so clearing the template type leaves a stored true that is
   * invisible on the sheet but was still forcing confirmation on every use. Apply it only under the
   * condition it can be set.
   */
  if (activity.target?.affects?.choice && activity.target?.template?.type) return true;
  if (["", "self", undefined].includes(activity.target?.affects?.type) && ["", undefined, "self"].includes(activity.range?.units)) return false;
  if (activity.target?.affects.type === "self") return false;
  if (options.workflowOptions?.attackPerTarget === true) return false;
  if ((activity.forcedTargetConfirmation ?? activity.midiProperties?.confirmTargets) === "always") return true;
  if ((activity.forcedTargetConfirmation ?? activity.midiProperties?.confirmTargets) === "never") return false;
  if (targetConfirmation.enabled && targetConfirmation.noneTargeted && ((activity.target?.affects.type ?? "") !== "" || activity.attack) && (game.user?.targets?.size ?? 0) === 0)
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
          const { result } = checkActivityRange(activity, token, new Set([target]))
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
    const dialog = new TargetConfirmationDialog(activity.actor!, activity, game.user!, options);
    // A dialog that fails to render cancels the use rather than leaving it waiting.
    dialog.render({ force: true }).catch(err => {
      console.error("midi-qol | Target Confirmation failed to render", err);
      dialog.doCallback(false);
    });
  });
  let shouldContinue = await targets;
  for (let token of canvas.tokens?.placeables ?? []) token.initializeVisionSource();
  if (savedTool) await ui.controls?.activate({ control: savedControl.name, tool: savedTool.name });


  if (wasMaximized) await activity.actor?.sheet?.maximize();
  return !!shouldContinue;
}

/** Post the item's card, as dnd5e's own "display card" does. */
export async function showItemInfo(this: Item.Implementation): Promise<ChatMessage.Implementation | undefined> {
  // @ts-expect-error no dnd5e-types
  return this.displayCard();
}

function isTokenInside(template: foundry.canvas.placeables.MeasuredTemplate.Implementation, token: Token.Implementation, wallsBlockTargeting: boolean): boolean {
  const grid = canvas.scene?.grid;
  if (!grid) return false;
  const templatePos = { x: template.document.x, y: template.document.y };
  if (configSettings.optionalRules.wallsBlockRange !== "none" && hasWallBlockingCondition(token))
    return false;
  if (!isValidTarget(token)) return false;
  // No backing Region during preview, so derive the band from the template.
  if (!withinBand(templateElevationBand(template.document), token)) return false;

  // TODO: This can be vastly simplified, _IF_ we can assume gridded scenes
  // Check for center of each square the token uses.
  // e.g. for large tokens all 4 squares
  const pos = tokenSourcePosition(token);
  const startX = pos.width >= 1 ? 0.5 : (pos.width / 2);
  const startY = pos.height >= 1 ? 0.5 : (pos.height / 2);
  for (let x = startX; x < pos.width; x++) {
    for (let y = startY; y < pos.height; y++) {
      const currGrid = {
        x: pos.x + x * grid.size! - templatePos.x,
        y: pos.y + y * grid.size! - templatePos.y,
      };
      let contains = template.shape?.contains(currGrid.x, currGrid.y);
      if (contains && wallsBlockTargeting) {
        let tx = templatePos.x;
        let ty = templatePos.y;
        if (template.shape instanceof PIXI.Rectangle) {
          tx = tx + template.shape.width / 2;
          ty = ty + template.shape.height / 2;
        }

        // If volumetric templates installed always leave targeting to it.
        if (!installedModules.get("levelsvolumetrictemplates")) {
          // @ts-expect-error v14 collision level not in fvtt-types
          contains = !CONFIG.Canvas.polygonBackends.sight.testCollision({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y }, { mode: "any", type: "move", level: collisionLevel(token) })
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

/**
 * midi's flags for an activity template region — the marker `isTemplateRegion` tests, the caster
 * token and, when `constrainTemplatePlacement` is on, the range limit `preCreateRegion` enforces.
 *
 * Shared so a region placed interactively (via `dnd5e.createMeasuredTemplate`) and one placed
 * programmatically (via `createActivityTemplateRegions`) carry the same flags.
 */
export function midiTemplateFlags(activity: any): Record<string, unknown> {
  const flags: Record<string, unknown> = { activityTemplate: true };
  const casterToken = activity?.actor ? tokenForActor(activity.actor) : undefined;
  if (casterToken) flags.sourceTokenUuid = casterToken.document.uuid;
  if (activity?.item) flags.itemUuid = activity.item.uuid;
  if (activity?.actor) flags.actorUuid = activity.actor.uuid;
  const range = activity?.range;
  const rangeUnits = range?.units;
  if (configSettings.constrainTemplatePlacement && rangeUnits && !["self", "none", "any"].includes(rangeUnits)) {
    const declared = range.long || range.value;
    if (declared && declared > 0) {
      flags.maxRange = rangeUnits === "touch"
        ? (canvas?.dimensions?.distance ?? 5) : rangeToSceneUnits(declared, rangeUnits);
    }
  }
  return flags;
}

/**
 * The height a template is measured from: the caster's base, top (base plus its height) or eye level (midi's vision height),
 * per the activity's override or else the Template Origin Height setting.
 */
function templateOriginElevation(activity: any, casterToken: Token.Implementation): number {
  const override: string | undefined = activity?.regionBehavior?.templateOrigin;
  const origin = override && override !== "default" ? override : (configSettings.optionalRules.templateOriginHeight ?? "base");
  if (origin === "eye") return getTokenVisionElevation(casterToken, "visionSourceHeight");
  const base = tokenSourceElevation(casterToken);
  if (origin === "top") return base + (casterToken.document.depth ?? 1) * (canvas?.scene?.grid.distance ?? 5);
  return base;
}

/**
 * The vertical extent of an activity's template region, by area type, around its caster's elevation `e`: a sphere is
 * centred on it, a cone is centred on its axis, and a cylinder, ring, cube or line stands on it. `e` is the origin height
 * (templateOriginElevation). dnd5e 6 leaves template
 * regions without an elevation, which core - and so dnd5e's region behaviours - reads as reaching from -Infinity to
 * Infinity; the flat circle and square areas are meant to, and emanations follow their token, so both are left alone.
 */
export function templateElevation(activity: any, shape: any): { bottom: number, top: number | null, topInclusive: boolean } | undefined {
  const template = activity?.target?.template ?? {};
  const type: string | undefined = template.type;
  if (!type || ["radius", "circle", "square"].includes(type) || shape?.type === "emanation") return undefined;
  const casterToken = activity?.actor ? tokenForActor(activity.actor) : undefined;
  if (!casterToken) return undefined;
  const e = templateOriginElevation(activity, casterToken);
  const sceneUnits = (value: unknown): number | undefined => {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return undefined;
    const converted = globalThis.dnd5e?.utils?.convertLength?.(size, template.units, canvas?.scene?.grid.units, { strict: false });
    return typeof converted === "number" ? converted : size;
  };
  // Inclusive, as midi's own band is: a creature level with the top is inside.
  const band = (bottom: number, top: number | undefined) => ({ bottom, top: top ?? null, topInclusive: true });
  const centred = (height: number | undefined) => height === undefined ? band(e, undefined) : band(e - height / 2, e + height / 2);
  switch (type) {
    case "sphere": { const radius = sceneUnits(template.size); return radius === undefined ? undefined : band(e - radius, e + radius); }
    case "cylinder": case "ring": case "wall": { const height = sceneUnits(template.height); return band(e, height === undefined ? undefined : e + height); }
    case "cube": { const side = sceneUnits(template.size); return band(e, side === undefined ? undefined : e + side); }
    case "line": return band(e, e + (sceneUnits(template.width) ?? canvas?.scene?.grid.distance ?? 5));
    case "cone": return centred(regionShapeHeight(shape));
    default: { const height = regionShapeHeight(shape); return band(e, height === undefined ? undefined : e + height); }
  }
}

/**
 * Whether a region is a template: one midi marked when an activity placed it, or one created
 * through Foundry's MeasuredTemplate compatibility layer. `flags.dnd5e.activity` is not a test —
 * dnd5e sets it on any region that belongs to an activity.
 */
export function isTemplateRegion(region: unknown): boolean {
  return !!(foundry.utils.getProperty(region as object, "flags.core.MeasuredTemplate")
    || foundry.utils.getProperty(region as object, `flags.${MODULE_ID}.activityTemplate`));
}

/**
 * Create template Regions for an activity at known positions, without the placement UI.
 *
 * dnd5e's `TemplatePlacement.fromActivity` bundles the interactive placement with the region
 * creation, so there is no system API for "put this activity's template here" — which is what a
 * TrapWorkflow and midi's auto-placed templates need. The region data mirrors what
 * `TemplatePlacement.fromActivity` builds, so a template placed this way is indistinguishable from
 * one the player positioned by hand.
 *
 * Sizes go through dnd5e's own `convertLength`, from the activity's units to the scene's, then to
 * pixels. The deprecated `AbilityTemplate` path skipped that conversion.
 */
export async function createActivityTemplateRegions(
  activity: any,
  placements: { x: number, y: number, direction?: number, token?: TokenDocument.Implementation }[],
  extraFlags: Record<string, unknown> = {}
): Promise<RegionDocument.Implementation[]> {
  const scene = canvas?.scene;
  if (!scene || !placements.length) return [];
  const target = activity?.target?.template ?? {};
  const shapeType = GameSystemConfig.areaTargetTypes?.[target.type]?.template;
  if (!shapeType) return [];

  const convert = (value: number | undefined) => {
    if (!value) return 0;
    const converted = globalThis.dnd5e?.utils?.convertLength?.(value, target.units, scene.grid.units, { strict: false });
    return (typeof converted === "number" ? converted : value) * (scene.grid.size / scene.grid.distance);
  };
  const size = convert(target.size);
  const width = convert(target.width) || (scene.grid.size);

  const shapeFor = (x: number, y: number, rotation: number, token?: TokenDocument.Implementation) => {
    const base = { x, y, rotation };
    switch (shapeType) {
      case "circle": return { ...base, type: "circle", radius: size };
      case "emanation":
        // As TemplatePlacement.fromActivity builds it: measured from the token's edge, not its centre.
        if (!token) return { ...base, type: "circle", radius: size };
        const { x: tokenX, y: tokenY, width: tokenWidth, height: tokenHeight } = tokenSourcePosition(token);
        return {
          type: "emanation", radius: size,
          base: { type: "token", x: tokenX, y: tokenY, width: tokenWidth, height: tokenHeight, shape: token._source.shape, rotation: 0 }
        };
      case "cone": return { ...base, type: "cone", angle: CONFIG.MeasuredTemplate.defaults.angle, radius: size };
      case "ray":
      case "line": return { ...base, type: "line", length: size, width };
      case "rect":
      case "rectangle": return { ...base, type: "rectangle", width: size, height: size };
      case "ring": return { ...base, type: "ring", radius: size, outerWidth: width, innerWidth: 0 };
      default: return { ...base, type: "circle", radius: size };
    }
  };

  const rollData = activity.getRollData?.() ?? {};
  const elevation = shapeType === "emanation" ? undefined : templateElevation(activity, shapeFor(0, 0, 0));
  const regionData = placements.map(({ x, y, direction, token }) => foundry.utils.mergeObject({
    name: `${activity.item?.name ?? "Template"} [${game.user?.name}]`,
    color: game.user?.color,
    shapes: [shapeFor(x, y, direction ?? 0, token)],
    elevation: elevation ?? { bottom: null, top: null },
    levels: [(canvas as unknown as { level?: { id: string } }).level?.id],
    restriction: { enabled: true, type: "move" },
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    highlightMode: "coverage",
    displayMeasurements: true,
    flags: {
      core: { MeasuredTemplate: true },
      dnd5e: {
        activity: activity.uuid,
        item: activity.item?.uuid,
        origin: activity.getUsageToken?.()?.uuid,
        spellLevel: rollData?.item?.level
      }
    }
  }, { flags: { [MODULE_ID]: { ...midiTemplateFlags(activity), ...extraFlags } } }));

  return await scene.createEmbeddedDocuments("Region", regionData as unknown as RegionDocument.CreateData[]) as unknown as RegionDocument.Implementation[];
}

export function selectTargetsFromTemplates(
  templates: (foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument
    | RegionDocument.Implementation | string)[],
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
 * The tokens an activity's templates target, by the activity's own settings: auto-target action,
 * AoE target type, "-self" and target count. Undefined when the activity does not auto-target.
 */
export function computeActivityTemplateTargets(
  activity: Activity | undefined,
  templates: Parameters<typeof computeTargetsFromTemplates>[0]
): Token.Implementation[] | undefined {
  const autoTarget = getActivityAutoTargetAction(activity);
  if (autoTarget === "none") return undefined;
  const ignoreSelf = (activity?.target?.affects.special ?? "").split(";").includes("-self");
  const tokens = computeTargetsFromTemplates(templates, getToken(activity?.actor), ignoreSelf,
    activity ? getAoETargetType(activity) : "any", autoTarget);
  const maxTargets = Number(activity?.target?.affects.count) || 0;
  return maxTargets > 0 ? tokens.slice(0, maxTargets) : tokens;
}


/**
 * Returns tokens inside a template without modifying game.user.targets.
 * Accepts a MeasuredTemplate placeable, a MeasuredTemplateDocument, a RegionDocument, or a UUID string.
 * In v14, MeasuredTemplates are backed by Regions — when no placeable is available,
 * falls back to Region-based targeting via testPoint().
 * Handles WalledTemplates, VolumetricTemplates, and standard template targeting.
 * Note: When VolumetricTemplates is active, game.user.targets may be modified as a
 * side effect of computeRegion3d — the returned array is still the authoritative result.
 */
export function computeTargetsFromTemplate(
  template: foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument
    | RegionDocument.Implementation | string,
  selfTokenRef: TokenOrDocument | string | null | undefined = "",
  ignoreSelf: boolean = false,
  AoETargetType: string = "any",
  autoTarget?: string
): Token.Implementation[] {
  if (!autoTarget) autoTarget = configSettings.autoTarget;
  if (autoTarget === "none") return [];

  // Resolve to a MeasuredTemplate placeable, falling back to RegionDocument for v14
  let mTemplate: foundry.canvas.placeables.MeasuredTemplate.Implementation | undefined;
  let regionDoc: RegionDocument.Implementation | undefined;

  if (typeof template === "string") {
    const doc = fromUuidSync(template);
    if (doc?.documentName === "Region") {
      // Region UUID (v14 native) — use Region targeting directly
      regionDoc = doc as RegionDocument.Implementation;
    } else if (doc) {
      const mtDoc = doc as MeasuredTemplateDocument;
      mTemplate = mtDoc.object ?? undefined;
      if (!mTemplate && mtDoc._id) {
        // v14 compat: proxy MeasuredTemplateDocument with no placeable — look up backing Region
        regionDoc = canvas.scene?.regions.get(mtDoc._id) ?? undefined;
      }
    }
  } else if ((template as { documentName?: string })?.documentName === "Region") {
    /*
     * A Region document passed directly — including an *unsaved* one. That is what
     * `canvas.regions.placeRegions` hands to its `onChange` callback on every move during
     * placement, and `testPoint` is pure geometry, so it answers correctly before the region is
     * ever saved. This is the live targeting preview.
     */
    regionDoc = template as unknown as RegionDocument.Implementation;
  } else if (template instanceof MeasuredTemplateDocument) {
    mTemplate = template.object ?? undefined;
    if (!mTemplate && template._id) {
      regionDoc = canvas.scene?.regions.get(template._id) ?? undefined;
    }
  } else {
    mTemplate = template as foundry.canvas.placeables.MeasuredTemplate.Implementation;
  }

  // v14: Region-based targeting when no placeable is available
  if (!mTemplate && regionDoc) {
    return computeTargetsFromRegion(regionDoc, selfTokenRef, ignoreSelf, AoETargetType, autoTarget);
  }
  if (!mTemplate) return [];

  // v14 never draws MeasuredTemplates, so the walled shape is never computed and
  // targetsWithinShape() returns nothing - fall through rather than targeting nobody.
  const useWalledTemplates = autoTarget === "walledtemplates"
    && !!game.modules.get("walledtemplates")?.active && !!mTemplate.shape;
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

  const lvtCandidates = installedModules.get("levelsvolumetrictemplates") && !useWalledTemplates
    ? (canvas.tokens?.placeables ?? []).filter(tk => isAoETargetable(tk, { selfToken, ignoreSelf, AoETargetType, autoTarget }))
    : undefined;
  const lvtInside = lvtCandidates
    ? lvtContainedIds(getBackingRegion(mTemplate.document), lvtCandidates)
    : undefined;

  if (lvtInside) {
    const wallsBlockTargeting = ["wallsBlock", "wallsBlockIgnoreDefeated", "wallsBlockIgnoreIncapacitated"].includes(autoTarget);
    const regionDoc = getBackingRegion(mTemplate.document);
    // lvt only sees the declared band, whose top is null - apply the derived top.
    const band = regionDoc ? regionElevationBand(regionDoc) : templateElevationBand(mTemplate.document);
    targetTokens = lvtCandidates!.filter(tk => tk.id && lvtInside.includes(tk.id)
      && withinBand(band, tk)
      && !(wallsBlockTargeting && regionDoc && regionWallBlocked(regionDoc, tk)));
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

/** Vertical extent of an AoE in scene units - core leaves the backing Region's elevation.top null. */
function aoeHeight(shapeType: string, dims: { radius?: number, width?: number, angle?: number, curvature?: string }): number | undefined {
  switch (shapeType) {
    case "circle": case "sphere": case "radius":
      return dims.radius === undefined ? undefined : dims.radius * 2;
    case "ellipse":
      return dims.radius === undefined ? undefined : dims.radius * 2;
    case "rectangle": case "rect": case "line": case "ray": case "ring":
      return dims.width;
    case "cone": {
      if (dims.radius === undefined) return undefined;
      const angleRad = (dims.angle ?? 0) * (Math.PI / 180);
      if (dims.curvature === "flat") return dims.radius * Math.tan(angleRad / 2) * 2;
      if (dims.curvature === "semicircle") return dims.radius - (dims.radius / (1 + Math.tan(angleRad / 2))) * 2;
      return dims.radius * Math.sin(angleRad / 2) * 2;
    }
  }
  return undefined;
}

/** Vertical extent of a region shape (document or source data) in scene units. */
function regionShapeHeight(shape: any): number | undefined {
  if (!shape) return undefined;
  const dp = canvas.scene?.dimensions?.distancePixels ?? 1;
  return aoeHeight(shape.type, {
    radius: (shape.radius ?? shape.radiusX ?? shape.outerWidth) / dp,
    width: (shape.width ?? shape.outerWidth) / dp,
    angle: shape.angle,
    curvature: shape.curvature
  });
}

/** Region elevation band, deriving top from the shape when core leaves it null. */
function regionElevationBand(regionDoc: RegionDocument.Implementation): { bottom: number, top: number } {
  const declaredBottom = regionDoc.elevation?.bottom;
  const bottom = Number.isFinite(declaredBottom) ? declaredBottom as number : -Infinity;
  const declaredTop = regionDoc.elevation?.top;
  if (Number.isFinite(declaredTop)) return { bottom, top: declaredTop as number };
  const height = regionShapeHeight(regionDoc.shapes?.at?.(0));
  /*
   * A region with no declared bottom is unbounded below, and there is no base to measure a derived
   * height from — `-Infinity + height` is still `-Infinity`, which collapsed the band to
   * (-Infinity, -Infinity) and excluded every token. dnd5e 6.0's `TemplatePlacement` sets no
   * elevation at all, so every template region placed through it targeted nobody.
   */
  if (height === undefined || !Number.isFinite(bottom)) return { bottom, top: Infinity };
  return { bottom, top: bottom + height };
}

/** Template elevation band - used during preview, before a Region exists. */
function templateElevationBand(templateDoc: any): { bottom: number, top: number } {
  const bottom = templateDoc.elevation ?? 0;
  const height = aoeHeight(templateDoc.t, {
    radius: templateDoc.distance,
    width: templateDoc.width ?? templateDoc.distance,
    angle: templateDoc.angle,
    curvature: "round"
  });
  return { bottom, top: height === undefined ? Infinity : bottom + height };
}

function withinBand(band: { bottom: number, top: number }, token: Token.Implementation): boolean {
  const elev = tokenSourcePosition(token).elevation;
  return band.bottom <= elev && elev <= band.top;
}

/** The Region backing a template - same id on v14. */
function getBackingRegion(doc: any): RegionDocument.Implementation | undefined {
  if (!doc) return undefined;
  if (doc.documentName === "Region") return doc as RegionDocument.Implementation;
  return (doc._id ? canvas.scene?.regions.get(doc._id) : undefined) ?? undefined;
}

/**
 * Volumetric containment via levelsvolumetrictemplates. Undefined if it can't answer, so callers
 * fall back to midi's own test. Sets game.user.targets as a side effect; midi writes the final set.
 */
function lvtContainedIds(regionDoc: RegionDocument.Implementation | undefined, candidates: Token.Implementation[]): string[] | undefined {
  if (!regionDoc) return undefined;
  const api = (game.modules.get("levelsvolumetrictemplates") as any)?.API;
  if (typeof api?.computeRegion3d !== "function") return undefined;
  return api.computeRegion3d(regionDoc, candidates.map(tk => tk.document), false) ?? [];
}

/** LOS from the region's shape origin to a token - lvt does no wall checking on v14. */
/**
 * The point a Region's area spreads from, for wall and cover checks. Not every shape has x/y: an emanation keeps
 * its position on its base token (dnd5e 6's self-centred areas), a polygon in its points; reading them as 0 measured
 * from the scene's corner.
 */
export function regionShapeOrigin(regionDoc: RegionDocument.Implementation): { x: number, y: number } | undefined {
  const shape = regionDoc.shapes?.at?.(0) as any;
  if (!shape) return undefined;
  const gridSize = canvas.scene?.grid.size ?? 100;
  switch (shape.type) {
    case "emanation": {
      // core moves an attached emanation's base with its token, so the base is where the token is
      const base = shape.base ?? {};
      if (base.type === "token") return { x: base.x + (base.width ?? 1) * gridSize / 2, y: base.y + (base.height ?? 1) * gridSize / 2 };
      if (base.type === "rectangle") return { x: base.x + (base.width ?? 0) / 2, y: base.y + (base.height ?? 0) / 2 };
      return { x: base.x ?? 0, y: base.y ?? 0 };
    }
    case "rectangle": {
      const dx = (0.5 - (shape.anchorX ?? 0)) * (shape.width ?? 0);
      const dy = (0.5 - (shape.anchorY ?? 0)) * (shape.height ?? 0);
      const angle = Math.toRadians(shape.rotation ?? 0);
      return { x: shape.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: shape.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
    }
    case "polygon": {
      const points: number[] = shape.points ?? [];
      const n = points.length / 2;
      if (!n) return undefined;
      let x = 0, y = 0;
      for (let i = 0; i < points.length; i += 2) { x += points[i]; y += points[i + 1]; }
      return { x: x / n, y: y / n };
    }
    default:
      return { x: shape.x ?? 0, y: shape.y ?? 0 };
  }
}

function regionWallBlocked(regionDoc: RegionDocument.Implementation, token: Token.Implementation): boolean {
  const origin = regionShapeOrigin(regionDoc);
  if (!origin) return false;
  return !!CONFIG.Canvas.polygonBackends.sight.testCollision(
    origin,
    tokenSourceCenter(token),
    // @ts-expect-error v14 collision level not in fvtt-types
    { mode: "any", type: "move", level: collisionLevel(token) }
  );
}

/**
 * v14 Region-based targeting: returns tokens inside a Region using testPoint().
 * Used when a MeasuredTemplate has been converted to a Region (v14 compat layer)
 * and no MeasuredTemplate placeable is available.
 * Does not support VolumetricTemplates or WalledTemplates (those modules need their own v14 updates).
 */
function computeTargetsFromRegion(
  regionDoc: RegionDocument.Implementation,
  selfTokenRef: TokenOrDocument | string | null | undefined,
  ignoreSelf: boolean,
  AoETargetType: string,
  autoTarget: string
): Token.Implementation[] {
  const selfToken = getToken(selfTokenRef);
  const wallsBlockTargeting = ["wallsBlock", "wallsBlockIgnoreDefeated", "wallsBlockIgnoreIncapacitated"].includes(autoTarget);
  const candidates = (canvas.tokens?.placeables ?? []).filter(token =>
    token.actor && isAoETargetable(token, { selfToken, ignoreSelf, AoETargetType, autoTarget }));

  if (installedModules.get("levelsvolumetrictemplates")) {
    const inside = lvtContainedIds(regionDoc, candidates);
    if (inside) {
      const band = regionElevationBand(regionDoc);
      return candidates.filter(tk => tk.id && inside.includes(tk.id)
        && withinBand(band, tk)
        && !(wallsBlockTargeting && regionWallBlocked(regionDoc, tk)));
    }
  }

  return candidates.filter(token => isTokenInsideRegion(regionDoc, token, wallsBlockTargeting) && token.id);
}

/**
 * v14 Region-based containment check: mirrors isTokenInside() but uses regionDoc.testPoint().
 * Checks each grid square the token occupies, with optional wall-blocking.
 */
function isTokenInsideRegion(
  regionDoc: RegionDocument.Implementation,
  token: Token.Implementation,
  wallsBlockTargeting: boolean
): boolean {
  const grid = canvas.scene?.grid;
  if (!grid) return false;

  if (configSettings.optionalRules.wallsBlockRange !== "none" && hasWallBlockingCondition(token))
    return false;
  if (!isValidTarget(token)) return false;

  const wallOrigin = regionShapeOrigin(regionDoc) ?? { x: 0, y: 0 };

  const pos = tokenSourcePosition(token);
  const startX = pos.width >= 1 ? 0.5 : (pos.width / 2);
  const startY = pos.height >= 1 ? 0.5 : (pos.height / 2);
  for (let x = startX; x < pos.width; x++) {
    for (let y = startY; y < pos.height; y++) {
      const testX = pos.x + x * grid.size!;
      const testY = pos.y + y * grid.size!;

      // Use polygonTree.testPoint with tolerance=1 to include boundary tokens.
      // regionDoc.testPoint uses Clipper strict containment (boundary = outside),
      // but MeasuredTemplate.shape.contains was boundary-inclusive. Tolerance of 1px matches that behavior.
      // Note: Foundry v14's token.testInsideRegion() uses tolerance 0.75 — we intentionally use 1 here
      // to maintain parity with the legacy isTokenInside() boundary-inclusive behavior.
      let contains = withinBand(regionElevationBand(regionDoc), token)
        // @ts-expect-error polygonTree.testPoint accepts optional distance param not in type defs
        && regionDoc.polygonTree.testPoint({ x: testX, y: testY }, 1);

      if (contains && wallsBlockTargeting) {
        // Always check - lvt does no wall checking on v14.
        contains = !CONFIG.Canvas.polygonBackends.sight.testCollision(
          wallOrigin,
          { x: testX, y: testY },
          // @ts-expect-error v14 collision level not in fvtt-types
          { mode: "any", type: "move", level: collisionLevel(token) }
        );
      }

      if (contains) return true;
    }
  }
  return false;
}

export function computeTargetsFromTemplates(
  templates: (foundry.canvas.placeables.MeasuredTemplate.Implementation | MeasuredTemplateDocument
    | RegionDocument.Implementation | string)[],
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

/**
 * Get currently selected tokens in the scene or user's character's tokens.
 * @returns {Token5e[]}
 */


export function getSceneTargets(): Token.Implementation[] {
  return globalThis.dnd5e.utils.getSceneTargets();
}