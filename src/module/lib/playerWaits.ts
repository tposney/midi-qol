/**
 * Waits on players: a save, check, reaction or bonus a workflow is waiting for a player to answer. The client running
 * the workflow (the holder) keeps each wait and how to settle it; the GMs are told about it and show it in the player
 * list (playerWaitsUI.ts), where a GM can answer for the player. Players are told only who is waiting on what kind of
 * prompt: their own waits always (their badge brings their prompts forward), everyone's with playerWaitShowPlayers. The first answer wins: the player's, the GM's or the
 * timeout's. Other modules use the same API (MidiQOL.playerWaits) for their own prompts.
 */

import { MODULE_ID } from "../../midi-qol.js";
import { socketlibSocket } from "../GMAction.js";
import { configSettings, safeGetGameSetting } from "../settings.js";

/** midi's own kinds; other modules may use their own. */
export type WaitKind = "save" | "check" | "defence" | "reaction" | "bonus" | "contest" | (string & {});
/**
 * midi's own choices, with built-in labels: roll (rolled for the player), gmRoll (rolled on the GM's screen), choose
 * (the GM picks the reaction), none (no reaction), skip (no change). Other modules name their own and give a label.
 */
export type WaitChoice = "roll" | "gmRoll" | "choose" | "none" | "skip" | (string & {});
/** A choice's value, or its value and the label shown on its button (text or a localization key). */
export type WaitChoiceSpec<T> = (() => Promise<T> | T) | { label: string, value: () => Promise<T> | T };

export interface WaitSpec<T> {
  kind: WaitKind;
  /** The player the wait is for (who owns the creature). */
  userId: string;
  actorUuid?: string;
  /** The creature's token: its name is shown (the actor's name without it). */
  tokenUuid?: string;
  /** What is asked, e.g. "DEX save: Fireball" (text or a localization key). */
  label: string;
  /** The choices the GM can answer with, and the value each settles the wait with. The first is the default (used by
   *  "Answer pending prompts with defaults" and by a disconnect when it settles). */
  choices: Partial<Record<WaitChoice, WaitChoiceSpec<T>>>;
  /** Clean-up when the GM or a disconnect settles the wait (forget the request, close the player's dialog). */
  onSettled?: (choice: WaitChoice) => void;
  /** The module that registered it (shown to the GM). */
  source?: string;
  /** Leave the player's open roll dialog for the creature alone when settled (the choice uses it). */
  keepDialogs?: boolean;
}

export interface WaitInfo {
  id: string;
  holderId: string;
  kind: WaitKind;
  userId: string;
  actorUuid?: string;
  actorName?: string;
  label: string;
  choices: { id: WaitChoice, label?: string }[];
  startedAt: number;
  /** The player disconnected while it was pending: it waits for the GM. */
  offline: boolean;
  source?: string;
}

/** A wait begun with beginPlayerWait. */
export interface PlayerWait<T> {
  id: string;
  /** Pass to the player's client with the request, for claimPlayerWait. */
  ref: WaitRef;
  /** Settles when the GM (or a disconnect) answers, with the choice and its value; never if the wait ends otherwise. */
  settled: Promise<{ choice: WaitChoice, value: T }>;
  /** End the wait: the player answered, or it is no longer needed. */
  end: () => void;
  readonly active: boolean;
  /** The GM (or a disconnect) is answering: what the player's request returns now is to be ignored. */
  readonly answeredForPlayer: boolean;
}

interface LocalWait {
  info: WaitInfo;
  done: boolean;
  /** Settled by a choice (the GM's, or a disconnect's default) rather than the player's answer. */
  byChoice?: boolean;
  run: (choice: WaitChoice) => Promise<boolean>;
}

const localWaits = new Map<string, LocalWait>();
/** Every pending wait, from every holder (on a player: redacted; others' only with playerWaitShowPlayers). */
const knownWaits = new Map<string, WaitInfo>();
const listeners = new Set<() => void>();

/** Called whenever the waits this client knows about change. */
export function onPlayerWaitsChanged(listener: () => void) {
  listeners.add(listener);
}

export function knownPlayerWaits(): WaitInfo[] {
  return [...knownWaits.values()].sort((a, b) => a.startedAt - b.startedAt);
}

function notify() {
  Hooks.callAll("midi-qol.playerWaitsChanged", knownPlayerWaits());
  for (const listener of listeners) {
    try { listener(); } catch (err) { console.error(`${MODULE_ID} | player waits listener`, err); }
  }
}

/** What a player is told: who is waiting on what kind of prompt, not what it is about or how to answer it. */
function redact(info: WaitInfo): WaitInfo {
  return { ...info, label: "", choices: [], actorUuid: undefined, source: undefined };
}

function applyChange({ op, info }: { op: "add" | "update" | "remove", info: WaitInfo }) {
  if (op === "remove") {
    if (!knownWaits.delete(info.id)) return;
  } else if (game.user?.isGM) knownWaits.set(info.id, info);
  else if (configSettings.playerWaitShowPlayers || info.userId === game.user?.id) knownWaits.set(info.id, redact(info));
  else return;
  notify();
}

