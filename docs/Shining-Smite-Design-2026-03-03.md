# Shining Smite Implementation Design

## SRD 2024 Rules (Shining Smite replaces 2014 Branding Smite)

- **Name**: Shining Smite
- **Level**: 2nd
- **School**: Transmutation (`trs`)
- **Activation**: Bonus action, "immediately after hitting a creature with a Melee weapon or an Unarmed Strike"
- **Duration**: 1 minute, concentration
- **Target**: 1 creature
- **Range**: Self
- **Properties**: Vocal, Concentration
- **Icon**: `icons/skills/melee/strike-sword-dagger-runes-yellow.webp`
- **Effect icon**: `icons/magic/light/explosion-star-glow-silhouette.webp`
- **Source**: SRD 5.2, CC-BY-4.0, rules: 2024
- **Identifier**: `shining-smite`

### Spell Text
"The target hit by the strike takes an extra 2d6 Radiant damage from the attack. Until the spell ends, the target sheds Bright Light in a 5-foot radius, attack rolls against it have Advantage, and it can't benefit from the Invisible condition."

"Using a Higher-Level Spell Slot. The damage increases by 1d6 for each spell slot level above 2."

## Implementation Model (same as Divine Smite)

Uses a **transfer effect** with `DamageBonusMacro` to auto-prompt on melee weapon hits. The macro returns bonus damage AND executes a utility activity that handles concentration + the Shining effect on the target.

### IDs (all 16 chars)
- Item: `ShiningSmite0000`
- Transfer effect: `ssSmiteReady0000`
- Shining effect: `ShiningEffect000`
- Utility activity: `ssApplyShining00`
- Damage activity: `dnd5eactivity000`

### Transfer Effect (`ssSmiteReady0000`)
- `transfer: true`
- `showIcon: false`
- Change: `flags.dnd5e.DamageBonusMacro` = `ItemMacro` (mode 0 CUSTOM)

### Shining Effect (`ShiningEffect000`)
- `transfer: false` (applied to target by utility activity)
- `showIcon: true`
- `statuses: ["marked"]`
- Changes:
  - `system.traits.ci.value` mode 2 (ADD) value `invisible` — condition immunity
  - `flags.midi-qol.grants.advantage.attack.all` mode 0 (CUSTOM) value `1` — advantage on attacks against
- Duration: tied to concentration (no explicit duration needed)
- Description: "Until the spell ends, the target sheds Bright Light in a 5-foot radius, attack rolls against it have Advantage, and it can't benefit from the Invisible condition."
- Note: Bright Light aura not automated (requires ATL)

### Utility Activity (`ssApplyShining00`)
- Type: `utility`
- Name: "Apply Shining"
- `automationOnly: true`
- `spellSlot: false` (macro handles slot consumption)
- `forceConsumeDialog: "never"`
- `confirmTargets: "never"`
- Applies ShiningEffect000
- Target: creature, 1
- `otherActivityId: "none"`
- `otherActivityCompatible: false`

### Damage Activity (`dnd5eactivity000`)
- Type: `damage`
- Name: "Cast Manually"
- `automationOnly: true`
- `spellSlot: true`
- 2d6 radiant, scaling +1d6/level (mode: whole)
- `critical.allow: true`
- `otherActivityId: "none"`
- `otherActivityCompatible: false`

### DAE Macro (ItemMacro on DamageBonusMacro)
1. Check `rolledActivity.actionType` is `mwak`
2. Check `workflow.hitTargets.size > 0`
3. Check not already concentrating: `MidiQOL.getConcentrationEffect(actor, macroItem)` returns falsy
4. Build spell slot options (level 2+, including pact slots if level >= 2)
5. Prompt via `DialogV2.wait` with slot selection dropdown
6. If cancelled, return `{}`
7. Consume the chosen spell slot via `actor.update()`
8. Calculate damage dice: `(1 + slotLevel)d6` radiant
9. After weapon workflow completes (`Hooks.once("midi-qol.RollComplete")`), execute the utility activity via `MidiQOL.completeActivityUse(applyActivity, {midiOptions: {targetUuids}})` — this handles concentration + Shining effect
10. Return `new CONFIG.Dice.DamageRoll(...)` with `isCritical` from workflow

### Key Differences from Old Branding Smite
- 2024 rules instead of 2014
- School changed from Evocation to Transmutation
- Trigger: same DamageBonusMacro pattern, but melee only (not ranged)
- Effect: condition immunity to invisible (not just removing it), grants advantage on attacks against target, marked status
- Concentration persists (old version deleted concentration after first hit)
- No ATL light effect in macro (noted as not automated)
- Utility activity handles concentration + effect application cleanly
