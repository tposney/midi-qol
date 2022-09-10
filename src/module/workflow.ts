import { warn, debug, log, i18n, MESSAGETYPES, error, MQdefaultDamageType, debugEnabled, timelog, checkConcentrationSettings, getCanvas, MQItemMacroLabel, debugCallTiming } from "../midi-qol.js";
import { activationConditionToUse, selectTargets, shouldRollOtherDamage, showItemCard, templateTokens } from "./itemhandling.js";
import { socketlibSocket, timedAwaitExecuteAsGM, timedExecuteAsGM } from "./GMAction.js";
import { dice3dEnabled, installedModules } from "./setupModules.js";
import { configSettings, autoRemoveTargets, checkRule, autoFastForwardAbilityRolls } from "./settings.js";
import { createDamageList, processDamageRoll, untargetDeadTokens, getSaveMultiplierForItem, requestPCSave, applyTokenDamage, checkRange, checkIncapacitated, getAutoRollDamage, isAutoFastAttack, isAutoFastDamage, getAutoRollAttack, itemHasDamage, getRemoveDamageButtons, getRemoveAttackButtons, getTokenPlayerName, checkNearby, hasCondition, getDistance, removeInvisible, expireMyEffects, validTargetTokens, getSelfTargetSet, doReactions, playerFor, addConcentration, getDistanceSimple, requestPCActiveDefence, evalActivationCondition, playerForActor, getLateTargeting, processDamageRollBonusFlags, asyncHooksCallAll, asyncHooksCall, findNearby, MQfromUuid, midiRenderRoll, markFlanking, canSense, getSystemCONFIG, tokenForActor, getSelfTarget, createConditionData, evalCondition, removeHidden, ConcentrationData } from "./utils.js"
import { OnUseMacros } from "./apps/Item.js";
import { bonusCheck, collectBonusFlags, procAdvantage, procAutoFail } from "./patching.js";
import { mapSpeedKeys } from "./MidiKeyManager.js";
import { SystemData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/packages.mjs";
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
  AWAITITEMCARD: 3,
  TEMPLATEPLACED: 4,
  LATETARGETING: 5,
  VALIDATEROLL: 6,
  PREAMBLECOMPLETE: 7,
  WAITFORATTACKROLL: 8,
  ATTACKROLLCOMPLETE: 9,
  WAITFORDAMAGEROLL: 10,
  DAMAGEROLLCOMPLETE: 11,
  WAITFORSAVES: 12,
  SAVESCOMPLETE: 13,
  ALLROLLSCOMPLETE: 14,
  APPLYDYNAMICEFFECTS: 15,
  ROLLFINISHED: 16
};

function stateToLabel(state: number) {
  let theState = Object.entries(WORKFLOWSTATES).find(a => a[1] === state);
  return theState ? theState[0] : "Bad State";
}

