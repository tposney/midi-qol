import { tokenFor } from "./tokenResolver.js";
import { MODULE_ID } from "../../midi-qol.js";
import type { Workflow } from "../Workflow.js";
import { outcomes, type TargetOutcome } from "./outcomes.js";
import { presentCue, presentationLanded, presentationWaitMs, trackPresentation } from "../services/presenters/service.js";
import { tagValue } from "./tags.js";
import { getTokenDocument, isAutoFastForward } from "../utils.js";
import { reveals } from "../services/revealPolicy/service.js";

/*
 * M18 stage 1 (plan ~/Documents/midi-next-M18-plan-2026-11-22.md): a use's cues, plain data at its meaningful points,
 * raised from the step passes, presented here and on every other active client (query midi-qol.cue).
 */

export interface ViewerPreferences {
  /** Sounds' volume, 0-1 */
  volume: number;
  /** Show animations: false, no visual presenter plays here (where the use runs, a broadcasting one leaves this user out) */
  visuals: boolean;
  reducedMotion: boolean;
}

export type ChannelOverride = "default" | "none" | { playlist: string, sound: string } | string;

export interface Cue {
  cue: string;
  /** The use's id (the workflow), none for a cue outside a use */
  useId?: string;
  /** The user whose client raised it (a presenter that broadcasts, Sequencer's, plays only there) */
  raisedBy?: string;
  /** Token document uuids */
  source?: string;
  targets: string[];
  outcomes: TargetOutcome[];
  activity?: string;
  item?: string;
  /** The item's name at the use (the item may be gone when the cue is read: a consumed potion) */
  itemName?: string;
  /** The ammunition item's uuid */
  ammunition?: string;
  tags: { kind?: string, attack?: string, school?: string, damageTypes: string[], spellLevel?: number, actionType?: string, defaultDamageType?: string };
  /** What midi's sound lookup keys on */
  sound: { actorType?: string, itemType?: string, subtype?: string, baseItem?: string };
  templates: string[];
  critical?: boolean;
  fumble?: boolean;
  /** A private use's (whispered or blind card): the only users who get its cues; undefined: everyone */
  audience?: string[];
  /** The users who may see its visual presentation (a presenter that broadcasts limits itself to them); undefined: everyone */
  visualAudience?: string[];
  /** This client's player's preferences, set where the cue is presented */
  viewer?: ViewerPreferences;
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
    itemName: item?.name ?? undefined,
    ammunition: workflow.ammunition?.uuid ?? undefined,
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
    presentation: overrideOf(workflow),
    audience: audienceOf(workflow.chatCard)
  };
}

/** A whispered card's recipients (with its author and the GMs); a blind card's author and GMs */
function audienceOf(card: ChatMessage.Implementation | undefined | null): string[] | undefined {
  if (!card || (!card.blind && !card.whisper?.length)) return undefined;
  const ids = new Set<string>(card.blind ? [] : card.whisper.filter((id): id is string => typeof id === "string"));
  if (card.author?.id) ids.add(card.author.id);
  for (const user of game.users ?? []) if (user.isGM && user.id) ids.add(user.id);
  return [...ids];
}

function tokenOf(uuid: string | undefined): TokenDocument.Implementation | undefined {
  const doc = uuid ? fromUuidSync(uuid) : undefined;
  return doc instanceof TokenDocument ? doc : undefined;
}

function ownsToken(user: User.Implementation, token: TokenDocument.Implementation | undefined): boolean {
  return !!token?.actor?.testUserPermission(user, "OWNER");
}

/**
 * A cue as `user` may know it, undefined if they get none (a private use's). A hidden source is left out unless they
 * may learn a hidden attacker; a hidden target is left out unless they own it; a target's damage by type (its
 * resistances) and its hit points lost or gained only where the reveal policy lets them learn those.
 */
