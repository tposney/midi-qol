export declare let colorChatMessageHandler: (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData | undefined) => boolean;
export declare function checkOverTimeSaves(message: ChatMessage.Implementation, data: ChatMessage.CreateData, options: ChatMessage.Database.PreCreateOptions, user: string): boolean;
export declare let nsaMessageHandler: (message: ChatMessage.Implementation, data: ChatMessage.CreateData, options: ChatMessage.Database.PreCreateOptions, user: string) => boolean;
export declare let hideRollRender: (msg: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData | undefined) => boolean;
export declare let hideRollUpdate: (message: ChatMessage.Implementation, data: ChatMessage.UpdateData, options: ChatMessage.Database.OnUpdateOptions, id: string) => boolean;
export declare let hideStuffHandler: (message: ChatMessage.Implementation, html: HTMLElement, data: ChatMessage.MessageData | undefined) => true | undefined;
