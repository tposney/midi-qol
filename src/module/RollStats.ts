import { gameStats } from "../midi-qol.js";
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
  damageTotal: 0,
  numSaves: 0,
  numSaveSuccess: 0,
  numSaveFail: 0,
  maxDamage: 0,
  healingDone: 0,
  kills: 0,
  damageTaken: 0,
  healingReceived: 0,
  numConcentrationSaves: 0,
  numConcentrationSuccess: 0,
  numConcentrationFail: 0,
  numDeathSaves: 0,
  numDeathSaveSuccess: 0,
  numDeathSaveFail: 0
}
let blankStats = {
  session: foundry.utils.duplicate(blankStat),
  lifetime: foundry.utils.duplicate(blankStat),
  itemStats: {},
  sessionDamageTakenByType: {} as Record<string, number>,
  lifetimeDamageTakenByType: {} as Record<string, number>,
  sessionDamageDealtByType: {} as Record<string, number>,
  lifetimeDamageDealtByType: {} as Record<string, number>,
  sessionDamageAppliedByType: {} as Record<string, number>,
  lifetimeDamageAppliedByType: {} as Record<string, number>
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

      lifetime.hitRate = this.toPrecision(lifetime.numDamageRolls / (lifetime.numAttacks || 1) * 100, 0);
      session.hitRate = this.toPrecision(session.numDamageRolls / (session.numAttacks || 1) * 100, 0);
      Object.keys(actStats.itemStats).forEach(iid => {
        for (const itemStats of [actStats.itemStats[iid].session, actStats.itemStats[iid].lifetime]) {
          if (!itemStats) continue;
          itemStats.attackRollAverage = this.toPrecision(itemStats.attackRollTotal / (itemStats.numAttacks || 1), 1);
          itemStats.damageTotalAverage = this.toPrecision(itemStats.damageTotal / (itemStats.numAttacks || 1), 1);
          itemStats.damageAppliedAverage = this.toPrecision(itemStats.damageApplied / (itemStats.numAttacks || 1), 1);
        }
      })
    });
    return stats;
  }

  getItemStats(item: Item.Implementation, id: string, collection: ValidCollection) {
    if (!item) return { name: "", session: foundry.utils.duplicate(blankStat) as InnerStats, lifetime: foundry.utils.duplicate(blankStat) as InnerStats };
    let currentStats = this.getEntityStats(id, collection);
    if (!currentStats) return;
    if (!currentStats.itemStats[item.name]) {
      currentStats.itemStats[item.name] = { name: item.name, session: foundry.utils.duplicate(blankStat), lifetime: foundry.utils.duplicate(blankStat) }
    }
    // Backfill lifetime for pre-existing itemStats that lack it
    if (!currentStats.itemStats[item.name].lifetime) {
      currentStats.itemStats[item.name].lifetime = foundry.utils.duplicate(blankStat);
    }
    return currentStats.itemStats[item.name];
  }

  rollCount: number;
  constructor() {
    this.currentStats = game.settings.get("midi-qol", "RollStats");
    this.rollCount = 0;
  }

  async endSession() {
    if (!game.user?.isGM) return;
    Object.keys(this.currentStats).forEach(actorId => {
      this.currentStats[actorId].session = foundry.utils.duplicate(blankStat);
      Object.values(this.currentStats[actorId].itemStats).forEach(item => {
        item.session = foundry.utils.duplicate(blankStat);
      });
      this.currentStats[actorId].sessionDamageTakenByType = {};
      this.currentStats[actorId].sessionDamageDealtByType = {};
      this.currentStats[actorId].sessionDamageAppliedByType = {};
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

  public addDamage(hpDamage: number, totalDamage: number, item: Item.Implementation | undefined, maxDamage: number = 0, healingDone: number = 0, kills: number = 0) {
    const actorId = item?.actor?.id;
    if (!actorId) return;
    const actorStats = this.getEntityStats(actorId, game.actors);
    if (!actorStats) return;
    let playerStats: Stats | undefined;
    if (game.user && item!.actor!.testUserPermission(game.user, "OWNER")) {
      playerStats = this.getEntityStats(game.user.id, game.users)
    }
    for (let stats of [actorStats, playerStats]) {
      if (!stats) continue;
      const session = stats.session;
      const lifetime = stats.lifetime;
      let itemData: ItemStats | undefined;
      if (stats === actorStats)
        itemData = this.getItemStats(item!, actorId, game.actors!);
      else if (game.user)
        itemData = this.getItemStats(item!, game.user.id, game.users);
      const didDamage = totalDamage > 0 || hpDamage > 0;
      [session, lifetime, itemData?.session, itemData?.lifetime].filter(s => !!s).forEach(stats => {
        const isItemStats = (stats === itemData?.session || stats === itemData?.lifetime);
        if (didDamage) {
          stats.numDamageRolls += 1;
          stats.damageApplied += hpDamage;
          stats.damageTotal += totalDamage;
          stats.maxDamage = Math.max(stats.maxDamage, maxDamage);
        } else if (healingDone > 0 && isItemStats) {
          // Healing-only use: record as negative damage for item display
          stats.numDamageRolls += 1;
          stats.damageApplied -= healingDone;
          stats.damageTotal -= healingDone;
        }
        stats.healingDone += healingDone;
        stats.kills += kills;
        // @ts-expect-error no dnd5e-types for activities
        if ((didDamage || healingDone > 0) && item && !item.system.activities?.some(a => a.hasAttack)) { // no attack so count each use as an attack
          stats.numAttacks += 1;
        }
      });
    }
    this.updateEntity(actorId);
    if (playerStats) this.updateEntity(game.user?.id)
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addSaveResult(numSaves: number, numSuccess: number, numFail: number, item: Item.Implementation) {
    const actorId = item?.actor?.id;
    if (!actorId) return;
    const actorStats = this.getEntityStats(actorId, game.actors);
    if (!actorStats) return;
    let playerStats: Stats | undefined;
    if (game.user && item.actor!.testUserPermission(game.user, "OWNER")) {
      playerStats = this.getEntityStats(game.user.id, game.users)
    }
    for (let stats of [actorStats, playerStats]) {
      if (!stats) continue;
      let itemData: ItemStats | undefined;
      if (stats === actorStats)
        itemData = this.getItemStats(item, actorId, game.actors!);
      else if (game.user)
        itemData = this.getItemStats(item, game.user.id, game.users);
      [stats.session, stats.lifetime, itemData?.session, itemData?.lifetime].filter(s => !!s).forEach(stats => {
        stats.numSaves += numSaves;
        stats.numSaveSuccess += numSuccess;
        stats.numSaveFail += numFail;
      });
    }
    this.updateEntity(actorId);
    if (playerStats) this.updateEntity(game.user?.id);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addAttackRoll({ rawRoll, fumble, critical, total }: { rawRoll: number; fumble: boolean; critical: boolean; total: number}, item: Item.Implementation) {
    const actorId = item.actor?.id;
    const currentStats = this.getEntityStats(actorId, game.actors);
    if (!currentStats) return;
    let playerStats: Stats | undefined;
    if (game.user && item.actor?.testUserPermission(game.user, "OWNER")) {
      playerStats = this.getEntityStats(game.user.id, game.users)
    }
    for (let stats of [currentStats, playerStats]) {
      if (!stats) continue;
      let itemData: ItemStats | undefined;
      if (stats === currentStats)
        itemData = this.getItemStats(item, actorId ?? "", game.actors!);
      else
        itemData = this.getItemStats(item, game.user?.id ?? "", game.users!);
      const session = stats.session;
      const lifetime = stats.lifetime;
      [session, lifetime, itemData?.session, itemData?.lifetime].forEach(stats => {
        if (!stats) return;
        stats.numAttacks += 1;
        if (rawRoll === 20) stats.numAttack20 += 1;
        if (critical) stats.numAttackCritical += 1;
        if (fumble) stats.numAttackFumble += 1;
        stats.attackRollsDiceTotal += rawRoll;
        stats.attackRollTotal += total;
      });
    }
    this.updateEntity(actorId);
    if (playerStats) this.updateEntity(game.user?.id);
    Hooks.callAll("midi-qol.StatsUpdated");

  }

  public addDamageTaken(actorId: string, hpDamage: number, damageByType: Record<string, number>) {
    if (!actorId || hpDamage === 0) return;
    const actorStats = this.getEntityStats(actorId, game.actors);
    if (!actorStats) return;
    if (hpDamage > 0) {
      actorStats.session.damageTaken += hpDamage;
      actorStats.lifetime.damageTaken += hpDamage;
      for (const [type, amount] of Object.entries(damageByType)) {
        if (amount <= 0) continue;
        actorStats.sessionDamageTakenByType[type] = (actorStats.sessionDamageTakenByType[type] ?? 0) + amount;
        actorStats.lifetimeDamageTakenByType[type] = (actorStats.lifetimeDamageTakenByType[type] ?? 0) + amount;
      }
    } else {
      const healing = Math.abs(hpDamage);
      actorStats.session.healingReceived += healing;
      actorStats.lifetime.healingReceived += healing;
    }
    this.updateEntity(actorId);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addDamageDealtByType(item: Item.Implementation, dealtByType: Record<string, number>, appliedByType: Record<string, number>) {
    const actorId = item?.actor?.id;
    if (!actorId) return;
    const actorStats = this.getEntityStats(actorId, game.actors);
    if (!actorStats) return;
    let playerStats: Stats | undefined;
    if (game.user && item.actor!.testUserPermission(game.user, "OWNER")) {
      playerStats = this.getEntityStats(game.user.id, game.users);
    }
    for (const stats of [actorStats, playerStats]) {
      if (!stats) continue;
      for (const [type, amount] of Object.entries(dealtByType)) {
        if (amount <= 0) continue;
        stats.sessionDamageDealtByType[type] = (stats.sessionDamageDealtByType[type] ?? 0) + amount;
        stats.lifetimeDamageDealtByType[type] = (stats.lifetimeDamageDealtByType[type] ?? 0) + amount;
      }
      for (const [type, amount] of Object.entries(appliedByType)) {
        if (amount <= 0) continue;
        stats.sessionDamageAppliedByType[type] = (stats.sessionDamageAppliedByType[type] ?? 0) + amount;
        stats.lifetimeDamageAppliedByType[type] = (stats.lifetimeDamageAppliedByType[type] ?? 0) + amount;
      }
    }
    this.updateEntity(actorId);
    if (playerStats) this.updateEntity(game.user?.id);
  }

  public addConcentrationResult(actor: Actor.Implementation, success: boolean) {
    const actorId = actor?.id;
    if (!actorId) return;
    const actorStats = this.getEntityStats(actorId, game.actors);
    if (!actorStats) return;
    for (const stats of [actorStats.session, actorStats.lifetime]) {
      stats.numConcentrationSaves += 1;
      if (success) stats.numConcentrationSuccess += 1;
      else stats.numConcentrationFail += 1;
    }
    this.updateEntity(actorId);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addDeathSaveResult(actor: Actor.Implementation, successes: number, failures: number) {
    const actorId = actor?.id;
    if (!actorId) return;
    const actorStats = this.getEntityStats(actorId, game.actors);
    if (!actorStats) return;
    for (const stats of [actorStats.session, actorStats.lifetime]) {
      stats.numDeathSaves += 1;
      stats.numDeathSaveSuccess += successes;
      stats.numDeathSaveFail += failures;
    }
    this.updateEntity(actorId);
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

  public headerLine: string = `"Actor", "Item Name", "#Attacks", "# Nat20", "#Fumbles", "#Critical", "Attack Roll Dice Total", "Attack Roll Total", "Damage Rolls", "Total Damage Applied", "Damage Total", "#Saves", "#Save Success", "#Save Fail", "Max Damage", "Max Heal", "Kills", "Damage Taken", "Healing Received", "#Conc Saves", "#Conc Success", "#Conc Fail", "#Death Saves", "#Death Save Success", "#Death Save Fail"`;
  dumpStatLine(actorName: string, itemName: string, stats: InnerStats): string {
    return `"${actorName}","${itemName}", ${stats.numAttacks || 0}, ${stats.numAttack20 || 0}, ${stats.numAttackFumble || 0}, ${stats.numAttackCritical || 0}, ${stats.attackRollsDiceTotal || 0}, ${stats.attackRollTotal || 0}, ${stats.numDamageRolls || 0}, ${stats.damageApplied || 0}, ${stats.damageTotal || 0}, ${stats.numSaves || 0}, ${stats.numSaveSuccess || 0}, ${stats.numSaveFail || 0}, ${stats.maxDamage || 0}, ${stats.healingDone || 0}, ${stats.kills || 0}, ${stats.damageTaken || 0}, ${stats.healingReceived || 0}, ${stats.numConcentrationSaves || 0}, ${stats.numConcentrationSuccess || 0}, ${stats.numConcentrationFail || 0}, ${stats.numDeathSaves || 0}, ${stats.numDeathSaveSuccess || 0}, ${stats.numDeathSaveFail || 0}`
  }
  public exportToCSV() {
    let csvText: string = foundry.utils.duplicate(this.headerLine) + "\n";
    for (const period of ["session", "lifetime"] as const) {
      for (let actorStats of Object.values(this.currentStats)) {
        csvText += this.dumpStatLine(actorStats.name, period, actorStats[period]) + "\n";
        for (let itemStat of Object.values(actorStats.itemStats)) {
          csvText += this.dumpStatLine(actorStats.name, `${itemStat.name} (${period})`, itemStat[period]) + "\n";
        }
      }
    }
    const filename = `fvtt-midi-qol-stats.csv`;
    foundry.utils.saveDataToFile(csvText, "text/csv", filename);
  }

  public async saveStats() {
    if (game.user?.isGM) {
      await game.settings.set("midi-qol", "RollStats", this.currentStats);
    } else {
      await timedExecuteAsGM("saveAllStats", {});
    }
  }

  public async GMsaveAllStats() {
    if (!game.user?.isGM) return;
    await game.settings.set("midi-qol", "RollStats", this.currentStats);
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
  numSaves: number;
  numSaveSuccess: number;
  numSaveFail: number;
  maxDamage: number;
  healingDone: number;
  kills: number;
  damageTaken: number;
  healingReceived: number;
  numConcentrationSaves: number;
  numConcentrationSuccess: number;
  numConcentrationFail: number;
  numDeathSaves: number;
  numDeathSaveSuccess: number;
  numDeathSaveFail: number;
  attackRollAverage?: number;
  damageTotalAverage?: number;
  damageAppliedAverage?: number;
  hitRate?: number;
};
type ItemStats = {
  name: string;
  session: InnerStats;
  lifetime: InnerStats;
};
export type Stats = {
  name: string;
  session: InnerStats;
  lifetime: InnerStats;
  itemStats: Record<string, ItemStats>;
  sessionDamageTakenByType: Record<string, number>;
  lifetimeDamageTakenByType: Record<string, number>;
  sessionDamageDealtByType: Record<string, number>;
  lifetimeDamageDealtByType: Record<string, number>;
  sessionDamageAppliedByType: Record<string, number>;
  lifetimeDamageAppliedByType: Record<string, number>;
};
type ValidCollection = foundry.documents.collections.Actors | foundry.documents.collections.Users;