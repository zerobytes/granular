# reactive-source.js

## Purpose

`reactive-source.js` defines the polymorphic contract that lets the rest of the core treat `signal`, `state`, `state path`, and `observableArray` as a single "reactive source" without caring which concrete primitive is involved.

## Exports

- `isReactiveSource(value)`
- `readSourceValue(value)`
- `subscribeSource(value, fn)`

## Contract

A value is a reactive source if it answers true to one of the four type predicates imported from the primitives:

- `isSignal(value)` (from `signal.js`)
- `isState(value)` (from `state.js`)
- `isStatePath(value)` (from `state.js`)
- `isObservableArray(value)` (from `collections/observable-array.js`)

There is no marker symbol or factory; identity is established entirely by these per-primitive checks. New reactive primitives must add themselves to all three exported functions to participate.

## `readSourceValue(value)`

Routes the read to the matching primitive:

- `signal` → `readSignal(value)`
- `state` or `state path` → `readState(value)`
- `observableArray` → returns the array proxy itself (no snapshot)
- anything else → returned as-is

This is intentionally a snapshot read, not a subscription; it does not register dependencies with `tracker.js`.

## `subscribeSource(value, fn)`

Routes the subscription to the matching primitive and returns its unsubscribe function:

- `signal` → `subscribeSignal(value, fn)`
- `state` or `state path` → `subscribeState(value, fn)`
- `observableArray` → `value.subscribe(fn)`
- anything else → returns `null`

A `null` return is the contract's "not subscribable" signal; consumers (e.g. `helpers.derive`) check `typeof unsub === 'function'` before keeping a wire.

## Composition

Direct consumers in core today:

- `helpers.js` — `liftBinary`, `liftUnary`, `and`, `or`, `derive` all use the trio to decide whether to wrap an operand in a computed and to wire dep notifications inside `derive`.
- `dom/when.js` — uses all three to detect dynamic predicates, read their snapshots, and subscribe to discovered dependencies.
- `dom/match.js` — uses all three to walk the case sources, read current values for matching, and subscribe for re-evaluation.

## Design implication

The module is a thin adapter. It centralizes "which primitive is this?" so callers stop hard-coding the four `isX` checks and the three matching read/subscribe entry points.
