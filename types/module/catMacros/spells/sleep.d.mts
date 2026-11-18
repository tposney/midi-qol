export namespace sleep {
    let name: string;
    let version: string;
    let rules: string;
    let combat: {
        pass: string;
        macro: typeof turnEnd;
        priority: number;
    }[];
}
declare function turnEnd({ document: effect, token }: {
    document: any;
    token: any;
}): Promise<void>;
export {};
