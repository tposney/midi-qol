# WorkflowDataModel Design Document

## Status: DRAFT
This document outlines a proposed refactoring of Workflow persistence using Foundry's DataModel system.

---

## Problem Statement

The current Workflow persistence has issues:
1. **Boilerplate Heavy** - ~50+ manual getter/setters with cache logic
2. **Scattered Logic** - Each field has its own serialization code
3. **No Validation** - Data stored in flags without schema validation
4. **Coupled Updates** - Workflow updates piggyback on ChatMessage updates

### Current Pattern (Repeated ~50 times)

```typescript
#hitTargets: Set<Token.Implementation> | undefined;
get hitTargets(): Set<Token.Implementation> {
  if (this.#hitTargets) return this.#hitTargets;
  const cardTargets = this.chatCard?.getFlag(MODULE_ID, WorkflowDataFlags.hitTargets);
  if (cardTargets) {
    this.#hitTargets = new Set(cardTargets.map(uuid => fromUuidSync(uuid)?.object).filter(t => !!t));
  }
  return this.#hitTargets ?? new Set();
}
set hitTargets(hitTargets: Set<TokenOrDocument> | undefined) {
  this.#hitTargets = hitTargets?.map(t => t instanceof TokenDocument ? t.object : t).filter(t => !!t);
  if (this.itemCardUuid && saveToChatCard) {
    const targetDocuments = Array.from(hitTargets ?? []).map(t => getTokenDocument(t)).filter(t => !!t);
    const hitTargetUpdates = targetDocuments.map(t => t.uuid);
    addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.hitTargets]: hitTargetUpdates }, "midi-qol");
  }
}
```

---

## Proposed Solution

Use Foundry's `DataModel` system with:
1. Formal schema definition using `foundry.data.fields`
2. Lazy initialization to avoid overhead on world load
3. Custom fields for UUID resolution
4. Centralized persistence logic

---

## Performance Consideration: Lazy Initialization

### The Problem

If WorkflowDataModel were automatically initialized for every ChatMessage on world load, this would cause massive overhead:
- Chat logs can have thousands of messages
- Each workflow has many fields needing initialization
- UUID resolution (`fromUuidSync`) would be called for every reference

### The Solution

ChatMessage flags are **not** automatically processed through DataModel schemas - they're stored as plain objects. WorkflowDataModel is only instantiated when explicitly constructed.

### Two-Level Laziness

1. **Level 1: Deferred DataModel Construction**
   - DataModel only created when workflow is actually accessed
   - Cached via WeakMap for subsequent access

2. **Level 2: Deferred UUID Resolution**
   - Field initialization creates UUID strings (cheap)
   - Actual document resolution only on `.tokens` access (expensive)

### Implementation

```typescript
class Workflow {
  // WeakMap allows garbage collection when ChatMessage is removed
  static #dataCache = new WeakMap<ChatMessage, WorkflowDataModel>();

  #data: WorkflowDataModel | null = null;

  /**
   * Lazily initialize WorkflowDataModel from ChatMessage flags.
   * Only called when workflow data is actually accessed.
   */
  get data(): WorkflowDataModel {
    if (this.#data) return this.#data;

    // Check shared cache first (for workflows reconstructed from same message)
    const cached = Workflow.#dataCache.get(this.chatCard);
    if (cached) {
      this.#data = cached;
      return cached;
    }

    // First access - instantiate from raw flag data
    const rawData = this.chatCard?.getFlag(MODULE_ID, "workflowData");
    if (rawData) {
      this.#data = new WorkflowDataModel(rawData);
      Workflow.#dataCache.set(this.chatCard, this.#data);
    } else {
      // Create fresh for new workflows
      this.#data = new WorkflowDataModel({ id: this.id });
    }

    return this.#data;
  }
}
```

### Cost Summary

| Event | What Happens | Cost |
|-------|--------------|------|
| World loads | ChatMessages loaded with raw flag data | Zero (no DataModel init) |
| `Workflow.getWorkflow()` called | DataModel instantiated from flags | Low (schema validation only) |
| `workflow.hitTargets` accessed | UUID Set already exists | Zero |
| `workflow.hitTargets.tokens` accessed | `fromUuidSync` for each UUID | Medium (only when needed) |

---

