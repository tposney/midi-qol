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

/** A table drawn: its result, and the drawn row's actions (inline rows' `do`, a core result's flags.midi-qol.do) */
export interface TableDraw extends TableResultChoice { do?: unknown[] }

/**
 * Draw a declared table (the RollTable step, M15's table action): a core table as core draws it (its chat card), inline
 * rows as a card note on the use (whispered per the reveal policy), or a chat message without a use.
 */
export async function rollTable(declaration: TableDeclaration, { workflow, rollData = {}, name = "" }: { workflow?: Workflow, rollData?: Record<string, unknown>, name?: string }): Promise<TableDraw | undefined> {
  if (declaration.table) {
    const table = await fromUuid(declaration.table);
    if (!(table instanceof RollTable)) {
      ui.notifications?.warn(`midi-qol | ${name}: no roll table ${declaration.table}`);
      return undefined;
    }
    const draw = await table.draw({ displayChat: true });
    const drawn = draw.results[0];
    const actions = foundry.utils.getProperty(drawn ?? {}, "flags.midi-qol.do");
    return {
      row: drawn ? table.results.contents.findIndex(r => r.id === drawn.id) : -1,
      label: drawn?.name || drawn?.description || "",
      total: draw.roll.total ?? 0,
      ...(Array.isArray(actions) ? { do: actions } : {})
    };
  }
  const rows = declaration.rows ?? [];
  const roll = await new Roll(declaration.formula || "1d20", rollData).evaluate();
  const row = rowFor(rows, roll.total ?? 0);
  const result: TableDraw = { row, label: rows[row]?.label ?? "", total: roll.total ?? 0, ...(rows[row]?.do ? { do: rows[row].do } : {}) };
  const html = `<div><strong>${foundry.utils.escapeHTML(name)}</strong>: ${result.total}${result.label ? ` — ${foundry.utils.escapeHTML(result.label)}` : ""}</div>`;
  // The reveal policy (M19): whispered to the users it may be shown to, unless that is everyone
  const users = game.users?.contents ?? [];
  const shownTo = users.filter(user => reveals({ subject: "tableResult", user, caster: workflow?.actor }));
  const whisper = shownTo.length < users.length ? shownTo.map(user => user.id ?? "") : undefined;
  if (workflow) await addCardNote(workflow, html, { anchor: "utility", key: `midi-qol.table.${declaration.id}`, ...(whisper ? { whisper } : {}) });
  else await ChatMessage.create({ content: html, ...(whisper ? { whisper } : {}) });
  return result;
}

/** The step's work: roll the activity's table, record the result as a choice */
export async function rollUseTable(workflow: Workflow): Promise<TableDraw | undefined> {
  const declaration = tableDeclaration(workflow.activity);
  if (!declaration) return undefined;
  const kept = workflow.choices[declaration.id];
  if (isTableResult(kept)) return kept;
  const result = await rollTable(declaration, { workflow, rollData: workflow.activity?.getRollData() ?? {}, name: workflow.activity?.name ?? "" });
  if (!result) return undefined;
  const { do: _actions, ...choice } = result;
  workflow.setChoice(declaration.id, choice);
  return result;
}
