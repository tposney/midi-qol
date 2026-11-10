# Midi-QOL TODO

## Settings Consistency: allowUseMacro vs allowActorUseMacro

These two settings have inconsistent behavior and should be made more consistent:

### Current Behavior

1. **`allowUseMacro`** - Controls whether on-use macros are executed during workflow processing:
   - When `true`: Item and actor on-use macros are collected and executed at various workflow points:
     - `preItemRoll`, `postRoll`, `preAttackRoll`, `postAttackRoll`
     - `preDamageRoll`, `postDamageRoll`, `preSave`, `postSave`
     - `preTargetDamageApplication`, `postTargetEffectApplication`
     - Target macros: `isTargeted`, `isAttacked`, `isHit`, `isMissed`, `isDamaged`, `isSave`, etc.
   - When `false`: All `triggerTargetMacros()` and `callMacros()` calls in the workflow are skipped

2. **`allowActorUseMacro`** - Controls whether the "Actor On Use Macros" header button appears on actor sheets:
   - When `true`: A gear icon button appears in actor sheet headers allowing configuration of actor-level on-use macros
   - When `false`: The button is hidden

### Inconsistencies

- `allowUseMacro` controls **execution** of macros (both item and actor)
- `allowActorUseMacro` controls **UI visibility** of actor macro configuration
- The item on-use macros config button always appears (controlled separately by `midiPropertiesTabRole`)
- There is no `allowItemUseMacro` setting to control item macro config UI visibility

### Suggested Improvements

- Consider renaming or restructuring these settings to be clearer:
  - One setting for macro execution (or separate settings for item vs actor macro execution)
  - Consistent UI visibility controls for both item and actor macro configuration
- Document the relationship between these settings more clearly

---

---

## DAE Field Evaluation for Enchantments

DAE currently applies field evaluation (e.g., `@abilities.str.mod`, roll data references) for effects on actors, but this doesn't work for enchantments.

### Current Behavior

- Actor effects: DAE evaluates field references in effect values
- Enchantments: Field evaluation is not applied

### Suggested Improvement

- Extend DAE's field evaluation logic to also apply to enchantments
- This would allow enchantment effects to use dynamic references like actor effects do

---

---

## Replace socketlib with Foundry's `user.query` (dnd6)

Foundry 13+ has built-in request/response messaging: `CONFIG.queries[name] = handler` registers a handler, and
`user.query(name, data, { timeout })` runs it on that user's client and returns its result. Gambit's Premades 3.x has
moved to it (with a `userConnected` hook so a disconnect ends the wait); DAS uses it too.

Examine dropping socketlib for it:
- midi registers ~59 socketlib handlers (`GMAction.ts` `socketlibSocket.register`, plus `executeAsUser` / `executeAsGM`
  / `executeForEveryone` call sites); map each to a query (or a plain `game.socket` broadcast for the
  "for everyone" ones, which queries don't cover).
- GM routing: midi's preferred-GM / GM-on-scene choice (`GMAction.ts` around line 420) would pick the `User` to query.
- Requester checks: a query handler isn't told who sent it, so handlers that should only act for an owner must take the
  requesting user's id in the data and check it against the document.
- Timeouts and disconnects: `user.query` takes a timeout; add a `userConnected` hook so a wait ends when the player drops
  (see the player-wait panel).
- Macros and other modules call `MidiQOL.socket()` (socketlib's `executeAsGM` etc.): keep a compatibility wrapper, with a
  deprecation warning.
- socketlib would then no longer be a required module.

## Recheck on Monk's TokenBar update: roll card result CSS

`css/styles.css` (end) keeps a two-digit total on one line in Monk's TokenBar roll cards (`.dice-result { flex: 1 0 auto; white-space: nowrap; }`), written for Monk's TokenBar 14.01. When Monk's TokenBar updates, roll a two-digit save through it with the rule removed; drop the rule and its 14.6.10 changelog line if Monk's shows it on one line.
