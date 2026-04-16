# when.js

## Purpose

`when()` is Granular's conditional branch node.

Signature:

`when(source, renderTrue, renderFalse?)`

## Source modes implemented today

- plain truthy/falsy value
- signal
- state or state path
- function source

## Function source semantics

When `source` is a function, `WhenNode` runs it through `collectDependencies()`.

That means:

- reactive reads inside the function are collected
- subscriptions are attached to those discovered dependencies
- subscriptions are rewired when the function's dependency set changes

## Branch behavior

- if predicate is truthy, mount `renderTrue()`
- otherwise mount `renderFalse?.()`
- if the source changes but the predicate stays the same (truthy→truthy or falsy→falsy), nothing happens — no cleanup, no re-render
- branch swap only occurs when the predicate flips between truthy and falsy
- on swap, the previous branch is fully unmounted and the new branch is mounted

## Attribute behavior

`readValue()` is also used when `when()` appears inside props.

In that mode, only attribute-safe values are returned:

- `null` and `undefined`
- strings, numbers, booleans
- plain objects

Renderable values are intentionally discarded in attribute context.

## Design implication

`when()` is a structural gate, not a component rerender trigger.

