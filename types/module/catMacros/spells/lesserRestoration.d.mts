export namespace lesserRestoration {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof use;
        priority: number;
    }[];
}
declare function use({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
