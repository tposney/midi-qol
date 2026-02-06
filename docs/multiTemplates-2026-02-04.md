# Multi-Template Auto-Targeting Accumulation

**Date**: 2026-02-04
**Version**: 13.0.43+

## Overview

Spells with `target.template.count > 1` (e.g., Eldritch Blast with multiple AoE zones) place multiple templates sequentially. midi-qol accumulates targets from all templates and tracks all template UUIDs for proper cleanup, undo, and concentration management.

This implementation handles three template placement paths:
1. **Chat card button** — User clicks "Place Template" button on chat card
2. **Dialog checkbox** — User checks "Place Templates" in the activity use dialog
3. **Auto-placement** — Emanation templates placed automatically (single template only)

All paths support partial placement cleanup: if fewer templates are placed than expected, any partial templates are deleted and the button remains active for retry.

---

## Architecture

### Design Principles

1. **Template UUID array** — Track an array of template UUIDs (`templateUuids[]`) and an expected count, not just a single UUID
2. **Direct placement loop** — Place all templates in a sequential loop, then compute targets once from all templates
3. **Partial placement cleanup** — If user cancels mid-placement, delete any partial templates and leave the button active
4. **Conditional button removal** — Only remove the "Place Template" button when `placedTemplateCount >= expectedCount`
5. **Backward compatibility** — The `templateUuid` getter/setter wraps the array; existing code using `workflow.templateUuid` continues to work

### dnd5e Flow

dnd5e's `AbilityTemplate.fromActivity()` returns an array of template previews based on `target.template.count`. Each `drawPreview()` is awaited sequentially — template 1 completes fully before template 2 starts. During the preview, `game.user.targets` is updated to reflect tokens within the current template position.

---

## File Changes

### MidiActivityMixin.ts

#### `#placeTemplate()` — Chat card button handler

Handles the "Place Template" button click. Places all templates sequentially, with partial placement cleanup:

```typescript
static async #placeTemplate(this: MidiActivityMixin, event, target, message) {
  const AbilityTemplate = dnd5e.canvas.AbilityTemplate;
  const expectedCount = Number(this.target?.template?.count) || 1;
  const templates: MeasuredTemplateDocument[] = [];

  try {
    const previews = AbilityTemplate.fromActivity(this);
    if (!previews) return;
    for (const template of previews) {
      const result = await template.drawPreview();
      if (result) {
        const docs = Array.isArray(result) ? result : [result];
        templates.push(...docs);
      }
    }
  } catch (err) {
    // User cancelled during placement — fall through to count check
  }

  // Incomplete placement: delete any templates placed so far, don't advance workflow
  if (templates.length !== expectedCount) {
    for (const tDoc of templates) {
      try { await tDoc.delete(); } catch (e) { /* template may already be gone */ }
    }
    return;  // Button remains active for retry
  }

  // All templates placed — find workflow and process
  const workflow = Workflow.getWorkflow(message.uuid);

  // Set midi-qol flags on each template and register cleanup
  for (const tDoc of templates) {
    workflow.templateUuid = tDoc.uuid;  // setter pushes to array + persists
    await tDoc.update({ flags: { "midi-qol.workflowId": workflow.id, ... } });
    await workflow.setupTemplateCleanup(tDoc);
  }
  workflow.placedTemplateCount = templates.length;

  // Compute targets from ALL templates at once
  workflow.selectAllTemplateTargets(this);

  // Advance the workflow
  if (workflow.suspended && workflow.currentAction === workflow.WorkflowState_AwaitTemplate) {
    workflow.unSuspend();
  }
}
```

#### `use()` — Dialog checkbox path

When "Place Templates" is checked in the activity dialog, dnd5e handles placement via `super.use()`. midi-qol processes the results with partial placement cleanup:

```typescript
// Process templates placed by dnd5e during super.use() (manual template placement)
const allTemplates = (useResults.templates ?? []).flat();
const expectedTemplateCount = Number(activity.target?.template?.count) || 1;

if (allTemplates.length > 0 && allTemplates.length < expectedTemplateCount) {
  // Incomplete placement: delete partial templates, leave button active
  for (const tDoc of allTemplates) {
    try { await tDoc.delete(); } catch (e) { /* template may already be gone */ }
  }
} else if (allTemplates.length >= expectedTemplateCount) {
  const workflow = usage.workflow as Workflow;
  for (const tDoc of allTemplates) {
    if (!tDoc?.uuid) continue;
    workflow.templateUuid = tDoc.uuid;
    await workflow.setupTemplateCleanup(tDoc);
  }
  workflow.placedTemplateCount = allTemplates.length;
  workflow.selectAllTemplateTargets(activity);
}
```

