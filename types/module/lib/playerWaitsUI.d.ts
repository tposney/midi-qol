/**
 * Player waits (playerWaits.ts) in Foundry's player list: a badge on each player midi is waiting for. The GM's opens a
 * popover to answer for them, and disconnected players with something pending are shown too; Gambit's Premades prompts
 * mirrored to the GM are listed under their player (optional), hidden until the GM shows one. A player sees their own
 * badge, which brings their open
 * prompts forward when one is hidden behind a sheet, and the others' read-only with the kind of prompt only
 * (playerWaitShowPlayers).
 */
export declare function setupPlayerWaitsUI(): void;
