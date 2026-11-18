export namespace carefulSpell {
    export { version };
    export let rules: string;
    export let roll: {
        pass: string;
        macro: typeof use;
        priority: number;
    }[];
    export let name: string;
}
export namespace distantSpell {
    let name_1: string;
    export { name_1 as name };
}
export namespace extendedSpell {
    let name_2: string;
    export { name_2 as name };
}
export namespace heightenedSpell {
    let name_3: string;
    export { name_3 as name };
}
export namespace quickenedSpell {
    let name_4: string;
    export { name_4 as name };
}
export namespace subtleSpell {
    let name_5: string;
    export { name_5 as name };
}
export namespace transmutedSpell {
    let name_6: string;
    export { name_6 as name };
}
export namespace twinnedSpell {
    let name_7: string;
    export { name_7 as name };
}
export namespace metamagicCareful {
    let name_8: string;
    export { name_8 as name };
    export { version };
    let rules_1: string;
    export { rules_1 as rules };
    let roll_1: {
        pass: string;
        macro: typeof carefulPreamble;
        priority: number;
    }[];
    export { roll_1 as roll };
}
export namespace metamagicHeightened {
    let name_9: string;
    export { name_9 as name };
    export { version };
    let rules_2: string;
    export { rules_2 as rules };
    let roll_2: {
        pass: string;
        macro: typeof heightenedPreamble;
        priority: number;
    }[];
    export { roll_2 as roll };
}
export namespace empoweredSpell {
    let name_10: string;
    export { name_10 as name };
    export { version };
    let rules_3: string;
    export { rules_3 as rules };
    let roll_3: {
        pass: string;
        macro: typeof empowered;
        priority: number;
    }[];
    export { roll_3 as roll };
}
export namespace seekingSpell {
    let name_11: string;
    export { name_11 as name };
    export { version };
    let rules_4: string;
    export { rules_4 as rules };
    let roll_4: {
        pass: string;
        macro: typeof seeking;
        priority: number;
    }[];
    export { roll_4 as roll };
}
declare const version: "1.0.0";
declare function use({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<any>;
declare function carefulPreamble({ document: effect, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
declare function heightenedPreamble({ document: effect, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
declare function empowered({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
declare function seeking({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