#### `_usageChatButtons()` — Button filtering

Removes the "Place Template" button for auto-placed templates (emanation/self-radius):

```typescript
_usageChatButtons(message) {
  let buttons = super._usageChatButtons(message);
  const autoCreateTemplate = activityHasAutoPlaceTemplate(this);
  const emanationNoTemplate = activityHasEmanationNoTemplate(this);
  if (autoCreateTemplate || emanationNoTemplate) {
    buttons = buttons.filter(b => b.dataset?.action !== "placeTemplate")
  }
  return buttons;
}
```

### Workflow.ts

#### Properties

Three properties track multi-template state:

```typescript
templateUuids: string[] = [];        // All template UUIDs placed during this workflow
expectedTemplateCount: number = 1;   // From activity.target.template.count
placedTemplateCount: number = 0;     // How many templates have been placed so far
```

#### `templateUuid` getter/setter — backward compatibility

The `templateUuid` getter/setter wraps the array:

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

#### `selectAllTemplateTargets()` — target computation from all templates

Computes targets from all placed templates at once:

```typescript
selectAllTemplateTargets(activity?: Activity): void {
  if (!activity) activity = this.activity;
  const selfToken = getToken(activity?.actor);
  const ignoreSelf = (activity?.target?.affects.special ?? "").split(";").some(spec => ["-self"].includes(spec));
  const AoETargetType = activity ? getAoETargetType(activity) : "any";
  const targeting = getActivityAutoTargetAction(activity);
  if (targeting === "none") return;

  let allTargetTokens = computeTargetsFromAllTemplates(this.templateUuids, selfToken, ignoreSelf, AoETargetType, targeting);

  // Apply target count limit if configured
  if (activity?.target?.affects.count) {
    const maxTargets = Number(activity.target.affects.count) || 0;
    if (maxTargets > 0 && allTargetTokens.length > maxTargets) {
      allTargetTokens = allTargetTokens.slice(0, maxTargets);
    }
  }

  // Set all targets at once
  const allIds = allTargetTokens.map(t => t.id).filter(Boolean) as string[];
  updateUserTargets(allIds);
  this.setTargets(new Set(game.user?.targets ?? []));
}
```

#### `WorkflowState_AwaitTemplate()`

Checks template count against expected:

```typescript
async WorkflowState_AwaitTemplate(context: WorkflowContext = {}): Promise<WorkflowState> {
  if (this.templateUuids.length >= this.expectedTemplateCount) {
    return this.WorkflowState_TemplatePlaced;
  }
  if (context.itemUseComplete || !this.needTemplate) {
    return this.WorkflowState_AoETargetConfirmation;
  }
  return this.WorkflowState_Suspend;
}
```

#### `WorkflowState_TemplatePlaced()` — conditional button removal

Only removes the "Place Template" button when all templates have been placed:

```typescript
// remove the place template button from the chat card only if all templates have been placed
let content = chatMessage.content;
if (this.placedTemplateCount >= (Number(this.activity?.target?.template?.count) || 1)) {
  const buttonRe = /<button.*?data-action="placeTemplate"[^>]*?>[\s\S]*?<\/button>/
  content = chatMessage.content?.replace(buttonRe, "");
}
await this.performThrottledUpdate(chatMessage, { content, ... });
```

#### `WorkflowState_WaitForSaves()` — conditional button removal

Only removes the "Place Template" button after saves if all templates were placed:

```typescript
await Workflow.removeItemCardButtons(this.itemCardUuid as string, {
  removeDnd5eSaveButtons: configSettings.autoCheckSaves !== "none",
  removeDnd5eTemplateButtons: this.placedTemplateCount >= (Number(this.activity?.target?.template?.count) || 1)
});
```

#### `WorkflowState_RollFinished()` — conditional button removal

Only removes the "Place Template" button at workflow end if all templates were placed:

```typescript
if (isAoETargeting && !isEmanationTargeting && this.placedTemplateCount >= (Number(this.activity?.target?.template?.count) || 1)) {
  const searchRe = /<button[^>]*?data-action="placeTemplate"[\s\S]*?<\/button>/;
  content = content.replace(searchRe, "");
}
```

#### `WorkflowState_Cleanup` — auto-remove instantaneous templates

Iterates all `templateUuids` to delete each template:

```typescript
if (configSettings.autoRemoveInstantaneousTemplate && this.templateUuids.length > 0
    && this.activity.duration?.units === "inst") {
  for (const tUuid of this.templateUuids) {
    setTimeout(() => {
      const templateToDelete = fromUuidSync(tUuid) as MeasuredTemplateDocument || null;
      templateToDelete?.delete();
    }, timeout);
  }
}
```

#### `WorkflowState_Abort()`

Iterates all `templateUuids` to delete all placed templates on abort:

```typescript
for (const tUuid of this.templateUuids) {
  const templateToDelete = await fromUuid(tUuid) as MeasuredTemplateDocument | undefined;
  if (templateToDelete) await templateToDelete.delete();
}
```

#### `getMacroData()`

Exposes both for backward compatibility:

```typescript
templateId: this.templateId,       // deprecated
templateUuid: this.templateUuid,   // first template UUID (backward compat)
templateUuids: this.templateUuids, // all template UUIDs
```

### activityHelpers.ts

#### `selectTargetsForTemplate()` — single template targeting

Sets `game.user.targets` from a single template:

```typescript
export function selectTargetsForTemplate(
  templateDetails: MeasuredTemplate,
  selfTokenRef?: TokenOrDocument | string,
  ignoreSelf: boolean = false,
  AoETargetType: string = "any",
  autoTarget?: string
): Token.Implementation[] {
  const tokens = computeTargetsFromTemplate(templateDetails, selfTokenRef, ignoreSelf, AoETargetType, autoTarget);
  const targetIds = tokens.map(t => t.id).filter(Boolean) as string[];
  updateUserTargets(targetIds);
  game.user?.broadcastActivity({ targets: targetIds });
  return tokens;
}
```

#### `selectTargetsFromAllTemplates()` — multi-template targeting

Sets `game.user.targets` from multiple templates:

```typescript
export function selectTargetsFromAllTemplates(
  templates: (MeasuredTemplateDocument | string)[],
  selfTokenRef?: TokenOrDocument | string,
  ignoreSelf: boolean = false,
  AoETargetType: string = "any",
  autoTarget?: string
): Token.Implementation[] {
  const tokens = computeTargetsFromAllTemplates(templates, selfTokenRef, ignoreSelf, AoETargetType, autoTarget);
  const targetIds = tokens.map(t => t.id).filter(Boolean) as string[];
  updateUserTargets(targetIds);
  game.user?.broadcastActivity({ targets: targetIds });
  return tokens;
}
```

#### `computeTargetsFromTemplate()` — single template computation

Returns tokens inside a template without modifying `game.user.targets`. Handles WalledTemplates, VolumetricTemplates, and standard template targeting.

#### `computeTargetsFromAllTemplates()` — multi-template computation

Computes targets from multiple templates, deduplicating tokens that appear in multiple template areas.

### undo.ts

#### `UndoDataDirect` interface

```typescript
templateUuids?: string[];
```

#### `saveTargetsUndoData()`

Pushes all template UUIDs to undo data:

```typescript
for (const tUuid of workflow.templateUuids) {
  if (tUuid) workflow.undoData.templateUuids.push(tUuid);
}
```

#### `undoWorkflow()`

Deletes all templates when undoing:

```typescript
for (let templateUuid of undoData.templateUuids)
  await (fromUuidSync(templateUuid) as MeasuredTemplateDocument.Implementation | undefined)?.delete();
```

### globals.ts

Added `templateUuids` to the midi-qol flags type definition:

```typescript
templateUuids?: string[];
```

---

## Sequence Diagrams

### Single Template (unchanged behavior)

```
Activity use starts
  → workflow created, expectedTemplateCount = 1
  → workflow suspends at WorkflowState_AwaitTemplate

User clicks "Place Template" button
  → #placeTemplate() called
  → AbilityTemplate.fromActivity() returns [preview1]
  → preview1.drawPreview() awaited — user places template
  → templates = [doc1]
  → templates.length (1) === expectedCount (1) ✓
  → workflow.templateUuid = doc1.uuid (pushes to array)
  → workflow.setupTemplateCleanup(doc1)
  → workflow.placedTemplateCount = 1
  → workflow.selectAllTemplateTargets() — computes targets from doc1
  → workflow.unSuspend()

WorkflowState_AwaitTemplate resumes
  → templateUuids.length (1) >= expectedTemplateCount (1)
  → → WorkflowState_TemplatePlaced
    → placedTemplateCount (1) >= expectedCount (1)
    → Remove "Place Template" button from chat card
```

