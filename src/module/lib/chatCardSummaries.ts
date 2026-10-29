import { MODULE_ID } from "../../midi-qol.js";
import { configSettings } from "../settings.js";

/**
 * Chat card summaries (world): whether a card's save and check messages are folded into it, for everyone or as each
 * user chooses with dnd5e's "Summarize chat cards" (a client setting). Forced, each client's dnd5e setting is set to
 * match, and the user's own value kept to put back when the GM returns the choice to them.
 */

const OWN_VALUE = "ownChatCardSummary";

export function registerChatCardSummariesSetting() {
  // The user's own "Summarize chat cards" while midi forces it ("": not forced)
  game.settings.register(MODULE_ID, OWN_VALUE, { scope: "client", config: false, type: String, default: "" });
  Hooks.once("ready", () => { void applyChatCardSummaries(); });
}

export async function applyChatCardSummaries() {
  if (!game.ready || !game.settings.settings.has("dnd5e.chatCardSummary")) return;
  const mode = configSettings.chatCardSummaries ?? "client";
  const current = game.settings.get("dnd5e", "chatCardSummary") as boolean;
  const own = game.settings.get(MODULE_ID, OWN_VALUE) as string;
  let wanted: boolean;
  if (mode === "client") {
    if (own === "") return;
    wanted = own === "true";
    await game.settings.set(MODULE_ID, OWN_VALUE, "");
  } else {
    if (own === "") await game.settings.set(MODULE_ID, OWN_VALUE, String(current));
    wanted = mode === "always";
  }
  if (wanted === current) return;
  await game.settings.set("dnd5e", "chatCardSummary", wanted);
  // Messages already shown were drawn with the old value
  ui.chat?.render({ force: true });
}
