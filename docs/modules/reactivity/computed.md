# computed.js

## Purpose

`computed(input)` is an adapter helper. It turns values into read-only computed-like outputs without forcing the caller to manually write `after(...).compute(...)` every time.

## Behavior

- if input is already a computed state, it is returned as-is
- if input is a signal/state/state-path holding a non-function value, it becomes `after(input).compute(next => next)`
- if input is a signal/state/state-path holding a function, the function is re-read on each call
- if input is a plain object, each property is lazily converted and cached
- if input is a plain scalar, it is wrapped through a tiny state and mirrored as computed

## Important nuance

This file is not the main derivation engine. `observe.js` is. `computed.js` is a normalization layer that makes mixed inputs easier to consume.

## Design implication

`computed()` in Granular is closer to "make this look like a computed source" than to "declare a full formula language".

