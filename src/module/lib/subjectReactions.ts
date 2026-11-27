import { canSee as midiCanSee } from "../utils.js";
import { getDistance } from "../services/distance/service.js";

/*
 * Reactions about another creature. Every reaction trigger is about a creature, its `subject`: the one attacked, hit,
 * damaged or saving, the one casting (isCast). Its own reactions are asked as always (subject.isSelf). Then each other
 * creature with a reaction whose condition reads `subject`, and the subject within that activity's reach, is asked too
 * (Workflow#askReactionsStep): Shield of the Cavalier's Protective Field ("you or an ally you can see within 5 feet"),
 * Counterspell ("a creature you can see within 60 feet casting a spell"), the Protection and Interception fighting
 * styles. A reaction whose condition doesn't mention `subject` is only ever about its own creature (Hellish Rebuke).
 *
 * `subject` in a reaction condition: { token, actor, uuid, isSelf, isAlly (same disposition), canSee (the reacting
 * creature sees it), distance (feet) }.
 */

const READS_SUBJECT = /\bsubject\b/;

/** Whether a reaction condition is about the trigger's creature (can be about another) */
export function readsSubject(condition: string | undefined | null): boolean {
  return !!condition && READS_SUBJECT.test(condition);
}

type ReachActivity = {
  activation?: { type?: string }, reactionCondition?: string,
  range?: { value?: number | string | null, units?: string },
  target?: { template?: { type?: string, size?: number | string | null, units?: string } }
};

/**
 * How far from its creature a reaction reaches another (feet): its range in feet; touch 5; Self with an area, the
 * area's size (an emanation: those in it); otherwise undefined (only its own creature).
 */
export function reactionReach(activity: ReachActivity): number | undefined {
  const range = activity.range;
  const value = Number(range?.value);
  if (range?.units === "ft" && Number.isFinite(value) && value > 0) return value;
  if (range?.units === "touch") return 5;
  const template = activity.target?.template;
  const size = Number(template?.size);
  if ((range?.units === "self" || !range?.units) && template?.type && Number.isFinite(size) && size > 0 && (template.units ?? "ft") === "ft") return size;
  return undefined;
}

/** Feet between two tokens (-1: not measurable) */
export function feetBetween(a: TokenDocument.Implementation, b: TokenDocument.Implementation): number {
  if (!a.object || !b.object || a.parent !== b.parent) return -1;
  return getDistance(a.object, b.object, { wallsBlock: false });
}

/** Whether `subject` is within the activity's reach of `reactor` */
export function withinReach(activity: ReachActivity, reactor: TokenDocument.Implementation, subject: TokenDocument.Implementation): boolean {
  const reach = reactionReach(activity);
  if (reach === undefined) return false;
  const distance = feetBetween(reactor, subject);
  return distance >= 0 && distance <= reach;
}

/** `subject` in a reaction condition */
export function subjectView(reactor: TokenDocument.Implementation, subject: TokenDocument.Implementation | undefined): Record<string, unknown> {
  const who = subject ?? reactor;
  const isSelf = who === reactor;
  const view: Record<string, unknown> = { token: who, actor: who.actor, uuid: who.uuid, isSelf, isAlly: isSelf || who.disposition === reactor.disposition };
  Object.defineProperty(view, "canSee", { enumerable: true, get: () => {
    if (isSelf) return true;
    try { return midiCanSee(reactor, who); } catch { return false; }
  } });
  Object.defineProperty(view, "distance", { enumerable: true, get: () => isSelf ? 0 : feetBetween(reactor, who) });
  return view;
}

type ActivityLike = ReachActivity & { type?: string, activity?: { id?: string } };

/** The other creatures on the subject's scene with a reaction about another creature that reaches it */
export function subjectReactors(subject: TokenDocument.Implementation, exclude: readonly (TokenDocument.Implementation | undefined)[] = []): TokenDocument.Implementation[] {
  const scene = subject.parent;
  if (!scene) return [];
  const found: TokenDocument.Implementation[] = [];
  for (const token of scene.tokens) {
    if (token === subject || exclude.includes(token) || token.hidden || !token.actor) continue;
    const reaches = token.actor.items.some(item => {
      const activities = (item.system as { activities?: Iterable<ActivityLike> & { get?(id: string): ActivityLike | undefined } }).activities;
      for (const activity of activities ?? []) {
        if (activity.activation?.type !== "reaction") continue;
        // A forward is checked as the activity it forwards to
        const checked = activity.type === "forward" && activity.activity?.id ? activities?.get?.(activity.activity.id) ?? activity : activity;
        if (!readsSubject(activity.reactionCondition) && !readsSubject(checked.reactionCondition)) continue;
        if (withinReach(checked, token, subject)) return true;
      }
      return false;
    });
    if (reaches) found.push(token);
  }
  return found;
}
