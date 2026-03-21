import { warn, debugEnabled, error, debug, log } from "../../midi-qol.js";
import { TroubleShooter } from "../apps/TroubleShooter.js";

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

    const isNewParent = !this.#dependents.has(parentUuid);
    if (isNewParent) this.#dependents.set(parentUuid, new Set());
    const dependentSet = this.#dependents.get(parentUuid)!;
    const isNewDependent = !dependentSet.has(dependent.uuid);
    if (!isNewDependent) return; // Already tracking this dependent
    dependentSet.add(dependent.uuid);
    if (debugEnabled > 0) log(`MidiDependentsRegistry | TRACK: ${("name" in dependent ? dependent.name : "")} (${dependent.uuid}) depends on ${parentUuid}`);
    Hooks.callAll("midi-qol.dependentsRegistryChanged", { type: "track", parentUuid, dependentUuid: dependent.uuid } as RegistryChangeEvent);
  }

  /**
   * Stop tracking a document as dependent.
   * @param parentUuid UUID of the parent document
   * @param dependent The dependent document to stop tracking
   */
  static untrack(parentUuid: string, dependent: foundry.abstract.Document.Any) {
    if (!parentUuid || !dependent?.uuid) return;
    const dependentSet = this.#dependents.get(parentUuid);
    if (!dependentSet?.has(dependent.uuid)) return; // Not tracking this dependent
    dependentSet.delete(dependent.uuid);
    // Clean up empty parent entries
    if (dependentSet.size === 0) this.#dependents.delete(parentUuid);
    if (debugEnabled > 0) log(`MidiDependentsRegistry | UNTRACK: ${("name" in dependent ? dependent.name : "")} (${dependent.uuid}) no longer depends on ${parentUuid}`);
    Hooks.callAll("midi-qol.dependentsRegistryChanged", { type: "untrack", parentUuid, dependentUuid: dependent.uuid } as RegistryChangeEvent);
  }

  /**
   * Delete all dependents of a parent document.
   * Called when the parent document is deleted.
   * @param parentUuid UUID of the deleted parent document
   */
  static async deleteDependents(parentUuid: string): Promise<void> {
    const dependents = this.get(parentUuid);
    if (dependents.length === 0) return;

    if (debugEnabled > 0) log(`MidiDependentsRegistry | Deleting ${dependents.length} dependents of ${parentUuid}`);

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
    Hooks.callAll("midi-qol.dependentsRegistryChanged", { type: "deleteDependents", parentUuid } as RegistryChangeEvent);
  }

  /**
   * Clear all entries from the registry.
   * Useful for cleanup on world/scene change.
   */
  static clear() {
    if (this.#dependents.size === 0) return; // Nothing to clear
    this.#dependents.clear();
    Hooks.callAll("midi-qol.dependentsRegistryChanged", { type: "clear" } as RegistryChangeEvent);
  }

  /**
   * Get all parent-dependent relationships in the registry.
   * @returns Array of {parentUuid, dependentUuids} objects
   */
  static getAll(): Array<{ parentUuid: string; dependentUuids: string[] }> {
    const entries: Array<{ parentUuid: string; dependentUuids: string[] }> = [];
    for (const [parentUuid, dependentSet] of this.#dependents.entries()) {
      if (dependentSet.size > 0) {
        entries.push({ parentUuid, dependentUuids: Array.from(dependentSet) });
      }
    }
    return entries;
  }

  /**
   * Check if registry has any entries.
   */
  static get size(): number {
    return this.#dependents.size;
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

export function MidiDependentDocumentMixin<T extends new (...args: any[]) => MixinDocumentInstance>(Base: T) {
  class MidiDependentDocument extends Base {
    /** @inheritDoc */
    prepareData() {
      super.prepareData();
      // Only track during initialization (game.ready === false) when loading from database
      // After game is ready, _onCreate() handles tracking for newly created documents
      if (game.ready) return;
      try {
        const dependentOn = this.flags?.dnd5e?.dependentOn;
        if (dependentOn && this.uuid) {
          MidiDependentsRegistry.track(dependentOn, this as unknown as foundry.abstract.Document.Any);
        }
      } catch (err) {
        const message = `MidiDependentsRegistry.prepareData`;
        TroubleShooter.recordError(err, message);
        error(message, err);
      }
    }

    /** @inheritDoc */
    _onCreate(data: object, options: object, userId: string) {
      const returnValue = super._onCreate(data, options, userId);
      try {
        // Track newly created documents if they have the flag set at creation
        const dependentOn = this.flags?.dnd5e?.dependentOn;
        if (dependentOn && this.uuid) {
          MidiDependentsRegistry.track(dependentOn, this as unknown as foundry.abstract.Document.Any);
        }
      } catch (err) {
        const message = `MidiDependentsRegistry._onCreate`;
        TroubleShooter.recordError(err, message);
        error(message, err);
      }
      return returnValue;
    }

    /** @inheritDoc */
    async _preUpdate(changed: object, options: object, user: User) {
      const allowed = await super._preUpdate(changed, options, user);
      try {
        // Check if dependentOn flag is being changed/deleted
        const dnd5eFlags = (changed as Record<string, any>).flags?.dnd5e;
        if (!dnd5eFlags) return true;
        if (!("dependentOn" in dnd5eFlags || "-=dependentOn" in dnd5eFlags)) return true;

        const oldParent = this.flags?.dnd5e?.dependentOn;
        if (oldParent && this.uuid) {
          MidiDependentsRegistry.untrack(oldParent, this as unknown as foundry.abstract.Document.Any);
        }
      } catch (err) {
        const message = `MidiDependentsRegistry._preUpdate`;
        TroubleShooter.recordError(err, message);
        error(message, err);
      }
      return allowed;
    }

    /** @inheritDoc */
    _onUpdate(changed: object, options: object, userId: string) {
      super._onUpdate(changed, options, userId);
      try {
        // Handle dependentOn flag being added or changed
        const dnd5eFlags = (changed as Record<string, any>).flags?.dnd5e;
        if (!dnd5eFlags || !("dependentOn" in dnd5eFlags)) return;

        const newParent = this.flags?.dnd5e?.dependentOn;
        if (newParent && this.uuid) {
          MidiDependentsRegistry.track(newParent, this as unknown as foundry.abstract.Document.Any);
        }
      } catch (err) {
        const message = `MidiDependentsRegistry._onUpdate`;
        TroubleShooter.recordError(err, message);
        error(message, err);
      }
    }

    /** @inheritDoc */
    _onDelete(options: object, userId: string) {
      super._onDelete(options, userId);
      try {
        // Read dnd5e.dependentOn flag
        const dependentOn = this.flags?.dnd5e?.dependentOn;
        if (dependentOn && this.uuid) {
          MidiDependentsRegistry.untrack(dependentOn, this as unknown as foundry.abstract.Document.Any);
        }
      } catch (err) {
        const message = `MidiDependentsRegistry._onDelete`;
        TroubleShooter.recordError(err, message);
        error(message, err);
      }
    }
  }
  return MidiDependentDocument;
}
