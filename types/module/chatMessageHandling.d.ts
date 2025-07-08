export declare const MAESTRO_MODULE_NAME = "maestro";
export declare const MODULE_LABEL = "Maestro";
export declare let colorChatMessageHandler: (message: any, html: any, data: any) => true | undefined;
export declare function checkOverTimeSaves(message: any, data: any, options: any, user: any): boolean;
export declare let nsaMessageHandler: (message: any, data: any, ...args: any[]) => boolean;
export declare let hideRollRender: (msg: any, html: any, data: any) => boolean;
export declare let hideRollUpdate: (message: any, data: any, diff: any, id: any) => boolean;
export declare let hideStuffHandler: (message: any, html: any, data: any) => true | undefined;
export declare function ddbglPendingFired(data: {
    sceneId: string;
    tokenId: string;
    actorId: string;
    itemId: string;
    actionType: string;
}): void;
export declare function ddbglPendingHook(data: any): void;
export declare function processCreateDDBGLMessages(message: ChatMessage, options: any, user: string): void;
