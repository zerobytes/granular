# renderer.js

## Purpose

`Renderer` is the normalization layer for "anything that can appear in UI".

## Static methods

- `Renderer.isRenderableLike(value)` - structural check for `mountInto`/`unmount`
- `Renderer.isDomNode(value)` - structural check for `nodeType`
- `Renderer.isRenderable(value)` - either `instanceof Renderable` or renderable-like
- `Renderer.toText(value)` - coerces to string for text nodes
- `Renderer.normalize(value)` - returns a flat `(Renderable|Node)[]`
- `Renderer.unmount(value)` - calls `.unmount()` when applicable

## toText rules

- `null`, `undefined`, `false` → `''`
- `true` → `'true'`
- string returned as-is, number/bigint via `String(value)`
- everything else falls through `String(value)` and returns `''` if that throws

## normalize rules

- `null`, `undefined`, `false` → `[]`
- arrays → recursive flat normalization
- renderables and DOM nodes → returned as a single-element array
- reactive sources (`signal`, `state`, `statePath`, `computed`):
  - if the unwrapped value is "complex" (renderable, DOM node, array, or another reactive) → `[ReactiveSlotNode]`
  - otherwise → `[ReactiveTextNode]`
- everything else → `[document.createTextNode(toText(value))]`

## Two internal reactive node types

### ReactiveTextNode

Used when a reactive source resolves to a text-like value.

Behavior:

- mounts a single text node
- subscribes to the source
- updates only `textContent`
- exposes `renderToString()` returning the current text (used by SSR)

### ReactiveSlotNode

Used when a reactive source resolves to renderables, DOM nodes, arrays, or nested reactive values.

Behavior:

- inserts an anchor comment via `createAnchor('slot')`
- on update: unmounts the previous renderables and removes their DOM nodes, then re-normalizes the current value through `Renderer.normalize` and re-mounts before the anchor
- tracks the produced DOM nodes by walking from a temporary marker to the anchor
- on `unmount`, cleans the previous batch and removes the anchor

## Important nuance

`Renderer.isRenderable()` accepts both `instanceof Renderable` and structural renderables with `mountInto` and `unmount`.

That is important for linked builds and SSR bundle boundaries.

## Design implication

This file is one of the clearest expressions of the Granular model: values are normalized directly into DOM behavior, without a virtual tree diff layer.
