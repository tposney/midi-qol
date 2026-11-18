# Steps, reactions and requests in midi-next (for module authors, 2026-11-19)

midi-next runs a use as a list of named steps. A module can add its own steps to a use, replace or wrap midi's, or
remove them; offer reactions without its own prompt; and ask a player something with a deadline midi keeps. This is
what M3 built. The examples run as written on the midi-next branch.

## Steps

midi's steps are named `midi-qol.<State>`: `midi-qol.AttackRollComplete`, `midi-qol.WaitForSaves`,
`midi-qol.AllRollsComplete`, `midi-qol.ApplyDynamicEffects`, `midi-qol.RollFinished`... `MidiQOL.flows.list()` gives
each flow's list; `MidiQOL.flows.preview(activity)` shows what a use of an activity would run.

### A step of your own

```js
MidiQOL.steps.register({
  id: "my-module.drain",
  name: "Drain",                 // its hooks and onUse passes: midi-qol.preDrain / postDrain, preDrain / postDrain
  writes: ["damageList"],        // its contract (optional): fields it promises to write
  run: async ({ workflow }) => {
    // … work with the workflow …
    // return nothing: the use goes on to where it was going
    // return a step id: the use goes there instead ("midi-qol.RollFinished")
  }
});
```

A step that has to wait (a dialog) can return `"midi-qol.Suspend"`; resuming the workflow runs it again.

### Changing every use (the global layer)

```js
// After a step; `when` limits it to the uses it is for
MidiQOL.steps.insert({ step: "my-module.drain", after: "midi-qol.AllRollsComplete", source: "my-module",
  when: workflow => workflow.item?.name === "Vampire Bite" });

// Instead of midi's step: return the step to go to (nothing: the step after the replaced one)
MidiQOL.steps.replace({ target: "midi-qol.ApplyDynamicEffects", step: "my-module.myEffects", source: "my-module" });

// Around midi's step: `next()` runs it and gives where it goes
MidiQOL.steps.register({ id: "my-module.timer", run: async ({ next }) => {
  const started = Date.now();
  const to = await next();
  console.log("saves took", Date.now() - started);
  return to;
} });
MidiQOL.steps.wrap({ target: "midi-qol.WaitForSaves", wrapper: "my-module.timer", source: "my-module" });

// Not at all: the use goes on to the step after it in its flow
MidiQOL.steps.remove({ target: "midi-qol.ConfirmRoll", source: "my-module" });

// Undo everything a source added
MidiQOL.steps.removeChanges("my-module");
```

An insert may also name a coarse step: `after: "midi-qol.damage"` runs after the last of the damage steps,
`before: "midi-qol.saves"` before the first save step (`MidiQOL.flows.coarseStepOf(id)`). Replace, wrap and remove need
a fine step.

### One use, an item, an activity

The same changes can be data:

```js
// One use: the call layer
await MidiQOL.completeActivityUse(activity, { midiOptions: {
  steps: [{ kind: "insert", step: "my-module.drain", after: "midi-qol.AllRollsComplete" }]
} });

// Every use of an item, or of one activity: stored on the document
await item.setFlag("midi-qol", "steps", [{ kind: "insert", step: "my-module.drain", after: "midi-qol.AllRollsComplete" }]);
await item.update({ [`system.activities.${activity.id}.midiSteps`]: [{ kind: "remove", target: "midi-qol.ConfirmRoll" }] });
```

Only the used activity and its item count (not the other activity, the ammunition, a cast activity's spell).

### Who wins

Narrowest wins: the call, then the activity, the item, then global changes; within one, the higher `priority`, then
the earlier. Inserts and wraps all run, broadest first. When two changes replace or remove the same step, the loser is
listed in midi's TroubleShooter, as is a replacement whose `writes` leaves out a field the replaced step writes.

### Reloads

A use's changes are worked out at its first step and stored on its chat card. A use rebuilt after a reload keeps them;
if a step it needs isn't registered on that client (your module isn't active there), it stops and says which step.
A use waiting in a step you inserted (it returned `"midi-qol.Suspend"`) is rebuilt waiting there: resuming runs that
step again, then the rest of the inserts, then the step the use was going to.

