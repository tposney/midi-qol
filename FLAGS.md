# Midi-QOL Flags Reference

This document is a reference for `flags.midi-qol.*` flags that can be set via Active Effects.

## Table of Contents

- [Setting Flags via Active Effects](#setting-flags-via-active-effects)
- [Flag Access Types](#flag-access-types)
- [Conditional Expression Evaluation](#conditional-expression-evaluation)
- [Absorption](#absorption)
- [Advantage](#advantage)
- [Disadvantage](#disadvantage)
- [No Advantage](#no-advantage)
- [No Disadvantage](#no-disadvantage)
- [Critical Hits](#critical-hits)
- [No Critical](#no-critical)
- [Fumble](#fumble)
- [No Fumble](#no-fumble)
- [Auto-Fail](#auto-fail)
- [Auto-Success](#auto-success)
- [Grants (Target Effects)](#grants-target-effects)
- [Magic Resistance/Vulnerability](#magic-resistancevulnerability)
- [Min/Max Rolls](#minmax-rolls)
- [Damage Modifiers](#damage-modifiers)
- [Range Modifiers](#range-modifiers)
- [Save Modifiers](#save-modifiers)
- [Optional Bonus Effects](#optional-bonus-effects)
- [Special Flags](#special-flags)
- [Action Tracking](#action-tracking)
- [Item Flags](#item-flags)
- [Native dnd5e Alternatives](#native-dnd5e-alternatives)
- [Deprecated Flags](#deprecated-flags)

## Other Pages

- [Flowchart](/docs/flowchart.md)
- [Getting Started](/Getting%20Started.md)
- [Macros](/MACROS.md)
- [Readme](/README.md)
- [Workflow Fields](/docs/workflowfields.md)

---

## Setting Flags via Active Effects

All midi-qol flags should be set using **CUSTOM** mode in Active Effects. The CUSTOM mode triggers midi-qol's special processing via `midiCustomEffect()`.

**Example:** `flags.midi-qol.advantage.attack.all CUSTOM 1`

### How CUSTOM Mode Processing Works

When an Active Effect with CUSTOM mode is applied, midi-qol processes the value based on the flag type:

| Flag Category | Value Processing |
|---------------|------------------|
| **Deferred Evaluation Flags** | Value stored as-is, evaluated later when the flag is checked |
| **String Flags** (onUseMacroName, DR.all, etc.) | Value stored as string |
| **Number Flags** (DR.{attackType}) | Value parsed as number |
| **Boolean Flags** (default) | Value evaluated as conditional expression once, when the actor is prepared, with the actor's roll data only |

### BooleanFormula Fields

Many midi-qol flags are registered as **BooleanFormula** fields with DAE. BooleanFormula is a custom field type (provided by DAE's `BooleanFormulaField` class) that accepts either a boolean value (`true`/`false`) or a string expression that is evaluated at runtime as a conditional formula. In the DAE Active Effect editor, BooleanFormula fields show a specialized input that allows entering either a simple toggle or a conditional expression.

Flags marked as **BooleanFormula** in the sections below accept:
- `1`, `true` — always active
- `0`, `false` — never active
- A conditional expression string (e.g., `abilities.str.mod >= 3`) — evaluated at runtime

All **Evaluated** flags in the advantage, disadvantage, noAdvantage, noDisadvantage, fail, success, critical, noCritical, fumble, noFumble, grants, magicResistance, and magicVulnerability categories are BooleanFormula fields.

Additionally, the following special flags are BooleanFormula: `neverTarget`, `ignoreNearbyFoes`, `potentCantrip`, `sculptSpells`, `carefulSpells`, `sharpShooter`, `uncanny-dodge`, `inMotion`, `advantage.concentration`, `disadvantage.concentration`, `noAdvantage.concentration`, `noDisadvantage.concentration`, `fail.disadvantage.heavy`, and `canFlank`. Of these, only `ignoreNearbyFoes`, `canFlank`, `sharpShooter`, `fail.disadvantage.heavy` (and `ignoreCover`) are evaluated per use; `neverTarget`, `potentCantrip`, `sculptSpells`, `carefulSpells`, `uncanny-dodge`, `inMotion` and `ignoreWalls` are read as stored truthy values, so a condition expression there is evaluated at most once, when the actor is prepared.

> [!note]
> Initiative advantage/disadvantage flags use the `flags.dnd5e.*` namespace, not `flags.midi-qol.*`. Use `flags.dnd5e.initiativeAdv`, `flags.dnd5e.initiativeDisadv`, etc. They are registered in the DAE field browser under midi-qol for convenience, but the actual initiative code checks the dnd5e flag paths.

**Deferred evaluation flags** are exactly:
- `flags.midi-qol.optional.*` - Optional bonus effects
- `flags.midi-qol.advantage.*` / `disadvantage.*` - Advantage/disadvantage conditions
- `flags.midi-qol.grants.*` - Target-applied effects
- `flags.midi-qol.fail.*` - Auto-fail conditions
- `flags.midi-qol.critical.*` / `noCritical.*` - Critical hit modifications
- `flags.midi-qol.superSaver.*` / `semiSuperSaver.*` - Save damage modifications
- `flags.midi-qol.max.damage.*` / `min.damage.*` - Damage roll extremes
- `flags.midi-qol.OverTime` - Overtime effect definitions
- `flags.midi-qol.rangeOverride.*` - Range override conditions
- `flags.midi-qol.ignoreCover` / `ignoreWalls` - Cover/wall ignore conditions

Everything else is **not** deferred, including `success.*`, `noAdvantage.*`, `noDisadvantage.*`, `fumble.*`, `noFumble.*`, `magicResistance.*` / `magicVulnerability.*`, `range.*` / `long.*` and the [special flags](#special-flags). A CUSTOM expression for one of those is evaluated once, when the actor is prepared, with only the actor's roll data (no target, item, activity or workflow); write such conditions as plain values, or use a deferred flag where one exists.

For deferred flags, the value can be:
- `true`, `1` → stored as boolean `true`
- `false`, `0` → stored as boolean `false`
- Any other string → stored as-is for later conditional evaluation

### Special Value Handling

#### onUseMacroName Flag

The `flags.midi-qol.onUseMacroName` flag has special processing. The value format is:

```
MacroReference, passType
```

Where `MacroReference` can be:
- blank (`, passType`) - The effect's own macro: its activity's macro if it has one, else its item's macro. A change with no `passType` is ignored and reported in the Troubleshooter.
- `ItemMacro` - Calls the item's macro (automatically rewritten to include item UUID)
- `ItemMacro.{itemUuid}` - Calls a specific item's macro
- `ActivityMacro` - Calls the activity's macro (automatically rewritten to include activity UUID)
- `ActivityMacro.{activityUuid}` - Calls a specific activity's macro
- `ActivityMacro.{activityName}` - Calls activity by name (resolved to UUID)
- `Macro.{macroName}` - Calls a world/compendium macro

And `passType` is the macro pass (e.g., `preItemRoll`, `postActiveEffects`, etc.)

**Automatic Rewriting:**

| Input Value | Rewritten To |
|-------------|--------------|
| `ItemMacro` (on transferred effect) | `ItemMacro.{parentItemUuid}` |
| `ItemMacro` (on non-transferred effect) | `ItemMacro.{originItemUuid}` |
| blank (effect's activity has a macro) | `ActivityMacro.{effectActivityUuid}` |
| blank (otherwise, effect's item has a macro) | `ItemMacro`, then rewritten as above |
| `ActivityMacro` (effect applied by an activity) | `ActivityMacro.{effectActivityUuid}` (the effect's own activity) |
| `ActivityMacro` (otherwise, on transferred effect) | `ActivityMacro.{firstActivityUuid}` |
| `ActivityMacro` (otherwise, on non-transferred effect) | `ActivityMacro.{originFirstActivityUuid}` |
| `ActivityMacro.{name}` | `ActivityMacro.{resolvedActivityUuid}` |

The final stored value includes the origin item UUID appended with `|`:
```
[passType]MacroReference|originItemUuid
```

Multiple onUseMacroName effects are concatenated with commas.

## Flag Access Types

Flags are accessed in two ways:

| Access Type | Description |
|-------------|-------------|
| **Evaluated** | Value is treated as a conditional expression and evaluated using `evalCondition()`. Can contain roll data references like `@abilities.str.mod > 2` |
| **Direct** | Value is read directly as a number, boolean, or string without expression evaluation |
| **Formula** | Value is a roll formula (number or dice) |
| **Mapped** | Not read by midi: when the effect is applied the flag is mapped to the dnd5e field given |
| **Special** | Custom processing logic (see count format options, bonus values) |

Each section below indicates the access type for its flags.

## Conditional Expression Evaluation

Flags marked as **Evaluated** can contain conditional expressions. These expressions are evaluated at runtime using `evalCondition()`.

### Basic Syntax

| Value | Result |
|-------|--------|
| `1`, `true` | Always active |
| `0`, `false` | Never active |
| `expression` | Evaluated - truthy result = active |

### Data References

The condition data is available directly in expressions. The `@` prefix is optional - both forms work:

```
abilities.str.mod >= 3           // Direct access (preferred)
@abilities.str.mod >= 3          // Also works (Roll formula syntax)

attributes.hp.value < attributes.hp.max / 2
classes.barbarian.levels >= 5
item.level >= 3
details.cr >= 10
```

> [!note]
> The `@` syntax uses `Roll.replaceFormulaData()` for substitution, while direct access uses the sandbox proxy. Both produce the same result.

### Available Data in Expressions

**Actor Data (from `actor.getRollData()`):**
| Path | Description |
|------|-------------|
| `abilities.{abl}.mod` | Ability modifier (str, dex, con, int, wis, cha) |
| `abilities.{abl}.value` | Ability score |
| `abilities.{abl}.save` | Save bonus |
| `attributes.hp.value` | Current HP |
| `attributes.hp.max` | Maximum HP |
| `attributes.hp.temp` | Temporary HP |
| `attributes.ac.value` | Armor Class |
| `attributes.prof` | Proficiency bonus |
| `attributes.spelldc` | Spell save DC |
| `classes.{className}.levels` | Class level |
| `details.level` | Character level |
| `details.cr` | Challenge Rating (NPCs) |
| `resources.primary.value` | Primary resource value |
| `flags` | Actor flags |
| `actor.raceOrType` | Actor's race or creature type |
| `actor.typeOrRace` | Actor's creature type or race |
| `items` | Array of actor's item roll data |
| `equippedItems` | Array of actor's equipped item roll data |

**Item Data:**
| Path | Description |
|------|-------------|
| `item.level` | Item/spell level |
| `item.type` | Item type |
| `item.attunement` | Attunement status |
| `item.equipped` | Is item equipped |
| `isAttuned` | Is the item attuned |

**Target Data (when a target exists):**
| Path | Description |
|------|-------------|
| `target.abilities.{abl}.mod` | Target's ability modifier |
| `target.attributes.hp.value` | Target's current HP |
| `target.attributes.ac.value` | Target's AC |
| `target.details.cr` | Target's CR |
| `target.raceOrType` | Target's race or creature type |
| `target.typeOrRace` | Target's creature type or race |
| `target.saved` | Target saved (in workflow) |
| `target.failedSave` | Target failed save |
| `target.superSaver` | Target is a super saver |
| `target.semiSuperSaver` | Target is a semi-super saver |
| `target.isHit` | Target was hit |
| `target.isHitEC` | Same as `target.isHit` |
| `target.system` | The target actor's `system` data (not just its roll data) |
| `target.isCombatTurn` | Is target's combat turn |
| `target.items` | Array of target's item roll data |
| `target.equippedItems` | Array of target's equipped item roll data |
| `target.canSee` | Target can see actor |
| `target.canSense` | Target can sense actor |
| `canSee` | Actor can see target |
| `canSense` | Actor can sense target |
| `raceOrType` | Same as target.raceOrType |
| `typeOrRace` | Same as target.typeOrRace |

**Workflow Data (when in a workflow):**
| Path | Description |
|------|-------------|
| `workflow` or `w` | The full workflow object |
| `activity` or `a` | The activity being used |
| `hasSave` | Activity has a save |
| `hasAttack` | Activity has an attack |
| `hasDamage` | Activity has damage |
| `shouldRollDamage` | Should roll damage |
| `damageTypes.{type}` | Damage includes this type (fire, cold, etc.) |
| `riderStatuses.{status}` | Effect applies this status |
| `otherDamageActivity` | The activity rolling the workflow's other damage, if any |

**Effect Data (when the condition belongs to an effect):**
| Path | Description |
|------|-------------|
| `effect` | The active effect |
| `stackCount` | The effect's stack count |

**Combat Data:**
| Path | Description |
|------|-------------|
| `combatRound` | Current combat round |
| `combatTurn` | Current combat turn |
| `combatTime` | Round + turn/100 |
| `isCombatTurn` | Is actor's combat turn |
| `actor.isCombatTurn` | Same as above |

**UUID and ID References:**
| Path | Description |
|------|-------------|
| `tokenUuid` | Actor/caster's token UUID |
| `targetUuid` | Target's token UUID |
| `targetActorUuid` | Target actor's UUID |
| `targetId` | Target's token ID |
| `targetActorId` | Target actor's ID |

**Special Values:**
| Path | Description |
|------|-------------|
| `humanoid` | Array of humanoid race strings: `["human", "humanoid", "elven", "elf", "half-elf", "drow", "dwarf", "dwarven", "halfling", "gnome", "tiefling", "orc", "dragonborn", "half-orc"]` |
| `worldTime` | Game world time |
| `isConcentrationCheck` | Is this a concentration check |
| `isDeathSave` | Is this a death save |
| `CONFIG` | Foundry CONFIG object |
| `CONST` | Foundry CONST object |

### Helper Functions

These functions are available in expressions. Actor/token parameters accept UUIDs (use `tokenUuid`, `targetUuid`):

| Function | Description |
|----------|-------------|
| `hasCondition(actorOrUuid, "condition")` | Returns 1 if actor has condition, 0 otherwise |
| `checkIncapacitated(actorOrUuid)` | Returns condition name if incapacitated, false otherwise |
| `checkDefeated(actorOrUuid)` | Returns 1 if defeated, 0 otherwise |
| `findNearby(disposition, tokenOrUuid, distance, options)` | Returns array of nearby tokens |
| `findNearbyCount(disposition, tokenOrUuid, distance, options)` | Returns count of nearby tokens |
| `checkNearby(disposition, tokenOrUuid, distance, options)` | Returns true if any nearby |
| `canSee(tokenOrUuid, targetOrUuid)` | Returns true if token can see target |
| `canSense(tokenOrUuid, targetOrUuid)` | Returns true if token can sense target |
| `computeDistance(token1OrUuid, token2OrUuid, options)` | Returns distance between tokens |
| `fromUuidSync(uuid)` | Synchronously retrieves document by UUID |
| `Roll` | Foundry Roll class |
| `abs()`, `floor()`, `ceil()`, `min()`, `max()`, etc. | Math functions (use directly without `Math.` prefix) |
| `getDistance(token1OrUuid, token2OrUuid, options)` | Returns distance between tokens using the *Distance Measurement* setting (preferred over `computeDistance`, agrees with midi's range checks) |
| `checkDistance(token1, token2, distance, options)` | Returns true if the tokens are within `distance` |
| `checkActivityRange(activity, tokenOrUuid, targets)` | Checks an activity's range from a token to targets |
| `sizeNumeric(size)` | Numeric value of a size (e.g. `"med"`) |
| `combat` | The current combat (`game.combat`) |
| `contestedRoll(...)`, `confirm(...)` | Only in conditions evaluated asynchronously (they return promises) |
| `evalRaceOrType(actorOrUuid)` | Returns race or type (lowercase), prefers race |
| `evalTypeOrRace(actorOrUuid)` | Returns type or race (lowercase), prefers type. `evalTypeOrRaceEval` is a legacy alias |

**findNearby options:**
```js
{
  includeIncapacitated: false,  // Include incapacitated tokens
  includeToken: false,          // Include the source token
  canSee: false,                // Only tokens that can sense the source
  isSeen: false,                // Only tokens the source can sense
  relative: true,               // Disposition is relative to the source token's own disposition
  maxSize: undefined            // Only tokens whose width * height is at most this
}
```

**disposition values** (with the default `relative: true`, compared with the source token's own disposition):
- `-1` = Opposite to the source token's disposition (enemies of a friendly or hostile token)
- `0` = Neutral
- `1` = Same as the source token's disposition (allies)
- `null` = Any disposition

With `relative: false`, `-1`/`0`/`1` are the absolute Hostile/Neutral/Friendly dispositions. Strings (`"Hostile"`, `"Friendly"`, `"all"`...) and arrays are also accepted.

### Expression Examples

**Simple conditions:**
```
1                                    // Always active
abilities.str.mod >= 3               // STR mod 3 or higher
attributes.hp.value < attributes.hp.max / 2   // Below half HP
classes.barbarian.levels >= 3        // Barbarian level 3+
```

**Using helper functions:**
```
hasCondition(tokenUuid, "raging")       // Actor has raging condition
!checkIncapacitated(tokenUuid)          // Actor not incapacitated
findNearbyCount(-1, tokenUuid, 5) >= 1  // Enemy within 5 feet of actor
hasCondition(targetUuid, "frightened")  // Target is frightened
canSee(tokenUuid, targetUuid)           // Actor can see target
```

**Complex conditions:**
```
abilities.str.mod >= 3 && classes.fighter.levels >= 5
target.details.cr >= 10 || target.attributes.hp.max >= 100
hasCondition(tokenUuid, "raging") && attributes.hp.value > 0
```

**Damage type conditions:**
```
damageTypes.fire                    // Attack deals fire damage
damageTypes.radiant || damageTypes.fire   // Fire or radiant
```

**Race/type conditions:**
```
raceOrType === "undead"             // Target is undead
humanoid.includes(raceOrType)       // Target is humanoid
["fiend", "undead"].includes(target.raceOrType)  // Fiend or undead
```

### Complex Effect Example: Protection from Evil and Good

This spell protects a creature against aberrations, celestials, elementals, fey, fiends, and undead. Those creature types have disadvantage on attacks against the protected creature, and the protected creature has advantage on saving throws against their effects.

| Attribute Key | Change Mode | Effect Value |
|---------------|-------------|--------------|
| `flags.midi-qol.grants.disadvantage.attack.all` | CUSTOM | `["aberration","celestial","elemental","fey","fiend","undead"].includes(actor.raceOrType)` |
| `flags.midi-qol.advantage.save.all` | CUSTOM | `["aberration","celestial","elemental","fey","fiend","undead"].includes(actor.raceOrType)` |

**How it works:**
- The effect is applied to the **target** (the protected creature)
- `grants.disadvantage.attack.all`: When a creature attacks the target, `actor.raceOrType` refers to the **attacker's** creature type - if it matches, the attacker has disadvantage
- `advantage.save.all`: When the target makes a saving throw, `actor.raceOrType` refers to the **attacker's** creature type (the one forcing the save) - if it matches, the target has advantage on the save

### Conditional Values in Active Effects

For Active Effects with CUSTOM mode, use ternary operators for conditional values:

```
Key: flags.midi-qol.advantage.attack.all
Mode: CUSTOM
Value: hasCondition(tokenUuid, "raging") ? 1 : false
```

The expression is evaluated as JavaScript, and the result determines the flag value.

**Format:** `condition ? valueIfTrue : valueIfFalse`

| Example Value | Meaning |
|---------------|---------|
| `1` | Always true |
| `abilities.str.mod >= 3 ? 1 : false` | True if STR mod >= 3 |
| `classes.rogue.levels ? 2 : false` | Returns 2 if has rogue levels |
| `hasCondition(tokenUuid, "enlarged") ? abilities.str.mod : 0` | STR mod if enlarged, else 0 |

---

## Absorption

> **No longer read:** `flags.midi-qol.absorption.*` does nothing. Use midi's Damage Absorption trait, `system.traits.da`, which works like dnd5e's immunity/resistance/vulnerability traits.

Convert incoming damage of a specific type to healing.

| Field | Mode | Description |
|-------|------|-------------|
| `system.traits.da.value` | Add | Damage types absorbed, or `ALL` (all damage, not healing) |
| `system.traits.da.bypasses` | Add | Physical damage with any of these properties (e.g. `mgc`) is not absorbed |
| `system.traits.da.{damageType}` | Override | Multiplier for that damage type (default `-1`: heal by the damage dealt) |
| `system.traits.da.midi.{custom}` | Override | Absorb damage matching a midi category (`spell`, `magical`, `non-magical-physical`... as for [`dm.midi`](#by-damage-properties-midi-specific)) |

*Damage types: acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder, etc.*

---

## Advantage

Grant advantage on various roll types. All advantage flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE.

### All Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.all` | Evaluated | Advantage on all d20 checks |
| `flags.midi-qol.advantage.ability.all` | Evaluated | Advantage on all saves, ability checks, and skills |

### Attack Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.attack.all` | Evaluated | Advantage on all attack types |
| `flags.midi-qol.advantage.attack.{attackType}` | Evaluated | Advantage on specific attack type |
| `flags.midi-qol.advantage.attack.{ability}` | Evaluated | Advantage on attacks using specific ability |

*Attack types: mwak, rwak, msak, rsak. Abilities: str, dex, con, int, wis, cha.*

#### Attack by Spell School

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.attack.school.{school}` | Evaluated | Advantage on attacks from spells of specific school |

*Schools: abj, con, div, enc, evo, ill, nec, trs.*

### Saving Throws

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.save.all` | Evaluated | Advantage on all saves |
| `flags.midi-qol.advantage.save.{ability}` | Evaluated | Advantage on specific ability saves |
| `flags.midi-qol.advantage.save.school.{school}` | Evaluated | Advantage on saves vs spells of a specific school |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*

### Ability Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.check.all` | Evaluated | Advantage on all ability checks and skills |
| `flags.midi-qol.advantage.check.{ability}` | Evaluated | Advantage on specific ability checks |

*Abilities: str, dex, con, int, wis, cha.*

### Skills

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.skill.all` | Evaluated | Advantage on all skill checks |
| `flags.midi-qol.advantage.skill.{skill}` | Evaluated | Advantage on specific skill checks |
| `flags.midi-qol.advantage.skill.{ability}` | Evaluated | Advantage on all skills using specific ability (e.g., `advantage.skill.dex` for all DEX-based skills) |

*Skills: acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, per, prf, rel, slt, ste, sur.*
*Abilities: str, dex, con, int, wis, cha.*

> [!note]
> Ability check advantage/disadvantage flags also apply to skills that use that ability. For example, `advantage.check.dex` grants advantage on Acrobatics, Sleight of Hand, and Stealth checks (all DEX-based skills).
>
> `noAdvantage.check.*` / `noDisadvantage.check.*` apply to skill and tool checks using that ability too.

### Tool Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.tool.all` | Evaluated | Advantage on all tool checks |
| `flags.midi-qol.advantage.tool.{tool}` | Evaluated | Advantage on specific tool checks |

*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

### Special Advantage

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.advantage.concentration` | Evaluated | Advantage on concentration checks |
| `flags.midi-qol.advantage.deathSave` | Evaluated | Advantage on death saving throws. **Native alternative:** `system.attributes.death.roll.mode = 1` |

---

## Disadvantage

Grant disadvantage on various roll types. All disadvantage flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE.

### All Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.all` | Evaluated | Disadvantage on all d20 checks |
| `flags.midi-qol.disadvantage.ability.all` | Evaluated | Disadvantage on all saves, checks, skills |

### Attack Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.attack.all` | Evaluated | Disadvantage on all attacks |
| `flags.midi-qol.disadvantage.attack.{attackType}` | Evaluated | Disadvantage on specific attack type |
| `flags.midi-qol.disadvantage.attack.{ability}` | Evaluated | Disadvantage on attacks using specific ability |

*Attack types: mwak, rwak, msak, rsak. Abilities: str, dex, con, int, wis, cha.*

#### Attack by Spell School

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.attack.school.{school}` | Evaluated | Disadvantage on attacks from spells of specific school |

*Schools: abj, con, div, enc, evo, ill, nec, trs.*

### Saving Throws

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.save.all` | Evaluated | Disadvantage on all saves |
| `flags.midi-qol.disadvantage.save.{ability}` | Evaluated | Disadvantage on specific ability saves |
| `flags.midi-qol.disadvantage.save.school.{school}` | Evaluated | Disadvantage on saves vs spells of a specific school |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*

### Ability Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.check.all` | Evaluated | Disadvantage on all ability checks |
| `flags.midi-qol.disadvantage.check.{ability}` | Evaluated | Disadvantage on specific ability checks |

*Abilities: str, dex, con, int, wis, cha.*

### Skills

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.skill.all` | Evaluated | Disadvantage on all skill checks |
| `flags.midi-qol.disadvantage.skill.{skill}` | Evaluated | Disadvantage on specific skill |
| `flags.midi-qol.disadvantage.skill.{ability}` | Evaluated | Disadvantage on all skills using specific ability (e.g., `disadvantage.skill.dex` for all DEX-based skills) |

*Skills: acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, per, prf, rel, slt, ste, sur.*
*Abilities: str, dex, con, int, wis, cha.*

> [!note]
> Ability check advantage/disadvantage flags also apply to skills that use that ability. For example, `disadvantage.check.str` imposes disadvantage on Athletics checks (a STR-based skill).

### Tool Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.tool.all` | Evaluated | Disadvantage on all tool checks |
| `flags.midi-qol.disadvantage.tool.{tool}` | Evaluated | Disadvantage on specific tool checks |

*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

### Special Disadvantage

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.disadvantage.concentration` | Evaluated | Disadvantage on concentration checks |
| `flags.midi-qol.disadvantage.deathSave` | Evaluated | Disadvantage on death saves. **Native alternative:** `system.attributes.death.roll.mode = -1` |

---

## No Advantage

Prevent advantage on various roll types. These flags suppress advantage even when other sources would grant it. All noAdvantage flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE. These are not [deferred](#how-custom-mode-processing-works): a CUSTOM condition is evaluated when the actor is prepared, with the actor's data only.

### All Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noAdvantage.all` | Evaluated | Prevent advantage on all d20 rolls |

### Attack Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noAdvantage.attack.all` | Evaluated | Prevent advantage on all attacks |
| `flags.midi-qol.noAdvantage.attack.{attackType}` | Evaluated | Prevent advantage on specific attack type |
| `flags.midi-qol.noAdvantage.attack.school.{school}` | Evaluated | Prevent advantage on attacks from spells of specific school |

*Attack types: mwak, rwak, msak, rsak. Schools: abj, con, div, enc, evo, ill, nec, trs.*

### Saving Throws

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noAdvantage.save.all` | Evaluated | Prevent advantage on all saves |
| `flags.midi-qol.noAdvantage.save.{ability}` | Evaluated | Prevent advantage on specific ability saves |
| `flags.midi-qol.noAdvantage.save.school.{school}` | Evaluated | Prevent advantage on saves vs spells of a specific school |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*

### Ability Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noAdvantage.check.all` | Evaluated | Prevent advantage on all ability checks |
| `flags.midi-qol.noAdvantage.check.{ability}` | Evaluated | Prevent advantage on specific ability checks |

*Abilities: str, dex, con, int, wis, cha.*

> [!note]
> `noAdvantage.check.*` also applies to skill and tool checks using that ability.

### Skills

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noAdvantage.skill.all` | Evaluated | Prevent advantage on all skill checks |
| `flags.midi-qol.noAdvantage.skill.{skill}` | Evaluated | Prevent advantage on specific skill |
| `flags.midi-qol.noAdvantage.skill.{ability}` | Evaluated | Prevent advantage on skills using specific ability |

*Skills: acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, per, prf, rel, slt, ste, sur.*
*Abilities: str, dex, con, int, wis, cha.*

### Tool Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noAdvantage.tool.all` | Evaluated | Prevent advantage on all tool checks |
| `flags.midi-qol.noAdvantage.tool.{tool}` | Evaluated | Prevent advantage on specific tool checks |

*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

### Special No Advantage

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noAdvantage.concentration` | Evaluated | Prevent advantage on concentration checks |
| `flags.midi-qol.noAdvantage.deathSave` | Evaluated | Prevent advantage on death saving throws |
| `flags.midi-qol.noAdvantage.initiative` | Evaluated | Prevent advantage on initiative rolls |
| `flags.dnd5e.initiativeNoAdv` | Evaluated | Prevent advantage on initiative (dnd5e-style flag) |

---

## No Disadvantage

Prevent disadvantage on various roll types. These flags suppress disadvantage even when other sources would impose it. All noDisadvantage flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE. These are not [deferred](#how-custom-mode-processing-works): a CUSTOM condition is evaluated when the actor is prepared, with the actor's data only.

### All Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noDisadvantage.all` | Evaluated | Prevent disadvantage on all d20 rolls |

### Attack Rolls

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noDisadvantage.attack.all` | Evaluated | Prevent disadvantage on all attacks |
| `flags.midi-qol.noDisadvantage.attack.{attackType}` | Evaluated | Prevent disadvantage on specific attack type |
| `flags.midi-qol.noDisadvantage.attack.school.{school}` | Evaluated | Prevent disadvantage on attacks from spells of specific school |

*Attack types: mwak, rwak, msak, rsak. Schools: abj, con, div, enc, evo, ill, nec, trs.*

### Saving Throws

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noDisadvantage.save.all` | Evaluated | Prevent disadvantage on all saves |
| `flags.midi-qol.noDisadvantage.save.{ability}` | Evaluated | Prevent disadvantage on specific ability saves |
| `flags.midi-qol.noDisadvantage.save.school.{school}` | Evaluated | Prevent disadvantage on saves vs spells of a specific school |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*

### Ability Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noDisadvantage.check.all` | Evaluated | Prevent disadvantage on all ability checks |
| `flags.midi-qol.noDisadvantage.check.{ability}` | Evaluated | Prevent disadvantage on specific ability checks |

*Abilities: str, dex, con, int, wis, cha.*

> [!note]
> `noDisadvantage.check.*` also applies to skill and tool checks using that ability.

### Skills

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noDisadvantage.skill.all` | Evaluated | Prevent disadvantage on all skill checks |
| `flags.midi-qol.noDisadvantage.skill.{skill}` | Evaluated | Prevent disadvantage on specific skill |
| `flags.midi-qol.noDisadvantage.skill.{ability}` | Evaluated | Prevent disadvantage on skills using specific ability |

*Skills: acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, per, prf, rel, slt, ste, sur.*
*Abilities: str, dex, con, int, wis, cha.*

### Tool Checks

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noDisadvantage.tool.all` | Evaluated | Prevent disadvantage on all tool checks |
| `flags.midi-qol.noDisadvantage.tool.{tool}` | Evaluated | Prevent disadvantage on specific tool checks |

*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

### Special No Disadvantage

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noDisadvantage.concentration` | Evaluated | Prevent disadvantage on concentration checks |
| `flags.midi-qol.noDisadvantage.deathSave` | Evaluated | Prevent disadvantage on death saving throws |
| `flags.midi-qol.noDisadvantage.initiative` | Evaluated | Prevent disadvantage on initiative rolls |
| `flags.dnd5e.initiativeNoDisadv` | Evaluated | Prevent disadvantage on initiative (dnd5e-style flag) |

---

## Critical Hits

Force attacks to be critical hits. All critical flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.critical.all` | Evaluated | All attacks are critical hits |
| `flags.midi-qol.critical.{attackType}` | Evaluated | Specific attack type is critical |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

---

## No Critical

Prevent attacks from being critical hits. All noCritical flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noCritical.all` | Evaluated | Cannot score critical hits |
| `flags.midi-qol.noCritical.{attackType}` | Evaluated | Specific attack type cannot crit |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

---

## Fumble

Force attacks to be fumbles (critical failures). All fumble flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE. These are not [deferred](#how-custom-mode-processing-works): a CUSTOM condition is evaluated when the actor is prepared, with the actor's data only.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.fumble.all` | Evaluated | All attacks are fumbles |
| `flags.midi-qol.fumble.{attackType}` | Evaluated | Specific attack type is a fumble |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

---

## No Fumble

Prevent attacks from being fumbles. All noFumble flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE. These are not [deferred](#how-custom-mode-processing-works): a CUSTOM condition is evaluated when the actor is prepared, with the actor's data only.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.noFumble.all` | Evaluated | Cannot fumble attacks |
| `flags.midi-qol.noFumble.{attackType}` | Evaluated | Specific attack type cannot fumble |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

---

## Auto-Fail

Force automatic failure on rolls. All fail flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE.

> [!important] dnd5e 6 roll fields
> Each dnd5e 6 roll field (`...roll`, beside its `bonus`, `min`, `max` and `mode`) has `fail` and `success` conditions added by midi. The per-roll `fail.*` flags below are mapped to those fields (the **Maps To** column) when the effect is applied; midi reads the field, not the flag. You can set the fields directly: e.g. `system.abilities.dex.save.roll.fail` OVERRIDE `true`, or a condition expression. Attacks also check `system.abilities.{ability}.attack.roll.fail`. Flags with no mapping (`—`) are read by midi itself.

### Ability Rolls

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.fail.all` | Evaluated | Fail all actions | — |
| `flags.midi-qol.fail.ability.all` | Evaluated | Fail all ability-based rolls | — |
| `flags.midi-qol.fail.ability.save.all` | Evaluated | Fail all saving throws | `system.rolls.ability.save.fail` |
| `flags.midi-qol.fail.ability.save.{ability}` | Evaluated | Fail specific ability saves | `system.abilities.{ability}.save.roll.fail` |
| `flags.midi-qol.fail.save.school.{school}` | Evaluated | Fail saves vs spells of a specific school | — |
| `flags.midi-qol.fail.ability.check.all` | Evaluated | Fail all ability checks | `system.rolls.ability.check.fail` |
| `flags.midi-qol.fail.ability.check.{ability}` | Evaluated | Fail specific ability checks | `system.abilities.{ability}.check.roll.fail` |
| `flags.midi-qol.fail.concentration` | Evaluated | Fail concentration saves | `system.attributes.concentration.roll.fail` |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*

### Attack Rolls

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.fail.attack.all` | Evaluated | Fail all attacks | `system.rolls.attack.fail` |
| `flags.midi-qol.fail.attack.{attackType}` | Evaluated | Fail specific attack type | `system.rolls.attack.{attackType}.fail` |

*Attack types: mwak, rwak, msak, rsak. `heal`, `other`, `save` and `util` have no mapping and do nothing.*

### Skills

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.fail.skill.all` | Evaluated | Fail all skill checks | `system.rolls.ability.skill.fail` |
| `flags.midi-qol.fail.skill.{skill}` | Evaluated | Fail specific skill | `system.skills.{skill}.roll.fail` |

*Skills: acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, per, prf, rel, slt, ste, sur.*

### Tool Checks

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.fail.tool.all` | Evaluated | Fail all tool checks | `system.rolls.ability.tool.fail` |
| `flags.midi-qol.fail.tool.{tool}` | Evaluated | Fail specific tool check | `system.tools.{tool}.roll.fail` |

*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

### Death Saves

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.fail.deathSave` | Evaluated | Fail all death saving throws | `system.attributes.death.roll.fail` |

### Spellcasting

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.fail.spell.all` | Evaluated | Cannot cast spells at all |
| `flags.midi-qol.fail.spell.vocal` | Evaluated | Cannot cast spells with vocal components |
| `flags.midi-qol.fail.spell.verbal` | Evaluated | Alias of `fail.spell.vocal` |
| `flags.midi-qol.fail.spell.somatic` | Evaluated | Cannot cast spells with somatic components |
| `flags.midi-qol.fail.spell.material` | Evaluated | Cannot cast spells with material components |

---

## Auto-Success

Force automatic success on rolls. All success flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE. As for [Auto-Fail](#auto-fail), the per-roll flags map to the dnd5e 6 roll fields' `success` conditions. Unlike `fail.*`, `success.all` and `success.ability.all` are not deferred: a CUSTOM condition on them is evaluated when the actor is prepared; the mapped fields are evaluated per roll.

### All Rolls

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.success.all` | Evaluated | Automatically succeed on all rolls | — |

### Attack Rolls

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.success.attack.all` | Evaluated | All attacks automatically succeed | `system.rolls.attack.success` |
| `flags.midi-qol.success.attack.{attackType}` | Evaluated | Specific attack type auto-succeeds | `system.rolls.attack.{attackType}.success` |

*Attack types: mwak, rwak, msak, rsak. `heal`, `other`, `save` and `util` have no mapping and do nothing.*

### Ability Rolls

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.success.ability.all` | Evaluated | Succeed all ability-based rolls (saves and checks) | — |
| `flags.midi-qol.success.ability.save.all` | Evaluated | Succeed all saving throws | `system.rolls.ability.save.success` |
| `flags.midi-qol.success.ability.save.{ability}` | Evaluated | Succeed specific ability saves | `system.abilities.{ability}.save.roll.success` |
| `flags.midi-qol.success.save.school.{school}` | Evaluated | Succeed saves vs spells of a specific school | — |
| `flags.midi-qol.success.ability.check.all` | Evaluated | Succeed all ability checks | `system.rolls.ability.check.success` |
| `flags.midi-qol.success.ability.check.{ability}` | Evaluated | Succeed specific ability checks | `system.abilities.{ability}.check.roll.success` |
| `flags.midi-qol.success.concentration` | Evaluated | Succeed concentration saves | `system.attributes.concentration.roll.success` |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*

### Skills

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.success.skill.all` | Evaluated | Succeed all skill checks | `system.rolls.ability.skill.success` |
| `flags.midi-qol.success.skill.{skill}` | Evaluated | Succeed specific skill | `system.skills.{skill}.roll.success` |

*Skills: acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, per, prf, rel, slt, ste, sur.*

### Tool Checks

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.success.tool.all` | Evaluated | Succeed all tool checks | `system.rolls.ability.tool.success` |
| `flags.midi-qol.success.tool.{tool}` | Evaluated | Succeed specific tool check | `system.tools.{tool}.roll.success` |

*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

### Death Saves

| Flag | Access | Description | Maps To |
|------|--------|-------------|---------|
| `flags.midi-qol.success.deathSave` | Evaluated | Succeed all death saving throws | `system.attributes.death.roll.success` |

---

## Grants (Target Effects)

Flags applied to a target that affect incoming attacks/rolls against them. All grants flags are **Evaluated** (conditional expression) and registered as **BooleanFormula** fields with DAE, unless noted.

### Grant Advantage to Attackers

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.advantage.attack.all` | Evaluated | Attackers have advantage on all attacks |
| `flags.midi-qol.grants.advantage.attack.{attackType}` | Evaluated | Attackers have advantage on specific attack type |
| `flags.midi-qol.grants.advantage.attack.school.{school}` | Evaluated | Attackers have advantage on attacks from spells of specific school |
| `flags.midi-qol.grants.advantage.all` | Evaluated | Attackers have advantage on all rolls against this target |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util. Schools: abj, con, div, enc, evo, ill, nec, trs.*

### Grant Disadvantage to Attackers

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.disadvantage.attack.all` | Evaluated | Attackers have disadvantage on all attacks |
| `flags.midi-qol.grants.disadvantage.attack.{attackType}` | Evaluated | Disadvantage on specific attack type |
| `flags.midi-qol.grants.disadvantage.attack.school.{school}` | Evaluated | Disadvantage on attacks from spells of specific school |
| `flags.midi-qol.grants.disadvantage.all` | Evaluated | Attackers have disadvantage on all rolls against this target |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

### Grant Critical Hits

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.critical.all` | Evaluated | Attacks against target auto-crit |
| `flags.midi-qol.grants.critical.{attackType}` | Evaluated | Specific attack type auto-crits |
| `flags.midi-qol.grants.critical.range` | Direct | Crit within this distance (numeric value) |
| `flags.midi-qol.grants.criticalThreshold` | Evaluated | Lower critical threshold for attacks against target |

*Attack types: mwak, rwak, msak, rsak.*

**Multi-target behavior:** For attacks targeting multiple targets, if ANY target has `grants.critical`, the attack becomes a critical hit.

### Grant No Critical

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.noCritical.all` | Evaluated | Attacks against target cannot crit |
| `flags.midi-qol.grants.noCritical.{attackType}` | Evaluated | Specific attack type cannot crit |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

**Multi-target behavior:** For attacks targeting multiple targets, ALL targets must have `grants.noCritical` for the critical hit to be prevented.

### Grant Fumble

Force attacks against target to be fumbles (critical failures). For multi-target attacks, if ANY target has this flag, the attack fumbles.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.fumble.all` | Evaluated | Attacks against target auto-fumble |
| `flags.midi-qol.grants.fumble.{attackType}` | Evaluated | Specific attack type auto-fumbles |

*Attack types: mwak, rwak, msak, rsak.*

### Grant No Fumble

Prevent attacks against target from being fumbles. For multi-target attacks, ALL targets must have this flag to prevent the fumble.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.noFumble.all` | Evaluated | Attacks against target cannot fumble |
| `flags.midi-qol.grants.noFumble.{attackType}` | Evaluated | Specific attack type cannot fumble |

*Attack types: mwak, rwak, msak, rsak.*

### Grant Attack Bonus/Penalty

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.attack.bonus.all` | Formula | Bonus (number or dice) to attacks against this target |
| `flags.midi-qol.grants.attack.bonus.{attackType}` | Formula | Bonus to specific attack type (added to `.all`) |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

The value is a roll formula evaluated with the **target's** roll data, not a condition. With one target it is added to the attack roll; with several targets it is applied per target when hits are checked.

### Grant Damage Bonus

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.bonus.damage.all` | Formula | Damage formula added to attackers' damage rolls against this target |
| `flags.midi-qol.grants.bonus.damage.{attackType}` | Formula | As above for a specific attack type (used instead of `.all`) |

The formula is rolled with the target's roll data. Only the first target's flag is used.

### Grant Attack Success/Failure

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.attack.success.all` | Evaluated | Attacks auto-succeed |
| `flags.midi-qol.grants.attack.success.{attackType}` | Evaluated | Specific attack type auto-succeeds |
| `flags.midi-qol.grants.attack.fail.all` | Evaluated | Attacks auto-fail |
| `flags.midi-qol.grants.attack.fail.{attackType}` | Evaluated | Specific attack type auto-fails |

*Attack types: mwak, rwak, msak, rsak.*

### Grant No Advantage/Disadvantage

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.noAdvantage.attack.all` | Evaluated | Prevent attacker's advantage |
| `flags.midi-qol.grants.noAdvantage.attack.{attackType}` | Evaluated | Prevent advantage on specific attack type |
| `flags.midi-qol.grants.noAdvantage.attack.school.{school}` | Evaluated | Prevent advantage on attacks from spells of specific school |
| `flags.midi-qol.grants.noDisadvantage.attack.all` | Evaluated | Prevent attacker's disadvantage |
| `flags.midi-qol.grants.noDisadvantage.attack.{attackType}` | Evaluated | Prevent disadvantage on specific attack type |
| `flags.midi-qol.grants.noDisadvantage.attack.school.{school}` | Evaluated | Prevent disadvantage on attacks from spells of specific school |

*Attack types: mwak, rwak, msak, rsak. Schools: abj, con, div, enc, evo, ill, nec, trs.*

### Grant Max/Min Damage

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.max.damage.all` | Evaluated | All damage rolls do maximum damage |
| `flags.midi-qol.grants.max.damage.{attackType}` | Evaluated | Specific attack type does maximum damage |
| `flags.midi-qol.grants.min.damage.all` | Evaluated | All damage rolls do minimum damage |
| `flags.midi-qol.grants.min.damage.{attackType}` | Evaluated | Specific attack type does minimum damage |

*Attack types: mwak, rwak, msak, rsak, heal, save.*

### Grant Save/Check Advantage

These flags are set on the **source actor** (caster/attacker) and affect targets forced to make saves or checks.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.advantage.save.all` | Evaluated | Targets have advantage on all saves forced by this actor |
| `flags.midi-qol.grants.advantage.save.{ability}` | Evaluated | Targets have advantage on specific ability saves |
| `flags.midi-qol.grants.advantage.save.school.{school}` | Evaluated | Targets have advantage on saves vs this actor's spells of a specific school |
| `flags.midi-qol.grants.disadvantage.save.all` | Evaluated | Targets have disadvantage on all saves forced by this actor |
| `flags.midi-qol.grants.disadvantage.save.{ability}` | Evaluated | Targets have disadvantage on specific ability saves |
| `flags.midi-qol.grants.disadvantage.save.school.{school}` | Evaluated | Targets have disadvantage on saves vs this actor's spells of a specific school |
| `flags.midi-qol.grants.advantage.check.all` | Evaluated | Target has advantage on all ability checks |
| `flags.midi-qol.grants.advantage.check.{ability}` | Evaluated | Advantage on specific ability checks |
| `flags.midi-qol.grants.disadvantage.check.all` | Evaluated | Target has disadvantage on all ability checks |
| `flags.midi-qol.grants.disadvantage.check.{ability}` | Evaluated | Disadvantage on specific ability checks |
| `flags.midi-qol.grants.advantage.skill.all` | Evaluated | Target has advantage on all skill checks |
| `flags.midi-qol.grants.advantage.skill.{skill}` | Evaluated | Advantage on specific skill checks |
| `flags.midi-qol.grants.advantage.skill.{ability}` | Evaluated | Advantage on skills using specific ability |
| `flags.midi-qol.grants.disadvantage.skill.all` | Evaluated | Target has disadvantage on all skill checks |
| `flags.midi-qol.grants.disadvantage.skill.{skill}` | Evaluated | Disadvantage on specific skill checks |
| `flags.midi-qol.grants.disadvantage.skill.{ability}` | Evaluated | Disadvantage on skills using specific ability |
| `flags.midi-qol.grants.advantage.tool.all` | Evaluated | Target has advantage on all tool checks |
| `flags.midi-qol.grants.advantage.tool.{toolId}` | Evaluated | Advantage on specific tool checks |
| `flags.midi-qol.grants.disadvantage.tool.all` | Evaluated | Target has disadvantage on all tool checks |
| `flags.midi-qol.grants.disadvantage.tool.{toolId}` | Evaluated | Disadvantage on specific tool checks |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*
*Skills: acr, ani, arc, ath, dec, his, ins, itm, inv, med, nat, prc, per, prf, rel, slt, ste, sur.*

### Grant No Advantage/Disadvantage on Saves, Checks, Skills, Tools

These flags are set on the **source actor** (caster) and suppress advantage/disadvantage on rolls forced by this actor, even if targets would normally have it from other sources.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.grants.noAdvantage.all` | Evaluated | Suppress all advantage on rolls forced by this actor |
| `flags.midi-qol.grants.noAdvantage.save.all` | Evaluated | Suppress advantage on all saves forced by this actor |
| `flags.midi-qol.grants.noAdvantage.save.{ability}` | Evaluated | Suppress advantage on specific ability saves |
| `flags.midi-qol.grants.noAdvantage.save.school.{school}` | Evaluated | Suppress advantage on saves vs this actor's spells of a specific school |
| `flags.midi-qol.grants.noAdvantage.check.all` | Evaluated | Suppress advantage on all ability checks forced by this actor |
| `flags.midi-qol.grants.noAdvantage.check.{ability}` | Evaluated | Suppress advantage on specific ability checks |
| `flags.midi-qol.grants.noAdvantage.skill.all` | Evaluated | Suppress advantage on all skill checks forced by this actor |
| `flags.midi-qol.grants.noAdvantage.skill.{ability}` | Evaluated | Suppress advantage on skills using specific ability |
| `flags.midi-qol.grants.noAdvantage.skill.{skillId}` | Evaluated | Suppress advantage on specific skill checks |
| `flags.midi-qol.grants.noAdvantage.tool.all` | Evaluated | Suppress advantage on all tool checks forced by this actor |
| `flags.midi-qol.grants.noAdvantage.tool.{toolId}` | Evaluated | Suppress advantage on specific tool checks |
| `flags.midi-qol.grants.noDisadvantage.all` | Evaluated | Suppress all disadvantage on rolls forced by this actor |
| `flags.midi-qol.grants.noDisadvantage.save.all` | Evaluated | Suppress disadvantage on all saves forced by this actor |
| `flags.midi-qol.grants.noDisadvantage.save.{ability}` | Evaluated | Suppress disadvantage on specific ability saves |
| `flags.midi-qol.grants.noDisadvantage.save.school.{school}` | Evaluated | Suppress disadvantage on saves vs this actor's spells of a specific school |
| `flags.midi-qol.grants.noDisadvantage.check.all` | Evaluated | Suppress disadvantage on all ability checks forced by this actor |
| `flags.midi-qol.grants.noDisadvantage.check.{ability}` | Evaluated | Suppress disadvantage on specific ability checks |
| `flags.midi-qol.grants.noDisadvantage.skill.all` | Evaluated | Suppress disadvantage on all skill checks forced by this actor |
| `flags.midi-qol.grants.noDisadvantage.skill.{ability}` | Evaluated | Suppress disadvantage on skills using specific ability |
| `flags.midi-qol.grants.noDisadvantage.skill.{skillId}` | Evaluated | Suppress disadvantage on specific skill checks |
| `flags.midi-qol.grants.noDisadvantage.tool.all` | Evaluated | Suppress disadvantage on all tool checks forced by this actor |
| `flags.midi-qol.grants.noDisadvantage.tool.{toolId}` | Evaluated | Suppress disadvantage on specific tool checks |

*Abilities: str, dex, con, int, wis, cha.*
*Spell schools: abj, con, div, enc, evo, ill, nec, trs.*

**Example use case:** A creature whose gaze attack prevents targets from having advantage on the save, regardless of other effects they have.

---

## Magic Resistance/Vulnerability

Advantage or disadvantage on saves against magical effects (spells and magic items). They apply only to saving throws. Registered as **BooleanFormula** fields with DAE, but not deferred: a condition is evaluated when the actor is prepared and sees no workflow, target or item.

### Magic Resistance

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.magicResistance.all` | Evaluated | Advantage on all saves vs magic |
| `flags.midi-qol.magicResistance.{ability}` | Evaluated | Advantage on specific ability saves vs magic |

*Abilities: str, dex, con, int, wis, cha.*

### Magic Vulnerability

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.magicVulnerability.all` | Evaluated | Disadvantage on all saves vs magic |
| `flags.midi-qol.magicVulnerability.{ability}` | Evaluated | Disadvantage on specific ability saves vs magic |

*Abilities: str, dex, con, int, wis, cha.*

---

## Min/Max Rolls

Set minimum or maximum values for the d20 roll (not total). Midi reads none of these flags: each is mapped to the dnd5e roll field's `min` / `max` when the effect is applied (the strongest value wins, as before), and dnd5e applies it. Prefer setting the field directly.

| Flag (`flags.midi-qol.` omitted) | dnd5e field |
|------|-------------|
| `{min\|max}.ability.save.all` / `.check.all` | `system.rolls.ability.save.{min\|max}` / `system.rolls.ability.check.{min\|max}` |
| `{min\|max}.ability.save.{ability}` / `.check.{ability}` | `system.abilities.{ability}.save.roll.{min\|max}` / `system.abilities.{ability}.check.roll.{min\|max}` |
| `{min\|max}.skill.all` / `.skill.{skill}` | `system.rolls.ability.skill.{min\|max}` / `system.skills.{skill}.roll.{min\|max}` |
| `{min\|max}.tool.all` / `.tool.{tool}` | `system.rolls.ability.tool.{min\|max}` / `system.tools.{tool}.roll.{min\|max}` |
| `{min\|max}.attack.all` / `.attack.{attackType}` | `system.rolls.attack.{min\|max}` / `system.rolls.attack.{attackType}.{min\|max}` |
| `{min\|max}.concentration` / `.ability.save.concentration` | `system.attributes.concentration.roll.{min\|max}` |

### Maximum Roll

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.max.ability.save.all` | Mapped | Maximum d20 roll for all saves |
| `flags.midi-qol.max.ability.save.{ability}` | Mapped | Maximum for specific ability saves |
| `flags.midi-qol.max.ability.save.concentration` | Mapped | Maximum for concentration saves |
| `flags.midi-qol.max.ability.check.all` | Mapped | Maximum d20 roll for all checks |
| `flags.midi-qol.max.ability.check.{ability}` | Mapped | Maximum for specific ability checks |
| `flags.midi-qol.max.skill.all` | Mapped | Maximum d20 roll for all skills |
| `flags.midi-qol.max.skill.{skill}` | Mapped | Maximum for specific skill |
| `flags.midi-qol.max.tool.all` | Mapped | Maximum d20 roll for all tool checks |
| `flags.midi-qol.max.tool.{tool}` | Mapped | Maximum for specific tool check |

*Abilities: str, dex, con, int, wis, cha.*
*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

### Minimum Roll

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.min.ability.save.all` | Mapped | Minimum d20 roll for all saves |
| `flags.midi-qol.min.ability.save.{ability}` | Mapped | Minimum for specific ability saves |
| `flags.midi-qol.min.ability.save.concentration` | Mapped | Minimum for concentration saves |
| `flags.midi-qol.min.ability.check.all` | Mapped | Minimum d20 roll for all checks |
| `flags.midi-qol.min.ability.check.{ability}` | Mapped | Minimum for specific ability checks |
| `flags.midi-qol.min.skill.all` | Mapped | Minimum d20 roll for all skill checks |
| `flags.midi-qol.min.skill.{skill}` | Mapped | Minimum for specific skill |
| `flags.midi-qol.min.tool.all` | Mapped | Minimum d20 roll for all tool checks |
| `flags.midi-qol.min.tool.{tool}` | Mapped | Minimum for specific tool check |

*Abilities: str, dex, con, int, wis, cha.*
*Tools: alchemist, bagpipes, brewer, calligrapher, card, carpenter, cartographer, chess, cobbler, cook, dice, disg, drum, dulcimer, flute, forg, glassblower, herb, horn, jeweler, leatherworker, lute, lyre, mason, navg, painter, panflute, pois, potter, shawm, smith, thief, tinker, viol, weaver, woodcarver.*

---

## Damage Modifiers

### Max/Min Damage

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.max.damage.all` | Evaluated | All damage rolls are maximized |
| `flags.midi-qol.max.damage.{attackType}` | Evaluated | Specific attack type damage maximized |
| `flags.midi-qol.min.damage.all` | Evaluated | All damage rolls are minimized |
| `flags.midi-qol.min.damage.{attackType}` | Evaluated | Specific attack type damage minimized |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

These are deferred conditions, evaluated when damage is rolled with the workflow's data and its first hit target.

### Damage Reroll

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.damage.reroll-kh` | Direct | Roll the whole damage roll twice and keep the higher total (truthy value) |
| `flags.midi-qol.damage.reroll-kl` | Direct | Roll the whole damage roll twice and keep the lower total (truthy value) |

### Damage Dice Modifiers

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.rollModifiers.attack.{type}` | Direct | Dice modifiers (e.g. `r1`, `min2`) added to the d20 of attack rolls. Types: `all`, `mwak`, `rwak`, `msak`, `rsak`, `weapon`, `spell`, `tool`, `feat` |
| `flags.midi-qol.rollModifiers.damage.{type}.{damageType}` | Direct | Dice modifiers added to damage dice. `{type}`: `all`, an action type or an item type; `{damageType}`: a damage type or `all` |

### Damage Modification (system.traits.dm)

Damage Reduction uses the dnd5e `system.traits.dm` fields. Set these via Active Effects.

**Important:** The sign convention follows dnd5e: **negative values reduce damage**, positive values increase damage.

#### By Damage Type

Reduce damage of a specific type (e.g., fire, slashing):

| Field | Mode | Value | Effect |
|-------|------|-------|--------|
| `system.traits.dm.amount.fire` | Add | `-5` | Reduce fire damage by 5 |
| `system.traits.dm.amount.slashing` | Add | `-10` | Reduce slashing damage by 10 |
| `system.traits.dm.amount.{damageType}` | Add | `-X` | Reduce {damageType} damage by X |
| `system.traits.dm.amount.healing` | Add | `-5` / `5` | Reduce / increase healing received (`temphp` for temporary hit points) |

*Damage types: acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder.*

#### By Attack/Action Type (Midi-specific)

Reduce damage based on how it was dealt:

| Field | Mode | Value | Effect |
|-------|------|-------|--------|
| `system.traits.dm.midi.all` | Add | `-5` | Reduce all damage by 5 |
| `system.traits.dm.midi.mwak` | Add | `-3` | Reduce melee weapon attack damage by 3 |
| `system.traits.dm.midi.rwak` | Add | `-3` | Reduce ranged weapon attack damage by 3 |
| `system.traits.dm.midi.msak` | Add | `-3` | Reduce melee spell attack damage by 3 |
| `system.traits.dm.midi.rsak` | Add | `-3` | Reduce ranged spell attack damage by 3 |
| `system.traits.dm.midi.spell` | Add | `-5` | Reduce all spell damage by 5 |

*Every activity type works: `mwak`, `rwak`, `msak`, `rsak`, `save`, `other`, `util`, `abil`, `ench` and `summ` match damage from activities of that type, and `all` matches all damage, as do the properties below. For healing received use dnd5e's `system.traits.dm.amount.healing` (a negative value reduces healing, a positive one increases it); `heal` is not a DR key. Values are roll formulas (e.g. `-1d4`, `-@abilities.con.mod`), rolled with the damaged actor's roll data. These keys modify damage only, never healing.*

#### By Damage Properties (Midi-specific)

Reduce damage based on weapon/spell properties:

| Field | Mode | Value | Effect |
|-------|------|-------|--------|
| `system.traits.dm.midi.magical` | Add | `-5` | Reduce magical damage by 5 |
| `system.traits.dm.midi.non-magical` | Add | `-5` | Reduce non-magical damage by 5 |
| `system.traits.dm.midi.non-magical-physical` | Add | `-5` | Reduce non-magical physical damage by 5 |
| `system.traits.dm.midi.non-silver-physical` | Add | `-5` | Reduce non-silvered physical damage by 5 |
| `system.traits.dm.midi.non-adamant-physical` | Add | `-5` | Reduce non-adamantine physical damage by 5 |
| `system.traits.dm.midi.non-physical` | Add | `-5` | Reduce non-physical damage by 5 |
| `system.traits.dm.midi.non-spell` | Add | `-5` | Reduce non-spell damage by 5 |
| `system.traits.dm.midi.physical` | Add | `-5` | Reduce physical damage by 5 |

#### Examples

**Barbarian Rage (resistance to physical damage):**
```
system.traits.dm.midi.non-magical-physical ADD -99
```
(Use resistance trait instead for halving damage)

**Heavy Armor Master (reduce non-magical physical by 3):**
```
system.traits.dm.midi.non-magical-physical ADD -3
```

**Fire Shield (reduce cold damage by 5):**
```
system.traits.dm.amount.cold ADD -5
```

---

## Range Modifiers

Modify activity range values when range is checked. The type-specific value and the `.all` value are both added to the activity's range (never below 0).

`range.*` and `long.*` are not deferred flags: a CUSTOM expression is evaluated once, when the actor is prepared, with the actor's roll data only, so it cannot refer to the item or activity. Use numbers or actor-based expressions.

### Standard Range

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.range.all` | Evaluated | Add to the normal range of all attacks |
| `flags.midi-qol.range.{attackType}` | Evaluated | Add to the normal range of a specific attack type |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

### Long Range

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.long.all` | Evaluated | Add to the long range of all attacks |
| `flags.midi-qol.long.{attackType}` | Evaluated | Add to the long range of a specific attack type |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

### Range Override

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.rangeOverride.attack.all` | Evaluated | If the attacker is out of range, another token you own that has this flag and is in range makes the attack |
| `flags.midi-qol.rangeOverride.attack.{attackType}` | Evaluated | As above for a specific attack type |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

**Example:** `flags.midi-qol.range.rwak CUSTOM 30` adds 30 ft to the normal range of ranged weapon attacks. An expression that sets the range to a fixed value (e.g. 5 ft while blinded) is not possible: the activity's range (`activity.range.value`; items have no range in dnd5e 5+) is not available when the flag is evaluated.

---

## Save Modifiers

### Super Saver

No damage on save, half damage on fail. Registered as **BooleanFormula** fields with DAE.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.superSaver.all` | Evaluated | No damage on save, half damage on fail (all saves) |
| `flags.midi-qol.superSaver.{ability}` | Evaluated | Super saver for specific ability saves |

*Abilities: str, dex, con, int, wis, cha.*

### Semi Super Saver

No damage on save (normal damage on fail). Registered as **BooleanFormula** fields with DAE.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.semiSuperSaver.all` | Evaluated | No damage on save (all saves) |
| `flags.midi-qol.semiSuperSaver.{ability}` | Evaluated | Semi super saver for specific ability saves |

*Abilities: str, dex, con, int, wis, cha.*

### Save Bonuses

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.concentrationSaveBonus` | Mapped | **Deprecated.** Add bonus to concentration saves. Effects are mapped to `system.attributes.concentration.roll.bonus`; use that field. Set on an actor directly it still works with a warning, until 14.6.10 |
| `flags.midi-qol.deathSaveBonus` | Mapped | **Deprecated:** an effect using it sets `system.attributes.death.roll.bonus` (accepts dice); use that field. Set on an actor directly, it still works (as a JavaScript expression) with a warning, until 14.6.10 |
| `flags.midi-qol.noDeathSaveFailureFromDamage` | Boolean | Damage at 0 HP adds no death save failures (with the *Enforce death saves* setting) |

`flags.midi-qol.save.fail.*` is not read. For a bonus offered when a save fails, use [`flags.midi-qol.optional.NAME.save.fail.*`](#save-fail-bonuses).

---

## Optional Bonus Effects

**Access Type:** Mixed - see table below for each flag type

Optional bonuses prompt the player to apply them when triggered. Replace `NAME` with your identifier.

### Example - Lucky Reroll

To create an effect like "Lucky" that allows rerolling one attack roll and keeping the highest, add these Active Effect changes:

| Attribute Key | Change Mode | Effect Value |
|---------------|-------------|--------------|
| `flags.midi-qol.optional.lucky.label` | CUSTOM | `Lucky - Reroll Attack` |
| `flags.midi-qol.optional.lucky.attack.all` | CUSTOM | `reroll-kh` |
| `flags.midi-qol.optional.lucky.count` | CUSTOM | `1` |

When the actor makes an attack roll, they'll be prompted to use "Lucky - Reroll Attack". If activated, the attack is rerolled and the highest result is kept. The `count` of 1 means this can only be used once before the effect is exhausted.

### Configuration

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.label` | Direct | Display label for the bonus |
| `flags.midi-qol.optional.NAME.count` | Special | Uses remaining (see count formats below) |
| `flags.midi-qol.optional.NAME.countAlt` | Special | Alternative use count (see count formats below) |
| `flags.midi-qol.optional.NAME.activation` | Evaluated | Activation condition for the bonus |
| `flags.midi-qol.optional.NAME.force` | Evaluated | Condition to force activation |
| `flags.midi-qol.optional.NAME.macroToCall` | Direct | Macro to execute |

> [!important] Documentation
> Guides on the data available for activation and force conditions are available in the [Conditional Expression Evaluation](#conditional-expression-evaluation) section, or in the [MidiQOL Discord](https://discord.com/channels/915186263609454632/1218903432392347658).

**Count Format Options:**
| Value | Description |
|-------|-------------|
| `3` (numeric) | Fixed number of uses, decremented on each use |
| `each-turn` | Resets each turn in combat |
| `each-round` | Resets each round in combat |
| `turn` | Available only on actor's turn |
| `reaction` | Tied to reaction usage |
| `bonusAction` | Tied to bonus action usage |
| `every` | Always available (unlimited) |
| `ItemUses.identifier.{itemIdentifier}` | Linked to an item's uses (e.g., `ItemUses.identifier.bardic-inspiration`) |
| `ItemUses.partialNameMatch.{itemName}` | (e.g., `ItemUses.partialNameMatch.Insp`) |
| `ItemUses.exactNameMatch.{itemName}` | (e.g., `ItemUses.exactNameMatch.Bardic Inspiration`) |
| `ItemUses.{itemName}` | Backwards compatibility only, exact name match (e.g., `ItemUses.Bardic Inspiration`) |
| `ActivityUses.identifier.{itemIdentifier}.{activityIdentifier}` | Linked to an activity's uses (e.g., `ActivityUses.identifier.bardic-inspiration.sing-song`) |
| `ActivityUses.id.{itemID}.{activityID}` | (e.g., `ActivityUses.id.iLKpfoGF7rGpvNWD.NegUUOdFH35S3xNi`) |
| `ActivityUses.partialNameMatch.{itemName}.{activityName}` | (e.g., `ActivityUses.partialNameMatch.Insp.Song`) |
| `ActivityUses.exactNameMatch.{itemName}.{activityName}` | (e.g., `ActivityUses.exactNameMatch.Bardic Inspiration.Sing Song`) |
| `ActivityUses.{itemName}.{activityName}` | (e.g., `ActivityUses.Bardic Inspiration.Sing Song`) |
| `@{path}` | Reference to actor data (e.g., `@resources.primary.value`) |

**Bonus Value Options:**

The value set for optional bonus flags determines what happens when the bonus is applied:

| Value | Description |
|-------|-------------|
| `+1d4`, `2d6`, `+5` | Dice expression or number added to the roll |
| `reroll` | Reroll the entire roll |
| `reroll-query` | Reroll and prompt to confirm replacement |
| `reroll-kh` | Reroll, keep highest of original and new |
| `reroll-kl` | Reroll, keep lowest of original and new |
| `reroll-max` | Reroll with maximum dice values |
| `reroll-min` | Reroll with minimum dice values |
| `reroll-withBonus {expr}` | Reroll with a bonus added (e.g., `reroll-withBonus 1d4`) |
| `replace {formula}` | Replace roll entirely with new formula (e.g., `replace 10 + @abilities.dex.mod`) |
| `success` | Force the roll to succeed (sets result to 99) |
| `fail` | Force the roll to fail (sets result to -1) |
| `critical` | Treat the roll as critical (intended for attacks, see note below) |
| `ItemMacro` | Call the item macro from the item that applied the effect |
| `ItemMacro.{name}` | Call the item macro from the specified item (e.g., `ItemMacro.Lucky`) |
| `ItemMacro.{itemUuid}` | Call the item macro from the specified item |
| `Macro.{name}` | Call a world/compendium macro |
| `function.{name}` | Call a registered function |

> [!note] Optional Critical
> The `critical` value will have no effect on checks, saves, or skills unless the following setting is enabled: <br><br>
> `Settings > MidiQOL > Workflow Settings > Rules Tab` [(see here)](README.md#rules-tab-optional-rules) <br>
> (House Rule) Critical/Fumble always succeed/fail for saving throws

#### ItemMacro in Optional Bonus Flags

When using `ItemMacro` as the value for optional bonus flags (e.g., `flags.midi-qol.optional.NAME.attack.all`), it is automatically rewritten:

| Input Value | Rewritten To |
|-------------|--------------|
| `ItemMacro` (origin is Item) | `ItemMacro.{originItemUuid}` |
| `ItemMacro` (origin is ActiveEffect) | `ItemMacro.{effectOriginUuid}` |
| `ItemMacro` (origin includes ActiveEffect) | `ItemMacro.{parentItemUuid}` (strips ActiveEffect from path) |

This allows effects to reference their source item's macro without hardcoding UUIDs.

**Examples:**
- `flags.midi-qol.optional.lucky.attack.all CUSTOM reroll-kh` - Lucky feat reroll, keep highest
- `flags.midi-qol.optional.bless.save.all CUSTOM 1d4` - Bless adds 1d4 to saves
- `flags.midi-qol.optional.shield.acOnAttack CUSTOM +5` - Shield spell adds +5 AC

### Attack Bonuses

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.attack.all` | Evaluated | Optional attack bonus (all) |
| `flags.midi-qol.optional.NAME.attack.{attackType}` | Evaluated | Optional attack bonus (specific type) |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

### Attack Fail Bonuses

Only prompt when attack misses.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.attack.fail.all` | Evaluated | Optional bonus on miss (all) |
| `flags.midi-qol.optional.NAME.attack.fail.{attackType}` | Evaluated | Optional bonus on miss (specific type) |

*Attack types: mwak, rwak, msak, rsak.*

### Save Bonuses

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.save.all` | Evaluated | Optional save bonus (all) |
| `flags.midi-qol.optional.NAME.save.{ability}` | Evaluated | Optional save bonus (specific ability) |

*Abilities: str, dex, con, int, wis, cha.*

### Save Fail Bonuses

Only prompt when save fails.

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.save.fail.all` | Evaluated | Optional bonus on failed save (all) |
| `flags.midi-qol.optional.NAME.save.fail.{ability}` | Evaluated | Optional bonus on failed save (specific) |

*Abilities: str, dex, con, int, wis, cha.*

### Check Bonuses

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.check.all` | Evaluated | Optional check bonus (all) |
| `flags.midi-qol.optional.NAME.check.{ability}` | Evaluated | Optional check bonus (specific ability) |

*Abilities: str, dex, con, int, wis, cha.*

### Check Fail Bonuses

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.check.fail.all` | Evaluated | Optional bonus on failed check (all) |
| `flags.midi-qol.optional.NAME.check.fail.{ability}` | Evaluated | Optional bonus on failed check (specific) |

*Abilities: str, dex, con, int, wis, cha.*

### Skill Bonuses

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.skill.all` | Evaluated | Optional skill bonus (all) |
| `flags.midi-qol.optional.NAME.skill.{skill}` | Evaluated | Optional skill bonus (specific) |
| `flags.midi-qol.optional.NAME.skill.fail.all` | Evaluated | Optional bonus on failed skill (all) |
| `flags.midi-qol.optional.NAME.skill.fail.{skill}` | Evaluated | Optional bonus on failed skill (specific) |

*Skills: acr, ani, arc, ath, dec, his, ins, inv, itm, med, nat, prc, per, prf, rel, slt, ste, sur.*

### Damage Bonuses

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.damage.all` | Evaluated | Optional damage bonus (all) |
| `flags.midi-qol.optional.NAME.damage.{attackType}` | Evaluated | Optional damage bonus (specific type) |

*Attack types: mwak, rwak, msak, rsak, heal, other, save, util.*

### Other Optional

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.optional.NAME.acOnAttack` | Evaluated | Optional AC bonus offered when the creature is attacked, before the hit is known (was `optional.NAME.ac`, which still works, deprecated) |
| `flags.midi-qol.optional.NAME.acOnHit` | Evaluated | Optional AC bonus offered when an attack hits the creature; the attack is tested again against the new AC |
| `flags.midi-qol.optional.NAME.criticalDamage` | Direct | Switch (truthy): the `NAME.damage` bonus is rolled as critical damage, so dnd5e applies critical dice. Not a bonus value |
| `flags.midi-qol.optional.NAME.displayBonusRolls` | Direct | Override display setting for this bonus (true/false) |
| `flags.midi-qol.optional.NAME.rollMode` | Direct | Message mode for this bonus: `public`, `gm`, `blind`, `self` (legacy `publicroll`, `gmroll`, `blindroll`, `selfroll` are converted). The original roll's mode takes precedence |

---

## Special Flags

### Combat Features

Flags marked **Truthy** are read as stored values, not evaluated per use: a CUSTOM condition on a non-deferred flag is evaluated once when the actor is prepared, and on `ignoreWalls` (deferred) any non-empty expression counts as true.

| Flag | Access | BooleanFormula | Description |
|------|--------|:--------------:|-------------|
| `flags.midi-qol.ignoreNearbyFoes` | Evaluated | Yes | Ignore disadvantage on ranged attacks from nearby enemies |
| `flags.midi-qol.sharpShooter` | Evaluated | Yes | No disadvantage at long range. **Deprecated:** Use `flags.dnd5e.sharpShooter` |
| `flags.midi-qol.ignoreCover` | Evaluated | No | Attacks ignore the target's cover (evaluated per attack and target) |
| `flags.midi-qol.ignoreWalls` | Truthy | No | Distance measured from this actor's token ignores walls |
| `flags.midi-qol.uncanny-dodge` | Truthy | Yes | Halve incoming damage from attacks |
| `flags.midi-qol.potentCantrip` | Truthy | Yes | Cantrips do half damage on successful save |
| `flags.midi-qol.neverTarget` | Truthy | Yes | Token cannot be targeted |
| `flags.midi-qol.inMotion` | Truthy | Yes | Token is in motion |
| `flags.midi-qol.canFlank` | Evaluated | Yes | Token can participate in flanking |
| `flags.midi-qol.fail.disadvantage.heavy` | Evaluated | Yes | Removes the disadvantage a small creature has with heavy weapons |
| `flags.midi-qol.bloodsense` | Direct | No | Range (number): wounded targets within it count as seen by this actor |

### Spellcasting Features

| Flag | Access | BooleanFormula | Description |
|------|--------|:--------------:|-------------|
| `flags.midi-qol.sculptSpells` | Truthy | Yes | Pre-selected targets of evocation save spells auto-succeed and receive super-saver status (range targeting or target confirmation only) |
| `flags.midi-qol.carefulSpells` | Truthy | Yes | Pre-selected targets of save spells automatically succeed (range targeting or target confirmation only) |

### Over Time Effects

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.OverTime` | Direct | Configure effects that trigger on turn start/end (string format) |
| `flags.midi-qol.ActivityOverTime` | Direct | Identifier (string) of the over-time activity this effect triggers |

> [!tip] Navigation
> See the README for OverTime syntax and parameters. ([Activity Overtimes](/README.md#over-time-effects-activity-tab) or [Legacy Overtimes](/README.md#overtime-effects-flag-based))

### Hiding and Vision

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.hidden.dc` | Direct | On the Hiding condition effect: the hide's DC (default 15, e.g. when set from the token HUD) |
| `token.flags.midi-qol.visionSourceHeight` | Direct | Token flag: height (0-100% of the token's height) its vision originates from. Overrides the vision height setting |
| `token.flags.midi-qol.visionTargetHeight` | Direct | Token flag: height (0-100% of the token's height) at which other tokens test whether they can see it |

---

## Action Tracking

Track action economy usage. All action tracking flags are **Direct** (boolean/numeric/string values).

### Reaction Tracking

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.actions.reaction` | Direct | Reaction used (true/false) |
| `flags.midi-qol.actions.reactionsUsed` | Direct | Number of reactions used |
| `flags.midi-qol.actions.reactionCombatRound` | Direct | Round reaction was used |
| `flags.midi-qol.actions.reactionsMax` | Direct | Reactions allowed before the actor is marked as having used its reaction (default 1) |
| `flags.midi-qol.actions.reactionsReset` | Direct | When reactions reset, if not the default: `eachTurn` (after one turn), `rest` (on a rest), `never` |

### Bonus Action Tracking

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.actions.bonus` | Direct | Bonus action used (true/false) |
| `flags.midi-qol.actions.bonusActionsUsed` | Direct | Number of bonus actions used |
| `flags.midi-qol.actions.bonusActionCombatRound` | Direct | Round bonus action was used |
| `flags.midi-qol.actions.bonusActionsMax` | Direct | Bonus actions allowed before the actor is marked as having used its bonus action (default 1) |
| `flags.midi-qol.actions.bonusActionsReset` | Direct | When bonus actions reset, if not the default: `eachTurn` (after one turn), `rest` (on a rest), `never` |

---

## Item Flags

Flags that can be set on items. All item flags are **Direct** (string/boolean values).

| Flag | Access | Description |
|------|--------|-------------|
| `flags.midi-qol.onUseMacroName` | Direct | OnUse macro configuration |
| `flags.midi-qol.syntheticItem` | Direct | Mark item as synthetic (created programmatically) |
| `flags.midi-qol.noProvokeReaction` | Direct | Using this item (or an activity with this flag) does not prompt targets' reactions |
| `flags.midi-qol.optional.NAME.*` | — | Optional bonuses (as [above](#optional-bonus-effects)) that apply only to uses of this item, e.g. set by an enchantment. An actor flag of the same NAME takes precedence |
| `flags.midi-qol.detectMagic.vision` | Direct | On a Detect Magic spell automated with CAT: sensing magic also gives the caster Magic Sight (rings on magical tokens) |

---

## Native dnd5e Alternatives

Some midi-qol flags have native dnd5e equivalents. Both approaches work, but they have different capabilities.

### Death Save Fields

| Native dnd5e Field | Value | Description |
|--------------------|-------|-------------|
| `system.attributes.death.roll.bonus` | string | Bonus formula (e.g., "+2", "1d4", "@abilities.wis.mod"). `system.attributes.death.bonuses.save` is deprecated in dnd5e 6 |
| `system.attributes.death.roll.mode` | number | 1 = advantage, -1 = disadvantage, 0 = normal |
| `system.attributes.death.roll.min` | number | Minimum die result (e.g., 10 for "can't roll below 10") |
| `system.attributes.death.roll.max` | number | Maximum die result |
| `system.attributes.death.roll.fail` / `.success` | string | Added by midi: automatic failure / success (condition expression) |

**Comparison with midi-qol flags:**

| Feature | Midi-qol Flags | Native dnd5e Fields |
|---------|----------------|---------------------|
| Conditional evaluation | Yes - the value is a condition expression | No - always applies (except midi's `fail` / `success` fields) |
| Stacks with other effects | Yes - evaluated alongside other flags | Yes - processed by dnd5e |
| Advantage + Disadvantage | Separate flags, can cancel out | Single `roll.mode` value |
| Set via Active Effects | Yes | Yes |
| Min/Max die results | No | Yes (`roll.min`, `roll.max`) |

**When to use which:**
- Use **midi-qol flags** when you need conditional logic (e.g., "advantage on death saves while raging")
- Use **native dnd5e fields** for simple, always-on bonuses or when you need min/max die control
- Both can be used together - they stack

**Example - Native dnd5e Active Effect:**
```
Key: system.attributes.death.roll.bonus
Mode: Add
Value: +2
```

**Example - Midi-qol conditional:**
```
Key: flags.midi-qol.advantage.deathSave
Mode: Custom
Value: hasCondition(tokenUuid, "raging")
```

### dnd5e 6 Roll Fields

Every dnd5e 6 roll modification field (`system.abilities.{ability}.save.roll`, `.check.roll`, `.attack.roll`, `system.skills.{skill}.roll`, `system.tools.{tool}.roll`, `system.rolls.ability.{save|check|skill|tool}`, `system.rolls.attack[.{attackType}]`, `system.attributes.death.roll`, `system.attributes.concentration.roll`, `system.attributes.init.roll`) has, beside dnd5e's `bonus`, `min`, `max` and `mode`, two midi conditions:

| Field | Description |
|-------|-------------|
| `{roll field}.fail` | Condition expression: the roll automatically fails |
| `{roll field}.success` | Condition expression: the roll automatically succeeds |

The old `fail.*`, `success.*`, `min.*` and `max.*` flags are mapped onto these fields (see [Auto-Fail](#auto-fail) and [Min/Max Rolls](#minmax-rolls)).

---

## Deprecated Flags

These flags are deprecated and should not be used. Use the replacements indicated.

### Damage Reduction (DR)

All `flags.midi-qol.DR.*` flags are deprecated. Use `system.traits.dm.*` fields instead.

**Important: Sign Change!** The old flags used **positive values** to reduce damage. The new `system.traits.dm` fields use **negative values** to reduce damage (following dnd5e convention).

| Deprecated Flag | Mapped To | Migration Example |
|-----------------|-----------|-------------------|
| `flags.midi-qol.DR.all` | `system.traits.dm.midi.all` | `5` → `-5` |
| `flags.midi-qol.DR.{damageType}` | `system.traits.dm.amount.{damageType}` | `5` → `-5` |
| `flags.midi-qol.DR.{attackType}` | `system.traits.dm.midi.{attackType}` | `5` → `-5` |
| `flags.midi-qol.DR.non-magical` | `system.traits.dm.midi.non-magical` | `5` → `-5` |
| `flags.midi-qol.DR.non-magical-physical` | `system.traits.dm.midi.non-magical-physical` | `5` → `-5` |
| `flags.midi-qol.DR.non-silver` | `system.traits.dm.midi.non-silver-physical` | `5` → `-5` |
| `flags.midi-qol.DR.non-adamant` | `system.traits.dm.midi.non-adamant-physical` | `5` → `-5` |
| `flags.midi-qol.DR.non-physical` | `system.traits.dm.midi.non-physical` | `5` → `-5` |
| `flags.midi-qol.DR.non-spell` | `system.traits.dm.midi.non-spell` | `5` → `-5` |
| `flags.midi-qol.DR.spell` | `system.traits.dm.midi.spell` | `5` → `-5` |

*Attack types: mwak, rwak, msak, rsak.*

> [!tip] Navigation
> See [Damage Modification (system.traits.dm)](#damage-modification-systemtraitsdm) for full documentation.

### Critical Failure Flags

| Deprecated Flag | Access | Mapped To |
|-----------------|--------|-----------|
| `flags.midi-qol.fail.critical.all` | Evaluated | `flags.midi-qol.grants.noCritical.all` |
| `flags.midi-qol.fail.critical.{attackType}` | Evaluated | `flags.midi-qol.grants.noCritical.{attackType}` |

*Attack types: mwak, rwak, msak, rsak.*

### Grants Fail Flags

These flags have been renamed to clearer equivalents.

| Deprecated Flag | Access | Mapped To |
|-----------------|--------|-----------|
| `flags.midi-qol.grants.fail.advantage.attack.all` | Evaluated | `flags.midi-qol.grants.noAdvantage.attack.all` |
| `flags.midi-qol.grants.fail.advantage.attack.{type}` | Evaluated | `flags.midi-qol.grants.noAdvantage.attack.{type}` |
| `flags.midi-qol.grants.fail.disadvantage.attack.all` | Evaluated | `flags.midi-qol.grants.noDisadvantage.attack.all` |
| `flags.midi-qol.grants.fail.disadvantage.attack.{type}` | Evaluated | `flags.midi-qol.grants.noDisadvantage.attack.{type}` |

*Types: mwak, rwak, msak, rsak.*

### Advantage/Disadvantage Ability Save/Check Flags

The following flags were renamed for consistency. The old flags with `ability` in the path **no longer work** (no mapping and no warning): replace them.

| Deprecated Flag | Replacement |
|-----------------|-------------|
| `flags.midi-qol.advantage.ability.save.all` | `flags.midi-qol.advantage.save.all` |
| `flags.midi-qol.advantage.ability.save.{ability}` | `flags.midi-qol.advantage.save.{ability}` |
| `flags.midi-qol.advantage.ability.check.all` | `flags.midi-qol.advantage.check.all` |
| `flags.midi-qol.advantage.ability.check.{ability}` | `flags.midi-qol.advantage.check.{ability}` |
| `flags.midi-qol.disadvantage.ability.save.all` | `flags.midi-qol.disadvantage.save.all` |
| `flags.midi-qol.disadvantage.ability.save.{ability}` | `flags.midi-qol.disadvantage.save.{ability}` |
| `flags.midi-qol.disadvantage.ability.check.all` | `flags.midi-qol.disadvantage.check.all` |
| `flags.midi-qol.disadvantage.ability.check.{ability}` | `flags.midi-qol.disadvantage.check.{ability}` |

*Abilities: str, dex, con, int, wis, cha.*

> [!warning]
> Effects still using these keys silently do nothing. Update your Active Effects to use the new flag names. (`advantage.ability.all` / `disadvantage.ability.all` are not affected: they are current flags.)

### Other Deprecated

| Deprecated Flag | Access | Mapped To |
|-----------------|--------|-----------|
| `flags.midi-qol.sharpShooter` | Evaluated | `flags.dnd5e.sharpShooter` |
