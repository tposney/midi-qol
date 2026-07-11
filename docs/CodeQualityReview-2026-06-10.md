# midi-qol-14x Code Quality Review — 2026-06-10

Read-only review of `src/` (~50.6K lines, 59 TypeScript files) at branch `v14`, version 14.0.8, including the uncommitted "Attach Region To" work. Conducted by six parallel review agents covering: Workflow.ts; utils.ts; patching.ts/Hooks.ts/GMAction.ts; activities/ + regionBehaviors/; apps/ + ChatClasses/ + lib/ + settings/undo/sounds/stats; and cross-cutting metrics (type safety, build, packaging, 13x divergence).

`npx tsc --noEmit` passes clean. No changes were made to any source file.

Severity legend: **HIGH** = real bug / security exposure / silently broken feature. **MEDIUM** = latent bug, race, or significant debt. **LOW** = hygiene, dead code, minor inconsistency.

---

## Implementation Status (updated 2026-06-12)

All fixes below were applied to **both** midi-qol-14x and midi-qol-13x, with clean type checks and production builds, and regression coverage in test batch 37 ("Review Fixes") in both test modules (midi-qol-tests, midi-qol-tests-v14x). All work is uncommitted pending review and a Quench run.

**FIXED — §1.1 (all five silently broken features):** sync eval sandbox `evalTypeOrRace` via `mySafeEval`/`asyncMySafeEval` unification (single `mySafeEvalImpl` + `buildEvalSandbox`, legacy `evalTypeOrRaceEval` alias kept); `showReactionAttackRoll` default; `rollSavesBlind` migration typo **plus** reordering all three legacy `=== true` migrations before the `.filter()` calls that would throw on booleans; `ddbglPendingFired` actor resolution; self-trigger getter unified on `isSelfTriggerableOnly` (mixin getter renamed, `useAs` reads it, 7 dead `selfTriggerableOnly` getters deleted — all overrides return false; whether Cast/Forward should return true remains a design decision).

**FIXED — §1.2 (all HIGH, most MEDIUM/LOW):** patching.ts return-in-finally ×2 (doRollAbility also rethrows; overtime-redirect returns now propagate); missing `isOwner` return; `doActivityReactions` `this` + promise antipattern; `MidiDependentsRegistry._preUpdate` returns `allowed`; undo.ts actionQueue await + token-speaker actor-uuid matching; Workflow.ts Map bracket access (debug lines, `DDBGameLogWorkflow.get` now via `getWorkflow`, typed `| undefined`); trigger-cycle detection via visited-uuid set; `simulateAttack` removes the hook it registered; `prepareDamageListItems` awaited; `confirmDamageRollComplete` parens; `_completeItemUse`/`_completeActivityUse` null-actor guards + workflow guard; `convertRollToDamageRoll` rebuilt (DamageRoll has no static fromRoll — mirrors D20Roll.fromRoll); DamageOnlyWorkflow return-before-super → throw; DDBGameLogWorkflow awaits super.WorkflowState_RollFinished; postSummon hook now `Hooks.on` + uuid filter; `?? 0 > 0` precedence ×2; comma-operator residue; `completeActivityUse` `.catch`; VolumetricTemplates guard; autoRerollInitiative `.catch`; TargetConfirmation single-fire callback; DamageApplicationElementMidi return-out-of-finally; ConfigPanel awaits + success-log placement; `#applyEffects` dead branch; `HealActivity` sets workflow.activity. **Roll rehydration (MEDIUM) fixed** via the PersistedFieldStore migration (`Roll.fromData` on restore).

**FIXED — structural (§4 partial, §5.2):** Workflow.ts persisted-accessor migration complete — `PersistedFieldStore` (scalar/tokenSet/roll(s)/damageDetail) replaces 39 hand-rolled accessor pairs (14 scalars, 14 token sets, 5 roll fields, 6 damage details); 9,030 → 8,774 lines; seven genuinely special accessors (`token`, `activity`, `templateUuid`, `isCritical`/`isFumble`, `attackRollModifierTracker`, `otherDamageMatches`) deliberately remain hand-written. utils.ts sync/async eval fork unified.

**DEFERRED — needs intent ruling:** `reactionUsed` vs `reactionsUsed` (utils.ts), midi-sounds `getItemBaseTypes` filter, UtilityActivity `forceDamageDialog !== "always"` vs `"never"`, MidiActivityMixin self-assignment (possible setter-trigger).

**FIXED — §3 attach-region feature (2026-06-12, 14x only — feature is 14x-only):** Spirit Guardians JSON `attachToken` moved to the top-level `regionBehavior` schema field (packs recompiled); option (a) back-compat — `"default"` now means pre-feature behavior (auto-placed emanations follow the caster, other templates stationary), no migration needed; attach resolution unified in `_attachRegionActivityBehavior` and `processPlacedTemplates` reordered so auto-targeting runs first ("target" mode sees template targets, and the picker dialog no longer blocks the message-creation pipeline); caster resolution unified on `workflow.token ?? getToken(actor)`; shared `attachTokenOptions()` helper replaces the duplicated arrays; `_pendingRegionUpdate` declared on the mixin; attachment-vs-`enabled` interaction documented in code (attachment configures the region, `enabled` gates only the behavior rules). Remaining LOW: the second `<section class="tab">` sharing the targeting `data-tab` is unchanged (works today; flagged as fragile).

**INVESTIGATED, DEFERRED — §2 GM socket hardening (2026-06-13, decision: option A — leave `canCall` advisory, no code change):** the bypass is real (socketlib global + public `modules` Map → raw `executeAsGM` reachable by any macro), but mirroring `canCall` on the GM was traced and found unsafe — its "denied" group is dormant/mislabeled and contains player→GM internal RPCs (over-time, undo, stats) that would break. The real fix is per-operation ownership checks on the mutators (option B), deferred to its own design pass. Outstanding security gaps documented in §2 → "Outstanding".

**FIXED — v14 deprecation cleanups (2026-06-16, 14x only; surfaced during Quench testing, not part of the original review):** actor On-Use Macros config used the removed Handlebars `select` helper (crashed on "+"); `ChatMessage.applyRollMode` → `applyMode` at the 3 utils.ts sites (with a legacy→message-mode mapper, since midi still receives legacy rollMode from dnd5e/core); `game.user.can("TEMPLATE_CREATE")` → `"REGION_CREATE"` (MidiActivityMixin.ts:1811). The applyMode static and REGION_CREATE permission aren't in fvtt-types yet, so each uses a precise typed cast (not `as any`/`@ts-expect-error`).

