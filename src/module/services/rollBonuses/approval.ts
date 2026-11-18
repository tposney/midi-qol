import type { BonusCandidate, BonusContext } from "./service.js";

/*
 * rollBonuses stage 8: approval of a bonus that belongs to someone else (another player's inspiration, an ally's
 * feature). A candidate brings its own `approve` (CAT's request), or names an `approver` actor whose player is asked
 * through a Foundry query. No player online for that actor, or the roller owning it, approves at once; a time-out or
 * an error declines.
 */

export const BONUS_APPROVAL_QUERY = "midi-qol.bonusApproval";
const APPROVAL_TIMEOUT_MS = 30_000;

/** The query a player answers: may this bonus of theirs be used? */
export function registerBonusApprovalQuery() {
  CONFIG.queries[BONUS_APPROVAL_QUERY] = async ({ label, actorName, requester }: { label: string, actorName: string, requester: string }) => {
    const esc = foundry.utils.escapeHTML;
    const answer = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n?.localize("midi-qol.BonusApproval.Title") ?? "Bonus" },
      content: `<p>${game.i18n?.format("midi-qol.BonusApproval.Content", { requester: esc(requester), label: esc(label), actor: esc(actorName) })}</p>`
    });
    return answer === true;
  };
}

/** Whether a chosen bonus may be applied. */
export async function approveBonus(bonus: BonusCandidate, ctx: BonusContext): Promise<boolean> {
  try {
    if (bonus.approve) return !!(await bonus.approve(ctx));
    if (!bonus.approver) return true;
    const actor = fromUuidSync(bonus.approver);
    if (!(actor instanceof Actor)) return false;
    const owner = game.users?.find(user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"));
    if (!owner || owner.isSelf) return true;
    return !!(await owner.query(BONUS_APPROVAL_QUERY, { label: bonus.label, actorName: actor.name, requester: game.user?.name ?? "" }, { timeout: APPROVAL_TIMEOUT_MS }));
  } catch {
    return false;
  }
}
