# checkSaves Refactoring

This document outlines the refactoring of the `checkSaves` method in midi-qol's Workflow class for improved readability and maintainability.

## Overview

The original `checkSaves` method was a large monolithic function handling save determination, module integration, target processing, and roll queuing. It has been refactored into smaller, focused helper methods.

---

## Refactored Structure

### Main Method: checkSaves()

The main `checkSaves` method now orchestrates the save process by calling helper methods:

```typescript
async checkSaves(whisper = false, simulate = false) {
  this.initSaveResults();
  this.saveRolls = [];
  this.tokenSaves = {};

  // Early exit if no targets
  if (this.hitTargets.size <= 0 && this.hitTargetsEC.size <= 0) {
    this.saveDisplayFlavor = `<span>${i18n("midi-qol.noSaveTargets")}</span>`;
    return;
  }

  // 1. Determine what type of roll is needed
  const { rollAction, rollType, rollAbility, rollSkill, rollTool, flagRollType } =
    this.determineRollTypeAndAction();

  // 2. Compute module integration settings
  const { flags: moduleFlags, requests: moduleRequests } =
    this.computeModuleIntegrationSettings(simulate, flagRollType ?? "");

  // 3. Process each target
  for (let target of allHitTargets) {
    // 3a. Build save details for this target
    const { saveDetails, magicResistance, magicVulnerability } =
      await this.buildSaveDetailsForTarget(target, {...});

    // 3b. Determine roll settings for this target
    const { player, showRollDialog, GMprompt, gmMonksTB, gmFlashTB, gmRER, playerChat } =
      this.determineTargetRollSettings(target, flagRollType, simulate);

    // 3c. Queue the save roll
    const { promise, requestCard } = this.queueTargetSaveRoll({...});
  }

  // 4. Wait for all rolls and process results
  await this.processSaveResults(promises, rollDC, rollType, allHitTargets, moduleRequests);
}
```

---

## Helper Methods

### 1. determineRollTypeAndAction()

Determines what type of roll the activity requires (save, check, skill, tool).

**Returns:**
```typescript
{
  rollAction: string | undefined;   // "save", "check", "skill", "tool"
  rollType: string | undefined;     // "save" or "check"
  rollAbility: string | undefined;  // Ability key (e.g., "dex", "wis")
  rollSkill: string | undefined;    // Skill key if skill check
  rollTool: string | undefined;     // Tool key if tool check
  flagRollType: string | undefined; // Roll type for flags ("save", "check", "skill", "tool")
}
```

**Logic:**
- Checks `this.saveActivity.save` for saving throws
- Checks `this.saveActivity.check` for ability/skill/tool checks
- Returns appropriate identifiers for each roll type

---

### 2. computeModuleIntegrationSettings()

Determines which external modules should handle the rolls.

**Parameters:**
- `simulate: boolean` - Whether this is a simulated roll
- `flagRollType: string` - The type of roll for flag purposes

**Returns:**
```typescript
{
  flags: {
    playerMonksTB: boolean;  // Use Monk's TokenBar for players
    playerFlashTB: boolean;  // Use Flash Rolls for players
    playerEpicRolls: boolean; // Use Epic Rolls for players
  };
  requests: {
    monkRequests: any[];
    flashRequests: any[];
    rerRequests: any[];
  };
}
```

---

### 3. buildSaveDetailsForTarget()

Builds the save configuration for a specific target, including advantage/disadvantage and magic resistance.

**Parameters:**
```typescript
{
  target: Token;
  rollDC: number;
  rollType: string;
  rollAbility: string;
  flagRollType: string;
  isMagicSave: boolean;
  actorDisposition: number;
}
```

**Returns:**
```typescript
{
  saveDetails: {
    advantageMode: number;
    rollDC: number;
    isConcentrationCheck: boolean;
    targetType: string;
    // ... other save configuration
  };
  magicResistance: boolean;
  magicVulnerability: boolean;
}
```

**Processes:**
- Magic resistance/vulnerability
- grants.advantage/disadvantage flags
- Actor-specific modifiers
- Concentration check detection

---

### 4. determineTargetRollSettings()

Determines the roll settings for a specific target based on ownership and configuration.

**Parameters:**
- `target: Token` - The target token
- `flagRollType: string | undefined` - The roll type
- `simulate: boolean` - Whether simulating

**Returns:**
```typescript
{
  player: User | undefined;      // The player who owns the target
  showRollDialog: boolean;       // Whether to show roll dialog
  GMprompt: string | boolean;    // GM prompt mode
  gmMonksTB: boolean;            // Use Monk's TokenBar for GM
  gmFlashTB: boolean;            // Use Flash Rolls for GM
  gmRER: boolean;                // Use Epic Rolls for GM
  playerChat: boolean;           // Use chat for player rolls
}
```

---

### 5. queueTargetSaveRoll()

Queues a save roll for a target using the appropriate handler.

**Parameters:**
```typescript
interface QueueSaveRollOptions {
  target: Token;
  saveDetails: SaveDetails;
  rollInfo: {
    type: string;
    ability?: string;
    skill?: string;
    tool?: string;
    action: string;
  };
  magicInfo: {
    isMagicSave: boolean;
    magicResistance: boolean;
    magicVulnerability: boolean;
  };
  displayOptions: {
    whisper: boolean;
    showRoll: boolean;
    showRollDialog: boolean;
    simulate: boolean;
  };
  playerInfo: {
    player: User | undefined;
    GMprompt: string;
    playerChat: boolean;
  };
  moduleFlags: {
    playerMonksTB: boolean;
    playerFlashTB: boolean;
    playerEpicRolls: boolean;
    gmMonksTB: boolean;
    gmFlashTB: boolean;
    gmRER: boolean;
  };
  moduleRequests: ModuleRequests;
}
```

**Returns:**
```typescript
{
  promise: Promise<Roll[] | Roll | null> | null;
  requestCard: Promise<ChatMessage | undefined> | undefined;
}
```

**Dispatches to:**
- Monk's TokenBar
- Flash Rolls
- Epic Rolls
- Standard dnd5e rolling

---

## Benefits of Refactoring

1. **Improved Readability**: Each helper method has a single responsibility
2. **Easier Testing**: Individual methods can be tested in isolation
3. **Better Maintainability**: Changes to one aspect don't affect others
4. **Clearer Data Flow**: Explicit parameters and return types
5. **Reduced Complexity**: Main method is now an orchestrator, not implementor

---

## Related Changes

### initSaveResults() Call

Added `this.initSaveResults()` at the start of `checkSaves` and in `WorkflowState_WaitForSaves` before early returns to ensure `saveResults` is always initialized:

```typescript
async WorkflowState_WaitForSaves(context) {
  this.initSaveResults();  // Added to prevent undefined saveResults
  if (!this.hasSave) {
    return WorkflowState_SavesComplete;
  }
  // ...
}
```

---

## File Location

All helper methods are defined in:
- `src/module/Workflow.ts`

The main `checkSaves` method is at approximately line 6175, with helpers defined earlier in the class.
