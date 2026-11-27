import { tokenFor } from "../tokenResolver.js";
import type { Activity } from "../../../globals.js";
import type { Workflow } from "../../Workflow.js";
import { completeActivityUse, playerForActor } from "../../utils.js";
import { rollAbility, SAVE_REQUEST } from "../../GMAction.js";
import { askUser } from "../requests.js";
import { configSettings } from "../../settings.js";
import type { SaveDetails } from "../../../globals.js";
import { getDistance } from "../../services/distance/service.js";
import { meleeReach } from "../../services/economy/reach.js";
import { isTracked, spend } from "../../services/economy/ledger.js";
import { onTurnEvent } from "../turnEvents.js";
import { actorEffectEntries, applyingActivity, conditionDataFor, entryHolds, registerEvent, takeEntry, type ActionRun, type EventContext } from "./engine.js";
import type { FoundEntry } from "./types.js";
import { actorsFor, withActivityModifiers } from "./useEvents.js";

/*
 * M15 stage 6: actions that run an activity, and the `action` event.
 * - `save: "activity:<id>"` / `check: "activity:<id>"` (and `use` outside a use's events): the activity (of the entry's item; an effect's: the item that
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

/** The creature whose use applied an effect (its origin's actor) */
function originActorOf(effect: ActiveEffect.Implementation): Actor.Implementation | undefined {
  let origin: unknown = effect.origin ? fromUuidSync(effect.origin.replace(/\.Activity\.[^.]+$/, ""), { strict: false }) : undefined;
  while (origin && !(origin instanceof Actor) && (origin as { parent?: unknown }).parent) origin = (origin as { parent?: unknown }).parent;
  return origin instanceof Actor ? origin : undefined;
}

/**
 * An activity of the entry's item by id, identifier or name; `itemIdentifier`: of another item of that item's actor (the
 * Ooze Cube's entry using its Engulf's save)
 */
export function entryActivity(f: FoundEntry, ref: string, itemIdentifier?: unknown): Activity | undefined {
  const id = ref.startsWith(ACTIVITY_REF) ? ref.slice(ACTIVITY_REF.length) : ref;
  let item = entryItem(f);
  if (typeof itemIdentifier === "string" && itemIdentifier) item = item?.actor?.items.find(i => (i.system as { identifier?: string }).identifier === itemIdentifier);
  // @ts-expect-error no dnd5e-types
  const activities = item?.system.activities;
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
  const token = tokenFor(bearer);
  return token ? [token] : [];
}

/**
 * `{ save | check | use: "activity:<id>" }`: the activity used against the subjects, nothing consumed (`use` at an
 * event that isn't the use's: a swallowed creature's damage at its swallower's turn)
 */
