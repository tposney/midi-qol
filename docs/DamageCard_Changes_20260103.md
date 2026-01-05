# Damage Card Implementation

This document describes the damage card system implementation in midi-qol 13.0.35.

## Overview

The damage card provides a visual display of damage applied to targets with interactive controls for applying, undoing, and modifying damage. Key features include:

- **Two layout styles**: Flexbox (modern) and Classic (table-based)
- **Real-time damage preview** when changing multipliers
- **Dynamic display updates** after apply/reverse operations
- **Token image interactions** (click to select, right-click to open sheet)
- **Vitality system integration** with overflow damage display
- **Full undo/redo support** preserving original calculated damage

---

## Settings

### Workflow Settings

| Setting | Options | Description |
|---------|---------|-------------|
| `damageCardStyle` | "flexbox", "classic" | Layout style for damage cards |

---

## Layout Styles

### Flexbox Layout
- Single-line display per target with inline icons
- Color-coded: ❤️ (red) for HP, 🛡️ (blue) for Temp HP, 💔 (black) for Vitality
- Text displays in green when values increase (healing)
- Fields with no change are hidden
- Recommended when using vitality system

### Classic Layout
- Table-based layout with separate columns
- Traditional appearance matching older midi-qol versions

---

## Multiplier System

### Dropdown Options

| Value | Label | Behavior |
|-------|-------|----------|
| `calc` | = | Default. Applies original calculated damage including saves/resistances |
| `x1` | 1 | Full damage, recalculated ignoring saves but including resistances |
| `x0.5` | ½ | Half damage |
| `x2` | 2 | Double damage |
| `x0.25` | ¼ | Quarter damage |
| `-1` | + | Healing (converts damage to healing) |

### Real-time Preview

When changing the multiplier, the damage display updates immediately to show what would be applied:

```typescript
multiplierSelect.on("change", async (event) => {
  const multiplierValue = event.target.value;
  // Recalculate and update display without applying
  await previewDamage(actor, multiplierValue, damageDetail);
});
```

### Multiplier Behavior

- **"=" multiplier**: Directly sets stored HP/TempHP values from the original calculation. Always reverts to the exact values from when damage was first rolled, regardless of current actor state.
- **Other multipliers**: Recalculate damage using `actor.calculateDamage()` with current actor resistances, ignoring saves. Takes into account any changes to the actor since the damage was rolled.

---

## Apply and Reverse Buttons

### Per-Target Buttons
- `#apply-{actorUuid}` - Apply damage to specific target
- `#reverse-{actorUuid}` - Undo damage for specific target

### All-Targets Buttons (when multiple targets)
- `#all-apply` - Apply damage to all targets
- `#all-reverse` - Undo damage for all targets

### Display Updates

After apply or reverse operations, the display updates to show what the opposite operation would do:

```typescript
// After apply: show what reverse would restore
updateDamageCardDisplay(html, actor, actorUuid, oldHP, oldTempHP, oldVitality);

// After reverse: show what apply would do
updateDamageCardDisplay(html, actor, actorUuid, newHP, newTempHP, newVitality);
```

### Button State

Buttons toggle between enabled/disabled states after operations:
- Apply button: enabled before apply, disabled after
- Reverse button: disabled before apply, enabled after

---

## Token Image Interactions

### Click Behaviors

| Action | Behavior |
|--------|----------|
| Left-click | Select the token on canvas (`token.control()`) |
| Right-click | Open the actor's character sheet |

```typescript
tokenImage.addEventListener("click", () => token?.control());
tokenImage.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  actor?.sheet?.render(true);
});
```

---

## Template Element IDs

Element IDs allow JavaScript-based updates without re-rendering the entire card:

### Display Elements
| ID Pattern | Purpose |
|------------|---------|
| `dmg-total-{displayUuid}` | Total damage/healing display |
| `dmg-temp-{displayUuid}` | Temp HP change display |
| `dmg-hp-{displayUuid}` | HP change display |
| `dmg-nochange-{displayUuid}` | No change indicator "(0)" |
| `dmg-vitality-{displayUuid}` | Vitality change display |
| `dmg-multiplier-{displayUuid}` | Multiplier dropdown |

### Value Spans
| Class | Purpose |
|-------|---------|
| `.dmg-temp-old` | Old temp HP value |
| `.dmg-temp-new` | New temp HP value |
| `.dmg-hp-old` | Old HP value |
| `.dmg-hp-new` | New HP value |
| `.dmg-vit-old` | Old vitality value |
| `.dmg-vit-new` | New vitality value |

---

## Vitality Integration

### Display Data

```typescript
const displayData = {
  oldVitality: damageItem.oldVitality,
  newVitality: damageItem.newVitality,
  vitalityIncrease: newVitality > oldVitality,
  vitalityChanged: newVitality !== oldVitality,
};
```

### Overflow Damage

When HP reaches 0, overflow damage is displayed as vitality reduction:
- Vitality icon: 💔 (`fa-heart-crack`)
- Shows: `oldVitality → newVitality`
- Text color: black for damage, green for recovery

### Healing via "+" Multiplier

When vitality is enabled and the "+" multiplier is selected:
1. Healing restores vitality first (reduces `uses.spent`)
2. Remaining healing applies to HP
3. Display updates to show both vitality and HP changes

---

## Undo/Redo Data Structure

### undoDamage Flag

Stored on the chat message for undo/redo support:

```typescript
interface SerializedDamageListEntry {
  actorUuid: string;
  oldHP: number;
  newHP: number;
  oldTempHP: number;
  newTempHP: number;
  oldVitality?: number;
  newVitality?: number;
  oldVitalitySpent?: number;
  newVitalitySpent?: number;
  calcDamageOptions: object;
  updateOptions: object;
}
```

### State Preservation

- **"=" multiplier**: Uses stored `newHP`/`newTempHP` values directly
- **Vitality**: Always recorded when actor has vitality item, even if unchanged
- **Reverse**: Restores `oldHP`/`oldTempHP`/`oldVitalitySpent`
- **Apply**: Applies `newHP`/`newTempHP`/`newVitalitySpent`

---

## Files

| File | Purpose |
|------|---------|
| `src/module/GMAction.ts` | Damage application, undo/redo logic, display updates |
| `templates/damage-results.html` | Flexbox layout template |
| `templates/damage-results-classic.html` | Classic table layout template |

---

## Implementation Notes

1. **Display UUID**: Actor UUIDs contain periods which are invalid in CSS selectors. The `displayUuid` replaces periods with empty strings for use in element IDs.

2. **Multiplier reset**: After apply/reverse operations, the multiplier dropdown resets to "=" (calc).

3. **Player damage cards**: A separate player-visible damage card can be created without undo buttons. These are identified by the `playerDamageCard` flag.

4. **Damage recalculation**: Non-"=" multipliers use `actor.calculateDamage()` which respects current resistances but ignores saves. This allows correcting for incorrect save results.

5. **Vitality lookup**: Vitality items are always looked up by name using `getVitalityItem(actor)` rather than stored UUIDs, ensuring undo/redo works even if the item is replaced.
