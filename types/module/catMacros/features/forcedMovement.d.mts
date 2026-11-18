export namespace forcedMovement {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof moved;
        priority: number;
    }[];
}
declare function moved({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
