import { i18n, error, i18nFormat, allAttackTypes } from "../../midi-qol.js";
import { checkMechanic, checkRule, configSettings, targetConfirmation } from "../settings.js";
import { FULL_COVER, HALF_COVER, THREE_QUARTERS_COVER, activityHasAreaTarget, checkActivityRange, computeCoverBonus, computeFlankingStatus, getToken, isInCombat, isValidTarget, markFlanking, tokenForActor, updateUserTargets, getTokenName } from "../utils.js";
import { getTokenPlayerName } from "../utils.js";
import { TroubleShooter } from "./TroubleShooter.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TargetConfirmationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  callback: ((data) => {}) | undefined;
  data: {
    actor: Actor.Implementation,
    // no dnd5e types, so "any" it is
    activity: any,
    user: User | null,
    targets: Token[],
    options: any,
    maxTargets: number | null | undefined
  };
  hookId: number;

  constructor(actor: Actor.Implementation, activity, user, options: any = {}) {
    super(options);
    this.position.left = TargetConfirmationDialog.xPosition;
    this.position.top = TargetConfirmationDialog.yPosition;
    let maxTargets = activity.target?.affects?.count;
    const inCombat = isInCombat(activity.item.parent);
    const requiresTargets = configSettings.requiresTargets === "always" 
    || (configSettings.requiresTargets === "tokens" && (canvas?.scene?.tokens.size ?? 0) > 0)
    || (configSettings.requiresTargets === "combat" && inCombat);
    if (activity.item.type === "weapon" && !maxTargets) {
      if (requiresTargets && configSettings.enforceSingleWeaponTarget && allAttackTypes.includes(activity.actionType)) {
      maxTargets = 1;
      }
    }
    this.data = { actor, activity, user, targets: [], options, maxTargets };
    const keys = {}; // TODO see if this needs to be set from the workflow event or let it get processed later
    // Handle alt/ctrl etc keypress when completing the dialog
    this.callback = function (value) {
      foundry.utils.setProperty(options, "workflowOptions.advantage", options.workflowOptions?.advantage);
      foundry.utils.setProperty(options, "workflowOptions.disadvantage", options.workflowOptions?.disadvantage);
      foundry.utils.setProperty(options, "workflowOptions.fastForward", options.workflowOptions?.fastForward);
      return options.callback ? options.callback(value) : value;
    }
    if (["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(checkRule("checkFlanking")) && game.user?.targets) {
      const actor = this.data.activity.actor;
      const token = tokenForActor(actor);
      if (token)
        for (let target of game.user?.targets)
          markFlanking(token, target)
    }
    // this.callback = options.callback;
    this.hookId = Hooks.on("targetToken", (user, token, targeted) => {
      if (user !== game.user) return;
      if (this.data.maxTargets && game.user.targets?.size > this.data.maxTargets)
        ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets: this.data.maxTargets }));
      if (game.user.targets) {
        const validTargets: Array<string> = [];
        for (let target of game.user.targets) {
          // if (maxTargets && validTargets.length >= maxTargets) break;
          if (isValidTarget(target)) validTargets.push(target.id);
        }
        updateUserTargets(validTargets);
      }
      this.data.targets = Array.from(game.user.targets ?? []);
      this.render();
    });
    return this;
  }

  get title() {
    return this.data.options.title ?? i18n("midi-qol.TargetConfirmation.Name");
  }
  
  static get xPosition() {
    const left = 100;
    const middle = window.innerWidth / 2 - 155;
    let adjustment = 10;
    const right = window.innerWidth - 310 - adjustment
    switch (targetConfirmation.gridPosition?.x) {
      case -1: return left;
      case 0 : return middle;
      default:
      case 1 : return right;
    }
  }

  static get yPosition() {
    const top = 100;
    const middle = window.innerHeight / 2 - 100;
    const bottom = window.innerHeight - 200;
    switch (targetConfirmation.gridPosition?.y) {
      case -1: return top;
      case 0 : return middle;
      default:
      case 1 : return bottom;
    }
  }

  static override PARTS = {
    main: {template: "modules/midi-qol/templates/targetConfirmation.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-targetConfirmation",
    window: {
      title: "midi-qol.TargetConfirmation.Name",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    classes: ["midi-targeting"],
    position: {
      width: 300,
      height: "auto" as "auto",
      left: 100,
      top: 100
    },
    actions: {
      roll: this.#onRoll,
      cancel: this.#onCancel
    }
  };

  async _prepareContext(options) {
    let data: any = foundry.utils.mergeObject(this.data, await super._prepareContext(options));
    const targets = Array.from(game.user?.targets ?? []);
    data.targets = [];
    const actor = this.data.activity.actor;
    const token = tokenForActor(actor);
    for (let target of targets) {
      // if (maxTargets && data.targets.length >= maxTargets) break;
      switch (this.data.activity.target?.affects?.type ?? "any") {
        case "enemy":
          if ((token?.document?.disposition ?? 1) * target.document.disposition >= 0) continue;
          break;
        case "ally": 
          if ((token?.document?.disposition ?? 1) * target.document.disposition < 0) continue;
          break;
        default: break;
      }
      let img = target.document.texture.src;
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img as string)) {
        img = await game.video?.createThumbnail(img as string, { width: 50, height: 50 }) ?? "";
      }

      let details: string[] = [];
      if (["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(checkRule("checkFlanking"))) {
        if (token && computeFlankingStatus(token, target)) details.push((i18n("midi-qol.Flanked") ?? "Flanked"));
      }

      let attackerToken = token;
      if (token && checkMechanic("checkRange") !== "none" && (["mwak", "msak", "mpak", "rwak", "rsak", "rpak", "utility", "check", "save", "damage"].includes(this.data.activity.actionType))) {
        const { result, attackingToken } = checkActivityRange(this.data.activity, token, new Set([target]), false);
        if (attackingToken) attackerToken = attackingToken;
        switch (result) {
          case "normal":
            details.push(`${i18n("DND5E.RangeNormal")}`);
            break;
          case "dis":
            details.push(`${i18n("DND5E.RangeLong")}`);
            break;
          case "fail":
            details.push(`${i18n("midi-qol.OutOfRange")}`);
            break;
        }
      }
      // TODO look at doing save cover bonus calculations here - need the template
      if (typeof configSettings.optionalRules.coverCalculation === "string" && configSettings.optionalRules.coverCalculation !== "none") {
        if (!activityHasAreaTarget(this.data.activity)) {
          const targetCover = attackerToken ? computeCoverBonus(attackerToken, target, this.data.activity) : 0;
          switch (targetCover) {
            case HALF_COVER:
              details.push(`${i18n("DND5E.CoverHalf")} ${i18n("DND5E.Cover")}`);
              break;
            case THREE_QUARTERS_COVER:
              details.push(`${i18n("DND5E.CoverThreeQuarters")} ${i18n("DND5E.Cover")}`);
              break;
            case FULL_COVER:
              details.push(`${i18n("DND5E.CoverTotal")} ${i18n("DND5E.Cover")}`);
              break;
            default:
              details.push(`${i18n("No")} ${i18n("DND5E.Cover")}`);
              break;
          }
        }
      }

      let name;
      if (game.user?.isGM) {
        name = getTokenName(target);
      } else {
        name = getTokenPlayerName(target);
      }
      //@ts-expect-error .disposition
      const relativeDisposition = token?.document.disposition * target.document.disposition;
      let displayedDisposition: any = undefined;
      if (target.document.disposition !== CONST.TOKEN_DISPOSITIONS.SECRET) {
        if (relativeDisposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
          displayedDisposition = i18n("TOKEN.DISPOSITION.FRIENDLY");
        } /*else if (relativeDisposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
          displayedDisposition = i18n("TOKEN.DISPOSITION.NEUTRAL");
        } else if (relativeDisposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
          displayedDisposition = i18n("TOKEN.DISPOSITION.HOSTILE");
        }*/
      }
      data.targets.push({
        name, // : name: game.user.isGM ? getLinkText(target.actor) : getTokenPlayerName(target),
        img,
        displayedDisposition,
        details: details.join(" - "),
        hasDetails: details.length > 0,
        uuid: target.document.uuid
      });
    }
    if (this.data.activity.target) {
      if (this.data.maxTargets)
        data.blurb = i18nFormat("midi-qol.TargetConfirmation.Blurb", { targetCount: this.data.maxTargets, targetType: this.data.activity.target.affects.type || "targets" })
      else data.blurb = i18n("midi-qol.TargetConfirmation.BlurbAny");
    }
    data.buttons = [
      { type: "button", icon: "fa-solid fa-dice-d20", label: "DND5E.Roll", action: "roll" },
      { type: "button", icon: "fa-solid fa-stop", label: "Cancel", action: "cancel" }
    ];
    return data;
  }

  static #onRoll(this: TargetConfirmationDialog) {
    if (this.data.maxTargets && (game.user?.targets?.size ?? 0) > this.data.maxTargets) {
      ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets: this.data.maxTargets }));
      return;
    }
    this.doCallback(true);
    this.close();
  }

  static #onCancel(this: TargetConfirmationDialog) {
    this.doCallback(false);
    this.close();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (canvas) {
      let targetNames = this.element.getElementsByClassName("content-link midi-qol");
      for (let targetName of Array.from(targetNames)) {
        targetName.addEventListener("click", async (event) => {
          event.stopPropagation();
          // @ts-expect-error
          const doc = await fromUuid(event.currentTarget?.dataset.uuid) as Actor | null;
          //@ts-expect-error render not updated for v2 parameters
          return doc?.sheet?.render({force: true});
        });
      }
      let imgs = this.element.getElementsByTagName("img");
      for (let i of Array.from(imgs)) {
        i.style.border = 'none';
        i.closest(".midi-qol-box")?.addEventListener("contextmenu", (event) => {
          const token = getToken(i.id);
          if (token) {
            token.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
            this.render();
          }
        });
        i.closest(".midi-qol-box")?.addEventListener('click', async function () {
          const token = getToken(i.id);
          if (token) await canvas?.ping(token.center);
        });
        i.closest(".midi-qol-box")?.addEventListener('mouseover', function () {
          const token = getToken(i.id);
          if (token) {
            token.hover = true;
            token.refresh();
          }
        });
        i.closest(".midi-qol-box")?.addEventListener('mouseout', function () {
          const token = getToken(i.id);
          if (token) {
            token.hover = false;
            token.refresh();
          }
        });
      }
    }
  }

  close(options = {}) {
    Hooks.off("targetToken", this.hookId);
    this.doCallback(false);
    return super.close(options);
  }

  doCallback(value = false) {
    try {
      if (this.callback) this.callback(value);
    } catch (err) {
      const message = `TargetConfirmation | calling callback failed`;
      TroubleShooter.recordError(err, message);
      error(message, err);
    }
  }
}
