import type { Activity } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import { completeActivityUse } from "../../utils.js";
import { getDistance } from "../../services/distance/service.js";
import { isTracked, spend } from "../../services/economy/ledger.js";
import { onTurnEvent } from "../turnEvents.js";
import { actorEffectEntries, applyingActivity, conditionDataFor, entryHolds, registerEvent, takeEntry, type ActionRun, type EventContext } from "./engine.js";
import type { FoundEntry } from "./types.js";

/*
 * M15 stage 6: actions that run an activity, and the `action` event.
 * - `save: "activity:<id>"` / `check: "activity:<id>"`: the activity (of the entry's item; an effect's: the item that
 *   applied it) used against the subject: the event's target, else the use's hit targets (else its targets), else
 *   the effect's bearer. Nothing is consumed. `then` if every subject saved, `else` if any failed (Petrifying Bite's
 *   second save, Menacing Attack's frightened save).
 * - `save` / `check` `{ ability, skill?, dc }` at an `action` event: rolled by the creature taking the action
 *   (directRoll), on its owner's client.
 * - `action`: an action a creature can take (Ensnaring Strike's "free", Web's "break"): the effect's `action` entries
 *   are listed on a card at the bearer's turn start; taking one (the card's button, or MidiQOL.entries.takeAction)
 *   spends the taker's action and runs the entry with the taker as the event's actor. `who` says who may take it:
 *   the bearer, or a near spec (`{ within: "reach", of: "bearer" }`), or a list of both.
 */

export const ACTIVITY_REF = "activity:";

export function isActivityRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(ACTIVITY_REF);
}

/** The item an entry's activity refs are on: an effect's applying item, else the entry's own */
function entryItem(f: FoundEntry): Item.Implementation | undefined {
  const document = f.document as { item?: Item.Implementation, parent?: unknown };
  if (f.document instanceof Item) return f.document;
  if (f.document instanceof ActiveEffect) {
    const applying = applyingActivity(f.document) as { item?: Item.Implementation } | undefined;
    if (applying?.item) return applying.item;
    const origin = f.document.origin ? fromUuidSync(f.document.origin, { strict: false }) : undefined;
    if (origin instanceof Item) return origin;
    return f.document.parent instanceof Item ? f.document.parent : undefined;
  }
  return document.item;
}

/** An activity of the entry's item by id, identifier or name */
export function entryActivity(f: FoundEntry, ref: string): Activity | undefined {
  const id = ref.startsWith(ACTIVITY_REF) ? ref.slice(ACTIVITY_REF.length) : ref;
  // @ts-expect-error no dnd5e-types
  const activities = entryItem(f)?.system.activities;
  if (!activities) return undefined;
  return (activities.get(id) ?? activities.find((a: Activity) => a.identifier === id || a.name === id)) as Activity | undefined;
}

function documents(set: { documents?: TokenDocument.Implementation[] } | undefined): TokenDocument.Implementation[] {
  return set?.documents ?? [];
}

/** Who an activity action is used against */
function subjectsOf(run: ActionRun): TokenDocument.Implementation[] {
  const { context, found } = run;
  if (context.target) return [context.target];
  const workflow = context.workflow;
  if (workflow) {
    const hit = [...new Set([...documents(workflow.hitTargets), ...documents(workflow.hitTargetsEC)])];
    if (workflow.activity?.attack) return hit;
    return documents(workflow.targets);
  }
  const bearer = found.actor ?? context.actor;
  const token = bearer?.getActiveTokens(false, true)[0] as TokenDocument.Implementation | undefined;
  return token ? [token] : [];
}

