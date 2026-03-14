# Plain d20 Rolls in CheckActivity (No Skill/Tool/Ability)

When a Check activity has no skill, tool, or ability specified, it now requests a simple d20 roll instead of rejecting or falling back to "dex".

## Changes

### 1. `lang/en.json`

Added i18n key:
```json
"midi-qol.plain-d20-roll": "d20 Roll"
```

### 2. `src/module/activities/CheckActivity.ts` — `_usageChatButtons`

**Problem**: `super._usageChatButtons(message)` (dnd5e's implementation) only generates check buttons when `check.associated` has entries or `check.ability` is set. With neither, no button is generated.

**Fix**: After calling `super._usageChatButtons()`, checks whether any `rollCheck` button was returned. If not, inserts a plain "d20 Roll" button with an optional visible/hidden DC label (matching dnd5e's DC display pattern).

### 3. `src/module/Workflow.ts` — `createStandardSaveRoll` (line ~6179)

**Problem**: Validation block rejected both saves and checks when `rollAbilities` was empty:
```typescript
if ((rollType === "save" || rollType === "check") && rollAbilities.length === 0)
```

**Fix**: Only reject saves:
```typescript
if (rollType === "save" && rollAbilities.length === 0)
```

### 4. `src/module/Workflow.ts` — `checkSaves` validation (line ~6642)

**Problem**: A second validation block in `checkSaves()` also rejected checks with no abilities, returning early before iterating targets. This was the main cause of "no targets to save" for plain d20 checks:
```typescript
if ((rollType === "save" || rollType === "check") && rollAbilities.length === 0) {
  console.warn(...);
  return;
}
```

**Fix**: Only reject saves:
```typescript
if (rollType === "save" && rollAbilities.length === 0) {
  console.warn(...);
  return;
}
```

### 5. `src/module/Workflow.ts` — `dispatchMonksTokenBarSaves` (line ~5891)

**Problem**: `request = \`ability:${rollAbilities[0]}\`` produces `"ability:undefined"` when no ability is set.

**Fix**: Uses Monks Token Bar's `dice:1d20` request format when no ability exists:
```typescript
request = rollAbilities[0] ? `ability:${rollAbilities[0]}` : `dice:1d20`;
```

### 5. `src/module/Workflow.ts` — `dispatchFlashRollsSaves` (line ~5962)

**Problem**: `flashRollKey` fell back to `"dex"` via `?? "dex"` when no ability/skill/tool was set.

**Fix**: Computes `flashRollKey` without a `"dex"` fallback. When no key exists, overrides `flashRequestType` to `"custom"` and uses `"1d20"` as the roll key:
```typescript
const flashRollKey = rollAbilities?.[0] ?? rollSkills?.[0] ?? rollTools?.[0];
if (!flashRollKey) {
  flashRequestType = "custom";
}
// rollKey: flashRollKey ?? "1d20"
```

### 6. `src/module/Workflow.ts` — `dispatchEpicRollsSaves` (line ~5996)

**Problem**: Epic Rolls type fell back to `"dex"` via `?? "dex"` when no ability was configured.

**Fix**: Uses `"custom"` type and adds `formula: "1d20"` to options when no ability or associated skill exists:
```typescript
const abilityOrAssociated = this.saveActivity?.save?.ability.first()
  ?? this.saveActivity?.check?.associated.first();
const type = abilityOrAssociated ? `${rerType}.${abilityOrAssociated}` : "custom";
// options: { ...(abilityOrAssociated ? {} : { formula: "1d20" }), ... }
```

### 7. `src/module/Workflow.ts` — `computeSaveDisplayFlavor` (line ~6811)

**Problem**: `rollAbilities.map(...)` produces an empty string when the array is empty, resulting in no flavor text.

**Fix**: When `rollType === "check"` and `rollAbilities` is empty, returns the DC label with the "d20 Roll" i18n string:
```typescript
if (rollAbilities.length === 0) {
  return `${dcLabel} ${i18n("midi-qol.plain-d20-roll")}:`;
}
```

### 8. `src/module/utils.ts` — `requestPCSave` (line ~902)

**Problem**: When `rollAbilities`, `rollSkills`, and `rollTools` are all empty, the fallback to the `ability` parameter (also empty) produces a blank label in the player chat save request.

**Fix**: Falls back to the "d20 Roll" i18n string when `ability` is falsy:
```typescript
abilityString = ability || i18n("midi-qol.plain-d20-roll");
```

### 9. `src/module/Workflow.ts` — `hasValidSaveOrCheck` (line ~1070)

**Problem**: `hasValidSaveOrCheck` required a check to have either an `ability` or `associated` entries, returning `false` for a plain d20 check. This caused `saveActivity` to return `undefined`, which in turn caused `checkSaves()` to return early at `if (!this.saveActivity) return;` — no targets processed, no DC reported.

**Fix**: A check activity is always valid (can be a plain d20 roll):
```typescript
if (activity.check) {
  return true;
}
```

### 10. `src/module/patching.ts` — `doRollAbility` (line ~1134)

**Problem**: The libWrapper around `rollSavingThrow`/`rollAbilityCheck` threw an error when `rollAbilities` was empty:
```typescript
if (rollAbilities.length === 0)
  throw new Error(`doRollAbility called with no abilities to roll for ${this.name}`);
```

**Fix**: Only throw for saves; checks can be plain d20 rolls with no ability:
```typescript
if (rollAbilities.length === 0 && rollType === "save")
  throw new Error(`doRollAbility called with no abilities to roll for ${this.name}`);
```

## No Changes Needed

- **`GMAction.ts` `rollAbility`**: Already handles undefined ability via `if (ability) config.ability = ability;`.
- **`CheckActivity.ts` `#rollCheck`**: Already falls through to `actor.rollAbilityCheck(rollData, {}, messageData)` with no ability in rollData.
- **`Workflow.ts` `determineRollTypeAndAction`**: Already sets `rollType = "check"` with empty `rollAbilities` when no ability is configured.

## Testing

1. Create a Check activity with no skill, tool, or ability configured
2. Verify the chat card shows a "d20 Roll" button
3. Click the button — should roll a bare d20
4. Test with DC set — should display "DC X d20 Roll"
5. Test with Monks Token Bar enabled — should request a `dice:1d20` roll
6. Test that existing check activities (with skill/tool/ability) still work normally
