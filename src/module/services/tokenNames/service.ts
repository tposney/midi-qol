import { defineService, reportServiceProblem } from "../../api/services.js";
import { configSettings, safeGetGameSetting } from "../../settings.js";
import type { TokenOrDocument } from "../../../globals.js";

/*
 * tokenNames (single): the name a user is shown for a token. The GM and the token's owners always see its name; for
 * other users the active provider decides (callers check that, as getTokenPlayerNameForUser and the card's names do),
 * answering the name to show, or undefined for the token's own name. midi's default provider follows the name-hiding
 * module active when the name is asked (Anonymous, else Hide NPC Names), else midi's "Hide NPC names" setting. A module
 * registers its own to decide instead.
 *
 *   MidiQOL.services.register("tokenNames", "my-module", {
 *     shownName: ({ token, user }) => MyNames.forUser(token, user)
 *   }, { priority: 30 });
 *
 * Module code gets the name a user should see with MidiQOL.getTokenPlayerNameForUser(user, token) (or
 * MidiQOL.getTokenPlayerName(token) for this user), which ask this service.
 */

export interface TokenNameQuery {
  token: TokenDocument.Implementation;
  user: User.Implementation;
}

export interface TokenNamesProvider {
  /** The name `user` is shown for `token`; undefined: its own name */
  shownName?(query: TokenNameQuery): string | undefined;
}

declare module "../../api/services.js" {
  interface MidiServices { tokenNames: TokenNamesProvider }
}

export let tokenNamesService: ReturnType<typeof defineService<TokenNamesProvider>>;

function documentOf(token: TokenOrDocument): TokenDocument.Implementation {
  return token instanceof TokenDocument ? token : token.document;
}

/**
 * midi's default: the name-hiding module active when asked (Anonymous, else Hide NPC Names), else "Hide NPC names"
 * (tokens without a player owner are shown the setting's text)
 */
function midiShownName(query: TokenNameQuery): string | undefined {
  if (game.modules.get("anonymous")?.active) return anonymousShownName(query);
  if (game.modules.get("hide-npc-names")?.active) return hideNpcNamesShownName(query);
  if (configSettings.hideNPCNames && !query.token.actor?.hasPlayerOwner) return configSettings.hideNPCNames;
  return undefined;
}

/** Anonymous's own rule (its API) */
function anonymousShownName({ token }: TokenNameQuery): string | undefined {
  // @ts-expect-error
  const api: any = game.modules.get("anonymous")?.api;
  return api?.playersSeeName(token.actor) ? undefined : api?.getName(token.actor) as string;
}

/** Hide NPC Names's rule (its actor flags and settings) */
function hideNpcNamesShownName({ token }: TokenNameQuery): string | undefined {
  return getPlayerNPCNameHideNPCNAmes(token);
}

export function defineTokenNamesService() {
  tokenNamesService = defineService<TokenNamesProvider>("tokenNames", {
    kind: "single",
    description: "The name a user is shown for a token (name hiding)"
  });
  tokenNamesService.register("midi-qol", { shownName: midiShownName }, { label: "Midi-QOL: Anonymous, Hide NPC Names or Hide NPC names", priority: 0 });
}

/** The active provider's name for `token` shown to `user` (default: this user); undefined: its own name */
export function shownTokenName(token: TokenOrDocument | null | undefined, user: User.Implementation | null | undefined = game.user): string | undefined {
  if (!token || !user) return undefined;
  const document = documentOf(token);
  const provider = tokenNamesService?.get();
  if (!provider?.shownName) return undefined;
  try {
    const name = provider.shownName({ token: document, user });
    return typeof name === "string" && name ? name : undefined;
  } catch (err) {
    reportServiceProblem("tokenNames", "active provider", "shownName failed; the token's own name is shown", err);
    return undefined;
  }
}


function getPlayerNPCNameHideNPCNAmes(token: TokenOrDocument): string | undefined {
  const actorFlags: any = foundry.utils.getProperty(token.actor ?? {}, "flags.hide-npc-names");
  if (actorFlags?.nameHiddenOverride === true) return actorFlags.replacementNameOverride as string;
  if (actorFlags?.nameHiddenOverride === false) return undefined;
  /*
    hideHostile: "hideHostileNames",
    hideNeutral: "hideNeutralNames",
    hideFriendly: "hideFriendlyNames",
    hideSecret: "hideSecretNames",
    hostileNameReplacement: "hostileNameReplacement",
    neutralNameReplacement: "neutralNameReplacement",
    friendlyNameReplacement: "friendlyNameReplacement",
    secretNameReplacement: "secretNameReplacement",
    tokenHiddenSuffix: "tokenHiddenSuffix",
    hideParts: "hideParts",
    showOnActorDirectory: "showOnActorDirectory"
  */
  if (actorFlags === undefined) {
    let hideSetting: boolean;
    switch ((token instanceof TokenDocument ? token : token.document).disposition) {
      case CONST.TOKEN_DISPOSITIONS.FRIENDLY:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideFriendlyNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "friendlyNameReplacement") as string;
        break;
      case CONST.TOKEN_DISPOSITIONS.HOSTILE:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideHostileNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "hostileNameReplacement") as string;
        break;
      case CONST.TOKEN_DISPOSITIONS.SECRET:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideSecretNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "secretNameReplacement") as string;
        break;
      case CONST.TOKEN_DISPOSITIONS.NEUTRAL:
        hideSetting = safeGetGameSetting("hide-npc-names", "hideNeutralNames");
        if (hideSetting) return safeGetGameSetting("hide-npc-names", "neutralNameReplacement") as string;
        break;
    }
  }
  return undefined;
}
