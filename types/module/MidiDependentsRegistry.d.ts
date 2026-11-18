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
export declare function MidiDependentDocumentMixin<T extends new (...args: any[]) => any>(Base: T): {
    new (...args: any[]): {
        [x: string]: any;
        /** @inheritDoc */
        prepareData(): void;
        /** @inheritDoc */
        _onDelete(options: object, userId: string): void;
    };
} & T;
