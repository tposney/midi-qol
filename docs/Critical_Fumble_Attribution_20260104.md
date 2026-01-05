# Critical/Fumble Attribution System

This document describes the attack attribution system for tracking why an attack became a critical hit or fumble.

## Overview

The `workflow.attackAdvAttribution` Set tracks the sources of advantage, disadvantage, critical hits, and fumbles for an attack. This information is displayed in the attack roll tooltip when using the "Advantage Attribution" roll display setting.

## Attribution Prefixes

All attribution entries use a prefix to identify the type:

| Prefix | Meaning | Localization Key |
|--------|---------|------------------|
| `ADV:` | Advantage on attack | `midi-qol.AttribADV` |
| `DIS:` | Disadvantage on attack | `midi-qol.AttribDIS` |
| `CRIT:` | Critical hit forced | `midi-qol.AttribCRIT` |
| `NOCRIT:` | Critical hit prevented | `midi-qol.AttribNOCRIT` |
| `FUMBLE:` | Fumble forced | `midi-qol.AttribFUMBLE` |
| `NOFUMBLE:` | Fumble prevented | `midi-qol.AttribNOFUMBLE` |

The prefixes are localized via the `addAdvAttribution()` function in `utils.ts`. Translators can provide localized versions of these labels.

---

## Critical Hit Attribution Sources

### Natural Critical (Roll >= Threshold)

When the d20 result equals or exceeds the critical threshold:

```typescript
// In processAttackRoll()
this.isCritical = this.diceRoll >= criticalThreshold;
if (this.isCritical) {
  this.attackAdvAttribution.add(`CRIT:${game.i18n.localize("DND5E.Roll")} >= ${criticalThreshold}`);
}
```

**Example output:** `CRIT:Roll >= 20`

### Actor Critical Flags

When the attacker has `flags.midi-qol.critical.all` or `flags.midi-qol.critical.{attackType}`:

```typescript
// In processCriticalFlags()
if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.critical.all`, conditionData)) {
  this.critFlagSet = true;
  this.attackAdvAttribution.add(`CRIT:critical.all`);
}

if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.critical.${attackType}`, conditionData)) {
  this.critFlagSet = true;
  this.attackAdvAttribution.add(`CRIT:critical.${attackType}`);
}
```

**Example output:** `CRIT:critical.all`, `CRIT:critical.mwak`

### Target Grants Critical Flags

When a target has `flags.midi-qol.grants.critical`:

```typescript
// grants.critical within range
this.attackAdvAttribution.add(`CRIT:grants.critical.range ${targetName}`);

// grants.critical.all
this.attackAdvAttribution.add(`CRIT:grants.critical.all ${targetName}`);

// grants.critical.{attackType}
this.attackAdvAttribution.add(`CRIT:grants.critical.${attackType} ${targetName}`);
```

**Example output:** `CRIT:grants.critical.all Goblin`, `CRIT:grants.critical.mwak Orc`

**Multi-target behavior:** If ANY target has the grants.critical flag, the attack becomes a critical hit.

### Activity.use Options

When `midiOptions.isCritical` is passed to `activity.use()`:

```typescript
// In MidiActivityMixin._preUse()
if (usage.midiOptions.isCritical) {
  usage.workflow.isCritical = true;
  usage.workflow.attackAdvAttribution.add("CRIT:activity.use");
}
```

**Example output:** `CRIT:activity.use`

---

## No Critical Attribution Sources

### Actor NoCritical Flags

When the attacker has `flags.midi-qol.noCritical.all` or `flags.midi-qol.noCritical.{attackType}`:

```typescript
if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.noCritical.all`, conditionData)) {
  this.noCritFlagSet = true;
  this.attackAdvAttribution.add(`NOCRIT:noCritical.all`);
}

if (await evalAllConditionsAsync(this.actor, `flags.${MODULE_ID}.noCritical.${attackType}`, conditionData)) {
  this.noCritFlagSet = true;
  this.attackAdvAttribution.add(`NOCRIT:noCritical.${attackType}`);
}
```

**Example output:** `NOCRIT:noCritical.all`, `NOCRIT:noCritical.mwak`

### Target Grants NoCritical Flags

When targets have `flags.midi-qol.grants.noCritical`:

```typescript
// Only added when ALL targets have the flag
if (allTargetsGrantNoCrit && this.hitTargets.size > 0) {
  this.noCritFlagSet = true;
  this.attackAdvAttribution.add(`NOCRIT:grants.noCritical ${noCritTargets.join(", ")}`);
}
```

**Example output:** `NOCRIT:grants.noCritical Goblin, Orc`

**Multi-target behavior:** ALL targets must have grants.noCritical for the critical to be prevented.

---

## Fumble Attribution Sources

### Natural Fumble (Roll <= Threshold)

When the d20 result is at or below the fumble threshold:

```typescript
// In processAttackRoll()
this.isFumble = this.diceRoll <= fumbleTarget;
if (this.isFumble) {
  this.attackAdvAttribution.add(`FUMBLE:${game.i18n.localize("DND5E.Roll")} <= ${fumbleTarget}`);
}
```

**Example output:** `FUMBLE:Roll <= 1`

### Target Grants Fumble Flags

When a target has `flags.midi-qol.grants.fumble`:

```typescript
// grants.fumble.all
this.attackAdvAttribution.add(`FUMBLE:grants.fumble.all ${targetName}`);

