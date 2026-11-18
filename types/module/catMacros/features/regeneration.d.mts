export namespace regeneration {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof damaged;
        priority: number;
    }[];
    let combat: {
        pass: string;
        macro: typeof turnStart;
        priority: number;
    }[];
}
declare function damaged({ document: item, ditem }: {
    document: any;
    ditem: any;
}): Promise<void>;
declare function turnStart({ document: item, token }: {
    document: any;
    token: any;
}): Promise<any>;
export {};
