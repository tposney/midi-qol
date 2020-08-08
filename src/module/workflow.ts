//@ts-ignore
import Actor5e from "/systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e  from "/systems/dnd5e/module/item/entity.js"
import { warn, debug, log, i18n, noDamageSaves, cleanSpellName, MESSAGETYPES, savingThrowText, savingThrowTextAlt, error } from "../midi-qol";
import { speedItemRolls, autoCheckHit, autoRollDamage, autoShiftClick, autoTarget, useTokenNames, autoApplyDamage, damageImmunities, playerRollSaves, itemRollButtons, autoCheckSaves, checkBetterRolls, playerSaveTimeout } from "./settings";
import { selectTargets } from "./itemhandling";
import { processcreateDamageRoll } from "./chatMesssageHandling";
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
  static _actions: {};
  static _workflows: {} = {};
  actor : Actor5e;
  item: Item5e;
  itemCard : ChatMessage;
  itemCardData: {};

  event: any;
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
  attackTotal: number;
  attackCardData: {};
  hitDisplayData: any[];

  damageRoll: Roll;
  damageTotal: number;
  damageDetail: any[];
  damageCardData: {};

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

  static get workflows() {return Workflow._workflows}
  static getWorkflow(id:string):Workflow {
    return Workflow._workflows[id];
  }

  static initActions(actions: {}) {
    Workflow._actions = actions;
  }
  constructor(actor: Actor5e, item: Item5e, token, speaker, event: any) {
    if (Workflow.getWorkflow(item.uuid)) {
      Workflow.removeWorkflow(item.uuid);
    }
    warn("workflow constructor ", actor, item, token)
    this.actor = actor;
    this.item = item;
    this.token = token;
    this.speaker = speaker;
    this.targets = new Set(game.user.targets);
    this.saves = new Set();
    this.hitTargets = new Set(game.user.targets);
    this.isCritical = false;
    this.isFumble = false;
    this.currentState = WORKFLOWSTATES.NONE;
    this.itemId = item.uuid;
    this.itemLevel = item.level;
    this._id = randomID();
    this.itemCardData = {};
    this.attackCardData = {};
    this.damageCardData = {};
    this.event = event;
    this.saveRequests = {};
    this.saveTimeouts = {};
    this.hideSavesHookId = null;
    this.placeTemlateHookId = null;
    this.damageDetail = [];
    this.versatile = false;
    Workflow._workflows[item.uuid] = this;
    warn("Workflow constructor event is ", event)
  }

  static removeWorkflow(id: string) {
    if (!Workflow._workflows[id]) warn ("No such workflow ", id)
    else {
      warn("removing workflow ", id)
      let workflow = Workflow._workflows[id];
      // Just in case there were some hooks left enbled by mistake.
      if (workflow.hideSavesHookId) Hooks.off("preCreateChatMessage", workflow.hideSavesHookId);
      // This can lay around if the template was never placed.
      if (workflow.placeTemlateHookId) Hooks.off("createMeasuredTemplate", workflow.placeTemlateHookId)
      delete Workflow._workflows[id];
    }
  }

  async next() {
    setTimeout(() => this._next(), 10);
  }
  async _next() {
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===this.currentState)[0];
    debug("workflow.next ", state, this._id, this)
    switch (this.currentState) {
      case WORKFLOWSTATES.NONE:
        debug(" workflow.next ", state, this.item, autoTarget, this.item.hasAreaTarget);
        if (autoTarget && this.item.hasAreaTarget) {
          this.currentState = WORKFLOWSTATES.AWAITTEMPLATE;
          return this.next();
        }
        this.currentState = WORKFLOWSTATES.PREAMBLECOMPLETE;
        return this.next();

      case WORKFLOWSTATES.AWAITTEMPLATE:
        if (this.item.hasAreaTarget && autoTarget) {
          debug("Item has template registering Hook");
          this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
          return;
        }
        this.currentState = WORKFLOWSTATES.TEMPLATEPLACED;
        return this.next();

      case WORKFLOWSTATES.TEMPLATEPLACED:
        this.currentState = WORKFLOWSTATES.VALIDATEROLL
        return this.next();

      case WORKFLOWSTATES.VALIDATEROLL:
        // do pre roll checks
        this.currentState = WORKFLOWSTATES.PREAMBLECOMPLETE;
        return this.next();

      case WORKFLOWSTATES.PREAMBLECOMPLETE:
        this.currentState = WORKFLOWSTATES.WAITFORATTACKROLL
        return this.next();
        break;

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (!this.item.hasAttack) {
          this.currentState = WORKFLOWSTATES.WAITFORDAMGEROLL;
          return this.next();
        }
        if (speedItemRolls !== "off") {
          this.event.shiftKey = this.event.shiftKey || autoShiftClick;
          debug("Rolling attack event is ", event);
          this.item.rollAttack({event: this.event});
        }
        return;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        if (autoCheckHit !== "none") {
          this.processItemRoll();
          await this.checkHits();
          await this.displayHits();
        }
        this.currentState = WORKFLOWSTATES.WAITFORDAMGEROLL;
        return this.next();

      case WORKFLOWSTATES.WAITFORDAMGEROLL:
        if (this.isFumble) {
          this.currentState = WORKFLOWSTATES.DAMAGEROLLCOMPLETE;
          return this.next()
        }
        if (!this.item.hasDamage) {
          this.currentState = WORKFLOWSTATES.DAMAGEROLLCOMPLETE;
          return this.next();
        }

        if (autoRollDamage === "always" || (autoRollDamage === "onHit" && this.hitTargets.size > 0)) {
            this.event.shiftKey = this.event.shiftKey || autoShiftClick; // use hit results for this.
            this.event.altKey = this.isCritical;
            this.event.crtlKey = this.isFumble;
            debug("Rolling damage ", event, this.itemLevel, this.versatile);
            this.item.rollDamage({event: this.event, spellLevel: this.itemLevel, versatile: this.versatile})
            return;
        }
        return;

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) {
          this.currentState = WORKFLOWSTATES.APPLYDYNAMICEFFECTS;
          return this.next();
        }
        let defaultDamageType = this.item.data.data.damage?.parts[0][1] || "bludgeoning";
        this.damageDetail = createDamageList(this.damageRoll, this.item, defaultDamageType);
        this.currentState = WORKFLOWSTATES.WAITFORSAVES;
        return this.next();

      case WORKFLOWSTATES.WAITFORSAVES:
        if (!this.item.hasSave) {
          this.currentState = WORKFLOWSTATES.SAVESCOMPLETE;
          this.saves = new Set(); // not auto checking assume no saves
          return this.next();
        }
        if (autoCheckSaves !== "none") {
          //@ts-ignore ._hooks not defined
          debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
          try {
            await this.checkSaves(true);
          } finally {
            //@ts-ignore - does not support ids
            Hooks.off("renderChatMessage", hookId);
          }
          //@ts-ignore ._hooks not defined
          debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          this.displaySaves(false);
        }
        this.currentState = WORKFLOWSTATES.SAVESCOMPLETE;
        return this.next();

      case WORKFLOWSTATES.SAVESCOMPLETE:
        this.currentState = WORKFLOWSTATES.ALLROLLSCOMPLETE;
        return this.next();
  

      case WORKFLOWSTATES.ALLROLLSCOMPLETE:
        processDamageRoll(this, this.damageDetail[0].type)
        this.currentState = WORKFLOWSTATES.APPLYDYNAMICEFFECTS;
        return this.next();

      case WORKFLOWSTATES.APPLYDYNAMICEFFECTS:
        this.currentState = WORKFLOWSTATES.ROLLFINISHED;
        return this.next();

      case WORKFLOWSTATES.ROLLFINISHED:
        //@ts-ignore
        if (this.hideSavesHookId) Hooks.off("preCreateChatMessage", this.hideSavesHookId)
        delete Workflow._workflows[this.itemId];
        Hooks.callAll("minor-qol.RollComplete"); // just for the macro writers.
        Hooks.callAll("midi-qol.RollComplete");
        return;
    }
  }

  hideSaveRolls = (data, options) => {
    let flavor = data.flavor || "";
    if (flavor.includes(savingThrowText) || (savingThrowTextAlt?.length > 0 && flavor.includes(savingThrowTextAlt))) {
      if (data.user !== game.user.id) return true;
      options.displaySheet = false;
      this.saveCount -= 1;
      if (this.saveCount <= 0) {
        //@ts-ignore
        Hooks.off("preCreateChatMessage", this.hideSavesHookId);
        this.hideSavesHookId = null;
      }
      return false;
    }
    return true;
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
        debug("Check Saves: renderChat message hooks length ", Hooks._hooks["preCreateCatMessage"]?.length)
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
          // find the controlling player
          var player = game.users.players.find(p=> p.character?._id === target.actor._id);
          if (!player?.active) { // no controller - find the first owner who is active
            //@ts-ignore permissions not define
            player = game.users.players.find(p=>p.active && target.actor.data.permission[p._id] === CONST.ENTITY_PERMISSIONS.OWNER)
          }
        }
        if (playerRollSaves !== "none" && player?.active) {
          this.saveCount = Math.max(this.saveCount - 1, 0)
          debug(`Player ${player.name} controls actor ${target.actor.name} - requesting ${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} save`);
          promises.push(new Promise((resolve, reject) => {
            let eventToUse = duplicate(event);
            let advantageToUse = advantage;
            let requestId = target.actor.id;
            if (["letem", "letmeQuery"].includes(playerRollSaves) && installedModules.get("lmrtfy")) requestId = randomID();
            this.saveRequests[requestId] = resolve;
            requestPCSave(this.item.data.data.save.ability, player.id, target.actor.id, advantage, this.item.name, rollDC, requestId)

            // set a timeout for taking over the roll
            this.saveTimeouts[requestId] = setTimeout(async () => {
              warn(`Timeout waiting for ${player.name} to roll ${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} save - rolling for them`)
              if (this.saveRequests[requestId]) {
                  delete this.saveRequests[requestId];
                  delete this.saveTimeouts[requestId];
                  //@ts-ignore actor.rollAbilitySave
                  let result = await target.actor.rollAbilitySave(this.item.data.data.save.ability, {event: eventToUse, advantage: advantageToUse});
                  resolve(result);
              }
            }, playerSaveTimeout * 1000);
          }))
        } else {
          //@ts-ignore actor.rollAbilitySave
          promises.push(target.actor.rollAbilitySave(this.item.data.data.save.ability, {event, advantage}));
        }
      }
    } catch (err) {
        warn(err)
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
      let noDamage = saved && getSaveMultiplierForItem(this.item) === 0 ? i18n("midi-qol.noDamage") : "";
      let adv = this.advantageSaves.has(target) ? `(${i18n("midi-qol.advantage")})` : "";
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
        noDamage, 
        id: target.id, 
        adv
      });
    }
    i++;
    this.saveDisplayFlavor = `<h4"> ${this.item.name} DC ${rollDC} ${CONFIG.DND5E.abilities[rollAbility]} ${i18n(theTargets.size > 1 ? "minor-qol.saving-throws" : "minor-qol.saving-throw")}:</h4>`;
  }

  processSaveRoll = (message, html, data) => {
    const isLMRTFY = (installedModules.get("lmrtfy") && message.data.flags?.lmrtfy?.data);
    const requestId =  isLMRTFY ? message.data.flags.lmrtfy.data : message.data?.speaker?.actor;
    debug("processSaveToll", isLMRTFY, requestId, this.saveRequests )

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


  async displaySaves(whisper) {
    for (let target of this.hitTargets) {

      let templateData = {
        saves: this.saveDisplayData, 
        // TODO force roll damage
        damageAppliedString: (/*MinorQOL.forceRollDamage || */autoRollDamage !== "none") && autoApplyDamage !== "none" && this.item.hasDamage ? i18n("minor-qol.damage-applied") : ""
      }
      let content = await renderTemplate("modules/midi-qol/templates/saves.html", templateData);
      let speaker = ChatMessage.getSpeaker();
      speaker.alias = (useTokenNames && speaker.token) ? canvas.tokens.get(speaker.token).name : speaker.alias;

      let chatData: any = {
        user: game.user._id,
        speaker,
        content: `<div data-item-id="${this.item._id}"></div> ${content}`,
        flavor: this.saveDisplayFlavor, 
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

  processItemRoll() {
    //@ts-ignore
    this.attackTotal = this.attackRoll.results[0];
    //@ts-ignore
    this.isCritical = this.attackTotal  >= this.attackRoll.terms[0].options.critical;
    //@ts-ignore
    this.isFumble = this.attackTotal <= this.attackRoll.terms[0].options.fumble;
    debug("processItemRoll: ", this.attackTotal, this.isCritical, this.isFumble)
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
      let attackType = item?.name ? i18n(item.name) : "Attack";
      let hitString = this.isCritical ? i18n("midi-qol.criticals") : this.isFumble? i18n("midi-qol.fumbles") : isHit ? i18n("midi-qol.hits") : i18n("midi-qol.misses");
      let img = targetToken.data?.img || targetToken.actor.img;
      if ( VideoHelper.hasVideoExtension(img) ) {
        //@ts-ignore
        hitDetail.img = await game.video.createThumbnail(img, {width: 100, height: 100});
      }
      this.hitDisplayData.push({isPC: targetToken.actor.isPC, target: targetToken, hitString, attackType, img});
  
      // If we hit and we have targets and we are applying damage say so.
      if (isHit || this.isCritical) theTargets.add(targetToken);
    }
    this.hitTargets = theTargets;
  }

  async displayHits() {
    const templateData = {
      hits: this.hitDisplayData, 
      isGM: game.user.isGM,
    }
    const content = await renderTemplate("modules/midi-qol/templates/hits.html", templateData);
    let speaker = ChatMessage.getSpeaker();
    speaker.alias = (useTokenNames && speaker.token) ? canvas.tokens.get(speaker.token).name : speaker.alias;

    if (game.user.targets.size > 0) {
      let chatData: any = {
        user: game.user._id,
        speaker,
        content: content,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
      }
      if (autoCheckHit === "whisper") 
      {
        //@ts-ignore
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
        //@ts-ignore
        chatData.user = ChatMessage.getWhisperRecipients("GM").find(u=>u.active);
      }
      
      setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", !!!game.dice3d?.messageHookDisabled);
      ChatMessage.create(chatData);
    }
  }
}

export class BetterRollsWorkflow extends Workflow {
  betterRollsHookId: number;
  static get(id:string):BetterRollsWorkflow {
    return Workflow._workflows[id];
  }
  async next() {
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===this.currentState)[0];
    switch (this.currentState) {

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        debug("betterRolls workflow.next ", state, speedItemRolls, this)
        // since this is better rolls as soon as we are ready for the attack roll we have both the attack roll and damage
        if (!this.item.hasAttack) this.currentState = WORKFLOWSTATES.WAITFORSAVES;
        else this.currentState = WORKFLOWSTATES.ATTACKROLLCOMPLETE;
        return this.next();

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        debug("betterRolls workflow.next ", state, speedItemRolls, this)
        if (autoCheckHit !== "none") {
          await this.checkHits();
        }
        this.currentState = WORKFLOWSTATES.WAITFORDAMGEROLL;
        return this.next();

      case WORKFLOWSTATES.WAITFORDAMGEROLL:
        debug("betterRolls workflow.next ", state, speedItemRolls, this)
        // better rolls always have damage rolled
        if (!this.item.hasDamage) this.currentState = WORKFLOWSTATES.WAITFORSAVES;
        else this.currentState = WORKFLOWSTATES.DAMAGEROLLCOMPLETE;
        return this.next();

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        debug("betterRolls workflow.next ", state, speedItemRolls, this)
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) {
          this.currentState = WORKFLOWSTATES.WAITFORSAVES;
          return this.next();
        }
        processDamageRoll(this, "radiant");
        this.currentState = WORKFLOWSTATES.APPLYDYNAMICEFFECTS;
        return this.next();

      default: return super.next();
    }
  }
}

