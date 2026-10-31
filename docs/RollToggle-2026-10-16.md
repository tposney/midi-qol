# Roll Toggle and dnd5e's roll keys (2026-10-16)

midi-qol [#1553](https://gitlab.com/tposney/midi-qol/-/issues/1553) asked that, with fast forward on, a key open the roll configuration dialog. midi's **Roll Toggle** key (default F) does that; binding it to Shift gives exactly what was asked. Checking every key combination against dnd5e showed where midi differed from dnd5e and from itself.

## The rules (skill/ability/save/tool rolls and attacks)

- **Roll Toggle held**: it alone decides whether the dialog shows, inverting fast forward: the dialog shows when the roll is fast forwarded, and is skipped when it is not.
- **No toggle, fast forward on**: no dialog.
- **No toggle, fast forward off**: dnd5e decides, as for its own rolls: the dialog shows unless Shift, Alt or Ctrl is held.
- **Advantage** is always dnd5e's: Alt advantage, Ctrl disadvantage, Shift with Alt or Ctrl picks that mode; when the dialog shows, that mode is its default button.
- Attacks: *Force roll dialog* (always/never), ammunition confirmation and thrown weapons still override.

Binding Roll Toggle to Shift works without unbinding dnd5e's *Skip Dialog (Normal)*: the toggle decides first.

Damage rolls are unchanged (their keys choose critical/normal).

## What changed

| Roll | Roll Toggle on | Fast forward | Keys | Before | After |
|---|---|---|---|---|---|
| skill | F | on | F+Alt | dialog, normal | **dialog, advantage** |
| skill | F | on | F+Ctrl | dialog, normal | **dialog, disadvantage** |
| skill | F | off | F | dialog, normal | **no dialog, normal** |
| skill | F | off | F+Shift | dialog, normal | **no dialog, normal** |
| skill | F | off | F+Alt | dialog, normal | **no dialog, advantage** |
| skill | F | off | F+Ctrl | dialog, normal | **no dialog, disadvantage** |
| attack | F | off | Alt | dialog, advantage | **no dialog, advantage** |
| attack | F | off | Ctrl | dialog, disadvantage | **no dialog, disadvantage** |
| attack | F | off | F+Shift | dialog, normal | **no dialog, normal** |
| skill | Shift | on | Alt+Shift | dialog, normal | **dialog, advantage** |
| skill | Shift | on | Ctrl+Shift | dialog, normal | **dialog, disadvantage** |
| skill | Shift | off | Shift | dialog, normal | **no dialog, normal** |
| skill | Shift | off | Alt+Shift | dialog, normal | **no dialog, advantage** |
| skill | Shift | off | Ctrl+Shift | dialog, normal | **no dialog, disadvantage** |
| attack | Shift | off | Shift | dialog, normal | **no dialog, normal** |
| attack | Shift | off | Alt | dialog, advantage | **no dialog, advantage** |
| attack | Shift | off | Ctrl | dialog, disadvantage | **no dialog, disadvantage** |
| attack | Shift | off | Alt+Shift | dialog, advantage | **no dialog, advantage** |
| attack | Shift | off | Ctrl+Shift | dialog, disadvantage | **no dialog, disadvantage** |

In short:

- **Attacks with fast forward off now follow dnd5e**: Alt or Ctrl skip the dialog with advantage or disadvantage (they used to open it with that mode preselected).
- **Roll Toggle with fast forward off now skips the dialog** (on skill rolls it did nothing; with Shift as the toggle, Shift opened the dialog instead of skipping).
- **Roll Toggle opening the dialog keeps Alt/Ctrl's mode** as the default button (skill rolls showed *Normal*).

## Full table after the change

| Roll Toggle on | Fast forward | click | Shift | Alt | Ctrl | Alt+Shift | Ctrl+Shift | F | F+Shift | F+Alt | F+Ctrl |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F | on | no dialog, normal | no dialog, normal | no dialog, advantage | no dialog, disadvantage | no dialog, advantage | no dialog, disadvantage | dialog, normal | dialog, normal | dialog, advantage | dialog, disadvantage |
| F | off | dialog, normal | no dialog, normal | no dialog, advantage | no dialog, disadvantage | no dialog, advantage | no dialog, disadvantage | no dialog, normal | no dialog, normal | no dialog, advantage | no dialog, disadvantage |
| Shift | on | no dialog, normal | dialog, normal | no dialog, advantage | no dialog, disadvantage | dialog, advantage | dialog, disadvantage | – | – | – | – |
| Shift | off | dialog, normal | no dialog, normal | no dialog, advantage | no dialog, disadvantage | no dialog, advantage | no dialog, disadvantage | – | – | – | – |

Skill rolls and attacks behave the same in every cell. Quench batch 68 checks every cell, taking dnd5e's own behaviour from dnd5e at run time; 68.0 fails if dnd5e changes how Shift, Alt or Ctrl work.
