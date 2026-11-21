import { MODULE_ID } from "../../../midi-qol.js";
import type { OfferedBonus } from "./service.js";

/*
 * M15 stage 5a (proposal 13b part 1): a standing choice per bonus, per actor, applied before any prompt (user,
 * 2026-11-21: every bonus starts at Ask, so nothing changes until the player picks; set from the prompt's row control
 * and the sheet's Toggles and choices window).
 * - ask: offered as now; always: applied without asking; critical: offered only on a critical, else not;
 *   never: not offered; next: applied on the next roll it is offered for, then back to ask.
 * Someone else's bonus (a spender other than the roller) is its holder's to decide: not changed here.
 * Stored on the actor as `flags.midi-qol.bonusChoices`, a list (keys hold dots), with the bonus's label for the window.
 */

export type StandingChoice = "ask" | "always" | "critical" | "never" | "next";
export const STANDING_CHOICES: readonly StandingChoice[] = ["ask", "always", "critical", "never", "next"];

export interface StoredStanding { key: string, choice: StandingChoice, label: string }

/** A bonus's key across rolls: a flag by its name (all its values), any other by its candidate id */
export function standingKey(candidate: Pick<OfferedBonus, "id" | "flagKey">): string {
  return candidate.flagKey ? `flag:${candidate.flagKey.replace(`flags.${MODULE_ID}.optional.`, "")}` : candidate.id;
}

export function storedStandings(actor: Actor.Implementation | undefined): StoredStanding[] {
  const stored = actor?.getFlag(MODULE_ID, "bonusChoices");
  return Array.isArray(stored) ? stored.filter((s): s is StoredStanding => !!s && typeof s.key === "string" && STANDING_CHOICES.includes(s.choice)) : [];
}

export function standingChoice(actor: Actor.Implementation | undefined, key: string): StandingChoice {
  return storedStandings(actor).find(s => s.key === key)?.choice ?? "ask";
}

/** Ask removes the record (the default) */
export async function setStandingChoice(actor: Actor.Implementation, key: string, choice: StandingChoice, label: string): Promise<void> {
  const others = storedStandings(actor).filter(s => s.key !== key);
  const list = choice === "ask" ? others : [...others, { key, choice, label }];
  const updates: Record<string, unknown> = { [`flags.${MODULE_ID}.bonusChoices`]: list };
  await actor.update(updates);
}

/**
 * The offered bonuses after the actor's standing choices: those still to ask, those to apply without asking, and the
 * ones armed for this roll only (reset to ask once applied).
 */
export function applyStandingChoices(actor: Actor.Implementation | undefined, optional: OfferedBonus[], critical: boolean):
  { ask: OfferedBonus[], apply: OfferedBonus[], armed: OfferedBonus[] } {
  const stored = storedStandings(actor);
  if (!actor || !stored.length) return { ask: optional, apply: [], armed: [] };
  const ask: OfferedBonus[] = [];
  const apply: OfferedBonus[] = [];
  const armed: OfferedBonus[] = [];
  // A flag offers one candidate per value: a standing choice applies its first value only
  const flagsApplied = new Set<string>();
  for (const candidate of optional) {
    const own = !candidate.spender || candidate.spender === actor.uuid;
    const choice = own ? stored.find(s => s.key === standingKey(candidate))?.choice ?? "ask" : "ask";
    if (choice === "never" || (choice === "critical" && !critical)) continue;
    if (choice === "always" || choice === "next") {
      if (candidate.flagKey && flagsApplied.has(candidate.flagKey)) continue;
      if (candidate.flagKey) flagsApplied.add(candidate.flagKey);
      apply.push(candidate);
      if (choice === "next") armed.push(candidate);
      continue;
    }
    ask.push(candidate);
  }
  return { ask, apply, armed };
}
