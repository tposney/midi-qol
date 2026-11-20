import type { Workflow } from "../Workflow.js";
import { reveals } from "../services/revealPolicy/service.js";
import type { Activity } from "../../globals.js";
import { addCardNote } from "./cardNotes.js";
import { rowFor, type TableRow } from "./tableRows.js";

/*
 * An activity's random table (M28; shapes ~/Documents/midi-next-waveB-shapes-2026-11-20.md): `midiTable`, drawn in the
 * midi-qol.RollTable step after the utility roll.
 * - `table`: a core RollTable by uuid (a world, compendium or module table: nothing of it is kept in midi), drawn as
 *   core draws it (its chat card; a result that is another table drawn in turn). A result's entries
 *   (`TableResult` flags.midi-qol.do) are run from M15.
 * - `rows` (with `formula`): inline on the activity, so an item carries its table; the result is shown as a card note.
 * The result is recorded as a choice (`choices[<id>] = { row, label, total }`), read as any choice.
 */

export type { TableRow };
export interface TableDeclaration { id: string, table?: string, formula?: string, rows?: TableRow[] }
export interface TableResultChoice { row: number, label: string, total: number }

export function isTableResult(value: unknown): value is TableResultChoice {
  return !!value && typeof value === "object" && "row" in value && typeof value.row === "number";
}

function isTableDeclaration(value: unknown): value is TableDeclaration {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || !value.id) return false;
  return ("table" in value && typeof value.table === "string" && !!value.table) || ("rows" in value && Array.isArray(value.rows));
}

export function tableDeclaration(activity: Activity | undefined | null): TableDeclaration | undefined {
  const declared: unknown = activity?.midiTable;
  return isTableDeclaration(declared) ? declared : undefined;
}

/** The step's work: roll the activity's table, record the result as a choice */
export async function rollUseTable(workflow: Workflow): Promise<TableResultChoice | undefined> {
  const declaration = tableDeclaration(workflow.activity);
  if (!declaration) return undefined;
  const kept = workflow.choices[declaration.id];
  if (isTableResult(kept)) return kept;
  let result: TableResultChoice;
  if (declaration.table) {
    const table = await fromUuid(declaration.table);
    if (!(table instanceof RollTable)) {
      ui.notifications?.warn(`midi-qol | ${workflow.activity?.name}: no roll table ${declaration.table}`);
      return undefined;
    }
    const draw = await table.draw({ displayChat: true });
    const drawn = draw.results[0];
    result = {
      row: drawn ? table.results.contents.findIndex(r => r.id === drawn.id) : -1,
      label: drawn?.name || drawn?.description || "",
      total: draw.roll.total ?? 0
    };
  } else {
    const rows = declaration.rows ?? [];
    const roll = await new Roll(declaration.formula || "1d20", workflow.activity?.getRollData() ?? {}).evaluate();
    const row = rowFor(rows, roll.total ?? 0);
    result = { row, label: rows[row]?.label ?? "", total: roll.total ?? 0 };
    const name = foundry.utils.escapeHTML(workflow.activity?.name ?? "");
    // The reveal policy (M19): whispered to the users it may be shown to, unless that is everyone
    const users = game.users?.contents ?? [];
    const shownTo = users.filter(user => reveals({ subject: "tableResult", user, caster: workflow.actor }));
    await addCardNote(workflow, `<div><strong>${name}</strong>: ${result.total}${result.label ? ` — ${foundry.utils.escapeHTML(result.label)}` : ""}</div>`,
      { anchor: "utility", key: `midi-qol.table.${declaration.id}`, ...(shownTo.length < users.length ? { whisper: shownTo.map(user => user.id ?? "") } : {}) });
  }
  workflow.setChoice(declaration.id, { ...result });
  return result;
}
