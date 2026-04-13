# after-flush.js

## Purpose

`AfterFlush` is a microtask scheduler for "run after dirty flush" callbacks.

## API

- `schedule()` queues a single microtask flush
- `add(run)` registers a watcher and returns an unsubscribe

## Current status

This module is currently only consumed by `DirtyHost`.

## Design implication

It is a small internal scheduling primitive, not the global scheduler for the whole function-based Granular runtime.

