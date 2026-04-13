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
- reads storage immediately
- deserializes payload
- understands `{ v, data }` versioned payloads
- can run `migrate()` when stored version differs
- can run `reconcile()` before applying

## Write behavior

- serializes snapshot back to storage on change
- optional `paths` limits persistence to selected paths
- optional `throttle` delays writes
- if nothing exists yet, it writes the initial snapshot immediately

## Implemented details

- functions and symbols are stripped by the default serializer
- `persistDispose` is attached non-enumerably to the target for cleanup
- storage access is wrapped through `safeStorage()`

## Design implication

Persistence is not coupled to a framework shell. Any state-like Granular target can become durable with one runtime call.

