//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e  from "../../../systems/dnd5e/module/item/entity.js"
import { warn, debug, log, i18n, noDamageSaves, cleanSpellName, MESSAGETYPES, error } from "../midi-qol";
import { speedItemRolls, autoCheckHit, autoRollDamage, autoFastForward, autoTarget, useTokenNames, autoApplyDamage, damageImmunities, playerRollSaves, itemRollButtons, autoCheckSaves, checkBetterRolls, playerSaveTimeout, mergeCard, autoItemEffects, checkSaveText, configSettings } from "./settings";
import { selectTargets } from "./itemhandling";
import { broadcastData } from "./GMAction";
import { installedModules } from "./setupModules";


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
  ROLLFINISHED: 14,
};

export class Workflow {
  [x: string]: any;
  static _actions: {};
  static _workflows: {} = {};
  actor : Actor5e;
  item: Item5e;
  itemCardId : string;
  itemCardData: {};

  event: {shiftKey: boolean, altKey: boolean, ctrlKey: boolean, metaKey: boolean, type: string};
  speaker: any;
  token: Token;
  targets: Set<Token>;
  placeTemlateHookId: number;

  _id: string;
  saveDisplayFlavor: string;
  showCard: boolean;
  get id() { return this._id}
  itemId: string;
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
  noAutoDamage: boolean; // override damage roll for damage rolls

  saves: Set<Token>;
  failedSaves: Set<Token>
  advantageSaves : Set<Token>;
  saveCount: number;
  saveRequests: any;
  saveTimeouts: any;
  hideSavesHookId: number;
  versatile: boolean;
  saveDisplayData;

