# MidiRegionActivityBehaviorType — Design Document

**Date**: 2026-03-23
**Status**: Implemented (core class + pipeline integration + UUID schema + token attachment)
**Module**: midi-qol v14

## Overview

`MidiRegionActivityBehaviorType` is a custom `RegionBehaviorType` subclass registered as `"midi-qol.regionActivity"`. It replaces the auraeffects module dependency for emanation-based spells (Spirit Guardians, Circle of Power, Paladin Auras) by using Foundry v14's native Region event system.

Emanation regions are attached to the caster token via Foundry v14's native `RegionDocument.attachment.token` field, so they automatically move with the caster.

## Motivation

Previously, emanation aura effects required:
- The **auraeffects** module for applying/removing effects as tokens enter/exit
- **ActivityOverTime** polling for per-turn saves/damage
- **DAE macros** wired into effect changes for complex interactions

This approach had several drawbacks:
- External module dependency (auraeffects)
- Polling-based detection (missed edge cases with teleportation, forced movement)
- Complex macro setup for each sample item
- No native integration with Foundry's Region/template system

The new approach leverages Foundry v14's Region system directly:
- Regions fire `TOKEN_ENTER`/`TOKEN_EXIT` events natively
- Turn-based events (`TOKEN_TURN_START`/`TOKEN_TURN_END`) handle per-turn triggers
- Concentration cleanup is automatic (Region deletion cascades to TOKEN_EXIT)
- Region attachment to token handles movement tracking natively
- No external module dependency

## Two-Layer Schema Design

The activity schema on the Item stores **portable IDs/identifiers** (survive compendium import and actor copy). The behavior type on the Region stores **full UUIDs** (resolved at cast time). `_attachRegionActivityBehavior` converts between them.

### Activity Schema (on Item — edited via RegionBehaviorEditor)

Uses effect `_id`s and activity identifiers. Stored in `activity.regionBehavior.*`.

### Behavior Type Schema (on Region — created at cast time)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sourceItemUuid` | StringField | `""` | UUID of the spell/feature item |
| `sourceActorUuid` | StringField | `""` | UUID of the casting actor |
| `entryEffectUuids` | SetField(DocumentUUIDField) | `[]` | Full UUIDs of effects to apply on entry |
| `exitEffectUuids` | SetField(DocumentUUIDField) | `[]` | Full UUIDs of effects to remove on exit |
| `onEntryActivityUuids` | SetField(StringField) | `[]` | Full UUIDs of activities to trigger on entry |
| `onExitActivityUuids` | SetField(StringField) | `[]` | Full UUIDs of activities to trigger on exit |
| `onTurnStartActivityUuids` | SetField(StringField) | `[]` | Full UUIDs of activities to trigger on turn start |
| `onTurnEndActivityUuids` | SetField(StringField) | `[]` | Full UUIDs of activities to trigger on turn end |
| `dispositionFilter` | NumberField | `-1` | -1=enemies, 0=all, 1=allies |
| `castLevel` | NumberField | `0` | Spell level for scaling (from `message.data.system.spellLevel`) |
| `excludeSource` | BooleanField | `true` | Skip the caster's token |
| `oncePerTurn` | BooleanField | `true` | Each activity triggers at most once per turn per creature |

Activity UUID fields use `StringField` (not `DocumentUUIDField`) because Activity is a PseudoDocument not in `CONST.ALL_DOCUMENT_TYPES`. Effect UUID fields use `DocumentUUIDField({type: "ActiveEffect"})` which renders natively as `<document-tags>` in the Region behavior config.

Activity UUID fields override `toInput` to resolve UUIDs to activity names for display.

## Event Handlers

