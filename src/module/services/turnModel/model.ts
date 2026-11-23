import type { Activity } from "../../../globals.js";
import { requestsFor } from "../../lib/requests.js";
import { tokenFor, type TokenRef } from "../../lib/tokenResolver.js";
import { configSettings } from "../../settings.js";
import { cost, grantedAttacks, type AttackGrant, type UseCost } from "../economy/cost.js";
import { economyPolicy, issues, type UseIssue } from "../economy/issues.js";
import { budget, budgetKinds, isTracked, type BudgetKindId } from "../economy/ledger.js";
import { movementState, type MovementState } from "../economy/movement.js";
import { availableInteractions, type InteractionOffer } from "../interactions/registry.js";
import { nextActivities, openRun, runFit } from "../multiattack/run.js";
import type { PlanSource } from "../multiattack/plans.js";

/*
 * M7a: the turn model (proposal section 9; plan ~/Documents/midi-next-M7-plan-2026-11-23.md). One read of what a HUD
 * shows for a creature, computed by midi's services (the ledger, movement, cost and issues, interactions, the request
 * core) and cached: midi's bar, an Argon adapter, any HUD reads the same legality. Recomputed lazily after a change
 * that matters (the actor, its items and effects, the combat's turn, targets, the token's position), announced once per
 * change burst with `midi-qol.turnModelChanged` (the actor's uuid); a model already read is rebuilt before the
 * announcement, so a reader's peek then has the new one.
 *
 *   const model = await MidiQOL.turnModel.get(token);   // or .peek(token) for the cached one
 */

export interface WindowState { used: number, max: number, exhausted: boolean, tracked: boolean, label: string, img?: string, core: boolean }

export interface ActivityCell {
  uuid: string;
  /** M21b: allowed next by the creature's open Multiattack */
  multiattack?: boolean;
  itemUuid: string;
  itemName: string;
  name: string;
  img: string;
  /** dnd5e's activation type (action, bonus, reaction, minute...) */
  activation: string;
  type: string;
  cost: UseCost;
  issues: UseIssue[];
  /** No issue that stops it (a "show" issue only marks it) */
  usable: boolean;
  /** The first issue's label, for a greyed cell's tooltip */
  reason?: string;
  uses?: { value: number, max: number };
  spellLevel?: number;
  slotsLeft?: number;
  concentration?: boolean;
  ritual?: boolean;
}

export interface TurnModel {
  actorUuid: string;
  tokenUuid?: string;
  inCombat: boolean;
  isTurn: boolean;
  economy: {
    windows: Record<BudgetKindId, WindowState>;
    /** Attacks left of the Attack action (Extra Attack) */
    attacksLeft: number;
    granted: AttackGrant[];
    objectInteraction: { tracked: boolean, used: boolean };
    movement?: MovementState;
    /** M21b: the creature's Multiattack opened this turn: attacks left (null: unbounded), uses made, the activities allowed next and used */
    multiattack?: { source: PlanSource, attacksLeft: number | null, made: number, complete: boolean, allowed: string[], used: string[] };
  };
  activities: ActivityCell[];
  interactions: { self: InteractionOffer[], target: InteractionOffer[], targetUuid?: string };
  /** Requests waiting on this creature (saves, reactions, offers) */
  pending: number;
  computedAt: number;
}



function combatOf(token: TokenDocument.Implementation | undefined) {
  return (token?.combatant as { combat?: Combat.Implementation } | null | undefined)?.combat;
}

async function cellsOf(actor: Actor.Implementation): Promise<ActivityCell[]> {
  const cells: ActivityCell[] = [];
  for (const item of actor.items) {
    const activities = ((item.system as { activities?: { contents?: Activity[] } }).activities?.contents ?? []) as Activity[];
    for (const activity of activities) {
      const activation = String((activity as { activation?: { type?: string } }).activation?.type ?? "");
      if (!activation || activation === "none") continue;
      if ((activity as { midiProperties?: { automationOnly?: boolean } }).midiProperties?.automationOnly) continue;
      let found: UseIssue[] = [];
      try { found = await issues(activity); } catch (err) { console.warn(`midi-qol | turn model: issues of ${item.name}`, err); }
      // An issue stops the use only when its policy is enforce (its own, else its kind's); warn and show only mark it
      const stopping = found.filter(i => (i.policy ?? (i.kind ? economyPolicy(actor, i.kind) : "show")) === "enforce");
      const system = item.system as { uses?: { value?: number, max?: number }, level?: number, properties?: Set<string> };
      const uses = (activity as { uses?: { value?: number, max?: number } }).uses;
      const counted = uses?.max ? uses : system.uses?.max ? system.uses : undefined;
      const isSpell = (item.type as string) === "spell";
      const level = isSpell ? Number(system.level ?? 0) : undefined;
      const slots = level ? Number((actor.system as { spells?: Record<string, { value?: number }> }).spells?.[`spell${level}`]?.value ?? 0) : undefined;
      cells.push({
        uuid: activity.uuid ?? "", itemUuid: item.uuid ?? "", itemName: item.name, name: activity.name || item.name,
        img: (activity as { img?: string }).img || item.img || "", activation, type: activity.type,
        cost: cost(activity), issues: found, usable: stopping.length === 0, ...(found[0] ? { reason: found[0].label } : {}),
        ...(counted ? { uses: { value: Number(counted.value ?? 0), max: Number(counted.max ?? 0) } } : {}),
        ...(level !== undefined ? { spellLevel: level, slotsLeft: slots } : {}),
        ...(system.properties?.has("concentration") ? { concentration: true } : {}),
        ...(system.properties?.has("ritual") ? { ritual: true } : {})
      });
    }
  }
  return cells;
}

