export namespace grappleOnHit {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof biteCheck;
        priority: number;
    }[];
}
export namespace targetGrappledMacro {
    let name_1: string;
    export { name_1 as name };
    let version_1: string;
    export { version_1 as version };
    let rules_1: string;
    export { rules_1 as rules };
    let roll_1: {
        pass: string;
        macro: typeof targetGrappled;
        priority: number;
    }[];
    export { roll_1 as roll };
}
declare function biteCheck({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
declare function targetGrappled({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
