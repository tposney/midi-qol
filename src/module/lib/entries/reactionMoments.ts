import { register } from "../../api/services.js";
import { Workflow } from "../../Workflow.js";
import type { ReactionAnswer, ReactionCandidate, ReactionQuery } from "../../services/reactions/service.js";
import { collectEntries, offerableEntries, runMoment, takeEntry } from "./engine.js";
import { entryLabel, offerOption } from "./offers.js";
import { takeACChange, targetContext } from "./useMoments.js";

/*
 * M15 stage 4f (R1): the target moments raised where midi asks for reactions, so one prompt has everything that
 * happens to the creature there. At each site (an attack against it, a hit, a miss, a save, damage):
 * 1. its always and toggle entries run (they may change the attack roll or its AC);
 * 2. midi's reaction prompt is asked as before; the reactions service's midi-qol.entries contributor adds the
 *    creature's ask and reaction entries for the moment as offers (contract 2), taken on this client;
 * 3. when no reaction prompt was shown (the item provokes none, reactions are off for the player), its plain asks are
 *    asked on their own; reaction offers are not.
 * An AC change from an entry (`bonus` with rolls "ac") comes back as the reaction's new AC.
 */

/** The moment each reaction trigger is (critical and fumble: event data on hit and missed); on the query as `moment` */
const MOMENT_OF_TRIGGER: Record<string, string> = {
  reactionattacked: "attacked", reaction: "hit", reactionhit: "hit", reactioncritical: "hit", reactionmissed: "missed", reactionfumble: "missed",
  reactionsave: "saveRequested", reactionsavefail: "saveFailed", reactionsavesuccess: "saveSucceeded", reactiondamage: "damaging", reactionheal: "healing"
};

export const REACTION_MOMENTS = [...new Set(Object.values(MOMENT_OF_TRIGGER))];

export function momentOfTrigger(triggerType: string): string | undefined { return MOMENT_OF_TRIGGER[triggerType]; }

interface Pending { event: Record<string, unknown>, presented: boolean }
/** The moments being raised at a reaction site, by use and `<target uuid>|<moment>`: their event, whether the prompt showed their offers */
const pending = new WeakMap<Workflow, Map<string, Pending>>();

const pendingKey = (target: TokenDocument.Implementation, moment: string) => `${target.uuid}|${moment}`;

/** The event of a moment being raised at a reaction site (reaction conditions read it as `event`) */
export function momentEvent(workflow: unknown, target: TokenDocument.Implementation | undefined, moment: string | undefined): Record<string, unknown> | undefined {
  if (!(workflow instanceof Workflow) || !target || !moment) return undefined;
  return pending.get(workflow)?.get(pendingKey(target, moment))?.event;
}

/** Whether the creature has entries for the moment (an event costing work, damage worked out, only then) */
export function hasMomentEntries(workflow: Workflow, target: TokenDocument.Implementation, moment: string): boolean {
  const context = targetContext(workflow, target);
  return !!context && collectEntries(moment, context).length > 0;
}

/**
 * A target moment at a reaction site: the creature's automatic entries, then `ask` (midi's reaction prompt, which shows
 * its offers), then its plain asks if no prompt showed them. What the prompt answered, with an AC change from the
 * automatic entries folded in.
 */
export async function targetMoment(workflow: Workflow, target: TokenDocument.Implementation | undefined, moment: string, event: Record<string, unknown>,
  ask?: () => Promise<ReactionAnswer | undefined>): Promise<ReactionAnswer | undefined> {
  const context = target ? targetContext(workflow, target, event) : undefined;
  if (!target || !context || workflow.readOnly) return ask?.();
  const has = collectEntries(moment, context).length > 0;
  if (has) await runMoment(moment, { ...context, offers: "automatic" });
  const automaticAC = takeACChange(workflow, target);
  let byUse = pending.get(workflow);
  if (!byUse) pending.set(workflow, byUse = new Map());
  const record: Pending = { event, presented: false };
  byUse.set(pendingKey(target, moment), record);
  let answer: ReactionAnswer | undefined;
  try {
    answer = ask ? await ask() : undefined;
  } finally {
    byUse.delete(pendingKey(target, moment));
  }
  if (has && !record.presented) await runMoment(moment, { ...context, offers: "asks" });
  const askedAC = takeACChange(workflow, target);
  const change = automaticAC + askedAC;
  if (change && answer?.ac === undefined) {
    // @ts-expect-error no dnd5e-types
    const ac = Number(target.actor?.system.attributes.ac?.value ?? 10);
    answer = { ...answer, name: answer?.name ?? target.name ?? "", ac: ac + change };
  }
  return answer;
}

/** The reactions service's offers from the creature's entries at the trigger's moment (contract 2) */
async function entryReactionOffers(query: ReactionQuery): Promise<ReactionCandidate[]> {
  const moment = query.moment ?? MOMENT_OF_TRIGGER[query.triggerType];
  const workflow = query.workflow;
  if (!moment || !(workflow instanceof Workflow) || !query.target) return [];
  const record = pending.get(workflow)?.get(pendingKey(query.target, moment));
  const context = targetContext(workflow, query.target, record?.event ?? {});
  if (!context) return [];
  const list = await offerableEntries(moment, context, !query.usedReaction);
  if (record && list.length) record.presented = true;
  return list.map(({ found, conditionData }, index) => {
    const option = offerOption(found, String(index));
    return {
      offer: {
        key: `${(found.document as { uuid?: string }).uuid ?? ""}#${found.entry.id}`,
        label: entryLabel(found), img: option.img, description: option.description,
        ...(found.entry.offer === "reaction" ? { cost: { actions: { reaction: 1 } } } : {}),
        take: async () => {
          const result = await takeEntry(moment, found, context, conditionData);
          const change = takeACChange(workflow, query.target);
          if (!change) return result.actions.length ? { name: entryLabel(found) } : undefined;
          // @ts-expect-error no dnd5e-types
          const ac = Number(query.actor.system.attributes.ac?.value ?? 10);
          return { name: entryLabel(found), ac: ac + change };
        }
      }
    };
  });
}

export function registerReactionMoments() {
  register("reactions", "midi-qol.entries", { for: entryReactionOffers }, { label: "Midi-QOL: entries" });
}
