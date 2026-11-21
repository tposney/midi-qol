import { MODULE_ID } from "../../midi-qol.js";

/*
 * M15 stage 5e (user, 2026-11-21): a choice remembered per actor per question, so the player decides once (Elemental
 * Attunement's damage type, a bonus's damage type) or keeps being asked: "Remember this choice" in the prompt; changed or
 * forgotten (Ask each time) in the sheet's Toggles and choices. Stored on the actor as `flags.midi-qol.rememberedChoices`,
 * a list (keys hold dots and uuids), with labels for the window.
 */

export interface RememberedChoice {
  key: string;
  value: unknown;
  /** The question, as the window lists it */
  label: string;
  /** The answer, as the window lists it */
  valueLabel?: string;
}

export function rememberedChoices(actor: Actor.Implementation | null | undefined): RememberedChoice[] {
  const stored = actor?.getFlag(MODULE_ID, "rememberedChoices");
  return Array.isArray(stored) ? stored.filter((c): c is RememberedChoice => !!c && typeof c.key === "string") : [];
}

export function rememberedChoice(actor: Actor.Implementation | null | undefined, key: string): RememberedChoice | undefined {
  return rememberedChoices(actor).find(c => c.key === key);
}

async function store(actor: Actor.Implementation, list: RememberedChoice[]) {
  const updates: Record<string, unknown> = { [`flags.${MODULE_ID}.rememberedChoices`]: list };
  await actor.update(updates);
}

export async function rememberChoice(actor: Actor.Implementation, choice: RememberedChoice): Promise<void> {
  await store(actor, [...rememberedChoices(actor).filter(c => c.key !== choice.key), choice]);
}

export async function forgetChoice(actor: Actor.Implementation, key: string): Promise<void> {
  const list = rememberedChoices(actor);
  if (list.some(c => c.key === key)) await store(actor, list.filter(c => c.key !== key));
}

/** The key of an activity's declared choice: its item, the activity and the choice's id */
export function activityChoiceKey(activity: { id?: string | null, item?: { id?: string | null } } | undefined, choiceId: string): string {
  return `${activity?.item?.id ?? ""}.${activity?.id ?? ""}#${choiceId}`;
}

/** The key of a bonus's damage type choice */
export function bonusDamageTypeKey(bonusKey: string): string {
  return `bonus:${bonusKey}#damageType`;
}

/** The "Remember this choice" checkbox a prompt shows for a question */
export function rememberCheckbox(name: string): string {
  const label = game.i18n?.localize(`${MODULE_ID}.RememberChoice.Label`) ?? "Remember this choice";
  return `<label class="checkbox midi-qol-remember-choice"><input type="checkbox" name="${name}"> ${foundry.utils.escapeHTML(label)}</label>`;
}