  chatMessage: ChatMessage;
  extraText: string;

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
    this.token = token;
    this.speaker = speaker;
    this.targets = (item?.data.data.target?.type === "self") ? getSelfTargetSet(actor) : new Set(game.user.targets);
    this.saves = new Set();
    this.failedSaves = new Set(this.targets)
    this.hitTargets = new Set(game.user.targets);
    this.isCritical = false;
    this.isFumble = false;
    this.currentState = WORKFLOWSTATES.NONE;
    this.itemId = item?.uuid;
    this.itemLevel = item?.level || 0;
    this._id = randomID();
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
    Workflow._workflows[item?.uuid] = this;
  }

  public someEventKeySet() {
    return this.event.shiftKey || this.event.altKey || this.event.ctrlKey || this.event.metaKey;
  }

  static removeWorkflow(id: string) {
    if (!Workflow._workflows[id]) warn ("removeWorkflow: No such workflow ", id)
    else {
      let workflow = Workflow._workflows[id];
      // Just in case there were some hooks left enbled by mistake.
      if (workflow.hideSavesHookId) Hooks.off("preCreateChatMessage", workflow.hideSavesHookId);
      // This can lay around if the template was never placed.
      if (workflow.placeTemlateHookId) Hooks.off("createMeasuredTemplate", workflow.placeTemlateHookId)
      delete Workflow._workflows[id];
    }
  }

  async next(nextState: number) {
    setTimeout(() => this._next(nextState), 1); // give the rest of queued things a chance to happen
  }

  async _next(newState: number) {
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===newState)[0];
    warn("workflow.next ", state, this._id, this)
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        debug(" workflow.next ", state, this.item, autoTarget, this.item.hasAreaTarget);
        if (autoTarget && this.item.hasAreaTarget) {
          return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
        }
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        if (this.item.hasAreaTarget && autoTarget) {
          debug("Item has template registering Hook");
          this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
          return;
        }
        return this.next(WORKFLOWSTATES.TEMPLATEPLACED);

      case WORKFLOWSTATES.TEMPLATEPLACED:
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
        const shouldRoll = this.someEventKeySet() || (["all", "attack"].includes(autoFastForward));
        if (shouldRoll) {
          let attackEvent = duplicate(this.event);
          attackEvent.shiftKey = attackEvent.shiftKey || ["all", "attack"].includes(autoFastForward); // fast forward roll if required
          warn("attack roll ", shouldRoll, attackEvent)
          this.item.rollAttack({event: attackEvent});
        }
        return;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.processAttackRoll();
        await this.displayAttackRoll(false, mergeCard);
        if (autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(autoCheckHit === "whisper", mergeCard);
        }
        return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);

      case WORKFLOWSTATES.WAITFORDAMGEROLL:
        if (!this.item.hasDamage) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        if (this.isFumble) return this.next(WORKFLOWSTATES.ROLLFINISHED);
        if (this.noAutoDamage)  return;
        const shouldRollDamage = autoRollDamage === "always" 
                                || (autoRollDamage !== "none" && !this.item.hasAttack)
                                || (autoRollDamage === "onHit" && (this.hitTargets.size > 0 || this.targets.size === 0))
        if (shouldRollDamage) {
          this.event.shiftKey = ["all", "damage"].includes(autoFastForward);
          this.event.altKey =   ["all", "damage"].includes(autoFastForward) && this.isCritical;
          debug("Rolling damage ", event, this.itemLevel, this.versatile);
          await this.item.rollDamage({event: this.event, spellLevel: this.itemLevel, versatile: this.versatile});
        }
        return; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        // apply damage to targets plus saves plus immunities
         // done here cause not needed for betterrolls workflow
        await this.displayDamageRoll(false, mergeCard)
        if (this.isFumble) {
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        let defaultDamageType = this.item.data.data.damage?.parts[0][1] || "bludgeoning";
        this.damageDetail = createDamageList(this.damageRoll, this.item, defaultDamageType);
        return this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        if (!this.item.hasSave) {
          this.saves = new Set(); // not auto checking assume no saves
          this.failedSaves = new Set(this.hitTargets);
          return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
        }
        if (autoCheckSaves !== "none") {
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
          this.displaySaves(autoCheckSaves === "whisper", mergeCard);
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
        if (this.item?.data.flags) {
          let applicationTargets = new Set();

          if (this.item.hasSave) applicationTargets = this.failedSaves;
          else if (this.item.hasAttack) applicationTargets = this.hitTargets;
          else applicationTargets = this.targets;
          if (this.item && autoItemEffects && installedModules.get("dynamiceffects") && applicationTargets?.size) { // perhaps apply item effects
            // If we rolled a save update theTargets
            //@ts-ignore
            let de = window.DynamicEffects;
            debug("Calling dynamic effects with ", applicationTargets, de)
            de.doEffects({item: this.item, actor: this.item.actor, activate: true, targets: applicationTargets, 
                  whisper: true, spellLevel: this.itemLevel, damageTotal: this.damageTotal}) 
          }
        }
        return this.next(WORKFLOWSTATES.ROLLFINISHED);

      case WORKFLOWSTATES.ROLLFINISHED:
        //@ts-ignore
        if (this.hideSavesHookId) Hooks.off("preCreateChatMessage", this.hideSavesHookId)
        delete Workflow._workflows[this.itemId];
        Hooks.callAll("minor-qol.RollComplete", this); // just for the macro writers.
        Hooks.callAll("midi-qol.RollComplete", this);
        //@ts-ignore ui.chat undefined.
        ui.chat.scrollBottom();
        return;
    }
  }

  async displayAttackRoll(whisper = false, doMerge) {
    // display the attack roll
    if (doMerge) {
      const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
      //@ts-ignore content not definted
      let content = duplicate(chatMessage.data.content)
      let searchString = '<div class="midi-qol-attack-roll"></div>';
      let buttoneRe = /<button data-action="attack">[^<]*<\/button>/
      const attackString = this.attackAdvantage ? i18n("DND5E.Advantage") : this.attackDisadvantage ? i18n("DND5E.Disadvantage") : i18n("DND5E.Attack")
      let replaceString = `<div style="text-align:center" >${attackString}<div class="midi-qol-attack-roll">${this.attackRollHTML}</div></div>`
      content = content.replace(searchString, replaceString);
      content = content.replace(buttoneRe, "");
      warn("dice length ", this.attackRoll.dice.length)
      if ( this.attackRoll.dice.length ) {
        const d = this.attackRoll.dice[0];
        const isD20 = (d.faces === 20) && ( d.results.length === 1 );
        if (isD20 ) {
          // Highlight successes and failures
          if ( d.options.critical && (d.total >= d.options.critical) ) content = content.replace('dice-total', 'dice-total critical');
          else if ( d.options.fumble && (d.total <= d.options.fumble) ) content = content.replace('dice-total', 'dice-total fumble');
          else if ( d.options.target ) {
            if ( this.attackRoll.total >= d.options.target ) content = content.replace('dice-total', 'dice-total success');
            else content = content.replace('dice-total', 'dice-total failure');
          }
        }
      }
      await chatMessage.update({"content": content});
    }
  }

 async displayDamageRoll(whisper = false, doMerge) {
    if (doMerge) {
      const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
      //@ts-ignore content not definted 
      let content = duplicate(chatMessage.data.content)
      const searchString = '<div class="midi-qol-damage-roll"></div>';
      const damageRe = /<button data-action="damage">[^<]*<\/button>/
      const versatileRe = /<button data-action="versatile">[^<]*<\/button>/
      //@ts-ignore flavor not defined on ChatMessage
      
      const damageString = i18n(this.versatile ? "DND5E.VersatileDamage" : "DND5E.Damage");
      //@ts-ignore .flavor not defined
      const dmgHeader = configSettings.mergeCardCondensed ? damageString : this.damageCardData.flavor;
      let replaceString = `<div style="text-align:center" >${dmgHeader}<div class="midi-qol-damage-roll">${this.damageRollHTML || ""}</div></div>`

      content = content.replace(searchString, replaceString);
      content = content.replace(damageRe, "")
      content = content.replace(versatileRe, "<div></div>")

      // content = addChatDamageButtonsToHTML(this.damageTotal, this.damageDetail, content, this.item);
      await chatMessage.update({"content": content});
      //@ts-ignore .conennt not defined on ChatMessage
      chatMessage.content = content;
    }
    // not merging it has been displayed by the item.rollAttack()
  }

  async displayHits(whisper = false, doMerge) {
    const templateData = {
      attackType: this.item.name,
      oneCard: mergeCard,
      hits: this.hitDisplayData, 
      isGM: game.user.isGM,
    }
    debug("displayHits ", templateData, whisper, doMerge);
    const hitContent = await renderTemplate("modules/midi-qol/templates/hits.html", templateData);

    if(doMerge) {
      const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
      // @ts-ignore .content not defined
      var content = duplicate(chatMessage.data.content);    
      var searchString;
      var replaceString;
      switch (this.__proto__.constructor.name) {
        case "BetterRollsWorkflow":
          searchString =  '<footer class="card-footer">';
          replaceString = `<div class="midi-qol-hits-display">${hitContent}</div><footer class="card-footer">`;
          content = content.replace(searchString, replaceString);
          await chatMessage.update({"content": content});
          //@ts-ignore
          chatMessage.content = content;
          break;
        case "Workflow":
          // @ts-ignore .content not defined
          searchString =  '<div class="midi-qol-hits-display"></div>';
          replaceString = `<div class="midi-qol-hits-display">${hitContent}</div>`
          content = content.replace(searchString, replaceString);
          await chatMessage.update({"content": content});
          //@ts-ignore
          chatMessage.content = content;
          break;
        }
    } else {
      let speaker = ChatMessage.getSpeaker();
      speaker.alias = (useTokenNames && speaker.token) ? canvas.tokens.get(speaker.token).name : speaker.alias;

      if (game.user.targets.size > 0) {
        let chatData: any = {
          user: game.user._id,
          speaker,
          content: hitContent,
          type: CONST.CHAT_MESSAGE_TYPES.OTHER
        }
        if (whisper) 
        {
          chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
          chatData.user = ChatMessage.getWhisperRecipients("GM").find(u=>u.active);
          debug("Trying to whisper message", chatData)
        }
        setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", !!!game.dice3d?.messageHookDisabled);
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
        switch (this.__proto__.constructor.name) {
          case "BetterRollsWorkflow":
            searchString =  '<footer class="card-footer">';
            replaceString = `<div data-item-id="${this.item._id}"></div><div class="midi-qol-saves-display"><div class="midi-qol-box midi-qol-bigger-text">${this.saveDisplayFlavor}</div>${saveContent}</div><footer class="card-footer">`
            content = content.replace(searchString, replaceString);
            await chatMessage.update({"content": content});
            //@ts-ignore
            chatMessage.data.content = content;
          break;
        case "Workflow":
            searchString =  '<div class="midi-qol-saves-display"></div>';
            replaceString = `<div data-item-id="${this.item._id}"></div><div class="midi-qol-saves-display"><div class="midi-qol-box midi-qol-bigger-text">${this.saveDisplayFlavor}</div>${saveContent}</div>`
            content = content.replace(searchString, replaceString);
            await chatMessage.update({"content": content});
            //@ts-ignore
            chatMessage.data.content = content;
        }
    } else {
      let speaker = ChatMessage.getSpeaker();
      speaker.alias = (useTokenNames && speaker.token) ? canvas.tokens.get(speaker.token).name : speaker.alias;

      chatData = {
        user: game.user._id,
        speaker,
        content: `<div data-item-id="${this.item._id}"></div> ${saveContent}`,
        flavor: `<h4>${this.saveDisplayFlavor}</h4>`, 
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        flags: { minorQolType: MESSAGETYPES.saveData }
      };
      if (autoCheckSaves === "whisper" || whisper) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
        chatData.user = ChatMessage.getWhisperRecipients("GM").find(u=>u.active)
      }
      setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", !!!game.dice3d?.messageHookDisabled);
      await ChatMessage.create(chatData);
    }
  }

  playerFor(target: Token) {
    // find the controlling player
    let player = game.users.players.find(p => p.character?._id === target.actor._id);
    if (!player?.active) { // no controller - find the first owner who is active
      //@ts-ignore permissions not define
      player = game.users.players.find(p => p.active && target.actor.data.permission[p._id] === CONST.ENTITY_PERMISSIONS.OWNER)
      //@ts-ignore permissions not define
      if (!player) player = game.users.players.find(p => p.active && target.actor.data.permission.default === CONST.ENTITY_PERMISSIONS.OWNER)
    }
    return player;
  }

  hideSaveRolls = (data, options) => {
    const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    debug("hideSaveRolls: chat message is ", this.itemCardId, chatMessage, data.flags, this.saveCount);
    if (data.flags?.dnd5e.roll.type !== "save") return true;
    if (data.user !== game.user.id) return true;
    this.saveCount -= 1;
    if (this.saveCount < 0) {
      //@ts-ignore
      Hooks.off("preCreateChatMessage", this.hideSavesHookId);
      this.hideSavesHookId = null;
      return true
    }
    options.displaySheet = false;
    return false;
  }

