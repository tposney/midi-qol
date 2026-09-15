import { configSettings, isDnd5e53 } from "../settings.js";
import { GameSystemConfig, MODULE_ID, MQDamageRollTypes, debugEnabled, i18nFormat, log, warn } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { CombinedTargetDescriptor, DamageApplicationOptions } from "../../globals.js";
import { WorkflowDataFlags } from "../Workflow.js";

// SVG Icons for midi-qol custom change sources (using dnd5e SVGs for consistent styling)
/** The two fields change-source cycling mutates, viewed generically. */
type CyclableOptions = { ignore?: Record<string, Set<string> | boolean | undefined>, downgrade?: Set<string> };

const MIDI_CHANGE_ICONS: Record<string, string> = {
  saved: "systems/dnd5e/icons/svg/activity/save.svg",
  superSaver: "systems/dnd5e/icons/svg/checked-shield.svg",
  semiSuperSaver: "systems/dnd5e/icons/svg/checked-shield.svg",
  uncannyDodge: "systems/dnd5e/icons/svg/activity/utility.svg",
  absorption: "systems/dnd5e/icons/svg/damage/healing.svg",
  DR: "systems/dnd5e/icons/svg/damage/threshold.svg",
  spell: "systems/dnd5e/icons/svg/activity/cast.svg",
  magic: "systems/dnd5e/icons/svg/activity/enchant.svg",
  nonmagic: "systems/dnd5e/icons/svg/activity/attack.svg"
};

export class DamageApplicationElementMidi extends globalThis.dnd5e.applications.components.DamageApplicationElement {
  chatMessage;
  damages: any[] = [];
  damageType: string = "defaultDamage";


  /**
   * Override to handle "all" type and midi custom change types for labels
   */
  getChangeSourceOptions(type: string, change: string, options: DamageApplicationOptions):
    { label: string, mode: string, pressed: string, title: string } {
    let mode = "active";
    if ((options.ignore?.[change] === true) || options.ignore?.[change]?.has?.(type)) mode = "ignore";
    else if ((change === "immunity") && (options.downgrade as Set<string>)?.has(type)) mode = "downgrade";

    const changeKey = change.charAt(0).toUpperCase() + change.slice(1);
    const typeLabel = GameSystemConfig.damageTypes[type]?.label ?? GameSystemConfig.healingTypes?.[type]?.label ?? "";
    // `title` is the plain description; `label` is it wrapped for the ignore/downgrade states.
    const title = i18nFormat(`DND5E.DamageApplication.Change.${changeKey}`, { type: typeLabel });
    let label = title;

    if (mode === "ignore") label = i18nFormat("DND5E.DamageApplication.Ignoring", { source: label });
    if (mode === "downgrade") label = i18nFormat("DND5E.DamageApplication.Downgrading", { source: label });

    /*
     * `mode` and `title` are returned because dnd5e 6.0's own `#buildChangeSources` reads them —
     * it renders `DND5E.DamageApplication.State.${mode}` and the title text. Returning only
     * `{ label, pressed }`, as this did, left every change source on the tray showing an
     * unlocalised `State.undefined` and no title, dnd5e's entries as well as midi's.
     */
    return { label, mode, title, pressed: mode === "active" ? "false" : mode === "ignore" ? "true" : "mixed" };
  }

