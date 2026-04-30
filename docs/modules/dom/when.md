# when.js

## Purpose

`when()` is Granular's conditional branch node.

Signature:

`when(source, renderTrue, renderFalse?)`

`renderTrue` is required and must be a function; `renderFalse` is optional and must also be a function when provided. Both throw on construction otherwise.

## Exports

- `when(source, renderTrue, renderFalse?)` — factory
- `isWhen(value)` — brand check used by `ElementNode` to recognize `when()` in props
- `readWhenValue(value)` / `subscribeWhenValue(value, fn)` — adapters used by the prop pipeline to bind `when()` as an attribute source

## Source modes implemented today

- plain truthy/falsy value (no subscriptions; predicate is fixed)
- any reactive source (`signal`, `state`, `state path`, `computed`) — subscribed to directly
- function source — re-evaluated under dependency tracking

## Function source semantics

When `source` is a function, `WhenNode` runs it through `collectDependencies()`.

That means:

- reactive reads inside the function are collected
- subscriptions are attached to those discovered dependencies
- subscriptions are rewired on every change so the dep set can grow or shrink between evaluations
- if the function returns a reactive source, that source is also added to the dep set and read for the predicate

## Branch behavior

- if predicate is truthy, mount `renderTrue()`
- otherwise mount `renderFalse?.()`
- if the source changes but the predicate stays the same (truthy→truthy or falsy→falsy), nothing happens — no cleanup, no re-render
- branch swap only occurs when the predicate flips between truthy and falsy
- on swap, the previous branch is fully unmounted and the new branch is mounted
- re-entrant changes during an in-flight update are coalesced via a `#pendingRecheck` flag and replayed once the current update finishes

## Attribute behavior

`readValue()` and `subscribeValue()` are also used when `when()` appears inside props.

In that mode, only attribute-safe values are returned:

- `null` and `undefined`
- strings, numbers, booleans
- plain objects

Renderable values and arrays are intentionally discarded in attribute context (`undefined` is returned instead).

## Design implication

`when()` is a structural gate, not a component rerender trigger.