export function cueForViewer(cue: Cue, user: User.Implementation): Cue | undefined {
  if (cue.audience && !cue.audience.includes(user.id ?? "")) return undefined;
  if (user.isGM) return cue;
  const source = tokenOf(cue.source);
  const caster = source?.actor ?? undefined;
  const hiddenSource = !!source?.hidden && !reveals({ subject: "hiddenAttacker", user, caster });
  const shownTarget = (uuid: string) => { const token = tokenOf(uuid); return !token?.hidden || ownsToken(user, token); };
  const outcomes = cue.outcomes.filter(o => shownTarget(o.target)).map(outcome => {
    if (!outcome.damage) return outcome;
    const target = tokenOf(outcome.target)?.actor ?? undefined;
    const resistances = reveals({ subject: "resistances", user, caster, target });
    const hpState = reveals({ subject: "hpState", user, caster, target });
    if (resistances && hpState) return outcome;
    const { rolled, applied, prevented, hp, temp, healed, droppedToZero } = outcome.damage;
    return { ...outcome, damage: {
      ...(resistances ? { rolled, applied, prevented } : { rolled: {}, applied: {}, prevented: {} }),
      ...(hpState ? { hp, temp, healed, droppedToZero } : {})
    } };
  });
  return { ...cue, source: hiddenSource ? undefined : cue.source, targets: cue.targets.filter(shownTarget), outcomes };
}

/** The users who may see a cue's visuals (its source and all its targets shown to them, Show animations on); undefined: everyone */
function visualAudienceOf(cue: Cue): string[] | undefined {
  const users = game.users?.contents ?? [];
  const allowed = users.filter(user => {
    if (user.getFlag("midi-qol", "visualsOff")) return false;
    const seen = cueForViewer(cue, user);
    return !!seen && seen.source === cue.source && seen.targets.length === cue.targets.length;
  });
  return allowed.length === users.length ? undefined : allowed.map(u => u.id).filter((id): id is string => !!id);
}

/** Present on this client and send to the other active clients */
export function raiseCue(cue: Cue): void {
  cue.raisedBy ??= game.user?.id;
  cue.visualAudience ??= visualAudienceOf(cue);
  // Each user gets the cue as they may know it (M18 stage 2), this one too
  const own = game.user ? cueForViewer(cue, game.user) : undefined;
  if (own) {
    Hooks.callAll("midi-qol.cue", own);
    // Claiming is async: a wait for animations waits for it too
    trackPresentation(own.useId, presentCue(own));
  }
  for (const user of game.users ?? []) {
    if (user.isSelf || !user.active) continue;
    const theirs = cueForViewer(cue, user);
    if (theirs) void user.query(CUE_QUERY, theirs as unknown as Record<string, unknown>).catch(() => undefined);
  }
}

/** Where a use waits for its animations ("Wait for animations"): before damage is applied, before effects */
const WAIT_BEFORE = new Set(["midi-qol.AllRollsComplete", "midi-qol.ApplyDynamicEffects"]);

/**
 * The step pass hook: before damage and effects, the wait (capped; the GM's Wait for animations, off at 0) for what the
 * use's visual presenters have played, unless its rolls are auto fast-forwarded;
 * undefined when there is nothing to wait for (the pass then adds no await)
 */
export function stepPresentationWait(workflow: Workflow, prePost: "pre" | "post", step: string | undefined): Promise<void> | undefined {
  if (prePost !== "pre" || !step || !WAIT_BEFORE.has(step) || workflow.readOnly || !canvas?.ready) return undefined;
  // For now: a use whose rolls are auto fast-forwarded (its attack's, else its damage's) never waits
  if (isAutoFastForward(workflow.activity?.attack ? "attack" : "damage", { workflow })) return undefined;
  const cap = presentationWaitMs();
  return cap ? presentationLanded(workflow.id, cap) : undefined;
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
  // On the other clients: presented, and raised as midi-qol.cueReceived (a recorder on every client sees every cue)
  CONFIG.queries[CUE_QUERY] = async (data: unknown) => {
    Hooks.callAll("midi-qol.cueReceived", data as Cue);
    await presentCue(data as Cue);
    return true;
  };
}
