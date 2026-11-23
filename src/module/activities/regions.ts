import { tokenFor, tokenOf } from "../lib/tokenResolver.js";
import { MidiActivity } from "./midiActivity.js";
import { tokenSourceCenter } from "../utils.js";
import { Activity, EmanationShapeData } from "../../globals.js";
import { MODULE_ID, error, i18n, busyWait } from "../../midi-qol.js";
import { timedAwaitExecuteAsGM } from "../GMAction.js";
import { Workflow } from "../Workflow.js";
import { getToken, activityHasAutoPlaceTemplate, getActivityAutoTargetAction, isActivityType } from "../utils.js";
import { createActivityTemplateRegions, selectTargetsFromTemplates } from "./activityHelpers.js";

/*
 * An activity's regions: the emanation it places around its user, and the behaviours (rules, light, attachment) it gives a region.
 * (M14: from MidiActivityMixin.ts, midi's activity class layer until then.)
 */

/**
 * Apply optional region update + region behavior creation. GMs run locally; non-GMs send
 * a single batched socket call. We gate on isGM because RegionDocument#canUserModify can
 * report "update" permission for the player who just placed the template (Foundry grants
 * owner perms to the creator), but creating embedded RegionBehaviors requires scene-level
 * write which only GMs have — checking update perms gives a false positive there.
 */
export async function writeRegion(
  regionDoc: any,
  ops: { update?: Record<string, any>; behaviors?: any[] }
): Promise<any> {
  const hasUpdate = !!(ops.update && Object.keys(ops.update).length > 0);
  const hasBehaviors = !!(ops.behaviors && ops.behaviors.length > 0);
  if (!hasUpdate && !hasBehaviors) return undefined;

  if (game.user?.isGM) {
    if (hasUpdate) await regionDoc.update(ops.update);
    if (hasBehaviors) return regionDoc.createEmbeddedDocuments("RegionBehavior", ops.behaviors);
    return undefined;
  }

  return timedAwaitExecuteAsGM("setupRegion", {
    regionUuid: regionDoc.uuid,
    update: hasUpdate ? ops.update : undefined,
    behaviors: hasBehaviors ? ops.behaviors : undefined,
  });
}

// Region update deferred from placeEmanationTemplate, consumed by
// attachRegionActivityBehavior later in the same use flow (same activity clone)
export async function resolveAttachTokenId(activity: MidiActivity, workflow: Workflow | undefined, mode: "caster" | "target"): Promise<string | undefined> {
  if (mode === "caster") return (workflow?.token ?? tokenOf(tokenFor(activity.actor)))?.document.id ?? undefined;
  const fromWorkflow = workflow?.targets.tokens ?? [];
  const targets = fromWorkflow.length > 0
    ? fromWorkflow
    : Array.from(game.user?.targets ?? []) as Token.Implementation[];
  if (targets.length === 0) {
    ui.notifications?.warn(i18n("midi-qol.REGION_BEHAVIOR.attachToken.noTarget"));
    return undefined;
  }
  if (targets.length === 1) return targets[0].document.id ?? undefined;
  return promptAttachTargetPicker(activity, targets);
}

export async function promptAttachTargetPicker(activity: MidiActivity, targets: Token.Implementation[]): Promise<string | undefined> {
  const optionsHtml = targets
    .map(t => `<option value="${t.document.id}">${foundry.utils.escapeHTML(t.document.name ?? t.name ?? t.id ?? "")}</option>`)
    .join("");
  const content = `
    <p>${i18n("midi-qol.REGION_BEHAVIOR.attachToken.pickerHint")}</p>
    <select name="attachTargetId" autofocus>${optionsHtml}</select>
  `;
  let selectedId: string | undefined;
  await foundry.applications.api.DialogV2.prompt<foundry.applications.api.DialogV2.PromptConfig>({
    window: { title: i18n("midi-qol.REGION_BEHAVIOR.attachToken.pickerTitle") },
    content,
    ok: {
      callback: (_evt, button) => {
        const form = button.form as HTMLFormElement | null;
        const select = form?.querySelector('select[name="attachTargetId"]') as HTMLSelectElement | null;
        const value = select?.value;
        if (value) selectedId = value;
      },
    },
    rejectClose: false,
  });
  return selectedId;
}

