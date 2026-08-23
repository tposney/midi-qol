# Fix: send the matching roll key to Flash Token Bar for skill and tool checks

**Branch:** `fix/flash-token-bar-skill-tool-roll-key` → `v13`
**Affects:** `src/module/Workflow.ts` — `dispatchFlashRollsSaves`

## Problem

When a Check activity is processed with Flash Token Bar as the save/check handler, the player is
prompted with a dialog titled `str Check` (or `wis Check`, `dex Check` — the raw ability id) instead
of the tool's own check, and the roll has the wrong modifiers: the tool proficiency bonus is missing
and the ability modifier belongs to the wrong ability.

Reported for Smith's Tools and Cook's Utensils on Foundry v13 / dnd5e 5.2.5 / midi 13.0.64 /
Flash Token Bar 1.27.1.

### Reproduction

1. Midi-QOL and Flash Token Bar both active.
2. Midi → **Roll saves for players** set to `Flash Token Bar`.
3. Midi → **Auto check saves** set to anything other than `none`.
4. A player uses a tool item (Check activity) from their sheet.

Expected: `Smith's Tools Check`, `1d20 + 3 + 2` (Strength modifier + proficiency).
Actual: `str Check`, an ability check with neither the tool's ability nor its proficiency.

## Cause

`determineRollTypeAndAction()` populates `rollAbilities` for skill and tool checks as well as for
saves — for a tool it records both the tool id *and* the ability the check is rolled with
(`Workflow.ts`, tool branch):

```ts
rollType = "tool";
rollTools = associatedArray;
const ability = this.saveActivity?.getAbility?.(associatedArray[0]);
if (ability) rollAbilities = [ability];
```

`dispatchFlashRollsSaves` then selected the roll key by first non-empty list:

```ts
const flashRollKey = rollAbilities?.[0] ?? rollSkills?.[0] ?? rollTools?.[0];
```

Because `rollAbilities` is populated, `rollSkills` and `rollTools` are never reached. Midi therefore
calls `FlashAPI.requestRoll({ requestType: "tool", rollKey: "str" })` — a `tool` request carrying an
ability id.

Flash Token Bar forwards that as `actor.rollToolCheck({ tool: "str" })`. In dnd5e's
`Actor5e##rollSkillTool` an unresolvable tool key silently degrades to an ability check:

```js
const toolConfig = CONFIG.DND5E.tools[config.tool] ?? CONFIG.DND5E.vehicleTypes[config.tool];
if ( ((type === "skill") && !skillConfig) || ((type === "tool") && !toolConfig) ) {
  return this.rollAbilityCheck(config, dialog, message);
}
```

The dialog options built by `rollToolCheck` are passed through unchanged, so the window keeps the
title `Trait.keyLabel("str", { trait: "tool" })` — which just echoes the unknown key. Hence
`str Check`, no ability selector, and the modifiers of an unrelated ability check.

Skill-based Check activities fail the same way. Saving throws are unaffected, since there
`rollAbilities[0]` is the correct key by coincidence — which is why this only shows up on tool and
skill checks.

`autoCheckSaves` is part of the repro only because `checkSaves()` is gated on it
(`if (configSettings.autoCheckSaves !== "none")` in `WorkflowState_WaitForSaves`); with `none` the
dispatch never runs.

## Fix

Select the roll key by `rollType`, so each request type carries its own identifier:

```ts
let flashRollKey: string | undefined;
if (rollType === "skill") flashRollKey = rollSkills?.[0];
else if (rollType === "tool") flashRollKey = rollTools?.[0];
else flashRollKey = rollAbilities?.[0];
```

`save` and plain `check` requests keep using `rollAbilities[0]`, so their behaviour is unchanged.
The `!flashRollKey → "custom"` fallback still applies when the activity has no usable identifier.

## Scope

One-line selection change plus a comment; no signature, setting, or API change. Other integrations
(`dispatchMonksTokenBarSaves`, `dispatchEpicRollsSaves`) build their request strings separately and
are untouched.

## Testing

`npx tsc --noEmit -p tsconfig.json` reports no new diagnostics in `Workflow.ts`.

Suggested manual verification, with Midi set to `Flash Token Bar` for player saves and
`Auto check saves` enabled:

- Player uses a tool item (Smith's Tools) → one prompt titled `Smith's Tools Check` with the tool's
  ability modifier and proficiency bonus.
- Player uses a skill-associated Check activity → the prompt names the skill, not the ability.
- A saving-throw activity still prompts for the correct save (regression check).
- A Check activity with no associated skill/tool still falls back to a plain ability check.
