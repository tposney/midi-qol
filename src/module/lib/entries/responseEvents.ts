import { register } from "../../api/services.js";
import { Workflow } from "../../Workflow.js";
import type { ResponseAnswer, ResponseCandidate, ResponseQuery } from "../../services/responses/service.js";
import { collectEntries, offerableEntries, runEvent, takeEntry } from "./engine.js";
import { entryLabel, offerOption } from "./offers.js";
import { takeACChange, targetContext } from "./useEvents.js";

/*
 * M15 stage 4f (R1): the target events raised where midi asks for reactions, so one prompt has everything that
 * happens to the creature there. At each site (an attack against it, a hit, a miss, a save, damage):
 * 1. its always and toggle entries run (they may change the attack roll or its AC);
 * 2. midi's reaction prompt is asked as before; the reactions service's midi-qol.entries contributor adds the
 *    creature's ask and reaction entries for the event as offers (contract 2), taken on this client;
 * 3. when no reaction prompt was shown (the item provokes none, reactions are off for the player), its plain asks are
 *    asked on their own; reaction offers are not.
 * An AC change from an entry (`bonus` with rolls "ac") comes back as the reaction's new AC.
 */

/** The event each reaction trigger is (critical and fumble: event data on hit and missed); on the query as `event` */
const EVENT_OF_TRIGGER: Record<string, string> = {
  reactionattacked: "attacked", reaction: "hit", reactionhit: "hit", reactioncritical: "hit", reactionmissed: "missed", reactionfumble: "missed",
  reactionsave: "saveRequested", reactionsavefail: "saveFailed", reactionsavesuccess: "saveSucceeded", reactiondamage: "damaging", reactionheal: "healing"
};

export const RESPONSE_EVENTS = [...new Set(Object.values(EVENT_OF_TRIGGER))];

export function eventOfTrigger(triggerType: string): string | undefined { return EVENT_OF_TRIGGER[triggerType]; }

interface Pending { event: Record<string, unknown>, presented: boolean }
/** The events being raised at a reaction site, by use and `<target uuid>|<event>`: their event, whether the prompt showed their offers */
const pending = new WeakMap<Workflow, Map<string, Pending>>();

const pendingKey = (target: TokenDocument.Implementation, eventId: string) => `${target.uuid}|${eventId}`;

/** The event of a event being raised at a reaction site (reaction conditions read it as `event`) */
export function eventDataFor(workflow: unknown, target: TokenDocument.Implementation | undefined, eventId: string | undefined): Record<string, unknown> | undefined {
  if (!(workflow instanceof Workflow) || !target || !eventId) return undefined;
  return pending.get(workflow)?.get(pendingKey(target, eventId))?.event;
}

/** Whether the creature has entries for the event (an event costing work, damage worked out, only then) */
export function hasEventEntries(workflow: Workflow, target: TokenDocument.Implementation, eventId: string): boolean {
  const context = targetContext(workflow, target);
  return !!context && collectEntries(eventId, context).length > 0;
}

/**
 * A target event at a reaction site: the creature's automatic entries, then `ask` (midi's reaction prompt, which shows
 * its offers), then its plain asks if no prompt showed them. What the prompt answered, with an AC change from the
 * automatic entries folded in.
 */
export async function targetEvent(workflow: Workflow, target: TokenDocument.Implementation | undefined, eventId: string, event: Record<string, unknown>,
  ask?: () => Promise<ResponseAnswer | undefined>): Promise<ResponseAnswer | undefined> {
  const context = target ? targetContext(workflow, target, event) : undefined;
  if (!target || !context || workflow.readOnly) return ask?.();
  const has = collectEntries(eventId, context).length > 0;
  if (has) await runEvent(eventId, { ...context, offers: "automatic" });
  const automaticAC = takeACChange(workflow, target);
  let byUse = pending.get(workflow);
  if (!byUse) pending.set(workflow, byUse = new Map());
  const record: Pending = { event, presented: false };
  byUse.set(pendingKey(target, eventId), record);
  let answer: ResponseAnswer | undefined;
  try {
    answer = ask ? await ask() : undefined;
  } finally {
    byUse.delete(pendingKey(target, eventId));
  }
  // Its plain asks if no prompt showed them; near holders' asks and reactions either way (asked of the holder)
  if (has) await runEvent(eventId, { ...context, offers: record.presented ? "near" : "asks" });
  const askedAC = takeACChange(workflow, target);
  const change = automaticAC + askedAC;
  if (change && answer?.ac === undefined) {
    // @ts-expect-error no dnd5e-types
    const ac = Number(target.actor?.system.attributes.ac?.value ?? 10);
    answer = { ...answer, name: answer?.name ?? target.name ?? "", ac: ac + change };
  }
  return answer;
}

/** The reactions service's offers from the creature's entries at the trigger's event (contract 2) */
async function entryResponseOffers(query: ResponseQuery): Promise<ResponseCandidate[]> {
  const eventId = query.eventId ?? EVENT_OF_TRIGGER[query.triggerType];
  const workflow = query.workflow;
  if (!eventId || !(workflow instanceof Workflow) || !query.target) return [];
  const record = pending.get(workflow)?.get(pendingKey(query.target, eventId));
  const context = targetContext(workflow, query.target, record?.event ?? {});
  if (!context) return [];
  const list = await offerableEntries(eventId, context, !query.usedReaction);
  if (record && list.length) record.presented = true;
  return list.map(({ found, conditionData }, index) => {
    const option = offerOption(found, String(index));
    return {
      offer: {
        key: `${(found.document as { uuid?: string }).uuid ?? ""}#${found.entry.id}`,
        label: entryLabel(found), img: option.img, description: option.description,
        ...(found.entry.offer === "reaction" ? { cost: { actions: { reaction: 1 } } } : {}),
        take: async () => {
          const result = await takeEntry(eventId, found, context, conditionData);
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

export function registerResponseEvents() {
  register("responses", "midi-qol.entries", { for: entryResponseOffers }, { label: "Midi-QOL: entries" });
}
