import { DamageDescriptionObject } from "./Workflow.js";
import { DamageApplicationOptions, DamageListEntry } from "../globals.js";
export declare let socketlibSocket: any;
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
export declare let processUndoDamageCard: (message: ChatMessage.Implementation, html: HTMLElement, _data: unknown) => boolean;
export interface SerializedDamageListEntry extends Omit<DamageListEntry, "calcDamageOptions" | "damageDetail" | "rawDamageDetail" | "damageDetails"> {
    damageDetail: DamageDescriptionObject[];
    damageDetails: {
        bonusDamage?: DamageDescriptionObject[];
        combinedDamage: DamageDescriptionObject[];
        defaultDamage?: DamageDescriptionObject[];
        otherDamage?: DamageDescriptionObject[];
        rawbonusDamage?: DamageDescriptionObject[];
        rawcombinedDamage: DamageDescriptionObject[];
        rawdefaultDamage?: DamageDescriptionObject[];
        rawotherDamage?: DamageDescriptionObject[];
    };
    rawDamageDetail: DamageDescriptionObject[];
    calcDamageOptions: Omit<DamageApplicationOptions, "downgrade" | "ignore"> & {
        downgrade?: true | string[];
        ignore?: true | {
            immunity: true | string[];
            resistance: true | string[];
            vulnerability: true | string[];
            modification: true | string[];
            superSaver?: true | string[];
            semiSuperSaver?: true | string[];
            saved?: true | string[];
            DR?: string[];
        };
    };
}
export declare function prepareDamageListToJSON(damageList: DamageListEntry[]): SerializedDamageListEntry[];
