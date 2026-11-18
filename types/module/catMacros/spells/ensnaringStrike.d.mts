export namespace ensnaringStrike {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof preamble;
        priority: number;
    }[];
}
declare function preamble({ workflow }: {
    workflow: any;
}): Promise<void>;
export {};