export const defaultRollOptions = {
  advantage: false,
  disadvantage: false,
  versatile: false,
  fastForward: false,
  other: false
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
  //@ts-ignore dnd5e v10
  actor: globalThis.dnd5e.documents.Actor5e;
  //@ts-ignore dnd5e v10
  item: globalThis.dnd5e.documents.Item5e;
  itemCardId: string | undefined | null;
  itemCardData: {};
  displayHookId: number | null;
  templateElevation: number;

  event: { shiftKey: boolean, altKey: boolean, ctrlKey: boolean, metaKey: boolean, type: string };
  capsLock: boolean;
  speaker: any;
  tokenUuid: string | undefined;  // TODO change tokenId to tokenUuid
  targets: Set<Token | TokenDocument>;
  placeTemplateHookId: number | null;
  inCombat: boolean; // Is the item wielder in combat.
  isTurn: boolean; // Is it the item wielder's turn.
  AoO: boolean; // Is the attack an attack of

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
  hitTargets: Set<Token | TokenDocument>;
  attackRoll: Roll | undefined;
  diceRoll: number | undefined;
  attackTotal: number;
  attackCardData: ChatMessage | undefined;
  attackRollHTML: HTMLElement | JQuery<HTMLElement> | string;
  attackRollCount: number;
  noAutoAttack: boolean; // override attack roll for standard care

  hitDisplayData: any;

  damageRoll: Roll | undefined;
  damageTotal: number;
  damageDetail: any[];
  damageRollHTML: HTMLElement | JQuery<HTMLElement> | string;
  damageRollCount: number;
  damageCardData: ChatMessage | undefined;
  defaultDamageType: string | undefined;
  noAutoDamage: boolean; // override damage roll for damage rolls
  isVersatile: boolean;

  saves: Set<Token | TokenDocument>;
  superSavers: Set<Token | TokenDocument>;
  semiSuperSavers: Set<Token | TokenDocument>;
  failedSaves: Set<Token | TokenDocument>;
  fumbleSaves: Set<Token | TokenDocument>;
  criticalSaves: Set<Token | TokenDocument>;
  advantageSaves: Set<Token | TokenDocument>;
  saveRequests: any;
  saveTimeouts: any;

  saveDisplayData;

  chatMessage: ChatMessage;
  hideTags: string[];
  displayId: string;
  //@ts-ignore dnd5e v10
  reactionUpdates: Set<globalThis.dnd5e.documents.Actor5e>;
  stateList: WorkflowState[];
  flagTags: {} | undefined;
  onUseMacros: OnUseMacros | undefined;

  attackAdvAttribution: {};
  static eventHack: any;


  static get workflows() { return Workflow._workflows }
  static getWorkflow(id: string): Workflow {
    if (debugEnabled > 1) debug("Get workflow ", id, Workflow._workflows, Workflow._workflows[id])
    return Workflow._workflows[id];
  }

  get workflowType() { return this.__proto__.constructor.name };

  get hasSave(): boolean {
    if (this.ammo?.hasSave) return true;
    if (this.item.hasSave) return true;
    if (configSettings.rollOtherDamage && this.shouldRollOtherDamage) return this.otherDamageItem.hasSave;
    return false;
  }

  get saveItem() {
    if (this.ammo?.hasSave) return this.ammo;
    if (this.item.hasSave) return this.item;
    if (configSettings.rollOtherDamage && this.otherDamageItem?.hasSave) return this.otherDamageItem;
    return this.item;
  }

  get otherDamageItem() {
    if (this.item?.system.formula ?? "" !== "") return this.item;
    if (this.ammo && (this.ammo?.system.formula ?? "") !== "") return this.ammo;
    return this.item;
    let item = this.item;
    if (!item.hasSave && this.ammo?.hasSave && configSettings.rollOtherDamage && this.shouldRollOtherDamage) item = this.ammo;
    return item;
  }

  get otherDamageFormula() {
    if ((this.otherDamageItem?.system.formula ?? "") === "") {
      if (this.otherDamageItem.type === "weapon" && !this.otherDamageItem?.system.properties?.ver)
        return this.otherDamageItem?.system.damage.versatile;
    }
    return this.otherDamageItem?.system.formula;
  }

  get hasDAE() {
    return installedModules.get("dae") && (
      this.item?.effects?.some(ef => ef?.transfer === false)
      || this.ammo?.effects?.some(ef => ef?.transfer === false)
    );
  }

  static initActions(actions: {}) {
    Workflow._actions = actions;
  }

  public processAttackEventOptions() { }

  get shouldRollDamage(): boolean {
    // if ((this.itemRollToggle && getAutoRollDamage()) || !getAutoRollDamage())  return false;
    const normalRoll = getAutoRollDamage(this) === "always"
      || (getAutoRollDamage(this) !== "none" && !this.item.hasAttack)
      || (getAutoRollDamage(this) === "onHit" && (this.hitTargets.size > 0 || this.hitTargetsEC.size > 0 || this.targets.size === 0))
      || (getAutoRollDamage(this) === "onHit" && (this.hitTargetsEC.size > 0));
    return this.itemRollToggle ? !normalRoll : normalRoll;
  }

  //@ts-ignore dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, item: globalThis.dnd5e.documents.Item5e, speaker, targets, options: any = {}) {
    this.actor = actor;
    this.item = item;
    if (Workflow.getWorkflow(item?.uuid) && !(this instanceof DummyWorkflow)) {
      const existing = Workflow.getWorkflow(item.uuid);
      if (!([WORKFLOWSTATES.ROLLFINISHED, WORKFLOWSTATES.WAITFORDAMAGEROLL].includes(existing.currentState)) && existing.itemCardId) {
        game.messages?.get(existing.itemCardId)?.delete();
      }
      Workflow.removeWorkflow(item.uuid);
    }

    if (!this.item || this instanceof DummyWorkflow) {
      this.itemId = randomID();
      this.uuid = this.itemId
    } else {
      this.itemId = item.id;
      this.itemUuid = item.uuid;
      this.uuid = item.uuid;
    }

    this.tokenId = speaker.token;
    const token: Token | undefined = canvas?.tokens?.get(this.tokenId);
    this.tokenUuid = token?.document?.uuid; // TODO see if this could be better
    this.token = token;
    this.speaker = speaker;
    if (this.speaker.scene) this.speaker.scene = canvas?.scene?.id;
    this.targets = new Set(targets);
    this.saves = new Set();
    this.superSavers = new Set();
    this.semiSuperSavers = new Set();
    this.failedSaves = new Set(this.targets)
    this.hitTargets = new Set(this.targets);
    this.hitTargetsEC = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
    this.isCritical = false;
    this.isFumble = false;
    this.currentState = WORKFLOWSTATES.NONE;
    this.aborted = false;
    this.itemLevel = item?.level || 0;
    this._id = randomID();
    this.displayId = this.id;
    this.itemCardData = {};
    this.attackCardData = undefined;
    this.damageCardData = undefined;
    this.event = options?.event;
    this.capsLock = options?.event?.getModifierState && options?.event.getModifierState("CapsLock");
    this.rollOptions = { advantage: false, disadvantage: false, versatile: false, critical: false, fastForward: false, rollToggle: false };
    this.pressedKeys = options?.pressedKeys;
    if (this.pressedKeys) {
      if (this.item?.hasAttack || this.item?.type === "tool")
        this.rollOptions = mergeObject(this.rollOptions, mapSpeedKeys(options.pressedKeys, "attack"), { overwrite: true });
      else
        this.rollOptions = mergeObject(this.rollOptions, mapSpeedKeys(options.pressedKeys, "damage"), { overwrite: true });
    }
    this.itemRollToggle = options?.pressedKeys?.rollToggle ?? false;
    this.noOptionalRules = options?.pressedKeys?.noOptionalRules ?? false;
    this.attackRollCount = 0;
    this.damageRollCount = 0;
    this.advantage = undefined;
    this.disadvantage = undefined;
    this.isVersatile = false;
    this.templateId = null;
    this.templateUuid = null;

    this.saveRequests = {};
    this.defenceRequests = {};
    this.saveTimeouts = {};
    this.defenceTimeouts = {}
    this.shouldRollOtherDamage = true;
    this.forceApplyEffects = false;

    this.placeTemplateHookId = null;
    this.damageDetail = [];
    this.otherDamageDetail = [];
    this.hideTags = new Array();
    this.displayHookId = null;
    this.onUseCalled = false;
    this.effectsAlreadyExpired = [];
    this.reactionUpdates = new Set();
    if (!(this instanceof DummyWorkflow)) Workflow._workflows[this.uuid] = this;
    this.needTemplate = this.item?.hasAreaTarget;
    this.stateList = [];
    this.attackRolled = false;
    this.damageRolled = false;
    this.flagTags = undefined;
    this.workflowOptions = options?.workflowOptions ?? {};
    this.attackAdvAttribution = {};
    this.systemString = game.system.id.toUpperCase();

    if (configSettings.allowUseMacro) {
      this.onUseMacros = new OnUseMacros();
      const itemOnUseMacros = getProperty(this.item ?? {}, "flags.midi-qol.onUseMacroParts") ?? new OnUseMacros();
      const actorOnUseMacros = getProperty(this.actor ?? {}, "flags.midi-qol.onUseMacroParts") ?? new OnUseMacros();
      //@ts-ignore
      this.onUseMacros.items = itemOnUseMacros.items.concat(actorOnUseMacros.items);
    }
    this.preSelectedTargets = canvas?.scene ? new Set(game.user?.targets) : new Set(); // record those targets targeted before cast.
    if (this.item && ["spell", "feat", "weapon"].includes(this.item.type)) {
      if (!this.item?.flags.midiProperties) {
        this.item.flags.midiProperties = {};
        this.item.flags.midiProperties.fulldam = this.item.system.properties?.fulldam;
        this.item.flags.midiProperties.halfdam = this.item.system.properties?.halfdam;
        this.item.flags.midiProperties.nodam = this.item.system.properties?.nodam;
        this.item.flags.midiProperties.critOther = this.item.system.properties?.critOther;
      }
    }
    if (!(this instanceof BetterRollsWorkflow)) this.placeTemplateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
    this.needTemplate = this.item?.hasAreaTarget ?? false;
    this.needItemCard = true;
    this.kickStart = false;
  }

  public someEventKeySet() {
    return this.event?.shiftKey || this.event?.altKey || this.event?.ctrlKey || this.event?.metaKey;
  }

  static async removeAttackDamageButtons(id) {
    let workflow = Workflow.getWorkflow(id)
    if (!workflow) return;
    let chatMessage: ChatMessage | undefined = game.messages?.get(workflow.itemCardId ?? "");
    if (!chatMessage) return;
    //@ts-ignore .content v10
    let content = chatMessage && duplicate(chatMessage.content);
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
      if (workflow.placeTemplateHookId) Hooks.off("createMeasuredTemplate", workflow.placeTemplateHookId)
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
    let items: any[] = [];
    let state = stateToLabel(newState)
    if (debugEnabled > 0) warn(this.workflowType, "_next ", state, this.id, this);
    // this.stateList.push(new WorkflowState(newState, undoData));
    // error(this.stateList);
    switch (newState) {
  
      case WORKFLOWSTATES.NONE:
        this.selfTargeted = false;
        if (this.item?.system.target?.type === "self") {
          this.targets = await getSelfTargetSet(this.actor);
          this.hitTargets = new Set(this.targets);
          this.selfTargeted = true;
        }
        this.templateTargeting = configSettings.autoTarget !== "none" && this.item.hasAreaTarget;
        if (debugEnabled > 1) debug(state, configSettings.autoTarget, this.item.hasAreaTarget);
        if (this.templateTargeting) {
          game.user?.updateTokenTargets([]); // clear out the targets
          return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
        }
        const targetDetails = this.item.system.target;
        this.rangeTargeting = configSettings.rangeTarget !== "none" && ["ft", "m"].includes(targetDetails?.units) && ["creature", "ally", "enemy"].includes(targetDetails?.type);
        if (this.rangeTargeting) {
          this.setRangedTargets(targetDetails);
          this.targets = validTargetTokens(this.targets);
          this.failedSaves = new Set(this.targets)
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          return this.next(WORKFLOWSTATES.AWAITITEMCARD);
        }
        return this.next(WORKFLOWSTATES.LATETARGETING);

      case WORKFLOWSTATES.AWAITITEMCARD:
        if (this.needItemCard) return undefined
        if (this.needTemplate) return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
        return this.next(WORKFLOWSTATES.TEMPLATEPLACED);

      case WORKFLOWSTATES.AWAITTEMPLATE: // wait for template/itemcard
        if (this.needTemplate) return undefined;
        if (this.needItemCard) return this.next(WORKFLOWSTATES.AWAITITEMCARD);
        if (this.templateTargeting) return this.next(WORKFLOWSTATES.TEMPLATEPLACED);
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.TEMPLATEPLACED:
        if (configSettings.allowUseMacro) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("templatePlaced"), "OnUse", "templatePlaced");
        }
        // Some modules stop being able to get the item card id.
        if (!this.itemCardId) return this.next(WORKFLOWSTATES.VALIDATEROLL);

        const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId);
        // remove the place template button from the chat card.
        this.targets = validTargetTokens(this.targets);
        this.hitTargets = new Set(this.targets)
        this.hitTargetsEC = new Set();
        //@ts-ignore .content v10
        let content = chatMessage && duplicate(chatMessage.content)
        let buttonRe = /<button data-action="placeTemplate">[^<]*<\/button>/
        content = content?.replace(buttonRe, "");
        await chatMessage?.update({
          "content": content,
          "flags.midi-qol.type": MESSAGETYPES.ITEM,
          type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.LATETARGETING:
        return this.next(WORKFLOWSTATES.VALIDATEROLL);

      case WORKFLOWSTATES.VALIDATEROLL:
        // do pre roll checks
        if (checkRule("checkRange") && !this.AoO && this.tokenId) {
          switch (checkRange(this.item, canvas?.tokens?.get(this.tokenId), this.targets)) {
            case "fail": return this.next(WORKFLOWSTATES.ROLLFINISHED);
            case "dis": this.disadvantage = true;
              this.attackAdvAttribution["DIS:range"] = true;
          }
        }
        if (checkRule("incapacitated") && checkIncapacitated(this.actor, this.item, null)) return this.next(WORKFLOWSTATES.ROLLFINISHED);

        return this.next(WORKFLOWSTATES.PREAMBLECOMPLETE);

      case WORKFLOWSTATES.PREAMBLECOMPLETE:
        this.effectsAlreadyExpired = [];
        if (await asyncHooksCall("midi-qol.preambleComplete", this) === false) return;
        if (this.item && await asyncHooksCall(`midi-qol.preambleComplete.${this.item.uuid}`, this) === false) return;
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
        if (this.item.type === "tool") {

          const abilityId = this.item?.system.ability ?? "dex";
          if (procAutoFail(this.actor, "check", abilityId)) this.rollOptions.parts = ["-100"];
          //TODO Check this
          let procOptions = procAdvantage(this.actor, "check", abilityId, this.rollOptions);
          this.advantage = procOptions.advantage;
          this.disadvantage = procOptions.disadvantage;

          if (autoFastForwardAbilityRolls) {
            // procOptions.fastForward = !this.rollOptions.rollToggle;
            //            this.item.rollToolCheck({ fastForward: this.rollOptions.fastForward, advantage: hasAdvantage, disadvantage: hasDisadvantage })
            await this.item.rollToolCheck(procOptions)
            return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
          }
        }
        if (!this.item.hasAttack) {
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (this.noAutoAttack) return undefined;
        this.autoRollAttack = this.rollOptions.advantage || this.rollOptions.disadvantage || getAutoRollAttack();
        if (this.rollOptions?.fastForwardSet) this.autoRollAttack = true;
        if (this.rollOptions.rollToggle) this.autoRollAttack = !this.autoRollAttack;
        // if (!this.autoRollAttack) this.autoRollAttack = (getAutoRollAttack() && !this.rollOptions.rollToggle) || (!getAutoRollAttack() && this.rollOptions.rollToggle)
        if (!this.autoRollAttack) {
          const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
          const isFastRoll = this.rollOptions.fastForwarAttack ?? isAutoFastAttack();
          if (chatMessage && (!this.autoRollAttack || !isFastRoll)) {
            // provide a hint as to the type of roll expected.
            //@ts-ignore .content v10
            let content = chatMessage && duplicate(chatMessage.content)
            let searchRe = /<button data-action="attack">[^<]+<\/button>/;
            const hasAdvantage = this.advantage && !this.disadvantage;
            const hasDisadvantage = this.disadvantage && !this.advantage;
            let attackString = hasAdvantage ? i18n(`${this.systemString}.Advantage`) : hasDisadvantage ? i18n(`${this.systemString}.Disadvantage`) : i18n(`${this.systemString}.Attack`)
            if (isFastRoll && configSettings.showFastForward) attackString += ` ${i18n("midi-qol.fastForward")}`;
            let replaceString = `<button data-action="attack">${attackString}</button>`
            content = content.replace(searchRe, replaceString);
            await chatMessage?.update({ "content": content });
          } else if (!chatMessage) error("no chat message")
        }

        if (configSettings.allowUseMacro) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
        }
        if (this.autoRollAttack) {
          await this.item.rollAttack({ event: {} });
        }
        return undefined;

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:

        if (await asyncHooksCall("midi-qol.preAttackRollComplete", this) === false) {
          return undefined;
        };

        if (this.item && await asyncHooksCall(`midi-qol.preAttackRollComplete.${this.item.uuid}`, this) === false) {
          return undefined;
        };

        const attackRollCompleteStartTime = Date.now();
        const attackBonusMacro = getProperty(this.actor.flags, `${game.system.id}.AttackBonusMacro`);
        if (configSettings.allowUseMacro && attackBonusMacro) {
          // await this.rollAttackBonus(attackBonusMacro);
        }

        this.processAttackRoll();
        await asyncHooksCallAll("midi-qol.preCheckHits", this);
        if (this.item) await asyncHooksCallAll(`midi-qol.preCheckHits.${this.item.uuid}`, this);

        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preCheckHits"), "OnUse", "preCheckHits");
        }
        this.processAttackRoll();
        if (configSettings.autoCheckHit !== "none") {
          await this.displayAttackRoll(configSettings.mergeCard, { GMOnlyAttackRoll: true });

          await this.checkHits();
          await this.displayAttackRoll(configSettings.mergeCard);

          const rollMode = game.settings.get("core", "rollMode");
          this.whisperAttackCard = configSettings.autoCheckHit === "whisper" || rollMode === "blindroll" || rollMode === "gmroll";
          await this.displayHits(this.whisperAttackCard, configSettings.mergeCard);
        } else {
          await this.displayAttackRoll(configSettings.mergeCard);
        }
        if (checkRule("removeHiddenInvis")) await removeHidden.bind(this)();
        const attackExpiries = [
          "isAttacked"
        ];
        await this.expireTargetEffects(attackExpiries);


        // We only roll damage on a hit. but we missed everyone so all over, unless we had no one targetted
        await asyncHooksCallAll("midi-qol.AttackRollComplete", this);
        if (this.item) await asyncHooksCallAll(`midi-qol.AttackRollComplete.${this.uuid}`, this);

        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
        }

        if (
          (["onHit"].includes(getAutoRollDamage()) && this.hitTargetsEC.size === 0 && this.hitTargets.size === 0 && this.targets.size !== 0)
          // This actually causes an issue when the attack missed but GM might want to turn it into a hit.
          // || (configSettings.autoCheckHit !== "none" && this.hitTargets.size === 0 && this.hitTargetsEC.size === 0 && this.targets.size !== 0)
        ) {
          expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
          // Do special expiries
          await this.expireTargetEffects(["isAttacked"])
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (debugCallTiming) log(`AttackRollComplete elapsed ${Date.now() - attackRollCompleteStartTime}ms`)
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        if (debugEnabled > 1) debug(`wait for damage roll has damage ${itemHasDamage(this.item)} isfumble ${this.isFumble} no auto damage ${this.noAutoDamage}`);
        if (checkRule("actionSpecialDurationImmediate"))
          expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);
        if (checkRule("actionSpecialDurationImmediate") && this.hitTargets.size)
          expireMyEffects.bind(this)(["1Hit"]);

        if (!itemHasDamage(this.item) && !itemHasDamage(this.ammo)) return this.next(WORKFLOWSTATES.WAITFORSAVES);

        if (this.isFumble && configSettings.autoRollDamage !== "none") {
          // Auto rolling damage but we fumbled - we failed - skip everything.
          expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"])
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageRoll"), "OnUse", "preDamageRoll");
        }

        if (this.noAutoDamage) return; // we are emulating the standard card specially.

        if (this.shouldRollDamage) {
          if (debugEnabled > 0) warn(" about to roll damage ", this.event, configSettings.autoRollAttack, configSettings.autoFastForward)
          const storedData: any = game.messages?.get(this.itemCardId ?? "")?.getFlag(game.system.id, "itemData");
          if (storedData) { // If magic items is being used it fiddles the roll to include the item data
            this.item = new CONFIG.Item.documentClass(storedData, { parent: this.actor })
          }

          this.rollOptions.spellLevel = this.itemLevel;

          await this.item.rollDamage(this.rollOptions);
          return undefined;
        } else {
          this.processDamageEventOptions();
          const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId || "");
          if (chatMessage) {
            // provide a hint as to the type of roll expected.
            //@ts-ignore .content v10
            let content = chatMessage && duplicate(chatMessage.content)
            let searchRe = /<button data-action="damage">[^<]+<\/button>/;
            const damageTypeString = (this.item?.system.actionType === "heal") ? i18n(`${this.systemString}.Healing`) : i18n(`${this.systemString}.Damage`);
            let damageString = (this.rollOptions.critical || this.isCritical) ? i18n(`${this.systemString}.Critical`) : damageTypeString;
            if (this.rollOptions.fastForwardDamage && configSettings.showFastForward) damageString += ` ${i18n("midi-qol.fastForward")}`;
            let replaceString = `<button data-action="damage">${damageString}</button>`
            content = content.replace(searchRe, replaceString);
            searchRe = /<button data-action="versatile">[^<]+<\/button>/;
            damageString = i18n(`${this.systemString}.Versatile`)
            if (this.rollOptions.fastForwardDamage && configSettings.showFastForward) damageString += ` ${i18n("midi-qol.fastForward")}`;
            replaceString = `<button data-action="versatile">${damageString}</button>`
            content = content.replace(searchRe, replaceString);
            await chatMessage?.update({ content });
          }
        }
        return undefined; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        const damageRollCompleteStartTime = Date.now();
        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = validTargetTokens(game.user?.targets);
          this.hitTargets = validTargetTokens(game.user?.targets);
          this.hitTargetsEC = new Set();
          if (debugEnabled > 0) warn(" damage roll complete for non auto target area effects spells", this)
        }

        // apply damage to targets plus saves plus immunities
        // done here cause not needed for betterrolls workflow
        this.defaultDamageType = this.item.system.damage?.parts[0][1] || this.defaultDamageType || MQdefaultDamageType;
        if (this.item?.system.actionType === "heal" && !Object.keys(getSystemCONFIG().healingTypes).includes(this.defaultDamageType ?? "")) this.defaultDamageType = "healing";
        // now done in itemhandling this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: this.defaultDamageType });

        await asyncHooksCallAll("midi-qol.preDamageRollComplete", this)
        if (this.item) await asyncHooksCallAll(`midi-qol.preDamageRollComplete.${this.item.uuid}`, this);

        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
        }
        const damageBonusMacros = this.getDamageBonusMacros();
        if (damageBonusMacros && this.workflowType === "Workflow") {
          await this.rollBonusDamage(damageBonusMacros);
        }

        this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: this.defaultDamageType });
        if (!this.otherDamageRoll) this.otherDamageDetail = [];
        if (this.otherDamageRoll) { // TODO look at removeing this.
          this.otherDamageDetail = createDamageList({ roll: this.otherDamageRoll, item: null, versatile: false, defaultType: this.defaultDamageType });
        } else this.otherDamageDetail = [];

        await this.displayDamageRoll(configSettings.mergeCard);
        await asyncHooksCallAll("midi-qol.DamageRollComplete", this);
        if (this.item) await asyncHooksCallAll(`midi-qol.DamageRollComplete.${this.item.uuid}`, this);
        expireMyEffects.bind(this)(["1Action", "1Attack", "1Hit", "1Spell"]);

        log(`DmageRollComplete elapsed ${Date.now() - damageRollCompleteStartTime}ms`)
        if (this.isFumble) {
          return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);
        }
        return this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        this.initSaveResults();
        this.saves = new Set(); // not auto checking assume no saves

        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preSave"), "OnUse", "preSave");
        }
        if (this.workflowType === "Workflow" && !this.item?.hasAttack && this.item?.system.target?.type !== "self") { // Allow editing of targets if there is no attack that has already been processed.
          this.targets = new Set(game.user?.targets);
          this.hitTargets = new Set(this.targets);
        }
        this.failedSaves = new Set(this.hitTargets);
        if (!this.hasSave) {
          return this.next(WORKFLOWSTATES.SAVESCOMPLETE);
        }

        if (configSettings.autoCheckSaves !== "none") {
          await asyncHooksCallAll("midi-qol.preCheckSaves", this);
          if (this.item) await asyncHooksCallAll(`midi-qol.preCheckSaves.${this.item?.uuid}`, this);
          //@ts-ignore ._hooks not defined
          if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          // setup to process saving throws as generated
          let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
          // let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
          let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
          try {
            await this.checkSaves(configSettings.autoCheckSaves !== "allShow");
          } finally {
            Hooks.off("renderChatMessage", hookId);
            // Hooks.off("renderChatMessage", brHookId);
            Hooks.off("updateChatMessage", monksId);
          }
          if (debugEnabled > 1) debug("Check Saves: ", this.saveRequests, this.saveTimeouts, this.saves);

          //@ts-ignore ._hooks not defined
          if (debugEnabled > 1) debug("Check Saves: renderChat message hooks length ", Hooks._hooks["renderChatMessage"]?.length)
          await asyncHooksCallAll("midi-qol.postCheckSaves", this);
          if (this.item) await asyncHooksCallAll(`midi-qol.postCheckSaves.${this.item?.uuid}`, this);
          await this.displaySaves(configSettings.autoCheckSaves === "whisper", configSettings.mergeCard);
        } else {// has saves but we are not checking so do nothing with the damage
          await this.expireTargetEffects(["isAttacked"])
          this.applicationTargets = this.failedSaves;
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        }
        return this.next(WORKFLOWSTATES.SAVESCOMPLETE);

      case WORKFLOWSTATES.SAVESCOMPLETE:
        expireMyEffects.bind(this)(["1Action", "1Spell"]);
        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postSave"), "OnUse", "postSave");
        }
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE);

      case WORKFLOWSTATES.ALLROLLSCOMPLETE:
        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preDamageApplication"), "OnUse", "preDamageApplication");
        }

        this.applicationTargets = new Set();
        if (this.saveItem.hasSave) this.applicationTargets = this.failedSaves;
        else if (this.item.hasAttack) {
          this.applicationTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);

          // this.applicationTargets = this.hitTargets;
          // TODO EC add in all hitTargetsEC who took damage
        } else this.applicationTargets = this.targets;
        this.activationFails = new Set();

        items = [];
        if (this.item) items.push(this.item);
        if (this.ammo && !installedModules.get("betterrolls5e")) items.push(this.ammo);
        for (let theItem of items) {
          const activationCondition = activationConditionToUse.bind(theItem)(this)
          if (activationCondition) {
            if (activationCondition) {
              for (let token of this.targets) {
                if (!evalActivationCondition(this, activationCondition, token)) {
                  //@ts-ignore
                  this.activationFails.add(token.document.uuid);
                  // let activationFails.add[token.document.uuid] = evalActivationCondition(this, getProperty(theItem, "system.activation.condition") ?? "", token);
                }
              }
            }
          }
        }
        if (this.damageDetail.length) await processDamageRoll(this, this.damageDetail[0].type)
        if (debugEnabled > 1) debug("all rolls complete ", this.damageDetail)
        // expire effects on targeted tokens as required

        return this.next(WORKFLOWSTATES.APPLYDYNAMICEFFECTS);

      case WORKFLOWSTATES.APPLYDYNAMICEFFECTS:
        const applyDynamicEffectsStartTime = Date.now();
        expireMyEffects.bind(this)(["1Action", "1Spell"]);
        // Do special expiries
        const specialExpiries = [
          "isAttacked",
          "isDamaged",
          // XXX "1Reaction",
          "isSaveSuccess",
          "isSaveFailure",
          "isSave",
          "isHit"
        ];
        await this.expireTargetEffects(specialExpiries)
        if (configSettings.autoItemEffects === "off" && !this.forceApplyEffects) return this.next(WORKFLOWSTATES.ROLLFINISHED); // TODO see if there is a better way to do this.

        items = [];
        if (this.item) items.push(this.item);
        if (this.ammo && !installedModules.get("betterrolls5e")) items.push(this.ammo);
        for (let theItem of items) {
          if (theItem) {
            if (configSettings.allowUseMacro) {
              const results: any = await this.callMacros(theItem, this.onUseMacros?.getMacros("preActiveEffects"), "OnUse", "preActiveEffects");
              // Special check for return of {haltEffectsApplication: true} from item macro
              if (results.some(r => r?.haltEffectsApplication))
                return this.next(WORKFLOWSTATES.ROLLFINISHED);
            }
          }
          if (await asyncHooksCall("midi-qol.preApplyDynamicEffects", this) === false) return this.next(WORKFLOWSTATES.ROLLFINISHED);
          if (theItem && await asyncHooksCall(`midi-qol.preApplyDynamicEffects.${theItem.uuid}`, this) === false) return this.next(WORKFLOWSTATES.ROLLFINISHED);

          // no item, not auto effects or not module skip
          let useCE = configSettings.autoCEEffects;
          const midiFlags = theItem.flags["midi-qol"];
          if (!theItem) return this.next(WORKFLOWSTATES.ROLLFINISHED);
          if (midiFlags?.forceCEOff && ["both", "cepri", "itempri"].includes(useCE)) useCE = "none";
          else if (midiFlags?.forceCEOn && ["none", "itempri"].includes(useCE)) useCE = "cepri";
          const hasCE = installedModules.get("dfreds-convenient-effects")
          //@ts-ignore
          const ceEffect = hasCE ? game.dfreds.effects.all.find(e => e.name === theItem?.name) : undefined;
          const ceTargetEffect = ceEffect && !(ceEffect?.flags.dae?.selfTarget || ceEffect?.flags.dae?.selfTargetAlways);
          const hasItemEffect = this.hasDAE && theItem?.effects.some(ef => ef.transfer !== true);
          const itemSelfEffects = theItem?.effects.filter(ef => (ef.flags?.dae?.selfTarget || ef.flags?.dae?.selfTargetAlways) && !ef.transfer) ?? [];
          const itemTargetEffects = theItem?.effects?.filter(ef => !ef.flags?.dae?.selfTargetAlways && !ef.flags?.dae?.selfTarget && ef.transfer !== true) ?? [];
          const hasItemTargetEffects = hasItemEffect && itemTargetEffects.length > 0;
          const hasItemSelfEffects = hasItemEffect && itemSelfEffects.length > 0;
          let selfEffectsToApply = "none";

          let anyActivationTrue = false;

          if (!this.forceApplyEffects) {
            this.applicationTargets = new Set();
            if (this.saveItem.hasSave) this.applicationTargets = this.failedSaves;
            else if (theItem.hasAttack) {
              this.applicationTargets = this.hitTargets;
              // TODO EC add in all EC targets that took damage
            } else this.applicationTargets = this.targets;
          }

          if (hasItemTargetEffects || ceTargetEffect) {
            for (let token of this.applicationTargets) {
              let applyCondition = true;
              if (getProperty(theItem, "flags.midi-qol.effectActivation"))
                applyCondition = evalActivationCondition(this, getProperty(theItem, "system.activation.condition") ?? "", token);
              anyActivationTrue = anyActivationTrue || applyCondition;
              if (applyCondition || this.forceApplyEffects) {
                if (hasItemTargetEffects && (!ceTargetEffect || ["none", "both", "itempri"].includes(useCE))) {
                  await globalThis.DAE.doEffects(theItem, true, [token], { toggleEffect: this.item?.flags.midiProperties?.toggleEffect, whisper: false, spellLevel: this.itemLevel, damageTotal: this.damageTotal, critical: this.isCritical, fumble: this.isFumble, itemCardId: this.itemCardId, tokenId: this.tokenId, workflowOptions: this.workflowOptions, selfEffects: "none" })
                }
                if (ceTargetEffect && theItem && token.actor) {
                  if (["both", "cepri"].includes(useCE) || (useCE === "itempri" && !hasItemTargetEffects)) {
                    const metadata = this.getMacroData();
                    if (this.item?.flags.midiProperties?.toggleEffect) {
                      //@ts-ignore
                      await game.dfreds.effectInterface?.toggleEffect(theItem.name, { uuid: token.actor.uuid, origin: theItem?.uuid, metadata });
                    } else {
                      // Check stacking status
                      //@ts-ignore
                      if ((ceEffect.flags.dae?.stackable ?? "none") === "none" && game.dfreds.effectInterface?.hasEffectApplied(theItem.name, token.actor.uuid)) {
                        //@ts-ignore
                        await game.dfreds.effectInterface?.removeEffect({ effectName: theItem.name, uuid: token.actor.uuid, origin: theItem?.uuid, metadata });
                      }
                      //@ts-ignore
                      await game.dfreds.effectInterface?.addEffect({ effectName: theItem.name, uuid: token.actor.uuid, origin: theItem?.uuid, metadata });
                    }
                  }
                }
                if (!this.forceApplyEffects && configSettings.autoItemEffects !== "applyLeave") await this.removeEffectsButton();
              }
            }
          }
          // anyActivaiton is true for no activation condition or true if any of the token conditions matched.
          anyActivationTrue =
            !getProperty(theItem, "flags.midi-qol.effectActivation")
            || (getProperty(theItem, "system.activation.condition") !== "" ? anyActivationTrue : true);
          let ceSelfEffectToApply = ceEffect?.flags.dae?.selfTargetAlways ? ceEffect : undefined;
          selfEffectsToApply = "selfEffectsAlways"; // by default on do self effect always effects
          if (this.applicationTargets.size > 0 && anyActivationTrue) { // someone had an effect applied so we will do all self effects
            ceSelfEffectToApply = ceEffect && ceEffect?.flags.dae?.selfTarget; 
            selfEffectsToApply = "selfEffectsAll";
          }
          if (selfEffectsToApply !== "none" && hasItemSelfEffects && (!ceSelfEffectToApply || ["none", "both", "itempri"].includes(useCE))) {
            await globalThis.DAE.doEffects(theItem, true, [tokenForActor(this.actor)], { toggleEffect: this.item?.flags.midiProperties?.toggleEffect, whisper: false, spellLevel: this.itemLevel, damageTotal: this.damageTotal, critical: this.isCritical, fumble: this.isFumble, itemCardId: this.itemCardId, tokenId: this.tokenId, workflowOptions: this.workflowOptions, selfEffects: selfEffectsToApply })
          }
          if (selfEffectsToApply !== "none" && ceSelfEffectToApply && theItem && this.actor) {
            if (["both", "cepri"].includes(useCE) || (useCE === "itempri" && !hasItemSelfEffects)) {
              const metadata = this.getMacroData();
              if (this.item?.flags.midiProperties?.toggleEffect) {
                //@ts-ignore
                await game.dfreds.effectInterface?.toggleEffect(theItem.name, { uuid: this.actor.uuid, origin: theItem?.uuid, metadata });
              } else {
                // Check stacking status
                //@ts-ignore
                if ((ceEffect.flags.dae?.stackable ?? "none") === "none" && game.dfreds.effectInterface?.hasEffectApplied(theItem.name, this.actor.uuid)) {
                  //@ts-ignore
                  await game.dfreds.effectInterface?.removeEffect({ effectName: theItem.name, uuid: this.actor.uuid, origin: theItem?.uuid, metadata });
                }
                //@ts-ignore
                await game.dfreds.effectInterface?.addEffect({ effectName: theItem.name, uuid: this.actor.uuid, origin: theItem?.uuid, metadata });
              }
            }
          }
        }

        if (debugCallTiming) log(`applyActiveEffects elapsed ${Date.now() - applyDynamicEffectsStartTime}ms`)
        return this.next(WORKFLOWSTATES.ROLLFINISHED);

      case WORKFLOWSTATES.ROLLFINISHED:
        if (this.placeTemplateHookId) Hooks.off("createMeasuredTemplate", this.placeTemplateHookId)

        if (!this.aborted) {
          const specialExpiries = [
            "isDamaged",
            "1Reaction",
          ];
          await this.expireTargetEffects(specialExpiries)
          const rollFinishedStartTime = Date.now();
          if (this.workflowType !== "BetterRollsWorkflow") {
            const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
            //@ts-ignore .content v10
            let content = chatMessage?.content;
            if (content && getRemoveAttackButtons() && chatMessage) {
              const searchRe = /<button data-action="attack">[^<]*<\/button>/;
              content = content.replace(searchRe, "");
              await chatMessage.update({
                "content": content,
                timestamp: Date.now(),
                "flags.midi-qol.type": MESSAGETYPES.ITEM,
                type: CONST.CHAT_MESSAGE_TYPES.OTHER,
              });
            }
          }
          if (debugEnabled > 0) warn('Inside workflow.rollFINISHED');
          // Add concentration data if required
          let hasConcentration = this.item?.system.components?.concentration
            || this.item?.flags.midiProperties?.concentration
            || this.item?.system.activation?.condition?.toLocaleLowerCase().includes(i18n("midi-qol.concentrationActivationCondition").toLocaleLowerCase());
          if (hasConcentration && this.item?.hasAreaTarget && this.item?.system.duration?.units !== "inst") {
            hasConcentration = true;
          } else if (this.item &&
            (
              (this.item.hasAttack && (this.targets.size > 0 && this.hitTargets.size === 0 && this.hitTargetsEC.size === 0))  // did  not hit anyone
              || (this.saveItem.hasSave && (this.targets.size > 0 && this.failedSaves.size === 0)) // everyone saved
            )
          )
            hasConcentration = false;
          // items that leave a template laying around for an extended period generally should have concentration
          const checkConcentration = configSettings.concentrationAutomation; // installedModules.get("combat-utility-belt") && configSettings.concentrationAutomation;
          if (hasConcentration && checkConcentration) {
            const concentrationData: ConcentrationData = {
              item: this.item,
              targets: this.applicationTargets,
              templateUuid: this.templateUuid
            };
            await addConcentration(this.actor, concentrationData);
          } else if (installedModules.get("dae") && this.item?.hasAreaTarget && this.templateUuid && this.item?.system.duration?.units && configSettings.autoRemoveTemplate) { // create an effect to delete the template
            const itemDuration = this.item.system.duration;
            let selfTarget = this.item.actor.token ? this.item.actor.token.object : await getSelfTarget(this.item.actor);
            if (selfTarget) selfTarget = this.token; //TODO see why this is here
            let effectData;
            const templateString = " " + i18n("midi-qol.MeasuredTemplate");
            if (selfTarget) {
              let effect = this.item.actor.effects.find(ef => ef.label === this.item.name + templateString);
              if (effect) { // effect already applied
                const newChanges = duplicate(effect.changes);
                newChanges.push({ key: "flags.dae.deleteUuid", mode: 5, value: this.templateUuid, priority: 20 });
                await effect.update({ changes: newChanges });
              } else {
                effectData = {
                  origin: this.item?.uuid, //flag the effect as associated to the spell being cast
                  disabled: false,
                  icon: this.item?.img,
                  label: this.item?.name + templateString,
                  duration: {},
                  changes: [
                    { key: "flags.dae.deleteUuid", mode: 5, value: this.templateUuid, priority: 20 }, // who is marked
                  ]
                };

                const inCombat = (game.combat?.turns.some(combatant => combatant.token?.id === selfTarget.id));
                const convertedDuration = globalThis.DAE.convertDuration(itemDuration, inCombat);
                if (convertedDuration?.type === "seconds") {
                  effectData.duration = { seconds: convertedDuration.seconds, startTime: game.time.worldTime }
                } else if (convertedDuration?.type === "turns") {
                  effectData.duration = {
                    rounds: convertedDuration.rounds,
                    turns: convertedDuration.turns,
                    startRound: game.combat?.round,
                    startTurn: game.combat?.turn
                  }
                }
                await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
              }
            }
          }

          // Call onUseMacro if not already called
          if (configSettings.allowUseMacro && this.item?.flags) {
            await this.callMacros(this.item, this.onUseMacros?.getMacros("postActiveEffects"), "OnUse", "postActiveEffects");
          }

          // delete Workflow._workflows[this.itemId];
          await asyncHooksCallAll("minor-qol.RollComplete", this); // just for the macro writers.
          await asyncHooksCallAll("midi-qol.RollComplete", this);
          if (this.item) await asyncHooksCallAll(`midi-qol.RollComplete.${this.item?.uuid}`, this);
          if (autoRemoveTargets !== "none") setTimeout(untargetDeadTokens, 500); // delay to let the updates finish
          if (debugCallTiming) log(`RollFinished elapased ${Date.now() - rollFinishedStartTime}`);
        }
        //@ts-ignore scrollBottom protected
        ui.chat?.scrollBottom();
        return undefined;

      default:
        error("invalid state in workflow")
        return undefined;
    }
  }

  initSaveResults() {
    this.saves = new Set();
    this.criticalSaves = new Set();
    this.fumbleSaves = new Set();
    this.failedSaves = this.item?.hasAttack ? new Set(this.hitTargets) : new Set(this.targets);
    this.advantageSaves = new Set();
    this.disadvantageSaves = new Set();
    this.saveDisplayData = [];
  };

  public async checkAttackAdvantage() {
    await this.checkFlankingAdvantage();
    const midiFlags = this.actor?.flags["midi-qol"];
    const advantage = midiFlags?.advantage;
    const disadvantage = midiFlags?.disadvantage;
    const actType = this.item?.system?.actionType || "none"

    if (advantage || disadvantage) {
      const target: Token = this.targets.values().next().value;
      const conditionData = createConditionData({ workflow: this, target, actor: this.actor });

      if (advantage) {
        if (advantage.all && evalCondition(advantage.all, conditionData)) {
          this.advantage = true;
          this.attackAdvAttribution["ADV:all"] = true;
        }
        if (advantage.attack?.all && evalCondition(advantage.attack.all, conditionData)) {
          this.attackAdvAttribution["ADV:attack.all"] = true;
          this.advantage = true;
        }
        if (advantage.attack && advantage.attack[actType] && evalCondition(advantage.attack[actType], conditionData)) {
          this.attackAdvAttribution[`ADV.attack.${actType}`] = true;
          this.advantage = true;
        }
      }
      if (disadvantage) {
        const withDisadvantage = disadvantage.all || disadvantage.attack?.all || (disadvantage.attack && disadvantage.attack[actType]);
        if (disadvantage.all && evalCondition(disadvantage.all, conditionData)) {
          this.attackAdvAttribution["DIS:all"] = true;
          this.disadvantage = true;
        }
        if (disadvantage.attack?.all && evalCondition(disadvantage.attack.all, conditionData)) {
          this.attackAdvAttribution["DIS:attack.all"] = true;
          this.disadvantage = true;
        }
        if (disadvantage.attack && disadvantage.attack[actType] && evalCondition(disadvantage.attack[actType], conditionData)) {
          this.attackAdvAttribution[`DIS:attack.${actType}`] = true;
          this.disadvantage = true;
        }
      }
      this.checkAbilityAdvantage();
    }
    // TODO Hidden should check the target to see if they notice them?
    if (checkRule("invisAdvantage")) {
      const token: Token | undefined = canvas?.tokens?.get(this.tokenId);
      const target: Token | undefined = this.targets.values().next().value;
      let isHidden = false;
      if (token && target) { // preferentially check CV isHidden
        if (installedModules.get("conditional-visibility")) {
          //@ts-ignore .api if cond vis active it will work out the vision rules for a token
          isHidden = game.modules.get('conditional-visibility')?.api?.canSee(target, token) === false;
          //@ts-ignore .api if cond vis active it will work out the vision rules for a token
          if (game.modules.get('conditional-visibility')?.api?.canSee(token, target) === false) {
            log(`Disadvantage given to ${this.actor.name} due to hidden/invisible target`);
            this.attackAdvAttribution["DIS:hidden"] = true;
            this.disadvantage = true;
          }
        } else { // no cond vis so just assume can't see hidden or invis attacker
          const hidden = hasCondition(token, "hidden");
        }
        isHidden = isHidden || !canSense(target, token); // check normal foundry sight rules
        if (!canSense(token, target)) {
          // Attacker can't see target so disadvantage
          log(`Disadvantage given to ${this.actor.name} due to hidden/invisible target`);
          this.attackAdvAttribution["DIS:hidden"] = true;
          this.disadvantage = true;
        }
      } else if (token) {
        const hidden = hasCondition(token, "hidden");
        //@ts-ignore specialStatusEffects
        const invisible = hasCondition(token, "invisible");
        isHidden = hidden || invisible;
      }
      this.advantage = this.advantage || isHidden;
      if (isHidden) this.attackAdvAttribution["ADV:hidden"] = true;
      if (isHidden) log(`Advantage given to ${this.actor.name} due to hidden/invisible`);
    }
    // Neaarby foe gives disadvantage on ranged attacks
    if (checkRule("nearbyFoe")
      && !getProperty(this.actor, "flags.midi-qol.ignoreNearbyFoes")
      && (["rwak", "rsak", "rpak"].includes(actType) || this.item.system.properties?.thr)) {
      let nearbyFoe;
      // special case check for thrown weapons within 5 feet (players will forget to set the property)
      if (this.item.system.properties?.thr) {
        const firstTarget: Token = this.targets.values().next().value;
        const me = canvas?.tokens?.get(this.tokenId);
        if (firstTarget && me && getDistance(me, firstTarget, false, false).distance <= configSettings.optionalRules.nearbyFoe) nearbyFoe = false;
      } else nearbyFoe = checkNearby(-1, canvas?.tokens?.get(this.tokenId), configSettings.optionalRules.nearbyFoe);
      if (nearbyFoe) {
        log(`Ranged attack by ${this.actor.name} at disadvantage due to nearby foe`);
        if (debugEnabled > 0) warn(`Ranged attack by ${this.actor.name} at disadvantage due to nearby foe`);
        this.attackAdvAttribution["DIS:nearbyFoe"] = true;
      }
      this.disadvantage = this.disadvantage || nearbyFoe;
    }
    this.checkTargetAdvantage();
  }

  public processDamageEventOptions() {
    if (this.workflowType === "TrapWorkflow") {
      this.rollOptions.fastForward = true;
      this.rollOptions.fastForwardAttack = true;
      this.rollOptions.fastForwardDamage = true;
    }
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
    const criticalFlags = getProperty(this.actor, `flags.midi-qol.critical`) ?? {};
    const noCriticalFlags = getProperty(this.actor, `flags.midi-qol.noCritical`) ?? {};
    const attackType = this.item?.system.actionType;
    this.critFlagSet = false;
    this.noCritFlagSet = false;

    const target: Token = this.hitTargets.values().next().value
    if (criticalFlags || noCriticalFlags) {
      const target: Token = this.hitTargets.values().next().value
      const conditionData = createConditionData({ workflow: this, target, actor: this.actor });
      if (criticalFlags) {
        if (criticalFlags?.all && evalCondition(criticalFlags.all, conditionData)) {
          this.critFlagSet = true;
        }
        if (criticalFlags[attackType] && evalCondition(criticalFlags[attackType], conditionData)) {
          this.critFlagSet = true;
        }
        if (noCriticalFlags) {
          if (noCriticalFlags?.all && evalCondition(noCriticalFlags.all, conditionData)) {
            this.noCritFlagSet = true;
          }
          if (noCriticalFlags[attackType] && evalCondition(noCriticalFlags[attackType], conditionData)) {
            this.noCritFlagSet = true;
          }
        }
      }
    }

    // check target critical/nocritical
    if (this.hitTargets.size === 1) {
      const firstTarget = this.hitTargets.values().next().value;
      const grants = firstTarget.actor?.flags["midi-qol"]?.grants?.critical ?? {};
      const fails = firstTarget.actor?.flags["midi-qol"]?.fail?.critical ?? {};
      if (grants || fails) {
        if (Number.isNumeric(grants.range) && getDistanceSimple(firstTarget, this.token, false, false) <= Number(grants.range)) {
          this.critFlagSet = true;
        }
        const conditionData = createConditionData({ workflow: this, target: firstTarget, actor: this.actor });
        if (grants.all && evalCondition(grants.all, conditionData)) {
          this.critFlagSet = true;
        }
        if (grants[attackType] && evalCondition(grants[attackType], conditionData)) {
          this.critFlagSet = true;

        }
        if (fails.all && evalCondition(fails.all, conditionData)) {
          this.noCritFlagSet = true;
        }
        if (fails[attackType] && evalCondition(fails[attackType], conditionData)) {
          this.noCritFlagSet = true;
        }
      }
    }
    this.isCritical = this.isCritical || this.critFlagSet;
    if (this.noCritFlagSet) this.isCritical = false;
  }

  checkAbilityAdvantage() {
    if (!["mwak", "rwak"].includes(this.item?.system.actionType)) return;
    let ability = this.item?.system.ability;
    if (ability === "") ability = this.item?.system.properties?.fin ? "dex" : "str";
    if (getProperty(this.actor, `flags.midi-qol.advantage.attack.${ability}`)) {
      if (evalCondition(getProperty(this.actor, `flags.midi-qol.advantage.attack.${ability}`), this.conditionData)) {
        this.advantage = true;
        this.attackAdvAttribution[`ADV:attack.${ability}`] = true;
      }
    }
    if (getProperty(this.actor, `flags.midi-qol.disadvantage.attack.${ability}`)) {
      if (evalCondition(getProperty(this.actor, `flags.midi-qol.disadvantage.attack.${ability}`), this.conditionData)) {
        this.disadvantage = true;
        this.attackAdvAttribution[`DIS:attack.${ability}`] = true;
      }
    }
  }

  async checkFlankingAdvantage(): Promise<boolean> {
    if (!canvas) {
      console.warn("midi-qol | Check flanking advantage abandoned - no canvas defined")
      return false;
    }
    this.flankingAdvantage = false;
    if (this.item && !(["mwak", "msak", "mpak"].includes(this.item?.system.actionType))) return false;
    const token = MQfromUuid(this.tokenUuid ?? null)?.object;
    const target: Token = this.targets.values().next().value;

    const needsFlanking = await markFlanking(token, target,);
    if (needsFlanking)
      this.attackAdvAttribution[`ADV:flanking`] = true;;
    if (["advonly", "ceadv"].includes(checkRule("checkFlanking"))) this.flankingAdvantage = needsFlanking;
    return needsFlanking;
  }

  checkTargetAdvantage() {
    if (!this.item) return;
    if (!this.targets?.size) return;
    const actionType = this.item?.system.actionType;
    const firstTarget = this.targets.values().next().value;
    if (checkRule("nearbyAllyRanged") > 0 && ["rwak", "rsak", "rpak"].includes(actionType)) {
      if ((firstTarget.document ?? firstTarget).width * (firstTarget.document ?? firstTarget).height < Number(checkRule("nearbyAllyRanged"))) {
        //TODO change this to TokenDocument
        const nearbyAlly = checkNearby(-1, firstTarget, 5); // targets near a friend that is not too big
        // TODO include thrown weapons in check
        if (nearbyAlly) {
          if (debugEnabled > 0) warn("ranged attack with disadvantage because target is near a friend");
          log(`Ranged attack by ${this.actor.name} at disadvantage due to nearby ally`)
        }
        this.disadvantage = this.disadvantage || nearbyAlly;
        if (nearbyAlly)
          this.attackAdvAttribution[`DIS:nearbyAlly`] = true;;
      }
    }
    const grants = firstTarget.actor?.flags["midi-qol"]?.grants;
    if (!grants) return;
    if (!["rwak", "mwak", "rsak", "msak", "rpak", "mpak"].includes(actionType)) return;
    const attackAdvantage = grants.advantage?.attack || {};
    let grantsAdvantage;
    const conditionData = createConditionData({ workflow: this, target: this.token, actor: this.actor });
    if (grants.advantage?.all && evalCondition(grants.advantage.all, conditionData)) {
      grantsAdvantage = true;
      this.attackAdvAttribution[`ADV:grants.advantage.all`] = true;;
    }
    if (attackAdvantage.all && evalCondition(attackAdvantage.all, conditionData)) {
      grantsAdvantage = true;
      this.attackAdvAttribution[`ADV:grants.attack.all`] = true;
    }
    if (attackAdvantage[actionType] && evalCondition(attackAdvantage[actionType], conditionData)) {
      grantsAdvantage = true;
      this.attackAdvAttribution[`ADV:grants.attack.${actionType}`] = true;
    }

    const attackDisadvantage = grants.disadvantage?.attack || {};
    let grantsDisadvantage;
    if (grants.disadvantage?.all && evalCondition(grants.disadvantage.all, conditionData)) {
      grantsDisadvantage = true;
      this.attackAdvAttribution[`DIS:grants.disadvantage.all`] = true;
    }
    if (attackDisadvantage.all && evalCondition(attackDisadvantage.all, conditionData)) {
      grantsDisadvantage = true;
      this.attackAdvAttribution[`DIS:grants.attack.all`] = true;
    }
    if (attackDisadvantage[actionType] && evalCondition(attackDisadvantage[actionType], conditionData)) {
      grantsDisadvantage = true;
      this.attackAdvAttribution[`DIS:grants.attack.${actionType}`] = true;
    }
    this.advantage = this.advantage || grantsAdvantage;
    this.disadvantage = this.disadvantage || grantsDisadvantage;
  }

  async expireTargetEffects(expireList: string[]) {
    for (let target of this.targets) {
      const expiredEffects: (string | null)[] | undefined = target.actor?.effects?.filter(ef => {
        const wasAttacked = this.item?.hasAttack;
        //TODO this test will fail for damage only workflows - need to check the damage rolled instead
        const wasHit = this.hitTargets?.has(target) || this.hitTargetsEC?.has(target);
        //@ts-ignore token.document
        const wasDamaged = wasHit && this.damageList && (this.damageList.find(dl => dl.tokenUuid === (target.uuid ?? target.document.uuid) && dl.appliedDamage > 0));
        //@ts-ignore .flags v10
        const specialDuration = getProperty(ef.flags, "dae.specialDuration");
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
        const abl = this.item?.system.save?.ability;
        if (this.saveItem.hasSave && expireList.includes(`isSaveSuccess`) && specialDuration.includes(`isSaveSuccess.${abl}`) && this.saves.has(target)) return true;
        if (this.saveItem.hasSave && expireList.includes(`isSaveFailure`) && specialDuration.includes(`isSaveFailure.${abl}`) && !this.saves.has(target)) return true;
        return false;
      }).map(ef => ef.id);
      if (expiredEffects?.length ?? 0 > 0) {
        await timedAwaitExecuteAsGM("removeEffects", {
          actorUuid: target.actor?.uuid,
          effects: expiredEffects,
          options: { "expiry-reason": `midi-qol:${expireList}` }
        });
      }
    }
  }

  getDamageBonusMacros(): string | undefined {
    const actorMacros = getProperty(this.actor.flags, `${game.system.id}.DamageBonusMacro`);
    const itemMacros = this.onUseMacros?.getMacros("damageBonus")
    if (!itemMacros?.length) return actorMacros;
    if (!actorMacros?.length) return itemMacros;
    return `${actorMacros},${itemMacros}`;
  }


  async rollBonusDamage(damageBonusMacro) {
    let formula = "";
    var flavor = "";
    var extraDamages: (damageBonusMacroResult | boolean | undefined)[] = await this.callMacros(this.item, damageBonusMacro, "DamageBonus", "DamageBonus");
    for (let extraDamage of extraDamages) {
      if (!extraDamage || typeof extraDamage === "boolean") continue;
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
      const roll = await (new Roll(formula, (this.item ?? this.actor).getRollData()).evaluate({ async: true }));
      await this.setBonusDamageRoll(roll);
      this.bonusDamageFlavor = flavor ?? "";
      this.bonusDamageDetail = createDamageList({ roll: this.bonusDamageRoll, item: null, versatile: false, defaultType: this.defaultDamageType });
    } catch (err) {
      console.warn(`midi-qol | error in evaluating${formula} in bonus damage`, err);
      this.bonusDamageRoll = null;
      this.bonusDamageDetail = [];
    }
    if (this.bonusDamageRoll !== null) {
      if (dice3dEnabled()
        && configSettings.mergeCard
        && !(configSettings.gmHide3dDice && game.user?.isGM)
        && !(this.actor?.isNpc && game.settings.get("dice-so-nice", "hideNpcRolls"))) {
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
        if (!installedModules.get("betterrolls5e")) { // exclude better rolls since it does the roll itself
          //@ts-ignore game.dice3d
          await game.dice3d.showForRoll(this.bonusDamageRoll, game.user, true, whisperIds, rollMode === "blindroll" && !game.user.isGM)
        }
      }
    }
    return;
  }

  getMacroData(): any {
    let targets: TokenDocument[] = [];
    let targetUuids: string[] = []
    let failedSaves: TokenDocument[] = [];
    let criticalSaves: TokenDocument[] = [];
    let criticalSaveUuids: string[] = [];
    let fumbleSaves: TokenDocument[] = [];
    let fumbleSaveUuids: string[] = [];
    let failedSaveUuids: string[] = [];
    let hitTargets: TokenDocument[] = [];
    let hitTargetsEC: TokenDocument[] = [];
    let hitTargetUuidsEC: string[] = [];
    let hitTargetUuids: string[] = [];
    let saves: TokenDocument[] = [];
    let saveUuids: string[] = [];
    let superSavers: TokenDocument[] = [];
    let superSaverUuids: string[] = [];
    let semiSuperSavers: TokenDocument[] = [];
    let semiSuperSaverUuids: string[] = [];
    for (let target of this.targets) {
      targets.push((target instanceof Token) ? target.document : target);
      targetUuids.push(target instanceof Token ? target.document?.uuid : target.uuid);
    }
    for (let save of this.saves) {
      saves.push((save instanceof Token) ? save.document : save);
      saveUuids.push((save instanceof Token) ? save.document?.uuid : save.uuid);
    }
    for (let hit of this.hitTargets) {
      hitTargets.push(hit instanceof Token ? hit.document : hit);
      hitTargetUuids.push(hit instanceof Token ? hit.document?.uuid : hit.uuid)
    }
    for (let hit of this.hitTargetsEC) {
      hitTargetsEC.push(hit.document ?? hit);
      hitTargetUuidsEC.push(hit.document?.uuid ?? hit.uuid)
    }

    for (let failed of this.failedSaves) {
      failedSaves.push(failed instanceof Token ? failed.document : failed);
      failedSaveUuids.push(failed instanceof Token ? failed.document?.uuid : failed.uuid);
    }
    for (let critical of this.criticalSaves) {
      criticalSaves.push(critical instanceof Token ? critical.document : critical);
      criticalSaveUuids.push(critical instanceof Token ? critical.document?.uuid : critical.uuid);
    }
    for (let fumble of this.fumbleSaves) {
      fumbleSaves.push(fumble instanceof Token ? fumble.document : fumble);
      fumbleSaveUuids.push(fumble instanceof Token ? fumble.document?.uuid : fumble.uuid);
    }
    for (let save of this.superSavers) {
      superSavers.push(save instanceof Token ? save.document : save);
      superSaverUuids.push(save instanceof Token ? save.document?.uuid : save.uuid);
    };
    for (let save of this.semiSuperSavers) {
      semiSuperSavers.push(save instanceof Token ? save.document : save);
      semiSuperSaverUuids.push(save instanceof Token ? save.document?.uuid : save.uuid);
    };
    // const itemData = this.item?.toObject(false); TODO think about this some more for v10
    const itemData = this.item?.toObject(false) ?? {};
    itemData.data = itemData.system; // Try and support the old.data
    itemData.uuid = this.item?.uuid; // provide the uuid so the actual item can be recovered
    return {
      actor: this.actor,
      actorData: this.actor.toObject(false),
      actorUuid: this.actor.uuid,
      advantage: this.advantage,
      attackD20: this.diceRoll,
      attackRoll: this.attackRoll,
      attackTotal: this.attackTotal,
      bonusDamageDetail: this.bonusDamageDetail,
      bonusDamageFlavor: this.bonusDamageFlavor,
      bonusDamageHTML: this.bonusDamageHTML,
      bonusDamageRoll: this.bonusDamageRoll,
      bonusDamageTotal: this.bonusDamageTotal,
      concentrationData: getProperty(this.actor.flags, "midi-qol.concentration-data"),
      criticalSaves,
      criticalSaveUuids,
      damageDetail: this.damageDetail,
      damageList: this.damageList,
      damageRoll: this.damageRoll,
      damageTotal: this.damageTotal,
      diceRoll: this.diceRoll,
      disadvantage: this.disadvantage,
      event: this.event,
      failedSaves,
      failedSaveUuids,
      fumbleSaves,
      fumbleSaveUuids,
      hitTargets,
      hitTargetsEC,
      hitTargetUuids,
      hitTargetUuidsEC,
      id: this.item?.id,
      isCritical: this.rollOptions.critical || this.isCritical || this.workflowOptions.isCritical,
      isFumble: this.isFumble,
      isVersatile: this.rollOptions.versatile || this.isVersatile || this.workflowOptions.isVersatile,
      item: itemData,
      itemCardId: this.itemCardId,
      itemData,
      itemUuid: this.item?.uuid,
      otherDamageDetail: this.otherDamageDetail,
      otherDamageList: this.otherDamageList,
      otherDamageTotal: this.otherDamageTotal,
      powerLevel: game.system.id === "sw5e" ? this.itemLevel : undefined,
      rollData: (this.item ?? this.actor).getRollData(),
      rollOptions: this.rollOptions,
      saves,
      saveUuids,
      semiSuperSavers,
      semiSuperSaverUuids,
      spellLevel: this.itemLevel,
      superSavers,
      superSaverUuids,
      targets,
      targetUuids,
      templateId: this.templateId, // deprecated
      templateUuid: this.templateUuid,
      tokenId: this.tokenId,
      tokenUuid: this.tokenUuid,
      uuid: this.uuid,
      workflowOptions: this.workflowOptions
    }
  }

  async callMacros(item, macros, tag, macroPass): Promise<(damageBonusMacroResult | boolean | undefined)[]> {
    if (!macros || macros?.length === 0) return [];
    const macroNames = macros.split(",").map(s => s.trim());
    let values: Promise<damageBonusMacroResult | any>[] = [];
    let results: damageBonusMacroResult[];

    const macroData = this.getMacroData();
    macroData.tag = tag;
    macroData.macroPass = macroPass;
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
    let macroCommand;
    try {
      if (name.startsWith(MQItemMacroLabel)) { // special short circuit eval for itemMacro since it can be execute as GM
        var itemMacro;
        //  item = this.item;
        if (name === MQItemMacroLabel) {
          if (!item) return {};
          itemMacro = getProperty(item.flags, "itemacro.macro");
          macroData.sourceItemUuid = item?.uuid;
        } else {
          const parts = name.split(".");
          const itemName = parts.slice(1).join(".");
          item = this.actor.items.find(i => i.name === itemName && getProperty(i.flags, "itemacro.macro"))
          if (!item) {
            // Try to find a UUID reference for the macro
            let uuid;
            if (name.includes("["))
              uuid = name.replace(`${MQItemMacroLabel}.`, "").replace("@", "").replace("[", ".").replace("]", "").replace(/{.*}/, "");
            else uuid = name.replace(`${MQItemMacroLabel}.`, "")
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
          itemMacro = getProperty(item.flags, "itemacro.macro");
          macroData.sourceItemUuid = item.uuid;
          if (!itemMacro?.command && !itemMacro?.data?.command) { // TODO check this for itemMacro v10
            if (debugEnabled > 0) warn(`could not find item macro ${name}`);
            return {};
          }
        }
        macroCommand = itemMacro?.command ?? itemMacro?.data?.command ?? `console.warn('midi-qol | no item macro found for ${name}')`;
      } else { // get a world macro.
        const macro = game.macros?.getName(name.replaceAll('"', ''));
        if (!macro) console.warn("midi-qol could not find macro", name);
        //@ts-ignore .type v10
        if (macro?.type === "chat") {
          macro.execute(); // use the core foundry processing for chat macros
          return {}
        }
        macroData.speaker = this.speaker;
        macroData.actor = this.actor;
        //@ts-ignore .command v10
        macroCommand = macro?.command ?? `console.warn("midi-qol | no macro ${name.replaceAll('"', '')} found")`;
      }

      const speaker = this.speaker;
      const actor = this.actor;
      const token = canvas?.tokens?.get(this.tokenId);
      const character = game.user?.character;
      const args = [macroData];
      const body = `return (async () => {
        ${macroCommand}
      })()`;
      const fn = Function("{speaker, actor, token, character, item, args}={}", body);
      return fn.call(this, { speaker, actor, token, character, item, args });
    } catch (err) {
      ui.notifications?.error(`There was an error running your macro. See the console (F12) for details`);
      error("Error evaluating macro ", err)
    }
    return {};
  }

  async removeEffectsButton() {
    if (!this.itemCardId) return;
    const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId);
    if (chatMessage) {
      const buttonRe = /<button data-action="applyEffects">[^<]*<\/button>/;
      //@ts-ignore .content v10
      let content = duplicate(chatMessage.content);
      content = content?.replace(buttonRe, "");
      await chatMessage.update({ content })
    }
  }


  async displayAttackRoll(doMerge, displayOptions: any = {}) {
    const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
    //@ts-ignore .content v10
    let content = (chatMessage && duplicate(chatMessage.content)) || "";
    //@ts-ignore .flags v10
    const flags = chatMessage?.flags || {};
    let newFlags = {};

    if (game.user?.isGM && this.useActiveDefence) {
      const searchRe = /<div class="midi-qol-attack-roll">[\s\S]*?<div class="end-midi-qol-attack-roll">/
      const attackString = `${i18n("midi-qol.ActiveDefenceString")}${configSettings.displaySaveDC ? " " + this.activeDefenceDC : ""}`;
      const replaceString = `<div class="midi-qol-attack-roll"> <div style="text-align:center">${attackString}</div><div class="end-midi-qol-attack-roll">`
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
      //@ts-ignore advantageMode - advantageMode is set when the roll is actually done, options.advantage/disadvantage are what are passed into the roll
      const advantageMode = this.attackRoll?.options?.advantageMode;
      if (advantageMode !== undefined) {
        this.advantage = advantageMode === 1;
        this.disadvantage = advantageMode === -1;
      } else {
        this.advantage = options.advantage;
        this.disadvantage = options.disadvantage;
      }
      // const attackString = this.advantage ? i18n(`${this.systemString}.Advantage`) : this.disadvantage ? i18n(`${this.systemString}.Disadvantage`) : i18n(`${this.systemString}.Attack`)

      const attackString = this.advantage ? i18n(`${this.systemString}.Advantage`) : this.disadvantage ? i18n(`${this.systemString}.Disadvantage`) : i18n(`${this.systemString}.Attack`)

      let replaceString = `<div class="midi-qol-attack-roll"><div style="text-align:center" >${attackString}</div>${this.attackRollHTML}<div class="end-midi-qol-attack-roll">`

      content = content.replace(searchRe, replaceString);
      if (this.attackRollCount > 1) {
        const attackButtonRe = /<button data-action="attack">(\[\d*\] )*([^<]+)<\/button>/;
        content = content.replace(attackButtonRe, `<button data-action="attack">[${this.attackRollCount}] $2</button>`);
      }

      if (this.attackRoll?.dice.length) {
        const d: any = this.attackRoll.dice[0]; // should be a dice term but DiceTerm.options not defined
        const isD20 = (d.faces === 20);
        if (isD20) {
          // Highlight successes and failures
          // if ((d.options.critical && d.total >= d.options.critical) || this.isCritical) {
          if (this.isCritical) {
            content = content.replace('dice-total', 'dice-total critical');
            // } else if ((d.options.fumble && d.total <= d.options.fumble) || this.isFumble) {
          } else if (this.isFumble) {
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
          roll: this.attackRoll?.roll,
          displayId: this.displayId,
          isCritical: this.isCritical,
          isFumble: this.isFumble,
          isHit: this.hitTargets.size > 0,
          isHitEC: this.hitTargetsEC.size > 0,
          d20AttackRoll: this.d20AttackRoll,
          GMOnlyAttackRoll: displayOptions.GMOnlyAttackRoll ?? false
        }
      }, { overwrite: true, inplace: false }
      )
    }
    await chatMessage?.update({ content, flags: newFlags });
  }

  get damageFlavor() {
    allDamageTypes = mergeObject(getSystemCONFIG().damageTypes, getSystemCONFIG().healingTypes, { inplace: false });
    if (this.damageDetail.filter(d => d.damage !== 0).length === 0) return `(${allDamageTypes[this.defaultDamageType ?? "none"]})`
    return `(${this.damageDetail.filter(d => d.damage !== 0).map(d => allDamageTypes[d.type] || d.type)})`;
  }

  async displayDamageRoll(doMerge) {
    let chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");
    //@ts-ignore .content v10
    let content = (chatMessage && duplicate(chatMessage.content)) ?? "";
    // TODO work out what to do if we are a damage only workflow and betters rolls is active - display update wont work.
    if (getRemoveDamageButtons() || this.workflowType !== "Workflow") {
      const versatileRe = /<button data-action="versatile">[^<]*<\/button>/
      const damageRe = /<button data-action="damage">[^<]*<\/button>/
      const formulaRe = /<button data-action="formula">[^<]*<\/button>/
      content = content?.replace(damageRe, "<div></div>")
      content = content?.replace(formulaRe, "")
      content = content?.replace(versatileRe, "")
    }
    //@ts-ignore .flags v10
    var newFlags = chatMessage?.flags || {};
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
          const otherReplaceString = `<div class="midi-qol-other-roll"><div style="text-align:center" >${this.otherDamageItem?.name ?? this.damageFlavor}${this.otherDamageHTML || ""}</div><div class="end-midi-qol-other-roll">`
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
          // roll: this.damageCardData.roll,
          roll: this.damageRoll?.roll,
          damageDetail: this.useOther ? undefined : this.damageDetail,
          damageTotal: this.useOther ? undefined : this.damageTotal,
          otherDamageDetail: this.useOther ? this.damageDetail : this.otherDamageDetail,
          otherDamageTotal: this.useOther ? this.damageTotal : this.otherDamageTotal,
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
      setProperty(messageData, `flags.${game.system.id}.roll.type`, "damage");
      if (game.system.id === "sw5e") setProperty(messageData, "flags.sw5e.roll.type", "damage");
      this.bonusDamageRoll.toMessage(messageData);
    }

    await chatMessage?.update({ "content": content, flags: newFlags });
  }

  async displayTargets(whisper = false) {
    if (!configSettings.mergeCard) return;
    this.hitDisplayData = {};
    for (let targetToken of this.targets) {
      //@ts-ignore .document v10
      let img = targetToken.document?.texture.src || targetToken.actor?.img;
      if (configSettings.usePlayerPortrait && targetToken.actor?.type === "character") {
        //@ts-ignore .document v10
        img = targetToken.actor?.img || targetToken.document?.texture.src;
      }
      if (VideoHelper.hasVideoExtension(img ?? "")) {
        img = await game.video.createThumbnail(img ?? "", { width: 100, height: 100 });
      }
      this.hitDisplayData[targetToken instanceof Token ? targetToken.document?.uuid : targetToken.uuid] = ({ isPC: targetToken.actor?.hasPlayerOwner, target: targetToken, hitString: "targets", attackType: "", img, gmName: targetToken.name, playerName: getTokenPlayerName(targetToken instanceof TokenDocument ? targetToken : targetToken.document), bonusAC: 0 });
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
      displayHitResultNumeric: configSettings.displayHitResultNumeric && !this.isFumble && !this.isCritical
    };
    if (debugEnabled > 0) warn("displayHits ", templateData, whisper, doMerge);
    const hitContent = await renderTemplate("modules/midi-qol/templates/hits.html", templateData) || "No Targets";
    const chatMessage: ChatMessage | undefined = game.messages?.get(this.itemCardId ?? "");

    if (doMerge && chatMessage) {
      //@ts-ignore .content v10
      var content = (chatMessage && duplicate(chatMessage.content)) ?? "";
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
          /*
          if (content && getRemoveAttackButtons() && showHits) {
            const searchRe = /<button data-action="attack">[^<]*<\/button>/;
            content = content.replace(searchRe, "");
          }
          */
          searchString = /<div class="midi-qol-hits-display">[\s\S]*?<div class="end-midi-qol-hits-display">/;
          replaceString = `<div class="midi-qol-hits-display">${hitContent}<div class="end-midi-qol-hits-display">`
          content = content.replace(searchString, replaceString);
          await chatMessage.update({
            "content": content,
            timestamp: Date.now(),
            "flags.midi-qol.type": MESSAGETYPES.HITS,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            "flags.midi-qol.waitForDiceSoNice": true,
            "flags.midi-qol.hideTag": this.hideTags,
            "flags.midi-qol.displayId": this.displayId,
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
      speaker.alias = (configSettings.useTokenNames && speaker.token) ? canvas?.tokens?.get(speaker.token)?.name : speaker.alias;
      speaker.scene = canvas?.scene?.id
      if ((validTargetTokens(game.user?.targets ?? new Set())).size > 0) {
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
        if (whisper || !(["roll", "publicroll"].includes(rollMode))) {
          chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u => u.active).map(u => u.id);
          if (!game.user?.isGM && rollMode !== "blindroll" && !whisper) chatData.whisper.push(game.user?.id); // message is going to be created by GM add self
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
        if (!game.user?.isGM)
          returns = await timedAwaitExecuteAsGM("createChatMessage", { chatData });
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
      //@ts-ignore .content v10
      let content = duplicate(chatMessage.content)
      var searchString;
      var replaceString;
      let saveType = "midi-qol.saving-throws";
      if (this.item.system.type === "abil") saveType = "midi-qol.ability-checks"
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
          //@ts-ignore .content v10
          chatMessage.content = content;
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
      if (configSettings.autoCheckSaves === "whisper" || whisper || !(["roll", "publicroll"].includes(rollMode))) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
        chatData.messageData.user = game.user?.id; // ChatMessage.getWhisperRecipients("GM").find(u => u.active);
        if (rollMode === "blindroll") {
          chatData["blind"] = true;
        }

        if (debugEnabled > 1) debug("Trying to whisper message", chatData)
      }
      if (this.flagTags) chatData.flags = mergeObject(chatData.flags ?? {}, this.flagTags);
      // await ChatMessage.create(chatData);
      // Non GMS don't have permission to create the message so hand it off to a gm client
      await timedAwaitExecuteAsGM("createChatMessage", { chatData });
    };
  }

  /**
   * update this.saves to be a Set of successful saves from the set of tokens this.hitTargets and failed saves to be the complement
   */
  async checkSaves(whisper = false, simulate = false) {

    if (debugEnabled > 1) debug(`checkSaves: whisper ${whisper}  hit targets ${this.hitTargets}`)
    if (this.hitTargets.size <= 0 && this.hitTargetsEC.size <= 0) {
      this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`
      return;
    }

    let rollDC = this.saveItem.system.save.dc;
    if (this.saveItem.getSaveDC) {
      rollDC = this.saveItem.getSaveDC();
    }

    let promises: Promise<any>[] = [];
    //@ts-ignore actor.rollAbilitySave
    var rollAction = CONFIG.Actor.documentClass.prototype.rollAbilitySave;
    var rollType = "save"
    if (this.saveItem.system.actionType === "abil") {
      rollType = "abil"
      //@ts-ignore actor.rollAbilityTest
      rollAction = CONFIG.Actor.documentClass.prototype.rollAbilityTest;
    } else {
      const midiFlags = this.saveItem.flags ? this.saveItem.flags["midi-qol"] : undefined;
      if (midiFlags?.overTimeSkillRoll) {
        rollType = "skill"
        //@ts-ignore actor.rollAbilityTest
        rollAction = CONFIG.Actor.documentClass.prototype.rollSkill;
        this.saveItem.system.save.ability = midiFlags.overTimeSkillRoll;
      }
    }
    let rollAbility = this.saveItem.system.save.ability;
    // make sure saving throws are reenabled.

    const playerMonksTB = !simulate && installedModules.get("monks-tokenbar") && configSettings.playerRollSaves === "mtb";
    let monkRequestsPlayer: any[] = [];
    let monkRequestsGM: any[] = [];
    let showRoll = configSettings.autoCheckSaves === "allShow";
    if (simulate) showRoll = false;
    try {
      const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);

      let actorDisposition;
      if (this.token && this.token.document?.disposition) actorDisposition = this.token.document.disposition;
      else { // no token to use so make a guess
        actorDisposition = this.actor?.type === "npc" ? -1 : 1;
      }

      for (let target of allHitTargets) {
        let isFriendly = target.document.disposition === actorDisposition;
        if (!target.actor) continue;  // no actor means multi levels or bugged actor - but we won't roll a save
        let advantage: Boolean | undefined = undefined;
        // If spell, check for magic resistance
        if (this.saveItem?.type === "spell" || this.saveItem?.flags.midiProperties?.magiceffect || this.item?.flags.midiProperties?.magiceffect) {
          // check magic resistance in custom damage reduction traits
          //@ts-ignore traits
          advantage = (target?.actor?.system.traits?.dr?.custom || "").includes(i18n("midi-qol.MagicResistant").trim());
          // check magic resistance as a feature (based on the SRD name as provided by the DnD5e system)
          advantage = advantage || target?.actor?.items.find(a => a.type === "feat" && a.name === i18n("midi-qol.MagicResistanceFeat").trim()) !== undefined;
          if (!advantage) advantage = undefined;
          const magicResistanceFlags = getProperty(target.actor, "flags.midi-qol.magicResistance");
          if (magicResistanceFlags && (magicResistanceFlags?.all || getProperty(magicResistanceFlags, rollAbility))) {
            advantage = true;
          }
          const magicVulnerabilityFlags = getProperty(target.actor, "flags.midi-qol.magicVulnerability");
          if (magicVulnerabilityFlags && (magicVulnerabilityFlags?.all || getProperty(magicVulnerabilityFlags, rollAbility))) {
            advantage = false;
          }

          if (advantage) this.advantageSaves.add(target);
          else if (advantage === false) this.disadvantageSaves.add(target);
          else advantage = undefined; // The value is looked at in player saves
          if (debugEnabled > 1) debug(`${target.actor.name} resistant to magic : ${advantage}`);
        }
        const settingsOptions = procAdvantage(target.actor, rollType, this.saveItem.system.save.ability, {});
        if (settingsOptions.advantage) advantage = true;
        if (settingsOptions.disadvantage) advantage = false;
        if (this.saveItem.flags["midi-qol"]?.isConcentrationCheck) {
          const concAdvFlag = getProperty(target.actor.flags, "midi-qol.advantage.concentration");
          const concDisadvFlag = getProperty(target.actor.flags, "midi-qol.disadvantage.concentration");
          let concAdv = advantage === true;
          let concDisadv = advantage === false;
          if (concAdvFlag || concDisadvFlag) {
            const conditionData = this.createConditionData(this, this.token);
            if (concAdvFlag && evalCondition(concAdvFlag, conditionData)) concAdv = true;
            if (concDisadvFlag && evalCondition(concDisadvFlag, conditionData)) concDisadv = true;
          }

          if (concAdv && !concDisadv) {
            advantage = true;
            this.advantageSaves.add(target);
          } else if (!concAdv && concDisadv) {
            advantage = false;
            this.disadvantageSaves.add(target);
          } else {
            advantage = undefined;
          }
        }

        var player = playerFor(target);
        if (!player) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
        let promptPlayer = (!player?.isGM && configSettings.playerRollSaves !== "none");
        if (simulate) promptPlayer = false;
        let GMprompt;
        let gmMonksTB;
        if (player?.isGM) {
          const targetDocument = target.document ?? target;
          const monksTBSetting = targetDocument.isLinked ? configSettings.rollNPCLinkedSaves === "mtb" : configSettings.rollNPCSaves === "mtb"
          gmMonksTB = installedModules.get("monks-tokenbar") && monksTBSetting;
          GMprompt = (targetDocument.isLinked ? configSettings.rollNPCLinkedSaves : configSettings.rollNPCSaves);
          promptPlayer = GMprompt !== "auto";
          if (simulate) {
            gmMonksTB = false;
            GMprompt = false;
            promptPlayer = false;
          }
        }
        if (isFriendly && this.saveItem.system.description.value.includes(i18n("midi-qol.autoFailFriendly"))) {
          const failure = await new Roll("-1").roll({async: true});
          promises.push(new Promise((resolve) => {
            resolve(failure);
          }));
        } else if ((!player?.isGM && playerMonksTB) || (player?.isGM && gmMonksTB)) {
          promises.push(new Promise((resolve) => {
            let requestId = target.id;
            this.saveRequests[requestId] = resolve;
          }));

          const requests = player?.isGM ? monkRequestsGM : monkRequestsPlayer;
          requests.push({
            token: target.id,
            advantage: advantage === true,
            disadvantage: advantage === false,
            altKey: advantage === true,
            ctrlKey: advantage === false,
            fastForward: false
          })
        } else if (promptPlayer && player?.active) {
          if (debugEnabled > 0) warn(`Player ${player?.name} controls actor ${target.actor.name} - requesting ${getSystemCONFIG().abilities[this.saveItem.system.save.ability]} save`);
          promises.push(new Promise((resolve) => {
            let requestId = target.actor?.id ?? randomID();
            const playerId = player?.id;
            if (["letme", "letmeQuery"].includes(configSettings.playerRollSaves) && installedModules.get("lmrtfy")) requestId = randomID();
            if (["letme", "letmeQuery"].includes(GMprompt) && installedModules.get("lmrtfy")) requestId = randomID();

            this.saveRequests[requestId] = resolve;

            requestPCSave(this.saveItem.system.save.ability, rollType, player, target.actor, advantage, this.saveItem.name, rollDC, requestId, GMprompt)

            // set a timeout for taking over the roll
            if (configSettings.playerSaveTimeout > 0) {
              this.saveTimeouts[requestId] = setTimeout(async () => {
                if (this.saveRequests[requestId]) {
                  delete this.saveRequests[requestId];
                  delete this.saveTimeouts[requestId];
                  let result;
                  if (!game.user?.isGM && configSettings.autoCheckSaves === "allShow") {
                    // non-gm users don't have permission to create chat cards impersonating the GM so hand the role to a GM client
                    result = await timedAwaitExecuteAsGM("rollAbility", {
                      targetUuid: target.actor?.uuid ?? "",
                      request: rollType,
                      ability: this.saveItem.system.save.ability,
                      showRoll,
                      options: { messageData: { user: playerId }, target: rollDC, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true }
                    });
                  } else {
                    result = await rollAction.bind(target.actor)(this.saveItem.system.save.ability, { messageData: { user: playerId }, chatMessage: showRoll, mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true });
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
            ability: this.saveItem.system.save.ability,
            // showRoll: whisper && !simulate,
            options: { simulate, target: rollDC, messageData: { user: owner?.id }, chatMessage: showRoll, rollMode: whisper ? "gmroll" : "gmroll", mapKeys: false, advantage: advantage === true, disadvantage: advantage === false, fastForward: true },
          }));
        }
      }
    } catch (err) {
      console.warn(err)
    } finally {
    }

    if (!whisper) {
      const monkRequests = monkRequestsPlayer.concat(monkRequestsGM);
      const requestData: any = {
        tokenData: monkRequests,
        request: `${rollType === "abil" ? "ability" : rollType}:${this.saveItem.system.save.ability}`,
        silent: true,
        rollMode: whisper ? "gmroll" : "roll" // should be "publicroll" but monks does not check it
      };
      // Display dc triggers the tick/cross on monks tb
      if (configSettings.displaySaveDC && "whisper" !== configSettings.autoCheckSaves) requestData.dc = rollDC
      if (monkRequests.length > 0) {
        timedExecuteAsGM("monksTokenBarSaves", requestData);
      };
    } else {
      const requestDataGM: any = {
        tokenData: monkRequestsGM,
        request: `${rollType === "abil" ? "ability" : rollType}:${this.saveItem.system.save.ability}`,
        silent: true,
        rollMode: whisper ? "selfroll" : "roll" // should be "publicroll" but monks does not check it
      }
      const requestDataPlayer: any = {
        tokenData: monkRequestsPlayer,
        request: `${rollType === "abil" ? "ability" : rollType}:${this.saveItem.system.save.ability}`,
        silent: true,
        rollMode: "roll" // should be "publicroll" but monks does not check it
      }
      // Display dc triggers the tick/cross on monks tb
      if (configSettings.displaySaveDC && "whisper" !== configSettings.autoCheckSaves) {
        requestDataPlayer.dc = rollDC
        requestDataGM.dc = rollDC
      }
      if (monkRequestsPlayer.length > 0) {
        timedExecuteAsGM("monksTokenBarSaves", requestDataPlayer);
      };
      if (monkRequestsGM.length > 0) {
        timedExecuteAsGM("monksTokenBarSaves", requestDataGM);
      };


    }
    if (debugEnabled > 1) debug("check saves: requests are ", this.saveRequests)
    var results = await Promise.all(promises);
    // replace betterrolls results (customRoll) with pseudo normal roll
    results = results.map(result => result.entries ? this.processCustomRoll(result) : result);
    this.saveResults = results;
    let i = 0;
    const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
    // for (let target of this.hitTargets) {
    for (let target of allHitTargets) {
      if (!target.actor) continue; // these were skipped when doing the rolls so they can be skipped now
      if (!results[i]) error("Token ", target, "could not roll save/check assuming 0");
      let result = results[i];
      let rollTotal = results[i]?.total || 0;
      let rollDetail = result;
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
      if (getProperty(this.actor, "flags.midi-qol.sculptSpells") && (this.rangeTargeting || this.templateTargeting) && this.item?.system.school === "evo" && this.preSelectedTargets.has(target)) {
        saved = true;
        this.superSavers.add(target)
      }
      if (getProperty(this.actor, "flags.midi-qol.carefulSpells") && (this.rangeTargeting || this.templateTargeting) && this.item?.system.school === "evo" && this.preSelectedTargets.has(target)) {
        saved = true;
      }
      if (isCritical) this.criticalSaves.add(target);
      if (!result.isBR && !saved) {
        //@ts-ignore
        if (!(result instanceof CONFIG.Dice.D20Roll)) result = CONFIG.Dice.D20Roll.fromJSON(JSON.stringify(result));
        // const newRoll = await bonusCheck(target.actor, result, rollType, "fail")
        if (collectBonusFlags(target.actor, rollType, "fail").length > 0) {
          let owner: User | undefined = playerFor(target);
          if (!owner?.active) owner = game.users?.find((u: User) => u.isGM && u.active);
          if (owner) {
            let newRoll;
            if (owner?.isGM && game.user?.isGM) {
              newRoll = await bonusCheck(target.actor, result, rollType, "fail")
            } else {
              newRoll = await socketlibSocket.executeAsUser("bonusCheck", owner?.id, {
                actorUuid: target.actor.uuid,
                result: JSON.stringify(result.toJSON()),
                rollType,
                selector: "fail"
              });

            }
            rollTotal = newRoll.total;
            rollDetail = newRoll;
          }
        }
        saved = rollTotal >= rollDC;
        const dterm: DiceTerm = rollDetail.terms[0];
        const diceRoll = dterm?.results?.find(result => result.active)?.result ?? (rollDetail.total);
        //@ts-ignore
        isFumble = diceRoll <= (dterm.options?.fumble ?? 1)
        //@ts-ignore
        isCritical = diceRoll >= (dterm.options?.critical ?? 20);
      }
      if (isFumble && !saved) this.fumbleSaves.add(target);
      if (this.checkSuperSaver(target, this.saveItem.system.save.ability))
        this.superSavers.add(target);
      if (this.checkSemiSuperSaver(target, this.saveItem.system.save.ability))
        this.semiSuperSavers.add(target);

      if (this.item.flags["midi-qol"]?.isConcentrationCheck) {
        const checkBonus = getProperty(target, "actor.flags.midi-qol.concentrationSaveBonus");
        if (checkBonus) {
          const rollBonus = (await new Roll(checkBonus, target.actor?.getRollData()).evaluate({ async: true })).total;
          rollTotal += rollBonus;
          //TODO 
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
      let adv = "";
      if (configSettings.displaySaveAdvantage) {
        adv = this.advantageSaves.has(target) ? `(${i18n("DND5E.Advantage")})` : "";
        if (this.disadvantageSaves.has(target)) adv = `(${i18n("DND5E.Disadvantage")})`;
        if (game.system.id === "sw5e") {
          adv = this.advantageSaves.has(target) ? `(${i18n("SW5E.Advantage")})` : "";
          if (this.disadvantageSaves.has(target)) adv = `(${i18n("SW5E.Disadvantage")})`;
        }
      }
      let img: string = target.document?.texture?.src ?? target.actor.img ?? "";
      if (configSettings.usePlayerPortrait && target.actor.type === "character")
        img = target.actor?.img ?? target.document?.texture?.src ?? "";

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
    if (game.system.id === "dnd5e") DCString = i18n(`${this.systemString}.AbbreviationDC`)
    else if (i18n("SW5E.AbbreviationDC") !== "SW5E.AbbreviationDC") {
      DCString = i18n("SW5E.AbbreviationDC");
    }

    if (rollType === "save")
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">${DCString} ${rollDC}</label> ${getSystemCONFIG().abilities[rollAbility]} ${i18n(allHitTargets.size > 1 ? "midi-qol.saving-throws" : "midi-qol.saving-throw")}:`;
    else if (rollType === "abil")
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">${DCString} ${rollDC}</label> ${getSystemCONFIG().abilities[rollAbility]} ${i18n(allHitTargets.size > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check")}:`;
    else if (rollType === "skill") {
      this.saveDisplayFlavor = `${this.item.name} <label class="midi-qol-saveDC">${DCString} ${rollDC}</label> ${getSystemCONFIG().skills[rollAbility]}`; // ${i18n(this.hitTargets.size > 1 ? "midi-qol.ability-checks" : "midi-qol.ability-check")}:
    }
  }
  monksSavingCheck(message, update, options, user) {
    if (!update.flags || !update.flags["monks-tokenbar"]) return true;
    const updateFlags = update.flags["monks-tokenbar"];
    const mflags = message.flags["monks-tokenbar"];
    for (let key of Object.keys(mflags)) {
      if (!key.startsWith("token")) continue;
      const requestId = key.replace("token", "");
      if (!mflags[key].reveal) continue; // Must be showing the roll
      if (this.saveRequests[requestId]) {
        let roll;
        try {
          roll = Roll.fromJSON(JSON.stringify(mflags[key].roll));
        } catch (err) {
          roll = deepClone(mflags[key].roll);
        }

        const func = this.saveRequests[requestId];
        delete this.saveRequests[requestId];
        func(roll)
      }
    }
    return true;
  }

  processDefenceRoll(message, html, data) {
    if (!this.defenceRequests) return true;
    const isLMRTFY = (installedModules.get("lmrtfy") && message.flags?.lmrtfy?.data);
    if (!isLMRTFY || message.flags?.dnd5e?.roll?.type === "save") return true;
    const requestId = isLMRTFY ? message.flags.lmrtfy.data.requestId : message?.speaker?.actor;
    if (debugEnabled > 0) warn("processSaveToll", isLMRTFY, requestId, this.saveRequests)

    if (!requestId) return true;
    if (!this.defenceRequests[requestId]) return true;

    clearTimeout(this.defenceTimeouts[requestId]);
    const handler = this.defenceRequests[requestId]
    delete this.defenceRequests[requestId];
    delete this.defenceTimeouts[requestId];
    const brFlags = message.flags?.betterrolls5e;
    if (brFlags) {
      const formula = "1d20";
      const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll");
      if (!rollEntry) return true;
      let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
      let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
      let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
      handler({ total, formula, isBR: true, isCritical: brFlags.isCrit, terms: [{ options: { advantage, disadvantage } }] });
    } else {
      handler(message.rolls[0])
    }
    if (game.user?.id !== message.user.id && ["whisper", "all"].includes(configSettings.autoCheckSaves)) html.hide();
    return true;
  }

  processSaveRoll(message, html, data) {
    if (!this.saveRequests) return {};
    const isLMRTFY = message.flags?.lmrtfy?.data;
    const ddbglFlags = message.flags && message.flags["ddb-game-log"];
    const isDDBGL = ddbglFlags?.cls === "save" && !ddbglFlags?.pending;
    if (!isLMRTFY && !isDDBGL && message.flags?.dnd5e?.roll?.type !== "save") return true;
    let requestId = isLMRTFY ? message.flags.lmrtfy.data.requestId : message?.speaker?.actor;
    if (!requestId && isDDBGL) requestId = message?.speaker?.actor;
    if (debugEnabled > 0) warn("processSaveRoll", isLMRTFY, requestId, this.saveRequests)
    if (!requestId) return true;

    if (!this.saveRequests[requestId]) return true;

    if (this.saveRequests[requestId]) {
      clearTimeout(this.saveTimeouts[requestId]);
      const handler = this.saveRequests[requestId]
      delete this.saveRequests[requestId];
      delete this.saveTimeouts[requestId];
      const brFlags = message.flags?.betterrolls5e;

      if (brFlags) {
        const rollEntry = brFlags.entries?.find((e) => e.type === "multiroll");
        if (!rollEntry) return true;
        let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
        let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
        let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
        const formula = rollEntry.formula ?? "1d20";
        handler({ total, formula, isBR: true, isCritical: brFlags.isCrit, terms: [{ options: { advantage, disadvantage } }] });
      } else {
        handler(message.rolls[0])
      }
    }
    if (game.user?.id !== message.user.id && ["whisper", "all"].includes(configSettings.autoCheckSaves)) {
      html.hide();
    }
    return true;
  }

  checkSuperSaver(token, ability: string) {
    const actor = token.actor ?? {};
    const flags = getProperty(actor, "flags.midi-qol.superSaver");
    if (!flags) return false;
    if (flags?.all) return true;
    if (getProperty(flags, `${ability}`)) return true;
    if (getProperty(this.actor, "flags.midi-qol.sculptSpells") && this.item?.school === "evo" && this.preSelectedTargets.has(token)) {
      return true;
    }
    return false;
  }

  checkSemiSuperSaver(token, ability: string) {
    const actor = token.actor ?? {};
    const flags = getProperty(actor, "flags.midi-qol.semiSuperSaver");
    if (!flags) return false;
    if (flags?.all) return true;
    if (getProperty(flags, `${ability}`)) return true;
    return false;
  }

  processCustomRoll(customRoll: any) {

    const formula = "1d20";
    const isSave = customRoll.fields.find(e => e[0] === "check");
    if (!isSave) return true;
    const rollEntry = customRoll.entries?.find((e) => e.type === "multiroll");
    let total = rollEntry?.entries?.find((e) => !e.ignored)?.total ?? -1;
    let advantage = rollEntry ? rollEntry.rollState === "highest" : undefined;
    let disadvantage = rollEntry ? rollEntry.rollState === "lowest" : undefined;
    return ({ total, formula, terms: [{ options: { advantage, disadvantage } }] });
  }

  processBetterRollsChatCard(message, html, data) {
    const brFlags = message.flags?.betterrolls5e;
    if (!brFlags) return true;
    if (debugEnabled > 1) debug("processBetterRollsChatCard", message.html, data)
    const requestId = message.speaker.actor;
    if (!this.saveRequests[requestId]) {
      return true;
    }
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
    //@ts-ignore .options.critical undefined
    let criticalThreshold = this.attackRoll.terms[0].options.critical;
    if (this.targets.size > 0) {
      const midiFlags = this.targets.values().next().value.actor?.flags["midi-qol"];
      const targetFlags = midiFlags?.grants?.criticalThreshold ?? 20;
      criticalThreshold = Math.min(criticalThreshold, Number(targetFlags));
    }
    this.isCritical = this.diceRoll >= criticalThreshold;
    const midiFumble = this.item && (getProperty(this.item, "flags.midi-qol.fumbleThreshold") ?? 1);
    if (!Number.isNumeric(midiFumble)) {
      //@ts-ignore .fumble undefined
      this.isFumble = this.diceRoll <= this.attackRoll.terms[0].options.fumble;
    } else this.isFumble = this.diceRoll <= midiFumble;
    this.attackTotal = this.attackRoll.total ?? 0;
    if (debugEnabled > 1) debug("processAttackRoll: ", this.diceRoll, this.attackTotal, this.isCritical, this.isFumble);
  }

  async checkHits() {
    let isHit = true;
    let isHitEC = false;

    let item = this.item;

    // check for a hit/critical/fumble
    if (item?.system.target?.type === "self") {
      this.targets = await getSelfTargetSet(this.actor);
    }
    if (!this.useActiveDefence) {
      this.hitTargets = new Set();
      this.hitTargetsEC = new Set(); //TO wonder if this can work with active defence?
    };
    this.hitDisplayData = {};
    for (let targetToken of this.targets) {
      let targetName = configSettings.useTokenNames && targetToken.name ? targetToken.name : targetToken.actor?.name;
      //@ts-ignore dnd5e v10
      let targetActor: globalThis.dnd5e.documents.Actor5e = targetToken.actor;
      if (!targetActor) continue; // tokens without actors are an abomination and we refuse to deal with them.
      let targetAC = Number.parseInt(targetActor.system.attributes.ac.value ?? 10);
      const wjVehicle = installedModules.get("wjmais") ? getProperty(targetActor, "flags.wjmais.crew.min") != null : false;
      if (targetActor.type === "vehicle" && !wjVehicle) {
        const inMotion = getProperty(targetActor, "flags.midi-qol.inMotion");
        if (inMotion) targetAC = Number.parseInt(targetActor.system.attributes.ac.flat ?? 10);
        else targetAC = Number.parseInt(targetActor.system.attributes.ac.motionless ?? 10);
      }
      let hitResultNumeric;
      let targetEC = targetActor.system.attributes.ac.EC ?? 0;
      let targetAR = targetActor.system.attributes.ac.AR ?? 0;
      const bonusAC = Number(getProperty(targetActor, "flags.midi-qol.acBonus") ?? 0);

      isHit = false;
      isHitEC = false;
      let attackTotal = this.attackTotal;

      if (this.useActiveDefence) {
        isHit = this.hitTargets.has(targetToken);
        hitResultNumeric = "";
      } else {
        targetAC += bonusAC;
        const midiFlagsAttackBonus = getProperty(targetActor, "flags.midi-qol.grants.attack.bonus");
        if (!this.isFumble) {
          if (midiFlagsAttackBonus) {
            // if (Number.isNumeric(midiFlagsAttackBonus.all)) attackTotal +=  Number.parseInt(midiFlagsAttackBonus.all);
            // if (Number.isNumeric(midiFlagsAttackBonus[item.system.actionType]) && midiFlagsAttackBonus[item.system.actionType]) attackTotal += Number.parseInt(midiFlagsAttackBonus[item.system.actionType]);
            if (midiFlagsAttackBonus?.all) {
              const attackBonus = await (new Roll(midiFlagsAttackBonus.all, targetActor.getRollData()))?.roll({async: true});
              attackTotal += attackBonus?.total ?? 0;
            }
            if (midiFlagsAttackBonus[item.system.actionType]) {
              const attackBonus = await (new Roll(midiFlagsAttackBonus[item.system.actionType], targetActor.getRollData())).roll({async: true});
              attackTotal += attackBonus?.total ?? 0;
            }
          }
          if (checkRule("challengeModeArmor")) isHit = attackTotal > targetAC || this.isCritical;
          else isHit = attackTotal >= targetAC || this.isCritical;

          if (targetEC) isHitEC = checkRule("challengeModeArmor") && attackTotal <= targetAC && attackTotal >= targetEC;
          // check to see if the roll hit the target
          if ((isHit || isHitEC || this.iscritical) && this.item?.hasAttack && this.attackRoll && targetToken !== null && !getProperty(this, "item.flags.midi-qol.noProvokeReaction")) {
            //@ts-ignore
            const result = await doReactions(targetToken, this.tokenUuid, this.attackRoll, "reaction", { item: this.item, workflow: this, workflowOptions: mergeObject(this.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item?.uuid }, { inplace: false, overwrite: true }) });

            if (result?.name) {
              targetActor.prepareData(); // allow for any items applied to the actor - like shield spell
            }
            targetAC = Number.parseInt(targetActor.system.attributes.ac.value) + bonusAC;
            if (targetEC) targetEC = targetActor.system.attributes.ac.EC + bonusAC;
            if (result.ac) targetAC = result.ac + bonusAC; // deal with bonus ac if any.
            if (targetEC) targetEC = targetAC - targetAR;
            isHit = (attackTotal >= targetAC || this.isCritical) && result.name !== "missed";
            if (checkRule("challengeModeArmor")) isHit = this.attackTotal >= targetAC || this.isCritical;
            if (targetEC) isHitEC = checkRule("challengeModeArmor") && this.attackTotal <= targetAC && this.attackTotal >= targetEC;
          }
          const optionalCrits = checkRule("optionalCritRule");
          if (this.targets.size === 1 && optionalCrits !== false && optionalCrits > -1) {
            //@ts-ignore .attributes
            this.isCritical = attackTotal >= (targetToken.actor?.system.attributes?.ac?.value ?? 10) + Number(checkRule("optionalCritRule"));
          }
          hitResultNumeric = this.isCritical ? "++" : `${attackTotal}/${Math.abs(attackTotal - targetAC)}`;
        }
        const midiFlagsAttackSuccess = getProperty(targetActor, "flags.midi-qol.grants.attack.success");

        if (midiFlagsAttackSuccess) {
          const conditionData = createConditionData({ workflow: this, target: this.token, actor: this.actor });
          if (midiFlagsAttackSuccess.all && evalCondition(midiFlagsAttackSuccess.all, conditionData)) {
            isHit = true;
            isHitEC = false;
          }
          if (midiFlagsAttackSuccess[item.system.actionType] && evalCondition(midiFlagsAttackSuccess[item.system.actionType], conditionData)) {
            isHit = true;
            isHitEC = false;
          }
        }
        let scale = 100;
        if (checkRule("challengeModeArmorScale") && !this.isCritical) scale = Math.floor((this.attackTotal - targetEC + 1) / ((targetActor?.system.attributes.ac.AR ?? 0) + 1) * 10) / 10;
        setProperty(targetToken.actor ?? {}, "flags.midi-qol.challengeModeScale", scale);
        if (this.isCritical) isHit = true;
        if (isHit || this.isCritical) this.hitTargets.add(targetToken);
        if (isHitEC) this.hitTargetsEC.add(targetToken);
        if (isHit || isHitEC) this.processCriticalFlags();
        setProperty(targetActor, "flags.midi-qol.acBonus", 0);
      }
      if (game.user?.isGM) log(`${this.speaker.alias} Rolled a ${this.attackTotal} to hit ${targetName}'s AC of ${targetAC} ${(isHit || this.isCritical) ? "hitting" : "missing"}`);
      // Log the hit on the target
      let attackType = ""; //item?.name ? i18n(item.name) : "Attack";

      let hitScale = 100;
      if (checkRule("challengeModeArmorScale") && !this.isCritical) hitScale = Math.floor((getProperty(targetToken.actor ?? {}, "flags.midi-qol.challengeModeScale") ?? 1) * 100);
      let hitString;
      if (game.user?.isGM && ["hitDamage", "all"].includes(configSettings.hideRollDetails) && (this.isCritical || this.isHit || this.isHitEC)) hitString = i18n("midi-qol.hits");
      else if (this.isCritical) hitString = i18n("midi-qol.criticals");
      else if (game.user?.isGM && this.isFumble && ["hitDamage", "all"].includes(configSettings.hideRollDetails)) hitString = i18n("midi-qol.misses");
      else if (this.isFumble) hitString = i18n("midi-qol.fumbles");
      else if (isHit) hitString = i18n("midi-qol.hits");
      else if (isHitEC && checkRule("challengeModeArmor") && checkRule("challengeModeArmorScale")) hitString = `${i18n("midi-qol.hitsEC")} (${hitScale}%)`;
      else if (isHitEC) hitString = `${i18n("midi-qol.hitsEC")}`;
      else hitString = i18n("midi-qol.misses");
      if (attackTotal !== this.attackTotal &&
        !configSettings.displayHitResultNumeric
        && ["none", "detailsDSN", "details"].includes(configSettings.hideRollDetails)) {
        hitString = `(${attackTotal}) ${hitString}`; // prepend the modified hit roll
      }

      //@ts-ignore .document v10
      let img = targetToken.document?.texture?.src || targetToken.actor?.img;
      if (configSettings.usePlayerPortrait && targetToken.actor?.type === "character") {
        //@ts-ignore .document v10
        img = targetToken.actor?.img || targetToken.document?.teexture?.src;
      }
      if (VideoHelper.hasVideoExtension(img ?? "")) {
        img = await game.video.createThumbnail(img ?? "", { width: 100, height: 100 });
      }
      // If using active defence hitTargets are up to date already.
      if (this.useActiveDefence) {
        if (this.activeDefenceRolls[targetToken instanceof Token ? targetToken.document.uuid : targetToken.uuid]) {
          if (targetToken.actor?.type === "character") {
            hitString = `(${this.activeDefenceRolls[targetToken instanceof Token ? targetToken.document?.uuid : targetToken.uuid].result}): ${hitString}`
          } else {
            hitString = `(${this.activeDefenceRolls[targetToken instanceof Token ? targetToken.document?.uuid : targetToken.uuid].total}): ${hitString}`
          }
        }
      }
      if (this.isFumble) hitResultNumeric = "--";
      this.hitDisplayData[targetToken instanceof Token ? targetToken.document?.uuid : targetToken.uuid] = {
        isPC: targetToken.actor?.hasPlayerOwner,
        target: targetToken,
        hitString,
        attackType,
        img,
        gmName: targetToken.name,
        playerName: getTokenPlayerName(targetToken instanceof Token ? targetToken.document : targetToken),
        bonusAC,
        hitResultNumeric
      };
    }
  }

  setRangedTargets(targetDetails) {
    if (!canvas || !canvas.scene) return true;
    const token = canvas?.tokens?.get(this.speaker.token);
    if (!token) {
      ui.notifications?.warn(`${game.i18n.localize("midi-qol.noSelection")}`)
      return true;
    }
    // We have placed an area effect template and we need to check if we over selected
    //@ts-ignore .disposition v10
    let dispositions = targetDetails.type === "creature" ? [-1, 0, 1] : targetDetails.type === "ally" ? [token.document.disposition] : [-token.document.disposition];
    // release current targets
    game.user?.targets.forEach(t => {
      //@ts-ignore
      t.setTarget(false, { releaseOthers: false });
    });
    game.user?.targets.clear();
    // min dist is the number of grid squares away.
    let minDist = targetDetails.value;
    const targetIds: string[] = [];
    if (canvas.tokens?.placeables && canvas.grid) {
      for (let target of canvas.tokens.placeables) {
        const ray = new Ray(target.center, token.center);
        //@ts-ignore .system v10
        if (target.actor?.system?.details.type?.custom === "NoTarget") continue;
        const wallsBlocking = ["wallsBlock", "wallsBlockIgnoreDefeated"].includes(configSettings.rangeTarget)
        //@ts-ignore .system v10
        let inRange = target.actor && target.actor?.system.details.race !== "trigger"
          // && target.actor.id !== token.actor?.id
          //@ts-ignore .disposition v10
          && dispositions.includes(target.document.disposition)
          //@ts-ignore attributesrollData.target.details.type?.value
          && (["always", "wallsBlock"].includes(configSettings.rangeTarget) || target.actor?.system.attributes.hp.value > 0)
        // && (["always", "wallsBlock"].includes(configSettings.rangeTarget) || target.actor?.system.attributes.hp.value > 0)
        if (inRange) {
          // if the item specifies a range of "special" don't target the caster.
          let selfTarget = (this.item?.system.range?.units === "spec") ? canvas.tokens?.get(this.tokenId) : null;
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
      this.targets = new Set(game.user?.targets ?? []);
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
      if (ef.origin === uuid) filtered.push(ef.id);
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
      let advantage: boolean | undefined = undefined;
      let advantageMode = game[game.system.id].dice.D20Roll.ADV_MODE.NORMAL;

      //@ts-ignore
      let formula = `1d20 + ${target.actor.system.attributes.ac.value - 10}`;
      // Advantage/Disadvantage is reversed for active defence rolls.
      const wfadvantage = this.advantage || this.rollOptions.advantage;
      const wfdisadvantage = this.disadvantage || this.rollOptions.disadvantage;
      if (wfadvantage && !wfdisadvantage) {
        advantage = false;
        //@ts-ignore
        formula = `2d20kl + ${target.actor.system.attributes.ac.value - 10}`;
        advantageMode = game[game.system.id].dice.D20Roll.ADV_MODE.DISADVANTAGE;
      } else if (!wfadvantage && wfdisadvantage) {
        advantageMode = game[game.system.id].dice.D20Roll.ADV_MODE.ADVANTAGE;
        advantage = true;
        //@ts-ignore
        formula = `2d20kh + ${target.actor.system.attributes.ac.value - 10}`;
      }
      //@ts-ignore
      var player = playerFor(target instanceof Token ? target : target.object);
      // if (!player || !player.active) player = ChatMessage.getWhisperRecipients("GM").find(u => u.active);
      if (debugEnabled > 0) warn(`Player ${player?.name} controls actor ${target.actor.name} - requesting ${getSystemCONFIG().abilities[this.saveItem.system.save.ability]} save`);
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
                const result = await (new game[game.system.id].dice.D20Roll(formula, {}, { advantageMode })).roll({ async: true });
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
      if (this.isCritical === undefined) this.isCritical = result.dice[0].total <= criticalTarget
      if (this.isFumble === undefined) this.isFumble = result.dice[0].total >= fumbleTarget;
      this.activeDefenceRolls[target instanceof Token ? target.document?.uuid : target.uuid] = results[i];
      let hit = this.isCritical || rollTotal < this.activeDefenceDC;
      if (hit) {
        this.hitTargets.add(target);
      } else this.hitTargets.delete(target);
      if (game.user?.isGM) log(`Ability active defence: ${target.name} rolled ${rollTotal} vs attack DC ${this.activeDefenceDC}`);
      i++;
    }
  }
  async setAttackRoll(roll: Roll) {
    this.attackRoll = roll;
    this.attackTotal = roll.total ?? 0;
    this.attackRollHTML = await midiRenderRoll(roll);
  }
  async setDamageRoll(roll: Roll) {
    this.damageRoll = roll;
    this.damageTotal = roll.total ?? 0;
    this.damageRollHTML = await midiRenderRoll(roll);
  }
  async setBonusDamageRoll(roll: Roll) {
    this.bonusDamageRoll = roll;
    this.bonusDamageTotal = roll.total ?? 0;
    this.bonusDamageHTML = await midiRenderRoll(roll);
  }

  async setOtherDamageRoll(roll: Roll) {
    this.otherDamageRoll = roll;
    this.otherDamageTotal = roll.total ?? 0;
    this.otherDamageHTML = await midiRenderRoll(roll);

  }
}

export class DamageOnlyWorkflow extends Workflow {
  //@ts-ignore dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, token: Token, damageTotal: number, damageType: string, targets: [Token], roll: Roll,
    options: { flavor: string, itemCardId: string, damageList: [], useOther: boolean, itemData: {}, isCritical: boolean }) {
    super(actor, null, ChatMessage.getSpeaker({ token }), new Set(targets), shiftOnlyEvent)
    this.itemData = options.itemData ? duplicate(options.itemData) : undefined;
    // Do the supplied damageRoll
    this.flavor = options.flavor;
    this.defaultDamageType = getSystemCONFIG().damageTypes[damageType] || damageType;
    this.damageList = options.damageList;
    this.itemCardId = options.itemCardId;
    this.useOther = options.useOther ?? true;
    this.damageRoll = roll;
    this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: damageType });
    this.damageTotal = damageTotal;
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
          setProperty(this.item, "flags.midi-qol.onUseMacroName", null);
        } else this.item = null;
        if (this.itemCardId === "new" && this.item) { // create a new chat card for the item
          this.createCount += 1;
          this.itemCard = await showItemCard.bind(this.item)(false, this, true);
          this.itemCardId = this.itemCard.id;
          // Since this could to be the same item don't roll the on use macro, since this could loop forever
        }

        // Need to pretend there was an attack roll so that hits can be registered and the correct string created
        // TODO separate the checkHit()/create hit display Data and displayHits() into 3 separate functions so we don't have to pretend there was a hit to get the display
        this.isFumble = false;
        this.attackTotal = 9999;
        await this.checkHits();
        const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
        await this.displayHits(whisperCard, configSettings.mergeCard && this.itemCardId);

        if (this.actor) { // Hacky process bonus flags
          await this.setDamageRoll(await processDamageRollBonusFlags.bind(this)());
          this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: this.defaultDamageType });
        }

        if (configSettings.mergeCard && this.itemCardId) {
          this.damageRollHTML = await midiRenderRoll(this.damageRoll);
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
        // TODO change this to the new apply token damage call - sigh
        this.damageList = await applyTokenDamage(this.damageDetail, this.damageTotal, this.targets, this.item, new Set(), { existingDamage: this.damageList, superSavers: new Set(), semiSuperSavers: new Set(), workflow: this, updateContext: undefined, forceApply: false })
        await super._next(WORKFLOWSTATES.ROLLFINISHED);

        Workflow.removeWorkflow(this.uuid);
        return this;

      default: return super.next(newState);
    }
  }
}

