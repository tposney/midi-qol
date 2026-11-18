export namespace influence {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof request;
        priority: number;
    }[];
}
declare function request({ workflow }: {
    workflow: any;
}): Promise<ChatMessage<"base" | import("fvtt-types/src/foundry/common/abstract/document.mjs").default.ModuleSubType | "midi-qol.damage" | "midi-qol.note"> | Notifications.Notification<"info"> | undefined>;
export {};
