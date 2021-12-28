//@ts-ignore
import Actor5e from "../../../systems/dnd5e/module/actor/entity.js"
//@ts-ignore
import Item5e from "../../../systems/dnd5e/module/item/entity.js"
//@ts-ignore
import { warn, debug, log, i18n, MESSAGETYPES, error, MQdefaultDamageType, debugEnabled, timelog, checkConcentrationSettings, getCanvas, MQItemMacroLabel, MQDeferMacroLabel, MQOnUseOptions } from "../midi-qol.js";
import { selectTargets, shouldRollOtherDamage, showItemCard, templateTokens } from "./itemhandling.js";
import { socketlibSocket } from "./GMAction.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";
import { configSettings, autoRemoveTargets, checkRule, autoFastForwardAbilityRolls, useMidiCrit } from "./settings.js";
import { createDamageList, processDamageRoll, untargetDeadTokens, getSaveMultiplierForItem, requestPCSave, applyTokenDamage, checkRange, checkIncapcitated, testKey, getAutoRollDamage, isAutoFastAttack, isAutoFastDamage, getAutoRollAttack, itemHasDamage, getRemoveDamageButtons, getRemoveAttackButtons, getTokenPlayerName, checkNearby, removeCondition, hasCondition, getDistance, removeHiddenInvis, expireMyEffects, validTargetTokens, getSelfTargetSet, doReactions, playerFor, addConcentration, getDistanceSimple, requestPCActiveDefence, evalActivationCondition, playerForActor, getLateTargeting } from "./utils.js"
import { getTrailingCommentRanges } from "typescript";
import { OnUseMacros } from "./apps/Item.js";
export const shiftOnlyEvent = { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, type: "" };
export function noKeySet(event) { return !(event?.shiftKey || event?.ctrlKey || event?.altKey || event?.metaKey) }
export let allDamageTypes;

class damageBonusMacroResult {
  damageRoll: string | undefined;
  flavor: string | undefined;
}
export const WORKFLOWSTATES = {
  NONE: 0,
  ROLLSTARTED: 1,
  AWAITTEMPLATE: 2,
  TEMPLATEPLACED: 3,
  LATETARGETING: 4,
  VALIDATEROLL: 5,
  PREAMBLECOMPLETE: 6,
  WAITFORATTACKROLL: 7,
  ATTACKROLLCOMPLETE: 8,
  WAITFORDAMAGEROLL: 9,
  DAMAGEROLLCOMPLETE: 10,
  WAITFORSAVES: 11,
  SAVESCOMPLETE: 12,
  ALLROLLSCOMPLETE: 13,
  APPLYDYNAMICEFFECTS: 14,
  ROLLFINISHED: 15
};

function stateToLabel(state: number) {
  let theState = Object.entries(WORKFLOWSTATES).find(a => a[1] === state);
  return theState ? theState[0] : "Bad State";
}

export const defaultRollOptions = {
  advantage: false,
  disadvantage: false,
  versatile: false,
  fastForward: false
};

class TokenDocument {
  uuid: string;
  actor: Actor;
};

class WorkflowState {
  constructor(state, undoData) {
    this._state = state;
    this._undoData = undoData
    this._stateLabel = stateToLabel(state);
  }
  _state: number;
  _undoData: any;
  _stateLabel: string;
}

export class Workflow {
  [x: string]: any;
  static _actions: {};
  static _workflows: {} = {};
  actor: Actor5e;
  item: Item5e;
  itemCardId: string | undefined | null;
  itemCardData: {};
  displayHookId: number | null;
  templateElevation: number;

  event: { shiftKey: boolean, altKey: boolean, ctrlKey: boolean, metaKey: boolean, type: string };
  capsLock: boolean;
  speaker: any;
  tokenUuid: string | undefined;  // TODO change tokenId to tokenUuid
  targets: Set<Token> | UserTargets;
  placeTemlateHookId: number | null;

  _id: string;
  saveDisplayFlavor: string;
  showCard: boolean;
  get id() { return this._id }
  itemId: string;
  itemUuid: string;
  uuid: string;
  itemLevel: number;
  currentState: number;

  isCritical: boolean;
  isFumble: boolean;
  hitTargets: Set<Token>;
  attackRoll: Roll | undefined;
  diceRoll: number | undefined;
  attackTotal: number;
  attackCardData: ChatMessage | undefined;
  attackRollHTML: HTMLElement | JQuery<HTMLElement> | string;
  noAutoAttack: boolean; // override attack roll for standard care

  hitDisplayData: any[];

  damageRoll: Roll | undefined;
  damageTotal: number;
  damageDetail: any[];
  damageRollHTML: HTMLElement | JQuery<HTMLElement> | string;
  damageCardData: ChatMessage | undefined;
  defaultDamageType: string | undefined;
  noAutoDamage: boolean; // override damage roll for damage rolls

  saves: Set<Token>;
  superSavers: Set<Token>;
  failedSaves: Set<Token>
  advantageSaves: Set<Token>;
  saveRequests: any;
  saveTimeouts: any;

  versatile: boolean;
  saveDisplayData;

  chatMessage: ChatMessage;
  hideTags: string[];
  displayId: string;
  reactionUpdates: Set<Actor5e>;
  stateList: WorkflowState[];
  flagTags: {} | undefined;
  onUseMacros: OnUseMacros | undefined;

  static eventHack: any;


  static get workflows() { return Workflow._workflows }
  static getWorkflow(id: string): Workflow {
    if (debugEnabled > 1) debug("Get workflow ", id, Workflow._workflows, Workflow._workflows[id])
    return Workflow._workflows[id];
  }

  get workflowType() { return this.__proto__.constructor.name };

  get hasSave() {
    if (this.item.hasSave) return this.item.hasSave;
    if (configSettings.rollOtherDamage && this.shouldRollOtherDamage) return this.otherDamageItem.hasSave;
    return this.item.hasSave;
  }

  get saveItem() {
    if (this.item.hasSave) return this.item;
    if (configSettings.rollOtherDamage && this.ammo?.hasSave) return this.ammo;
    return this.item;
  }

  get otherDamageItem() {
    if (this.item.data.data.formula ?? "" !== "") return this.item;
    if (this.ammo && (this.ammo?.data.data.formula ?? "") !== "") return this.ammo;
    return this.item;
    let item = this.item;
    if (!item.hasSave && this.ammo?.hasSave && configSettings.rollOtherDamage && this.shouldRollOtherDamage) item = this.ammo;
    return item;
  }

  get otherDamageFormula() {
    return this.otherDamageItem?.data.data.formula;
  }



  get hasDAE() {
    return installedModules.get("dae") && (this.item?.effects?.some(ef => ef.data?.transfer === false));
  }

  static initActions(actions: {}) {
    Workflow._actions = actions;
  }

  public processAttackEventOptions(event) {
    //TODO see if this can be simplified. Problem is we don't know when the event is injected
    let advKey = this.rollOptions.advKey || event?.altKey;
    let disKey = this.rollOptions.disKey || event?.ctrlKey || event?.metaKey;

    if (this.workflowType === "BetterRollsWorkflow") return;
    if (configSettings.speedItemRolls) {
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

  get shouldRollDamage(): boolean {

    return getAutoRollDamage() === "always"
      || (getAutoRollDamage() !== "none" && !this.item.hasAttack)
      || (getAutoRollDamage() === "onHit" && (this.hitTargets.size > 0 || this.hitTargetsEC.size > 0 || this.targets.size === 0))
      || (getAutoRollDamage() === "onHit" && (this.hitTargetsEC.size > 0));
  }

  constructor(actor: Actor5e, item: Item5e, speaker, targets, options: any) {
    this.rollOptions = duplicate(defaultRollOptions);
    this.actor = actor;
    this.item = item;
    if (Workflow.getWorkflow(item?.uuid)) {
      const existing = Workflow.getWorkflow(item.uuid);
      // Roll is finished or stuck waiting for damage roll (attack missed but GM could overrule)
      if (!([WORKFLOWSTATES.ROLLFINISHED, WORKFLOWSTATES.WAITFORDAMAGEROLL].includes(existing.currentState)) && existing.itemCardId) {
        game.messages?.get(existing.itemCardId)?.delete();
      }
      Workflow.removeWorkflow(item.uuid);
    }

    if (!this.item) {
      this.itemId = randomID();
      this.uuid = this.itemId
    } else {
      this.itemId = item.id;
      this.itemUuid = item.uuid;
      this.uuid = item.uuid;
    }

    this.tokenId = speaker.token;
    const token = getCanvas().tokens?.get(this.tokenId);
    this.tokenUuid = this.tokenId ? token?.document.uuid : undefined; // TODO see if this could be better
    if (installedModules.get("levels") && token) {
      //@ts-ignore
      this.templateElevation = _levels.templateElevation ? _levels.nextTemplateHeight : token.data.elevation;
    } else if (installedModules.get("levels")) {
      //@ts-ignore
      this.templateElevation = _levels.templateElevation ? _levels.nextTemplateHeight : 0;
    } else this.templateElevation = 0;
    if (installedModules.get("levels")) {
      if (game.user) setProperty(game.user, "data.flags.midi-qol.elevation", this.templateElevation);
    }
    this.speaker = speaker;
    if (this.speaker.scene) this.speaker.scene = canvas?.scene?.id;
    this.targets = new Set(targets);
    this.saves = new Set();
    this.superSavers = new Set();
    this.failedSaves = new Set(this.targets)
    this.hitTargets = new Set(this.targets);
    this.hitTargetsEC = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
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
    this.rollOptions = { disKey: false, advKey: false, versaKey: false, critKey: false, fastForward: false, fasForwardKey: false };
    if (this.item && !this.item.hasAttack) this.processDamageEventOptions(options?.event);
    else this.processAttackEventOptions(options?.event);
    this.templateId = null;
    this.templateUuid = null;

    this.saveRequests = {};
    this.defenceRequests = {};
    this.saveTimeouts = {};
    this.defenceTimeouts = {}
    this.shouldRollOtherDamage = true;
    this.forceApplyEffects = false;

    this.placeTemlateHookId = null;
    this.damageDetail = [];
    this.otherDamageDetail = [];
    this.hideTags = new Array();
    this.displayHookId = null;
    this.onUseCalled = false;
    this.effectsAlreadyExpired = [];
    this.reactionUpdates = new Set();
    Workflow._workflows[this.uuid] = this;
    this.needTemplate = this.item?.hasAreaTarget;
    this.stateList = [];
    this.attackRolled = false;
    this.damageRolled = false;
    this.kickStart = true; // call workflow.next(WORKFLOWSTATES.NONE) when the item card is shown.
    this.flagTags = undefined;

    if (configSettings.allowUseMacro)
      this.onUseMacros = getProperty(this.item, "data.flags.midi-qol.onUseMacroParts");
  }

  public someEventKeySet() {
    return this.event?.shiftKey || this.event?.altKey || this.event?.ctrlKey || this.event?.metaKey;
  }

  static async removeAttackDamageButtons(id) {
    let workflow = Workflow.getWorkflow(id)
    if (!workflow) return;
    let chatMessage: ChatMessage | undefined = game.messages?.get(workflow.itemCardId ?? "");
    if (!chatMessage) return;
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
    chatMessage.update({ content });
  }

  static removeWorkflow(id: string) {
    if (!Workflow._workflows[id] && debugEnabled > 0) warn("removeWorkflow: No such workflow ", id)
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

  // TODO get rid of this - deal with return type issues
  async next(nextState: number) {
    return await this._next(nextState);
  }

  async _next(newState: number, undoData: any = {}) {
    this.currentState = newState;
    let state = stateToLabel(newState)
    if (debugEnabled > 0) warn(this.workflowType, "_next ", state, this.id, this);
    // this.stateList.push(new WorkflowState(newState, undoData));
    // error(this.stateList);
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        this.preSelectedTargets = new Set(game.user?.targets); // record those targets targeted before cast.
        this.templateTargeting = configSettings.autoTarget !== "none" && this.item.hasAreaTarget;
        if (debugEnabled > 1) debug(state, configSettings.autoTarget, this.item.hasAreaTarget);
        if (this.templateTargeting) {
          game.user?.updateTokenTargets([]); // clear out the targets
          return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
        }
        const targetDetails = this.item.data.data.target;
        this.rangeTargeting = configSettings.rangeTarget !== "none" && ["ft", "m"].includes(targetDetails?.units) && ["creature", "ally", "enemy"].includes(targetDetails?.type);
        if (this.rangeTargeting) {
          this.setRangedTargets(targetDetails);
          this.failedSaves = new Set(this.targets)
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          this.targets = await validTargetTokens(this.targets);
          return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
        }
        return this.next(WORKFLOWSTATES.LATETARGETING);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        if (this.templateTargeting) {
          if (debugEnabled > 1) debug("Item has template; registering Hook");
          if (installedModules.get("levels")) {
            //@ts-ignore
            _levels.templateElevation = true;
            //@ts-ignore
            _levels.nextTemplateHeight = this.templateElevation;
          }
          if (!(this instanceof BetterRollsWorkflow)) this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
          if (this.needTemplate) return undefined;
        }
        return this.next(WORKFLOWSTATES.TEMPLATEPLACED);

      case WORKFLOWSTATES.TEMPLATEPLACED:
        if (configSettings.allowUseMacro) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
        }
        // Some modules stop being able to get the item card id.
        if (!this.itemCardId) return this.next(WORKFLOWSTATES.VALIDATEROLL);

        const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId);
        // remove the place template button from the chat card.
        this.targets = await validTargetTokens(this.targets);
        this.hitTargets = new Set(this.targets)
        this.hitTargetsEC = new Set();
        let content = chatMessage && duplicate(chatMessage.data.content)
        let buttonRe = /<button data-action="placeTemplate">[^<]*<\/button>/
        content = content?.replace(buttonRe, "");
        await chatMessage?.update({
          "content": content,
          "flags.midi-qol.playSound": false,
          "flags.midi-qol.type": MESSAGETYPES.ITEM,
          type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.LATETARGETING:
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.VALIDATEROLL:
        // do pre roll checks
        if (checkRule("checkRange")) {
          switch (checkRange(this.actor, this.item, this.tokenId, this.targets)) {
            case "fail": return this.next(WORKFLOWSTATES.ROLLFINISHED);
            case "dis": this.disadvantage = true;
          }
        }
        if (checkRule("incapacitated") && checkIncapcitated(this.actor, this.item, null)) return this.next(WORKFLOWSTATES.ROLLFINISHED);

        return this.next(WORKFLOWSTATES.PREAMBLECOMPLETE);

      case WORKFLOWSTATES.PREAMBLECOMPLETE:
        this.effectsAlreadyExpired = [];
        if (Hooks.call("midi-qol.preambleComplete", this) === false) return;
        if (configSettings.allowUseMacro) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preambleComplete"), "OnUse", "preambleComplete");
        }
        if (!getAutoRollAttack() && this.item?.hasAttack) {
          const rollMode = game.settings.get("core", "rollMode");
          this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blindroll" || rollMode === "gmroll";
          await this.displayTargets(this.whisperAttackCard);
        }
        return this.next(WORKFLOWSTATES.WAITFORATTACKROLL);

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (this.item.data.type === "tool" && autoFastForwardAbilityRolls) {
          this.processAttackEventOptions(this.event);
          const hasAdvantage = this.advantage && !this.disadvantage;
          const hasDisadvantage = this.disadvantage && !this.advantage;
          this.item.rollToolCheck({ fastForward: this.rollOptions.fastForward, advantage: hasAdvantage, disadvantage: hasDisadvantage })
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (this.noAutoAttack) return undefined;
        let shouldRoll = this.someEventKeySet() || getAutoRollAttack();
        // this.processAttackEventOptions(event);
        if (getAutoRollAttack() && isAutoFastAttack() && this.rollOptions.fastForwardKey) shouldRoll = false;
        //      if (configSettings.mergeCard) {
        {
          const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
          const isFastRoll = isAutoFastAttack() || (!isAutoFastAttack() && this.rollOptions.fastForwardKey);
          if (chatMessage && (!shouldRoll || !isFastRoll)) {
            // provide a hint as to the type of roll expected.
            let content = chatMessage && duplicate(chatMessage.data.content)
            let searchRe = /<button data-action="attack">[^<]+<\/button>/;
            const hasAdvantage = this.advantage && !this.disadvantage;
            const hasDisadvantage = this.disadvantage && !this.advantage;
            let attackString = hasAdvantage ? i18n("DND5E.Advantage") : hasDisadvantage ? i18n("DND5E.Disadvantage") : i18n("DND5E.Attack")
            if (isFastRoll) attackString += ` ${i18n("midi-qol.fastForward")}`;
            let replaceString = `<button data-action="attack">${attackString}</button>`
            content = content.replace(searchRe, replaceString);
            await chatMessage?.update({ "content": content });
          } else if (!chatMessage) error("no chat message")
        }
        if (configSettings.allowUseMacro) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
        }

        if (shouldRoll) {
          await this.item.rollAttack({ event: {} });
        } else if (isAutoFastAttack() && this.rollOptions.fastForwardKey) {
          this.rollOptions.fastForwardKey = false;
          this.rollOptions.fastForward = false;
        }
        return undefined;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        if (Hooks.call("midi-qol.preAttackRollComplete", this) === false) {
          return undefined;
        };
        const attackBonusMacro = getProperty(this.actor.data.flags, `${game.system.id}.AttackBonusMacro`);
        if (configSettings.allowUseMacro && attackBonusMacro) {
          await this.rollAttackBonus(attackBonusMacro);
        }
        this.processAttackRoll();

        Hooks.callAll("midi-qol.preCheckHits", this);
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
        }
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayAttackRoll(configSettings.mergeCard);

          const rollMode = game.settings.get("core", "rollMode");
          this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blindroll" || rollMode === "gmroll";
          await this.displayHits(this.whisperAttackCard, configSettings.mergeCard);
        } else {
          await this.displayAttackRoll(configSettings.mergeCard);
        }
        if (checkRule("removeHiddenInvis")) removeHiddenInvis.bind(this)();
        const attackExpiries = [
          "isAttacked",
         "1Reaction",
        ];
        await this.expireTargetEffects(attackExpiries)
        // We only roll damage on a hit. but we missed everyone so all over, unless we had no one targetted
        Hooks.callAll("midi-qol.AttackRollComplete", this);
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
        }

