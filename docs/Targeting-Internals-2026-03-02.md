# midi-qol Targeting Internals

How midi-qol resolves "who is targeted?" for every activity use, and how the various options interact.

## Overview

Targeting in midi-qol happens across three stages:

1. **Pre-template targeting** (`setupTargets`) — runs during `activity.use()`, before any AoE template is placed.
2. **Template placement** — dnd5e places the template on the canvas and auto-targets tokens inside it.
3. **Post-template targeting** (`WorkflowState_AoETargetConfirmation`) — runs after template placement, allows the user to adjust targets.

For non-template activities, only stage 1 matters. For template activities, stage 1 defers to stages 2–3.

## Stage 1: `setupTargets` (MidiActivityMixin.ts)

This runs inside `activity.use()` and is the primary targeting entry point.

### Flow

`setupTargets` has three mutually exclusive paths depending on whether `targetsToUse` was provided and whether target confirmation is needed:

```
1. If targetsToUse is provided (non-empty Set, not AoE):
   → Pre-populate game.user.targets from targetsToUse (for confirmation dialog display)

2. If requiresTargetConfirmation() or enforceSingleWeaponTarget:
   → Show preTemplateTargets confirmation dialog
   → If user cancels → abort
   → Read user's final selection from game.user.targets into workflow.targets
   (This path handles both targetsToUse + confirmation AND no-targetsToUse + confirmation)

3. Else if targetsToUse was provided (no confirmation needed):
   → Set workflow.targets directly from the targetsToUse Set
   (Bypasses game.user.targets read-back — avoids race condition)

4. Else (no targetsToUse, no confirmation):
   a. Determine selfTarget:
      → true if activity.target.affects.type === "self"
      → true if item.type === "tool" and no target type set
   b. If not selfTarget:
      → workflow.targets = game.user.targets (filtered by validTargetTokens)
   c. If selfTarget:
      → Set targetConfirmation to "none"
      → workflow.targets = { getOrCreateTokenForActor(this.actor) }

5. Filter out untargetable tokens, sync game.user.targets
```

### Key design points

**`targetsToUse` takes priority over self-target logic.** When `targetsToUse` is provided, the caller explicitly specified which tokens to target (e.g., OverTime targets the effect bearer, which may differ from `this.actor` when the item was created with a different parent).

