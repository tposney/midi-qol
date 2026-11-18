export namespace fearAura {
    let name: string;
    let version: string;
    let rules: string;
    let combat: {
        pass: string;
        macro: typeof turnStart;
        priority: number;
        dispositions: string[];
    }[];
}
declare function turnStart({ document: item, token: starter }: {
    document: any;
    token: any;
}): Promise<void>;
export {};
