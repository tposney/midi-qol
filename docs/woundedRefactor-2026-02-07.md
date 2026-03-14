# Wounded/Dead Status Race Condition Analysis

**Date**: 2026-02-07

## Problem Summary

The `checkWounded` function in `patching.ts` and related status effect processing suffers from race conditions that can cause:
- Effects being deleted that don't exist on the actor
- Duplicate status effects being added
- Inconsistent wounded/dead state

## Current Code Locations

- **midi-qol checkWounded**: `src/module/patching.ts:2054-2147`
- **midi-qol setDeadStatus**: `src/module/patching.ts:2149-2202`
- **Hook handlers**: `src/module/Hooks.ts:79-123`
- **DAE applyStatusEffects**: `dae-10x/src/module/dae.ts:2390-2454`
- **DAE _preCreateActiveEffect**: `dae-10x/src/module/dae.ts:2178-2194`

## Race Condition Analysis

### Issue 1: Hook handlers are not awaited

```typescript
// Hooks.ts:79-100
Hooks.on("updateActor", async (actor, update, options, user) => {
  // This async function runs without being awaited by Foundry
  await checkWounded(actor, update, options, user);
});
```

When HP changes rapidly (e.g., multi-attack damage), multiple `updateActor` hooks fire and multiple `checkWounded` calls run **concurrently**.

### Issue 2: Read-then-write pattern with async gaps

```typescript
// patching.ts:2098-2101
const wounded = await ConvenientEffectsHasEffect(woundedStatus.name, actor, false);
if (wounded !== needsWounded) {
  if (needsWounded) CEAddEffectWith({...});  // NOT awaited!
  else await actor.effects.find(ef => ef.name === woundedStatus.name)?.delete();
}
```

Between checking `wounded` state and acting on it, another concurrent call can change the state.

### Issue 3: Multiple sequential awaits in setDeadStatus

```typescript
// patching.ts:2156-2166
for (const statusId of conflictingStatuses) {
  if (actor.statuses.has(statusId)) {
    await actor.toggleStatusEffect(statusId, { active: false });  // Called 3x sequentially
  }
}
```

Each `toggleStatusEffect` is a separate database operation. Between calls, another concurrent operation can add back a status just removed.

### Issue 4: Multi-client race conditions

A semaphore only works within a single JavaScript execution context. In Foundry:

- Each connected client (GM + players) has its own semaphore instance
- All clients receive `updateActor` hooks independently
- Each client can make decisions and send database operations to the server

So with 3 clients connected, you could have 3 concurrent `checkWounded` calls on 3 different machines, each with their own semaphore.

The **Foundry server** serializes database writes, but by the time operations reach the server, each client has already:
1. Read stale state
2. Made decisions based on that state
3. Sent conflicting operations

## DAE's Approach (Better but not perfect)

DAE uses libWrapper on `_preCreate`, `_preDelete`, `_preUpdate` which **are awaited** by Foundry's document lifecycle:

```typescript
libWrapper.register("dae", "CONFIG.ActiveEffect.documentClass.prototype._preCreate", _preCreateActiveEffect, "MIXED");
```

This is better because document lifecycle methods are serialized per document.

**But DAE still has issues:**

```typescript
// dae.ts:2430-2441
for (let status of newStatuses.difference(currentStatuses)) {
  await toggleActorStatusEffect(actor, status, { active: true, ... });
}
```

If two effects are created on the same actor simultaneously (different effects), both read `currentStatuses` before either completes, leading to incorrect diff calculations.

## Root Causes

1. **No per-actor locking**: Both codebases allow concurrent status modifications on the same actor

2. **Stale state reads**: `actor.statuses` and `actor.effects` are read, then async work happens, then decisions are made on stale data

3. **Multiple atomic operations instead of batch**: Sequential `toggleStatusEffect` calls instead of single `createEmbeddedDocuments`/`deleteEmbeddedDocuments`

4. **Multi-client processing**: Multiple clients can process the same hook independently

## Recommended Solution

### 1. GM-only processing

Only the active GM should process wounded/dead status changes:

```typescript
export async function checkWounded(...) {
  // Only active GM processes wounded/dead
  if (!game.users?.activeGM?.isSelf) return;

  // ... rest of logic
}
```

This ensures exactly one client makes these decisions.

### 2. Per-actor semaphore on the GM client

```typescript
const actorSemaphores = new Map<string, foundry.utils.Semaphore>();

function getActorSemaphore(actorUuid: string): foundry.utils.Semaphore {
  if (!actorSemaphores.has(actorUuid)) {
    actorSemaphores.set(actorUuid, new foundry.utils.Semaphore(1));
  }
  return actorSemaphores.get(actorUuid)!;
}

export async function checkWounded(actor, update, options, user, vitalityValue?) {
  if (!game.users?.activeGM?.isSelf) return;

  const lock = getActorSemaphore(actor.uuid);
  await lock.add(async () => {
    // Re-read current state inside the lock
    const attributes = actor.system.attributes;
    // ... rest of logic with fresh state reads
  });
}
```

### 3. Batch status changes

Instead of multiple `toggleStatusEffect` calls:

```typescript
// Current (problematic):
for (const statusId of conflictingStatuses) {
  await actor.toggleStatusEffect(statusId, { active: false });
}

// Better:
const effectsToDelete = actor.effects
  .filter(e => conflictingStatuses.some(s => e.statuses.has(s)))
  .map(e => e.id);
if (effectsToDelete.length) {
  await actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
}
```

### 4. Re-read state after async gaps

Before acting, re-verify the condition still holds:

```typescript
// Instead of storing state before await:
const hasWounded = actor.statuses.has('wounded');
await someAsyncOperation();
if (!hasWounded) addWounded();  // BAD: hasWounded is stale

// Re-check inside the action:
await someAsyncOperation();
if (!actor.statuses.has('wounded')) addWounded();  // GOOD: fresh check
```

### 5. Handle "already exists" gracefully

The try/catch at line 2190-2194 is good but should be the norm:

```typescript
try {
  await actor.toggleStatusEffect(effect.id, { active: true });
} catch (err) {
  if (!err?.message?.includes("already exists")) {
    throw err;
  }
  // Silently ignore "already exists" - another concurrent operation added it
}
```

### 6. Consider document lifecycle hooks

Like DAE, wrap `Actor._preUpdate` to handle wounded/dead in a serialized context:

```typescript
libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype._preUpdate",
  async function(wrapped, changed, options, user) {
    const result = await wrapped(changed, options, user);
    // Process wounded/dead here - this is serialized per actor
    await processWoundedDead(this, changed, options);
    return result;
  },
  "WRAPPER"
);
```

## Implementation Priority

1. **High**: Add `if (!game.users?.activeGM?.isSelf) return;` check - eliminates multi-client races
2. **High**: Add per-actor semaphore - eliminates single-client races
3. **Medium**: Batch status effect operations - reduces database round-trips
4. **Medium**: Move to document lifecycle hooks - cleaner architecture
5. **Low**: Re-read state pattern - defense in depth

## Testing Considerations

- Test with multiple clients connected
- Test rapid HP changes (multi-attack)
- Test vitality + HP changes together
- Test with Convenient Effects installed and without
- Test wounded + dead transitions
