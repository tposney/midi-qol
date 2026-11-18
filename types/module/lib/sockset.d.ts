/**
 * Imports the Socket class from the specified module.
 * @module lib/socket
 */
/**
 * Registers a socket event with the specified name, callback function, and default options.
 * @param {string} eventName - The name of the event.
 * @param {function} callback - The function to call when the event is received.
 * @param {object} defaultOptions - The default options for the event.
 * @param {boolean} defaultOptions.response - If true, the event will wait for a response from other users.
 * @param {number} defaultOptions.timeout - The time in milliseconds to wait for a response.
 * @returns {void}
 * @example
 * Socket.register("rollSkill", async ({ skill, actorId }) => {
 *    const actor = game.actors.get(actorId) ?? game.user?.character;
 *    return await actor.rollSkill(skill);
 * }, { response: true, timeout: 30000 });
 */
/**
 * Calls a socket event with the specified data and options.
 * @param {object} data - The data to send to other users.
 * @param {object | string | array} options - The options for the event.
 * @param {string | array} options.users - The users to send the event to.
 * @param {boolean} options.response - If true, the event will wait for a response from other users.
 * @param {number} options.timeout - The time in milliseconds to wait for a response.
 * @returns {Promise} - The promise will resolve with the results from other users.
 * @example
 * const results = await Socket.rollSkill({ skill: "acr", actorId: "f4y54ytw34s32" }, "others");
 */
/**
 * Constants representing special user identifiers that can be used in place of a userId field.
 * These constants can be accessed using the `Socket.USERS` object. You can use their lower case string values as well.
 * @namespace
 * @property {string} GMS - All Game Masters (GMs).
 * @property {string} PLAYERS - All players.
 * @property {string} ALL - All users.
 * @property {string} OTHERS - All users except the current user.
 * @property {string} FIRSTGM - The first Game Master.
 * @property {string} SELF - The current user.
 */
export declare class Socket {
    static __$callbacks: {};
    static __$stores: {};
    static __$promises: {};
    static __$socket: any;
    static USERS: {
        GMS: string;
        PLAYERS: string;
        ALL: string;
        OTHERS: string;
        FIRSTGM: string;
        SELF: string;
    };
    static __$reserved: string[];
    static __$onMessage(data: any): Promise<void>;
    static __$parseUsers(options: any): any;
    static register(eventName: any, callback: any, defaultOptions?: {}): void;
    static registerStore(storeName: any, initialValue?: {}, callback?: null): any;
}