/** `{ save | check: "activity:<id>" }`: the activity used against the subjects, nothing consumed */
export async function activityRollAction(run: ActionRun, kind: "save" | "check"): Promise<{ success?: boolean } | void> {
  const ref = run.action[kind] as string;
  const activity = entryActivity(run.found, ref);
  if (!activity) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: no activity ${ref}`);
    return;
  }
  const subjects = subjectsOf(run);
  if (!subjects.length) return;
  const used = await completeActivityUse(activity, {
    consume: { action: false, resources: false, spellSlot: false },
    midiOptions: {
      targetUuids: subjects.map(t => t.uuid).filter((uuid): uuid is string => !!uuid),
      workflowOptions: { targetConfirmation: "none", autoRollAttack: true, autoRollDamage: "always", fastForwardAttack: true, fastForwardDamage: true }
    }
  }, { configure: false }, {}) as Workflow | undefined;
  if (!used) return;
  const failed = subjects.some(t => used.failedSaves.has(t));
  const saved = subjects.every(t => used.saves.has(t));
  if (failed) return { success: false };
  if (saved) return { success: true };
}

/** A DC: a number, or a formula over the condition data (`@entry.origin.dc`) */
function dcOf(value: unknown, conditionData: Record<string, unknown>): number | undefined {
  if (typeof value === "number") return value > 0 ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const result = Roll.safeEval(Roll.replaceFormulaData(value, conditionData, { missing: "0" }));
    return typeof result === "number" && Number.isFinite(result) && result > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

interface DirectSpec { ability?: string | string[], skill?: string | string[], dc?: unknown }

/** A save or check the actor rolls here, against a DC (an action's check, rolled by the creature taking it) */
export async function directRoll(actor: Actor.Implementation, kind: "save" | "check", spec: DirectSpec, conditionData: Record<string, unknown>): Promise<boolean | undefined> {
  const dc = dcOf(spec.dc, conditionData);
  if (dc === undefined) return undefined;
  const skills = [spec.skill ?? []].flat();
  const abilities = [spec.ability ?? []].flat();
  const system = actor.system as { skills?: Record<string, { total?: number }>, abilities?: Record<string, { mod?: number, save?: { value?: number } }> };
  const message = { create: true };
  let rolls: Roll[] | Roll | null | undefined;
  if (kind === "check" && skills.length) {
    // The creature's best of the skills allowed (Athletics or Acrobatics)
    const skill = [...skills].sort((a, b) => (system.skills?.[b]?.total ?? 0) - (system.skills?.[a]?.total ?? 0))[0];
    // @ts-expect-error no dnd5e-types
    rolls = await actor.rollSkill({ skill, target: dc }, { configure: false }, message);
  } else {
    const ability = abilities[0];
    if (!ability) return undefined;
    // @ts-expect-error no dnd5e-types
    rolls = kind === "save" ? await actor.rollSavingThrow({ ability, target: dc }, { configure: false }, message)
      // @ts-expect-error no dnd5e-types
      : await actor.rollAbilityCheck({ ability, target: dc }, { configure: false }, message);
  }
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return undefined;
  return (roll.total ?? 0) >= dc;
}

/** `save` / `check` with `{ ability, skill?, dc }` at an action: the taker rolls */
export async function actionRollAction(run: ActionRun, kind: "save" | "check"): Promise<{ success?: boolean } | void> {
  const spec = run.action[kind];
  if (!spec || typeof spec !== "object") return;
  const success = await directRoll(run.context.actor, kind, spec as DirectSpec, run.conditionData);
  return success === undefined ? undefined : { success };
}

/* The action event */

const whoList = (f: FoundEntry) => [f.entry.who ?? "bearer"].flat() as unknown[];

/** Whether `taker` may take the bearer's action entry: the bearer itself, or someone its near spec reaches */
function mayTake(f: FoundEntry, taker: Actor.Implementation): boolean {
  const bearer = f.actor;
  for (const who of whoList(f)) {
    if (who === "bearer" && taker === bearer) return true;
    if (who && typeof who === "object" && "within" in who) {
      const spec = who as { within: number | "reach" };
      const from = bearer?.getActiveTokens(false, true)[0] as TokenDocument.Implementation | undefined;
      const to = taker.getActiveTokens(false, true).find(t => t.parent === from?.parent) as TokenDocument.Implementation | undefined;
      if (!from || !to || to === from) continue;
      const within = spec.within === "reach" ? 5 : Number(spec.within);
      const distance = getDistance(from, to, { wallsBlock: false });
      if (distance >= 0 && distance <= within) return true;
    }
  }
  return false;
}

/** The bearer's action entries (its applied effects'), whoever takes them: who is checked when one is taken */
function actionEntries(bearer: Actor.Implementation): FoundEntry[] {
  return actorEffectEntries(bearer, "action");
}

/**
 * Take an action entry (MidiQOL.entries.takeAction): `effect` the effect holding it (or its uuid), `entryId` its id,
 * `taker` who takes it (default the bearer). Spends the taker's action when the economy tracks it.
 */
export async function takeAction(effectRef: ActiveEffect.Implementation | string, entryId: string, taker?: Actor.Implementation): Promise<boolean> {
  const effect = typeof effectRef === "string" ? fromUuidSync(effectRef) as ActiveEffect.Implementation | null : effectRef;
  const bearer = effect?.parent instanceof Actor ? effect.parent : undefined;
  if (!effect || !bearer) return false;
  const f = actionEntries(bearer).find(e => e.document === effect && e.entry.id === entryId);
  if (!f) return false;
  const by = taker ?? bearer;
  if (!mayTake(f, by)) {
    ui.notifications?.warn(`${by.name}: ${f.entry.id} is not yours to take`);
    return false;
  }
  const context: EventContext = { actor: by, event: { bearer, effect, taker: by } };
  const conditionData = conditionDataFor(f, context);
  if (!await entryHolds(f, conditionData)) return false;
  if (isTracked(by, "action")) await spend(by, "action");
  await takeEntry("action", f, context, conditionData);
  return true;
}

function actionLabel(f: FoundEntry): string {
  const label = (f.entry as { label?: unknown }).label;
  return typeof label === "string" ? label : f.entry.id;
}

/** At the bearer's turn start: a card with a button per action it (or someone near) can take */
async function postActionCard(bearer: Actor.Implementation | null | undefined) {
  if (!bearer || !game.user?.isActiveGM) return;
  const list = actionEntries(bearer);
  if (!list.length) return;
  const buttons = list.map(f => {
    const effect = f.document as ActiveEffect.Implementation;
    return `<button type="button" data-midi-entry-action="${effect.uuid}#${f.entry.id}">${foundry.utils.escapeHTML(`${effect.name}: ${actionLabel(f)}`)}</button>`;
  }).join("");
  await ChatMessage.create({
    speaker: { actor: bearer.id, alias: bearer.name },
    content: `<div>${buttons}</div>`
  });
}

function onRenderActionCard(_message: ChatMessage.Implementation, html: HTMLElement) {
  for (const button of Array.from(html.querySelectorAll<HTMLButtonElement>("[data-midi-entry-action]"))) {
    button.addEventListener("click", async () => {
      const [uuid, entryId] = (button.dataset.midiEntryAction ?? "").split("#");
      // The taker: the user's controlled token's actor, else the user's character, else the bearer
      const controlled = canvas?.tokens?.controlled[0]?.actor ?? game.user?.character ?? undefined;
      await takeAction(uuid, entryId, controlled ?? undefined);
    });
  }
}

export function registerActivityActions() {
  registerEvent("action", { label: "An action a creature can take (the bearer, or one near it): listed at the bearer's turn start" });
  onTurnEvent("turnStart", "midi-qol.entryActions", ({ actor }) => postActionCard(actor));
  Hooks.on("renderChatMessageHTML", (message, html) => onRenderActionCard(message, html));
}
