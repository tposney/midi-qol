export namespace genericActions {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof choose;
        priority: number;
    }[];
}
declare function choose({ workflow }: {
    workflow: any;
}): Promise<void>;
export {};
