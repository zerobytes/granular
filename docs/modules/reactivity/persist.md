# persist.js

## Purpose

`persist()` binds a reactive target to storage. It is implemented as a runtime adapter, not as middleware hidden behind an app framework.

## Supported targets

- `state`
- `state path`
- `observableArray`
- store-like objects with `getState`, `setState`, `subscribe`

## Startup behavior

- requires `options.key`
- defaults `options.storage` to `localStorage` when available, and validates it through `safeStorage()`; throws if no usable storage exists
- reads storage immediately
- deserializes payload through `options.deserialize` (default `JSON.parse`)
- understands `{ v, data }` versioned payloads, where `v` defaults to `options.version` (defaults to `1`)
- can run `migrate(data, storedVersion)` when stored version differs
- can run `reconcile(data)` before applying

## Write behavior

- serializes the snapshot back through `options.serialize` (default strips functions and symbols via `JSON.stringify`)
- writes payloads as `{ v: version, data: snapshot }`
- optional `paths` limits persistence to selected dot-paths (cloned out of the full snapshot)
- optional `throttle` (ms) coalesces writes through a single timer; without it, writes happen synchronously
- if nothing exists in storage yet, an initial snapshot is written immediately

## Implemented details

- functions and symbols are stripped by the default serializer
- `persistDispose` is attached non-enumerably to the target for cleanup
- storage access is wrapped through `safeStorage()`

## Design implication

Persistence is not coupled to a framework shell. Any state-like Granular target can become durable with one runtime call.

