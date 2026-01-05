# Vitality System Code Changes

This document outlines all code changes related to the vitality system implementation in midi-qol.

## Overview

The vitality system allows using an item with uses (identified by item name) as a "vitality pool". When damage exceeds HP, the overflow damage is applied to the vitality pool. When vitality reaches 0, the character is marked with a configurable condition (defaults to "dead").

---

## 1. Utils Functions (src/module/utils.ts)

### getVitalityItem
```typescript
/**
 * Get the vitality item for an actor (a feature with uses that serves as a vitality pool)
 * @param actor The actor to get the vitality item for
 * @returns The vitality item if found, undefined otherwise
 */
export function getVitalityItem(actor: Actor.Implementation | null | undefined): Item.Implementation | undefined {
  if (!actor) return undefined;
  const itemName = checkRule("vitalityItem");
  if (typeof itemName !== "string" || !itemName) return undefined;
  return actor.items.getName(itemName) ?? undefined;
}
```

### getVitalityValue
```typescript
/**
 * Get the current vitality value for an actor
 * @param actor The actor to get vitality for
 * @returns The current vitality value, or undefined if no vitality system is configured
 */
export function getVitalityValue(actor: Actor.Implementation | null | undefined): number | undefined {
  if (!actor) return undefined;
  const vitalityItem = getVitalityItem(actor);
  if (vitalityItem) {
    return vitalityItem.system.uses?.value ?? 0;
  }
  return undefined;
}
```

### getVitalityMax
```typescript
/**
 * Get the maximum vitality value for an actor
 * @param actor The actor to get max vitality for
 * @returns The maximum vitality value, or undefined if no vitality system is configured
 */
export function getVitalityMax(actor: Actor.Implementation | null | undefined): number | undefined {
  if (!actor) return undefined;
  const vitalityItem = getVitalityItem(actor);
  if (vitalityItem) {
    return vitalityItem.system.uses?.max ?? 0;
  }
  return undefined;
}
```

### hasVitalitySystem
```typescript
/**
 * Check if the actor has a vitality system configured
 */
export function hasVitalitySystem(actor: Actor.Implementation | null | undefined): boolean {
  if (!actor) return false;
  return !!getVitalityItem(actor);
}
```

### getVitalityDeadStatus
```typescript
/**
 * Get the status effect to apply when vitality reaches 0.
 * Uses the configured vitalityDeadCondition setting, defaulting to "dead".
 * Supports both standard conditions and Convenient Effects.
 */
export function getVitalityDeadStatus() {
  const conditionId = configSettings.optionalRules.vitalityDeadCondition || "dead";
  let condition = CONFIG.statusEffects.find(efData => efData.id === conditionId);
  if (condition || !ceInterface) return condition;
  return ceInterface.findEffect({ effectId: conditionId?.replace("zce-", "ce-") });
}
```

---

## 2. Settings (src/module/settings.ts)

### vitalityItem rule
```typescript
vitalityItem: "", // Item name for vitality pool feature
vitalityDeadCondition: "dead", // Condition to apply when vitality reaches 0
```

### Initialization (in fetchParams)
```typescript
if (!configSettings.optionalRules.vitalityDeadCondition) configSettings.optionalRules.vitalityDeadCondition = "dead";
```

---

## 3. Type Definitions (src/globals.ts)

### MidiQOL namespace exports
```typescript
getVitalityItem: typeof utils.getVitalityItem,
getVitalityMax: typeof utils.getVitalityMax,
getVitalityValue: typeof utils.getVitalityValue,
hasVitalitySystem: typeof utils.hasVitalitySystem,
```

### DamageApplicationOptions
```typescript
midiVitalityHandled?: boolean;
midiVitalityUpdatePending?: boolean;
```

### DamageListEntry type
```typescript
newVitality?: number;
oldVitality?: number;
oldVitalitySpent?: number;
newVitalitySpent?: number;
```

---

## 4. Hooks (src/module/Hooks.ts)

### updateActor hook - skip checkWounded when vitality update is pending
```typescript
Hooks.on("updateActor", async (actor, update, options: any, user) => {
  if (user !== game.user?.id) return;
  const hpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.value");
  const temphpUpdate = foundry.utils.getProperty(update, "system.attributes.hp.temp");
  if (hpUpdate !== undefined || temphpUpdate !== undefined) {
    const hpUpdateFunc = async () => {
      // Skip checkWounded if a vitality update is pending - the updateItem hook will handle it
      // This prevents race conditions with concurrent toggleStatusEffect calls
      if (!options.midiVitalityUpdatePending) {
        await checkWounded(actor, update, options, user);
      }
      await zeroHPExpiry(actor, update, options, user);
    }
    await hpUpdateFunc();
    // ...
  }
});
```

