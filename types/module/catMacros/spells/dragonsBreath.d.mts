export namespace dragonsBreath {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof cast;
        priority: number;
    }[];
}
declare function cast({ workflow }: {
    workflow: any;
}): Promise<void>;
export {};
