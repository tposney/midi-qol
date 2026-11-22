# CAT optional bonuses on midi's rollBonuses service (reference adapter, contract 4)

midi-next offers every roll bonus in one prompt through the `rollBonuses` service: its own
`flags.midi-qol.optional.*` bonuses, entries offered as roll bonuses, and any module's contributors. Coven's Automation
Toolkit (CAT) can offer its `RollBonus` bonuses there instead of in its own phased dialog. A roll then shows one prompt,
not two, and CAT can retire its own session, dialog and roll patches once its minimum midi is 15.

This is a reference implementation, written against CAT 0.1.8 (`scripts/lib/optionalBonus.mjs`,
`scripts/mechanics/optionalBonus.mjs`, `scripts/utilities/dialogUtils.mjs`) and midi's rollBonuses contract 4 (M32b,
2026-11-22). It belongs in CAT (it reads `RollBonus` state that changes with CAT's versions); midi keeps this copy.
CPR's bonus files and CAT's `RollBonus` authoring API are unchanged by it.

## Contract versions

| Contract | Adds |
|---|---|
| 3 | `apply`, `iconHTML`, `description`, `when`, `spender`, `damageTypes`; a prompt provider's `ask(request) → ids` |
| 4 | `scaling`, `inputs`, `targeting`, `configure(selection, ctx)`; the selection on `apply` / `onChosen`'s context and in the formula's roll data (`@bonus.scaling`, `@bonus.inputs.<name>`); `rollConfig` on the query (dnd5e's `config`, `dialog`, `message`); optional preRoll bonuses asked before the roll; third-party approval (`approver`) on the request core; `ask` answering `{ id, selection }` |

A contributor written for contract 3 keeps working on 4: every new field is optional.

## Registration

Register on `ready` when midi offers the service at contract 4 or later, and stop CAT's own prompting when it does:

```js
Hooks.once("ready", () => {
  const service = globalThis.MidiQOL?.services?.list().find(s => s.id === "rollBonuses");
  if (!service || (service.contract ?? 0) < 4) return;      // older midi: CAT's own dialog
  MidiQOL.services.register("rollBonuses", "cat.optionalBonus", {
    kinds: ["attack", "damage", "save", "check", "skill", "tool"],
    async for(query) {
      const bonuses = await collectFor(query);              // CAT's collection for the query's event (below)
      return bonuses.map(bonus => toCandidate(bonus, query, bonuses)).filter(Boolean);
    }
  }, { label: "Coven's Automation Toolkit" });
  // and the early return in CAT's own prompting entry points (attackPreRoll, attack, damage, applyDamage, cleanup,
  // rollPreRoll, rollResult) while registered
});
```

`collectFor(query)` runs the collection CAT runs today: `collectBonuses(query.workflow, pass)` for a workflow's attack
(`optionalBonusAttack`) or damage (`optionalBonusDamage`), and the actor roll events for saves, checks, skills and tools
(`rollPreRoll` / `rollResult`'s event, with `query.actor`, `query.ability`, `query.skill`, `query.tool`). Those events
get the roll's dnd5e config from `query.rollConfig` (`config`, `dialog`, `message`), as CAT's actor patches get it
today. Read it; don't keep it (it is the live roll's).

## A RollBonus as a candidate

```js
function toCandidate(bonus, query, all) {
  if (!bonus.initialized) bonus.initialize(query.workflow);
  const isDamage = bonus instanceof DamageBonus;
  const spender = bonus.actor?.uuid && bonus.actor.uuid !== query.actor.uuid ? bonus.actor.uuid : undefined;
  const effectFor = () => bonus.roll.formula === "0" ? { kind: "rider" }
    // A damage add without its own critical rule is critical as the damage roll is; canCrit false: never
    : { kind: "add", formula: bonus.roll.formula, ...(bonus.canCrit === false ? { critical: "never" } : {}) };
  // midi's level n is CAT's scalingIncrease n - 1
  const configure = selection => {
    bonus.inputs = selection.inputs;
    if (selection.damageType) bonus.damageType = selection.damageType;
    if (isDamage) bonus.targets = selection.targets.map(uuid => fromUuidSync(uuid)).filter(Boolean);
    bonus.validateHints = [];
    bonus.updateScaling((selection.scaling ?? 1) - 1, query.workflow, all, query.workflow?.attackRoll?.total);
    const valid = bonus.validate(query.workflow, all, query.workflow?.attackRoll?.total);
    return {
      effect: effectFor(),
      cost: bonus.cost,
      label: `${bonus.name} (${bonus.roll.formula})`,
      ...(isDamage && bonus.maxTargets > 0 ? { maxTargets: bonus.maxTargets } : {}),
      ...(valid ? {} : { disabled: bonus.validateHints.map(h => h.label).join("; ") || "not valid now" })
    };
  };
  return {
    id: bonus.id,
    label: bonus.name,
    img: bonus.img,
    description: bonus.description,
    priority: bonus.priority,                       // both sort higher first (CAT: b.priority - a.priority)
    phases: [isDamage ? "postResult" : bonus.phase],
    when: "failure",                                 // CAT offers after-result bonuses on a failure only
    optional: bonus.optional,
    effect: effectFor(),
    damageTypes: isDamage && bonus.damageTypes?.size ? [...bonus.damageTypes] : undefined,  // several: a select in the row
    cost: bonus.cost,                               // checked against what this roll's earlier choices left
    spendsOwnCost: true,                            // bonus.use() consumes, as now
    spender,                                        // someone else's bonus: their resources
    ...(bonus.maxScaling > 1 ? { scaling: { max: bonus.maxScaling } } : {}),
    ...(bonus.extraInputs.length ? { inputs: bonus.extraInputs.flatMap(toInputs) } : {}),
    // CAT's targets are the damage's: the attack's hit targets
    ...(isDamage && bonus.maxTargets > 0 ? { targeting: { max: bonus.maxTargets, candidates: query.workflow?.hitTargets?.documents?.map(t => t.uuid) ?? [] } } : {}),
    configure,
    validate: ctx => bonus.validate(query.workflow, all, ctx.roll.total, { roll: ctx.roll, outcome: ctx.outcome }) || "not valid now",
    approve: bonus.isThirdParty && !bonus.autoApproveRequests
      ? async ctx => (await bonus.request(query.workflow, all, ctx.roll.total))?.result !== false : undefined,
    onChosen: ctx => {
      if (ctx.selection) configure(ctx.selection);
      bonus.roll = ctx.roll;
      return bonus.use(query.workflow, all);
    }
  };
}

/** CAT's dialogUtils subinputs ([type, fields, options]) as midi's inputs */
function toInputs([type, fields]) {
  const kind = { combobox: "select", comboboxMulti: "multi", radio: "select", checkbox: "checkbox", number: "number", text: "text", textarea: "text" }[type];
  if (!kind) return [];
  if (type === "radio") return [{ name: fields[0]?.options?.radioName ?? "radio", label: fields[0]?.label ?? "", type: "select",
    options: fields.map(f => ({ value: String(f.options?.value ?? f.name), label: game.i18n.localize(f.label) })) }];
  return fields.map(f => ({
    name: f.name, label: game.i18n.localize(f.label), type: kind,
    ...(f.options?.options ? { options: f.options.options.map(o => ({ value: String(o.value), label: game.i18n.localize(o.label) })) } : {}),
    ...(f.options?.value !== undefined ? { default: f.options.value } : {}),
    ...(f.options?.min !== undefined ? { min: f.options.min } : {}),
    ...(f.options?.max !== undefined ? { max: f.options.max } : {})
  }));
}
```

## What midi does with it

- **One session per roll.** The roll's phases share a budget; a bonus applied before the result isn't offered again
  after it; one the roller was offered and didn't take isn't asked again (a bonus new in a later phase is).
- **The row.** A bonus with `scaling`, `inputs`, several `damageTypes` or `targeting` gets a line of controls under its
  row; changing one ticks the row and calls `configure`, whose answer becomes the row's label, cost badges, how many
  creatures it may pick (`maxTargets`) and whether it can be taken (`disabled`). The ticked bonus is applied as
  configured; `ctx.selection` carries the choices to `apply` and `onChosen`.
- **Application order.** Chosen bonuses apply as replace, reroll, add, outcome, riders: a reroll doesn't drop an add.
- **Costs.** A candidate is offered only while its cost fits what the roll's earlier choices left. With `spendsOwnCost`
  midi doesn't spend it; `use()` does. A `spender`'s resources pay, not the roller's.
- **Third parties.** `approve` is awaited before the bonus is applied; false means it isn't applied and nothing is
  spent. (A candidate naming an `approver` actor instead is asked through midi's request core: the reaction timeout,
  shown to that player, and the GM's approve or decline from the player list.)
- **Damage.** An add with its own type or `critical: "never"` is its own damage roll; picked targets take it on their
  own damage only (midi's damageModifiers bonus stage), not the roll.
- **Before the roll.** An optional preRoll bonus is asked before the roll (with the roller's standing choices) and
  becomes part of the formula.
- **After the result.** `when: "failure"` keeps CAT's rule; `"success"` or `"any"` would offer a bonus after a hit too.
- **The prompt.** midi's phased prompt or classic dialog, or a provider that answers (`ask(request)` → ids, or
  `{ id, selection }`).

## Not covered yet

- Manual dice entry (`resolveManualRolls`): midi rolls the bonus dice.
- An optional preRoll bonus is asked in a plain list (no controls): its scaling and inputs take their defaults. Inside
  dnd5e's roll dialog, with controls, is M32c.
- The classic dialog shows no controls: a bonus taken there takes its defaults.

## The midi settings CAT needs (settingNeeds)

CAT's TroubleShooter keeps its own list of the midi settings it needs (`requiredSettings['midi-qol']` in
`handlers/troubleshooter.mjs`). With midi 15 it can declare them to midi's `settingNeeds` service instead; midi's
TroubleShooter lists each that isn't met, with CAT's reason and an Auto Fix:

```js
MidiQOL.services.register("settingNeeds", "cat.settings", {
  needs: () => Object.entries(TROUBLESHOOTER.requiredSettings["midi-qol"]).map(([setting, { expected, fix, label }]) =>
    ({ setting, expected, fix, label: label && game.i18n.localize(label), why: "Coven's Automation Toolkit needs this" }))
});
```

The keys are midi's as CAT writes them (`EnableWorkflow`, `ConfigSettings.autoCheckHit`); `expected` is a value or a
test, as in CAT's table. CAT's dnd5e, DAE and core entries stay in CAT's own TroubleShooter.

## What changes in CAT

| Change | Where | Size |
|---|---|---|
| Register `cat.optionalBonus` on `ready` when midi offers `rollBonuses` at contract 4 | new `integrations/midiRollBonuses.mjs` | ~15 lines |
| Early return in its own prompting entry points while registered | `mechanics/optionalBonus.mjs` | ~10 lines |
| `collectFor(query)`, `toCandidate(bonus, query, all)` and `toInputs` above | the adapter | ~120 lines |
| Its midi setting needs declared to `settingNeeds` (optional; its own check can stay) | the adapter | ~5 lines |
| When CAT's minimum midi is 15: its session, dialog and inputs code goes | `mechanics/optionalBonus.mjs`, `dialogUtils.mjs` | about −650 lines |

Behaviour CAT's author has to accept: midi rolls the bonus dice; a targeted damage bonus is a line on the target's
damage, not its own chat message; preRoll bonuses are in the formula (dnd5e doubles their dice on a critical); the
prompt has midi's time-out, undo entry and before/after note; a third party's request is CAT's own `request()` (its
dialog), not midi's approval dialog.