export async function placeEmanationTemplate(activity: MidiActivity, workflow: Workflow | undefined) {
  const autoCreateTemplate = activityHasAutoPlaceTemplate(activity);
  const actor = activity.item.parent;
  const tokenToUse = workflow?.token ?? tokenOf(tokenFor(actor));
  if (!tokenToUse) return;
  if (autoCreateTemplate) {
    const templateDocuments = await createActivityTemplateRegions(activity, [{
      ...tokenSourceCenter(tokenToUse), direction: 0, token: tokenToUse.document
    }], {
      actorUuid: actor?.uuid,
      tokenId: tokenToUse.id,
      itemUuid: activity.item?.uuid
    });

    if (templateDocuments && templateDocuments.length > 0) {
      const regionDoc = templateDocuments[0];
      const docToStore = regionDoc;
      await busyWait(10);

      if (regionDoc) {
        const regionUpdate: Record<string, any> = {};
        // Token attachment is resolved in attachRegionActivityBehavior, which runs
        // after template targeting so attachToken "target" sees the template targets.
        // Apply configured region visibility (default ALWAYS from compat shim)
        const rbConfig = activity.regionBehavior;
        if (rbConfig?.enabled && rbConfig.regionVisibility !== undefined) {
          regionUpdate.visibility = rbConfig.regionVisibility;
        }
        // Defer the GM round-trip: attachRegionActivityBehavior runs later in the
        // same use flow and will batch activity update with behavior creation into one
        // socket call.
        if (Object.keys(regionUpdate).length) {
          activity._pendingRegionUpdate = regionUpdate;
        }
      }

      if (workflow) {
        workflow.templateUuid = docToStore.uuid;
        if (getActivityAutoTargetAction(activity) !== "none") selectTargetsFromTemplates([docToStore.uuid]);
      } else selectTargetsFromTemplates([docToStore.uuid]);
      return templateDocuments;
    }
  }
}

/**
 * Attach a MidiRegionActivityBehaviorType to a RegionDocument.
 * If `regionBehavior.enabled` is set on activity activity, uses the stored config.
 * Otherwise falls back to auto-deriving from the overtime sibling activity.
 * @param regionDoc The Region to attach the behavior to
 * @param workflow The current workflow
 * @param overTimeActivity The activity with isOverTimeFlag (may differ from `activity` if `activity` is the Cast activity)
 * @param castLevel The spell level from the usage message (set by dnd5e's _prepareUsageScaling before _usageChatContext)
 */
/**
 * The damage type a region's uses roll a part with several types as (dnd5e's Spirit Guardians: necrotic or radiant):
 * the cast's own choice of one, else the caster's answer, asked once as the region is made. None: the uses ask.
 */
async function regionDamageType(activity: MidiActivity, rules: { action: string, targetUuid: string }[], workflow: Workflow | undefined): Promise<string | undefined> {
  const types = new Set<string>();
  for (const rule of rules) {
    if (rule.action !== "useActivity") continue;
    const used = fromUuidSync(rule.targetUuid, { strict: false }) as { damage?: { parts?: { types?: Set<string> }[] } } | null;
    for (const part of used?.damage?.parts ?? []) if ((part.types?.size ?? 0) > 1) for (const type of part.types!) types.add(type);
  }
  if (!types.size) return undefined;
  const given = workflow?.workflowOptions?.damageTypeChoice ?? Object.values(workflow?.choices ?? {}).find(v => typeof v === "string" && types.has(v));
  if (typeof given === "string" && types.has(given)) return given;
  const labels = CONFIG.DND5E.damageTypes as Record<string, { label?: string }>;
  const first = [...types][0];
  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n?.format("midi-qol.REGION_BEHAVIOR.damageType.title", { name: activity.item?.name ?? "" }) ?? "" },
    content: `<p>${foundry.utils.escapeHTML(i18n("midi-qol.REGION_BEHAVIOR.damageType.content"))}</p>`,
    buttons: [...types].map((type, i) => ({ action: type, label: game.i18n?.localize(labels[type]?.label ?? type) ?? type, default: i === 0 })),
    rejectClose: false
  }).catch(() => undefined);
  return typeof chosen === "string" && types.has(chosen) ? chosen : first;
}

