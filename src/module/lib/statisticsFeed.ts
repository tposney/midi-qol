import { configSettings } from "../settings.js";
import type { Cue } from "./cues.js";
import type { TargetOutcome } from "./outcomes.js";
import { recordStatistic } from "../services/statistics/service.js";

/*
 * M23: the statistics service fed from cues (no call from the workflow): on the active GM, which gets every cue in
 * full, while Roll statistics isn't off. An attack roll at its result (its targets' hits and misses); a use when it
 * ends (an immune target's damage counts though no hit points change); each target's damage taken and saves made;
 * death and concentration saves from their creature cues.
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

/** The item's id (its statistics' key; the uuid's last part, so a gone item keeps its key) */
function itemIdOf(cue: Cue): string | undefined {
  return cue.item?.split(".").at(-1);
}

function targetActorId(outcome: TargetOutcome): string | undefined {
  const doc = fromUuidSync(outcome.target);
  if (doc instanceof TokenDocument) return doc.actor?.id ?? undefined;
  return doc instanceof Actor ? doc.id ?? undefined : undefined;
}

function damageTypes(byType: Record<string, number>, healing = false): Record<string, number> {
  return Object.fromEntries(Object.entries(byType).filter(([type, value]) => value > 0 && HEALING.has(type) === healing));
}

const sum = (byType: Record<string, number>) => Object.values(byType).reduce((total, value) => total + value, 0);

function attackEvent(cue: Cue): void {
  const actor = actorOf(cue);
  if (!actor?.id || !cue.attackRoll) return;
  const attacked = cue.outcomes.filter(o => o.attack);
  const hits = attacked.filter(o => o.attack!.hit).length;
  recordStatistic({ type: "attackRoll", actorId: actor.id, userId: playerOf(cue, actor), itemId: itemIdOf(cue), itemName: cue.itemName ?? "",
    natural: cue.attackRoll.natural ?? 0, total: cue.attackRoll.total ?? 0, critical: !!cue.critical, fumble: !!cue.fumble,
    advantageMode: cue.attackRoll.advantageMode ?? 0, hits, misses: attacked.length - hits });
}

function useEndEvents(cue: Cue): void {
  const actor = actorOf(cue);
  if (!actor?.id) return;
  let damageRolled = 0, damageApplied = 0, maxDamage = 0, healingDone = 0, kills = 0, savesForced = 0, savesFailed = 0;
  const rolledByType: Record<string, number> = {};
  const appliedByType: Record<string, number> = {};
  for (const outcome of cue.outcomes) {
    const targetId = targetActorId(outcome);
    if (outcome.save) {
      savesForced += 1;
      if (!outcome.save.success) savesFailed += 1;
      if (targetId) recordStatistic({ type: "saveMade", actorId: targetId, success: outcome.save.success });
    }
    const d = outcome.damage;
    if (!d) continue;
    const rolled = damageTypes(d.rolled);
    const applied = damageTypes(d.applied);
    const appliedHere = sum(applied);
    damageRolled += sum(rolled);
    damageApplied += appliedHere;
    maxDamage = Math.max(maxDamage, appliedHere);
    healingDone += d.healed ?? 0;
    if (d.droppedToZero) kills += 1;
    for (const [type, value] of Object.entries(rolled)) rolledByType[type] = (rolledByType[type] ?? 0) + value;
    for (const [type, value] of Object.entries(applied)) appliedByType[type] = (appliedByType[type] ?? 0) + value;
    if (targetId && (appliedHere > 0 || (d.healed ?? 0) > 0))
      recordStatistic({ type: "damageTaken", actorId: targetId, damage: appliedHere, healing: d.healed ?? 0, byType: applied });
  }
  if (!damageRolled && !damageApplied && !healingDone && !savesForced) return;
  recordStatistic({ type: "use", actorId: actor.id, userId: playerOf(cue, actor), itemId: itemIdOf(cue), itemName: cue.itemName ?? "",
    attack: !!cue.attackRoll, critical: !!cue.critical, damageRolled, damageApplied, maxDamage, healingDone, kills,
    rolledByType, appliedByType, savesForced, savesFailed });
}

function creatureActorId(cue: Cue): string | undefined {
  const doc = cue.actor ? fromUuidSync(cue.actor) : undefined;
  return doc instanceof Actor ? doc.id ?? undefined : undefined;
}

function onCue(cue: Cue): void {
  if (configSettings.rollStatistics === "off" || !game.users?.activeGM?.isSelf) return;
  if (/^attack\.(hit|miss|critical|fumble)$/.test(cue.cue)) return attackEvent(cue);
  if (cue.cue === "use.end") return useEndEvents(cue);
  const save = cue.outcomes[0]?.save;
  const actorId = creatureActorId(cue);
  if (!save || !actorId) return;
  if (cue.cue === "deathSave.rolled") {
    // As dnd5e counts them: a natural 20 two successes (and up), a natural 1 two failures
    recordStatistic({ type: "deathSave", actorId, successes: save.critical ? 2 : save.success ? 1 : 0, failures: save.fumble ? 2 : save.success ? 0 : 1 });
  } else if (cue.cue === "concentration.rolled") {
    recordStatistic({ type: "concentration", actorId, success: save.success });
  }
}

export function registerStatisticsFeed(): void {
  Hooks.on("midi-qol.cue", onCue);
  Hooks.on("midi-qol.cueReceived", onCue);
}
