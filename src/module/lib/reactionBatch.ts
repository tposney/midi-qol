import { askReactionGroup, type ReactionResult } from "../utils.js";

/*
 * M32a step 4 (plan ~/Documents/midi-next-M32-plan-2026-11-22.md): one reaction request per user per event. The
 * workflow runs every target of an event up to its reaction ask at once, each with a ticket; a ticket's ask waits until
 * every target has asked or finished without asking, then the batch sends one request per user (a section per creature),
 * the users in parallel. A creature asked alone, or one whose request carries a failed save's bonus part (a bonus prompt
 * holds one roll), is sent on its own, still in parallel.
 */

export interface BatchedAsk {
  user: User.Implementation;
  /** The REACTIONS_REQUEST data of this creature */
  data: object;
  /** Sends it on its own */
  single: () => Promise<ReactionResult>;
  /** Sent on its own, never in a group (a failed save's bonus part) */
  own: boolean;
}

export interface ReactionTicket {
  ask(item: BatchedAsk): Promise<ReactionResult>;
  /** The target's work up to its answer is done: a ticket that never asked lets the batch go */
  settle(): void;
}

type Queued = { item: BatchedAsk, resolve: (result: ReactionResult) => void };

export class ReactionBatch {
  readonly #total: number;
  #arrived = 0;
  #left = 0;
  #flushed = false;
  readonly #queue: Queued[] = [];
  readonly #owner: object | undefined;

  constructor(total: number, owner?: object) {
    this.#total = total;
    this.#owner = owner;
  }

  ticket(): ReactionTicket {
    let asked = false;
    let settled = false;
    return {
      ask: item => {
        // Asked again after the batch went (a second reaction site in one target's work): on its own
        if (asked || this.#flushed) return item.single();
        asked = true;
        return new Promise(resolve => {
          this.#queue.push({ item, resolve });
          this.#arrived += 1;
          this.#check();
        });
      },
      settle: () => {
        if (asked || settled) return;
        settled = true;
        this.#left += 1;
        this.#check();
      }
    };
  }

  #check() {
    if (this.#flushed || this.#arrived + this.#left < this.#total) return;
    this.#flushed = true;
    void this.#send();
  }

  async #send() {
    const byUser = new Map<string, Queued[]>();
    const alone: Queued[] = [];
    for (const entry of this.#queue) {
      if (entry.item.own) { alone.push(entry); continue; }
      const id = entry.item.user.id ?? "";
      byUser.set(id, [...(byUser.get(id) ?? []), entry]);
    }
    const sends: Promise<void>[] = alone.map(entry => entry.item.single().then(entry.resolve));
    for (const group of byUser.values()) {
      if (group.length === 1) {
        sends.push(group[0].item.single().then(group[0].resolve));
        continue;
      }
      sends.push(askReactionGroup(group[0].item.user, group.map(entry => entry.item.data), { owner: this.#owner, label: game.i18n?.localize("midi-qol.ReactionDialog.Title") ?? "" })
        .then(results => group.forEach((entry, index) => entry.resolve(results[index] ?? { name: undefined }))));
    }
    await Promise.all(sends);
  }
}
