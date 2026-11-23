import { MODULE_ID } from "../../../midi-qol.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { rollBy } from "../../lib/entries/activityActions.js";
import { tokenFor } from "../../lib/tokenResolver.js";
import { configSettings } from "../../settings.js";
import { applyStatusCondition } from "../../utils.js";
import { canAttack, spendAttack } from "../economy/cost.js";
import { isForcedAction } from "../economy/movement.js";
import { footprintDistance } from "../economy/opportunity.js";
import { meleeReach } from "../economy/reach.js";
import { forcedMovement } from "../forcedMovement/service.js";
import { registerInteraction, type InteractionContext } from "./registry.js";

/*
 * M8d (3): Grapple and Shove (2024: each replaces one attack of the Attack action). The target makes a Strength or
 * Dexterity save (its better) against 8 + your Strength modifier + your proficiency bonus, asked of its owner through
 * the request core. A grapple is dnd5e's Grappled status on the target, recording its grappler and the DC, and a
 * Grappling effect on the grappler; each is `dependentOn` the other (dnd5e's dependents registry, which works across
 * actors: a `dependents` entry on another actor counts only when its origin is the parent effect), so ending either
 * ends the grapple (deleted by the active GM). It ends
 * when the grappled creature escapes (an action: Athletics or Acrobatics against the DC), the grappler lets go (free),
 * the grappler is incapacitated, or the two are no longer within the grappler's reach (a teleport, forced movement).
 * The grappler's own moves drag the creature along, each foot costing one more unless it is Tiny or two sizes smaller
 * (recorded with the move, as standing up from prone); the extra is the grappler's flags.midi-qol.movement.dragCost per foot (1;
 * features change it). Shove: a push of 5 ft or Prone. With CAT active, its grapple
 * is used instead when chosen (Grapples made by), with its own Escape.
 */

const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"];
const sizeOf = (actor: Actor.Implementation | null | undefined) => SIZES.indexOf(String((actor?.system as { traits?: { size?: string } } | undefined)?.traits?.size ?? "med"));
const say = (key: string, data?: Record<string, string>) => (data ? game.i18n?.format(`midi-qol.Interactions.${key}`, data) : game.i18n?.localize(`midi-qol.Interactions.${key}`)) ?? key;

interface GrappleMark { by: string, dc: number }
const statusId = (id: string) => CONFIG.statusEffects.find(s => s.id === id)?._id as string | undefined;
const grappledEffect = (actor: Actor.Implementation | null | undefined) => { const id = statusId("grappled"); return id ? actor?.effects.get(id) : undefined; };
const markOf = (actor: Actor.Implementation | null | undefined) => foundry.utils.getProperty(grappledEffect(actor) ?? {}, `flags.${MODULE_ID}.grapple`) as GrappleMark | undefined;
const grapplingEffects = (actor: Actor.Implementation | null | undefined) =>
  (actor?.effects.contents ?? []).filter(e => foundry.utils.getProperty(e, `flags.${MODULE_ID}.grappling`)) as ActiveEffect.Implementation[];
/** The tokens the creature is grappling (midi's grapples) */
export function grappledBy(token: TokenDocument.Implementation): TokenDocument.Implementation[] {
  return grapplingEffects(token.actor).map(e => fromUuidSync(String(foundry.utils.getProperty(e, `flags.${MODULE_ID}.grappling.target`))) as TokenDocument.Implementation | null).filter((t): t is TokenDocument.Implementation => !!t);
}

/** 8 + Strength modifier + proficiency bonus */
export function grappleDC(actor: Actor.Implementation): number {
  const system = actor.system as { abilities?: { str?: { mod?: number } }, attributes?: { prof?: number } };
  return 8 + (system.abilities?.str?.mod ?? 0) + (system.attributes?.prof ?? 0);
}

const inCombat = (token: TokenDocument.Implementation) => !!(token.combatant as { combat?: { started?: boolean } } | null)?.combat?.started;
const useCAT = () => {
  const chosen = configSettings.grappleProvider ?? "auto";
  const cat = typeof (globalThis as { cat?: { utils?: { tokenUtils?: { grapple?: unknown } } } }).cat?.utils?.tokenUtils?.grapple === "function";
  return cat && (chosen === "cat" || chosen === "auto");
};

