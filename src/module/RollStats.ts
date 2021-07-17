import { error, gameStats, i18n } from "../midi-qol.js";
import { RollStatsDisplay } from "./apps/RollStatsDisplay.js";
import { socketlibSocket } from "./GMAction.js";
import { configSettings } from "./settings.js";

function fetchStats() {
  gameStats.fetchStats();
  Hooks.call("midi-qol.StatsUpdated");
}
const blankStat = {
  numAttacks: 0,
  numAttack20: 0,
  numAttackFumble: 0,
  numAttackCritical: 0,
  numAttackMisses: 0,
  attackRollsDiceTotal: 0,
  attackRollTotal: 0,
  numD20Rolls: 0,
  numDamageRolls: 0,
  damageApplied: 0,
  damageTotal: 0
}
let blankStats = {
  session: duplicate(blankStat),
  lifetime: duplicate(blankStat),
  itemStats: {}
}
export class RollStats {
  currentStats : {
    actorId: {
      name: string;
      session: {
        numAttacks: number,
        numAttack20: number,
        numAttackFumble: number,
        numAttackCritical: number,
        attackRollsDiceTotal: number,
        attackRollTotal: number,
        numD20Rolls: number,
        numDamageRolls: number,
        damageApplied: number,
        damageTotal: number,
      },
      lifetime: {
        numAttacks: number,
        numAttack20: number,
        numAttackFumble: number,
        numAttackCritical: number,
        numAttackMisses: number,
        attackRollsDiceTotal: number,
        attackRollTotal: number,
        numD20Rolls: number,
        numDamageRolls: number,
        damageApplied: number,
        damageTotal: number,
      },
      itemStats: any,
    }
  };

  public showStats() {
    new RollStatsDisplay(this, {playersOnly: configSettings.playerStatsOnly}).render(true);
  }

  getActorStats(actorId) {
    if (!this.currentStats[actorId]) {
      const actor = game.actors?.get(actorId);
      if (!actor || (configSettings.playerStatsOnly && !actor.hasPlayerOwner)) return null;
      this.currentStats[actorId] = duplicate(blankStats);
      this.currentStats[actorId].name = game.actors?.get(actorId)?.name;
    } else {
      this.currentStats[actorId] = mergeObject(this.currentStats[actorId], blankStats, 
        {overwrite: false, inplace: true, insertKeys: true, insertValues: true});
    }
    return this.currentStats[actorId];
  }

  public prepareStats() {
    const stats = duplicate(this.currentStats)
    Object.keys(stats).forEach(aid => {
      const actStats = stats[aid];
      const lifetime = actStats.lifetime;
      const session = actStats.session;
      lifetime.attackRollAverage = this.toPrecision(lifetime.attackRollTotal / (lifetime.numAttacks || 1), 1);
      session.attackRollAverage = this.toPrecision(session.attackRollTotal / (session.numAttacks || 1),1);

      lifetime.damageTotalAverage = this.toPrecision(lifetime.damageTotal / (lifetime.numAttacks || 1),1);
      session.damageTotalAverage = this.toPrecision(session.damageTotal / (session.numAttacks || 1),1);

      lifetime.damageAppliedAverage = this.toPrecision(lifetime.damageApplied / (lifetime.numAttacks || 1),1);
      session.damageAppliedAverage = this.toPrecision(session.damageApplied / (session.numAttacks || 1),1);
      Object.keys(actStats.itemStats).forEach(iid => {
        const itemStats = actStats.itemStats[iid].session;
        itemStats.attackRollAverage = this.toPrecision(itemStats.attackRollTotal / (itemStats.numAttacks || 1), 1);
        itemStats.damageTotalAverage = this.toPrecision(itemStats.damageTotal / (itemStats.numAttacks || 1),1);
        itemStats.damageAppliedAverage = this.toPrecision(itemStats.damageApplied / (itemStats.numAttacks || 1),1);
      })
    });
    return stats;
  }

  getitemStats(item) {
    if (!item) return duplicate(blankStat);
    let currentStats = this.getActorStats(item.actor.id);
    if (!currentStats) return null;
    if (!currentStats.itemStats[item.id]) {
      currentStats.itemStats[item.id] = {name: item.name, session: duplicate(blankStat)}
    }
    return currentStats.itemStats[item.id];
  }

  rollCount;
  static saveInterval = 1;
  constructor() {
    game.settings.register("midi-qol", "RollStats", {
      scope: "world",
      default: {},
      type: Object,
      config: false,
      onChange: fetchStats
    });
    //@ts-ignore
    this.currentStats = game.settings.get("midi-qol", "RollStats");
    this.rollCount = 0;
  }

