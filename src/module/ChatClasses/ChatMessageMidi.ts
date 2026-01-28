import { GameSystemConfig, MODULE_ID, MQDamageRollTypes, debugEnabled, i18n, log, warn } from "../../midi-qol.js";
import { configSettings, safeGetGameSetting } from "../settings.js";
import { getToken } from "../utils.js";
import { setDamageRollMinTerms } from "../activities/activityHelpers.js";
import { WorkflowDataFlags } from "../Workflow.js";

export let ChatMessageMidi: ReturnType<typeof defineChatMessageMidiClass>;

export function setupChatMessageMidi() {
  ChatMessageMidi = defineChatMessageMidiClass(globalThis.dnd5e.documents.ChatMessage5e);
  CONFIG.ChatMessage.batchSize = 25;
  globalThis.dnd5e.documents.ChatMessage5e.TRAY_TYPES.push("midi-damage-application");
}

export function defineChatMessageMidiClass(baseClass: ChatMessage.ImplementationClass) {
  return class ChatMessageMidi extends baseClass /*globalThis.dnd5e.documents.ChatMessage5e*/ {
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
      return;

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

    // Patch for getAssociatedItem not preparing data on items recovered from item.data
    getAssociatedItem() {
      if (this.flags?.[MODULE_ID]?.syntheticItem) {
        const storedData = this.flags.dnd5e?.item?.data;
        //@ts-expect-error no dnd5e-types
        const actor = super.getAssociatedActor();
        if (storedData) return new Item.implementation(storedData, { parent: actor })
      }
      // @ts-expect-error no dnd5e-types
      return super.getAssociatedItem();
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
      //@ts-expect-error no dnd5e-types
      const damages = game.system.dice.aggregateDamageRolls(rollsToCheck, { respectProperties: true }).map(roll => ({
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

    collectRolls(rollsToAccumulate: Roll[], multiRolls: boolean = false, options: { blind?: boolean }): any[] {
      let returns: any[] = [];
      let rolls: Roll[] = [];
      setDamageRollMinTerms(rollsToAccumulate);
      for (let i = 0; i < rollsToAccumulate.length; i++) {
        if (!multiRolls && i < rollsToAccumulate.length - 1) {
          continue;
        } else if (multiRolls) rolls = [rollsToAccumulate[i]];
        else rolls = rollsToAccumulate;
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
        let formulaInToolTip = ["formula", "formulaadv"].includes(configSettings.rollAlternate);
        let hideDetails = this.author?.isGM && !game.user?.isGM && (configSettings.hideRollDetails ?? "none") !== "none";
        let hideFormula = this.author?.isGM && !game.user?.isGM && (configSettings.hideRollDetails ?? "none") !== "none";
        if (options.blind && !game.user?.isGM) hideFormula = true;
        if (this.author?.isGM && !game.user?.isGM && (configSettings.hideRollDetails ?? "none") !== "none") {
          switch (configSettings.hideRollDetails) {
            case "none":
              break;
            case "detailsDSN":
              break;
            case "details":
              break;
            case "d20Only":
              break;
            case "hitDamage":
              break;
            case "hitCriticalDamage":
              break;
            case "attackTotalOnly":
            case "d20AttackOnly":
              total = "--";
              break;
            case "all":
              total = "--";
              break;
          }
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
        <h4 class="dice-total">${total}</h4>
      </div>
    `;
        returns.push(roll);
      }
      return returns;
    }

    _enrichUsageEffects(html: HTMLLIElement) {
      if (["off", "applyLeave"].includes(configSettings.autoItemEffects))
        //@ts-expect-error
        return super._enrichUsageEffects(html);
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
            if ((configSettings.hideRollDetails ?? "none") !== "none" && !game.user?.isGM && this.author?.isGM) {
              html.querySelectorAll(".midi-damage-roll .dice-roll").forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
            }
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

          html.querySelector(".message-content")?.appendChild(damageApplication);
          if (!game.user?.isGM) {
            //@ ts-expect-error
            // damageApplication.targetSourceControl.hidden = true;
            //@ ts-expect-error
            // damageApplication.targetingMode = "selected";
          }
        }
      }
    }

    _highlightCriticalSuccessFailure(html: HTMLElement) {
      // @ t s-expect-error no dnd5e-types
      // if (!this.flags?.[MODULE_ID]) return super._highlightCriticalSuccessFailure(html);
      // @ts-expect-error no dnd5e-types
      super._highlightCriticalSuccessFailure(html);
      const totals = html.querySelectorAll(".dice-total");
      for (let [index, d20Roll] of this.rolls.entries()) {
        const total = totals[index];
        if (!total) continue;
        if (!game.user?.isGM && (["whisper", "gmOnly"].includes(configSettings.autoCheckHit) || safeGetGameSetting("dnd5e", "attackRollVisibility") === "none")) {
          total.classList.remove("success", "failure", "critical", "fumble");
        } else if (total && configSettings.highLightCriticalAttackOnly) {
          //@ts-expect-error
          if (d20Roll?.isCritical) total.classList.add("critical");
          //@ts-expect-error
          if (d20Roll?.isFumble) total.classList.add("fumble");
          total.classList.remove("success", "failure");
          total.classList.remove("success", "failure");
        } else if (total && !configSettings.highlightSuccess) {
          total.classList.remove("success", "failure", "critical", "fumble");
        } else if (total && !configSettings.highlightSuccess) {
          //@ts-expect-error
          if (d20Roll.isCritical) total.classList.add("critical");
          //@ts-expect-error
          if (d20Roll.isFumble) total.classList.add("fumble");
        }
      }
      return;
    }

    maskAttackRolls(html: HTMLElement) {
      if (!this.author?.isGM || game.user?.isGM) return;
      const hitFlag = this.flags?.[MODULE_ID]?.isHit;
      const hitString = hitFlag === undefined ? "" : hitFlag ? i18n("midi-qol.hits") : i18n("midi-qol.misses");
      let attackRollText;
      let removeFormula = (configSettings.hideRollDetails ?? "none") !== "none";
      switch (configSettings.hideRollDetails) {
        case "none":
          break;
        case "detailsDSN":
          break;
        case "details":
          break;
        case "d20Only":
          attackRollText = `(d20) ${this.rolls[0]?.terms[0].total ?? "--"}`;
          break;
        case "hitDamage":
          html.querySelectorAll(".midi-qol-attack-roll .dice-total")?.forEach(el => el.classList.remove("critical"));
          html.querySelectorAll(".midi-qol-attack-roll .dice-total")?.forEach(el => el.classList.remove("fumble"));
          attackRollText = hitString;
          break;
        case "hitCriticalDamage":
          attackRollText = hitString;
          break;
        case "attackTotalOnly":
          attackRollText = this.rolls[0]?.total ?? "--";
          break;
        case "d20AttackOnly":
          attackRollText = `(d20) ${this.rolls[0]?.terms[0].total ?? "--"}`;
          break;
        case "all":
          html.querySelectorAll(".midi-qol-attack-roll .dice-total")?.forEach(el => el.classList.remove("critical"));
          html.querySelectorAll(".midi-qol-attack-roll .dice-total")?.forEach(el => el.classList.remove("fumble"));
          attackRollText = "--";
          break;
      }
      if (attackRollText) html.querySelectorAll(".midi-attack-roll .dice-total")?.forEach(el => el.innerHTML = attackRollText);
      if (this.author.isGM && !game.user?.isGM && removeFormula) {
        html.querySelectorAll(".midi-attack-roll .dice-formula")?.forEach(el => el.remove());
        html.querySelectorAll(".midi-attack-roll .dice-tooltip")?.forEach(el => el.remove());
        html.querySelectorAll(".midi-attack-roll .dice-roll").forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
      }
    }

    _enrichChatCard(html: HTMLElement) {
      // @ts-expect-error no dnd5e-types
      if (!this.flags?.[MODULE_ID]?.messageType) return super._enrichChatCard(html);
      if (debugEnabled > 1) log("Enriching chat card", Date.now(), this.id);
      this.maskAttackRolls(html); // This has to run first to stop errors when ChatMessage5e._enrichDamageTooltip runs

      // @ts-expect-error no dnd5e-types
      super._enrichChatCard(html);
      if (this.author?.isGM && (configSettings.hideRollDetails ?? "none") !== "none" && !game.user?.isGM) {
        html.querySelectorAll(".midi-attack-roll .dice-roll").forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
        html.querySelectorAll(".midi-damage-roll .dice-roll").forEach(el => el.addEventListener("click", this.noDiceClicks.bind(this)));
        html.querySelectorAll<HTMLDivElement>(".midi-attack-roll .dice-tooltip").forEach(el => el.style.height = "0");
        html.querySelectorAll<HTMLDivElement>(".midi-damage-roll .dice-tooltip").forEach(el => el.style.height = "0");

      }
      // Remove the hit miss check mark for non-gm players if required.
      // Because midi rolls are not marked as attack rolls
      if (!game.user?.isGM) {
        const hideAttackResult = safeGetGameSetting("dnd5e", "attackRollVisibility") === "none";
        if (hideAttackResult || configSettings.autoCheckHit !== "all") {
          html.querySelectorAll(".midi-attack-roll .dice-total .icons")?.forEach(el => el.remove());
        }
      }
      if (debugEnabled > 1) log("Finished enriching chat card", Date.now(), this.id);
    }

    noDiceClicks(event) {
      event.stopImmediatePropagation();
      return;
    }
  }
}