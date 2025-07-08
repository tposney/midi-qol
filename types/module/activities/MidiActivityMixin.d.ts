import { Workflow } from "../Workflow.js";
import { OnUseMacros } from "../apps/Item.js";
export declare class MidiConditionField extends globalThis.dnd5e.dataModels.fields.FormulaField {
    _validateType(value: any): value is string;
    constructor(options: any);
    static get _defaults(): any;
}
export declare var MidiActivityMixin: (Base: any) => {
    new (): {
        [x: string]: any;
        workflow: Workflow | undefined;
        targets: Set<TokenDocument | Token>;
        /**
         * @type {boolean}
         * @memberof MidiActivityMixin
         * @readonly
         * @returns {boolean}
         * @description Is this activity suitable as an other activity. It must be a possible other activity (default false) and the otherActivityCompatible flag must be set to true
         */
        readonly isOtherActivityCompatible: any;
        /**
         * @type {boolean}
         * @memberof MidiActivityMixin
         * @readonly
         * @returns {boolean}
         * @description Is this activity suitable as a triggerable activity. Default is true and must be overridden in the subclass
         * Examples of non triggerable activities are the Enchant activity
         */
        readonly isTriggerableActivity: boolean;
        /**
         * @type {boolean}
         * @memberof MidiActivityMixin
         * @readonly
         * @returns {boolean}
         * @description Is this activity only triggerable by the actor that owns it.
         * Default is false and must be overridden in the subclass
         * Examples of self triggerOnly are the Cast and Forward activities
         */
        readonly selfOnlyTriggerActivity: boolean;
        readonly forcedTargetConfirmation: string | undefined;
        /**
         * @type {boolean}
         * @memberof MidiActivityMixin
         * @readonly
         * @returns {boolean}
         * @description Is this activity a candidate to be used as an "other" activity. Default is false and must be overridden in the subclass
         */
        readonly possibleOtherActivity: boolean;
        readonly canUseOtherActivity: boolean;
        getOnUseMacros({ onlyOnUseItemMacros }?: {
            onlyOnUseItemMacros?: boolean | undefined;
        }): OnUseMacros;
        readonly validProperties: Set<string>;
        macro: Macro;
        readonly messageFlags: any;
        getTriggeredActivity(): Promise<any>;
        readonly triggeredActivityX: any;
        doConfirmation(actionToCall: any, event: any, target: any, message: any): Promise<void>;
        readonly identifier: any;
        prepareData(): void;
        _onChatAction(event: any, target: any, message: any): Promise<void>;
        useAs(actor: any, config?: any, dialog?: any, message?: any): any;
        use(usage?: any, dialog?: any, message?: any): any;
        checkAutoConsume(usage: any, dialog: any, message: any, rollToggle: any): void;
        rollDamage(config: any, dialog?: any, message?: any): Promise<any>;
        configureDamageRoll(config: any): void;
        getDamageConfig(config?: any): any;
        getDamageRollModifiers(roll: Roll): string[];
        createDamageRollModifiers(rollConfig: any): void;
        postProcessDamageRoll(config: any, result: Array<Roll>): Promise<Array<Roll>>;
        setupCanSeeSense(usage: any): Promise<void>;
        setupTargets(config: any, dialog: any, message: any): Promise<boolean>;
        confirmTargets(): Promise<void>;
        preTargetingChecks(usage: any, dialog: any, message: any, optionsConfig?: any): Promise<boolean>;
        preChatChecks(usage: any, dialog: any, message: any, optionsConfig?: any): Promise<boolean>;
        postChatCardChecks(usage: any, dialog: any, message: any, optionsConfig?: any): Promise<boolean>;
        _usageChatButtons(message: any): any;
        _placeEmanationTemplate(workflow: Workflow): Promise<any>;
        _usageChatContext(message: any): Promise<{
            [x: string]: any;
        } & {}>;
        readonly actionType: any;
        readonly otherActivity: any;
        readonly useCondition: any;
        readonly effectCondition: any;
        readonly reactionCondition: any;
        readonly otherCondition: any;
        readonly hasDamage: boolean;
        readonly hasHealing: boolean;
        readonly hasAttack: boolean;
        readonly hasSave: boolean;
    };
    [x: string]: any;
    LOCALIZATION_PREFIXES: any[];
    defineSchema(): any;
    metadata: {
        [x: string]: any;
    } & {};
    "__#6@#applyEffects"(event: any, target: any, message: any): Promise<void>;
    "__#6@#confirmDamageRollCancel"(event: any, target: any, message: any): Promise<void>;
    "__#6@#confirmDamageRollComplete"(event: any, target: any, message: any): Promise<void>;
    "__#6@#confirmDamageRollCompleteHit"(event: any, target: any, message: any): Promise<void>;
    "__#6@#confirmDamageRollCompleteMiss"(event: any, target: any, message: any): Promise<void>;
    "__#6@#rollDamage"(event: any, target: any, message: any): any;
    "__#6@#rollDamageNoCritical"(event: any, target: any, message: any): any;
    "__#6@#rollDamgeCritical"(event: any, target: any, message: any): any;
};
export declare var MidiActivityMixinSheet: (Base: any) => {
    new (): {
        [x: string]: any;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any): Promise<any>;
        /** @override */ _getHeaderButtons(): any;
    };
    [x: string]: any;
    DEFAULT_OPTIONS: any;
    "__#7@#addMacro"(): void;
    PARTS: any;
};
export declare var MidiActivityUsageDialog: any;
export declare function setupMidiActivityMixin(): void;
