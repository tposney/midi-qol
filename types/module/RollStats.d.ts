/**
 * Discriminated union of stat update messages sent from clients to GM.
 * Each client sends only the raw roll data; the GM applies it as
 * increments to its authoritative copy.
 */
export type StatUpdateMessage = {
    type: "attackRoll";
    actorId: string;
    userId: string | undefined;
    itemName: string;
    rawRoll: number;
    fumble: boolean;
    critical: boolean;
    total: number;
    advantageMode: number;
} | {
    type: "damage";
    actorId: string;
    userId: string | undefined;
    itemName: string;
    hpDamage: number;
    totalDamage: number;
    maxDamage: number;
    healingDone: number;
    kills: number;
    hasAttackActivity: boolean;
    critical: boolean;
} | {
    type: "saveResult";
    actorId: string;
    userId: string | undefined;
    itemName: string;
    numSaves: number;
    numSuccess: number;
    numFail: number;
} | {
    type: "damageTaken";
    actorId: string;
    hpDamage: number;
    damageByType: Record<string, number>;
} | {
    type: "damageDealtByType";
    actorId: string;
    userId: string | undefined;
    dealtByType: Record<string, number>;
    appliedByType: Record<string, number>;
} | {
    type: "concentrationResult";
    actorId: string;
    success: boolean;
} | {
    type: "deathSaveResult";
    actorId: string;
    successes: number;
    failures: number;
};
export declare class RollStats {
    currentStats: Record<string, Stats>;
    showStats(): void;
    getEntityStats(id?: string | null, collection?: ValidCollection): Stats | undefined;
    prepareStats(): Record<string, Stats>;
    getItemStats(item: Item.Implementation | undefined, itemName: string, id: string, collection: ValidCollection): ItemStats | undefined;
    rollCount: number;
    constructor();
    endSession(): Promise<void>;
    clearStats(): Promise<void>;
    clearActorStats(actorId: string): Promise<void>;
    GMremoveActorStats(actorId: string): void;
    toPrecision(number: number, digits: number): number;
    get statData(): Record<string, Stats>;
    fetchStats(): void;
    addDamage(hpDamage: number, totalDamage: number, item: Item.Implementation | undefined, maxDamage?: number, healingDone?: number, kills?: number, critical?: boolean): void;
    addSaveResult(numSaves: number, numSuccess: number, numFail: number, item: Item.Implementation): void;
    addAttackRoll({ rawRoll, fumble, critical, total, advantageMode }: {
        rawRoll: number;
        fumble: boolean;
        critical: boolean;
        total: number;
        advantageMode: number;
    }, item: Item.Implementation): void;
    addDamageTaken(actorId: string, hpDamage: number, damageByType: Record<string, number>): void;
    addDamageDealtByType(item: Item.Implementation, dealtByType: Record<string, number>, appliedByType: Record<string, number>): void;
    addConcentrationResult(actor: Actor.Implementation, success: boolean): void;
    addDeathSaveResult(actor: Actor.Implementation, successes: number, failures: number): void;
    /**
     * GM-only: apply a stat update message as increments to the authoritative stats.
     * This is the single entry point for all stat recording, ensuring no race conditions.
     */
    GMrecordStats(msg: StatUpdateMessage): Promise<void>;
    private _getPlayerStats;
    private _recordAttackRoll;
    private _recordDamage;
    private _recordSaveResult;
    private _recordDamageTaken;
    private _recordDamageDealtByType;
    private _recordConcentrationResult;
    private _recordDeathSaveResult;
    exportToJSON(): void;
    headerLine: string;
    dumpStatLine(actorName: string, itemName: string, stats: InnerStats): string;
    exportToCSV(): void;
    saveStats(): Promise<void>;
    GMsaveAllStats(): Promise<void>;
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
export {};
