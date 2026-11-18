export namespace checkCover {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof check;
        priority: number;
    }[];
}
declare function check({ workflow }: {
    workflow: any;
}): Promise<void>;
export {};
