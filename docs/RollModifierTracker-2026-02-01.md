# RollModifierTracker

*Last updated: 2026-02-01*

Centralized tracking of roll modifiers — advantage, disadvantage, critical, fumble, auto-fail/success, min/max — with attribution for tooltip display. Exported via `MidiQOL.RollModifierTracker`.

**Source:** `src/module/lib/RollModifierTracker.ts`

---

## Architecture

```
RollModifierTracker
├── advantage      (AdvantageDisadvantageTracker)
├── disadvantage   (AdvantageDisadvantageTracker)
├── critical       (CriticalFumbleTracker)
├── fumble         (CriticalFumbleTracker)
└── modifiers      (RollValueTracker)
```

Each sub-tracker maintains its own state and delegates attribution to the parent `RollModifierTracker`. All mutation methods accept `source` and `displayName` parameters for attribution tracking.

---

## Sub-Trackers

### AdvantageDisadvantageTracker

Tracks a single advantage or disadvantage state. Created as a pair — one for advantage (`ADV`), one for disadvantage (`DIS`).

**State model:**

| State | Description |
|-------|-------------|
| `active` | At least one source added advantage/disadvantage |
| `suppressed` | A `noAdvantage`/`noDisadvantage` flag blocks it |
| `override` | Forced on via keyboard or direct assignment, bypasses suppression |

**Resolution (`isActive`):** Returns `true` if override is set, OR if active and not suppressed. Returns `undefined` otherwise. The `true | undefined` return type (rather than boolean) allows `hasAdvantage` to be falsy when there's no advantage, matching dnd5e's roll config expectations.

**Methods:**

| Method | Description |
|--------|-------------|
| `add(source?, displayName?)` | Add a source. Records `ADV`/`DIS` attribution |
| `suppress(source?, displayName?)` | Suppress this modifier. Records `NOADV`/`NODIS` attribution |
| `setOverride(source?, displayName?)` | Force active, bypassing suppression |
| `clearOverride()` | Remove override |
| `clear()` | Clear active state (preserves suppression) |
| `reset()` | Reset all state |

**Query properties:**

| Property | Type | Description |
|----------|------|-------------|
| `isAdded` | `boolean` | Whether any source was added |
| `isSuppressed` | `boolean` | Whether suppressed |
| `hasOverride` | `boolean` | Whether override is set |
| `isActive` | `true \| undefined` | Computed final state |
| `get` | `Readonly<{...}>` | Complete state snapshot for serialization |

### CriticalFumbleTracker

Tracks critical hit or fumble state. Distinguishes between natural (dice roll), forced (flag), and suppressed states.

**State model:**

| State | Description |
|-------|-------------|
| `natural` | Natural 20/1 from the dice roll |
| `forced` | Forced by actor flag (`critical.all`, `fumble.mwak`, etc.) or target grants flag |
| `suppressed` | Blocked by `noCritical`/`noFumble` or target `grants.noCritical`/`grants.noFumble` |
| `override` | Absolute control — `true` forces, `false` prevents. Bypasses all other state |

**Resolution (`isActive`):** Priority order: override > suppressed > (natural || forced). If override is set, its boolean value is returned directly. If suppressed, returns false regardless of natural/forced. Otherwise returns `natural || forced`.

**Methods:**

| Method | Description |
|--------|-------------|
| `setNatural(source, displayName?)` | Set from dice roll (nat 20/1). Records `CRIT`/`FUMBLE` attribution |
| `force(source, displayName?)` | Force from a flag. Records `CRIT`/`FUMBLE` attribution |
| `suppress(source, displayName?)` | Prevent crit/fumble. Records `NOCRIT`/`NOFUMBLE` attribution |
| `setOverride(value, source, displayName?)` | Absolute control. `true` = force, `false` = prevent |
| `clearOverride()` | Remove override |
| `reset()` | Reset all state |

**Query properties:**

| Property | Type | Description |
|----------|------|-------------|
| `isNatural` | `boolean` | From dice roll |
| `isForced` | `boolean` | Forced by flag |
| `isSuppressed` | `boolean` | Prevented by flag |
| `hasOverride` | `boolean` | Override is set |
| `overrideValue` | `boolean \| undefined` | Override value |
| `isActive` | `boolean` | Computed final state |
| `get` | `Readonly<{...}>` | Complete state snapshot for serialization |

