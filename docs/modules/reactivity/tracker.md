# tracker.js

## Purpose

This module is the tiny dependency collector used when a callback should discover reactive sources by reading them.

## API

- `collectDependencies(fn)` runs `fn` under an active collector and returns `{ value, deps }`
- `trackDependency(key, value)` registers a dependency when a read happens during collection

## Current use

The main consumer in the core today is `when(() => ...)`.

## Important constraint

Tracking only works for reads that explicitly call `trackDependency()` in their implementation. In practice that means signal/state reads and coercions wired by the core.

## Design implication

This is not a global effect system. It is a small scoped collector used where Granular intentionally allows discovered dependencies.

