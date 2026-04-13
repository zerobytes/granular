# observable-array.js

## Purpose

`observableArray()` wraps an array in a proxy that emits structured patches for collection changes.

## Public surface

- native-ish array indexing and length
- array mutators like `push`, `pop`, `splice`, `sort`, `reverse`
- `subscribe(fn)`
- `reset(nextArray)`
- `before()`
- `after()`

## Patch model

Supported patch types:

- `insert`
- `remove`
- `set`
- `reset`

Every patch also carries a `ctx` object with metadata such as previous length, next length, operation name, and original args.

## Important semantics

- `before()` runs before mutation and can cancel
- direct index assignment is patched into `set`, `insert`, or `reset` depending on position
- `length = n` emits `remove` or `reset` depending on direction
- `subscribe()` is low-level and receives patches directly
- `after()` is powered by `EventHub`

## Design implication

Granular treats list mutation as a first-class runtime event stream. The point is not "arrays but observable"; the point is "arrays with patch identity".

