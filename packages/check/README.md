# @midi-qol/check

Checks a Foundry module against the names midi-qol publishes (`docs/surface.json`): `MidiQOL.<export>`, `midi-qol.*`
hooks, midi settings, services, and the events its entries name. Names only: run your own tests for behaviour.

```sh
npx midi-qol-check src            # exit 1 and a list when something isn't published
npx midi-qol-check src --allow myOwnEvent,MidiQOL.someExport
```

In CI (GitHub Actions):

```yaml
- run: npx --yes @midi-qol/check src
```

The package carries the surface of the midi-qol version it is numbered for; use the version your module supports.
Built with `npm run check:package` in midi-qol's repository.
