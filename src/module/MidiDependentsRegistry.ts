import { warn, debugEnabled } from "../midi-qol.js";

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
export class MidiDependentsRegistry {
  // Map of parent document UUID -> Set of dependent document UUIDs
  static #dependents = new Map<string, Set<string>>();

  /**
   * Get all dependent documents for a given parent document.
   * @param document The parent document (Actor, Item, Effect, etc.) or its UUID
   * @returns Array of dependent documents
   */
  static get(document: foundry.abstract.Document.Any | string): foundry.abstract.Document.Any[] {
    const uuid = typeof document === "string" ? document : document?.uuid;
    if (!uuid) return [];
    return Array.from(this.#dependents.get(uuid) ?? [])
      .map(depUuid => fromUuidSync(depUuid, { strict: false }))
      .filter((d): d is foundry.abstract.Document.Any => !!d);
  }

  /**
   * Track a document as dependent on a parent document.
   * @param parentUuid UUID of the parent document
   * @param dependent The dependent document
   */
  static track(parentUuid: string, dependent: foundry.abstract.Document.Any) {
    if (!parentUuid || !dependent?.uuid) return;
    if (!this.#dependents.has(parentUuid)) this.#dependents.set(parentUuid, new Set());
    this.#dependents.get(parentUuid)!.add(dependent.uuid);
    if (debugEnabled > 1) warn(`MidiDependentsRegistry | Tracking ${dependent.uuid} as dependent on ${parentUuid}`);
  }

  /**
   * Stop tracking a document as dependent.
   * @param parentUuid UUID of the parent document
   * @param dependent The dependent document to stop tracking
   */
  static untrack(parentUuid: string, dependent: foundry.abstract.Document.Any) {
    if (!parentUuid || !dependent?.uuid) return;
    this.#dependents.get(parentUuid)?.delete(dependent.uuid);
    if (debugEnabled > 1) warn(`MidiDependentsRegistry | Untracking ${dependent.uuid} from ${parentUuid}`);
  }

  /**
   * Delete all dependents of a parent document.
   * Called when the parent document is deleted.
   * @param parentUuid UUID of the deleted parent document
   */
  static async deleteDependents(parentUuid: string): Promise<void> {
    const dependents = this.get(parentUuid);
    if (dependents.length === 0) return;

    if (debugEnabled > 0) warn(`MidiDependentsRegistry | Deleting ${dependents.length} dependents of ${parentUuid}`);

    for (const dependent of dependents) {
      try {
        //@ts-expect-error - delete options parameter varies by document type
        await dependent.delete({});
      } catch (err) {
        // Document may have been deleted by another system (race condition) - not an error
        if (debugEnabled > 0) warn(`MidiDependentsRegistry | Could not delete dependent ${dependent.uuid}:`, err);
      }
    }

    // Clean up the registry entry
    this.#dependents.delete(parentUuid);
  }

  /**
   * Clear all entries from the registry.
   * Useful for cleanup on world/scene change.
   */
  static clear() {
    this.#dependents.clear();
  }
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
export function MidiDependentDocumentMixin<T extends new (...args: any[]) => any>(Base: T) {
  class MidiDependentDocument extends Base {
    /** @inheritDoc */
    prepareData() {
      super.prepareData();
      // Read dnd5e.dependentOn flag (the unified flag for all parent types)
      const dependentOn = (this as any).flags?.dnd5e?.dependentOn;
      if (dependentOn && (this as any).uuid) {
        MidiDependentsRegistry.track(dependentOn, this as any);
      }
    }

    /** @inheritDoc */
    _onDelete(options: object, userId: string) {
      super._onDelete(options, userId);
      // Read dnd5e.dependentOn flag
      const dependentOn = (this as any).flags?.dnd5e?.dependentOn;
      if (dependentOn && (this as any).uuid) {
        MidiDependentsRegistry.untrack(dependentOn, this as any);
      }
    }
  }
  return MidiDependentDocument;
}
