import { RollModifyDialog } from "../../utils.js";
export declare class BonusPromptApp extends RollModifyDialog {
    #private;
    static PARTS: {
        dialog: {
            id: string;
            classes: string[];
            template: string;
        };
    };
    _prepareContext(options: any): Promise<{
        entries: ({
            standingKey: string;
            standingLabel: string;
            choice: import("./standing.js").StandingChoice;
            id: string;
            label: string | undefined;
            controls: PromptControl[] | undefined;
            disabled: string | undefined;
            icon: string | undefined;
            img: string | undefined;
            tooltip: string | undefined;
            badges: string[];
            exclusive: string | undefined;
        } | {
            standingKey?: undefined;
            standingLabel?: undefined;
            choice?: undefined;
            id: string;
            label: string | undefined;
            controls: PromptControl[] | undefined;
            disabled: string | undefined;
            icon: string | undefined;
            img: string | undefined;
            tooltip: string | undefined;
            badges: string[];
            exclusive: string | undefined;
        } | {
            id: string;
            checked: boolean | undefined;
            label: string;
            img?: string;
            tooltip?: string;
            badges: string[];
            exclusive?: string;
            standingKey?: string;
            standingLabel?: string;
            choice?: string;
            choices?: {
                value: string;
                label: string;
            }[];
        })[];
        standingChoices: {
            value: import("./standing.js").StandingChoice;
            label: string;
        }[];
        content: string | HTMLElement;
        buttons: any;
        tabs?: Record<string, import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.Tab>;
    }>;
    _onRender(context: any, options: any): Promise<void>;
    /** Applies the ticked bonuses in the order shown, each through its own handler. */
    applyTicked(): Promise<void>;
}
interface PromptControl {
    kind: "number" | "select" | "multi" | "checkbox" | "text" | "targets";
    name: string;
    label: string;
    min?: number;
    max?: number;
    value?: string | number | boolean;
    options?: {
        value: string;
        label: string;
        selected?: boolean;
    }[];
}
export {};
