import type { MidiActivity } from "./midiActivity.js";
import { Activity } from "../../globals.js";
import { Workflow } from "../Workflow.js";
import { TokenHighlight } from "../lib/tokenHighlight.js";
/** dnd5e 6's teleport activity, given a midi workflow. Not present on dnd5e 5.x. */
export declare function setupTeleportActivity(): void;
/** dnd5e's teleport activity (its `teleport` distance) with midi's settings (activitySchema.ts `midiTeleport`) */
export type TeleportingActivity = MidiActivity & {
    teleport: {
        value: number;
        units: string;
    };
    midiTeleport?: {
        movers: TeleportMoverMode;
        plan: typeof teleportPlanModes[number];
        blocked: "refuse" | "fail";
        requireSight: boolean;
    };
};
export declare function isTeleportActivity(activity: Activity | null | undefined): activity is TeleportingActivity;
export declare const teleportMoverModes: readonly ["default", "caster", "casterAndTargets", "targets", "swap"];
export type TeleportMoverMode = typeof teleportMoverModes[number];
export declare const teleportPlanModes: readonly ["button", "auto"];
interface Mover {
    token: Token.Implementation;
    /** "plan": its owner plans the move (Foundry movement planning); "place": the user picks the destination. */
    method: "plan" | "place";
}
/** A token position; `level` is the scene level's id (Foundry 14). */
type Position = {
    x: number;
    y: number;
    elevation?: number;
    level?: string;
};
export interface TeleportPlan {
    token: Token.Implementation;
    plan: {
        id?: string;
        origin: Position;
        destination: Position;
        waypoints?: unknown[];
    };
}
export interface TeleportResult extends TeleportPlan {
    moved: boolean;
}
export interface TeleportConfig {
    maxDistance: number;
    tokens: Token.Implementation[];
    movers: TeleportMoverMode;
}
/** midiOptions.teleport: "button" leaves an auto teleport to the card's button; destinations move without asking. */
export type TeleportOption = "button" | {
    destinations?: Record<string, Position>;
};
type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** A token's footprint at a position: its grid spaces (square and hex grids) and bounds. */
interface Space {
    rect: Rect;
    cells?: {
        i: number;
        j: number;
    }[];
    level?: string;
}
export declare function autoTeleport(activity: TeleportingActivity, workflow: Workflow): Promise<TeleportResult[] | null | undefined>;
/** The teleport distance in the scene's units (dnd5e's #getSceneMaxDistance). */
export declare function sceneMaxDistance(activity: TeleportingActivity): number | null;
export declare function casterToken(activity: TeleportingActivity): Token.Implementation | undefined;
/**
 * The tokens the activity teleports and how each one's destination is chosen. `listed`: what the card's targets
 * list shows when its Teleport button is pressed.
 */
export declare function teleportMovers(activity: TeleportingActivity, targets: Token.Implementation[], listed?: Token.Implementation[]): Mover[];
/**
 * Teleport the movers: those planned by their owner move as dnd5e moves them; the others go where the user
 * picks, within 5 ft of the caster's destination (casterAndTargets) or within the teleport distance of the
 * caster (targets), and a GM moves those the user doesn't own. dnd5e's and midi's teleport hooks and midi's
 * preTeleport/postTeleport on-use passes run as for dnd5e's own planning. A use's `midiOptions.teleport`
 * destinations replace the planning and picking.
 */