**Actor vs target flags:**

The tracker is populated from two sources, handled by separate helper functions:

- `computeCriticalModifiers(actor, flags, tracker)` — evaluates the attacker's own `critical.*`, `noCritical.*`, `fumble.*`, `noFumble.*` flags
- `computeTargetCriticalModifiers(targetActor, targetName, flags, tracker)` — evaluates the target's `grants.critical.*`, `grants.noCritical.*`, `grants.fumble.*`, `grants.noFumble.*` flags. Attribution includes the target name in parentheses, e.g., "Target Paralyzed (Orc1)"

For multi-target attacks:
- **Critical:** If ANY target has `grants.critical`, the attack is critical
- **No Critical:** ALL targets must have `grants.noCritical` to prevent a critical
- **Fumble/No Fumble:** Same logic as critical

### RollValueTracker

Tracks auto-fail, auto-success, and min/max d20 roll constraints.

**Methods:**

| Method | Description |
|--------|-------------|
| `fail(source, displayName?)` | Set auto-fail. Records `FAIL` attribution |
| `succeed(source, displayName?)` | Set auto-success. Records `SUCCESS` attribution |
| `min(value, source, displayName?)` | Set minimum (only applied if higher than current) |
| `max(value, source, displayName?)` | Set maximum (only applied if lower than current) |
| `forceMin(value, source, displayName?)` | Force minimum, ignoring current value |
| `forceMax(value, source, displayName?)` | Force maximum, ignoring current value |
| `reset()` | Reset all state |

**Query properties:**

| Property | Type | Description |
|----------|------|-------------|
| `willFail` | `boolean` | Auto-fail is set |
| `willSucceed` | `boolean` | Auto-success is set |
| `minValue` | `number` | Minimum roll value (`-Infinity` if unset) |
| `maxValue` | `number` | Maximum roll value (`Infinity` if unset) |
| `hasMin` | `boolean` | Whether a minimum is set |
| `hasMax` | `boolean` | Whether a maximum is set |
| `get` | `Readonly<{...}>` | Complete state snapshot for serialization |

---

## RollModifierTracker (Top-Level)

Aggregates the five sub-trackers and maintains a shared attribution map.

### Convenience Getters

| Property | Type | Delegates To |
|----------|------|-------------|
| `hasAdvantage` | `true \| undefined` | `advantage.isActive` |
| `hasDisadvantage` | `true \| undefined` | `disadvantage.isActive` |
| `isCritical` | `boolean` | `critical.isActive` |
| `isFumble` | `boolean` | `fumble.isActive` |

### Advantage Mode

`advantageMode` computes the combined d20 roll mode from the advantage and disadvantage sub-trackers:

| Condition | Result |
|-----------|--------|
| Advantage override only | `ADV_MODE.ADVANTAGE` |
| Disadvantage override only | `ADV_MODE.DISADVANTAGE` |
| Both overrides | `ADV_MODE.NORMAL` (cancel out) |
| Advantage active, no disadvantage | `ADV_MODE.ADVANTAGE` |
| Disadvantage active, no advantage | `ADV_MODE.DISADVANTAGE` |
| Both active or neither | `ADV_MODE.NORMAL` |

### Attribution

All sub-tracker mutations automatically record attribution entries in a shared map.

**Attribution types:**

| Type | Meaning | Recorded By |
|------|---------|-------------|
| `ADV` | Advantage source | `advantage.add()`, `advantage.setOverride()` |
| `DIS` | Disadvantage source | `disadvantage.add()`, `disadvantage.setOverride()` |
| `NOADV` | Advantage suppression | `advantage.suppress()` |
| `NODIS` | Disadvantage suppression | `disadvantage.suppress()` |
| `CRIT` | Critical hit source | `critical.setNatural()`, `critical.force()`, `critical.setOverride(true)` |
| `NOCRIT` | Critical prevention | `critical.suppress()`, `critical.setOverride(false)` |
| `FUMBLE` | Fumble source | `fumble.setNatural()`, `fumble.force()`, `fumble.setOverride(true)` |
| `NOFUMBLE` | Fumble prevention | `fumble.suppress()`, `fumble.setOverride(false)` |
| `FAIL` | Auto-fail | `modifiers.fail()` |
| `SUCCESS` | Auto-success | `modifiers.succeed()` |
| `MIN` | Minimum roll | `modifiers.min()`, `modifiers.forceMin()` |
| `MAX` | Maximum roll | `modifiers.max()`, `modifiers.forceMax()` |