  /**
   * Append midi's custom change-source buttons after the parent builds the entry.
   *
   * The signature is positional and dnd5e widened it: 6.0 calls
   * `buildTargetListEntry(targetList, { uuid, name })`, where the list is now the *first* argument
   * because entries are grouped into it. Taking the old single-argument form did not fail loudly —
   * it destructured `uuid` and `name` off the target list, got `undefined` for both, and passed one
   * argument where two were expected, so every target entry was built against a target that did not
   * exist.
   */
  buildTargetListEntry(targetList: HTMLElement, { uuid, name }: { uuid: string, name?: string }): HTMLLIElement | void {
    // Let parent build the base entry
    const li = super.buildTargetListEntry(targetList, { uuid, name }) as HTMLLIElement | undefined;
    if (!li) return;

    /*
     * `uuid` is a *token* uuid in 6.0 — dnd5e resolves it and uses `token.actor`. Treating it as an
     * actor made `calculateDamage` throw inside `buildTargetsList`, which aborted the whole map: the
     * tray drew no target rows at all, so Apply had nothing to apply to.
     *
     * `getMergedOptions` rather than `getTargetOptions` for the same reason dnd5e uses it — it is
     * what folds in the chosen multiplier.
     */
    const targetOptions = this.getMergedOptions(uuid);
    const resolved = fromUuidSync(uuid);
    const actor = ((resolved as TokenDocument.Implementation | null)?.actor
      ?? resolved) as Actor.Implementation | null;
    if (!(actor instanceof Actor)) return li;

    const { active } = this.calculateDamage(actor, targetOptions);

    /*
     * Add the change sources dnd5e drops.
     *
     * `#buildChangeSources` skips any type without an icon in `CONFIG.DND5E.damageTypes` —
     * `if (!icon) continue` — so midi's own categories (a save, super/semi-super saver, uncanny
     * dodge, DR, magical/non-magical) never appear, and neither do damage types dnd5e does not know.
     *
     * The 5.x version of this wrote into `.subtitle` and called `getChangeSourceButton`. 6.0
     * restructured the row into a `<target-pill>` with a `.target-pane`, and removed that method, so
     * the old code bailed on the missing selector and silently added nothing.
     */
    this.#addInlineChangeSources(li, uuid, active as Record<string, Set<string> | boolean>, targetOptions);

    const sources = this.#changeSourceList(li);
    if (!sources) return li;
    for (const [change, values] of Object.entries(active as Record<string, Set<string> | boolean>)) {
      // `threshold` is a boolean flag; every other change carries a Set of damage types.
      const types: string[] = change === "threshold"
        ? (values ? ["threshold"] : [])
        : Array.from((values ?? []) as Set<string>);
      for (const type of types) {
        // Anything dnd5e can draw, it already has.
        if (GameSystemConfig.damageTypes[type] || GameSystemConfig.healingTypes?.[type]) continue;
        const icon = MIDI_CHANGE_ICONS[change];
        if (!icon) continue;
        sources.insertAdjacentHTML("beforeend", this.#changeSourceEntry(type, change, icon, targetOptions));
      }
    }

    return li;
  }

  /**
   * Show the active change sources on the target row itself.
   *
   * dnd5e 6.0 moved these into a popover on the target pill, opened by *right-clicking* it
   * (`pointerup` with `button === 2`). Until 5.3 they were inline on the row and one click away, so
   * midi puts them back — icon only, with the state on hover.
   *
   * dnd5e's own `#onPaneInteract` cannot serve these: it cycles whatever is in `#paneState.targets`,
   * which is only populated when the pane opens. The click is handled here against this row's uuid.
   */
  #addInlineChangeSources(
    li: HTMLLIElement,
    uuid: string,
    active: Record<string, Set<string> | boolean>,
    options: DamageApplicationOptions
  ): void {
    const pill = li.querySelector("target-pill");
    if (!pill) return;
    pill.querySelector(".midi-inline-changes")?.remove();
    /*
     * Borrow dnd5e's own structure — `.target-pane > menu.menu-change-sources > li` inside the pill
     * — so its styling for these buttons applies as-is: icon sizing, the strike-through when a
     * source is ignored, the turn-down arrow when downgraded, the pressed colours. Only the pane's
     * chrome is undone in CSS, because here it is an inline row rather than a floating popover.
     */
    const row = document.createElement("div");
    row.classList.add("target-pane", "midi-inline-changes");
    const menu = document.createElement("menu");
    menu.classList.add("menu-change-sources", "unlist");
    row.append(menu);
    for (const [change, values] of Object.entries(active)) {
      const types: string[] = change === "threshold"
        ? (values ? ["threshold"] : [])
        : Array.from((values ?? []) as Set<string>);
      for (const type of types) {
        /*
         * midi's own changes take midi's icon; only dnd5e's take the damage type's. Uncanny dodge
         * is not a property of the damage type — showing `piercing.svg` for it said nothing about
         * what applied — so it uses the image of whatever granted it, recorded when the damage was
         * calculated.
         */
        const midiIcon = change === "uncannyDodge"
          ? (foundry.utils.getProperty(options, "midi.uncannyDodgeIcon") as string | undefined) ?? MIDI_CHANGE_ICONS[change]
          : MIDI_CHANGE_ICONS[change];
        const icon = midiIcon
          ?? (type === "threshold"
            ? "systems/dnd5e/icons/svg/damage/threshold.svg"
            : GameSystemConfig.damageTypes[type]?.icon ?? GameSystemConfig.healingTypes?.[type]?.icon);
        if (!icon) continue;
        const { label, pressed } = this.getChangeSourceOptions(type, change, options);
        const graphic = this.#changeSourceGraphic(icon);
        menu.insertAdjacentHTML("beforeend", `
          <li class="menu-change-source">
          <button type="button" class="change-source unbutton" data-midi-change-source
                  data-type="${type}" data-change="${change}"
                  aria-pressed="${pressed}" aria-label="${label}"
                  data-tooltip="${foundry.utils.escapeHTML(label)}" data-tooltip-direction="UP">
            <span class="icon${graphic.wrapperClass}">
              ${graphic.html}
              <i class="fa-solid fa-slash" inert></i>
              <i class="fa-solid fa-arrow-turn-down" inert></i>
            </span>
          </button>
          </li>`);
      }
    }
    if (!menu.children.length) return;
    row.addEventListener("click", event => this.#onInlineChangeSource(event, li, uuid));
    pill.append(row);
  }

  /**
   * The graphic for a change source.
   *
   * `dnd5e-icon` fetches its src and parses it as SVG — it exists to tint monochrome system icons
   * with `--icon-fill`. An item image is full-colour raster and cannot be used that way, so those
   * render as a plain `<img>` instead.
   */
  #changeSourceGraphic(icon: string): { html: string, wrapperClass: string } {
    if (icon.toLowerCase().endsWith(".svg")) {
      return { html: `<dnd5e-icon src="${icon}" inert></dnd5e-icon>`, wrapperClass: "" };
    }
    // Marker class rather than `:has()` on the wrapper — midi keeps those out of chat-card layout.
    return { html: `<img class="midi-change-source-img" src="${icon}" alt="" inert>`, wrapperClass: " midi-icon-image" };
  }

