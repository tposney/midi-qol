import { i18n, error, i18nFormat } from "../../midi-qol.js";
import { checkMechanic, checkRule, configSettings, targetConfirmation } from "../settings.js";
import { FULL_COVER, HALF_COVER, THREE_QUARTERS_COVER, activityHasAreaTarget, checkActivityRange, computeCoverBonus, computeFlankingStatus, getIconFreeLink, getToken, isTargetable, markFlanking, tokenForActor, updateUserTargets } from "../utils.js";
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
    options: any
  };
  hookId: number;

  constructor(actor: Actor.Implementation, activity, user, options: any = {}) {
    super(options);
    this.position.left = TargetConfirmationDialog.xPosition;
    this.position.top = TargetConfirmationDialog.yPosition;
    this.data = { actor, activity, user, targets: [], options }
    const keys = {}; // TODO see if this needs to be set from the workflow event or let it get processed later
    // Handle alt/ctrl etc keypresses when completing the dialog
    this.callback = function (value) {
      foundry.utils.setProperty(options, "workflowOptions.advantage", options.workflowOptions?.advantage);
      foundry.utils.setProperty(options, "workflowOptions.disadvantage", options.workflowOptions?.disadvantage);
      foundry.utils.setProperty(options, "workflowOptions.fastForward", options.workflowOptions?.fastForward);
      return options.callback ? options.callback(value) : value;
    }
    if (["ceflanked", "ceflankedNoconga"].includes(checkRule("checkFlanking")) && game.user?.targets) {
      const actor = this.data.activity.actor;
      const token = tokenForActor(actor);
      if (token)
        for (let target of game.user?.targets)
          markFlanking(token, target)
    }
    // this.callback = options.callback;
    this.hookId = Hooks.on("targetToken", (user, token, targeted) => {
      if (user !== game.user) return;
      const maxTargets = this.data.activity.target?.affects?.count;
      if (maxTargets && game.user.targets?.size > maxTargets)
        ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets: maxTargets }));
      if (game.user.targets) {
        const validTargets: Array<string> = [];
        for (let target of game.user.targets) {
          if (maxTargets && validTargets.length >= maxTargets) break;
          if (isTargetable(target)) validTargets.push(target.id);
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
    if ((game.release?.generation ?? 12) < 13) adjustment = (ui.sidebar?.element.hasClass("collapsed") ? 10 : (ui.sidebar?.position.width ?? 300))
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

  static PARTS = {
    main: {template: "modules/midi-qol/templates/targetConfirmation.hbs"}
  };

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "midi-qol-targetConfirmation",
    window: {
      title: "midi-qol.TargetConfirmation.Name",
      resizable: true
    },
    classes: ["midi-targeting"],
    position: {
      width: 300,
      height: "auto" as "auto",
      left: 100,
      top: 100
    }
  }, { inplace: false });

  async _prepareContext(options) {
    let data: any = foundry.utils.mergeObject(this.data, await super._prepareContext(options));
    const targets = Array.from(game.user?.targets ?? []);
    data.targets = [];
    const maxTargets = this.data.activity.target?.affects?.count;
    const actor = this.data.activity.actor;
    const token = tokenForActor(actor);
    for (let target of targets) {
      if (maxTargets && data.targets.length >= maxTargets) break;
      switch (this.data.activity.target?.affects?.type ?? "any") {
        case "enemy":
          if ((token?.document?.disposition ?? 1) * target.document.disposition >= 0) continue;
        case "ally": 
          if ((token?.document?.disposition ?? 1) * target.document.disposition < 0) continue;
        default: break;
      }
      let img = target.document.texture.src;
      if (VideoHelper.hasVideoExtension(img as string)) {
        img = await game.video?.createThumbnail(img as string, { width: 50, height: 50 }) ?? "";
      }

      let details: string[] = [];
      if (["ceflanked", "ceflankedNoconga"].includes(checkRule("checkFlanking"))) {
        if (token && computeFlankingStatus(token, target)) details.push((i18n("midi-qol.Flanked") ?? "Flanked"));
      }

      let attackerToken = token;
      if (token && checkMechanic("checkRange") !== "none" && (["mwak", "msak", "mpak", "rwak", "rsak", "rpak"].includes(this.data.activity.actionType))) {
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
        // TODO confirm this is right for auto template targeting.
        const isRangeTargeting = ["ft", "m"].includes(this.data.activity.range?.units) && ["creature", "ally", "enemy"].includes(this.data.activity.target.affects.type);
        if (!activityHasAreaTarget(this.data.activity) && !isRangeTargeting) {
          const targetCover = attackerToken ? computeCoverBonus(attackerToken, target, this.data.activity.item) : 0;
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
        name = getIconFreeLink(target);
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
        name, // : namegame.user.isGM ? getLinkText(target.actor) : getTokenPlayerName(target),
        img,
        displayedDisposition,
        details: details.join(" - "),
        hasDetails: details.length > 0,
        uuid: target.document.uuid
      });
    }
    if (this.data.activity.target) {
      if (this.data.activity.target.affects.count)
        data.blurb = i18nFormat("midi-qol.TargetConfirmation.Blurb", { targetCount: this.data.activity.target.affects.count ?? "any", targetType: this.data.activity.target.affects.type ?? "targets" })
      else data.blurb = i18n("midi-qol.TargetConfirmation.BlurbAny");
    }
    return data;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".midi-roll-confirm")?.addEventListener("click", () => {
      this.doCallback(true);
      this.close();
    });
    this.element.querySelector(".midi-roll-cancel")?.addEventListener("click", () => {
      this.doCallback(false);
      this.close();
    });
    if (canvas) {
      let targetNames = this.element.getElementsByClassName("content-link midi-qol");
      for (let targetName of Array.from(targetNames)) {
        targetName.addEventListener("click", async (event) => {
          event.stopPropagation();
          // @ts-expect-error
          const doc = await fromUuid(event.currentTarget?.dataset.uuid);
          return doc?.sheet.render({force: true});
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
          console.error("ping");
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
    this.callback = undefined;
  }
}
