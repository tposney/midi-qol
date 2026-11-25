import { defineService, reportServiceProblem } from "../../api/services.js";
import { configSettings, safeGetGameSetting } from "../../settings.js";

/*
 * revealPolicy (single; M19): one place that decides what a user may learn of a use. midi's display settings are its
 * default provider (dnd5e's challenge visibility for DCs and NPC results, Auto Check Saves for save results and how much
 * of them, Auto Check Hit for hit or miss); a module's provider decides instead, or answers undefined to leave a
 * question to midi's settings.
 *
 *   MidiQOL.services.register("revealPolicy", "my-module", {
 *     reveals: ({ subject, user, target }) => subject === "ac" ? user.isGM || target?.hasPlayerOwner : undefined
 *   }, { priority: 10 });
 *
 * Subjects: "challenge" (a card's DC and its NPC targets' results, the caster's challenge), "saveResult" (a target's
 * save outcome), "hitResult" (hit or miss), "ac" (a target's AC at the attack), "tableResult" (an activity's table
 * result), "attacker" (what acts on a creature, for its reaction prompt: by default, unless the creature can't see it),
 * "resistances" (a target's resistances, immunities and vulnerabilities as its damage shows them) and "hpState" (the
 * hit points a target lost or gained: by default its owners, and others as Player Damage Card shows them), and
 * "hiddenAttacker" (a hidden token acting: by default only its owners; M18 stage 2, asked per viewer by the cues).
 * Names are the tokenNames service's. `saveDetail` says how much of a visible save is shown.
 */

export type RevealSubject = "challenge" | "saveResult" | "hitResult" | "ac" | "tableResult" | "attacker" | "resistances" | "hpState" | "hiddenAttacker";
export type SaveDetail = "outcome" | "total" | "dice";

export interface RevealQuery {
  subject: RevealSubject;
  user: User.Implementation;
  /** The actor whose use it is */
  caster?: Actor.Implementation;
  /** The target */
  target?: Actor.Implementation;
  /** The target has a player owner (saves: a player character's result) */
  playerOwned?: boolean;
  card?: ChatMessage.Implementation;
  /** "attacker" (M32a): the target can see the creature acting on it */
  seen?: boolean;
}

export interface SaveDetailQuery { user?: User.Implementation, caster?: Actor.Implementation, playerOwned: boolean }

export interface RevealPolicyProvider {
  /** May `user` learn this? undefined: leave it to midi's settings */
  reveals?(query: RevealQuery): boolean | undefined;
  /** How much of a visible save `user` sees; undefined: midi's settings */
  saveDetail?(query: SaveDetailQuery): SaveDetail | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { revealPolicy: RevealPolicyProvider }
}

export let revealPolicyService: ReturnType<typeof defineService<RevealPolicyProvider>>;

/* midi's settings: the default provider */

/** How save results are shown (Auto Check Saves). */
function saveMode(): string { return configSettings.autoCheckSaves; }

function challengeToPlayers(caster: Actor.Implementation | undefined): boolean {
  switch (safeGetGameSetting("dnd5e", "challengeVisibility")) {
    case "all": return true;
    case "player": return !!caster?.hasPlayerOwner;
    default: return false;
  }
}

/** Player Damage Card: a player character's damage is shown to players with any card, an NPC's with the NPC options */
function damageCardShows(target: Actor.Implementation | undefined): boolean {
  const card = configSettings.playerDamageCard ?? "none";
  if (card === "none") return false;
  return target?.hasPlayerOwner ? true : card.startsWith("npc");
}

function owns(user: User.Implementation, actor: Actor.Implementation | undefined): boolean {
  return !!actor && actor.testUserPermission(user, "OWNER");
}

export function midiReveals(query: RevealQuery): boolean {
  const { subject, user, caster, target } = query;
  if (user.isGM) return true;
  switch (subject) {
    case "challenge": return owns(user, caster) || challengeToPlayers(caster);
    case "saveResult": {
      if (["gmOnly", "whisper"].includes(saveMode())) return false;
      if (query.playerOwned) return safeGetGameSetting("dnd5e", "challengeVisibility") !== "none";
      return owns(user, caster) || challengeToPlayers(caster);
    }
    case "hitResult": return configSettings.autoCheckHit !== "whisper";
    case "ac": return true;
    case "tableResult": return true;
    case "attacker": return query.seen !== false;
    case "resistances": case "hpState": return owns(user, target) || damageCardShows(target);
    case "hiddenAttacker": return owns(user, caster);
    default: return true;
  }
}

export function midiSaveDetail(query: SaveDetailQuery): SaveDetail {
  const mode = saveMode();
  if (query.playerOwned || mode === "allShow") return "dice";
  return mode === "allNoRoll" ? "outcome" : "total";
}

export function defineRevealPolicyService() {
  revealPolicyService = defineService<RevealPolicyProvider>("revealPolicy", {
    kind: "single",
    description: "What a user may learn of a use: DCs, save and hit results, AC, names, table results"
  });
  revealPolicyService.register("midi-qol", { reveals: midiReveals, saveDetail: midiSaveDetail }, { label: "Midi-QOL: display settings" });
}

type QueryFor<Q> = Omit<Q, "user"> & { user?: User.Implementation | null };

/** The active provider's answer, if it isn't midi's own and it gives one */
export function providerReveals(query: QueryFor<RevealQuery>): boolean | undefined {
  const user = query.user ?? game.user;
  if (!user) return undefined;
  const provider = revealPolicyService?.get();
  if (!provider?.reveals || provider.reveals === midiReveals) return undefined;
  try {
    const answer = provider.reveals({ ...query, user });
    return typeof answer === "boolean" ? answer : undefined;
  } catch (err) {
    reportServiceProblem("revealPolicy", "active provider", `reveals(${query.subject}) failed; midi's settings are used`, err);
    return undefined;
  }
}

/** May `query.user` (default: this user) learn `query.subject`: the active provider, else midi's settings */
export function reveals(query: QueryFor<RevealQuery>): boolean {
  const user = query.user ?? game.user;
  if (!user) return false;
  return providerReveals(query) ?? midiReveals({ ...query, user });
}

/** How much of a visible save `user` sees: the active provider, else midi's settings */
export function revealedSaveDetail(query: QueryFor<SaveDetailQuery>): SaveDetail {
  const full: SaveDetailQuery = { ...query, user: query.user ?? game.user ?? undefined };
  const provider = revealPolicyService?.get();
  if (provider?.saveDetail && provider.saveDetail !== midiSaveDetail) {
    try {
      const answer = provider.saveDetail(full);
      if (answer === "outcome" || answer === "total" || answer === "dice") return answer;
    } catch (err) {
      reportServiceProblem("revealPolicy", "active provider", "saveDetail failed; midi's settings are used", err);
    }
  }
  return midiSaveDetail(full);
}