  /** Cycle a change source from the inline row, mirroring dnd5e's own state machine. */
  #onInlineChangeSource(event: MouseEvent, li: HTMLLIElement, uuid: string): void {
    const button = (event.target as HTMLElement)?.closest<HTMLElement>("[data-midi-change-source]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();   // the row is inside the pill's list; do not also toggle the target
    const { type, change } = button.dataset as { type: string, change: string };
    // The declared shape of `ignore` is a fixed set of keys; cycling treats it generically, so a
    // structural view of just the two fields being mutated keeps this readable without `any`.
    const options = this.getTargetOptions(uuid) as unknown as CyclableOptions;
    const ignored = () => (options.ignore ??= {});
    const setFor = (key: string): Set<string> => {
      const current = ignored()[key];
      if (current instanceof Set) return current;
      const created = new Set<string>();
      ignored()[key] = created;
      return created;
    };
    if (change === "immunity") {
      const immunity = ignored().immunity;
      if (immunity instanceof Set && immunity.has(type)) {
        immunity.delete(type);
        (options.downgrade ??= new Set()).add(type);
      } else if (options.downgrade?.has(type)) options.downgrade.delete(type);
      else setFor(change).add(type);
    } else if (change === "threshold") {
      ignored().threshold = !ignored().threshold;
    } else {
      const current = ignored()[change];
      if (current instanceof Set && current.has(type)) current.delete(type);
      else setFor(change).add(type);
    }
    const token = fromUuidSync(uuid) as TokenDocument.Implementation | null;
    const actor = token?.actor;
    if (!actor) return;
    this.refreshListEntry(li, this.calculateDamage(actor, this.getMergedOptions(uuid)));
    this.#addInlineChangeSources(li, uuid, this.calculateDamage(actor, this.getMergedOptions(uuid)).active, this.getMergedOptions(uuid));
  }

