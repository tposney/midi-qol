import { gameStats } from "../midi-qol.js";
import { RollStatsDisplay } from "./apps/RollStatsDisplay.js";
import { timedExecuteAsGM } from "./GMAction.js";
import { configSettings } from "./settings.js";

const blankStat = {
  numAttacks: 0,
  numAttack20: 0,
  numAttackFumble: 0,
  numAttackCritical: 0,
  numAttackAdvantage: 0,
  numAttackDisadvantage: 0,
  criticalDamageTotal: 0,
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

/**
 * Discriminated union of stat update messages sent from clients to GM.
 * Each client sends only the raw roll data; the GM applies it as
 * increments to its authoritative copy.
 */
export type StatUpdateMessage =
  | { type: "attackRoll"; actorId: string; userId: string | undefined; itemName: string; rawRoll: number; fumble: boolean; critical: boolean; total: number; advantageMode: number }
  | { type: "damage"; actorId: string; userId: string | undefined; itemName: string; hpDamage: number; totalDamage: number; maxDamage: number; healingDone: number; kills: number; hasAttackActivity: boolean; critical: boolean }
  | { type: "saveResult"; actorId: string; userId: string | undefined; itemName: string; numSaves: number; numSuccess: number; numFail: number }
  | { type: "damageTaken"; actorId: string; hpDamage: number; damageByType: Record<string, number> }
  | { type: "damageDealtByType"; actorId: string; userId: string | undefined; dealtByType: Record<string, number>; appliedByType: Record<string, number> }
  | { type: "concentrationResult"; actorId: string; success: boolean }
  | { type: "deathSaveResult"; actorId: string; successes: number; failures: number };

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

      lifetime.criticalDamageAverage = this.toPrecision(lifetime.criticalDamageTotal / (lifetime.numAttackCritical || 1), 1);
      session.criticalDamageAverage = this.toPrecision(session.criticalDamageTotal / (session.numAttackCritical || 1), 1);

      Object.keys(actStats.itemStats).forEach(iid => {
        for (const itemStats of [actStats.itemStats[iid].session, actStats.itemStats[iid].lifetime]) {
          if (!itemStats) continue;
          itemStats.attackRollAverage = this.toPrecision(itemStats.attackRollTotal / (itemStats.numAttacks || 1), 1);
          itemStats.damageTotalAverage = this.toPrecision(itemStats.damageTotal / (itemStats.numAttacks || 1), 1);
          itemStats.damageAppliedAverage = this.toPrecision(itemStats.damageApplied / (itemStats.numAttacks || 1), 1);
          itemStats.criticalDamageAverage = this.toPrecision(itemStats.criticalDamageTotal / (itemStats.numAttackCritical || 1), 1);
        }
      })
    });
    return stats;
  }

  getItemStats(item: Item.Implementation | undefined, itemName: string, id: string, collection: ValidCollection) {
    if (!itemName) return { name: "", session: foundry.utils.duplicate(blankStat) as InnerStats, lifetime: foundry.utils.duplicate(blankStat) as InnerStats };
    let currentStats = this.getEntityStats(id, collection);
    if (!currentStats) return;
    if (!currentStats.itemStats[itemName]) {
      currentStats.itemStats[itemName] = { name: itemName, session: foundry.utils.duplicate(blankStat), lifetime: foundry.utils.duplicate(blankStat) }
    }
    // Backfill lifetime for pre-existing itemStats that lack it
    if (!currentStats.itemStats[itemName].lifetime) {
      currentStats.itemStats[itemName].lifetime = foundry.utils.duplicate(blankStat);
    }
    return currentStats.itemStats[itemName];
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
    this.currentStats = {};
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

  // ==================== Client-side methods ====================
  // These send raw roll data to the GM via socket. The GM applies
  // the increments to its authoritative copy (see GMrecordStats).

  public addDamage(hpDamage: number, totalDamage: number, item: Item.Implementation | undefined, maxDamage: number = 0, healingDone: number = 0, kills: number = 0, critical: boolean = false) {
    const actorId = item?.actor?.id;
    if (!actorId) return;
    // @ts-expect-error no dnd5e-types for activities
    const hasAttackActivity = !!(item && item.system.activities?.some(a => a.hasAttack));
    const userId = (game.user && item!.actor!.testUserPermission(game.user, "OWNER")) ? game.user.id : undefined;
    timedExecuteAsGM("recordStats", {
      type: "damage", actorId, userId, itemName: item?.name ?? "",
      hpDamage, totalDamage, maxDamage, healingDone, kills, hasAttackActivity, critical
    } satisfies StatUpdateMessage);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addSaveResult(numSaves: number, numSuccess: number, numFail: number, item: Item.Implementation) {
    const actorId = item?.actor?.id;
    if (!actorId) return;
    const userId = (game.user && item.actor!.testUserPermission(game.user, "OWNER")) ? game.user.id : undefined;
    timedExecuteAsGM("recordStats", {
      type: "saveResult", actorId, userId, itemName: item.name,
      numSaves, numSuccess, numFail
    } satisfies StatUpdateMessage);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addAttackRoll({ rawRoll, fumble, critical, total, advantageMode }: { rawRoll: number; fumble: boolean; critical: boolean; total: number; advantageMode: number }, item: Item.Implementation) {
    const actorId = item.actor?.id;
    if (!actorId) return;
    const userId = (game.user && item.actor?.testUserPermission(game.user, "OWNER")) ? game.user.id : undefined;
    timedExecuteAsGM("recordStats", {
      type: "attackRoll", actorId, userId, itemName: item.name,
      rawRoll, fumble, critical, total, advantageMode
    } satisfies StatUpdateMessage);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addDamageTaken(actorId: string, hpDamage: number, damageByType: Record<string, number>) {
    if (!actorId || hpDamage === 0) return;
    timedExecuteAsGM("recordStats", {
      type: "damageTaken", actorId, hpDamage, damageByType
    } satisfies StatUpdateMessage);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addDamageDealtByType(item: Item.Implementation, dealtByType: Record<string, number>, appliedByType: Record<string, number>) {
    const actorId = item?.actor?.id;
    if (!actorId) return;
    const userId = (game.user && item.actor!.testUserPermission(game.user, "OWNER")) ? game.user.id : undefined;
    timedExecuteAsGM("recordStats", {
      type: "damageDealtByType", actorId, userId, dealtByType, appliedByType
    } satisfies StatUpdateMessage);
  }

  public addConcentrationResult(actor: Actor.Implementation, success: boolean) {
    const actorId = actor?.id;
    if (!actorId) return;
    timedExecuteAsGM("recordStats", {
      type: "concentrationResult", actorId, success
    } satisfies StatUpdateMessage);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  public addDeathSaveResult(actor: Actor.Implementation, successes: number, failures: number) {
    const actorId = actor?.id;
    if (!actorId) return;
    timedExecuteAsGM("recordStats", {
      type: "deathSaveResult", actorId, successes, failures
    } satisfies StatUpdateMessage);
    Hooks.callAll("midi-qol.StatsUpdated");
  }

  // ==================== GM-side recording ====================
  // Only runs on the GM. Applies raw roll data as increments to
  // the authoritative stats. Called via socket from any client.

  /**
   * GM-only: apply a stat update message as increments to the authoritative stats.
   * This is the single entry point for all stat recording, ensuring no race conditions.
   */
  public async GMrecordStats(msg: StatUpdateMessage) {
    if (!game.user?.isGM) return;

    switch (msg.type) {
      case "attackRoll":
        this._recordAttackRoll(msg);
        break;
      case "damage":
        this._recordDamage(msg);
        break;
      case "saveResult":
        this._recordSaveResult(msg);
        break;
      case "damageTaken":
        this._recordDamageTaken(msg);
        break;
      case "damageDealtByType":
        this._recordDamageDealtByType(msg);
        break;
      case "concentrationResult":
        this._recordConcentrationResult(msg);
        break;
      case "deathSaveResult":
        this._recordDeathSaveResult(msg);
        break;
    }

    // Periodic save
    this.rollCount = (this.rollCount + 1) % Math.max(1, configSettings.saveStatsEvery);
    if (this.rollCount === 0) {
      await game.settings.set("midi-qol", "RollStats", this.currentStats);
    }
  }

  private _getPlayerStats(actorId: string, userId: string | undefined): Stats | undefined {
    if (!userId) return undefined;
    const user = game.users?.get(userId);
    if (!user) return undefined;
    const actor = game.actors?.get(actorId);
    if (!actor || !actor.testUserPermission(user, "OWNER")) return undefined;
    return this.getEntityStats(userId, game.users);
  }

  private _recordAttackRoll(msg: Extract<StatUpdateMessage, { type: "attackRoll" }>) {
    const actorStats = this.getEntityStats(msg.actorId, game.actors);
    if (!actorStats) return;
    const playerStats = this._getPlayerStats(msg.actorId, msg.userId);

    for (const stats of [actorStats, playerStats]) {
      if (!stats) continue;
      const itemData = (stats === actorStats)
        ? this.getItemStats(undefined, msg.itemName, msg.actorId, game.actors!)
        : this.getItemStats(undefined, msg.itemName, msg.userId ?? "", game.users!);
      for (const s of [stats.session, stats.lifetime, itemData?.session, itemData?.lifetime]) {
        if (!s) continue;
        s.numAttacks += 1;
        if (msg.rawRoll === 20) s.numAttack20 += 1;
        if (msg.critical) s.numAttackCritical += 1;
        if (msg.fumble) s.numAttackFumble += 1;
        s.attackRollsDiceTotal += msg.rawRoll;
        s.attackRollTotal += msg.total;
        if (msg.advantageMode === 1) s.numAttackAdvantage += 1;
        else if (msg.advantageMode === -1) s.numAttackDisadvantage += 1;
      }
    }
  }

  private _recordDamage(msg: Extract<StatUpdateMessage, { type: "damage" }>) {
    const actorStats = this.getEntityStats(msg.actorId, game.actors);
    if (!actorStats) return;
    const playerStats = this._getPlayerStats(msg.actorId, msg.userId);
    const didDamage = msg.totalDamage > 0 || msg.hpDamage > 0;

    for (const stats of [actorStats, playerStats]) {
      if (!stats) continue;
      const itemData = (stats === actorStats)
        ? this.getItemStats(undefined, msg.itemName, msg.actorId, game.actors!)
        : this.getItemStats(undefined, msg.itemName, msg.userId ?? "", game.users!);
      for (const s of [stats.session, stats.lifetime, itemData?.session, itemData?.lifetime]) {
        if (!s) continue;
        const isItemStats = (s === itemData?.session || s === itemData?.lifetime);
        if (didDamage) {
          s.numDamageRolls += 1;
          s.damageApplied += msg.hpDamage;
          s.damageTotal += msg.totalDamage;
          s.maxDamage = Math.max(s.maxDamage, msg.maxDamage);
          if (msg.critical) s.criticalDamageTotal += msg.totalDamage;
        } else if (msg.healingDone > 0 && isItemStats) {
          s.numDamageRolls += 1;
          s.damageApplied -= msg.healingDone;
          s.damageTotal -= msg.healingDone;
        }
        s.healingDone += msg.healingDone;
        s.kills += msg.kills;
        if ((didDamage || msg.healingDone > 0) && !msg.hasAttackActivity) {
          s.numAttacks += 1;
        }
      }
    }
  }

  private _recordSaveResult(msg: Extract<StatUpdateMessage, { type: "saveResult" }>) {
    const actorStats = this.getEntityStats(msg.actorId, game.actors);
    if (!actorStats) return;
    const playerStats = this._getPlayerStats(msg.actorId, msg.userId);

    for (const stats of [actorStats, playerStats]) {
      if (!stats) continue;
      const itemData = (stats === actorStats)
        ? this.getItemStats(undefined, msg.itemName, msg.actorId, game.actors!)
        : this.getItemStats(undefined, msg.itemName, msg.userId ?? "", game.users!);
      for (const s of [stats.session, stats.lifetime, itemData?.session, itemData?.lifetime]) {
        if (!s) continue;
        s.numSaves += msg.numSaves;
        s.numSaveSuccess += msg.numSuccess;
        s.numSaveFail += msg.numFail;
      }
    }
  }

  private _recordDamageTaken(msg: Extract<StatUpdateMessage, { type: "damageTaken" }>) {
    const actorStats = this.getEntityStats(msg.actorId, game.actors);
    if (!actorStats) return;
    if (msg.hpDamage > 0) {
      actorStats.session.damageTaken += msg.hpDamage;
      actorStats.lifetime.damageTaken += msg.hpDamage;
      for (const [type, amount] of Object.entries(msg.damageByType)) {
        if (amount <= 0) continue;
        actorStats.sessionDamageTakenByType[type] = (actorStats.sessionDamageTakenByType[type] ?? 0) + amount;
        actorStats.lifetimeDamageTakenByType[type] = (actorStats.lifetimeDamageTakenByType[type] ?? 0) + amount;
      }
    } else {
      const healing = Math.abs(msg.hpDamage);
      actorStats.session.healingReceived += healing;
      actorStats.lifetime.healingReceived += healing;
    }
  }

  private _recordDamageDealtByType(msg: Extract<StatUpdateMessage, { type: "damageDealtByType" }>) {
    const actorStats = this.getEntityStats(msg.actorId, game.actors);
    if (!actorStats) return;
    const playerStats = this._getPlayerStats(msg.actorId, msg.userId);

    for (const stats of [actorStats, playerStats]) {
      if (!stats) continue;
      for (const [type, amount] of Object.entries(msg.dealtByType)) {
        if (amount <= 0) continue;
        stats.sessionDamageDealtByType[type] = (stats.sessionDamageDealtByType[type] ?? 0) + amount;
        stats.lifetimeDamageDealtByType[type] = (stats.lifetimeDamageDealtByType[type] ?? 0) + amount;
      }
      for (const [type, amount] of Object.entries(msg.appliedByType)) {
        if (amount <= 0) continue;
        stats.sessionDamageAppliedByType[type] = (stats.sessionDamageAppliedByType[type] ?? 0) + amount;
        stats.lifetimeDamageAppliedByType[type] = (stats.lifetimeDamageAppliedByType[type] ?? 0) + amount;
      }
    }
  }

  private _recordConcentrationResult(msg: Extract<StatUpdateMessage, { type: "concentrationResult" }>) {
    const actorStats = this.getEntityStats(msg.actorId, game.actors);
    if (!actorStats) return;
    for (const s of [actorStats.session, actorStats.lifetime]) {
      s.numConcentrationSaves += 1;
      if (msg.success) s.numConcentrationSuccess += 1;
      else s.numConcentrationFail += 1;
    }
  }

  private _recordDeathSaveResult(msg: Extract<StatUpdateMessage, { type: "deathSaveResult" }>) {
    const actorStats = this.getEntityStats(msg.actorId, game.actors);
    if (!actorStats) return;
    for (const s of [actorStats.session, actorStats.lifetime]) {
      s.numDeathSaves += 1;
      s.numDeathSaveSuccess += msg.successes;
      s.numDeathSaveFail += msg.failures;
    }
  }

  // ==================== Legacy GM methods ====================

  public exportToJSON() {
    const data = this.currentStats;
    const filename = `fvtt-midi-qol-stats.json`;
    foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
  }

  public headerLine: string = `"Actor", "Item Name", "#Attacks", "# Nat20", "#Fumbles", "#Critical", "#Advantage", "#Disadvantage", "Critical Damage Total", "Attack Roll Dice Total", "Attack Roll Total", "Damage Rolls", "Total Damage Applied", "Damage Total", "#Saves", "#Save Success", "#Save Fail", "Max Damage", "Max Heal", "Kills", "Damage Taken", "Healing Received", "#Conc Saves", "#Conc Success", "#Conc Fail", "#Death Saves", "#Death Save Success", "#Death Save Fail"`;
  dumpStatLine(actorName: string, itemName: string, stats: InnerStats): string {
    return `"${actorName}","${itemName}", ${stats.numAttacks || 0}, ${stats.numAttack20 || 0}, ${stats.numAttackFumble || 0}, ${stats.numAttackCritical || 0}, ${stats.numAttackAdvantage || 0}, ${stats.numAttackDisadvantage || 0}, ${stats.criticalDamageTotal || 0}, ${stats.attackRollsDiceTotal || 0}, ${stats.attackRollTotal || 0}, ${stats.numDamageRolls || 0}, ${stats.damageApplied || 0}, ${stats.damageTotal || 0}, ${stats.numSaves || 0}, ${stats.numSaveSuccess || 0}, ${stats.numSaveFail || 0}, ${stats.maxDamage || 0}, ${stats.healingDone || 0}, ${stats.kills || 0}, ${stats.damageTaken || 0}, ${stats.healingReceived || 0}, ${stats.numConcentrationSaves || 0}, ${stats.numConcentrationSuccess || 0}, ${stats.numConcentrationFail || 0}, ${stats.numDeathSaves || 0}, ${stats.numDeathSaveSuccess || 0}, ${stats.numDeathSaveFail || 0}`
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
}

type InnerStats = {
  numAttacks: number;
  numAttack20: number;
  numAttackFumble: number;
  numAttackCritical: number;
  numAttackAdvantage: number;
  numAttackDisadvantage: number;
  criticalDamageTotal: number;
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
  criticalDamageAverage?: number;
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