export declare function planTeleport(activity: TeleportingActivity, { message, workflow, listed }?: {
    message?: ChatMessage.Implementation;
    workflow?: Workflow;
    listed?: Token.Implementation[];
}): Promise<TeleportResult[] | null | undefined>;
/** The card's Teleport button goes once the move is made. */
export declare function recordTeleported(activity: TeleportingActivity, message: ChatMessage.Implementation, workflow: Workflow | undefined): Promise<void>;
export declare function teleportWorkflowTargets(activity: TeleportingActivity, workflow: Workflow | undefined, message: ChatMessage.Implementation | undefined): Token.Implementation[];
/** Run the item's on-use macros for a teleport pass; true when one returned false (cancel). */
export declare function callTeleportMacros(activity: TeleportingActivity, workflow: Workflow, pass: "preTeleport" | "postTeleport", options: Record<string, unknown>): Promise<boolean>;
/** Swap: the caster and the target trade places, the target within the teleport distance (and seen, if required). */
export declare function planSwap(activity: TeleportingActivity, movers: Mover[], maxDistance: number): (TeleportPlan[] & {
    failed?: boolean;
}) | undefined;
export declare function planMovers(activity: TeleportingActivity, movers: Mover[], maxDistance: number, highlight: TokenHighlight, destinations?: Record<string, Position>): Promise<(TeleportPlan[] & {
    failed?: boolean;
}) | undefined>;
/** Why a placed mover can't go to `space`: too far from its anchor, or (unless the teleport fails instead) blocked. */
export declare function placementProblem(activity: TeleportingActivity, token: Token.Implementation, space: Space, constraint: {
    near?: Space;
    within: number;
}, plans: TeleportPlan[], fail: boolean): string | undefined;
/**
 * Let the user pick where `token` goes: Foundry's token placement preview, nothing created. Undefined when the
 * user skips it (right click), null when they dismiss the placement.
 */
export declare function pickDestination(activity: TeleportingActivity, token: Token.Implementation, constraint: {
    near?: Space;
    within: number;
}, plans: TeleportPlan[], fail: boolean): Promise<Position | undefined | null>;
/** The nearest free space within 5 ft of `anchor`, or undefined. */
export declare function nearestFree(activity: TeleportingActivity, token: Token.Implementation, anchor: Space, plans: TeleportPlan[]): Position | undefined;
/**
 * Why `token` can't arrive at `space`, or undefined: it must be inside the scene, on an unoccupied space (other
 * tokens and the other movers' destinations), not inside a wall, reachable from `reachableFrom` without
 * crossing a wall, and seen from `from` when the activity requires sight.
 */
export declare function destinationProblem(activity: TeleportingActivity, token: Token.Implementation, space: Space, plans: TeleportPlan[], { from, reachableFrom }?: {
    from?: Token.Implementation;
    reachableFrom?: Space;
}): string | undefined;
/** A wall between two points on `levelId`'s level (default: the token's). */
export declare function collides(activity: TeleportingActivity, origin: {
    x: number;
    y: number;
}, destination: {
    x: number;
    y: number;
}, type: "move" | "sight", token: Token.Implementation, levelId?: string): boolean;
/**
 * A movement-blocking wall crossing the space: each grid space's edges and diagonals (the bounds when gridless),
 * inset so walls along its border don't count.
 */
export declare function wallInside(activity: TeleportingActivity, space: Space, token: Token.Implementation): boolean;
export declare function positionOf(activity: TeleportingActivity, token: Token.Implementation): Position;
/** `token`'s footprint at `position`: its grid spaces on square and hex grids, its bounds. */
export declare function spaceOf(activity: TeleportingActivity, token: Token.Implementation, position: Position | TokenDocument.Implementation): Space;
export declare function overlaps(activity: TeleportingActivity, a: Space, b: Space): boolean;
/**
 * How far apart two spaces are, in scene units, as the grid measures from space to space: one grid space's
 * distance when adjacent. Gridless: the gap between their bounds.
 */
export declare function spaceGap(activity: TeleportingActivity, a: Space, b: Space): number;
/** The distance a token's own teleport covers, as the grid measures it. */
export declare function travelDistance(activity: TeleportingActivity, token: Token.Implementation, from: Position, to: Position): number;
export declare function moveTraveller(activity: TeleportingActivity, { token, plan }: TeleportPlan): Promise<boolean>;
/** Dimension Door: an arrival in an occupied or filled space fails the teleport and damages every traveller. */
export declare function failTeleport(activity: TeleportingActivity, travellers: Token.Implementation[]): Promise<void>;
export {};
