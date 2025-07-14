export declare class RollStats {
    currentStats: {
        actorId: {
            name: string;
            session: {
                numAttacks: number;
                numAttack20: number;
                numAttackFumble: number;
                numAttackCritical: number;
                attackRollsDiceTotal: number;
                attackRollTotal: number;
                numD20Rolls: number;
                numDamageRolls: number;
                damageApplied: number;
                damageTotal: number;
            };
            lifetime: {
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
            };
            itemStats: any;
        };
    };
    showStats(): void;
    getEntityStats(id: any, collection: any): any;
    prepareStats(): any;
    getItemStats(item: any, id: any, collection: any): any;
    rollCount: any;
    static saveInterval: number;
    constructor();
    endSession(): Promise<void>;
    clearStats(): Promise<void>;
    clearActorStats(actorId: string): Promise<void>;
    GMremoveActorStats(actorId: any): void;
    toPrecision(number: any, digits: any): number;
    get statData(): any;
    fetchStats(): void;
    addDamage(hpDamage: number, totalDamage: number, numTargets: number, item: any): void;
    addAttackRoll({ rawRoll, fumble, critical, total }: {
        rawRoll: any;
        fumble: any;
        critical: any;
        total: any;
    }, item: any): void;
    updateEntity({ id }: {
        id: any;
    }): void;
    exportToJSON(): void;
    headerLine: string;
    dumpStatLine(actorName: string, itemName: string, stats: any): string;
    exportToCSV(): void;
    GMupdateEntity({ id, currentStats }: {
        id: any;
        currentStats: any;
    }): Promise<void>;
}
