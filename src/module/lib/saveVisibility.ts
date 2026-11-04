import { cardSourceActor } from "./cardState.js";
import { MODULE_ID } from "../../midi-qol.js";
import { configSettings, safeGetGameSetting } from "../settings.js";

/**
 * Who sees what of a save: one rule for midi's saves section, its damage lines, the save messages and dnd5e's
 * summaries of them, and the DC in save requests. A card's challenge (its DC, and its NPC targets' results) is the
 * caster's: dnd5e's challenge visibility "player" shows it to players when the caster has a player owner, whoever
 * clicked; the caster's owners always see it. A player character's (or player-owned NPC's) result is shown unless
 * "none". midi's save display then decides how much of a visible result is shown.
 */

/** How save results are shown (Auto Check Saves). */
export function saveDisplayMode(): string {
  return configSettings.autoCheckSaves;
}

/** The actor whose challenge a card is: the one that used the activity. */
export function cardActor(card: ChatMessage.Implementation | null | undefined): Actor.Implementation | undefined {
  if (!card) return undefined;
  return cardSourceActor(card) ?? card.speakerActor ?? undefined;
}

/** Whether `user` sees the challenge of a card used by `caster`. */
export function challengeVisible(caster: Actor.Implementation | null | undefined, user: User.Implementation | null | undefined = game.user): boolean {
  if (user?.isGM) return true;
  if (caster && user && caster.testUserPermission(user, "OWNER")) return true;
  return challengeVisibleToPlayers(caster);
}

/** Whether players who don't own `caster` see the challenge of a card it used. */
export function challengeVisibleToPlayers(caster: Actor.Implementation | null | undefined): boolean {
  switch (safeGetGameSetting("dnd5e", "challengeVisibility")) {
    case "all": return true;
    case "player": return !!caster?.hasPlayerOwner;
    default: return false;
  }
}

/** Whether `user` sees a target's save result on a card used by `caster`; `playerOwned`: the target has a player owner. */
export function canSeeSaveResult(caster: Actor.Implementation | null | undefined, playerOwned: boolean, user: User.Implementation | null | undefined = game.user): boolean {
  if (user?.isGM) return true;
  if (["gmOnly", "whisper"].includes(saveDisplayMode())) return false;
  if (playerOwned) return safeGetGameSetting("dnd5e", "challengeVisibility") !== "none";
  return challengeVisible(caster, user);
}

/** Whether `user` sees a player character's save outcome: as canSeeSaveResult, or its owner unless whisper/gmOnly (as dnd5e shows a roll's challenge to its roller). */
export function canSeePlayerOutcome(caster: Actor.Implementation | null | undefined, target: Actor.Implementation | null | undefined, user: User.Implementation | null | undefined = game.user): boolean {
  if (canSeeSaveResult(caster, true, user)) return true;
  return !!(target && user && target.testUserPermission(user, "OWNER")) && !["gmOnly", "whisper"].includes(saveDisplayMode());
}

/** How much of a visible save a player sees: the dice for player characters and allShow, else the total or just the outcome. */
export function saveDetail(playerOwned: boolean): "outcome" | "total" | "dice" {
  const mode = saveDisplayMode();
  if (playerOwned || mode === "allShow") return "dice";
  return mode === "allNoRoll" ? "outcome" : "total";
}
