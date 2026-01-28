# RollModifierTracker API

Tracks roll modifiers (advantage, disadvantage, critical, fumble, auto-fail/success, min/max) with attribution support. Exported via `MidiQOL.RollModifierTracker`.

## Architecture

The tracker uses **sub-trackers** for each modifier type:

```
RollModifierTracker
├── advantage      (AdvantageDisadvantageTracker)
├── disadvantage   (AdvantageDisadvantageTracker)
├── critical       (CriticalFumbleTracker)
├── fumble         (CriticalFumbleTracker)
└── modifiers      (RollValueTracker)
```

## Accessing the Tracker

```javascript
// From a workflow (most common)
const workflow = MidiQOL.Workflow.getWorkflow(messageUuid);
const tracker = workflow.attackRollModifierTracker;

// Create standalone instance
const tracker = new MidiQOL.RollModifierTracker();
```

## Sub-Tracker API

### AdvantageDisadvantageTracker (advantage/disadvantage)

**Mutation Methods:**
| Method | Description |
|--------|-------------|
| `add(source?, displayName?)` | Add a source of advantage/disadvantage |
| `clear()` | Clear active state (preserves suppression) |
| `suppress(source?, displayName?)` | Suppress this modifier |
| `setOverride(source?, displayName?)` | Force active, bypassing suppression |
| `clearOverride()` | Clear override state |
| `reset()` | Reset all state |

**Query Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `isAdded` | `boolean` | Whether at least one source was added |
| `isSuppressed` | `boolean` | Whether suppressed by a blocking flag |
| `hasOverride` | `boolean` | Whether override is set |
| `isActive` | `true \| undefined` | Computed final state |

### CriticalFumbleTracker (critical/fumble)

**Mutation Methods:**
| Method | Description |
|--------|-------------|
| `setNatural(source, displayName?)` | Set from dice roll |
| `force(source, displayName?)` | Force from a flag |
| `suppress(source, displayName?)` | Prevent critical/fumble |
| `setOverride(value, source, displayName?)` | Absolute control (true=force, false=prevent) |
| `clearOverride()` | Clear override state |
| `reset()` | Reset all state |

**Query Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `isNatural` | `boolean` | From dice roll |
| `isForced` | `boolean` | Forced by flag |
| `isSuppressed` | `boolean` | Prevented by flag |
| `hasOverride` | `boolean` | Override is set |
| `overrideValue` | `boolean \| undefined` | Override value |
| `isActive` | `boolean` | Computed final state (priority: override > suppressed > natural/forced) |

### RollValueTracker (modifiers)

**Mutation Methods:**
| Method | Description |
|--------|-------------|
| `fail(source, displayName?)` | Set auto-fail |
| `succeed(source, displayName?)` | Set auto-success |
| `min(value, source, displayName?)` | Set minimum (only if higher) |
| `max(value, source, displayName?)` | Set maximum (only if lower) |
| `forceMin(value, source, displayName?)` | Force minimum |
| `forceMax(value, source, displayName?)` | Force maximum |
| `reset()` | Reset all state |

**Query Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `willFail` | `boolean` | Auto-fail is set |
| `willSucceed` | `boolean` | Auto-success is set |
| `minValue` | `number` | Minimum roll value |
| `maxValue` | `number` | Maximum roll value |

## Top-Level RollModifierTracker

**Convenience Getters:**
| Property | Description |
|----------|-------------|
| `hasAdvantage` | `true \| undefined` - delegates to `advantage.isActive` |
| `hasDisadvantage` | `true \| undefined` - delegates to `disadvantage.isActive` |
| `isCritical` | `boolean` - delegates to `critical.isActive` |
| `isFumble` | `boolean` - delegates to `fumble.isActive` |
| `advantageMode` | Final mode: `ADV_MODE.ADVANTAGE`, `NORMAL`, or `DISADVANTAGE` |

**Attribution:**
| Property/Method | Description |
|-----------------|-------------|
| `addAttribution(type, source, displayName)` | Add attribution entry |
| `attribution` | Get structured map: `{ ADV: { source: displayName }, ... }` |
| `legacyAttribution` | Get Set format: `["ADV:source", ...]` |

**Other:**
| Method | Description |
|--------|-------------|
| `reset(options?)` | Reset all sub-trackers and attribution |
| `processKeys(config)` | Handle keyboard shortcuts (Ctrl=adv, Alt=dis) |

## For Macro & Hook Writers

### Attack Roll Tracker

The `attackRollModifierTracker` is available on the workflow. The earliest hook where it can be modified is `midi-qol.preAttackRoll`:

```javascript
Hooks.on("midi-qol.preAttackRoll", (workflow) => {
  const tracker = workflow.tracker;
  // Modify tracker state here
  return true; // Return false to cancel
});
```

### Save Roll Tracker

Each target's save has its own tracker, passed via `saveDetails` in the `midi-qol.preTargetSave` hook:

```javascript
Hooks.on("midi-qol.preTargetSave", (target, workflow, saveDetails) => {
  const tracker = saveDetails.tracker;
  // Modify save advantage/disadvantage for this target
  tracker.advantage.add("inspiration", "Divine Inspiration");
  return true;
});
```

### Relevant Hooks

| Hook | When | Tracker Access |
|------|------|----------------|
| `midi-qol.preAttackRoll` | Before attack roll | `workflow.tracker` |
| `midi-qol.preTargetSave` | Before each target's save | `saveDetails.tracker` |
| `midi-qol.preDamageRoll` | Before damage roll | `workflow.saveTracker` (for critical state) |

## Examples

### 1. Add Advantage in a Hook

```javascript
Hooks.on("midi-qol.preAttackRoll", (workflow) => {
  const target = workflow.targets.first();
  if (target?.actor?.statuses?.has("prone")) {
    workflow.attackRollModifierTracker.advantage.add("prone", "Target is Prone");
  }
  return true;
});
```

### 2. Suppress Disadvantage

```javascript
// Target grants no disadvantage to attackers
Hooks.on("midi-qol.preAttackRoll", (workflow) => {
  const target = workflow.targets.first();
  if (target?.actor?.getFlag("my-module", "noDisadvantageGranted")) {
    workflow.attackRollModifierTracker.advantage.suppress(
      "steadfast",
      "Steadfast Defense"
    );
  }
  return true;
});
```

### 3. Force Critical on Condition

```javascript
Hooks.on("midi-qol.preAttackRoll", (workflow) => {
  const target = workflow.targets.first();
  if (target?.actor?.statuses?.has("paralyzed")) {
    const distance = MidiQOL.computeDistance(workflow.token, target);
    if (distance <= 5) {
      workflow.attackRollModifierTracker.critical.force("paralyzed", "Target Paralyzed");
    }
  }
  return true;
});
```

### 4. Check Final State

```javascript
Hooks.on("midi-qol.postAttackRoll", (workflow) => {
  const tracker = workflow.tracker;

  console.log("Advantage:", tracker.hasAdvantage);
  console.log("Disadvantage:", tracker.hasDisadvantage);
  console.log("Mode:", tracker.advantageMode);
  console.log("Is Critical:", tracker.isCritical);
  console.log("Attribution:", tracker.attribution);
});
```

### 5. OnUse Macro Example

```javascript
// In an OnUse macro (preAttackRoll phase)
const tracker = workflow.tracker;

// Add advantage if attacker has special buff
if (workflow.actor.getFlag("my-module", "superAim")) {
  tracker.advantage.add("superAim", "Super Aim");
}

// Force no fumble
if (workflow.actor.getFlag("my-module", "reliable")) {
  tracker.fumble.suppress("reliable", "Reliable Talent");
}
```