### updateItem hook for vitality changes
```typescript
// Handle vitality item updates - check wounded/dead status when vitality changes
Hooks.on("updateItem", async (item, update, options, userId) => {
  if (userId !== game.user?.id) return;
  const spentUpdate = foundry.utils.getProperty(update, "system.uses.spent") as number | undefined;
  if (spentUpdate === undefined) return;

  const actor = item.actor;
  if (!actor) return;

  const vitalityItem = getVitalityItem(actor);
  if (!vitalityItem || vitalityItem.id !== item.id) return;

  const maxUses = item.system.uses?.max ?? 0;
  const newVitality = maxUses - spentUpdate;

  await checkWounded(actor, {}, {} as any, userId, newVitality);
});
```

### dnd5e.preApplyDamage hook vitality handling

**Important**: This hook only fires for `actor.applyDamage()` calls (e.g., damage applied via macros or other modules).
Midi-qol uses `actor.update()` directly in GMAction.ts, so this hook does NOT fire for midi workflows.
Direct HP edits on the actor sheet or token HUD do not trigger this hook because the value is clamped before application.

```typescript
Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
  // Handle vitality overflow when HP reaches 0 (for actor.applyDamage() calls)
  // This hook does NOT fire for midi-qol workflows or direct sheet edits
  // (midi-qol uses actor.update() directly, sheet edits are clamped before application)
  const vitalityItem = getVitalityItem(actor);
  if (amount > 0 && vitalityItem) {
    const currentHP = actor.system.attributes.hp.value ?? 0;
    const currentTempHP = actor.system.attributes.hp.temp ?? 0;
    const totalHP = currentTempHP + currentHP;

    if (amount > totalHP) {
      const overflowDamage = amount - totalHP;
      const currentSpent = vitalityItem.system.uses?.spent ?? 0;
      const maxUses = vitalityItem.system.uses?.max ?? 0;
      const newSpent = Math.min(maxUses, currentSpent + overflowDamage);

      options.midiVitalityHandled = true;
      options.midiVitalityUpdatePending = true;

      setTimeout(async () => {
        await vitalityItem.update({ "system.uses.spent": newSpent });
      }, 100);
    }
  }
  return true;
});
```

---

## 5. GMAction Damage Application (src/module/GMAction.ts)

### Vitality overflow calculation
```typescript
const vitalityItem = getVitalityItem(actor);
let vitalityItemUpdatePromise: Promise<any> | undefined;

if (vitalityItem) {
  const currentSpent = vitalityItem.system.uses?.spent ?? 0;
  const maxUses = vitalityItem.system.uses?.max ?? 0;

  damageItem.oldVitalitySpent = currentSpent;
  damageItem.oldVitality = maxUses - currentSpent;

  // Check for overflow damage when HP reaches 0
  if (updates["system.attributes.hp.value"] <= 0 && amount > 0) {
    const overflowDamage = amount - (hp.temp + hp.value);

    if (overflowDamage > 0) {
      const newSpent = Math.min(maxUses, currentSpent + overflowDamage);
      damageItem.newVitalitySpent = newSpent;
      damageItem.newVitality = maxUses - newSpent;

      if (createPromises && doHits && (data.autoApplyDamage.includes("yes") || data.forceApply)) {
        vitalityItemUpdatePromise = vitalityItem.update({ "system.uses.spent": newSpent });
      }
    }
  }
}
```

### Undo/Redo vitality handling

The vitality item is always retrieved by name using `getVitalityItem(actor)` rather than stored UUID. This ensures undo/redo works correctly even if the vitality item is removed and re-added.

```typescript
// Handle vitality undo - get vitality item by name
const vitalityItem = getVitalityItem(actor);
if (vitalityItem && undoItem?.oldVitalitySpent !== undefined) {
  await vitalityItem.update({ "system.uses.spent": undoItem.oldVitalitySpent });
}

// Handle vitality apply - get vitality item by name
const vitalityItem = getVitalityItem(actor);
if (vitalityItem && applyItem?.newVitalitySpent !== undefined) {
  await vitalityItem.update({ "system.uses.spent": applyItem.newVitalitySpent });
}
```

