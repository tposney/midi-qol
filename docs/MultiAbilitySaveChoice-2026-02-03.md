# Multi-Ability / Multi-Skill / Multi-Tool Choice in Roll Dialogs

**Date**: 2026-02-03 (updated 2026-02-05)

When a save activity specifies multiple ability choices (e.g., STR or DEX), or a check activity specifies multiple skill or tool choices (e.g., Athletics or Acrobatics, or Thieves' Tools or Smith's Tools), each target's owner can now pick which to use via a dropdown integrated into the standard dnd5e roll dialog. The choice with the highest modifier is auto-selected, and the chosen roll type is displayed in the save tooltip.

---

## Background

dnd5e 4.1+ represents save abilities as a `Set` — a single SaveActivity can require `Set(["str", "dex"])`. Similarly, `CheckActivity.check.associated` is a `SetField<StringField>` that can hold multiple skill or tool IDs (e.g., `Set(["ath", "acr"])` or `Set(["thief", "smith"])`). OverTime effects also support pipe-separated abilities (`saveAbility=str|dex`). Previously midi-qol called `.first()` on the Set, always using the first entry. dnd5e's item chat cards already render one button per save ability / per associated skill or tool for player-owned tokens, but GM-controlled targets and timeout auto-rolls had no way to choose.

## Approach

The implementation follows dnd5e's own `SkillToolRollConfigurationDialog` pattern, which adds an ability dropdown to skill/tool roll dialogs. Key architectural decisions:

1. **Custom dialog class** (`MidiRollChoiceDialog`) extends `D20RollConfigurationDialog` and adds a choice dropdown field when multiple choices exist
2. **Pre-compute advantage for all abilities** — since advantage/disadvantage, auto-fail, and auto-success are ability-specific, these are computed for every available ability before the dialog opens
3. **Recompute locally, don't serialize Maps** — `Map` objects don't survive socketlib JSON serialization, so `doRollAbility()` always recomputes per-ability data on whichever client runs the roll
4. **`buildConfig` callback** rebuilds the save roll formula (parts/data) when the user changes the dropdown, using `D20Roll.constructParts()`
5. **Auto-select best modifier** — the choice with the highest modifier is pre-selected as the default
6. **Closure variable for stamping** — a `userExplicitChoice` closure variable captures the user's dropdown selection, bypassing dnd5e's deep-clone of config inside `BasicRoll.build`
7. **Mutable `_midiDefaultButton`** — overrides `_prepareButtonsContext` to read from a mutable instance property instead of ApplicationV2's frozen `options`

## Data Flow

### Save path (multi-ability)

```
determineRollTypeAndAction()
  Returns rollAbilities: string[] (full Set as array)
       |
       v
checkSaves() / buildSaveDetailsForTarget()
  Pre-computes advantageByAbility Map on GM client
  Stores in saveDetails.advantageByAbility
       |
       v
queueTargetSaveRoll()
  Routes to createStandardSaveRoll() or createPlayerChatSaveRequest()
  Passes rollAbilities through
       |
       v
createStandardSaveRoll()                    createPlayerChatSaveRequest()
  socketlib.executeAsUser("rollAbility")      Timeout path: direct rollSavingThrow()
  Passes rollAbilities in options              Passes rollAbilities via config.midiOptions
  (Map lost in serialization)                  (Map preserved, local call)
       |                                            |
       v                                            v
rollAbility() [GMAction.ts]                         |
  config.midiOptions = data.options                 |
       |                                            |
       +--------------------------------------------+
       |
       v
doRollAbility() [patching.ts]
  Reads config.midiOptions.rollAbilities
  Declares closure: let userExplicitChoice: string | undefined
  If length > 1:
    1. Computes advantage per ability (computeAbilityAdvantage)
    2. Computes auto-fail/success per ability (computeRollModifiers)
    3. Sets dialog.applicationClass = MidiRollChoiceDialog
    4. Sets dialog.options with rollChoices, advantageByChoice, choiceType="ability"
    5. Wraps buildConfig: delegates to createSaveBuildConfig, captures
       formData.get("ability") into userExplicitChoice
    6. Auto-selects best modifier: config.ability = best.value
    7. Forces dialog.configure = true
       |
       v
preRollSavingThrow hook
  If multi-ability and NOT all auto-fail:
    Skip applyRollModifiers (would close dialog)
    Force dialogData.configure = true
  If all auto-fail:
    Apply normally (dialog never opens)
       |
       v
D20Roll.build() -> MidiRollChoiceDialog opens
  User selects ability from dropdown
  _onChangeForm updates:
    - this.config.ability (for post-hooks)
    - this._midiDefaultButton (advantage/disadvantage highlight)
    - Window title ("Strength Save" -> "Dexterity Save")
  buildConfig callback rebuilds roll parts for new ability
  Wrapper captures chosen ability into userExplicitChoice
       |
       v
postSavingThrowRollConfiguration hook
  Detects ability change (configData.ability != original abilityId)
  Updates abilityId for downstream processing
  Checks auto-fail/auto-success for chosen ability
       |
       v
Stamp point (after bonusCheck)
  _chosenAbility = userExplicitChoice ?? config.ability
  Stamps midiChosenId on roll options
       |
       v
buildSaveDisplayEntry()
  Reads saveRoll.options.midiChosenId
  Looks up long-form label (e.g., "Dexterity Saving Throw")
  Prepends label to rollHTML tooltip
```

