import { GameSystemConfig, MESSAGE_TYPES, MODULE_ID, MQDamageRollTypes, debugEnabled, error, i18n, log } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";
import { Dnd5eSystem } from "../../globals.js";
import { configSettings, forceHideRoll, safeGetGameSetting, saveToChatCard } from "../settings.js";
import { getToken, isDnd5eRollMessage } from "../utils.js";

// Damage is auto-applied by midi when autoApplyDamage is one of the "yes*" modes.
const midiAutoAppliesDamage = () => !!configSettings.autoApplyDamage?.toLowerCase().includes("yes");

// Each damage section's root element is its .dice-roll.
const DAMAGE_ROLLS = ":is(.midi-damage-roll, .midi-other-damage-roll, .midi-bonus-damage-roll)";
const removeAll = (html: HTMLElement, sel: string) => html.querySelectorAll(sel).forEach(el => el.remove());
const hideAll = (html: HTMLElement, sel: string) => html.querySelectorAll<HTMLElement>(sel).forEach(el => el.style.display = "none");
const stripHighlight = (html: HTMLElement, sel: string) => html.querySelectorAll<HTMLElement>(sel).forEach(
  el => el.classList.remove("success", "failure", "critical", "fumble")
);

/** rollType tag -> the flag it is rebuilt into. utilityRolls is absent: chatRolls merges them. */
/** The attack roll on a card, located by its tag rather than by position. */
function attackRollOf(message: { rolls?: readonly Roll[] }): Roll | undefined {
  return (message.rolls ?? []).find(r =>
    foundry.utils.getProperty(r, `options.${MODULE_ID}.rollType`) === "attack");
}

const MIDI_ROLL_FLAGS: Record<string, string> = {
  attack: "attackRoll",
  defaultDamage: "damageRolls",
  bonusDamage: "bonusDamageRolls",
  otherDamage: "otherDamageRolls"
};

import Token = foundry.canvas.placeables.Token;
let _highlighted: Token.Implementation | null = null;

const onTargetHover = (event) => {
  event.preventDefault();
  if (!canvas.scene?.active) return;
  const token = canvas.tokens?.get(event.currentTarget?.dataset?.id ?? "");
  if (token?.isVisible) {
    //@ts-expect-error _onHoverIn
    if (!token.controlled) token._onHoverIn(event);
    _highlighted = token;
  }
}

const onTargetHoverOut = (event) => {
  event.preventDefault();
  if (!canvas.scene?.active) return;
  //@ts-expect-error onHoverOut
  if (_highlighted) _highlighted._onHoverOut(event);
  _highlighted = null;
}

const onTargetSelect = (event) => {
  event.stopPropagation();
  event.preventDefault();
  if (!canvas.scene?.active) return;
  const token = canvas.tokens?.get(event.currentTarget.dataset.id);
  if (token?.controlled) token?.release();
  else if (token && token?.isVisible && game.user && token.actor?.testUserPermission(game.user, "OWNER")) {
    token.control({ releaseOthers: false });
    canvas.animatePan(token.center)
  }
};

function onTargetShow(event) {
  event.stopImmediatePropagation();
  event.preventDefault();
  if (!canvas.scene?.active) return;
  const token = canvas.tokens?.get(event.currentTarget.dataset.id);
  if (game.user && token?.actor?.testUserPermission(game.user, "OWNER")) {
    token.actor.sheet?.render(true);
  }
}

export let ChatMessageMidi: ReturnType<typeof defineChatMessageMidiClass>;

export function setupChatMessageMidi() {
  ChatMessageMidi = defineChatMessageMidiClass(globalThis.dnd5e.documents.ChatMessage5e);
  CONFIG.ChatMessage.batchSize = 25;
  // Not pushed onto dnd5e's array as well — the `TRAY_TYPES` getter below already appends it, and
  // doing both listed `midi-damage-application` twice (harmless, but it mutates the system's array).
}

