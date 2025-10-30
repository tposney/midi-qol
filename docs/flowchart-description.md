<!-- NOTE: This page is copied to several places using "::include" from GitLab markdown -->
This page provides information on when, where, and why a pass is called. Check the [Workflow Fields](workflowfields.md) page to see what fields are available in each pass. In the menu for configuring item on use macro calls, some options are shown with a description rather than the name of the pass. Names and descriptions are associated in each node in the chart below.

<!-- the links here in optional and damagebonus really need to be replaced with something that won't possibly break, like a dedicated .md or a wiki on gitlab pages -->
The chart is arranged by `args[0].tag`, which holds a string representing a category of macro passes:

- `OnUse` contains passes that run on the client rolling the item.
- `TargetOnUse` contains passes that run on the client(s) being targeted, if any. Each pass in this category is repeated for each target before proceeding.
- `optional` passes are a special case called only when a macro is specified in a `flags.midi-qol.optional.NAME.*` flag ([see here](https://gitlab.com/tposney/midi-qol#optional-bonus-effects:~:text=ItemMacro.%3CitemUUID%3E,implementation%20as%20above.)). These are called on whichever client will benefit from the bonus.
- `DamageBonus` is a tag with one pass called if one or more macros are specified in the "*Damage Bonus Macro*" field in the special traits on a character sheet, or set by an effect using flag `flags.dnd5e.DamageBonusMacro` ([see here](https://gitlab.com/tposney/midi-qol#optional-bonus-effects:~:text=your%20custom%20roll.-,Damage%20bonus%20macros,-are%20called%20after)). These are called on the client rolling the damage.

<!-- provide a page detailing sockets? -->
>>> [!note]
If your macro makes changes to a document when the calling client may not have permission, you will need to use sockets. Utilities are available in `MidiQOL.socket()`.
>>>