import { i18n } from "../../midi-qol.js";
import { cardMidi, recordList } from "../lib/cardState.js";
import { dropHold, heldUses, HOLD_POINTS, releaseHold, worldHoldPoints, type HoldPoint } from "../lib/holds.js";
import type { GmEdits, GmTargetEdit, UseHold } from "../Workflow.js";

/*
 * M20: the GM's hold panel. The uses held for the GM (from their cards: the use may run on a player's client), each
 * with what the GM may change at its point (hit or miss and the critical; a save made or failed; the damage a target
 * takes) and Continue / Drop; above them, where uses are held: every use (the world's points) and the selected
 * tokens' creatures (their own). Opens when a use is held; MidiQOL.holds.open().
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MULTIPLIERS = [0, 0.5, 1, 2];

interface TargetRow { uuid: string, name: string, img?: string | null, hit: boolean, saved: boolean, multiplier: number, amount: number }

export class HoldPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "midi-qol-holds",
    tag: "form" as const,
    classes: ["midi-qol", "midi-qol-holds"],
    window: { title: "midi-qol.Hold.Title", icon: "fa-solid fa-hand", resizable: true },
    position: { width: 520, height: "auto" as const },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: { holdContinue: HoldPanel.#onContinue, holdDrop: HoldPanel.#onDrop, holdWhere: HoldPanel.#onWhere }
  };

  static PARTS = { body: { template: "modules/midi-qol/templates/apps/Hold/holds.hbs", scrollable: [""] } };

  static open() {
    const open = foundry.applications.instances.get("midi-qol-holds") as HoldPanel | undefined;
    if (open) return void open.render({ force: true });
    void new HoldPanel().render({ force: true });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const pointLabel = (point: HoldPoint) => i18n(`midi-qol.Hold.Point.${point}`);
    const world = worldHoldPoints();
    const selected = (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter((a): a is Actor.Implementation => !!a);
    const actorPoints = (actor: Actor.Implementation) => (actor.flags?.["midi-qol"]?.gmHold ?? []) as HoldPoint[];
    const where = HOLD_POINTS.map(point => ({
      point, label: pointLabel(point), world: world.includes(point),
      selected: selected.length > 0 && selected.every(actor => actorPoints(actor).includes(point))
    }));
    const held = heldUses().map(({ card, hold }) => this.#heldView(card, hold, pointLabel));
    return { ...context, where, selectedNames: selected.map(a => a.name).join(", "), held };
  }

  #heldView(card: ChatMessage.Implementation, hold: UseHold, pointLabel: (p: HoldPoint) => string) {
    const midi = cardMidi(card);
    const edits = (midi.state?.gmEdits ?? {}) as GmEdits;
    const targets: TargetRow[] = recordList(midi.records).filter(r => r.targets).map(record => {
      const token = fromUuidSync(record.uuid) as TokenDocument.Implementation | null;
      const edit = edits.targets?.find(e => e.uuid === record.uuid);
      return {
        uuid: record.uuid, name: token?.name ?? record.uuid, img: token?.texture?.src,
        hit: edit?.hit ?? !!(record.hit || record.hitEC),
        saved: edit?.saved ?? !!record.saved,
        multiplier: edit?.multiplier ?? 1, amount: edit?.amount ?? 0
      };
    });
    const point = hold.point as HoldPoint;
    // The Confirm Roll Button's hold: after the damage roll, hit or miss and the damage can still change
    const confirm = hold.kind === "confirm";
    return {
      card: card.uuid, point: confirm ? i18n("midi-qol.Hold.Point.confirm") : pointLabel(point), speaker: card.alias,
      item: (card as { getAssociatedItem?: () => Item.Implementation | null }).getAssociatedItem?.()?.name ?? "",
      attack: point === "attack" || (confirm && !!midi.hasAttack), saves: point === "saves", damage: point === "damage" || confirm,
      critical: !confirm,
      criticalValue: edits.critical ?? !!midi.state?.isCritical,
      multipliers: MULTIPLIERS.map(value => ({ value, label: `×${value === 0.5 ? "½" : value}` })),
      targets
    };
  }

  /** The changes in one held use's section of the form */
  #editsFor(section: HTMLElement): GmEdits {
    const edits: GmEdits = {};
    const targets = new Map<string, GmTargetEdit>();
    const target = (uuid: string) => { let edit = targets.get(uuid); if (!edit) targets.set(uuid, edit = { uuid }); return edit; };
    for (const input of Array.from(section.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-edit]"))) {
      const uuid = input.dataset.target ?? "";
      switch (input.dataset.edit) {
        case "hit": target(uuid).hit = (input as HTMLInputElement).checked; break;
        case "saved": target(uuid).saved = (input as HTMLInputElement).checked; break;
        case "critical": edits.critical = (input as HTMLInputElement).checked; break;
        case "multiplier": target(uuid).multiplier = Number(input.value); break;
        case "amount": target(uuid).amount = Number(input.value) || 0; break;
      }
    }
    if (targets.size) edits.targets = [...targets.values()];
    return edits;
  }

  static async #onContinue(this: HoldPanel, _event: PointerEvent, target: HTMLElement) {
    const section = target.closest<HTMLElement>("[data-card]");
    if (!section?.dataset.card) return;
    const problem = await releaseHold(section.dataset.card, this.#editsFor(section));
    if (problem) ui.notifications?.warn(problem);
    await this.#afterwards();
  }

  static async #onDrop(this: HoldPanel, _event: PointerEvent, target: HTMLElement) {
    const card = target.closest<HTMLElement>("[data-card]")?.dataset.card;
    if (!card) return;
    const problem = await dropHold(card);
    if (problem) ui.notifications?.warn(problem);
    await this.#afterwards();
  }

  static async #onWhere(this: HoldPanel, _event: PointerEvent, target: HTMLElement) {
    const { point, scope } = target.dataset as { point?: HoldPoint, scope?: "world" | "selected" };
    if (!point || !HOLD_POINTS.includes(point)) return;
    const on = (target as HTMLInputElement).checked;
    const toggle = (list: HoldPoint[]) => on ? [...new Set([...list, point])] : list.filter(p => p !== point);
    if (scope === "world") await game.settings?.set("midi-qol", "gmHoldPoints", toggle(worldHoldPoints()));
    else for (const token of canvas?.tokens?.controlled ?? []) {
      const actor = token.actor;
      if (actor) await actor.setFlag("midi-qol", "gmHold", toggle((actor.flags?.["midi-qol"]?.gmHold ?? []) as HoldPoint[]));
    }
    void this.render();
  }

  /** Closes when nothing is left held, else shows what is */
  async #afterwards() {
    await new Promise(resolve => setTimeout(resolve, 300));
    void this.render();
  }
}

export function setupHoldPanel() {
  Hooks.on("midi-qol.holdOpened", () => { if (game.user?.isGM) HoldPanel.open(); });
  // A held use's card changing (held, released): the open panel follows
  Hooks.on("updateChatMessage", () => {
    const open = foundry.applications.instances.get("midi-qol-holds") as HoldPanel | undefined;
    if (open?.rendered) void open.render();
  });
}
