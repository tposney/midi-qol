# Multi-Template Auto-Targeting Accumulation

**Date**: 2026-02-04
**Version**: 13.0.39+

## Problem

Spells with `target.template.count > 1` (e.g., Eldritch Blast with multiple AoE zones) place multiple templates sequentially. Before this change, midi-qol only auto-selected targets for the **last** template placed because:

1. **`Hooks.once`** only fires for the first template's `preCreateMeasuredTemplate` / `createMeasuredTemplate`, so subsequent templates had no hooks registered.
2. **`templateTokens()` clears targets** via `updateUserTargets([])` before computing new targets, wiping previous template's targets.
3. **`selectTargets()` overwrites state** via `workflow.setTargets()` (replaces targets) and `workflow.templateUuid =` (overwrites the UUID).

## dnd5e Flow

dnd5e's `#placeTemplate()` method loops through templates:

```javascript
for (template of AbilityTemplate.fromActivity(this)) {
  await template.drawPreview();  // fires preCreate + create hooks sequentially
}
```

Each `drawPreview()` is awaited, so hooks fire **sequentially** — template 1 completes fully before template 2 starts. During preview, `templateTokens()` is called on each refresh, updating `game.user.targets` to reflect the current template position.

## Solution Design

### Core Idea

- Track an **array** of template UUIDs (`templateUuids[]`) and an expected count
- **Re-register** `Hooks.once` after each template fires (avoiding persistent `Hooks.on` which would catch unrelated templates)
- **Accumulate** targets in `workflow.targets` across templates instead of replacing
- Only **unsuspend/advance** the workflow after the **last** template is placed

## File Changes

### Workflow.ts

#### 1. Properties (line ~544)

Replaced the private `#templateUuid` field with three new properties:

```typescript
templateUuids: string[] = [];        // All template UUIDs placed during this workflow
expectedTemplateCount: number = 1;   // From activity.target.template.count
placedTemplateCount: number = 0;     // How many templates have been placed so far
```

#### 2. `templateUuid` getter/setter — backward compatibility (line ~549)

The `templateUuid` getter/setter now wraps the array:

```typescript
get templateUuid(): string {
  if (this.templateUuids.length > 0) return this.templateUuids[0];
  return this.midiFlags?.templateUuid ?? "";
}
set templateUuid(templateUuid: string) {
  if (templateUuid && !this.templateUuids.includes(templateUuid)) {
    this.templateUuids.push(templateUuid);
  }
  this.persistFields({ templateUuid, templateUuids: this.templateUuids });
}
```

The `template` getter, `template` setter, and `templateId` getter are unchanged — they use the first template UUID via `this.templateUuid`.

#### 3. `registerTemplateHooks()` — new method (line ~1800)

Extracted hook registration into a reusable method so it can be re-called after each template:

```typescript
registerTemplateHooks() {
  if (debugEnabled > 0) warn("registering for preCreateMeasuredTemplate, createMeasuredTemplate")
  this.preCreateTemplateHookId = Hooks.once("preCreateMeasuredTemplate", this.setTemplateFlags.bind(this));
  this.placeTemplateHookId = Hooks.once("createMeasuredTemplate", selectTargets.bind(this));
}
```

#### 4. `initializeWorkflow()` (line ~1774)

Sets `expectedTemplateCount` from the activity, resets counters, then calls `registerTemplateHooks()`:

```typescript
if (this.needTemplate && options.noTemplateHook !== true) {
  this.expectedTemplateCount = Number(this.activity?.target?.template?.count) || 1;
  this.placedTemplateCount = 0;
  this.templateUuids = [];
  this.registerTemplateHooks();
}
```

#### 5. `unSuspend()` (line ~2008)

Removed redundant `this.templateUuid = ...` and `setupTemplateCleanup()` calls — `selectTargets()` already handles both before calling `unSuspend`:

```typescript
if (context.templateDocument) {
  context.templateUuid = context.templateDocument.uuid;
  // templateUuids already populated by selectTargets
  this.needTemplate = false;
  if (!this.needItemCard) context.itemUseComplete = true;
  // Template cleanup already set up by selectTargets
}
```

#### 6. `WorkflowState_AwaitTemplate()` (line ~2270)

Changed condition from `this.templateUuid` (truthy check on single UUID) to checking the array against expected count:

```typescript
if (context.templateUuid || this.templateUuids.length >= this.expectedTemplateCount) {
  this.needTemplate = false;
  return this.WorkflowState_TemplatePlaced;
}
```

#### 7. `WorkflowState_Cleanup` — auto-remove instantaneous templates (line ~3256)

Iterates all `templateUuids` to delete each template:

```typescript
if (configSettings.autoRemoveInstantaneousTemplate && this.templateUuids.length > 0
    && this.activity.duration?.units === "inst") {
  for (const tUuid of this.templateUuids) {
    // ... same timeout logic per template, accounting for animations ...
    setTimeout(() => {
      const templateToDelete = fromUuidSync(tUuid) as MeasuredTemplateDocument || null;
      templateToDelete?.delete();
    }, timeout);
  }
}
```

