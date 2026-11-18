/*
 * midi's flags.midi-qol.optional.NAME.* read as roll bonuses. Pure: no Foundry globals.
 */
import type { BonusEffect, BonusPhase, ResourceType } from "./rollBonuses.js";

/** A flag value: a roll change, or a macro to run instead. */
export type ParsedFlagValue = { effect: BonusEffect } | { macro: string };

/**
 * The value of an optional bonus key (`flags.midi-qol.optional.NAME.attack.all` etc.), as bonusDialog has always read
 * it: reroll forms, success/fail/critical, `replace <formula>`, `reroll-withBonus <bonus>`, a macro, else a formula to add.
 */
export function parseFlagValue(value: unknown): ParsedFlagValue | undefined {
  if (typeof value === "number") return { effect: { kind: "add", formula: String(value) } };
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (text.startsWith("ItemMacro") || text.startsWith("Macro") || text.startsWith("function")) return { macro: text };
  switch (text) {
    case "reroll": return { effect: { kind: "reroll", keep: "new" } };
    case "reroll-query": return { effect: { kind: "reroll", keep: "ask" } };
    case "reroll-kh": return { effect: { kind: "reroll", keep: "higher" } };
    case "reroll-kl": return { effect: { kind: "reroll", keep: "lower" } };
    case "reroll-max": return { effect: { kind: "reroll", keep: "new", dice: "max" } };
    case "reroll-min": return { effect: { kind: "reroll", keep: "new", dice: "min" } };
    case "success": return { effect: { kind: "outcome", success: true } };
    case "fail": return { effect: { kind: "outcome", success: false } };
    case "critical": return { effect: { kind: "critical" } };
  }
  if (text.startsWith("replace ")) return { effect: { kind: "replace", formula: text.slice("replace ".length).trim() } };
  if (text.startsWith("reroll-withBonus")) {
    let bonus = text.slice("reroll-withBonus".length).trim();
    if (bonus && !bonus.startsWith("+") && !bonus.startsWith("-")) bonus = `+${bonus}`;
    return { effect: { kind: "reroll", keep: "new", addFormula: bonus || undefined } };
  }
  return { effect: { kind: "add", formula: text } };
}

/** What a `count`/`countAlt` value draws on, for the cost model. `every`/absent: nothing. */
export type FlagCountCost = { type: ResourceType; key: string } | undefined;

export function countCost(count: unknown, flagKey: string): FlagCountCost {
  if (count === undefined || count === null || count === "" || count === "every") return undefined;
  if (typeof count === "number" || (typeof count === "string" && /^\d+$/.test(count.trim()))) return { type: "effectCount", key: flagKey };
  if (typeof count !== "string") return undefined;
  const text = count.trim();
  if (text === "reaction") return { type: "actions", key: "reaction" };
  if (text === "bonusAction") return { type: "actions", key: "bonus" };
  if (["turn", "each-round", "each-turn"].includes(text)) return { type: "oncePer", key: `${flagKey}:${text}` };
  if (text.startsWith("ItemUses.")) return { type: "itemUses", key: text.slice("ItemUses.".length) };
  if (text.startsWith("ActivityUses.")) return { type: "activityUses", key: text.slice("ActivityUses.".length) };
  if (text.startsWith("@")) return { type: "attribute", key: text.slice(1) };
  return undefined;
}

/**
 * The phase an optional key applies in by default (`optional.NAME.phase` overrides): attack and d20 bonuses before the
 * result, `.fail.` bonuses and damage after it, acOnAttack before the attack's result, acOnHit after it.
 */
export function defaultPhase(selector: string): BonusPhase {
  if (selector === "acOnHit" || selector.startsWith("damage.") || selector.includes(".fail.")) return "postResult";
  return "preResult";
}

/** A phase named in `optional.NAME.phase`, else undefined. */
export function flagPhase(value: unknown): BonusPhase | undefined {
  return value === "preRoll" || value === "preResult" || value === "postResult" ? value : undefined;
}

/**
 * The value an optional bonus (the `optional.NAME` object) offers for a roll, as collectBonusFlags matches it: the
 * category as a plain string applies to every detail; else the detail's own key, then `all`. Failure bonuses are
 * `<category>.fail.<type>` (type an ability or "all"). Undefined when it offers nothing for this roll.
 */
export function flagValueFor(entry: Record<string, unknown> | undefined, category: string, detail: string, fail = false): unknown {
  const checkFlag = entry?.[category];
  if (checkFlag === undefined || checkFlag === null) return undefined;
  if (fail) {
    const failures = typeof checkFlag === "object" ? (checkFlag as Record<string, unknown>).fail : undefined;
    return failures && typeof failures === "object" ? (failures as Record<string, unknown>)[detail] || undefined : undefined;
  }
  if (typeof checkFlag === "string") return checkFlag;
  if (typeof checkFlag !== "object") return undefined;
  const byDetail = checkFlag as Record<string, unknown>;
  return byDetail[detail] || byDetail.all;
}