/**
 * 
 * 
 * update this.saves to be a Set of successful saves from the set of tokens theTargets.
 */
  async checkSaves(whisper = false) {
    this.saves = new Set();
    this.failedSaves = new Set()
    this.advantageSaves = new Set();
    this.saveDisplayData = [];
    debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)
    if (this.hitTargets.size <= 0) return;
    let theTargets = this.hitTargets;
    let rollDC = this.item.data.data.save.dc;
    let rollAbility = this.item.data.data.save.ability;
  
    let promises = [];
    this.saveCount = autoCheckSaves !== "allShow" ? theTargets.size : 0;
    // make sure saving throws are renabled.
    try {
      if (autoCheckSaves !== "allShow") {
        //@ts-ignore ._hooks not defined
        debug("Check Saves: renderChat message hooks length ", Hooks._hooks["preCreateChatMessage"]?.length)
        this.hideSavesHookId = Hooks.on("preCreateChatMessage", this.hideSaveRolls.bind(this))
      } else this.hideSavesHookId = null;

      for (let target of theTargets) {
        if (!target.actor) { // no actor means multi levels or bugged actor - but we won't roll a save
          this.saveCount -= 1;
          continue;
        }
      
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

        if (playerRollSaves !== "none") { // find a player to send the request to
          var player = this.playerFor(target);
        }
        if (playerRollSaves !== "none" && player?.active) {
          this.saveCount = Math.max(this.saveCount - 1, 0)
          warn(`Player ${player.name} controls actor ${target.actor.name} - requesting ${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} save`);
          promises.push(new Promise((resolve, reject) => {
            const eventToUse = duplicate(event);
            const advantageToUse = advantage;
            let requestId = target.actor.id;
            const playerName = player.name;
            if (["letem", "letmeQuery"].includes(playerRollSaves) && installedModules.get("lmrtfy")) requestId = randomID();
            this.saveRequests[requestId] = resolve;
            requestPCSave(this.item.data.data.save.ability, player.id, target.actor.id, advantage, this.item.name, rollDC, requestId)

            // set a timeout for taking over the roll
            this.saveTimeouts[requestId] = setTimeout(async () => {
              console.warn(`Timeout waiting for ${playerName} to roll ${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} save - rolling for them`)
              if (this.saveRequests[requestId]) {
                  delete this.saveRequests[requestId];
                  delete this.saveTimeouts[requestId];
                  //@ts-ignore actor.rollAbilitySave
                  let result = await target.actor.rollAbilitySave(this.item.data.data.save.ability, {messageData: { user: player._id }, event: eventToUse, advantage: advantageToUse});
                  resolve(result);
              }
            }, playerSaveTimeout * 1000);
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

    //@ts-ignore
    if (this.hideSavesHookId) Hooks.off("preCreateChatMessage", this.hideSavesHookId);
    //@ts-ignore ._hooks not defined
    debug("Check Saves: renderChat message hooks length ", Hooks._hooks["preCreateCatMessage"]?.length)
    this.hideSavesHookId = null;

    let i = 0;
    for (let target of theTargets) {
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

    this.saveDisplayFlavor = `${this.item.name} DC ${rollDC} ${CONFIG.DND5E.abilities[rollAbility]} ${i18n(theTargets.size > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw")}:`;
  }

  processSaveRoll = (message, html, data) => {
    const isLMRTFY = (installedModules.get("lmrtfy") && message.data.flags?.lmrtfy?.data);
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
    if (isNewerVersion(game.data.version, "0.6.5") ) {
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
    let theTargets = this.targets;
    let isHit = true;

    let actor = this.actor;
    let item = this.item;
    
    // check for a hit/critical/fumble
    theTargets = new Set();
    this.hitDisplayData = [];
  
    if (item?.data.data.target?.type === "self") {
      theTargets = new Set([canvas.tokens.get(this.token)]);
      debug("Check hits - self target")
    } else for (let targetToken of game.user.targets) {
      isHit = false;
      let targetName = useTokenNames && targetToken.name ? targetToken.name : targetToken.actor?.name;
      let targetActor = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      let targetAC = targetActor.data.data.attributes.ac.value;
      if (!this.isFumble && !this.isCritical) {
          // check to see if the roll hit the target
          // let targetAC = targetActor.data.data.attributes.ac.value;
          isHit = this.attackTotal >= targetAC;
          if (game.user.isGM) log(`${this.speaker.alias} Rolled a ${this.attackTotal} to hit ${targetName}'s AC of ${targetAC} is hit ${isHit || this.isCritical}`);
      }
      this.extraText = `${this.speaker.alias} Rolled a ${this.attackTotal} to hit ${targetName}'s AC of ${targetActor.data.data.attributes.ac.value} ${this.isCritical ? "(Critical)":""}`
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
      if (isHit || this.isCritical) theTargets.add(targetToken);
    }
    this.hitTargets = theTargets;
  }
}

export class DamageOnlyWorkflow extends Workflow {
  constructor(actor: Actor5e, token, speaker, damageTotal: number, damageType: string) {
    super(actor, null, token, speaker, event)
    this.damageTotal = damageTotal;
    this.damageDetail = [{type: damageType,  damage: damageTotal}];
    warn("dmageonlyworkflow ", this)
  }

  async _next(newState) {
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===this.currentState)[0];
    switch(newState) {
      case WORKFLOWSTATES.NONE:
        debug("DamageOnlyWorkflow.next ", state, speedItemRolls, this);
        applyTokenDamage(this.damageDetail, this.damageTotal, this.hitTargets, null, new Set())
        return super.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
      default: return super.next(newState);
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
    warn("betterRolls workflow.next ", state, speedItemRolls, this)
    switch (newState) {
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        // since this is better rolls as soon as we are ready for the attack roll we have both the attack roll and damage
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);
        }
        return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        debug(this.attackRollHTML)
        if (autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(autoCheckHit === "whisper", mergeCard);
        }
        return this.next(WORKFLOWSTATES.WAITFORDAMGEROLL);

      case WORKFLOWSTATES.WAITFORDAMGEROLL:
        // better rolls always have damage rolled
        if (!this.item.hasDamage) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        else return this.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
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

/**
 *  return a list of {damage: number, type: string} for the roll and the item
 */
export let createDamageList = (roll, item, defaultType = "radiant") => {
  if (isNewerVersion(game.data.version, "0.6.5") ) {
    let damageList = []
    let rollTerms = roll.terms;
    let partPos = 0;
    let evalString;
    let damageSpec = item ? item.data.data.damage : {parts: []};
    debug("Passed roll is ", roll)
    debug("Damage spec is ", damageSpec)
    for (let [spec, type] of damageSpec.parts) {
      debug("single Spec is ", spec, type, item)
      if (item) {
        var rollSpec = new Roll(spec, item.actor?.getRollData() || {}).roll();
      }
      debug("rollSpec is ", spec, rollSpec)
      //@ts-ignore
      let specLength = rollSpec.terms.length;
      evalString = "";

      //@ts-ignore
      debug("Spec Length ", specLength, rollSpec.terms)
      for (let i = 0; i < specLength && partPos < rollTerms.length; i++) {
        if (typeof rollTerms[partPos] !== "object") {
          evalString += rollTerms[partPos];
        } else {
          debug("roll parts ", rollTerms[partPos])
          let total = rollTerms[partPos].total;
          evalString += total;
        }
        partPos += 1;
      }
      let damage = new Roll(evalString).roll().total;
      debug("Damage is ", damage, type, evalString)
      damageList.push({ damage: damage, type: type });
      partPos += 1; // skip the plus
    }
    debug(partPos, damageList)
    evalString = "";
    while (partPos < rollTerms.length) {
      debug(rollTerms[partPos])
      if (typeof rollTerms[partPos] === "object") {
        let total = rollTerms[partPos].total;
        evalString += total;
      }
      else evalString += rollTerms[partPos];
      partPos += 1;
    }
    if (evalString.length > 0) {
      debug("Extras part is ", evalString)
        let damage = new Roll(evalString).roll().total;
        let type = damageSpec.parts[0] ? damageSpec.parts[0][1] : defaultType;
        damageList.push({ damage, type});
        debug("Extras part is ", evalString)
    }
    debug("Final damage list is ", damageList)
    return damageList;
  }
  let damageList = [];
  let rollParts = roll.parts;
  let partPos = 0;
  let evalString;
  let damageSpec = item ? item.data.data.damage : {parts: []};
  debug("Passed roll is ", roll)
  debug("Damage spec is ", damageSpec)
  for (let [spec, type] of damageSpec.parts) {
    debug("single Spec is ", spec, type, item)
    if (item) {
      var rollSpec = new Roll(spec, item.actor?.getRollData() || {}).roll();
    }
    debug("rollSpec is ", spec, rollSpec)
    let specLength = rollSpec.parts.length;
    evalString = "";

    debug(specLength, rollSpec.parts)
    for (let i = 0; i < specLength && partPos < rollParts.length; i++) {
      if (typeof rollParts[partPos] === "object") {
        debug("roll parts ", rollParts[partPos])
        let total = rollParts[partPos].total;
        evalString += total;
      }
      else evalString += rollParts[partPos];
      partPos += 1;
    }
    let damage = new Roll(evalString).roll().total;
    debug("Damage is ", damage, type, evalString)
    damageList.push({ damage: damage, type: type });
    partPos += 1; // skip the plus
  }
  debug(partPos, damageList)
  evalString = "";
  while (partPos < rollParts.length) {
    debug(rollParts[partPos])
    if (typeof rollParts[partPos] === "object") {
      let total = rollParts[partPos].total;
      evalString += total;
    }
    else evalString += rollParts[partPos];
    partPos += 1;
  }
  if (evalString.length > 0) {
    debug("Extras part is ", evalString)
      let damage = new Roll(evalString).roll().total;
      let type = damageSpec.parts[0] ? damageSpec.parts[0][1] : "radiant";
      damageList.push({ damage, type});
      debug("Extras part is ", evalString)
  }
  debug("Final damage list is ", damageList)
  return damageList;
}

function getSelfTarget(actor) {
  if (actor.isPC) return actor.getActiveTokens()[0]; // if a pc always use the represented token
  const speaker = ChatMessage.getSpeaker()
  if (speaker.token) return canvas.tokens.get(speaker.token);
  if (actor.token) return actor.token;
  return undefined;
}

function getSelfTargetSet(actor) {
  return new Set([getSelfTarget(actor)])
}

let getParams = () => {
  return ` 
    itemRollButtons: ${itemRollButtons} <br>
    speedItemRolls: ${speedItemRolls} <br>
    autoTarget: ${autoTarget} <br>
    autoCheckHit: ${autoCheckHit} <br>
    autoCheckSaves: ${autoCheckSaves} <br>
    autoApplyDamage: ${autoApplyDamage} <br>
    autoRollDamage: ${autoRollDamage} <br>
    playerRollSaves: ${playerRollSaves} <br>
    checkBetterRolls: ${checkBetterRolls} `
}
// Calculate the hp/tempHP lost for an amount of damage of type
export function calculateDamage(a, appliedDamage, t, totalDamage, dmgType) {
  debug("calculate damage ", a, appliedDamage, t, totalDamage, dmgType)
  let value = Math.floor(appliedDamage);
  if (dmgType.includes("temphp")) { // only relavent for healing of tmp HP
    var hp = a.data.data.attributes.hp;
    var tmp = parseInt(hp.temp) || 0;
    var oldHP = hp.value;
    var newTemp = Math.max(tmp - value, 0);
    var newHP: number = hp.value;
  } else {
    var hp = a.data.data.attributes.hp, tmp = parseInt(hp.temp) || 0, dt = value > 0 ? Math.min(tmp, value) : 0;
    var newTemp = tmp - dt;
    var oldHP = hp.value;
    var newHP: number = Math.clamped(hp.value - (value - dt), 0, hp.max + (parseInt(hp.tempmax)|| 0));
  }

  if (game.user.isGM)
      log(`${a.name} takes ${value} reduced from ${totalDamage} Temp HP ${newTemp} HP ${newHP}`);
  return {tokenID: t.id, actorID: a._id, tempDamage: dt, hpDamage: oldHP - newHP, oldTempHP: tmp, newTempHP: newTemp,
          oldHP: oldHP, newHP: newHP, totalDamage: totalDamage, appliedDamage: value};
}

/** 
 * Work out the appropriate multiplier for DamageTypeString on actor
 * If DamageImmunities are not being checked always return 1
 * 
 */

export let getTraitMult = (actor, dmgTypeString, item) => {
  if (dmgTypeString.includes("healing") || dmgTypeString.includes("temphp")) return -1;

  if (damageImmunities !== "none" && dmgTypeString !== "") {
    // if not checking all damage counts as magical
    const magicalDamage = (item?.type !== "weapon" || item?.data.data.attackBonus > 0 || item.data.data.properties["mgc"]);
    for (let {type, mult}  of [{type: "di", mult: 0}, {type:"dr", mult: 0.5}, {type: "dv", mult: 2}]) {
      let trait = actor.data.data.traits[type].value;
      if (!magicalDamage && trait.includes("physical")) trait = trait.concat("bludgeoning", "slashing", "piercing")
      if (trait.includes(dmgTypeString)) return mult;
    }
  }
  // Check the custom immunities
  return 1;
};

export let applyTokenDamage = (damageDetail, totalDamage, theTargets, item, saves) => {
  let damageList = [];
  let targetNames = [];
  let appliedDamage;
  let workflow = (Workflow.workflows && Workflow._workflows[item?.uuid]) || {};
  debug("Apply token damage ", damageDetail, totalDamage, theTargets, item, saves, workflow)

  if (!theTargets || theTargets.size === 0) {
    workflow.currentState = WORKFLOWSTATES.ROLLFINISHED;
    // probably called from refresh - don't do anything
    return true;
  }
  for (let t of theTargets) {
      let a = t.actor;
      if (!a) continue;
      appliedDamage = 0;
      for (let { damage, type } of damageDetail) {
        //let mult = 1;
          let mult = saves.has(t) ? getSaveMultiplierForItem(item) : 1;
          mult = mult * getTraitMult(a, type, item);
          appliedDamage += Math.floor(damage * Math.abs(mult)) * Math.sign(mult);
          var dmgType = type;
        }
      damageList.push(calculateDamage(a, appliedDamage, t, totalDamage, dmgType));
      targetNames.push(t.name)
  }
  if (theTargets.size > 0) {
    let intendedGM = game.user.isGM ? game.user : game.users.entities.find(u => u.isGM && u.active);
    if (!intendedGM) {
      ui.notifications.error(`${game.user.name} ${i18n("midi-qol.noGM")}`);
      error("No GM user connected - cannot apply damage");
      return;
    }

    broadcastData({
      action: "reverseDamageCard",
      sender: game.user.name,
      intendedFor: intendedGM.id,
      damageList: damageList,
      settings: getParams(),
      targetNames,
      extraText: workflow.extraText || "",
      chatCardId: workflow.itemCardId
    });
  }
  return appliedDamage;
};

async function processDamageRoll(workflow: Workflow, defaultDamageType: string) {
  warn("Process Damage Roll ", workflow)
  // proceed if adding chat damage buttons or applying damage for our selves
  let appliedDamage = 0;
  const actor = workflow.actor;
  let item = workflow.item;
  // const re = /.*\((.*)\)/;
  // const defaultDamageType = message.data.flavor && message.data.flavor.match(re);

  // Show damage buttons if enabled, but only for the applicable user and the GM
  
  let theTargets = workflow.hitTargets;
  if (item?.data.data.target?.type === "self") theTargets = getSelfTargetSet(actor) || theTargets;
  if (autoApplyDamage !== "none") {
    appliedDamage = applyTokenDamage(workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves);
  }
  debug("process damage roll: ", autoApplyDamage, workflow.damageDetail, workflow.damageTotal, theTargets, item, workflow.saves)
}

let getSaveMultiplierForItem = item => {
  // find a better way for this ? perhaps item property
  if (!item) return 1;
  if (noDamageSaves.includes(cleanSpellName(item.name))) return 0;
  if (item.data.data.description.value.includes(i18n("midi-qol.noDamageText"))) {
    return 0.0;
  } 
  if (!checkSaveText) return 0.5;
  if (item.data.data.description.value.includes(i18n("midi-qol.halfDamage")) || item.data.data.description.value.includes(i18n("midi-qol.halfDamageAlt"))) {
    return 0.5;
  }
  //  Think about this. if (checkSavesText true && item.hasSave) return 0; // A save is specified but the half-damage is not specified.
  return 1;
  };

function requestPCSave(ability, playerId, actorId, advantage, flavor, dc, requestId) {
  if (installedModules.get("lmrtfy") && ["letme", "letmeQuery"].includes(playerRollSaves)) {
    const socketData = {
      user: playerId,
      actors: [actorId],
      abilities: [],
      saves: [ability],
      skills: [],
      advantage: playerRollSaves === "letmeQuery"? 2 : (advantage ? 1 : 0),
      mode: "roll",
      title: "You need to save ...",
      message: `DC ${dc} save against ${flavor}`,
      formula: "",
      attach: requestId,
      deathsave: false,
      initiative: false
    }
    debug("process player save ", socketData)
    //@ts-ignore - emit not in types
    game.socket.emit('module.lmrtfy', socketData);
   //@ts-ignore - global variable
    LMRTFY.onMessage(socketData);
  } else {
    let player = game.users.get(playerId);
    let actorName = game.actors.get(actorId).name;
    ChatMessage.create({
      content: ` ${actorName} Roll DC ${dc} ${CONFIG.DND5E.abilities[ability]} saving throw${advantage ? " with advantage" : ""} against ${flavor}`,
      whisper: [player]
    });
  }
}
  
