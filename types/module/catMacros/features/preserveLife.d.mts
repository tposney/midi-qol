export namespace preserveLife {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof use;
        priority: number;
    }[];
}
declare function use({ workflow }: {
    workflow: any;
}): Promise<void>;
export {};