**NOT STARTED — v14 deprecation: migrate off `CONST.DICE_ROLL_MODES` (task B, deadline v16).** `CONST.DICE_ROLL_MODES` and its `publicroll`/`gmroll`/… values, `CONFIG.Dice.rollModes`, and the core `rollMode` client setting are all deprecated in v14 (since 14, until 16) in favour of `CONFIG.ChatMessage.modes` (keys `public`/`gm`/`blind`/`self`/`ic`) + the core `messageMode` setting. midi uses the legacy vocabulary in ~15+ sites (`CONST.DICE_ROLL_MODES.*` comparisons, `game.settings.get/set("core","rollMode")` at patching.ts:594-600/851-852, `message.rollMode`/`roll.options.rollMode` threading). The 2026-06-16 fix above only addressed the 3 `applyMode` call sites with a boundary mapper; the module-wide migration is deferred. Caveats: there is no frozen CONST for message modes (they're `CONFIG.ChatMessage.modes` string keys), and dnd5e 5.3/core still emit legacy values on `roll.options.rollMode`/`message.rollMode`, so midi must keep accepting legacy at its inbound edges — the migration is "use new values internally + map only at dnd5e/core boundaries," and needs a 5.3 data-flow audit (a stray `=== "blindroll"` left behind silently breaks blind rolls). "Converge, don't coexist."

**NOT STARTED:** §1.3 missing awaits / §1.4 swallowed exceptions; GMAction double-roll on save timeout; vitality setTimeout; pre-check `removeWorkflow` no-op leak; `checkOverTimeSaves`; remaining structural work (utils.ts split, `processUndoDamageCard`, activities dedup, dead-file removal); type-suppression burndown; dead-code/hygiene sweep; 13x↔14x drift tooling.

---

## 1. Likely Bugs

### 1.1 Silently broken features

| Sev | Location | Finding |
|---|---|---|
| HIGH | settings.ts:682 | `if (!configSettings.showReactionAttackRoll === undefined)` — `!x` is boolean, never `undefined`; the `"all"` default never applies. Should be `configSettings.showReactionAttackRoll === undefined`. |
| HIGH | settings.ts:690 | Migration writes misspelled `rollSavessBlind` (double-s). The legacy `rollSavesBlind: true → ["all"]` migration silently does nothing (check/skill variants at 686, 694 are correct). |
| HIGH | chatMessageHandling.ts:149-151 | `ddbglPendingFired`: `token` is a placeable (`.object`), so `token instanceof TokenDocument` is never true → `actor` always undefined → always bails with "could not find actor". The entire DDB Game Log pending path is dead. Compare `processCreateDDBGLMessages:215-216` which does it correctly. |
| HIGH | MidiActivityMixin.ts:298 + subclasses | Three-way naming chaos for the self-only-trigger getter: mixin defines/reads `selfOnlyTriggerActivity` (read in `useAs` at 625); 7 subclasses define `selfTriggerableOnly` (AttackActivity.ts:723, SaveActivity.ts:138, DamageActivity.ts:52, HealActivity.ts:49, UtilityActivity.ts:78, SummonActivity.ts:68, TransformActivity.ts:133) — read by nothing; 4 define `isSelfTriggerableOnly` (CastActivity.ts:122, ForwardActivity.ts:64, CheckActivity.ts:143, ContestedCheckActivity.ts:114) — read only by the sheet (MidiActivityMixin.ts:2374). The documented Cast/Forward self-trigger-only behavior (docstring 294-297) cannot occur. |
| HIGH | utils.ts:6160 vs 6212 | Sandbox key mismatch: async sandbox exposes `evalTypeOrRace`, sync sandbox exposes `evalTypeOrRaceEval`. Conditions using `evalTypeOrRace(...)` silently fail (→ errorReturn) under sync evaluation. Sync sandbox also lacks `confirm`/`contestedRoll`/`sizeNumeric`. Direct consequence of the `mySafeEval`/`asyncMySafeEval` duplication (§5.2). |

### 1.2 Correctness / control flow

| Sev | Location | Finding |
|---|---|---|
| HIGH | patching.ts:896-907, 1584-1589 | `return result` inside `finally` in `doRollSkill` swallows the catch's `throw err`; `doRollAbility` has the same shape (its catch doesn't even rethrow) — failed rolls silently return `undefined`/empty to dnd5e callers. `rollToolCheck` does it correctly; the other two should match. |
| HIGH | MidiActivityMixin.ts:642-644 | Missing `return` after ownership check: `if (!this.item.isOwner) { ui.notifications?.error(...) }` shows the error then **proceeds to use the item anyway**. dnd5e's original returns here (verified against dnd5e source). |
| HIGH | activityHelpers.ts:104-124 | `doActivityReactions` is a module-level exported function but passes `item: this` / `sourceItemUuid: this?.uuid` (line 113) — `this` is `undefined` in ESM, so reactions triggered from `AttackActivity.configureAttackRoll` (AttackActivity.ts:625) get `item: undefined`. Also uses the `new Promise(async resolve => ...)` antipattern (swallows rejections). |
| HIGH | lib/MidiDependentsRegistry.ts:201-219 | `_preUpdate` captures `const allowed = await super._preUpdate(...)` but the early-exits at 206/207 `return true` instead of `return allowed` — re-allows updates another mixin vetoed, in the common case (change not touching `flags.dnd5e.dependentOn`). |
| HIGH | undo.ts:420 | DAE actionQueue add for re-created effects is NOT awaited (every other queue use at 390, 401, 409, 431, 436 is). The subsequent `updateEmbeddedDocuments("ActiveEffect", ...)` at 434-438 can race ahead of creation; `undoWorkflow` can complete before the actor is restored. |
| HIGH | Workflow.ts:8632-8634 | `DDBGameLogWorkflow.get()` returns `Workflow.workflows[id]` — `workflows` is a `Map`; bracket access always returns undefined. Same broken pattern at 228-229, 1825, 1831. |
| HIGH | Workflow.ts:3164-3172 | Triggered-activity cycle detection (`WorkflowState_Completed`) only detects cycles returning to the *original* activity. An indirect cycle (A→B→C→B) never terminates — hangs the workflow. Needs a visited-set. |
| HIGH | Workflow.ts:8794/8802 | `DummyWorkflow.simulateAttack` registers `Hooks.on("dnd5e.rollAttack", ...)` but removes `Hooks.off("preUpdateItem", hookId)`. The rollAttack hook leaks forever and keeps zeroing `ammoUpdate` for matching items. |
| HIGH | GMAction.ts:1673 | `prepareDamageListItems` called without `await` in `createPlayerDamageCard`; `templateData.damageList.length` checked on the next line. Works only while the loop stays synchronous — a target with a video token texture (`await game.video.createThumbnail`, 1567-1568) yields, and the player damage card renders empty/partial. |
| MEDIUM | Workflow.ts:748-753, 1028-1033 | Workflows restored from chat-card flags assign persisted JSON (via `toJSON()`) directly to roll backing fields with no `Roll.fromData()`. A workflow reconstructed via `fromChatCardUuid` (276) has objects lacking `.dice`, `.reroll()` — `processAttackRoll` (6894) / `addRollTo` would fail. |
| MEDIUM | Workflow.ts:7670 | `convertRollToDamageRoll` repair path: `return new DamageRoll.fromRoll(roll.formula, {}, { type })[0]` — `new` on a static method, formula string where a Roll is expected, `[0]` on a non-array. The "fix bad input" branch itself throws. |
| MEDIUM | Workflow.ts:8736 | `DDBGameLogWorkflow`: `super.WorkflowState_RollFinished()` not awaited — fires expiries/hooks/macros/chat updates unawaited then returns `Suspend`; races with subsequent state handling. |
| MEDIUM | Workflow.ts:1723-1727 | `Hooks.once("dnd5e.postSummon")` is unfiltered — a concurrent summon workflow can consume another's hook and capture the wrong `summonedCreatures`. Cleanup of `postSummonHookId` is scattered across 4 places (1830, 3134, 3242, 8735). |
| MEDIUM | Workflow.ts:8327 | `DamageOnlyWorkflow` constructor has a `return;` before `super()` — would throw ReferenceError; currently unreachable (`new Item(...)` always truthy) but a landmine. |
| MEDIUM | MidiActivityMixin.ts:878 | `if (autoConsume.length ?? 0 > 0)` parses as `length ?? (0 > 0)`; an empty error array behaves like success. Same precedence accident at Workflow.ts:6776 (`expiredEffects?.length ?? 0 > 0` — works only because 0 is falsy). |
| MEDIUM | MidiActivityMixin.ts:1495-1497, 1529-1531 | `preTargetingChecks`/`preChatChecks` define a local `removeWorkflow = (workflow) => { return false; }` — a no-op despite the name. Failed pre-checks leave the workflow registered in `Workflow.workflows` (created with `storeWorkflow: true` at 665) — a leak. Contrast `postChatCardChecks` (1664-1672) which actually removes + refunds. |
| MEDIUM | utils.ts:6879 | `removeReactionUsed` "safety net" writes `reactionUsed: 0` (singular) but all readers use `reactionsUsed` (plural — 6800, 6887, 6891, 6895): the counter reset is a no-op. Verify intent. |
| MEDIUM | utils.ts:2412-2416 | `completeActivityUse`: `activity.use(...).then(...)` inside `new Promise` with no `.catch` — a rejection is unhandled and the wrapping promise hangs until the `maxWait` timeout (2407). |
| MEDIUM | GMAction.ts:752-795, 969-999 | Double-roll on player save timeout: when `playerSaveTimeout` fires, a fast-forwarded roll resolves the promise, but the still-open dialog roll proceeds independently — both rolls execute and both can create chat messages. |
| MEDIUM | undo.ts:177-190 | `createChatMessage` hook: `currentUndo.allTargets` is keyed by **actor** UUID (queueUndoData:216, startUndoWorkflow:122) but the hook checks `allTargets.has("Scene.X.Token.Y")` for token speakers — never matches; chat cards from token speakers aren't attached to the undo entry. |
| MEDIUM | apps/TargetConfirmation.ts:277-295, 343-347 | Callback fires twice: `#onRoll` calls `doCallback(true)` then `close()`, and `close()` unconditionally calls `doCallback(false)` again (`#onCancel` fires twice with `false`). Safe only while consumers are idempotent promise-resolvers. Add a `submitted` guard (cf. ConditionEditor/OverTimeEditor). |
| MEDIUM | midi-sounds.ts:101-116 | `getItemBaseTypes` compares a weaponType key string to a document: `if (baseType !== baseItem && ...)` is always true, so the filter degenerates to "skip every item with a `type.value`" — looks inverted; `weaponBaseTypes` likely wrong. |
| MEDIUM | chatMessageHandling.ts:56-70 | `checkOverTimeSaves`: inner async `func(...)` invoked without `await` so the try/catch can't catch rejections; `finally { return true }` would swallow even a synchronous throw (TODO at line 31 acknowledges). |
| MEDIUM | Hooks.ts:1903-1906 | Vitality update queued via `setTimeout(..., 100)` to run "after the actor update" — wall-clock ordering, unhandled rejection if the update fails, wrong if the update takes >100ms. |
| MEDIUM | UtilityActivity.ts:113 vs MidiActivityMixin.ts:933 | Dialog-skip check uses `forceDamageDialog !== "always"` where the parallel mixin code uses `!== "never"` for the same situation — one inverts the intent. Lines 126/129 can double-toggle `dialog.configure`; `!!!x` is cryptic. |
| LOW | Workflow.ts:4633-4639 | Comma-operator residue: `newFlags = {...}, { overwrite: true, inplace: false }` — dead options object from a removed `mergeObject`. |
| LOW | GMAction.ts:238-239 | `confirmDamageRollComplete` mixes `||`/`&&` without parens — parses as `A || (hasHits && B && C)`; deserves parentheses. |
| LOW | GMAction.ts:558, 567 | `_completeItemUse`: `if (actor.actor)` throws TypeError when `fromUuid` returns null; `workflow.getMacroData()` throws if workflow undefined (the `_completeActivityUse` twin guards at 548). |
| LOW | Hooks.ts:33-37 | `template3dUpdatePreview` hook dereferences `VolumetricTemplates` unconditionally — throws if fired without that module. |
| LOW | Hooks.ts:397-409 | autoRerollInitiative: `combat.rollInitiative(...).then(...)` with no `.catch`. |
| LOW | MidiActivityMixin.ts:782 | Self-assignment `usage.workflow.activity = usage.workflow.activity;` — if a deliberate setter-trigger it needs a comment; otherwise a typo. |
| LOW | MidiActivityMixin.ts:402-435 | `#applyEffects`: workflow nullity fully handled at 405-410 so the `else` at 431-433 is unreachable; `const result =` at 422 unused. |
| LOW | HealActivity.ts:42-45 | `#rollHealing` is the only chat-action handler that doesn't set `workflow.activity = this` before delegating — inconsistent with every sibling. |
| LOW | EnchantActivity.ts:40-42 | Mixin docstring (MidiActivityMixin.ts:283) says Enchant is non-triggerable; `isTriggerableActivity` returns `true`. |
| LOW | ChatClasses/DamageApplicationElementMidi.ts:136-139 | `return options` inside `finally` swallows any rethrow path (works today because catch records the error). |
| LOW | apps/ConfigPanel.ts:784, 790, 431-433 | `importSettingsFromJSON` not awaited (success reported before settings applied); `config.version` never defined for quick-settings files; `#onSubmit` fires `reloadConfirm` without awaiting `game.settings.set`. |

