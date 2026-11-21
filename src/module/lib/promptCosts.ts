import type { Activity } from "../../globals.js";
import type { BonusCost } from "../services/rollBonuses/rules.js";

/*
 * M32a: the cost badges of a prompt row (a bonus, a reaction activity, an offer), and whether a row spends the
 * reaction (such rows are one choice: a creature has one reaction).
 */

export interface PromptCost { badges: string[], reaction: boolean }

/** A row a prompt shows for another part (M32a step 3: a failed save's reactions in its bonus prompt) */
export interface PromptRow {
  id: string, label: string, img?: string, tooltip?: string, badges: string[], exclusive?: string, checked?: boolean,
  standingKey?: string, standingLabel?: string, choice?: string, choices?: { value: string, label: string }[]
}

/** Rows shown in a bonus prompt for another part: what was ticked comes back in `chosen` (undefined: not answered) */
export interface PromptResponses { rows: PromptRow[], chosen?: string[], shown?: boolean }

const localize = (key: string, data?: Record<string, string | number>) =>
  (data ? game.i18n?.format(key, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))) : game.i18n?.localize(key)) ?? key;

function activationLabel(type: string): string {
  const types = (CONFIG as unknown as { DND5E?: { activityActivationTypes?: Record<string, { label?: string }> } }).DND5E?.activityActivationTypes;
  return localize(types?.[type]?.label ?? type);
}

/** A bonus's declared cost (rollBonuses) as badges */
export function bonusCostBadges(cost: BonusCost | undefined): PromptCost {
  const badges: string[] = [];
  let reaction = false;
  for (const [key, entry] of Object.entries(cost?.actions ?? {})) {
    if (!entry?.cost) continue;
    if (key === "reaction") reaction = true;
    badges.push(activationLabel(key === "bonus" ? "bonus" : key));
  }
  for (const [uuid, entry] of [...Object.entries(cost?.itemUses ?? {}), ...Object.entries(cost?.activityUses ?? {})]) {
    if (!entry?.cost) continue;
    const doc = fromUuidSync(uuid, { strict: false }) as { name?: string } | null;
    badges.push(localize("midi-qol.Prompt.Cost.Spend", { cost: entry.cost, name: doc?.name ?? "" }).trim());
  }
  for (const [slot, entry] of Object.entries(cost?.spellSlots ?? {})) {
    if (!entry?.cost) continue;
    const level = Number(slot.replace(/^spell/, ""));
    badges.push(Number.isFinite(level) && level > 0 ? localize("midi-qol.Prompt.Cost.Slot", { level }) : slot);
  }
  for (const [path, entry] of Object.entries(cost?.attribute ?? {})) {
    if (!entry?.cost) continue;
    badges.push(localize("midi-qol.Prompt.Cost.Spend", { cost: entry.cost, name: path.split(".").at(-1) ?? path }));
  }
  for (const [die, entry] of Object.entries(cost?.hitDice ?? {})) {
    if (entry?.cost) badges.push(localize("midi-qol.Prompt.Cost.Spend", { cost: entry.cost, name: die }));
  }
  return { badges, reaction };
}

type Uses = { max?: number | string | null, value?: number | null };

/** A reaction activity's cost: its activation, its uses or its item's, a spell's slot level */
export function activityCostBadges(activity: Activity): PromptCost {
  const badges: string[] = [];
  const { activation, uses: ownUses } = activity as { activation?: { type?: string }, uses?: Uses };
  const type = activation?.type;
  if (type && type !== "none" && type !== "special") badges.push(activationLabel(type));
  const item = activity.item;
  const system = item?.system as { uses?: Uses, level?: number } | undefined;
  const usesOf = (uses?: Uses) => uses?.max ? localize("midi-qol.Prompt.Cost.Uses", { value: uses.value ?? 0, max: uses.max }) : undefined;
  const uses = usesOf(ownUses) ?? usesOf(system?.uses);
  if (uses) badges.push(uses);
  const level = String(item?.type) === "spell" ? system?.level ?? 0 : 0;
  if (level > 0) badges.push(localize("midi-qol.Prompt.Cost.Slot", { level }));
  return { badges, reaction: type === "reaction" };
}

/** An offer's declared cost (responses contract 2) */
export function offerCostBadges(cost: { actions?: Partial<Record<string, number>> } | undefined): PromptCost {
  const badges: string[] = [];
  let reaction = false;
  for (const [key, count] of Object.entries(cost?.actions ?? {})) {
    if (!count) continue;
    if (key === "reaction") reaction = true;
    badges.push(activationLabel(key));
  }
  return { badges, reaction };
}

/** Rows sharing a `data-exclusive` group (those spending the reaction) are one choice: ticking one clears the others */
export function wirePickOne(element: HTMLElement) {
  const inputs = Array.from(element.querySelectorAll<HTMLInputElement>("input[name='bonus'][data-exclusive]"));
  const refresh = () => {
    for (const input of inputs) {
      const taken = inputs.some(other => other !== input && other.checked && other.dataset.exclusive === input.dataset.exclusive);
      input.closest("li")?.classList.toggle("midi-qol-prompt-excluded", taken);
    }
  };
  for (const input of inputs) input.addEventListener("change", () => {
    if (input.checked) for (const other of inputs) if (other !== input && other.dataset.exclusive === input.dataset.exclusive) other.checked = false;
    refresh();
  });
}