        if (
          (getAutoRollDamage() === "onHit" && this.hitTargetsEC.size === 0 && this.hitTargets.size === 0 && this.targets.size !== 0)
          // This actually causes an issue when the attack missed but GM might want to turn it into a hit.
          // || (configSettings.autoCheckHit !== "none" && this.hitTargets.size === 0 && this.hitTargetsEC.size === 0 && this.targets.size !== 0)
        ) {
          expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
          // Do special expiries
          await this.expireTargetEffects(["isAttacked"])
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        if (debugEnabled > 1) debug(`wait for damage roll has damage ${itemHasDamage(this.item)} isfumble ${this.isFumble} no auto damage ${this.noAutoDamage}`);
        if (!itemHasDamage(this.item)) return this.next(WORKFLOWSTATES.WAITFORSAVES);

        if (this.isFumble && configSettings.autoRollDamage !== "none") {
          // Auto rolling damage but we fumbled - we failed - skip everything.
          expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageRoll"), "OnUse", "preDamageRoll");
        }
        if (this.noAutoDamage) return; // we are emulating the standard card specially.

        // We have used up the fastforward key for this roll
        if (isAutoFastAttack()) {
          this.rollOptions.fastForwardKey = false;
        }
        if (this.shouldRollDamage) {
          if (debugEnabled > 0) warn(" about to roll damage ", this.event, configSettings.autoRollAttack, configSettings.autoFastForward)
          //@ts-ignore
          const storedData: any = game.messages?.get(this.itemCardId)?.getFlag(game.system.id, "itemData");
          if (storedData) { // It magic items is being used it fiddles the roll to include the item data
            this.item = new CONFIG.Item.documentClass(storedData, { parent: this.actor })
          }

          this.rollOptions.spellLevel = this.itemLevel;
          await this.item.rollDamage(this.rollOptions);
          return undefined;
        }
        this.processDamageEventOptions(event);

        //        if (configSettings.mergeCard && !shouldRollDamage) {
        //if (!this.shouldRollDamage) {
        {
          const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId || "");
          if (chatMessage) {
            // provide a hint as to the type of roll expected.
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
            await chatMessage?.update({ content });
          }
        }
        return undefined; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = await validTargetTokens(game.user?.targets);
          this.hitTargets = await validTargetTokens(game.user?.targets);
          this.hitTargetsEC = new Set();
          if (debugEnabled > 0) warn(" damage roll complete for non auto target area effects spells", this)
        }
        Hooks.callAll("midi-qol.preDamageRollComplete", this)
        // apply damage to targets plus saves plus immunities
        // done here cause not needed for betterrolls workflow
        this.defaultDamageType = this.item.data.data.damage?.parts[0][1] || this.defaultDamageType || MQdefaultDamageType;
        //@ts-ignore CONFIG.DND5E
        if (this.item?.data.data.actionType === "heal" && !Object.keys(CONFIG.DND5E.healingTypes).includes(this.defaultDamageType)) this.defaultDamageType = "healing";

        this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: this.defaultDamageType });
        const damageBonusMacro = getProperty(this.actor.data.flags, `${game.system.id}.DamageBonusMacro`);
        if (damageBonusMacro && this.workflowType === "Workflow") {
          await this.rollBonusDamage(damageBonusMacro);
        }
        // TODO Need to do DSN stuff
        if (this.otherDamageRoll) {
          this.otherDamageDetail = createDamageList({ roll: this.otherDamageRoll, item: null, versatile: false, defaultType: this.defaultDamageType });
        }
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
        }
        await this.displayDamageRoll(configSettings.mergeCard);
        Hooks.callAll("midi-qol.DamageRollComplete", this)
        if (this.isFumble) {
          expireMyEffects.bind(this)(["1Action", "1Attack", "1Spell"]);
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        expireMyEffects.bind(this)(["1Action", "1Attack", "1Hit", "1Spell"]);
        return this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        this.saves = new Set(); // not auto checking assume no saves

        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preSaves"), "OnUse", "preSaves");
        }
        if (this.workflowType === "Workflow" && !this.item?.hasAttack && this.item?.data.data.target?.type !== "self") { // Allow editing of targets if there is no attack that has already been processed.
          this.targets = new Set(game.user?.targets);
          this.hitTargets = new Set(this.targets);
        }
        this.failedSaves = new Set(this.hitTargets);
        if (!this.hasSave) {
          return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
        }

        if (configSettings.autoCheckSaves !== "none") {
          //@ts-ignore ._hooks not defined
          if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          // setup to process saving throws as generated
          let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
          let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
          let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
          try {
            await this.checkSaves(true);
          } finally {
            Hooks.off("renderChatMessage", hookId);
            Hooks.off("renderChatMessage", brHookId);
            Hooks.off("updateChatMessage", monksId);
          }
          if (debugEnabled > 1) debug("Check Saves: ", this.saveRequests, this.saveTimeouts, this.saves);

          //@ts-ignore ._hooks not defined
          if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          await this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
        } else {// has saves but we are not checking so do nothing with the damage
          await this.expireTargetEffects(["isAttacked"])
          this.applicationTargets = this.failedSaves;
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        }
        return this.next(WORKFLOWSTATES.SAVESCOMPLETE);

      case WORKFLOWSTATES.SAVESCOMPLETE:
        expireMyEffects.bind(this)(["1Action", "1Spell"]);
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postSaves"), "OnUse", "postSaves");
        }
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);

      case WORKFLOWSTATES.ALLROLLSCOMPLETE:
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
        }
        if (this.damageDetail.length) await processDamageRoll(this, this.damageDetail[0].type)
        if (debugEnabled > 1) debug("all rolls complete ", this.damageDetail)
        // expire effects on targeted tokens as required
        this.applicationTargets = new Set();
        if (this.saveItem.hasSave) this.applicationTargets = this.failedSaves;
        else if (this.item.hasAttack) {
          this.applicationTargets = this.hitTargets;
          // TODO EC add in all hitTargetsEC who took damage
        } else this.applicationTargets = this.targets;
        return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);

      case WORKFLOWSTATES.APPLYDYNAMICEFFECTS:
        expireMyEffects.bind(this)(["1Action", "1Spell"]);
        // Do special expiries
        const specialExpiries = [
          "isAttacked",
          "isDamaged",
          "1Reaction",
          "isSaveSuccess",
          "isSaveFailure",
          "isSave",
          "isHit"
        ];
        await this.expireTargetEffects(specialExpiries)

        if (this.item) {
          if (configSettings.allowUseMacro) {
            const results: any = await this.callMacros(this.item, this.onUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
            // Special check for return of {haltEffectsApplication: true} from item macro
            if (results.some(r => r?.haltEffectsApplication))
              return this.next(WORKFLOWSTATES.ROLLFINISHED);
          }
        }
        if (Hooks.call("midi-qol.preApplyDynamicEffects", this) === false) return this.this.next(WORKFLOWSTATES.ROLLFINISHED);
        // no item, not auto effects or not module skip
        // if (this.item && !getAutoRollAttack() && !this.forceApplyEffects && !this.item.hasAttack && !this.item.hasDamage && !this.item.hasSave) { return; }
        if (!this.item) return this.next(WORKFLOWSTATES.ROLLFINISHED);
        if (!configSettings.autoItemEffects && !this.forceApplyEffects) return this.next(WORKFLOWSTATES.ROLLFINISHED); // TODO see if there is a better way to do this.
        if (!this.forceApplyEffects) {
          this.applicationTargets = new Set();
          if (this.saveItem.hasSave) this.applicationTargets = this.failedSaves;
          else if (this.item.hasAttack) {
            this.applicationTargets = this.hitTargets;
            // TODO EC add in all EC targets that took damage
          } else this.applicationTargets = this.targets;
        }
        let applyCondtion = true;
        if (getProperty(this.item, "data.flags.midi-qol.effectActivation")) {
          applyCondtion = evalActivationCondition(this, getProperty(this.item, "data.data.activation.condition") ?? "");
        }
        if (this.hasDAE && applyCondtion) {
          await globalThis.DAE.doEffects(this.item, true, this.applicationTargets, { whisper: false, spellLevel: this.itemLevel, damageTotal: this.damageTotal, critical: this.isCritical, fumble: this.isFumble, itemCardId: this.itemCardId, tokenId: this.tokenId })
          if (!this.forceApplyEffects) await this.removeEffectsButton();
        }
        if (installedModules.get("dfreds-convenient-effects") && this.item) {
          const midiFlags = this.item.data.flags["midi-qol"];
          if ((configSettings.autoCEEffects && !midiFlags?.forceCEOff) || (!configSettings.autoCEEffects && midiFlags?.forceCEOn)) {
            const effectName = this.item.name;
            //@ts-ignore
            if (game.dfreds.effects.all.find(e => e.name === effectName)) {
              for (let token of this.applicationTargets) {
                //@ts-ignore
                if (game.dfreds.effectInterface) {
                  //@ts-ignore
                  await game.dfreds.effectInterface?.addEffect(effectName, token.actor.uuid, this.item?.uuid);
                }
              }
            }
          }
        }


        return this.next(WORKFLOWSTATES.ROLLFINISHED);

      case WORKFLOWSTATES.ROLLFINISHED:
        if (debugEnabled > 0) warn('Inside workflow.rollFINISHED');
        // Add concentration data if required
        let hasConcentration = this.item?.data.data.components?.concentration || this.item?.data.data.activation?.condition?.toLocaleLowerCase().includes(i18n("midi-qol.concentrationActivationCondition").toLocaleLowerCase());
        if (this.item &&
          (
            (this.item.hasAttack && (this.targets.size > 0 && this.hitTargets.size === 0 && this.hitTargetsEC.size === 0))  // did  not hit anyone
            || (this.saveItem.hasSave && (this.targets.size > 0 && this.failedSaves.size === 0)) // everyone saved
          )
        )
          hasConcentration = false;
        const checkConcentration = configSettings.concentrationAutomation; // installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
        if (hasConcentration && checkConcentration) {
          await addConcentration({ workflow: this });

          if (this.actor && this.applicationTargets) {
            let targets: { tokenUuid: string | undefined, actorUuid: string | undefined }[] = [];
            const selfTargetUuid = this.actor.uuid;
            let selfTargeted = false;
            for (let hit of this.applicationTargets) {
              const hitUuid = hit.document?.uuid ?? hit.uuid;
              const actorUuid = hit.actor.uuid;
              targets.push({ tokenUuid: hitUuid, actorUuid });
              if (selfTargetUuid === actorUuid) selfTargeted = true;
            }

            if (!selfTargeted) targets.push({ tokenUuid: this.tokenUuid, actorUuid: this.actor.uuid })
            let templates = this.templateUuid ? [this.templateUuid] : [];
            await this.actor.setFlag("midi-qol", "concentration-data", { uuid: this.item.uuid, targets: targets, templates: templates, removeUuids: [] })
          }
        }

        // Call onUseMacro if not already called
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
        }

        // delete Workflow._workflows[this.itemId];
        Hooks.callAll("minor-qol.RollComplete", this); // just for the macro writers.
        Hooks.callAll("midi-qol.RollComplete", this);
        if (autoRemoveTargets !== "none") setTimeout(untargetDeadTokens, 500); // delay to let the updates finish

        //@ts-ignore scrollBottom protected
        ui.chat?.scrollBottom();
        return undefined;

      default:
        error("invalid state in workflow")
        return undefined;
    }
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
      const token = getCanvas().tokens?.get(this.tokenId);
      if (token) {
        const hidden = hasCondition(token, "hidden");
        const invisible = hasCondition(token, "invisible");
        this.advantage = this.advantage || hidden || invisible;
        if (hidden || invisible) log(`Advantage given to ${this.actor.name} due to hidden/invisible`)
      }
    }
    // Neaarby foe gives disadvantage on ranged attacks
    if (checkRule("nearbyFoe") && !getProperty(this.actor, "data.flags.midi-qol.ignoreNearbyFoes") && (["rwak", "rsak", "rpak"].includes(actType) || this.item.data.data.properties?.thr)) { // Check if there is a foe near me when doing ranged attack
      let nearbyFoe = checkNearby(-1, getCanvas().tokens?.get(this.tokenId), configSettings.optionalRules.nearbyFoe);
      // special case check for thrown weapons within 5 feet (players will forget to set the property)
      if (this.item.data.data.properties?.thr) {
        const firstTarget: Token = this.targets.values().next().value;
        const me = getCanvas().tokens?.get(this.tokenId);
        if (firstTarget && me && getDistance(me, firstTarget, false, false).distance <= configSettings.optionalRules.nearbyFoe) nearbyFoe = false;
      }
      if (nearbyFoe) {
        log(`Ranged attack by ${this.actor.name} at disadvantage due to neabye foe`);
        if (debugEnabled > 0) warn(`Ranged attack by ${this.actor.name} at disadvantage due to neabye foe`);
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
      this.rollOptions.fastForward = true;
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
    // Change this to TokenDocument
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
        //TODO change this to TokenDocument
        const nearbyAlly = checkNearby(-1, firstTarget, configSettings.optionalRules.nearbyFoe); // targets near a friend that is not too big
        // TODO include thrown weapons in check
        if (nearbyAlly) {
          if (debugEnabled > 0) warn("ranged attack with disadvantage because target is near a friend");
          log(`Ranged attack by ${this.actor.name} at disadvantage due to nearby ally`)
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

  async expireTargetEffects(expireList: string[]) {
    for (let target of this.targets) {
      const expiredEffects: (string | null)[] | undefined = target.actor?.effects?.filter(ef => {
        const wasAttacked = this.item?.hasAttack;
        const wasDamaged = itemHasDamage(this.item) && (this.hitTargets?.has(target) || this.hitTargetsEC.has(target)); //TODO this test will fail for damage only workflows - need to check the damage rolled instaed
        const wasHit = this.hitTargets?.has(target) || this.hitTargetsEC?.has(target);
        const specialDuration = getProperty(ef.data.flags, "dae.specialDuration");
        if (!specialDuration) return false;
        //TODO this is going to grab all the special damage types as well which is no good.
        if ((expireList.includes("isAttacked") && specialDuration.includes("isAttacked") && wasAttacked)
          || (expireList.includes("isDamaged") && specialDuration.includes("isDamaged") && wasDamaged)
          || (expireList.includes("isHit") && specialDuration.includes("isHit") && wasHit))
          return true;
        if ((expireList.includes("1Reaction") && specialDuration.includes("1Reaction")) && target.actor?.uuid !== this.actor.uuid) return true;
        for (let dt of this.damageDetail) {
          if (expireList.includes(`isDamaged`) && wasDamaged && specialDuration.includes(`isDamaged.${dt.type}`)) return true;
        }
        if (!this.item) return false;
        if (this.saveItem.hasSave && expireList.includes("isSaveSuccess") && specialDuration.includes(`isSaveSuccess`) && this.saves.has(target)) return true;
        if (this.saveItem.hasSave && expireList.includes("isSaveFailure") && specialDuration.includes(`isSaveFailure`) && !this.saves.has(target)) return true;
        const abl = this.item?.data.data.save?.ability;
        if (this.saveItem.hasSave && expireList.includes(`isSaveSuccess`) && specialDuration.includes(`isSaveSuccess.${abl}`) && this.saves.has(target)) return true;
        if (this.saveItem.hasSave && expireList.includes(`isSaveFailure`) && specialDuration.includes(`isSaveFailure.${abl}`) && !this.saves.has(target)) return true;
        return false;
      }).map(ef => ef.id);
      if (expiredEffects?.length ?? 0 > 0) {
        await socketlibSocket.executeAsGM("removeEffects", {
          actorUuid: target.actor?.uuid,
          effects: expiredEffects,
        });
      }
    }
  }
  async rollBonusDamage(damageBonusMacro) {
    let formula = "";
    var flavor = "";
    var extraDamages: damageBonusMacroResult[] = await this.callMacros(this.item, damageBonusMacro, "DamageBonus", "DamageBonus");
    for (let extraDamage of extraDamages) {
      if (extraDamage?.damageRoll) {
        formula += (formula ? "+" : "") + extraDamage.damageRoll;
        if (extraDamage.flavor) {
          flavor = `${flavor}${flavor !== "" ? "<br>" : ""}${extraDamage.flavor}`
        }
        // flavor = extraDamage.flavor ? extraDamage.flavor : flavor;
      }
    }
    if (formula === "") return;
    try {
      const roll = await (new Roll(formula, this.actor.getRollData()).evaluate({ async: true }));
      this.bonusDamageRoll = roll;
      this.bonusDamageTotal = roll.total;
      this.bonusDamageHTML = await roll.render();
      this.bonusDamageFlavor = flavor ?? "";
      this.bonusDamageDetail = createDamageList({ roll: this.bonusDamageRoll, item: null, versatile: false, defaultType: this.defaultDamageType });
    } catch (err) {
      console.warn(`midi-qol | error in evaluating${formula} in bonus damage`, err);
      this.bonusDamageRoll = null;
      this.bonusDamageDetail = [];
    }
    if (this.bonusDamageRoll !== null) {
      if (dice3dEnabled() && configSettings.mergeCard && !(configSettings.gmHide3dDice && game.user?.isGM)) {
        let whisperIds: User[] = [];
        const rollMode = game.settings.get("core", "rollMode");
        if ((configSettings.hideRollDetails !== "none" && game.user?.isGM) || rollMode === "blindroll") {
          if (configSettings.ghostRolls) {
            //@ts-ignore ghost
            this.bonusDamageRoll.ghost = true;
          } else {
            whisperIds = ChatMessage.getWhisperRecipients("GM")
          }
        } else if (game.user && (rollMode === "selfroll" || rollMode === "gmroll")) {
          whisperIds = ChatMessage.getWhisperRecipients("GM").concat(game.user);
        } else whisperIds = ChatMessage.getWhisperRecipients("GM");
        //@ts-ignore game.dice3d
        await game.dice3d.showForRoll(this.bonusDamageRoll, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
      }
    }
    return;
  }

  async callMacros(item, macros, tag, macroPass): Promise<damageBonusMacroResult[]> {
    if (!macros || macros?.length === 0) return [];
    const macroNames = macros.split(",").map(s => s.trim());
    let values: Promise<damageBonusMacroResult | any>[] = [];
    let results: damageBonusMacroResult[];
    let targets: any[] = [];
    let targetUuids: string[] = []
    let failedSaves: any[] = [];
    let criticalSaves: any[] = [];
    let criticalSaveUuids: string[] = [];
    let fumbleSaves: any[] = [];
    let fumbleSaveUuids: string[] = [];
    let failedSaveUuids: string[] = [];
    let hitTargets: any[] = [];
    let hitTargetsEC: any[] = [];
    let hitTargetUuidsEC: string[] = [];
    let hitTargetUuids: string[] = [];
    let saves: any[] = [];
    let saveUuids: string[] = [];
    let superSavers: any[] = [];
    let superSaverUuids: string[] = [];
    for (let target of this.targets) {
      targets.push(target.document ?? target);
      targetUuids.push(target.document?.uuid ?? target.uuid);
    }
    for (let save of this.saves) {
      saves.push(save.document ?? save);
      saveUuids.push(save.document?.uuid ?? save.uuid);
    }
    for (let hit of this.hitTargets) {
      hitTargets.push(hit.document ?? hit);
      hitTargetUuids.push(hit.document?.uuid ?? hit.uuid)
    }
    for (let hit of this.hitTargetsEC) {
      hitTargetsEC.push(hit.document ?? hit);
      hitTargetUuidsEC.push(hit.document?.uuid ?? hit.uuid)
    }

    for (let failed of this.failedSaves) {
      failedSaves.push(failed.document ?? failed);
      failedSaveUuids.push(failed.document?.uuid ?? failed.uuid);
    }
    for (let critical of this.criticalSaves) {
      criticalSaves.push(critical.document ?? critical);
      criticalSaveUuids.push(critical.document?.uuid ?? critical.uuid);
    }
    for (let fumble of this.fumbleSaves) {
      fumbleSaves.push(fumble.document ?? fumble);
      fumbleSaveUuids.push(fumble.document?.uuid ?? fumble.uuid);
    }
    for (let save of this.superSavers) {
      superSavers.push(save.document ?? save);
      superSaverUuids.push(save.document?.uuid ?? save.uuid);
    };
    const itemData = item?.data.toObject(false);
    const macroData = {
      actor: this.actor.data,
      actorData: this.actor.data,
      actorUuid: this.actor.uuid,
      tokenId: this.tokenId,
      tokenUuid: this.tokenUuid,
      itemUuid: this.item?.uuid,
      item: itemData,
      itemData,
      targets,
      targetUuids,
      hitTargets,
      hitTargetUuids,
      hitTargetsEC,
      hitTargetUuidsEC,
      saves,
      saveUuids,
      superSavers,
      superSaverUuids,
      failedSaves,
      failedSaveUuids,
      criticalSaves,
      criticalSaveUuids,
      fumbleSaves,
      fumbleSaveUuids,
      damageRoll: this.damageRoll,
      attackRoll: this.attackRoll,
      diceRoll: this.diceRoll,
      attackD20: this.diceRoll,
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
      bonusDamageTotal: this.bonusDamageTotal,
      bonusDamageDetail: this.bonusDamageDetail,
      bonusDamageRoll: this.bonusDamageRoll,
      bonusDamageFlavor: this.bonusDamageFlavor,
      bonusDamageHTML: this.bonusDamageHTML,
      rollOptions: this.rollOptions,
      advantage: this.advantage,
      disadvantage: this.disadvantage,
      event: this.event,
      id: this.item.id,
      uuid: this.uuid,
      rollData: this.actor.getRollData(),
      tag,
      concentrationData: getProperty(this.actor.data.flags, "midi-qol.concentration-data"),
      templateId: this.templateId, // deprecated
      templateUuid: this.templateUuid,
      macroPass
    };

    if (debugEnabled > 0) warn("macro data ", macroData)

    for (let macro of macroNames) {
      values.push(this.callMacro(item, macro, macroData))
    }
    results = await Promise.all(values);
    return results;
  }

  async callMacro(item, macroName: string, macroData: any): Promise<damageBonusMacroResult | any> {
    const name = macroName?.trim();
    // var item;
    if (!name) return undefined;
    try {
      if (name.startsWith(MQItemMacroLabel)) { // special short circuit eval for itemMacro since it can be execute as GM
        var itemMacro;
        //  item = this.item;
        if (name === MQItemMacroLabel) {
          itemMacro = getProperty(item.data.flags, "itemacro.macro");
          macroData.sourceItemUuid = item?.uuid;
        } else {
          const parts = name.split(".");
          const itemName = parts.slice(1).join(".");;
          item = this.actor.items.find(i => i.name === itemName && getProperty(i.data.flags, "itemacro.macro"))
          if (!item) {
            // Try to find a UUID refence for the macro
            const uuid = name.replace("ItemMacro.", "").replace("@", "").replace("[", ".").replace("]", "").replace(/{.*}/, "");
            try {
              item = await fromUuid(uuid);
            } catch (err) {
              item = undefined;
            }
          }
          if (!item) {
            console.warn("midi-qol | callMacro: No item macro for", name);
            return {};
          }
          itemMacro = getProperty(item.data.flags, "itemacro.macro");
          macroData.sourceItemUuid = item.uuid;
        }
        const speaker = this.speaker;
        const actor = this.actor;
        const token = getCanvas().tokens?.get(this.tokenId);
        const character = game.user?.character;
        const args = [macroData];

        if (!itemMacro?.data?.command) {
          if (debugEnabled > 0) warn(`could not find item macro ${name}`);
          return {};
        }
        return (new Function(`"use strict";
              return (async function ({speaker, actor, token, character, item, args}={}) {
                  ${itemMacro.data.command}
                  });`))().call(this, { speaker, actor, token, character, item, args });
      } else {
        const macroCommand = game.macros?.getName(name);
        if (macroCommand) {
          return macroCommand.execute(macroData);
        }
      }
    } catch (err) {
      ui.notifications?.error(`There was an error in your macro. See the console (F12) for details`);
      error("Error evaluating macro ", err)
    }
    return {};
  }

  async removeEffectsButton() {

    if (!this.itemCardId) return;
    const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId);
    if (chatMessage) {
      const buttonRe = /<button data-action="applyEffects">[^<]*<\/button>/;
      let content = duplicate(chatMessage.data.content);
      content = content?.replace(buttonRe, "");
      await chatMessage.update({ content })
    }
  }


  async displayAttackRoll(doMerge) {
    const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
    let content = (chatMessage && duplicate(chatMessage.data.content)) || "";
    const flags = chatMessage?.data.flags || {};
    var rollSound = configSettings.diceSound;

    let newFlags = {};
    if (content && getRemoveAttackButtons()) {
      const searchRe = /<button data-action="attack">[^<]*<\/button>/;
      content = content.replace(searchRe, "");
    }
    if (game.user?.isGM && this.useActiveDefence) {
      const searchRe = /<div class="midi-qol-attack-roll">[\s\S]*?<div class="end-midi-qol-attack-roll">/
      const attackString = `${i18n("midi-qol.ActiveDefenceString")}${configSettings.displaySaveDC ? " " + this.activeDefenceDC : ""}`;
      const replaceString = `<div class="midi-qol-attack-roll"><div style="text-align:center" >${attackString}</div><div class="end-midi-qol-attack-roll">`
      content = content.replace(searchRe, replaceString);
      newFlags = mergeObject(flags, {
        "midi-qol":
        {
          hideTag: this.hideTags,
          displayId: this.displayId,
          isCritical: this.isCritical,
          isFumble: this.isFumble,
          isHit: this.hitTargets.size > 0,
          isHitEC: this.hitTargetsEC.size > 0
        }
      }, { overwrite: true, inplace: false });
    }
    else if (doMerge && chatMessage) { // display the attack roll
      //let searchRe = /<div class="midi-qol-attack-roll">.*?<\/div>/;
      let searchRe = /<div class="midi-qol-attack-roll">[\s\S]*?<div class="end-midi-qol-attack-roll">/
      let options: any = this.attackRoll?.terms[0].options;
      this.advantage = options.advantage;
      this.disadvantage = options.disadvantage;
      const attackString = this.advantage ? i18n("DND5E.Advantage") : this.disadvantage ? i18n("DND5E.Disadvantage") : i18n("DND5E.Attack")
      let replaceString = `<div class="midi-qol-attack-roll"><div style="text-align:center" >${attackString}</div>${this.attackRollHTML}<div class="end-midi-qol-attack-roll">`
      content = content.replace(searchRe, replaceString);

      if (this.attackRoll?.dice.length) {
        const d: any = this.attackRoll.dice[0]; // should be a dice term but DiceTerm.options not defined
        const isD20 = (d.faces === 20);
        if (isD20) {
          // Highlight successes and failures
          if (isNewerVersion("1.5.0", game.system.data.version) || useMidiCrit) {
            if ((d.options.critical && (d.total >= (getProperty(this, "item.data.flags.midi-qol.criticalThreshold") ?? d.options.critical)) || this.isCritical)) {
              content = content.replace('dice-total', 'dice-total critical');
            }
          } else if ((d.options.critical && d.total >= d.options.critical) || this.isCritical) {
            content = content.replace('dice-total', 'dice-total critical');
          } else if ((d.options.fumble && d.total <= d.options.fumble) || this.isFumble) {
            content = content.replace('dice-total', 'dice-total fumble');
          } else if (d.options.target) {
            if ((this.attackRoll?.total || 0) >= d.options.target) content = content.replace('dice-total', 'dice-total success');
            else content = content.replace('dice-total', 'dice-total failure');
          }
          this.d20AttackRoll = d.total;
        }
      }
      //@ts-ignore game.dice3d
      if (!!!game.dice3d?.messageHookDisabled && !(configSettings.gmHide3dDice && game.user?.isGM)) this.hideTags = [".midi-qol-attack-roll", "midi-qol-damage-roll"];
      if (debugEnabled > 0) warn("Display attack roll ", this.attackCardData, this.attackRoll)
      newFlags = mergeObject(flags, {
        "midi-qol":
        {
          type: MESSAGETYPES.ATTACK,
          waitForDiceSoNice: true,
          hideTag: this.hideTags,
          playSound: true,
          roll: this.attackRoll?.roll,
          displayId: this.displayId,
          isCritical: this.isCritical,
          isFumble: this.isFumble,
          isHit: this.hitTargets.size > 0,
          isHitEC: this.hitTargetsEC.size > 0,
          sound: rollSound,
          d20AttackRoll: this.d20AttackRoll
        }
      }, { overwrite: true, inplace: false }
      )
    }
    await chatMessage?.update({ content, flags: newFlags });
  }

  get damageFlavor() {
    if (game.system.id === "dnd5e")
      //@ts-ignore CONFIG.DND5E
      allDamageTypes = mergeObject(CONFIG.DND5E.damageTypes, CONFIG.DND5E.healingTypes, { inplace: false });
    else
      //@ts-ignore CONFIG.SW5E
      allDamageTypes = mergeObject(CONFIG.SW5E.damageTypes, CONFIG.SW5E.healingTypes, { inplace: false });
    return `(${this.damageDetail.filter(d => d.damage !== 0).map(d => allDamageTypes[d.type])})`;
    /*
        return `(${this.item?.data.data.damage.parts
          .map(a => (allDamageTypes[a[1]] || allDamageTypes[this.defaultDamageType ?? ""] || MQdefaultDamageType)).join(",")
          || this.defaultDamageType || MQdefaultDamageType})`;
          */
  }

  async displayDamageRoll(doMerge) {
    let chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
    let content = (chatMessage && duplicate(chatMessage.data.content)) ?? "";
    // TODO work out what to do if we are a damage only workflow and betters rolls is active - display update wont work.
    if (getRemoveDamageButtons() || this.workflowType !== "Workflow") {
      const versatileRe = /<button data-action="versatile">[^<]*<\/button>/
      const damageRe = /<button data-action="damage">[^<]*<\/button>/
      const formulaRe = /<button data-action="formula">[^<]*<\/button>/
      content = content?.replace(damageRe, "<div></div>")
      content = content?.replace(formulaRe, "")
      content = content?.replace(versatileRe, "")
    }
    var rollSound = configSettings.diceSound;
    var newFlags = chatMessage?.data.flags || {};
    if (doMerge && chatMessage) {
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
          const otherReplaceString = `<div class="midi-qol-damage-roll"><div style="text-align:center"></div>${this.otherDamageHTML || ""}<div class="end-midi-qol-damage-roll">`
          content = content.replace(otherSearchRe, otherReplaceString);
        }
        if (this.bonusDamageRoll) {
          const bonusSearchRe = /<div class="midi-qol-bonus-roll">[\s\S]*?<div class="end-midi-qol-bonus-roll">/;
          const bonusReplaceString = `<div class="midi-qol-bonus-roll"><div style="text-align:center" >${this.bonusDamageeFlavor}${this.bonusDamageHTML || ""}</div><div class="end-midi-qol-bonus-roll">`
          content = content.replace(bonusSearchRe, bonusReplaceString);
        }
      }
      //@ts-ignore game.dice3d
      if (!!!game.dice3d?.messageHookDisabled && !(configSettings.gmHide3dDice && game.user?.isGM)) {
        if (getAutoRollDamage() === "none" || !isAutoFastDamage()) {
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
          roll: this.damageRoll?.roll,
          damageDetail: this.damageDetail,
          damageTotal: this.damageTotal,
          otherDamageDetail: this.otherDamageDetail,
          otherDamageTotal: this.otherDamageTotal,
          bonusDamageDetail: this.bonusDamageDetail,
          bonusDamageTotal: this.bonusDamageTotal,
          hideTag: this.hideTags,
          displayId: this.displayId
        }
      }, { overwrite: true, inplace: false });
    }
    if (!doMerge && this.bonusDamageRoll) {
      const messageData = {
        flavor: this.bonusDamageFlavor,
        speaker: this.speaker
      }
      setProperty(messageData, "flags.dnd5e.roll.type", "damage");
      if (game.system.id === "sw5e") setProperty(messageData, "flags.sw5e.roll.type", "damage");
      this.bonusDamageRoll.toMessage(messageData);
    }

    await chatMessage?.update({ "content": content, flags: newFlags });
  }

  async displayTargets(whisper = false) {
    if (!configSettings.mergeCard) return;
    this.hitDisplayData = [];
    for (let targetToken of this.targets) {
      let img = targetToken.data?.img || targetToken.actor?.img;
      if (configSettings.usePlayerPortrait && targetToken.actor?.data.type === "character")
        img = targetToken.actor?.img || targetToken.data.img;
      if (VideoHelper.hasVideoExtension(img ?? "")) {
        img = await game.video.createThumbnail(img ?? "", { width: 100, height: 100 });
      }
      this.hitDisplayData.push({ isPC: targetToken.actor?.hasPlayerOwner, target: targetToken, hitString: "targets", aattackType: "", img, gmName: targetToken.name, playerName: getTokenPlayerName(targetToken), bonusAC: 0 });
    }
    await this.displayHits(whisper, configSettings.mergeCard && this.itemCardId, false);
  }

  async displayHits(whisper = false, doMerge, showHits = true) {
    const templateData = {
      attackType: this.item?.name ?? "",
      attackTotal: this.attackTotal,
      oneCard: configSettings.mergeCard,
      showHits,
      hits: this.hitDisplayData,
      isCritical: this.isCritical,
      isGM: game.user?.isGM,
    };
    if (debugEnabled > 0) warn("displayHits ", templateData, whisper, doMerge);
    const hitContent = await renderTemplate("modules/midi-qol/templates/hits.html", templateData) || "No Targets";
    const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");

    if (doMerge && chatMessage) {
      var content = (chatMessage && duplicate(chatMessage.data.content)) ?? "";
      var searchString;
      var replaceString;
      //@ts-ignore game.dice3d
      if (!!!game.dice3d?.messageHookDisabled && !(configSettings.gmHide3dDice && game.user?.isGM)) this.hideTags.push(".midi-qol-hits-display");
      // TODO test if we are doing better rolls rolls for the new chat cards and damageonlyworkflow
      switch (this.workflowType) {
        case "BetterRollsWorkflow":
          // TODO: Move to a place that can also catch a better rolls being edited
          // The BetterRollsWorkflow class should in general be handling this
          const roll = this.roll;
          const html = `<div class="midi-qol-hits-display">${hitContent}</div>`;
          // For better rolls the show targets without hits causes an empty item card to be shown that breaks the workflow.
          if (showHits) {
            roll.entries.push({ type: "raw", html, source: "midi" });
            // await roll.update();
          }
          break;
        case "Workflow":
        case "TrapWorkflow":
        case "DamageOnlyWorkflow":
        case "DDBGameLogWorkflow":
          if (content && getRemoveAttackButtons() && showHits) {
            const searchRe = /<button data-action="attack">[^<]*<\/button>/;
            content = content.replace(searchRe, "");
          }
          searchString = /<div class="midi-qol-hits-display">[\s\S]*?<div class="end-midi-qol-hits-display">/;
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
      let user: User | undefined | null = game.user;
      if (this.item) {
        speaker = ChatMessage.getSpeaker({ actor: this.item.actor });
        user = playerForActor(this.item.actor);
      }
      if (!user) return;
      speaker.alias = (configSettings.useTokenNames && speaker.token) ? getCanvas().tokens?.get(speaker.token)?.name : speaker.alias;
      speaker.scene = canvas?.scene?.id
      if ((await validTargetTokens(game.user?.targets ?? new Set())).size > 0) {
        let chatData: any = {
          speaker,
          // user: user.id,
          messageData: {
            speaker,
            user: user.id
          },
          content: hitContent || "No Targets",
          type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        }
        const rollMode = game.settings.get("core", "rollMode");
        if (whisper || rollMode !== "roll") {
          chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u => u.id);
          if (!game.user?.isGM && rollMode !== "blindroll") chatData.whisper.push(game.user?.id); // message is going to be created by GM add self
          chatData.messageData.user = ChatMessage.getWhisperRecipients("GM").find(u => u.active)?.id;
          if (rollMode === "blindroll") {
            chatData["blind"] = true;
          }

          if (debugEnabled > 1) debug("Trying to whisper message", chatData)
        }
        if (this.workflowType !== "BetterRollsWorkflow" && showHits) {
          setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", true);
          if (!whisper) setProperty(chatData, "flags.midi-qol.hideTag", "midi-qol-hits-display")
        } else { // better rolls workflow
          setProperty(chatData, "flags.midi-qol.waitForDiceSoNice", false);
          // setProperty(chatData, "flags.midi-qol.hideTag", "")
        }
        if (this.flagTags) chatData.flags = mergeObject(chatData.flags ?? "", this.flagTags);
        let returns;
        if (game.users?.get(chatData.messageData.user)?.isGM)
          returns = await socketlibSocket.executeAsGM("createChatMessage", { chatData });
        else
          returns = await ChatMessage.create(chatData);
      }
    }
  }

  async displaySaves(whisper, doMerge) {
    let chatData: any = {};
    const noDamage = getSaveMultiplierForItem(this.saveItem) === 0 ? i18n("midi-qol.noDamageText") : "";
    const fullDamage = getSaveMultiplierForItem(this.saveItem) === 1 ? i18n("midi-qol.fullDamageText") : "";

    let templateData = {
      noDamage,
      fullDamage,
      saves: this.saveDisplayData,
      // TODO force roll damage
    }
    const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
    const saveContent = await renderTemplate("modules/midi-qol/templates/saves.html", templateData);
    if (doMerge && chatMessage) {
      let content = duplicate(chatMessage.data.content)
      var searchString;
      var replaceString;
      let saveType = "midi-qol.saving-throws";
      if (this.item.data.data.type === "abil") saveType = "midi-qol.ability-checks"
      const saveHTML = `<div class="midi-qol-nobox midi-qol-bigger-text">${this.saveDisplayFlavor}</div>`;
      //@ts-ignore game.dice3d
      if (!!!game.dice3d?.messageHookDisabled && !(configSettings.gmHide3dDice && game.user?.isGM)) this.hideTags = [".midi-qol-saves-display"];
      switch (this.workflowType) {
        case "BetterRollsWorkflow":
          const html = `<div data-item-id="${this.item.id}"></div><div class="midi-qol-saves-display">${saveHTML}${saveContent}</div>`
          const roll = this.roll;
          await roll.entries.push({ type: "raw", html, source: "midi" });
          return;
          break;
        case "Workflow":
        case "TrapWorkflow":
        case "DDBGameLogWorkflow":
          searchString = /<div class="midi-qol-saves-display">[\s\S]*?<div class="end-midi-qol-saves-display">/;
          replaceString = `<div class="midi-qol-saves-display"><div data-item-id="${this.item.id}">${saveHTML}${saveContent}</div><div class="end-midi-qol-saves-display">`
          content = content.replace(searchString, replaceString);
          await chatMessage.update({
            content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            "flags.midi-qol.type": MESSAGETYPES.SAVES,
            "flags.midi-qol.hideTag": this.hideTags
          });
          chatMessage.data.content = content;
      }
    } else {
      const gmUser = game.users?.find((u: User) => u.isGM && u.active);
      //@ts-ignore _getSpeakerFromuser
      let speaker = ChatMessage._getSpeakerFromUser({ user: gmUser });
      const waitForDSN = configSettings.playerRollSaves !== "none" && this.saveDisplayData.some(data => data.isPC);
      speaker.scene = canvas?.scene?.id ?? "";
      chatData = {
        messageData: {
          user: game.user?.id, //gmUser - save results will come from the user now, not the GM
          speaker
        },
        content: `<div data-item-id="${this.item.id}"></div> ${saveContent}`,
        flavor: `<h4>${this.saveDisplayFlavor}</h4>`,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER,
        flags: { "midi-qol": { type: MESSAGETYPES.SAVES, waitForDiceSoNice: waitForDSN } }
      };

      const rollMode = game.settings.get("core", "rollMode");
      if (configSettings.autoCheckSaves === "whisper" || whisper || rollMode !== "roll") {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
        chatData.messageData.user = game.user?.id; // ChatMessage.getWhisperRecipients("GM").find(u => u.active);
        if (rollMode === "blindroll") {
          chatData["blind"] = true;
        }

        if (debugEnabled > 1) debug("Trying to whisper message", chatData)
      }
      if (this.flagTags) chatData.flags = mergeObject(chatData.flags ?? {}, this.flagTags);
      await ChatMessage.create(chatData);
      // Non GMS don't have permission to create the message so hand it off to a gm client
      // await socketlibSocket.executeAsGM("createChatMessage", {chatData});
    };
  }

  /**
   * update this.saves to be a Set of successful saves from the set of tokens this.hitTargets and failed saves to be the complement
   */
  async checkSaves(whisper = false) {
    this.saves = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
    this.failedSaves = this.item?.hasAttack ? new Set(this.hitTargets) : new Set(this.targets);
    this.advantageSaves = new Set();
    this.disadvantageSaves = new Set();
    this.saveDisplayData = [];
    if (debugEnabled > 1) debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)
    if (this.hitTargets.size <= 0 && this.hitTargetsEC.size <= 0) {
      this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`
      return;
    }
    let rollDC = this.saveItem.data.data.save.DC;
    if (this.saveItem.getSaveDC) {
      rollDC = this.saveItem.getSaveDC(); // TODO see if I need to do this for ammo as well
    }

    let promises: Promise<any>[] = [];
    //@ts-ignore actor.rollAbilitySave
    var rollAction = CONFIG.Actor.documentClass.prototype.rollAbilitySave;
    var rollType = "save"
    if (this.saveItem.data.data.actionType === "abil") {
      rollType = "abil"
      //@ts-ignore actor.rollAbilityTest
      rollAction = CONFIG.Actor.documentClass.prototype.rollAbilityTest;
    }
    else {
      const midiFlags = this.saveItem.data.flags ? this.saveItem.data.flags["midi-qol"] : undefined;
      if (midiFlags?.overTimeSkillRoll) {
        rollType = "skill"
        //@ts-ignore actor.rollAbilityTest
        rollAction = CONFIG.Actor.documentClass.prototype.rollSkill;
        this.saveItem.data.data.save.ability = midiFlags.overTimeSkillRoll;
      }
    }
    let rollAbility = this.saveItem.data.data.save.ability;
    // make sure saving throws are renabled.

    const playerMonksTB = installedModules.get("monks-tokenbar") && configSettings.playerRollSaves === "mtb";
    let monkRequests: any[] = [];
    let showRoll = configSettings.autoCheckSaves === "allShow";
    try {
      const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);

      //      for (let target of this.hitTargets) {
      for (let target of allHitTargets) {
        if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
        let advantage: Boolean | undefined = undefined;
        // If spell, check for magic resistance
        if (this.item.data.type === "spell") {
          // check magic resistance in custom damage reduction traits
          //@ts-ignore traits
          advantage = (target?.actor?.data.data.traits?.dr?.custom || "").includes(i18n("midi-qol.MagicResistant"));
          // check magic resistance as a feature (based on the SRD name as provided by the DnD5e system)
          advantage = advantage || target?.actor?.data.items.find(a => a.type === "feat" && a.name === i18n("midi-qol.MagicResistanceFeat")) !== undefined;

          if (advantage) this.advantageSaves.add(target);
          else advantage = undefined;
          if (debugEnabled > 1) debug(`${target.actor.name} resistant to magic : ${advantage}`);
        }
        if (this.saveItem.data.flags["midi-qol"]?.isConcentrationCheck) {
          if (getProperty(target.actor.data.flags, "midi-qol.advantage.concentration")) {
            advantage = true;
            this.advantageSaves.add(target);
          }
          if (getProperty(target.actor.data.flags, "midi-qol.disadvantage.concentration")) {
            advantage = false;
            this.disadvantageSaves.add(target);
          }
        }

        var player = playerFor(target);
        if (!player) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
        let promptPlayer = (!player?.isGM && configSettings.playerRollSaves !== "none");
        let GMprompt;
        let gmMonksTB;
        if (player?.isGM) {
          const targetDocument = target.document ?? target;
          const monksTBSetting = targetDocument.isLinked ? configSettings.rollNPCLinkedSaves === "mtb" : configSettings.rollNPCSaves === "mtb"
          gmMonksTB = installedModules.get("monks-tokenbar") && monksTBSetting;
          GMprompt = (targetDocument.isLinked ? configSettings.rollNPCLinkedSaves : configSettings.rollNPCSaves);
          promptPlayer = GMprompt !== "auto";
        }
        if ((!player?.isGM && playerMonksTB) || (player?.isGM && gmMonksTB)) {
          promises.push(new Promise((resolve) => {
            let requestId = target.id;
            this.saveRequests[requestId] = resolve;
          }));
          // game.MonksTokenBar.requestRoll([{token:"Thoramir", altKey: true},"John Locke", {token:"Toadvine", fastForward:true}], {request:'perception',dc:15, silent:true, fastForward:false, flavor:'Testing flavor'})
          // record the targes to save.
          // monkRequests.push(target)
          monkRequests.push({
            token: target.id,
            altKey: advantage === true,
            ctrlKey: advantage === false,
            fastForward: false
          })
        } else if (promptPlayer && player?.active) {
          //@ts-ignore CONFIG.DND5E
          if (debugEnabled > 0) warn(`Player ${player?.name} controls actor ${target.actor.name} - requesting ${CONFIG.DND5E.abilities[this.saveItem.data.data.save.ability]} save`);
          promises.push(new Promise((resolve) => {
            let requestId = target.actor?.id ?? randomID();
            const playerId = player?.id;
            if (["letme", "letmeQuery"].includes(configSettings.playerRollSaves) && installedModules.get("lmrtfy")) requestId = randomID();
            if (["letme", "letmeQuery"].includes(GMprompt) && installedModules.get("lmrtfy")) requestId = randomID();

            this.saveRequests[requestId] = resolve;

            requestPCSave(this.saveItem.data.data.save.ability, rollType, player, target.actor, advantage, this.saveItem.name, rollDC, requestId, GMprompt)

            // set a timeout for taking over the roll
            if (configSettings.playerSaveTimeout > 0) {
              this.saveTimeouts[requestId] = setTimeout(async () => {
                if (this.saveRequests[requestId]) {
                  delete this.saveRequests[requestId];
                  delete this.saveTimeouts[requestId];
                  let result;
                  if (!game.user?.isGM && configSettings.autoCheckSaves === "allShow") {
                    // non-gm users don't have permission to create chat cards impersonating the GM so hand the role to a GM client
                    result = await socketlibSocket.executeAsGM("rollAbility", {
                      targetUuid: target.actor?.uuid ?? "",
                      request: rollType,
                      ability: this.saveItem.data.data.save.ability,
                      showRoll,
                      options: { messageData: { user: playerId }, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true },
                    });
                  } else {
                    result = await rollAction.bind(target.actor)(this.saveItem.data.data.save.ability, { messageData: { user: playerId }, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true });
                  }
                  resolve(result);
                }
              }, (configSettings.playerSaveTimeout || 1) * 1000);
            }
          }))
        } else {  // GM to roll save
          // Find a player owner for the roll if possible
          let owner: User | undefined = playerFor(target);
          if (!owner?.isGM && owner?.active) showRoll = true; // Always show player save rolls
          // If no player owns the token, find an active GM
          if (!owner?.active) owner = game.users?.find((u: User) => u.isGM && u.active);
          // Fall back to rolling as the current user
          if (!owner) owner = game.user ?? undefined;
          promises.push(socketlibSocket.executeAsUser("rollAbility", owner?.id, {
            targetUuid: target.actor.uuid,
            request: rollType,
            ability: this.saveItem.data.data.save.ability,
            showRoll,
            options: { messageData: { user: owner?.id }, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true },
          }));
        }
      }
    } catch (err) {
      console.warn(err)
    } finally {
    }

    const requestData: any = {
      tokenData: monkRequests,
      request: `${rollType}:${this.saveItem.data.data.save.ability}`,
      silent: true,
      rollMode: "gmroll",
    }
    if (configSettings.displaySaveDC) requestData.dc = rollDC
    if (monkRequests.length > 0) {
      socketlibSocket.executeAsGM("monksTokenBarSaves", requestData);
    };
    if (debugEnabled > 1) debug("check saves: requests are ", this.saveRequests)
    var results = await Promise.all(promises);

    this.saveResults = results;
    let i = 0;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    // for (let target of this.hitTargets) {
    for (let target of allHitTargets) {
      if (!target.actor) continue; // these were skipped when doing the rolls so they can be skipped now
      if (!results[i]) error("Token ", target, "could not roll save/check assuming 0");
      const result = results[i];
      let rollTotal = results[i]?.total || 0;
      let rollDetail = results[i];
      if (result?.terms[0]?.options?.advantage) this.advantageSaves.add(target);
      if (result?.terms[0]?.options?.disadvantage) this.disadvantageSaves.add(target);
      let isFumble = false;
      let isCritical = false;
      if (rollDetail?.terms && !result.isBR && rollDetail.terms[0]) { // normal d20 roll/lmrtfy/monks roll
        const dterm: DiceTerm = rollDetail.terms[0];
        const diceRoll = dterm?.results?.find(result => result.active)?.result ?? (rollDetail.total);
        //@ts-ignore
        isFumble = diceRoll <= (dterm.options?.fumble ?? 1)
        //@ts-ignore
        isCritical = diceRoll >= (dterm.options?.critical ?? 20);
      } else if (result?.isBR) {
        isCritical = result.isCritical;
        isFumble = result.isFumble;
      }
      let saved = rollTotal >= rollDC;

      if (checkRule("criticalSaves")) { // normal d20 roll/lmrtfy/monks roll
        saved = (isCritical || rollTotal >= rollDC) && !isFumble;
      }
      if (getProperty(this.actor, "data.flags.midi-qol.sculptSpells") && (this.rangeTargeting || this.templateTargeting) && this.item?.data.data.school === "evo" && this.preSelectedTargets.has(target)) {
        saved = true;
        this.superSavers.add(target)
      }
      if (isCritical) this.criticalSaves.add(target);
      if (isFumble && !saved) this.fumbleSaves.add(target);
      if (this.checkSuperSaver(target, this.saveItem.data.data.save.ability))
        this.superSavers.add(target);
      if (this.item.data.flags["midi-qol"]?.isConcentrationCheck) {
        const checkBonus = getProperty(target, "actor.data.flags.midi-qol.concentrationSaveBonus");
        if (checkBonus) {
          const rollBonus = (await new Roll(checkBonus, target.actor?.getRollData()).evaluate({ async: true })).total;
          rollTotal += rollBonus;
          rollDetail = (await new Roll(`${rollDetail.result} + ${rollBonus}`).evaluate({ async: true }));
          saved = rollTotal >= rollDC;
          if (checkRule("criticalSaves")) { // normal d20 roll/lmrtfy/monks roll
            saved = (isCritical || rollTotal >= rollDC) && !isFumble;
          }
        }
      }

      if (saved) {
        this.saves.add(target);
        this.failedSaves.delete(target);
      }

      if (game.user?.isGM) log(`Ability save/check: ${target.name} rolled ${rollTotal} vs ${rollAbility} DC ${rollDC}`);
      let saveString = i18n(saved ? "midi-qol.save-success" : "midi-qol.save-failure");
      let adv = this.advantageSaves.has(target) ? `(${i18n("DND5E.Advantage")})` : "";
      if (this.disadvantageSaves.has(target)) adv = `(${i18n("DND5E.Disadvantage")})`;
      if (game.system.id === "sw5e") {
        adv = this.advantageSaves.has(target) ? `(${i18n("SW5E.Advantage")})` : "";
        if (this.disadvantageSaves.has(target)) adv = `(${i18n("SW5E.Disadvantage")})`;
      }
      let img: string = target.data.img ?? target.actor.img ?? "";
      if (configSettings.usePlayerPortrait && target.actor.data.type === "character")
        img = target.actor?.img ?? target.data.img ?? "";

      if (VideoHelper.hasVideoExtension(img)) {
        img = await game.video.createThumbnail(img, { width: 100, height: 100 });
      }
      let isPlayerOwned = target.actor.hasPlayerOwner;
      this.saveDisplayData.push({
        gmName: target.name,
        playerName: getTokenPlayerName(target),
        img,
        isPC: isPlayerOwned,
        target,
        saveString,
        rollTotal,
        rollDetail,
        id: target.id,
        adv
      });
      i++;
    }

    let DCString = "DC";
    if (game.system.id === "dnd5e") DCString = i18n("DND5E.AbbreviationDC")
    else if (i18n("SW5E.AbbreviationDC") !== "SW5E.AbbreviationDC") {
      DCString = i18n("SW5E.AbbreviationDC");
    }

    if (rollType === "save")
      //@ts-ignore CONFIG.DND5E
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">${DCString} ${rollDC}</label> ${CONFIG.DND5E.abilities[rollAbility]} ${i18n(allHitTargets.size > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw")}:`;
    else if (rollType === "check")
      //@ts-ignore CONFIG.DND5E
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">${DCString} ${rollDC}</label> ${CONFIG.DND5E.abilities[rollAbility]} ${i18n(AllHitTargets.size > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check")}:`;
    else if (rollType === "skill") {
      //@ts-ignore CONFIG.DND5E
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">${DCString} ${rollDC}</label> ${CONFIG.DND5E.skills[rollAbility]} `; // ${i18n(this.hitTargets.size > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check")}:
    }
  }
  monksSavingCheck(message, update, options, user) {
    if (!update.flags || !update.flags["monks-tokenbar"]) return true;
    const mflags = update.flags["monks-tokenbar"];
    for (let key of Object.keys(mflags)) {
      if (!key.startsWith("token")) continue;
      const requestId = key.replace("token", "");
      let roll;
      try {
        roll = Roll.fromJSON(JSON.stringify(mflags[key].roll));
      } catch (err) {
        roll = mflags[key].roll;
      }
      if (this.saveRequests[requestId]) this.saveRequests[requestId](roll)
      delete this.saveRequests[requestId];
    }
    return true;
  }

  processDefenceRoll(message, html, data) {
    if (!this.defenceRequests) return true;
    const isLMRTFY = (installedModules.get("lmrtfy") && message.data.flags?.lmrtfy?.data);
    if (!isLMRTFY || message.data.flags?.dnd5e?.roll?.type === "save") return true;
    const requestId = isLMRTFY ? message.data.flags.lmrtfy.data.requestId : message.data?.speaker?.actor;
    if (debugEnabled > 0) warn("processSaveToll", isLMRTFY, requestId, this.saveRequests)

    if (!requestId) return true;
    if (!this.defenceRequests[requestId]) return true;

    clearTimeout(this.defenceTimeouts[requestId]);
    const handler = this.defenceRequests[requestId]
    delete this.defenceRequests[requestId];
    delete this.defenceTimeouts[requestId];
    const brFlags = message.data.flags?.betterrolls5e;
    if (brFlags) {
      const formula = "1d20";
      const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll");
      if (!rollEntry) return true;
      let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
      let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
      let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
      handler({ total, formula, isBR: true, isCritical: brFlags.isCrit, terms: [{ options: { advantage, disadvantage } }] });
    } else {
      handler(message._roll)
    }
    if (game.user?.id !== message.user.id && ["whisper", "all"].includes(configSettings.autoCheckSaves)) html.hide();
    return true;
  }

  processSaveRoll(message, html, data) {
    if (!this.saveRequests) return {};
    const isLMRTFY = message.data.flags?.lmrtfy?.data;
    const ddbglFlags = message.data.flags && message.data.flags["ddb-game-log"];
    const isDDBGL = ddbglFlags?.cls === "save" && !ddbglFlags?.pending;
    if (!isLMRTFY && !isDDBGL && message.data.flags?.dnd5e?.roll?.type !== "save") return true;
    let requestId = isLMRTFY ? message.data.flags.lmrtfy.data.requestId : message.data?.speaker?.actor;
    if (!requestId && isDDBGL) requestId = message.data?.speaker?.actor;
    if (debugEnabled > 0) warn("processSaveRoll", isLMRTFY, requestId, this.saveRequests)
    if (!requestId) return true;

    if (!this.saveRequests[requestId]) return true;

    if (this.saveRequests[requestId]) {
      clearTimeout(this.saveTimeouts[requestId]);
      const handler = this.saveRequests[requestId]
      delete this.saveRequests[requestId];
      delete this.saveTimeouts[requestId];
      const brFlags = message.data.flags?.betterrolls5e;
      if (brFlags) {
        const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll");
        if (!rollEntry) return true;
        let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
        let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
        let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
        const formula = rollEntry.formula ?? "1d20";
        handler({ total, formula, isBR: true, isCritical: brFlags.isCrit, terms: [{ options: { advantage, disadvantage } }] });
      } else {
        handler(message._roll)
      }
    }
    if (game.user?.id !== message.user.id && ["whisper", "all"].includes(configSettings.autoCheckSaves)) html.hide();
    return true;
  }

  checkSuperSaver(token, ability: string) {
    const actor = token.actor;
    const flags = getProperty(actor.data.flags, "midi-qol.superSaver");
    if (!flags) return false;
    if (flags?.all) return true;
    if (getProperty(flags, `${ability}`)) return true;
    if (this.actor?.items.getName("Sculpt Spells") && this.item?.data.school === "evo" && this.preSlectedTargets.has(token)) {
      return true;
    }
    return false;
  }

  processBetterRollsChatCard(message, html, data) {
    const brFlags = message.data.flags?.betterrolls5e;
    if (!brFlags) return true;
    if (debugEnabled > 1) debug("processBetterRollsChatCard", message.html, data)
    const requestId = message.data.speaker.actor;
    if (!this.saveRequests[requestId]) return true;
    const formula = "1d20";
    const isSave = brFlags.fields.find(e => e[0] === "check");
    if (!isSave) return true;
    const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll");
    let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
    let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
    let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
    clearTimeout(this.saveTimeouts[requestId]);
    this.saveRequests[requestId]({ total, formula, terms: [{ options: { advantage, disadvantage } }] });
    delete this.saveRequests[requestId];
    delete this.saveTimeouts[requestId];
    if (game.user?.id !== message.user.id && ["whisper", "all"].includes(configSettings.autoCheckSaves)) html.hide();
    return true;
  }

  processAttackRoll() {
    if (!this.attackRoll) return;
    const terms = this.attackRoll.terms;
    if (terms[0] instanceof NumericTerm) {
      this.diceRoll = Number(terms[0].total);
    } else {
      this.diceRoll = Number(terms[0].total)
      //TODO find out why this is using results - seems it should just be the total
      // this.diceRoll = terms[0].results.find(d => d.active).result;
    }
    //@ts-ignore
    //@ts-ignore .critical undefined
    this.isCritical = this.diceRoll >= this.attackRoll.terms[0].options.critical;
    if (isNewerVersion("1.5.0", game.system.data.version) || useMidiCrit) {
      if (getProperty(this, "item.data.flags.midi-qol.criticalThreshold") ?? 20 < 20) {
        this.isCritical = this.isCritical || this.diceRoll >= getProperty(this, "item.data.flags.midi-qol.criticalThreshold");
      }
    }
    //@ts-ignore .fumble undefined
    this.isFumble = this.diceRoll <= this.attackRoll.terms[0].options.fumble;
    this.attackTotal = this.attackRoll.total ?? 0;
    if (debugEnabled > 1) debug("processAttackRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble)
  }

  async checkHits() {
    let isHit = true;
    let isHitEC = false;

    let item = this.item;

    // check for a hit/critical/fumble
    if (item?.data.data.target?.type === "self") {
      this.targets = getSelfTargetSet(this.actor);
    }
    if (!this.useActiveDefence) {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set(); //TO wonder if this can work with active defence?
    };
    this.hitDisplayData = [];
    for (let targetToken of this.targets) {
      let targetName = configSettings.useTokenNames && targetToken.name ? targetToken.name : targetToken.actor?.name;
      let targetActor: Actor5e = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      let targetAC = Number.parseInt(targetActor.data.data.attributes.ac.value ?? 10);
      let targetEC = targetActor.data.data.attributes.ac.EC ?? 0;
      let targetAR = targetActor.data.data.attributes.ac.AR ?? 0;
      const bonusAC = getProperty(targetActor.data, "flags.midi-qol.acBonus") ?? 0;

      isHit = false;
      isHitEC = false;
      if (this.useActiveDefence) {
        isHit = this.hitTargets.has(targetToken);
      } else {
        targetAC += bonusAC;
        if (!this.isFumble) {
          if (checkRule("challengeModeArmor")) isHit = this.attackTotal > targetAC || this.isCritical;
          else isHit = this.attackTotal >= targetAC || this.isCritical;
          if (targetEC) isHitEC = checkRule("challengeModeArmor") && this.attackTotal <= targetAC && this.attackTotal >= targetEC;
          // check to see if the roll hit the target
          if ((isHit || isHitEC || this.iscritical) && this.attackRoll && !getProperty(this, "item.data.flags.midi-qol.noProvokeReaction")) {
            const result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reaction", { item: this.item });
            if (result?.name) {
              targetActor.prepareData(); // allow for any items applied to the actor - like shield spell
            }
            targetAC = Number.parseInt(targetActor.data.data.attributes.ac.value) + bonusAC;
            if (targetEC) targetEC = targetActor.data.data.attributes.ac.EC + bonusAC;
            if (result.ac) targetAC = result.ac + bonusAC; // deal with bonus ac if any.
            if (targetEC) targetEC = targetAC - targetAR;
            isHit = this.attackTotal >= targetAC || this.isCritical;
            if (checkRule("challengeModeArmor")) isHit = this.attackTotal >= targetAC || this.isCritical;
            if (targetEC) isHitEC = checkRule("challengeModeArmor") && this.attackTotal <= targetAC && this.attackTotal >= targetEC;
          }
        }
        let scale = 100;
        if (checkRule("challengeModeArmorScale") && !this.isCritical) scale = Math.floor((this.attackTotal - targetEC + 1) / ((targetActor?.data.data.attributes.ac.AR ?? 0) + 1) * 10) / 10;
        setProperty(targetToken.actor?.data ?? {}, "flags.midi-qol.challengeModeScale", scale);
        if (this.isCritical) isHit = true;
        if (isHit || isHitEC || this.isCritical) this.processCriticalFlags();
        setProperty(targetActor.data, "flags.midi-qol.acBonus", 0);
      }
      if (game.user?.isGM) log(`${this.speaker.alias} Rolled a ${this.attackTotal} to hit ${targetName}'s AC of ${targetAC} ${(isHit || this.isCritical) ? "hitting" : "missing"}`);
      // Log the hit on the target
      let attackType = ""; //item?.name ? i18n(item.name) : "Attack";

      let hitScale = 100;
      if (checkRule("challengeModeArmorScale") && !this.isCritical) hitScale = Math.floor((getProperty(targetToken.actor?.data ?? {}, "flags.midi-qol.challengeModeScale") ?? 1) * 100);
      let hitString;
      if (this.isCritical) hitString = i18n("midi-qol.criticals");
      else if (this.isFumble) hitString = i18n("midi-qol.fumbles");
      else if (isHit) hitString = i18n("midi-qol.hits");
      else if (isHitEC && checkRule("challengeModeArmor") && checkRule("challengeModeArmorScale")) hitString = `${i18n("midi-qol.hitsEC")} (${hitScale}%)`;
      else if (isHitEC) hitString = `${i18n("midi-qol.hitsEC")}`;
      else hitString = i18n("midi-qol.misses");
      let img = targetToken.data?.img || targetToken.actor?.img;
      if (configSettings.usePlayerPortrait && targetToken.actor?.data.type === "character")
        img = targetToken.actor?.img || targetToken.data.img;
      if (VideoHelper.hasVideoExtension(img ?? "")) {
        img = await game.video.createThumbnail(img ?? "", { width: 100, height: 100 });
      }
      // If using active defence hitTargets are up to date already.
      if (this.useActiveDefence) {
        if (this.activeDefenceRolls[targetToken.document.uuid]) {
          if (targetToken.actor?.type === "character") {
            hitString = `(${this.activeDefenceRolls[targetToken.document.uuid].result}): ${hitString}`
          } else {
            hitString = `(${this.activeDefenceRolls[targetToken.document.uuid].total}): ${hitString}`
          }
        }

      } else {
        if (isHit || this.isCritical) this.hitTargets.add(targetToken);
        if (isHitEC) this.hitTargetsEC.add(targetToken);
      }
      this.hitDisplayData.push({ isPC: targetToken.actor?.hasPlayerOwner, target: targetToken, hitString, attackType, img, gmName: targetToken.name, playerName: getTokenPlayerName(targetToken), bonusAC });
    }
  }

  setRangedTargets(targetDetails) {
    const token = getCanvas().tokens?.get(this.speaker.token);
    if (!token) {
      ui.notifications?.warn(`${game.i18n.localize("midi-qol.noSelection")}`)
      return true;
    }
    // We have placed an area effect template and we need to check if we over selected
    let dispositions = targetDetails.type === "creature" ? [-1, 0, 1] : targetDetails.type === "ally" ? [token.data.disposition] : [-token.data.disposition];
    // release current targets
    game.user?.targets.forEach(t => {
      //@ts-ignore
      t.setTarget(false, { releaseOthers: false });
    });
    game.user?.targets.clear();
    // min dist is the number of grid squares away.
    let minDist = targetDetails.value;
    const canvas = getCanvas();
    const targetIds: string[] = [];
    if (canvas.tokens?.placeables && canvas.grid) {
      for (let target of canvas.tokens.placeables) {
        const ray = new Ray(target.center, token.center);
        const actorData: any = target.actor?.data;
        if (actorData?.data.details.type?.custom === "NoTarget") continue;
        const wallsBlocking = ["wallsBlock", "wallsBlockIgnoreDefeated"].includes(configSettings.rangeTarget)
        let inRange = target.actor && actorData?.data.details.race !== "trigger"
          // && target.actor.id !== token.actor?.id
          && dispositions.includes(target.data.disposition)
          //@ts-ignore attributes
          && (["always", "wallsBlock"].includes(configSettings.rangeTarget) || target.actor?.data.data.attributes.hp.value > 0)
        // && (["always", "wallsBlock"].includes(configSettings.rangeTarget) || target.actor?.data.data.attributes.hp.value > 0)
        if (inRange) {
          // if the item specifies a range of "special" don't target the caster.
          let selfTarget = (this.item?.data.data.range?.units === "spec") ? getCanvas().tokens?.get(this.tokenId) : null;
          if (selfTarget === target) {
            inRange = false;
          }
          const distance = getDistanceSimple(target, token, false, wallsBlocking);
          inRange = inRange && distance >= 0 && distance <= minDist
        }
        if (inRange) {
          target.setTarget(true, { user: game.user, releaseOthers: false });
          if (target.document.id) targetIds.push(target.document.id);
        }
      }
      this.targets = game.user?.targets ?? new Set();
      this.saves = new Set();
      this.failedSaves = new Set(this.targets)
      this.hitTargets = new Set(this.targets);
      this.hitTargetsEC = new Set();
      game.user?.broadcastActivity({ targets: targetIds });
    }
    return true;
  }

  async removeActiveEffects(effectIds: string | [string]) {
    if (!Array.isArray(effectIds)) effectIds = [effectIds];
    this.actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
  }

  async removeItemEffects(uuid: Item | string = this.item?.uuid) {
    if (!uuid) {
      error("Cannot remove effects when no item specified")
      return;
    }
    if (uuid instanceof Item) uuid = uuid.uuid;
    const filtered = this.actor.effects.reduce((filtered, ef) => {
      if (ef.data.origin === uuid) filtered.push(ef.id);
      return filtered;
    }, []);
    if (filtered.length > 0) this.removeActiveEffects(filtered);
  }

  async activeDefence(item, roll) {

    // For each target do a LMRTFY custom roll DC 11 + attackers bonus - for gm tokens always auto roll
    // Roll is d20 + AC - 10
    let hookId = Hooks.on("renderChatMessage", this.processDefenceRoll.bind(this));
    try {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set();
      this.defenceRequests = {};
      this.defenceTimeouts = {};
      this.activeDefenceRolls = {};
      this.isCritical = false;
      this.isFumble = false;
      // Get the attack bonus for the attack
      const attackBonus = roll.total - roll.dice[0].total; // TODO see if there is a better way to work out roll plusses
      await this.checkActiveAttacks(attackBonus, false, 20 - (roll.options.fumble ?? 1) + 1, 20 - (roll.options.critical ?? 20) + 1);
    } finally {
      Hooks.off("renderChatMessage", hookId);
    }
    return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);
  }
  get useActiveDefence() {
    //@ts-ignore
    return game.user.isGM && checkRule("activeDefence") && ["Workflow"].includes(this.workflowType) && installedModules.get("lmrtfy");
  }
  async checkActiveAttacks(attackBonus = 0, whisper = false, fumbleTarget, criticalTarget) {
    if (debugEnabled > 1) debug(`active defence : whisper ${whisper}  hit targets ${this.targets}`)
    if (this.targets.size <= 0) {
      return;
    }
    this.activeDefenceDC = 11 + attackBonus;

    let promises: Promise<any>[] = [];
    //@ts-ignore actor.rollAbilitySave
    var rollAction = CONFIG.Actor.documentClass.prototype.rollAbilitySave;

    let showRoll = configSettings.autoCheckSaves === "allShow";
    for (let target of this.targets) {
      if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
      let advantage: Boolean | undefined = undefined;
      // If spell, check for magic resistance

      //@ts-ignore
      const formula = `1d20 + ${target.actor.data.data.attributes.ac.value - 10}`;
      // Advantage/Disadvantage are reveresed for active defence rolls.
      let advantageMode = game[game.system.id].dice.D20Roll.ADV_MODE.NORMAL;
      if (this.rollOptions.advantage && !this.rollOptions.disadvantage) advantageMode = game[game.system.id].dice.D20Roll.ADV_MODE.DISADVANTAGE;
      if (!this.rollOptions.advantaage && this.rollOptions.disadvantage) advantageMode = game[game.system.id].dice.D20Roll.ADV_MODE.ADVANTAGE;
      var player = playerFor(target);
      // if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
      //@ts-ignore CONFIG.DND5E
      if (debugEnabled > 0) warn(`Player ${player?.name} controls actor ${target.actor.name} - requesting ${CONFIG.DND5E.abilities[this.saveItem.data.data.save.ability]} save`);
      if (player && player.active && !player.isGM) {
        promises.push(new Promise((resolve) => {
          const requestId = target.actor?.uuid ?? randomID();
          const playerId = player?.id;
          this.defenceRequests[requestId] = resolve;
          requestPCActiveDefence(player, target.actor, advantage, this.item.name, this.activeDefenceDC, formula, requestId)
          // set a timeout for taking over the roll
          if (configSettings.playerSaveTimeout > 0) {
            this.defenceTimeouts[requestId] = setTimeout(async () => {
              if (this.defenceRequests[requestId]) {
                delete this.defenceRequests[requestId];
                delete this.defenceTimeouts[requestId];
                const result = await (new game[game.system.id].dice.D20Roll(formula, {}, { advantageMode })).roll({ aysnc: true });
                result.toMessage({ flavor: `${this.item.name} ${i18n("midi-qol.ActiveDefenceString")}` });
                resolve(result);
              }
            }, configSettings.playerSaveTimeout * 1000);
          }
        }));
      } else {  // must be a GM so can do the roll direct
        promises.push(
          new Promise(async (resolve) => {
            const result = await (new game[game.system.id].dice.D20Roll(formula, {}, { advantageMode })).roll({ async: true })
            if (dice3dEnabled() && target.actor?.type === "character") {
              //@ts-ignore
              await game.dice3d.showForRoll(result, game.user, true, [], false)
            }
            resolve(result);
          })
        );
      }
    }
    if (debugEnabled > 1) debug("check saves: requests are ", this.saveRequests)
    var results = await Promise.all(promises);

    this.rollResults = results;
    let i = 0;
    for (let target of this.targets) {
      if (!target.actor) continue; // these were skipped when doing the rolls so they can be skipped now
      if (!results[i]) error("Token ", target, "could not roll active defence assuming 0");
      const result = results[i];
      let rollTotal = results[i]?.total || 0;
      if (this.critical === undefined) this.isCritical = result.dice[0].total <= criticalTarget
      if (this.fumble === undefined) this.isFumble = result.dice[0].total >= fumbleTarget;
      this.activeDefenceRolls[target.document.uuid] = results[i];
      let hit = this.isCritical || rollTotal < this.activeDefenceDC;
      if (hit) {
        this.hitTargets.add(target);
      } else this.hitTargets.delete(target);
      if (game.user?.isGM) log(`Ability active defemce: ${target.name} rolled ${rollTotal} vs attack DC ${this.activeDefenceDC}`);
      i++;
    }
  }
}

