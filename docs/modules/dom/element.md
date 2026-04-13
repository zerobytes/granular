# element.js

## Purpose

`ElementNode` is the core DOM renderable. It is where props, children, reactivity, formatting, SSR output, and dynamic anchors all come together.

## Big responsibilities

- create real DOM elements
- attempt a fast template-compile path for static-ish trees
- bind dynamic props directly to DOM
- mount child content of many kinds
- render server HTML

## Fast path

`#tryCompileTemplate()` builds an HTML string when the element and its subtree are simple enough:

- no dynamic style objects
- no event handlers
- no `format`
- no dynamic props
- no complex children beyond plain text, numbers, nested static `ElementNode`, and basic reactive placeholders

When that succeeds, mount uses a cached `<template>` clone and then binds only the dynamic leftovers.

## Prop binding model

Reactive props are handled directly, not by rerendering a parent:

- `signal`
- `state`
- `state path`
- `when(...)`

Special handling exists for:

- `value`
- `checked`
- `style`
- `textContent`
- `innerHTML`
- `className`
- event props
- `node`

## Input formatting

For `input` elements with `format`, the file keeps a distinction between:

- visual value shown in the DOM
- raw/state value written back to the source

## Child mounting model

Children can be:

- primitives
- arrays
- renderables
- DOM nodes
- signals
- states
- observable arrays
- mapped arrays produced by reactive `.map()`

Reactive children mount through anchors and update only their own slot.

## Dynamic list behavior inside children

If a child resolves to an `observableArray`, `ElementNode` mounts each item and applies patches incrementally inside that child region.

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

