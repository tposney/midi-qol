//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e  from "../../../systems/dnd5e/module/item/entity.js"
//@ts-ignore
import AbilityTemplate from "../../../systems/dnd5e/module/pixi/ability-template.js";
import { warn, debug, log, i18n, noDamageSaves, cleanSpellName, MESSAGETYPES, error } from "../midi-qol";
import { selectTargets, showItemCard } from "./itemhandling";
import { broadcastData } from "./GMAction";
import { installedModules } from "./setupModules";
import { configSettings, checkBetterRolls, itemRollButtons, autoRemoveTargets } from "./settings.js";
import { getSelfTargetSet, createDamageList, processDamageRoll, untargetDeadTokens, getSaveMultiplierForItem, requestPCSave, applyTokenDamage } from "./utils"
import { config } from "process";

export const shiftOnlyEvent = {shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, type: ""};
export function noKeySet(event) { return !(event.shiftKey || event.ctrlKey || event.altKey || event.metakey)}

export const WORKFLOWSTATES = {
  NONE : 0,
  ROLLSTARTED : 1,
  AWAITTEMPLATE: 2,
  TEMPLATEPLACED: 3,
  VALIDATEROLL: 4,
  PREAMBLECOMPLETE : 5,
  WAITFORATTACKROLL : 6,
  ATTACKROLLCOMPLETE: 7,
  WAITFORDAMGEROLL: 8,
  DAMAGEROLLCOMPLETE: 9,
  WAITFORSAVES: 10,
  SAVESCOMPLETE: 11,
  ALLROLLSCOMPLETE: 12,
  APPLYDYNAMICEFFECTS: 13,
  ROLLFINISHED: 14
};

export class Workflow {
  [x: string]: any;
  static _actions: {};
  static _workflows: {} = {};
  actor : Actor5e;
  item: Item5e;
  itemCardId : string;
  itemCardData: {};
  displayHookId: number;

  event: {shiftKey: boolean, altKey: boolean, ctrlKey: boolean, metaKey: boolean, type: string};
  speaker: any;
  tokenId: string;
  targets: Set<Token>;
  placeTemlateHookId: number;

  _id: string;
  saveDisplayFlavor: string;
  showCard: boolean;
  get id() { return this._id}
  itemId: string;
  itemUUId: string;
  itemLevel: number;
  currentState: number;

  isCritical: boolean;
  isFumble: boolean;
  hitTargets: Set<Token>;
  attackRoll: Roll;
  attackAdvantage: boolean;
  attackDisadvantage: boolean;
  diceRoll: number;
  attackTotal: number;
  attackCardData: ChatMessage;
  attackRollHTML: HTMLElement | JQuery<HTMLElement>;
  noAutoAttack: boolean; // override attack roll for standard care
  
  hitDisplayData: any[];

  damageRoll: Roll;
  damageTotal: number;
  damageDetail: any[];
  damageRollHTML: HTMLElement | JQuery<HTMLElement>;
  damageCardData: ChatMessage;
  defaultDamageType: string;
  noAutoDamage: boolean; // override damage roll for damage rolls

  saves: Set<Token>;
  failedSaves: Set<Token>
  advantageSaves : Set<Token>;
  saveRequests: any;
  saveTimeouts: any;
  hideSavesHookId: number;
  versatile: boolean;
  saveDisplayData;

  chatMessage: ChatMessage;
  hideTags: string[];
  displayId: string;

  static eventHack: any;

  static get workflows() {return Workflow._workflows}
  static getWorkflow(id:string):Workflow {
    debug("Get workflow ", id, Workflow._workflows,  Workflow._workflows[id])
    return Workflow._workflows[id];
  }

  static initActions(actions: {}) {
    Workflow._actions = actions;
  }
  constructor(actor: Actor5e, item: Item5e, token, speaker, event: any) {
    if (Workflow.getWorkflow(item?.uuid)) {
      Workflow.removeWorkflow(item?.uuid);
    }
    this.actor = actor;
    this.item = item;
    this.tokenId = token || speaker.token;
    this.speaker = speaker;
    this.targets = (item?.data.data.target?.type === "self") ? getSelfTargetSet(actor) : new Set(game.user.targets);
    this.saves = new Set();
    this.failedSaves = new Set(this.targets)
    this.hitTargets = new Set(this.targets);
    this.isCritical = false;
    this.isFumble = false;
    this.currentState = WORKFLOWSTATES.NONE;
    this.itemId = item?.uuid;
    this.itemUUId = item?.uuid;
    this.itemLevel = item?.level || 0;
    this._id = randomID();
    this.displayId = this.id;
    this.itemCardData = {};
    this.attackCardData = undefined;
    this.damageCardData = undefined;
    this.event = event;
    this.saveRequests = {};
    this.saveTimeouts = {};
    this.hideSavesHookId = null;
    this.placeTemlateHookId = null;
    this.damageDetail = [];
    this.versatile = false;
    this.hideTags = new Array();
    this.displayHookId = null;
    Workflow._workflows[item?.uuid] = this;
  }

  public someEventKeySet() {
    return this.event.shiftKey || this.event.altKey || this.event.ctrlKey || this.event.metaKey;
  }

