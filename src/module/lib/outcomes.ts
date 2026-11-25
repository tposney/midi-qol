import type { Workflow } from "../Workflow.js";
import type { DamageDescription } from "../../globals.js";

/*
 * A use's outcome per target (M26; shapes ~/Documents/midi-next-waveB-shapes-2026-11-20.md): a view, worked out when
 * read, over what the use already keeps (hit and save sets, the attack and save rolls, the card's targets, the damage
 * list, the effects that name the card), so it reads the same in flight and rebuilt from the card. Read-only.
 */

export interface AttackOutcome { hit: boolean, critical: boolean, fumble: boolean, natural?: number, total?: number, ac?: number, by?: number }
export interface SaveOutcome { ability?: string, success: boolean, critical: boolean, fumble: boolean, natural?: number, total?: number, dc?: number }
export interface DamageOutcome {
  /** By type, as rolled */
  rolled: Record<string, number>;
  /** By type, after resistances and the save */
  applied: Record<string, number>;
  /** rolled - applied, where positive */
  prevented: Record<string, number>;
  /** The hit points lost, temporary hit points lost, hit points healed: left out of a cue for a viewer who may not learn them (hpState) */
  hp?: number;
  temp?: number;
  healed?: number;
  /** Above 0 hit points before, 0 after */
  droppedToZero?: boolean;
}
export interface TargetOutcome {
  /** TokenDocument uuid */
  target: string;
  attack?: AttackOutcome;
  save?: SaveOutcome;
  damage?: DamageOutcome;
  /** uuids of the effects the use applied to the target that are still on it */
  effects: string[];
  /** M29: the target this one replaced (the use was redirected to it), and by what */
  redirectedFrom?: { target: string, label: string };
}

interface DamageEntryLike {
  damages: DamageDescription[];
  calculatedDamages: DamageDescription[];
  hpDamage: number;
  tempDamage: number;
  oldHP: number;
  newHP: number;
  /** false: worked out for the damage card only (an attack that missed it); nothing applied */
  isHit?: boolean;
}

const HEALING = new Set(["healing", "temphp"]);

function byType(damages: readonly DamageDescription[], into: Record<string, number>) {
  for (const damage of damages) {
    if (damage.type === "midi-none") continue;
    into[damage.type] = (into[damage.type] ?? 0) + damage.value;
  }
}

/** A target's damage from its damage entries (one per damage list: other damage may have its own). Pure. */
export function damageOutcome(all: readonly DamageEntryLike[]): DamageOutcome | undefined {
  // A missed target's entry is the damage card's figure, not damage done
  const entries = all.filter(entry => entry.isHit !== false);
  if (!entries.length) return undefined;
  const rolled: Record<string, number> = {};
  const applied: Record<string, number> = {};
  let hp = 0, temp = 0;
  for (const entry of entries) {
    byType(entry.damages, rolled);
    byType(entry.calculatedDamages, applied);
    hp += entry.hpDamage;
    temp += entry.tempDamage;
  }
  const prevented: Record<string, number> = {};
  for (const [type, value] of Object.entries(rolled)) {
    if (HEALING.has(type)) continue;
    const less = value - (applied[type] ?? 0);
    if (less > 0) prevented[type] = less;
  }
  const oldHP = entries[0].oldHP;
  const newHP = entries[entries.length - 1].newHP;
  return { rolled, applied, prevented, hp: Math.max(hp, 0), temp, healed: Math.max(-hp, 0), droppedToZero: oldHP > 0 && newHP === 0 };
}

/** The face of a roll's first die that counts (the kept d20) */
function naturalOf(roll: Roll | undefined): number | undefined {
  return roll?.dice[0]?.results.find(result => result.active)?.result;
}

/** Each target's outcome, by TokenDocument uuid */
export function outcomes(workflow: Workflow): Map<string, TargetOutcome> {
  const result = new Map<string, TargetOutcome>();
  const attackRoll = workflow.attackRoll;
  const descriptors = workflow.targetDescriptors ?? [];
  const cardUuid = workflow.itemCardUuid;
  const saveAbilities: unknown = workflow.saveActivityDetails?.ability;
  const saveAbility = saveAbilities instanceof Set ? [...saveAbilities].find((ability): ability is string => typeof ability === "string")
    : typeof saveAbilities === "string" ? saveAbilities : undefined;
  for (const token of workflow.targets.documents) {
    const uuid = token.uuid;
    if (!uuid) continue;
    const outcome: TargetOutcome = { target: uuid, effects: [] };
    const redirected = workflow.redirections?.find(r => r.to === uuid);
    if (redirected) outcome.redirectedFrom = { target: redirected.from, label: redirected.label };
    if (attackRoll) {
      const ac = descriptors.find(descriptor => descriptor.token === uuid)?.ac ?? undefined;
      const total = attackRoll.total ?? undefined;
      outcome.attack = {
        hit: workflow.hitTargets.has(token) || workflow.hitTargetsEC.has(token),
        critical: !!workflow.isCritical, fumble: !!workflow.isFumble,
        natural: naturalOf(attackRoll), total, ac,
        by: total !== undefined && ac !== undefined ? total - ac : undefined
      };
    }
    const saveRoll = workflow.saveRoll(uuid);
    // Without a save midi's failedSaves holds the targets hit (for applying effects): no save outcome
    if (saveRoll || (workflow.hasSave && (workflow.saves.has(token) || workflow.failedSaves.has(token)))) {
      // @ts-expect-error no dnd5e-types
      const target: unknown = saveRoll?.options.target;
      outcome.save = {
        ability: saveAbility,
        success: workflow.saves.has(token), critical: workflow.criticalSaves.has(token), fumble: workflow.fumbleSaves.has(token),
        natural: naturalOf(saveRoll), total: saveRoll?.total ?? undefined,
        dc: typeof target === "number" && Number.isFinite(target) ? target : workflow.saveDC
      };
    }
    outcome.damage = damageOutcome(workflow.targetDamage?.[uuid] ?? []);
    if (cardUuid && token.actor) {
      for (const effect of token.actor.effects) {
        if (foundry.utils.getProperty(effect, "system.origin.message") === cardUuid) outcome.effects.push(effect.uuid);
      }
    }
    result.set(uuid, outcome);
  }
  return result;
}