### Multi Template (count = 2)

```
Activity use starts
  → workflow created, expectedTemplateCount = 2
  → workflow suspends at WorkflowState_AwaitTemplate

User clicks "Place Template" button
  → #placeTemplate() called
  → AbilityTemplate.fromActivity() returns [preview1, preview2]
  → preview1.drawPreview() awaited — user places template 1
  → templates = [doc1]
  → preview2.drawPreview() awaited — user places template 2
  → templates = [doc1, doc2]
  → templates.length (2) === expectedCount (2) ✓
  → Loop: set flags and cleanup for doc1, doc2
  → workflow.templateUuids = [uuid1, uuid2]
  → workflow.placedTemplateCount = 2
  → workflow.selectAllTemplateTargets() — computes targets from BOTH templates
  → workflow.unSuspend()

WorkflowState_AwaitTemplate resumes
  → templateUuids.length (2) >= expectedTemplateCount (2)
  → → WorkflowState_TemplatePlaced
    → placedTemplateCount (2) >= expectedCount (2)
    → Remove "Place Template" button from chat card
```

### Partial Placement (user cancels after 1 of 2)

```
User clicks "Place Template" button
  → #placeTemplate() called
  → AbilityTemplate.fromActivity() returns [preview1, preview2]
  → preview1.drawPreview() succeeds
  → templates = [doc1]
  → preview2.drawPreview() — user presses Escape
  → throws error, caught by try/catch

  → templates.length (1) !== expectedCount (2)
  → Delete doc1
  → return (don't advance workflow)

Workflow stays suspended at WorkflowState_AwaitTemplate
  → placedTemplateCount still 0
  → "Place Template" button remains active
  → User can click button again to retry
```

### Dialog Checkbox Partial Placement

```
User opens activity dialog, checks "Place Templates", clicks Use
  → super.use() calls dnd5e's template placement
  → User places 1 template, cancels second
  → useResults.templates = [doc1]

use() processes results:
  → allTemplates.length (1) < expectedTemplateCount (2)
  → Delete doc1
  → Don't set placedTemplateCount
  → Workflow continues but button remains active
```

---

## Edge Cases

### Abort During Workflow

If the workflow is aborted after templates are placed:
- `WorkflowState_Abort` iterates all `templateUuids` and deletes each template

### Partial Placement Cleanup

Both template placement paths (`#placeTemplate` and `use()`) check if the number of templates placed matches the expected count:
- If fewer than expected: delete all partial templates, leave button active
- If equal or greater: process normally, remove button

### Instantaneous Templates

Auto-removal iterates all `templateUuids` with the same timeout logic per template.

### Cover Bonus in Saves

Currently uses `this.templateUuid` (first template) for cover calculation. Multi-template cover (checking nearest template per target) is a potential future enhancement.

### Concentration Cleanup

`setupTemplateCleanup()` is called per template, so each template gets linked to the concentration effect individually.

### Undo

All template UUIDs are pushed to `undoData.templateUuids` for proper undo support.

---

## Implementation Notes

### `workflow.targets` getter returns throwaway Sets

The `Workflow.targets` getter returns `#targets` if set, deserializes from persisted `midiFlags.targets` if available, or returns a **fresh `new Set()`**. Calling `workflow.targets.add(t)` modifies that throwaway — the next getter call creates a new empty set. Always build a new Set and use `setTargets()`.

### Always use `setTargets()`, not the raw setter

`setTargets()` initializes derivative sets (`failedSaves`, `saves`, `hitTargets`, etc.) that the workflow state machine depends on for save processing and damage application. The raw `workflow.targets = ...` setter only stores and persists — using it causes saves to appear empty even though targets are visually selected.

### Always use the `templateUuid` setter, not `templateUuids.push()`

`workflow.templateUuid = uuid` (the setter) pushes to the array **and** calls `persistFields()`. Direct `workflow.templateUuids.push(uuid)` is in-place mutation that skips persistence.

### Button removal is conditional on template count

The "Place Template" button is only removed when `placedTemplateCount >= expectedTemplateCount`. This check is performed in three places:
1. `WorkflowState_TemplatePlaced` — after templates are placed
2. `WorkflowState_WaitForSaves` — after checking saves
3. `WorkflowState_RollFinished` — when workflow completes

If the user cancels mid-placement and partial templates are cleaned up, `placedTemplateCount` stays at 0 (or less than expected), so the button remains active for retry.

