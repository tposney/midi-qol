import { i18n } from "../../../midi-qol.js";
import { budget } from "../../services/economy/ledger.js";
import { possibleReactors } from "../../services/economy/opportunity.js";
import { getDistance } from "../../services/distance/service.js";
import type { TurnModel } from "../../services/turnModel/model.js";

/*
 * M27 further features: reminders on the player's turn in the hub, off by default (a user setting in the Turn HUD
 * window): a bonus action left with something usable to spend it on; a once-per-turn use not yet used (uses that
 * recover each turn); concentration at risk (enemies with the creature in reach).
 */

export const REMINDERS_SETTING = "hubReminders";

export function registerRemindersSetting() {
  game.settings?.register("midi-qol", REMINDERS_SETTING as never, {
    name: "midi-qol.Reminders.Name",
    hint: "midi-qol.Reminders.Hint",
    scope: "user",
    config: false,
    type: Boolean,
    default: false
  } as never);
}

export const remindersOn = () => game.settings?.get("midi-qol", REMINDERS_SETTING as never) === true;

type Uses = { value?: number, max?: number | string, recovery?: { period?: string }[] };
const TURN_PERIODS = new Set(["turn", "turnStart", "turnEnd"]);
const recoversEachTurn = (uses: Uses | undefined) => !!uses?.recovery?.some(r => TURN_PERIODS.has(r.period ?? "")) && (uses?.value ?? 0) > 0;

/** This turn's reminders for the creature */
export function reminders(actor: Actor.Implementation, token: TokenDocument.Implementation | undefined, model: TurnModel): string[] {
  const out: string[] = [];
  if (!budget(actor, "bonus").exhausted) {
    const spendable = model.activities.filter(c => c.usable && c.cost.bonus > 0);
    const names = [...new Set(spendable.map(c => c.itemName))];
    const more = names.length > 3 ? ` ${i18n("midi-qol.Reminders.More").replace("{n}", String(names.length - 3))}` : "";
    if (names.length) out.push(i18n("midi-qol.Reminders.Bonus").replace("{names}", names.slice(0, 3).join(", ") + more));
  }
  for (const item of actor.items) {
    const system = item.system as { uses?: Uses, activities?: Iterable<{ uses?: Uses }> };
    const fresh = recoversEachTurn(system.uses) || [...(system.activities ?? [])].some(a => recoversEachTurn(a.uses));
    if (fresh) out.push(i18n("midi-qol.Reminders.OncePerTurn").replace("{name}", item.name ?? ""));
  }
  if (token?.object && actor.statuses.has("concentrating")) {
    const object = token.object;
    const threats = possibleReactors(token).filter(r => r.token.object && getDistance(r.token.object, object, { wallsBlock: false }) <= r.reach);
    if (threats.length) out.push(i18n("midi-qol.Reminders.Concentration").replace("{n}", String(threats.length)));
  }
  return out;
}