### Skill check path (multi-skill)

```
determineRollTypeAndAction()
  Iterates check.associated Set (not .first())
  If all entries are skills: Returns rollSkills: string[]
       |
       v
checkSaves() → queueTargetSaveRoll() → createStandardSaveRoll()
  Passes rollSkills in socketlib options
       |
       v
rollAbility() [GMAction.ts]
  Calls actor.rollSkill() with config.midiOptions containing rollSkills
       |
       v
doRollSkill() [patching.ts]
  Reads config.midiOptions.rollSkills
  Declares closure: let userExplicitChoice: string | undefined
  If length > 1:
    1. Computes advantage per skill (computeSkillAdvantage)
    2. Computes auto-fail/success per skill (computeRollModifiers)
    3. Sets dialog.applicationClass = MidiRollChoiceDialog
    4. Sets dialog.options with rollChoices, advantageByChoice, choiceType="skill"
    5. Wraps buildConfig: delegates to createSkillBuildConfig, captures
       formData.get("skill") into userExplicitChoice
    6. Auto-selects best modifier: config.skill = best.value
    7. Forces dialog.configure = true
       |
       v
preRollSkill hook
  If multi-skill and NOT all auto-fail:
    Skip applyRollModifiers, force dialogData.configure = true
  If all auto-fail:
    Apply normally (dialog never opens)
       |
       v
D20Roll.build() -> MidiRollChoiceDialog opens
  User selects skill from dropdown
  _onChangeForm updates:
    - this.config.skill (for post-hooks)
    - this._midiDefaultButton (advantage/disadvantage highlight)
    - Window title ("Athletics (Strength)" -> "Acrobatics (Dexterity)")
  buildConfig callback (createSkillBuildConfig) rebuilds roll parts:
    - Looks up new skill's ability, proficiency, bonuses
    - Uses calculateSkillToolProficiency + D20Roll.constructParts
  Wrapper captures chosen skill into userExplicitChoice
       |
       v
postSkillRollConfiguration hook
  Detects skill change (configData.skill != original skillId)
  Updates skillId for downstream processing
  Checks auto-fail/auto-success for chosen skill
       |
       v
Stamp point (after bonusCheck)
  _chosenSkill = userExplicitChoice ?? config.skill
  Stamps midiChosenId on roll options
       |
       v
buildSaveDisplayEntry()
  Reads saveRoll.options.midiChosenId
  Looks up long-form label (e.g., "(Athletics) Check")
  Prepends label to rollHTML tooltip
```

### Tool check path (multi-tool)

```
determineRollTypeAndAction()
  Iterates check.associated Set
  If all entries are tools (not in GameSystemConfig.skills): Returns rollTools: string[]
       |
       v
checkSaves() → queueTargetSaveRoll() → createStandardSaveRoll()
  Passes rollTools in socketlib options
       |
       v
rollAbility() [GMAction.ts]
  Tries all requested tools to find one the actor owns
  Calls actor.rollToolCheck() with config.midiOptions containing rollTools
       |
       v
rollToolCheck() [patching.ts]
  Reads config.midiOptions.rollTools
  Declares closure: let userExplicitChoice: string | undefined
  If length > 1:
    1. Computes advantage per tool (computeToolAdvantage)
    2. Computes auto-fail/success per tool (computeRollModifiers)
    3. Sets dialog.applicationClass = MidiRollChoiceDialog
    4. Sets dialog.options with rollChoices, advantageByChoice, choiceType="tool"
    5. Wraps buildConfig: delegates to createToolBuildConfig, captures
       formData.get("tool") into userExplicitChoice
    6. Auto-selects best modifier: config.tool = best.value
    7. Forces dialog.configure = true
       |
       v
preRollTool hook
  If multi-tool and NOT all auto-fail:
    Skip applyRollModifiers, force dialogData.configure = true
  If all auto-fail:
    Apply normally (dialog never opens)
       |
       v
D20Roll.build() -> MidiRollChoiceDialog opens
  User selects tool from dropdown
  _onChangeForm updates:
    - this.config.tool (for post-hooks)
    - this._midiDefaultButton (advantage/disadvantage highlight)
    - Window title ("Thieves' Tools" -> "Smith's Tools")
  buildConfig callback (createToolBuildConfig) rebuilds roll parts:
    - Looks up new tool's ability, proficiency, bonuses
    - Uses calculateSkillToolProficiency + D20Roll.constructParts
  Wrapper captures chosen tool into userExplicitChoice
       |
       v
postToolRollConfiguration hook
  Detects tool change (configData.tool != original toolId)
  Updates toolId for downstream processing
  Checks auto-fail/auto-success for chosen tool
       |
       v
Stamp point (after bonusCheck)
  _chosenTool = userExplicitChoice ?? config.tool
  Stamps midiChosenId on roll options
       |
       v
buildSaveDisplayEntry()
  Reads saveRoll.options.midiChosenId
  Looks up long-form label (e.g., "Thieves' Tools Check")
  Prepends label to rollHTML tooltip
```