## Useful dnd5e Field Types

### 1. `SetField` (Foundry core)

**Use for:** `hitTargets`, `saves`, `failedSaves`, etc.

```typescript
// Before: Manual array-to-Set conversion
hitTargetUuids: new fields.ArrayField(new fields.StringField())

// After: Native Set support with automatic serialization
hitTargetUuids: new fields.SetField(new fields.StringField())
```

**Benefit:** Eliminates manual `new Set(array)` / `Array.from(set)` conversions.

### 2. `MappingField` (dnd5e)

**Use for:** `saveAttribution`, `attackAttribution`

```typescript
// Typed key-value mapping with validation per entry
saveAttribution: new MappingField(
  new fields.SchemaField(AttributionSchema.defineSchema())
)
```

**Benefit:** Each key's value is validated, with default initialization per key.

### 3. `FormulaField` (dnd5e)

**Use for:** Any stored formula strings

```typescript
damageFormula: new dnd5e.dataModels.fields.FormulaField({ deterministic: false })
```

**Benefit:** Automatic `Roll.validate()` on formulas.

### 4. Custom Field with Lazy Resolution

**Use for:** UUID fields that need document resolution

```typescript
class TokenUuidSetField extends SetField {
  initialize(value, model, options = {}) {
    // Creates Set of UUID strings - cheap
    const uuidSet = super.initialize(value, model, options);

    // Expensive resolution only on .tokens access
    Object.defineProperty(uuidSet, "tokens", {
      get() {
        return new Set([...uuidSet]
          .map(uuid => fromUuidSync(uuid)?.object)
          .filter(Boolean)
        );
      },
      configurable: true,
      enumerable: false
    });

    return uuidSet;
  }
}
```

**Usage:**
```typescript
workflow.data.hitTargetUuids          // Set<string> - UUIDs (cheap)
workflow.data.hitTargetUuids.tokens   // Set<Token> - resolved (expensive, lazy)
```

---

## Schema Definition

### Supporting Schemas

```typescript
import fields = foundry.data.fields;

class DamageDescriptionSchema extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      damage: new fields.NumberField({ initial: 0 }),
      type: new fields.StringField({ initial: "" }),
      properties: new fields.SetField(new fields.StringField()),
      active: new fields.BooleanField({ initial: true }),
    };
  }
}

class TargetDataSchema extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      uuid: new fields.StringField({ required: true }),
      name: new fields.StringField(),
    };
  }
}
```

### Custom Fields

```typescript
/**
 * SetField for token UUIDs with lazy .tokens resolution
 */
class TokenUuidSetField extends fields.SetField {
  initialize(value, model, options = {}) {
    const uuidSet = super.initialize(value, model, options);

    Object.defineProperty(uuidSet, "tokens", {
      get() {
        return new Set([...uuidSet]
          .map(uuid => (fromUuidSync(uuid) as TokenDocument)?.object)
          .filter(Boolean)
        );
      },
      configurable: true,
      enumerable: false
    });

    return uuidSet;
  }
}
```

### Main WorkflowDataModel

