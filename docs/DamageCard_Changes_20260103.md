# Damage Card Changes

This document outlines the changes made to the damage card system in midi-qol 13.0.35.

## Overview

The damage card has been enhanced with:
- Real-time damage preview when changing multipliers
- Dynamic display updates after apply/reverse operations
- Token image interactions (click to select, right-click to open sheet)
- Vitality display support
- Template IDs for JavaScript-based updates

---

## 1. Multiplier Preview System

### Real-time Preview
When changing the multiplier dropdown, the damage display updates immediately to show what the new damage would be.

```typescript
// In GMAction.ts - processUndoDamageCard
const multiplierSelect = html.find("#multiplier-select");
multiplierSelect.on("change", async (event) => {
  const multiplierValue = $(event.target).val() as string;
  await updateAllDamageDisplay(actorUuid, actor, currentHP, currentTempHP, multiplierValue, damageDetail);
});
```

### Multiplier Options
- `=` (calc) - Default. Uses original calculated damage with saves/resistances applied
- `1` - Full damage, recalculated ignoring saves
- `½` - Half damage
- `2` - Double damage
- `¼` - Quarter damage
- `+` - Healing (negative damage)

---

## 2. Fixed "=" Case Apply Button

### Problem
The "=" case was incorrectly using `actor.applyDamage()` with options, which didn't preserve the original calculated damage including saves and resistances.

### Solution
Changed to directly setting stored HP values using `actor.update()`:

```typescript
// Before (incorrect)
await actor?.applyDamage(damageDetail, applyOptions);

// After (correct)
const updates = {
  "system.attributes.hp.value": newHP,
  "system.attributes.hp.temp": newTempHP
};
await actor.update(updates, options);
```

This matches how the reverse button works with `oldHP`/`oldTempHP`.

---

## 3. Display Updates After Apply/Reverse

### updateDamageDisplay Function
After apply or reverse operations, the damage display updates to show what the opposite operation would do:

```typescript
function updateDamageDisplay(actor: Actor.Implementation, targetHP: number, targetTempHP: number) {
  const currentHP = actor.system.attributes.hp.value ?? 0;
  const currentTempHP = actor.system.attributes.hp.temp ?? 0;

  // Calculate what the change would be
  const hpChange = targetHP - currentHP;
  const tempChange = targetTempHP - currentTempHP;

  // Update display elements
  // Shows (0) when current HP equals target HP
}
```

### Behavior
- **After apply**: Display shows what reverse would do (transition back to oldHP)
- **After reverse**: Display shows what apply would do (transition to newHP)
- **No change**: Shows (0) when current HP equals target HP

---

## 4. Multiplier Reset After Operations

Both apply and reverse buttons reset the dropdown to "calc" (=) after execution:

```typescript
// Reset multiplier dropdown
const multiplierSelect = html.find("#multiplier-select");
multiplierSelect.val("calc");
```

---

## 5. Token Image Interactions

### Click Behavior
- **Left-click**: Select the token (`token.control()`)
- **Right-click** (contextmenu): Open the actor sheet

```typescript
// In damage-results.hbs template
html.find(".midi-token-image").on("click", (event) => {
  const token = canvas.tokens?.get(tokenId);
  token?.control();
});

html.find(".midi-token-image").on("contextmenu", (event) => {
  event.preventDefault();
  actor?.sheet?.render(true);
});
```

---

## 6. Template IDs for Dynamic Updates

Added IDs to damage display elements to allow JavaScript-based updates without re-rendering:

### Element IDs
- `dmg-total-{actorUuid}` - Total damage display
- `dmg-temp-{actorUuid}` - Temp HP change display
- `dmg-hp-{actorUuid}` - HP change display
- `dmg-nochange-{actorUuid}` - No change indicator
- `dmg-vitality-{actorUuid}` - Vitality change display

### CSS Classes
- `.dmg-temp-old` - Old temp HP value
- `.dmg-temp-new` - New temp HP value
- `.dmg-hp-old` - Old HP value
- `.dmg-hp-new` - New HP value

---

## 7. Vitality Display

### Damage Card Data
```typescript
const displayData = {
  oldVitality: damageItem.oldVitality,
  newVitality: damageItem.newVitality,
  vitalityIncrease: (damageItem.newVitality ?? 0) > (damageItem.oldVitality ?? 0),
  vitalityChanged: (damageItem.newVitality ?? 0) !== (damageItem.oldVitality ?? 0),
  // ...
};
```

### Tooltip
```typescript
if ((damageItem.newVitality ?? 0) !== (damageItem.oldVitality ?? 0)) {
  toolTipHeader.push(`Vitality: ${damageItem.oldVitality} -> ${damageItem.newVitality}`);
}
```

---

## 8. Key Files Modified

- `src/module/GMAction.ts` - Main damage application and undo/redo logic
- `templates/damage-results.hbs` - Damage card template
- `templates/damage-results-multi.hbs` - Multi-target damage card template
- `src/module/Hooks.ts` - Token image click handlers

---

## 9. Implementation Notes

1. **updateAllDamageDisplay vs updateDamageDisplay**:
   - `updateAllDamageDisplay` - Updates all damage displays for an actor across all messages
   - `updateDamageDisplay` - Updates a single damage display element

2. **Multiplier recalculation**: When changing multiplier from "=" to another value, damage is recalculated using `actor.calculateDamage()` ignoring saves. Only "=" preserves the original calculated damage.

3. **State preservation**: The undoDamage flag stores all necessary state (oldHP, newHP, oldTempHP, newTempHP, vitality values) for proper undo/redo functionality.
