import { defineService } from "../../api/services.js";
export interface ChooseTokensRequest {
    tokens: readonly (Token.Implementation | TokenDocument.Implementation)[];
    /** Fewest to choose (default 1; 0 allows choosing none). */
    min?: number;
    /** Most to choose (default 1). */
    max?: number;
    title?: string;
    /** A line above the list. */
    hint?: string;
    /** Show each token's distance from this token. */
    from?: Token.Implementation | TokenDocument.Implementation;
    /** Tokens ticked to start with. */
    preselected?: readonly (Token.Implementation | TokenDocument.Implementation)[];
}
export interface ChooseTokensProvider {
    /** The chosen tokens' documents, or null when cancelled. */
    choose(request: ChooseTokensRequest): Promise<TokenDocument.Implementation[] | null>;
}
declare module "../../api/services.js" {
    interface MidiServices {
        chooseTokens: ChooseTokensProvider;
    }
}
export declare let chooseTokensService: ReturnType<typeof defineService<ChooseTokensProvider>>;
export declare function defineChooseTokensService(): void;
/** The active provider's choice (midi's dialog by default): the chosen tokens' documents, or null when cancelled. */
export declare function chooseTokens(request: ChooseTokensRequest): Promise<TokenDocument.Implementation[] | null>;
