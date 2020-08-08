import Item5e from "systems/dnd5e/module/item/entity.js"
import { warn, debug } from "../midi-qol";
import { Workflow, WORKFLOWSTATES } from "./workflow";
import { autoShiftClick, autoRollDamage, autoCheckSaves, speedItemRolls, autoTarget, itemDeleteCheck } from "./settings";
import { rollMappings } from "./patching";

function hideChatMessage(hideDefaultRoll: boolean, match: (messageData) => boolean, workflowData: any, selector: string) {
  debug("Setting up hide chat message ", hideDefaultRoll, match, workflowData, selector);
  if (hideDefaultRoll) {
    let hookId = Hooks.on("preCreateChatMessage", (data: {}, options) => {
      if (match(data)) {
        //@ts-ignore
        Hooks.off("preCreateChatMessage", hookId);
        workflowData[selector] = data;
        debug("hideChatMessage: workflow data ", selector, data);
        return false;
      } else return true;
    })
  } else return true;
}

export async function doAttackRoll({event = {shiftKey: true}}) {
  let workflow = Workflow.workflows[this.uuid];
  debug("Entering item attack roll ", event, workflow)
  if (!workflow) {
    warn("No workflow for item ", this.name);
    return rollMappings.itemAttack.roll.bind(this)({event})
  }
  hideChatMessage(false, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "attackCardData");
  let result = rollMappings.itemAttack.roll.bind(this)({event}).then((result) =>{
    debug("roll attack value is ", result)
    workflow.attackRoll = result;
    workflow.currentState = WORKFLOWSTATES.ATTACKROLLCOMPLETE;
    workflow.next();
    return result;
  })
}

export async function doDamageRoll({event, spellLevel = null, versatile = false}) {
  let workflow = Workflow.workflows[this.uuid];
  debug(" do damage roll ", event, spellLevel, versatile, this.uuid, Workflow._workflows, workflow)
  if (!workflow) {
    warn("No workflow for item ", this.name);
    return rollMappings.itemDamage.roll.bind(this)({event, spellLevel, versatile})
  }
  hideChatMessage(false, data => data?.type === CONST.CHAT_MESSAGE_TYPES.ROLL, Workflow.workflows[this.uuid], "damageCardData");
  rollMappings.itemDamage.roll.bind(this)({event, spellLevel, versatile}).then((result) => {
    workflow.damageRoll = result;
    workflow.damageTotal = result.total;
    workflow.currentState = WORKFLOWSTATES.DAMAGEROLLCOMPLETE;
    workflow.next();
    return result;
  });
}

export async function doItemRoll({event, showFullCard = false}={event: {}}) {
  debug("Do item roll event is ", event)
  if (!event) {
    event = {};
    event["shiftKey"] = autoShiftClick;
    event["ctrlKey"] = false;
    event["altkey"] = false;
    event["metakey"] = false;
  }
  let speaker = ChatMessage.getSpeaker();
  let spellLevel = this.data.data.level; // we are called with the updated spell level so record it.
  let baseItem = this.actor.getOwnedItem(this.id);
  let workflow = new Workflow(this.actor, baseItem, speaker.token, speaker, event);
  //@ts-ignore event .type not defined
  workflow.versatile = event?.type === "contextmenu";
  workflow.itemLevel = spellLevel;
  hideChatMessage(true, data => true, workflow, "itemCardData"); // how to tell if it is an item card
  await rollMappings.itemRoll.roll.bind(this)().then(async (result) => {
    workflow.showCard = ["onCard", "off"].includes(speedItemRolls) || (
                  baseItem.isHealing && autoRollDamage === "none"  ||
                  baseItem.hasDamage && autoRollDamage === "none" ||
                  baseItem.hasSave && autoCheckSaves === "none")

    if (workflow.showCard) {
      showItemCard(this, showFullCard).then((itemCard) => {
        //@ts-ignore
        workflow.itemCard = itemCard;
        warn("Item Roll: ", workflow)
      });
    };
    workflow.next();
  });
}