export async function attachRegionActivityBehavior(activity: MidiActivity, regionDoc: RegionDocument.Implementation, workflow: Workflow, overTimeActivity: any, castLevel?: number) {
  const rbConfig = activity.regionBehavior;
  // Collect behaviors to attach and any region update; writeRegion() batches them
  // into a single GM round-trip (or runs locally if the user has permission).
  const behaviors: any[] = [];
  let regionUpdate: any | undefined;
  // A cast that rolls against the creatures in the area has dealt with those already inside.
  const castAffectsTargets = ["attack", "damage", "save"].some(type => isActivityType(activity, type)) && !!workflow?.targets?.count;
  // Effects applied while a token is inside are dnd5e's apply-effect behaviour; midi's own behaviour runs activities.
  const effectBehavior = (effectUuids: string[], dispositionFilter: number, excludeSource: boolean) => {
    if (!effectUuids.length) return;
    const { FRIENDLY, NEUTRAL, HOSTILE } = CONST.TOKEN_DISPOSITIONS;
    const casterDisposition = workflow?.token?.document?.disposition ?? activity.actor?.prototypeToken?.disposition ?? FRIENDLY;
    // midi's enemies are every disposition other than the caster's; allies are the caster's own.
    const dispositions = dispositionFilter === -1 ? [FRIENDLY, NEUTRAL, HOSTILE].filter(d => d !== casterDisposition)
      : dispositionFilter === 1 ? [casterDisposition] : [];
    behaviors.push({
      type: "dnd5e.applyActiveEffect",
      name: `${activity.item?.name ?? "Activity"} Region Effects`,
      system: { effects: [...new Set(effectUuids)], dispositions },
      flags: { [MODULE_ID]: { excludeSource } }
    });
  };

  // If explicitly configured on activity activity, use stored config
  // Convert portable IDs/identifiers from the activity schema to full UUIDs for the behavior type
  if (rbConfig?.enabled) {
    const resolvedRules: Array<{trigger: string, action: string, targetUuid: string}> = [];
    const effectUuids: string[] = [];
    const entryEffectIds = new Set((rbConfig.rules ?? []).filter(rule => rule.action === "applyEffect" && rule.trigger === "entry").map(rule => rule.targetId));
    for (const rule of rbConfig.rules ?? []) {
      if (rule.action === "useActivity") {
        // @ts-expect-error no dnd5e types for activities
        const act = activity.item?.system.activities?.find(
          // Its identifier (what the region editor stores), midi's identifier, or its id: dnd5e 6 gives every activity an
          // identifier, so an id compared only when there is none would never match
          (a: any) => [a.identifier, a.midiProperties?.identifier, a.id].includes(rule.targetId)
        );
        if (act) resolvedRules.push({ trigger: rule.trigger, action: rule.action, targetUuid: act.uuid });
      } else if (rule.action === "applyEffect" || rule.action === "removeEffect") {
        const effect = activity.item?.effects.get(rule.targetId);
        if (!effect) continue;
        // Applied on entry (and removed on exit, implied) is dnd5e's behaviour; at any other event the rule is midi's own
        if (rule.action === "applyEffect" && rule.trigger === "entry") effectUuids.push(effect.uuid);
        else if (!(rule.action === "removeEffect" && rule.trigger === "exit" && entryEffectIds.has(rule.targetId)))
          resolvedRules.push({ trigger: rule.trigger, action: rule.action, targetUuid: effect.uuid });
      }
    }
    effectBehavior(effectUuids, rbConfig.dispositionFilter ?? -1, rbConfig.excludeSource ?? true);

    // A used activity's damage part with several types: the caster chooses once, now, for every use the region runs
    const damageType = resolvedRules.some(r => r.action === "useActivity") ? await regionDamageType(activity, resolvedRules, workflow) : undefined;
    if (resolvedRules.length) behaviors.push({
      type: `${MODULE_ID}.regionActivity` as const,
      name: `${activity.item?.name ?? "Activity"} Region Activity`,
      system: {
        sourceItemUuid: activity.item?.uuid ?? "",
        sourceActorUuid: activity.actor?.uuid ?? "",
        rules: resolvedRules,
        dispositionFilter: rbConfig.dispositionFilter ?? -1,
        castLevel: castLevel ?? workflow?.spellLevel ?? 0,
        ...(damageType ? { damageType } : {}),
        excludeSource: rbConfig.excludeSource ?? true,
        oncePerTurn: rbConfig.oncePerTurn ?? true,
        activationEntry: !castAffectsTargets,
        wallRestriction: rbConfig.wallRestriction ?? "none",
        moveDistance: rbConfig.moveDistance ?? 0,
        moveDirection: rbConfig.moveDirection ?? "away",
        moveTiming: rbConfig.moveTiming ?? "start",
      },
    });

    // Set region restriction if a wall restriction type is selected
    if (rbConfig.wallRestriction && rbConfig.wallRestriction !== "none") {
      regionUpdate = { restriction: { enabled: true, type: rbConfig.wallRestriction, priority: 0 } };
    }
  } else if (overTimeActivity) {
    // Fallback: auto-derive from overtime activity (existing logic, kept for backward compat)
    const overTimeProps = overTimeActivity.overTimeProperties;
    const triggerTurnStart = overTimeProps?.turnChoice === "start";
    const triggerTurnEnd = overTimeProps?.turnChoice === "end";

    // Collect dontApply effect UUIDs from the item — these are entry/exit effects
    const effectUuids: string[] = [];
    for (const effect of activity.item?.effects ?? []) {
      if (!effect?.id) continue;
      if (effect.transfer) continue;
      if (!effect.flags?.dae?.dontApply) continue;
      effectUuids.push(effect.uuid);
    }

    const activityUuid = overTimeActivity.uuid ?? "";
    const rules: Array<{trigger: string, action: string, targetUuid: string}> = [];
    if (activityUuid) rules.push({ trigger: "entry", action: "useActivity", targetUuid: activityUuid });
    if (triggerTurnStart && activityUuid) rules.push({ trigger: "turnStart", action: "useActivity", targetUuid: activityUuid });
    if (triggerTurnEnd && activityUuid) rules.push({ trigger: "turnEnd", action: "useActivity", targetUuid: activityUuid });
    effectBehavior(effectUuids, -1, true);

    if (rules.length) behaviors.push({
      type: `${MODULE_ID}.regionActivity` as const,
      name: `${activity.item?.name ?? "Activity"} Region Activity`,
      system: {
        sourceItemUuid: activity.item?.uuid ?? "",
        sourceActorUuid: activity.actor?.uuid ?? "",
        rules,
        dispositionFilter: -1,
        castLevel: castLevel ?? workflow?.spellLevel ?? 0,
        excludeSource: true,
        oncePerTurn: true,
        activationEntry: !castAffectsTargets,
      },
    });
  }

  // Attach light behavior if configured on activity activity
  const lightConfig = activity.regionLight;
  if (lightConfig?.enabled && (lightConfig.dim > 0 || lightConfig.bright > 0)) {
    behaviors.push({
      type: `${MODULE_ID}.regionLight` as const,
      name: `${activity.item?.name ?? "Activity"} Region Light`,
      system: {
        dim: lightConfig.dim ?? 0,
        bright: lightConfig.bright ?? 0,
        color: lightConfig.color || null,
        alpha: lightConfig.alpha ?? 0.5,
        luminosity: lightConfig.luminosity ?? 0.5,
        animationType: lightConfig.animationType || null,
        animationSpeed: lightConfig.animationSpeed ?? 5,
        animationIntensity: lightConfig.animationIntensity ?? 5,
      },
    });
  }

  // Merge in any update deferred from placeEmanationTemplate (attachment / visibility)
  const pendingUpdate = activity._pendingRegionUpdate;
  if (pendingUpdate) {
    regionUpdate = { ...pendingUpdate, ...(regionUpdate ?? {}) };
    delete activity._pendingRegionUpdate;
  }

  // Resolve token attachment for all template types. "default" preserves the
  // pre-attachToken behavior: auto-placed emanations follow the caster, all other
  // templates are stationary. Attachment configures the region itself, so it
  // applies regardless of regionBehavior.enabled (which only gates the behavior rules).
  const attachMode = activity.regionBehavior?.attachToken ?? "default";
  const effectiveAttachMode = attachMode === "default"
    ? (activityHasAutoPlaceTemplate(activity) ? "caster" : undefined)
    : attachMode;
  if ((effectiveAttachMode === "caster" || effectiveAttachMode === "target")
      && !activity.target?.template?.stationary
      && !(regionUpdate?.attachment)) {
    const attachId = await resolveAttachTokenId(activity, workflow, effectiveAttachMode);
    if (attachId) {
      regionUpdate = { ...(regionUpdate ?? {}), attachment: { token: attachId } };
      // An emanation is measured from its base, so seat it on the token it now follows, as core's attach does.
      const token = regionDoc.parent?.tokens.get(attachId)?._source;
      const shapes = regionDoc._source.shapes as (typeof regionDoc._source.shapes[number] | EmanationShapeData)[];
      if (token && shapes.some(s => s.type === "emanation")) {
        regionUpdate.shapes = shapes.map(s => (s.type === "emanation" && s.base?.type === "token")
          ? { ...s, base: { ...s.base, x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape } }
          : s);
      }
    }
  }

  await writeRegion(regionDoc, { update: regionUpdate, behaviors });
}
