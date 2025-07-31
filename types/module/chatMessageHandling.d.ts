export declare const MAESTRO_MODULE_NAME = "maestro";
export declare const MODULE_LABEL = "Maestro";
export declare let colorChatMessageHandler: (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => true | undefined;
export declare function checkOverTimeSaves(message: ChatMessage.Implementation, data: ChatMessage.CreateData, options: ChatMessage.Database.CreateOptions, user: string): boolean;
export declare let nsaMessageHandler: (message: ChatMessage.Implementation, data: ChatMessage.CreateData, options: ChatMessage.Database.PreCreateOptions, user: string) => boolean;
export declare let hideRollRender: (msg: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => boolean;
export declare let hideRollUpdate: (message: ChatMessage.Implementation, data: ChatMessage.UpdateData, options: ChatMessage.Database.UpdateOptions, id: string) => boolean;
export declare let hideStuffHandler: (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData) => true | undefined;
export declare function ddbglPendingFired(data: {
    sceneId: string;
    tokenId: string;
    actorId: string;
    itemId: string;
    actionType: string;
}): void;
export declare function ddbglPendingHook(data: any): void;
export declare function processCreateDDBGLMessages(message: ChatMessage.Implementation, options: ChatMessage.Database.CreateOptions, user: string): void;
