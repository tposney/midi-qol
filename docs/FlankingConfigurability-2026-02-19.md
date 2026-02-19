# Flanking Configurability Design Notes

**Status**: Design discussion only — no code changes made yet. Parked for later implementation.

## Goal

Allow flanking/flanked bonuses to be configurable: either advantage/disadvantage (current behavior) or a fixed value like +2, selectable from midi settings.

## Current Implementation

### Status Effect Definitions (`setupMidiStatusEffects()` in `midi-qol.ts`)

**Flanking** (applied to attacker):
```typescript
changes: [
  { key: "flags.midi-qol.advantage.attack.mwak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" },
  { key: "flags.midi-qol.advantage.attack.msak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" }
]
```

**Flanked** (applied to target):
```typescript
changes: [
  { key: "flags.midi-qol.grants.advantage.attack.mwak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" },
  { key: "flags.midi-qol.grants.advantage.attack.msak", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "true" }
]
```

### How Advantage is Applied

- `checkAttackAdvantage()` (Workflow.ts) does NOT check for flanked/flanking statuses directly
- For `"advonly"` mode: calls `checkFlankingAdvantage()` → `markFlanking()`, sets `this.flankingAdvantage = true`, adds to `attackRollModifierTracker.advantage`
- For status modes (`midiFlanking`, `midiFlanked`, etc.): the status effect's `changes` array sets midi flags, which are picked up by `computeAttackAdvantage()` in its generic flag sweep
- `checkFlankingAdvantage()` only sets `this.flankingAdvantage` when checkFlanking is `"advonly"`

### Setting (`settings.ts`)

```typescript
export const checkFlankingOptions = keysToExtendedOptionsObj("CheckFlankingOptions", [
  "off", "advonly", "ceonly", "midiFlanking",
  "ceflanked", "midiFlanked", "ceflankedNoconga", "midiFlankedNoConga"
]);
```
Stored in `configSettings.optionalRules.checkFlanking`.

### RollModifierTracker (`RollModifierTracker.ts`)

- `advantage`/`disadvantage` sub-trackers: boolean state (active/suppressed/override)
- `modifiers` sub-tracker (`RollValueTracker`): has `min()`, `max()`, `fail()`, `succeed()` but NO flat bonus method
- All modifications record attribution for chat card display

## Proposed Design

### New Setting

`configSettings.optionalRules.flankingBonus`: `"advantage"` (default) | number (e.g. `2`)

### Status Effect Changes by Mode

**When `flankingBonus` is `"advantage"`** (current behavior):
- Flanking: `flags.midi-qol.advantage.attack.mwak/msak = true`
- Flanked: `flags.midi-qol.grants.advantage.attack.mwak/msak = true`

**When `flankingBonus` is a number (e.g. 2)**:

For **flanking** (on attacker):
- `system.bonuses.mwak.attack = +2`, `system.bonuses.msak.attack = +2`
- dnd5e handles these natively in attack roll calculation

For **flanked** (on target) — two options discussed, decision needed:
- **Option A: AC penalty**: `system.attributes.ac.bonus = -2` — mechanically equivalent to +2 attack, dnd5e handles natively, simpler
- **Option B: New grants flag**: `flags.midi-qol.grants.bonus.attack.mwak = 2` — would need new processing code in `computeAttackAdvantage`

### `"advonly"` Path Changes

When `flankingBonus` is a number, `checkFlankingAdvantage()` needs to add a flat bonus instead of setting advantage. The `RollModifierTracker` doesn't have a flat bonus method, so either:
- Add a `bonus(value, source, displayName)` method to `RollValueTracker`
- Or inject the bonus as a roll term post-roll (same pattern as cover on saves)

Adding a tracker method is cleaner for attribution integration.

### Live Status Effect Rebuild (No Reload Needed)

Rather than forcing a page reload when the setting changes, call a new `updateFlankingStatusEffects()` from `fetchParams()`:

```typescript
function updateFlankingStatusEffects() {
  const bonus = configSettings.optionalRules.flankingBonus ?? "advantage";

  // Find and update existing entries in CONFIG.statusEffects
  const flanking = CONFIG.statusEffects.find(e => e.id === "flanking");
  const flanked = CONFIG.statusEffects.find(e => e.id === "flanked");

  if (flanking) {
    flanking.changes = bonus === "advantage"
      ? [/* advantage flags */]
      : [/* system.bonuses entries */];
  }
  if (flanked) {
    flanked.changes = bonus === "advantage"
      ? [/* grants.advantage flags */]
      : [/* AC penalty or grants.bonus entries */];
  }

  // Rebuild cached effect instances
  ActiveEffect.implementation.fromStatusEffect("flanking").then(e => midiFlankingEffect = e);
  ActiveEffect.implementation.fromStatusEffect("flanked").then(e => midiFlankedEffect = e);
}
```

This runs every time `fetchParams()` fires. Already-applied effects on tokens keep their old changes — only newly applied flanking effects pick up the updated definition.

### UI

Add a companion control next to the existing `checkFlanking` dropdown in `rules.hbs` — either a select (`Advantage` / `+2` / `Custom`) or a text field.

## Decision Points (Before Implementation)

1. **Flanked flat bonus**: AC penalty (Option A) vs new `grants.bonus` flag (Option B)?
2. **Advonly flat bonus**: New `RollValueTracker.bonus()` method vs post-roll term injection?
3. **UI control**: Dropdown with presets vs free-text field?
