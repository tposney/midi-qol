/*
 * midi-next's compatibility line (M5; memory midi-next-compat-line): midi-next is 15.x, but stands in for midi-qol
 * 14.x for other modules, so it keeps the 14.x line's deprecations with their 14.x since/until. One internal world
 * setting names the 14.x release whose state it matches. A deprecation warns while the line is before its `until`;
 * at or past it the deprecated thing is gone, as it is in that release. Raising the line follows the 14.x releases.
 * Deprecations new to midi-next are dated in 15.x and don't depend on the line.
 */

/** The 14.x releases midi-next can match, oldest first */
export const COMPATIBILITY_LINES = ["14.7.0", "14.8.0", "14.9.0"] as const;
export type CompatibilityLine = typeof COMPATIBILITY_LINES[number];
const DEFAULT_LINE: CompatibilityLine = "14.7.0";
const SETTING = "compatibilityLine";

let line: CompatibilityLine = DEFAULT_LINE;

/** At init, before anything reads the line (token set mode, deprecations): a change takes effect on reload */
export function setupCompatibilityLine(): void {
  game.settings.register("midi-qol", SETTING, {
    scope: "world", type: String, config: false, default: DEFAULT_LINE, requiresReload: true
  });
  const stored = game.settings.get("midi-qol", SETTING) as string;
  line = (COMPATIBILITY_LINES as readonly string[]).includes(stored) ? stored as CompatibilityLine : DEFAULT_LINE;
}

/** The 14.x release whose deprecation state midi-next matches */
export function compatibilityLine(): CompatibilityLine {
  return line;
}

/** For tests: the line for this session only (not stored) */
export function setCompatibilityLineForSession(value: CompatibilityLine): void {
  line = value;
}

/** A 14.x deprecation whose `until` the line has reached: gone, as in that release. Other untils never are. */
export function isRemoved(until: string | undefined): boolean {
  if (!until || !/^14\.\d+\.\d+$/.test(until)) return false;
  return !foundry.utils.isNewerVersion(until, line);
}

/**
 * A deprecated thing being used: warns (Foundry's compatibility warning) while the line is before its `until` and
 * returns true; returns false, without a warning, once the line has reached it: the caller then acts as that release
 * does (a getter gives undefined, a function throws, a setter does nothing).
 */
export function deprecation(message: string, options: { since: string, until?: string, once?: boolean, details?: string }): boolean {
  if (isRemoved(options.until)) return false;
  foundry.utils.logCompatibilityWarning(message, options);
  return true;
}

/** What a removed function throws: its name and what replaces it */
export function removedError(what: string, until: string, instead: string): Error {
  return new Error(`midi-qol | ${what} was removed in ${until}: ${instead}`);
}
