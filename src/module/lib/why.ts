import { MODULE_ID } from "../../midi-qol.js";
import type { AttributionEntry, Workflow } from "../Workflow.js";
import { attributionMapToArray, getTargetDescriptor } from "../utils.js";
import type { BonusSource, RollChange } from "./rollParts.js";

/*
 * M16: why a use's results came out as they did, as data (MidiQOL.why), for modules, the HUD and the trace. Read from
 * what the use already keeps, nothing stored for it: each roll's terms with their labels (lib/rollParts.ts), the
 * sources behind a combined bonus, the advantage attribution, an attack's reasons (flanking, granted bonuses), the
 * target records' AC, and the changes made to a roll after it was made (an optional bonus, a reroll). The GM's view:
 * what a player may see is the reveal policy's (the card's tooltips ask it).
 */

export interface WhyTerm { label: string, value: number, formula?: string }

export interface WhyRoll {
  formula: string;
  total?: number;
  /** -1 disadvantage, 0 normal, 1 advantage */
  mode: number;
  /** Each term after the d20 (a damage roll: every term), with its label */
  terms: WhyTerm[];
  /** The effects, sheet value and rules behind a combined bonus */
  bonusSources: BonusSource[];
  /** The advantage sources, auto results and criticals */
  attribution: AttributionEntry[];
  /** Changes made after the roll, in order, each with the total before it (the roll's total is after the last) */
  changes: RollChange[];
}

export interface UseWhy {
  attack?: WhyRoll & { reasons: { label: string, value?: string, kind?: string }[], targets: { uuid: string, name: string | null, ac?: number | null, hit: boolean }[] };
  saves: (WhyRoll & { uuid: string, name: string | null, dc?: number, saved: boolean })[];
  damage: (WhyRoll & { type?: string })[];
}

function terms(roll: Roll, skipFirst: boolean): WhyTerm[] {
  const found: WhyTerm[] = [];
  let sign = 1;
  roll.terms.forEach((term, index) => {
    if (skipFirst && index === 0) return;
    if (term instanceof foundry.dice.terms.OperatorTerm) {
      sign = term.operator === "-" ? -1 : 1;
      return;
    }
    const dice = term instanceof foundry.dice.terms.DiceTerm || term instanceof foundry.dice.terms.ParentheticalTerm;
    found.push({ label: term.flavor ?? "", value: sign * Number(term.total ?? 0), ...(dice ? { formula: term.formula.replace(/\[[^\]]*\]/g, "") } : {}) });
  });
  return found;
}

function stored<T>(roll: Roll, path: string): T[] {
  const value = foundry.utils.getProperty(roll, path);
  return Array.isArray(value) ? value as T[] : [];
}

function whyRoll(roll: Roll, { d20 = true, attribution }: { d20?: boolean, attribution?: AttributionEntry[] } = {}): WhyRoll {
  const mode = Number(foundry.utils.getProperty(roll, "options.advantageMode") ?? 0);
  return {
    formula: roll.formula, total: roll.total ?? undefined, mode: Number.isFinite(mode) ? mode : 0,
    terms: terms(roll, d20),
    bonusSources: stored<BonusSource>(roll, `options.${MODULE_ID}.rollBonusSources`),
    attribution: attribution ?? stored<AttributionEntry>(roll, "options.attributions"),
    changes: stored<RollChange>(roll, `options.${MODULE_ID}.changes`)
  };
}

/** Why a use's attack, saves and damage came out as they did */
export function why(workflow: Workflow): UseWhy {
  const result: UseWhy = { saves: [], damage: [] };
  const attack = workflow.attackRoll;
  if (attack) {
    result.attack = {
      ...whyRoll(attack),
      reasons: stored<{ label: string, value?: string, kind?: string }>(attack, `options.${MODULE_ID}.attackModifiers`)
        .map(({ label, value, kind }) => ({ label, value, kind })),
      targets: workflow.targets.documents.map(token => ({
        uuid: token.uuid ?? "", name: token.name,
        ac: getTargetDescriptor(token.actor?.uuid ?? "", workflow.targetDescriptors)?.ac,
        hit: workflow.hitTargets.has(token) || workflow.hitTargetsEC.has(token)
      }))
    };
  }
  const saveAttribution = workflow.saveAttribution ?? {};
  for (const [uuid, roll] of Object.entries(workflow.tokenSaves ?? {})) {
    const token = workflow.targets.documents.find(document => document.uuid === uuid);
    const target = Number(foundry.utils.getProperty(roll, "options.target"));
    result.saves.push({
      ...whyRoll(roll, { attribution: attributionMapToArray(saveAttribution[uuid] ?? {}) }),
      uuid, name: token?.name ?? null,
      dc: Number.isFinite(target) ? target : undefined,
      saved: !!token && workflow.saves.has(token)
    });
  }
  for (const roll of [...workflow.damageRolls, ...(workflow.otherDamageRolls ?? []), ...(workflow.bonusDamageRolls ?? [])]) {
    const type = foundry.utils.getProperty(roll, "options.type");
    result.damage.push({ ...whyRoll(roll, { d20: false }), type: typeof type === "string" ? type : undefined });
  }
  return result;
}
