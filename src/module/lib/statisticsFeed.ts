import { configSettings } from "../settings.js";
import type { Cue } from "./cues.js";
import type { TargetOutcome } from "./outcomes.js";
import { recordStatistic } from "../services/statistics/service.js";

/*
 * M23: the statistics service fed from cues (no call from the workflow): on the active GM, which gets every cue in
 * full, while Keep Roll Statistics is on. An attack roll at its result; a use's damage and saves when it ends (an
 * immune target's damage counts though no hit points change); death and concentration saves from their creature cues.
 */

const HEALING = new Set(["healing", "temphp"]);

function actorOf(cue: Cue): Actor.Implementation | undefined {
  const fromToken = cue.source ? (fromUuidSync(cue.source) as TokenDocument.Implementation | null)?.actor : undefined;
  if (fromToken) return fromToken;
  const item = cue.item ? fromUuidSync(cue.item) : undefined;
  return item instanceof Item && item.parent instanceof Actor ? item.parent : undefined;
}

/** The player who ran the use, if they own the creature (their own statistics) */
function playerOf(cue: Cue, actor: Actor.Implementation): string | undefined {
  const user = cue.raisedBy ? game.users?.get(cue.raisedBy) : undefined;
  return user && !user.isGM && actor.testUserPermission(user, "OWNER") ? user.id ?? undefined : undefined;
}

function targetActorId(outcome: TargetOutcome): string | undefined {
  const doc = fromUuidSync(outcome.target);
  if (doc instanceof TokenDocument) return doc.actor?.id ?? undefined;
  return doc instanceof Actor ? doc.id ?? undefined : undefined;
}

function positive(byType: Record<string, number>, healing = false): Record<string, number> {
  return Object.fromEntries(Object.entries(byType).filter(([type, value]) => value > 0 && (healing || !HEALING.has(type))));
}

const sum = (byType: Record<string, number>) => Object.values(byType).reduce((total, value) => total + value, 0);

function hasAttackActivity(cue: Cue): boolean {
  const item = cue.item ? fromUuidSync(cue.item) : undefined;
  const activities = item instanceof Item ? (item.system as { activities?: { some(test: (a: { hasAttack?: boolean }) => boolean): boolean } }).activities : undefined;
  return !!activities?.some(a => !!a.hasAttack);
}

function attackEvents(cue: Cue): void {
  const actor = actorOf(cue);
  if (!actor?.id || !cue.attackRoll) return;
  recordStatistic({ type: "attackRoll", actorId: actor.id, userId: playerOf(cue, actor), itemName: cue.itemName ?? "",
    rawRoll: cue.attackRoll.natural ?? 0, fumble: !!cue.fumble, critical: !!cue.critical, total: cue.attackRoll.total ?? 0,
    advantageMode: cue.attackRoll.advantageMode ?? 0 });
}

function useEndEvents(cue: Cue): void {
  const actor = actorOf(cue);
  if (!actor?.id) return;
  const userId = playerOf(cue, actor);
  const itemName = cue.itemName ?? "";
  const damaged = cue.outcomes.filter(o => o.damage);
  if (damaged.length) {
    let hpDamage = 0, totalDamage = 0, maxDamage = 0, healingDone = 0, kills = 0;
    const dealtByType: Record<string, number> = {};
    const appliedByType: Record<string, number> = {};
    for (const outcome of damaged) {
      const d = outcome.damage!;
      const hp = d.hp ?? 0, healed = d.healed ?? 0;
      hpDamage += hp;
      maxDamage = Math.max(maxDamage, hp);
      healingDone += healed;
      if (d.droppedToZero) kills += 1;
      const rolled = positive(d.rolled);
      const applied = positive(d.applied);
      totalDamage += sum(rolled);
      for (const [type, value] of Object.entries(rolled)) dealtByType[type] = (dealtByType[type] ?? 0) + value;
      for (const [type, value] of Object.entries(applied)) appliedByType[type] = (appliedByType[type] ?? 0) + value;
      const targetId = targetActorId(outcome);
      const taken = hp - healed;
      if (targetId && taken !== 0) recordStatistic({ type: "damageTaken", actorId: targetId, hpDamage: taken, damageByType: taken > 0 ? positive(d.applied, true) : {} });
    }
    recordStatistic({ type: "damage", actorId: actor.id, userId, itemName, hpDamage, totalDamage, maxDamage, healingDone, kills,
      hasAttackActivity: hasAttackActivity(cue), critical: !!cue.critical });
    if (Object.keys(dealtByType).length || Object.keys(appliedByType).length)
      recordStatistic({ type: "damageDealtByType", actorId: actor.id, userId, dealtByType, appliedByType });
  }
  const saved = cue.outcomes.filter(o => o.save);
  if (saved.length) {
    const numSuccess = saved.filter(o => o.save!.success).length;
    recordStatistic({ type: "saveResult", actorId: actor.id, userId, itemName, numSaves: saved.length, numSuccess, numFail: saved.length - numSuccess });
  }
}

function creatureActorId(cue: Cue): string | undefined {
  const doc = cue.actor ? fromUuidSync(cue.actor) : undefined;
  return doc instanceof Actor ? doc.id ?? undefined : undefined;
}

function onCue(cue: Cue): void {
  if (!configSettings.keepRollStats || !game.users?.activeGM?.isSelf) return;
  if (/^attack\.(hit|miss|critical|fumble)$/.test(cue.cue)) return attackEvents(cue);
  if (cue.cue === "use.end") return useEndEvents(cue);
  const save = cue.outcomes[0]?.save;
  const actorId = creatureActorId(cue);
  if (!save || !actorId) return;
  if (cue.cue === "deathSave.rolled") {
    // As dnd5e counts them: a natural 20 two successes (and up), a natural 1 two failures
    recordStatistic({ type: "deathSaveResult", actorId, successes: save.critical ? 2 : save.success ? 1 : 0, failures: save.fumble ? 2 : save.success ? 0 : 1 });
  } else if (cue.cue === "concentration.rolled") {
    recordStatistic({ type: "concentrationResult", actorId, success: save.success });
  }
}

export function registerStatisticsFeed(): void {
  Hooks.on("midi-qol.cue", onCue);
  Hooks.on("midi-qol.cueReceived", onCue);
}
