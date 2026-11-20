import { defineService } from "../../api/services.js";
import type { TokenOrDocument } from "../../../globals.js";
export interface TokenNameQuery {
    token: TokenDocument.Implementation;
    user: User.Implementation;
}
export interface TokenNamesProvider {
    /** The name `user` is shown for `token`; undefined: its own name */
    shownName?(query: TokenNameQuery): string | undefined;
}
declare module "../../api/services.js" {
    interface MidiServices {
        tokenNames: TokenNamesProvider;
    }
}
export declare let tokenNamesService: ReturnType<typeof defineService<TokenNamesProvider>>;
export declare function defineTokenNamesService(): void;
/** The active provider's name for `token` shown to `user` (default: this user); undefined: its own name */
export declare function shownTokenName(token: TokenOrDocument | null | undefined, user?: User.Implementation | null | undefined): string | undefined;