#### 8. `WorkflowState_Abort()` (line ~3389)

Iterates all `templateUuids` to delete all placed templates on abort:

```typescript
for (const tUuid of this.templateUuids) {
  const templateToDelete = await fromUuid(tUuid) as MeasuredTemplateDocument | undefined;
  if (templateToDelete) await templateToDelete.delete();
}
```

The `Hooks.off` calls (lines 3379-3381) are unchanged — `placeTemplateHookId` and `preCreateTemplateHookId` hold the last registered hook ID, which is correct since earlier ones already fired.

#### 9. `getMacroData()` (line ~4358)

Exposes both for backward compatibility:

```typescript
templateId: this.templateId,       // deprecated
templateUuid: this.templateUuid,   // first template UUID (backward compat)
templateUuids: this.templateUuids, // all template UUIDs
```

#### 10. `MidiMacroData` type (line ~8932)

Added `templateUuids`:

```typescript
templateUuids?: string[];
```

### activityHelpers.ts — `selectTargets()`

This is where the main multi-template logic lives. The function is bound to a Workflow via `Hooks.once("createMeasuredTemplate", selectTargets.bind(this))`.

#### Target accumulation (line ~536)

Placed **outside** the targeting block so it always runs for every template — the targeting block (`if (game.user?.targets.size === 0 || ...)`) is skipped when the template preview has already set `game.user.targets`, which is the common case.

Uses `placedTemplateCount` to decide the strategy: first template replaces (clearing pre-cast targets), subsequent templates accumulate:

```typescript
if (workflow) {
  if (workflow.placedTemplateCount === 0) {
    workflow.setTargets(new Set(game.user?.targets ?? []));
  } else {
    workflow.setTargets(new Set([...workflow.targets, ...(game.user?.targets ?? [])]));
  }
}
```

#### Template UUID tracking (line ~547)

Uses the `templateUuid` setter (which pushes to the array and calls `persistFields`), increments counter, and sets up concentration cleanup per template:

```typescript
if (workflow) {
  workflow.templateUuid = templateDocument?.uuid;
  workflow.placedTemplateCount++;
  workflow.setupTemplateCleanup(templateDocument);
}
```

#### Hook re-registration vs unsuspend (line ~569)

After the filter loop, checks whether more templates are expected:

```typescript
if (workflow?.needTemplate) {
  if (workflow.placedTemplateCount < workflow.expectedTemplateCount) {
    // More templates expected — re-register hooks for the next one
    workflow.registerTemplateHooks();
  } else {
    // All templates placed — finalize
    workflow.needTemplate = false;
    if (workflow.expectedTemplateCount > 1) {
      // Multi-template: sync game.user.targets from the accumulated workflow.targets
      const allIds = Array.from(workflow.targets).map(t => t.id).filter(Boolean);
      updateUserTargets(allIds as string[]);
    }
    if (workflow.suspended && workflow.currentAction === workflow.WorkflowState_AwaitTemplate)
      workflow.unSuspend.bind(workflow)({ templateDocument });
  }
}
```

- If more templates expected: calls `workflow.registerTemplateHooks()` to set up `Hooks.once` for the next template. The workflow stays suspended.
- If all templates placed: sets `needTemplate = false`, syncs `game.user.targets` to show ALL accumulated targets (multi-template only), then unsuspends the workflow.

### undo.ts

#### `UndoDataDirect` interface (line ~28)

```typescript
templateUuids?: string[];
```

#### `saveUndoData()` initialization (line ~82)

```typescript
templateUuids: [],
```

#### `saveTargetsUndoData()` (line ~162)

Pushes all template UUIDs to undo data:

```typescript
for (const tUuid of workflow.templateUuids) {
  if (tUuid) workflow.undoData.templateUuids.push(tUuid);
}
```

#### `undoWorkflow()` (line ~471)

Deletes all templates when undoing:

```typescript
for (let templateUuid of undoData.templateUuids)
  await (fromUuidSync(templateUuid) as MeasuredTemplateDocument.Implementation | undefined)?.delete();
```

### globals.ts

Added `templateUuids` to the midi-qol flags type definition (line ~500):

```typescript
templateUuids?: string[];
```

## Sequence Diagram

### Single Template (unchanged behavior)

```
initializeWorkflow()
  → expectedTemplateCount = 1
  → registerTemplateHooks()  [registers Hooks.once for preCreate + create]
  → workflow suspends at WorkflowState_AwaitTemplate

User places template (preview updates game.user.targets during drag)
  → preCreateMeasuredTemplate fires → setTemplateFlags()
  → createMeasuredTemplate fires → selectTargets()
    → targeting block may or may not run (depends on game.user.targets.size)
    → placedTemplateCount is 0 → setTargets(new Set(game.user.targets))  [replace]
    → templateUuid setter pushes uuid, placedTemplateCount = 1
    → placedTemplateCount (1) >= expectedTemplateCount (1)
    → needTemplate = false
    → workflow.unSuspend()

WorkflowState_AwaitTemplate resumes
  → templateUuids.length (1) >= expectedTemplateCount (1)
  → → WorkflowState_TemplatePlaced
```