## Auto-Fail Handling

The `applyRollModifiers()` function sets `dialog.configure = false` when auto-fail is detected, which closes the dialog immediately. For multi-choice rolls (abilities, skills, or tools), this creates a conflict: the first entry might auto-fail but the second might not.

**Solution**: In the pre-roll hook (`preRollSavingThrow`, `preRollSkill`, or `preRollTool`), when multiple choices are available:
- Check if ALL choices would auto-fail
- If yes: apply `applyRollModifiers` normally (dialog closes, roll fails)
- If no: skip `applyRollModifiers`, force dialog open. After the dialog closes, the `postRollConfiguration` hook checks auto-fail for the actually-chosen entry

This means a paralyzed creature with a STR|DEX save choice will see the dialog and can pick DEX (which doesn't auto-fail), but if both abilities auto-fail, the dialog is skipped entirely. The same pattern applies to multi-skill and multi-tool choices.

## Chosen Roll Type Display

When a target has multiple choices, the save tooltip displays which option was actually chosen (e.g., "Dexterity Saving Throw" or "(Athletics) Check").

### How it works

1. **Stamp**: After the roll completes and bonus checks are applied, the chosen ID is stamped on the roll's options as `midiChosenId`. This survives socketlib serialization because `Roll.toJSON()` includes `options`.

2. **Display**: `buildSaveDisplayEntry()` reads `saveRoll.options.midiChosenId` and prepends the long-form label to the rollHTML tooltip using dnd5e's localization keys:
   - Abilities: `DND5E.SavePromptTitle` → "Dexterity Saving Throw"
   - Skills: `DND5E.SkillPromptTitle` → "(Athletics) Check"
   - Tools: `DND5E.ToolPromptTitle` → "Thieves' Tools Check"

3. **Header**: The `saveDisplayFlavor` header shows ALL available choices (e.g., "DC 15 Strength or Dexterity Saving Throw"). This is computed once and does not change per-target.

### The closure variable pattern

dnd5e's `BasicRoll.build` deep-clones the config via `mergeObject(..., {inplace: false})`. This breaks shared object references — writing to `processConfig.midiOptions` inside a `buildConfig` callback modifies the deep-cloned copy, not the original `config.midiOptions` in the wrapper's scope.

**Solution**: Each wrapper (`doRollAbility`, `doRollSkill`, `rollToolCheck`) declares a closure variable `userExplicitChoice`. The `buildConfig` callback is wrapped to capture the user's dropdown selection into this variable. At the stamp point:

```typescript
const _chosenAbility = userExplicitChoice ?? config.ability;
```

- If the user changed the dropdown: `userExplicitChoice` has their explicit choice
- If the user accepted the auto-selected default: `userExplicitChoice` is undefined, falls back to `config.ability` (the auto-selected best)

This pattern also avoids race conditions when multiple targets' rolls are dispatched concurrently — each invocation has its own closure scope.

## ApplicationV2 Frozen Options

Foundry's `ApplicationV2` constructor freezes options via `Object.freeze()`. The `defaultButton` option (controlling which advantage/disadvantage/normal button is highlighted) cannot be modified after construction.

**Solution**: `MidiRollChoiceDialog` declares a mutable instance property `_midiDefaultButton` and overrides `_prepareButtonsContext()` to read from it instead of the frozen `options.defaultButton`:

```typescript
_midiDefaultButton: string | undefined;

async _prepareButtonsContext(context, options) {
  context = await super._prepareButtonsContext(context, options);
  const overrideButton = this._midiDefaultButton;
  if (overrideButton) {
    for (const [key, btn] of Object.entries(context.buttons ?? {})) {
      btn.default = (key === overrideButton);
    }
  }
  return context;
}
```

In `_onChangeForm`, setting `this._midiDefaultButton = preComputed.defaultButton` followed by `render({ parts: ["buttons"] })` correctly updates the button highlight.

## Files Changed

| File | Changes |
|------|---------|
| `src/module/apps/MidiRollChoiceDialog.ts` | New file. Custom dialog extending `D20RollConfigurationDialog` with choice dropdown. Supports ability saves (`choiceType: "ability"`), skill checks (`choiceType: "skill"`), and tool checks (`choiceType: "tool"`). Factory methods `createSaveBuildConfig()`, `createSkillBuildConfig()`, and `createToolBuildConfig()` rebuild roll formula on selection change. Mutable `_midiDefaultButton` property with `_prepareButtonsContext` override for advantage button updates. |
| `src/module/Workflow.ts` | `determineRollTypeAndAction()` returns `rollAbilities[]`, `rollSkills[]`, and `rollTools[]`; iterates `check.associated` Set instead of `.first()`; classifies entries as skills vs tools using `GameSystemConfig.skills`; `buildSaveDetailsForTarget()` pre-computes advantage per ability; all downstream methods pass rollSkills/rollTools through. `buildSaveDisplayEntry()` reads `midiChosenId` from roll options and prepends long-form label (e.g., "Dexterity Saving Throw") to rollHTML tooltip using dnd5e localization keys. |
| `src/module/patching.ts` | `doRollAbility()` detects multiple abilities, sets up `MidiRollChoiceDialog`, auto-selects best modifier, handles auto-fail guard in preRoll hook, detects ability change in post hook. Uses `userExplicitChoice` closure variable with buildConfig wrapper for correct per-target stamping. `doRollSkill()` similarly handles multiple skills with `choiceType: "skill"` and same closure pattern. `rollToolCheck()` handles multiple tools with `choiceType: "tool"`, including `preRollTool` auto-fail guard, `postToolRollConfiguration` hook, and closure-based stamping. |
| `src/module/utils.ts` | `buildRollChoices()` supports `"skill"` and `"tool"` rollTypes; saves use `save?.value`, checks use `mod + checkBonus` for modifier display; `requestPCSave()` shows all skills/tools/abilities joined with "or"; `rollAbilities`, `rollSkills`, and `rollTools` added to `MidiOptions` type |
| `src/module/GMAction.ts` | `rollAbility()` type updated for `rollSkills` and `rollTools` in options; multi-tool item lookup tries all requested tools and uses the first found in the actor's inventory |
| `src/globals.ts` | `ability` and `tool` added to `RollProcessConfig`; `abilities`, `skills`, and `tools` added to `SaveRollInfo`; `advantageByChoice` and `choiceType` (including `"tool"`) added to dialog option types; `dnd5e.postToolRollConfiguration` hook added to HookConfig |
| `lang/en.json` | Added `midi-qol.RollChoice` ("Choose Ability"), `midi-qol.or` ("or"), and `midi-qol.tool-check` ("Tool Check") |

## What Doesn't Change

- **Single-ability saves / single-skill checks / single-tool checks** — entirely unchanged, fast-forward respected
- **Player-owned targets clicking chat card buttons** — dnd5e already renders one button per save ability / per associated skill or tool
- **External module integrations** (Monks Token Bar, Flash Rolls, Epic Rolls) — continue using first ability/skill/tool
- **Save DC display** — unchanged
- **Activity data model** — no schema changes
- **Save display template** (`saves.html`) — unchanged; the chosen roll type label is embedded in `rollHTML` (tooltip), not in the per-target display line
- **Save display header** (`saveDisplayFlavor`) — shows all available choices, not the per-target selection

## MidiRollChoiceDialog API

The dialog is configured via `dialog.applicationClass` and `dialog.options`:

### Multi-ability save example
```typescript
dialog.applicationClass = MidiRollChoiceDialog;
dialog.options = {
  rollChoices: [
    { value: "str", label: "Strength", modifier: "+5" },
    { value: "dex", label: "Dexterity", modifier: "+3" }
  ],
  advantageByChoice: new Map([
    ["str", { hasAdvantage: false, hasDisadvantage: false, defaultButton: "normal" }],
    ["dex", { hasAdvantage: true, hasDisadvantage: false, defaultButton: "advantage" }]
  ]),
  choiceType: "ability",
  buildConfig: MidiRollChoiceDialog.createSaveBuildConfig(actor)
};
dialog.configure = true;
```

### Multi-skill check example
```typescript
dialog.applicationClass = MidiRollChoiceDialog;
dialog.options = {
  rollChoices: [
    { value: "ath", label: "Athletics", modifier: "+7" },
    { value: "acr", label: "Acrobatics", modifier: "+4" }
  ],
  advantageByChoice: new Map([
    ["ath", { hasAdvantage: false, hasDisadvantage: false, defaultButton: "normal" }],
    ["acr", { hasAdvantage: true, hasDisadvantage: false, defaultButton: "advantage" }]
  ]),
  choiceType: "skill",
  buildConfig: MidiRollChoiceDialog.createSkillBuildConfig(actor)
};
dialog.configure = true;
```

### Multi-tool check example
```typescript
dialog.applicationClass = MidiRollChoiceDialog;
dialog.options = {
  rollChoices: [
    { value: "thief", label: "Thieves' Tools", modifier: "+8" },
    { value: "smith", label: "Smith's Tools", modifier: "+5" }
  ],
  advantageByChoice: new Map([
    ["thief", { hasAdvantage: false, hasDisadvantage: false, defaultButton: "normal" }],
    ["smith", { hasAdvantage: false, hasDisadvantage: false, defaultButton: "normal" }]
  ]),
  choiceType: "tool",
  buildConfig: MidiRollChoiceDialog.createToolBuildConfig(actor)
};
dialog.configure = true;
```

- `rollChoices` — array of `{value, label, modifier}` shown in the dropdown; auto-sorted by highest modifier as default selection
- `advantageByChoice` — `Map<string, PreComputedAdvantage>` controlling which advantage button is highlighted when the user switches
- `choiceType` — `"ability"` (default), `"skill"`, or `"tool"` — controls which config property the dropdown reads/writes and the window title format
- `buildConfig` — callback that rebuilds roll formula via `D20Roll.constructParts()` when selection changes; wrapped by the patching code to capture user's explicit choice into a closure variable
- The dropdown only appears when `rollChoices.length > 1`

## Testing Checklist

### Multi-ability saves
1. Create a SaveActivity with `save.ability = Set(["str", "dex"])`
2. GM-controlled target: choice dialog appears showing "STR Save (+X)" and "DEX Save (+Y)", best modifier pre-selected
3. Player-controlled target: item chat card shows both save buttons; request message mentions both
4. Single-ability save: behaves exactly as before, dialog respects fast-forward
5. OverTime with `saveAbility=str|dex`: choice dialog appears for auto-rolled saves
6. Timeout auto-roll with multiple abilities: GM sees choice dialog
7. Paralyzed target with STR|DEX save: dialog opens (DEX doesn't auto-fail)
8. Both abilities auto-fail: dialog skipped, save fails immediately
9. Save tooltip shows "Dexterity Saving Throw" (or whichever was chosen)
10. Multiple targets with different choices: each target's tooltip shows their own chosen ability

### Multi-skill checks
11. Create a CheckActivity with `check.associated = Set(["ath", "acr"])` (Athletics or Acrobatics)
12. GM-controlled target: choice dialog appears showing "Athletics (+X)" and "Acrobatics (+Y)", best modifier pre-selected
13. Player-controlled target: request message mentions both skills joined with "or"
14. Single-skill check: behaves exactly as before
15. Changing skill in dropdown updates the roll formula (different proficiency, ability, bonuses)
16. Window title updates to show the selected skill name
17. Save tooltip shows "(Athletics) Check" (or whichever was chosen)
18. Multiple targets with different choices: each target's tooltip shows their own chosen skill

### Multi-tool checks
19. Create a CheckActivity with `check.associated = Set(["thief", "smith"])` (Thieves' Tools or Smith's Tools)
20. GM-controlled target: choice dialog appears showing "Thieves' Tools (+X)" and "Smith's Tools (+Y)", best modifier pre-selected
21. Player-controlled target: request message mentions both tools joined with "or"
22. Single-tool check: behaves exactly as before
23. Changing tool in dropdown updates the roll formula (different ability, proficiency, bonuses)
24. Window title updates to show the selected tool name
25. Save tooltip shows "Thieves' Tools Check" (or whichever was chosen)
26. Multiple targets with different choices: each target's tooltip shows their own chosen tool
27. Actor without either tool in inventory: auto-fails gracefully
28. Actor with only one of the tools: GMAction finds the available one and rolls it
29. Mixed skills and tools in `check.associated`: falls back to first entry (single roll)

### Advantage button update
30. Switching between choices with different advantage states updates the highlighted button (e.g., normal → advantage)
