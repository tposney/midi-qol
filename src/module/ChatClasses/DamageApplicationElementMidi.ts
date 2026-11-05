import { configSettings, ALL_DAMAGE_KEY, safeGetGameSetting } from "../settings.js";
import { GameSystemConfig, MODULE_ID, i18nFormat } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { displayTokenName, setupDamageDetails } from "../utils.js";
import { prepareDamageListToJSON, timedAwaitExecuteAsGM } from "../GMAction.js";
import { Workflow } from "../Workflow.js";
import { cardMidiState, cardTargetDetail, storedMidiFlag, cardDamageMatches } from "../lib/cardState.js";
import { CombinedTargetDescriptor, DamageApplicationOptions, DamageDescription, DamageListEntry, Dnd5eSystem } from "../../globals.js";

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

/** As dnd5e's multiplier buttons show them. */
const MULTIPLIER_LABELS: Record<string, string> = { "0.25": "¼", "0.5": "½" };

export class DamageApplicationElementMidi extends globalThis.dnd5e.applications.components.DamageApplicationElement {
  chatMessage;
  damages: any[] = [];
  damageType: string = "defaultDamage";

  /** dnd5e fills `damages` from every damage roll on the card; this tray applies only its own type's. */
  connectedCallback() {
    this.damageType = this.dataset.damageType ?? "defaultDamage";
    super.connectedCallback();
    const rolls: Roll[] = (this.chatMessage?.rolls ?? []).filter((r: Roll) =>
      foundry.utils.getProperty(r, `options.${MODULE_ID}.rollType`) === this.damageType);
    // The ammunition's other damage is kept apart: it applies by its own condition and save.
    const isAmmunition = (r: Roll) => !!foundry.utils.getProperty(r, `options.${MODULE_ID}.ammunition`);
    const damagesOf = (group: Roll[], midiAmmunition: boolean) => (game.system as Dnd5eSystem).dice
      .aggregateDamageRolls(group, { respectProperties: true }).map(roll => ({
        properties: new Set(roll.options.properties ?? []),
        type: roll.options.type,
        value: Math.max(0, roll.total ?? 0),
        ...(midiAmmunition ? { midiAmmunition } : {})
      }));
    this.damages = [...damagesOf(rolls.filter(r => !isAmmunition(r)), false), ...damagesOf(rolls.filter(isAmmunition), true)];
    this.targetList?.buildTargetsList();
  }


  /**
   * dnd5e marks every multiplier in use on the tray's row but not who has which; when targets differ, each pill shows
   * its own.
   */
  refreshMultiplier() {
    super.refreshMultiplier();
    const list: HTMLElement | undefined = this.targetList;
    const pills = Array.from(list?.querySelectorAll<HTMLElement>("target-pill") ?? []);
    const multipliers = pills.map(pill => {
      const uuid = pill.querySelector("option")?.value;
      return uuid ? this.getMergedOptions(uuid).multiplier as number : undefined;
    });
    const mixed = new Set(multipliers).size > 1;
    pills.forEach((pill, index) => {
      pill.querySelector(".midi-target-multiplier")?.remove();
      const multiplier = multipliers[index];
      if (!mixed || multiplier === undefined) return;
      const marker = document.createElement("span");
      marker.className = "midi-target-multiplier";
      marker.textContent = `×${MULTIPLIER_LABELS[String(multiplier)] ?? multiplier}`;
      pill.querySelector("label")?.after(marker);
    });
  }

  /** A target's figures change with its multiplier, set from its pane; keep the markers in step. */
  refreshListEntry(entry: HTMLElement, damage: { temp: number, tempMax: number, total: number }) {
    super.refreshListEntry(entry, damage);
    if (entry.isConnected && this.targetList?.isConnected) this.refreshMultiplier();
  }

