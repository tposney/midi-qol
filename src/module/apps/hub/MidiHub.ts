import { i18n } from "../../../midi-qol.js";
import { turnModelApi, type ActivityCell, type TurnModel } from "../../services/turnModel/model.js";
import { escape, hubSections, onSectionsChanged, type HubContext, type HubSection } from "./sections.js";
import { preview } from "../../lib/preview.js";
import type { Activity } from "../../../globals.js";
import { hudApi } from "../../services/turnModel/hud.js";
import { useOrPrime } from "../../services/clickToAttack/service.js";

/*
 * M27: midi's hub (plan ~/Documents/midi-next-M27-plan-2026-11-24.md): the one place a creature's turn is run from,
 * for players and (for the selected NPC) the GM. It only displays and launches: it reads the turn model, and every
 * button goes through `activity.use` or an interaction, so other modules' hooks fire as for any use. Its parts are
 * sections (sections.ts). Docked at the bottom (a HUD provider replacing the hotbar) or popped out as a window (the
 * user's choice, a user flag). Hovering a usable button with a target shows the preview (range, cover, advantage and
 * why, the save DC).
 */

const { ApplicationV2 } = foundry.applications.api;

type ActivityLike = Activity & { uuid: string, use(usage?: object, dialog?: object, message?: object): Promise<unknown> };

