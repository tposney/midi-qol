import { i18n } from "../../../midi-qol.js";
import type { Activity } from "../../../globals.js";
import { configSettings } from "../../settings.js";
import { completeActivityUse } from "../../utils.js";
import { registerInteraction } from "../interactions/registry.js";

/*
 * M7: click to attack (proposal section 5: an optional feature on the public services). With the Click to attack setting:
 * - a HUD primes a use on a creature (MidiQOL.attack.prime(activity): an attack, save, damage or healing with no area, not
 *   on the user; midi's hub does for any such use chosen with no target, DAS HUD on a weapon or attack cell),
 *   and the next left click on a token makes it against that token (midi's use, the token its target); Esc or a right
 *   click cancels;
 * - Alt+click on a token, with one of your tokens controlled, attacks it with your last attack (else your first equipped
 *   weapon's);
 * - "Attack" among the interactions offered on a targeted creature (the Token HUD's palette).
 * Another module takes a click first through `midi-qol.claimClick` ({ target, attacker, activity, event }: return false to
 * claim it, midi then does nothing).
 */

const ATTACK_INTERACTION = "midi-qol.attack";

/** The attack waiting for a target */
let primed: { activity: Activity, actorUuid: string, attackMode?: string } | undefined;
/** Each actor's last attack (this session) */
const lastAttack = new Map<string, string>();

/** The player's own choice (a user setting, so the GM can set it for them in the Turn HUD window) */
export const CLICK_TO_ATTACK_SETTING = "clickToAttackOn";

/** The table allows click to attack (midi's world setting) */
export const clickToAttackAllowed = () => configSettings.clickToAttack === true;
/** Click to attack for this user: allowed by the table, and the player hasn't turned it off */
export const clickToAttackEnabled = () => clickToAttackAllowed()
  && game.settings?.get("midi-qol", CLICK_TO_ATTACK_SETTING as never) !== false;

/** The player's choice (init) */
export function registerClickToAttackSetting() {
  game.settings?.register("midi-qol", CLICK_TO_ATTACK_SETTING as never, {
    name: "midi-qol.ClickToAttack.UserName",
    hint: "midi-qol.ClickToAttack.UserHint",
    scope: "user",
    config: false,
    type: Boolean,
    default: true
  } as never);
}

/** An attack made against one clicked token: an attack activity with no area (a cone or line is placed, not clicked) */
const isAttack = (activity: Activity | null | undefined): activity is Activity => (activity as { type?: string } | null)?.type === "attack"
  && !(activity as { target?: { template?: { type?: string } } }).target?.template?.type;

type Targeting = { type?: string, target?: { template?: { type?: string }, affects?: { type?: string } }, range?: { units?: string } };
/** Activity types used on a creature: what a click on a token picks */
const CLICKED_TYPES = new Set(["attack", "save", "damage", "heal"]);
/** Target types a click on a token can't give */
const NOT_CLICKED = new Set(["self", "space"]);

/** A use a click on a token targets: an attack, save, damage or healing whose prepared target (dnd5e's: the item's
 * unless the activity overrides it) has no area and isn't the user or a space, and whose prepared range isn't Self */
export function clicksTarget(activity: Activity | null | undefined): activity is Activity {
  const a = activity as Targeting | null | undefined;
  if (!a?.type || !CLICKED_TYPES.has(a.type) || a.target?.template?.type) return false;
  return !NOT_CLICKED.has(a.target?.affects?.type ?? "") && a.range?.units !== "self";
}
const activitiesOf = (item: Item.Implementation) => ((item.system as { activities?: { contents?: Activity[] } }).activities?.contents ?? []) as Activity[];

/** The actor's default attack: its last, else its first equipped weapon's */
export function defaultAttack(actor: Actor.Implementation | null | undefined): Activity | undefined {
  if (!actor) return undefined;
  const last = actor.uuid ? lastAttack.get(actor.uuid) : undefined;
  const recorded = last ? fromUuidSync(last) as Activity | null : null;
  if (isAttack(recorded) && recorded.actor === actor) return recorded;
  for (const item of actor.items) {
    const system = item.system as { equipped?: boolean };
    if ((item.type as string) !== "weapon" || !system.equipped) continue;
    const attack = activitiesOf(item).find(isAttack);
    if (attack) return attack;
  }
  return undefined;
}