export class TrapWorkflow extends Workflow {

  templateLocation: { x: number, y: number, direction: number, removeDelay: number } | undefined;
  saveTargets: any;

  //@ts-ignore dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, item: globalThis.dnd5e.documents.Item5e, targets: [Token],
    templateLocation: { x: number, y: number, direction: number, removeDelay: number } | undefined = undefined,
    trapSound: { playlist: string, sound: string } | undefined = undefined, event: any = {}) {
    super(actor, item, ChatMessage.getSpeaker({ actor }), new Set(targets), event);
    // this.targets = new Set(targets);
    if (!this.event) this.event = duplicate(shiftOnlyEvent);
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
        this.saveTargets = validTargetTokens(game.user?.targets);
        this.effectsAlreadyExpired = [];
        this.onUseMacroCalled = false;
        this.itemCardId = (await showItemCard.bind(this.item)(false, this, true))?.id;
        //@ts-ignore TODO this is just wrong fix
        if (debugEnabled > 1) debug(" workflow.none ", state, this.item, configSettings.autoTarget, this.item.hasAreaTarget, this.targets);
        // don't support the placement of a template
        return await this.next(WORKFLOWSTATES.AWAITTEMPLATE);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        const targetDetails = this.item.system.target;
        if (configSettings.rangeTarget !== "none" && ["m", "ft"].includes(targetDetails?.units) && ["creature", "ally", "enemy"].includes(targetDetails?.type)) {
          this.setRangedTargets(targetDetails);
          this.targets = validTargetTokens(this.targets);
          this.failedSaves = new Set(this.targets)
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          return await this.next(WORKFLOWSTATES.TEMPLATEPLACED);
        }
        if (!this.item.hasAreaTarget || !this.templateLocation) return this.next(WORKFLOWSTATES.TEMPLATEPLACED)
        //@ts-ignore
        // this.placeTemplateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
        const TemplateClass = game[game.system.id].canvas.AbilityTemplate;
        const templateData = TemplateClass.fromItem(this.item).toObject(); // TODO check this v10
        // template.draw();
        // get the x and y position from the trapped token
        templateData.x = this.templateLocation.x || 0;
        templateData.y = this.templateLocation.y || 0;
        templateData.direction = this.templateLocation.direction || 0;

        // Create the template
        let templates = await canvas?.scene?.createEmbeddedDocuments("MeasuredTemplate", [templateData]);
        if (templates) {
          const templateDocument: any = templates[0];
          templateTokens({ x: templateDocument.x, y: templateDocument.y, shape: templateDocument.object.shape, distance: templateDocument.distance })
          selectTargets.bind(this)(templates[0], null, game.user?.id); // Target the tokens from the template
          if (this.templateLocation?.removeDelay) {
            //@ts-ignore _ids
            let ids: string[] = templates.map(td => td._id)
            //TODO test this again
            setTimeout(() => canvas?.scene?.deleteEmbeddedDocuments("MeasuredTemplate", ids), this.templateLocation.removeDelay * 1000);
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
        const attackRollCompleteStartTime = Date.now();
        this.processAttackRoll();
        await this.displayAttackRoll(configSettings.mergeCard);
        await this.checkHits();
        const whisperCard = configSettings.autoCheckHit === "whisper" || game.settings.get("core", "rollMode") === "blindroll";
        await this.displayHits(whisperCard, configSettings.mergeCard);
        if (debugCallTiming) log(`AttackRollComplete elapsed time ${Date.now() - attackRollCompleteStartTime}ms`)
        return await this.next(WORKFLOWSTATES.WAITFORSAVES);

      case WORKFLOWSTATES.WAITFORSAVES:
        if (!this.saveItem.hasSave) {
          this.saves = new Set(); // no saving throw, so no-one saves
          const allHitTargets = new Set([...this.hitTargets, ...this.hitTargetsEC]);
          this.failedSaves = new Set(allHitTargets);
          return await this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        this.initSaveResults();
        let hookId = Hooks.on("renderChatMessage", this.processSaveRoll.bind(this));
        //        let brHookId = Hooks.on("renderChatMessage", this.processBetterRollsChatCard.bind(this));
        let monksId = Hooks.on("updateChatMessage", this.monksSavingCheck.bind(this));
        try {
          await this.checkSaves(configSettings.autoCheckSaves !== "allShow");
        } finally {
          Hooks.off("renderChatMessage", hookId);
          //          Hooks.off("renderChatMessage", brHookId);
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
        if (debugEnabled > 1) debug("TrapWorkflow: Rolling damage ", this.event, this.itemLevel, this.rollOptions.versatile, this.targets, this.hitTargets);
        this.rollOptions.fastForward = true;
        this.item.rollDamage(this.rollOptions);
        return; // wait for a damage roll to advance the state.

      case WORKFLOWSTATES.DAMAGEROLLCOMPLETE:
        const damageRollCompleteStartTime = Date.now();
        if (!this.item.hasAttack) { // no attack roll so everyone is hit
          this.hitTargets = new Set(this.targets);
          this.hitTargetsEC = new Set();
          if (debugEnabled > 0) warn(" damage roll complete for non auto target area effects spells", this)
        }

        // If the item does damage, use the same damage type as the item
        let defaultDamageType = this.item?.system.damage?.parts[0][1] || this.defaultDamageType;
        this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: defaultDamageType });
        // apply damage to targets plus saves plus immunities
        await this.displayDamageRoll(configSettings.mergeCard)
        if (debugCallTiming) log(`DamageRollComplete elapsed ${Date.now() - damageRollCompleteStartTime}ms`);
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

  //@ts-ignore dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, item: globalThis.dnd5e.documents.Item5e, speaker, targets, options: any) {
    super(actor, item, speaker, targets, options);
    this.needTemplate = this.item?.hasAreaTarget ?? false;
    this.needItemCard = true;
    this.damageRolled = !(game.settings.get("betterrolls5e", "damagePromptEnabled") && item?.hasDamage);
    if (this.needTemplate) this.placeTemplateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
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
    if (debugEnabled > 0) warn(this.workflowType, "workflow.next ", state, this)

    switch (newState) {
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        // since this is better rolls as soon as we are ready for the attack roll we have both the attack roll and damage
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preAttackRoll"), "OnUse", "preAttackRoll");
        }

        if (await asyncHooksCall("midi-qol.preAttackRollComplete", this) === false) {
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        };
        if (this.item && await asyncHooksCall(`midi-qol.preAttackRollComplete.${this.item.uuid}`, this) === false) {
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        };
        return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.effectsAlreadyExpired = [];
        if (checkRule("removeHiddenInvis")) await removeHidden.bind(this)();
        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("preCheckhits"), "OnUse", "preCheckhits");
        }
        await asyncHooksCallAll("midi-qol.preCheckHits", this);
        if (this.item) await asyncHooksCallAll(`midi-qol.preCheckHits.${this.item.uuid}`, this);

        if (debugEnabled > 1) debug(this.attackRollHTML)
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        }
        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postAttackRoll"), "OnUse", "postAttackRoll");
        }
        await asyncHooksCallAll("midi-qol.AttackRollComplete", this);
        if (this.item) await asyncHooksCallAll(`midi-qol.AttackRollComplete.${this.item.uuid}`, this);
        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.WAITFORDAMAGEROLL:
        if (configSettings.allowUseMacro && this.item?.flags) {
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
        if (configSettings.allowUseMacro && this.item?.flags) {
          await this.callMacros(this.item, this.onUseMacros?.getMacros("postDamageRoll"), "OnUse", "postDamageRoll");
        }
        const damageBonusMacros = this.getDamageBonusMacros();
        if (damageBonusMacros) {
          await this.rollBonusDamage(damageBonusMacros);
        }
        if (!this.otherDamageRoll) this.otherDamageDetail = [];
        //TODO see if we need to set otherDamage
        if (this.bonusDamageRoll) {
          const messageData = {
            flavor: this.bonusDamageFlavor,
            speaker: this.speaker
          }
          setProperty(messageData, `flags.${game.system.id}.roll.type`, "damage");
          this.bonusDamageRoll.toMessage(messageData);
        }
        expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);

        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = validTargetTokens(game.user?.targets);
          this.hitTargets = validTargetTokens(game.user?.targets);
          this.hitTargetsEC = new Set();
        }
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) { //TODO: Is this right?
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (this.saveItem.hasSave) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE)

      case WORKFLOWSTATES.ROLLFINISHED:
        if (this.placeTemplateHookId) Hooks.off("createMeasuredTemplate", this.placeTemplateHookId)
        await this.complete();
        await super._next(WORKFLOWSTATES.ROLLFINISHED);
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

  //@ts-ignore dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, item: globalThis.dnd5e.documents.Item5e, speaker, targets, options: any) {
    super(actor, item, speaker, targets, options);
    this.needTemplate = this.item?.hasAreaTarget ?? false;
    this.needItemCard = false;
    this.damageRolled = false;
    this.attackRolled = !item.hasAttack;
    // for dnd beyond only roll if other damage is defined.
    this.needsOtherDamage = this.item.system.formula && shouldRollOtherDamage.bind(this.item)(this, configSettings.rollOtherDamage, configSettings.rollOtherSpellDamage);
    this.kickStart = true;
    this.flagTags = { "ddb-game-log": { "midi-generated": true } }
  }

  async _next(newState) {
    this.currentState = newState;
    let state = stateToLabel(this.currentState);
    if (debugEnabled > 0) warn("betterRolls workflow.next ", state, this)

    switch (newState) {
      case WORKFLOWSTATES.WAITFORATTACKROLL:
        if (!this.item.hasAttack) {
          return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);
        }
        if (!this.attackRolled) return;
        if (await asyncHooksCall("midi-qol.preAttackRollComplete", this) === false) {
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        };
        if (this.item && await asyncHooksCall(`midi-qol.preAttackRollComplete.${this.item.uuid}`, this) === false) {
          return this.next(WORKFLOWSTATES.ROLLFINISHED)
        }

        return this.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);

      case WORKFLOWSTATES.ATTACKROLLCOMPLETE:
        this.effectsAlreadyExpired = [];
        if (checkRule("removeHiddenInvis")) await removeHidden.bind(this)();
        await asyncHooksCallAll("midi-qol.preCheckHits", this);
        if (this.item) await asyncHooksCallAll(`midi-qol.preCheckHits.${this.item.uuid}`, this);

        if (debugEnabled > 1) debug(this.attackRollHTML)
        if (configSettings.autoCheckHit !== "none") {
          await this.checkHits();
          await this.displayHits(configSettings.autoCheckHit === "whisper", configSettings.mergeCard);
        }
        await asyncHooksCallAll("midi-qol.AttackRollComplete", this);
        if (this.item) await asyncHooksCallAll(`midi-qol.AttackRollComplete.${this.item.uuid}`, this);

        return this.next(WORKFLOWSTATES.WAITFORDAMAGEROLL);

      case WORKFLOWSTATES.AWAITTEMPLATE:
        if (!this.item.hasAreaTarget) return super.next(WORKFLOWSTATES.AWAITTEMPLATE)
        //@ts-ignore
        let system: any = game[game.system.id]
        // Create the template
        const template = system.canvas.AbilityTemplate.fromItem(this.item);
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
        this.defaultDamageType = this.item.system.damage?.parts[0][1] || this.defaultDamageType || MQdefaultDamageType;
        if (this.item?.system.actionType === "heal" && !Object.keys(getSystemCONFIG().healingTypes).includes(this.defaultDamageType ?? "")) this.defaultDamageType = "healing";

        this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: this.defaultDamageType });

        const damageBonusMacros = this.getDamageBonusMacros();
        if (damageBonusMacros) {
          await this.rollBonusDamage(damageBonusMacros);
        }
        this.damageDetail = createDamageList({ roll: this.damageRoll, item: this.item, versatile: this.rollOptions.versatile, defaultType: this.defaultDamageType });
        this.otherDamageDetail = [];
        if (this.bonusDamageRoll) {
          const messageData = {
            flavor: this.bonusDamageFlavor,
            speaker: this.speaker
          }
          setProperty(messageData, `flags.${game.system.id}.roll.type`, "damage");
          this.bonusDamageRoll.toMessage(messageData);
        }
        expireMyEffects.bind(this)(["1Attack", "1Action", "1Spell"]);

        if (configSettings.autoTarget === "none" && this.item.hasAreaTarget && !this.item.hasAttack) {
          // we are not auto targeting so for area effect attacks, without hits (e.g. fireball)
          this.targets = validTargetTokens(game.user?.targets);
          this.hitTargets = validTargetTokens(game.user?.targets);
          this.hitTargetsEC = new Set();
        }
        // apply damage to targets plus saves plus immunities
        if (this.isFumble) { //TODO: Is this right?
          return this.next(WORKFLOWSTATES.ROLLFINISHED);
        }
        if (this.saveItem.hasSave) return this.next(WORKFLOWSTATES.WAITFORSAVES);
        return this.next(WORKFLOWSTATES.ALLROLLSCOMPLETE)

      case WORKFLOWSTATES.ROLLFINISHED:
        if (this.placeTemplateHookId) Hooks.off("createMeasuredTemplate", this.placeTemplateHookId)
        await super._next(WORKFLOWSTATES.ROLLFINISHED);
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
        "flags.midi-qol.type": MESSAGETYPES.HITS,
        "flags.midi-qol.waitForDiceSoNice": false,
        "flags.midi-qol.hideTag": "",
        "flags.midi-qol.displayId": this.displayId
      });
      this._roll = null;
    }
  }
}