## Reactions

### Offering a reaction

midi asks a creature about its reactions when it is attacked, hit, missed, damaged, healed or makes a save. The
candidates come from the `reactions` service's contributors; midi's own (`midi-qol.items`) offers the creature's
reaction items whose reaction condition is met. Register yours and stop prompting yourself:

```js
Hooks.once("midi-qol.registerServices", services => {
  services.register("reactions", "my-module.parry", {
    for({ target, actor, trigger, workflow }) {
      // target: the reacting token (a TokenDocument); trigger: isHit, isMissed, isAttacked, isDamaged, isSaveFail...
      if (trigger !== "isHit") return [];
      const parry = actor.items.getName("Parry")?.system.activities.contents[0];
      return parry ? [{
        activityUuid: parry.uuid,
        // optional: not offered when it couldn't change the result
        wouldChange: () => workflow.attackTotal < actor.system.attributes.ac.value + 3
      }] : [];
    }
  }, { label: "My Module: Parry" });
});
```

midi puts every contributor's candidates in one prompt to the creature's player (or the GM), with the reaction timeout.

### Changing how a reaction is asked

Each trigger is a step: `midi-qol.reaction.attacked`, `.hit`, `.missed`, `.damaged`, `.healed`, `.save`,
`.saveSuccess`, `.saveFail`, `.preAttack`. Insert around, replace, wrap or remove them like any step. midi's own fire no
hooks; steps you insert there do. A replacement returns the reaction result (`{ name, uuid, ac }`, or `{}` for none);
`ctx.reaction` says who reacts to what:

```js
MidiQOL.steps.register({ id: "my-module.noReactionsForMinions", run: async ({ reaction, next }) =>
  reaction.target.actor?.flags["my-module"]?.minion ? {} : next() });
MidiQOL.steps.wrap({ target: "midi-qol.reaction.hit", wrapper: "my-module.noReactionsForMinions", source: "my-module" });
```

## Asking a player (the request core)

midi asks reactions and players' saves through Foundry's `User#query`. The asking client keeps the deadline and decides
when it passes; the player's dialog shows it and can pause it; the first answer wins (the player, a GM from the player
list, the time-out, a disconnect). A module can use the same core:

```js
// On every client: what the asked client does
MidiQOL.requests.registerHandler("my-module.pick", async (data, request) => {
  const countdown = request.countdown();          // the requester's deadline, to show (attach to your dialog)
  const choice = await myDialog(data, countdown);  // close it if request.onSettled(...) fires first
  if (!await request.claim()) return undefined;   // answered for them already: drop it
  return choice;
});

// The asking client
const { value, how } = await MidiQOL.requests.ask(user, {
  type: "my-module.pick", data: { options: ["a", "b"] }, kind: "pick", label: "Pick one",
  timeoutMs: 30_000, fallback: () => "a",
  gmChoices: { none: () => "a" }                   // optional: the GM can answer from the player list
}).settled;
```

Hooks: `midi-qol.requestStarted(request)`, `midi-qol.requestSettled(request, how)`.

## Still socketlib

`MidiQOL.socket()` and its handler names stay for modules that call them (`chooseReactions` among them). midi asks
reactions, and a connected player's save through their roll dialog, with Foundry queries; when a GM answers from the
player list, or the save is made without the player, that roll is still run on the GM's client through socketlib.
Chat-card saves, Monk's TokenBar, Flash Rolls, Epic Rolls and midi's other GM actions keep their socketlib routes for
now.

## Ports

`workflow.ports` (`askReactions`, `requestSaves`, `applyDamageCard`; `workflow.setPort` for one use) are the lower-level
hooks M2 added for waits. Prefer the reaction steps and the `reactions` service above: the ports may go once a
`saveRequests` service exists.