### 1.3 Missing awaits (fire-and-forget where callers expect completion)

- Workflow.ts:2526 `displayUtilityRolls()`; 7904 `displayHitTargets(false)` (ActiveDefence); 3348/3359/3400 `sc.setFlag(...)` in loops; 2122 `performThrottledUpdate` (possibly intentional — undocumented).
- utils.ts:4437/4457 `removeInvisibleCondition`/`removeHiddenCondition` — callers awaiting `removeInvisible`/`removeHidden` return before the condition is removed; utils.ts:740 `unTimedExecuteAsGM("updateUndoChatCardUuids", ...)`.
- Hooks.ts:650, 671, 693, 719 — `expireEffects` un-awaited in `midi-qol.RollComplete` handler (inconsistent with surrounding awaits).
- MidiActivityMixin.ts:768, 774, 778 and CastActivity.ts:91/102 — `Workflow.removeWorkflow` (async, Workflow.ts:1819) fire-and-forget.
- MidiActivityMixin.ts:2427-2429 — `_onRender` fires `this.activity.update(...)` without await.
- Intentional fire-and-forget rolls without rejection handling (suspend/resume design makes not-awaiting correct, but rejections vanish): Workflow.ts:2333 `rollAttack`, 2448/8581 `rollDamage`, 8450 `activity.use` in TrapWorkflow constructor. A `.catch(err => TroubleShooter.recordError(...))` would help.

### 1.4 Swallowed exceptions

- Workflow.ts:2688-2693 — `checkOtherActivityConsumption` catch treats *every* exception as "user cancelled"; no logging, no `TroubleShooter.recordError` (the only fully silent catch in the file).
- MidiActivityMixin.ts:556-558 — `#placeTemplate` catch treats every exception as "user cancelled"; real errors in `fromActivity`/`drawPreview` vanish.
- AttackActivity.ts:568-569 — `rollAttack`'s catch logs and falls through, returning possibly-undefined `rolls` while the workflow may stay suspended forever. Mixin `rollDamage` catch (1019-1022) swallows and returns `result ?? []` — same hang risk.
- Workflow.ts:4346-4364 — `callMacros`: redundant double error layer (`.catch` wrappers + `Promise.allSettled` + `results.map(p => p.value)`) — a hypothetical rejection silently maps to `undefined`.

---

## 2. Security: GM Socket Surface (GMAction.ts)

**The most significant finding of the review.**

| Sev | Location | Finding |
|---|---|---|
| HIGH | GMAction.ts:17-82 vs 93-165 | `SaferSocket.canCall()` runs **on the calling client only** (via `MidiQOL.socket()`, midi-qol.ts:938). ~60 handlers are registered on the raw `socketlibSocket`; any player who can run a script macro can call `socketlib.modules.get("midi-qol").executeAsGM(...)` directly, bypassing SaferSocket entirely. |
| HIGH | GMAction.ts:360-632 | GM-side handlers mutate arbitrary documents with zero ownership/permission checks: `updateActor` (571), `updateItems` (375), `updateEffects` (368), `createActor` (581), `createEffects` (360), `deleteToken` (587), `toggleTokenHidden` (594), `deleteEffectsByUuid` (602), `removeEffectUuids` (337), `deleteItemEffects` (632), `_gmSetFlag`/`_gmUnsetFlag` (442-456), `_setupRegion` (2599 — region behaviors can include script-type behaviors). |
| HIGH | GMAction.ts:552-569, 536-550 | `_completeItemUse` constructs `new CONFIG.Item.documentClass(itemData, ...)` from raw player-supplied data and runs `completeItemUse` on the GM client — `itemData` can carry `flags.dae.macro`/onUse macro command text = **arbitrary JS execution as GM**. `_completeActivityUse` has the same exposure via activity macros on any UUID the player names. |
| HIGH | GMAction.ts:309-311 | `paranoidCheck()` is a stub — always returns `true`. The `configSettings.paranoidGM` setting consulted at 319/343 does nothing. |
| MEDIUM | GMAction.ts:143-145 | Trusted-player gate: warns then `return true; // TODO change this to false in the future` — the dangerous handler group is open to all players even via SaferSocket. |
| MEDIUM | GMAction.ts:207-212 | `_removeEffect` deletes any ActiveEffect by player-supplied UUID ("Allow anyone to call this") — no origin/ownership validation. |
| MEDIUM | GMAction.ts:218-227 | `cancelWorkflow`: on workflowId mismatch, deletes an arbitrary ChatMessage by player-supplied `itemCardUuid`. |
| LOW | GMAction.ts:400 | `timedExecuteAsGM` sets `data.playerId = game.user?.id` — payload-supplied (self-reported) identity rather than socketlib's authenticated sender metadata. |
| LOW | GMAction.ts:109 | `canCall` whitelists `"log"`, which is never registered as a handler. |

