# render-string.js

## Purpose

This module provides server rendering and client mount helpers:

- `renderToString(value)`
- `hydrate(target, value)`

## renderToString

`renderToString()` recursively renders:

- arrays
- signals
- states and computed values
- `Renderable` instances
- `ElementNode`
- renderable-like objects exposing `renderToString`
- DOM nodes via `outerHTML`

Primitives are escaped through `escapeHtml()`.

## hydrate

In the current implementation, `hydrate()` is not DOM-reuse hydration.

It does this:

- resolves the target
- clears its content
- normalizes the provided value
- mounts fresh renderables or nodes

## Why that matters

Granular currently treats "mount fast and directly" as more important than a complex hydration reconciliation protocol.

That makes `hydrate()` closer to "attach client runtime after SSR output exists" than to React-style hydration.

