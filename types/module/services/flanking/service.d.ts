import { defineService } from "../../api/services.js";
/** TokenDocuments (section 18: no canvas Token crosses a contract); a provider wanting geometry uses `.object` */
export interface FlankingQuery {
    attacker: TokenDocument.Implementation;
    target: TokenDocument.Implementation;
}
export interface FlankedQuery {
    target: TokenDocument.Implementation;
}
type Answer = boolean | undefined | Promise<boolean | undefined>;
export interface FlankingProvider {
    /** Does `attacker` flank `target` (an ally of the attacker opposite it)? */
    flanking?(query: FlankingQuery): Answer;
    /** Is `target` flanked by any of its enemies (the "flanked" modes)? */
    flanked?(query: FlankedQuery): Answer;
}
declare module "../../api/services.js" {
    interface MidiServices {
        flanking: FlankingProvider;
    }
}
export declare let flankingService: ReturnType<typeof defineService<FlankingProvider>>;
export declare function defineFlankingService(): void;
/** Is `target` flanked: midi's setting decides whether the flanked rule applies, the provider decides. */
export declare function computeFlankedStatus(target: Token.Implementation): Promise<boolean>;
/** Does `token` flank `target`: midi's setting decides whether flanking applies, the provider decides. */
export declare function computeFlankingStatus(token: Token.Implementation, target: Token.Implementation): Promise<boolean>;
/** The active provider's answer, or midi's geometry when it has none. */
export declare function isFlanking(attacker: Token.Implementation, target: Token.Implementation): Promise<boolean>;
export declare function isFlanked(target: Token.Implementation): Promise<boolean>;
export {};