export function defineChatMessageMidiClass(baseClass: ChatMessage.ImplementationClass) {
  return class ChatMessageMidi extends baseClass /*globalThis.dnd5e.documents.ChatMessage5e*/ {

    /**
     * dnd5e's lookup, then a synthetic item rebuilt from the snapshot midi keeps on the card. Every
     * dnd5e caller (card context, button actions, effects tray) and `getAssociatedActivity` go through
     * this. midi does not use dnd5e's own snapshot slot, `system.deltas.deleted`: a refund recreates
     * everything listed there on the actor.
     */
    getAssociatedItem(options: { scaled?: boolean } = {}): Item.Implementation | undefined {
      // @ts-expect-error no dnd5e-types
      const item = super.getAssociatedItem(options);
      if (item) return item;
      const data = this.getFlag(MODULE_ID, "itemData") as Item.CreateData | undefined;
      // @ts-expect-error no dnd5e-types
      const actor = this.getAssociatedActor();
      if (!data || !actor) return undefined;
      // @ts-expect-error no dnd5e-types
      return new CONFIG.Item.documentClass(data, { parent: actor }).scaledClone(options.scaled ? this.system.scaling : null);
    }

    prepareDerivedData() {
      super.prepareDerivedData();

      // Deserialize roll flags in-place from JSON to Roll instances (same pattern as Foundry core's ChatMessage.rolls)
      const midiFlags = this.flags?.[MODULE_ID];
      if (!midiFlags) return;

      const attackData = midiFlags.attackRoll;
      if (attackData && !(attackData instanceof Roll)) {
        midiFlags.attackRoll = Roll.fromData(attackData) as Roll;
      }

      for (const field of ["damageRolls", "bonusDamageRolls", "otherDamageRolls",
        "utilityRolls"] as const) {
        const data = midiFlags[field];
        if (data?.length) {
          midiFlags[field] = data.map((r: any) => r instanceof Roll ? r : Roll.fromData(r));
        }
      }
      this.deriveRollFlags(midiFlags);
    }

    /**
     * Put the rolls back on the flags from `this.rolls`.
     *
     * They are no longer stored there - a roll on the flags was a second copy of one already in
     * `message.rolls`, tagged with its `options["midi-qol"].rollType`. `flags` is a deep clone of
     * the source (ObjectField#initialize), so nothing written here reaches the database.
     * Only fills what is absent, leaving messages written before the change on their stored copies.
     */
    deriveRollFlags(midiFlags: Record<string, any>) {
      if (!midiFlags.messageType) return;
      const derived: Record<string, Roll[]> = {};
      for (const roll of this.rolls) {
        const field = MIDI_ROLL_FLAGS[foundry.utils.getProperty(roll, `options.${MODULE_ID}.rollType`) as string];
        if (field) (derived[field] ??= []).push(roll);
      }
      for (const [field, rolls] of Object.entries(derived)) {
        if (field === "attackRoll") midiFlags.attackRoll ??= rolls[0];
        else if (!midiFlags[field]?.length) midiFlags[field] = rolls;
      }
    }

    static get TRAY_TYPES() {
      return globalThis.dnd5e.documents.ChatMessage5e.TRAY_TYPES.concat(["midi-damage-application"]);
    }
    get isRoll() {
      if (this.flags?.[MODULE_ID]?.messageType) return false // do this so that dsn won't trigger
      return super.isRoll;
    }

    get hasRolls() {
      if ((this.flags?.[MODULE_ID]?.roll?.length ?? 0) > 0) return true;
      return super.isRoll;
    }
    /** The weapon mastery line dnd5e 6 renders on its own attack cards, added to midi's card. */
    #addMasteryLine(html: HTMLElement) {
      const attackRoll = attackRollOf(this) ?? this.rolls[0];
      // @ts-expect-error no dnd5e-types
      if (!(attackRoll instanceof dnd5e.dice.D20Roll)) return;

      // @ts-expect-error no dnd5e-types
      const masteryConfig = CONFIG.DND5E.weaponMasteries[attackRoll.options.mastery];
      if (!masteryConfig) return;

      const p = document.createElement("p");
      p.classList.add("supplement");
      let mastery = masteryConfig.label;
      if (masteryConfig.reference) mastery = `
        <a class="content-link" draggable="true" data-link data-uuid="${masteryConfig.reference}"
           data-tooltip="${mastery}" style="text-wrap: auto;">${mastery}</a>
      `;
      p.innerHTML = `<string>${i18n("DND5E.WEAPON.Mastery.Flavor")}</string> ${mastery}`;
      const condensedSection = html.querySelector(".midi-results > .flexrow");
      if (condensedSection) {
        condensedSection.after(p);
      } else {
        html.querySelector(".midi-qol-attack-roll")?.appendChild(p);
      }
    }

    get canSelectTargets() {
      if (this.flags?.[MODULE_ID]?.messageType === "attack") return true;
      // @ts-expect-error no dnd5e-types
      return super.canSelectTargets;
    }

    get canApplyDamage() {
      if ((this.flags?.[MODULE_ID]?.damageDetail?.length ?? 0) > 0 && this.isContentVisible && !!canvas.tokens?.controlled.length) return true;
      // @ts-expect-error no dnd5e-types
      return super.canApplyDamage;
    }

    /** Select the hit or missed targets (dnd5e 6 calls this with the type only). */
    selectTargets(type: "hit" | "miss") {
      if (!canvas?.ready) return;
      // @ts-expect-error no dnd5e-types
      if (!this.flags?.[MODULE_ID]) return super.selectTargets(type);
      const targetData = this.getFlag(MODULE_ID, "targets") || [];
      const targetUuids: string[] = targetData.map(t => t.uuid);
      let hitTargetUuids: string[] = this.getFlag(MODULE_ID, "hitTargetUuids") || [];
      let uuids: string[];
      if (type === "hit") uuids = hitTargetUuids
      else uuids = targetUuids.filter(uuid => !hitTargetUuids.includes(uuid));
      canvas.tokens?.releaseAll();
      uuids.forEach(uuid => {
        const token = getToken(uuid);
        if (!token?.actor || !game.user) return;
        if (token.isVisible && token.actor.testUserPermission(game.user, "OWNER")) {
          token.control({ releaseOthers: false });
        }
      });
    }

    /**
   * Apply rolled dice damage to the token or tokens which are currently controlled.
   * This allows for damage to be scaled by a multiplier to account for healing, critical hits, or resistance
   *
   * @param {HTMLElement} li      The chat entry which contains the roll data
   * @param {number} multiplier   A damage multiplier to apply to the rolled damage.
   * @returns {Promise}
   */
    applyChatCardDamage(li: HTMLElement, multiplier: number) {
      const type = isDnd5eRollMessage(this) ? "roll" : undefined;
      // @ts-expect-error no dnd5e-types
      if (type !== undefined || !this.flags?.[MODULE_ID]) return super.applyChatCardDamage(li, multiplier);
      const rollsToCheck = this.rolls.filter(r => MQDamageRollTypes.includes(foundry.utils.getProperty(r, "options.midi-qol.rollType") as string));
      const damages = (game.system as Dnd5eSystem).dice.aggregateDamageRolls(rollsToCheck, { respectProperties: true }).map(roll => ({
        value: roll.total,
        type: roll.options.type,
        properties: new Set(roll.options.properties ?? [])
      }));
      if (canvas.tokens) {
        return Promise.all(canvas.tokens.controlled.map(t => {
          //@ts-expect-error no dnd5e-types
          return t.actor?.applyDamage(damages, { multiplier, invertHealing: false, ignore: true });
        }));
      }
    }
    
    applyChatCardTemp(li: HTMLElement) {
      if (!canvas.tokens) return;
      const rollsToCheck = this.rolls.filter(r => MQDamageRollTypes.includes(foundry.utils.getProperty(r, "options.midi-qol.rollType") as string));
      const total = rollsToCheck.reduce((acc, roll) => acc + (roll.total ?? 0), 0);

      return Promise.all(canvas.tokens.controlled.map(t => {
        //@ts-expect-error no dnd5e-types
        return t.actor?.applyTempHP(total);
      }));
    }

    _collapseTrays(html: HTMLElement) {
      // @ts-expect-error no dnd5e-types
      super._collapseTrays(html);
      if (!this.flags?.[MODULE_ID]?.messageType) return;
      const open = !midiAutoAppliesDamage();
      html.querySelectorAll("midi-damage-application").forEach(el => {
        el.toggleAttribute("open", open);
        el.querySelector(".collapsible")?.classList.toggle("collapsed", !open);
      });
    }

    /**
     * Add critical/fumble/success/failure classes and icons for midi messages.
     * Used by _enrichChatCard for midi's usage cards. Does not mutate document flags (safe during async super._enrichChatCard).
     */
    private _highlightMidiRolls(html: HTMLElement) {
      function makeIcon(cls: string) {
        const icon = document.createElement("i");
        icon.classList.add("fas", cls);
        icon.setAttribute("inert", "");
        return icon;
      }
      // Each d20 roll with its own total: the rendered totals do not line up with `rolls` (damage is
      // aggregated into one block, and save rolls render inside their target's row).
      const pairs: [Roll, Element | null | undefined][] = [];
      const attack = attackRollOf(this);
      if (attack) pairs.push([attack, html.querySelector(".midi-attack-roll .dice-total")]);
      for (const roll of this.rolls) {
        if (foundry.utils.getProperty(roll, `options.${MODULE_ID}.rollType`) !== "save") continue;
        const uuid = foundry.utils.getProperty(roll, `options.${MODULE_ID}.targetUuid`);
        const row = html.querySelector(`.midi-qol-save-name[data-uuid="${uuid}"]`)?.closest("li");
        pairs.push([roll, row?.querySelector(".midi-qol-save-tooltip .dice-total")]);
      }
      for (const [d20Roll, total] of pairs) {
        if (!total) continue;
        total.classList.remove("success", "failure", "critical", "fumble");
        total.querySelector(".icons")?.remove();

        const d0 = d20Roll?.dice?.[0];
        if (!d0 || d0.faces !== 20 || d0.values?.length !== 1) continue;

        // @ts-expect-error D20Roll not typed
        const d20 = dnd5e.dice.D20Roll.fromRoll(d20Roll);
        if (d20.isCritical) total.classList.add("critical");
        if (d20.isFumble) total.classList.add("fumble");
        if (d20.dice[0]?.options?.target) {
          if (d20.isSuccess) total.classList.add("success");
          else total.classList.add("failure");
        }

        const icons = document.createElement("div");
        icons.classList.add("icons");
        if (total.classList.contains("critical")) icons.append(makeIcon("fa-check-double"));
        else if (total.classList.contains("fumble")) icons.append(makeIcon("fa-xmark"), makeIcon("fa-xmark"));
        else if (total.classList.contains("success")) icons.append(makeIcon("fa-check"));
        else if (total.classList.contains("failure")) icons.append(makeIcon("fa-xmark"));
        if (icons.children.length) total.append(icons);
      }
    }

    /**
     * Strip or adjust classes and icons based on midi highlight/visibility settings.
     */
    private _applyMidiHighlightSettings(html: HTMLElement) {
      const isMidiMessage = !!this.flags?.[MODULE_ID]?.messageType;
      const hideResult = isMidiMessage && !game.user?.isGM && (["whisper", "gmOnly"].includes(configSettings.autoCheckHit) || safeGetGameSetting("dnd5e", "attackRollVisibility") === "none");
      // dnd5e 6's compact roll markup carries the classes on the roll button and keeps an icons span there.
      const totals = html.querySelectorAll(".dice-total, button.dice-roll");
      for (const total of Array.from(totals)) {
        if (hideResult || !configSettings.highlightSuccess) {
          total.classList.remove("success", "failure", "critical", "fumble");
          if (total.matches("button.dice-roll")) total.querySelector(".icons")?.replaceChildren();
          else total.querySelector(".icons")?.remove();
        } else if (configSettings.highLightCriticalAttackOnly) {
          const hadSuccessOrFailure = total.classList.contains("success") || total.classList.contains("failure");
          total.classList.remove("success", "failure");
          if (hadSuccessOrFailure && !total.classList.contains("critical") && !total.classList.contains("fumble")) {
            total.querySelector(".icons")?.remove();
          }
        }
      }
    }

    /**
     * dnd5e's enrichment, deliberately not awaited: dnd5e does not await `_enrichChatCard` for card
     * models either, so waiting here would apply midi's masking only after the card is on screen.
     * Nothing dnd5e does after its first await touches what midi masks or highlights.
     */
    #enrichSystemCard(html: HTMLElement, options: object) {
      // @ts-expect-error no dnd5e-types
      const enriched = super._enrichChatCard(html, options) as Promise<void> | undefined;
      enriched?.catch?.(err => {
        const message = `${MODULE_ID} | dnd5e chat card enrichment failed`;
        error(message, err);
        TroubleShooter.recordError(err, message);
      });
    }

    /**
     * Mask the dice of a blind roll, and blank an obscured roll's result, for non-GMs.
     *
     * Lives here rather than on `renderChatMessageHTML` because core fires that hook inside
     * `super.renderHTML()`, before dnd5e's subclass fills `.message-content` from the data model.
     * Measured at hook time on a 6.0 card: `dice-roll=0`, `dice-total=0`; populated by the next
     * frame. So the masking ran against an empty card and hid nothing — a blind roll's dice were
     * visible to every player. `_enrichChatCard` runs on both render paths (the model's `getHTML`
     * and dnd5e's own branch for messages without one) and after midi's highlighting, so this is
     * the last word on the markup.
     */
    private maskHiddenRolls(html: HTMLElement) {
      if (game.user?.isGM) return;
      if (this.blind) {
        html.querySelectorAll(".midi-attack-roll .dice-roll").forEach(el => el.replaceWith(rolledPlaceholder()));
        // monks-tokenbar renders its own rolls and does its own hiding.
        if (!this.flags?.["monks-tokenbar"]) {
          html.querySelectorAll(".dice-roll").forEach(el => el.replaceWith(rolledPlaceholder()));
          html.querySelectorAll(".roll-breakdown").forEach(el => el.remove());
        }
      }
      if (foundry.utils.getProperty(this, `flags.${MODULE_ID}.obscureRoll`)) obscureRolls(html);
      // A save on its own in the log, belonging to a midi card, shows what midi's save display allows.
      const card = midiCardOf(this);
      if (card && maskSaveForPlayers(html, this, card) === "remove") html.style.display = "none";
      // dnd5e 6 draws a card's save and check messages inside it as summaries, whatever their own visibility.
      html.querySelectorAll<HTMLElement>(".card-summary[data-message-id]").forEach(summary => {
        const source = game.messages?.get(summary.dataset.messageId ?? "");
        if (!source) return;
        if (isMidiCard(this) && maskSaveForPlayers(summary, source, this) === "remove") return summary.remove();
        const view = hiddenRollView(source);
        if (view === "none") summary.remove();
        else if (view === "placeholder") summary.replaceChildren(rolledPlaceholder());
        else if (foundry.utils.getProperty(source, `flags.${MODULE_ID}.obscureRoll`)) obscureRolls(summary);
      });
    }

    maskAttackRolls(html: HTMLElement) {
      if (!this.author?.isGM || game.user?.isGM) return;
      const hitFlag = this.flags?.[MODULE_ID]?.isHit;
      const hitString = hitFlag === undefined ? "" : hitFlag ? i18n("midi-qol.hits") : i18n("midi-qol.misses");
      const isCritical = this.flags?.[MODULE_ID]?.isCritical;
      const isFumble = this.flags?.[MODULE_ID]?.isFumble;
      const attackDisplay = configSettings.gmAttackDisplay ?? "full";
      const damageDisplay = configSettings.gmDamageDisplay ?? "full";

      // Attack roll masking
      let attackRollText: string | undefined;
      let hideCritFumble = false;
      // Located by tag, not position: the card now also carries the save rolls, and a save-only card
      // has no attack roll at index 0 at all.
      const attackRoll = attackRollOf(this) ?? this.rolls[0];
      switch (attackDisplay) {
        case "full":
          break;
        case "hideFormula":
          break;
        case "d20Only":
          attackRollText = `(d20) ${attackRoll?.terms[0].total ?? "--"}`;
          break;
        case "attackTotal":
          attackRollText = `${attackRoll?.total ?? "--"}`;
          break;
        case "hitMiss":
          hideCritFumble = true;
          attackRollText = hitString;
          break;
        case "hitMissCrit":
          attackRollText = hitString;
          if (isCritical) attackRollText = i18n("midi-qol.criticalHit");
          else if (isFumble) attackRollText = i18n("midi-qol.fumble");
          break;
        case "hidden":
          hideCritFumble = true;
          attackRollText = "--";
          break;
      }
      if (hideCritFumble) {
        html.querySelectorAll(".midi-qol-attack-roll .dice-total")?.forEach(el => el.classList.remove("critical", "fumble"));
      }
      if (attackRollText) html.querySelectorAll(".midi-attack-roll .dice-total")?.forEach(el => el.innerHTML = attackRollText);
      if (attackDisplay !== "full") {
        if (attackDisplay !== "hideFormula") {
          removeAll(html, ".midi-attack-roll .dice-formula");
        }
        removeAll(html, ".midi-attack-roll .dice-tooltip");
        html.querySelectorAll(".midi-attack-roll .dice-roll").forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
        removeAll(html, ".midi-attribution-info");
      }

      // Damage roll masking
      if (damageDisplay === "totalOnly") {
        removeAll(html, `${DAMAGE_ROLLS} .dice-formula`);
        removeAll(html, `${DAMAGE_ROLLS} .dice-tooltip`);
        html.querySelectorAll(DAMAGE_ROLLS).forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
      } else if (damageDisplay === "hidden") {
        removeAll(html, `${DAMAGE_ROLLS} .dice-formula`);
        removeAll(html, `${DAMAGE_ROLLS} .dice-tooltip`);
        html.querySelectorAll(DAMAGE_ROLLS).forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
        html.querySelectorAll(`${DAMAGE_ROLLS} .dice-total`)?.forEach(el => el.innerHTML = "--");
      }
    }

    applyChatVisibility(html: HTMLElement) {
      if (html.style.display === "none") return; // Already hidden by hideStuffHandler (blind/gmHide)
      const messageActor = (fromUuidSync(this.flags?.[MODULE_ID]?.["sourceActorUuid"]) as Actor.Implementation ?? this.speakerActor);
      const messageActorOwner = messageActor?.isOwner;

      // Re-enable save/check buttons
      if (foundry.utils.getProperty(this, "flags.midi-qol.type") === MESSAGE_TYPES.SAVES) {
        html.querySelectorAll<HTMLButtonElement>('[data-action="rollSave"]').forEach(el => el.disabled = false);
        html.querySelectorAll<HTMLButtonElement>('[data-action="rollCheck"]').forEach(el => el.disabled = false);
      }

      // Hide attack/damage buttons for non-authors
      if (!this.isAuthor && !(messageActorOwner && saveToChatCard)) {
        hideAll(html, ".midi-qol-attack-buttons");
        hideAll(html, ".midi-qol-damage-buttons");
        hideAll(html, ".midi-qol-otherDamage-button");
      }

      // Target hover/select/show event listeners
      html.querySelectorAll<HTMLLIElement>(".midi-qol-target-select").forEach(el => {
        el.addEventListener("mouseenter", onTargetHover);
        el.addEventListener("mouseleave", onTargetHoverOut);
        el.addEventListener("click", onTargetSelect);
        el.addEventListener("contextmenu", onTargetShow);
      });

      if (game.user?.isGM) {
        removeAll(html, ".midi-qol-playerTokenName");
        // Old separate player damage cards duplicate their GM card. Remove with dnd5e 6.2.
        if (foundry.utils.getProperty(this, "flags.midi-qol.playerDamageCard")) html.style.display = "none";
        html.querySelectorAll<HTMLDivElement>(".midi-qol-hits-display").forEach(el => el.style.display = "");
        hideAll(html, ".midi-qol-target-npc-Player");
        if (!configSettings.highlightSuccess) {
          stripHighlight(html, ".midi-qol-hits-display .midi-qol-hit-class");
          stripHighlight(html, ".midi-qol-saves-display .midi-qol-save-class");
        }
      } else {
        removeAll(html, ".midi-qol-gmTokenName");
        if (configSettings.autoCheckHit === "gmOnly") {
          hideAll(html, ".midi-qol-hits-display");
        }
        this.applySaveVisibility(html, messageActor);
        this.applyAttackVisibility(html);

        // Confirm damage buttons
        if (!this.isAuthor || configSettings.confirmAttackDamage === "gmOnly") {
          hideAll(html, ".midi-qol-confirm-damage-roll-complete-hit");
          hideAll(html, ".midi-qol-confirm-damage-roll-complete-miss");
          hideAll(html, ".midi-qol-confirm-damage-roll-complete-critical");
          hideAll(html, ".midi-qol-confirm-damage-roll-cancel");
        }

        // Dice tooltip/click blocking for GM rolls hidden from players
        const attackHidden = (configSettings.gmAttackDisplay ?? "full") !== "full";
        const damageHidden = (configSettings.gmDamageDisplay ?? "full") !== "full";
        if (this.author?.isGM && (attackHidden || damageHidden)) {
          const noDice = this.noDiceClicks.bind(this);
          if (attackHidden) {
            html.querySelectorAll(".midi-attack-roll .dice-roll").forEach(el => el.addEventListener("click", noDice));
            html.querySelectorAll<HTMLDivElement>(".midi-attack-roll .dice-tooltip").forEach(el => el.style.height = "0");
          }
          if (damageHidden) {
            html.querySelectorAll(DAMAGE_ROLLS).forEach(el => el.addEventListener("click", noDice));
            html.querySelectorAll<HTMLDivElement>(`${DAMAGE_ROLLS} .dice-tooltip`).forEach(el => el.style.height = "0");
          }
        }
      }
    }

    private applySaveVisibility(html: HTMLElement, messageActor: Actor.Implementation | undefined) {
      const shouldDisplayChallenge = safeGetGameSetting("dnd5e", "challengeVisibility");
      const autoCheckSaves = configSettings.autoCheckSaves;

      if (autoCheckSaves === "gmOnly") {
        hideAll(html, ".midi-qol-saves-display");
        return;
      }

      // Strip save attribution tooltip and info icons when players can't see save details
      if (!["all", "allShow"].includes(autoCheckSaves)) {
        html.querySelectorAll(".midi-qol-target-name[data-tooltip-html]")?.forEach(el => el.removeAttribute("data-tooltip-html"));
        removeAll(html, ".midi-save-attribution-info");
      }

      // Per-target result visibility keys on the TARGET (the saver) — the row classes
      // (.midi-qol-npc-save-* vs .midi-qol-save-*) are assigned from each target's hasPlayerOwner:
      //   NPC-target results → shown only when the challenge is fully public ("all")
      //   PC-target results  → shown unless the challenge is hidden entirely ("none")
      // The single save DC is one value for the activity, so its visibility follows the CASTER.
      const dcHidden = shouldDisplayChallenge === "player" && !(messageActor as any)?.hasPlayerOwner;
      const displayNPCSaves = shouldDisplayChallenge === "all";
      const displayPlayerSaves = shouldDisplayChallenge !== "none";

      if (!displayPlayerSaves || autoCheckSaves === "whisper" || this.blind) {
        removeAll(html, ".midi-qol-save-total");
        removeAll(html, ".midi-qol-save-tooltip");
        removeAll(html, ".midi-qol-save-symbol");
      }
      if (!displayNPCSaves || autoCheckSaves === "whisper" || this.blind) {
        removeAll(html, ".midi-qol-npc-save-symbol");
        removeAll(html, ".midi-qol-npc-save-tooltip");
        removeAll(html, ".midi-qol-npc-save-total");
      } else if (autoCheckSaves !== "allShow") {
        removeAll(html, ".midi-qol-npc-save-tooltip");
        if (autoCheckSaves === "allNoRoll") removeAll(html, ".midi-qol-npc-save-total");
      }

      // Save DC (single, activity-level) follows the caster.
      if (dcHidden || shouldDisplayChallenge === "none" || autoCheckSaves === "whisper" || this.blind) {
        removeAll(html, ".midi-qol-saveDC");
      }

      if (!configSettings.highlightSuccess || !["all", "player"].includes(shouldDisplayChallenge) || ["whisper", "none"].includes(autoCheckSaves)) {
        stripHighlight(html, ".midi-qol-saves-display .midi-qol-save-class");
      }
      if (!displayNPCSaves || !configSettings.highlightSuccess) {
        stripHighlight(html, ".midi-qol-save-class.midi-qol-npc-target");
      }
    }

    private applyAttackVisibility(html: HTMLElement) {
      if (!configSettings.optionalRules.ActiveDefenceDC) {
        removeAll(html, ".midi-qol-active-defence-dc");
      }

      const attackVisibility = safeGetGameSetting("dnd5e", "attackRollVisibility");
      const midiAttackVisibility = configSettings.autoCheckHit;

      if (!configSettings.highlightSuccess || attackVisibility === "none" || midiAttackVisibility === "whisper" || this.blind) {
        stripHighlight(html, ".midi-qol-hits-display .midi-qol-hit-class");
      }
      if (attackVisibility === "none" || midiAttackVisibility !== "all" || this.blind) {
        removeAll(html, ".midi-attack-roll .dice-total .icons");
        removeAll(html, ".midi-qol-hits-display .midi-qol-hit-symbol");
        removeAll(html, ".midi-qol-hit-symbol");
        removeAll(html, ".midi-qol-npc-ac");
      } else if (attackVisibility === "hideAC") {
        removeAll(html, ".midi-qol-npc-ac");
      }
    }

    /*
     * `options` is not decoration — it carries the data model's rendering decisions, and dropping it
     * changes what the system draws.
     *
     * dnd5e 6.0 calls this from `ChatMessageDataModel#getHTML` as
     * `_enrichChatCard(element, this._getEnrichmentOptions())`, and every card model that wants no
     * speaker portrait says so there: `ItemMessageData` and `RollMessageData` both return
     * `{ avatar: false }`. Taking one parameter and calling `super` with one meant the flag never
     * arrived, `_enrichHeader` saw `options.avatar !== false`, and drew an avatar the card had asked
     * it not to. Compact cards have no rule sizing that image, so it rendered at its natural size —
     * about two hundred and twenty pixels, on dnd5e's own cards as much as midi's, and only when
     * midi was enabled.
     */
    _enrichChatCard(html: HTMLElement, options: object = {}) {
      if (!this.flags?.[MODULE_ID]?.messageType) {
        this.applyChatVisibility(html);
        this.#enrichSystemCard(html, options);
        this._applyMidiHighlightSettings(html);
        this._addMarkerClasses(html);
        this._addLegacyCardDataset(html);
        this.maskHiddenRolls(html);
        return;
      }
      if (debugEnabled > 1) log("Enriching chat card", Date.now(), this.id);
      this.maskAttackRolls(html); // This has to run first to stop errors when dnd5e enriches the damage rolls

      this.#enrichSystemCard(html, options);
      this.applyChatVisibility(html);
      // For usage-type messages, Foundry skips _highlightCriticalSuccessFailure.
      // Add classes + icons directly for midi messages, then apply midi settings.
      if (this.flags?.[MODULE_ID]?.messageType) {
        this._highlightMidiRolls(html);
      }
      this._applyMidiHighlightSettings(html);
      this.#addMasteryLine(html);
      this._addMarkerClasses(html);
      this._addLegacyCardDataset(html);
      this.maskHiddenRolls(html);
      if (debugEnabled > 1) log("Finished enriching chat card", Date.now(), this.id);
    }

    /**
     * Restore the `data-*` attributes midi's own card carried on its root element.
     *
     * They were on `activity-card.hbs`, which is gone — the card root is now `dnd5e.card-face`, a
     * system partial midi cannot add attributes to. The information is all on `message.system` in
     * 6.0, but macros and other modules select on these attributes, so they are stamped back on
     * after render rather than left to break silently.
     */
    _addLegacyCardDataset(html: HTMLElement) {
      const card = html.querySelector<HTMLElement>(".chat-card");
      if (!card) return;
      const system = this.system as unknown as Record<string, any> | undefined;
      const item = system?.item?.uuid ? fromUuidSync(system.item.uuid) as Item.Implementation | null : null;
      const actor = this.speakerActor ?? item?.actor;
      // Not system.origin: on dnd5e 6 that is the originating chat message.
      const tokenUuid = this.speaker?.scene && this.speaker?.token
        ? `Scene.${this.speaker.scene}.Token.${this.speaker.token}` : undefined;
      const set = (name: string, value: unknown) => {
        if (value !== undefined && value !== null && value !== "") card.setAttribute(name, String(value));
      };
      set("data-actor-id", actor?.id);
      set("data-actor-uuid", actor?.uuid);
      set("data-item-id", item?.id ?? system?.item?.id);
      set("data-item-uuid", system?.item?.uuid);
      set("data-token-id", this.speaker?.token);
      set("data-token-uuid", tokenUuid);
      // @ts-expect-error no dnd5e types for item.system.level
      const level = item?.system?.level;
      // "power" is a sub-type some systems/modules add; compare as a string so fvtt-types' narrower union does not reject it.
      if (level !== undefined) set(String(item?.type) === "power" ? "data-power-level" : "data-spell-level", level);
    }

    /** Add CSS marker classes to avoid expensive :has() selectors during layout */
    _addMarkerClasses(html: HTMLElement) {
      if (html.querySelector(".midi-qol-tooltiptext")) {
        html.querySelector(".message-content")?.classList.add("midi-qol-has-tooltip");
      }
      if (html.querySelector(".xmidi-qol-flex-container")) {
        html.classList.add("midi-qol-dmg-app-msg");
      }
      if (html.querySelector(".midi-qol-player-damage-card")) {
        html.classList.add("midi-qol-player-dmg-msg");
      }
    }

    noDiceClicks(event: Event) {
      event.stopImmediatePropagation();
      return;
    }
  }
}

