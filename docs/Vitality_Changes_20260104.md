# Vitality System Implementation

This document describes the vitality system implementation in midi-qol 13.0.35.

## Overview

The vitality system uses an item with uses (identified by item name) as a "vitality pool". When damage exceeds HP+TempHP, the overflow damage is applied to the vitality pool. When vitality reaches 0, the character is marked with a configurable condition (defaults to "dead").

### Key Features

- **Item-based tracking**: Vitality is tracked via a feature item's `uses.spent` value
- **Overflow damage**: Damage exceeding HP automatically reduces vitality
- **Configurable death condition**: Choose which condition applies when vitality is exhausted
- **Flexible death requirements**: Configure whether death requires vitality=0 only, or both vitality=0 AND HP=0
- **Damage card integration**: undo/redo support with vitality display
- **Healing via multiplier**: The damage card's "+" multiplier restores vitality first, then HP

---

## Settings

### Optional Rules Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `vitalityItem` | string | "" | Exact name of the feature item to use as vitality pool |
| `vitalityDeadCondition` | string | "dead" | Condition to apply when vitality reaches 0 |
| `vitalityDeathRequires` | string | "vitalityOnly" | When death occurs: "vitalityOnly" (vitality=0) or "vitalityAndHP" (both vitality=0 AND HP=0) |

---

## API Functions (src/module/utils.ts)

### getVitalityItem
```typescript
/**
 * Get the vitality item for an actor (a feature with uses that serves as a vitality pool)
 * @param actor The actor to get the vitality item for
 * @returns The vitality item if found, undefined otherwise
 */
export function getVitalityItem(actor: Actor.Implementation | null | undefined): Item.Implementation | undefined
```

### getVitalityValue
```typescript
/**
 * Get the current vitality value for an actor (max - spent)
 * @param actor The actor to get vitality for
 * @returns The current vitality value, or undefined if no vitality system is configured
 */
export function getVitalityValue(actor: Actor.Implementation | null | undefined): number | undefined
```

### getVitalityMax
```typescript
/**
 * Get the maximum vitality value for an actor
 * @param actor The actor to get max vitality for
 * @returns The maximum vitality value, or undefined if no vitality system is configured
 */
export function getVitalityMax(actor: Actor.Implementation | null | undefined): number | undefined
```

### hasVitalitySystem
```typescript
/**
 * Check if the actor has a vitality system configured
 */
export function hasVitalitySystem(actor: Actor.Implementation | null | undefined): boolean
```

### getVitalityDeadStatus
```typescript
/**
 * Get the status effect to apply when vitality reaches 0.
 * Uses the configured vitalityDeadCondition setting, defaulting to "dead".
 * Supports both standard conditions and Convenient Effects.
 */
export function getVitalityDeadStatus(): StatusEffectConfig | undefined
```

### Global Exports
```typescript
globalThis.MidiQOL.getVitalityItem = getVitalityItem;
globalThis.MidiQOL.getVitalityValue = getVitalityValue;
globalThis.MidiQOL.getVitalityMax = getVitalityMax;
globalThis.MidiQOL.hasVitalitySystem = hasVitalitySystem;
```

---

## Type Definitions (src/globals.ts)

### DamageApplicationOptions
```typescript
midiVitalityHandled?: boolean;      // Set when vitality was handled by a hook
midiVitalityUpdatePending?: boolean; // Set to skip checkWounded in updateActor hook
```

### DamageListEntry
```typescript
newVitality?: number;      // Vitality value after damage
oldVitality?: number;      // Vitality value before damage
oldVitalitySpent?: number; // uses.spent before damage
newVitalitySpent?: number; // uses.spent after damage
```

---

## Damage Application (src/module/GMAction.ts)

### Overflow Calculation

When damage is applied and HP reaches 0, overflow damage is calculated and applied to vitality:

```typescript
const vitalityItem = getVitalityItem(actor);
if (vitalityItem) {
  const currentSpent = vitalityItem.system.uses?.spent ?? 0;
  const maxUses = vitalityItem.system.uses?.max ?? 0;

  // Always record current state for undo support
  damageItem.oldVitalitySpent = currentSpent;
  damageItem.oldVitality = maxUses - currentSpent;
  damageItem.newVitalitySpent = currentSpent;
  damageItem.newVitality = maxUses - currentSpent;

  // Calculate overflow when HP reaches 0
  if (updates["system.attributes.hp.value"] <= 0 && amount > 0) {
    const overflowDamage = amount - (hp.temp + hp.value);
    if (overflowDamage > 0) {
      const newSpent = Math.min(maxUses, currentSpent + overflowDamage);
      damageItem.newVitalitySpent = newSpent;
      damageItem.newVitality = maxUses - newSpent;
    }
  }
}
```

### Healing via Damage Card Multiplier

When the "+" (healing) multiplier is selected on the damage card with vitality enabled, healing is applied in order:
1. Restore vitality first (reduce `uses.spent`)
2. Apply remaining healing to HP

```typescript
if (vitalityItem && totalMultipliedDamage < 0) {
  const healingAmount = Math.abs(totalMultipliedDamage);
  const vitalityMissing = currentSpent;
  const vitalityRestored = Math.min(vitalityMissing, healingAmount);

  if (vitalityRestored > 0) {
    newSpent = currentSpent - vitalityRestored;
    const remainingHealing = healingAmount - vitalityRestored;
    // Scale multiplier so only remaining healing goes to HP
    applyOptions.multiplier = remainingHealing > 0
      ? (applyOptions.multiplier ?? 1) * (remainingHealing / healingAmount)
      : 0;
  }
}
```

### Undo/Redo Support

Vitality is looked up by name (not stored UUID) to ensure undo/redo works even if the item is removed and re-added:

