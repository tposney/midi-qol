import type { Activity } from "../../globals.js";
import { activityCostBadges, wirePickOne, type PromptRow } from "./promptCosts.js";
import { asyncHooksCall, offersThatMatter, promptReactions, reactionDialog, reactionStandingRows, type ReactionItemReference, type ReactionResult, type ReactionStandingRow, type ResponseOfferChoice } from "../utils.js";
import { ASK_ONLY_CHOICES, REACTION_CHOICES, setStandingChoice, standingChoiceOptions, wireStandingSelects } from "../services/rollBonuses/standing.js";
import type { IncomingRequest } from "./requests.js";
import { safeGetGameSetting } from "../settings.js";

/*
 * M32a step 4 (plan ~/Documents/midi-next-M32-plan-2026-11-22.md): several creatures' reactions asked of one user at
 * one event, in one prompt with a section per creature. Each creature's reaction rows are one choice of their own (a
 * familiar and its master each have a reaction). The prompt only chooses; each creature's choice is then taken as its
 * own prompt would have (reactionDialog with the chosen rows).
 */

export interface ReactionSection {
  tokenUuid: string;
  reactionActivityList: ReactionItemReference[];
  triggerTokenUuid?: string;
  reactionFlavor: string;
  triggerType: string;
  options: { incoming?: IncomingRequest, reactionOffers?: ResponseOfferChoice[], [key: string]: unknown };
}

interface Prepared {
  section: ReactionSection;
  actor: Actor.Implementation;
  activities: Activity[];
  offers: ResponseOfferChoice[];
  rows: Map<string, ReactionStandingRow>;
}

const decided = (row: ReactionStandingRow | undefined) => row?.choice === "always" || row?.choice === "next";

async function prepare(section: ReactionSection): Promise<Prepared | undefined> {
  const actor = (fromUuidSync(section.tokenUuid) as TokenDocument.Implementation | null)?.actor;
  if (!actor) return undefined;
  let activities: Activity[] = [];
  for (const ref of section.reactionActivityList ?? []) {
    const uuid = typeof ref === "string" ? ref : "uuid" in ref ? ref.uuid : undefined;
    const activity = uuid ? await fromUuid(uuid) as unknown as Activity | null : null;
    if (activity) activities.push(activity);
  }
  let offers: ResponseOfferChoice[] = offersThatMatter(Array.isArray(section.options.reactionOffers) ? section.options.reactionOffers : []);
  if ((activities.length || offers.length) && await asyncHooksCall("midi-qol.ReactionFilter", activities, section.options, section.triggerType, section.reactionActivityList) === false) {
    activities = [];
    offers = [];
  }
  const { rows } = reactionStandingRows(actor, activities, offers);
  return {
    section, actor, rows,
    activities: activities.filter(activity => rows.get(activity.uuid)?.choice !== "never"),
    offers: offers.filter(offer => rows.get(offer.key)?.choice !== "never")
  };
}

