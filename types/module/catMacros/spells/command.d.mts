export namespace command {
    let name: string;
    let version: string;
    let rules: string;
    let combat: {
        pass: string;
        macro: typeof turnStart;
        priority: number;
    }[];
}
declare function turnStart({ document: effect }: {
    document: any;
}): Promise<void>;
export {};
