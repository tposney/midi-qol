import type { Workflow } from "../../Workflow.js";
import type { Activity } from "../../../globals.js";
import type { Entry, EntryAction, FoundEntry } from "./types.js";
import { editToggles, listToggles, setToggle } from "./offers.js";
export interface EventContext {
    /** The creature the event is about: the bearer at its turn, the user of a use, the roller of a roll */
    actor: Actor.Implementation;
    workflow?: Workflow;
    activity?: Activity;
    item?: Item.Implementation;
    target?: TokenDocument.Implementation;
    /** The event's own data, `event` in conditions */
    event?: Record<string, unknown>;
    combat?: Combat.Implementation | null;
    /** Only the entries on this document (an effect's uuid): MidiQOL.doOverTimeEffect for one effect */
    only?: string;
    /**
     * Which offers run (a reaction event, lib/entries/responseEvents.ts): "automatic" the always and toggle entries
     * (the asks go in the reaction prompt), "asks" the plain asks (no reaction prompt was shown) and the near holders'
     * asks and reactions, "near" only those (the creature's own were in its reaction prompt). All when absent.
     */
    offers?: "automatic" | "asks" | "near";
}
export interface ActionRun {
    /** The event the entry runs at */
    eventId: string;
    action: EntryAction;
    found: FoundEntry;
    context: EventContext;
    conditionData: Record<string, unknown>;
}
/** An action's result: `success` picks `then` (true) or `else` (false) */
export type ActionResult = {
    success?: boolean;
} | void;
export type ActionHandler = (run: ActionRun) => ActionResult | Promise<ActionResult>;
export interface EventDefinition {
    label?: string;
    /** Collects the entries for the event; the default collects by `who` (this, owner, bearer) */
    collect?: (context: EventContext, eventId: string) => FoundEntry[];
}
/**
 * M32d: how the entry editor shows an action: its fields by path in the action (`bonus.formula`); keys it doesn't name
 * are kept. An action without a schema is edited as JSON.
 */
export interface ActionField {
    path: string;
    label: string;
    type: "string" | "formula" | "number" | "boolean" | "select" | "list";
    /** select: its values, or a function giving them (damage types) */
    options?: readonly string[] | (() => readonly {
        value: string;
        label: string;
    }[]);
}
export interface ActionSchema {
    fields: readonly ActionField[];
}
export declare function registerEvent(id: string, definition?: EventDefinition): () => void;
export declare function registerAction(key: string, handler: ActionHandler, options?: {
    priority?: number;
    schema?: ActionSchema;
    label?: string;
}): () => void;
/** M32d: a schema (and label) for an action already registered (midi's own, attached in one place: actionSchemas.ts) */
export declare function setActionSchema(key: string, schema: ActionSchema, label?: string): void;
export declare function actionSchema(key: string): {
    schema?: ActionSchema;
    label: string;
};
/** The registered action an action object names (its highest-priority key) */
export declare function actionKeyOf(action: EntryAction): string | undefined;
/** M32d: the registered events (id and label) and action keys, for the entry editor */
export declare function registeredEvents(): {
    id: string;
    label: string;
}[];
export declare function registeredActionKeys(): string[];
/** M32d: what is wrong with an action list (not a list, an action naming no registered action), for the editor */
export declare function actionProblems(list: unknown): string[];
export declare function registerEffectEntryReader(id: string, reader: (effect: ActiveEffect.Implementation, actor: Actor.Implementation) => Entry[]): () => void;
/**
 * M11b: an effect's own entries for an event, run for its bearer: `ended` (the effect was deleted or disabled), from
 * the effect as it was. Conditions, limits and offers as any event.
 */
export declare function runEffectEvent(eventId: string, effect: ActiveEffect.Implementation, actor: Actor.Implementation, event?: Record<string, unknown>): Promise<EntryRunResult[]>;
/** An actor's applied effects' entries for an event, whatever their who */
export declare function actorEffectEntries(actor: Actor.Implementation, eventId: string): FoundEntry[];
/**
 * An item's entry with no `who` is about the uses of that item at a use event (`use.*`), and about its owner at any
 * other (attacked, damaging, a roll, a turn): Lucky's disadvantage, a reaction item's offer
 */
export declare function itemEntryIsOwners(f: FoundEntry, eventId: string): boolean;
/** The entries a event would run for this context, before conditions and limits (MidiQOL.entries.collect) */
export declare function collectEntries(eventId: string, context: EventContext): FoundEntry[];
/** The actor's entries offered as toggles (its items in use and applied effects), for the sheet's Toggles control */
export declare function actorToggleEntries(actor: Actor.Implementation): FoundEntry[];
/** An entry runs if its `who` filter (a near entry's) and its `if` hold */
export declare function entryHolds(f: FoundEntry, conditionData: Record<string, unknown>): Promise<boolean>;
/** The near holders are found again (an item, effect or actor changed; a rule was registered) */
export declare function invalidateEntryHomes(): void;
export declare function watchEntryHomes(): void;
/** The activity that applied an effect (dnd5e's system.origin, DAE's flags.dae.activity), while it still exists */
export declare function applyingActivity(effect: ActiveEffect.Implementation): Activity | undefined;
/** The actor whose use applied an effect */
export declare function originActor(effect: ActiveEffect.Implementation): Actor.Implementation | undefined;
/** An effect's state for an entry: its counts (saves, fails, stages) and uses */
export declare function entryState(effect: ActiveEffect.Implementation, entryId: string): Record<string, number>;
export declare function setEntryState(effect: ActiveEffect.Implementation, entryId: string, state: Record<string, number>): Promise<void>;
export declare function limitAllows(f: FoundEntry, context: EventContext): boolean;
export declare function spendEntryLimit(f: FoundEntry, context: EventContext): Promise<void>;
export declare function conditionDataFor(f: FoundEntry, context: EventContext): Record<string, unknown>;
export declare function holds(expression: string | undefined, conditionData: Record<string, unknown>): Promise<boolean>;
export interface EntryRunResult {
    entry: string;
    document: string;
    actions: string[];
}
/** Run a list of actions for an entry (a table row's, an action's then/else): the keys that ran are added to `ran` */
export declare function runActions(list: readonly EntryAction[], run: Omit<ActionRun, "action">, ran: string[]): Promise<void>;
/** Run a event's entries for this context (MidiQOL.entries.run): what ran, in order */
export declare function runEvent(eventId: string, context: EventContext): Promise<EntryRunResult[]>;
/**
 * Run an entry that was chosen (or runs by itself): its actions, then what taking it spends: its limit, its cost, the
 * reaction for a reaction offer, its group for the use. A reaction prompt's offer (lib/entries/responseEvents.ts) is
 * taken this way.
 */
export declare function takeEntry(eventId: string, f: FoundEntry, context: EventContext, conditionData: Record<string, unknown>): Promise<EntryRunResult>;
/**
 * The ask and reaction offers a event has for its creature, not yet run (a reaction prompt's): their conditions,
 * limits, costs and groups checked; reaction offers only while `reactionLeft`.
 */
export declare function offerableEntries(eventId: string, context: EventContext, reactionLeft: boolean): Promise<{
    found: FoundEntry;
    conditionData: Record<string, unknown>;
}[]>;
export declare function registerMidiEntryActions(): void;
export declare const entriesApi: {
    registerEvent: typeof registerEvent;
    registerAction: typeof registerAction;
    collect: typeof collectEntries;
    run: typeof runEvent;
    state: typeof entryState;
    toggles: typeof listToggles;
    setToggle: typeof setToggle;
    editToggles: typeof editToggles;
    events: () => string[];
    actions: () => string[];
};