/** The common checks for Grapple and Shove: an enemy within reach, no more than one size larger, an attack left */
function targetReason({ subject, target }: InteractionContext): string | undefined {
  const creature = (target as TokenDocument.Implementation).actor;
  if (sizeOf(creature) > sizeOf(subject.actor) + 1) return say("Grapple.tooBig");
  if (inCombat(subject) && subject.actor && !canAttack(subject.actor)) return say("Grapple.noAttack");
  return undefined;
}

async function saveAgainst(subject: TokenDocument.Implementation, target: TokenDocument.Implementation, label: string): Promise<boolean | undefined> {
  const dc = grappleDC(subject.actor!);
  return rollBy(target.actor!, "save", { ability: ["str", "dex"], dc } as never, {}, `${target.name}: ${label} (DC ${dc})`);
}

async function grapple(context: InteractionContext) {
  const { subject } = context;
  const target = context.target as TokenDocument.Implementation;
  if (inCombat(subject)) await spendAttack(subject.actor!);
  if (useCAT()) {
    const cat = (globalThis as unknown as { cat: { utils: { tokenUtils: { grapple(source: TokenDocument.Implementation, target: TokenDocument.Implementation, options: object): Promise<unknown> } } } }).cat;
    return cat.utils.tokenUtils.grapple(subject, target, { rules: "2024", checkSize: true });
  }
  const saved = await saveAgainst(subject, target, say("Grapple.name"));
  if (saved !== false) return;
  const actor = target.actor!, grappler = subject.actor!;
  const grappledUuid = `${actor.uuid}.ActiveEffect.${statusId("grappled")}`;
  const [holding] = await grappler.createEmbeddedDocuments("ActiveEffect", [{
    name: say("Grapple.grappling", { name: target.name ?? "" }), img: "systems/dnd5e/icons/svg/statuses/grappled.svg", origin: grappler.uuid, transfer: false,
    // dnd5e's dependents registry (works across actors): either ending ends the other
    flags: { [MODULE_ID]: { grappling: { target: target.uuid } }, dnd5e: { dependentOn: grappledUuid } }
  } as never]);
  await applyStatusCondition(actor, "grappled", { prepare: data => {
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.grapple`, { by: subject.uuid ?? "", dc: grappleDC(grappler) } satisfies GrappleMark);
    if (holding?.uuid) foundry.utils.setProperty(data, "flags.dnd5e.dependentOn", holding.uuid);
    data.origin = grappler.uuid;
  } });
}

async function shove(context: InteractionContext) {
  const { subject } = context;
  const target = context.target as TokenDocument.Implementation;
  let mode = context.options.mode as string | undefined;
  if (mode !== "push" && mode !== "prone") {
    mode = await foundry.applications.api.DialogV2.wait({
      window: { title: say("Shove.name") },
      content: `<p>${say("Shove.which", { name: target.name ?? "" })}</p>`,
      buttons: [{ action: "push", label: say("Shove.push"), default: true }, { action: "prone", label: say("Shove.prone") }]
    }) as string | undefined;
  }
  if (mode !== "push" && mode !== "prone") return false;
  if (inCombat(subject)) await spendAttack(subject.actor!);
  const saved = await saveAgainst(subject, target, say("Shove.name"));
  if (saved !== false) return;
  if (mode === "push") await forcedMovement.push(target, { from: subject, distance: 5 });
  else await applyStatusCondition(target.actor!, "prone");
}

/** Ends the creature's grapple on it (its Grappled; the grappler's Grappling goes with it) */
export async function endGrapple(actor: Actor.Implementation): Promise<void> {
  const effect = grappledEffect(actor);
  if (!effect?.id || !markOf(actor)) return;
  if (actor.isOwner) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  else await unTimedExecuteAsGM("removeEffects", { actorUuid: actor.uuid, effects: [effect.id], options: {} });
}

/** Escape: Athletics or Acrobatics (your better) against the grapple's DC */
async function escape({ subject, options }: InteractionContext) {
  const actor = subject.actor!;
  const mark = markOf(actor);
  if (!mark) return false;
  const skills = (actor.system as { skills?: Record<string, { total?: number }> }).skills ?? {};
  const skill = (skills.ath?.total ?? 0) >= (skills.acr?.total ?? 0) ? "ath" : "acr";
  const rolls = await (actor as unknown as { rollSkill(config: object, dialog?: object): Promise<{ total?: number }[] | null> })
    .rollSkill({ skill, target: mark.dc }, options.fastForward ? { configure: false } : {});
  const total = rolls?.[0]?.total;
  if (total === undefined) return false;
  if (total >= mark.dc) await endGrapple(actor);
}

async function release({ subject }: InteractionContext) {
  for (const target of grappledBy(subject)) if (target.actor) await endGrapple(target.actor);
}

type Waypoint = { x?: number, y?: number, action?: string, [key: string]: unknown };
interface PlannedMove { method?: string, origin?: { x: number, y: number }, passed?: { waypoints?: readonly Waypoint[] }, pending?: { waypoints?: readonly Waypoint[] }, autoRotate?: boolean, showRuler?: boolean, constrainOptions?: object }

/**
 * The grappler's own move drags its grappled creatures: refused and made again as one move of them all (Scene#moveTokens,
 * one update), each creature taking the same path with the forced action, so nothing sees them apart. Made here when
 * this user owns them all (Ctrl+Z works), else by the GM (a player doesn't own the creature it drags); the movement
 * budget was checked on this client first (preMoveToken, movement.ts).
 */
function onPreMove(token: TokenDocument.Implementation, move: PlannedMove, options: { midiDrag?: boolean, midiOpportunity?: object }): boolean | void {
  if (options.midiDrag || ["undo", "paste", "config"].includes(move.method ?? "")) return;
  const waypoints = [...(move.passed?.waypoints ?? []), ...(move.pending?.waypoints ?? [])];
  if (!waypoints.length || waypoints.some(w => isForcedAction(w.action, token))) return;
  const dragged = grappledBy(token).filter(t => t.parent === token.parent);
  if (!dragged.length || !token.parent) return;
  const origin = move.origin ?? { x: token._source.x, y: token._source.y };
  const fields = ["x", "y", "elevation", "level", "action", "snapped", "explicit", "checkpoint"];
  const own = waypoints.map(w => Object.fromEntries(fields.filter(k => w[k] !== undefined).map(k => [k, w[k]])));
  const instructions: Record<string, object> = {
    [token.id ?? ""]: { waypoints: own, method: move.method, autoRotate: move.autoRotate, showRuler: move.showRuler, constrainOptions: move.constrainOptions }
  };
  for (const target of dragged) {
    const dx = target._source.x - origin.x, dy = target._source.y - origin.y;
    instructions[target.id ?? ""] = { waypoints: own.map(w => ({ ...w, x: Number(w.x ?? origin.x) + dx, y: Number(w.y ?? origin.y) + dy, action: "forced" })), autoRotate: false, showRuler: false };
  }
  const moveOptions = { midiDrag: true, ...(options.midiOpportunity ? { midiOpportunity: options.midiOpportunity } : {}) };
  const scene = token.parent;
  void (async () => {
    if ([token, ...dragged].every(t => t.isOwner)) await (scene as unknown as { moveTokens(i: object, o?: object): Promise<unknown> }).moveTokens(instructions, moveOptions);
    else await unTimedExecuteAsGM("moveTokensTogether", { sceneUuid: scene.uuid, instructions, options: moveOptions });
  })().catch(err => console.error("midi-qol | dragging a grappled creature", err));
  return false;
}

/** Out of reach (a teleport, forced movement, a drag a wall stopped), the grapple ends */
async function onMoved(token: TokenDocument.Implementation, _movement: unknown, user: User.Implementation | undefined) {
  if (!user?.isSelf) return;
  for (const target of grappledBy(token))
    if (target.actor && footprintDistance(token, target) > meleeReach(token.actor) + 1e-6) await endGrapple(target.actor);
  // A grappled creature moved away (forced): out of its grappler's reach
  const mark = markOf(token.actor);
  const grappler = mark ? tokenFor(mark.by) : undefined;
  if (mark && grappler && token.actor && footprintDistance(grappler, token) > meleeReach(grappler.actor) + 1e-6) await endGrapple(token.actor);
}

/**
 * The extra feet each foot of dragging costs the creature: flags.midi-qol.movement.dragCost, 1 by default (2024 rules), a number
 * features change with an ordinary effect change (override 0: no extra cost; the Grappler feat's Fast Wrestler, a
 * monk's feature). Never below 0.
 */
export function dragCostOf(actor: Actor.Implementation | null | undefined): number {
  const stored = foundry.utils.getProperty(actor ?? {}, `flags.${MODULE_ID}.movement.dragCost`);
  const value = stored === undefined || stored === null || stored === "" ? 1 : Number(stored);
  return Number.isFinite(value) ? Math.max(0, value) : 1;
}

/** The creatures whose drag costs the grappler extra: those it grapples, unless Tiny or two sizes smaller */
export function costlyDrags(token: TokenDocument.Implementation): TokenDocument.Implementation[] {
  return grappledBy(token).filter(t => sizeOf(t.actor) !== 0 && sizeOf(t.actor) > sizeOf(token.actor) - 2);
}

/** Extra feet per foot of the token's own move for the creatures it drags (0 when none costs extra) */
export function dragCostFor(token: TokenDocument.Implementation): number {
  return costlyDrags(token).length ? dragCostOf(token.actor) : 0;
}

/** Dragging: each foot of the grappler's own move costs one more, unless the creature is Tiny or two sizes smaller */
function onPreUpdate(token: TokenDocument.Implementation, changed: { _movementHistory?: { cost?: number | null, action?: string }[] }, options: { isUndo?: boolean }) {
  if (options.isUndo || !changed._movementHistory) return;
  const perFoot = dragCostFor(token);
  if (!perFoot) return;
  const fresh = changed._movementHistory.slice(token._source._movementHistory.length);
  if (!fresh.length || fresh.some(w => isForcedAction(w.action, token))) return;
  const cost = fresh.reduce((sum, w) => sum + (Number.isFinite(w.cost) ? Number(w.cost) : 0), 0);
  fresh[0].cost = (fresh[0].cost ?? 0) + cost * perFoot;
}

/** The grappler incapacitated: its grapples end (on the active GM) */
async function onEffectCreated(effect: ActiveEffect.Implementation) {
  if (!game.user?.isActiveGM || !(effect.parent instanceof Actor)) return;
  const actor = effect.parent as Actor.Implementation;
  if (!actor.statuses.has("incapacitated") || !grapplingEffects(actor).length) return;
  for (const token of actor.getDependentTokens({ concreteOnly: true }) as TokenDocument.Implementation[])
    for (const target of grappledBy(token)) if (target.actor) await endGrapple(target.actor);
}

export function registerGrappleInteractions() {
  registerInteraction("midi-qol.grapple", { label: "midi-qol.Interactions.Grapple.name", hint: "midi-qol.Interactions.Grapple.hint", icon: "fa-solid fa-hands-holding",
    targets: "creature", range: "reach", run: grapple, priority: 45,
    available: context => markOf((context.target as TokenDocument.Implementation).actor) ? say("Grapple.already") : targetReason(context) });
  registerInteraction("midi-qol.shove", { label: "midi-qol.Interactions.Shove.name", hint: "midi-qol.Interactions.Shove.hint", icon: "fa-solid fa-hand-back-fist",
    targets: "creature", range: "reach", run: shove, priority: 44, available: targetReason });
  registerInteraction("midi-qol.escape", { label: "midi-qol.Interactions.Escape.name", hint: "midi-qol.Interactions.Escape.hint", icon: "fa-solid fa-person-running",
    targets: "self", cost: { action: 1 }, run: escape, priority: 60, relevant: ({ subject }) => !!markOf(subject.actor) });
  registerInteraction("midi-qol.release", { label: "midi-qol.Interactions.Release.name", hint: "midi-qol.Interactions.Release.hint", icon: "fa-solid fa-hand",
    targets: "self", run: release, priority: 59, relevant: ({ subject }) => grappledBy(subject).length > 0 });
  Hooks.on("preMoveToken", (token, move, options) => onPreMove(token, move as unknown as PlannedMove, options as never));
  Hooks.on("moveToken", (token, movement, _operation, user) => { void onMoved(token, movement as never, user as User.Implementation | undefined); });
  Hooks.on("preUpdateToken", (token, changed, options) => onPreUpdate(token, changed as never, options as never));
  Hooks.on("createActiveEffect", effect => { void onEffectCreated(effect as ActiveEffect.Implementation); });
}
