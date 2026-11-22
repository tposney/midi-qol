# @midi-qol/types

TypeScript types for midi-qol's public contract: the services (providers, contributors and their queries), the step
engine (step context, changes, flows), entries (events, actions, offers), cues, outcomes, the request core and the
player waits. The names other modules may rely on are listed in midi-qol's `docs/surface.json`; their shapes are
versioned by `MIDI_API_VERSION`.

```ts
import type { FlankingProvider, StepContext, Entry } from "@midi-qol/types";

const flanking: FlankingProvider = { flanking: ({ attacker, target }) => undefined };
```

Requires `fvtt-types` (a peer dependency): the declarations name Foundry's and dnd5e's types as fvtt-types does.

Built from midi-qol's source with `npm run types` (in midi-qol's repository). Version = midi-qol's version.
