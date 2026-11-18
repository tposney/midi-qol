export function registerSwallowHooks(): void;
export namespace swallow {
    let name: string;
    let version: string;
    let rules: string;
    let roll: ({
        pass: string;
        macro: typeof preTargeting;
        priority: number;
    } | {
        pass: string;
        macro: typeof preItemRoll;
        priority: number;
    } | {
        pass: string;
        macro: typeof damaged;
        priority: number;
    })[];
    let combat: ({
        pass: string;
        macro: typeof turnEnd;
        priority: number;
    } | {
        pass: string;
        macro: typeof everyTurn;
        priority: number;
    })[];
}
declare function preTargeting({ document: item, activity }: {
    document: any;
    activity: any;
}): Promise<true | undefined>;
declare function preItemRoll({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<true | undefined>;
declare function damaged({ document: item, ditem, workflow }: {
    document: any;
    ditem: any;
    workflow: any;
}): Promise<void>;
declare function turnEnd({ document: item, round, turn, combatant }: {
    document: any;
    round: any;
    turn: any;
    combatant: any;
}): Promise<void>;
declare function everyTurn({ document: item, combatant, previousRound, previousTurn }: {
    document: any;
    combatant: any;
    previousRound: any;
    previousTurn: any;
}): Promise<void>;
export {};
