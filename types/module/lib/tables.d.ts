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
/** The step's work: roll the activity's table, record the result as a choice */
export declare function rollUseTable(workflow: Workflow): Promise<TableResultChoice | undefined>;
