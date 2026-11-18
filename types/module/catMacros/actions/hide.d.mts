export namespace hideAction {
    let name: string;
    let version: string;
    let rules: string;
    let generic: boolean;
    let documents: string[];
    let roll: {
        pass: string;
        macro: typeof hide;
        priority: number;
    }[];
    namespace genericConfig {
        namespace effect {
            let _default: string;
            export { _default as default };
            export let type: string;
            export let category: string;
            export let label: string;
        }
    }
}
export namespace searchAction {
    let name_1: string;
    export { name_1 as name };
    let version_1: string;
    export { version_1 as version };
    let rules_1: string;
    export { rules_1 as rules };
    let generic_1: boolean;
    export { generic_1 as generic };
    let documents_1: string[];
    export { documents_1 as documents };
    let roll_1: {
        pass: string;
        macro: typeof search;
        priority: number;
    }[];
    export { roll_1 as roll };
    export namespace genericConfig_1 {
        namespace confirm {
            let _default_1: boolean;
            export { _default_1 as default };
            let type_1: string;
            export { type_1 as type };
            let category_1: string;
            export { category_1 as category };
            let label_1: string;
            export { label_1 as label };
            export let hint: string;
        }
    }
    export { genericConfig_1 as genericConfig };
}
declare function hide({ document: activity, workflow }: {
    document: any;
    workflow: any;
}): Promise<void>;
declare function search({ workflow }: {
    workflow: any;
}): Promise<ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note"> | undefined>;
export {};
