//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e  from "../../../systems/dnd5e/module/item/entity.js"
//@ts-ignore
import { warn, debug, log, i18n, MESSAGETYPES, error, MQdefaultDamageType, debugEnabled, timelog } from "../midi-qol";
import { selectTargets, showItemCard } from "./itemhandling";
// import { broadcastData } from "./GMAction";
import { socketlibSocket } from "./GMAction";
import { installedModules } from "./setupModules";
import { configSettings, autoRemoveTargets, checkRule, autoFastForwardAbilityRolls } from "./settings.js";
import { createDamageList, processDamageRoll, untargetDeadTokens, getSaveMultiplierForItem, requestPCSave, applyTokenDamage, checkRange, checkIncapcitated, testKey, getAutoRollDamage, isAutoFastAttack, isAutoFastDamage, getAutoRollAttack, itemHasDamage, getRemoveDamageButtons, getRemoveAttackButtons, getTokenPlayerName, checkNearby, removeCondition, hasCondition, getDistance, removeHiddenInvis, expireMyEffects, validTargetTokens } from "./utils"

export const shiftOnlyEvent = {shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, type: ""};
export function noKeySet(event) { return !(event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey)}
export let allDamageTypes;

export const WORKFLOWSTATES = {
  NONE : 0,
  ROLLSTARTED : 1,
  AWAITTEMPLATE: 2,
  TEMPLATEPLACED: 3,
  VALIDATEROLL: 4,
  PREAMBLECOMPLETE : 5,
  WAITFORATTACKROLL : 6,
  ATTACKROLLCOMPLETE: 7,
  WAITFORDAMAGEROLL: 8,
  DAMAGEROLLCOMPLETE: 9,
  WAITFORSAVES: 10,
  SAVESCOMPLETE: 11,
  ALLROLLSCOMPLETE: 12,
  APPLYDYNAMICEFFECTS: 13,
  ROLLFINISHED: 14
};

