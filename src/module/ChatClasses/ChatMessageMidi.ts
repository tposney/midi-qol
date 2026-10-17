import { GameSystemConfig, MESSAGE_TYPES, MODULE_ID, MQDamageRollTypes, debugEnabled, error, i18n, log } from "../../midi-qol.js";
import { configSettings, safeGetGameSetting, saveToChatCard } from "../settings.js";
import { applyMessageMode, displayTokenName, getToken } from "../utils.js";
import { setDamageRollMinTerms } from "../activities/activityHelpers.js";

// Damage is auto-applied by midi when autoApplyDamage is one of the "yes*" modes.
const midiAutoAppliesDamage = () => !!configSettings.autoApplyDamage?.toLowerCase().includes("yes");

const removeAll = (html: HTMLElement, sel: string) => html.querySelectorAll(sel).forEach(el => el.remove());
const hideAll = (html: HTMLElement, sel: string) => html.querySelectorAll<HTMLElement>(sel).forEach(el => el.style.display = "none");
const stripHighlight = (html: HTMLElement, sel: string) => html.querySelectorAll<HTMLElement>(sel).forEach(
  el => el.classList.remove("success", "failure", "critical", "fumble")
);

/** rollType tag -> the flag it is rebuilt into. utilityRolls is absent: chatRolls merges them. */
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

/** As dnd5e hides target AC from players short of "all", except that a player sees the AC of a token they own. */
function removeUnownedAC(html: HTMLElement) {
  html.querySelectorAll<HTMLElement>(".midi-qol-hits-display li[data-uuid]").forEach(row => {
    const target = fromUuidSync(row.dataset.uuid ?? "");
    const actor = target instanceof TokenDocument ? target.actor : target instanceof Actor ? target : null;
    if (!actor?.isOwner) row.querySelector(".midi-qol-ac")?.remove();
  });
}

/** Names on a card as the viewing player is shown them: the speaker (header and card text), midi's hit and save rows. */
function applyPlayerNames(html: HTMLElement) {
  applySpeakerName(html);
  html.querySelectorAll<HTMLElement>(".midi-qol-hits-display li[data-uuid], .midi-qol-save-name[data-uuid]").forEach(el => {
    const name = el.querySelector(".midi-qol-target-name");
    if (name) name.textContent = displayTokenName(el.dataset.uuid, name.textContent?.trim() ?? "");
  });
}

/**
 * The speaker's name in the header and the card text, as the viewing player is shown it. dnd5e draws its avatar header
 * after an await, so this runs again once dnd5e's enrichment is done; it is a no-op on a name already shown.
 */
function applySpeakerName(html: HTMLElement) {
  if (game.user?.isGM) return;
  // The header is the plain sender (with data-token-uuid) or dnd5e's avatar and name stack.
  const sender = html.querySelector<HTMLElement>(".message-sender");
  const senderName = sender?.querySelector(".name-stacked .title") ?? sender;
  const speakerUuid = sender?.dataset.tokenUuid ?? sender?.querySelector<HTMLElement>(".avatar[data-uuid]")?.dataset.uuid;
  const speakerName = senderName?.textContent?.trim();
  if (!senderName || !speakerName) return;
  const shown = displayTokenName(speakerUuid, speakerName);
  if (shown === speakerName) return;
  senderName.textContent = shown;
  sender?.querySelector("img[alt]")?.setAttribute("alt", shown);
  replaceName(html.querySelector(".message-content"), speakerName, shown);
}

/** Once dnd5e's (possibly async) enrichment of `html` is done, set the speaker's name again. */
function applySpeakerNameAfter(enriched: unknown, html: HTMLElement): Promise<void> {
  return Promise.resolve(enriched).then(() => applySpeakerName(html), err => {
    error(`${MODULE_ID} | dnd5e chat card enrichment failed`, err);
  });
}

