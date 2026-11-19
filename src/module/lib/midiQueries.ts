import { decodeWorkflowOptions, encodeWorkflowOptions, mapPayload as mapOptions } from "./workflowOptionsCodec.js";

/*
 * midi's GM actions and commands to a user over Foundry's user queries (M5, plan
 * ~/Documents/midi-next-M5-gm-queries-plan-2026-11-19.md), in place of socketlib: one query, `midi-qol.call`, names
 * the socketlib handler to run. The socketlib names stay for other modules' MidiQOL.socket() calls.
 * A handler is called as socketlib called it: its arguments, with `this.socketdata.userId` the caller.
 */

/** A socketlib handler, as registered: any arguments (never[] accepts every handler's own) */
export type MidiQueryHandler = (this: { socketdata: { userId?: string } }, ...args: never[]) => unknown;
type Callable = (this: { socketdata: { userId?: string } }, ...args: unknown[]) => unknown;
const handlers = new Map<string, Callable>();
const QUERY = "midi-qol.call";

/** A handler midi registers with socketlib, run by the midi-qol.call query too */
export function registerMidiQuery(name: string, handler: MidiQueryHandler): void {
  // Called with the arguments its caller passed, as socketlib called it
  handlers.set(name, handler as unknown as Callable);
  CONFIG.queries[QUERY] ??= async (data: { name: string, args: unknown[], userId?: string }) => {
    const handler = handlers.get(data?.name);
    if (!handler) throw new Error(`midi-qol | ${data?.name} is not a midi query`);
    const args = (data.args ?? []).map(arg => mapOptions(arg, decodeWorkflowOptions));
    return mapOptions(await handler.call({ socketdata: { userId: data.userId } }, ...args), encodeWorkflowOptions);
  };
}

/**
 * Run `name` on `user`'s client: its handler directly when that is this client (socketlib did the same), else a
 * Foundry query. Throws what the handler throws, or Foundry's error for an inactive user.
 * `CONFIG.debug.midiQueriesViaServer` sends a query to oneself through the server too (tests).
 */
export async function queryUser(user: User.Implementation | null | undefined, name: string, ...args: unknown[]): Promise<any> {
  if (!user) throw new Error(`midi-qol | ${name}: no user to ask`);
  const handler = handlers.get(name);
  if (!handler) throw new Error(`midi-qol | ${name} is not a midi query`);
  const viaServer = !!(CONFIG.debug as { midiQueriesViaServer?: boolean }).midiQueriesViaServer;
  // As a remote call sees them: through the codec (socketlib's wrapper did the same for a call to oneself)
  const roundTrip = (value: unknown) => mapOptions(mapOptions(value, encodeWorkflowOptions), decodeWorkflowOptions);
  if (user.isSelf && !viaServer) return roundTrip(await handler.call({ socketdata: { userId: game.user?.id } }, ...args.map(roundTrip)));
  const result = await user.query(QUERY, { name, args: args.map(arg => mapOptions(arg, encodeWorkflowOptions)), userId: game.user?.id });
  return mapOptions(result, decodeWorkflowOptions);
}

/** Each of `users`, not awaited: a broadcast (the player waits' messages); a failure is logged */
export function queryEach(users: Iterable<User.Implementation>, name: string, ...args: unknown[]): void {
  for (const user of users) {
    if (!user.active) continue;
    queryUser(user, name, ...args).catch(err => console.warn(`midi-qol | ${name} to ${user.name} failed`, err));
  }
}
