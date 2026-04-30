# event-hub.js

## Purpose

`EventHub` is the generic before/after event primitive used across the core.

## Public surface

- `on(phase, type, fn)` - returns an unsubscribe function
- `emitBefore(type, payload, ctx)` - returns `boolean`
- `emitAfter(type, payload, ctx)` - returns `void`
- `phase('before' | 'after')` - returns a fluent proxy

## Phase semantics

- `before` handlers may cancel by returning `false`; emission short-circuits on the first cancel and the function returns `false`
- `after` handlers are observational only
- wildcard `'*'` is only honored on the `after` side via the dedicated `#afterAny` set; registering `'*'` on `before` falls into the regular type map and is never matched
- `emitAfter` always invokes per-type handlers and then every `#afterAny` handler

## Fluent API

`phase()` returns a proxy with an explicit `on(type, fn)` and `any(fn)` plus a get-trap that converts any other property name into `(fn) => hub.on(phase, prop, fn)`. So these forms are equivalent:

- `hub.phase('after').on('message', fn)`
- `hub.phase('after').message(fn)`

## Design implication

This module is a unifying pattern in Granular. Write guards, lifecycle hooks, observable arrays, router events, and websocket events all reuse the same phase model.
