import type { Workflow } from "../../Workflow.js";
import { playerForActor } from "../../utils.js";
import { configSettings } from "../../settings.js";
import { getDistance } from "../../services/distance/service.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "../requests.js";
import { entryState, registerAction, runEvent, setEntryState, type ActionRun } from "./engine.js";
import { targetContext } from "./useEvents.js";

/*
 * M29 redirection (plan ~/Documents/midi-next-M29-plan-2026-11-21.md). `{ retarget: { to, by?, orLose? } }` at a
 * target event (the target the event is about):
 * - targeted: the target is replaced in the use at once (the new one then has its own targeted event);
 * - attacked, hit: the replacement waits for the hit check (Workflow.checkHits takes it), which checks the same roll
 *   against the new target, with its own attacked event and reaction window; `to: "none"` at hit is a miss.
 * `to`: "bearer" / "self" (the entry's holder), a token uuid, or "none". Once per target per use; not for area uses.
 */

export type RetargetTo = TokenDocument.Implementation | "none";

interface Pending { to: RetargetTo, label: string, at: string }

const pending = new WeakMap<Workflow, Map<string, Pending>>();
/** Targets redirected from or to in the use: each only once */
const touched = new WeakMap<Workflow, Set<string>>();

function touchedOf(workflow: Workflow): Set<string> {
  let set = touched.get(workflow);
  if (!set) touched.set(workflow, set = new Set(workflow.redirections.flatMap(r => [r.from, r.to ?? ""]).filter(Boolean)));
  return set;
}

/** The redirection the hit check should make for the target (taken: it is made once) */
export function takeRetarget(workflow: Workflow, target: TokenDocument.Implementation): Pending | undefined {
  const uuid = target.uuid;
  const found = uuid ? pending.get(workflow)?.get(uuid) : undefined;
  if (found && uuid) pending.get(workflow)!.delete(uuid);
  return found;
}

/** Make a pending redirection: the target replaced by the new one (or dropped / missed), recorded on the use */
export function applyRetarget(workflow: Workflow, from: TokenDocument.Implementation, redirection: Pending): TokenDocument.Implementation | undefined {
  const to = redirection.to === "none" ? undefined : redirection.to;
  workflow.redirect(from, to, { label: redirection.label, at: redirection.at });
  return to;
}

function tokenOfActor(actor: Actor.Implementation | undefined, scene: Scene.Implementation | null | undefined): TokenDocument.Implementation | undefined {
  if (!actor) return undefined;
  const tokens = actor.getActiveTokens(false, true) as TokenDocument.Implementation[];
  return tokens.find(t => t.parent === scene) ?? tokens[0];
}

/** The attacker picks another target, on their own client */
export const CHOOSE_TARGET_REQUEST = "midi-qol.chooseTarget";

interface ChooseData { title: string, prompt: string, candidates: { uuid: string, name: string }[], canLose: boolean }

/** On the asked client: a new target's uuid, "lose", or undefined (closed) */
async function chooseTargetHere(data: ChooseData, request?: IncomingRequest): Promise<string | undefined> {
  const options = data.candidates.map((c, i) => `<label class="checkbox"><input type="radio" name="target" value="${c.uuid}" ${i === 0 ? "checked" : ""}> ${foundry.utils.escapeHTML(c.name)}</label>`);
  if (data.canLose) options.push(`<label class="checkbox"><input type="radio" name="target" value="lose" ${options.length ? "" : "checked"}> ${foundry.utils.escapeHTML(game.i18n?.localize("midi-qol.Redirect.Lose") ?? "Lose it")}</label>`);
  const picked = await foundry.applications.api.DialogV2.input({
    window: { title: data.title },
    content: `<p>${foundry.utils.escapeHTML(data.prompt)}</p>${options.join("")}`,
    rejectClose: false,
    render: (_event: Event, dialog: foundry.applications.api.DialogV2) => { request?.onSettled(() => { void dialog.close(); }); }
  }) as { target?: string } | null;
  if (request && (request.settledHow || !await request.claim())) return undefined;
  return picked?.target;
}

/** The tokens the attacker could aim the use at instead: on the scene, within the use's range, not in it or redirected */
function candidatesFor(workflow: Workflow, from: TokenDocument.Implementation): TokenDocument.Implementation[] {
  const attacker = (workflow.token as { document?: TokenDocument.Implementation } | undefined)?.document ?? (workflow.token as TokenDocument.Implementation | undefined);
  const scene = from.parent;
  if (!attacker || !scene) return [];
  const range = workflow.activity?.range as { units?: string, value?: number | string, long?: number | string, reach?: number } | undefined;
  const reach = Number(range?.reach) || 5;
  const limit = range?.units === "touch" ? reach : range?.units === "ft" ? Number(range.long || range.value) || reach : Infinity;
  const seen = touchedOf(workflow);
  return scene.tokens.contents.filter(token => !!token.actor && token !== from && token !== attacker && !workflow.targets.has(token)
    && !(token.uuid && seen.has(token.uuid)) && (() => { const d = getDistance(attacker, token, { wallsBlock: false }); return d >= 0 && d <= limit; })());
}