**Recommendation:** relocate authorization into each GM-side handler (or a wrapper applied at `socketlibSocket.register` time); use socketlib's sender metadata, not payload `playerId`; add `actor.testUserPermission(sender, "OWNER")` to every document-mutating handler; implement or delete `paranoidCheck`; flip the trusted-player TODO.

### Investigation 2026-06-13 — decision: leave advisory (option A), no code change

Confirmed the bypass is real: socketlib is a global (`window.socketlib`, socketlib.js:19), `socketlib.modules` is a public Map (line 27), and `registerModule("midi-qol")` returns the existing live socket (lines 33–35). So `SaferSocket.canCall` is **advisory only** (a round-trip-saver on midi's own entry point), not a security boundary — a player macro reaches the raw `executeAsGM` regardless.

The proposed fix — mirror `canCall` on the GM side, blocking the denied group — was traced and found **unsafe**, so it was abandoned:

- midi's own `unTimedExecuteAsGM` (GMAction.ts:416) uses the **raw** socket, so every internal GM call arrives with the *originating player* as sender.
- The `canCall` "denied/default" group is **mislabeled and dormant**: those handlers never route through `canCall` today, and several are player→GM internal RPCs **by design**. Proof: `doOverTimeEffect` (utils.ts:1175) has an explicit `else → unTimedExecuteAsGM("gmOverTimeEffect", …)` branch for the non-GM caller. The undo system (`startUndoWorkflow`, `queueUndoData`, `updateUndoChatCardUuids`, `undoTillWorkflow`, …) and roll stats (`removeStatsForActorId`, `saveAllStats`) are the same shape, driven from player-owned workflows. Only `deleteEffectsByUuid` has no call site (safe-but-pointless to block).
- Blocking the denied group on the GM would therefore break over-time effects, undo capture, and stats for player-initiated actions, while closing nothing real.
- The genuinely dangerous surface is a *different* set — the arbitrary mutators in the **trusted** group (`updateActor`, `createActor`, `deleteToken`, `deleteItemEffects`, `updateItems`, `updateEffects`, `_gmSetFlag`/`_gmUnsetFlag`, `_setupRegion`) plus `_completeItemUse`. These can't be secured by an allow/deny verdict on *(sender, handler)*: a player's legit workflow and a malicious macro arrive identically. The only real discriminator is **what the operation touches** (ownership/permission check on the target document inside each mutator) — see Outstanding below.

### Outstanding (deferred — not addressed by option A)

1. **The bypass surface is unmitigated.** Any player macro can call the raw mutators (`updateActor`, `createActor`, `deleteToken`, `deleteItemEffects`, `updateItems`/`updateEffects`, `_gmSetFlag`/`_gmUnsetFlag`, `_setupRegion`) and `_completeItemUse` (arbitrary JS-as-GM via `flags.dae.macro` in player-supplied itemData) and have the GM execute them with no ownership check.
2. **The real fix is per-operation authorization, not per-handler allow/deny** (review option B): add `testUserPermission(sender, "OWNER")` (or a workflow-legitimacy signal) inside each mutating handler, using socketlib's authenticated `this.socketdata.userId` rather than the self-reported payload `playerId`. Delicate where a player legitimately mutates a *target* they don't own (damage application, over-time on enemies) — those need a workflow-legitimacy token, not raw ownership. Deserves its own design pass.
3. **`canCall` is mislabeled.** Its "denied/default" group is really "internal player→GM RPCs that bypass canCall"; its "trusted" group is "dangerous mutators." If `canCall` is ever made authoritative, the internal-RPC handlers must move to a safe category first, and the mutators need real authorization rather than the permissive `isTrusted` warn-and-allow.
4. **`paranoidCheck` stub** (always `true`) and the trusted-player `return true // TODO` remain — both untouched.
5. **`_removeEffect`/`cancelWorkflow`** delete documents by player-supplied UUID with no ownership validation (still open).

---

## 3. Uncommitted "Attach Region To" Feature

| Sev | Location | Finding |
|---|---|---|
| HIGH | pack-src/sampleitems/Spells/3rd Level/Spirit_Guardians_cQRmwQcPULIjCach.json (~line 282) | `"regionBehavior": { "attachToken": "caster" }` is nested **inside `midiProperties`**, but the schema (MidiActivityMixin.ts:243) defines `attachToken` on the top-level `regionBehavior` SchemaField (which the item also has, without `attachToken`). The SchemaField silently strips the unknown key — Spirit Guardians will NOT follow the caster. |
| HIGH | MidiActivityMixin.ts:1903-1907 | Silent regression for existing content: old code unconditionally attached non-stationary emanation regions to the caster; new code only attaches when `attachToken` is `"caster"`/`"target"`, and the schema initial is `"default"` (stationary). Every existing emanation item silently stops following the caster. Needs a `"caster"` default for emanations or a migration. |
| MEDIUM | MidiActivityMixin.ts:1905 vs 1923; Workflow.ts:1945 vs 1949 | "target" mode resolves before targets exist: attach id resolved before `selectTargetsFromTemplates`; in the AoE path `_attachRegionActivityBehavior` runs before `selectAllTemplateTargets`. `_resolveAttachTokenId` (1819-1833) sees pre-template targets — stale or zero for exactly the intended case. |
| MEDIUM | MidiActivityMixin.ts:1835-1858 via 2079 | `_promptAttachTargetPicker`'s `DialogV2.prompt` is reachable from `_usageChatContext` — a modal dialog suspending dnd5e's message-creation pipeline on user input. |
| LOW | MidiActivityMixin.ts:1903, 2051 | `attachToken` applies even when `regionBehavior.enabled` is false. Possibly intentional, but housing the field inside the `regionBehavior` schema + exposing it in two UIs invites confusion. |
| LOW | MidiActivityMixin.ts:2408-2412 + RegionBehaviorEditor.ts:67-71 | `attachTokenOptions` array duplicated verbatim — extract one helper. |
| LOW | MidiActivityMixin.ts:1819 vs 1863 | Caster resolution inconsistency: `_resolveAttachTokenId` uses `getToken(this.actor)`; the emanation path uses `workflow.token ?? getToken(actor)` — differs for multi-token actors. |
| LOW | templates/activity/parts/region-behavior-targeting.hbs | Renders a second `<section class="tab">` with the same `data-tab` as the targeting section — works, but fragile against Foundry tab-handling changes. |
| LOW | MidiActivityMixin.ts | `_pendingRegionUpdate` is an undeclared ad-hoc instance property — lost if `_placeEmanationTemplate` / `_attachRegionActivityBehavior` ever run on different activity clones (nothing enforces that they don't). |

Lang keys (lang/en.json:2336-2343) and both new templates exist; the old DOM-injection `_onRender` code was cleanly replaced; `writeRegion` batching is sound.

---

## 4. Workflow.ts (9,030 lines)

8 classes in one file: `Workflow` (205-7833, ~7,600 lines) plus `SavesFirstWorkflow`, `ActiveDefenceWorkflow`, `UserWorkflow`, `DamageOnlyWorkflow`, `TrapWorkflow`, `DDBGameLogWorkflow`, `DummyWorkflow`, plus ~600 lines of type definitions.

### Largest methods

| Method | Lines | Size |
|---|---|---|
| `checkHits` | 7223-7630 | ~408 |
| `WorkflowState_ApplyDynamicEffects` | 2768-3110 | ~343 |
| `WorkflowState_RollFinished` | 3261-3495 | ~235 |
| `checkSaves` | 6436-6641 | ~206 |
| `checkActiveAttacks` (ActiveDefence) | 8018-8211 | ~194 |
| `checkAttackAdvantage` | 3509-3673 | ~165 |
| `triggerTargetMacros` | 3865-3994 | ~130 |
| `processAttackRoll` | 6892-7023 | ~131 |
| `getMacroData` | 4196-4320 | ~125 |
| `createPlayerChatSaveRequest` | 5869-5986 | ~118 |
| constructor | 1620-1731 | ~111 |

### Duplication

- **HIGH — Persisted-accessor boilerplate (~1,100 lines, 284-1500)**: ~15 identical "token Set ⇄ uuid array in chat-card flags" getter/setter pairs (`targets`, `hitTargets`, `hitTargetsEC`, `saves`, `failedSaves`, `fumbleSaves`, `criticalSaves`, `advantageSaves`, `superSavers`, `semiSuperSavers`, `targetsCanSee/Sense`, `tokenCanSee/Sense`, `otherDamageMatches`), ~12 identical scalar pairs, 6 `DamageDescription[]` pairs, 4 `Roll[]` pairs. One bug fix (e.g. Roll rehydration) currently needs ~5 edits.
- **HIGH — Duration-conversion + expiry-linked-effect creation ×3**: `setupTemplateCleanup` (2022-2058), summoned-creature cleanup (3343-3405), transform cleanup (3407-3475) — same `convertDuration` → effectData → `createEmbeddedDocuments` → `setFlag("dnd5e","dependentOn")` shape, each carrying ~7 `@ts-expect-error fvtt-types v14 duration` annotations.
- MEDIUM — Two byte-for-byte reaction-AC-recompute blocks in `checkHits` (7332-7354 vs 7373-7393).
- MEDIUM — `setDamageRolls`/`setBonusDamageRolls`/`setOtherDamageRolls`/`setUtilityRolls` (7640-7795): four copy-paste variants differing only in field names/render fn/rollType string.
- MEDIUM — `triggerTargetMacros` (3865-3994): 13 near-identical `result.push(...await this.callMacros(...))` blocks; plus ~20 paired `callMacros(item) + if (this.ammunition) callMacros(ammunition)` invocations scattered through the state methods.
- MEDIUM — `displaySaveTargets` vs `displaySaves` (flagged by the code's own TODO at 4917).
- MEDIUM — `SavesFirstWorkflow.WorkflowState_SavesComplete` (7844-7864) re-implements base postSave/allMissed logic (2387-2400) instead of sharing.
- `checkOtherActivityConsumption` (2649-2728): "consumption declined" cleanup triple appears 5×; consumed/scaling persistence block 2×.
- `processAttackRollBonusFlags` (7120-7178): two near-identical bonusFlags filter pipelines.
- Image/thumbnail resolution duplicated 5× (3283-3290, 4819-4826, 5122-5136 = the extracted helper `getTargetPortraitImage`, but 7524-7531 and 7970-7977 don't use it).
- Duplicate identical else-if branches at 7512-7517 and 7955-7962. Duplicate `await this.processAttackRoll()` at 2340/2349 — intentional (re-process after preCheckHits macros) but needs a comment.

### State management smells

- Static `Workflow.#workflows` map (210): with `useWeakReferences` off, workflows are retained until `removeWorkflow` is explicitly called; removal is scattered, abort/cleanup paths don't always delete.
- Global mutation from constructor (1703): `MidiQOL.MQdefaultDamageType = this.defaultDamageType` — concurrent workflows fight over a module global (read back at 4136, 7662, 8703).
- `this.macroPass`/`this.tag` mutated per `callMacros` call (4337-4338): nested/interleaved macro passes observe the wrong pass name.
- **Chat-card content managed by regex find/replace** in ~15 methods (1748-1808, 2219, 2315, 2453, 3312-3329, 4627, 4655, 4684-4687, 4734, 4743-4770, 4865, 4996, 5051, 6732-6740, 8216): brittle coupling to template HTML — the single biggest maintainability hazard outside class size.
- `workflowOptions` set twice in constructor (1675 persists, 1691 rebuilds/overwrites) — redundant persistence churn.
- `saveRequests` keying inconsistent: token.id for Monks/player-chat (6063, 5889), actor.uuid for Flash/Epic (6075, 6087).
- `attackRollModifierTracker` lazy-restore flags (631-806) create order-of-first-access dependencies — currently handled, but subtle.

### Dead code / debug

- 1825: `console.warn(\`removeWorkflow deleting ${id}\`, ...) // TODO remove` — fires on every workflow removal in production (and the map lookup is bracket-broken).
- 3158: unguarded `warn(...)` duplicating the `debugEnabled`-guarded line 3157.
- Dead/commented blocks: `macroDataToObject` (4176-4187, "TODO: Kill?"), 8586-8597, 568-579, 6880, empty `if (configSettings.undoWorkflow) { }` (2531-2533), empty `1Reaction` if-body (3966-3967), no-op `processAttackRoll` override (7887-7889), 50-line commented reaction block (8101-8110).
- 40 TODO/FIXME markers, including `// TODO This is wrong` on abort handling (3483, 3486).

### Positives

No v1 Dialog/Application; `chooseEffects` uses `DialogV2.wait`; `renderChatMessageHTML` used; deprecation shims use proper `logCompatibilityWarning`. The save-request machinery (5654-6435) is already well-refactored — a good template.

---

## 5. utils.ts (9,780 lines)

~280 exports across ≥12 unrelated domains; module-level mutable state throughout (`updatesCache` :8965, `_markFlankingPromise` ~:7635, `_userInitiatedTarget` + target save stack :9504-9536); import cycles with Workflow.ts/GMAction.ts/Hooks.ts.

### Domain clusters (split candidates)

| Domain | Lines |
|---|---|
| Damage application (`getTraitMult`, `applyTokenDamage(Many)`, `processDamageRoll`, save multipliers) | 24-784 |
| Save/check requests | 815-985 |
| Custom flags + over-time effects | 985-2318 |
| Activity/item use API (`completeActivityUse`/`completeItemUse`) | 2318-2552 |
| Vitality / incapacity | 2571-2685 |
| Geometry: distance, range, cover, AC | 2685-4073 |
| Settings-derived getters | 4073-4266 |
| Nearby/conditions | 4266-4434 |
| Optional-bonus dialog subsystem (`RollModifyDialog`, `bonusDialog`) | 4588-5491 |
| Reactions (`doReactions`, `ReactionDialog`) | 5491-6108 |
| Sandbox eval / condition evaluation | 6126-6700 |
| Action economy | 6788-6960 |
| Hook helpers (`asyncHooksCall(All)`) | 6960-7050 |
| Roll rendering / attribution | 7050-7262 |
| Flanking | 7263-7945 |
| Vision/senses | 7964-8131 |
| Chat-card update cache/throttle | 8953-9043 |
| String-diff algorithm | 9605-9772 |

### Sync/async forks (drift already caused a bug — §1.1)

- HIGH — `evalAllConditionsAsync` vs `evalAllConditions` (6527-6605): 38-line bodies identical except `await`.
- HIGH — `asyncMySafeEval` vs `mySafeEval` (6133-6233): ~90% identical; contains the `evalTypeOrRace` sandbox-key bug.
- MEDIUM — `asyncHooksCallAll` vs `asyncHooksCall` (6960-7034): same loop, only the short-circuit differs.

### Other duplication

- `setReactionUsed` vs `setBonusActionUsed` (6792-6865): structurally identical; already drifted (`effect as any` at :6863 vs `effect.toObject()` at :6825).
- `getOptionalItemUsesItemMatch` vs `getOptionalActivityUsesActivityMatch` (5258-5351): duplicated spec-string parsing.
- `midiRender{Attack,Damage,OtherDamage,BonusDamage,Formula}Roll` (7190-7215): five wrappers, inconsistently async.
- `applyTokenDamage` vs `applyTokenDamageMany` vs `processDamageRoll` (244-451, 517): three parallel "build damage details → createReverseDamageCard" implementations.
- `computeFlankedStatus` vs `computeFlankingStatus` (7421-7607): parallel geometry with duplicated comments.
- `removeInvisibleCondition` vs `removeHiddenCondition` (4440-4478).

### Deprecated API loop

- **HIGH — utils.ts:276**: `applyTokenDamage` (a primary public API) calls deprecated `getSaveMultiplierForItem`, which unconditionally `console.warn`s "deprecated" (:775) and ignores the activity's actual `onSave` setting. Should resolve an activity and use `getSaveMultiplierForActivity`.

### Dead code

- `getItemFromEffectOriginOLD` (9594-9603) — zero references.
- Unused exports: `getIconFreeLink` (8650), `hasCoverStatus` (3822), `reactionsRemaining` (6894), `getLinkText` (8624).
- String-diff subsystem (9605-9772, ~170 lines incl. Myers-style algorithm): sole consumer is one `debugEnabled > 1` log line (:8994). Extract to lib/ or remove.
- "Simulate a slow machine" scaffolding in `_updateAction` (8976-8991): `const updateDelay = 0;` + dead `busyWait` branches.
- Commented-out blocks: 278-281, 1133-1139, 2221-2231, 8262-8272.
- `chackFlanking` typo (:7732) — imported as `chackFlanking as checkFlanking` (Hooks.ts:4).

### Debug leftovers

- **utils.ts:1224** — `console.error("getOvertimeActivity | found activity: ...")` on the **success** path of every over-time tick. Clear leftover.
- utils.ts:1220 — legitimate condition but bypasses `error()`/TroubleShooter conventions.

### Oversized functions (>150 lines)

`bonusDialog` :4895 (357 — also untyped `this` that may be a Workflow or arbitrary object), `RollModifyDialog` :4588 (278), `processDamageRoll` :517 (231), `checkActivityRange` :3559 (226), `gmOverTimeEffect` :2029 (214), `completeActivityUse` :2318 (192), `updateFlankingHighlight` :7756 (185), `doReactions` :5517 (180), `midiCustomEffect` :985 (161), `ReactionDialog` :5947 (161).

### Positives

25 catch blocks consistently use `TroubleShooter.recordError`; no empty catches; no v1 Dialog/Application; `toggleStatusEffect` called on actor correctly.

---

## 6. patching.ts / Hooks.ts

(Roll-swallowing finally bug and vitality setTimeout are in §1.2.)

- **Verified OK**: flanking marking is serialized (utils.ts:7634-7640 promise chain, per CLAUDE.md decision #17); `actorOnUpdate` per-actor semaphore (patching.ts:28-35, 452-480) correctly serializes HP-change handling.
- MEDIUM — Global `rollMode` setting mutation around async rolls (`applyBlindRollMode`, patching.ts:600; restore in `finally`): concurrent rolls on one client can stomp each other; `doRollAbility` restores twice (1573, 1587); a user changing rollMode mid-roll is clobbered. Per-message `messageDetails.rollMode` already exists — the global set looks redundant.
- MEDIUM — Wholesale CONFIG document-class replacement (patching.ts:67-204): `Token/AmbientLight/Region/ActiveEffect/Item/Actor.documentClass` replaced with mixin subclasses — not unregisterable, order-sensitive with other modules doing the same, conflicts silent. Accepted Foundry idiom, but worth acknowledging.
- LOW — `doItemUse` registered MIXED (patching.ts:428) but never calls `wrapped()` on any path — effectively an OVERRIDE; registering as such is more honest to libWrapper conflict detection.
- LOW — `actorWoundedSemaphores` map (patching.ts:28) grows unbounded — entries never removed on actor deletion.
- LOW — `actorOnUpdate` (WRAPPER, 388) defers conventionally-sync `_onUpdate` into a semaphore — other modules' wrappers above midi get deferred too; rejections inside `semaphore.add` unobserved.
- LOW — Module-level throttle timestamps `anchoredMoveTime`/`rangeClampesMoveTime` (patching.ts:2109-2111) shared across all templates.
- Dead code: Hooks.ts:58-80 `preUpdateChatMessage` fully neutered (`&& false`, `try { return true } finally { return true }`); patching.ts:717/905 + 1379/1588 `oldFormat` always false; patching.ts:137-152 16-line commented Wall Height block; commented registrations at 44, 49, 393-394.
- GMAction dead code: 397-404/434-440 `if (false)` branches; 459-482 `_canSense` (registration commented out at 81); 724-733 `traitList` i18n labels immediately overwritten with literals then unused; 1085 leftover perf `console.log` on every damage card.
- LOW — GMAction.ts:1689-1690: `chatData.user` deprecated in favor of `author` (v12+).
- Legacy `rollAbility` flat-argument migration (807-862) carries `until: 13.1.0` — flag for removal.
- **`processUndoDamageCard` (GMAction.ts:1747-2330, ~580 lines)** — worst function in the module: four near-identical apply/reverse + vitality + tempmax + `preApplyDamage`-hook sequences (all-reverse 1751-1801, all-apply 1803-1847, per-row reverse 1855-1900, per-row apply 1903-2058) that have already diverged (all-apply passes `options` to `dnd5e.applyDamage`; per-row passes `calcDamageOptions`), plus a 230-line multiplier-preview listener. Other >150-line functions: `prepareDamageListItems` (GMAction.ts:1393-1630, ~240), `doRollAbility` (~210), `rollAbility` (GMAction.ts:807-1000, ~195), `doRollSkill` (~190), `configureDamage` (patching.ts:1189-1376, ~190), `rollToolCheck` (~150).
- Positives: hook lifecycles in roll wrappers (`Hooks.once` + `Hooks.off` in `finally`) handled carefully; `_preCreateActiveEffect`/`_preDeleteCombat` always call `wrapped()` in `finally`; `rollActionSave` uses `DialogV2.confirm`.

---

## 7. Activities Subsystem

(Self-trigger naming chaos, missing isOwner return, `doActivityReactions` `this`, removeWorkflow no-op, and precedence bug are in §1.)

### Dead files (delete or attic)

- **ContestedCheckActivity.ts** — `setupContestedCheckActivity` never called; if enabled it registers under the **same keys** as CheckActivity (`check`/`"midiCheck"`, lines 18-20), clobbering it; `#rollCheck` (69) reads nonexistent `message._uuid`; commented out of its own actions map (43).
- **OverTimeActivity.ts** — `setupOvertimeActivity` never called; line 90 calls nonexistent `this.removeWorkflow(...)` → TypeError if revived; line 1 `import { templates } from "handlebars"` — stray editor auto-import that would drag the handlebars npm package into the bundle.
- AttackActivity `useWIP` (286-306) — abandoned variant of `use`; `preValidateRollHookId` never assigned.
- TransformActivity `static async #transformActor() {}` (65-67) — empty, unused.
- `blockRoll` (activityHelpers.ts:731-739) — unused. `preActivityConsumptionHook`/`activityConsumptionHook` (126-134) — registered no-ops containing only commented-out `console.error`s.
- `attachActivitySheetHeaderButton` (2440-2455) registered nowhere ("TODO get this working", 2494).

### Mixin/per-type drift & duplication

- MEDIUM — AttackActivity redefines the mixin's `#rollDamage`/`#rollDamageNoCritical`/`#rollDamageCritical` (mixin 571-587 vs AttackActivity 248-267) nearly verbatim — already drifted: mixin's critical passes `critical: { allow: true }`, Attack's does not.
- MEDIUM — `#rollAttack`/`#rollAttackAdvantage`/`#rollAttackDisadvantage` (AttackActivity.ts:149-246): three ~30-line near-identical blocks; the dead-workflow branch already differs subtly (line 227 sets `midiOptions.advantage`; line 194 sets `midiOptions.workflowOptions.advantage`).
- MEDIUM — `otherActivityId`+`otherActivityAsParentType` schema fields duplicated 4× (AttackActivity.ts:113-120, SaveActivity.ts:58-65, CheckActivity.ts:57-64, UtilityActivity.ts:56-63) with inconsistent initials (`""` vs `"none"` — intentional but undocumented).
- MEDIUM — Pre-check options boilerplate triplicated (`preTargetingChecks` 1499-1503, `preChatChecks` 1533-1539, `postChatCardChecks` 1676-1682).
- LOW — Empty `_triggerSubsequentActions(config, results) {}` repeated in 10+ subclasses — define once in the mixin.
- LOW — Save/Check rollMode block copy-pasted (SaveActivity 108-116, CheckActivity 106-114); `damageOnSave` message merge triplicated (SaveActivity 157-162, CheckActivity 150-156, ContestedCheck 121-127); `FriendlySaveOptions` duplicated in two sheets.
- LOW — Dead destructuring of `dataModels.shared` copy-pasted into 4 `defineSchema` bodies — only `DamageField`/`FormulaField` used.
- LOW — Sheet factory inconsistency; most sheets differ only in one PARTS template path.
- Internal use of own deprecated `this.workflow` getter in `messageFlags` (358-360) and `_onChatAction` (609-611) — emits deprecation warnings from midi's own code.

### Long methods

`AttackActivity.rollAttack` ~228 lines (350-577 — 4 hook registrations, ammo, dialogs, DSN, tracker sync in one try block); `MidiActivityMixin.use` ~190 (639-827); `rollDamage` ~137 (892-1028); `preChatChecks` ~134; `_attachRegionActivityBehavior` ~125; `postProcessDamageRoll` ~115; `postChatCardChecks` ~113; `requiresTargetConfirmation` ~100 (activityHelpers.ts:181-282).

The hook-id `Record` + `finally` cleanup pattern in `rollAttack` is good — formalize as a small `withHooks()` utility.

---

## 8. Apps / ChatClasses / lib / settings / undo / sounds

(High-severity items in §1.)

### v1 Application violations (project hard rule)

- settings.ts:13 `LaunchWizardSubmenu extends FormApplication`; settings.ts:36 `ResetSettingsSubmenu extends FormApplication`. FormApplication is on Foundry's deletion schedule. A minimal ApplicationV2 whose `render()` fires the hook and closes works identically for `registerMenu`. These are the only v1 usages in the entire module.
- Dead v1 leftovers inside V2 apps (never invoked): TroubleShooter.ts:113-114 `_updateObject`, 192-196 `_onSubmit`; TargetConfirmationConfig.ts:43-53 `_updateObject` (looks like the save path but isn't — actual persistence is live mutation + `_preClose:89-92`, which also skips `super._preClose`).

### Never-settling dialog promises

`importFromJSONDialog` (ConfigPanel.ts:438-472), `showDiffs` (503-533), `importTroubleShooterDataFromJSONDialog` (TroubleShooter.ts:121-175), `overWriteMidiSettings` (284-316): `new Promise` around `new DialogV2` resolved only in button callbacks — dismissing the dialog leaves the `await` hung forever. `fetchConfigFile` (ConfigPanel.ts:474-482): `reject` never used; failed fetch hangs forever. Use `DialogV2.wait()` (resolves null on dismiss). Also prefer `button.form` over `event.currentTarget?.querySelector("form")` (ConfigPanel.ts:455, TroubleShooter.ts:140).

### settings.ts

- `fetchParams` (664-1046) is ~380 lines of stacked one-shot migrations, re-run on every settings change (`onChange: fetchParams`). Extract a `migrateConfigSettings()` run once at ready — the §1.1 bugs at 682/690 live precisely in this thicket and would have been testable in isolation.
- `PreferredGM` registered twice (readySettingsSetup:1051 and registerSettings:1738).
- `itemRollButtons` hardcoded `false` (874) with its reader still exported — vestigial.
- Self-assignment no-op at 865; `renderSettingsConfig` hook registered inside `registerSettings` (1960-1971) — hidden side effect, possibly redundant given `restricted: true`.
- TroubleShooter's times-up advice (TroubleShooter.ts:670-679 "Effects won't expire") is stale for v14 — duration management moved to DAE; check `durationManagementEnabled` instead.

### undo.ts

Design (full `toObject(true)` snapshots, diff-based restore through DAE actionQueue) is sound. Issues: §1.2 missing await (420) and actor-vs-token key mismatch (177-190); both queues capped at MAXUNDO=15 ✔ but snapshots can be megabytes (comment at 149-150 admits) — consider diff-at-capture; `startedUndoDataQueue` entries for aborted workflows linger (slow leak); `queueUndoData:209` filters by `itemUuid` while lookup at 203 used `id` — concurrent same-item uses can evict the wrong entry; `_queueUndoDataDirect:40` passes possibly-undefined into `fromUuidSync`; `:483` unused `const shouldDelete = false;`; `:330` commented `debugger`; `:193` bare `console.log(undoDataQueue)`.

### Other

- **lib/sockset.ts (249 lines) entirely unreferenced** — no import anywhere in src/. Also internally buggy (callback errors leave senders on the 30s timeout; `synchronize(data.data, user)` 2nd arg ignored). Delete or wire up.
- chatMessageHandling.ts:96-112 `hideRollUpdate` — returns `true` immediately, body commented out; delete handler + registration or restore.
- TroubleShooter: commented blocks 35-39, 76-89, 547-556, 949-963, 1035-1068; no-op statement at 767; empty `logErrors`/`checkAutoAnimations` (111-112, 1032-1033). The `/xxxxxxxxx/` check at 562 is intentional (plutonium rename, settings.ts:433-435) — deserves a comment.
- TargetConfirmation.ts:41-46 — three `setProperty` self-assignments (no-ops); TODO at 39 unfinished.
- ItemOnUseMacrosConfig.ts:65 — `activityType` computed, never used.
- Inconsistent tab handling: ConfigPanel uses `static TABS` (with `as unknown as` cast :73); TroubleShooter/SoundConfigPanel/RollStatsDisplay each hand-roll `tabGroups` + `#getTabs()` + `_preparePartContext` (~60 duplicated lines, stale "V12/V13 version" comments).
- Scrollable-pattern violations (project rule) in css/styles.css: `:128` `.midi-qol-quick-config .window-content { overflow-y: scroll }`; `:872` `.midi-qol-target-confirmation-list { overflow-y: scroll }` (no PARTS scrollable in TargetConfirmationConfig); `:1216` `.overtime-editor-scroll { overflow-y: auto }` (PARTS declares scrollable but styles a custom class). Done right in DependentsExplorer, RollStatsDisplay, SoundConfigPanel, ModuleReviewDialog, RegionBehaviorEditor.
- Duplication hotspots: DependentsExplorer `#onDeleteParent`/`#onDeleteDependent` (~70 lines differing by one i18n key, 500-574); ConfigPanel module-"not installed" labeling loop ×7 (~70 collapsible lines, 123-151); ActorOnUseMacroConfig FormData-merge ×3 (74-78, 86-90, 100-103); midi-sounds `setupBasic/Detailed/FullSounds` share ~120 verbatim lines (327-583); SoundConfigPanel has three save paths + doubled permission check (234-235) + dead `changeHandler` (289); mismatched magic version stamps (`"0.9.48"` midi-sounds vs `"12.4.40"` SoundConfigPanel.ts:262); `colorList` (ConfigPanel.ts:794-942) — 150 lines of CSS color names.
- console noise: lib/midiCompletions.ts:575, 1346, 1352 and undo.ts:193 use `console.log`; DependentsExplorer.ts:533/571 bare `console.error` without `TroubleShooter.recordError`.
- jQuery: nearly dead — live remnants at midi-qol.ts:860 (`$(document).on("mouseover", ...)`) and utils.ts:4861/6097 (`$(document).off('keydown.chooseDefault')`). Trivial conversions; jQuery is on Foundry's removal path.

### Done well (calibration)

DependentsExplorer (incremental cache, throttle/debounce, hook cleanup, PARTS scrollable), MidiDependentsRegistry (clean static registry), RollStats (clear client→GM protocol with `satisfies`, NaN sanitization), HandlebarsHelpers escaping, OverTimeEditor/ConditionEditor (unsaved-changes guard, submitted flag), ChatMessageMidi (fully native, well-factored DOM work).

---

## 9. Cross-Cutting Metrics

### Type-safety suppressions

| Metric | Total | Top offenders |
|---|---|---|
| `@ts-expect-error` | **983** | utils.ts 257, Workflow.ts 157, patching.ts 101, Hooks.ts 81, GMAction.ts 62, MidiActivityMixin.ts 58 |
| `: any` | **389** | utils.ts 104, GMAction.ts 31, patching.ts 27, Workflow.ts 26, MidiActivityMixin.ts 20, globals.ts 19 |
| `as any` | **120** | MidiRegionActivityBehaviorType.ts 14 (highest density — *new* v14 code), patching.ts 11, GMAction.ts 11, utils.ts 9 |
| `@ts-ignore` | 0 | |

≈1 suppression per 51 lines; the clean tsc run is suppression-driven. Most repeat the same shapes (dnd5e `system` fields, fvtt-types v14 gaps — e.g. effect `system.changes`, durations). A `dnd5e.d.ts` interface-augmentation file covering the top ~20 recurring accesses would eliminate hundreds and re-arm `@ts-expect-error`'s self-expiring property. Notable clusters: `DummyWorkflow.simulateSave` (Workflow.ts:8767-8785, ten consecutive `@ts-expect-error what is happening`); `bonusDialog` (30 in utils.ts 5000-5500); GMAction socket payloads (`usage: any, dialog: any, ...` — exactly where types would double as validation); Hooks.ts `actorTraits: any` ×8; `const self = this as any` ×6 in MidiRegionActivityBehaviorType (a typed accessor interface would clear all six); bare `//@ts-expect-error` with no reason on mixin schema fields (194, 228, 230); `get/set dnd5eFlags(): any` (Workflow.ts:881-887); `options: any` as a parameter ×25 in utils.ts. The mixin factory's untyped `Base` + `interface extends Activity` merge hack (MidiActivityMixin.ts:152) is the root cause of most downstream `any` in activities.

### tsconfig.json

`strict: true` then selectively un-done: `noImplicitAny: false` (the big one), `noImplicitThis: false`, `noImplicitReturns`/`noUnusedLocals`/`noUnusedParameters`/`noImplicitOverride` all off. `strictNullChecks: true` ✔. Cheap wins: `noImplicitOverride`, `noImplicitReturns`. High-value/high-effort: `noImplicitAny`.

### package.json / build

- `"save-dev": "^0.0.1-security"` — typo package (npm security placeholder); remove (mild supply-chain smell).
- Unused runtime deps: `codemirror`, `pegjs` (unmaintained; superseded by peggy), `xstate` — zero imports in src/scripts/gulpfile.
- Unused dev deps: `webpack`/`webpack-cli`, `karma-cli`, `@types/jest` (v27). Build sprawl: gulp+esbuild+webpack+gulp-typescript installed; only gulp+esbuild(+gulp-typescript for typecheck) used.
- Stale: `typescript ~5.7`, `prettier ^2.7.1`, `del ^6`, `gulp-zip ^5`. **`fvtt-types` tracks `github:...#main` unpinned** — non-reproducible builds; pin to a commit SHA.
- Type checking IS in the default build ✔ (gulpfile.js:536-544), but legacy `buildSource` swallows errors via an interactive "Build Anyway?" prompt (66-70), and verify `typeCheck()` actually fails the series rather than just `console.error`ing.

### Public API surface (midi-qol.ts / globals.ts)

8 runtime exports missing from the declared `var MidiQOL` type (globals.ts:680): `applyTokenDamageMany`, `DDBGameLogWorkflow`, `MidiRegionActivityBehaviorType`, `MidiRegionLightBehaviorType`, `resolveActivityMacro`, `resolveItemMacro`, `sizeNumeric` (+ `currentConfigSettings` only passingly declared). ~11 declared keys assigned outside the two main `Object.assign` blocks — no single auditable place. Fix: one `const MidiQOLApi = {...} satisfies MidiQOLApiType` (or derive the type via `typeof`) so drift becomes a compile error.

### Divergence from 13x

`diff -rq` of the two src trees: **37 of 59 files byte-identical to 13x (63%)**; 19 differ; 3 only in 14x (MidiRegionBehaviorConfig, RegionBehaviorEditor, regionBehaviors/); 2 only in 13x (ChatLogMidi.ts, module/damage/). Line-level divergence of shared core files: utils.ts 2%, Workflow.ts 3%, patching.ts 5%, MidiActivityMixin.ts 7%, GMAction.ts 1%, settings.ts 1%. Every fix in the shared 95-99% must be manually forward-ported — the project's single largest maintenance liability. Cheapest mitigation: a scripted divergence report (CI or local) flagging 13x commits not present in 14x.

### Localization

1,832 leaf keys in lang/en.json. Most "unused-looking" keys are referenced dynamically (`midi-qol.${prefix}.${key}` via `keysToExtendedOptionsObj` settings.ts:1065; `flags.${MODULE_ID}.noFumble.${at}` midi-qol.ts:1201; labelPrefix tabs ConfigPanel.ts:70) — naive unused-key tooling won't work. One confirmed-dead key: `midi-qol.buttons.altDamage` (legacy versatile button, present in en/de/fr/ko). ~19 of 95 `ui.notifications` calls pass raw English (midi-sounds.ts:191/195, TroubleShooter.ts:141/145/277/951/975/1011, AttackActivity.ts:67, Hooks.ts:928, settings.ts:349) — mostly GM-facing diagnostics.

### Git hygiene

- LevelDB internals tracked under `packs/` (`LOG`, `LOCK`, `CURRENT`, `MANIFEST-000002`, `000004.log`, `000005.ldb`) — 4 dirty right now; `LOG`/`LOCK`/`*.log` should at minimum be ignored (pack-src JSON is the source of truth; release zip copies packs anyway).
- 41 tracked files under `types/` — output of `generate:types`; decide committed-vs-generated.
- `.playwright-mcp/` untracked and missing from `.gitignore` (13x's has it); `.gitignore` is 7 lines total.
- `CLAUDE.md.bak` tracked in root; deleted-but-uncommitted root PNGs (`chat-cards-zoomed.png`, `midi-chat-card-1.png`).

---

## 10. Prioritized Recommendations

1. ✅ **DONE — Bug-fix pass (§1).** Mostly 1-3-line fixes; several silently disable features (showReactionAttackRoll default, rollSavesBlind migration, DDBGL pending flow, self-trigger getters, sync `evalTypeOrRace`), and the roll-swallowing `finally`s remove a whole class of "roll silently did nothing" reports. *(Implemented 2026-06-11; four verify-intent items deferred — see Implementation Status.)*
2. ⏸ **INVESTIGATED, DEFERRED — Harden the GM socket surface (§2).** *(2026-06-13: chose option A — `canCall` left advisory, no code change. Mirroring `canCall` on the GM is unsafe — denied group is dormant/mislabeled and breaks player→GM internal RPCs. Real fix = per-operation ownership checks on the mutators (option B), needs its own design pass. See §2 "Investigation" + "Outstanding".)* Server-side authorization, sender-metadata identity, `testUserPermission` ownership checks on every document-mutating handler; implement or delete `paranoidCheck`; flip the trusted-player TODO. Largest real risk in the module (and presumably mirrored in 13x).
3. ✅ **DONE — Finish the attach-region feature safely (§3)** before committing: fix the Spirit Guardians JSON placement, decide the emanation back-compat default/migration (option a: "default" = pre-feature behavior), move target resolution after template targeting, extract the shared options builder. *(Implemented 2026-06-12.)*
4. **Type-suppression burn-down**: `dnd5e.d.ts`/fvtt-types augmentation for the top recurring shapes; single-source the MidiQOL API object with `satisfies`; pin `fvtt-types`; then enable `noImplicitOverride`/`noImplicitReturns` and work toward `noImplicitAny`.
5. **Incremental structural work** (each independently shippable):
   - Workflow.ts: ✅ persisted-accessor factory DONE (PersistedFieldStore, −256 lines, fixes Roll rehydration in one place). Remaining: `createExpiryLinkedEffect()` helper (~150 lines + ~20 suppressions); table-driven `triggerTargetMacros`; split subclass workflows + types into separate files; parameterize the four `set*DamageRolls`.
   - utils.ts: extract geometry first (no Workflow dependency), then over-time, reactions, optional bonuses, condition eval; ✅ sync/async eval forks unified DONE (`mySafeEvalImpl`, fixed the sandbox-key bug); decompose `bonusDialog` with a typed context.
   - GMAction.ts: extract `applyStoredDamageState(actor, entry, mode)` from `processUndoDamageCard` (~300 lines, removes already-visible divergence).
   - Activities: unify the self-trigger getter; make pre-check failure paths actually remove workflows; hoist duplicated damage-roll statics/schema fields/rollMode blocks into the mixin; decompose `rollAttack`/`use`; delete ContestedCheckActivity.ts and OverTimeActivity.ts.
   - Apps: standardize on `DialogV2.wait()` + `button.form`; extract `migrateConfigSettings()`; convert the two FormApplication submenus; single-fire TargetConfirmation callback.
6. **One dead-code/hygiene sweep** (zero behavior change, ~1,000+ lines): lib/sockset.ts, hideRollUpdate, `if (false)` branches, `_canSense`, `oldFormat`, `getItemFromEffectOriginOLD`, string-diff to lib/ or gone, neutered hooks, v1 stubs, self-assignments, the four always-on debug logs (utils.ts:1224, Workflow.ts:1825, GMAction.ts:1085, undo.ts:193), `chackFlanking` rename, package.json cleanup, .gitignore additions.
7. **Dual-branch drift tooling**: automated 13x↔14x divergence report so forward-ports stop relying on memory.

---

## Caveats

Findings come from static reading. High-severity items were verified against surrounding code (dnd5e source for the `isOwner` return; grep for dead getters/files; JSON parsing for the Spirit Guardians placement; diff for 13x divergence), but a few are flagged "verify intent" rather than certain: `reactionUsed`/`reactionsUsed` (utils.ts:6879), the midi-sounds base-type filter (101-116), `performThrottledUpdate` fire-and-forget (Workflow.ts:2122), and whether `attachToken` should respect `regionBehavior.enabled`.
