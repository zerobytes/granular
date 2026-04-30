# helpers.js

## Purpose

`helpers.js` is the small library of reactive operators that wrap primitive comparisons, boolean composition, and on-demand derivation. Every helper accepts plain values or any reactive source recognized by `reactive-source.js`.

## Exports

Reactive operators (return a computed when any operand is reactive, otherwise a plain value):

- `equals(a, b)` — `===`
- `differs(a, b)` — `!==`
- `like(a, b)` — `==`
- `unlike(a, b)` — `!=`
- `bigger(a, b)` — `>`
- `smaller(a, b)` — `<`
- `atLeast(a, b)` — `>=`
- `atMost(a, b)` — `<=`
- `not(a)` — unary `!`
- `and(...sources)` — boolean AND with short-circuit on plain falsy operands
- `or(...sources)` — boolean OR with short-circuit on plain truthy operands
- `derive(fn)` — auto-tracking computed built on a signal

Short aliases (kept for back-compat, marked for removal in a future major):

- `eq` → `equals`
- `neq` → `differs`
- `gt` → `bigger`
- `gte` → `atLeast`
- `lt` → `smaller`
- `lte` → `atMost`

Not exported here: `set` lives in `observe.js`; `tpl` and `cls` live in `concat.js` and are documented in `concat.md`.

## Lifting model

`liftBinary(a, b, fn)` and `liftUnary(a, fn)` route through `isReactiveSource`:

- if no operand is reactive, `fn` runs immediately and the helper returns the plain result
- if exactly one operand is reactive, the helper returns `after(reactive).compute(v => fn(...))` and the non-reactive operand is captured by closure
- if both operands are reactive, the helper returns `after(a, b).compute(([av, bv]) => fn(av, bv))`

The compute closure always sees plain values; primitive coercion is never performed inside the helper.

## `and` / `or` semantics

- empty argument list: `and()` returns `true`, `or()` returns `false`
- a plain falsy operand collapses `and` to a constant `false`; a plain truthy operand collapses `or` to a constant `true` — both before any subscription is set up
- if all remaining operands are non-reactive, the result is `every(Boolean)` / `some(Boolean)`
- with one reactive operand the result is a single-source `compute` that combines the live value with the captured non-reactive operands
- with multiple reactive operands the result is a multi-source `compute` that walks the original argument order and pulls reactive values from the dependency tuple by position

`and` and `or` do not short-circuit subscriptions at runtime; all reactive operands are always subscribed. Short-circuiting only happens in the value computation.

## `derive(fn)`

Auto-tracking computed:

- throws `TypeError` if `fn` is not a function
- runs `fn` once under `collectDependencies` to seed the value and the initial dep set
- backs the result with a `signal` and wires `subscribeSource` for every reactive dep returned by the collector
- on any dep notification, re-runs `fn` under the collector, calls `setSignal` with the new value, and wires any newly discovered deps (existing wires are kept)
- exposes a non-enumerable `dispose()` via a `Proxy` over the signal that unsubscribes every wired dep and clears internal sets; `dispose` errors from individual unsubs are swallowed

The proxy trap only intercepts `dispose`; every other access falls through to the underlying signal proxy, so `derive(fn)` reads, subscribes, and coerces like a signal.

## Design implication

The helpers exist to keep boolean and comparison expressions out of hand-rolled `after(...).compute(...)` boilerplate while preserving the rule that a computed is only created when at least one operand is actually reactive.