/** `to: "choose"`: asked of the attacker's user (the GM's, or here); "lose" or no choice with orLose: none */
async function chooseTarget(run: ActionRun, from: TokenDocument.Implementation, orLose: boolean, label: string): Promise<RetargetTo | undefined> {
  const workflow = run.context.workflow!;
  const candidates = candidatesFor(workflow, from);
  const data: ChooseData = {
    title: `${workflow.actor?.name ?? ""}: ${label}`,
    prompt: game.i18n?.format("midi-qol.Redirect.Prompt", { target: from.name ?? "", what: workflow.activity?.name ?? workflow.item?.name ?? "" })
      ?? `Choose a new target for ${workflow.item?.name ?? ""} instead of ${from.name}`,
    candidates: candidates.map(token => ({ uuid: token.uuid!, name: token.name ?? token.actor?.name ?? "" })),
    canLose: orLose
  };
  if (!data.candidates.length) return orLose ? "none" : undefined;
  const user = (playerForActor(workflow.actor) as User.Implementation | undefined) ?? game.users?.activeGM ?? undefined;
  const answer = !user || user.isSelf || !user.active ? await chooseTargetHere(data)
    : await askUser<string | undefined>(user, {
      type: CHOOSE_TARGET_REQUEST, data, kind: "target", actorUuid: workflow.actor?.uuid ?? undefined, label: data.title,
      timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000, fallback: () => orLose ? "lose" : undefined
    }).settled.then(settled => settled.value, () => undefined);
  if (answer === "lose" || (!answer && orLose)) return "none";
  const chosen = answer ? fromUuidSync(answer, { strict: false }) : undefined;
  return chosen instanceof TokenDocument ? chosen as TokenDocument.Implementation : undefined;
}

function resolveTo(run: ActionRun, spec: string, from: TokenDocument.Implementation): RetargetTo | undefined {
  if (spec === "none") return "none";
  if (spec === "bearer" || spec === "self") return tokenOfActor(run.found.actor, from.parent);
  const document = fromUuidSync(spec, { strict: false });
  return document instanceof TokenDocument ? document as TokenDocument.Implementation : undefined;
}

const REDIRECT_EVENTS = new Set(["targeted", "attacked", "hit"]);

async function retargetAction(run: ActionRun) {
  const workflow = run.context.workflow;
  const from = run.context.target;
  const spec = run.action.retarget as { to?: string, orLose?: boolean } | string | undefined;
  const toSpec = typeof spec === "string" ? spec : spec?.to;
  const orLose = typeof spec === "object" && !!spec?.orLose;
  const label = typeof run.action.label === "string" ? run.action.label : (run.found.document as { name?: string }).name ?? run.found.entry.id;
  if (!workflow || !from?.uuid || !toSpec) return;
  if (!REDIRECT_EVENTS.has(run.eventId)) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: retarget at ${run.eventId} (targeted, attacked or hit only)`);
    return;
  }
  if (workflow.activity?.target?.template?.type) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: an area use is not redirected`);
    return;
  }
  const seen = touchedOf(workflow);
  if (seen.has(from.uuid)) return;
  const to = toSpec === "choose" ? await chooseTarget(run, from, orLose, label) : resolveTo(run, toSpec, from);
  if (!to && toSpec === "choose") return;
  if (!to) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: no target "${toSpec}" to redirect to`);
    return;
  }
  if (to !== "none" && (to === from || (to.uuid && seen.has(to.uuid)))) return;
  seen.add(from.uuid);
  if (to !== "none" && to.uuid) seen.add(to.uuid);
  const redirection: Pending = { to, label, at: run.eventId };
  if (run.eventId === "targeted") {
    // Before any roll: the new target is the use's now, and has its own targeted event
    const newTarget = applyRetarget(workflow, from, redirection);
    const context = newTarget ? targetContext(workflow, newTarget) : undefined;
    if (context) await runEvent("targeted", context);
    return { success: true };
  }
  let byTarget = pending.get(workflow);
  if (!byTarget) pending.set(workflow, byTarget = new Map());
  byTarget.set(from.uuid, redirection);
  return { success: true };
}

/**
 * `{ state: { key: value } }`: the entry's state on its effect (`@entry.counts.<key>` in its formulas and conditions): a
 * number sets, "+n" / "-n" adds (Mirror Image's destroyed duplicates).
 */
async function stateAction(run: ActionRun) {
  const effect = run.found.document;
  const spec = run.action.state as Record<string, unknown> | undefined;
  if (!(effect instanceof ActiveEffect) || !spec || typeof spec !== "object") return;
  const state = entryState(effect, run.found.entry.id);
  for (const [key, value] of Object.entries(spec)) {
    if (typeof value === "number") state[key] = value;
    else if (typeof value === "string" && /^[+-]\d+$/.test(value.trim())) state[key] = (state[key] ?? 0) + Number(value.trim());
  }
  await setEntryState(effect, run.found.entry.id, state);
  // The counts this entry's later actions read (an `end` after it)
  const counts = (run.conditionData.entry as { counts?: Record<string, number> } | undefined);
  if (counts) counts.counts = { ...state };
}

export function registerRedirection() {
  registerRequestHandler(CHOOSE_TARGET_REQUEST, (data: ChooseData, request: IncomingRequest) => chooseTargetHere(data, request));
  registerAction("retarget", retargetAction);
  registerAction("state", stateAction);
}