**Attribution access:**

| Property/Method | Description |
|-----------------|-------------|
| `addAttribution(type, source, displayName)` | Add an attribution entry directly |
| `attribution` | Structured map: `{ ADV: { "flanking": "Flanking" }, CRIT: { "paralyzed": "Target Paralyzed (Orc1)" } }` |
| `legacyAttribution` | `Set<string>` format: `"ADV:flanking"` (for backwards compatibility) |
| `advReminderAttribution` | `Set<string>` format for adv-reminder module integration |

**Display:** Attribution is rendered as a tooltip in the chat card. For attack rolls, hovering the info icon next to "Advantage"/"Disadvantage" shows all sources. For saves, hovering a target's name shows save attribution. The tooltip uses `templates/attribution-tooltip.html` with localized type labels (e.g., "Advantage", "No Critical", "Auto-Fail").

### Keyboard Processing

`processKeys(config)` handles dnd5e keyboard shortcuts:

| Keys | Effect |
|------|--------|
| Alt | Add advantage (stacks with flags) |
| Ctrl | Add disadvantage (stacks with flags) |
| Shift+Alt | Override advantage (ignores flags) |
| Shift+Ctrl | Override disadvantage (ignores flags) |
| Shift+Alt+Ctrl | Force normal roll (override both to cancel) |

### Serialization

| Method | Description |
|--------|-------------|
| `toJSON()` | Serialize all sub-tracker states and attribution maps to a plain object |
| `restore(data)` | Restore all state from serialized data |
| `reset()` | Reset all sub-trackers and clear attribution |

