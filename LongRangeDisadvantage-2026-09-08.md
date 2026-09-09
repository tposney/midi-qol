# Long-range disadvantage never fires — diagnosis and proposed fix

**Status:** applied, verified live, uncommitted. Found while automating NPC turns; the planner scored a javelin
throw at disadvantage and midi rolled it straight.

## What the rules require

`dnd5e.rules`, *Appendix E / Range*:

> Some ranged attacks, such as those made with a longbow or a shortbow, have two ranges. The smaller
> number is the normal range, and the larger number is the long range. Your attack roll has
> disadvantage when your target is beyond normal range, and you can't attack a target beyond the
> long range.

*Appendix E / Ranged Attacks* settles the thrown-weapon question directly — "hurl a handaxe" is
given as an example of making a ranged attack, so a thrown weapon is subject to the range rules
above. The 2024 wording is the same in substance: throwing a weapon *makes a ranged attack*, and a
ranged attack beyond normal range has disadvantage.

dnd5e itself applies none of this. There is no range-based advantage handling in the system, so it
is entirely midi's to enforce, which is what `checkMechanic("checkRange")` exists for.

## What actually happens

Measured in a live world, `checkRange` set to `longfail`, attacker and target 100 ft apart:

| weapon | item range | activity range | expected | actual |
|---|---|---|---|---|
| Shortbow | 80 / 320 | **320** / 320 | `dis` | `normal` |
| Javelin | 30 / 120 | **120** / 120 | `dis` | `normal` |

Neither gets disadvantage. The bow is an ordinary `rwak` ranged weapon — this is not a
thrown-weapon edge case.

## Root cause

Two independent defects.

### A. The normal range read is actually the long range — affects every weapon

`checkActivityRange` (`src/module/utils.ts`) takes the normal range from the activity:

```ts
let range = ((activity.range?.value || activity.range?.reach) ?? 0);
let longRange = (activity.range?.long ?? 0);
```

When an activity does not override its range (`range.override === false`, the default for every
weapon activity), dnd5e derives `activity.range.value` as the *furthest usable distance* — the
item's long range. The true normal/long pair survives only on `item.system.range`:

```
Longbow   item 150/600   activity {value: 600, long: 600, override: false}
Shortbow  item  80/320   activity {value: 320, long: 320, override: false}
Javelin   item  30/120   activity {value: 120, long: 120, override: false}
```

So `range === longRange` for every weapon, and the disadvantage branch is unreachable:

```ts
if ((longRange !== 0 && distance > longRange) || ...) { /* fail */ }
if (distance > range) return { result: "dis", ... };   // range === longRange, so already returned
```

Anything beyond normal range is also beyond `range`, so the `fail` branch above catches it first.
`"dis"` can never be returned for a weapon.

Spells are unaffected: a spell item's `system.range.value` is the real range and there is no long
range, so the derived activity value already matches.

### B. Thrown weapons are never range-checked at all

`src/module/Workflow.ts` (~line 2015):

```ts
if (checkMechanic("checkRange") !== "none" && (!this.AoO
    && ["rwak", "rsak"].includes(this.activity.actionType ?? "")) && this.tokenUuid) {
```

A thrown weapon is a *melee* weapon with the Thrown property, so its attack activity is `mwak`.
The check is skipped entirely — no disadvantage, and no out-of-range failure either.

This looks like an oversight rather than a decision, because:

- `checkActivityRange` already handles thrown deliberately, preserving the long range only for
  melee weapons that have the property:
  ```ts
  if (isMeleeAttack && !hasThrownProperty) longRange = 0;
  ```
  That line has no purpose unless thrown melee weapons are expected to reach the function.
- `TargetConfirmation.ts` calls the same function with a gate that *does* include melee:
  `["mwak", "msak", "rwak", "rsak", ...]`. The two callers disagree.

## Proposed fix

### 1. A helper that returns the true normal/long pair

In `src/module/utils.ts`, beside `checkActivityRange`:

```ts
/**
 * The normal and long range of an activity, in the activity's own units.
 *
 * An activity that does not override its range reports `range.value` as the furthest usable
 * distance — for a weapon, the long range — so reading it as the normal range makes the two equal
 * and the long-range disadvantage unreachable. The item keeps the real pair.
 */
export function activityRanges(activity): { normal: number, long: number } {
  const own = activity?.range ?? {};
  if (own.override) return { normal: (own.value || own.reach) || 0, long: Number(own.long) || 0 };
  const item = activity?.item?.system?.range;
  const normal = Number(item?.value) || (own.value || own.reach) || 0;
  const long = Number(item?.long ?? own.long) || 0;
  return { normal, long };
}
```

