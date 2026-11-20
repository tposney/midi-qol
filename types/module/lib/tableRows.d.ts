/** An inline table row (M28, lib/tables.ts): the totals it covers, its label, its entries (run from M15). Pure. */
export interface TableRow {
    range: [number, number];
    label: string;
    do?: unknown[];
}
/** The inline row a total falls in; -1 for none */
export declare function rowFor(rows: readonly TableRow[], total: number): number;