```typescript
// Undo - restore old vitality state
const vitalityItem = getVitalityItem(actor);
if (vitalityItem && undoItem?.oldVitalitySpent !== undefined) {
  await vitalityItem.update({ "system.uses.spent": undoItem.oldVitalitySpent });
}

// Apply - apply new vitality state
const vitalityItem = getVitalityItem(actor);
if (vitalityItem && applyItem?.newVitalitySpent !== undefined) {
  await vitalityItem.update({ "system.uses.spent": applyItem.newVitalitySpent });
}
```

---

## Hook Handlers (src/module/Hooks.ts)

### updateActor Hook

Skips `checkWounded` when a vitality update is pending to prevent race conditions:

```typescript
Hooks.on("updateActor", async (actor, update, options, user) => {
  // Skip checkWounded if vitality update is pending
  if (!options.midiVitalityUpdatePending) {
    await checkWounded(actor, update, options, user);
  }
});
```

### updateItem Hook

Triggers `checkWounded` when vitality item changes:

```typescript
Hooks.on("updateItem", async (item, update, options, userId) => {
  const spentUpdate = foundry.utils.getProperty(update, "system.uses.spent");
  if (spentUpdate === undefined) return;

  const actor = item.actor;
  const vitalityItem = getVitalityItem(actor);
  if (!vitalityItem || vitalityItem.id !== item.id) return;

  const maxUses = item.system.uses?.max ?? 0;
  const newVitality = maxUses - spentUpdate;
  await checkWounded(actor, {}, {}, userId, newVitality);
});
```

### dnd5e.preApplyDamage Hook

Handles vitality overflow for `actor.applyDamage()` calls (macros, other modules):

```typescript
Hooks.on("dnd5e.preApplyDamage", (actor, amount, updates, options) => {
  const vitalityItem = getVitalityItem(actor);
  if (amount > 0 && vitalityItem) {
    const totalHP = actor.system.attributes.hp.temp + actor.system.attributes.hp.value;
    if (amount > totalHP) {
      const overflowDamage = amount - totalHP;
      const currentSpent = vitalityItem.system.uses?.spent ?? 0;
      const maxUses = vitalityItem.system.uses?.max ?? 0;
      const newSpent = Math.min(maxUses, currentSpent + overflowDamage);

      options.midiVitalityHandled = true;
      options.midiVitalityUpdatePending = true;
      setTimeout(() => vitalityItem.update({ "system.uses.spent": newSpent }), 100);
    }
  }
});
```

---

## Death Status Handling (src/module/patching.ts)

### checkWounded Function

Determines when an actor should receive the dead condition based on `vitalityDeathRequires` setting:

```typescript
const deathRequires = configSettings.optionalRules.vitalityDeathRequires || "vitalityOnly";
let needsBeaten: boolean;

if (hasVitality) {
  if (deathRequires === "vitalityOnly") {
    // Dead when vitality reaches 0, regardless of HP
    needsBeaten = vitalityValue <= 0;
  } else {
    // Dead only when both vitality and HP are 0
    needsBeaten = vitalityValue <= 0 && attributes.hp.value <= 0;
  }
} else {
  needsBeaten = attributes.hp.value <= 0;
}
```

### setDeadStatus Function

Removes conflicting statuses before applying dead condition:

```typescript
async function setDeadStatus(actor, options) {
  if (options.makeDead) {
    // Remove unconscious and its rider statuses to avoid conflicts
    const conflictingStatuses = ["unconscious", "incapacitated", "prone"];
    for (const statusId of conflictingStatuses) {
      if (actor.statuses.has(statusId)) {
        await actor.toggleStatusEffect(statusId, { active: false });
      }
    }
  }
  // Apply or remove the dead condition
  await actor.toggleStatusEffect(options.effect.id, { active: options.makeDead });
}
```

---

## Usage Instructions

1. **Configure the setting**: Set `vitalityItem` in midi-qol optional rules to the exact name of the item to use as vitality pool

2. **Set death requirements** (optional): Configure `vitalityDeathRequires` to control when death occurs:
   - "Vitality of 0" (default): Actor is dead when vitality reaches 0, regardless of HP
   - "Vitality of 0 AND HP of 0": Actor is only dead when both are 0

3. **Set death condition** (optional): Configure `vitalityDeadCondition` to choose which condition applies when vitality is exhausted

4. **Create the vitality item**: Add a feature item to the actor with:
   - Name matching the `vitalityItem` setting exactly (case-sensitive)
   - Max uses set to the actor's total vitality pool

5. **Damage handling**:
   - Damage exceeding HP+TempHP automatically reduces vitality
   - When vitality reaches 0, the configured condition is applied

6. **Healing handling**:
   - Normal healing (spells, items) does NOT restore vitality
   - The damage card "+" multiplier restores vitality first, then HP
   - Vitality can be manually restored by editing the vitality item's uses

7. **Reviving an actor**:
   - Both HP AND vitality must be restored to remove the dead condition
   - Restoring only HP will not remove dead if vitality is still 0

---

## Important Notes

1. **Item matching by name**: The vitality item is matched by exact name, not identifier. This avoids confusion when item names are changed.

2. **Vitality cannot be changed via HP edits**: Setting HP on the actor sheet or token HUD does not affect vitality.

3. **Race condition prevention**: The `midiVitalityUpdatePending` flag coordinates between updateActor and updateItem hooks to ensure `checkWounded` runs exactly once.

4. **Separate death condition**: Use `getVitalityDeadStatus()` for vitality-based death, which reads from `vitalityDeadCondition` setting. This is separate from the normal HP-based dead condition.

5. **Damage card display**: Use the Flexbox layout damage card style to see vitality changes displayed alongside HP and TempHP changes.