export const defaultRollOptions = {
  advantage: false,
  disadvantage: false,
  versatile: false,
  fastForward: false
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
  capsLock: boolean;
  speaker: any;
  tokenId: string;  // TODO change tokenId to tokenUuid
  targets: Set<Token>;
  placeTemlateHookId: number;

  _id: string;
  saveDisplayFlavor: string;
  showCard: boolean;
  get id() { return this._id}
  itemId: string;
  uuid: string;
  itemLevel: number;
  currentState: number;

  isCritical: boolean;
  isFumble: boolean;
  hitTargets: Set<Token>;
  attackRoll: Roll;
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
  superSaveers: Set<Token>;
  failedSaves: Set<Token>
  advantageSaves : Set<Token>;
  saveRequests: any;
  saveTimeouts: any;

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

  get workflowType() {return this.__proto__.constructor.name};

  get hasDAE() {
    if (this._hasDAE === undefined) {
      this._hasDAE = installedModules.get("dae") && (this.item?.effects?.entries.some(ef => ef.data.transfer === false));
      //@ts-ignore
      if (this._hasDAE) this.dae = window.DAE;
    }
    return this._hasDAE
  }

  static initActions(actions: {}) {
    Workflow._actions = actions;
  }

  public processAttackEventOptions(event) {
    //TODO see if this can be simplified. Problem is we don't know when the event is injected
    let advKey = this.rollOptions.advKey || event?.altKey;
    let disKey = this.rollOptions.disKey || event?.ctrlKey || event?.metaKey;

    if (configSettings.speedItemRolls && this.workflowType !== "BetterRollsWorkflow") {
      advKey = testKey(configSettings.keyMapping["DND5E.Advantage"], event);
      disKey = testKey(configSettings.keyMapping["DND5E.Disadvantage"], event);
      this.rollOptions.versaKey = this.rollOptions.versaKey || testKey(configSettings.keyMapping["DND5E.Versatile"], event);
      this.rollOptions.versatile = this.rollOptions.versatile || this.rollOptions.versaKey;
    } else {
      advKey = this.rollOptions.advKey || event?.altKey;
      disKey = this.rollOptions.disKey || event?.ctrlKey || event?.metaKey;
    }
    this.rollOptions.fastForwardKey = this.rollOptions.fastForwardKey || (advKey && disKey);
    if (this.capsLock) this.rollOptions.fastForwardKey = true;
    this.rollOptions.advKey = this.rollOptions.advKey || (advKey && !disKey)
    this.rollOptions.disKey = this.rollOptions.disKey || (!advKey && disKey)

    this.advantage = this.advantage || this.rollOptions.advKey;
    this.disadvantage = this.disadvantage || this.rollOptions.disKey;
  }

  public checkAttackAdvantage() {
    const midiFlags = this.actor?.data.flags["midi-qol"];
    const advantage = midiFlags?.advantage;
    const disadvantage = midiFlags?.disadvantage;
    const actType = this.item?.data.data?.actionType || "none"

    if (advantage) {
      const withAdvantage = advantage.all || advantage.attack?.all || (advantage.attack && advantage.attack[actType]);
      this.advantage = this.advantage || withAdvantage;
    }
    if (disadvantage) {
      const withDisadvantage = disadvantage.all || disadvantage.attack?.all || (disadvantage.attack && disadvantage.attack[actType]);
      this.disadvantage = this.disadvantage || withDisadvantage;
    }
    // TODO Hidden should check the target to see if they notice them?
    if (checkRule("invisAdvantage")) {
      const token = canvas.tokens.get(this.tokenId);
      if (token) {
        const hidden = hasCondition(token, "hidden");
        const invisible = hasCondition(token, "invisible");
        this.advantage = this.advantage || hidden || invisible;
        if (hidden || invisible) log(`Advantage given to ${this.actor.name} due to hidden/invisible`)
      }
    }
    // Neaarby foe gives disadvantage on ranged attacks
    if (checkRule("nearbyFoe") && (["rwak", "rsak", "rpak"].includes(actType) || this.item.data.data.properties?.thr)) { // Check if there is a foe near me when doing ranged attack
      let nearbyFoe = checkNearby(-1, canvas.tokens.get(this.tokenId), configSettings.optionalRules.nearbyFoe);
      // special case check for thrown weapons within 5 feet (players will forget to set the property)
      if (this.item.data.data.properties?.thr) {
        const firstTarget = this.targets.values().next().value;
        const me = canvas.tokens.get(this.tokenId);
        if (firstTarget && me && getDistance(me, firstTarget, false) <= configSettings.optionalRules.nearbyFoe) nearbyFoe = false;
      }
      if (nearbyFoe) {
        log(`Ranged attack by ${this.actor.name} at disadvantage due to neabye foe`);
        warn("Ranged attack at disadvantage due to nearvy foe");
      }
      this.disadvantage = this.disadvantage || nearbyFoe;
    }
    this.checkAbilityAdvantage();
    this.checkTargetAdvantage();
  }

  public processDamageEventOptions(event) { 
    this.rollOptions.fastForward = this.workflowType === "TrapWorkflow" ? true : isAutoFastDamage();
    // if (!game.user.isGM && ["all", "damage"].includes(configSettings.autoFastForward)) this.rollOptions.fastForward = true;
    // if (game.user.isGM && configSettings.gmAutoFastForwardDamage) this.rollOptions.fastForward = true;
    // if we have an event here it means they clicked on the damage button?
    var critKey;
    var disKey;
    var advKey;
    var fastForwardKey;
    var noCritKey;
    if (configSettings.speedItemRolls && this.workflowType !== "BetterRollsWorkflow") {
      disKey = testKey(configSettings.keyMapping["DND5E.Disadvantage"], event);
      critKey = testKey(configSettings.keyMapping["DND5E.Critical"], event);
      advKey = testKey(configSettings.keyMapping["DND5E.Advantage"], event);
      this.rollOptions.versaKey = testKey(configSettings.keyMapping["DND5E.Versatile"], event);
      noCritKey = disKey;
      fastForwardKey = (advKey && disKey) || this.capsLock;
    } else { // use default behaviour
      critKey = event?.altKey || event?.metaKey;
      noCritKey = event?.ctrlKey;
      fastForwardKey = (critKey && noCritKey);
      this.rollOptions.versaKey = false;
    }
    this.rollOptions.critical = undefined;
    this.processCriticalFlags();
    if (fastForwardKey) {
      critKey = false;
      noCritKey = false;
    }
    if (this.noCritFlagSet || noCritKey) this.rollOptions.critical = false;
    else if (this.isCritical || critKey || this.critFlagSet) {
      this.rollOptions.critical = true;
      this.isCritical = this.rollOptions.critical;
    }
    this.rollOptions.fastForward = fastForwardKey ? !isAutoFastDamage() : isAutoFastDamage();
    this.rollOptions.fastForward = this.rollOptions.fastForward || critKey || noCritKey;
    // trap workflows are fastforward by default.
    if (this.workflowType === "TrapWorkflow")
      this.rollOptions.fastForward =  true;
  }

  processCriticalFlags() {
    if (!this.actor) return; // in case a damage only workflow caused this.
/*
* flags.midi-qol.critical.all
* flags.midi-qol.critical.mwak/rwak/msak/rsak/other
* flags.midi-qol.noCritical.all
* flags.midi-qol.noCritical.mwak/rwak/msak/rsak/other
*/
    // check actor force critical/noCritical
    const criticalFlags = getProperty(this.actor.data, `flags.midi-qol.critical`) ?? {};
    const noCriticalFlags = getProperty(this.actor.data, `flags.midi-qol.noCritical`) ?? {};
    const attackType = this.item?.data.data.actionType;
    this.critFlagSet = false;
    this.noCritFlagSet = false;
    this.critFlagSet = criticalFlags.all || criticalFlags[attackType];
    this.noCritFlagSet = noCriticalFlags.all || noCriticalFlags[attackType];

    // check max roll
    const maxFlags = getProperty(this.actor.data, `flags.midi-qol.maxDamage`) ?? {};
    this.rollOptions.maxDamage = (maxFlags.all || maxFlags[attackType]) ?? false;

    // check target critical/nocritical
    if (this.targets.size !== 1) return;
    const firstTarget = this.targets.values().next().value;
    const grants = firstTarget.actor?.data.flags["midi-qol"]?.grants?.critical ?? {};
    const fails = firstTarget.actor?.data.flags["midi-qol"]?.fail?.critical ?? {};
    if (grants?.all || grants[attackType]) this.critFlagSet = true;
    if (fails?.all || fails[attackType]) this.noCritFlagSet = true;
  }

  checkAbilityAdvantage() {
    if (!["mwak", "rwak"].includes(this.item?.data.data.actionType)) return;
    let ability = this.item?.data.data.ability;
    if (ability === "") ability = this.item?.data.data.properties?.fin ? "dex" : "str";
    this.advantage = this.advantage || getProperty(this.actor.data, `flags.midi-qol.advantage.attack.${ability}`);
    this.disadvantage = this.disadvantage || getProperty(this.actor.data, `flags.midi-qol.disadvantage.attack.${ability}`);
  }

  checkTargetAdvantage() {
    if (!this.item) return;
    if (!this.targets?.size) return;
    const actionType = this.item.data.data.actionType;
    const firstTarget = this.targets.values().next().value;
    if (checkRule("nearbyAllyRanged") && ["rwak", "rsak", "rpak"].includes(actionType)) {
      if (firstTarget.data.width * firstTarget.data.height < checkRule("nearbyAllyRanged")) {
        const nearbyAlly = checkNearby(-1, firstTarget, configSettings.optionalRules.nearbyFoe); // targets near a friend that is not too big
        // TODO include thrown weapons in check
        if (nearbyAlly) {
          warn("ranged attack with disadvantage because target is near a friend");
          log(`Ranged attack by ${this.actor.name} at disadvantage due to nearvy ally`)
        }
        this.disadvantage = this.disadvantage || nearbyAlly
      }
    }
    const grants = firstTarget.actor?.data.flags["midi-qol"]?.grants;
    if (!grants) return;
    if (!["rwak", "mwak", "rsak", "msak", "rpak", "mpak"].includes(actionType)) return;

    const attackAdvantage = grants.advantage?.attack || {};
    const grantsAdvantage = grants.all || attackAdvantage.all || attackAdvantage[actionType]
    const attackDisadvantage = grants.disadvantage?.attack || {};
    const grantsDisadvantage = grants.all || attackDisadvantage.all || attackDisadvantage[actionType]
    this.advantage = this.advantage || grantsAdvantage;
    this.disadvantage = this.disadvantage || grantsDisadvantage;
  }

  constructor(actor: Actor5e, item: Item5e, speaker, targets, options: any) {
    this.rollOptions = duplicate(defaultRollOptions);
    this.actor = actor;
    this.item = item;
    if (!this.item) {
      this.itemId = randomID();
      this.uuid = this.itemId
    } else {
      this.itemId = item.id;
      this.uuid = item.uuid;
    }
    if (Workflow.getWorkflow(this.itemId)) {
      Workflow.removeWorkflow(this.itemId);
    }
    
    this.tokenId = speaker.token;
    this.speaker = speaker;
    if (this.speaker.scene) this.speaker.scene = canvas?.scene?.id;
    this.targets = targets; 
    this.saves = new Set();
    this.superSavers = new Set();
    this.failedSaves = new Set(this.targets)
    this.hitTargets = new Set(this.targets);
    this.isCritical = false;
    this.isFumble = false;
    this.currentState = WORKFLOWSTATES.NONE;
    this.itemLevel = item?.level || 0;
    this._id = randomID();
    this.displayId = this.id;
    this.itemCardData = {};
    this.attackCardData = undefined;
    this.damageCardData = undefined;
    this.event = options?.event;
    this.capsLock = options?.event?.getModifierState && options?.event.getModifierState("CapsLock");
    this.rollOptions = {disKey: false, advKey: false, versaKey: false, critKey: false, fastForward: false, fasForwardKey: false};
    if (this.item && !this.item.hasAttack) this.processDamageEventOptions(options?.event);
    else this.processAttackEventOptions(options?.event);
    this.templateId = null;

    this.saveRequests = {};
    this.saveTimeouts = {};

    this.placeTemlateHookId = null;
    this.damageDetail = [];
    this.otherDamageDetail = [];
    this.hideTags = new Array();
    this.displayHookId = null;
    this.onUseCalled = false;
    Workflow._workflows[this.itemId] = this;
  }

  public someEventKeySet() {
    return this.event?.shiftKey || this.event?.altKey || this.event?.ctrlKey || this.event?.metaKey;
  }

  static async removeAttackDamageButtons(id) {
    let workflow = Workflow.getWorkflow(id)
    if (!workflow) return;
    let chatMessage: ChatMessage = game.messages.get(workflow.itemCardId);
    if (!chatMessage) return;
    //@ts-ignore content not definted 
    let content = chatMessage && duplicate(chatMessage.data.content);
    // TODO work out what to do if we are a damage only workflow and betters rolls is active - display update wont work.
    const versatileRe = /<button data-action="versatile">[^<]*<\/button>/
    const damageRe = /<button data-action="damage">[^<]*<\/button>/
    const formulaRe = /<button data-action="formula">[^<]*<\/button>/
    content = content?.replace(damageRe, "")
    content = content?.replace(formulaRe, "")
    content = content?.replace(versatileRe, "<div></div>")
    const searchRe = /<button data-action="attack">[^<]*<\/button>/;
    content = content.replace(searchRe, "");
    chatMessage.update({content});
  }

  static removeWorkflow(id: string) {
    if (!Workflow._workflows[id]) warn ("removeWorkflow: No such workflow ", id)
    else {
      let workflow = Workflow._workflows[id];
      // If the attack roll broke and we did we roll again will have an extra hook laying around.
      if (workflow.displayHookId) Hooks.off("preCreateChatMessage", workflow.displayHookId);
      // This can lay around if the template was never placed.
      if (workflow.placeTemlateHookId) Hooks.off("createMeasuredTemplate", workflow.placeTemlateHookId)
      // Remove buttons
      this.removeAttackDamageButtons(id);
      delete Workflow._workflows[id];
    }
  }

  async next(nextState: number) {
    setTimeout(() => this._next(nextState), 0); // give the rest of queued things a chance to happen
    // return this._next(nextState);
  }

  async _next(newState: number) {
    timelog("next state ", newState, Date.now())
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===newState)[0];
    warn("workflow.next ", state, this._id, this)
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        debug(" workflow.next ", state, configSettings.autoTarget, this.item.hasAreaTarget);
        if (configSettings.autoTarget !== "none" && this.item.hasAreaTarget) {
          return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
        }
        const targetDetails = this.item.data.data.target;
        if (configSettings.rangeTarget && targetDetails?.units === "ft" && ["creature", "ally", "enemy"].includes(targetDetails?.type)) {
          this.setRangedTargets(targetDetails);
          this.failedSaves = new Set(this.targets)
          this.hitTargets = new Set(this.targets);
          this.targets = await validTargetTokens(this.targets);
          return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
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
        // Some modules stop being able to get the item card id.
        if (!this.itemCardId) return this.next(WORKFLOWSTATES.VALIDATEROLL);
        const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
        // remove the place template button from the chat card.
        this.targets = await validTargetTokens(this.targets);
        this.hitTargets = new Set(this.targets)
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
        if (checkRule("checkRange")) {
          switch ( checkRange(this.actor, this.item, this.tokenId, this.targets)) {
            case "fail": return this.next(WORKFLOWSTATES.ROLLFINISHED);
            case "dis": this.disadvantage = true;
          }
        }
        if (checkRule("incapacitated") && checkIncapcitated(this.actor, this.item, null)) return this.next(WORKFLOWSTATES.ROLLFINISHED);

        return this.next(WORKFLOWSTATES.PREAMBLECOMPLETE);

      case WORKFLOWSTATES.PREAMBLECOMPLETE:
        this.effectsAlreadyExpired = [];
        return this.next(WORKFLOWSTATES.WAITFORATTACKROLL);
        break;

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (this.item.data.type === "tool" && autoFastForwardAbilityRolls) {
          this.item.rollToolCheck({fastForward: this.rollOptions.fastForward, advantage: this.rollOptions.advantage, disadvantage: this.rollOptions.disadvantage})  
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (this.noAutoAttack) return;
        let shouldRoll = this.someEventKeySet() || getAutoRollAttack();
        // this.processAttackEventOptions(event);
        if (getAutoRollAttack() && isAutoFastAttack() &&  this.rollOptions.fastForwardKey) shouldRoll = false;

  //      if (configSettings.mergeCard) {
        {
          const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
          const isFastRoll = isAutoFastAttack() || (!isAutoFastAttack() && this.rollOptions.fastForwardKey);
          if (chatMessage && (!shouldRoll || !isFastRoll)) {
            // provide a hint as to the type of roll expected.
            //@ts-ignore
            let content = chatMessage && duplicate(chatMessage.data.content)
            let searchRe = /<button data-action="attack">[^<]+<\/button>/;
            const hasAdvantage = this.advantage && !this.disadvantage;
            const hasDisadvantage = this.disadvantage && !this.advantage;
            let attackString = hasAdvantage ? i18n("DND5E.Advantage") : hasDisadvantage ? i18n("DND5E.Disadvantage") : i18n("DND5E.Attack")
            if (isFastRoll) attackString += ` ${i18n("midi-qol.fastForward")}`;
            let replaceString = `<button data-action="attack">${attackString}</button>`
            content = content.replace(searchRe, replaceString);
            await chatMessage?.update({"content": content});
          } else if (!chatMessage) error("no chat message")
        }
        if (shouldRoll) {
          this.item.rollAttack({event: {}});
        } else if (isAutoFastAttack() && this.rollOptions.fastForwardKey) {
            this.rollOptions.fastForwardKey = false;
            this.rollOptions.fastForward = false;
        }
        return;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.processAttackRoll();
        const attackBonusMacro = getProperty(this.actor.data.flags, `${game.system.id}.AttackBonusMacro`);
        if (configSettings.allowUseMacro && attackBonusMacro) {
          await this.rollAttackBonus(attackBonusMacro);

        }
        await this.displayAttackRoll(configSettings.mergeCard);
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          const rollMode = game.settings.get("core", "rollMode");
          this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blindroll" || rollMode === "gmroll";
          await this.displayHits(this.whisperAttackCard, configSettings.mergeCard);
        }
        if (checkRule("removeHiddenInvis")) removeHiddenInvis.bind(this)();

        // We only roll damage on a hit. but we missed everyone so all over, unless we had no one targetted
        Hooks.callAll("midi-qol.AttackRollComplete", this);
        if ((getAutoRollDamage() === "onHit" && this.hitTargets.size === 0 && this.targets.size !== 0) ||
             getAutoRollDamage() === "none" && (this.hitTargets.size === 0 ||this.targets.size === 0)) {
          expireMyEffects.bind(this)(["1Attack", "1Action"])
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        debug(`wait for damage roll has damage ${itemHasDamage(this.item)} isfumble ${this.isFumble} no auto damage ${this.noAutoDamage}`);
        if (!itemHasDamage(this.item)) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        if (this.isFumble && configSettings.autoRollDamage !== "none") {
          // Auto rolling damage but we fumbled - we failed - skip everything.
          expireMyEffects.bind(this)(["1Attack", "1Action"])
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        } 
        if (this.noAutoDamage) return; // we are emulating the standard card specially.
        let shouldRollDamage = getAutoRollDamage() === "always" 
                                || (getAutoRollDamage() !== "none" && !this.item.hasAttack)
                                || (getAutoRollDamage() === "onHit" && (this.hitTargets.size > 0 || this.targets.size === 0));
          // We have used up the fastforward key for this roll
        if (isAutoFastAttack()) {
          this.rollOptions.fastForwardKey = false;
        }
        if (shouldRollDamage) {
          warn(" about to roll damage ", this.event, configSettings.autoRollAttack, configSettings.autoFastForward)
          this.rollOptions.spellLevel = this.itemLevel;
          this.item.rollDamage(this.rollOptions);
          return;
        }
        this.processDamageEventOptions(event);

//        if (configSettings.mergeCard && !shouldRollDamage) {
        //if (!shouldRollDamage) {
        {
          const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
          if (chatMessage) {
            // provide a hint as to the type of roll expected.
            //@ts-ignore
            let content = chatMessage && duplicate(chatMessage.data.content)
            let searchRe = /<button data-action="damage">[^<]+<\/button>/;
            const damageTypeString = (this.item.data?.data?.actionType === "heal") ? i18n("DND5E.Healing") : i18n("DND5E.Damage");
            let damageString = (this.rollOptions.critical) ? i18n("DND5E.Critical") : damageTypeString;
            if (isAutoFastDamage()) damageString += ` ${i18n("midi-qol.fastForward")}`;
            let replaceString = `<button data-action="damage">${damageString}</button>`
            content = content.replace(searchRe, replaceString);
            searchRe = /<button data-action="versatile">[^<]+<\/button>/;
            damageString = i18n("DND5E.Versatile")
            if (isAutoFastDamage()) damageString += ` ${i18n("midi-qol.fastForward")}`;
            replaceString = `<button data-action="versatile">${damageString}</button>`
            content = content.replace(searchRe, replaceString);
            await chatMessage?.update({content});
          }
        }
        return; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
         if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) { 
           // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = await validTargetTokens(game.user.targets);
          this.hitTargets = await validTargetTokens(game.user.targets);
          warn(" damage roll complete for non auto target area effects spells", this)
        }
        Hooks.callAll("midi-qol.preDamageRollComplete", this)
        // apply damage to targets plus saves plus immunities
        // done here cause not needed for betterrolls workflow

        this.defaultDamageType = this.item.data.data.damage?.parts[0][1] || this.defaultDamageType || MQdefaultDamageType;
        if (this.item?.data.data.actionType === "heal" && !Object.keys(CONFIG.DND5E.healingTypes).includes(this.defaultDamageType)) this.defaultDamageType = "healing"; 
        this.damageDetail = createDamageList(this.damageRoll, this.item, this.defaultDamageType);
        const damageBonusMacro = getProperty(this.actor.data.flags, `${game.system.id}.DamageBonusMacro`);
        if (damageBonusMacro && this.workflowType === "Workflow") {
          await this.rollBonusDamage(damageBonusMacro);
        }
        // TODO Need to do DSN stuff
        if (this.otherDamageRoll) {
          this.otherDamageDetail = createDamageList(this.otherDamageRoll, null, this.defaultDamageType);
        }
        await this.displayDamageRoll(configSettings.mergeCard);
        Hooks.callAll("midi-qol.DamageRollComplete", this)
        if (this.isFumble) {
          this.expireMyEffects(["1Action", "1Attack"]);
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        expireMyEffects.bind(this)(["1Action", "1Attack", "1Hit"]);
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
          debug("Check Saves: ", this.saveRequests, this.saveTimeouts, this.saves);

          //@ts-ignore ._hooks not defined
          debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          await this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
        } else {// has saves but we are not checking so do nothing with the damage
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        }
        return this.next(WORKFLOWSTATES.SAVESCOMPLETE);

      case WORKFLOWSTATES.SAVESCOMPLETE:
        expireMyEffects.bind(this)(["1Action"]);
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
  
      case WORKFLOWSTATES.ALLROLLSCOMPLETE:
        if (this.damageDetail.length) processDamageRoll(this, this.damageDetail[0].type)
        debug("all rolls complete ", this.damageDetail)
        // expire effects on targeted tokens as required
        this.applicationTargets = new Set();
        if (this.item.hasSave) this.applicationTargets = this.failedSaves;
        else if (this.item.hasAttack) this.applicationTargets = this.hitTargets;
        else this.applicationTargets = this.targets;
 
        for (let target of this.targets) {
          //@ts-ignore effects
          const expiredEffects = target.actor?.effects?.filter(ef => {
            const wasAttacked = this.item?.hasAttack;
            const wasDamaged = itemHasDamage(this.item) && this.applicationTargets?.has(target);
            const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
            if (!specialDuration) return false;
            //TODO this is going to grab all the special damage types as well which is no good.
            if ((specialDuration.includes("isAttacked") && wasAttacked) ||
              (specialDuration.includes("isDamaged") && wasDamaged))
              return true;
            if (this.item.hasSave && specialDuration.includes(`isSaveSuccess`) && this.saves.has(target)) return true;
            if (this.item.hasSave && specialDuration.includes(`isSaveFailure`) && !this.saves.has(target)) return true;
            const abl = this.item.data.data.save.ability;
            if (this.item.hasSave && specialDuration.includes(`isSaveSuccsss.${abl}`) && this.saves.has(target)) return true;
            if (this.item.hasSave && specialDuration.includes(`isSaveFailure.${abl}`) && !this.saves.has(target)) return true;
            for (let dt of this.damageDetail) {
              if (specialDuration.includes(`isDamaged.${dt.type}`)) return true;
            }
            return false;
          }).map(ef=> ef.id);
          if (expiredEffects?.length > 0) {
            socketlibSocket.executeAsGM("removeEffects", {
              tokenId: target.id,
              effects: expiredEffects,
            });

/*            TODO remove this when socketlib 100% solid
            const intendedGM = game.user.isGM ? game.user : game.users.entities.find(u => u.isGM && u.active);
            if (!intendedGM) {
              ui.notifications.error(`${game.user.name} ${i18n("midi-qol.noGM")}`);
              error("No GM user connected - cannot remove effects");
              return;
            }


            broadcastData({
              action: "removeEffects",
              tokenId: target.id,
              effects: expiredEffects,
              intendedFor: intendedGM.id
            });
            */
          } // target.actor?.deleteEmbeddedEntity("ActiveEffect", expiredEffects);
        }
        return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);

      case WORKFLOWSTATES.APPLYDYNAMICEFFECTS:
        expireMyEffects.bind(this)(["1Action"]);
        if (configSettings.allowUseMacro && !this.onUseMacroCalled) {
          this.onUseMacroCalled = true;
          const results = await this.callMacros(getProperty(this.item, "data.flags.midi-qol.onUseMacroName"), "OnUse");
          // Special check for return of {haltEffectsApplication: true} from item macro
          if (results.some(r => r?.haltEffectsApplication))
            return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }

        // no item, not auto effects or not module skip
        if (!this.item || !configSettings.autoItemEffects) return this.next(WORKFLOWSTATES.ROLLFINISHED);
        this.applicationTargets = new Set();
        if (this.item.hasSave) this.applicationTargets = this.failedSaves;
        else if (this.item.hasAttack) this.applicationTargets = this.hitTargets;
        else this.applicationTargets = this.targets;
        if (this.hasDAE) {
          this.dae.doEffects(this.item, true, this.applicationTargets, {whisper: false, spellLevel: this.itemLevel, damageTotal: this.damageTotal, critical: this.isCritical, fumble: this.isFumble, itemCardId: this.itemCardId, tokenId: this.tokenId})
          await this.removeEffectsButton();
        }
        return this.next(WORKFLOWSTATES.ROLLFINISHED);

      case WORKFLOWSTATES.ROLLFINISHED:
        warn('Inside workflow.rollFINISHED');
        const hasConcentration = this.item?.data.data.components?.concentration || this.item?.data.data.activation?.condition?.includes("Concentration");
        const checkConcentration = installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
        if (hasConcentration && checkConcentration && this.applicationTargets) {
          let targets = [];
          for (let hit of this.applicationTargets) 
            targets.push({tokenId: hit.id, actorId: hit.actor.id});
          await this.actor.setFlag("midi-qol", "concentration-data", {uuid: this.item.uuid, targets, templates: this.templateId ? [this.templateId] : []})
          if (this.tokenId) {
            await game.cub.addCondition(game.settings.get("combat-utility-belt", "concentratorConditionName"), [canvas.tokens.get(this.tokenId)])
          }
        }
        if (configSettings.allowUseMacro && !this.onUseMacroCalled) {
          this.onUseMacroCalled = true;
          // A hack so that onUse macros only called once, but for most cases it is evaluated in APPLYDYNAMICEFFECTS
          await this.callMacros(getProperty(this.item, "data.flags.midi-qol.onUseMacroName"), "OnUse");
        }

        // delete Workflow._workflows[this.itemId];
        Hooks.callAll("minor-qol.RollComplete", this); // just for the macro writers.
        Hooks.callAll("midi-qol.RollComplete", this);
        if (autoRemoveTargets !== "none") setTimeout(untargetDeadTokens, 500); // delay to let the updates finish

        //@ts-ignore ui.chat undefined.
        ui.chat.scrollBottom();
        return;
    }
  }



  async rollBonusDamage(damageBonusMacro) {
    let formula = "";
    var flavor = "";
    var extraDamages = await this.callMacros(damageBonusMacro, "DamageBonus");
    for (let extraDamage of extraDamages) {
      if (extraDamage?.damageRoll) {
        formula += (formula ? "+" : "") + extraDamage.damageRoll;
        if (extraDamage.flavor) {
          flavor = `${flavor}${flavor !== "" ? "<br>" : ""}${extraDamage.flavor}`
        }
        // flavor = extraDamage.flavor ? extraDamage.flavor : flavor;
      }
    }
    if (formula === "")  return;
    try {
      const roll = new Roll(formula, this.actor.getRollData()).roll();
      this.bonusDamageRoll = roll;
      this.bonusDamageTotal = roll.total;
      this.bonusDamageHTML = await roll.render();
      this.bonusDamageFlavor = flavor ?? "";
      this.bonusDamageDetail = createDamageList(this.bonusDamageRoll, null, this.defaultDamageType);
    } catch (err) {
      console.warn(`midi-qol | error in evaluating${formula} in bonus damage`, err);
      this.bonusDamageRoll = null;
      this.bonusDamageDetail = [];
    }
    if (this.bonusDamageRoll !== null) {
      const dice3dActive = game.dice3d && (game.settings.get("dice-so-nice", "settings")?.enabled)
      if (dice3dActive && configSettings.mergeCard) { 
        let whisperIds = null;
        const rollMode = game.settings.get("core", "rollMode");
        if ((configSettings.hideRollDetails !== "none" && game.user.isGM) || rollMode === "blindroll") {
          whisperIds = ChatMessage.getWhisperRecipients("GM")
        } else if (rollMode === "selfroll" || rollMode === "gmroll") {
          whisperIds = ChatMessage.getWhisperRecipients("GM").concat(game.user);
        }
        await game.dice3d.showForRoll(this.bonusDamageRoll, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
      }
    }
    return;
  }

  async callMacros(macros, tag) {
    if (!macros) return [];
    let values = [];
    const macroNames = macros.split(",");
    let targets = [];
    let failedSaves = [];
    let hitTargets = [];
    let saves = [];
    let superSavers = [];
    for (let target of this.targets) targets.push(target.data);
    for (let save of this.saves) saves.push(save.data);
    for (let hit of this.hitTargets) hitTargets.push(hit.data);
    for (let failed of this.failedSaves) failedSaves.push(failed.data);
    for (let save of this.superSavers) superSavers.push(save.data);
    const macroData = {
      actor: this.actor.data,
      tokenId: this.tokenId,
      item: this.item?.data,
      targets,
      hitTargets,
      saves,
      superSavers,
      failedSaves,
      damageRoll: this.damageRoll,
      attackRoll: this.attackRoll,
      attackTotal: this.attackTotal,
      itemCardId: this.itemCardId,
      isCritical: this.rollOptions.critical || this.isCritical,
      isFumble: this.isFumble,
      spellLevel: this.itemLevel,
      powerLevel: this.itemLevel,
      damageTotal: this.damageTotal,
      damageDetail: this.damageDetail,
      damageList: this.damageList,
      otherDamageTotal: this.otherDamageTotal,
      otherDamageDetail: this.otherDamageDetail,
      otherDamageList: this.otherDamageList,
      rollOptions: this.rollOptions,
      advantage: this.advantage,
      disadvantage: this.disadvantage,
      event: this.event,
      id: this.item.id,
      uuid: this.uuid,
      rollData: this.actor.getRollData(),
      tag,
      concentrationData: getProperty(this.actor.data.flags, "midi-qol.concentration-data"),
      templateId: this.templateId
    };
    warn("macro data ", macroData)

    for (let  macro of macroNames) {
      values.push(this.callMacro(macro, macroData))
    }
    values = await Promise.all(values);
    return values;
  }

  async callMacro(macroName: string, macroData: {}) {
    const name = macroName?.trim();
    if (!name) return;
    try {
      if (name.startsWith("ItemMacro")) { // special short circuit eval for itemMacro since it can be execute as GM
        var itemMacro;
        var item = this.item;
        if (name === "ItemMacro") {
          itemMacro = getProperty(this.item.data.flags, "itemacro.macro");
        } else {
          const parts = name.split(".");
          const itemName = parts[1];
          item = this.actor.items.find(i => i.name === itemName && getProperty(i.data.flags, "itemacro.macro"))
          if (item) itemMacro = getProperty(item.data.flags, "itemacro.macro")
          else return {};
        }
        const speaker = this.speaker;
        const actor = this.actor;
        const token = canvas.tokens.get(this.tokenId);
        const character = game.user.character;
        const args = [macroData];

        // const asyncFunction = itemMacro.data.command.includes("await") ? "async" : "";
        return (new Function(`"use strict";
              return (async function ({speaker, actor, token, character, item, args}={}) {
                  ${itemMacro.data.command}
                  });`))().call(this, { speaker, actor, token, character, item, args });
      } else {
        const macroCommand = game.macros.getName(name);
        if (macroCommand) {
          //@ts-ignore -uses furnace macros which support arguments
          return macroCommand.execute(macroData) || {};
        }
      }
    } catch (err) {
      ui.notifications.error(`There was an error in your macro. See the console (F12) for details`);
      error("Error evaluating macro ", err)
    }
    return {};
  }

  async removeEffectsButton() {
  
    if (!this.itemCardId) return;
    const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    if (chatMessage) {
      const buttonRe = /<button data-action="applyEffects">[^<]*<\/button>/;
      //@ts-ignore
      let content = duplicate(chatMessage.data.content)
      content = content?.replace(buttonRe, "");
      await chatMessage.update({content})
    }
  }

 
  async displayAttackRoll(doMerge) {
    const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    //@ts-ignore content not definted
    let content = chatMessage && duplicate(chatMessage.data.content);
    var rollSound =  configSettings.diceSound;
    const flags = chatMessage?.data.flags || {};
    let newFlags = {};
    if (content && getRemoveAttackButtons()) {
      const searchRe = /<button data-action="attack">[^<]*<\/button>/;
      content = content.replace(searchRe, "");
    }
    if (doMerge && chatMessage) { // display the attack roll
      //let searchRe = /<div class="midi-qol-attack-roll">.*?<\/div>/;
      let searchRe = /<div class="midi-qol-attack-roll">[\s\S]*?<div class="end-midi-qol-attack-roll">/
      //@ts-ignore
      this.advantage = this.attackRoll.terms[0].options.advantage;
      //@ts-ignore
      this.disadvantage = this.attackRoll.terms[0].options.disadvantage;
      const attackString = this.advantage ? i18n("DND5E.Advantage") : this.disadvantage ? i18n("DND5E.Disadvantage") : i18n("DND5E.Attack")
      let replaceString = `<div class="midi-qol-attack-roll"><div style="text-align:center" >${attackString}</div>${this.attackRollHTML}<div class="end-midi-qol-attack-roll">`
      content = content.replace(searchRe, replaceString);
 
      if ( this.attackRoll.dice.length ) {
        const d = this.attackRoll.dice[0];
        const isD20 = (d.faces === 20);
        if (isD20 ) {
          // Highlight successes and failures
          if ( d.options.critical && (d.total >= d.options.critical) ) {
            content = content.replace('dice-total', 'dice-total critical');
          } 
          else if ( d.options.fumble && (d.total <= d.options.fumble) ) {
            content = content.replace('dice-total', 'dice-total fumble');
          }
          else if ( d.options.target ) {
            if ( this.attackRoll.total >= d.options.target ) content = content.replace('dice-total', 'dice-total success');
            else content = content.replace('dice-total', 'dice-total failure');
          }
          this.d20AttackRoll = d.total;
        }
      }
      if (!!!game.dice3d?.messageHookDisabled) this.hideTags = [".midi-qol-attack-roll", "midi-qol-damage-roll"];
      warn("Display attack roll ", this.attackCardData, this.attackRoll)
      newFlags = mergeObject(flags, {
          "midi-qol": 
          {
            type: MESSAGETYPES.ATTACK,
            waitForDiceSoNice: true,
            hideTag: this.hideTags,
            playSound: true,
            roll: this.attackRoll.roll,
            displayId: this.displayId,
            isCritical: this.isCritical,
            isFumble: this.isFumble,
            isHit: this.isHit,
            sound: rollSound,
            d20AttackRoll: this.d20AttackRoll
          }
        }, {overwrite: true, inplace: false}
      )
    }
    await chatMessage?.update({content, flags: newFlags });
  }

  get damageFlavor() {
    if (game.system.id === "dnd5e")
      allDamageTypes = mergeObject(CONFIG.DND5E.damageTypes, CONFIG.DND5E.healingTypes, {inplace:false});
    else
      allDamageTypes = mergeObject(CONFIG.SW5E.damageTypes, CONFIG.SW5E.healingTypes, {inplace:false});
    return `(${this.item?.data.data.damage.parts
    .map(a=>(allDamageTypes[a[1]] || allDamageTypes[this.defaultDamageType] || MQdefaultDamageType)).join(",") 
      || this.defaultDamageType || MQdefaultDamageType})`;
  }

  async displayDamageRoll(doMerge) {
    let chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    //@ts-ignore content not definted 
    let content = chatMessage && duplicate(chatMessage.data.content);
    // TODO work out what to do if we are a damage only workflow and betters rolls is active - display update wont work.
    if (getRemoveDamageButtons() || this.workflowType !== "Workflow") {
      const versatileRe = /<button data-action="versatile">[^<]*<\/button>/
      const damageRe = /<button data-action="damage">[^<]*<\/button>/
      const formulaRe = /<button data-action="formula">[^<]*<\/button>/
      content = content?.replace(damageRe, "")
      content = content?.replace(formulaRe, "")
      content = content?.replace(versatileRe, "<div></div>")
    }
    var rollSound = configSettings.diceSound;
    var newFlags = chatMessage?.data.flags || {};
    if (doMerge && chatMessage) {
      //@ts-ignore .flavor not defined
      if (this.damageRollHTML) {
        const dmgHeader = configSettings.mergeCardCondensed ? this.damageFlavor : (this.flavor ?? this.damageFlavor);
        if (!this.useOther) {
          const searchRe = /<div class="midi-qol-damage-roll">[\s\S]*?<div class="end-midi-qol-damage-roll">/;
          const replaceString = `<div class="midi-qol-damage-roll"><div style="text-align:center">${dmgHeader}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-damage-roll">`
          content = content.replace(searchRe, replaceString);
        } else {
          const otherSearchRe = /<div class="midi-qol-other-roll">[\s\S]*?<div class="end-midi-qol-other-roll">/;
          const otherReplaceString = `<div class="midi-qol-other-roll"><div style="text-align:center">${dmgHeader}</div>${this.damageRollHTML || ""}<div class="end-midi-qol-other-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.otherDamageHTML) {
            const otherSearchRe = /<div class="midi-qol-other-roll">[\s\S]*?<div class="end-midi-qol-other-roll">/;
            const otherReplaceString = `<div class="midi-qol-other-roll"><div style="text-align:center" >${this.item?.name ?? this.damageFlavor}${this.otherDamageHTML || ""}</div><div class="end-midi-qol-other-roll">`
            content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.bonusDamageRoll) {
          const bonusSearchRe = /<div class="midi-qol-bonus-roll">[\s\S]*?<div class="end-midi-qol-bonus-roll">/;
          const bonusReplaceString = `<div class="midi-qol-bonus-roll"><div style="text-align:center" >${this.bonusDamageFlavor}${this.bonusDamageHTML || ""}</div><div class="end-midi-qol-bonus-roll">`
          content = content.replace(bonusSearchRe, bonusReplaceString);
        }
      } else {
        if (this.otherDamageHTML) {
          const otherSearchRe = /<div class="midi-qol-damage-roll">[\s\S]*?<div class="end-midi-qol-damage-roll">/;
          const otherReplaceString = `<div class="midi-qol-damage-roll"><div style="text-align:center"></div>${this.otherDamageHTML || ""}<div class="end-midi-qol-damge-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.bonusDamageRoll) {
          const bonusSearchRe = /<div class="midi-qol-bonus-roll">[\s\S]*?<div class="end-midi-qol-bonus-roll">/;
          const bonusReplaceString = `<div class="midi-qol-bonus-roll"><div style="text-align:center" >${this.bonusDamageeFlavor}${this.bonusDamageHTML || ""}</div><div class="end-midi-qol-bonus-roll">`
          content = content.replace(bonusSearchRe, bonusReplaceString);
        }
      }
      if (!!!game.dice3d?.messageHookDisabled) {
        if (getAutoRollDamage()  === "none" || !isAutoFastDamage()) {
          // not auto rolling damage so hits will have been long displayed
          this.hideTags = [".midi-qol-damage-roll", ".midi-qol.other-roll"]
        } else this.hideTags.push(".midi-qol-damage-roll", ".midi-qol.other-roll");
      }
      this.displayId = randomID();
      newFlags = mergeObject(newFlags, {
        "midi-qol": {
          waitForDiceSoNice: true,
          type: MESSAGETYPES.DAMAGE,
          playSound: false, 
          sound: rollSound,
          // roll: this.damageCardData.roll,
          roll: this.damageRoll.roll,
          damageDetail: this.damageDetail,
          damageTotal: this.damageTotal,
          otherDamageDetail: this.otherDamageDetail,
          otherDamageTotal: this.otherDamageTotal,
          bonusDamageDetail: this.bonusDamageDetail,
          bonusDamageTotal: this.bonusDamageTotal,
          hideTag: this.hideTags,
          displayId: this.displayId
        }
      }, {overwrite: true, inplace: false});
    }
    /*
    if (!doMerge && this.otherDamageRoll) {
      const messageData = {
        flavor: this.otherFlavor,
        speaker: this.speaker
      }
      setProperty(messageData, "flags.dnd5e.roll.type", "damage");
      this.otherDamageRoll.toMessage(messageData);
    } */
    if (!doMerge && this.bonusDamageRoll) {
      const messageData = {
        flavor: this.bonusDamageFlavor,
        speaker: this.speaker
      }
      setProperty(messageData, "flags.dnd5e.roll.type", "damage");
      setProperty(messageData, "flags.sw5e.roll.type", "damage");
      this.bonusDamageRoll.toMessage(messageData);
    }
    
    await chatMessage?.update( {"content": content, flags: newFlags});
  }

  async displayHits(whisper = false, doMerge) {
    const templateData = {
      attackType: this.item?.name ?? "",
      oneCard: configSettings.mergeCard,
      hits: this.hitDisplayData,
      isCritical: this.isCritical, 
      isGM: game.user.isGM,
    };
    warn("displayHits ", templateData, whisper, doMerge);
    const hitContent = await renderTemplate("modules/midi-qol/templates/hits.html", templateData) || "No Targets";
    const chatMessage: ChatMessage = game.messages.get(this.itemCardId);

    if(doMerge && chatMessage) {
      // @ts-ignore .content not defined
      var content = chatMessage && duplicate(chatMessage.data.content);    
      var searchString;
      var replaceString;
      if (!!!game.dice3d?.messageHookDisabled) this.hideTags.push(".midi-qol-hits-display");
      // TODO test if we are doing better rolls rolls for the new chat cards and damageonlyworkflow
      switch (this.workflowType) {
        case "BetterRollsWorkflow":
          // TODO: Move to a place that can also catch a better rolls being edited
          // The BetterRollsWorkflow class should in general be handling this
          const roll = this.roll;
          const html = `<div class="midi-qol-hits-display">${hitContent}</div>`;
          await roll.entries.push({ type: "raw", html, source: "midi" });
          break;
        case "Workflow":
        case "TrapWorkflow":
        case "DamageOnlyWorkflow":
          searchString =  /<div class="midi-qol-hits-display">[\s\S]*?<div class="end-midi-qol-hits-display">/;
          replaceString = `<div class="midi-qol-hits-display">${hitContent}<div class="end-midi-qol-hits-display">`
          content = content.replace(searchString, replaceString);
          await chatMessage.update({
            "content": content, 
            timestamp: new Date().getTime(),
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
      let speaker = duplicate(this.speaker);
      speaker.alias = (configSettings.useTokenNames && speaker.token) ? canvas.tokens.get(speaker.token).name : speaker.alias;
      speaker.scene = canvas?.scene?.id
      if ((await validTargetTokens(game.user.targets)).size > 0) {
        let chatData: any = {
          user: game.user,
          speaker,
          content: hitContent || "No Targets",
          type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        }
        const rollMode = game.settings.get("core", "rollMode");
        if (whisper || rollMode !== "roll") 
        {
          chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
          chatData.user = ChatMessage.getWhisperRecipients("GM").find(u=>u.active);
          if (rollMode === "blindroll") {
            chatData["blind"] = true;
          }

          debug("Trying to whisper message", chatData)
        }
        if (this.workflowType !== "BetterRollsWorkflow") {
            setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", true);
            if (!whisper) setProperty(chatData, "flags.midi-qol.hideTag", "midi-qol-hits-display")
        } else { // better rolls workflow
            setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", false);
            // setProperty(chatData, "flags.midi-qol.hideTag", "")
        }
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
    const chatMessage: ChatMessage = game.messages.get(this.itemCardId);
    const saveContent = await renderTemplate("modules/midi-qol/templates/saves.html", templateData);
    if (doMerge && chatMessage) {
        // @ts-ignore .content not defined
        let content = duplicate(chatMessage.data.content)
        var searchString;
        var replaceString;
        let saveType = "midi-qol.saving-throws";
        if (this.item.data.data.type === "abil") saveType = "midi-qol.ability-checks"
        const saveHTML = `<div class="midi-qol-nobox midi-qol-bigger-text">${this.saveDisplayFlavor}</div>`;
        if (!!!game.dice3d?.messageHookDisabled) this.hideTags = [".midi-qol-saves-display"];
        switch (this.workflowType) {
          case "BetterRollsWorkflow":
            const html = `<div data-item-id="${this.item.id}"></div><div class="midi-qol-saves-display">${saveHTML}${saveContent}</div><footer class="card-footer">`
            const roll = this.roll;
            await roll.entries.push({ type: "raw", html, source: "midi" });
            return;
          break;
        case "Workflow":
        case "TrapWorkflow":
            searchString =  /<div class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
            // replaceString = `<div data-item-id="${this.item.id}"></div><div class="midi-qol-saves-display"><div class="midi-qol-nobox midi-qol-bigger-text">${saveFlavor}</div>${saveContent}</div>`
            replaceString = `<div class="midi-qol-saves-display"><div data-item-id="${this.item.id}">${saveHTML}${saveContent}</div><div class="end-midi-qol-saves-display">`
            content = content.replace(searchString, replaceString);
            await chatMessage.update({
              content, 
              type: CONST.CHAT_MESSAGE_TYPES.OTHER,
              "flags.midi-qol.type": MESSAGETYPES.SAVES,
              "flags.midi-qol.hideTag": this.hideTags
            });
            //@ts-ignore
            chatMessage.data.content = content;
        }
    } else {
      const gmUser = game.users.find((u: User) => u.isGM && u.active);
      //@ts-ignore
      let speaker = ChatMessage._getSpeakerFromUser({user: gmUser});
      const waitForDSN = configSettings.playerRollSaves !== "none" && this.saveDisplayData.some(data => data.isPC);
      speaker.scene = canvas?.scene?.id;
      chatData = {
        user: gmUser._id,
        speaker,
        content: `<div data-item-id="${this.item.id}"></div> ${saveContent}`,
        flavor: `<h4>${this.saveDisplayFlavor}</h4>`, 
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        flags: { "midi-qol": {type: MESSAGETYPES.SAVES, waitForDiceSoNice: waitForDSN}}
      };

      const rollMode = game.settings.get("core", "rollMode");
      if (configSettings.autoCheckSaves === "whisper" || whisper || rollMode !== "roll") 
      {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
        chatData.user = ChatMessage.getWhisperRecipients("GM").find(u=>u.active);
        if (rollMode === "blindroll") {
          chatData["blind"] = true;
        }

        debug("Trying to whisper message", chatData)
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

/**
 * update this.saves to be a Set of successful saves from the set of tokens this.hitTargets and failed saves to be the complement
 */
  async checkSaves(whisper = false) {
    this.saves = new Set();
    this.failedSaves = new Set()
    this.advantageSaves = new Set();
    this.disadvantageSaves = new Set();
    this.saveDisplayData = [];
    debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)

    if (this.hitTargets.size <= 0) {
      this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`
      return;
    }
    let rollDC = this.item.data.data.save.dc;
    if (this.item.getSaveDC) {
      rollDC = this.item.getSaveDC()
    }
    let rollAbility = this.item.data.data.save.ability;
  
    let promises = [];
    //@ts-ignore actor.rollAbilitySave
    var rollAction = CONFIG.Actor.entityClass.prototype.rollAbilitySave;
    var rollType = "save"
    if (this.item.data.data.actionType === "abil") {
      rollType = "abil"
      //@ts-ignore actor.rollAbilitySave
      rollAction = CONFIG.Actor.entityClass.prototype.rollAbilityTest;
    }
    // make sure saving throws are renabled.


    /*
    if (installedModules.get("monks-tokenbar")) {
      game.MonksTokenBar.requestRoll(
        Array.from(this.hitTargets), 
        {
          request:`save:${this.item.data.data.save.ability}`, 
          silent: true, 
          rollMode: "gmroll"
      });
    }
    */
    try {
      for (let target of this.hitTargets) {
        if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
        let advantage = false;
        // If spell, check for magic resistance
        if (this.item.data.type === "spell") {
          // check magic resistance in custom damage reduction traits
          advantage = (target?.actor?.data.data.traits?.dr?.custom || "").includes(i18n("midi-qol.MagicResistant"));
          // check magic resistance as a feature (based on the SRD name as provided by the DnD5e system)
          //@ts-ignore - data.data.items not defined in types
          advantage = advantage || target?.actor?.data.items.find(a => a.type==="feat" && a.name===i18n("midi-qol.MagicResistanceFeat"));
          if (advantage) this.advantageSaves.add(target);
          debug(`${target.actor.name} resistant to magic : ${advantage}`);
        }
        if (this.item.data.flags["midi-qol"]?.isConcentrationCheck) {
          if (getProperty(target.actor.data.flags, "midi-qol.advantage.concentration")) {
            advantage = true;
            this.advantageSaves.add(target);
          }
        }

        var player = this.playerFor(target);
        //@ts-ignore
        if (!player) player = ChatMessage.getWhisperRecipients("GM").find(u=>u.active);
        const promptPlayer = (!player?.isGM && configSettings.playerRollSaves !== "none") || (player?.isGM && configSettings.rollNPCSaves !== "auto");
        if (promptPlayer && player?.active) { 
          warn(`Player ${player?.name} controls actor ${target.actor.name} - requesting ${CONFIG.DND5E.abilities[this.item.data.data.save.ability]} save`);
          promises.push(new Promise((resolve) => {
            const advantageToUse = advantage;
            let requestId = target.actor.id;
            const playerId = player._id;
            if (["letme", "letmeQuery"].includes(configSettings.playerRollSaves) && installedModules.get("lmrtfy")) requestId = randomID();
            if (["letme", "letmeQuery"].includes(configSettings.rollNPCSaves) && installedModules.get("lmrtfy")) requestId = randomID();

            this.saveRequests[requestId] = resolve;
            
            requestPCSave(this.item.data.data.save.ability, rollType, player, target.actor.id, advantage, this.item.name, rollDC, requestId)

            // set a timeout for taking over the roll
            this.saveTimeouts[requestId] = setTimeout(async () => {
              if (this.saveRequests[requestId]) {
                  delete this.saveRequests[requestId];
                  delete this.saveTimeouts[requestId];
                  let result = await rollAction.bind(target.actor)(this.item.data.data.save.ability, {messageData: { user: playerId }, advantage: advantageToUse, fastForward: true});
                  resolve(result);
              }
            }, (configSettings.playerSaveTimeout || 1) * 1000);
          }))
        } else {  // GM to roll save
          let showRoll = configSettings.autoCheckSaves === "allShow";
          // Find a player owner for the roll if possible
          let owner = this.playerFor(target);
          if (owner) showRoll = true; // Always show player save rolls
          // If no player owns the token, find an active GM
          if (!owner) owner = game.users.find((u: User) => u.isGM && u.active);
          // Fall back to rolling as the current user
          if (!owner) owner = game.user;
          //@ts-ignore actor.rollAbilitySave
          promises.push(rollAction.bind(target.actor)(this.item.data.data.save.ability, { messageData: {user: owner._id}, chatMessage: showRoll,  mapKeys: false, advantage, fastForward: true}));
        }
      }
    } catch (err) {
        console.warn(err)
    } finally {
    }
    debug("check saves: requests are ", this.saveRequests)
    var results = await Promise.all(promises);
    this.saveResults = results;
    let i = 0;
    for (let target of this.hitTargets) {
      if (!target.actor) continue; // these were skipped when doing the rolls so they can be skipped now
      if (!results[i]) error("Token ", target, "could not roll save/check assuming 0");
      const result = results[i];
      let rollTotal = results[i]?.total || 0;
      if (result.terms[0]?.options?.advantage) this.advantageSaves.add(target);
      if (result.terms[0]?.options?.disadvantage) this.disadvantageSaves.add(target);
      let saved = rollTotal >= rollDC;
      if (this.checkSuperSaver(target.actor, this.item.data.data.save.ability)) 
        this.superSavers.add(target);
      if (rollTotal >= rollDC) this.saves.add(target);
      else this.failedSaves.add(target);

      if (game.user.isGM) log(`Ability save/check: ${target.name} rolled ${rollTotal} vs ${rollAbility} DC ${rollDC}`);
      let saveString = i18n(saved ? "midi-qol.save-success" : "midi-qol.save-failure");
      let adv = this.advantageSaves.has(target) ? `(${i18n("DND5E.Advantage")})` : "";
      if (this.disadvantageSaves.has(target)) adv = `(${i18n("DND5E.Disadvantage")})`;
      if (game.system.id === "sw5e") {
        adv = this.advantageSaves.has(target) ? `(${i18n("SW5E.Advantage")})` : "";
        if (this.disadvantageSaves.has(target)) adv = `(${i18n("SW5E.Disadvantage")})`;
      }
      let img = target.data.img || target.actor.img;
      //@ts-ignore
      if (configSettings.usePlayerPortrait && target.actor.data.type === "character")
        img = target.actor?.img || target.data.img;

      if ( VideoHelper.hasVideoExtension(img) ) {
        //@ts-ignore - createThumbnail not defined
        img = await game.video.createThumbnail(img, {width: 100, height: 100});
      }
      //@ts-ignore
      let isPlayerOwned = target.actor.hasPlayerOwner;
      this.saveDisplayData.push({
        gmName: target.name, 
        playerName: getTokenPlayerName(target),
        img, 
        isPC: isPlayerOwned, 
        target, 
        saveString, 
        rollTotal, 
        id: target.id, 
        adv
      });
      i++;
    }

    if (this.item.data.data.actionType !== "abil")
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">DC ${rollDC}</label> ${CONFIG.DND5E.abilities[rollAbility]} ${i18n(this.hitTargets.size > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw")}:`;
    else
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">DC ${rollDC}</label> ${CONFIG.DND5E.abilities[rollAbility]} ${i18n(this.hitTargets.size > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check")}:`;
  }

  processSaveRoll(message) {
    const isLMRTFY = (installedModules.get("lmrtfy") && message.data.flags?.lmrtfy?.data);
    if (!isLMRTFY && message.data.flags?.dnd5e?.roll?.type !== "save") return true;
    const requestId =  isLMRTFY ? message.data.flags.lmrtfy.data : message.data?.speaker?.actor;
    warn("processSaveToll", isLMRTFY, requestId, this.saveRequests )

    if (!requestId) return true;
    if (!this.saveRequests[requestId]) return true;
    if (this.saveRequests[requestId]) {
      clearTimeout(this.saveTimeouts[requestId]);
      this.saveRequests[requestId](message._roll)
      delete this.saveRequests[requestId];
      delete this.saveTimeouts[requestId];
    }      
    return true;
  }

  checkSuperSaver(actor, ability:string) {
    // TODO workout what this looks like
    const flags = getProperty(actor.data.flags, "midi-qol.superSaver");
    if (!flags) return false;
    if (flags?.all) return true;
    if (getProperty(flags, `${ability}`)) return true;
    return false;
  }

  processBetterRollsChatCard (message, html, data) {
    const brFlags = message.data.flags?.betterrolls5e;
    if (!brFlags) return true;
    debug("processBetterRollsChatCard", message. html, data)
    const requestId = message.data.speaker.actor;
    if (!this.saveRequests[requestId]) return true;
    const formula = "1d20";
    const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll" && e.rollType === "save");
    if (!rollEntry) return true;
    let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
    let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
    let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
    clearTimeout(this.saveTimeouts[requestId]);
    this.saveRequests[requestId]({total, formula, terms: [{options: {advantage, disadvantage}}]});
    delete this.saveRequests[requestId];
    delete this.saveTimeouts[requestId];
    return true;
  }

  processAttackRoll() {
    //@ts-ignore
    this.diceRoll = this.attackRoll.results[0];
    //@ts-ignore
    this.diceRoll = this.attackRoll.terms[0].results.find(d => d.active).result;
    //@ts-ignore .terms undefined
    this.isCritical = this.diceRoll  >= this.attackRoll.terms[0].options.critical;
    //@ts-ignore .terms undefined
    this.isFumble = this.diceRoll <= this.attackRoll.terms[0].options.fumble;
    this.attackTotal = this.attackRoll.total;
    debug("processItemRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble)
  }

  async checkHits() {
    let isHit = true;

    let item = this.item;
    
    // check for a hit/critical/fumble
    this.hitTargets = new Set();
    this.hitDisplayData = [];
  
    if (item?.data.data.target?.type === "self") {
      this.processCriticalFlags();
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
      if (this.isCritical) isHit = true;
      if (isHit || this.isCritical) this.processCriticalFlags();


      if (game.user.isGM) log(`${this.speaker.alias} Rolled a ${this.attackTotal} to hit ${targetName}'s AC of ${targetAC} ${(isHit || this.isCritical) ? "hitting" : "missing"}`);
      // Log the hit on the target
      let attackType = ""; //item?.name ? i18n(item.name) : "Attack";
      let hitString = this.isCritical ? i18n("midi-qol.criticals") : this.isFumble? i18n("midi-qol.fumbles") : isHit ? i18n("midi-qol.hits") : i18n("midi-qol.misses");
      let img = targetToken.data?.img || targetToken.actor.img;
      //@ts-ignore
      if (configSettings.usePlayerPortrait && targetToken.actor.data.type === "character")
        img = targetToken.actor?.img || targetToken.data.img;
      if ( VideoHelper.hasVideoExtension(img) ) {
        //@ts-ignore
        img = await game.video.createThumbnail(img, {width: 100, height: 100});
      }
      if (isNewerVersion("0.6.9", game.data.version)) 
        this.hitDisplayData.push({isPC: targetToken.actor.isPC, target: targetToken, hitString, attackType, img, gmName: targetToken.name, playerName: getTokenPlayerName(targetToken)});
      else      
        //@ts-ignore hasPlayerOwner
        this.hitDisplayData.push({isPC: targetToken.actor.hasPlayerOwner, target: targetToken, hitString, attackType, img, gmName: targetToken.name, playerName: getTokenPlayerName(targetToken)});
  
      // If we hit and we have targets and we are applying damage say so.
      if (isHit || this.isCritical) this.hitTargets.add(targetToken);
    }
  }

  setRangedTargets(targetDetails) {
    const token = canvas.tokens.get(this.speaker.token);
    if (!token) {
      ui.notifications.warn(`${game.i18n.localize("midi-qol.noSelection")}`)
      return true;
    }
    // We have placed an area effect template and we need to check if we over selected
    let dispositions = targetDetails.type === "creature" ? [-1,0,1] : targetDetails.type === "ally" ? [token.data.disposition] : [-token.data.disposition];
    // release current targets
    game.user.targets.forEach(t => {
      //@ts-ignore
      t.setTarget(false, { releaseOthers: false });
    });
    game.user.targets.clear();
    // min dist is the number of grid squares away.
    let minDist = targetDetails.value;
 
    canvas.tokens.placeables.filter(target => 
      target.actor && target.actor.data.data.details.race !== "trigger"
      && target.actor.id !== token.actor.id
      && dispositions.includes(target.data.disposition) 
      && (canvas.grid.measureDistances([{ray:new Ray(target.center, token.center)}], {gridSpaces: true})[0] <= minDist)
    ).forEach(token=> {
        token.setTarget(true, { user: game.user, releaseOthers: false });
    });
    this.targets = game.user.targets;
    this.saves = new Set();
    this.failedSaves = new Set(this.targets)
    this.hitTargets = new Set(this.targets);
  }
}

export class DamageOnlyWorkflow extends Workflow {
  constructor(actor: Actor5e, token: Token, damageTotal: number, damageType: string, targets: [Token], roll: Roll, 
        options: {flavor: string, itemCardId: string, damageList: [], useOther: boolean, itemData: {}}) {
          super(actor, null, ChatMessage.getSpeaker({token}), new Set(targets), shiftOnlyEvent)
    this.itemData = options.itemData;
    if (this.itemData && actor)
      this.item = Item.createOwned(this.itemData, this.actor);
    else this.item = null;

    this.damageRoll = roll;
    this.damageDetail = createDamageList(this.damageRoll, this.item, damageType);
    this.damageTotal = damageTotal;
    this.flavor = options.flavor;
    this.defaultDamageType = CONFIG.DND5E.damageTypes[damageType] || damageType;
    this.damageList = options.damageList;
    this.itemCardId = options.itemCardId;
    this.useOther = options.useOther ?? true;
    this.next(WORKFLOWSTATES.NONE);
    return this;
  }

  get workflowType() {return this.__proto__.constructor.name};
  get damageFlavor() { 
    if (this.useOther && this.flavor) return this.flavor;
    else return super.damageFlavor;
  }

  async _next(newState) {
    this.currentState = newState;
    warn("Newstate is ", newState)
    // let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===this.currentState)[0];
    switch(newState) {
      case WORKFLOWSTATES.NONE:
        this.effectsAlreadyExpired = [];
        if (this.itemData) {
          //@ts-ignore
          this.item = Item.createOwned(this.itemData, this.actor);
          setProperty(this.item, "data.flags.midi-qol.onUseMacroName", null);
        } else this.item = null;
        if (this.itemCardId === "new" && this.itemData) { // create a new chat card for the item
          this.createCount += 1;

          this.itemCard = await showItemCard.bind(this.item)(false, this, true);
          this.itemCardId = this.itemCard.id;
          // Since this could to be the same item don't roll the on use macro, since this could loop forever
        }

        // Need to pretend there was an attack roll so that hits can be residtered and the correct string created
        // TODO separate the checkHit()/create hit display Data and displayHits() into 3 spearate functions so we don't have to pretend there was a hit to get the display
        this.isCritical = false;
        this.isFumble = false;
        this.attackTotal = 9999;
        await this.checkHits();
        const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
        await this.displayHits(whisperCard, configSettings.mergeCard && this.itemCardId);
    
        if (configSettings.mergeCard && this.itemCardId) {
          this.damageRollHTML = await this.damageRoll.render();
          this.damageCardData = {
            //@ts-ignore
            flavor: "damage flavor",
            roll: this.damageRoll,
            speaker: this.speaker
          }
          await this.displayDamageRoll(configSettings.mergeCard && this.itemCardId)
        } else this.damageRoll.toMessage({flavor: this.flavor});
        this.hitTargets = new Set(this.targets);
        this.applicationTargets = new Set(this.targets);
        this.damageList = await applyTokenDamage(this.damageDetail, this.damageTotal, this.targets, this.item, new Set(), {existingDamage: this.damageList, superSavers: new Set()})
        return super._next(WORKFLOWSTATES.ROLLFINISHED);

      default: return super.next(newState);
    }
  }
}

export class TrapWorkflow extends Workflow {

  trapSound: {playlist: string, sound: string};
  templateLocation: {x: number, y: number, direction: number, removeDelay: number};
  saveTargets: any;

  constructor(actor: Actor5e, item: Item5e, targets: [Token], templateLocation: {x: number, y: number, direction: number, removeDelay: number} = undefined, trapSound: {playlist: string , sound: string} = undefined,  event: any = null) {
    super(actor, item, ChatMessage.getSpeaker({actor}), new Set(targets), event);
    // this.targets = new Set(targets);
    if (!this.event) this.event = duplicate(shiftOnlyEvent);
    this.trapSound = trapSound;
    this.templateLocation = templateLocation;
    // this.saveTargets = game.user.targets; 
    this.rollOptions.fastForward = true;
    this.next(WORKFLOWSTATES.NONE)
  }
  
  async _next(newState: number) {
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===newState)[0];
    warn("attack workflow.next ", state, this._id, this.targets)
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        this.saveTargets = await validTargetTokens(game.user.targets);
        this.effectsAlreadyExpired = [];
        this.onUseMacroCalled = false;
        this.itemCardId = (await showItemCard.bind(this.item)(false, this, true))?.id;
        //@ts-ignore
        if (this.trapSound) AudioHelper.play({src: this.trapSound}, false)
        debug(" workflow.none ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
        // don't support the placement of a tempalte
        return this.next(WORKFLOWSTATES.AWAITTEMPLATE);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        const targetDetails = this.item.data.data.target;
        if (configSettings.rangeTarget && targetDetails?.units === "ft" && ["creature", "ally", "enemy"].includes(targetDetails?.type)) {
          this.setRangedTargets(targetDetails);
          this.targets = await validTargetTokens(this.targets);
          this.failedSaves = new Set(this.targets)
          this.hitTargets = new Set(this.targets);
          return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
        }
        if (!this.item.hasAreaTarget || !this.templateLocation) return this.next(WORKFLOWSTATES.TEMPLATEPLACED)
        //@ts-ignore
        this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
        const TemplateClass = game[game.system.id].canvas.AbilityTemplate
        const template = TemplateClass.fromItem(this.item);
        // template.draw();
        // get the x and y position from the trapped token
        template.data.x = this.templateLocation.x || 0;
        template.data.y = this.templateLocation.y || 0;
        template.data.direction = this.templateLocation.direction || 0;

        // Create the template
        canvas.scene.createEmbeddedEntity("MeasuredTemplate", template.data).then((data) => {
          if (this.templateLocation.removeDelay) {
            setTimeout(() => canvas.scene.deleteEmbeddedEntity("MeasuredTemplate", data._id), this.templateLocation.removeDelay * 1000);
          }
        });
        return;

      case WORKFLOWSTATES.TEMPLATEPLACED:
        debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);

        // perhaps auto place template?
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.VALIDATEROLL:
        // do pre roll checks
        debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
        return this.next(WORKFLOWSTATES.WAITFORATTACKROLL);

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (!this.item.hasAttack) {
          this.hitTargets = new Set(this.targets);
          return this.next(WORKFLOWSTATES.WAITFORSAVES);
        }
        warn("attack roll ", this.event)
        this.item.rollAttack({event: this.event});
        return;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.processAttackRoll();
        await this.displayAttackRoll(configSettings.mergeCard);
        await this.checkHits();
        const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
        await this.displayHits(whisperCard, configSettings.mergeCard);
        return this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        if (!this.item.hasSave) {
          this.saves = new Set(); // no saving throw, so no-one saves
          this.failedSaves = new Set(this.hitTargets);
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
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
        await this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
        return this.next(WORKFLOWSTATES.SAVESCOMPLETE);

      case WORKFLOWSTATES.SAVESCOMPLETE:
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
       
      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        if (!itemHasDamage(this.item)) return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);
        if (this.isFumble) {
          // fumble means no trap damage/effects
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        } 
        this.rollOptions.critical = this.isCritical;
        debug("TrapWorkflow: Rolling damage ", this.event, this.itemLevel, this.rollOptions.versatile, this.targets, this.hitTargets);
        this.rollOptions.critical = this.isCritical;
        this.rollOptions.fastForward = true;
        this.item.rollDamage(this.rollOptions);
        return; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
         if (!this.item.hasAttack) { // no attack roll so everyone is hit
          this.hitTargets = new Set(this.targets)
          warn(" damage roll complete for non auto target area effects spells", this)
        }

        // apply damage to targets plus saves plus immunities
        await this.displayDamageRoll(configSettings.mergeCard)
        if (this.isFumble) {
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        // If the item does damage, use the same damage type as the item
        let defaultDamageType = this.item?.data.data.damage?.parts[0][1] || this.defaultDamageType;
        this.damageDetail = createDamageList(this.damageRoll, this.item, defaultDamageType);
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
  _roll: any;

  static get(id:string):BetterRollsWorkflow {
    return Workflow._workflows[id];
  }

  /**
   * Retrieves the BetterRolls CustomItemRoll object from the related chat message 
   */
  get roll() {
    if (this._roll) return this._roll;

    const message = game.messages.get(this.itemCardId) as object;
    if ("BetterRollsCardBinding" in message) {
      this._roll = message["BetterRollsCardBinding"].roll;
      return this._roll;
    }
  }

  async _next(newState) {
    this.currentState = newState;
    let state = Object.entries(WORKFLOWSTATES).find(a=>a[1]===this.currentState)[0];
    warn("betterRolls workflow.next ", state, configSettings.speedItemRolls, this)

    switch (newState) {
      case WORKFLOWSTATES.WAITFORATTACKROLL:
          // since this is better rolls as soon as we are ready for the attack roll we have both the attack roll and damage
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.effectsAlreadyExpired = [];
        if (checkRule("removeHiddenInvis")) removeHiddenInvis.bind(this)();
        debug(this.attackRollHTML)
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        }
        Hooks.callAll("midi-qol.AttackRollComplete", this);
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        // better rolls always have damage rolled, but we might have to show it
        // todo: shouldRollDamage is somewhat common and should probably be a property on the workflow base class
        let shouldRollDamage = getAutoRollDamage() === "always" 
          || (getAutoRollDamage() !== "none" && !this.item.hasAttack)
          || (getAutoRollDamage() === "onHit" && (this.hitTargets.size > 0 || this.targets.size === 0));
        if (shouldRollDamage) {
          this.roll?.rollDamage();
        }

        if (!itemHasDamage(this.item)) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        else return this.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        if (this.critflagSet) {
          this.roll?.forceCrit();
        }
        const damageBonusMacro = getProperty(this.actor.data.flags, "dnd5e.DamageBonusMacro");
        if (damageBonusMacro) {
          await this.rollBonusDamage(damageBonusMacro);
        }
        if (this.otherDamageRoll) {
          const messageData = {
            flavor: this.otherDamageFlavor ?? this.damageFlavor,
            speaker: this.speaker
          }
          setProperty(messageData, "flags.dnd5e.roll.type", "damage");
          //  Not required as we pick up the damage from the better rolls data this.otherDamageRoll.toMessage(messageData);
          this.otherDamageDetail = createDamageList(this.otherDamageRoll, null, this.defaultDamageType);

        }
        if (this.bonusDamageRoll) {
          const messageData = {
            flavor: this.bonusDamageFlavor,
            speaker: this.speaker
          }
          setProperty(messageData, "flags.dnd5e.roll.type", "damage");
          this.bonusDamageRoll.toMessage(messageData);
        }
        expireMyEffects.bind(this)(["1Attack", "1Action"]);

        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) { 
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = await validTargetTokens(game.user.targets);
          this.hitTargets = await validTargetTokens(game.user.targets);
       }
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) { //TODO: Is this right?
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (this.item.hasSave) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE)

      case WORKFLOWSTATES.ROLLFINISHED:
        await this.complete();
        super._next(WORKFLOWSTATES.ROLLFINISHED);
        // should remove the apply effects button.
        Workflow.removeWorkflow(this.item.id)
        return;
      
      default: 
        return await super._next(newState);
    }
  }

  async complete() {
    if (this._roll) {
      await this._roll.update({
        "flags.midi-qol.playSound": false,
        "flags.midi-qol.type": MESSAGETYPES.HITS,
        "flags.midi-qol.waitForDiceSoNice": false,
        "flags.midi-qol.hideTag": "",
        "flags.midi-qol.displayId": this.displayId
      });
      this._roll = null;
    }
  }
}

export class DummyWorkflow extends BetterRollsWorkflow {
  constructor(actor: Actor5e, item: Item5e, speaker, targets, options: any) {
    super (actor, item, speaker, targets, options);
    this.advantage = options?.advantage;
    this.disadvantage = options?.disadvantage
    this.rollOptions.fastForward = options?.fastForward;
    this.rollOptions.fastForwardKey = options?.fastFowrd;
  }
  
  async _next(newState) {
    Workflow.removeWorkflow(this.item.id)
  }
}