### Multi Template (count = 2)

```
initializeWorkflow()
  → expectedTemplateCount = 2
  → registerTemplateHooks()  [registers Hooks.once #1]
  → workflow suspends at WorkflowState_AwaitTemplate

User places template 1 (preview updates game.user.targets)
  → preCreateMeasuredTemplate fires → setTemplateFlags()
  → createMeasuredTemplate fires → selectTargets()
    → targeting block may or may not run
    → placedTemplateCount is 0 → setTargets(new Set(game.user.targets))  [replace]
    → workflow.targets = {Orc1, Orc2}
    → templateUuids = [uuid1], placedTemplateCount = 1
    → placedTemplateCount (1) < expectedTemplateCount (2)
    → registerTemplateHooks()  [registers Hooks.once #2]
    → workflow stays suspended

User places template 2 (preview updates game.user.targets to template 2's tokens)
  → preCreateMeasuredTemplate fires → setTemplateFlags()
  → createMeasuredTemplate fires → selectTargets()
    → targeting block may or may not run
    → placedTemplateCount is 1 → setTargets(new Set([...workflow.targets, ...game.user.targets]))  [accumulate]
    → workflow.targets = {Orc1, Orc2, Skeleton1}
    → templateUuids = [uuid1, uuid2], placedTemplateCount = 2
    → placedTemplateCount (2) >= expectedTemplateCount (2)
    → needTemplate = false
    → updateUserTargets(allIds)  [sync ALL accumulated targets to game.user.targets]
    → workflow.unSuspend()

WorkflowState_AwaitTemplate resumes
  → templateUuids.length (2) >= expectedTemplateCount (2)
  → → WorkflowState_TemplatePlaced
```

## Edge Cases

### Abort During Placement

If the user cancels during template placement (after placing 1 of 2):
- `WorkflowState_Abort` iterates all `templateUuids` and deletes each template
- `Hooks.off` removes the last registered hook ID (earlier ones already fired)

### Instantaneous Templates

Auto-removal iterates all `templateUuids` with the same timeout logic per template.

### Cover Bonus in Saves

Currently uses `this.templateUuid` (first template) for cover calculation. Multi-template cover (checking nearest template per target) is a potential future enhancement.

### Pre-targeted AoE

If `game.user.targets.size > 0` before placement, template targeting may be skipped (same behavior as before). The first template's `setTargets` replaces (does not accumulate pre-cast targets).

### Concentration Cleanup

`setupTemplateCleanup()` is called per template from `selectTargets()`, so each template gets linked to the concentration effect individually.

### Undo

All template UUIDs are pushed to `undoData.templateUuids` for proper undo support.

## Key Implementation Notes

### `workflow.targets` getter returns throwaway Sets

The `Workflow.targets` getter returns `#targets` if set, deserializes from persisted `midiFlags.targets` if available, or returns a **fresh `new Set()`**. Calling `workflow.targets.add(t)` modifies that throwaway — the next getter call creates a new empty set. Always build a new Set and use `setTargets()`.

### Always use `setTargets()`, not the raw setter

`setTargets()` initializes derivative sets (`failedSaves`, `saves`, `hitTargets`, etc.) that the workflow state machine depends on for save processing and damage application. The raw `workflow.targets = ...` setter only stores and persists — using it causes saves to appear empty even though targets are visually selected.

### Always use the `templateUuid` setter, not `templateUuids.push()`

`workflow.templateUuid = uuid` (the setter) pushes to the array **and** calls `persistFields()`. Direct `workflow.templateUuids.push(uuid)` is in-place mutation that skips persistence.

### Target accumulation must be OUTSIDE the targeting block

The targeting block in `selectTargets` (`if ((game.user?.targets.size === 0 || ...) && targeting !== "none")`) only runs when `game.user.targets` is empty OR specific flags are set. The template preview updates `game.user.targets` during drag, so by the time `createMeasuredTemplate` fires, `game.user.targets.size > 0` and the block is skipped.

The `setTargets()` call must be **outside** this block so it always runs for every template. If it were inside, the second template would never record its targets and `workflow.targets` would only contain the first template's targets.

### First template replaces, subsequent templates accumulate

Use `placedTemplateCount` (which is 0 before the first template is processed, incremented after) to decide the strategy:

- **First template** (`placedTemplateCount === 0`): **Replace** — `setTargets(new Set(game.user.targets))`. This matches original single-template behavior and ensures pre-cast targets (tokens targeted before casting) are not carried into template-based targeting.
- **Subsequent templates** (`placedTemplateCount > 0`): **Accumulate** — `setTargets(new Set([...workflow.targets, ...game.user.targets]))`. Merges the new template's targets with all previously accumulated targets.

### `updateUserTargets` only after the last template

`updateUserTargets(ids)` calls Foundry's `canvas.tokens.setTargets(ids)`, which replaces `game.user.targets`. The next template's preview overwrites `game.user.targets` anyway, so syncing before the last template is pointless. Only sync from `workflow.targets` after all templates are placed, and only for multi-template spells (single-template `game.user.targets` is already correct from the preview/targeting block).
