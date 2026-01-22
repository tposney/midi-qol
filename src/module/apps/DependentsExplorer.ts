import { i18n } from "../../midi-qol.js";
import { MidiDependentsRegistry, RegistryChangeEvent } from "../MidiDependentsRegistry.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

interface DependentInfo {
  uuid: string;
  name: string;
  type: string;
  displayType: string;
  icon: string;
  exists: boolean;
  isTransfer?: boolean;
  // Owner info for Items and ActiveEffects
  ownerUuid?: string;
  ownerName?: string;
  ownerIcon?: string;
  ownerExists?: boolean;
  // Grandparent info when owner is an Item
  grandparentUuid?: string;
  grandparentName?: string;
  grandparentIcon?: string;
  grandparentExists?: boolean;
}

interface DependentEntry {
  parentUuid: string;
  parentName: string;
  parentType: string;
  parentIcon: string;
  parentExists: boolean;
  isTransfer?: boolean;
  // Owner info for Items and ActiveEffects (the Actor/Item they belong to)
  ownerUuid?: string;
  ownerName?: string;
  ownerIcon?: string;
  ownerExists?: boolean;
  // Grandparent info when owner is an Item (the Actor the Item belongs to)
  grandparentUuid?: string;
  grandparentName?: string;
  grandparentIcon?: string;
  grandparentExists?: boolean;
  dependents: DependentInfo[];
}

interface TypeSection {
  type: string;
  label: string;
  icon: string;
  collapsed: boolean;
  entries: DependentEntry[];
  count: number;
}

/** Throttle delay for rendering after registry changes */
const RENDER_THROTTLE_MS = 100;

