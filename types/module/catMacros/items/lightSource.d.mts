export namespace lightSource {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof extinguish;
        priority: number;
    }[];
}
declare function extinguish({ workflow }: {
    workflow: any;
}): Promise<void>;
export {};
