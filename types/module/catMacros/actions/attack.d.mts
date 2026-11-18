export namespace attack {
    let name: string;
    let version: string;
    let rules: string;
    let roll: {
        pass: string;
        macro: typeof useWeapon;
        priority: number;
    }[];
}
declare function useWeapon({ workflow }: {
    workflow: any;
}): Promise<Notifications.Notification<"info"> | undefined>;
export {};