/** The "rolled" stand-in for a roll the viewer may not see. */
function rolledPlaceholder(): HTMLElement {
  const span = document.createElement("span");
  span.classList.add("midi-qol-dice-rolled");
  span.innerHTML = i18n("midi-qol.DiceRolled"); // the localised string carries its own markup
  return span;
}

/**
 * What a non-GM sees of a roll message: all of it when they can read it; nothing when it was forced blind or
 * ForceHideRoll is on; otherwise a stand-in saying a roll was made.
 */
export function hiddenRollView(message: ChatMessage.Implementation): "show" | "placeholder" | "none" {
  if (game.user?.isGM || message.isContentVisible) return "show";
  if (foundry.utils.getProperty(message, `flags.${MODULE_ID}.forcedBlind`) || forceHideRoll) return "none";
  return "placeholder";
}

/**
 * Public roll, hidden result: replace the totals and strip the breakdown, in both dnd5e's compact roll markup
 * (roll-compact.hbs) and the classic one. The colouring classes go too - a nat 1 or 20 would give it away.
 */
function obscureRolls(html: HTMLElement) {
  const HIGHLIGHT = ["critical", "fumble", "success", "failure", "min", "max"];
  html.querySelectorAll<HTMLElement>(".dice-total, .dice-roll .total, .d20die .roll").forEach(el => {
    el.textContent = "??";
    el.classList.remove(...HIGHLIGHT);
  });
  html.querySelectorAll(".dice-tooltip, .roll-breakdown").forEach(el => el.remove());
  html.querySelectorAll<HTMLElement>(".critical, .fumble, .success, .failure, .min, .max")
    .forEach(el => el.classList.remove(...HIGHLIGHT));
  HIGHLIGHT.forEach(c => html.classList.remove(c));
}

