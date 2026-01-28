# Workflow Persistence Evaluation

## Status: PARKED
This document records the evaluation of making Workflow a persistable document. No changes have been made.

---

## Problem Statement

The current Workflow persistence approach has issues:
1. **Clutters ChatMessage** - Workflow data stored in ChatMessage flags makes the flags messy
2. **Messy getter/setter code** - Manual persistence code scattered throughout Workflow class
3. **Coupled updates** - Workflow updates piggyback on ChatMessage updates, complicating the code

## Original Goal

Make Workflow a Foundry Document that could:
- Optionally NOT persist to database (in-memory only mode)
- Store UUIDs for large objects (Actors, Items, Tokens) instead of full objects
- Have throttled database transactions
- Use a formal schema for persistable elements

---

## Research Findings

### Can Modules Create Custom Document Types?

**Answer: NO**

Research of Foundry v13 documentation confirms:
- Modules **cannot** create entirely new Document types with their own database collections
- Modules can only add **subtypes** to existing Document types (Actor, Item, JournalEntry, etc.)
- This is a fundamental Foundry limitation, not something that can be worked around

### What Modules CAN Do

1. **Add subtypes** to existing Documents (e.g., custom Actor types, custom JournalEntryPage types)
2. **Override document classes** via `CONFIG.Actor.documentClass = CustomActorClass`
3. **Use DataModel** for schema validation of data stored in flags

### Limitations of Subtypes

- Data loss risk: When module is deactivated, documents using its subtypes become invalid
- No guarantee of system compatibility
- Subtype names auto-prefixed with module ID

---

## Alternative Approaches Considered

### 1. Continue with ChatMessage Flags (Current Approach)
- **Pros**: Works, no Foundry limitations
- **Cons**: Clutters ChatMessage, messy code
- **Enhancement**: Could add `WorkflowDataModel` for schema validation and cleaner persistence layer

### 2. JournalEntry Subtype
- Store workflow data in a custom JournalEntryPage subtype
- Link to it from ChatMessage flags (just store the UUID)
- **Cons**: Workflows would appear in journal sidebar, weird fit

### 3. Setting Document
- Not appropriate for transient workflow data

### 4. Embedded Document in ChatMessage
- ChatMessage doesn't support custom embedded documents

---

## Current Workflow Persistence (For Reference)

### Already Persisted via ChatMessage Flags
~40 cached getters/setters in Workflow.ts already persist to ChatMessage flags:
- `attackRolls`, `damageRolls`, `bonusDamageRolls`, `otherDamageRolls`
- `hitTargets`, `failedSaves`, `savedTargets` (as UUID arrays)
- `damageDetail`, `bonusDamageDetail`, `otherDamageDetail`
- `attackTotal`, `damageTotal`, `isCritical`, `isFumble`
- And many more...

### Existing Infrastructure
- `throttledUpdate()` function for batching updates
- `addUpdatesCacheFlags()` for combining flag updates
- `debounceInterval` setting (default 50ms)
- `WorkflowDataFlags` enum for flag keys

### Data Categories Identified

**A. Never Persist (Runtime Only)**
- `socketHooks`, `pendingApproval`, `hookCallCount`
- Event handlers, callbacks, temporary UI state

**B. Store as UUIDs**
- `actor` → `actorUuid`
- `item` → `itemUuid`
- `token` → `tokenUuid`
- `targets`, `hitTargets`, `failedSaves` → UUID arrays

**C. Store as JSON**
- Roll objects via `Roll.toJSON()` / `Roll.fromData()`
- `saveRolls` Map as entries array

**D. Store Directly**
- Primitives: `id`, `uuid`, `workflowType`, `attackTotal`, etc.
- Simple objects: `rollOptions`, `damageDetail`, etc.

---

## Recommended Path (If Resumed)

Given Foundry's limitations, the cleanest approach would be:

1. **Keep ChatMessage flags** as storage (no alternative exists)
2. **Create `WorkflowDataModel`** extending `foundry.abstract.DataModel` for schema validation
3. **Create `WorkflowPersistenceManager`** class to centralize all persistence logic
4. **Add persistence modes**: `none` (in-memory), `lazy` (on completion), `eager` (throttled)
5. **Separate workflow flag updates** from ChatMessage content updates where possible

This wouldn't eliminate ChatMessage flags entirely but would:
- Provide formal schema validation
- Centralize the messy getter/setter code
- Make the persistence behavior configurable
- Improve code organization

---

## Files Explored

- `/src/module/Workflow.ts` - Main workflow class with 100+ properties
- `/src/module/lib/MidiDependentsRegistry.ts` - Existing dependent document pattern
- `/src/module/activities/MidiActivityMixin.ts` - Schema patterns using foundry.data.fields
- `/src/module/utils.ts` - `throttledUpdate()` and `addUpdatesCacheFlags()`

## Sources

- [Foundry Module Sub-Types](https://foundryvtt.com/article/module-sub-types/)
- [Foundry Document API v13](https://foundryvtt.com/api/classes/foundry.abstract.Document.html)
- [Foundry Community Wiki - Document](https://foundryvtt.wiki/en/development/api/document)