  async endSession() {
    if (!game.user?.isGM) return;
    Object.keys(this.currentStats).forEach(actorId => {
      this.currentStats[actorId].session = duplicate(blankStat);
      this.currentStats[actorId].itemStats = {};
    });
    await game.settings.set("midi-qol", "RollStats", this.currentStats)
  }

  async clearStats() {
    if (!game.user?.isGM) return;
    await game.settings.set("midi-qol", "RollStats", {})
  }
  async clearActorStats(actorId: string) {
    socketlibSocket.executeAsGM("removeStatsForActorId", {
      actorId: actorId,
    })
  }

  GMremoveActorStats(actorId) {
    if (!game.user?.isGM) return;
    delete this.currentStats[actorId];
    game.settings.set("midi-qol", "RollStats", this.currentStats)
  }

  toPrecision(number, digits) {
    return Math.round(number * (10 ** digits))/ (10 ** digits);
  }

  public get statData() {
    return  this.prepareStats();

  }
  
  public fetchStats() {
    //@ts-ignore
    this.currentStats = game.settings.get("midi-qol", "RollStats");
  }

  public addDamage(appliedDamage: number, totalDamage: number, numTargets: number, item) {
    const actorStats = this.getActorStats(item?.actor?.id);
    if (!actorStats) return;
    const session = actorStats.session;
    const lifetime = actorStats.lifetime;
    const itemStats =this.getitemStats(item).session;
    [session, lifetime, itemStats].forEach(stats => {
      stats.numDamageRolls += 1;
      stats.damageApplied += appliedDamage;
      stats.damageTotal += (totalDamage * numTargets);
      if (item && !item.hasAttack) { // no attack so count each use as an attack
        stats.numAttacks += 1;
      }
    });
    this.updateActor({actorId: item.actor.id});
    Hooks.call("midi-qol.StatsUpdated");
  }

  public addAttackRoll({rawRoll, fumble, critical, total}, item) {
    const currentStats = this.getActorStats(item.actor?.id);
    if (!currentStats) return;
    const itemStats = this.getitemStats(item).session;
    const session = currentStats.session;
    const lifetime = currentStats.lifetime;
    [session, lifetime, itemStats].forEach(stats => {
      stats.numAttacks += 1;
      if (rawRoll === 20) stats.numAttack20 += 1;
      if (critical) stats.numAttackCritical += 1;
      if (fumble) stats.numAttackFumble += 1;
      stats.attackRollsDiceTotal += rawRoll;
      stats.attackRollTotal += total;
    });
    this.updateActor({actorId: item.actor.id});
    Hooks.call("midi-qol.StatsUpdated");
  }

  public updateActor({actorId}) {
    socketlibSocket.executeAsGM("updateActorStats", {
      actorId: actorId,
      currentStats: gameStats.currentStats[actorId],
    })
  }
  public exportToJSON() {
    const data = this.currentStats;
    const filename = `fvtt-midi-qol-stats.json`;
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
  }
  
  public headerLine: string = `"Actor", "Item Name", "#Attacks", "# Nat20", "#Fumbles", "#Critical", "Attack Roll Dice Total", "Attack Roll Total", "DamageZ Rolls", "Total Damage Applied", "Damage Total"`;
  dumpStatLine(actorName: string, itemName: string, stats: any): string {
    return `${actorName},${itemName}, ${stats.numAttacks|| 0}, ${stats.numAttack20|| 0}, ${stats.numAttackFumble|| 0}, ${stats.numAttackCritical|| 0}, ${stats.attackRollsDiceTotal|| 0}, ${stats.attackRollTotal|| 0}, ${stats.numDamageRolls|| 0}, ${stats.damageApplied|| 0}, ${stats.damageTotal|| 0}`
  }
  public exportToCSV() {
    let csvText: string = duplicate(this.headerLine) + "\n";
    for (let actorStats of Object.values(this.currentStats)) {
      csvText += this.dumpStatLine(actorStats.name, "life time",  actorStats.lifetime) + "\n";
      csvText += this.dumpStatLine(actorStats.name, "Session",  actorStats.session) + "\n";
      for (let itemStat of Object.values(actorStats.itemStats)) {
        const theStats: any = itemStat;
        csvText += this.dumpStatLine(actorStats.name, theStats.name, theStats.session) + "\n";
      }
    }
    const filename = `fvtt-midi-qol-stats.csv`;
    saveDataToFile(csvText, "text/json", filename);
  }

  public async GMupdateActor({actorId, currentStats}) {
    if (!actorId) return;
    this.currentStats[actorId] = currentStats;
    this.rollCount = (this.rollCount + 1) % Math.max(1, configSettings.saveStatsEvery);

    if (this.rollCount === 0) {
      await game.settings.set("midi-qol", "RollStats", this.currentStats);
    }
  }
}