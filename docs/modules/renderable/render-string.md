# render-string.js

## Purpose

This module provides server rendering and client mount helpers:

- `renderToString(value)`
- `hydrate(target, value)`

## renderToString

`renderToString()` recursively renders:

- `null`, `undefined`, `false` as `''`
- arrays joined element-by-element
- signals via `readSignal`
- states, state paths, and computed via `readState`
- `Renderable` instances with a `renderToString(render)` method, called with the recursive renderer
- `ElementNode` via its own `renderToString(render)`
- renderable-like objects exposing `renderToString`
- DOM nodes via `outerHTML` (or `''` if absent)
- everything else through `Renderer.toText` then `escapeHtml`

The recursive renderer is exposed to children with `render.escape = escapeHtml` so custom renderables can escape their own attribute values.

`escapeHtml` replaces `&`, `<`, `>`, `"`, and `'`.

## hydrate

In the current implementation, `hydrate()` is not DOM-reuse hydration.

It does this:

- resolves the target (selector string or element); throws `hydrate(target): target not found` when missing
- clears its `textContent`
- normalizes the provided value through `Renderer.normalize`
- mounts fresh renderables or appends DOM nodes

## Why that matters

Granular currently treats "mount fast and directly" as more important than a complex hydration reconciliation protocol.

That makes `hydrate()` closer to "attach client runtime after SSR output exists" than to React-style hydration.