and in `checkActivityRange` replace the two assignments with:

```ts
let { normal: range, long: longRange } = activityRanges(activity);
```

Everything downstream (the actor range/long bonus flags, Sharpshooter, Spell Sniper, the
`isMeleeAttack && !hasThrownProperty` clamp, the unit conversion) is unchanged and now operates on
the correct pair.

### 2. Let thrown weapons reach the check

In `Workflow.ts`:

```ts
const actionType = this.activity.actionType ?? "";
const ranged = ["rwak", "rsak"].includes(actionType);
// A thrown weapon is a melee weapon making a ranged attack, so the range rules apply to it. Its
// activity is mwak, which is why it was being skipped.
const thrown = ["mwak", "msak"].includes(actionType)
  && this.activity.item?.labels?.properties?.some(p => p.abbr === "thr");
if (checkMechanic("checkRange") !== "none" && !this.AoO && (ranged || thrown) && this.tokenUuid) {
```

No extra guard is needed for a thrown weapon used *in melee*: with the normal range read correctly
(30 ft for a javelin) a target at 5 ft is within normal range and returns `"normal"`.

For consistency the `longdisadv` branch inside `checkActivityRange` should use the same predicate
as the caller, rather than `["rwak", "rsak"]`, so a javelin beyond long range under that mechanic
reports `dis` like a bow rather than `fail`.

## Risk

This is a behaviour change, and a visible one. Worlds have been playing without long-range
disadvantage on any weapon, quite possibly for as long as activities have derived their range this
way, and turning it on will change hit rates for every archer in every encounter. It is what the
rules say and what the `checkRange` setting promises, but it should go in the changelog as a fix
rather than slipped in.

The blast radius is contained: `checkActivityRange` has four callers, and all of them already
handle `"dis"` — `TargetConfirmation` has a "Long Range" label for it, `activityHelpers` uses it to
trigger target confirmation, `MidiActivityMixin` aborts only on `"fail"`, and `Workflow` sets
`longRangeAttack`, which adds the disadvantage at `Workflow.ts:3286`. Nothing needs teaching about
the new result; they have all been waiting for it.

## Verification — as run

`checkActivityRange`, live world, `checkRange: longfail`:

| case | expected | got |
|---|---|---|
| Shortbow (80/320) @ 100ft | `dis` | `dis` |
| Shortbow @ 80ft (exactly normal) | `normal` | `normal` |
| Shortbow @ 60ft | `normal` | `normal` |
| Shortbow @ 330ft, @ 350ft | `fail` | `fail` |
| Javelin (30/120) @ 50ft | `dis` | `dis` |
| Javelin @ 5ft | `normal` | `normal` |
| Longsword @ 10ft | `fail` | `fail` |
| Fire Bolt @ 100ft / @ 130ft | `normal` / `fail` | `normal` / `fail` |

The returned pair is now the true one — `range=80 long=320` for a shortbow where both read 320
before. Boundary behaviour is right: exactly at normal range is not "beyond" it.

End to end, through a real workflow, reading the attack roll's own formula:

| weapon | 20ft | 40ft | 50ft | 100–110ft |
|---|---|---|---|---|
| Javelin (30/120) | `1d20` | `2d20dis` | — | `2d20dis` |
| Shortbow (80/320) | — | — | `1d20` | `2d20dis` |

### A pre-existing bug found alongside, not caused by this

A thrown weapon's workflow stalls to the ninety-second timeout unless
`workflowOptions.attackMode` is supplied, because dnd5e offers a choice of attack mode and midi
opens a dialog that nothing answers. Confirmed independent of this change: with `checkRange` set to
`none`, which bypasses the new gate entirely, a javelin still timed out at 90001ms while a longsword
resolved in 370ms. It is already known — 14.0.13 added `workflowOptions.attackMode` for exactly
this — but any caller driving a thrown weapon without a user present must supply it.

## Original verification plan

1. Shortbow at 100 ft (80/320) → `checkActivityRange` returns `dis`; the attack rolls with
   disadvantage and the roll card shows "Long Range".
2. Shortbow at 60 ft → `normal`, no disadvantage.
3. Shortbow at 400 ft → `fail` under `longfail`, `dis` under `longdisadv`.
4. Javelin at 50 ft (30/120) → `dis`.
5. Javelin at 5 ft → `normal` (used as a melee weapon, and within its normal range anyway).
6. Longsword at 10 ft → `fail` (melee, no thrown property, long range clamped to 0).
7. Fire Bolt at 100 ft (120 ft, no long) → `normal`; at 130 ft → `fail`. Unchanged from today.