---

## 6. checkWounded Function (src/module/patching.ts)

### Vitality death status handling

The vitality system uses its own condition setting (`vitalityDeadCondition`) separate from the normal HP-based dead condition. This allows users to apply a different condition when vitality is exhausted (e.g., "dead" for vitality vs "unconscious" for HP reaching 0).

```typescript
// When vitality reaches 0, apply the configured vitality dead condition
if (hasVitality && needsBeaten) {
  // For vitality death, use the configured vitalityDeadCondition (defaults to "dead")
  const effect = getVitalityDeadStatus();
  if (effect) {
    await setDeadStatus(actor, { effect, useDefeated: configSettings.markNonPlayerDefeated, makeDead: true });
  }
} else if (hasVitality && !needsBeaten) {
  // Vitality > 0, remove the vitality dead condition if present
  const effect = getVitalityDeadStatus();
  if (effect) {
    await setDeadStatus(actor, { effect, useDefeated: configSettings.markNonPlayerDefeated, makeDead: false });
  }
}
```

### setDeadStatus removes conflicting statuses
```typescript
async function setDeadStatus(actor, options) {
  let { effect, useDefeated, makeDead } = options;
  if (!effect) return;

  // When applying dead status, first remove unconscious and its rider statuses
  // dnd5e automatically applies unconscious when HP reaches 0, but we want dead instead
  // Unconscious has incapacitated and prone as riders, which conflict with dead's riders
  if (makeDead) {
    const conflictingStatuses = ["unconscious", "incapacitated", "prone"];
    for (const statusId of conflictingStatuses) {
      if (actor.statuses.has(statusId)) {
        try {
          await actor.toggleStatusEffect(statusId, { active: false });
        } catch (err) {
          // Ignore errors when removing statuses
        }
      }
    }
  }
  // ... rest of function
}
```

---

## 7. Global API Exports (src/midi-qol.ts)

```typescript
globalThis.MidiQOL.getVitalityItem = getVitalityItem;
globalThis.MidiQOL.getVitalityValue = getVitalityValue;
globalThis.MidiQOL.getVitalityMax = getVitalityMax;
globalThis.MidiQOL.hasVitalitySystem = hasVitalitySystem;
```

---

## Usage

1. Set the `vitalityItem` rule in midi-qol optional rules settings to the **name** of the item to use as vitality pool
2. Optionally set the `vitalityDeadCondition` to choose which condition to apply when vitality is exhausted (defaults to "dead")
3. Create an item with uses on the character (e.g., a feature with X max uses)
4. Ensure the item's **name** matches the `vitalityItem` setting exactly
5. When damage exceeds HP, overflow damage is applied to the vitality pool (uses.spent increases)
6. When vitality (max - spent) reaches 0, the configured condition is applied
7. To revive an actor, both HP AND vitality must be restored

**Note:** The vitality item is matched by **name** rather than identifier. This is because dnd5e's item identifier is auto-generated from the item's name at creation time and doesn't update when the name changes, which can be confusing for users.

---

## Key Implementation Notes

1. **options.midi is set for ALL damage**: The `dnd5e.preCalculateDamage` hook unconditionally sets `options.midi.totalDamage`. Don't use `!options.midi` to detect non-midi damage.

2. **Midi uses actor.update(), not actor.applyDamage()**: Midi-qol applies damage via `actor.update()` directly in GMAction.ts, so `dnd5e.preApplyDamage` only fires for non-midi damage sources.

3. **Race condition prevention**: The `midiVitalityUpdatePending` flag prevents the updateActor hook from calling checkWounded when a vitality update is pending. Only the updateItem hook calls checkWounded for vitality actors.

4. **Configurable vitality condition**: Use `getVitalityDeadStatus()` which reads from `vitalityDeadCondition` setting (defaults to "dead"). This is separate from `getDeadStatus()` which uses the normal HP-based dead condition setting.

5. **Conflicting status removal**: Before applying dead status, remove unconscious, incapacitated, and prone to avoid "already exists" errors from rider status conflicts.

---

## Fixes Applied During Development

### Fix 1: Dead/defeated status not applied when vitality exhausted
The `checkWounded` function was not being called after the vitality item update completed. Fixed by ensuring the `updateItem` hook calls `checkWounded` when vitality changes.

