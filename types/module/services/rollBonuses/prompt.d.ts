import { defineService } from "../../api/services.js";
export interface BonusPromptProvider {
    open(data: object): {
        render(options?: object): unknown;
    };
}
declare module "../../api/services.js" {
    interface MidiServices {
        bonusPrompt: BonusPromptProvider;
    }
}
export declare let bonusPromptService: ReturnType<typeof defineService<BonusPromptProvider>>;
export declare function defineBonusPromptService(selector: () => string | undefined): void;
