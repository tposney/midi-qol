export namespace phantasmalForce {
    let name: string;
    let version: string;
    let rules: string;
    let combat: {
        pass: string;
        macro: typeof casterTurn;
        priority: number;
    }[];
}
declare function casterTurn({ document: effect, token, combatant }: {
    document: any;
    token: any;
    combatant: any;
}): Promise<void>;
export {};