function announce(op: "add" | "update" | "remove", info: WaitInfo) {
  applyChange({ op, info });
  socketlibSocket?.executeForOtherGMs("playerWaitChanged", { op, info })?.catch?.(() => { });
  // A remove goes to every player, so none keeps a wait after the setting is turned off
  const everyone = op === "remove" || configSettings.playerWaitShowPlayers;
  const players = game.users?.filter(user => user.active && !user.isGM && user.id !== game.user?.id
    && (everyone || user.id === info.userId)).map(user => user.id) ?? [];
  if (players.length) socketlibSocket?.executeForUsers("playerWaitChanged", players, { op, info: redact(info) })?.catch?.(() => { });
}

/** What a request sent to a player carries so the player's client can claim the wait (claimPlayerWait). */
export type WaitRef = { id: string, holderId: string };

// Waits settled by the GM or a disconnect, so a late claim for one is refused.
const settledIds = new Set<string>();

/**
 * Begin a wait on a player: the GM sees it in the player list and can answer for them with one of its choices. Returns
 * undefined for a GM (they answer on their own screen) or a spec without choices. End it when the player answers or it
 * is no longer needed; the GM's answer arrives through `settled`. The first answer wins: claim the wait (claimPlayerWait)
 * on the player's client before acting on their answer.
 */
export function beginPlayerWait<T>(spec: WaitSpec<T>): PlayerWait<T> | undefined {
  const user = game.users?.get(spec.userId);
  const choiceIds = Object.keys(spec.choices) as WaitChoice[];
  if (!user || user.isGM || !choiceIds.length) return undefined;
  const actor = spec.actorUuid ? fromUuidSync(spec.actorUuid, { strict: false }) as Actor.Implementation | null : null;
  const info: WaitInfo = {
    id: foundry.utils.randomID(), holderId: game.user!.id!, kind: spec.kind, userId: spec.userId,
    actorUuid: spec.actorUuid, actorName: (spec.tokenUuid ? (fromUuidSync(spec.tokenUuid) as TokenDocument.Implementation | null)?.name : undefined) ?? actor?.name ?? undefined, label: spec.label, source: spec.source,
    choices: choiceIds.map(id => {
      const choice = spec.choices[id];
      return typeof choice === "object" && choice ? { id, label: choice.label } : { id };
    }),
    startedAt: Date.now(), offline: !user.active
  };
  let settle!: (result: { choice: WaitChoice, value: T }) => void;
  const settled = new Promise<{ choice: WaitChoice, value: T }>(resolve => settle = resolve);
  const end = (choice?: WaitChoice) => {
    if (wait.done) return;
    wait.done = true;
    localWaits.delete(info.id);
    announce("remove", info);
    Hooks.callAll("midi-qol.playerWaitEnded", info, { choice });
  };
  const wait: LocalWait = {
    info, done: false,
    run: async (choice) => {
      if (wait.done) return false;
      wait.byChoice = true;
      const id = choice in spec.choices ? choice : choiceIds[0];
      const entry = spec.choices[id]!;
      const make = typeof entry === "function" ? entry : entry.value;
      end(id);
      settledIds.add(info.id);
      try { spec.onSettled?.(id); } catch (err) { console.error(`${MODULE_ID} | player wait clean-up`, err); }
      if (!spec.keepDialogs) closePlayerRollDialogs(info);
      try { settle({ choice: id, value: await make() }); } catch (err) { console.error(`${MODULE_ID} | settling player wait`, err); }
      return true;
    }
  };
  localWaits.set(info.id, wait);
  announce("add", info);
  Hooks.callAll("midi-qol.playerWaitStarted", info);
  return {
    id: info.id, ref: { id: info.id, holderId: info.holderId }, settled, end: () => end(),
    get active() { return !wait.done; },
    get answeredForPlayer() { return !!wait.byChoice; }
  };
}

/**
 * Track a request that waits on a player. `start` sends the request (given the wait's reference, undefined when it is
 * not tracked) and returns its promise. Returns a promise that settles with the player's answer, or with the value of
 * the choice the GM (or a disconnect) settles it with, whichever comes first.
 */
export function trackPlayerWait<T>(spec: WaitSpec<T>, start: (ref: WaitRef | undefined) => Promise<T>): Promise<T> {
  const wait = beginPlayerWait(spec);
  if (!wait) return start(undefined);
  const never = new Promise<T>(() => { });
  // Once the GM (or a disconnect) is answering, the player's request may still come back: closing the player's dialog
  // answers it locally ("no reaction", a cancelled roll). That must not win over the GM's answer, which takes longer.
  const answered = start(wait.ref).then(value => {
    if (wait.answeredForPlayer) return never;
    wait.end();
    return value;
  }, err => {
    if (wait.answeredForPlayer || !wait.active) return never;
    // The request failed because the player left (socketlib rejects a request to a user who disconnects): the wait
    // is kept for the GM, or settled with its default, rather than failing the use.
    const local = localWaits.get(wait.id);
    if (local && (err?.name === "SocketlibInvalidUserError" || !game.users?.get(spec.userId)?.active)) {
      setOffline(local, true);
      return never;
    }
    wait.end();
    throw err;
  });
  return Promise.race([answered, wait.settled.then(result => result.value)]);
}

