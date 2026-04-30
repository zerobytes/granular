# element.js

## Purpose

`ElementNode` is the core DOM renderable. It is where props, children, reactivity, formatting, SSR output, and dynamic anchors all come together.

## Big responsibilities

- create real DOM elements
- attempt a fast template-compile path for static-ish trees
- bind dynamic props directly to DOM
- mount child content of many kinds
- render server HTML

## Exports

- `ElementNode` — the renderable class
- `setTemplateCacheSize(max)` — adjust the LRU cap used by the template fast path (default `512`)

## Reserved props

The following keys are recognized but never serialized as attributes:

- `children`, `content` — alternative way to pass child content (`content` is used only when `children` is empty)
- `format` — input formatting config consumed by the value pipeline
- `node` — receives the created element when bound to a `state` or `state path` via `.set(el)`

## Void elements

`tagName`s in the void set (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`) drop any provided children at construction time.

## Fast path

`#tryCompileTemplate()` builds an HTML string and mounts it through a cached `<template>` clone when the element and its subtree are simple enough. The template cache is LRU and bounded by `setTemplateCacheSize`.

It bails out (and falls back to per-node creation) if any of these are present anywhere in the subtree:

- `textContent`, `innerHTML`, or `format` on the element
- a child that is not a primitive, an `ElementNode`, a `signal`, a `state`, or a `state path`

`style`, event handlers, reactive props, and the reactive child placeholders are skipped during HTML serialization and bound after cloning by `#applyDynamicProps` / `#bindTemplateChildren`.

## Prop binding model

Reactive props are handled directly, not by rerendering a parent:

- `signal`
- `state`
- `state path`
- `computed`
- `when(...)`

Special handling exists for:

- `value` and `checked` — two-way bound when the source is writable; on input/change the source is updated via `source.set(next)` and reverted (DOM re-synced) if `set` returns `false`. `computed` sources stay read-only.
- `style` — string sets `cssText`; object assigns each key, with per-key `signal` / `state` / function values tracked through their own subscriptions and torn down on unmount or style replacement
- `textContent`, `innerHTML` — set as element properties
- `className` / `class` — written to `el.className`; `htmlFor` is mapped to the `for` attribute
- event props — keys starting with `on` and a function value attach via `addEventListener` using the lowercased remainder; listeners are removed on unmount
- `node` — when bound to a `state` or `state path`, the underlying writer receives the created element on mount

Plain attribute writes go through `#setProp`: `true` sets the attribute (and the matching property if it exists); `false` / `null` removes the attribute. The same path mirrors values into the DOM property when the key exists on the element.

## Input formatting

For `input` elements with `format`, the file keeps a distinction between:

- visual value shown in the DOM
- raw/state value written back to the source

`format` is resolved through `normalizeInputFormat` (and re-resolved if it is itself a reactive source). On `input` / `change` (capture phase) the formatter runs, the DOM `value` is replaced with `visual`, the formatter's `raw` is exposed as `event.target.rawValue`, and the writable source receives the `state`-mode value. If `value` is not bound at all but `format` is set, an internal listener still keeps the visible text formatted. `onInput` / `onChange` callbacks are invoked as `(event, rawValue)`.

## Child mounting model

Children can be:

- primitives (string, number)
- `null` / `false` (skipped)
- arrays (flattened)
- renderables
- DOM nodes
- signals
- states / state paths
- observable arrays
- mapped arrays produced by reactive `.map()` (resolved through their meta)

Reactive children mount through a `createAnchor` comment and update only their own slot. A scalar reactive child first lives as a text node; if it later resolves to a complex value, the text node is replaced with an anchor and re-rendered as a dynamic region.

## Dynamic list behavior inside children

If a child resolves to an `observableArray`, `ElementNode` mounts each item and applies patches incrementally inside that child region. Supported patch types are `reset`, `insert`, `remove`, and `set`; each updates only the affected slice rather than rebuilding the region.

## SSR semantics

`renderToString()` resolves:

- reactive props
- computed values
- `when(...)`
- formatted inputs
- child render trees

The SSR path mirrors the mount path conceptually, but produces strings instead of DOM nodes.

## Design implication

This file is the practical center of Granular. It expresses the framework's main bet: build once, then bind the exact DOM edges that should stay alive.

