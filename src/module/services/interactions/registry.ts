import type { Activity } from "../../../globals.js";
import { Registry } from "../../api/registry.js";
import { completeActivityUse } from "../../utils.js";
import { configSettings } from "../../settings.js";
import { getDistance } from "../distance/service.js";
import { budget, isTracked, spend, type BudgetKindId } from "../economy/ledger.js";
import { meleeReach } from "../economy/reach.js";
import { tokenFor } from "../../lib/tokenResolver.js";

/*
 * M8a: interactions (proposal section 8; plan ~/Documents/midi-next-M8-plan-2026-11-23.md). A creature acts on the
 * world, not only on enemies: Hide, Search, Help, Stabilize, Grapple / Shove, Escape, doors. Each is a registered
 * entry (midi's own defaults are registered as another module's would be):
 *
 *   MidiQOL.interactions.register("my-module.peek", {
 *     label: "Peek", icon: "fa-solid fa-eye", targets: "door", range: 5, cost: { action: 1 },
 *     available: ({ subject, target }) => target.ds === CONST.WALL_DOOR_STATES.LOCKED ? undefined : "only a locked door",
 *     run: async ({ subject, target }) => { ... }
 *   });
 *
 * `targets`: what it acts on (self, a creature, a door). `available` gives the reason it can't be done now, or
 * nothing; the registry adds the common ones (wrong kind of target, out of range, the cost not affordable this turn).
 * `run` does it, or `activity` names an action item's activity to use against the target (its own use charges its
 * cost); a `run` interaction's cost is spent here. Costs are turn costs: only in a running combat. Interactions are offered on the Token HUD (8b) and to macros
 * (`MidiQOL.interactions.run`).
 */

export type InteractionTargetKind = "self" | "creature" | "door";
/**
 * What an interaction costs this turn: the ledger's kinds, and `object`: the free object interaction (the turn window's
 * objectInteraction counter, with the Doors and object interactions setting), or the action once it is used (2024:
 * the Utilize action)
 */
export type InteractionCost = Partial<Record<BudgetKindId | "object", number>>;

const objectUsed = (actor: Actor.Implementation) => !!budget(actor, "action").counters.objectInteraction;
const trackObjects = () => configSettings.objectInteractions === true;

export interface InteractionContext {
  id: string;
  /** The creature acting */
  subject: TokenDocument.Implementation;
  /** What it acts on: a creature's token, a door (wall), or none for self */
  target?: TokenDocument.Implementation | WallDocument.Implementation;
  targetKind: InteractionTargetKind;
  /** Free data from the caller (a choice already made) */
  options: Record<string, unknown>;
}

export interface InteractionDefinition {
  label: string;
  icon?: string;
  img?: string;
  /** A tooltip */
  hint?: string;
  targets: InteractionTargetKind | readonly InteractionTargetKind[];
  /** Feet from the subject to a creature or a door; "reach": the subject's melee reach. None: any distance */
  range?: number | "reach";
  /** What doing it costs this turn (in a running combat) */
  cost?: InteractionCost;
  /** The reason it can't be done now (a string), or nothing when it can */
  available?(context: InteractionContext): string | undefined | null | false | void;
  /** Whether it is offered at all here (Escape only to a grappled creature); default: always */
  relevant?(context: InteractionContext): boolean;
  /** An action item's activity used against the target (its use charges its own cost) */
  activity?(context: InteractionContext): Activity | undefined | null;
  run?(context: InteractionContext): Promise<unknown> | unknown;
  /** Listing order (higher first) */
  priority?: number;
}

export interface InteractionOffer {
  id: string;
  label: string;
  icon?: string;
  img?: string;
  hint?: string;
  /** Why it can't be done now; absent: it can */
  reason?: string;
}

const interactions = new Registry<InteractionDefinition>();

/** The Interactions setting (midi's and other modules' interactions alike) */
const interactionsEnabled = () => configSettings.interactions !== false;

export function registerInteraction(id: string, definition: InteractionDefinition): () => void {
  interactions.set(id, definition, { priority: definition.priority });
  return () => { interactions.delete(id); };
}

export function unregisterInteraction(id: string): boolean {
  return interactions.delete(id);
}

type TargetRef = TokenDocument.Implementation | Token.Implementation | WallDocument.Implementation | null | undefined;

function targetOf(subject: TokenDocument.Implementation, ref: TargetRef): { target?: TokenDocument.Implementation | WallDocument.Implementation, kind: InteractionTargetKind } {
  if (!ref) return { kind: "self" };
  if (ref instanceof WallDocument) return { target: ref as WallDocument.Implementation, kind: "door" };
  const token = tokenFor(ref as TokenDocument.Implementation);
  if (!token || token === subject) return { kind: "self" };
  return { target: token, kind: "creature" };
}

/** Feet from the subject to the target (a door: to its midpoint) */
function distanceTo(subject: TokenDocument.Implementation, target: TokenDocument.Implementation | WallDocument.Implementation): number {
  if (target instanceof TokenDocument) return getDistance(subject, target, { wallsBlock: false });
  const [x0, y0, x1, y1] = (target as WallDocument.Implementation).c;
  const size = canvas!.grid!.size;
  const centre = { x: subject._source.x + (subject.width * size) / 2, y: subject._source.y + (subject.height * size) / 2 };
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  return canvas!.grid!.measurePath([centre, mid] as never, {} as never).distance;
}

