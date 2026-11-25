import { i18n } from "../../../midi-qol.js";
import { escape } from "./sections.js";

/*
 * M27 further features: the hub out of combat. The 2024 exploration actions (Search, Study, Influence, Hide) in the
 * Actions tab, each its skills as buttons (no cost outside combat); in the turn area, light sources with the time left
 * on them (effects that change the token's light). Rests are the character sheet's, not the hub's.
 */

const EXPLORATION: Record<string, string[]> = {
  search: ["prc", "ins", "med", "sur"],
  study: ["arc", "his", "inv", "nat", "rel"],
  influence: ["dec", "itm", "per", "prf", "ani"],
  hide: ["ste"]
};

const skillLabel = (id: string) => {
  const skills = CONFIG.DND5E.skills as Record<string, { label?: string } | undefined>;
  return i18n(skills[id]?.label ?? id);
};

/** The exploration row of the Actions tab (out of combat) */
export function explorationHtml(): string {
  return Object.entries(EXPLORATION).map(([action, skills]) =>
    `<div class="midi-hub-row midi-hub-explore"><span class="midi-hub-label">${escape(i18n(`midi-qol.Explore.${action}`))}</span>${skills.map(skill =>
      `<button type="button" class="midi-hub-action" data-hub-action="exploreSkill" data-skill="${skill}">${escape(skillLabel(skill))}</button>`).join("")}</div>`).join("");
}

/** The light sources on the creature: its effects that change its token's light, with the time left */
function lightsHtml(actor: Actor.Implementation): string {
  const lights = actor.appliedEffects.filter(effect => (effect.changes ?? []).some(change => /(^|\.)light(\.|$)/.test(change.key ?? "")));
  return lights.map(effect => {
    const left = (effect.duration as { label?: string } | undefined)?.label;
    return `<div class="midi-hub-note midi-hub-light"><i class="fa-solid fa-fire-flame-curved"></i> ${escape(effect.name ?? "")}${left ? ` (${escape(left)})` : ""}</div>`;
  }).join("");
}

/** The turn area out of combat: light sources */
export function outOfCombatHtml(actor: Actor.Implementation): string {
  return lightsHtml(actor);
}

export const outOfCombatActions = {
  exploreSkill: async ({ actor }: { actor: Actor.Implementation }, target: HTMLElement) => {
    // @ts-expect-error no dnd5e-types
    await actor.rollSkill({ skill: target.dataset.skill });
  }
};
