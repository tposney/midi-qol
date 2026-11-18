export namespace stabilize {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof tryStabilize;
        priority: number;
    }[];
}
declare function tryStabilize({ workflow }: {
    workflow: any;
}): Promise<any>;
export {};