export class DependentsExplorer extends HandlebarsApplicationMixin(ApplicationV2) {
  #searchFilter: string = "";
  #collapsedSections: Set<string> = new Set();
  #hookId: number | null = null;
  // Cache of processed entries by parent UUID for incremental updates
  #entriesCache: Map<string, DependentEntry> = new Map();
  #cacheValid: boolean = false;
  // Throttled render to batch rapid UI updates
  #throttledRender = foundry.utils.throttle(() => this.render({ force: true }), RENDER_THROTTLE_MS);

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-dependents-explorer",
    window: {
      title: "midi-qol.DependentsExplorer.Title",
      resizable: true,
      contentClasses: ["standard-form", "dependents-explorer"]
    },
    position: {
      width: 600,
      height: 500
    },
    actions: {
      deleteParent: this.#onDeleteParent,
      deleteDependent: this.#onDeleteDependent,
      openDocument: this.#onOpenDocument,
      toggleSection: this.#onToggleSection,
      clearFilter: this.#onClearFilter
    }
  };

  static override PARTS = {
    main: {
      template: "modules/midi-qol/templates/dependentsExplorer.hbs",
      // Preserve scroll position during re-render
      scrollable: [".sections-list"]
    }
  };

  get title() {
    return i18n("midi-qol.DependentsExplorer.Title");
  }

  async _prepareContext(options: any) {
    const context: any = await super._prepareContext(options);

    // Rebuild cache if invalid
    if (!this.#cacheValid) {
      this.#rebuildCache();
    }

    const entriesByType = new Map<string, DependentEntry[]>();
    const filter = this.#searchFilter.toLowerCase();

    for (const entry of this.#entriesCache.values()) {
      // Filter by name
      if (filter && !entry.parentName.toLowerCase().includes(filter)) {
        // Check if any dependent matches the filter
        const hasMatchingDependent = entry.dependents.some(dep =>
          dep.name.toLowerCase().includes(filter)
        );
        if (!hasMatchingDependent) continue;
      }

      if (!entriesByType.has(entry.parentType)) {
        entriesByType.set(entry.parentType, []);
      }
      entriesByType.get(entry.parentType)!.push(entry);
    }

    // Build sections from all types
    const sections: TypeSection[] = [];

    for (const [type, entries] of entriesByType) {
      if (entries.length === 0) continue;

      // Sort entries by name
      entries.sort((a, b) => a.parentName.localeCompare(b.parentName));

      sections.push({
        type,
        label: this.#getTypeLabel(type),
        icon: this.#getTypeIcon(type),
        collapsed: this.#collapsedSections.has(type),
        entries,
        count: entries.length
      });
    }

    // Sort sections alphabetically by label
    sections.sort((a, b) => a.label.localeCompare(b.label));

    context.sections = sections;
    context.isEmpty = sections.length === 0;
    context.emptyMessage = filter
      ? i18n("midi-qol.DependentsExplorer.NoMatches")
      : i18n("midi-qol.DependentsExplorer.Empty");
    context.searchFilter = this.#searchFilter;
    context.totalCount = this.#entriesCache.size;

    return context;
  }

  #getDocumentIcon(doc: any): string {
    if (!doc) return "fas fa-question";
    return this.#getTypeIcon(doc.documentName);
  }

  #getDisplayType(type: string): string {
    return type === "ActiveEffect" ? "Effect" : type;
  }

  #getTypeIcon(type: string): string {
    switch (type) {
      case "Actor": return "fas fa-user";
      case "Item": return "fas fa-suitcase";
      case "ActiveEffect": return "fas fa-bolt";
      case "Token": return "fas fa-user-circle";
      case "Scene": return "fas fa-map";
      case "Combatant": return "fas fa-fist-raised";
      default: return "fas fa-file";
    }
  }

  #getTypeLabel(type: string): string {
    switch (type) {
      case "Actor": return i18n("midi-qol.DependentsExplorer.TypeActor");
      case "Item": return i18n("midi-qol.DependentsExplorer.TypeItem");
      case "ActiveEffect": return i18n("midi-qol.DependentsExplorer.TypeActiveEffect");
      case "Token": return i18n("midi-qol.DependentsExplorer.TypeToken");
      case "Scene": return i18n("midi-qol.DependentsExplorer.TypeScene");
      case "Combatant": return i18n("midi-qol.DependentsExplorer.TypeCombatant");
      default: return type;
    }
  }

  async _onFirstRender(context: any, options: any): Promise<void> {
    await super._onFirstRender(context, options);

    // Register hook to listen for registry changes
    this.#hookId = Hooks.on("midi-qol.dependentsRegistryChanged", (event: RegistryChangeEvent) => {
      this.#handleRegistryChange(event);
    });
  }

  #handleRegistryChange(event: RegistryChangeEvent) {
    switch (event.type) {
      case "track":
        if (event.parentUuid && event.dependentUuid) {
          this.#addToCache(event.parentUuid, event.dependentUuid);
        }
        break;
      case "untrack":
        if (event.parentUuid && event.dependentUuid) {
          this.#removeFromCache(event.parentUuid, event.dependentUuid);
        }
        break;
      case "clear":
      case "deleteDependents":
        // These require full cache rebuild
        this.#cacheValid = false;
        break;
    }
    this.#throttledRender();
  }

  #addToCache(parentUuid: string, dependentUuid: string) {
    if (!this.#cacheValid) return; // Cache will be rebuilt on next render

    const existingEntry = this.#entriesCache.get(parentUuid);
    if (existingEntry) {
      // Check if dependent already exists
      if (!existingEntry.dependents.some(d => d.uuid === dependentUuid)) {
        const depInfo = this.#buildDependentInfo(dependentUuid);
        if (depInfo) {
          existingEntry.dependents.push(depInfo);
        }
      }
    } else {
      // New parent - build the full entry
      const entry = this.#buildParentEntry(parentUuid, [dependentUuid]);
      if (entry) {
        this.#entriesCache.set(parentUuid, entry);
      }
    }
  }

  #removeFromCache(parentUuid: string, dependentUuid: string) {
    if (!this.#cacheValid) return; // Cache will be rebuilt on next render

    const existingEntry = this.#entriesCache.get(parentUuid);
    if (existingEntry) {
      existingEntry.dependents = existingEntry.dependents.filter(d => d.uuid !== dependentUuid);
      // Remove parent entry if no dependents left
      if (existingEntry.dependents.length === 0) {
        this.#entriesCache.delete(parentUuid);
      }
    }
  }

  #buildDependentInfo(uuid: string): DependentInfo | null {
    const doc = fromUuidSync(uuid, { strict: false }) as any;
    const docType = doc?.documentName ?? "Unknown";

    // Get owner info for Items and ActiveEffects
    let depOwnerUuid: string | undefined;
    let depOwnerName: string | undefined;
    let depOwnerIcon: string | undefined;
    let depOwnerExists: boolean | undefined;
    let depGrandparentUuid: string | undefined;
    let depGrandparentName: string | undefined;
    let depGrandparentIcon: string | undefined;
    let depGrandparentExists: boolean | undefined;

    if (doc && (docType === "Item" || docType === "ActiveEffect")) {
      const owner = doc.parent;
      if (owner) {
        depOwnerUuid = owner.uuid;
        depOwnerName = owner.name;
        depOwnerIcon = this.#getDocumentIcon(owner);
        depOwnerExists = true;

        // If owner is an Item, get its parent (the Actor)
        if (owner.documentName === "Item" && owner.parent) {
          const grandparent = owner.parent;
          depGrandparentUuid = grandparent.uuid;
          depGrandparentName = grandparent.name;
          depGrandparentIcon = this.#getDocumentIcon(grandparent);
          depGrandparentExists = true;
        }
      }
    }

    return {
      uuid,
      name: doc?.name ?? i18n("midi-qol.DependentsExplorer.Unknown"),
      type: docType,
      displayType: this.#getDisplayType(docType),
      icon: this.#getDocumentIcon(doc),
      exists: !!doc,
      isTransfer: docType === "ActiveEffect" && doc?.transfer === true,
      ownerUuid: depOwnerUuid,
      ownerName: depOwnerName,
      ownerIcon: depOwnerIcon,
      ownerExists: depOwnerExists,
      grandparentUuid: depGrandparentUuid,
      grandparentName: depGrandparentName,
      grandparentIcon: depGrandparentIcon,
      grandparentExists: depGrandparentExists
    };
  }

  #rebuildCache() {
    this.#entriesCache.clear();
    const rawEntries = MidiDependentsRegistry.getAll();
    for (const { parentUuid, dependentUuids } of rawEntries) {
      const entry = this.#buildParentEntry(parentUuid, dependentUuids);
      if (entry) {
        this.#entriesCache.set(parentUuid, entry);
      }
    }
    this.#cacheValid = true;
  }

  #buildParentEntry(parentUuid: string, dependentUuids: string[]): DependentEntry | null {
    const parentDoc = fromUuidSync(parentUuid, { strict: false }) as any;
    const parentExists = !!parentDoc;
    const parentName = parentDoc?.name ?? i18n("midi-qol.DependentsExplorer.Unknown");
    const parentType = parentDoc?.documentName ?? "Unknown";

    const dependents: DependentInfo[] = dependentUuids
      .map(uuid => this.#buildDependentInfo(uuid))
      .filter((d): d is DependentInfo => d !== null);

    // Get owner info for Items and ActiveEffects
    let ownerUuid: string | undefined;
    let ownerName: string | undefined;
    let ownerIcon: string | undefined;
    let ownerExists: boolean | undefined;
    let grandparentUuid: string | undefined;
    let grandparentName: string | undefined;
    let grandparentIcon: string | undefined;
    let grandparentExists: boolean | undefined;

    if (parentDoc && (parentType === "Item" || parentType === "ActiveEffect")) {
      const owner = parentDoc.parent;
      if (owner) {
        ownerUuid = owner.uuid;
        ownerName = owner.name;
        ownerIcon = this.#getDocumentIcon(owner);
        ownerExists = true;

        // If owner is an Item, get its parent (the Actor)
        if (owner.documentName === "Item" && owner.parent) {
          const grandparent = owner.parent;
          grandparentUuid = grandparent.uuid;
          grandparentName = grandparent.name;
          grandparentIcon = this.#getDocumentIcon(grandparent);
          grandparentExists = true;
        }
      }
    }

    return {
      parentUuid,
      parentName,
      parentType,
      parentIcon: this.#getDocumentIcon(parentDoc),
      parentExists,
      isTransfer: parentType === "ActiveEffect" && parentDoc?.transfer === true,
      ownerUuid,
      ownerName,
      ownerIcon,
      ownerExists,
      grandparentUuid,
      grandparentName,
      grandparentIcon,
      grandparentExists,
      dependents
    };
  }

  async _onRender(context: any, options: any): Promise<void> {
    await super._onRender(context, options);

    // Set up search input handler
    const searchInput = this.element.querySelector('input[name="search-filter"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener("input", this.#onSearchInput.bind(this));
      searchInput.focus();
    }
  }

  async _onClose(options: any): Promise<void> {
    await super._onClose(options);

    // Unregister the hook when the app is closed
    if (this.#hookId !== null) {
      Hooks.off("midi-qol.dependentsRegistryChanged", this.#hookId);
      this.#hookId = null;
    }
  }

  #onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.#searchFilter = input.value;
    this.render({ force: true });
  }

  static #onClearFilter(this: DependentsExplorer, event: Event, target: HTMLElement) {
    this.#searchFilter = "";
    this.render({ force: true });
  }

  static #onToggleSection(this: DependentsExplorer, event: Event, target: HTMLElement) {
    const type = target.dataset.type;
    if (!type) return;

    if (this.#collapsedSections.has(type)) {
      this.#collapsedSections.delete(type);
    } else {
      this.#collapsedSections.add(type);
    }
    this.render({ force: true });
  }

  static async #onDeleteParent(this: DependentsExplorer, event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const doc = fromUuidSync(uuid, { strict: false }) as any;
    if (!doc) {
      ui.notifications?.warn(i18n("midi-qol.DependentsExplorer.DocumentNotFound"));
      return;
    }

    const docType = doc.documentName;
    const needsConfirm = docType === "Actor" || docType === "Item";

    if (needsConfirm) {
      const confirmed = await DialogV2.confirm({
        window: { title: i18n("midi-qol.DependentsExplorer.ConfirmDelete") },
        content: i18n("midi-qol.DependentsExplorer.ConfirmDeleteParent").replace("{name}", doc.name).replace("{type}", docType),
        yes: { label: i18n("midi-qol.DependentsExplorer.Delete") },
        no: { label: i18n("midi-qol.DependentsExplorer.Cancel") }
      });
      if (!confirmed) return;
    }

    try {
      await doc.delete();
      ui.notifications?.info(i18n("midi-qol.DependentsExplorer.Deleted").replace("{name}", doc.name));
      this.render({ force: true });
    } catch (err) {
      console.error("DependentsExplorer | Failed to delete document:", err);
      ui.notifications?.error(i18n("midi-qol.DependentsExplorer.DeleteFailed"));
    }
  }

  static async #onDeleteDependent(this: DependentsExplorer, event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const doc = fromUuidSync(uuid, { strict: false }) as any;
    if (!doc) {
      ui.notifications?.warn(i18n("midi-qol.DependentsExplorer.DocumentNotFound"));
      return;
    }

    const docType = doc.documentName;
    const needsConfirm = docType === "Actor" || docType === "Item";

    if (needsConfirm) {
      const confirmed = await DialogV2.confirm({
        window: { title: i18n("midi-qol.DependentsExplorer.ConfirmDelete") },
        content: i18n("midi-qol.DependentsExplorer.ConfirmDeleteDependent").replace("{name}", doc.name).replace("{type}", docType),
        yes: { label: i18n("midi-qol.DependentsExplorer.Delete") },
        no: { label: i18n("midi-qol.DependentsExplorer.Cancel") }
      });
      if (!confirmed) return;
    }

    try {
      await doc.delete();
      ui.notifications?.info(i18n("midi-qol.DependentsExplorer.Deleted").replace("{name}", doc.name));
      this.render({ force: true });
    } catch (err) {
      console.error("DependentsExplorer | Failed to delete document:", err);
      ui.notifications?.error(i18n("midi-qol.DependentsExplorer.DeleteFailed"));
    }
  }

  static async #onOpenDocument(this: DependentsExplorer, event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const doc = fromUuidSync(uuid, { strict: false }) as any;
    if (!doc) {
      ui.notifications?.warn(i18n("midi-qol.DependentsExplorer.DocumentNotFound"));
      return;
    }

    if (typeof doc.sheet?.render === "function") {
      doc.sheet.render(true);
    }
  }
}