### Fix 2: Vitality overflow from actor.applyDamage() calls
Vitality overflow damage is now handled when `actor.applyDamage()` is called (via `dnd5e.preApplyDamage` hook), not just through midi-qol's damage workflow. Note that direct HP edits on the actor sheet or token HUD do not trigger this hook because the value is clamped before application.

### Fix 3: Vitality not restored when undoing damage that didn't cause overflow
Previously, `oldVitalitySpent` and `newVitalitySpent` were only recorded when there was overflow damage. This meant undoing damage that didn't cause overflow wouldn't restore vitality to its value at the time of the attack.

Now, when an actor has a vitality item, the current vitality state is always recorded:

```typescript
// Always record when vitality item exists
if (vitalityItem) {
  damageItem.oldVitalitySpent = currentSpent;
  damageItem.oldVitality = maxUses - currentSpent;

  // Check for overflow and set new values accordingly
  if (overflowDamage > 0) {
    damageItem.newVitalitySpent = newSpent;
    damageItem.newVitality = maxUses - newSpent;
  } else {
    // No change - but still record for undo
    damageItem.newVitalitySpent = currentSpent;
    damageItem.newVitality = maxUses - currentSpent;
  }
}
```

This ensures that undoing any damage will restore vitality to its value at the time of the attack, even if that particular attack didn't cause vitality loss.

### Fix 4: Double checkWounded calls when undoing damage with vitality

When undoing damage that affects vitality, both the vitality item update and the actor HP update would trigger `checkWounded`, potentially causing the dead condition to be toggled twice.

Fixed by setting `midiVitalityUpdatePending = true` on the actor update options when a vitality update has occurred, matching the behavior used when applying damage.

Note: The updateActor hook checks for this flag and skips `checkWounded` when set, allowing the updateItem hook to handle it instead.

### Fix 5: Vitality item lookup by name instead of UUID

Previously, the vitality item UUID was stored when damage was applied and used to look up the item during undo/redo. This caused problems if the vitality item was removed and re-added (which would give it a new UUID).

Fixed by always using `getVitalityItem(actor)` to look up the vitality item by name. This ensures undo/redo works correctly even if:
- The vitality item is removed and re-added
- The vitalityItem setting is changed
- The actor no longer has a vitality item configured

```typescript
// Example from "Reverse All" button handler
const undoItem = undoDamageData.find(d => d.actorUuid === actorUuid);
const vitalityItem = getVitalityItem(actor);
let vitalityUpdated = false;

// Only process vitality if actor currently has a vitality item
if (vitalityItem && undoItem?.oldVitalitySpent !== undefined) {
  await vitalityItem.update({ "system.uses.spent": undoItem.oldVitalitySpent });
  vitalityUpdated = true;
}

// Set midiVitalityUpdatePending only if vitality was actually updated
const mergedOptions = foundry.utils.mergeObject(calcDamageOptions, updateOptions ?? {}, { inplace: false }) as any;
if (vitalityUpdated) mergedOptions.midiVitalityUpdatePending = true;
await actor.update(updates, mergedOptions);
```

This ensures that:
1. If an actor no longer has a vitality item, the normal HP-based condition handling occurs
2. The `midiVitalityUpdatePending` flag is only set when vitality was actually updated, allowing `checkWounded` to run normally for non-vitality actors

---

## Fix 6: Vitality damage display not updating with multiplier selection

When using the damage multiplier dropdown (x0.5, x2, etc.) on the damage card, the vitality damage display in the chat card was not updating to reflect the new calculated vitality damage.

Fixed by adding vitality display update logic to the multiplier change handler. The handler now:
1. Gets the current vitality item using `getVitalityItem(actor)`
2. Calculates overflow damage to vitality when HP would reach 0
3. Updates the vitality display span with the calculated values

Also fixed the `updateDamageDisplay` helper function to accept a `targetVitality` parameter and update the vitality display after apply/reverse operations.

### Fix 6a: Total damage display hidden when HP already at 0

The total damage display was being hidden when HP didn't change (e.g., actor already at 0 HP). Fixed by always showing the total damage if there's damage to apply (`absTotalDamage > 0`), regardless of whether HP changes. This ensures damage going to vitality is still displayed.

### Fix 6b: Vitality display not updating after apply/reverse

After clicking Apply or Reverse buttons, the vitality display wasn't updating to show what the opposite action would do. Fixed by:
1. Adding `targetVitality` parameter to `updateDamageDisplay` function
2. Passing `newVitality` after reverse (to show what apply would do)
3. Passing `oldVitality` after apply (to show what reverse would restore)