/** The GM or a disconnect answered: close the roll dialog the player may have open for the creature. */
function closePlayerRollDialogs(info: WaitInfo) {
  if (!info.actorUuid || !game.users?.get(info.userId)?.active) return;
  if (info.userId === game.user?.id) return _closePlayerRollDialogs({ actorUuid: info.actorUuid });
  socketlibSocket?.executeAsUser("closePlayerRollDialogs", info.userId, { actorUuid: info.actorUuid })?.catch?.(() => { });
}

/** dnd5e's roll dialogs open on this client for the actor. */
export function rollDialogsFor(actorUuid: string): foundry.applications.api.ApplicationV2[] {
  const RollConfigurationDialog = globalThis.dnd5e?.applications?.dice?.RollConfigurationDialog;
  if (!RollConfigurationDialog) return [];
  return [...foundry.applications.instances.values()].filter(app => {
    if (!(app instanceof RollConfigurationDialog)) return false;
    const subject = (app as unknown as { config?: { subject?: { uuid?: string, parent?: { uuid?: string } } } }).config?.subject;
    return (subject?.uuid ?? subject?.parent?.uuid) === actorUuid;
  });
}

/** Close dnd5e's roll dialogs open on this client for the actor (as cancelled; the roll is no longer wanted). */
export function _closePlayerRollDialogs({ actorUuid }: { actorUuid: string }) {
  for (const app of rollDialogsFor(actorUuid)) app.close();
}

/** Settle a wait on the client holding it. */
export async function settlePlayerWait(id: string, choice: WaitChoice): Promise<boolean> {
  const info = knownWaits.get(id);
  if (localWaits.has(id) || !info) return _settlePlayerWait({ id, choice });
  return socketlibSocket.executeAsUser("settlePlayerWait", info.holderId, { id, choice });
}

export async function _settlePlayerWait({ id, choice }: { id: string, choice: WaitChoice }): Promise<boolean> {
  return await localWaits.get(id)?.run(choice) ?? false;
}

/**
 * Claim a wait for the player's own answer, before acting on it (using a reaction): false when the GM or a disconnect
 * has already settled it, so the player's answer is dropped.
 */
export async function claimPlayerWait(ref: WaitRef | undefined): Promise<boolean> {
  if (!ref) return true;
  if (ref.holderId === game.user?.id) return _claimPlayerWait({ id: ref.id });
  return socketlibSocket.executeAsUser("claimPlayerWait", ref.holderId, { id: ref.id });
}

export function _claimPlayerWait({ id }: { id: string }): boolean {
  if (settledIds.has(id)) return false;
  const wait = localWaits.get(id);
  if (wait && !wait.done) {
    // The player's answer is coming: nobody else may settle it now.
    wait.done = true;
    localWaits.delete(id);
    announce("remove", wait.info);
    Hooks.callAll("midi-qol.playerWaitEnded", wait.info, { claimed: true });
  }
  return true;
}

function onUserConnected(user: User.Implementation, connected: boolean) {
  // A holder that left took its waits with it.
  if (!connected) {
    let changed = false;
    for (const info of knownWaits.values()) {
      if (info.holderId === user.id) { knownWaits.delete(info.id); changed = true; }
    }
    if (changed) notify();
  }
  for (const wait of [...localWaits.values()]) {
    if (wait.info.userId === user.id) setOffline(wait, !connected);
  }
}

/** The player left (or came back): keep the wait for the GM to answer, or settle it with its default. */
function setOffline(wait: LocalWait, offline: boolean) {
  if (wait.done) return;
  // Without the GM answering for players, a player who left has their roll made for them and their reaction declined
  if (offline && !configSettings.playerWaitGM) {
    wait.run(wait.info.choices[0].id);
  } else if (wait.info.offline !== offline) {
    wait.info.offline = offline;
    announce("update", wait.info);
  }
}

/** A client that loaded after the waits began asks every client for theirs. */
export function _announcePlayerWaits() {
  for (const wait of localWaits.values()) announce("add", wait.info);
}

export function setupPlayerWaits() {
  Hooks.on("userConnected", onUserConnected);
  Hooks.once("ready", () => {
    socketlibSocket?.executeForOthers("announcePlayerWaits")?.catch?.(() => { });
  });
}

export const playerWaitHandlers = {
  playerWaitChanged: applyChange,
  settlePlayerWait: _settlePlayerWait,
  claimPlayerWait: _claimPlayerWait,
  closePlayerRollDialogs: _closePlayerRollDialogs,
  announcePlayerWaits: _announcePlayerWaits
};
