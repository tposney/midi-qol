import { UndoData, Workflow } from "./Workflow.js";
export declare let undoDataQueue: UndoData[];
interface UndoDataDirect {
    id: string;
    userId: string;
    userName: string;
    itemName: string;
    itemUuid: string;
    actorUuid: string;
    actorName: string;
    isReaction: boolean;
    tokendocUuid?: string;
    chatCardUuids?: string[];
    templateUuids?: string[];
    sequencerUuid?: string;
    itemCardUuid?: string;
    targets?: {
        actorUuid: string;
        tokenUuid: string;
    }[];
}
export declare function queueUndoDataDirect(undoDataDef: UndoDataDirect): void;
export declare function _queueUndoDataDirect(undoDataDef: UndoDataDirect): void;
export declare function saveUndoData(workflow: Workflow): Promise<boolean>;
export declare function createTargetData(tokenUuid: string | null): {
    tokenUuid: string;
    actorUuid: string;
    actorData: Actor.Source | undefined;
    tokenData: TokenDocument.Source | undefined;
} | undefined;
export declare function startUndoWorkflow(undoData: UndoData): boolean;
/**
 * Record messages a use produced that aren't linked to its card (another module's rolls, a re-posted card), on its undo
 * entry (`id`, the workflow's id; none: the most recent entry). Messages linked to the card are found when undoing.
 */
export declare function addUndoChatCards(data: {
    id?: string;
    chatCardUuids: string[];
}): void;
export declare function saveTargetsUndoData(workflow: Workflow): Promise<any>;
/** A message for the most recent undo entry to remove (API). Messages linked to the use's card need not be added. */
export declare function addUndoChatMessage(message: ChatMessage.Implementation): Promise<void>;
export declare function showUndoQueue(): void;
export declare function getUndoQueue(): UndoData[];
export declare function queueUndoData(data: UndoData): boolean;
export declare function addQueueEntry(queue: UndoData[], data: UndoData): void;
export declare function undoMostRecentWorkflow(): Promise<any>;
export declare function removeMostRecentWorkflow(): Promise<any>;
export declare function undoTillWorkflow(workflowId: string, undoTarget: boolean, removeWorkflow?: boolean): Promise<boolean>;
export declare function _undoMostRecentWorkflow(): Promise<false | void>;
export declare function _removeMostRecentWorkflow(): Promise<false | UndoData | undefined>;
export declare function getRemoveUndoEffects(effectsData: ActiveEffect.Source[], actor: Actor.Implementation): string[];
/** Delete a card, or mark it undone: shown when drawn (midi-qol-undone, coloured from the setting), its content untouched. */
export declare function removeChatCard(chatCard?: ChatMessage.Implementation): Promise<void>;
export declare function undoWorkflow(undoData?: UndoData): Promise<void>;
export {};
