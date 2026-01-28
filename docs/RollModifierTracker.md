# RollModifierTracker API

The `RollModifierTracker` class tracks roll modifiers (advantage, disadvantage, auto-fail, auto-success, min, max) with attribution support. It is exported via `MidiQOL.RollModifierTracker` for use by macros and other modules.

## Overview

The tracker manages:
- **Advantage/Disadvantage** with source attribution
- **Suppression** (noAdvantage/noDisadvantage flags)
- **Overrides** (force advantage/disadvantage, bypassing suppression)
- **Roll mode** calculation based on current state

## Accessing the Tracker

```javascript
// Access the class
const RollModifierTracker = MidiQOL.RollModifierTracker;

// Create a new instance
const tracker = new RollModifierTracker();

// Access workflow's attack roll tracker
const workflow = MidiQOL.Workflow.getWorkflow(messageUuid);
const attackTracker = workflow.attackRollModifierTracker;
```

## Core Methods

### Adding Advantage/Disadvantage

```javascript
// Add advantage with attribution
tracker.addAdvantage(source, displayName);

// Add disadvantage with attribution
tracker.addDisadvantage(source, displayName);

// Examples from midi-qol:
tracker.addAdvantage("flanking", "Flanking");
tracker.addAdvantage("workflowOptions", game.i18n.localize("midi-qol.WorkflowOptions"));
tracker.addDisadvantage("nearbyFoe", "Nearby foe");
tracker.addDisadvantage("invisible foe", "Invisible foe");
```

### Suppressing Advantage/Disadvantage

Used when a flag like `noAdvantage.attack.all` prevents advantage:

```javascript
// Suppress advantage (e.g., target has noAdvantage flag)
tracker.suppressAdvantage(source, displayName);

// Suppress disadvantage
tracker.suppressDisadvantage(source, displayName);
```

### Overrides (Force Mode)

Overrides bypass suppression - used when user explicitly chooses advantage/disadvantage via keyboard shortcuts:

```javascript
// Force advantage, ignoring any suppression
tracker.setAdvantageOverride(source, displayName);

// Force disadvantage, ignoring any suppression
tracker.setDisadvantageOverride(source, displayName);

// Set mode directly: -1 = disadvantage, 0 = normal, 1 = advantage
tracker.setOverride(CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE);
```

### Checking State

```javascript
// Check if there's effective advantage (respects suppression unless overridden)
if (tracker.hasAdvantage) { /* ... */ }

// Check if there's effective disadvantage
if (tracker.hasDisadvantage) { /* ... */ }

// Check if advantage/disadvantage is suppressed
if (tracker.advantageSuppressed) { /* ... */ }
if (tracker.disadvantageSuppressed) { /* ... */ }

// Check if override is active
if (tracker.hasOverride) { /* ... */ }

// Get final roll mode: ADV_MODE.ADVANTAGE (1), ADV_MODE.NORMAL (0), ADV_MODE.DISADVANTAGE (-1)
const mode = tracker.mode;
```

### Processing Keyboard Input

The `processKeys` method handles dnd5e keyboard shortcuts for advantage/disadvantage:

```javascript
// Process keyboard shortcuts from config.event
// - Ctrl = advantage
// - Alt = disadvantage
// - Shift = skip dialog
// - Shift+Ctrl+Alt = force normal roll
tracker.processKeys(config);
```

### Attribution

```javascript
// Get structured attribution map
const attribution = tracker.attribution;
// Returns: { ADV: { "flanking": "Flanking" }, DIS: { "nearbyFoe": "Nearby foe" } }

// Get legacy Set format (for backward compatibility)
const legacySet = tracker.legacyAttribution;
// Returns Set: ["ADV:flanking", "DIS:nearbyFoe", ...]

// Add attribution directly
tracker.addAttribution("ADV", "source", "Display Name");
tracker.addAttribution("FAIL", "paralyzed", "Paralyzed");
```

### Reset

```javascript
// Reset all state to initial values
tracker.reset();

// Reset with new legacy attribution Sets
tracker.reset({
  legacyAttribution: workflow.attackAdvAttribution,
  advReminderAttribution: workflow.advReminderAttackAdvAttribution
});
```

## Attribution Types

| Type | Description |
|------|-------------|
| `ADV` | Source of advantage |
| `DIS` | Source of disadvantage |
| `NOADV` | Source that suppresses advantage |
| `NODIS` | Source that suppresses disadvantage |
| `CRIT` | Source of critical hit |
| `NOCRIT` | Source that prevents critical |
| `FUMBLE` | Source of fumble |
| `NOFUMBLE` | Source that prevents fumble |
| `SUCCESS` | Source of auto-success |
| `FAIL` | Source of auto-fail |
| `MIN` | Minimum roll value |
| `MAX` | Maximum roll value |

## Example: Custom Advantage Check in a Macro

```javascript
// In an OnUse macro, add advantage based on custom condition
const workflow = MidiQOL.Workflow.getWorkflow(args[0].uuid);
const tracker = workflow.attackRollModifierTracker;

// Check if target is prone and attacker is within 5ft
const target = workflow.targets.first();
if (MidiQOL.hasCondition(target.actor, "prone")) {
  const distance = MidiQOL.computeDistance(workflow.token, target);
  if (distance <= 5) {
    tracker.addAdvantage("prone", "Target is Prone");
  } else {
    tracker.addDisadvantage("prone", "Target is Prone (ranged)");
  }
}
```

## Example: Checking Final Roll Mode

```javascript
// After all advantage/disadvantage sources are evaluated
const workflow = MidiQOL.Workflow.getWorkflow(messageUuid);
const mode = workflow.attackRollModifierTracker.mode;
const ADV_MODE = CONFIG.Dice.D20Roll.ADV_MODE;

if (mode === ADV_MODE.ADVANTAGE) {
  console.log("Rolling with advantage");
} else if (mode === ADV_MODE.DISADVANTAGE) {
  console.log("Rolling with disadvantage");
} else {
  console.log("Rolling normally");
}

// Get all sources that contributed
const attribution = workflow.attackRollModifierTracker.attribution;
console.log("Advantage sources:", attribution.ADV);
console.log("Disadvantage sources:", attribution.DIS);
```

## Related Functions

### computeAdvantageFlags

Evaluates actor flags and source actor grants flags, populating a tracker:

```javascript
import { computeAdvantageFlags } from "midi-qol";

const flags = {
  advantageFlags: ["advantage.all", "advantage.attack.all"],
  disadvantageFlags: ["disadvantage.all", "disadvantage.attack.all"],
  noAdvantageFlags: ["noAdvantage.attack.all"],
  noDisadvantageFlags: ["noDisadvantage.attack.all"],
  sourceAdvantageFlags: ["grants.advantage.attack.all"],
  sourceDisadvantageFlags: ["grants.disadvantage.attack.all"],
  systemRollModeFields: []
};

const tracker = await computeAdvantageFlags(actor, flags, { workflow }, existingTracker);
```

### applyRollModifiers

Evaluates auto-fail/success and min/max flags, applying them to roll config:

```javascript
import { applyRollModifiers } from "midi-qol";

const flags = {
  failFlags: ["fail.all", "fail.attack.all"],
  successFlags: ["success.all", "success.attack.all"],
  maxFlags: ["max.attack.all"],
  minFlags: ["min.attack.all"]
};

const result = applyRollModifiers(actor, flags, config, dialog, { workflow, tracker });
// result: { autoFail: boolean, autoSuccess: boolean, max: number, min: number }
```
