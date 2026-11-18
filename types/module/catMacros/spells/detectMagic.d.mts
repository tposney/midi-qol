export const detectMagicConfig: {
    'detect-magic-vision': {
        sightSeconds: {
            default: number;
            type: string;
            label: string;
            category: string;
        };
    };
};
export namespace detectMagic {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof senseMagic;
        priority: number;
    }[];
}
declare function senseMagic({ document: item, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
export {};