let showItemCard = async (item, showFullCard)  => {
  const token = item.actor.token;
  const templateData = {
    actor: item.actor,
    tokenId: token ? `${token.scene._id}.${token.id}` : null,
    item: item.data,
    data: item.getChatData(),
    labels: item.labels,
    hasAttack: showFullCard || (item.hasAttack && speedItemRolls === "off"),
    isHealing: showFullCard || (item.isHealing && autoRollDamage === "none"),
    hasDamage: showFullCard || (item.hasDamage && autoRollDamage === "none"),
    isVersatile: showFullCard || (item.isVersatile && (speedItemRolls === "off" || autoRollDamage === "none")),
    isSpell: item.type==="spell",
    hasSave: showFullCard || (item.hasSave && autoCheckSaves === "none"),
    hasAreaTarget: showFullCard || item.hasAreaTarget
  };

  const templateType = ["tool"].includes(item.data.type) ? item.data.type : "item";
  const template = `systems/dnd5e/templates/chat/${templateType}-card.html`;
  const html = await renderTemplate(template, templateData);

  //TODO: look at speaker for this message
  // Basic chat message data
  const chatData = {
    user: game.user._id,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    content: html,
    speaker: {
      actor: item.actor._id,
      token: item.actor.token,
      alias: item.actor.name
    }
  };
  // Toggle default roll mode
  let rollMode = game.settings.get("core", "rollMode");
  if ( ["gmroll", "blindroll"].includes(rollMode) ) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u=>u.active);
  if ( rollMode === "blindroll" ) chatData["blind"] = true;

  // Create the chat message
  return ChatMessage.create(chatData);
}

export function selectTargets(scene, data, options) {
  debug("select targets ", this._id, this.placeTemlateHoodId, scene, data)
  let item = this.item;
  let targeting = autoTarget;
  if (data.user !== game.user._id) {
      return true;
  }
  if (targeting === "none") { // this is no good
    Hooks.callAll("midi-qol-targeted", game.user.targets);
    return true;
  } 
  if (data) {
    // release current targets
    game.user.targets.forEach(t => {
      //@ts-ignore
      t.setTarget(false, { releaseOthers: false });
    });
    game.user.targets.clear();
  }

  // if the item specifies a range of "self" don't target the caster.
  let selfTarget = !(item?.data.data.range?.units === "self")

  let wallsBlockTargeting = targeting === "wallsBlock";
  let templateDetails = canvas.templates.get(data._id);

  let tdx = data.x;
  let tdy = data.y;
// Extract and prepare data
  let {direction, distance, angle, width} = data;
  distance *= canvas.scene.data.grid / canvas.scene.data.gridDistance;
  width *= canvas.scene.data.grid / canvas.scene.data.gridDistance;
  direction = toRadians(direction);

  var shape
// Get the Template shape
switch ( data.t ) {
  case "circle":
    shape = templateDetails._getCircleShape(distance);
    break;
  case "cone":
    shape = templateDetails._getConeShape(direction, angle, distance);
    break;
  case "rect":
    shape = templateDetails._getRectShape(direction, distance);
    break;
  case "ray":
    shape = templateDetails._getRayShape(direction, distance, width);
  }
  canvas.tokens.placeables.filter(t => {
    if (!t.actor) return false;
    // skip the caster
    if (!selfTarget && this.token === t.id) return false;
    // skip special tokens with a race of trigger
    if (t.actor.data.data.details.race === "trigger") return false;
    if (!shape.contains(t.center.x - tdx, t.center.y - tdy))
      return false;
    if (!wallsBlockTargeting)
      return true;
    // construct a ray and check for collision
    let r = new Ray({ x: t.center.x, y: t.center.y}, templateDetails.data);
    return !canvas.walls.checkCollision(r);
  }).forEach(t => {
    t.setTarget(true, { user: game.user, releaseOthers: false });
    game.user.targets.add(t);
  });
  // game.user.broadcastActivity({targets: game.user.targets.ids});

  // Assumes area affect do not have a to hit roll
  this.saves = new Set();
  this.targets = new Set(game.user.targets);
  this.hitTargets = new Set(game.user.targets);
  this.currentState = WORKFLOWSTATES.TEMPLATEPLACED;
 return this.next();
};