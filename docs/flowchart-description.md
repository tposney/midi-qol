This page shows when and why each macro pass is called. See [Workflow Fields](workflowfields-2026-11-17.md) for the fields available in each pass. In the menu for configuring an item's on use macro calls, some options are shown with a description rather than the name of the pass; each node in the chart gives both.

The chart is arranged by `args[0].tag`, the category of macro pass:

- `OnUse` passes run on the client rolling the item.
- `TargetOnUse` passes run once for each target before proceeding.
- `optional` passes are called only when a macro is named in a `flags.midi-qol.optional.NAME.*` flag ([see here](/FLAGS.md#itemmacro-in-optional-bonus-flags)).
- `DamageBonus` has one pass, called when macros are named in the *Damage Bonus Macro* field in a character's special traits, or set by an effect with `flags.dnd5e.DamageBonusMacro` ([see here](/MACROS.md#damage-bonus-macros)).

A teleport activity (dnd5e 6) also runs `preTeleport` before anyone moves and `postTeleport` after the moves; they are not drawn on the chart.

> [!NOTE]
> If your macro changes a document the calling client may not have permission for, use sockets. Utilities are available in `MidiQOL.socket()`.
