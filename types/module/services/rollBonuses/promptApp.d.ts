import { RollModifyDialog } from "../../utils.js";
export declare class BonusPromptApp extends RollModifyDialog {
    static PARTS: {
        dialog: {
            id: string;
            classes: string[];
            template: string;
        };
    };
    _prepareContext(options: any): Promise<{
        entries: {
            id: string;
            label: string | undefined;
            icon: string | undefined;
        }[];
        content: string | HTMLElement;
        buttons: any;
        tabs?: Record<string, import("fvtt-types/src/foundry/client/applications/api/application.mjs").default.Tab>;
    }>;
    _onRender(context: any, options: any): Promise<void>;
    /** Applies the ticked bonuses in the order shown, each through its own handler. */
    applyTicked(): Promise<void>;
}