export class DamageOnlyWorkflow extends Workflow {
  constructor(actor: Actor5e, token: Token, damageTotal: number, damageType: string, targets: [Token], roll: Roll,
    options: { flavor: string, itemCardId: string, damageList: [], useOther: boolean, itemData: {}, isCritical: boolean }) {
    super(actor, null, ChatMessage.getSpeaker({ token }), new Set(targets), shiftOnlyEvent)
    this.itemData = options.itemData;
    // Do the supplied damageRoll
    this.damageRoll = roll;
    this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: damageType });
    this.damageTotal = damageTotal;
    this.flavor = options.flavor;
    //@ts-ignore CONFIG.DND5E
    this.defaultDamageType = CONFIG.DND5E.damageTypes[damageType] || damageType;
    this.damageList = options.damageList;
    this.itemCardId = options.itemCardId;
    this.useOther = options.useOther ?? true;
    this.isCritical = options.isCritical ?? false;
    this.kickStart = false;
    return this.next(WORKFLOWSTATES.NONE);
    //return this;
  }

  get workflowType() { return this.__proto__.constructor.name };
  get damageFlavor() {
    if (this.useOther && this.flavor) return this.flavor;
    else return super.damageFlavor;
  }

  async _next(newState) {
    this.currentState = newState;
    if (debugEnabled > 0) warn("Newstate is ", newState)
    let state = stateToLabel(this.currentState);
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        this.effectsAlreadyExpired = [];
        if (this.itemData) {
          this.itemData.effects = this.itemData.effects.map(e => duplicate(e))
          this.item = new CONFIG.Item.documentClass(this.itemData, { parent: this.actor });
          setProperty(this.item, "data.flags.midi-qol.onUseMacroName", null);
        } else this.item = null;
        if (this.itemCardId === "new" && this.item) { // create a new chat card for the item
          this.createCount += 1;
          this.itemCard = await showItemCard.bind(this.item)(false, this, true);
          this.itemCardId = this.itemCard.id;
          // Since this could to be the same itfem don't roll the on use macro, since this could loop forever
        }

        // Need to pretend there was an attack roll so that hits can be registered and the correct string created
        // TODO separate the checkHit()/create hit display Data and displayHits() into 3 spearate functions so we don't have to pretend there was a hit to get the display
        this.isFumble = false;
        this.attackTotal = 9999;
        await this.checkHits();
        const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
        await this.displayHits(whisperCard, configSettings.mergeCard && this.itemCardId);

        if (configSettings.mergeCard && this.itemCardId) {
          this.damageRollHTML = await this.damageRoll?.render() ?? "";
          this.damageCardData = {
            //@ts-ignore ? flavor TODO
            flavor: "damage flavor",
            roll: this.damageRoll ?? null,
            speaker: this.speaker
          }
          await this.displayDamageRoll(configSettings.mergeCard && this.itemCardId)
        } else await this.damageRoll?.toMessage({ flavor: this.flavor });
        this.hitTargets = new Set(this.targets);
        this.hitTargetsEC = new Set();
        this.applicationTargets = new Set(this.targets);
        this.damageList = await applyTokenDamage(this.damageDetail, this.damageTotal, this.targets, this.item, new Set(), { existingDamage: this.damageList, superSavers: new Set() })
        await super._next(WORKFLOWSTATES.ROLLFINISHED);

        Workflow.removeWorkflow(this.uuid);
        return this;

      default: return super.next(newState);
    }
  }
}

