import { rememberSyntheticToken, tokenOf } from "./tokenDocumentSet.js";

export { tokenOf };

/*
 * Section 18, rule 4: one way from anything to its TokenDocument, `tokenFor`, and one from a TokenDocument to its
 * canvas Token, `tokenOf` (lib/tokenDocumentSet.ts: it knows midi's stand-in Tokens; Foundry's lazy `object` would
 * build another for a document with no id). midi's code uses only these two; the older helpers (getTokenDocument,
 * getToken, tokenForActor, getOrCreateTokenForActor) remain as wrappers for macros and other modules.
 * tokenFor's choice:
 * - a token, token uuid or canvas Token: that token; an item or effect: its actor's;
 * - a synthetic (unlinked) actor: its own token;
 * - a linked actor: its tokens on `scene` if given, else on the viewed scene, else on any scene; among them a
 *   controlled one, else the one nearest `near`, else the first;
 * - `create`: a token usable on the viewed canvas: when none of its tokens is drawn there, midi's stand-in, an
 *   in-memory TokenDocument from the prototype token (not in the scene) with its stand-in Token, the same each time.
 */

type Point = { x: number, y: number };
export type TokenRef = Actor.Implementation | TokenDocument.Implementation | Token.Implementation | Item.Implementation | ActiveEffect.Implementation | string | null | undefined;

export interface TokenForOptions {
  /** Only this scene's tokens (default: the viewed scene's, else any scene's) */
  scene?: Scene.Implementation | null;
  /** Prefer the token nearest this one or this point (same scene) */
  near?: TokenDocument.Implementation | Point | null;
  /** A token usable on the viewed canvas: midi's stand-in when none of the actor's is drawn there */
  create?: boolean;
}

const standIns = new WeakMap<Actor.Implementation, TokenDocument.Implementation>();
const standInDocs = new WeakSet<TokenDocument.Implementation>();

/** Whether the document is midi's in-memory stand-in for an actor with no usable token */
export function isEphemeralToken(token: TokenDocument.Implementation | null | undefined): boolean {
  return !!token && standInDocs.has(token);
}

function documentOf(ref: TokenRef): Actor.Implementation | TokenDocument.Implementation | undefined {
  if (!ref) return undefined;
  if (typeof ref === "string") {
    const found = fromUuidSync(ref) as unknown;
    if (found instanceof TokenDocument || found instanceof Actor || found instanceof Item || found instanceof ActiveEffect) return documentOf(found as TokenRef);
    return game.actors?.get(ref) ?? undefined;
  }
  if (ref instanceof TokenDocument) return ref as TokenDocument.Implementation;
  if (ref instanceof foundry.canvas.placeables.Token) return ref.document as TokenDocument.Implementation;
  if (ref instanceof Actor) return ref as Actor.Implementation;
  if (ref instanceof Item) return ref.parent instanceof Actor ? ref.parent as Actor.Implementation : undefined;
  if (ref instanceof ActiveEffect) {
    const parent = ref.parent;
    if (parent instanceof Actor) return parent as Actor.Implementation;
    if (parent instanceof Item && parent.parent instanceof Actor) return parent.parent as Actor.Implementation;
  }
  return undefined;
}

function centre(token: TokenDocument.Implementation): Point {
  const size = token.parent?.grid?.size ?? canvas?.grid?.size ?? 100;
  return { x: token._source.x + (token.width * size) / 2, y: token._source.y + (token.height * size) / 2 };
}

function pickOne(tokens: TokenDocument.Implementation[], near: TokenForOptions["near"]): TokenDocument.Implementation | undefined {
  if (tokens.length <= 1) return tokens[0];
  const controlled = tokens.filter(t => tokenOf(t)?.controlled);
  if (controlled.length) tokens = controlled;
  if (near && tokens.length > 1) {
    const point = near instanceof TokenDocument ? centre(near as TokenDocument.Implementation) : near;
    const sameScene = near instanceof TokenDocument ? tokens.filter(t => t.parent === near.parent) : tokens;
    const pool = sameScene.length ? sameScene : tokens;
    return pool.reduce((best, t) => {
      const c = centre(t), b = centre(best);
      return Math.hypot(c.x - point.x, c.y - point.y) < Math.hypot(b.x - point.x, b.y - point.y) ? t : best;
    });
  }
  return tokens[0];
}

/** The TokenDocument for an actor, token, uuid, item or effect (see above) */
export function tokenFor(ref: TokenRef, options: TokenForOptions = {}): TokenDocument.Implementation | undefined {
  const found = documentOf(ref);
  if (!found) return undefined;
  if (found instanceof TokenDocument) return found;
  const actor = found;
  if (actor.isToken && actor.token) return actor.token as TokenDocument.Implementation;
  const all = actor.getDependentTokens({ concreteOnly: true }) as TokenDocument.Implementation[];
  const viewed = canvas?.scene ?? null;
  const onScene = (scene: Scene.Implementation | null) => all.filter(t => t.parent === scene);
  const scene = options.create ? viewed : options.scene;
  const candidates = scene !== undefined ? onScene(scene) : (viewed && onScene(viewed).length ? onScene(viewed) : all);
  if (!options.create) return pickOne(candidates, options.near);
  const drawn = candidates.filter(t => tokenOf(t));
  return pickOne(drawn, options.near) ?? standInFor(actor);
}

/** midi's stand-in for an actor with no usable token: a TokenDocument from its prototype on the viewed scene and its Token */
function standInFor(actor: Actor.Implementation): TokenDocument.Implementation | undefined {
  const scene = canvas?.scene;
  if (!scene) return undefined;
  const known = standIns.get(actor);
  if (known && known.parent === scene && tokenOf(known)) return known;
  const cls = getDocumentClass("Token") as unknown as new (data: object, context: { parent: Scene.Implementation }) => TokenDocument.Implementation;
  const doc = new cls({ ...actor.prototypeToken.toObject(), actorId: actor.id }, { parent: scene });
  rememberSyntheticToken(new CONFIG.Token.objectClass(doc) as Token.Implementation);
  standIns.set(actor, doc);
  standInDocs.add(doc);
  return doc;
}
