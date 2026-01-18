# Other Activity Consumption

This document describes the consumption and scaling handling for "other activities" in midi-qol.

## Overview

When an activity references another activity (via `otherActivityId`), and that other activity has consumption configured, midi-qol checks and applies the consumption before the other activity's effects (save and/or damage) are processed.

### Key Features

- **Deferred damage rolling**: Other activity damage is not rolled until consumption is confirmed
- **Consumption dialog support**: Respects auto-consume settings and shows dialog when appropriate
- **Scaling support**: Consumption scaling is applied to other activity damage rolls
- **Attack miss handling**: Resources are not consumed if the parent attack misses
- **Refund capability**: Chat card button allows refunding consumed resources

---

## Activity Configuration

### Supported Activity Types

The following activity types can reference an other activity:

| Activity Type | Description |
|--------------|-------------|
| **AttackActivity** | Attack with optional other activity for additional effects |
| **SaveActivity** | Save with optional other activity |
| **CheckActivity** | Check with optional other activity |
| **UtilityActivity** | Utility with optional other activity |

### Activity Properties

- `otherActivityId` - References another activity on the same item (defined at activity's top level)
- `midiProperties.autoConsume` - If true on the **other activity**, always auto-consume without dialog

---

## Workflow Integration

### When Consumption Is Checked

1. **Before other activity save** - If the save comes from the other activity
2. **Before other activity damage** - After attack hits are determined
3. **Before other activity effects** - For effects-only other activities


## Chat Card Buttons

### Button Behavior

Buttons are added dynamically via `_usageChatButtons()` when the other activity has consumption configured:

| Button | Shown When | Action |
|--------|------------|--------|
| "Refund Other Activity Resource" | Resources have been consumed (flag has delta data) | Refunds the consumed resources |
| "Consume Other Activity Resource" | User rolled but chose not to consume (flag is empty object) | Consumes the resources |

Button visibility is controlled by `shouldHideChatButton()` based on the `flags.midi-qol.use.consumed` flag on the chat message.

### Dialog Response Handling

Once the user responds to the consumption dialog, they will not be prompted again:

| User Action | Flag Value | Buttons Shown | Behavior |
|-------------|------------|---------------|----------|
| Consume and roll | `{actor:[...]}` (delta data) | Refund | Resources consumed, can refund |
| Roll but don't consume | `{}` (empty object) | Consume | Damage rolled, can consume later |
| Cancel/close dialog | `false` | None | No damage rolled, decision complete |

---

## Settings

| Setting | Description |
|---------|-------------|
| `otherActivity.midiProperties.autoConsume` | If true, always auto-consume |
| `otherActivity.midiProperties.forceConsumeDialog` | `"always"`, `"never"`, or `"default"` |
| Global `autoConsumeResource` | `"none"`, `"spell"`, `"item"`, `"both"` |

### Dialog Display Logic

```
if forceConsumeDialog === "always" → show dialog
else if forceConsumeDialog === "never" OR autoConsume === true → auto-consume
else → use global autoConsumeResource setting
```

---

## Implementation Details

### Chat Message Flags

Consumption and scaling state is stored on the chat message:

**`flags.midi-qol.use.consumed`** - Consumption state:

| Flag Value | Meaning |
|------------|---------|
| `undefined` | Not yet checked, or no consumption configured on other activity |
| `false` | Dialog cancelled, consumption failed, or skipped (e.g., attack missed) |
| `{}` (empty object) | User chose to roll but not consume - prevents re-prompting |
| `{actor:[...]}` (object with data) | Consumption succeeded - contains delta data for refund |

The empty object `{}` is used to distinguish "user made a decision not to consume" from "cancelled" (`false`) or "not yet checked" (`undefined`).

**`flags.midi-qol.use.otherScaling`** - Scaling value:

| Flag Value | Meaning |
|------------|---------|
| `undefined` | No scaling or not yet set |
| `false` | Scaling explicitly disabled |
| `number` | Scaling level selected in consumption dialog |

The consumed delta data structure (from dnd5e's `consume()` method):

```typescript
interface ConsumedDelta {
  actor: Array<{ keyPath: string; delta: number }>;
  item: Record<string, Array<{ keyPath: string; delta: number }>>;
  created?: unknown[];
  deleted?: unknown[];
}
```

This data is passed to dnd5e's `activity.refund(consumed)` method to reverse the consumption.

### Workflow Properties

```typescript
// Deferred damage rolling - stored when consumption needs to be checked first
otherDamageConfig: RollProcessConfig | undefined;
otherDamageDialog: RollDialogConfig | undefined;
```

### Key Workflow Methods

**`checkOtherActivityConsumption()`**
- Returns `true` immediately if no other activity or `otherActivity.hasConsumption()` is false
- Checks `flags.midi-qol.use.consumed` on chat card - returns cached result if flag exists (prevents re-prompting)
- Shows dialog or auto-consumes based on settings
- On consume success: stores delta data object (for refund capability) and scaling value
- On roll without consume: stores empty object `{}` (marks decision complete, shows consume button)
- On cancel/failure: stores `false` (marks decision complete, hides all buttons)
- Rolls deferred other activity damage on success (consume or roll-without-consume)

**`rollDeferredOtherDamage()`**
- Rolls other activity damage that was deferred until consumption confirmed
- Updates chat card with damage display

### MidiActivityMixin Methods

**`hasConsumption(): boolean`**
- Returns `true` if the activity has consumption targets configured
- Instance method on MidiActivityMixin, checking `this.consumption?.targets?.length > 0`

**`deferOtherDamage(config, dialog): boolean`**
- Checks if other activity damage should be deferred until after consumption is confirmed
- Only defers if checking hits or saves AND other activity has consumption
- Stores config and dialog for later rolling via `rollDeferredOtherDamage()`

**`rollOtherDamage(config, dialog): Promise<Roll[] | undefined>`**
- Rolls damage for the other activity referenced by this activity
- Applies scaling from chat card flag to the other activity's item via cloning

- Sets `updateWorkflow: false` to prevent the other activity from controlling workflow state

```typescript
const otherConfig = {
  ...config,
  midiOptions: {
    ...config.midiOptions,
    fastForward: config.midiOptions?.fastForwardDamage,
    updateWorkflow: false // Prevents other activity from controlling workflow state
  }
};
```

**Why `updateWorkflow: false`?**

Activities like UtilityActivity and DamageActivity are designed to work as standalone activities that manage workflow state (setting rolls, unsuspending the workflow). When called as an "other activity", they don't know they're in a subordinate role. The `updateWorkflow: false` flag tells them not to:
- Set their rolls on the workflow (the parent handles this via `setOtherDamageRolls()`)
- Unsuspend the workflow (the parent manages workflow progression)

**Scaling Application**

When the other activity has consumption with scaling, the scaling value is:
1. Captured from `otherUsageConfig.scaling` after the consumption dialog
2. Stored on the chat card at `flags.midi-qol.use.otherScaling`
3. Applied to the other activity by cloning its item with the scaling flag:

```typescript
const scaling = config.workflow?.chatCard?.getFlag(MODULE_ID, "use.otherScaling");
if (scaling) {
  const item = otherActivity.item.clone({ flags: { dnd5e: { scaling } } }, { keepId: true });
  otherActivity = item.system.activities.get(otherActivity.id);
}
```

**`_usageChatButtons(message)`**
- Adds refund/consume buttons when other activity has consumption configured
- Buttons are added dynamically based on workflow state

**`shouldHideChatButton(button, message)`**
- Checks `message.getFlag(MODULE_ID, "use.consumed")` to determine visibility
- `consumeOtherActivity`: Show only when flag is empty object `{}` (rolled but didn't consume)
- `refundOtherActivity`: Show only when flag has actual delta data (consumed)
- Both buttons hidden when flag is `false` (cancelled) or `undefined` (not checked)

**`#refundOtherActivity(event, target, message)`**
- Gets consumed data from `flags.midi-qol.use.consumed`
- Calls `otherActivity.refund(consumed)` to restore resources
- Calls `message.unsetFlag(MODULE_ID, "use.consumed")` to update button visibility

**`#consumeOtherActivity(event, target, message)`**
- Validates consumption would succeed via `activity._prepareUsageUpdates()`
- Calls `otherActivity.consume(usageConfig, messageConfig)` to consume resources
- Sets `flags.midi-qol.use.consumed` with delta data from `messageConfig.data.flags.dnd5e.use.consumed`

---

## Code Details

### Workflow.ts - checkOtherActivityConsumption()

The key change is using `consumed ?? {}` to always set the flag after the dialog completes or auto-consume runs. This prevents re-prompting when the user chooses "roll but don't consume".

**Dialog path (after consume succeeds):**
```typescript
// Store consumed delta data and scaling on chat card
const consumed = messageConfig.data?.flags?.dnd5e?.use?.consumed ?? {};
const scaling = otherUsageConfig.scaling;
if (this.itemCardUuid) {
  addUpdatesCacheFlags(this.id, {
    [WorkflowDataFlags.otherActivityConsumed]: consumed,
    [WorkflowDataFlags.otherActivityScaling]: scaling
  }, "midi-qol");
}
```

**Auto-consume path:**
```typescript
// Store consumed delta data and scaling on chat card
const consumed = messageConfig.data?.flags?.dnd5e?.use?.consumed ?? {};
const scaling = otherUsageConfig.scaling;
if (this.itemCardUuid) {
  addUpdatesCacheFlags(this.id, {
    [WorkflowDataFlags.otherActivityConsumed]: consumed,
    [WorkflowDataFlags.otherActivityScaling]: scaling
  }, "midi-qol");
}
```

**Dialog cancelled/failure paths:**
```typescript
addUpdatesCacheFlags(this.id, { [WorkflowDataFlags.otherActivityConsumed]: false }, "midi-qol");
return false;
```

### MidiActivityMixin.ts - shouldHideChatButton()

Button visibility logic handles the three flag states:

```typescript
shouldHideChatButton(button: HTMLButtonElement, message: ChatMessage.Implementation): boolean {
  const consumed = message.getFlag(MODULE_ID, "use.consumed");
  switch (button.dataset.action) {
    // Show consume button only when rolled but didn't consume (empty object {})
    // Hide if: cancelled (false), not checked (undefined), or already consumed (non-empty object)
    case "consumeOtherActivity": return !(consumed && foundry.utils.isEmpty(consumed));
    // Show refund button only when actually consumed (non-empty object)
    case "refundOtherActivity": return !consumed || foundry.utils.isEmpty(consumed);
  }
  return super.shouldHideChatButton?.(button, message) ?? false;
}
```

**Button visibility truth table:**

| `consumed` value | `consumeOtherActivity` | `refundOtherActivity` |
|------------------|------------------------|----------------------|
| `undefined` | hidden | hidden |
| `false` | hidden | hidden |
| `{}` (empty) | **shown** | hidden |
| `{actor:[...]}` (data) | hidden | **shown** |

---

## Localization

```json
{
  "midi-qol.otherActivityConsumptionFailed": "{actorName}: {itemName} ({activityName}) - insufficient resources for other activity",
  "midi-qol.RefundOtherActivityResource": "Refund Other Activity Resource",
  "midi-qol.ConsumeOtherActivityResource": "Consume Other Activity Resource"
}
```

---

## Test Suite

Tests are in `midi-qol-tests` module: `src/28-other-activity-consumption-tests.ts`

| Test | Description |
|------|-------------|
| 28.1 | Returns true when no other activity exists (no flag set) |
| 28.2 | Consumes item uses when sufficient and auto consume enabled |
| 28.3 | Returns false when item uses are insufficient (flag set to false) |
| 28.4 | Skips consumption when attack misses all targets |
| 28.5 | Only checks consumption once even if called multiple times |
| 28.6 | Stores consumed state on chat card for reload persistence |
| 28.7 | Allows refunding consumed item uses |