export class TrapWorkflow extends Workflow {

  trapSound: { playlist: string, sound: string } | undefined;
  templateLocation: { x: number, y: number, direction: number, removeDelay: number } | undefined;
  saveTargets: any;

  constructor(actor: Actor5e, item: Item5e, targets: [Token],
    templateLocation: { x: number, y: number, direction: number, removeDelay: number } | undefined = undefined,
    trapSound: { playlist: string, sound: string } | undefined = undefined, event: any = null) {
    super(actor, item, ChatMessage.getSpeaker({ actor }), new Set(targets), event);
    // this.targets = new Set(targets);
    if (!this.event) this.event = duplicate(shiftOnlyEvent);
    this.trapSound = trapSound;
    this.templateLocation = templateLocation;
    // this.saveTargets = game.user.targets; 
    this.rollOptions.fastForward = true;
    this.kickStart = false;
    this.next(WORKFLOWSTATES.NONE)
  }

  async _next(newState: number) {
    this.currentState = newState;
    let state = stateToLabel(newState);
    if (debugEnabled > 0) warn(this.workflowType, " attack ", state, this.uuid, this.targets)
    switch (newState) {
      case WORKFLOWSTATES.NONE:
        this.saveTargets = await validTargetTokens(game.user?.targets);
        this.effectsAlreadyExpired = [];
        this.onUseMacroCalled = false;
        this.itemCardId = (await showItemCard.bind(this.item)(false, this, true))?.id;
        //@ts-ignore TOODO this is just wrong fix
        if (this.trapSound) AudioHelper.play({ src: this.trapSound }, false)
        if (debugEnabled > 1) debug(" workflow.none ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
        // don't support the placement of a tempalte
        return await this.next(WORKFLOWSTATES.AWAITTEMPLATE);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        const targetDetails = this.item.data.data.target;
        if (configSettings.rangeTarget !== "none" && ["m", "ft"].includes(targetDetails?.units) && ["creature", "ally", "enemy"].includes(targetDetails?.type)) {
          this.setRangedTargets(targetDetails);
          this.targets = await validTargetTokens(this.targets);
          this.failedSaves = new Set(this.targets)
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          return await this.next(WORKFLOWSTATES.TEMPLATEPLACED);
        }
        if (!this.item.hasAreaTarget || !this.templateLocation) return this.next(WORKFLOWSTATES.TEMPLATEPLACED)
        //@ts-ignore
        // this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
        const TemplateClass = game[game.system.id].canvas.AbilityTemplate;
        const templateData = TemplateClass.fromItem(this.item).data.toObject();
        // template.draw();
        // get the x and y position from the trapped token
        templateData.x = this.templateLocation.x || 0;
        templateData.y = this.templateLocation.y || 0;
        templateData.direction = this.templateLocation.direction || 0;

        // Create the template
        let templates = await getCanvas().scene?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
        if (templates) {
          const templateDocument: any = templates[0];
          templateTokens({ x: templateDocument.data.x, y: templateDocument.data.y, shape: templateDocument.object.shape, distance: templateDocument.data.distance })
          selectTargets.bind(this)(templates[0], null, game.user?.id); // Target the tokens from the template
          if (this.templateLocation?.removeDelay) {
            //@ts-ignore _ids
            let ids: string[] = templates.map(td => td._id)
            //TODO test this again
            setTimeout(() => getCanvas().scene?.deleteEmbeddedDocuments("MeasuredTemplate", ids), this.templateLocation.removeDelay * 1000);
          }
        }
        return await this.next(WORKFLOWSTATES.TEMPLATEPLACED);

      case WORKFLOWSTATES.TEMPLATEPLACED:
        if (debugEnabled > 1) debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
        // perhaps auto place template?
        this.needTemplate = false;
        return await this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.VALIDATEROLL:
        // do pre roll checks
        if (debugEnabled > 1) debug(" workflow.next ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
        return await this.next(WORKFLOWSTATES.WAITFORATTACKROLL);

      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (!this.item.hasAttack) {
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          return await this.next(WORKFLOWSTATES.WAITFORSAVES);
        }
        if (debugEnabled > 0) warn("attack roll ", this.event)
        this.item.rollAttack({ event: this.event });
        return;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.processAttackRoll();
        await this.displayAttackRoll(configSettings.mergeCard);
        await this.checkHits();
        const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
        await this.displayHits(whisperCard, configSettings.mergeCard);
        return await this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        if (!this.saveItem.hasSave) {
          this.saves = new Set(); // no saving throw, so no-one saves
          const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
          this.failedSaves = new Set(allHitTargets);
          return await this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
        let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
        let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
        try {
          await this.checkSaves(true);
        } finally {
          Hooks.off("renderChatMessage", hookId);
          Hooks.off("renderChatMessage", brHookId);
          Hooks.off("updateChatMessage", monksId)
        }
        //@ts-ignore ._hooks not defined
        if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
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
        if (debugEnabled > 1) debug("TrapWorkflow: Rolling damage ", this.event, this.itemLevel, this.rollOptions.versatile, this.targets, this.hitTargets);
        this.rollOptions.critical = this.isCritical;
        this.rollOptions.fastForward = true;
        this.item.rollDamage(this.rollOptions);
        return; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        if (!this.item.hasAttack) { // no attack roll so everyone is hit
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          if (debugEnabled > 0) warn(" damage roll complete for non auto target area effects spells", this)
        }

        // If the item does damage, use the same damage type as the item
        let defaultDamageType = this.item?.data.data.damage?.parts[0][1] || this.defaultDamageType;
        this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: defaultDamageType });
        // apply damage to targets plus saves plus immunities
        await this.displayDamageRoll(configSettings.mergeCard)
        if (this.isFumble) {
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);

      case WORKFLOWSTATES.ALLROLLSCOMPLETE:
        if (debugEnabled > 1) debug("all rolls complete ", this.damageDetail)
        if (this.damageDetail.length) await processDamageRoll(this, this.damageDetail[0].type)
        return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);

      case WORKFLOWSTATES.ROLLFINISHED:
        // area effect trap, put back the targets the way they were
        if (this.saveTargets && this.item.hasAreaTarget) {
          game.user?.targets.forEach(t => {
            t.setTarget(false, { releaseOthers: false });
          });
          game.user?.targets.clear();
          this.saveTargets.forEach(t => {
            t.setTarget(true, { releaseOthers: false })
            game.user?.targets.add(t)
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

  static get(id: string): BetterRollsWorkflow {
    return Workflow._workflows[id];
  }

  constructor(actor: Actor5e, item: Item5e, speaker, targets, options: any) {
    super(actor, item, speaker, targets, options);
    this.needTemplate = this.item?.hasAreaTarget ?? false;
    this.needItemCard = true;
    this.damageRolled = !game.settings.get("betterrolls5e", "damagePromptEnabled");
    if (this.needTemplate) this.placeTemlateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
  }
  /**
   * Retrieves the BetterRolls CustomItemRoll object from the related chat message 
   */
  get roll() {
    if (this._roll) return this._roll;

    const message = game.messages?.get(this.itemCardId ?? "") ?? {} as object;
    if ("BetterRollsCardBinding" in message) {
      this._roll = message["BetterRollsCardBinding"].roll;
      return this._roll;
    }
  }

  async _next(newState) {
    this.currentState = newState;
    let state = stateToLabel(this.currentState);
    if (debugEnabled > 0) warn(this.workflowType, "workflow.next ", state, configSettings.speedItemRolls, this)

    switch (newState) {
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        // since this is better rolls as soon as we are ready for the attack roll we have both the attack roll and damage
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
        }

        if (Hooks.call("midi-qol.preAttackRollComplete", this) === false) {
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        };
        return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.effectsAlreadyExpired = [];
        if (checkRule("removeHiddenInvis")) removeHiddenInvis.bind(this)();
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preCheckhits"), "OnUse", "preCheckhits");
        }
        Hooks.callAll("midi-qol.preCheckHits", this);
        if (debugEnabled > 1) debug(this.attackRollHTML)
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        }
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
        }
        Hooks.callAll("midi-qol.AttackRollComplete", this);
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageRoll"), "OnUse", "preDamageRoll");
        }
        // better rolls usually have damage rolled, but we might have to show it

        if (!this.damageRolled) {
          // wait for damage roll
          return;
        }
        if (this.shouldRollDamage) {
          this.roll?.rollDamage();
        }
        const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
        this.failedSaves = new Set(allHitTargets);
        if (!itemHasDamage(this.item)) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        else return this.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        if (this.critflagSet) {
          this.roll?.forceCrit();
        }
        if (configSettings.allowUseMacro && this.item?.data.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
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
          if (game.system.id === "sw5e") setProperty(messageData, "flags.sw5e.roll.type", "damage");

          //  Not required as we pick up the damage from the better rolls data this.otherDamageRoll.toMessage(messageData);
          this.otherDamageDetail = createDamageList({ roll: this.otherDamageRoll, item: null, versatile: false, defaultType: "" });

        } else this.otherDamageDetail = [];
        if (this.bonusDamageRoll) {
          const messageData = {
            flavor: this.bonusDamageFlavor,
            speaker: this.speaker
          }
          setProperty(messageData, "flags.dnd5e.roll.type", "damage");
          if (game.system.id === "sw5e") setProperty(messageData, "flags.sw5e.roll.type", "damage");
          this.bonusDamageRoll.toMessage(messageData);
        }
        expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);

        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = await validTargetTokens(game.user?.targets);
          this.hitTargets = await validTargetTokens(game.user?.targets);
          this.hitTargetsEC = new Set();
        }
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) { //TODO: Is this right?
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (this.saveItem.hasSave) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE)

      case WORKFLOWSTATES.ROLLFINISHED:
        if (this.placeTemlateHookId) Hooks.off("createMeasuredTemplate", this.placeTemlateHookId)
        await this.complete();
        super._next(WORKFLOWSTATES.ROLLFINISHED);
        // should remove the apply effects button.
        Workflow.removeWorkflow(this.item.uuid)
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

