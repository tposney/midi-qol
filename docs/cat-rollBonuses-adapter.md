# CAT optional bonuses on midi's rollBonuses service (reference adapter)

midi-next offers every optional roll bonus in one prompt, through the `rollBonuses` service. Coven's Automation
Toolkit (CAT) can offer its `RollBonus` bonuses there instead of in its own phased dialog. Then a roll shows one prompt,
not two, and CAT can drop its own session, dialog and roll patches. Until CAT registers, midi's TroubleShooter reports
"two bonus prompts".

This is a reference implementation, written against CAT 0.1.8 (`scripts/lib/optionalBonus.mjs`,
`scripts/mechanics/optionalBonus.mjs`). It belongs in CAT, not midi. CPR's bonus files and CAT's `RollBonus` authoring
API are unchanged by it.

## Registration

Register when midi offers the service, and stop prompting yourself when it does:

```js
Hooks.once("ready", () => {
  if (!globalThis.MidiQOL?.services?.list().some(s => s.id === "rollBonuses")) return; // older midi: CAT's own dialog
  MidiQOL.services.register("rollBonuses", "cat.optionalBonus", {
    kinds: ["attack", "damage", "save", "check", "skill", "tool"],
    async for(query) {
      const bonuses = await collectFor(query);     // CAT's collectBonuses for the query's event (below)
      return bonuses.map(bonus => toCandidate(bonus, query));
    }
  }, { label: "Coven's Automation Toolkit" });
});
```

`collectFor(query)` runs the collection CAT runs today: `collectBonuses(query.workflow, pass)` for a workflow's attack
(`optionalBonusAttack`) or damage (`optionalBonusDamage`), and the actor roll events for saves, checks, skills and
tools (`rollPreRoll`/`rollResult`'s event, with `query.actor`, `query.ability`, `query.skill`, `query.tool`).

## A RollBonus as a candidate

```js
function toCandidate(bonus, query) {
  if (!bonus.initialized) bonus.initialize(query.workflow);
  const isDamage = bonus instanceof DamageBonus;
  return {
    id: bonus.id,
    label: bonus.name,
    img: bonus.img,
    priority: bonus.priority,                       // CAT: lower runs first; midi: higher first. Negate if order matters
    phases: [isDamage ? "postResult" : bonus.phase],
    optional: bonus.optional,
    effect: bonus.roll.formula === "0" ? { kind: "rider" }
      : { kind: "add", formula: bonus.roll.formula, damageType: isDamage ? bonus.damageTypes?.[0] : undefined },
    cost: bonus.cost,                               // checked against what is left this roll (CAT's budget rule)
    spendsOwnCost: true,                            // bonus.use() consumes, as now
    targets: isDamage && bonus.maxTargets > 0 ? bonus.targets?.map(t => t.document?.uuid ?? t.uuid) : undefined,
    validate: ctx => bonus.validate(query.workflow, [], ctx.roll.total, { roll: ctx.roll, outcome: ctx.outcome }) || "not valid now",
    approve: bonus.isThirdParty && !bonus.autoApproveRequests
      ? ctx => bonus.request(query.workflow, [], ctx.roll.total) : undefined,
    onChosen: () => bonus.use(query.workflow, [])
  };
}
```

## What midi does with it

- **Phases.** preRoll bonuses that add a formula join the attack formula; preResult and postResult bonuses are offered
  in midi's prompt after the roll. Damage bonuses wait for the saves when the use has saves.
- **Costs.** A candidate is offered only while its cost fits what the roll's earlier choices left. With `spendsOwnCost`
  midi doesn't spend it; `use()` does.
- **Third parties.** `approve` is awaited before the bonus is applied; false (or a time-out inside `request`) means it
  isn't applied and nothing is spent.
- **Targets.** A damage bonus with `targets` is added to those targets' damage only (midi's damageModifiers bonus
  stage), not to the damage roll.

## Not covered yet

- CAT's scaling slider (`maxScaling`, `updateScaling`) and extra inputs: midi's prompt offers a bonus at its current
  scaling. A `scaling` field on candidates is the planned extension.
- Optional preRoll bonuses: midi offers them after the roll; only automatic preRoll bonuses join the formula.