```typescript
export class WorkflowDataModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const { StringField, NumberField, BooleanField, SchemaField,
            ObjectField, ArrayField, SetField } = foundry.data.fields;

    return {
      // ═══════════════════════════════════════════════════════════
      // IDENTITY & REFERENCES (stored as UUIDs)
      // ═══════════════════════════════════════════════════════════

      id: new StringField({ required: true }),
      actorUuid: new StringField(),
      tokenUuid: new StringField(),
      activityUuid: new StringField(),
      templateUuid: new StringField(),

      // ═══════════════════════════════════════════════════════════
      // TARGET SETS (UUID sets with lazy .tokens resolution)
      // ═══════════════════════════════════════════════════════════

      targets: new ArrayField(
        new SchemaField(TargetDataSchema.defineSchema())
      ),

      hitTargetUuids: new TokenUuidSetField(new StringField()),
      hitECTargetUuids: new TokenUuidSetField(new StringField()),
      saveUuids: new TokenUuidSetField(new StringField()),
      failedSaveUuids: new TokenUuidSetField(new StringField()),
      fumbleSaveUuids: new TokenUuidSetField(new StringField()),
      criticalSaveUuids: new TokenUuidSetField(new StringField()),
      superSaverUuids: new TokenUuidSetField(new StringField()),
      semiSuperSaverUuids: new TokenUuidSetField(new StringField()),
      advantageSaveUuids: new TokenUuidSetField(new StringField()),
      targetsCanSeeUuids: new TokenUuidSetField(new StringField()),
      targetsCanSenseUuids: new TokenUuidSetField(new StringField()),
      tokenCanSeeUuids: new TokenUuidSetField(new StringField()),
      tokenCanSenseUuids: new TokenUuidSetField(new StringField()),

      // ═══════════════════════════════════════════════════════════
      // ATTACK DATA
      // ═══════════════════════════════════════════════════════════

      attackTotal: new NumberField({ initial: 0 }),
      d20AttackRoll: new NumberField({ initial: -1 }),
      diceRoll: new NumberField({ initial: 0 }),
      attackRollCount: new NumberField({ initial: 0 }),
      isCritical: new BooleanField({ initial: false }),
      isFumble: new BooleanField({ initial: false }),
      AoO: new BooleanField({ initial: false }),

      // Attack roll (serialized via Roll.toJSON())
      attackRoll: new ObjectField({ nullable: true }),

      // ═══════════════════════════════════════════════════════════
      // DAMAGE DATA
      // ═══════════════════════════════════════════════════════════

      damageTotal: new NumberField({ initial: 0 }),
      otherDamageTotal: new NumberField({ initial: 0 }),
      bonusDamageTotal: new NumberField({ initial: 0 }),
      damageRollCount: new NumberField({ initial: 0 }),
      defaultDamageType: new StringField({ initial: "" }),

      // Damage rolls (serialized via Roll.toJSON())
      damageRolls: new ArrayField(new ObjectField()),
      bonusDamageRolls: new ArrayField(new ObjectField()),
      otherDamageRolls: new ArrayField(new ObjectField()),
      extraRolls: new ArrayField(new ObjectField()),
      utilityRolls: new ArrayField(new ObjectField()),

      // Damage details
      damageDetail: new ArrayField(
        new SchemaField(DamageDescriptionSchema.defineSchema())
      ),
      otherDamageDetail: new ArrayField(
        new SchemaField(DamageDescriptionSchema.defineSchema())
      ),
      bonusDamageDetail: new ArrayField(
        new SchemaField(DamageDescriptionSchema.defineSchema())
      ),
      rawDamageDetail: new ArrayField(
        new SchemaField(DamageDescriptionSchema.defineSchema())
      ),
      rawOtherDamageDetail: new ArrayField(
        new SchemaField(DamageDescriptionSchema.defineSchema())
      ),
      rawBonusDamageDetail: new ArrayField(
        new SchemaField(DamageDescriptionSchema.defineSchema())
      ),

      // ═══════════════════════════════════════════════════════════
      // SAVE DATA
      // ═══════════════════════════════════════════════════════════

      saveRolls: new ArrayField(new ObjectField()),
      saveDisplayData: new ArrayField(new ObjectField()),

      // ═══════════════════════════════════════════════════════════
      // WORKFLOW STATE
      // ═══════════════════════════════════════════════════════════

      aborted: new BooleanField({ initial: false }),
      suspended: new BooleanField({ initial: false }),
      itemUseComplete: new BooleanField({ initial: false }),
      needTemplate: new BooleanField({ initial: false }),
      noOptionalRules: new BooleanField({ initial: false }),

      // Current action stored as [className, actionName]
      currentAction: new ArrayField(new StringField(), {
        initial: ["none", "none"]
      }),

      workflowOptions: new ObjectField({ initial: {} }),

      // ═══════════════════════════════════════════════════════════
      // ATTRIBUTION TRACKING
      // ═══════════════════════════════════════════════════════════

      // Legacy string sets
      attackAdvAttribution: new SetField(new StringField()),
      advReminderAttackAdvAttribution: new SetField(new StringField()),

      // Structured attribution: { type: { source: displayName } }
      attackAttribution: new ObjectField({ initial: {} }),

      // Per-target save attribution
      saveAttribution: new ObjectField({ initial: {} }),

      // ═══════════════════════════════════════════════════════════
      // MACRO DATA
      // ═══════════════════════════════════════════════════════════

      onUseMacros: new ObjectField({ nullable: true }),
      ammunitionOnUseMacros: new ObjectField({ nullable: true }),

      // ═══════════════════════════════════════════════════════════
      // EFFECTS
      // ═══════════════════════════════════════════════════════════

      effectsAlreadyExpired: new SetField(new StringField()),
    };
  }
}
```

