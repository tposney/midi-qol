export namespace magic {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof use;
        priority: number;
    }[];
}
declare function use(data: any): Promise<Notifications.Notification<"info"> | undefined>;
export {};