export class MidiHub extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["midi-qol", "midi-qol-hub"],
    window: { frame: false, positioned: false },
    position: {}
  };

  /** The one hub (docked or a window, as the user chose); remade when the mode changes */
  static #instance: MidiHub | undefined;
  token: TokenDocument.Implementation | undefined;
  #tab = "bar";
  #filter = "";
  #pinned = false;

  /** The drawer is open: a tab other than the bar, or a cost filter */
  get drawerOpen(): boolean { return this.#tab !== "bar" || !!this.#filter; }

  closeDrawer() {
    if (!this.drawerOpen) return;
    this.#tab = "bar";
    this.#filter = "";
    void this.render();
  }
  #model: TurnModel | undefined;

  /** Popped out as a window (the user's choice) */
  static get windowed(): boolean {
    return !!game.user?.flags?.["midi-qol"]?.hubWindow;
  }

  /** Docked (frameless, at the bottom) or a window (framed, movable, resizable, themed as core's pop-outs) */
  static #options(windowed: boolean): object {
    return windowed
      ? { id: "midi-qol-hub", window: { frame: true, positioned: true, title: "midi-qol.Hub.Title", icon: "fa-solid fa-chess-knight", resizable: true, minimizable: true }, position: { width: 760, height: "auto" } }
      : { id: "midi-qol-hub" };
  }

  static get instance(): MidiHub {
    return MidiHub.#instance ??= new MidiHub(MidiHub.#options(MidiHub.windowed) as never);
  }

  /** The hub when one is shown */
  static get shown(): MidiHub | undefined {
    return MidiHub.#instance?.rendered ? MidiHub.#instance : undefined;
  }

  /** Docked <-> window: this hub closed and discarded, one made in the other mode for the same token */
  static async switchMode() {
    const token = MidiHub.#instance?.token;
    await MidiHub.#instance?.close();
    MidiHub.#instance = undefined;
    await game.user?.setFlag("midi-qol", "hubWindow", !MidiHub.windowed);
    await MidiHub.instance.show(token);
  }

  get actor(): Actor.Implementation | undefined {
    return (this.token?.actor ?? undefined) as Actor.Implementation | undefined;
  }

  async show(token: TokenDocument.Implementation | undefined) {
    if (token !== this.token) this.#filter = "";
    this.token = token;
    if (!token?.actor) { if (this.rendered) await this.close(); return; }
    await this.render({ force: true });
  }

  #context(model: TurnModel): HubContext {
    const actor = this.actor!;
    return {
      actor, token: this.token, model, gm: !!game.user?.isGM, owner: !!actor.isOwner, tab: this.#tab, filter: this.#filter,
      refresh: () => { void this.render(); },
      pinned: this.#pinned,
      afterUse: () => { if (!this.#pinned) this.closeDrawer(); }
    };
  }

  async _prepareContext(): Promise<Record<string, unknown>> {
    const token = this.token;
    this.#model = token ? await turnModelApi.get(token) : undefined;
    return {};
  }

  async _renderHTML(): Promise<string> {
    const model = this.#model;
    if (!model || !this.actor) return "";
    const ctx = this.#context(model);
    const areas: Record<string, string[]> = { left: [], center: [], right: [] };
    for (const section of hubSections()) {
      try {
        if (section.when && !section.when(ctx)) continue;
        const html = await section.render(ctx);
        if (html) areas[section.area].push(`<section class="midi-hub-section" data-section="${escape(section.id)}">${html}</section>`);
      } catch (err) { console.warn(`midi-qol | hub section ${section.id}`, err); }
    }
    const windowed = MidiHub.windowed;
    const controls = `<div class="midi-hub-controls">
      <a data-hub-action="toggleWindow" data-tooltip="${escape(i18n(windowed ? "midi-qol.Hub.Dock" : "midi-qol.Hub.PopOut"))}"><i class="fa-solid ${windowed ? "fa-down-to-line" : "fa-up-right-from-square"}"></i></a>
      <a data-hub-action="settings" data-tooltip="${escape(i18n("midi-qol.Hud.Settings"))}"><i class="fa-solid fa-gear"></i></a>
    </div>`;
    return `<div class="midi-hub-body${windowed ? " midi-hub-windowed" : " midi-hub-docked"}">
      ${controls}
      ${(["left", "center", "right"] as const).filter(area => areas[area].length)
        .map(area => `<div class="midi-hub-area midi-hub-${area}">${areas[area].join("")}</div>`).join("")}
    </div>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  /** A window takes the interface's colour scheme, as core's pop-outs do */
  async _onRender(context: object, options: object) {
    await super._onRender?.(context as never, options as never);
    this.element.classList.toggle("midi-hub-is-docked", !MidiHub.windowed);
    if (!MidiHub.windowed) return;
    this.element.classList.remove("theme-light", "theme-dark");
    const scheme = (game.settings?.get("core", "uiConfig") as { colorScheme?: { interface?: string } } | undefined)?.colorScheme?.interface;
    if (scheme) this.element.classList.add("themed", `theme-${scheme}`);
  }

  /** Listeners once, on the element (kept across renders: only its content is replaced) */
  /** The inbox's countdowns (data-ends: when, ms), redrawn twice a second while the hub is open */
  #tick: number | undefined;
  #drawCountdowns() {
    for (const span of Array.from(this.element?.querySelectorAll<HTMLElement>("[data-ends]") ?? [])) {
      span.textContent = `${Math.max(0, Math.ceil((Number(span.dataset.ends) - Date.now()) / 1000))}s`;
    }
  }

  async _onFirstRender(context: object, options: object) {
    await super._onFirstRender?.(context as never, options as never);
    this.#tick = window.setInterval(() => this.#drawCountdowns(), 500);
    const element = this.element;
    element.addEventListener("click", this.#onClick);
    element.addEventListener("contextmenu", this.#onContext);
    element.addEventListener("mouseover", this.#onHover);
    element.addEventListener("dragstart", this.#onDragStart);
    element.addEventListener("dragover", this.#onDragOver);
    element.addEventListener("drop", this.#onDrop);
    // The drawer closes on Escape or a click outside the hub
    document.addEventListener("pointerdown", this.#onOutside, true);
    document.addEventListener("keydown", this.#onEscape);
    // Docked: in Foundry's interface layer, at the bottom (where the hotbar was)
    if (!MidiHub.windowed) document.getElementById("interface")?.append(element);
  }

  #onOutside = (event: PointerEvent) => {
    if (!this.rendered || this.#pinned || !this.drawerOpen) return;
    if (!this.element.contains(event.target as Node)) this.closeDrawer();
  };

  #onEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.rendered || !this.drawerOpen || this.element.querySelector(".midi-hub-menu")) return;
    this.closeDrawer();
  };

  async _onClose(options: object) {
    window.clearInterval(this.#tick);
    document.removeEventListener("pointerdown", this.#onOutside, true);
    document.removeEventListener("keydown", this.#onEscape);
    await super._onClose?.(options as never);
  }

  /** The section that owns an element */
  #section(target: HTMLElement): HubSection | undefined {
    const id = target.closest<HTMLElement>("[data-section]")?.dataset.section;
    return hubSections().find(s => s.id === id);
  }

  #onClick = async (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-hub-action]");
    if (!target || !this.#model || !this.actor) return;
    const action = target.dataset.hubAction ?? "";
    const ctx = this.#context(this.#model);
    const own = this.#section(target)?.actions?.[action];
    if (own) { await own(ctx, target, event); return; }
    switch (action) {
      case "use": {
        const activity = fromUuidSync(target.dataset.uuid ?? "") as ActivityLike | null;
        if (activity?.use && !target.classList.contains("midi-hub-unusable")) {
          if (!this.#pinned) this.closeDrawer();
          await useOrPrime(activity as never, { event });
        }
        break;
      }
      // A tab or a filter opens the drawer. A filter narrows the open tab and stays as tabs change; the open tab again
      // closes the drawer
      case "tab": {
        const tab = target.dataset.tab ?? "bar";
        if (tab === this.#tab) { this.closeDrawer(); break; }
        this.#tab = tab;
        void this.render();
        break;
      }
      case "filter": this.#filter = target.dataset.filter === this.#filter ? "" : target.dataset.filter ?? ""; void this.render(); break;
      case "drawerPin": this.#pinned = !this.#pinned; void this.render(); break;
      case "drawerClose": this.closeDrawer(); break;
      case "toggleWindow": await MidiHub.switchMode(); break;
      case "settings": hudApi.openSettings(); break;
    }
  };

  #onContext = async (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-hub-context]");
    if (!target || !this.#model) return;
    event.preventDefault();
    const own = this.#section(target)?.actions?.[target.dataset.hubContext ?? ""];
    if (own) await own(this.#context(this.#model), target, event);
  };

  /** Hovering a usable button with a target: the preview (range, cover, advantage and why, the save DC) */
  #previewing = "";
  #onHover = async (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-preview]");
    if (!target || target.dataset.preview === this.#previewing) return;
    const targets = [...(game.user?.targets ?? [])];
    if (!targets.length) return;
    this.#previewing = target.dataset.preview ?? "";
    const activity = fromUuidSync(this.#previewing) as Activity | null;
    if (!activity) return;
    try {
      const result = await preview(activity, targets, { token: this.token });
      if (this.#previewing !== target.dataset.preview) return;
      const lines = result.targets.map(t => {
        const parts: string[] = [];
        if (t.range) parts.push(i18n(`midi-qol.Hub.Range.${t.range.result}`));
        if (t.ac) parts.push(`${i18n("midi-qol.Hub.AC")} ${t.ac.effective}${t.ac.cover ? ` (${i18n("midi-qol.Hub.Cover")} +${t.ac.cover})` : ""}`);
        if (t.advantage?.mode) parts.push(i18n(t.advantage.mode > 0 ? "midi-qol.Hub.Advantage" : "midi-qol.Hub.Disadvantage")
          + (t.advantage.attribution?.length ? `: ${t.advantage.attribution.map(a => escape((a as { label?: string, name?: string }).label ?? (a as { name?: string }).name ?? "")).filter(Boolean).join(", ")}` : ""));
        return `<div><strong>${escape(t.name)}</strong>: ${parts.join("; ")}</div>`;
      });
      if (result.save?.dc !== undefined) lines.push(`<div>${i18n("midi-qol.Hub.SaveDC")} ${result.save.dc}</div>`);
      const base = target.dataset.tooltipHtml ?? "";
      game.tooltip?.activate(target, { html: `${base}<hr>${lines.join("")}`, direction: "UP" } as never);
    } catch { /* no preview: the plain tooltip stays */ }
  };

  #onDragStart = (event: DragEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[draggable][data-uuid]");
    if (!target) return;
    // The entry as the bar stores it: an item (its choices) or one activity
    event.dataTransfer?.setData("text/plain", JSON.stringify({ midiHub: target.dataset.entry ?? target.dataset.uuid, from: target.dataset.barIndex ?? null }));
  };

  #onDragOver = (event: DragEvent) => {
    if ((event.target as HTMLElement).closest("[data-hub-drop]")) event.preventDefault();
  };

  #onDrop = async (event: DragEvent) => {
    const zone = (event.target as HTMLElement).closest<HTMLElement>("[data-hub-drop]");
    if (!zone || !this.#model) return;
    event.preventDefault();
    let data: { midiHub?: string, from?: string | null, uuid?: string, type?: string } = {};
    try { data = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "{}"); } catch { return; }
    // From the hub, or an item (its choices) or activity dragged from a sheet
    let uuid = data.midiHub;
    if (!uuid && (data.type === "Item" || data.type === "Activity") && data.uuid) uuid = data.uuid;
    if (!uuid) return;
    const before = (event.target as HTMLElement).closest<HTMLElement>("[data-bar-index]")?.dataset.barIndex;
    const own = this.#section(zone)?.actions?.["drop"];
    if (own) await own(this.#context(this.#model), zone, Object.assign(event, { midiHub: { uuid, from: data.from ?? null, before: before ?? null } }));
  };

  /** The cell for an activity in the model */
  static cell(model: TurnModel, uuid: string): ActivityCell | undefined {
    return model.activities.find(c => c.uuid === uuid);
  }
}

/** Re-render on a change to the shown creature's model */
export function setupHubRefresh() {
  // The inbox: what this user is asked, and the requests this client waits on
  for (const hook of ["midi-qol.incomingRequestsChanged", "midi-qol.requestStarted", "midi-qol.requestSettled"])
    Hooks.on(hook as never, (() => { void MidiHub.shown?.render(); }) as never);
  Hooks.on("midi-qol.turnModelChanged" as never, ((actorUuid: string) => {
    const hub = MidiHub.shown;
    if (hub?.actor?.uuid === actorUuid) void hub.render();
  }) as never);
  // The user's bar changed
  Hooks.on("updateUser", (user: User.Implementation) => { if (user.isSelf) void MidiHub.shown?.render(); });
  onSectionsChanged(() => { void MidiHub.shown?.render(); });
}
