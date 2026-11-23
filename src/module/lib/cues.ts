import { tokenFor } from "./tokenResolver.js";
import { MODULE_ID } from "../../midi-qol.js";
import type { Workflow } from "../Workflow.js";
import { outcomes, type TargetOutcome } from "./outcomes.js";
import { presentCue } from "../services/presenters/service.js";
import { tagValue } from "./tags.js";
import { getTokenDocument } from "../utils.js";

/*
 * M18 stage 1 (plan ~/Documents/midi-next-M18-plan-2026-11-22.md): a use's cues, plain data at its meaningful points,
 * raised from the step passes, presented here and on every other active client (query midi-qol.cue).
 */

export type ChannelOverride = "default" | "none" | { playlist: string, sound: string } | string;

export interface Cue {
  cue: string;
  /** The use's id (the workflow), none for a cue outside a use */
  useId?: string;
  /** Token document uuids */
  source?: string;
  targets: string[];
  outcomes: TargetOutcome[];
  activity?: string;
  item?: string;
  tags: { kind?: string, attack?: string, school?: string, damageTypes: string[], spellLevel?: number, actionType?: string, defaultDamageType?: string };
  /** What midi's sound lookup keys on */
  sound: { actorType?: string, itemType?: string, subtype?: string, baseItem?: string };
  templates: string[];
  critical?: boolean;
  fumble?: boolean;
  /** The use's override per channel ("none": nothing on that channel) */
  presentation?: Partial<Record<"visual" | "sound" | "text", ChannelOverride>>;
}

const CUE_QUERY = "midi-qol.cue";

/** Which cues each step pass raises */
const STEP_CUES: Record<string, ((w: Workflow) => string[])> = {
  "post midi-qol.PreambleComplete": () => ["use.start"],
  "pre midi-qol.WaitForAttackRoll": w => w.activity?.attack ? ["attack.roll"] : [],
  "post midi-qol.AttackRollComplete": w => {
    if (!w.activity?.attack || !w.attackRoll) return [];
    if (w.isCritical) return ["attack.critical"];
    if (w.isFumble) return ["attack.fumble"];
    return [w.hitTargets.size || w.hitTargetsEC.size ? "attack.hit" : "attack.miss"];
  },
  "post midi-qol.DamageRollComplete": w => (w.damageRolls?.length ? ["damage.rolled"] : []),
  // Only a use with a save: without one, midi's failedSaves holds the targets hit (for applying effects)
  "post midi-qol.SavesComplete": w => !w.hasSave ? [] : [
    ...(w.failedSaves.size ? ["save.failed"] : []),
    ...(w.saves.size ? ["save.succeeded"] : [])
  ],
  "post midi-qol.AllRollsComplete": w => {
    const all = [...outcomes(w).values()];
    return [
      ...(all.some(o => (o.damage?.hp ?? 0) > 0 || (o.damage?.temp ?? 0) > 0) ? ["damage.applied"] : []),
      ...(all.some(o => (o.damage?.healed ?? 0) > 0) ? ["heal.applied"] : [])
    ];
  },
  "post midi-qol.ApplyDynamicEffects": w => ([...outcomes(w).values()].some(o => o.effects.length) ? ["effect.applied"] : []),
  "post midi-qol.RollFinished": () => ["use.end"]
};

/** As midi's sound settings key an item (MidiSounds.getSubtype) */
function subtypeOf(item: Item.Implementation | undefined): string {
  const type = String(item?.type ?? "");
  if (!type) return "";
  const system = item!.system as { type?: { value?: string }, school?: string };
  switch (type) {
    case "weapon": case "equipment": case "consumable": case "tool": return `${type}.${system.type?.value ?? ""}`;
    case "spell": return `spell.${system.school ?? ""}`;
    default: return `${type}any`;
  }
}

