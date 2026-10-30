# midi-qol 14.6.5

**Requires** dnd5e 6.0.x (6.1 isn't supported yet: it breaks the damage card) and DAE 14.6.4.

## Highlights
- **Attack per target** works with templates and emanations: each target gets its own attack and card, linked to the first card, which shows every hit or miss.
- **Ammunition per attack, use or target**, and attacks without the roll dialog now spend the chosen ammunition.
- **Attack roll details**: icons beside the total; the breakdown labels every modifier (Proficiency +6).
- **Flanking** and a target's granted attack bonus are now part of the attack roll (single target) instead of lowering AC.
- **Hiding per observer** (2024): a hiding creature is invisible to whoever doesn't perceive it, with an optional passive Perception house rule. *Attacking removes hidden/invisible* is removed (breaking).
- **Apply condition rules** (optional): the status effects dnd5e doesn't apply itself.
- **Save visibility** follows the caster and dnd5e's *Challenge Visibility*; obscured rolls show ??.
- **Teleport**: planned during the use, caster/target swap, hex grids and levels.
- **Follow-up buttons**: an activity can appear as a button on its item's card.
- **Enforce death saves** (optional): damage at 0 HP fails death saves.
- **Mark lower floors where creatures can't be seen** replaces *Dim lower floors*.

## Chat cards
- Optional bonuses appear as a one-line note beside the roll they changed (e.g. "Lucky Strike: 17 → 22").
- Undo removes everything linked to the use and colours undone cards.
- Dark-mode section dividers fixed. AC modifier icons line up and are hidden with the AC.
- Apply on dnd5e's damage tray goes through midi (breaking: damage macros run).

## Settings
- Settings missing from a world or an imported file take their defaults instead of off.
- The Rules tab starts with *Rules always applied*. Quick settings and presets are rebuilt.
- *Show damage after each save* is removed.
- *Move roll formula to tooltip*'s advantage options are deprecated (the label's info icon shows the same reasons).

## For macro writers
- Card notes: `MidiQOL.addCardNote`, `registerCardNoteRenderer` and helpers. Writing to a card's `content` becomes a note.
- `MidiQOL.hasUsedAction` / `setActionUsed`, `addFollowUp`, `tokenName`, and the `midi-qol.conditionData` hook.
- `contestedRoll` shows on the card and honours `rollOptions`.
- A blank onUse macro name means the item's own macro.
- `flags.midi-qol.DR.save/other/util/…` work; `deathSaveBonus` is deprecated.

## Fixes
- Damage absorption heals correctly.
- Concurrent uses keep their own targets.
- A crit with parenthesised dice now completes.
- ddb-game-log checkbox, Brooch of Shielding, and more.

## Sample items
2024 actions (Hide, Search, Generic Actions…), SRD spells, equipment, Metamagic, monster features (Regeneration, Swallow…), Detect Magic with Magic Sight, plus homebrew. Most need CAT.

Full changelog: https://gitlab.com/tposney/midi-qol/-/blob/dnd6/Changelog.md