  /**
   * Apply as midi's workflow does: each target's damage, as this tray calculates it, goes through the workflow's
   * damage hooks (CAT/CPR edit the damage item there), then the GM applies it and records a linked undo card.
   * dnd5e's Apply calls `actor.applyDamage`, which skips the hooks and leaves no undo card.
   */
  async _onApplyDamage(event: Event) {
    event.preventDefault();
    const message = this.chatMessage as ChatMessage.Implementation | undefined;
    // The card's workflow runs the damage hooks; another user's card only names the attacker (a read-only copy)
    const workflow = message ? Workflow.findWorkflow(message.uuid) : undefined;
    const source = workflow ?? (message ? Workflow.cardView(message.uuid) : undefined);
    const damageList: DamageListEntry[] = [];
    for (const option of Array.from<HTMLOptionElement>(this.targetList.querySelectorAll("option"))) {
      const token = fromUuidSync(option.value) as TokenDocument.Implementation | null;
      const actor = token?.actor;
      if (!token?.isOwner || !actor) continue;
      const calcDamageOptions = this.getMergedOptions(option.value);
      // @ts-expect-error no dnd5e-types
      const combinedDamage: DamageDescription[] = foundry.utils.deepClone(actor.calculateDamage(this.damages, calcDamageOptions));
      const midiOptions = (calcDamageOptions.midi ?? {}) as { saved?: boolean, superSaver?: boolean, semiSuperSaver?: boolean };
      const entry = setupDamageDetails({
        actorId: actor.id!,
        actorUuid: actor.uuid,
        critical: false,
        damageDetail: combinedDamage,
        damageDetails: { combinedDamage, rawcombinedDamage: this.damages, calcDamageOptions: { combinedDamage: calcDamageOptions } },
        isHit: true,
        rawDamageDetail: this.damages,
        saved: !!midiOptions.saved,
        sceneId: token.parent?.id ?? "",
        semiSuperSaver: !!midiOptions.semiSuperSaver,
        superSaver: !!midiOptions.superSaver,
        totalDamage: this.damages.reduce((total: number, d: DamageDescription) => total + (d.value ?? 0), 0),
        targetUuid: token.uuid,
      }, "combinedDamage", actor);
      if (!entry) continue;
      if (workflow && token.object) await workflow.callDamageHooksAndMacros(entry, token.object);
      damageList.push(entry);
    }
    if (damageList.length) await timedAwaitExecuteAsGM("createReverseDamageCard", {
      autoApplyDamage: "yesCard",
      actorId: source?.actor?.id,
      actorUuid: source?.actor?.uuid,
      charName: source?.token?.name ?? source?.actor?.name ?? game.user?.name,
      damageList: prepareDamageListToJSON(damageList),
      chatCardUuid: message?.uuid,
      updateOptions: { awaitDamageApplication: true },
      forceApply: true,
    });
    if (safeGetGameSetting("dnd5e", "autoCollapseChatTrays") !== "manual") this.open = false;
  }

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
    const li = super.buildTargetListEntry(targetList, { uuid, name: name && displayTokenName(uuid, name) }) as HTMLLIElement | undefined;
    if (!li) return;

    // dnd5e shows no damage detail for tokens the user does not own, and neither does midi.
    const token = fromUuidSync(uuid) as TokenDocument.Implementation | null;
    if (!token?.isOwner || !(token.actor instanceof Actor)) return li;