/** The rows of one creature's section, keyed `<section>|<match key>` */
function sectionRows(prepared: Prepared, index: number): PromptRow[] {
  const exclusive = `reaction:${index}`;
  const actorUuid = prepared.actor.uuid ?? undefined;
  const withStanding = (key: string, row: Omit<PromptRow, "standingKey" | "standingLabel" | "choice" | "choices" | "checked">): PromptRow & { actorUuid?: string } => {
    const standing = prepared.rows.get(key);
    return {
      ...row, actorUuid, checked: decided(standing),
      ...(standing ? { standingKey: standing.standingKey, standingLabel: standing.label, choice: standing.choice, choices: standingChoiceOptions(standing.askOnly ? ASK_ONLY_CHOICES : REACTION_CHOICES) } : {})
    };
  };
  return [
    ...prepared.activities.map(activity => {
      const cost = activityCostBadges(activity);
      return withStanding(activity.uuid, { id: `${index}|${activity.uuid}`, label: foundry.utils.escapeHTML(`${activity.item?.name ?? ""}: ${activity.name ?? ""}`),
        img: activity.item?.img ?? undefined, badges: cost.badges, exclusive: cost.reaction ? exclusive : undefined });
    }),
    ...prepared.offers.map(offer => withStanding(offer.key, { id: `${index}|${offer.key}`, label: foundry.utils.escapeHTML(offer.label), img: offer.img,
      tooltip: offer.description, badges: offer.badges ?? [], exclusive: offer.reaction ? exclusive : undefined }))
  ];
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The prompt: a section per creature, ticked and applied; it resolves with the ticked row ids (none: declined) */
export class ReactionGroupDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["midi-qol", "reaction", "midi-qol-bonus-prompt"],
    window: { title: "midi-qol.ReactionDialog.Title" },
    position: { width: 440, height: "auto" as const }
  };

  static PARTS = { dialog: { template: "modules/midi-qol/templates/bonus-prompt.hbs" } };

  #entries: object[];
  #content: string;
  #resolve: (ids: string[]) => void;
  #answered = false;
  #incoming: IncomingRequest | undefined;
  #countdown: { attach(element: HTMLElement): void, stop(): void } | undefined;

  constructor(entries: object[], content: string, incoming: IncomingRequest | undefined, resolve: (ids: string[]) => void) {
    super({});
    this.#entries = entries;
    this.#content = content;
    this.#incoming = incoming;
    this.#resolve = resolve;
    this.#countdown = incoming?.countdown() ?? undefined;
    incoming?.onSettled(() => void this.close());
  }

  async _prepareContext(options) {
    return { ...(await super._prepareContext(options)), content: this.#content, entries: this.#entries, skipLabel: "midi-qol.PlayerWaits.Choice.none" };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    wirePickOne(this.element);
    wireStandingSelects(this.element, undefined);
    this.element.querySelector("[data-bonus-action='apply']")?.addEventListener("click", () => {
      this.#answer(Array.from(this.element.querySelectorAll<HTMLInputElement>("input[name='bonus']:checked")).map(input => input.value));
    });
    this.element.querySelector("[data-bonus-action='skip']")?.addEventListener("click", () => this.#answer([]));
    this.#countdown?.attach(this.element);
  }

  #answer(ids: string[]) {
    if (this.#answered) return;
    this.#answered = true;
    this.#countdown?.stop();
    this.#resolve(ids);
    void this.close();
  }

  async close(options?) {
    if (!this.#answered) {
      this.#answered = true;
      this.#resolve([]);
    }
    return super.close(options);
  }
}

/** The group request's handler: one prompt, then each creature's chosen reactions taken; answers in section order */
export async function promptReactionGroup(sections: ReactionSection[], incoming: IncomingRequest | undefined): Promise<(ReactionResult | undefined)[]> {
  const none = (): ReactionResult => ({ name: "None" });
  const prepared = await Promise.all(sections.map(prepare));
  const all = prepared.flatMap((p, index) => p ? [...p.activities.map(a => `${index}|${a.uuid}`), ...p.offers.map(o => `${index}|${o.key}`)] : []);
  if (!all.length) return sections.map(none);
  let ticked: string[];
  let chosenByPlayer = true;
  if (prepared.every(p => !p || [...p.activities.map(a => p.rows.get(a.uuid)), ...p.offers.map(o => p.rows.get(o.key))].every(decided))) {
    // Every row decided (always / next): no prompt
    ticked = all;
    chosenByPlayer = false;
  } else {
    const entries = prepared.flatMap((p, index) => {
      if (!p || (!p.activities.length && !p.offers.length)) return [];
      const token = fromUuidSync(p.section.tokenUuid) as TokenDocument.Implementation | null;
      return [{ heading: token?.name ?? p.actor.name ?? "", img: token?.texture?.src ?? undefined }, ...sectionRows(p, index)];
    });
    const content = [...new Set(sections.map(s => s.reactionFlavor).filter(Boolean))].join("<br>");
    ticked = await new Promise<string[]>(resolve => void new ReactionGroupDialog(entries, content, incoming, resolve).render({ force: true }));
  }
  if (incoming?.settledHow) return sections.map(() => undefined);
  if (!ticked.length) return sections.map(none);
  if (incoming && !(await incoming.claim())) return sections.map(() => undefined);
  const results: (ReactionResult | undefined)[] = [];
  for (const [index, p] of prepared.entries()) {
    if (!p) { results.push(none()); continue; }
    const mine = ticked.filter(id => id.startsWith(`${index}|`)).map(id => id.slice(id.indexOf("|") + 1));
    const activities = p.activities.filter(a => mine.includes(a.uuid));
    const offers = p.offers.filter(o => mine.includes(o.key));
    if (!activities.length && !offers.length) { results.push(none()); continue; }
    const section = p.section;
    const result = await reactionDialog(p.actor, section.triggerTokenUuid, activities, section.reactionFlavor, section.triggerType,
      { ...section.options, incoming, tokenUuid: section.tokenUuid, reactionOffers: offers, standing: { rows: p.rows, skipDialog: true, chosenByPlayer } }) as ReactionResult;
    const taken = new Set<string>([...(result.offerKeys ?? (result.offerKey ? [result.offerKey] : [])), ...(result.uuid ? [result.uuid] : [])]);
    for (const [key, row] of p.rows) if (row.choice === "next" && taken.has(key)) await setStandingChoice(p.actor, row.standingKey, "ask", row.label);
    results.push(result);
  }
  return results;
}