---

## Integration with Workflow Class

```typescript
export class Workflow {
  static #dataCache = new WeakMap<ChatMessage, WorkflowDataModel>();

  #data: WorkflowDataModel | null = null;

  // Runtime-only state (never persisted)
  #attackRollModifierTracker: RollModifierTracker;
  #actor: Actor.Implementation | undefined;
  #token: Token.Implementation | undefined;
  // ... other runtime references

  // ─────────────────────────────────────────────────────────────
  // Lazy Data Access
  // ─────────────────────────────────────────────────────────────

  get data(): WorkflowDataModel {
    if (this.#data) return this.#data;

    const cached = Workflow.#dataCache.get(this.chatCard);
    if (cached) {
      this.#data = cached;
      return cached;
    }

    const rawData = this.chatCard?.getFlag(MODULE_ID, "workflowData");
    if (rawData) {
      this.#data = new WorkflowDataModel(rawData);
      Workflow.#dataCache.set(this.chatCard, this.#data);
    } else {
      this.#data = new WorkflowDataModel({ id: this.id });
    }

    return this.#data;
  }

  // ─────────────────────────────────────────────────────────────
  // Simple Pass-Through Accessors
  // ─────────────────────────────────────────────────────────────

  get attackTotal() { return this.data.attackTotal; }
  set attackTotal(v) { this.data.updateSource({ attackTotal: v }); }

  get isCritical() { return this.data.isCritical; }
  set isCritical(v) { this.data.updateSource({ isCritical: v }); }

  get damageTotal() { return this.data.damageTotal; }
  set damageTotal(v) { this.data.updateSource({ damageTotal: v }); }

  // ... etc for all simple fields

  // ─────────────────────────────────────────────────────────────
  // Computed Accessors (with runtime caching)
  // ─────────────────────────────────────────────────────────────

  get actor(): Actor.Implementation {
    return this.#actor ??= fromUuidSync(this.data.actorUuid);
  }
  set actor(actor: Actor.Implementation) {
    this.#actor = actor;
    this.data.updateSource({ actorUuid: actor?.uuid });
  }

  // For token sets - use the lazy .tokens property
  get hitTargets(): Set<Token.Implementation> {
    return this.data.hitTargetUuids.tokens;
  }
  set hitTargets(targets: Set<Token.Implementation>) {
    this.data.updateSource({
      hitTargetUuids: new Set([...targets].map(t => t.document.uuid))
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────

  async persist() {
    if (!this.itemCardUuid || !saveToChatCard) return;
    await this.chatCard.setFlag(MODULE_ID, "workflowData", this.data.toObject());
  }

  // ─────────────────────────────────────────────────────────────
  // Static Factory
  // ─────────────────────────────────────────────────────────────

  static fromChatMessage(message: ChatMessage): Workflow | null {
    const rawData = message.getFlag(MODULE_ID, "workflowData");
    if (!rawData) return null;

    const workflow = new Workflow(null, null, { skipInit: true });
    // Data will be lazily loaded via the getter
    workflow.itemCardUuid = message.uuid;
    return workflow;
  }
}
```

---

## What This Eliminates

| Before | After |
|--------|-------|
| ~50 private `#fieldName` backing fields | Single `#data: WorkflowDataModel` |
| ~50 getter/setter pairs with cache logic | Simple pass-through or computed accessors |
| Manual `getFlag()` in every getter | `this.data.fieldName` |
| Manual `addUpdatesCacheFlags()` in every setter | `this.data.updateSource({...})` |
| Scattered serialization logic | Centralized in DataModel schema |
| No validation | Schema validation via Foundry fields |
| Manual Set<->Array conversion | Native `SetField` handling |

---

## Persistence Toggle (saveToChatCard Setting)

The existing `saveToChatCard` setting controls whether workflow data is persisted to ChatMessage flags. This behavior is preserved but **centralized** rather than scattered across 50+ getters/setters.

### Current Approach (Repeated in Every Setter)

