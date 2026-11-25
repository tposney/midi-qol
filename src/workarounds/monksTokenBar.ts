/*
 * Monk's TokenBar (14.01): its movement modes ("combat turn", "no movement") stop a player's client from moving any
 * token but the current combatant: its preUpdateToken hook deletes x/y when its static MonksTokenBar.allowMovement says
 * no, whatever the update is for. midi's grapple drag moves the dragged creature from the player's client when they own
 * both creatures, so the grappler moved alone and the grapple ended out of reach.
 *
 * The fix: the tokens a midi move names (withMonksMovementAllowed) pass Monk's check, on this client, while that move
 * runs. Monk's exposes only its API class (game.MonksTokenBar); the class that checks movement is its module's export,
 * and importing the URL Foundry loaded it from gives the same instance its hook uses. If the file or method moves, the
 * fix quietly does nothing and drags are blocked as before.
 *
 * Remove when Monk's TokenBar lets an update say it is automation's (an update option it honours).
 */

type MonksMovementCheck = { allowMovement(token: TokenDocument.Implementation | undefined, notify?: boolean): boolean };

const allowed = new Set<string>();
let patched = false;

async function patchAllowMovement(): Promise<void> {
  if (!game.modules?.get("monks-tokenbar")?.active) return;
  const url = foundry.utils.getRoute("modules/monks-tokenbar/monks-tokenbar.js");
  const { MonksTokenBar } = (await import(url).catch(() => ({}))) as { MonksTokenBar?: MonksMovementCheck };
  const original = MonksTokenBar?.allowMovement;
  if (!MonksTokenBar || typeof original !== "function") return;
  MonksTokenBar.allowMovement = function (this: MonksMovementCheck, token, notify) {
    return (!!token?.id && allowed.has(token.id)) || original.call(this, token, notify);
  };
  patched = true;
}

export function installMonksTokenBar(): void {
  Hooks.once("ready", () => { void patchAllowMovement(); });
}

/** Run a move of these tokens that Monk's movement modes must not stop (a creature dragged along) */
export async function withMonksMovementAllowed<T>(tokenIds: (string | null | undefined)[], move: () => Promise<T>): Promise<T> {
  if (!patched) return move();
  const ids = tokenIds.filter((id): id is string => !!id);
  for (const id of ids) allowed.add(id);
  try {
    return await move();
  } finally {
    for (const id of ids) allowed.delete(id);
  }
}
