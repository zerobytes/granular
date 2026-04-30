# dirty-host.js

## Purpose

`DirtyHost` is an internal base class for instance-style hosts with instrumented properties and microtask-batched flushes.

## What it provides

- `before()` and `after()` event phases through `EventHub`
- `set(cb)` to batch multiple assignments into one flush
- `update()` to manually flush the dirty set (normally driven by the scheduler)
- property instrumentation with getter/setter wrapping
- dirty property accumulation
- flush scheduling through the central `scheduler` (not a local microtask), with an `AfterFlush.schedule()` tick after each flush
- `before('set')` handlers can return `false` to cancel the assignment
- per-property subscribers for bindings
- automatic observableArray wiring on bound properties

## Important observation

In the current codebase, `DirtyHost` is exported from its file but is not part of the public runtime and is not used by the main tag-function rendering path.

That makes it an internal or legacy-capable abstraction, not the center of Granular's function-based rendering model.

## Design implication

It is useful for object-style reactive hosts, but it should not be confused with the dominant runtime path used by `ElementNode`, `list`, `when`, and `match`.

