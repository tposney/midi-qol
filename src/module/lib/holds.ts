import { i18n } from "../../midi-qol.js";
import { CONTINUE, SUSPEND } from "../steps/engine.js";
import { addStepChange, registerStep, type StepUse } from "../steps/steps.js";
import { Workflow, type GmEdits, type GmTargetEdit, type UseHold } from "../Workflow.js";
import { cardMidi } from "./cardState.js";
import { queryEach, queryUser, registerMidiQuery } from "./midiQueries.js";
import { register } from "../api/services.js";
import type { DamageModifierContributor } from "../services/damageModifiers/service.js";

/*
 * M20: the GM's hold (plan ~/Documents/midi-next-M20-M22-plan-2026-11-24.md). A use can stop at a hold point for the
 * GM: after its attack roll, after its saves, after its damage roll (before the damage is worked out and applied) and
 * before its effects. A hold is a step inserted by a global step change for the uses that hold there (the world's
 * points, the actor's `flags.midi-qol.gmHold`, the call's `workflowOptions.gmHold`; false: none). Held, the use waits;
 * its card records where (`hold`), so it is listed, released or dropped from any client, after a reload too (the card
 * keeps the use's step changes and the inserted step it waits in). The GM may change the outcome first: hit or miss and
 * the critical, a save made or failed, the damage a target takes (scaled, plus or minus an amount: a damageModifiers
 * contributor reading the card, so the damage card lists it). Released, the hold step runs again and goes on.
 * Only while a GM is connected: with none, a use is never held.
 * The Confirm Roll Button's stop (`ConfirmRoll`) is a hold too, of kind "confirm": listed here, released by its card
 * buttons (whoever the setting allows) or by the GM with changes, through the same confirm handler.
 */

export const HOLD_POINTS = ["attack", "saves", "damage", "effects"] as const;
export type HoldPoint = typeof HOLD_POINTS[number];

const ANCHORS: Record<HoldPoint, { after?: string, before?: string }> = {
  attack: { after: "midi-qol.AttackRollComplete" },
  saves: { after: "midi-qol.SavesComplete" },
  damage: { before: "midi-qol.AllRollsComplete" },
  effects: { before: "midi-qol.ApplyDynamicEffects" }
};
export const holdStepId = (point: HoldPoint) => `midi-qol.Hold.${point}`;
const SOURCE = "midi-qol.gmHold";
const SETTING = "gmHoldPoints" as const;

const isHoldPoint = (value: unknown): value is HoldPoint => (HOLD_POINTS as readonly unknown[]).includes(value);
const points = (value: unknown): HoldPoint[] => Array.isArray(value) ? value.filter(isHoldPoint) : [];

/** The world's hold points (every use) */
export function worldHoldPoints(): HoldPoint[] {
  try { return points(game.settings?.get("midi-qol", SETTING)); } catch { return []; }
}

/** Where a use holds: the call's points (false: none), else the world's and its actor's */
export function holdPointsFor(use: StepUse): HoldPoint[] {
  const options = use.workflowOptions as { gmHold?: unknown } | undefined;
  if (options?.gmHold === false) return [];
  const actor = use.actor as Actor.Implementation | undefined;
  return [...new Set([...worldHoldPoints(), ...points(actor?.flags?.["midi-qol"]?.gmHold), ...points(options?.gmHold)])];
}

/** A hold only while a GM can release it */
const gmConnected = () => !!game.users?.activeGM;

async function runHold(workflow: Workflow, point: HoldPoint): Promise<string> {
  if (workflow.holdsReleased.includes(point) || !gmConnected()) return CONTINUE;
  workflow.hold = { point, kind: "gm", since: Date.now() };
  await workflow.flushCardWrites();
  Hooks.callAll("midi-qol.held", workflow, point);
  // The GM's hold panel opens
  queryEach(game.users?.filter(user => user.isGM && user.active) ?? [], "midiHoldOpened", workflow.itemCardUuid);
  return SUSPEND;
}

