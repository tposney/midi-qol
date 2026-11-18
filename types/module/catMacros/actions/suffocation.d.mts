export namespace suffocationHoldingBreath {
    let name: string;
    let version: string;
    let rules: string;
    let effect: {
        pass: string;
        macro: typeof outOfBreath;
        priority: number;
    }[];
}
export namespace suffocationOutOfAir {
    let name_1: string;
    export { name_1 as name };
    let version_1: string;
    export { version_1 as version };
    let rules_1: string;
    export { rules_1 as rules };
    let effect_1: {
        pass: string;
        macro: typeof startOutOfAir;
        priority: number;
    }[];
    export { effect_1 as effect };
    export let combat: {
        pass: string;
        macro: typeof suffocate;
        priority: number;
    }[];
}
declare function outOfBreath({ document: effect }: {
    document: any;
}): Promise<void>;
declare function startOutOfAir({ document: effect }: {
    document: any;
}): Promise<void>;
declare function suffocate({ document: effect }: {
    document: any;
}): Promise<void>;
export {};
