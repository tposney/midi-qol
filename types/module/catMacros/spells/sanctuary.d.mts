export namespace sanctuary {
    let name: string;
    let version: string;
    let rules: string;
    let roll: ({
        pass: string;
        macro: typeof targeted;
        priority: number;
    } | {
        pass: string;
        macro: typeof acted;
        priority: number;
    })[];
}
declare function targeted({ document: effect, workflow }: {
    document: any;
    workflow: any;
}): Promise<true | undefined>;
declare function acted({ document: effect, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
