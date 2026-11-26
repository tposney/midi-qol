import { i18n } from "../../../midi-qol.js";
import { registerAction, type ActionRun } from "./engine.js";

/*
 * Spell slots and dice an entry rolls (the survey's "restoring spell slots, refunds, costs that depend on the result"):
 * - `{ roll: "1d4", as: "name" }`: the formula rolled (shown in chat); later actions of the entry read the total as
 *   `rolls.name` in their `if` (Boon of Spell Recall's d4 matching the slot's level).
 * - `{ restoreSlots: { level } }`: one spent slot of that level back (a formula: `@tags.use.spellSlot`).
 * - `{ restoreSlots: { total, maxLevel? } }`: spent slots back whose levels add up to at most `total` (a formula), none
 *   above `maxLevel` (Arcane Recovery, Natural Recovery: 5); the bearer's user picks which, the highest suggested.
 * The bearer is the entry's actor. Pact slots are not restored.
 */

type SlotData = { value?: number, max?: number };
const slotsOf = (actor: Actor.Implementation) => (actor.system as { spells?: Record<string, SlotData | undefined> }).spells ?? {};

/** A formula's total over the entry's data (dice rolled); undefined when it can't be read */
async function total(formula: unknown, data: Record<string, unknown>): Promise<number | undefined> {
  if (typeof formula === "number") return formula;
  if (typeof formula !== "string" || !formula.trim()) return undefined;
  try { return (await new Roll(formula, data).evaluate()).total ?? undefined; } catch { return undefined; }
}

/** Spent slots of each level (1 to `maxLevel`) */
function spentSlots(actor: Actor.Implementation, maxLevel: number): { level: number, spent: number }[] {
  const spells = slotsOf(actor);
  const out: { level: number, spent: number }[] = [];
  for (let level = 1; level <= Math.min(9, maxLevel); level++) {
    const slot = spells[`spell${level}`];
    const spent = Math.max(0, Number(slot?.max ?? 0) - Number(slot?.value ?? 0));
    if (spent) out.push({ level, spent });
  }
  return out;
}

/** The highest levels first, as many as fit the total */
export function suggestSlots(spent: { level: number, spent: number }[], budget: number): Record<number, number> {
  const chosen: Record<number, number> = {};
  let left = budget;
  for (const { level, spent: count } of [...spent].sort((a, b) => b.level - a.level)) {
    const take = Math.min(count, Math.floor(left / level));
    if (take > 0) { chosen[level] = take; left -= take * level; }
  }
  return chosen;
}

/** The bearer's user picks the slots to regain (each level up to what's spent, the levels' sum up to the total) */
async function pickSlots(actor: Actor.Implementation, spent: { level: number, spent: number }[], budget: number, label: string): Promise<Record<number, number> | undefined> {
  const suggested = suggestSlots(spent, budget);
  const rows = spent.map(({ level, spent: count }) => `<div class="form-group"><label>${i18n("midi-qol.Entries.Slots.Level").replace("{level}", String(level))} (${count})</label>
    <input type="number" name="slot${level}" min="0" max="${count}" step="1" value="${suggested[level] ?? 0}"></div>`).join("");
  for (;;) {
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: `${actor.name}: ${label}` },
      content: `<p>${i18n("midi-qol.Entries.Slots.Prompt").replace("{total}", String(budget))}</p>${rows}`,
      rejectClose: false
    }) as Record<string, number> | null;
    if (!data) return undefined;
    const chosen: Record<number, number> = {};
    for (const { level, spent: count } of spent) chosen[level] = Math.max(0, Math.min(count, Math.floor(Number(data[`slot${level}`]) || 0)));
    const used = Object.entries(chosen).reduce((sum, [level, n]) => sum + Number(level) * n, 0);
    if (used <= budget) return chosen;
    ui.notifications?.warn(i18n("midi-qol.Entries.Slots.TooMany").replace("{total}", String(budget)));
  }
}

async function restore(actor: Actor.Implementation, chosen: Record<number, number>): Promise<void> {
  const spells = slotsOf(actor);
  const update: Record<string, number> = {};
  for (const [level, n] of Object.entries(chosen)) {
    const slot = spells[`spell${level}`];
    if (!slot || !n) continue;
    update[`system.spells.spell${level}.value`] = Math.min(Number(slot.max ?? 0), Number(slot.value ?? 0) + n);
  }
  if (Object.keys(update).length) await actor.update(update);
}

async function restoreSlotsAction(run: ActionRun): Promise<void> {
  const actor = (run.found.actor ?? run.context.actor) as Actor.Implementation | undefined;
  const spec = run.action.restoreSlots as { level?: unknown, total?: unknown, maxLevel?: unknown } | undefined;
  if (!actor || !spec || typeof spec !== "object") return;
  if (spec.level !== undefined) {
    const level = await total(spec.level, run.conditionData);
    if (level && level >= 1 && level <= 9) await restore(actor, { [Math.floor(level)]: 1 });
    return;
  }
  const budget = Math.floor(await total(spec.total, run.conditionData) ?? 0);
  if (budget <= 0) return;
  const spent = spentSlots(actor, typeof spec.maxLevel === "number" ? spec.maxLevel : 9).filter(s => s.level <= budget);
  if (!spent.length) return;
  const label = typeof run.action.label === "string" ? run.action.label : (run.found.document as { name?: string }).name ?? run.found.entry.id;
  const chosen = await pickSlots(actor, spent, budget, label);
  if (chosen) await restore(actor, chosen);
}

/** `{ roll, as }`: rolled and shown; `rolls.<as>` for the entry's later actions */
async function rollAction(run: ActionRun): Promise<void> {
  if (typeof run.action.roll !== "string" || !run.action.roll.trim()) return;
  const name = typeof run.action.as === "string" && run.action.as ? run.action.as : "roll";
  const roll = await new Roll(run.action.roll, run.conditionData).evaluate();
  const label = typeof run.action.label === "string" ? run.action.label : (run.found.document as { name?: string }).name ?? run.found.entry.id;
  const actor = (run.found.actor ?? run.context.actor) as Actor.Implementation | undefined;
  await roll.toMessage({ flavor: label, speaker: ChatMessage.getSpeaker({ actor: actor as never }) });
  const rolls = (run.conditionData.rolls ??= {}) as Record<string, number>;
  rolls[name] = roll.total ?? 0;
}

export function registerSlotActions() {
  registerAction("restoreSlots", restoreSlotsAction);
  registerAction("roll", rollAction);
}
