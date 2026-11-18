export declare let ChatMessageMidi: ReturnType<typeof defineChatMessageMidiClass>;
export declare function setupChatMessageMidi(): void;
/** What ChatMessageMidi adds to dnd5e's chat message (dnd5e's own methods it overrides keep their types) */
export interface ChatMessageMidiMembers {
    maskAttackRolls(html: HTMLElement): void;
    applyChatVisibility(html: HTMLElement): void;
    noDiceClicks(event: Event): void;
}
/**
 * The class defineChatMessageMidiClass returns. Declared rather than inferred: TypeScript 5.9 crashes writing the
 * inferred class type over fvtt-types' ChatMessage into the declarations (npm run generate:types).
 */
export type ChatMessageMidiClass = new (...args: ConstructorParameters<ChatMessage.ImplementationClass>) => ChatMessage.Implementation & ChatMessageMidiMembers;
export declare function defineChatMessageMidiClass(baseClass: ChatMessage.ImplementationClass): ChatMessageMidiClass;
/**
 * What a non-GM sees of a roll message: all of it when they can read it; nothing when it was forced blind or
 * ForceHideRoll is on; otherwise a stand-in saying a roll was made.
 */
export declare function hiddenRollView(message: ChatMessage.Implementation): "show" | "placeholder" | "none";
/** A roll midi forced obscured: players see its card with ?? for the result. */
export declare function isObscured(message: ChatMessage.Implementation): boolean;
