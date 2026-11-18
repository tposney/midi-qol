export namespace targetRestriction {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof check;
        priority: number;
    }[];
}
declare function check({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
