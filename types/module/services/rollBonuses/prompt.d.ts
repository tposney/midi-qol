import { defineService } from "../../api/services.js";
import type { BonusSelection } from "./service.js";
import type { BonusPromptData } from "../../utils.js";
/** What a prompt provider's `ask` is asked: the roll, and the optional bonuses on offer */
export interface BonusAskRequest {
    title: string;
    actor: Actor.Implementation;
    roll: Roll;
    /** The roll as the asking user may see it (HTML; "Hidden Roll" for a hidden roll) */
    rollHTML: string;
    phase: string;
    candidates: readonly {
        id: string;
        label: string;
        description?: string;
        effect: {
            kind: string;
        };
        img?: string;
    }[];
    /** Seconds before it is answered for the roller (none taken) */
    timeout: number;
}
/**
 * A provider either opens a window over midi's dialog data (`open`: the window drives midi's handlers, as midi's two
 * prompts do), or answers a request (`ask`, contract 3): the ids chosen, or null / [] for none. midi applies a
 * selection in the application order, and asks again with what is left after a reroll or a replacement.
 */
export interface BonusPromptProvider {
    open?(data: BonusPromptData): {
        render(options?: object): unknown;
    };
    /** Contract 4: an answer may carry the bonus's selection (its scaling, inputs, damage type, targets) */
    ask?(request: BonusAskRequest): Promise<readonly (string | {
        id: string;
        selection?: BonusSelection;
    })[] | null>;
}
declare module "../../api/services.js" {
    interface MidiServices {
        bonusPrompt: BonusPromptProvider;
    }
}
export declare let bonusPromptService: ReturnType<typeof defineService<BonusPromptProvider>>;
export declare function defineBonusPromptService(selector: () => string | undefined): void;
