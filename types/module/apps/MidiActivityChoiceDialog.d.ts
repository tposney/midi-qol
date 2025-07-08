declare const ActivityChoiceDialog: any;
export declare class MidiActivityChoiceDialog extends ActivityChoiceDialog {
    static get defaultOptions(): any;
    static create(...args: any[]): Promise<any>;
    get item(): any;
    _prepareActivityContext(...args: any[]): any;
    _prepareContext(options: any): Promise<any>;
}
export {};
