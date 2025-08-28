export declare class ChatLogMidi extends foundry.applications.sidebar.tabs.ChatLog {
    #private;
    /** @inheritDoc */
    _onFirstRender(context: any, options: any): Promise<void>;
    updateMessage(message: any, notify?: boolean): Promise<void>;
}