/** Waits for a click on a token to attack it with this activity (`attackMode`: dnd5e's, e.g. offhand) */
export function primeAttack(activity: Activity, { attackMode }: { attackMode?: string } = {}) {
  const actorUuid = activity.actor?.uuid;
  if (!actorUuid || !clicksTarget(activity)) return false;
  primed = { activity, actorUuid, ...(attackMode ? { attackMode } : {}) };
  document.body.classList.add("midi-qol-attack-primed");
  ui.notifications?.info(i18n("midi-qol.ClickToAttack.Primed").replace("{name}", activity.item?.name ?? activity.name ?? ""));
  return true;
}

/** A HUD's use of an activity: with Click to attack on, a use on a creature (an attack, a save...) with no target
 * waits for a click on one */
export async function useOrPrime(activity: Activity & { use?(usage?: object): Promise<unknown> }, usage: object = {}) {
  if (clickToAttackEnabled() && clicksTarget(activity) && !game.user?.targets.size && primeAttack(activity)) return;
  await activity.use?.(usage);
}

export function cancelPrimed() {
  if (!primed) return;
  primed = undefined;
  document.body.classList.remove("midi-qol-attack-primed");
}

/** The attack against the target: midi's use, with the target as its only one */
export async function attackTarget(activity: Activity, target: TokenDocument.Implementation, { attackMode }: { attackMode?: string } = {}) {
  return completeActivityUse(activity, { midiOptions: { targetUuids: [target.uuid],
    workflowOptions: { targetConfirmation: "none", ...(attackMode ? { attackMode } : {}) } } } as never);
}

/**
 * A left click on a token (patching.ts's Token._onClickLeft wrapper asks first; libWrapper allows midi one wrapper per
 * method): the primed attack, or Alt+click's default attack. True when the click was taken (the token's own click then
 * doesn't happen).
 */
export function clickToAttackTakes(token: Token.Implementation, event: { altKey?: boolean, interactionData?: { originalEvent?: { altKey?: boolean } } } & object): boolean {
  if (!clickToAttackEnabled()) return false;
  const alt = event.altKey ?? event.interactionData?.originalEvent?.altKey ?? false;
  const controlled = canvas?.tokens?.controlled ?? [];
  let activity: Activity | undefined = primed?.activity;
  const attackMode = primed?.attackMode;
  if (!activity && alt && controlled.length === 1 && controlled[0] !== token) activity = defaultAttack(controlled[0].actor as Actor.Implementation);
  if (!activity) return false;
  const target = token.document as TokenDocument.Implementation;
  const attacker = activity.actor;
  cancelPrimed();
  if (Hooks.call("midi-qol.claimClick", { target, attacker, activity, event }) === false) return true;
  void attackTarget(activity, target, { attackMode }).catch(err => console.error("midi-qol | click to attack", err));
  return true;
}

export function setupClickToAttack() {
  document.addEventListener("keydown", event => { if (event.key === "Escape" && primed) cancelPrimed(); });
  document.addEventListener("contextmenu", () => cancelPrimed(), true);
  Hooks.on("midi-qol.RollComplete" as never, ((workflow: { activity?: Activity, actor?: Actor.Implementation }) => {
    if (isAttack(workflow.activity) && workflow.actor?.uuid && workflow.activity.uuid) lastAttack.set(workflow.actor.uuid, workflow.activity.uuid);
  }) as never);
  registerInteraction(ATTACK_INTERACTION, {
    label: "midi-qol.ClickToAttack.Attack",
    icon: "fa-solid fa-sword",
    hint: "midi-qol.ClickToAttack.AttackHint",
    targets: "creature",
    relevant: ({ subject, target }) => clickToAttackEnabled() && !!target && target !== subject && !!defaultAttack(subject.actor as Actor.Implementation),
    activity: ({ subject }) => defaultAttack(subject.actor as Actor.Implementation)
  });
}

export const clickToAttackApi = { prime: primeAttack, cancel: cancelPrimed, enabled: clickToAttackEnabled, allowed: clickToAttackAllowed, defaultAttack, attack: attackTarget };
