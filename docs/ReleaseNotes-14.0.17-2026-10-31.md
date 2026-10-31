# midi-qol 14.0.17

**For** Foundry 14 + dnd5e 5.3. **Requires** DAE 14.0.19.

From this release the v14 line gets bug fixes only; new features go to the dnd5e 6 line (midi-qol 14.6.x).

## Changes
- **Mark lower floors where creatures can't be seen** replaces *Dim lower floors through surface holes*: midi shades the squares below an opening where a creature would be hidden from your token (tint, dim, hatch or outline).
- *Unseen/Invisible attackers* defaults to RAW (2024) where it was never set.
- **Midi Region Light** stays inside its region, is centred on the shape, and can be darkness.
- The *Midi Overtime* tab explains which effect change runs an over-time activity.
- A blank onUse macro name means the item's own macro.

## Fixes
**Attacks and targeting**
- Attacks without the roll dialog spend the activity's chosen ammunition, not the actor's first.
- "Whatever the save" effects no longer go to creatures the attack missed.
- AC modifier icons on hit rows line up.
- Automated uses (macros, Regeneration) no longer lose their targets when another use overlaps.
- *Un-target at end of turn* no longer drops a Healer's Kit's or Spare the Dying's target.

**Damage**
- The GM's critical hits double damage dice again in new worlds.
- Damage absorption shows as healing on the damage card.
- `modifyDamageBy` updates the whole damage entry.
- Damage at 0 HP counts as damage: `isDamaged` triggers fire.

**Rolls and saves**
- NPC save results follow *Challenge Visibility* on a player-owned caster's card.
- Obscured rolls show ?? in the saves section.
- Held Alt/Ctrl/Shift keys reach a creature's own check or save.
- Fixed "ActiveEffect … does not exist" errors from action and reaction markers.
- Over-time skill saves carry the right ability.
- Dice So Nice's *Hide NPC rolls* and *Disabled during combat* apply to midi's dice.

**Macros**
- `contestedRoll` honours `rollOptions`.
- `ItemMacro` on Aura Effects copies runs.
- `chooseReactions` accepts the older reaction object form.
- Ammunition macros get the ammunition as their item.
- The `useDamageDetail` setting is removed (reads true, with a deprecation warning).

## Sample items
- New homebrew ammunition: Starfall Bullet, Chainbreaker Bolt, Arrow of Echoed Wounds.
- Items are sorted into Mundane, Weapons, Ammunition, Wands, Wondrous and Homebrew.
- Non-SRD official items have no rules text (apply them with CAT's medkit).
- Brooch of Shielding is the SRD 5.2 version and stops Magic Missile.

Full changelog: https://gitlab.com/tposney/midi-qol/-/blob/v14/Changelog.md