/** The turn model for a creature, built now */
export async function buildTurnModel(ref: TokenRef): Promise<TurnModel | undefined> {
  const token = tokenFor(ref);
  const actor = token?.actor ?? (ref instanceof Actor ? ref as Actor.Implementation : undefined);
  if (!actor) return undefined;
  const combat = combatOf(token);
  const inCombat = !!combat?.started;
  const isTurn = inCombat && combat?.combatant?.tokenId === token?.id;
  const windows = Object.fromEntries(budgetKinds().map(({ id, label, img, core }) => {
    const state = budget(actor, id);
    return [id, { used: state.used, max: state.max, exhausted: state.exhausted, tracked: isTracked(actor, id), label, ...(img ? { img } : {}), core }];
  })) as Record<BudgetKindId, WindowState>;
  const turn = budget(actor, "action");
  const open = openRun(actor);
  const fit = open ? runFit(actor, open.run) : null;
  const allowed = open ? nextActivities(actor, open.run).map(a => a.uuid) : [];
  const activities = await cellsOf(actor);
  for (const cell of activities) if (allowed.includes(cell.uuid)) cell.multiattack = true;
  const target = [...(game.user?.targets ?? [])].map(t => t.document as TokenDocument.Implementation).find(t => t !== token);
  return {
    actorUuid: actor.uuid ?? "", ...(token?.uuid ? { tokenUuid: token.uuid } : {}),
    inCombat, isTurn,
    economy: {
      windows,
      attacksLeft: Number(turn.counters.attacksLeft ?? 0),
      granted: grantedAttacks(actor),
      objectInteraction: { tracked: configSettings.objectInteractions === true, used: !!turn.counters.objectInteraction },
      ...(token ? { movement: movementState(token) } : {}),
      ...(open ? { multiattack: {
        source: open.run.source, attacksLeft: fit && Number.isFinite(fit.attacksLeft) ? fit.attacksLeft : null,
        made: open.run.uses.length, complete: allowed.length === 0, allowed, used: open.run.uses.map(u => u.activityUuid)
      } } : {})
    },
    activities,
    interactions: {
      self: token ? availableInteractions(token) : [],
      target: token && target ? availableInteractions(token, target) : [],
      ...(target?.uuid ? { targetUuid: target.uuid } : {})
    },
    pending: actor.uuid ? requestsFor(actor.uuid).length : 0,
    computedAt: Date.now()
  };
}

/* The cache: per actor, dropped on a change that matters; one announcement per burst */

const cache = new Map<string, Promise<TurnModel | undefined>>();
const settled = new Map<string, TurnModel>();
const dirty = new Set<string>();
let announce: ReturnType<typeof setTimeout> | undefined;

function invalidate(actorUuid: string | undefined | null) {
  if (!actorUuid) return;
  cache.delete(actorUuid);
  dirty.add(actorUuid);
  if (announce) return;
  announce = setTimeout(() => {
    announce = undefined;
    const changed = [...dirty];
    dirty.clear();
    // A model a HUD has read is rebuilt first, so the announcement's readers get the new one (peek, never the stale)
    void Promise.all(changed.map(async uuid => {
      if (settled.has(uuid)) {
        const actor = fromUuidSync(uuid) as Actor.Implementation | null;
        if (actor) { try { await getTurnModel(actor); } catch (err) { console.warn("midi-qol | turn model rebuild", err); } }
      }
      Hooks.callAll("midi-qol.turnModelChanged", uuid);
    }));
  }, 100);
}
const invalidateAll = () => { for (const uuid of [...cache.keys(), ...settled.keys()]) invalidate(uuid); };

/** The creature's turn model: the cached one, else built */
export function getTurnModel(ref: TokenRef): Promise<TurnModel | undefined> {
  const actor = tokenFor(ref)?.actor ?? (ref instanceof Actor ? ref as Actor.Implementation : undefined);
  const key = actor?.uuid;
  if (!key) return Promise.resolve(undefined);
  let built = cache.get(key);
  if (!built) {
    built = buildTurnModel(ref).then(model => { if (model) settled.set(key, model); return model; });
    cache.set(key, built);
  }
  return built;
}

/** The last model built for the creature, without building one (it may be stale: listen to turnModelChanged) */
export function peekTurnModel(ref: TokenRef): TurnModel | undefined {
  const key = (tokenFor(ref)?.actor ?? (ref instanceof Actor ? ref as Actor.Implementation : undefined))?.uuid;
  return key ? settled.get(key) : undefined;
}

const actorOfDoc = (doc: { parent?: unknown, actor?: unknown }): Actor.Implementation | undefined => {
  if (doc instanceof Actor) return doc as Actor.Implementation;
  const parent = doc.parent;
  if (parent instanceof Actor) return parent as Actor.Implementation;
  if (parent instanceof Item && parent.parent instanceof Actor) return parent.parent as Actor.Implementation;
  return undefined;
};

export function setupTurnModel() {
  for (const hook of ["updateActor"] as const) Hooks.on(hook, (actor: Actor.Implementation) => invalidate(actor.uuid));
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"] as const)
    Hooks.on(hook, (doc: object) => invalidate(actorOfDoc(doc as { parent?: unknown })?.uuid));
  Hooks.on("updateToken", (token: TokenDocument.Implementation) => invalidate(token.actor?.uuid));
  // The turn, the round, targets and interactions in reach change every creature's model
  Hooks.on("updateCombat", () => invalidateAll());
  Hooks.on("deleteCombat", () => invalidateAll());
  Hooks.on("targetToken", () => invalidateAll());
}

export const turnModelApi = { get: getTurnModel, peek: peekTurnModel, build: buildTurnModel };
