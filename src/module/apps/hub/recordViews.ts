import { i18n } from "../../../midi-qol.js";
import { escape } from "./sections.js";
import { recordEvents, recordKnowledge, type RecordEvent } from "../../services/combatRecord/service.js";

/*
 * M27 with M23's combatRecord service: "since your last turn" in the hub's turn section and what is known about the
 * user's targets in Around me. Nothing shows without a provider's answer.
 */

const MAX_LINES = 6;

/** A damage type's label (the record keeps dnd5e's id) */
const damageTypeLabel = (t: string) => i18n((CONFIG.DND5E.damageTypes as Record<string, { label?: string } | undefined>)[t]?.label ?? t);

function line(event: RecordEvent): string {
  const say = (key: string) => i18n(`midi-qol.Record.${key}`);
  const from = event.source?.name ? ` ${say("From").replace("{name}", event.source.name)}` : "";
  const what = event.item ? ` (${event.item})` : "";
  switch (event.kind) {
    case "damaged": return `${say("Damaged").replace("{n}", String(event.amount ?? 0)).replace("{type}", event.damageType ? damageTypeLabel(event.damageType) : "")}${from}${what}`;
    case "healed": return `${say("Healed").replace("{n}", String(event.amount ?? 0))}${from}${what}`;
    case "attacked": return `${say("Attacked").replace("{result}", say(`Result.${event.outcome ?? "miss"}`))}${from}${what}`;
    case "saved": return `${say("Saved").replace("{result}", say(`Result.${event.outcome ?? "failure"}`))}${what}${from}`;
    case "effectGained": return say("Gained").replace("{name}", event.effect ?? "") + from;
    case "effectEnded": return say("Ended").replace("{name}", event.effect ?? "");
  }
}

/** "Since your last turn", on the creature's turn */
export function sinceLastTurnHtml(token: TokenDocument.Implementation | undefined): string {
  if (!token?.uuid) return "";
  const events = recordEvents({ subject: token.uuid, since: "lastTurn" });
  if (!events.length) return "";
  const shown = events.slice(-MAX_LINES).map(e => `<li>${escape(line(e))}</li>`).join("");
  const more = events.length > MAX_LINES ? `<li class="hint">${escape(i18n("midi-qol.Reminders.More").replace("{n}", String(events.length - MAX_LINES)))}</li>` : "";
  return `<details class="midi-hub-since" open><summary>${escape(i18n("midi-qol.Record.Since"))}</summary><ul>${shown}${more}</ul></details>`;
}

/** What is known about each of the user's targets (Around me) */
export function knowledgeHtml(): string {
  const rows: string[] = [];
  for (const target of game.user?.targets ?? []) {
    const known = target.document.uuid ? recordKnowledge({ subject: target.document.uuid }) : undefined;
    if (!known) continue;
    const say = (key: string) => i18n(`midi-qol.Record.${key}`);
    const type = damageTypeLabel;
    const ability = (a: string) => i18n((CONFIG.DND5E.abilities as Record<string, { abbreviation?: string, label?: string } | undefined>)[a]?.abbreviation ?? a);
    const parts: string[] = [];
    if (known.ac) {
      const { atLeast, atMost } = known.ac;
      parts.push(`${say("AC")} ${atLeast !== undefined && atMost !== undefined ? (atLeast === atMost ? atLeast : `${atLeast}–${atMost}`) : atLeast !== undefined ? `≥ ${atLeast}` : `≤ ${atMost}`}`);
    }
    if (known.saves?.length) parts.push(`${say("Saves")}: ${known.saves.map(s => `${ability(s.ability)} ${s.succeeded}/${s.seen}`).join(", ")}`);
    if (known.resists?.length) parts.push(`${say("Resists")} ${known.resists.map(type).join(", ")}`);
    if (known.immune?.length) parts.push(`${say("Immune")} ${known.immune.map(type).join(", ")}`);
    if (known.vulnerable?.length) parts.push(`${say("Vulnerable")} ${known.vulnerable.map(type).join(", ")}`);
    if (known.uses?.length) parts.push(`${say("Uses")}: ${known.uses.join(", ")}`);
    if (known.notes?.length) parts.push(...known.notes);
    if (!parts.length) continue;
    rows.push(`<div class="midi-hub-row midi-hub-around midi-hub-known"><span class="midi-hub-label">${escape(say("Known").replace("{name}", known.name))}</span>${parts.map(p => `<span class="midi-hub-chip">${escape(p)}</span>`).join("")}</div>`);
  }
  return rows.join("");
}