Serialized form includes: `advantage`, `disadvantage`, `critical`, `fumble`, `modifiers` (each sub-tracker's `.get` snapshot), plus `attribution`, `legacyAttribution`, `advReminderAttribution`.

---

## Helper Functions

These functions populate a tracker from Active Effect flags. They handle async condition evaluation and attribution.

### `computeAdvantageFlags(actor, flags, options, tracker?)`

Evaluates advantage/disadvantage flags on the actor and optional source actor (caster/attacker for grants flags).

```typescript
async function computeAdvantageFlags(
  actor: Actor.Implementation,
  flags: AdvantageFlags,
  options: MidiOptions,
  tracker?: RollModifierTracker
): Promise<RollModifierTracker>
```

The `AdvantageFlags` interface specifies which flag paths to check:

```typescript
interface AdvantageFlags {
  advantageFlags: string[];           // Actor flags granting advantage
  disadvantageFlags: string[];        // Actor flags granting disadvantage
  systemRollModeFields: string[];     // dnd5e system fields (e.g., "attributes.death.roll.mode")
  noAdvantageFlags?: string[];        // Actor flags suppressing advantage
  noDisadvantageFlags?: string[];     // Actor flags suppressing disadvantage
  sourceAdvantageFlags?: string[];    // Source actor grants flags for advantage
  sourceDisadvantageFlags?: string[]; // Source actor grants flags for disadvantage
  sourceNoAdvantageFlags?: string[];  // Source actor grants flags suppressing advantage
  sourceNoDisadvantageFlags?: string[];// Source actor grants flags suppressing disadvantage
  deprecatedFlags?: Set<string>;      // Flags that trigger deprecation warnings
}
```

Used by: `doRollAbility`, `doRollSkill`, `rollToolCheck`, `rollDeathSave` in patching.ts, and attack roll processing.

### `computeRollModifiers(actor, flags, tracker, options?)`

Evaluates auto-fail/success and min/max flags synchronously.

```typescript
function computeRollModifiers(
  actor: Actor.Implementation,
  flags: RollModifierFlags,
  tracker: RollModifierTracker,
  options?: { workflow?: any }
): void
```

### `applyRollModifiers(tracker, config, dialog, options?)`

Applies the tracker's roll value modifiers to a roll configuration. Call after `computeRollModifiers`.

```typescript
function applyRollModifiers(
  tracker: RollModifierTracker,
  config: RollProcessConfig,
  dialog: RollDialogConfig,
  options?: { failValue?: number, successValue?: number }
): RollModifierResult
```

Returns `{ autoFail, autoSuccess, max, min }`. When auto-fail or auto-success is set, `dialog.configure` is forced to `false` (skip dialog) and the roll's minimum/maximum is set to force the result.

### `computeCriticalModifiers(actor, flags, tracker, options?)`

Evaluates actor-side critical/fumble flags asynchronously.

```typescript
async function computeCriticalModifiers(
  actor: Actor.Implementation,
  flags: CriticalModifierFlags,
  tracker: RollModifierTracker,
  options?: { workflow?: any, actionType?: string }
): Promise<void>
```

### `computeTargetCriticalModifiers(targetActor, targetName, flags, tracker, options?)`

Evaluates target grants critical/fumble flags. Attribution includes the target name.

```typescript
async function computeTargetCriticalModifiers(
  targetActor: Actor.Implementation,
  targetName: string,
  flags: CriticalModifierFlags,
  tracker: RollModifierTracker,
  options?: { workflow?: any, sourceActor?: Actor.Implementation }
): Promise<void>
```

### `getFlagDisplayName(flag)`

Resolves a midi-qol flag path to a human-readable display name for attribution. Uses a four-tier resolution strategy:

1. **DAE localizationMap** — covers ~95% of template-generated flags
2. **Exact i18n key** — `midi-qol.flagTemplate.{flag}.name`
3. **Prefix template + resolved label** — splits on last `.`, resolves the suffix via ability/skill/action type labels
4. **Raw flag path** — fallback

---

## Workflow Integration

### Attack Rolls

The workflow owns a single `attackRollModifierTracker` (aliased as `tracker`):

```typescript
workflow.attackRollModifierTracker  // Full tracker
workflow.tracker                    // Alias for the above
```

**Lifecycle during an attack:**

1. `checkAttackAdvantage()` — first call, evaluates all flags and populates tracker
2. `preAttackRoll` hook fires — for modifying actor flags before recomputation (direct tracker changes will be overwritten)
3. `checkAttackAdvantage()` — **second call, resets tracker and recomputes** from current flags
4. `tracker.processKeys(config)` — processes keyboard shortcuts
5. `preAttackRollConfig` hook/macro fires — for direct tracker manipulation (changes are preserved)
6. Tracker state applied to roll config (`config.advantage`, `config.disadvantage`)
7. Roll executes
8. Natural 20/1 detection → `tracker.critical.setNatural()` / `tracker.fumble.setNatural()`
9. Attribution written to roll via `addAttribution(roll, workflow.attackAttribution)`
10. Tracker serialized via `persistAttackTracker()` → stored in chat card flags as `attackRollModifierTrackerData`

`checkAttackAdvantage()` internally calls `checkTargetAdvantage()`, `computeCriticalModifiers()`, `computeTargetCriticalModifiers()`, and `computeRollModifiers()`. The tracker is fully reset at the start of each call.

**Restoration:** On workflow reload from chat card, `attackRollModifierTracker` getter lazily restores from `midiFlags.attackRollModifierTrackerData` via `tracker.restore()`.

### Saving Throws

Each target's save gets its own `RollModifierTracker` instance, passed via `saveDetails`:

```typescript
saveDetails.modifierTracker  // Per-target tracker
```

The tracker is populated in `doRollAbility` / `doRollSkill` via `computeAdvantageFlags`, and the attribution is stored in `saveDisplayData` for tooltip rendering on the save card.

### Backwards Compatibility

Workflow getters/setters delegate to the tracker:

```typescript
workflow.advantage      // → tracker.advantage.isAdded (getter), tracker.advantage.add() (setter)
workflow.disadvantage   // → tracker.disadvantage.isAdded (getter), tracker.disadvantage.add() (setter)
workflow.noAdvantage    // → tracker.advantage.isSuppressed
workflow.noDisadvantage // → tracker.disadvantage.isSuppressed
workflow.isCritical     // → tracker.critical.isActive (getter), tracker.critical.setOverride() (setter)
workflow.isFumble       // → tracker.fumble.isActive (getter), tracker.fumble.setOverride() (setter)
```

---

## Hooks and Macro Passes

### Attack Roll Hooks

| Hook | When | Use For |
|------|------|---------|
| `midi-qol.preAttackRoll` | Before second `checkAttackAdvantage()` recomputation | Modifying actor flags (tracker is reset after this hook) |
| `midi-qol.preAttackRollConfig` | After all flag evaluation and keyboard processing | Direct tracker manipulation (changes are preserved) |
| `midi-qol.postAttackRoll` | After roll completes, after natural crit/fumble detection | Reading final state |

**Important:** Do not modify the tracker directly in `preAttackRoll` — `checkAttackAdvantage()` is called again after this hook and resets the tracker. Instead, modify actor flags in `preAttackRoll` (they will be picked up by the recomputation), or use `preAttackRollConfig` for direct tracker changes.

### Save Roll Hooks

| Hook | When | Tracker Access |
|------|------|----------------|
| `midi-qol.preTargetSave` | Before each target's save roll | `saveDetails.tracker` |

### Examples

**Modify tracker directly (use `preAttackRollConfig`):**

```javascript
Hooks.on("midi-qol.preAttackRollConfig", (workflow) => {
  const target = workflow.targets.first();
  if (target?.actor?.statuses?.has("prone")) {
    workflow.tracker.advantage.add("prone", "Target is Prone");
  }
  return true;
});
```

**Force critical on paralyzed target within 5 feet:**

```javascript
Hooks.on("midi-qol.preAttackRollConfig", (workflow) => {
  const target = workflow.targets.first();
  if (target?.actor?.statuses?.has("paralyzed")) {
    const distance = MidiQOL.computeDistance(workflow.token, target);
    if (distance <= 5) {
      workflow.tracker.critical.force("paralyzed", "Target Paralyzed (within 5ft)");
    }
  }
  return true;
});
```

**Suppress fumble:**

```javascript
Hooks.on("midi-qol.preAttackRollConfig", (workflow) => {
  if (workflow.actor.getFlag("my-module", "reliable")) {
    workflow.tracker.fumble.suppress("reliable", "Reliable Talent");
  }
  return true;
});
```

**Modify flags before recomputation (use `preAttackRoll`):**

```javascript
// preAttackRoll is the right hook for flag changes that should be
// picked up by the subsequent checkAttackAdvantage() recomputation
Hooks.on("midi-qol.preAttackRoll", (workflow) => {
  // Set a flag that checkAttackAdvantage will evaluate
  if (someCondition) {
    workflow.actor.setFlag("midi-qol", "advantage.attack.all", true);
  }
  return true;
});
```

**Grant save advantage for a specific target:**

```javascript
Hooks.on("midi-qol.preTargetSave", (target, workflow, saveDetails) => {
  if (target.actor?.getFlag("my-module", "divineProtection")) {
    saveDetails.tracker.advantage.add("divineProtection", "Divine Protection");
  }
  return true;
});
```

**OnUse macro (preAttackRollConfig pass):**

```javascript
// In an OnUse macro at preAttackRollConfig pass
const tracker = workflow.tracker;
if (workflow.actor.getFlag("my-module", "superAim")) {
  tracker.advantage.add("superAim", "Super Aim");
}
```

**Check final state after attack:**

```javascript
Hooks.on("midi-qol.postAttackRoll", (workflow) => {
  const tracker = workflow.tracker;
  console.log("Advantage:", tracker.hasAdvantage);
  console.log("Disadvantage:", tracker.hasDisadvantage);
  console.log("Mode:", tracker.advantageMode);
  console.log("Is Critical:", tracker.isCritical);
  console.log("Is Fumble:", tracker.isFumble);
  console.log("Attribution:", tracker.attribution);
  // Attribution example output:
  // { ADV: { "flanking": "Flanking" }, CRIT: { "nat20": "Natural 20" } }
});
```
