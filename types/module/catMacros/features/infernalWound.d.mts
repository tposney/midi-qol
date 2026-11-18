export const infernalWoundConfig: {
    'infernal-glaive': {
        woundFormula: {
            default: any;
            type: string;
            label: string;
            category: string;
        };
        duration: {
            default: number;
            type: string;
            label: string;
            category: string;
        };
        stanchDC: {
            default: any;
            type: string;
            label: string;
            category: string;
        };
        saveAbility: {
            default: string;
            type: string;
            label: string;
            category: string;
            options: () => {
                value: string;
                label: string;
            }[];
        };
        saveDC: {
            default: string;
            type: string;
            label: string;
            category: string;
        };
    };
    'infernal-tail': {
        woundFormula: {
            default: any;
            type: string;
            label: string;
            category: string;
        };
        duration: {
            default: number;
            type: string;
            label: string;
            category: string;
        };
        stanchDC: {
            default: any;
            type: string;
            label: string;
            category: string;
        };
    };
};
export namespace infernalWound {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof glaiveHit;
        priority: number;
    }[];
    let effect: {
        pass: string;
        macro: typeof woundCreating;
        priority: number;
    }[];
    let combat: {
        pass: string;
        macro: typeof turnStart;
        priority: number;
    }[];
}
declare function glaiveHit({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
declare function woundCreating({ effect, actor }: {
    effect: any;
    actor: any;
}): Promise<true | undefined>;
declare function turnStart({ document: effect, actor, token }: {
    document: any;
    actor: any;
    token: any;
}): Promise<void>;
export {};
