import { error, gameStats, i18n } from "../midi-qol.js";
import { RollStatsDisplay } from "./apps/RollStatsDisplay.js";
import { timedExecuteAsGM } from "./GMAction.js";
import { configSettings } from "./settings.js";

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
  session: foundry.utils.duplicate(blankStat),
  lifetime: foundry.utils.duplicate(blankStat),
  itemStats: {}
}
export class RollStats {
  currentStats: Record<string, Stats>;

  public showStats() {
    new RollStatsDisplay({ stats: this, playersOnly: configSettings.playerStatsOnly }).render({force: true});
  }

  getEntityStats(id?: string | null, collection?: ValidCollection) {
    if (!id || !collection) return;
    if (!this.currentStats[id]) {
      const entity = collection?.get(id) as Actor.Implementation | User.Implementation | undefined;
      if (!entity) return;
      if (entity instanceof Actor && configSettings.playerStatsOnly && !entity.hasPlayerOwner) return;
      if (entity instanceof User && configSettings.playerStatsOnly && entity.isGM) return;
      this.currentStats[id] = foundry.utils.duplicate({...blankStats, name: collection?.get(id)?.name ?? ""});
    } else {
      this.currentStats[id] = foundry.utils.mergeObject(this.currentStats[id], blankStats,
        { overwrite: false, inplace: true, insertKeys: true, insertValues: true });
    }
    return this.currentStats[id];
  }

  public prepareStats(): Record<string, Stats> {
    const stats = foundry.utils.duplicate(this.currentStats) as Record<string, Stats>;
    Object.keys(stats).forEach(aid => {
      const actStats = stats[aid];
      const lifetime = actStats.lifetime;
      const session = actStats.session;
      lifetime.attackRollAverage = this.toPrecision(lifetime.attackRollTotal / (lifetime.numAttacks || 1), 1);
      session.attackRollAverage = this.toPrecision(session.attackRollTotal / (session.numAttacks || 1), 1);

      lifetime.damageTotalAverage = this.toPrecision(lifetime.damageTotal / (lifetime.numAttacks || 1), 1);
      session.damageTotalAverage = this.toPrecision(session.damageTotal / (session.numAttacks || 1), 1);

      lifetime.damageAppliedAverage = this.toPrecision(lifetime.damageApplied / (lifetime.numAttacks || 1), 1);
      session.damageAppliedAverage = this.toPrecision(session.damageApplied / (session.numAttacks || 1), 1);
      Object.keys(actStats.itemStats).forEach(iid => {
        const itemStats = actStats.itemStats[iid].session;
        itemStats.attackRollAverage = this.toPrecision(itemStats.attackRollTotal / (itemStats.numAttacks || 1), 1);
        itemStats.damageTotalAverage = this.toPrecision(itemStats.damageTotal / (itemStats.numAttacks || 1), 1);
        itemStats.damageAppliedAverage = this.toPrecision(itemStats.damageApplied / (itemStats.numAttacks || 1), 1);
      })
    });
    return stats;
  }

  getItemStats(item: Item.Implementation, id: string, collection: ValidCollection) {
    if (!item) return { name: "", session: foundry.utils.duplicate(blankStat) as InnerStats };
    let currentStats = this.getEntityStats(id, collection);
    if (!currentStats) return;
    if (!currentStats.itemStats[item.name]) {
      currentStats.itemStats[item.name] = { name: item.name, session: foundry.utils.duplicate(blankStat) }
    }
    return currentStats.itemStats[item.name];
  }

  rollCount: number;
  static saveInterval = 1;
  constructor() {
    this.currentStats = game.settings.get("midi-qol", "RollStats");
    this.rollCount = 0;
  }

  async endSession() {
    if (!game.user?.isGM) return;
    Object.keys(this.currentStats).forEach(actorId => {
      this.currentStats[actorId].session = foundry.utils.duplicate(blankStat);
      this.currentStats[actorId].itemStats = {};
    });
    await game.settings.set("midi-qol", "RollStats", this.currentStats);
  }

  async clearStats() {
    if (!game.user?.isGM) return;
    await game.settings.set("midi-qol", "RollStats", {});
  }
  async clearActorStats(actorId: string) {
    timedExecuteAsGM("removeStatsForActorId", {
      actorId: actorId
    });
  }

  GMremoveActorStats(actorId: string) {
    if (!game.user?.isGM) return;
    delete this.currentStats[actorId];
    game.settings.set("midi-qol", "RollStats", this.currentStats);
  }

  toPrecision(number: number, digits: number) {
    return Math.round(number * (10 ** digits)) / (10 ** digits);
  }

  public get statData() {
    return this.prepareStats();

  }

  public fetchStats() {
    this.currentStats = game.settings.get("midi-qol", "RollStats");
  }

