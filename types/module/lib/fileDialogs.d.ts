/**
 * Ask for a JSON file and read it. Resolves to the file's text and name, or null when the dialog is cancelled or
 * closed, or no file was chosen (with a warning).
 */
export declare function chooseJsonFile(title: string, hint?: string): Promise<{
    text: string;
    name: string;
} | null>;
