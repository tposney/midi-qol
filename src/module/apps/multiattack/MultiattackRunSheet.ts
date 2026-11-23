import { i18n } from "../../../midi-qol.js";
import { isMultiattackItem } from "../../services/multiattack/plans.js";
import { nextActivities, openRun, runFit } from "../../services/multiattack/run.js";
import { planView } from "./planView.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/*
 * M21b: the run sheet of a creature's open Multiattack: the plan in plain words, the uses made (target, hit or miss,
 * damage) and a button for each activity the plan still allows. A button is a normal use of that activity (its own
 * dialogs, targeting and card); the sheet follows the run as uses are recorded, and says when it is complete.
 */

type Usable = { uuid: string, name?: string | null, img?: string | null, item: Item.Implementation, use(config?: object): Promise<unknown> };

export class MultiattackRunSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  static #sheets = new Map<string, MultiattackRunSheet>();

  static DEFAULT_OPTIONS = {
    classes: ["midi-qol", "midi-qol-multiattack-run"],
    window: { title: "midi-qol.Multiattack.Title", icon: "fa-solid fa-burst", resizable: true },
    position: { width: 400, height: "auto" as const },
    actions: { multiattackUse: MultiattackRunSheet.#onUse }
  };

  static PARTS = { body: { template: "modules/midi-qol/templates/apps/Multiattack/run.hbs", scrollable: [""] } };

  actor: Actor.Implementation;

  constructor(actor: Actor.Implementation) {
    super({ id: `midi-qol-multiattack-run-${actor.id}` });
    this.actor = actor;
  }

  /** Opens (or brings up) the creature's run sheet */
  static show(actor: Actor.Implementation) {
    const key = actor.uuid ?? actor.id ?? "";
    let sheet = MultiattackRunSheet.#sheets.get(key);
    if (!sheet) { sheet = new MultiattackRunSheet(actor); MultiattackRunSheet.#sheets.set(key, sheet); }
    void sheet.render({ force: true });
    return sheet;
  }

  static refresh(actor: Actor.Implementation | null | undefined) {
    const sheet = actor ? MultiattackRunSheet.#sheets.get(actor.uuid ?? actor.id ?? "") : undefined;
    if (sheet?.rendered) void sheet.render();
  }

  get title() {
    return i18n("midi-qol.Multiattack.Title").replace("{name}", this.actor.name ?? "");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const open = openRun(this.actor);
    if (!open) return { ...context, closed: true };
    const { run } = open;
    const fit = runFit(this.actor, run);
    const next = (nextActivities(this.actor, run) as unknown as Usable[]).map(activity => {
      const several = ((activity.item.system as { activities?: { size?: number } }).activities?.size ?? 1) > 1;
      return { uuid: activity.uuid, img: activity.img || activity.item.img, label: several ? `${activity.item.name}: ${activity.name}` : activity.item.name };
    });
    return {
      ...context,
      closed: false,
      source: i18n(`midi-qol.Multiattack.Source.${run.source}`),
      guess: run.source === "guess",
      skipped: run.skipped ?? [],
      view: run.plan ? planView(this.actor, run.plan) : undefined,
      uses: run.uses.map(use => ({
        name: use.name,
        targets: (use.targets ?? []).join(", "),
        result: use.hit === undefined ? "" : i18n(use.hit ? "midi-qol.Multiattack.Hit" : "midi-qol.Multiattack.Miss"),
        damage: use.damage ?? ""
      })),
      attacksLeft: fit && Number.isFinite(fit.attacksLeft) ? fit.attacksLeft : undefined,
      next,
      done: !!run.plan && next.length === 0
    };
  }

  static async #onUse(this: MultiattackRunSheet, event: PointerEvent, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    const activity = uuid ? fromUuidSync(uuid) as Usable | null : null;
    if (!activity?.use) return;
    await activity.use({ event });
  }

  _onClose(options) {
    super._onClose(options);
    MultiattackRunSheet.#sheets.delete(this.actor.uuid ?? this.actor.id ?? "");
  }
}

export function setupMultiattackSheet() {
  Hooks.on("midi-qol.multiattackOpened", actor => { MultiattackRunSheet.show(actor); });
  Hooks.on("updateItem", (item: Item.Implementation) => {
    if (isMultiattackItem(item)) MultiattackRunSheet.refresh(item.parent as Actor.Implementation | null);
  });
  // A new turn closes the run: the sheet says so
  Hooks.on("updateCombat", combat => { for (const c of combat.combatants) MultiattackRunSheet.refresh(c.actor as Actor.Implementation | null); });
}
