import { i18n } from "../../midi-qol.js";
import { Registry } from "../api/registry.js";
import { budget, isTracked } from "../services/economy/ledger.js";
import { movementState } from "../services/economy/movement.js";
import { collectEntries } from "./entries/engine.js";
import { requestsFor } from "./requests.js";
import { deferredUses } from "./deferred.js";
import { tokenFor } from "./tokenResolver.js";
import { systemConcentrationId } from "../../midi-qol.js";

/*
 * M22b: the turn checklist (plan ~/Documents/midi-next-M20-M22-plan-2026-11-24.md). What a creature's owner should know
 * at its turn: at the start, what happens now or is pending (saves or effects that run at this boundary, requests
 * waiting, readied uses, concentration, conditions that limit it, effects about to end); before ending, what it hasn't
 * used (action, bonus action, movement) and what runs at the end. Contributors add items (MidiQOL.checklist.register);
 * the turn model carries them for HUDs, and midi's panel shows them to the owner (ChecklistPanel).
 */

export type ChecklistPhase = "start" | "end";
export interface ChecklistItem {
  label: string;
  /** "pending": runs or waits now; "ending": ends soon; "limit": limits what it can do; "unused": not used this turn; "held": readied or concentrating */
  kind: "pending" | "ending" | "limit" | "unused" | "held";
  icon?: string;
  detail?: string;
  phase: ChecklistPhase;
}
export type ChecklistContributor = (actor: Actor.Implementation, phase: ChecklistPhase) => Omit<ChecklistItem, "phase">[] | undefined;

const contributors = new Registry<ChecklistContributor>();

export function registerChecklistContributor(id: string, contributor: ChecklistContributor, options: { priority?: number } = {}): () => void {
  contributors.set(id, contributor, { priority: options.priority });
  return () => { contributors.delete(id); };
}

/** The checklist for a creature at a phase (both when none is given) */
export function checklistFor(actor: Actor.Implementation, phase?: ChecklistPhase): ChecklistItem[] {
  const phases: ChecklistPhase[] = phase ? [phase] : ["start", "end"];
  const items: ChecklistItem[] = [];
  for (const p of phases) for (const { id, value } of contributors.entries()) {
    try { for (const item of value(actor, p) ?? []) items.push({ ...item, phase: p }); }
    catch (err) { console.warn(`midi-qol | checklist ${id} failed`, err); }
  }
  return items;
}

/** Statuses that limit what a creature can do, with what they stop */
const LIMITING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "grappled", "restrained", "prone", "frightened", "charmed", "blinded", "deafened", "poisoned"];

const statusName = (id: string) => {
  const status = CONFIG.statusEffects.find(s => s.id === id);
  return status?.name ? i18n(status.name) : id;
};

function registerMidiContributors() {
  // Saves and effects that run at this boundary (entries: over-time, effect triggers)
  registerChecklistContributor("midi-qol.entries", (actor, phase) => {
    const eventId = phase === "start" ? "turnStart" : "turnEnd";
    return collectEntries(eventId, { actor }).map(found => ({
      kind: "pending" as const, icon: "fa-solid fa-rotate",
      label: found.entry.label ?? (found.document as { name?: string }).name ?? i18n("midi-qol.Checklist.Runs"),
      detail: i18n(phase === "start" ? "midi-qol.Checklist.AtStart" : "midi-qol.Checklist.AtEnd")
    }));
  });
  // Requests waiting on the creature (saves to roll, offers to answer)
  registerChecklistContributor("midi-qol.requests", (actor, phase) => {
    if (phase !== "start" || !actor.uuid) return [];
    const count = requestsFor(actor.uuid).length;
    return count ? [{ kind: "pending" as const, icon: "fa-solid fa-inbox", label: i18n("midi-qol.Checklist.Requests").replace("{count}", String(count)) }] : [];
  });
  // Readied uses and concentration
  registerChecklistContributor("midi-qol.held", (actor, phase) => {
    if (phase !== "start") return [];
    const items: Omit<ChecklistItem, "phase">[] = deferredUses({ actor }).map(use => ({
      kind: "held" as const, icon: "fa-solid fa-hourglass-half",
      label: i18n("midi-qol.Checklist.Readied").replace("{name}", use.activity?.item?.name ?? "")
    }));
    for (const effect of actor.effects) {
      if (!effect.statuses.has(systemConcentrationId) || effect.disabled) continue;
      items.push({ kind: "held", icon: "fa-solid fa-brain", label: effect.name ?? statusName(systemConcentrationId) });
    }
    return items;
  });
  // Conditions that limit what it can do
  registerChecklistContributor("midi-qol.conditions", (actor, phase) => {
    if (phase !== "start") return [];
    return LIMITING.filter(id => actor.statuses.has(id)).map(id => ({ kind: "limit" as const, icon: "fa-solid fa-triangle-exclamation", label: statusName(id) }));
  });
  // Effects ending within a round
  registerChecklistContributor("midi-qol.ending", (actor, phase) => {
    if (phase !== "start") return [];
    return actor.effects.filter(effect => {
      const remaining = (effect.duration as { remaining?: number | null }).remaining;
      return !effect.disabled && !effect.statuses.has(systemConcentrationId) && typeof remaining === "number" && remaining > 0 && remaining <= 6;
    }).map(effect => ({ kind: "ending" as const, icon: "fa-solid fa-hourglass-end", label: effect.name ?? "", detail: i18n("midi-qol.Checklist.EndsSoon") }));
  });
  // Before ending: what hasn't been used
  registerChecklistContributor("midi-qol.unused", (actor, phase) => {
    if (phase !== "end") return [];
    const items: Omit<ChecklistItem, "phase">[] = [];
    for (const kind of ["action", "bonus"] as const) {
      if (!isTracked(actor, kind)) continue;
      if (!budget(actor, kind).exhausted) items.push({ kind: "unused", icon: "fa-regular fa-circle", label: i18n(`midi-qol.Checklist.Unused.${kind}`) });
    }
    const token = tokenFor(actor);
    const movement = token ? movementState(token) : undefined;
    if (movement && movement.remaining > 0)
      items.push({ kind: "unused", icon: "fa-solid fa-person-walking", label: i18n("midi-qol.Checklist.Unused.movement").replace("{n}", `${movement.remaining} ${movement.units}`) });
    return items;
  });
}

export function setupChecklist() {
  registerMidiContributors();
}

export const checklistApi = {
  for: checklistFor,
  register: registerChecklistContributor,
  contributors: () => contributors.entries().map(e => e.id)
};
