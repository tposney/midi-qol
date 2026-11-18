export declare function setupMagicSight(): void;
/** For tests: the uuids of the Magic Sight effects drawn on this client, with each one's ring and band counts. */
export declare function drawnMagicSight(): Record<string, {
    tokens: number;
    shapes: number;
}>;
