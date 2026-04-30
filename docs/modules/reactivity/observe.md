# observe.js

## Purpose

This module implements `after()`, `before()`, `set()`, and `subscribe()`. It is the bridge between reactive targets and explicit observation.

## Supported targets

- `signal`
- `state`
- `state path`
- `observableArray`

## after(...targets)

`after()` subscribes to committed changes.

`change(fn)`:

- for a single target, calls `fn(next, prev, ctx)`
- for multiple targets, calls `fn(nextList, prevList, ctxList)`

`effect(fn)`:

- same shape as `change`, but runs `fn` once synchronously with the current values before subscribing
- the initial call is wrapped in a try/catch that logs through `console.error`

For `observableArray`, `next` and `prev` are lazy functions returning snapshots, and `ctx.patch` contains the patch payload.

## before(...targets)

`before()` mirrors the same surface (`change`, `effect`, `compute`), but handlers run before commit.

Returning `false` cancels:

- signal writes
- state writes
- observableArray patches

## compute(fn, options)

`compute()` creates a read-only computed state backed by an internal signal.

Features already implemented:

- variadic dependencies
- `debounce`
- custom `hash` skip
- custom `equals` skip
- async compute (promise results respect `runId`)
- `keepAlive` / auto-dispose behavior driven by the inner signal's `onEmpty`/`onSubscribe`
- `onError(err)` for both sync and rejected-async errors; falls back to `console.error`
- `dispose()` on the computed value

## set(target, value)

Imperative writer that dispatches to the right primitive:

- `state` / `state path` → `setStateValue`
- `signal` → `setSignal`
- `observableArray` → `target.reset(value)` (throws if `reset` is missing)

## subscribe(target, selector, listener?, equalityFn?)

This is a selector-oriented convenience API:

- without listener, it returns a computed selected value
- with listener, it emits only when selected output changes by `equalityFn`

## Design implication

Granular's observation model is not hidden in component render. It is a direct runtime layer with cancellable writes and explicit derived values.