/**
 *  return a list of {damage: number, type: string} for the roll and the item
 */
let createDamageList = (roll, item, defaultType = "radiant") => {
  let damageList = [];
  let rollTerms = roll.terms;
  let partPos = 0;
  let evalString;
  let damageSpec = item ? item.data.data.damage : {parts: []};
  if (debug) log("Passed roll is ", roll)
  if (debug) log("Damage spec is ", damageSpec)
  for (let [spec, type] of damageSpec.parts) {
    if (debug) log("single Spec is ", spec, type, item)
    if (item) {
      var rollSpec = new Roll(spec, item.actor?.getRollData() || {}).roll();
    }
    if (debug) log("rollSpec is ", spec, rollSpec)
    //@ts-ignore
    let specLength = rollSpec.terms.length;
    evalString = "";

    //@ts-ignore
    if (debug) log("Spec Length ", specLength, rollSpec.terms)
    for (let i = 0; i < specLength && partPos < rollTerms.length; i++) {
      if (typeof rollTerms[partPos] !== "object") {
        evalString += rollTerms[partPos];
      } else {
        if (debug) log("roll parts ", rollTerms[partPos])
        let total = rollTerms[partPos].total;
        evalString += total;
      }
      partPos += 1;
    }
    let damage = new Roll(evalString).roll().total;
    if (debug) log("Damage is ", damage, type, evalString)
    damageList.push({ damage: damage, type: type });
    partPos += 1; // skip the plus
  }
  if (debug) log(partPos, damageList)
  evalString = "";
  while (partPos < rollTerms.length) {
    if (debug) log(rollTerms[partPos])
    if (typeof rollTerms[partPos] === "object") {
      let total = rollTerms[partPos].total;
      evalString += total;
    }
    else evalString += rollTerms[partPos];
    partPos += 1;
  }
  if (evalString.length > 0) {
    if (debug) log("Extras part is ", evalString)
      let damage = new Roll(evalString).roll().total;
      let type = damageSpec.parts[0] ? damageSpec.parts[0][1] : defaultType;
      damageList.push({ damage, type});
      if (debug) log("Extras part is ", evalString)
  }
  if (debug) log("Final damage list is ", damageList)
  return damageList;
};

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
function calculateDamage(a, appliedDamage, t, totalDamage, dmgType) {
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

let getTraitMult = (actor, dmgTypeString) => {
  if (dmgTypeString.includes("healing") || dmgTypeString.includes("temphp")) return -1;
  if (damageImmunities !== "none") {
    if (dmgTypeString !== "") {
      if (actor.data.data.traits.di.value.some(t => dmgTypeString.includes(t))) return 0;
      if (actor.data.data.traits.dr.value.some(t => dmgTypeString.includes(t))) return 0.5;
      if (actor.data.data.traits.dv.value.some(t => dmgTypeString.includes(t))) return 2;
    }
  }
  // Check the custom immunities
  return 1;
};

let applyTokenDamage = (damageDetail, totalDamage, theTargets, item, saves) => {
  let damageList = [];
  let targetNames = [];
  let appliedDamage;
  let workflow = (Workflow.workflows && Workflow.workflows[item.uuid]) || {};

  if (!theTargets || theTargets.size === 0) {
    debug("applyTokenDamage - targets", theTargets);
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
          mult = mult * getTraitMult(a, type);
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

    debug("broadcast data ", damageList)
    broadcastData({
      action: "reverseDamageCard",
      sender: game.user.name,
      intendedFor: intendedGM.id,
      damageList: damageList,
      settings: getParams(),
      targetNames,
      extraText: workflow.extraText || "",
      chatCardId: workflow.itemCard?.id
    });
  }
  return appliedDamage;
};

async function processDamageRoll(workflow: Workflow, defaultDamageType: string) {
  // proceed if adding chat damage buttons or applying damage for our selves
  let appliedDamage = 0;
  const actor = workflow.actor;
  let item = workflow.item;
  // const re = /.*\((.*)\)/;
  // const defaultDamageType = message.data.flavor && message.data.flavor.match(re);

  // Show damage buttons if enabled, but only for the applicable user and the GM
  /*
  if ((message.user.id === game.user.id || game.user.isGM)) {
    addDamageButtons(damageDetail, totalDamage, html);
  }
  */
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
  if (damageImmunities === "savesDefault") return 0.5;
  if (item.data.data.description.value.includes(i18n("midi-qol.halfDamage")) || item.data.data.description.value.includes(i18n("midi-qol.halfDamageAlt"))) {
    return 0.5;
  }
  //  Think about this. if (damageImmunities !== "savesDefault" && item.hasSave) return 0; // A save is specified but the half-damage is not specified.
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
  