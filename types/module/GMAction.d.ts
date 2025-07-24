export declare var socketlibSocket: any;
export declare let setupSocket: () => void;
export declare class SaferSocket {
    #private;
    constructor(socketlibSocket: any);
    canCall(handler: any): boolean;
    executeAsGM(handler: any, ...args: any[]): Promise<any>;
    executeAsUser(handler: any, userId: any, ...args: any[]): Promise<any>;
    executeForAllGMs(handler: any, ...args: any[]): Promise<any>;
    executeForOtherGMS(handler: any, ...args: any[]): Promise<any>;
    executeForEveryone(handler: any, ...args: any[]): Promise<any>;
    executeForOthers(handler: any, ...args: any[]): Promise<any>;
    executeForUsers(handler: any, recipients: any, ...args: any[]): Promise<any>;
}
export declare function cancelWorkflow(data: {
    workflowId: string;
    itemCardUuid: string;
}): Promise<void>;
export declare function timedExecuteAsGM(toDo: string, data: any): Promise<any>;
export declare function preferredActiveGM(): User | null;
export declare function unTimedExecuteAsGM(toDo: string, ...args: any[]): Promise<any>;
export declare function timedAwaitExecuteAsGM(toDo: string, data: any): Promise<any>;
export declare function initGMActionSetup(): void;
export declare let processUndoDamageCard: (message: ChatMessage, html: HTMLElement, data: any) => boolean;
export declare function prepareDamageListToJSON(damageList: any[]): any[];