```typescript
set attackTotal(attackTotal: number) {
  this.#attackTotal = attackTotal;
  if (this.itemCardUuid && saveToChatCard) {  // <-- Checked 50+ times
    addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.attackTotal]: attackTotal }, "midi-qol");
  }
}
```

### New Approach (Centralized)

```typescript
class WorkflowDataModel extends foundry.abstract.DataModel {
  #workflowId: string;
  #persistEnabled: boolean;

  constructor(data, options) {
    super(data, options);
    this.#workflowId = options.workflowId;
    this.#persistEnabled = options.persistEnabled ?? true;
  }

  // Single point of control for persistence
  updateSource(changes, options) {
    // Always update in-memory state
    super.updateSource(changes, options);

    // Only queue persistence if enabled
    if (this.#persistEnabled) {
      addUpdatesCacheFlags(this.#workflowId, {
        workflowData: this.toObject()
      }, "midi-qol");
    }
  }

  // Allow toggling at runtime
  set persistEnabled(value: boolean) {
    this.#persistEnabled = value;
  }

  get persistEnabled() {
    return this.#persistEnabled;
  }
}
```

### Workflow Integration

```typescript
class Workflow {
  get data(): WorkflowDataModel {
    if (this.#data) return this.#data;

    const rawData = this.chatCard?.getFlag(MODULE_ID, "workflowData");

    // Pass persistence setting to DataModel
    this.#data = new WorkflowDataModel(rawData ?? { id: this.id }, {
      workflowId: this.id,
      persistEnabled: saveToChatCard && !!this.itemCardUuid
    });

    return this.#data;
  }
}
```

### Behavior Matrix

| `saveToChatCard` | DataModel | Flag Updates | On Reload |
|------------------|-----------|--------------|-----------|
| **true** | In-memory + validated | Queued to updateCache | Workflow recovered from flags |
| **false** | In-memory + validated | None | Workflow lost (as expected) |

### Benefits

1. **Single point of control** - Persistence decision in one place, not 50+
2. **DataModel always used** - Schema validation even when not persisting
3. **Runtime toggle possible** - Could enable/disable mid-workflow if needed
4. **Cleaner setters** - No more conditional checks:

```typescript
// All setters become identical simple pass-throughs
set attackTotal(v) { this.data.updateSource({ attackTotal: v }); }
set isCritical(v) { this.data.updateSource({ isCritical: v }); }
set damageTotal(v) { this.data.updateSource({ damageTotal: v }); }
```

---

## Integration with Existing updateCache Infrastructure

The existing `updateCache` mechanism is **preserved** - WorkflowDataModel integrates with it rather than replacing it.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      updateCache                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │  WorkflowDataModel  │    │  Other ChatMessage Updates      │ │
│  │  ─────────────────  │    │  ─────────────────────────────  │ │
│  │  updateSource()     │    │  content, rolls, speaker, etc.  │ │
│  │         │           │    │              │                  │ │
│  │         ▼           │    │              │                  │ │
│  │  addUpdatesCacheFlags()  │              │                  │ │
│  │  { workflowData: {...} } │              │                  │ │
│  └──────────┬──────────┘    └──────────────┼──────────────────┘ │
│             │                              │                    │
│             └──────────────┬───────────────┘                    │
│                            ▼                                    │
│                   throttledUpdate()                             │
│                            │                                    │
│                            ▼                                    │
│                  ChatMessage.update()                           │
└─────────────────────────────────────────────────────────────────┘
```

### Why Not Separate Persistence?

Separate update paths to the same ChatMessage could cause:
- Race conditions
- Updates overwriting each other
- Inconsistent state

### How It Works

```typescript
// Workflow setter
set attackTotal(value: number) {
  this.data.updateSource({ attackTotal: value });
}

// Behind the scenes:
// 1. DataModel.updateSource() updates in-memory state
// 2. If persistEnabled, queues { "flags.midi-qol.workflowData": {...} } to updateCache
// 3. Existing throttledUpdate() batches with other updates (content, rolls, etc.)
// 4. Single ChatMessage.update() call with everything
```

### Simplified Flag Structure

```typescript
// Before: ~50 individual flags
"flags": {
  "midi-qol": {
    "attackTotal": 18,
    "isCritical": true,
    "hitTargetUuids": ["Scene.x.Token.y"],
    "damageDetail": [...],
    // ... 46 more individual flags
  }
}

