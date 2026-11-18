/**
 * Change event types for the registry
 */
export type RegistryChangeType = "track" | "untrack" | "clear" | "deleteDependents";
/**
 * Change event data passed to the hook
 */
export interface RegistryChangeEvent {
    type: RegistryChangeType;
    parentUuid?: string;
    dependentUuid?: string;
}
/**
 * Registry for midi-qol dependent documents.
 *
 * This registry tracks documents that depend on Actors, Items, or other non-ActiveEffect parents.
 * It works alongside dnd5e's DependentsRegistry but handles the case where parents are not ActiveEffects.
 *
 * Documents use the `flags.dnd5e.dependentOn` flag to specify their parent UUID.
 * The MidiDependentDocumentMixin reads this flag and tracks the document in this registry.
 * When a parent document is deleted, midi-qol's hooks use this registry to find and delete dependents.
 */
export declare class MidiDependentsRegistry {
    #private;
    /**
     * Get all dependent documents for a given parent document.
     * @param document The parent document (Actor, Item, Effect, etc.) or its UUID
     * @returns Array of dependent documents
     */
    static get(document: foundry.abstract.Document.Any | string): foundry.abstract.Document.Any[];
    /**
     * Track a document as dependent on a parent document.
     * @param parentUuid UUID of the parent document
     * @param dependent The dependent document
     */
    static track(parentUuid: string, dependent: foundry.abstract.Document.Any): void;
    /**
     * Stop tracking a document as dependent.
     * @param parentUuid UUID of the parent document
     * @param dependent The dependent document to stop tracking
     */
    static untrack(parentUuid: string, dependent: foundry.abstract.Document.Any): void;
    /**
     * Delete all dependents of a parent document.
     * Called when the parent document is deleted.
     * @param parentUuid UUID of the deleted parent document
     */
    static deleteDependents(parentUuid: string): Promise<void>;
    /**
     * Clear all entries from the registry.
     * Useful for cleanup on world/scene change.
     */
    static clear(): void;
    /**
     * Get all parent-dependent relationships in the registry.
     * @returns Array of {parentUuid, dependentUuids} objects
     */
    static getAll(): Array<{
        parentUuid: string;
        dependentUuids: string[];
    }>;
    /**
     * Check if registry has any entries.
     */
    static get size(): number;
}
/**
 * Mixin that adds midi-qol dependent document tracking to a document class.
 *
 * This mixin reads the `flags.dnd5e.dependentOn` flag (NOT midi-qol.dependentOn) and tracks
 * the document in MidiDependentsRegistry. This allows users to always use the same flag
 * regardless of whether the parent is an Actor, Item, or ActiveEffect.
 *
 * For ActiveEffect parents, dnd5e's own system handles deletion.
 * For Actor/Item parents, midi-qol's delete hooks use MidiDependentsRegistry.
 *
 * @param Base The base document class to wrap.
 * @returns The extended document class with midi-qol dependent tracking
 * @mixin
 */
/** Minimal interface for document instances used by the mixin — uuid, flags, and name are present on all Foundry documents */
interface MixinDocumentInstance {
    uuid: string;
    name: string;
    flags: Record<string, any>;
    prepareData(): void;
    _onCreate(data: object, options: object, userId: string): void;
    _preUpdate(changed: object, options: object, user: User): Promise<any>;
    _onUpdate(changed: object, options: object, userId: string): void;
    _onDelete(options: object, userId: string): void;
}
export declare function MidiDependentDocumentMixin<T extends new (...args: any[]) => MixinDocumentInstance>(Base: T): {
    new (...args: any[]): {
        /** @inheritDoc */
        prepareData(): void;
        /** @inheritDoc */
        _onCreate(data: object, options: object, userId: string): void;
        /** @inheritDoc */
        _preUpdate(changed: object, options: object, user: User): Promise<any>;
        /** @inheritDoc */
        _onUpdate(changed: object, options: object, userId: string): void;
        /** @inheritDoc */
        _onDelete(options: object, userId: string): void;
        uuid: string;
        name: string;
        flags: Record<string, any>;
    };
} & T;
/** The item, actor effect or item effect at `path` (e.g. "Item.<id>.ActiveEffect.<id>") inside an actor. */
export declare function actorEmbeddedByPath(actor: Actor.Implementation | null | undefined, path: string): Item.Implementation | ActiveEffect.Implementation | undefined;
/**
 * A copied token, actor or scene keeps its embedded ids but gets a new UUID, so a dependentOn that pointed inside the
 * original still does. Returns the same item or effect's UUID in the copy (actorUuid), or undefined if the flag
 * doesn't point into another copy of it. A token's actor only re-points flags into another token: its base actor's
 * items depend on the base actor.
 */
export declare function repointedDependentOn(flag: unknown, actorUuid: string | null, isToken: boolean, has: (path: string) => boolean): string | undefined;
type DependentSource = {
    _id?: string | null;
    flags?: {
        dnd5e?: {
            dependentOn?: string;
        };
    } | null;
    effects?: DependentSource[] | null;
};
/** Re-point dependentOn flags in a copied actor (or token's actor) at its own items and effects. */
export declare function repointCopiedDependents(actor: Actor.Implementation | null | undefined): Promise<void>;
/** As repointCopiedDependents, for an unlinked token's delta before the token is created (midi's teleport). */
export declare function repointCopiedDependentsSource(delta: {
    items?: DependentSource[] | null;
    effects?: DependentSource[] | null;
} | null | undefined, actorUuid: string, has: (path: string) => boolean): void;
/** Whether an unlinked token's delta has a dependentOn anywhere, so its actor is worth building to re-point it. */
export declare function tokenHasDependents(token: TokenDocument.Implementation): boolean;
export {};
