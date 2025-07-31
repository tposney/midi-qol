export declare class RollStats {
    currentStats: Record<string, Stats>;
    showStats(): void;
    getEntityStats(id?: string | null, collection?: ValidCollection): Stats | undefined;
    prepareStats(): Record<string, Stats>;
    getItemStats(item: Item.Implementation, id: string, collection: ValidCollection): ItemStats | undefined;
    rollCount: number;
    static saveInterval: number;
    constructor();
    endSession(): Promise<void>;
    clearStats(): Promise<void>;
    clearActorStats(actorId: string): Promise<void>;
    GMremoveActorStats(actorId: string): void;
    toPrecision(number: number, digits: number): number;
    get statData(): Record<string, Stats>;
    fetchStats(): void;
    addDamage(hpDamage: number, totalDamage: number, numTargets: number, item?: Item.Implementation): void;
    addAttackRoll({ rawRoll, fumble, critical, total }: {
        rawRoll: number;
        fumble: boolean;
        critical: boolean;
        total: number;
    }, item: Item.Implementation): void;
    updateEntity(id?: string | null): void;
    exportToJSON(): void;
    headerLine: string;
    dumpStatLine(actorName: string, itemName: string, stats: InnerStats): string;
    exportToCSV(): void;
    GMupdateEntity({ id, currentStats }: {
        id: string;
        currentStats: Stats;
    }): Promise<void>;
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
export {};