### TOKEN_ENTER (`_onTokenEnter`)
- **Gate**: `event.user.isSelf` (same as Foundry's `ApplyActiveEffectRegionBehaviorType`)
- **Flow**:
  1. Skip source token (if `excludeSource`)
  2. Check disposition filter
  3. Check `isValidTarget`
  4. Pause movement
  5. Apply effects from `entryEffectUuids` (resolved via `fromUuidSync`)
  6. Trigger activities from `onEntryActivityUuids` (respects `oncePerTurn`)
  7. Resume movement

### TOKEN_EXIT (`_onTokenExit`)
- **Gate**: `event.user.isSelf`
- **Flow**:
  1. Remove effects matching `exitEffectUuids` (matched by `flags.midi-qol.regionSourceEffectUuid`)
  2. Trigger activities from `onExitActivityUuids`
  3. Resume movement

### TOKEN_TURN_START (`_onTokenTurnStart`)
- **Gate**: `preferredActiveGM().isSelf` (GM-only, consistent with midi-qol's existing pattern)
- **Flow**:
  1. Skip source token, disposition filter, validity checks
  2. Trigger activities from `onTurnStartActivityUuids` (respects `oncePerTurn`)

### TOKEN_TURN_END (`_onTokenTurnEnd`)
- Same as turn start but uses `onTurnEndActivityUuids`

## GM Execution Gating

| Event | Gate | Rationale |
|-------|------|-----------|
| TOKEN_ENTER | `event.user.isSelf` | Player moves their own token; they execute the handler |
| TOKEN_EXIT | `event.user.isSelf` | Same — player's client handles cleanup |
| TOKEN_TURN_START | `preferredActiveGM()` | Combat turn advancement is GM-controlled |
| TOKEN_TURN_END | `preferredActiveGM()` | Same |

For GM-only operations (effect creation by non-GMs, activity triggering), socket handlers delegate to the GM:
- `midiRegionTriggerActivity` — calls `MidiRegionActivityBehaviorType._executeTriggerActivity()`
- `midiRegionApplyEffects` — creates effects on the target actor

## Template Pipeline Integration

In `MidiActivityMixin._placeEmanationTemplate(workflow, castLevel)`:

1. MeasuredTemplate is created, v14 creates a proxy RegionDocument
2. Region is attached to caster token: `regionDoc.update({ attachment: { token: tokenId } })`
3. Behavior is attached: `_attachRegionActivityBehavior(regionDoc, workflow, overTimeActivity, castLevel)`

The `castLevel` parameter is extracted from `message.data.system.spellLevel` in `_usageChatContext` (set by dnd5e's `_prepareUsageScaling` before the chat context is prepared).

`_attachRegionActivityBehavior()` converts portable IDs/identifiers from the activity schema to full UUIDs:
- Effect IDs → `effect.uuid` via `item.effects.get(id)`
- Activity identifiers → `activity.uuid` via `item.system.activities.find(a => a.identifier === id)`
- Fallback auto-derive path: `dontApply` effect UUIDs + overtime activity UUID

## Concentration Cleanup Chain

1. Caster drops concentration (or fails check)
2. dnd5e/midi removes the concentration effect
3. `flags.dnd5e.dependentOn` cascade deletes the Region
4. Foundry fires `TOKEN_EXIT` for all tokens inside the Region
5. `_onTokenExit` removes effects with matching `origin`

No additional cleanup code needed — the chain is fully automatic.

## Once-Per-Turn Deduplication

The `oncePerTurnFlag` schema field stores a flag key (e.g., `regionActivity.emanationSave`). The behavior writes the current combat round to `actor.flags.midi-qol[flagKey]` after triggering. Subsequent triggers in the same round are skipped.

This handles the case where a token enters the region AND starts its turn there — only one trigger fires.

## Spirit Guardians Migration Example

**Before** (auraeffects + macro):
- Aura effect type `auraeffects.aura` with disposition filter
- DAE macro in effect changes for per-turn saves
- ActivityOverTime for recurring damage

**After** (MidiRegionActivityBehaviorType):
- Self-target concentration effect (no aura type needed)
- Emanation template with `isOverTimeFlag: true`
- Behavior auto-attached when template placed
- Speed reduction effect in `effectUuids` (applied on entry, removed on exit)
- Save activity in `activityIdentifier` (triggered on turn start + entry)

## Files Changed

| File | Change |
|------|--------|
| `src/module/regionBehaviors/MidiRegionActivityBehaviorType.ts` | **NEW** — core class |
| `src/midi-qol.ts` | CONFIG registration + globalThis export |
| `src/module/activities/MidiActivityMixin.ts` | `_attachRegionActivityBehavior()` + pipeline hook |
| `src/module/GMAction.ts` | Socket handlers for GM delegation |
| `lang/en.json` | Localization strings |

## Future Work

- [ ] Migrate Spirit Guardians sample item to use the behavior
- [ ] Migrate Circle of Power, Paladin Aura sample items
- [ ] Add behavior configuration UI (ApplicationV2 sheet)
- [ ] Test suite (region-behavior-tests.ts)
- [ ] Support for multiple behaviors on a single region (stacking auras)
