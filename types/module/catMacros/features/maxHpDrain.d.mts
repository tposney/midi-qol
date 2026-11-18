export namespace maxHpDrain {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof finished;
        priority: number;
    }[];
}
declare function finished({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
