# Save DC Display and Visibility

This document describes how midi-qol handles the display of saving throw DCs based on the dnd5e `challengeVisibility` setting.

## Overview

Midi-qol now uses the dnd5e system's `challengeVisibility` setting instead of the previous midi-qol `displaySaveDC` setting. This provides better integration with the base system and more granular control over what players can see.

## Configuration

The setting is accessible from the midi-qol config panel:
- **Location**: Workflow Tab → Saves section → "DND5E Challenge Visibility"

### Visibility Options

| Option | Description |
|--------|-------------|
| **All** | Show DC to everyone for all saves |
| **Player** | Show DC only when the caster is player-owned |
| **None** | Hide DC from all non-GM players |

**Note**: The GM always sees all DCs regardless of this setting.

## Visibility Logic

### "All" Setting
- All players see the DC for all saves
- All save roll totals and results are visible
- Success/failure highlighting is shown for all targets

### "Player" Setting
When set to "Player", visibility depends on whether the caster (the actor using the item that triggers the save) is player-owned:

**Player-owned caster:**
- DC is shown to all players
- All save details (totals, highlights, symbols) are visible
- Behaves the same as "All" visibility

**NPC caster (GM-owned):**
- DC is hidden from players
- NPC save roll totals are hidden (to prevent DC inference)
- Pass/fail highlights (green/red backgrounds) remain visible
- Pass/fail symbols (check/X icons) remain visible
- Player-owned target roll totals are still shown (players know what they rolled)

### "None" Setting
- DC is hidden from all non-GM players
- All save highlighting is removed
- Save symbols may be hidden depending on other settings

## Integration with autoCheckSaves

The visibility logic also considers the `autoCheckSaves` midi-qol setting:

| autoCheckSaves | Effect on non-GM visibility |
|----------------|------------------------------|
| **whisper** | All save results hidden from players |
| **gmOnly** | Save display completely hidden |
| **none** | Auto-checking disabled |
| **allNoRoll** | Results shown, roll totals hidden |
| **all** | Results and totals shown |
| **allShow** | Full rolls displayed |

When `autoCheckSaves` is set to "whisper", the DC target is never passed to player save rolls, regardless of the visibility setting.

## Save Roll Target DC

When a player makes a save roll (either automatically or via the roll dialog), the target DC is only passed to dnd5e when the player should see the result. This prevents dnd5e from marking the roll as success/failure when the visibility settings indicate the player shouldn't see the outcome.

The target DC is passed to save rolls when:
1. The user is a GM (GM always sees results), OR
2. Both conditions are met:
   - `autoCheckSaves` is not "whisper"
   - `shouldDisplaySaveDC(actor)` returns true for the caster

## API

### shouldDisplaySaveDC(actor?)

A helper function to determine if DCs should be shown:

```javascript
// Check if DCs should be shown (no actor context)
const showDC = MidiQOL.shouldDisplaySaveDC();

// Check if DCs should be shown for a specific caster
const showDC = MidiQOL.shouldDisplaySaveDC(workflow.actor);
```

**Parameters:**
- `actor` (optional): The actor casting the spell/using the item. Used to check `hasPlayerOwner` when visibility is "Player".

**Returns:**
- `true` if DCs should be shown
- `false` if DCs should be hidden

**Logic:**
- Returns `false` if visibility is "None"
- Returns `true` if visibility is "All"
- For "Player" visibility: returns `true` if the actor has player ownership, `false` otherwise
- If no actor is provided with "Player" visibility, returns `true` (backwards compatibility)

## Integration Modules

The following integration modules respect the visibility settings:

- **Monk's Token Bar**: DC is only shown in save requests when `shouldDisplaySaveDC(actor)` returns true
- **Epic Rolls**: Same visibility logic applied
- **Flash Rolls**: Same visibility logic applied

## Chat Message Display

The chat message rendering (`hideStuffHandler`) applies the following logic for non-GM players:

### Variables
- `shouldDisplayChallenge`: Raw dnd5e setting value ("all", "player", or "none")
- `dcHidden`: True when visibility is "player" AND caster is NPC
- `displayNPCSaves`: True when visibility is "all", OR visibility is "player" AND caster is player-owned
- `displayPlayerSaves`: True when visibility is not "none"

### What Gets Hidden

| Condition | Elements Hidden |
|-----------|-----------------|
| `!displayPlayerSaves` | All save totals, tooltips, symbols, DC |
| `!displayNPCSaves` | NPC tooltips, totals; symbols kept if `dcHidden` |
| `dcHidden` | NPC totals hidden, but highlights and symbols kept |
| `!highlightSuccess` | All success/failure highlighting removed |

## Quick Settings

The quick settings presets configure the dnd5e `challengeVisibility` setting:

- **Secret Squirrel**: Sets visibility to "None"
- **Full Disclosure**: Sets visibility to "All"

## Migration

On first load after the update, existing midi-qol `displaySaveDC` settings are automatically migrated:

| Old displaySaveDC | New challengeVisibility |
|-------------------|------------------------|
| `true` / `"all"` | `"all"` |
| `false` / `"none"` | `"none"` |
| Any other value | Uses most restrictive existing value |

A chat message is sent to the GM with migration details.
