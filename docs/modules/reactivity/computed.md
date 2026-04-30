# computed.js

## Purpose

`computed(input)` is an adapter helper. It turns values into read-only computed-like outputs without forcing the caller to manually write `after(...).compute(...)` every time.

## Behavior

- if input is already a computed state, it is returned as-is
- if input is a signal/state/state-path holding a non-function value, it becomes `after(input).compute(next => next)`
- if input is a signal/state/state-path holding a function, a wrapper is returned that re-reads the latest function and forwards arguments on each call
- if input is itself a function, it is returned as-is
- if input is a plain object, each property is lazily converted by the same rules and cached on a proxy
- if input is a plain scalar (or `null`/`undefined`), it is wrapped through a fresh `state(value)` and exposed as a computed

## Important nuance

This file is not the main derivation engine. `observe.js` is. `computed.js` is a normalization layer that makes mixed inputs easier to consume.

## Design implication

`computed()` in Granular is closer to "make this look like a computed source" than to "declare a full formula language".

