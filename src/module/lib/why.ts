import type { AttributionEntry, Workflow } from "../Workflow.js";
import { attributionMapToArray, getTargetDescriptor } from "../utils.js";

/*
 * M16: why a use's results came out as they did, as data (MidiQOL.why), for modules, the HUD and the trace. Read from
 * what the use already keeps: each roll's attributions (the advantage sources and its named parts, lib/rollParts.ts),
 * the save attribution of the card's target records, the target records' AC. Nothing is stored for it. The GM's
 * view: what a player may see is the reveal policy's (the tooltips ask it).
 */

export interface WhyRoll {
  formula: string;
  total?: number;
  /** -1 disadvantage, 0 normal, 1 advantage */
  mode: number;
  /** The advantage sources, auto results, criticals and each named part (BONUS) */
  entries: AttributionEntry[];
}

export interface WhyTarget { uuid: string, name: string | null, ac?: number | null, hit: boolean }

export interface UseWhy {
  attack?: WhyRoll & { targets: WhyTarget[] };
  saves: (WhyRoll & { uuid: string, name: string | null, dc?: number, saved: boolean })[];
  damage: (WhyRoll & { type?: string })[];
}

function entriesOf(roll: Roll): AttributionEntry[] {
  const stored = foundry.utils.getProperty(roll, "options.attributions");
  return Array.isArray(stored) ? stored as AttributionEntry[] : [];
}

function whyRoll(roll: Roll, extra: AttributionEntry[] = []): WhyRoll {
  const mode = Number(foundry.utils.getProperty(roll, "options.advantageMode") ?? 0);
  const own = entriesOf(roll);
  const seen = new Set(own.map(entry => `${entry.type}:${entry.source}`));
  return { formula: roll.formula, total: roll.total ?? undefined, mode: Number.isFinite(mode) ? mode : 0,
    entries: [...extra.filter(entry => !seen.has(`${entry.type}:${entry.source}`)), ...own] };
}

/** Why a use's attack, saves and damage came out as they did */
export function why(workflow: Workflow): UseWhy {
  const result: UseWhy = { saves: [], damage: [] };
  const attack = workflow.attackRoll;
  if (attack) {
    result.attack = {
      ...whyRoll(attack),
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
      ...whyRoll(roll, attributionMapToArray(saveAttribution[uuid] ?? {})),
      uuid, name: token?.name ?? null,
      dc: Number.isFinite(target) ? target : undefined,
      saved: !!token && workflow.saves.has(token)
    });
  }
  for (const roll of [...workflow.damageRolls, ...(workflow.otherDamageRolls ?? []), ...(workflow.bonusDamageRolls ?? [])]) {
    const type = foundry.utils.getProperty(roll, "options.type");
    result.damage.push({ ...whyRoll(roll), type: typeof type === "string" ? type : undefined });
  }
  return result;
}
