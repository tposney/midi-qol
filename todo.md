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

Not started (checked against Foundry 14.370 and the dnd5e-6.1 branch, 2026-11-15). The request redesign
(`~/Documents/midi-request-redesign-plan-2026-11-10.md`, stage 0 released in 14.6.11) comes first: its request core owns
deadlines and answers, and `User#query` then only replaces the transport.

Foundry 14 has built-in request/response messaging: `CONFIG.queries["midi-qol.name"] = handler` registers a handler
(names must be prefixed), and `user.query(name, data, { timeout })` runs it on that user's client and returns its result;
`User.queryMany(users, ...)` asks several. Gambit's Premades 3.0.5 has moved to it and dropped socketlib (`scripts/utils/queryUtils.js`,
with a `userConnected` hook so a disconnect ends the wait); CAT 0.1.7, Automated Conditions 5e, Aura Effects, Custom D&D 5e,
Enhanced Region Behavior and Simple Cover also register queries (dnd6 world installs, 2026-11-15).

Examine dropping socketlib for it:
- midi registers 61 socketlib handlers (`GMAction.ts` `socketlibSocket.register`); call sites: `executeAsUser` 22,
  `executeAsGM` 5, `executeForUsers` 2, `executeForOthers` 2, `executeForEveryone` 1, `executeForAllGMs` 1. Map each to
  a query; the "for everyone/others" ones to `User.queryMany` or a plain `game.socket` broadcast when no answer is needed.
- GM routing: `preferredActiveGM` (`GMAction.ts`) picks the `User` to query.
- Requester checks: the handler is called with `(data, { timeout, user })`, `user` being the sender, so handlers that
  should only act for an owner check it against the document.
- Permission: querying needs the `QUERY_USER` permission (players have it by default; a GM can remove it). Check it at
  ready and report it (TroubleShooter), or players' requests to the GM fail.
- A query to an inactive user throws at once; check a user asking itself (socketlib runs that locally).
- Timeouts and disconnects: `user.query` takes a timeout; add a `userConnected` hook so a wait ends when the player drops
  (see the player-wait panel).
- Data and results must be JSON-serializable, as with socketlib.
- Macros and other modules call `MidiQOL.socket()` (socketlib's `executeAsGM` etc.): keep a compatibility wrapper, with a
  deprecation warning.
- socketlib would then no longer be a required module (`module.json` requires it; 15 source files use it).
- DAE requires socketlib too, so users only lose the dependency when both move. DAE's use is small (looked at
  2026-11-15, dae-dnd6 6.1 branch): 25 handlers in `GMAction.ts`, 27 call sites, every one `executeAsGM`; three handlers
  are never called over the socket (`test`, `executeMacro`, `itemReplaceEffects`); one (`syncDependents`) reads the
  sender from socketlib's `this.socketdata.userId`, which becomes the query's `user`. DAE's socket is not part of its API.

## Recheck on Monk's TokenBar update: roll card result CSS

`css/styles.css` (end) keeps a two-digit total on one line in Monk's TokenBar roll cards (`.dice-result { flex: 1 0 auto; white-space: nowrap; }`), written for Monk's TokenBar 14.01. When Monk's TokenBar updates, roll a two-digit save through it with the rule removed; drop the rule and its 14.6.10 changelog line if Monk's shows it on one line.
