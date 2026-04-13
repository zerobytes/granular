# renderable.js

## Purpose

`Renderable` is the minimal mount contract in the core.

## Required methods

- `mountInto(parent, beforeNode)`
- `unmount()`

## Role in the architecture

Granular does not require all UI to be components. It requires mountable values. `Renderable` is the explicit protocol for those values.

## Design implication

This keeps the runtime centered on mount semantics, not on component rerender semantics.

