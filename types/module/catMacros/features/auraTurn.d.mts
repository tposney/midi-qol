export namespace auraTurn {
    let name: string;
    let version: string;
    let rules: string;
    let combat: {
        pass: string;
        macro: typeof everyTurn;
        priority: number;
    }[];
}
declare function everyTurn({ document: item, token, combatant, previousTurn }: {
    document: any;
    token: any;
    combatant: any;
    previousTurn: any;
}): Promise<void>;
export {};
