import { Activity } from "../../globals.js";
import { i18n, error, i18nFormat } from "../../midi-qol.js";
import { checkMechanic, checkRule, configSettings, targetConfirmation } from "../settings.js";
import { TOTAL_COVER, HALF_COVER, THREE_QUARTERS_COVER, activityHasAreaTarget, checkActivityRange, getCoverBonus, computeFlankingStatus, getToken, isInCombat, isValidTarget, markFlanking, tokenForActor, updateUserTargets, getTokenName } from "../utils.js";
import { shouldEnforceSingleTarget } from "../activities/activityHelpers.js";
import { getTokenPlayerName } from "../utils.js";
import { TroubleShooter } from "./TroubleShooter.js";
import ApplicationV2 = foundry.applications.api.ApplicationV2
import { WorkflowOptions } from "../Workflow.js";
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class TargetConfirmationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  callback: ((data) => {}) | undefined;
  data: {
    actor: Actor.Implementation;
    activity: Activity;
    user: User | null;
    targets: Token.Implementation[];
    options: any;
    maxTargets: number | null | undefined;
  };
  hookId: number;

  constructor(actor: Actor.Implementation, activity: Activity, user: User.Implementation, options: TargetConfirmationOptions = {}) {
    super(options);
    this.position.left = TargetConfirmationDialog.xPosition;
    this.position.top = TargetConfirmationDialog.yPosition;
    let maxTargets = activity.target?.affects?.count ? Number(activity.target.affects.count) : +Infinity;
    const inCombat = activity.item.parent && isInCombat(activity.item.parent);

    const requiresTargets = configSettings.requiresTargets === "always"
      || (configSettings.requiresTargets === "tokens" && (canvas?.scene?.tokens.size ?? 0) > 0)
      || (configSettings.requiresTargets === "combat" && inCombat);
    // @ts-expect-error no dnd5e-types
    if (activity.item.type === "weapon" && requiresTargets && shouldEnforceSingleTarget(activity)) {
      maxTargets = 1;
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
    // Make sure the current targets respect the targeting rules of the activity
    this.validateAndUpdateTargets();
 
    if (["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(checkRule("checkFlanking") as string) && game.user?.targets) {
      const actor = this.data.activity.actor;
      const token = tokenForActor(actor);
      if (token)
        for (let target of game.user?.targets)
          markFlanking(token, target)
    }
    // this.callback = options.callback;
    this.hookId = Hooks.on("targetToken", (user, token, targeted) => {
      if (user !== game.user) return;
      if (game.user.targets) {
        this.validateAndUpdateTargets();
      }
      // Validate max number of targets after target validation, so that invalid targets can be removed without triggering a warning
      if (this.data.maxTargets && game.user.targets?.size > this.data.maxTargets)
        ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets: this.data.maxTargets }));

      const newTargets = Array.from(game.user.targets ?? []);
      // Do not re-render if the targets have not changed
      if (!newTargets.equals(this.data.targets ?? [])) {
        this.data.targets = newTargets;
        this.render();
      }
    });
    return this;
  }

  get title() {
    return this.data.options.title ?? i18n("midi-qol.TargetConfirmation.Name");
  }

  static get xPosition() {
    const left = 100;
    const middle = window.innerWidth / 2 - 155;
    let adjustment = 20;

    const right = window.innerWidth - adjustment - (ui.sidebar?.element.clientWidth ?? 10) - 300;
    switch (targetConfirmation.gridPosition?.x) {
      case -1: return left;
      case 0: return middle;
      default:
      case 1: return right;
    }
  }

  static get yPosition() {
    const top = 100;
    const middle = window.innerHeight / 2 - 100;
    const bottom = window.innerHeight - 200;
    switch (targetConfirmation.gridPosition?.y) {
      case -1: return top;
      case 0: return middle;
      default:
      case 1: return bottom;
    }
  }

  static override PARTS = {
    main: { template: "modules/midi-qol/templates/apps/TargetConfirmation/targetConfirmation.hbs" },
    footer: { template: "templates/generic/form-footer.hbs" }
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
      cancel: this.#onCancel,
      clearTargets: this.#onClearTargets
    }
  };

  validateAndUpdateTargets() {
    const targets = Array.from(game.user?.targets ?? []);
    const actor = this.data.activity.actor;
    const attackerToken = tokenForActor(actor);
    let validTargets: Array<string> = [];
    for (let target of targets) {
      // Skip invalid targets
      if (!isValidTarget(target)) continue;

      // Skip targets that are excluded by workflow options (if present)
      if (this.data.options?.workflowOptions?.excludeTargets && this.data.options.workflowOptions.excludeTargets?.includes(target.document.uuid)) continue;

      // Skip targets that do not match the activity's target type
      switch (this.data.activity.target?.affects?.type ?? "any") {
        case "enemy":
          if ((attackerToken?.document?.disposition ?? 1) * target.document.disposition >= 0) continue;
          break;
        case "ally":
          if ((attackerToken?.document?.disposition ?? 1) * target.document.disposition < 0) continue;
          break;
        default: break;
      }
      validTargets.push(target.id);
    }
    updateUserTargets(validTargets);
  }

  async _prepareContext(options: ApplicationV2.RenderOptions) {
    let context: Omit<typeof this.data, 'targets'> & ApplicationV2.RenderContext & {
      blurb?: string;
      buttons?: {
        type?: string;
        icon?: string;
        label?: string;
        action?: string;
      }[]
      targets: (Token.Implementation | {
        name: string;
        img: string;
        displayedDisposition?: string;
        details: string;
        hasDetails: boolean;
        uuid: string;
      })[]
    } = { ...this.data, ...await super._prepareContext(options) };
    const targets = Array.from(game.user?.targets ?? []);
    context.targets = [];
    const actor = this.data.activity.actor;
    const token = tokenForActor(actor);
    for (let target of targets) {
      // if (maxTargets && data.targets.length >= maxTargets) break;

      // Note: no need to revaldiate targets, they are filtered before first render and each time token selection changes

      let img = target.document.texture.src as string;
      if (foundry.helpers.media.VideoHelper.hasVideoExtension(img)) {
        img = await game.video?.createThumbnail(img as string, { width: 50, height: 50 }) ?? "";
      }

      let details: string[] = [];
      if (["ceflanked", "ceflankedNoconga", "midiFlanked", "midiFlankedNoConga"].includes(checkRule("checkFlanking") as string)) {
        if (token && await computeFlankingStatus(token, target)) details.push((i18n("midi-qol.Flanked") ?? "Flanked"));
      }

      let attackerToken = token;
      if (token && checkMechanic("checkRange") !== "none" && (["mwak", "msak", "rwak", "rsak", "utility", "check", "save", "damage"].includes(this.data.activity.actionType))) {
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
      // Cover display: always check status-based cover (coverTotal etc.); only show "No Cover" when a cover module is configured
      if (!activityHasAreaTarget(this.data.activity)) {
        const hasCoverModule = typeof configSettings.optionalRules.coverCalculation === "string" && configSettings.optionalRules.coverCalculation !== "none";
        const targetCover = attackerToken ? getCoverBonus(attackerToken, target, this.data.activity) : 0;
        if (targetCover > 0 || hasCoverModule) {
          switch (targetCover) {
            case HALF_COVER:
              details.push(`${i18n("DND5E.CoverHalf")} ${i18n("DND5E.Cover")}`);
              break;
            case THREE_QUARTERS_COVER:
              details.push(`${i18n("DND5E.CoverThreeQuarters")} ${i18n("DND5E.Cover")}`);
              break;
            case TOTAL_COVER:
              details.push(`${i18n("DND5E.CoverTotal")} ${i18n("DND5E.Cover")}`);
              break;
            case 0:
              details.push(`${i18n("No")} ${i18n("DND5E.Cover")}`);
              break;
            default:
              details.push(`+${targetCover} ${i18n("DND5E.Cover")}`);
              break;
          }
        }
      }

      let name: string;
      if (game.user?.isGM) {
        name = getTokenName(target);
      } else {
        name = getTokenPlayerName(target) ?? "";
      }
      const relativeDisposition = (token?.document.disposition ?? 0) * target.document.disposition;
      let displayedDisposition: string | undefined = undefined;
      if (target.document.disposition !== CONST.TOKEN_DISPOSITIONS.SECRET) {
        if (relativeDisposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
          displayedDisposition = i18n("TOKEN.DISPOSITION.FRIENDLY");
        } /*else if (relativeDisposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
          displayedDisposition = i18n("TOKEN.DISPOSITION.NEUTRAL");
        } else if (relativeDisposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
          displayedDisposition = i18n("TOKEN.DISPOSITION.HOSTILE");
        }*/
      }
      context.targets.push({
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
        context.blurb = i18nFormat("midi-qol.TargetConfirmation.Blurb", { targetCount: this.data.maxTargets, targetType: this.data.activity.target.affects.type || "targets" })
      else context.blurb = i18n("midi-qol.TargetConfirmation.BlurbAny");
    }
    context.buttons = [
      { type: "button", icon: "fa-solid fa-dice-d20", label: "DND5E.Roll", action: "roll" },
      { type: "button", icon: "fa-solid fa-stop", label: "Cancel", action: "cancel" },
      { type: "hidden", icon: "fa-solid fa-check", label: "Clear", action: "clearTargets" }
    ];
    return context;
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

  static #onClearTargets(this: TargetConfirmationDialog) {
    updateUserTargets([]);
    this.data.targets = [];
    this.render();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (canvas) {
      // TODO: This doing anything? 
      let targetNames = this.element.getElementsByClassName("content-link midi-qol");
      for (let targetName of Array.from(targetNames)) {
        targetName.addEventListener("click", async (event) => {
          event.stopPropagation();
          // @ts-expect-error
          const doc = await fromUuid(event.currentTarget?.dataset.uuid) as Actor | null;
          //@ts-expect-error render not updated for v2 parameters
          return doc?.sheet?.render({ force: true });
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
          if (token) await canvas.ping(token.center);
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

export type TargetConfirmationOptions = Partial<ApplicationV2.Configuration> & {
  callback?: (value: unknown) => void;
  workflowOptions?: WorkflowOptions;
}