function overrideOf(workflow: Workflow): Cue["presentation"] {
  const item = workflow.item;
  const fromItem = item?.getFlag(MODULE_ID, "presentation") as (Cue["presentation"] & { activities?: Record<string, Cue["presentation"]> }) | "none" | undefined;
  const fromUse = workflow.workflowOptions?.presentation as Cue["presentation"] | "none" | undefined;
  const all = (value: unknown): Cue["presentation"] => value === "none" ? { visual: "none", sound: "none", text: "none" } : (value as Cue["presentation"]) ?? {};
  const activityId = workflow.activity?.id ?? "";
  const fromActivity = typeof fromItem === "object" ? fromItem.activities?.[activityId] : undefined;
  const { activities: _activities, ...itemLevel } = typeof fromItem === "object" ? fromItem : { activities: undefined, ...all(fromItem) };
  const merged: Cue["presentation"] = { ...itemLevel, ...all(fromActivity), ...all(fromUse) };
  // Automated Animations' killAnim (set by midi for over-time ticks, or on the item): no animation
  if (foundry.utils.getProperty(item ?? {}, "flags.autoanimations.killAnim")) merged.visual = "none";
  return merged;
}

/** A use's cue as data */
export function cueFor(workflow: Workflow, cue: string): Cue {
  const tag = (name: string) => tagValue(workflow, name);
  const item = workflow.item as Item.Implementation | undefined;
  const byTarget = outcomes(workflow);
  const damageTypes = tag("use.damageTypes");
  return {
    cue,
    useId: workflow.id,
    source: tokenFor(workflow.token)?.uuid ?? undefined,
    targets: workflow.targets.documents.map(t => t.uuid).filter((uuid): uuid is string => !!uuid),
    outcomes: [...byTarget.values()],
    activity: workflow.activity?.uuid,
    item: item?.uuid ?? undefined,
    tags: {
      kind: tag("use.kind") as string | undefined, attack: tag("use.attack") as string | undefined, school: tag("use.school") as string | undefined,
      damageTypes: damageTypes instanceof Set ? [...damageTypes] as string[] : [], spellLevel: tag("use.spellLevel") as number | undefined,
      actionType: workflow.activity?.actionType, defaultDamageType: workflow.defaultDamageType
    },
    // @ts-expect-error no dnd5e-types
    sound: { actorType: item?.parent?.type, itemType: item?.type, subtype: subtypeOf(item), baseItem: item?.system?.type?.baseItem ?? "" },
    templates: [...(workflow.templateUuids ?? [])],
    critical: !!workflow.isCritical,
    fumble: !!workflow.isFumble,
    presentation: overrideOf(workflow)
  };
}

/** Present on this client and send to the other active clients */
export function raiseCue(cue: Cue): void {
  Hooks.callAll("midi-qol.cue", cue);
  void presentCue(cue);
  for (const user of game.users ?? []) {
    if (user.isSelf || !user.active) continue;
    void user.query(CUE_QUERY, cue as unknown as Record<string, unknown>).catch(() => undefined);
  }
}

/** The step pass hook (Workflow's engine host): the cues of this pass */
export function raiseStepCues(workflow: Workflow, prePost: "pre" | "post", step: string | undefined): void {
  const at = step ? STEP_CUES[`${prePost} ${step}`] : undefined;
  if (!at || workflow.readOnly) return;
  try {
    for (const cue of at(workflow)) raiseCue(cueFor(workflow, cue));
  } catch (err) {
    console.warn(`midi-qol | cues at ${prePost} ${step}`, err);
  }
}

/** A cue outside a use: a creature dropped to 0 hit points */
export function raiseCreatureCue(cue: string, token: TokenDocument.Implementation | undefined): void {
  raiseCue({ cue, targets: token?.uuid ? [token.uuid] : [], outcomes: [], tags: { damageTypes: [] }, sound: {}, templates: [] });
}

export function registerCues() {
  CONFIG.queries[CUE_QUERY] = async (data: unknown) => { await presentCue(data as Cue); return true; };
}
