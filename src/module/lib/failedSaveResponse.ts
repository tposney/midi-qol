import type { Activity } from "../../globals.js";
import { bonusCheck } from "../patching.js";
import { asyncHooksCall, promptReactions, reactionDialog, reactionStandingRows, type ReactionItemReference, type ReactionResult, type ReactionStandingRow, type ResponseOfferChoice } from "../utils.js";
import { activityCostBadges, type PromptResponses, type PromptRow } from "./promptCosts.js";
import { ASK_ONLY_CHOICES, REACTION_CHOICES, setStandingChoice, standingChoiceOptions } from "../services/rollBonuses/standing.js";
import type { IncomingRequest } from "./requests.js";

/*
 * M32a step 3 (plan ~/Documents/midi-next-M32-plan-2026-11-22.md): a failed save's bonuses and its saveFailed reactions
 * in one request and one prompt, answered on the player's client. The bonuses are applied first (the bonus engine, so a
 * reroll's dice are on the player's screen), the save is re-checked against its DC, and the ticked reactions are taken
 * only if it still fails (a reaction dropped spends nothing). The answer carries the changed roll.
 */

export interface FailedSaveBonusSpec { result: string, rollType: string, selector: string, dc: number }

function rowFor(standing: ReactionStandingRow | undefined, row: Omit<PromptRow, "standingKey" | "standingLabel" | "choice" | "choices" | "checked">): PromptRow {
  if (!standing) return row;
  return {
    ...row,
    checked: standing.choice === "always" || standing.choice === "next",
    standingKey: standing.standingKey, standingLabel: standing.label, choice: standing.choice,
    choices: standingChoiceOptions(standing.askOnly ? ASK_ONLY_CHOICES : REACTION_CHOICES)
  };
}

export async function promptFailedSave(tokenUuid: string, refs: ReactionItemReference[], triggerTokenUuid: string | undefined, flavor: string,
  triggerType: string, options: { failedSaveBonus?: FailedSaveBonusSpec, incoming?: IncomingRequest, reactionOffers?: ResponseOfferChoice[], [key: string]: unknown }): Promise<ReactionResult | undefined> {
  const { failedSaveBonus: spec, ...rest } = options;
  const actor = (fromUuidSync(tokenUuid) as TokenDocument.Implementation | null)?.actor;
  if (!actor || !spec) return promptReactions(tokenUuid, refs, triggerTokenUuid, flavor, triggerType, rest);
  const incoming = options.incoming;

  let activities: Activity[] = [];
  for (const ref of refs) {
    const uuid = typeof ref === "string" ? ref : "uuid" in ref ? ref.uuid : undefined;
    const activity = uuid ? await fromUuid(uuid) as unknown as Activity | null : null;
    if (activity) activities.push(activity);
  }
  let offers: ResponseOfferChoice[] = Array.isArray(options.reactionOffers) ? options.reactionOffers : [];
  // A hook that cancels the reactions leaves the bonuses
  if ((activities.length || offers.length) && await asyncHooksCall("midi-qol.ReactionFilter", activities, rest, triggerType, refs) === false) {
    activities = [];
    offers = [];
  }
  const standing = reactionStandingRows(actor, activities, offers);
  const shownActivities = activities.filter(activity => standing.rows.get(activity.uuid)?.choice !== "never");
  const shownOffers = offers.filter(offer => standing.rows.get(offer.key)?.choice !== "never");
  const responses: PromptResponses = {
    rows: [
      ...shownActivities.map(activity => {
        const cost = activityCostBadges(activity);
        return rowFor(standing.rows.get(activity.uuid), { id: activity.uuid, label: foundry.utils.escapeHTML(`${activity.item?.name ?? ""}: ${activity.name ?? ""}`), img: activity.item?.img ?? undefined,
          badges: cost.badges, exclusive: cost.reaction ? "reaction" : undefined });
      }),
      ...shownOffers.map(offer => rowFor(standing.rows.get(offer.key), { id: offer.key, label: foundry.utils.escapeHTML(offer.label), img: offer.img, tooltip: offer.description,
        badges: offer.badges ?? [], exclusive: offer.reaction ? "reaction" : undefined }))
    ]
  };

  const roll = await bonusCheck(actor, Roll.fromJSON(spec.result) as Roll, spec.rollType, spec.selector, {}, { request: incoming, responses });
  // Answered for the player meanwhile (the time-out, the GM): nothing from here is used
  if (incoming?.settledHow) return undefined;
  const savePart = { saveRoll: JSON.stringify(roll.toJSON()), saveSucceeded: (roll.total ?? 0) >= spec.dc };
  if (savePart.saveSucceeded || responses.shown) {
    if (incoming && !(await incoming.claim())) return undefined;
    if (savePart.saveSucceeded) return { name: "None", ...savePart };
    const keys = responses.chosen ?? [];
    const chosenActivities = shownActivities.filter(activity => keys.includes(activity.uuid));
    const chosenOffers = shownOffers.filter(offer => keys.includes(offer.key));
    if (!chosenActivities.length && !chosenOffers.length) return { name: "None", ...savePart };
    const result = await reactionDialog(actor, triggerTokenUuid, chosenActivities, flavor, triggerType,
      { ...rest, tokenUuid, reactionOffers: chosenOffers, standing: { rows: standing.rows, skipDialog: true, chosenByPlayer: true } }) as ReactionResult;
    const taken = new Set<string>([...(result.offerKeys ?? (result.offerKey ? [result.offerKey] : [])), ...(result.uuid ? [result.uuid] : [])]);
    for (const [key, row] of standing.rows) if (row.choice === "next" && taken.has(key)) await setStandingChoice(actor, row.standingKey, "ask", row.label);
    return { ...result, ...savePart };
  }
  // The rows weren't shown (a provider that answers itself, no bonus left to offer): the reactions
  // in their own prompt, after the bonuses
  const result = shownActivities.length || shownOffers.length
    ? await promptReactions(tokenUuid, refs, triggerTokenUuid, flavor, triggerType, rest) as ReactionResult | undefined : { name: "None" };
  return { ...(result ?? { name: "None" }), ...savePart };
}
