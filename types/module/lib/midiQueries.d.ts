/** A socketlib handler, as registered: any arguments (never[] accepts every handler's own) */
export type MidiQueryHandler = (this: {
    socketdata: {
        userId?: string;
    };
}, ...args: never[]) => unknown;
/** A handler midi registers with socketlib, run by the midi-qol.call query too */
export declare function registerMidiQuery(name: string, handler: MidiQueryHandler): void;
/**
 * Run `name` on `user`'s client: its handler directly when that is this client (socketlib did the same), else a
 * Foundry query. Throws what the handler throws, or Foundry's error for an inactive user.
 * `CONFIG.debug.midiQueriesViaServer` sends a query to oneself through the server too (tests).
 */
export declare function queryUser(user: User.Implementation | null | undefined, name: string, ...args: unknown[]): Promise<any>;
/** Each of `users`, not awaited: a broadcast (the player waits' messages); a failure is logged */
export declare function queryEach(users: Iterable<User.Implementation>, name: string, ...args: unknown[]): void;