/** The uses held now (their cards): newest first */
export function heldUses(): { card: ChatMessage.Implementation, hold: UseHold }[] {
  const held: { card: ChatMessage.Implementation, hold: UseHold }[] = [];
  for (const card of game.messages?.contents ?? []) {
    const midi = cardMidi(card);
    const hold = midi.state?.hold as UseHold | undefined;
    // A use removed or finished meanwhile isn't waiting any more (removed this session: its card may stay)
    if (hold?.point && !midi.progress?.allRemoved && !midi.progress?.finished && !Workflow.wasRemoved(card.uuid)) held.push({ card, hold });
  }
  return held.sort((a, b) => b.hold.since - a.hold.since);
}

const tokenOf = (uuid: string) => fromUuidSync(uuid) as TokenDocument.Implementation | null;

/** Two lists of target changes, the later winning field by field */
export function mergeTargetEdits(kept: readonly GmTargetEdit[], added: readonly GmTargetEdit[]): GmTargetEdit[] {
  const merged = new Map(kept.map(edit => [edit.uuid, { ...edit }]));
  for (const edit of added) merged.set(edit.uuid, { ...(merged.get(edit.uuid) ?? {}), ...edit });
  return [...merged.values()];
}

/** The GM's changes, applied to the use's outcome (write-through) and kept on its card */
export async function applyGmEdits(workflow: Workflow, edits: GmEdits): Promise<void> {
  const kept = workflow.gmEdits;
  const critical = edits.critical ?? kept.critical;
  workflow.gmEdits = { ...(critical !== undefined ? { critical } : {}), targets: mergeTargetEdits(kept.targets ?? [], edits.targets ?? []) };
  if (edits.critical !== undefined) workflow.isCritical = edits.critical;
  let hitsChanged = false, savesChanged = false;
  for (const edit of edits.targets ?? []) {
    const token = tokenOf(edit.uuid);
    if (!token || !workflow.targets.has(token)) continue;
    if (edit.hit !== undefined) {
      hitsChanged = true;
      if (edit.hit) workflow.hitTargets = workflow.hitTargets.add(token);
      else workflow.hitTargets.delete(token);
      workflow.hitTargetsEC.delete(token);
      const display = workflow.hitDisplayData ?? {};
      const shown = Object.values(display).find(entry => entry.uuid === edit.uuid) ?? display[edit.uuid];
      if (shown) {
        shown.isHit = edit.hit;
        shown.hitString = i18n(edit.hit ? "midi-qol.hits" : "midi-qol.misses");
        shown.hitResultNumeric = "--";
      }
    }
    if (edit.saved !== undefined) {
      savesChanged = true;
      workflow.updateSaveFailSets(token, edit.saved);
      const shown = workflow.saveDisplayData?.find(entry => entry.id === token.id);
      if (shown?.saveSymbol) shown.saveSymbol = shown.saveSymbol.replace(/fa-check|fa-xmark/, edit.saved ? "fa-check" : "fa-xmark");
    }
  }
  if (hitsChanged) await workflow.displayHits(workflow.whisperAttackCard, true);
  if (savesChanged) await workflow.displaySaves();
}

/** Release a held use (with the GM's changes): run where the use runs (its card's author), else here from its card */
export async function releaseHold(card: string, edits?: GmEdits): Promise<string | undefined> {
  const message = fromUuidSync(card) as ChatMessage.Implementation | null;
  if (!message) return "midi-qol | no such card";
  const author = message.author;
  if (author?.active && !author.isSelf) return queryUser(author, "midiReleaseHold", card, edits);
  return releaseHere(card, edits);
}

