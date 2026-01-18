export declare class ChatLogMidi extends globalThis.dnd5e.applications.ChatLog5e {
    #private;
    pruneElement(): Promise<void>;
    scrollBottom({ popout, waitImages, scrollOptions }?: {
        popout?: boolean | undefined;
        waitImages?: boolean | undefined;
        scrollOptions?: {} | undefined;
    }): Promise<any>;
    /** @inheritDoc */
    close(options?: {}): Promise<any>;
    renderBatch(size: number): Promise<void>;
}
