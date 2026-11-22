import type { BonusCandidate, BonusContext } from "./service.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "../../lib/requests.js";
import { configSettings } from "../../settings.js";

/*
 * rollBonuses stage 8: approval of a bonus that belongs to someone else (another player's inspiration, an ally's
 * feature). A candidate brings its own `approve` (CAT's request), or names an `approver` actor whose player is asked.
 * M32b: asked through the request core (its deadline is the reaction timeout, shown on the player's dialog; the GM
 * approves or declines for them from the player list). No player online for that actor, or the roller owning it,
 * approves at once; a time-out, a disconnect or an error declines.
 */

/** Kept for other modules that ask it directly; midi asks through BONUS_APPROVAL_REQUEST */
export const BONUS_APPROVAL_QUERY = "midi-qol.bonusApproval";
export const BONUS_APPROVAL_REQUEST = "midi-qol.bonusApprovalRequest";
const APPROVAL_TIMEOUT_MS = 30_000;

type ApprovalData = { label: string, actorName: string, requester: string };

/** The approval dialog on the player's client: the request's countdown shown, closed when it is answered for them */
async function approvalDialog(data: ApprovalData, incoming?: IncomingRequest): Promise<boolean | undefined> {
  const esc = foundry.utils.escapeHTML;
  let dialog: { close(): unknown } | undefined;
  incoming?.onSettled(() => void dialog?.close());
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n?.localize("midi-qol.BonusApproval.Title") ?? "Bonus" },
    content: `<p>${game.i18n?.format("midi-qol.BonusApproval.Content", { requester: esc(data.requester), label: esc(data.label), actor: esc(data.actorName) })}</p>`,
    buttons: [
      { action: "yes", label: game.i18n?.localize("Yes") ?? "Yes", default: true },
      { action: "no", label: game.i18n?.localize("No") ?? "No" }
    ],
    rejectClose: false,
    render: (_event: Event, app: { element: HTMLElement, close(): unknown }) => { dialog = app; incoming?.countdown()?.attach(app.element); }
  });
  if (incoming?.settledHow) return undefined;
  if (incoming && !(await incoming.claim())) return undefined;
  return answer === "yes";
}

/** The query a player answers: may this bonus of theirs be used? */
export function registerBonusApprovalQuery() {
  CONFIG.queries[BONUS_APPROVAL_QUERY] = async (data: ApprovalData) => (await approvalDialog(data)) === true;
  registerRequestHandler(BONUS_APPROVAL_REQUEST, (data: ApprovalData, incoming: IncomingRequest) => approvalDialog(data, incoming));
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
    const data: ApprovalData = { label: bonus.label, actorName: actor.name ?? "", requester: game.user?.name ?? "" };
    const request = askUser<boolean>(owner, {
      type: BONUS_APPROVAL_REQUEST, data, kind: "approval", actorUuid: actor.uuid ?? undefined,
      label: game.i18n?.format("midi-qol.BonusApproval.Content", { requester: data.requester, label: data.label, actor: data.actorName }) ?? data.label,
      timeoutMs: ((configSettings.reactionTimeout ?? 0) * 1000) || APPROVAL_TIMEOUT_MS,
      fallback: () => false,
      gmChoices: { approve: () => true, decline: () => false }
    });
    return await request.settled.then(settled => settled.value === true, () => false);
  } catch {
    return false;
  }
}
