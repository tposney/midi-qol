import { RollStats } from "../RollStats.js";
declare const RollStatsDisplay_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof import("fvtt-types/src/foundry/client/applications/api/application.mjs").default>;
export declare class RollStatsDisplay extends RollStatsDisplay_base {
    #private;
    statsHookId: number;
    playersOnly: boolean;
    stats: RollStats;
    expanded: Record<string, boolean>;
    expandedItems: Record<string, boolean>;
    showLifetime: Record<string, boolean>;
    constructor(options?: any);
    static DEFAULT_OPTIONS: {
        id: string;
        window: {
            title: string;
            resizable: boolean;
            contentClasses: string[];
        };
        position: {
            width: number;
            height: number;
        };
        actions: {
            clearStats: typeof RollStatsDisplay.__#397@#onClearStats;
            exportJSON: typeof RollStatsDisplay.__#397@#onExportJSON;
            exportCSV: typeof RollStatsDisplay.__#397@#onExportCSV;
            endSession: typeof RollStatsDisplay.__#397@#onEndSession;
            removeStats: typeof RollStatsDisplay.__#397@#onRemoveStats;
            toggleExpand: typeof RollStatsDisplay.__#397@#onToggleExpand;
            toggleItems: typeof RollStatsDisplay.__#397@#onToggleItems;
            togglePeriod: typeof RollStatsDisplay.__#397@#onTogglePeriod;
        };
    };
    static PARTS: {
        tabs: {
            template: string;
        };
        stats: {
            template: string;
            scrollable: string[];
        };
        config: {
            template: string;
            scrollable: string[];
        };
    };
    tabGroups: {
        sheet: string;
    };
    get title(): string;
    _onClose(options: any): void;
    _prepareContext(options: any): Promise<any>;
    _preparePartContext(partId: any, context: any): any;
    _onRender(context: any, options: any): Promise<void>;
}
export {};