    const targetOptions = this.getMergedOptions(uuid);
    const { active } = this.calculateDamage(token.actor, targetOptions);
    this.#addInlineChangeSources(li, active as Record<string, Set<string> | boolean>, targetOptions);
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
        // As dnd5e's own change sources: "ALL" is the All Damage trait, not a damage type.
        const icon = midiIcon
          ?? (type === ALL_DAMAGE_KEY ? "systems/dnd5e/icons/svg/damage/all.svg"
            : type === "threshold" ? "systems/dnd5e/icons/svg/damage/threshold.svg"
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
    row.addEventListener("click", event => this.#onInlineChangeSource(event, li));
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

  /**
   * Cycle a change source from the inline row, mirroring dnd5e's own state machine, for every token
   * in the pill: dnd5e groups tokens that share their options, and Apply applies each one's own.
   */
  #onInlineChangeSource(event: MouseEvent, li: HTMLLIElement): void {
    const button = (event.target as HTMLElement)?.closest<HTMLElement>("[data-midi-change-source]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();   // the row is inside the pill's list; do not also toggle the target
    const { type, change } = button.dataset as { type: string, change: string };
    const uuids = Array.from(li.querySelectorAll<HTMLOptionElement>("target-pill option"), o => o.value);
    for (const uuid of uuids) {
      // The declared shape of `ignore` is a fixed set of keys; cycling treats it generically.
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
    }
    const actor = (fromUuidSync(uuids[0] ?? "") as TokenDocument.Implementation | null)?.actor;
    if (!actor) return;
    const options = this.getMergedOptions(uuids[0]);
    const damage = this.calculateDamage(actor, options);
    this.refreshListEntry(li, damage);
    this.#addInlineChangeSources(li, damage.active as Record<string, Set<string> | boolean>, options);
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
        // `system.targets`, which MidiUsageMessageData extends with midi's per-target detail. 6.0
        // passes a token uuid here; an actor uuid covers targets recorded without a token.
        const targets = (foundry.utils.getProperty(this.chatMessage, "system.targets") ?? []) as Array<CombinedTargetDescriptor>;
        const descriptor = targets.find(target => target.token === uuid || target.actor === uuid);
        if (!descriptor) return options;
        targetDetails = cardTargetDetail(this.chatMessage, descriptor.token ?? uuid, foundry.utils.duplicate(descriptor)) as CombinedTargetDescriptor;
        options.midi = foundry.utils.duplicate(targetDetails);
        // What a successful save does to this tray's damage; the calculation adds Super Saver per damage entry.
        const saveMultiplier = targetDetails.saveMults?.[this.damageType as "defaultDamage" | "otherDamage" | "bonusDamage"];
        if (saveMultiplier !== undefined || targetDetails.saved)
          foundry.utils.setProperty(options, "midi.saveMultiplier", saveMultiplier ?? configSettings.defaultSaveMult);
        if (this.damageType === "otherDamage") {
          // Null until worked out: the damage then applies to every target
          const midi = cardMidiState(this.chatMessage);
          const otherMatches: string[] | undefined = midi ? cardDamageMatches(midi, "otherDamage") : storedMidiFlag(this.chatMessage, "otherDamageMatchUuids");
          const ammunitionMatches: string[] | undefined = midi ? cardDamageMatches(midi, "ammunitionDamage") : storedMidiFlag(this.chatMessage, "ammunitionDamageMatchUuids");
          const token = targetDetails.token ?? uuid;
          if (otherMatches) foundry.utils.setProperty(options, "midi.otherApplies", otherMatches.includes(token));
          if (ammunitionMatches) foundry.utils.setProperty(options, "midi.ammunitionApplies", ammunitionMatches.includes(token));
          if (targetDetails.saveMults?.ammunition !== undefined)
            foundry.utils.setProperty(options, "midi.ammunitionSaveMultiplier", targetDetails.saveMults.ammunition);
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
          if (damage.active?.type?.[flag]) (active[flag] as Set<string>).add(damage.type);
          if (damage.active?.all?.[flag]) (active[flag] as Set<string>).add("ALL");
        }
        // Save flags use "all" for consolidated icon, skip DR types
        if (!isDRType) {
          for (const flag of DamageApplicationElementMidi.SAVE_FLAGS) {
            if (damage.active?.type?.[flag] || damage.active?.all?.[flag]) (active[flag] as Set<string>).add("all");
          }
        }
        // Boolean flags (threshold is flat)
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
        active.resistance = (active.resistance as Set<string>).difference(options.downgrade);
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
