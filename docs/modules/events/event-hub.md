# event-hub.js

## Purpose

`EventHub` is the generic before/after event primitive used across the core.

## Features

- `on(phase, type, fn)`
- `emitBefore(type, payload, ctx)`
- `emitAfter(type, payload, ctx)`
- `phase('before' | 'after')`

## Phase semantics

- `before` handlers may cancel by returning `false`
- `after` handlers are observational only
- `after('*')` is supported through `any()`

## Fluent API

`phase()` returns a proxy, so these forms are equivalent:

- `hub.phase('after').on('message', fn)`
- `hub.phase('after').message(fn)`

## Design implication

This module is a unifying pattern in Granular. Write guards, lifecycle hooks, observable arrays, router events, and websocket events all reuse the same phase model.

