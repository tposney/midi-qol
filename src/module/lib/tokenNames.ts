/**
 * A token's name as the viewing user may see it (midi's player-name rules: Anonymous, Hide NPC Names, *Hide NPC
 * names*; the GM and the token's owners see its name). One rule, reached three ways:
 * - `@MidiTokenName[uuid]{fallback}` in enriched text (message content, card notes, journals);
 * - `{{midi-token-name uuid fallback}}` in templates, which are rendered per viewer;
 * - `data-midi-token-uuid` on markup midi doesn't render itself (a note renderer's output): renamed as the card is drawn.
 */

import { displayTokenName, getTokenName } from "../utils.js";

/** The token's name as stored: the fallback given, else the token's (or actor's) own name. */
function storedName(uuid: string, fallback?: string): string {
  if (fallback) return fallback;
  const document = fromUuidSync(uuid, { strict: false });
  if (document instanceof TokenDocument) return getTokenName(document);
  return document instanceof Actor ? document.name ?? "" : "";
}

/** The name this user may see of the token (or actor) with this uuid. */
export function tokenName(uuid: string, fallback?: string): string {
  return displayTokenName(uuid, storedName(uuid, fallback));
}

/** The token's name for this user, marked so the card renames it for each viewer it is drawn for. */
export function tokenNameMarkup(uuid: string, fallback?: string): string {
  return `<span data-midi-token-uuid="${uuid}">${foundry.utils.escapeHTML(tokenName(uuid, fallback))}</span>`;
}

/** Rename marked names as this user may see them. */
export function renameMarkedTokens(html: HTMLElement) {
  html.querySelectorAll<HTMLElement>("[data-midi-token-uuid]").forEach(el => {
    el.textContent = displayTokenName(el.dataset.midiTokenUuid, el.textContent?.trim() ?? "");
  });
}

export function setupTokenNames() {
  CONFIG.TextEditor.enrichers.push({
    pattern: /@MidiTokenName\[([^\]]+)\](?:\{([^}]*)\})?/g,
    enricher: async (match: RegExpMatchArray) => {
      const span = document.createElement("span");
      span.dataset.midiTokenUuid = match[1];
      span.textContent = tokenName(match[1], match[2]);
      return span;
    }
  });
  Handlebars.registerHelper("midi-token-name", (uuid: unknown, fallback: unknown) =>
    typeof uuid === "string" && uuid ? tokenName(uuid, typeof fallback === "string" ? fallback : undefined) : (typeof fallback === "string" ? fallback : ""));
}
