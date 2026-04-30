# state.js

## Purpose

`state()` is Granular's main application state primitive. It keeps the ergonomics of path access while preserving explicit write control.

## Internal model

`state()` is built on top of a root `signal()`. The file adds:

- path proxies
- path-aware reads and writes
- path subscription routing through a trie
- setter proxies such as `s.set().user.name = 'x'`
- optimistic mutation with rollback
- optional default fallback resolution

## Read semantics

A state path is itself a state-like object.

Examples of what the proxy exposes:

- `user.name.get()`
- `user.name.set('Ana')`
- `user.set('name', 'Ana')`
- `user.set().name = 'Ana'`
- `user.patch({ name: 'Ana' })`
- `user.subscribe(fn)` / `user.before(fn)`
- `user.mutate(optimistic, mutation, options?)` for optimistic updates with rollback

Reads are path-relative. A nested proxy resolves from its own path, not from the root. The `get`, `set`, `patch`, `subscribe`, `before`, and `mutate` proxy properties are shadowed when the underlying value owns a property of the same name.

## Write semantics

- direct mutation is forbidden: `s.user = ...` throws
- writes clone only the branch being changed through `setAtPath`
- subscribers for unrelated paths do not fire
- path subscribers only receive commits where resolved `next !== prev`

## Array ergonomics

Setter proxies expose array mutators such as:

- `push`, `pop`, `shift`, `unshift`
- `splice`, `sort`, `reverse`, `fill`, `copyWithin`

These mutators produce a new array snapshot and then commit through the same path-aware state machinery. They mirror the native return values where it makes sense (e.g. `push` returns the new length, `pop`/`shift` return the removed element, `splice` returns the removed slice).

## Numeric ergonomics

Setter proxies also expose `increment()` and `decrement()` for numeric paths. They coerce the current value through `Number` and commit the new value through the path-aware setter.

## Advanced pieces

- `createStateFromAdapter(adapter)` lets other modules expose a state-like object without using a normal root state
- `mutateAdapter()` implements optimistic update plus rollback (also reachable as `state.mutate(...)`)
- `withDefaults(target, defaults, options?)` overlays fallback values; the `when` option accepts a predicate, the string `'nullish'`, or defaults to "value is undefined"
- `setPathCacheSize(max)` tunes the per-adapter LRU that caches tracked path proxies (default 256)

## Lower-level exports

The file also exports helpers used by the rest of the runtime: `isState`, `isStatePath`, `isComputed`, `readState`, `readStateFromRoot`, `subscribeState`, `readStateMeta`, `subscribeStateMeta`, `setStateValue`, `getMappedMeta`.

## Design implication

`state` is not a mutable proxy store in the Vue sense and not an immutable reducer store in the Redux sense. It is a path-addressable reactive façade over explicit immutable commits.