/** Costs are turn costs: checked and spent only in a running combat (as a use's action is) */
const inCombat = (token: TokenDocument.Implementation) => !!(token.combatant as { combat?: { started?: boolean } } | null)?.combat?.started;

const label = (key: string, data?: Record<string, string>) => (data ? game.i18n?.format(key, data) : game.i18n?.localize(key)) ?? key;

/** The common reasons, then the interaction's own */
function reasonFor(definition: InteractionDefinition, context: InteractionContext): string | undefined {
  const kinds = [definition.targets].flat();
  if (!kinds.includes(context.targetKind)) return label("midi-qol.Interactions.Reason.target", { kind: label(`midi-qol.Interactions.Target.${kinds[0]}`) });
  const { subject, target } = context;
  if (target && definition.range !== undefined) {
    const range = definition.range === "reach" ? meleeReach(subject.actor) : definition.range;
    const distance = distanceTo(subject, target);
    if (distance < 0 || distance > range + 1e-6) return label("midi-qol.Interactions.Reason.range", { range: String(range) });
  }
  for (const [key, count] of Object.entries(definition.cost ?? {}) as [BudgetKindId | "object", number][]) {
    if (!count || !subject.actor || !inCombat(subject)) continue;
    // The free object interaction, else the action
    if (key === "object") {
      if (!trackObjects() || !objectUsed(subject.actor)) continue;
      if (budget(subject.actor, "action").exhausted) return label("midi-qol.Interactions.Reason.object");
      continue;
    }
    if (!isTracked(subject.actor, key)) continue;
    const state = budget(subject.actor, key);
    if (state.used + count > state.max) return label("midi-qol.Interactions.Reason.cost", { kind: label(`midi-qol.Interactions.Cost.${key}`) });
  }
  try {
    const own = definition.available?.(context);
    if (typeof own === "string" && own) return own;
  } catch (err) {
    console.warn(`midi-qol | interaction ${context.id}: available failed`, err);
    return label("midi-qol.Interactions.Reason.error");
  }
  return undefined;
}

/** What the subject is offered against the target (none: itself): every interaction for that kind of target, with the reason it can't be done now */
export function availableInteractions(subjectRef: TargetRef, targetRef?: TargetRef, options: Record<string, unknown> = {}): InteractionOffer[] {
  if (!interactionsEnabled()) return [];
  const subject = tokenFor(subjectRef as TokenDocument.Implementation);
  if (!subject) return [];
  const { target, kind } = targetOf(subject, targetRef);
  const offers: InteractionOffer[] = [];
  for (const { id, value: definition } of interactions.entries()) {
    if (![definition.targets].flat().includes(kind)) continue;
    const context: InteractionContext = { id, subject, target, targetKind: kind, options };
    try { if (definition.relevant && !definition.relevant(context)) continue; }
    catch (err) { console.warn(`midi-qol | interaction ${id}: relevant failed`, err); continue; }
    const reason = reasonFor(definition, context);
    offers.push({ id, label: label(definition.label), icon: definition.icon, img: definition.img, hint: definition.hint ? label(definition.hint) : undefined, ...(reason ? { reason } : {}) });
  }
  return offers;
}

export interface InteractionResult { done: boolean, reason?: string, result?: unknown }

/** Do an interaction: refused with its reason when it can't be done now */
export async function runInteraction(id: string, subjectRef: TargetRef, targetRef?: TargetRef, options: Record<string, unknown> = {}): Promise<InteractionResult> {
  if (!interactionsEnabled()) return { done: false, reason: label("midi-qol.Interactions.Reason.off") };
  const entry = interactions.get(id);
  const subject = tokenFor(subjectRef as TokenDocument.Implementation);
  if (!entry || !subject) return { done: false, reason: label("midi-qol.Interactions.Reason.unknown") };
  const definition = entry.value;
  const { target, kind } = targetOf(subject, targetRef);
  const context: InteractionContext = { id, subject, target, targetKind: kind, options };
  const reason = reasonFor(definition, context);
  if (reason) return { done: false, reason };
  const activity = definition.activity?.(context);
  if (activity) {
    const targetUuids = target instanceof TokenDocument && target.uuid ? [target.uuid] : [];
    const workflow = await completeActivityUse(activity, { midiOptions: { targetUuids, workflowOptions: { targetConfirmation: "none" } } }, {}, {});
    return { done: !!workflow && !(workflow as { aborted?: boolean }).aborted, result: workflow };
  }
  if (!definition.run) return { done: false, reason: label("midi-qol.Interactions.Reason.unknown") };
  const result = await definition.run(context);
  if (result === false) return { done: false };
  for (const [key, count] of Object.entries(definition.cost ?? {}) as [BudgetKindId | "object", number][]) {
    if (!count || !subject.actor || !inCombat(subject)) continue;
    if (key === "object") {
      if (!trackObjects()) continue;
      if (!objectUsed(subject.actor)) await spend(subject.actor, "action", { count: 0, counters: { objectInteraction: true } });
      else await spend(subject.actor, "action");
      continue;
    }
    if (isTracked(subject.actor, key)) await spend(subject.actor, key, { count });
  }
  Hooks.callAll("midi-qol.interaction", { id, subject, target, result });
  return { done: true, result };
}

export function registeredInteractions(): { id: string, label: string }[] {
  return interactions.entries().map(e => ({ id: e.id, label: label(e.value.label) }));
}

export const interactionsApi = {
  register: registerInteraction,
  unregister: unregisterInteraction,
  available: availableInteractions,
  run: runInteraction,
  list: registeredInteractions
};