// grants.fumble.{actionType}
this.attackAdvAttribution.add(`FUMBLE:grants.fumble.${actionType} ${targetName}`);
```

**Example output:** `FUMBLE:grants.fumble.all Goblin`, `FUMBLE:grants.fumble.mwak Orc`

**Multi-target behavior:** If ANY target has the grants.fumble flag, the attack becomes a fumble.

### Activity.use Options

When `midiOptions.isFumble` is passed to `activity.use()`:

```typescript
// In MidiActivityMixin._preUse()
if (usage.midiOptions.isFumble) {
  usage.workflow.isFumble = true;
  usage.workflow.attackAdvAttribution.add("FUMBLE:activity.use");
}
```

**Example output:** `FUMBLE:activity.use`

---

## No Fumble Attribution Sources

### Target Grants NoFumble Flags

When targets have `flags.midi-qol.grants.noFumble`:

```typescript
// Only added when ALL targets have the flag
if (allTargetsGrantNoFumble && this.targets.size > 0) {
  this.isFumble = false;
  this.attackAdvAttribution.add(`NOFUMBLE:grants.noFumble ${noFumbleTargets.join(", ")}`);
}
```

**Example output:** `NOFUMBLE:grants.noFumble Goblin, Orc`

**Multi-target behavior:** ALL targets must have grants.noFumble for the fumble to be prevented.

---

## Multi-Target Behavior Summary

| Flag Type | Multi-Target Behavior |
|-----------|----------------------|
| `grants.critical` | If ANY target has flag, attack crits |
| `grants.noCritical` | ALL targets must have flag to prevent crit |
| `grants.fumble` | If ANY target has flag, attack fumbles |
| `grants.noFumble` | ALL targets must have flag to prevent fumble |

---

## Attack Roll HTML Regeneration

The `attackRollHTML` is generated in `setAttackRoll()` before critical/fumble attribution is added. To display the attribution in the tooltip, the HTML must be regenerated after flags are processed.

### In processCriticalFlags()

```typescript
// After adding CRIT/NOCRIT attribution
if (this.attackRoll && (this.critFlagSet || this.noCritFlagSet) &&
    ["formulaadv", "adv"].includes(configSettings.rollAlternate)) {
  addAdvAttribution(this.attackRoll, this.attackAdvAttribution);
  this.attackRollHTML = await midiRenderAttackRoll(this.attackRoll);
}
```

### In processAttackRoll()

```typescript
// After adding natural crit/fumble and grants.fumble/noFumble attribution
if ((this.isCritical || this.isFumble || fumbleAttributionAdded) &&
    ["formulaadv", "adv"].includes(configSettings.rollAlternate)) {
  addAdvAttribution(this.attackRoll, this.attackAdvAttribution);
  this.attackRollHTML = await midiRenderAttackRoll(this.attackRoll);
}
```

---

## Localization

Attribution prefixes are localized in `addAdvAttribution()` (utils.ts):

```typescript
const prefixMap: Record<string, string> = {
  "ADV:": `${game.i18n.localize("midi-qol.AttribADV")}:`,
  "DIS:": `${game.i18n.localize("midi-qol.AttribDIS")}:`,
  "CRIT:": `${game.i18n.localize("midi-qol.AttribCRIT")}:`,
  "NOCRIT:": `${game.i18n.localize("midi-qol.AttribNOCRIT")}:`,
  "FUMBLE:": `${game.i18n.localize("midi-qol.AttribFUMBLE")}:`,
  "NOFUMBLE:": `${game.i18n.localize("midi-qol.AttribNOFUMBLE")}:`
};
```

**Localization keys in lang/en.json:**
- `midi-qol.AttribADV` = "ADV"
- `midi-qol.AttribDIS` = "DIS"
- `midi-qol.AttribCRIT` = "CRIT"
- `midi-qol.AttribNOCRIT` = "NOCRIT"
- `midi-qol.AttribFUMBLE` = "FUMBLE"
- `midi-qol.AttribNOFUMBLE` = "NOFUMBLE"

---

## Files Modified

- `src/module/Workflow.ts` - processCriticalFlags(), processAttackRoll()
- `src/module/activities/MidiActivityMixin.ts` - _preUse() for activity.use options
- `src/module/utils.ts` - addAdvAttribution() localization
- `lang/en.json` - Localization keys for attribution prefixes

---

## Usage Examples

### Example 1: Natural Critical
Attack roll of 20 against a target:
```
CRIT:Roll >= 20
```

### Example 2: Paralyzed Target (grants critical within range)
Attack roll against a paralyzed goblin within 5 feet:
```
CRIT:grants.critical.range Goblin
```

### Example 3: Actor with Improved Critical
Attacker has `flags.midi-qol.critical.mwak` (crits on 19-20):
```
CRIT:critical.mwak
```

### Example 4: Natural Fumble Prevented by Target
Attack roll of 1 against two targets that both have grants.noFumble:
```
FUMBLE:Roll <= 1
NOFUMBLE:grants.noFumble Target1, Target2
```
(The fumble is prevented because all targets have noFumble)

### Example 5: Programmatic Critical via activity.use
```javascript
await activity.use({ midiOptions: { isCritical: true } });
```
Attribution shows:
```
CRIT:activity.use
```
