import { Activity } from "../../globals.js";
import ApplicationV2 = foundry.applications.api.ApplicationV2;
import { WorkflowOptions } from "../Workflow.js";
declare const TargetConfirmationDialog_base: import("fvtt-types/src/foundry/client/applications/api/handlebars-application.mjs").default.Mix<typeof ApplicationV2>;
export declare class TargetConfirmationDialog extends TargetConfirmationDialog_base {
    #private;
    callback: ((data: any) => {}) | undefined;
    data: {
        actor: Actor.Implementation;
        activity: Activity;
        user: User | null;
        targets: Token.Implementation[];
        options: any;
        maxTargets: number | null | undefined;
    };
    notAllowedTexture: PIXI.Texture | null;
    hookId: number | undefined;
    hoverHookId: number | undefined;
    moveHookId: number | undefined;
    constructor(actor: Actor.Implementation, activity: Activity, user: User.Implementation, options?: TargetConfirmationOptions);
    get title(): any;
    static get xPosition(): number;
    static get yPosition(): number;
    static PARTS: {
        main: {
            template: string;
        };
        footer: {
            template: string;
        };
    };
    static DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    validateAndUpdateTargets(): void;
    /** Remove a token's overlay sprite; the shared texture is kept. */
    removeNotAllowedOverlay(token: Token.Implementation | undefined): void;
    /** Clear all overlays on close, so the hovered token isn't left with an orphan. */
    removeAllNotAllowedOverlays(): void;
    hoverToken(token: Token.Implementation, hovered: boolean): void;
    isTargetSelectable(token: Token.Implementation): boolean;
    _prepareContext(options: ApplicationV2.RenderOptions): Promise<Omit<{
        actor: Actor.Implementation;
        activity: Activity;
        user: User | null;
        targets: Token.Implementation[];
        options: any;
        maxTargets: number | null | undefined;
    }, "targets"> & ApplicationV2.RenderContext & {
        blurb?: string;
        buttons?: {
            type?: string;
            icon?: string;
            label?: string;
            action?: string;
            default?: boolean;
            hidden?: boolean;
        }[];
        targets: (Token.Implementation | {
            name: string;
            img: string;
            displayedDisposition?: string;
            details: string;
            hasDetails: boolean;
            uuid: string | null;
        })[];
    }>;
    _onRender(context: any, options: any): Promise<void>;
    /** Hooks are added once shown and removed on any close, so a dialog that never renders leaves none behind. */
    _onFirstRender(context: any, options: any): Promise<void>;
    _onClose(options: any): Promise<void>;
    close(options?: {}): Promise<void | this>;
    doCallback(value?: boolean): void;
}
export type TargetConfirmationOptions = Partial<ApplicationV2.Configuration> & {
    callback?: (value: unknown) => void;
    workflowOptions?: WorkflowOptions;
};
export {};