/** Replace whole-word occurrences of `name` in the text under `root`. */
function replaceName(root: Element | null, name: string, replacement: string) {
  if (!root) return;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${RegExp.escape(name)}(?![\\p{L}\\p{N}])`, "gu");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.includes(name)) node.textContent = node.textContent.replace(pattern, replacement);
  }
}

export function setupChatMessageMidi() {
  ChatMessageMidi = defineChatMessageMidiClass(globalThis.dnd5e.documents.ChatMessage5e);
  CONFIG.ChatMessage.batchSize = 25;
  globalThis.dnd5e.documents.ChatMessage5e.TRAY_TYPES.push("midi-damage-application");
}

export function defineChatMessageMidiClass(baseClass: ChatMessage.ImplementationClass) {
  return class ChatMessageMidi extends baseClass /*globalThis.dnd5e.documents.ChatMessage5e*/ {

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
    /** dnd5e 5.3 calls the deprecated applyRollMode when it prepares a roll message without creating it. */
    applyRollMode(rollMode: ChatMessage.PassableRollMode) {
      const data = this.toObject();
      applyMessageMode(data, rollMode);
      this.updateSource(data);
    }

    get isRoll() {
      if (this.flags?.[MODULE_ID]?.messageType) return false // do this so that dsn won't trigger
      return super.isRoll;
    }

    get hasRolls() {
      if ((this.flags?.[MODULE_ID]?.roll?.length ?? 0) > 0) return true;
      return super.isRoll;
    }
    // midi has it's own target handling so don't display the attack targets here (however, DO display the mastery)
    _enrichAttackTargets(html) {
      // This code borrowed from the start of the system's ChatMessage5e#_enrichAttackTargets method
      const attackRoll = this.rolls[0];
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

    /**
  * Select the hit or missed targets.
  * @param {HTMLElement} li    The chat entry which contains the roll data.
  * @param {string} type       The type of selection ('hit' or 'miss').
  */
    selectTargets(li: HTMLElement, type: string) {
      if (!canvas?.ready) return;
      // @ts-expect-error no dnd5e-types
      if (!this.flags?.[MODULE_ID]) return super.selectTargets(li, type);
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
      const type = this.flags.dnd5e?.roll?.type;
      // @ts-expect-error no dnd5e-types
      if (type !== undefined || !this.flags?.[MODULE_ID]) return super.applyChatCardDamage(li, multiplier);
      const rollsToCheck = this.rolls.filter(r => MQDamageRollTypes.includes(foundry.utils.getProperty(r, "options.midi-qol.rollType") as string));
      // As dnd5e's own applyChatCardDamage: healing is negative, and the target's traits apply.
      //@ts-expect-error no dnd5e-types
      const damages = game.system.dice.aggregateDamageRolls(rollsToCheck, { respectProperties: true }).map(roll => ({
        value: Math.max(0, roll.total) * (roll.options.type in CONFIG.DND5E.healingTypes ? -1 : 1),
        type: roll.options.type,
        properties: new Set(roll.options.properties ?? [])
      }));
      if (canvas.tokens) {
        return Promise.all(canvas.tokens.controlled.map(t => {
          //@ts-expect-error no dnd5e-types
          return t.actor?.applyDamage(damages, { multiplier, isDelta: true, originatingMessage: this });
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

    collectRolls(rollsToAccumulate: Roll[], multiRolls: boolean = false, options: { blind?: boolean }): any[] {
      const returns: any[] = [];
      setDamageRollMinTerms(rollsToAccumulate);
      const formulaInToolTip = ["formula", "formulaadv"].includes(configSettings.rollAlternate);
      const hideDetails = this.author?.isGM && !game.user?.isGM && ((configSettings.gmDamageDisplay ?? "full") !== "full");
      const hideFormula = hideDetails || (options.blind && !game.user?.isGM);
      const rollSets: Roll[][] = multiRolls ? rollsToAccumulate.map(r => [r]) : [rollsToAccumulate];
      for (const rolls of rollSets) {
        //@ts-expect-error
        let { formula, total, breakdown } = game.system.dice.aggregateDamageRolls(rolls).reduce((obj: any, r) => {
          obj.formula.push(r.formula);
          obj.total += Math.max(0, r.total);
          // @ts-expect-error no dnd5e-types
          obj.breakdown.push(this._simplifyDamageRoll(r));
          return obj;
        }, { formula: [], total: 0, breakdown: [] });
        formula = formula.join(" ");
        formula = formula.replace(/^\s+\+\s+/, "");
        formula = formula.replaceAll(/  /g, " ");
        if (multiRolls) {
          foundry.utils.setProperty(rolls[0], "flags.midi-qol.breakdown", breakdown);
          foundry.utils.setProperty(rolls[0], "flags.midi-qol.total", total);
        }
        if (hideDetails && (configSettings.gmDamageDisplay ?? "full") === "hidden") {
          total = "--";
        }
        if (options.blind && !game.user?.isGM) total = "--";
        const roll = document.createElement("div");
        roll.classList.add("dice-roll");
        let tooltipContents = ""
        if (!hideDetails) tooltipContents = breakdown.reduce((str, { type, total, constant, dice }) => {
          const config = GameSystemConfig.damageTypes[type] ?? GameSystemConfig.healingTypes[type];
          return `${str}
              <section class="tooltip-part">
                <div class="dice">
                  <ol class="dice-rolls">
                    ${dice.reduce((str, { result, classes }) => `
                      ${str}<li class="roll ${classes}">${result}</li>
                    `, "")}
                    ${constant ? `
                    <li class="constant"><span class="sign">${constant < 0 ? "-" : "+"}</span>${Math.abs(constant)}</li>
                    ` : ""}
                  </ol>
                  <div class="total">
                    ${config ? `<img src="${config.icon}" alt="${config.label}">` : ""}
                    <span class="label">${config?.label ?? ""}</span>
                    <span class="value">${total}</span>
                  </div>
                </div>
              </section>
            `;
        }, "");

        let diceFormula = "";
        if (!hideFormula) diceFormula = `<div class="dice-formula">${formula}</div>`;
        roll.innerHTML = `
      <div class="dice-result">
      ${formulaInToolTip ? "" : diceFormula}
        <div class="dice-tooltip-collapser">
          <div class="dice-tooltip">
            ${formulaInToolTip ? diceFormula : ""}
            ${tooltipContents}
          </div>
        </div>
        <h4 class="dice-total">${total}${this._buildDamageTypeIcons(breakdown)}</h4>
      </div>
    `;
        returns.push(roll);
      }
      return returns;
    }

    _buildDamageTypeIcons(breakdown: { type: string }[]): string {
      const uniqueTypes = [...new Set(breakdown.map(b => b.type).filter(Boolean))];
      return uniqueTypes.map(type => {
        const config = GameSystemConfig.damageTypes[type] ?? GameSystemConfig.healingTypes?.[type];
        if (!config?.icon) return "";
        return `<dnd5e-icon class="midi-damage-type-icon" src="${config.icon}" aria-label="${config.label ?? ""}" data-tooltip="${config.label ?? ""}"></dnd5e-icon>`;
      }).join("");
    }

    // Removes the dnd5e effects tray from the rendered chat card when midi's
    // autoItemEffects suppresses the apply button. dnd5e v5.x emits an
    // <effect-application> custom element from usage-card.hbs which renders
    // itself in connectedCallback — there's no longer a _enrichUsageEffects
    // method to skip, so we strip the element from the DOM after super runs.
    _maybeStripEffectsTray(html: HTMLElement) {
      if (["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects)) {
        html.querySelectorAll("effect-application").forEach(el => el.remove());
      }
    }

    _enrichDamageTooltip(rolls: Roll[], html: HTMLElement) {
      if (this.flags?.dnd5e?.roll?.type !== undefined || !this.flags?.[MODULE_ID])
        // @ts-expect-error no dnd5e-types
        return super._enrichDamageTooltip(rolls, html);
      for (let rollType of MQDamageRollTypes) {
        const rollsToCheck = this.rolls.filter(r => foundry.utils.getProperty(r, "options.midi-qol.rollType") === rollType);
        let rType = "damage";
        if (rollType === "otherDamage") rType = "other-damage";
        else if (rollType === "bonusDamage") rType = "bonus-damage";
        if (rollsToCheck?.length) {
          html.querySelectorAll(`.midi-${rType}-roll`)?.forEach(el => el.remove());
          for (let roll of this.collectRolls(rollsToCheck, configSettings.mergeCardMultiDamage, { blind: this.blind })) {
            roll.classList.add(`midi-${rType}-roll`);
            if (rType === "bonus-damage") {
              const flavor = document.createElement("div");
              // @ts-expect-error no dnd5e-types
              const flavors = rollsToCheck.map(r => r.options.flavor ?? r.options.type);
              const bonusDamageFlavor = flavors.join(", ");
              flavor.classList.add("midi-bonus-damage-flavor");
              flavor.innerHTML = bonusDamageFlavor;
              html.querySelector(`.midi-qol-${rType}-roll`)?.appendChild(flavor);
            }
            html.querySelector(`.midi-qol-${rType}-roll`)?.appendChild(roll);
          }
        }
      }

      let shouldAddButtons = (configSettings.addChatDamageButtons === "both")
        || ((configSettings.addChatDamageButtons === "gm") && game.user?.isGM)
        || ((configSettings.addChatDamageButtons === "pc") && !game.user?.isGM);
      if (game.user?.isGM && configSettings.autoApplyDamage === "none") shouldAddButtons = true;
      if (shouldAddButtons) {
        for (let dType of MQDamageRollTypes) {
          rolls = this.rolls.filter(r => foundry.utils.getProperty(r, "options.midi-qol.rollType") === dType);
          if (!rolls.length) continue;
          let damageApplication = document.createElement("midi-damage-application");
          //@ts-expect-error
          damageApplication.damageType = dType;
          //@ts-expect-error
          damageApplication.damages = game.system.dice.aggregateDamageRolls(rolls, { respectProperties: true }).map(roll => ({
            value: Math.max(0, roll.total),
            type: roll.options.type,
            properties: new Set(roll.options.properties ?? [])
          }));
          // Set the initial open state directly so connectedCallback renders correctly.
          // _collapseTrays (overridden below) keeps it in sync on re-render, bypassing the
          // dnd5e _trayStates className/tagName collision.
          damageApplication.toggleAttribute("open", !midiAutoAppliesDamage());
          html.querySelector(".message-content")?.appendChild(damageApplication);
        }
      }
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

    _highlightCriticalSuccessFailure(html: HTMLElement) {
      // @ts-expect-error no dnd5e-types
      super._highlightCriticalSuccessFailure(html);
      // dnd5e only adds critical/fumble for attack and death saves.
      // Add critical/fumble highlighting for other d20 rolls (saves, ability checks).
      const totals = html.querySelectorAll(".dice-total");
      for (let [index, d20Roll] of this.rolls.entries()) {
        const total = totals[index];
        if (!total || total.classList.contains("critical") || total.classList.contains("fumble")) continue;
        const d0 = d20Roll?.dice?.[0];
        if (!d0) continue;
        // @ts-expect-error D20Roll not typed
        const d20 = dnd5e.dice.D20Roll.fromRoll(d20Roll);
        // A d20 (one kept die), or a die that replaces it, e.g. Custom D&D 5e's 2d10: dnd5e judges both.
        if (!d20.validD20Roll || (d0.faces === 20 && d0.values?.length !== 1)) continue;
        if (d20.isCritical) {
          total.classList.add("critical");
          if (!total.querySelector(".icons")) {
            const icons = document.createElement("div");
            icons.classList.add("icons");
            const icon = document.createElement("i");
            icon.classList.add("fas", "fa-check-double");
            icon.setAttribute("inert", "");
            icons.append(icon);
            total.append(icons);
          }
        } else if (d20.isFumble) {
          total.classList.add("fumble");
          if (!total.querySelector(".icons")) {
            const icons = document.createElement("div");
            icons.classList.add("icons");
            for (let i = 0; i < 2; i++) {
              const icon = document.createElement("i");
              icon.classList.add("fas", "fa-xmark");
              icon.setAttribute("inert", "");
              icons.append(icon);
            }
            total.append(icons);
          }
        }
      }
      this._applyMidiHighlightSettings(html);
    }

    /**
     * Add critical/fumble/success/failure classes and icons for midi messages.
     * Used by _enrichChatCard for usage-type messages where _highlightCriticalSuccessFailure
     * is not called by Foundry. Does not mutate document flags (safe during async super._enrichChatCard).
     */
    private _highlightMidiRolls(html: HTMLElement) {
      function makeIcon(cls: string) {
        const icon = document.createElement("i");
        icon.classList.add("fas", cls);
        icon.setAttribute("inert", "");
        return icon;
      }
      const totals = html.querySelectorAll(".dice-total");
      for (let [index, d20Roll] of this.rolls.entries()) {
        const total = totals[index];
        if (!total) continue;
        total.classList.remove("success", "failure", "critical", "fumble");
        total.querySelector(".icons")?.remove();

        const d0 = d20Roll?.dice?.[0];
        if (!d0) continue;
        // @ts-expect-error D20Roll not typed
        const d20 = dnd5e.dice.D20Roll.fromRoll(d20Roll);
        // A d20 (one kept die), or a die that replaces it, e.g. Custom D&D 5e's 2d10: dnd5e judges both.
        if (!d20.validD20Roll || (d0.faces === 20 && d0.values?.length !== 1)) continue;
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
      const totals = html.querySelectorAll(".dice-total");
      for (const total of Array.from(totals)) {
        if (hideResult || !configSettings.highlightSuccess) {
          total.classList.remove("success", "failure", "critical", "fumble");
          total.querySelector(".icons")?.remove();
        } else if (configSettings.highLightCriticalAttackOnly) {
          const hadSuccessOrFailure = total.classList.contains("success") || total.classList.contains("failure");
          total.classList.remove("success", "failure");
          if (hadSuccessOrFailure && !total.classList.contains("critical") && !total.classList.contains("fumble")) {
            total.querySelector(".icons")?.remove();
          }
        }
      }
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
      switch (attackDisplay) {
        case "full":
          break;
        case "hideFormula":
          break;
        case "d20Only":
          attackRollText = `(d20) ${this.rolls[0]?.terms[0].total ?? "--"}`;
          break;
        case "attackTotal":
          attackRollText = `${this.rolls[0]?.total ?? "--"}`;
          break;
        case "hitMiss":
          hideCritFumble = true;
          attackRollText = hitString;
          break;
        case "hitMissCrit":
          attackRollText = hitString;
          if (isCritical) attackRollText = i18n("midi-qol.criticals");
          else if (isFumble) attackRollText = i18n("midi-qol.fumbles");
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
        removeAll(html, ".midi-damage-roll .dice-formula");
        removeAll(html, ".midi-damage-roll .dice-tooltip");
        html.querySelectorAll(".midi-damage-roll .dice-roll").forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
      } else if (damageDisplay === "hidden") {
        removeAll(html, ".midi-damage-roll .dice-formula");
        removeAll(html, ".midi-damage-roll .dice-tooltip");
        html.querySelectorAll(".midi-damage-roll .dice-roll").forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
        html.querySelectorAll(".midi-damage-roll .dice-total")?.forEach(el => el.innerHTML = "--");
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

      // Cards rendered before names were set on display carry a second, player copy of each name.
      removeAll(html, ".midi-qol-playerTokenName");
      if (game.user?.isGM) {
        if (configSettings.hidePlayerDamageCard && foundry.utils.getProperty(this, "flags.midi-qol.playerDamageCard")) {
          html.style.display = "none";
        }
        html.querySelectorAll<HTMLDivElement>(".midi-qol-hits-display").forEach(el => el.style.display = "");
        hideAll(html, ".midi-qol-target-npc-Player");
        if (!configSettings.highlightSuccess) {
          stripHighlight(html, ".midi-qol-hits-display .midi-qol-hit-class");
          stripHighlight(html, ".midi-qol-saves-display .midi-qol-save-class");
        }
      } else {
        applyPlayerNames(html);
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
            html.querySelectorAll(".midi-damage-roll .dice-roll").forEach(el => el.addEventListener("click", noDice));
            html.querySelectorAll<HTMLDivElement>(".midi-damage-roll .dice-tooltip").forEach(el => el.style.height = "0");
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
      const dcRemoved = dcHidden || shouldDisplayChallenge === "none" || autoCheckSaves === "whisper" || this.blind;
      if (dcRemoved) removeAll(html, ".midi-qol-saveDC");

      // The total's tooltip ("5 = 2 + 3 vs DC 11") carries the dice and the DC.
      html.querySelectorAll<HTMLElement>(".midi-qol-save-total[data-tooltip]").forEach(el => {
        const diceHidden = el.classList.contains("midi-qol-npc-save-total") && autoCheckSaves !== "allShow";
        if (diceHidden || dcRemoved) el.removeAttribute("data-tooltip");
      });

      if (!configSettings.highlightSuccess || !["all", "player"].includes(shouldDisplayChallenge) || ["whisper", "none"].includes(autoCheckSaves)) {
        stripHighlight(html, ".midi-qol-saves-display .midi-qol-save-class");
      }
      if (!displayNPCSaves || !configSettings.highlightSuccess) {
        stripHighlight(html, ".midi-qol-save-class.midi-qol-npc-target");
      }
    }

    private applyAttackVisibility(html: HTMLElement) {
      if (!configSettings.optionalRules.activeDefenceDC) {
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
        removeUnownedAC(html);
      } else if (attackVisibility === "hideAC") {
        removeUnownedAC(html);
      }
    }

    _enrichChatCard(html: HTMLElement): Promise<void> {
      if (!this.flags?.[MODULE_ID]?.messageType) {
        this.applyChatVisibility(html);
        // @ts-expect-error no dnd5e-types
        const enriched = super._enrichChatCard(html);
        this._maybeStripEffectsTray(html);
        this._addMarkerClasses(html);
        return applySpeakerNameAfter(enriched, html);
      }
      if (debugEnabled > 1) log("Enriching chat card", Date.now(), this.id);
      this.maskAttackRolls(html); // This has to run first to stop errors when ChatMessage5e._enrichDamageTooltip runs

      // @ts-expect-error no dnd5e-types
      const enriched = super._enrichChatCard(html);
      this._maybeStripEffectsTray(html);
      this.applyChatVisibility(html);
      // For usage-type messages, Foundry skips _highlightCriticalSuccessFailure.
      // Add classes + icons directly for midi messages, then apply midi settings.
      if (this.flags?.[MODULE_ID]?.messageType) {
        this._highlightMidiRolls(html);
      }
      this._applyMidiHighlightSettings(html);
      this._addMarkerClasses(html);
      if (debugEnabled > 1) log("Finished enriching chat card", Date.now(), this.id);
      return applySpeakerNameAfter(enriched, html);
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