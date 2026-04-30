# list.js

## Purpose

`list(items, renderItem, options?)` is the core live collection renderer.

## Accepted sources

- plain arrays
- `observableArray`
- `signal`
- `state`
- `state path`

## Options

- `key(item, index)` — when provided, switches to keyed reconciliation; identity-based reuse across resets

## Render contract

`renderItem(itemState, indexSignal)`

The callback receives reactive wrappers, not raw immutable snapshots.

## Item model

- for `observableArray`, each item gets its own `state(item)`
- for unkeyed state-backed arrays, the item state is the parent's positional sub-state (e.g. `items["3"]`) so writes flow through the parent path
- when `key` is set, every item gets an independent `state(item)` regardless of source kind, because key identity is content-based and would otherwise alias positional paths
- index is always a `signal(index)` and is updated in place when items shift

## Patch behavior

For `observableArray`:

- `insert` mounts only inserted items; multi-item inserts use a `DocumentFragment`
- `remove` unmounts only removed items
- `set` calls `state.set(value)` on the existing row state, falling back to remove+insert if no state is attached
- `reset` runs the keyed reconciler when `key` is set; otherwise, if the new length matches, only the per-row `state.set(...)` is called (skipped for state-backed sources to avoid recursing through the parent state's subscriber); otherwise the list is cleared and re-mounted

After every `insert` / `remove`, trailing index signals are bumped so each row's `indexSignal` stays in sync.

For `signal` and plain array replacement sources, the list resets on source change.

For state-backed sources, the change subscription is debounced via `queueMicrotask` and routed through `#reset` with the new array. Path-level edits to individual rows still flow through the per-row sub-state directly.

## Keyed reconciliation

With `key`:

- existing rows are indexed by their previous key
- rows reused under a new index are kept; their `state.set(item)` syncs the latest value
- removed keys are unmounted
- a longest-increasing-subsequence pass on old indexes minimizes DOM moves; only rows outside the LIS are re-inserted
- new keys are created and inserted at their target position

## Sync-back behavior

When the source is `observableArray`, item state changes are mirrored back into the underlying array through `after(ref.state).change(...)`, guarded so a row only writes back to its own current index.

## Design implication

`list()` is not sugar for `.map()`. It is the runtime primitive that keeps collection identity and per-item bindings alive.

