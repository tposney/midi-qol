import { defineService } from "../api/services.js";

/*
 * bonusPrompt (single): the window a roll's optional bonuses are offered in. The client setting "Bonus prompt" picks
 * midi's phased prompt (default) or the classic one-button-per-bonus dialog; another module can register its own.
 * A provider opens a window over the dialog data midi's bonus code drives (RollModifyDialog's data and handlers).
 */

export interface BonusPromptProvider {
  open(data: object): { render(options?: object): unknown };
}

declare module "../api/services.js" {
  interface MidiServices { bonusPrompt: BonusPromptProvider }
}

export let bonusPromptService: ReturnType<typeof defineService<BonusPromptProvider>>;

export function defineBonusPromptService(selector: () => string | undefined) {
  bonusPromptService = defineService<BonusPromptProvider>("bonusPrompt", {
    kind: "single",
    description: "The window optional roll bonuses are offered in",
    selector
  });
}
