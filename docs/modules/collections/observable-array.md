# observable-array.js

## Purpose

`observableArray()` wraps an array in a proxy that emits structured patches for collection changes.

## Exports

- `observableArray(initial = [])` - factory
- `isObservableArray(value)` - WeakMap-backed identity check; used by `list` to switch into patch mode

## Public surface

- native-ish array indexing and `length`
- patched mutators: `push`, `pop`, `unshift`, `shift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`
- `subscribe(fn)` - low-level subscription receiving `(patch, ctx)`
- `reset(nextArray)` - replaces contents in one `reset` patch
- `before()` / `after()` - return phase APIs from the internal `EventHub`

## Patch model

Patch shapes:

- `{ type: 'insert', index, items }`
- `{ type: 'remove', index, count, items }`
- `{ type: 'set', index, value, prev }`
- `{ type: 'reset', items, prevItems }`

Every emission also carries a `ctx` of `{ array, op, args, prevLength, nextLength }` where `op` is the source operation name (`push`, `splice`, `set`, `length`, etc.).

## Important semantics

- `before()` runs before mutation and may cancel by returning `false`; `splice` runs `before('remove')` and `before('insert')` separately and aborts the whole call when either cancels
- `after()` is powered by `EventHub`; `subscribe()` receives the same patch but is invoked first
- direct index assignment maps to `set` (in-bounds), `insert` (one past the end), or `reset` (sparse out-of-bounds)
- `length = n` emits `remove` when shrinking and `reset` when growing
- `sort`, `reverse`, `fill`, `copyWithin` all surface as `reset` patches with `prevItems`
- read access tracks the array as a reactive dependency through `trackDependency`, so `computed`/`after` over the proxy stays live
- non-mutator native methods are returned bound to the underlying array

## Integration with `list`

`list(items, renderItem)` checks `isObservableArray(items)` and applies patches in place:

- `insert` mounts new item renderables at `index`
- `remove` unmounts `count` renderables starting at `index`
- `set` replaces the renderable at `index`
- `reset` re-renders the whole list

## Design implication

Granular treats list mutation as a first-class runtime event stream. The point is not "arrays but observable"; the point is "arrays with patch identity".