  static removeWorkflow(id: string) {
    if (!Workflow._workflows[id]) warn ("removeWorkflow: No such workflow ", id)
    else {
      let workflow = Workflow._workflows[id];
      // If the attack roll broke and we did we roll again will have an extra hook laying around.
      if (workflow.displayHookId) Hooks.off("preCreateChatMessage", workflow.displayHookId);
      // Just in case there were some hooks left enbled by mistake.
      if (workflow.hideSavesHookId) Hooks.off("preCreateChatMessage", workflow.hideSavesHookId);
      // This can lay around if the template was never placed.
      if (workflow.placeTemlateHookId) Hooks.off("createMeasuredTemplate", workflow.placeTemlateHookId)
      delete Workflow._workflows[id];
    }
  }

  async next(nextState: number) {
    setTimeout(() => this._next(nextState), 1); // give the rest of queued things a chance to happen
    // this._next(nextState);
  }

  async _next(newState: number) {
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===newState)[0];
    warn("workflow.next ", state, this._id, this)
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget);
        if (configSettings.autoTarget !== "none" && this.item.hasAreaTarget) {
          return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
        }
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        if (this.item.hasAreaTarget && configSettings.autoTarget !== "none") {
          debug("Item has template registering Hook");
          this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
          return;
        }
        return this.next(WORKFLOWSTATES.TEMPLATEPLACED);

      case WORKFLOWSTATES.TEMPLATEPLACED:
        const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
        // remove the place template button from the chat card.
        //@ts-ignore
        let content = chatMessage && duplicate(chatMessage.data.content)
        let buttonRe = /<button data-action="placeTemplate">[^<]*<\/button>/
        content = content?.replace(buttonRe, "");
        await chatMessage?.update({
          "content": content, 
          "flags.midi-qol.playSound": false, 
          "flags.midi-qol.type": MESSAGETYPES.ITEM, 
          type: CONST.CHAT_MESSAGE_TYPES.OTHER});
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.VALIDATEROLL:
        // do pre roll checks
        return this.next(WORKFLOWSTATES.PREAMBLECOMPLETE);

      case WORKFLOWSTATES.PREAMBLECOMPLETE:
        return this.next(WORKFLOWSTATES.WAITFORATTACKROLL);
        break;

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);
        }
        if (this.noAutoAttack) return;
        const shouldRoll = this.someEventKeySet() || configSettings.autoRollAttack;
        if (shouldRoll) {
          let attackEvent = duplicate(this.event);
          attackEvent.shiftKey = attackEvent.shiftKey || ["all", "attack"].includes(configSettings.autoFastForward); // fast forward roll if required
          warn("attack roll ", shouldRoll, attackEvent)
          this.item.rollAttack({event: attackEvent});
        }
        return;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.processAttackRoll();
        await this.displayAttackRoll(false, configSettings.mergeCard);
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        }
        // We only roll damage on a hit. but we missed everyone so all over, unless we had no one targetted
        if (configSettings.autoRollDamage === "onHit" && this.hitTargets.size === 0 && this.targets.size !== 0) return this.next(WORKFLOWSTATES.ROLLFINISHED);
        return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);

      case WORKFLOWSTATES.WAITFORDAMGEROLL:
        debug(`wait for damage roll has damaee ${this.item.hasDamage} isfumble ${this.isFumble} no auto damage ${this.noAutoDamage}`);
        if (!this.item.hasDamage) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        if (this.isFumble && configSettings.autoRollDamage !== "none") {
          // Auto rolling damage but we fumbled - we failed - skip everything.
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        } 
        if (this.noAutoDamage) return; // we are emulating the standard card specially.
        const shouldRollDamage = configSettings.autoRollDamage === "always" 
                                || (configSettings.autoRollDamage !== "none" && !this.item.hasAttack)
                                || (configSettings.autoRollDamage === "onHit" && (this.hitTargets.size > 0 || this.targets.size === 0));
        this.event = {shiftKey: false, altKey:false, ctrlKey: false, metaKey: false, type: ""};
        debug("autorolldamage ", configSettings.autoRollDamage, " has attack ", this.item.hasAttack, " targets ", this.hitTargets)
        if (shouldRollDamage) {
          warn(" about to roll damage ", this.event, configSettings.autoRollAttack, configSettings.autoFastForward)
          this.event.shiftKey = ["all", "damage"].includes(configSettings.autoFastForward);
          this.event.altKey =   ["all", "damage"].includes(configSettings.autoFastForward) && this.isCritical;
          debug("Rolling damage ", event, this.itemLevel, this.versatile);
          await this.item.rollDamage({event: this.event, spellLevel: this.itemLevel, versatile: this.versatile});
        }
        return; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
         if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) { 
           // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = new Set(game.user.targets);
          this.hitTargets = new Set(game.user.targets);
          warn(" damage roll complete for non auto target area effects spells", this)
        }
        // apply damage to targets plus saves plus immunities
        // done here cause not needed for betterrolls workflow
        this.defaultDamageType = this.item.data.data.damage?.parts[0][1] || "healing"; // a number of healing spells don't have a type set, so this will help those work
        this.damageDetail = createDamageList(this.damageRoll, this.item, this.defaultDamageType);
        await this.displayDamageRoll(false, configSettings.mergeCard)
        if (this.isFumble) {
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        return this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        if (!this.item.hasSave) {
          this.saves = new Set(); // not auto checking assume no saves
          this.failedSaves = new Set(this.hitTargets);
          return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
        }
        if (configSettings.autoCheckSaves !== "none") {
          //@ts-ignore ._hooks not defined
          debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          // setup to process saving throws as generated
          let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
          let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
          try {
            await this.checkSaves(true);
          } finally {
            //@ts-ignore - does not support ids
            Hooks.off("renderChatMessage", hookId);
            //@ts-ignore does not support ids
            Hooks.off("renderChatMessage", brHookId);
          }
          //@ts-ignore ._hooks not defined
          debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
        } else {// has saves but we are not checking so do nothing with the damage
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        }
        return this.next(WORKFLOWSTATES.SAVESCOMPLETE);

      case WORKFLOWSTATES.SAVESCOMPLETE:
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
  
      case WORKFLOWSTATES.ALLROLLSCOMPLETE:
        debug("all rolls complete ", this.damageDetail)
        if (this.damageDetail.length) processDamageRoll(this, this.damageDetail[0].type)
        return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);

      case WORKFLOWSTATES.APPLYDYNAMICEFFECTS:
        // no item, not auto effects or not module skip
        if (!this.item || !configSettings.autoItemEffects || !installedModules.get("dynamiceffects")) return this.next(WORKFLOWSTATES.ROLLFINISHED);
        const hasDynamicEffects = (this.item?.data.flags?.dynamiceffects?.effects.some(ef => ef.active));
        // no dynamiceffects skip
        if (!hasDynamicEffects) return this.next(WORKFLOWSTATES.ROLLFINISHED);
        let applicationTargets = new Set();
        if (this.item.hasSave) applicationTargets = this.failedSaves;
        else if (this.item.hasAttack) applicationTargets = this.hitTargets;
        else applicationTargets = this.targets;
        warn("Application targets are ", applicationTargets)
        if (applicationTargets?.size) { // perhaps apply item effects
          //@ts-ignore
          let de = window.DynamicEffects;
          // kludge for itemCardId - do differently in DAE
          this.item.data.itemCardId = this.itemCardId;
          debug("Calling dynamic effects with ", applicationTargets, de)
          de.doEffects({item: this.item, actor: this.item.actor, activate: true, targets: applicationTargets, 
                whisper: true, spellLevel: this.itemLevel, damageTotal: this.damageTotal}) 
        }
        return this.next(WORKFLOWSTATES.ROLLFINISHED);

      case WORKFLOWSTATES.ROLLFINISHED:
        warn('Inside workflow.rollFINISHED')
        //@ts-ignore
        if (this.hideSavesHookId) Hooks.off("preCreateChatMessage", this.hideSavesHookId)
        delete Workflow._workflows[this.itemId];
        if (autoRemoveTargets !== "none") setTimeout(untargetDeadTokens, 500); // delay to let the updates finish
        Hooks.callAll("minor-qol.RollComplete", this); // just for the macro writers.
        Hooks.callAll("midi-qol.RollComplete", this);
        // disable sounds for when the chat card might be reloaed.
        
        await game.messages.get(this.itemCardId)?.update({
          "flags.midi-qol.playSound": false, 
          "flags.midi-qol.type": MESSAGETYPES.ITEM, 
          type: CONST.CHAT_MESSAGE_TYPES.OTHER,
          "flags.midi-qol.waitForDiceSoNice": this.item?.hasAttck || this.item?.hasDamage || this.item?.hasSaves,
          "flags.midi-qol.hideTag": this.hideTags,
          "flags.midi-qol.displayId": this.displayId
        });
        //@ts-ignore ui.chat undefined.
        ui.chat.scrollBottom();
        return;
    }
  }

  async displayAttackRoll(whisper = false, doMerge) {
    const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    //@ts-ignore content not definted
    let content = chatMessage && duplicate(chatMessage.data.content)
    let buttonRe = /<button data-action="attack">[^<]*<\/button>/
    content = content?.replace(buttonRe, "");
    var rollSound =  configSettings.diceSound;
    const flags = chatMessage?.data.flags || {};
    let newFlags = {};
    

    if (doMerge) { // display the attack roll
      let searchString = '<div class="midi-qol-attack-roll"></div>';
      const attackString = this.attackAdvantage ? i18n("DND5E.Advantage") : this.attackDisadvantage ? i18n("DND5E.Disadvantage") : i18n("DND5E.Attack")
      let replaceString = `<div style="text-align:center" >${attackString}<div class="midi-qol-attack-roll">${this.attackRollHTML}</div></div>`
      content = content.replace(searchString, replaceString);
      if ( this.attackRoll.dice.length ) {
        const d = this.attackRoll.dice[0];
        
        const isD20 = (d.faces === 20) && ( d.results.length === 1 );
        if (isD20 ) {
          // Highlight successes and failures
          if ( d.options.critical && (d.total >= d.options.critical) ) {
            content = content.replace('dice-total', 'dice-total critical');
            // play a special noise for critical
            // rollSound = configSettings.criticalSound
          } 
          else if ( d.options.fumble && (d.total <= d.options.fumble) ) {
            content = content.replace('dice-total', 'dice-total fumble');
             // play a special sound for fumble
             // rollSound = configSettings.fumbleSound;
          }
          else if ( d.options.target ) {
            if ( this.attackRoll.total >= d.options.target ) content = content.replace('dice-total', 'dice-total success');
            else content = content.replace('dice-total', 'dice-total failure');
          }
        }
      }
      if (!!!game.dice3d?.messageHookDisabled) this.hideTags = [".midi-qol-attack-roll"];
      warn("Display attack roll ", this.attackCardData, this.attackRoll)
      newFlags = mergeObject(flags, {
          "midi-qol": 
          {
            type: MESSAGETYPES.ATTACK,
            waitForDiceSoNice: true,
            hideTag: this.hideTags,
            playSound: true,
            roll: this.attackCardData.roll,
            displayId: this.displayId,
            isCritical: this.isCritical,
            isFumble: this.isFumble,
            isHit: this.isHit,
            sound: rollSound
          }
        }, {overwrite: true, inplace: false}
      )
    }
    await chatMessage?.update({"content": content, flags: newFlags });
  }

  async displayDamageRoll(whisper = false, doMerge) {
    let chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    //@ts-ignore content not definted 
    let content = chatMessage && duplicate(chatMessage.data.content)
    const versatileRe = /<button data-action="versatile">[^<]*<\/button>/
    const damageRe = /<button data-action="damage">[^<]*<\/button>/
    content = content?.replace(damageRe, "")
    content = content?.replace(versatileRe, "<div></div>")
    var rollSound = configSettings.diceSound;
    var newFlags = chatMessage?.data.flags || {};
  
    if (doMerge) {
      const searchString = '<div class="midi-qol-damage-roll"></div>';
      // const damageString = i18n(this.versatile ? "DND5E.VersatileDamage" : "DND5E.Damage");
      const damageString = `(${this.item?.data.data.damage.parts.map(a=>CONFIG.DND5E.damageTypes[a[1]]).join(",") || `${this.defaultDamageType}`})`;
      //@ts-ignore .flavor not defined
      const dmgHeader = configSettings.mergeCardCondensed ? damageString : this.damageCardData.flavor;
      let replaceString = `<div class="midi-qol-damage-roll"><div style="text-align:center" >${dmgHeader}${this.damageRollHTML || ""}</div></div>`
      content = content.replace(searchString, replaceString);
      if (!!!game.dice3d?.messageHookDisabled) {
        if (configSettings.autoRollDamage  === "none" || !["all","damage"].includes(configSettings.autoFastForward)) {
          // not auto rolling damage so hits will have been long displayed
          this.hideTags = [".midi-qol-damage-roll"]
        } else this.hideTags.push(".midi-qol-damage-roll");
      }
      this.displayId = randomID();
      newFlags = mergeObject(newFlags, {
        "midi-qol": {
          waitForDiceSoNice: true,
          type: MESSAGETYPES.DAMAGE,
          playSound: false, 
          sound: rollSound,
          roll: this.damageCardData.roll,
          damageDetail: this.damageDetail,
          damageTotal: this.damageTotal,
          hideTag: this.hideTags,
          displayId: this.displayId
        }
      }, {overwrite: true, inplace: false});
    }
    await chatMessage?.update( {"content": content, flags: newFlags});
  }

  async displayHits(whisper = false, doMerge) {
    const templateData = {
      attackType: this.item.name,
      oneCard: configSettings.mergeCard,
      hits: this.hitDisplayData, 
      isGM: game.user.isGM,
    }
    warn("displayHits ", templateData, whisper, doMerge);
    const hitContent = await renderTemplate("modules/midi-qol/templates/hits.html", templateData) || "No Targets";

    if(doMerge) {
      const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
      // @ts-ignore .content not defined
      var content = duplicate(chatMessage.data.content);    
      var searchString;
      var replaceString;
      if (!!!game.dice3d?.messageHookDisabled) this.hideTags.push(".midi-qol-hits-display")
      switch (this.__proto__.constructor.name) {
        case "BetterRollsWorkflow":
          searchString =  '<footer class="card-footer">';
          replaceString = `<div class="midi-qol-hits-display">${hitContent}</div><footer class="card-footer">`;
          content = content.replace(searchString, replaceString);
          await chatMessage.update({
            "content": content, 
            "flags.midi-qol.playSound": false,
            "flags.midi-qol.type": MESSAGETYPES.HITS,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            "flags.midi-qol.waitForDiceSoNice": true,
            "flags.midi-qol.hideTag": this.hideTags,
            "flags.midi-qol.displayId": this.displayId
          });
          break;
        case "Workflow":
        case "TrapWorkflow":
          searchString =  '<div class="midi-qol-hits-display"></div>';
          replaceString = `<div class="midi-qol-hits-display">${hitContent}</div>`
          content = content.replace(searchString, replaceString);
          await chatMessage.update({
            "content": content, 
            "flags.midi-qol.playSound": this.isCritical || this.isFumble, 
            "flags.midi-qol.type": MESSAGETYPES.HITS,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            "flags.midi-qol.waitForDiceSoNice": true,
            "flags.midi-qol.hideTag": this.hideTags,
            "flags.midi-qol.displayId": this.displayId,
            "flags.midi-qol.sound": this.isCritical ? configSettings.criticalSound : configSettings.fumbleSound
          });
          break;
        }
    } else {
      let speaker = ChatMessage.getSpeaker();
      speaker.alias = (configSettings.useTokenNames && speaker.token) ? canvas.tokens.get(speaker.token).name : speaker.alias;

      if (game.user.targets.size > 0) {
        let chatData: any = {
          user: game.user._id,
          speaker,
          content: hitContent || "No Targets",
          type: CONST.CHAT_MESSAGE_TYPES.OTHER
        }
        if (whisper) 
        {
          chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
          chatData.user = ChatMessage.getWhisperRecipients("GM").find(u=>u.active);
          debug("Trying to whisper message", chatData)
        }
        setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", true);
        setProperty(chatData, "flags.midi-qol.hideTag", "midi-qol-hits-display")
        ChatMessage.create(chatData);
      }
    }
  }

  async displaySaves(whisper, doMerge) {
    let chatData: any = {};
    const noDamage = getSaveMultiplierForItem(this.item) === 0 ? i18n("midi-qol.noDamage") : "";
    let templateData = {
      noDamage,
      saves: this.saveDisplayData, 
        // TODO force roll damage
    }
    const saveContent = await renderTemplate("modules/midi-qol/templates/saves.html", templateData);
    if (doMerge) {
        const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
        // @ts-ignore .content not defined
        let content = duplicate(chatMessage.data.content)
        var searchString;
        var replaceString;
        const saveFlavor = configSettings.displaySaveDC ? this.saveDisplayFlavor : `${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} ${i18n("midi-qol.saving-throws")}`;
        const saveHTML = `<div class="midi-qol-nobox midi-qol-bigger-text">${saveFlavor}</div>`;
        if (!!!game.dice3d?.messageHookDisabled) this.hideTags = [".midi-qol-saves-display"];
        switch (this.__proto__.constructor.name) {
          case "BetterRollsWorkflow":
            searchString =  '<footer class="card-footer">';
            replaceString = `<div data-item-id="${this.item._id}"></div><div class="midi-qol-saves-display">${saveHTML}${saveContent}</div><footer class="card-footer">`
            content = content.replace(searchString, replaceString);
            await chatMessage.update({
              "content": content, 
              type: CONST.CHAT_MESSAGE_TYPES.OTHER,
              "flags.midi-qol.type": MESSAGETYPES.SAVES,
              "flags.midi-qol.hideTag": this.hideTags
            });

            //@ts-ignore
            chatMessage.data.content = content;
          break;
        case "Workflow":
        case "TrapWorkflow":
            searchString =  '<div class="midi-qol-saves-display"></div>';
            // replaceString = `<div data-item-id="${this.item._id}"></div><div class="midi-qol-saves-display"><div class="midi-qol-nobox midi-qol-bigger-text">${saveFlavor}</div>${saveContent}</div>`
            replaceString = `<div data-item-id="${this.item._id}"></div><div class="midi-qol-saves-display">${saveHTML}${saveContent}</div><footer class="card-footer">`
            content = content.replace(searchString, replaceString);
            await chatMessage.update({
              "content": content, 
              type: CONST.CHAT_MESSAGE_TYPES.OTHER,
              "flags.midi-qol.type": MESSAGETYPES.SAVES,
              "flags.midi-qol.hideTag": this.hideTags
            });
            //@ts-ignore
            chatMessage.data.content = content;
        }
    } else {
      let speaker = ChatMessage.getSpeaker();
      speaker.alias = (configSettings.useTokenNames && speaker.token) ? canvas.tokens.get(speaker.token).name : speaker.alias;

      chatData = {
        user: game.user._id,
        speaker,
        content: `<div data-item-id="${this.item._id}"></div> ${saveContent}`,
        flavor: `<h4>${this.saveDisplayFlavor}</h4>`, 
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        flags: { "midi-qol": {type: MESSAGETYPES.SAVES, waitForDiceSoNice: true}}
      };
      if (configSettings.autoCheckSaves === "whisper" || whisper) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
        chatData.user = ChatMessage.getWhisperRecipients("GM").find(u=>u.active)
      }
      await ChatMessage.create(chatData);
    }
  }

  playerFor(target: Token) {
    // find the controlling player
    let player = game.users.players.find(p => p.character?._id === target.actor._id);
    if (!player?.active) { // no controller - find the first owner who is active
      //@ts-ignore permissions not defined
      player = game.users.players.find(p => p.active && target.actor.data.permission[p._id] === CONST.ENTITY_PERMISSIONS.OWNER)
      //@ts-ignore permissions not defined
      if (!player) player = game.users.players.find(p => p.active && target.actor.data.permission.default === CONST.ENTITY_PERMISSIONS.OWNER)
    }
    return player;
  }

  hideSaveRolls = (data, options) => {
    const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    debug("hideSaveRolls: chat message is ", this.itemCardId, chatMessage, data.flags, data.user);
    if (data.flags?.dnd5e.roll.type !== "save") return true;
    //@ts-ignore .role not defined. Hide gm/asst gm rolls
    if ([3,4].includes(game.users.get(data.user)?.role)) return false;
    return true;
  }