  /** The list dnd5e puts its change sources in; created if it had none of its own to show. */
  #changeSourceList(li: HTMLLIElement): HTMLElement | undefined {
    const existing = li.querySelector<HTMLElement>("menu.menu-change-sources");
    if (existing) return existing;
    const pane = li.querySelector(".target-pane");
    if (!pane) return undefined;
    const label = document.createElement("div");
    label.classList.add("menu-section");
    label.textContent = game.i18n?.localize("DND5E.DamageApplication.Changes") ?? "Changes";
    const menu = document.createElement("menu");
    menu.classList.add("menu-change-sources", "unlist");
    pane.append(label, menu);
    return menu;
  }

  /** One change-source entry, in the shape dnd5e builds them. */
  #changeSourceEntry(type: string, change: string, icon: string, options: DamageApplicationOptions): string {
    const { label, mode, pressed, title } = this.getChangeSourceOptions(type, change, options);
    const graphic = this.#changeSourceGraphic(icon);
    const state = game.i18n?.localize(`DND5E.DamageApplication.State.${mode}`) ?? "";
    return `
      <li class="menu-change-source">
        <button type="button" class="change-source unbutton" data-type="${type}" data-change="${change}"
                aria-pressed="${pressed}" aria-label="${label}">
          <span class="icon${graphic.wrapperClass}">
            ${graphic.html}
            <i class="fa-solid fa-slash" inert></i>
            <i class="fa-solid fa-arrow-turn-down" inert></i>
          </span>
          <span class="title">${title}</span>
          <span class="menu-section">${state}</span>
        </button>
      </li>`;
  }

  /**
   * dnd5e's per-target options, decorated with midi's save/resistance detail.
   *
   * Built on `super` rather than in a private map of midi's own. The old version seeded
   * `{ multiplier: 1 }`, and `getMergedOptions` resolves `options.multiplier ?? fallback` — so the
   * multiplier was pinned to 1 and the ×½/×2 buttons had no effect. It also dropped the
   * `originatingMessage` dnd5e's default carries.
   */
  getTargetOptions(uuid: string): DamageApplicationOptions {
    const options = super.getTargetOptions(uuid) as DamageApplicationOptions;
    let sourceActorUuid = foundry.utils.getProperty(this.chatMessage, "flags.midi-qol.sourceActorUuid");
    try {
      let targetDetails;
        /*
         * `system.targets` — dnd5e's own list, which `MidiUsageMessageData` extends with midi's
         * per-target detail. `flags.dnd5e.targets` is read but never written any more; it is where
         * this lived before 6.0 moved targets onto the message system data.
         *
         * Matched on the token uuid first: 6.0 passes a token uuid here, and a target's entry is
         * identified by `token`, with `actor`/`uuid` covering older cards.
         */
        const systemTargets = (foundry.utils.getProperty(this.chatMessage, "system.targets") ?? []) as Array<Record<string, any>>;
        const legacyTargets = (foundry.utils.getProperty(this.chatMessage, WorkflowDataFlags.targetDescriptors)
          ?? []) as Array<CombinedTargetDescriptor>;
        const targets = (systemTargets.length ? systemTargets : legacyTargets) as Array<CombinedTargetDescriptor>;
        targetDetails = targets.find(target =>
          (target as { token?: string }).token === uuid || target.uuid === uuid
          || (target as { actor?: string }).actor === uuid);
        if (!targetDetails) return options;
        options.midi = foundry.utils.duplicate(targetDetails);
        const saveMultiplier = targetDetails.saveMults?.[this.damageType];
        if (targetDetails.saved) {
          foundry.utils.setProperty(options, "midi.saveMultiplier", saveMultiplier ?? configSettings.defaultSaveMultiplier);
        }
        if (saveMultiplier !== undefined) {
          if (targetDetails.superSaver && saveMultiplier === configSettings.defaultSaveMultiplier) {
            foundry.utils.setProperty(options, "midi.saveMultiplier", targetDetails.saved ? 0 : configSettings.defaultSaveMultiplier);
          }
          if (targetDetails.semiSuperSaver && saveMultiplier === configSettings.defaultSaveMultiplier) {
            foundry.utils.setProperty(options, "midi.saveMultiplier", targetDetails.saved ? 0 : 1);
          }
        }
        if (targetDetails.uncannyDodge) {
          foundry.utils.setProperty(options, "midi.uncannyDodge", true);
        }
        // Left in for backwards compatibility of previous midi versions
        if (targetDetails.sourceActorUuid) {
          sourceActorUuid = targetDetails.sourceActorUuid;
        }
    } catch (err) {
      const message = `midi-qol | _DAgetTargetOptions failed to get target options`;
      console.warn(message, err);
      TroubleShooter.recordError(err, message);
    }
    foundry.utils.setProperty(options, "midi.sourceActorUuid", sourceActorUuid);
    return options;
  }
  // Flag categories for active damage modifiers
  static SET_FLAGS = ["modification", "resistance", "vulnerability", "immunity",
    "absorption", "spell", "magic", "nonmagic", "DR", "uncannyDodge"];
  static SAVE_FLAGS = ["saved", "superSaver", "semiSuperSaver"]; // Use "all" type for consolidated icon
  static BOOL_FLAGS = ["threshold"];

  calculateDamage(actor: Actor.Implementation, options: DamageApplicationOptions) {
    // @ts-expect-error no dnd5e-types
    const damages = actor.calculateDamage(this.damages, options) as DamageDescription[];
    // @ts-expect-error amount, temp, tempMax are on the damages array
    const { amount: total, temp: rawTemp, tempMax: rawTempMax } = damages;
    const temp = Math.floor(Math.max(0, rawTemp ?? 0));
    const tempMax = rawTempMax ?? 0;

    // Build active object from flag categories
    const active: Record<string, Set<string> | boolean> = {};
    for (const flag of [...DamageApplicationElementMidi.SET_FLAGS, ...DamageApplicationElementMidi.SAVE_FLAGS]) {
      active[flag] = new Set();
    }
    for (const flag of DamageApplicationElementMidi.BOOL_FLAGS) {
      active[flag] = false;
    }

    try {
      for (const damage of damages) {
        const isDRType = ["none", "midi-none"].includes(damage.type);

        // Set flags that use actual damage type
        for (const flag of DamageApplicationElementMidi.SET_FLAGS) {
          if (isDnd5e53) {
            if (damage.active?.type?.[flag]) (active[flag] as Set<string>).add(damage.type);
            if (damage.active?.all?.[flag]) (active[flag] as Set<string>).add("ALL");
          } else {
            if (damage.active?.[flag]) (active[flag] as Set<string>).add(damage.type);
          }
        }
        // Save flags use "all" for consolidated icon, skip DR types
        if (!isDRType) {
          for (const flag of DamageApplicationElementMidi.SAVE_FLAGS) {
            if (isDnd5e53) {
              if (damage.active?.type?.[flag] || damage.active?.all?.[flag]) (active[flag] as Set<string>).add("all");
            } else {
              if (damage.active?.[flag]) (active[flag] as Set<string>).add("all");
            }
          }
        }
        // Boolean flags (threshold stays flat in both versions)
        for (const flag of DamageApplicationElementMidi.BOOL_FLAGS) {
          if (damage.active?.[flag]) active[flag] = true;
        }
      }

      // Union with ignore sets to preserve button display for ignored items
      for (const flag of [...DamageApplicationElementMidi.SET_FLAGS, ...DamageApplicationElementMidi.SAVE_FLAGS]) {
        if (foundry.utils.getType(options.ignore?.[flag]) === "Set") {
          active[flag] = (active[flag] as Set<string>).union(options.ignore?.[flag]);
        }
      }
      // Special cases
      if (options.downgrade instanceof Set) {
        active.immunity = (active.immunity as Set<string>).union(options.downgrade);
      }
      // @ts-expect-error threshold exists on dnd5e's ignore type
      active.threshold ||= options.ignore?.threshold ?? false;
    } catch (err) {
      const message = `midi-qol | calculateDamage failed to calculate damage`;
      console.warn(message, err);
      TroubleShooter.recordError(err, message);
    }
    return { temp, tempMax, total, active };
  }
}
