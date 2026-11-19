# Which mechanism to use (midi-next, for module and content authors, 2026-11-20)

midi has grown several ways to change a use. They overlap; this is which one to reach for. Details of steps, reactions
and requests are in `StepsAndReactions-2026-11-19.md`.

## I want to…

| I want to… | Use | Where it lives |
|---|---|---|
| watch a use (log it, show something, record a result) | a `midi-qol.*` hook at the step (`midi-qol.post<Step>`) | your module |
| stop a use at a step | the `midi-qol.pre<Step>` hook returning `false` | your module |
| do something extra for one item (a world's or a pack's automation) | an onUse macro on the item or activity, at the pass named after the step | the item |
| add work to every use, or to uses that match | a step of your own inserted around midi's (`MidiQOL.steps.register`, `MidiQOL.steps.insert`, optional `when`) | your module |
| add work to every use of one item or activity, from a module | the same step, inserted by the document's data (`flags.midi-qol.steps`, the activity's `midiSteps`) | the item |
| do midi's step differently | replace or wrap it (`MidiQOL.steps.replace` / `wrap`); remove it (`remove`) | your module |
| change one use only | `midiOptions.steps` on `completeActivityUse` | the call |
| decide a mechanic (cover, range, flanking, perception, distance) | a service provider (`MidiQOL.services.register(name, id, provider)` in `midi-qol.registerServices`) | your module |
| add a bonus or penalty to rolls, prompted or not | the `rollBonuses` service (contributors), or for content the `flags.midi-qol.optional.*` effect keys | module / effect |
| offer or change reactions | the `reactions` service; reaction steps (`midi-qol.reaction.*`) for how they are asked | your module |
| ask a player to roll or choose | the request core (`saveRequests`, `MidiQOL.playerWaits`), never a socket of your own | your module |
| automate a new activity type | `MidiQOL.registerActivityPolicy(type, policy)` (below) | your module |
| give your provider a setting | `MidiQOL.settings.register(module, { key, group, label, default })`: your game setting, shown in midi's settings Modules tab | your module |
| damage over time, a bonus to damage, an advantage flag | the effect keys (`flags.midi-qol.OverTime`, `DamageBonusMacro`, `flags.midi-qol.advantage.*`) | the effect |
| test any of the above | `workflowOptions.fixedDice`, `MidiQOL.useTrace(workflow)` (the steps that ran and who changed them) | your tests |

Rules of thumb:

- A hook can watch and stop; it can't change what midi does next. If you are setting workflow fields from a hook to
  steer midi, you want a step change.
- A step change is data that survives a reload (it is stored on the use's card); a hook or a macro holding state
  between passes doesn't.
- Narrowest wins for replace and remove (the call, the activity, the item, then global); inserts and wraps all run.
- Prefer a service over a step change when the question is "what is the answer" (is the target in cover, how far),
  and a step change when it is "what happens next".
- Content (items, effects) uses onUse macros and effect keys; modules use hooks, steps and services. A later milestone
  (M24's conversion) reads the old content forms as one entry format; until then they all work.

## A new activity type

midi adopts any activity type whose policy says it is automated: its uses run midi's workflow, its card gets midi's
buttons, its sheet gets midi's tab. A dnd5e type midi doesn't know, or a module's own, needs:

```js
Hooks.once("setup", () => MidiQOL.registerActivityPolicy("my-module.ritual", {
  automated: true,
  // dnd5e does more after the use (places a template, summons, opens a dialog): true leaves those to dnd5e
  subsequentActions: activity => false,
  // Where midi restarts a use a check stopped and the user retried: "preUseActivity" (default), "preUseLinkedSpell"
  // for a type that hands its use to a spell, false for none
  useRestart: "preUseActivity",
  // Optional: can be another activity's pair; never one; can be triggered by another activity; forced target confirmation
  possibleOtherActivity: false, neverOtherActivity: false, triggerable: true
}));
```

Registering it after midi's setup is fine: the type is adopted then. Which steps act for the type follows from its
fields (an `attack` field brings the attack steps, `damage` the damage roll steps, `save` the save steps); the table
below is generated from those (`MidiQOL.activityTypeStepsMarkdown()`), so a module's type shows in it when its policy
is registered.

## Each activity type against the steps

✔ the step acts for the type; ◐ when the use's data has it (a template or emanation; damage or a save from the activity
it is paired with); blank: the step passes the use on. A module's step declares what it acts on with `actsOn` when it
is registered (`attack`, `damage`, `healing`, `save`, `check`, `utilityRoll`, `area`, `transform`); without it, it acts
for every use. Generated on dnd5e 6.1 (midi-next 15.0):

<!-- activity-type-steps: generated by MidiQOL.activityTypeStepsMarkdown() -->
| step | attack | check | damage | enchant | heal | save | summon | teleport | transform | utility |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| NoAction | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Start | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Transform |  |  |  |  |  |  |  |  | ✔ |  |
| PlaceEmanation | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| AwaitTemplate | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| TemplatePlaced | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| AoETargetConfirmation | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| ValidateRoll | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| PreambleComplete | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| WaitForUtilityRoll |  |  |  |  |  |  |  |  |  | ✔ |
| UtilityRollComplete |  |  |  |  |  |  |  |  |  | ✔ |
| WaitForAttackRoll | ✔ |  |  |  |  |  |  |  |  |  |
| AttackRollComplete | ✔ |  |  |  |  |  |  |  |  |  |
| WaitForDamageRoll | ✔ | ✔ | ✔ | ◐ | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ |
| ConfirmRoll | ✔ | ✔ | ✔ | ◐ | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ |
| RollConfirmed | ✔ | ✔ | ✔ | ◐ | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ |
| DamageRollStarted | ✔ | ✔ | ✔ | ◐ | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ |
| DamageRollComplete | ✔ | ✔ | ✔ | ◐ | ✔ | ✔ | ◐ | ◐ | ◐ | ◐ |
| WaitForSaves | ◐ | ✔ | ◐ | ◐ | ◐ | ✔ | ◐ | ◐ | ◐ | ◐ |
| SavesComplete | ◐ | ✔ | ◐ | ◐ | ◐ | ✔ | ◐ | ◐ | ◐ | ◐ |
| AllRollsComplete | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| ApplyDynamicEffects | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| RollFinished | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Cleanup | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Completed | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| reaction.preAttack | ✔ |  |  |  |  |  |  |  |  |  |
| reaction.attacked | ✔ |  |  |  |  |  |  |  |  |  |
| reaction.hit | ✔ |  |  |  |  |  |  |  |  |  |
| reaction.missed | ✔ |  |  |  |  |  |  |  |  |  |
| reaction.damaged | ✔ | ✔ | ✔ | ◐ | ◐ | ✔ | ◐ | ◐ | ◐ | ◐ |
| reaction.healed | ◐ | ◐ | ◐ | ◐ | ✔ | ◐ | ◐ | ◐ | ◐ | ◐ |
| reaction.save | ◐ | ✔ | ◐ | ◐ | ◐ | ✔ | ◐ | ◐ | ◐ | ◐ |
| reaction.saveSuccess | ◐ | ✔ | ◐ | ◐ | ◐ | ✔ | ◐ | ◐ | ◐ | ◐ |
| reaction.saveFail | ◐ | ✔ | ◐ | ◐ | ◐ | ✔ | ◐ | ◐ | ◐ | ◐ |

- cast: its use is handed to the spell's activity, whose column applies
- forward: its use is handed to the activity it forwards to, whose column applies
- order: not automated (no midi workflow)
<!-- /activity-type-steps -->