export async function activityRollAction(run: ActionRun, kind: "save" | "check" | "use"): Promise<{ success?: boolean } | void> {
  const ref = run.action[kind] as string;
  const activity = entryActivity(run.found, ref, run.action.item);
  if (!activity) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: no activity ${ref}`);
    return;
  }
  // `to`: whom (as `for` elsewhere: self, target, taker...), else the event's target, the use's targets or the bearer
  const near = run.context.target ?? tokenFor(run.found.actor ?? run.context.actor) ?? null;
  const subjects = typeof run.action.to === "string"
    ? actorsFor(run.action.to, run, "target").map(actor => tokenFor(actor, { near })).filter((t): t is TokenDocument.Implementation => !!t)
    : subjectsOf(run);
  if (!subjects.length) return;
  // `rollModifier` (`rolls`): on the subjects' rolls of that use (a save with disadvantage)
  const used = await withActivityModifiers(run, activity.uuid ?? "", subjects.map(t => t.actor?.uuid).filter((u): u is string => !!u), () => completeActivityUse(activity, {
    consume: { action: false, resources: false, spellSlot: false },
    midiOptions: {
      targetUuids: subjects.map(t => t.uuid).filter((uuid): uuid is string => !!uuid),
      workflowOptions: { targetConfirmation: "none", autoRollAttack: true, autoRollDamage: "always", fastForwardAttack: true, fastForwardDamage: true, isTriggered: true }
    }
  }, { configure: false }, {}) as Promise<Workflow | undefined>);
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

/** Who `by` names: the use's actor ("attacker", "event.actor"), the entry's holder ("bearer", "self") */
function rollerOf(run: ActionRun): Actor.Implementation | undefined {
  switch (run.action.by) {
    case "attacker":
    case "event.actor": return run.context.workflow?.actor ?? undefined;
    case "bearer":
    case "self": return run.found.actor ?? run.context.actor;
    default: return undefined;
  }
}

/**
 * A save or check made by another creature (`by`: Sanctuary's attacker): its owner rolls on their own client through
 * the request core (its deadline; the GM can roll for them); this client rolls when it owns it or nobody else is there.
 */
export async function rollBy(actor: Actor.Implementation, kind: "save" | "check", spec: DirectSpec, conditionData: Record<string, unknown>, label: string): Promise<boolean | undefined> {
  const owner = playerForActor(actor) as User.Implementation | undefined;
  if (!owner || owner.isSelf || !owner.active || owner.isGM) return directRoll(actor, kind, spec, conditionData);
  const dc = dcOf(spec.dc, conditionData);
  if (dc === undefined) return undefined;
  const skills = [spec.skill ?? []].flat();
  const abilities = [spec.ability ?? []].flat();
  const rollType = kind === "check" && skills.length ? "skill" : kind;
  const saveDetails: SaveDetails = {
    actorUuid: actor.uuid ?? "", advantage: undefined, disadvantage: undefined, modifierTracker: undefined, isFriendly: false,
    isMagicSave: false, isConcentrationCheck: false, rollDC: dc, saveItemUuid: "", workflowId: "", itemCardUuid: "", workflowOptions: {},
    rollType, rollAbilities: rollType === "skill" ? [] : abilities, rollSkills: rollType === "skill" ? skills : [], rollTools: [], itemId: ""
  };
  const displayOptions = { fastForward: false, chatMessage: true, showTargetDC: true };
  const forPlayer = { saveDetails, displayOptions: { ...displayOptions, fastForward: true, forUserId: owner.id ?? undefined } };
  const rolled = await askUser<unknown>(owner, {
    type: SAVE_REQUEST, data: { saveDetails, displayOptions }, kind: "save", actorUuid: actor.uuid ?? undefined, label,
    timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000,
    fallback: () => rollAbility(forPlayer),
    gmChoices: { roll: { label: "midi-qol.PlayerWaits.Choice.normal", value: () => rollAbility(forPlayer) } }
  }).settled.then(settled => settled.value, () => undefined);
  const roll = (Array.isArray(rolled) ? rolled[0] : rolled) as { total?: number } | undefined;
  return roll?.total === undefined ? undefined : roll.total >= dc;
}

/** `save` / `check` with `by`: rolled by that creature (rollBy) */
export async function byRollAction(run: ActionRun, kind: "save" | "check"): Promise<{ success?: boolean } | void> {
  const spec = run.action[kind];
  const roller = rollerOf(run);
  if (!spec || typeof spec !== "object" || !roller) return;
  const label = `${roller.name}: ${typeof run.action.label === "string" ? run.action.label : (run.found.document as { name?: string }).name ?? run.found.entry.id}`;
  const success = await rollBy(roller, kind, spec as DirectSpec, run.conditionData, label);
  return success === undefined ? undefined : { success };
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
      const spec = who as { within: number | "reach", of?: string };
      // Measured from the bearer, or from the creature whose use applied the effect (pulling a creature out of a Gelatinous Cube)
      const origin = spec.of === "origin" && f.document instanceof ActiveEffect ? originActorOf(f.document) : undefined;
      const from = tokenFor(origin ?? bearer);
      const to = from ? tokenFor(taker, { scene: from.parent, near: from }) : undefined;
      if (!from || !to || to === from) continue;
      const within = spec.within === "reach" ? meleeReach(bearer) : Number(spec.within);
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
