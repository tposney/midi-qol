export function addNotes({ document: item }: {
    document: any;
}): Promise<void>;
export namespace automationNotes {
    let name: string;
    let version: string;
    let rules: string;
    let item: {
        pass: string;
        macro: typeof addNotes;
        priority: number;
    }[];
}
