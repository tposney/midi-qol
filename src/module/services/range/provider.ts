/*
 * midi's range check: the "midi-qol" provider of the range service (service.ts). Range, long range, the range flags,
 * sharpshooter and spell sniper, thrown weapons, total cover and units, measured with the distance service.
 */
import type { Activity, TokenOrDocument } from "../../../globals.js";
import { allAttackTypes, debugEnabled, i18nFormat, log, MODULE_ID, warn } from "../../../midi-qol.js";
import { checkMechanic, configSettings } from "../../settings.js";
import { activityRanges, createConditionData, evalAllConditions, evalCondition, getToken, hasCondition, isRangeCheckable } from "../../utils.js";
import { rangeBand, rangeInGridUnits } from "../../rules/range.js";
import { measureTokens } from "../distance/service.js";
export function midiActivityRange(activityIn: Activity, tokenRef: TokenOrDocument | string | undefined, targetsRef: Set<TokenOrDocument | string> | undefined, showWarning: boolean = true): { result: string, attackingToken?: Token.Implementation, range?: number | undefined, longRange?: number | undefined } {
  if (!canvas || !canvas.scene) return { result: "normal" };
  const checkRangeFunction = (activity: Activity, token: Token.Implementation, targets: Set<Token.Implementation>): { result: string, reason?: string, range?: number | undefined, longRange?: number | undefined } => {
    if (!canvas || !canvas.scene) return {
      result: "normal",
    }
    // check that a range is specified at all
    if (!activity.range) return {
      result: "normal",
    };

    if (!token) {
      if (debugEnabled > 0) warn(`checkRange | ${game.user?.name} no token selected cannot check range`)
      return {
        result: "fail",
        reason: `${game.user?.name} no token selected`,
      }
    }

    let actor = token.actor;
    // look at undefined versus !
    // Note: currently dnd5e can set value to an empty string instead of a number
    if (!(activity.range.value || activity.range.reach) && !activity.range.long && activity.range.units !== "touch") return {
      result: "normal",
      reason: "no range specified"
    };
    if (activity.target?.affects.type === "self") return {
      result: "normal",
      reason: "self attack",
      range: 0
    };
    // skip non mwak/rwak/rsak/msak types that do not specify a target type
    if (!allAttackTypes.includes(activity.actionType) && !["creature", "ally", "enemy"].includes(activity.target?.affects.type)) return {
      result: "normal",
      reason: "not an attack"
    };

    const attackType = activity.actionType;
    let { normal: range, long: longRange } = activityRanges(activity);
    if (activity.actor?.system) { // TODO revisit when/if flags move to activities
      let conditionData;
      let rangeBonus = activity.actor?.flags?.[MODULE_ID]?.range?.[attackType] ?? "0"
      rangeBonus = rangeBonus + " + " + (activity.actor?.flags?.[MODULE_ID]?.range?.all ?? "0");
      if (rangeBonus !== "0 + 0") {
        conditionData = createConditionData({ item: activity.item, activity, actor: activity.actor, target: token })
        const bonusValue = evalCondition(rangeBonus, conditionData, { errorReturn: 0, async: false });
        range = Math.max(0, range + bonusValue);
      };
      let longRangeBonus: string = activity.actor?.flags?.[MODULE_ID]?.long?.[attackType] ?? "0"
      longRangeBonus = longRangeBonus + " + " + (activity.actor?.flags?.[MODULE_ID]?.long?.all ?? "0");
      if (longRangeBonus !== "0 + 0") {
        if (!conditionData)
          conditionData = createConditionData({ item: activity.item, actor: activity.actor, activity, target: token })
        const bonusValue = evalCondition(longRangeBonus, conditionData, { errorReturn: 0, async: false });
        longRange = Math.max(0, longRange + bonusValue);
      };
    }
    if (longRange > 0 && longRange < range) longRange = range;
    if (activity.range?.units) {
      range = rangeInGridUnits(range, activity.range.units, canvas.scene?.grid.units);
      longRange = rangeInGridUnits(longRange, activity.range.units, canvas.scene?.grid.units);
    }
    if (range < longRange && activity.actionType === "rwak" &&
      (actor?.flags?.dnd5e?.sharpShooter || actor?.flags?.[MODULE_ID]?.sharpShooter)) {
      const conditionData = createConditionData({ item: activity.item, actor, activity, target: targets.first() });
      // Read the effects' expressions: dnd5e coerces its Boolean character flags to true.
      let sharpShooterEnabled = evalAllConditions(actor, "flags.dnd5e.sharpShooter", conditionData);
      sharpShooterEnabled ||= evalAllConditions(actor, `flags.${MODULE_ID}.sharpShooter`, conditionData);
      if (sharpShooterEnabled) range = longRange;
    }

    if (activity.actionType === "rsak" && actor?.flags?.dnd5e?.spellSniper) {
      const conditionData = createConditionData({ item: activity.item, actor, activity, target: targets.first() });
      let enabled = evalAllConditions(actor, "flags.dnd5e.spellSniper", conditionData);
      if (enabled) {
        range = 2 * range;
        longRange = 2 * longRange;
      }
    }
    if (activity.range.units === "touch") {
      range = canvas.dimensions?.distance ?? 5;
      // @ts-expect-error no dnd5e-types
      if (activity.item.system.range?.reach) range = activity.item.system.range.reach;
      longRange = 0;
    }

    const meleeActions = new Set(["mwak", "msak"]);
    const isMeleeAttack = meleeActions.has(activity.actionType);
    // @ts-expect-error no dnd5e-types
    const hasThrownProperty = activity.item.labels.properties?.some(p => p.abbr === "thr");

    if (isMeleeAttack && !hasThrownProperty) {
      longRange = 0;
    }

    const isMetric = game.settings.get("dnd5e", "metricLengthUnits") ?? false;

    for (let target of targets) {
      if (target === token) continue;
      // check if target is burrowing
      if (configSettings.optionalRules.wallsBlockRange !== 'none'
        && globalThis.MidiQOL.WallsBlockConditions.some(status => hasCondition(target.actor, status))) {
        return {
          result: "fail",
          reason: `${actor?.name}'s has one or more of ${globalThis.MidiQOL.WallsBlockConditions} so can't be targeted`,
          range,
          longRange
        }
      }
      // check the range TODO riview total cover flag and activity as part of midi properties
      const ignoreTotalCover = activity.midiProperties?.ignoreFullCover;

      const coverOptions = {
        wallsBlock: configSettings.optionalRules.wallsBlockRange !== "none" && !ignoreTotalCover,
        includeCover: !ignoreTotalCover,
      };

      const measured = measureTokens(token, target, coverOptions);
      if (!measured.ok && measured.reason === "blocked") {
        log(`${target.name} has total cover`)
        return {
          result: "fail",
          reason: i18nFormat("midi-qol.TargetTotalCover", { name: actor?.name ?? "" }),
          range,
          longRange
        }
      }
      if (!measured.ok) return {
        result: "fail",
        reason: i18nFormat(`midi-qol.RangeUnmeasurable.${measured.reason}`, { name: actor?.name ?? "", target: target.name ?? "" }),
        range,
        longRange
      };

      // Fudge factor is applied in getDistance - no additional adjustment needed here
      const distance = Math.max(0, parseFloat(measured.distance.toFixed(isMetric ? 1 : 0)));

      const band = rangeBand(distance, range, longRange);
      if (band === "beyond") {
        log(`${target.name} is too far ${distance} from your character you cannot hit`)
        if (checkMechanic("checkRange") === "longdisadv" && isRangeCheckable(activity)) {
          return {
            result: "dis",
            reason: `${actor?.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
            range,
            longRange
          }
        } else {
          return {
            result: "fail",
            reason: `${actor?.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
            range,
            longRange
          }
        }
      }
      if (band === "long") return {
        result: "dis",
        reason: `${actor?.name}'s target is ${Math.round(distance * 10) / 10} away and your range is only ${longRange || range}`,
        range,
        longRange
      }
    }
    return {
      result: "normal",
      range,
      longRange
    }
  }

  const tokenIn = getToken(tokenRef);
  // An array: a Set's map can't give the same value twice (two targets with no Token)
  const targetsIn = targetsRef ? new Set([...targetsRef].map(t => getToken(t)).filter(t => !!t)) : undefined;
  if (!tokenIn || !targetsIn) return { result: "fail", attackingToken: undefined };
  let attackingToken = tokenIn;
  if (!canvas || !canvas.tokens || !tokenIn || !targetsIn) return {
    result: "fail",
    attackingToken: tokenIn,
  }

  let canOverride = tokenIn.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.all || tokenIn.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.[activityIn.actionType];
  if (typeof canOverride === "string") {
    const tokenInActor = tokenIn.actor;
    const conditionData = createConditionData({ item: activityIn.item, activity: activityIn, actor: tokenInActor });
    canOverride = evalCondition(canOverride, conditionData)
  }

  const { result, reason, range, longRange } = checkRangeFunction(activityIn, attackingToken, targetsIn);
  if (!canOverride) { // no overrides so just do the check
    if (result === "fail" && reason) {
      if (showWarning) ui.notifications?.warn(reason);
    }
    return { result, attackingToken, range, longRange }
  }

  const ownedTokens = canvas.tokens.ownedTokens;
  // Initial Check
  // Now we loop through all owned tokens
  let possibleAttackers = ownedTokens.filter(t => {
    let canOverride = t.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.all || t.actor?.flags?.[MODULE_ID]?.rangeOverride?.attack?.[activityIn.actionType];
    if (typeof canOverride === "string") {
      const tActor = t.actor;
      const conditionData = createConditionData({ item: activityIn.item, activity: activityIn, actor: tActor });
      canOverride = evalCondition(canOverride, conditionData)
    }
    return canOverride;
  });

  const successToken = possibleAttackers.find(attacker => checkRangeFunction(activityIn, attacker, targetsIn).result === "normal");
  if (successToken) return { result: "normal", attackingToken: successToken, range, longRange };
  // TODO come back and fix this: const disToken = possibleAttackers.find(attacker => checkRangeFunction(itemIn, attacker, targetsIn).result === "dis");
  return { result: "fail", attackingToken, range, longRange };
}
