import type { Workflow } from "../Workflow.js";
import type { Activity } from "../../globals.js";
import { type TableRow } from "./tableRows.js";
export type { TableRow };
export interface TableDeclaration {
    id: string;
    table?: string;
    formula?: string;
    rows?: TableRow[];
}
export interface TableResultChoice {
    row: number;
    label: string;
    total: number;
}
export declare function isTableResult(value: unknown): value is TableResultChoice;
export declare function tableDeclaration(activity: Activity | undefined | null): TableDeclaration | undefined;
/** A table drawn: its result, and the drawn row's actions (inline rows' `do`, a core result's flags.midi-qol.do) */
export interface TableDraw extends TableResultChoice {
    do?: unknown[];
}
/**
 * Draw a declared table (the RollTable step, M15's table action): a core table as core draws it (its chat card), inline
 * rows as a card note on the use (whispered per the reveal policy), or a chat message without a use.
 */
export declare function rollTable(declaration: TableDeclaration, { workflow, rollData, name }: {
    workflow?: Workflow;
    rollData?: Record<string, unknown>;
    name?: string;
}): Promise<TableDraw | undefined>;
/** The step's work: roll the activity's table, record the result as a choice */
export declare function rollUseTable(workflow: Workflow): Promise<TableDraw | undefined>;
