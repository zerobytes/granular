# list.js

## Purpose

`list()` is the core live collection renderer.

## Accepted sources

- plain arrays
- `observableArray`
- `signal`
- `state`
- `state path`

## Render contract

`renderItem(itemState, indexSignal)`

The callback receives reactive wrappers, not raw immutable snapshots.

## Item model

- for `observableArray`, each item gets its own `state(item)`
- for state-backed arrays, the item state is the state path itself, such as `items["3"]`
- index is always a `signal(index)`

## Patch behavior

For `observableArray`:

- `insert` mounts only inserted items
- `remove` unmounts only removed items
- `set` updates the existing item state
- `reset` rebuilds the whole list

For `signal` and plain array replacement sources, the list resets on source change.

For state-backed arrays, this file only watches length changes directly. Item content updates are expected to flow through the item path states already handed to `renderItem`.

## Sync-back behavior

When the source is `observableArray`, item state changes are mirrored back into the underlying array through `after(ref.state).change(...)`.

## Design implication

`list()` is not sugar for `.map()`. It is the runtime primitive that keeps collection identity and per-item bindings alive.