// After: Single nested object
"flags": {
  "midi-qol": {
    "workflowData": {
      "attackTotal": 18,
      "isCritical": true,
      "hitTargetUuids": ["Scene.x.Token.y"],
      "damageDetail": [...],
      // ... all fields in one object
    }
  }
}
```

### Post-Persist Cleanup

```typescript
async function performThrottledUpdate(workflowId: string, state: UpdateCache) {
  const chatMessage = getCachedDocument(state.itemCardUuid);
  if (!chatMessage) return;

  // Existing merge logic...
  const updates = { ...state.updates };
  if (state.flags) {
    updates.flags = foundry.utils.mergeObject(
      chatMessage.flags ?? {},
      state.flags,
      { inplace: false }
    );
  }

  await chatMessage.update(updates);

  // Mark DataModel clean after successful persist
  const workflow = Workflow.getWorkflow(workflowId);
  workflow?.data?.markClean?.();
}
```

---

## Estimated Storage Size

### Size by Category

| Category | Fields | Typical Size | Notes |
|----------|--------|--------------|-------|
| **UUIDs** | actor, token, activity, template | ~300 bytes | ~70 chars each |
| **Target Sets** | 13 UUID sets | 1-5 KB | 5 targets × 70 chars × sets used |
| **Attack Data** | totals, flags, attackRoll | 0.5-2 KB | Roll JSON is largest |
| **Damage Rolls** | 5 roll arrays | 2-8 KB | Multiple rolls × ~500-1000 chars |
| **Damage Details** | 6 detail arrays | 1-3 KB | ~100 chars per damage type |
| **Save Data** | saveRolls, saveDisplayData | 1-4 KB | Per-target save info |
| **Attribution** | attack + save attribution | 0.5-2 KB | Depends on sources |
| **State/Options** | booleans, workflowOptions | ~200 bytes | Small |

### Total Estimates

| Scenario | Description | Estimated Size |
|----------|-------------|----------------|
| **Minimal** | Single target, attack + damage, no saves | **2-4 KB** |
| **Typical** | 3-5 targets, attack + damage + saves | **8-15 KB** |
| **Complex** | Many targets, bonus damage, rerolls | **20-30 KB** |
| **Extreme** | 20+ targets, all damage types, full attribution | **50-80 KB** |

### Comparison to Current

The data size is **essentially the same** - the new approach just organizes it differently:
- Current: ~50 individual flags
- Proposed: Single `workflowData` object containing same data
- Net overhead: ~20-50 bytes for the wrapper

### Foundry Limits

- No hard limit on flag size
- Typical workflows (8-15 KB) are well within safe bounds
- Socket message limit (~100KB for socketlib) is not a concern for normal use

---

## Impact on Undo System: None

The undo system (`undo.ts`, `UndoWorkflow.ts`) is **completely independent** of the WorkflowDataModel change.

### Why Undo is Unaffected

1. **Separate Data Structure** - Undo uses its own `UndoData` type, not workflow flags
2. **Not Persisted** - Stored in an in-memory queue, explicitly NOT saved to flags
3. **Stores Snapshots** - Contains full `actor.toObject(true)` data, not workflow state
4. **Reads via Getters** - Uses workflow getters which we're preserving

### What Undo Stores (UndoData)

```typescript
interface UndoData {
  id: string;
  userId: string;
  userName: string;
  itemName: string;
  itemUuid: string;
  actorUuid: string;
  actorName: string;
  actorEntry: {                      // Full actor snapshot
    actorUuid: string;
    tokenUuid: string;
    actorData: Actor.Source;         // Complete actor.toObject(true)
    tokenData: TokenDocument.Source; // Complete token.toObject(true)
  };
  allTargets: Collection<{           // Full target snapshots
    actorUuid: string;
    tokenUuid: string;
    actorData: Actor.Source;
    tokenData: TokenDocument.Source;
  }>;
  chatCardUuids: string[];
  templateUuids: string[];
  sequencerUuid: string;
  // ...
}
```

### How Undo Reads from Workflow

```typescript
// saveUndoData() - called at workflow start
export async function saveUndoData(workflow: Workflow) {
  workflow.undoData = {
    id: workflow.id,
    itemName: workflow.item.name,              // ← getter (preserved)
    itemUuid: workflow.item.uuid,              // ← getter (preserved)
    actorUuid: workflow.actor.uuid,            // ← getter (preserved)
    actorName: workflow.actor.name,            // ← getter (preserved)
    tokendocUuid: workflow.token?.document.uuid,  // ← getter (preserved)
    isReaction: workflow.workflowOptions?.isReaction,
    // ...
  };
}

