export interface Point {
    x: number;
    y: number;
}
/** A box in canvas pixels: top-left corner and size. */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Whether segments a-b and c-d meet, ends included: Foundry's lineSegmentIntersection, same tolerance. */
export declare function segmentsIntersect(a: Point, b: Point, c: Point, d: Point, epsilon?: number): boolean;
/** Whether the line from p1 to p2 crosses both the top and bottom of the box, or both its left and right. */
export declare function crossesOppositeSides(box: Box, p1: Point, p2: Point): boolean;
/** Whether a and b stand at least `minDegrees` apart around `centre`. */
export declare function opposedByAngle(centre: Point, a: Point, b: Point, minDegrees?: number): boolean;
/** The Check flanking settings whose rule is "the target is flanked" (rather than "the attacker is flanking"). */
export declare const FLANKED_MODES: readonly string[];
