# signal.js

## Purpose

`signal()` is the smallest reactive primitive in Granular. It is a single observable value with synchronous reads, writes, subscriptions, and write guards.

## Core contract

- `signal(initial, options?)` creates the cell; options are `onSubscribe()` and `onEmpty()` lifecycle hooks fired when the subscriber set transitions
- `get()` reads the current value
- `set(next, force?)` writes
- `patch(next)` merges plain-object payloads into a cloned snapshot
- `subscribe(fn)` listens to committed changes
- `before(fn)` guards writes synchronously

## Important semantics

- `before()` runs before commit and can cancel by returning `false`
- `set()` skips notification on strict equality unless `force` is true, and returns `false` when a `before` hook cancels
- `patch()` returns `false` when nothing changed, and falls back to `set(next, true)` for non-plain-object inputs
- object patching is structural and shallow-recursive for nested plain objects
- arrays are not merged by `patch`; they become full replacements

## Module exports

Beyond `signal()`, the file exports thin helpers that take a signal proxy:

- `isSignal(v)`
- `readSignal(s)` / `setSignal(s, next, force?)` / `patchSignal(s, next)`
- `subscribeSignal(s, fn)`
- `getMappedArrayMeta(value)` returns the `{ signal, mapFn }` metadata stamped on the array produced by a signal-array `.map()`

## Proxy behavior

The returned value is a proxy over the API object.

That proxy:

- tracks reads for dependency collection
- exposes primitive coercion (`toString`, `valueOf`, `Symbol.toPrimitive`)
- forwards object property access to the current value
- adds special metadata when `.map()` is called on an array value

## Design implication

`signal` is not a component state hook. It is a tiny reactive cell that can participate directly in DOM bindings, computed chains, and attribute updates.

