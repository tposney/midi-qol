# Midi-QOL

![](https://img.shields.io/badge/Foundry-v10-informational)
![](https://img.shields.io/badge/Foundry-v11-informational)
![](https://img.shields.io/badge/Foundry-v12-informational)
![](https://img.shields.io/badge/Foundry-v13-informational)
![](https://img.shields.io/badge/Dnd5e-v3.3.1-informational)
![](https://img.shields.io/badge/Dnd5e-v4.4.2-informational)
![](https://img.shields.io/badge/Dnd5e-v5.2.4+-informational)
![](https://img.shields.io/badge/Dnd5e-v5.3+-informational)
![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fmidi-qol&colorB=4aa94a)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/tposney)

### Join our Discord community
<a href="https://discord.gg/Xd4NEvw5d7"><img src="https://img.shields.io/discord/915186263609454632?logo=discord" alt="chat on Discord"></a>

**Midi-QOL** is an automation module for D&D 5e in Foundry VTT that streamlines combat and spellcasting.

## Key Features

| Feature | Description |
|---------|-------------|
| **Automated Rolls** | Auto-roll attacks, damage, and saving throws with configurable fast-forward options |
| **Hit Detection** | Automatic hit/miss calculation comparing attack rolls against target AC |
| **Damage Application** | One-click damage application with support for resistances, immunities, and vulnerabilities |
| **Saving Throws** | Automated save prompts with configurable player/GM rolling and timeout options |
| **Active Effects** | Automatic application of item effects to targets based on hits/saves |
| **Concentration** | Automatic concentration tracking with constitution save prompts on damage |
| **Reactions** | Support for reaction prompts (opportunity attacks, Shield, Counterspell, etc.) |
| **Targeting** | Template-based auto-targeting, range checking, and cover calculation |
| **Combo Cards** | Consolidated chat cards showing attack, damage, hits, and saves in one message |
| **Flanking/Flanked** | Optional flanking/flanked rules with multiple calculation methods |
| **OverTime Effects** | Damage/saves at start/end of turn (burning, poison, hold person, etc.) |
| **Undo System** | Revert recent rolls and damage application |
| **Macro Integration** | OnUse macros, damage bonus macros, and hooks for extending item functionality |

Midi-QOL is highly configurable with quick-start presets for common play styles, from full automation to completely manual rolling.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Installation & Compatibility](#installation--compatibility)
- [Configuration Reference](#configuration-reference)
- [Features Guide](#features-guide)
- [Flags Reference](#flags-reference)
- [Optional Rules](#optional-rules)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [For Developers](#for-developers)
- [Changelog & Credits](#changelog--credits)

## Other Pages

- [Flags](/FLAGS.md)
- [Flowchart](/docs/flowchart.md)
- [Getting Started](/Getting%20Started.md)
- [Macros](/MACROS.md)
- [Workflow Fields](/docs/workflowfields.md)

---

# Quick Start

## Minimum Setup

1. **Install required modules:**
   - DAE (Dynamic Active Effects)
   - libwrapper
   - socketlib

2. **Enable workflow automation** (per-player setting):
   - Go to Module Settings > Midi-QOL
   - Check "Enable roll automation support"
   - **Important:** Each player must enable this on their client!

3. **Use Quick Settings** (recommended for new users):
   - Open Midi-QOL settings and go to the **Quick** tab
   - Click a preset button to apply a combination of settings at once

## Quick Settings Presets

The **Quick** tab in settings provides one-click presets:

| Preset | Description |
|--------|-------------|
| **Full Automation** | Minimal button presses - everything automated |
| **No Automation** | All rolls manual - traditional play |
| **GM Attack/Damage: Auto** | GM rolls automated, players manual |
| **GM Attack/Damage: Manual** | GM rolls manual |
| **Player Attack/Damage: Auto** | Player rolls automated |
| **Player Attack/Damage: Manual** | Player rolls manual |
| **Auto Hits/Saves/Damage** | Automatic hit checking, saves, and damage application |
| **No Hits/Saves/Damage** | Manual hit/save/damage handling |
| **Show Item Info** | Display item details in chat cards |

These presets modify multiple settings at once and show you exactly what changed.

## Manual Configuration

If you prefer to configure settings manually, here's a recommended full automation setup:

| Setting | Tab | Value |
|---------|-----|-------|
| Merge to One Card | Misc | Checked |
| Auto Target on Template | Workflow | Walls Block |
| GM Auto Roll Attack | GM | Checked |
| GM Auto Roll Damage | GM | Always |
| GM Auto Fast Forward Rolls | GM | Attack, Damage |
| Player Auto Roll Attack | Player | Checked |
| Player Auto Roll Damage | Player | Attack Hits |
| Player Auto Fast Forward Rolls | Player | Attack, Damage |
| Auto Check Hits | Workflow | On |
| Auto Check Saves | Workflow | Save - players see results |
| Players Roll Saves | Workflow | Auto roll and show roll dialog |
| Player Save Timeout | Workflow | 30 seconds |
| Auto Apply Damage | Workflow | Yes + undo card |
| Damage Immunities | Workflow | Apply + physical |
| Auto Apply Item Effects | Workflow | Checked |

> [!tip] Navigation
> See [Configuration Reference](#configuration-reference) for all available settings.

---

# Installation & Compatibility

## Available Versions

| Version | Foundry | DnD5e | Manifest |
|---------|---------|-------|----------|
| v11.4.48 | v12 | up to v3.2.x | - |
| v11.6.x | v12 | v3.3.x | [manifest](https://gitlab.com/tposney/midi-qol/raw/v11.6/package/module.json) |
| v12.4.27+ | v12 | v4.2+ | [manifest](https://gitlab.com/tposney/midi-qol/raw/v12dnd4/package/module.json) |
| v13.0.57+ | v13 | v5.2.4+ / v5.3 | [manifest](https://gitlab.com/tposney/midi-qol/raw/v13/package/module.json) |

## Required Modules

| Module | Notes |
|--------|-------|
| **DAE** | Dynamic Active Effects - required |
| **libwrapper** | Required |
| **socketlib** | Required |

## Recommended Modules

### Effect Timing & Expiry

| Module | Description |
|--------|-------------|
| [**Times-up**](https://foundryvtt.com/packages/times-up) | Automatically expires Active Effects as game time passes. Essential for spell durations and temporary buffs. Works with DAE and integrates with time-tracking modules. |
| **Calendar Module** | Any module that advances game time (Simple Calendar, SmallTime, etc.) - required for Times-up to function properly with real-time expiry. |

### Auras & Proximity Effects

| Module | Description |
|--------|-------------|
| [**Active Auras**](https://foundryvtt.com/packages/ActiveAuras) | Propagates Active Effects labeled as auras onto nearby tokens. Perfect for Paladin's Aura of Protection, Twilight Cleric's aura, Spirit Guardians, etc. Configurable distance and targeting. DAE @ fields are correctly parsed before application. |
| [**Aura Effects**](https://foundryvtt.com/packages/auraeffects) | **Preferred.** Converts Active Effects into auras with automatic range-based application. Features disposition filtering (friendly/hostile), stacking control ("best aura wins" logic), visual aura boundaries, and formula evaluation at the source for stat-based bonuses. |

### Visual Effects & Animations

| Module | Description |
|--------|-------------|
| [**Automated Animations**](https://foundryvtt.com/packages/autoanimations) | Provides a visual interface to assign animations to attacks and spells. Requires Sequencer module and JB2A animated assets. No animations included - designed to work with JB2A. |
| [**JB2A**](https://foundryvtt.com/packages/JB2A_DnD5e/) | Jules & Ben's Animated Assets - provides animated spell effects, weapon attacks, explosions, and more. Free version available; Patreon version has extended library. |
| [**D&D5e Animations**](https://foundryvtt.com/packages/dnd5e-animations) | Over 1,000 pre-configured animation setups for D&D 5e spells and abilities. Works with Automated Animations and JB2A. Falls back to free JB2A if Patreon version not installed. |
| [**Token Magic FX**](https://foundryvtt.com/packages/tokenmagic) | Adds visual effects (bloom, distortion, glow, fire, smoke, lightning, etc.) to tokens, tiles, templates, and drawings. Effects can be animated. Includes macro compendium for easy effect application. |

### Macro & Automation Extensions

| Module | Description |
|--------|-------------|
| [**Automated Conditions 5e**](https://foundryvtt.com/packages/automated-conditions-5e) | Automates D&D 5e status effects (Blinded, Frightened, Prone, Restrained, etc.) to dynamically influence rolls. Highlights correct roll buttons, handles range checks, extended conditions (Dodging, Hiding), and supports custom AC5e flags for complex scenarios. Compatible with Midi-QOL (check the [compatibility notes](https://github.com/thatlonelybugbear/automated-conditions-5e/wiki/Compatibility-with-MidiQOL-and-Cauldron-of-Plentiful-Resources-(CPR)) and [wiki](https://github.com/thatlonelybugbear/automated-conditions-5e/wiki)). |
| [**Effect Macro**](https://foundryvtt.com/packages/effectmacro) | Embed macros directly into Active Effects that trigger on creation, deletion, or toggle. Provides pre-defined variables: token, scene, origin, speaker, item. Essential for complex conditional effects. |

### Content Import

| Module | Description |
|--------|-------------|
| [**DDB-Importer**](https://foundryvtt.com/packages/ddb-importer) | Import D&D Beyond content: characters, spells, items, monsters, adventures, and encounters. Character imports include complete features, weapons, and spells. Works well with DAE and DFreds Convenient Effects for automation layers. Patreon tier unlocks monster/class/feat importing. |

### Pre-Built Automations

| Module | Description |
|--------|-------------|
| [**Cauldron of Plentiful Resources**](https://foundryvtt.com/packages/chris-premades) | Comprehensive collection of automated spells, class features, and monster abilities. Includes custom roll resolver for in-person games, fancy Eskiemoh animations, and quality-of-life UI extensions. Extends Midi-QOL's workflow API. Has its own [wiki](https://github.com/chrisk123999/chris-premades/wiki). |
| [**Midi Item Showcase Community**](https://foundryvtt.com/packages/midi-item-showcase-community) | Community-contributed automations from the Posney's Foundry Automation Discord. Growing collection of user-submitted items, spells, and scripts. |
| [**Gambit's Premades**](https://foundryvtt.com/packages/gambits-premades) | Curated library of automated spells, items, and feats. Handles difficult "3rd party reaction" items like Counterspell, Opportunity Attacks, and Silvery Barbs. Features custom AppV2 dialogs with animated countdown timers for reactions. |

## Good to Have

| Module | Purpose |
|--------|---------|
| Active Token Lighting | Token light emission |
| DFreds Convenient Effects | Custom effects |
| Dice So Nice | 3D dice rolling |
| Levels | Height-based calculations |
| Levels - Volumetric Templates | 3D template targeting |
| Monks Token Bar | Save management |
| Alternative Token Cover / Simbul's Cover Calculator / Simple Cover 5e | Cover calculation |

## Known Incompatibilities

| Module | Issue |
|--------|-------|
| Ready Set Roll | Not compatible |
| Cautious GM | Breaks blind chats by hidden GM |
| Chat Portraits | Overwrites midi-qol token name changes |
| Warpgate | Should NOT be used with Foundry v12+ |

## Compatible Modules

| Module | Notes |
|--------|-------|
| Dice So Nice | Works with merge card (complex interactions) |
| Monks Token Bar | Use for save rolls; adv/dis now supported |
| Convenient Effects | Matches effects by name; toggle per-item |
| Levels | Uses wall collision for distance/LOS |
| DDB Game Log | Triggers workflow from D&D Beyond rolls |

---

# Configuration Reference

## GM Tab

| Setting | Description |
|---------|-------------|
| Preferred GM | Preferred GM for socket calls. If 'none' the first GM on the current scene will be used. (Migrated from module settings into the config panel in 13.0.43) |
| Auto Roll Attack | When item is rolled, automatically roll the attack |
| Consume Resource | Skip consume resource dialog (None/Spell slot/Resources/Both) |
| Confirm Ammunition | Prompt before consuming ammunition |
| Require Ammunition | Require ammunition for ranged attacks |
| Auto Roll Damage | Automatically roll damage (Never/Always/Attack Hits) |
| Average Damage | Use average damage instead of rolling |
| Auto Fast Forward Rolls | Multi-select: which roll types to fast-forward (Attack/Damage/Ability Checks/Saving Throws/Skills/Tools). Skills are separate from ability checks for finer control. (Restructured in 13.0.43 from a single toggle to per-roll-type multi-select) |
| Remove Buttons | Remove chat card buttons after roll (Off/Attack/Damage/All) |
| Hide Roll Details | Choose how much of GM rolls to hide from players |
| GM Sees All Whispered Messages | GM sees all whispered chat messages |
| Show Attack/Damage Cards | Show separate attack/damage cards for deception |
| Hide 3D Dice | Hide Dice So Nice for GM attack/damage/save rolls |
| Ghost Rolls | Display with Dice So Nice ghost rolls rather than hiding |
| Add Fake Dice | Add fake dice to confuse players |

## Player Tab

| Setting | Description |
|---------|-------------|
| Auto Roll Attack | When item is rolled, automatically roll the attack |
| Consume Resource | Skip consume resource dialog (None/Spell slot/Resources/Both) |
| Confirm Ammunition | Prompt before consuming ammunition |
| Require Ammunition | Require ammunition for ranged attacks |
| Auto Roll Damage | Automatically roll damage (Never/Always/Attack Hits/Save Only) |
| Auto Fast Forward Rolls | Multi-select: which roll types to fast-forward (Attack/Damage/Ability Checks/Saving Throws/Skills/Tools). Also applies to chat card buttons. Skills are separate from ability checks for finer control. (Restructured in 13.0.43 from a single toggle to per-roll-type multi-select) |
| Remove Buttons | Remove chat card buttons after roll (Off/Attack/Damage/All) |

## Workflow Tab

### Targeting

| Setting | Description |
|---------|-------------|
| Auto Target on Template | When placing a template auto-target tokens inside (None/Always/Walls Block/Walled Templates). Now uses a Hook for better compatibility with other modules (13.0.47). Supports multiple templates per item (13.0.43). |
| Range Target | Auto-target for radius/emanation spells if target type is creature/enemy/ally |
| Require Targets | Require tokens to be targeted before rolls (Never/In Combat/Always) |
| Enforce Single Weapon Target | Limit weapon attacks to single target |
| Constrain Template Placement | Anchor ray/cone templates to token edge, and constrain template placement to item range. (Renamed from "Anchor Ray/Cone Templates" in 13.0.45) |
| Template Grid Snapping | Snap template placement to half-grid (centers + midpoints) or full-grid (centers only). Half-grid is the Foundry/dnd5e default; full-grid is RAW. (Added in 13.0.47) |

### Target Confirmation

Target Confirmation displays a dialog before completing an item roll, allowing you to review and adjust your targets. The dialog shows each target with useful information like range, cover status, and flanking.

**Configuration:** Access via Configure Settings → Module Settings → midi-qol → "Target Confirmation" button.

**Enable Target Confirmation** - Master toggle for the feature.

**Always confirm targets** - If enabled, shows confirmation for every roll. If disabled, you can select specific conditions:

| Option | When Confirmation Shows |
|--------|------------------------|
| Confirm targets if none selected | You haven't selected any targets before using the item. Useful to ensure you don't accidentally roll without targeting, especially for attack spells or weapon strikes. |
| Confirm targets if rolled item has an attack | The item includes an attack roll (weapons, attack spells like Fire Bolt, etc.). Helps verify targets before committing to an attack action. |
| Confirm targets if rolled item has 'creature' target | Item's target type is set to "creature" in the item configuration. Catches spells like Hold Person that specifically target creatures. |
| Confirm targets if self is targeted | You have included yourself in the target selection. Prevents accidental self-targeting with harmful effects, or confirms intentional self-buffs. |
| Confirm targets if item has an AoE | Item uses an area of effect template (cone, sphere, cylinder, etc.). Allows review of all tokens caught in the template before applying effects. |
| Confirm targets if item has ranged AoE | Item has an AoE that originates at range (like Fireball) rather than emanating from the caster (like Spirit Guardians). Useful for positioning confirmation. |
| Confirm targets if any target is long range | Any selected target is beyond normal range, meaning the attack would be at disadvantage. The dialog shows "Long Range" status for affected targets. |
| Confirm targets if any target has cover | Any target has cover from the attacker's position. The dialog displays cover level (Half/Three-Quarters/Full) so you can reconsider or reposition. |
| Confirm targets if any target is an ally | Any selected target has friendly disposition relative to your token. Prevents accidentally hitting party members with damaging effects. |
| Confirm targets if targeting allies and hostiles | You've selected a mix of friendly and hostile tokens. Important for area effects where you might want to exclude allies or include specific enemies. |

**Dialog Position** - Use the 3x3 grid to choose where the confirmation dialog appears on screen (corners, edges, or center).

**Dialog Features:**
- Shows target name, image, and disposition (friendly/hostile)
- Displays range status (Normal/Long/Out of Range)
- Shows cover status (Half/Three-Quarters/Full/None)
- Shows flanking status if flanking rules enabled
- Shift-click tokens on canvas to add targets
- Right-click target in list to remove
- Click target image to ping its location on canvas
- Hover over target to highlight on canvas

### Special

| Setting | Description |
|---------|-------------|
| Auto Remove Template | Auto remove placed template on spell expiry |
| Auto Remove Instantaneous Template | Remove instantaneous spell templates immediately |
| Auto Remove Summoned Creature | Auto remove summoned creatures on item expiry/concentration removal |
| Auto Apply Effects | Apply item active effects to targets if hit, failed save, or no save required |
| Auto Undo Transformations | Auto revert target to original form on effect/concentration expiry |
| Auto Convenient Effects | Apply Convenient Effects matching activity/item name (requires module) |

### Hits

| Setting | Description |
|---------|-------------|
| Auto Check Hits | Check if attack roll hits targets - damage rolls if one+ targets hit and auto roll damage enabled |
| Attack Per Target | Roll a separate attack per target |
| Walls Block Range | How walls affect range calculation (None/Center/Center+Levels/Auto Cover modules) |
| Cover Calculation | Calculate AC bonus for targets in cover using selected module |
| Distance Includes Height | Include height difference in distance calculations |

### Saves

| Setting | Description |
|---------|-------------|
| Auto Check Saves | Automatic save checking (None/No Roll/All See/All Show/Whisper/GM Only). Supports multiple saves per activity (e.g., dex or con) — auto-selects the best modifier or prompts the player via dropdown. (Multiple saves added in 13.0.43) |
| DND5E Challenge Visibility | Show save DC to players (All/Player/None) - uses dnd5e setting. "Player" shows DC only for player-owned actor saves. |
| Display Save Advantage | Show advantage/disadvantage status |
| Default Save Multiplier | Damage multiplier on save (default 0.5) |
| Player Roll Saves | How players roll saves (None/None+Dialog/Chat/Monks TB/Flash Rolls/Epic Rolls) |
| Roll NPC Saves | How unlinked NPCs roll saves (None/Auto/Auto+Dialog/Monks TB/Flash Rolls/Epic Rolls) |
| Roll NPC Linked Saves | How linked NPCs roll saves (same options as NPC Saves) |
| Player Save Timeout | Seconds before auto-rolling |

**Player Roll Saves Options:**
- **None** - GM rolls for players automatically
- **None + Dialog** - GM rolls with dialog (Public/Private/Self/Blind visibility)
- **Chat Message** - Players prompted via chat
- **Monks Token Bar** - Use Monks Token Bar (requires module)
- **Flash Rolls 5e** - Use Flash Rolls (requires module)
- **Epic Rolls 5e** - Use Epic Rolls (requires module)

### Damage

| Setting | Description |
|---------|-------------|
| Critical Damage (Player) | How critical hits calculate damage for player characters (DND5e Settings Only/Max Normal/Max Critical Dice/Max All/Double Dice/Explode/etc.). (Migrated from module settings into the config panel in 13.0.43) |
| Critical Damage (GM) | How critical hits calculate damage for GM-controlled actors. (Migrated from module settings into the config panel in 13.0.43) |
| Auto Apply Damage | Auto apply damage to hit targets (No/Yes/Yes+Card options) |
| Damage Card Style | Flexbox (inline HP/TempHP/Vitality display) or Classic (table layout). Use Flexbox if using vitality. |
| Add Chat Damage Buttons | Enable dnd5e damage tray on chat messages (None/GM/PC/Both) |
| Player Damage Card | Show a simpler damage card to players (not shown to GM) |
| Player Card Damage Different | Show player damage card if rolled damage differs from applied damage |
| Apply Immunities | Apply target's damage immunity/vulnerability/resistance (Off/Apply/Apply+Physical) |
| Immunity Multiplier | Immunity reduces damage to this multiplier (default 0) |
| Resistance Multiplier | Resistance reduces damage to this multiplier (default 0.5) |
| Vulnerability Multiplier | Vulnerability multiplies damage by this (default 2) |
| Save DR Order | Order of save multiplier vs damage reduction calculation |
| Require Magical | When items do magical damage (Off: non-weapons/Non-spell/All items) |

## Concentration Tab

| Setting | Description |
|---------|-------------|
| Do Concentration Check | Force concentration save when damage taken (None/Chat Only/Chat+Auto/Item Card) |
| Remove Concentration | Remove concentration on failed concentration save |
| Incapacitated Check | Remove concentration when incapacitated condition applied |
| Single Concentration Roll | Single check for combined damage from attack + save + other/versatile |
| Temp HP Damage Check | Loss of temporary HP triggers concentration check (RAW: enabled) |
| Remove Concentration Effects | Check when effects removed - if all effects/templates gone, remove concentration |

**Do Concentration Check Options:**
- **None** - No concentration checks
- **Chat Only** - Display chat message with button (dnd5e default behavior)
- **Chat + Auto** - Display chat message and auto-roll the save
- **Item Card** - Roll concentration as an item with Constitution save targeting the damaged actor at the correct DC

## Reactions Tab

| Setting | Description |
|---------|-------------|
| Do Reactions | Give attacked actor option to use reaction before adjudicating roll |
| GM Do Reactions | Check NPC/GM reactions (On/On+Magic Items/Off) |
| Reaction Timeout | How long to wait before assuming no reaction taken (seconds) |
| Show Reaction Chat Message | Show chat prompt for reactions |
| Show Reaction Attack Roll | What attack info to show (Attack Hits/d20/Total/Total+Critical) |
| Ignore Spell Reaction Restriction | Allow any reaction spell without checking slots/preparation |
| Enforce Reactions | Prompt when using reaction if already used this round |
| Enforce Bonus Actions | Prompt when using bonus action if already used this round |
| Record AOO | Mark reaction used when attacking outside your turn (None/Characters/All) |

## Misc Tab

| Setting | Description |
|---------|-------------|
| Colored Borders | Chat messages have colored borders/text in the player character's color (None/Borders Only/Border + Name Text/Border + Name Background). (Migrated from module settings into the config panel in 13.0.43) |
| Saves Before Damage | Calculate saves before damage rolls |
| Activity Name Prefix | Prefix activity name to chat messages |
| Midi Properties Tab | Show midi properties tab on items (by role) |
| Allow Actor Use Macro | Add actor on use macro field to sheet |
| Allow Use Macro | Add item on use macro field to sheet |
| Show Item Details | Display item details in chat card (None/Card Only/PC/All) |
| Display Item Properties | Display item properties in chat card |
| Merge Card Condensed | Conserve chat log space with smaller attack/damage rolls |
| Merge Card Multi | Combine multiple targets in one card |
| Collapsible Targets | Make target list collapsible in chat (default: false since 13.0.39) |
| Confirm Attack Damage | Confirm before applying attack damage |
| Auto Complete Workflow | Complete workflow automatically (default: true since 13.0.39) |
| Highlight Success | Color code hits (green) and misses (red) in display |
| Highlight Critical Attack Only | Only highlight critical/fumble, not normal hits/misses |
| Roll Alternate | Move roll formula to tooltip, optionally show advantage attribution |
| Show Fast Forward | Show fast-forward indicator on attack/damage buttons |
| Use Token Names | Chat card titles and target names use token name not actor name |
| Use Player Portrait | Use actor portrait instead of token image for characters |
| Show Core Sheet Buttons | Show info/attack/damage buttons on the core dnd5e character sheet per activity. (Added in 13.0.40) |
| Keep Roll Statistics | Record attack and damage roll data for actors. Accessible from the main midi-qol settings panel. (Revived and enhanced in 13.0.43) |
| Save Stats Every | Save statistics every N rolls (suggest 10-20+) |
| Player Stats Only | Only keep statistics for player-owned actors |
| Use Custom Sounds | Enable midi-qol custom sounds (configure separately) |

## Mechanics Tab

| Setting | Description |
|---------|-------------|
| Add Wounded | Add status when HP falls below specified % of max (0 disables) |
| Add Dead | Add effect when HP = 0 (overlay/icon for unconscious/dead) |
| Mark Player Defeated | Mark player tokens as defeated in combat tracker |
| Mark Non-Player Defeated | Mark NPC tokens as defeated in combat tracker |
| Roll Checks Blind | Which ability checks are rolled blind |
| Roll Saves Blind | Which saves are rolled blind |
| Roll Skills Blind | Which skill checks are rolled blind |
| Action Special Duration Immediate | Expire 1Hit/1Attack/1Action on roll, don't wait for damage |
| Wait For Damage Application | Wait for damage application before continuing workflow |
| Incapacitated | When incapacitated actor acts: Do nothing/Enforce no actions/Warn only |
| Check Range | Check weapon range when attacking (None/Long range fail/Long range disadvantage) |
| Check Two-Handed | Enforce two-handed weapon rules |
| Distance Measurement | How distances are measured between tokens: Foundry Default (center-to-center), Grid Square Center (center of all covered grid squares), or Token Perimeter (shortest distance between token boundary polygons). Token Perimeter is recommended for exact measurement; Grid Square Center for equidistant gridded scenes. (Added in 13.0.45) |
| Gridless Fudge | Distance fudge factor for gridless maps. Not needed when using Grid Square Center or Token Perimeter measurement |
| Gridded Gridless | Treat gridless maps as having a grid - tokens snap to nearest grid point for distance |
| Skill Ability Check Advantage | Ability check advantage/disadvantage applies to skills using that ability |
| Display Bonus Rolls | Show bonus rolls in chat |
| Auto Reroll Initiative | Reroll initiative for all combatants at start of new round |
| Undo Workflow | Store undo data for all item/activity rolls |
| Undo Chat Color | Color for undo messages |
| Activation Automation | Automate activation conditions (None/Chat/Auto) |

## Rules Tab (Optional Rules)

| Setting | Description |
|---------|-------------|
| Optional Rules Enabled | Master toggle for optional rules |
| Check Flanking | Check if you and allies flank opponent (Advantage/Flanking effect/Flanked effect). Supports hex grids (13.0.51+) |
| Flanking Bonus | Numeric bonus to apply instead of advantage when flanking (0 = use advantage). Per-target bonus reduces target AC rather than granting blanket advantage, giving finer-grained control. (Added in 13.0.51) |
| Flanking Visualization | Highlight squares/hexes that would provide flanking when targeting an adjacent creature. Useful for adjudicating disputes. Moderately expensive, not recommended for routine play. (Added in 13.0.51) |
| Invisible Advantage | Invisible attackers have advantage, disadvantage if target invisible (RAW 2014/RAW 2024/Vision). The 2024 mode checks visibility rather than the invisible condition. (2024 mode added in 13.0.43) |
| Hidden Advantage | Hidden attackers have advantage/disadvantage (None/Check Hidden/Perceptive) |
| Invisible Vision | Behave as if all tokens have vision enabled when checking |
| Remove Hidden/Invis | Attacking removes hidden status |
| Nearby Foe | Ranged attacks have disadvantage when foe within this distance (0 disables) |
| Max DR Value | (House Rule) Only most effective DR applies, doesn't accumulate |
| DR All Per Damage Detail | (House Rule) DR.all deducted from both attack and Other damage |
| Critical Saves | (House Rule) Natural 20/1 always succeed/fail on saves |
| Optional Crit Rule | (House Rule) Attack rolls this much above AC are critical (-1 disables) |
| Critical Nat 20 | (House Rule) Natural 20 still crits even if margin not met |
| Nearby Ally Ranged | (House Rule) Ranged attacks with allies near target have disadvantage |
| Active Defence | Players roll defence instead of GM rolling attack |
| Active Defence Modifier | Modifier for DC and roll calculation (suggest 12, 10, or 0) |
| Active Defence DC | Show active defence DC in chat card |
| Active Defence Show | Roll visibility mode for active defence |
| Challenge Mode Armor | Alternative armor class rules (see README) |
| Vitality Item | Name of a feature item on the actor to track vitality (overflow damage at 0 HP reduces vitality). Item uses.max = max vitality, uses.spent = vitality lost. |
| Vitality Dead Condition | Condition to apply when vitality reaches 0 (default: dead) |
| Vitality Death Requires | When actor is dead: "Vitality of 0" or "Vitality of 0 AND HP of 0" |
| Enable DDB Game Log | Accept rolls from ddb-game-log to trigger midi workflows |

## Custom Sounds

Midi-QOL provides a flexible system for playing sounds during workflow events. Enable with "Use Custom Sounds" in the Misc settings tab. Many of the supporting modules that provide visual effects also apply sound effects, so if using those you will not want midi custom sounds.

### Getting Started

1. Enable "Use Custom Sounds" in Midi-QOL Misc settings
2. Open the Sound Configuration panel (button in Misc settings)
3. Go to the "Quick" tab and click "Create Sample Playlist" to create the "Midi Item Tracks" playlist
4. Choose a preset configuration: Basic, Detailed, or Full
5. Switch to the "Sounds" tab to customize individual sound mappings

### Sound Configuration Panel

The configuration panel has two tabs:

**Quick Tab** - Fast setup options:
| Button | Action |
|--------|--------|
| Create Sample Playlist | Creates "Midi Item Tracks" playlist with included sound files |
| Basic Settings | Loads minimal sound configuration |
| Detailed Settings | Loads expanded configuration with consumable differentiation |
| Full Settings | Loads complete configuration with all triggers per item type |

**Sounds Tab** - Detailed configuration table with columns:
| Column | Description |
|--------|-------------|
| Char Type | Actor type filter: `Any`, `NPC`, or `Character` |
| Item Type | Item category: `All`, `Weapon`, `Spell`, `Consumable`, `Feat`, `Tool`, etc. |
| Sub Type | Specific subtype (weapon type, spell school, consumable type, or `Any`) |
| Event | The trigger event (see Sound Triggers below) |
| Playlist | Foundry playlist containing the sound |
| Sound | Specific sound from playlist, or `random` for random selection |

Use the **Add Row** button to create new mappings and the trash icon to delete rows. Click **Save Changes** to apply.

### Sound Triggers

Sounds can be configured for these workflow events:

| Trigger | When Played |
|---------|-------------|
| `itemRoll` | When an item is used/rolled |
| `attack` | When an attack roll is made (generic) |
| `damage` | When a damage roll is made (generic) |
| `critical` | When an attack is a critical hit |
| `fumble` | When an attack is a fumble |
| `hit` | When an attack hits (non-critical) |
| `miss` | When an attack misses |

**Action Type Triggers** (played during attack roll based on item's action type):

| Trigger | Action Type |
|---------|-------------|
| `mwak` | Melee Weapon Attack |
| `rwak` | Ranged Weapon Attack |
| `msak` | Melee Spell Attack |
| `rsak` | Ranged Spell Attack |
| `heal` | Healing |
| `abil` | Ability Check |
| `save` | Saving Throw |
| `util` | Utility |
| `other` | Other |

**Damage Type Triggers** (played during damage roll based on damage type):

`acid`, `bludgeoning`, `cold`, `fire`, `force`, `lightning`, `necrotic`, `piercing`, `poison`, `psychic`, `radiant`, `slashing`, `thunder`

### Sound Lookup Hierarchy

When a sound is needed, midi-qol searches in this order (first match wins):

1. **Actor Type** → **Weapon Base Type** → **Trigger**
   - e.g., `character.weapon.longsword.mwak`
2. **Actor Type** → **Item Type.Subtype** → **Trigger**
   - e.g., `character.spell.evocation.rsak`
3. **Actor Type** → **Item Type.any** → **Trigger**
   - e.g., `character.weapon.any.attack`
4. **Actor Type** → **all.any** → **Trigger**
   - e.g., `character.all.any.damage`
5. **any** → (repeat above with "any" as actor type)

**Actor Types:** `any`, `npc`, `character`

**Item Types and Subtypes:**
| Item Type | Subtypes |
|-----------|----------|
| `weapon` | `simpleM`, `simpleR`, `martialM`, `martialR`, or specific base types (longsword, shortbow, etc.) |
| `spell` | School abbreviations: `abj`, `con`, `div`, `enc`, `evo`, `ill`, `nec`, `trs` |
| `consumable` | `ammo`, `food`, `poison`, `potion`, `rod`, `scroll`, `trinket`, `wand` |
| `tool` | Tool type values |
| `feat` | `any` |
| `all` | `any` (matches everything) |

### Preset Configurations

| Preset | Description |
|--------|-------------|
| **Basic** | Essential sounds: dice for rolls, swing/bowshot/spell for action types, drink for consumables |
| **Detailed** | Basic + more consumable differentiation (rod, scroll, wand use spell sound) |
| **Full** | Detailed + all damage types configured, hit/miss events, all action types per item type |

### Sound Specification

Each sound mapping specifies:
- **Playlist Name**: The Foundry playlist containing the sound
- **Sound Name**: The specific sound within the playlist, or `"random"` to play a random sound from the playlist

### Included Sounds

The "Midi Item Tracks" sample playlist includes:

| Sound | Use Case |
|-------|----------|
| `dice` | Generic roll sound |
| `swing` | Melee weapon attacks |
| `bowshot` | Ranged weapon attacks |
| `spell` | Spell casting |
| `drink` | Potions/consumables |
| `use` | Generic item use |
| `success-drums` | Critical hits |
| `good-results` | Successful outcomes |
| `fail1`, `fail2`, `fail3` | Fumbles/failures |

### Example Configuration

To have longbows play a custom sound while other ranged weapons use the default:

```
Actor Type: any
  weapon:
    longbow:
      rwak: { playlistName: "My Sounds", soundName: "longbow-twang" }
    any:
      rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" }
```

---

# Features Guide

## Midi Properties Tab (Activities)

When midi-qol is installed, each activity on an item gains a "Midi" tab with additional configuration options. These settings override global midi-qol settings for that specific activity.

### Use Conditions

| Field | Description |
|-------|-------------|
| **Use Condition** | A roll expression that must evaluate to true for the activity to proceed. If false, the roll is blocked. Useful for conditional abilities (e.g., `@raceOrType.isUndead` for Turn Undead). |
| **Use Condition Reason** | Message displayed to the user when the use condition fails, explaining why the activity cannot be used. |
| **Active Effect Condition** | Condition that must be true for active effects to be applied to targets. Allows selective effect application. |
| **Choose Effects** | When enabled, presents a dialog to select which of the item's active effects to apply (useful for items with multiple optional effects). |
| **Toggle Effect** | If the target already has the effect, remove it instead of reapplying. Creates on/off toggle behavior for buffs. |
| **No Concentration Save** | Damage from this activity does not trigger concentration saving throws. Useful for environmental or secondary damage effects. |
| **Skip Concentration Check** | When the activity consumes HP (via consumption targets), skip the concentration check that would normally be triggered by the HP loss. Only appears when the activity has HP consumption configured. |

### Roll Behavior

| Field | Description |
|-------|-------------|
| **Roll Mode** | Override the chat message visibility (Public/GM Only/Blind/Self). "Default" uses the global setting. |
| **Remove Chat Buttons** | Control which buttons appear on the chat card (None/Attack/Damage/All). Useful for streamlining automated activities. |
| **Display Activity Name** | Show the activity name in the chat card header (useful when items have multiple activities). |
| **Identifier** | A custom identifier string for the activity, used by macros and automation to reference specific activities. |
| **Auto Consume** | Automatically consume resources (spell slots, item uses, etc.) without prompting. |
| **Force Consume Dialog** | Override: Always show the configuration dialog for consumption choices. Options: Default/Never/Always. |
| **Force Roll Config** | Override: Always show the attack/roll configuration dialog. Options: Default/Never/Always. |
| **Force Damage Config** | Override: Always show the damage configuration dialog. Options: Default/Never/Always. |
| **Target Confirmation** | Override target confirmation behavior for this activity. Options: Default/Never/Always. |

### Area of Effect (AoE) Options

These fields appear only for activities with area targets (templates):

| Field | Description |
|-------|-------------|
| **AoE Target Type** | Filter which tokens are targeted by the template: Any/Allies/Enemies. Overrides global setting. |
| **Target on Template Draw** | When to auto-target tokens in the template: None/Always/Walls Block/Walled Templates. |

### Damage Options

These fields appear only for activities that deal damage:

| Field | Description |
|-------|-------------|
| **Ignore Full Cover** | Targets with full cover still take damage/effects (for effects that go around corners). |
| **Ignore Damage Traits** | Bypass target's damage immunities, resistances, vulnerabilities, and/or absorption. Select multiple. |
| **Magic Damage** | Treat damage as magical for overcoming resistance to non-magical damage. |

### Other Options

| Field | Description |
|-------|-------------|
| **Apply Convenient Effects** | Auto-apply Convenient Effects matching the activity name (or item name if no match). Requires the Convenient Effects module. |
| **Automation Only** | Mark the activity as internal/hidden - not intended for manual use from the character sheet. Useful for triggered or secondary activities. |
| **Other Activity Compatible** | Allow this activity to be used as an "Other Activity" by another activity (for bonus damage, etc.). |

### Triggered Activities

Configure an activity to automatically trigger another activity on the same item:

| Field | Description |
|-------|-------------|
| **Trigger Activity** | Select another activity on this item to execute after this one completes. |
| **Trigger Condition** | Roll expression that must be true for the triggered activity to run (e.g., `@item.flags.midi-qol.hits > 0` to only trigger on hit). |
| **Trigger Targets** | Which targets receive the triggered activity: All/Hit/Hit+Failed Save/Hit+Successful Save/Missed/etc. |
| **Roll As** | Whose permissions are used for the triggered activity: Self/GM/Target Owner. |

### Over Time Effects (Activity Tab)

For activities that repeat on subsequent turns (like ongoing damage, regeneration, or repeated saves). When an effect with an OverTime activity is applied to a token, midi-qol automatically processes the activity at the specified point in the combat turn.

| Field | Description |
|-------|-------------|
| **Is Over Time** | Enable over-time processing for this activity. When enabled, additional options appear. |
| **Turn Choice** | When the effect triggers: **Start of Turn** or **End of Turn**. |
| **Save Removes** | If checked, a successful save removes the entire effect (not just prevents this turn's damage). |
| **Remove Condition** | Condition expression tested before or after the activity. If true, the effect is removed. Uses workflow data (see condition expressions). |
| **Remove Before Rolling** | If checked, the remove condition is tested *before* rolling; otherwise tested *after*. |

**Common Use Cases:**
- **Ongoing Damage**: Apply damage each turn (burning, poison, bleeding)
- **Regeneration**: Heal HP at start/end of turn
- **Repeated Saves**: Allow saves to end conditions (Hold Person, Paralysis)
- **Condition Removal**: Remove effects when conditions are met (e.g., effect ends when target takes damage)

**Example - Burning (End of Turn, Save Ends):**
1. Create a Save activity with damage and appropriate save DC
2. Enable "Is Over Time" and set "Turn Choice" to "End of Turn"
3. Check "Save Removes" so a successful save ends the burning

**Example - Regeneration (Start of Turn):**
1. Create a Heal activity with healing formula
2. Enable "Is Over Time" and set "Turn Choice" to "Start of Turn"

**Example - Remove on Damage Taken:**
1. Set Remove Condition to `@attributes.hp.value < @attributes.hp.max` or similar
2. Check "Remove Before Rolling" if you want to check before the activity runs

### Activity Macro

The pencil button opens a macro editor for the activity. This macro runs during the workflow with access to workflow data, allowing custom automation logic.

## Concentration Automation

Requires DAE. Disable CUB concentration if using midi-qol's.

| Feature | Description |
|---------|-------------|
| Confirmation | Prompts before casting second concentration spell |
| Damage Check | Taking damage triggers concentration save |
| Auto Remove | Concentration removed when spell expires |
| Effect Cleanup | Removes effects on all targets when concentration ends |
| Template Cleanup | Removes templates when concentration ends |
| Non-Spell Support | Add "Concentration" to activation conditions |

Works with: Convenient Effects > Combat Utility Belt > Internal effect (in priority order)

## Reactions

Enable in config to prompt targets for reaction items when hit.

**Reaction Triggers:**
| Trigger | When Called |
|---------|-------------|
| `preAttack` | Before attack roll |
| `isAttacked` | After attack roll, before hit check |
| `isMissed` | Attack misses |
| `isHit` | Attack hits |
| `isDamaged` | Damage dealt |
| `isHealed` | Healing received |
| `isSave` | Before save result |
| `isSaveSuccess` | Save succeeded |
| `isSaveFail` | Save failed |

**Usage:** In MidiQOL item details, add condition like `reaction === 'isHit'`

**Default:** Reaction activities with no use condition default to `reaction === "isHit"` (changed from `isAttacked` in 13.0.49). Activities with an explicit use condition are unchanged.

**Requirements:**
- Reaction type requires Auto Check Hits enabled
- Reaction Damaged requires Auto Check Hits + Saves + Apply Damage

## Roll Statistics

Track attack and damage data per actor and item:
- Attack rolls count
- Criticals/Fumbles
- Natural 20s
- Damage rolled vs applied
- Session and lifetime stats

**API:**
```js
MidiQOL.gameStats.clearStats()        // Reset all (GM)
MidiQOL.gameStats.clearActorStats(id) // Clear actor (GM)
MidiQOL.gameStats.endSession()        // End session (GM)
MidiQOL.gameStats.showStats()         // Display stats
MidiQOL.gameStats.statData            // Get raw data
```

## Magic Resistance

Targets with "Magic Resistance" feat or `magic-resistant` trait get advantage on saves vs magic.

## Special Effect Expiry

Additional expiry options (requires DAE 0.2.25+):

| Trigger | Description |
|---------|-------------|
| `1Attack` | After one attack |
| `1Action` | After one action |
| `1Hit` | After next successful hit |
| `isAttacked` | When attacked |
| `isHit` | When hit |
| `isDamaged` | When damaged |
| `isSave/isCheck/isSkill` | After rolling |
| `isSaveSuccess/Failure` | After save result |
| `isSave.str`, `isCheck.dex` | Specific ability |
| `isSkill.acr` | Specific skill |

## Item Description Keywords

| Keyword | Effect |
|---------|--------|
| "no damage on save" | Save = no damage |
| "full damage on save" | Save = full damage (for condition-only saves) |
| "half damage on save" | Save = half damage (if check spell text enabled) |
| "auto fail friendly" | Friendly tokens auto-fail saves |

---

# Flags Reference

> [!tip] Navigation
> For a more complete reference of `flags.midi-qol.*` flags, see [FLAGS.md](FLAGS.md).

## Quick Reference

Set via active effects using **CUSTOM** or **OVERRIDE** mode.

**Common Flag Categories:**
| Category | Example | Description |
|----------|---------|-------------|
| Advantage | `flags.midi-qol.advantage.attack.all` | Grant advantage on rolls |
| Disadvantage | `flags.midi-qol.disadvantage.save.all` | Grant disadvantage on rolls |
| No Advantage | `flags.midi-qol.noAdvantage.attack.all` | Suppress advantage even when other sources grant it (13.0.38+) |
| No Disadvantage | `flags.midi-qol.noDisadvantage.save.all` | Suppress disadvantage even when other sources grant it (13.0.38+) |
| Critical | `flags.midi-qol.critical.mwak` | Force critical hits |
| No Critical | `flags.midi-qol.noCritical.all` | Prevent critical hits |
| Auto-Fail | `flags.midi-qol.fail.save.dex` | Force automatic failure |
| Auto-Success | `flags.midi-qol.success.attack.all` | Force automatic success |
| Grants | `flags.midi-qol.grants.advantage.attack.all` | Effects on attackers targeting you |
| Absorption | `system.traits.da.fire` | Convert damage to healing (use dnd5e native trait) |
| Super Saver | `flags.midi-qol.superSaver.dex` | No damage on save, half on fail |
| Magic Resistance | `flags.midi-qol.magicResistance.all` | Advantage vs magic saves |
| Min/Max | `flags.midi-qol.min.save.all` | Set min/max roll values |
| Range | `flags.midi-qol.range.all` | Modify item range |
| Optional | `flags.midi-qol.optional.NAME.attack.all` | Prompted bonus effects |
| Damage Mod | `system.traits.dm.midi.all` | Reduce/increase damage (use negative values to reduce) |
| Save by School | `flags.midi-qol.advantage.save.school.nec` | Advantage/disadvantage on saves vs specific spell schools (13.0.52+) |
| Attack by School | `flags.midi-qol.advantage.attack.school.evo` | Advantage/disadvantage on spell attacks of specific schools (13.0.55+) |
| Tool Checks | `flags.midi-qol.advantage.tool.thief` | Per-tool advantage/disadvantage/fail/success/min/max (13.0.38+) |

**Special Flags:**
| Flag | Effect |
|------|--------|
| `flags.midi-qol.uncanny-dodge` | Halve incoming damage |
| `flags.midi-qol.ignoreNearbyFoes` | No disadvantage from nearby enemies |
| `flags.midi-qol.sharpShooter` | No disadvantage at long range |
| `flags.midi-qol.sculptSpells` | Evocation sculpt spell feature |
| `flags.midi-qol.carefulSpells` | Metamagic careful spell |
| `flags.midi-qol.potentCantrip` | Cantrips do half on save |
| `flags.midi-qol.concentrationSaveBonus` | Add to concentration saves |
| `flags.midi-qol.deathSaveBonus` | Add to death saves |

> [!tip] Navigation 
> See [FLAGS.md](FLAGS.md) for complete documentation of all flags.

---

# Optional Rules

Enable in the Optional Rules section of settings.

| Rule | Description |
|------|-------------|
| Incapacitated Can't Attack | 0 HP tokens cannot attack |
| Invisible Advantage | Hidden/invisible attacks with advantage |
| Attack Removes Hidden | Attacking reveals invisible/hidden |
| Check Weapon Range | Disadvantage at long range, fail beyond max |
| Include Height | Height differences in range calculation |
| Nearby Foes Disadvantage | Ranged attacks with enemy within X feet |
| Critical/Fumble Saves | Nat 20/1 on saves auto succeed/fail |
| Ranged Ally Disadvantage | Disadvantage shooting past allies |

## Active Defence

Variant rule where defenders roll instead of attackers.
- DC = 12 + attacker's bonus
- Roll = 1d20 + AC - 10
- Attacker advantage = defender disadvantage
- Critical defence = fumbled attack

## Challenge Mode Armor Class

Alternative AC system with Evasion Class (EC) and Armor Resistance (AR):
- Roll < EC: Miss
- Roll >= EC and <= AC: Glancing blow (damage reduced by AR)
- Roll > AC: Full hit

---

# Migration Notes (13.0.37+)

## Removed Flags (13.0.49)

The following deprecated flags have been removed and will no longer function:

| Removed Flag | Replacement |
|-------------|-------------|
| `flags.midi-qol.absorption.{damageType}` | `system.traits.da.{damageType}` (dnd5e native damage absorption) |
| `flags.midi-qol.advantage.ability.save.{ability}` | `flags.midi-qol.advantage.save.{ability}` |
| `flags.midi-qol.advantage.ability.check.{ability}` | `flags.midi-qol.advantage.check.{ability}` |
| `flags.midi-qol.disadvantage.ability.save.{ability}` | `flags.midi-qol.disadvantage.save.{ability}` |
| `flags.midi-qol.disadvantage.ability.check.{ability}` | `flags.midi-qol.disadvantage.check.{ability}` |

The `.ability.` prefix was redundant and inconsistent with the attack/skill/tool flag naming pattern.

## Removed Settings (13.0.39)

| Setting | Notes |
|---------|-------|
| `effectActivation` | Removed |
| `itemRollStartWorkflow` | Removed |

## Default Changes (13.0.39+)

| Setting | Old Default | New Default |
|---------|------------|-------------|
| `autoCompleteWorkflow` | false | true |
| `collapsibleTargets` | true | false |

## Settings Migration (13.0.43)

Several standalone module settings were migrated into the midi-qol config panel for easier discovery. Existing values are automatically migrated on first load:

| Setting | New Location |
|---------|-------------|
| Preferred GM | GM tab |
| Critical Damage (Player/GM) | Workflow tab, Damage section |
| Colored Borders | Misc tab |

## BooleanFormula Flags (13.0.47+)

Boolean midi-qol flags now use DAE's `BooleanFormulaField` class. Multiple active effects targeting the same flag compose with `||` (ADD/UPGRADE) and `&&` (MULTIPLY/DOWNGRADE). Requires DAE 13.0.22+.

---

# Troubleshooting & FAQ

## Common Issues

### Midi-QOL disappeared after update
Update your dnd5e system to the latest version.

### Nothing works after upgrade
Check that "Enable workflow automation" is **on** for each player (it's a per-player setting). Use SocketSettings module to force-set on all clients.

### Works for some players, not others
Same issue - check workflow automation is enabled on all clients.

### Sample compendium items don't work
- Enable DamageBonusMacro in settings
- ItemMacro names must match item names (e.g., rename "Rage MQ0.8.9" to "Rage")

### Double effects applied
If using Convenient Effects + DAE effects on same item, you'll get both. Choose one approach per item.

## Bug Reports

**Always include either:**
- Exported Troubleshooter data file (from MidiQOL settings menu)
- OR exported midi-qol settings (from Misc tab)

No world information is exported. Module list helps with debugging.

---

# For Developers

## Roll Modifier Tracker (13.0.40+)

Attack rolls and saving throws use a `RollModifierTracker` API for advantage/disadvantage/critical/fumble attribution. The tracker is available as `workflow.tracker` or `workflow.attackRollModifierTracker`.

```js
tracker.advantage.add(source, displayName)     // Add advantage source
tracker.disadvantage.add(source, displayName)   // Add disadvantage source
tracker.advantage.suppress(source, displayName) // Suppress advantage
tracker.critical.force(source, displayName)     // Force critical hit
tracker.critical.suppress(source, displayName)  // Prevent critical
tracker.modifiers.fail(source, displayName)     // Auto-fail the roll
```

Query state: `tracker.hasAdvantage`, `tracker.hasDisadvantage`, `tracker.isCritical`, `tracker.isFumble`, `tracker.advantageMode`

Use `midi-qol.preAttackConfig` hook/macro to modify the tracker before the roll is finalized. See `docs/RollModifierTracker.md` for full API documentation.

## Macro Writing

> [!tip] Navigation
> See [MACROS.md](MACROS.md) for macro documentation including:
- Item roll options
- MidiQOL API functions
- Hooks reference
- Workflow types (TrapWorkflow, DamageOnlyWorkflow, DummyWorkflow)
- OnUse macros
- Damage bonus macros
- DAE vs Midi-QOL macro comparison

## Hooks Reference

All hooks receive the workflow as their argument unless noted. Hooks can be item-specific by appending `.{item.uuid}` or `.{activity.uuid}`.

### Workflow State Hooks

These hooks fire before (`pre`) and after (`post`) each workflow state. Return `false` from a `pre` hook to abort.

| Hook Pattern | States Available |
|--------------|------------------|
| `midi-qol.preStart` / `midi-qol.postStart` | Workflow begins |
| `midi-qol.prePreambleComplete` / `midi-qol.postPreambleComplete` | Targeting complete |
| `midi-qol.preWaitForAttackRoll` / `midi-qol.postWaitForAttackRoll` | Before attack roll |
| `midi-qol.preAttackRollComplete` / `midi-qol.postAttackRollComplete` | Attack roll finished |
| `midi-qol.preWaitForDamageRoll` / `midi-qol.postWaitForDamageRoll` | Before damage roll |
| `midi-qol.preDamageRollComplete` / `midi-qol.postDamageRollComplete` | Damage roll finished |
| `midi-qol.preWaitForSaves` / `midi-qol.postWaitForSaves` | Before saves |
| `midi-qol.preSavesComplete` / `midi-qol.postSavesComplete` | Saves finished |
| `midi-qol.preAllRollsComplete` / `midi-qol.postAllRollsComplete` | All rolls done |
| `midi-qol.preApplyDynamicEffects` / `midi-qol.postApplyDynamicEffects` | Before/after effects |
| `midi-qol.preRollFinished` / `midi-qol.postRollFinished` | Roll finishing |
| `midi-qol.preCleanup` / `midi-qol.postCleanup` | Cleanup phase |
| `midi-qol.preCompleted` / `midi-qol.postCompleted` | Workflow complete |

Additional states: `AwaitTemplate`, `TemplatePlaced`, `AoETargetConfirmation`, `ValidateRoll`, `ConfirmRoll`, `RollConfirmed`, `DamageRollStarted`, `WaitForUtilityRoll`, `UtilityRollComplete`, `Abort`, `Cancel`

### Activity Hooks

| Hook | When | Return `false` to... |
|------|------|----------------------|
| `midi-qol.preTargeting` | Before targeting phase | Cancel workflow |
| `midi-qol.preTargetingV2` | Before targeting (v2 API) | Cancel workflow |
| `midi-qol.preItemRoll` | Before item roll | Cancel workflow |
| `midi-qol.preItemRollV2` | Before item roll (v2 API) | Cancel workflow |
| `midi-qol.preAttackConfig` | Before attack advantage/disadvantage is finalized | Modify tracker state (13.0.43+) |
| `midi-qol.preAttackRoll` | Before attack roll | Cancel attack |
| `midi-qol.preDamageRoll` | Before damage roll | Cancel damage |
| `midi-qol.preFormulaRoll` | Before utility formula roll | Cancel roll |

### Workflow Event Hooks

| Hook | When Called | Notes |
|------|-------------|-------|
| `midi-qol.targetingComplete` | After targets confirmed | Return `false` to abort |
| `midi-qol.preCheckHits` | Before hit checking | |
| `midi-qol.hitsChecked` | After hits determined | |
| `midi-qol.AttackRollComplete` | After attack roll complete | |
| `midi-qol.DamageRollComplete` | After damage roll complete | |
| `midi-qol.preCheckSaves` | Before save rolls | |
| `midi-qol.postCheckSaves` | After save rolls | |
| `midi-qol.postActiveEffects` | After effects applied | |
| `midi-qol.RollComplete` | Workflow fully complete | |
| `midi-qol.preTargetDamageApplication` | Before damage to target | Args: token, {item, workflow, damageItem} |
| `midi-qol.healed` | After healing applied | Args: token, {item, workflow, damageItem} |
| `midi-qol.damaged` | After damage applied | Args: token, {item, workflow, damageItem} |

### Damage Calculation Hooks

| Hook | When | Return `false` to... |
|------|------|----------------------|
| `midi-qol.dnd5ePreCalculateDamage` | Before damage calculation | Cancel damage calc |
| `midi-qol.dnd5eCalculateDamage` | After damage calculation | Cancel damage calc |

### Reaction Hooks

| Hook | When | Notes |
|------|------|-------|
| `midi-qol.ReactionFilter` | Filtering available reactions | Return `false` to skip all |
| `midi-qol.preSetReactionUsed` | Before marking reaction used | Args: actor, reactionEffect. AsyncHooksCall, effect is live (updateSource applies). (13.0.52+) |
| `midi-qol.setReactionUsed` | After marking reaction used | Args: actor, reactionEffect. (13.0.52+) |
| `midi-qol.preSetBonusActionUsed` | Before marking bonus action used | Args: actor, reactionEffect. (13.0.52+) |
| `midi-qol.setBonusReactionUsed` | After marking bonus action used | Args: actor, reactionEffect. (13.0.52+) |

### System Hooks

| Hook | When | Args |
|------|------|------|
| `midi-qol.setup` | Module setup | `MidiQOL` global |
| `midi-qol.ready` | Foundry ready | - |
| `midi-qol.midiReady` | Midi-QOL fully ready | - |
| `midi-qol.ConfigSettingsChanged` | Settings changed | - |
| `midi-qol.StatsUpdated` | Roll stats updated | - |
| `midi-qol.addUndoEntry` | Undo entry added | undo data |
| `midi-qol.removeUndoEntry` | Undo entry removed | undo data |
| `midi-qol.itemUseActivitySelect` | Activity selection dialog | {activities, item} |
| `midi-qol-targeted` | Targets selected | targets |

### Premade Hooks

All workflow state hooks also have `midi-qol.premades.{pre|post}{StateName}` variants for use by premade effect libraries.

> [!tip] Navigation
> See [MACROS.md](MACROS.md#hooks-reference) for detailed hook usage examples.

## Enhanced Traits

### DR/DI/DV
System traits support expressions evaluated with actor roll data.

### Spell Sculpting
- `flags.midi-qol.sculptSpell` - Evocation sculpt spell
- `flags.midi-qol.carefulSpell` - Metamagic careful spell

### OverTime Effects (Flag-Based)

`flags.midi-qol.OverTime` - Configure effects that trigger automatically on turn start/end during combat. This is the flag-based approach for creating overtime effects without using the activity system.

**Syntax:** Parameters are comma-separated `key=value` pairs. You can also use `#` as a separator.

```
turn=start/end, damageRoll=formula, damageType=type, saveDC=number, saveAbility=ability, label="Name"
```

#### Core Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `turn` | When to trigger: `start` or `end` | `start` |
| `label` / `name` | Display name for the effect (use quotes for spaces) | Effect name |
| `applyCondition` / `condition` | Condition that must be true for the effect to process | - |

#### Damage Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `damageRoll` | Damage roll formula (e.g., `2d6`, `1d8+@abilities.con.mod`) | - |
| `damageType` | Damage type: fire, cold, poison, necrotic, etc. | piercing |
| `damageBeforeSave` | `true/false` - Apply damage before the save roll | `false` |
| `saveDamage` | Damage on save: `nodamage`, `halfdamage`, `fulldamage` | `nodamage` |

#### Save/Check Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `saveDC` | DC for the save (supports @-field expressions like `@attributes.spelldc`) | - |
| `saveAbility` | Ability for save: str/dex/con/int/wis/cha. Use `\|` for choices (e.g., `con\|wis`) | - |
| `rollType` | Type of roll: `save`, `check`, or `skill` | `save` (if saveAbility set) |
| `saveMagic` | `true/false` - Treat as magical for magic resistance | `false` |
| `saveRemove` | `true/false` - Successful save removes the effect (deprecated: use `saveCount=1-`) | `true` |

#### Save/Fail Count Parameters

Control effect removal or permanence based on cumulative save successes or failures:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `saveCount` | `N[-+]effectSpec` - Action after N successful saves | - |
| `failCount` | `N[-+]effectSpec` - Action after N failed saves | - |

**Syntax:** `saveCount=N[-+]effectSpec` or `failCount=N[-+]effectSpec`

- **N** - Number of saves/fails required to trigger the action
- **-** (minus) - Remove the overtime effect when count is reached
- **+** (plus) - Make the overtime effect permanent (no more saves rolled)
- **effectSpec** (optional) - Effect/status to add to the actor when count is reached

**Effect Spec Options:**
- `statusId` - Apply a status effect (e.g., `petrified`, `prone`, `stunned`)
- `statusId|overlay` - Apply status as token overlay
- `effectUuid` - Apply effect by Active Effect UUID
- `function.functionName` - Call a global function
- `Macro.macroName` - Execute a world macro by name
- `ItemMacro` - Execute the macro from the item that created this effect
- `ItemMacro.itemNameOrUuid` - Execute a specific item's macro
- `ActivityMacro` - Execute the macro from the activity that created this effect
- `ActivityMacro.uuid` - Execute a specific activity's macro

**Examples:**
```
saveCount=3-           # Remove effect after 3 successful saves
failCount=2+           # Make permanent after 2 failed saves (no more saves)
failCount=3-petrified  # After 3 fails: add petrified AND remove effect
failCount=3+stunned    # After 3 fails: add stunned AND make permanent
saveCount=2-prone      # After 2 saves: add prone AND remove effect
```

**Notes:**
- When `saveCount` or `failCount` is specified, `saveRemove=true` is ignored
- The effectSpec is always **added** to the actor (it doesn't replace the overtime effect)
- Use `removeCondition` alongside permanent effects to allow later removal

#### Action Save Parameters

For effects where the player must use their action to attempt a save (like escaping a grapple):

| Parameter | Description | Default |
|-----------|-------------|---------|
| `actionSave` | `dialog` - Prompt player to use action; `roll` - Player rolls manually via chat card | - |

When `actionSave=dialog`: Player is prompted at turn start to use their action for the save.
When `actionSave=roll`: A chat card is created at turn start; player clicks to roll when using their action.

#### Display Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `chatFlavor` | Flavor text for chat messages | - |
| `rollMode` | Roll visibility: `publicroll`, `gmroll`, `blindroll`, `selfroll` | - |
| `actionType` | Item action type for display: mwak, rwak, msak, rsak, other | `other` |

#### Advanced Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `removeCondition` | Condition expression - if true, effect is removed | - |
| `itemName` | UUID or name of item to use as template for the overtime roll | - |
| `macro` | Macro to call during overtime processing (see Macro Options below) | - |
| `killAnim` | `true/false` - Suppress Sequencer animations | `false` |
| `allowIncapacitated` | `true/false` - Process even if target is incapacitated | `true` |
| `fastForwardDamage` | `true/false` - Skip damage dialog | - |
| `fastForwardAttack` | `true/false` - Skip attack dialog | - |

**Macro Options:**

The `macro` parameter supports the following formats:
- `function.functionName` - Call a global function (e.g., `function.MidiQOL.doOverTimeDamage`)
- `ItemMacro` - Execute the macro from the item that created this effect
- `ItemMacro.itemNameOrUuid` - Execute a specific item's macro by name or UUID
- `ActivityMacro` - Execute the macro from the activity that created this effect
- `ActivityMacro.uuid` - Execute a specific activity's macro by UUID
- `Macro.macroName` - Execute a world macro by name

#### Examples

**Simple Burning (damage each turn, save ends):**
```
turn=end, damageRoll=1d6, damageType=fire, saveDC=12, saveAbility=dex, saveCount=1-, label="Burning"
```

**Poison (damage + save, half damage on save):**
```
turn=start, damageRoll=2d6, damageType=poison, saveDC=14, saveAbility=con, saveDamage=halfdamage, saveCount=1-, label="Poisoned"
```

**Regeneration (healing, no save, only when damaged):**
```
turn=start, damageRoll=2d6, damageType=healing, applyCondition=@attributes.hp.value < @attributes.hp.max, label="Regeneration"
```

**Hold Person (action to save, end of turn save):**
```
turn=end, saveDC=@attributes.spelldc, saveAbility=wis, saveCount=1-, actionSave=roll, label="Hold Person"
```

**Damage with Condition (only if below max HP):**
```
turn=start, damageRoll=1d6, damageType=necrotic, applyCondition=@attributes.hp.value < @attributes.hp.max, label="Lingering Wound"
```

**Grapple Escape (action save, STR or DEX choice):**
```
turn=start, saveDC=14, saveAbility=str|dex, rollType=check, actionSave=dialog, saveCount=1-, label="Grappled"
```

**Flesh to Stone (fail 2 saves = petrified):**
```
turn=end, saveDC=@attributes.spelldc, saveAbility=con, saveCount=2-, failCount=3-petrified, label="Flesh to Stone"
```
*After 2 failed saves, target becomes petrified and the effect ends. After 3 successful saves, the effect simply ends.*

**Contagion (fail 3 saves = permanent disease):**
```
turn=end, saveDC=@attributes.spelldc, saveAbility=con, saveCount=3-, failCount=3+, damageRoll=2d6, damageType=poison, label="Contagion"
```
*After 3 failed saves, the disease becomes permanent (no more saves). After 3 successful saves, the effect ends.*

**Progressive Curse (permanent with removeCondition escape):**
```
turn=end, saveDC=15, saveAbility=wis, failCount=2+, removeCondition=@attributes.hp.value < 2, label="Creeping Curse"
```
*After 2 failed saves, becomes permanent. Can only be removed if HP drops below 2 (or by other means like Remove Curse).*

#### Notes

- All @-field expressions are evaluated against the affected actor's roll data
- Multiple OverTime flags can exist on the same effect (use different keys like `flags.midi-qol.OverTime.burn` and `flags.midi-qol.OverTime.poison`)
- The `itemName` parameter can reference items by UUID or by name (searches actor items first, then world items)
- For activity-based overtime effects (recommended for v13+), see the Over Time Effects section in Activity configuration

> [!tip] Navigation
> See [docs/workflowfields.md](docs/workflowfields.md) for available workflow data in conditions.

---

# Changelog & Credits

## Changelog
https://gitlab.com/tposney/midi-qol/-/blob/v13/Changelog.md

## Credits

Reaction and BonusAction images by DFreds, sourced from https://game-icons.net/ (CC-BY licence).

**Sound files (CC-BY 3.0):**
- `fail1.ogg` - [Freesound #178687](https://freesound.org/s/178687/) by Soundb
- `success-drums.ogg` - [Freesound #270467](https://freesound.org/people/LittleRobotSoundFactory/sounds/270467/) by LittleRobotSoundFactory
- `drink.wav` - [Freesound #433645](https://freesound.org/people/dersuperanton/sounds/433645/) by dersuperanton
- `use.wav` - [Freesound #180831](https://freesound.org/people/32cheeseman32/sounds/180831/) by 32cheeseman32
