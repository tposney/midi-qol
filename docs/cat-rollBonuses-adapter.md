# CAT optional bonuses on midi's rollBonuses service (reference adapter, contract 3)

midi-next offers every roll bonus in one prompt through the `rollBonuses` service: its own
`flags.midi-qol.optional.*` bonuses, entries offered as roll bonuses, and any module's contributors. Coven's Automation
Toolkit (CAT) can offer its `RollBonus` bonuses there instead of in its own phased dialog. A roll then shows one prompt,
not two, and CAT can retire its own session, dialog and roll patches once its minimum midi is 15.

This is a reference implementation, written against CAT 0.1.8 (`scripts/lib/optionalBonus.mjs`,
`scripts/mechanics/optionalBonus.mjs`) and midi's rollBonuses contract 3. It belongs in CAT (it reads `RollBonus`
state that changes with CAT's versions); midi keeps this copy. CPR's bonus files and CAT's `RollBonus` authoring API are
unchanged by it.

## Registration

Register on `ready` when midi offers the service at contract 3 or later, and stop CAT's own prompting when it does:

```js
Hooks.once("ready", () => {
  const service = globalThis.MidiQOL?.services?.list().find(s => s.id === "rollBonuses");
  if (!service || (service.contract ?? 0) < 3) return;      // older midi: CAT's own dialog
  MidiQOL.services.register("rollBonuses", "cat.optionalBonus", {
    kinds: ["attack", "damage", "save", "check", "skill", "tool"],
    async for(query) {
      const bonuses = await collectFor(query);              // CAT's collection for the query's event (below)
      return bonuses.map(bonus => toCandidate(bonus, query)).filter(Boolean);
    }
  }, { label: "Coven's Automation Toolkit" });
  // and the early return in CAT's own prompting entry points (attackPreRoll, attack, damage, applyDamage, cleanup,
  // rollPreRoll, rollResult) while registered
});
```

`collectFor(query)` runs the collection CAT runs today: `collectBonuses(query.workflow, pass)` for a workflow's attack
(`optionalBonusAttack`) or damage (`optionalBonusDamage`), and the actor roll events for saves, checks, skills and tools
(`rollPreRoll` / `rollResult`'s event, with `query.actor`, `query.ability`, `query.skill`, `query.tool`).

## A RollBonus as a candidate

```js
function toCandidate(bonus, query) {
  if (!bonus.initialized) bonus.initialize(query.workflow);
  const isDamage = bonus instanceof DamageBonus;
  // A targeted damage bonus needs its targets chosen; midi has no target picker yet (below): with one target hit it is
  // that target's, otherwise it isn't offered
  let targets;
  if (isDamage && bonus.maxTargets > 0) {
    const hit = query.workflow?.hitTargets?.documents ?? [];
    if (hit.length !== 1) return undefined;
    targets = [hit[0].uuid];
  }
  const spender = bonus.actor?.uuid && bonus.actor.uuid !== query.actor.uuid ? bonus.actor.uuid : undefined;
  return {
    id: bonus.id,
    label: bonus.name,
    img: bonus.img,
    description: bonus.description,
    priority: bonus.priority,                       // both sort higher first (CAT: b.priority - a.priority)
    phases: [isDamage ? "postResult" : bonus.phase],
    when: "failure",                                 // CAT offers after-result bonuses on a failure only
    optional: bonus.optional,
    effect: bonus.roll.formula === "0" ? { kind: "rider" }
      : { kind: "add", formula: bonus.roll.formula, critical: bonus.canCrit ? "double" : "never" },
    damageTypes: isDamage ? bonus.damageTypes : undefined,  // several: midi asks which when it is taken
    cost: bonus.cost,                               // checked against what this roll's earlier choices left
    spendsOwnCost: true,                            // bonus.use() consumes, as now
    spender,                                        // someone else's bonus: their resources
    targets,
    validate: ctx => bonus.validate(query.workflow, [], ctx.roll.total, { roll: ctx.roll, outcome: ctx.outcome }) || "not valid now",
    approve: bonus.isThirdParty && !bonus.autoApproveRequests
      ? ctx => bonus.request(query.workflow, [], ctx.roll.total) : undefined,
    onChosen: ctx => { bonus.roll = ctx.roll; return bonus.use(query.workflow, []); }
  };
}
```

## What midi does with it

- **One session per roll.** The roll's phases share a budget; a bonus applied before the result isn't offered again
  after it; one the roller was offered and didn't take isn't asked again (a bonus new in a later phase is).
- **Application order.** Chosen bonuses apply as replace, reroll, add, outcome, riders: a reroll doesn't drop an add.
- **Costs.** A candidate is offered only while its cost fits what the roll's earlier choices left. With `spendsOwnCost`
  midi doesn't spend it; `use()` does. A `spender`'s resources pay, not the roller's.
- **Third parties.** `approve` is awaited before the bonus is applied; false (or a time-out inside `request`) means it
  isn't applied and nothing is spent.
- **Damage.** An add with its own type or critical is its own damage roll; `targets` adds to those targets' damage only
  (midi's damageModifiers bonus stage), not to the roll.
- **After the result.** `when: "failure"` keeps CAT's rule; `"success"` or `"any"` would offer a bonus after a hit too.
- **The prompt.** midi's phased prompt or classic dialog, or a provider that answers (`ask(request) → ids`).

## Not covered yet (the later prompt work in wave C)

- CAT's scaling slider (`maxScaling`, `updateScaling`), extra inputs, and the target picker: a bonus is offered as it
  stands, and a targeted damage bonus only with one target hit.
- The live `configure` callback (re-pricing a bonus as its inputs change).
- Manual dice entry (`resolveManualRolls`): midi rolls the bonus dice.
- Optional preRoll bonuses are offered after the roll; only automatic preRoll bonuses join the formula.

## What changes in CAT

| Change | Where | Size |
|---|---|---|
| Register `cat.optionalBonus` on `ready` when midi offers `rollBonuses` at contract 3 | new `integrations/midiRollBonuses.mjs` | ~15 lines |
| Early return in its own prompting entry points while registered | `mechanics/optionalBonus.mjs` | ~10 lines |
| `collectFor(query)` and `toCandidate(bonus, query)` above | the adapter | ~100 lines |
| When CAT's minimum midi is 15: its session, dialog and inputs code goes | `mechanics/optionalBonus.mjs`, `dialogUtils.mjs` | about −650 lines |

Behaviour CAT's author has to accept: midi rolls the bonus dice; a targeted damage bonus is a line on the target's
damage, not its own chat message; preRoll bonuses are in the formula (dnd5e doubles their dice on a critical); the
prompt has midi's time-out, undo entry and before/after note.