/**
 * update this.saves to be a Set of successful saves from the set of tokens this.hitTargets and failed saves to be the complement
 */
  async checkSaves(whisper = false) {
    this.saves = new Set();
    this.failedSaves = new Set()
    this.advantageSaves = new Set();
    this.saveDisplayData = [];
    debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)

    if (this.hitTargets.size <= 0) {
      this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`
      return;
    }
    let rollDC = this.item.data.data.save.dc;
    let rollAbility = this.item.data.data.save.ability;
  
    let promises = [];
    // make sure saving throws are renabled.
    try {
      if (configSettings.autoCheckSaves !== "allShow") {
        //@ts-ignore ._hooks not defined
        debug("Check Saves: renderChat message hooks length ", Hooks._hooks["preCreateChatMessage"]?.length)
        this.hideSavesHookId = Hooks.on("preCreateChatMessage", this.hideSaveRolls.bind(this))
      } else this.hideSavesHookId = null;

      for (let target of this.hitTargets) {
        if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
     
        let advantage = false;
        // If spell, check for magic resistance
        if (this.item.data.type === "spell") {
          // check magic resistance in custom damage reduction traits
          advantage = (target?.actor?.data?.data?.traits?.dr?.custom || "").includes(i18n("midi-qol.MagicResistant"));
          // check magic resistance as a feature (based on the SRD name as provided by the DnD5e system)
          //@ts-ignore - data.data.items not defined in types
          advantage = advantage || (target?.actor?.data?.items?.filter(a => a.type==="feat" && a.name===i18n("midi-qol.MagicResistanceFeat"))?.length > 0);
          if (advantage) this.advantageSaves.add(target);
          debug(`${target.actor.name} resistant to magic : ${advantage}`);
        }

        let event = {};
        if (advantage) event = {shiftKey: false, ctlKey: false, altKey: true, metaKey: false}
        else event = {shiftKey: true, ctlKey: false, altKey: false, metaKey: false}

        if (configSettings.playerRollSaves !== "none") { // find a player to send the request to
          var player = this.playerFor(target);
        }
        if (configSettings.playerRollSaves !== "none" && player?.active && !player.isGM) {
          warn(`Player ${player.name} controls actor ${target.actor.name} - requesting ${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} save`);
          promises.push(new Promise((resolve, reject) => {
            const eventToUse = duplicate(event);
            const advantageToUse = advantage;
            let requestId = target.actor.id;
            const playerName = player.name;
            const playerId = player._id;
            if (["letem", "letmeQuery"].includes(configSettings.playerRollSaves) && installedModules.get("lmrtfy")) requestId = randomID();
            this.saveRequests[requestId] = resolve;
            
            requestPCSave(this.item.data.data.save.ability, player.id, target.actor.id, advantage, this.item.name, rollDC, requestId)

            // set a timeout for taking over the roll
            this.saveTimeouts[requestId] = setTimeout(async () => {
              console.warn(`Timeout waiting for ${playerName} to roll ${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} save - rolling for them`)
              if (this.saveRequests[requestId]) {
                  delete this.saveRequests[requestId];
                  delete this.saveTimeouts[requestId];
                  //@ts-ignore actor.rollAbilitySave
                  let result = await target.actor.rollAbilitySave(this.item.data.data.save.ability, {messageData: { user: playerId }, event: eventToUse, advantage: advantageToUse});
                  resolve(result);
              }
            }, (configSettings.playerSaveTimeout || 1) * 1000);
          }))
        } else {
          // Find a player owner for the roll if possible
          let owner = this.playerFor(target);
          // If no player owns the token, find an active GM
          if (!owner) owner = game.users.find((u: User) => u.isGM && u.active);
          // Fall back to rolling as the current user
          if (!owner) owner = game.user;
          //@ts-ignore actor.rollAbilitySave
          promises.push(target.actor.rollAbilitySave(this.item.data.data.save.ability, {messageData: { user: owner._id }, event, advantage}));
        }
      }
    } catch (err) {
        console.warn(err)
    } finally {
    }
    debug("check saves: requests are ", this.saveRequests)
    var results = await Promise.all(promises);
    this.saveResults = results;
    //@ts-ignore
    if (this.hideSavesHookId) Hooks.off("preCreateChatMessage", this.hideSavesHookId);
    //@ts-ignore ._hooks not defined
    debug("Check Saves: renderChat message hooks length ", Hooks._hooks["preCreateCatMessage"]?.length)
    this.hideSavesHookId = null;

    let i = 0;
    for (let target of this.hitTargets) {
      if (!target.actor) continue;
      let rollTotal = results[i].total;
      let saved = rollTotal >= rollDC;
      if (rollTotal >= rollDC) this.saves.add(target);
      else this.failedSaves.add(target);

      if (game.user.isGM) log(`Ability save: ${target.name} rolled ${rollTotal} vs ${rollAbility} DC ${rollDC}`);
      let saveString = i18n(saved ? "midi-qol.save-success" : "midi-qol.save-failure");
      let adv = this.advantageSaves.has(target) ? `(${i18n("DND5E.Advantage")})` : "";
      let img = target.data.img || target.actor.img;
      if ( VideoHelper.hasVideoExtension(img) ) {
        //@ts-ignore - createThumbnail not defined
        img = await game.video.createThumbnail(img, {width: 100, height: 100});
      }
      this.saveDisplayData.push({
        name: target.name, 
        img, 
        isPC: target.actor.isPC, 
        target, 
        saveString, 
        rollTotal, 
        id: target.id, 
        adv
      });
      i++;
    }

    this.saveDisplayFlavor = `${this.item.name} DC ${rollDC} ${CONFIG.DND5E.abilities[rollAbility]} ${i18n(this.hitTargets.size > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw")}:`;
  }

  processSaveRoll = (message, html, data) => {
    const isLMRTFY = (installedModules.get("lmrtfy") && message.data.flags?.lmrtfy?.data);
    if (!isLMRTFY && message.data.flags?.dnd5e?.roll?.type !== "save") return true;
    const requestId =  isLMRTFY ? message.data.flags.lmrtfy.data : message.data?.speaker?.actor;
    warn("processSaveToll", isLMRTFY, requestId, this.saveRequests )

    if (!requestId) return true;
    if (!this.saveRequests[requestId]) return true;
    const total = message._roll._total;
    const formula = message._roll._formula;
    if (this.saveRequests[requestId]) {
      clearTimeout(this.saveTimeouts[requestId]);
      this.saveRequests[requestId]({total, formula})
      delete this.saveRequests[requestId];
      delete this.saveTimeouts[requestId];
    }      
    return true;
  }

  processBetterRollsChatCard (message, html, data) {
    if (!checkBetterRolls && message?.data?.content?.startsWith('<div class="dnd5e red-full chat-card"'))  return;
    debug("processBetterRollsChatCard", message. html, data)
    const requestId = message.data.speaker.actor;
    if (!this.saveRequests[requestId]) return true;
    const title = html.find(".item-name")[0]?.innerHTML
    if (!title) return true;
    if (!title.includes("Save")) return true;
    const formula = "1d20";
    const total = html.find(".dice-total")[0]?.innerHTML;
    clearTimeout(this.saveTimeouts[requestId]);
    this.saveRequests[requestId]({total, formula})
    delete this.saveRequests[requestId];
    delete this.aveTimeouts[requestId];
    return true;
  }

  processAttackRoll() {
    if (isNewerVersion(game.data.version, "0.6.9") ) {
      //@ts-ignore
      this.diceRoll = this.attackRoll.results[0];
     
      //@ts-ignore .terms undefined
      this.isCritical = this.diceRoll  >= this.attackRoll.terms[0].options.critical;
      //@ts-ignore .terms undefined
      this.isFumble = this.diceRoll <= this.attackRoll.terms[0].options.fumble;
    } else {

      this.diceRoll = this.attackRoll.dice[0].total;
      this.isCritical = this.diceRoll  >= this.attackRoll.parts[0].options.critical;
      this.isFumble = this.diceRoll <= this.attackRoll.parts[0].options.fumble;
    }
    this.attackTotal = this.attackRoll.total;
    debug("processItemRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble)
  }

  async checkHits() {
    let isHit = true;

    let actor = this.actor;
    let item = this.item;
    
    // check for a hit/critical/fumble
    this.hitTargets = new Set();
    this.hitDisplayData = [];
  
    if (item?.data.data.target?.type === "self") {
      this.targets = new Set([canvas.tokens.get(this.tokenId)]); //TODO check this is right
      debug("Check hits - self target")
    } else for (let targetToken of this.targets) {
      isHit = false;
      let targetName = configSettings.useTokenNames && targetToken.name ? targetToken.name : targetToken.actor?.name;
      let targetActor = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      let targetAC = targetActor.data.data.attributes.ac.value;
      if (!this.isFumble && !this.isCritical) {
          // check to see if the roll hit the target
          // let targetAC = targetActor.data.data.attributes.ac.value;
          isHit = this.attackTotal >= targetAC;
      }
      if (game.user.isGM) log(`${this.speaker.alias} Rolled a ${this.attackTotal} to hit ${targetName}'s AC of ${targetAC} is hit ${isHit || this.isCritical}`);
      // Log the hit on the target
      let attackType = ""; //item?.name ? i18n(item.name) : "Attack";
      let hitString = this.isCritical ? i18n("midi-qol.criticals") : this.isFumble? i18n("midi-qol.fumbles") : isHit ? i18n("midi-qol.hits") : i18n("midi-qol.misses");
      let img = targetToken.data?.img || targetToken.actor.img;
      if ( VideoHelper.hasVideoExtension(img) ) {
        //@ts-ignore
        img = await game.video.createThumbnail(img, {width: 100, height: 100});
      }
      this.hitDisplayData.push({isPC: targetToken.actor.isPC, target: targetToken, hitString, attackType, img});
  
      // If we hit and we have targets and we are applying damage say so.
      if (isHit || this.isCritical) this.hitTargets.add(targetToken);
    }
  }
}

export class DamageOnlyWorkflow extends Workflow {
  constructor(actor: Actor5e, token: Token, damageTotal: number, damageType: string, targets: [Token], roll: Roll, 
        options: {flavor: string, itemData: {itemCardId: string}}= {flavor: "", itemData: {itemCardId: null}}) {
    super(actor, null, token, ChatMessage.getSpeaker(), shiftOnlyEvent)
    this.damageTotal = damageTotal;
    this.damageDetail = [{type: damageType,  damage: damageTotal}];
    this.damageRoll = roll;
    this.flavor = options.flavor;
    this.defaultDamageType = damageType;
    console.warn("Targets are ", targets)
    this.targets = new Set(targets);
    if (options.itemData.itemCardId) this.itemCardId = options.itemData.itemCardId;
    warn("Damage only workflow data", options.itemData, this)
    this.next(WORKFLOWSTATES.NONE);
    return this;
  }

  async _next(newState) {
    this.currentState = newState;
    warn("Newstate is ", newState)
    // let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===this.currentState)[0];
    switch(newState) {
      case WORKFLOWSTATES.NONE:
        if (configSettings.mergeCard) {
          this.damageRollHTML = await this.damageRoll.render();
          this.damageCardData = {
            //@ts-ignore
            flavor: "damage flavor",
            roll: this.damageRoll
          }
        } else this.damageRoll.toMessage({flavor: this.flavor});
        this.hitTargets = new Set(this.targets);
        debug("DamageOnlyWorkflow.next ", newState, configSettings.speedItemRolls, this);
        warn("workflow damage only display Damage Roll")
        await this.displayDamageRoll(false, configSettings.mergeCard)
        warn("workflow damage only apply damage Damage Roll")
        applyTokenDamage(this.damageDetail, this.damageTotal, this.targets, null, new Set())
        return super.next(WORKFLOWSTATES.ROLLFINISHED);

      default: return super._next(newState);
    }
  }
}

export class TrapWorkflow extends Workflow {

  trapSound: {playlist: string, sound: string};
  trapCenter: {x: number, y: number};
  saveTargets: any;

  constructor(actor: Actor5e, item: Item5e, targets: [Token], trapCenter: {x: number, y: number} = undefined, trapSound: {playlist: string , sound: string} = undefined,  event: any = null) {
    super(actor, item, null, ChatMessage.getSpeaker, event);
    this.targets = new Set(targets);
    if (!this.event) this.event = duplicate(shiftOnlyEvent);
    this.trapSound = trapSound;
    this.trapCenter = trapCenter;
    this.saveTargets = new Set(game.user.targets);
    this.next(WORKFLOWSTATES.NONE)
  }
  
  async _next(newState: number) {
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===newState)[0];
    warn("attack workflow.next ", state, this._id, this)
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        this.itemCardId = (await showItemCard.bind(this.item)(false, this, true)).id;
        //@ts-ignore
        if (this.trapSound) AudioHelper.play({src: this.trapSound}, false)
        debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget);
        // don't support the placement of a tempalte
        return this.next(WORKFLOWSTATES.AWAITTEMPLATE);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        if (!this.item.hasAreaTarget || !this.trapCenter) return this.next(WORKFLOWSTATES.TEMPLATEPLACED)
        //@ts-ignore
        this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
        const template = AbilityTemplate.fromItem(this.item);
        // template.draw();
        // get the x and y position from the trapped token
        template.data.x = this.trapCenter.x;
        template.data.y = this.trapCenter.y;
        // Create the template
        canvas.scene.createEmbeddedEntity("MeasuredTemplate", template.data);
        return;

      case WORKFLOWSTATES.TEMPLATEPLACED:
        // perhaps auto place template?
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.VALIDATEROLL:
        // do pre roll checks
        return this.next(WORKFLOWSTATES.WAITFORATTACKROLL);

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);
        }
        warn("attack roll ", this.event)
        this.item.rollAttack({event: this.event});
        return;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.processAttackRoll();
        await this.displayAttackRoll(false, configSettings.mergeCard);
        await this.checkHits();
        await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);

      case WORKFLOWSTATES.WAITFORDAMGEROLL:
        if (!this.item.hasDamage) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        if (this.isFumble) {
          // fumble means no trap damage/effects
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        } 
        this.event.altKey =  this.isCritical;
        debug("Rolling damage ", this.event, this.itemLevel, this.versatile);
        await this.item.rollDamage({event: this.event, spellLevel: this.itemLevel, versatile: this.versatile});
        return; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
         if (!this.item.hasAttack) { // no attack roll so everyone is hit
          this.hitTargets = new Set(this.targets)
          warn(" damage roll complete for non auto target area effects spells", this)
        }
        // apply damage to targets plus saves plus immunities
        await this.displayDamageRoll(false, configSettings.mergeCard)
        if (this.isFumble) {
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        let defaultDamageType = this.item?.data.data.damage?.parts[0][1] || this.defaultDamageType;
        this.damageDetail = createDamageList(this.damageRoll, this.item, defaultDamageType);
        return this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        if (!this.item.hasSave) {
          this.saves = new Set(); // no saving throw, so no-one saves
          this.failedSaves = new Set(this.hitTargets);
          return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
        }
        let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
        let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
        try {
          await this.checkSaves(true);
        } finally {
          //@ts-ignore - does not support ids
          Hooks.off("renderChatMessage", hookId);
          //@ts-ignore does not support ids
          Hooks.off("renderChatMessage", brHookId);
        }
        //@ts-ignore ._hooks not defined
        debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
        this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
        return this.next(WORKFLOWSTATES.SAVESCOMPLETE);

      case WORKFLOWSTATES.SAVESCOMPLETE:
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
  
      case WORKFLOWSTATES.ALLROLLSCOMPLETE:
        debug("all rolls complete ", this.damageDetail)
        if (this.damageDetail.length) processDamageRoll(this, this.damageDetail[0].type)
        return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);

        case WORKFLOWSTATES.ROLLFINISHED:
        // area effect trap, put back the targets the way they were
        if (this.saveTargets && this.item.hasAreaTarget) {
            game.user.targets.forEach(t => {
              //@ts-ignore
              t.setTarget(false, { releaseOthers: false });
            });
            game.user.targets.clear();
            this.saveTargets.forEach(t => {
              t.setTarget(true, {releaseOthers: false})
              game.user.targets.add(t)
            })
          }
          return super._next(WORKFLOWSTATES.ROLLFINISHED);

      default:
        return super._next(newState);
    }
  }
}

export class BetterRollsWorkflow extends Workflow {
  betterRollsHookId: number;
  static get(id:string):BetterRollsWorkflow {
    return Workflow._workflows[id];
  }

  async _next(newState) {
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===this.currentState)[0];
    warn("betterRolls workflow.next ", state, configSettings.speedItemRolls, this)
    switch (newState) {
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        // since this is better rolls as soon as we are ready for the attack roll we have both the attack roll and damage
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);
        }
        return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        debug(this.attackRollHTML)
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        }
        return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);

      case WORKFLOWSTATES.WAITFORDAMGEROLL:
        // better rolls always have damage rolled
        if (!this.item.hasDamage) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        else return this.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) { 
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = new Set(game.user.targets);
          this.hitTargets = new Set(game.user.targets);
       }
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) { //TODO: Is this right?
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (this.item.hasSave) return this.next(WORKFLOWSTATES.WAITFORSAVES)
        processDamageRoll(this, "psychic");
        return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);

      default: 
        return await super._next(newState);
    }
  }
}