function isMidiCard(message: ChatMessage.Implementation | undefined): boolean {
  return !!message?.flags?.[MODULE_ID]?.messageType;
}

/** The midi card a save or check message was rolled for (dnd5e 6 links it through `system.origin`). */
function midiCardOf(message: ChatMessage.Implementation): ChatMessage.Implementation | undefined {
  const origin = foundry.utils.getProperty(message, "system.origin");
  const card = typeof origin === "string" ? game.messages?.get(origin) : origin as ChatMessage.Implementation | undefined;
  return card instanceof ChatMessage && isMidiCard(card) ? card : undefined;
}

/**
 * What a player sees of a save rolled for a midi card follows midi's save display, as midi's own saves section
 * does: gmOnly shows nothing, and for an NPC anything short of allShow drops the dice and allNoRoll the total.
 */
function maskSaveForPlayers(element: HTMLElement, save: ChatMessage.Implementation, card: ChatMessage.Implementation): "remove" | void {
  // @ts-expect-error no dnd5e-types
  const display = card.getAssociatedActivity?.()?.saveDisplay ?? "default";
  const mode = display === "default" ? configSettings.autoCheckSaves : String(display);
  if (mode === "gmOnly") return "remove";
  if (save.speakerActor?.hasPlayerOwner) return;
  if (mode !== "allShow") element.querySelectorAll(".roll-breakdown, .d20die, .dice-tooltip").forEach(el => el.remove());
  if (mode === "allNoRoll") element.querySelectorAll(".dice-roll .total, .dice-total").forEach(el => el.remove());
}

