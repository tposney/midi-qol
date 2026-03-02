# Midi-QOL Macro Writing Guide

> [!tip] Navigation
> This document covers macro writing for midi-qol. For general module documentation, see [README.md](README.md).

## Table of Contents
- [Getting Started](#getting-started)
- [Triggering Workflows](#triggering-workflows)
- [Item Roll Options](#item-roll-options)
- [MidiQOL API Functions](#midiqol-api-functions)
- [Hooks Reference](#hooks-reference)
- [Workflow Types](#workflow-types)
- [OnUse Macros](#onuse-macros)
- [Damage Bonus Macros](#damage-bonus-macros)
- [Macro Data Reference](#macro-data-reference)
- [DAE vs Midi-QOL Macros](#dae-vs-midi-qol-macros)
- [Tips and Tricks](#tips-and-tricks)
- [Sample Chat Logs](#sample-chat-logs)

## Other Pages

- [Flags](/FLAGS.md)
- [Flowchart](/docs/flowchart.md)
- [Getting Started](/Getting%20Started.md)
- [Readme](/README.md)
- [Workflow Fields](/docs/workflowfields.md)

---

## Getting Started

For modules and macros that want to trigger midi-qol workflows, the recommended approach is to use `activity.use()`. This is the native dnd5e method that midi-qol intercepts to create its workflow.

### Key Accelerators

When triggering via UI or passing an event, key accelerators work as follows (based on speed rolls settings):

| Key | Effect |
|-----|--------|
| `event.altKey: true` | Advantage roll |
| `event.ctrlKey: true` | Disadvantage roll |
| `event.shiftKey: true` | Auto roll the attack roll |

### Legacy Support
- `item.roll()` still works but is deprecated in favor of `activity.use()`
- `MidiQOL.applyTokenDamage` is exported
- `MidiQOL.applyTokenDamageMany` is exported — applies different damage amounts per target with a single damage card

### Roll Complete Hooks
If you have macros that depend on being called when the roll is complete:
- `"midi-qol.RollComplete"`
- `"midi-qol.RollComplete.ItemUuid"` (where ItemUuid is the uuid of the item doing the roll)

---

## Triggering Workflows

### activity.use() (Recommended)

The primary way to trigger a midi-qol workflow is via the dnd5e `activity.use()` method. Midi-qol intercepts this call to create its workflow.

```js
// Get an activity from an item
const item = actor.items.getName("Longsword");

// Get first activity
const activity = item.system.activities.contents[0];

// Or get by activity ID
const activityById = item.system.activities.get("dnd5eactivity000");

// Or get activities by type (returns array)
const attackActivities = item.system.activities.getByType("attack");
const saveActivities = item.system.activities.getByType("save");

// Or find by custom predicate
const namedActivity = item.system.activities.find(a => a.name === "Main Attack");

// Basic usage - triggers midi-qol workflow
await activity.use();

// With configuration options
await activity.use(
  {
    // ActivityUseConfiguration
    consume: { resources: true, spellSlot: true },
    scaling: 3, // Cast at 3rd level for spells
  },
  {
    // RollDialogConfig
    configure: false, // Skip configuration dialog
  },
  {
    // RollMessageConfig
    create: true, // Create chat message
  }
);
```

**ActivityUseConfiguration options:**
| Option | Type | Description |
|--------|------|-------------|
| `consume.resources` | boolean | Consume item resources |
| `consume.spellSlot` | boolean | Consume spell slot |
| `scaling` | number | Spell level or scaling value |
| `midiOptions` | object | Midi-specific options (see below) |

**Midi-specific options (in `midiOptions`):**
| Option | Type | Description |
|--------|------|-------------|
| `activityId` | string | Use specific activity by ID |
| `activityIdentifier` | string | Use specific activity by identifier |
| `advantage` | boolean | Force advantage on attack |
| `asUser` | User \| string | Execute as specified user |
| `checkGMstatus` | boolean | Non-GM clients hand roll to GM client |
| `disadvantage` | boolean | Force disadvantage on attack |
| `fastForward` | boolean | Skip roll dialogs |
| `fastForwardAttack` | boolean | Fast forward attack roll only |
| `fastForwardDamage` | boolean | Fast forward damage roll only |
| `ignoreUserTargets` | boolean | Ignore current user targets |
| `isCritical` | boolean | Force critical hit |
| `simulate` | boolean | Simulate the roll without applying |
| `targetUuids` | string[] | Override targets by UUID |
| `targetsToUse` | Set<Token> | Override targets by token set |
| `workflowOptions` | object | Additional workflow options (see below) |

**WorkflowOptions (in `midiOptions.workflowOptions`):**
| Option | Type | Description |
|--------|------|-------------|
| `allowIncapacitated` | boolean | Allow use while incapacitated |
| `autoRollAttack` | boolean | Auto roll attack |
| `autoRollDamage` | string | `"always"`, `"onHit"`, or `"none"` |
| `isReaction` | boolean | Mark as reaction |
| `noConcentrationCheck` | boolean | Skip concentration check |
| `noOnUseMacro` | boolean | Skip onUse macros |
| `noProvokeReaction` | boolean | Don't provoke reactions |
| `noTargetOnUseMacro` | boolean | Skip target onUse macros |
| `targetConfirmation` | string | Target confirmation mode |

**Example - Triggering with specific targets:**
```js
const item = actor.items.getName("Fireball");
const activity = item.system.activities.contents[0];

// Set targets by UUID
await activity.use({
  midiOptions: {
    targetUuids: [target1.document.uuid, target2.document.uuid]
  }
}, { configure: false }, { create: true });
```

### item.use() (Alternative)

You can also trigger via the item, which will use the item's default activity:

```js
const item = actor.items.getName("Longsword");
await item.use();

// With options
await item.use({
  midiOptions: { advantage: true }
}, { configure: false });
```

---

## Item Roll Options

Additional workflow processing options for `itemRoll(options)`:

| Option | Type | Description |
|--------|------|-------------|
| `lateTargeting` | boolean | Force enable/disable target confirmation |
| `autoRollAttack` | boolean | Force enable/disable auto rolling of the attack |
| `autoFastAttack` | boolean | Force enable/disable fast forwarding of the attack |
| `autoRollDamage` | string | `"always"`, `"onHit"`, or `"none"` |
| `autoFastDamage` | boolean | Force enable/disable fastForward of the damage roll |

Leaving these blank means configured workflow options from the midi-qol configuration panel will apply.

---

## MidiQOL API Functions

### completeActivityUse (Recommended)

```js
async MidiQOL.completeActivityUse(activity, usage, dialog, message)
```

Returns a promise that completes the entire midi-qol workflow for an activity before resolving. This is the recommended API function for programmatic workflow triggering.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `activity` | Activity \| string | Activity object or activity UUID |
| `usage` | ActivityUseConfiguration | Configuration options |
| `dialog` | ActivityDialogConfiguration | Dialog configuration |
| `message` | ActivityMessageConfiguration | Message configuration |

**Usage configuration (first parameter - dnd5e options):**
| Option | Type | Description |
|--------|------|-------------|
| `consume` | object\|false | Consumption settings, or false to skip consumption |
| `consume.action` | boolean | Consume the activation action |
| `consume.resources` | number[] | Array of consumption target indices to consume |
| `consume.spellSlot` | boolean | Consume a spell slot |
| `create` | object\|false | Creation settings, or false to skip creation |
| `create.measuredTemplate` | boolean | Create a measured template |
| `scaling` | number\|false | Scaling level (e.g., 2 = cast 2 levels higher), or false |
| `spell` | object | Spell-specific settings |
| `spell.slot` | string | Spell slot key (e.g., `"spell3"` for 3rd level slot) |
| `concentration` | object | Concentration settings |
| `concentration.begin` | boolean | Begin concentrating on this activity |
| `concentration.end` | string | ID of concentration effect to end |
| `cause` | object | Linked activity settings |
| `cause.activity` | string | Relative UUID of linked activity |
| `cause.resources` | boolean | Whether linked activity has resources |
| `subsequentActions` | boolean | Trigger subsequent actions (default: true) |
| `midiOptions` | object | Midi-specific options (see below) |

**Midi-specific options (in `usage.midiOptions`):**
| Option | Type | Description |
|--------|------|-------------|
| `advantage` | boolean | Force advantage on attack |
| `disadvantage` | boolean | Force disadvantage on attack |
| `fastForward` | boolean | Skip roll dialogs |
| `targetUuids` | string[] | Target these token UUIDs |
| `targetsToUse` | Set<Token> | Target these tokens |
| `checkGMStatus` | boolean | Non-GM clients hand roll to GM client |
| `workflowOptions` | object | Additional workflow processing options |

**Dialog configuration (second parameter):**
| Option | Type | Description |
|--------|------|-------------|
| `configure` | boolean | Show the activity configuration dialog (default: true) |
| `applicationClass` | class | Custom dialog class to use (defaults to `ActivityUsageDialog`) |
| `options` | object | Options passed to the dialog application (position, display settings, etc.) |

**Dialog display options (in `options.display`):**
| Option | Type | Description |
|--------|------|-------------|
| `all` | boolean | Show all sections (default: true) |
| `scaling` | boolean | Show spell scaling section |
| `concentration` | boolean | Show concentration section |
| `consume` | boolean | Show consumption section |

**Message configuration (third parameter):**
| Option | Type | Description |
|--------|------|-------------|
| `create` | boolean | Create a chat message (default: true) |
| `data` | object | Data to merge into the chat message |
| `data.flags` | object | Flags to add to the message |
| `data.content` | string | Override the message content |
| `data.speaker` | object | Override the chat speaker |
| `rollMode` | string | Roll mode: `"publicroll"`, `"gmroll"`, `"blindroll"`, `"selfroll"` |

**Example:**
```js
const item = actor.items.getName("Longsword");
const activity = item.system.activities.contents[0];

const workflow = await MidiQOL.completeActivityUse(activity, {
  midiOptions: {
    targetUuids: [targetToken.document.uuid],
    advantage: true
  }
}, { configure: false }, { create: true });

// workflow contains the completed midi-qol workflow
console.log(workflow.hitTargets); // Set of hit targets
```

**Example - Silent roll with custom roll mode:**
```js
const workflow = await MidiQOL.completeActivityUse(activity, {
  midiOptions: { fastForward: true }
}, {
  configure: false
}, {
  create: true,
  rollMode: "gmroll"  // Only visible to GM
});
```

**Example - No chat message:**
```js
const workflow = await MidiQOL.completeActivityUse(activity, {
  midiOptions: { targetUuids: [target.document.uuid] }
}, { configure: false }, { create: false });
```

### completeItemUse

```js
async MidiQOL.completeItemUse(item, config, dialog, message)
```

Returns a promise that completes the entire midi-qol workflow for the item's default activity before resolving. This is a convenience wrapper around `completeActivityUse`.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `item` | Item \| string | Item object or item UUID |
| `config` | ActivityUseConfiguration | Configuration options |
| `dialog` | RollDialogConfig | Dialog configuration |
| `message` | RollMessageConfig | Message configuration |

**Config options:**
| Option | Type | Description |
|--------|------|-------------|
| `chooseActivity` | boolean | Show activity selection dialog if multiple activities |
| `consume.resources` | boolean | Consume item resources |
| `consume.spellSlot` | boolean | Consume spell slot |
| `scaling` | number | Spell level or scaling value |

**MidiOptions (in `config.midiOptions`):**
| Option | Type | Description |
|--------|------|-------------|
| `activityId` | string | Use specific activity by ID |
| `activityIdentifier` | string | Use specific activity by identifier |
| `checkGMstatus` | boolean | Non-GM clients hand roll to GM client |
| `targetUuids` | string[] | Target these token UUIDs instead of current targets |
| `ignoreUserTargets` | boolean | Ignore current user targets |
| `workflowOptions` | object | Additional workflow processing options |

**Example:**
```js
const item = actor.items.getName("Fireball");
const workflow = await MidiQOL.completeItemUse(item, {
  midiOptions: {
    targetUuids: [target1.document.uuid, target2.document.uuid]
  }
}, { configure: false }, { create: true });

// Use specific activity by identifier
const workflow2 = await MidiQOL.completeItemUse(item, {
  midiOptions: { activityIdentifier: "save" }
});
```

### reactionDialog

```js
async MidiQOL.reactionDialog(actor, triggerTokenUuid, reactionItems, rollFlavor, triggerType, options)
```

Creates a dialog of items that can be called by clicking on the icon.

| Parameter | Type | Description |
|-----------|------|-------------|
| `actor` | Actor5e | The actor who will do the item roll |
| `triggerTokenUuid` | string | UUID of the target token |
| `reactionItems` | Item[] | Array of items to display |
| `rollFlavor` | string | Text/HTML for dialog context |
| `triggerType` | string | Not relevant |
| `options` | object | Additional configuration |

---

## Hooks Reference

The passed workflow is "live" so changes will affect subsequent actions. `preAttackRoll` and `preDamageRoll` will affect the roll about to be done.

**Workflow Hooks:**
| Hook | Returns | Description |
|------|---------|-------------|
| `midi-qol.preTargeting` | boolean | Before targeting. Return false to abort. |
| `midi-qol.preItemRoll` | boolean | Before item roll. Return false to abort. |
| `midi-qol.preAttackRoll` | boolean | Before attack roll. Return false to abort. |
| `midi-qol.preAttackRollConfig` | boolean | Before attack roll configuration (after advantage/disadvantage). Return false to abort. |
| `midi-qol.preCheckHits` | void | Before checking hits |
| `midi-qol.hitsChecked` | void | After hits have been checked |
| `midi-qol.AttackRollComplete` | void | After attack roll complete |
| `midi-qol.preDamageRoll` | boolean | Before damage roll. Return false to abort. |
| `midi-qol.DamageRollComplete` | void | After damage roll complete |
| `midi-qol.preFormulaRoll` | boolean | Before utility formula roll. Return false to abort. |
| `midi-qol.preCheckSaves` | void | Before auto checking saves |
| `midi-qol.postCheckSaves` | void | After saves checked |
| `midi-qol.postActiveEffects` | void | After effects applied |
| `midi-qol.RollComplete` | void | After workflow completed |
| `midi-qol.ReactionFilter` | async | Filter reactions |

**Item/Activity-Specific Hooks:**
All workflow hooks also fire with item/activity UUID suffix:
- `midi-qol.preAttackRoll.{item.uuid}`
- `midi-qol.preAttackRoll.{activity.uuid}`
- `midi-qol.preAttackRollConfig.{item.uuid}`
- `midi-qol.preAttackRollConfig.{activity.uuid}`

**Damage Calculation Hooks:**
| Hook | Returns | Description |
|------|---------|-------------|
| `midi-qol.dnd5ePreCalculateDamage` | boolean | Before damage calculation. Return false to abort. |
| `midi-qol.dnd5eCalculateDamage` | void | After damage calculation |

---

## Workflow Types

### TrapWorkflow

```js
new MidiQOL.TrapWorkflow(actor, item, [targets], {x: number, y: number})
```

Rolls attack and/or damage and applies to passed targets. If item has area template, it will be placed at x,y and targets auto-selected.

### DamageOnlyWorkflow

For applying damage outside of a normal item workflow.

```js
new MidiQOL.DamageOnlyWorkflow(
  actor,           // Actor doing the damage
  token,           // Token of the actor
  damageTotal,     // Total damage amount
  "damageType",    // Damage type (e.g., "radiant", "fire")
  targets,         // Array of target tokens
  damageRoll,      // The Roll object
  {
    flavor: "Description",
    itemCardUuid: workflow.itemCardUuid  // Optional: link to existing card
  }
)
```

### DummyWorkflow

For calling workflow functions without a full workflow:

| Method | Description |
|--------|-------------|
| `async simulateAttack(token)` | Simulate attack roll, sets `workflow.expectedSaveRoll` |
| `async simulateSaves([tokens])` | Simulate saves, returns `workflow.saveResults` |

---

## OnUse Macros

Called during item workflow to customize behavior. Supports both item-based and actor-based macros.

### Specifying Macros

For actor onUse macros, set via active effects:
```
flags.midi-qol.onUseMacroName CUSTOM macro,macroPass
```

**Macro identifiers:**
| Identifier | Description |
|------------|-------------|
| `ItemMacro` | Macro on the item that applied the effect |
| `ItemMacro.uuid/name` | Macro on another item by uuid or name |
| `ActivityMacro` | Activity macro from first activity on source item |
| `ActivityMacro.uuid/id/name` | Activity macro by uuid, identifier, or name |
| `macro name` | World macro by exact name |
| `Compendium.scope.name.macroName/Id` | Compendium macro |
| `function.functionName` | Global function (bound to workflow) |

### Macro Passes

> [!important] **Documentation:** A flowchart is available at [docs/flowchart.md](docs/flowchart.md).
> Data available at each pass: [docs/workflowfields.md](docs/workflowfields.md).

**Item/Actor passes:**
| Pass | Description |
|------|-------------|
| `preTargeting` | Before targeting (*) |
| `preItemRoll` | Before item roll (*) |
| `templatePlaced` | After template placed |
| `preAttackRoll` | Before attack roll |
| `preAttackRollConfig` | Before attack roll configuration |
| `preCheckHits` | After attack, before hit check |
| `postAttackRoll` | After attack adjudicated |
| `preDamageRoll` | Before damage roll |
| `preDamageRollConfig` | Before damage roll configuration |
| `postDamageRoll` | After damage roll |
| `preSave` | Before saves rolled |
| `postSave` | After saves rolled |
| `damageBonus` | When computing damage bonus (item only) |
| `preDamageApplication` | Before damage applied |
| `preActiveEffects` | Before effects applied |
| `postActiveEffects` | After effects applied |
| `all` | Called at each pass above |

**Workflow State Passes (dynamically generated):**

The workflow calls `pre{StateName}` and `post{StateName}` macros when transitioning between states. These are called automatically via `callOnUseMacrosForAction()`. To use these, specify the pass name in your onUse macro configuration.

| Pre Pass | Post Pass | Description |
|----------|-----------|-------------|
| `preStart` | `postStart` | Workflow initialization |
| `preAwaitItemCard` | `postAwaitItemCard` | Waiting for item card display |
| `preAwaitTemplate` | `postAwaitTemplate` | Waiting for template placement |
| `preTemplatePlaced` | `postTemplatePlaced` | Template has been placed |
| `preAoETargetConfirmation` | `postAoETargetConfirmation` | Confirming AoE targets |
| `preValidateRoll` | `postValidateRoll` | Validating the roll |
| `prePreambleComplete` | `postPreambleComplete` | Preamble phase complete |
| `preWaitForAttackRoll` | `postWaitForAttackRoll` | Waiting for attack roll |
| `preAttackRollComplete` | `postAttackRollComplete` | Attack roll finished |
| `preWaitForDamageRoll` | `postWaitForDamageRoll` | Waiting for damage roll |
| `preConfirmRoll` | `postConfirmRoll` | Confirming roll (if enabled) |
| `preRollConfirmed` | `postRollConfirmed` | Roll has been confirmed |
| `preDamageRollStarted` | `postDamageRollStarted` | Damage roll has started |
| `preDamageRollComplete` | `postDamageRollComplete` | Damage roll finished |
| `preWaitForUtilityRoll` | `postWaitForUtilityRoll` | Waiting for utility roll |
| `preUtilityRollComplete` | `postUtilityRollComplete` | Utility roll finished |
| `preWaitForSaves` | `postWaitForSaves` | Waiting for save rolls |
| `preSavesComplete` | `postSavesComplete` | Save rolls finished |
| `preAllRollsComplete` | `postAllRollsComplete` | All rolls finished |
| `preApplyDynamicEffects` | `postApplyDynamicEffects` | Applying active effects |
| `preCleanup` | `postCleanup` | Workflow cleanup |
| `preCompleted` | `postCompleted` | Workflow completed |
| `preRollFinished` | `postRollFinished` | Roll finished (final state) |

> [!note]
> Returning `false` from a pre-state macro or setting `workflow.aborted = true` will abort the workflow.

**Corresponding Hooks:**

For each workflow state, hooks are also called with the pattern:
- `midi-qol.pre{StateName}` / `midi-qol.post{StateName}`
- `midi-qol.pre{StateName}.{item.uuid}`
- `midi-qol.pre{StateName}.{activity.uuid}`
- `midi-qol.premades.pre{StateName}` (for premade automation)

**Target-only passes (actor macros):**
| Pass | Description |
|------|-------------|
| `isTargeted` | Target is targeted |
| `isPreAttacked` | Before target is attacked |
| `isAttacked` | Target is attacked |
| `isHit` | Target is hit |
| `isMissed` | Target is missed |
| `preTargetSave` | Before target rolls save |
| `isAboutToSave` | Target is about to save |
| `isSave` | Target makes a save |
| `isSaveSuccess` | Target succeeds save |
| `isSaveFailure` | Target fails save |
| `preTargetDamageApplication` | Before damage applied to target |
| `isDamaged` | Target is damaged |
| `postTargetEffectApplication` | After effects applied to target |

### Accessing Workflow Data

The `workflow` object is available directly in your macro scope:

```js
// Access workflow properties
console.log(workflow.hitTargets);
console.log(workflow.damageTotal);

// Modify workflow
workflow.someProperty = value;
```

### Changing Damage Roll

```js
// In a postDamageRoll macro pass
const damageRoll = await new Roll("1d10").evaluate();
workflow.setDamageRoll(damageRoll);
```

---

## Damage Bonus Macros

Called after hits/saves adjudicated but BEFORE damage applied. Not dependent on specific item - called whenever damage is rolled by that character.

**Return format:**
```js
return [{damageRoll: "2d6", flavor: "fire"}]
```

Damage returned via damage bonus will NOT be increased for critical hits.

---

## Macro Data Reference

Data passed to OnUse and DamageBonus macros in `args[0]`:

**Core Data:**
| Field | Description |
|-------|-------------|
| `actor` | The actor using the item |
| `actorData` | actor.toObject(false) |
| `actorUuid` | Actor UUID |
| `tokenUuid` | Token UUID |
| `item` | item.toObject(false) with uuid property |
| `itemData` | Same as item |
| `itemUuid` | Item UUID |
| `workflow` | The workflow object |
| `workflowId` | Workflow ID |
| `id` | Workflow ID |

**Roll Data:**
| Field | Description |
|-------|-------------|
| `attackRoll` | Roll object for attack |
| `attackTotal` | Attack total |
| `attackD20` | The d20 roll result |
| `diceRoll` | Same as attackD20 |
| `advantage` | true if rolled with advantage |
| `disadvantage` | true if rolled with disadvantage |
| `isCritical` | true if critical hit |
| `isFumble` | true if fumble |
| `damageRoll` | Roll object for damage |
| `damageRolls` | Array of damage rolls |
| `damageTotal` | Damage total |
| `damageDetail` | Array of DamageDescription (see below) |
| `rawDamageDetail` | Raw damage before resistances/immunities |
| `damageList` | Array of DamageListEntry per target (see below) |
| `otherDamageTotal` | Other Roll damage total |
| `otherDamageDetail` | Other Roll damage detail |
| `rawOtherDamageDetail` | Raw other damage before resistances |
| `bonusDamageRoll` | Bonus damage roll |
| `bonusDamageRolls` | Array of bonus damage rolls |
| `bonusDamageTotal` | Bonus damage total |
| `bonusDamageDetail` | Bonus damage detail |
| `rawBonusDamageDetail` | Raw bonus damage before resistances |

**DamageDescription (damageDetail array elements):**
| Field | Type | Description |
|-------|------|-------------|
| `value` | number | Damage amount |
| `type` | string | Damage type (e.g., "fire", "slashing", "healing") |
| `properties` | Set\<string\> | Damage properties (e.g., "magical", "silver") |
| `active.multiplier` | number | Damage multiplier applied (0.5 for resistance, 2 for vulnerability) |
| `active.resistance` | boolean | Resistance was applied |
| `active.vulnerability` | boolean | Vulnerability was applied |
| `active.immunity` | boolean | Immunity was applied |
| `active.absorption` | boolean | Damage was absorbed (healed instead) |
| `active.DR` | boolean | Damage reduction was applied |
| `active.saved` | boolean | Target saved against this damage |
| `active.superSaver` | boolean | Super saver applied (no damage on save) |
| `active.semiSuperSaver` | boolean | Semi-super saver applied |

**DamageListEntry (damageList array elements):**

Each entry represents damage applied to a specific target:

| Field | Type | Description |
|-------|------|-------------|
| `actorUuid` | string | Target actor UUID |
| `targetUuid` | string | Target token UUID |
| `rawDamageDetail` | DamageDescription[] | Damage before resistances/immunities |
| `damageDetail` | DamageDescription[] | Damage after resistances/immunities |
| `totalDamage` | number | Total damage after all modifiers |
| `hpDamage` | number | HP damage applied |
| `tempDamage` | number | Temp HP damage applied |
| `oldHP` | number | HP before damage |
| `newHP` | number | HP after damage |
| `oldTempHP` | number | Temp HP before damage |
| `newTempHP` | number | Temp HP after damage |
| `isHit` | boolean | Target was hit |
| `wasHit` | boolean | Target was hit (same as isHit) |
| `saved` | boolean | Target saved |
| `superSaver` | boolean | Target has super saver |
| `semiSuperSaver` | boolean | Target has semi-super saver |
| `critical` | boolean | Attack was critical |
| `details` | string[] | Human-readable damage breakdown |

**Example - Checking damage reduction:**
```js
// In preDamageApplication or postActiveEffects
for (const entry of workflow.damageList) {
  const rawTotal = entry.rawDamageDetail.reduce((sum, d) => sum + d.value, 0);
  const actualTotal = entry.damageDetail.reduce((sum, d) => sum + d.value, 0);
  const reduction = rawTotal - actualTotal;
  console.log(`${entry.targetUuid}: ${rawTotal} raw -> ${actualTotal} actual (${reduction} reduced)`);
}
```

**Important: Fields recalculated when applying damage**

When damage is applied via GM action, the following fields are **recalculated** from `damageDetail` and `rawDamageDetail` (the pre-calculated values are ignored):
- `hpDamage` - recalculated from damageDetail
- `tempDamage` - recalculated from damageDetail
- `totalDamage` - recalculated from damageDetail
- `newHP` - recalculated based on actor's current HP
- `newTempHP` - recalculated based on actor's current temp HP
- `rawTotalDamage` - recalculated from rawDamageDetail

**Fields that ARE used when applying damage:**
- `damageDetail` - **source of truth** for final damage calculation
- `rawDamageDetail` - used for raw damage display and undo
- `calcDamageOptions` - passed to dnd5e damage hooks
- `actorUuid`, `targetUuid` - target identification
- `wasHit` - determines if damage should apply
- `oldHP`, `oldVitality`, `newVitality` - HP tracking

This means if you modify `damageDetail` in `preDamageApplication`, the changes will be applied. Modifying `hpDamage` directly will have no effect.

**Target Data:**
| Field | Description |
|-------|-------------|
| `targets` | Array of token documents |
| `targetUuids` | Array of target UUIDs |
| `hitTargets` | Token documents that were hit |
| `hitTargetUuids` | UUIDs of hit targets |
| `hitTargetsEC` | Hit targets (extra critical) |
| `hitTargetUuidsEC` | UUIDs of EC hit targets |

**Save Data:**
| Field | Description |
|-------|-------------|
| `saves` | Token documents that made saves |
| `saveUuids` | UUIDs of saved targets |
| `failedSaves` | Token documents that failed saves |
| `failedSaveUuids` | UUIDs of failed saves |
| `criticalSaves` | Token documents with critical saves |
| `criticalSaveUuids` | UUIDs of critical saves |
| `fumbleSaves` | Token documents with fumbled saves |
| `fumbleSaveUuids` | UUIDs of fumbled saves |
| `superSavers` | Token documents with super saver |
| `superSaverUuids` | UUIDs of super savers |
| `semiSuperSavers` | Token documents with semi-super saver |
| `semiSuperSaverUuids` | UUIDs of semi-super savers |

**Spell/Item Data:**
| Field | Description |
|-------|-------------|
| `spellLevel` | Spell/item level |
| `castLevel` | Same as spellLevel |
| `castData` | Cast data object |
| `rollData` | actor.getRollData() |
| `rollOptions` | Roll options object |
| `workflowOptions` | Workflow options |

**Macro Context:**
| Field | Description |
|-------|-------------|
| `tag` | `"OnUse"` or `"DamageBonus"` |
| `macroPass` | Current macro pass name |
| `speaker` | Chat speaker data |
| `sourceItemUuid` | UUID of source item (for ItemMacro) |
| `event` | Triggering event |

**Template Data:**
| Field | Description |
|-------|-------------|
| `templateId` | Template ID (deprecated) |
| `templateUuid` | Template UUID (preferred) |

**Chat Data:**
| Field | Description |
|-------|-------------|
| `itemCardUuid` | Chat message UUID |
| `uuid` | Item UUID (deprecated, use itemUuid) |

### Chat Card Integration

The combo card has special divs for adding data:
```html
<div class="midi-qol-attack-roll"></div>
<div class="midi-qol-damage-roll"></div>
<div class="midi-qol-hits-display"></div>
<div class="midi-qol-saves-display"></div>
```

---

## DAE vs Midi-QOL Macros

| Aspect | DAE | Midi-QOL |
|--------|-----|----------|
| **Trigger** | Effect applied/removed | Item used |
| **Requires midi** | No | Yes |
| **Workflow access** | Limited (via passed args) | Full |
| **Execution client** | Owner of actor with effect | Client doing workflow |
| **Specification** | Effect key (macro.execute, macro.ItemMacro) | Item details or actor flags |

### DAE Macro Arguments

```
macro.execute CUSTOM myWorldMacro @targetUuid @actorUuid @attributes.hp.value ##attributes.hp.value
```

| Arg | Value |
|-----|-------|
| `args[0]` | "on" or "off" |
| `args[1]` | Target token UUID |
| `args[2]` | Actor UUID applying effect |
| `args[3]` | HP of actor causing effect |
| `args[4]` | HP of actor with effect |
| `args[args.length - 1]` | lastArg data |

**Named arguments (v11+):**
```
theTargetUuid=@targetUuid
```
Populates `scope.theTargetUuid` and `theTargetUuid`.

---

## Tips and Tricks

### Storing Temporary Data

```js
// Client-only (resets on reload)
foundry.utils.setProperty(actor, "flags.mymodule.temp", value)
foundry.utils.getProperty(actor, "flags.mymodule.temp")

// Persistent (survives reload, visible to all clients)
await actor.setFlag("mymodule", "key", value)
await actor.getFlag("mymodule", "key")
```

### Which Macro Type to Use?

| Type | Use Case |
|------|----------|
| `macro.execute/ItemMacro` | Change fields that shouldn't use active effects (tempHP, HP). Called when effect applied/removed. |
| `OnUse macros` | Do something when item used, even if attack missed. Execute within workflow context. |
| `DamageBonusMacro` | Add damage to any attack (sneak attack, hunter's mark). Not item-specific. |

### Simple Activity Trigger Example

Triggering an item's activity from a macro:

```js
// Get the actor and item
const actor = game.actors.getName("Fighter");
const item = actor.items.getName("Longsword");

// Get the attack activity (first activity, or find by identifier)
const activity = item.system.activities.contents[0];
// Or: item.system.activities.find(a => a.identifier === "attack")

// Trigger the workflow with specific targets
const targets = Array.from(game.user.targets);
await activity.use({
  midiOptions: {
    targetUuids: targets.map(t => t.document.uuid)
  }
}, { configure: false }, { create: true });
```

### Programmatic Damage Application Example

Using `completeActivityUse` for full workflow control:

```js
// Create a temporary item for damage application
const damageItemData = {
  name: "Spirit Guardians Damage",
  type: "feat",
  img: "icons/magic/holy/barrier-shield-winged-cross.webp",
  system: {
    activities: {
      dnd5eactivity000: {
        type: "save",
        name: "Spirit Guardians",
        save: {
          ability: "wis",
          dc: { calculation: "", formula: "15" }
        },
        damage: {
          parts: [{ custom: { enabled: true, formula: "3d8" }, types: ["radiant"] }],
          onSave: "half"
        },
        target: { affects: { type: "creature" } }
      }
    }
  },
  flags: { "midi-qol": { noProvokeReaction: true } }
};

const tempItem = new CONFIG.Item.documentClass(damageItemData, { parent: actor });
const activity = tempItem.system.activities.contents[0];

// Run the workflow
const workflow = await MidiQOL.completeActivityUse(activity, {
  midiOptions: { targetUuids: [targetToken.document.uuid] }
}, { configure: false }, { create: true });
```

---

## Sample Chat Logs

![No Combo Card](pictures/nocombo.png) ![Combo Card](pictures/combo.png)