export class DummyWorkflow extends Workflow {
  //@ts-ignore dnd5e v10
  constructor(actor: globalThis.dnd5e.documents.Actor5e, item: globalThis.dnd5e.documents.Item5e, speaker, targets, options: any) {
    super(actor, item, speaker, targets, options);
    this.advantage = options?.advantage;
    this.disadvantage = options?.disadvantage
    this.rollOptions.fastForward = options?.fastForward;
    this.rollOptions.fastForwardKey = options?.fastFowrd;
  }
  async simulateAttack(target: Token) {
    this.targets = new Set([target]);
    this.advantage = false;
    this.disadvantage = false;
    await this.checkAttackAdvantage();
    // Block updates to quantity
    const hookId = Hooks.on("preUpdateItem", (item, update, options, user) => { return update.system?.quantity === undefined });
    try {
      this.attackRoll = await this.item?.rollAttack({ fastForward: true, chatMessage: false, isDummy: true })
    } finally {
      Hooks.off("preUpdateItem", hookId)
    }
    const maxroll = (await this.attackRoll?.reroll({ maximize: true }))?.total;
    const minroll = (await this.attackRoll?.reroll({ minimize: true }))?.total;
    this.expectedAttackRoll = ((maxroll || 0) + (minroll || 0)) / 2;
    if (this.advantage) this.expectedAttackRoll += 3.325;
    if (this.disadvantage) this.expectedAttackRoll -= 3.325;
    return this;
  }
  async _next(newState: number) {
    // Workflow.removeWorkflow(this.item.id);
    // return await 0;
  }
  async simulateSave(targets: Token[]) {
    this.targets = new Set(targets);
    this.hitTargets = new Set(targets)
    this.initSaveResults();
    await this.checkSaves(true, true);
    for (let result of this.saveResults) {
      // const result = this.saveResults[0];
      result.saveAdvantage = result.options.advantageMode === 1;
      result.saveDisadvantage = result.options.advantageMode === -1;
      result.saveRoll = await new Roll(result.formula).roll({async: true});
      const maxroll = (await result.saveRoll?.reroll({ maximize: true }))?.total;
      const minroll = (await result.saveRoll?.reroll({ minimize: true }))?.total;
      result.expectedSaveRoll = ((maxroll || 0) + (minroll || 0)) / 2;
      if (result.saveAdvantage) result.expectedSaveRoll += 3.325;
      if (result.saveDisadvantage) result.expectedSaveRoll -= 3.325;
      // this.simulatedSaveResults.push(result);
    }
    return this;
  }
}
