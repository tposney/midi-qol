import type { Activity } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import { fitUses, nextUses, slug, type MultiattackPlan, type PlanFit } from "../../lib/multiattack.js";
import { registerCostContributor } from "../economy/cost.js";
import { isMultiattackItem, multiattackItem, multiattackPlan, spellInfo, type PlanSource } from "./plans.js";

/*
 * M21b: using a Multiattack (M21 plan, 21b). Using the Multiattack feature (its activity) opens its plan for the turn,
 * on the feature (flags.midi-qol.multiattackRun, stamped with the combat, round and turn: a later turn closes it; out of
 * combat it lasts until the next Multiattack). While it is open, a use that fits the plan costs no action (a cost
 * contributor, so charging, issues and the turn model agree) and is recorded in it; the run sheet lists what's left as
 * buttons, each a normal use. Each use's targets, hit and damage are added when it completes.
 */

export interface MultiattackUse {
  keys: string[];
  activityUuid: string;
  name: string;
  workflowId?: string;
  targets?: string[];
  hit?: boolean;
  damage?: number;
}
export interface MultiattackRun {
  plan?: MultiattackPlan;
  source: PlanSource;
  provider?: string;
  uses: MultiattackUse[];
  /** When it was opened: a combat's id, round and turn (none out of combat) */
  combat?: { id: string, round: number, turn: number };
  skipped?: string[];
}

type ActivityLike = Activity & { id: string, type?: string, uuid: string, name?: string | null, item: Item.Implementation,
  attack?: { type?: { value?: string } }, spell?: { uuid?: string }, activation?: { type?: string } };
type ItemSystem = { identifier?: string, activities?: { contents?: ActivityLike[] } };

/** A use's keys (lib/multiattack.ts fitUses): its item's identifier, a cast and its spell, attack kind, spell */
export function useKeys(activity: ActivityLike): string[] {
  const item = activity.item;
  const id = (item.system as ItemSystem).identifier || slug(item.name ?? "");
  const keys = [id];
  if (activity.type === "attack") {
    keys.push("attack");
    const kind = activity.attack?.type?.value;
    if (kind === "melee" || kind === "ranged") keys.push(`attack:${kind}`);
  }
  const castSpell = (uuid: string | undefined) => {
    if (!uuid) return undefined;
    const info = spellInfo(uuid);
    return info?.identifier || (info?.name ? slug(info.name) : undefined);
  };
  if (activity.type === "cast") {
    const spell = castSpell(activity.spell?.uuid);
    if (spell) keys.push(`${id}>${spell}`, spell, "spell");
  }
  if ((item.type as string) === "spell") {
    keys.push("spell");
    // A spell dnd5e cached for a cast activity (Spellcasting's): the cast it is
    const cached = (item.flags as { dnd5e?: { cachedFor?: string } }).dnd5e?.cachedFor;
    const cast = cached && item.actor ? fromUuidSync(cached, { relative: item.actor as never }) as ActivityLike | null : null;
    if (cast?.item) keys.push(`${(cast.item.system as ItemSystem).identifier || slug(cast.item.name ?? "")}>${id}`);
  }
  return [...new Set(keys)];
}

/** The open run on the creature: its Multiattack's flag, while the turn it was opened in lasts */
export function openRun(actor: Actor.Implementation | null | undefined): { item: Item.Implementation, run: MultiattackRun } | undefined {
  const item = multiattackItem(actor);
  const run = item?.flags?.["midi-qol"]?.multiattackRun;
  if (!item || !run?.plan) return undefined;
  const combat = game.combat;
  const now = combat?.started && combat.id && combat.combatant?.actor === actor ? { id: combat.id, round: combat.round, turn: combat.turn ?? 0 } : undefined;
  if (run.combat) {
    if (!now || now.id !== run.combat.id || now.round !== run.combat.round || now.turn !== run.combat.turn) return undefined;
  } else if (now) return undefined;
  return { item, run };
}

const evaluator = (actor: Actor.Implementation) => (formula: string) => {
  try { return Number(Roll.safeEval(Roll.replaceFormulaData(formula, actor.getRollData()))); }
  catch { return NaN; }
};

export function runFit(actor: Actor.Implementation, run: MultiattackRun, extra?: string[]): PlanFit | null {
  if (!run.plan) return null;
  return fitUses(run.plan, [...run.uses.map(u => u.keys), ...(extra ? [extra] : [])], { evaluate: evaluator(actor) });
}

