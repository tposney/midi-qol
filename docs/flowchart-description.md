<!-- NOTE: This page is copied to several places using "::include" from GitLab markdown -->
This page provides information on when and why a pass is called. Check the [Workflow Fields](workflowfields.md) page to see what fields are available in each pass. In the menu for configuring item on use macro calls, some options are shown with a description rather than the name of the pass. Names and descriptions are associated in each node in the chart below.

The chart is arranged by `args[0].tag`, which holds a string representing a category of macro passes:

- `OnUse` contains passes that run on the client rolling the item.
- `TargetOnUse` contains passes that run once for each target before proceeding.
- `optional` passes are a special case called only when a macro is specified in a `flags.midi-qol.optional.NAME.*` flag ([see here](/FLAGS.md#itemmacro-in-optional-bonus-flags)).
- `DamageBonus` is a tag with one pass called if one or more macros are specified in the "*Damage Bonus Macro*" field in the special traits on a character sheet, or set by an effect using flag `flags.dnd5e.DamageBonusMacro` ([see here](/MACROS.md#damage-bonus-macros)).

>>> [!note]
If your macro makes changes to a document when the calling client may not have permission, you will need to use sockets. Utilities are available in `MidiQOL.socket()`.
>>>