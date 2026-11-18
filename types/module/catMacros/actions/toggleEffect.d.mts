export namespace toggleEffect {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof toggle;
        priority: number;
    }[];
}
declare function toggle({ workflow }: {
    workflow: any;
}): Promise<true | undefined>;
export {};