/** The creature's activities that may come next in the open run */
export function nextActivities(actor: Actor.Implementation, run: MultiattackRun): ActivityLike[] {
  if (!run.plan) return [];
  const candidates = actor.items.filter(item => !isMultiattackItem(item))
    .flatMap(item => ((item.system as ItemSystem).activities?.contents ?? []).map(activity => ({ activity, keys: useKeys(activity) })));
  return nextUses(run.plan, run.uses.map(u => u.keys), candidates, { evaluate: evaluator(actor) }).map(c => c.activity);
}

/** Writes to one Multiattack's run in order (a use recorded right after opening, results as uses complete) */
const writes = new Map<string, Promise<unknown>>();
async function updateRun(item: Item.Implementation, change: (run: MultiattackRun) => MultiattackRun | undefined) {
  const key = item.uuid ?? "";
  const next = (writes.get(key) ?? Promise.resolve()).then(async () => {
    const current = item.flags?.["midi-qol"]?.multiattackRun;
    if (!current) return;
    const changed = change(foundry.utils.deepClone(current));
    if (changed) await item.update({ "flags.midi-qol.multiattackRun": changed } as never);
  }).catch(err => console.error("midi-qol | multiattack", err));
  writes.set(key, next);
  return next;
}

/** Opens the creature's Multiattack for this turn; returns the run */
export async function openMultiattack(actor: Actor.Implementation): Promise<MultiattackRun | undefined> {
  const item = multiattackItem(actor);
  if (!item) return undefined;
  const found = await multiattackPlan(actor);
  const combat = game.combat;
  const run: MultiattackRun = {
    ...(found?.plan ? { plan: found.plan } : {}),
    source: found?.source ?? "none",
    ...(found?.provider ? { provider: found.provider } : {}),
    ...(found?.skipped ? { skipped: found.skipped } : {}),
    uses: [],
    ...(combat?.started && combat.combatant?.actor === actor && combat.id ? { combat: { id: combat.id, round: combat.round, turn: combat.turn ?? 0 } } : {})
  };
  const key = item.uuid ?? "";
  const write = (writes.get(key) ?? Promise.resolve()).then(() => item.update({ "flags.midi-qol.multiattackRun": run } as never))
    .catch(err => console.error("midi-qol | multiattack", err));
  writes.set(key, write);
  await write;
  Hooks.callAll("midi-qol.multiattackOpened", actor, run);
  return run;
}

/** After a use is charged: a Multiattack opens its plan; a use that fits the open plan is recorded in it */
export async function multiattackAfterCharge(workflow: Workflow) {
  const actor = workflow.actor as Actor.Implementation | undefined;
  const activity = workflow.activity as ActivityLike | undefined;
  if (!actor || !activity?.item) return;
  if (isMultiattackItem(activity.item)) { await openMultiattack(actor); return; }
  const open = openRun(actor);
  if (!open || activity.activation?.type !== "action") return;
  const keys = useKeys(activity);
  if (!runFit(actor, open.run, keys)) return;
  await updateRun(open.item, run => {
    run.uses.push({ keys, activityUuid: activity.uuid, name: activity.item.name ?? activity.name ?? "", ...(workflow.id ? { workflowId: workflow.id } : {}) });
    return run;
  });
}

export function setupMultiattackRuns() {
  // A use that fits the open plan costs no action (charging, issues and the turn model all read the cost)
  registerCostContributor("midi-qol.multiattack", ({ activity, actor, cost }) => {
    if (!cost.action) return undefined;
    const used = activity as ActivityLike;
    if (!used.item || isMultiattackItem(used.item)) return undefined;
    const open = openRun(actor);
    if (!open || !runFit(actor, open.run, useKeys(used))) return undefined;
    return { ...cost, action: 0 };
  });
  // Each use's targets, hit and damage, when it completes
  Hooks.on("midi-qol.RollComplete" as never, ((workflow: Workflow) => {
    const actor = workflow.actor as Actor.Implementation | undefined;
    const open = openRun(actor);
    if (!open || !workflow.id || !open.run.uses.some(u => u.workflowId === workflow.id)) return;
    const targets = [...(workflow.targets?.documents ?? [])].map(t => t.name ?? "");
    const hit = workflow.hitTargets?.size;
    void updateRun(open.item, run => {
      const use = run.uses.find(u => u.workflowId === workflow.id);
      if (!use) return undefined;
      use.targets = targets;
      if ((workflow.activity as ActivityLike | undefined)?.type === "attack") use.hit = (hit ?? 0) > 0;
      if (workflow.damageTotal) use.damage = workflow.damageTotal;
      return run;
    });
  }) as never);
}