export class DDBGameLogWorkflow extends Workflow {
  DDBGameLogHookId: number;

  static get(id: string): DDBGameLogWorkflow {
    return Workflow._workflows[id];
  }

  constructor(actor: Actor5e, item: Item5e, speaker, targets, options: any) {
    super(actor, item, speaker, targets, options);
    this.needTemplate = this.item?.hasAreaTarget ?? false;
    this.needItemCard = false;
    this.damageRolled = false;
    this.attackRolled = !item.hasAttack;
    // for dnd beyond only roll if other damge is defined.
    this.needsOtherDamage = this.item.data.data.formula && shouldRollOtherDamage.bind(this.item)(this, configSettings.rollOtherDamage, configSettings.rollOtherSpellDamage);
    this.kickStart = true;
    this.flagTags = { "ddb-game-log": { "midi-generated": true } }
  }

  async _next(newState) {
    this.currentState = newState;
    let state = stateToLabel(this.currentState);
    if (debugEnabled > 0) warn("betterRolls workflow.next ", state, configSettings.speedItemRolls, this)

    switch (newState) {
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (!this.attackRolled) return;
        if (Hooks.call("midi-qol.preAttackRollComplete", this) === false) {
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        };
        return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.effectsAlreadyExpired = [];
        if (checkRule("removeHiddenInvis")) removeHiddenInvis.bind(this)();
        Hooks.callAll("midi-qol.preCheckHits", this);
        if (debugEnabled > 1) debug(this.attackRollHTML)
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        }
        Hooks.callAll("midi-qol.AttackRollComplete", this);
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        if (!this.item.hasAreaTarget) return super.next(WORKFLOWSTATES.AWAITTEMPLATE)
        //@ts-ignore
        let dnd5e: any = game.dnd5e;
        // Create the template
        const template = dnd5e.canvas.AbilityTemplate.fromItem(this.item);
        if (template) template.drawPreview();
        return await super._next(WORKFLOWSTATES.AWAITTEMPLATE);

      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        if (!this.damageRolled) return;
        if (this.needsOtherDamage) return;
        const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
        this.failedSaves = new Set(allHitTargets);
        if (!itemHasDamage(this.item)) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        return this.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        this.defaultDamageType = this.item.data.data.damage?.parts[0][1] || this.defaultDamageType || MQdefaultDamageType;
        //@ts-ignore CONFIG.DND5E
        if (this.item?.data.data.actionType === "heal" && !Object.keys(CONFIG.DND5E.healingTypes).includes(this.defaultDamageType)) this.defaultDamageType = "healing";

        this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: this.defaultDamageType });

        const damageBonusMacro = getProperty(this.actor.data.flags, "dnd5e.DamageBonusMacro");
        if (damageBonusMacro) {
          await this.rollBonusDamage(damageBonusMacro);
        }
        /* probably not
                if (this.otherDamageRoll) {
                  const messageData = {
                    flavor: this.otherDamageFlavor ?? this.damageFlavor,
                    speaker: this.speaker
                  }
                  setProperty(messageData, "flags.dnd5e.roll.type", "damage");
                  if (game.system.id === "sw5e") setProperty(messageData, "flags.sw5e.roll.type", "damage");
        
                  //  Not required as we pick up the damage from the better rolls data this.otherDamageRoll.toMessage(messageData);
                  this.otherDamageDetail = createDamageList({roll: this.otherDamageRoll, item: null, versatile: false, defaultType: ""});
        
                } else this.otherDamageDetail = [];
            */
        this.otherDamageDetail = [];
        if (this.bonusDamageRoll) {
          const messageData = {
            flavor: this.bonusDamageFlavor,
            speaker: this.speaker
          }
          setProperty(messageData, "flags.dnd5e.roll.type", "damage");
          if (game.system.id === "sw5e") setProperty(messageData, "flags.sw5e.roll.type", "damage");
          this.bonusDamageRoll.toMessage(messageData);
        }
        expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);

        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = await validTargetTokens(game.user?.targets);
          this.hitTargets = await validTargetTokens(game.user?.targets);
          this.hitTargetsEC = new Set();
        }
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) { //TODO: Is this right?
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (this.saveItem.hasSave) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE)

      case WORKFLOWSTATES.ROLLFINISHED:
        if (this.placeTemlateHookId) Hooks.off("createMeasuredTemplate", this.placeTemlateHookId)
        super._next(WORKFLOWSTATES.ROLLFINISHED);
        // should remove the apply effects button.
        Workflow.removeWorkflow(this.item.uuid)
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
    super(actor, item, speaker, targets, options);
    this.advantage = options?.advantage;
    this.disadvantage = options?.disadvantage
    this.rollOptions.fastForward = options?.fastForward;
    this.rollOptions.fastForwardKey = options?.fastFowrd;
  }

  async _next(newState: number) {
    Workflow.removeWorkflow(this.item.id);
    return await 0;
  }
}

