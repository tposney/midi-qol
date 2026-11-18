export namespace knockOut {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof spare;
        priority: number;
    }[];
}
declare function spare({ workflow, ditem }: {
    workflow: any;
    ditem: any;
}): Promise<void>;
export {};
