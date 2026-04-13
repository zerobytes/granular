# renderer.js

## Purpose

`Renderer` is the normalization layer for "anything that can appear in UI".

## Main responsibilities

- identify DOM nodes
- identify renderables, including renderable-like objects
- turn primitives into text nodes
- turn reactive primitives into live text or live slot nodes
- flatten arrays
- unmount renderables when needed

## Two internal reactive node types

### ReactiveTextNode

Used when a reactive source resolves to a text-like value.

Behavior:

- mounts a single text node
- subscribes to the source
- updates only `textContent`

### ReactiveSlotNode

Used when a reactive source resolves to:

- renderables
- DOM nodes
- arrays
- nested reactive values

Behavior:

- keeps an anchor comment
- fully re-normalizes the current resolved value
- unmounts only the previously mounted values inside that slot

## Important nuance

`Renderer.isRenderable()` accepts both `instanceof Renderable` and structural renderables with `mountInto` and `unmount`.

That is important for linked builds and SSR bundle boundaries.

## Design implication

This file is one of the clearest expressions of the Granular model: values are normalized directly into DOM behavior, without a virtual tree diff layer.