async function releaseHere(card: string, edits?: GmEdits): Promise<string | undefined> {
  const workflow = Workflow.findWorkflow(card);
  const hold = workflow?.hold;
  if (!workflow || !hold) return "midi-qol | the use isn't held";
  if (edits) await applyGmEdits(workflow, edits);
  // The Confirm Roll Button's hold: released as its Confirm button does (no hits left: a miss)
  if (hold.kind === "confirm") {
    const answer = await queryUser(game.user, "confirmDamageRollComplete", { workflowId: card, activityUuid: workflow.activity?.uuid, itemCardUuid: card });
    return typeof answer === "string" ? answer : undefined;
  }
  workflow.releaseHoldPoint(hold.point);
  workflow.hold = undefined;
  await workflow.flushCardWrites();
  Hooks.callAll("midi-qol.holdReleased", workflow, hold.point);
  // Not awaited: the rest of the use can take as long as it takes (the caller's query would time out)
  void workflow.resume();
  return undefined;
}

/** Drop a held use: it is cancelled where it runs */
export async function dropHold(card: string): Promise<string | undefined> {
  const message = fromUuidSync(card) as ChatMessage.Implementation | null;
  if (!message) return "midi-qol | no such card";
  const author = message.author;
  if (author?.active && !author.isSelf) return queryUser(author, "midiDropHold", card);
  const workflow = Workflow.findWorkflow(card);
  if (!workflow) {
    // The use is gone (removed, or ended elsewhere) but its card still says held: the card is cleared
    if (!cardMidi(message).state?.hold) return "midi-qol | the use isn't held";
    await message.update({ "system.midi.state.hold": null, "system.midi.progress": { allRemoved: true } } as ChatMessage.UpdateData);
    return undefined;
  }
  if (!workflow.hold) return "midi-qol | the use isn't held";
  workflow.hold = undefined;
  await workflow.flushCardWrites();
  // The Confirm Roll Button's hold is dropped as its Cancel button cancels the use
  void workflow.performState("midi-qol.Cancel");
  return undefined;
}

/** The damage a target takes, as the GM changed it at a hold (read from the use's card: damage may be worked out on any client) */
const gmDamage: DamageModifierContributor = {
  stage: "complete",
  for({ actor, options }) {
    const card = options.midi?.itemCardUuid ? fromUuidSync(options.midi.itemCardUuid) as ChatMessage.Implementation | null : null;
    const edits = (cardMidi(card).state?.gmEdits as GmEdits | undefined)?.targets;
    if (!edits?.length) return undefined;
    const entry = edits.find(edit => (edit.multiplier !== undefined || edit.amount) && tokenOf(edit.uuid)?.actor?.uuid === actor.uuid);
    if (!entry) return undefined;
    const label = i18n("midi-qol.Hold.DamageChanged");
    return [
      ...(entry.multiplier !== undefined && entry.multiplier !== 1 ? [{ multiplier: entry.multiplier, label }] : []),
      ...(entry.amount ? [{ amount: entry.amount, label }] : [])
    ];
  }
};

export function registerHolds() {
  game.settings?.register("midi-qol", SETTING, { scope: "world", config: false, type: Array, default: [] });
  for (const point of HOLD_POINTS) {
    const id = holdStepId(point);
    registerStep({ id, name: `Hold${point[0].toUpperCase()}${point.slice(1)}`, run: ({ workflow }) => runHold(workflow, point) });
    addStepChange({ kind: "insert", step: id, ...ANCHORS[point], layer: "global", source: SOURCE, when: use => holdPointsFor(use).includes(point) });
  }
  registerMidiQuery("midiReleaseHold", (card: string, edits?: GmEdits) => releaseHere(card, edits));
  registerMidiQuery("midiDropHold", (card: string) => dropHold(card));
  registerMidiQuery("midiHoldOpened", (card: string) => { Hooks.callAll("midi-qol.holdOpened", card); });
  // After the damageModifiers service is defined
  register("damageModifiers", "midi-qol.gmHold", gmDamage);
}


export const holdsApi = {
  points: HOLD_POINTS,
  list: heldUses,
  release: releaseHold,
  drop: dropHold,
  pointsFor: holdPointsFor,
  world: worldHoldPoints,
  setWorld: (value: HoldPoint[]) => game.settings?.set("midi-qol", SETTING, points(value)),
  setActor: (actor: Actor.Implementation, value: HoldPoint[]) => actor.setFlag("midi-qol", "gmHold", points(value))
};