// saveTargetsUndoData() - called after preamble
export async function saveTargetsUndoData(workflow: Workflow) {
  workflow.targets.forEach(t => { /* snapshot */ });  // ← getter (preserved)
  workflow.undoData.itemCardUuid = workflow.itemCardUuid;
  workflow.undoData.templateUuids.push(workflow.templateUuid);
}
```

### Workflow.undoData Remains Runtime-Only

```typescript
class Workflow {
  // Runtime-only property - NOT part of WorkflowDataModel
  // Comment in current code: "Way too big to store. Undos are blanked on reload"
  undoData: UndoData | undefined;

  // These getters work identically regardless of backing storage
  get actor() { return this.#actor ??= fromUuidSync(this.data.actorUuid); }
  get token() { return this.#token ??= getToken(this.data.tokenUuid); }
  get targets() { return this.data.targets; }
  get item() { /* resolved from activity/item UUID */ }
}
```

### Impact Summary

| Aspect | Current | With WorkflowDataModel | Impact |
|--------|---------|------------------------|--------|
| `workflow.actor` | Getter → private field | Getter → DataModel | **None** |
| `workflow.targets` | Getter → private field | Getter → DataModel | **None** |
| `workflow.undoData` | Runtime property | Runtime property | **None** |
| UndoData storage | In-memory queue (max 15) | In-memory queue (max 15) | **None** |
| Actor snapshots | `actor.toObject(true)` | `actor.toObject(true)` | **None** |
| Persistence | Not persisted | Not persisted | **None** |

**No changes needed to undo system.** The refactoring only affects how workflow state is stored in ChatMessage flags - the undo system uses its own separate in-memory storage for actor/token snapshots.

---

## Impact Analysis: Other Areas

### Areas With NO Impact

#### 1. External API (MidiQOL global) ✅

```typescript
// External modules call these - all preserved
MidiQOL.Workflow.getWorkflow(id)     // Returns Workflow instance
workflow.attackTotal                  // Getter - works same way
workflow.hitTargets                   // Getter - works same way
```

**Why safe:** External modules access workflow properties via getters, which are preserved.

#### 2. Socket/GM Actions ✅

```typescript
// GMAction.ts - only passes workflowId, not workflow data
socketlibSocket.executeAsGM("function", { workflowId: workflow.id });

// GM side:
const workflow = Workflow.getWorkflow(data.workflowId);
```

**Why safe:** Workflows are never serialized over sockets - only IDs are passed.

#### 3. Hooks ✅

```typescript
Hooks.callAll("midi-qol.AttackRollComplete", workflow);

// External modules:
Hooks.on("midi-qol.AttackRollComplete", (workflow) => {
  workflow.attackTotal;  // Uses getter - unchanged
});
```

**Why safe:** Hooks pass the Workflow object; consumers use getters.

#### 4. Workflow Subclasses ✅

All subclasses inherit from `Workflow` and automatically benefit:
- `DamageOnlyWorkflow`
- `TrapWorkflow`
- `DDBGameLogWorkflow`
- `DummyWorkflow`
- `SavesFirstWorkflow`
- `ActiveDefenceWorkflow`
- `UserWorkflow`

#### 5. Activity Classes ✅

All activity classes access workflow via getters:
- `AttackActivity.ts`
- `DamageActivity.ts`
- `SaveActivity.ts`
- `HealActivity.ts`
- `MidiActivityMixin.ts`
- etc.

#### 6. Reverse Damage Cards ✅

These flags are separate from workflow state:
```typescript
// Damage card specific - NOT workflow data
flags["midi-qol"].undoDamage = [...]
flags["midi-qol"].actorUuid = "..."
flags["midi-qol"].playerDamageCard = true
```

### Areas Requiring Updates

#### 1. ChatMessageMidi.ts ⚠️

```typescript
// Current: Reads WorkflowDataFlags directly
import { WorkflowDataFlags } from "../Workflow.js";
foundry.utils.setProperty(rolls[0], "flags.midi-qol.breakdown", breakdown);
```

**Change needed:** Update to read from `workflowData` object.

#### 2. DamageApplicationElementMidi.ts ⚠️

```typescript
// Current:
const targets = foundry.utils.getProperty(
  this.chatMessage,
  WorkflowDataFlags.targetDescriptors
);
```

**Change needed:** Read from `workflowData.targetDescriptors`.

#### 3. Any Direct Flag Readers ⚠️

```typescript
// Will need to change from:
message.getFlag(MODULE_ID, WorkflowDataFlags.attackTotal)

// To:
message.getFlag(MODULE_ID, "workflowData")?.attackTotal
```

### Areas Needing Consideration

#### 1. Backward Compatibility for External Flag Readers 🤔

External modules might directly read ChatMessage flags:
```typescript
// Some external module doing:
const attackTotal = message.flags?.["midi-qol"]?.attackTotal;
```

**Options:**
- **Migration period:** Write to both old flags AND new `workflowData`
- **Documentation:** Note the breaking change in changelog
- **Proxy pattern:** Define getters on flags object that redirect to workflowData

#### 2. Flag Structure Change 🤔

```typescript
// Old: ~50 individual flags
flags["midi-qol"].attackTotal = 18
flags["midi-qol"].isCritical = true
// ...48 more

// New: Single nested object
flags["midi-qol"].workflowData = {
  attackTotal: 18,
  isCritical: true,
  // ...all fields
}
```

**Consideration:** Any code using `hasFlag()` for individual workflow fields would break.

### Impact Summary Table

| Area | Files | Impact | Action Required |
|------|-------|--------|-----------------|
| External API | midi-qol.ts | None | Getters preserved |
| Socket/GM Actions | GMAction.ts | None | Only passes IDs |
| Hooks | Hooks.ts | None | Passes objects |
| Workflow Subclasses | Workflow.ts | None | Inherit automatically |
| Undo System | undo.ts | None | Separate data structure |
| Activities | *Activity.ts | None | Uses getters |
| **ChatMessageMidi** | ChatMessageMidi.ts | **Update** | Read from workflowData |
| **DamageElement** | DamageApplicationElementMidi.ts | **Update** | Read from workflowData |
| **External modules** | N/A | **Consider** | Migration/compat layer |

---

## Migration Path

1. **Phase 1: Create Infrastructure**
   - Create `WorkflowDataModel` class
   - Create custom field types (`TokenUuidSetField`)
   - Add `#data` property alongside existing fields

2. **Phase 2: Gradual Migration**
   - Migrate simple fields first (numbers, booleans)
   - Migrate complex fields (Sets, damage details)
   - Add compatibility layer for old flag format
   - Update `ChatMessageMidi.ts` and `DamageApplicationElementMidi.ts`

3. **Phase 3: Persistence Update**
   - Update `persist()` to use `this.data.toObject()`
   - Add migration for existing ChatMessage flags
   - Consider dual-write period for backward compatibility

4. **Phase 4: Cleanup**
   - Remove old backing fields
   - Remove old getter/setter boilerplate
   - Remove `WorkflowDataFlags` enum (or deprecate)
   - Document breaking changes for external modules

---

## Files to Create/Modify

### New Files
- `src/module/data/WorkflowDataModel.ts` - Main DataModel class
- `src/module/data/fields/TokenUuidSetField.ts` - Custom field for token UUID sets
- `src/module/data/schemas/DamageDescriptionSchema.ts` - Nested schema

### Modified Files
- `src/module/Workflow.ts` - Add `#data` property, migrate getters/setters
- `src/module/utils.ts` - Update `addUpdatesCacheFlags` if needed

---

## Open Questions

1. **Backward Compatibility** - How to handle existing ChatMessages with old flag format?
2. **Throttled Updates** - Should `updateSource()` be throttled like current `addUpdatesCacheFlags()`?
3. **Dirty Tracking** - Does DataModel track which fields changed for minimal updates?
4. **Roll Serialization** - Use `ObjectField` or create custom `RollField` with proper typing?
