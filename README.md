# Midi-QOL

![](https://img.shields.io/badge/Foundry-v14.368+-informational)
![](https://img.shields.io/badge/Dnd5e-v5.3.x-informational)
![](https://img.shields.io/badge/DAE-v14.0.19+-informational)
![Latest release](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Ftposney.gitlab.io%2Fmidi-qol%2Fv14%2Fmodule.json&query=%24.version&label=Latest%20release&prefix=v&color=blue)
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
- [Workflow Fields](/docs/workflowfields-2026-02-01.md)

---

# Quick Start

New to midi-qol? The [Getting Started](/Getting%20Started.md) guide walks through what midi does, which modules to install, and every settings tab, with screenshots of the recommended setup.

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
   - Open Midi-QOL settings and go to the **Quick Settings** tab
   - Click a preset button to apply a combination of settings at once

## Quick Settings Presets

The **Quick Settings** tab in settings provides one-click presets:

| Preset | Description |
|--------|-------------|
| **Full Automation: As few button presses as possible** | Minimal button presses - everything automated |
| **No Automation: All rolls manual** | All rolls manual - traditional play |
| **GM Attack/Damage: Automatic** | GM auto rolls attack and damage (Damage Roll Needed), fast forwards both, removes attack and damage buttons, applies effects |
| **GM Attack/Damage: Manual** | GM rolls manual |
| **Show Item Info in chat card** | Item details on cards for all item types |
| **Player Attack/Damage Roll: Automatic** | Player auto rolls attack and damage (Damage Roll Needed), fast forwards both, removes attack and damage buttons |
| **Player Attack/Damage Roll: Manual** | Player rolls manual |
| **Automatic Hits/Saves/damage application** | Checks hits and saves, players prompted by chat message (30 second timeout), NPC saves auto rolled, auto targets templates, applies effects, Yes + damage card |
| **No Hits/Saves/damage application automation** | No hit/save checks, effects or damage applied; saves prompted by chat message |
| **Turn on Reaction processing** | Player and GM reactions on, 30 second timeout, enforce reactions, record attacks of opportunity; turns on hit/save checks, save prompts and the damage card if off |
| **Turn off Reaction processing** | Reactions off |
| **Enable Concentration Automation** | Enables dnd5e concentration tracking, remove concentration on a failed save, single concentration check |
| **Allow GM to fudge damage application (display but no auto apply)** | Auto apply damage: No + damage card |
| **Disable Concentration Automation** | Disables dnd5e concentration tracking |
| **Secret Squirrel: Hide most GM roll info from players** | GM attack/damage rolls Hidden with No Dice, NPC names hidden, hit/save results GM only (when auto checked), dnd5e Challenge Visibility Hide all |
| **Full Disclosure: Players see the details of all GM rolls and the results** | GM attack/damage rolls Full Roll with Show Dice, NPC names shown, hit/save results shown to all (when auto checked), dnd5e Challenge Visibility Show all |

Each preset lists the changes and asks before applying them.

## Manual Configuration

If you prefer to configure settings manually, here's the recommended full automation setup, the same as the *Full Automation* quick setting ([Getting Started](/Getting%20Started.md) describes every setting):

| Setting | Tab | Value |
|---------|-----|-------|
| Auto target on template draw | Workflow | Walls Block - Ignore Dead |
| Auto roll attack | GM | Checked |
| Auto roll damage | GM | Damage Roll Needed |
| Auto fast forward rolls | GM | Attack Rolls, Damage Rolls, Ability Checks, Saving Throws, Skill Rolls, Tool Rolls |
| Auto roll attack | Player | Checked |
| Auto roll damage | Player | Damage Roll Needed |
| Auto fast forward rolls | Player | Attack Rolls, Damage Rolls, Ability Checks, Saving Throws, Skill Rolls, Tool Rolls |
| Auto check if attack hits target | Workflow | Check - all see result |
| Auto check Saves | Workflow | Save - All see result + save total |
| Prompt Players to Roll Saves | Workflow | Auto roll and show roll dialog (private roll) |
| Timeout before rolling for players | Workflow | 30 seconds |
| Auto apply damage to target | Workflow | Yes + damage card |
| Apply Damage immunities | Workflow | apply immunities + physical |
| Auto apply item effects | Workflow | Apply Effects and remove button |

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
| v13.0.52+ | v13 | v5.2.4+ / v5.3 | [manifest](https://tposney.gitlab.io/midi-qol/v13/module.json) |
| v14.0.x | v14 (14.368+) | v5.3 | [manifest](https://tposney.gitlab.io/midi-qol/v14/module.json) |
| v14.6.x | v14 (14.369+) | v6.0.x | [manifest](https://tposney.gitlab.io/midi-qol/dnd6/module.json) |

## Required Modules

| Module | Notes |
|--------|-------|
| **DAE** | Dynamic Active Effects - required (14.0.19+) |
| **libwrapper** | Required |
| **socketlib** | Required |

## Recommended Modules

### Effect Timing & Expiry

| Module | Description |
|--------|-------------|
| **Calendar Module** | Any module that advances game time (Simple Calendar, SmallTime, etc.) - recommended if you want effects to expire based on world time. |

> **Note (v14):** Times-up is not supported on Foundry 14: disable or uninstall it. Duration management (effect expiry, seconds/rounds conversion, combat start/end handling) has moved from Times-up into DAE, which handles it automatically.

### Auras & Proximity Effects

| Module | Description |
|--------|-------------|
| [**Aura Effects**](https://foundryvtt.com/packages/auraeffects) | **Recommended.** Converts Active Effects into auras with automatic range-based application. Features disposition filtering (friendly/hostile), stacking control ("best aura wins" logic), visual aura boundaries, and formula evaluation at the source for stat-based bonuses. |
| [**Active Auras**](https://foundryvtt.com/packages/ActiveAuras) | *Foundry 13 only* (not available for Foundry 14). Items that used it should be converted to Aura Effects. |

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
| [**Covens Automation Toolkit (CAT)**](https://github.com/chrisk123999/covens-automation-toolkit) | Shared automation framework used by CPR 2 and other automation packs. Its medkit matches items to automations by identifier and updates them; midi registers its own sample items with CAT. See the [CAT wiki](https://github.com/chrisk123999/covens-automation-toolkit/wiki). |
| [**Cauldron of Plentiful Resources**](https://foundryvtt.com/packages/chris-premades) | Comprehensive collection of automated spells, class features, and monster abilities. Includes custom roll resolver for in-person games, fancy Eskiemoh animations, and quality-of-life UI extensions. Extends Midi-QOL's workflow API. Has its own [wiki](https://github.com/chrisk123999/chris-premades/wiki). |
| [**Midi Item Showcase Community**](https://foundryvtt.com/packages/midi-item-showcase-community) | Community-contributed automations from the Posney's Foundry Automation Discord. Growing collection of user-submitted items, spells, and scripts. |
| [**Gambit's Premades**](https://foundryvtt.com/packages/gambits-premades) | Curated library of automated spells, items, and feats. Handles difficult "3rd party reaction" items like Counterspell, Opportunity Attacks, and Silvery Barbs. Features custom AppV2 dialogs with animated countdown timers for reactions. |

## Good to Have

| Module | Purpose |
|--------|---------|
| Active Token Effects | Effects that change a token's light, vision and so on |
| DFreds Convenient Effects | Custom effects |
| Dice So Nice | 3D dice rolling |
| Levels - Volumetric Templates | 3D template targeting (midi leaves template targeting to it when installed) |
| Monks Token Bar | Save management |
| Alternative Token Cover / Simbul's Cover Calculator / Simple Cover 5e | Cover calculation |
| Hide NPC Names | Hides creature names from players; midi's chat cards and damage tray use the name it gives them |

## Known Incompatibilities

| Module | Issue |
|--------|-------|
| Ready Set Roll | Not compatible |
| Cautious GM | Breaks blind chats by hidden GM |
| Chat Portraits | Overwrites midi-qol token name changes |

## Compatible Modules

| Module | Notes |
|--------|-------|
| Dice So Nice | Works with merge card (complex interactions) |
| Monks Token Bar | Use for save rolls; adv/dis now supported |
| Convenient Effects | Matches effects by name; toggle per-item |
| DDB Game Log | Triggers workflow from D&D Beyond rolls |
| Epic Rolls 5e | Players and the GM can roll saves and checks through Epic Rolls: choose *Rippers Epic Rolls* in *Prompt Players to Roll Saves* or *Prompt GM to Roll Saves (Unlinked)* / *(Linked)* |
| Hide NPC Names | midi's chat cards and damage tray show the name it gives a creature. Without it, midi's *Hide NPC names* setting names creatures with no player owner |
| Custom D&D 5e | Mostly compatible. Some of its options clash with midi (its Conditions config, average/mob damage, custom dice); midi reports the clashing settings on a GM card and in the TroubleShooter (Auto Fix) |

---

# Configuration Reference

## GM Tab

| Setting | Description |
|---------|-------------|
| Auto fast forward rolls | Multi-select: which roll types to fast-forward (Attack Rolls/Damage Rolls/Ability Checks/Saving Throws/Skill Rolls/Tool Rolls). Skills are separate from ability checks for finer control. (Restructured in 13.0.43 from a single toggle to per-roll-type multi-select) |
| Auto roll attack | When item is rolled, automatically roll the attack |
| Skip consume resource dialog | No Auto consume, Auto consume spell slot, Auto consume resources/uses, Auto consume resources/spell slots |
| Confirm Ammunition choice when rolling attack - shows attack roll configuration | Prompt before consuming ammunition |
| Require ammunition available to roll attack | Require ammunition for ranged attacks |
| Auto roll damage | Never/Always/Saving Throw Only/Damage Roll Needed |
| All damage/critical rolls are 'average' results | None/NPC only damage rolls/Character ony damage rolls/All damage rolls |
| Remove chat card buttons after roll | Off/Attack Only/Damage Only/Attack and Damage/All Buttons |
| GM Attack Roll Display | GM Roll Hiding: what players see for GM attack rolls (Full Roll, Hide Formula, D20 Only, Attack Total Only, Hit/Miss Only, Hit/Miss/Critical/Fumble, Hidden), plus a Dice So Nice select (Show Dice/Ghost Dice/No Dice) |
| GM Damage Roll Display | GM Roll Hiding: what players see for GM damage rolls (Full Roll/Damage Total Only/Hidden), plus a Dice So Nice select (Show Dice/Ghost Dice/No Dice) |
| Always display attack/damage cards for hidden merge cards | (Experimental) When the GM rolls with a private, self or blind roll mode, also post the attack/damage roll card so players see that dice were rolled, but not the result |
| Add fake dice to GM Dice So Nice rolls | Adds random extra dice to the DSN animation so players can't count dice to deduce modifiers |
| Preferred GM | Preferred GM for socket calls. If 'none' the first GM on the current scene will be used. (Migrated from module settings into the config panel in 13.0.43) |

"GM Sees all whispered messages" is a module setting (Configure Settings → midi-qol), not on this tab.

## Player Tab

| Setting | Description |
|---------|-------------|
| Auto fast forward rolls | Multi-select: which roll types to fast-forward (Attack Rolls/Damage Rolls/Ability Checks/Saving Throws/Skill Rolls/Tool Rolls). Also applies to chat card buttons. Skills are separate from ability checks for finer control. (Restructured in 13.0.43 from a single toggle to per-roll-type multi-select) |
| Auto roll attack | When item is rolled, automatically roll the attack |
| Skip consume resource dialog | No Auto consume, Auto consume spell slot, Auto consume resources/uses, Auto consume resources/spell slots |
| Confirm Ammunition choice when rolling attack - shows attack roll configuration | Prompt before consuming ammunition |
| Require ammunition available to roll attack | Require ammunition for ranged attacks |
| Auto roll damage | Never/Always/Saving Throw Only/Damage Roll Needed |
| Remove chat card buttons after roll | Off/Attack Only/Damage Only/Attack and Damage/All Buttons |

## Workflow Tab

### Targeting

| Setting | Description |
|---------|-------------|
| Auto target on template draw | When placing a template auto-target tokens inside (None, Always, Always - Ignore Incapacitated/Dead, Always - Ignore Dead, Walls Block, Walls Block - Ignore Incapacitated/Dead, Walls Block - Ignore Dead, Use Walled Templates). Now uses a Hook for better compatibility with other modules (13.0.47). Supports multiple templates per item (13.0.43). |
| Auto target for radius/emanation spells/attacks | Auto-target for radius/emanation spells if target type is creature/enemy/ally (same options, without Use Walled Templates) |
| Require targets to be selected | Require tokens to be targeted before rolls (Never/In combat/Tokens in scene/Always) |
| Weapons attack single target | Weapons with no target specification can only attack one target |

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

### Specials

| Setting | Description |
|---------|-------------|
| Other Activity Default | What *Default* means in an activity's Other Activity field: Auto - roll a single matching activity (default; an attack with exactly one compatible activity rolls it) or None - roll nothing |
| Auto remove placed template on spell expiry | Auto remove placed template on spell expiry |
| Auto remove instantaneous templates | Remove instantaneous spell templates at the end of the item roll |
| Auto remove summoned creatures on item expiry/concentration removal (for dnd5e summons items) | Auto remove summoned creatures on item expiry/concentration removal |
| Auto apply item effects | Apply item active effects to targets if hit, failed save, or no save required (Don't auto apply effects/Apply effects do not show button/Apply Effects and remove button/Apply effects but leave button) |
| Auto undo transformations on effect/concentration expiry/removal | Auto revert target to original form on effect/concentration expiry |
| Apply Convenient Effects | Shown when Convenient Effects is installed. Apply Convenient Effects matching activity/item name (Only activity effects; Apply activity effects, if absent apply CE; Apply CE, if absent apply activity effects; Apply CE and activity effects). Requires Auto apply item effects |

### Hits

| Setting | Description |
|---------|-------------|
| DND5E Attack Result Visibility | dnd5e setting: Show results & target ACs/Show only results/Hide all |
| Color code Hit/Miss/Save Display | Hits/saves in green, misses/failed saves in red |
| Only highlight critical/fumble hits | Only highlight critical/fumble attack rolls, not normal hits/misses |
| Auto check if attack hits target | None/Check - all see result/Check - only GM sees results/Check - only GM sees anything. Damage rolls if one+ targets hit and auto roll damage enabled; if None, midi assumes the attack hits |
| Roll a separate attack per target | Roll a separate attack per target |
| Walls block ranged attacks | No/Center Check/Levels Auto Cover/Simbul's Cover Calculator/Alternative Token Cover/Simple Cover 5e. Only walls that block movement (total cover) block the attack: darkness and sight-only walls (curtains) don't, a window does. With a cover module, its total cover blocks the attack |
| Calculate Cover | None/dnd5e cover status only/Simbul's Cover Calculator/Simple Cover 5e/Levels Auto Cover/Alternative Token Cover. AC bonus for targets in cover. Unless None, a target with total cover (dnd5e's Total Cover status, or the module's) can't be targeted by an activity that targets creatures directly (not an area template or emanation); *dnd5e cover status only* uses the status alone. An activity's *Ignore total cover* skips this |
| Vision test point height | Elevation tested for token visibility, for Foundry's rendering and midi's vision checks: Center (default) or Top |
| Template Origin Height | Caster height activity templates are measured from: Caster's base (default)/Caster's top/Caster's eye level. An activity can override this in its Region settings |
| Occlude upper floor surfaces | Multi-level scenes: upper floor surfaces are transparent when viewed from a lower floor, even if the token is not directly underneath (default on) |
| Mark lower floors where creatures can't be seen | Per-player settings (Configure Settings › midi-qol), off by default. Scenes with levels: core draws a lower floor wherever an opening shows it but hides creatures standing there when a floor edge or wall blocks the line from your tokens' eyes; the squares where a medium creature would be hidden are marked, using core's own sight test. Style (tint, dim, hatch, outline, hatch and outline), colour and opacity are set per player |

### Saves

| Setting | Description |
|---------|-------------|
| DND5E Challenge Visibility | dnd5e setting: which roll DCs players see and whether successes/failures are highlighted (Show all/Show only from other players/Hide all) |
| Auto check Saves | Off/Save - All see result only/Save - All see result + save total/Save - All see Result + Rolls/Save - only GM sees results + rolls/Save - only GM sees anything. If Off, midi assumes all targets failed. Supports multiple saves per activity (e.g., dex or con) — auto-selects the best modifier or prompts the player via dropdown. (Multiple saves added in 13.0.43) |
| Default saving throw multiplier | Damage multiplier on save (default 0.5) |
| Prompt Players to Roll Saves | How player saves are rolled (see below) |
| Prompt GM to Roll Saves (Unlinked) | How unlinked NPC saves are rolled (Chat Message/Auto/Auto roll and show roll dialog/Monks Token Bar/Flash Token Bar/Rippers Epic Rolls) |
| Prompt GM to Roll Saves (Linked) | How linked NPC saves are rolled (same options) |
| Timeout before rolling for players | Seconds before midi rolls the player's save for them |

**Prompt Players to Roll Saves Options:**
- **None (private roll)** / **None (public roll)** - midi rolls the save, shown privately (GM only) or publicly
- **Auto roll and show roll dialog** (public/private/self/blind roll) - midi rolls the save after showing the roll configuration dialog
- **Chat Message** - Players prompted via chat message button
- **Monks Token Bar** - Use Monks Token Bar (requires module)
- **Flash Token Bar** - Use the Flash Rolls 5e pop-up (requires module)
- **Rippers Epic Rolls** - Use Epic Rolls 5e (requires module)

### Damage

| Setting | Description |
|---------|-------------|
| Choose critical damage for Players | How critical hits calculate damage for player characters (DND5e Settings Only/Max Normal Damage/Max Critical Dice/Max All Dice/Double Rolled Damage/Explode all critical dice/etc.). (Migrated from module settings into the config panel in 13.0.43) |
| Choose critical damage for GM | How critical hits calculate damage for GM-controlled actors. (Migrated from module settings into the config panel in 13.0.43) |
| Auto apply damage to target | No/No + damage card/No + damage card + misses/Yes/Yes + damage card/Yes + damage card + misses/Yes(NPC) No(PC) + damage card |
| Add damage buttons to chat message | Enable the dnd5e damage tray on chat messages (None/Only add buttons for GM/Only add buttons for Players/Add buttons for everyone) |
| Show a player's damage card | Simpler damage card for players, shown only if the GM card is shown, not shown to the GM (Don't show/Show player results/Show player results + buttons/Show player and npc results/Show player and npc + buttons) |
| Display the player damage card if the rolled damage does not match the applied damage for some target | Show player damage card if rolled damage differs from applied damage |
| Apply Damage immunities | Apply target's damage immunity/vulnerability/resistance (Never/apply immunities/apply immunities + physical) |
| Immunity reduces damage to | Default 0 |
| Resistance reduces damage to | Default 0.5 |
| Vulnerability multiplies damage by | Default 2 |
| Single Damage Calculation | Calculate base, other and bonus damage in one pass; damage modification (dm) and midi damage reduction are shared across all of an activity's damage instead of applied per category (default on) |
| Damage Reduction Save Order | Order of save multiplier vs damage reduction calculation |
| Require 'Magical' property | Off: Non-weapons do magical damage/Non spells do non-magical damage/All Items do non-magical damage |

## Concentration Tab

With dnd5e concentration tracking disabled the tab shows only a notice; midi's concentration automation needs it.

| Setting | Description |
|---------|-------------|
| Force a concentration save when damage taken | Never/Chat Message Only (dnd5e default behaviour)/Chat Message + Auto Roll/Roll Concentration Item |
| Remove concentration on failed concentration save | Remove concentration on failed concentration save |
| Remove concentration when incapacitated status applied | Incapacitated, Dead, Unconscious, Petrified, Paralysed and Stunned remove concentration |
| Single Concentration Check | Single check for combined damage from attack + save + other/versatile |
| Temporary HP Concentration Check | Loss of temporary HP triggers concentration check (RAW: enabled) |
| Remove concentration when effects removed | Never/Check Effects/Check Effects and Templates: if all the spell's effects (and templates) are gone, remove concentration |

**Force a concentration save when damage taken Options:**
- **Never** - No concentration checks
- **Chat Message Only (dnd5e default behaviour)** - Display chat message with button
- **Chat Message + Auto Roll** - Display chat message and auto-roll the save
- **Roll Concentration Item** - Roll concentration as an item with Constitution save targeting the damaged actor at the correct DC

## Reactions Tab

| Setting | Description |
|---------|-------------|
| Check PLAYER reactions | Give attacked actor option to use reaction before adjudicating roll (On/On + Magic Items/off) |
| Check NPC/GM reactions | Check NPC/GM reactions (On/On + Magic Items/off) |
| Reaction check timeout | How long to wait before assuming no reaction taken (seconds) |
| Show Chat prompt for reactions | Show chat prompt for reactions |
| Show attack roll | What attack info to show (Attack Hits/d20 roll/Attack Roll Total/Attack Roll Total + Critical) |
| Allow any reaction spell to be used | Allow any reaction spell without checking slots/preparation |
| Enforce Reactions | Prompt when using reaction if already used this round (Do not check/Display status icon/Characters: prompt if used/All actors: prompt if used) |
| Enforce Bonus Actions | Prompt when using bonus action if already used this round (same options) |
| Record Attacks of Opportunity | Mark reaction used when attacking outside your turn (Do not check/Characters only/All actors) |

## Misc Tab

| Setting | Description |
|---------|-------------|
| Roll saves before damage (Experimental) | Calculate saves before damage rolls |
| Export/Import midi-qol settings to/from json file | Buttons to save or load all midi-qol settings |
| Activity Prefix | Prefix midi-qol activity names with Midi. Requires reload |
| Condition Editor | Show condition editor button on condition fields in activity sheets (default on) |
| Lowest User role for Item's properties | Lowest user role that can access an item's midi-qol properties tab. Requires reload |
| Add actor on use macro to sheet | Add actor on use macro field to sheet |
| Add item on use macro to sheet | Add item on use macro field to sheet |
| Show Item details in chat card | None/Card Only/Details: PC Only/Details: NPC + PC; Show Details chooses the item types |
| Display Item Properties | Display item properties in chat card |
| Condense Attack/Damage Rolls | Conserve chat log space with smaller attack/damage rolls |
| Add Item/Activity Buttons | Add Info/Attack/Damage buttons to items and activities on character sheets. (Added in 13.0.40) |
| Add extra buttons to merge card | Add advantage/disadvantage and critical/no critical buttons to the item card |
| Collapsible Targets | Make target list collapsible in chat (default: false since 13.0.39) |
| Display Confirm Roll Button | Pause after rolling attack/damage for confirmation (No confirmation/Only GM can confirm/GM and Player can confirm) |
| Autocomplete workflow if required | Workflows rolled before completion are marked complete; no extra rolls are performed (default: true since 13.0.39) |
| Colored Border Messages | Chat messages have colored borders/text in the player character's color (None/Borders Only/Border + Name Text/Border + Name Background). (Migrated from module settings into the config panel in 13.0.43) |
| Move roll formula to tooltip | default tooltip/Formula -> tooltip/Advantage Attribution/Formula -> tooltip + adv attribution |
| Show Fast Forward | Show fast-forward indicator on attack/damage buttons |
| Chat cards use token name | Chat card titles and target names use token name not actor name |
| Hide NPC names | Name players see for creatures with no player owner, on chat cards and the damage tray. Blank shows the real name. Hide NPC Names, when active, decides instead |
| Use Actor portrait in chat cards | Use actor portrait instead of token image for characters |
| Enable midi-qol custom sounds | Override system sounds; configure them with "Configure Midi Custom Sounds" (see [Custom Sounds](#custom-sounds)) |

Roll statistics (Keep Roll Statistics, Save statistics Every, Player statistics only) are set in the **Show Roll Statistics** app (Configure Settings → midi-qol). (Revived and enhanced in 13.0.43)

## Mechanics Tab

| Setting | Description |
|---------|-------------|
| Add effect when hp falls below % | Add the selected status (as icon or overlay) when HP falls to or below this % of max (0 disables) |
| Add effect when HP = 0 | Status for Player Controlled and GM Controlled actors at 0 HP (Do Not Update/Add effect as overlay/Add effect as icon) |
| Mark defeated in combat tracker | Separate checkboxes for player and GM controlled tokens |
| Which ability checks are rolled blind | Which ability checks are rolled blind |
| Which ability saves are rolled blind | Which saves (including death saves) are rolled blind |
| Which skill checks are rolled blind | Which skill checks are rolled blind |
| Blind roll display | How rolls forced blind by the settings above appear to players: Hidden (players see nothing) (default) or Obscured (card shown, result ??) |
| Expire 1Hit/1Attack/1Action on roll | Expire 1Hit/1Attack/1Action on roll, don't wait for damage |
| Wait for damage application | Wait for damage application before continuing workflow |
| When an Incapacitated actor takes an action, MidiQOL should | Do nothing/Enforce no actions/Post a warning only |
| Check weapon range when attacking | Do not check range/target range > long range: fail (default)/target range > long range: disadvantage |
| Targets you can see | For activities with *Targets you can see* set on their Targeting tab: Do not check/Unseen targets can't be targeted (default)/Post a warning only. Visibility follows *Force vision when checking* |
| Require no shield equipped for two-handed/off-hand attacks | Enforce two-handed weapon rules |
| Distance measurement method | How distances are measured between tokens: Default (Foundry Core) (center-to-center), Grid Square Centers (default; center of all covered grid squares), or Token Perimeters (shortest distance between token boundary polygons). (Added in 13.0.45) |
| Gridless Grid | Use the square grid for all distance calculations in gridless scenes |
| Fudge factor | Subtracted from measured distances when checking range, on every grid type. Edge-to-edge token distances never drop below one grid unit. In grid units (ft/m) |
| Include height difference in distance calculations | Include height difference in distance calculations |
| Constrain Template Placement | Anchor cone/ray templates with range Self/None to the caster's token border, and keep all templates within the activity's range during preview. (Renamed from "Anchor Ray/Cone Templates" in 13.0.45) |
| Template Grid Snapping | Full Grid (default) snaps to grid vertices only; Half Grid to centres, vertices, corners and side midpoints. (Added in 13.0.47) |
| Ability Check Advantage gives Skill Advantage | Ability check advantage/disadvantage applies to skills using that ability |
| Show before and after optional bonus chat card | Show bonus rolls in chat |
| Auto reroll initiative | Reroll initiative for all combatants at start of new round. Can break round/turn effect expiry |
| Support undoing item rolls | Store undo data for all item/activity rolls. Undo via `MidiQOL.undoMostRecentWorkflow()` |
| Undo Chat Cards Color | Delete removes the chat card on undo; otherwise undone cards are recoloured |
| Activation Cost Automation | Short/long rest, encounter start and turn start/end activation costs (No Automation/No Chat, Default dnd5e behavior, Auto trigger self targeted activities) |

## Rules Tab

| Setting | Description |
|---------|-------------|
| Optional Game Rules | Master toggle for optional rules; the rows from Check Flanking to Enable Challenge Mode Armor Class are shown only when it is on |
| Check Flanking | Check if you and allies flank opponent. Options: none, Advantage Only, Midi Flanking effect, Midi Flanked effect, Midi Flanked + no conga line, or Convenient Effects variants (if installed). Supports hex grids |
| Flanking Bonus Type | What benefit flanking gives: Advantage (default) or +1 to +5 to hit (reduces target's effective AC) |
| Flanking requires target can sense flanker | An ally only counts as a flanker if the target can sense them |
| Show Flanking Positions | Highlight grid cells where an ally would create flanking against your current target |
| Unseen/Invisible attackers have advantage/disadvantage on attacks | Do not apply/RAW (2014)/RAW (2024)/Use Token Vision. The 2024 mode checks visibility rather than the invisible condition. (2024 mode added in 13.0.43) |
| Hidden attackers have adv/disadv on attacks | Do not apply/Check 'Hidden' Status/Perceptive |
| Force vision when checking | Behave as if all tokens have vision enabled when checking; unchecked, tokens without vision see everything |
| Attacking removes hidden (use CE/CV/CUB/core foundry specialStatus ) | Attacking removes hidden status |
| Ranged attacks when a foe is closer than this have disadvantage. 0 disables | Distance in grid units (default 5) |
| (House rule) Enabling this means that only the most effective Damage Reduction will apply. Off means DR accumulates | Max DR value |
| (House Rule) Critical/Fumble always succeed/fail for saving throws | Natural 20/1 always succeed/fail on saves |
| (House Rule) Critical Roll Margin | Attack rolls this much above AC are critical (-1 disables) |
| (House Rule) Allow normal critical rolls | A roll above the critical threshold still crits even if the margin is not met |
| (House Rule) Ranged Attacks at foes near allies have disadvantage | Applies to targets with an ally within 5 ft, smaller than this size (w*h); 0 disables |
| Active Defence | Players roll defence instead of GM rolling attack |
| Active Defence Modifier | Modifier for DC and roll calculation (suggest 12, 10, or 0) |
| Show Active Defence DC | Show active defence DC in chat card |
| Default display for active defence rolls | Roll visibility mode for active defence |
| Enable Challenge Mode Armor Class | Alternative armor class rules (No Challenge Mode Armor/Challenge Mode Armor (Base)/Challenge Mode Armor (Scaled)/Challenge Mode Armor (Scaled No AR)) |
| (House Rule) Vitality Item | Name of a feature item on the actor to track vitality (overflow damage at 0 HP reduces vitality). Item uses.max = max vitality, uses.spent = vitality lost. Shown always, only applies with Optional Game Rules on |
| Vitality Exhausted Condition | Condition to apply when vitality reaches 0 (default: Dead) |
| Vitality Death Requires | When actor is dead: "Vitality of 0" or "Vitality of 0 AND HP of 0" |
| Enable ddb-game-log support | Accept rolls from ddb-game-log to trigger midi workflows |

## Custom Sounds

Midi-QOL provides a flexible system for playing sounds during workflow events. Enable with "Enable midi-qol custom sounds" on the Misc settings tab. Many of the supporting modules that provide visual effects also apply sound effects, so if using those you will not want midi custom sounds.

### Getting Started

1. Enable "Enable midi-qol custom sounds" in Midi-QOL Misc settings
2. Open the Sound Configuration panel with "Configure Midi Custom Sounds" (Configure Settings → midi-qol)
3. Go to the "Quick Settings" tab and click "Create Sample Playlist" to create the "Midi Item Tracks" playlist
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

**Action Type Triggers** (played during the attack roll, so only for activities with an attack; the activity's action type):

| Trigger | Action Type |
|---------|-------------|
| `mwak` | Melee Weapon Attack |
| `rwak` | Ranged Weapon Attack |
| `msak` | Melee Spell Attack |
| `rsak` | Ranged Spell Attack |

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
| **Use Condition** | A roll expression that must evaluate to true for the activity to proceed. If false, the roll is blocked. Useful for conditional abilities (e.g., `raceOrType === "undead"`). |
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
| **Remove Chat Buttons** | Which buttons to remove from the chat card: Off/Attack Only/Damage Only/Attack and Damage/All Buttons. Useful for streamlining automated activities. |
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
| **AoE Target Type** | Which tokens the template targets, relative to the caster: Any/Ally/Not Ally/Enemy/Not Enemy/Neutral/Not Neutral/Hostile/Not Hostile/Friendly/Not Friendly. |
| **Target on Template Draw** | When to auto-target tokens in the template: Default/None/Always/Walls Block (each with Ignore Incapacitated/Ignore Dead variants)/Walled Templates. |

### Region Behaviour (AoE)

An activity with a template can attach a **Midi Region Activity** behaviour to the region it places (activity sheet, *Region Behaviour* section). The region then runs activities or effects as creatures interact with it, as Spirit Guardians, Moonbeam and Cloudkill do in the sample items.

| Field | Description |
|-------|-------------|
| **Enable Region Behaviour** | Attach the behaviour to the placed region. |
| **Region Rules** | Each rule pairs a trigger (*Token Enters*, *Token Exits*, *Turn Start*, *Turn End*) with an action (*Use Activity*, *Apply Effect*, *Remove Effect*) and the activity or effect it uses. |
| **Once Per Turn** | Each activity triggers at most once per turn for each creature, whether by entering or at turn start/end. |
| **Entry On Activation** | Creatures already inside count as entering when the region is created or the behaviour enabled. Turn it off when the casting activity already affects them (e.g. a save on cast). |
| **Move Each Turn** / **Move Direction** / **Move On** | In combat, the region moves this far at the start or end of the caster's turn: away from the caster, or in a direction the caster's owner picks. Creatures it passes over or lands on enter it. 0 never moves. |
| **Disposition Filter** / **Exclude Source Token** | Which creatures the rules affect, relative to the caster. |
| **Attach Region To** | Keep the region on a token (the caster or a target) as it moves. |
| **Template Origin Height** | The caster height the template is measured from; *Default* follows the *Template Origin Height* optional rule. |
| **Wall Restriction** / **Region Visibility** | The region's edge restriction and when it is shown. |

A spell whose effect comes only from its region (Moonbeam, Cloudkill) can use a utility activity to place the region and let the region's rules make the saves, including for creatures inside when it is cast.

### Damage Options

These fields appear only for activities that deal damage:

| Field | Description |
|-------|-------------|
| **Ignore Full Cover** | Targets with total cover can still be targeted and walls don't block the attack; spells ignore all cover, other activities treat total cover as three-quarters cover. |
| **Ignore Damage Traits** | Per damage type (or all types): ignore the target's Immunity, Resistance, Vulnerability, Absorption or Modification, or *Downgrade Immunity* (immunity treated as resistance). |
| **Magic Damage** | Treat damage as magical for overcoming resistance to non-magical damage. |

### Other Options

| Field | Description |
|-------|-------------|
| **Apply Convenient Effects** | Auto-apply Convenient Effects matching the activity name (or item name if no match). Requires the Convenient Effects module. |
| **Automation Only** | Mark the activity as internal/hidden - not intended for manual use from the character sheet. Useful for triggered or secondary activities. |
| **Other Activity Compatible** | Allow this activity to be used as an "Other Activity" by another activity (for bonus damage, etc.). |
| **Use Other Activity** / **Override action type** | The activity used for this one's "other" damage, and whether it takes this activity's action type. |
| **Magic Effect** | (Save activities) Saves against it are saves against magic (Magic Resistance). |
| **Friendly Save** | (Save and check activities) Roll save/Friends Succeed/Friends Fail for the caster's allies. |
| **Friendly Summons** | (Summon activities) The summoned token takes the caster's disposition. |
| **Targets you can see** | On dnd5e's *Targeting* tab (*Midi Targeting*): the activity can only be used on targets its token can see ("a creature you can see"). Enforced by the Mechanics setting *Targets you can see*. |

### Triggered Activities

Configure an activity to automatically trigger another activity on the same item:

| Field | Description |
|-------|-------------|
| **Trigger Activity** | Select another activity on this item to execute after this one completes. |
| **Trigger Condition** | Condition that must be true for the triggered activity to run, evaluated with the workflow's data (e.g., `workflow.hitTargets.size > 0` to only trigger on a hit). |
| **Trigger Targets** | Target item owner/Same targets/Hit targets/Missed targets/Target failed saves/Target successful saves/Generate new targets. |
| **Roll As** | Roll the activity as if owned by: Item Owner/First target/First hit target/First missed target/First saved target/First failed save target. |
| **Consume Resources** | Consume uses/slots when the triggered activity runs. |
| **Show Configure Dialog** | Show the configuration/consume dialog when the triggered activity runs. |

### Over Time Effects (Activity Tab)

For activities that repeat on subsequent turns (like ongoing damage, regeneration, or repeated saves). Marking an activity *Is Over Time* does not run it by itself: an effect must name it with the change `flags.midi-qol.ActivityOverTime` (Override), value the activity's identifier (shown on its Midi tab) or its UUID. While a creature has that effect, midi-qol uses the activity at the chosen point of that creature's turn. The Regeneration and Acid Arrow sample items show the setup.

| Field | Description |
|-------|-------------|
| **Is Over Time** | Enable over-time processing for this activity. When enabled, additional options appear. |
| **Turn Choice** | When the effect triggers: **Start of Turn** or **End of Turn**. |
| **Save Removes** | If checked, a successful save removes the entire effect (not just prevents this turn's damage). |
| **Roll As** | Who rolls the activity: the Effect Token or the Source Token. |
| **Pre activity remove condition** | Tested before the activity is rolled; if true the effect is removed. |
| **Post activity remove condition** | Tested after the activity is rolled; if true the effect is removed. |

**Common Use Cases:**
- **Ongoing Damage**: Apply damage each turn (burning, poison, bleeding)
- **Regeneration**: Heal HP at start/end of turn
- **Repeated Saves**: Allow saves to end conditions (Hold Person, Paralysis)
- **Condition Removal**: Remove effects when conditions are met (e.g., effect ends when target takes damage)

**Example - Burning (End of Turn, Save Ends):**
1. Create a Save activity with damage and appropriate save DC
2. Enable "Is Over Time" and set "Turn Choice" to "End of Turn"
3. Check "Save Removes" so a successful save ends the burning
4. On the activity that sets the target alight, apply an effect with the change `flags.midi-qol.ActivityOverTime` = the save activity's identifier

**Example - Regeneration (Start of Turn):**
1. Create a Heal activity with healing formula
2. Enable "Is Over Time" and set "Turn Choice" to "Start of Turn"
3. Give the item a transfer effect with the change `flags.midi-qol.ActivityOverTime` = the heal activity's identifier

**Example - Remove on Damage Taken:**
1. Set *Pre activity remove condition* (checked before the activity runs) or *Post activity remove condition* (checked after) to e.g. `@attributes.hp.value < @attributes.hp.max`

### Activity Macro

The pencil button opens a macro editor for the activity. This macro runs during the workflow with access to workflow data, allowing custom automation logic.

## Concentration Automation

Uses dnd5e's concentration tracking (it must be enabled). The Concentration tab sets:

| Setting | Description |
|---------|-------------|
| Force a concentration save when damage taken | Never/Chat Message Only/Chat + Auto Roll/Roll Concentration Item |
| Remove concentration on failed save | End concentration when the save fails |
| Remove when incapacitated status applied | End concentration when the actor is incapacitated |
| Single Concentration Check | One check for several damage instances in a workflow |
| Temporary HP Concentration Check | Damage absorbed by temporary HP still forces a check |
| Remove concentration when effects removed | Never/Effects/Effects and Templates: end concentration when its effects (and templates) are gone |

Effects and templates that depend on the concentration are removed when it ends.

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

Track roll data per actor and item (attacks, saves, damage taken by type, concentration and death saves):
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
MidiQOL.gameStats.exportToJSON()      // Download as JSON
MidiQOL.gameStats.exportToCSV()       // Download as CSV
```

## Magic Resistance

Advantage on saves against magic (a spell, or an activity with *Magic Effect*) for an actor with a feat named "Magic Resistance", custom damage resistance text `magic-resistant`, or `flags.midi-qol.magicResistance.all`/`.<ability>`. Disadvantage likewise with `flags.midi-qol.magicVulnerability.*` or custom vulnerability text "Magic Vulnerable".

## Special Effect Expiry

midi adds these special durations to DAE (DAE 14.0.18+ on v14, 14.6.2+ on dnd6), which expires the effects:

| Trigger | Description |
|---------|-------------|
| `1Action`, `Bonus Action`, `Reaction`, `Turn Action` | After the actor takes that kind of action |
| `1Attack`, `1Hit`, `1Miss`, `1Critical`, `1Fumble`, `1Spell`, `1Reaction` | After the actor's next attack, hit, miss, critical, fumble, spell or reaction |
| `1Attack:mwak` (`rwak`/`msak`/`rsak`), `1Hit:…`, `1Miss:…` | The same, for one attack type |
| `isAttacked`, `isHit`, `isHitCritical`, `isMissed` (also `:mwak` etc. for attacked/hit) | When the actor is attacked, hit, critically hit or missed |
| `isDamaged`, `isDamaged.<type>`, `isHealed`, `zeroHP`, `DamageDealt` | When the actor takes damage (of a type), is healed, drops to 0 HP, or deals damage |
| `isSave`, `isSaveSuccess`, `isSaveFailure` (also `.str` etc.) | After a save, or its success/failure |
| `isConcentrationSave`, `isConcentrationSaveSuccess`, `isConcentrationSaveFailure` | After a concentration save |
| `isCheck`, `isCheck.dex`, `isSkill`, `isSkill.acr` | After an ability check or skill roll |
| `isInitiative`, `isMoved` | After rolling initiative, or moving |
| `shortRest`, `longRest`, `newDay` | On a rest or new day |

*Expire 1Hit/1Attack/1Action on roll* (Mechanics tab) expires these when the roll is made instead of waiting for damage.

## Item Description Keywords

Save damage comes from the activity's *Damage on save* field (none/half/full); descriptions are no longer read for it. The one keyword still read is "auto fail friendly" (friendly tokens fail the save), which the activity's *Friendly Save* field also sets.

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
| Auto-Fail | `flags.midi-qol.fail.ability.save.dex` | Force automatic failure |
| Auto-Success | `flags.midi-qol.success.attack.all` | Force automatic success |
| Grants | `flags.midi-qol.grants.advantage.attack.all` | Effects on attackers targeting you |
| Absorption | `system.traits.da.fire` | Convert damage to healing (use dnd5e native trait) |
| Super Saver | `flags.midi-qol.superSaver.dex` | No damage on save, half on fail |
| Magic Resistance | `flags.midi-qol.magicResistance.all` | Advantage vs magic saves |
| Min/Max | `flags.midi-qol.min.ability.save.all` | Set min/max roll values |
| Range | `flags.midi-qol.range.all` | Modify item range |
| Optional | `flags.midi-qol.optional.NAME.attack.all` | Prompted bonus effects |
| Damage Mod | `system.traits.dm.midi.all` | Reduce/increase damage (use negative values to reduce) |
| Save by School | `flags.midi-qol.advantage.save.school.nec` | Advantage/disadvantage on saves vs specific spell schools (13.0.52+) |
| Tool Checks | `flags.midi-qol.advantage.tool.thief` | Per-tool advantage/disadvantage/fail/success/min/max (13.0.38+) |

Advantage, disadvantage, noAdvantage and noDisadvantage flags for saves and checks are `…save.dex` / `…check.dex`; fail, success, min and max keep `.ability.`: `fail.ability.save.dex`, `success.ability.check.all`, `max.ability.save.all`. DAE converts `min`/`max.skill.<skill>` to dnd5e's `system.skills.<skill>.roll.min/max`, and `min`/`max.ability.save.concentration` to `system.attributes.concentration.roll.min/max`.

**Special Flags:**
| Flag | Effect |
|------|--------|
| `flags.midi-qol.uncanny-dodge` | Halve incoming damage |
| `flags.midi-qol.ignoreNearbyFoes` | No disadvantage from nearby enemies |
| `flags.dnd5e.sharpShooter` | No disadvantage at long range (the older `flags.midi-qol.sharpShooter` is still read; DAE converts it) |
| `flags.midi-qol.sculptSpells` | Evocation sculpt spell feature |
| `flags.midi-qol.carefulSpells` | Metamagic careful spell |
| `flags.midi-qol.potentCantrip` | Cantrips do half on save |
| `flags.midi-qol.concentrationSaveBonus` | Deprecated: use `system.attributes.concentration.bonuses.save` |
| `flags.midi-qol.deathSaveBonus` | Add to death saves |
| `flags.midi-qol.bloodsense` | Range (e.g. 30): no disadvantage against hidden/invisible creatures that aren't at full HP within that range |

> [!tip] Navigation 
> See [FLAGS.md](FLAGS.md) for complete documentation of all flags.

---

# Optional Rules

Enabled by the **Optional Game Rules** checkbox on the Rules tab.

Targeting rules that don't need it: with *Calculate Cover* set, a target with total cover (dnd5e's Total Cover status, or the cover module's) can't be targeted by an activity that targets creatures directly (not an area template or emanation); *Walls block ranged attacks* blocks an attack only at walls that block movement; *Targets you can see* (Mechanics tab) checks activities that need a target their token can see.

| Rule | Description |
|------|-------------|
| Check Flanking | Flanking grants advantage, a to-hit bonus, or a Flanking/Flanked effect |
| Unseen/Invisible attackers have advantage/disadvantage on attacks | Advantage for unseen attackers, disadvantage against targets they can't see |
| Hidden attackers have adv/disadv on attacks | Advantage for hidden attackers, disadvantage if the target is hidden |
| Attacking removes hidden (use CE/CV/CUB/core foundry specialStatus ) | Attacking reveals the attacker |
| Ranged attacks when a foe is closer than this have disadvantage. 0 disables | Nearby foes give ranged attacks disadvantage |
| (House rule) Enabling this means that only the most effective Damage Reduction will apply. Off means DR accumulates | Max DR value |
| (House Rule) Critical/Fumble always succeed/fail for saving throws | Nat 20/1 on saves auto succeed/fail |
| (House Rule) Critical Roll Margin | Attack rolls this much above AC are critical |
| (House Rule) Allow normal critical rolls | With a margin set, rolls above the critical threshold still crit |
| (House Rule) Ranged Attacks at foes near allies have disadvantage | Disadvantage shooting at foes next to allies |
| Active Defence | See below |
| Enable Challenge Mode Armor Class | See below |
| (House Rule) Vitality Item | Damage at 0 HP reduces the Vitality Item's uses |

"When an Incapacitated actor takes an action, MidiQOL should", "Check weapon range when attacking", "Targets you can see" and "Include height difference in distance calculations" are Mechanics tab settings and apply whether or not optional rules are on.

## Active Defence

Variant rule where defenders roll instead of attackers.
- DC = attack bonus + Active Defence Modifier (12 by default: DC = 12 + attack bonus)
- Roll = 1d20 + AC - (22 - Active Defence Modifier) (1d20 + AC - 10 by default)
- Attacker advantage = defender disadvantage
- Critical defence = fumbled attack

## Challenge Mode Armor Class

Alternative AC system with Evasion Class (EC) and Armor Resistance (AR):
- Roll < EC: Miss
- Roll >= EC and <= AC: Glancing blow (damage reduced by AR)
- Roll > AC: Full hit

---

# Migration Notes

## Foundry 14 (midi-qol 14)

- Chat message visibility is a *message mode*: core's `ChatMessage.create`/`Roll#toMessage` take `messageMode` (`public`, `gm`, `blind`, `self`). dnd5e keeps its `rollMode` field, but its values are message modes too; legacy names (`gmroll` etc.) are converted.
- `Roll#evaluateSync` can't roll dice on Foundry 14. `MidiQOL.addRollTo` is for dice-free rolls only; use `MidiQOL.addRollToAsync` for rolls with dice.
- Times-up is not supported on Foundry 14 (disable or uninstall it): DAE manages effect durations and special durations.
- Boolean midi-qol flags use DAE's `BooleanFormulaField`: several effects on one flag combine with `||` (ADD/UPGRADE) and `&&` (MULTIPLY/DOWNGRADE).

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

Earlier 13.x changes (removed settings, changed defaults, settings moved into the config panel) are in the [Changelog](Changelog.md).

---

# Troubleshooting & FAQ

## Common Issues

### Midi-QOL disappeared after update
Update your dnd5e system to the latest version.

### Nothing works after upgrade
Check that "Enable roll automation support" is **on** for each player (it's a per-player setting). Use SocketSettings module to force-set on all clients.

### Works for some players, not others
Same issue - check workflow automation is enabled on all clients.

### Sample compendium items don't work
- On the Misc tab, enable "Add item on use macro to sheet" (and "Add actor on use macro to sheet" for actor macros)
- Item macros are stored on the item (`flags.dae.macro`); use a current copy from the sample compendium

### Double effects applied
If using Convenient Effects + DAE effects on same item, you'll get both. Choose one approach per item.

### Setting conflicts
When midi and another system or module are both set to do the same job (marking wounded or dead creatures, rerolling initiative, average or replaced damage), or midi is set to use a status that no longer exists, the GM is whispered a card listing them. *Open TroubleShooter* shows each conflict, with an **Auto Fix** where one is available; *Don't remind me* hides that card until the settings involved change.

## Bug Reports

**Always include either:**
- Exported Troubleshooter data file (from MidiQOL settings menu)
- OR exported midi-qol settings (from Misc tab)

No world information is exported. Module list helps with debugging.

---

# For Developers

## OnUse macro names

An onUse macro entry is `[pass]name` (item or actor *On Use Macros*), or `name, pass` in an effect change on `flags.midi-qol.onUseMacroName`. Besides `ItemMacro`, `ActivityMacro`, `function.…` and world macro names:
- A **blank name** stands for the item's own macro: the macro of the activity being used if it has one, else the item macro. In an effect change it is the effect's activity macro, else the macro of the effect's item (its parent for a transfer effect, else its origin). With no such macro the entry does nothing.
- An item that has a macro and no onUse macros runs that macro after active effects, as `[postActiveEffects]` with the name left blank. Macros shared with DAE (`macro.itemMacro` on/off) should check `args[0]`.
- An effect change with no pass (`""`, `","`) is ignored and reported to the TroubleShooter.

## Roll Modifier Tracker (13.0.40+)

Attack rolls, saves, checks and skill rolls use a `RollModifierTracker` API for advantage/disadvantage/critical/fumble attribution. The tracker is available as `workflow.tracker` or `workflow.attackRollModifierTracker`.

```js
tracker.advantage.add(source, displayName)     // Add advantage source
tracker.disadvantage.add(source, displayName)   // Add disadvantage source
tracker.advantage.suppress(source, displayName) // Suppress advantage
tracker.critical.force(source, displayName)     // Force critical hit
tracker.critical.suppress(source, displayName)  // Prevent critical
tracker.modifiers.fail(source, displayName)     // Auto-fail the roll
```

Also `tracker.advantage.setOverride(source, displayName)` / `clearOverride()`, and `tracker.modifiers.succeed/min/max/forceMin/forceMax`.

Query state: `tracker.hasAdvantage`, `tracker.hasDisadvantage`, `tracker.isCritical`, `tracker.isFumble`, `tracker.advantageMode`

Use the `midi-qol.preAttackRollConfig` hook or on-use pass to modify the tracker before the roll is made (return `false` to cancel the attack).

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

Workflow state and workflow event hooks receive the workflow; others take the arguments noted. Workflow, state and activity hooks can be made item-specific by appending `.{item.uuid}` or `.{activity.uuid}`; cancellable workflow hooks also fire with `.{workflow.id}`.

### Workflow State Hooks

These hooks fire before (`pre`) and after (`post`) each workflow state. Return `false` from either to abort.

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
| `midi-qol.preTargeting` | Before targeting phase; args `{activity, token, config, dialog, message}` | Cancel workflow |
| `midi-qol.preTargetingV2` | Before targeting; args `{workflow, usage, dialog, message}` | Cancel workflow |
| `midi-qol.preItemRoll` | Before item roll; args `{activity, token, config, dialog, message}` | Cancel workflow |
| `midi-qol.preItemRollV2` | Before item roll; args `{workflow, usage, dialog, message}` | Cancel workflow |
| `midi-qol.preAttackRoll` | Before attack roll | Cancel attack |
| `midi-qol.preAttackRollConfig` | After `preAttackRoll`, before the attack's advantage/disadvantage is final (the tracker may be modified) | Cancel attack |
| `midi-qol.preDamageRoll` | Before damage roll; args `(workflow, activity, config, dialog, message)` | Cancel damage |
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
| `midi-qol.preTargetSave` | Before each target's save; args `(target, workflow, saveDetails)` | `saveDetails` can be changed (advantage, tracker) |
| `midi-qol.postCheckSaves` | After save rolls | |
| `midi-qol.postActiveEffects` | After effects applied | |
| `midi-qol.RollComplete` | Workflow fully complete | |
| `midi-qol.preTargetDamageApplication` | Before damage to target | Args: token, {item, workflow, damageItem} |
| `midi-qol.isHealed` | After healing applied | Args: token, {item, workflow, damageItem, ditem} |
| `midi-qol.isDamaged` | After damage applied | Args: token, {item, workflow, damageItem, ditem} |

### Damage Calculation Hooks

| Hook | When | Return `false` to... |
|------|------|----------------------|
| `midi-qol.dnd5ePreCalculateDamage` | Before damage calculation; args `(actor, damages, options)` | Cancel damage calc |
| `midi-qol.dnd5eCalculateDamage` | After damage calculation; args `(actor, damages, options)` | Cancel damage calc |

### Reaction Hooks

| Hook | When | Notes |
|------|------|-------|
| `midi-qol.ReactionFilter` | Filtering available reactions; args `(reactions, options, triggerType, reactionActivityList)` | Return `false` to skip all |
| `midi-qol.preSetReactionUsed` | Before marking reaction used | Args: actor, reactionEffect. AsyncHooksCall, effect is live (updateSource applies). (13.0.52+) |
| `midi-qol.setReactionUsed` | After marking reaction used | Args: actor, reactionEffect. (13.0.52+) |
| `midi-qol.preSetBonusActionUsed` | Before marking bonus action used | Args: actor, bonusActionEffect. (13.0.52+) |
| `midi-qol.setBonusActionUsed` | After marking bonus action used | Args: actor, bonusActionEffect. (13.0.52+) |

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
| `midi-qol.dependentsRegistryChanged` | An effect/template dependency added or removed | {type, parentUuid, dependentUuid} |
| `midi-qol.TroubleShooter.recordError` | An error recorded for the TroubleShooter | errorDetail |

### Premade Hooks

All workflow state hooks also have `midi-qol.premades.{pre|post}{StateName}` variants for use by premade effect libraries.

> [!tip] Navigation
> See [MACROS.md](MACROS.md#hooks-reference) for detailed hook usage examples.

## Enhanced Traits

### DR/DI/DV
System traits support expressions evaluated with actor roll data.

An activity's *Ignore Damage Traits* can ignore a target's immunity, resistance, vulnerability, absorption or modification, per damage type or for all, or downgrade immunity to resistance (see [Damage Options](#damage-options)).

### Spell Sculpting
- `flags.midi-qol.sculptSpells` - Evocation sculpt spell
- `flags.midi-qol.carefulSpells` - Metamagic careful spell

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
| `damageType` | Damage type: fire, cold, poison, necrotic, etc. | untyped |
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
When `actionSave=roll`: A chat card is created at turn start; player clicks to roll when using their action. The card is removed at the end of the turn.

The action save's prompt or card always comes at the start of the creature's turn; `turn` sets when the effect's damage or macro is applied. For a save repeated at the end of each turn (no action needed), leave out `actionSave` and use `turn=end` with `saveCount`.

#### Display Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `chatFlavor` | Flavor text for chat messages | - |
| `rollMode` | Roll visibility: `public`, `gm`, `blind`, `self` (legacy `publicroll`/`gmroll`/`blindroll`/`selfroll` accepted) | - |

#### Advanced Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `removeCondition` | Condition expression - if true, effect is removed | - |
| `itemName` | UUID or name of item to use as template for the overtime roll | - |
| `macro` | Macro to call during overtime processing (see Macro Options below) | - |
| `killAnim` | `true/false` - Suppress Sequencer animations | `false` |
| `allowIncapacitated` | `true/false` - Process even if target is incapacitated | `false` |
| `fastForwardDamage` | `true/false` - Skip damage dialog | `true` |
| `fastForwardAttack` | `true/false` - Skip attack dialog | `true` |
| `autoRollAttack` / `autoRollDamage` | `true/false` - Roll the attack/damage automatically | `true` |

**Macro Options:**

The `macro` parameter supports the following formats:
- `function.functionName` - Call a global function (e.g., `function.myModule.overTimeHandler`)
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

**Hold Person (save at the end of each turn):**
```
turn=end, saveDC=@attributes.spelldc, saveAbility=wis, saveCount=1-, label="Hold Person"
```

**Damage with Condition (only if below max HP):**
```
turn=start, damageRoll=1d6, damageType=necrotic, applyCondition=@attributes.hp.value < @attributes.hp.max, label="Lingering Wound"
```

**Grapple Escape (action save, STR or DEX choice):**
```
turn=start, saveDC=14, saveAbility=str|dex, rollType=check, actionSave=dialog, saveCount=1-, label="Grappled"
```

**Flesh to Stone (3 failed saves = petrified):**
```
turn=end, saveDC=@attributes.spelldc, saveAbility=con, saveCount=2-, failCount=3-petrified, label="Flesh to Stone"
```
*After 3 failed saves, the target becomes petrified and the effect ends. After 2 successful saves, the effect simply ends.*

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
> See [docs/workflowfields-2026-02-01.md](docs/workflowfields-2026-02-01.md) for available workflow data in conditions.

---

# Changelog & Credits

## Changelog
https://gitlab.com/tposney/midi-qol/-/blob/v14/Changelog.md

## Credits

Reaction and BonusAction images by DFreds, sourced from https://game-icons.net/ (CC-BY licence).

**Sound files (CC-BY 3.0):**
- `fail1.ogg` - [Freesound #178687](https://freesound.org/s/178687/) by Soundb
- `success-drums.ogg` - [Freesound #270467](https://freesound.org/people/LittleRobotSoundFactory/sounds/270467/) by LittleRobotSoundFactory
- `drink.wav` - [Freesound #433645](https://freesound.org/people/dersuperanton/sounds/433645/) by dersuperanton
- `use.wav` - [Freesound #180831](https://freesound.org/people/32cheeseman32/sounds/180831/) by 32cheeseman32