**Race condition avoidance.** When no confirmation dialog is needed, `workflow.targets` is set directly from the `targetsToUse` Set rather than round-tripping through `game.user.targets`. This prevents a race condition where concurrent effects (e.g., Storm of Vengeance processing alongside Regenerate's OverTime) could overwrite `game.user.targets` between the write and read-back. When confirmation IS needed, reading from `game.user.targets` after the dialog is correct because the user just interacted with it.

**`targetsToUse` + confirmation coexist.** When both `targetsToUse` and `targetConfirmation: "always"` are set, `game.user.targets` is pre-populated from `targetsToUse` so the confirmation dialog shows the right initial selection, then the user's final choice is read back. This supports use cases like Storm of Vengeance's lightning activity where a macro pre-selects targets from a template but the user should be able to narrow the selection.

## Stage 3: `WorkflowState_AoETargetConfirmation` (Workflow.ts)

Runs after template placement. Delegates entirely to `postTemplateConfirmTargets()`, which uses `requiresTargetConfirmation()` as the sole gate for whether to show the confirmation dialog.

After confirmation, enforces target count limits for scaled activities.

## The `requiresTargetConfirmation` decision function

**File**: `activityHelpers.ts`

This is the single source of truth for "should we show a target confirmation dialog?" Both the pre-template and post-template paths use it.

### Priority order (first match wins)

| Priority | Condition | Result |
|----------|-----------|--------|
| 1 | `workflowOptions.targetConfirmation === "none"` or `"never"` | **No** |
| 2 | `workflowOptions.targetConfirmation === "always"` | **Yes** |
| 3 | Activity type is `enchant` or `summon` | **No** |
| 4 | `affects.choice` is true (player picks from available targets) | **Yes** |
| 5 | Target type is self/empty AND range is self/empty | **No** |
| 6 | Target type is `"self"` | **No** |
| 7 | `attackPerTarget` is true | **No** |
| 8 | `forcedTargetConfirmation` or `midiProperties.confirmTargets` is `"always"` | **Yes** |
| 9 | `forcedTargetConfirmation` or `midiProperties.confirmTargets` is `"never"` | **No** |
| 10 | Global `targetConfirmation.*` settings (see below) | Varies |
| 11 | None of the above matched | **No** |

### `workflowOptions.targetConfirmation` values

Highest priority override, typically set programmatically:

- `"always"` — force show confirmation dialog
- `"none"` / `"never"` — suppress confirmation dialog
- `undefined` / not set — fall through to other checks

### `forcedTargetConfirmation` getter

Activity-type override that cannot be changed by users:

- Base `MidiActivityMixin`: returns `undefined` (no override)
- `CastActivity`: returns `"never"` (cast activities delegate targeting to the spell's own activities)
- `ForwardActivity`: returns `"never"` (forward activities delegate to their target activity)

### `midiProperties.confirmTargets`

Per-activity setting configurable in the activity sheet:

- `"always"` — always show confirmation
- `"never"` — never show confirmation
- `"default"` — fall through to global settings

### Global `targetConfirmation` settings

The `configSettings.targetConfirmation` object has boolean flags that trigger confirmation for specific situations:

| Setting | Triggers when |
|---------|--------------|
| `enabled` | Master switch — all settings below require this to be true |
| `always` | Always (when target type is not "self") |
| `hasAttack` | Activity has an attack roll |
| `hasCreatureTarget` | Target type is "creature" |
| `noneTargeted` | No targets are selected and activity expects targets |
| `allies` | Any target has the same disposition as the attacker |
| `targetSelf` | The user's own token is among the targets |
| `mixedDisposition` | Targets include tokens of different dispositions |
| `longRange` | Any target is at long range or beyond normal range |
| `inCover` | Any target has cover |
| `hasAoE` | Activity has an AoE template |
| `hasRangedAoE` | Activity is range-targeted (ft/m range, creature/ally/enemy type) |

## Pre-template vs Post-template confirmation

The `preTemplateTargets` function decides whether to show confirmation now or defer:

- If the activity **requires post-template confirmation** (has a template type, or has scaled target count) → return true immediately (defer to post-template)
- Otherwise, if `requiresTargetConfirmation()` → show dialog now
- Otherwise → return true (no confirmation needed)

The `postTemplateConfirmTargets` function runs at the AoE confirmation stage (`WorkflowState_AoETargetConfirmation`):

- Only shows the confirmation dialog if **both** `activityRequiresPostTemplateConfirmation(activity)` **and** `requiresTargetConfirmation()` are true
- This prevents double-prompting: if `preTemplateTargets` already showed the dialog (because the activity doesn't need post-template confirmation), `postTemplateConfirmTargets` will not show it again
- If no confirmation is needed → just syncs workflow targets from `game.user.targets`

## How `completeActivityUse` / `completeItemUse` handle targeting

**File**: `utils.ts`

### Target resolution in `completeActivityUse`

```
1. Build targetsToUse Set from:
   - usage.midiOptions.targetsToUse (must be a Set of Tokens)
   - usage.midiOptions.targetUuids (array of UUID strings)
   These are merged (union).

2. Save the user's current targets (localSavedTargetIds).

3. If ignoreUserTargets → clear game.user.targets

4. If targetsToUse is empty AND activity target is "self":
   → Set targetsToUse to the item's actor token
   → Set game.user.targets to that token

5. Else if targetsToUse is empty AND NOT ignoreUserTargets:
   → Use current game.user.targets as targetsToUse

6. Set usage.midiOptions.targetsToUse = targetsToUse

7. Call activity.use() → setupTargets runs

8. On completion (via hook), restore localSavedTargetIds
```

### `completeItemUse`

Resolves which activity to use on the item, then delegates to `completeActivityUse`:

- If `activityId` or `activityIdentifier` specified → use that activity
- If item has one non-rider, non-automationOnly activity → use it
- If multiple → show `MidiActivityChoiceDialog`

## Relevant `midiOptions` fields

| Field | Type | Description |
|-------|------|-------------|
| `targetsToUse` | `Set<Token>` | Explicit target tokens; takes priority over user selection |
| `targetUuids` | `string[]` | Target token UUIDs; merged into `targetsToUse` |
| `ignoreUserTargets` | `boolean` | Clear `game.user.targets` before resolving |
| `workflowOptions.targetConfirmation` | `string` | `"always"`, `"none"/"never"`, or unset |

## OverTime targeting

### String-based OverTime (`flags.midi-qol.OverTime`)

Processed by `gmOverTimeEffect` in utils.ts.

1. Creates a synthetic item with `target.affects.type = "self"` via `buildOvertimeItemData`
2. Creates a damage activity with no explicit target (inherits "self" from item)
3. Calls `completeItemUse` with:
   - `targetsToUse: new Set([theTargetToken])` — the token of the actor bearing the effect
   - `ignoreUserTargets: true` — clears user's current targets
   - `workflowOptions: { targetConfirmation: "none" }` — no confirmation dialog

The `targetsToUse` is critical here because when `rollAs` is specified (the origin/source actor rolls instead of the effect bearer), `this.actor` on the item would be the origin actor, not the effect bearer. The explicit `targetsToUse` ensures the correct token is targeted regardless.

### Activity-based OverTime (`flags.midi-qol.ActivityOverTime`)

Processed by `localActivityOverTimeEffect` in utils.ts.

1. Creates a clone of the origin item, parented to the rolling actor
2. Finds the matching activity on the cloned item
3. Calls `completeActivityUse` with:
   - `targetsToUse: new Set([token])` — the token of the actor bearing the effect
   - No `ignoreUserTargets` (defaults to false)
   - `workflowOptions: { noProvokeReaction: true, autoConsumeResource: "both" }`

## `enforceSingleWeaponTarget`

A global setting (`configSettings.enforceSingleWeaponTarget`) that forces the target confirmation dialog for weapon attacks that target a single creature. Used in `setupTargets` alongside `requiresTargetConfirmation`.

The `shouldEnforceSingleTarget` helper determines applicability:
- Only applies to attack activities
- Skips emanation/AoE activities
- Skips activities with an explicit target count
- Only applies to creature-like target types

## Workflow types and targeting

| Workflow | Targeting behavior |
|----------|-------------------|
| `Workflow` (base) | Full targeting flow: setupTargets → AoETargetConfirmation |
| `SavesFirstWorkflow` | Same as base |
| `ActiveDefenceWorkflow` | Same as base |
| `UserWorkflow` | Same as base |
| `TrapWorkflow` | Sets targets from constructor, uses `activity.use()` normal flow |
| `DamageOnlyWorkflow` | Bypasses setupTargets entirely; targets set by caller |
| `DummyWorkflow` | Bypasses setupTargets entirely |