  public addDamage(hpDamage: number, totalDamage: number, numTargets: number, item?: Item.Implementation) {
    if (!item?.actor?.id) return;
    const actorStats = this.getEntityStats(item.actor.id, game.actors);
    if (!actorStats) return;
    let playerStats: Stats | undefined;
    if (game.user && item.actor.testUserPermission(game.user, "OWNER")) {
      playerStats = this.getEntityStats(game.user.id, game.users)
    }
    for (let stats of [actorStats, playerStats]) {
      if (!stats) continue;
      const session = stats.session;
      const lifetime = stats.lifetime;
      let itemStats: InnerStats | undefined;
      if (stats === actorStats)
        itemStats = this.getItemStats(item, item.actor.id, game.actors!)?.session;
      else if (game.user)
        itemStats = this.getItemStats(item, game.user.id, game.users)?.session;
      [session, lifetime, itemStats].filter(s => !!s).forEach(stats => {
        stats.numDamageRolls += 1;
        stats.damageApplied += hpDamage;
        stats.damageTotal += (totalDamage * numTargets);
        // @ts-expect-error no dnd5e-types
        if (item && !item.hasAttack) { // no attack so count each use as an attack
          stats.numAttacks += 1;
        }
      });
    }
    this.updateEntity(item.actor.id);
    if (playerStats) this.updateEntity(game.user?.id) 
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addAttackRoll({ rawRoll, fumble, critical, total }: { rawRoll: number; fumble: boolean; critical: boolean; total: number}, item: Item.Implementation) {
    const currentStats = this.getEntityStats(item.actor?.id, game.actors);
    if (!currentStats) return;
    let playerStats: Stats | undefined;
    if (game.user && item.actor?.testUserPermission(game.user, "OWNER")) {
      playerStats = this.getEntityStats(game.user.id, game.users)
    }
    for (let stats of [currentStats, playerStats]) {
      if (!stats) continue;
      let itemStats: InnerStats | undefined;
      if (stats === currentStats)
        itemStats = this.getItemStats(item, item.actor?.id ?? "", game.actors!)?.session;
      else
        itemStats = this.getItemStats(item, game.user?.id ?? "", game.users!)?.session;
      const session = stats.session;
      const lifetime = stats.lifetime;
      [session, lifetime, itemStats].forEach(stats => {
        if (!stats) return;
        stats.numAttacks += 1;
        if (rawRoll === 20) stats.numAttack20 += 1;
        if (critical) stats.numAttackCritical += 1;
        if (fumble) stats.numAttackFumble += 1;
        stats.attackRollsDiceTotal += rawRoll;
        stats.attackRollTotal += total;
      });
    }
    this.updateEntity(item.actor?.id);
    if (playerStats) this.updateEntity(game.user?.id);
    Hooks.callAll("midi-qol.StatsUpdated");
    
  }

  public updateEntity(id?: string | null) {
    if (!id) return;
    timedExecuteAsGM("updateEntityStats", {
      id,
      currentStats: gameStats.currentStats[id]
    })
  }
  public exportToJSON() {
    const data = this.currentStats;
    const filename = `fvtt-midi-qol-stats.json`;
    foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
  }

  public headerLine: string = `"Actor", "Item Name", "#Attacks", "# Nat20", "#Fumbles", "#Critical", "Attack Roll Dice Total", "Attack Roll Total", "Damage Rolls", "Total Damage Applied", "Damage Total"`;
  dumpStatLine(actorName: string, itemName: string, stats: InnerStats): string {
    return `"${actorName}","${itemName}", ${stats.numAttacks || 0}, ${stats.numAttack20 || 0}, ${stats.numAttackFumble || 0}, ${stats.numAttackCritical || 0}, ${stats.attackRollsDiceTotal || 0}, ${stats.attackRollTotal || 0}, ${stats.numDamageRolls || 0}, ${stats.damageApplied || 0}, ${stats.damageTotal || 0}`
  }
  public exportToCSV() {
    let csvText: string = foundry.utils.duplicate(this.headerLine) + "\n";
    for (let actorStats of Object.values(this.currentStats)) {
      csvText += this.dumpStatLine(actorStats.name, "life time", actorStats.lifetime) + "\n";
      csvText += this.dumpStatLine(actorStats.name, "Session", actorStats.session) + "\n";
      for (let itemStat of Object.values(actorStats.itemStats)) {
        csvText += this.dumpStatLine(actorStats.name, itemStat.name, itemStat.session) + "\n";
      }
    }
    const filename = `fvtt-midi-qol-stats.csv`;
    foundry.utils.saveDataToFile(csvText, "text/json", filename);
  }

  public async GMupdateEntity({ id, currentStats }: { id: string; currentStats: Stats }) {
    if (!id) return;
    this.currentStats[id] = currentStats;
    this.rollCount = (this.rollCount + 1) % Math.max(1, configSettings.saveStatsEvery);

    if (this.rollCount === 0) {
      await game.settings.set("midi-qol", "RollStats", this.currentStats);
    }
  }
}

type InnerStats = {
  numAttacks: number;
  numAttack20: number;
  numAttackFumble: number;
  numAttackCritical: number;
  numAttackMisses: number;
  attackRollsDiceTotal: number;
  attackRollTotal: number;
  numD20Rolls: number;
  numDamageRolls: number;
  damageApplied: number;
  damageTotal: number;
  attackRollAverage?: number;
  damageTotalAverage?: number;
  damageAppliedAverage?: number;
};
type ItemStats = {
  name: string;
  session: InnerStats;
};
export type Stats = {
  name: string;
  session: InnerStats;
  lifetime: InnerStats;
  itemStats: Record<string, ItemStats>;
};
type ValidCollection = foundry.documents.collections.Actors | foundry.documents.collections.Users;