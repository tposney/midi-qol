# midi-qol 14.6.3 (dnd6): what v14 doesn't have

Requires DAE 14.6.2. Fixes shared with v14 14.0.15 are left out; the changelog has the details.

## Rolls follow dnd5e 6

* **Fail and success live on dnd5e's roll fields.** Auto-fail and auto-success are conditions beside dnd5e's bonus/min/max/mode (e.g. `system.abilities.dex.save.roll.fail`), combined as dnd5e combines its fields. Min and max are dnd5e's. The old `flags.midi-qol` fail/success/min/max keys are deprecated; DAE converts them.
* **dnd5e decides advantage on every d20 roll.** midi's flags and its own sources (flanking, range, visibility, grants) count alongside dnd5e's roll mode fields and advantage rules, so a downgrade or override on any of them applies to all; the tooltip names each dnd5e source. A dnd5e rule forcing a mode no longer beats a suppression. *Ability Check Advantage gives Skill Advantage* is removed (always on, as in dnd5e).
* **Keys behave as dnd5e's.** Alt and Ctrl work on skill and tool checks; Alt+Ctrl rolls flat; Shift+Alt+Ctrl forces a normal roll on every d20 roll, initiative included.
* **Criticals.** A d20 raised or lowered by a minimum or maximum counts as the value it becomes, as in dnd5e. midi's auto-success and auto-fail never make a critical or fumble unless the die really showed it.
* **Tool checks** from a request card roll for the requested actor and honour `simulate` and the card's roll mode, as saves and skills do.

## Damage

* Damage Absorption chosen on the actor sheet is saved and works: its damage types, ALL (not healing) and physical bypasses.
* Super Saver and Semi Super Saver change only damage a save halves.
* Ammunition with its own activity (e.g. Arrow of Slaying) uses its own conditions and save.

## Effects

* Applied effects record their source as dnd5e 6 does (activity, concentration, card); see DAE 14.6.2's upgrade notes.
* A replacement effect's `ItemMacro` is found after its item is deleted.

## Teleport activity

dnd5e 6's Teleport activity runs a midi workflow. *Who Teleports* chooses controlled tokens, the caster, caster and targets, or targets; the card lists who will move and its button moves them. Destinations must be free, not through walls and optionally in sight; a blocked one can be picked again or fail into the damage activity. `preTeleport`/`postTeleport` macros and hooks can cancel or adjust moves.

## Chat cards

* New setting *Show damage after each save*: each target's damage under its save result.
* The damage tray shows each target's multiplier when they differ.
* Targets added to a card after its roll are listed and marked unchecked, and later card updates keep them.
* A save's natural 20/1 is no longer marked critical/fumble when it disagrees with the result.
* Dark theme highlights, tray row height and the dnd5e save summary layout fixed.

## Also

* *Walls block* finds creatures inside a self-centred dnd5e 6 Radius area (e.g. Sword Burst).
* *Auto reroll initiative* recovers uses that recover on initiative.
* New API: `MidiQOL.getCoverBonus(attacker, target, activity?)`, `MidiQOL.highlightTokens(tokens, { color? })`.
* Sample items: 11 used an outdated DAE flag (Weird's and Prismatic Spray's over-time DC was 0); Elemental Attunement reads `lastArg.source`.

## For macro authors

* `flags.midi-qol.concentrationSaveBonus` is deprecated: use `system.attributes.concentration.roll.bonus`.
* `RollModifierTracker` sides count their sources as dnd5e does; `advantage.setOverride` is a dnd5e override (a suppression still applies); `hasAdvantage`/`advantageMode` are dnd5e's verdict, then the roll as made (`reconcileWithRoll`). `processKeys` is removed.
